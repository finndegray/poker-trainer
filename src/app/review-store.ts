import type { PushFoldData } from '../engine/pushfold-data';
import type { RetrainingCandidate } from '../game/retraining';
import { ANALYSIS_VERSION, type HandAnalysis } from '../review/analysis';
import { type HandAnalyzer, createInlineAnalyzer } from '../review/analyzer';
import {
  ArchiveFormatError,
  type ArchiveProblem,
  type HandRecord,
  REVIEW_SCHEMA_VERSION,
  type ReviewBackend,
  TOURNAMENT_PREFIX,
  type TournamentRecord,
  isHandAnalysis,
  isHandName,
  loadArchiveIndex,
  loadHands,
  removeTournament,
  writeRecords,
} from '../review/archive';
import type { ArchiveExport } from '../review/export';
import {
  type ImportFile,
  type ImportProgress,
  type ImportSummary,
  type ImportText,
  analyzePlan,
  countSkipped,
  extractTexts,
  handRecordOf,
  planImport,
  tournamentRecordOf,
  writeFailureMessage,
} from '../review/import';
import { HandParseError, type ParsedHand, type SkippedHand, parseHand } from '../review/parse';
import { retrainingCandidates } from '../review/retraining';
import { situationKindOf } from '../review/situation-tournaments';
import type { TournamentKind } from '../review/tournament-kind';

export type ReviewHand = { record: HandRecord; hand: ParsedHand };
export type OpenTournament = { tournament: TournamentRecord; hands: ReviewHand[]; problems: ArchiveProblem[] };
export type ReviewSnapshot = {
  status: 'loading' | 'ready' | 'failed';
  /** Newest first. */
  tournaments: TournamentRecord[];
  /** Unreadable archive entries: skipped and reported, never deleted. */
  problems: ArchiveProblem[];
  writable: boolean;
  /** Why import, kind change and delete are blocked; null when writable. */
  lockReason: string | null;
  progress: ImportProgress | null;
  /** Archived hands being rated again after a logic change (ANALYSIS_VERSION); null when idle. */
  reanalysis: ImportProgress | null;
  lastImport: ImportSummary | null;
};
/** Where the preflop errors go (spec 10): the retraining queue in the save; main.tsx passes the game store. */
export type RetrainingSink = {
  /** Tournaments whose hands were fed in already. */
  synced(): ReadonlySet<string>;
  /** Replaces the queued spots of one tournament with its current errors. */
  /** `markSynced`: the one-time read of an archive; the tournament counts as read even without any spot. */
  sync(tournamentId: string, candidates: readonly RetrainingCandidate[], markSynced?: boolean): void;
  forget(tournamentId: string): void;
};
export type ReviewStoreDeps = {
  backend: ReviewBackend;
  data: PushFoldData;
  /** The writer lock of the save (one writing tab); checked before every write. */
  canWrite: () => boolean;
  /** The save comes from a newer app version. */
  readOnly: boolean;
  /** Rates hands; main.tsx passes the Web Worker analyzer. Default: on the main thread in chunks. */
  analyzer?: HandAnalyzer;
  pause?: () => Promise<void>;
  /** The retraining queue; without it (tests, tools) nothing is fed. */
  retraining?: RetrainingSink;
  /** Failures of the queue (it never fails an archive write, but they must not vanish); main.tsx passes the logger. */
  onError?: (error: unknown) => void;
};
export type ReviewStore = {
  /** The push/fold data the ratings use (charts and comparisons in the hand view). */
  readonly data: PushFoldData;
  getSnapshot(): ReviewSnapshot;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  /** Re-checks the writer lock and reloads the archive index, e.g. after this tab became the writer (other tabs may have written meanwhile). */
  refreshAccess(): Promise<void>;
  importFiles(files: readonly ImportFile[]): Promise<ImportSummary>;
  importText(text: string): Promise<ImportSummary>;
  openTournament(id: string): Promise<OpenTournament>;
  /**
   * Rates every tournament whose hands come from an older analysis version again and stores the result, one
   * tournament after the other. Only in the writing tab; does nothing otherwise or while it already runs.
   */
  refreshStale(): Promise<void>;
  setKind(id: string, kind: TournamentKind): Promise<void>;
  deleteTournament(id: string): Promise<void>;
  /** The archive part of a manual export (null when the archive is empty) and the number of unreadable entries left out of it. */
  exportPart(): Promise<{ part: ArchiveExport | null; omitted: number }>;
  /** Merges the archive part of an export file (hand numbers decide about duplicates). */
  mergeExport(part: ArchiveExport): Promise<ImportSummary>;
  /**
   * Feeds the preflop errors of normal tournaments that were never fed into the retraining queue (archives from
   * before Plan 9, or after a save import). Writing tab only; tournaments that wait for a new rating are fed by
   * `refreshStale` instead.
   */
  syncRetraining(): Promise<void>;
  /** Rates one hand with the analyzer of the store (Web Worker with fallback) and writes nothing: the live rating of a situation. */
  rateHand(hand: ParsedHand): Promise<HandAnalysis>;
  /**
   * Saves an entered situation (its generated hand text) with a name into its situation tournament, the same way an
   * import does (rating, archive write, retraining queue). Writing tab only; throws a German message otherwise.
   */
  saveSituation(raw: string, name: string): Promise<TournamentRecord>;
};

