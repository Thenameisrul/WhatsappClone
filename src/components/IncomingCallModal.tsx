import { Phone, PhoneOff, Video } from 'lucide-react';

interface IncomingCallModalProps {
  contactName: string;
  contactAvatar: string;
  mode: 'audio' | 'video';
  onAccept: () => void;
  onReject: () => void;
}

export default function IncomingCallModal({
  contactName,
  contactAvatar,
  mode,
  onAccept,
  onReject,
}: IncomingCallModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="flex flex-col items-center px-6 pt-8 pb-6">
          <div className="relative">
            <img
              src={contactAvatar}
              alt={contactName}
              className="w-24 h-24 rounded-full object-cover ring-2 ring-slate-100"
            />
            <div className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-green-500 flex items-center justify-center ring-4 ring-white animate-pulse">
              {mode === 'video' ? (
                <Video className="w-4 h-4 text-white" />
              ) : (
                <Phone className="w-4 h-4 text-white" />
              )}
            </div>
          </div>
          <h2 className="text-lg font-semibold text-slate-800 mt-4">{contactName}</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Incoming {mode === 'video' ? 'video' : 'audio'} call...
          </p>
        </div>

        <div className="flex items-center gap-3 px-6 pb-6">
          <button
            onClick={onReject}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 font-medium hover:bg-red-100 transition"
          >
            <PhoneOff className="w-5 h-5" />
            Decline
          </button>
          <button
            onClick={onAccept}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500 text-white font-medium hover:bg-green-600 transition"
          >
            <Phone className="w-5 h-5" />
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
