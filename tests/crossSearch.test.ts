import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyAlgorithm,
  createSolvedCubeState,
  findCrossSolutionsFromScramble,
  isCrossSolved,
  type CubeColorName,
  type FaceName,
} from "../src/analyzer/cubeState";
import fixture from "./fixtures/cross-optimal.json";

// Optimal lengths come from tests/reference/cross_reference.py, an independent
// edge-only BFS written separately from src/analyzer.
const FACE_COLORS: Record<FaceName, CubeColorName> = {
  U: "yellow",
  D: "white",
  F: "blue",
  B: "green",
  R: "red",
  L: "orange",
};
const FACES: FaceName[] = ["D", "U", "F", "B", "R", "L"];

type Case = { scramble: string; optimal: Record<FaceName, number> };

describe("cross search matches the independent reference", () => {
  const dump: { scramble: string; face: FaceName; solution: string }[] = [];

  for (const [index, testCase] of (fixture.cases as Case[]).entries()) {
    it(`case ${index}: ${testCase.scramble}`, () => {
      const scrambleMoves = testCase.scramble.split(" ");

      for (const face of FACES) {
        const result = findCrossSolutionsFromScramble({
          crossColor: FACE_COLORS[face],
          targetFace: face,
          faceColorMap: FACE_COLORS,
          scrambleMoves,
        });
        const best = result.solutions[0];

        expect(result.truncated, `${face} truncated`).toBe(false);
        expect(best, `${face} has a solution`).toBeDefined();
        expect(best.moveCount, `${face} optimal length`).toBe(testCase.optimal[face]);

        const after = applyAlgorithm(
          createSolvedCubeState(FACE_COLORS),
          [...scrambleMoves, ...best.moves],
        );
        expect(isCrossSolved(after, FACE_COLORS[face], face), `${face} solved`).toBe(true);
        dump.push({ scramble: testCase.scramble, face, solution: best.moves.join(" ") });
      }
    });
  }

  it("writes solutions for the Python cross-check when asked", () => {
    if (process.env.CROSS_DUMP) {
      writeFileSync(process.env.CROSS_DUMP, JSON.stringify(dump));
    }
    expect(dump.length).toBe(fixture.cases.length * FACES.length);
  });
});
