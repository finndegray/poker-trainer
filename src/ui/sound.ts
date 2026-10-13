export type SoundName = 'deal' | 'correct' | 'wrong' | 'rankup';
export type Note = { freq: number; start: number; duration: number; type: OscillatorType; gain: number };

type OscillatorLike = {
  type: OscillatorType;
  frequency: { value: number };
  connect(target: unknown): unknown;
  start(when: number): void;
  stop(when: number): void;
};
type GainLike = {
  gain: { setValueAtTime(value: number, when: number): unknown; exponentialRampToValueAtTime(value: number, when: number): unknown };
  connect(target: unknown): unknown;
};
export type AudioContextLike = {
  currentTime: number;
  destination: unknown;
  resume?: () => Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
};
export type SoundPlayer = { unlock(): void; play(name: SoundName): void };

export const SOUND_NOTES: Record<SoundName, Note[]> = {
  deal: [{ freq: 900, start: 0, duration: 0.05, type: 'triangle', gain: 0.08 }],
  correct: [
    { freq: 660, start: 0, duration: 0.09, type: 'sine', gain: 0.12 },
    { freq: 880, start: 0.09, duration: 0.14, type: 'sine', gain: 0.12 },
  ],
  wrong: [{ freq: 196, start: 0, duration: 0.24, type: 'sawtooth', gain: 0.06 }],
  rankup: [523.25, 659.25, 783.99, 1046.5].map((freq, i) => ({
    freq,
    start: i * 0.11,
    duration: 0.18,
    type: 'square' as OscillatorType,
    gain: 0.07,
  })),
};

const SILENCE = 0.0001;

export function createSoundPlayer(factory: () => AudioContextLike | null): SoundPlayer {
  let ctx: AudioContextLike | null = null;
  return {
    unlock() {
      // Until a context exists, every gesture tries again: browsers may refuse creation outside a gesture.
      if (!ctx) {
        try {
          ctx = factory();
        } catch {
          ctx = null;
        }
      }
      void ctx?.resume?.().catch(() => {});
    },
    play(name) {
      if (!ctx) return;
      for (const note of SOUND_NOTES[name]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = ctx.currentTime + note.start;
        osc.type = note.type;
        osc.frequency.value = note.freq;
        gain.gain.setValueAtTime(note.gain, t0);
        gain.gain.exponentialRampToValueAtTime(SILENCE, t0 + note.duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + note.duration + 0.02);
      }
    },
  };
}

export function browserAudioFactory(): AudioContextLike | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? (new Ctor() as unknown as AudioContextLike) : null;
}

export const silentPlayer: SoundPlayer = { unlock: () => {}, play: () => {} };
