import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { getMoveDescriptor, invertAlgorithm, parseAlgorithm } from "../learn/moveNotation";
import type { MoveAxis, MoveDescriptor } from "../learn/moveNotation";
import { getLearningCasesByCategory } from "../learn/learningData";
import {
  CROSS_SEARCH_MAX_DEPTH,
  getColorJapanese,
  getF2lPairCandidates,
} from "./cubeState";
import type {
  BasicF2lAnalysisPlan,
  BasicF2lAnalysisStep,
  CrossSearchInput,
  CrossSearchResult,
  CrossSolution,
  F2lPairCandidate,
} from "./cubeState";
import type { AnalyzerCandidate, LearningCase } from "../types";

const AlgorithmPlayer = lazy(() => import("../learn/AlgorithmPlayer"));

type PlaybackMode = "scramble" | "scramble-solve";
type AnalyzerStepKey = "scramble" | "cross" | "f2l1" | "f2l2" | "f2l3" | "f2l4" | "oll" | "pll" | "complete";
type AnimationSpeed = 0.25 | 0.5 | 1 | 1.5 | 2;
type CubeColorName = "white" | "yellow" | "blue" | "green" | "red" | "orange";
type FaceName = "U" | "D" | "F" | "B" | "R" | "L";
type CrossTargetFace = "D" | "U";
type ColorVector = [number, number, number];

interface AnalyzerSettings {
  crossColor: CubeColorName;
  crossTargetFace: CrossTargetFace;
  frontColor: CubeColorName;
  topColor: CubeColorName;
  showAllCrossColors: boolean;
  maxDepth: number;
}

interface CrossCandidate {
  color: CubeColorName;
  targetFace: CrossTargetFace;
  algorithm: string;
  moveCount: number;
}

interface CrossSearchWorkerResponse {
  jobId: number;
  ok: boolean;
  results?: CrossSearchResult[];
  error?: string;
}

interface F2lAnalysisWorkerResponse {
  jobId: number;
  ok: boolean;
  plan?: BasicF2lAnalysisPlan;
  error?: string;
}

interface F2lRecommendation {
  caseItem: LearningCase;
  algorithm: string;
  moveCount: number;
  ease: string;
  description: string;
  matchLabel: string;
}

interface AnalyzerPageProps {
  onNavigate: (path: string, hash?: string) => void;
  onOpenTimer: () => void;
}

interface Cubie {
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

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startRotationX: number;
  startRotationY: number;
}

interface StoredAnalyzerState {
  version: 1;
  settings: AnalyzerSettings;
  scrambleInput: string;
  solveInput: string;
  playbackScrambleInput: string;
  playbackSolveInput: string;
  playbackMode: PlaybackMode;
  currentIndex: number;
  crossResults: CrossSearchResult[];
  crossError: string | null;
  selectedCrossSolution: CrossSolution | null;
  selectedF2lPairId: string | null;
}

const TURN_DURATION_MS = 360;
const PLAY_DELAY_MS = 130;
const INITIAL_VIEW_ROTATION = {
  x: -0.18,
  y: -0.3,
  z: 0,
};

const ANALYZER_SETTINGS_STORAGE_KEY = "cubeSplitTimer.analyzerSettings.v1";
const ANALYZER_STATE_STORAGE_KEY = "cube-split-timer-analyzer-state";
const ANALYZER_SPEED_STORAGE_KEY = "cubeSplitTimer.analyzerSpeed.v1";
const ANIMATION_SPEED_OPTIONS: AnimationSpeed[] = [0.25, 0.5, 1, 1.5, 2];
const BASIC_SCRAMBLE_MOVES = new Set([
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
]);
const SCRAMBLE_MOVE_GROUPS = [
  ["U", "U'", "U2"],
  ["D", "D'", "D2"],
  ["R", "R'", "R2"],
  ["L", "L'", "L2"],
  ["F", "F'", "F2"],
  ["B", "B'", "B2"],
];
const COLOR_OPTIONS: Array<{ value: CubeColorName; label: string; shortLabel: string }> = [
  { value: "white", label: "White", shortLabel: "W" },
  { value: "yellow", label: "Yellow", shortLabel: "Y" },
  { value: "blue", label: "Blue", shortLabel: "B" },
  { value: "green", label: "Green", shortLabel: "G" },
  { value: "red", label: "Red", shortLabel: "R" },
  { value: "orange", label: "Orange", shortLabel: "O" },
];
const COLOR_HEX: Record<CubeColorName, number> = {
  white: 0xf4f7fb,
  yellow: 0xffe04f,
  blue: 0x347dff,
  green: 0x32c36c,
  red: 0xff5b4a,
  orange: 0xff9b42,
};
const COLOR_VECTORS: Record<CubeColorName, ColorVector> = {
  white: [0, -1, 0],
  yellow: [0, 1, 0],
  blue: [0, 0, 1],
  green: [0, 0, -1],
  red: [1, 0, 0],
  orange: [-1, 0, 0],
};
const COLOR_OPPOSITES: Record<CubeColorName, CubeColorName> = {
  white: "yellow",
  yellow: "white",
  blue: "green",
  green: "blue",
  red: "orange",
  orange: "red",
};
const DEFAULT_FACE_COLOR_MAP: Record<FaceName, CubeColorName> = {
  U: "yellow",
  D: "white",
  F: "blue",
  B: "green",
  R: "red",
  L: "orange",
};
const DEFAULT_ANALYZER_SETTINGS: AnalyzerSettings = {
  crossColor: "white",
  crossTargetFace: "D",
  frontColor: "blue",
  topColor: "yellow",
  showAllCrossColors: false,
  maxDepth: CROSS_SEARCH_MAX_DEPTH,
};
const CUBE_COLORS = {
  body: 0x111827,
  edge: 0x253149,
};

function isCubeColorName(value: unknown): value is CubeColorName {
  return typeof value === "string" && COLOR_OPTIONS.some((option) => option.value === value);
}

function getColorLabel(color: CubeColorName): string {
  return COLOR_OPTIONS.find((option) => option.value === color)?.label ?? color;
}

function vectorKey(vector: ColorVector): string {
  return vector.join(",");
}

function negateVector(vector: ColorVector): ColorVector {
  return [-vector[0], -vector[1], -vector[2]];
}

