import { applyAlgorithm, applyMove, cloneCubeState } from "./cubeState";
import type {
  CubeColorName,
  CubePiece,
  CubeState,
  F2lSlotName,
  PieceKind,
  Vec3,
} from "./cubeState";
import { getF2lSearchMoves, shouldSkipRepeatedFaceMove } from "./f2lSearchMoves";
import {
  getF2lSearchGoalCheck,
  getF2lSearchGuardMessages,
  getF2lTargetSlotName,
  getSolvedF2lProtectedSlots,
} from "./f2lSearchGuards";
import type {
  F2lExtractionStartDiagnostic,
  F2lProtectedSlot,
  F2lSearchGoalFailureCounts,
  F2lSinglePairSearchDiagnostics,
  F2lSinglePairSearchInput,
  F2lSinglePairSearchResult,
  F2lSinglePairSearchSolution,
} from "./f2lSearchTypes";

const F2L_EXTRACTION_OPTIONS: Record<F2lSlotName, string[]> = {
  FR: ["R U R'", "R U' R'", "R U2 R'", "F' U' F", "F' U F", "F' U2 F"],
  FL: ["L' U' L", "L' U L", "L' U2 L", "F U F'", "F U' F'", "F U2 F'"],
  BR: ["R' U' R", "R' U R", "R' U2 R", "B U B'", "B U' B'", "B U2 B'"],
  BL: ["L U L'", "L U' L'", "L U2 L'", "B' U' B", "B' U B", "B' U2 B"],
};

const F2L_U_SETUPS = ["", "U", "U'", "U2"];
const MAX_EXTRACTION_STARTS = 96;
const MIN_LOCAL_NODE_LIMIT = 800;

interface ExtractionStartState {
  state: CubeState;
  prefixMoves: string[];
  pairScore: number;
}

interface SearchNodeCounter {
  count: number;
  truncated: boolean;
}

interface LocalSearchBudget {
  count: number;
  limit: number;
  exhausted: boolean;
}

interface SearchContext {
  input: F2lSinglePairSearchInput;
  targetSlot: F2lSlotName;
  protectedSlots: F2lProtectedSlot[];
  moves: string[];
  solutions: F2lSinglePairSearchSolution[];
  nodeCounter: SearchNodeCounter;
  diagnostics: F2lSinglePairSearchDiagnostics;
  bestStateDepths: Map<string, number>;
}

function joinAlgorithms(...algorithms: string[]): string {
  return algorithms
    .map((algorithm) => algorithm.trim())
    .filter(Boolean)
    .join(" ");
}

function parseAlgorithmMoves(algorithm: string): string[] {
  return algorithm.trim().split(/\s+/).filter(Boolean);
}

