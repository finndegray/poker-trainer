import { describe, expect, it } from 'vitest';
import { type AudioContextLike, SOUND_NOTES, createSoundPlayer } from './sound';

function fakeContext() {
  const started: number[] = [];
  const ctx: AudioContextLike = {
    currentTime: 10,
    destination: {},
    resume: async () => {},
    createOscillator: () => {
      const osc = {
        type: 'sine' as OscillatorType,
        frequency: { value: 0 },
        connect: () => {},
        start: () => started.push(osc.frequency.value),
        stop: () => {},
      };
      return osc;
    },
    createGain: () => ({
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
    }),
  };
  return { ctx, started };
}

describe('createSoundPlayer', () => {
  it('stays silent until unlocked', () => {
    const { ctx, started } = fakeContext();
    let created = 0;
    const player = createSoundPlayer(() => {
      created++;
      return ctx;
    });
    player.play('correct');
    expect(started).toEqual([]);
    expect(created).toBe(0);
    player.unlock();
    player.unlock();
    expect(created).toBe(1);
  });

  it('plays the notes of a sound', () => {
    const { ctx, started } = fakeContext();
    const player = createSoundPlayer(() => ctx);
    player.unlock();
    player.play('rankup');
    expect(started).toEqual(SOUND_NOTES.rankup.map((n) => n.freq));
  });

  it('copes without audio support', () => {
    const player = createSoundPlayer(() => null);
    player.unlock();
    expect(() => player.play('deal')).not.toThrow();
  });
});
