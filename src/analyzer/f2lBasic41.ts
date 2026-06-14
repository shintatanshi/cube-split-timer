import { parseAlgorithm } from "../learn/moveNotation";
import type { F2lTargetSlot } from "../types";

export type F2lCaseType = "basic41" | "advanced" | "backSlot" | "insertVariation";
export type F2lDifficulty = "basic";

export interface BasicF2lCase {
  id: string;
  name: string;
  type: F2lCaseType;
  alg: string;
  targetSlot: F2lTargetSlot;
  difficulty: F2lDifficulty;
  tags: string[];
  description: string;
}

function basicCase(id: string, alg: string, name: string, tags: string[] = []): BasicF2lCase {
  return {
    id,
    name,
    type: "basic41",
    alg,
    targetSlot: "auto",
    difficulty: "basic",
    tags: ["基本41", ...tags],
    description: "U面上の対象コーナーと対象エッジを基本F2Lとしてペア化し、対象スロットへ入れるケースです。",
  };
}

export const BASIC_F2L_41_CASES: BasicF2lCase[] = [
  basicCase("F2L_01", "R U R'", "基本挿入 右"),
  basicCase("F2L_02", "F' U' F", "基本挿入 前"),
  basicCase("F2L_03", "U R U' R'", "U調整から右挿入"),
  basicCase("F2L_04", "U' F' U F", "U調整から前挿入"),
  basicCase("F2L_05", "U' R U R'", "分離ペア 右"),
  basicCase("F2L_06", "U F' U' F", "分離ペア 前"),
  basicCase("F2L_07", "R U' R' U R U R'", "向き合わせ 右"),
  basicCase("F2L_08", "F' U F U' F' U' F", "向き合わせ 前"),
  basicCase("F2L_09", "R U2 R' U' R U R'", "U2調整 右"),
  basicCase("F2L_10", "F' U2 F U F' U' F", "U2調整 前"),
  basicCase("F2L_11", "U R U2 R' U R U' R'", "長め分離 右"),
  basicCase("F2L_12", "U' F' U2 F U' F' U F", "長め分離 前"),
  basicCase("F2L_13", "R U R' U' R U R'", "ペア作成 右"),
  basicCase("F2L_14", "F' U' F U F' U' F", "ペア作成 前"),
  basicCase("F2L_15", "R U' R' U2 R U R'", "反対向き 右"),
  basicCase("F2L_16", "F' U F U2 F' U' F", "反対向き 前"),
  basicCase("F2L_17", "U2 R U R' U R U' R'", "U2先読み 右"),
  basicCase("F2L_18", "U2 F' U' F U' F' U F", "U2先読み 前"),
  basicCase("F2L_19", "R U R' U2 R U' R'", "エッジ向き替え 右"),
  basicCase("F2L_20", "F' U' F U2 F' U F", "エッジ向き替え 前"),
  basicCase("F2L_21", "U R U' R' U' R U R'", "スプリット 右"),
  basicCase("F2L_22", "U' F' U F U F' U' F", "スプリット 前"),
  basicCase("F2L_23", "R U2 R' U R U' R'", "コーナー先行 右"),
  basicCase("F2L_24", "F' U2 F U' F' U F", "コーナー先行 前"),
  basicCase("F2L_25", "R U' R' U' R U R'", "エッジ先行 右"),
  basicCase("F2L_26", "F' U F U F' U' F", "エッジ先行 前"),
  basicCase("F2L_27", "U R U R' U' R U' R'", "ペア反転 右"),
  basicCase("F2L_28", "U' F' U' F U F' U F", "ペア反転 前"),
  basicCase("F2L_29", "R U R' U R U' R'", "短縮 右"),
  basicCase("F2L_30", "F' U' F U' F' U F", "短縮 前"),
  basicCase("F2L_31", "U2 R U' R' U' R U R'", "離れペア 右"),
  basicCase("F2L_32", "U2 F' U F U F' U' F", "離れペア 前"),
  basicCase("F2L_33", "R U' R' U R U2 R'", "U2戻し 右"),
  basicCase("F2L_34", "F' U F U' F' U2 F", "U2戻し 前"),
  basicCase("F2L_35", "R U R' U' R U2 R'", "埋まり回避 右"),
  basicCase("F2L_36", "F' U' F U F' U2 F", "埋まり回避 前"),
  basicCase("F2L_37", "R U2 R' U2 R U R'", "遠いU面 右"),
  basicCase("F2L_38", "F' U2 F U2 F' U' F", "遠いU面 前"),
  basicCase("F2L_39", "U R U2 R' U2 R U R'", "長距離調整 右"),
  basicCase("F2L_40", "U' F' U2 F U2 F' U' F", "長距離調整 前"),
  basicCase("F2L_41", "R U' R' U R U' R' U R U R'", "基本41 fallback", ["fallback"]),
];

export function countF2lMoves(algorithm: string): number {
  return parseAlgorithm(algorithm).moves.length;
}

export function getBasicF2lCaseByAlgorithm(algorithm: string): BasicF2lCase | null {
  const normalized = parseAlgorithm(algorithm).moves.join(" ");

  return (
    BASIC_F2L_41_CASES.find((caseItem) => parseAlgorithm(caseItem.alg).moves.join(" ") === normalized) ??
    null
  );
}