function sameCoord(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function hasColors(piece: CubePiece, colors: CubeColorName[]): boolean {
  return (
    piece.stickers.length === colors.length &&
    colors.every((color) => piece.stickers.some((sticker) => sticker.color === color))
  );
}

function getPieceByColors(
  state: CubeState,
  kind: PieceKind,
  colors: CubeColorName[],
): CubePiece | null {
  return state.pieces.find((piece) => piece.kind === kind && hasColors(piece, colors)) ?? null;
}

function getSlotNameFromCoord(coord: Vec3): F2lSlotName | null {
  if (coord[0] === 1 && coord[2] === 1) {
    return "FR";
  }

  if (coord[0] === -1 && coord[2] === 1) {
    return "FL";
  }

  if (coord[0] === 1 && coord[2] === -1) {
    return "BR";
  }

  if (coord[0] === -1 && coord[2] === -1) {
    return "BL";
  }

  return null;
}

function isPieceInTargetSlot(piece: CubePiece, targetSlot: F2lSlotName): boolean {
  return getSlotNameFromCoord(piece.coord) === targetSlot && piece.coord[1] <= 0;
}

function getPieceAccessibilityScore(piece: CubePiece | null, targetSlot: F2lSlotName): number {
  if (!piece) {
    return 200;
  }

  if (piece.coord[1] === 1) {
    return 0;
  }

  if (isPieceInTargetSlot(piece, targetSlot)) {
    return 12;
  }

  if (getSlotNameFromCoord(piece.coord)) {
    return 28;
  }

  return 8;
}

function getPairAccessibilityScore(
  input: F2lSinglePairSearchInput,
  state: CubeState,
  targetSlot: F2lSlotName,
): number {
  const corner = getPieceByColors(state, "corner", input.pair.cornerColors);
  const edge = getPieceByColors(state, "edge", input.pair.edgeColors);

  return (
    getPieceAccessibilityScore(corner, targetSlot) +
    getPieceAccessibilityScore(edge, targetSlot)
  );
}

function getExtractionPriorityScore(
  input: F2lSinglePairSearchInput,
  state: CubeState,
  targetSlot: F2lSlotName,
  prefixMoves: string[],
): number {
  const goalCheck = getF2lSearchGoalCheck(state, input.pair, input.options);
  const crossPenalty = goalCheck.crossSolved ? 0 : 35;
  const protectedPenalty = goalCheck.protectedSlotsSolved ? 0 : 20;
  const targetPairBonus = goalCheck.targetPairSolved ? -40 : 0;

  return (
    getPairAccessibilityScore(input, state, targetSlot) +
    crossPenalty +
    protectedPenalty +
    targetPairBonus +
    prefixMoves.length * 0.25
  );
}

function getCubeStateSignature(state: CubeState): string {
  return state.pieces
    .map((piece) => {
      const stickers = piece.stickers
        .map((sticker) => `${sticker.color}:${sticker.face}`)
        .sort()
        .join(",");

      return `${piece.id}:${piece.coord.join(",")}:${stickers}`;
    })
    .sort()
    .join("|");
}

function getExtractionStartStates(
  input: F2lSinglePairSearchInput,
  targetSlot: F2lSlotName,
): ExtractionStartState[] {
  const starts = new Map<string, ExtractionStartState>();

  const addStart = (algorithm: string, state: CubeState) => {
    const moves = parseAlgorithmMoves(algorithm);
    const signature = getCubeStateSignature(state);
    const pairScore = getExtractionPriorityScore(input, state, targetSlot, moves);

    const existing = starts.get(signature);
    if (!existing || pairScore < existing.pairScore) {
      starts.set(signature, {
        state,
        prefixMoves: moves,
        pairScore,
      });
    }
  };

  addStart("", input.state);

  const extractionSlots: F2lSlotName[] = ["FR", "FL", "BR", "BL"];

  for (const slotName of extractionSlots) {
    for (const extraction of F2L_EXTRACTION_OPTIONS[slotName]) {
      for (const beforeU of F2L_U_SETUPS) {
        for (const afterU of F2L_U_SETUPS) {
          const algorithm = joinAlgorithms(beforeU, extraction, afterU);
          const moves = parseAlgorithmMoves(algorithm);
          const nextState = applyAlgorithm(input.state, moves);

          addStart(algorithm, nextState);
        }
      }
    }
  }

  return [...starts.values()].sort(
    (a, b) =>
      a.pairScore - b.pairScore ||
      a.prefixMoves.length - b.prefixMoves.length ||
      a.prefixMoves.join(" ").localeCompare(b.prefixMoves.join(" ")),
  );
}

function getMoveScore(move: string): number {
  if (move.endsWith("2")) {
    return 1.2;
  }

  return 1;
}

function getAlgorithmScore(moves: string[]): number {
  return moves.reduce((sum, move) => sum + getMoveScore(move), 0);
}

function createFailureCounts(): F2lSearchGoalFailureCounts {
  return {
    cross: 0,
    targetPair: 0,
    protectedSlots: 0,
  };
}

function createDiagnostics(
  targetSlot: F2lSlotName,
  protectedSlots: F2lProtectedSlot[],
  input: F2lSinglePairSearchInput,
): F2lSinglePairSearchDiagnostics {
  return {
    targetSlot,
    protectedSlots,
    maxDepth: input.options.maxDepth,
    maxNodes: input.options.maxNodes,
    extractionStartCount: 0,
    searchedStartCount: 0,
    nodes: 0,
    truncated: false,
    failureCounts: createFailureCounts(),
    startDiagnostics: [],
    resultReason: "",
  };
}

function snapshotDiagnostics(
  diagnostics: F2lSinglePairSearchDiagnostics,
  nodes: number,
  truncated: boolean,
  resultReason: string,
): F2lSinglePairSearchDiagnostics {
  return {
    ...diagnostics,
    protectedSlots: diagnostics.protectedSlots.map((slot) => ({ ...slot })),
    nodes,
    truncated,
    failureCounts: { ...diagnostics.failureCounts },
    startDiagnostics: diagnostics.startDiagnostics.map((start) => ({ ...start })),
    resultReason,
  };
}

function createSolution(
  context: SearchContext,
  path: string[],
  stateAfter: CubeState,
): F2lSinglePairSearchSolution {
  const { input, targetSlot, protectedSlots, nodeCounter, solutions } = context;

  return {
    id: `f2l-single-${input.pair.id}-${solutions.length + 1}`,
    method: "conditionalSearch",
    pairId: input.pair.id,
    pairTitle: input.pair.title,
    targetSlot,
    algorithm: path.join(" "),
    moves: [...path],
    moveCount: path.length,
    score: getAlgorithmScore(path),
    stateAfter: cloneCubeState(stateAfter),
    nodes: nodeCounter.count,
    protectedSlots,
    diagnostics: snapshotDiagnostics(
      context.diagnostics,
      nodeCounter.count,
      nodeCounter.truncated,
      "solution",
    ),
  };
}

function createEmptyResult(
  input: F2lSinglePairSearchInput,
  targetSlot: F2lSlotName,
  status: F2lSinglePairSearchResult["status"],
  message: string,
  nodes: number,
  truncated: boolean,
  diagnostics: F2lSinglePairSearchDiagnostics,
): F2lSinglePairSearchResult {
  return {
    pairId: input.pair.id,
    pairTitle: input.pair.title,
    targetSlot,
    status,
    solutions: [],
    nodes,
    maxDepth: input.options.maxDepth,
    maxNodes: input.options.maxNodes,
    truncated,
    message,
    diagnostics: snapshotDiagnostics(diagnostics, nodes, truncated, message),
  };
}

function recordGoalFailure(
  diagnostics: F2lSinglePairSearchDiagnostics,
  goalCheck: ReturnType<typeof getF2lSearchGoalCheck>,
): void {
  if (!goalCheck.crossSolved) {
    diagnostics.failureCounts.cross += 1;
  }

  if (!goalCheck.targetPairSolved) {
    diagnostics.failureCounts.targetPair += 1;
  }

  if (!goalCheck.protectedSlotsSolved) {
    diagnostics.failureCounts.protectedSlots += 1;
  }
}

function shouldVisitState(
  context: SearchContext,
  signature: string,
  pathLength: number,
  lastMove: string | null,
): boolean {
  const cacheKey = `${signature}|${lastMove ?? ""}`;
  const bestDepth = context.bestStateDepths.get(cacheKey);

  if (bestDepth !== undefined && bestDepth <= pathLength) {
    return false;
  }

  context.bestStateDepths.set(cacheKey, pathLength);
  return true;
}

function depthFirstSearch(
  context: SearchContext,
  currentState: CubeState,
  depthRemaining: number,
  path: string[],
  lastMove: string | null,
  seenPath: Set<string>,
  localBudget: LocalSearchBudget,
): void {
  const { input, nodeCounter, solutions } = context;

  if (nodeCounter.count >= input.options.maxNodes) {
    nodeCounter.truncated = true;
    return;
  }

  if (localBudget.count >= localBudget.limit) {
    localBudget.exhausted = true;
    return;
  }

  if (solutions.length >= input.options.maxSolutions) {
    return;
  }

  nodeCounter.count += 1;
  localBudget.count += 1;

  const goalOptions = {
    ...input.options,
    protectedSlots: context.protectedSlots,
  };

  if (path.length > 0) {
    const goalCheck = getF2lSearchGoalCheck(currentState, input.pair, goalOptions);

    if (goalCheck.isGoal) {
      solutions.push(createSolution(context, path, currentState));
      return;
    }

    recordGoalFailure(context.diagnostics, goalCheck);
  }

  if (depthRemaining === 0) {
    return;
  }

  for (const move of context.moves) {
    if (shouldSkipRepeatedFaceMove(move, lastMove)) {
      continue;
    }

    const nextState = applyMove(currentState, move);
    const signature = getCubeStateSignature(nextState);
    const nextPathLength = path.length + 1;

    if (seenPath.has(signature) || !shouldVisitState(context, signature, nextPathLength, move)) {
      continue;
    }

    seenPath.add(signature);

    depthFirstSearch(
      context,
      nextState,
      depthRemaining - 1,
      [...path, move],
      move,
      seenPath,
      localBudget,
    );

    seenPath.delete(signature);

    if (
      nodeCounter.truncated ||
      localBudget.exhausted ||
      nodeCounter.count >= input.options.maxNodes ||
      solutions.length >= input.options.maxSolutions
    ) {
      return;
    }
  }
}

function getLocalNodeLimit(maxNodes: number, extractionStartCount: number): number {
  return Math.max(
    MIN_LOCAL_NODE_LIMIT,
    Math.ceil(maxNodes / Math.max(1, Math.min(extractionStartCount, 32))),
  );
}

export function searchF2lSinglePair(
  input: F2lSinglePairSearchInput,
): F2lSinglePairSearchResult {
  const targetSlot = getF2lTargetSlotName(input.pair);

  if (input.options.targetFace !== "D") {
    const diagnostics = createDiagnostics(targetSlot, [], input);

    return createEmptyResult(
      input,
      targetSlot,
      "invalid",
      "現在のF2L条件付き探索はD面Crossのみ対応しています。",
      0,
      false,
      diagnostics,
    );
  }

  const protectedSlots = input.options.protectSolvedSlots
    ? input.options.protectedSlots ??
      getSolvedF2lProtectedSlots(input.state, input.options.crossColor, input.options.targetFace)
    : [];
  const diagnostics = createDiagnostics(targetSlot, protectedSlots, input);
  const moves = getF2lSearchMoves(targetSlot, "standard");
  const nodeCounter: SearchNodeCounter = {
    count: 0,
    truncated: false,
  };

  const contextInput: F2lSinglePairSearchInput = {
    ...input,
    state: cloneCubeState(input.state),
    options: {
      ...input.options,
      protectedSlots,
    },
  };
  const context: SearchContext = {
    input: contextInput,
    targetSlot,
    protectedSlots,
    moves,
    solutions: [],
    nodeCounter,
    diagnostics,
    bestStateDepths: new Map<string, number>(),
  };

  const extractionStarts = getExtractionStartStates(context.input, targetSlot).slice(
    0,
    MAX_EXTRACTION_STARTS,
  );
  const localNodeLimit = getLocalNodeLimit(input.options.maxNodes, extractionStarts.length);

  diagnostics.extractionStartCount = extractionStarts.length;
  diagnostics.startDiagnostics = extractionStarts.map<F2lExtractionStartDiagnostic>((start) => ({
    prefix: start.prefixMoves.join(" "),
    prefixMoveCount: start.prefixMoves.length,
    pairScore: start.pairScore,
    nodes: 0,
    maxDepthSearched: -1,
    solutionsFound: 0,
    localBudgetHit: false,
  }));

  for (let depth = 0; depth <= input.options.maxDepth; depth += 1) {
    if (nodeCounter.truncated || context.solutions.length >= input.options.maxSolutions) {
      break;
    }

    for (const [index, start] of extractionStarts.entries()) {
      if (nodeCounter.truncated || context.solutions.length >= input.options.maxSolutions) {
        break;
      }

      const startDiagnostic = diagnostics.startDiagnostics[index];
      if (!startDiagnostic || startDiagnostic.nodes >= localNodeLimit) {
        if (startDiagnostic) {
          startDiagnostic.localBudgetHit = true;
        }
        continue;
      }

      const beforeNodes = nodeCounter.count;
      const beforeSolutions = context.solutions.length;
      const localBudget: LocalSearchBudget = {
        count: 0,
        limit: localNodeLimit - startDiagnostic.nodes,
        exhausted: false,
      };
      const seenPath = new Set<string>([getCubeStateSignature(start.state)]);
      const lastPrefixMove = start.prefixMoves[start.prefixMoves.length - 1] ?? null;

      depthFirstSearch(
        context,
        start.state,
        depth,
        start.prefixMoves,
        lastPrefixMove,
        seenPath,
        localBudget,
      );

      startDiagnostic.nodes += nodeCounter.count - beforeNodes;
      startDiagnostic.maxDepthSearched = Math.max(startDiagnostic.maxDepthSearched, depth);
      startDiagnostic.solutionsFound += context.solutions.length - beforeSolutions;
      startDiagnostic.localBudgetHit ||= localBudget.exhausted;
    }
  }

  diagnostics.nodes = nodeCounter.count;
  diagnostics.truncated = nodeCounter.truncated;
  diagnostics.searchedStartCount = diagnostics.startDiagnostics.filter(
    (start) => start.nodes > 0,
  ).length;

  if (context.solutions.length > 0) {
    const sortedSolutions = [...context.solutions].sort(
      (a, b) =>
        a.moveCount - b.moveCount ||
        a.score - b.score ||
        a.algorithm.localeCompare(b.algorithm),
    );
    const message = `${sortedSolutions[0].moveCount}手のF2L手順が見つかりました。`;
    const resultDiagnostics = snapshotDiagnostics(
      diagnostics,
      nodeCounter.count,
      nodeCounter.truncated,
      message,
    );

    return {
      pairId: input.pair.id,
      pairTitle: input.pair.title,
      targetSlot,
      status: "solved",
      solutions: sortedSolutions.map((solution) => ({
        ...solution,
        diagnostics: resultDiagnostics,
      })),
      nodes: nodeCounter.count,
      maxDepth: input.options.maxDepth,
      maxNodes: input.options.maxNodes,
      truncated: nodeCounter.truncated,
      message,
      diagnostics: resultDiagnostics,
    };
  }

  const guardMessages = getF2lSearchGuardMessages(input.state, input.pair, {
    ...input.options,
    protectedSlots,
  });

  if (nodeCounter.truncated) {
    return createEmptyResult(
      input,
      targetSlot,
      "truncated",
      "探索ノード上限に達したため、途中で打ち切りました。",
      nodeCounter.count,
      true,
      diagnostics,
    );
  }

  return createEmptyResult(
    input,
    targetSlot,
    "notFound",
    guardMessages.length > 0
      ? `条件を満たす手順が見つかりませんでした。現在状態の確認: ${guardMessages.join(" / ")}`
      : "条件を満たすF2L手順が見つかりませんでした。",
    nodeCounter.count,
    false,
    diagnostics,
  );
}
