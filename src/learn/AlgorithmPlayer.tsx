import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import type {
  CubeCoord,
  CubeFaceName,
  F2lSlotName,
  F2lPieceSpot,
  LearningCase,
  LearningSticker,
  PllArrow,
} from "../types";
import {
  getMoveDescriptor,
  invertAlgorithm,
  parseAlgorithm,
} from "./moveNotation";
import type { MoveAxis, MoveDescriptor } from "./moveNotation";

interface AlgorithmPlayerProps {
  caseItem: LearningCase;
  headingLabel?: string;
  headingTitle?: string;
  showFocusLegend?: boolean;
  startMode?: "inverse" | "solved";
}

interface Cubie {
  id: string;
  group: THREE.Group;
  coord: THREE.Vector3;
}

interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cubeGroup: THREE.Group;
  cubies: Cubie[];
  frameId: number;
  resizeObserver: ResizeObserver;
  animationStart: number;
}

type SpeedOption = 0.25 | 0.5 | 1 | 1.5 | 2;
type F2lTargetRole = "corner" | "edge";

interface F2lSlotSpec {
  name: F2lSlotName;
  slot: "right" | "left" | "back" | "wrong";
  cornerCoord: CubeCoord;
  edgeCoord: CubeCoord;
  centers: CubeFaceName[];
}

interface ResolvedF2lFocus {
  slot: F2lSlotSpec;
  targetIds: Set<string>;
  roleById: Map<string, F2lTargetRole>;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startRotationX: number;
  startRotationY: number;
}

interface CaseStartStateOptions {
  resetView: boolean;
}

const SPEED_STORAGE_KEY = "cubeSplitTimer.learnPlayerSpeed.v1";
const SPEED_OPTIONS: SpeedOption[] = [0.25, 0.5, 1, 1.5, 2];
const BASE_PLAY_DELAY_MS = 180;
const BASE_TURN_DURATION_MS = 440;
const AUTO_RESET_DELAY_MS = 2000;
const INITIAL_VIEW_ROTATION = {
  x: -0.13,
  y: -0.22,
  z: 0,
};
const CUBE_COLORS = {
  U: 0xffe04f,
  D: 0xf4f7fb,
  F: 0x347dff,
  B: 0x32c36c,
  R: 0xff5b4a,
  L: 0xff9b42,
  body: 0x111827,
  dim: 0x4f5c70,
  corner: 0xff7b63,
  edge: 0x58b1ff,
  slot: 0xffd166,
};

const NORMAL_CAMERA_DISTANCE = 8.8;
const FULLSCREEN_CAMERA_DISTANCE = 7.8;

const SPOT_TO_COORD: Record<F2lPieceSpot, [number, number, number]> = {
  topLeft: [-1, 1, 1],
  top: [0, 1, 1],
  topRight: [1, 1, 1],
  left: [-1, 0, 1],
  center: [0, 0, 1],
  right: [1, 0, 1],
  bottomLeft: [-1, -1, 1],
  bottom: [0, -1, 1],
  bottomRight: [1, -1, 1],
};

const F2L_SLOT_SPECS: F2lSlotSpec[] = [
  {
    name: "FR",
    slot: "right",
    cornerCoord: [1, -1, 1],
    edgeCoord: [1, 0, 1],
    centers: ["F", "R", "D"],
  },
  {
    name: "FL",
    slot: "left",
    cornerCoord: [-1, -1, 1],
    edgeCoord: [-1, 0, 1],
    centers: ["F", "L", "D"],
  },
  {
    name: "BR",
    slot: "back",
    cornerCoord: [1, -1, -1],
    edgeCoord: [1, 0, -1],
    centers: ["B", "R", "D"],
  },
  {
    name: "BL",
    slot: "wrong",
    cornerCoord: [-1, -1, -1],
    edgeCoord: [-1, 0, -1],
    centers: ["B", "L", "D"],
  },
];

const F2L_SLOT_BY_NAME = new Map(F2L_SLOT_SPECS.map((slot) => [slot.name, slot]));

function loadSpeedPreference(): SpeedOption {
  try {
    const raw = localStorage.getItem(SPEED_STORAGE_KEY);
    const parsed = Number(raw);

    return SPEED_OPTIONS.includes(parsed as SpeedOption) ? (parsed as SpeedOption) : 1;
  } catch {
    return 1;
  }
}

