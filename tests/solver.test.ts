import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACES,
  applyMoves,
  createSolvedState,
  isSolvedCross,
  isSolvedSlot,
  parseMoves,
  relabelMoves,
  SLOTS_LIST,
  toFaceTurns,
  type Face,
  type Slot,
} from "../src/analyzer/solver/cubie";
import {
  initPruningTables,
  solveBestXCross,
  solveCross,
  solvePair,
  solveXCross,
  solveXXCross,
} from "../src/analyzer/solver/search";

interface XCrossFixtureCase {
  scramble: string;
  dSlots: Record<Slot, number>;
  bestByFace: Record<Face, number>;
}

interface XCrossFixtureFile {
  generator: string;
  seed: number;
  metric: string;
  cases: XCrossFixtureCase[];
}

interface CrossFixtureCase {
  scramble: string;
  optimal: Record<Face, number>;
}

interface CrossFixtureFile {
  generator: string;
  seed: number;
  cases: CrossFixtureCase[];
}

interface XCrossDumpItem {
  scramble: string;
  face: Face;
  slot: Slot;
  solution: string;
}

describe("solver/cubie and pruning tables", () => {
  it("builds pruning tables within 5 seconds", () => {
    const t0 = performance.now();
    const tables = initPruningTables();
    const elapsedMs = performance.now() - t0;

    expect(tables.edgeTable.length).toBe(24 ** 5);
    expect(tables.cornerTable.length).toBe(24 ** 5);
    expect(tables.crossTable.length).toBe(24 ** 4);
    expect(elapsedMs).toBeLessThan(5000);
  });

  it("converts rotations, wide moves, and slice moves to fixed-center 18 face turns", () => {
    expect(toFaceTurns(parseMoves("y R y'")).faceTurns.join(" ")).toBe("B");
    expect(toFaceTurns(parseMoves("r U r'")).faceTurns.join(" ")).toBe("L F L'");
    expect(toFaceTurns(parseMoves("M2 U M2")).faceTurns.join(" ")).toBe("R2 L2 D R2 L2");
    expect(toFaceTurns(parseMoves("x2 U x2")).faceTurns.join(" ")).toBe("D");

    expect(() => parseMoves("R U X")).toThrow();
    expect(() => parseMoves("R3")).toThrow();
  });

  it("solves known small X-Cross examples (R U R' -> 3, R U R' U' -> 4)", () => {
    const scr1 = parseMoves("R U R'");
    const res1 = solveXCross(scr1, "D", "FR");
    expect(res1.length).toBe(3);
    expect(res1.truncated).toBe(false);
    const state1 = applyMoves(createSolvedState(), [...scr1, ...res1.solution]);
    expect(isSolvedCross(state1)).toBe(true);
    expect(isSolvedSlot(state1, "FR")).toBe(true);

    const scr2 = parseMoves("R U R' U'");
    const res2 = solveXCross(scr2, "D", "FR");
    expect(res2.length).toBe(4);
    expect(res2.truncated).toBe(false);
    const state2 = applyMoves(createSolvedState(), [...scr2, ...res2.solution]);
    expect(isSolvedCross(state2)).toBe(true);
    expect(isSolvedSlot(state2, "FR")).toBe(true);
  });

  it("solves single pair while preserving cross and keepSlots (solvePair) and XX-Cross (solveXXCross)", () => {
    const scr = parseMoves("R U R'");
    const pairRes = solvePair(scr, "D", "FR", ["FL", "BL", "BR"]);
    expect(pairRes.length).toBe(3);
    expect(pairRes.truncated).toBe(false);
    const stateAfterPair = applyMoves(createSolvedState(), [...scr, ...pairRes.solution]);
    expect(isSolvedCross(stateAfterPair)).toBe(true);
    for (const s of SLOTS_LIST) {
      expect(isSolvedSlot(stateAfterPair, s)).toBe(true);
    }

    const xxScramble = parseMoves("R U R' L' U' L");
    const xxRes = solveXXCross(xxScramble, "D", ["FR", "FL"]);
    expect(xxRes.truncated).toBe(false);
    expect(xxRes.length).toBeLessThanOrEqual(6);
    const stateAfterXX = applyMoves(createSolvedState(), [...xxScramble, ...xxRes.solution]);
    expect(isSolvedCross(stateAfterXX)).toBe(true);
    expect(isSolvedSlot(stateAfterXX, "FR")).toBe(true);
    expect(isSolvedSlot(stateAfterXX, "FL")).toBe(true);

    const truncatedRes = solveXXCross(xxScramble, "D", ["FR", "FL"], { maxNodes: 1 });
    expect(truncatedRes.truncated).toBe(true);
    expect(truncatedRes.length).toBeGreaterThanOrEqual(1);
  });
});

