type LandscapeOrientationLock = "landscape" | "portrait" | "any" | OrientationType;

interface LockableScreenOrientation {
  lock?: (orientation: LandscapeOrientationLock) => Promise<void>;
  unlock?: () => void;
}

export interface LandscapeFullscreenResult {
  fullscreenEntered: boolean;
  orientationLocked: boolean;
}

function getScreenOrientation(): LockableScreenOrientation | null {
  if (typeof screen === "undefined" || !("orientation" in screen)) {
    return null;
  }

  return screen.orientation as unknown as LockableScreenOrientation;
}

async function requestFullscreen(element: HTMLElement | null): Promise<boolean> {
  if (!element?.requestFullscreen) {
    return false;
  }

  if (document.fullscreenElement === element) {
    return true;
  }

  try {
    await element.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

export async function enterLandscapeFullscreen(
  element: HTMLElement | null,
): Promise<LandscapeFullscreenResult> {
  const fullscreenEntered = await requestFullscreen(element);
  const orientation = getScreenOrientation();
  let orientationLocked = false;

  if (orientation?.lock) {
    try {
      await orientation.lock("landscape");
      orientationLocked = true;
    } catch {
      orientationLocked = false;
    }
  }

  return { fullscreenEntered, orientationLocked };
}

export async function exitLandscapeFullscreen(): Promise<void> {
  try {
    getScreenOrientation()?.unlock?.();
  } catch {
    // Orientation unlock is best effort only.
  }

  if (!document.fullscreenElement) {
    return;
  }

  try {
    await document.exitFullscreen();
  } catch {
    // The CSS fullscreen fallback is controlled by React state.
  }
}
