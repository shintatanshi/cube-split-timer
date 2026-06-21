import type { LearningCase } from "../types";
import { parseAlgorithm, type MoveAxis, type MoveDescriptor } from "../learn/moveNotation";
import {
  createInverseViewpointDescriptors,
  createViewpointMoveSteps,
} from "../learn/viewpointMoves";
import {
  createSolvedCubeState,
  getF2lPairCandidates,
  isCrossSolved,
  type CubeColorName,
  type CubePiece,
  type CubeState,
  type FaceName,
  type TargetFace,
  type Vec3,
} from "./cubeState";

type LastLayerPhase = "oll" | "pll";

interface LastLayerPosition {
  label: string;
  coord: Vec3;
}

interface LastLayerIndexEntry {
  caseItem: LearningCase;
  algorithm: string;
  moves: string[];
  moveCount: number;
}

interface LastLayerIndex {
  entriesByKey: Map<string, LastLayerIndexEntry[]>;
}

export interface LastLayerRecognition {
  phase: LastLayerPhase;
  caseItem: LearningCase | null;
  caseTitle: string;
  setupAlgorithm: string;
  algorithm: string;
  moves: string[];
  moveCount: number;
  isSkip: boolean;
  stateAfter: CubeState;
}

export type LastLayerRecognitionResult =
  | { ok: true; recognition: LastLayerRecognition }
  | { ok: false; reason: string };

const U_SETUPS = ["", "U", "U'", "U2"];
const PLL_VIEWPOINT_SETUPS = ["", "y", "y'", "y2"];

const LAST_LAYER_POSITIONS: LastLayerPosition[] = [
  { label: "UFR", coord: [1, 1, 1] },
  { label: "UR", coord: [1, 1, 0] },
  { label: "URB", coord: [1, 1, -1] },
  { label: "UB", coord: [0, 1, -1] },
  { label: "UBL", coord: [-1, 1, -1] },
  { label: "UL", coord: [-1, 1, 0] },
  { label: "ULF", coord: [-1, 1, 1] },
  { label: "UF", coord: [0, 1, 1] },
];

const OPPOSITE_FACE: Record<FaceName, FaceName> = {
  U: "D",
  D: "U",
  F: "B",
  B: "F",
  R: "L",
  L: "R",
};

const INDEX_CACHE = new Map<string, LastLayerIndex>();

const FACE_VECTORS: Record<FaceName, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

const FACE_FROM_VECTOR = new Map<string, FaceName>(
  Object.entries(FACE_VECTORS).map(([face, vector]) => [vector.join(","), face as FaceName]),
);

