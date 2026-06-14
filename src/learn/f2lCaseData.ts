import type { F2lCandidate, F2lCase } from "../types";
import { F2L_CANDIDATES } from "./f2lCandidateData";

export function f2lCandidateToCase(candidate: F2lCandidate): F2lCase {
  return {
    id: candidate.id.replace(/^cand-/, "f2l-"),
    caseType: candidate.caseType,
    name: candidate.name,
    alg: candidate.alg,
    inverseAlg: candidate.inverseAlg,
    targetSlot: candidate.targetSlot,
    difficulty: candidate.difficulty,
    tags: candidate.tags,
    moveCount: candidate.moveCount,
    score: candidate.score,
    description: candidate.description,
    source: candidate.source,
    learnCaseId: `official-${candidate.id.replace(/^cand-/, "")}`,
    notes: candidate.notes,
  };
}

export const APPROVED_F2L_CASES: F2lCase[] = F2L_CANDIDATES.filter(
  (candidate) => candidate.status === "approved",
).map(f2lCandidateToCase);

export const APPROVED_F2L_CASE_COUNT = APPROVED_F2L_CASES.length;
