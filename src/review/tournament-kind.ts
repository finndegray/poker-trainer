export type TournamentKind = 'normal' | 'satellit' | 'bounty';
export const TOURNAMENT_KINDS: readonly TournamentKind[] = ['normal', 'satellit', 'bounty'];

export const TOURNAMENT_KIND_LABELS: Record<TournamentKind, string> = {
  normal: 'Normal',
  satellit: 'Satellit',
  bounty: 'Bounty',
};

const SATELLITE = /\b(step|satellite|builder|ticket|seat)s?\b/i;
const BOUNTY = /\b(bounty|pko|mystery|knockout)\b/i;

/** Satellite words win over bounty words: a satellite pays seats, not chips. */
export function detectTournamentKind(name: string): TournamentKind {
  if (SATELLITE.test(name)) return 'satellit';
  if (BOUNTY.test(name)) return 'bounty';
  return 'normal';
}

export const isTournamentKind = (v: unknown): v is TournamentKind =>
  typeof v === 'string' && (TOURNAMENT_KINDS as readonly string[]).includes(v);