function saveSpeedPreference(speed: SpeedOption): void {
  try {
    localStorage.setItem(SPEED_STORAGE_KEY, String(speed));
  } catch {
    // Speed preference is nice-to-have; the player should still work.
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function getAxisVector(axis: MoveAxis): THREE.Vector3 {
  if (axis === "x") {
    return new THREE.Vector3(1, 0, 0);
  }

  if (axis === "y") {
    return new THREE.Vector3(0, 1, 0);
  }

  return new THREE.Vector3(0, 0, 1);
}

function roundCoord(value: number): number {
  return Math.max(-1, Math.min(1, Math.round(value)));
}

function isSameCoord(coord: THREE.Vector3, target: CubeCoord): boolean {
  return coord.x === target[0] && coord.y === target[1] && coord.z === target[2];
}

function coordKey(coord: CubeCoord | THREE.Vector3): string {
  if (coord instanceof THREE.Vector3) {
    return `${roundCoord(coord.x)},${roundCoord(coord.y)},${roundCoord(coord.z)}`;
  }

  return coord.join(",");
}

function getCubieIdFromCoord(coord: CubeCoord | THREE.Vector3): string {
  const values =
    coord instanceof THREE.Vector3
      ? [roundCoord(coord.x), roundCoord(coord.y), roundCoord(coord.z)]
      : coord;
  const nonZeroCount = values.filter((value) => value !== 0).length;
  const kind = nonZeroCount === 3 ? "corner" : nonZeroCount === 2 ? "edge" : "other";

  return `${kind}:${values.join(",")}`;
}

function getSlotFromCoords(cornerCoord: CubeCoord, edgeCoord: CubeCoord): F2lSlotSpec | null {
  return (
    F2L_SLOT_SPECS.find(
      (slot) =>
        slot.cornerCoord.join(",") === cornerCoord.join(",") &&
        slot.edgeCoord.join(",") === edgeCoord.join(","),
    ) ?? null
  );
}

function createVirtualCubies() {
  const cubies: Array<{ id: string; coord: THREE.Vector3 }> = [];

  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        cubies.push({ id: getCubieIdFromCoord([x, y, z]), coord: new THREE.Vector3(x, y, z) });
      }
    }
  }

  return cubies;
}

function applyVirtualMove(cubies: Array<{ id: string; coord: THREE.Vector3 }>, move: string) {
  const descriptor = getMoveDescriptor(move);

  if (!descriptor) {
    return;
  }

  const matrix = new THREE.Matrix4().makeRotationAxis(getAxisVector(descriptor.axis), descriptor.angle);

  cubies.forEach((cubie) => {
    if (!descriptor.layers.includes(roundCoord(cubie.coord[descriptor.axis]))) {
      return;
    }

    cubie.coord.applyMatrix4(matrix);
    cubie.coord.set(
      roundCoord(cubie.coord.x),
      roundCoord(cubie.coord.y),
      roundCoord(cubie.coord.z),
    );
  });
}

function inferF2lTargetSlot(moves: string[]): F2lSlotSpec | null {
  const cubies = createVirtualCubies();
  invertAlgorithm(moves).forEach((move) => applyVirtualMove(cubies, move));
  const scoredSlots = F2L_SLOT_SPECS.map((slot) => {
    const corner = cubies.find((cubie) => cubie.id === getCubieIdFromCoord(slot.cornerCoord));
    const edge = cubies.find((cubie) => cubie.id === getCubieIdFromCoord(slot.edgeCoord));
    const cornerMoved = corner && !isSameCoord(corner.coord, slot.cornerCoord);
    const edgeMoved = edge && !isSameCoord(edge.coord, slot.edgeCoord);

    return {
      slot,
      score: (cornerMoved ? 2 : 0) + (edgeMoved ? 2 : 0),
    };
  }).sort((a, b) => b.score - a.score);

  return scoredSlots[0]?.score ? scoredSlots[0].slot : null;
}

function normalizeManualCubieId(value: string | undefined, role: F2lTargetRole): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(`${role}:`)) {
    return trimmed;
  }

  if (/^-?(?:0|1)(?:,-?(?:0|1)){2}$/.test(trimmed)) {
    return `${role}:${trimmed}`;
  }

  return trimmed;
}

