import { searchF2lOrders } from "./f2lOrderSearch";
import type { CubeState } from "./cubeState";
import type { F2lOrderSearchOptions, F2lOrderSearchResult } from "./f2lSearchTypes";

interface F2lOrderSearchWorkerRequest {
  jobId: number;
  state: CubeState;
  options: F2lOrderSearchOptions;
}

interface F2lOrderSearchWorkerResponse {
  jobId: number;
  ok: boolean;
  result?: F2lOrderSearchResult;
  error?: string;
}

const ctx: Worker = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<F2lOrderSearchWorkerRequest>) => {
  const { jobId, state, options } = event.data;

  try {
    const result = searchF2lOrders({
      state,
      options,
    });

    if (import.meta.env.DEV) {
      console.info("[conditional-f2l-order-search]", result.diagnostics);
    }

    const response: F2lOrderSearchWorkerResponse = {
      jobId,
      ok: true,
      result,
    };

    ctx.postMessage(response);
  } catch (error) {
    console.error("[conditional-f2l-order-search] worker error", error);

    const response: F2lOrderSearchWorkerResponse = {
      jobId,
      ok: false,
      error: error instanceof Error ? error.message : "条件付きF2L探索中にエラーが発生しました。",
    };

    ctx.postMessage(response);
  }
};

export {};
