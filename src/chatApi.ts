import { supabase } from '@/supabaseClient';
import type {
  ConversationView,
  ConversationWithUser,
  Message,
  MediaType,
  Profile,
  CallSignal,
  CallSignalType,
} from '@/types';

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const diff = now.getTime() - date.getTime();
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

function summarizeMessage(msg: Message | null): string {
  if (!msg) return 'No messages yet';
  if (msg.media_type === 'image') return '📷 Photo';
  if (msg.media_type === 'video') return '🎥 Video';
  if (msg.media_type === 'audio') return '🎤 Voice message';
  if (msg.media_type === 'file') return `📎 ${msg.file_name ?? 'File'}`;
  return msg.text ?? 'No messages yet';
}

const MESSAGE_FIELDS =
  'id, conversation_id, sender_id, text, media_url, media_type, duration, file_name, file_size, created_at';

export async function fetchConversations(): Promise<ConversationView[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, user_id, unread_count, owner_id, locked, lock_pin_hash, blocked, pair_id, created_at, user:user_id (id, name, avatar_url, online)')
    .order('created_at', { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as unknown as ConversationWithUser[];
  const views: ConversationView[] = [];

  for (const row of rows) {
    const { data: lastMsg } = await supabase
      .from('messages')
      .select(`${MESSAGE_FIELDS}`)
      .eq('conversation_id', row.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const last = (lastMsg as Message | null) ?? null;
    views.push({
      id: row.id,
      userId: row.user.id,
      userName: row.user.name,
      avatarUrl: row.user.avatar_url ?? '',
      online: row.user.online,
      unreadCount: row.unread_count,
      lastMessage: summarizeMessage(last),
      lastMessageTime: last ? formatTime(last.created_at) : formatTime(row.created_at),
      lastMessageAt: last ? last.created_at : row.created_at,
      locked: row.locked,
      lockPinHash: row.lock_pin_hash,
      blocked: row.blocked,
      pairId: row.pair_id,
    });
  }

  // Sort by most recent message first
  views.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  return views;
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_FIELDS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendTextMessage(
  conversationId: string,
  text: string
): Promise<Message> {
  const { data: userData } = await supabase.auth.getUser();
  const senderId = userData.user?.id;
  if (!senderId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      text,
    })
    .select(MESSAGE_FIELDS)
    .single();

  if (error) throw error;
  return data as Message;
}

function fileExtension(file: File): string {
  const parts = file.name.split('.');
  if (parts.length > 1) return parts.pop()!.toLowerCase();
  return 'bin';
}

export async function uploadMedia(
  file: File,
  mediaType: MediaType
): Promise<{ path: string; url: string; duration: number | null }> {
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error('Not authenticated');

  const ext = fileExtension(file);
  const fileName = `${crypto.randomUUID()}.${ext}`;
  const filePath = `${ownerId}/${fileName}`;

  const { error: upErr } = await supabase.storage
    .from('chat-media')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (upErr) throw upErr;

  const { data: urlData } = await supabase.storage
    .from('chat-media')
    .createSignedUrl(filePath, 60 * 60 * 24 * 365);

  if (!urlData?.signedUrl) throw new Error('Failed to create signed URL for media');

  let duration: number | null = null;
  if (mediaType === 'audio' || mediaType === 'video') {
    duration = await getMediaDuration(file, mediaType).catch(() => null);
  }

  return { path: filePath, url: urlData.signedUrl, duration };
}

function getMediaDuration(file: File, type: MediaType): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(type === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Math.round(el.duration) || 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read media duration'));
    };
    el.src = url;
  });
}

export async function sendMediaMessage(
  conversationId: string,
  file: File,
  mediaType: MediaType,
  caption?: string
): Promise<Message> {
  const { url, duration } = await uploadMedia(file, mediaType);

  const { data: userData } = await supabase.auth.getUser();
  const senderId = userData.user?.id;
  if (!senderId) throw new Error('Not authenticated');

  const isFile = mediaType === 'file';
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      text: caption?.trim() || null,
      media_url: url,
      media_type: mediaType,
      duration,
      file_name: isFile ? file.name : null,
      file_size: isFile ? file.size : null,
    })
    .select(MESSAGE_FIELDS)
    .single();

  if (error) throw error;
  return data as Message;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ unread_count: 0 })
    .eq('id', conversationId);
  if (error) throw error;
}

