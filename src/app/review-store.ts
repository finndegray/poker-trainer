import type { PushFoldData } from '../engine/pushfold-data';
import { ANALYSIS_VERSION, analyzeHand } from '../review/analysis';
import {
  type ArchiveProblem,
  type HandRecord,
  REVIEW_SCHEMA_VERSION,
  type ReviewBackend,
  TOURNAMENT_PREFIX,
  type TournamentRecord,
  isHandAnalysis,
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
  lastImport: ImportSummary | null;
};
export type ReviewStoreDeps = {
  backend: ReviewBackend;
  data: PushFoldData;
  /** The writer lock of the save (one writing tab); checked before every write. */
  canWrite: () => boolean;
  /** The save comes from a newer app version. */
  readOnly: boolean;
  pause?: () => Promise<void>;
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
  setKind(id: string, kind: TournamentKind): Promise<void>;
  deleteTournament(id: string): Promise<void>;
  /** The archive part of a manual export (null when the archive is empty) and the number of unreadable entries left out of it. */
  exportPart(): Promise<{ part: ArchiveExport | null; omitted: number }>;
  /** Merges the archive part of an export file (hand numbers decide about duplicates). */
  mergeExport(part: ArchiveExport): Promise<ImportSummary>;
};

export const LOCK_READ_ONLY = 'Nur-Lesen-Modus: Bitte die App aktualisieren, um Hände zu importieren.';
export const LOCK_NEWER_ARCHIVE = 'Das Hand-Archiv stammt aus einer neueren Version – bitte die App aktualisieren.';
export const LOCK_OTHER_TAB = 'Import ist nur in dem Tab möglich, der deinen Fortschritt speichert.';
export const BLOCKED_DURING_IMPORT = 'Während eines Imports nicht möglich.';
export const LOCK_FAILED = 'Das Hand-Archiv konnte nicht geladen werden.';

const byNewest = (a: TournamentRecord, b: TournamentRecord) => b.lastPlayedAt.localeCompare(a.lastPlayedAt) || a.id.localeCompare(b.id);

export function createReviewStore(deps: ReviewStoreDeps): ReviewStore {
  const { backend, data, canWrite, readOnly } = deps;
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

  /** Parses the stored text and rates it again when the analysis is missing, broken or from another version. */
  function fresh(record: HandRecord): { item: ReviewHand; changed: boolean } | null {
    let hand: ParsedHand;
    try {
      hand = parseHand(record.raw);
    } catch (error) {
      if (error instanceof HandParseError) return null;
      throw error;
    }
    if (record.analysisVersion === ANALYSIS_VERSION && isHandAnalysis(record.analysis)) return { item: { record, hand }, changed: false };
    const analysis = analyzeHand(hand, data);
    return { item: { record: { ...record, analysis, analysisVersion: analysis.version }, hand }, changed: true };
  }

  type LoadedHands = { hands: ReviewHand[]; changed: HandRecord[]; problems: ArchiveProblem[] };

  async function loadTournamentHands(tournament: TournamentRecord): Promise<LoadedHands> {
    const loaded = await loadHands(backend, tournament.handIds);
    const problems = [...loaded.problems];
    const hands: ReviewHand[] = [];
    const changed: HandRecord[] = [];
    for (const record of loaded.hands) {
      const result = fresh(record);
      if (!result) {
        problems.push({ key: `hand:${record.id}`, reason: 'Hand-Text nicht lesbar' });
        continue;
      }
      hands.push(result.item);
      if (result.changed) changed.push(result.item.record);
    }
    return { hands, changed, problems };
  }

  const replaceTournament = (record: TournamentRecord) =>
    [...snapshot.tournaments.filter((t) => t.id !== record.id), record].sort(byNewest);

  async function importTexts(
    texts: readonly ImportText[],
    fileSkipped: readonly SkippedHand[],
    kinds: ReadonlyMap<string, TournamentKind> = new Map(),
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
      const analyzed = await analyzePlan(plan, data, (progress) => update({ progress }), deps.pause);
      let imported = 0;
      let tournaments = 0;
      const failures: string[] = [];
      for (const [id, items] of analyzed) {
        const previous = snapshot.tournaments.find((t) => t.id === id) ?? null;
        const old: LoadedHands = previous ? await loadTournamentHands(previous) : { hands: [], changed: [], problems: [] };
        const added = items.map(handRecordOf);
        const record = tournamentRecordOf(
          id,
          items[0].hand.tournamentName,
          [...old.hands.map((h) => h.record), ...added],
          previous,
          previous ? null : (kinds.get(id) ?? null),
        );
        try {
          await serial(() => writeRecords(backend, [record], [...old.changed, ...added]));
        } catch (error) {
          // A refused tournament (newer version, unreadable record) is reported; the others continue.
          failures.push(writeFailureMessage(error, record.name));
          continue;
        }
        imported += added.length;
        tournaments += 1;
        update({ tournaments: replaceTournament(record) });
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
    async openTournament(id) {
      const tournament = snapshot.tournaments.find((t) => t.id === id);
      if (!tournament) throw new Error('Turnier nicht gefunden');
      const loaded = await loadTournamentHands(tournament);
      let current = tournament;
      // Hands rated by an older version are rated again; the result is kept when this tab may write.
      if (loaded.changed.length > 0) {
        current = tournamentRecordOf(id, tournament.name, loaded.hands.map((h) => h.record), tournament);
        if (snapshot.writable) {
          await serial(() => writeRecords(backend, [current], loaded.changed));
          update({ tournaments: replaceTournament(current) });
        }
      }
      return { tournament: current, hands: loaded.hands, problems: loaded.problems };
    },
    async setKind(id, kind) {
      assertWritable();
      if (snapshot.progress) throw new Error(BLOCKED_DURING_IMPORT);
      const tournament = snapshot.tournaments.find((t) => t.id === id);
      if (!tournament) throw new Error('Turnier nicht gefunden');
      const loaded = await loadTournamentHands(tournament);
      const record = tournamentRecordOf(id, tournament.name, loaded.hands.map((h) => h.record), tournament, kind);
      await serial(() => writeRecords(backend, [record], loaded.changed));
      update({ tournaments: replaceTournament(record) });
    },
    async deleteTournament(id) {
      assertWritable();
      if (snapshot.progress) throw new Error(BLOCKED_DURING_IMPORT);
      const tournament = snapshot.tournaments.find((t) => t.id === id);
      if (!tournament) return;
      await serial(() => removeTournament(backend, tournament));
      update({ tournaments: snapshot.tournaments.filter((t) => t.id !== id) });
    },
    async exportPart() {
      let omitted = snapshot.problems.length;
      if (snapshot.tournaments.length === 0) return { part: null, omitted };
      const part: ArchiveExport = { reviewSchemaVersion: REVIEW_SCHEMA_VERSION, tournaments: [], hands: [] };
      for (const t of snapshot.tournaments) {
        part.tournaments.push({ id: t.id, name: t.name, kind: t.kind });
        const { hands, problems } = await loadHands(backend, t.handIds);
        omitted += problems.length;
        for (const h of hands) part.hands.push({ id: h.id, tournamentId: h.tournamentId, raw: h.raw });
      }
      return { part, omitted };
    },
    mergeExport(part) {
      const kinds = new Map(part.tournaments.map((t) => [t.id, t.kind] as const));
      const texts = part.hands.map((h) => ({ name: 'Export', text: h.raw }));
      return importTexts(texts, [], kinds);
    },
  };
  return store;
}
