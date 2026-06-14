export type Penalty = "none" | "+2" | "DNF";

export type SolveMode =
  | "normal"
  | "cfop_split"
  | "cross_practice"
  | "f2l_practice"
  | "f2l_pair_split";

export type CfopPhase = "cross" | "f2l" | "oll" | "pll";

export type F2lPairPhase = "pair1" | "pair2" | "pair3" | "pair4";

export type SplitPhase = CfopPhase | F2lPairPhase;

export type ThemePreference = "dark" | "light" | "system";

export type LearningCategory = "f2l" | "oll" | "pll";

export type LearningStatus = "unlearned" | "learning" | "learned" | "weak";

export type LearningSticker = "empty" | "primary" | "secondary" | "accent" | "muted";
export type F2lSlotName = "FR" | "FL" | "BR" | "BL";
export type F2lTargetSlot = "auto" | F2lSlotName;
export type F2lCaseType =
  | "basic41"
  | "advanced"
  | "backSlot"
  | "insertVariation"
  | "extraction"
  | "rotationless"
  | "other";
export type F2lCandidateStatus = "candidate" | "reviewed" | "approved" | "rejected";
export type F2lCandidateDifficulty = "basic" | "intermediate" | "advanced";

export interface F2lCandidateSource {
  name: string;
  url?: string;
}

export interface F2lCandidate {
  id: string;
  caseType: F2lCaseType;
  name: string;
  alg: string;
  inverseAlg?: string;
  targetSlot: F2lTargetSlot;
  difficulty: F2lCandidateDifficulty;
  tags: string[];
  moveCount: number;
  score?: number;
  description: string;
  source?: F2lCandidateSource[];
  status: F2lCandidateStatus;
  notes?: string;
}

export interface F2lCase {
  id: string;
  caseType: F2lCaseType;
  name: string;
  alg: string;
  inverseAlg?: string;
  targetSlot: F2lTargetSlot;
  difficulty: F2lCandidateDifficulty;
  tags: string[];
  moveCount: number;
  score?: number;
  description: string;
  source?: F2lCandidateSource[];
  learnCaseId?: string;
  notes?: string;
}

export type AnalyzerPhase = "cross" | "f2l" | "oll" | "pll";

export interface AnalyzerCandidate {
  id: string;
  phase: AnalyzerPhase;
  name: string;
  algorithm: string;
  moveCount?: number;
  description?: string;
  targetSlot?: F2lTargetSlot;
  learnCaseId?: string;
  tags?: string[];
  caseType?: F2lCaseType;
}

export type F2lPieceSpot =
  | "topLeft"
  | "top"
  | "topRight"
  | "left"
  | "center"
  | "right"
  | "bottomLeft"
  | "bottom"
  | "bottomRight";

export interface F2lCaseImage {
  kind: "f2l";
  slot: "right" | "left" | "back" | "wrong";
  relation: "paired" | "split" | "edgeSlot" | "cornerSlot" | "wrongSlot" | "backSlot";
  corner: F2lPieceSpot;
  edge: F2lPieceSpot;
}

export interface OllCaseImage {
  kind: "oll";
  number: string;
  top: LearningSticker[];
  side: LearningSticker[];
}

export interface PllArrow {
  from: F2lPieceSpot;
  to: F2lPieceSpot;
  kind: "edge" | "corner";
}

export interface PllCaseImage {
  kind: "pll";
  label: string;
  top: LearningSticker[];
  arrows: PllArrow[];
  blocks: F2lPieceSpot[];
}

export interface AssetLearnCaseImage {
  kind: "asset";
  category: LearningCategory;
  url: string;
  fileName: string;
  baseName: string;
  path: string;
}

export type LearningCaseImage =
  | F2lCaseImage
  | OllCaseImage
  | PllCaseImage
  | AssetLearnCaseImage;

export type CubeFaceName = "U" | "D" | "F" | "B" | "R" | "L";
export type CubeCoord = [number, number, number];

export interface F2lHighlightConfig {
  kind: "f2l";
  startCorner: F2lPieceSpot;
  startEdge: F2lPieceSpot;
  targetCorner: CubeCoord;
  targetEdge: CubeCoord;
  targetSlot: F2lTargetSlot;
  highlightMode?: "auto" | "manual";
  manualHighlight?: {
    corner?: string;
    edge?: string;
  };
  slot: F2lCaseImage["slot"];
  centers: CubeFaceName[];
}

export interface OllHighlightConfig {
  kind: "oll";
  yellowPattern: LearningSticker[];
  sidePattern: LearningSticker[];
  focusFaces: CubeFaceName[];
}

export interface PllHighlightConfig {
  kind: "pll";
  arrows: PllArrow[];
  blocks: F2lPieceSpot[];
  focusFaces: CubeFaceName[];
}

export type LearningHighlightConfig =
  | F2lHighlightConfig
  | OllHighlightConfig
  | PllHighlightConfig;

export interface SplitDraft {
  phase: SplitPhase;
  time: number;
  cumulativeTime: number;
}

export interface CurrentSolveDraft {
  status: "running";
  mode: SolveMode;
  startTime: number;
  scramble: string;
  splits: SplitDraft[];
}

export interface BaseSolveRecord {
  id: string;
  mode: SolveMode;
  totalTime: number;
  scramble: string;
  penalty: Penalty;
  deletedAt: string | null;
  createdAt: string;
}

export interface NormalSolveRecord extends BaseSolveRecord {
  mode: "normal";
}

export interface CfopSplitSolveRecord extends BaseSolveRecord {
  mode: "cfop_split";
  crossTime: number;
  f2lTime: number;
  ollTime: number;
  pllTime: number;
}

export interface CrossPracticeSolveRecord extends BaseSolveRecord {
  mode: "cross_practice";
  crossTime: number;
  crossColor: string;
}

export interface F2lPracticeSolveRecord extends BaseSolveRecord {
  mode: "f2l_practice";
  f2lTime: number;
}

export interface F2lPairSplitSolveRecord extends BaseSolveRecord {
  mode: "f2l_pair_split";
  pair1Time: number;
  pair2Time: number;
  pair3Time: number;
  pair4Time: number;
}

export type SolveRecord =
  | NormalSolveRecord
  | CfopSplitSolveRecord
  | CrossPracticeSolveRecord
  | F2lPracticeSolveRecord
  | F2lPairSplitSolveRecord;

export interface TimedValue {
  value: number | null;
  isDnf: boolean;
}

export interface LearningCase {
  id: string;
  type: LearningCategory;
  category: LearningCategory;
  name: string;
  title: string;
  subtitle: string;
  algorithm: string;
  alternative?: string;
  description: string;
  image: LearningCaseImage;
  imageUrl: string;
  highlightConfig: LearningHighlightConfig;
  shape: LearningSticker[];
  tags: string[];
}

export type LearningProgressMap = Record<string, LearningStatus>;
