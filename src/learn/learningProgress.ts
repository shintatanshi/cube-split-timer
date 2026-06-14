import type { LearningProgressMap, LearningStatus } from "../types";

const LEARNING_PROGRESS_KEY = "cubeSplitTimer.learningProgress.v1";

function isLearningStatus(value: unknown): value is LearningStatus {
  return (
    value === "unlearned" ||
    value === "learning" ||
    value === "learned" ||
    value === "weak"
  );
}

export function loadLearningProgress(): LearningProgressMap {
  try {
    const raw = localStorage.getItem(LEARNING_PROGRESS_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }

    return Object.entries(parsed).reduce<LearningProgressMap>((progress, [caseId, status]) => {
      if (typeof caseId === "string" && isLearningStatus(status)) {
        progress[caseId] = status;
      }

      return progress;
    }, {});
  } catch {
    return {};
  }
}

export function saveLearningProgress(progress: LearningProgressMap): void {
  try {
    localStorage.setItem(LEARNING_PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Learning progress should not block the timer when storage is unavailable.
  }
}
