import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { method: string; args: unknown[] };
let lookupCalls: Call[] = [];
let updateCalls: Call[] = [];
let lookupRows: { id: string; is_deleted: boolean }[] = [];

function chain(calls: Call[], result: () => unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "update", "eq", "like", "in", "order"]) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  }
  query.then = (resolve: (value: unknown) => void) => resolve(result());
  return query;
}

vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }),
    },
    from: () => ({
      select: (...args: unknown[]) => {
        lookupCalls.push({ method: "select", args });
        return chain(lookupCalls, () => ({ data: lookupRows, error: null }));
      },
      update: (...args: unknown[]) => {
        updateCalls.push({ method: "update", args });
        return chain(updateCalls, () => {
          const ids = (updateCalls.find((c) => c.method === "in")?.args[1] ?? []) as string[];
          return { data: ids.map((id) => ({ id })), error: null };
        });
      },
    }),
  }),
}));

const { escapeLikePattern, updateSolveSessionForLocalSolve } = await import(
  "../src/lib/solveSessions"
);

const updatedIds = () => updateCalls.find((c) => c.method === "in")?.args[1];

describe("updateSolveSessionForLocalSolve", () => {
  beforeEach(() => {
    lookupCalls = [];
    updateCalls = [];
    lookupRows = [{ id: "row-1", is_deleted: false }];
  });

  it("finds an uploaded local solve by its Local solve ID note, scoped to the user", async () => {
    const count = await updateSolveSessionForLocalSolve("abc-123", { isDeleted: true });

    expect(count).toBe(1);
    expect(lookupCalls).toContainEqual({
      method: "like",
      args: ["notes", "%Local solve ID: abc-123%"],
    });
    expect(lookupCalls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
    expect(updateCalls).toContainEqual({ method: "update", args: [{ is_deleted: true }] });
    expect(updateCalls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
    expect(updatedIds()).toEqual(["row-1"]);
  });

  it("finds a cloud-only solve by its row id", async () => {
    lookupRows = [{ id: "9f0c", is_deleted: false }];
    await updateSolveSessionForLocalSolve("cloud-9f0c", { isDeleted: true });

    expect(lookupCalls).toContainEqual({ method: "eq", args: ["id", "9f0c"] });
    expect(lookupCalls.some((call) => call.method === "like")).toBe(false);
  });

  it("maps a penalty change onto total_ms, is_dnf and notes", async () => {
    await updateSolveSessionForLocalSolve("abc", {
      totalMs: 12345.6,
      isDnf: true,
      notes: "Penalty: DNF / Local solve ID: abc",
    });

    expect(updateCalls).toContainEqual({
      method: "update",
      args: [{ total_ms: 12346, is_dnf: true, notes: "Penalty: DNF / Local solve ID: abc" }],
    });
  });

  // Regression (2026-11-22): cleaned-up duplicate rows share the Local solve ID.
  it("changes only active rows when duplicates were soft-deleted", async () => {
    lookupRows = [
      { id: "active", is_deleted: false },
      { id: "dup-1", is_deleted: true },
      { id: "dup-2", is_deleted: true },
    ];
    await updateSolveSessionForLocalSolve("b", { totalMs: 2692, isDeleted: false });

    expect(updatedIds()).toEqual(["active"]);
  });

  it("restores a single row when every row is deleted", async () => {
    lookupRows = [
      { id: "dup-1", is_deleted: true },
      { id: "dup-2", is_deleted: true },
    ];
    await updateSolveSessionForLocalSolve("b", { isDeleted: false });

    expect(updatedIds()).toEqual(["dup-1"]);
  });

  it("does nothing when the solve was never uploaded", async () => {
    lookupRows = [];
    await expect(updateSolveSessionForLocalSolve("missing", { isDeleted: true })).resolves.toBe(0);
    expect(updateCalls).toEqual([]);
  });

  it("escapes LIKE wildcards in ids", () => {
    expect(escapeLikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
});
