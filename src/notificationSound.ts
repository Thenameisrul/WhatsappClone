// Notification sounds generated with the Web Audio API so no audio
// files need to be bundled. Two distinct tones: a short "pop" for text
// messages and a ringing pattern for incoming calls.

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(freq: number, start: number, duration: number, volume = 0.18) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + start);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.02);
}

// Short two-note "pop" for text messages
export function playMessageSound() {
  playTone(880, 0, 0.12);
  playTone(1320, 0.08, 0.14);
}

// Ringing pattern (repeats twice) for incoming calls
export function playCallSound() {
  playTone(440, 0, 0.4, 0.2);
  playTone(550, 0, 0.4, 0.2);
  playTone(440, 0.5, 0.4, 0.2);
  playTone(550, 0.5, 0.4, 0.2);
}

// Ensure the AudioContext is unlocked after a user gesture (browsers
// block audio until the user interacts with the page).
export function unlockAudio() {
  getCtx();
}
