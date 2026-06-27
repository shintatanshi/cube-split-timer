import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import MoveButtonPanel from "../components/MoveButtonPanel";
import {
  ANIMATION_SPEED_OPTIONS,
  CUBE_COLOR_HEX,
  CUBE_DETAIL_COLORS,
  loadAnimationSpeed,
  saveAnimationSpeed,
  type AnimationSpeed,
} from "../lib/cubeVisuals";
import { getMoveDescriptor, invertAlgorithm, parseAlgorithm } from "../learn/moveNotation";
import type { MoveAxis, MoveDescriptor } from "../learn/moveNotation";
import { getLearningCasesByCategory } from "../learn/learningData";
import {
  createViewpointMoveSteps,
  reverseMoveDescriptor,
  type ViewpointMoveStep,
} from "../learn/viewpointMoves";
import {
  CROSS_SEARCH_MAX_DEPTH,
  applyAlgorithm,
  createCubeStateFromStickerColors,
  createSolvedCubeState,
  createSolvedStickerColorGrid,
  cubeStateToStickerColorGrid,
  getColorJapanese,
  getF2lPairCandidates,
} from "./cubeState";
import {
  recognizeOll,
  recognizePll,
  type LastLayerRecognition,
  type LastLayerRecognitionResult,
} from "./lastLayerRecognition";
import type {
  BasicF2lAnalysisPhase,
  BasicF2lAnalysisPlan,
  BasicF2lAnalysisStep,
  BasicF2lOrderAnalysisResult,
  CubeState,
  CubeStickerColorGrid,
  CrossSearchInput,
  CrossSearchResult,
  CrossSolution,
  F2lPairCandidate,
  F2lSlotName,
} from "./cubeState";
import type {
  AnalyzerCandidate,
  F2lPieceSpot,
  LearningCase,
  LearningCategory,
  LearningSticker,
  OllCaseImage,
  PllCaseImage,
} from "../types";

type PlaybackMode = "scramble" | "scramble-solve";
type AnalyzerInputMode = "scramble" | "color";
type AnalyzerStepKey = "scramble" | "cross" | "f2l1" | "f2l2" | "f2l3" | "f2l4" | "oll" | "pll" | "complete";
type AnalyzerCubeScale = 0.7 | 0.85 | 1 | 1.15 | 1.3;
type AnalyzerQuickPhase = "cross" | "f2l" | "nextF2l" | "oll" | "pll";
type AnalyzerPracticeStep =
  | { phase: "cross" }
  | { phase: "f2l" }
  | { phase: "f2l-step"; stepIndex: number }
  | { phase: "oll" }
  | { phase: "pll" };
type LastLayerLearnPhase = "oll" | "pll";
type CubeColorName = "white" | "yellow" | "blue" | "green" | "red" | "orange";
type FaceName = "U" | "D" | "F" | "B" | "R" | "L";
type CrossTargetFace = "D" | "U";
type ColorVector = [number, number, number];

interface BasicF2lStepRange {
  step: BasicF2lAnalysisStep;
  start: number;
  end: number;
  moves: string[];
}

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
  targetFace: FaceName;
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
  phase?: BasicF2lAnalysisPhase;
  done?: boolean;
  plan?: BasicF2lAnalysisPlan;
  orderResult?: BasicF2lOrderAnalysisResult;
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
  stickerColors: CubeColorName[];
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
  cubeScale: AnalyzerCubeScale;
  pairHighlightSignature: string | null;
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
  inputMode?: AnalyzerInputMode;
  scrambleInput: string;
  stickerColorGrid?: CubeStickerColorGrid;
  selectedPaintColor?: CubeColorName;
  solveInput: string;
  playbackScrambleInput: string;
  playbackSolveInput: string;
  playbackMode: PlaybackMode;
  currentIndex: number;
  crossResults: CrossSearchResult[];
  crossError: string | null;
  selectedCrossSolution: CrossSolution | null;
  selectedF2lPairId: string | null;
  isF2lPairHighlightEnabled?: boolean;
  helperCaseId?: string | null;
  basicF2lPlan?: BasicF2lAnalysisPlan | null;
  basicF2lOrderPlans?: BasicF2lAnalysisPlan[];
  basicF2lComparedOrderCount?: number;
  basicF2lAnalysisPhase?: BasicF2lAnalysisPhase | null;
  showBasicF2lOrderDetails?: boolean;
  basicF2lError?: string | null;
  highlightF2lSteps?: BasicF2lAnalysisStep[];
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
const ANALYZER_CUBE_SCALE_STORAGE_KEY = "cubeSplitTimer.analyzerCubeScale.v2";
const ANALYZER_CUBE_SCALE_OPTIONS: Array<{ value: AnalyzerCubeScale; label: string }> = [
  { value: 0.7, label: "70%" },
  { value: 0.85, label: "85%" },
  { value: 1, label: "100%" },
  { value: 1.15, label: "115%" },
  { value: 1.3, label: "130%" },
];
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
const COLOR_FACE_ORDER: FaceName[] = ["U", "L", "F", "R", "B", "D"];
const STICKER_CENTER_INDEX = 4;
const COLOR_HEX: Record<CubeColorName, number> = {
  white: CUBE_COLOR_HEX.white,
  yellow: CUBE_COLOR_HEX.yellow,
  blue: CUBE_COLOR_HEX.blue,
  green: CUBE_COLOR_HEX.green,
  red: CUBE_COLOR_HEX.red,
  orange: CUBE_COLOR_HEX.orange,
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
const F2L_PAIR_HIGHLIGHT_CHILD_NAME = "f2l-pair-highlight";
const CUBE_COLORS = {
  body: CUBE_DETAIL_COLORS.body,
  edge: CUBE_DETAIL_COLORS.edge,
};

function isCubeColorName(value: unknown): value is CubeColorName {
  return typeof value === "string" && COLOR_OPTIONS.some((option) => option.value === value);
}

function getColorLabel(color: CubeColorName): string {
  return COLOR_OPTIONS.find((option) => option.value === color)?.label ?? color;
}

function getColorCss(color: CubeColorName): string {
  return `#${COLOR_HEX[color].toString(16).padStart(6, "0")}`;
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

function getFaceForColor(
  faceColorMap: Record<FaceName, CubeColorName>,
  color: CubeColorName,
): FaceName | null {
  return (
    (Object.keys(faceColorMap) as FaceName[]).find((face) => faceColorMap[face] === color) ??
    null
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

function isAnalyzerInputMode(value: unknown): value is AnalyzerInputMode {
  return value === "scramble" || value === "color";
}

function isPlaybackMode(value: unknown): value is PlaybackMode {
  return value === "scramble" || value === "scramble-solve";
}

function isBasicF2lAnalysisPhase(value: unknown): value is BasicF2lAnalysisPhase {
  return value === "basic41" || value === "fallback";
}

function normalizeStickerColorGrid(
  value: unknown,
  faceColorMap: Record<FaceName, CubeColorName>,
): CubeStickerColorGrid {
  if (!value || typeof value !== "object") {
    return createSolvedStickerColorGrid(faceColorMap);
  }

  const rawGrid = value as Partial<Record<FaceName, unknown>>;
  const nextGrid = createSolvedStickerColorGrid(faceColorMap);

  (Object.keys(nextGrid) as FaceName[]).forEach((face) => {
    const colors = rawGrid[face];

    if (!Array.isArray(colors) || colors.length !== 9) {
      return;
    }

    nextGrid[face] = colors.map((color, index) =>
      index === STICKER_CENTER_INDEX
        ? faceColorMap[face]
        : isCubeColorName(color)
          ? color
          : nextGrid[face][index],
    );
  });

  return nextGrid;
}

function loadAnalyzerSpeed(): AnimationSpeed {
  return loadAnimationSpeed([ANALYZER_SPEED_STORAGE_KEY]);
}

function saveAnalyzerSpeed(speed: AnimationSpeed): void {
  saveAnimationSpeed(speed);
}

function isAnalyzerCubeScale(value: number): value is AnalyzerCubeScale {
  return ANALYZER_CUBE_SCALE_OPTIONS.some((option) => option.value === value);
}

function loadAnalyzerCubeScale(): AnalyzerCubeScale {
  try {
    const parsed = Number(localStorage.getItem(ANALYZER_CUBE_SCALE_STORAGE_KEY));

    return isAnalyzerCubeScale(parsed) ? parsed : 1;
  } catch {
    return 1;
  }
}

function saveAnalyzerCubeScale(scale: AnalyzerCubeScale): void {
  try {
    localStorage.setItem(ANALYZER_CUBE_SCALE_STORAGE_KEY, String(scale));
  } catch {
    // Analyzer display size is local convenience data; the page should still work.
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
    const normalizedFaceColorMap = buildFaceColorMap(normalizedSettings) ?? DEFAULT_FACE_COLOR_MAP;

    const scrambleInput =
      typeof parsed.scrambleInput === "string" ? parsed.scrambleInput : "R U R' U'";
    const solveInput = typeof parsed.solveInput === "string" ? parsed.solveInput : "";
    const inputMode = isAnalyzerInputMode(parsed.inputMode) ? parsed.inputMode : "scramble";
    const basicF2lPlan =
      parsed.basicF2lPlan && typeof parsed.basicF2lPlan === "object"
        ? (parsed.basicF2lPlan as BasicF2lAnalysisPlan)
        : null;

    return {
      version: 1,
      settings: normalizedSettings,
      inputMode,
      scrambleInput,
      stickerColorGrid: normalizeStickerColorGrid(parsed.stickerColorGrid, normalizedFaceColorMap),
      selectedPaintColor: isCubeColorName(parsed.selectedPaintColor)
        ? parsed.selectedPaintColor
        : normalizedSettings.crossColor,
      solveInput,
      playbackScrambleInput:
        typeof parsed.playbackScrambleInput === "string" && isAnalyzerInputMode(parsed.inputMode)
          ? parsed.playbackScrambleInput
          : "",
      playbackSolveInput:
        typeof parsed.playbackSolveInput === "string" ? parsed.playbackSolveInput : solveInput,
      playbackMode: isPlaybackMode(parsed.playbackMode) ? parsed.playbackMode : "scramble-solve",
      currentIndex:
        typeof parsed.currentIndex === "number" && Number.isFinite(parsed.currentIndex)
          ? Math.max(0, Math.round(parsed.currentIndex))
          : 0,
      crossResults: Array.isArray(parsed.crossResults) ? parsed.crossResults : [],
      crossError: typeof parsed.crossError === "string" ? parsed.crossError : null,
      selectedCrossSolution: parsed.selectedCrossSolution ?? null,
      selectedF2lPairId:
        typeof parsed.selectedF2lPairId === "string" ? parsed.selectedF2lPairId : null,
      isF2lPairHighlightEnabled:
        typeof parsed.isF2lPairHighlightEnabled === "boolean"
          ? parsed.isF2lPairHighlightEnabled
          : true,
      helperCaseId: typeof parsed.helperCaseId === "string" ? parsed.helperCaseId : null,
      basicF2lPlan,
      basicF2lOrderPlans: Array.isArray(parsed.basicF2lOrderPlans)
        ? (parsed.basicF2lOrderPlans as BasicF2lAnalysisPlan[])
        : [],
      basicF2lComparedOrderCount:
        typeof parsed.basicF2lComparedOrderCount === "number" &&
          Number.isFinite(parsed.basicF2lComparedOrderCount)
          ? Math.max(0, Math.round(parsed.basicF2lComparedOrderCount))
          : 0,
      basicF2lAnalysisPhase: isBasicF2lAnalysisPhase(parsed.basicF2lAnalysisPhase)
        ? parsed.basicF2lAnalysisPhase
        : null,
      showBasicF2lOrderDetails: Boolean(parsed.showBasicF2lOrderDetails),
      basicF2lError: typeof parsed.basicF2lError === "string" ? parsed.basicF2lError : null,
      highlightF2lSteps: Array.isArray(parsed.highlightF2lSteps) && parsed.highlightF2lSteps.length > 0
        ? (parsed.highlightF2lSteps as BasicF2lAnalysisStep[])
        : basicF2lPlan?.steps ?? [],
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
  color: number,
  opacity: number,
) {
  const sticker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.68),
    createStickerMaterial(color, opacity),
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

function getCubieStickerColorsFromSolvedPosition(
  x: number,
  y: number,
  z: number,
  faceColorMap: Record<FaceName, CubeColorName>,
): CubeColorName[] {
  const colors: CubeColorName[] = [];

  if (y === 1) {
    colors.push(faceColorMap.U);
  }

  if (y === -1) {
    colors.push(faceColorMap.D);
  }

  if (z === 1) {
    colors.push(faceColorMap.F);
  }

  if (z === -1) {
    colors.push(faceColorMap.B);
  }

  if (x === 1) {
    colors.push(faceColorMap.R);
  }

  if (x === -1) {
    colors.push(faceColorMap.L);
  }

  return colors;
}

function getColorSetSignature(colors: CubeColorName[]): string {
  return [...colors].sort().join("|");
}

function hasSameColorSet(actualColors: CubeColorName[], targetColors: CubeColorName[]): boolean {
  return (
    actualColors.length === targetColors.length &&
    getColorSetSignature(actualColors) === getColorSetSignature(targetColors)
  );
}

function clearF2lPairHighlights(cubies: Cubie[]) {
  cubies.forEach((cubie) => {
    cubie.group.scale.setScalar(1);
    cubie.group.children
      .filter((child) => child.name === F2L_PAIR_HIGHLIGHT_CHILD_NAME)
      .forEach((child) => {
        cubie.group.remove(child);
        disposeObject(child);
      });
  });
}

function addF2lPairHighlight(cubie: Cubie, color: number) {
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.08, 1.08, 1.08)),
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.96,
    }),
  );

  highlight.name = F2L_PAIR_HIGHLIGHT_CHILD_NAME;
  cubie.group.add(highlight);
  cubie.group.scale.setScalar(1.07);
}

function syncF2lPairHighlight(
  state: SceneState,
  candidate: F2lPairCandidate | null,
  isEnabled: boolean,
) {
  const signature =
    isEnabled && candidate
      ? `${candidate.id}:${getColorSetSignature(candidate.cornerColors)}:${getColorSetSignature(
          candidate.edgeColors,
        )}`
      : "off";

  if (state.pairHighlightSignature === signature) {
    return;
  }

  clearF2lPairHighlights(state.cubies);
  state.pairHighlightSignature = signature;

  if (!isEnabled || !candidate) {
    return;
  }

  const cornerCubie = state.cubies.find((cubie) =>
    hasSameColorSet(cubie.stickerColors, candidate.cornerColors),
  );
  const edgeCubie = state.cubies.find((cubie) =>
    hasSameColorSet(cubie.stickerColors, candidate.edgeColors),
  );

  if (cornerCubie) {
    addF2lPairHighlight(cornerCubie, 0xf2b84b);
  }

  if (edgeCubie) {
    addF2lPairHighlight(edgeCubie, 0x4fd1b0);
  }
}

function markSceneCubiesChanged(state: SceneState) {
  state.pairHighlightSignature = null;
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
    addSticker(group, "U", COLOR_HEX[faceColorMap.U], stickerOpacity);
  }

  if (y === -1) {
    addSticker(group, "D", COLOR_HEX[faceColorMap.D], stickerOpacity);
  }

  if (z === 1) {
    addSticker(group, "F", COLOR_HEX[faceColorMap.F], stickerOpacity);
  }

  if (z === -1) {
    addSticker(group, "B", COLOR_HEX[faceColorMap.B], stickerOpacity);
  }

  if (x === 1) {
    addSticker(group, "R", COLOR_HEX[faceColorMap.R], stickerOpacity);
  }

  if (x === -1) {
    addSticker(group, "L", COLOR_HEX[faceColorMap.L], stickerOpacity);
  }

  return {
    group,
    coord: new THREE.Vector3(x, y, z),
    stickerColors: getCubieStickerColorsFromSolvedPosition(x, y, z, faceColorMap),
  };
}

