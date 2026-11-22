import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CUBE_COLOR_HEX } from "../lib/cubeVisuals";
import { getColorJapanese, type CubeColorName, type FaceName } from "./cubeState";
import {
  ALL_FACES,
  toFaceTurns,
  type AnalyzeSolveResult,
  type AnalyzeSolveSuccess,
  type Face,
  type PhaseAnalysis,
} from "./solver";
import type {
  SolverOverviewFaceResult,
  SolverWorkerRequest,
  SolverWorkerResponse,
} from "./solverWorker";

export interface SolveCompareSplits {
  crossMs?: number | null;
  f2lMs?: number | null;
  ollMs?: number | null;
  pllMs?: number | null;
}

export interface SolveComparePanelProps {
  scramble: string;
  solution: string;
  faceColorMap: Record<FaceName, CubeColorName>;
  splits?: SolveCompareSplits;
  autoOverview?: boolean;
  onPlay: (algorithm: string) => void;
}

function getPhaseLabel(phase: PhaseAnalysis): string {
  switch (phase.name) {
    case "cross":
      return "Cross";
    case "pair1":
      return phase.slot ? `ペア1 (${phase.slot})` : "ペア1";
    case "pair2":
      return phase.slot ? `ペア2 (${phase.slot})` : "ペア2";
    case "pair3":
      return phase.slot ? `ペア3 (${phase.slot})` : "ペア3";
    case "pair4":
      return phase.slot ? `ペア4 (${phase.slot})` : "ペア4";
    case "oll":
      return "OLL";
    case "pll":
      return "PLL";
  }
}

function formatFaceSwatchStyle(color: CubeColorName) {
  return {
    backgroundColor: `#${CUBE_COLOR_HEX[color].toString(16).padStart(6, "0")}`,
  };
}

function buildOptimalPlaybackAlgorithm(
  phases: readonly PhaseAnalysis[],
  phaseIndex: number,
  optimalSolution: readonly string[],
): string {
  if (phaseIndex <= 0) {
    return optimalSolution.join(" ");
  }

  const prefixTokens = phases.slice(0, phaseIndex).flatMap((phase) => phase.tokens);
  let normalizedPrefix: readonly string[] = prefixTokens;
  try {
    normalizedPrefix = toFaceTurns(prefixTokens).faceTurns;
  } catch {
    normalizedPrefix = prefixTokens;
  }

  return [...normalizedPrefix, ...optimalSolution].join(" ");
}

function formatSplitSeconds(ms: number | null | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) {
    return null;
  }

  return (ms / 1000).toFixed(2);
}

function formatSplitsSummary(splits?: SolveCompareSplits): string | null {
  if (!splits) {
    return null;
  }

  const entries: Array<[string, string | null]> = [
    ["Cross", formatSplitSeconds(splits.crossMs)],
    ["F2L", formatSplitSeconds(splits.f2lMs)],
    ["OLL", formatSplitSeconds(splits.ollMs)],
    ["PLL", formatSplitSeconds(splits.pllMs)],
  ];
  const parts = entries
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([label, value]) => `${label} ${value}`);

  if (parts.length === 0) {
    return null;
  }

  return `この記録: ${parts.join(" / ")}`;
}

/**
 * Displays 6-color shortest Cross / X-Cross overview and per-phase comparison against the user's solve.
 */
