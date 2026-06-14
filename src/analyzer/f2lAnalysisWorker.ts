import {
  analyzeBasicF2lPlan,
  type BasicF2lAnalysisPlan,
  type CubeColorName,
  type CubeState,
  type TargetFace,
} from "./cubeState";

interface F2lAnalysisWorkerRequest {
  jobId: number;
  state: CubeState;
  crossColor: CubeColorName;
  targetFace: TargetFace;
}

interface F2lAnalysisWorkerResponse {
  jobId: number;
  ok: boolean;
  plan?: BasicF2lAnalysisPlan;
  error?: string;
}

const ctx: Worker = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<F2lAnalysisWorkerRequest>) => {
  const { jobId, state, crossColor, targetFace } = event.data;

  try {
    const plan = analyzeBasicF2lPlan(state, crossColor, targetFace);
    const response: F2lAnalysisWorkerResponse = {
      jobId,
      ok: true,
      plan,
    };

    ctx.postMessage(response);
  } catch (error) {
    const response: F2lAnalysisWorkerResponse = {
      jobId,
      ok: false,
      error: error instanceof Error ? error.message : "F2L解析中にエラーが発生しました。",
    };

    ctx.postMessage(response);
  }
};

export {};
