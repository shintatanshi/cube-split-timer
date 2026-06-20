import {
  analyzeBasicF2lOrderPlans,
  type BasicF2lAnalysisPlan,
  type BasicF2lOrderAnalysisResult,
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
  orderResult?: BasicF2lOrderAnalysisResult;
  error?: string;
}

const ctx: Worker = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<F2lAnalysisWorkerRequest>) => {
  const { jobId, state, crossColor, targetFace } = event.data;

  try {
    const orderResult = analyzeBasicF2lOrderPlans(state, crossColor, targetFace);
    const plan = orderResult.plans[0];
    const response: F2lAnalysisWorkerResponse = {
      jobId,
      ok: Boolean(plan),
      plan,
      orderResult,
      error: plan ? undefined : "F2L解析候補を作成できませんでした。",
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
