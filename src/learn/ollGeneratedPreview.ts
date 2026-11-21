import type { LearningSticker } from "../types";
import { getMoveDescriptor, invertAlgorithm, parseAlgorithm } from "./moveNotation";

type FaceName = "U" | "D" | "F" | "B" | "R" | "L";
type CubeColorName = "white" | "yellow" | "blue" | "green" | "red" | "orange";
type Vec3 = [number, number, number];

interface CubieSticker {
  color: CubeColorName;
  face: FaceName;
}

interface CubePiece {
  coord: Vec3;
  stickers: CubieSticker[];
}

interface PreviewCubeState {
  pieces: CubePiece[];
}

export interface GeneratedOllPreview {
  imageUrl: string;
  top: LearningSticker[];
  side: LearningSticker[];
  invalidTokens: string[];
}

const FACE_VECTORS: Record<FaceName, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

const FACE_COLOR_MAP: Record<FaceName, CubeColorName> = {
  U: "yellow",
  D: "white",
  F: "blue",
  B: "green",
  R: "red",
  L: "orange",
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

const VECTOR_FACES = new Map<string, FaceName>(
  Object.entries(FACE_VECTORS).map(([face, vector]) => [vectorKey(vector), face as FaceName]),
);

function vectorKey(vector: Vec3): string {
  return vector.join(",");
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

function createPiece(coord: Vec3): CubePiece {
  const stickers = (Object.entries(FACE_VECTORS) as Array<[FaceName, Vec3]>)
    .filter(([, vector]) => coord[0] * vector[0] + coord[1] * vector[1] + coord[2] * vector[2] > 0)
    .map(([face]) => ({ color: FACE_COLOR_MAP[face], face }));

  return { coord: [...coord], stickers };
}

function createSolvedCubeState(): PreviewCubeState {
  const pieces: CubePiece[] = [];

  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        const nonZeroCount = [x, y, z].filter((value) => value !== 0).length;

        if (nonZeroCount === 2 || nonZeroCount === 3) {
          pieces.push(createPiece([x, y, z]));
        }
      }
    }
  }

  return { pieces };
}

function cloneCubeState(state: PreviewCubeState): PreviewCubeState {
  return {
    pieces: state.pieces.map((piece) => ({
      coord: [...piece.coord],
      stickers: piece.stickers.map((sticker) => ({ ...sticker })),
    })),
  };
}

function applyMoveToMutableState(state: PreviewCubeState, move: string): void {
  const descriptor = getMoveDescriptor(move);

  if (!descriptor) {
    return;
  }

  state.pieces.forEach((piece) => {
    if (!descriptor.layers.includes(getAxisCoord(piece.coord, descriptor.axis))) {
      return;
    }

    piece.coord = rotateVector(piece.coord, descriptor.axis, descriptor.angle);
    piece.stickers = piece.stickers.map((sticker) => ({
      color: sticker.color,
      face: getFaceFromVector(rotateVector(FACE_VECTORS[sticker.face], descriptor.axis, descriptor.angle)),
    }));
  });
}

function applyAlgorithm(state: PreviewCubeState, moves: string[]): PreviewCubeState {
  const nextState = cloneCubeState(state);

  moves.forEach((move) => applyMoveToMutableState(nextState, move));

  return nextState;
}

function cubeStateToStickerColorGrid(state: PreviewCubeState): Record<FaceName, CubeColorName[]> {
  const grid: Record<FaceName, CubeColorName[]> = {
    U: Array<CubeColorName>(9).fill(FACE_COLOR_MAP.U),
    D: Array<CubeColorName>(9).fill(FACE_COLOR_MAP.D),
    F: Array<CubeColorName>(9).fill(FACE_COLOR_MAP.F),
    B: Array<CubeColorName>(9).fill(FACE_COLOR_MAP.B),
    R: Array<CubeColorName>(9).fill(FACE_COLOR_MAP.R),
    L: Array<CubeColorName>(9).fill(FACE_COLOR_MAP.L),
  };

  state.pieces.forEach((piece) => {
    piece.stickers.forEach((sticker) => {
      const index = FACE_STICKER_INDEX_BY_COORD.get(`${sticker.face}:${vectorKey(piece.coord)}`);

      if (index !== undefined) {
        grid[sticker.face][index] = sticker.color;
      }
    });
  });

  return grid;
}

function toSticker(color: CubeColorName): LearningSticker {
  return color === "yellow" ? "primary" : "muted";
}

function createSvgSticker(sticker: LearningSticker, x: number, y: number, width: number, height: number): string {
  const fill = sticker === "primary" ? "#fff200" : "#555b62";

  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" stroke="#000000" stroke-width="2" shape-rendering="crispEdges" />`;
}

function createOllSvg(top: LearningSticker[], side: LearningSticker[]): string {
  const cell = 20;
  const sideHeight = 10;
  const start = 34;
  const svgSize = 128;
  const back = side.slice(0, 3);
  const right = side.slice(3, 6);
  const front = side.slice(6, 9);
  const left = side.slice(9, 12);
  const rects: string[] = [];

  back.forEach((sticker, index) => {
    rects.push(createSvgSticker(sticker, start + index * cell, start - sideHeight, cell, sideHeight));
  });

  front.forEach((sticker, index) => {
    rects.push(createSvgSticker(sticker, start + index * cell, start + 3 * cell, cell, sideHeight));
  });

  left.forEach((sticker, index) => {
    rects.push(createSvgSticker(sticker, start - sideHeight, start + index * cell, sideHeight, cell));
  });

  right.forEach((sticker, index) => {
    rects.push(createSvgSticker(sticker, start + 3 * cell, start + index * cell, sideHeight, cell));
  });

  top.forEach((sticker, index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;
    rects.push(createSvgSticker(sticker, start + column * cell, start + row * cell, cell, cell));
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" role="img">`,
    `<rect x="0" y="0" width="${svgSize}" height="${svgSize}" fill="#ffffff" />`,
    ...rects,
    "</svg>",
  ].join("");
}

function createImageDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createGeneratedOllPreview(algorithm: string): GeneratedOllPreview {
  const parsed = parseAlgorithm(algorithm);
  const inverseMoves = invertAlgorithm(parsed.moves);
  const state = applyAlgorithm(createSolvedCubeState(), inverseMoves);
  const grid = cubeStateToStickerColorGrid(state);
  const top = grid.U.map(toSticker);
  const back = [grid.B[2], grid.B[1], grid.B[0]].map(toSticker);
  const right = [grid.R[2], grid.R[1], grid.R[0]].map(toSticker);
  const front = [grid.F[0], grid.F[1], grid.F[2]].map(toSticker);
  const left = [grid.L[0], grid.L[1], grid.L[2]].map(toSticker);
  const side = [...back, ...right, ...front, ...left];

  return {
    imageUrl: createImageDataUrl(createOllSvg(top, side)),
    top,
    side,
    invalidTokens: parsed.invalidTokens,
  };
}
