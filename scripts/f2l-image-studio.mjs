import { createServer } from "node:http";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(ROOT_DIR, "src", "assets", "learn", "f2l");
const OUTPUT_DIR = path.join(ROOT_DIR, "src", "assets", "learn", "f2l-generated");
const THREE_BUILD_DIR = path.join(ROOT_DIR, "node_modules", "three", "build");
const PORT = Number(process.env.F2L_STUDIO_PORT ?? process.argv.find((arg) => arg.startsWith("--port="))?.split("=")[1] ?? 5187);
const HOST = "127.0.0.1";
const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

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

async function getGeneratedInfo(fileName) {
  const generatedPath = safeImagePath(OUTPUT_DIR, fileName);

  if (!generatedPath) {
    return null;
  }

  try {
    const fileStat = await stat(generatedPath);

    return {
      exists: true,
      size: fileStat.size,
      updatedAt: fileStat.mtime.toISOString(),
      url: `/generated/${encodeURIComponent(fileName)}?v=${Math.round(fileStat.mtimeMs)}`,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function listCases() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const sourceNames = await listPngNames(SOURCE_DIR);

  return Promise.all(
    sourceNames.map(async (fileName, index) => {
      const baseName = fileName.replace(/\.[^.]+$/, "");
      const algorithm = fileBaseNameToAlgorithm(baseName);
      const generated = await getGeneratedInfo(fileName);

      return {
        index,
        fileName,
        baseName,
        algorithm,
        moveCount: algorithm.split(/\s+/).filter(Boolean).length,
        sourceUrl: `/source/${encodeURIComponent(fileName)}`,
        generated,
      };
    }),
  );
}

async function readRequestBody(req, limitBytes = 32 * 1024 * 1024) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;

    if (total > limitBytes) {
      throw new Error("REQUEST_TOO_LARGE");
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function handleSave(req, res) {
  const bodyText = await readRequestBody(req);
  const body = JSON.parse(bodyText);
  const { fileName, dataUrl } = body;

  if (typeof fileName !== "string" || typeof dataUrl !== "string") {
    sendJson(res, 400, { ok: false, error: "fileName と dataUrl が必要です。" });
    return;
  }

  const sourceNames = new Set(await listPngNames(SOURCE_DIR));

  if (!sourceNames.has(fileName)) {
    sendJson(res, 400, { ok: false, error: "保存対象は既存F2Lケース名だけに制限しています。" });
    return;
  }

  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    sendJson(res, 400, { ok: false, error: "PNG data URL だけ保存できます。" });
    return;
  }

  const outputPath = safeImagePath(OUTPUT_DIR, fileName);

  if (!outputPath) {
    sendJson(res, 400, { ok: false, error: "ファイル名が不正です。" });
    return;
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  let previous = null;
  try {
    previous = await stat(outputPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const imageBuffer = Buffer.from(dataUrl.slice(PNG_DATA_URL_PREFIX.length), "base64");
  await writeFile(outputPath, imageBuffer);
  const generated = await getGeneratedInfo(fileName);

  sendJson(res, 200, {
    ok: true,
    overwritten: Boolean(previous),
    fileName,
    outputPath: path.relative(ROOT_DIR, outputPath).replaceAll(path.sep, "/"),
    generated,
  });
}

async function serveImage(res, baseDir, fileName) {
  const imagePath = safeImagePath(baseDir, fileName);

  if (!imagePath) {
    sendJson(res, 400, { ok: false, error: "ファイル名が不正です。" });
    return;
  }

  try {
    const image = await readFile(imagePath);
    send(res, 200, image, { "Content-Type": "image/png", "Cache-Control": "no-store" });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, { ok: false, error: "画像がありません。" });
      return;
    }

    throw error;
  }
}

async function serveThreeBuildFile(res, fileName) {
  if (!/^three(?:\.[a-z]+)*(?:\.min)?\.js$/.test(fileName)) {
    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }

  const modulePath = path.resolve(THREE_BUILD_DIR, fileName);
  const normalizedBase = path.resolve(THREE_BUILD_DIR) + path.sep;

  if (!modulePath.startsWith(normalizedBase)) {
    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }

  try {
    const code = await readFile(modulePath);
    send(res, 200, code, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 404, { ok: false, error: "Not found" });
      return;
    }

    throw error;
  }
}

function createHtml() {
  return String.raw`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>F2L Image Studio</title>
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
      --good: #31d98b;
      --warn: #ffd166;
      --danger: #ff6b6b;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      overflow: hidden;
      background:
        linear-gradient(rgba(22, 212, 255, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(22, 212, 255, 0.045) 1px, transparent 1px),
        var(--bg);
      background-size: 36px 36px, 36px 36px, auto;
      color: var(--text);
      font-family: "Segoe UI", system-ui, sans-serif;
      user-select: none;
    }

    button,
    input,
    select {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--panel-2);
      color: var(--text);
      font: inherit;
      font-weight: 800;
    }

    button {
      padding: 0 12px;
      cursor: pointer;
    }

    button:hover {
      border-color: color-mix(in srgb, var(--accent) 60%, var(--line));
    }

    button.primary {
      border-color: color-mix(in srgb, var(--accent) 76%, var(--line));
      background: var(--accent);
      color: #00111d;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    input,
    select {
      width: 100%;
      padding: 0 10px;
    }

    .app {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr) 310px;
      height: 100dvh;
      gap: 14px;
      padding: 14px;
    }

    .panel {
      min-width: 0;
      min-height: 0;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: color-mix(in srgb, var(--panel) 94%, transparent);
      box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
    }

    .sidebar,
    .preview {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      gap: 10px;
      padding: 12px;
    }

    .brand {
      display: grid;
      gap: 4px;
    }

    .eyebrow {
      margin: 0;
      color: var(--accent);
      font-size: 0.72rem;
      font-weight: 950;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    h1 {
      font-size: 1.28rem;
      line-height: 1.15;
    }

    h2 {
      font-size: 1.1rem;
    }

    .sub {
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 750;
      line-height: 1.45;
    }

    .filters {
      display: grid;
      gap: 8px;
    }

    .filter-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }

    .filter-row button[aria-pressed="true"] {
      border-color: var(--accent);
      color: var(--accent);
    }

    .case-list {
      display: grid;
      align-content: start;
      gap: 7px;
      overflow: auto;
      padding-right: 3px;
    }

    .case-button {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 8px;
      min-height: 62px;
      padding: 9px;
      text-align: left;
    }

    .case-button[aria-current="true"] {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 15%, var(--panel-2));
    }

    .case-button strong {
      overflow: hidden;
      font-size: 0.84rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .case-button small {
      grid-column: 1 / -1;
      overflow: hidden;
      color: var(--muted);
      font-size: 0.74rem;
      font-weight: 800;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status-dot {
      width: 10px;
      height: 10px;
      margin-top: 4px;
      border-radius: 999px;
      background: var(--muted);
    }

    .status-dot.done {
      background: var(--good);
    }

    .workspace {
      display: grid;
      grid-template-rows: auto auto auto auto;
      align-content: start;
      gap: 14px;
      overflow: auto;
      padding: 12px;
    }

    .case-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: start;
    }

    .case-title {
      min-width: 0;
      display: grid;
      gap: 5px;
    }

    .case-title code {
      overflow-wrap: anywhere;
      color: var(--text);
      font-size: 1.05rem;
      font-weight: 950;
      line-height: 1.35;
    }

    .viewer-shell {
      min-width: 0;
      width: min(100%, clamp(320px, calc(100dvh - 330px), 760px));
      max-width: 760px;
      aspect-ratio: 1 / 1;
      justify-self: center;
      display: grid;
      place-items: center;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #ffffff;
      overflow: hidden;
      touch-action: none;
    }

    #viewer {
      width: 100%;
      height: 100%;
      aspect-ratio: 1 / 1;
      display: block;
      cursor: grab;
    }

    #viewer.is-dragging {
      cursor: grabbing;
    }

    .toolbar {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 8px;
    }

    .control-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 8px;
      margin-top: 8px;
    }

    .field {
      display: grid;
      gap: 4px;
    }

    .field label {
      color: var(--muted);
      font-size: 0.68rem;
      font-weight: 950;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .field input[type="range"] {
      padding: 0;
    }

    .preview-card,
    .preview-grid {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: color-mix(in srgb, var(--panel-2) 72%, transparent);
    }

    .preview-card {
      display: grid;
      gap: 10px;
      padding: 10px;
    }

    .preview-images {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .image-box {
      display: grid;
      gap: 6px;
      min-width: 0;
    }

    .image-box span {
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 900;
    }

    .image-frame {
      display: grid;
      min-height: 120px;
      place-items: center;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #fff;
      color: #5d7184;
      font-size: 0.8rem;
      font-weight: 850;
      overflow: hidden;
    }

    .image-frame img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      image-rendering: auto;
    }

    .preview-grid {
      display: grid;
      align-content: start;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      overflow: auto;
      padding: 10px;
    }

    .thumb {
      display: grid;
      gap: 5px;
      min-width: 0;
      padding: 6px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: var(--panel);
      cursor: pointer;
    }

    .thumb[aria-current="true"] {
      border-color: var(--accent);
    }

    .thumb img {
      width: 100%;
      aspect-ratio: 1 / 1;
      border-radius: 6px;
      background: #fff;
      object-fit: contain;
    }

    .thumb span {
      overflow: hidden;
      color: var(--muted);
      font-size: 0.66rem;
      font-weight: 800;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .toast {
      min-height: 34px;
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 850;
    }

    .toast.ok { color: var(--good); }
    .toast.warn { color: var(--warn); }
    .toast.err { color: var(--danger); }

    @media (max-width: 1080px) {
      body { overflow: auto; }
      .app {
        grid-template-columns: minmax(0, 1fr);
        height: auto;
        min-height: 100dvh;
      }
      .control-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .viewer-shell {
        width: min(100%, 88vw, clamp(260px, calc(100dvh - 360px), 640px));
      }
      .sidebar,
      .preview {
        min-height: 360px;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="panel sidebar">
      <div class="brand">
        <p class="eyebrow">Local Only</p>
        <h1>F2L Image Studio</h1>
        <p class="sub">127.0.0.1専用。保存先は <strong>src/assets/learn/f2l-generated</strong> です。</p>
      </div>
      <div class="filters">
        <input id="search" type="search" placeholder="手順・ファイル名で検索" />
        <div class="filter-row" role="group" aria-label="filter">
          <button type="button" data-filter="all" aria-pressed="true">全部</button>
          <button type="button" data-filter="missing" aria-pressed="false">未作成</button>
          <button type="button" data-filter="done" aria-pressed="false">作成済み</button>
        </div>
      </div>
      <div id="caseList" class="case-list" aria-label="F2L cases"></div>
    </aside>

    <main class="panel workspace">
      <header class="case-head">
        <div class="case-title">
          <p class="eyebrow" id="caseMeta">F2L</p>
          <code id="algorithm">Loading...</code>
          <p class="sub" id="fileName">画像リストを読み込んでいます。</p>
        </div>
        <div class="toast" id="toast" role="status"></div>
      </header>

      <section class="viewer-shell" aria-label="capture viewer">
        <canvas id="viewer"></canvas>
      </section>

      <section class="control-grid" aria-label="camera controls">
        <div class="field">
          <label for="rotX">Rotate X</label>
          <input id="rotX" type="range" min="-180" max="180" value="21" />
        </div>
        <div class="field">
          <label for="rotY">Rotate Y</label>
          <input id="rotY" type="range" min="-180" max="180" value="31" />
        </div>
        <div class="field">
          <label for="rotZ">Rotate Z</label>
          <input id="rotZ" type="range" min="-45" max="45" value="-2" />
        </div>
        <div class="field">
          <label for="zoom">Zoom</label>
          <input id="zoom" type="range" min="2.8" max="13" step="0.1" value="10.2" />
        </div>
        <div class="field">
          <label for="panX">Position X</label>
          <input id="panX" type="range" min="-2.2" max="2.2" step="0.02" value="0" />
        </div>
        <div class="field">
          <label for="panY">Position Y</label>
          <input id="panY" type="range" min="-2.2" max="2.2" step="0.02" value="0.18" />
        </div>
        <div class="field">
          <label for="captureSize">PNG Size</label>
          <input id="captureSize" type="number" min="48" max="2048" step="1" value="512" />
        </div>
      </section>

      <section class="toolbar" aria-label="actions">
        <button type="button" class="primary" id="saveButton">PNG保存</button>
        <button type="button" id="saveNextButton">保存して次へ</button>
        <button type="button" id="previousButton">前へ</button>
        <button type="button" id="nextButton">次へ</button>
        <button type="button" id="resetViewButton">参考向き</button>
        <select id="colorMode" aria-label="color mode">
          <option value="top-muted" selected>最初の上段をグレー</option>
          <option value="u-gray">U面シールだけグレー</option>
          <option value="all">全部カラー</option>
        </select>
      </section>
    </main>

    <aside class="panel preview">
      <div>
        <p class="eyebrow">Preview</p>
        <h2>撮れた画像を確認</h2>
      </div>
      <article class="preview-card">
        <div class="preview-images">
          <div class="image-box">
            <span>既存</span>
            <div class="image-frame" id="sourcePreview">なし</div>
          </div>
          <div class="image-box">
            <span>生成済み</span>
            <div class="image-frame" id="generatedPreview">未作成</div>
          </div>
        </div>
        <p class="sub" id="generatedInfo">保存するとここに反映されます。同じ名前なら上書きします。</p>
      </article>
      <div id="previewGrid" class="preview-grid" aria-label="generated previews"></div>
    </aside>
  </div>

  <script type="module">
    import * as THREE from '/three.module.js';

    const FACE_COLORS = {
      U: 0x5f666d,
      D: 0xffffff,
      F: 0x1e63ff,
      B: 0x19a65a,
      R: 0xe5322d,
      L: 0xffa51f,
      gray: 0x555b62,
      body: 0x14181d,
    };
    const FACE_VECTORS = {
      U: [0, 1, 0],
      D: [0, -1, 0],
      F: [0, 0, 1],
      B: [0, 0, -1],
      R: [1, 0, 0],
      L: [-1, 0, 0],
    };
    const FACE_FROM_VECTOR = new Map(Object.entries(FACE_VECTORS).map(function(entry) {
      return [entry[1].join(','), entry[0]];
    }));
    const POSITIVE_AXIS_FACE = { x: 'R', y: 'U', z: 'F' };
    const STORAGE_KEY = 'cubeSplitTimer.f2lImageStudio.view.v2';
    const CASE_STORAGE_KEY = 'cubeSplitTimer.f2lImageStudio.case.v1';
    const DEFAULT_CAPTURE_SIZE = 512;
    const MIN_RECOMMENDED_CAPTURE_SIZE = 320;
    const REFERENCE_VIEW = {
      rotX: 21,
      rotY: 31,
      rotZ: -2,
      zoom: 10.2,
      panX: 0,
      panY: 0.18,
      colorMode: 'top-muted',
    };

    let cases = [];
    let selectedIndex = 0;
    let filter = 'all';
    let query = '';
    let renderer;
    let scene;
    let camera;
    let cubeGroup;
    let cubies = [];
    let dragState = null;
    let resizeObserver = null;

    const els = {
      viewer: document.getElementById('viewer'),
      caseList: document.getElementById('caseList'),
      previewGrid: document.getElementById('previewGrid'),
      sourcePreview: document.getElementById('sourcePreview'),
      generatedPreview: document.getElementById('generatedPreview'),
      generatedInfo: document.getElementById('generatedInfo'),
      algorithm: document.getElementById('algorithm'),
      fileName: document.getElementById('fileName'),
      caseMeta: document.getElementById('caseMeta'),
      toast: document.getElementById('toast'),
      search: document.getElementById('search'),
      saveButton: document.getElementById('saveButton'),
      saveNextButton: document.getElementById('saveNextButton'),
      previousButton: document.getElementById('previousButton'),
      nextButton: document.getElementById('nextButton'),
      resetViewButton: document.getElementById('resetViewButton'),
      rotX: document.getElementById('rotX'),
      rotY: document.getElementById('rotY'),
      rotZ: document.getElementById('rotZ'),
      zoom: document.getElementById('zoom'),
      panX: document.getElementById('panX'),
      panY: document.getElementById('panY'),
      captureSize: document.getElementById('captureSize'),
      colorMode: document.getElementById('colorMode'),
    };

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function roundCoord(value) {
      return clamp(Math.round(value), -1, 1);
    }

    function degreesToRadians(value) {
      return Number(value) * Math.PI / 180;
    }

    function radiansToDegrees(value) {
      return Math.round(value * 180 / Math.PI);
    }

    function setToast(message, type) {
      els.toast.textContent = message || '';
      els.toast.className = 'toast' + (type ? ' ' + type : '');
    }

    function normalizePrime(value) {
      return value.replace(new RegExp("[’‘" + String.fromCharCode(96) + "]", "g"), "'").replace(/p$/, "'");
    }

    function parseSuffix(rawSuffix) {
      if (!rawSuffix) {
        return { suffix: '', amount: 1, isPrime: false };
      }
      if (rawSuffix === "'") {
        return { suffix: "'", amount: 1, isPrime: true };
      }
      if (rawSuffix === '2' || rawSuffix === "2'") {
        return { suffix: '2', amount: 2, isPrime: false };
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

      const suffix = parseSuffix(match[2] || '');

      if (!suffix) {
        return null;
      }

      const base = wideMatch ? match[1] + 'w' : match[1];
      const family =
        base === 'x' || base === 'y' || base === 'z'
          ? 'rotation'
          : base === 'M' || base === 'E' || base === 'S'
            ? 'slice'
            : wideMatch || lowerWideMatch
              ? 'wide'
              : 'face';

      return {
        canonical: base + suffix.suffix,
        base,
        amount: suffix.amount,
        isPrime: suffix.isPrime,
        family,
      };
    }

    function parseAlgorithm(algorithm) {
      return algorithm
        .replace(/[()]/g, ' ')
        .replace(/[,\n\r\t]+/g, ' ')
        .split(/\s+/)
        .map(function(move) { return normalizePrime(move.trim()); })
        .filter(Boolean)
        .map(parseMoveToken)
        .filter(Boolean)
        .map(function(move) { return move.canonical; });
    }

    function getQuarterTurn(parsedMove, reverse) {
      const baseAngle = parsedMove.amount === 2 ? Math.PI : Math.PI / 2;
      const primeSign = parsedMove.isPrime ? -1 : 1;
      return baseAngle * primeSign * (reverse ? -1 : 1);
    }

    function getWideLayers(base) {
      const face = (base[0] || '').toUpperCase();
      if (face === 'R' || face === 'U' || face === 'F') return [0, 1];
      if (face === 'L' || face === 'D' || face === 'B') return [-1, 0];
      return [];
    }

    function getMoveDescriptor(move, reverse) {
      const parsedMove = parseMoveToken(move);
      if (!parsedMove) return null;

      const turn = getQuarterTurn(parsedMove, Boolean(reverse));
      const face = parsedMove.base[0] || '';
      const upperFace = face.toUpperCase();
      const wideLayers = parsedMove.family === 'wide' ? getWideLayers(parsedMove.base) : null;

      switch (upperFace) {
        case 'R': return { axis: 'x', layers: wideLayers || [1], angle: -turn, family: parsedMove.family };
        case 'L': return { axis: 'x', layers: wideLayers || [-1], angle: turn, family: parsedMove.family };
        case 'U': return { axis: 'y', layers: wideLayers || [1], angle: -turn, family: parsedMove.family };
        case 'D': return { axis: 'y', layers: wideLayers || [-1], angle: turn, family: parsedMove.family };
        case 'F': return { axis: 'z', layers: wideLayers || [1], angle: -turn, family: parsedMove.family };
        case 'B': return { axis: 'z', layers: wideLayers || [-1], angle: turn, family: parsedMove.family };
        case 'M': return { axis: 'x', layers: [0], angle: turn, family: 'slice' };
        case 'E': return { axis: 'y', layers: [0], angle: turn, family: 'slice' };
        case 'S': return { axis: 'z', layers: [0], angle: -turn, family: 'slice' };
        default:
          if (face === 'x') return { axis: 'x', layers: [-1, 0, 1], angle: -turn, family: 'rotation' };
          if (face === 'y') return { axis: 'y', layers: [-1, 0, 1], angle: -turn, family: 'rotation' };
          if (face === 'z') return { axis: 'z', layers: [-1, 0, 1], angle: -turn, family: 'rotation' };
          return null;
      }
    }

    function rotateVector(vector, axis, angle) {
      const cos = Math.round(Math.cos(angle));
      const sin = Math.round(Math.sin(angle));
      const x = vector[0];
      const y = vector[1];
      const z = vector[2];

      if (axis === 'x') return [x, roundCoord(y * cos - z * sin), roundCoord(y * sin + z * cos)];
      if (axis === 'y') return [roundCoord(x * cos + z * sin), y, roundCoord(-x * sin + z * cos)];
      return [roundCoord(x * cos - y * sin), roundCoord(x * sin + y * cos), z];
    }

    function rotateFace(face, axis, angle) {
      return FACE_FROM_VECTOR.get(rotateVector(FACE_VECTORS[face], axis, angle).join(','));
    }

    function updateOrientation(orientation, axis, angle) {
      const next = { ...orientation };
      Object.keys(next).forEach(function(face) {
        next[face] = rotateFace(next[face], axis, angle);
      });
      return next;
    }

    function getFixedAxisForWorldAxis(orientation, worldAxis) {
      const positiveWorldFace = POSITIVE_AXIS_FACE[worldAxis];
      const fixedFace = Object.keys(orientation).find(function(face) {
        return orientation[face] === positiveWorldFace;
      }) || positiveWorldFace;
      const fixedVector = FACE_VECTORS[fixedFace];

      if (fixedVector[0] !== 0) return { axis: 'x', sign: fixedVector[0] };
      if (fixedVector[1] !== 0) return { axis: 'y', sign: fixedVector[1] };
      return { axis: 'z', sign: fixedVector[2] };
    }

    function mapDescriptorToFixedView(descriptor, orientation) {
      const fixedAxis = getFixedAxisForWorldAxis(orientation, descriptor.axis);
      return {
        axis: fixedAxis.axis,
        layers: descriptor.layers.map(function(layer) { return layer * fixedAxis.sign; }).sort(function(a, b) { return a - b; }),
        angle: descriptor.angle * fixedAxis.sign,
        family: descriptor.family,
      };
    }

    function createViewpointMoveSteps(moves) {
      let orientation = { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' };

      return moves.map(function(move) {
        const descriptor = getMoveDescriptor(move);
        if (!descriptor) return { move, descriptor: null, isViewpointChange: false };

        if (descriptor.family === 'rotation') {
          orientation = updateOrientation(orientation, descriptor.axis, descriptor.angle);
          return { move, descriptor: null, isViewpointChange: true };
        }

        return {
          move,
          descriptor: mapDescriptorToFixedView(descriptor, orientation),
          isViewpointChange: false,
        };
      });
    }

    function createInverseViewpointDescriptors(moves) {
      return createViewpointMoveSteps(moves)
        .flatMap(function(step) { return step.descriptor ? [step.descriptor] : []; })
        .reverse()
        .map(function(descriptor) {
          return { ...descriptor, angle: -descriptor.angle };
        });
    }

    function getAxisVector(axis) {
      if (axis === 'x') return new THREE.Vector3(1, 0, 0);
      if (axis === 'y') return new THREE.Vector3(0, 1, 0);
      return new THREE.Vector3(0, 0, 1);
    }

    function getStickerColor(face, cubie) {
      const mode = els.colorMode.value;

      if (mode === 'all') {
        return FACE_COLORS[face];
      }

      if (mode === 'top-muted' && roundCoord(cubie.homeCoord.y) === 1) {
        return FACE_COLORS.gray;
      }

      if (mode === 'u-gray' && face === 'U') {
        return FACE_COLORS.gray;
      }

      return FACE_COLORS[face];
    }

    function createStickerMaterial(color) {
      return new THREE.MeshStandardMaterial({
        color,
        metalness: 0.02,
        roughness: 0.66,
      });
    }

    function addSticker(cubie, face) {
      const sticker = new THREE.Mesh(
        new THREE.PlaneGeometry(0.68, 0.68),
        createStickerMaterial(FACE_COLORS[face]),
      );
      const offset = 0.466;
      sticker.userData.face = face;

      if (face === 'U') {
        sticker.position.y = offset;
        sticker.rotation.x = -Math.PI / 2;
      } else if (face === 'D') {
        sticker.position.y = -offset;
        sticker.rotation.x = Math.PI / 2;
      } else if (face === 'F') {
        sticker.position.z = offset;
      } else if (face === 'B') {
        sticker.position.z = -offset;
        sticker.rotation.y = Math.PI;
      } else if (face === 'R') {
        sticker.position.x = offset;
        sticker.rotation.y = Math.PI / 2;
      } else {
        sticker.position.x = -offset;
        sticker.rotation.y = -Math.PI / 2;
      }

      cubie.group.add(sticker);
      cubie.stickers.push(sticker);
    }

    function createCubie(x, y, z) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.92, 0.92, 0.92),
        new THREE.MeshStandardMaterial({ color: FACE_COLORS.body, metalness: 0.01, roughness: 0.82 }),
      );
      const cubie = {
        group,
        homeCoord: new THREE.Vector3(x, y, z),
        coord: new THREE.Vector3(x, y, z),
        stickers: [],
      };

      group.position.set(x, y, z);
      group.add(body);

      if (y === 1) addSticker(cubie, 'U');
      if (y === -1) addSticker(cubie, 'D');
      if (z === 1) addSticker(cubie, 'F');
      if (z === -1) addSticker(cubie, 'B');
      if (x === 1) addSticker(cubie, 'R');
      if (x === -1) addSticker(cubie, 'L');

      return cubie;
    }

    function updateStickerMaterials() {
      cubies.forEach(function(cubie) {
        cubie.stickers.forEach(function(sticker) {
          sticker.material.color.setHex(getStickerColor(sticker.userData.face, cubie));
        });
      });
      render();
    }

    function clearCube() {
      if (!cubeGroup) return;
      while (cubeGroup.children.length) {
        cubeGroup.remove(cubeGroup.children[0]);
      }
      cubies = [];
    }

    function applyMoveTransform(descriptor, angle) {
      const selectedCubies = cubies.filter(function(cubie) {
        return descriptor.layers.includes(roundCoord(cubie.coord[descriptor.axis]));
      });
      const pivot = new THREE.Group();
      cubeGroup.add(pivot);
      cubeGroup.updateMatrixWorld(true);
      selectedCubies.forEach(function(cubie) { pivot.attach(cubie.group); });
      pivot.rotation[descriptor.axis] = angle;
      pivot.updateMatrixWorld(true);

      const matrix = new THREE.Matrix4().makeRotationAxis(getAxisVector(descriptor.axis), angle);
      selectedCubies.forEach(function(cubie) {
        cubie.coord.applyMatrix4(matrix);
        cubie.coord.set(roundCoord(cubie.coord.x), roundCoord(cubie.coord.y), roundCoord(cubie.coord.z));
        cubeGroup.attach(cubie.group);
        cubie.group.position.copy(cubie.coord);
      });

      cubeGroup.remove(pivot);
    }

    function buildCubeForCase(caseItem) {
      clearCube();

      for (let x = -1; x <= 1; x += 1) {
        for (let y = -1; y <= 1; y += 1) {
          for (let z = -1; z <= 1; z += 1) {
            if (x === 0 && y === 0 && z === 0) continue;
            const cubie = createCubie(x, y, z);
            cubies.push(cubie);
            cubeGroup.add(cubie.group);
          }
        }
      }

      const moves = parseAlgorithm(caseItem.algorithm);
      createInverseViewpointDescriptors(moves).forEach(function(descriptor) {
        applyMoveTransform(descriptor, descriptor.angle);
      });
      updateStickerMaterials();
    }

    function initThree() {
      renderer = new THREE.WebGLRenderer({
        canvas: els.viewer,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setClearColor(0xffffff, 1);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
      cubeGroup = new THREE.Group();
      scene.add(cubeGroup);

      const ambient = new THREE.AmbientLight(0xffffff, 2.15);
      const key = new THREE.DirectionalLight(0xffffff, 2.6);
      key.position.set(4, 5, 7);
      const fill = new THREE.DirectionalLight(0xffffff, 1.2);
      fill.position.set(-5, 2, 4);
      scene.add(ambient, key, fill);

      resizeObserver = new ResizeObserver(resizeRenderer);
      resizeObserver.observe(els.viewer.parentElement);
      loadViewSettings();
      syncViewToInputs();
      render();
    }

    function resizeRenderer() {
      const rect = els.viewer.getBoundingClientRect();
      const size = Math.max(100, Math.floor(Math.min(rect.width, rect.height)));
      renderer.setSize(size, size, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      render();
    }

    function getViewSettings() {
      return {
        x: degreesToRadians(els.rotX.value),
        y: degreesToRadians(els.rotY.value),
        z: degreesToRadians(els.rotZ.value),
        zoom: Number(els.zoom.value),
        panX: Number(els.panX.value),
        panY: Number(els.panY.value),
      };
    }

    function loadViewSettings() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!saved) return;
        if (Number.isFinite(saved.rotX)) els.rotX.value = String(saved.rotX);
        if (Number.isFinite(saved.rotY)) els.rotY.value = String(saved.rotY);
        if (Number.isFinite(saved.rotZ)) els.rotZ.value = String(saved.rotZ);
        if (Number.isFinite(saved.zoom)) els.zoom.value = String(saved.zoom);
        if (Number.isFinite(saved.panX)) els.panX.value = String(saved.panX);
        if (Number.isFinite(saved.panY)) els.panY.value = String(saved.panY);
        if (Number.isFinite(saved.size)) {
          const savedSize = clamp(saved.size, 48, 2048);
          els.captureSize.value = String(
            savedSize < MIN_RECOMMENDED_CAPTURE_SIZE ? DEFAULT_CAPTURE_SIZE : savedSize,
          );
        }
        if (saved.colorMode) els.colorMode.value = saved.colorMode;
      } catch {}
    }

    function saveViewSettings() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        rotX: Number(els.rotX.value),
        rotY: Number(els.rotY.value),
        rotZ: Number(els.rotZ.value),
        zoom: Number(els.zoom.value),
        panX: Number(els.panX.value),
        panY: Number(els.panY.value),
        size: Number(els.captureSize.value),
        colorMode: els.colorMode.value,
      }));
    }

    function applyReferenceView() {
      els.rotX.value = String(REFERENCE_VIEW.rotX);
      els.rotY.value = String(REFERENCE_VIEW.rotY);
      els.rotZ.value = String(REFERENCE_VIEW.rotZ);
      els.zoom.value = String(REFERENCE_VIEW.zoom);
      els.panX.value = String(REFERENCE_VIEW.panX);
      els.panY.value = String(REFERENCE_VIEW.panY);
      els.colorMode.value = REFERENCE_VIEW.colorMode;
      syncViewToInputs();
      updateStickerMaterials();
    }

    function syncViewToInputs() {
      if (!cubeGroup || !camera) return;
      const settings = getViewSettings();
      cubeGroup.rotation.set(settings.x, settings.y, settings.z);
      cubeGroup.position.set(settings.panX, settings.panY, 0);
      camera.position.set(0, 0, settings.zoom);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      saveViewSettings();
      render();
    }

    function render() {
      if (!renderer || !scene || !camera) return;
      renderer.render(scene, camera);
    }

    function getCurrentCase() {
      return cases[selectedIndex] || null;
    }

    function getRequestedCaseFileName() {
      return new URLSearchParams(window.location.search).get('case') || localStorage.getItem(CASE_STORAGE_KEY) || '';
    }

    async function loadCases(keepFileName) {
      const response = await fetch('/api/cases');
      const payload = await response.json();
      cases = payload.cases || [];
      const targetFileName = keepFileName || getRequestedCaseFileName();

      if (targetFileName) {
        const nextIndex = cases.findIndex(function(item) { return item.fileName === targetFileName; });
        selectedIndex = nextIndex >= 0 ? nextIndex : selectedIndex;
      }

      selectedIndex = clamp(selectedIndex, 0, Math.max(0, cases.length - 1));
      renderAll();
    }

    function getFilteredCases() {
      const normalizedQuery = query.trim().toLowerCase();
      return cases.filter(function(caseItem) {
        const matchesFilter =
          filter === 'all' ||
          (filter === 'missing' && !caseItem.generated) ||
          (filter === 'done' && caseItem.generated);
        const matchesQuery =
          !normalizedQuery ||
          caseItem.fileName.toLowerCase().includes(normalizedQuery) ||
          caseItem.algorithm.toLowerCase().includes(normalizedQuery);

        return matchesFilter && matchesQuery;
      });
    }

    function renderCaseList() {
      const filteredCases = getFilteredCases();
      els.caseList.replaceChildren();

      filteredCases.forEach(function(caseItem) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'case-button';
        button.setAttribute('aria-current', String(cases[selectedIndex]?.fileName === caseItem.fileName));
        button.innerHTML =
          '<strong>' + escapeHtml(caseItem.algorithm) + '</strong>' +
          '<span class="status-dot ' + (caseItem.generated ? 'done' : '') + '"></span>' +
          '<small>' + escapeHtml(caseItem.fileName) + '</small>';
        button.addEventListener('click', function() {
          selectedIndex = cases.findIndex(function(item) { return item.fileName === caseItem.fileName; });
          renderAll();
        });
        els.caseList.appendChild(button);
      });
    }

    function renderPreviewGrid() {
      els.previewGrid.replaceChildren();
      cases.filter(function(caseItem) { return caseItem.generated; }).forEach(function(caseItem) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'thumb';
        button.setAttribute('aria-current', String(cases[selectedIndex]?.fileName === caseItem.fileName));
        button.innerHTML =
          '<img alt="" src="' + caseItem.generated.url + '" />' +
          '<span>' + escapeHtml(caseItem.baseName) + '</span>';
        button.addEventListener('click', function() {
          selectedIndex = cases.findIndex(function(item) { return item.fileName === caseItem.fileName; });
          renderAll();
        });
        els.previewGrid.appendChild(button);
      });
    }

    function setImageFrame(frame, html) {
      frame.replaceChildren();
      if (typeof html === 'string') {
        frame.textContent = html;
      } else {
        frame.appendChild(html);
      }
    }

    function renderCurrentCase() {
      const caseItem = getCurrentCase();
      if (!caseItem) {
        els.algorithm.textContent = 'F2Lケースがありません。';
        els.fileName.textContent = '';
        return;
      }

      localStorage.setItem(CASE_STORAGE_KEY, caseItem.fileName);
      els.caseMeta.textContent = 'F2L ' + (caseItem.index + 1) + ' / ' + cases.length + ' ・ ' + caseItem.moveCount + ' moves';
      els.algorithm.textContent = caseItem.algorithm;
      els.fileName.textContent = caseItem.fileName;

      const sourceImg = document.createElement('img');
      sourceImg.src = caseItem.sourceUrl;
      sourceImg.alt = '';
      setImageFrame(els.sourcePreview, sourceImg);

      if (caseItem.generated) {
        const generatedImg = document.createElement('img');
        generatedImg.src = caseItem.generated.url;
        generatedImg.alt = '';
        setImageFrame(els.generatedPreview, generatedImg);
        els.generatedInfo.textContent = '更新: ' + new Date(caseItem.generated.updatedAt).toLocaleString() + ' / ' + caseItem.generated.size + ' bytes';
      } else {
        setImageFrame(els.generatedPreview, '未作成');
        els.generatedInfo.textContent = 'PNG保存で同名ファイルを生成します。保存済みなら上書きします。';
      }

      buildCubeForCase(caseItem);
    }

    function renderAll() {
      renderCaseList();
      renderPreviewGrid();
      renderCurrentCase();
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function capturePngDataUrl() {
      const size = clamp(Number(els.captureSize.value) || DEFAULT_CAPTURE_SIZE, 48, 2048);
      const oldPixelRatio = renderer.getPixelRatio();
      const oldSize = renderer.getSize(new THREE.Vector2());

      renderer.setPixelRatio(1);
      renderer.setSize(size, size, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      render();
      const dataUrl = renderer.domElement.toDataURL('image/png');

      renderer.setPixelRatio(oldPixelRatio);
      renderer.setSize(oldSize.x, oldSize.y, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
      render();

      return dataUrl;
    }

    async function saveCurrent(goNext) {
      const caseItem = getCurrentCase();
      if (!caseItem) return;

      setToast('保存中...', 'warn');
      els.saveButton.disabled = true;
      els.saveNextButton.disabled = true;

      try {
        const dataUrl = capturePngDataUrl();
        const response = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: caseItem.fileName, dataUrl }),
        });
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || '保存に失敗しました。');
        }

        setToast((payload.overwritten ? '上書き保存しました: ' : '保存しました: ') + payload.outputPath, 'ok');
        await loadCases(caseItem.fileName);

        if (goNext && selectedIndex < cases.length - 1) {
          selectedIndex += 1;
          renderAll();
        }
      } catch (error) {
        setToast(error.message || '保存に失敗しました。', 'err');
      } finally {
        els.saveButton.disabled = false;
        els.saveNextButton.disabled = false;
      }
    }

    function moveSelection(delta) {
      if (!cases.length) return;
      selectedIndex = clamp(selectedIndex + delta, 0, cases.length - 1);
      renderAll();
    }

    function resetView() {
      applyReferenceView();
      setToast('既存画像に近い参考向きにしました。', 'ok');
    }

    function initEvents() {
      els.search.addEventListener('input', function(event) {
        query = event.target.value;
        renderCaseList();
      });
      document.querySelectorAll('[data-filter]').forEach(function(button) {
        button.addEventListener('click', function() {
          filter = button.dataset.filter;
          document.querySelectorAll('[data-filter]').forEach(function(item) {
            item.setAttribute('aria-pressed', String(item === button));
          });
          renderCaseList();
        });
      });
      [els.rotX, els.rotY, els.rotZ, els.zoom, els.panX, els.panY].forEach(function(input) {
        input.addEventListener('input', syncViewToInputs);
      });
      els.captureSize.addEventListener('change', saveViewSettings);
      els.colorMode.addEventListener('change', function() {
        updateStickerMaterials();
        saveViewSettings();
      });
      els.saveButton.addEventListener('click', function() { saveCurrent(false); });
      els.saveNextButton.addEventListener('click', function() { saveCurrent(true); });
      els.previousButton.addEventListener('click', function() { moveSelection(-1); });
      els.nextButton.addEventListener('click', function() { moveSelection(1); });
      els.resetViewButton.addEventListener('click', resetView);

      els.viewer.addEventListener('pointerdown', function(event) {
        els.viewer.setPointerCapture(event.pointerId);
        els.viewer.classList.add('is-dragging');
        dragState = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          rotX: degreesToRadians(els.rotX.value),
          rotY: degreesToRadians(els.rotY.value),
        };
      });
      els.viewer.addEventListener('pointermove', function(event) {
        if (!dragState || event.pointerId !== dragState.pointerId) return;
        const dx = event.clientX - dragState.startX;
        const dy = event.clientY - dragState.startY;
        els.rotY.value = String(clamp(radiansToDegrees(dragState.rotY + dx * 0.008), -180, 180));
        els.rotX.value = String(clamp(radiansToDegrees(dragState.rotX + dy * 0.008), -180, 180));
        syncViewToInputs();
      });
      function endDrag(event) {
        if (!dragState || event.pointerId !== dragState.pointerId) return;
        dragState = null;
        els.viewer.classList.remove('is-dragging');
      }
      els.viewer.addEventListener('pointerup', endDrag);
      els.viewer.addEventListener('pointercancel', endDrag);
      els.viewer.addEventListener('wheel', function(event) {
        event.preventDefault();
        const nextZoom = clamp(Number(els.zoom.value) + Math.sign(event.deltaY) * 0.25, 2.8, 13);
        els.zoom.value = String(nextZoom.toFixed(1));
        syncViewToInputs();
      }, { passive: false });
      window.addEventListener('keydown', function(event) {
        if (event.key === 'ArrowRight') moveSelection(1);
        if (event.key === 'ArrowLeft') moveSelection(-1);
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          saveCurrent(false);
        }
      });
    }

    async function boot() {
      initThree();
      initEvents();
      await loadCases();
      setToast('読み込み完了。ドラッグで視点、Ctrl+Sで保存できます。', 'ok');
    }

    boot().catch(function(error) {
      console.error(error);
      setToast(error.message || '起動に失敗しました。', 'err');
    });
  </script>
</body>
</html>`;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

    if (req.method === "GET" && url.pathname === "/") {
      sendHtml(res, createHtml());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/cases") {
      sendJson(res, 200, {
        ok: true,
        sourceDir: path.relative(ROOT_DIR, SOURCE_DIR).replaceAll(path.sep, "/"),
        outputDir: path.relative(ROOT_DIR, OUTPUT_DIR).replaceAll(path.sep, "/"),
        cases: await listCases(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/save") {
      await handleSave(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/favicon.ico") {
      send(res, 204, "", { "Content-Type": "image/x-icon" });
      return;
    }

    if (req.method === "GET" && /^\/three(?:\.[a-z]+)*(?:\.min)?\.js$/.test(url.pathname)) {
      await serveThreeBuildFile(res, url.pathname.slice(1));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/source/")) {
      await serveImage(res, SOURCE_DIR, decodePathName(url.pathname.slice("/source/".length)));
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/generated/")) {
      await serveImage(res, OUTPUT_DIR, decodePathName(url.pathname.slice("/generated/".length)));
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    if (error.message === "REQUEST_TOO_LARGE") {
      sendJson(res, 413, { ok: false, error: "リクエストが大きすぎます。" });
      return;
    }

    console.error(error);
    sendJson(res, 500, { ok: false, error: error.message || "Server error" });
  }
});

await mkdir(OUTPUT_DIR, { recursive: true });

server.listen(PORT, HOST, () => {
  console.log(`F2L Image Studio`);
  console.log(`URL: http://${HOST}:${PORT}/`);
  console.log(`Source: ${path.relative(ROOT_DIR, SOURCE_DIR).replaceAll(path.sep, "/")}`);
  console.log(`Output: ${path.relative(ROOT_DIR, OUTPUT_DIR).replaceAll(path.sep, "/")}`);
});
