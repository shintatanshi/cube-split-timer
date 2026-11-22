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
  UB,
  UBR,
  UF,
  UFL,
  UL,
  ULB,
  UR,
  URF,
  type CubieState,
  type Face,
  type Slot,
} from "./cubie";
import { solveCross, solvePair, solveXCross, type SearchOptions } from "./search";

export type PhaseName = "cross" | "pair1" | "pair2" | "pair3" | "pair4" | "oll" | "pll";

export interface SplitTimesMs {
  crossMs?: number | null;
  f2lMs?: number | null;
  ollMs?: number | null;
  pllMs?: number | null;
}

export interface AnalyzeSolveOptions {
  crossFace?: Face;
  compare?: boolean;
  splits?: SplitTimesMs;
  searchOptions?: SearchOptions;
}

export interface PhaseOptimal {
  length: number;
  solution: string[];
  truncated: boolean;
}

export interface XCrossOptimal {
  slot: Slot;
  length: number;
  solution: string[];
  truncated: boolean;
}

export interface PhaseAnalysis {
  name: PhaseName;
  reached: boolean;
  startIndex: number;
  endIndex: number;
  tokens: string[];
  htm: number;
  stm: number;
  slot?: Slot;
  optimal?: PhaseOptimal;
  tps?: number | null;
}

export interface AnalyzeSolveSuccess {
  error?: never;
  crossFace: Face;
  solvedAtEnd: boolean;
  phases: PhaseAnalysis[];
  totals: {
    htm: number;
    stm: number;
  };
  xcross?: XCrossOptimal;
}

export interface AnalyzeSolveError {
  error: string;
}

export type AnalyzeSolveResult = AnalyzeSolveSuccess | AnalyzeSolveError;

const U_LAYER_CORNERS = [URF, UFL, ULB, UBR] as const;
const U_LAYER_EDGES = [UR, UF, UL, UB] as const;
const SLICE_BASES = new Set(["M", "E", "S"]);
const ROTATION_BASES = new Set(["x", "y", "z"]);

function getMoveBase(token: string): string {
  const last = token[token.length - 1];
  return last === "'" || last === "2" ? token.slice(0, -1) : token;
}

/**
 * Counts HTM (rotations=0, outer/wide=1, slice=2, 180-deg=1) and STM (rotations=0, outer/wide/slice=1).
 */
export function countMoveMetrics(tokens: readonly string[]): { htm: number; stm: number } {
  let htm = 0;
  let stm = 0;
  for (const token of tokens) {
    const base = getMoveBase(token);
    if (ROTATION_BASES.has(base)) {
      continue;
    }
    if (SLICE_BASES.has(base)) {
      htm += 2;
      stm += 1;
      continue;
    }
    htm += 1;
    stm += 1;
  }
  return { htm, stm };
}

function isSolvedOll(state: CubieState): boolean {
  for (const c of U_LAYER_CORNERS) {
    if (state.co[c] !== 0) {
      return false;
    }
  }
  for (const e of U_LAYER_EDGES) {
    if (state.eo[e] !== 0) {
      return false;
    }
  }
  return true;
}

function isSolvedF2L(state: CubieState): boolean {
  if (!isSolvedCross(state)) {
    return false;
  }
  for (const slot of SLOTS_LIST) {
    if (!isSolvedSlot(state, slot)) {
      return false;
    }
  }
  return true;
}

function isSolvedCube(state: CubieState): boolean {
  for (let i = 0; i < 8; i += 1) {
    if (state.cp[i] !== i || state.co[i] !== 0) {
      return false;
    }
  }
  for (let i = 0; i < 12; i += 1) {
    if (state.ep[i] !== i || state.eo[i] !== 0) {
      return false;
    }
  }
  return true;
}

function makePhase(
  name: PhaseName,
  reached: boolean,
  startIndex: number,
  endIndex: number,
  allTokens: readonly string[],
  slot?: Slot,
): PhaseAnalysis {
  const tokens = reached ? allTokens.slice(startIndex, endIndex) : [];
  const { htm, stm } = countMoveMetrics(tokens);
  const phase: PhaseAnalysis = {
    name,
    reached,
    startIndex,
    endIndex,
    tokens,
    htm,
    stm,
  };
  if (slot !== undefined) {
    phase.slot = slot;
  }
  return phase;
}

function computeTps(
  stm: number,
  durationMs: number | null | undefined,
  reached: boolean,
): number | null {
  if (!reached || durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  return stm / (durationMs / 1000);
}

function formatParseError(label: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const match = msg.match(/Invalid move token:\s*"([^"]*)"/);
  if (match) {
    return `${label}に読めない記号「${match[1]}」が含まれています`;
  }
  return `${label}を読み取れません`;
}

/**
 * Splits a user's solve into CFOP phases (Cross, F2L pair1..4, OLL, PLL)
 * and optionally compares each phase against optimal search solutions.
 */
