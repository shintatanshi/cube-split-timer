import { getSupabaseClient, type Database } from "./supabase";

type ChatThreadRpcRow = Database["public"]["Functions"]["get_chat_threads"]["Returns"][number];
type ChatMessageRpcRow = Database["public"]["Functions"]["get_chat_messages"]["Returns"][number];

export interface ChatThread {
  userId: string;
  displayName: string | null;
  publicId: string | null;
  avatarId: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface ChatMessage {
  messageId: string;
  senderId: string;
  receiverId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

function mapChatThread(row: ChatThreadRpcRow): ChatThread {
  return {
    userId: row.other_user_id,
    displayName: row.display_name,
    publicId: row.public_id,
    avatarId: row.avatar_id,
    lastMessage: row.last_message,
    lastMessageAt: row.last_message_at,
    unreadCount: row.unread_count,
  };
}

function mapChatMessage(row: ChatMessageRpcRow): ChatMessage {
  return {
    messageId: row.message_id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export async function getChatThreads(): Promise<ChatThread[]> {
  const { data, error } = await getSupabaseClient().rpc("get_chat_threads");

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapChatThread);
}

export async function getChatMessages(publicId: string): Promise<ChatMessage[]> {
  const { data, error } = await getSupabaseClient().rpc("get_chat_messages", {
    p_public_id: publicId.trim(),
    p_limit: 120,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapChatMessage);
}

export async function sendFriendMessage(publicId: string, body: string): Promise<ChatMessage> {
  const { data, error } = await getSupabaseClient().rpc("send_friend_message", {
    p_public_id: publicId.trim(),
    p_body: body,
  });

  if (error) {
    throw error;
  }

  const message = data?.[0];

  if (!message) {
    throw new Error("メッセージを送信できませんでした。");
  }

  return mapChatMessage(message);
}

export async function markChatMessagesRead(publicId: string): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc("mark_chat_messages_read", {
    p_public_id: publicId.trim(),
  });

  if (error) {
    throw error;
  }

  return data ?? 0;
}

export async function getChatUnreadCount(): Promise<number> {
  const { data, error } = await getSupabaseClient().rpc("get_chat_unread_count");

  if (error) {
    throw error;
  }

  return data ?? 0;
}

export function subscribeToChatMessageChanges(
  userId: string,
  onChange: () => void,
): () => void {
  const client = getSupabaseClient();
  const channel = client
    .channel(`friend-message-notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "friend_messages",
        filter: `receiver_id=eq.${userId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "friend_messages",
        filter: `sender_id=eq.${userId}`,
      },
      onChange,
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