function resolveF2lFocus(
  caseItem: LearningCase,
  moves: string[],
  startMode: "inverse" | "solved",
): ResolvedF2lFocus | null {
  if (caseItem.highlightConfig.kind !== "f2l") {
    return null;
  }

  const config = caseItem.highlightConfig;
  const manualSlot = config.targetSlot !== "auto" ? F2L_SLOT_BY_NAME.get(config.targetSlot) : null;
  const autoSlot = startMode === "inverse" ? inferF2lTargetSlot(moves) : null;
  const legacySlot = getSlotFromCoords(config.targetCorner, config.targetEdge);
  const slot = manualSlot ?? autoSlot ?? legacySlot ?? F2L_SLOT_BY_NAME.get("FR") ?? F2L_SLOT_SPECS[0];
  const manualCornerId =
    config.highlightMode === "manual"
      ? normalizeManualCubieId(config.manualHighlight?.corner, "corner")
      : null;
  const manualEdgeId =
    config.highlightMode === "manual"
      ? normalizeManualCubieId(config.manualHighlight?.edge, "edge")
      : null;
  const cornerId = manualCornerId ?? getCubieIdFromCoord(slot.cornerCoord);
  const edgeId = manualEdgeId ?? getCubieIdFromCoord(slot.edgeCoord);
  const roleById = new Map<string, F2lTargetRole>([
    [cornerId, "corner"],
    [edgeId, "edge"],
  ]);

  return {
    slot,
    roleById,
    targetIds: new Set([cornerId, edgeId]),
  };
}

function getF2lTargetRole(cubieId: string, focus: ResolvedF2lFocus | null): F2lTargetRole | null {
  return focus?.roleById.get(cubieId) ?? null;
}

function createStickerMaterial(color: number, opacity: number) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: opacity >= 0.95 ? 0.08 : 0,
    metalness: 0.02,
    opacity,
    roughness: 0.62,
    transparent: opacity < 1,
  });
}

function addSticker(
  cubie: THREE.Group,
  face: "U" | "D" | "F" | "B" | "R" | "L",
  opacity: number,
) {
  const sticker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.68),
    createStickerMaterial(CUBE_COLORS[face], opacity),
  );
  const offset = 0.466;

  if (face === "U") {
    sticker.position.y = offset;
    sticker.rotation.x = -Math.PI / 2;
  } else if (face === "D") {
    sticker.position.y = -offset;
    sticker.rotation.x = Math.PI / 2;
  } else if (face === "F") {
    sticker.position.z = offset;
  } else if (face === "B") {
    sticker.position.z = -offset;
    sticker.rotation.y = Math.PI;
  } else if (face === "R") {
    sticker.position.x = offset;
    sticker.rotation.y = Math.PI / 2;
  } else {
    sticker.position.x = -offset;
    sticker.rotation.y = -Math.PI / 2;
  }

  cubie.add(sticker);
}

function addCubieOutline(cubie: THREE.Group, role: F2lTargetRole) {
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.03, 1.03, 1.03)),
    new THREE.LineBasicMaterial({
      color: role === "corner" ? CUBE_COLORS.corner : CUBE_COLORS.edge,
      opacity: 0.98,
      transparent: true,
    }),
  );
  outline.name = `f2l-target-${role}`;
  cubie.add(outline);
}

function createCubie(
  x: number,
  y: number,
  z: number,
  focus: ResolvedF2lFocus | null,
): Cubie {
  const coord = new THREE.Vector3(x, y, z);
  const id = getCubieIdFromCoord(coord);
  const targetRole = getF2lTargetRole(id, focus);
  const isF2lFocus = Boolean(focus?.targetIds.has(id));
  const dimF2l = Boolean(focus) && !isF2lFocus;
  const opacity = dimF2l ? 0.42 : 1;
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.92, 0.92),
    new THREE.MeshStandardMaterial({
      color: dimF2l ? CUBE_COLORS.dim : CUBE_COLORS.body,
      metalness: 0.02,
      roughness: 0.78,
    }),
  );

  group.position.set(x, y, z);
  group.add(body);

  if (y === 1) {
    addSticker(group, "U", opacity);
  }

  if (y === -1) {
    addSticker(group, "D", opacity);
  }

  if (z === 1) {
    addSticker(group, "F", opacity);
  }

  if (z === -1) {
    addSticker(group, "B", opacity);
  }

  if (x === 1) {
    addSticker(group, "R", opacity);
  }

  if (x === -1) {
    addSticker(group, "L", opacity);
  }

  if (targetRole) {
    addCubieOutline(group, targetRole);
  }

  return { id, group, coord };
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

