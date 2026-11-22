import {
  CORNER_MAP,
  DB,
  DF,
  DFR,
  DL,
  DR,
  EDGE_MAP,
  FR,
  MOVE_NAMES,
  SLOT_Y_MAPS,
  type Slot,
} from "./cubie";

export const BASE = 24;
export const PAIR_SPACE = BASE * BASE; // 576
export const CROSS_TABLE_SIZE = PAIR_SPACE * PAIR_SPACE; // 331,776
export const XCROSS_TABLE_SIZE = CROSS_TABLE_SIZE * BASE; // 7,962,624

export interface PruningTables {
  /** Exact BFS distance for D-cross (4 edges) + FR edge (24^5 = 7,962,624 bytes) */
  edgeTable: Uint8Array;
  /** Exact BFS distance for D-cross (4 edges) + DFR corner (24^5 = 7,962,624 bytes) */
  cornerTable: Uint8Array;
  /** Exact BFS distance for D-cross (4 edges) only (24^4 = 331,776 bytes) */
  crossTable: Uint8Array;
  /** 2-edge transition lookup: pairMap0[pair * 18 + moveIdx] -> nextPair (0..575) */
  pairMap0: Int32Array;
  /** Single edge transition lookup: edgeMapFlat[code * 18 + moveIdx] -> nextCode (0..23) */
  edgeMapFlat: Int32Array;
  /** Single corner transition lookup: cornerMapFlat[code * 18 + moveIdx] -> nextCode (0..23) */
  cornerMapFlat: Int32Array;
  /** Move index remapping under each slot's y-rotation to FR: slotMoveIdx[slot][moveIdx] */
  slotMoveIdx: Record<Slot, Uint8Array>;
}

let cachedTables: PruningTables | null = null;

export function encodeDigits(digits: readonly number[]): number {
  let code = 0;
  let weight = 1;
  for (let i = 0; i < digits.length; i += 1) {
    code += digits[i] * weight;
    weight *= BASE;
  }
  return code;
}

