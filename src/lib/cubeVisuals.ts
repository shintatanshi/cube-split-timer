export type CubeFaceName = "U" | "D" | "F" | "B" | "R" | "L";
export type CubeColorName = "white" | "yellow" | "blue" | "green" | "red" | "orange";
export type AnimationSpeed = 0.25 | 0.5 | 1 | 1.5 | 2;

export const ANIMATION_SPEED_OPTIONS: AnimationSpeed[] = [0.25, 0.5, 1, 1.5, 2];
export const ANIMATION_SPEED_STORAGE_KEY = "cubeSplitTimer.animationSpeed.v1";

export const CUBE_COLOR_HEX: Record<CubeColorName, number> = {
  white: 0xf7fafc,
  yellow: 0xffe04f,
  blue: 0x347dff,
  green: 0x32c36c,
  red: 0xe53935,
  orange: 0xffa000,
};

export const CUBE_FACE_COLORS: Record<CubeFaceName, number> = {
  U: CUBE_COLOR_HEX.yellow,
  D: CUBE_COLOR_HEX.white,
  F: CUBE_COLOR_HEX.blue,
  B: CUBE_COLOR_HEX.green,
  R: CUBE_COLOR_HEX.red,
  L: CUBE_COLOR_HEX.orange,
};

export const CUBE_DETAIL_COLORS = {
  body: 0x111827,
  dim: 0x4f5c70,
  edge: 0x253149,
  f2lCorner: 0xff7b63,
  f2lEdge: 0x58b1ff,
  slot: 0xffd166,
};

export function loadAnimationSpeed(fallbackKeys: string[] = []): AnimationSpeed {
  try {
    const keys = [ANIMATION_SPEED_STORAGE_KEY, ...fallbackKeys];

    for (const key of keys) {
      const parsed = Number(localStorage.getItem(key));

      if (ANIMATION_SPEED_OPTIONS.includes(parsed as AnimationSpeed)) {
        return parsed as AnimationSpeed;
      }
    }

    return 1;
  } catch {
    return 1;
  }
}

export function saveAnimationSpeed(speed: AnimationSpeed): void {
  try {
    localStorage.setItem(ANIMATION_SPEED_STORAGE_KEY, String(speed));
  } catch {
    // Speed preference is optional; playback should continue even if storage fails.
  }
}