function getSpotVector(spot: F2lPieceSpot, lift = 0): THREE.Vector3 {
  const [x, y, z] = SPOT_TO_COORD[spot];

  return new THREE.Vector3(x, y + lift, z);
}

function addSlotHighlight(group: THREE.Group, slot: string) {
  const slotCoords: Record<string, [number, number, number]> = {
    right: [1, -1, 1],
    left: [-1, -1, 1],
    back: [1, -1, -1],
    wrong: [-1, -1, -1],
  };
  const coord = slotCoords[slot] ?? slotCoords.right;
  const slotBox = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.08, 1.08, 1.08)),
    new THREE.LineBasicMaterial({ color: CUBE_COLORS.slot }),
  );
  slotBox.position.set(coord[0], coord[1], coord[2]);
  group.add(slotBox);
}

function addOllHighlights(group: THREE.Group, pattern: LearningSticker[]) {
  pattern.forEach((sticker, index) => {
    if (sticker !== "primary") {
      return;
    }

    const row = Math.floor(index / 3);
    const column = index % 3;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.74, 0.74),
      new THREE.MeshBasicMaterial({
        color: CUBE_COLORS.U,
        opacity: 0.34,
        transparent: true,
      }),
    );
    plane.position.set(column - 1, 1.54, 1 - row);
    plane.rotation.x = -Math.PI / 2;
    group.add(plane);
  });
}

function addPllArrow(group: THREE.Group, arrow: PllArrow) {
  const from = getSpotVector(arrow.from, 0.82);
  const to = getSpotVector(arrow.to, 0.82);
  const direction = to.clone().sub(from);
  const length = direction.length();

  if (length === 0) {
    return;
  }

  const helper = new THREE.ArrowHelper(
    direction.normalize(),
    from,
    length,
    arrow.kind === "corner" ? CUBE_COLORS.corner : CUBE_COLORS.edge,
    0.22,
    0.13,
  );
  group.add(helper);
}

function addBlockHighlight(group: THREE.Group, spot: F2lPieceSpot) {
  const marker = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.88, 0.16, 0.88)),
    new THREE.LineBasicMaterial({ color: CUBE_COLORS.slot }),
  );
  marker.position.copy(getSpotVector(spot, 0.62));
  group.add(marker);
}

function applyHighlights(group: THREE.Group, caseItem: LearningCase, focus: ResolvedF2lFocus | null) {
  const highlightGroup = new THREE.Group();
  highlightGroup.name = "case-highlights";
  group.add(highlightGroup);

  if (caseItem.highlightConfig.kind === "f2l") {
    addSlotHighlight(highlightGroup, focus?.slot.slot ?? caseItem.highlightConfig.slot);
    return;
  }

  if (caseItem.highlightConfig.kind === "oll") {
    addOllHighlights(highlightGroup, caseItem.highlightConfig.yellowPattern);
    return;
  }

  caseItem.highlightConfig.arrows.forEach((arrow) => addPllArrow(highlightGroup, arrow));
  caseItem.highlightConfig.blocks.forEach((spot) => addBlockHighlight(highlightGroup, spot));
}

function resetViewRotation(cubeGroup: THREE.Group) {
  cubeGroup.rotation.set(INITIAL_VIEW_ROTATION.x, INITIAL_VIEW_ROTATION.y, INITIAL_VIEW_ROTATION.z);
}