function sameCoord(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function roundCoord(value: number): number {
  return Math.max(-1, Math.min(1, Math.round(value)));
}

function rotateVector(vector: Vec3, axis: MoveAxis, angle: number): Vec3 {
  const cos = Math.round(Math.cos(angle));
  const sin = Math.round(Math.sin(angle));
  const [x, y, z] = vector;

  if (axis === "x") {
    return [x, roundCoord(y * cos - z * sin), roundCoord(y * sin + z * cos)];
  }

  if (axis === "y") {
    return [roundCoord(x * cos + z * sin), y, roundCoord(-x * sin + z * cos)];
  }

  return [roundCoord(x * cos - y * sin), roundCoord(x * sin + y * cos), z];
}

function getFaceFromVector(vector: Vec3): FaceName {
  const face = FACE_FROM_VECTOR.get(vector.join(","));

  if (!face) {
    throw new Error(`Invalid face vector: ${vector.join(",")}`);
  }

  return face;
}

function getAxisIndex(axis: MoveAxis): 0 | 1 | 2 {
  if (axis === "x") {
    return 0;
  }

  if (axis === "y") {
    return 1;
  }

  return 2;
}

function cloneCubeState(state: CubeState): CubeState {
  return {
    faceColorMap: { ...state.faceColorMap },
    pieces: state.pieces.map((piece) => ({
      id: piece.id,
      kind: piece.kind,
      coord: [...piece.coord] as Vec3,
      stickers: piece.stickers.map((sticker) => ({ ...sticker })),
    })),
  };
}

function rotateFace(face: FaceName, axis: MoveAxis, angle: number): FaceName {
  return getFaceFromVector(rotateVector(FACE_VECTORS[face], axis, angle));
}

function applyDescriptorForRecognition(state: CubeState, descriptor: MoveDescriptor): void {
  const axisIndex = getAxisIndex(descriptor.axis);
  state.pieces.forEach((piece) => {
    if (!descriptor.layers.includes(piece.coord[axisIndex])) {
      return;
    }

    piece.coord = rotateVector(piece.coord, descriptor.axis, descriptor.angle);
    piece.stickers = piece.stickers.map((sticker) => ({
      color: sticker.color,
      face: rotateFace(sticker.face, descriptor.axis, descriptor.angle),
    }));
  });
}

function applyAlgorithmForRecognition(state: CubeState, moves: string[]): CubeState {
  const nextState = cloneCubeState(state);

  createViewpointMoveSteps(moves).forEach((step) => {
    if (step.descriptor) {
      applyDescriptorForRecognition(nextState, step.descriptor);
    }
  });

  return nextState;
}

function applyInverseAlgorithmForRecognition(state: CubeState, moves: string[]): CubeState {
  const nextState = cloneCubeState(state);

  createInverseViewpointDescriptors(moves).forEach((descriptor) => {
    applyDescriptorForRecognition(nextState, descriptor);
  });

  return nextState;
}

function getPieceAtCoord(state: CubeState, coord: Vec3): CubePiece | null {
  return state.pieces.find((piece) => sameCoord(piece.coord, coord)) ?? null;
}

function getStickerFace(piece: CubePiece, color: CubeColorName): FaceName | null {
  return piece.stickers.find((sticker) => sticker.color === color)?.face ?? null;
}

function getLastLayerFace(targetFace: TargetFace): FaceName {
  return OPPOSITE_FACE[targetFace];
}

function getLastLayerColor(state: CubeState, targetFace: TargetFace): CubeColorName {
  return state.faceColorMap[getLastLayerFace(targetFace)];
}

function joinAlgorithms(...algorithms: string[]): string {
  return algorithms
    .map((algorithm) => algorithm.trim())
    .filter(Boolean)
    .join(" ");
}

function getFaceColorMapKey(state: CubeState): string {
  return (["U", "D", "F", "B", "R", "L"] as FaceName[])
    .map((face) => `${face}:${state.faceColorMap[face]}`)
    .join("|");
}

function getCasesCacheKey(
  phase: LastLayerPhase,
  cases: LearningCase[],
  state: CubeState,
  targetFace: TargetFace,
): string {
  return [
    phase,
    targetFace,
    getFaceColorMapKey(state),
    cases.map((caseItem) => `${caseItem.id}:${caseItem.algorithm}`).join("||"),
  ].join("::");
}

function getOllOrientationKey(
  state: CubeState,
  lastLayerColor: CubeColorName,
): string {
  return LAST_LAYER_POSITIONS.map(({ label, coord }) => {
    const piece = getPieceAtCoord(state, coord);
    const stickerFace = piece ? getStickerFace(piece, lastLayerColor) : null;

    return `${label}:${stickerFace ?? "missing"}`;
  }).join("|");
}

function getPllPermutationKey(state: CubeState): string {
  return LAST_LAYER_POSITIONS.map(({ label, coord }) => {
    const piece = getPieceAtCoord(state, coord);

    return `${label}:${piece?.id ?? "missing"}`;
  }).join("|");
}

function isLastLayerOriented(
  state: CubeState,
  targetFace: TargetFace,
  lastLayerColor: CubeColorName,
): boolean {
  const lastLayerFace = getLastLayerFace(targetFace);

  return LAST_LAYER_POSITIONS.every(({ coord }) => {
    const piece = getPieceAtCoord(state, coord);

    return Boolean(piece && getStickerFace(piece, lastLayerColor) === lastLayerFace);
  });
}

function isF2lComplete(
  state: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): boolean {
  return (
    targetFace === "D" &&
    isCrossSolved(state, crossColor, targetFace) &&
    getF2lPairCandidates(state, crossColor, targetFace).every(
      (candidate) => candidate.status === "completed",
    )
  );
}

function addEntry(index: LastLayerIndex, key: string, entry: LastLayerIndexEntry): void {
  const entries = index.entriesByKey.get(key) ?? [];
  entries.push(entry);
  entries.sort(
    (a, b) =>
      a.moveCount - b.moveCount ||
      a.algorithm.localeCompare(b.algorithm) ||
      a.caseItem.id.localeCompare(b.caseItem.id),
  );
  index.entriesByKey.set(key, entries);
}

function getIndexAlgorithmVariants(phase: LastLayerPhase, algorithm: string): string[] {
  if (phase !== "pll") {
    return [algorithm];
  }

  return PLL_VIEWPOINT_SETUPS.map((setup) => joinAlgorithms(setup, algorithm));
}

function buildLastLayerIndex(
  phase: LastLayerPhase,
  cases: LearningCase[],
  state: CubeState,
  targetFace: TargetFace,
): LastLayerIndex {
  const cacheKey = getCasesCacheKey(phase, cases, state, targetFace);
  const cachedIndex = INDEX_CACHE.get(cacheKey);

  if (cachedIndex) {
    return cachedIndex;
  }

  const index: LastLayerIndex = { entriesByKey: new Map() };
  const solvedState = createSolvedCubeState(state.faceColorMap);
  const lastLayerColor = getLastLayerColor(state, targetFace);

  cases.forEach((caseItem) => {
    getIndexAlgorithmVariants(phase, caseItem.algorithm).forEach((algorithm) => {
      const parsed = parseAlgorithm(algorithm);

      if (parsed.invalidTokens.length > 0 || parsed.moves.length === 0) {
        return;
      }

      const preCaseState = applyInverseAlgorithmForRecognition(solvedState, parsed.moves);

      if (
        phase === "oll" &&
        !isF2lComplete(preCaseState, state.faceColorMap[targetFace], targetFace)
      ) {
        return;
      }

      if (
        phase === "pll" &&
        !isLastLayerOriented(preCaseState, targetFace, lastLayerColor)
      ) {
        return;
      }

      const key =
        phase === "oll"
          ? getOllOrientationKey(preCaseState, lastLayerColor)
          : getPllPermutationKey(preCaseState);

      addEntry(index, key, {
        caseItem,
        algorithm,
        moves: parsed.moves,
        moveCount: parsed.moves.length,
      });
    });
  });

  INDEX_CACHE.set(cacheKey, index);
  return index;
}

function createSkipRecognition(
  phase: LastLayerPhase,
  state: CubeState,
  setupAlgorithm: string,
): LastLayerRecognition {
  const algorithm = setupAlgorithm.trim();
  const moves = parseAlgorithm(algorithm).moves;

  return {
    phase,
    caseItem: null,
    caseTitle: phase === "oll" ? "OLL Skip" : "PLL Skip",
    setupAlgorithm,
    algorithm,
    moves,
    moveCount: moves.length,
    isSkip: true,
    stateAfter: moves.length > 0 ? applyAlgorithmForRecognition(state, moves) : state,
  };
}

function createCaseRecognition(
  phase: LastLayerPhase,
  state: CubeState,
  setupAlgorithm: string,
  entry: LastLayerIndexEntry,
): LastLayerRecognition {
  const algorithm = joinAlgorithms(setupAlgorithm, entry.algorithm);
  const moves = parseAlgorithm(algorithm).moves;

  return {
    phase,
    caseItem: entry.caseItem,
    caseTitle: entry.caseItem.title,
    setupAlgorithm,
    algorithm,
    moves,
    moveCount: moves.length,
    isSkip: false,
    stateAfter: applyAlgorithmForRecognition(state, moves),
  };
}

export function recognizeOll(
  state: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  ollCases: LearningCase[],
): LastLayerRecognitionResult {
  if (!isF2lComplete(state, crossColor, targetFace)) {
    return { ok: false, reason: "F2Lが未完成なのでOLL判定できません。" };
  }

  if (ollCases.length === 0) {
    return { ok: false, reason: "OLL手順DBが空なので判定できません。" };
  }

  const lastLayerColor = getLastLayerColor(state, targetFace);
  const index = buildLastLayerIndex("oll", ollCases, state, targetFace);

  for (const setupAlgorithm of U_SETUPS) {
    const setupMoves = parseAlgorithm(setupAlgorithm).moves;
    const adjustedState =
      setupMoves.length > 0 ? applyAlgorithmForRecognition(state, setupMoves) : state;

    if (isLastLayerOriented(adjustedState, targetFace, lastLayerColor)) {
      return { ok: true, recognition: createSkipRecognition("oll", state, "") };
    }

    const key = getOllOrientationKey(adjustedState, lastLayerColor);
    const entry = index.entriesByKey.get(key)?.[0] ?? null;

    if (entry) {
      return {
        ok: true,
        recognition: createCaseRecognition("oll", state, setupAlgorithm, entry),
      };
    }
  }

  return {
    ok: false,
    reason: "このOLLケースは現在のDBでは自動判定できません。Learn候補から確認してください。",
  };
}

export function recognizePll(
  state: CubeState,
  targetFace: TargetFace,
  pllCases: LearningCase[],
): LastLayerRecognitionResult {
  if (targetFace !== "D") {
    return { ok: false, reason: "PLL判定は現在D面Crossのみ対応しています。" };
  }

  if (pllCases.length === 0) {
    return { ok: false, reason: "PLL手順DBが空なので判定できません。" };
  }

  const lastLayerColor = getLastLayerColor(state, targetFace);

  if (!isLastLayerOriented(state, targetFace, lastLayerColor)) {
    return { ok: false, reason: "OLLが未完成なのでPLL判定できません。" };
  }

  const index = buildLastLayerIndex("pll", pllCases, state, targetFace);
  const solvedKey = getPllPermutationKey(createSolvedCubeState(state.faceColorMap));

  for (const setupAlgorithm of U_SETUPS) {
    const setupMoves = parseAlgorithm(setupAlgorithm).moves;
    const adjustedState =
      setupMoves.length > 0 ? applyAlgorithmForRecognition(state, setupMoves) : state;
    const key = getPllPermutationKey(adjustedState);

    if (key === solvedKey) {
      return {
        ok: true,
        recognition: createSkipRecognition("pll", state, setupAlgorithm),
      };
    }

    const entry = index.entriesByKey.get(key)?.[0] ?? null;

    if (entry) {
      return {
        ok: true,
        recognition: createCaseRecognition("pll", state, setupAlgorithm, entry),
      };
    }
  }

  return {
    ok: false,
    reason: "このPLLケースは現在のDBでは自動判定できません。Learn候補から確認してください。",
  };
}
