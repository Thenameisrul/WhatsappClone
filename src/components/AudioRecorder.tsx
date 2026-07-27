import { useEffect, useRef, useState } from 'react';
import { Mic, Trash2, Send } from 'lucide-react';
import { formatDuration } from '@/chatApi';

interface AudioRecorderProps {
  onSend: (file: File, duration: number) => void;
  onCancel: () => void;
}

export default function AudioRecorder({ onSend, onCancel }: AudioRecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        setRecording(true);
        timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not access microphone'
        );
      }
    }
    start();
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleSend = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      onCancel();
      return;
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
      onSend(file, seconds);
    };
    recorder.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  };

  const handleCancel = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    onCancel();
  };

  if (error) {
    return (
      <div className="px-4 py-3 bg-white border-t border-slate-200">
        <p className="text-sm text-red-600 text-center">{error}</p>
        <button
          onClick={onCancel}
          className="mt-2 w-full py-2 rounded-lg bg-slate-100 text-slate-600 text-sm hover:bg-slate-200 transition"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 bg-white border-t border-slate-200">
      <div className="flex items-center gap-3">
        <button
          onClick={handleCancel}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-red-50 text-red-500 hover:bg-red-100 transition"
        >
          <Trash2 className="w-5 h-5" />
        </button>

        <div className="flex-1 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-medium text-slate-700 tabular-nums">
            {formatDuration(seconds)}
          </span>
          <div className="flex-1 flex items-center gap-0.5 overflow-hidden">
            {Array.from({ length: 28 }).map((_, i) => (
              <span
                key={i}
                className="w-0.5 bg-blue-300 rounded-full"
                style={{
                  height: `${8 + Math.abs(Math.sin((i + seconds) * 0.7)) * 18}px`,
                }}
              />
            ))}
          </div>
        </div>

        <button
          onClick={handleSend}
          disabled={!recording}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 transition"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
      <p className="text-xs text-slate-400 mt-1.5 text-center">
        <Mic className="w-3 h-3 inline mr-1" />
        Recording voice message — tap send or cancel
      </p>
    </div>
  );
}
