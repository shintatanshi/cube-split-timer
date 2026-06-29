import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type ProfileRole = "user" | "admin";
export type FriendRequestStatus = "pending" | "accepted" | "rejected";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          public_id: string | null;
          public_id_changed_at: string | null;
          role: ProfileRole;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          public_id?: string | null;
          public_id_changed_at?: string | null;
          role?: ProfileRole;
          created_at?: string;
        };
        Update: {
          email?: string | null;
          display_name?: string | null;
          public_id?: string | null;
          public_id_changed_at?: string | null;
          role?: ProfileRole;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          user_id: string;
          friend_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          friend_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          friend_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      friend_requests: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: FriendRequestStatus;
          created_at: string;
          responded_at: string | null;
          addressee_seen_at: string | null;
          requester_seen_at: string | null;
        };
        Insert: {
          id?: string;
          requester_id: string;
          addressee_id: string;
          status?: FriendRequestStatus;
          created_at?: string;
          responded_at?: string | null;
          addressee_seen_at?: string | null;
          requester_seen_at?: string | null;
        };
        Update: {
          requester_id?: string;
          addressee_id?: string;
          status?: FriendRequestStatus;
          responded_at?: string | null;
          addressee_seen_at?: string | null;
          requester_seen_at?: string | null;
        };
        Relationships: [];
      };
      friend_messages: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          body: string;
          created_at: string;
          read_at: string | null;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          body: string;
          created_at?: string;
          read_at?: string | null;
        };
        Update: {
          body?: string;
          read_at?: string | null;
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
    Functions: {
      update_my_profile: {
        Args: {
          p_display_name: string | null;
          p_public_id: string | null;
        };
        Returns: {
          id: string;
          email: string | null;
          display_name: string | null;
          public_id: string | null;
          public_id_changed_at: string | null;
          role: ProfileRole;
          created_at: string;
        };
      };
      get_my_friends: {
        Args: Record<string, never>;
        Returns: Array<{
          friend_id: string;
          display_name: string | null;
          public_id: string | null;
          avatar_id: string | null;
          friend_created_at: string;
        }>;
      };
      add_friend_by_public_id: {
        Args: {
          p_public_id: string;
        };
        Returns: Array<{
          friend_id: string;
          display_name: string | null;
          public_id: string | null;
          avatar_id: string | null;
          friend_created_at: string;
        }>;
      };
      delete_friend: {
        Args: {
          p_friend_id: string;
        };
        Returns: undefined;
      };
      get_friend_connections: {
        Args: Record<string, never>;
        Returns: Array<{
          request_id: string;
          other_user_id: string;
          direction: "friend" | "incoming" | "outgoing";
          status: FriendRequestStatus;
          display_name: string | null;
          public_id: string | null;
          avatar_id: string | null;
          request_created_at: string;
          responded_at: string | null;
          addressee_seen_at: string | null;
        }>;
      };
      get_friend_notification_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      mark_friend_request_notifications_seen: {
        Args: Record<string, never>;
        Returns: number;
      };
      send_friend_request: {
        Args: {
          p_public_id: string;
        };
        Returns: Array<{
          request_id: string;
          other_user_id: string;
          direction: "friend" | "incoming" | "outgoing";
          status: FriendRequestStatus;
          display_name: string | null;
          public_id: string | null;
          avatar_id: string | null;
          request_created_at: string;
          responded_at: string | null;
          addressee_seen_at: string | null;
        }>;
      };
      respond_friend_request: {
        Args: {
          p_request_id: string;
          p_accept: boolean;
        };
        Returns: undefined;
      };
      delete_friend_connection: {
        Args: {
          p_request_id: string;
        };
        Returns: undefined;
      };
      get_friend_public_profile: {
        Args: {
          p_public_id: string;
        };
        Returns: Array<{
          user_id: string;
          display_name: string | null;
          public_id: string | null;
          avatar_id: string | null;
          best_ms: number | null;
          today_best_ms: number | null;
        }>;
      };
      get_chat_threads: {
        Args: Record<string, never>;
        Returns: Array<{
          other_user_id: string;
          display_name: string | null;
          public_id: string | null;
          avatar_id: string | null;
          last_message: string | null;
          last_message_at: string | null;
          unread_count: number;
        }>;
      };
      get_chat_messages: {
        Args: {
          p_public_id: string;
          p_limit?: number;
        };
        Returns: Array<{
          message_id: string;
          sender_id: string;
          receiver_id: string;
          body: string;
          created_at: string;
          read_at: string | null;
        }>;
      };
      send_friend_message: {
        Args: {
          p_public_id: string;
          p_body: string;
        };
        Returns: Array<{
          message_id: string;
          sender_id: string;
          receiver_id: string;
          body: string;
          created_at: string;
          read_at: string | null;
        }>;
      };
      mark_chat_messages_read: {
        Args: {
          p_public_id: string;
        };
        Returns: number;
      };
      get_chat_unread_count: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
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
