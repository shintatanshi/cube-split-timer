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
  await getSignedInUserId();

  let query = supabase
    .from("solve_sessions")
    .select("*")
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

export async function softDeleteSolveSession(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  await getSignedInUserId();

  const { error } = await supabase
    .from("solve_sessions")
    .update({ is_deleted: true })
    .eq("id", id);

  if (error) {
    throw error;
  }
}
