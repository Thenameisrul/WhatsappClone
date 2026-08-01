// Notification sounds generated with the Web Audio API so no audio
// files need to be bundled. Two distinct tones: a short "pop" for text
// messages and a repeating ringtone for incoming calls.

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

// --- Repeating ringtone for calls ---
let callRingTimer: ReturnType<typeof setTimeout> | null = null;
let callRingStopped = false;

export function playCallSound(): void {
  stopCallSound();
  callRingStopped = false;

  const playRingCycle = () => {
    if (callRingStopped) return;
    // Two-tone "beep beep" ring, then pause, then repeat
    playTone(440, 0, 0.4, 0.22);
    playTone(550, 0, 0.4, 0.22);
    playTone(440, 0.5, 0.4, 0.22);
    playTone(550, 0.5, 0.4, 0.22);
    callRingTimer = setTimeout(playRingCycle, 2000);
  };

  playRingCycle();
}

export function stopCallSound(): void {
  callRingStopped = true;
  if (callRingTimer) {
    clearTimeout(callRingTimer);
    callRingTimer = null;
  }
}

// Ensure the AudioContext is unlocked after a user gesture (browsers
// block audio until the user interacts with the page).
export function unlockAudio() {
  getCtx();
}
