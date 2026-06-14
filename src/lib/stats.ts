import type {
  CfopPhase,
  CfopSplitSolveRecord,
  F2lPairPhase,
  F2lPairSplitSolveRecord,
  SolveRecord,
  TimedValue,
} from "../types";
import { getSolveValue } from "./time";

export interface TimerStats {
  count: number;
  average: TimedValue | null;
  ao5: TimedValue | null;
  ao12: TimedValue | null;
  ao50: TimedValue | null;
  ao100: TimedValue | null;
  best: TimedValue | null;
  worst: TimedValue | null;
}

export interface PhaseStat {
  count: number;
  average: TimedValue | null;
  best: TimedValue | null;
  worst: TimedValue | null;
}

export type CfopPhaseStats = Record<CfopPhase, PhaseStat>;

export type F2lPairStats = Record<F2lPairPhase, PhaseStat>;

export interface PracticeStats {
  crossPractice: TimerStats;
  f2lPractice: TimerStats;
  f2lPairSplit: TimerStats;
  pairs: F2lPairStats;
}

function averageNumbers(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function timedValueFromMs(value: number | null): TimedValue | null {
  return value === null ? null : { value, isDnf: false };
}

function calculateSessionAverage(solves: SolveRecord[]): TimedValue | null {
  const values = solves
    .map(getSolveValue)
    .filter((value): value is { value: number; isDnf: false } => value.value !== null)
    .map((value) => value.value);
  const average = averageNumbers(values);

  return average === null ? null : { value: average, isDnf: false };
}

function calculateTrimmedAverage(solves: SolveRecord[], size: number): TimedValue | null {
  if (solves.length < size) {
    return null;
  }

  const latest = solves.slice(0, size).map(getSolveValue);
  const dnfCount = latest.filter((value) => value.isDnf).length;

  if (dnfCount > 1) {
    return { value: null, isDnf: true };
  }

  const sortable = latest
    .map((value, index) => ({
      index,
      sortValue: value.value ?? Number.POSITIVE_INFINITY,
      value,
    }))
    .sort((a, b) => a.sortValue - b.sortValue || a.index - b.index);
  const trimmed = sortable.slice(1, -1);

  if (trimmed.some((entry) => entry.value.value === null)) {
    return { value: null, isDnf: true };
  }

  const average = averageNumbers(
    trimmed.map((entry) => {
      return entry.value.value ?? 0;
    }),
  );

  return average === null ? null : { value: average, isDnf: false };
}

function findBest(solves: SolveRecord[]): TimedValue | null {
  const values = solves
    .map(getSolveValue)
    .filter((value): value is { value: number; isDnf: false } => value.value !== null);

  if (values.length === 0) {
    return null;
  }

  return values.reduce((best, value) => (value.value < best.value ? value : best));
}

function findWorst(solves: SolveRecord[]): TimedValue | null {
  const values = solves
    .map(getSolveValue)
    .filter((value): value is { value: number; isDnf: false } => value.value !== null);

  if (values.length === 0) {
    return null;
  }

  return values.reduce((worst, value) => (value.value > worst.value ? value : worst));
}

export function getActiveSolves(solves: SolveRecord[]): SolveRecord[] {
  return solves.filter((solve) => solve.deletedAt === null);
}

function getActiveCfopSolves(solves: SolveRecord[]): CfopSplitSolveRecord[] {
  return getActiveSolves(solves).filter(
    (solve): solve is CfopSplitSolveRecord =>
      solve.mode === "cfop_split" && solve.penalty !== "DNF",
  );
}

function getActiveF2lPairSolves(solves: SolveRecord[]): F2lPairSplitSolveRecord[] {
  return getActiveSolves(solves).filter(
    (solve): solve is F2lPairSplitSolveRecord =>
      solve.mode === "f2l_pair_split" && solve.penalty !== "DNF",
  );
}

function calculatePhaseStat(values: number[]): PhaseStat {
  if (values.length === 0) {
    return {
      count: 0,
      average: null,
      best: null,
      worst: null,
    };
  }

  return {
    count: values.length,
    average: timedValueFromMs(averageNumbers(values)),
    best: timedValueFromMs(Math.min(...values)),
    worst: timedValueFromMs(Math.max(...values)),
  };
}

export function calculateStats(solves: SolveRecord[]): TimerStats {
  const activeSolves = getActiveSolves(solves);

  return {
    count: activeSolves.length,
    average: calculateSessionAverage(activeSolves),
    ao5: calculateTrimmedAverage(activeSolves, 5),
    ao12: calculateTrimmedAverage(activeSolves, 12),
    ao50: calculateTrimmedAverage(activeSolves, 50),
    ao100: calculateTrimmedAverage(activeSolves, 100),
    best: findBest(activeSolves),
    worst: findWorst(activeSolves),
  };
}

function calculateStatsForMode(solves: SolveRecord[], mode: SolveRecord["mode"]): TimerStats {
  return calculateStats(solves.filter((solve) => solve.mode === mode));
}

export function calculateCfopPhaseStats(solves: SolveRecord[]): CfopPhaseStats {
  const cfopSolves = getActiveCfopSolves(solves);

  return {
    cross: calculatePhaseStat(cfopSolves.map((solve) => solve.crossTime)),
    f2l: calculatePhaseStat(cfopSolves.map((solve) => solve.f2lTime)),
    oll: calculatePhaseStat(cfopSolves.map((solve) => solve.ollTime)),
    pll: calculatePhaseStat(cfopSolves.map((solve) => solve.pllTime)),
  };
}

export function calculatePracticeStats(solves: SolveRecord[]): PracticeStats {
  const f2lPairSolves = getActiveF2lPairSolves(solves);

  return {
    crossPractice: calculateStatsForMode(solves, "cross_practice"),
    f2lPractice: calculateStatsForMode(solves, "f2l_practice"),
    f2lPairSplit: calculateStatsForMode(solves, "f2l_pair_split"),
    pairs: {
      pair1: calculatePhaseStat(f2lPairSolves.map((solve) => solve.pair1Time)),
      pair2: calculatePhaseStat(f2lPairSolves.map((solve) => solve.pair2Time)),
      pair3: calculatePhaseStat(f2lPairSolves.map((solve) => solve.pair3Time)),
      pair4: calculatePhaseStat(f2lPairSolves.map((solve) => solve.pair4Time)),
    },
  };
}
