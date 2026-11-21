import type { SolveRecord } from "../types";

export const RECORDING_MODE_QUERY_KEY = "recording";
export const RECORDING_DEMO_SCRAMBLE =
  "R U R' F R U R' U' F' U2 R U' R' D R2 U R2 D'";
export const RECORDING_ANALYZER_SPEED = 1;

const RECORDING_MODE_ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);

export function isRecordingModeSearch(search: string): boolean {
  try {
    const value = new URLSearchParams(search).get(RECORDING_MODE_QUERY_KEY);

    return value !== null && RECORDING_MODE_ENABLED_VALUES.has(value.toLowerCase());
  } catch {
    return false;
  }
}

export function isRecordingModeUrl(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return isRecordingModeSearch(window.location.search);
}

export function withRecordingModeParam(path: string, isRecordingMode: boolean): string {
  if (!isRecordingMode) {
    return path;
  }

  const [pathAndSearch, hash = ""] = path.split("#");
  const [pathname = "/", search = ""] = pathAndSearch.split("?");
  const params = new URLSearchParams(search);

  params.set(RECORDING_MODE_QUERY_KEY, "1");

  const nextPath = pathname || "/";
  const nextSearch = params.toString();
  const nextHash = hash ? `#${hash}` : "";

  return `${nextPath}${nextSearch ? `?${nextSearch}` : ""}${nextHash}`;
}

export const RECORDING_DEMO_SOLVES: SolveRecord[] = [
  {
    id: "recording-demo-1",
    mode: "normal",
    totalTime: 10240,
    scramble: RECORDING_DEMO_SCRAMBLE,
    penalty: "none",
    deletedAt: null,
    createdAt: "2026-06-30T09:12:00.000+09:00",
  },
  {
    id: "recording-demo-2",
    mode: "cfop_split",
    totalTime: 11380,
    scramble: "F R U R' U' F' L U2 L' U R U' R'",
    penalty: "none",
    deletedAt: null,
    createdAt: "2026-06-30T09:09:00.000+09:00",
    crossTime: 1420,
    f2lTime: 6320,
    ollTime: 1690,
    pllTime: 1950,
  },
  {
    id: "recording-demo-3",
    mode: "normal",
    totalTime: 9840,
    scramble: "U R2 F B R B2 R U2 L B2 R U' D' R2 F R'",
    penalty: "none",
    deletedAt: null,
    createdAt: "2026-06-30T09:06:00.000+09:00",
  },
  {
    id: "recording-demo-4",
    mode: "f2l_practice",
    totalTime: 6410,
    scramble: "D R' U' R D' L U L' U2 R U R'",
    penalty: "none",
    deletedAt: null,
    createdAt: "2026-06-30T09:03:00.000+09:00",
    f2lTime: 6410,
  },
  {
    id: "recording-demo-5",
    mode: "normal",
    totalTime: 10890,
    scramble: "L U2 F' U R U' R' F2 D R2 U B' L2",
    penalty: "none",
    deletedAt: null,
    createdAt: "2026-06-30T09:00:00.000+09:00",
  },
  {
    id: "recording-demo-6",
    mode: "cross_practice",
    totalTime: 1820,
    scramble: "R2 D F U' R' D2 L U B2 R F'",
    penalty: "none",
    deletedAt: null,
    createdAt: "2026-06-30T08:57:00.000+09:00",
    crossTime: 1820,
    crossColor: "white",
  },
  {
    id: "recording-demo-7",
    mode: "normal",
    totalTime: 12160,
    scramble: "B U2 L' D R2 U' F R U R' F' D2",
    penalty: "none",
    deletedAt: null,
    createdAt: "2026-06-30T08:54:00.000+09:00",
  },
  {
    id: "recording-demo-8",
    mode: "f2l_pair_split",
    totalTime: 7320,
    scramble: "R U R' U R U2 R' F R U R' U' F'",
    penalty: "none",
    deletedAt: null,
    createdAt: "2026-06-30T08:51:00.000+09:00",
    pair1Time: 1610,
    pair2Time: 1840,
    pair3Time: 1900,
    pair4Time: 1970,
  },
];
