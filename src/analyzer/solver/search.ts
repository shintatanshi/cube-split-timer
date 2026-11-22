import {
  DB,
  DF,
  DFR,
  DL,
  DR,
  FR,
  MOVE_NAMES,
  relabelMoves,
  SLOTS_LIST,
  toFaceTurns,
  unrelabelMoves,
  type Face,
  type Slot,
} from "./cubie";
import {
  BASE,
  buildPruningTables,
  CROSS_TABLE_SIZE,
  getPruningTables,
  initPruningTables,
  PAIR_SPACE,
} from "./tables";

export { buildPruningTables, getPruningTables, initPruningTables };

export interface SearchOptions {
  maxDepth?: number;
  maxNodes?: number;
}

export interface SearchResult {
  length: number;
  solution: string[];
  nodes: number;
  truncated: boolean;
}

export interface BestXCrossResult {
  face: Face;
  bestSlot: Slot;
  bestLength: number;
  length: number;
  solution: string[];
  slots: Record<Slot, SearchResult>;
}

const DEFAULT_MAX_DEPTH = 14;
const DEFAULT_MAX_NODES = 5_000_000;

interface SlotFrameState {
  slot: Slot;
  lowPair: number;
  highPair: number;
  slotEdge: number;
  slotCorner: number;
}

const MOVE_INDEX_BY_NAME: Record<string, number> = {};
MOVE_NAMES.forEach((name, idx) => {
  MOVE_INDEX_BY_NAME[name] = idx;
});

function initialSlotFrameState(dFrameMoves: readonly number[], slot: Slot): SlotFrameState {
  const { pairMap0, edgeMapFlat, cornerMapFlat, slotMoveIdx } = getPruningTables();
  const moveMap = slotMoveIdx[slot];

  let lowPair = DR * 2 + DF * 2 * BASE;
  let highPair = DL * 2 + DB * 2 * BASE;
  let slotEdge = FR * 2;
  let slotCorner = DFR * 3;

  for (let i = 0; i < dFrameMoves.length; i += 1) {
    const m = moveMap[dFrameMoves[i]];
    lowPair = pairMap0[lowPair * 18 + m];
    highPair = pairMap0[highPair * 18 + m];
    slotEdge = edgeMapFlat[slotEdge * 18 + m];
    slotCorner = cornerMapFlat[slotCorner * 18 + m];
  }

  return {
    slot,
    lowPair,
    highPair,
    slotEdge,
    slotCorner,
  };
}

function normalizeToDFrameMoveIndices(moves: readonly string[] | string, face: Face): number[] {
  const { faceTurns } = toFaceTurns(moves);
  const dMoves = relabelMoves(faceTurns, face);
  const indices = new Array<number>(dMoves.length);
  for (let i = 0; i < dMoves.length; i += 1) {
    const idx = MOVE_INDEX_BY_NAME[dMoves[i]];
    if (idx === undefined) {
      throw new Error(`Invalid move in D-frame: "${dMoves[i]}"`);
    }
    indices[i] = idx;
  }
  return indices;
}

/**
 * Specialized single-slot IDA* search for X-cross (4 cross edges + 1 slot).
 */
export function solveXCross(
  moves: readonly string[] | string,
  face: Face,
  slot: Slot,
  options?: SearchOptions,
): SearchResult {
  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_NODES;
  const tables = getPruningTables();
  const { edgeTable, cornerTable, pairMap0, edgeMapFlat, cornerMapFlat, slotMoveIdx } = tables;
  const moveMap = slotMoveIdx[slot];

  const dMoveIndices = normalizeToDFrameMoveIndices(moves, face);
  const init = initialSlotFrameState(dMoveIndices, slot);

  const heuristic = (low: number, high: number, se: number, sc: number): number => {
    const crossCode = low + high * PAIR_SPACE;
    const eh = edgeTable[crossCode + se * CROSS_TABLE_SIZE];
    const ch = cornerTable[crossCode + sc * CROSS_TABLE_SIZE];
    return eh > ch ? eh : ch;
  };

  const path: number[] = [];
  let nodes = 0;
  let truncated = false;

  const dfs = (
    low: number,
    high: number,
    se: number,
    sc: number,
    g: number,
    bound: number,
    lastFace: number,
  ): number => {
    const h = heuristic(low, high, se, sc);
    const f = g + h;
    if (f > bound) {
      return f;
    }
    if (h === 0) {
      return -1;
    }
    if (nodes >= maxNodes) {
      truncated = true;
      return 999;
    }
    nodes += 1;

    let best = 999;
    const lowBase = low * 18;
    const highBase = high * 18;
    const edgeBase = se * 18;
    const cornerBase = sc * 18;

    for (let m = 0; m < 18; m += 1) {
      const mFace = (m / 3) | 0;
      if (mFace === lastFace || (mFace >= 3 && lastFace === mFace - 3)) {
        continue;
      }
      const sm = moveMap[m];
      const nLow = pairMap0[lowBase + sm];
      const nHigh = pairMap0[highBase + sm];
      const nEdge = edgeMapFlat[edgeBase + sm];
      const nCorner = cornerMapFlat[cornerBase + sm];

      path.push(m);
      const t = dfs(nLow, nHigh, nEdge, nCorner, g + 1, bound, mFace);
      if (t === -1) {
        return -1;
      }
      path.pop();
      if (truncated) {
        return best;
      }
      if (t < best) {
        best = t;
      }
    }
    return best;
  };

  let bound = heuristic(init.lowPair, init.highPair, init.slotEdge, init.slotCorner);
  while (bound <= maxDepth) {
    const t = dfs(init.lowPair, init.highPair, init.slotEdge, init.slotCorner, 0, bound, -1);
    if (t === -1) {
      const dSolution = path.map((idx) => MOVE_NAMES[idx]);
      const solution = unrelabelMoves(dSolution, face);
      return {
        length: solution.length,
        solution,
        nodes,
        truncated: false,
      };
    }
    if (truncated || t >= 999) {
      return {
        length: bound,
        solution: [],
        nodes,
        truncated: true,
      };
    }
    bound = t;
  }

  return {
    length: bound,
    solution: [],
    nodes,
    truncated: true,
  };
}

