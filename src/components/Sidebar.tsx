import { useRef, useState, useEffect } from 'react';
import { Lock, Search, Settings, SquarePen, Ban, Trash2, MoreVertical } from 'lucide-react';
import type { ConversationView } from '@/types';

interface SidebarProps {
  conversations: ConversationView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
}

export default function Sidebar({
  conversations,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  onOpenSettings,
  onNewChat,
  onDeleteConversation,
}: SidebarProps) {
  const filtered = conversations.filter((c) =>
    c.userName.toLowerCase().includes(search.toLowerCase())
  );

  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuId]);

  return (
    <aside className="w-full md:w-80 lg:w-96 flex flex-col bg-white border-r border-slate-200 h-full">
      <div className="px-5 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-semibold text-slate-800">Messages</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={onNewChat}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
              title="New chat"
            >
              <SquarePen className="w-5 h-5" />
            </button>
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search conversations"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-slate-100 border border-transparent focus:bg-white focus:border-slate-300 focus:outline-none transition"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400 px-5 py-6">No conversations found.</p>
        ) : (
          filtered.map((c) => {
            const active = c.id === selectedId;
            const menuOpen = menuId === c.id;
            return (
              <div
                key={c.id}
                className={`relative w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-2 cursor-pointer group ${
                  active
                    ? 'bg-blue-50 border-blue-500'
                    : 'border-transparent hover:bg-slate-50'
                }`}
                onClick={() => onSelect(c.id)}
              >
                <div className="relative shrink-0">
                  <img
                    src={c.avatarUrl}
                    alt={c.userName}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                  {c.online && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium text-slate-800 truncate">
                      {c.locked && (
                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      {c.blocked && (
                        <Ban className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      )}
                      <span className={`truncate ${c.blocked ? 'text-slate-400' : ''}`}>{c.userName}</span>
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">
                      {c.lastMessageTime}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-sm text-slate-500 truncate">
                      {c.blocked ? 'Blocked' : c.locked ? 'Locked chat' : c.lastMessage}
                    </p>
                    {c.unreadCount > 0 && !c.locked && !c.blocked && (
                      <span className="shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center text-xs font-medium text-white bg-blue-500 rounded-full">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* More menu button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuId(menuOpen ? null : c.id);
                  }}
                  className={`p-1.5 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition shrink-0 ${
                    menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  title="More options"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {/* Dropdown menu */}
                {menuOpen && (
                  <div
                    ref={menuRef}
                    className="absolute right-2 top-12 z-20 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setMenuId(null);
                        onDeleteConversation(c.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete chat
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
