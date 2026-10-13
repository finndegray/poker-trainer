import { describe, expect, it, vi } from 'vitest';
import { handClassOf } from '../engine/cards';
import { mulberry32 } from '../engine/rng';
import { makeFixture } from '../engine/test-fixtures';
import { emptyState } from '../storage/schema';
import { createGameStore, type GameStoreDeps } from './game-store';
import type { PersistenceInfo } from './persistence';

const info: PersistenceInfo = { mode: 'memory', readOnly: false, otherTabActive: false, corruptBackup: null };

function setup(over: Partial<PersistenceInfo> = {}) {
  let t = 1000;
  const save = vi.fn();
  const deps: GameStoreDeps = {
    data: makeFixture((h) => (84 - h) / 10),
    persistence: { initial: emptyState(), info: { ...info, ...over }, save },
    rng: mulberry32(1),
    now: () => new Date(2026, 9, 13, 18, 0),
    clock: () => t,
  };
  return { store: createGameStore(deps), save, advance: (ms: number) => (t += ms) };
}

describe('createGameStore', () => {
  it('starts with the saved state and no spot', () => {
    const { store } = setup();
    const s = store.getSnapshot();
    expect(s.status.rank.name).toBe('Fish');
    expect(s.current).toBeNull();
    expect(s.last).toBeNull();
    expect(store.getSnapshot()).toBe(s);
  });

  it('deals a training spot with matching concrete cards', () => {
    const { store } = setup();
    store.nextTrainingSpot();
    const cur = store.getSnapshot().current!;
    expect(handClassOf(cur.cards[0], cur.cards[1])).toBe(cur.spot.hand);
    expect(cur.shownAt).toBe(1000);
  });

  it('records an answer, saves it and notifies listeners', () => {
    const { store, save, advance } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    store.nextTrainingSpot();
    advance(1200);
    const result = store.answer('fold');
    expect(result.outcome.record.responseMs).toBe(1200);
    expect(result.chart).toHaveLength(169);
    expect(result.comparison.entries.length).toBeGreaterThan(0);
    expect(save).toHaveBeenCalledWith(result.outcome.state);
    expect(store.getSnapshot().save).toBe(result.outcome.state);
    expect(store.getSnapshot().last).toBe(result);
    expect(store.getSnapshot().status.dayProgress.count).toBe(1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('refuses double answers and answers without a spot', () => {
    const { store } = setup();
    expect(() => store.answer('fold')).toThrow();
    store.nextTrainingSpot();
    store.answer('fold');
    expect(() => store.answer('fold')).toThrow();
    store.nextTrainingSpot();
    expect(store.getSnapshot().last).toBeNull();
  });

  it('blocks training in read-only mode', () => {
    const { store } = setup({ readOnly: true });
    expect(() => store.nextTrainingSpot()).toThrow();
  });

  it('saves the sound setting and records save errors', () => {
    const { store, save } = setup();
    store.setSound(false);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ profile: expect.objectContaining({ soundOn: false }) }));
    store.reportSaveError(new Error('Speicher voll'));
    expect(store.getSnapshot().saveError).toBe('Speicher voll');
  });
});
