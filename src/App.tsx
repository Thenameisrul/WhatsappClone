import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatWindow from '@/components/ChatWindow';
import AuthScreen from '@/components/AuthScreen';
import PinModal from '@/components/PinModal';
import CallScreen from '@/components/CallScreen';
import SettingsModal from '@/components/SettingsModal';
import NewChatModal from '@/components/NewChatModal';
import IncomingCallModal from '@/components/IncomingCallModal';
import {
  fetchConversations,
  fetchMessages,
  sendTextMessage,
  sendMediaMessage,
  markConversationRead,
  setConversationLock,
  removeConversationLock,
  blockConversation,
  unblockConversation,
  deleteConversation,
  createConversation,
  hashPin,
  sendCallSignal,
  deleteCallSignal,
} from '@/chatApi';
import { supabase } from '@/supabaseClient';
import { playMessageSound, playCallSound, unlockAudio } from '@/notificationSound';
import type { ConversationView, Message, CallMode, CallSignal } from '@/types';

type PinMode = 'set' | 'enter' | 'remove';

interface ActiveCall {
  mode: CallMode;
  contactName: string;
  contactAvatar: string;
  pairId: string;
  direction: 'outgoing' | 'incoming';
  initialOffer?: RTCSessionDescriptionInit;
}

interface IncomingCall {
  signalId: string;
  pairId: string;
  senderId: string;
  contactName: string;
  contactAvatar: string;
  mode: CallMode;
  offer: RTCSessionDescriptionInit;
}