function fitCubeToCanvas(state: SceneState, canvas: HTMLCanvasElement) {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const shortestSide = Math.min(width, height);
  const player = canvas.closest(".algorithm-player");
  const isFullscreen = player?.classList.contains("is-fullscreen") ?? false;

  let scale = isFullscreen ? 0.82 : 0.72;
  let distance = isFullscreen ? FULLSCREEN_CAMERA_DISTANCE : NORMAL_CAMERA_DISTANCE;
  let fov = isFullscreen ? 32 : 30;

  if (!isFullscreen && shortestSide < 300) {
    scale = 0.58;
    distance = 9.6;
    fov = 27;
  } else if (!isFullscreen && shortestSide < 380) {
    scale = 0.64;
    distance = 9.2;
    fov = 28;
  }

  if (isFullscreen && shortestSide < 420) {
    scale = 0.72;
    distance = 8.6;
  }

  state.cubeGroup.scale.setScalar(scale);
  state.camera.fov = fov;
  state.camera.position.set(0.95, 2.15, distance);
  state.camera.lookAt(0, 0, 0);
}

function createSolvedCubies(
  cubeGroup: THREE.Group,
  caseItem: LearningCase,
  focus: ResolvedF2lFocus | null,
  { resetView }: CaseStartStateOptions,
): Cubie[] {
  cubeGroup.clear();

  if (resetView) {
    resetViewRotation(cubeGroup);
  }

  cubeGroup.position.set(0, 0, 0);
  const cubies: Cubie[] = [];

  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        const cubie = createCubie(x, y, z, focus);
        cubies.push(cubie);
        cubeGroup.add(cubie.group);
      }
    }
  }

  return cubies;
}

function applyMoveTransform(
  cubeGroup: THREE.Group,
  cubies: Cubie[],
  descriptor: MoveDescriptor,
  angle: number,
) {
  const selectedCubies = cubies.filter((cubie) =>
    descriptor.layers.includes(roundCoord(cubie.coord[descriptor.axis])),
  );
  const pivot = new THREE.Group();
  cubeGroup.add(pivot);
  cubeGroup.updateMatrixWorld(true);

  selectedCubies.forEach((cubie) => pivot.attach(cubie.group));
  pivot.rotation[descriptor.axis] = angle;

  const matrix = new THREE.Matrix4().makeRotationAxis(getAxisVector(descriptor.axis), angle);

  selectedCubies.forEach((cubie) => {
    cubie.coord.applyMatrix4(matrix);
    cubie.coord.set(
      roundCoord(cubie.coord.x),
      roundCoord(cubie.coord.y),
      roundCoord(cubie.coord.z),
    );
    cubeGroup.attach(cubie.group);
    cubie.group.position.copy(cubie.coord);
  });

  cubeGroup.remove(pivot);
}

function applyMoveInstant(cubeGroup: THREE.Group, cubies: Cubie[], move: string) {
  const descriptor = getMoveDescriptor(move);

  if (!descriptor) {
    return;
  }

  applyMoveTransform(cubeGroup, cubies, descriptor, descriptor.angle);
}

function createCaseStartState(
  cubeGroup: THREE.Group,
  caseItem: LearningCase,
  moves: string[],
  startMode: "inverse" | "solved",
  options: CaseStartStateOptions,
): Cubie[] {
  const focus = resolveF2lFocus(caseItem, moves, startMode);
  const cubies = createSolvedCubies(cubeGroup, caseItem, focus, options);
  if (startMode === "inverse") {
    invertAlgorithm(moves).forEach((move) => applyMoveInstant(cubeGroup, cubies, move));
  }
  applyHighlights(cubeGroup, caseItem, focus);

  return cubies;
}

function resizeRenderer(state: SceneState, canvas: HTMLCanvasElement) {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);

  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  state.renderer.setSize(width, height, false);
  state.camera.aspect = width / height;
  fitCubeToCanvas(state, canvas);
  state.camera.updateProjectionMatrix();
}

function getStepLabel(index: number, total: number): string {
  return `${Math.max(0, index + 1)} / ${total}`;
}

