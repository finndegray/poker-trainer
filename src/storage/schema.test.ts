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
      days: {}, decisions: [], daily: {}, runs: [], bestRun: null,
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
