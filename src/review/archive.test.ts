import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { getPushFoldData } from '../app/data';
import { SAVE_KEY, indexedDbBackend, saveState } from '../storage/store';
import { deserialize } from '../storage/schema';
import { TODAY_SAVE } from '../storage/test-saves';
import { analyzeHand } from './analysis';
import {
  ArchiveFormatError,
  type HandRecord,
  REVIEW_SCHEMA_VERSION,
  type TournamentRecord,
  handKey,
  indexedDbReviewBackend,
  isHandAnalysis,
  loadArchiveIndex,
  loadHands,
  memoryReviewBackend,
  MAX_HAND_NAME,
  readHand,
  readTournament,
  removeTournament,
  tournamentKey,
  writeRecords,
} from './archive';
import bounty from './fixtures/bounty.txt?raw';
import { parseHand } from './parse';

const hand = parseHand(bounty);
const handRecord: HandRecord = {
  reviewSchemaVersion: 1,
  id: hand.id,
  tournamentId: hand.tournamentId,
  playedAt: hand.playedAt,
  dateKey: hand.dateKey,
  raw: hand.raw,
  analysisVersion: 1,
  analysis: analyzeHand(hand, getPushFoldData()),
};
const tournament: TournamentRecord = {
  reviewSchemaVersion: 1,
  id: hand.tournamentId,
  name: hand.tournamentName,
  detectedKind: 'bounty',
  kind: 'bounty',
  firstPlayedAt: hand.playedAt,
  lastPlayedAt: hand.playedAt,
  handIds: [hand.id],
  summary: { hands: 1, preflopErrors: 0, postflopErrors: 0, hints: 0, days: { '2026-10-13': { hands: 1, preflopErrors: 0 } } },
};

describe('archive records', () => {
  it('has its own schema version', () => {
    expect(REVIEW_SCHEMA_VERSION).toBe(1);
  });

  it('round-trips tournaments and hands', () => {
    expect(readTournament(JSON.stringify(tournament))).toEqual(tournament);
    expect(readHand(JSON.stringify(handRecord))).toEqual(handRecord);
    expect(isHandAnalysis(handRecord.analysis)).toBe(true);
  });

  it('rejects broken records and marks newer ones', () => {
    expect(() => readTournament('{')).toThrow('Archiv-Eintrag nicht lesbar: kein gültiges JSON');
    expect(() => readTournament(JSON.stringify({ ...tournament, kind: 'turbo' }))).toThrow(ArchiveFormatError);
    expect(() => readHand(JSON.stringify({ ...handRecord, raw: 5 }))).toThrow('Archiv-Eintrag nicht lesbar: Hand');
    try {
      readTournament(JSON.stringify({ ...tournament, reviewSchemaVersion: 2 }));
      expect.unreachable();
    } catch (error) {
      expect((error as ArchiveFormatError).code).toBe('newer-version');
    }
  });

  it('accepts a hand with a broken analysis, which is rated again later', () => {
    const broken = { ...handRecord, analysis: { version: 1, decisions: [{ rating: { model: 'chart', spot: {} } }] } };
    expect(readHand(JSON.stringify(broken)).raw).toBe(hand.raw);
    expect(isHandAnalysis(broken.analysis)).toBe(false);
  });

  it('accepts postflop ratings and the Plan 8 fields, and rejects broken ones', () => {
    expect(handRecord.analysis.decisions.some((d) => d.rating.model === 'postflop')).toBe(true);
    const badVerdict = { ...handRecord.analysis, decisions: [{ ...handRecord.analysis.decisions[1], rating: { model: 'postflop', verdict: 'vielleicht' } }] };
    expect(isHandAnalysis(badVerdict)).toBe(false);
    const rated: TournamentRecord = {
      ...tournament,
      analysisVersion: 2,
      summary: { ...tournament.summary, postflopErrors: 1, days: { '2026-10-13': { hands: 1, preflopErrors: 0, postflopErrors: 1 } } },
    };
    expect(readTournament(JSON.stringify(rated))).toEqual(rated);
    expect(() => readTournament(JSON.stringify({ ...tournament, analysisVersion: 'neu' }))).toThrow('Archiv-Eintrag nicht lesbar: Analyse-Version');
    const badDay = { ...rated, summary: { ...rated.summary, days: { '2026-10-13': { hands: 1, preflopErrors: 0, postflopErrors: -1 } } } };
    expect(() => readTournament(JSON.stringify(badDay))).toThrow('Archiv-Eintrag nicht lesbar: Zusammenfassung');
  });
});

