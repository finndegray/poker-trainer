import type { TournamentKind } from './tournament-kind';

/** Hand ids of situations entered by the player start with this; GGPoker hands start with "TM". */
export const SITUATION_HAND_PREFIX = 'SIT';

/**
 * Spec 5 of the situation analysis: saved situations live in the hand archive as one "tournament" per kind.
 * The ids cannot clash with GGPoker tournament numbers (digits only); the kind of these tournaments is fixed.
 */
export const SITUATION_TOURNAMENTS: Record<TournamentKind, { id: string; name: string }> = {
  normal: { id: 'SIT-normal', name: 'Eigene Situationen' },
  satellit: { id: 'SIT-satellit', name: 'Eigene Situationen (Satellit)' },
  bounty: { id: 'SIT-bounty', name: 'Eigene Situationen (Bounty)' },
};

/** The fixed kind of a situation tournament; null for imported tournaments. */
export function situationKindOf(tournamentId: string): TournamentKind | null {
  for (const kind of Object.keys(SITUATION_TOURNAMENTS) as TournamentKind[]) {
    if (SITUATION_TOURNAMENTS[kind].id === tournamentId) return kind;
  }
  return null;
}

export const isSituationTournament = (tournamentId: string): boolean => situationKindOf(tournamentId) !== null;
