import {
  analyzeBasicF2lBestOrderPlan,
  analyzeBasicF2lOrderPlans,
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
  useLocalSearch?: boolean;
  includeAllPlans?: boolean;
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
    const useLocalSearch = Boolean(event.data.useLocalSearch);
    const includeAllPlans = Boolean(event.data.includeAllPlans);
    const analyzer = includeAllPlans
      ? analyzeBasicF2lOrderPlans
      : analyzeBasicF2lBestOrderPlan;

    if (!useLocalSearch && !includeAllPlans) {
      const basicResult = analyzeBasicF2lBestOrderPlan(state, crossColor, targetFace, {
        useLocalSearch: false,
        useBasicF2lLegacyFallback: false,
      });
      const basicPlan = basicResult.plans[0];

      if (!basicPlan) {
        ctx.postMessage(createResponse(jobId, "basic41", basicResult, true));
        return;
      }

      const shouldRunFallback = basicPlan.unresolvedPairs.length > 0;

      ctx.postMessage(createResponse(jobId, "basic41", basicResult, !shouldRunFallback));

      if (!shouldRunFallback) {
        return;
      }

      const fallbackResult = analyzeBasicF2lBestOrderPlan(state, crossColor, targetFace, {
        useLocalSearch: true,
        useBasicF2lLegacyFallback: false,
      });

      ctx.postMessage(createResponse(jobId, "fallback", fallbackResult, true));
      return;
    }

    const phase: BasicF2lAnalysisPhase = useLocalSearch ? "fallback" : "basic41";
    const result = analyzer(state, crossColor, targetFace, {
      useLocalSearch,
      useBasicF2lLegacyFallback: false,
    });

    ctx.postMessage(createResponse(jobId, phase, result, true));
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
