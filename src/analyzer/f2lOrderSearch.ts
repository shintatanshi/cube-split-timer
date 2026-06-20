import { cloneCubeState, getF2lPairCandidates, isCrossSolved } from "./cubeState";
import type { CubeState, F2lPairCandidate, F2lSlotName } from "./cubeState";
import { getF2lTargetSlotName, isF2lSearchGoalState, isF2lSlotSolved } from "./f2lSearchGuards";
import { searchF2lSinglePair } from "./f2lSinglePairSearch";
import type {
    F2lOrderSearchInput,
    F2lOrderSearchDiagnostics,
    F2lOrderSearchPlan,
    F2lOrderSearchResult,
    F2lOrderSearchStep,
    F2lOrderSearchStepDiagnostics,
    F2lProtectedSlot,
    F2lSinglePairSearchOptions,
    F2lSinglePairSearchResult,
    F2lSinglePairSearchSolution,
} from "./f2lSearchTypes";

interface PartialF2lOrderPlan {
    currentState: CubeState;
    steps: F2lOrderSearchStep[];
    nodes: number;
    truncated: boolean;
    message: string;
    stopped: boolean;
}

interface ExpandedF2lOrderPlans {
    plans: F2lOrderSearchPlan[];
    diagnostics: F2lOrderSearchStepDiagnostics[];
}

const ALL_F2L_SLOTS: F2lSlotName[] = ["FR", "FL", "BR", "BL"];

function getBeamWidth(input: F2lOrderSearchInput): number {
    return Math.max(1, input.options.beamWidth ?? input.options.maxPlans);
}

function getResultLimit(input: F2lOrderSearchInput): number {
    return Math.max(1, input.options.resultLimit ?? input.options.maxPlans);
}

function getSolutionsPerPair(input: F2lOrderSearchInput): number {
    return Math.max(1, input.options.solutionsPerPair ?? input.options.maxSolutions);
}

function createOrderDiagnostics(
    input: F2lOrderSearchInput,
    orderCount: number,
    steps: F2lOrderSearchStepDiagnostics[] = [],
): F2lOrderSearchDiagnostics {
    return {
        orderCount,
        beamWidth: getBeamWidth(input),
        resultLimit: getResultLimit(input),
        solutionsPerPair: getSolutionsPerPair(input),
        steps,
    };
}

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
    solution: F2lSinglePairSearchSolution,
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
        diagnostics: solution.diagnostics,
    };
}

function getTotalMoveCount(steps: F2lOrderSearchStep[]): number {
    return steps.reduce((sum, step) => sum + step.moveCount, 0);
}

function getTotalScore(steps: F2lOrderSearchStep[]): number {
    return steps.reduce((sum, step) => sum + step.score, 0);
}

function getUnresolvedPairs(
    state: CubeState,
    options: F2lSinglePairSearchOptions,
): F2lPairCandidate[] {
    return getF2lPairCandidates(state, options.crossColor, options.targetFace).filter(
        (candidate) => candidate.status !== "completed",
    );
}

function getPartialRank(partial: PartialF2lOrderPlan, options: F2lSinglePairSearchOptions): number {
    const unresolvedPairs = getUnresolvedPairs(partial.currentState, options);

    return unresolvedPairs.length * 100_000 + getTotalScore(partial.steps);
}

function getPlanRank(plan: F2lOrderSearchPlan): number {
    return plan.unresolvedPairs.length * 100_000 + (plan.isComplete ? 0 : 50_000) + plan.totalScore;
}

function getPlanSignature(plan: F2lOrderSearchPlan): string {
    return plan.steps
        .map((step) => `${step.targetSlot}:${step.algorithm}`)
        .join("|");
}

function dedupePlans(plans: F2lOrderSearchPlan[]): F2lOrderSearchPlan[] {
    const uniquePlans = new Map<string, F2lOrderSearchPlan>();

    plans.forEach((plan) => {
        const signature = getPlanSignature(plan) || plan.order.join("->");
        const existing = uniquePlans.get(signature);

        if (!existing || getPlanRank(plan) < getPlanRank(existing)) {
            uniquePlans.set(signature, plan);
        }
    });

    return [...uniquePlans.values()];
}

