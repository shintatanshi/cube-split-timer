import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type {
  F2lCandidate,
  F2lCaseImage,
  F2lPieceSpot,
  LearningCase,
  LearningCategory,
  LearningProgressMap,
  LearningStatus,
  LearningSticker,
  OllCaseImage,
  PllCaseImage,
} from "../types";
import {
  LEARNING_CASES,
  LEARNING_ASSET_FOLDERS,
  LEARNING_CATEGORIES,
  LEARNING_CATEGORY_DESCRIPTIONS,
  LEARNING_CATEGORY_LABELS,
  getLearningCasesByCategory,
} from "./learningData";
import {
  F2L_CANDIDATES,
  F2L_CANDIDATE_SUMMARY,
  findDuplicateF2lCandidates,
  validateF2lCandidate,
} from "./f2lCandidateData";
import { loadLearningProgress, saveLearningProgress } from "./learningProgress";
import { SUPPORTED_MOVE_SUMMARY } from "./moveNotation";

type LearnSection = "home" | LearningCategory | "practice" | "notation" | "f2lCandidates";
type StatusFilter = "all" | LearningStatus;
type PracticeCategory = "all" | LearningCategory;
type NotationGroup = "basic" | "rotation" | "slice" | "wide";

interface LearnRoute {
  section: LearnSection;
  detailCategory?: LearningCategory;
  detailKey?: string;
}

interface NotationMove {
  move: string;
  reading: string;
  group: NotationGroup;
  face: string;
  direction: string;
  description: string;
  supported: boolean;
}

const AlgorithmPlayer = lazy(() => import("./AlgorithmPlayer"));

interface LearnPageProps {
  path: string;
  onNavigate: (path: string) => void;
  onOpenTimer: () => void;
}

const LEARN_LANDSCAPE_HINT_STORAGE_KEY = "learnLandscapeHintDismissed";

const STATUS_LABELS: Record<LearningStatus, string> = {
  unlearned: "未習得",
  learning: "練習中",
  learned: "覚えた",
  weak: "苦手",
};

const STATUS_OPTIONS: Array<{ status: LearningStatus; label: string }> = [
  { status: "unlearned", label: "未習得" },
  { status: "learning", label: "練習中" },
  { status: "learned", label: "覚えた" },
  { status: "weak", label: "苦手" },
];

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "unlearned", label: "未習得" },
  { value: "learning", label: "練習中" },
  { value: "learned", label: "覚えた" },
  { value: "weak", label: "苦手" },
];

const PRACTICE_CATEGORY_OPTIONS: Array<{ value: PracticeCategory; label: string }> = [
  { value: "all", label: "All" },
  ...LEARNING_CATEGORIES.map((category) => ({
    value: category,
    label: LEARNING_CATEGORY_LABELS[category],
  })),
];

const NOTATION_GROUPS: Array<{ group: NotationGroup; label: string; description: string }> = [
  { group: "basic", label: "基本回転", description: "U / D / R / L / F / B の面回し" },
  { group: "rotation", label: "持ち替え", description: "x / y / z のキューブ全体回転" },
  { group: "slice", label: "スライス", description: "M / E / S の中段回し" },
  { group: "wide", label: "2層回し", description: "Rw や r のような2層回し" },
];

function createFaceMoves(base: string, face: string, reading: string, note: string): NotationMove[] {
  return [
    {
      move: base,
      reading,
      group: "basic",
      face,
      direction: `${face}を、その面を正面から見て時計回りに90度回す`,
      description: note,
      supported: true,
    },
    {
      move: `${base}'`,
      reading: `${reading} prime`,
      group: "basic",
      face,
      direction: `${face}を、その面を正面から見て反時計回りに90度回す`,
      description: "prime は通常回転の逆向きです。",
      supported: true,
    },
    {
      move: `${base}2`,
      reading: `${reading} two`,
      group: "basic",
      face,
      direction: `${face}を180度回す`,
      description: "2 は180度回転なので、逆手順にしても同じ記号です。",
      supported: true,
    },
  ];
}

function createRotationMoves(base: "x" | "y" | "z", reference: "R" | "U" | "F"): NotationMove[] {
  return [
    {
      move: base,
      reading: base,
      group: "rotation",
      face: "キューブ全体",
      direction: `キューブ全体を${reference}の回転方向に持ち替える`,
      description: "視点操作とは別に、内部のキューブ全体を回す記号です。",
      supported: true,
    },
    {
      move: `${base}'`,
      reading: `${base} prime`,
      group: "rotation",
      face: "キューブ全体",
      direction: `キューブ全体を${reference}'の回転方向に持ち替える`,
      description: "prime は持ち替え方向も逆になります。",
      supported: true,
    },
    {
      move: `${base}2`,
      reading: `${base} two`,
      group: "rotation",
      face: "キューブ全体",
      direction: "キューブ全体を180度持ち替える",
      description: "2 は180度なので、逆手順でも同じ記号です。",
      supported: true,
    },
  ];
}

function createSliceMoves(base: "M" | "E" | "S", reference: "L" | "D" | "F", face: string): NotationMove[] {
  return [
    {
      move: base,
      reading: base,
      group: "slice",
      face,
      direction: `${face}を${reference}と同じ方向に90度回す`,
      description: "外側の面ではなく、中央の層だけを回します。",
      supported: true,
    },
    {
      move: `${base}'`,
      reading: `${base} prime`,
      group: "slice",
      face,
      direction: `${face}を${reference}'と同じ方向に90度回す`,
      description: "prime は通常のスライス回転の逆方向です。",
      supported: true,
    },
    {
      move: `${base}2`,
      reading: `${base} two`,
      group: "slice",
      face,
      direction: `${face}を180度回す`,
      description: "2 は180度なので、回転方向は区別しません。",
      supported: true,
    },
  ];
}

function createWideMoves(base: string, face: string): NotationMove[] {
  return [
    {
      move: base,
      reading: base,
      group: "wide",
      face,
      direction: `${face}と隣の中央層をまとめて時計回りに90度回す`,
      description: "3x3では小文字の r なども2層回しとして扱います。",
      supported: true,
    },
    {
      move: `${base}'`,
      reading: `${base} prime`,
      group: "wide",
      face,
      direction: `${face}と隣の中央層をまとめて反時計回りに90度回す`,
      description: "prime は2層まとめた回転も逆向きです。",
      supported: true,
    },
    {
      move: `${base}2`,
      reading: `${base} two`,
      group: "wide",
      face,
      direction: `${face}と隣の中央層をまとめて180度回す`,
      description: "2 は180度回転として扱います。",
      supported: true,
    },
  ];
}

