import { createStore, delMany, getMany, keys, setMany } from 'idb-keyval';
import { isPreflopSpot } from '../engine/preflop/spots';
import { HAND_COUNT } from '../engine/cards';
import { POSITIONS } from '../engine/positions';
import type { HandAnalysis } from './analysis';
import type { TournamentSummary } from './summary';
import { type TournamentKind, isTournamentKind } from './tournament-kind';

export const REVIEW_SCHEMA_VERSION = 1;
/** Its own IndexedDB database: idb-keyval cannot add a second object store to the save's database. */
export const REVIEW_DB = 'poker-trainer-review';
export const TOURNAMENT_PREFIX = 'tournament:';
export const HAND_PREFIX = 'hand:';

export type TournamentRecord = {
  reviewSchemaVersion: 1;
  id: string;
  name: string;
  detectedKind: TournamentKind;
  /** The kind used for rating; the player may change it. */
  kind: TournamentKind;
  firstPlayedAt: string;
  lastPlayedAt: string;
  handIds: string[];
  summary: TournamentSummary;
};
export type HandRecord = {
  reviewSchemaVersion: 1;
  id: string;
  tournamentId: string;
  playedAt: string;
  dateKey: string;
  raw: string;
  analysisVersion: number;
  analysis: HandAnalysis;
};

export interface ReviewBackend {
  getMany(keys: readonly string[]): Promise<(string | undefined)[]>;
  keys(): Promise<string[]>;
  /** Writes all entries in one transaction. */
  setMany(entries: readonly (readonly [string, string])[]): Promise<void>;
  delMany(keys: readonly string[]): Promise<void>;
}

export class ArchiveFormatError extends Error {
  constructor(
    message: string,
    readonly code: 'corrupt' | 'newer-version',
  ) {
    super(message);
    this.name = 'ArchiveFormatError';
  }
}

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const corrupt = (what: string): never => {
  throw new ArchiveFormatError(`Archiv-Eintrag nicht lesbar: ${what}`, 'corrupt');
};

function parseRecord(text: string): Obj {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return corrupt('kein gültiges JSON');
  }
  if (!isObject(raw)) return corrupt('kein Objekt');
  const version = raw.reviewSchemaVersion;
  if (typeof version !== 'number') return corrupt('Schema-Version fehlt');
  if (version > REVIEW_SCHEMA_VERSION) throw new ArchiveFormatError(`Archiv-Version ${version} ist neuer als diese App`, 'newer-version');
  if (version !== REVIEW_SCHEMA_VERSION) return corrupt(`unbekannte Version ${version}`);
  return raw;
}

function isSummary(v: unknown): v is TournamentSummary {
  if (!isObject(v) || !isCount(v.hands) || !isCount(v.preflopErrors) || !isCount(v.postflopErrors) || !isCount(v.hints)) return false;
  return isObject(v.days) && Object.values(v.days).every((d) => isObject(d) && isCount(d.hands) && isCount(d.preflopErrors));
}

export function readTournament(text: string): TournamentRecord {
  const r = parseRecord(text);
  if (!isString(r.id) || !isString(r.name) || !isTournamentKind(r.detectedKind) || !isTournamentKind(r.kind)) corrupt('Turnier');
  if (!isString(r.firstPlayedAt) || !isString(r.lastPlayedAt)) corrupt('Turnierdatum');
  if (!Array.isArray(r.handIds) || !r.handIds.every(isString)) corrupt('Hand-Liste');
  if (!isSummary(r.summary)) corrupt('Zusammenfassung');
  return r as unknown as TournamentRecord;
}

const VERDICTS = ['correct', 'close', 'wrong'];
const isPosition = (v: unknown) => isString(v) && (POSITIONS as readonly string[]).includes(v);

function isRating(v: unknown): boolean {
  if (!isObject(v)) return false;
  if (v.model === 'unrated') return isString(v.reason);
  if (!isObject(v.grade) || !VERDICTS.includes(v.grade.verdict as string) || !isString(v.chosen)) return false;
  if (v.model === 'chart') return isPreflopSpot(v.spot) && typeof v.approximation === 'boolean';
  if (v.model !== 'pushfold' || !isObject(v.spot)) return false;
  const s = v.spot;
  const handOk = isCount(s.hand) && (s.hand as number) < HAND_COUNT;
  return handOk && isCount(s.stack) && isPosition(s.position) && (s.kind === 'open' || (s.kind === 'call' && isPosition(s.shover)));
}

/** A light structural check; anything that fails is rated again from the raw text. */
export function isHandAnalysis(v: unknown): v is HandAnalysis {
  if (!isObject(v) || typeof v.version !== 'number' || !Array.isArray(v.decisions)) return false;
  return v.decisions.every(
    (d) => isObject(d) && isCount(d.eventIndex) && isString(d.street) && isString(d.action) && isCount(d.pot) && isRating(d.rating),
  );
}

/** Raw text and ids must be intact; a broken analysis is not fatal, it is computed again. */
export function readHand(text: string): HandRecord {
  const r = parseRecord(text);
  if (!isString(r.id) || !isString(r.tournamentId) || !isString(r.raw) || !isString(r.playedAt) || !isString(r.dateKey)) corrupt('Hand');
  return r as unknown as HandRecord;
}

export const tournamentKey = (id: string) => `${TOURNAMENT_PREFIX}${id}`;
export const handKey = (id: string) => `${HAND_PREFIX}${id}`;

