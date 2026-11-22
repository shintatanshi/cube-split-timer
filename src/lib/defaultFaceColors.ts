import type { CubeColorName, CubeFaceName } from "./cubeVisuals";

/**
 * Default face-to-color mapping used by the timer and analyzer (U=Yellow, D=White, F=Blue, B=Green, R=Red, L=Orange).
 */
export const DEFAULT_FACE_COLOR_MAP: Record<CubeFaceName, CubeColorName> = {
  U: "yellow",
  D: "white",
  F: "blue",
  B: "green",
  R: "red",
  L: "orange",
};

export const COLOR_JAPANESE_LABELS: Record<CubeColorName, string> = {
  white: "白",
  yellow: "黄",
  blue: "青",
  green: "緑",
  red: "赤",
  orange: "橙",
};

export function getDefaultColorJapanese(color: CubeColorName): string {
  return COLOR_JAPANESE_LABELS[color];
}

export function getFaceColorJapanese(
  face: CubeFaceName,
  faceColorMap: Record<CubeFaceName, CubeColorName> = DEFAULT_FACE_COLOR_MAP,
): string {
  return COLOR_JAPANESE_LABELS[faceColorMap[face]];
}

export function normalizeCubeColorName(value: string | null | undefined): CubeColorName | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized in COLOR_JAPANESE_LABELS) {
    return normalized as CubeColorName;
  }

  return null;
}

export function getFaceForCubeColor(
  color: CubeColorName,
  faceColorMap: Record<CubeFaceName, CubeColorName> = DEFAULT_FACE_COLOR_MAP,
): CubeFaceName | null {
  const faces = Object.keys(faceColorMap) as CubeFaceName[];
  return faces.find((face) => faceColorMap[face] === color) ?? null;
}
