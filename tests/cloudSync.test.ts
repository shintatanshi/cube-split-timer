import { describe, expect, it } from "vitest";
import { getCloudDeletedLocalIds } from "../src/lib/cloudSync";

const rowLocalId = (row: { id: string; notes: string | null }) =>
  row.notes?.match(/Local solve ID: ([\w-]+)/)?.[1] ?? `cloud-${row.id}`;

describe("getCloudDeletedLocalIds", () => {
  it("marks a solve deleted when its only row is deleted", () => {
    const ids = getCloudDeletedLocalIds(
      [{ id: "r1", is_deleted: true, notes: "Local solve ID: a" }],
      rowLocalId,
    );
    expect([...ids]).toEqual(["a"]);
  });

  // Regression (2026-11-22): a solve with one active row and two cleaned-up
  // duplicate rows was hidden on sync.
  it("keeps a solve that still has an active row next to deleted duplicates", () => {
    const ids = getCloudDeletedLocalIds(
      [
        { id: "r1", is_deleted: false, notes: "Local solve ID: b" },
        { id: "r2", is_deleted: true, notes: "Local solve ID: b / Cleanup duplicate Local solve ID 2026-06-29" },
        { id: "r3", is_deleted: true, notes: "Local solve ID: b / Cleanup duplicate Local solve ID 2026-06-29" },
      ],
      rowLocalId,
    );
    expect(ids.has("b")).toBe(false);
  });

  it("uses the cloud id for rows without a local id", () => {
    const ids = getCloudDeletedLocalIds([{ id: "r9", is_deleted: true, notes: null }], rowLocalId);
    expect([...ids]).toEqual(["cloud-r9"]);
  });
});
