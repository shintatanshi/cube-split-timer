import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import {
  ANIMATION_SPEED_OPTIONS,
  CUBE_DETAIL_COLORS,
  CUBE_FACE_COLORS,
  loadAnimationSpeed,
  saveAnimationSpeed,
  type AnimationSpeed,
} from "../lib/cubeVisuals";
import { getMoveDescriptor, parseAlgorithm } from "../learn/moveNotation";
import type { MoveAxis } from "../learn/moveNotation";

type FaceName = "U" | "D" | "F" | "B" | "R" | "L";

interface ScramblePreviewPageProps {
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

const TURN_DURATION_MS = 360;
const PLAY_DELAY_MS = 130;
const SCRAMBLE_SPEED_STORAGE_KEY = "cubeSplitTimer.scramblePreviewSpeed.v1";
const SCRAMBLE_MOVE_GROUPS = [
  ["U", "U'", "U2"],
  ["D", "D'", "D2"],
  ["R", "R'", "R2"],
  ["L", "L'", "L2"],
  ["F", "F'", "F2"],
  ["B", "B'", "B2"],
];

const FACE_COLORS: Record<FaceName, number> = CUBE_FACE_COLORS;

const INITIAL_VIEW_ROTATION = {
  x: -0.18,
  y: -0.3,
  z: 0,
};

function getQueryValue(key: string): string {
  try {
    return new URLSearchParams(window.location.search).get(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

function getReturnPath(): string {
  const returnTo = getQueryValue("returnTo");

  if (!returnTo || !returnTo.startsWith("/")) {
    return "/";
  }

  return returnTo;
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

function createStickerMaterial(color: number) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.01,
    roughness: 0.62,
  });
}

function addSticker(cubie: THREE.Group, face: FaceName) {
  const sticker = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.7),
    createStickerMaterial(FACE_COLORS[face]),
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

function createCubie(x: number, y: number, z: number): Cubie {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.92, 0.92),
    new THREE.MeshStandardMaterial({
      color: CUBE_DETAIL_COLORS.body,
      metalness: 0.02,
      roughness: 0.78,
    }),
  );
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(0.94, 0.94, 0.94)),
    new THREE.LineBasicMaterial({
      color: CUBE_DETAIL_COLORS.edge,
      transparent: true,
      opacity: 0.76,
    }),
  );

  
  group.position.set(x, y, z);
  group.add(body);
  group.add(outline);

  if (y === 1) addSticker(group, "U");
  if (y === -1) addSticker(group, "D");
  if (z === 1) addSticker(group, "F");
  if (z === -1) addSticker(group, "B");
  if (x === 1) addSticker(group, "R");
  if (x === -1) addSticker(group, "L");

  return {
    group,
    coord: new THREE.Vector3(x, y, z),
  };
}

function createSolvedCubies(cubeGroup: THREE.Group): Cubie[] {
  disposeObject(cubeGroup);
  cubeGroup.clear();
  cubeGroup.position.set(0, 0, 0);
  const cubies: Cubie[] = [];

  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        const cubie = createCubie(x, y, z);
        cubies.push(cubie);
        cubeGroup.add(cubie.group);
      }
    }
  }

  return cubies;
}

function roundCoord(value: number): number {
  return Math.max(-1, Math.min(1, Math.round(value)));
}

function getAxisVector(axis: MoveAxis): THREE.Vector3 {
  if (axis === "x") return new THREE.Vector3(1, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
}

function easeInOut(value: number): number {
  return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function applyMoveTransform(
  cubeGroup: THREE.Group,
  cubies: Cubie[],
  move: string,
  reverse = false,
) {
  const descriptor = getMoveDescriptor(move, reverse);

  if (!descriptor) {
    return;
  }

  const selectedCubies = cubies.filter((cubie) =>
    descriptor.layers.includes(roundCoord(cubie.coord[descriptor.axis])),
  );
  const pivot = new THREE.Group();
  cubeGroup.add(pivot);
  cubeGroup.updateMatrixWorld(true);
  selectedCubies.forEach((cubie) => pivot.attach(cubie.group));
  pivot.rotation[descriptor.axis] = descriptor.angle;

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
    cubeGroup.attach(cubie.group);
    cubie.group.position.copy(cubie.coord);
  });

  cubeGroup.remove(pivot);
}

function resetViewRotation(cubeGroup: THREE.Group) {
  cubeGroup.rotation.set(INITIAL_VIEW_ROTATION.x, INITIAL_VIEW_ROTATION.y, INITIAL_VIEW_ROTATION.z);
}

