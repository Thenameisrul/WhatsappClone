import { useEffect, useRef, useState } from 'react';
import {
  Send,
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Lock,
  Unlock,
  Paperclip,
  Image as ImageIcon,
  Mic,
  X,
  Ban,
  ShieldOff,
  FileText,
  Download,
} from 'lucide-react';
import type { ConversationView, Message, CallMode } from '@/types';
import { formatMessageTime } from '@/chatApi';
import AudioPlayer from '@/components/AudioPlayer';
import AudioRecorder from '@/components/AudioRecorder';

interface ChatWindowProps {
  conversation: ConversationView | null;
  messages: Message[];
  onSendText: (text: string) => void;
  onSendMedia: (file: File, type: 'image' | 'video' | 'audio' | 'file', duration?: number) => void;
  onBack: () => void;
  currentUserId: string | null;
  loading?: boolean;
  unlocked: Record<string, boolean>;
  onRequestUnlock: (conversationId: string) => void;
  onRequestLock: (conversationId: string) => void;
  onRequestRemoveLock: (conversationId: string) => void;
  onStartCall: (mode: CallMode) => void;
  onBlock: (conversationId: string) => void;
  onUnblock: (conversationId: string) => void;
}

export default function ChatWindow({
  conversation,
  messages,
  onSendText,
  onSendMedia,
  onBack,
  currentUserId,
  loading,
  unlocked,
  onRequestUnlock,
  onRequestLock,
  onRequestRemoveLock,
  onStartCall,
  onBlock,
  onUnblock,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    setMenuOpen(false);
    setAttachOpen(false);
    setRecording(false);
  }, [conversation?.id]);

  if (!conversation) {
    return (
      <section className="flex-1 hidden md:flex flex-col items-center justify-center bg-slate-50 text-slate-400">
        <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center mb-4">
          <Send className="w-7 h-7 text-slate-400" />
        </div>
        <p className="text-sm">Select a conversation to start chatting</p>
      </section>
    );
  }

  const isLocked = conversation.locked && !unlocked[conversation.id];
  const isBlocked = conversation.blocked;

  const handleSendText = () => {
    const text = draft.trim();
    if (!text) return;
    onSendText(text);
    setDraft('');
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onSendMedia(file, 'image');
    e.target.value = '';
    setAttachOpen(false);
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onSendMedia(file, 'video');
    e.target.value = '';
    setAttachOpen(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onSendMedia(file, 'file');
    e.target.value = '';
    setAttachOpen(false);
  };

  const formatFileSize = (bytes: number | null): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleVoiceSend = (file: File, duration: number) => {
    onSendMedia(file, 'audio', duration);
    setRecording(false);
  };

  return (
    <section className="flex-1 flex flex-col bg-slate-50 h-full relative">
      {/* Image preview overlay */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <button className="absolute top-4 right-4 text-white/80 hover:text-white p-2">
            <X className="w-6 h-6" />
          </button>
          <img src={preview} alt="Preview" className="max-w-full max-h-full rounded-lg" />
        </div>
      )}

      <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
        <button
          onClick={onBack}
          className="md:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img
          src={conversation.avatarUrl}
          alt={conversation.userName}
          className="w-10 h-10 rounded-full object-cover"
        />
        <div className="flex-1 min-w-0">
          <h2 className="flex items-center gap-1.5 font-semibold text-slate-800 truncate">
            {conversation.locked && (
              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <span className="truncate">{conversation.userName}</span>
          </h2>
          <p className="text-xs text-slate-400">
            {conversation.online ? 'Active now' : 'Offline'}
          </p>
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          {!isBlocked && (
            <>
              <button
                onClick={() => onStartCall('audio')}
                className="p-2 rounded-lg hover:bg-slate-100 transition"
                title="Audio call"
              >
                <Phone className="w-5 h-5" />
              </button>
              <button
                onClick={() => onStartCall('video')}
                className="p-2 rounded-lg hover:bg-slate-100 transition"
                title="Video call"
              >
                <Video className="w-5 h-5" />
              </button>
            </>
          )}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-2 rounded-lg hover:bg-slate-100 transition"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1">
                  {!isBlocked && !conversation.locked && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onRequestLock(conversation.id);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition text-left"
                    >
                      <Lock className="w-4 h-4 text-slate-400" />
                      Lock chat
                    </button>
                  )}
                  {!isBlocked && conversation.locked && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onRequestRemoveLock(conversation.id);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition text-left"
                    >
                      <Unlock className="w-4 h-4 text-slate-400" />
                      Remove lock
                    </button>
                  )}
                  {!isBlocked && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onBlock(conversation.id);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition text-left"
                    >
                      <Ban className="w-4 h-4" />
                      Block chat
                    </button>
                  )}
                  {isBlocked && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onUnblock(conversation.id);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition text-left"
                    >
                      <ShieldOff className="w-4 h-4 text-slate-400" />
                      Unblock chat
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {isBlocked ? (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <Ban className="w-7 h-7 text-red-400" />
            </div>
            <h3 className="text-base font-medium text-slate-700 mb-1">
              You blocked this chat
            </h3>
            <p className="text-sm text-slate-400 mb-5 max-w-xs">
              Messages from this contact are hidden. Unblock to start chatting again.
            </p>
            <button
              onClick={() => onUnblock(conversation.id)}
              className="px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition"
            >
              Unblock
            </button>
          </div>
        </div>
      ) : isLocked ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center mb-4">
            <Lock className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="text-base font-medium text-slate-700 mb-1">
            This chat is locked
          </h3>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">
            Enter your PIN to view messages and send new ones.
          </p>
          <button
            onClick={() => onRequestUnlock(conversation.id)}
            className="px-5 py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition"
          >
            Enter PIN to unlock
          </button>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-3">
            {loading ? (
              <p className="text-center text-sm text-slate-400 mt-10">Loading messages...</p>
            ) : messages.length === 0 ? (
              <p className="text-center text-sm text-slate-400 mt-10">
                No messages yet. Say hello!
              </p>
            ) : (
              messages.map((m) => {
                const mine = m.sender_id === currentUserId;
                return (
                  <div
                    key={m.id}
                    className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                        mine
                          ? 'bg-blue-500 text-white rounded-br-md'
                          : 'bg-white text-slate-700 border border-slate-200 rounded-bl-md'
                      }`}
                    >
                      {m.media_type === 'image' && m.media_url && (
                        <button onClick={() => setPreview(m.media_url)} className="block mb-1">
                          <img
                            src={m.media_url}
                            alt="Photo"
                            className="rounded-xl max-w-full max-h-60 object-cover"
                          />
                        </button>
                      )}
                      {m.media_type === 'video' && m.media_url && (
                        <video
                          src={m.media_url}
                          controls
                          className="rounded-xl max-w-full max-h-60"
                        />
                      )}
                      {m.media_type === 'audio' && m.media_url && (
                        <AudioPlayer src={m.media_url} duration={m.duration} mine={mine} />
                      )}
                      {m.media_type === 'file' && m.media_url && (
                        <a
                          href={m.media_url}
                          download={m.file_name ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-3 p-3 rounded-xl mb-1 transition ${
                            mine
                              ? 'bg-blue-600/20 hover:bg-blue-600/30'
                              : 'bg-slate-50 hover:bg-slate-100'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                            mine ? 'bg-blue-500/30' : 'bg-slate-200'
                          }`}>
                            <FileText className={`w-5 h-5 ${mine ? 'text-blue-100' : 'text-slate-500'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${
                              mine ? 'text-white' : 'text-slate-700'
                            }`}>
                              {m.file_name ?? 'File'}
                            </p>
                            {m.file_size != null && (
                              <p className={`text-xs ${mine ? 'text-blue-100' : 'text-slate-400'}`}>
                                {formatFileSize(m.file_size)}
                              </p>
                            )}
                          </div>
                          <Download className={`w-4 h-4 shrink-0 ${
                            mine ? 'text-blue-100' : 'text-slate-400'
                          }`} />
                        </a>
                      )}
                      {m.text && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {m.text}
                        </p>
                      )}
                      <p
                        className={`text-[10px] mt-1 ${
                          mine ? 'text-blue-100' : 'text-slate-400'
                        }`}
                      >
                        {formatMessageTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {recording ? (
            <AudioRecorder onSend={handleVoiceSend} onCancel={() => setRecording(false)} />
          ) : (
            <div className="px-4 py-3 bg-white border-t border-slate-200 relative">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoSelect}
                className="hidden"
              />
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
              />
              {attachOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAttachOpen(false)} />
                  <div className="absolute bottom-full left-4 mb-2 z-20 bg-white rounded-xl shadow-lg border border-slate-200 py-1 w-44">
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition text-left"
                    >
                      <ImageIcon className="w-4 h-4 text-blue-500" />
                      Photo
                    </button>
                    <button
                      onClick={() => videoInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition text-left"
                    >
                      <Video className="w-4 h-4 text-purple-500" />
                      Video
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition text-left"
                    >
                      <FileText className="w-4 h-4 text-emerald-500" />
                      Document
                    </button>
                  </div>
                </>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAttachOpen((v) => !v)}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 transition"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendText();
                    }
                  }}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2.5 text-sm rounded-full bg-slate-100 border border-transparent focus:bg-white focus:border-slate-300 focus:outline-none transition"
                />
                <button
                  onClick={() => setRecording(true)}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 transition"
                  title="Voice message"
                >
                  <Mic className="w-5 h-5" />
                </button>
                <button
                  onClick={handleSendText}
                  disabled={!draft.trim()}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