export default function SolveComparePanel({
  scramble,
  solution,
  faceColorMap,
  splits,
  autoOverview = false,
  onPlay,
}: SolveComparePanelProps) {
  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef(0);
  const jobKindByIdRef = useRef<Map<number, "overview" | "analyze">>(new Map());
  const latestOverviewJobIdRef = useRef(0);
  const latestAnalyzeJobIdRef = useRef(0);
  const hasAutoRunOverviewRef = useRef(false);

  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [overviewResults, setOverviewResults] = useState<SolverOverviewFaceResult[] | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const [selectedCrossFace, setSelectedCrossFace] = useState<Face | "">("");
  const [isLoadingAnalyze, setIsLoadingAnalyze] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeSolveSuccess | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  useEffect(() => {
    setOverviewResults(null);
    setOverviewError(null);
    setAnalyzeResult(null);
    setAnalyzeError(null);
  }, [scramble]);

  useEffect(() => {
    setAnalyzeResult(null);
    setAnalyzeError(null);
  }, [solution]);

  useEffect(
    () => () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      jobKindByIdRef.current.clear();
      hasAutoRunOverviewRef.current = false;
      setIsLoadingOverview(false);
      setIsLoadingAnalyze(false);
    },
    [],
  );

  const getOrCreateWorker = useCallback((): Worker => {
    if (workerRef.current) {
      return workerRef.current;
    }

    const worker = new Worker(new URL("./solverWorker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event: MessageEvent<SolverWorkerResponse>) => {
      const response = event.data;
      const kind = jobKindByIdRef.current.get(response.jobId);
      jobKindByIdRef.current.delete(response.jobId);

      if (kind === "overview") {
        if (response.jobId !== latestOverviewJobIdRef.current) {
          return;
        }
        setIsLoadingOverview(false);

        if (!response.ok) {
          setOverviewResults(null);
          setOverviewError(response.error);
          return;
        }

        setOverviewError(null);
        setOverviewResults(response.result as SolverOverviewFaceResult[]);
        return;
      }

      if (kind === "analyze") {
        if (response.jobId !== latestAnalyzeJobIdRef.current) {
          return;
        }
        setIsLoadingAnalyze(false);

        if (!response.ok) {
          setAnalyzeResult(null);
          setAnalyzeError(response.error);
          return;
        }

        const result = response.result as AnalyzeSolveResult;
        if ("error" in result && result.error) {
          setAnalyzeResult(null);
          setAnalyzeError(result.error);
          return;
        }

        setAnalyzeError(null);
        setAnalyzeResult(result as AnalyzeSolveSuccess);
      }
    };

    worker.onerror = () => {
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
      jobKindByIdRef.current.clear();
      setIsLoadingOverview(false);
      setIsLoadingAnalyze(false);
      setOverviewError((prev) => prev ?? "解析Workerでエラーが発生しました。");
      setAnalyzeError((prev) => prev ?? "解析Workerでエラーが発生しました。");
    };

    workerRef.current = worker;
    return worker;
  }, []);

  const runOverview = useCallback(() => {
    setOverviewError(null);

    if (!scramble.trim()) {
      setOverviewResults(null);
      setOverviewError("スクランブルを入力してください。");
      return;
    }

    try {
      const worker = getOrCreateWorker();
      const jobId = jobIdRef.current + 1;
      jobIdRef.current = jobId;
      latestOverviewJobIdRef.current = jobId;
      jobKindByIdRef.current.set(jobId, "overview");
      setIsLoadingOverview(true);

      const request: SolverWorkerRequest = {
        jobId,
        kind: "overview",
        scramble,
      };
      worker.postMessage(request);
    } catch {
      setIsLoadingOverview(false);
      setOverviewError("解析Workerを起動できませんでした。");
    }
  }, [getOrCreateWorker, scramble]);

  useEffect(() => {
    if (!autoOverview) {
      hasAutoRunOverviewRef.current = false;
      return;
    }

    if (hasAutoRunOverviewRef.current || !scramble.trim()) {
      return;
    }

    hasAutoRunOverviewRef.current = true;
    runOverview();
  }, [autoOverview, runOverview, scramble]);

  const runAnalyze = useCallback(() => {
    setAnalyzeError(null);

    if (!solution.trim()) {
      setAnalyzeResult(null);
      return;
    }

    try {
      const worker = getOrCreateWorker();
      const jobId = jobIdRef.current + 1;
      jobIdRef.current = jobId;
      latestAnalyzeJobIdRef.current = jobId;
      jobKindByIdRef.current.set(jobId, "analyze");
      setIsLoadingAnalyze(true);

      const request: SolverWorkerRequest = {
        jobId,
        kind: "analyze",
        scramble,
        solution,
        ...(selectedCrossFace ? { crossFace: selectedCrossFace } : {}),
        ...(splits ? { splits } : {}),
      };
      worker.postMessage(request);
    } catch {
      setIsLoadingAnalyze(false);
      setAnalyzeError("解析Workerを起動できませんでした。");
    }
  }, [getOrCreateWorker, scramble, selectedCrossFace, solution, splits]);

  const minCrossLength = useMemo(() => {
    if (!overviewResults || overviewResults.length === 0) {
      return null;
    }
    return Math.min(...overviewResults.map((row) => row.cross.length));
  }, [overviewResults]);

  const minXCrossLength = useMemo(() => {
    if (!overviewResults || overviewResults.length === 0) {
      return null;
    }
    const valid = overviewResults.filter((row) => !row.xcross.truncated);
    const pool = valid.length > 0 ? valid : overviewResults;
    return Math.min(...pool.map((row) => row.xcross.length));
  }, [overviewResults]);

  const worstLossSummary = useMemo(() => {
    if (!analyzeResult) {
      return null;
    }

    let worstPhase: PhaseAnalysis | null = null;
    let worstDiff = -Infinity;

    for (const phase of analyzeResult.phases) {
      if (!phase.reached || !phase.optimal || phase.optimal.truncated) {
        continue;
      }
      const diff = phase.htm - phase.optimal.length;
      if (diff > worstDiff) {
        worstDiff = diff;
        worstPhase = phase;
      }
    }

    return worstPhase ? { phase: worstPhase, diff: worstDiff } : null;
  }, [analyzeResult]);

  const hasSolution = solution.trim().length > 0;
  const splitsSummary = useMemo(() => formatSplitsSummary(splits), [splits]);

  return (
    <div className="solve-compare-panel">
      <div className="solve-compare-block">
        <div className="analyzer-subheading">
          <div>
            <p className="eyebrow">6-Color Shortest</p>
            <h2>全色の最短</h2>
          </div>
          <button
            className="analyzer-primary-action"
            type="button"
            onClick={runOverview}
            disabled={isLoadingOverview}
          >
            {isLoadingOverview ? "準備中..." : "調べる"}
          </button>
        </div>

        <p className="analyzer-muted">
          現在のスクランブルに対して、6色すべての最短クロスと最短 X クロスを探します。
        </p>

        {splitsSummary && (
          <div className="solve-compare-splits-banner">
            <p>{splitsSummary}</p>
            <small>自分の手順を入れると、段ごとの手数と TPS も出ます</small>
          </div>
        )}

        {isLoadingOverview && (
          <p className="solve-compare-status" role="status">
            準備中…（初回は表を作るので数秒かかります）
          </p>
        )}

        {overviewError && (
          <div className="analyzer-error analyzer-error-compact" role="alert">
            <p>{overviewError}</p>
          </div>
        )}

        {overviewResults && (
          <div className="solve-compare-table-wrap">
            <table className="solve-compare-table">
              <thead>
                <tr>
                  <th>色</th>
                  <th>クロス最短</th>
                  <th>X クロス最短</th>
                  <th>再生</th>
                </tr>
              </thead>
              <tbody>
                {overviewResults.map((row) => {
                  const color = faceColorMap[row.face];
                  const isBestRow = minCrossLength !== null && row.cross.length === minCrossLength;
                  const isBestXCross =
                    minXCrossLength !== null &&
                    !row.xcross.truncated &&
                    row.xcross.length === minXCrossLength;

                  return (
                    <tr
                      key={row.face}
                      className={isBestRow ? "solve-compare-row-best" : undefined}
                    >
                      <td>
                        <div className="solve-compare-color-cell">
                          <span
                            className="analyzer-color-swatch"
                            aria-hidden="true"
                            style={formatFaceSwatchStyle(color)}
                          />
                          <div>
                            <strong>{getColorJapanese(color)}</strong>
                            <small>{row.face}面</small>
                          </div>
                          {isBestRow && <span className="solve-compare-badge">最短</span>}
                        </div>
                      </td>
                      <td>
                        <div className="solve-compare-move-cell">
                          <strong>{row.cross.length}手</strong>
                          <code className="solve-compare-alg">
                            {row.cross.solution.join(" ") || "完成済み"}
                          </code>
                        </div>
                      </td>
                      <td>
                        <div className="solve-compare-move-cell">
                          <div className="solve-compare-xcross-head">
                            <strong>
                              {row.xcross.truncated
                                ? `>${row.xcross.length}手`
                                : `${row.xcross.length}手`}{" "}
                              ({row.xcross.bestSlot})
                            </strong>
                            {isBestXCross && (
                              <span className="solve-compare-badge is-subtle">X最短</span>
                            )}
                          </div>
                          <code className="solve-compare-alg">
                            {row.xcross.truncated
                              ? "探索上限超過"
                              : row.xcross.solution.join(" ") || "完成済み"}
                          </code>
                        </div>
                      </td>
                      <td>
                        <div className="solve-compare-play-actions">
                          <button
                            type="button"
                            onClick={() => onPlay(row.cross.solution.join(" "))}
                            disabled={row.cross.truncated}
                          >
                            Cross再生
                          </button>
                          <button
                            type="button"
                            onClick={() => onPlay(row.xcross.solution.join(" "))}
                            disabled={row.xcross.truncated}
                          >
                            XCross再生
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="solve-compare-block">
        <div className="analyzer-subheading">
          <div>
            <p className="eyebrow">Phase Comparison</p>
            <h2>自分の手順と比べる</h2>
          </div>
        </div>

        {!hasSolution ? (
          <p className="analyzer-muted">
            解析ページの &quot;手順&quot; に自分の手順を入れると、段ごとに最短と比べます
          </p>
        ) : (
          <>
            <div className="solve-compare-controls">
              <label className="analyzer-select-field solve-compare-face-select">
                <span>クロス色</span>
                <select
                  value={selectedCrossFace}
                  onChange={(event) => setSelectedCrossFace(event.target.value as Face | "")}
                >
                  <option value="">自動</option>
                  {ALL_FACES.map((face) => (
                    <option key={face} value={face}>
                      {getColorJapanese(faceColorMap[face])} ({face}面)
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="analyzer-primary-action"
                type="button"
                onClick={runAnalyze}
                disabled={isLoadingAnalyze}
              >
                {isLoadingAnalyze ? "比較中..." : "比べる"}
              </button>
            </div>

            {isLoadingAnalyze && (
              <p className="solve-compare-status" role="status">
                準備中…（初回は表を作るので数秒かかります）
              </p>
            )}

            {analyzeError && (
              <div className="analyzer-error analyzer-error-compact" role="alert">
                <p>{analyzeError}</p>
              </div>
            )}

            {analyzeResult && (
              <>
                <div className="solve-compare-summary-box">
                  <p className="solve-compare-summary">
                    合計 HTM {analyzeResult.totals.htm} / STM {analyzeResult.totals.stm}。
                    {worstLossSummary
                      ? worstLossSummary.diff > 0
                        ? `いちばん損した段: ${getPhaseLabel(worstLossSummary.phase)}（+${worstLossSummary.diff}手）`
                        : `ロスなし（最大差 ${worstLossSummary.diff >= 0 ? `+${worstLossSummary.diff}` : worstLossSummary.diff}手）`
                      : "比較できる段がありません"}
                  </p>
                  <small className="solve-compare-meta">
                    判定クロス: {getColorJapanese(faceColorMap[analyzeResult.crossFace])} (
                    {analyzeResult.crossFace}面)
                    {!analyzeResult.solvedAtEnd ? " / 末尾で未完成" : ""}
                  </small>
                  {analyzeResult.xcross && analyzeResult.xcross.length > 0 && (
                    <div className="solve-compare-xcross-hint">
                      <span>
                        クロスと {analyzeResult.xcross.slot} のペアを一緒にやる最短（X クロス）:{" "}
                        <strong>{analyzeResult.xcross.length}手</strong>
                        {analyzeResult.xcross.truncated ? "（途中まで）" : ""}{" "}
                        <code>{analyzeResult.xcross.solution.join(" ")}</code>
                      </span>
                      <button
                        type="button"
                        onClick={() => onPlay(analyzeResult.xcross?.solution.join(" ") ?? "")}
                        disabled={analyzeResult.xcross.truncated}
                      >
                        再生
                      </button>
                    </div>
                  )}
                </div>

                <div className="solve-compare-table-wrap">
                  <table className="solve-compare-table">
                    <thead>
                      <tr>
                        <th>段</th>
                        <th>あなた</th>
                        <th>最短</th>
                        <th>差</th>
                        <th>TPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analyzeResult.phases.map((phase, index) => {
                        const optimal = phase.optimal;
                        const hasOptimal = Boolean(optimal && !optimal.truncated);
                        const diff =
                          phase.reached && optimal && !optimal.truncated
                            ? phase.htm - optimal.length
                            : null;
                        const isHighLoss = diff !== null && diff >= 3;
                        const optimalPlaybackAlg =
                          optimal && !optimal.truncated
                            ? buildOptimalPlaybackAlgorithm(
                                analyzeResult.phases,
                                index,
                                optimal.solution,
                              )
                            : "";

                        return (
                          <tr
                            key={phase.name}
                            className={isHighLoss ? "solve-compare-row-loss" : undefined}
                          >
                            <td>
                              <div className="solve-compare-phase-cell">
                                <strong>{getPhaseLabel(phase)}</strong>
                                <div className="solve-compare-sub-algs">
                                  <small>
                                    あなた:{" "}
                                    <code>
                                      {phase.reached
                                        ? phase.tokens.join(" ") || "スキップ"
                                        : "未到達"}
                                    </code>
                                  </small>
                                  {optimal && (
                                    <div className="solve-compare-optimal-line">
                                      <small>
                                        最短:{" "}
                                        <code>
                                          {optimal.truncated
                                            ? "探索上限超過"
                                            : optimal.solution.join(" ") || "完成済み"}
                                        </code>
                                      </small>
                                      {!optimal.truncated && (
                                        <button
                                          className="solve-compare-mini-play"
                                          type="button"
                                          onClick={() => onPlay(optimalPlaybackAlg)}
                                        >
                                          再生
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>
                              {phase.reached ? (
                                <div className="solve-compare-count">
                                  <span>{phase.htm}手</span>
                                  {phase.stm !== phase.htm && <small>STM {phase.stm}</small>}
                                </div>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td>{hasOptimal && optimal ? `${optimal.length}手` : "-"}</td>
                            <td>
                              {diff !== null ? (
                                <span
                                  className={[
                                    "solve-compare-diff",
                                    isHighLoss ? "is-high" : "",
                                    diff <= 0 ? "is-good" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                >
                                  {diff > 0 ? `+${diff}手` : `${diff}手`}
                                </span>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td>
                              {phase.tps !== null && phase.tps !== undefined
                                ? phase.tps.toFixed(2)
                                : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
