import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
import type {
  CfopPhase,
  F2lPairPhase,
  Penalty,
  SolveMode,
  SolveRecord,
  SplitPhase,
  SplitDraft,
  ThemePreference,
} from "./types";
import { HELP_TOPICS, TUTORIAL_STEPS } from "./helpContent";
import {
  getAuthIdentities,
  getCurrentAuthUser,
  isAuthConfigured,
  linkGoogleIdentity,
  requestPasswordResetEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutCurrentUser,
  signUpWithEmail,
  subscribeToAuthUserChange,
  type AuthIdentity,
  type AuthUser,
  updateCurrentUserPassword,
} from "./lib/auth";
import { getMyProfile, type ProfileRow } from "./lib/admin";
import { submitFeedbackReport, type FeedbackCategory } from "./lib/feedback";
import { generateScramble } from "./lib/scramble";
import {
  getMySolveSessions,
  saveSolveSession,
  type SaveSolveSessionInput,
  type SolveSessionRow,
} from "./lib/solveSessions";
import {
  clearCurrentSolveDraft,
  mergeSolvesById,
  loadCurrentSolveDraft,
  loadSolves,
  loadThemePreference,
  parseSolvesBackup,
  saveCurrentSolveDraft,
  saveSolves,
  saveThemePreference,
  stringifySolvesBackup,
} from "./lib/storage";
import {
  calculateCfopPhaseStats,
  calculatePracticeStats,
  calculateStats,
  getActiveSolves,
  type PhaseStat,
  type TimerStats,
} from "./lib/stats";
import {
  formatAverage,
  formatDateTime,
  formatSolveTime,
  formatTime,
  getSolveValue,
} from "./lib/time";

type TimerState = "idle" | "pendingStart" | "holding" | "ready" | "running" | "finished";
type StartHoldSource = "keyboard" | "pointer";
type StartReturnState = "idle" | "finished";

const INPUT_DEBOUNCE_MS = 200;
const HOLD_TO_START_MS = 500;
const POINTER_START_PENDING_MS = 90;
const POINTER_SCROLL_CANCEL_PX = 10;
const LAST_SOLVE_NOTICE_MS = 8000;
const TUTORIAL_STORAGE_KEY = "cubeSplitTimer.tutorialSeen.v1";
const CURRENT_SCRAMBLE_STORAGE_KEY = "cubeSplitTimer.currentScramble.v1";
const MOBILE_NAV_COLLAPSED_STORAGE_KEY = "cubeSplitTimer.mobileNavCollapsed.v1";
const LearnPage = lazy(() => import("./learn/LearnPage"));
const AnalyzerPage = lazy(() => import("./analyzer/AnalyzerPage"));
const ScramblePreviewPage = lazy(() => import("./scramble/ScramblePreviewPage"));
const AdminPage = lazy(() => import("./admin/AdminPage"));

type AppPage =
  | "timer"
  | "history"
  | "analysis"
  | "practice"
  | "help"
  | "learn"
  | "analyzer"
  | "scramble"
  | "feedback"
  | "login"
  | "admin"
  | "reset-password";

interface LocationInfo {
  page: AppPage;
  path: string;
  hash: string;
}

const CFOP_PHASES: Array<{ phase: CfopPhase; label: string }> = [
  { phase: "cross", label: "Cross" },
  { phase: "f2l", label: "F2L" },
  { phase: "oll", label: "OLL" },
  { phase: "pll", label: "PLL" },
];

const F2L_PAIR_PHASES: Array<{ phase: F2lPairPhase; label: string }> = [
  { phase: "pair1", label: "Pair 1" },
  { phase: "pair2", label: "Pair 2" },
  { phase: "pair3", label: "Pair 3" },
  { phase: "pair4", label: "Pair 4" },
];

const TIMER_MODES: Array<{ mode: SolveMode; label: string }> = [
  { mode: "normal", label: "Normal" },
  { mode: "cfop_split", label: "CFOP Split" },
  { mode: "cross_practice", label: "Cross" },
  { mode: "f2l_practice", label: "F2L" },
  { mode: "f2l_pair_split", label: "F2L Pair" },
];

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nextPenalty(current: Penalty, requested: Penalty): Penalty {
  if (requested === "none") {
    return "none";
  }

  return current === requested ? "none" : requested;
}

function getSplitTime(splits: SplitDraft[], phase: SplitPhase): number {
  return splits.find((split) => split.phase === phase)?.time ?? 0;
}

function getModeLabel(mode: SolveMode): string {
  switch (mode) {
    case "normal":
      return "Normal";
    case "cfop_split":
      return "CFOP Split";
    case "cross_practice":
      return "Cross Practice";
    case "f2l_practice":
      return "F2L Practice";
    case "f2l_pair_split":
      return "F2L Pair Split";
  }
}

function getPhaseLabel(phase: SplitPhase): string {
  return (
    [...CFOP_PHASES, ...F2L_PAIR_PHASES].find((entry) => entry.phase === phase)?.label ??
    phase
  );
}

function getSavedSplits(solve: SolveRecord): Array<{ key: string; label: string; time: number }> {
  switch (solve.mode) {
    case "cfop_split":
      return [
        { key: "cross", label: "Cross", time: solve.crossTime },
        { key: "f2l", label: "F2L", time: solve.f2lTime },
        { key: "oll", label: "OLL", time: solve.ollTime },
        { key: "pll", label: "PLL", time: solve.pllTime },
      ];
    case "cross_practice":
      return [{ key: "cross", label: `Cross ${solve.crossColor}`, time: solve.crossTime }];
    case "f2l_practice":
      return [{ key: "f2l", label: "F2L", time: solve.f2lTime }];
    case "f2l_pair_split":
      return [
        { key: "pair1", label: "Pair 1", time: solve.pair1Time },
        { key: "pair2", label: "Pair 2", time: solve.pair2Time },
        { key: "pair3", label: "Pair 3", time: solve.pair3Time },
        { key: "pair4", label: "Pair 4", time: solve.pair4Time },
      ];
    case "normal":
      return [];
  }
}

function getIdleHint(mode: SolveMode): string {
  switch (mode) {
    case "normal":
      return "Hold Space or press timer, release on green";
    case "cfop_split":
      return "Hold to start, then tap / Space for Cross, F2L, OLL, PLL";
    case "cross_practice":
      return "Hold to start, then tap / Space to finish Cross";
    case "f2l_practice":
      return "Hold to start, then tap / Space to finish F2L";
    case "f2l_pair_split":
      return "Hold to start, then tap / Space for Pair 1-4";
  }
}

function isStartableTimerState(timerState: TimerState): boolean {
  return timerState === "idle" || timerState === "finished";
}

function getTimerPrepareHint(timerState: TimerState, mode: SolveMode): string {
  if (timerState === "holding") {
    return "Hold...";
  }

  if (timerState === "ready") {
    return "Ready - release to start";
  }

  return getIdleHint(mode);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

interface UndoState {
  solveId: string;
  message: string;
}

interface PointerStartCandidate {
  pointerId: number;
  startX: number;
  startY: number;
  returnState: StartReturnState;
  timeoutId: number;
}

interface PostStopInputGuard {
  pointerId: number | null;
  timeoutId: number | null;
  waitingForRelease: boolean;
}

interface WeakPhase {
  label: string;
  average: number;
  delta: number;
}

interface CloudSyncResult {
  total: number;
  uploaded: number;
  skipped: number;
}

interface LocalImportResult {
  imported: number;
  added: number;
  total: number;
}

interface AppNavItem {
  key: AppPage;
  label: string;
  path: string;
}

const APP_NAV_ITEMS: AppNavItem[] = [
  { key: "timer", label: "計測", path: "/" },
  { key: "learn", label: "学ぶ", path: "/learn" },
  { key: "analyzer", label: "解析", path: "/analyzer" },
  { key: "history", label: "履歴", path: "/history" },
  { key: "analysis", label: "分析", path: "/analysis" },
  { key: "practice", label: "練習", path: "/practice" },
  { key: "help", label: "ヘルプ", path: "/help" },
  { key: "feedback", label: "意見箱", path: "/feedback" },
];

function getLocationInfo(): LocationInfo {
  const { pathname, hash } = window.location;
  let page: AppPage = "timer";

  if (pathname === "/history" || (pathname === "/" && hash === "#history")) {
    page = "history";
  } else if (pathname === "/analysis" || (pathname === "/" && hash === "#analysis")) {
    page = "analysis";
  } else if (pathname === "/practice" || (pathname === "/" && hash === "#practice")) {
    page = "practice";
  } else if (pathname === "/help") {
    page = "help";
  } else if (pathname.startsWith("/learn")) {
    page = "learn";
  } else if (pathname === "/analyzer") {
    page = "analyzer";
  } else if (pathname === "/scramble") {
    page = "scramble";
  } else if (pathname === "/feedback") {
    page = "feedback";
  } else if (pathname === "/login") {
    page = "login";
  } else if (pathname === "/admin") {
    page = "admin";
  } else if (pathname === "/reset-password") {
    page = "reset-password";
  }

  return {
    page,
    path: pathname,
    hash,
  };
}

function getHelpTopicId(hash: string): string {
  const topicId = hash.replace("#", "");

  return HELP_TOPICS.some((topic) => topic.id === topicId) ? topicId : "overview";
}

function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
  } catch {
    // localStorage may be unavailable in private modes; the timer should still work.
  }
}

