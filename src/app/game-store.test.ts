import { describe, expect, it, vi } from 'vitest';
import { handClassOf } from '../engine/cards';
import { mulberry32 } from '../engine/rng';
import { makeFixture } from '../engine/test-fixtures';
import { aggressiveAction, evOf, type Action, type Spot } from '../engine/pushfold';
import type { PushFoldData } from '../engine/pushfold-data';
import { dailySpots } from '../game/daily';
import { RUN_LEVEL_STACKS, startRun } from '../game/endphase-run';
import { emptyState, SaveFormatError, serialize, type SaveState } from '../storage/schema';
import { createGameStore, type GameStoreDeps } from './game-store';
import type { PersistenceInfo } from './persistence';

const info: PersistenceInfo = { mode: 'memory', readOnly: false, otherTabActive: false, corruptBackup: null };

function setup(over: Partial<PersistenceInfo> = {}, initial: SaveState = emptyState()) {
  let t = 1000;
  const save = vi.fn();
  const create = vi.fn(async () => 'corrupt-backup:test');
  const deps: GameStoreDeps = {
    data: makeFixture((h) => (84 - h) / 10),
    persistence: {
      initial,
      info: { ...info, ...over },
      save,
      backups: { list: async () => [], read: async () => undefined, remove: async () => {}, create },
    },
    rng: mulberry32(1),
    now: () => new Date(2026, 9, 13, 18, 0),
    clock: () => t,
  };
  return { store: createGameStore(deps), save, create, data: deps.data, advance: (ms: number) => (t += ms) };
}

const rightAction = (data: PushFoldData, spot: Spot): Action => (evOf(data, spot) > 0 ? aggressiveAction(spot) : 'fold');
const wrongAction = (data: PushFoldData, spot: Spot): Action => (evOf(data, spot) > 0 ? 'fold' : aggressiveAction(spot));

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

describe('adoptSavedState', () => {
  it('takes over the fresh state, clears the spot and shows a notice', () => {
    const { store } = setup({ otherTabActive: true });
    expect(store.getSnapshot().notice).toBeNull();
    store.nextTrainingSpot();
    store.answer('fold');
    const fresh = { ...emptyState(), profile: { xp: 1250, combo: 0, soundOn: true } };
    store.adoptSavedState(fresh);
    const s = store.getSnapshot();
    expect(s.save).toBe(fresh);
    expect(s.status.rank.name).toBe('Donkey');
    expect(s.info.otherTabActive).toBe(false);
    expect(s.current).toBeNull();
    expect(s.last).toBeNull();
    expect(s.notice).toBe('writer-acquired');
    expect(s.celebration).toBeNull();
    store.dismissNotice();
    expect(store.getSnapshot().notice).toBeNull();
  });
});

describe('notices', () => {
  it('shows the update notice', () => {
    const { store } = setup();
    store.setUpdateAvailable();
    expect(store.getSnapshot().notice).toBe('update-available');
  });

  it('keeps the writer notice in front until it is dismissed', () => {
    const { store } = setup({ otherTabActive: true });
    store.adoptSavedState(emptyState());
    store.setUpdateAvailable();
    expect(store.getSnapshot().notice).toBe('writer-acquired');
    store.dismissNotice();
    expect(store.getSnapshot().notice).toBe('update-available');
  });

  it('puts the writer notice in front of a shown update notice', () => {
    const { store } = setup({ otherTabActive: true });
    store.setUpdateAvailable();
    store.adoptSavedState(emptyState());
    expect(store.getSnapshot().notice).toBe('writer-acquired');
    store.dismissNotice();
    expect(store.getSnapshot().notice).toBe('update-available');
  });
});

describe('resumeTraining', () => {
  it('deals a spot when there is none', () => {
    const { store } = setup();
    store.resumeTraining();
    expect(store.getSnapshot().current?.shownAt).toBe(1000);
  });

  it('keeps an unanswered spot and restarts its timer', () => {
    const { store, advance } = setup();
    store.nextTrainingSpot();
    const before = store.getSnapshot().current!;
    advance(5000);
    store.resumeTraining();
    const after = store.getSnapshot().current!;
    expect(after.spot).toBe(before.spot);
    expect(after.cards).toBe(before.cards);
    expect(after.shownAt).toBe(6000);
    advance(800);
    expect(store.answer('fold').outcome.record.responseMs).toBe(800);
  });

  it('deals a new spot when the current one is answered', () => {
    const { store, advance } = setup();
    store.nextTrainingSpot();
    store.answer('fold');
    advance(10);
    store.resumeTraining();
    expect(store.getSnapshot().last).toBeNull();
    expect(store.getSnapshot().current?.shownAt).toBe(1010);
  });
});

