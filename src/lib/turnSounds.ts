const turnSoundModules = import.meta.glob("../../sounds/*.{mp3,wav,ogg,m4a}", {
  eager: true,
  import: "default",
  query: "?url",
});

const TURN_SOUND_SOURCES = Object.values(turnSoundModules).filter(
  (source): source is string => typeof source === "string",
);
const TURN_SOUND_VOLUME = 0.34;

let audioPool: HTMLAudioElement[] | null = null;
let lastSoundIndex = -1;

function getAudioPool(): HTMLAudioElement[] {
  if (typeof Audio === "undefined" || TURN_SOUND_SOURCES.length === 0) {
    return [];
  }

  if (!audioPool) {
    audioPool = TURN_SOUND_SOURCES.map((source) => {
      const audio = new Audio(source);
      audio.preload = "auto";
      audio.volume = TURN_SOUND_VOLUME;

      return audio;
    });
  }

  return audioPool;
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

export function playRandomCubeTurnSound(): void {
  const pool = getAudioPool();

  if (pool.length === 0) {
    return;
  }

  const sourceAudio = pool[getRandomSoundIndex(pool.length)];
  const audio = sourceAudio.cloneNode(true) as HTMLAudioElement;

  audio.volume = TURN_SOUND_VOLUME;
  void audio.play().catch(() => {
    // Browsers may block audio before a user gesture; animation should still continue.
  });
}
