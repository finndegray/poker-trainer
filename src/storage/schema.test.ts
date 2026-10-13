import { describe, expect, it } from 'vitest';
import { SaveFormatError, deserialize, emptyState, migrate, serialize, type SaveState } from './schema';

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
      days: {}, decisions: [], daily: {}, runs: [], bestRun: null, activeRun: null,
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
