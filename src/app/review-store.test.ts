import { strToU8, zipSync } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { getPushFoldData } from './data';
import { ANALYSIS_VERSION } from '../review/analysis';
import { type HandAnalyzer, createInlineAnalyzer } from '../review/analyzer';
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
import { answerRetraining, forgetRetraining, retrainingOf, syncRetraining } from '../game/retraining';
import { type SaveState, emptyState } from '../storage/schema';
import {
  LOCK_NEWER_ARCHIVE,
  LOCK_OTHER_TAB,
  LOCK_READ_ONLY,
  type RetrainingSink,
  type ReviewStoreDeps,
  createReviewStore,
} from './review-store';

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
    expect(open.hands[0].record.analysisVersion).toBe(ANALYSIS_VERSION);
    expect(open.hands[0].record.analysis.decisions).toHaveLength(6);
    expect(readHand(backend.dump()[key]).analysisVersion).toBe(ANALYSIS_VERSION);
    expect(store.getSnapshot().reanalysis).toBeNull();
  });

  it('rates stale tournaments again in the background, reports progress and stores the result', async () => {
    const { store, backend } = await setup();
    await store.importText(dailyClassic);
    // Make it look like Plan 7 wrote the archive: version 1 everywhere, no postflop ratings.
    const dump = backend.dump();
    const stale: [string, string][] = Object.entries(dump).map(([k, v]) => {
      const record = JSON.parse(v);
      if (k.startsWith(HAND_PREFIX)) return [k, JSON.stringify({ ...record, analysisVersion: 1, analysis: { version: 1, decisions: [] } })];
      const { analysisVersion: _, ...plan7 } = record;
      return [k, JSON.stringify(plan7)];
    });
    await backend.setMany(stale);
    await store.load();
    expect(store.getSnapshot().tournaments[0].analysisVersion).toBeUndefined();
    const seen: unknown[] = [];
    store.subscribe(() => seen.push(store.getSnapshot().reanalysis));
    await store.refreshStale();
    expect(seen).toContainEqual({ tournament: 1, tournaments: 1, hand: 6, hands: 6 });
    expect(store.getSnapshot().reanalysis).toBeNull();
    const t = readTournament(backend.dump()[tournamentKey('318096259')]);
    expect(t.analysisVersion).toBe(ANALYSIS_VERSION);
    expect(t.summary.preflopErrors).toBe(3);
    expect(Object.values(t.summary.days)[0].postflopErrors).toBe(t.summary.postflopErrors);
    expect(t.handIds.every((id) => readHand(backend.dump()[handKey(id)]).analysisVersion === ANALYSIS_VERSION)).toBe(true);
    // Nothing left to do: no progress the second time.
    seen.length = 0;
    await store.refreshStale();
    expect(seen.filter((r) => r !== null)).toEqual([]);
  });

  it('never loses imported hands while the background re-rating runs', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let hold = false;
    const { store, backend } = await setup({ pause: () => (hold ? gate : Promise.resolve()) });
    const hands = dailyClassic.split(/\n(?=Poker Hand #)/);
    await store.importText(hands.slice(0, 3).join('\n\n'));
    const [first] = store.getSnapshot().tournaments;
    await backend.setMany([[tournamentKey(first.id), JSON.stringify({ ...first, analysisVersion: 1 })]]);
    await store.load();
    hold = true;
    const refresh = store.refreshStale();
    const imported = store.importText(hands.slice(3).join('\n\n'));
    release();
    await Promise.all([refresh, imported]);
    expect(readTournament(backend.dump()[tournamentKey(first.id)]).handIds).toHaveLength(6);
    expect(store.getSnapshot().tournaments[0].handIds).toHaveLength(6);
  });

  describe('hands that cannot be read keep their id', () => {
    const six = dailyClassic.split(/\n(?=Poker Hand #)/);
    async function withCorruptHand() {
      const ctx = await setup();
      await ctx.store.importText(dailyClassic);
      const [tournament] = ctx.store.getSnapshot().tournaments;
      const corruptId = tournament.handIds[1];
      await ctx.backend.setMany([[handKey(corruptId), 'kaputt']]);
      return { ...ctx, tournament, corruptId };
    }
    const stored = (backend: { dump(): Record<string, string> }, id: string) => readTournament(backend.dump()[tournamentKey(id)]);

    it('when a re-rated tournament is opened in the writing tab', async () => {
      const { store, backend, tournament, corruptId } = await withCorruptHand();
      const key = handKey(tournament.handIds[0]);
      const old = { ...readHand(backend.dump()[key]), analysisVersion: 0, analysis: { version: 0, decisions: [] } };
      await backend.setMany([[key, JSON.stringify(old)]]);
      const open = await store.openTournament(tournament.id);
      expect(readHand(backend.dump()[key]).analysisVersion).toBe(ANALYSIS_VERSION);
      expect(stored(backend, tournament.id).handIds).toEqual(tournament.handIds);
      expect(store.getSnapshot().tournaments[0].handIds).toContain(corruptId);
      expect(open.problems.map((p) => p.key)).toContain(`hand:${corruptId}`);
    });

    it('when the kind is changed', async () => {
      const { store, backend, tournament } = await withCorruptHand();
      await store.setKind(tournament.id, 'bounty');
      expect(stored(backend, tournament.id)).toMatchObject({ kind: 'bounty', handIds: tournament.handIds });
    });

    it('when more hands are imported or merged into the tournament', async () => {
      const { store, backend } = await setup();
      await store.importText(six.slice(0, 3).join('\n\n'));
      const [tournament] = store.getSnapshot().tournaments;
      const corruptId = tournament.handIds[1];
      await backend.setMany([[handKey(corruptId), 'kaputt']]);
      await store.importText(six.slice(3).join('\n\n'));
      const ids = stored(backend, tournament.id).handIds;
      expect(ids).toHaveLength(6);
      expect(ids).toContain(corruptId);
      expect(new Set(ids).size).toBe(6);
      expect(ids.filter((id) => tournament.handIds.includes(id))).toEqual(tournament.handIds);
    });
  });

  describe('lost writer lock while hands are being rated', () => {
    async function slowStore() {
      let writer = true;
      let armed = false;
      const inline = createInlineAnalyzer(getPushFoldData(), async () => {});
      const analyzer: HandAnalyzer = {
        analyze: async (hands, onProgress) => {
          const out = await inline.analyze(hands, onProgress);
          if (armed) writer = false;
          return out;
        },
      };
      const { store, backend } = await setup({ canWrite: () => writer, analyzer });
      await store.importText(bounty);
      const key = handKey('TM6532114653');
      const hand = { ...readHand(backend.dump()[key]), analysisVersion: 1, analysis: { version: 1, decisions: [] } };
      const tournament = { ...readTournament(backend.dump()[tournamentKey('318083464')]), analysisVersion: 1 };
      await backend.setMany([[key, JSON.stringify(hand)], [tournamentKey('318083464'), JSON.stringify(tournament)]]);
      await store.load();
      armed = true;
      return { store, backend };
    }

    it('openTournament keeps the result in memory only', async () => {
      const { store, backend } = await slowStore();
      const before = backend.dump();
      const open = await store.openTournament('318083464');
      expect(open.hands[0].record.analysisVersion).toBe(ANALYSIS_VERSION);
      expect(backend.dump()).toEqual(before);
    });

    it('refreshStale writes nothing', async () => {
      const { store, backend } = await slowStore();
      const before = backend.dump();
      await store.refreshStale();
      expect(backend.dump()).toEqual(before);
    });
  });

  it('rates in memory only in a reading tab and never writes there', async () => {
    const backend = memoryReviewBackend();
    const writer = createReviewStore({ backend, data: getPushFoldData(), canWrite: () => true, readOnly: false, pause: async () => {} });
    await writer.load();
    await writer.importText(bounty);
    const key = handKey('TM6532114653');
    const old = JSON.stringify({ ...readHand(backend.dump()[key]), analysisVersion: 1, analysis: { version: 1, decisions: [] } });
    await backend.setMany([[key, old]]);
    const reader = createReviewStore({ backend, data: getPushFoldData(), canWrite: () => false, readOnly: false, pause: async () => {} });
    await reader.load();
    await reader.refreshStale();
    const open = await reader.openTournament('318083464');
    expect(open.hands[0].record.analysisVersion).toBe(ANALYSIS_VERSION);
    expect(backend.dump()[key]).toBe(old);
  });

  it('rates imports with the analyzer it was given', async () => {
    let calls = 0;
    const inline = createInlineAnalyzer(getPushFoldData(), async () => {});
    const analyzer: HandAnalyzer = {
      analyze: (hands, onProgress) => {
        calls++;
        return inline.analyze(hands, onProgress);
      },
    };
    const { store } = await setup({ analyzer });
    await store.importText(`${bounty}\n\n${steps}`);
    expect(calls).toBe(3);
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

describe('retraining queue (spec 10)', () => {
  const ERRORS = ['TM6532186101:15', 'TM6533069892:17', 'TM6532734973:13'];

  function queueSink(initial: SaveState = emptyState()) {
    let state = initial;
    const sink: RetrainingSink = {
      synced: () => new Set(retrainingOf(state).synced),
      sync: (id, candidates) => {
        state = syncRetraining(state, id, candidates);
      },
      forget: (id) => {
        state = forgetRetraining(state, id);
      },
    };
    return {
      sink,
      keys: () => retrainingOf(state).entries.map((e) => e.key),
      state: () => state,
      answer: (key: string) => {
        state = answerRetraining(answerRetraining(state, key, 'correct'), key, 'correct');
      },
    };
  }

  it('feeds the preflop errors of a normal tournament on import, never those of satellites and bounty tournaments', async () => {
    const queue = queueSink();
    const { store } = await setup({ retraining: queue.sink });
    await store.importText(`${steps}\n\n${bounty}`);
    expect(queue.state().retraining).toBeUndefined();
    await store.importText(dailyClassic);
    expect(queue.keys()).toEqual(ERRORS);
    expect(retrainingOf(queue.state()).entries[0]).toMatchObject({ tournamentId: '318096259', playedAt: '2026-10-13 13:15:28', streak: 0 });
    expect([...queue.sink.synced()]).toEqual(['318096259']);
    await store.importText(dailyClassic);
    expect(queue.keys()).toEqual(ERRORS);
  });

  it('follows kind changes and deletion; cleared spots stay cleared', async () => {
    const queue = queueSink();
    const { store } = await setup({ retraining: queue.sink });
    await store.importText(dailyClassic);
    queue.answer(ERRORS[0]);
    await store.setKind('318096259', 'bounty');
    expect(queue.keys()).toEqual([]);
    await store.setKind('318096259', 'normal');
    expect(queue.keys()).toEqual(ERRORS.slice(1));
    await store.deleteTournament('318096259');
    expect(retrainingOf(queue.state())).toEqual({ entries: [], done: [ERRORS[0]], synced: [] });
  });

  it('feeds an archive from before Plan 9 once, only in the writing tab', async () => {
    const backend = memoryReviewBackend();
    const old = createReviewStore({ backend, data: getPushFoldData(), canWrite: () => true, readOnly: false, pause: async () => {} });
    await old.load();
    await old.importText(`${dailyClassic}\n\n${bounty}`);

    const queue = queueSink();
    let writer = false;
    const store = createReviewStore({
      backend, data: getPushFoldData(), canWrite: () => writer, readOnly: false, pause: async () => {}, retraining: queue.sink,
    });
    await store.load();
    await store.syncRetraining();
    expect(queue.state().retraining).toBeUndefined();
    writer = true;
    await store.refreshAccess();
    await store.syncRetraining();
    expect(queue.keys()).toEqual(ERRORS);
    expect([...queue.sink.synced()]).toEqual(['318096259']);
    queue.answer(ERRORS[2]);
    await store.syncRetraining();
    expect(queue.keys()).toEqual(ERRORS.slice(0, 2));
  });

  it('feeds tournaments that are rated again in the background', async () => {
    const queue = queueSink();
    const { store, backend } = await setup();
    await store.importText(dailyClassic);
    const stale: [string, string][] = Object.entries(backend.dump()).map(([k, v]) => {
      const record = JSON.parse(v);
      if (k.startsWith(HAND_PREFIX)) return [k, JSON.stringify({ ...record, analysisVersion: 1, analysis: { version: 1, decisions: [] } })];
      return [k, JSON.stringify({ ...record, analysisVersion: 1 })];
    });
    await backend.setMany(stale);
    const fresh = createReviewStore({ backend, data: getPushFoldData(), canWrite: () => true, readOnly: false, pause: async () => {}, retraining: queue.sink });
    await fresh.load();
    await fresh.syncRetraining();
    expect(queue.keys()).toEqual([]);
    await fresh.refreshStale();
    expect(queue.keys()).toEqual(ERRORS);
  });

  it('keeps the archive write when the queue fails', async () => {
    const sink: RetrainingSink = {
      synced: () => new Set(),
      sync: () => {
        throw new Error('voll');
      },
      forget: () => {
        throw new Error('voll');
      },
    };
    const { store, backend } = await setup({ retraining: sink });
    expect(await store.importText(dailyClassic)).toMatchObject({ imported: 6, tournaments: 1 });
    expect(readTournament(backend.dump()[tournamentKey('318096259')]).handIds).toHaveLength(6);
    await store.deleteTournament('318096259');
    expect(backend.dump()).toEqual({});
  });

  it('reports queue failures through onError without failing the archive write', async () => {
    const failure = new Error('voll');
    const sink: RetrainingSink = {
      synced: () => new Set(),
      sync: () => {
        throw failure;
      },
      forget: () => {
        throw failure;
      },
    };
    const onError = vi.fn();
    const { store, backend } = await setup({ retraining: sink, onError });
    await store.importText(dailyClassic);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenLastCalledWith(failure);
    expect(readTournament(backend.dump()[tournamentKey('318096259')]).handIds).toHaveLength(6);
    await store.deleteTournament('318096259');
    expect(onError).toHaveBeenCalledTimes(2);
    expect(backend.dump()).toEqual({});
  });

  it('reports queue failures of the one-time sync through onError', async () => {
    const backend = memoryReviewBackend();
    const first = await setup({ backend });
    await first.store.importText(dailyClassic);
    const failure = new Error('voll');
    const onError = vi.fn();
    const sink: RetrainingSink = {
      synced: () => new Set(),
      sync: () => {
        throw failure;
      },
      forget: () => {},
    };
    const { store } = await setup({ backend, retraining: sink, onError });
    await store.syncRetraining();
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it('marks tournaments as synced even without mappable candidates, only in the one-time sync', async () => {
    const calls: Array<[string, number, boolean | undefined]> = [];
    const sink: RetrainingSink = {
      synced: () => new Set(),
      sync: (id, candidates, markSynced) => {
        calls.push([id, candidates.length, markSynced]);
      },
      forget: () => {},
    };
    const { store, backend } = await setup({ retraining: sink });
    await store.importText(dailyClassic);
    expect(calls).toEqual([['318096259', 3, undefined]]);
    const { store: later } = await setup({ backend, retraining: sink });
    await later.syncRetraining();
    expect(calls[1]).toEqual(['318096259', 3, true]);
  });
});
