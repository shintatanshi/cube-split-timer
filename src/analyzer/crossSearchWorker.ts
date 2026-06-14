import {
  findCrossSolutionsFromScramble,
  type CrossSearchInput,
  type CrossSearchResult,
} from "./cubeState";

interface CrossSearchWorkerRequest {
  jobId: number;
  jobs: CrossSearchInput[];
}

interface CrossSearchWorkerResponse {
  jobId: number;
  ok: boolean;
  results?: CrossSearchResult[];
  error?: string;
}

const ctx: Worker = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<CrossSearchWorkerRequest>) => {
  const { jobId, jobs } = event.data;

  try {
    const results = jobs.map((job) => findCrossSolutionsFromScramble(job));
    const response: CrossSearchWorkerResponse = {
      jobId,
      ok: true,
      results,
    };

    ctx.postMessage(response);
  } catch (error) {
    const response: CrossSearchWorkerResponse = {
      jobId,
      ok: false,
      error: error instanceof Error ? error.message : "Cross探索中にエラーが発生しました。",
    };

    ctx.postMessage(response);
  }
};

export {};