function toFinalPlan(
    input: F2lOrderSearchInput,
    order: F2lSlotName[],
    partial: PartialF2lOrderPlan,
    index: number,
): F2lOrderSearchPlan {
    const unresolvedPairs = getUnresolvedPairs(partial.currentState, input.options);
    const totalMoveCount = getTotalMoveCount(partial.steps);
    const totalScore = getTotalScore(partial.steps);
    const allSlotsSolved = ALL_F2L_SLOTS.every((slotName) =>
        isF2lSlotSolved(
            partial.currentState,
            slotName,
            input.options.crossColor,
            input.options.targetFace,
        ),
    );
    const crossSolved = isCrossSolved(
        partial.currentState,
        input.options.crossColor,
        input.options.targetFace,
    );
    const isComplete = unresolvedPairs.length === 0 && crossSolved && allSlotsSolved;

    let message = partial.message;

    if (!message) {
        message =
            isComplete
                ? "この順番でF2L 4ペアがすべて完成しました。"
                : "この順番では一部のF2Lペアが未解決のまま残りました。";
    }

    return {
        id: `f2l-order-${order.join("-")}-${index}`,
        order,
        steps: partial.steps,
        totalMoveCount,
        totalScore,
        finalState: partial.currentState,
        unresolvedPairs,
        isComplete,
        nodes: partial.nodes,
        truncated: partial.truncated,
        message,
    };
}

function getProtectedSlotsForPartial(partial: PartialF2lOrderPlan): F2lProtectedSlot[] {
    return partial.steps.map((step) => ({
        slotName: step.targetSlot,
        reason: "alreadySolved" as const,
    }));
}

function createStepDiagnostics(
    order: F2lSlotName[],
    stepIndex: number,
    protectedSlots: F2lProtectedSlot[],
    result: F2lSinglePairSearchResult,
): F2lOrderSearchStepDiagnostics {
    return {
        order,
        stepIndex,
        targetSlot: result.targetSlot,
        protectedSlots,
        status: result.status,
        message: result.message,
        nodes: result.nodes,
        maxDepth: result.maxDepth,
        maxNodes: result.maxNodes,
        extractionStartCount: result.diagnostics.extractionStartCount,
        truncated: result.truncated,
        failureCounts: result.diagnostics.failureCounts,
    };
}

function getSinglePairOptions(
    input: F2lOrderSearchInput,
    partial: PartialF2lOrderPlan,
    protectedSlots: F2lProtectedSlot[],
): F2lSinglePairSearchOptions {
    const unresolvedCount = getUnresolvedPairs(partial.currentState, input.options).length;
    const isLastPair = unresolvedCount <= 1;

    return {
        ...input.options,
        maxDepth: isLastPair
            ? input.options.maxDepthLastPair ?? input.options.maxDepth
            : input.options.maxDepth,
        maxNodes: isLastPair
            ? input.options.maxNodesLastPair ?? input.options.maxNodes
            : input.options.maxNodes,
        maxSolutions: getSolutionsPerPair(input),
        protectedSlots,
    };
}

