import { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Volume2,
  VolumeX,
  Loader2,
} from 'lucide-react';
import type { CallMode, CallSignal } from '@/types';
import { sendCallSignal, deleteCallSignal } from '@/chatApi';
import { supabase } from '@/supabaseClient';
import { playCallSound, stopCallSound } from '@/notificationSound';

interface CallScreenProps {
  mode: CallMode;
  contactName: string;
  contactAvatar: string;
  pairId: string;
  currentUserId: string;
  direction: 'outgoing' | 'incoming';
  initialOffer?: RTCSessionDescriptionInit;
  onEnd: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export default function CallScreen({
  mode,
  contactName,
  contactAvatar,
  pairId,
  currentUserId,
  direction,
  initialOffer,
  onEnd,
}: CallScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const endedRef = useRef(false);

  const [status, setStatus] = useState<'connecting' | 'ringing' | 'active'>(
    direction === 'incoming' ? 'connecting' : 'connecting'
  );
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(mode === 'audio');
  const [speakerOff, setSpeakerOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleanup helper
  const cleanup = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  };

  // Hang up: send signal and close
  const handleEnd = () => {
    sendCallSignal(pairId, 'hangup', null).catch(() => {});
    cleanup();
    onEnd();
  };

  // Main WebRTC setup
  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: mode === 'video',
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current && mode === 'video') {
          videoRef.current.srcObject = stream;
        }

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          if (cancelled) return;
          const remoteStream = event.streams[0];
          if (remoteVideoRef.current && mode === 'video') {
            remoteVideoRef.current.srcObject = remoteStream;
          }
          if (mode === 'audio') {
            const audio = new Audio();
            audio.srcObject = remoteStream;
            audio.play().catch(() => {});
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && !cancelled) {
            sendCallSignal(pairId, 'ice', {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineLabel: event.candidate.sdpMLineIndex,
            }).catch(() => {});
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected' && !cancelled) {
            setStatus('active');
          }
          if (pc.connectionState === 'failed' && !cancelled) {
            setError('Call connection failed');
          }
        };

        // Outgoing: create offer
        if (direction === 'outgoing') {
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: mode === 'video' });
          await pc.setLocalDescription(offer);
          if (!cancelled) {
            setStatus('ringing');
            await sendCallSignal(pairId, 'offer', { type: offer.type, sdp: offer.sdp });
          }
        } else if (direction === 'incoming' && initialOffer) {
          // Incoming: set remote offer, create answer
          await pc.setRemoteDescription(new RTCSessionDescription(initialOffer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (!cancelled) {
            await sendCallSignal(pairId, 'answer', { type: answer.type, sdp: answer.sdp });
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Could not access camera/microphone'
          );
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to incoming signals
  useEffect(() => {
    const channel = supabase.channel(`call:${pairId}`);

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_signals', filter: `pair_id=eq.${pairId}` },
        async (payload) => {
          const signal = payload.new as CallSignal;
          // Ignore our own signals
          if (signal.sender_id === currentUserId) return;

          const pc = pcRef.current;
          if (!pc) return;

          if (signal.type === 'answer' && pc.signalingState !== 'stable') {
            try {
              const sdp = signal.payload as unknown as RTCSessionDescriptionInit;
              await pc.setRemoteDescription(new RTCSessionDescription(sdp));
              // Apply any buffered ICE candidates
              for (const c of pendingCandidatesRef.current) {
                await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
              }
              pendingCandidatesRef.current = [];
            } catch {}
          } else if (signal.type === 'ice') {
            const cand = signal.payload as unknown as RTCIceCandidateInit;
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            } else {
              pendingCandidatesRef.current.push(cand);
            }
          } else if (signal.type === 'hangup') {
            cleanup();
            onEnd();
          } else if (signal.type === 'reject') {
            cleanup();
            onEnd();
          }

          // Clean up consumed signal
          deleteCallSignal(signal.id).catch(() => {});
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId, currentUserId]);

  // Call timer
  useEffect(() => {
    if (status !== 'active') return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  // Ringback tone for outgoing calls — plays while ringing, stops when connected
  useEffect(() => {
    if (direction === 'outgoing' && status === 'ringing') {
      playCallSound();
    } else {
      stopCallSound();
    }
    return () => stopCallSound();
  }, [direction, status]);

  const toggleMute = () => {
    const stream = streamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted((m) => !m);
  };

  const toggleCamera = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;
    videoTracks.forEach((t) => (t.enabled = cameraOff));
    setCameraOff((v) => !v);
  };

  const toggleSpeaker = () => setSpeakerOff((v) => !v);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
      {/* Video / avatar area */}
      <div className="flex-1 relative overflow-hidden">
        {mode === 'video' && !cameraOff && !error ? (
          <>
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="absolute inset-0 w-full h-full object-cover"
            />
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-4 right-4 w-32 h-44 rounded-xl object-cover -scale-x-100 shadow-lg border-2 border-white/20"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <img
              src={contactAvatar}
              alt={contactName}
              className="w-32 h-32 rounded-full object-cover ring-4 ring-white/10"
            />
            <h2 className="text-white text-xl font-semibold mt-5">{contactName}</h2>
          </div>
        )}

        {/* Top info bar */}
        <div className="absolute top-0 left-0 right-0 px-5 pt-6 pb-4 bg-gradient-to-b from-black/50 to-transparent">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-medium">{contactName}</p>
              <p className="text-white/60 text-sm flex items-center gap-1.5">
                {status === 'connecting' && (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                {status === 'connecting'
                  ? 'Connecting...'
                  : status === 'ringing'
                  ? 'Ringing...'
                  : `${mode === 'video' ? 'Video' : 'Audio'} call · ${formatDuration(seconds)}`}
              </p>
            </div>
            {mode === 'video' && !cameraOff && (
              <span className="text-white/50 text-xs bg-black/30 px-2 py-1 rounded">You</span>
            )}
          </div>
        </div>

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="text-white/80 text-sm max-w-xs mb-4">{error}</p>
            <p className="text-white/50 text-xs">
              Please allow camera and microphone access in your browser.
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-6 py-8 bg-slate-900">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
              muted ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            {muted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          {mode === 'video' && (
            <button
              onClick={toggleCamera}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
                cameraOff ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {cameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </button>
          )}

          <button
            onClick={toggleSpeaker}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition ${
              speakerOff ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            {speakerOff ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
          </button>

          <button
            onClick={handleEnd}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition shadow-lg"
          >
            <PhoneOff className="w-7 h-7 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
