import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Building the pruning tables takes ~3s; parallel test files can push that past
// the 5s default, so give the whole file more time (assertions are unchanged).
vi.setConfig({ testTimeout: 20000 });
import { type Face } from "../src/analyzer/solver/cubie";
import { solveCross } from "../src/analyzer/solver/search";
import { analyzeSolve, type PhaseAnalysis } from "../src/analyzer/solver/reconstruct";

interface CrossFixtureCase {
  scramble: string;
  optimal: Record<Face, number>;
}

interface CrossFixtureFile {
  generator: string;
  seed: number;
  cases: CrossFixtureCase[];
}

function getPhase(phases: PhaseAnalysis[], name: PhaseAnalysis["name"]): PhaseAnalysis {
  const found = phases.find((p) => p.name === name);
  if (!found) {
    throw new Error(`Phase not found: ${name}`);
  }
  return found;
}

describe("solver/reconstruct analyzeSolve", () => {
  it("handles T perm (cross and pair1..4 and oll = 0 moves, pll = 14 moves)", () => {
    const tPerm = "R U R' U' R' F R2 U' R' U' R U R' F'";
    const res = analyzeSolve(tPerm, tPerm);

    expect("error" in res).toBe(false);
    if ("error" in res && res.error) {
      throw new Error(res.error);
    }

    expect(res.crossFace).toBe("D");
    expect(res.solvedAtEnd).toBe(true);
    expect(res.totals).toEqual({ htm: 14, stm: 14 });

    for (const name of ["cross", "pair1", "pair2", "pair3", "pair4", "oll"] as const) {
      const p = getPhase(res.phases, name);
      expect(p.reached).toBe(true);
      expect(p.htm).toBe(0);
      expect(p.stm).toBe(0);
      expect(p.tokens).toEqual([]);
    }

    const pll = getPhase(res.phases, "pll");
    expect(pll.reached).toBe(true);
    expect(pll.startIndex).toBe(0);
    expect(pll.endIndex).toBe(14);
    expect(pll.htm).toBe(14);
    expect(pll.stm).toBe(14);
    expect(pll.tokens.length).toBe(14);
  });

  it("handles Sune (oll = 7 moves, pll = 0 moves)", () => {
    const res = analyzeSolve("R U2 R' U' R U' R'", "R U R' U R U2 R'");

    expect("error" in res).toBe(false);
    if ("error" in res && res.error) {
      throw new Error(res.error);
    }

    expect(res.crossFace).toBe("D");
    expect(res.solvedAtEnd).toBe(true);

    for (const name of ["cross", "pair1", "pair2", "pair3", "pair4"] as const) {
      const p = getPhase(res.phases, name);
      expect(p.reached).toBe(true);
      expect(p.htm).toBe(0);
      expect(p.stm).toBe(0);
    }

    const oll = getPhase(res.phases, "oll");
    expect(oll.reached).toBe(true);
    expect(oll.htm).toBe(7);
    expect(oll.stm).toBe(7);
    expect(oll.tokens).toEqual(["R", "U", "R'", "U", "R", "U2", "R'"]);

    const pll = getPhase(res.phases, "pll");
    expect(pll.reached).toBe(true);
    expect(pll.htm).toBe(0);
    expect(pll.stm).toBe(0);
  });

  it("handles 1 pair (cross = 0, pair1 = 3 moves FR, compare optimal.length = 3)", () => {
    const res = analyzeSolve("R U R'", "R U' R'", { compare: true });

    expect("error" in res).toBe(false);
    if ("error" in res && res.error) {
      throw new Error(res.error);
    }

    expect(res.crossFace).toBe("D");
    expect(res.solvedAtEnd).toBe(true);

    const cross = getPhase(res.phases, "cross");
    expect(cross.reached).toBe(true);
    expect(cross.htm).toBe(0);
    expect(cross.optimal?.length).toBe(0);

    // FL, BL and BR are already solved when the cross completes, so they are the
    // 0-move pairs 1-3 and the FR pair the user actually inserted is pair4.
    for (const name of ["pair1", "pair2", "pair3"] as const) {
      expect(getPhase(res.phases, name).htm).toBe(0);
    }
    const pair1 = getPhase(res.phases, "pair4");
    expect(pair1.reached).toBe(true);
    expect(pair1.slot).toBe("FR");
    expect(pair1.htm).toBe(3);
    expect(pair1.stm).toBe(3);
    expect(pair1.tokens).toEqual(["R", "U'", "R'"]);
    expect(pair1.optimal?.length).toBe(3);
    expect(pair1.optimal?.truncated).toBe(false);

    // The X-cross comparison uses the first pair, here the pre-solved FL (0 moves).
    expect(res.xcross?.slot).toBe(getPhase(res.phases, "pair1").slot);
    expect(res.xcross?.length).toBe(0);

    for (const name of ["oll", "pll"] as const) {
      const p = getPhase(res.phases, name);
      expect(p.reached).toBe(true);
      expect(p.htm).toBe(0);
    }
  });

  // Regression (2026-11-22, found in the browser): a pair solved together with the
  // cross (X-cross) was reported as "not reached".
  it("counts a pair solved together with the cross as a 0-move pair", () => {
    const scramble = "F2 D2 L2 F U2 L D' L2 D2 R' L2 R2 B2 L' R L2 R2 B' F B2 R2 D' F' R2 U";
    const res = analyzeSolve(scramble, "R R' F U B U F2 R' D", { compare: true });
    if ("error" in res && res.error) {
      throw new Error(res.error);
    }

    const cross = getPhase(res.phases, "cross");
    expect(cross.reached).toBe(true);
    expect(cross.htm).toBe(9);
    expect(cross.optimal?.length).toBe(6);
    const pair1 = getPhase(res.phases, "pair1");
    expect(pair1.reached).toBe(true);
    expect(pair1.slot).toBe("BL");
    expect(pair1.htm).toBe(0);
    expect(res.xcross?.slot).toBe("BL");
    expect(res.xcross?.length).toBe(7);
    expect(getPhase(res.phases, "pair2").reached).toBe(false);
  });

  it("handles rotations (y2 L U' L' -> pair1 FR, HTM 3, STM 3)", () => {
    const res = analyzeSolve("R U R'", "y2 L U' L'", { compare: true });

    expect("error" in res).toBe(false);
    if ("error" in res && res.error) {
      throw new Error(res.error);
    }

    expect(res.crossFace).toBe("D");
    expect(res.solvedAtEnd).toBe(true);

    // FL, BL and BR are already solved when the cross completes, so they are the
    // 0-move pairs 1-3 and the FR pair the user actually inserted is pair4.
    for (const name of ["pair1", "pair2", "pair3"] as const) {
      expect(getPhase(res.phases, name).htm).toBe(0);
    }
    const pair1 = getPhase(res.phases, "pair4");
    expect(pair1.reached).toBe(true);
    expect(pair1.slot).toBe("FR");
    expect(pair1.htm).toBe(3);
    expect(pair1.stm).toBe(3);
    expect(pair1.tokens).toEqual(["y2", "L", "U'", "L'"]);
    expect(pair1.optimal?.length).toBe(3);
    expect(res.totals).toEqual({ htm: 3, stm: 3 });
  });

  it("matches cross-optimal.json first 5 cases (cross matches optimal, rest reached: false)", () => {
    const fixturePath = path.resolve(process.cwd(), "tests/fixtures/cross-optimal.json");
    const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as CrossFixtureFile;
    const firstFive = data.cases.slice(0, 5);
    expect(firstFive.length).toBe(5);

    for (let i = 0; i < firstFive.length; i += 1) {
      const item = firstFive[i];
      const crossSol = solveCross(item.scramble, "D");
      expect(crossSol.length).toBe(item.optimal.D);

      const res = analyzeSolve(item.scramble, crossSol.solution.join(" "), {
        crossFace: "D",
        compare: true,
      });

      expect("error" in res).toBe(false);
      if ("error" in res && res.error) {
        throw new Error(res.error);
      }

      expect(res.crossFace).toBe("D");
      expect(res.solvedAtEnd).toBe(false);

      const cross = getPhase(res.phases, "cross");
      expect(cross.reached).toBe(true);
      expect(cross.htm).toBe(crossSol.length);
      expect(cross.optimal?.length).toBe(item.optimal.D);

      for (const name of ["pair1", "pair2", "pair3", "pair4", "oll", "pll"] as const) {
        const p = getPhase(res.phases, name);
        expect(p.reached).toBe(false);
      }
    }

    // Verify auto-detection picks D on case 2 where D=4 is strictly optimal among all 6 faces
    const case2 = firstFive[1];
    const case2Cross = solveCross(case2.scramble, "D");
    const autoRes = analyzeSolve(case2.scramble, case2Cross.solution.join(" "));
    if ("error" in autoRes && autoRes.error) {
      throw new Error(autoRes.error);
    }
    expect(autoRes.crossFace).toBe("D");
    expect(getPhase(autoRes.phases, "cross").htm).toBe(4);
  });

  it("returns a user-friendly Japanese error for unreadable moves", () => {
    const res = analyzeSolve("R U R'", "R U Q");
    expect("error" in res).toBe(true);
    if ("error" in res && res.error) {
      expect(res.error.length).toBeGreaterThan(0);
      expect(res.error).toContain("Q");
    } else {
      throw new Error("Expected error result");
    }

    const scrambleErr = analyzeSolve("R U Q", "R U R'");
    expect("error" in scrambleErr).toBe(true);
  });

  it("counts slice/wide metrics, auto-detects non-D cross, and computes TPS from splits", () => {
    // Auto-detects L cross first (after U', L cross is solved while D cross is still broken until R')
    const lCross = analyzeSolve("R U", "U' R'");
    if ("error" in lCross && lCross.error) {
      throw new Error(lCross.error);
    }
    expect(lCross.crossFace).toBe("L");
    expect(getPhase(lCross.phases, "cross").htm).toBe(1);

    // Slice HTM=2, STM=1 and TPS with splits (including 0ms / null -> null)
    const sliceRes = analyzeSolve("M2", "M2", {
      splits: { crossMs: 1000, f2lMs: 2000, ollMs: 0, pllMs: null },
    });
    if ("error" in sliceRes && sliceRes.error) {
      throw new Error(sliceRes.error);
    }
    expect(sliceRes.totals).toEqual({ htm: 2, stm: 1 });
    const sliceCross = getPhase(sliceRes.phases, "cross");
    expect(sliceCross.htm).toBe(2);
    expect(sliceCross.stm).toBe(1);
    expect(sliceCross.tps).toBeCloseTo(1);
    expect(getPhase(sliceRes.phases, "pair1").tps).toBe(0);
    expect(getPhase(sliceRes.phases, "oll").tps).toBeNull();
    expect(getPhase(sliceRes.phases, "pll").tps).toBeNull();
  });
});
