import type { SolveMode } from "../types";
import { getSupabaseClient, type Database } from "./supabase";

export type SolveSessionRow = Database["public"]["Tables"]["solve_sessions"]["Row"];

export interface SaveSolveSessionInput {
  mode: SolveMode;
  scramble: string;
  totalMs: number;
  crossMs?: number | null;
  f2lMs?: number | null;
  ollMs?: number | null;
  pllMs?: number | null;
  crossSolution?: string | null;
  notes?: string | null;
  isDnf?: boolean;
  createdAt?: string;
}

export interface GetMySolveSessionsOptions {
  includeDeleted?: boolean;
  limit?: number;
}

async function getSignedInUserId(): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error("You must be signed in to use Supabase solve sessions.");
  }

  return data.user.id;
}

export async function saveSolveSession(input: SaveSolveSessionInput): Promise<SolveSessionRow> {
  const supabase = getSupabaseClient();
  const userId = await getSignedInUserId();

  const { data, error } = await supabase
    .from("solve_sessions")
    .insert({
      user_id: userId,
      mode: input.mode,
      scramble: input.scramble,
      total_ms: Math.round(input.totalMs),
      cross_ms: input.crossMs == null ? null : Math.round(input.crossMs),
      f2l_ms: input.f2lMs == null ? null : Math.round(input.f2lMs),
      oll_ms: input.ollMs == null ? null : Math.round(input.ollMs),
      pll_ms: input.pllMs == null ? null : Math.round(input.pllMs),
      cross_solution: input.crossSolution ?? null,
      notes: input.notes ?? null,
      is_dnf: input.isDnf ?? false,
      is_deleted: false,
      created_at: input.createdAt,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getMySolveSessions(
  options: GetMySolveSessionsOptions = {},
): Promise<SolveSessionRow[]> {
  const supabase = getSupabaseClient();
  const userId = await getSignedInUserId();

  let query = supabase
    .from("solve_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!options.includeDeleted) {
    query = query.eq("is_deleted", false);
  }

  if (options.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

export interface SolveSessionPatch {
  totalMs?: number;
  isDnf?: boolean;
  notes?: string | null;
  isDeleted?: boolean;
}

export const LOCAL_SOLVE_ID_NOTE_PREFIX = "Local solve ID: ";
export const CLOUD_ONLY_SOLVE_ID_PREFIX = "cloud-";

/** Escapes LIKE wildcards so a local id is matched literally. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Applies a local change (delete / restore / penalty) to the cloud row of a local solve.
 * Rows are found by their cloud id for cloud-only solves, otherwise by the
 * "Local solve ID: <id>" note written when the solve was uploaded.
 * Returns how many rows were updated (0 when the solve was never uploaded).
 */
export async function updateSolveSessionForLocalSolve(
  localSolveId: string,
  patch: SolveSessionPatch,
): Promise<number> {
  const supabase = getSupabaseClient();
  const userId = await getSignedInUserId();

  const update: Database["public"]["Tables"]["solve_sessions"]["Update"] = {};

  if (patch.totalMs !== undefined) {
    update.total_ms = Math.round(patch.totalMs);
  }

  if (patch.isDnf !== undefined) {
    update.is_dnf = patch.isDnf;
  }

  if (patch.notes !== undefined) {
    update.notes = patch.notes;
  }

  if (patch.isDeleted !== undefined) {
    update.is_deleted = patch.isDeleted;
  }

  // Admins may update any row under RLS, so always scope to the signed-in user.
  let query = supabase.from("solve_sessions").update(update).eq("user_id", userId);

  if (localSolveId.startsWith(CLOUD_ONLY_SOLVE_ID_PREFIX)) {
    query = query.eq("id", localSolveId.slice(CLOUD_ONLY_SOLVE_ID_PREFIX.length));
  } else {
    query = query.like(
      "notes",
      `%${LOCAL_SOLVE_ID_NOTE_PREFIX}${escapeLikePattern(localSolveId)}%`,
    );
  }

  const { data, error } = await query.select("id");

  if (error) {
    throw error;
  }

  return data?.length ?? 0;
}

export async function softDeleteSolveSession(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const userId = await getSignedInUserId();

  const { error } = await supabase
    .from("solve_sessions")
    .update({ is_deleted: true })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}