function crossVector(a: ColorVector, b: ColorVector): ColorVector {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function getColorByVector(vector: ColorVector): CubeColorName | null {
  const key = vectorKey(vector);
  const match = COLOR_OPTIONS.find((option) => vectorKey(COLOR_VECTORS[option.value]) === key);

  return match?.value ?? null;
}

function getOrientationError(settings: AnalyzerSettings): string | null {
  if (settings.frontColor === settings.topColor) {
    return "Front color と Top color は同じ色にできません。";
  }

  if (COLOR_OPPOSITES[settings.frontColor] === settings.topColor) {
    return "Front color と Top color は反対色にできません。隣り合う色を選んでください。";
  }

  return null;
}

function buildFaceColorMap(settings: AnalyzerSettings): Record<FaceName, CubeColorName> | null {
  if (getOrientationError(settings)) {
    return null;
  }

  const frontVector = COLOR_VECTORS[settings.frontColor];
  const upVector = COLOR_VECTORS[settings.topColor];
  const rightVector = crossVector(upVector, frontVector);
  const backColor = getColorByVector(negateVector(frontVector));
  const downColor = getColorByVector(negateVector(upVector));
  const rightColor = getColorByVector(rightVector);
  const leftColor = rightColor ? COLOR_OPPOSITES[rightColor] : null;

  if (!backColor || !downColor || !rightColor || !leftColor) {
    return null;
  }

  return {
    U: settings.topColor,
    D: downColor,
    F: settings.frontColor,
    B: backColor,
    R: rightColor,
    L: leftColor,
  };
}

function buildCrossFaceColorMap(
  crossColor: CubeColorName,
  targetFace: CrossTargetFace,
  preferredFrontColor: CubeColorName,
): Record<FaceName, CubeColorName> {
  const topColor = targetFace === "D" ? COLOR_OPPOSITES[crossColor] : crossColor;
  const frontColor =
    preferredFrontColor !== topColor && COLOR_OPPOSITES[preferredFrontColor] !== topColor
      ? preferredFrontColor
      : (COLOR_OPTIONS.find(
          (option) =>
            option.value !== topColor && COLOR_OPPOSITES[option.value] !== topColor,
        )?.value ?? "blue");

  return (
    buildFaceColorMap({
      ...DEFAULT_ANALYZER_SETTINGS,
      crossColor,
      crossTargetFace: targetFace,
      frontColor,
      topColor,
    }) ?? DEFAULT_FACE_COLOR_MAP
  );
}

function loadAnalyzerSettings(): AnalyzerSettings {
  try {
    const raw = localStorage.getItem(ANALYZER_SETTINGS_STORAGE_KEY);

    if (!raw) {
      return DEFAULT_ANALYZER_SETTINGS;
    }

    const parsed = JSON.parse(raw) as Partial<AnalyzerSettings>;

    return {
      crossColor: isCubeColorName(parsed.crossColor)
        ? parsed.crossColor
        : DEFAULT_ANALYZER_SETTINGS.crossColor,
      crossTargetFace: parsed.crossTargetFace === "U" ? "U" : "D",
      frontColor: isCubeColorName(parsed.frontColor)
        ? parsed.frontColor
        : DEFAULT_ANALYZER_SETTINGS.frontColor,
      topColor: isCubeColorName(parsed.topColor)
        ? parsed.topColor
        : DEFAULT_ANALYZER_SETTINGS.topColor,
      showAllCrossColors: Boolean(parsed.showAllCrossColors),
      maxDepth:
        typeof parsed.maxDepth === "number" &&
        Number.isFinite(parsed.maxDepth) &&
        parsed.maxDepth >= 1
          ? Math.min(8, Math.max(1, Math.round(parsed.maxDepth)))
          : DEFAULT_ANALYZER_SETTINGS.maxDepth,
    };
  } catch {
    return DEFAULT_ANALYZER_SETTINGS;
  }
}

function saveAnalyzerSettings(settings: AnalyzerSettings): void {
  try {
    localStorage.setItem(ANALYZER_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Analyzer settings are local convenience data; the page should still work.
  }
}

function loadAnalyzerSpeed(): AnimationSpeed {
  try {
    const savedSpeed = Number(localStorage.getItem(ANALYZER_SPEED_STORAGE_KEY));

    return ANIMATION_SPEED_OPTIONS.includes(savedSpeed as AnimationSpeed)
      ? (savedSpeed as AnimationSpeed)
      : 1;
  } catch {
    return 1;
  }
}

function saveAnalyzerSpeed(speed: AnimationSpeed): void {
  try {
    localStorage.setItem(ANALYZER_SPEED_STORAGE_KEY, String(speed));
  } catch {
    // Playback speed is a convenience setting; ignore storage failures.
  }
}

function copyTextWithFallback(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);

  return Promise.resolve();
}

function getIncomingScrambleFromUrl(): string | null {
  try {
    const rawScramble = new URLSearchParams(window.location.search).get("scramble");

    if (!rawScramble) {
      return null;
    }

    const decodedScramble = decodeURIComponent(rawScramble).trim();
    return decodedScramble || null;
  } catch {
    return null;
  }
}

function loadAnalyzerState(): StoredAnalyzerState | null {
  try {
    const raw = localStorage.getItem(ANALYZER_STATE_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredAnalyzerState>;
    const settings = {
      ...loadAnalyzerSettings(),
      ...(parsed.settings ?? {}),
    };
    const normalizedSettings: AnalyzerSettings = {
      crossColor: isCubeColorName(settings.crossColor)
        ? settings.crossColor
        : DEFAULT_ANALYZER_SETTINGS.crossColor,
      crossTargetFace: settings.crossTargetFace === "U" ? "U" : "D",
      frontColor: isCubeColorName(settings.frontColor)
        ? settings.frontColor
        : DEFAULT_ANALYZER_SETTINGS.frontColor,
      topColor: isCubeColorName(settings.topColor)
        ? settings.topColor
        : DEFAULT_ANALYZER_SETTINGS.topColor,
      showAllCrossColors: Boolean(settings.showAllCrossColors),
      maxDepth:
        typeof settings.maxDepth === "number" &&
        Number.isFinite(settings.maxDepth) &&
        settings.maxDepth >= 1
          ? Math.min(8, Math.max(1, Math.round(settings.maxDepth)))
          : DEFAULT_ANALYZER_SETTINGS.maxDepth,
    };

    const scrambleInput =
      typeof parsed.scrambleInput === "string" ? parsed.scrambleInput : "R U R' U'";
    const solveInput = typeof parsed.solveInput === "string" ? parsed.solveInput : "";

    return {
      version: 1,
      settings: normalizedSettings,
      scrambleInput,
      solveInput,
      playbackScrambleInput:
        typeof parsed.playbackScrambleInput === "string"
          ? parsed.playbackScrambleInput
          : scrambleInput,
      playbackSolveInput:
        typeof parsed.playbackSolveInput === "string" ? parsed.playbackSolveInput : solveInput,
      playbackMode: "scramble-solve",
      currentIndex:
        typeof parsed.currentIndex === "number" && Number.isFinite(parsed.currentIndex)
          ? Math.max(0, Math.round(parsed.currentIndex))
          : 0,
      crossResults: Array.isArray(parsed.crossResults) ? parsed.crossResults : [],
      crossError: typeof parsed.crossError === "string" ? parsed.crossError : null,
      selectedCrossSolution: parsed.selectedCrossSolution ?? null,
      selectedF2lPairId:
        typeof parsed.selectedF2lPairId === "string" ? parsed.selectedF2lPairId : null,
    };
  } catch {
    return null;
  }
}

function saveAnalyzerState(state: StoredAnalyzerState): void {
  try {
    localStorage.setItem(ANALYZER_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Analyzer state is convenience data; interaction should still continue.
  }
}

function clearAnalyzerState(): void {
  try {
    localStorage.removeItem(ANALYZER_STATE_STORAGE_KEY);
    localStorage.removeItem(ANALYZER_SETTINGS_STORAGE_KEY);
  } catch {
    // Reset should still update React state even if storage is unavailable.
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

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

function createStickerMaterial(color: number, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.08,
    metalness: 0.02,
    opacity,
    roughness: 0.62,
    transparent: opacity < 1,
  });
}

function addSticker(
  cubie: THREE.Group,
  face: FaceName,
  faceColorMap: Record<FaceName, CubeColorName>,
  opacity: number,
) {
  const sticker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.68),
    createStickerMaterial(COLOR_HEX[faceColorMap[face]], opacity),
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

function createCubie(
  x: number,
  y: number,
  z: number,
  faceColorMap: Record<FaceName, CubeColorName>,
): Cubie {
  const group = new THREE.Group();
  const stickerOpacity = 1;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.92, 0.92),
    new THREE.MeshStandardMaterial({
      color: CUBE_COLORS.body,
      metalness: 0.02,
      roughness: 0.78,
    }),
  );
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.94, 0.94, 0.94)),
    new THREE.LineBasicMaterial({
      color: CUBE_COLORS.edge,
      transparent: true,
      opacity: 0.76,
    }),
  );

  group.position.set(x, y, z);
  group.add(body);
  group.add(outline);

  if (y === 1) {
    addSticker(group, "U", faceColorMap, stickerOpacity);
  }

  if (y === -1) {
    addSticker(group, "D", faceColorMap, stickerOpacity);
  }

  if (z === 1) {
    addSticker(group, "F", faceColorMap, stickerOpacity);
  }

  if (z === -1) {
    addSticker(group, "B", faceColorMap, stickerOpacity);
  }

  if (x === 1) {
    addSticker(group, "R", faceColorMap, stickerOpacity);
  }

  if (x === -1) {
    addSticker(group, "L", faceColorMap, stickerOpacity);
  }

  return {
    group,
    coord: new THREE.Vector3(x, y, z),
  };
}

function createSolvedCubies(
  cubeGroup: THREE.Group,
  faceColorMap: Record<FaceName, CubeColorName>,
): Cubie[] {
  disposeObject(cubeGroup);
  cubeGroup.clear();
  cubeGroup.position.set(0, 0, 0);
  const cubies: Cubie[] = [];

  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        const cubie = createCubie(x, y, z, faceColorMap);
        cubies.push(cubie);
        cubeGroup.add(cubie.group);
      }
    }
  }

  return cubies;
}

function resetViewRotation(cubeGroup: THREE.Group) {
  cubeGroup.rotation.set(INITIAL_VIEW_ROTATION.x, INITIAL_VIEW_ROTATION.y, INITIAL_VIEW_ROTATION.z);
}

