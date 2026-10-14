import { strFromU8, unzipSync } from 'fflate';
import { ANALYSIS_VERSION, type HandAnalysis } from './analysis';
import type { HandAnalyzer } from './analyzer';
import { ArchiveFormatError, type HandRecord, REVIEW_SCHEMA_VERSION, type TournamentRecord } from './archive';
import { type ParsedHand, type SkippedHand, parseHistory } from './parse';
import { situationKindOf } from './situation-tournaments';
import { summarize } from './summary';
import { type TournamentKind, detectTournamentKind } from './tournament-kind';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Sum of the declared sizes of all accepted ZIP entries; checked before anything is inflated. */
export const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 1000;
export const MAX_HANDS_PER_IMPORT = 20_000;

export type ImportFile = { name: string; bytes: Uint8Array };
export type ImportText = { name: string; text: string };
export type ImportProgress = { tournament: number; tournaments: number; hand: number; hands: number };
export type SkipCount = { reason: string; count: number };
export type ImportSummary = {
  imported: number;
  duplicates: number;
  skipped: SkipCount[];
  /** Tournaments that received hands. */
  tournaments: number;
  /** Tournaments the archive refused to write (newer version, unreadable record), as German messages; omitted when none. */
  failures?: string[];
};

export class ImportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportLimitError';
  }
}

const isZip = (file: ImportFile) =>
  file.name.toLowerCase().endsWith('.zip') || (file.bytes[0] === 0x50 && file.bytes[1] === 0x4b && file.bytes[2] === 0x03 && file.bytes[3] === 0x04);
const isTxt = (name: string) => name.toLowerCase().endsWith('.txt');
const TOO_BIG = 'Datei zu groß (über 20 MB)';
const ZIP_TOO_BIG = 'ZIP entpackt zu groß (über 50 MB)';
const ZIP_TOO_MANY = 'ZIP enthält zu viele Dateien (über 1000)';
/** Thrown from the unzip filter to abort before any entry is inflated. */
class ZipLimitError extends Error {}
/** macOS resource-fork leftovers: silently ignored. */
const isMacJunk = (path: string) => path.startsWith('__MACOSX/') || (path.split('/').pop() ?? '').startsWith('._');

/** Unpacks ZIPs (only .txt entries, nothing is executed) and decodes text files; problems are reported per file. */
export function extractTexts(files: readonly ImportFile[]): { texts: ImportText[]; skipped: SkippedHand[] } {
  const texts: ImportText[] = [];
  const skipped: SkippedHand[] = [];
  for (const file of files) {
    if (file.bytes.length > MAX_FILE_BYTES) {
      skipped.push({ id: file.name, reason: TOO_BIG });
      continue;
    }
    if (isZip(file)) {
      let entries: Record<string, Uint8Array>;
      const tooBig: string[] = [];
      let accepted = 0;
      let total = 0;
      try {
        entries = unzipSync(file.bytes, {
          filter: (entry) => {
            if (!isTxt(entry.name) || isMacJunk(entry.name)) return false;
            if (entry.originalSize > MAX_FILE_BYTES) {
              tooBig.push(entry.name);
              return false;
            }
            if (++accepted > MAX_ZIP_ENTRIES) throw new ZipLimitError(ZIP_TOO_MANY);
            total += entry.originalSize;
            if (total > MAX_UNZIPPED_BYTES) throw new ZipLimitError(ZIP_TOO_BIG);
            return true;
          },
        });
      } catch (error) {
        skipped.push({ id: file.name, reason: error instanceof ZipLimitError ? error.message : 'ZIP-Datei nicht lesbar' });
        continue;
      }
      for (const name of tooBig) skipped.push({ id: name, reason: TOO_BIG });
      for (const name of Object.keys(entries).sort()) texts.push({ name, text: strFromU8(entries[name]) });
      continue;
    }
    if (!isTxt(file.name)) {
      skipped.push({ id: file.name, reason: 'Dateityp nicht unterstützt (nur .txt und .zip)' });
      continue;
    }
    texts.push({ name: file.name, text: strFromU8(file.bytes) });
  }
  return { texts, skipped };
}

export type ImportPlan = {
  /** New hands per tournament id, oldest first. */
  tournaments: Map<string, ParsedHand[]>;
  duplicates: number;
  skipped: SkippedHand[];
};

/**
 * Parses all texts and drops hands that are already archived (the key is the hand number).
 * Hands of a tournament whose archive record is unreadable are skipped, so that record is never overwritten.
 */
