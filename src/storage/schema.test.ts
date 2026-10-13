import { describe, expect, it } from 'vitest';
import type { RetrainingEntry } from '../game/retraining';
import type { PreflopRecord } from '../game/stats';
import { PLAN8_SAVE, TODAY_SAVE } from './test-saves';
import { SaveFormatError, deserialize, emptyState, migrate, readRetraining, serialize, type SaveState } from './schema';

const withDecision = (): SaveState => ({
  ...emptyState(),
  profile: { xp: 120, combo: 3, soundOn: false },
  days: { '2026-10-13': 12 },
  decisions: [
    {
      ts: 1, dateKey: '2026-10-13', mode: 'training',
      spot: { kind: 'call', shover: 'SB', position: 'BB', stack: 9, hand: 20 },
      chosen: 'call', verdict: 'correct', responseMs: 2100,
    },
  ],
  daily: { '2026-10-13': { dateKey: '2026-10-13', correct: 17, total: 20, durationMs: 80_000 } },
  runs: [{ ts: 2, dateKey: '2026-10-13', placement: 312, finalTable: false, levelsCompleted: 6, bonusXp: 60 }],
  bestRun: { ts: 2, dateKey: '2026-10-13', placement: 312, finalTable: false, levelsCompleted: 6, bonusXp: 60 },
});

describe('schema', () => {
  it('creates an empty state', () => {
    expect(emptyState()).toEqual({
      schemaVersion: 1, profile: { xp: 0, combo: 0, soundOn: true },
      days: {}, decisions: [], daily: {}, runs: [], bestRun: null, activeRun: null, dailyProgress: null,
    });
  });

  it('round-trips through serialize and deserialize', () => {
    expect(deserialize(serialize(withDecision()))).toEqual(withDecision());
    expect(deserialize(serialize(emptyState()))).toEqual(emptyState());
  });

  it('returns a copy, not the input object', () => {
    const raw = JSON.parse(serialize(withDecision()));
    const migrated = migrate(raw);
    expect(migrated).not.toBe(raw);
    expect(migrated.decisions).not.toBe(raw.decisions);
  });

  it('rejects unreadable states with a German SaveFormatError', () => {
    const bad: unknown[] = [
      null, 42, [], {},
      { ...emptyState(), schemaVersion: 2 },
      { ...emptyState(), profile: { xp: -5, combo: 0, soundOn: true } },
      { ...emptyState(), days: { '2026-10-13': 'viele' } },
      { ...emptyState(), decisions: [{ ts: 1 }] },
      { ...emptyState(), runs: [{ placement: 'erster' }] },
      { ...emptyState(), bestRun: 7 },
    ];
    for (const raw of bad) expect(() => migrate(raw)).toThrow(SaveFormatError);
    expect(() => migrate({ ...emptyState(), schemaVersion: 2 })).toThrow(/neuer/);
    expect(() => deserialize('{kaputt')).toThrow(SaveFormatError);
  });
});

describe('spot validation', () => {
  const withSpot = (spot: Record<string, unknown>): unknown => {
    const state = withDecision();
    return { ...state, decisions: [{ ...state.decisions[0], spot }] };
  };
  const open = { kind: 'open', position: 'BTN', stack: 10, hand: 5 };
  const call = { kind: 'call', shover: 'SB', position: 'BB', stack: 10, hand: 5 };

  it('accepts valid open and call spots', () => {
    expect(() => migrate(withSpot(open))).not.toThrow();
    expect(() => migrate(withSpot(call))).not.toThrow();
  });

  it('rejects stacks outside 1..20 or non-integer', () => {
    for (const stack of [0, 21, 9.5]) expect(() => migrate(withSpot({ ...open, stack }))).toThrow(SaveFormatError);
  });

  it('rejects hands outside 0..168 or non-integer', () => {
    for (const hand of [169, -1, 2.5]) expect(() => migrate(withSpot({ ...open, hand }))).toThrow(SaveFormatError);
  });

  it('rejects invalid positions', () => {
    expect(() => migrate(withSpot({ ...open, position: 'BB' }))).toThrow(SaveFormatError);
    expect(() => migrate(withSpot({ ...open, position: 'XYZ' }))).toThrow(SaveFormatError);
    expect(() => migrate(withSpot({ ...call, shover: 'BB' }))).toThrow(SaveFormatError);
    expect(() => migrate(withSpot({ ...call, shover: 'BTN', position: 'CO' }))).toThrow(SaveFormatError);
  });
});

