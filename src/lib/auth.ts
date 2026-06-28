import type { User, UserIdentity } from "@supabase/supabase-js";
import { getSupabaseClient, isSupabaseConfigured } from "./supabase";

export type AuthUser = User;
export type AuthIdentity = UserIdentity;

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

function getLoginRedirectUrl(): string {
  return `${window.location.origin}/login`;
}

export async function signInWithGoogle(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getLoginRedirectUrl(),
    },
  });

  if (error) {
    throw error;
  }
}

export async function getAuthIdentities(): Promise<AuthIdentity[]> {
  const { data, error } = await getSupabaseClient().auth.getUserIdentities();

  if (error) {
    throw error;
  }

  return data.identities;
}

export async function linkGoogleIdentity(): Promise<void> {
  const { error } = await getSupabaseClient().auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: getLoginRedirectUrl(),
    },
  });

  if (error) {
    throw error;
  }
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

function getPasswordResetRedirectUrl(): string {
  return `${window.location.origin}/reset-password`;
}

export async function requestPasswordResetEmail(email: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(email, {
    redirectTo: getPasswordResetRedirectUrl(),
  });

  if (error) {
    throw error;
  }
}

export async function updateCurrentUserPassword(password: string): Promise<void> {
  const { error } = await getSupabaseClient().auth.updateUser({ password });

  if (error) {
    throw error;
  }
}

export async function updateCurrentUserProfile(
  displayName: string,
  avatarId: string,
): Promise<AuthUser> {
  const { data, error } = await getSupabaseClient().auth.updateUser({
    data: {
      avatar_id: avatarId,
      display_name: displayName.trim() || null,
    },
  });

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error("プロフィールを更新できませんでした。");
  }

  return data.user;
}