export function planImport(
  texts: readonly ImportText[],
  existing: ReadonlySet<string>,
  blockedTournaments: ReadonlySet<string> = new Set(),
  maxHands = MAX_HANDS_PER_IMPORT,
): ImportPlan {
  const parsed: ParsedHand[] = [];
  const skipped: SkippedHand[] = [];
  for (const { text } of texts) {
    const result = parseHistory(text);
    parsed.push(...result.hands);
    skipped.push(...result.skipped);
    if (parsed.length > maxHands) {
      throw new ImportLimitError(`Zu viele Hände: höchstens ${maxHands.toLocaleString('de-DE')} je Import`);
    }
  }
  const seen = new Set(existing);
  const tournaments = new Map<string, ParsedHand[]>();
  let duplicates = 0;
  for (const hand of parsed) {
    if (seen.has(hand.id)) {
      duplicates++;
      continue;
    }
    if (blockedTournaments.has(hand.tournamentId)) {
      skipped.push({ id: hand.id, reason: 'Turnier im Archiv nicht lesbar' });
      continue;
    }
    seen.add(hand.id);
    const list = tournaments.get(hand.tournamentId) ?? [];
    list.push(hand);
    tournaments.set(hand.tournamentId, list);
  }
  // GGPoker lists the newest hand first; the archive keeps them in playing order.
  for (const list of tournaments.values()) list.sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id));
  return { tournaments, duplicates, skipped };
}

export function countSkipped(skipped: readonly SkippedHand[]): SkipCount[] {
  const counts = new Map<string, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => ({ reason, count }));
}

export type AnalyzedHand = { hand: ParsedHand; analysis: HandAnalysis };

/** Rates all planned hands with `analyzer`, tournament by tournament, reporting progress per tournament and hand. */
export async function analyzePlan(
  plan: ImportPlan,
  analyzer: HandAnalyzer,
  onProgress: (p: ImportProgress) => void,
): Promise<Map<string, AnalyzedHand[]>> {
  const out = new Map<string, AnalyzedHand[]>();
  const ids = [...plan.tournaments.keys()];
  for (const [t, id] of ids.entries()) {
    const hands = plan.tournaments.get(id)!;
    const progress = (hand: number) => onProgress({ tournament: t + 1, tournaments: ids.length, hand, hands: hands.length });
    progress(0);
    const analyses = await analyzer.analyze(hands, progress);
    out.set(id, hands.map((hand, i) => ({ hand, analysis: analyses[i] })));
  }
  return out;
}

/** `name` only for saved situations; imported hands get no name field, so their records stay as before. */
export function handRecordOf({ hand, analysis }: AnalyzedHand, name?: string): HandRecord {
  return {
    reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
    id: hand.id,
    tournamentId: hand.tournamentId,
    playedAt: hand.playedAt,
    dateKey: hand.dateKey,
    raw: hand.raw,
    analysisVersion: analysis.version,
    analysis,
    ...(name === undefined ? {} : { name }),
  };
}

/**
 * The loaded ids in order, plus every id of the previous record that was not loaded (unreadable or missing hand
 * records): those stay in the list at their old place, so a rewrite never drops them from the tournament.
 */
function mergeHandIds(loaded: readonly string[], previous: readonly string[]): string[] {
  const out = [...loaded];
  const known = new Set(loaded);
  let anchor = -1;
  for (const id of previous) {
    if (known.has(id)) {
      anchor = out.indexOf(id);
      continue;
    }
    out.splice(anchor + 1, 0, id);
    known.add(id);
    anchor++;
  }
  return out;
}

/**
 * Builds the tournament record from all its hands (old and new), keeping a kind the player chose and every previous
 * hand id. The tournaments of saved situations always keep their fixed kind.
 */
export function tournamentRecordOf(
  id: string,
  name: string,
  hands: readonly HandRecord[],
  previous: TournamentRecord | null,
  kindOverride: TournamentKind | null = null,
): TournamentRecord {
  const sorted = [...hands].sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id));
  const fixed = situationKindOf(id);
  const detectedKind = fixed ?? previous?.detectedKind ?? detectTournamentKind(name);
  const kind = fixed ?? kindOverride ?? previous?.kind ?? detectedKind;
  const handIds = mergeHandIds(sorted.map((h) => h.id), previous?.handIds ?? []);
  const analysisVersion = sorted.length === 0 ? ANALYSIS_VERSION : Math.min(...sorted.map((h) => h.analysisVersion));
  return {
    reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
    id,
    name: previous?.name ?? name,
    detectedKind,
    kind,
    firstPlayedAt: sorted[0]?.playedAt ?? '',
    lastPlayedAt: sorted[sorted.length - 1]?.playedAt ?? '',
    handIds,
    analysisVersion,
    summary: summarize(sorted, kind),
  };
}

/**
 * German message for a refused archive write of one tournament (`writeRecords` writes nothing then).
 * Errors that are not archive format problems are rethrown, so real failures never look like a skipped tournament.
 */
export function writeFailureMessage(error: unknown, tournamentName: string): string {
  if (!(error instanceof ArchiveFormatError)) throw error;
  const why =
    error.code === 'newer-version'
      ? 'Es stammt aus einer neueren App-Version und bleibt unverändert.'
      : 'Der Archiv-Eintrag ist nicht lesbar und wird nicht überschrieben.';
  return `Turnier „${tournamentName}“ wurde nicht importiert: ${why}`;
}