function loadMobileNavCollapsed(): boolean {
  try {
    return localStorage.getItem(MOBILE_NAV_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveMobileNavCollapsed(isCollapsed: boolean): void {
  try {
    localStorage.setItem(MOBILE_NAV_COLLAPSED_STORAGE_KEY, String(isCollapsed));
  } catch {
    // localStorage may be unavailable in private modes; the in-memory state still works.
  }
}

function loadCurrentScramble(): string | null {
  try {
    return sessionStorage.getItem(CURRENT_SCRAMBLE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveCurrentScramble(scramble: string): void {
  try {
    sessionStorage.setItem(CURRENT_SCRAMBLE_STORAGE_KEY, scramble);
  } catch {
    // Session storage is only used to keep navigation previews stable.
  }
}

function getPhaseShareTime(solve: SolveRecord, phase: CfopPhase): string {
  if (solve.mode === "cfop_split") {
    const phaseTime = {
      cross: solve.crossTime,
      f2l: solve.f2lTime,
      oll: solve.ollTime,
      pll: solve.pllTime,
    }[phase];

    return formatTime(phaseTime);
  }

  if (phase === "cross" && solve.mode === "cross_practice") {
    return formatTime(solve.crossTime);
  }

  if (phase === "f2l" && solve.mode === "f2l_practice") {
    return formatTime(solve.f2lTime);
  }

  return "--";
}

function buildSolveShareText(solve: SolveRecord, stats: TimerStats): string {
  return [
    "Cube Split Timer",
    `Mode: ${getModeLabel(solve.mode)}`,
    `Total: ${formatSolveTime(solve)}`,
    `Cross: ${getPhaseShareTime(solve, "cross")}`,
    `F2L: ${getPhaseShareTime(solve, "f2l")}`,
    `OLL: ${getPhaseShareTime(solve, "oll")}`,
    `PLL: ${getPhaseShareTime(solve, "pll")}`,
    `Scramble: ${solve.scramble}`,
    `Penalty: ${solve.penalty}`,
    `ao5: ${formatAverage(stats.ao5)}`,
    `ao12: ${formatAverage(stats.ao12)}`,
  ].join("\n");
}

function isSameLocalDate(isoDate: string, targetDate: Date): boolean {
  const date = new Date(isoDate);

  return (
    date.getFullYear() === targetDate.getFullYear() &&
    date.getMonth() === targetDate.getMonth() &&
    date.getDate() === targetDate.getDate()
  );
}

function buildTodaySummaryShareText(todaySolves: SolveRecord[], todayStats: TimerStats): string {
  const dateLabel = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return [
    "Cube Split Timer 今日のまとめ",
    dateLabel,
    `Solves: ${todayStats.count}`,
    `Average: ${formatAverage(todayStats.average)}`,
    `Best: ${formatAverage(todayStats.best)}`,
    `Worst: ${formatAverage(todayStats.worst)}`,
    `ao5: ${formatAverage(todayStats.ao5)}`,
    `ao12: ${formatAverage(todayStats.ao12)}`,
    todaySolves[0] ? `Latest: ${formatSolveTime(todaySolves[0])}` : "Latest: --",
  ].join("\n");
}

function getAuthUserLabel(user: AuthUser): string {
  const displayName = user.user_metadata?.display_name;

  if (typeof displayName === "string" && displayName.trim()) {
    return displayName.trim();
  }

  return user.email ?? "ログイン中";
}

function getAuthIdentityLabel(identity: AuthIdentity): string {
  if (identity.provider === "email") {
    return "メール";
  }

  if (identity.provider === "google") {
    return "Google";
  }

  return identity.provider;
}

function getLocalSyncNote(solve: SolveRecord): string {
  return `Local solve ID: ${solve.id}`;
}

function buildCloudSolveSessionInput(solve: SolveRecord): SaveSolveSessionInput {
  const solveValue = getSolveValue(solve);
  const notes = [
    solve.penalty !== "none" ? `Penalty: ${solve.penalty}` : null,
    solve.mode === "cross_practice" ? `Cross color: ${solve.crossColor}` : null,
    solve.mode === "f2l_pair_split"
      ? `Pair splits: ${solve.pair1Time}, ${solve.pair2Time}, ${solve.pair3Time}, ${solve.pair4Time}`
      : null,
    getLocalSyncNote(solve),
  ].filter((note): note is string => note !== null);

  return {
    mode: solve.mode,
    scramble: solve.scramble,
    totalMs: solveValue.value ?? solve.totalTime,
    crossMs: "crossTime" in solve ? solve.crossTime : null,
    f2lMs: "f2lTime" in solve ? solve.f2lTime : null,
    ollMs: "ollTime" in solve ? solve.ollTime : null,
    pllMs: "pllTime" in solve ? solve.pllTime : null,
    notes: notes.length > 0 ? notes.join(" / ") : null,
    isDnf: solve.penalty === "DNF",
    createdAt: solve.createdAt,
  };
}

function getCloudInputFingerprint(input: SaveSolveSessionInput): string {
  return [
    input.mode,
    input.scramble,
    Math.round(input.totalMs),
    input.crossMs == null ? "" : Math.round(input.crossMs),
    input.f2lMs == null ? "" : Math.round(input.f2lMs),
    input.ollMs == null ? "" : Math.round(input.ollMs),
    input.pllMs == null ? "" : Math.round(input.pllMs),
    input.isDnf ? "dnf" : "ok",
    input.createdAt ?? "",
  ].join("|");
}

function getCloudInputLooseFingerprint(input: SaveSolveSessionInput): string {
  return [
    input.mode,
    input.scramble,
    Math.round(input.totalMs),
    input.crossMs == null ? "" : Math.round(input.crossMs),
    input.f2lMs == null ? "" : Math.round(input.f2lMs),
    input.ollMs == null ? "" : Math.round(input.ollMs),
    input.pllMs == null ? "" : Math.round(input.pllMs),
    input.isDnf ? "dnf" : "ok",
  ].join("|");
}

function getCloudRowFingerprint(row: SolveSessionRow): string {
  return [
    row.mode,
    row.scramble,
    row.total_ms,
    row.cross_ms ?? "",
    row.f2l_ms ?? "",
    row.oll_ms ?? "",
    row.pll_ms ?? "",
    row.is_dnf ? "dnf" : "ok",
    row.created_at,
  ].join("|");
}

function getCloudRowLooseFingerprint(row: SolveSessionRow): string {
  return [
    row.mode,
    row.scramble,
    row.total_ms,
    row.cross_ms ?? "",
    row.f2l_ms ?? "",
    row.oll_ms ?? "",
    row.pll_ms ?? "",
    row.is_dnf ? "dnf" : "ok",
  ].join("|");
}

function getWeakPhase(cfopStats: Record<CfopPhase, PhaseStat>): WeakPhase | null {
  const averages = CFOP_PHASES.map(({ phase, label }) => ({
    label,
    value: cfopStats[phase].average?.value ?? null,
  })).filter((entry): entry is { label: string; value: number } => entry.value !== null);

  if (averages.length === 0) {
    return null;
  }

  const baseline =
    averages.reduce((sum, entry) => sum + entry.value, 0) / averages.length;
  const slowest = averages.reduce((currentSlowest, entry) =>
    entry.value > currentSlowest.value ? entry : currentSlowest,
  );

  return {
    label: slowest.label,
    average: slowest.value,
    delta: Math.max(0, Math.round(slowest.value - baseline)),
  };
}

function copyTextWithFallback(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);

  return Promise.resolve();
}

interface GlobalAppNavProps {
  activePage: AppPage;
  isAdmin: boolean;
  isMobileCollapsed: boolean;
  onNavigate: (path: string) => void;
  onOpenLogin: () => void;
  onToggleMobileCollapse: () => void;
  authLabel: string;
  isAuthLoading: boolean;
  isSignedIn: boolean;
}

function GlobalAppNav({
  activePage,
  isAdmin,
  isMobileCollapsed,
  onNavigate,
  onOpenLogin,
  onToggleMobileCollapse,
  authLabel,
  isAuthLoading,
  isSignedIn,
}: GlobalAppNavProps) {
  const visibleItems = isAdmin
    ? [...APP_NAV_ITEMS, { key: "admin" as const, label: "Admin", path: "/admin" }]
    : APP_NAV_ITEMS;

  return (
    <nav
      className={`global-app-nav${isMobileCollapsed ? " is-mobile-collapsed" : ""}`}
      aria-label="Primary navigation"
    >
      <button className="global-brand" type="button" onClick={() => onNavigate("/")}>
        <span>Cube Split Timer</span>
        <small>計測・学習・解析</small>
      </button>
      <div className="global-nav-links">
        {visibleItems.map((item) => {
          const isCurrent = activePage === item.key;

          return (
            <button
              type="button"
              key={item.key}
              aria-current={isCurrent ? "page" : undefined}
              onClick={() => onNavigate(item.path)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <button className="global-account-button" type="button" onClick={onOpenLogin}>
        {isAuthLoading ? "アカウント" : isSignedIn ? authLabel : "ログイン"}
      </button>
      <button
        className="global-nav-collapse-button"
        type="button"
        aria-expanded={!isMobileCollapsed}
        aria-label={isMobileCollapsed ? "ナビを開く" : "ナビをたたむ"}
        onClick={onToggleMobileCollapse}
      />
    </nav>
  );
}

export default function App() {
  const [solves, setSolves] = useState<SolveRecord[]>(() => loadSolves());
  const [scramble, setScramble] = useState(() => loadCurrentScramble() ?? generateScramble());
  const [timerMode, setTimerMode] = useState<SolveMode>("normal");
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    loadThemePreference(),
  );
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [lastSavedSolveId, setLastSavedSolveId] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authProfile, setAuthProfile] = useState<ProfileRow | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(() => isAuthConfigured());
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [isMobileNavCollapsed, setIsMobileNavCollapsed] = useState(loadMobileNavCollapsed);
  const [locationInfo, setLocationInfo] = useState<LocationInfo>(() => getLocationInfo());
  const [isTutorialOpen, setIsTutorialOpen] = useState(() => !hasSeenTutorial());
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [splitDrafts, setSplitDrafts] = useState<SplitDraft[]>([]);
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastInputAtRef = useRef(-INPUT_DEBOUNCE_MS);
  const timerStateRef = useRef<TimerState>("idle");
  const holdTimeoutRef = useRef<number | null>(null);
  const holdSourceRef = useRef<StartHoldSource | null>(null);
  const holdPointerIdRef = useRef<number | null>(null);
  const holdStartXRef = useRef(0);
  const holdStartYRef = useRef(0);
  const holdReturnStateRef = useRef<StartReturnState>("idle");
  const pointerStartCandidateRef = useRef<PointerStartCandidate | null>(null);
  const elapsedBeforeHoldRef = useRef(0);
  const timerReturnScrollXRef = useRef(0);
  const timerReturnScrollYRef = useRef(0);
  const restoreTimerScrollFrameRef = useRef<number | null>(null);
  const postStopInputGuardRef = useRef<PostStopInputGuard | null>(null);
  const syncedLocalSolvesUserIdRef = useRef<string | null>(null);

  const activeSolves = useMemo(() => getActiveSolves(solves), [solves]);
  const stats = useMemo(() => calculateStats(solves), [solves]);
  const cfopPhaseStats = useMemo(() => calculateCfopPhaseStats(solves), [solves]);
  const practiceStats = useMemo(() => calculatePracticeStats(solves), [solves]);
  const recentSolves = useMemo(() => activeSolves.slice(0, 100), [activeSolves]);
  const recentChartSolves = useMemo(() => activeSolves.slice(0, 50), [activeSolves]);
  const todaySolves = useMemo(() => {
    const today = new Date();

    return activeSolves.filter((solve) => isSameLocalDate(solve.createdAt, today));
  }, [activeSolves]);
  const todayStats = useMemo(() => calculateStats(todaySolves), [todaySolves]);
  const weakPhase = useMemo(() => getWeakPhase(cfopPhaseStats), [cfopPhaseStats]);
  const crossPracticeHistory = useMemo(
    () => activeSolves.filter((solve) => solve.mode === "cross_practice").slice(0, 5),
    [activeSolves],
  );
  const f2lPracticeHistory = useMemo(
    () => activeSolves.filter((solve) => solve.mode === "f2l_practice").slice(0, 5),
    [activeSolves],
  );
  const f2lPairHistory = useMemo(
    () => activeSolves.filter((solve) => solve.mode === "f2l_pair_split").slice(0, 5),
    [activeSolves],
  );
  const lastSavedSolve = useMemo(
    () => solves.find((solve) => solve.id === lastSavedSolveId && solve.deletedAt === null),
    [lastSavedSolveId, solves],
  );

  const setTimerStatus = useCallback((nextTimerState: TimerState) => {
    timerStateRef.current = nextTimerState;
    setTimerState(nextTimerState);
  }, []);

  const clearHoldTimeout = useCallback(() => {
    if (holdTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(holdTimeoutRef.current);
    holdTimeoutRef.current = null;
  }, []);

  const rememberTimerReturnScroll = useCallback(() => {
    timerReturnScrollXRef.current = window.scrollX;
    timerReturnScrollYRef.current = window.scrollY;
  }, []);

  const restoreTimerReturnScroll = useCallback(() => {
    const left = timerReturnScrollXRef.current;
    const top = timerReturnScrollYRef.current;

    if (restoreTimerScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreTimerScrollFrameRef.current);
      restoreTimerScrollFrameRef.current = null;
    }

    restoreTimerScrollFrameRef.current = window.requestAnimationFrame(() => {
      restoreTimerScrollFrameRef.current = window.requestAnimationFrame(() => {
        window.scrollTo({ left, top, behavior: "auto" });
        restoreTimerScrollFrameRef.current = null;
      });
    });
  }, []);

  const clearPostStopInputGuard = useCallback(() => {
    const guard = postStopInputGuardRef.current;

    if (guard?.timeoutId !== null && guard?.timeoutId !== undefined) {
      window.clearTimeout(guard.timeoutId);
    }

    postStopInputGuardRef.current = null;
  }, []);

  const armPostStopInputGuard = useCallback(
    (pointerId: number | null) => {
      clearPostStopInputGuard();

      const guard: PostStopInputGuard = {
        pointerId,
        timeoutId: null,
        waitingForRelease: true,
      };

      guard.timeoutId = window.setTimeout(() => {
        if (postStopInputGuardRef.current === guard) {
          postStopInputGuardRef.current = null;
        }
      }, 1200);

      postStopInputGuardRef.current = guard;
    },
    [clearPostStopInputGuard],
  );

  const releasePostStopInputGuard = useCallback(() => {
    const guard = postStopInputGuardRef.current;

    if (!guard) {
      return;
    }

    if (guard.timeoutId !== null) {
      window.clearTimeout(guard.timeoutId);
    }

    guard.waitingForRelease = false;
    guard.timeoutId = window.setTimeout(() => {
      if (postStopInputGuardRef.current === guard) {
        postStopInputGuardRef.current = null;
      }
    }, 450);
  }, []);

  useEffect(() => {
    const syncLocation = () => setLocationInfo(getLocationInfo());

    window.addEventListener("popstate", syncLocation);
    window.addEventListener("hashchange", syncLocation);

    return () => {
      window.removeEventListener("popstate", syncLocation);
      window.removeEventListener("hashchange", syncLocation);
    };
  }, []);

  useEffect(() => {
    const stopGuardedEvent = (event: Event) => {
      if (event.cancelable) {
        event.preventDefault();
      }

      event.stopImmediatePropagation();
    };

    const matchesGuardedPointer = (event: PointerEvent, guard: PostStopInputGuard) =>
      guard.pointerId === null || guard.pointerId === event.pointerId;

    const handlePointerRelease = (event: PointerEvent) => {
      const guard = postStopInputGuardRef.current;

      if (!guard || !matchesGuardedPointer(event, guard)) {
        return;
      }

      stopGuardedEvent(event);
      releasePostStopInputGuard();
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!postStopInputGuardRef.current) {
        return;
      }

      stopGuardedEvent(event);
      releasePostStopInputGuard();
    };

    const handleDelayedPress = (event: PointerEvent) => {
      const guard = postStopInputGuardRef.current;

      if (!guard || guard.waitingForRelease) {
        return;
      }

      stopGuardedEvent(event);
    };

    const handleDelayedClick = (event: MouseEvent) => {
      if (!postStopInputGuardRef.current) {
        return;
      }

      stopGuardedEvent(event);
    };

    window.addEventListener("pointerup", handlePointerRelease, true);
    window.addEventListener("pointercancel", handlePointerRelease, true);
    window.addEventListener("pointerdown", handleDelayedPress, true);
    window.addEventListener("click", handleDelayedClick, true);
    window.addEventListener("touchend", handleTouchEnd, { capture: true, passive: false });
    window.addEventListener("touchcancel", handleTouchEnd, { capture: true, passive: false });

    return () => {
      window.removeEventListener("pointerup", handlePointerRelease, true);
      window.removeEventListener("pointercancel", handlePointerRelease, true);
      window.removeEventListener("pointerdown", handleDelayedPress, true);
      window.removeEventListener("click", handleDelayedClick, true);
      window.removeEventListener("touchend", handleTouchEnd, true);
      window.removeEventListener("touchcancel", handleTouchEnd, true);
    };
  }, [releasePostStopInputGuard]);

  useEffect(
    () => () => {
      if (restoreTimerScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreTimerScrollFrameRef.current);
      }

      clearPostStopInputGuard();
    },
    [clearPostStopInputGuard],
  );

  useEffect(() => {
    if (!isAuthConfigured()) {
      setIsAuthLoading(false);
      return;
    }

    let isDisposed = false;
    const unsubscribe = subscribeToAuthUserChange((nextUser) => {
      setAuthUser(nextUser);
      setIsAuthLoading(false);
    });

    getCurrentAuthUser()
      .then((currentUser) => {
        if (!isDisposed) {
          setAuthUser(currentUser);
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setAuthNotice("ログイン状態を確認できませんでした。Supabase設定を確認してください。");
        }
      })
      .finally(() => {
        if (!isDisposed) {
          setIsAuthLoading(false);
        }
      });

    return () => {
      isDisposed = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authUser || !isAuthConfigured()) {
      setAuthProfile(null);
      return;
    }

    let isDisposed = false;

    getMyProfile()
      .then((profile) => {
        if (!isDisposed) {
          setAuthProfile(profile);
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setAuthProfile(null);
        }
      });

    return () => {
      isDisposed = true;
    };
  }, [authUser]);

  useEffect(() => {
    const draft = loadCurrentSolveDraft();

    if (draft?.status === "running") {
      clearCurrentSolveDraft();
      setDraftMessage("前回の計測は未完了のため保存しませんでした。");
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themePreference;
    saveThemePreference(themePreference);
  }, [themePreference]);

  useEffect(() => {
    saveCurrentScramble(scramble);
  }, [scramble]);

  useEffect(() => {
    document.body.classList.toggle("timing", timerState === "running");
    document.body.classList.toggle(
      "timer-preparing",
      timerState === "holding" || timerState === "ready",
    );

    return () => {
      document.body.classList.remove("timing");
      document.body.classList.remove("timer-preparing");
    };
  }, [timerState]);

  useEffect(() => {
    if (lastSavedSolveId === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLastSavedSolveId(null);
    }, LAST_SOLVE_NOTICE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [lastSavedSolveId]);

  useEffect(() => {
    if (shareStatus === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShareStatus(null);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [shareStatus]);

  useEffect(() => {
    if (authNotice === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAuthNotice(null);
    }, 6000);

    return () => window.clearTimeout(timeoutId);
  }, [authNotice]);

  useEffect(() => {
    if (timerState !== "running") {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [timerState]);

  useEffect(() => {
    if (timerState !== "running") {
      return;
    }

    const update = (now: number) => {
      if (startTimeRef.current === null) {
        return;
      }

      setElapsedMs(now - startTimeRef.current);
      animationFrameRef.current = requestAnimationFrame(update);
    };

    animationFrameRef.current = requestAnimationFrame(update);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [timerState]);

  const persistAndSetSolves = useCallback((nextSolves: SolveRecord[]) => {
    setSolves(nextSolves);
    saveSolves(nextSolves);
  }, []);

  const syncLocalSolvesToCloud = useCallback(
    async (candidateSolves = solves): Promise<CloudSyncResult> => {
      const localSolves = getActiveSolves(candidateSolves);

      if (!authUser || !isAuthConfigured() || localSolves.length === 0) {
        return { total: localSolves.length, uploaded: 0, skipped: 0 };
      }

      const existingRows = await getMySolveSessions({ includeDeleted: true, limit: 10000 });
      const existingFingerprints = new Set(existingRows.map(getCloudRowFingerprint));
      const existingLooseFingerprints = new Set(existingRows.map(getCloudRowLooseFingerprint));
      let uploaded = 0;
      let skipped = 0;

      for (const solve of localSolves) {
        const input = buildCloudSolveSessionInput(solve);
        const hasSameLocalId = existingRows.some((row) =>
          row.notes?.includes(getLocalSyncNote(solve)),
        );
        const hasSameRecord =
          existingFingerprints.has(getCloudInputFingerprint(input)) ||
          existingLooseFingerprints.has(getCloudInputLooseFingerprint(input));

        if (hasSameLocalId || hasSameRecord) {
          skipped += 1;
          continue;
        }

        await saveSolveSession(input);
        existingFingerprints.add(getCloudInputFingerprint(input));
        existingLooseFingerprints.add(getCloudInputLooseFingerprint(input));
        uploaded += 1;
      }

      return {
        total: localSolves.length,
        uploaded,
        skipped,
      };
    },
    [authUser, solves],
  );

  useEffect(() => {
    if (
      !authUser ||
      !isAuthConfigured() ||
      activeSolves.length === 0 ||
      syncedLocalSolvesUserIdRef.current === authUser.id
    ) {
      return;
    }

    syncedLocalSolvesUserIdRef.current = authUser.id;

    void syncLocalSolvesToCloud()
      .then((result) => {
        if (result.uploaded > 0) {
          setAuthNotice(
            `この端末の履歴 ${result.uploaded}件をアカウントへアップロードしました。`,
          );
          return;
        }

        if (result.skipped > 0) {
          setAuthNotice("この端末の履歴はすでにアカウントへ保存済みです。");
        }
      })
      .catch(() => {
        setAuthNotice("ログインしましたが、この端末の履歴アップロードに失敗しました。");
      });
  }, [activeSolves.length, authUser, syncLocalSolvesToCloud]);

  const syncSolveToCloud = useCallback(
    (solve: SolveRecord) => {
      if (!authUser || !isAuthConfigured()) {
        return;
      }

      void saveSolveSession(buildCloudSolveSessionInput(solve))
        .then(() => {
          setAuthNotice("記録をクラウドにも保存しました。");
        })
        .catch(() => {
          setAuthNotice("ローカル保存は完了しましたが、クラウド保存に失敗しました。");
        });
    },
    [authUser],
  );

  const finishSolve = useCallback(
    (solve: SolveRecord, finalTime: number) => {
      startTimeRef.current = null;
      setElapsedMs(finalTime);
      setTimerStatus("finished");
      setSplitDrafts([]);
      setScramble(generateScramble());
      clearCurrentSolveDraft();
      setLastSavedSolveId(solve.id);
      setUndoState(null);
      persistAndSetSolves([solve, ...solves]);
      syncSolveToCloud(solve);
      restoreTimerReturnScroll();
    },
    [persistAndSetSolves, restoreTimerReturnScroll, setTimerStatus, solves, syncSolveToCloud],
  );

  const startTimer = useCallback(() => {
    const startTime = performance.now();

    rememberTimerReturnScroll();
    startTimeRef.current = startTime;
    setElapsedMs(0);
    setSplitDrafts([]);
    setTimerStatus("running");
    setDraftMessage(null);
    saveCurrentSolveDraft({
      status: "running",
      mode: timerMode,
      startTime,
      scramble,
      splits: [],
    });
  }, [rememberTimerReturnScroll, scramble, setTimerStatus, timerMode]);

  const stopNormalTimer = useCallback(() => {
    if (startTimeRef.current === null) {
      return;
    }

    const totalTime = Math.max(0, Math.round(performance.now() - startTimeRef.current));
    const solve: SolveRecord = {
      id: createId(),
      mode: "normal",
      totalTime,
      scramble,
      penalty: "none",
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };

    finishSolve(solve, totalTime);
  }, [finishSolve, scramble]);

  const advanceCfopSplit = useCallback(() => {
    if (startTimeRef.current === null) {
      return;
    }

    const totalTime = Math.max(0, Math.round(performance.now() - startTimeRef.current));
    const nextPhase = CFOP_PHASES[splitDrafts.length];

    if (!nextPhase) {
      return;
    }

    const previousCumulative =
      splitDrafts.length === 0 ? 0 : splitDrafts[splitDrafts.length - 1].cumulativeTime;
    const nextSplit: SplitDraft = {
      phase: nextPhase.phase,
      time: Math.max(0, totalTime - previousCumulative),
      cumulativeTime: totalTime,
    };
    const nextSplits = [...splitDrafts, nextSplit];

    if (nextPhase.phase !== "pll") {
      setElapsedMs(totalTime);
      setSplitDrafts(nextSplits);
      saveCurrentSolveDraft({
        status: "running",
        mode: "cfop_split",
        startTime: startTimeRef.current,
        scramble,
        splits: nextSplits,
      });
      return;
    }

    const solve: SolveRecord = {
      id: createId(),
      mode: "cfop_split",
      totalTime,
      crossTime: getSplitTime(nextSplits, "cross"),
      f2lTime: getSplitTime(nextSplits, "f2l"),
      ollTime: getSplitTime(nextSplits, "oll"),
      pllTime: getSplitTime(nextSplits, "pll"),
      scramble,
      penalty: "none",
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };

    finishSolve(solve, totalTime);
  }, [finishSolve, scramble, splitDrafts]);

  const finishCrossPractice = useCallback(() => {
    if (startTimeRef.current === null) {
      return;
    }

    const totalTime = Math.max(0, Math.round(performance.now() - startTimeRef.current));
    const solve: SolveRecord = {
      id: createId(),
      mode: "cross_practice",
      totalTime,
      crossTime: totalTime,
      crossColor: "white",
      scramble,
      penalty: "none",
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };

    finishSolve(solve, totalTime);
  }, [finishSolve, scramble]);

  const finishF2lPractice = useCallback(() => {
    if (startTimeRef.current === null) {
      return;
    }

    const totalTime = Math.max(0, Math.round(performance.now() - startTimeRef.current));
    const solve: SolveRecord = {
      id: createId(),
      mode: "f2l_practice",
      totalTime,
      f2lTime: totalTime,
      scramble,
      penalty: "none",
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };

    finishSolve(solve, totalTime);
  }, [finishSolve, scramble]);

  const advanceF2lPairSplit = useCallback(() => {
    if (startTimeRef.current === null) {
      return;
    }

    const totalTime = Math.max(0, Math.round(performance.now() - startTimeRef.current));
    const nextPhase = F2L_PAIR_PHASES[splitDrafts.length];

    if (!nextPhase) {
      return;
    }

    const previousCumulative =
      splitDrafts.length === 0 ? 0 : splitDrafts[splitDrafts.length - 1].cumulativeTime;
    const nextSplit: SplitDraft = {
      phase: nextPhase.phase,
      time: Math.max(0, totalTime - previousCumulative),
      cumulativeTime: totalTime,
    };
    const nextSplits = [...splitDrafts, nextSplit];

    if (nextPhase.phase !== "pair4") {
      setElapsedMs(totalTime);
      setSplitDrafts(nextSplits);
      saveCurrentSolveDraft({
        status: "running",
        mode: "f2l_pair_split",
        startTime: startTimeRef.current,
        scramble,
        splits: nextSplits,
      });
      return;
    }

    const solve: SolveRecord = {
      id: createId(),
      mode: "f2l_pair_split",
      totalTime,
      pair1Time: getSplitTime(nextSplits, "pair1"),
      pair2Time: getSplitTime(nextSplits, "pair2"),
      pair3Time: getSplitTime(nextSplits, "pair3"),
      pair4Time: getSplitTime(nextSplits, "pair4"),
      scramble,
      penalty: "none",
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };

    finishSolve(solve, totalTime);
  }, [finishSolve, scramble, splitDrafts]);

  const handleRunningTimerInput = useCallback(() => {
    const now = performance.now();

    if (now - lastInputAtRef.current < INPUT_DEBOUNCE_MS) {
      return;
    }

    lastInputAtRef.current = now;

    if (timerStateRef.current !== "running") {
      return;
    }

    if (timerMode === "normal") {
      stopNormalTimer();
      return;
    }

    if (timerMode === "cfop_split") {
      advanceCfopSplit();
      return;
    }

    if (timerMode === "cross_practice") {
      finishCrossPractice();
      return;
    }

    if (timerMode === "f2l_practice") {
      finishF2lPractice();
      return;
    }

    advanceF2lPairSplit();
  }, [
    advanceCfopSplit,
    advanceF2lPairSplit,
    finishCrossPractice,
    finishF2lPractice,
    stopNormalTimer,
    timerMode,
  ]);

  const willRunningTimerInputFinishSolve = useCallback(() => {
    switch (timerMode) {
      case "normal":
      case "cross_practice":
      case "f2l_practice":
        return true;
      case "cfop_split":
        return splitDrafts.length >= CFOP_PHASES.length - 1;
      case "f2l_pair_split":
        return splitDrafts.length >= F2L_PAIR_PHASES.length - 1;
    }
  }, [splitDrafts.length, timerMode]);

  const clearPointerStartCandidate = useCallback((restoreState: boolean) => {
    const candidate = pointerStartCandidateRef.current;

    if (!candidate) {
      return false;
    }

    window.clearTimeout(candidate.timeoutId);
    pointerStartCandidateRef.current = null;

    if (restoreState && timerStateRef.current === "pendingStart") {
      setTimerStatus(candidate.returnState);
    }

    return true;
  }, [setTimerStatus]);

  const cancelStartHold = useCallback(() => {
    const cancelledPendingStart = clearPointerStartCandidate(true);
    const shouldRestoreElapsed =
      timerStateRef.current === "holding" || timerStateRef.current === "ready";

    clearHoldTimeout();
    holdSourceRef.current = null;
    holdPointerIdRef.current = null;

    if (shouldRestoreElapsed) {
      setElapsedMs(elapsedBeforeHoldRef.current);
      setTimerStatus(holdReturnStateRef.current);
      return;
    }

    if (!cancelledPendingStart && timerStateRef.current === "pendingStart") {
      setTimerStatus("idle");
    }
  }, [clearHoldTimeout, clearPointerStartCandidate, setTimerStatus]);

  const beginStartHold = useCallback(
    (
      source: StartHoldSource,
      pointerId: number | null = null,
      readyDelayMs = HOLD_TO_START_MS,
    ) => {
      const currentState = timerStateRef.current;
      const pointerCanStartFromPending = source === "pointer" && currentState === "pendingStart";

      if (
        (!isStartableTimerState(currentState) && !pointerCanStartFromPending) ||
        holdSourceRef.current !== null
      ) {
        return;
      }

      const now = performance.now();

      if (now - lastInputAtRef.current < INPUT_DEBOUNCE_MS) {
        return;
      }

      clearHoldTimeout();
      const pointerCandidate = pointerStartCandidateRef.current;
      const returnState =
        pointerCandidate?.returnState ??
        (currentState === "finished" ? "finished" : "idle");

      clearPointerStartCandidate(false);
      elapsedBeforeHoldRef.current = elapsedMs;
      holdReturnStateRef.current = returnState;
      holdSourceRef.current = source;
      holdPointerIdRef.current = pointerId;
      holdStartXRef.current = pointerCandidate?.startX ?? 0;
      holdStartYRef.current = pointerCandidate?.startY ?? 0;
      setElapsedMs(0);
      setSplitDrafts([]);
      setTimerStatus("holding");

      holdTimeoutRef.current = window.setTimeout(() => {
        if (timerStateRef.current !== "holding" || holdSourceRef.current !== source) {
          return;
        }

        setTimerStatus("ready");
        holdTimeoutRef.current = null;
      }, readyDelayMs);
    },
    [clearHoldTimeout, clearPointerStartCandidate, elapsedMs, setTimerStatus],
  );

  const beginPointerStartCandidate = useCallback(
    (pointerId: number, clientX: number, clientY: number) => {
      const currentState = timerStateRef.current;

      if (
        !isStartableTimerState(currentState) ||
        holdSourceRef.current !== null ||
        pointerStartCandidateRef.current !== null
      ) {
        return;
      }

      const now = performance.now();

      if (now - lastInputAtRef.current < INPUT_DEBOUNCE_MS) {
        return;
      }

      const returnState: StartReturnState = currentState === "finished" ? "finished" : "idle";

      elapsedBeforeHoldRef.current = elapsedMs;
      holdReturnStateRef.current = returnState;
      setTimerStatus("pendingStart");

      const timeoutId = window.setTimeout(() => {
        const candidate = pointerStartCandidateRef.current;

        if (
          !candidate ||
          candidate.pointerId !== pointerId ||
          timerStateRef.current !== "pendingStart"
        ) {
          return;
        }

        beginStartHold(
          "pointer",
          pointerId,
          Math.max(0, HOLD_TO_START_MS - POINTER_START_PENDING_MS),
        );
      }, POINTER_START_PENDING_MS);

      pointerStartCandidateRef.current = {
        pointerId,
        startX: clientX,
        startY: clientY,
        returnState,
        timeoutId,
      };
    },
    [beginStartHold, elapsedMs, setTimerStatus],
  );

const hasPointerMovedEnoughToScroll = useCallback(
  (pointerId: number, clientX: number, clientY: number) => {
    const candidate = pointerStartCandidateRef.current;

    if (candidate && candidate.pointerId === pointerId) {
      const deltaX = clientX - candidate.startX;
      const deltaY = clientY - candidate.startY;
      const distance = Math.hypot(deltaX, deltaY);

      return Math.abs(deltaY) >= POINTER_SCROLL_CANCEL_PX || distance >= POINTER_SCROLL_CANCEL_PX;
    }

    if (holdSourceRef.current === "pointer" && holdPointerIdRef.current === pointerId) {
      if (timerStateRef.current !== "holding") {
        return false;
      }

      const deltaX = clientX - holdStartXRef.current;
      const deltaY = clientY - holdStartYRef.current;
      const distance = Math.hypot(deltaX, deltaY);

      return Math.abs(deltaY) >= POINTER_SCROLL_CANCEL_PX || distance >= POINTER_SCROLL_CANCEL_PX;
    }

    return false;
  },
  [],
);

  const releaseStartHold = useCallback(
    (source: StartHoldSource, pointerId: number | null = null) => {
      if (holdSourceRef.current !== source) {
        return;
      }

      if (
        source === "pointer" &&
        pointerId !== null &&
        holdPointerIdRef.current !== null &&
        holdPointerIdRef.current !== pointerId
      ) {
        return;
      }

      const wasReady = timerStateRef.current === "ready";

      clearHoldTimeout();
      holdSourceRef.current = null;
      holdPointerIdRef.current = null;

      if (!wasReady) {
        setElapsedMs(elapsedBeforeHoldRef.current);
        setTimerStatus(holdReturnStateRef.current);
        return;
      }

      lastInputAtRef.current = performance.now();
      startTimer();
    },
    [clearHoldTimeout, setTimerStatus, startTimer],
  );

  useEffect(() => {
  const handleWindowTouchEnd = () => {
    if (timerStateRef.current !== "ready") {
      return;
    }

    if (holdSourceRef.current !== "pointer") {
      return;
    }

    releaseStartHold("pointer", holdPointerIdRef.current);
  };

  window.addEventListener("touchend", handleWindowTouchEnd, { passive: true });

  return () => {
    window.removeEventListener("touchend", handleWindowTouchEnd);
  };
}, [releaseStartHold]);

  const handleTimerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!event.isPrimary) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      if (timerStateRef.current === "running") {
        const willFinishSolve =
          performance.now() - lastInputAtRef.current >= INPUT_DEBOUNCE_MS &&
          willRunningTimerInputFinishSolve();

        if (willFinishSolve && event.pointerType !== "mouse") {
          armPostStopInputGuard(event.pointerId);
        }

        event.preventDefault();
        event.stopPropagation();
        handleRunningTimerInput();
        return;
      }

      if (event.pointerType === "mouse") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is best-effort; pointerup still works when supported by the browser.
        }
      }

      beginPointerStartCandidate(event.pointerId, event.clientX, event.clientY);
    },
    [
      armPostStopInputGuard,
      beginPointerStartCandidate,
      handleRunningTimerInput,
      willRunningTimerInputFinishSolve,
    ],
  );

  const handleTimerPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!event.isPrimary) {
        return;
      }

      if (hasPointerMovedEnoughToScroll(event.pointerId, event.clientX, event.clientY)) {
        cancelStartHold();
      }
    },
    [cancelStartHold, hasPointerMovedEnoughToScroll],
  );

  const handleTimerPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!event.isPrimary) {
        return;
      }

      if (pointerStartCandidateRef.current?.pointerId === event.pointerId) {
        clearPointerStartCandidate(true);
        return;
      }

      if (holdSourceRef.current !== "pointer") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      releaseStartHold("pointer", event.pointerId);
    },
    [clearPointerStartCandidate, releaseStartHold],
  );

const handleTimerPointerCancel = useCallback(
  (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (
      timerStateRef.current === "ready" &&
      holdSourceRef.current === "pointer" &&
      holdPointerIdRef.current === event.pointerId
    ) {
      return;
    }

    cancelStartHold();
  },
  [cancelStartHold],
);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        cancelStartHold();
        return;
      }

      if (event.code !== "Space" || locationInfo.page !== "timer") {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.repeat) {
        return;
      }

      if (timerStateRef.current === "running") {
        handleRunningTimerInput();
        return;
      }

      beginStartHold("keyboard");
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || locationInfo.page !== "timer") {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      releaseStartHold("keyboard");
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [
    beginStartHold,
    cancelStartHold,
    handleRunningTimerInput,
    locationInfo.page,
    releaseStartHold,
  ]);

  useEffect(() => {
    if (locationInfo.page !== "timer") {
      cancelStartHold();
    }
  }, [cancelStartHold, locationInfo.page]);

  useEffect(() => {
    cancelStartHold();
  }, [cancelStartHold, timerMode]);

  useEffect(() => {
    const cancelIfPreparing = () => {
      if (timerStateRef.current === "holding" || timerStateRef.current === "ready") {
        cancelStartHold();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelIfPreparing();
      }
    };

    window.addEventListener("blur", cancelIfPreparing);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("blur", cancelIfPreparing);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [cancelStartHold]);

  const updatePenalty = (id: string, penalty: Penalty) => {
    const nextSolves = solves.map((solve) =>
      solve.id === id ? { ...solve, penalty: nextPenalty(solve.penalty, penalty) } : solve,
    );

    persistAndSetSolves(nextSolves);
  };

  const softDeleteSolve = (id: string, message = "記録を削除しました。") => {
    const targetSolve = solves.find((solve) => solve.id === id);

    if (!targetSolve) {
      return;
    }

    const deletedAt = new Date().toISOString();
    const nextSolves = solves.map((solve) =>
      solve.id === id ? { ...solve, deletedAt } : solve,
    );

    setLastSavedSolveId((currentId) => (currentId === id ? null : currentId));
    setUndoState({ solveId: id, message });
    persistAndSetSolves(nextSolves);
  };

  const restoreSolve = (id: string) => {
    const nextSolves = solves.map((solve) =>
      solve.id === id ? { ...solve, deletedAt: null } : solve,
    );

    setUndoState(null);
    persistAndSetSolves(nextSolves);
  };

  const shareText = useCallback(async (text: string, title = "Cube Split Timer") => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text });
        setShareStatus("共有を開きました。");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          setShareStatus("共有をキャンセルしました。");
          return;
        }
      }
    }

    try {
      await copyTextWithFallback(text);
      setShareStatus("共有テキストをクリップボードにコピーしました。");
    } catch {
      setShareStatus("共有できませんでした。テキストを選択してコピーしてください。");
    }
  }, []);

  const shareSolve = useCallback(
    (solve: SolveRecord) => {
      if (solve.deletedAt !== null) {
        return;
      }

      void shareText(buildSolveShareText(solve, stats));
    },
    [shareText, stats],
  );

  const shareTodaySummary = useCallback(() => {
    void shareText(buildTodaySummaryShareText(todaySolves, todayStats), "今日のまとめ");
  }, [shareText, todaySolves, todayStats]);

  const toggleMobileNavCollapse = useCallback(() => {
    setIsMobileNavCollapsed((currentValue) => {
      const nextValue = !currentValue;

      saveMobileNavCollapsed(nextValue);
      return nextValue;
    });
  }, []);

  const navigateTo = useCallback((path: string, hash = "") => {
    const [pathname, inlineHash = ""] = path.split("#");
    const nextHash = hash || (inlineHash ? `#${inlineHash}` : "");
    const nextPath = pathname || "/";
    const nextUrl = `${nextPath}${nextHash}`;

    window.history.pushState(null, "", nextUrl);
    setLocationInfo(getLocationInfo());

    window.setTimeout(() => {
      if (!nextHash) {
        window.scrollTo({ top: 0 });
        return;
      }

      document.getElementById(nextHash.slice(1))?.scrollIntoView({ block: "start" });
    }, 0);
  }, []);

  const openHelp = useCallback(
    (topicId = "overview") => {
      navigateTo("/help", `#${topicId}`);
    },
    [navigateTo],
  );

  const closeHelp = useCallback(() => {
    navigateTo("/");
  }, [navigateTo]);

  const openTimer = useCallback(() => {
    navigateTo("/");
  }, [navigateTo]);

  const openFeedback = useCallback(() => {
    navigateTo("/feedback");
  }, [navigateTo]);

  const openLogin = useCallback(() => {
    navigateTo("/login");
  }, [navigateTo]);

  const openAdmin = useCallback(() => {
    navigateTo("/admin");
  }, [navigateTo]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOutCurrentUser();
      setAuthUser(null);
      setAuthProfile(null);
      setAuthNotice("ログアウトしました。");
    } catch {
      setAuthNotice("ログアウトできませんでした。時間を置いてもう一度試してください。");
    }
  }, []);

  const openCurrentScrambleInAnalyzer = useCallback(() => {
    navigateTo(`/analyzer?scramble=${encodeURIComponent(scramble)}`);
  }, [navigateTo, scramble]);

  const openCurrentScramblePreview = useCallback(() => {
    saveCurrentScramble(scramble);
    navigateTo(
      `/scramble?scramble=${encodeURIComponent(scramble)}&returnTo=${encodeURIComponent("/")}`,
    );
  }, [navigateTo, scramble]);

  const copyCurrentScramble = useCallback(async () => {
    try {
      await copyTextWithFallback(scramble);
      setShareStatus("スクランブルをコピーしました。");
    } catch {
      setShareStatus("スクランブルをコピーできませんでした。");
    }
  }, [scramble]);

  const exportLocalSolves = useCallback(async () => {
    await copyTextWithFallback(stringifySolvesBackup(solves));
    setShareStatus("この端末の履歴データをコピーしました。");
  }, [solves]);

  const importLocalSolves = useCallback(
    (raw: string): LocalImportResult => {
      const importedSolves = parseSolvesBackup(raw);
      const mergedSolves = mergeSolvesById(solves, importedSolves);
      const added = Math.max(0, mergedSolves.length - solves.length);

      persistAndSetSolves(mergedSolves);

      return {
        imported: importedSolves.length,
        added,
        total: mergedSolves.length,
      };
    },
    [persistAndSetSolves, solves],
  );

  const uploadLocalSolvesToAccount = useCallback(async (): Promise<CloudSyncResult> => {
    const result = await syncLocalSolvesToCloud();

    if (result.uploaded > 0) {
      setAuthNotice(`この端末の履歴 ${result.uploaded}件をアカウントへアップロードしました。`);
    } else if (result.total === 0) {
      setAuthNotice("この端末にはアップロードする履歴がありません。");
    } else {
      setAuthNotice("この端末の履歴はすでにアカウントへ保存済みです。");
    }

    return result;
  }, [syncLocalSolvesToCloud]);

  const dismissTutorial = useCallback(() => {
    markTutorialSeen();
    setIsTutorialOpen(false);
  }, []);

  const openHelpFromTutorial = useCallback(() => {
    dismissTutorial();
    openHelp("overview");
  }, [dismissTutorial, openHelp]);

  const isPreparingToStart = timerState === "holding" || timerState === "ready";
  const timerButtonClassName = [
    "timer-button",
    timerState === "holding" ? "timer-button-holding" : "",
    timerState === "ready" ? "timer-button-ready" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const timerDisplayText = isPreparingToStart ? "0.00" : formatTime(elapsedMs);
  const timerButtonHint = getTimerPrepareHint(timerState, timerMode);
  const globalNav = (
    <GlobalAppNav
      activePage={locationInfo.page}
      isAdmin={authProfile?.role === "admin"}
      isMobileCollapsed={isMobileNavCollapsed}
      onNavigate={navigateTo}
      onOpenLogin={openLogin}
      onToggleMobileCollapse={toggleMobileNavCollapse}
      authLabel={authUser ? getAuthUserLabel(authUser) : "Login"}
      isAuthLoading={isAuthLoading}
      isSignedIn={Boolean(authUser)}
    />
  );

  if (timerState === "running") {
    const currentCfopPhase =
      timerMode === "cfop_split" ? CFOP_PHASES[splitDrafts.length] : null;
    const currentPairPhase =
      timerMode === "f2l_pair_split" ? F2L_PAIR_PHASES[splitDrafts.length] : null;
    const screenLabel =
      currentCfopPhase?.label ??
      currentPairPhase?.label ??
      (timerMode === "cross_practice"
        ? "Cross Practice"
        : timerMode === "f2l_practice"
          ? "F2L Practice"
          : "Timing");
    const timerHint =
      timerMode === "cfop_split"
        ? currentCfopPhase?.phase === "pll"
          ? "Tap or Space to finish PLL"
          : `Tap or Space when ${currentCfopPhase?.label ?? "phase"} is done`
        : timerMode === "cross_practice"
          ? "Tap or Space when Cross is done"
          : timerMode === "f2l_practice"
            ? "Tap or Space when F2L is done"
            : timerMode === "f2l_pair_split"
              ? currentPairPhase?.phase === "pair4"
                ? "Tap or Space to finish Pair 4"
                : `Tap or Space when ${currentPairPhase?.label ?? "pair"} is done`
              : "Tap or Space to stop";

    return (
      <main className="timer-screen" onPointerDown={handleTimerPointerDown} aria-label="Timing">
        <p className="timer-screen-label">{screenLabel}</p>
        <div className="timer-screen-time">{formatTime(elapsedMs)}</div>
        {splitDrafts.length > 0 && (
          <div className="running-splits" aria-label="Recorded splits">
            {splitDrafts.map((split) => (
              <span key={split.phase}>
                {getPhaseLabel(split.phase)} {formatTime(split.time)}
              </span>
            ))}
          </div>
        )}
        <p className="timer-screen-hint">{timerHint}</p>
      </main>
    );
  }

  if (locationInfo.page === "help") {
    return (
      <>
        {globalNav}
        <HelpPage
          activeTopicId={getHelpTopicId(locationInfo.hash)}
          onBack={closeHelp}
          onOpenTimer={openTimer}
        />
      </>
    );
  }

  if (locationInfo.page === "learn") {
    return (
      <>
        {globalNav}
        <Suspense
          fallback={
            <main className="app-shell learn-page">
              <div className="notice" role="status">
                Learnページを読み込んでいます。
              </div>
            </main>
          }
        >
          <LearnPage path={locationInfo.path} onNavigate={navigateTo} onOpenTimer={openTimer} />
        </Suspense>
      </>
    );
  }

  if (locationInfo.page === "analyzer") {
    return (
      <>
        {globalNav}
        <Suspense
          fallback={
            <main className="app-shell analyzer-page">
              <div className="notice" role="status">
                Analyzerページを読み込んでいます。
              </div>
            </main>
          }
        >
          <AnalyzerPage onNavigate={navigateTo} onOpenTimer={openTimer} />
        </Suspense>
      </>
    );
  }

  if (locationInfo.page === "scramble") {
    return (
      <>
        {globalNav}
        <Suspense
          fallback={
            <main className="app-shell scramble-preview-page">
              <div className="notice" role="status">
                スクランブル確認ページを読み込んでいます。
              </div>
            </main>
          }
        >
          <ScramblePreviewPage onNavigate={navigateTo} onOpenTimer={openTimer} />
        </Suspense>
      </>
    );
  }

  if (locationInfo.page === "feedback") {
    return (
      <>
        {globalNav}
        <FeedbackPage
          currentScramble={scramble}
          timerMode={timerMode}
          onBack={openTimer}
          onOpenTimer={openTimer}
        />
      </>
    );
  }

  if (locationInfo.page === "login") {
    return (
      <>
        {globalNav}
        <AuthPage
          user={authUser}
          isAdmin={authProfile?.role === "admin"}
          isLoading={isAuthLoading}
          isConfigured={isAuthConfigured()}
          onBack={openTimer}
          onOpenTimer={openTimer}
          onOpenAdmin={openAdmin}
          onSignedIn={(message) => {
            setAuthNotice(message);
            openTimer();
          }}
          onSignedOut={handleSignOut}
          localSolveCount={activeSolves.length}
          onExportLocalSolves={exportLocalSolves}
          onImportLocalSolves={importLocalSolves}
          onUploadLocalSolves={uploadLocalSolvesToAccount}
        />
      </>
    );
  }

  if (locationInfo.page === "admin") {
    return (
      <>
        {globalNav}
        <Suspense
          fallback={
            <main className="app-shell admin-page">
              <div className="notice" role="status">
                管理者画面を読み込んでいます。
              </div>
            </main>
          }
        >
          <AdminPage user={authUser} onOpenLogin={openLogin} onOpenTimer={openTimer} />
        </Suspense>
      </>
    );
  }

  if (locationInfo.page === "reset-password") {
    return (
      <>
        {globalNav}
        <ResetPasswordPage onOpenLogin={openLogin} onOpenTimer={openTimer} />
      </>
    );
  }

  if (locationInfo.page === "analysis") {
    return (
      <>
        {globalNav}
        <main className="app-shell">
          <header className="app-header">
            <div>
              <p className="eyebrow">Analysis</p>
              <h1>記録分析</h1>
            </div>
            <div className="header-actions">
              <button className="ghost-button" type="button" onClick={shareTodaySummary}>
                今日のまとめ共有
              </button>
              <HelpButton label="Open analysis help" onClick={() => openHelp("cfop")} />
            </div>
          </header>

          <section className="quick-stats" aria-label="Quick statistics">
            <StatCard label="ao5" value={formatAverage(stats.ao5)} />
            <StatCard label="ao12" value={formatAverage(stats.ao12)} />
          </section>

          <section className="stats-grid" aria-label="Statistics">
            <StatCard label="Solves" value={String(stats.count)} />
            <StatCard label="Average" value={formatAverage(stats.average)} />
            <StatCard label="Best" value={formatAverage(stats.best)} />
            <StatCard label="Worst" value={formatAverage(stats.worst)} />
          </section>

          <section className="analysis-section" aria-label="Analysis">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Session</p>
                <h2>Session Overview</h2>
              </div>
            </div>

            <div className="analysis-grid">
              <StatCard label="Solves" value={String(stats.count)} />
              <StatCard label="Average" value={formatAverage(stats.average)} />
              <StatCard label="Best" value={formatAverage(stats.best)} />
              <StatCard label="Worst" value={formatAverage(stats.worst)} />
              <StatCard label="ao5" value={formatAverage(stats.ao5)} />
              <StatCard label="ao12" value={formatAverage(stats.ao12)} />
              <StatCard label="ao50" value={formatAverage(stats.ao50)} />
              <StatCard label="ao100" value={formatAverage(stats.ao100)} />
            </div>

            <article className="weak-phase-card">
              <div>
                <p className="eyebrow">Weak Phase</p>
                <h3>苦手フェーズ</h3>
              </div>
              {weakPhase ? (
                <div className="weak-phase-result">
                  <strong>{weakPhase.label}</strong>
                  <span>
                    平均 {formatTime(weakPhase.average)}
                    {weakPhase.delta > 0 &&
                      ` / フェーズ平均より ${formatTime(weakPhase.delta)} 遅め`}
                  </span>
                </div>
              ) : (
                <p>CFOP Splitの記録がまだありません。</p>
              )}
            </article>

            <div className="analysis-subheading">
              <p className="eyebrow">CFOP Split</p>
              <h3>Phase Stats</h3>
            </div>
            <div className="phase-grid">
              {CFOP_PHASES.map(({ phase, label }) => (
                <PhaseStatCard key={phase} label={label} stat={cfopPhaseStats[phase]} />
              ))}
            </div>

            <RecentChart solves={recentChartSolves} />
          </section>
        </main>
      </>
    );
  }

  if (locationInfo.page === "practice") {
    return (
      <>
        {globalNav}
        <main className="app-shell">
          <header className="app-header">
            <div>
              <p className="eyebrow">Practice</p>
              <h1>練習モード</h1>
            </div>
            <HelpButton label="Open practice help" onClick={() => openHelp("practice")} />
          </header>

          <section className="practice-section" aria-label="Practice statistics">
            <div className="practice-grid">
              <PracticeStatCard title="Cross Practice" stats={practiceStats.crossPractice} />
              <PracticeStatCard title="F2L Practice" stats={practiceStats.f2lPractice} />
              <PracticeStatCard title="F2L Pair Split" stats={practiceStats.f2lPairSplit} />
            </div>

            <div className="analysis-subheading">
              <p className="eyebrow">F2L Pair Split</p>
              <h3>Pair Stats</h3>
            </div>
            <div className="phase-grid pair-grid" aria-label="F2L pair statistics">
              {F2L_PAIR_PHASES.map(({ phase, label }) => (
                <PhaseStatCard key={phase} label={label} stat={practiceStats.pairs[phase]} />
              ))}
            </div>

            <div className="practice-history-grid">
              <PracticeHistory title="Cross History" solves={crossPracticeHistory} />
              <PracticeHistory title="F2L History" solves={f2lPracticeHistory} />
              <PracticeHistory title="F2L Pair History" solves={f2lPairHistory} />
            </div>
          </section>
        </main>
      </>
    );
  }

  if (locationInfo.page === "history") {
    return (
      <>
        {globalNav}
        <main className="app-shell">
          <header className="app-header">
            <div>
              <p className="eyebrow">Latest 100</p>
              <h1>履歴</h1>
            </div>
            <HelpButton label="Open history help" onClick={() => openHelp("penalty-delete")} />
          </header>

          <section className="history-section" aria-label="History">
            {recentSolves.length === 0 ? (
              <div className="empty-state">
                <p>No solves yet.</p>
                <span>Start the timer to save your first local record.</span>
              </div>
            ) : (
              <ol className="history-list">
                {recentSolves.map((solve) => (
                  <li className="history-item" key={solve.id}>
                    <div className="history-main">
                      <div>
                        <p className="history-time">
                          {formatSolveTime(solve)}
                          {solve.penalty === "+2" && <span> +2</span>}
                        </p>
                        <p className="history-meta">
                          <span className="mode-badge">{getModeLabel(solve.mode)}</span>
                          {formatDateTime(solve.createdAt)}
                        </p>
                      </div>
                      <p className="history-scramble">{solve.scramble}</p>
                      {getSavedSplits(solve).length > 0 && (
                        <div className="history-splits" aria-label="Saved splits">
                          {getSavedSplits(solve).map((split) => (
                            <span key={split.key}>
                              {split.label} {formatTime(split.time)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="history-actions">
                      <button type="button" onClick={() => shareSolve(solve)}>
                        Share
                      </button>
                      <button type="button" onClick={() => updatePenalty(solve.id, "+2")}>
                        {solve.penalty === "+2" ? "Clear +2" : "+2"}
                      </button>
                      <button type="button" onClick={() => updatePenalty(solve.id, "DNF")}>
                        {solve.penalty === "DNF" ? "Clear DNF" : "DNF"}
                      </button>
                      <button type="button" onClick={() => softDeleteSolve(solve.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      {globalNav}
      <main className="app-shell">
        <header className="app-header app-home-header">
          <div>
            <p className="eyebrow">3x3 speedcubing timer</p>
            <h1>Cube Split Timer</h1>
            <p className="app-header-copy">
              スクランブルを確認して、モードを選んだらすぐ計測できます。
            </p>
          </div>
          <div className="header-actions">
            <HelpButton label="Open general help" onClick={() => openHelp("overview")} />
            <div className="theme-control" aria-label="Theme setting">
              <label htmlFor="theme-select">Theme</label>
              <select
                id="theme-select"
                value={themePreference}
                onChange={(event) => setThemePreference(event.target.value as ThemePreference)}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>
        </header>

      {draftMessage && (
        <div className="notice" role="status">
          {draftMessage}
        </div>
      )}

      {shareStatus && (
        <div className="notice share-notice" role="status">
          {shareStatus}
        </div>
      )}

      {authNotice && (
        <div className="notice auth-notice" role="status">
          {authNotice}
        </div>
      )}

      <section className="timer-panel" id="timer" aria-label="Timer">
        <div className="timer-toolbar">
          <div className="mode-toggle" aria-label="Timer mode">
            {TIMER_MODES.map((modeOption) => (
              <button
                key={modeOption.mode}
                type="button"
                aria-pressed={timerMode === modeOption.mode}
                onClick={() => setTimerMode(modeOption.mode)}
              >
                {modeOption.label}
              </button>
            ))}
          </div>
          <HelpButton label="Open timer help" onClick={() => openHelp("normal")} />
        </div>

        <div className="scramble-row">
          <p className="scramble-label">Scramble</p>
          <div className="scramble-actions">
            <button
              className="ghost-button"
              type="button"
              onClick={() => void copyCurrentScramble()}
            >
              コピー
            </button>
            <button className="ghost-button" type="button" onClick={openCurrentScrambleInAnalyzer}>
              Analyzerで見る
            </button>
            <button className="ghost-button" type="button" onClick={openCurrentScramblePreview}>
              確認する
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => setScramble(generateScramble())}
            >
              New
            </button>
          </div>
        </div>
        <p className="scramble-text">{scramble}</p>

        <button
          className={timerButtonClassName}
          type="button"
          onPointerDown={handleTimerPointerDown}
          onPointerMove={handleTimerPointerMove}
          onPointerUp={handleTimerPointerUp}
          onPointerCancel={handleTimerPointerCancel}
        >
          <span className="timer-time">{timerDisplayText}</span>
          <span className="timer-hint">{timerButtonHint}</span>
        </button>
      </section>

      {lastSavedSolve && (
        <section className="post-solve-actions" aria-label="Last solve actions">
          <div>
            <p className="post-solve-label">Saved</p>
            <strong>{formatSolveTime(lastSavedSolve)}</strong>
          </div>
          <div className="post-solve-buttons">
            <button type="button" onClick={() => shareSolve(lastSavedSolve)}>
              Share
            </button>
            <button
              type="button"
              onClick={() =>
                softDeleteSolve(lastSavedSolve.id, "直前の記録を保存しませんでした。")
              }
            >
              保存しない
            </button>
          </div>
        </section>
      )}

      {undoState && (
        <div className="undo-toast" role="status">
          <span>{undoState.message}</span>
          <button type="button" onClick={() => restoreSolve(undoState.solveId)}>
            元に戻す
          </button>
        </div>
      )}

      {isTutorialOpen && (
        <TutorialDialog onClose={dismissTutorial} onOpenHelp={openHelpFromTutorial} />
      )}
      </main>
    </>
  );
}

interface StatCardProps {
  label: string;
  value: string;
}

interface HelpButtonProps {
  label: string;
  onClick: () => void;
}

function HelpButton({ label, onClick }: HelpButtonProps) {
  return (
    <button className="help-button" type="button" aria-label={label} title={label} onClick={onClick}>
      ?
    </button>
  );
}

interface TutorialDialogProps {
  onClose: () => void;
  onOpenHelp: () => void;
}

function TutorialDialog({ onClose, onOpenHelp }: TutorialDialogProps) {
  return (
    <div className="tutorial-overlay" role="presentation">
      <section
        className="tutorial-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
      >
        <p className="eyebrow">First Start</p>
        <h2 id="tutorial-title">最初の使い方</h2>
        <ol className="tutorial-list">
          {TUTORIAL_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="tutorial-actions">
          <button className="ghost-button" type="button" onClick={onOpenHelp}>
            ヘルプを見る
          </button>
          <button className="primary-button" type="button" onClick={onClose}>
            はじめる
          </button>
        </div>
      </section>
    </div>
  );
}

type AuthFormMode = "signIn" | "signUp";

interface AuthPageProps {
  user: AuthUser | null;
  isAdmin: boolean;
  isLoading: boolean;
  isConfigured: boolean;
  localSolveCount: number;
  onBack: () => void;
  onOpenTimer: () => void;
  onOpenAdmin: () => void;
  onSignedIn: (message: string) => void;
  onSignedOut: () => void | Promise<void>;
  onExportLocalSolves: () => Promise<void>;
  onImportLocalSolves: (raw: string) => LocalImportResult;
  onUploadLocalSolves: () => Promise<CloudSyncResult>;
}

function getAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "認証に失敗しました。入力内容とSupabase設定を確認してください。";
}

function AuthPage({
  user,
  isAdmin,
  isLoading,
  isConfigured,
  localSolveCount,
  onBack,
  onOpenTimer,
  onOpenAdmin,
  onSignedIn,
  onSignedOut,
  onExportLocalSolves,
  onImportLocalSolves,
  onUploadLocalSolves,
}: AuthPageProps) {
  const [mode, setMode] = useState<AuthFormMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningInWithGoogle, setIsSigningInWithGoogle] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [authIdentities, setAuthIdentities] = useState<AuthIdentity[]>([]);
  const [isLoadingAuthIdentities, setIsLoadingAuthIdentities] = useState(false);
  const [isLinkingGoogleIdentity, setIsLinkingGoogleIdentity] = useState(false);
  const [accountStatus, setAccountStatus] = useState<"idle" | "success" | "error">("idle");
  const [accountStatusMessage, setAccountStatusMessage] = useState("");
  const [importText, setImportText] = useState("");
  const [dataStatus, setDataStatus] = useState<"idle" | "success" | "error">("idle");
  const [dataStatusMessage, setDataStatusMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isUploadingLocalSolves, setIsUploadingLocalSolves] = useState(false);
  const hasGoogleIdentity = authIdentities.some((identity) => identity.provider === "google");
  const authIdentityLabel = authIdentities.length > 0
    ? authIdentities.map(getAuthIdentityLabel).join(" / ")
    : "未確認";

  useEffect(() => {
    let isActive = true;

    if (!user || !isConfigured) {
      setAuthIdentities([]);
      setIsLoadingAuthIdentities(false);
      return () => {
        isActive = false;
      };
    }

    setIsLoadingAuthIdentities(true);
    setAccountStatus("idle");
    setAccountStatusMessage("");

    getAuthIdentities()
      .then((identities) => {
        if (!isActive) {
          return;
        }

        setAuthIdentities(identities);
      })
      .catch(() => {
        if (!isActive) {
          return;
        }

        setAccountStatus("error");
        setAccountStatusMessage("ログイン方法の連携状態を確認できませんでした。");
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingAuthIdentities(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [isConfigured, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail || password.length < 6) {
      setStatus("error");
      setStatusMessage("メールアドレスと6文字以上のパスワードを入力してください。");
      return;
    }

    setIsSubmitting(true);
    setStatus("idle");
    setStatusMessage("");

    try {
      if (mode === "signIn") {
        const signedInUser = await signInWithEmail(trimmedEmail, password);
        onSignedIn(`${signedInUser ? getAuthUserLabel(signedInUser) : "アカウント"}でログインしました。`);
        return;
      }

      const result = await signUpWithEmail(trimmedEmail, password, displayName);

      if (result.needsEmailConfirmation) {
        setStatus("success");
        setStatusMessage("確認メールを送信しました。メール内のリンクを開くとログインできます。");
        setPassword("");
        return;
      }

      onSignedIn(`${result.user ? getAuthUserLabel(result.user) : "アカウント"}を作成してログインしました。`);
    } catch (error) {
      setStatus("error");
      setStatusMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSigningInWithGoogle(true);
    setStatus("idle");
    setStatusMessage("");

    try {
      await signInWithGoogle();
      setStatus("success");
      setStatusMessage("Googleのログイン画面へ移動しています。");
    } catch (error) {
      setStatus("error");
      setStatusMessage(getAuthErrorMessage(error));
      setIsSigningInWithGoogle(false);
    }
  };

  const handleLinkGoogleIdentity = async () => {
    if (!user) {
      setAccountStatus("error");
      setAccountStatusMessage("Google連携にはログインが必要です。");
      return;
    }

    setIsLinkingGoogleIdentity(true);
    setAccountStatus("idle");
    setAccountStatusMessage("");

    try {
      await linkGoogleIdentity();
      setAccountStatus("success");
      setAccountStatusMessage("Googleの確認画面へ移動しています。");
    } catch (error) {
      setAccountStatus("error");
      setAccountStatusMessage(getAuthErrorMessage(error));
      setIsLinkingGoogleIdentity(false);
    }
  };

  const handleSendPasswordReset = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setStatus("error");
      setStatusMessage("再設定メールを送るメールアドレスを入力してください。");
      return;
    }

    setIsSendingReset(true);
    setStatus("idle");
    setStatusMessage("");

    try {
      await requestPasswordResetEmail(trimmedEmail);
      setStatus("success");
      setStatusMessage("パスワード再設定メールを送信しました。メール内のリンクを開いてください。");
    } catch (error) {
      setStatus("error");
      setStatusMessage(getAuthErrorMessage(error));
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleExportLocalSolves = async () => {
    setIsExporting(true);
    setDataStatus("idle");
    setDataStatusMessage("");

    try {
      await onExportLocalSolves();
      setDataStatus("success");
      setDataStatusMessage("この端末の履歴データをクリップボードへコピーしました。");
    } catch {
      setDataStatus("error");
      setDataStatusMessage("コピーできませんでした。ブラウザの権限を確認してください。");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportLocalSolves = () => {
    if (!importText.trim()) {
      setDataStatus("error");
      setDataStatusMessage("読み込む履歴データを貼り付けてください。");
      return;
    }

    setIsImporting(true);
    setDataStatus("idle");
    setDataStatusMessage("");

    try {
      const result = onImportLocalSolves(importText);

      setDataStatus("success");
      setDataStatusMessage(
        `${result.imported}件を読み込みました。追加 ${result.added}件 / 合計 ${result.total}件です。`,
      );
      setImportText("");
    } catch (error) {
      setDataStatus("error");
      setDataStatusMessage(getAuthErrorMessage(error));
    } finally {
      setIsImporting(false);
    }
  };

  const handleUploadLocalSolves = async () => {
    setIsUploadingLocalSolves(true);
    setDataStatus("idle");
    setDataStatusMessage("");

    try {
      const result = await onUploadLocalSolves();

      setDataStatus("success");
      setDataStatusMessage(
        `アカウント保存を確認しました。アップロード ${result.uploaded}件 / 保存済み ${result.skipped}件 / 対象 ${result.total}件です。`,
      );
    } catch {
      setDataStatus("error");
      setDataStatusMessage("アカウントへアップロードできませんでした。ログイン状態とSupabase設定を確認してください。");
    } finally {
      setIsUploadingLocalSolves(false);
    }
  };

  return (
    <main className="app-shell auth-page">
      <header className="app-header auth-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>ログイン</h1>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={onBack}>
            戻る
          </button>
          <button className="primary-button" type="button" onClick={onOpenTimer}>
            Timerへ戻る
          </button>
        </div>
      </header>

      {!isConfigured ? (
        <section className="auth-card" aria-label="Supabase setup">
          <p className="eyebrow">Setup required</p>
          <h2>Supabaseが未設定です</h2>
          <p className="auth-lead">
            `.env.local` に `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を設定すると、
            メール/パスワードログインを使えます。service_role key はフロントエンドに置かないでください。
          </p>
          <pre className="auth-env-example">
{`VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key`}
          </pre>
        </section>
      ) : user ? (
        <section className="auth-card" aria-label="Current account">
          <p className="eyebrow">Signed in</p>
          <h2>{getAuthUserLabel(user)}</h2>
          <div className="auth-account-panel">
            <p>
              <span>Email</span>
              <strong>{user.email ?? "未設定"}</strong>
            </p>
            <p>
              <span>User ID</span>
              <strong>{user.id}</strong>
            </p>
          </div>
          <p className="auth-lead">
            これ以降に保存した記録は、ローカル保存後にSupabaseの `solve_sessions` にも保存します。
          </p>
          {accountStatus !== "idle" && (
            <div className={`feedback-status feedback-status-${accountStatus}`} role="status">
              {accountStatusMessage}
            </div>
          )}
          <div className="auth-link-panel">
            <div>
              <p className="eyebrow">Login methods</p>
              <h3>Googleアカウント連携</h3>
              <p>
                連携済み:{" "}
                <strong>{isLoadingAuthIdentities ? "確認中..." : authIdentityLabel}</strong>
              </p>
              <p>
                今のアカウントにGoogleログインを追加します。連携後はメール/パスワードでもGoogleでも同じ履歴へ入れます。
              </p>
            </div>
            <button
              className={hasGoogleIdentity ? "ghost-button" : "auth-provider-button"}
              type="button"
              onClick={() => void handleLinkGoogleIdentity()}
              disabled={
                hasGoogleIdentity ||
                isLoadingAuthIdentities ||
                isLinkingGoogleIdentity
              }
            >
              <span className="auth-provider-mark" aria-hidden="true">G</span>
              {hasGoogleIdentity
                ? "Google連携済み"
                : isLinkingGoogleIdentity
                  ? "Googleへ移動中..."
                  : "Googleアカウントを連携"}
            </button>
          </div>
          <div className="feedback-actions">
            <button className="primary-button" type="button" onClick={onOpenTimer}>
              Timerへ戻る
            </button>
            {isAdmin && (
              <button className="ghost-button" type="button" onClick={onOpenAdmin}>
                管理者画面
              </button>
            )}
            <button className="ghost-button" type="button" onClick={() => void onSignedOut()}>
              ログアウト
            </button>
          </div>
        </section>
      ) : (
        <section className="auth-card" aria-label="Login form">
          <div>
            <p className="eyebrow">Supabase Auth</p>
            <h2>{mode === "signIn" ? "メールでログイン" : "新規アカウント作成"}</h2>
            <p className="auth-lead">
              未ログインでもタイマーは今まで通り使えます。ログインすると、新しい記録をクラウドにも保存します。
            </p>
          </div>

          {isLoading && (
            <div className="feedback-status" role="status">
              ログイン状態を確認しています。
            </div>
          )}

          {status !== "idle" && (
            <div className={`feedback-status feedback-status-${status}`} role="status">
              {statusMessage}
            </div>
          )}

          <div className="auth-mode-toggle" aria-label="Auth mode">
            <button
              type="button"
              aria-pressed={mode === "signIn"}
              onClick={() => setMode("signIn")}
            >
              ログイン
            </button>
            <button
              type="button"
              aria-pressed={mode === "signUp"}
              onClick={() => setMode("signUp")}
            >
              新規登録
            </button>
          </div>

          <div className="auth-provider-actions" aria-label="External login">
            <button
              className="auth-provider-button"
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={isSigningInWithGoogle || isSubmitting}
            >
              <span className="auth-provider-mark" aria-hidden="true">G</span>
              {isSigningInWithGoogle ? "Googleへ移動中..." : "Googleで続ける"}
            </button>
          </div>

          <div className="auth-separator" aria-hidden="true">
            <span />
            <strong>または</strong>
            <span />
          </div>

          <form className="feedback-form" onSubmit={handleSubmit}>
            {mode === "signUp" && (
              <label>
                表示名 任意
                <input
                  autoComplete="nickname"
                  maxLength={80}
                  value={displayName}
                  placeholder="例: Shinta"
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
            )}

            <label>
              メールアドレス
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                placeholder="you@example.com"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label>
              パスワード
              <input
                required
                type="password"
                minLength={6}
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                value={password}
                placeholder="6文字以上"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <div className="feedback-actions">
              <button className="primary-button" type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? mode === "signIn"
                    ? "ログイン中..."
                    : "登録中..."
                  : mode === "signIn"
                    ? "ログインする"
                    : "登録する"}
              </button>
              {mode === "signIn" && (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void handleSendPasswordReset()}
                  disabled={isSendingReset || !email.trim()}
                >
                  {isSendingReset ? "送信中..." : "パスワード再設定"}
                </button>
              )}
              <button className="ghost-button" type="button" onClick={onBack}>
                キャンセル
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="auth-card auth-data-card" aria-label="Local data transfer">
        <div>
          <p className="eyebrow">Data Transfer</p>
          <h2>端末の履歴を移す</h2>
          <p className="auth-lead">
            この端末のローカル履歴は {localSolveCount} 件です。書き出し/読み込みを使うと、
            NetlifyからVercelへ移したり、別端末の履歴をこの端末へまとめたりできます。
          </p>
        </div>

        {dataStatus !== "idle" && (
          <div className={`feedback-status feedback-status-${dataStatus}`} role="status">
            {dataStatusMessage}
          </div>
        )}

        <div className="auth-data-actions">
          <button
            className="ghost-button"
            type="button"
            onClick={() => void handleExportLocalSolves()}
            disabled={isExporting || localSolveCount === 0}
          >
            {isExporting ? "コピー中..." : "この端末の履歴を書き出す"}
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void handleUploadLocalSolves()}
            disabled={!user || isUploadingLocalSolves || localSolveCount === 0}
          >
            {isUploadingLocalSolves ? "保存中..." : "この端末の履歴をアカウントへ保存"}
          </button>
        </div>

        <label className="auth-import-field">
          別端末の履歴データを貼り付け
          <textarea
            rows={7}
            value={importText}
            placeholder='{"app":"cube-split-timer","version":1,"solves":[...]}'
            onChange={(event) => setImportText(event.target.value)}
          />
        </label>

        <div className="feedback-actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleImportLocalSolves}
            disabled={isImporting || !importText.trim()}
          >
            {isImporting ? "読み込み中..." : "貼り付けた履歴を読み込む"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => setImportText("")}
            disabled={!importText}
          >
            クリア
          </button>
        </div>
      </section>
    </main>
  );
}

interface ResetPasswordPageProps {
  onOpenLogin: () => void;
  onOpenTimer: () => void;
}

function ResetPasswordPage({ onOpenLogin, onOpenTimer }: ResetPasswordPageProps) {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < 6) {
      setStatus("error");
      setStatusMessage("パスワードは6文字以上にしてください。");
      return;
    }

    if (password !== passwordConfirm) {
      setStatus("error");
      setStatusMessage("確認用パスワードが一致していません。");
      return;
    }

    setIsSubmitting(true);
    setStatus("idle");
    setStatusMessage("");

    try {
      await updateCurrentUserPassword(password);
      setStatus("success");
      setStatusMessage("パスワードを変更しました。次回から新しいパスワードでログインできます。");
      setPassword("");
      setPasswordConfirm("");
    } catch (error) {
      setStatus("error");
      setStatusMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="app-shell auth-page">
      <header className="app-header auth-header">
        <div>
          <p className="eyebrow">Account</p>
          <h1>パスワード再設定</h1>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={onOpenLogin}>
            ログインへ
          </button>
          <button className="primary-button" type="button" onClick={onOpenTimer}>
            Timerへ戻る
          </button>
        </div>
      </header>

      <section className="auth-card" aria-label="Reset password form">
        <div>
          <p className="eyebrow">Reset Password</p>
          <h2>新しいパスワード</h2>
          <p className="auth-lead">
            再設定メールのリンクから開いた状態で、新しいパスワードを入力してください。
          </p>
        </div>

        {status !== "idle" && (
          <div className={`feedback-status feedback-status-${status}`} role="status">
            {statusMessage}
          </div>
        )}

        <form className="feedback-form" onSubmit={handleSubmit}>
          <label>
            新しいパスワード
            <input
              required
              type="password"
              minLength={6}
              autoComplete="new-password"
              value={password}
              placeholder="6文字以上"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label>
            新しいパスワード 確認
            <input
              required
              type="password"
              minLength={6}
              autoComplete="new-password"
              value={passwordConfirm}
              placeholder="もう一度入力"
              onChange={(event) => setPasswordConfirm(event.target.value)}
            />
          </label>

          <div className="feedback-actions">
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "変更中..." : "パスワードを変更"}
            </button>
            <button className="ghost-button" type="button" onClick={onOpenLogin}>
              ログインへ
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

interface FeedbackPageProps {
  currentScramble: string;
  timerMode: SolveMode;
  onBack: () => void;
  onOpenTimer: () => void;
}

const FEEDBACK_CATEGORY_OPTIONS: Array<{ value: FeedbackCategory; label: string }> = [
  { value: "bug", label: "バグ報告" },
  { value: "request", label: "直してほしいこと / 要望" },
  { value: "other", label: "その他" },
];

function FeedbackPage({ currentScramble, timerMode, onBack, onOpenTimer }: FeedbackPageProps) {
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (message.trim().length < 5) {
      setStatus("error");
      setStatusMessage("内容をもう少し詳しく書いてください。");
      return;
    }

    setIsSubmitting(true);
    setStatus("idle");
    setStatusMessage("");

    try {
      await submitFeedbackReport({
        category,
        message,
        contact,
        pagePath: "/feedback",
        currentScramble,
        timerMode,
      });
      setStatus("success");
      setStatusMessage("送信しました。ありがとうございます。");
      setMessage("");
      setContact("");
    } catch {
      setStatus("error");
      setStatusMessage(
        "送信できませんでした。時間を置いてもう一度試すか、Supabaseの設定を確認してください。",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="app-shell feedback-page">
      <header className="app-header feedback-header">
        <div>
          <p className="eyebrow">Feedback</p>
          <h1>意見箱</h1>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={onBack}>
            戻る
          </button>
          <button className="primary-button" type="button" onClick={onOpenTimer}>
            Timerへ戻る
          </button>
        </div>
      </header>

      <section className="feedback-card" aria-label="Feedback form">
        <div>
          <p className="eyebrow">Report</p>
          <h2>バグや直してほしいところを送る</h2>
          <p className="feedback-lead">
            送信内容は管理者がSupabaseの `feedback_reports` テーブルで確認できます。
            返信が必要な場合だけ、連絡先を書いてください。
          </p>
        </div>

        {status !== "idle" && (
          <div className={`feedback-status feedback-status-${status}`} role="status">
            {statusMessage}
          </div>
        )}

        <form className="feedback-form" onSubmit={handleSubmit}>
          <label>
            種類
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as FeedbackCategory)}
            >
              {FEEDBACK_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            内容
            <textarea
              required
              maxLength={4000}
              rows={8}
              value={message}
              placeholder="どの画面で、何をしたときに、どうなったかを書いてください。"
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>

          <label>
            連絡先 任意
            <input
              maxLength={240}
              value={contact}
              placeholder="メール、SNS IDなど。返信不要なら空でOK"
              onChange={(event) => setContact(event.target.value)}
            />
          </label>

          <div className="feedback-context" aria-label="Attached context">
            <p>
              <span>Mode</span>
              <strong>{getModeLabel(timerMode)}</strong>
            </p>
            <p>
              <span>Scramble</span>
              <strong>{currentScramble}</strong>
            </p>
          </div>

          <div className="feedback-actions">
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "送信中..." : "送信する"}
            </button>
            <button className="ghost-button" type="button" onClick={onBack}>
              キャンセル
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

interface HelpPageProps {
  activeTopicId: string;
  onBack: () => void;
  onOpenTimer: () => void;
}

function HelpPage({ activeTopicId, onBack, onOpenTimer }: HelpPageProps) {
  return (
    <main className="app-shell help-page">
      <header className="app-header help-header">
        <div>
          <p className="eyebrow">Help</p>
          <h1>使い方</h1>
        </div>
        <button className="ghost-button" type="button" onClick={onBack}>
          Timerへ戻る
        </button>
      </header>

      <section className="help-hero" aria-label="Help overview">
        <div>
          <p className="eyebrow">Cube Split Timer</p>
          <h2>迷ったらここを見れば大丈夫です。</h2>
          <p>
            計測、履歴、削除、Share、PWA追加までをまとめています。各セクションの「?」からも
            関連項目へ移動できます。
          </p>
        </div>
        <button className="primary-button" type="button" onClick={onOpenTimer}>
          タイマーを開く
        </button>
      </section>

      <nav className="help-topic-nav" aria-label="Help topics">
        {HELP_TOPICS.map((topic) => (
          <a key={topic.id} href={`#${topic.id}`}>
            {topic.title}
          </a>
        ))}
      </nav>

      <section className="help-topics" aria-label="Help contents">
        {HELP_TOPICS.map((topic) => (
          <details
            className="help-topic"
            id={topic.id}
            key={topic.id}
            open={topic.id === activeTopicId}
          >
            <summary>{topic.title}</summary>
            <div className="help-topic-body">
              <p>{topic.intro}</p>
              <ul>
                {topic.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              {topic.note && <p className="help-note">{topic.note}</p>}
            </div>
          </details>
        ))}
      </section>
    </main>
  );
}

function StatCard({ label, value }: StatCardProps) {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

interface PracticeStatCardProps {
  title: string;
  stats: TimerStats;
}

function PracticeStatCard({ title, stats }: PracticeStatCardProps) {
  return (
    <article className="practice-card">
      <div className="practice-card-heading">
        <h3>{title}</h3>
        <span>{stats.count}</span>
      </div>
      <dl>
        <div>
          <dt>Avg</dt>
          <dd>{formatAverage(stats.average)}</dd>
        </div>
        <div>
          <dt>ao5</dt>
          <dd>{formatAverage(stats.ao5)}</dd>
        </div>
        <div>
          <dt>ao12</dt>
          <dd>{formatAverage(stats.ao12)}</dd>
        </div>
        <div>
          <dt>Best</dt>
          <dd>{formatAverage(stats.best)}</dd>
        </div>
      </dl>
    </article>
  );
}

interface PracticeHistoryProps {
  title: string;
  solves: SolveRecord[];
}

function PracticeHistory({ title, solves }: PracticeHistoryProps) {
  return (
    <article className="practice-history-card">
      <h3>{title}</h3>
      {solves.length === 0 ? (
        <p className="practice-empty">No records yet.</p>
      ) : (
        <ol>
          {solves.map((solve) => (
            <li key={solve.id}>
              <div>
                <strong>{formatSolveTime(solve)}</strong>
                <span>{formatDateTime(solve.createdAt)}</span>
              </div>
              {getSavedSplits(solve).length > 0 && (
                <p>
                  {getSavedSplits(solve)
                    .map((split) => `${split.label} ${formatTime(split.time)}`)
                    .join(" / ")}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

interface RecentChartProps {
  solves: SolveRecord[];
}

function RecentChart({ solves }: RecentChartProps) {
  const chartSolves = solves.slice().reverse();
  const solveValues = chartSolves.map(getSolveValue);
  const timeValues = solveValues
    .map((value) => value.value)
    .filter((value): value is number => value !== null);
  const minValue = timeValues.length > 0 ? Math.min(...timeValues) : 0;
  const maxValue = timeValues.length > 0 ? Math.max(...timeValues) : 0;
  const range = Math.max(1, maxValue - minValue);

  return (
    <article className="recent-chart-card" aria-label="Recent 50 graph">
      <div className="analysis-subheading">
        <p className="eyebrow">Recent 50</p>
        <h3>直近50回グラフ</h3>
      </div>
      {chartSolves.length === 0 ? (
        <p className="practice-empty">No records yet.</p>
      ) : (
        <>
          <div className="recent-chart" role="img" aria-label="直近50回のタイム推移">
            {chartSolves.map((solve, index) => {
              const value = solveValues[index];
              const timeValue = value.value;
              const isDnf = timeValue === null;
              const height = timeValue === null
                ? 100
                : 24 + Math.round(((timeValue - minValue) / range) * 76);

              return (
                <span
                  className={isDnf ? "chart-bar chart-bar-dnf" : "chart-bar"}
                  key={solve.id}
                  style={{ height: `${height}%` }}
                  title={`${formatDateTime(solve.createdAt)} ${formatSolveTime(solve)}`}
                />
              );
            })}
          </div>
          <div className="chart-meta">
            <span>Oldest</span>
            <span>Newest</span>
          </div>
        </>
      )}
    </article>
  );
}

interface PhaseStatCardProps {
  label: string;
  stat: PhaseStat;
}

function PhaseStatCard({ label, stat }: PhaseStatCardProps) {
  return (
    <article className="phase-card">
      <div className="phase-card-heading">
        <h3>{label}</h3>
        <span>{stat.count}</span>
      </div>
      <dl>
        <div>
          <dt>Avg</dt>
          <dd>{formatAverage(stat.average)}</dd>
        </div>
        <div>
          <dt>Best</dt>
          <dd>{formatAverage(stat.best)}</dd>
        </div>
        <div>
          <dt>Worst</dt>
          <dd>{formatAverage(stat.worst)}</dd>
        </div>
      </dl>
    </article>
  );
}
