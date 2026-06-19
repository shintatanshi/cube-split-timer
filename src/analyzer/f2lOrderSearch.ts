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
    return plan.unresolvedPairs.length * 100_000 + plan.totalScore;
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

    let message = partial.message;

    if (!message) {
        message =
            unresolvedPairs.length === 0
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
        nodes: partial.nodes,
        truncated: partial.truncated,
        message,
    };
}

function expandPlansForOrder(input: F2lOrderSearchInput, order: F2lSlotName[]): F2lOrderSearchPlan[] {
    const beamWidth = Math.max(1, input.options.maxPlans);
    const solutionLimit = Math.max(1, input.options.maxSolutions);

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

            const result = searchF2lSinglePair({
                state: partial.currentState,
                pair: nextCandidate,
                options: {
                    ...input.options,
                    protectedSlots: undefined,
                },
            });

            const solutions = result.solutions.slice(0, solutionLimit);

            if (solutions.length === 0) {
                nextPartials.push({
                    ...partial,
                    nodes: partial.nodes + result.nodes,
                    truncated: partial.truncated || result.truncated,
                    stopped: true,
                    message: `${nextCandidate.title} の手順が見つからなかったため、この順番は途中で終了しました。`,
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

    return partials
        .map((partial, index) => toFinalPlan(input, order, partial, index))
        .sort((a, b) => getPlanRank(a) - getPlanRank(b) || a.totalMoveCount - b.totalMoveCount)
        .slice(0, beamWidth);
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

    const plans = dedupePlans(orders.flatMap((order) => expandPlansForOrder(input, order)))
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