/**
 * Solves all 4 slots for the given face and returns per-slot results and the best slot.
 */
export function solveBestXCross(
  moves: readonly string[] | string,
  face: Face,
  options?: SearchOptions,
): BestXCrossResult {
  const slots = {} as Record<Slot, SearchResult>;
  let bestSlot: Slot = "FR";
  let bestResult: SearchResult | null = null;

  for (const slot of SLOTS_LIST) {
    const res = solveXCross(moves, face, slot, options);
    slots[slot] = res;
    if (!bestResult || res.length < bestResult.length) {
      bestResult = res;
      bestSlot = slot;
    }
  }

  return {
    face,
    bestSlot,
    bestLength: bestResult!.length,
    length: bestResult!.length,
    solution: bestResult!.solution,
    slots,
  };
}

/**
 * Generalized multi-slot IDA* search used by solvePair and solveXXCross.
 * Uses the FR tables via y-rotation for all tracked slots; goal is when cross + all tracked slots are solved.
 */
function solveMultiSlots(
  moves: readonly string[] | string,
  face: Face,
  targetSlots: readonly Slot[],
  heuristicSlots: readonly Slot[],
  options?: SearchOptions,
): SearchResult {
  const uniqueTargetSlots = Array.from(new Set(targetSlots));
  if (uniqueTargetSlots.length === 1) {
    return solveXCross(moves, face, uniqueTargetSlots[0], options);
  }

  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_NODES;
  const tables = getPruningTables();
  const { edgeTable, cornerTable, pairMap0, edgeMapFlat, cornerMapFlat, slotMoveIdx } = tables;

  const dMoveIndices = normalizeToDFrameMoveIndices(moves, face);
  const k = uniqueTargetSlots.length;
  const initStates = uniqueTargetSlots.map((s) => initialSlotFrameState(dMoveIndices, s));
  const moveMaps = uniqueTargetSlots.map((s) => slotMoveIdx[s]);
  const inHeuristic = uniqueTargetSlots.map((s) => heuristicSlots.includes(s));

  const initLow = new Int32Array(k);
  const initHigh = new Int32Array(k);
  const initEdge = new Int32Array(k);
  const initCorner = new Int32Array(k);
  for (let i = 0; i < k; i += 1) {
    initLow[i] = initStates[i].lowPair;
    initHigh[i] = initStates[i].highPair;
    initEdge[i] = initStates[i].slotEdge;
    initCorner[i] = initStates[i].slotCorner;
  }

  const stackStride = k;
  const maxStackDepth = maxDepth + 2;
  const lowStack = new Int32Array(maxStackDepth * stackStride);
  const highStack = new Int32Array(maxStackDepth * stackStride);
  const edgeStack = new Int32Array(maxStackDepth * stackStride);
  const cornerStack = new Int32Array(maxStackDepth * stackStride);

  lowStack.set(initLow, 0);
  highStack.set(initHigh, 0);
  edgeStack.set(initEdge, 0);
  cornerStack.set(initCorner, 0);

  const evalState = (offset: number): { h: number; solved: boolean } => {
    let maxH = 0;
    let allSolved = true;
    for (let i = 0; i < k; i += 1) {
      const idx = offset + i;
      const crossCode = lowStack[idx] + highStack[idx] * PAIR_SPACE;
      const eh = edgeTable[crossCode + edgeStack[idx] * CROSS_TABLE_SIZE];
      const ch = cornerTable[crossCode + cornerStack[idx] * CROSS_TABLE_SIZE];
      const sh = eh > ch ? eh : ch;
      if (sh !== 0) {
        allSolved = false;
      }
      if (inHeuristic[i] && sh > maxH) {
        maxH = sh;
      }
    }
    if (!allSolved && maxH === 0) {
      maxH = 1;
    }
    return { h: maxH, solved: allSolved };
  };

  const path: number[] = [];
  let nodes = 0;
  let truncated = false;

  const dfs = (g: number, bound: number, lastFace: number): number => {
    const offset = g * stackStride;
    const { h, solved } = evalState(offset);
    const f = g + h;
    if (f > bound) {
      return f;
    }
    if (solved) {
      return -1;
    }
    if (nodes >= maxNodes) {
      truncated = true;
      return 999;
    }
    nodes += 1;

    let best = 999;
    const nextOffset = (g + 1) * stackStride;

    for (let m = 0; m < 18; m += 1) {
      const mFace = (m / 3) | 0;
      if (mFace === lastFace || (mFace >= 3 && lastFace === mFace - 3)) {
        continue;
      }

      for (let i = 0; i < k; i += 1) {
        const curIdx = offset + i;
        const nxtIdx = nextOffset + i;
        const sm = moveMaps[i][m];
        lowStack[nxtIdx] = pairMap0[lowStack[curIdx] * 18 + sm];
        highStack[nxtIdx] = pairMap0[highStack[curIdx] * 18 + sm];
        edgeStack[nxtIdx] = edgeMapFlat[edgeStack[curIdx] * 18 + sm];
        cornerStack[nxtIdx] = cornerMapFlat[cornerStack[curIdx] * 18 + sm];
      }

      path.push(m);
      const t = dfs(g + 1, bound, mFace);
      if (t === -1) {
        return -1;
      }
      path.pop();
      if (truncated) {
        return best;
      }
      if (t < best) {
        best = t;
      }
    }

    return best;
  };

  let bound = evalState(0).h;
  while (bound <= maxDepth) {
    const t = dfs(0, bound, -1);
    if (t === -1) {
      const dSolution = path.map((idx) => MOVE_NAMES[idx]);
      const solution = unrelabelMoves(dSolution, face);
      return {
        length: solution.length,
        solution,
        nodes,
        truncated: false,
      };
    }
    if (truncated || t >= 999) {
      return {
        length: bound,
        solution: [],
        nodes,
        truncated: true,
      };
    }
    bound = t;
  }

  return {
    length: bound,
    solution: [],
    nodes,
    truncated: true,
  };
}

