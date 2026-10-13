import { useState } from 'react';
import { formatHands, formatPer100, formatPlayedAt } from '../../app/format';
import type { OpenTournament, ReviewHand } from '../../app/review-store';
import { handClassOf, handName } from '../../engine/cards';
import { POSITION_LABELS } from '../../engine/positions';
import { positionsOf } from '../../review/hand-model';
import { HERO } from '../../review/parse';
import { type DecisionOutcome, type HandFilter, errorsPer100, handOutcome, handSeverity, matchesFilter } from '../../review/summary';
import { TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, type TournamentKind } from '../../review/tournament-kind';
import { useReview } from '../ReviewContext';
import { FilterGroup, type Option } from '../components/FilterGroup';
import './review.css';

export const OUTCOME_LABELS: Record<DecisionOutcome, string> = {
  error: 'Fehler',
  hint: 'Hinweis',
  questionable: 'Fraglich',
  close: 'Knapp',
  correct: 'Richtig',
  unrated: 'Nicht bewertet',
};

const FILTERS: Option<HandFilter>[] = [
  { value: 'errors', label: 'Nur Fehler' },
  { value: 'questionable', label: 'Auch fraglich' },
  { value: 'all', label: 'Alle' },
];

/** Worst hands first, then in playing order. */
export function sortedHands(hands: readonly ReviewHand[], kind: TournamentKind): ReviewHand[] {
  return [...hands].sort(
    (a, b) =>
      handSeverity(b.record.analysis, kind) - handSeverity(a.record.analysis, kind) ||
      a.record.playedAt.localeCompare(b.record.playedAt) ||
      a.record.id.localeCompare(b.record.id),
  );
}

function handLabel({ hand }: ReviewHand): string {
  const cards = hand.heroCards ? handName(handClassOf(hand.heroCards[0], hand.heroCards[1])) : '??';
  const position = positionsOf(hand)?.get(HERO);
  return `${cards}${position ? ` · ${POSITION_LABELS[position]}` : ''}`;
}

type Props = {
  open: OpenTournament;
  onOpenHand: (handId: string) => void;
  onSetKind: (kind: TournamentKind) => void;
  onDelete: () => void;
};

export function ReviewTournament({ open, onOpenHand, onSetKind, onDelete }: Props) {
  const review = useReview();
  const [filter, setFilter] = useState<HandFilter>('all');
  const { tournament } = open;
  const kind = tournament.kind;
  const visible = sortedHands(open.hands, kind).filter((h) => matchesFilter(h.record.analysis, kind, filter));
  const errors = tournament.summary.preflopErrors + tournament.summary.postflopErrors;
  // Kind change and delete are refused by the store while an import runs.
  const editable = review.writable && review.progress === null;

  return (
    <>
      <section className="panel review-tournament">
        <h2 className="review-title">{tournament.name}</h2>
        <p className="muted">
          {formatPlayedAt(tournament.firstPlayedAt)} · {formatHands(tournament.summary.hands)} · {errors} Fehler ·{' '}
          {formatPer100(errorsPer100(errors, tournament.summary.hands))} pro 100 Hände
        </p>
        <label className="review-kind">
          Art des Turniers
          <select
            aria-label="Art des Turniers"
            value={kind}
            disabled={!editable}
            onChange={(event) => onSetKind(event.target.value as TournamentKind)}
          >
            {TOURNAMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {TOURNAMENT_KIND_LABELS[k]}
                {k === tournament.detectedKind ? ' (erkannt)' : ''}
              </option>
            ))}
          </select>
        </label>
        {kind !== 'normal' && <p className="muted">Satellit/Bounty – Standard-Chart nur bedingt gültig. Abweichungen zählen nicht als Fehler.</p>}
        {review.lockReason && <p className="muted">{review.lockReason}</p>}
        {review.progress !== null && <p className="muted">Während eines Imports nicht möglich.</p>}
        {open.problems.length > 0 && (
          <p className="notice notice--warning" role="alert">
            {open.problems.length === 1
              ? '1 Hand-Eintrag ist nicht lesbar und wurde übersprungen (nicht gelöscht).'
              : `${open.problems.length} Hand-Einträge sind nicht lesbar und wurden übersprungen (nicht gelöscht).`}
          </p>
        )}
        <FilterGroup label="Hände" options={FILTERS} value={filter} disabled={false} onChange={setFilter} />
      </section>
      {visible.length === 0 ? (
        <p className="panel muted">Keine Hände für diesen Filter.</p>
      ) : (
        <ol className="review-hands">
          {visible.map((h) => {
            const outcome = handOutcome(h.record.analysis, kind);
            return (
              <li key={h.record.id}>
                <button type="button" className={`btn review-hand review-hand--${outcome ?? 'none'}`} onClick={() => onOpenHand(h.record.id)}>
                  <span>{formatPlayedAt(h.record.playedAt).slice(11)}</span>
                  <span>{handLabel(h)}</span>
                  <span className="review-hand__outcome">{outcome ? OUTCOME_LABELS[outcome] : 'Keine Entscheidung'}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <button type="button" className="btn btn--ghost" disabled={!editable} onClick={onDelete}>
        Turnier löschen
      </button>
    </>
  );
}