describe('daily challenge', () => {
  it('plays the 20 spots of the day and records the result once', () => {
    const { store, data, advance } = setup();
    store.startDaily();
    const expected = dailySpots(data, '2026-10-13');
    for (let i = 0; i < 20; i++) {
      const snap = store.getSnapshot();
      expect(snap.session).toMatchObject({ kind: 'daily', index: i });
      expect(snap.current?.spot).toEqual(expected[i]);
      store.answer(i < 15 ? rightAction(data, snap.current!.spot) : wrongAction(data, snap.current!.spot));
      expect(store.getSnapshot().last?.outcome.record.mode).toBe('daily');
      advance(1000);
      store.next();
    }
    const snap = store.getSnapshot();
    expect(snap.current).toBeNull();
    expect(snap.session).toMatchObject({ kind: 'daily', outcome: { accepted: true, isPersonalBest: true } });
    const outcome = (snap.session as { outcome: { result: { correct: number; total: number } } }).outcome;
    expect(outcome.result.total).toBe(20);
    expect(outcome.result.correct).toBeGreaterThanOrEqual(15);
    expect(snap.save.daily['2026-10-13']).toEqual(outcome.result);
    expect(snap.status.dailyToday).toEqual(outcome.result);

    store.startDaily();
    expect(store.getSnapshot().session).toBe(snap.session);

    store.startDaily({ restart: true });
    for (let i = 0; i < 20; i++) {
      store.answer('fold');
      store.next();
    }
    expect(store.getSnapshot().session).toMatchObject({ outcome: { accepted: false } });
  });

  it('records the daily as soon as the last spot is answered', () => {
    const { store, data, advance } = setup();
    store.startDaily();
    for (let i = 0; i < 20; i++) {
      store.answer(rightAction(data, store.getSnapshot().current!.spot));
      advance(1000);
      if (i < 19) store.next();
    }
    const done = store.getSnapshot();
    const outcome = (done.session as { outcome: { result: { durationMs: number } } | null }).outcome;
    expect(outcome).not.toBeNull();
    expect(outcome!.result.durationMs).toBeGreaterThan(0);
    expect(done.save.daily['2026-10-13']).toEqual(outcome!.result);
    expect(done.last).not.toBeNull();
    store.next();
    const after = store.getSnapshot();
    expect(after.current).toBeNull();
    expect(after.last).toBeNull();
    expect(after.session).toBe(done.session);
    expect(after.save).toBe(done.save);
  });

  it('ignores next() while the current daily spot is unanswered', () => {
    const { store } = setup();
    store.startDaily();
    const before = store.getSnapshot().current;
    store.next();
    expect(store.getSnapshot().current).toBe(before);
    expect(store.getSnapshot().session).toMatchObject({ kind: 'daily', index: 0 });
  });

  it('resumes an unfinished daily instead of restarting it', () => {
    const { store, advance } = setup();
    store.startDaily();
    store.answer('fold');
    store.next();
    advance(5000);
    store.startDaily();
    expect(store.getSnapshot().session).toMatchObject({ kind: 'daily', index: 1 });
    expect(store.getSnapshot().current?.shownAt).toBe(6000);
  });
});

describe('endphase run', () => {
  it('runs until the third mistake and records the run', () => {
    const { store, data } = setup();
    store.startRun();
    expect(store.getSnapshot().save.activeRun).toMatchObject({ status: 'running', lives: 3 });
    for (let i = 0; i < 40 && !(store.getSnapshot().session as { outcome: unknown }).outcome; i++) {
      const spot = store.getSnapshot().current!.spot;
      store.answer(wrongAction(data, spot));
      expect(store.getSnapshot().last?.outcome.record.mode).toBe('run');
      store.next();
    }
    const snap = store.getSnapshot();
    // Close spots cost no life, so the bust level depends on the dealt spots; the run must end before the final table.
    expect(snap.session).toMatchObject({ kind: 'run', outcome: { summary: { finalTable: false }, isPersonalBest: true } });
    const summary = (snap.session as { outcome: { summary: { placement: number } } }).outcome.summary;
    expect(summary.placement).toBeGreaterThan(10);
    expect(snap.save.activeRun).toBeNull();
    expect(snap.save.bestRun?.placement).toBe(summary.placement);
    expect(snap.current).toBeNull();
  });

  it('ignores next() while the current run spot is unanswered', () => {
    const { store } = setup();
    store.startRun();
    const before = store.getSnapshot();
    store.next();
    expect(store.getSnapshot().current).toBe(before.current);
    expect(store.getSnapshot().save.activeRun).toBe(before.save.activeRun);
  });

  it('continues a saved run after a reload', () => {
    const initial: SaveState = { ...emptyState(), activeRun: { ...startRun(), levelIndex: 2, answered: 10 } };
    const { store } = setup({}, initial);
    store.startRun();
    const snap = store.getSnapshot();
    expect(snap.save.activeRun).toMatchObject({ levelIndex: 2, answered: 10 });
    expect(Math.abs(snap.current!.spot.stack - RUN_LEVEL_STACKS[2])).toBeLessThanOrEqual(1);
  });

  it('keeps a finished run visible until restarted', () => {
    const { store, data } = setup();
    store.startRun();
    while (!(store.getSnapshot().session as { outcome: unknown }).outcome) {
      store.answer(wrongAction(data, store.getSnapshot().current!.spot));
      store.next();
    }
    const finished = store.getSnapshot().session;
    store.startRun();
    expect(store.getSnapshot().session).toBe(finished);
    store.startRun({ restart: true });
    expect(store.getSnapshot().session).toEqual({ kind: 'run', outcome: null });
    expect(store.getSnapshot().save.activeRun?.status).toBe('running');
  });
});

