import { useEffect, useRef, useState } from 'react';
import { Lock, Unlock, X } from 'lucide-react';

interface PinModalProps {
  mode: 'set' | 'enter' | 'remove';
  conversationName: string;
  onSubmit: (pin: string) => Promise<void>;
  onClose: () => void;
}

export default function PinModal({
  mode,
  conversationName,
  onSubmit,
  onClose,
}: PinModalProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const title =
    mode === 'set' ? 'Lock conversation' :
    mode === 'enter' ? 'Enter PIN' :
    'Remove lock';
  const subtitle =
    mode === 'set' ? `Set a PIN to lock your chat with ${conversationName}`
    : mode === 'enter' ? `Unlock your chat with ${conversationName}`
    : `Enter the PIN to remove the lock on ${conversationName}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pin.length < 4) {
      setError('PIN must be at least 4 digits.');
      return;
    }
    if (mode === 'set' && pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }

    setBusy(true);
    try {
      await onSubmit(pin);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wrong PIN.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-start justify-between mb-5">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
            {mode === 'remove' ? (
              <Unlock className="w-5 h-5 text-blue-600" />
            ) : (
              <Lock className="w-5 h-5 text-blue-600" />
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500 mt-1 mb-5">{subtitle}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter PIN"
            className="w-full px-3.5 py-2.5 text-center text-lg tracking-[0.5em] rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
          />
          {mode === 'set' && (
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Confirm PIN"
              className="w-full px-3.5 py-2.5 text-center text-lg tracking-[0.5em] rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
            />
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || pin.length < 4}
            className="w-full py-2.5 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {busy ? 'Please wait...' : mode === 'set' ? 'Lock chat' : mode === 'enter' ? 'Unlock' : 'Remove lock'}
          </button>
        </form>
      </div>
    </div>
  );
}
