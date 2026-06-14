import { getMoveDescriptor } from "../learn/moveNotation";

export type CubeColorName = "white" | "yellow" | "blue" | "green" | "red" | "orange";
export type FaceName = "U" | "D" | "F" | "B" | "R" | "L";
export type TargetFace = "D" | "U";
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

export interface CrossSearchInput {
  crossColor: CubeColorName;
  targetFace: TargetFace;
  faceColorMap: Record<FaceName, CubeColorName>;
  scrambleMoves: string[];
  maxDepth?: number;
  maxSolutions?: number;
  maxNodes?: number;
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

const SIDE_FACES: FaceName[] = ["F", "R", "B", "L"];
const CROSS_LOCATION_BASE = 24;
const CROSS_PRUNING_STATE_COUNT = CROSS_LOCATION_BASE ** SIDE_FACES.length;
const CROSS_PRUNING_UNKNOWN_DISTANCE = 255;

const F2L_SLOT_FACE_PAIRS: Array<[FaceName, FaceName]> = [
  ["F", "R"],
  ["R", "B"],
  ["B", "L"],
  ["L", "F"],
];

export const CROSS_SEARCH_MAX_DEPTH = 8;
export const CROSS_SEARCH_NODE_LIMIT = 1_200_000;

const CROSS_PRUNING_TABLES = new Map<TargetFace, CrossPruningTable>();

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

export function applyMove(state: CubeState, move: string): CubeState {
  const descriptor = getMoveDescriptor(move);

  if (!descriptor) {
    return cloneCubeState(state);
  }

  const nextState = cloneCubeState(state);

  nextState.pieces.forEach((piece) => {
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

  return nextState;
}

export function applyAlgorithm(state: CubeState, moves: string[]): CubeState {
  return moves.reduce((nextState, move) => applyMove(nextState, move), state);
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

function getStickerFace(piece: CubePiece | null, color: CubeColorName): FaceName | null {
  return piece?.stickers.find((sticker) => sticker.color === color)?.face ?? null;
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

export function getCrossEdgeStatuses(
  state: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): CrossEdgeStatus[] {
  return SIDE_FACES.map((sideFace) => {
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
  return getCrossEdgeStatuses(state, crossColor, targetFace).every((edge) => edge.solved);
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
  return SIDE_FACES.map((sideFace) => {
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
  return SIDE_FACES.map((sideFace) => {
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
  const descriptor = getMoveDescriptor(move);
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
  input: Required<CrossSearchInput>,
  path: string[],
  index: number,
  nodes: number,
): CrossSolution {
  const stateAfterCross = applyAlgorithm(
    createSolvedCubeState(input.faceColorMap),
    [...input.scrambleMoves, ...path],
  );

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
  return SIDE_FACES.map((sideFace) => ({
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
  input: Required<CrossSearchInput>,
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
  const normalizedInput: Required<CrossSearchInput> = {
    maxDepth: CROSS_SEARCH_MAX_DEPTH,
    maxSolutions: 5,
    maxNodes: CROSS_SEARCH_NODE_LIMIT,
    ...input,
  };
  const solvedEdges = createSolvedCrossEdgeState(
    normalizedInput.faceColorMap,
    normalizedInput.crossColor,
    normalizedInput.targetFace,
  );
  const solvedKey = encodeCrossEdgeStateKey(solvedEdges);
  const scrambledKey = applyAlgorithmToCrossStateKey(solvedKey, normalizedInput.scrambleMoves);
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

  return F2L_SLOT_FACE_PAIRS.map(([firstFace, secondFace], index) => {
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
      slotLabel: `${firstFace}${secondFace} slot`,
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
