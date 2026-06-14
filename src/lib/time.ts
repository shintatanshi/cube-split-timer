import type { Penalty, SolveRecord, TimedValue } from "../types";

export function applyPenalty(timeMs: number, penalty: Penalty): TimedValue {
  if (penalty === "DNF") {
    return { value: null, isDnf: true };
  }

  return {
    value: penalty === "+2" ? timeMs + 2000 : timeMs,
    isDnf: false,
  };
}

export function getSolveValue(solve: SolveRecord): TimedValue {
  return applyPenalty(solve.totalTime, solve.penalty);
}

export function formatTime(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const milliseconds = safeMs % 1000;

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds
      .toString()
      .padStart(3, "0")}`;
  }

  return `${seconds}.${milliseconds.toString().padStart(3, "0")}`;
}

export function formatSolveTime(solve: SolveRecord): string {
  const value = getSolveValue(solve);

  if (value.isDnf || value.value === null) {
    return "DNF";
  }

  return formatTime(value.value);
}

export function formatAverage(value: TimedValue | null): string {
  if (value === null) {
    return "--";
  }

  if (value.isDnf || value.value === null) {
    return "DNF";
  }

  return formatTime(value.value);
}

export function formatDateTime(isoDate: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}
