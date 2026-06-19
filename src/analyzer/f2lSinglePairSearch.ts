import { applyAlgorithm, applyMove, cloneCubeState, isCrossSolved } from "./cubeState";
import type { CubeState, F2lSlotName } from "./cubeState";
import { getF2lSearchMoves, shouldSkipRepeatedFaceMove } from "./f2lSearchMoves";
import {
    getF2lSearchGuardMessages,
    getF2lTargetSlotName,
    getSolvedF2lProtectedSlots,
    isF2lSearchGoalState,
} from "./f2lSearchGuards";
import type {
    F2lProtectedSlot,
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

function joinAlgorithms(...algorithms: string[]): string {
    return algorithms
        .map((algorithm) => algorithm.trim())
        .filter(Boolean)
        .join(" ");
}

function parseAlgorithmMoves(algorithm: string): string[] {
    return algorithm.trim().split(/\s+/).filter(Boolean);
}

function getExtractionStartStates(
    input: F2lSinglePairSearchInput,
    targetSlot: F2lSlotName,
): Array<{ state: CubeState; prefixMoves: string[] }> {
    const starts = new Map<string, { state: CubeState; prefixMoves: string[] }>();

    const addStart = (algorithm: string, state: CubeState) => {
        if (!isCrossSolved(state, input.options.crossColor, input.options.targetFace)) {
            return;
        }

        const signature = getCubeStateSignature(state);
        const moves = parseAlgorithmMoves(algorithm);

        const existing = starts.get(signature);
        if (!existing || moves.length < existing.prefixMoves.length) {
            starts.set(signature, {
                state,
                prefixMoves: moves,
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

    // targetSlot を前に寄せて、関係ありそうな取り出しを先に試す
    return [...starts.values()].sort((a, b) => {
        const aText = a.prefixMoves.join(" ");
        const bText = b.prefixMoves.join(" ");

        const aTarget = F2L_EXTRACTION_OPTIONS[targetSlot].some((alg) => aText.includes(alg.split(" ")[0]));
        const bTarget = F2L_EXTRACTION_OPTIONS[targetSlot].some((alg) => bText.includes(alg.split(" ")[0]));

        if (aTarget !== bTarget) {
            return aTarget ? -1 : 1;
        }

        return a.prefixMoves.length - b.prefixMoves.length;
    });
}

interface SearchNodeCounter {
    count: number;
    truncated: boolean;
}

interface SearchContext {
    input: F2lSinglePairSearchInput;
    targetSlot: F2lSlotName;
    protectedSlots: F2lProtectedSlot[];
    moves: string[];
    solutions: F2lSinglePairSearchSolution[];
    nodeCounter: SearchNodeCounter;
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

function getMoveScore(move: string): number {
    if (move.endsWith("2")) {
        return 1.2;
    }

    return 1;
}

function getAlgorithmScore(moves: string[]): number {
    return moves.reduce((sum, move) => sum + getMoveScore(move), 0);
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
    };
}

function createEmptyResult(
    input: F2lSinglePairSearchInput,
    targetSlot: F2lSlotName,
    status: F2lSinglePairSearchResult["status"],
    message: string,
    nodes: number,
    truncated: boolean,
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
    };
}

function depthFirstSearch(
    context: SearchContext,
    currentState: CubeState,
    depthRemaining: number,
    path: string[],
    lastMove: string | null,
    seenPath: Set<string>,
): void {
    const { input, nodeCounter, solutions } = context;

    if (nodeCounter.count >= input.options.maxNodes) {
        nodeCounter.truncated = true;
        return;
    }

    if (solutions.length >= input.options.maxSolutions) {
        return;
    }

    nodeCounter.count += 1;

    const goalOptions = {
        ...input.options,
        protectedSlots: context.protectedSlots,
    };

    if (path.length > 0 && isF2lSearchGoalState(currentState, input.pair, goalOptions)) {
        solutions.push(createSolution(context, path, currentState));
        return;
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

        if (seenPath.has(signature)) {
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
        );

        seenPath.delete(signature);

        if (
            nodeCounter.truncated ||
            nodeCounter.count >= input.options.maxNodes ||
            solutions.length >= input.options.maxSolutions
        ) {
            return;
        }
    }
}

export function searchF2lSinglePair(
    input: F2lSinglePairSearchInput,
): F2lSinglePairSearchResult {
    if (input.options.targetFace !== "D") {
        return createEmptyResult(
            input,
            getF2lTargetSlotName(input.pair),
            "invalid",
            "現在のF2L条件付き探索はD面Crossのみ対応しています。",
            0,
            false,
        );
    }

    const targetSlot = getF2lTargetSlotName(input.pair);
    const protectedSlots = input.options.protectSolvedSlots
        ? input.options.protectedSlots ??
        getSolvedF2lProtectedSlots(input.state, input.options.crossColor, input.options.targetFace)
        : [];

    const moves = getF2lSearchMoves(targetSlot, "standard");
    const nodeCounter: SearchNodeCounter = {
        count: 0,
        truncated: false,
    };

    const context: SearchContext = {
        input: {
            ...input,
            state: cloneCubeState(input.state),
            options: {
                ...input.options,
                protectedSlots,
            },
        },
        targetSlot,
        protectedSlots,
        moves,
        solutions: [],
        nodeCounter,
    };

    const extractionStarts = getExtractionStartStates(context.input, targetSlot);

    for (const start of extractionStarts.slice(0, 96)) {
        if (nodeCounter.truncated || context.solutions.length >= input.options.maxSolutions) {
            break;
        }

        for (let depth = 0; depth <= input.options.maxDepth; depth += 1) {
            const seenPath = new Set<string>([getCubeStateSignature(start.state)]);
            const lastPrefixMove = start.prefixMoves[start.prefixMoves.length - 1] ?? null;

            depthFirstSearch(
                context,
                start.state,
                depth,
                start.prefixMoves,
                lastPrefixMove,
                seenPath,
            );

            if (context.solutions.length > 0 || nodeCounter.truncated) {
                break;
            }
        }
    }

    if (context.solutions.length > 0) {
        const sortedSolutions = [...context.solutions].sort(
            (a, b) => a.moveCount - b.moveCount || a.score - b.score || a.algorithm.localeCompare(b.algorithm),
        );

        return {
            pairId: input.pair.id,
            pairTitle: input.pair.title,
            targetSlot,
            status: "solved",
            solutions: sortedSolutions,
            nodes: nodeCounter.count,
            maxDepth: input.options.maxDepth,
            maxNodes: input.options.maxNodes,
            truncated: nodeCounter.truncated,
            message: `${sortedSolutions[0].moveCount}手のF2L手順が見つかりました。`,
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
    );
}