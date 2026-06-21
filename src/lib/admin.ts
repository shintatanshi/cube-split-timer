import { requestPasswordResetEmail } from "./auth";
import { getSupabaseClient, type Database, type ProfileRole } from "./supabase";
import type { SolveSessionRow } from "./solveSessions";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export interface GetAdminSolveSessionsOptions {
  includeDeleted?: boolean;
  limit?: number;
  userId?: string;
}

export async function getMyProfile(): Promise<ProfileRow | null> {
  const supabase = getSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  if (!authData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getAdminProfiles(): Promise<ProfileRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function updateProfileRole(
  profileId: string,
  role: ProfileRole,
): Promise<ProfileRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", profileId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function getAdminSolveSessions(
  options: GetAdminSolveSessionsOptions = {},
): Promise<SolveSessionRow[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("solve_sessions")
    .select("*")
    .order("created_at", { ascending: false });

  if (!options.includeDeleted) {
    query = query.eq("is_deleted", false);
  }

  if (options.userId) {
    query = query.eq("user_id", options.userId);
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

export async function sendUserPasswordResetEmail(email: string): Promise<void> {
  await requestPasswordResetEmail(email);
}