function fitCubeToCanvas(state: SceneState, canvas: HTMLCanvasElement) {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const shortestSide = Math.min(width, height);
  const scale = shortestSide < 330 ? 0.62 : 0.74;
  const distance = shortestSide < 330 ? 9 : 8.2;
  const fov = shortestSide < 330 ? 31 : 34;

  state.cubeGroup.scale.setScalar(scale);
  state.camera.fov = fov;
  state.camera.position.set(0, 0, distance);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
  state.renderer.setSize(width, height, false);
  state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

export default function ScramblePreviewPage({
  onNavigate,
  onOpenTimer,
}: ScramblePreviewPageProps) {
  const [initialReturnPath] = useState(getReturnPath);
  const [scrambleInput, setScrambleInput] = useState(() => getQueryValue("scramble"));
  const [playbackScramble, setPlaybackScramble] = useState(() => getQueryValue("scramble"));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<AnimationSpeed>(() =>
    loadAnimationSpeed([SCRAMBLE_SPEED_STORAGE_KEY]),
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<HTMLElement | null>(null);
  const sceneStateRef = useRef<SceneState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const animationRunRef = useRef(0);
  const isAnimatingRef = useRef(false);

  const parsedInput = useMemo(() => parseAlgorithm(scrambleInput), [scrambleInput]);
  const parsedPlayback = useMemo(() => parseAlgorithm(playbackScramble), [playbackScramble]);
  const currentMove = currentIndex > 0 ? parsedPlayback.moves[currentIndex - 1] : null;
  const nextMove =
    currentIndex < parsedPlayback.moves.length ? parsedPlayback.moves[currentIndex] : null;
  const isComplete =
    parsedPlayback.moves.length > 0 && currentIndex >= parsedPlayback.moves.length;

  const resetCubeState = useCallback(() => {
    const state = sceneStateRef.current;

    if (!state) {
      return;
    }

    animationRunRef.current += 1;
    isAnimatingRef.current = false;
    state.cubies = createSolvedCubies(state.cubeGroup);
  }, []);

  const applyMovesInstant = useCallback((moves: string[]) => {
    const state = sceneStateRef.current;

    if (!state) {
      return;
    }

    resetCubeState();
    moves.forEach((move) => applyMoveTransform(state.cubeGroup, state.cubies, move));
  }, [resetCubeState]);

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

        const ratio = Math.min(1, (now - start) / (TURN_DURATION_MS / speed));
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
  }, [speed]);

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
      cubies: createSolvedCubies(cubeGroup),
      frameId: 0,
      resizeObserver: new ResizeObserver(() => fitCubeToCanvas(state, canvas)),
      animationStart: performance.now(),
    };

    sceneStateRef.current = state;
    fitCubeToCanvas(state, canvas);
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
    if (!isPlaying) {
      return undefined;
    }

    if (currentIndex >= parsedPlayback.moves.length) {
      setIsPlaying(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const didMove = await animateMove(parsedPlayback.moves[currentIndex]);

        if (didMove) {
          setCurrentIndex((index) => Math.min(index + 1, parsedPlayback.moves.length));
        }
      })();
    }, PLAY_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [animateMove, currentIndex, isPlaying, parsedPlayback.moves]);

  const appendMove = (move: string) => {
    setScrambleInput((current) => {
      const trimmed = current.trim();
      return trimmed ? `${trimmed} ${move}` : move;
    });
  };

  const deleteLastMove = () => {
    setScrambleInput((current) =>
      current.trim().split(/\s+/).filter(Boolean).slice(0, -1).join(" "),
    );
  };

  const applyScrambleAsState = () => {
    if (parsedInput.invalidTokens.length > 0) {
      return;
    }

    setPlaybackScramble(scrambleInput);
    setIsPlaying(false);
    applyMovesInstant(parsedInput.moves);
    setCurrentIndex(parsedInput.moves.length);
  };

  const playFromStart = () => {
    if (parsedInput.invalidTokens.length > 0) {
      return;
    }

    setPlaybackScramble(scrambleInput);
    setIsPlaying(parsedInput.moves.length > 0);
    resetCubeState();
    setCurrentIndex(0);
  };

  const handlePlayToggle = () => {
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }

    if (parsedPlayback.moves.length === 0) {
      return;
    }

    if (isComplete) {
      resetCubeState();
      setCurrentIndex(0);
    }

    setIsPlaying(true);
  };

  const stepNext = async () => {
    if (currentIndex >= parsedPlayback.moves.length) {
      return;
    }

    setIsPlaying(false);
    const didMove = await animateMove(parsedPlayback.moves[currentIndex]);

    if (didMove) {
      setCurrentIndex((index) => Math.min(index + 1, parsedPlayback.moves.length));
    }
  };

  const stepPrevious = async () => {
    if (currentIndex <= 0) {
      return;
    }

    setIsPlaying(false);
    const didMove = await animateMove(parsedPlayback.moves[currentIndex - 1], true);

    if (didMove) {
      setCurrentIndex((index) => Math.max(0, index - 1));
    }
  };

  const copyScramble = async () => {
    try {
      await navigator.clipboard.writeText(scrambleInput.trim());
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  useEffect(() => {
    if (copyStatus === "idle") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setCopyStatus("idle"), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [copyStatus]);

  useEffect(() => {
    saveAnimationSpeed(speed);
  }, [speed]);

  const enterFullscreen = useCallback(() => {
    setIsFullscreen(true);

    const element = playerRef.current;
    if (element?.requestFullscreen) {
      void element.requestFullscreen().catch(() => {
        // Fullscreen APIが使えない環境ではCSSの疑似全画面で表示します。
      });
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("scramble-preview-fullscreen-open", isFullscreen);

    return () => {
      document.body.classList.remove("scramble-preview-fullscreen-open");
    };
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        exitFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [exitFullscreen, isFullscreen]);

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

  return (
    <main className="app-shell scramble-preview-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Scramble check</p>
          <h1>スクランブル確認</h1>
        </div>
        <div className="header-actions">
          <button className="ghost-button" type="button" onClick={() => onNavigate(initialReturnPath)}>
            戻る
          </button>
          <button className="ghost-button" type="button" onClick={onOpenTimer}>
            Timer
          </button>
        </div>
      </header>

      <section className="scramble-preview-hero">
        <div>
          <p className="eyebrow">Before solve</p>
          <h2>記号を見ながら、崩し方だけを3Dで確認できます</h2>
        </div>
        <p>
          ここで確認してTimerやAnalyzerへ戻っても、元のスクランブル文字列は変更しません。
        </p>
      </section>

      <div className="scramble-preview-layout">
        <section className="scramble-preview-panel">
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
                  <button type="button" key={move} onClick={() => appendMove(move)}>
                    {move}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="analyzer-scramble-tools">
            <button type="button" onClick={deleteLastMove}>
              1手削除
            </button>
            <button type="button" onClick={() => setScrambleInput("")}>
              全消し
            </button>
            <button
              type="button"
              onClick={applyScrambleAsState}
              disabled={parsedInput.invalidTokens.length > 0}
            >
              崩れた状態を表示
            </button>
            <button
              type="button"
              onClick={playFromStart}
              disabled={parsedInput.invalidTokens.length > 0}
            >
              最初から再生
            </button>
            <button type="button" onClick={() => void copyScramble()}>
              コピー
            </button>
          </div>

          {parsedInput.invalidTokens.length > 0 && (
            <div className="analyzer-error" role="alert">
              <p>対応していない回転記号があります: {parsedInput.invalidTokens.join(", ")}</p>
            </div>
          )}

          {copyStatus !== "idle" && (
            <p className="analyzer-copy-status" role="status">
              {copyStatus === "copied" ? "コピーしました。" : "コピーできませんでした。"}
            </p>
          )}
        </section>

        <section
          ref={playerRef}
          className={[
            "scramble-preview-panel scramble-preview-player",
            isFullscreen ? "is-fullscreen" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="analyzer-player-header">
            <div>
              <p className="eyebrow">3D Animation</p>
              <h2>スクランブル再生</h2>
            </div>
            <div className="analyzer-player-actions">
              <label className="analyzer-speed-control">
                <span>Speed</span>
                <select
                  value={speed}
                  onChange={(event) => setSpeed(Number(event.target.value) as AnimationSpeed)}
                >
                  {ANIMATION_SPEED_OPTIONS.map((speedOption) => (
                    <option key={speedOption} value={speedOption}>
                      {speedOption}x
                    </option>
                  ))}
                </select>
              </label>
              <div className="analyzer-step">
                Step: {currentIndex} / {parsedPlayback.moves.length}
              </div>
              <button
                type="button"
                className="analyzer-fullscreen-button"
                onClick={isFullscreen ? exitFullscreen : enterFullscreen}
              >
                {isFullscreen ? "閉じる" : "全画面"}
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
            <canvas ref={canvasRef} aria-label="Scramble 3D cube preview" />
          </div>

          <div className="analyzer-now">
            <span>Now: {currentMove ?? "Ready"}</span>
            <small>{nextMove ? `Next: ${nextMove}` : "最後まで再生済み、または手順待ちです。"}</small>
          </div>

          <div className="analyzer-controls">
            <button type="button" onClick={handlePlayToggle} disabled={parsedPlayback.moves.length === 0}>
              {isPlaying ? "一時停止" : isComplete ? "もう一度再生" : "再生"}
            </button>
            <button type="button" onClick={() => void stepPrevious()} disabled={currentIndex <= 0}>
              1手戻る
            </button>
            <button
              type="button"
              onClick={() => void stepNext()}
              disabled={currentIndex >= parsedPlayback.moves.length}
            >
              1手進む
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                resetCubeState();
                setCurrentIndex(0);
              }}
            >
              リセット
            </button>
            <button
              type="button"
              onClick={() => {
                const state = sceneStateRef.current;
                if (state) resetViewRotation(state.cubeGroup);
              }}
            >
              視点リセット
            </button>
          </div>

          <div className="analyzer-move-list" aria-label="Scramble move list">
            {parsedPlayback.moves.length === 0 ? (
              <span className="analyzer-move-empty">スクランブルを入力してください。</span>
            ) : (
              parsedPlayback.moves.map((move, index) => (
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
        </section>
      </div>
    </main>
  );
}
