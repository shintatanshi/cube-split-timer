import { isRecordingModeUrl } from "./recordingMode";

const turnSoundModules = import.meta.glob("../../sounds/*.{mp3,wav,ogg,m4a}", {
  import: "default",
  query: "?url",
});
const turnSoundModuleLoaders = Object.entries(turnSoundModules)
  .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
  .map(([, loadModule]) => loadModule);
const DEFAULT_TURN_SOUND_VOLUME = 0.34;
const TURN_SOUND_VOLUME_STORAGE_KEY = "cubeSplitTimer.turnSoundVolume.v1";

type AudioContextConstructor = new () => AudioContext;

let audioContext: AudioContext | null = null;
let turnSoundSources: string[] = [];
let turnSoundSourcesPromise: Promise<string[]> | null = null;
let audioBuffers: Array<AudioBuffer | null> = [];
let audioBufferPromises: Array<Promise<AudioBuffer | null> | null> = [];
let isUnlockListenerRegistered = false;
let isAudioUnlocked = false;
let lastSoundIndex = -1;

function normalizeCubeTurnSoundVolume(volume: number): number {
  if (!Number.isFinite(volume)) {
    return DEFAULT_TURN_SOUND_VOLUME;
  }

  return Math.min(1, Math.max(0, volume));
}

export function loadCubeTurnSoundVolume(): number {
  if (typeof localStorage === "undefined") {
    return DEFAULT_TURN_SOUND_VOLUME;
  }

  try {
    const storedVolume = localStorage.getItem(TURN_SOUND_VOLUME_STORAGE_KEY);

    if (storedVolume === null) {
      return DEFAULT_TURN_SOUND_VOLUME;
    }

    const parsed = Number(storedVolume);

    return normalizeCubeTurnSoundVolume(parsed);
  } catch {
    return DEFAULT_TURN_SOUND_VOLUME;
  }
}

let turnSoundVolume = loadCubeTurnSoundVolume();

export function saveCubeTurnSoundVolume(volume: number): void {
  turnSoundVolume = normalizeCubeTurnSoundVolume(volume);

  if (typeof localStorage === "undefined") {
    return;
  }

  try {
    localStorage.setItem(TURN_SOUND_VOLUME_STORAGE_KEY, String(turnSoundVolume));
  } catch {
    // Volume is a local preference; sounds should still work if storage is unavailable.
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;

  if (!AudioContextClass) {
    return null;
  }

  audioContext ??= new AudioContextClass();
  return audioContext;
}

function getRandomSoundIndex(poolSize: number): number {
  if (poolSize <= 1) {
    return 0;
  }

  let nextIndex = Math.floor(Math.random() * poolSize);

  if (nextIndex === lastSoundIndex) {
    nextIndex = (nextIndex + 1 + Math.floor(Math.random() * (poolSize - 1))) % poolSize;
  }

  lastSoundIndex = nextIndex;
  return nextIndex;
}

function getTurnSoundSource(moduleValue: unknown): string | null {
  if (typeof moduleValue === "string") {
    return moduleValue;
  }

  if (
    typeof moduleValue === "object" &&
    moduleValue !== null &&
    "default" in moduleValue &&
    typeof moduleValue.default === "string"
  ) {
    return moduleValue.default;
  }

  return null;
}

function loadTurnSoundSources(): Promise<string[]> {
  if (turnSoundSources.length > 0) {
    return Promise.resolve(turnSoundSources);
  }

  if (turnSoundSourcesPromise) {
    return turnSoundSourcesPromise;
  }

  if (turnSoundModuleLoaders.length === 0) {
    return Promise.resolve([]);
  }

  turnSoundSourcesPromise = Promise.all(turnSoundModuleLoaders.map((loadModule) => loadModule()))
    .then((moduleValues) => {
      turnSoundSources = moduleValues
        .map(getTurnSoundSource)
        .filter((source): source is string => source !== null);
      audioBuffers = Array.from({ length: turnSoundSources.length }, () => null);
      audioBufferPromises = Array.from({ length: turnSoundSources.length }, () => null);
      return turnSoundSources;
    })
    .catch((error: unknown) => {
      turnSoundSourcesPromise = null;

      if (import.meta.env.DEV) {
        console.warn("Cube turn sound sources could not be loaded.", error);
      }

      return [];
    });

  return turnSoundSourcesPromise;
}

async function loadTurnSoundBuffer(index: number): Promise<AudioBuffer | null> {
  const context = getAudioContext();
  const sources = await loadTurnSoundSources();

  if (!context || !sources[index]) {
    return null;
  }

  if (audioBuffers[index]) {
    return audioBuffers[index];
  }

  if (audioBufferPromises[index]) {
    return audioBufferPromises[index];
  }

  audioBufferPromises[index] = fetch(sources[index])
    .then((response) => response.arrayBuffer())
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => {
      audioBuffers[index] = buffer;
      return buffer;
    })
    .catch((error: unknown) => {
      audioBufferPromises[index] = null;

      if (import.meta.env.DEV) {
        console.warn("Cube turn sound could not be loaded.", error);
      }

      return null;
    });

  return audioBufferPromises[index];
}

