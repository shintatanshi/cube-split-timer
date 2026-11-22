import { tokenizeAlgorithm } from "../../learn/moveNotation";

export type Face = "U" | "D" | "F" | "B" | "R" | "L";
export type Slot = "FR" | "FL" | "BL" | "BR";
export type MoveSuffix = "" | "'" | "2";
export type FaceMap = Record<Face, Face>;

export interface CubieState {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

export interface FaceTurnsResult {
  faceTurns: string[];
  moves: string[];
  orientation: FaceMap;
}

// Kociemba edge numbering: UR UF UL UB DR DF DL DB FR FL BL BR
export const UR = 0;
export const UF = 1;
export const UL = 2;
export const UB = 3;
export const DR = 4;
export const DF = 5;
export const DL = 6;
export const DB = 7;
export const FR = 8;
export const FL = 9;
export const BL = 10;
export const BR = 11;

// Kociemba corner numbering: URF UFL ULB UBR DFR DLF DBL DRB
export const URF = 0;
export const UFL = 1;
export const ULB = 2;
export const UBR = 3;
export const DFR = 4;
export const DLF = 5;
export const DBL = 6;
export const DRB = 7;

export const FACES: readonly Face[] = ["U", "R", "F", "D", "L", "B"];
export const ALL_FACES: readonly Face[] = ["D", "U", "F", "B", "R", "L"];
export const SLOTS_LIST: readonly Slot[] = ["FR", "FL", "BL", "BR"];

export const CROSS_EDGES: readonly number[] = [DR, DF, DL, DB];

export const SLOTS: Record<Slot, { corner: number; edge: number }> = {
  FR: { corner: DFR, edge: FR },
  FL: { corner: DLF, edge: FL },
  BL: { corner: DBL, edge: BL },
  BR: { corner: DRB, edge: BR },
};

export const EDGE_BASE: Record<Face, [number[], number[]]> = {
  U: [[UB, UR, UF, UL, DR, DF, DL, DB, FR, FL, BL, BR], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  R: [[FR, UF, UL, UB, BR, DF, DL, DB, DR, FL, BL, UR], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  F: [[UR, FL, UL, UB, DR, FR, DL, DB, UF, DF, BL, BR], [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0]],
  D: [[UR, UF, UL, UB, DF, DL, DB, DR, FR, FL, BL, BR], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  L: [[UR, UF, BL, UB, DR, DF, FL, DB, FR, UL, DL, BR], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  B: [[UR, UF, UL, BR, DR, DF, DL, BL, FR, FL, UB, DB], [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1]],
};

export const CORNER_BASE: Record<Face, [number[], number[]]> = {
  U: [[UBR, URF, UFL, ULB, DFR, DLF, DBL, DRB], [0, 0, 0, 0, 0, 0, 0, 0]],
  R: [[DFR, UFL, ULB, URF, DRB, DLF, DBL, UBR], [2, 0, 0, 1, 1, 0, 0, 2]],
  F: [[UFL, DLF, ULB, UBR, URF, DFR, DBL, DRB], [1, 2, 0, 0, 2, 1, 0, 0]],
  D: [[URF, UFL, ULB, UBR, DLF, DBL, DRB, DFR], [0, 0, 0, 0, 0, 0, 0, 0]],
  L: [[URF, ULB, DBL, UBR, DFR, UFL, DLF, DRB], [0, 1, 2, 0, 0, 2, 1, 0]],
  B: [[URF, UFL, UBR, DRB, DFR, DLF, ULB, DBL], [0, 0, 1, 2, 0, 0, 2, 1]],
};

export function compose(
  a: [readonly number[], readonly number[]],
  b: [readonly number[], readonly number[]],
  mod: number,
): [number[], number[]] {
  const [ap, ao] = a;
  const [bp, bo] = b;
  const n = ap.length;
  const np = new Array<number>(n);
  const no = new Array<number>(n);
  for (let i = 0; i < n; i += 1) {
    np[i] = ap[bp[i]];
    no[i] = (ao[bp[i]] + bo[i]) % mod;
  }
  return [np, no];
}

export const MOVE_NAMES: string[] = [];
export const EDGE_MOVES: Record<string, [number[], number[]]> = {};
export const CORNER_MOVES: Record<string, [number[], number[]]> = {};

for (const face of FACES) {
  let e: [number[], number[]] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ];
  let c: [number[], number[]] = [
    [0, 1, 2, 3, 4, 5, 6, 7],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];
  for (const suffix of ["", "2", "'"] as const) {
    e = compose(e, EDGE_BASE[face], 2);
    c = compose(c, CORNER_BASE[face], 3);
    const name = `${face}${suffix}`;
    MOVE_NAMES.push(name);
    EDGE_MOVES[name] = e;
    CORNER_MOVES[name] = c;
  }
}

function buildPieceMaps(
  moves: Record<string, [number[], number[]]>,
  n: number,
  mod: number,
): Record<string, Uint8Array> {
  const maps: Record<string, Uint8Array> = {};
  for (const [name, [perm, ori]] of Object.entries(moves)) {
    const table = new Uint8Array(n * mod);
    for (let i = 0; i < n; i += 1) {
      const p = perm[i];
      for (let o = 0; o < mod; o += 1) {
        table[p * mod + o] = i * mod + ((o + ori[i]) % mod);
      }
    }
    maps[name] = table;
  }
  return maps;
}

export const EDGE_MAP: Record<string, Uint8Array> = buildPieceMaps(EDGE_MOVES, 12, 2);
export const CORNER_MAP: Record<string, Uint8Array> = buildPieceMaps(CORNER_MOVES, 8, 3);

export function createSolvedState(): CubieState {
  return {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0, 0, 0, 0, 0, 0, 0, 0],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
}

export const SOLVED_STATE: CubieState = createSolvedState();

const VALID_MOVE_REGEX = /^(?:[URFDLBMESxyz]|[URFDLB]w|[urfdlb])(?:'|2)?$/;

export function parseMoves(text: string): string[] {
  // Same tokenizing as the rest of the app (learn/moveNotation): parentheses such as
  // "(U)", commas and line breaks are separators, and ’ ′ ` count as a prime.
  // "R2'" means the same as "R2".
  const tokens = tokenizeAlgorithm(text).map((token) => token.replace(/2'$/, "2"));
  for (const token of tokens) {
    if (!VALID_MOVE_REGEX.test(token)) {
      throw new Error(`Invalid move token: "${token}"`);
    }
  }
  return tokens;
}

const COMPOUND_EXPANSIONS: Record<string, readonly string[]> = {
  r: ["L", "x"],
  Rw: ["L", "x"],
  l: ["R", "x'"],
  Lw: ["R", "x'"],
  u: ["D", "y"],
  Uw: ["D", "y"],
  d: ["U", "y'"],
  Dw: ["U", "y'"],
  f: ["B", "z"],
  Fw: ["B", "z"],
  b: ["F", "z'"],
  Bw: ["F", "z'"],
  M: ["R", "L'", "x'"],
  E: ["U", "D'", "y'"],
  S: ["F'", "B", "z"],
};

function applySuffixToElementary(elementary: string, suffix: MoveSuffix): string {
  if (suffix === "") {
    return elementary;
  }
  const base = elementary[0];
  if (suffix === "2") {
    return `${base}2`;
  }
  // suffix === "'"
  return elementary.endsWith("'") ? base : `${base}'`;
}

function splitBaseAndSuffix(token: string): { base: string; suffix: MoveSuffix } {
  if (!VALID_MOVE_REGEX.test(token)) {
    throw new Error(`Invalid move token: "${token}"`);
  }
  const last = token[token.length - 1];
  if (last === "'" || last === "2") {
    return { base: token.slice(0, -1), suffix: last };
  }
  return { base: token, suffix: "" };
}

function applySingleRotationStep(ori: FaceMap, axis: "x" | "y" | "z"): FaceMap {
  if (axis === "x") {
    // R direction: F -> U -> B -> D -> F
    return {
      U: ori.F,
      B: ori.U,
      D: ori.B,
      F: ori.D,
      R: ori.R,
      L: ori.L,
    };
  }
  if (axis === "y") {
    // U direction: F -> L -> B -> R -> F
    return {
      U: ori.U,
      D: ori.D,
      L: ori.F,
      B: ori.L,
      R: ori.B,
      F: ori.R,
    };
  }
  // z (F direction: U -> R -> D -> L -> U)
  return {
    R: ori.U,
    D: ori.R,
    L: ori.D,
    U: ori.L,
    F: ori.F,
    B: ori.B,
  };
}

function applyRotation(ori: FaceMap, axis: "x" | "y" | "z", suffix: MoveSuffix): FaceMap {
  const steps = suffix === "" ? 1 : suffix === "2" ? 2 : 3;
  let next = ori;
  for (let i = 0; i < steps; i += 1) {
    next = applySingleRotationStep(next, axis);
  }
  return next;
}

function isFace(value: string): value is Face {
  return (
    value === "U" ||
    value === "R" ||
    value === "F" ||
    value === "D" ||
    value === "L" ||
    value === "B"
  );
}

export function toFaceTurns(moves: readonly string[] | string): FaceTurnsResult {
  const tokens = typeof moves === "string" ? parseMoves(moves) : moves;
  let orientation: FaceMap = {
    U: "U",
    D: "D",
    F: "F",
    B: "B",
    R: "R",
    L: "L",
  };
  const faceTurns: string[] = [];

  const processToken = (token: string): void => {
    const { base, suffix } = splitBaseAndSuffix(token);
    if (isFace(base)) {
      const actualFace = orientation[base];
      faceTurns.push(`${actualFace}${suffix}`);
      return;
    }
    if (base === "x" || base === "y" || base === "z") {
      orientation = applyRotation(orientation, base, suffix);
      return;
    }
    const expansion = COMPOUND_EXPANSIONS[base];
    if (!expansion) {
      throw new Error(`Unsupported move token: "${token}"`);
    }
    for (const elem of expansion) {
      processToken(applySuffixToElementary(elem, suffix));
    }
  };

  for (const token of tokens) {
    processToken(token);
  }

  return {
    faceTurns,
    moves: faceTurns,
    orientation,
  };
}

export function applyMoves(state: CubieState, faceTurns: readonly string[] | string): CubieState {
  const rawTokens = typeof faceTurns === "string" ? parseMoves(faceTurns) : faceTurns;
  let turns: readonly string[] = rawTokens;
  for (const t of rawTokens) {
    if (!(t in EDGE_MOVES)) {
      turns = toFaceTurns(rawTokens).faceTurns;
      break;
    }
  }

  let ep = state.ep.slice();
  let eo = state.eo.slice();
  let cp = state.cp.slice();
  let co = state.co.slice();

  for (const m of turns) {
    const em = EDGE_MOVES[m];
    const cm = CORNER_MOVES[m];
    if (!em || !cm) {
      throw new Error(`Invalid face turn: "${m}"`);
    }
    [ep, eo] = compose([ep, eo], em, 2);
    [cp, co] = compose([cp, co], cm, 3);
  }

  return { cp, co, ep, eo };
}

export function isSolvedCross(state: CubieState): boolean {
  for (const edge of CROSS_EDGES) {
    if (state.ep[edge] !== edge || state.eo[edge] !== 0) {
      return false;
    }
  }
  return true;
}

export function isSolvedSlot(state: CubieState, slot: Slot): boolean {
  const { corner, edge } = SLOTS[slot];
  return (
    state.cp[corner] === corner &&
    state.co[corner] === 0 &&
    state.ep[edge] === edge &&
    state.eo[edge] === 0
  );
}

// Relabel so that the named face becomes D (rotation; directions preserved)
export const MAPS: Record<Face, Partial<Record<Face, Face>>> = {
  D: {},
  U: { U: "D", D: "U", F: "B", B: "F" },
  F: { F: "D", D: "B", B: "U", U: "F" },
  B: { B: "D", D: "F", F: "U", U: "B" },
  R: { R: "D", D: "L", L: "U", U: "R" },
  L: { L: "D", D: "R", R: "U", U: "L" },
};

export const INVERSE_MAPS: Record<Face, Partial<Record<Face, Face>>> = {
  D: {},
  U: { D: "U", U: "D", B: "F", F: "B" },
  F: { D: "F", B: "D", U: "B", F: "U" },
  B: { D: "B", F: "D", U: "F", B: "U" },
  R: { D: "R", L: "D", U: "L", R: "U" },
  L: { D: "L", R: "D", U: "R", L: "U" },
};

// U-D rotation map that moves each D-layer slot to FR
export const SLOT_Y_MAPS: Record<Slot, FaceMap> = {
  FR: { U: "U", D: "D", F: "F", R: "R", B: "B", L: "L" },
  FL: { U: "U", D: "D", F: "R", R: "B", B: "L", L: "F" },
  BL: { U: "U", D: "D", F: "B", R: "L", B: "F", L: "R" },
  BR: { U: "U", D: "D", F: "L", R: "F", B: "R", L: "B" },
};

export function relabelMoveByMap(move: string, map: Partial<Record<Face, Face>>): string {
  const face = move[0] as Face;
  const mapped = map[face] ?? face;
  return mapped + move.slice(1);
}

export function relabelMovesByMap(
  moves: readonly string[],
  map: Partial<Record<Face, Face>>,
): string[] {
  return moves.map((m) => relabelMoveByMap(m, map));
}

export function relabelMove(move: string, face: Face): string {
  return relabelMoveByMap(move, MAPS[face]);
}

export function relabelMoves(moves: readonly string[], face: Face): string[] {
  return relabelMovesByMap(moves, MAPS[face]);
}

export function unrelabelMove(move: string, face: Face): string {
  return relabelMoveByMap(move, INVERSE_MAPS[face]);
}

export function unrelabelMoves(moves: readonly string[], face: Face): string[] {
  return relabelMovesByMap(moves, INVERSE_MAPS[face]);
}
