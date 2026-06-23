import { getMoveDescriptor, invertAlgorithm, parseAlgorithm } from "../learn/moveNotation";
import { BASIC_F2L_41_CASES, type BasicF2lCase } from "./f2lBasic41";

export type CubeColorName = "white" | "yellow" | "blue" | "green" | "red" | "orange";
export type FaceName = "U" | "D" | "F" | "B" | "R" | "L";
export type TargetFace = FaceName;
export type PieceKind = "edge" | "corner";
export type Vec3 = [number, number, number];

export interface CubieSticker {
  color: CubeColorName;
  face: FaceName;
}

export interface CubePiece {
  id: string;
  kind: PieceKind;
  coord: Vec3;
  stickers: CubieSticker[];
}

export interface CubeState {
  faceColorMap: Record<FaceName, CubeColorName>;
  pieces: CubePiece[];
}

export type CubeStickerColorGrid = Record<FaceName, CubeColorName[]>;

export interface CubeStateFromStickerColorsResult {
  state: CubeState | null;
  errors: string[];
}

export interface CrossSolution {
  id: string;
  color: CubeColorName;
  targetFace: TargetFace;
  algorithm: string;
  moves: string[];
  moveCount: number;
  stateAfterCross: CubeState;
  solvedEdges: CrossEdgeStatus[];
  inspectedNodes: number;
}

export interface CrossSearchResult {
  color: CubeColorName;
  targetFace: TargetFace;
  maxDepth: number;
  nodes: number;
  truncated: boolean;
  solutions: CrossSolution[];
}

export interface CrossEdgeStatus {
  edgeColor: CubeColorName;
  sideFace: FaceName;
  sideColor: CubeColorName;
  solved: boolean;
}

export interface F2lPairCandidate {
  id: string;
  title: string;
  slotLabel: string;
  slotFaces: [FaceName, FaceName];
  targetFace: TargetFace;
  cornerColors: CubeColorName[];
  edgeColors: CubeColorName[];
  cornerPosition: string;
  edgePosition: string;
  status: "completed" | "unsolved" | "unknown";
  note: string;
}

export type F2lSlotName = "FR" | "FL" | "BR" | "BL";

export interface BasicF2lAnalysisStep {
  id: string;
  pairTitle: string;
  targetSlot: F2lSlotName;
  extractAlgorithm: string;
  caseId: string;
  caseName: string;
  method: "basic41" | "localSearch";
  algorithm: string;
  fullAlgorithm: string;
  moveCount: number;
  score: number;
  explanation: string;
  stateAfterStep: CubeState;
}

export interface BasicF2lAnalysisPlan {
  id: string;
  order: F2lSlotName[];
  steps: BasicF2lAnalysisStep[];
  totalMoveCount: number;
  totalScore: number;
  finalState: CubeState;
  unresolvedPairs: F2lPairCandidate[];
  note: string;
  strategy: "greedy" | "permutation";
}

export interface BasicF2lOrderAnalysisResult {
  plans: BasicF2lAnalysisPlan[];
  comparedOrderCount: number;
}

export type BasicF2lAnalysisPhase = "basic41" | "fallback";

export interface BasicF2lOrderAnalysisOptions {
  useLocalSearch?: boolean;
  useBasicF2lLegacyFallback?: boolean;
}

interface FastCubeState {
  faceColorMap: Record<FaceName, CubeColorName>;
  pieceIds: string[];
  pieceKinds: PieceKind[];
  pieceIndexById: Map<string, number>;
  coords: Int8Array;
  stickerOffsets: Uint8Array;
  stickerColors: CubeColorName[][];
  stickerFaces: Uint8Array;
}

interface F2lExtractionCandidate {
  algorithm: string;
  moves: string[];
  moveCount: number;
  fastState: FastCubeState;
  score: number;
}

interface BasicF2lCaseMatch {
  caseItem: BasicF2lCase;
  algorithm: string;
  moves: string[];
  moveCount: number;
  fastStateAfterAlgorithm: FastCubeState;
  score: number;
}

interface BasicF2lAlgorithmEntry {
  caseItem: BasicF2lCase;
  algorithm: string;
  moves: string[];
  moveCount: number;
  score: number;
}

interface F2lExtractionEntry {
  algorithm: string;
  moves: string[];
  moveCount: number;
  score: number;
}

interface LocalF2lSearchMatch {
  algorithm: string;
  moves: string[];
  moveCount: number;
  stateAfterAlgorithm: CubeState;
  score: number;
  nodes: number;
}

interface BasicF2lStepBuildResult {
  step: BasicF2lAnalysisStep;
  fastStateAfterStep: FastCubeState;
}

interface BasicF2lStepCandidateBuild extends Omit<BasicF2lAnalysisStep, "stateAfterStep"> {
  fastStateAfterStep: FastCubeState;
  stateAfterStep?: CubeState;
}

interface BasicF2lAnalysisCache {
  extractionCandidates: Map<string, F2lExtractionCandidate[]>;
  basicMatches: Map<string, BasicF2lCaseMatch | null>;
  fastAlgorithms: Map<string, FastCubeState>;
  localSearches: Map<string, LocalF2lSearchMatch | null>;
}

export interface CrossSearchInput {
  crossColor: CubeColorName;
  targetFace: TargetFace;
  faceColorMap: Record<FaceName, CubeColorName>;
  scrambleMoves?: string[];
  initialState?: CubeState;
  maxDepth?: number;
  maxSolutions?: number;
  maxNodes?: number;
}

interface NormalizedCrossSearchInput {
  crossColor: CubeColorName;
  targetFace: TargetFace;
  faceColorMap: Record<FaceName, CubeColorName>;
  scrambleMoves: string[];
  initialState: CubeState;
  maxDepth: number;
  maxSolutions: number;
  maxNodes: number;
}

interface CrossEdgePieceState {
  sideColor: CubeColorName;
  sideFace: FaceName;
  coord: Vec3;
  crossStickerFace: FaceName;
  sideStickerFace: FaceName;
}

interface CrossEdgeQueueItem {
  edges: CrossEdgePieceState[];
  path: string[];
  lastMove: string | null;
}

interface CrossPruningTable {
  distances: Uint8Array;
  maxDistance: number;
  stateCount: number;
}

interface SearchContext {
  crossColor: CubeColorName;
  targetFace: TargetFace;
  maxSolutions: number;
  maxNodes: number;
  nodes: number;
  truncated: boolean;
}

const FACE_VECTORS: Record<FaceName, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

const FACE_STICKER_COORDS: Record<FaceName, Vec3[]> = {
  U: [
    [-1, 1, -1],
    [0, 1, -1],
    [1, 1, -1],
    [-1, 1, 0],
    [0, 1, 0],
    [1, 1, 0],
    [-1, 1, 1],
    [0, 1, 1],
    [1, 1, 1],
  ],
  D: [
    [-1, -1, 1],
    [0, -1, 1],
    [1, -1, 1],
    [-1, -1, 0],
    [0, -1, 0],
    [1, -1, 0],
    [-1, -1, -1],
    [0, -1, -1],
    [1, -1, -1],
  ],
  F: [
    [-1, 1, 1],
    [0, 1, 1],
    [1, 1, 1],
    [-1, 0, 1],
    [0, 0, 1],
    [1, 0, 1],
    [-1, -1, 1],
    [0, -1, 1],
    [1, -1, 1],
  ],
  B: [
    [1, 1, -1],
    [0, 1, -1],
    [-1, 1, -1],
    [1, 0, -1],
    [0, 0, -1],
    [-1, 0, -1],
    [1, -1, -1],
    [0, -1, -1],
    [-1, -1, -1],
  ],
  R: [
    [1, 1, 1],
    [1, 1, 0],
    [1, 1, -1],
    [1, 0, 1],
    [1, 0, 0],
    [1, 0, -1],
    [1, -1, 1],
    [1, -1, 0],
    [1, -1, -1],
  ],
  L: [
    [-1, 1, -1],
    [-1, 1, 0],
    [-1, 1, 1],
    [-1, 0, -1],
    [-1, 0, 0],
    [-1, 0, 1],
    [-1, -1, -1],
    [-1, -1, 0],
    [-1, -1, 1],
  ],
};

const FACE_STICKER_INDEX_BY_COORD = new Map<string, number>(
  (Object.entries(FACE_STICKER_COORDS) as Array<[FaceName, Vec3[]]>).flatMap(
    ([face, coords]) => coords.map((coord, index) => [`${face}:${vectorKey(coord)}`, index]),
  ),
);

const FACE_CODE_BY_NAME: Record<FaceName, number> = {
  U: 0,
  D: 1,
  F: 2,
  B: 3,
  R: 4,
  L: 5,
};

const FACE_NAME_BY_CODE: FaceName[] = ["U", "D", "F", "B", "R", "L"];

const FACE_VECTOR_BY_CODE: Vec3[] = FACE_NAME_BY_CODE.map((face) => FACE_VECTORS[face]);

const VECTOR_FACES = new Map<string, FaceName>(
  Object.entries(FACE_VECTORS).map(([face, vector]) => [vectorKey(vector), face as FaceName]),
);

const FACE_TURN_MOVES = [
  "U",
  "U'",
  "U2",
  "D",
  "D'",
  "D2",
  "R",
  "R'",
  "R2",
  "L",
  "L'",
  "L2",
  "F",
  "F'",
  "F2",
  "B",
  "B'",
  "B2",
];

const FACE_ORDER: Record<FaceName, number> = {
  U: 0,
  D: 1,
  R: 2,
  L: 3,
  F: 4,
  B: 5,
};

const OPPOSITE_FACE: Record<FaceName, FaceName> = {
  U: "D",
  D: "U",
  R: "L",
  L: "R",
  F: "B",
  B: "F",
};

const CROSS_LOCATION_BASE = 24;
const CROSS_EDGE_COUNT = 4;
const CROSS_PRUNING_STATE_COUNT = CROSS_LOCATION_BASE ** CROSS_EDGE_COUNT;
const CROSS_PRUNING_UNKNOWN_DISTANCE = 255;

const CROSS_SIDE_FACE_ORDER: Record<TargetFace, FaceName[]> = {
  D: ["F", "R", "B", "L"],
  U: ["F", "R", "B", "L"],
  F: ["U", "R", "D", "L"],
  B: ["U", "L", "D", "R"],
  R: ["U", "B", "D", "F"],
  L: ["U", "F", "D", "B"],
};

const F2L_SLOT_SPECS: Array<{
  name: F2lSlotName;
  faces: [FaceName, FaceName];
  cornerFaces: [TargetFace, FaceName, FaceName];
  edgeFaces: [FaceName, FaceName];
}> = [
  { name: "FR", faces: ["F", "R"], cornerFaces: ["D", "F", "R"], edgeFaces: ["F", "R"] },
  { name: "BR", faces: ["R", "B"], cornerFaces: ["D", "R", "B"], edgeFaces: ["R", "B"] },
  { name: "BL", faces: ["B", "L"], cornerFaces: ["D", "B", "L"], edgeFaces: ["B", "L"] },
  { name: "FL", faces: ["L", "F"], cornerFaces: ["D", "L", "F"], edgeFaces: ["L", "F"] },
];

export const CROSS_SEARCH_MAX_DEPTH = 8;
export const CROSS_SEARCH_NODE_LIMIT = 1_200_000;

const CROSS_PRUNING_TABLES = new Map<TargetFace, CrossPruningTable>();
const MOVE_DESCRIPTOR_CACHE = new Map<string, ReturnType<typeof getMoveDescriptor>>();

