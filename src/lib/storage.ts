import type {
  CurrentSolveDraft,
  SolveRecord,
  SplitPhase,
  SplitDraft,
  ThemePreference,
} from "../types";

const STORAGE_KEY = "cubeSplitTimer.solves.v1";
const THEME_KEY = "cubeSplitTimer.theme.v1";
const CURRENT_SOLVE_DRAFT_KEY = "cubeSplitTimer.currentSolveDraft.v1";

function isPenalty(value: unknown): boolean {
  return value === "none" || value === "+2" || value === "DNF";
}

function isSplitPhase(value: unknown): value is SplitPhase {
  return (
    value === "cross" ||
    value === "f2l" ||
    value === "oll" ||
    value === "pll" ||
    value === "pair1" ||
    value === "pair2" ||
    value === "pair3" ||
    value === "pair4"
  );
}

function hasBaseSolveFields(value: Partial<SolveRecord>): boolean {
  return (
    typeof value.id === "string" &&
    typeof value.totalTime === "number" &&
    typeof value.scramble === "string" &&
    isPenalty(value.penalty) &&
    (value.deletedAt === null || typeof value.deletedAt === "string") &&
    typeof value.createdAt === "string"
  );
}

function isSolveRecord(value: unknown): value is SolveRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SolveRecord>;

  if (!hasBaseSolveFields(candidate)) {
    return false;
  }

  if (candidate.mode === "normal") {
    return true;
  }

  if (candidate.mode === "cfop_split") {
    return (
      typeof candidate.crossTime === "number" &&
      typeof candidate.f2lTime === "number" &&
      typeof candidate.ollTime === "number" &&
      typeof candidate.pllTime === "number"
    );
  }

  if (candidate.mode === "cross_practice") {
    return (
      typeof candidate.crossTime === "number" &&
      typeof candidate.crossColor === "string"
    );
  }

  if (candidate.mode === "f2l_practice") {
    return typeof candidate.f2lTime === "number";
  }

  if (candidate.mode === "f2l_pair_split") {
    return (
      typeof candidate.pair1Time === "number" &&
      typeof candidate.pair2Time === "number" &&
      typeof candidate.pair3Time === "number" &&
      typeof candidate.pair4Time === "number"
    );
  }

  return false;
}

export function loadSolves(): SolveRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isSolveRecord);
  } catch {
    return [];
  }
}

export function saveSolves(solves: SolveRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(solves));
}

export function loadThemePreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);

  if (stored === "dark" || stored === "light" || stored === "system") {
    return stored;
  }

  return "dark";
}

export function saveThemePreference(theme: ThemePreference): void {
  localStorage.setItem(THEME_KEY, theme);
}

function isSplitDraft(value: unknown): value is SplitDraft {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<SplitDraft>;

  return (
    isSplitPhase(candidate.phase) &&
    typeof candidate.time === "number" &&
    typeof candidate.cumulativeTime === "number"
  );
}

function isCurrentSolveDraft(value: unknown): value is CurrentSolveDraft {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<CurrentSolveDraft>;

  return (
    candidate.status === "running" &&
    (candidate.mode === "normal" ||
      candidate.mode === "cfop_split" ||
      candidate.mode === "cross_practice" ||
      candidate.mode === "f2l_practice" ||
      candidate.mode === "f2l_pair_split") &&
    typeof candidate.startTime === "number" &&
    typeof candidate.scramble === "string" &&
    Array.isArray(candidate.splits) &&
    candidate.splits.every(isSplitDraft)
  );
}

function isLegacyCurrentSolveDraft(value: unknown): value is Omit<CurrentSolveDraft, "mode"> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<CurrentSolveDraft>;

  return (
    candidate.status === "running" &&
    typeof candidate.startTime === "number" &&
    typeof candidate.scramble === "string" &&
    Array.isArray(candidate.splits)
  );
}

export function loadCurrentSolveDraft(): CurrentSolveDraft | null {
  try {
    const raw = sessionStorage.getItem(CURRENT_SOLVE_DRAFT_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (isCurrentSolveDraft(parsed)) {
      return parsed;
    }

    if (isLegacyCurrentSolveDraft(parsed)) {
      return {
        ...parsed,
        mode: "normal",
        splits: [],
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function saveCurrentSolveDraft(draft: CurrentSolveDraft): void {
  sessionStorage.setItem(CURRENT_SOLVE_DRAFT_KEY, JSON.stringify(draft));
}

export function clearCurrentSolveDraft(): void {
  sessionStorage.removeItem(CURRENT_SOLVE_DRAFT_KEY);
}