function expandPlansForOrder(input: F2lOrderSearchInput, order: F2lSlotName[]): ExpandedF2lOrderPlans {
    const beamWidth = getBeamWidth(input);
    const solutionLimit = getSolutionsPerPair(input);
    const diagnostics: F2lOrderSearchStepDiagnostics[] = [];

    let partials: PartialF2lOrderPlan[] = [
        {
            currentState: cloneCubeState(input.state),
            steps: [],
            nodes: 0,
            truncated: false,
            message: "",
            stopped: false,
        },
    ];

    for (let stepIndex = 1; stepIndex <= order.length; stepIndex += 1) {
        const nextPartials: PartialF2lOrderPlan[] = [];

        for (const partial of partials) {
            if (partial.stopped) {
                nextPartials.push(partial);
                continue;
            }

            const candidates = getF2lPairCandidates(
                partial.currentState,
                input.options.crossColor,
                input.options.targetFace,
            );
            const nextCandidate = getNextCandidateByOrder(candidates, order);

            if (!nextCandidate) {
                nextPartials.push({
                    ...partial,
                    stopped: true,
                    message: "未完成F2Lペアがなくなったため、この順番の探索を終了しました。",
                });
                continue;
            }

            const protectedSlots = getProtectedSlotsForPartial(partial);
            const singlePairOptions = getSinglePairOptions(input, partial, protectedSlots);
            const result = searchF2lSinglePair({
                state: partial.currentState,
                pair: nextCandidate,
                options: singlePairOptions,
            });
            diagnostics.push(createStepDiagnostics(order, stepIndex, protectedSlots, result));

            const solutions = result.solutions
                .filter((solution) =>
                    isF2lSearchGoalState(solution.stateAfter, nextCandidate, singlePairOptions),
                )
                .slice(0, solutionLimit);

            if (solutions.length === 0) {
                nextPartials.push({
                    ...partial,
                    nodes: partial.nodes + result.nodes,
                    truncated: partial.truncated || result.truncated,
                    stopped: true,
                    message: `${nextCandidate.title} の手順が見つからなかったため、この順番は途中で終了しました。${result.message ? ` ${result.message}` : ""}`,
                });
                continue;
            }

            solutions.forEach((solution) => {
                const step = createStep(stepIndex, solution);

                nextPartials.push({
                    currentState: cloneCubeState(solution.stateAfter),
                    steps: [...partial.steps, step],
                    nodes: partial.nodes + result.nodes,
                    truncated: partial.truncated || result.truncated,
                    message: "",
                    stopped: false,
                });
            });
        }

        partials = nextPartials
            .sort(
                (a, b) =>
                    getPartialRank(a, input.options) - getPartialRank(b, input.options) ||
                    getTotalMoveCount(a.steps) - getTotalMoveCount(b.steps),
            )
            .slice(0, beamWidth);

        if (partials.every((partial) => partial.stopped)) {
            break;
        }
    }

    return {
        plans: partials
            .map((partial, index) => toFinalPlan(input, order, partial, index))
            .sort((a, b) => getPlanRank(a) - getPlanRank(b) || a.totalMoveCount - b.totalMoveCount)
            .slice(0, beamWidth),
        diagnostics,
    };
}

export function searchF2lOrders(input: F2lOrderSearchInput): F2lOrderSearchResult {
    if (input.options.targetFace !== "D") {
        return {
            plans: [],
            nodes: 0,
            truncated: false,
            message: "現在のF2L順番探索はD面Crossのみ対応しています。",
            diagnostics: createOrderDiagnostics(input, 0),
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
                    isComplete: true,
                    nodes: 0,
                    truncated: false,
                    message: "F2Lはすでに完成しています。",
                },
            ],
            nodes: 0,
            truncated: false,
            message: "F2Lはすでに完成しています。",
            diagnostics: createOrderDiagnostics(input, 0),
        };
    }

    const orders = getPermutations(baseSlots);
    const expanded = orders.map((order) => expandPlansForOrder(input, order));
    const allPlans = expanded.flatMap((entry) => entry.plans);
    const stepDiagnostics = expanded.flatMap((entry) => entry.diagnostics);

    const plans = dedupePlans(allPlans)
        .sort((a, b) => getPlanRank(a) - getPlanRank(b) || a.totalMoveCount - b.totalMoveCount)
        .slice(0, getResultLimit(input));
    const searchedNodes = stepDiagnostics.reduce((sum, step) => sum + step.nodes, 0);
    const diagnostics = createOrderDiagnostics(input, orders.length, stepDiagnostics);

    return {
        plans,
        nodes: searchedNodes,
        truncated: stepDiagnostics.some((step) => step.truncated),
        message:
            plans[0]?.isComplete
                ? `${orders.length}通りのF2L順番を比較しました。`
                : `${orders.length}通りを比較しましたが、未解決ペアが残る候補があります。`,
        diagnostics,
    };
}
