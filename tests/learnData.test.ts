// Learn data audit (Claude, 2026-11-22): every F2L/OLL/PLL case must be a valid
// algorithm for its category, and the analyzer must recognize every OLL/PLL case.
import { expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30000 });
import { LEARNING_CASES } from "../src/learn/learningData";
import { invertAlgorithm, parseAlgorithm } from "../src/learn/moveNotation";
import { applyAlgorithm, createSolvedCubeState } from "../src/analyzer/cubeState";
import { recognizeOll, recognizePll } from "../src/analyzer/lastLayerRecognition";
import { createGeneratedOllPreview } from "../src/learn/ollGeneratedPreview";
import {
  applyMoves,
  createSolvedState,
  isSolvedCross,
  isSolvedSlot,
  parseMoves,
  toFaceTurns,
  SLOTS_LIST,
} from "../src/analyzer/solver";

const MAP = { U: "yellow", D: "white", F: "blue", B: "green", R: "red", L: "orange" } as const;

it("every Learn case is valid and recognized by the analyzer", () => {
  const report: Record<string, unknown>[] = [];
  const oll = LEARNING_CASES.filter((c) => c.category === "oll");
  const pll = LEARNING_CASES.filter((c) => c.category === "pll");
  const counts = { f2l: 0, oll: oll.length, pll: pll.length };
  const seenAlg = new Map<string, string>();

  for (const c of LEARNING_CASES) {
    if (c.category === "f2l") counts.f2l += 1;
    const entry: Record<string, unknown> = { id: c.id, cat: c.category, alg: c.algorithm, problems: [] as string[] };
    const problems = entry.problems as string[];
    const dupKey = `${c.category}|${c.algorithm}`;
    if (seenAlg.has(dupKey)) problems.push(`duplicate alg of ${seenAlg.get(dupKey)}`);
    seenAlg.set(dupKey, c.id);

    const legacy = parseAlgorithm(c.algorithm);
    if (legacy.invalidTokens.length) problems.push(`legacy parser invalid: ${legacy.invalidTokens.join(",")}`);
    // The shown algorithm must use standard notation, not file-name spelling such as "(Up)".
    if (/[URFDLBMESxyzw]p\)?(\s|$)/.test(c.algorithm)) problems.push(`file-name notation shown: ${c.algorithm}`);

    let state;
    try {
      const ft = toFaceTurns(parseMoves(c.algorithm));
      state = applyMoves(createSolvedState(), ft.faceTurns);
      entry.finalOrientationChanged = JSON.stringify(ft.orientation) !== JSON.stringify({ U: "U", R: "R", F: "F", D: "D", L: "L", B: "B" });
    } catch (e) {
      problems.push(`solver parser: ${(e as Error).message}`);
    }

    if (state) {
      const cross = isSolvedCross(state);
      const slots = SLOTS_LIST.filter((s) => isSolvedSlot(state, s));
      entry.cross = cross;
      entry.slots = slots;
      if (c.category === "oll" || c.category === "pll") {
        if (!cross || slots.length !== 4) problems.push(`breaks F2L (cross=${cross}, slots=${slots.join("")})`);
        const llCo = state.co.slice(0, 4).some((v) => v !== 0);
        const llEo = state.eo.slice(0, 4).some((v) => v !== 0);
        if (c.category === "oll" && !llCo && !llEo) problems.push("does not change LL orientation (not an OLL)");
        if (c.category === "pll" && (llCo || llEo)) problems.push("changes LL orientation (not a PLL)");
      }
      if (c.category === "f2l") {
        const cfg = c.highlightConfig as { targetSlot?: string };
        const broken = SLOTS_LIST.filter((s) => !slots.includes(s as never));
        entry.target = cfg?.targetSlot;
        entry.broken = broken;
        if (!cross) problems.push("breaks cross");
        if (broken.length !== 1) problems.push(`breaks ${broken.length} slots (${broken.join(",")})`);
        if (cfg?.targetSlot && cfg.targetSlot !== "auto" && broken[0] !== cfg.targetSlot) problems.push(`targetSlot ${cfg.targetSlot} but alg works on ${broken.join(",")}`);
      }
    }

    // OLL thumbnails must show the real case: compare with a preview built from
    // fixed-center face turns (regression 2026-11-22: two rotation algs were wrong).
    if (c.category === "oll" && state) {
      const shown = createGeneratedOllPreview(c.algorithm);
      const fixed = createGeneratedOllPreview(toFaceTurns(parseMoves(c.algorithm)).faceTurns.join(" "));
      const yellowTop = shown.top.filter((s) => s === "primary").length;
      const llOrientedStickers =
        state.co.slice(0, 4).filter((v) => v === 0).length + state.eo.slice(0, 4).filter((v) => v === 0).length + 1;
      if (shown.top.join() !== fixed.top.join() || shown.side.join() !== fixed.side.join()) problems.push("thumbnail differs from the fixed-center case");
      if (yellowTop !== llOrientedStickers) problems.push(`thumbnail shows ${yellowTop} yellow on top, case has ${llOrientedStickers}`);
    }

    // Analyzer recognition of the Learn case itself.
    if (c.category === "oll" || c.category === "pll") {
      const inv = invertAlgorithm(toFaceTurns(legacy.moves).faceTurns);
      const start = applyAlgorithm(createSolvedCubeState({ ...MAP }), inv);
      const r =
        c.category === "oll"
          ? recognizeOll(start, "white", "D", oll)
          : recognizePll(start, "D", pll);
      entry.recognized = r.ok ? r.recognition.caseItem?.id ?? "(skip)" : `NO: ${r.reason}`;
      if (!r.ok) problems.push(`analyzer cannot recognize: ${r.reason}`);
      else if (r.recognition.caseItem?.id !== c.id) problems.push(`analyzer recognizes as ${r.recognition.caseItem?.id}`);
    }
    report.push(entry);
  }

  expect(counts).toEqual({ f2l: 41, oll: 57, pll: 21 });
  const problems = report.filter((entry) => (entry.problems as string[]).length > 0);
  expect(problems).toEqual([]);
});