function getCrossSideFaces(targetFace: TargetFace): FaceName[] {
  return CROSS_SIDE_FACE_ORDER[targetFace];
}

function getCachedMoveDescriptor(move: string): ReturnType<typeof getMoveDescriptor> {
  if (MOVE_DESCRIPTOR_CACHE.has(move)) {
    return MOVE_DESCRIPTOR_CACHE.get(move) ?? null;
  }

  const descriptor = getMoveDescriptor(move);
  MOVE_DESCRIPTOR_CACHE.set(move, descriptor);
  return descriptor;
}

function vectorKey(vector: Vec3): string {
  return vector.join(",");
}

function addVectors(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function roundCoord(value: number): number {
  return Math.max(-1, Math.min(1, Math.round(value)));
}

function rotateVector(vector: Vec3, axis: "x" | "y" | "z", angle: number): Vec3 {
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

function getAxisCoord(vector: Vec3, axis: "x" | "y" | "z"): number {
  if (axis === "x") {
    return vector[0];
  }

  if (axis === "y") {
    return vector[1];
  }

  return vector[2];
}

function getFaceFromVector(vector: Vec3): FaceName {
  const face = VECTOR_FACES.get(vectorKey(vector));

  if (!face) {
    throw new Error(`Invalid face vector: ${vectorKey(vector)}`);
  }

  return face;
}

function getCoordLabel(coord: Vec3): string {
  return (Object.entries(FACE_VECTORS) as Array<[FaceName, Vec3]>)
    .filter(([, vector]) => vector[0] === coord[0] || vector[1] === coord[1] || vector[2] === coord[2])
    .filter(([, vector]) => vector[0] * coord[0] + vector[1] * coord[1] + vector[2] * coord[2] > 0)
    .map(([face]) => face)
    .join("");
}

function getFastCoordLabel(state: FastCubeState, pieceIndex: number | null): string {
  if (pieceIndex === null) {
    return "不明";
  }

  const coordOffset = pieceIndex * 3;

  return (
    getCoordLabel([
      state.coords[coordOffset],
      state.coords[coordOffset + 1],
      state.coords[coordOffset + 2],
    ]) || "center"
  );
}

const EDGE_COORDS: Vec3[] = [];

for (let x = -1; x <= 1; x += 1) {
  for (let y = -1; y <= 1; y += 1) {
    for (let z = -1; z <= 1; z += 1) {
      if ([x, y, z].filter((value) => value !== 0).length === 2) {
        EDGE_COORDS.push([x, y, z]);
      }
    }
  }
}

const EDGE_COORD_INDEX = new Map<string, number>(
  EDGE_COORDS.map((coord, index) => [vectorKey(coord), index]),
);

const EDGE_POSITION_FACES = EDGE_COORDS.map((coord) =>
  (Object.entries(FACE_VECTORS) as Array<[FaceName, Vec3]>)
    .filter(([, vector]) => vector[0] * coord[0] + vector[1] * coord[1] + vector[2] * coord[2] > 0)
    .map(([face]) => face)
    .sort((a, b) => FACE_ORDER[a] - FACE_ORDER[b]),
);

const CROSS_LOCATION_MOVE_TABLE = new Map<string, Uint8Array>();

function getCrossLocationCode(coord: Vec3, crossStickerFace: FaceName): number {
  const positionIndex = EDGE_COORD_INDEX.get(vectorKey(coord));

  if (positionIndex === undefined) {
    throw new Error(`Invalid edge coordinate: ${vectorKey(coord)}`);
  }

  const stickerFaces = EDGE_POSITION_FACES[positionIndex];
  const orientation = stickerFaces.indexOf(crossStickerFace);

  if (orientation < 0) {
    throw new Error(
      `Invalid cross sticker face ${crossStickerFace} for edge coordinate ${vectorKey(coord)}`,
    );
  }

  return positionIndex * 2 + orientation;
}

function getCrossLocationCoord(locationCode: number): Vec3 {
  return EDGE_COORDS[Math.floor(locationCode / 2)];
}

function getCrossLocationStickerFace(locationCode: number): FaceName {
  const stickerFaces = EDGE_POSITION_FACES[Math.floor(locationCode / 2)];
  return stickerFaces[locationCode % 2];
}

function encodeCrossEdgeStateKey(edges: CrossEdgePieceState[]): number {
  return edges.reduce(
    (key, edge) => key * CROSS_LOCATION_BASE + getCrossLocationCode(edge.coord, edge.crossStickerFace),
    0,
  );
}

function getCrossLocationMoveTable(move: string): Uint8Array {
  const cachedTable = CROSS_LOCATION_MOVE_TABLE.get(move);

  if (cachedTable) {
    return cachedTable;
  }

  const descriptor = getMoveDescriptor(move);
  const table = new Uint8Array(CROSS_LOCATION_BASE);

  for (let locationCode = 0; locationCode < CROSS_LOCATION_BASE; locationCode += 1) {
    if (!descriptor) {
      table[locationCode] = locationCode;
      continue;
    }

    const coord = getCrossLocationCoord(locationCode);
    const crossStickerFace = getCrossLocationStickerFace(locationCode);

    if (!descriptor.layers.includes(getAxisCoord(coord, descriptor.axis))) {
      table[locationCode] = locationCode;
      continue;
    }

    const nextCoord = rotateVector(coord, descriptor.axis, descriptor.angle);
    const nextCrossStickerFace = getFaceFromVector(
      rotateVector(FACE_VECTORS[crossStickerFace], descriptor.axis, descriptor.angle),
    );

    table[locationCode] = getCrossLocationCode(nextCoord, nextCrossStickerFace);
  }

  CROSS_LOCATION_MOVE_TABLE.set(move, table);
  return table;
}

function applyMoveToCrossStateKey(stateKey: number, move: string): number {
  const moveTable = getCrossLocationMoveTable(move);
  const fourth = stateKey % CROSS_LOCATION_BASE;
  const third = Math.floor(stateKey / CROSS_LOCATION_BASE) % CROSS_LOCATION_BASE;
  const second = Math.floor(stateKey / CROSS_LOCATION_BASE ** 2) % CROSS_LOCATION_BASE;
  const first = Math.floor(stateKey / CROSS_LOCATION_BASE ** 3) % CROSS_LOCATION_BASE;

  return (
    ((moveTable[first] * CROSS_LOCATION_BASE + moveTable[second]) * CROSS_LOCATION_BASE +
      moveTable[third]) *
      CROSS_LOCATION_BASE +
    moveTable[fourth]
  );
}

function applyAlgorithmToCrossStateKey(stateKey: number, moves: string[]): number {
  return moves.reduce((nextStateKey, move) => applyMoveToCrossStateKey(nextStateKey, move), stateKey);
}

function createPiece(coord: Vec3, faceColorMap: Record<FaceName, CubeColorName>): CubePiece {
  const stickers = (Object.entries(FACE_VECTORS) as Array<[FaceName, Vec3]>)
    .filter(([, vector]) => {
      if (vector[0] !== 0) {
        return coord[0] === vector[0];
      }

      if (vector[1] !== 0) {
        return coord[1] === vector[1];
      }

      return coord[2] === vector[2];
    })
    .map(([face]) => ({ color: faceColorMap[face], face }));

  return {
    id: stickers.map((sticker) => sticker.color).sort().join("-"),
    kind: stickers.length === 2 ? "edge" : "corner",
    coord,
    stickers,
  };
}

export function createSolvedCubeState(faceColorMap: Record<FaceName, CubeColorName>): CubeState {
  const pieces: CubePiece[] = [];

  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        const nonZeroCount = [x, y, z].filter((value) => value !== 0).length;

        if (nonZeroCount === 2 || nonZeroCount === 3) {
          pieces.push(createPiece([x, y, z], faceColorMap));
        }
      }
    }
  }

  return {
    faceColorMap,
    pieces,
  };
}

function createColorCountMap(): Record<CubeColorName, number> {
  return {
    white: 0,
    yellow: 0,
    blue: 0,
    green: 0,
    red: 0,
    orange: 0,
  };
}

function isCubeColorName(value: unknown): value is CubeColorName {
  return (
    value === "white" ||
    value === "yellow" ||
    value === "blue" ||
    value === "green" ||
    value === "red" ||
    value === "orange"
  );
}

export function createSolvedStickerColorGrid(
  faceColorMap: Record<FaceName, CubeColorName>,
): CubeStickerColorGrid {
  return {
    U: Array<CubeColorName>(9).fill(faceColorMap.U),
    D: Array<CubeColorName>(9).fill(faceColorMap.D),
    F: Array<CubeColorName>(9).fill(faceColorMap.F),
    B: Array<CubeColorName>(9).fill(faceColorMap.B),
    R: Array<CubeColorName>(9).fill(faceColorMap.R),
    L: Array<CubeColorName>(9).fill(faceColorMap.L),
  };
}

export function cubeStateToStickerColorGrid(state: CubeState): CubeStickerColorGrid {
  const grid = createSolvedStickerColorGrid(state.faceColorMap);

  state.pieces.forEach((piece) => {
    piece.stickers.forEach((sticker) => {
      const index = FACE_STICKER_INDEX_BY_COORD.get(
        `${sticker.face}:${vectorKey(piece.coord)}`,
      );

      if (index !== undefined) {
        grid[sticker.face][index] = sticker.color;
      }
    });
  });

  return grid;
}

export function createCubeStateFromStickerColors(
  stickerColors: CubeStickerColorGrid,
  faceColorMap: Record<FaceName, CubeColorName>,
): CubeStateFromStickerColorsResult {
  const errors: string[] = [];
  const colorCounts = createColorCountMap();
  const stickersByCoord = new Map<string, { coord: Vec3; stickers: CubieSticker[] }>();
  const solvedPieces = createSolvedCubeState(faceColorMap).pieces;
  const expectedPieceKinds = new Map(solvedPieces.map((piece) => [piece.id, piece.kind]));

  (Object.keys(FACE_STICKER_COORDS) as FaceName[]).forEach((face) => {
    const colors = stickerColors[face];

    if (!Array.isArray(colors) || colors.length !== 9) {
      errors.push(`${face}面のステッカー数が9個ではありません。`);
      return;
    }

    colors.forEach((color, index) => {
      if (!isCubeColorName(color)) {
        errors.push(`${face}${index + 1}に未対応の色があります。`);
        return;
      }

      colorCounts[color] += 1;

      if (index === 4 && color !== faceColorMap[face]) {
        errors.push(`${face}面センターは${faceColorMap[face]}で固定です。`);
      }

      const coord = FACE_STICKER_COORDS[face][index];
      const nonZeroCount = coord.filter((value) => value !== 0).length;

      if (nonZeroCount < 2) {
        return;
      }

      const coordKey = vectorKey(coord);
      const entry = stickersByCoord.get(coordKey) ?? {
        coord,
        stickers: [],
      };

      entry.stickers.push({ color, face });
      stickersByCoord.set(coordKey, entry);
    });
  });

  (Object.entries(colorCounts) as Array<[CubeColorName, number]>).forEach(([color, count]) => {
    if (count !== 9) {
      errors.push(`${color} が${count}枚です。各色9枚にしてください。`);
    }
  });

  const seenPieceIds = new Set<string>();
  const pieces: CubePiece[] = [];

  stickersByCoord.forEach((entry) => {
    const kind: PieceKind = entry.stickers.length === 2 ? "edge" : "corner";
    const id = entry.stickers.map((sticker) => sticker.color).sort().join("-");
    const expectedKind = expectedPieceKinds.get(id);
    const positionLabel = getCoordLabel(entry.coord) || entry.coord.join(",");

    if (entry.stickers.length !== 2 && entry.stickers.length !== 3) {
      errors.push(`${positionLabel}のステッカー構成が正しくありません。`);
      return;
    }

    if (!expectedKind || expectedKind !== kind) {
      errors.push(`${positionLabel}の色組み合わせが実在する${kind}ではありません。`);
      return;
    }

    if (seenPieceIds.has(id)) {
      errors.push(`${id} のピースが重複しています。`);
      return;
    }

    seenPieceIds.add(id);
    pieces.push({
      id,
      kind,
      coord: [...entry.coord] as Vec3,
      stickers: entry.stickers.map((sticker) => ({ ...sticker })),
    });
  });

  if (pieces.length !== 20) {
    errors.push(`認識できたピースが${pieces.length}個です。20個になるようにしてください。`);
  }

  return {
    state: errors.length === 0 ? { faceColorMap: { ...faceColorMap }, pieces } : null,
    errors,
  };
}

