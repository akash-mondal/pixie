// Sound effects manager — Kenney UI Audio (CC0 license)
// Plays .wav files from /public/sounds/

const SOUND_MAP: Record<string, string> = {
  trade: '/sounds/click4.wav',
  encrypt: '/sounds/switch3.wav',
  join: '/sounds/switch1.wav',
  warning: '/sounds/switch15.wav',
  alarm: '/sounds/switch20.wav',
  reveal: '/sounds/switch30.wav',
  error: '/sounds/switch7.wav',
  tick: '/sounds/click1.wav',
};

let muted = false;
let volume = 0.5;

export function playSound(name: keyof typeof SOUND_MAP) {
  if (muted || typeof window === 'undefined') return;
  const path = SOUND_MAP[name];
  if (!path) return;
  try {
    const audio = new Audio(path);
    audio.volume = volume;
    audio.play().catch(() => {}); // ignore autoplay restrictions
  } catch {
    // ignore
  }
}

export function setMuted(m: boolean) {
  muted = m;
}

export function isMuted() {
  return muted;
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
}