describe("solver fixtures verification", () => {
  it("matches tests/fixtures/cross-optimal.json for all cases and faces", () => {
    const fixturePath = path.resolve(process.cwd(), "tests/fixtures/cross-optimal.json");
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Fixture file not found: ${fixturePath}`);
    }
    const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as CrossFixtureFile;
    expect(data.cases.length).toBeGreaterThan(0);

    for (const item of data.cases) {
      const scrambleMoves = parseMoves(item.scramble);
      for (const face of ALL_FACES) {
        const res = solveCross(scrambleMoves, face);
        expect(res.length).toBe(item.optimal[face]);
        expect(res.truncated).toBe(false);

        const combinedD = relabelMoves([...scrambleMoves, ...res.solution], face);
        const state = applyMoves(createSolvedState(), combinedD);
        expect(isSolvedCross(state)).toBe(true);
      }
    }
  });

  it("matches tests/fixtures/xcross-optimal.json for all D slots and bestByFace within 2s per search", () => {
    const fixturePath = path.resolve(process.cwd(), "tests/fixtures/xcross-optimal.json");
    if (!fs.existsSync(fixturePath)) {
      throw new Error(`Fixture file not found: ${fixturePath}`);
    }
    const data = JSON.parse(fs.readFileSync(fixturePath, "utf-8")) as XCrossFixtureFile;
    expect(data.cases.length).toBeGreaterThan(0);

    initPruningTables();
    const dumpItems: XCrossDumpItem[] = [];

    for (const item of data.cases) {
      const scrambleMoves = parseMoves(item.scramble);

      // 1. Check all 4 D-face slots against dSlots
      for (const slot of SLOTS_LIST) {
        const t0 = performance.now();
        const res = solveXCross(scrambleMoves, "D", slot);
        const elapsedMs = performance.now() - t0;

        expect(elapsedMs).toBeLessThan(2000);
        expect(res.truncated).toBe(false);
        expect(res.length).toBe(item.dSlots[slot]);

        const finalState = applyMoves(createSolvedState(), [...scrambleMoves, ...res.solution]);
        expect(isSolvedCross(finalState)).toBe(true);
        expect(isSolvedSlot(finalState, slot)).toBe(true);

        dumpItems.push({
          scramble: item.scramble,
          face: "D",
          slot,
          solution: res.solution.join(" "),
        });
      }

      // 2. Check bestByFace across all 6 faces
      for (const face of ALL_FACES) {
        let bestLen = 999;
        for (const slot of SLOTS_LIST) {
          const t0 = performance.now();
          const res = solveXCross(scrambleMoves, face, slot);
          const elapsedMs = performance.now() - t0;

          expect(elapsedMs).toBeLessThan(2000);
          expect(res.truncated).toBe(false);
          if (res.length < bestLen) {
            bestLen = res.length;
          }

          const combinedD = relabelMoves([...scrambleMoves, ...res.solution], face);
          const finalState = applyMoves(createSolvedState(), combinedD);
          expect(isSolvedCross(finalState)).toBe(true);
          expect(isSolvedSlot(finalState, slot)).toBe(true);

          if (face !== "D") {
            dumpItems.push({
              scramble: item.scramble,
              face,
              slot,
              solution: res.solution.join(" "),
            });
          }
        }
        expect(bestLen).toBe(item.bestByFace[face]);

        const bestRes = solveBestXCross(scrambleMoves, face);
        expect(bestRes.length).toBe(item.bestByFace[face]);
        expect(bestRes.slots[bestRes.bestSlot].length).toBe(item.bestByFace[face]);
      }
    }

    const dumpPath = process.env.XCROSS_DUMP;
    if (dumpPath) {
      fs.writeFileSync(dumpPath, JSON.stringify(dumpItems, null, 2), "utf-8");
    }
  });
});
