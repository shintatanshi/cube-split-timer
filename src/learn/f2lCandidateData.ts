import type {
  F2lCandidate,
  F2lCandidateDifficulty,
  F2lCaseType,
  F2lTargetSlot,
} from "../types";
import { invertAlgorithm, parseAlgorithm } from "./moveNotation";

type F2lCandidateSeed = Omit<F2lCandidate, "inverseAlg" | "moveCount" | "status"> & {
  status?: F2lCandidate["status"];
};

export interface F2lCandidateValidationResult {
  ok: boolean;
  normalizedAlg: string;
  moveCount: number;
  inverseAlg: string;
  errors: string[];
}

export interface F2lCandidateDuplicate {
  duplicateKey: string;
  candidates: F2lCandidate[];
}

const REVIEW_SOURCE = {
  name: "Manual review seed",
  url: "local:cube-split-timer/f2l-candidates",
};

function createCandidate(seed: F2lCandidateSeed): F2lCandidate {
  const normalizedAlg = normalizeF2lCandidateAlg(seed.alg);

  return {
    ...seed,
    alg: normalizedAlg,
    inverseAlg: invertF2lCandidateAlg(normalizedAlg),
    moveCount: countF2lCandidateMoves(normalizedAlg),
    status: seed.status ?? "candidate",
  };
}

export function normalizeF2lCandidateAlg(alg: string): string {
  return parseAlgorithm(alg).moves.join(" ");
}

export function countF2lCandidateMoves(alg: string): number {
  return parseAlgorithm(alg).moves.length;
}

export function invertF2lCandidateAlg(alg: string): string {
  return invertAlgorithm(parseAlgorithm(alg).moves).join(" ");
}

export function getF2lCandidateDuplicateKey(candidate: F2lCandidate): string {
  return [
    candidate.caseType,
    candidate.targetSlot,
    normalizeF2lCandidateAlg(candidate.alg),
  ].join("|");
}

export function validateF2lCandidate(candidate: F2lCandidate): F2lCandidateValidationResult {
  const parsed = parseAlgorithm(candidate.alg);
  const normalizedAlg = parsed.moves.join(" ");
  const inverseAlg = invertAlgorithm(parsed.moves).join(" ");
  const errors: string[] = [];

  if (parsed.invalidTokens.length > 0) {
    errors.push(`未対応の記号があります: ${parsed.invalidTokens.join(", ")}`);
  }

  if (!normalizedAlg) {
    errors.push("アルゴリズムが空です。");
  }

  if (candidate.moveCount !== parsed.moves.length) {
    errors.push(`moveCountが一致しません: ${candidate.moveCount} / 実際 ${parsed.moves.length}`);
  }

  if (candidate.inverseAlg && candidate.inverseAlg !== inverseAlg) {
    errors.push("inverseAlgが現在のalgから計算した逆手順と一致しません。");
  }

  return {
    ok: errors.length === 0,
    normalizedAlg,
    moveCount: parsed.moves.length,
    inverseAlg,
    errors,
  };
}

export function findDuplicateF2lCandidates(
  candidates: F2lCandidate[] = F2L_CANDIDATES,
): F2lCandidateDuplicate[] {
  const groups = candidates.reduce<Map<string, F2lCandidate[]>>((map, candidate) => {
    const key = getF2lCandidateDuplicateKey(candidate);
    const group = map.get(key) ?? [];
    group.push(candidate);
    map.set(key, group);
    return map;
  }, new Map());

  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([duplicateKey, group]) => ({ duplicateKey, candidates: group }));
}

function candidate(
  id: string,
  caseType: F2lCaseType,
  name: string,
  alg: string,
  targetSlot: F2lTargetSlot,
  difficulty: F2lCandidateDifficulty,
  tags: string[],
  description: string,
  notes?: string,
  status: F2lCandidate["status"] = "approved",
): F2lCandidate {
  return createCandidate({
    id,
    caseType,
    name,
    alg,
    targetSlot,
    difficulty,
    tags,
    description,
    source: [REVIEW_SOURCE],
    notes,
    status,
  });
}

