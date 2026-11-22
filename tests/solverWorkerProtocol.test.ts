import { describe, expect, it, vi } from "vitest";

// Building the pruning tables takes ~3s; parallel test files can push that past
// the 5s default, so give the whole file more time (assertions are unchanged).
vi.setConfig({ testTimeout: 20000 });
import { handleSolverRequest } from "../src/analyzer/solverWorker";
import crossFixture from "./fixtures/cross-optimal.json";
import xcrossFixture from "./fixtures/xcross-optimal.json";

describe("solverWorkerProtocol handleSolverRequest", () => {
  // The instruction originally expected 3 here; that was Claude's mistake: after R U R'
  // only FR is broken, so the best X-cross (min over slots) is 0 via an untouched slot.
  it("returns 6-face overview for scramble 'R U R\\'' with D cross=0 and best xcross=0", () => {
    const response = handleSolverRequest({
      jobId: 1,
      kind: "overview",
      scramble: "R U R'",
    });

    expect(response.jobId).toBe(1);
    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error(response.error);
    }

    expect(response.result).toHaveLength(6);
    const dFace = response.result.find((entry) => entry.face === "D");
    expect(dFace).toBeDefined();
    expect(dFace?.cross.length).toBe(0);
    expect(dFace?.xcross.length).toBe(0);
    expect(dFace?.xcross.bestSlot).not.toBe("FR");
  });

  it("matches the X-cross fixture for every face in the overview", () => {
    const item = xcrossFixture.cases[0];
    const response = handleSolverRequest({ jobId: 9, kind: "overview", scramble: item.scramble });
    if (!response.ok) {
      throw new Error(response.error);
    }

    for (const entry of response.result) {
      expect(entry.xcross.length).toBe(
        item.bestByFace[entry.face as keyof typeof item.bestByFace],
      );
    }
    const dFace = response.result.find((entry) => entry.face === "D");
    expect(dFace?.cross.length).toBe(crossFixture.cases[0].optimal.D);
  });

  it("analyzes scramble 'R U R\\'' and solution 'R U\\' R\\'' with pair1 FR 3 moves and optimal.length 3", () => {
    const response = handleSolverRequest({
      jobId: 2,
      kind: "analyze",
      scramble: "R U R'",
      solution: "R U' R'",
    });

    expect(response.jobId).toBe(2);
    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error(response.error);
    }

    expect("error" in response.result).toBe(false);
    if ("error" in response.result && response.result.error) {
      throw new Error(response.result.error);
    }

    // FL/BL/BR are pre-solved 0-move pairs, so the inserted FR pair is pair4.
    const pair1 = response.result.phases.find((phase) => phase.name === "pair4");
    expect(pair1).toBeDefined();
    expect(pair1?.reached).toBe(true);
    expect(pair1?.slot).toBe("FR");
    expect(pair1?.htm).toBe(3);
    expect(pair1?.optimal?.length).toBe(3);
  });

  it("returns ok: true with a Japanese error inside result for unreadable moves (same as analyzeSolve)", () => {
    const response = handleSolverRequest({
      jobId: 3,
      kind: "analyze",
      scramble: "R U R'",
      solution: "R U Q",
    });

    expect(response.jobId).toBe(3);
    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error("Expected ok: true with result.error");
    }

    expect("error" in response.result).toBe(true);
    if (!("error" in response.result) || !response.result.error) {
      throw new Error("Expected Japanese error message inside result");
    }

    expect(response.result.error).toContain("Q");
    expect(response.result.error).toMatch(/読めない/);
  });
});