export function buildPruningTables(): PruningTables {
  if (cachedTables) {
    return cachedTables;
  }

  const moveIndexByName = new Map<string, number>();
  MOVE_NAMES.forEach((name, idx) => {
    moveIndexByName.set(name, idx);
  });

  const edgeMapFlat = new Int32Array(BASE * 18);
  const cornerMapFlat = new Int32Array(BASE * 18);
  const edgeFifthMap = new Int32Array(BASE * 18);
  const cornerFifthMap = new Int32Array(BASE * 18);

  for (let code = 0; code < BASE; code += 1) {
    for (let m = 0; m < 18; m += 1) {
      const name = MOVE_NAMES[m];
      const nextEdge = EDGE_MAP[name][code];
      const nextCorner = CORNER_MAP[name][code];
      edgeMapFlat[code * 18 + m] = nextEdge;
      cornerMapFlat[code * 18 + m] = nextCorner;
      edgeFifthMap[code * 18 + m] = nextEdge * CROSS_TABLE_SIZE;
      cornerFifthMap[code * 18 + m] = nextCorner * CROSS_TABLE_SIZE;
    }
  }

  const pairMap0 = new Int32Array(PAIR_SPACE * 18);
  const pairMap1 = new Int32Array(PAIR_SPACE * 18);

  for (let d1 = 0; d1 < BASE; d1 += 1) {
    for (let d0 = 0; d0 < BASE; d0 += 1) {
      const pair = d0 + BASE * d1;
      for (let m = 0; m < 18; m += 1) {
        const nextPair = edgeMapFlat[d0 * 18 + m] + BASE * edgeMapFlat[d1 * 18 + m];
        pairMap0[pair * 18 + m] = nextPair;
        pairMap1[pair * 18 + m] = nextPair * PAIR_SPACE;
      }
    }
  }

  // Max reachable states in cornerTable is 4,561,920; share one FIFO queue across all 3 BFS builds
  const queue = new Int32Array(4_600_000);

  // 1. Build 4-edge crossTable
  const crossTable = new Uint8Array(CROSS_TABLE_SIZE);
  crossTable.fill(255);
  const solvedLowPair = DR * 2 + DF * 2 * BASE;
  const solvedHighPair = DL * 2 + DB * 2 * BASE;
  const crossStart = solvedLowPair + solvedHighPair * PAIR_SPACE;

  crossTable[crossStart] = 0;
  let head = 0;
  let tail = 0;
  queue[tail++] = crossStart;

  while (head < tail) {
    const s = queue[head++];
    const nextDepth = crossTable[s] + 1;
    const highPair = (s / PAIR_SPACE) | 0;
    const lowPair = s - highPair * PAIR_SPACE;
    const base0 = lowPair * 18;
    const base1 = highPair * 18;
    for (let m = 0; m < 18; m += 1) {
      const ns = pairMap0[base0 + m] + pairMap1[base1 + m];
      if (crossTable[ns] === 255) {
        crossTable[ns] = nextDepth;
        queue[tail++] = ns;
      }
    }
  }

  // 2. Build 5-edge FR X-cross edgeTable
  const edgeTable = new Uint8Array(XCROSS_TABLE_SIZE);
  edgeTable.fill(255);
  const edgeStart = crossStart + FR * 2 * CROSS_TABLE_SIZE;

  edgeTable[edgeStart] = 0;
  head = 0;
  tail = 0;
  queue[tail++] = edgeStart;

  while (head < tail) {
    const s = queue[head++];
    const nextDepth = edgeTable[s] + 1;
    const d4 = (s / CROSS_TABLE_SIZE) | 0;
    const rem = s - d4 * CROSS_TABLE_SIZE;
    const highPair = (rem / PAIR_SPACE) | 0;
    const lowPair = rem - highPair * PAIR_SPACE;
    const base0 = lowPair * 18;
    const base1 = highPair * 18;
    const base4 = d4 * 18;
    for (let m = 0; m < 18; m += 1) {
      const ns = pairMap0[base0 + m] + pairMap1[base1 + m] + edgeFifthMap[base4 + m];
      if (edgeTable[ns] === 255) {
        edgeTable[ns] = nextDepth;
        queue[tail++] = ns;
      }
    }
  }

  // 3. Build 4-edge + DFR corner FR X-cross cornerTable
  const cornerTable = new Uint8Array(XCROSS_TABLE_SIZE);
  cornerTable.fill(255);
  const cornerStart = crossStart + DFR * 3 * CROSS_TABLE_SIZE;

  cornerTable[cornerStart] = 0;
  head = 0;
  tail = 0;
  queue[tail++] = cornerStart;

  while (head < tail) {
    const s = queue[head++];
    const nextDepth = cornerTable[s] + 1;
    const d4 = (s / CROSS_TABLE_SIZE) | 0;
    const rem = s - d4 * CROSS_TABLE_SIZE;
    const highPair = (rem / PAIR_SPACE) | 0;
    const lowPair = rem - highPair * PAIR_SPACE;
    const base0 = lowPair * 18;
    const base1 = highPair * 18;
    const base4 = d4 * 18;
    for (let m = 0; m < 18; m += 1) {
      const ns = pairMap0[base0 + m] + pairMap1[base1 + m] + cornerFifthMap[base4 + m];
      if (cornerTable[ns] === 255) {
        cornerTable[ns] = nextDepth;
        queue[tail++] = ns;
      }
    }
  }

  const slotMoveIdx = {} as Record<Slot, Uint8Array>;
  for (const slot of ["FR", "FL", "BL", "BR"] as const) {
    const yMap = SLOT_Y_MAPS[slot];
    const table = new Uint8Array(18);
    for (let m = 0; m < 18; m += 1) {
      const name = MOVE_NAMES[m];
      const mappedFace = yMap[name[0] as keyof typeof yMap];
      const mappedName = mappedFace + name.slice(1);
      table[m] = moveIndexByName.get(mappedName)!;
    }
    slotMoveIdx[slot] = table;
  }

  cachedTables = {
    edgeTable,
    cornerTable,
    crossTable,
    pairMap0,
    edgeMapFlat,
    cornerMapFlat,
    slotMoveIdx,
  };

  return cachedTables;
}

export const getPruningTables = buildPruningTables;
export const initPruningTables = buildPruningTables;
