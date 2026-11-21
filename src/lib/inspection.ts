import type { Penalty } from "../types";

export const INSPECTION_LIMIT_MS = 15000;
export const INSPECTION_WARNING_8S_MS = 8000;
export const INSPECTION_WARNING_12S_MS = 12000;
export const INSPECTION_PLUS2_LIMIT_MS = 17000;

export type InspectionStage = "normal" | "warn8" | "warn12" | "plus2" | "dnf";

/**
 * Computes the WCA inspection penalty for the elapsed inspection time in ms.
 * - <= 15000ms: "none"
 * - 15001..17000ms: "+2"
 * - >= 17001ms: "DNF"
 */
export function getInspectionPenalty(elapsedMs: number): Penalty {
  if (!Number.isFinite(elapsedMs)) {
    return "DNF";
  }

  if (elapsedMs <= INSPECTION_LIMIT_MS) {
    return "none";
  }

  if (elapsedMs <= INSPECTION_PLUS2_LIMIT_MS) {
    return "+2";
  }

  return "DNF";
}

/**
 * Classifies the visual warning stage during the 15-second inspection countdown.
 */
export function getInspectionStage(elapsedMs: number): InspectionStage {
  const penalty = getInspectionPenalty(elapsedMs);

  if (penalty === "DNF") {
    return "dnf";
  }

  if (penalty === "+2") {
    return "plus2";
  }

  if (elapsedMs >= INSPECTION_WARNING_12S_MS) {
    return "warn12";
  }

  if (elapsedMs >= INSPECTION_WARNING_8S_MS) {
    return "warn8";
  }

  return "normal";
}

/**
 * Formats the WCA inspection countdown display ("15".."1", "+2", or "DNF").
 */
export function formatInspectionDisplay(elapsedMs: number): string {
  const penalty = getInspectionPenalty(elapsedMs);

  if (penalty === "DNF") {
    return "DNF";
  }

  if (penalty === "+2") {
    return "+2";
  }

  const safeElapsedMs = Math.max(0, elapsedMs);
  const remainingSeconds = Math.ceil((INSPECTION_LIMIT_MS - safeElapsedMs) / 1000);

  return String(Math.max(1, remainingSeconds));
}
