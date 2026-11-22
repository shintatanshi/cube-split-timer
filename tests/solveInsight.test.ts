import { beforeEach, describe, expect, it } from "vitest";
import type { SolverOverviewFaceResult, SolverWorkerRequest } from "../src/analyzer/solverWorker";
import {
  DEFAULT_FACE_COLOR_MAP,
  getDefaultColorJapanese,
  getFaceColorJapanese,
} from "../src/lib/defaultFaceColors";
import {
  clearScrambleOverviewCache,
  formatSolveInsightText,
  getCachedScrambleOverview,
  requestScrambleOverview,
  resetOverviewWorkerForTest,
  shouldRequestInsight,
} from "../src/lib/solveInsight";

function makeOverview(
  overrides: Partial<Record<"D" | "U" | "F" | "B" | "R" | "L", { cross: number; xcross: number }>> = {},
): SolverOverviewFaceResult[] {
  const defaults: Record<"D" | "U" | "F" | "B" | "R" | "L", { cross: number; xcross: number }> = {
    D: { cross: 6, xcross: 7 },
    U: { cross: 7, xcross: 8 },
    F: { cross: 6, xcross: 8 },
    B: { cross: 7, xcross: 9 },
    R: { cross: 7, xcross: 8 },
    L: { cross: 5, xcross: 7 },
  };

  return (["D", "U", "F", "B", "R", "L"] as const).map((face) => {
    const entry = overrides[face] ?? defaults[face];
    return {
      face,
      cross: {
        length: entry.cross,
        solution: [],
        truncated: false,
      },
      xcross: {
        bestSlot: "FR",
        length: entry.xcross,
        solution: [],
        truncated: false,
      },
    };
  });
}

describe("defaultFaceColors", () => {
  it("maps faces to default Japanese colors U=黄, D=白, F=青, B=緑, R=赤, L=橙", () => {
    expect(DEFAULT_FACE_COLOR_MAP).toEqual({
      U: "yellow",
      D: "white",
      F: "blue",
      B: "green",
      R: "red",
      L: "orange",
    });

    expect(getFaceColorJapanese("U")).toBe("黄");
    expect(getFaceColorJapanese("D")).toBe("白");
    expect(getFaceColorJapanese("F")).toBe("青");
    expect(getFaceColorJapanese("B")).toBe("緑");
    expect(getFaceColorJapanese("R")).toBe("赤");
    expect(getFaceColorJapanese("L")).toBe("橙");
    expect(getDefaultColorJapanese("white")).toBe("白");
  });
});

describe("solveInsight", () => {
  beforeEach(() => {
    clearScrambleOverviewCache();
    resetOverviewWorkerForTest();
  });

  it("formats default white cross and shortest other color when shorter", () => {
    const overview = makeOverview();
    expect(formatSolveInsightText(overview)).toBe(
      "最短 ― 白クロス 6手・白 X クロス 7手 ／ 全色で一番短い: 橙クロス 5手",
    );
  });

  it("prioritizes default color on tie and omits second half when default color is shortest", () => {
    const overview = makeOverview({
      D: { cross: 5, xcross: 7 },
      L: { cross: 5, xcross: 6 },
      U: { cross: 6, xcross: 8 },
      F: { cross: 6, xcross: 8 },
      B: { cross: 7, xcross: 8 },
      R: { cross: 7, xcross: 8 },
    });

    expect(formatSolveInsightText(overview)).toBe("最短 ― 白クロス 5手・白 X クロス 7手");
  });

  it("uses specified crossColor for cross_practice solves", () => {
    const overview = makeOverview();
    expect(formatSolveInsightText(overview, { targetColor: "orange" })).toBe(
      "最短 ― 橙クロス 5手・橙 X クロス 7手",
    );

    expect(formatSolveInsightText(overview, { targetColor: "blue" })).toBe(
      "最短 ― 青クロス 6手・青 X クロス 8手 ／ 全色で一番短い: 橙クロス 5手",
    );
  });

  it("only allows insight requests when timerState is finished", () => {
    expect(shouldRequestInsight("finished")).toBe(true);
    expect(shouldRequestInsight("running")).toBe(false);
    expect(shouldRequestInsight("holding")).toBe(false);
    expect(shouldRequestInsight("ready")).toBe(false);
    expect(shouldRequestInsight("inspecting")).toBe(false);
    expect(shouldRequestInsight("pendingStart")).toBe(false);
    expect(shouldRequestInsight("idle")).toBe(false);
  });

  it("creates worker only once and caches overview results per scramble", async () => {
    let workerCreatedCount = 0;
    const postedRequests: SolverWorkerRequest[] = [];

    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;

      postMessage(data: SolverWorkerRequest) {
        postedRequests.push(data);
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              jobId: data.jobId,
              ok: true,
              result: makeOverview(),
            },
          } as MessageEvent);
        });
      }

      terminate() {}
    }

    const factory = () => {
      workerCreatedCount += 1;
      return new FakeWorker() as unknown as Worker;
    };

    const first = await requestScrambleOverview("R U R' U'", { workerFactory: factory });
    const cached = await requestScrambleOverview("  R   U R' U'  ", { workerFactory: factory });
    const secondScramble = await requestScrambleOverview("F R U R' U' F'", { workerFactory: factory });

    expect(first).toHaveLength(6);
    expect(cached).toEqual(first);
    expect(secondScramble).toHaveLength(6);
    expect(workerCreatedCount).toBe(1);
    expect(postedRequests).toHaveLength(2);
    expect(getCachedScrambleOverview("R U R' U'")).toEqual(first);
  });
});
