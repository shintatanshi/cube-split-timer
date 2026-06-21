import { getMoveDescriptor, type MoveAxis, type MoveDescriptor } from "./moveNotation";

type FaceName = "U" | "D" | "F" | "B" | "R" | "L";
type Vec3 = [number, number, number];
type FaceOrientation = Record<FaceName, FaceName>;

export interface ViewpointMoveStep {
  move: string;
  descriptor: MoveDescriptor | null;
  isViewpointChange: boolean;
}

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

const POSITIVE_AXIS_FACE: Record<MoveAxis, FaceName> = {
  x: "R",
  y: "U",
  z: "F",
};

function createDefaultOrientation(): FaceOrientation {
  return {
    U: "U",
    D: "D",
    F: "F",
    B: "B",
    R: "R",
    L: "L",
  };
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

function rotateFace(face: FaceName, axis: MoveAxis, angle: number): FaceName {
  return getFaceFromVector(rotateVector(FACE_VECTORS[face], axis, angle));
}

function updateOrientation(
  orientation: FaceOrientation,
  axis: MoveAxis,
  angle: number,
): FaceOrientation {
  const nextOrientation = { ...orientation };

  (Object.keys(nextOrientation) as FaceName[]).forEach((fixedFace) => {
    nextOrientation[fixedFace] = rotateFace(nextOrientation[fixedFace], axis, angle);
  });

  return nextOrientation;
}

function getFixedAxisForWorldAxis(
  orientation: FaceOrientation,
  worldAxis: MoveAxis,
): { axis: MoveAxis; sign: 1 | -1 } {
  const positiveWorldFace = POSITIVE_AXIS_FACE[worldAxis];
  const fixedFace =
    (Object.keys(orientation) as FaceName[]).find(
      (face) => orientation[face] === positiveWorldFace,
    ) ?? positiveWorldFace;
  const fixedVector = FACE_VECTORS[fixedFace];

  if (fixedVector[0] !== 0) {
    return { axis: "x", sign: fixedVector[0] as 1 | -1 };
  }

  if (fixedVector[1] !== 0) {
    return { axis: "y", sign: fixedVector[1] as 1 | -1 };
  }

  return { axis: "z", sign: fixedVector[2] as 1 | -1 };
}

function mapDescriptorToFixedView(
  descriptor: MoveDescriptor,
  orientation: FaceOrientation,
): MoveDescriptor {
  const fixedAxis = getFixedAxisForWorldAxis(orientation, descriptor.axis);

  return {
    ...descriptor,
    axis: fixedAxis.axis,
    layers: descriptor.layers
      .map((layer) => layer * fixedAxis.sign)
      .sort((a, b) => a - b),
    angle: descriptor.angle * fixedAxis.sign,
  };
}

export function reverseMoveDescriptor(descriptor: MoveDescriptor): MoveDescriptor {
  return {
    ...descriptor,
    angle: -descriptor.angle,
  };
}

export function createViewpointMoveSteps(moves: string[]): ViewpointMoveStep[] {
  let orientation = createDefaultOrientation();

  return moves.map((move) => {
    const descriptor = getMoveDescriptor(move);

    if (!descriptor) {
      return { move, descriptor: null, isViewpointChange: false };
    }

    if (descriptor.family === "rotation") {
      orientation = updateOrientation(orientation, descriptor.axis, descriptor.angle);
      return { move, descriptor: null, isViewpointChange: true };
    }

    return {
      move,
      descriptor: mapDescriptorToFixedView(descriptor, orientation),
      isViewpointChange: false,
    };
  });
}

export function createInverseViewpointDescriptors(moves: string[]): MoveDescriptor[] {
  return createViewpointMoveSteps(moves)
    .flatMap((step) => (step.descriptor ? [step.descriptor] : []))
    .reverse()
    .map(reverseMoveDescriptor);
}
