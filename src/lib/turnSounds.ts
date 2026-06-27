const turnSoundModules = import.meta.glob("../../sounds/*.{mp3,wav,ogg,m4a}", {
  eager: true,
  import: "default",
  query: "?url",
});

const TURN_SOUND_SOURCES = Object.values(turnSoundModules).filter(
  (source): source is string => typeof source === "string",
);
const TURN_SOUND_VOLUME = 0.34;

type AudioContextConstructor = new () => AudioContext;

let audioContext: AudioContext | null = null;
let audioBuffers: AudioBuffer[] = [];
let audioBuffersPromise: Promise<AudioBuffer[]> | null = null;
let isUnlockListenerRegistered = false;
let isAudioUnlocked = false;
let lastSoundIndex = -1;

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

function loadTurnSoundBuffers(): Promise<AudioBuffer[]> {
  if (audioBuffers.length > 0) {
    return Promise.resolve(audioBuffers);
  }

  if (audioBuffersPromise) {
    return audioBuffersPromise;
  }

  const context = getAudioContext();

  if (!context || TURN_SOUND_SOURCES.length === 0) {
    return Promise.resolve([]);
  }

  audioBuffersPromise = Promise.all(
    TURN_SOUND_SOURCES.map(async (source) => {
      const response = await fetch(source);
      const data = await response.arrayBuffer();

      return context.decodeAudioData(data);
    }),
  )
    .then((buffers) => {
      audioBuffers = buffers;
      return buffers;
    })
    .catch((error: unknown) => {
      audioBuffersPromise = null;

      if (import.meta.env.DEV) {
        console.warn("Cube turn sounds could not be loaded.", error);
      }

      return [];
    });

  return audioBuffersPromise;
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
    void loadTurnSoundBuffers();
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

export function playRandomCubeTurnSound(): void {
  registerCubeTurnSoundUnlock();
  void loadTurnSoundBuffers();

  const context = getAudioContext();

  if (!context || audioBuffers.length === 0) {
    return;
  }

  if (context.state !== "running") {
    void unlockCubeTurnSounds();
    return;
  }

  const buffer = audioBuffers[getRandomSoundIndex(audioBuffers.length)];
  const source = context.createBufferSource();
  const gain = context.createGain();

  source.buffer = buffer;
  gain.gain.value = TURN_SOUND_VOLUME;
  source.connect(gain);
  gain.connect(context.destination);
  source.start();
}

registerCubeTurnSoundUnlock();
void loadTurnSoundBuffers();
