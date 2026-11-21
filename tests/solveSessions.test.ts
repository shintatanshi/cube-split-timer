import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { method: string; args: unknown[] }[] = [];
let updatedRows: { id: string }[] = [{ id: "row-1" }];

function makeQuery() {
  const query: Record<string, unknown> = {};
  for (const method of ["update", "eq", "like"]) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return query;
    };
  }
  query.select = (...args: unknown[]) => {
    calls.push({ method: "select", args });
    return Promise.resolve({ data: updatedRows, error: null });
  };
  return query;
}

vi.mock("../src/lib/supabase", () => ({
  getSupabaseClient: () => ({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }),
    },
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return makeQuery();
    },
  }),
}));

const { escapeLikePattern, updateSolveSessionForLocalSolve } = await import(
  "../src/lib/solveSessions"
);

describe("updateSolveSessionForLocalSolve", () => {
  beforeEach(() => {
    calls.length = 0;
    updatedRows = [{ id: "row-1" }];
  });

  it("finds an uploaded local solve by its Local solve ID note", async () => {
    const count = await updateSolveSessionForLocalSolve("abc-123", { isDeleted: true });

    expect(count).toBe(1);
    expect(calls).toContainEqual({ method: "from", args: ["solve_sessions"] });
    expect(calls).toContainEqual({ method: "update", args: [{ is_deleted: true }] });
    expect(calls).toContainEqual({ method: "like", args: ["notes", "%Local solve ID: abc-123%"] });
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
    expect(calls.some((call) => call.method === "eq" && call.args[0] === "id")).toBe(false);
  });

  it("finds a cloud-only solve by its row id", async () => {
    await updateSolveSessionForLocalSolve("cloud-9f0c", { isDeleted: false });

    expect(calls).toContainEqual({ method: "eq", args: ["id", "9f0c"] });
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
    expect(calls.some((call) => call.method === "like")).toBe(false);
  });

  it("maps a penalty change onto total_ms, is_dnf and notes", async () => {
    await updateSolveSessionForLocalSolve("abc", {
      totalMs: 12345.6,
      isDnf: true,
      notes: "Penalty: DNF / Local solve ID: abc",
      isDeleted: false,
    });

    expect(calls).toContainEqual({
      method: "update",
      args: [
        {
          total_ms: 12346,
          is_dnf: true,
          notes: "Penalty: DNF / Local solve ID: abc",
          is_deleted: false,
        },
      ],
    });
  });

  it("returns 0 when the solve was never uploaded", async () => {
    updatedRows = [];
    await expect(updateSolveSessionForLocalSolve("missing", { isDeleted: true })).resolves.toBe(0);
  });

  it("escapes LIKE wildcards in ids", () => {
    expect(escapeLikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
});