function warmNextTurnSoundBuffer(): void {
  void loadTurnSoundSources().then((sources) => {
    const unloadedIndexes = sources
      .map((_, index) => index)
      .filter((index) => !audioBuffers[index] && !audioBufferPromises[index]);

    if (unloadedIndexes.length === 0) {
      return;
    }

    const nextIndex = unloadedIndexes[Math.floor(Math.random() * unloadedIndexes.length)];
    void loadTurnSoundBuffer(nextIndex);
  });
}

async function unlockCubeTurnSounds(): Promise<void> {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  if (isAudioUnlocked && context.state === "running") {
    return;
  }

  try {
    if (context.state === "suspended") {
      await context.resume();
    }

    const silentBuffer = context.createBuffer(1, 1, context.sampleRate);
    const source = context.createBufferSource();
    source.buffer = silentBuffer;
    source.connect(context.destination);
    source.start();
    isAudioUnlocked = context.state === "running";
    warmNextTurnSoundBuffer();
  } catch (error) {
    isAudioUnlocked = false;

    if (import.meta.env.DEV) {
      console.warn("Cube turn sounds could not be unlocked.", error);
    }
  }
}

function registerCubeTurnSoundUnlock(): void {
  if (isUnlockListenerRegistered || typeof window === "undefined") {
    return;
  }

  isUnlockListenerRegistered = true;
  const unlock = () => {
    void unlockCubeTurnSounds();
  };

  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true, passive: true });
  window.addEventListener("touchstart", unlock, { capture: true, passive: true });
}

function playTurnSoundBuffer(context: AudioContext, buffer: AudioBuffer): void {
  const source = context.createBufferSource();
  const gain = context.createGain();

  source.buffer = buffer;
  gain.gain.value = turnSoundVolume;
  source.connect(gain);
  gain.connect(context.destination);
  source.start();
}

async function playRandomCubeTurnSoundAsync(): Promise<void> {
  const context = getAudioContext();

  if (!context || turnSoundVolume <= 0) {
    return;
  }

  if (context.state !== "running") {
    await unlockCubeTurnSounds();

    const unlockedContext = getAudioContext();

    if (!unlockedContext || unlockedContext.state !== "running") {
      return;
    }
  }

  const sources = await loadTurnSoundSources();

  if (sources.length === 0) {
    return;
  }

  let soundIndex = getRandomSoundIndex(sources.length);

  for (let attempt = 0; attempt < sources.length; attempt += 1) {
    const buffer = await loadTurnSoundBuffer(soundIndex);

    if (buffer) {
      playTurnSoundBuffer(context, buffer);
      warmNextTurnSoundBuffer();
      return;
    }

    soundIndex = (soundIndex + 1) % sources.length;
  }
}

export function playRandomCubeTurnSound(): void {
  if (isRecordingModeUrl()) {
    return;
  }

  registerCubeTurnSoundUnlock();
  void playRandomCubeTurnSoundAsync();
}

if (!isRecordingModeUrl()) {
  registerCubeTurnSoundUnlock();
}
