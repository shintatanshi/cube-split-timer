import type {
  CubeColorName,
  CubeState,
  F2lPairCandidate,
  F2lSlotName,
  TargetFace,
} from "./cubeState";

export type F2lSearchMethod = "conditionalSearch";

export type F2lSearchStatus = "solved" | "notFound" | "truncated" | "invalid";

export interface F2lProtectedSlot {
  slotName: F2lSlotName;
  reason: "alreadySolved" | "manual";
}

export interface F2lSinglePairSearchOptions {
  crossColor: CubeColorName;
  targetFace: TargetFace;
  maxDepth: number;
  maxNodes: number;
  maxSolutions: number;
  protectSolvedSlots: boolean;

  protectedSlots?: F2lProtectedSlot[];
}

export interface F2lSinglePairSearchInput {
  state: CubeState;
  pair: F2lPairCandidate;
  options: F2lSinglePairSearchOptions;
}

export interface F2lSearchGoalFailureCounts {
  cross: number;
  targetPair: number;
  protectedSlots: number;
}

export interface F2lExtractionStartDiagnostic {
  prefix: string;
  prefixMoveCount: number;
  pairScore: number;
  nodes: number;
  maxDepthSearched: number;
  solutionsFound: number;
  localBudgetHit: boolean;
}

export interface F2lSinglePairSearchDiagnostics {
  targetSlot: F2lSlotName;
  protectedSlots: F2lProtectedSlot[];
  maxDepth: number;
  maxNodes: number;
  extractionStartCount: number;
  searchedStartCount: number;
  nodes: number;
  truncated: boolean;
  failureCounts: F2lSearchGoalFailureCounts;
  startDiagnostics: F2lExtractionStartDiagnostic[];
  resultReason: string;
}

export interface F2lSinglePairSearchSolution {
  id: string;
  method: F2lSearchMethod;
  pairId: string;
  pairTitle: string;
  targetSlot: F2lSlotName;
  algorithm: string;
  moves: string[];
  moveCount: number;
  score: number;
  stateAfter: CubeState;
  nodes: number;
  protectedSlots: F2lProtectedSlot[];
  diagnostics: F2lSinglePairSearchDiagnostics;
}

export interface F2lSinglePairSearchResult {
  pairId: string;
  pairTitle: string;
  targetSlot: F2lSlotName;
  status: F2lSearchStatus;
  solutions: F2lSinglePairSearchSolution[];
  nodes: number;
  maxDepth: number;
  maxNodes: number;
  truncated: boolean;
  message: string;
  diagnostics: F2lSinglePairSearchDiagnostics;
}

export interface F2lOrderSearchStep {
  stepIndex: number;
  pairId: string;
  pairTitle: string;
  targetSlot: F2lSlotName;
  algorithm: string;
  moves: string[];
  moveCount: number;
  score: number;
  stateAfter: CubeState;
  nodes: number;
  diagnostics: F2lSinglePairSearchDiagnostics;
}

export interface F2lOrderSearchPlan {
  id: string;
  order: F2lSlotName[];
  steps: F2lOrderSearchStep[];
  totalMoveCount: number;
  totalScore: number;
  finalState: CubeState;
  unresolvedPairs: F2lPairCandidate[];
  isComplete: boolean;
  nodes: number;
  truncated: boolean;
  message: string;
}

export interface F2lOrderSearchOptions extends F2lSinglePairSearchOptions {
  maxPlans: number;
  beamWidth?: number;
  resultLimit?: number;
  solutionsPerPair?: number;
  maxDepthLastPair?: number;
  maxNodesLastPair?: number;
}

export interface F2lOrderSearchInput {
  state: CubeState;
  options: F2lOrderSearchOptions;
}

export interface F2lOrderSearchResult {
  plans: F2lOrderSearchPlan[];
  nodes: number;
  truncated: boolean;
  message: string;
  diagnostics: F2lOrderSearchDiagnostics;
}

export interface F2lOrderSearchStepDiagnostics {
  order: F2lSlotName[];
  stepIndex: number;
  targetSlot: F2lSlotName;
  protectedSlots: F2lProtectedSlot[];
  status: F2lSearchStatus;
  message: string;
  nodes: number;
  maxDepth: number;
  maxNodes: number;
  extractionStartCount: number;
  truncated: boolean;
  failureCounts: F2lSearchGoalFailureCounts;
}

export interface F2lOrderSearchDiagnostics {
  orderCount: number;
  beamWidth: number;
  resultLimit: number;
  solutionsPerPair: number;
  steps: F2lOrderSearchStepDiagnostics[];
}
