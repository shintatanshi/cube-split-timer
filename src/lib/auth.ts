import type { User } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export type AuthUser = User;

export function isAuthConfigured(): boolean {
  return isSupabaseConfigured();
}

export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  if (!isAuthConfigured()) {
    return null;
  }

  const { data, error } = await getSupabaseClient().auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
}

export function subscribeToAuthUserChange(
  onChange: (user: AuthUser | null) => void,
): () => void {
  if (!isAuthConfigured()) {
    return () => {};
  }

  const { data } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
    onChange(session?.user ?? null);
  });

  return () => data.subscription.unsubscribe();
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser | null> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data.user;
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<{ user: AuthUser | null; needsEmailConfirmation: boolean }> {
  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName.trim() || null,
      },
    },
  });

  if (error) {
    throw error;
  }

  return {
    user: data.user,
    needsEmailConfirmation: data.session === null,
  };
}

export async function signOutCurrentUser(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();

  if (error) {
    throw error;
  }
}
