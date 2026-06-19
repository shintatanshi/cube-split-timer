import { isCrossSolved } from "./cubeState";
import type {
  CubeColorName,
  CubePiece,
  CubeState,
  FaceName,
  F2lPairCandidate,
  F2lSlotName,
  PieceKind,
  TargetFace,
  Vec3,
} from "./cubeState";
import type { F2lProtectedSlot, F2lSinglePairSearchOptions } from "./f2lSearchTypes";

const FACE_VECTORS: Record<FaceName, Vec3> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

const F2L_SLOT_SPECS: Record<
  F2lSlotName,
  {
    name: F2lSlotName;
    faces: [FaceName, FaceName];
    cornerFaces: [TargetFace, FaceName, FaceName];
    edgeFaces: [FaceName, FaceName];
  }
> = {
  FR: { name: "FR", faces: ["F", "R"], cornerFaces: ["D", "F", "R"], edgeFaces: ["F", "R"] },
  BR: { name: "BR", faces: ["R", "B"], cornerFaces: ["D", "R", "B"], edgeFaces: ["R", "B"] },
  BL: { name: "BL", faces: ["B", "L"], cornerFaces: ["D", "B", "L"], edgeFaces: ["B", "L"] },
  FL: { name: "FL", faces: ["L", "F"], cornerFaces: ["D", "L", "F"], edgeFaces: ["L", "F"] },
};

function addVectors(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
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

function getStickerFace(piece: CubePiece | null, color: CubeColorName): FaceName | null {
  return piece?.stickers.find((sticker) => sticker.color === color)?.face ?? null;
}

function getExpectedCoord(faces: FaceName[]): Vec3 {
  return faces.reduce<Vec3>((coord, face) => addVectors(coord, FACE_VECTORS[face]), [0, 0, 0]);
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

  const expectedCoord = getExpectedCoord(faces);

  return (
    sameCoord(piece.coord, expectedCoord) &&
    colors.every((color) => {
      const targetFace = faces.find((face) => state.faceColorMap[face] === color);

      return targetFace !== undefined && getStickerFace(piece, color) === targetFace;
    })
  );
}

function getSlotSpecByFaces(slotFaces: [FaceName, FaceName]) {
  return (
    Object.values(F2L_SLOT_SPECS).find(
      (slot) =>
        (slot.faces[0] === slotFaces[0] && slot.faces[1] === slotFaces[1]) ||
        (slot.faces[0] === slotFaces[1] && slot.faces[1] === slotFaces[0]),
    ) ?? F2L_SLOT_SPECS.FR
  );
}

export function getF2lTargetSlotName(pair: F2lPairCandidate): F2lSlotName {
  return getSlotSpecByFaces(pair.slotFaces).name;
}

export function isF2lSlotSolved(
  state: CubeState,
  slotName: F2lSlotName,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): boolean {
  if (targetFace !== "D") {
    return false;
  }

  const slotSpec = F2L_SLOT_SPECS[slotName];
  const [firstFace, secondFace] = slotSpec.faces;
  const firstColor = state.faceColorMap[firstFace];
  const secondColor = state.faceColorMap[secondFace];
  const cornerColors = [crossColor, firstColor, secondColor];
  const edgeColors = [firstColor, secondColor];

  return (
    isPieceSolvedAtFaces(state, "corner", cornerColors, slotSpec.cornerFaces) &&
    isPieceSolvedAtFaces(state, "edge", edgeColors, slotSpec.edgeFaces)
  );
}

export function isF2lPairSolvedInTargetSlot(state: CubeState, pair: F2lPairCandidate): boolean {
  if (pair.targetFace !== "D") {
    return false;
  }

  const slotSpec = getSlotSpecByFaces(pair.slotFaces);

  return (
    isPieceSolvedAtFaces(state, "corner", pair.cornerColors, slotSpec.cornerFaces) &&
    isPieceSolvedAtFaces(state, "edge", pair.edgeColors, slotSpec.edgeFaces)
  );
}

export function getSolvedF2lProtectedSlots(
  state: CubeState,
  crossColor: CubeColorName,
  targetFace: TargetFace,
): F2lProtectedSlot[] {
  return (Object.keys(F2L_SLOT_SPECS) as F2lSlotName[])
    .filter((slotName) => isF2lSlotSolved(state, slotName, crossColor, targetFace))
    .map((slotName) => ({
      slotName,
      reason: "alreadySolved",
    }));
}

export function areProtectedF2lSlotsStillSolved(
  state: CubeState,
  protectedSlots: F2lProtectedSlot[],
  crossColor: CubeColorName,
  targetFace: TargetFace,
): boolean {
  return protectedSlots.every((protectedSlot) =>
    isF2lSlotSolved(state, protectedSlot.slotName, crossColor, targetFace),
  );
}

export function getBrokenProtectedF2lSlots(
  state: CubeState,
  protectedSlots: F2lProtectedSlot[],
  crossColor: CubeColorName,
  targetFace: TargetFace,
): F2lProtectedSlot[] {
  return protectedSlots.filter(
    (protectedSlot) => !isF2lSlotSolved(state, protectedSlot.slotName, crossColor, targetFace),
  );
}

export function isF2lSearchGoalState(
  state: CubeState,
  pair: F2lPairCandidate,
  options: F2lSinglePairSearchOptions,
): boolean {
  if (!isCrossSolved(state, options.crossColor, options.targetFace)) {
    return false;
  }

  if (!isF2lPairSolvedInTargetSlot(state, pair)) {
    return false;
  }

  if (!options.protectSolvedSlots) {
    return true;
  }

  return areProtectedF2lSlotsStillSolved(
    state,
    options.protectedSlots ?? [],
    options.crossColor,
    options.targetFace,
  );
}

export function getF2lSearchGuardMessages(
  state: CubeState,
  pair: F2lPairCandidate,
  options: F2lSinglePairSearchOptions,
): string[] {
  const messages: string[] = [];

  if (!isCrossSolved(state, options.crossColor, options.targetFace)) {
    messages.push("Crossが完成状態ではありません。");
  }

  if (!isF2lPairSolvedInTargetSlot(state, pair)) {
    messages.push("対象F2Lペアが目的スロットに完成していません。");
  }

  if (options.protectSolvedSlots) {
    const brokenSlots = getBrokenProtectedF2lSlots(
      state,
      options.protectedSlots ?? [],
      options.crossColor,
      options.targetFace,
    );

    brokenSlots.forEach((slot) => {
      messages.push(`保護対象の${slot.slotName}スロットが崩れています。`);
    });
  }

  return messages;
}