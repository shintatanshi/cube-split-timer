import type { SolveSessionRow } from "./solveSessions";

/**
 * Local solve ids whose cloud rows are all soft-deleted.
 * A local id can have several rows (older duplicate uploads that were cleaned
 * up by soft-deleting them), so it only counts as deleted when none of its rows
 * is still active.
 */
export function getCloudDeletedLocalIds(
  rows: Pick<SolveSessionRow, "id" | "is_deleted" | "notes">[],
  rowLocalId: (row: Pick<SolveSessionRow, "id" | "is_deleted" | "notes">) => string,
): Set<string> {
  const activeIds = new Set(rows.filter((row) => !row.is_deleted).map(rowLocalId));

  return new Set(
    rows
      .filter((row) => row.is_deleted)
      .map(rowLocalId)
      .filter((localId) => !activeIds.has(localId)),
  );
}