function getCenterFaceFromCoord(x: number, y: number, z: number): FaceName | null {
  if (y === 1) {
    return "U";
  }

  if (y === -1) {
    return "D";
  }

  if (z === 1) {
    return "F";
  }

  if (z === -1) {
    return "B";
  }

  if (x === 1) {
    return "R";
  }

  if (x === -1) {
    return "L";
  }

  return null;
}

function createCubieWithStickers(
  x: number,
  y: number,
  z: number,
  stickers: Array<{ face: FaceName; color: CubeColorName }>,
): Cubie {
  const group = new THREE.Group();
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
  stickers.forEach((sticker) => {
    addSticker(group, sticker.face, COLOR_HEX[sticker.color], 1);
  });

  return {
    group,
    coord: new THREE.Vector3(x, y, z),
    stickerColors: stickers.map((sticker) => sticker.color),
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

function createCubiesFromCubeState(cubeGroup: THREE.Group, cubeState: CubeState): Cubie[] {
  disposeObject(cubeGroup);
  cubeGroup.clear();
  cubeGroup.position.set(0, 0, 0);

  const piecesByCoord = new Map(
    cubeState.pieces.map((piece) => [piece.coord.join(","), piece]),
  );
  const cubies: Cubie[] = [];

  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        const nonZeroCount = [x, y, z].filter((value) => value !== 0).length;
        const piece = piecesByCoord.get([x, y, z].join(","));
        const centerFace = nonZeroCount === 1 ? getCenterFaceFromCoord(x, y, z) : null;
        const stickers = piece
          ? piece.stickers
          : centerFace
            ? [{ face: centerFace, color: cubeState.faceColorMap[centerFace] }]
            : [];
        const cubie = createCubieWithStickers(x, y, z, stickers);

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

  state.cubeGroup.scale.setScalar(scale * state.cubeScale);
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

function applyDescriptorInstant(
  cubeGroup: THREE.Group,
  cubies: Cubie[],
  descriptor: MoveDescriptor,
) {
  applyMoveTransform(cubeGroup, cubies, descriptor, descriptor.angle);
}

function applyViewpointMovesInstant(
  cubeGroup: THREE.Group,
  cubies: Cubie[],
  moves: string[],
) {
  createViewpointMoveSteps(moves).forEach((step) => {
    if (step.descriptor) {
      applyDescriptorInstant(cubeGroup, cubies, step.descriptor);
    }
  });
}

function getPlaybackModeLabel(mode: PlaybackMode): string {
  return mode === "scramble" ? "崩した状態" : "崩した状態 + 手順";
}

function getPracticeStepLabel(step: AnalyzerPracticeStep | null): string {
  if (!step) {
    return "前ステップ";
  }

  if (step.phase === "f2l-step") {
    return `F2L ${step.stepIndex + 1}`;
  }

  if (step.phase === "f2l") {
    return "F2L";
  }

  if (step.phase === "cross") {
    return "Cross";
  }

  return step.phase.toUpperCase();
}

function getLearningCaseRouteKey(caseItem: LearningCase): string {
  return caseItem.image.kind === "asset" ? caseItem.image.baseName : caseItem.id;
}

function getAlgorithmMoveCount(algorithm: string): number {
  return parseAlgorithm(algorithm).moves.length;
}

function movesStartWith(moves: string[], prefix: string[]): boolean {
  return (
    prefix.length <= moves.length &&
    prefix.every((move, index) => moves[index] === move)
  );
}

function movesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && movesStartWith(a, b);
}

function buildBasicF2lStepRanges(steps: BasicF2lAnalysisStep[]): BasicF2lStepRange[] {
  let start = 0;

  return steps.map((step) => {
    const moves = parseAlgorithm(step.fullAlgorithm).moves;
    const range = {
      step,
      start,
      end: start + moves.length,
      moves,
    };
    start = range.end;

    return range;
  });
}

function getCandidateSlotName(candidate: F2lPairCandidate): F2lSlotName | null {
  const slotName = candidate.slotLabel.split(" ")[0];

  return slotName === "FR" || slotName === "FL" || slotName === "BR" || slotName === "BL"
    ? slotName
    : null;
}

function getF2lCandidateBySlot(
  candidates: F2lPairCandidate[],
  slotName: F2lSlotName,
): F2lPairCandidate | null {
  return candidates.find((candidate) => getCandidateSlotName(candidate) === slotName) ?? null;
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

const ANALYZER_PREVIEW_SPOTS: F2lPieceSpot[] = [
  "topLeft",
  "top",
  "topRight",
  "left",
  "center",
  "right",
  "bottomLeft",
  "bottom",
  "bottomRight",
];

const ANALYZER_PREVIEW_POINTS: Record<F2lPieceSpot, { x: number; y: number }> = {
  topLeft: { x: 54, y: 36 },
  top: { x: 95, y: 30 },
  topRight: { x: 136, y: 36 },
  left: { x: 45, y: 74 },
  center: { x: 95, y: 74 },
  right: { x: 145, y: 74 },
  bottomLeft: { x: 54, y: 112 },
  bottom: { x: 95, y: 118 },
  bottomRight: { x: 136, y: 112 },
};

function getAnalyzerStickerClass(sticker: LearningSticker): string {
  return `case-sticker case-sticker-${sticker}`;
}

function AnalyzerLastLayerCasePreview({
  caseItem,
  phase,
  title,
}: {
  caseItem: LearningCase | null;
  phase: LastLayerLearnPhase;
  title: string;
}) {
  const className = `case-preview case-preview-${phase} case-preview-detail analyzer-learn-preview-shape`;

  if (!caseItem) {
    return (
      <div className="analyzer-learn-preview-skip" role="img" aria-label={`${phase.toUpperCase()} skip`}>
        <span>{phase.toUpperCase()}</span>
        <strong>Skip</strong>
      </div>
    );
  }

  if (caseItem.image.kind === "asset") {
    return (
      <span
        aria-label={`${caseItem.name} image`}
        className={`${className} case-preview-image-shell`}
        role="img"
      >
        <img alt="" className="case-preview-image" src={caseItem.imageUrl} />
      </span>
    );
  }

  if (caseItem.image.kind === "oll") {
    return (
      <AnalyzerOllPreview
        image={caseItem.image}
        label={caseItem.name}
        className={className}
      />
    );
  }

  if (caseItem.image.kind === "pll") {
    return (
      <AnalyzerPllPreview
        caseId={caseItem.id}
        image={caseItem.image}
        label={caseItem.name}
        className={className}
      />
    );
  }

  return (
    <div className="analyzer-learn-preview-skip" role="img" aria-label={title}>
      <span>{phase.toUpperCase()}</span>
      <strong>{caseItem.name}</strong>
    </div>
  );
}

function AnalyzerOllPreview({
  image,
  label,
  className,
}: {
  image: OllCaseImage;
  label: string;
  className: string;
}) {
  const sidePositions = [
    { x: 53, y: 12 },
    { x: 82, y: 12 },
    { x: 111, y: 12 },
    { x: 139, y: 32 },
    { x: 139, y: 61 },
    { x: 139, y: 90 },
    { x: 111, y: 119 },
    { x: 82, y: 119 },
    { x: 53, y: 119 },
    { x: 24, y: 90 },
    { x: 24, y: 61 },
    { x: 24, y: 32 },
  ];

  return (
    <svg aria-label={`${label} shape`} className={className} role="img" viewBox="0 0 190 150">
      <rect className="case-preview-bg" height="140" rx="16" width="180" x="5" y="5" />
      <path className="oll-thumb-side oll-thumb-front" d="M52 122 H140 L127 138 H64 Z" />
      <path className="oll-thumb-side oll-thumb-right" d="M140 34 L158 51 V105 L140 122 Z" />
      <text className="case-preview-badge" x="16" y="25">
        OLL {image.number}
      </text>
      {sidePositions.map((position, index) => (
        <rect
          className={getAnalyzerStickerClass(image.side[index] ?? "empty")}
          height="16"
          key={`${image.number}-side-${index}`}
          rx="4"
          width="24"
          x={position.x}
          y={position.y}
        />
      ))}
      <g className="oll-top-grid">
        {image.top.map((sticker, index) => {
          const row = Math.floor(index / 3);
          const column = index % 3;

          return (
            <rect
              className={getAnalyzerStickerClass(sticker)}
              height="28"
              key={`${image.number}-${index}`}
              rx="6"
              width="28"
              x={53 + column * 29}
              y={34 + row * 29}
            />
          );
        })}
      </g>
    </svg>
  );
}

function AnalyzerPllPreview({
  caseId,
  image,
  label,
  className,
}: {
  caseId: string;
  image: PllCaseImage;
  label: string;
  className: string;
}) {
  const markerId = `analyzer-arrow-${caseId}`;

  return (
    <svg aria-label={`${label} shape`} className={className} role="img" viewBox="0 0 190 150">
      <defs>
        <marker id={markerId} markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
          <path className="pll-arrow-head" d="M0,0 L8,4 L0,8 Z" />
        </marker>
      </defs>
      <rect className="case-preview-bg" height="140" rx="16" width="180" x="5" y="5" />
      <path className="pll-thumb-side pll-thumb-front" d="M55 121 H142 L128 138 H66 Z" />
      <path className="pll-thumb-side pll-thumb-right" d="M142 36 L160 53 V105 L142 121 Z" />
      <text className="case-preview-badge" x="16" y="25">
        {image.label}
      </text>
      {image.top.map((sticker, index) => {
        const row = Math.floor(index / 3);
        const column = index % 3;
        const spot = ANALYZER_PREVIEW_SPOTS[index];

        return (
          <rect
            className={`${getAnalyzerStickerClass(sticker)} ${
              spot && image.blocks.includes(spot) ? "pll-block-sticker" : ""
            }`}
            height="26"
            key={`${image.label}-${index}`}
            rx="6"
            width="26"
            x={56 + column * 29}
            y={36 + row * 29}
          />
        );
      })}
      {image.arrows.map((arrow, index) => {
        const from = ANALYZER_PREVIEW_POINTS[arrow.from];
        const to = ANALYZER_PREVIEW_POINTS[arrow.to];

        return (
          <path
            className={`pll-arrow pll-arrow-${arrow.kind}`}
            d={`M${from.x} ${from.y} Q95 75 ${to.x} ${to.y}`}
            key={`${image.label}-${index}`}
            markerEnd={`url(#${markerId})`}
          />
        );
      })}
    </svg>
  );
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

function buildCrossCandidates(
  settings: AnalyzerSettings,
  scrambleMoves: string[],
  faceColorMap: Record<FaceName, CubeColorName>,
): CrossCandidate[] {
  const colors = settings.showAllCrossColors
    ? COLOR_OPTIONS.map((option) => option.value)
    : [settings.crossColor];
  const inverseScramble = invertAlgorithm(scrambleMoves);
  const algorithm = inverseScramble.join(" ");

  return colors.map((color) => ({
    color,
    targetFace: settings.showAllCrossColors
      ? getFaceForColor(faceColorMap, color) ?? settings.crossTargetFace
      : settings.crossTargetFace,
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
      inputMode: "scramble",
      scrambleInput: incomingScramble,
      stickerColorGrid:
        savedState?.stickerColorGrid ??
        createSolvedStickerColorGrid(
          buildFaceColorMap(savedState?.settings ?? loadAnalyzerSettings()) ?? DEFAULT_FACE_COLOR_MAP,
        ),
      selectedPaintColor: savedState?.selectedPaintColor ?? DEFAULT_ANALYZER_SETTINGS.crossColor,
      solveInput: "",
      playbackScrambleInput: "",
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
  const isManualMoveAnimatingRef = useRef(false);
  const animationRunRef = useRef(0);
  const crossWorkerRef = useRef<Worker | null>(null);
  const crossJobIdRef = useRef(0);
  const f2lAnalysisWorkerRef = useRef<Worker | null>(null);
  const f2lAnalysisJobIdRef = useRef(0);
  const pendingQuickPhaseRef = useRef<AnalyzerQuickPhase | null>(null);
  const playerPanelRef = useRef<HTMLElement | null>(null);
  const lastAnalyzerStartStateSignatureRef = useRef<string | null>(null);
  const lastSelectedCrossSolutionSignatureRef = useRef<string | null>(null);
  const lastRestoredSceneIdRef = useRef(0);
  const skipNextSettingsSaveCountRef = useRef(0);
  const skipNextAnalyzerStateSaveCountRef = useRef(0);
  const selectedF2lPairRef = useRef<F2lPairCandidate | null>(null);
  const isF2lPairHighlightEnabledRef = useRef(
    initialAnalyzerState?.isF2lPairHighlightEnabled ?? true,
  );
  const [sceneReadyId, setSceneReadyId] = useState(0);
  const [settings, setSettings] = useState<AnalyzerSettings>(
    () => initialAnalyzerState?.settings ?? loadAnalyzerSettings(),
  );
  const [inputMode, setInputMode] = useState<AnalyzerInputMode>(
    () => initialAnalyzerState?.inputMode ?? "scramble",
  );
  const [scrambleInput, setScrambleInput] = useState(
    () => initialAnalyzerState?.scrambleInput ?? "R U R' U'",
  );
  const [stickerColorGrid, setStickerColorGrid] = useState<CubeStickerColorGrid>(() => {
    const initialSettings = initialAnalyzerState?.settings ?? loadAnalyzerSettings();
    const initialFaceColorMap = buildFaceColorMap(initialSettings) ?? DEFAULT_FACE_COLOR_MAP;

    return initialAnalyzerState?.stickerColorGrid ?? createSolvedStickerColorGrid(initialFaceColorMap);
  });
  const [selectedPaintColor, setSelectedPaintColor] = useState<CubeColorName>(
    () => initialAnalyzerState?.selectedPaintColor ?? DEFAULT_ANALYZER_SETTINGS.crossColor,
  );
  const [solveInput, setSolveInput] = useState(() => initialAnalyzerState?.solveInput ?? "");
  const [playbackScrambleInput, setPlaybackScrambleInput] = useState(
    () => initialAnalyzerState?.playbackScrambleInput ?? "",
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
  const [cubeScale, setCubeScale] = useState<AnalyzerCubeScale>(() => loadAnalyzerCubeScale());
  const [isAnalyzerFullscreen, setIsAnalyzerFullscreen] = useState(false);
  const [manualMoveHistory, setManualMoveHistory] = useState<string[]>([]);
  const [isManualMoveAnimating, setIsManualMoveAnimating] = useState(false);
  const [showManualControls, setShowManualControls] = useState(false);
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
  const [isF2lPairHighlightEnabled, setIsF2lPairHighlightEnabled] = useState(
    () => initialAnalyzerState?.isF2lPairHighlightEnabled ?? true,
  );
  const [helperCaseId, setHelperCaseId] = useState<string | null>(
    () => initialAnalyzerState?.helperCaseId ?? null,
  );
  const [basicF2lPlan, setBasicF2lPlan] = useState<BasicF2lAnalysisPlan | null>(
    () => initialAnalyzerState?.basicF2lPlan ?? null,
  );
  const [basicF2lOrderPlans, setBasicF2lOrderPlans] = useState<BasicF2lAnalysisPlan[]>(
    () => initialAnalyzerState?.basicF2lOrderPlans ?? [],
  );
  const [basicF2lComparedOrderCount, setBasicF2lComparedOrderCount] = useState(
    () => initialAnalyzerState?.basicF2lComparedOrderCount ?? 0,
  );
  const [basicF2lAnalysisPhase, setBasicF2lAnalysisPhase] = useState<BasicF2lAnalysisPhase | null>(
    () => initialAnalyzerState?.basicF2lAnalysisPhase ?? null,
  );
  const [showBasicF2lOrderDetails, setShowBasicF2lOrderDetails] = useState(
    () => initialAnalyzerState?.showBasicF2lOrderDetails ?? false,
  );
  const [isAnalyzingBasicF2l, setIsAnalyzingBasicF2l] = useState(false);
  const [isLoadingBasicF2lOrderDetails, setIsLoadingBasicF2lOrderDetails] = useState(false);
  const [basicF2lError, setBasicF2lError] = useState<string | null>(
    () => initialAnalyzerState?.basicF2lError ?? null,
  );
  const [highlightF2lSteps, setHighlightF2lSteps] = useState<BasicF2lAnalysisStep[]>(
    () => initialAnalyzerState?.highlightF2lSteps ?? [],
  );
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [quickPlaybackStatus, setQuickPlaybackStatus] = useState("待機中");
  const [currentPracticeStep, setCurrentPracticeStep] =
    useState<AnalyzerPracticeStep | null>(null);
  const [lastLayerLearnPreviewPhase, setLastLayerLearnPreviewPhase] =
    useState<LastLayerLearnPhase | null>(null);

  const orientationError = useMemo(() => getOrientationError(settings), [settings]);
  const faceColorMap = useMemo(
    () => buildFaceColorMap(settings) ?? DEFAULT_FACE_COLOR_MAP,
    [settings],
  );
  const canUseOrientation = orientationError === null;
  const selectedCrossSolutionSignature = useMemo(
    () =>
      selectedCrossSolution
        ? [
          selectedCrossSolution.color,
          selectedCrossSolution.targetFace,
          selectedCrossSolution.algorithm,
          selectedCrossSolution.moveCount,
        ].join("|")
        : "none",
    [selectedCrossSolution],
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
  const canUseScramble = unsupportedScrambleTokens.length === 0 && canUseOrientation;
  const stickerColorSignature = useMemo(
    () => COLOR_FACE_ORDER.map((face) => stickerColorGrid[face].join(",")).join("|"),
    [stickerColorGrid],
  );
  const analyzerStartStateSignature = useMemo(
    () =>
      [
        inputMode,
        scrambleInput,
        settings.crossColor,
        settings.crossTargetFace,
        settings.frontColor,
        settings.maxDepth,
        settings.showAllCrossColors ? "all" : "single",
        settings.topColor,
        stickerColorSignature,
      ].join("|"),
    [
      inputMode,
      scrambleInput,
      settings.crossColor,
      settings.crossTargetFace,
      settings.frontColor,
      settings.maxDepth,
      settings.showAllCrossColors,
      settings.topColor,
      stickerColorSignature,
    ],
  );
  const colorInputResult = useMemo(
    () => createCubeStateFromStickerColors(stickerColorGrid, faceColorMap),
    [faceColorMap, stickerColorGrid],
  );
  const scrambleStartState = useMemo(
    () =>
      unsupportedScrambleTokens.length === 0 && canUseOrientation
        ? applyAlgorithm(createSolvedCubeState(faceColorMap), parsedScramble.moves)
        : null,
    [canUseOrientation, faceColorMap, parsedScramble.moves, unsupportedScrambleTokens.length],
  );
  const activeStartState = inputMode === "color" ? colorInputResult.state : scrambleStartState;
  const canUseColorInput = Boolean(colorInputResult.state) && canUseOrientation;
  const canUseStartState = inputMode === "color" ? canUseColorInput : canUseScramble;
  const startInputLabel = inputMode === "color" ? "Color" : "Scramble";
  const startInputCount =
    inputMode === "color"
      ? colorInputResult.state
        ? "OK"
        : `${colorInputResult.errors.length} errors`
      : String(parsedScramble.moves.length);
  const stickerColorCounts = useMemo(() => {
    const counts: Record<CubeColorName, number> = {
      white: 0,
      yellow: 0,
      blue: 0,
      green: 0,
      red: 0,
      orange: 0,
    };

    COLOR_FACE_ORDER.forEach((face) => {
      stickerColorGrid[face].forEach((color) => {
        counts[color] += 1;
      });
    });

    return counts;
  }, [stickerColorGrid]);
  const crossCandidates = useMemo(
    () => buildCrossCandidates(settings, parsedScramble.moves, faceColorMap),
    [faceColorMap, parsedScramble.moves, settings],
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
  const activeMoveSteps = useMemo(
    () => createViewpointMoveSteps(activeMoves),
    [activeMoves],
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
  const canUseActiveSequence =
    activeInvalidTokens.length === 0 &&
    canUseOrientation &&
    (inputMode !== "color" || canUseColorInput);
  const isComplete = activeMoves.length > 0 && currentIndex >= activeMoves.length;
  const otherBasicF2lOrderPlans = useMemo(
    () => basicF2lOrderPlans.filter((plan) => plan.id !== basicF2lPlan?.id),
    [basicF2lOrderPlans, basicF2lPlan?.id],
  );
  const canLoadMoreBasicF2lOrderPlans = Boolean(
    basicF2lPlan && basicF2lComparedOrderCount > basicF2lOrderPlans.length,
  );
  const basicF2lLoadingTitle = isLoadingBasicF2lOrderDetails
    ? "他の順序候補を計算中..."
    : basicF2lAnalysisPhase === "basic41" && basicF2lPlan
      ? "未解決ペアを補助探索中..."
      : "F2L解析中...";
  const basicF2lLoadingDescription = isLoadingBasicF2lOrderDetails
    ? "最短順序は残したまま、表示用の別順序候補だけを追加で計算しています。"
    : basicF2lAnalysisPhase === "basic41" && basicF2lPlan
      ? "表示中のDB候補を残したまま、未解決ペアだけを詳しく探しています。"
      : "既存の基本41DBを使って、F2Lの最短順序だけをWorkerで先に計算しています。";
  const moreBasicF2lOrderButtonLabel = isLoadingBasicF2lOrderDetails
    ? "他の順序候補を計算中..."
    : showBasicF2lOrderDetails
      ? "他の順序候補を閉じる"
      : `他の順序候補をもっと見る（${
          otherBasicF2lOrderPlans.length > 0
            ? otherBasicF2lOrderPlans.length
            : Math.max(0, basicF2lComparedOrderCount - 1)
        }件）`;

  const resetCubeState = useCallback(() => {
    const state = sceneStateRef.current;

    if (!state) {
      return;
    }

    animationRunRef.current += 1;
    isAnimatingRef.current = false;
    state.cubies = createSolvedCubies(state.cubeGroup, faceColorMap);
    markSceneCubiesChanged(state);
  }, [faceColorMap]);

  const applyStartStateInstant = useCallback(() => {
    const state = sceneStateRef.current;

    if (!state || !activeStartState) {
      return false;
    }

    animationRunRef.current += 1;
    isAnimatingRef.current = false;
    state.cubies = createCubiesFromCubeState(state.cubeGroup, activeStartState);
    markSceneCubiesChanged(state);
    return true;
  }, [activeStartState]);

  const resetCameraView = useCallback(() => {
    const state = sceneStateRef.current;

    if (!state) {
      return;
    }

    resetViewRotation(state.cubeGroup);
  }, []);

  const resetCubeToPlaybackStart = useCallback(
    (mode: PlaybackMode = playbackMode) => {
      if (!applyStartStateInstant()) {
        resetCubeState();
      }

      if (mode !== "scramble-solve") {
        return;
      }

      const state = sceneStateRef.current;

      if (!state) {
        return;
      }

      applyViewpointMovesInstant(
        state.cubeGroup,
        state.cubies,
        parsedPlaybackScramble.moves,
      );
    },
    [applyStartStateInstant, parsedPlaybackScramble.moves, playbackMode, resetCubeState],
  );

  const animateDescriptor = useCallback(async (descriptor: MoveDescriptor | null | undefined) => {
    const state = sceneStateRef.current;

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

  const animateMove = useCallback(
    async (move: string, reverse = false) =>
      animateDescriptor(getMoveDescriptor(move, reverse)),
    [animateDescriptor],
  );

  const animateViewpointStep = useCallback(
    async (step: ViewpointMoveStep | null | undefined, reverse = false) => {
      if (!step) {
        return false;
      }

      if (!step.descriptor) {
        return !isAnimatingRef.current;
      }

      return animateDescriptor(
        reverse ? reverseMoveDescriptor(step.descriptor) : step.descriptor,
      );
    },
    [animateDescriptor],
  );

  const resetPlayback = useCallback(() => {
    setIsPlaying(false);
    setCurrentIndex(0);
    setManualMoveHistory([]);
    resetCubeToPlaybackStart();
  }, [resetCubeToPlaybackStart]);

  const applyManualMove = useCallback(async (move: string) => {
    if (!sceneStateRef.current || !getMoveDescriptor(move) || isManualMoveAnimatingRef.current) {
      return;
    }

    setIsPlaying(false);
    isManualMoveAnimatingRef.current = true;
    setIsManualMoveAnimating(true);

    try {
      const didMove = await animateMove(move);

      if (didMove) {
        setManualMoveHistory((history) => [...history, move]);
      }
    } finally {
      isManualMoveAnimatingRef.current = false;
      setIsManualMoveAnimating(false);
    }
  }, [animateMove]);

  const undoManualMove = useCallback(async () => {
    if (
      !sceneStateRef.current ||
      manualMoveHistory.length === 0 ||
      isManualMoveAnimatingRef.current
    ) {
      return;
    }

    const lastMove = manualMoveHistory[manualMoveHistory.length - 1];
    const inverseMove = invertAlgorithm([lastMove])[0];

    if (!inverseMove) {
      return;
    }

    setIsPlaying(false);
    isManualMoveAnimatingRef.current = true;
    setIsManualMoveAnimating(true);

    try {
      const didMove = await animateMove(inverseMove);

      if (didMove) {
        setManualMoveHistory((history) => history.slice(0, -1));
      }
    } finally {
      isManualMoveAnimatingRef.current = false;
      setIsManualMoveAnimating(false);
    }
  }, [animateMove, manualMoveHistory]);

  const resetManualMoves = useCallback(async () => {
    if (
      !sceneStateRef.current ||
      manualMoveHistory.length === 0 ||
      isManualMoveAnimatingRef.current
    ) {
      return;
    }

    setIsPlaying(false);
    isManualMoveAnimatingRef.current = true;
    setIsManualMoveAnimating(true);

    try {
      let completedCount = 0;
      for (const move of invertAlgorithm(manualMoveHistory)) {
        const didMove = await animateMove(move);

        if (!didMove) {
          break;
        }

        completedCount += 1;
      }

      if (completedCount > 0) {
        setManualMoveHistory((history) => history.slice(0, -completedCount));
      }
    } finally {
      isManualMoveAnimatingRef.current = false;
      setIsManualMoveAnimating(false);
    }
  }, [animateMove, manualMoveHistory]);

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
    const fillLight = new THREE.DirectionalLight(0x4fd1b0, 0.85);
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
      cubeScale,
      pairHighlightSignature: null,
    };

    sceneStateRef.current = state;
    setSceneReadyId((id) => id + 1);
    resizeRenderer(state, canvas);
    state.resizeObserver.observe(canvas);

    const render = (now: number) => {
      const elapsed = now - state.animationStart;
      state.cubeGroup.position.y = Math.sin(elapsed / 980) * 0.03;
      syncF2lPairHighlight(
        state,
        selectedF2lPairRef.current,
        isF2lPairHighlightEnabledRef.current,
      );
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

    applyViewpointMovesInstant(
      restoredState.cubeGroup,
      restoredState.cubies,
      activeMoves.slice(0, restoredIndex),
    );
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
    if (lastAnalyzerStartStateSignatureRef.current === null) {
      lastAnalyzerStartStateSignatureRef.current = analyzerStartStateSignature;
      return;
    }

    if (lastAnalyzerStartStateSignatureRef.current === analyzerStartStateSignature) {
      return;
    }

    lastAnalyzerStartStateSignatureRef.current = analyzerStartStateSignature;
    crossWorkerRef.current?.terminate();
    crossWorkerRef.current = null;
    crossJobIdRef.current += 1;
    setIsSearchingCross(false);
    setCrossResults([]);
    setCrossError(null);
    setSelectedCrossSolution(null);
    setF2lCandidates([]);
    setSelectedF2lPairId(null);
    setIsF2lPairHighlightEnabled(true);
    setHelperCaseId(null);
    f2lAnalysisWorkerRef.current?.terminate();
    f2lAnalysisWorkerRef.current = null;
    f2lAnalysisJobIdRef.current += 1;
    setIsAnalyzingBasicF2l(false);
    setBasicF2lPlan(null);
    setBasicF2lOrderPlans([]);
    setBasicF2lComparedOrderCount(0);
    setBasicF2lAnalysisPhase(null);
    setShowBasicF2lOrderDetails(false);
    setIsLoadingBasicF2lOrderDetails(false);
    setBasicF2lError(null);
    setHighlightF2lSteps([]);
    setCurrentPracticeStep(null);
    setAiNotice(null);
  }, [analyzerStartStateSignature]);

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

  useEffect(() => {
    saveAnalyzerCubeScale(cubeScale);

    const state = sceneStateRef.current;
    const canvas = canvasRef.current;

    if (!state || !canvas) {
      return;
    }

    state.cubeScale = cubeScale;
    resizeRenderer(state, canvas);
  }, [cubeScale]);

  useEffect(() => {
    setStickerColorGrid((currentGrid) => {
      let changed = false;
      const nextGrid = { ...currentGrid } as CubeStickerColorGrid;

      (Object.keys(faceColorMap) as FaceName[]).forEach((face) => {
        if (currentGrid[face][STICKER_CENTER_INDEX] === faceColorMap[face]) {
          return;
        }

        const nextFaceColors = [...currentGrid[face]];
        nextFaceColors[STICKER_CENTER_INDEX] = faceColorMap[face];
        nextGrid[face] = nextFaceColors;
        changed = true;
      });

      return changed ? nextGrid : currentGrid;
    });
  }, [faceColorMap]);

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
      inputMode,
      scrambleInput,
      stickerColorGrid,
      selectedPaintColor,
      solveInput,
      playbackScrambleInput,
      playbackSolveInput,
      playbackMode,
      currentIndex,
      crossResults,
      crossError,
      selectedCrossSolution,
      selectedF2lPairId,
      isF2lPairHighlightEnabled,
      helperCaseId,
      basicF2lPlan,
      basicF2lAnalysisPhase,
      basicF2lError,
    });
  }, [
    basicF2lAnalysisPhase,
    basicF2lError,
    basicF2lPlan,
    crossError,
    crossResults,
    currentIndex,
    helperCaseId,
    inputMode,
    isF2lPairHighlightEnabled,
    playbackMode,
    playbackScrambleInput,
    playbackSolveInput,
    scrambleInput,
    selectedCrossSolution,
    selectedF2lPairId,
    selectedPaintColor,
    settings,
    solveInput,
    stickerColorGrid,
  ]);

  useEffect(() => {
    if (lastSelectedCrossSolutionSignatureRef.current === null) {
      lastSelectedCrossSolutionSignatureRef.current = selectedCrossSolutionSignature;
      return;
    }

    if (lastSelectedCrossSolutionSignatureRef.current === selectedCrossSolutionSignature) {
      return;
    }

    lastSelectedCrossSolutionSignatureRef.current = selectedCrossSolutionSignature;
    f2lAnalysisWorkerRef.current?.terminate();
    f2lAnalysisWorkerRef.current = null;
    f2lAnalysisJobIdRef.current += 1;
    setIsAnalyzingBasicF2l(false);
    setBasicF2lPlan(null);
    setBasicF2lOrderPlans([]);
    setBasicF2lComparedOrderCount(0);
    setBasicF2lAnalysisPhase(null);
    setShowBasicF2lOrderDetails(false);
    setIsLoadingBasicF2lOrderDetails(false);
    setBasicF2lError(null);
    setHighlightF2lSteps([]);
    setCurrentPracticeStep(null);
  }, [selectedCrossSolutionSignature]);

  useEffect(
    () => () => {
      crossWorkerRef.current?.terminate();
      crossWorkerRef.current = null;
      f2lAnalysisWorkerRef.current?.terminate();
      f2lAnalysisWorkerRef.current = null;
    },
    [],
  );

  const stepNext = useCallback(async () => {
    if (!canUseActiveSequence || currentIndex >= activeMoves.length) {
      return false;
    }

    setIsPlaying(false);
    const didMove = await animateViewpointStep(activeMoveSteps[currentIndex]);

    if (didMove) {
      setCurrentIndex((index) => Math.min(index + 1, activeMoves.length));
    }

    return didMove;
  }, [activeMoveSteps, activeMoves.length, animateViewpointStep, canUseActiveSequence, currentIndex]);

  const stepPrevious = useCallback(async () => {
    if (!canUseActiveSequence || currentIndex <= 0) {
      return false;
    }

    setIsPlaying(false);
    const didMove = await animateViewpointStep(activeMoveSteps[currentIndex - 1], true);

    if (didMove) {
      setCurrentIndex((index) => Math.max(0, index - 1));
    }

    return didMove;
  }, [activeMoveSteps, animateViewpointStep, canUseActiveSequence, currentIndex]);

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
        const didMove = await animateViewpointStep(activeMoveSteps[currentIndex]);

        if (didMove) {
          setCurrentIndex((index) => Math.min(index + 1, activeMoves.length));
        }
      })();
    }, PLAY_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    activeMoveSteps,
    activeMoves.length,
    animateViewpointStep,
    canUseActiveSequence,
    currentIndex,
    isPlaying,
  ]);

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

  const paintSticker = (face: FaceName, stickerIndex: number) => {
    if (stickerIndex === STICKER_CENTER_INDEX) {
      return;
    }

    setStickerColorGrid((currentGrid) => {
      if (currentGrid[face][stickerIndex] === selectedPaintColor) {
        return currentGrid;
      }

      const nextFaceColors = [...currentGrid[face]];
      nextFaceColors[stickerIndex] = selectedPaintColor;

      return {
        ...currentGrid,
        [face]: nextFaceColors,
      };
    });
  };

  const resetStickerColorGrid = () => {
    setStickerColorGrid(createSolvedStickerColorGrid(faceColorMap));
  };

  const loadScrambleIntoStickerGrid = () => {
    if (!canUseScramble) {
      return;
    }

    const state = applyAlgorithm(createSolvedCubeState(faceColorMap), parsedScramble.moves);
    setStickerColorGrid(cubeStateToStickerColorGrid(state));
    setInputMode("color");
  };

  const resetAnalyzerState = () => {
    if (!window.confirm("Analyzerの状態をリセットしますか？")) {
      return;
    }

    crossWorkerRef.current?.terminate();
    crossWorkerRef.current = null;
    crossJobIdRef.current += 1;
    f2lAnalysisWorkerRef.current?.terminate();
    f2lAnalysisWorkerRef.current = null;
    f2lAnalysisJobIdRef.current += 1;

    skipNextSettingsSaveCountRef.current = 2;
    skipNextAnalyzerStateSaveCountRef.current = 2;
    clearAnalyzerState();
    window.setTimeout(clearAnalyzerState, 250);
    window.history.replaceState(null, "", "/analyzer");
    setSettings(DEFAULT_ANALYZER_SETTINGS);
    setInputMode("scramble");
    setScrambleInput("");
    setStickerColorGrid(createSolvedStickerColorGrid(DEFAULT_FACE_COLOR_MAP));
    setSelectedPaintColor(DEFAULT_ANALYZER_SETTINGS.crossColor);
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
    setBasicF2lPlan(null);
    setBasicF2lOrderPlans([]);
    setBasicF2lComparedOrderCount(0);
    setBasicF2lAnalysisPhase(null);
    setShowBasicF2lOrderDetails(false);
    setIsLoadingBasicF2lOrderDetails(false);
    setBasicF2lError(null);
    setIsAnalyzingBasicF2l(false);
    setManualMoveHistory([]);
    setHighlightF2lSteps([]);
    setCurrentPracticeStep(null);
    setCopyStatus("idle");
    setAiNotice(null);

    const state = sceneStateRef.current;

    if (state) {
      animationRunRef.current += 1;
      isAnimatingRef.current = false;
      state.cubies = createSolvedCubies(state.cubeGroup, DEFAULT_FACE_COLOR_MAP);
      markSceneCubiesChanged(state);
      resetViewRotation(state.cubeGroup);
    }
  };

  const applyScramble = () => {
    if (!canUseStartState) {
      return;
    }

    setPlaybackScrambleInput("");
    setPlaybackSolveInput(solveInput);
    setPlaybackMode("scramble-solve");
    setIsPlaying(false);
    setManualMoveHistory([]);
    applyStartStateInstant();
    setCurrentIndex(0);
  };

  const playCombined = () => {
    if (
      (inputMode === "scramble" && unsupportedScrambleTokens.length > 0) ||
      parsedSolve.invalidTokens.length > 0 ||
      !canUseStartState
    ) {
      return;
    }

    setPlaybackScrambleInput("");
    setPlaybackSolveInput(solveInput);
    setPlaybackMode("scramble-solve");
    setManualMoveHistory([]);
    applyStartStateInstant();
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
      setManualMoveHistory([]);
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
  const basicF2lStepRanges = useMemo(
    () => buildBasicF2lStepRanges(highlightF2lSteps),
    [highlightF2lSteps],
  );
  const basicF2lPlanMoves = useMemo(
    () => basicF2lStepRanges.flatMap((range) => range.moves),
    [basicF2lStepRanges],
  );
  const f2lPlaybackStartIndex = useMemo(() => {
    if (!selectedCrossSolution) {
      return null;
    }

    if (movesEqual(parsedPlaybackScramble.moves, selectedCrossSolution.moves)) {
      return 0;
    }

    if (movesStartWith(activeMoves, selectedCrossSolution.moves)) {
      return selectedCrossSolution.moves.length;
    }

    if (
      selectedF2lPairId &&
      currentIndex >= selectedCrossSolution.moves.length &&
      activeMoves.length === selectedCrossSolution.moves.length
    ) {
      return selectedCrossSolution.moves.length;
    }

    return null;
  }, [
    activeMoves,
    currentIndex,
    parsedPlaybackScramble.moves,
    selectedCrossSolution,
    selectedF2lPairId,
  ]);
  const playbackBaseF2lMoves = useMemo(() => {
    if (!selectedCrossSolution) {
      return [];
    }

    if (!movesStartWith(parsedPlaybackScramble.moves, selectedCrossSolution.moves)) {
      return [];
    }

    return parsedPlaybackScramble.moves.slice(selectedCrossSolution.moves.length);
  }, [parsedPlaybackScramble.moves, selectedCrossSolution]);
  const activeF2lMoves =
    f2lPlaybackStartIndex === null
      ? playbackBaseF2lMoves.length > 0
        ? [...playbackBaseF2lMoves, ...activeMoves]
        : []
      : [...playbackBaseF2lMoves, ...activeMoves.slice(f2lPlaybackStartIndex)];
  const activeF2lMoveIndex =
    f2lPlaybackStartIndex === null
      ? playbackBaseF2lMoves.length > 0
        ? playbackBaseF2lMoves.length + currentIndex
        : -1
      : playbackBaseF2lMoves.length + currentIndex - f2lPlaybackStartIndex;
  const hasActiveF2lPlayback =
    f2lPlaybackStartIndex !== null || playbackBaseF2lMoves.length > 0;
  const activeF2lMovesMatchHighlightSteps =
    basicF2lPlanMoves.length > 0 &&
    activeF2lMoves.length > 0 &&
    (movesStartWith(activeF2lMoves, basicF2lPlanMoves) ||
      movesStartWith(basicF2lPlanMoves, activeF2lMoves));
  const activeBasicF2lStep = useMemo(() => {
    if (
      !activeF2lMovesMatchHighlightSteps ||
      activeF2lMoveIndex < 0 ||
      activeF2lMoveIndex >= basicF2lPlanMoves.length
    ) {
      return null;
    }

    if (currentIndex >= activeMoves.length && activeMoves.length > 0) {
      return (
        basicF2lStepRanges
          .slice()
          .reverse()
          .find(
            (range) => activeF2lMoveIndex > range.start && activeF2lMoveIndex <= range.end,
          )?.step ?? null
      );
    }

    return (
      basicF2lStepRanges.find(
        (range) => activeF2lMoveIndex >= range.start && activeF2lMoveIndex < range.end,
      )?.step ?? null
    );
  }, [
    activeMoves.length,
    activeF2lMoveIndex,
    activeF2lMovesMatchHighlightSteps,
    basicF2lPlanMoves.length,
    basicF2lStepRanges,
    currentIndex,
  ]);
  const currentF2lHighlightPair = useMemo(() => {
    if (!selectedCrossSolution || !hasActiveF2lPlayback || activeF2lMoveIndex < 0) {
      return null;
    }

    if (activeBasicF2lStep) {
      return getF2lCandidateBySlot(f2lCandidates, activeBasicF2lStep.targetSlot);
    }

    if (
      activeF2lMovesMatchHighlightSteps &&
      activeF2lMoveIndex >= basicF2lPlanMoves.length
    ) {
      return null;
    }

    if (!selectedF2lPairId || !selectedF2lPair) {
      return null;
    }

    return selectedF2lPair;
  }, [
    activeBasicF2lStep,
    activeF2lMoveIndex,
    activeF2lMovesMatchHighlightSteps,
    basicF2lPlanMoves.length,
    f2lCandidates,
    hasActiveF2lPlayback,
    selectedCrossSolution,
    selectedF2lPair,
    selectedF2lPairId,
  ]);

  useEffect(() => {
    selectedF2lPairRef.current = currentF2lHighlightPair;
    isF2lPairHighlightEnabledRef.current = isF2lPairHighlightEnabled;

    const state = sceneStateRef.current;

    if (state) {
      syncF2lPairHighlight(state, currentF2lHighlightPair, isF2lPairHighlightEnabled);
    }
  }, [currentF2lHighlightPair, isF2lPairHighlightEnabled]);

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

    if (!activeStartState) {
      return "scramble";
    }

    if (!selectedCrossSolution) {
      return "cross";
    }

    if (currentPracticeStep?.phase === "cross") {
      return "cross";
    }

    if (currentPracticeStep?.phase === "f2l-step") {
      return `f2l${Math.min(4, currentPracticeStep.stepIndex + 1)}` as AnalyzerStepKey;
    }

    if (currentPracticeStep?.phase === "oll") {
      return "oll";
    }

    if (currentPracticeStep?.phase === "pll") {
      return "pll";
    }

    const completedF2lSteps = basicF2lPlan?.steps.length ?? 0;

    if (completedF2lSteps <= 0) {
      return "f2l1";
    }

    if ((basicF2lPlan?.unresolvedPairs.length ?? 1) === 0) {
      return "oll";
    }

    return `f2l${Math.min(4, completedF2lSteps + 1)}` as AnalyzerStepKey;
  }, [
    activeStartState,
    basicF2lPlan,
    currentPracticeStep,
    helperCase?.category,
    isComplete,
    selectedCrossSolution,
  ]);
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
  const basicF2lAlgorithm = useMemo(
    () =>
      basicF2lPlan?.steps
        .map((step) => step.fullAlgorithm)
        .filter(Boolean)
        .join(" ") ?? "",
    [basicF2lPlan],
  );
  const ollRecognition = useMemo<LastLayerRecognitionResult | null>(() => {
    if (!basicF2lPlan || !selectedCrossSolution) {
      return null;
    }

    return recognizeOll(
      basicF2lPlan.finalState,
      selectedCrossSolution.color,
      selectedCrossSolution.targetFace,
      ollLearningCases,
    );
  }, [basicF2lPlan, ollLearningCases, selectedCrossSolution]);
  const pllRecognition = useMemo<LastLayerRecognitionResult | null>(() => {
    if (!ollRecognition?.ok || !selectedCrossSolution) {
      return null;
    }

    return recognizePll(
      ollRecognition.recognition.stateAfter,
      selectedCrossSolution.targetFace,
      pllLearningCases,
    );
  }, [ollRecognition, pllLearningCases, selectedCrossSolution]);
  const lastLayerLearnPreview = useMemo<{
    phase: LastLayerLearnPhase;
    recognition: LastLayerRecognition;
  } | null>(() => {
    if (lastLayerLearnPreviewPhase === "oll" && ollRecognition?.ok) {
      return { phase: "oll", recognition: ollRecognition.recognition };
    }

    if (lastLayerLearnPreviewPhase === "pll" && pllRecognition?.ok) {
      return { phase: "pll", recognition: pllRecognition.recognition };
    }

    return null;
  }, [lastLayerLearnPreviewPhase, ollRecognition, pllRecognition]);
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
    applyStartStateInstant();
  }, [applyStartStateInstant]);

  const scrollToPlayerPanel = useCallback(() => {
    window.setTimeout(() => {
      playerPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, []);

  const selectAnalyzerCandidate = useCallback(
    (
      candidate: { algorithm: string; caseItem?: LearningCase | null },
      options: { play?: boolean; scroll?: boolean } = {},
    ) => {
      const algorithm = candidate.algorithm.trim();
      const moves = parseAlgorithm(algorithm).moves;

      if (candidate.caseItem) {
        setHelperCaseId(getLearningCaseRouteKey(candidate.caseItem));
      }

      setSolveInput(algorithm);
      setPlaybackScrambleInput("");
      setPlaybackSolveInput(algorithm);
      setPlaybackMode("scramble-solve");
      setManualMoveHistory([]);
      setHighlightF2lSteps([]);
      setCurrentPracticeStep(null);
      setIsPlaying(false);

      window.setTimeout(() => {
        applyScrambleInstant();
        setCurrentIndex(0);
        setIsPlaying(Boolean(options.play && moves.length > 0));

        if (options.scroll !== false) {
          scrollToPlayerPanel();
        }
      }, 0);
    },
    [applyScrambleInstant, scrollToPlayerPanel],
  );

  const selectAnalyzerCandidateFromPlaybackBase = useCallback(
    (
      candidate: { baseAlgorithm: string; algorithm: string; caseItem?: LearningCase | null },
      options: { play?: boolean; scroll?: boolean } = {},
    ) => {
      const baseAlgorithm = candidate.baseAlgorithm.trim();
      const algorithm = candidate.algorithm.trim();
      const baseMoves = parseAlgorithm(baseAlgorithm).moves;
      const moves = parseAlgorithm(algorithm).moves;

      if (candidate.caseItem) {
        setHelperCaseId(getLearningCaseRouteKey(candidate.caseItem));
      }

      setSolveInput(algorithm);
      setPlaybackScrambleInput(baseAlgorithm);
      setPlaybackSolveInput(algorithm);
      setPlaybackMode("scramble-solve");
      setManualMoveHistory([]);
      setHighlightF2lSteps([]);
      setCurrentPracticeStep(null);
      setIsPlaying(false);

      window.setTimeout(() => {
        if (!applyStartStateInstant()) {
          resetCubeState();
        }

        const state = sceneStateRef.current;

        if (state) {
          applyViewpointMovesInstant(state.cubeGroup, state.cubies, baseMoves);
        }

        setCurrentIndex(0);
        setIsPlaying(Boolean(options.play && moves.length > 0));

        if (options.scroll !== false) {
          scrollToPlayerPanel();
        }
      }, 0);
    },
    [applyStartStateInstant, resetCubeState, scrollToPlayerPanel],
  );

  const selectCrossSolution = useCallback(
    (solution: CrossSolution, options: { play?: boolean; scroll?: boolean } = {}) => {
      setSelectedCrossSolution(solution);
      setF2lCandidates(getF2lPairCandidates(solution.stateAfterCross, solution.color, solution.targetFace));
      setSelectedF2lPairId(null);
      setAiNotice(null);
      selectAnalyzerCandidate(
        { algorithm: solution.algorithm },
        { play: options.play, scroll: options.scroll },
      );
    },
    [selectAnalyzerCandidate],
  );

  const selectCrossSolutionForF2l = useCallback(
    (solution: CrossSolution) => {
      selectCrossSolution(solution, { scroll: false });
      setPlaybackScrambleInput("");
      setPlaybackSolveInput(solution.algorithm);
      setPlaybackMode("scramble-solve");
      setManualMoveHistory([]);

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
    [applyScrambleInstant, selectCrossSolution],
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
    setBasicF2lOrderPlans([]);
    setBasicF2lComparedOrderCount(0);
    setBasicF2lAnalysisPhase(null);
    setShowBasicF2lOrderDetails(false);
    setIsLoadingBasicF2lOrderDetails(false);
    setBasicF2lError(null);
    setHighlightF2lSteps([]);
    setCurrentPracticeStep(null);

    if (inputMode === "scramble" && !scrambleInput.trim()) {
      setCrossError("スクランブルを入力してください。");
      if (pendingQuickPhaseRef.current === "cross") {
        pendingQuickPhaseRef.current = null;
        setQuickPlaybackStatus("Cross解析を開始できませんでした。");
      }
      return;
    }

    if (!canUseOrientation) {
      setCrossError(orientationError ?? "キューブの向き設定を確認してください。");
      if (pendingQuickPhaseRef.current === "cross") {
        pendingQuickPhaseRef.current = null;
        setQuickPlaybackStatus("Cross解析を開始できませんでした。");
      }
      return;
    }

    if (inputMode === "scramble" && unsupportedScrambleTokens.length > 0) {
      setCrossError(
        `対応していない回転記号があります: ${unsupportedScrambleTokens.join(", ")}`,
      );
      if (pendingQuickPhaseRef.current === "cross") {
        pendingQuickPhaseRef.current = null;
        setQuickPlaybackStatus("Cross解析を開始できませんでした。");
      }
      return;
    }

    if (inputMode === "color" && !colorInputResult.state) {
      setCrossError(
        colorInputResult.errors[0] ?? "色配置を認識できませんでした。ステッカーの色を確認してください。",
      );
      if (pendingQuickPhaseRef.current === "cross") {
        pendingQuickPhaseRef.current = null;
        setQuickPlaybackStatus("Cross解析を開始できませんでした。");
      }
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
    const jobs: CrossSearchInput[] = targetColors.map((crossColor) => {
      const targetFace = settings.showAllCrossColors
        ? getFaceForColor(faceColorMap, crossColor) ?? settings.crossTargetFace
        : settings.crossTargetFace;
      const searchFaceColorMap =
        inputMode === "scramble" && !settings.showAllCrossColors
          ? getCrossSearchFaceColorMap(crossColor)
          : faceColorMap;

      return {
        crossColor,
        targetFace,
        faceColorMap: searchFaceColorMap,
        scrambleMoves: inputMode === "scramble" ? parsedScramble.moves : [],
        initialState: inputMode === "color" ? colorInputResult.state ?? undefined : undefined,
        maxDepth: settings.maxDepth,
        maxSolutions: 5,
      };
    });

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
        if (pendingQuickPhaseRef.current === "cross") {
          pendingQuickPhaseRef.current = null;
          setQuickPlaybackStatus("Cross解析に失敗しました。");
        }
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
        if (pendingQuickPhaseRef.current === "cross") {
          pendingQuickPhaseRef.current = null;
          setQuickPlaybackStatus("Cross bestを見つけられませんでした。");
        }
        return;
      }

      setCrossError(null);
      selectCrossSolution(bestSolution, { scroll: false });
      if (pendingQuickPhaseRef.current === "cross") {
        pendingQuickPhaseRef.current = null;
        setQuickPlaybackStatus(
          `Cross bestを再生待ちにしました。${bestSolution.moveCount} moves`,
        );
      }
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
      if (pendingQuickPhaseRef.current === "cross") {
        pendingQuickPhaseRef.current = null;
        setQuickPlaybackStatus("Cross解析に失敗しました。");
      }
    };
    worker.postMessage({ jobId, jobs });
  }, [
    canUseOrientation,
    colorInputResult.errors,
    colorInputResult.state,
    faceColorMap,
    getCrossSearchFaceColorMap,
    inputMode,
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
    setManualMoveHistory([]);
    setHighlightF2lSteps([]);
    setCurrentPracticeStep(null);

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
    selectAnalyzerCandidate({ algorithm: combinedSolve, caseItem }, { play: true });
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

  const openLastLayerLearnPreview = (phase: LastLayerLearnPhase) => {
    setLastLayerLearnPreviewPhase(phase);
  };

  const closeLastLayerLearnPreview = () => {
    setLastLayerLearnPreviewPhase(null);
  };

  const openLearningCaseLearn = (
    caseItem: LearningCase | null,
    fallbackCategory?: LearningCategory,
  ) => {
    if (caseItem) {
      onNavigate(
        `/learn/${caseItem.category}/${encodeURIComponent(getLearningCaseRouteKey(caseItem))}`,
      );
      return;
    }

    if (fallbackCategory) {
      onNavigate(`/learn/${fallbackCategory}`);
    }
  };

  const openAnalyzerCandidateLearn = (candidate: AnalyzerCandidate) => {
    const caseItem = getAnalyzerCandidateCase(candidate);

    openLearningCaseLearn(
      caseItem,
      candidate.phase === "oll" || candidate.phase === "pll" ? candidate.phase : undefined,
    );
  };

  const playF2lRecommendation = (recommendation: F2lRecommendation) => {
    if (!selectedCrossSolution) {
      return;
    }

    const combinedSolve = [selectedCrossSolution.algorithm, recommendation.algorithm]
      .map((algorithm) => algorithm.trim())
      .filter(Boolean)
      .join(" ");

    selectAnalyzerCandidate(
      { algorithm: combinedSolve, caseItem: recommendation.caseItem },
      { play: true },
    );
  };

  const prepareBasicF2lPlanPlayback = useCallback(
    (plan: BasicF2lAnalysisPlan, options: { play?: boolean } = {}) => {
      if (!selectedCrossSolution) {
        return false;
      }

      const f2lAlgorithm = plan.steps
        .map((step) => step.fullAlgorithm)
        .filter(Boolean)
        .join(" ");
      const playbackBaseAlgorithm = [selectedCrossSolution.algorithm]
        .map((algorithm) => algorithm.trim())
        .filter(Boolean)
        .join(" ");

      selectAnalyzerCandidateFromPlaybackBase(
        {
          baseAlgorithm: playbackBaseAlgorithm,
          algorithm: f2lAlgorithm,
        },
        { play: Boolean(options.play), scroll: false },
      );
      setHighlightF2lSteps(plan.steps);
      setCurrentPracticeStep({ phase: "f2l" });
      return true;
    },
    [selectAnalyzerCandidateFromPlaybackBase, selectedCrossSolution],
  );

  const getCompletedBasicF2lStepCount = useCallback(
    (plan: BasicF2lAnalysisPlan) => {
      if (!selectedCrossSolution || !hasActiveF2lPlayback || activeF2lMoveIndex < 0) {
        return 0;
      }

      const ranges = buildBasicF2lStepRanges(plan.steps);
      const planMoves = ranges.flatMap((range) => range.moves);

      if (
        activeF2lMoves.length > 0 &&
        !movesStartWith(activeF2lMoves, planMoves) &&
        !movesStartWith(planMoves, activeF2lMoves)
      ) {
        return 0;
      }

      return Math.min(
        plan.steps.length,
        ranges.filter((range) => activeF2lMoveIndex >= range.end).length,
      );
    },
    [
      activeF2lMoveIndex,
      activeF2lMoves,
      hasActiveF2lPlayback,
      selectedCrossSolution,
    ],
  );

  const getNextBasicF2lStepIndex = useCallback(
    (plan: BasicF2lAnalysisPlan) => getCompletedBasicF2lStepCount(plan),
    [getCompletedBasicF2lStepCount],
  );

  const prepareBasicF2lStepPlayback = useCallback(
    (
      plan: BasicF2lAnalysisPlan,
      stepIndex: number,
      options: { play?: boolean } = {},
    ) => {
      if (!selectedCrossSolution) {
        return { ok: false, message: "先にCross bestを選択してください。" };
      }

      const targetStep = plan.steps[stepIndex];

      if (!targetStep) {
        return { ok: false, message: "F2Lステップを選択できませんでした。" };
      }

      const previousF2lAlgorithm = plan.steps
        .slice(0, stepIndex)
        .map((step) => step.fullAlgorithm)
        .filter(Boolean)
        .join(" ");
      const playbackBaseAlgorithm = [selectedCrossSolution.algorithm, previousF2lAlgorithm]
        .map((algorithm) => algorithm.trim())
        .filter(Boolean)
        .join(" ");
      const focusPair = getF2lCandidateBySlot(f2lCandidates, targetStep.targetSlot);

      setHelperCaseId(null);
      setSelectedF2lPairId(focusPair?.id ?? null);
      selectAnalyzerCandidateFromPlaybackBase(
        {
          baseAlgorithm: playbackBaseAlgorithm,
          algorithm: targetStep.fullAlgorithm.trim(),
        },
        { play: options.play ?? true, scroll: false },
      );
      setHighlightF2lSteps(plan.steps);
      setCurrentPracticeStep({ phase: "f2l-step", stepIndex });

      return {
        ok: true,
        message: `F2L ${stepIndex + 1}/${plan.steps.length}: ${targetStep.pairTitle}を入れます。`,
        step: targetStep,
        stepIndex,
      };
    },
    [
      f2lCandidates,
      selectAnalyzerCandidateFromPlaybackBase,
      selectedCrossSolution,
    ],
  );

  const prepareNextBasicF2lStepPlayback = useCallback(
    (plan: BasicF2lAnalysisPlan, options: { play?: boolean } = {}) => {
      const stepIndex = getNextBasicF2lStepIndex(plan);
      if (!plan.steps[stepIndex]) {
        return { ok: false, message: "F2Lは最後まで入っています。" };
      }

      return prepareBasicF2lStepPlayback(plan, stepIndex, options);
    },
    [
      getNextBasicF2lStepIndex,
      prepareBasicF2lStepPlayback,
    ],
  );

  const runBasicF2lAnalysis = useCallback((options: {
    useLocalSearch?: boolean;
    includeAllPlans?: boolean;
    preparePlayback?: boolean;
    prepareNextStep?: boolean;
  } = {}) => {
    const useLocalSearch = Boolean(options.useLocalSearch);
    const includeAllPlans = Boolean(options.includeAllPlans);
    const preparePlayback = Boolean(options.preparePlayback);
    const prepareNextStep = Boolean(options.prepareNextStep);

    f2lAnalysisWorkerRef.current?.terminate();
    f2lAnalysisWorkerRef.current = null;
    const jobId = f2lAnalysisJobIdRef.current + 1;
    f2lAnalysisJobIdRef.current = jobId;

    if (!useLocalSearch && !includeAllPlans) {
      setBasicF2lPlan(null);
      setBasicF2lOrderPlans([]);
      setBasicF2lComparedOrderCount(0);
      setBasicF2lAnalysisPhase(null);
      setShowBasicF2lOrderDetails(false);
      setIsLoadingBasicF2lOrderDetails(false);
      setHighlightF2lSteps([]);
      setCurrentPracticeStep(null);
    }
    setIsLoadingBasicF2lOrderDetails(includeAllPlans);
    setBasicF2lError(null);

    if (!selectedCrossSolution) {
      setIsAnalyzingBasicF2l(false);
      setIsLoadingBasicF2lOrderDetails(false);
      setBasicF2lError("先にCross候補を選択してください。");
      if (
        preparePlayback ||
        prepareNextStep ||
        pendingQuickPhaseRef.current === "f2l" ||
        pendingQuickPhaseRef.current === "nextF2l"
      ) {
        pendingQuickPhaseRef.current = null;
        setQuickPlaybackStatus("先にCross bestを選択してください。");
      }
      return;
    }

    setIsAnalyzingBasicF2l(true);
    const worker = new Worker(new URL("./f2lAnalysisWorker.ts", import.meta.url), {
      type: "module",
    });

    f2lAnalysisWorkerRef.current = worker;
    const finishWorker = () => {
      worker.terminate();
      if (f2lAnalysisWorkerRef.current === worker) {
        f2lAnalysisWorkerRef.current = null;
      }
      setIsAnalyzingBasicF2l(false);
      setIsLoadingBasicF2lOrderDetails(false);
    };

    worker.onmessage = (event: MessageEvent<F2lAnalysisWorkerResponse>) => {
      if (event.data.jobId !== f2lAnalysisJobIdRef.current) {
        return;
      }

      const isDone = event.data.done !== false;

      if (!event.data.ok || !event.data.plan) {
        if (isDone) {
          finishWorker();
        }
        const wasPreparingNextF2l =
          prepareNextStep || pendingQuickPhaseRef.current === "nextF2l";

        setBasicF2lError(event.data.error ?? "F2L解析中にエラーが発生しました。");
        if (
          preparePlayback ||
          prepareNextStep ||
          pendingQuickPhaseRef.current === "f2l" ||
          pendingQuickPhaseRef.current === "nextF2l"
        ) {
          pendingQuickPhaseRef.current = null;
          setQuickPlaybackStatus(
            wasPreparingNextF2l
              ? "次のF2Lを作成できませんでした。"
              : "F2L bestを作成できませんでした。",
          );
        }
        if (!useLocalSearch && !includeAllPlans) {
          setBasicF2lOrderPlans([]);
          setBasicF2lComparedOrderCount(0);
          setBasicF2lAnalysisPhase(null);
          setShowBasicF2lOrderDetails(false);
          setIsLoadingBasicF2lOrderDetails(false);
        }
        return;
      }

      setBasicF2lPlan(event.data.plan);
      setBasicF2lOrderPlans(event.data.orderResult?.plans ?? []);
      setBasicF2lComparedOrderCount(event.data.orderResult?.comparedOrderCount ?? 0);
      setBasicF2lAnalysisPhase(event.data.phase ?? (useLocalSearch ? "fallback" : "basic41"));
      if (includeAllPlans) {
        setShowBasicF2lOrderDetails(true);
      }

      if (isDone) {
        if (prepareNextStep || pendingQuickPhaseRef.current === "nextF2l") {
          const result = prepareNextBasicF2lStepPlayback(event.data.plan);

          pendingQuickPhaseRef.current = null;
          setQuickPlaybackStatus(result.message);
        } else if (preparePlayback || pendingQuickPhaseRef.current === "f2l") {
          const prepared = prepareBasicF2lPlanPlayback(event.data.plan);

          pendingQuickPhaseRef.current = null;
          setQuickPlaybackStatus(
            prepared
              ? `Cross完了状態からF2L bestを再生待ちにしました。${event.data.plan.totalMoveCount} moves / ${event.data.plan.order.join(" → ")}`
              : "F2L bestを再生待ちにできませんでした。",
          );
        }
        finishWorker();
      }
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
      setIsLoadingBasicF2lOrderDetails(false);
      if (!useLocalSearch && !includeAllPlans) {
        setBasicF2lOrderPlans([]);
        setBasicF2lComparedOrderCount(0);
        setBasicF2lAnalysisPhase(null);
        setShowBasicF2lOrderDetails(false);
        setIsLoadingBasicF2lOrderDetails(false);
      }
      setBasicF2lError("F2L解析Workerでエラーが発生しました。");
      if (
        preparePlayback ||
        prepareNextStep ||
        pendingQuickPhaseRef.current === "f2l" ||
        pendingQuickPhaseRef.current === "nextF2l"
      ) {
        pendingQuickPhaseRef.current = null;
        setQuickPlaybackStatus("F2L解析に失敗しました。");
      }
    };
    worker.postMessage({
      jobId,
      state: selectedCrossSolution.stateAfterCross,
      crossColor: selectedCrossSolution.color,
      targetFace: selectedCrossSolution.targetFace,
      useLocalSearch,
      includeAllPlans,
    });
  }, [prepareBasicF2lPlanPlayback, prepareNextBasicF2lStepPlayback, selectedCrossSolution]);

  const playBasicF2lSteps = (steps: BasicF2lAnalysisStep[]) => {
    if (!selectedCrossSolution || steps.length === 0) {
      return;
    }

    const lastStep = steps[steps.length - 1];
    const lastStepIndex =
      basicF2lPlan?.steps.findIndex((step) => step.id === lastStep.id) ?? -1;
    const f2lAlgorithm = steps
      .map((step) => step.fullAlgorithm)
      .filter(Boolean)
      .join(" ");
    const combinedSolve = [selectedCrossSolution.algorithm, f2lAlgorithm]
      .map((algorithm) => algorithm.trim())
      .filter(Boolean)
      .join(" ");

    selectAnalyzerCandidate({ algorithm: combinedSolve }, { play: true });
    setHighlightF2lSteps(steps);
    setCurrentPracticeStep(
      lastStepIndex >= 0
        ? { phase: "f2l-step", stepIndex: lastStepIndex }
        : { phase: "f2l" },
    );
  };

  const playBasicF2lStep = (step: BasicF2lAnalysisStep) => {
    const steps = basicF2lPlan?.steps ?? [];
    const stepIndex = steps.findIndex((item) => item.id === step.id);

    playBasicF2lSteps(steps.slice(0, stepIndex + 1));
  };

  const playBasicF2lPlanStep = (plan: BasicF2lAnalysisPlan, stepIndex: number) => {
    playBasicF2lSteps(plan.steps.slice(0, stepIndex + 1));
  };

  const prepareBestCrossPlayback = useCallback(() => {
    if (bestCrossSolution) {
      pendingQuickPhaseRef.current = null;
      selectCrossSolution(bestCrossSolution, { scroll: false });
      setCurrentPracticeStep({ phase: "cross" });
      setQuickPlaybackStatus(
        `Cross bestを再生待ちにしました。${bestCrossSolution.moveCount} moves`,
      );
      return;
    }

    pendingQuickPhaseRef.current = "cross";
    setQuickPlaybackStatus("Cross bestを解析中...");
    analyzeCross();
  }, [analyzeCross, bestCrossSolution, selectCrossSolution]);

  const prepareBestF2lPlayback = useCallback(() => {
    if (!selectedCrossSolution) {
      pendingQuickPhaseRef.current = null;
      setQuickPlaybackStatus("先にCross bestを選択してください。");
      return;
    }

    if (basicF2lPlan && !isAnalyzingBasicF2l) {
      const prepared = prepareBasicF2lPlanPlayback(basicF2lPlan);

      setQuickPlaybackStatus(
        prepared
          ? `Cross完了状態からF2L bestを再生待ちにしました。${basicF2lPlan.totalMoveCount} moves / ${basicF2lPlan.order.join(" → ")}`
          : "F2L bestを再生待ちにできませんでした。",
      );
      if (prepared) {
        setCurrentPracticeStep({ phase: "f2l" });
      }
      return;
    }

    pendingQuickPhaseRef.current = "f2l";
    setQuickPlaybackStatus("F2L bestを解析中...");
    runBasicF2lAnalysis({ preparePlayback: true });
  }, [
    basicF2lPlan,
    isAnalyzingBasicF2l,
    prepareBasicF2lPlanPlayback,
    runBasicF2lAnalysis,
    selectedCrossSolution,
  ]);

  const prepareNextF2lPlayback = useCallback(() => {
    if (!selectedCrossSolution) {
      pendingQuickPhaseRef.current = null;
      setQuickPlaybackStatus("先にCross bestを選択してください。");
      return;
    }

    if (basicF2lPlan && !isAnalyzingBasicF2l) {
      const result = prepareNextBasicF2lStepPlayback(basicF2lPlan);

      setQuickPlaybackStatus(result.message);
      return;
    }

    pendingQuickPhaseRef.current = "nextF2l";
    setQuickPlaybackStatus("次のF2Lを解析中...");
    runBasicF2lAnalysis({ prepareNextStep: true });
  }, [
    basicF2lPlan,
    isAnalyzingBasicF2l,
    prepareNextBasicF2lStepPlayback,
    runBasicF2lAnalysis,
    selectedCrossSolution,
  ]);

  const prepareBestOllPlayback = useCallback(() => {
    pendingQuickPhaseRef.current = null;

    if (!selectedCrossSolution || !basicF2lPlan) {
      setQuickPlaybackStatus("先にF2L bestを作ってください。");
      return;
    }

    if (!ollRecognition?.ok) {
      setQuickPlaybackStatus(ollRecognition?.reason ?? "OLL判定の準備ができていません。");
      return;
    }

    const baseAlgorithm = [selectedCrossSolution.algorithm, basicF2lAlgorithm]
      .map((algorithm) => algorithm.trim())
      .filter(Boolean)
      .join(" ");
    const { recognition } = ollRecognition;

    selectAnalyzerCandidateFromPlaybackBase(
      {
        baseAlgorithm,
        algorithm: recognition.algorithm,
        caseItem: recognition.caseItem,
      },
      { play: false, scroll: false },
    );
    setQuickPlaybackStatus(
      recognition.isSkip
        ? "F2L完成状態からOLL Skipを再生待ちにしました。"
        : `F2L完成状態から${recognition.caseTitle}を再生待ちにしました。${recognition.moveCount} moves`,
    );
    setCurrentPracticeStep({ phase: "oll" });
  }, [
    basicF2lAlgorithm,
    basicF2lPlan,
    ollRecognition,
    selectAnalyzerCandidateFromPlaybackBase,
    selectedCrossSolution,
  ]);

  const prepareBestPllPlayback = useCallback(() => {
    pendingQuickPhaseRef.current = null;

    if (!selectedCrossSolution || !basicF2lPlan) {
      setQuickPlaybackStatus("先にF2L bestを作ってください。");
      return;
    }

    if (!ollRecognition?.ok) {
      setQuickPlaybackStatus(ollRecognition?.reason ?? "先にOLL判定が必要です。");
      return;
    }

    if (!pllRecognition?.ok) {
      setQuickPlaybackStatus(pllRecognition?.reason ?? "PLL判定の準備ができていません。");
      return;
    }

    const baseAlgorithm = [
      selectedCrossSolution.algorithm,
      basicF2lAlgorithm,
      ollRecognition.recognition.algorithm,
    ]
      .map((algorithm) => algorithm.trim())
      .filter(Boolean)
      .join(" ");
    const { recognition } = pllRecognition;

    selectAnalyzerCandidateFromPlaybackBase(
      {
        baseAlgorithm,
        algorithm: recognition.algorithm,
        caseItem: recognition.caseItem,
      },
      { play: false, scroll: false },
    );
    setQuickPlaybackStatus(
      recognition.isSkip
        ? "OLL完成状態からPLL Skipを再生待ちにしました。"
        : `OLL完成状態から${recognition.caseTitle}を再生待ちにしました。${recognition.moveCount} moves`,
    );
    setCurrentPracticeStep({ phase: "pll" });
  }, [
    basicF2lAlgorithm,
    basicF2lPlan,
    ollRecognition,
    pllRecognition,
    selectAnalyzerCandidateFromPlaybackBase,
    selectedCrossSolution,
  ]);

  const previousPracticeTarget = useMemo<AnalyzerPracticeStep | null>(() => {
    if (!currentPracticeStep) {
      return null;
    }

    if (currentPracticeStep.phase === "pll") {
      return { phase: "oll" };
    }

    if (currentPracticeStep.phase === "oll") {
      const lastF2lStepIndex = (basicF2lPlan?.steps.length ?? 0) - 1;

      return lastF2lStepIndex >= 0
        ? { phase: "f2l-step", stepIndex: lastF2lStepIndex }
        : { phase: "f2l" };
    }

    if (currentPracticeStep.phase === "f2l") {
      return { phase: "cross" };
    }

    if (currentPracticeStep.phase === "f2l-step") {
      return currentPracticeStep.stepIndex > 0
        ? { phase: "f2l-step", stepIndex: currentPracticeStep.stepIndex - 1 }
        : { phase: "cross" };
    }

    return null;
  }, [basicF2lPlan?.steps.length, currentPracticeStep]);

  const canPlayPreviousPracticeStep = Boolean(
    previousPracticeTarget &&
      !isSearchingCross &&
      !isAnalyzingBasicF2l &&
      (previousPracticeTarget.phase === "cross"
        ? selectedCrossSolution || bestCrossSolution
        : previousPracticeTarget.phase === "f2l"
          ? selectedCrossSolution && basicF2lPlan
          : previousPracticeTarget.phase === "f2l-step"
            ? selectedCrossSolution &&
              basicF2lPlan?.steps[previousPracticeTarget.stepIndex]
            : previousPracticeTarget.phase === "oll"
              ? selectedCrossSolution && basicF2lPlan && ollRecognition?.ok
              : false),
  );
  const previousPracticeButtonLabel = previousPracticeTarget
    ? `← 前ステップ: ${getPracticeStepLabel(previousPracticeTarget)}`
    : "← 前ステップ";

  const preparePreviousPracticeStep = useCallback(() => {
    const target = previousPracticeTarget;

    if (!target) {
      setQuickPlaybackStatus("戻れる前ステップがありません。");
      return;
    }

    if (target.phase === "cross") {
      const crossSolution = selectedCrossSolution ?? bestCrossSolution;

      if (!crossSolution) {
        setQuickPlaybackStatus("前ステップのCrossを準備できませんでした。");
        return;
      }

      pendingQuickPhaseRef.current = null;
      selectCrossSolution(crossSolution, { play: true, scroll: false });
      setCurrentPracticeStep({ phase: "cross" });
      setQuickPlaybackStatus(
        `前ステップ: Crossを再生します。${crossSolution.moveCount} moves`,
      );
      return;
    }

    if (target.phase === "f2l") {
      if (!basicF2lPlan) {
        setQuickPlaybackStatus("前ステップのF2Lを準備できませんでした。");
        return;
      }

      const prepared = prepareBasicF2lPlanPlayback(basicF2lPlan, { play: true });

      setQuickPlaybackStatus(
        prepared
          ? `前ステップ: F2L bestを再生します。${basicF2lPlan.totalMoveCount} moves`
          : "前ステップのF2Lを準備できませんでした。",
      );
      return;
    }

    if (target.phase === "f2l-step") {
      if (!basicF2lPlan) {
        setQuickPlaybackStatus("前ステップのF2Lを準備できませんでした。");
        return;
      }

      const result = prepareBasicF2lStepPlayback(basicF2lPlan, target.stepIndex, {
        play: true,
      });

      setQuickPlaybackStatus(
        result.ok ? `前ステップ: ${result.message}` : result.message,
      );
      return;
    }

    if (target.phase === "oll") {
      prepareBestOllPlayback();
    }
  }, [
    basicF2lPlan,
    bestCrossSolution,
    prepareBasicF2lPlanPlayback,
    prepareBasicF2lStepPlayback,
    prepareBestOllPlayback,
    previousPracticeTarget,
    selectCrossSolution,
    selectedCrossSolution,
  ]);

  const invalidSummary = [
    orientationError ? `キューブの向き設定に問題があります: ${orientationError}` : "",
    inputMode === "scramble" && unsupportedScrambleTokens.length > 0
      ? `対応していない回転記号があります: ${unsupportedScrambleTokens.join(", ")}`
      : "",
    inputMode === "color" && colorInputResult.errors.length > 0
      ? `色配置に問題があります: ${colorInputResult.errors[0]}`
      : "",
    parsedSolve.invalidTokens.length > 0
      ? `ソルブ手順に未対応の記号があります: ${parsedSolve.invalidTokens.join(", ")}`
      : "",
  ].filter(Boolean);
  const nextBasicF2lStepIndex = basicF2lPlan ? getNextBasicF2lStepIndex(basicF2lPlan) : 0;
  const nextBasicF2lStep = basicF2lPlan?.steps[nextBasicF2lStepIndex] ?? null;
  const canPlayNextF2l =
    Boolean(selectedCrossSolution) &&
    !isAnalyzingBasicF2l &&
    (activeMoves.length === 0 || currentIndex >= activeMoves.length) &&
    (!basicF2lPlan || Boolean(nextBasicF2lStep));
  const nextF2lButtonLabel = isAnalyzingBasicF2l
    ? "F2L..."
    : nextBasicF2lStep
      ? `次のF2L ${nextBasicF2lStepIndex + 1}`
      : basicF2lPlan
        ? "F2L完了"
        : "次のF2L";

  return (
    <main className="app-shell analyzer-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Virtual cube checker</p>
          <h1>Analyzer</h1>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={resetAnalyzerState}>
            リセット
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

      <section className="analyzer-command-bar" aria-label="Analyzer quick actions">
        <div className="analyzer-command-status" aria-label="Analyzer status">
          <span>{startInputLabel} {startInputCount}</span>
          <span>Active {activeMoves.length}</span>
          <span>
            {selectedCrossSolution
              ? `Cross ${selectedCrossSolution.moveCount} moves`
              : "Cross未選択"}
          </span>
        </div>
        <div className="analyzer-command-actions">
          <button type="button" onClick={applyScramble} disabled={!canUseStartState}>
            {inputMode === "color" ? "色配置反映" : "スクランブル反映"}
          </button>
          <button
            type="button"
            onClick={analyzeCross}
            disabled={isSearchingCross || !canUseStartState}
          >
            {isSearchingCross ? "Cross探索中" : "Cross探索"}
          </button>
          <button
            type="button"
            onClick={() => runBasicF2lAnalysis()}
            disabled={!selectedCrossSolution || isAnalyzingBasicF2l}
          >
            {isAnalyzingBasicF2l ? "F2L解析中" : "F2L解析"}
          </button>
          <button type="button" onClick={enterAnalyzerFullscreen}>
            3D全画面
          </button>
        </div>
      </section>

      <div className="analyzer-layout">
        <section className="analyzer-panel analyzer-input-panel" aria-label="Analyzer inputs">
          <div className="analyzer-input-controls">
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

          <div className="analyzer-mode-toggle analyzer-input-mode-toggle" aria-label="Start state input mode">
            <button
              type="button"
              aria-pressed={inputMode === "scramble"}
              onClick={() => setInputMode("scramble")}
            >
              スクランブル入力
            </button>
            <button
              type="button"
              aria-pressed={inputMode === "color"}
              onClick={() => setInputMode("color")}
            >
              色パレット
            </button>
          </div>

          {inputMode === "scramble" ? (
            <>
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
            <button type="button" onClick={applyScramble} disabled={!canUseStartState}>
              スクランブル適用
            </button>
            <button type="button" onClick={() => void copyScrambleInput()}>
              コピー
            </button>
            <button type="button" onClick={openScramblePreview} disabled={!scrambleInput.trim()}>
              スクランブルを確認する
            </button>
          </div>
            </>
          ) : (
            <section className="analyzer-color-editor" aria-label="Color palette state input">
              <div className="analyzer-color-toolbar">
                <div className="analyzer-color-palette" aria-label="Paint color">
                  {COLOR_OPTIONS.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={selectedPaintColor === option.value ? "is-selected" : ""}
                      onClick={() => setSelectedPaintColor(option.value)}
                      aria-pressed={selectedPaintColor === option.value}
                      title={option.label}
                    >
                      <span
                        aria-hidden="true"
                        style={{ backgroundColor: getColorCss(option.value) }}
                      />
                      {option.shortLabel}
                    </button>
                  ))}
                </div>
                <div className="analyzer-color-tools">
                  <button type="button" onClick={resetStickerColorGrid}>
                    初期状態に戻す
                  </button>
                  <button
                    type="button"
                    onClick={loadScrambleIntoStickerGrid}
                    disabled={!canUseScramble}
                  >
                    スクランブルから作成
                  </button>
                </div>
              </div>

              <div className="analyzer-color-net" aria-label="Sticker color net">
                {COLOR_FACE_ORDER.map((face) => (
                  <div
                    className={`analyzer-color-face analyzer-color-face-${face.toLowerCase()}`}
                    key={face}
                  >
                    <span>{face}</span>
                    <div className="analyzer-color-stickers">
                      {stickerColorGrid[face].map((color, stickerIndex) => {
                        const isCenter = stickerIndex === STICKER_CENTER_INDEX;

                        return (
                          <button
                            type="button"
                            key={`${face}-${stickerIndex}`}
                            className={isCenter ? "is-center" : ""}
                            onClick={() => paintSticker(face, stickerIndex)}
                            disabled={isCenter}
                            title={`${face}${stickerIndex + 1} ${getColorLabel(color)}`}
                            style={{ backgroundColor: getColorCss(color) }}
                          >
                            {isCenter ? face : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="analyzer-color-counts" aria-label="Sticker color counts">
                {COLOR_OPTIONS.map((option) => (
                  <span
                    key={option.value}
                    className={stickerColorCounts[option.value] === 9 ? "is-ok" : "is-warn"}
                  >
                    <i
                      aria-hidden="true"
                      style={{ backgroundColor: getColorCss(option.value) }}
                    />
                    {option.shortLabel}: {stickerColorCounts[option.value]}/9
                  </span>
                ))}
              </div>
            </section>
          )}

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
            <button type="button" onClick={applyScramble} disabled={!canUseStartState}>
              {inputMode === "color" ? "色配置を反映" : "スクランブルを反映"}
            </button>
            <button
              type="button"
              onClick={openScramblePreview}
              disabled={inputMode !== "scramble" || !scrambleInput.trim()}
            >
              スクランブルを確認する
            </button>
            <button
              type="button"
              onClick={playCombined}
              disabled={
                (inputMode === "scramble" && unsupportedScrambleTokens.length > 0) ||
                parsedSolve.invalidTokens.length > 0 ||
                !canUseStartState
              }
            >
              崩した状態から手順を再生
            </button>
          </div>

          <div className="analyzer-stats" aria-label="Move counts">
            <div>
              <span>Start</span>
              <strong>{startInputCount}</strong>
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
          </div>

          <div className="analyzer-analysis-flow">
          <section className="analyzer-cross-card" aria-label="Cross candidates">
            <div className="analyzer-subheading">
              <div>
                <p className="eyebrow">Cross Analyzer</p>
                <h2>最短クロス探索</h2>
              </div>
              <button
                className="analyzer-primary-action"
                type="button"
                disabled={isSearchingCross || !canUseStartState}
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

            <details className="analyzer-study-note">
              <summary>Practice memo</summary>
              <ul>
                <li>クロスは手順暗記より、インスペクション中に4つのエッジを読む練習が大事です。</li>
                <li>D面の色だけでなく、側面色がセンターと合っているかまで見ます。</li>
                <li>1本ずつ入れるより、隣り合う2色をまとめて動かせないか探します。</li>
                <li>最後にD面を回してセンター合わせする選択肢も残しておくと、F2Lへつなげやすくなります。</li>
                <li>最初は7〜8手以内を目安に、読んだCrossを手元を見ずに回す練習へつなげます。</li>
                <li>Crossが終わる位置を予測できると、最初のF2Lペア探しがかなり楽になります。</li>
              </ul>
            </details>
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
                <div className="analyzer-f2l-run-actions">
                  <button
                    className="analyzer-primary-action"
                    type="button"
                    onClick={() => runBasicF2lAnalysis()}
                    disabled={isAnalyzingBasicF2l}
                  >
                    {isAnalyzingBasicF2l ? "F2L解析中..." : "既存手順DBでF2L解析"}
                  </button>
                  <button
                    className="analyzer-primary-action analyzer-next-f2l-action"
                    type="button"
                    onClick={prepareNextF2lPlayback}
                    disabled={!canPlayNextF2l}
                  >
                    {nextF2lButtonLabel}
                  </button>
                </div>
                <div className="analyzer-previous-step-row" aria-label="Practice previous step">
                  <button
                    className="analyzer-primary-action analyzer-previous-step-action"
                    type="button"
                    onClick={preparePreviousPracticeStep}
                    disabled={!canPlayPreviousPracticeStep}
                  >
                    {previousPracticeButtonLabel}
                  </button>
                </div>
                {isAnalyzingBasicF2l && (
                  <article className="analyzer-basic-f2l-plan">
                    <p className="eyebrow">Basic F2L 41</p>
                    <h3>{basicF2lLoadingTitle}</h3>
                    <p>{basicF2lLoadingDescription}</p>
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
                        <h3>基本41ベース最短順序</h3>
                      </div>
                      <div className="analyzer-basic-f2l-summary">
                        <span>
                          {basicF2lComparedOrderCount > 0
                            ? `${basicF2lComparedOrderCount}順序比較`
                            : basicF2lPlan.strategy === "permutation"
                              ? "24順序比較"
                              : "貪欲選択"}
                        </span>
                        <span>order {basicF2lPlan.order.join(" → ")}</span>
                        <span>{basicF2lPlan.steps.length} steps</span>
                        {basicF2lAnalysisPhase === "fallback" && <span>補助探索あり</span>}
                        {basicF2lAnalysisPhase === "basic41" && <span>DBのみ</span>}
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
                    {basicF2lAnalysisPhase === "basic41" && basicF2lPlan.unresolvedPairs.length > 0 && (
                      <button
                        className="analyzer-primary-action"
                        type="button"
                        onClick={() => runBasicF2lAnalysis({ useLocalSearch: true })}
                        disabled={isAnalyzingBasicF2l}
                      >
                        {isAnalyzingBasicF2l ? "補助探索中..." : "未解決ペアを詳しく探索"}
                      </button>
                    )}
                  </article>
                )}
                {(otherBasicF2lOrderPlans.length > 0 || canLoadMoreBasicF2lOrderPlans) && (
                  <article className="analyzer-basic-f2l-plan">
                    <div className="analyzer-basic-f2l-heading">
                      <div>
                        <p className="eyebrow">Basic41 Order Ranking</p>
                        <h3>他の順序候補</h3>
                      </div>
                      <div className="analyzer-basic-f2l-summary">
                        <span>{basicF2lComparedOrderCount} orders</span>
                        <span>
                          {basicF2lAnalysisPhase === "fallback" ? "補助探索込み" : "Basic41 + 取り出し"}
                        </span>
                      </div>
                    </div>

                    <p>
                      最短順序だけを上に表示しています。FR / FL / BR / BL の別順序候補は必要な時だけ開けます。
                    </p>

                    <button
                      className="ghost-button"
                      type="button"
                      aria-expanded={showBasicF2lOrderDetails}
                      disabled={isLoadingBasicF2lOrderDetails}
                      onClick={() => {
                        if (otherBasicF2lOrderPlans.length === 0) {
                          runBasicF2lAnalysis({
                            includeAllPlans: true,
                            useLocalSearch: basicF2lAnalysisPhase === "fallback",
                          });
                          return;
                        }

                        setShowBasicF2lOrderDetails((isShown) => !isShown);
                      }}
                    >
                      {moreBasicF2lOrderButtonLabel}
                    </button>

                    {showBasicF2lOrderDetails && (
                      <ol className="analyzer-basic-f2l-steps">
                        {otherBasicF2lOrderPlans.map((plan, planIndex) => (
                          <li key={plan.id}>
                            <div className="analyzer-basic-f2l-step-head">
                              <strong>
                                候補 {planIndex + 2}: {plan.totalMoveCount} moves / order{" "}
                                {plan.order.join(" → ")}
                              </strong>
                              <button type="button" onClick={() => playBasicF2lSteps(plan.steps)}>
                                この候補を3D再生
                              </button>
                            </div>

                            <div className="analyzer-f2l-tags">
                              <span>Steps: {plan.steps.length}</span>
                              <span>Score: {plan.totalScore.toFixed(1)}</span>
                              <span>未解決: {plan.unresolvedPairs.length}</span>
                              <span>{plan.unresolvedPairs.length === 0 ? "F2L完成" : "未完了"}</span>
                            </div>

                            {plan.steps.length > 0 ? (
                              <ol className="analyzer-basic-f2l-steps">
                                {plan.steps.map((step, stepIndex) => (
                                  <li key={`${plan.id}-${step.id}`}>
                                    <div className="analyzer-basic-f2l-step-head">
                                      <strong>
                                        Step {stepIndex + 1}: {step.pairTitle}
                                      </strong>
                                      <button
                                        type="button"
                                        onClick={() => playBasicF2lPlanStep(plan, stepIndex)}
                                      >
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

                                    <code>{step.fullAlgorithm || step.algorithm}</code>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className="analyzer-muted">この順序では追加手順がありません。</p>
                            )}

                            {plan.unresolvedPairs.length > 0 && (
                              <p className="analyzer-muted">
                                未解決ペア: {plan.unresolvedPairs.map((pair) => pair.slotLabel).join(", ")}
                              </p>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </article>
                )}
                <div className="analyzer-f2l-list">
                  {f2lCandidates.length === 0 ? (
                    <p className="analyzer-muted">
                      {selectedCrossSolution.targetFace === "D"
                        ? "F2L候補を判定できませんでした。"
                        : "現在のF2L解析はD面Crossのみ対応しています。Cross targetをD面にしてCross解析し直してください。"}
                    </p>
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
                    <div className="analyzer-f2l-detail-head">
                      <h3>{selectedF2lPair.slotLabel}</h3>
                      <label className="analyzer-f2l-highlight-toggle">
                        <input
                          type="checkbox"
                          checked={isF2lPairHighlightEnabled}
                          onChange={(event) =>
                            setIsF2lPairHighlightEnabled(event.currentTarget.checked)
                          }
                        />
                        <span>F2L中のペアを強調</span>
                      </label>
                    </div>
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
              F2L best後の状態から、上面色の向きパターンを既存OLL DBと照合します。
            </p>
            {ollRecognition ? (
              <article className="analyzer-candidate-card">
                <p className="eyebrow">OLL Recognition</p>
                {ollRecognition.ok ? (
                  <>
                    <h3>{ollRecognition.recognition.caseTitle}</h3>
                    <code>{ollRecognition.recognition.algorithm || "OLL Skip"}</code>
                    <p>
                      {ollRecognition.recognition.isSkip
                        ? "F2L後の時点でOLLは完成しています。"
                        : "このOLL手順をF2L完成状態から再生できます。"}
                    </p>
                    <div className="analyzer-f2l-tags">
                      <span>{ollRecognition.recognition.moveCount} moves</span>
                      <span>{ollRecognition.recognition.setupAlgorithm || "AUFなし"}</span>
                    </div>
                    <div className="analyzer-f2l-actions">
                      <button type="button" onClick={prepareBestOllPlayback}>
                        OLLを3D再生待ち
                      </button>
                      <button
                        type="button"
                        onClick={() => openLastLayerLearnPreview("oll")}
                      >
                        Learnで勉強
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="analyzer-muted">{ollRecognition.reason}</p>
                )}
              </article>
            ) : (
              <p className="analyzer-muted">
                F2L bestを作ると、その完成状態からOLLを判定します。
              </p>
            )}
            <details className="analyzer-library-details">
              <summary>OLLライブラリ {ollCandidates.length}件</summary>
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
            </details>
          </section>

          <section className="analyzer-candidate-section" aria-label="PLL candidate preview">
            <div className="analyzer-subheading">
              <div>
                <p className="eyebrow">PLL Preview</p>
                <h2>最後に見るPLL候補</h2>
              </div>
            </div>
            <p className="analyzer-muted">
              OLL適用後の状態から、最後層ピースの並びを既存PLL DBと照合します。
            </p>
            {pllRecognition ? (
              <article className="analyzer-candidate-card">
                <p className="eyebrow">PLL Recognition</p>
                {pllRecognition.ok ? (
                  <>
                    <h3>{pllRecognition.recognition.caseTitle}</h3>
                    <code>{pllRecognition.recognition.algorithm || "PLL Skip"}</code>
                    <p>
                      {pllRecognition.recognition.isSkip
                        ? "OLL後の時点でPLLは完成しています。"
                        : "このPLL手順をOLL完成状態から再生できます。"}
                    </p>
                    <div className="analyzer-f2l-tags">
                      <span>{pllRecognition.recognition.moveCount} moves</span>
                      <span>{pllRecognition.recognition.setupAlgorithm || "AUFなし"}</span>
                    </div>
                    <div className="analyzer-f2l-actions">
                      <button type="button" onClick={prepareBestPllPlayback}>
                        PLLを3D再生待ち
                      </button>
                      <button
                        type="button"
                        onClick={() => openLastLayerLearnPreview("pll")}
                      >
                        Learnで勉強
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="analyzer-muted">{pllRecognition.reason}</p>
                )}
              </article>
            ) : (
              <p className="analyzer-muted">
                OLLを判定できる状態になると、その後のPLLも判定します。
              </p>
            )}
            <details className="analyzer-library-details">
              <summary>PLLライブラリ {pllCandidates.length}件</summary>
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
            </details>
          </section>
          </div>
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
              <h2>3D再生</h2>
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
              <label className="analyzer-speed-control">
                <span>Size</span>
                <select
                  value={cubeScale}
                  onChange={(event) => {
                    const nextScale = Number(event.target.value);

                    if (isAnalyzerCubeScale(nextScale)) {
                      setCubeScale(nextScale);
                    }
                  }}
                >
                  {ANALYZER_CUBE_SCALE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="analyzer-f2l-highlight-toggle analyzer-f2l-highlight-toggle-compact">
                <input
                  type="checkbox"
                  checked={isF2lPairHighlightEnabled}
                  onChange={(event) =>
                    setIsF2lPairHighlightEnabled(event.currentTarget.checked)
                  }
                />
                <span>F2L強調</span>
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

          <div className="analyzer-player-body">
            <div
              className="analyzer-canvas-frame"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <canvas ref={canvasRef} aria-label="3D cube preview" />
            </div>

            <aside className="analyzer-control-panel" aria-label="Animation controls">
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
                <button type="button" onClick={() => setShowManualControls((visible) => !visible)}>
                  {showManualControls ? "回転記号を隠す" : "回転記号を表示"}
                </button>
              </div>

              {showManualControls && (
                <MoveButtonPanel
                  onMove={applyManualMove}
                  onUndo={undoManualMove}
                  onResetManual={resetManualMoves}
                  onResetState={resetPlayback}
                  canUndo={manualMoveHistory.length > 0}
                  manualMoveCount={manualMoveHistory.length}
                  disabled={isManualMoveAnimating}
                />
              )}

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

              <div className="analyzer-phase-replay-panel" aria-label="Phase best playback">
                <div className="analyzer-phase-replay-head">
                  <div>
                    <p className="eyebrow">Best Playback</p>
                    <h3>工程別best</h3>
                  </div>
                  <span>{quickPlaybackStatus}</span>
                </div>
                <div className="analyzer-phase-replay-actions">
                  <button
                    type="button"
                    onClick={prepareBestCrossPlayback}
                    disabled={isSearchingCross || !canUseStartState}
                  >
                    {isSearchingCross ? "Cross..." : "Cross"}
                  </button>
                  <button
                    type="button"
                    onClick={prepareBestF2lPlayback}
                    disabled={!selectedCrossSolution || isAnalyzingBasicF2l}
                  >
                    {isAnalyzingBasicF2l ? "F2L..." : "F2L"}
                  </button>
                  <button
                    className="analyzer-next-f2l-action"
                    type="button"
                    onClick={prepareNextF2lPlayback}
                    disabled={!canPlayNextF2l}
                  >
                    {nextF2lButtonLabel}
                  </button>
                  <button type="button" onClick={prepareBestOllPlayback}>
                    OLL
                  </button>
                  <button type="button" onClick={prepareBestPllPlayback}>
                    PLL
                  </button>
                </div>
                <div className="analyzer-previous-step-row" aria-label="Practice previous step">
                  <button
                    className="analyzer-previous-step-action"
                    type="button"
                    onClick={preparePreviousPracticeStep}
                    disabled={!canPlayPreviousPracticeStep}
                  >
                    {previousPracticeButtonLabel}
                  </button>
                </div>
                <div className="analyzer-phase-learn-actions" aria-label="Last layer learn links">
                  <button
                    type="button"
                    disabled={!ollRecognition?.ok}
                    onClick={() => openLastLayerLearnPreview("oll")}
                  >
                    OLL Learn
                  </button>
                  <button
                    type="button"
                    disabled={!pllRecognition?.ok}
                    onClick={() => openLastLayerLearnPreview("pll")}
                  >
                    PLL Learn
                  </button>
                </div>
              </div>
            </aside>
          </div>

          {lastLayerLearnPreview && (
            <div
              className="analyzer-learn-preview-overlay"
              role="presentation"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  closeLastLayerLearnPreview();
                }
              }}
            >
              <article
                aria-label={`${lastLayerLearnPreview.phase.toUpperCase()} learn preview`}
                aria-modal="true"
                className="analyzer-learn-preview-modal"
                role="dialog"
              >
                <button
                  className="analyzer-learn-preview-close"
                  type="button"
                  onClick={closeLastLayerLearnPreview}
                >
                  閉じる
                </button>

                <section className="analyzer-learn-preview-study">
                  <div className="analyzer-learn-preview-head">
                    <div>
                      <p className="eyebrow">
                        {lastLayerLearnPreview.phase.toUpperCase()} Learn Preview
                      </p>
                      <h3>{lastLayerLearnPreview.recognition.caseTitle}</h3>
                    </div>
                    <span>
                      {lastLayerLearnPreview.recognition.isSkip
                        ? `${lastLayerLearnPreview.phase.toUpperCase()} Skip`
                        : "自動認識したケース"}
                    </span>
                  </div>

                  <div className="analyzer-learn-preview-case">
                    <AnalyzerLastLayerCasePreview
                      caseItem={lastLayerLearnPreview.recognition.caseItem}
                      phase={lastLayerLearnPreview.phase}
                      title={lastLayerLearnPreview.recognition.caseTitle}
                    />
                    <div className="analyzer-learn-preview-copy">
                      <p>
                        {lastLayerLearnPreview.recognition.caseItem?.subtitle ??
                          "この状態はこの工程をスキップできます。必要なら一覧から近いケースを復習できます。"}
                      </p>
                      <div className="analyzer-f2l-tags">
                        <span>{lastLayerLearnPreview.recognition.moveCount} moves</span>
                        <span>{lastLayerLearnPreview.recognition.setupAlgorithm || "AUFなし"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="algorithm-box analyzer-learn-preview-algorithm">
                    <span>手順</span>
                    <code>{lastLayerLearnPreview.recognition.algorithm || "Skip"}</code>
                  </div>

                  <p className="analyzer-learn-preview-description">
                    {lastLayerLearnPreview.recognition.caseItem?.description ??
                      `${lastLayerLearnPreview.phase.toUpperCase()}は完成済みです。次の工程に進めます。`}
                  </p>

                  {lastLayerLearnPreview.recognition.caseItem && (
                    <div className="learn-tags" aria-label="Case tags">
                      {lastLayerLearnPreview.recognition.caseItem.tags.slice(0, 5).map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                    </div>
                  )}

                  <div className="analyzer-learn-preview-actions">
                    <button type="button" onClick={closeLastLayerLearnPreview}>
                      閉じる
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (lastLayerLearnPreview.phase === "oll") {
                          prepareBestOllPlayback();
                        } else {
                          prepareBestPllPlayback();
                        }

                        closeLastLayerLearnPreview();
                      }}
                    >
                      3Dで見る
                    </button>
                    <button
                      className="analyzer-primary-action"
                      type="button"
                      onClick={() =>
                        openLearningCaseLearn(
                          lastLayerLearnPreview.recognition.caseItem,
                          lastLayerLearnPreview.phase,
                        )
                      }
                    >
                      {lastLayerLearnPreview.recognition.caseItem ? "Learn詳細へ" : "Learn一覧へ"}
                    </button>
                  </div>
                </section>
              </article>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
