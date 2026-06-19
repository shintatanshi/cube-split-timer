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
}

export interface F2lOrderSearchPlan {
  id: string;
  order: F2lSlotName[];
  steps: F2lOrderSearchStep[];
  totalMoveCount: number;
  totalScore: number;
  finalState: CubeState;
  unresolvedPairs: F2lPairCandidate[];
  nodes: number;
  truncated: boolean;
  message: string;
}

export interface F2lOrderSearchOptions extends F2lSinglePairSearchOptions {
  maxPlans: number;
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
}