const NOTATION_MOVES: NotationMove[] = [
  ...createFaceMoves("U", "上面", "U", "上から見た時計回りです。画面から見た向きではありません。"),
  ...createFaceMoves("D", "下面", "D", "下面を正面から見る基準なので、見た目と逆に感じやすい記号です。"),
  ...createFaceMoves("R", "右面", "R", "右面を右側から見た時計回りです。"),
  ...createFaceMoves("L", "左面", "L", "左面を左側から見た時計回りです。"),
  ...createFaceMoves("F", "正面", "F", "正面をそのまま見た時計回りです。"),
  ...createFaceMoves("B", "背面", "B", "背面を後ろ側から見た時計回りです。特に向きを間違えやすい記号です。"),
  ...createRotationMoves("x", "R"),
  ...createRotationMoves("y", "U"),
  ...createRotationMoves("z", "F"),
  ...createSliceMoves("M", "L", "R面とL面の間の層"),
  ...createSliceMoves("E", "D", "U面とD面の間の層"),
  ...createSliceMoves("S", "F", "F面とB面の間の層"),
  ...createWideMoves("Rw", "右面"),
  ...createWideMoves("Lw", "左面"),
  ...createWideMoves("Uw", "上面"),
  ...createWideMoves("Dw", "下面"),
  ...createWideMoves("Fw", "正面"),
  ...createWideMoves("Bw", "背面"),
  ...createWideMoves("r", "右側2層"),
  ...createWideMoves("l", "左側2層"),
  ...createWideMoves("u", "上側2層"),
  ...createWideMoves("d", "下側2層"),
  ...createWideMoves("f", "正面側2層"),
  ...createWideMoves("b", "背面側2層"),
];

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getLearnRoute(path: string): LearnRoute {
  const normalizedPath = path.replace(/\/+$/, "") || "/";
  const pathParts = normalizedPath.split("/").filter(Boolean);

  if (pathParts[0] === "learn") {
    const maybeCategory = pathParts[1];

    if (LEARNING_CATEGORIES.includes(maybeCategory as LearningCategory)) {
      const category = maybeCategory as LearningCategory;
      const detailKey = pathParts[2]
        ? safeDecodeURIComponent(pathParts.slice(2).join("/"))
        : undefined;

      return {
        section: category,
        detailCategory: detailKey ? category : undefined,
        detailKey,
      };
    }
  }

  if (normalizedPath === "/learn/f2l") {
    return { section: "f2l" };
  }

  if (normalizedPath === "/learn/oll") {
    return { section: "oll" };
  }

  if (normalizedPath === "/learn/pll") {
    return { section: "pll" };
  }

  if (normalizedPath === "/learn/notation" || normalizedPath === "/learn/moves") {
    return { section: "notation" };
  }

  if (normalizedPath === "/learn/f2l-candidates") {
    return { section: "f2lCandidates" };
  }

  if (normalizedPath === "/learn/practice") {
    return { section: "practice" };
  }

  return { section: "home" };
}

function isLearningCategory(section: LearnSection): section is LearningCategory {
  return LEARNING_CATEGORIES.includes(section as LearningCategory);
}

function isMobilePortraitViewport(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.innerWidth < 768 && window.matchMedia("(orientation: portrait)").matches;
}