export type ArchiveProblem = { key: string; reason: string };
export type ArchiveIndex = {
  tournaments: TournamentRecord[];
  handIds: Set<string>;
  problems: ArchiveProblem[];
  /** A record from a newer app version: the archive must not be written. */
  newerVersion: boolean;
};

export async function loadArchiveIndex(backend: ReviewBackend): Promise<ArchiveIndex> {
  const all = await backend.keys();
  const tournamentKeys = all.filter((k) => k.startsWith(TOURNAMENT_PREFIX)).sort();
  const handIds = new Set(all.filter((k) => k.startsWith(HAND_PREFIX)).map((k) => k.slice(HAND_PREFIX.length)));
  const texts = await backend.getMany(tournamentKeys);
  const index: ArchiveIndex = { tournaments: [], handIds, problems: [], newerVersion: false };
  texts.forEach((text, i) => {
    try {
      if (text === undefined) corrupt('leer');
      index.tournaments.push(readTournament(text!));
    } catch (error) {
      if (!(error instanceof ArchiveFormatError)) throw error;
      if (error.code === 'newer-version') index.newerVersion = true;
      index.problems.push({ key: tournamentKeys[i], reason: error.message });
    }
  });
  return index;
}

export async function loadHands(backend: ReviewBackend, ids: readonly string[]): Promise<{ hands: HandRecord[]; problems: ArchiveProblem[] }> {
  const texts = await backend.getMany(ids.map(handKey));
  const hands: HandRecord[] = [];
  const problems: ArchiveProblem[] = [];
  texts.forEach((text, i) => {
    const key = handKey(ids[i]);
    if (text === undefined) {
      problems.push({ key, reason: 'Archiv-Eintrag fehlt' });
      return;
    }
    try {
      hands.push(readHand(text));
    } catch (error) {
      if (!(error instanceof ArchiveFormatError)) throw error;
      problems.push({ key, reason: error.message });
    }
  });
  return { hands, problems };
}

const newerVersionError = (what: string) =>
  new ArchiveFormatError(`${what} stammt aus einer neueren App-Version und wird nicht verändert`, 'newer-version');

/** Throws when an existing value comes from a newer app version; `corruptFatal` also rejects unreadable values. */
function guardExisting(text: string | undefined, read: (t: string) => unknown, what: string, corruptFatal: boolean): void {
  if (text === undefined) return;
  try {
    read(text);
  } catch (error) {
    if (!(error instanceof ArchiveFormatError)) throw error;
    if (error.code === 'newer-version') throw newerVersionError(what);
    if (corruptFatal) throw new ArchiveFormatError(`${what} im Archiv nicht lesbar und wird nicht überschrieben`, 'corrupt');
  }
}

/**
 * The only write path. Only what reads back is written (same rule as the save), existing newer-version records and
 * unreadable tournaments are never overwritten, and everything goes into one transaction.
 */
export async function writeRecords(
  backend: ReviewBackend,
  tournaments: readonly TournamentRecord[],
  hands: readonly HandRecord[],
): Promise<void> {
  const entries: [string, string][] = [];
  for (const h of hands) {
    const text = JSON.stringify(h);
    readHand(text);
    entries.push([handKey(h.id), text]);
  }
  for (const t of tournaments) {
    const text = JSON.stringify(t);
    readTournament(text);
    entries.push([tournamentKey(t.id), text]);
  }
  if (entries.length === 0) return;
  const existing = await backend.getMany(entries.map(([k]) => k));
  existing.forEach((text, i) => {
    const isTournament = entries[i][0].startsWith(TOURNAMENT_PREFIX);
    guardExisting(text, isTournament ? readTournament : readHand, isTournament ? 'Turnier' : 'Hand', isTournament);
  });
  await backend.setMany(entries);
}

/** Deletes nothing when the tournament or one of its hands comes from a newer app version; unreadable hands may go. */
export async function removeTournament(backend: ReviewBackend, tournament: TournamentRecord): Promise<void> {
  const keysToDelete = [...tournament.handIds.map(handKey), tournamentKey(tournament.id)];
  const texts = await backend.getMany(keysToDelete);
  texts.forEach((text, i) => {
    const isTournament = i === keysToDelete.length - 1;
    guardExisting(text, isTournament ? readTournament : readHand, isTournament ? 'Turnier' : 'Hand', false);
  });
  await backend.delMany(keysToDelete);
}

export function memoryReviewBackend(initial: Record<string, string> = {}): ReviewBackend & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    getMany: (list) => Promise.resolve(list.map((k) => data.get(k))),
    keys: () => Promise.resolve([...data.keys()]),
    setMany: (entries) => {
      for (const [k, v] of entries) data.set(k, v);
      return Promise.resolve();
    },
    delMany: (list) => {
      for (const k of list) data.delete(k);
      return Promise.resolve();
    },
    dump: () => Object.fromEntries(data),
  };
}

export function indexedDbReviewBackend(dbName = REVIEW_DB): ReviewBackend {
  const store = createStore(dbName, 'kv');
  return {
    getMany: (list) => getMany<string>([...list], store),
    keys: async () => (await keys(store)).map(String),
    setMany: (entries) => setMany(entries.map(([k, v]) => [k, v]), store),
    delMany: (list) => delMany([...list], store),
  };
}