describe('celebration, export and import', () => {
  it('celebrates a rank-up until dismissed', () => {
    const initial: SaveState = { ...emptyState(), profile: { xp: 495, combo: 0, soundOn: true } };
    const { store, data } = setup({}, initial);
    store.startTraining();
    store.answer(rightAction(data, store.getSnapshot().current!.spot));
    expect(store.getSnapshot().celebration).toBe('Donkey');
    store.dismissCelebration();
    expect(store.getSnapshot().celebration).toBeNull();
  });

  it('celebrates a rank-up caused by the run bonus xp', () => {
    const run = { ...startRun(), levelIndex: 7, spotInLevel: 4, lives: 1, answered: 39 };
    const initial: SaveState = { ...emptyState(), profile: { xp: 1890, combo: 0, soundOn: true }, activeRun: run };
    const { store, data } = setup({}, initial);
    store.startRun();
    store.answer(rightAction(data, store.getSnapshot().current!.spot));
    const snap = store.getSnapshot();
    expect(snap.session).toMatchObject({ kind: 'run', outcome: { summary: { finalTable: true } } });
    expect(snap.celebration).toBe('Grinder');
  });

  it('resets the celebration on import', async () => {
    const initial: SaveState = { ...emptyState(), profile: { xp: 495, combo: 0, soundOn: true } };
    const { store, data } = setup({}, initial);
    store.startTraining();
    store.answer(rightAction(data, store.getSnapshot().current!.spot));
    expect(store.getSnapshot().celebration).toBe('Donkey');
    await store.importState(serialize(emptyState()));
    expect(store.getSnapshot().celebration).toBeNull();
  });

  it('aborts the import when the backup fails', async () => {
    const { store, save, create } = setup();
    const failure = new Error('Backup voll');
    create.mockRejectedValueOnce(failure);
    const before = store.getSnapshot();
    await expect(store.importState(serialize({ ...emptyState(), profile: { xp: 900, combo: 0, soundOn: true } }))).rejects.toBe(failure);
    expect(store.getSnapshot()).toBe(before);
    expect(save).not.toHaveBeenCalled();
  });

  it('backs up the current state before importing', async () => {
    const initial: SaveState = { ...emptyState(), profile: { xp: 120, combo: 0, soundOn: true } };
    const { store, save, create } = setup({}, initial);
    const imported: SaveState = { ...emptyState(), profile: { xp: 900, combo: 0, soundOn: false } };
    await store.importState(serialize(imported));
    expect(create).toHaveBeenCalledWith(serialize(initial));
    expect(store.getSnapshot().save).toEqual(imported);
    expect(save).toHaveBeenLastCalledWith(imported);
    expect(JSON.parse(store.exportState()).profile.xp).toBe(900);
  });

  it('rejects an invalid import without changing anything', async () => {
    const { store, create } = setup();
    await expect(store.importState('{kaputt')).rejects.toBeInstanceOf(SaveFormatError);
    expect(create).not.toHaveBeenCalled();
    expect(store.getSnapshot().save).toEqual(emptyState());
  });

  it('blocks every mode in read-only mode', () => {
    const { store } = setup({ readOnly: true });
    expect(() => store.startTraining()).toThrow();
    expect(() => store.startDaily()).toThrow();
    expect(() => store.startRun()).toThrow();
  });
});