export default function AlgorithmPlayer({
  caseItem,
  headingLabel = "Three.js Animation",
  headingTitle = "教材3D再生",
  showFocusLegend = true,
  startMode = "inverse",
}: AlgorithmPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<HTMLElement | null>(null);
  const sceneStateRef = useRef<SceneState | null>(null);
  const isAnimatingRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);
  const animationRunRef = useRef(0);
  const autoResetTimeoutRef = useRef<number | null>(null);
  const parsedAlgorithm = useMemo(() => parseAlgorithm(caseItem.algorithm), [caseItem.algorithm]);
  const moves = parsedAlgorithm.moves;
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [speed, setSpeed] = useState<SpeedOption>(() => loadSpeedPreference());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const activeMove = currentIndex >= 0 ? moves[currentIndex] : null;
  const isComplete = moves.length > 0 && currentIndex >= moves.length - 1;
  const progress = moves.length === 0 ? 0 : Math.round(((currentIndex + 1) / moves.length) * 100);

  const clearAutoReset = useCallback(() => {
    if (autoResetTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(autoResetTimeoutRef.current);
    autoResetTimeoutRef.current = null;
  }, []);

  const resetAlgorithmState = useCallback(() => {
    const state = sceneStateRef.current;

    if (!state) {
      return;
    }

    disposeObject(state.cubeGroup);
    state.cubies = createCaseStartState(state.cubeGroup, caseItem, moves, startMode, {
      resetView: false,
    });
  }, [caseItem, moves, startMode]);

  const resetCameraView = useCallback(() => {
    const state = sceneStateRef.current;

    if (!state) {
      return;
    }

    resetViewRotation(state.cubeGroup);
  }, []);

  useEffect(() => {
    saveSpeedPreference(speed);
  }, [speed]);

  useEffect(() => {
    document.body.classList.toggle("learn-player-fullscreen-open", isFullscreen);
    const canvas = canvasRef.current;
    const state = sceneStateRef.current;

    if (canvas && state) {
      resizeRenderer(state, canvas);
    }

    return () => {
      document.body.classList.remove("learn-player-fullscreen-open");
    };
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0.95, 2.15, 7.2);
    camera.lookAt(0, 0, 0);

    const cubeGroup = new THREE.Group();
    scene.add(cubeGroup);

    scene.add(new THREE.AmbientLight(0xffffff, 1.85));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.45);
    keyLight.position.set(3.5, 4.8, 5.5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x77a7ff, 0.85);
    fillLight.position.set(-5, 2, 4);
    scene.add(fillLight);

    const cubies = createCaseStartState(cubeGroup, caseItem, moves, startMode, {
      resetView: true,
    });
    const state: SceneState = {
      renderer,
      scene,
      camera,
      cubeGroup,
      cubies,
      frameId: 0,
      resizeObserver: new ResizeObserver(() => resizeRenderer(state, canvas)),
      animationStart: performance.now(),
    };

    sceneStateRef.current = state;
    resizeRenderer(state, canvas);
    state.resizeObserver.observe(canvas);

    const render = (now: number) => {
      const elapsed = now - state.animationStart;
      state.cubeGroup.position.y = Math.sin(elapsed / 950) * 0.035;
      state.renderer.render(state.scene, state.camera);
      state.frameId = requestAnimationFrame(render);
    };

    state.frameId = requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(state.frameId);
      state.resizeObserver.disconnect();
      disposeObject(state.scene);
      renderer.dispose();
      sceneStateRef.current = null;
    };
  }, [caseItem, moves, startMode]);

  useEffect(() => {
    animationRunRef.current += 1;
    isAnimatingRef.current = false;
    clearAutoReset();
    setCurrentIndex(-1);
    setIsPlaying(false);
    setIsLooping(false);
    setIsFullscreen(false);
  }, [caseItem.id, clearAutoReset]);

  const animateMove = useCallback(
    async (move: string, reverse = false) => {
      const state = sceneStateRef.current;
      const descriptor = getMoveDescriptor(move, reverse);

      if (!state || !descriptor || isAnimatingRef.current) {
        return false;
      }

      isAnimatingRef.current = true;
      const animationRun = animationRunRef.current;

      const selectedCubies = state.cubies.filter((cubie) =>
        descriptor.layers.includes(roundCoord(cubie.coord[descriptor.axis])),
      );
      const pivot = new THREE.Group();
      state.cubeGroup.add(pivot);
      state.cubeGroup.updateMatrixWorld(true);

      selectedCubies.forEach((cubie) => pivot.attach(cubie.group));

      const duration = BASE_TURN_DURATION_MS / speed;
      const start = performance.now();

      await new Promise<void>((resolve) => {
        const turn = (now: number) => {
          if (animationRun !== animationRunRef.current) {
            resolve();
            return;
          }

          const ratio = Math.min(1, (now - start) / duration);
          pivot.rotation[descriptor.axis] = descriptor.angle * easeInOut(ratio);

          if (ratio < 1) {
            requestAnimationFrame(turn);
            return;
          }

          resolve();
        };

        requestAnimationFrame(turn);
      });

      const finalAngle = descriptor.angle;

      if (animationRun !== animationRunRef.current) {
        state.cubeGroup.remove(pivot);
        isAnimatingRef.current = false;
        return false;
      }

      const matrix = new THREE.Matrix4().makeRotationAxis(
        getAxisVector(descriptor.axis),
        finalAngle,
      );

      selectedCubies.forEach((cubie) => {
        cubie.coord.applyMatrix4(matrix);
        cubie.coord.set(
          roundCoord(cubie.coord.x),
          roundCoord(cubie.coord.y),
          roundCoord(cubie.coord.z),
        );
        state.cubeGroup.attach(cubie.group);
        cubie.group.position.copy(cubie.coord);
      });

      state.cubeGroup.remove(pivot);
      isAnimatingRef.current = false;
      return true;
    },
    [speed],
  );

  const resetToStart = useCallback(() => {
    clearAutoReset();
    animationRunRef.current += 1;
    isAnimatingRef.current = false;
    setIsPlaying(false);
    setCurrentIndex(-1);
    resetAlgorithmState();
  }, [clearAutoReset, resetAlgorithmState]);

  const stepNext = useCallback(async () => {
    clearAutoReset();

    if (currentIndex >= moves.length - 1) {
      return false;
    }

    const nextIndex = currentIndex + 1;
    const didMove = await animateMove(moves[nextIndex]);

    if (didMove) {
      setCurrentIndex(nextIndex);
    }

    return didMove;
  }, [animateMove, clearAutoReset, currentIndex, moves]);

  const stepPrevious = useCallback(async () => {
    clearAutoReset();

    if (currentIndex < 0) {
      return false;
    }

    setIsPlaying(false);
    const didMove = await animateMove(moves[currentIndex], true);

    if (didMove) {
      setCurrentIndex((index) => index - 1);
    }

    return didMove;
  }, [animateMove, clearAutoReset, currentIndex, moves]);

  const handlePlayToggle = useCallback(() => {
    clearAutoReset();

    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (isComplete) {
      resetAlgorithmState();
      setCurrentIndex(-1);
    }

    setIsPlaying(true);
  }, [clearAutoReset, isComplete, isPlaying, resetAlgorithmState]);

  const toggleLoop = useCallback(() => {
    clearAutoReset();
    setIsLooping((looping) => !looping);
  }, [clearAutoReset]);

  const reset = useCallback(() => {
    setIsLooping(false);
    resetToStart();
  }, [resetToStart]);

  useEffect(() => {
    if (!isComplete || isPlaying || isLooping) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      autoResetTimeoutRef.current = null;
      resetToStart();
    }, AUTO_RESET_DELAY_MS);

    autoResetTimeoutRef.current = timeoutId;

    return () => {
      if (autoResetTimeoutRef.current === timeoutId) {
        window.clearTimeout(timeoutId);
        autoResetTimeoutRef.current = null;
      }
    };
  }, [isComplete, isLooping, isPlaying, resetToStart]);

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    if (currentIndex >= moves.length - 1) {
      if (!isLooping) {
        setIsPlaying(false);
        return undefined;
      }

      const timeoutId = window.setTimeout(() => {
        resetAlgorithmState();
        setCurrentIndex(-1);
      }, BASE_PLAY_DELAY_MS / speed);

      return () => window.clearTimeout(timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      void stepNext();
    }, BASE_PLAY_DELAY_MS / speed);

    return () => window.clearTimeout(timeoutId);
  }, [currentIndex, isLooping, isPlaying, moves.length, resetAlgorithmState, speed, stepNext]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = sceneStateRef.current;

    if (!state) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRotationX: state.cubeGroup.rotation.x,
      startRotationY: state.cubeGroup.rotation.y,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = sceneStateRef.current;
    const dragState = dragStateRef.current;

    if (!state || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    state.cubeGroup.rotation.y = dragState.startRotationY + deltaX * 0.008;
    state.cubeGroup.rotation.x = Math.max(
      -1.2,
      Math.min(0.8, dragState.startRotationX + deltaY * 0.008),
    );
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
  };

  const enterFullscreen = async () => {
    setIsFullscreen(true);

    try {
      if (playerRef.current?.requestFullscreen && !document.fullscreenElement) {
        await playerRef.current.requestFullscreen();
      }
    } catch {
      setIsFullscreen(true);
    }
  };

  const exitFullscreen = async () => {
    setIsFullscreen(false);

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      setIsFullscreen(false);
    }
  };

  const playLabel = isPlaying ? "一時停止" : isComplete ? "もう一度再生" : "再生";

  return (
    <section
      className={`algorithm-player ${isFullscreen ? "is-fullscreen" : ""}`}
      ref={playerRef}
      aria-label={`${caseItem.title} algorithm animation`}
    >
      <div className="algorithm-player-heading">
        <div>
          <span>{headingLabel}</span>
          <h3>{headingTitle}</h3>
        </div>
        <div className="algorithm-player-meta">
          <strong>Step: {getStepLabel(currentIndex, moves.length)}</strong>
          <button type="button" onClick={isFullscreen ? exitFullscreen : enterFullscreen}>
            {isFullscreen ? "閉じる" : "全画面"}
          </button>
        </div>
      </div>

      <div className="algorithm-stage">
        <div
          className="three-cube-frame"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <canvas ref={canvasRef} aria-label={`${caseItem.title} 3D cube`} />
        </div>

        <div className="algorithm-now">
          <p>
            Now: <strong>{activeMove ?? (isComplete ? "Complete" : "Ready")}</strong>
          </p>
          <div className="algorithm-inline" aria-label="Current algorithm">
            <span>Algorithm</span>
            <ol className="algorithm-move-list algorithm-move-list-inline">
              {moves.map((move, index) => (
                <li
                  aria-current={index === currentIndex ? "step" : undefined}
                  key={`${move}-${index}`}
                >
                  {move}
                </li>
              ))}
            </ol>
          </div>
          <div className="algorithm-progress" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
          {showFocusLegend && <FocusLegend caseItem={caseItem} />}
        </div>
      </div>

      {parsedAlgorithm.invalidTokens.length > 0 && (
        <div className="algorithm-warning" role="status">
          未対応の記号があります: {parsedAlgorithm.invalidTokens.join(", ")}
        </div>
      )}

      <div className="algorithm-control-panel">
        <div className="algorithm-controls">
          <button type="button" onClick={handlePlayToggle}>
            {playLabel}
          </button>
          <button type="button" onClick={() => void stepPrevious()}>
            1手戻る
          </button>
          <button type="button" onClick={() => void stepNext()}>
            1手進む
          </button>
          <button type="button" onClick={reset}>
            リセット
          </button>
          <button aria-pressed={isLooping} type="button" onClick={toggleLoop}>
            ループ: {isLooping ? "ON" : "OFF"}
          </button>
          <button type="button" onClick={resetCameraView}>
            視点リセット
          </button>
        </div>

        <label className="speed-control">
          <span>Speed</span>
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value) as SpeedOption)}
          >
            {SPEED_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}x
              </option>
            ))}
          </select>
        </label>
      </div>

    </section>
  );
}

function FocusLegend({ caseItem }: { caseItem: LearningCase }) {
  if (caseItem.highlightConfig.kind === "f2l") {
    return (
      <div className="focus-legend">
        <span className="focus-legend-corner">Corner</span>
        <span className="focus-legend-edge">Edge</span>
        <span className="focus-legend-slot">Slot</span>
      </div>
    );
  }

  if (caseItem.highlightConfig.kind === "oll") {
    return (
      <div className="focus-legend">
        <span className="focus-legend-yellow">Yellow pattern on U</span>
        <span>Blue front / yellow top</span>
      </div>
    );
  }

  return (
    <div className="focus-legend">
      <span className="focus-legend-edge">Edge swap</span>
      <span className="focus-legend-corner">Corner swap</span>
      <span className="focus-legend-slot">Block</span>
    </div>
  );
}
