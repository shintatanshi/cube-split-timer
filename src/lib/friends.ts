import { getSupabaseClient, type Database, type FriendRequestStatus } from "./supabase";

type FriendConnectionRpcRow =
  Database["public"]["Functions"]["get_friend_connections"]["Returns"][number];
type FriendPublicProfileRpcRow =
  Database["public"]["Functions"]["get_friend_public_profile"]["Returns"][number];

export type FriendConnectionDirection = "friend" | "incoming" | "outgoing";

export interface FriendConnection {
  requestId: string;
  userId: string;
  direction: FriendConnectionDirection;
  status: FriendRequestStatus;
  displayName: string | null;
  publicId: string | null;
  avatarId: string | null;
  createdAt: string;
  respondedAt: string | null;
  seenAt: string | null;
}

export interface FriendPublicProfile {
  userId: string;
  displayName: string | null;
  publicId: string | null;
  avatarId: string | null;
  bestMs: number | null;
  todayBestMs: number | null;
}

function mapFriendConnection(row: FriendConnectionRpcRow): FriendConnection {
  return {
    requestId: row.request_id,
    userId: row.other_user_id,
    direction: row.direction,
    status: row.status,
    displayName: row.display_name,
    publicId: row.public_id,
    avatarId: row.avatar_id,
    createdAt: row.request_created_at,
    respondedAt: row.responded_at,
    seenAt: row.addressee_seen_at,
  };
}

function mapFriendPublicProfile(row: FriendPublicProfileRpcRow): FriendPublicProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    publicId: row.public_id,
    avatarId: row.avatar_id,
    bestMs: row.best_ms,
    todayBestMs: row.today_best_ms,
  };
}

export async function getFriendConnections(): Promise<FriendConnection[]> {
  const { data, error } = await getSupabaseClient().rpc("get_friend_connections");

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapFriendConnection);
}

export async function getFriendPublicProfile(publicId: string): Promise<FriendPublicProfile> {
  const { data, error } = await getSupabaseClient().rpc("get_friend_public_profile", {
    p_public_id: publicId.trim(),
  });

  if (error) {
    throw error;
  }

  const profile = data?.[0];

  if (!profile) {
    throw new Error("プロフィールを読み込めませんでした。");
  }

  return mapFriendPublicProfile(profile);
}

export async function sendFriendRequest(publicId: string): Promise<FriendConnection> {
  const { data, error } = await getSupabaseClient().rpc("send_friend_request", {
    p_public_id: publicId.trim(),
  });

  if (error) {
    throw error;
  }

  const connection = data?.[0];

  if (!connection) {
    throw new Error("フレンド申請を送信できませんでした。");
  }

  return mapFriendConnection(connection);
}

export async function respondFriendRequest(requestId: string, accept: boolean): Promise<void> {
  const { error } = await getSupabaseClient().rpc("respond_friend_request", {
    p_request_id: requestId,
    p_accept: accept,
  });

  if (error) {
    throw error;
  }
}

export async function deleteFriendConnection(requestId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc("delete_friend_connection", {
    p_request_id: requestId,
  });

  if (error) {
    throw error;
  }
}

export async function getFriendNotificationCount(): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc("get_friend_notification_count");

  if (error) {
    throw error;
  }

  return data ?? 0;
}

export async function markFriendRequestNotificationsSeen(): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc(
    "mark_friend_request_notifications_seen",
  );

  if (error) {
    throw error;
  }

  return data ?? 0;
}

export function subscribeToFriendRequestChanges(
  userId: string,
  onChange: () => void,
): () => void {
  const client = getSupabaseClient();
  const channel = client
    .channel(`friend-request-notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "friend_requests",
        filter: `addressee_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