export function cloneCubeState(state: CubeState): CubeState {
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

function applyMoveToMutableState(state: CubeState, move: string): void {
  const descriptor = getCachedMoveDescriptor(move);

  if (!descriptor) {
    return;
  }

  state.pieces.forEach((piece) => {
    const layerCoord = getAxisCoord(piece.coord, descriptor.axis);

    if (!descriptor.layers.includes(layerCoord)) {
      return;
    }

    piece.coord = rotateVector(piece.coord, descriptor.axis, descriptor.angle);
    piece.stickers = piece.stickers.map((sticker) => ({
      color: sticker.color,
      face: getFaceFromVector(rotateVector(FACE_VECTORS[sticker.face], descriptor.axis, descriptor.angle)),
    }));
  });
}

export function applyMove(state: CubeState, move: string): CubeState {
  const nextState = cloneCubeState(state);
  applyMoveToMutableState(nextState, move);

  return nextState;
}

export function applyAlgorithm(state: CubeState, moves: string[]): CubeState {
  const nextState = cloneCubeState(state);

  moves.forEach((move) => applyMoveToMutableState(nextState, move));

  return nextState;
}

function getFaceCodeFromVector(vector: Vec3): number {
  if (vector[1] === 1) {
    return FACE_CODE_BY_NAME.U;
  }

  if (vector[1] === -1) {
    return FACE_CODE_BY_NAME.D;
  }

  if (vector[2] === 1) {
    return FACE_CODE_BY_NAME.F;
  }

  if (vector[2] === -1) {
    return FACE_CODE_BY_NAME.B;
  }

  if (vector[0] === 1) {
    return FACE_CODE_BY_NAME.R;
  }

  return FACE_CODE_BY_NAME.L;
}

function rotateFaceCode(faceCode: number, axis: "x" | "y" | "z", angle: number): number {
  return getFaceCodeFromVector(rotateVector(FACE_VECTOR_BY_CODE[faceCode], axis, angle));
}

function createPieceIndexById(pieceIds: string[]): Map<string, number> {
  return new Map(pieceIds.map((id, index) => [id, index]));
}

function toFastCubeState(state: CubeState): FastCubeState {
  const stickerOffsets = new Uint8Array(state.pieces.length + 1);
  let stickerCount = 0;

  state.pieces.forEach((piece, index) => {
    stickerOffsets[index] = stickerCount;
    stickerCount += piece.stickers.length;
  });
  stickerOffsets[state.pieces.length] = stickerCount;

  const pieceIds = state.pieces.map((piece) => piece.id);
  const coords = new Int8Array(state.pieces.length * 3);
  const stickerFaces = new Uint8Array(stickerCount);
  const stickerColors = state.pieces.map((piece) => piece.stickers.map((sticker) => sticker.color));

  state.pieces.forEach((piece, pieceIndex) => {
    const coordOffset = pieceIndex * 3;
    coords[coordOffset] = piece.coord[0];
    coords[coordOffset + 1] = piece.coord[1];
    coords[coordOffset + 2] = piece.coord[2];

    piece.stickers.forEach((sticker, stickerIndex) => {
      stickerFaces[stickerOffsets[pieceIndex] + stickerIndex] = FACE_CODE_BY_NAME[sticker.face];
    });
  });

  return {
    faceColorMap: { ...state.faceColorMap },
    pieceIds,
    pieceKinds: state.pieces.map((piece) => piece.kind),
    pieceIndexById: createPieceIndexById(pieceIds),
    coords,
    stickerOffsets,
    stickerColors,
    stickerFaces,
  };
}

function cloneFastCubeState(state: FastCubeState): FastCubeState {
  return {
    ...state,
    faceColorMap: { ...state.faceColorMap },
    coords: new Int8Array(state.coords),
    stickerFaces: new Uint8Array(state.stickerFaces),
  };
}

function fastToCubeState(state: FastCubeState): CubeState {
  return {
    faceColorMap: { ...state.faceColorMap },
    pieces: state.pieceIds.map((id, pieceIndex) => {
      const coordOffset = pieceIndex * 3;
      const stickerStart = state.stickerOffsets[pieceIndex];
      const stickerEnd = state.stickerOffsets[pieceIndex + 1];

      return {
        id,
        kind: state.pieceKinds[pieceIndex],
        coord: [
          state.coords[coordOffset],
          state.coords[coordOffset + 1],
          state.coords[coordOffset + 2],
        ] as Vec3,
        stickers: state.stickerColors[pieceIndex].map((color, stickerIndex) => ({
          color,
          face: FACE_NAME_BY_CODE[state.stickerFaces[stickerStart + stickerIndex]],
        })),
      };
    }),
  };
}

function applyFastMoveToMutableState(state: FastCubeState, move: string): void {
  const descriptor = getCachedMoveDescriptor(move);

  if (!descriptor) {
    return;
  }

  const axisIndex = descriptor.axis === "x" ? 0 : descriptor.axis === "y" ? 1 : 2;
  const cos = Math.round(Math.cos(descriptor.angle));
  const sin = Math.round(Math.sin(descriptor.angle));

  for (let pieceIndex = 0; pieceIndex < state.pieceIds.length; pieceIndex += 1) {
    const coordOffset = pieceIndex * 3;

    if (!descriptor.layers.includes(state.coords[coordOffset + axisIndex])) {
      continue;
    }

    const x = state.coords[coordOffset];
    const y = state.coords[coordOffset + 1];
    const z = state.coords[coordOffset + 2];

    if (descriptor.axis === "x") {
      state.coords[coordOffset + 1] = roundCoord(y * cos - z * sin);
      state.coords[coordOffset + 2] = roundCoord(y * sin + z * cos);
    } else if (descriptor.axis === "y") {
      state.coords[coordOffset] = roundCoord(x * cos + z * sin);
      state.coords[coordOffset + 2] = roundCoord(-x * sin + z * cos);
    } else {
      state.coords[coordOffset] = roundCoord(x * cos - y * sin);
      state.coords[coordOffset + 1] = roundCoord(x * sin + y * cos);
    }

    for (
      let stickerIndex = state.stickerOffsets[pieceIndex];
      stickerIndex < state.stickerOffsets[pieceIndex + 1];
      stickerIndex += 1
    ) {
      state.stickerFaces[stickerIndex] = rotateFaceCode(
        state.stickerFaces[stickerIndex],
        descriptor.axis,
        descriptor.angle,
      );
    }
  }
}

function applyFastAlgorithm(state: FastCubeState, moves: string[]): FastCubeState {
  const nextState = cloneFastCubeState(state);

  moves.forEach((move) => applyFastMoveToMutableState(nextState, move));

  return nextState;
}

function applyCachedFastAlgorithm(
  state: FastCubeState,
  moves: string[],
  cache?: BasicF2lAnalysisCache,
): FastCubeState {
  if (moves.length === 0) {
    return state;
  }

  if (!cache) {
    return applyFastAlgorithm(state, moves);
  }

  const cacheKey = `${getFastCubeStateSignature(state)}::${moves.join(" ")}`;
  const cachedState = cache.fastAlgorithms.get(cacheKey);

  if (cachedState) {
    return cachedState;
  }

  const nextState = applyFastAlgorithm(state, moves);
  cache.fastAlgorithms.set(cacheKey, nextState);

  return nextState;
}

function getPieceByColors(
  state: CubeState,
  kind: PieceKind,
  colors: CubeColorName[],
): CubePiece | null {
  const pieceId = [...colors].sort().join("-");

  return state.pieces.find((piece) => piece.kind === kind && piece.id === pieceId) ?? null;
}

function getFastPieceIndexByColors(
  state: FastCubeState,
  kind: PieceKind,
  colors: CubeColorName[],
): number | null {
  const pieceIndex = state.pieceIndexById.get([...colors].sort().join("-"));

  return pieceIndex !== undefined && state.pieceKinds[pieceIndex] === kind ? pieceIndex : null;
}

function getStickerFace(piece: CubePiece | null, color: CubeColorName): FaceName | null {
  return piece?.stickers.find((sticker) => sticker.color === color)?.face ?? null;
}

function getFastStickerFace(
  state: FastCubeState,
  pieceIndex: number | null,
  color: CubeColorName,
): FaceName | null {
  if (pieceIndex === null) {
    return null;
  }

  const stickerStart = state.stickerOffsets[pieceIndex];
  const stickerEnd = state.stickerOffsets[pieceIndex + 1];

  for (let stickerIndex = stickerStart; stickerIndex < stickerEnd; stickerIndex += 1) {
    const colorIndex = stickerIndex - stickerStart;

    if (state.stickerColors[pieceIndex][colorIndex] === color) {
      return FACE_NAME_BY_CODE[state.stickerFaces[stickerIndex]];
    }
  }

  return null;
}

function sameCoord(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function isPieceSolvedAtFaces(
  state: CubeState,
  kind: PieceKind,
  colors: CubeColorName[],
  faces: FaceName[],
): boolean {
  const piece = getPieceByColors(state, kind, colors);

  if (!piece) {
    return false;
  }

  const expectedCoord = faces.reduce<Vec3>(
    (coord, face) => addVectors(coord, FACE_VECTORS[face]),
    [0, 0, 0],
  );

  return (
    sameCoord(piece.coord, expectedCoord) &&
    colors.every((color) => {
      const targetFace = faces.find((face) => state.faceColorMap[face] === color);

      return targetFace !== undefined && getStickerFace(piece, color) === targetFace;
    })
  );
}

function isFastPieceSolvedAtFaces(
  state: FastCubeState,
  kind: PieceKind,
  colors: CubeColorName[],
  faces: FaceName[],
): boolean {
  const pieceIndex = getFastPieceIndexByColors(state, kind, colors);

  if (pieceIndex === null) {
    return false;
  }

  const coordOffset = pieceIndex * 3;
  const expectedCoord = faces.reduce<Vec3>(
    (coord, face) => addVectors(coord, FACE_VECTORS[face]),
    [0, 0, 0],
  );

  return (
    state.coords[coordOffset] === expectedCoord[0] &&
    state.coords[coordOffset + 1] === expectedCoord[1] &&
    state.coords[coordOffset + 2] === expectedCoord[2] &&
    colors.every((color) => {
      const targetFace = faces.find((face) => state.faceColorMap[face] === color);

      return targetFace !== undefined && getFastStickerFace(state, pieceIndex, color) === targetFace;
    })
  );
}

export function getCrossEdgeStatuses(
  state: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): CrossEdgeStatus[] {
  return getCrossSideFaces(targetFace).map((sideFace) => {
    const sideColor = state.faceColorMap[sideFace];
    const piece = getPieceByColors(state, "edge", [crossColor, sideColor]);
    const expectedCoord = addVectors(FACE_VECTORS[targetFace], FACE_VECTORS[sideFace]);
    const solved =
      Boolean(piece) &&
      sameCoord(piece?.coord ?? [9, 9, 9], expectedCoord) &&
      getStickerFace(piece, crossColor) === targetFace &&
      getStickerFace(piece, sideColor) === sideFace;

    return {
      edgeColor: crossColor,
      sideFace,
      sideColor,
      solved,
    };
  });
}

export function isCrossSolved(
  state: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): boolean {
  return getCrossSideFaces(targetFace).every((sideFace) => {
    const sideColor = state.faceColorMap[sideFace];
    const piece = getPieceByColors(state, "edge", [crossColor, sideColor]);
    const expectedCoord = addVectors(FACE_VECTORS[targetFace], FACE_VECTORS[sideFace]);

    return (
      Boolean(piece) &&
      sameCoord(piece?.coord ?? [9, 9, 9], expectedCoord) &&
      getStickerFace(piece, crossColor) === targetFace &&
      getStickerFace(piece, sideColor) === sideFace
    );
  });
}

function isFastCrossSolved(
  state: FastCubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): boolean {
  return getCrossSideFaces(targetFace).every((sideFace) => {
    const sideColor = state.faceColorMap[sideFace];
    const pieceIndex = getFastPieceIndexByColors(state, "edge", [crossColor, sideColor]);

    if (pieceIndex === null) {
      return false;
    }

    const coordOffset = pieceIndex * 3;
    const expectedCoord = addVectors(FACE_VECTORS[targetFace], FACE_VECTORS[sideFace]);

    return (
      state.coords[coordOffset] === expectedCoord[0] &&
      state.coords[coordOffset + 1] === expectedCoord[1] &&
      state.coords[coordOffset + 2] === expectedCoord[2] &&
      getFastStickerFace(state, pieceIndex, crossColor) === targetFace &&
      getFastStickerFace(state, pieceIndex, sideColor) === sideFace
    );
  });
}

function getMoveFace(move: string): FaceName {
  return move[0] as FaceName;
}

function shouldPruneMove(move: string, lastMove: string | null): boolean {
  if (!lastMove) {
    return false;
  }

  const face = getMoveFace(move);
  const lastFace = getMoveFace(lastMove);

  if (face === lastFace) {
    return true;
  }

  return OPPOSITE_FACE[face] === lastFace && FACE_ORDER[face] < FACE_ORDER[lastFace];
}

function getCrossSignature(
  state: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): string {
  return getCrossSideFaces(targetFace).map((sideFace) => {
    const sideColor = state.faceColorMap[sideFace];
    const piece = getPieceByColors(state, "edge", [crossColor, sideColor]);

    if (!piece) {
      return `${sideFace}:missing`;
    }

    const crossFace = getStickerFace(piece, crossColor);
    const sideStickerFace = getStickerFace(piece, sideColor);

    return `${sideFace}:${piece.coord.join("")}:${crossFace ?? "-"}:${sideStickerFace ?? "-"}:${targetFace}`;
  }).join("|");
}

function depthLimitedCrossSearch(
  state: CubeState,
  depthRemaining: number,
  path: string[],
  lastMove: string | null,
  context: SearchContext,
  seen: Set<string>,
  solutions: CrossSolution[],
): void {
  if (context.nodes >= context.maxNodes || solutions.length >= context.maxSolutions) {
    context.truncated = context.nodes >= context.maxNodes;
    return;
  }

  context.nodes += 1;

  if (isCrossSolved(state, context.crossColor, context.targetFace)) {
    const moves = [...path];
    solutions.push({
      id: `${context.crossColor}-${context.targetFace}-${solutions.length + 1}`,
      color: context.crossColor,
      targetFace: context.targetFace,
      algorithm: moves.join(" "),
      moves,
      moveCount: moves.length,
      stateAfterCross: state,
      solvedEdges: getCrossEdgeStatuses(state, context.crossColor, context.targetFace),
      inspectedNodes: context.nodes,
    });
    return;
  }

  if (depthRemaining === 0) {
    return;
  }

  for (const move of FACE_TURN_MOVES) {
    if (shouldPruneMove(move, lastMove)) {
      continue;
    }

    const nextState = applyMove(state, move);
    const signature = `${depthRemaining}:${getMoveFace(move)}:${getCrossSignature(
      nextState,
      context.crossColor,
      context.targetFace,
    )}`;

    if (seen.has(signature)) {
      continue;
    }

    seen.add(signature);
    depthLimitedCrossSearch(
      nextState,
      depthRemaining - 1,
      [...path, move],
      move,
      context,
      seen,
      solutions,
    );

    if (context.truncated || solutions.length >= context.maxSolutions) {
      return;
    }
  }
}

export function findCrossSolutions(
  scrambledState: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  options: { maxDepth?: number; maxSolutions?: number; maxNodes?: number } = {},
): CrossSearchResult {
  const maxDepth = options.maxDepth ?? CROSS_SEARCH_MAX_DEPTH;
  const context: SearchContext = {
    crossColor,
    targetFace,
    maxSolutions: options.maxSolutions ?? 3,
    maxNodes: options.maxNodes ?? CROSS_SEARCH_NODE_LIMIT,
    nodes: 0,
    truncated: false,
  };

  for (let depth = 0; depth <= maxDepth; depth += 1) {
    const solutions: CrossSolution[] = [];
    const seen = new Set<string>([getCrossSignature(scrambledState, crossColor, targetFace)]);

    depthLimitedCrossSearch(scrambledState, depth, [], null, context, seen, solutions);

    if (solutions.length > 0 || context.truncated) {
      return {
        color: crossColor,
        targetFace,
        maxDepth,
        nodes: context.nodes,
        truncated: context.truncated,
        solutions,
      };
    }
  }

  return {
    color: crossColor,
    targetFace,
    maxDepth,
    nodes: context.nodes,
    truncated: context.truncated,
    solutions: [],
  };
}

function createSolvedCrossEdgeState(
  faceColorMap: Record<FaceName, CubeColorName>,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): CrossEdgePieceState[] {
  return getCrossSideFaces(targetFace).map((sideFace) => {
    const sideColor = faceColorMap[sideFace];

    return {
      sideColor,
      sideFace,
      coord: addVectors(FACE_VECTORS[targetFace], FACE_VECTORS[sideFace]),
      crossStickerFace: targetFace,
      sideStickerFace: sideFace,
    };
  });
}

function createCrossEdgeStateFromCubeState(
  state: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): CrossEdgePieceState[] {
  return getCrossSideFaces(targetFace).map((sideFace) => {
    const sideColor = state.faceColorMap[sideFace];
    const piece = getPieceByColors(state, "edge", [crossColor, sideColor]);
    const crossStickerFace = getStickerFace(piece, crossColor);
    const sideStickerFace = getStickerFace(piece, sideColor);

    if (!piece || !crossStickerFace || !sideStickerFace) {
      throw new Error(`${crossColor}-${sideColor} のクロスエッジを認識できませんでした。`);
    }

    return {
      sideColor,
      sideFace,
      coord: [...piece.coord] as Vec3,
      crossStickerFace,
      sideStickerFace,
    };
  });
}

function cloneCrossEdges(edges: CrossEdgePieceState[]): CrossEdgePieceState[] {
  return edges.map((edge) => ({
    sideColor: edge.sideColor,
    sideFace: edge.sideFace,
    coord: [...edge.coord] as Vec3,
    crossStickerFace: edge.crossStickerFace,
    sideStickerFace: edge.sideStickerFace,
  }));
}

function applyMoveToCrossEdges(edges: CrossEdgePieceState[], move: string): CrossEdgePieceState[] {
  const descriptor = getCachedMoveDescriptor(move);
  const nextEdges = cloneCrossEdges(edges);

  if (!descriptor) {
    return nextEdges;
  }

  nextEdges.forEach((edge) => {
    if (!descriptor.layers.includes(getAxisCoord(edge.coord, descriptor.axis))) {
      return;
    }

    edge.coord = rotateVector(edge.coord, descriptor.axis, descriptor.angle);
    edge.crossStickerFace = getFaceFromVector(
      rotateVector(FACE_VECTORS[edge.crossStickerFace], descriptor.axis, descriptor.angle),
    );
    edge.sideStickerFace = getFaceFromVector(
      rotateVector(FACE_VECTORS[edge.sideStickerFace], descriptor.axis, descriptor.angle),
    );
  });

  return nextEdges;
}

function applyAlgorithmToCrossEdges(
  edges: CrossEdgePieceState[],
  moves: string[],
): CrossEdgePieceState[] {
  return moves.reduce((nextEdges, move) => applyMoveToCrossEdges(nextEdges, move), edges);
}

function isCrossEdgeStateSolved(edges: CrossEdgePieceState[], targetFace: TargetFace): boolean {
  return edges.every(
    (edge) =>
      sameCoord(edge.coord, addVectors(FACE_VECTORS[targetFace], FACE_VECTORS[edge.sideFace])) &&
      edge.crossStickerFace === targetFace &&
      edge.sideStickerFace === edge.sideFace,
  );
}

function getCrossEdgeStateSignature(edges: CrossEdgePieceState[]): string {
  return edges
    .map(
      (edge) =>
        `${edge.sideColor}:${edge.coord.join("")}:${edge.crossStickerFace}:${edge.sideStickerFace}`,
    )
    .join("|");
}

function getCrossPruningSignature(edges: CrossEdgePieceState[]): string {
  return edges
    .map(
      (edge) =>
        `${edge.sideFace}:${edge.coord.join("")}:${edge.crossStickerFace}:${edge.sideStickerFace}`,
    )
    .join("|");
}

function crossEdgeStateToStatuses(
  edges: CrossEdgePieceState[],
  crossColor: CubeColorName,
  targetFace: TargetFace,
): CrossEdgeStatus[] {
  return edges.map((edge) => ({
    edgeColor: crossColor,
    sideFace: edge.sideFace,
    sideColor: edge.sideColor,
    solved:
      sameCoord(edge.coord, addVectors(FACE_VECTORS[targetFace], FACE_VECTORS[edge.sideFace])) &&
      edge.crossStickerFace === targetFace &&
      edge.sideStickerFace === edge.sideFace,
  }));
}

function createCrossSolutionFromPath(
  input: NormalizedCrossSearchInput,
  path: string[],
  index: number,
  nodes: number,
): CrossSolution {
  const stateAfterCross = applyAlgorithm(input.initialState, path);

  return {
    id: `${input.crossColor}-${input.targetFace}-${index}`,
    color: input.crossColor,
    targetFace: input.targetFace,
    algorithm: path.join(" "),
    moves: path,
    moveCount: path.length,
    stateAfterCross,
    solvedEdges: getCrossEdgeStatuses(stateAfterCross, input.crossColor, input.targetFace),
    inspectedNodes: nodes,
  };
}

function createCanonicalSolvedCrossEdges(targetFace: TargetFace): CrossEdgePieceState[] {
  return getCrossSideFaces(targetFace).map((sideFace) => ({
    sideColor: "white",
    sideFace,
    coord: addVectors(FACE_VECTORS[targetFace], FACE_VECTORS[sideFace]),
    crossStickerFace: targetFace,
    sideStickerFace: sideFace,
  }));
}

function getCrossPruningTable(targetFace: TargetFace): CrossPruningTable {
  const cachedTable = CROSS_PRUNING_TABLES.get(targetFace);

  if (cachedTable) {
    return cachedTable;
  }

  const solvedKey = encodeCrossEdgeStateKey(createCanonicalSolvedCrossEdges(targetFace));
  const distances = new Uint8Array(CROSS_PRUNING_STATE_COUNT);
  const queue = new Int32Array(CROSS_PRUNING_STATE_COUNT);
  let cursor = 0;
  let queueSize = 1;
  let maxDistance = 0;

  distances.fill(CROSS_PRUNING_UNKNOWN_DISTANCE);
  distances[solvedKey] = 0;
  queue[0] = solvedKey;

  while (cursor < queueSize) {
    const stateKey = queue[cursor];
    const currentDistance = distances[stateKey];
    cursor += 1;

    for (const move of FACE_TURN_MOVES) {
      const nextStateKey = applyMoveToCrossStateKey(stateKey, move);

      if (distances[nextStateKey] !== CROSS_PRUNING_UNKNOWN_DISTANCE) {
        continue;
      }

      const distance = currentDistance + 1;
      distances[nextStateKey] = distance;
      maxDistance = Math.max(maxDistance, distance);
      queue[queueSize] = nextStateKey;
      queueSize += 1;
    }
  }

  const table: CrossPruningTable = {
    distances,
    maxDistance,
    stateCount: queueSize,
  };

  CROSS_PRUNING_TABLES.set(targetFace, table);

  return table;
}

function searchCrossWithPruning(
  stateKey: number,
  depthLimit: number,
  path: string[],
  lastMove: string | null,
  seenPath: Set<number>,
  input: NormalizedCrossSearchInput,
  pruningTable: CrossPruningTable,
  solutions: CrossSolution[],
  nodeCounter: { nodes: number; truncated: boolean },
): void {
  if (
    nodeCounter.nodes >= input.maxNodes ||
    solutions.length >= input.maxSolutions ||
    nodeCounter.truncated
  ) {
    nodeCounter.truncated = nodeCounter.nodes >= input.maxNodes;
    return;
  }

  nodeCounter.nodes += 1;

  const remainingDistance = pruningTable.distances[stateKey];

  if (
    remainingDistance === CROSS_PRUNING_UNKNOWN_DISTANCE ||
    path.length + remainingDistance > depthLimit
  ) {
    return;
  }

  if (remainingDistance === 0) {
    solutions.push(
      createCrossSolutionFromPath(input, path, solutions.length + 1, nodeCounter.nodes),
    );
    return;
  }

  if (path.length >= depthLimit) {
    return;
  }

  for (const move of FACE_TURN_MOVES) {
    if (shouldPruneMove(move, lastMove)) {
      continue;
    }

    const nextStateKey = applyMoveToCrossStateKey(stateKey, move);

    if (seenPath.has(nextStateKey)) {
      continue;
    }

    seenPath.add(nextStateKey);
    searchCrossWithPruning(
      nextStateKey,
      depthLimit,
      [...path, move],
      move,
      seenPath,
      input,
      pruningTable,
      solutions,
      nodeCounter,
    );
    seenPath.delete(nextStateKey);

    if (
      nodeCounter.truncated ||
      nodeCounter.nodes >= input.maxNodes ||
      solutions.length >= input.maxSolutions
    ) {
      return;
    }
  }
}

export function findCrossSolutionsFromScramble(input: CrossSearchInput): CrossSearchResult {
  const scrambleMoves = input.scrambleMoves ?? [];
  const initialState =
    input.initialState ?? applyAlgorithm(createSolvedCubeState(input.faceColorMap), scrambleMoves);
  const normalizedInput: NormalizedCrossSearchInput = {
    maxDepth: CROSS_SEARCH_MAX_DEPTH,
    maxSolutions: 5,
    maxNodes: CROSS_SEARCH_NODE_LIMIT,
    ...input,
    scrambleMoves,
    initialState,
  };
  const startEdges = createCrossEdgeStateFromCubeState(
    normalizedInput.initialState,
    normalizedInput.crossColor,
    normalizedInput.targetFace,
  );
  const scrambledKey = encodeCrossEdgeStateKey(startEdges);
  const pruningTable = getCrossPruningTable(normalizedInput.targetFace);
  const startDistance = pruningTable.distances[scrambledKey];
  const solutions: CrossSolution[] = [];
  const nodeCounter = { nodes: 0, truncated: false };

  if (
    startDistance !== CROSS_PRUNING_UNKNOWN_DISTANCE &&
    startDistance <= normalizedInput.maxDepth
  ) {
    for (let depth = startDistance; depth <= normalizedInput.maxDepth; depth += 1) {
      const seenPath = new Set<number>([scrambledKey]);

      searchCrossWithPruning(
        scrambledKey,
        depth,
        [],
        null,
        seenPath,
        normalizedInput,
        pruningTable,
        solutions,
        nodeCounter,
      );

      if (solutions.length > 0 || nodeCounter.truncated) {
        break;
      }
    }
  }

  return {
    color: normalizedInput.crossColor,
    targetFace: normalizedInput.targetFace,
    maxDepth: normalizedInput.maxDepth,
    nodes: nodeCounter.nodes,
    truncated: nodeCounter.truncated,
    solutions,
  };
}

export function getF2lPairCandidates(
  state: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): F2lPairCandidate[] {
  if (targetFace !== "D") {
    return [];
  }

  return F2L_SLOT_SPECS.map((slotSpec, index) => {
    const [firstFace, secondFace] = slotSpec.faces;
    const firstColor = state.faceColorMap[firstFace];
    const secondColor = state.faceColorMap[secondFace];
    const cornerColors = [crossColor, firstColor, secondColor];
    const edgeColors = [firstColor, secondColor];
    const corner = getPieceByColors(state, "corner", cornerColors);
    const edge = getPieceByColors(state, "edge", edgeColors);
    const cornerSolved = isPieceSolvedAtFaces(state, "corner", cornerColors, [
      targetFace,
      firstFace,
      secondFace,
    ]);
    const edgeSolved = isPieceSolvedAtFaces(state, "edge", edgeColors, [firstFace, secondFace]);
    const status =
      corner && edge ? (cornerSolved && edgeSolved ? "completed" : "unsolved") : "unknown";

    return {
      id: `${firstFace}${secondFace}-${index}`,
      title: `${getColorJapanese(crossColor)}${getColorJapanese(firstColor)}${getColorJapanese(
        secondColor,
      )} コーナー + ${getColorJapanese(firstColor)}${getColorJapanese(secondColor)} エッジ`,
      slotLabel: `${slotSpec.name} slot`,
      slotFaces: [firstFace, secondFace],
      targetFace,
      cornerColors,
      edgeColors,
      cornerPosition: corner ? getCoordLabel(corner.coord) || "center" : "不明",
      edgePosition: edge ? getCoordLabel(edge.coord) || "center" : "不明",
      status,
      note:
        status === "completed"
          ? "このスロットは完成済みです。別のペアを探しましょう。"
          : "対象コーナーとエッジの位置を確認し、Learnの近いケースで手順を復習できます。",
    };
  });
}

function getFastF2lPairCandidates(
  state: FastCubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): F2lPairCandidate[] {
  if (targetFace !== "D") {
    return [];
  }

  return F2L_SLOT_SPECS.map((slotSpec, index) => {
    const [firstFace, secondFace] = slotSpec.faces;
    const firstColor = state.faceColorMap[firstFace];
    const secondColor = state.faceColorMap[secondFace];
    const cornerColors = [crossColor, firstColor, secondColor];
    const edgeColors = [firstColor, secondColor];
    const cornerIndex = getFastPieceIndexByColors(state, "corner", cornerColors);
    const edgeIndex = getFastPieceIndexByColors(state, "edge", edgeColors);
    const cornerSolved = isFastPieceSolvedAtFaces(state, "corner", cornerColors, [
      targetFace,
      firstFace,
      secondFace,
    ]);
    const edgeSolved = isFastPieceSolvedAtFaces(state, "edge", edgeColors, [
      firstFace,
      secondFace,
    ]);
    const status =
      cornerIndex !== null && edgeIndex !== null
        ? cornerSolved && edgeSolved
          ? "completed"
          : "unsolved"
        : "unknown";

    return {
      id: `${firstFace}${secondFace}-${index}`,
      title: `${getColorJapanese(crossColor)}${getColorJapanese(firstColor)}${getColorJapanese(
        secondColor,
      )} コーナー + ${getColorJapanese(firstColor)}${getColorJapanese(secondColor)} エッジ`,
      slotLabel: `${slotSpec.name} slot`,
      slotFaces: [firstFace, secondFace],
      targetFace,
      cornerColors,
      edgeColors,
      cornerPosition: getFastCoordLabel(state, cornerIndex),
      edgePosition: getFastCoordLabel(state, edgeIndex),
      status,
      note:
        status === "completed"
          ? "このスロットは完成済みです。別のペアを探しましょう。"
          : "対象コーナーとエッジの位置を確認し、Learnの近いケースで手順を復習できます。",
    };
  });
}

const F2L_EXTRACTION_OPTIONS: Record<F2lSlotName, string[]> = {
  FR: ["R U R'", "R U' R'", "R U2 R'", "F' U' F", "F' U F", "F' U2 F"],
  FL: ["L' U' L", "L' U L", "L' U2 L", "F U F'", "F U' F'", "F U2 F'"],
  BR: ["R' U' R", "R' U R", "R' U2 R", "B U B'", "B U' B'", "B U2 B'"],
  BL: ["L U L'", "L U' L'", "L U2 L'", "B' U' B", "B' U B", "B' U2 B"],
};

const F2L_U_SETUPS = ["", "U", "U'", "U2"];

const F2L_SLOT_ROTATION_WRAPPERS: Record<F2lSlotName, Array<[string, string]>> = {
  FR: [["", ""]],
  FL: [["y'", "y"]],
  BR: [["y", "y'"]],
  BL: [["y2", "y2"]],
};
const F2L_EXTRACTION_ENTRY_CACHE = new Map<F2lSlotName, F2lExtractionEntry[]>();
const BASIC_F2L_ALGORITHM_VARIANTS_CACHE = new Map<string, string[]>();
const BASIC_F2L_ALGORITHM_INDEX_CACHE = new Map<F2lSlotName, BasicF2lAlgorithmEntry[]>();
const BASIC_F2L_REVERSE_INDEX_CACHE = new Map<string, Map<string, BasicF2lAlgorithmEntry[]>>();
const SOLVED_FAST_STATE_CACHE = new Map<string, FastCubeState>();

const F2L_LOCAL_SEARCH_MOVES: Record<F2lSlotName, string[]> = {
  FR: ["U", "U'", "U2", "R", "R'", "R2", "F", "F'", "F2"],
  FL: ["U", "U'", "U2", "L", "L'", "L2", "F", "F'", "F2"],
  BR: ["U", "U'", "U2", "R", "R'", "R2", "B", "B'", "B2"],
  BL: ["U", "U'", "U2", "L", "L'", "L2", "B", "B'", "B2"],
};

const F2L_LOCAL_SEARCH_MAX_DEPTH = 7;
const F2L_LOCAL_SEARCH_NODE_LIMIT = 18_000;

const F2L_SLOT_FACE_MAPS: Record<F2lSlotName, Partial<Record<FaceName, FaceName>>> = {
  FR: { F: "F", R: "R", B: "B", L: "L" },
  FL: { F: "F", R: "L", B: "B", L: "R" },
  BR: { F: "B", R: "R", B: "F", L: "L" },
  BL: { F: "B", R: "L", B: "F", L: "R" },
};

function getF2lSlotSpecByFaces(faces: [FaceName, FaceName]) {
  return (
    F2L_SLOT_SPECS.find(
      (slot) =>
        (slot.faces[0] === faces[0] && slot.faces[1] === faces[1]) ||
        (slot.faces[0] === faces[1] && slot.faces[1] === faces[0]),
    ) ?? F2L_SLOT_SPECS[0]
  );
}

function getF2lSlotNameFromCoord(coord: Vec3): F2lSlotName | null {
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

function getF2lPairPieces(state: CubeState, candidate: F2lPairCandidate) {
  return {
    corner: getPieceByColors(state, "corner", candidate.cornerColors),
    edge: getPieceByColors(state, "edge", candidate.edgeColors),
  };
}

function getFastF2lPairPieceIndexes(state: FastCubeState, candidate: F2lPairCandidate) {
  return {
    cornerIndex: getFastPieceIndexByColors(state, "corner", candidate.cornerColors),
    edgeIndex: getFastPieceIndexByColors(state, "edge", candidate.edgeColors),
  };
}

function areF2lPairPiecesOnU(state: CubeState, candidate: F2lPairCandidate): boolean {
  const { corner, edge } = getF2lPairPieces(state, candidate);

  return Boolean(corner && edge && corner.coord[1] === 1 && edge.coord[1] === 1);
}

function areFastF2lPairPiecesOnU(state: FastCubeState, candidate: F2lPairCandidate): boolean {
  const { cornerIndex, edgeIndex } = getFastF2lPairPieceIndexes(state, candidate);

  return Boolean(
    cornerIndex !== null &&
      edgeIndex !== null &&
      state.coords[cornerIndex * 3 + 1] === 1 &&
      state.coords[edgeIndex * 3 + 1] === 1,
  );
}

function isF2lPairSolved(state: CubeState, candidate: F2lPairCandidate): boolean {
  const slotSpec = getF2lSlotSpecByFaces(candidate.slotFaces);

  return (
    isPieceSolvedAtFaces(state, "corner", candidate.cornerColors, slotSpec.cornerFaces) &&
    isPieceSolvedAtFaces(state, "edge", candidate.edgeColors, slotSpec.edgeFaces)
  );
}

function isFastF2lPairSolved(state: FastCubeState, candidate: F2lPairCandidate): boolean {
  const slotSpec = getF2lSlotSpecByFaces(candidate.slotFaces);

  return (
    isFastPieceSolvedAtFaces(state, "corner", candidate.cornerColors, slotSpec.cornerFaces) &&
    isFastPieceSolvedAtFaces(state, "edge", candidate.edgeColors, slotSpec.edgeFaces)
  );
}

function parseMoves(algorithm: string): string[] {
  return parseAlgorithm(algorithm).moves;
}

function joinAlgorithms(...algorithms: string[]): string {
  return algorithms
    .map((algorithm) => algorithm.trim())
    .filter(Boolean)
    .join(" ");
}

function invertSuffix(move: string): string {
  if (move.endsWith("2")) {
    return move;
  }

  if (move.endsWith("'")) {
    return move.slice(0, -1);
  }

  return `${move}'`;
}

function transformMoveToSlot(move: string, slotName: F2lSlotName, mirrorDirections: boolean): string {
  const parsed = parseAlgorithm(move).parsedMoves[0];

  if (!parsed || parsed.family !== "face") {
    return move;
  }

  const baseFace = parsed.base as FaceName;
  const mappedFace = F2L_SLOT_FACE_MAPS[slotName][baseFace] ?? baseFace;
  const mappedMove = `${mappedFace}${parsed.suffix}`;

  if (!mirrorDirections || mappedFace === "U" || mappedFace === "D") {
    return mappedMove;
  }

  return invertSuffix(mappedMove);
}

function transformAlgorithmToSlot(
  algorithm: string,
  slotName: F2lSlotName,
  mirrorDirections: boolean,
): string {
  return parseMoves(algorithm)
    .map((move) => transformMoveToSlot(move, slotName, mirrorDirections))
    .join(" ");
}

function getBasicF2lAlgorithmVariants(caseItem: BasicF2lCase, slotName: F2lSlotName): string[] {
  const cacheKey = `${caseItem.id}:${slotName}`;
  const cachedVariants = BASIC_F2L_ALGORITHM_VARIANTS_CACHE.get(cacheKey);

  if (cachedVariants) {
    return cachedVariants;
  }

  const baseAlgorithms = [
    caseItem.alg,
    transformAlgorithmToSlot(caseItem.alg, slotName, false),
    transformAlgorithmToSlot(caseItem.alg, slotName, true),
  ];
  const variants = new Set<string>();

  baseAlgorithms.forEach((algorithm) => {
    F2L_U_SETUPS.forEach((setup) => variants.add(joinAlgorithms(setup, algorithm)));
  });

  F2L_SLOT_ROTATION_WRAPPERS[slotName].forEach(([prefix, suffix]) => {
    F2L_U_SETUPS.forEach((setup) => {
      variants.add(joinAlgorithms(prefix, setup, caseItem.alg, suffix));
    });
  });

  const variantList = [...variants].filter(Boolean);
  BASIC_F2L_ALGORITHM_VARIANTS_CACHE.set(cacheKey, variantList);

  return variantList;
}

function getBasicF2lAlgorithmEntries(slotName: F2lSlotName): BasicF2lAlgorithmEntry[] {
  const cachedEntries = BASIC_F2L_ALGORITHM_INDEX_CACHE.get(slotName);

  if (cachedEntries) {
    return cachedEntries;
  }

  const entries = BASIC_F2L_41_CASES.flatMap((caseItem) =>
    getBasicF2lAlgorithmVariants(caseItem, slotName).map((algorithm) => {
      const moves = parseMoves(algorithm);

      return {
        caseItem,
        algorithm,
        moves,
        moveCount: moves.length,
        score: getF2lMoveScore(moves),
      };
    }),
  ).sort((a, b) => a.score - b.score || a.caseItem.id.localeCompare(b.caseItem.id));

  BASIC_F2L_ALGORITHM_INDEX_CACHE.set(slotName, entries);
  return entries;
}

function getF2lExtractionEntries(slotName: F2lSlotName): F2lExtractionEntry[] {
  const cachedEntries = F2L_EXTRACTION_ENTRY_CACHE.get(slotName);

  if (cachedEntries) {
    return cachedEntries;
  }

  const entries = F2L_EXTRACTION_OPTIONS[slotName]
    .flatMap((extraction) =>
      F2L_U_SETUPS.flatMap((beforeU) =>
        F2L_U_SETUPS.map((afterU) => {
          const algorithm = joinAlgorithms(beforeU, extraction, afterU);
          const moves = parseMoves(algorithm);

          return {
            algorithm,
            moves,
            moveCount: moves.length,
            score: getF2lMoveScore(moves),
          };
        }),
      ),
    )
    .sort((a, b) => a.score - b.score);

  F2L_EXTRACTION_ENTRY_CACHE.set(slotName, entries);
  return entries;
}

function getF2lMoveScore(moves: string[]): number {
  const cubeRotations = moves.filter((move) => /^[xyz]/.test(move)).length;
  const yRotations = moves.filter((move) => /^y/.test(move)).length;

  return moves.length + cubeRotations * 2 + yRotations * 2;
}

function getCubeStateSignature(state: CubeState): string {
  return state.pieces
    .map(
      (piece) =>
        `${piece.id}:${piece.coord.join(",")}:${piece.stickers
          .map((sticker) => sticker.face)
          .join("")}`,
    )
    .join("|");
}

function getFastCubeStateSignature(state: FastCubeState): string {
  return `${state.coords.join(",")}|${state.stickerFaces.join("")}`;
}

function getFaceColorMapCacheKey(faceColorMap: Record<FaceName, CubeColorName>): string {
  return FACE_NAME_BY_CODE.map((face) => `${face}:${faceColorMap[face]}`).join("|");
}

function getSolvedFastCubeState(faceColorMap: Record<FaceName, CubeColorName>): FastCubeState {
  const cacheKey = getFaceColorMapCacheKey(faceColorMap);
  const cachedState = SOLVED_FAST_STATE_CACHE.get(cacheKey);

  if (cachedState) {
    return cachedState;
  }

  const solvedState = toFastCubeState(createSolvedCubeState(faceColorMap));
  SOLVED_FAST_STATE_CACHE.set(cacheKey, solvedState);

  return solvedState;
}

function getFastStickerFaceCode(
  state: FastCubeState,
  pieceIndex: number | null,
  color: CubeColorName,
): number {
  if (pieceIndex === null) {
    return -1;
  }

  const stickerStart = state.stickerOffsets[pieceIndex];
  const stickerEnd = state.stickerOffsets[pieceIndex + 1];

  for (let stickerIndex = stickerStart; stickerIndex < stickerEnd; stickerIndex += 1) {
    const colorIndex = stickerIndex - stickerStart;

    if (state.stickerColors[pieceIndex][colorIndex] === color) {
      return state.stickerFaces[stickerIndex];
    }
  }

  return -1;
}

function getFastF2lPairStateKey(
  state: FastCubeState,
  candidate: F2lPairCandidate,
): string | null {
  const { cornerIndex, edgeIndex } = getFastF2lPairPieceIndexes(state, candidate);

  if (cornerIndex === null || edgeIndex === null) {
    return null;
  }

  const cornerOffset = cornerIndex * 3;
  const edgeOffset = edgeIndex * 3;

  return [
    state.coords[cornerOffset],
    state.coords[cornerOffset + 1],
    state.coords[cornerOffset + 2],
    getFastStickerFaceCode(state, cornerIndex, candidate.cornerColors[0]),
    getFastStickerFaceCode(state, cornerIndex, candidate.cornerColors[1]),
    getFastStickerFaceCode(state, cornerIndex, candidate.cornerColors[2]),
    state.coords[edgeOffset],
    state.coords[edgeOffset + 1],
    state.coords[edgeOffset + 2],
    getFastStickerFaceCode(state, edgeIndex, candidate.edgeColors[0]),
    getFastStickerFaceCode(state, edgeIndex, candidate.edgeColors[1]),
  ].join(",");
}

function getF2lSlotNameForCandidate(candidate: F2lPairCandidate): F2lSlotName {
  return getF2lSlotSpecByFaces(candidate.slotFaces).name;
}

function createBasicF2lAnalysisCache(): BasicF2lAnalysisCache {
  return {
    extractionCandidates: new Map(),
    basicMatches: new Map(),
    fastAlgorithms: new Map(),
    localSearches: new Map(),
  };
}

function getF2lPairCacheKey(candidate: F2lPairCandidate): string {
  return [
    candidate.id,
    candidate.slotFaces.join(""),
    candidate.cornerColors.join("-"),
    candidate.edgeColors.join("-"),
  ].join(":");
}

function getBasicF2lCacheKey(
  state: CubeState,
  candidate: F2lPairCandidate,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): string {
  return [
    getCubeStateSignature(state),
    getF2lPairCacheKey(candidate),
    crossColor,
    targetFace,
  ].join("::");
}

function getFastBasicF2lCacheKey(
  state: FastCubeState,
  candidate: F2lPairCandidate,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): string {
  return [
    getFastCubeStateSignature(state),
    getF2lPairCacheKey(candidate),
    crossColor,
    targetFace,
  ].join("::");
}

function getFastF2lPairCandidateBySlot(
  state: FastCubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  slotName: F2lSlotName,
): F2lPairCandidate | null {
  return (
    getFastF2lPairCandidates(state, crossColor, targetFace).find(
      (candidate) => getF2lSlotNameForCandidate(candidate) === slotName,
    ) ?? null
  );
}

function getBasicF2lReverseIndex(
  faceColorMap: Record<FaceName, CubeColorName>,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  slotName: F2lSlotName,
): Map<string, BasicF2lAlgorithmEntry[]> {
  const cacheKey = [
    getFaceColorMapCacheKey(faceColorMap),
    crossColor,
    targetFace,
    slotName,
  ].join("::");
  const cachedIndex = BASIC_F2L_REVERSE_INDEX_CACHE.get(cacheKey);

  if (cachedIndex) {
    return cachedIndex;
  }

  const index = new Map<string, BasicF2lAlgorithmEntry[]>();
  const solvedState = getSolvedFastCubeState(faceColorMap);
  const targetCandidate = getFastF2lPairCandidateBySlot(
    solvedState,
    crossColor,
    targetFace,
    slotName,
  );

  if (!targetCandidate) {
    BASIC_F2L_REVERSE_INDEX_CACHE.set(cacheKey, index);
    return index;
  }

  for (const entry of getBasicF2lAlgorithmEntries(slotName)) {
    const startState = applyFastAlgorithm(solvedState, invertAlgorithm(entry.moves));
    const stateKey = getFastF2lPairStateKey(startState, targetCandidate);

    if (!stateKey || !isFastCrossSolved(startState, crossColor, targetFace)) {
      continue;
    }

    const entries = index.get(stateKey) ?? [];

    if (!entries.some((existingEntry) => existingEntry.algorithm === entry.algorithm)) {
      entries.push(entry);
      entries.sort((a, b) => a.score - b.score || a.moveCount - b.moveCount);
      index.set(stateKey, entries);
    }
  }

  BASIC_F2L_REVERSE_INDEX_CACHE.set(cacheKey, index);

  return index;
}

function getCandidateSlotNamesForExtraction(state: CubeState, candidate: F2lPairCandidate): F2lSlotName[] {
  const { corner, edge } = getF2lPairPieces(state, candidate);
  const targetSlot = getF2lSlotNameForCandidate(candidate);
  const slots = [
    corner ? getF2lSlotNameFromCoord(corner.coord) : null,
    edge ? getF2lSlotNameFromCoord(edge.coord) : null,
    targetSlot,
    "FR",
    "FL",
    "BR",
    "BL",
  ];

  return slots.filter((slotName, index, values): slotName is F2lSlotName =>
    Boolean(slotName && values.indexOf(slotName) === index),
  );
}

function getFastCandidateSlotNamesForExtraction(
  state: FastCubeState,
  candidate: F2lPairCandidate,
): F2lSlotName[] {
  const { cornerIndex, edgeIndex } = getFastF2lPairPieceIndexes(state, candidate);
  const targetSlot = getF2lSlotNameForCandidate(candidate);
  const getCoordSlot = (pieceIndex: number | null) => {
    if (pieceIndex === null) {
      return null;
    }

    const coordOffset = pieceIndex * 3;

    return getF2lSlotNameFromCoord([
      state.coords[coordOffset],
      state.coords[coordOffset + 1],
      state.coords[coordOffset + 2],
    ]);
  };
  const slots = [
    getCoordSlot(cornerIndex),
    getCoordSlot(edgeIndex),
    targetSlot,
    "FR",
    "FL",
    "BR",
    "BL",
  ];

  return slots.filter((slotName, index, values): slotName is F2lSlotName =>
    Boolean(slotName && values.indexOf(slotName) === index),
  );
}

function getExtractionCandidatesForF2lPair(
  fastState: FastCubeState,
  candidate: F2lPairCandidate,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  cache?: BasicF2lAnalysisCache,
): F2lExtractionCandidate[] {
  const cacheKey = cache ? getFastBasicF2lCacheKey(fastState, candidate, crossColor, targetFace) : "";
  const cachedCandidates = cache?.extractionCandidates.get(cacheKey);

  if (cachedCandidates) {
    return cachedCandidates;
  }

  const candidates = new Map<string, F2lExtractionCandidate>();
  const addCandidate = (
    algorithm: string,
    moves: string[],
    nextFastState: FastCubeState,
    score: number,
  ) => {
    if (!isFastCrossSolved(nextFastState, crossColor, targetFace)) {
      return;
    }

    const key = `${algorithm}::${getFastCubeStateSignature(nextFastState)}`;
    const existing = candidates.get(key);

    if (!existing || score < existing.score) {
      candidates.set(key, {
        algorithm,
        moves,
        moveCount: moves.length,
        fastState: nextFastState,
        score,
      });
    }
  };

  addCandidate("", [], fastState, 0);

  for (const slotName of getFastCandidateSlotNamesForExtraction(fastState, candidate)) {
    for (const extraction of getF2lExtractionEntries(slotName)) {
      const nextFastState = applyCachedFastAlgorithm(fastState, extraction.moves, cache);

      if (areFastF2lPairPiecesOnU(nextFastState, candidate)) {
        addCandidate(extraction.algorithm, extraction.moves, nextFastState, extraction.score);
      }
    }
  }

  const sortedCandidates = [...candidates.values()].sort((a, b) => a.score - b.score);
  cache?.extractionCandidates.set(cacheKey, sortedCandidates);

  return sortedCandidates;
}

function findBasicF2lCaseForPair(
  state: FastCubeState,
  candidate: F2lPairCandidate,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  cache?: BasicF2lAnalysisCache,
  options: BasicF2lOrderAnalysisOptions = {},
): BasicF2lCaseMatch | null {
  const cacheKey = cache
    ? [getFastCubeStateSignature(state), getF2lPairCacheKey(candidate), crossColor, targetFace].join(
        "::",
      )
    : "";

  if (cache?.basicMatches.has(cacheKey)) {
    return cache.basicMatches.get(cacheKey) ?? null;
  }

  const slotName = getF2lSlotNameForCandidate(candidate);
  const stateKey = getFastF2lPairStateKey(state, candidate);
  const entries = stateKey
    ? getBasicF2lReverseIndex(state.faceColorMap, crossColor, targetFace, slotName).get(stateKey) ??
      []
    : [];
  const useLegacyFallback = options.useBasicF2lLegacyFallback !== false;

  const createMatchFromEntry = (entry: BasicF2lAlgorithmEntry): BasicF2lCaseMatch | null => {
    const nextState = applyCachedFastAlgorithm(state, entry.moves, cache);

    if (
      !isFastCrossSolved(nextState, crossColor, targetFace) ||
      !isFastF2lPairSolved(nextState, candidate)
    ) {
      return null;
    }

    return {
      caseItem: entry.caseItem,
      algorithm: entry.algorithm,
      moves: entry.moves,
      moveCount: entry.moveCount,
      fastStateAfterAlgorithm: nextState,
      score: entry.score,
    };
  };

  for (const entry of entries) {
    const match = createMatchFromEntry(entry);

    if (match) {
      cache?.basicMatches.set(cacheKey, match);
      return match;
    }
  }

  if (!useLegacyFallback) {
    cache?.basicMatches.set(cacheKey, null);
    return null;
  }

  for (const entry of getBasicF2lAlgorithmEntries(slotName)) {
    if (entries.some((indexedEntry) => indexedEntry.algorithm === entry.algorithm)) {
      continue;
    }

    const match = createMatchFromEntry(entry);

    if (match) {
      cache?.basicMatches.set(cacheKey, match);
      return match;
    }
  }

  cache?.basicMatches.set(cacheKey, null);

  return null;
}

function findLocalF2lSearchForPair(
  state: CubeState,
  candidate: F2lPairCandidate,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  cache?: BasicF2lAnalysisCache,
): LocalF2lSearchMatch | null {
  const cacheKey = cache ? getBasicF2lCacheKey(state, candidate, crossColor, targetFace) : "";

  if (cache?.localSearches.has(cacheKey)) {
    return cache.localSearches.get(cacheKey) ?? null;
  }

  const slotName = getF2lSlotNameForCandidate(candidate);
  const moves = F2L_LOCAL_SEARCH_MOVES[slotName];
  const nodeCounter = { count: 0 };

  const search = (
    currentState: CubeState,
    depthRemaining: number,
    path: string[],
    lastMove: string | null,
    seenPath: Set<string>,
  ): LocalF2lSearchMatch | null => {
    if (nodeCounter.count >= F2L_LOCAL_SEARCH_NODE_LIMIT) {
      return null;
    }

    nodeCounter.count += 1;

    if (path.length > 0 && isCrossSolved(currentState, crossColor, targetFace) && isF2lPairSolved(currentState, candidate)) {
      const moves = [...path];
      const algorithm = path.join(" ");

      return {
        algorithm,
        moves,
        moveCount: moves.length,
        stateAfterAlgorithm: currentState,
        score: getF2lMoveScore(moves),
        nodes: nodeCounter.count,
      };
    }

    if (depthRemaining === 0) {
      return null;
    }

    for (const move of moves) {
      if (lastMove && move[0] === lastMove[0]) {
        continue;
      }

      const nextState = applyMove(currentState, move);
      const signature = getCubeStateSignature(nextState);

      if (seenPath.has(signature)) {
        continue;
      }

      seenPath.add(signature);
      const result = search(nextState, depthRemaining - 1, [...path, move], move, seenPath);
      seenPath.delete(signature);

      if (result) {
        return result;
      }
    }

    return null;
  };

  for (let depth = 1; depth <= F2L_LOCAL_SEARCH_MAX_DEPTH; depth += 1) {
    const seenPath = new Set<string>([getCubeStateSignature(state)]);
    const result = search(state, depth, [], null, seenPath);

    if (result) {
      cache?.localSearches.set(cacheKey, result);
      return result;
    }
  }

  cache?.localSearches.set(cacheKey, null);
  return null;
}

function createBasicF2lStepBuildResult(
  candidate: BasicF2lStepCandidateBuild,
): BasicF2lStepBuildResult {
  return {
    step: {
      id: candidate.id,
      pairTitle: candidate.pairTitle,
      targetSlot: candidate.targetSlot,
      extractAlgorithm: candidate.extractAlgorithm,
      caseId: candidate.caseId,
      caseName: candidate.caseName,
      method: candidate.method,
      algorithm: candidate.algorithm,
      fullAlgorithm: candidate.fullAlgorithm,
      moveCount: candidate.moveCount,
      score: candidate.score,
      explanation: candidate.explanation,
      stateAfterStep:
        candidate.stateAfterStep ?? fastToCubeState(candidate.fastStateAfterStep),
    },
    fastStateAfterStep: candidate.fastStateAfterStep,
  };
}

function buildBasicF2lStepCandidate(
  state: CubeState,
  fastState: FastCubeState,
  candidate: F2lPairCandidate,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  stepIndex: number,
  cache?: BasicF2lAnalysisCache,
  options: BasicF2lOrderAnalysisOptions = {},
): BasicF2lStepBuildResult | null {
  const slotName = getF2lSlotNameForCandidate(candidate);
  let bestStep: BasicF2lStepCandidateBuild | null = null;
  let matchIndex = 0;
  const addStepCandidate = (step: BasicF2lStepCandidateBuild) => {
    if (
      !bestStep ||
      step.score < bestStep.score ||
      (step.score === bestStep.score && step.moveCount < bestStep.moveCount)
    ) {
      bestStep = step;
    }
  };
  const extractionCandidates = getExtractionCandidatesForF2lPair(
    fastState,
    candidate,
    crossColor,
    targetFace,
    cache,
  );

  for (const extraction of extractionCandidates) {
    const basicMatch = findBasicF2lCaseForPair(
      extraction.fastState,
      candidate,
      crossColor,
      targetFace,
      cache,
      options,
    );

    if (basicMatch) {
      const fullAlgorithm = joinAlgorithms(extraction.algorithm, basicMatch.algorithm);
      const moveCount = extraction.moveCount + basicMatch.moveCount;
      const score = extraction.score + basicMatch.score;

      addStepCandidate({
        id: `f2l-step-${stepIndex}-${candidate.id}-${matchIndex}`,
        pairTitle: candidate.title,
        targetSlot: slotName,
        extractAlgorithm: extraction.algorithm,
        caseId: basicMatch.caseItem.id,
        caseName: basicMatch.caseItem.name,
        method: "basic41",
        algorithm: basicMatch.algorithm,
        fullAlgorithm,
        moveCount,
        score,
        fastStateAfterStep: basicMatch.fastStateAfterAlgorithm,
        explanation: extraction.algorithm
          ? "対象ピースをU面へ取り出し、基本41ケースとして処理します。"
          : "対象コーナーとエッジを基本41ケースとしてスロットへ入れます。",
      });
      matchIndex += 1;
    }
  }

  if (bestStep) {
    return createBasicF2lStepBuildResult(bestStep);
  }

  if (options.useLocalSearch === false) {
    return null;
  }

  for (const extraction of extractionCandidates.slice(0, 10)) {
    const localSearchMatch = findLocalF2lSearchForPair(
      fastToCubeState(extraction.fastState),
      candidate,
      crossColor,
      targetFace,
      cache,
    );

    if (localSearchMatch) {
      const fastStateAfterStep = toFastCubeState(localSearchMatch.stateAfterAlgorithm);
      const fullAlgorithm = joinAlgorithms(extraction.algorithm, localSearchMatch.algorithm);
      const moveCount = extraction.moveCount + localSearchMatch.moveCount;
      const score = extraction.score + localSearchMatch.score + 6;

      addStepCandidate({
        id: `f2l-step-${stepIndex}-${candidate.id}-local-${matchIndex}`,
        pairTitle: candidate.title,
        targetSlot: slotName,
        extractAlgorithm: extraction.algorithm,
        caseId: "LOCAL_SEARCH",
        caseName: "局所探索フォールバック",
        method: "localSearch",
        algorithm: localSearchMatch.algorithm,
        fullAlgorithm,
        moveCount,
        score,
        fastStateAfterStep,
        stateAfterStep: localSearchMatch.stateAfterAlgorithm,
        explanation: extraction.algorithm
          ? "基本41の完全一致が弱い状態だったため、取り出し後に短い局所探索でペアを解きます。"
          : "基本41の候補で確定できない状態だったため、短い局所探索でペアを解きます。",
      });
      matchIndex += 1;
    }
  }

  if (!bestStep) {
    return null;
  }

  return createBasicF2lStepBuildResult(bestStep);
}

const F2L_ORDER_SLOTS: F2lSlotName[] = ["FR", "FL", "BR", "BL"];

function getF2lPlanRank(plan: BasicF2lAnalysisPlan): number {
  return plan.unresolvedPairs.length * 10_000 + plan.steps.reduce((sum, step) => sum + step.score, 0);
}

function compareBasicF2lPlans(a: BasicF2lAnalysisPlan, b: BasicF2lAnalysisPlan): number {
  return (
    getF2lPlanRank(a) - getF2lPlanRank(b) ||
    a.totalMoveCount - b.totalMoveCount ||
    a.order.join("").localeCompare(b.order.join(""))
  );
}

function getF2lSlotPermutations(slots: F2lSlotName[]): F2lSlotName[][] {
  if (slots.length <= 1) {
    return [slots];
  }

  return slots.flatMap((slot, index) =>
    getF2lSlotPermutations([...slots.slice(0, index), ...slots.slice(index + 1)]).map((rest) => [
      slot,
      ...rest,
    ]),
  );
}

const F2L_ORDER_PERMUTATIONS = getF2lSlotPermutations(F2L_ORDER_SLOTS);

function tryBuildBasicF2lPlan(
  initialState: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  strategy: "greedy" | "permutation",
  order?: F2lSlotName[],
  cache?: BasicF2lAnalysisCache,
  options: BasicF2lOrderAnalysisOptions = {},
  rankCutoff?: number,
): BasicF2lAnalysisPlan | null {
  let currentState = cloneCubeState(initialState);
  let currentFastState = toFastCubeState(currentState);
  const steps: BasicF2lAnalysisStep[] = [];
  const planOrder = order ?? F2L_ORDER_SLOTS;

  for (let stepIndex = 1; stepIndex <= 4; stepIndex += 1) {
    const unsolvedCandidates = getFastF2lPairCandidates(
      currentFastState,
      crossColor,
      targetFace,
    ).filter(
      (candidate) => candidate.status === "unsolved",
    );

    if (unsolvedCandidates.length === 0) {
      break;
    }

    const candidatesToTry = order
      ? unsolvedCandidates.filter(
          (candidate) =>
            getF2lSlotNameForCandidate(candidate) ===
            order.find((slotName) =>
              unsolvedCandidates.some(
                (unsolvedCandidate) => getF2lSlotNameForCandidate(unsolvedCandidate) === slotName,
              ),
            ),
        )
      : unsolvedCandidates;

    const stepCandidates = candidatesToTry
      .map((candidate) =>
        buildBasicF2lStepCandidate(
          currentState,
          currentFastState,
          candidate,
          crossColor,
          targetFace,
          stepIndex,
          cache,
          options,
        ),
      )
      .filter((result): result is BasicF2lStepBuildResult => Boolean(result))
      .sort((a, b) => a.step.score - b.step.score || a.step.moveCount - b.step.moveCount);

    const selectedResult = stepCandidates[0];
    if (!selectedResult) {
      break;
    }

    const selectedStep = selectedResult.step;
    steps.push(selectedStep);
    currentState = selectedStep.stateAfterStep;
    currentFastState = selectedResult.fastStateAfterStep;

    if (
      rankCutoff !== undefined &&
      steps.reduce((sum, step) => sum + step.score, 0) > rankCutoff
    ) {
      return null;
    }
  }

  const unresolvedPairs = getFastF2lPairCandidates(
    currentFastState,
    crossColor,
    targetFace,
  ).filter(
    (candidate) => candidate.status !== "completed",
  );
  const totalMoveCount = steps.reduce((sum, step) => sum + step.moveCount, 0);
  const totalScore = steps.reduce((sum, step) => sum + step.score, 0);

  return {
    id: `${strategy}-${planOrder.join("-")}`,
    order: planOrder,
    steps,
    finalState: currentState,
    unresolvedPairs,
    totalMoveCount,
    totalScore,
    note:
      unresolvedPairs.length === 0
        ? options.useLocalSearch === false
          ? "4ペアの順番を比較し、基本41と取り出しだけでF2L完成までつながりました。"
          : strategy === "permutation"
            ? "4ペアの順番を比較し、基本41と短い局所探索でF2L完成までつながりました。"
            : "基本41候補と短い局所探索でF2L完成までつながりました。"
        : options.useLocalSearch === false
          ? "基本41と取り出しだけで先に比較しました。未解決が残る場合は補助探索で更新します。"
          : "一部のペアはまだ確定できませんでした。追加F2L・裏F2L・より深い探索を足すとさらに改善できます。",
    strategy,
  };
}

function buildBasicF2lPlan(
  initialState: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  strategy: "greedy" | "permutation",
  order?: F2lSlotName[],
  cache?: BasicF2lAnalysisCache,
  options: BasicF2lOrderAnalysisOptions = {},
): BasicF2lAnalysisPlan {
  const plan = tryBuildBasicF2lPlan(
    initialState,
    crossColor,
    targetFace,
    strategy,
    order,
    cache,
    options,
  );

  if (!plan) {
    throw new Error("F2Lプランの作成に失敗しました。");
  }

  return plan;
}

function analyzeBasicF2lOrderPlansWithCache(
  initialState: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  cache: BasicF2lAnalysisCache,
  options: BasicF2lOrderAnalysisOptions = {},
): BasicF2lOrderAnalysisResult {
  const plans = F2L_ORDER_PERMUTATIONS
    .map((order) =>
      tryBuildBasicF2lPlan(
        initialState,
        crossColor,
        targetFace,
        "permutation",
        order,
        cache,
        options,
      ),
    )
    .filter((plan): plan is BasicF2lAnalysisPlan => Boolean(plan))
    .sort(compareBasicF2lPlans);

  return {
    plans,
    comparedOrderCount: F2L_ORDER_PERMUTATIONS.length,
  };
}

function analyzeBasicF2lBestOrderPlanWithCache(
  initialState: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  cache: BasicF2lAnalysisCache,
  options: BasicF2lOrderAnalysisOptions = {},
): BasicF2lOrderAnalysisResult {
  let bestPlan: BasicF2lAnalysisPlan | null = null;

  for (const order of F2L_ORDER_PERMUTATIONS) {
    const plan = tryBuildBasicF2lPlan(
      initialState,
      crossColor,
      targetFace,
      "permutation",
      order,
      cache,
      options,
      bestPlan ? getF2lPlanRank(bestPlan) : undefined,
    );

    if (plan && (!bestPlan || compareBasicF2lPlans(plan, bestPlan) < 0)) {
      bestPlan = plan;
    }
  }

  return {
    plans: bestPlan ? [bestPlan] : [],
    comparedOrderCount: F2L_ORDER_PERMUTATIONS.length,
  };
}

export function analyzeBasicF2lOrderPlans(
  initialState: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  options: BasicF2lOrderAnalysisOptions = {},
): BasicF2lOrderAnalysisResult {
  return analyzeBasicF2lOrderPlansWithCache(
    initialState,
    crossColor,
    targetFace,
    createBasicF2lAnalysisCache(),
    options,
  );
}

export function analyzeBasicF2lBestOrderPlan(
  initialState: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
  options: BasicF2lOrderAnalysisOptions = {},
): BasicF2lOrderAnalysisResult {
  return analyzeBasicF2lBestOrderPlanWithCache(
    initialState,
    crossColor,
    targetFace,
    createBasicF2lAnalysisCache(),
    options,
  );
}

export function analyzeBasicF2lPlan(
  initialState: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): BasicF2lAnalysisPlan {
  const cache = createBasicF2lAnalysisCache();
  const greedyPlan = buildBasicF2lPlan(
    initialState,
    crossColor,
    targetFace,
    "greedy",
    undefined,
    cache,
    {},
  );
  const bestPermutationPlan = analyzeBasicF2lOrderPlansWithCache(
    initialState,
    crossColor,
    targetFace,
    cache,
    {},
  ).plans[0];

  if (!bestPermutationPlan) {
    return greedyPlan;
  }

  return [greedyPlan, bestPermutationPlan].sort(
    (a, b) => getF2lPlanRank(a) - getF2lPlanRank(b) || a.totalMoveCount - b.totalMoveCount,
  )[0];
}

export function getColorJapanese(color: CubeColorName): string {
  const labels: Record<CubeColorName, string> = {
    white: "白",
    yellow: "黄",
    blue: "青",
    green: "緑",
    red: "赤",
    orange: "橙",
  };

  return labels[color];
}
