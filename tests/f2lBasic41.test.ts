import { describe, expect, it } from "vitest";
import { BASIC_F2L_41_CASES } from "../src/analyzer/f2lBasic41";
import {
  SLOTS_LIST,
  applyMoves,
  createSolvedState,
  isSolvedCross,
  isSolvedSlot,
  parseMoves,
  toFaceTurns,
} from "../src/analyzer/solver";

// The analyzer F2L plan itself is checked in the browser (it takes minutes in Node).

describe("basic 41 F2L algorithms", () => {
  it("each inserts exactly one pair without breaking the cross or other slots", () => {
    for (const c of BASIC_F2L_41_CASES) {
      const s = applyMoves(createSolvedState(), toFaceTurns(parseMoves(c.alg)).faceTurns);
      const broken = SLOTS_LIST.filter((slot) => !isSolvedSlot(s, slot));
      expect(isSolvedCross(s), c.id).toBe(true);
      expect(broken.length, c.id).toBe(1);
    }
  });

  // 2026-11-22: padded algorithms (e.g. F2L_33 "R U' R' U R U2 R'" for an "R U2 R'"
  // case, F2L_41 at 11 moves) were replaced with shorter R/U/F(/L) ones.
  it("has no padded algorithms (all at most 8 moves)", () => {
    const tooLong = BASIC_F2L_41_CASES.filter((c) => parseMoves(c.alg).length > 8);
    expect(tooLong.map((c) => `${c.id}: ${c.alg}`)).toEqual([]);
  });
});
