import { cloneCubeState, getF2lPairCandidates } from "./cubeState";
import type { CubeState, F2lPairCandidate, F2lSlotName } from "./cubeState";
import { getF2lTargetSlotName } from "./f2lSearchGuards";
import { searchF2lSinglePair } from "./f2lSinglePairSearch";
import type {
  F2lOrderSearchInput,
  F2lOrderSearchPlan,
  F2lOrderSearchResult,
  F2lOrderSearchStep,
  F2lSinglePairSearchOptions,
} from "./f2lSearchTypes";

function getUniqueUnsolvedSlots(state: CubeState, options: F2lSinglePairSearchOptions): F2lSlotName[] {
  const candidates = getF2lPairCandidates(state, options.crossColor, options.targetFace);

  return [
    ...new Set(
      candidates
        .filter((candidate) => candidate.status === "unsolved")
        .map((candidate) => getF2lTargetSlotName(candidate)),
    ),
  ];
}

function getPermutations<T>(items: T[]): T[][] {
  if (items.length <= 1) {
    return [items];
  }

  return items.flatMap((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];

    return getPermutations(rest).map((permutation) => [item, ...permutation]);
  });
}

function getNextCandidateByOrder(
  candidates: F2lPairCandidate[],
  order: F2lSlotName[],
): F2lPairCandidate | null {
  const unsolvedCandidates = candidates.filter((candidate) => candidate.status === "unsolved");

  if (unsolvedCandidates.length === 0) {
    return null;
  }

  for (const slotName of order) {
    const match = unsolvedCandidates.find(
      (candidate) => getF2lTargetSlotName(candidate) === slotName,
    );

    if (match) {
      return match;
    }
  }

  return unsolvedCandidates[0] ?? null;
}

function createStep(
  stepIndex: number,
  solution: ReturnType<typeof searchF2lSinglePair>["solutions"][number],
): F2lOrderSearchStep {
  return {
    stepIndex,
    pairId: solution.pairId,
    pairTitle: solution.pairTitle,
    targetSlot: solution.targetSlot,
    algorithm: solution.algorithm,
    moves: solution.moves,
    moveCount: solution.moveCount,
    score: solution.score,
    stateAfter: solution.stateAfter,
    nodes: solution.nodes,
  };
}

function getPlanRank(plan: F2lOrderSearchPlan): number {
  return plan.unresolvedPairs.length * 100_000 + plan.totalScore;
}

function buildPlanForOrder(input: F2lOrderSearchInput, order: F2lSlotName[]): F2lOrderSearchPlan {
  let currentState = cloneCubeState(input.state);
  const steps: F2lOrderSearchStep[] = [];
  let nodes = 0;
  let truncated = false;
  let message = "";

  for (let stepIndex = 1; stepIndex <= order.length; stepIndex += 1) {
    const candidates = getF2lPairCandidates(
      currentState,
      input.options.crossColor,
      input.options.targetFace,
    );
    const nextCandidate = getNextCandidateByOrder(candidates, order);

    if (!nextCandidate) {
      message = "未完成F2Lペアがなくなったため、この順番の探索を終了しました。";
      break;
    }

    const result = searchF2lSinglePair({
      state: currentState,
      pair: nextCandidate,
      options: {
        ...input.options,
        protectedSlots: undefined,
      },
    });

    nodes += result.nodes;
    truncated = truncated || result.truncated;

    const bestSolution = result.solutions[0];

    if (!bestSolution) {
      message = `${nextCandidate.title} の手順が見つからなかったため、この順番は途中で終了しました。`;
      break;
    }

    steps.push(createStep(stepIndex, bestSolution));
    currentState = cloneCubeState(bestSolution.stateAfter);
  }

  const unresolvedPairs = getF2lPairCandidates(
    currentState,
    input.options.crossColor,
    input.options.targetFace,
  ).filter((candidate) => candidate.status !== "completed");

  const totalMoveCount = steps.reduce((sum, step) => sum + step.moveCount, 0);
  const totalScore = steps.reduce((sum, step) => sum + step.score, 0);

  if (!message) {
    message =
      unresolvedPairs.length === 0
        ? "この順番でF2L 4ペアがすべて完成しました。"
        : "この順番では一部のF2Lペアが未解決のまま残りました。";
  }

  return {
    id: `f2l-order-${order.join("-")}`,
    order,
    steps,
    totalMoveCount,
    totalScore,
    finalState: currentState,
    unresolvedPairs,
    nodes,
    truncated,
    message,
  };
}

export function searchF2lOrders(input: F2lOrderSearchInput): F2lOrderSearchResult {
  if (input.options.targetFace !== "D") {
    return {
      plans: [],
      nodes: 0,
      truncated: false,
      message: "現在のF2L順番探索はD面Crossのみ対応しています。",
    };
  }

  const baseSlots = getUniqueUnsolvedSlots(input.state, input.options);

  if (baseSlots.length === 0) {
    return {
      plans: [
        {
          id: "f2l-order-already-solved",
          order: [],
          steps: [],
          totalMoveCount: 0,
          totalScore: 0,
          finalState: cloneCubeState(input.state),
          unresolvedPairs: [],
          nodes: 0,
          truncated: false,
          message: "F2Lはすでに完成しています。",
        },
      ],
      nodes: 0,
      truncated: false,
      message: "F2Lはすでに完成しています。",
    };
  }

  const orders = getPermutations(baseSlots);
  const plans = orders
    .map((order) => buildPlanForOrder(input, order))
    .sort((a, b) => getPlanRank(a) - getPlanRank(b) || a.totalMoveCount - b.totalMoveCount)
    .slice(0, Math.max(1, input.options.maxPlans));

  return {
    plans,
    nodes: plans.reduce((sum, plan) => sum + plan.nodes, 0),
    truncated: plans.some((plan) => plan.truncated),
    message:
      plans[0]?.unresolvedPairs.length === 0
        ? `${orders.length}通りのF2L順番を比較しました。`
        : `${orders.length}通りを比較しましたが、未解決ペアが残る候補があります。`,
  };
}