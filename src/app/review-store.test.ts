import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { getPushFoldData } from './data';
import {
  HAND_PREFIX,
  REVIEW_SCHEMA_VERSION,
  handKey,
  memoryReviewBackend,
  readHand,
  readTournament,
  tournamentKey,
} from '../review/archive';
import bounty from '../review/fixtures/bounty.txt?raw';
import dailyClassic from '../review/fixtures/daily-classic.txt?raw';
import steps from '../review/fixtures/step-satellites.txt?raw';
import { LOCK_NEWER_ARCHIVE, LOCK_OTHER_TAB, LOCK_READ_ONLY, type ReviewStoreDeps, createReviewStore } from './review-store';

const file = (name: string, text: string) => ({ name, bytes: strToU8(text) });

async function setup(over: Partial<ReviewStoreDeps> = {}) {
  const backend = memoryReviewBackend();
  const store = createReviewStore({
    backend,
    data: getPushFoldData(),
    canWrite: () => true,
    readOnly: false,
    pause: async () => {},
    ...over,
  });
  await store.load();
  return { store, backend };
}

describe('review store', () => {
  it('starts empty and writable', async () => {
    const { store } = await setup();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', tournaments: [], problems: [], writable: true, lockReason: null });
  });

  it('imports files and ZIPs, groups by tournament and reports the balance', async () => {
    const { store, backend } = await setup();
    const zip = zipSync({ 'daily.txt': strToU8(dailyClassic), 'steps.txt': strToU8(steps) });
    const summary = await store.importFiles([{ name: 'hands.zip', bytes: zip }, file('bounty.txt', bounty), file('x.pdf', '')]);
    expect(summary).toEqual({
      imported: 9,
      duplicates: 0,
      skipped: [{ reason: 'Dateityp nicht unterstützt (nur .txt und .zip)', count: 1 }],
      tournaments: 4,
    });
    const snap = store.getSnapshot();
    expect(snap.lastImport).toEqual(summary);
    expect(snap.progress).toBeNull();
    expect(snap.tournaments.map((t) => [t.name, t.kind, t.handIds.length])).toEqual([
      ['Daily Classic $1', 'normal', 6],
      ['$0.50 Step to The Weekender', 'satellit', 1],
      ['Bounty Hunters $2.50', 'bounty', 1],
      ['$0.50 Step to The Weekender', 'satellit', 1],
    ]);
    expect(snap.tournaments[0].summary).toMatchObject({ hands: 6, preflopErrors: 3 });
    const keys = Object.keys(backend.dump());
    expect(keys.filter((k) => k.startsWith(HAND_PREFIX))).toHaveLength(9);
    expect(readHand(backend.dump()[handKey('TM6532114653')]).reviewSchemaVersion).toBe(REVIEW_SCHEMA_VERSION);
  });

  it('does not import a hand twice and adds new hands to a known tournament', async () => {
    const { store } = await setup();
    const [first, ...rest] = dailyClassic.split(/\n(?=Poker Hand #)/);
    await store.importText(first);
    const summary = await store.importText(dailyClassic);
    expect(summary).toMatchObject({ imported: rest.length, duplicates: 1, tournaments: 1 });
    expect(store.getSnapshot().tournaments).toHaveLength(1);
    expect(store.getSnapshot().tournaments[0].handIds).toHaveLength(6);
  });

  it('reports progress while importing', async () => {
    const seen: unknown[] = [];
    const { store } = await setup();
    store.subscribe(() => seen.push(store.getSnapshot().progress));
    await store.importText(steps);
    expect(seen).toContainEqual({ tournament: 2, tournaments: 2, hand: 1, hands: 1 });
    expect(store.getSnapshot().progress).toBeNull();
  });

  it('opens a tournament with parsed hands and their analysis', async () => {
    const { store } = await setup();
    await store.importText(dailyClassic);
    const open = await store.openTournament('318096259');
    expect(open.hands.map((h) => h.hand.id)).toEqual(open.tournament.handIds);
    expect(open.hands[0].record.analysis.decisions.length).toBeGreaterThan(0);
    expect(open.problems).toEqual([]);
  });

  it('rates hands from an older analysis version again when the tournament is opened', async () => {
    const { store, backend } = await setup();
    await store.importText(bounty);
    const key = handKey('TM6532114653');
    const old = { ...readHand(backend.dump()[key]), analysisVersion: 0, analysis: { version: 0, decisions: [] } };
    await backend.setMany([[key, JSON.stringify(old)]]);
    const open = await store.openTournament('318083464');
    expect(open.hands[0].record.analysisVersion).toBe(1);
    expect(open.hands[0].record.analysis.decisions).toHaveLength(6);
    expect(readHand(backend.dump()[key]).analysisVersion).toBe(1);
  });

  it('changes the kind of a tournament and counts errors again', async () => {
    const { store, backend } = await setup();
    await store.importText(dailyClassic);
    await store.setKind('318096259', 'bounty');
    const t = store.getSnapshot().tournaments[0];
    expect(t).toMatchObject({ kind: 'bounty', detectedKind: 'normal', summary: { preflopErrors: 0, hints: 3 } });
    expect(readTournament(backend.dump()[tournamentKey('318096259')]).kind).toBe('bounty');
  });

  it('deletes a tournament with its hands', async () => {
    const { store, backend } = await setup();
    await store.importText(bounty);
    await store.deleteTournament('318083464');
    expect(store.getSnapshot().tournaments).toEqual([]);
    expect(backend.dump()).toEqual({});
  });

  it('blocks writing in read-only mode, in a reading tab and for a newer archive', async () => {
    const readOnly = await setup({ readOnly: true });
    expect(readOnly.store.getSnapshot()).toMatchObject({ writable: false, lockReason: LOCK_READ_ONLY });
    await expect(readOnly.store.importText(bounty)).rejects.toThrow(LOCK_READ_ONLY);
    expect(readOnly.backend.dump()).toEqual({});

    let writer = false;
    const reader = await setup({ canWrite: () => writer });
    expect(reader.store.getSnapshot().lockReason).toBe(LOCK_OTHER_TAB);
    writer = true;
    reader.store.refreshAccess();
    expect(reader.store.getSnapshot().writable).toBe(true);

    const backend = memoryReviewBackend({ [tournamentKey('9')]: JSON.stringify({ reviewSchemaVersion: 2 }) });
    const newer = createReviewStore({ backend, data: getPushFoldData(), canWrite: () => true, readOnly: false });
    await newer.load();
    expect(newer.getSnapshot()).toMatchObject({ writable: false, lockReason: LOCK_NEWER_ARCHIVE });
  });

  it('reports unreadable entries and keeps them', async () => {
    const backend = memoryReviewBackend({ [tournamentKey('318083464')]: 'kaputt' });
    const store = createReviewStore({ backend, data: getPushFoldData(), canWrite: () => true, readOnly: false, pause: async () => {} });
    await store.load();
    expect(store.getSnapshot().problems).toEqual([{ key: 'tournament:318083464', reason: 'Archiv-Eintrag nicht lesbar: kein gültiges JSON' }]);
    const summary = await store.importText(bounty);
    expect(summary.skipped).toEqual([{ reason: 'Turnier im Archiv nicht lesbar', count: 1 }]);
    expect(backend.dump()).toEqual({ [tournamentKey('318083464')]: 'kaputt' });
  });

  it('exports the archive and merges it into another archive', async () => {
    const source = await setup();
    await source.store.importText(steps);
    await source.store.setKind('318586827', 'normal');
    const { part } = await source.store.exportPart();
    expect(part?.tournaments.map((t) => t.kind).sort()).toEqual(['normal', 'satellit']);
    expect(part?.hands).toHaveLength(2);

    const target = await setup();
    await target.store.importText(steps.split(/\n(?=Poker Hand #)/)[0]);
    const summary = await target.store.mergeExport(part!);
    expect(summary).toMatchObject({ imported: 1, duplicates: 1 });
    expect(target.store.getSnapshot().tournaments.find((t) => t.id === '318586827')?.kind).toBe('normal');
    expect(await (await setup()).store.exportPart()).toEqual({ part: null, omitted: 0 });
  });

  it('skips a tournament whose stored record is from a newer version, reports it and continues with the others', async () => {
    const { store, backend } = await setup();
    await store.importText(bounty);
    // A newer app version rewrote the tournament record after this tab loaded the index.
    const newerText = JSON.stringify({ reviewSchemaVersion: 2 });
    await backend.setMany([[tournamentKey('318083464'), newerText]]);
    const bountyHands = bounty.split(/\n(?=Poker Hand #)/);
    const extra = bountyHands[0].replace(/TM6532114653/g, 'TM9999999991');
    const summary = await store.importText(`${extra}\n\n${steps}`);
    expect(summary.imported).toBe(2);
    expect(summary.tournaments).toBe(2);
    expect(summary.failures).toEqual([expect.stringContaining('Bounty Hunters $2.50')]);
    expect(backend.dump()[tournamentKey('318083464')]).toBe(newerText);
    expect(backend.dump()[handKey('TM9999999991')]).toBeUndefined();
  });

  it('reloads the archive index when this tab becomes the writer, so it never drops the hands of another tab', async () => {
    const backend = memoryReviewBackend();
    let writer = false;
    const mk = (canWrite: () => boolean) =>
      createReviewStore({ backend, data: getPushFoldData(), canWrite, readOnly: false, pause: async () => {} });
    const a = mk(() => true);
    const b = mk(() => writer);
    await a.load();
    await b.load();
    const hands = dailyClassic.split(/\n(?=Poker Hand #)/);
    await a.importText(hands.slice(0, 2).join('\n\n'));
    writer = true;
    await b.refreshAccess();
    await b.importText(hands.slice(2, 4).join('\n\n'));
    expect(b.getSnapshot().tournaments[0].handIds).toHaveLength(4);
    const stored = readTournament(backend.dump()[tournamentKey(b.getSnapshot().tournaments[0].id)]);
    expect(stored.handIds).toHaveLength(4);
  });

  it('rejects kind change and delete while an import is running', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let hold = false;
    const { store } = await setup({ pause: () => (hold ? gate : Promise.resolve()) });
    await store.importText(bounty);
    hold = true;
    const id = store.getSnapshot().tournaments[0].id;
    const running = store.importText(steps);
    expect(store.getSnapshot().progress).not.toBeNull();
    await expect(store.setKind(id, 'normal')).rejects.toThrow('Während eines Imports nicht möglich');
    await expect(store.deleteTournament(id)).rejects.toThrow('Während eines Imports nicht möglich');
    release();
    await running;
    expect(store.getSnapshot().tournaments.find((t) => t.id === id)?.kind).toBe('bounty');
  });

  it('counts unreadable archive entries that the export leaves out', async () => {
    const backend = memoryReviewBackend({ [tournamentKey('999')]: 'kaputt' });
    const { store } = await setup({ backend });
    await store.importText(bounty);
    const { part, omitted } = await store.exportPart();
    expect(part?.hands).toHaveLength(1);
    expect(omitted).toBe(1);
  });
});
