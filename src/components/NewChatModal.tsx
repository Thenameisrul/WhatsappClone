import { useEffect, useState } from 'react';
import { X, Search, UserPlus, Loader2 } from 'lucide-react';
import { fetchAvailableContacts, type AvailableContact } from '@/chatApi';

interface NewChatModalProps {
  onClose: () => void;
  onSelectContact: (contactId: string) => void;
}

export default function NewChatModal({ onClose, onSelectContact }: NewChatModalProps) {
  const [contacts, setContacts] = useState<AvailableContact[]>([]);
  const [filtered, setFiltered] = useState<AvailableContact[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchAvailableContacts();
        if (cancelled) return;
        setContacts(list);
        setFiltered(list);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load contacts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(contacts.filter((c) => c.name.toLowerCase().includes(q)));
  }, [search, contacts]);

  const handleSelect = (contactId: string) => {
    setCreating(contactId);
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

        <div className="px-5 py-3 border-b border-slate-200">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-slate-100 border border-transparent focus:bg-white focus:border-slate-300 focus:outline-none transition"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 px-5 py-6">{error}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-400 px-5 py-6">
              {search ? 'No contacts match your search.' : 'No new contacts available.'}
            </p>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c.id)}
                disabled={creating !== null}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 disabled:opacity-50 transition"
              >
                <div className="relative shrink-0">
                  {c.avatar_url ? (
                    <img
                      src={c.avatar_url}
                      alt={c.name}
                      className="w-11 h-11 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-medium">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {c.online && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.online ? 'Active now' : 'Offline'}</p>
                </div>
                {creating === c.id && (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
