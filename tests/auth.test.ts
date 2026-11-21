import { AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

let session: unknown = null;
let getUserResult: { data: { user: unknown }; error: unknown } = {
  data: { user: null },
  error: new AuthSessionMissingError(),
};
const getUser = vi.fn(() => Promise.resolve(getUserResult));

vi.mock("../src/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      getUser,
    },
  }),
}));

const { getCurrentAuthUser } = await import("../src/lib/auth");

describe("getCurrentAuthUser", () => {
  beforeEach(() => {
    session = null;
    getUser.mockClear();
  });

  it("returns null for a logged-out visitor instead of throwing", async () => {
    await expect(getCurrentAuthUser()).resolves.toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("treats a session that vanished mid-check as logged out", async () => {
    session = { access_token: "x" };
    getUserResult = { data: { user: null }, error: new AuthSessionMissingError() };

    await expect(getCurrentAuthUser()).resolves.toBeNull();
  });

  it("returns the user when signed in", async () => {
    session = { access_token: "x" };
    getUserResult = { data: { user: { id: "u1" } }, error: null };

    await expect(getCurrentAuthUser()).resolves.toEqual({ id: "u1" });
  });

  it("still reports real errors", async () => {
    session = { access_token: "x" };
    getUserResult = { data: { user: null }, error: new Error("network down") };

    await expect(getCurrentAuthUser()).rejects.toThrow("network down");
  });
});