describe('newer schema version', () => {
  it('marks a newer version with code newer-version and other failures with corrupt', () => {
    const codeOf = (raw: unknown): string | undefined => {
      try {
        migrate(raw);
      } catch (error) {
        return error instanceof SaveFormatError ? error.code : undefined;
      }
      return undefined;
    };
    expect(codeOf({ ...emptyState(), schemaVersion: 2 })).toBe('newer-version');
    expect(codeOf({ ...emptyState(), profile: null })).toBe('corrupt');
    expect(codeOf(null)).toBe('corrupt');
  });
});

describe('active run', () => {
  const running = { levelIndex: 2, spotInLevel: 4, lives: 1, status: 'running', answered: 14 };

  it('round-trips an active run', () => {
    const state: SaveState = { ...emptyState(), activeRun: running as SaveState['activeRun'] };
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('rejects an invalid active run', () => {
    const bad: unknown[] = [
      { ...running, lives: 4 },
      { ...running, levelIndex: 8 },
      { ...running, spotInLevel: 5.5 },
      { ...running, spotInLevel: 6 },
      { ...running, status: 'paused' },
      { ...running, answered: -1 },
      7,
    ];
    for (const activeRun of bad) expect(() => migrate({ ...emptyState(), activeRun })).toThrow(SaveFormatError);
    expect(() => migrate({ ...emptyState(), activeRun: undefined })).toThrow(SaveFormatError);
  });
});

describe('daily progress', () => {
  // Exactly as the main branch writes it: schema version 1 without the dailyProgress key.
  const MAIN_SAVE = '{"schemaVersion":1,"profile":{"xp":340,"combo":2,"soundOn":true},"days":{"2026-10-12":24,"2026-10-13":5},'
    + '"decisions":[{"ts":1760371200000,"dateKey":"2026-10-13","mode":"training","spot":{"kind":"open","position":"BTN","stack":10,"hand":5},'
    + '"chosen":"shove","verdict":"correct","responseMs":1800}],'
    + '"daily":{"2026-10-12":{"dateKey":"2026-10-12","correct":16,"total":20,"durationMs":95000}},'
    + '"runs":[{"ts":1760371300000,"dateKey":"2026-10-12","placement":1240,"finalTable":false,"levelsCompleted":3,"bonusXp":30}],'
    + '"bestRun":{"ts":1760371300000,"dateKey":"2026-10-12","placement":1240,"finalTable":false,"levelsCompleted":3,"bonusXp":30},'
    + '"activeRun":{"levelIndex":1,"spotInLevel":2,"lives":2,"status":"running","answered":7}}';
  const progress = { dateKey: '2026-10-13', index: 7, correct: 5, elapsedMs: 42_000 };

  it('loads a save from the main branch unchanged and with no daily progress', () => {
    const raw = JSON.parse(MAIN_SAVE);
    const loaded = deserialize(MAIN_SAVE);
    expect(loaded).toEqual({ ...raw, dailyProgress: null });
    expect(deserialize(serialize(loaded))).toEqual(loaded);
  });

  it('round-trips daily progress', () => {
    const state: SaveState = { ...emptyState(), dailyProgress: progress };
    expect(deserialize(serialize(state))).toEqual(state);
    expect(migrate(JSON.parse(serialize(state))).dailyProgress).not.toBe(state.dailyProgress);
  });

  it('rejects invalid daily progress', () => {
    const bad: unknown[] = [
      7,
      undefined,
      { ...progress, index: 20 },
      { ...progress, index: -1 },
      { ...progress, index: 2.5 },
      { ...progress, correct: -1 },
      { ...progress, correct: 1.5 },
      { ...progress, elapsedMs: -5 },
      { ...progress, elapsedMs: 0.5 },
      { ...progress, dateKey: '13.10.2026' },
      { ...progress, dateKey: 20261013 },
    ];
    for (const dailyProgress of bad) expect(() => migrate({ ...emptyState(), dailyProgress })).toThrow(SaveFormatError);
  });

  it('rejects more correct answers than answered spots', () => {
    expect(() => migrate({ ...emptyState(), dailyProgress: { ...progress, index: 3, correct: 50 } })).toThrow(SaveFormatError);
    expect(() => migrate({ ...emptyState(), dailyProgress: { ...progress, index: 3, correct: 4 } })).toThrow(SaveFormatError);
    const allCorrect = { ...progress, index: 3, correct: 3 };
    expect(migrate({ ...emptyState(), dailyProgress: allCorrect }).dailyProgress).toEqual(allCorrect);
  });
});

describe('starthand records (Plan 6)', () => {
  const preflopRecord: PreflopRecord = {
    ts: 3, dateKey: '2026-10-13', mode: 'training', game: 'preflop',
    spot: { kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO', hand: 0 },
    chosen: 'threeBet', verdict: 'correct', responseMs: 2500,
  };
  const today = () => JSON.parse(TODAY_SAVE);

  it("loads a save in today's format unchanged, byte for byte", () => {
    const loaded = deserialize(TODAY_SAVE);
    expect(loaded).toEqual(JSON.parse(TODAY_SAVE));
    expect(serialize(loaded)).toBe(TODAY_SAVE);
    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.decisions.every((d) => d.game === undefined)).toBe(true);
    expect('preflopFilter' in loaded.profile).toBe(false);
  });

  it('round-trips starthand records next to push/fold records and the remembered filter', () => {
    const state: SaveState = {
      ...emptyState(),
      profile: { xp: 10, combo: 1, soundOn: true, preflopFilter: { kind: 'vs3bet', stack: 40 } },
      decisions: [withDecision().decisions[0], preflopRecord],
    };
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('accepts push/fold records with an explicit game key', () => {
    const raw = today();
    raw.decisions[0] = { ...raw.decisions[0], game: 'pushfold' };
    expect(migrate(raw).decisions[0]).toEqual(raw.decisions[0]);
  });

  it('drops invalid and unknown starthand records instead of failing', () => {
    const raw = today();
    const kept = raw.decisions.length;
    const bad = [
      { ...preflopRecord, spot: { ...preflopRecord.spot, hero: 'UTG' } },
      { ...preflopRecord, spot: { kind: 'rfi', stack: 100, hero: 'BB', villain: null, hand: 0 } },
      { ...preflopRecord, spot: { ...preflopRecord.spot, stack: 60 } },
      { ...preflopRecord, spot: { ...preflopRecord.spot, hand: 169 } },
      { ...preflopRecord, spot: null },
      { ...preflopRecord, chosen: 'raise' },
      { ...preflopRecord, verdict: 'super' },
      { ...preflopRecord, responseMs: -1 },
      { ...preflopRecord, game: 'icm' },
    ];
    raw.decisions = [...raw.decisions, preflopRecord, ...bad];
    const loaded = migrate(raw);
    expect(loaded.decisions).toHaveLength(kept + 1);
    expect(loaded.decisions.at(-1)).toEqual(preflopRecord);
  });

  it('still rejects broken push/fold records', () => {
    const raw = today();
    raw.decisions.push({ ...raw.decisions[0], spot: { kind: 'open', position: 'BB', stack: 10, hand: 5 } });
    expect(() => migrate(raw)).toThrow(SaveFormatError);
    const explicit = today();
    explicit.decisions.push({ ...explicit.decisions[0], game: 'pushfold', chosen: 'raise' });
    expect(() => migrate(explicit)).toThrow(SaveFormatError);
    const notAnObject = today();
    notAnObject.decisions.push(7);
    expect(() => migrate(notAnObject)).toThrow(SaveFormatError);
  });

  it('keeps a valid filter and ignores an invalid one', () => {
    for (const preflopFilter of [{ kind: 'squeeze', stack: 'all' }, { kind: 'all', stack: 60 }, 'alle', null]) {
      const raw = today();
      raw.profile.preflopFilter = preflopFilter;
      expect(migrate(raw).profile).toEqual({ xp: 1840, combo: 3, soundOn: false });
    }
    const raw = today();
    raw.profile.preflopFilter = { kind: 'rfi', stack: 'all', extra: 1 };
    expect(migrate(raw).profile).toEqual({ xp: 1840, combo: 3, soundOn: false, preflopFilter: { kind: 'rfi', stack: 'all' } });
  });
});

describe('retraining queue (Plan 9)', () => {
  const pushfold: RetrainingEntry = {
    key: 'TM6532734973:13', tournamentId: '318096259', playedAt: '2026-10-12 15:46:28', streak: 0,
    game: 'pushfold', spot: { kind: 'open', position: 'HJ', stack: 16, hand: 130 },
  };
  const preflop: RetrainingEntry = {
    key: 'TM6533069892:17', tournamentId: '318096259', playedAt: '2026-10-12 16:02:11', streak: 1,
    game: 'preflop', spot: { kind: 'vsOpen', stack: 40, hero: 'BB', villain: 'SB', hand: 102 },
  };
  const queue = { entries: [pushfold, preflop], done: ['TM1:9'], synced: ['318096259'] };
  const plan8 = () => JSON.parse(PLAN8_SAVE);

  it("loads today's saves unchanged, byte for byte, without a retraining field", () => {
    for (const text of [TODAY_SAVE, PLAN8_SAVE]) {
      const loaded = deserialize(text);
      expect('retraining' in loaded).toBe(false);
      expect(serialize(loaded)).toBe(text);
    }
    expect(serialize(emptyState())).not.toContain('retraining');
  });

  it('round-trips a queue next to the existing fields, also switched off', () => {
    const state: SaveState = { ...deserialize(PLAN8_SAVE), retraining: queue };
    expect(deserialize(serialize(state))).toEqual(state);
    const off: SaveState = { ...state, retraining: { off: true, ...queue } };
    expect(deserialize(serialize(off))).toEqual(off);
    expect(serialize(deserialize(serialize(off)))).toBe(serialize(off));
  });

  it('drops invalid entries one by one and lets the archive feed the queue again', () => {
    const bad = [
      { ...pushfold, key: '' },
      { ...pushfold, key: 'x'.repeat(201) },
      { ...pushfold, tournamentId: 7 },
      { ...pushfold, playedAt: '12.10.2026' },
      { ...pushfold, streak: 2 },
      { ...pushfold, streak: 0.5 },
      { ...pushfold, game: 'icm' },
      { ...pushfold, spot: { kind: 'open', position: 'BB', stack: 16, hand: 130 } },
      { ...pushfold, spot: { kind: 'open', position: 'HJ', stack: 21, hand: 130 } },
      { ...preflop, spot: { ...preflop.spot, stack: 60 } },
      { ...preflop, game: 'pushfold' },
      { ...pushfold },
      null,
    ];
    const raw = plan8();
    raw.retraining = { ...queue, entries: [pushfold, preflop, ...bad] };
    const loaded = migrate(raw);
    expect(loaded.retraining).toEqual({ entries: [pushfold, preflop], done: ['TM1:9'], synced: [] });
    expect(loaded.decisions).toHaveLength(3);
    expect(loaded.profile.xp).toBe(2310);
  });

  it('never fails the save for a broken queue', () => {
    for (const retraining of [null, 7, 'voll', [], { entries: 'kaputt', done: 3, synced: [1, '2'] }, { off: 'ja' }]) {
      const raw = plan8();
      raw.retraining = retraining;
      const loaded = migrate(raw);
      expect(loaded.decisions).toHaveLength(3);
      expect(loaded.retraining ?? null).toEqual(readRetraining(retraining));
    }
    expect(readRetraining({ entries: 'kaputt', done: 3, synced: [1, '2'] })).toEqual({ entries: [], done: [], synced: [] });
    expect(readRetraining({ off: 'ja' })).toEqual({ entries: [], done: [], synced: [] });
    expect(readRetraining(null)).toBeNull();
  });

  it('keeps unknown extra keys out and copies the entries', () => {
    const raw = plan8();
    raw.retraining = { ...queue, extra: 1, entries: [{ ...pushfold, spot: { ...pushfold.spot, shover: 'UTG' }, note: 'x' }] };
    const loaded = migrate(raw);
    expect(loaded.retraining).toEqual({ entries: [pushfold], done: ['TM1:9'], synced: ['318096259'] });
    expect(loaded.retraining!.entries[0]).not.toBe(raw.retraining.entries[0]);
  });

  it('ignores unknown top-level fields, as every earlier app version does with the queue', () => {
    const raw = { ...plan8(), zukunft: { entries: [] } };
    expect(serialize(migrate(raw))).toBe(PLAN8_SAVE);
  });
});
