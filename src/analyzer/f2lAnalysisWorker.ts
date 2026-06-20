import {
  analyzeBasicF2lOrderPlansProgressively,
  type BasicF2lAnalysisPhase,
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
  phase?: BasicF2lAnalysisPhase;
  done: boolean;
  plan?: BasicF2lAnalysisPlan;
  orderResult?: BasicF2lOrderAnalysisResult;
  error?: string;
}

const ctx: Worker = self as unknown as Worker;

function createResponse(
  jobId: number,
  phase: BasicF2lAnalysisPhase,
  orderResult: BasicF2lOrderAnalysisResult,
  done: boolean,
): F2lAnalysisWorkerResponse {
  const plan = orderResult.plans[0];

  return {
    jobId,
    ok: Boolean(plan),
    phase,
    done,
    plan,
    orderResult,
    error: plan ? undefined : "F2L解析候補を作成できませんでした。",
  };
}

ctx.onmessage = (event: MessageEvent<F2lAnalysisWorkerRequest>) => {
  const { jobId, state, crossColor, targetFace } = event.data;

  try {
    analyzeBasicF2lOrderPlansProgressively(
      state,
      crossColor,
      targetFace,
      (phase, result, done) => {
        ctx.postMessage(createResponse(jobId, phase, result, done));
      },
    );
  } catch (error) {
    const response: F2lAnalysisWorkerResponse = {
      jobId,
      ok: false,
      phase: "fallback",
      done: true,
      error: error instanceof Error ? error.message : "F2L解析中にエラーが発生しました。",
    };

    ctx.postMessage(response);
  }
};

export {};