export const SITUATION_SAVED_ALREADY = 'Diese Situation ist schon gespeichert.';
export const SITUATION_NAME_INVALID = 'Bitte gib einen Namen mit höchstens 60 Zeichen ein.';

export const LOCK_READ_ONLY = 'Nur-Lesen-Modus: Bitte die App aktualisieren, um Hände zu importieren.';
export const LOCK_NEWER_ARCHIVE = 'Das Hand-Archiv stammt aus einer neueren Version – bitte die App aktualisieren.';
export const LOCK_OTHER_TAB = 'Import ist nur in dem Tab möglich, der deinen Fortschritt speichert.';
export const BLOCKED_DURING_IMPORT = 'Während eines Imports nicht möglich.';
export const LOCK_FAILED = 'Das Hand-Archiv konnte nicht geladen werden.';

const byNewest = (a: TournamentRecord, b: TournamentRecord) => b.lastPlayedAt.localeCompare(a.lastPlayedAt) || a.id.localeCompare(b.id);

/** The game store as the sink of the retraining queue. */
export const retrainingSinkOf = (game: {
  retrainingSynced(): ReadonlySet<string>;
  syncRetraining(tournamentId: string, candidates: readonly RetrainingCandidate[], markSynced?: boolean): void;
  forgetRetraining(tournamentId: string): void;
}): RetrainingSink => ({
  synced: () => game.retrainingSynced(),
  sync: (id, candidates, markSynced) => game.syncRetraining(id, candidates, markSynced),
  forget: (id) => game.forgetRetraining(id),
});

