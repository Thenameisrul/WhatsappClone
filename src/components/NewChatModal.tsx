import { useState } from 'react';
import { X, Search, UserPlus, Loader2, AtSign, UserCircle2 } from 'lucide-react';
import { findUserByUsername, type AvailableContact } from '@/chatApi';

interface NewChatModalProps {
  onClose: () => void;
  onSelectContact: (contactId: string) => void;
}

export default function NewChatModal({ onClose, onSelectContact }: NewChatModalProps) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<AvailableContact | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    setResult(null);
    setSearched(false);
    try {
      const user = await findUserByUsername(query);
      setResult(user);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = (contactId: string) => {
    setCreating(true);
    onSelectContact(contactId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-slate-800">New chat</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-200">
          <form onSubmit={handleSearch}>
            <div className="relative">
              <AtSign className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter a username to start a chat"
                autoFocus
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-slate-100 border border-transparent focus:bg-white focus:border-slate-300 focus:outline-none transition"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="w-full mt-3 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {searching ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Find user
                </>
              )}
            </button>
          </form>
          <p className="text-xs text-slate-400 mt-2">
            Search for someone by their exact username to start a conversation.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {error ? (
            <p className="text-sm text-red-600 px-5 py-6">{error}</p>
          ) : searching ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            </div>
          ) : result ? (
            <button
              onClick={() => handleSelect(result.id)}
              disabled={creating}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50 disabled:opacity-50 transition"
            >
              <div className="relative shrink-0">
                {result.avatar_url ? (
                  <img
                    src={result.avatar_url}
                    alt={result.name}
                    className="w-11 h-11 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-medium">
                    {result.name.charAt(0).toUpperCase()}
                  </div>
                )}
                {result.online && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 truncate">{result.name}</p>
                {result.username && (
                  <p className="text-xs text-slate-400 truncate">@{result.username}</p>
                )}
              </div>
              {creating && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
            </button>
          ) : searched ? (
            <div className="flex flex-col items-center justify-center py-10 px-5 text-center">
              <UserCircle2 className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-sm text-slate-500">No user found with that username.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 px-5 text-center">
              <Search className="w-8 h-8 text-slate-300 mb-2" />
              <p className="text-sm text-slate-400">
                Enter a username above to find someone to chat with.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