export const F2L_CANDIDATES: F2lCandidate[] = [
  candidate(
    "cand-f2l-advanced-001",
    "advanced",
    "ペアを崩さず右前へ入れる候補",
    "U R U' R' U' F' U F",
    "FR",
    "intermediate",
    ["追加F2L", "右前", "ペア維持"],
    "U面で見えているペアを大きく崩さず、右前スロットへ寄せて入れる候補です。",
  ),
  candidate(
    "cand-f2l-advanced-002",
    "advanced",
    "離れたペアの右手処理候補",
    "R U2 R' U' R U R'",
    "FR",
    "intermediate",
    ["追加F2L", "右手", "U2"],
    "コーナーとエッジが離れている形を、U2を使って向きを合わせてから処理する候補です。",
  ),
  candidate(
    "cand-f2l-backslot-001",
    "backSlot",
    "BRへ回転なしで入れる候補",
    "U R' U R U B U' B'",
    "BR",
    "advanced",
    ["バックスロット", "BR", "回転削減"],
    "右奥スロットへ直接入れるための候補です。y回転を避けたい場面の確認用です。",
  ),
  candidate(
    "cand-f2l-backslot-002",
    "backSlot",
    "BLへ回転なしで入れる候補",
    "U' L U' L' U' B' U B",
    "BL",
    "advanced",
    ["バックスロット", "BL", "回転削減"],
    "左奥スロットを直接使う候補です。後ろ側を見ながら回す必要があるため確認用に残しています。",
  ),
  candidate(
    "cand-f2l-insert-001",
    "insertVariation",
    "右前インサート別解候補",
    "R U R' U' R U R'",
    "FR",
    "intermediate",
    ["インサート違い", "FR", "別解"],
    "同じ右前スロットでも、最後の入れ方を変えて次の見え方を調整する候補です。",
  ),
  candidate(
    "cand-f2l-insert-002",
    "insertVariation",
    "左前インサート別解候補",
    "L' U' L U L' U' L",
    "FL",
    "intermediate",
    ["インサート違い", "FL", "別解"],
    "左前スロット向けのインサート違い候補です。左手主体の手順確認に使います。",
  ),
  candidate(
    "cand-f2l-extraction-001",
    "extraction",
    "右前から取り出しながらペア作成",
    "R U' R' U R U R'",
    "FR",
    "intermediate",
    ["取り出し", "FR", "ペア作成"],
    "対象ピースがスロット付近にあるとき、取り出しとペア作成をまとめて確認する候補です。",
  ),
  candidate(
    "cand-f2l-extraction-002",
    "extraction",
    "左前から取り出しながらペア作成",
    "L' U L U' L' U' L",
    "FL",
    "intermediate",
    ["取り出し", "FL", "ペア作成"],
    "左前側に埋まった対象ピースを、U面へ戻しながら次の形へつなげる候補です。",
  ),
  candidate(
    "cand-f2l-rotationless-001",
    "rotationless",
    "回転を避ける右手寄せ候補",
    "U' R U R' U R U' R'",
    "auto",
    "advanced",
    ["回転削減", "右手", "先読み"],
    "持ち替えを減らし、U面調整で右手手順へ寄せるための候補です。",
  ),
  candidate(
    "cand-f2l-rotationless-002",
    "rotationless",
    "回転を避ける左手寄せ候補",
    "U L' U' L U' L' U L",
    "auto",
    "advanced",
    ["回転削減", "左手", "先読み"],
    "左側で処理した方が自然なときの候補です。左右対称の確認用として残しています。",
  ),
  candidate(
    "cand-f2l-other-001",
    "other",
    "次ペアを見やすくする候補",
    "R U R' U2 R U' R'",
    "FR",
    "intermediate",
    ["別解法", "先読み", "候補"],
    "手数だけでなく、次のペアの見え方を優先したい場面を検証する候補です。",
  ),
  candidate(
    "cand-f2l-other-002",
    "other",
    "U面整理用の候補",
    "F' U F U2 F' U' F",
    "FR",
    "intermediate",
    ["別解法", "U面整理", "候補"],
    "U面で対象ピースの向きを整えながら入れる候補です。基本41との差を確認するために置いています。",
  ),
];

export const F2L_CANDIDATE_SUMMARY = {
  total: F2L_CANDIDATES.length,
  approved: F2L_CANDIDATES.filter((candidateItem) => candidateItem.status === "approved").length,
  duplicates: findDuplicateF2lCandidates(F2L_CANDIDATES).length,
  invalid: F2L_CANDIDATES.filter((candidateItem) => !validateF2lCandidate(candidateItem).ok).length,
};
