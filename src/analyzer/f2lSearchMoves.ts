import type { F2lSlotName } from "./cubeState";

export type F2lSearchMoveSetMode = "light" | "standard" | "wide";

const U_MOVES = ["U", "U'", "U2"] as const;

const FR_LIGHT_MOVES = ["R", "R'", "R2", "F", "F'", "F2"] as const;
const FL_LIGHT_MOVES = ["L", "L'", "L2", "F", "F'", "F2"] as const;
const BR_LIGHT_MOVES = ["R", "R'", "R2", "B", "B'", "B2"] as const;
const BL_LIGHT_MOVES = ["L", "L'", "L2", "B", "B'", "B2"] as const;

const D_MOVES = ["D", "D'", "D2"] as const;

const ALL_FACE_MOVES = [
  "U",
  "U'",
  "U2",
  "D",
  "D'",
  "D2",
  "R",
  "R'",
  "R2",
  "L",
  "L'",
  "L2",
  "F",
  "F'",
  "F2",
  "B",
  "B'",
  "B2",
] as const;

export type FaceTurnMove = (typeof ALL_FACE_MOVES)[number];

const LIGHT_MOVE_SETS: Record<F2lSlotName, FaceTurnMove[]> = {
  FR: [...U_MOVES, ...FR_LIGHT_MOVES],
  FL: [...U_MOVES, ...FL_LIGHT_MOVES],
  BR: [...U_MOVES, ...BR_LIGHT_MOVES],
  BL: [...U_MOVES, ...BL_LIGHT_MOVES],
};

const STANDARD_MOVE_SETS: Record<F2lSlotName, FaceTurnMove[]> = {
  FR: [...U_MOVES, ...FR_LIGHT_MOVES, ...D_MOVES],
  FL: [...U_MOVES, ...FL_LIGHT_MOVES, ...D_MOVES],
  BR: [...U_MOVES, ...BR_LIGHT_MOVES, ...D_MOVES],
  BL: [...U_MOVES, ...BL_LIGHT_MOVES, ...D_MOVES],
};

const WIDE_MOVE_SETS: Record<F2lSlotName, FaceTurnMove[]> = {
  FR: [...ALL_FACE_MOVES],
  FL: [...ALL_FACE_MOVES],
  BR: [...ALL_FACE_MOVES],
  BL: [...ALL_FACE_MOVES],
};

export function getF2lSearchMoves(
  slotName: F2lSlotName,
  mode: F2lSearchMoveSetMode = "light",
): FaceTurnMove[] {
  if (mode === "wide") {
    return WIDE_MOVE_SETS[slotName];
  }

  if (mode === "standard") {
    return STANDARD_MOVE_SETS[slotName];
  }

  return LIGHT_MOVE_SETS[slotName];
}

export function getMoveFace(move: string): string {
  return move[0] ?? "";
}

export function shouldSkipRepeatedFaceMove(move: string, lastMove: string | null): boolean {
  if (!lastMove) {
    return false;
  }

  return getMoveFace(move) === getMoveFace(lastMove);
}