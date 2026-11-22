/// <reference lib="webworker" />
// Generates WCA random-state 3x3 scrambles with cubing.js inside this worker, so
// cubing.js never touches the main bundle (its own search worker is started from here).
import { randomScrambleForEvent } from "cubing/scramble";
import { setSearchDebug } from "cubing/search";

// In a Vite build, cubing.js's first way of starting its search worker (a URL without
// the content hash) 404s before its fallback works; try the working way first so the
// console stays clean, and skip perf logging.
setSearchDebug({ prioritizeEsbuildWorkaroundForWorkerInstantiation: true, logPerf: false });

interface ScrambleRequest {
  id: number;
}

self.onmessage = async (event: MessageEvent<ScrambleRequest>) => {
  const { id } = event.data;

  try {
    const alg = await randomScrambleForEvent("333");
    self.postMessage({ id, ok: true, scramble: alg.toString() });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