function loadLandscapeHintDismissed(): boolean {
  try {
    return localStorage.getItem(LEARN_LANDSCAPE_HINT_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveLandscapeHintDismissed(): void {
  try {
    localStorage.setItem(LEARN_LANDSCAPE_HINT_STORAGE_KEY, "true");
  } catch {
    // The hint is optional; ignore storage failures.
  }
}

function getCaseStatus(caseId: string, progress: LearningProgressMap): LearningStatus {
  return progress[caseId] ?? "unlearned";
}

function summarizeProgress(cases: LearningCase[], progress: LearningProgressMap) {
  const summary = cases.reduce(
    (counts, item) => {
      counts[getCaseStatus(item.id, progress)] += 1;
      return counts;
    },
    {
      unlearned: 0,
      learning: 0,
      learned: 0,
      weak: 0,
    } satisfies Record<LearningStatus, number>,
  );
  const total = cases.length;
  const percent = total === 0 ? 0 : Math.round((summary.learned / total) * 100);

  return { ...summary, total, percent };
}

function getPracticeSource(category: PracticeCategory): LearningCase[] {
  return category === "all" ? LEARNING_CASES : getLearningCasesByCategory(category);
}

function pickRandomCase(cases: LearningCase[], previousId?: string): LearningCase | null {
  if (cases.length === 0) {
    return null;
  }

  const candidates =
    cases.length > 1 ? cases.filter((item) => item.id !== previousId) : cases;
  const randomIndex = Math.floor(Math.random() * candidates.length);

  return candidates[randomIndex] ?? cases[0] ?? null;
}

export default function LearnPage({ path, onNavigate, onOpenTimer }: LearnPageProps) {
  const route = getLearnRoute(path);
  const section = route.section;
  const shouldShowLandscapeHint =
    section === "home" || section === "f2lCandidates" || isLearningCategory(section);
  const [progress, setProgress] = useState<LearningProgressMap>(() => loadLearningProgress());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [practiceCategory, setPracticeCategory] = useState<PracticeCategory>("all");
  const [practiceCaseId, setPracticeCaseId] = useState(
    () => pickRandomCase(LEARNING_CASES)?.id ?? "",
  );
  const [isPracticeAnswerVisible, setIsPracticeAnswerVisible] = useState(false);

  const updateCaseStatus = useCallback((caseId: string, status: LearningStatus) => {
    setProgress((currentProgress) => {
      const nextProgress = { ...currentProgress };

      if (status === "unlearned") {
        delete nextProgress[caseId];
      } else {
        nextProgress[caseId] = status;
      }

      saveLearningProgress(nextProgress);
      return nextProgress;
    });
  }, []);

  const practiceCases = useMemo(
    () => getPracticeSource(practiceCategory),
    [practiceCategory],
  );

  useEffect(() => {
    if (practiceCases.some((item) => item.id === practiceCaseId)) {
      return;
    }

    const nextCase = pickRandomCase(practiceCases);
    setPracticeCaseId(nextCase?.id ?? "");
    setIsPracticeAnswerVisible(false);
  }, [practiceCaseId, practiceCases]);

  const showNextPracticeCase = useCallback(() => {
    const nextCase = pickRandomCase(practiceCases, practiceCaseId);

    if (!nextCase) {
      return;
    }

    setPracticeCaseId(nextCase.id);
    setIsPracticeAnswerVisible(false);
  }, [practiceCaseId, practiceCases]);

  const practiceCase = useMemo(
    () => practiceCases.find((item) => item.id === practiceCaseId) ?? practiceCases[0] ?? null,
    [practiceCaseId, practiceCases],
  );

  const markPracticeCase = useCallback(
    (status: LearningStatus) => {
      if (!practiceCase) {
        return;
      }

      updateCaseStatus(practiceCase.id, status);
      showNextPracticeCase();
    },
    [practiceCase, showNextPracticeCase, updateCaseStatus],
  );

  return (
    <main className="app-shell learn-page">
      <header className="app-header learn-header">
        <div>
          <p className="eyebrow">Learn</p>
          <h1>手順学習</h1>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={onOpenTimer}>
            Timerへ戻る
          </button>
        </div>
      </header>

      <LearnTabs currentSection={section} onNavigate={onNavigate} />
      <LearnLandscapeHint enabled={shouldShowLandscapeHint} routeKey={path} />

      {section === "home" && <LearnHome progress={progress} onNavigate={onNavigate} />}

      {isLearningCategory(section) && route.detailCategory && route.detailKey && (
        <LearnCaseDetailPage
          category={section}
          detailKey={route.detailKey}
          progress={progress}
          onNavigate={onNavigate}
          onSetStatus={updateCaseStatus}
        />
      )}

      {isLearningCategory(section) && !route.detailKey && (
        <LearnCategoryPage
          category={section}
          progress={progress}
          statusFilter={statusFilter}
          onNavigate={onNavigate}
          onSetFilter={setStatusFilter}
        />
      )}

      {section === "notation" && <NotationPage />}

      {section === "f2lCandidates" && <F2lCandidateReviewPage />}

      {section === "practice" && (
        practiceCase ? (
          <LearnPracticePage
            category={practiceCategory}
            caseItem={practiceCase}
            isAnswerVisible={isPracticeAnswerVisible}
            progress={progress}
            onCategoryChange={(nextCategory) => {
              setPracticeCategory(nextCategory);
              setIsPracticeAnswerVisible(false);
            }}
            onRevealAnswer={() => setIsPracticeAnswerVisible(true)}
            onNext={showNextPracticeCase}
            onMarkStatus={markPracticeCase}
            onSetStatus={updateCaseStatus}
          />
        ) : (
          <LearnPracticeEmpty />
        )
      )}
    </main>
  );
}

interface LearnLandscapeHintProps {
  enabled: boolean;
  routeKey: string;
}

function LearnLandscapeHint({ enabled, routeKey }: LearnLandscapeHintProps) {
  const [isDismissed, setIsDismissed] = useState(() => loadLandscapeHintDismissed());
  const [isClosed, setIsClosed] = useState(false);
  const [isEligibleViewport, setIsEligibleViewport] = useState(() =>
    enabled ? isMobilePortraitViewport() : false,
  );

  useEffect(() => {
    setIsClosed(false);
  }, [routeKey]);

  useEffect(() => {
    const updateViewportEligibility = () => {
      setIsEligibleViewport(enabled && isMobilePortraitViewport());
    };

    updateViewportEligibility();
    window.addEventListener("resize", updateViewportEligibility);
    window.addEventListener("orientationchange", updateViewportEligibility);

    const mediaQuery = window.matchMedia("(max-width: 767px) and (orientation: portrait)");
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateViewportEligibility);
    } else {
      mediaQuery.addListener(updateViewportEligibility);
    }

    return () => {
      window.removeEventListener("resize", updateViewportEligibility);
      window.removeEventListener("orientationchange", updateViewportEligibility);
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", updateViewportEligibility);
      } else {
        mediaQuery.removeListener(updateViewportEligibility);
      }
    };
  }, [enabled]);

  useEffect(() => {
    if (!isEligibleViewport) {
      setIsClosed(false);
    }
  }, [isEligibleViewport]);

  const dismissForever = () => {
    saveLandscapeHintDismissed();
    setIsDismissed(true);
  };

  if (!enabled || isDismissed || isClosed || !isEligibleViewport) {
    return null;
  }

  return (
    <aside className="learn-landscape-hint" role="note" aria-label="横画面推奨">
      <div className="learn-landscape-hint-main">
        <span className="learn-landscape-hint-icon" aria-hidden="true">
          <span />
        </span>
        <div>
          <strong>横画面で見ると一覧が見やすくなります</strong>
          <p>F2L / OLL / PLL の一覧は、スマホを横向きにすると複数列で見やすく表示できます。</p>
        </div>
      </div>
      <div className="learn-landscape-hint-actions">
        <button type="button" onClick={() => setIsClosed(true)}>
          OK
        </button>
        <button type="button" onClick={dismissForever}>
          今後表示しない
        </button>
      </div>
    </aside>
  );
}

interface LearnTabsProps {
  currentSection: LearnSection;
  onNavigate: (path: string) => void;
}

