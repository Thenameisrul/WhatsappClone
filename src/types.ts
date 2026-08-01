export interface User {
  id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  online: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

export interface Conversation {
  id: string;
  user_id: string;
  unread_count: number;
  owner_id: string;
  locked: boolean;
  lock_pin_hash: string | null;
  created_at: string;
}

export type MediaType = 'image' | 'video' | 'audio' | 'file';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string | null;
  media_url: string | null;
  media_type: MediaType | null;
  duration: number | null;
  file_name: string | null;
  file_size: number | null;
  view_once: boolean | null;
  viewed_at: string | null;
  created_at: string;
}

export interface ConversationWithUser extends Conversation {
  user: User;
  blocked: boolean;
  pair_id: string | null;
}

export interface ConversationView {
  id: string;
  userId: string;
  userName: string;
  avatarUrl: string;
  online: boolean;
  unreadCount: number;
  lastMessage: string;
  lastMessageTime: string;
  lastMessageAt: string;
  locked: boolean;
  lockPinHash: string | null;
  blocked: boolean;
  pairId: string | null;
}

export type CallMode = 'audio' | 'video';

export interface CallState {
  mode: CallMode;
  contactName: string;
  contactAvatar: string;
  startedAt: number;
}

export type CallSignalType = 'offer' | 'answer' | 'ice' | 'hangup' | 'reject';

export interface CallSignal {
  id: string;
  pair_id: string;
  sender_id: string;
  type: CallSignalType;
  payload: Record<string, unknown> | null;
  created_at: string;
}
