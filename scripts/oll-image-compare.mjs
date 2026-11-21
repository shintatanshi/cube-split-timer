import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(ROOT_DIR, "src", "assets", "learn", "oll");
const PORT = Number(
  process.env.OLL_COMPARE_PORT ??
    process.argv.find((arg) => arg.startsWith("--port="))?.split("=")[1] ??
    5188,
);
const HOST = "127.0.0.1";

const FACE_VECTORS = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

const FACE_STICKER_COORDS = {
  U: [
    [-1, 1, -1],
    [0, 1, -1],
    [1, 1, -1],
    [-1, 1, 0],
    [0, 1, 0],
    [1, 1, 0],
    [-1, 1, 1],
    [0, 1, 1],
    [1, 1, 1],
  ],
  D: [
    [-1, -1, 1],
    [0, -1, 1],
    [1, -1, 1],
    [-1, -1, 0],
    [0, -1, 0],
    [1, -1, 0],
    [-1, -1, -1],
    [0, -1, -1],
    [1, -1, -1],
  ],
  F: [
    [-1, 1, 1],
    [0, 1, 1],
    [1, 1, 1],
    [-1, 0, 1],
    [0, 0, 1],
    [1, 0, 1],
    [-1, -1, 1],
    [0, -1, 1],
    [1, -1, 1],
  ],
  B: [
    [1, 1, -1],
    [0, 1, -1],
    [-1, 1, -1],
    [1, 0, -1],
    [0, 0, -1],
    [-1, 0, -1],
    [1, -1, -1],
    [0, -1, -1],
    [-1, -1, -1],
  ],
  R: [
    [1, 1, 1],
    [1, 1, 0],
    [1, 1, -1],
    [1, 0, 1],
    [1, 0, 0],
    [1, 0, -1],
    [1, -1, 1],
    [1, -1, 0],
    [1, -1, -1],
  ],
  L: [
    [-1, 1, -1],
    [-1, 1, 0],
    [-1, 1, 1],
    [-1, 0, -1],
    [-1, 0, 0],
    [-1, 0, 1],
    [-1, -1, -1],
    [-1, -1, 0],
    [-1, -1, 1],
  ],
};

const FACE_STICKER_INDEX_BY_COORD = new Map(
  Object.entries(FACE_STICKER_COORDS).flatMap(([face, coords]) =>
    coords.map((coord, index) => [`${face}:${vectorKey(coord)}`, index]),
  ),
);

const VECTOR_FACES = new Map(
  Object.entries(FACE_VECTORS).map(([face, vector]) => [vectorKey(vector), face]),
);

const FACE_COLOR_MAP = {
  U: "yellow",
  D: "white",
  F: "blue",
  B: "green",
  R: "red",
  L: "orange",
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(payload);
}

function sendJson(res, status, body) {
  send(res, status, body, { "Content-Type": "application/json; charset=utf-8" });
}

function sendHtml(res, body) {
  send(res, 200, body, { "Content-Type": "text/html; charset=utf-8" });
}