function LearnTabs({ currentSection, onNavigate }: LearnTabsProps) {
  const tabs: Array<{ section: LearnSection; label: string; path: string }> = [
    { section: "home", label: "Top", path: "/learn" },
    { section: "f2l", label: "F2L", path: "/learn/f2l" },
    { section: "oll", label: "OLL", path: "/learn/oll" },
    { section: "pll", label: "PLL", path: "/learn/pll" },
    { section: "f2lCandidates", label: "F2L候補", path: "/learn/f2l-candidates" },
    { section: "notation", label: "回転記号", path: "/learn/notation" },
    { section: "practice", label: "Practice", path: "/learn/practice" },
  ];

  return (
    <nav className="learn-tabs" aria-label="Learn navigation">
      {tabs.map((tab) => (
        <button
          aria-pressed={currentSection === tab.section}
          key={tab.section}
          type="button"
          onClick={() => onNavigate(tab.path)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

interface LearnHomeProps {
  progress: LearningProgressMap;
  onNavigate: (path: string) => void;
}

function LearnHome({ progress, onNavigate }: LearnHomeProps) {
  const allSummary = summarizeProgress(LEARNING_CASES, progress);

  return (
    <>
      <section className="learn-hero" aria-label="Learn overview">
        <div>
          <p className="eyebrow">F2L / OLL / PLL</p>
          <h2>形を見て、手順と進捗をまとめて管理します。</h2>
          <p>
            進捗はこの端末のlocalStorageに保存されます。タイマー画面とは分離しているので、
            計測中に学習データは読み込みません。
          </p>
        </div>
        <div className="learn-total-progress" aria-label="Total learning progress">
          <strong>{allSummary.percent}%</strong>
          <span>
            {allSummary.learned}/{allSummary.total} 覚えた
          </span>
        </div>
      </section>

      <section className="learn-category-grid" aria-label="Learning categories">
        {LEARNING_CATEGORIES.map((category) => {
          const cases = getLearningCasesByCategory(category);
          const summary = summarizeProgress(cases, progress);

          return (
            <article className="learn-category-card" key={category}>
              <div>
                <p className="eyebrow">{LEARNING_CATEGORY_LABELS[category]}</p>
                <h2>{LEARNING_CATEGORY_LABELS[category]} cases</h2>
                <p>{LEARNING_CATEGORY_DESCRIPTIONS[category]}</p>
              </div>
              <div className="learn-progress-row">
                <span>{summary.percent}%</span>
                <div className="learn-progress-track" aria-hidden="true">
                  <span style={{ width: `${summary.percent}%` }} />
                </div>
              </div>
              <dl className="learn-summary-list">
                <div>
                  <dt>覚えた</dt>
                  <dd>{summary.learned}</dd>
                </div>
                <div>
                  <dt>練習中</dt>
                  <dd>{summary.learning}</dd>
                </div>
                <div>
                  <dt>苦手</dt>
                  <dd>{summary.weak}</dd>
                </div>
              </dl>
              <button
                className="primary-button"
                type="button"
                onClick={() => onNavigate(`/learn/${category}`)}
              >
                一覧を見る
              </button>
            </article>
          );
        })}
      </section>

      <section className="learn-practice-entry notation-entry" aria-label="Notation entry">
        <div>
          <p className="eyebrow">Notation</p>
          <h2>回転記号だけを練習する</h2>
          <p>U / R / F などの基本回転、x / y / z の持ち替え、スライスと2層回しを1手ずつ3Dで確認します。</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => onNavigate("/learn/notation")}>
          回転記号へ
        </button>
      </section>

      <section className="learn-practice-entry" aria-label="F2L candidate review entry">
        <div>
          <p className="eyebrow">Review queue</p>
          <h2>追加F2L候補を確認する</h2>
          <p>基本41とは別枠で、追加F2L・裏F2L・インサート違いの候補を3Dで確認します。正式DBにはまだ入りません。</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => onNavigate("/learn/f2l-candidates")}>
          候補を見る
        </button>
      </section>

      <section className="learn-practice-entry" aria-label="Practice entry">
        <div>
          <p className="eyebrow">Random Practice</p>
          <h2>ランダム出題で確認する</h2>
          <p>F2L / OLL / PLLからケースを出して、答えを見る前に手順を思い出します。</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => onNavigate("/learn/practice")}>
          Practiceへ
        </button>
      </section>
    </>
  );
}

interface LearnCategoryPageProps {
  category: LearningCategory;
  progress: LearningProgressMap;
  statusFilter: StatusFilter;
  onNavigate: (path: string) => void;
  onSetFilter: (filter: StatusFilter) => void;
}

function LearnCategoryPage({
  category,
  progress,
  statusFilter,
  onNavigate,
  onSetFilter,
}: LearnCategoryPageProps) {
  const cases = getLearningCasesByCategory(category);
  const summary = summarizeProgress(cases, progress);
  const visibleCases = cases.filter(
    (caseItem) =>
      statusFilter === "all" || getCaseStatus(caseItem.id, progress) === statusFilter,
  );
  const assetFolder = LEARNING_ASSET_FOLDERS[category];

  return (
    <>
      <section className="learn-section-heading" aria-label={`${category} overview`}>
        <div>
          <p className="eyebrow">{LEARNING_CATEGORY_LABELS[category]}</p>
          <h2>{LEARNING_CATEGORY_LABELS[category]}一覧</h2>
          <p>{LEARNING_CATEGORY_DESCRIPTIONS[category]}</p>
        </div>
        <div className="learn-total-progress">
          <strong>{summary.percent}%</strong>
          <span>
            {summary.learned}/{summary.total} 覚えた
          </span>
        </div>
      </section>

      <div className="learn-filter-row" aria-label="Learning status filter">
        {STATUS_FILTERS.map((filter) => (
          <button
            aria-pressed={statusFilter === filter.value}
            key={filter.value}
            type="button"
            onClick={() => onSetFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <section className="learn-case-list" aria-label={`${category} learning case list`}>
        {cases.length === 0 ? (
          <div className="empty-state">
            <p>まだ画像がありません。</p>
            <span>{assetFolder} に画像を追加してください。</span>
          </div>
        ) : visibleCases.length === 0 ? (
          <div className="empty-state">
            <p>このフィルターのケースはありません。</p>
            <span>別の進捗フィルターを選んでください。</span>
          </div>
        ) : (
          visibleCases.map((caseItem) => (
            <CaseListButton
              caseItem={caseItem}
              key={caseItem.id}
              status={getCaseStatus(caseItem.id, progress)}
              onOpen={() => onNavigate(getCaseDetailPath(category, caseItem))}
            />
          ))
        )}
      </section>
    </>
  );
}

function getCaseRouteKey(caseItem: LearningCase): string {
  return caseItem.image.kind === "asset" ? caseItem.image.baseName : caseItem.id;
}

function getCaseDetailPath(category: LearningCategory, caseItem: LearningCase): string {
  return `/learn/${category}/${encodeURIComponent(getCaseRouteKey(caseItem))}`;
}

function normalizeCaseLookupKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function findCaseByRouteKey(category: LearningCategory, detailKey: string): LearningCase | null {
  const normalizedDetailKey = normalizeCaseLookupKey(detailKey);

  return (
    getLearningCasesByCategory(category).find((caseItem) => {
      const routeKey = getCaseRouteKey(caseItem);

      return (
        caseItem.id === detailKey ||
        routeKey === detailKey ||
        normalizeCaseLookupKey(caseItem.id) === normalizedDetailKey ||
        normalizeCaseLookupKey(routeKey) === normalizedDetailKey
      );
    }) ?? null
  );
}

interface LearnCaseDetailPageProps {
  category: LearningCategory;
  detailKey: string;
  progress: LearningProgressMap;
  onNavigate: (path: string) => void;
  onSetStatus: (caseId: string, status: LearningStatus) => void;
}

function LearnCaseDetailPage({
  category,
  detailKey,
  progress,
  onNavigate,
  onSetStatus,
}: LearnCaseDetailPageProps) {
  const caseItem = findCaseByRouteKey(category, detailKey);
  const backPath = `/learn/${category}`;

  if (!caseItem) {
    return (
      <>
        <section className="learn-section-heading" aria-label={`${category} case not found`}>
          <div>
            <p className="eyebrow">{LEARNING_CATEGORY_LABELS[category]}</p>
            <h2>ケースが見つかりません</h2>
            <p>画像ファイル名が変わったか、対象フォルダから削除された可能性があります。</p>
          </div>
          <button className="ghost-button" type="button" onClick={() => onNavigate(backPath)}>
            一覧に戻る
          </button>
        </section>
      </>
    );
  }

  return (
    <section className="learn-detail-page" aria-label={`${caseItem.title} detail`}>
      <div className="learn-section-heading learn-detail-page-heading">
        <div>
          <p className="eyebrow">{LEARNING_CATEGORY_LABELS[category]} Detail</p>
          <h2>{caseItem.title}</h2>
          <p>{caseItem.subtitle}</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => onNavigate(backPath)}>
          一覧に戻る
        </button>
      </div>

      <CaseDetail
        caseItem={caseItem}
        status={getCaseStatus(caseItem.id, progress)}
        onSetStatus={(status) => onSetStatus(caseItem.id, status)}
      />
    </section>
  );
}

function createNotationLearningCase(notationMove: NotationMove): LearningCase {
  return {
    id: `notation-${notationMove.move.replace(/[^a-zA-Z0-9]+/g, "-")}`,
    type: "f2l",
    category: "f2l",
    name: `回転記号 ${notationMove.move}`,
    title: `${notationMove.move} 単体再生`,
    subtitle: notationMove.reading,
    algorithm: notationMove.move,
    description: notationMove.description,
    image: {
      kind: "asset",
      category: "f2l",
      url: "",
      fileName: "",
      baseName: notationMove.move,
      path: "",
    },
    imageUrl: "",
    highlightConfig: {
      kind: "pll",
      arrows: [],
      blocks: [],
      focusFaces: ["U", "F", "R", "L"],
    },
    shape: [],
    tags: ["Notation", notationMove.group],
  };
}

const F2L_CANDIDATE_TYPE_LABELS: Record<F2lCandidate["caseType"], string> = {
  basic41: "基本41",
  advanced: "追加F2L",
  backSlot: "バックスロット",
  insertVariation: "インサート違い",
  extraction: "取り出し",
  rotationless: "回転削減",
  other: "その他",
};

const F2L_CANDIDATE_DIFFICULTY_LABELS: Record<F2lCandidate["difficulty"], string> = {
  basic: "basic",
  intermediate: "intermediate",
  advanced: "advanced",
};

const F2L_CANDIDATE_SLOT_CONFIG: Record<
  Exclude<F2lCandidate["targetSlot"], "auto">,
  {
    slot: F2lCaseImage["slot"];
    targetCorner: [number, number, number];
    targetEdge: [number, number, number];
    centers: Array<"U" | "D" | "F" | "B" | "R" | "L">;
  }
> = {
  FR: { slot: "right", targetCorner: [1, -1, 1], targetEdge: [1, 0, 1], centers: ["D", "F", "R"] },
  FL: { slot: "left", targetCorner: [-1, -1, 1], targetEdge: [-1, 0, 1], centers: ["D", "F", "L"] },
  BR: { slot: "back", targetCorner: [1, -1, -1], targetEdge: [1, 0, -1], centers: ["D", "B", "R"] },
  BL: { slot: "wrong", targetCorner: [-1, -1, -1], targetEdge: [-1, 0, -1], centers: ["D", "B", "L"] },
};

function getF2lCandidateSlotConfig(candidate: F2lCandidate) {
  return candidate.targetSlot === "auto"
    ? F2L_CANDIDATE_SLOT_CONFIG.FR
    : F2L_CANDIDATE_SLOT_CONFIG[candidate.targetSlot];
}

function createF2lCandidateLearningCase(candidate: F2lCandidate): LearningCase {
  const slotConfig = getF2lCandidateSlotConfig(candidate);

  return {
    id: candidate.id,
    type: "f2l",
    category: "f2l",
    name: candidate.name,
    title: candidate.name,
    subtitle: `${F2L_CANDIDATE_TYPE_LABELS[candidate.caseType]} / ${candidate.targetSlot}`,
    algorithm: candidate.alg,
    alternative: candidate.inverseAlg,
    description: candidate.description,
    image: {
      kind: "asset",
      category: "f2l",
      url: "",
      fileName: "",
      baseName: candidate.id,
      path: "",
    },
    imageUrl: "",
    highlightConfig: {
      kind: "f2l",
      startCorner: "topRight",
      startEdge: "top",
      targetCorner: slotConfig.targetCorner,
      targetEdge: slotConfig.targetEdge,
      targetSlot: candidate.targetSlot,
      highlightMode: "auto",
      slot: slotConfig.slot,
      centers: slotConfig.centers,
    },
    shape: [],
    tags: candidate.tags,
  };
}

function F2lCandidateReviewPage() {
  const [selectedId, setSelectedId] = useState(F2L_CANDIDATES[0]?.id ?? "");
  const selectedCandidate =
    F2L_CANDIDATES.find((candidate) => candidate.id === selectedId) ??
    F2L_CANDIDATES[0] ??
    null;
  const duplicateGroups = useMemo(() => findDuplicateF2lCandidates(F2L_CANDIDATES), []);
  const selectedValidation = useMemo(
    () => (selectedCandidate ? validateF2lCandidate(selectedCandidate) : null),
    [selectedCandidate],
  );
  const selectedAnimationCase = useMemo(
    () => (selectedCandidate ? createF2lCandidateLearningCase(selectedCandidate) : null),
    [selectedCandidate],
  );

  if (!selectedCandidate || !selectedValidation || !selectedAnimationCase) {
    return (
      <section className="learn-section-heading" aria-label="F2L candidate empty">
        <div>
          <p className="eyebrow">Review queue</p>
          <h2>F2L候補はまだありません</h2>
          <p>src/learn/f2lCandidateData.ts に候補を追加すると、ここで確認できます。</p>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="learn-section-heading" aria-label="F2L candidate review overview">
        <div>
          <p className="eyebrow">Review queue</p>
          <h2>追加F2L候補リスト</h2>
          <p>
            ここは正式DBへ入れる前の確認場所です。画像や説明文のコピーは使わず、手順候補だけを3Dで検証します。
          </p>
        </div>
        <div className="learn-total-progress">
          <strong>{F2L_CANDIDATE_SUMMARY.total}</strong>
          <span>
            invalid {F2L_CANDIDATE_SUMMARY.invalid} / duplicate {F2L_CANDIDATE_SUMMARY.duplicates}
          </span>
        </div>
      </section>

      <section className="f2l-candidate-layout" aria-label="F2L candidate review">
        <div className="f2l-candidate-list" aria-label="F2L candidate list">
          {F2L_CANDIDATES.map((candidate) => {
            const validation = validateF2lCandidate(candidate);

            return (
              <button
                aria-pressed={candidate.id === selectedCandidate.id}
                className="f2l-candidate-button"
                key={candidate.id}
                type="button"
                onClick={() => setSelectedId(candidate.id)}
              >
                <span>
                  <strong>{candidate.name}</strong>
                  <small>
                    {F2L_CANDIDATE_TYPE_LABELS[candidate.caseType]} / {candidate.targetSlot} /{" "}
                    {candidate.moveCount} moves
                  </small>
                </span>
                <b>{validation.ok ? candidate.status : "要確認"}</b>
              </button>
            );
          })}
        </div>

        <article className="f2l-candidate-detail">
          <div className="learn-detail-head">
            <div>
              <p className="eyebrow">Candidate detail</p>
              <h2>{selectedCandidate.name}</h2>
              <p>{selectedCandidate.description}</p>
            </div>
            <span className="status-pill status-learning">{selectedCandidate.status}</span>
          </div>

          <div className="algorithm-box">
            <span>候補手順</span>
            <div className="algorithm-line">
              <code>{selectedCandidate.alg}</code>
            </div>
          </div>

          <div className="algorithm-box algorithm-box-muted">
            <span>逆手順</span>
            <code>{selectedCandidate.inverseAlg}</code>
          </div>

          <dl className="f2l-candidate-meta">
            <div>
              <dt>分類</dt>
              <dd>{F2L_CANDIDATE_TYPE_LABELS[selectedCandidate.caseType]}</dd>
            </div>
            <div>
              <dt>targetSlot</dt>
              <dd>{selectedCandidate.targetSlot}</dd>
            </div>
            <div>
              <dt>難易度</dt>
              <dd>{F2L_CANDIDATE_DIFFICULTY_LABELS[selectedCandidate.difficulty]}</dd>
            </div>
            <div>
              <dt>手数</dt>
              <dd>{selectedCandidate.moveCount}</dd>
            </div>
          </dl>

          <div className="learn-tags" aria-label="Candidate tags">
            {selectedCandidate.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>

          <div className="f2l-candidate-source">
            <strong>source memo</strong>
            {selectedCandidate.source?.map((source) =>
              source.url?.startsWith("http") ? (
                <a href={source.url} key={`${source.name}-${source.url}`} rel="noreferrer" target="_blank">
                  {source.name}
                </a>
              ) : (
                <span key={source.name}>{source.name}</span>
              ),
            )}
          </div>

          <div className="f2l-candidate-validation">
            <strong>{selectedValidation.ok ? "検証OK" : "検証エラー"}</strong>
            <p>
              正規化: <code>{selectedValidation.normalizedAlg}</code>
            </p>
            {selectedValidation.errors.length > 0 && (
              <ul>
                {selectedValidation.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            )}
            {duplicateGroups.length > 0 && (
              <p>重複候補があります。候補データ側で正式採用前に統合してください。</p>
            )}
          </div>

          <Suspense
            fallback={
              <div className="algorithm-player algorithm-player-loading" role="status">
                候補プレイヤーを読み込んでいます。
              </div>
            }
          >
            <AlgorithmPlayer
              caseItem={selectedAnimationCase}
              headingLabel="F2L Candidate"
              headingTitle="候補手順3D確認"
            />
          </Suspense>
        </article>
      </section>
    </>
  );
}

function NotationPage() {
  const [activeGroup, setActiveGroup] = useState<NotationGroup>("basic");
  const activeGroupMoves = NOTATION_MOVES.filter((item) => item.group === activeGroup);
  const [selectedMove, setSelectedMove] = useState(activeGroupMoves[0]?.move ?? "U");
  const selectedNotationMove =
    NOTATION_MOVES.find((item) => item.move === selectedMove) ?? activeGroupMoves[0] ?? NOTATION_MOVES[0];
  const notationCase = useMemo(
    () => createNotationLearningCase(selectedNotationMove),
    [selectedNotationMove],
  );

  const selectGroup = (group: NotationGroup) => {
    const firstMove = NOTATION_MOVES.find((item) => item.group === group);
    setActiveGroup(group);
    setSelectedMove(firstMove?.move ?? selectedMove);
  };

  return (
    <>
      <section className="learn-section-heading notation-hero" aria-label="Notation overview">
        <div>
          <p className="eyebrow">Notation</p>
          <h2>回転記号を1手ずつ確認する</h2>
          <p>
            回転方向は「その面を正面から見たとき」を基準にしています。B / D / x / y / z は特に向きを確認しながら覚えます。
          </p>
        </div>
      </section>

      <div className="notation-group-tabs" aria-label="Notation groups">
        {NOTATION_GROUPS.map((group) => (
          <button
            aria-pressed={activeGroup === group.group}
            key={group.group}
            type="button"
            onClick={() => selectGroup(group.group)}
          >
            <strong>{group.label}</strong>
            <span>{group.description}</span>
          </button>
        ))}
      </div>

      <section className="notation-layout" aria-label="Notation moves">
        <div className="notation-move-list">
          {activeGroupMoves.map((move) => (
            <button
              aria-pressed={selectedNotationMove.move === move.move}
              className="notation-move-card"
              key={move.move}
              type="button"
              onClick={() => setSelectedMove(move.move)}
            >
              <span className="notation-symbol">{move.move}</span>
              <span>{move.direction}</span>
              <em>{move.supported ? "対応済み" : "未対応"}</em>
            </button>
          ))}
        </div>

        <article className="notation-detail-card">
          <div className="notation-detail-head">
            <div>
              <p className="eyebrow">Selected Move</p>
              <h2>{selectedNotationMove.move}</h2>
              <p>{selectedNotationMove.reading}</p>
            </div>
            <span className="status-pill status-pill-learned">
              {selectedNotationMove.supported ? "アニメーション対応" : "説明のみ"}
            </span>
          </div>

          <dl className="notation-info-grid">
            <div>
              <dt>回す場所</dt>
              <dd>{selectedNotationMove.face}</dd>
            </div>
            <div>
              <dt>方向</dt>
              <dd>{selectedNotationMove.direction}</dd>
            </div>
            <div>
              <dt>説明</dt>
              <dd>{selectedNotationMove.description}</dd>
            </div>
          </dl>

          <div className="notation-rule-box">
            <strong>読み方の基本</strong>
            <p>`'` は逆向き、`2` は180度です。時計回りは画面基準ではなく、回す面を正面から見た向きです。</p>
          </div>

          <Suspense
            fallback={
              <div className="algorithm-player algorithm-player-loading" role="status">
                回転記号プレイヤーを読み込んでいます。
              </div>
            }
          >
            <AlgorithmPlayer
              caseItem={notationCase}
              headingLabel="Notation Animation"
              headingTitle={`${selectedNotationMove.move} 単体再生`}
              showFocusLegend={false}
              startMode="solved"
            />
          </Suspense>

          <div className="notation-supported-box">
            <strong>現在のmove parser対応</strong>
            <ul>
              {SUPPORTED_MOVE_SUMMARY.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </article>
      </section>
    </>
  );
}

interface CaseListButtonProps {
  caseItem: LearningCase;
  status: LearningStatus;
  onOpen: () => void;
}

function CaseListButton({ caseItem, status, onOpen }: CaseListButtonProps) {
  return (
    <button
      className="learn-case-button"
      type="button"
      onClick={onOpen}
    >
      <CasePreview caseItem={caseItem} size="card" />
      <span className="learn-case-copy">
        <span className="case-name">{caseItem.name}</span>
        <strong>{caseItem.title}</strong>
        <small>{caseItem.subtitle}</small>
        <span className="case-tag-line">
          {caseItem.tags.slice(0, 3).map((tag) => (
            <em key={tag}>{tag}</em>
          ))}
        </span>
      </span>
      <StatusPill status={status} />
    </button>
  );
}

interface CaseDetailProps {
  caseItem: LearningCase;
  status: LearningStatus;
  onSetStatus: (status: LearningStatus) => void;
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

function CaseDetail({ caseItem, status, onSetStatus }: CaseDetailProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    setCopyStatus("idle");
  }, [caseItem.id]);

  const copyAlgorithm = async () => {
    try {
      await copyTextWithFallback(caseItem.algorithm);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <article className="learn-detail-card">
      <div className="learn-detail-head">
        <CasePreview caseItem={caseItem} size="detail" />
        <div>
          <p className="eyebrow">{LEARNING_CATEGORY_LABELS[caseItem.category]}</p>
          <h2>{caseItem.title}</h2>
          <p>{caseItem.subtitle}</p>
          <StatusPill status={status} />
        </div>
      </div>

      <div className="algorithm-box">
        <span>手順</span>
        <div className="algorithm-line">
          <code>{caseItem.algorithm}</code>
          <button type="button" onClick={copyAlgorithm}>
            Copy
          </button>
        </div>
        {copyStatus === "copied" && <small>コピーしました。</small>}
        {copyStatus === "failed" && <small>コピーできませんでした。</small>}
      </div>

      {caseItem.alternative && (
        <div className="algorithm-box algorithm-box-muted">
          <span>別手順</span>
          <code>{caseItem.alternative}</code>
        </div>
      )}

      <p className="learn-description">{caseItem.description}</p>

      <div className="learn-tags" aria-label="Case tags">
        {caseItem.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>

      <StatusButtons currentStatus={status} onSetStatus={onSetStatus} />

      <Suspense
        fallback={
          <div className="algorithm-player algorithm-player-loading" role="status">
            手順プレイヤーを読み込んでいます。
          </div>
        }
      >
        <AlgorithmPlayer caseItem={caseItem} />
      </Suspense>
    </article>
  );
}

interface LearnPracticePageProps {
  category: PracticeCategory;
  caseItem: LearningCase;
  isAnswerVisible: boolean;
  progress: LearningProgressMap;
  onCategoryChange: (category: PracticeCategory) => void;
  onRevealAnswer: () => void;
  onNext: () => void;
  onMarkStatus: (status: LearningStatus) => void;
  onSetStatus: (caseId: string, status: LearningStatus) => void;
}

function LearnPracticePage({
  category,
  caseItem,
  isAnswerVisible,
  progress,
  onCategoryChange,
  onRevealAnswer,
  onNext,
  onMarkStatus,
  onSetStatus,
}: LearnPracticePageProps) {
  const status = getCaseStatus(caseItem.id, progress);

  return (
    <section className="learn-practice-page" aria-label="Random practice">
      <div className="learn-section-heading">
        <div>
          <p className="eyebrow">Practice</p>
          <h2>ランダム練習</h2>
          <p>形だけを見て、手順を思い出してから答えを確認します。</p>
        </div>
        <div className="learn-filter-row learn-filter-row-compact">
          {PRACTICE_CATEGORY_OPTIONS.map((option) => (
            <button
              aria-pressed={category === option.value}
              key={option.value}
              type="button"
              onClick={() => onCategoryChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <article className="practice-question-card">
        <div className="practice-question-main">
          <CasePreview caseItem={caseItem} size="practice" />
          <div>
            <p className="eyebrow">{LEARNING_CATEGORY_LABELS[caseItem.category]}</p>
            <h2>{caseItem.title}</h2>
            <p>{caseItem.subtitle}</p>
            <StatusPill status={status} />
          </div>
        </div>

        {isAnswerVisible ? (
          <div className="practice-answer">
            <div className="algorithm-box">
              <span>答え</span>
              <code>{caseItem.algorithm}</code>
            </div>
            <p>{caseItem.description}</p>
            <StatusButtons
              currentStatus={status}
              onSetStatus={(nextStatus) => onSetStatus(caseItem.id, nextStatus)}
            />
          </div>
        ) : (
          <div className="practice-answer-placeholder">
            <p>答えを隠しています。手順を思い出してから確認してください。</p>
          </div>
        )}

        <div className="practice-actions">
          <button
            className="primary-button"
            type="button"
            onClick={isAnswerVisible ? onNext : onRevealAnswer}
          >
            {isAnswerVisible ? "次の問題" : "答えを見る"}
          </button>
          <button type="button" onClick={() => onMarkStatus("learned")}>
            覚えた
          </button>
          <button type="button" onClick={() => onMarkStatus("weak")}>
            まだ苦手
          </button>
        </div>
      </article>
    </section>
  );
}

function LearnPracticeEmpty() {
  return (
    <section className="learn-practice-page" aria-label="Random practice empty state">
      <div className="empty-state">
        <p>まだ練習できる画像がありません。</p>
        <span>
          src/assets/learn/f2l、src/assets/learn/oll、src/assets/learn/pll のいずれかに画像を追加してください。
        </span>
      </div>
    </section>
  );
}

interface StatusButtonsProps {
  currentStatus: LearningStatus;
  onSetStatus: (status: LearningStatus) => void;
}

function StatusButtons({ currentStatus, onSetStatus }: StatusButtonsProps) {
  return (
    <div className="status-button-row" aria-label="Learning status">
      {STATUS_OPTIONS.map((option) => (
        <button
          aria-pressed={currentStatus === option.status}
          key={option.status}
          type="button"
          onClick={() => onSetStatus(option.status)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface StatusPillProps {
  status: LearningStatus;
}

function StatusPill({ status }: StatusPillProps) {
  return <span className={`status-pill status-pill-${status}`}>{STATUS_LABELS[status]}</span>;
}

interface CaseDiagramProps {
  caseItem: LearningCase;
  size: "card" | "detail" | "practice";
}

function CasePreview({ caseItem, size }: CaseDiagramProps) {
  const className = `case-preview case-preview-${caseItem.category} case-preview-${size}`;

  if (caseItem.image.kind === "asset") {
    return <AssetCasePreview caseItem={caseItem} className={className} />;
  }

  if (caseItem.image.kind === "f2l") {
    return (
      <F2lPreview
        caseItem={caseItem}
        image={caseItem.image}
        label={caseItem.name}
        className={className}
      />
    );
  }

  if (caseItem.image.kind === "oll") {
    return <OllPreview image={caseItem.image} label={caseItem.name} className={className} />;
  }

  return <PllPreview caseId={caseItem.id} image={caseItem.image} label={caseItem.name} className={className} />;
}

function AssetCasePreview({
  caseItem,
  className,
}: {
  caseItem: LearningCase;
  className: string;
}) {
  return (
    <span
      aria-label={`${caseItem.name} image`}
      className={`${className} case-preview-image-shell`}
      role="img"
    >
      <img alt="" className="case-preview-image" src={caseItem.imageUrl} />
    </span>
  );
}

const PREVIEW_POINTS: Record<F2lPieceSpot, { x: number; y: number }> = {
  topLeft: { x: 54, y: 36 },
  top: { x: 95, y: 30 },
  topRight: { x: 136, y: 36 },
  left: { x: 45, y: 74 },
  center: { x: 95, y: 74 },
  right: { x: 145, y: 74 },
  bottomLeft: { x: 54, y: 112 },
  bottom: { x: 95, y: 118 },
  bottomRight: { x: 136, y: 112 },
};

function getStickerClass(sticker: LearningSticker): string {
  return `case-sticker case-sticker-${sticker}`;
}

function getSlotLabel(slot: F2lCaseImage["slot"]): string {
  switch (slot) {
    case "right":
      return "Right slot";
    case "left":
      return "Left slot";
    case "back":
      return "Back slot";
    case "wrong":
      return "Wrong slot";
  }
}

function F2lPreview({
  caseItem,
  image,
  label,
  className,
}: {
  caseItem: LearningCase;
  image: F2lCaseImage;
  label: string;
  className: string;
}) {
  const config = caseItem.highlightConfig.kind === "f2l" ? caseItem.highlightConfig : null;
  const cornerSpot = config?.startCorner ?? image.corner;
  const edgeSpot = config?.startEdge ?? image.edge;
  const slot = config?.slot ?? image.slot;
  const corner = PREVIEW_POINTS[cornerSpot];
  const edge = PREVIEW_POINTS[edgeSpot];
  const slotX = slot === "left" || slot === "wrong" ? 18 : slot === "back" ? 70 : 122;
  const slotY = slot === "back" ? 18 : 90;

  return (
    <svg aria-label={`${label} initial 3D thumbnail`} className={className} role="img" viewBox="0 0 190 150">
      <rect className="case-preview-bg" height="140" rx="16" width="180" x="5" y="5" />
      <g className="f2l-thumbnail-cube">
        <path className="f2l-plane f2l-plane-top" d="M38 24 H152 L170 84 H20 Z" />
        <path className="f2l-plane f2l-plane-front" d="M20 84 H170 L146 130 H44 Z" />
        <path className="f2l-plane f2l-plane-right" d="M152 24 L170 84 L146 130 L130 70 Z" />
        {[0, 1, 2].map((index) => (
          <g key={index}>
            <path className="f2l-grid-line" d={`M${38 + index * 38} 24 L${20 + index * 50} 84`} />
            <path className="f2l-grid-line" d={`M${152 - index * 38} 24 L${170 - index * 50} 84`} />
            <path className="f2l-grid-line" d={`M${28 + index * 8} ${44 + index * 20} H${162 - index * 8}`} />
          </g>
        ))}
        <rect
          className={`f2l-slot f2l-slot-${slot}`}
          height="35"
          rx="8"
          width="50"
          x={slotX}
          y={slotY}
        />
        <line className="f2l-piece-link" x1={corner.x} x2={edge.x} y1={corner.y} y2={edge.y} />
        <circle className="f2l-piece f2l-corner" cx={corner.x} cy={corner.y} r="13" />
        <text className="f2l-piece-label" x={corner.x} y={corner.y + 5}>
          C
        </text>
        <rect className="f2l-piece f2l-edge" height="24" rx="6" width="30" x={edge.x - 15} y={edge.y - 12} />
        <text className="f2l-piece-label" x={edge.x} y={edge.y + 5}>
          E
        </text>
      </g>
      {config?.centers.map((face, index) => (
        <g className={`f2l-center-chip f2l-center-${face}`} key={`${face}-${index}`}>
          <rect height="15" rx="5" width="22" x={16 + index * 25} y="119" />
          <text x={27 + index * 25} y="131">
            {face}
          </text>
        </g>
      ))}
      <text className="case-preview-badge" x="16" y="24">
        F2L
      </text>
      <text className="case-preview-caption" x="95" y="141">
        {getSlotLabel(slot)}
      </text>
    </svg>
  );
}

function OllPreview({
  image,
  label,
  className,
}: {
  image: OllCaseImage;
  label: string;
  className: string;
}) {
  const sidePositions = [
    { x: 53, y: 12 },
    { x: 82, y: 12 },
    { x: 111, y: 12 },
    { x: 139, y: 32 },
    { x: 139, y: 61 },
    { x: 139, y: 90 },
    { x: 111, y: 119 },
    { x: 82, y: 119 },
    { x: 53, y: 119 },
    { x: 24, y: 90 },
    { x: 24, y: 61 },
    { x: 24, y: 32 },
  ];

  return (
    <svg aria-label={`${label} shape`} className={className} role="img" viewBox="0 0 190 150">
      <rect className="case-preview-bg" height="140" rx="16" width="180" x="5" y="5" />
      <path className="oll-thumb-side oll-thumb-front" d="M52 122 H140 L127 138 H64 Z" />
      <path className="oll-thumb-side oll-thumb-right" d="M140 34 L158 51 V105 L140 122 Z" />
      <text className="case-preview-badge" x="16" y="25">
        OLL {image.number}
      </text>
      {sidePositions.map((position, index) => (
        <rect
          className={getStickerClass(image.side[index] ?? "empty")}
          height="16"
          key={`${image.number}-side-${index}`}
          rx="4"
          width="24"
          x={position.x}
          y={position.y}
        />
      ))}
      <g className="oll-top-grid">
        {image.top.map((sticker, index) => {
          const row = Math.floor(index / 3);
          const column = index % 3;

          return (
            <rect
              className={getStickerClass(sticker)}
              height="28"
              key={`${image.number}-${index}`}
              rx="6"
              width="28"
              x={53 + column * 29}
              y={34 + row * 29}
            />
          );
        })}
      </g>
    </svg>
  );
}

function PllPreview({
  caseId,
  image,
  label,
  className,
}: {
  caseId: string;
  image: PllCaseImage;
  label: string;
  className: string;
}) {
  const markerId = `arrow-${caseId}`;

  return (
    <svg aria-label={`${label} shape`} className={className} role="img" viewBox="0 0 190 150">
      <defs>
        <marker id={markerId} markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
          <path className="pll-arrow-head" d="M0,0 L8,4 L0,8 Z" />
        </marker>
      </defs>
      <rect className="case-preview-bg" height="140" rx="16" width="180" x="5" y="5" />
      <path className="pll-thumb-side pll-thumb-front" d="M55 121 H142 L128 138 H66 Z" />
      <path className="pll-thumb-side pll-thumb-right" d="M142 36 L160 53 V105 L142 121 Z" />
      <text className="case-preview-badge" x="16" y="25">
        {image.label}
      </text>
      {image.top.map((sticker, index) => {
        const row = Math.floor(index / 3);
        const column = index % 3;
        const spot = Object.keys(PREVIEW_POINTS)[index] as F2lPieceSpot;

        return (
          <rect
            className={`${getStickerClass(sticker)} ${
              image.blocks.includes(spot) ? "pll-block-sticker" : ""
            }`}
            height="26"
            key={`${image.label}-${index}`}
            rx="6"
            width="26"
            x={56 + column * 29}
            y={36 + row * 29}
          />
        );
      })}
      {image.arrows.map((arrow, index) => {
        const from = PREVIEW_POINTS[arrow.from];
        const to = PREVIEW_POINTS[arrow.to];

        return (
          <path
            className={`pll-arrow pll-arrow-${arrow.kind}`}
            d={`M${from.x} ${from.y} Q95 75 ${to.x} ${to.y}`}
            key={`${image.label}-${index}`}
            markerEnd={`url(#${markerId})`}
          />
        );
      })}
    </svg>
  );
}
