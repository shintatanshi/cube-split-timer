import {
  ALL_FACES,
  analyzeSolve,
  initPruningTables,
  parseMoves,
  solveBestXCross,
  solveCross,
  type AnalyzeSolveResult,
  type Face,
  type Slot,
  type SplitTimesMs,
} from "./solver";

export interface SolverOverviewFaceResult {
  face: Face;
  cross: {
    length: number;
    solution: string[];
    truncated: boolean;
  };
  xcross: {
    bestSlot: Slot;
    length: number;
    solution: string[];
    truncated: boolean;
  };
}

export interface SolverOverviewRequest {
  jobId: number;
  kind: "overview";
  scramble: string;
}

export interface SolverAnalyzeRequest {
  jobId: number;
  kind: "analyze";
  scramble: string;
  solution: string;
  crossFace?: Face;
  splits?: SplitTimesMs;
}

export type SolverWorkerRequest = SolverOverviewRequest | SolverAnalyzeRequest;

export interface SolverWorkerSuccess<T> {
  jobId: number;
  ok: true;
  result: T;
}

export interface SolverWorkerFailure {
  jobId: number;
  ok: false;
  error: string;
}

export type SolverWorkerResult<T> = SolverWorkerSuccess<T> | SolverWorkerFailure;

export type SolverWorkerResponse =
  | SolverWorkerSuccess<SolverOverviewFaceResult[] | AnalyzeSolveResult>
  | SolverWorkerFailure;

let pruningTablesInitialized = false;

function ensurePruningTables(): void {
  if (!pruningTablesInitialized) {
    initPruningTables();
    pruningTablesInitialized = true;
  }
}

function formatScrambleError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Invalid move token:\s*"([^"]*)"/);
  if (match) {
    return `スクランブルに読めない記号「${match[1]}」が含まれています`;
  }
  return "スクランブルを読み取れません";
}

/**
 * Pure request handler for the solver Web Worker, exported for direct unit testing.
 */
export function handleSolverRequest(
  request: SolverOverviewRequest,
): SolverWorkerResult<SolverOverviewFaceResult[]>;
export function handleSolverRequest(
  request: SolverAnalyzeRequest,
): SolverWorkerResult<AnalyzeSolveResult>;
export function handleSolverRequest(request: SolverWorkerRequest): SolverWorkerResponse;
export function handleSolverRequest(request: SolverWorkerRequest): SolverWorkerResponse {
  try {
    ensurePruningTables();

    if (request.kind === "overview") {
      const scrambleTokens = parseMoves(request.scramble);
      const overview: SolverOverviewFaceResult[] = ALL_FACES.map((face) => {
        const cross = solveCross(scrambleTokens, face);
        const xcross = solveBestXCross(scrambleTokens, face);
        const bestSlotResult = xcross.slots[xcross.bestSlot];

        return {
          face,
          cross: {
            length: cross.length,
            solution: cross.solution,
            truncated: cross.truncated,
          },
          xcross: {
            bestSlot: xcross.bestSlot,
            length: xcross.length,
            solution: xcross.solution,
            truncated: bestSlotResult?.truncated ?? false,
          },
        };
      });

      return {
        jobId: request.jobId,
        ok: true,
        result: overview,
      };
    }

    const analysis = analyzeSolve(request.scramble, request.solution, {
      compare: true,
      crossFace: request.crossFace,
      splits: request.splits,
    });

    return {
      jobId: request.jobId,
      ok: true,
      result: analysis,
    };
  } catch (error) {
    const message =
      request.kind === "overview"
        ? formatScrambleError(error)
        : error instanceof Error
          ? error.message
          : "解析中にエラーが発生しました。";

    return {
      jobId: request.jobId,
      ok: false,
      error: message,
    };
  }
}

if (typeof self !== "undefined" && typeof window === "undefined") {
  const ctx: Worker = self as unknown as Worker;

  ctx.onmessage = (event: MessageEvent<SolverWorkerRequest>) => {
    ctx.postMessage(handleSolverRequest(event.data));
  };
}

export {};
