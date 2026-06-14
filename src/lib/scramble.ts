const FACES = ["U", "D", "R", "L", "F", "B"] as const;
const SUFFIXES = ["", "'", "2"] as const;

type Face = (typeof FACES)[number];

const AXIS_BY_FACE: Record<Face, "ud" | "rl" | "fb"> = {
  U: "ud",
  D: "ud",
  R: "rl",
  L: "rl",
  F: "fb",
  B: "fb",
};

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function generateScramble(length = 20): string {
  const moves: string[] = [];
  let previousAxis: "ud" | "rl" | "fb" | null = null;

  while (moves.length < length) {
    const face = randomItem(FACES);
    const axis = AXIS_BY_FACE[face];

    if (axis === previousAxis) {
      continue;
    }

    previousAxis = axis;
    moves.push(`${face}${randomItem(SUFFIXES)}`);
  }

  return moves.join(" ");
}