/**
 * Shortest solution to insert `slot` while keeping the cross and `keepSlots` solved.
 * Goal: cross + keepSlots + slot all solved.
 * Heuristic: max of slot's 2 tables (and keepSlots' tables for admissibility).
 */
export function solvePair(
  moves: readonly string[] | string,
  face: Face,
  slot: Slot,
  keepSlots: readonly Slot[],
  options?: SearchOptions,
): SearchResult {
  const allSlots: Slot[] = [slot, ...keepSlots];
  return solveMultiSlots(moves, face, allSlots, allSlots, options);
}

/**
 * Shortest solution for XX-Cross (cross + 2 F2L pairs).
 * Heuristic: max of the 4 tables (2 per slot).
 * If maxNodes is exceeded, returns truncated: true and the best lower bound on length reached so far.
 */
export function solveXXCross(
  moves: readonly string[] | string,
  face: Face,
  slots: [Slot, Slot],
  options?: SearchOptions,
): SearchResult {
  return solveMultiSlots(moves, face, slots, slots, options);
}

/**
 * Exact optimal Cross solver using the exact 4-edge BFS table.
 */
export function solveCross(
  moves: readonly string[] | string,
  face: Face = "D",
  options?: SearchOptions,
): SearchResult {
  const maxDepth = options?.maxDepth ?? 8;
  const { crossTable, pairMap0 } = getPruningTables();
  const dMoveIndices = normalizeToDFrameMoveIndices(moves, face);

  let lowPair = DR * 2 + DF * 2 * BASE;
  let highPair = DL * 2 + DB * 2 * BASE;

  for (let i = 0; i < dMoveIndices.length; i += 1) {
    const m = dMoveIndices[i];
    lowPair = pairMap0[lowPair * 18 + m];
    highPair = pairMap0[highPair * 18 + m];
  }

  const startDist = crossTable[lowPair + highPair * PAIR_SPACE];
  if (startDist > maxDepth) {
    return {
      length: startDist,
      solution: [],
      nodes: 0,
      truncated: true,
    };
  }

  const dSolution: string[] = [];
  let curLow = lowPair;
  let curHigh = highPair;
  let curDist = startDist;
  let nodes = 0;

  while (curDist > 0) {
    nodes += 1;
    const lowBase = curLow * 18;
    const highBase = curHigh * 18;
    for (let m = 0; m < 18; m += 1) {
      const nLow = pairMap0[lowBase + m];
      const nHigh = pairMap0[highBase + m];
      if (crossTable[nLow + nHigh * PAIR_SPACE] === curDist - 1) {
        dSolution.push(MOVE_NAMES[m]);
        curLow = nLow;
        curHigh = nHigh;
        curDist -= 1;
        break;
      }
    }
  }

  const solution = unrelabelMoves(dSolution, face);
  return {
    length: solution.length,
    solution,
    nodes,
    truncated: false,
  };
}