export default function App() {
  const [session, setSession] = useState<boolean | null>(null);
  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [pinModal, setPinModal] = useState<{ conversationId: string; mode: PinMode } | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);

  const conversationsRef = useRef<ConversationView[]>([]);
  conversationsRef.current = conversations;
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(!!data.session);
      setCurrentUserId(data.session?.user?.id ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(!!sess);
      setCurrentUserId(sess?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      setLoading(true);
      const convos = await fetchConversations();
      setConversations(convos);
      if (convos.length > 0 && !selectedIdRef.current) setSelectedId(convos[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  }, []);

  // Unlock Web Audio on first user interaction (browsers block audio until then)
  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);

  useEffect(() => {
    if (session === true) {
      setMobileOpen(false);
      loadConversations();
    } else if (session === false) {
      setConversations([]);
      setMessages([]);
      setSelectedId(null);
      setUnlocked({});
      setLoading(false);
    }
  }, [session, loadConversations]);

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId]
  );

  // Load messages when conversation selected
  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    const convo = conversations.find((c) => c.id === selectedId);
    if (convo?.locked && !unlocked[selectedId]) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const msgs = await fetchMessages(selectedId);
        if (!cancelled) setMessages(msgs);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load messages');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, unlocked, conversations]);

  // Real-time: subscribe to new messages in the selected conversation
  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase
      .channel(`messages:conversation_id=eq.${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  // Real-time: subscribe to new messages across ALL owned conversations
  // (for notification sounds + sidebar preview updates + unread badges)
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel('messages:all')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const msg = payload.new as Message;
          // Ignore messages I sent (they are mirrored, but sender_id is mine)
          if (msg.sender_id === currentUserId) return;
          // Find the conversation this message belongs to (my copy)
          const convo = conversationsRef.current.find((c) => c.id === msg.conversation_id);
          if (!convo) return;

          // Play notification sound (unless this is the currently open chat)
          if (selectedIdRef.current !== convo.id) {
            playMessageSound();
          }

          // Update sidebar: preview, timestamp, unread count, and re-sort
          setConversations((prev) => {
            const updated = prev.map((c) =>
              c.id === convo.id
                ? {
                    ...c,
                    lastMessage: msg.text || (msg.media_type === 'image' ? '📷 Photo' : msg.media_type === 'video' ? '🎥 Video' : msg.media_type === 'audio' ? '🎤 Voice message' : '📎 File'),
                    lastMessageTime: new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                    lastMessageAt: msg.created_at,
                    unreadCount: selectedIdRef.current === c.id ? 0 : c.unreadCount + 1,
                  }
                : c
            );
            // Re-sort so the most recent conversation is at the top
            updated.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // Real-time: subscribe to new conversations (auto-created reverse conversations)
  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel('conversations:new')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversations', filter: `owner_id=eq.${currentUserId}` },
        () => {
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, loadConversations]);

  // Real-time: subscribe to call signals for ALL conversations (incoming calls)
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel('call_signals:all')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_signals' },
        async (payload) => {
          const signal = payload.new as CallSignal;
          if (signal.sender_id === currentUserId) return; // ignore our own
          if (signal.type !== 'offer') return; // only offers trigger incoming call UI

          // Play the call ringtone
          playCallSound();

          // Find the conversation this signal belongs to
          const convo = conversationsRef.current.find((c) => c.pairId === signal.pairId);
          if (!convo) {
            // Conversation may not be loaded yet; reload then check
            await loadConversations();
            const updated = conversationsRef.current.find((c) => c.pairId === signal.pairId);
            if (!updated) return;
            const offerPayload2 = signal.payload as unknown as RTCSessionDescriptionInit;
            if (!offerPayload2) return;
            setIncomingCall({
              signalId: signal.id,
              pairId: signal.pairId,
              senderId: signal.sender_id,
              contactName: updated.userName,
              contactAvatar: updated.avatarUrl,
              mode: detectCallMode(offerPayload2),
              offer: offerPayload2,
            });
            return;
          }

          const offerPayload = signal.payload as unknown as RTCSessionDescriptionInit;
          if (!offerPayload) return;

          setIncomingCall({
            signalId: signal.id,
            pairId: signal.pairId,
            senderId: signal.sender_id,
            contactName: convo.userName,
            contactAvatar: convo.avatarUrl,
            mode: detectCallMode(offerPayload),
            offer: offerPayload,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, loadConversations]);

  // Determine call mode from the offer SDP (video if it has video)
  const detectCallMode = useCallback((offer: RTCSessionDescriptionInit): CallMode => {
    return offer.sdp?.includes('m=video') ? 'video' : 'audio';
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedIdRef.current === id) {
        setSelectedId(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversation');
    }
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setMobileOpen(true);
    markConversationRead(id).catch(() => {});
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const handleSendText = useCallback(
    (text: string) => {
      if (!selectedId) return;
      sendTextMessage(selectedId, text)
        .then((msg) => {
          setMessages((prev) => [...prev, msg]);
          setConversations((prev) => {
            const updated = prev.map((c) =>
              c.id === selectedId
                ? {
                    ...c,
                    lastMessage: text,
                    lastMessageTime: new Date(msg.created_at).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    }),
                    lastMessageAt: msg.created_at,
                  }
                : c
            );
            updated.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
            return updated;
          });
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to send message'));
    },
    [selectedId]
  );

  const handleSendMedia = useCallback(
    (file: File, type: 'image' | 'video' | 'audio' | 'file', duration?: number) => {
      if (!selectedId) return;
      sendMediaMessage(selectedId, file, type)
        .then((msg) => {
          setMessages((prev) => [...prev, msg]);
          const preview =
            type === 'image'
              ? '📷 Photo'
              : type === 'video'
              ? '🎥 Video'
              : type === 'audio'
              ? '🎤 Voice message'
              : `📎 ${file.name}`;
          setConversations((prev) => {
            const updated = prev.map((c) =>
              c.id === selectedId
                ? {
                    ...c,
                    lastMessage: preview,
                    lastMessageTime: new Date(msg.created_at).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    }),
                    lastMessageAt: msg.created_at,
                  }
                : c
            );
            updated.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
            return updated;
          });
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to send media'));
    },
    [selectedId]
  );

  const handleStartCall = useCallback(
    (mode: CallMode) => {
      if (!selected || !selected.pairId) {
        setError('Cannot place call — conversation not paired.');
        return;
      }
      setActiveCall({
        mode,
        contactName: selected.userName,
        contactAvatar: selected.avatarUrl,
        pairId: selected.pairId,
        direction: 'outgoing',
      });
    },
    [selected]
  );

  const handleAcceptCall = useCallback(() => {
    if (!incomingCall) return;
    const mode = detectCallMode(incomingCall.offer);
    setActiveCall({
      mode,
      contactName: incomingCall.contactName,
      contactAvatar: incomingCall.contactAvatar,
      pairId: incomingCall.pairId,
      direction: 'incoming',
      initialOffer: incomingCall.offer,
    });
    deleteCallSignal(incomingCall.signalId).catch(() => {});
    setIncomingCall(null);
  }, [incomingCall]);

  const handleRejectCall = useCallback(() => {
    if (!incomingCall) return;
    sendCallSignal(incomingCall.pairId, 'reject', null).catch(() => {});
    deleteCallSignal(incomingCall.signalId).catch(() => {});
    setIncomingCall(null);
  }, [incomingCall]);

  const handleEndCall = useCallback(() => {
    setActiveCall(null);
  }, []);

  const handleBlock = useCallback(
    async (conversationId: string) => {
      try {
        await blockConversation(conversationId);
        const convos = await fetchConversations();
        setConversations(convos);
        setMessages([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to block chat');
      }
    },
    []
  );

  const handleUnblock = useCallback(
    async (conversationId: string) => {
      try {
        await unblockConversation(conversationId);
        const convos = await fetchConversations();
        setConversations(convos);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to unblock chat');
      }
    },
    []
  );

  const handleNewChat = useCallback(
    async (contactId: string) => {
      try {
        const newId = await createConversation(contactId);
        const convos = await fetchConversations();
        setConversations(convos);
        setSelectedId(newId);
        setMobileOpen(true);
        setNewChatOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create chat');
        setNewChatOpen(false);
      }
    },
    []
  );

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const openLockModal = useCallback((conversationId: string) => {
    setPinModal({ conversationId, mode: 'set' });
  }, []);

  const openUnlockModal = useCallback((conversationId: string) => {
    setPinModal({ conversationId, mode: 'enter' });
  }, []);

  const openRemoveLockModal = useCallback((conversationId: string) => {
    setPinModal({ conversationId, mode: 'remove' });
  }, []);

  const handlePinSubmit = useCallback(
    async (pin: string) => {
      if (!pinModal) return;
      const { conversationId, mode } = pinModal;
      const convo = conversations.find((c) => c.id === conversationId);
      if (!convo) throw new Error('Conversation not found');

      if (mode === 'set') {
        await setConversationLock(conversationId, pin);
        const convos = await fetchConversations();
        setConversations(convos);
        setUnlocked((prev) => {
          const next = { ...prev };
          delete next[conversationId];
          return next;
        });
        setMessages([]);
      } else {
        const enteredHash = await hashPin(pin);
        if (enteredHash !== convo.lockPinHash) {
          throw new Error('Incorrect PIN.');
        }
        if (mode === 'enter') {
          setUnlocked((prev) => ({ ...prev, [conversationId]: true }));
        } else if (mode === 'remove') {
          await removeConversationLock(conversationId);
          const convos = await fetchConversations();
          setConversations(convos);
          setUnlocked((prev) => {
            const next = { ...prev };
            delete next[conversationId];
            return next;
          });
        }
      }
    },
    [pinModal, conversations]
  );

  if (session === null) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-100 text-slate-400">
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  if (session === false) {
    return <AuthScreen onAuthed={() => setSession(true)} />;
  }

  const pinModalConvo = pinModal
    ? conversations.find((c) => c.id === pinModal.conversationId) ?? null
    : null;

  return (
    <div className="h-screen w-full flex bg-slate-100 overflow-hidden">
      {error && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg shadow">
          {error}
        </div>
      )}
      <div className={`${mobileOpen ? 'hidden' : 'flex'} md:flex w-full md:w-auto h-full`}>
        <div className="flex flex-col h-full w-full md:w-80 lg:w-96">
          <Sidebar
            conversations={conversations}
            selectedId={selectedId}
            onSelect={handleSelect}
            search={search}
            onSearchChange={setSearch}
            onOpenSettings={() => setSettingsOpen(true)}
            onNewChat={() => setNewChatOpen(true)}
            onDeleteConversation={handleDeleteConversation}
          />
        </div>
      </div>
      <div className={`${mobileOpen ? 'flex' : 'hidden'} md:flex flex-1 h-full`}>
        <ChatWindow
          conversation={selected}
          messages={messages}
          onSendText={handleSendText}
          onSendMedia={handleSendMedia}
          onBack={() => setMobileOpen(false)}
          currentUserId={currentUserId}
          loading={loading}
          unlocked={unlocked}
          onRequestUnlock={openUnlockModal}
          onRequestLock={openLockModal}
          onRequestRemoveLock={openRemoveLockModal}
          onStartCall={handleStartCall}
          onBlock={handleBlock}
          onUnblock={handleUnblock}
        />
      </div>

      {pinModal && pinModalConvo && (
        <PinModal
          mode={pinModal.mode}
          conversationName={pinModalConvo.userName}
          onSubmit={handlePinSubmit}
          onClose={() => setPinModal(null)}
        />
      )}

      {incomingCall && !activeCall && (
        <IncomingCallModal
          contactName={incomingCall.contactName}
          contactAvatar={incomingCall.contactAvatar}
          mode={detectCallMode(incomingCall.offer)}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}

      {activeCall && currentUserId && (
        <CallScreen
          mode={activeCall.mode}
          contactName={activeCall.contactName}
          contactAvatar={activeCall.contactAvatar}
          pairId={activeCall.pairId}
          currentUserId={currentUserId}
          direction={activeCall.direction}
          initialOffer={activeCall.initialOffer}
          onEnd={handleEndCall}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onSignOut={async () => {
            setSettingsOpen(false);
            await handleSignOut();
          }}
        />
      )}

      {newChatOpen && (
        <NewChatModal
          onClose={() => setNewChatOpen(false)}
          onSelectContact={handleNewChat}
        />
      )}
    </div>
  );
}