function fitCubeToCanvas(state: SceneState, canvas: HTMLCanvasElement) {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const shortestSide = Math.min(width, height);

  let scale = 0.74;
  let distance = 8.2;
  let fov = 34;

  if (shortestSide < 330) {
    scale = 0.62;
    distance = 9;
    fov = 31;
  }

  state.cubeGroup.scale.setScalar(scale);
  state.camera.fov = fov;
  state.camera.position.set(0.9, 2.05, distance);
  state.camera.lookAt(0, 0, 0);
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

function getPlaybackModeLabel(mode: PlaybackMode): string {
  return mode === "scramble" ? "崩した状態" : "崩した状態 + 手順";
}

function getLearningCaseRouteKey(caseItem: LearningCase): string {
  return caseItem.image.kind === "asset" ? caseItem.image.baseName : caseItem.id;
}

function getAlgorithmMoveCount(algorithm: string): number {
  return parseAlgorithm(algorithm).moves.length;
}

function getAlgorithmFaces(algorithm: string): Set<string> {
  return new Set(parseAlgorithm(algorithm).parsedMoves.map((move) => move.canonical[0] ?? ""));
}

function getF2lEaseLabel(algorithm: string): string {
  const moves = parseAlgorithm(algorithm).parsedMoves;
  const rightTurns = moves.filter((move) => move.canonical.startsWith("R")).length;
  const leftTurns = moves.filter((move) => move.canonical.startsWith("L")).length;

  if (moves.length <= 4) {
    return "短く確認しやすい";
  }

  if (rightTurns > leftTurns) {
    return "右手寄り";
  }

  if (leftTurns > rightTurns) {
    return "左手寄り";
  }

  return "標準";
}

function scoreF2lLearningCase(candidate: F2lPairCandidate, caseItem: LearningCase): number {
  const faces = getAlgorithmFaces(caseItem.algorithm);
  const wantsRight = candidate.slotFaces.includes("R");
  const wantsLeft = candidate.slotFaces.includes("L");
  let score = 0;

  if (wantsRight && faces.has("R")) {
    score += 8;
  }

  if (wantsLeft && faces.has("L")) {
    score += 8;
  }

  if (wantsRight && faces.has("L")) {
    score -= 2;
  }

  if (wantsLeft && faces.has("R")) {
    score -= 2;
  }

  if (candidate.slotFaces.includes("F") && faces.has("F")) {
    score += 2;
  }

  score -= Math.min(8, getAlgorithmMoveCount(caseItem.algorithm)) * 0.1;
  return score;
}

function getF2lRecommendation(
  candidate: F2lPairCandidate,
  learningCases: LearningCase[],
): F2lRecommendation | null {
  const [caseItem] = [...learningCases].sort((a, b) => {
    const scoreDelta = scoreF2lLearningCase(candidate, b) - scoreF2lLearningCase(candidate, a);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    return getAlgorithmMoveCount(a.algorithm) - getAlgorithmMoveCount(b.algorithm);
  });

  if (!caseItem) {
    return null;
  }

  const moveCount = getAlgorithmMoveCount(caseItem.algorithm);
  const description =
    candidate.status === "completed"
      ? "このペアは完成済みです。次の未完成ペアを探す練習に移れます。"
      : "対象ペアをU面で見つけ、向きを合わせてからスロットへ入れる流れをLearnで確認します。";

  return {
    caseItem,
    algorithm: caseItem.algorithm,
    moveCount,
    ease: getF2lEaseLabel(caseItem.algorithm),
    description,
    matchLabel: "近い可能性があるLearn F2Lケース",
  };
}

function isSameCrossSolution(a: CrossSolution | null, b: CrossSolution | null): boolean {
  return Boolean(
    a &&
      b &&
      a.color === b.color &&
      a.targetFace === b.targetFace &&
      a.algorithm === b.algorithm &&
      a.moveCount === b.moveCount,
  );
}

function buildCrossCandidates(settings: AnalyzerSettings, scrambleMoves: string[]): CrossCandidate[] {
  const colors = settings.showAllCrossColors
    ? COLOR_OPTIONS.map((option) => option.value)
    : [settings.crossColor];
  const inverseScramble = invertAlgorithm(scrambleMoves);
  const algorithm = inverseScramble.join(" ");

  return colors.map((color) => ({
    color,
    targetFace: settings.crossTargetFace,
    algorithm,
    moveCount: inverseScramble.length,
  }));
}

export default function AnalyzerPage({ onNavigate, onOpenTimer }: AnalyzerPageProps) {
  const [initialAnalyzerState] = useState(() => {
    const savedState = loadAnalyzerState();
    const incomingScramble = getIncomingScrambleFromUrl();

    if (!incomingScramble) {
      return savedState;
    }

    return {
      version: 1,
      settings: savedState?.settings ?? loadAnalyzerSettings(),
      scrambleInput: incomingScramble,
      solveInput: "",
      playbackScrambleInput: incomingScramble,
      playbackSolveInput: "",
      playbackMode: "scramble-solve",
      currentIndex: 0,
      crossResults: [],
      crossError: null,
      selectedCrossSolution: null,
      selectedF2lPairId: null,
    } satisfies StoredAnalyzerState;
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneStateRef = useRef<SceneState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const isAnimatingRef = useRef(false);
  const animationRunRef = useRef(0);
  const crossWorkerRef = useRef<Worker | null>(null);
  const crossJobIdRef = useRef(0);
  const f2lAnalysisWorkerRef = useRef<Worker | null>(null);
  const f2lAnalysisJobIdRef = useRef(0);
  const playerPanelRef = useRef<HTMLElement | null>(null);
  const skipInitialCrossClearCountRef = useRef(initialAnalyzerState ? 2 : 0);
  const lastRestoredSceneIdRef = useRef(0);
  const skipNextSettingsSaveCountRef = useRef(0);
  const skipNextAnalyzerStateSaveCountRef = useRef(0);
  const [sceneReadyId, setSceneReadyId] = useState(0);
  const [settings, setSettings] = useState<AnalyzerSettings>(
    () => initialAnalyzerState?.settings ?? loadAnalyzerSettings(),
  );
  const [scrambleInput, setScrambleInput] = useState(
    () => initialAnalyzerState?.scrambleInput ?? "R U R' U'",
  );
  const [solveInput, setSolveInput] = useState(() => initialAnalyzerState?.solveInput ?? "");
  const [playbackScrambleInput, setPlaybackScrambleInput] = useState(
    () => initialAnalyzerState?.playbackScrambleInput ?? initialAnalyzerState?.scrambleInput ?? "R U R' U'",
  );
  const [playbackSolveInput, setPlaybackSolveInput] = useState(
    () => initialAnalyzerState?.playbackSolveInput ?? initialAnalyzerState?.solveInput ?? "",
  );
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(
    () => initialAnalyzerState?.playbackMode ?? "scramble-solve",
  );
  const [currentIndex, setCurrentIndex] = useState(() => initialAnalyzerState?.currentIndex ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationSpeed, setAnimationSpeed] = useState<AnimationSpeed>(() => loadAnalyzerSpeed());
  const [isAnalyzerFullscreen, setIsAnalyzerFullscreen] = useState(false);
  const [isSearchingCross, setIsSearchingCross] = useState(false);
  const [crossResults, setCrossResults] = useState<CrossSearchResult[]>(
    () => initialAnalyzerState?.crossResults ?? [],
  );
  const [crossError, setCrossError] = useState<string | null>(
    () => initialAnalyzerState?.crossError ?? null,
  );
  const [selectedCrossSolution, setSelectedCrossSolution] = useState<CrossSolution | null>(
    () => initialAnalyzerState?.selectedCrossSolution ?? null,
  );
  const [f2lCandidates, setF2lCandidates] = useState<F2lPairCandidate[]>(() =>
    initialAnalyzerState?.selectedCrossSolution
      ? getF2lPairCandidates(
          initialAnalyzerState.selectedCrossSolution.stateAfterCross,
          initialAnalyzerState.selectedCrossSolution.color,
          initialAnalyzerState.selectedCrossSolution.targetFace,
        )
      : [],
  );
  const [selectedF2lPairId, setSelectedF2lPairId] = useState<string | null>(
    () => initialAnalyzerState?.selectedF2lPairId ?? null,
  );
  const [helperCaseId, setHelperCaseId] = useState<string | null>(null);
  const [basicF2lPlan, setBasicF2lPlan] = useState<BasicF2lAnalysisPlan | null>(null);
  const [isAnalyzingBasicF2l, setIsAnalyzingBasicF2l] = useState(false);
  const [basicF2lError, setBasicF2lError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const orientationError = useMemo(() => getOrientationError(settings), [settings]);
  const faceColorMap = useMemo(
    () => buildFaceColorMap(settings) ?? DEFAULT_FACE_COLOR_MAP,
    [settings],
  );
  const parsedScramble = useMemo(() => parseAlgorithm(scrambleInput), [scrambleInput]);
  const parsedSolve = useMemo(() => parseAlgorithm(solveInput), [solveInput]);
  const parsedPlaybackScramble = useMemo(
    () => parseAlgorithm(playbackScrambleInput),
    [playbackScrambleInput],
  );
  const parsedPlaybackSolve = useMemo(
    () => parseAlgorithm(playbackSolveInput),
    [playbackSolveInput],
  );
  const unsupportedScrambleTokens = useMemo(
    () => [
      ...parsedScramble.invalidTokens,
      ...parsedScramble.parsedMoves
        .filter((move) => !BASIC_SCRAMBLE_MOVES.has(move.canonical))
        .map((move) => move.raw),
    ],
    [parsedScramble.invalidTokens, parsedScramble.parsedMoves],
  );
  const crossCandidates = useMemo(
    () => buildCrossCandidates(settings, parsedScramble.moves),
    [parsedScramble.moves, settings],
  );
  const bestCrossSolution = useMemo(
    () =>
      crossResults
        .flatMap((result) => result.solutions)
        .sort((a, b) => a.moveCount - b.moveCount || a.algorithm.localeCompare(b.algorithm))[0] ??
      null,
    [crossResults],
  );
  const crossResultSummaries = useMemo(
    () =>
      crossResults.map((result) => ({
        result,
        bestSolution:
          [...result.solutions].sort(
            (a, b) => a.moveCount - b.moveCount || a.algorithm.localeCompare(b.algorithm),
          )[0] ?? null,
      })),
    [crossResults],
  );
  const activeMoves = useMemo(
    () => (playbackMode === "scramble" ? [] : parsedPlaybackSolve.moves),
    [parsedPlaybackSolve.moves, playbackMode],
  );
  const activeInvalidTokens = useMemo(
    () =>
      playbackMode === "scramble"
        ? parsedPlaybackScramble.invalidTokens
        : [...parsedPlaybackScramble.invalidTokens, ...parsedPlaybackSolve.invalidTokens],
    [parsedPlaybackScramble.invalidTokens, parsedPlaybackSolve.invalidTokens, playbackMode],
  );
  const currentMove = currentIndex > 0 ? activeMoves[currentIndex - 1] : null;
  const nextMove = currentIndex < activeMoves.length ? activeMoves[currentIndex] : null;
  const canUseOrientation = orientationError === null;
  const canUseScramble = unsupportedScrambleTokens.length === 0 && canUseOrientation;
  const canUseActiveSequence = activeInvalidTokens.length === 0 && canUseOrientation;
  const isComplete = activeMoves.length > 0 && currentIndex >= activeMoves.length;

  const resetCubeState = useCallback(() => {
    const state = sceneStateRef.current;

    if (!state) {
      return;
    }

    animationRunRef.current += 1;
    isAnimatingRef.current = false;
    state.cubies = createSolvedCubies(state.cubeGroup, faceColorMap);
  }, [faceColorMap]);

  const resetCameraView = useCallback(() => {
    const state = sceneStateRef.current;

    if (!state) {
      return;
    }

    resetViewRotation(state.cubeGroup);
  }, []);

  const resetCubeToPlaybackStart = useCallback(
    (mode: PlaybackMode = playbackMode) => {
      resetCubeState();

      if (mode !== "scramble-solve") {
        return;
      }

      const state = sceneStateRef.current;

      if (!state) {
        return;
      }

      parsedPlaybackScramble.moves.forEach((move) =>
        applyMoveInstant(state.cubeGroup, state.cubies, move),
      );
    },
    [parsedPlaybackScramble.moves, playbackMode, resetCubeState],
  );

  const resetPlayback = useCallback(() => {
    setIsPlaying(false);
    setCurrentIndex(0);
    resetCubeToPlaybackStart();
  }, [resetCubeToPlaybackStart]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, canvas });
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    const cubeGroup = new THREE.Group();
    resetViewRotation(cubeGroup);
    scene.add(cubeGroup);

    scene.add(new THREE.AmbientLight(0xffffff, 1.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.45);
    keyLight.position.set(3.5, 4.8, 5.5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x77a7ff, 0.85);
    fillLight.position.set(-5, 2, 4);
    scene.add(fillLight);

    const state: SceneState = {
      renderer,
      scene,
      camera,
      cubeGroup,
      cubies: createSolvedCubies(cubeGroup, faceColorMap),
      frameId: 0,
      resizeObserver: new ResizeObserver(() => resizeRenderer(state, canvas)),
      animationStart: performance.now(),
    };

    sceneStateRef.current = state;
    setSceneReadyId((id) => id + 1);
    resizeRenderer(state, canvas);
    state.resizeObserver.observe(canvas);

    const render = (now: number) => {
      const elapsed = now - state.animationStart;
      state.cubeGroup.position.y = Math.sin(elapsed / 980) * 0.03;
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
  }, []);

  useEffect(() => {
    if (
      !initialAnalyzerState ||
      sceneReadyId === 0 ||
      lastRestoredSceneIdRef.current === sceneReadyId
    ) {
      return;
    }

    const state = sceneStateRef.current;

    if (!state || !canUseActiveSequence) {
      return;
    }

    resetCubeToPlaybackStart(initialAnalyzerState.playbackMode);
    const restoredState = sceneStateRef.current;
    const restoredIndex = Math.min(initialAnalyzerState.currentIndex, activeMoves.length);

    if (!restoredState) {
      return;
    }

    activeMoves.slice(0, restoredIndex).forEach((move) => {
      applyMoveInstant(restoredState.cubeGroup, restoredState.cubies, move);
    });
    lastRestoredSceneIdRef.current = sceneReadyId;
    setCurrentIndex(restoredIndex);
    setIsPlaying(false);
  }, [
    activeMoves,
    canUseActiveSequence,
    initialAnalyzerState,
    resetCubeToPlaybackStart,
    sceneReadyId,
  ]);

  useEffect(() => {
    if (skipInitialCrossClearCountRef.current > 0) {
      skipInitialCrossClearCountRef.current -= 1;
      return;
    }

    crossWorkerRef.current?.terminate();
    crossWorkerRef.current = null;
    crossJobIdRef.current += 1;
    setIsSearchingCross(false);
    setCrossResults([]);
    setCrossError(null);
    setSelectedCrossSolution(null);
    setF2lCandidates([]);
    setSelectedF2lPairId(null);
    setHelperCaseId(null);
    f2lAnalysisWorkerRef.current?.terminate();
    f2lAnalysisWorkerRef.current = null;
    f2lAnalysisJobIdRef.current += 1;
    setIsAnalyzingBasicF2l(false);
    setBasicF2lPlan(null);
    setBasicF2lError(null);
    setAiNotice(null);
  }, [
    scrambleInput,
    settings.crossColor,
    settings.crossTargetFace,
    settings.frontColor,
    settings.maxDepth,
    settings.showAllCrossColors,
    settings.topColor,
  ]);

  useEffect(() => {
    if (skipNextSettingsSaveCountRef.current > 0) {
      skipNextSettingsSaveCountRef.current -= 1;
      return;
    }

    saveAnalyzerSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveAnalyzerSpeed(animationSpeed);
  }, [animationSpeed]);

  const enterAnalyzerFullscreen = useCallback(() => {
    setIsAnalyzerFullscreen(true);

    const element = playerPanelRef.current;
    if (element?.requestFullscreen) {
      void element.requestFullscreen().catch(() => {
        // Fullscreen APIが使えない環境ではCSSの疑似全画面で表示します。
      });
    }
  }, []);

  const exitAnalyzerFullscreen = useCallback(() => {
    setIsAnalyzerFullscreen(false);

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("analyzer-fullscreen-open", isAnalyzerFullscreen);

    return () => {
      document.body.classList.remove("analyzer-fullscreen-open");
    };
  }, [isAnalyzerFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsAnalyzerFullscreen(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isAnalyzerFullscreen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        exitAnalyzerFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exitAnalyzerFullscreen, isAnalyzerFullscreen]);

  useEffect(() => {
    if (copyStatus === "idle") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setCopyStatus("idle"), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [copyStatus]);

  useEffect(() => {
    if (skipNextAnalyzerStateSaveCountRef.current > 0) {
      skipNextAnalyzerStateSaveCountRef.current -= 1;
      return;
    }

    saveAnalyzerState({
      version: 1,
      settings,
      scrambleInput,
      solveInput,
      playbackScrambleInput,
      playbackSolveInput,
      playbackMode,
      currentIndex,
      crossResults,
      crossError,
      selectedCrossSolution,
      selectedF2lPairId,
    });
  }, [
    crossError,
    crossResults,
    currentIndex,
    playbackMode,
    playbackScrambleInput,
    playbackSolveInput,
    scrambleInput,
    selectedCrossSolution,
    selectedF2lPairId,
    settings,
    solveInput,
  ]);

  useEffect(() => {
    f2lAnalysisWorkerRef.current?.terminate();
    f2lAnalysisWorkerRef.current = null;
    const jobId = f2lAnalysisJobIdRef.current + 1;
    f2lAnalysisJobIdRef.current = jobId;

    setBasicF2lPlan(null);
    setBasicF2lError(null);

    if (!selectedCrossSolution) {
      setIsAnalyzingBasicF2l(false);
      return undefined;
    }

    setIsAnalyzingBasicF2l(true);
    const worker = new Worker(new URL("./f2lAnalysisWorker.ts", import.meta.url), {
      type: "module",
    });

    f2lAnalysisWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<F2lAnalysisWorkerResponse>) => {
      if (event.data.jobId !== f2lAnalysisJobIdRef.current) {
        return;
      }

      worker.terminate();
      if (f2lAnalysisWorkerRef.current === worker) {
        f2lAnalysisWorkerRef.current = null;
      }
      setIsAnalyzingBasicF2l(false);

      if (!event.data.ok || !event.data.plan) {
        setBasicF2lError(event.data.error ?? "F2L解析中にエラーが発生しました。");
        return;
      }

      setBasicF2lPlan(event.data.plan);
    };
    worker.onerror = () => {
      if (jobId !== f2lAnalysisJobIdRef.current) {
        return;
      }

      worker.terminate();
      if (f2lAnalysisWorkerRef.current === worker) {
        f2lAnalysisWorkerRef.current = null;
      }
      setIsAnalyzingBasicF2l(false);
      setBasicF2lError("F2L解析Workerでエラーが発生しました。");
    };
    worker.postMessage({
      jobId,
      state: selectedCrossSolution.stateAfterCross,
      crossColor: selectedCrossSolution.color,
      targetFace: selectedCrossSolution.targetFace,
    });

    return () => {
      worker.terminate();
      if (f2lAnalysisWorkerRef.current === worker) {
        f2lAnalysisWorkerRef.current = null;
      }
    };
  }, [selectedCrossSolution]);

  useEffect(
    () => () => {
      crossWorkerRef.current?.terminate();
      crossWorkerRef.current = null;
      f2lAnalysisWorkerRef.current?.terminate();
      f2lAnalysisWorkerRef.current = null;
    },
    [],
  );

  const animateMove = useCallback(async (move: string, reverse = false) => {
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

    const start = performance.now();

    await new Promise<void>((resolve) => {
      const turn = (now: number) => {
        if (animationRun !== animationRunRef.current) {
          resolve();
          return;
        }

        const ratio = Math.min(1, (now - start) / (TURN_DURATION_MS / animationSpeed));
        pivot.rotation[descriptor.axis] = descriptor.angle * easeInOut(ratio);

        if (ratio < 1) {
          requestAnimationFrame(turn);
          return;
        }

        resolve();
      };

      requestAnimationFrame(turn);
    });

    if (animationRun !== animationRunRef.current) {
      if (pivot.parent) {
        state.cubeGroup.remove(pivot);
      }
      isAnimatingRef.current = false;
      return false;
    }

    const matrix = new THREE.Matrix4().makeRotationAxis(
      getAxisVector(descriptor.axis),
      descriptor.angle,
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
  }, [animationSpeed]);

  const stepNext = useCallback(async () => {
    if (!canUseActiveSequence || currentIndex >= activeMoves.length) {
      return false;
    }

    setIsPlaying(false);
    const didMove = await animateMove(activeMoves[currentIndex]);

    if (didMove) {
      setCurrentIndex((index) => Math.min(index + 1, activeMoves.length));
    }

    return didMove;
  }, [activeMoves, animateMove, canUseActiveSequence, currentIndex]);

  const stepPrevious = useCallback(async () => {
    if (!canUseActiveSequence || currentIndex <= 0) {
      return false;
    }

    setIsPlaying(false);
    const didMove = await animateMove(activeMoves[currentIndex - 1], true);

    if (didMove) {
      setCurrentIndex((index) => Math.max(0, index - 1));
    }

    return didMove;
  }, [activeMoves, animateMove, canUseActiveSequence, currentIndex]);

  useEffect(() => {
    if (!isPlaying) {
      return undefined;
    }

    if (!canUseActiveSequence || currentIndex >= activeMoves.length) {
      setIsPlaying(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const didMove = await animateMove(activeMoves[currentIndex]);

        if (didMove) {
          setCurrentIndex((index) => Math.min(index + 1, activeMoves.length));
        }
      })();
    }, PLAY_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeMoves, animateMove, canUseActiveSequence, currentIndex, isPlaying]);

  const updateSettings = <Key extends keyof AnalyzerSettings>(
    key: Key,
    value: AnalyzerSettings[Key],
  ) => {
    setSettings((currentSettings) => ({
      ...currentSettings,
      [key]: value,
    }));
  };

  const appendScrambleMove = (move: string) => {
    setScrambleInput((currentInput) => {
      const trimmedInput = currentInput.trim();
      return trimmedInput ? `${trimmedInput} ${move}` : move;
    });
  };

  const deleteLastScrambleMove = () => {
    setScrambleInput((currentInput) => currentInput.trim().split(/\s+/).filter(Boolean).slice(0, -1).join(" "));
  };

  const clearScrambleInput = () => {
    setScrambleInput("");
  };

  const copyScrambleInput = async () => {
    try {
      await copyTextWithFallback(scrambleInput.trim());
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  const openScramblePreview = () => {
    const targetScramble = scrambleInput.trim();

    if (!targetScramble) {
      return;
    }

    const returnTo = `${window.location.pathname}${window.location.search}`;
    onNavigate(
      `/scramble?scramble=${encodeURIComponent(targetScramble)}&returnTo=${encodeURIComponent(
        returnTo,
      )}`,
    );
  };

  const resetAnalyzerState = () => {
    if (!window.confirm("Analyzerの状態をリセットしますか？")) {
      return;
    }

    crossWorkerRef.current?.terminate();
    crossWorkerRef.current = null;
    crossJobIdRef.current += 1;
    skipNextSettingsSaveCountRef.current = 2;
    skipNextAnalyzerStateSaveCountRef.current = 2;
    clearAnalyzerState();
    window.setTimeout(clearAnalyzerState, 250);
    window.history.replaceState(null, "", "/analyzer");
    setSettings(DEFAULT_ANALYZER_SETTINGS);
    setScrambleInput("");
    setSolveInput("");
    setPlaybackScrambleInput("");
    setPlaybackSolveInput("");
    setPlaybackMode("scramble-solve");
    setCurrentIndex(0);
    setIsPlaying(false);
    setIsSearchingCross(false);
    setCrossResults([]);
    setCrossError(null);
    setSelectedCrossSolution(null);
    setF2lCandidates([]);
    setSelectedF2lPairId(null);
    setHelperCaseId(null);
    setCopyStatus("idle");
    setAiNotice(null);

    const state = sceneStateRef.current;

    if (state) {
      animationRunRef.current += 1;
      isAnimatingRef.current = false;
      state.cubies = createSolvedCubies(state.cubeGroup, DEFAULT_FACE_COLOR_MAP);
      resetViewRotation(state.cubeGroup);
    }
  };

  const applyScramble = () => {
    if (!canUseScramble) {
      return;
    }

    setPlaybackScrambleInput(scrambleInput);
    setPlaybackSolveInput(solveInput);
    setPlaybackMode("scramble-solve");
    setIsPlaying(false);
    resetCubeState();

    const state = sceneStateRef.current;

    if (!state) {
      return;
    }

    parsedScramble.moves.forEach((move) => applyMoveInstant(state.cubeGroup, state.cubies, move));
    setCurrentIndex(0);
  };

  const playCombined = () => {
    if (
      unsupportedScrambleTokens.length > 0 ||
      parsedSolve.invalidTokens.length > 0 ||
      !canUseOrientation
    ) {
      return;
    }

    setPlaybackScrambleInput(scrambleInput);
    setPlaybackSolveInput(solveInput);
    setPlaybackMode("scramble-solve");
    resetCubeState();
    const state = sceneStateRef.current;

    if (state) {
      parsedScramble.moves.forEach((move) => applyMoveInstant(state.cubeGroup, state.cubies, move));
    }

    setCurrentIndex(0);
    setIsPlaying(parsedSolve.moves.length > 0);
  };

  const handlePlayToggle = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (!canUseActiveSequence || activeMoves.length === 0) {
      return;
    }

    if (isComplete) {
      resetCubeToPlaybackStart();
      setCurrentIndex(0);
    }

    setIsPlaying(true);
  };

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

  const f2lLearningCases = useMemo(() => getLearningCasesByCategory("f2l"), []);
  const ollLearningCases = useMemo(() => getLearningCasesByCategory("oll"), []);
  const pllLearningCases = useMemo(() => getLearningCasesByCategory("pll"), []);
  const selectedF2lPair =
    f2lCandidates.find((candidate) => candidate.id === selectedF2lPairId) ??
    f2lCandidates[0] ??
    null;
  const selectedF2lRecommendation = useMemo(() => {
    if (!selectedF2lPair || f2lLearningCases.length === 0) {
      return null;
    }

    return getF2lRecommendation(selectedF2lPair, f2lLearningCases);
  }, [f2lLearningCases, selectedF2lPair]);
  const helperCase = useMemo(() => {
    const learningCases = [...f2lLearningCases, ...ollLearningCases, ...pllLearningCases];

    return (
      learningCases.find(
        (caseItem) =>
          caseItem.id === helperCaseId || getLearningCaseRouteKey(caseItem) === helperCaseId,
      ) ??
      selectedF2lRecommendation?.caseItem ??
      null
    );
  }, [f2lLearningCases, helperCaseId, ollLearningCases, pllLearningCases, selectedF2lRecommendation]);
  const currentAnalyzerStep = useMemo<AnalyzerStepKey>(() => {
    if (helperCase?.category === "pll") {
      return isComplete ? "complete" : "pll";
    }

    if (helperCase?.category === "oll") {
      return "oll";
    }

    if (parsedScramble.moves.length === 0) {
      return "scramble";
    }

    if (!selectedCrossSolution) {
      return "cross";
    }

    const completedF2lSteps = basicF2lPlan?.steps.length ?? 0;

    if (completedF2lSteps <= 0) {
      return "f2l1";
    }

    if ((basicF2lPlan?.unresolvedPairs.length ?? 1) === 0) {
      return "oll";
    }

    return `f2l${Math.min(4, completedF2lSteps + 1)}` as AnalyzerStepKey;
  }, [basicF2lPlan, helperCase?.category, isComplete, parsedScramble.moves.length, selectedCrossSolution]);
  const analyzerStepItems: Array<{ key: AnalyzerStepKey; label: string }> = [
    { key: "scramble", label: "Scramble" },
    { key: "cross", label: "Cross" },
    { key: "f2l1", label: "F2L 1" },
    { key: "f2l2", label: "F2L 2" },
    { key: "f2l3", label: "F2L 3" },
    { key: "f2l4", label: "F2L 4" },
    { key: "oll", label: "OLL" },
    { key: "pll", label: "PLL" },
    { key: "complete", label: "Complete" },
  ];
  const ollCandidates = useMemo<AnalyzerCandidate[]>(
    () =>
      ollLearningCases.slice(0, 4).map((caseItem) => ({
        id: caseItem.id,
        phase: "oll",
        name: caseItem.title,
        algorithm: caseItem.algorithm,
        moveCount: getAlgorithmMoveCount(caseItem.algorithm),
        description: caseItem.description,
        learnCaseId: getLearningCaseRouteKey(caseItem),
        tags: caseItem.tags,
      })),
    [ollLearningCases],
  );
  const pllCandidates = useMemo<AnalyzerCandidate[]>(
    () =>
      pllLearningCases.slice(0, 4).map((caseItem) => ({
        id: caseItem.id,
        phase: "pll",
        name: caseItem.title,
        algorithm: caseItem.algorithm,
        moveCount: getAlgorithmMoveCount(caseItem.algorithm),
        description: caseItem.description,
        learnCaseId: getLearningCaseRouteKey(caseItem),
        tags: caseItem.tags,
      })),
    [pllLearningCases],
  );
  const getCrossSearchFaceColorMap = useCallback(
    (targetCrossColor = settings.crossColor): Record<FaceName, CubeColorName> =>
      faceColorMap[settings.crossTargetFace] === targetCrossColor
        ? faceColorMap
        : buildCrossFaceColorMap(
            targetCrossColor,
            settings.crossTargetFace,
            settings.frontColor,
          ),
    [faceColorMap, settings.crossColor, settings.crossTargetFace, settings.frontColor],
  );

  const applyScrambleInstant = useCallback(() => {
    const state = sceneStateRef.current;

    if (!state) {
      return;
    }

    resetCubeState();
    parsedScramble.moves.forEach((move) => applyMoveInstant(state.cubeGroup, state.cubies, move));
  }, [parsedScramble.moves, resetCubeState]);

  const selectCrossSolution = useCallback(
    (solution: CrossSolution, options: { play?: boolean } = {}) => {
      setSelectedCrossSolution(solution);
      setF2lCandidates(getF2lPairCandidates(solution.stateAfterCross, solution.color, solution.targetFace));
      setSelectedF2lPairId(null);
      setSolveInput(solution.algorithm);
      setAiNotice(null);

      if (options.play) {
        setPlaybackScrambleInput(scrambleInput);
        setPlaybackSolveInput(solution.algorithm);
        setPlaybackMode("scramble-solve");

        window.setTimeout(() => {
          applyScrambleInstant();
          setCurrentIndex(0);
          setIsPlaying(solution.moves.length > 0);
        }, 0);
      }
    },
    [applyScrambleInstant, parsedScramble.moves.length, scrambleInput],
  );

  const selectCrossSolutionForF2l = useCallback(
    (solution: CrossSolution) => {
      selectCrossSolution(solution);
      setPlaybackScrambleInput(scrambleInput);
      setPlaybackSolveInput(solution.algorithm);
      setPlaybackMode("scramble-solve");

      window.setTimeout(() => {
        applyScrambleInstant();
        solution.moves.forEach((move) => {
          const state = sceneStateRef.current;

          if (state) {
            applyMoveInstant(state.cubeGroup, state.cubies, move);
          }
        });
        setCurrentIndex(solution.moves.length);
        document
          .getElementById("analyzer-f2l-section")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    },
    [applyScrambleInstant, scrambleInput, selectCrossSolution],
  );

  const showAiPlaceholder = useCallback((targetLabel: string) => {
    setAiNotice(
      `${targetLabel}のAI説明は今後追加予定です。現在は選択中のスクランブル、Cross手順、F2L候補を渡せるUIだけ用意しています。`,
    );
  }, []);

  const analyzeCross = useCallback(() => {
    setCrossError(null);
    setCrossResults([]);
    setSelectedCrossSolution(null);
    setF2lCandidates([]);
    setSelectedF2lPairId(null);
    f2lAnalysisWorkerRef.current?.terminate();
    f2lAnalysisWorkerRef.current = null;
    f2lAnalysisJobIdRef.current += 1;
    setIsAnalyzingBasicF2l(false);
    setBasicF2lPlan(null);
    setBasicF2lError(null);

    if (!scrambleInput.trim()) {
      setCrossError("スクランブルを入力してください。");
      return;
    }

    if (!canUseOrientation) {
      setCrossError(orientationError ?? "キューブの向き設定を確認してください。");
      return;
    }

    if (unsupportedScrambleTokens.length > 0) {
      setCrossError(
        `対応していない回転記号があります: ${unsupportedScrambleTokens.join(", ")}`,
      );
      return;
    }

    setIsSearchingCross(true);
    crossWorkerRef.current?.terminate();

    const jobId = crossJobIdRef.current + 1;
    crossJobIdRef.current = jobId;
    const worker = new Worker(new URL("./crossSearchWorker.ts", import.meta.url), {
      type: "module",
    });
    const targetColors = settings.showAllCrossColors
      ? COLOR_OPTIONS.map((option) => option.value)
      : [settings.crossColor];
    const jobs: CrossSearchInput[] = targetColors.map((crossColor) => ({
      crossColor,
      targetFace: settings.crossTargetFace,
      faceColorMap: getCrossSearchFaceColorMap(crossColor),
      scrambleMoves: parsedScramble.moves,
      maxDepth: settings.maxDepth,
      maxSolutions: 5,
    }));

    crossWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<CrossSearchWorkerResponse>) => {
      if (event.data.jobId !== crossJobIdRef.current) {
        return;
      }

      worker.terminate();
      if (crossWorkerRef.current === worker) {
        crossWorkerRef.current = null;
      }
      setIsSearchingCross(false);

      if (!event.data.ok || !event.data.results) {
        setCrossError(event.data.error ?? "Cross探索中にエラーが発生しました。");
        return;
      }

      const results = event.data.results;
      const solutions = results.flatMap((result) => result.solutions);
      const bestSolution =
        solutions.sort((a, b) => a.moveCount - b.moveCount || a.algorithm.localeCompare(b.algorithm))[0] ??
        null;

      setCrossResults(results);

      if (!bestSolution) {
        const truncated = results.some((result) => result.truncated);
        setCrossError(
          truncated
            ? "探索上限に達しました。探索条件を減らすか、もう一度試してください。"
            : `${settings.maxDepth}手以内ではクロスが見つかりませんでした。`,
        );
        return;
      }

      setCrossError(null);
      selectCrossSolution(bestSolution);
    };
    worker.onerror = () => {
      if (jobId !== crossJobIdRef.current) {
        return;
      }

      worker.terminate();
      if (crossWorkerRef.current === worker) {
        crossWorkerRef.current = null;
      }
      setIsSearchingCross(false);
      setCrossError("Cross探索Workerでエラーが発生しました。");
    };
    worker.postMessage({ jobId, jobs });
  }, [
    canUseOrientation,
    getCrossSearchFaceColorMap,
    orientationError,
    parsedScramble.moves,
    scrambleInput,
    selectCrossSolution,
    settings.crossColor,
    settings.maxDepth,
    settings.crossTargetFace,
    settings.showAllCrossColors,
    unsupportedScrambleTokens,
  ]);

  const selectF2lPair = (candidate: F2lPairCandidate) => {
    setSelectedF2lPairId(candidate.id);
    setAiNotice(null);

    window.setTimeout(() => {
      applyScrambleInstant();
      if (selectedCrossSolution) {
        selectedCrossSolution.moves.forEach((move) => {
          const state = sceneStateRef.current;

          if (state) {
            applyMoveInstant(state.cubeGroup, state.cubies, move);
          }
        });
        setCurrentIndex(selectedCrossSolution.moves.length);
      }
    }, 0);
  };

  const playLearningCaseCandidate = (caseItem: LearningCase) => {
    const prefixAlgorithms = [
      selectedCrossSolution?.algorithm ?? "",
      ...(caseItem.category !== "f2l" && basicF2lPlan
        ? basicF2lPlan.steps.map((step) => step.fullAlgorithm)
        : []),
    ];
    const combinedSolve = [...prefixAlgorithms, caseItem.algorithm]
      .map((algorithm) => algorithm.trim())
      .filter(Boolean)
      .join(" ");

    setHelperCaseId(getLearningCaseRouteKey(caseItem));
    setSolveInput(combinedSolve);
    setPlaybackScrambleInput(scrambleInput);
    setPlaybackSolveInput(combinedSolve);
    setPlaybackMode("scramble-solve");
    resetCubeState();
    const state = sceneStateRef.current;

    if (state) {
      parsedScramble.moves.forEach((move) => applyMoveInstant(state.cubeGroup, state.cubies, move));
    }

    setCurrentIndex(0);
    setIsPlaying(parseAlgorithm(combinedSolve).moves.length > 0);
  };

  const getAnalyzerCandidateCase = (candidate: AnalyzerCandidate): LearningCase | null => {
    const cases =
      candidate.phase === "f2l"
        ? f2lLearningCases
        : candidate.phase === "oll"
          ? ollLearningCases
          : candidate.phase === "pll"
            ? pllLearningCases
            : [];

    return (
      cases.find(
        (caseItem) =>
          caseItem.id === candidate.learnCaseId ||
          getLearningCaseRouteKey(caseItem) === candidate.learnCaseId,
      ) ?? null
    );
  };

  const playAnalyzerCandidate = (candidate: AnalyzerCandidate) => {
    const caseItem = getAnalyzerCandidateCase(candidate);

    if (caseItem) {
      playLearningCaseCandidate(caseItem);
    }
  };

  const openAnalyzerCandidateLearn = (candidate: AnalyzerCandidate) => {
    const caseItem = getAnalyzerCandidateCase(candidate);

    if (caseItem) {
      onNavigate(
        `/learn/${caseItem.category}/${encodeURIComponent(getLearningCaseRouteKey(caseItem))}`,
      );
    }
  };

  const playF2lRecommendation = (recommendation: F2lRecommendation) => {
    if (!selectedCrossSolution) {
      return;
    }

    const combinedSolve = [selectedCrossSolution.algorithm, recommendation.algorithm]
      .map((algorithm) => algorithm.trim())
      .filter(Boolean)
      .join(" ");

    setHelperCaseId(getLearningCaseRouteKey(recommendation.caseItem));
    setSolveInput(combinedSolve);
    setPlaybackScrambleInput(scrambleInput);
    setPlaybackSolveInput(combinedSolve);
    setPlaybackMode("scramble-solve");
    resetCubeState();
    const state = sceneStateRef.current;

    if (state) {
      parsedScramble.moves.forEach((move) => applyMoveInstant(state.cubeGroup, state.cubies, move));
    }

    setCurrentIndex(0);
    setIsPlaying(parseAlgorithm(combinedSolve).moves.length > 0);
  };

  const playBasicF2lSteps = (steps: BasicF2lAnalysisStep[]) => {
    if (!selectedCrossSolution || steps.length === 0) {
      return;
    }

    const f2lAlgorithm = steps
      .map((step) => step.fullAlgorithm)
      .filter(Boolean)
      .join(" ");
    const combinedSolve = [selectedCrossSolution.algorithm, f2lAlgorithm]
      .map((algorithm) => algorithm.trim())
      .filter(Boolean)
      .join(" ");

    setSolveInput(combinedSolve);
    setPlaybackScrambleInput(scrambleInput);
    setPlaybackSolveInput(combinedSolve);
    setPlaybackMode("scramble-solve");
    resetCubeState();
    const state = sceneStateRef.current;

    if (state) {
      parsedScramble.moves.forEach((move) => applyMoveInstant(state.cubeGroup, state.cubies, move));
    }

    setCurrentIndex(0);
    setIsPlaying(parseAlgorithm(combinedSolve).moves.length > 0);
  };

  const playBasicF2lStep = (step: BasicF2lAnalysisStep) => {
    const steps = basicF2lPlan?.steps ?? [];
    const stepIndex = steps.findIndex((item) => item.id === step.id);

    playBasicF2lSteps(steps.slice(0, stepIndex + 1));
  };

  const invalidSummary = [
    orientationError ? `キューブの向き設定に問題があります: ${orientationError}` : "",
    unsupportedScrambleTokens.length > 0
      ? `対応していない回転記号があります: ${unsupportedScrambleTokens.join(", ")}`
      : "",
    parsedSolve.invalidTokens.length > 0
      ? `ソルブ手順に未対応の記号があります: ${parsedSolve.invalidTokens.join(", ")}`
      : "",
  ].filter(Boolean);

  return (
    <main className="app-shell analyzer-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Virtual cube checker</p>
          <h1>Analyzer</h1>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={onOpenTimer}>
            Timer
          </button>
          <button className="ghost-button" type="button" onClick={() => onNavigate("/learn")}>
            Learn
          </button>
          <button className="ghost-button" type="button" onClick={resetAnalyzerState}>
            状態をリセット
          </button>
        </div>
      </header>

      <section className="analyzer-hero">
        <div>
          <p className="eyebrow">Phase 11</p>
          <h2>実物キューブの向きに合わせて確認</h2>
        </div>
        <p>
          Front / Top の色を選ぶと、その向きを基準にスクランブルを適用します。
          Cross色とターゲット面も保存され、次回も同じ設定で開けます。
        </p>
      </section>

      <nav className="analyzer-step-timeline" aria-label="Analyzer learning flow">
        {analyzerStepItems.map((step, index) => {
          const currentIndexInFlow = analyzerStepItems.findIndex(
            (item) => item.key === currentAnalyzerStep,
          );
          const stateClass =
            step.key === currentAnalyzerStep
              ? "is-current"
              : index < currentIndexInFlow
                ? "is-done"
                : "";

          return (
            <span
              className={["analyzer-step-chip", stateClass].filter(Boolean).join(" ")}
              key={step.key}
            >
              {step.label}
            </span>
          );
        })}
      </nav>

      <div className="analyzer-layout">
        <section className="analyzer-panel analyzer-input-panel" aria-label="Analyzer inputs">
          <section className="analyzer-settings-card" aria-label="Analyzer settings">
            <div className="analyzer-subheading">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>キューブの向き</h2>
              </div>
              <span className="analyzer-settings-save">localStorage保存</span>
            </div>

            <div className="analyzer-settings-grid">
              <label className="analyzer-select-field">
                <span>Cross color</span>
                <select
                  value={settings.crossColor}
                  onChange={(event) =>
                    updateSettings("crossColor", event.target.value as CubeColorName)
                  }
                >
                  {COLOR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="analyzer-select-field">
                <span>Cross target</span>
                <select
                  value={settings.crossTargetFace}
                  onChange={(event) =>
                    updateSettings("crossTargetFace", event.target.value as CrossTargetFace)
                  }
                >
                  <option value="D">D面</option>
                  <option value="U">U面</option>
                </select>
              </label>

              <label className="analyzer-select-field">
                <span>Max depth</span>
                <select
                  value={settings.maxDepth}
                  onChange={(event) =>
                    updateSettings("maxDepth", Number(event.target.value) as AnalyzerSettings["maxDepth"])
                  }
                >
                  {[4, 5, 6, 7, 8].map((depth) => (
                    <option key={depth} value={depth}>
                      {depth}手
                    </option>
                  ))}
                </select>
              </label>

              <label className="analyzer-select-field">
                <span>Front color</span>
                <select
                  value={settings.frontColor}
                  onChange={(event) =>
                    updateSettings("frontColor", event.target.value as CubeColorName)
                  }
                >
                  {COLOR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="analyzer-select-field">
                <span>Top color</span>
                <select
                  value={settings.topColor}
                  onChange={(event) =>
                    updateSettings("topColor", event.target.value as CubeColorName)
                  }
                >
                  {COLOR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="analyzer-checkbox-field">
              <input
                type="checkbox"
                checked={settings.showAllCrossColors}
                onChange={(event) => updateSettings("showAllCrossColors", event.target.checked)}
              />
              <span>全色クロス候補を表示</span>
            </label>

            <div className="analyzer-orientation-preview" aria-label="Current orientation">
              {(["F", "U", "R", "D"] as FaceName[]).map((face) => (
                <span key={face}>
                  <i
                    aria-hidden="true"
                    style={{ backgroundColor: `#${COLOR_HEX[faceColorMap[face]].toString(16).padStart(6, "0")}` }}
                  />
                  {face}: {getColorLabel(faceColorMap[face])}
                </span>
              ))}
            </div>
          </section>

          <label className="analyzer-field">
            <span>Scramble</span>
            <textarea
              value={scrambleInput}
              onChange={(event) => setScrambleInput(event.target.value)}
              spellCheck={false}
              placeholder="例: R U R' U'"
            />
          </label>

          <div className="analyzer-scramble-pad" aria-label="Scramble move input buttons">
            {SCRAMBLE_MOVE_GROUPS.map((group) => (
              <div className="analyzer-move-group" key={group[0]}>
                {group.map((move) => (
                  <button type="button" key={move} onClick={() => appendScrambleMove(move)}>
                    {move}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="analyzer-scramble-tools">
            <button type="button" onClick={deleteLastScrambleMove}>
              1手削除
            </button>
            <button type="button" onClick={clearScrambleInput}>
              全消し
            </button>
            <button type="button" onClick={applyScramble} disabled={!canUseScramble}>
              スクランブル適用
            </button>
            <button type="button" onClick={() => void copyScrambleInput()}>
              コピー
            </button>
            <button type="button" onClick={openScramblePreview} disabled={!scrambleInput.trim()}>
              スクランブルを確認する
            </button>
          </div>

          {copyStatus !== "idle" && (
            <p className="analyzer-copy-status" role="status">
              {copyStatus === "copied" ? "コピーしました。" : "コピーできませんでした。"}
            </p>
          )}

          <label className="analyzer-field">
            <span>Solve algorithm</span>
            <textarea
              value={solveInput}
              onChange={(event) => setSolveInput(event.target.value)}
              spellCheck={false}
              placeholder="例: F R U R' U' F'"
            />
          </label>

          {invalidSummary.length > 0 && (
            <div className="analyzer-error" role="alert">
              {invalidSummary.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}

          {aiNotice && (
            <div className="analyzer-ai-notice" role="status">
              <p>{aiNotice}</p>
              <button type="button" onClick={() => setAiNotice(null)}>
                閉じる
              </button>
            </div>
          )}

          <div className="analyzer-action-grid">
            <button type="button" onClick={applyScramble} disabled={!canUseScramble}>
              スクランブルを反映
            </button>
            <button type="button" onClick={openScramblePreview} disabled={!scrambleInput.trim()}>
              スクランブルを確認する
            </button>
            <button
              type="button"
              onClick={playCombined}
              disabled={
                unsupportedScrambleTokens.length > 0 ||
                parsedSolve.invalidTokens.length > 0 ||
                !canUseOrientation
              }
            >
              崩した状態から手順を再生
            </button>
          </div>

          <div className="analyzer-stats" aria-label="Move counts">
            <div>
              <span>Scramble</span>
              <strong>{parsedScramble.moves.length}</strong>
            </div>
            <div>
              <span>Solve</span>
              <strong>{parsedSolve.moves.length}</strong>
            </div>
            <div>
              <span>Mode</span>
              <strong>{getPlaybackModeLabel(playbackMode)}</strong>
            </div>
          </div>

          <section className="analyzer-cross-card" aria-label="Cross candidates">
            <div className="analyzer-subheading">
              <div>
                <p className="eyebrow">Cross Analyzer</p>
                <h2>最短クロス探索</h2>
              </div>
              <button
                className="analyzer-primary-action"
                type="button"
                disabled={isSearchingCross || !canUseScramble}
                onClick={analyzeCross}
              >
                {isSearchingCross ? "探索中..." : "最短手順を探す"}
              </button>
            </div>
            <p className="analyzer-muted">
              D面の4つのエッジだけでなく、側面センターまで合った状態をクロス完成として判定します。
              探索は最大{settings.maxDepth}手、HTM基準です。
            </p>

            {crossError && (
              <div className="analyzer-error analyzer-error-compact" role="alert">
                <p>{crossError}</p>
              </div>
            )}

            {crossResultSummaries.length > 0 && (
              <div className="analyzer-cross-summary-grid" aria-label="Cross color summary">
                {crossResultSummaries.map(({ result, bestSolution }) => (
                  <article
                    className={[
                      "analyzer-cross-summary",
                      isSameCrossSolution(bestSolution, bestCrossSolution) ? "is-best" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={`${result.color}-${result.targetFace}-summary`}
                  >
                    <div className="analyzer-cross-main">
                      <span
                        className="analyzer-color-swatch"
                        aria-hidden="true"
                        style={{
                          backgroundColor: `#${COLOR_HEX[result.color]
                            .toString(16)
                            .padStart(6, "0")}`,
                        }}
                      />
                      <div>
                        <strong>{getColorLabel(result.color)}</strong>
                        <small>{result.targetFace}面 Cross</small>
                      </div>
                    </div>
                    {bestSolution ? (
                      <>
                        <p className="analyzer-cross-algorithm">
                          {bestSolution.algorithm || "すでにクロス完成"}
                        </p>
                        <div className="analyzer-cross-footer">
                          <span>
                            {bestSolution.moveCount} moves
                            {isSameCrossSolution(bestSolution, bestCrossSolution) ? " / Best" : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() => selectCrossSolution(bestSolution, { play: true })}
                          >
                            3Dで見る
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="analyzer-muted">{result.maxDepth}手以内では未発見</p>
                    )}
                  </article>
                ))}
              </div>
            )}

            <div className="analyzer-cross-list">
              {crossResults.length === 0
                ? crossCandidates.map((candidate) => (
                    <article className="analyzer-cross-item" key={candidate.color}>
                      <div className="analyzer-cross-main">
                        <span
                          className="analyzer-color-swatch"
                          aria-hidden="true"
                          style={{
                            backgroundColor: `#${COLOR_HEX[candidate.color]
                              .toString(16)
                              .padStart(6, "0")}`,
                          }}
                        />
                        <div>
                          <strong>{getColorLabel(candidate.color)} Cross</strong>
                          <small>{candidate.targetFace}面 target</small>
                        </div>
                      </div>
                      <p className="analyzer-cross-algorithm">
                        探索ボタンを押すと、CubeState上で最短候補を探します。
                      </p>
                      <div className="analyzer-cross-footer">
                        <span>max {settings.maxDepth} moves</span>
                      </div>
                    </article>
                  ))
                : crossResults.map((result) => (
                    <article className="analyzer-cross-result" key={result.color}>
                      <div className="analyzer-cross-result-head">
                        <div className="analyzer-cross-main">
                          <span
                            className="analyzer-color-swatch"
                            aria-hidden="true"
                            style={{
                              backgroundColor: `#${COLOR_HEX[result.color]
                                .toString(16)
                                .padStart(6, "0")}`,
                            }}
                          />
                          <div>
                            <strong>{getColorLabel(result.color)} Cross</strong>
                            <small>
                              {result.targetFace}面 / {result.nodes.toLocaleString()} nodes
                            </small>
                          </div>
                        </div>
                      </div>

                      {result.solutions.length === 0 ? (
                        <p className="analyzer-muted">
                          {result.maxDepth}手以内では候補が見つかりませんでした。
                        </p>
                      ) : (
                        result.solutions.map((solution, index) => (
                          <div
                            className={[
                              "analyzer-cross-item analyzer-cross-solution",
                              isSameCrossSolution(solution, bestCrossSolution) ? "is-best" : "",
                              isSameCrossSolution(solution, selectedCrossSolution)
                                ? "is-selected"
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={`${result.color}-${solution.algorithm || "solved"}-${index}`}
                          >
                            <div className="analyzer-solution-label-row">
                              {isSameCrossSolution(solution, bestCrossSolution) && (
                                <span className="analyzer-solution-badge">Best</span>
                              )}
                              {isSameCrossSolution(solution, selectedCrossSolution) && (
                                <span className="analyzer-solution-badge">選択中</span>
                              )}
                            </div>
                            <p className="analyzer-cross-algorithm">
                              {solution.algorithm || "すでにクロス完成"}
                            </p>
                            <div className="analyzer-cross-edge-row">
                              {solution.solvedEdges.map((edge) => (
                                <span key={`${solution.id}-${edge.sideFace}`}>
                                  {getColorJapanese(edge.edgeColor)}
                                  {getColorJapanese(edge.sideColor)}:{" "}
                                  {edge.solved ? "OK" : "未完了"}
                                </span>
                              ))}
                            </div>
                            <div className="analyzer-cross-footer">
                              <span>{solution.moveCount} moves</span>
                              <button type="button" onClick={() => selectCrossSolution(solution)}>
                                この手順を選択
                              </button>
                              <button
                                type="button"
                                onClick={() => selectCrossSolution(solution, { play: true })}
                              >
                                3Dで確認
                              </button>
                              <button
                                type="button"
                                onClick={() => selectCrossSolutionForF2l(solution)}
                              >
                                F2L候補を見る
                              </button>
                              <button
                                type="button"
                                onClick={() => showAiPlaceholder("Cross手順")}
                              >
                                この手順を説明
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </article>
                  ))}
            </div>

            <div className="analyzer-study-note">
              <p className="eyebrow">Practice memo</p>
              <ul>
                <li>クロスは手順暗記より、インスペクション中に4つのエッジを読む練習が大事です。</li>
                <li>D面の色だけでなく、側面色がセンターと合っているかまで見ます。</li>
                <li>1本ずつ入れるより、隣り合う2色をまとめて動かせないか探します。</li>
                <li>最後にD面を回してセンター合わせする選択肢も残しておくと、F2Lへつなげやすくなります。</li>
                <li>最初は7〜8手以内を目安に、読んだCrossを手元を見ずに回す練習へつなげます。</li>
                <li>Crossが終わる位置を予測できると、最初のF2Lペア探しがかなり楽になります。</li>
              </ul>
            </div>
          </section>

          <section className="analyzer-f2l-card" id="analyzer-f2l-section" aria-label="F2L Analyzer">
            <div className="analyzer-subheading">
              <div>
                <p className="eyebrow">F2L Analyzer</p>
                <h2>クロス後の最初のペア</h2>
              </div>
            </div>
            {selectedCrossSolution ? (
              <>
                <p className="analyzer-muted">
                  選択中のCross後状態から、4つのF2Lペアの位置と完成状況を表示します。
                </p>
                <div className="analyzer-selected-cross">
                  <span>
                    Cross: {getColorLabel(selectedCrossSolution.color)} /{" "}
                    {selectedCrossSolution.algorithm || "すでに完成"}
                  </span>
                  <button
                    type="button"
                    onClick={() => selectCrossSolution(selectedCrossSolution, { play: true })}
                  >
                    Crossを3Dで再確認
                  </button>
                </div>
                {isAnalyzingBasicF2l && (
                  <article className="analyzer-basic-f2l-plan">
                    <p className="eyebrow">Basic F2L 41</p>
                    <h3>F2L解析中...</h3>
                    <p>
                      Cross結果は表示済みです。F2Lの24順序比較とフォールバック探索だけWorkerで計算しています。
                    </p>
                  </article>
                )}
                {basicF2lError && (
                  <article className="analyzer-basic-f2l-plan">
                    <p className="eyebrow">Basic F2L 41</p>
                    <h3>F2L解析エラー</h3>
                    <p>{basicF2lError}</p>
                  </article>
                )}
                {basicF2lPlan && (
                  <article className="analyzer-basic-f2l-plan">
                    <div className="analyzer-basic-f2l-heading">
                      <div>
                        <p className="eyebrow">Basic F2L 41</p>
                        <h3>基本41パターン解析</h3>
                      </div>
                      <div className="analyzer-basic-f2l-summary">
                        <span>{basicF2lPlan.strategy === "permutation" ? "24順序比較" : "貪欲選択"}</span>
                        <span>{basicF2lPlan.steps.length} steps</span>
                        <strong>{basicF2lPlan.totalMoveCount} moves</strong>
                      </div>
                    </div>
                    <p>{basicF2lPlan.note}</p>
                    {basicF2lPlan.steps.length > 0 ? (
                      <>
                        <ol className="analyzer-basic-f2l-steps">
                          {basicF2lPlan.steps.map((step, index) => (
                            <li key={step.id}>
                              <div className="analyzer-basic-f2l-step-head">
                                <strong>
                                  Step {index + 1}: {step.pairTitle}
                                </strong>
                                <button type="button" onClick={() => playBasicF2lStep(step)}>
                                  ここまで3D再生
                                </button>
                              </div>
                              <div className="analyzer-f2l-tags">
                                <span>Target: {step.targetSlot}</span>
                                <span>Extract: {step.extractAlgorithm || "なし"}</span>
                                <span>
                                  Method: {step.method === "localSearch" ? "局所探索" : "基本41"}
                                </span>
                                <span>Case: {step.caseId}</span>
                                <span>Moves: {step.moveCount}</span>
                              </div>
                              <code>{step.algorithm}</code>
                              <p>{step.explanation}</p>
                            </li>
                          ))}
                        </ol>
                        <button
                          className="analyzer-primary-action"
                          type="button"
                          onClick={() => playBasicF2lSteps(basicF2lPlan.steps)}
                        >
                          F2L解析手順をまとめて3D再生
                        </button>
                      </>
                    ) : (
                      <p className="analyzer-muted">
                        基本41候補だけでは、このCross後状態のF2L手順を確定できませんでした。
                      </p>
                    )}
                    {basicF2lPlan.unresolvedPairs.length > 0 && (
                      <p className="analyzer-muted">
                        未解決ペア: {basicF2lPlan.unresolvedPairs.map((pair) => pair.slotLabel).join(", ")}
                      </p>
                    )}
                  </article>
                )}
                <div className="analyzer-f2l-list">
                  {f2lCandidates.length === 0 ? (
                    <p className="analyzer-muted">F2L候補を判定できませんでした。</p>
                  ) : (
                    f2lCandidates.map((candidate) => (
                      <button
                        className="analyzer-f2l-item"
                        type="button"
                        key={candidate.id}
                        aria-pressed={selectedF2lPair?.id === candidate.id}
                        onClick={() => selectF2lPair(candidate)}
                      >
                        <span>
                          <strong>{candidate.title}</strong>
                          <small>
                            {candidate.slotLabel} / Corner: {candidate.cornerPosition} / Edge:{" "}
                            {candidate.edgePosition}
                          </small>
                        </span>
                        <b>
                          {candidate.status === "completed"
                            ? "完成済み"
                            : candidate.status === "unsolved"
                              ? "未完成"
                              : "不明"}
                        </b>
                      </button>
                    ))
                  )}
                </div>

                {selectedF2lPair && (
                  <article className="analyzer-f2l-detail">
                    <h3>{selectedF2lPair.slotLabel}</h3>
                    <p>{selectedF2lPair.note}</p>
                    <div className="analyzer-f2l-tags">
                      <span>Corner: {selectedF2lPair.cornerColors.map(getColorJapanese).join("")}</span>
                      <span>Edge: {selectedF2lPair.edgeColors.map(getColorJapanese).join("")}</span>
                      <span>Slot: {selectedF2lPair.slotFaces.join("")}</span>
                    </div>
                    {selectedF2lRecommendation ? (
                      <div className="analyzer-f2l-recommendation">
                        <p className="eyebrow">{selectedF2lRecommendation.matchLabel}</p>
                        <strong>{selectedF2lRecommendation.algorithm}</strong>
                        <dl>
                          <div>
                            <dt>手数</dt>
                            <dd>{selectedF2lRecommendation.moveCount} moves</dd>
                          </div>
                          <div>
                            <dt>回しやすさ</dt>
                            <dd>{selectedF2lRecommendation.ease}</dd>
                          </div>
                        </dl>
                        <p>{selectedF2lRecommendation.description}</p>
                        <div className="analyzer-f2l-actions">
                          <button
                            className="analyzer-primary-action"
                            type="button"
                            onClick={() =>
                              onNavigate(
                                `/learn/f2l/${encodeURIComponent(
                                  getLearningCaseRouteKey(selectedF2lRecommendation.caseItem),
                                )}`,
                              )
                            }
                          >
                            Learn詳細を見る
                          </button>
                          <button
                            type="button"
                            onClick={() => playF2lRecommendation(selectedF2lRecommendation)}
                          >
                            3Dアニメーションで見る
                          </button>
                          <button
                            type="button"
                            onClick={() => showAiPlaceholder("F2L手順")}
                          >
                            この手順を説明
                          </button>
                          <button
                            type="button"
                            onClick={() => showAiPlaceholder("自分の手順比較")}
                          >
                            自分の手順と比べる
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="analyzer-muted">
                        Learn F2Lケース画像がまだありません。src/assets/learn/f2l に画像を追加すると連携できます。
                      </p>
                    )}
                  </article>
                )}
              </>
            ) : (
              <p className="analyzer-muted">
                先にCross Analyzerで候補を選ぶと、その後の状態からF2L候補を表示します。
              </p>
            )}
          </section>

          <section className="analyzer-candidate-section" aria-label="OLL candidate preview">
            <div className="analyzer-subheading">
              <div>
                <p className="eyebrow">OLL Preview</p>
                <h2>次に見るOLL候補</h2>
              </div>
            </div>
            <p className="analyzer-muted">
              OLL判定はまだ未実装です。ここではLearnにあるOLLケースを、F2L後の確認候補として表示します。
            </p>
            <div className="analyzer-candidate-grid">
              {ollCandidates.length === 0 ? (
                <p className="analyzer-muted">
                  src/assets/learn/oll に画像を追加すると、OLL候補が表示されます。
                </p>
              ) : (
                ollCandidates.map((candidate) => (
                  <article className="analyzer-candidate-card" key={candidate.id}>
                    <p className="eyebrow">{candidate.phase.toUpperCase()}</p>
                    <h3>{candidate.name}</h3>
                    <code>{candidate.algorithm}</code>
                    <p>{candidate.description}</p>
                    <div className="analyzer-f2l-tags">
                      <span>{candidate.moveCount ?? getAlgorithmMoveCount(candidate.algorithm)} moves</span>
                      {(candidate.tags ?? []).slice(0, 3).map((tag) => (
                        <span key={`${candidate.id}-${tag}`}>{tag}</span>
                      ))}
                    </div>
                    <div className="analyzer-f2l-actions">
                      <button type="button" onClick={() => playAnalyzerCandidate(candidate)}>
                        メイン3Dで見る
                      </button>
                      <button type="button" onClick={() => openAnalyzerCandidateLearn(candidate)}>
                        Learn詳細
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="analyzer-candidate-section" aria-label="PLL candidate preview">
            <div className="analyzer-subheading">
              <div>
                <p className="eyebrow">PLL Preview</p>
                <h2>最後に見るPLL候補</h2>
              </div>
            </div>
            <p className="analyzer-muted">
              PLL判定はまだ未実装です。ここではLearnにあるPLLケースを、完成までの学習フロー用に表示します。
            </p>
            <div className="analyzer-candidate-grid">
              {pllCandidates.length === 0 ? (
                <p className="analyzer-muted">
                  src/assets/learn/pll に画像を追加すると、PLL候補が表示されます。
                </p>
              ) : (
                pllCandidates.map((candidate) => (
                  <article className="analyzer-candidate-card" key={candidate.id}>
                    <p className="eyebrow">{candidate.phase.toUpperCase()}</p>
                    <h3>{candidate.name}</h3>
                    <code>{candidate.algorithm}</code>
                    <p>{candidate.description}</p>
                    <div className="analyzer-f2l-tags">
                      <span>{candidate.moveCount ?? getAlgorithmMoveCount(candidate.algorithm)} moves</span>
                      {(candidate.tags ?? []).slice(0, 3).map((tag) => (
                        <span key={`${candidate.id}-${tag}`}>{tag}</span>
                      ))}
                    </div>
                    <div className="analyzer-f2l-actions">
                      <button type="button" onClick={() => playAnalyzerCandidate(candidate)}>
                        メイン3Dで見る
                      </button>
                      <button type="button" onClick={() => openAnalyzerCandidateLearn(candidate)}>
                        Learn詳細
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </section>

        <section
          ref={playerPanelRef}
          className={[
            "analyzer-panel analyzer-player-panel",
            isAnalyzerFullscreen ? "is-fullscreen" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Virtual cube"
        >
          <div className="analyzer-player-header">
            <div>
              <p className="eyebrow">3D Cube</p>
              <h2>仮想キューブ</h2>
            </div>
            <div className="analyzer-player-actions">
              <label className="analyzer-speed-control">
                <span>Speed</span>
                <select
                  value={animationSpeed}
                  onChange={(event) =>
                    setAnimationSpeed(Number(event.target.value) as AnimationSpeed)
                  }
                >
                  {ANIMATION_SPEED_OPTIONS.map((speed) => (
                    <option key={speed} value={speed}>
                      {speed}x
                    </option>
                  ))}
                </select>
              </label>
              <div className="analyzer-step">
                Step: {currentIndex} / {activeMoves.length}
              </div>
              <button
                type="button"
                className="analyzer-fullscreen-button"
                onClick={isAnalyzerFullscreen ? exitAnalyzerFullscreen : enterAnalyzerFullscreen}
              >
                {isAnalyzerFullscreen ? "閉じる" : "全画面"}
              </button>
            </div>
          </div>

          <div
            className="analyzer-canvas-frame"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <canvas ref={canvasRef} aria-label="3D cube preview" />
          </div>

          <div className="analyzer-now">
            <span>Now: {currentMove ?? "Ready"}</span>
            <small>{nextMove ? `Next: ${nextMove}` : "最後まで再生済み、または手順待ちです。"}</small>
          </div>

          <p className="analyzer-playback-note">
            Analyzerではスクランブル適用後の状態を初期表示にし、再生リストにはCross / F2L手順だけを表示します。
          </p>

          <div className="analyzer-controls">
            <button
              type="button"
              onClick={handlePlayToggle}
              disabled={!canUseActiveSequence || activeMoves.length === 0}
            >
              {isPlaying ? "一時停止" : isComplete ? "もう一度再生" : "再生"}
            </button>
            <button type="button" onClick={() => void stepPrevious()} disabled={currentIndex <= 0}>
              1手戻る
            </button>
            <button
              type="button"
              onClick={() => void stepNext()}
              disabled={!canUseActiveSequence || currentIndex >= activeMoves.length}
            >
              1手進む
            </button>
            <button type="button" onClick={resetPlayback}>
              リセット
            </button>
            <button type="button" onClick={resetCameraView}>
              視点リセット
            </button>
          </div>

          <div className="analyzer-move-list" aria-label="Move list">
            {activeMoves.length === 0 ? (
              <span className="analyzer-move-empty">手順を入力してください。</span>
            ) : (
              activeMoves.map((move, index) => (
                <span
                  key={`${move}-${index}`}
                  className={[
                    index < currentIndex ? "is-done" : "",
                    index === currentIndex ? "is-next" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {move}
                </span>
              ))
            )}
          </div>

          <aside className="analyzer-helper-panel" aria-label="Small learning animation">
            <div className="analyzer-subheading">
              <div>
                <p className="eyebrow">Helper animation</p>
                <h2>候補単体の補助再生</h2>
              </div>
              {helperCase && (
                <button
                  type="button"
                  onClick={() =>
                    onNavigate(
                      `/learn/${helperCase.category}/${encodeURIComponent(
                        getLearningCaseRouteKey(helperCase),
                      )}`,
                    )
                  }
                >
                  Learn詳細
                </button>
              )}
            </div>
            {helperCase ? (
              <>
                <p className="analyzer-muted">
                  {helperCase.title} / {helperCase.algorithm}
                </p>
                <div className="analyzer-helper-player-frame">
                  <Suspense fallback={<p className="analyzer-muted">3Dプレイヤーを読み込み中...</p>}>
                    <AlgorithmPlayer
                      caseItem={helperCase}
                      headingLabel="Mini Preview"
                      headingTitle="補助アニメーション"
                    />
                  </Suspense>
                </div>
              </>
            ) : (
              <p className="analyzer-muted">
                F2L / OLL / PLL候補を選ぶと、ここに小さな教材アニメーションを表示します。
              </p>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}
