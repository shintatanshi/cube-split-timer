import type {
  SolverOverviewFaceResult,
  SolverWorkerRequest,
  SolverWorkerResponse,
} from "../analyzer/solverWorker";
import type { CubeColorName, CubeFaceName } from "./cubeVisuals";
import {
  DEFAULT_FACE_COLOR_MAP,
  getDefaultColorJapanese,
  getFaceForCubeColor,
  normalizeCubeColorName,
} from "./defaultFaceColors";

export type InsightTimerState =
  | "idle"
  | "pendingStart"
  | "holding"
  | "ready"
  | "inspecting"
  | "running"
  | "finished";

export interface FormatSolveInsightOptions {
  targetColor?: CubeColorName | string | null;
  faceColorMap?: Record<CubeFaceName, CubeColorName>;
}

export interface SolveInsightSummary {
  targetFace: CubeFaceName;
  targetColor: CubeColorName;
  targetColorJapanese: string;
  crossLength: number;
  crossTruncated: boolean;
  xcrossLength: number;
  xcrossTruncated: boolean;
  bestCrossFace: CubeFaceName;
  bestCrossColor: CubeColorName;
  bestCrossColorJapanese: string;
  bestCrossLength: number;
  bestCrossTruncated: boolean;
  isTargetBest: boolean;
}

export interface RequestOverviewOptions {
  workerFactory?: () => Worker;
}

interface PendingOverviewJob {
  resolve: (results: SolverOverviewFaceResult[]) => void;
  reject: (error: Error) => void;
}

const overviewCache = new Map<string, SolverOverviewFaceResult[]>();
const pendingOverviewRequests = new Map<string, Promise<SolverOverviewFaceResult[]>>();
const pendingWorkerJobs = new Map<number, PendingOverviewJob>();

let sharedOverviewWorker: Worker | null = null;
let nextOverviewJobId = 0;

function normalizeScrambleKey(scramble: string): string {
  return scramble.trim().replace(/\s+/g, " ");
}

function formatMoveCount(length: number, truncated: boolean): string {
  return truncated ? `>${length}手` : `${length}手`;
}

/**
 * Only request or apply post-solve overview insights when the timer is finished.
 */
export function shouldRequestInsight(timerState: InsightTimerState | string): boolean {
  return timerState === "finished";
}

/**
 * Builds structured shortest Cross / X-Cross summary from 6-face solver overview results.
 */
export function buildSolveInsightSummary(
  overview: readonly SolverOverviewFaceResult[],
  options: FormatSolveInsightOptions = {},
): SolveInsightSummary | null {
  if (overview.length === 0) {
    return null;
  }

  const faceColorMap = options.faceColorMap ?? DEFAULT_FACE_COLOR_MAP;
  const resolvedColor = normalizeCubeColorName(options.targetColor) ?? faceColorMap.D;
  const targetFace = getFaceForCubeColor(resolvedColor, faceColorMap) ?? "D";
  const targetEntry = overview.find((entry) => entry.face === targetFace);

  if (!targetEntry) {
    return null;
  }

  const nonTruncatedPool = overview.filter((entry) => !entry.cross.truncated);
  const candidatePool = nonTruncatedPool.length > 0 ? nonTruncatedPool : overview;
  const minCrossLength = Math.min(...candidatePool.map((entry) => entry.cross.length));

  // Prioritize the target/default color when another face ties for the shortest cross.
  const isTargetAtMinimum =
    candidatePool.includes(targetEntry) && targetEntry.cross.length === minCrossLength;
  const bestEntry = isTargetAtMinimum
    ? targetEntry
    : (candidatePool.find((entry) => entry.cross.length === minCrossLength) ?? targetEntry);

  const targetColor = faceColorMap[targetEntry.face];
  const bestCrossColor = faceColorMap[bestEntry.face];

  return {
    targetFace: targetEntry.face,
    targetColor,
    targetColorJapanese: getDefaultColorJapanese(targetColor),
    crossLength: targetEntry.cross.length,
    crossTruncated: targetEntry.cross.truncated,
    xcrossLength: targetEntry.xcross.length,
    xcrossTruncated: targetEntry.xcross.truncated,
    bestCrossFace: bestEntry.face,
    bestCrossColor,
    bestCrossColorJapanese: getDefaultColorJapanese(bestCrossColor),
    bestCrossLength: bestEntry.cross.length,
    bestCrossTruncated: bestEntry.cross.truncated,
    isTargetBest: bestEntry.face === targetEntry.face,
  };
}