describe('archive store', () => {
  it('writes hands and tournament in one transaction and reads them back', async () => {
    const backend = memoryReviewBackend();
    const setMany = vi.spyOn(backend, 'setMany');
    await writeRecords(backend, [tournament], [handRecord]);
    expect(setMany).toHaveBeenCalledTimes(1);
    const index = await loadArchiveIndex(backend);
    expect(index).toEqual({ tournaments: [tournament], handIds: new Set([hand.id]), problems: [], newerVersion: false });
    expect(await loadHands(backend, [hand.id, 'TM404'])).toEqual({
      hands: [handRecord],
      problems: [{ key: 'hand:TM404', reason: 'Archiv-Eintrag fehlt' }],
    });
  });

  it('never writes what cannot be read back', async () => {
    const backend = memoryReviewBackend();
    await expect(writeRecords(backend, [{ ...tournament, handIds: [1 as unknown as string] }], [handRecord])).rejects.toThrow(ArchiveFormatError);
    expect(backend.dump()).toEqual({});
  });

  it('skips and reports unreadable entries without deleting them', async () => {
    const backend = memoryReviewBackend({
      [tournamentKey('1')]: 'kaputt',
      [tournamentKey('2')]: JSON.stringify({ ...tournament, id: '2', reviewSchemaVersion: 7 }),
      [tournamentKey(tournament.id)]: JSON.stringify(tournament),
      [handKey(hand.id)]: JSON.stringify(handRecord),
    });
    const index = await loadArchiveIndex(backend);
    expect(index.tournaments).toEqual([tournament]);
    expect(index.newerVersion).toBe(true);
    expect(index.problems).toEqual([
      { key: 'tournament:1', reason: 'Archiv-Eintrag nicht lesbar: kein gültiges JSON' },
      { key: 'tournament:2', reason: 'Archiv-Version 7 ist neuer als diese App' },
    ]);
    expect(Object.keys(backend.dump())).toHaveLength(4);
  });

  it('removes a tournament with its hands', async () => {
    const backend = memoryReviewBackend();
    await writeRecords(backend, [tournament], [handRecord]);
    await removeTournament(backend, tournament);
    expect(backend.dump()).toEqual({});
  });

  it('uses its own IndexedDB database and leaves the save byte for byte unchanged', async () => {
    const saves = indexedDbBackend('pt-review-test');
    await saveState(saves, deserialize(TODAY_SAVE));
    const before = await saves.get(SAVE_KEY);
    const review = indexedDbReviewBackend('pt-review-test-archive');
    await writeRecords(review, [tournament], [handRecord]);
    expect((await loadArchiveIndex(review)).tournaments).toEqual([tournament]);
    expect(await saves.get(SAVE_KEY)).toBe(before);
    expect(before).toBe(TODAY_SAVE);
    expect(await saves.keys()).toEqual([SAVE_KEY]);
  });
});

describe('archive write guards', () => {
  const newer = (r: object) => JSON.stringify({ ...r, reviewSchemaVersion: 2 });

  it('refuses to overwrite a tournament from a newer version', async () => {
    const backend = memoryReviewBackend({ [tournamentKey(tournament.id)]: newer(tournament) });
    const before = backend.dump();
    await expect(writeRecords(backend, [tournament], [handRecord])).rejects.toMatchObject({ code: 'newer-version' });
    expect(backend.dump()).toEqual(before);
  });

  it('refuses to overwrite a hand from a newer version', async () => {
    const backend = memoryReviewBackend({ [handKey(hand.id)]: newer(handRecord) });
    const before = backend.dump();
    await expect(writeRecords(backend, [tournament], [handRecord])).rejects.toMatchObject({ code: 'newer-version' });
    expect(backend.dump()).toEqual(before);
  });

  it('never overwrites an unreadable tournament', async () => {
    const backend = memoryReviewBackend({ [tournamentKey(tournament.id)]: 'kaputt' });
    const before = backend.dump();
    const error = await writeRecords(backend, [tournament], [handRecord]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArchiveFormatError);
    expect((error as ArchiveFormatError).code).toBe('corrupt');
    expect((error as ArchiveFormatError).message).toContain('Turnier im Archiv nicht lesbar');
    expect(backend.dump()).toEqual(before);
  });

  it('replaces an unreadable hand from the fresh import', async () => {
    const backend = memoryReviewBackend({ [handKey(hand.id)]: 'kaputt' });
    await writeRecords(backend, [tournament], [handRecord]);
    expect(backend.dump()[handKey(hand.id)]).toBe(JSON.stringify(handRecord));
  });

  it('refuses to remove a tournament whose hand is from a newer version', async () => {
    const backend = memoryReviewBackend({
      [tournamentKey(tournament.id)]: JSON.stringify(tournament),
      [handKey(hand.id)]: newer(handRecord),
    });
    const before = backend.dump();
    await expect(removeTournament(backend, tournament)).rejects.toMatchObject({ code: 'newer-version' });
    expect(backend.dump()).toEqual(before);
  });

  it('removes unreadable hands of a tournament on explicit request', async () => {
    const backend = memoryReviewBackend({
      [tournamentKey(tournament.id)]: JSON.stringify(tournament),
      [handKey(hand.id)]: 'kaputt',
    });
    await removeTournament(backend, tournament);
    expect(backend.dump()).toEqual({});
  });

  it('passes on a failing transaction and changes nothing', async () => {
    const backend = memoryReviewBackend();
    const quota = new DOMException('voll', 'QuotaExceededError');
    const failing = { ...backend, setMany: () => Promise.reject(quota) };
    await expect(writeRecords(failing, [tournament], [handRecord])).rejects.toBe(quota);
    expect(backend.dump()).toEqual({});
  });
});

describe('names of saved situations (Plan 10)', () => {
  it('reads a hand record with a name and every record without one', () => {
    const named = { ...handRecord, name: 'AKo UTG · 25 BB' };
    expect(readHand(JSON.stringify(named))).toEqual(named);
    expect('name' in readHand(JSON.stringify(handRecord))).toBe(false);
  });

  it('rejects an empty, too long or non-text name', () => {
    for (const name of ['', '   ', 'x'.repeat(MAX_HAND_NAME + 1), 7, null]) {
      expect(() => readHand(JSON.stringify({ ...handRecord, name }))).toThrow('Archiv-Eintrag nicht lesbar: Name');
    }
    expect(readHand(JSON.stringify({ ...handRecord, name: 'x'.repeat(MAX_HAND_NAME) })).name).toHaveLength(MAX_HAND_NAME);
  });
});