function decodePathName(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isSafePngName(fileName) {
  return /^[A-Za-z0-9_()'-]+\.png$/.test(fileName);
}

function safeImagePath(baseDir, fileName) {
  if (!isSafePngName(fileName)) {
    return null;
  }

  const resolved = path.resolve(baseDir, fileName);
  const normalizedBase = path.resolve(baseDir) + path.sep;

  return resolved.startsWith(normalizedBase) ? resolved : null;
}

function fileTokenToMove(token) {
  const primeWideBeforeW = token.match(/^([URFDLB])p(w)$/);

  if (primeWideBeforeW) {
    return `${primeWideBeforeW[1]}w'`;
  }

  if (token.endsWith("p2")) {
    return `${token.slice(0, -2)}2`;
  }

  if (token.endsWith("2p")) {
    return token.slice(0, -1);
  }

  if (token.endsWith("p")) {
    return `${token.slice(0, -1)}'`;
  }

  return token;
}

function fileBaseNameToAlgorithm(baseName) {
  return baseName
    .split("_")
    .map((token) => token.trim())
    .filter(Boolean)
    .map(fileTokenToMove)
    .join(" ");
}

function normalizePrime(value) {
  return value.replace(/[’‘`]/g, "'").replace(/p$/, "'");
}

function parseSuffix(rawSuffix) {
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

function parseMoveToken(token) {
  const normalizedToken = normalizePrime(token);
  const wideMatch = normalizedToken.match(/^([URFDLB])w(2'?|'?)$/);
  const lowerWideMatch = normalizedToken.match(/^([urfdlb])(2'?|'?)$/);
  const simpleMatch = normalizedToken.match(/^([URFDLBMESxyz])(2'?|'?)$/);
  const match = wideMatch || lowerWideMatch || simpleMatch;

  if (!match) {
    return null;
  }

  const suffix = parseSuffix(match[2] || "");

  if (!suffix) {
    return null;
  }

  const base = wideMatch ? `${match[1]}w` : match[1];
  const family =
    base === "x" || base === "y" || base === "z"
      ? "rotation"
      : base === "M" || base === "E" || base === "S"
        ? "slice"
        : wideMatch || lowerWideMatch
          ? "wide"
          : "face";

  return {
    raw: token,
    canonical: `${base}${suffix.suffix}`,
    base,
    family,
    ...suffix,
  };
}

function parseAlgorithm(algorithm) {
  const parsedMoves = [];
  const invalidTokens = [];

  algorithm
    .replace(/[()]/g, " ")
    .replace(/[,\n\r\t]+/g, " ")
    .split(/\s+/)
    .map((move) => normalizePrime(move.trim()))
    .filter(Boolean)
    .forEach((token) => {
      const move = parseMoveToken(token);

      if (move) {
        parsedMoves.push(move);
      } else {
        invalidTokens.push(token);
      }
    });

  return {
    moves: parsedMoves.map((move) => move.canonical),
    parsedMoves,
    invalidTokens,
  };
}

function invertMove(move) {
  const parsedMove = parseMoveToken(move);

  if (!parsedMove) {
    return move;
  }

  if (parsedMove.amount === 2) {
    return `${parsedMove.base}2`;
  }

  return parsedMove.isPrime ? parsedMove.base : `${parsedMove.base}'`;
}

function invertAlgorithm(moves) {
  return moves.slice().reverse().map(invertMove);
}

function getQuarterTurn(parsedMove, reverse) {
  const baseAngle = parsedMove.amount === 2 ? Math.PI : Math.PI / 2;
  const primeSign = parsedMove.isPrime ? -1 : 1;
  return baseAngle * primeSign * (reverse ? -1 : 1);
}

function getWideLayers(base) {
  const face = (base[0] || "").toUpperCase();

  if (face === "R" || face === "U" || face === "F") {
    return [0, 1];
  }

  if (face === "L" || face === "D" || face === "B") {
    return [-1, 0];
  }

  return [];
}

function getMoveDescriptor(move, reverse = false) {
  const parsedMove = parseMoveToken(move);

  if (!parsedMove) {
    return null;
  }

  const turn = getQuarterTurn(parsedMove, reverse);
  const face = parsedMove.base[0] || "";
  const upperFace = face.toUpperCase();
  const wideLayers = parsedMove.family === "wide" ? getWideLayers(parsedMove.base) : null;

  switch (upperFace) {
    case "R":
      return { axis: "x", layers: wideLayers ?? [1], angle: -turn };
    case "L":
      return { axis: "x", layers: wideLayers ?? [-1], angle: turn };
    case "U":
      return { axis: "y", layers: wideLayers ?? [1], angle: -turn };
    case "D":
      return { axis: "y", layers: wideLayers ?? [-1], angle: turn };
    case "F":
      return { axis: "z", layers: wideLayers ?? [1], angle: -turn };
    case "B":
      return { axis: "z", layers: wideLayers ?? [-1], angle: turn };
    case "M":
      return { axis: "x", layers: [0], angle: turn };
    case "E":
      return { axis: "y", layers: [0], angle: turn };
    case "S":
      return { axis: "z", layers: [0], angle: -turn };
    default:
      if (face === "x") {
        return { axis: "x", layers: [-1, 0, 1], angle: -turn };
      }

      if (face === "y") {
        return { axis: "y", layers: [-1, 0, 1], angle: -turn };
      }

      if (face === "z") {
        return { axis: "z", layers: [-1, 0, 1], angle: -turn };
      }

      return null;
  }
}

function vectorKey(vector) {
  return vector.join(",");
}

function roundCoord(value) {
  return Math.max(-1, Math.min(1, Math.round(value)));
}

function rotateVector(vector, axis, angle) {
  const cos = Math.round(Math.cos(angle));
  const sin = Math.round(Math.sin(angle));
  const [x, y, z] = vector;

  if (axis === "x") {
    return [x, roundCoord(y * cos - z * sin), roundCoord(y * sin + z * cos)];
  }

  if (axis === "y") {
    return [roundCoord(x * cos + z * sin), y, roundCoord(-x * sin + z * cos)];
  }

  return [roundCoord(x * cos - y * sin), roundCoord(x * sin + y * cos), z];
}

function getAxisCoord(vector, axis) {
  if (axis === "x") {
    return vector[0];
  }

  if (axis === "y") {
    return vector[1];
  }

  return vector[2];
}

function getFaceFromVector(vector) {
  const face = VECTOR_FACES.get(vectorKey(vector));

  if (!face) {
    throw new Error(`Invalid face vector: ${vectorKey(vector)}`);
  }

  return face;
}

function createPiece(coord) {
  const stickers = [];

  Object.entries(FACE_VECTORS).forEach(([face, vector]) => {
    const dot = coord[0] * vector[0] + coord[1] * vector[1] + coord[2] * vector[2];

    if (dot > 0) {
      stickers.push({ color: FACE_COLOR_MAP[face], face });
    }
  });

  return {
    coord: [...coord],
    stickers,
  };
}

function createSolvedCubeState() {
  const pieces = [];

  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        if (x === 0 && y === 0 && z === 0) {
          continue;
        }

        const nonZeroCount = [x, y, z].filter((value) => value !== 0).length;

        if (nonZeroCount >= 2) {
          pieces.push(createPiece([x, y, z]));
        }
      }
    }
  }

  return { pieces };
}

function applyMoveToMutableState(state, move) {
  const descriptor = getMoveDescriptor(move);

  if (!descriptor) {
    return;
  }

  state.pieces.forEach((piece) => {
    const layerCoord = getAxisCoord(piece.coord, descriptor.axis);

    if (!descriptor.layers.includes(layerCoord)) {
      return;
    }

    piece.coord = rotateVector(piece.coord, descriptor.axis, descriptor.angle);
    piece.stickers = piece.stickers.map((sticker) => ({
      color: sticker.color,
      face: getFaceFromVector(rotateVector(FACE_VECTORS[sticker.face], descriptor.axis, descriptor.angle)),
    }));
  });
}

function applyAlgorithm(state, moves) {
  const nextState = {
    pieces: state.pieces.map((piece) => ({
      coord: [...piece.coord],
      stickers: piece.stickers.map((sticker) => ({ ...sticker })),
    })),
  };

  moves.forEach((move) => applyMoveToMutableState(nextState, move));

  return nextState;
}

function cubeStateToStickerColorGrid(state) {
  const grid = {
    U: Array(9).fill(FACE_COLOR_MAP.U),
    D: Array(9).fill(FACE_COLOR_MAP.D),
    F: Array(9).fill(FACE_COLOR_MAP.F),
    B: Array(9).fill(FACE_COLOR_MAP.B),
    R: Array(9).fill(FACE_COLOR_MAP.R),
    L: Array(9).fill(FACE_COLOR_MAP.L),
  };

  state.pieces.forEach((piece) => {
    piece.stickers.forEach((sticker) => {
      const index = FACE_STICKER_INDEX_BY_COORD.get(`${sticker.face}:${vectorKey(piece.coord)}`);

      if (index !== undefined) {
        grid[sticker.face][index] = sticker.color;
      }
    });
  });

  return grid;
}

function toMask(values) {
  return values.map((value) => (value === "yellow" ? 1 : 0));
}

function createOllMask(algorithm) {
  const parsed = parseAlgorithm(algorithm);
  const inverseMoves = invertAlgorithm(parsed.moves);
  const state = applyAlgorithm(createSolvedCubeState(), inverseMoves);
  const grid = cubeStateToStickerColorGrid(state);

  return {
    top: toMask(grid.U),
    side: {
      back: toMask([grid.B[2], grid.B[1], grid.B[0]]),
      right: toMask([grid.R[2], grid.R[1], grid.R[0]]),
      front: toMask([grid.F[0], grid.F[1], grid.F[2]]),
      left: toMask([grid.L[0], grid.L[1], grid.L[2]]),
    },
    invalidTokens: parsed.invalidTokens,
  };
}

async function listPngNames(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function listCases() {
  const sourceNames = await listPngNames(SOURCE_DIR);

  return sourceNames.map((fileName, index) => {
    const baseName = fileName.replace(/\.[^.]+$/, "");
    const algorithm = fileBaseNameToAlgorithm(baseName);
    const mask = createOllMask(algorithm);

    return {
      index,
      fileName,
      baseName,
      algorithm,
      moveCount: algorithm.split(/\s+/).filter(Boolean).length,
      sourceUrl: `/source/${encodeURIComponent(fileName)}`,
      mask,
    };
  });
}

function renderHtml() {
  return String.raw`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OLL Mask Compare</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #08111f;
      --panel: #0f1d30;
      --panel-2: #14243b;
      --line: #245072;
      --text: #f7fbff;
      --muted: #89a8c2;
      --accent: #16d4ff;
      --yellow: #fff200;
      --off: #555b62;
      --body: #10161d;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100dvh;
      background:
        linear-gradient(rgba(22, 212, 255, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(22, 212, 255, 0.045) 1px, transparent 1px),
        var(--bg);
      background-size: 36px 36px, 36px 36px, auto;
      color: var(--text);
      font-family: "Segoe UI", system-ui, sans-serif;
    }

    header {
      position: sticky;
      top: 0;
      z-index: 5;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(220px, 340px);
      gap: 16px;
      align-items: end;
      padding: 18px 20px;
      border-bottom: 1px solid var(--line);
      background: color-mix(in srgb, var(--bg) 92%, transparent);
      backdrop-filter: blur(14px);
    }

    h1, h2, p { margin: 0; }

    .eyebrow {
      color: var(--accent);
      font-size: 0.72rem;
      font-weight: 950;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    h1 {
      margin-top: 4px;
      font-size: clamp(1.8rem, 4vw, 3.3rem);
      line-height: 1;
    }

    .lead {
      margin-top: 8px;
      color: var(--muted);
      font-weight: 750;
      line-height: 1.55;
    }

    .tools {
      display: grid;
      gap: 8px;
    }

    input {
      width: 100%;
      min-height: 44px;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--panel-2);
      color: var(--text);
      font: inherit;
      font-weight: 800;
    }

    .summary {
      color: var(--muted);
      font-size: 0.86rem;
      font-weight: 800;
    }

    main {
      padding: 18px 20px 40px;
    }

    .case-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 14px;
    }

    .case-card {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: color-mix(in srgb, var(--panel) 94%, transparent);
      overflow: hidden;
    }

    .case-head {
      display: grid;
      gap: 5px;
      padding: 12px;
      border-bottom: 1px solid color-mix(in srgb, var(--line) 65%, transparent);
    }

    .case-title {
      overflow-wrap: anywhere;
      font-size: 1rem;
      font-weight: 950;
      line-height: 1.35;
    }

    .case-file {
      overflow: hidden;
      color: var(--muted);
      font-size: 0.74rem;
      font-weight: 850;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .compare-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
    }

    .compare-box {
      display: grid;
      gap: 7px;
      min-width: 0;
    }

    .compare-box span {
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 950;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .image-frame,
    .generated-frame {
      display: grid;
      min-height: 188px;
      place-items: center;
      border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line));
      border-radius: 0;
      background: #fff;
      overflow: hidden;
    }

    .generated-frame {
      background: #fff;
    }

    .image-frame img {
      max-width: 100%;
      max-height: 188px;
      object-fit: contain;
    }

    .generated-frame svg {
      width: min(100%, 188px);
      height: auto;
      display: block;
    }

    .mask-row {
      display: grid;
      gap: 6px;
      padding: 0 12px 12px;
    }

    code {
      display: block;
      overflow: auto;
      padding: 8px;
      border: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
      border-radius: 9px;
      background: #07101c;
      color: #bce8ff;
      font-size: 0.72rem;
      line-height: 1.4;
      white-space: pre-wrap;
    }

    .warning {
      color: #ffd166;
    }

    .is-hidden {
      display: none;
    }

    @media (max-width: 760px) {
      header {
        grid-template-columns: minmax(0, 1fr);
      }

      .case-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <p class="eyebrow">Local Only</p>
      <h1>OLL Mask Compare</h1>
      <p class="lead">元画像と、手順の逆状態から作った 0/1 SVG を並べて比較します。黄色なら1、黄色以外なら0です。</p>
    </div>
    <div class="tools">
      <input id="search" type="search" placeholder="手順・ファイル名で検索" />
      <p class="summary" id="summary">読み込み中...</p>
    </div>
  </header>

  <main>
    <section class="case-grid" id="caseGrid" aria-label="OLL compare list"></section>
  </main>

  <script>
    const grid = document.getElementById('caseGrid');
    const search = document.getElementById('search');
    const summary = document.getElementById('summary');
    let cases = [];

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function sticker(value, x, y, w, h) {
      const fill = value ? 'var(--yellow)' : 'var(--off)';
      return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '" stroke="#000000" stroke-width="2" shape-rendering="crispEdges" />';
    }

    function renderOllSvg(mask) {
      const cell = 20;
      const gap = 0;
      const side = 10;
      const start = 34;
      const svgSize = 128;
      let html = '<svg viewBox="0 0 ' + svgSize + ' ' + svgSize + '" role="img" aria-label="generated OLL mask">';
      html += '<rect x="0" y="0" width="' + svgSize + '" height="' + svgSize + '" fill="#ffffff" />';
      html += '<g transform="translate(0 0)">';

      mask.side.back.forEach((value, index) => {
        html += sticker(value, start + index * (cell + gap), start - side - gap, cell, side);
      });

      mask.side.front.forEach((value, index) => {
        html += sticker(value, start + index * (cell + gap), start + 3 * (cell + gap), cell, side);
      });

      mask.side.left.forEach((value, index) => {
        html += sticker(value, start - side - gap, start + index * (cell + gap), side, cell);
      });

      mask.side.right.forEach((value, index) => {
        html += sticker(value, start + 3 * (cell + gap), start + index * (cell + gap), side, cell);
      });

      mask.top.forEach((value, index) => {
        const row = Math.floor(index / 3);
        const col = index % 3;
        html += sticker(value, start + col * (cell + gap), start + row * (cell + gap), cell, cell);
      });

      html += '</g></svg>';
      return html;
    }

    function maskText(mask) {
      return [
        'top:  ' + mask.top.join(''),
        'back: ' + mask.side.back.join(''),
        'right:' + mask.side.right.join(''),
        'front:' + mask.side.front.join(''),
        'left: ' + mask.side.left.join(''),
      ].join('\n');
    }

    function renderCases() {
      const q = search.value.trim().toLowerCase();
      const filtered = cases.filter((item) => {
        return !q || item.fileName.toLowerCase().includes(q) || item.algorithm.toLowerCase().includes(q);
      });

      summary.textContent = filtered.length + ' / ' + cases.length + ' cases';
      grid.replaceChildren();

      filtered.forEach((caseItem) => {
        const article = document.createElement('article');
        article.className = 'case-card';
        const invalid = caseItem.mask.invalidTokens.length
          ? '<p class="case-file warning">invalid: ' + escapeHtml(caseItem.mask.invalidTokens.join(' ')) + '</p>'
          : '';

        article.innerHTML =
          '<div class="case-head">' +
            '<p class="eyebrow">OLL ' + String(caseItem.index + 1).padStart(2, '0') + ' / ' + caseItem.moveCount + ' moves</p>' +
            '<h2 class="case-title">' + escapeHtml(caseItem.algorithm) + '</h2>' +
            '<p class="case-file">' + escapeHtml(caseItem.fileName) + '</p>' +
            invalid +
          '</div>' +
          '<div class="compare-row">' +
            '<div class="compare-box"><span>Original</span><div class="image-frame"><img alt="" src="' + caseItem.sourceUrl + '" /></div></div>' +
            '<div class="compare-box"><span>Generated 0/1 SVG</span><div class="generated-frame">' + renderOllSvg(caseItem.mask) + '</div></div>' +
          '</div>' +
          '<div class="mask-row"><code>' + escapeHtml(maskText(caseItem.mask)) + '</code></div>';

        grid.appendChild(article);
      });
    }

    async function boot() {
      const response = await fetch('/api/cases');
      const payload = await response.json();
      cases = payload.cases || [];
      renderCases();
    }

    search.addEventListener('input', renderCases);
    boot().catch((error) => {
      console.error(error);
      summary.textContent = error.message || '読み込みに失敗しました。';
    });
  </script>
</body>
</html>`;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

    if (req.method === "GET" && url.pathname === "/") {
      sendHtml(res, renderHtml());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/cases") {
      sendJson(res, 200, { cases: await listCases() });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/source/")) {
      const fileName = decodePathName(url.pathname.replace(/^\/source\//, ""));
      const sourcePath = safeImagePath(SOURCE_DIR, fileName);

      if (!sourcePath) {
        sendJson(res, 400, { error: "Invalid file name." });
        return;
      }

      send(res, 200, await readFile(sourcePath), { "Content-Type": "image/png" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/favicon.ico") {
      send(res, 204, "", { "Content-Type": "image/x-icon" });
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "Internal server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log("OLL Mask Compare");
  console.log(`URL: http://${HOST}:${PORT}/`);
  console.log("Source: src/assets/learn/oll");
});
