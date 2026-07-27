import { Lock, Search, Settings, SquarePen, Ban } from 'lucide-react';
import type { ConversationView } from '@/types';

interface SidebarProps {
  conversations: ConversationView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onOpenSettings: () => void;
  onNewChat: () => void;
}

export default function Sidebar({
  conversations,
  selectedId,
  onSelect,
  search,
  onSearchChange,
  onOpenSettings,
  onNewChat,
}: SidebarProps) {
  const filtered = conversations.filter((c) =>
    c.userName.toLowerCase().includes(search.toLowerCase())
  );

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
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-2 ${
                  active
                    ? 'bg-blue-50 border-blue-500'
                    : 'border-transparent hover:bg-slate-50'
                }`}
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
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