export async function setConversationLock(
  conversationId: string,
  pin: string
): Promise<void> {
  const pinHash = await hashPin(pin);
  const { error } = await supabase
    .from('conversations')
    .update({ locked: true, lock_pin_hash: pinHash })
    .eq('id', conversationId);
  if (error) throw error;
}

export async function removeConversationLock(
  conversationId: string
): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ locked: false, lock_pin_hash: null })
    .eq('id', conversationId);
  if (error) throw error;
}

export async function blockConversation(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ blocked: true })
    .eq('id', conversationId);
  if (error) throw error;
}

export async function unblockConversation(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ blocked: false })
    .eq('id', conversationId);
  if (error) throw error;
}

export interface AvailableContact {
  id: string;
  name: string;
  avatar_url: string | null;
  online: boolean;
}

export async function fetchAvailableContacts(): Promise<AvailableContact[]> {
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData.user?.id;
  if (!myId) throw new Error('Not authenticated');

  const { data: convos } = await supabase
    .from('conversations')
    .select('user_id')
    .eq('owner_id', myId);

  const existingIds = new Set((convos ?? []).map((c: { user_id: string }) => c.user_id));

  const { data, error } = await supabase
    .from('users')
    .select('id, name, avatar_url, online')
    .neq('id', myId)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).filter((u) => !existingIds.has(u.id)) as AvailableContact[];
}

export async function createConversation(contactId: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const myId = userData.user?.id;
  if (!myId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('conversations')
    .insert({ owner_id: myId, user_id: contactId, unread_count: 0 })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export async function sendCallSignal(
  pairId: string,
  type: CallSignalType,
  payload: Record<string, unknown> | null
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const senderId = userData.user?.id;
  if (!senderId) throw new Error('Not authenticated');

  const { error } = await supabase.from('call_signals').insert({
    pair_id: pairId,
    sender_id: senderId,
    type,
    payload,
  });
  if (error) throw error;
}

export async function fetchCallSignals(pairId: string): Promise<CallSignal[]> {
  const { data, error } = await supabase
    .from('call_signals')
    .select('id, pair_id, sender_id, type, payload, created_at')
    .eq('pair_id', pairId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CallSignal[];
}

export async function deleteCallSignal(id: string): Promise<void> {
  const { error } = await supabase.from('call_signals').delete().eq('id', id);
  if (error) throw error;
}

export function subscribeToCallSignals(
  pairId: string,
  onSignal: (signal: CallSignal) => void
) {
  return supabase
    .channel(`call_signals:pair_id=eq.${pairId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `pair_id=eq.${pairId}` },
      (payload) => onSignal(payload.new as CallSignal)
    )
    .subscribe();
}

export function subscribeToMessages(
  conversationId: string,
  onMessage: (message: Message) => void
) {
  return supabase
    .channel(`messages:conversation_id=eq.${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessage(payload.new as Message)
    )
    .subscribe();
}

export async function fetchProfile(): Promise<Profile | null> {
  const { data: userData } = await supabase.auth.getUser();
  const id = userData.user?.id;
  if (!id) return null;

  const { data, error } = await supabase
    .from('users')
    .select('id, name, avatar_url, bio')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    avatarUrl: data.avatar_url,
    bio: data.bio,
  };
}

export async function updateProfile(
  updates: { name?: string; bio?: string | null; avatarUrl?: string | null }
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const id = userData.user?.id;
  if (!id) throw new Error('Not authenticated');

  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.bio !== undefined) patch.bio = updates.bio;
  if (updates.avatarUrl !== undefined) patch.avatar_url = updates.avatarUrl;

  const { error } = await supabase.from('users').update(patch).eq('id', id);
  if (error) throw error;
}

export async function uploadAvatar(file: File): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error('Not authenticated');

  const ext = fileExtension(file);
  const filePath = `${ownerId}/avatar-${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('chat-media')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || undefined,
    });

  if (upErr) throw upErr;

  const { data: urlData } = await supabase.storage
    .from('chat-media')
    .createSignedUrl(filePath, 60 * 60 * 24 * 365);

  if (!urlData?.signedUrl) throw new Error('Failed to create signed URL for avatar');
  return urlData.signedUrl;
}
