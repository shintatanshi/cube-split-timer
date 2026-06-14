import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ProfileRole = "user" | "admin";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          role: ProfileRole;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          role?: ProfileRole;
          created_at?: string;
        };
        Update: {
          display_name?: string | null;
          role?: ProfileRole;
        };
        Relationships: [];
      };
      solve_sessions: {
        Row: {
          id: string;
          user_id: string;
          mode: string;
          scramble: string;
          total_ms: number;
          cross_ms: number | null;
          f2l_ms: number | null;
          oll_ms: number | null;
          pll_ms: number | null;
          cross_solution: string | null;
          notes: string | null;
          is_dnf: boolean;
          is_deleted: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          mode: string;
          scramble: string;
          total_ms: number;
          cross_ms?: number | null;
          f2l_ms?: number | null;
          oll_ms?: number | null;
          pll_ms?: number | null;
          cross_solution?: string | null;
          notes?: string | null;
          is_dnf?: boolean;
          is_deleted?: boolean;
          created_at?: string;
        };
        Update: {
          mode?: string;
          scramble?: string;
          total_ms?: number;
          cross_ms?: number | null;
          f2l_ms?: number | null;
          oll_ms?: number | null;
          pll_ms?: number | null;
          cross_solution?: string | null;
          notes?: string | null;
          is_dnf?: boolean;
          is_deleted?: boolean;
        };
        Relationships: [];
      };
      feedback_reports: {
        Row: {
          id: string;
          category: "bug" | "request" | "other";
          message: string;
          contact: string | null;
          page_path: string | null;
          current_scramble: string | null;
          timer_mode: string | null;
          user_agent: string | null;
          status: "open" | "reviewing" | "resolved" | "archived";
          created_at: string;
        };
        Insert: {
          id?: string;
          category: "bug" | "request" | "other";
          message: string;
          contact?: string | null;
          page_path?: string | null;
          current_scramble?: string | null;
          timer_mode?: string | null;
          user_agent?: string | null;
          status?: "open" | "reviewing" | "resolved" | "archived";
          created_at?: string;
        };
        Update: {
          category?: "bug" | "request" | "other";
          message?: string;
          contact?: string | null;
          page_path?: string | null;
          current_scramble?: string | null;
          timer_mode?: string | null;
          user_agent?: string | null;
          status?: "open" | "reviewing" | "resolved" | "archived";
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";

let cachedClient: SupabaseClient<Database> | null = null;

export function isSupabaseConfigured(): boolean {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }

  if (!cachedClient) {
    cachedClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return cachedClient;
}
