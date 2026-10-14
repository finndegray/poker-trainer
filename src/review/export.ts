import { REVIEW_SCHEMA_VERSION, isHandName } from './archive';
import { type TournamentKind, isTournamentKind } from './tournament-kind';

/** Key of the optional archive part in a manual export file; the save itself stays unchanged. */
export const EXPORT_KEY = 'reviewArchive';

export type ArchiveExport = {
  reviewSchemaVersion: 1;
  tournaments: { id: string; name: string; kind: TournamentKind }[];
  /** `name` only for saved situations; exports before Plan 10 never have it. */
  hands: { id: string; tournamentId: string; raw: string; name?: string }[];
};

/** Without an archive part the export is exactly the save text, as before. */
export function withArchive(saveText: string, part: ArchiveExport | null): string {
  if (part === null) return saveText;
  if (!saveText.endsWith('}')) throw new Error('Spielstand-Text unerwartet');
  return `${saveText.slice(0, -1)},"${EXPORT_KEY}":${JSON.stringify(part)}}`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const unreadable = (): never => {
  throw new Error('Hand-Archiv in der Datei ist nicht lesbar');
};

/** Null for files without an archive part (all exports before Plan 7). Throws when the part is broken. */
export function readArchivePart(text: string): ArchiveExport | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(raw) || !(EXPORT_KEY in raw)) return null;
  const part = raw[EXPORT_KEY];
  if (!isObject(part)) return unreadable();
  if (typeof part.reviewSchemaVersion !== 'number') return unreadable();
  if (part.reviewSchemaVersion > REVIEW_SCHEMA_VERSION) throw new Error('Hand-Archiv stammt aus einer neueren Version – bitte die App aktualisieren');
  if (part.reviewSchemaVersion !== REVIEW_SCHEMA_VERSION) return unreadable();
  const { tournaments, hands } = part;
  if (!Array.isArray(tournaments) || !tournaments.every((t) => isObject(t) && isString(t.id) && isString(t.name) && isTournamentKind(t.kind))) {
    return unreadable();
  }
  const isHand = (h: unknown) =>
    isObject(h) && isString(h.id) && isString(h.tournamentId) && isString(h.raw) && (h.name === undefined || isHandName(h.name));
  if (!Array.isArray(hands) || !hands.every(isHand)) {
    return unreadable();
  }
  return part as unknown as ArchiveExport;
}