export function analyzeSolve(
  scramble: string,
  solution: string,
  options?: AnalyzeSolveOptions,
): AnalyzeSolveResult {
  let scrambleTokens: string[];
  try {
    scrambleTokens = parseMoves(scramble);
  } catch (err) {
    return { error: formatParseError("スクランブル", err) };
  }

  let solutionTokens: string[];
  try {
    solutionTokens = parseMoves(solution);
  } catch (err) {
    return { error: formatParseError("ソルブ手順", err) };
  }

  if (options?.crossFace !== undefined && !ALL_FACES.includes(options.crossFace)) {
    return { error: `指定されたクロス面「${String(options.crossFace)}」が正しくありません` };
  }

  const candidateFaces: readonly Face[] =
    options?.crossFace !== undefined ? [options.crossFace] : ALL_FACES;

  // Build fixed-center 18-turn sequences and per-face states at each solution token index k (0..N)
  const n = solutionTokens.length;
  const faceTurnsAt: string[][] = new Array(n + 1);
  const statesByFace = {} as Record<Face, CubieState[]>;
  const firstCrossStep = {} as Record<Face, number | null>;

  for (const face of candidateFaces) {
    statesByFace[face] = new Array(n + 1);
    firstCrossStep[face] = null;
  }

  let prevFaceTurnsLen = 0;
  for (let k = 0; k <= n; k += 1) {
    const combined =
      k === 0 ? scrambleTokens : [...scrambleTokens, ...solutionTokens.slice(0, k)];
    const curFaceTurns = toFaceTurns(combined).faceTurns;
    faceTurnsAt[k] = curFaceTurns;
    const delta = curFaceTurns.slice(prevFaceTurnsLen);
    prevFaceTurnsLen = curFaceTurns.length;

    for (const face of candidateFaces) {
      const prevState = k === 0 ? createSolvedState() : statesByFace[face][k - 1];
      const nextState = applyMoves(prevState, relabelMoves(delta, face));
      statesByFace[face][k] = nextState;
      if (firstCrossStep[face] === null && isSolvedCross(nextState)) {
        firstCrossStep[face] = k;
      }
    }
  }

  // Pick cross face: earliest cross completion, tie-breaking by ALL_FACES order (D first)
  let crossFace: Face = candidateFaces[0];
  let crossEnd: number | null = firstCrossStep[crossFace];
  for (const face of candidateFaces) {
    const step = firstCrossStep[face];
    if (step !== null && (crossEnd === null || step < crossEnd)) {
      crossEnd = step;
      crossFace = face;
    }
  }

  const states = statesByFace[crossFace];
  const solvedAtEnd = isSolvedCube(states[n]);
  const phases: PhaseAnalysis[] = [];

  if (crossEnd === null) {
    phases.push(makePhase("cross", false, 0, 0, solutionTokens));
    for (let i = 1; i <= 4; i += 1) {
      phases.push(makePhase(`pair${i}` as PhaseName, false, 0, 0, solutionTokens));
    }
    phases.push(makePhase("oll", false, 0, 0, solutionTokens));
    phases.push(makePhase("pll", false, 0, 0, solutionTokens));
  } else {
    phases.push(makePhase("cross", true, 0, crossEnd, solutionTokens));

    // F2L pairs: detect increases in solved slot count while cross remains solved
    const baseSolvedSlots = SLOTS_LIST.filter((s) => isSolvedSlot(states[crossEnd], s));
    const baseSolvedSet = new Set<Slot>(baseSolvedSlots);
    const assignedSlots = new Set<Slot>();
    const pairPhases: PhaseAnalysis[] = [];
    let f2lEnd: number | null = null;
    let lastPairEnd = crossEnd;

    if (baseSolvedSlots.length === 4) {
      for (let i = 0; i < 4; i += 1) {
        pairPhases.push(
          makePhase(`pair${i + 1}` as PhaseName, true, crossEnd, crossEnd, solutionTokens, SLOTS_LIST[i]),
        );
      }
      f2lEnd = crossEnd;
    } else {
      let prevSolvedCount = baseSolvedSlots.length;
      for (let k = crossEnd + 1; k <= n; k += 1) {
        if (!isSolvedCross(states[k])) {
          continue;
        }
        const solvedNow = SLOTS_LIST.filter((s) => isSolvedSlot(states[k], s));
        if (solvedNow.length <= prevSolvedCount) {
          continue;
        }

        const delta = solvedNow.length - prevSolvedCount;
        const availableNew = solvedNow.filter(
          (s) => !assignedSlots.has(s) && !baseSolvedSet.has(s),
        );
        const availableBase = solvedNow.filter(
          (s) => !assignedSlots.has(s) && baseSolvedSet.has(s),
        );
        const picked = [...availableNew, ...availableBase].slice(0, delta);

        for (let j = 0; j < picked.length; j += 1) {
          const slot = picked[j];
          assignedSlots.add(slot);
          const startIdx = j === 0 ? lastPairEnd : k;
          const pairNum = pairPhases.length + 1;
          pairPhases.push(
            makePhase(`pair${pairNum}` as PhaseName, true, startIdx, k, solutionTokens, slot),
          );
        }

        prevSolvedCount = solvedNow.length;
        lastPairEnd = k;

        if (prevSolvedCount === 4) {
          const remaining = SLOTS_LIST.filter((s) => !assignedSlots.has(s));
          for (const slot of remaining) {
            assignedSlots.add(slot);
            const pairNum = pairPhases.length + 1;
            pairPhases.push(
              makePhase(`pair${pairNum}` as PhaseName, true, k, k, solutionTokens, slot),
            );
          }
          f2lEnd = k;
          break;
        }
      }

      while (pairPhases.length < 4) {
        const pairNum = pairPhases.length + 1;
        pairPhases.push(
          makePhase(`pair${pairNum}` as PhaseName, false, lastPairEnd, lastPairEnd, solutionTokens),
        );
      }
    }

    phases.push(...pairPhases);

    // OLL: after F2L, first state where F2L is solved and U-layer co & eo are all 0
    if (f2lEnd === null) {
      phases.push(makePhase("oll", false, lastPairEnd, lastPairEnd, solutionTokens));
      phases.push(makePhase("pll", false, lastPairEnd, lastPairEnd, solutionTokens));
    } else {
      let ollEnd: number | null = null;
      for (let k = f2lEnd; k <= n; k += 1) {
        if (isSolvedF2L(states[k]) && isSolvedOll(states[k])) {
          ollEnd = k;
          break;
        }
      }

      if (ollEnd === null) {
        phases.push(makePhase("oll", false, f2lEnd, f2lEnd, solutionTokens));
        phases.push(makePhase("pll", false, f2lEnd, f2lEnd, solutionTokens));
      } else {
        phases.push(makePhase("oll", true, f2lEnd, ollEnd, solutionTokens));

        // PLL: after OLL, first state where entire cube is solved (including AUF)
        let pllEnd: number | null = null;
        for (let k = ollEnd; k <= n; k += 1) {
          if (isSolvedCube(states[k])) {
            pllEnd = k;
            break;
          }
        }

        if (pllEnd === null) {
          phases.push(makePhase("pll", false, ollEnd, ollEnd, solutionTokens));
        } else {
          phases.push(makePhase("pll", true, ollEnd, pllEnd, solutionTokens));
        }
      }
    }
  }

  // Optional TPS calculation when splits are provided
  if (options?.splits !== undefined) {
    const { crossMs, f2lMs, ollMs, pllMs } = options.splits;
    const f2lTotalStm = phases
      .filter((p) => p.name.startsWith("pair"))
      .reduce((sum, p) => sum + p.stm, 0);

    for (const phase of phases) {
      if (phase.name === "cross") {
        phase.tps = computeTps(phase.stm, crossMs, phase.reached);
      } else if (phase.name.startsWith("pair")) {
        phase.tps = computeTps(f2lTotalStm, f2lMs, phase.reached);
      } else if (phase.name === "oll") {
        phase.tps = computeTps(phase.stm, ollMs, phase.reached);
      } else if (phase.name === "pll") {
        phase.tps = computeTps(phase.stm, pllMs, phase.reached);
      }
    }
  }

  // Optional optimal comparison (only run heavy searches when compare === true)
  let xcross: XCrossOptimal | undefined;
  if (options?.compare) {
    const scrambleFaceTurns = faceTurnsAt[0];
    const searchOpts = options.searchOptions;

    const crossPhase = phases[0];
    const crossOpt = solveCross(scrambleFaceTurns, crossFace, searchOpts);
    crossPhase.optimal = {
      length: crossOpt.length,
      solution: crossOpt.solution,
      truncated: crossOpt.truncated,
    };

    const pair1Phase = phases[1];
    if (pair1Phase.reached && pair1Phase.slot) {
      const xcrossOpt = solveXCross(scrambleFaceTurns, crossFace, pair1Phase.slot, searchOpts);
      xcross = {
        slot: pair1Phase.slot,
        length: xcrossOpt.length,
        solution: xcrossOpt.solution,
        truncated: xcrossOpt.truncated,
      };
    }

    for (let i = 1; i <= 4; i += 1) {
      const pairPhase = phases[i];
      if (!pairPhase.reached || !pairPhase.slot) {
        continue;
      }
      const startState = states[pairPhase.startIndex];
      const keepSlots = SLOTS_LIST.filter(
        (s) => s !== pairPhase.slot && isSolvedSlot(startState, s),
      );
      const pairOpt = solvePair(
        faceTurnsAt[pairPhase.startIndex],
        crossFace,
        pairPhase.slot,
        keepSlots,
        searchOpts,
      );
      pairPhase.optimal = {
        length: pairOpt.length,
        solution: pairOpt.solution,
        truncated: pairOpt.truncated,
      };
    }
  }

  const totals = countMoveMetrics(solutionTokens);
  const result: AnalyzeSolveSuccess = {
    crossFace,
    solvedAtEnd,
    phases,
    totals,
  };
  if (xcross !== undefined) {
    result.xcross = xcross;
  }
  return result;
}