/**
 * Formats 6-face overview results into a concise single-line Japanese summary.
 */
export function formatSolveInsightText(
  overview: readonly SolverOverviewFaceResult[],
  options: FormatSolveInsightOptions = {},
): string | null {
  const summary = buildSolveInsightSummary(overview, options);
  if (!summary) {
    return null;
  }

  const crossText = formatMoveCount(summary.crossLength, summary.crossTruncated);
  const xcrossText = formatMoveCount(summary.xcrossLength, summary.xcrossTruncated);
  const mainPart = `最短 ― ${summary.targetColorJapanese}クロス ${crossText}・${summary.targetColorJapanese} X クロス ${xcrossText}`;

  if (summary.isTargetBest) {
    return mainPart;
  }

  const bestCrossText = formatMoveCount(summary.bestCrossLength, summary.bestCrossTruncated);
  return `${mainPart} ／ 全色で一番短い: ${summary.bestCrossColorJapanese}クロス ${bestCrossText}`;
}

export function getCachedScrambleOverview(scramble: string): SolverOverviewFaceResult[] | null {
  const key = normalizeScrambleKey(scramble);
  if (!key) {
    return null;
  }

  return overviewCache.get(key) ?? null;
}

export function clearScrambleOverviewCache(): void {
  overviewCache.clear();
  pendingOverviewRequests.clear();
}

export function resetOverviewWorkerForTest(): void {
  if (sharedOverviewWorker) {
    sharedOverviewWorker.terminate();
    sharedOverviewWorker = null;
  }
  pendingWorkerJobs.clear();
  pendingOverviewRequests.clear();
  nextOverviewJobId = 0;
}

function getOrCreateOverviewWorker(workerFactory?: () => Worker): Worker {
  if (sharedOverviewWorker) {
    return sharedOverviewWorker;
  }

  const worker = workerFactory
    ? workerFactory()
    : new Worker(new URL("../analyzer/solverWorker.ts", import.meta.url), {
        type: "module",
      });

  worker.onmessage = (event: MessageEvent<SolverWorkerResponse>) => {
    const response = event.data;
    const job = pendingWorkerJobs.get(response.jobId);
    if (!job) {
      return;
    }

    pendingWorkerJobs.delete(response.jobId);

    if (!response.ok) {
      job.reject(new Error(response.error));
      return;
    }

    job.resolve(response.result as SolverOverviewFaceResult[]);
  };

  worker.onerror = () => {
    const error = new Error("最短計算Workerでエラーが発生しました。");
    for (const job of pendingWorkerJobs.values()) {
      job.reject(error);
    }
    pendingWorkerJobs.clear();
    worker.terminate();
    if (sharedOverviewWorker === worker) {
      sharedOverviewWorker = null;
    }
  };

  sharedOverviewWorker = worker;
  return worker;
}

/**
 * Requests a 6-face Cross / X-Cross overview via a lazily created singleton Worker, with per-scramble caching.
 */
export function requestScrambleOverview(
  scramble: string,
  options: RequestOverviewOptions = {},
): Promise<SolverOverviewFaceResult[]> {
  const key = normalizeScrambleKey(scramble);
  if (!key) {
    return Promise.reject(new Error("スクランブルが空です。"));
  }

  const cached = overviewCache.get(key);
  if (cached) {
    return Promise.resolve(cached);
  }

  const pending = pendingOverviewRequests.get(key);
  if (pending) {
    return pending;
  }

  const promise = new Promise<SolverOverviewFaceResult[]>((resolve, reject) => {
    try {
      const worker = getOrCreateOverviewWorker(options.workerFactory);
      nextOverviewJobId += 1;
      const jobId = nextOverviewJobId;

      pendingWorkerJobs.set(jobId, {
        resolve: (results) => {
          overviewCache.set(key, results);
          resolve(results);
        },
        reject,
      });

      const request: SolverWorkerRequest = {
        jobId,
        kind: "overview",
        scramble: key,
      };
      worker.postMessage(request);
    } catch (error) {
      reject(error instanceof Error ? error : new Error("最短計算Workerを起動できませんでした。"));
    }
  }).finally(() => {
    pendingOverviewRequests.delete(key);
  });

  pendingOverviewRequests.set(key, promise);
  return promise;
}
