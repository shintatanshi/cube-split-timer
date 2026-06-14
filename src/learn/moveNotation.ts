export type MoveAxis = "x" | "y" | "z";
export type MoveFamily = "face" | "rotation" | "slice" | "wide";

export interface MoveDescriptor {
  axis: MoveAxis;
  layers: number[];
  angle: number;
  family: MoveFamily;
}

export interface ParsedMove {
  raw: string;
  canonical: string;
  base: string;
  suffix: "" | "'" | "2";
  amount: 1 | 2;
  isPrime: boolean;
  family: MoveFamily;
  supported: true;
}

export interface ParsedAlgorithm {
  tokens: string[];
  moves: string[];
  parsedMoves: ParsedMove[];
  invalidTokens: string[];
}

const FACE_NAMES: Record<string, string> = {
  U: "上面",
  D: "下面",
  R: "右面",
  L: "左面",
  F: "正面",
  B: "背面",
};

const SLICE_NAMES: Record<string, string> = {
  M: "Mスライス",
  E: "Eスライス",
  S: "Sスライス",
};

const ROTATION_NAMES: Record<string, string> = {
  x: "x持ち替え",
  y: "y持ち替え",
  z: "z持ち替え",
};

function normalizePrime(value: string): string {
  return value.replace(/[’‘`]/g, "'").replace(/p$/, "'");
}

export function tokenizeAlgorithm(algorithm: string): string[] {
  return algorithm
    .replace(/[()]/g, " ")
    .replace(/[,\n\r\t]+/g, " ")
    .split(/\s+/)
    .map((move) => normalizePrime(move.trim()))
    .filter(Boolean);
}

function parseSuffix(rawSuffix: string): { suffix: "" | "'" | "2"; amount: 1 | 2; isPrime: boolean } | null {
  if (!rawSuffix) {
    return { suffix: "", amount: 1, isPrime: false };
  }

  if (rawSuffix === "'") {
    return { suffix: "'", amount: 1, isPrime: true };
  }

  if (rawSuffix === "2" || rawSuffix === "2'") {
    return { suffix: "2", amount: 2, isPrime: false };
  }

  return null;
}

export function parseMoveToken(token: string): ParsedMove | null {
  const normalizedToken = normalizePrime(token);
  const wideMatch = normalizedToken.match(/^([URFDLB])w(2'?|'?)$/);

  if (wideMatch) {
    const suffix = parseSuffix(wideMatch[2] ?? "");

    if (!suffix) {
      return null;
    }

    return {
      raw: token,
      canonical: `${wideMatch[1]}w${suffix.suffix}`,
      base: `${wideMatch[1]}w`,
      family: "wide",
      supported: true,
      ...suffix,
    };
  }

  const lowerWideMatch = normalizedToken.match(/^([urfdlb])(2'?|'?)$/);

  if (lowerWideMatch) {
    const suffix = parseSuffix(lowerWideMatch[2] ?? "");

    if (!suffix) {
      return null;
    }

    return {
      raw: token,
      canonical: `${lowerWideMatch[1]}${suffix.suffix}`,
      base: lowerWideMatch[1],
      family: "wide",
      supported: true,
      ...suffix,
    };
  }

  const simpleMatch = normalizedToken.match(/^([URFDLBMESxyz])(2'?|'?)$/);

  if (!simpleMatch) {
    return null;
  }

  const suffix = parseSuffix(simpleMatch[2] ?? "");

  if (!suffix) {
    return null;
  }

  const base = simpleMatch[1];
  const family: MoveFamily =
    base === "x" || base === "y" || base === "z"
      ? "rotation"
      : base === "M" || base === "E" || base === "S"
        ? "slice"
        : "face";

  return {
    raw: token,
    canonical: `${base}${suffix.suffix}`,
    base,
    family,
    supported: true,
    ...suffix,
  };
}

export function parseAlgorithm(algorithm: string): ParsedAlgorithm {
  const tokens = tokenizeAlgorithm(algorithm);
  const parsedMoves: ParsedMove[] = [];
  const invalidTokens: string[] = [];

  tokens.forEach((token) => {
    const parsedMove = parseMoveToken(token);

    if (parsedMove) {
      parsedMoves.push(parsedMove);
      return;
    }

    invalidTokens.push(token);
  });

  return {
    tokens,
    moves: parsedMoves.map((move) => move.canonical),
    parsedMoves,
    invalidTokens,
  };
}

export function invertMove(move: string): string {
  const parsedMove = parseMoveToken(move);

  if (!parsedMove) {
    return move;
  }

  if (parsedMove.amount === 2) {
    return `${parsedMove.base}2`;
  }

  return parsedMove.isPrime ? parsedMove.base : `${parsedMove.base}'`;
}

export function invertAlgorithm(moves: string[]): string[] {
  return moves.slice().reverse().map(invertMove);
}

function getQuarterTurn(parsedMove: ParsedMove, reverse: boolean): number {
  const baseAngle = parsedMove.amount === 2 ? Math.PI : Math.PI / 2;
  const primeSign = parsedMove.isPrime ? -1 : 1;

  return baseAngle * primeSign * (reverse ? -1 : 1);
}

function getWideLayers(base: string): number[] {
  const face = base[0]?.toUpperCase();

  switch (face) {
    case "R":
    case "U":
    case "F":
      return [0, 1];
    case "L":
    case "D":
    case "B":
      return [-1, 0];
    default:
      return [];
  }
}

export function getMoveDescriptor(move: string, reverse = false): MoveDescriptor | null {
  const parsedMove = parseMoveToken(move);

  if (!parsedMove) {
    return null;
  }

  const turn = getQuarterTurn(parsedMove, reverse);
  const face = parsedMove.base[0] ?? "";
  const upperFace = face.toUpperCase();
  const wideLayers = parsedMove.family === "wide" ? getWideLayers(parsedMove.base) : null;

  switch (upperFace) {
    case "R":
      return { axis: "x", layers: wideLayers ?? [1], angle: -turn, family: parsedMove.family };
    case "L":
      return { axis: "x", layers: wideLayers ?? [-1], angle: turn, family: parsedMove.family };
    case "U":
      return { axis: "y", layers: wideLayers ?? [1], angle: -turn, family: parsedMove.family };
    case "D":
      return { axis: "y", layers: wideLayers ?? [-1], angle: turn, family: parsedMove.family };
    case "F":
      return { axis: "z", layers: wideLayers ?? [1], angle: -turn, family: parsedMove.family };
    case "B":
      return { axis: "z", layers: wideLayers ?? [-1], angle: turn, family: parsedMove.family };
    case "M":
      return { axis: "x", layers: [0], angle: turn, family: "slice" };
    case "E":
      return { axis: "y", layers: [0], angle: turn, family: "slice" };
    case "S":
      return { axis: "z", layers: [0], angle: -turn, family: "slice" };
    default:
      if (face === "x") {
        return { axis: "x", layers: [-1, 0, 1], angle: -turn, family: "rotation" };
      }

      if (face === "y") {
        return { axis: "y", layers: [-1, 0, 1], angle: -turn, family: "rotation" };
      }

      if (face === "z") {
        return { axis: "z", layers: [-1, 0, 1], angle: -turn, family: "rotation" };
      }

      return null;
  }
}

export function getMoveDescription(move: string): string {
  const parsedMove = parseMoveToken(move);

  if (!parsedMove) {
    return `${move} は未対応の記号です。`;
  }

  const base = parsedMove.base;
  const upperBase = base[0]?.toUpperCase() ?? base;
  const subject =
    parsedMove.family === "rotation"
      ? ROTATION_NAMES[base]
      : parsedMove.family === "slice"
        ? SLICE_NAMES[upperBase]
        : parsedMove.family === "wide"
          ? `${upperBase}の2層回し`
          : FACE_NAMES[upperBase];

  if (parsedMove.amount === 2) {
    return `${subject}を180度回す`;
  }

  if (parsedMove.family === "rotation") {
    const reference = base === "x" ? "R" : base === "y" ? "U" : "F";
    return `${subject}を${reference}${parsedMove.isPrime ? "'" : ""}の方向に動かす`;
  }

  return `${subject}を、その面を正面から見て${parsedMove.isPrime ? "反時計回り" : "時計回り"}に90度回す`;
}

export const SUPPORTED_MOVE_SUMMARY = [
  "U, D, R, L, F, B と各 prime / 2",
  "x, y, z と各 prime / 2",
  "M, E, S と各 prime / 2",
  "Rw, Lw, Uw, Dw, Fw, Bw と各 prime / 2",
  "r, l, u, d, f, b と各 prime / 2",
];
