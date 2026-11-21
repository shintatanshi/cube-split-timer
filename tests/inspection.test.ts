import { describe, expect, it } from "vitest";
import {
  formatInspectionDisplay,
  getInspectionPenalty,
  getInspectionStage,
} from "../src/lib/inspection";

describe("getInspectionPenalty", () => {
  it("returns none at 0ms and 15000ms", () => {
    expect(getInspectionPenalty(0)).toBe("none");
    expect(getInspectionPenalty(15000)).toBe("none");
  });

  it("returns +2 between 15001ms and 17000ms inclusive", () => {
    expect(getInspectionPenalty(15001)).toBe("+2");
    expect(getInspectionPenalty(17000)).toBe("+2");
  });

  it("returns DNF at 17001ms and above", () => {
    expect(getInspectionPenalty(17001)).toBe("DNF");
    expect(getInspectionPenalty(25000)).toBe("DNF");
  });
});

describe("getInspectionStage", () => {
  it("tracks 8s, 12s, +2, and DNF thresholds", () => {
    expect(getInspectionStage(0)).toBe("normal");
    expect(getInspectionStage(7999)).toBe("normal");
    expect(getInspectionStage(8000)).toBe("warn8");
    expect(getInspectionStage(11999)).toBe("warn8");
    expect(getInspectionStage(12000)).toBe("warn12");
    expect(getInspectionStage(15000)).toBe("warn12");
    expect(getInspectionStage(15001)).toBe("plus2");
    expect(getInspectionStage(17000)).toBe("plus2");
    expect(getInspectionStage(17001)).toBe("dnf");
  });
});

describe("formatInspectionDisplay", () => {
  it("formats countdown seconds and penalty states", () => {
    expect(formatInspectionDisplay(0)).toBe("15");
    expect(formatInspectionDisplay(1000)).toBe("14");
    expect(formatInspectionDisplay(14999)).toBe("1");
    expect(formatInspectionDisplay(15000)).toBe("1");
    expect(formatInspectionDisplay(15001)).toBe("+2");
    expect(formatInspectionDisplay(17000)).toBe("+2");
    expect(formatInspectionDisplay(17001)).toBe("DNF");
  });
});
