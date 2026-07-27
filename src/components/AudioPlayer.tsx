import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { formatDuration } from '@/chatApi';

interface AudioPlayerProps {
  src: string;
  duration: number | null;
  mine: boolean;
}

export default function AudioPlayer({ src, duration, mine }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrent(audio.currentTime);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  };

  const total = duration ?? 0;
  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5 min-w-[180px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={toggle}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition ${
          mine ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-blue-500 text-white hover:bg-blue-600'
        }`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
          <div
            className={`h-full rounded-full ${mine ? 'bg-white' : 'bg-blue-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className={`text-[10px] mt-1 tabular-nums ${mine ? 'text-blue-100' : 'text-slate-400'}`}>
          {formatDuration(Math.round(current))} / {formatDuration(total)}
        </p>
      </div>
    </div>
  );
}