export function createReviewStore(deps: ReviewStoreDeps): ReviewStore {
  const { backend, data, canWrite, readOnly } = deps;
  const analyzer = deps.analyzer ?? createInlineAnalyzer(data, deps.pause);
  let newerArchive = false;
  const listeners = new Set<() => void>();
  let chain: Promise<unknown> = Promise.resolve();

  const lockReasonOf = (status: ReviewSnapshot['status']): string | null => {
    if (readOnly) return LOCK_READ_ONLY;
    if (status === 'failed') return LOCK_FAILED;
    if (newerArchive) return LOCK_NEWER_ARCHIVE;
    if (!canWrite()) return LOCK_OTHER_TAB;
    return null;
  };
  let snapshot: ReviewSnapshot = {
    status: 'loading',
    tournaments: [],
    problems: [],
    writable: false,
    lockReason: null,
    progress: null,
    reanalysis: null,
    lastImport: null,
  };
  const update = (patch: Partial<ReviewSnapshot>) => {
    const next = { ...snapshot, ...patch };
    const lockReason = next.status === 'loading' ? null : lockReasonOf(next.status);
    snapshot = { ...next, lockReason, writable: next.status === 'ready' && lockReason === null };
    for (const listener of [...listeners]) listener();
  };
  /** One archive write at a time, in order. */
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  };
  const assertWritable = () => {
    if (snapshot.status === 'ready') update({});
    if (!snapshot.writable) throw new Error(snapshot.lockReason ?? 'Das Hand-Archiv wird noch geladen.');
  };

  type LoadedHands = { hands: ReviewHand[]; changed: HandRecord[]; problems: ArchiveProblem[] };

  /**
   * Loads the hands of a tournament, parses the stored texts and rates every hand again whose analysis is missing,
   * broken or from another version (`changed`). Unreadable texts are reported, never deleted.
   */
  async function loadTournamentHands(tournament: TournamentRecord, onProgress?: (done: number, total: number) => void): Promise<LoadedHands> {
    const loaded = await loadHands(backend, tournament.handIds);
    const problems = [...loaded.problems];
    const parsed: ReviewHand[] = [];
    const stale: number[] = [];
    for (const record of loaded.hands) {
      let hand: ParsedHand;
      try {
        hand = parseHand(record.raw);
      } catch (error) {
        if (!(error instanceof HandParseError)) throw error;
        problems.push({ key: `hand:${record.id}`, reason: 'Hand-Text nicht lesbar' });
        continue;
      }
      if (record.analysisVersion !== ANALYSIS_VERSION || !isHandAnalysis(record.analysis)) stale.push(parsed.length);
      parsed.push({ record, hand });
    }
    const analyses =
      stale.length === 0 ? [] : await analyzer.analyze(stale.map((i) => parsed[i].hand), (done) => onProgress?.(done, stale.length));
    const changed: HandRecord[] = [];
    stale.forEach((i, k) => {
      const record: HandRecord = { ...parsed[i].record, analysis: analyses[k], analysisVersion: analyses[k].version };
      parsed[i] = { record, hand: parsed[i].hand };
      changed.push(record);
    });
    return { hands: parsed, changed, problems };
  }

  const isCurrent = (t: TournamentRecord) => (t.analysisVersion ?? 1) === ANALYSIS_VERSION;

  /** After every archive write of a tournament: its current preflop errors replace its part of the queue. */
  const feed = (tournament: TournamentRecord, hands: readonly HandRecord[], markSynced?: boolean) => {
    const sink = deps.retraining;
    if (!sink) return;
    const rated = hands.filter((h) => h.analysisVersion === ANALYSIS_VERSION && isHandAnalysis(h.analysis));
    try {
      sink.sync(tournament.id, retrainingCandidates(tournament.kind, rated), markSynced);
    } catch (error) {
      // The queue is only a copy of the archived errors: it must never fail an archive write that already happened.
      deps.onError?.(error);
    }
  };
  let refreshing: Promise<void> | null = null;

  const replaceTournament = (record: TournamentRecord) =>
    [...snapshot.tournaments.filter((t) => t.id !== record.id), record].sort(byNewest);

  async function importTexts(
    texts: readonly ImportText[],
    fileSkipped: readonly SkippedHand[],
    kinds: ReadonlyMap<string, TournamentKind> = new Map(),
    names: ReadonlyMap<string, string> = new Map(),
  ): Promise<ImportSummary> {
    assertWritable();
    if (snapshot.progress) throw new Error('Es läuft bereits ein Import.');
    const existing = new Set(snapshot.tournaments.flatMap((t) => t.handIds));
    const blocked = new Set(
      snapshot.problems.filter((p) => p.key.startsWith(TOURNAMENT_PREFIX)).map((p) => p.key.slice(TOURNAMENT_PREFIX.length)),
    );
    const plan = planImport(texts, existing, blocked);
    update({ progress: { tournament: 0, tournaments: plan.tournaments.size, hand: 0, hands: 0 } });
    try {
      const analyzed = await analyzePlan(plan, analyzer, (progress) => update({ progress }));
      let imported = 0;
      let tournaments = 0;
      const failures: string[] = [];
      for (const [id, items] of analyzed) {
        const added = items.map((item) => handRecordOf(item, names.get(item.hand.id)));
        try {
          // Load, merge and write in one serial step, so a background re-rating never interleaves with it.
          const record = await serial(async () => {
            const previous = snapshot.tournaments.find((t) => t.id === id) ?? null;
            const old: LoadedHands = previous ? await loadTournamentHands(previous) : { hands: [], changed: [], problems: [] };
            const next = tournamentRecordOf(
              id,
              items[0].hand.tournamentName,
              [...old.hands.map((h) => h.record), ...added],
              previous,
              previous ? null : (kinds.get(id) ?? null),
            );
            assertWritable();
            await writeRecords(backend, [next], [...old.changed, ...added]);
            feed(next, [...old.hands.map((h) => h.record), ...added]);
            return next;
          });
          imported += added.length;
          tournaments += 1;
          update({ tournaments: replaceTournament(record) });
        } catch (error) {
          // A refused tournament (newer version, unreadable record) is reported; the others continue.
          const name = snapshot.tournaments.find((t) => t.id === id)?.name ?? items[0].hand.tournamentName;
          failures.push(writeFailureMessage(error, name));
        }
      }
      const summary: ImportSummary = {
        imported,
        duplicates: plan.duplicates,
        skipped: countSkipped([...fileSkipped, ...plan.skipped]),
        tournaments,
        ...(failures.length > 0 ? { failures } : {}),
      };
      update({ progress: null, lastImport: summary });
      return summary;
    } catch (error) {
      update({ progress: null });
      throw error;
    }
  }

  const store: ReviewStore = {
    data,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async load() {
      try {
        const index = await loadArchiveIndex(backend);
        newerArchive = index.newerVersion;
        update({ status: 'ready', tournaments: [...index.tournaments].sort(byNewest), problems: index.problems });
      } catch {
        update({ status: 'failed' });
      }
    },
    async refreshAccess() {
      update({});
      // Another tab may have written while this one only read; never build records from a stale index.
      await store.load();
    },
    importFiles(files) {
      const { texts, skipped } = extractTexts(files);
      return importTexts(texts, skipped);
    },
    importText(text) {
      return importTexts([{ name: 'Eingefügt', text }], []);
    },
    openTournament(id) {
      if (!snapshot.tournaments.some((t) => t.id === id)) return Promise.reject(new Error('Turnier nicht gefunden'));
      const open = async (): Promise<OpenTournament> => {
        const tournament = snapshot.tournaments.find((t) => t.id === id);
        if (!tournament) throw new Error('Turnier nicht gefunden');
        let shown = false;
        try {
          const loaded = await loadTournamentHands(tournament, (hand, hands) => {
            shown = true;
            update({ reanalysis: { tournament: 1, tournaments: 1, hand, hands } });
          });
          let current = tournament;
          // Hands rated by an older version are rated again; the result is kept when this tab may write.
          if (loaded.changed.length > 0) {
            current = tournamentRecordOf(id, tournament.name, loaded.hands.map((h) => h.record), tournament);
            // The lock may have gone while the hands were rated: re-check right before the write.
            update({});
            if (snapshot.writable) {
              await writeRecords(backend, [current], loaded.changed);
              update({ tournaments: replaceTournament(current) });
              feed(current, loaded.hands.map((h) => h.record));
            }
          }
          return { tournament: current, hands: loaded.hands, problems: loaded.problems };
        } finally {
          if (shown && !refreshing) update({ reanalysis: null });
        }
      };
      // A writing tab loads, rates and stores in one serial step; a reading tab rates in memory only.
      return snapshot.writable ? serial(open) : open();
    },
    refreshStale() {
      if (refreshing) return refreshing;
      if (snapshot.status === 'ready') update({});
      const ids = snapshot.writable ? snapshot.tournaments.filter((t) => !isCurrent(t)).map((t) => t.id) : [];
      if (ids.length === 0) return Promise.resolve();
      const run = async () => {
        try {
          for (const [k, id] of ids.entries()) {
            const stop = await serial(async () => {
              update({});
              if (!snapshot.writable) return true;
              const tournament = snapshot.tournaments.find((t) => t.id === id);
              if (!tournament || isCurrent(tournament)) return false;
              const loaded = await loadTournamentHands(tournament, (hand, hands) =>
                update({ reanalysis: { tournament: k + 1, tournaments: ids.length, hand, hands } }),
              );
              // A tournament with unreadable hands keeps its record; opening it shows the problem.
              if (loaded.problems.length > 0) return false;
              const record = tournamentRecordOf(id, tournament.name, loaded.hands.map((h) => h.record), tournament);
              update({});
              if (!snapshot.writable) return true;
              try {
                await writeRecords(backend, [record], loaded.changed);
              } catch (error) {
                if (!(error instanceof ArchiveFormatError)) throw error;
                return false;
              }
              update({ tournaments: replaceTournament(record) });
              feed(record, loaded.hands.map((h) => h.record));
              return false;
            });
            if (stop) break;
          }
        } finally {
          refreshing = null;
          update({ reanalysis: null });
        }
      };
      refreshing = run();
      return refreshing;
    },
    async setKind(id, kind) {
      assertWritable();
      if (snapshot.progress) throw new Error(BLOCKED_DURING_IMPORT);
      if (!snapshot.tournaments.some((t) => t.id === id)) throw new Error('Turnier nicht gefunden');
      await serial(async () => {
        const tournament = snapshot.tournaments.find((t) => t.id === id);
        if (!tournament) throw new Error('Turnier nicht gefunden');
        const loaded = await loadTournamentHands(tournament);
        const record = tournamentRecordOf(id, tournament.name, loaded.hands.map((h) => h.record), tournament, kind);
        assertWritable();
        await writeRecords(backend, [record], loaded.changed);
        update({ tournaments: replaceTournament(record) });
        feed(record, loaded.hands.map((h) => h.record));
      });
    },
    async deleteTournament(id) {
      assertWritable();
      if (snapshot.progress) throw new Error(BLOCKED_DURING_IMPORT);
      const tournament = snapshot.tournaments.find((t) => t.id === id);
      if (!tournament) return;
      await serial(() => removeTournament(backend, tournament));
      update({ tournaments: snapshot.tournaments.filter((t) => t.id !== id) });
      try {
        deps.retraining?.forget(id);
      } catch (error) {
        // As in feed: the archive change stands.
        deps.onError?.(error);
      }
    },
    async exportPart() {
      let omitted = snapshot.problems.length;
      if (snapshot.tournaments.length === 0) return { part: null, omitted };
      const part: ArchiveExport = { reviewSchemaVersion: REVIEW_SCHEMA_VERSION, tournaments: [], hands: [] };
      for (const t of snapshot.tournaments) {
        part.tournaments.push({ id: t.id, name: t.name, kind: t.kind });
        const { hands, problems } = await loadHands(backend, t.handIds);
        omitted += problems.length;
        for (const h of hands) part.hands.push({ id: h.id, tournamentId: h.tournamentId, raw: h.raw, ...(h.name === undefined ? {} : { name: h.name }) });
      }
      return { part, omitted };
    },
    mergeExport(part) {
      const kinds = new Map(part.tournaments.map((t) => [t.id, t.kind] as const));
      const texts = part.hands.map((h) => ({ name: 'Export', text: h.raw }));
      const names = new Map(part.hands.flatMap((h) => (h.name === undefined ? [] : [[h.id, h.name] as const])));
      return importTexts(texts, [], kinds, names);
    },
    async syncRetraining() {
      const sink = deps.retraining;
      if (!sink) return;
      if (snapshot.status === 'ready') update({});
      if (!snapshot.writable) return;
      const synced = sink.synced();
      // Only normal tournaments with preflop errors can give spots; the others need no reading at all.
      const ids = snapshot.tournaments
        .filter((t) => t.kind === 'normal' && t.summary.preflopErrors > 0 && isCurrent(t) && !synced.has(t.id))
        .map((t) => t.id);
      for (const id of ids) {
        const stop = await serial(async () => {
          update({});
          if (!snapshot.writable) return true;
          const tournament = snapshot.tournaments.find((t) => t.id === id);
          if (!tournament || sink.synced().has(id)) return false;
          const { hands } = await loadHands(backend, tournament.handIds);
          update({});
          if (!snapshot.writable) return true;
          feed(tournament, hands, true);
          return false;
        });
        if (stop) break;
      }
    },
    async rateHand(hand) {
      const [analysis] = await analyzer.analyze([hand]);
      return analysis;
    },
    async saveSituation(raw, name) {
      const trimmed = name.trim();
      if (!isHandName(trimmed)) throw new Error(SITUATION_NAME_INVALID);
      let hand: ParsedHand;
      try {
        hand = parseHand(raw);
      } catch (error) {
        if (!(error instanceof HandParseError)) throw error;
        throw new Error(`Diese Situation kann ich nicht speichern: ${error.message}`);
      }
      if (!/^SIT\d+$/.test(hand.id) || situationKindOf(hand.tournamentId) === null) {
        throw new Error('Das ist keine eigene Situation.');
      }
      // The same path as an import: write lock, rating, one archive write per tournament, retraining queue.
      const summary = await importTexts([{ name: 'Situation', text: raw }], [], new Map(), new Map([[hand.id, trimmed]]));
      if (summary.duplicates > 0) throw new Error(SITUATION_SAVED_ALREADY);
      if (summary.failures) throw new Error(summary.failures[0]);
      const saved = snapshot.tournaments.find((t) => t.id === hand.tournamentId);
      if (summary.imported !== 1 || !saved) throw new Error('Diese Situation kann ich nicht speichern.');
      return saved;
    },
  };
  return store;
}
