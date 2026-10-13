import { formatBb, formatChipsBb, formatPercent, reviewActionLabel, streetLabel } from '../../app/format';
import { comparePositions } from '../../engine/position-compare';
import { POSITION_LABELS } from '../../engine/positions';
import { chartFor } from '../../engine/preflop/charts';
import { comparePreflopPositions, preflopCells } from '../../engine/preflop/grading';
import { chart } from '../../engine/pushfold';
import type { PushFoldData } from '../../engine/pushfold-data';
import type { HeroDecision } from '../../review/analysis';
import { type PostflopRating, potOdds } from '../../review/postflop';
import { IMPLIED_ODDS_TEXT, POSTFLOP_DISCLAIMER, POSTFLOP_REASON_TEXT, POSTFLOP_VERDICT_LABELS, VILLAIN_ROLE_LABELS } from '../../review/postflop-text';
import { UNRATED_TEXT } from '../../review/preflop';
import { SATELLITE_HINT, decisionOutcome } from '../../review/summary';
import type { TournamentKind } from '../../review/tournament-kind';
import { PushFoldVerdict } from './FeedbackPanel';
import { PreflopVerdict } from './PreflopFeedbackPanel';
import './Feedback.css';

type Props = { decision: HeroDecision; kind: TournamentKind; bigBlind: number; data: PushFoldData };

/** Pot, amount to call and stack before the hero acted, in BB. */
function Numbers({ decision, bigBlind }: { decision: HeroDecision; bigBlind: number }) {
  const bb = (chips: number) => `${formatChipsBb(chips, bigBlind)} BB`;
  return (
    <p className="feedback__line feedback__ev">
      {streetLabel(decision.street)} · Pot {bb(decision.pot)} · zu callen {bb(decision.toCall)} · Stack {bb(decision.stack)}
    </p>
  );
}

/** Pot odds and bet size straight from the decision; shown for unrated postflop decisions too (spec 7). */
function PotOdds({ decision }: { decision: HeroDecision }) {
  const { toCall, amount, action } = decision;
  const { pot, needed } = potOdds(decision.pot, toCall, decision.excess ?? 0);
  const parts: string[] = [];
  if (toCall > 0) parts.push(`nötige Equity ${formatPercent(needed)}`);
  if (action === 'bet') parts.push(`Einsatz ${formatPercent(amount / pot)} vom Pot`);
  if (action === 'raise') parts.push(`Raise ${formatPercent((amount - toCall) / (pot + toCall))} vom Pot`);
  return parts.length > 0 ? <p className="feedback__line feedback__ev">{parts.join(' · ')}</p> : null;
}

const POSTFLOP_TONE: Record<PostflopRating['verdict'], 'correct' | 'close' | 'wrong'> = { ok: 'correct', questionable: 'close', mistake: 'wrong' };

function PostflopPanel({ decision, rating, kind, bigBlind }: { decision: HeroDecision; rating: PostflopRating; kind: TournamentKind; bigBlind: number }) {
  const hint = decisionOutcome(decision, kind) === 'hint';
  const tone = hint ? 'close' : POSTFLOP_TONE[rating.verdict];
  const equity = `Equity ${formatPercent(rating.equity)} gegen die Range`;
  const needed = decision.toCall > 0 ? ` · nötig ${formatPercent(rating.needed)}` : '';
  const sizes = [
    rating.betShare !== null ? `${decision.action === 'raise' ? 'Raise' : 'Einsatz'} ${formatPercent(rating.betShare)} vom Pot` : null,
    `SPR ${formatBb(Math.round(rating.spr * 10) / 10)}`,
    rating.outs > 0 ? `${rating.outs} Outs` : null,
  ].filter((x): x is string => x !== null);
  return (
    <section className={`feedback panel feedback--${tone}`} aria-live="polite">
      <h2 className="feedback__verdict">{hint ? 'Hinweis' : POSTFLOP_VERDICT_LABELS[rating.verdict]}</h2>
      <p className="feedback__line">{POSTFLOP_REASON_TEXT[rating.reason]}</p>
      {hint && <p className="feedback__line">{SATELLITE_HINT}</p>}
      <p className="feedback__line">Deine Aktion: {reviewActionLabel(decision, bigBlind)}</p>
      <p className="feedback__line feedback__ev">
        {equity}
        {needed}
        {rating.bonus > 0 ? ` (${IMPLIED_ODDS_TEXT})` : ''}
      </p>
      <p className="feedback__line feedback__ev">{sizes.join(' · ')}</p>
      <Numbers decision={decision} bigBlind={bigBlind} />
      <p className="feedback__line muted">
        Gegner {POSITION_LABELS[rating.villainPosition]}: {VILLAIN_ROLE_LABELS[rating.villainRole]} ·{' '}
        {rating.approximation ? `Näherung: Chart für ${rating.depth} BB` : `Chart für ${rating.depth} BB`} · etwa {Math.round(rating.combos)}{' '}
        Kombinationen
      </p>
      <p className="feedback__hint muted">{POSTFLOP_DISCLAIMER}</p>
    </section>
  );
}

export function ReviewDecisionPanel({ decision, kind, bigBlind, data }: Props) {
  const { rating } = decision;
  const action = <p className="feedback__line">Deine Aktion: {reviewActionLabel(decision, bigBlind)}</p>;
  if (rating.model === 'unrated') {
    return (
      <section className="feedback panel" aria-live="polite">
        <h2 className="feedback__verdict">Nicht bewertet</h2>
        <p className="feedback__line">{UNRATED_TEXT[rating.reason]}</p>
        {action}
        <Numbers decision={decision} bigBlind={bigBlind} />
        {decision.street !== 'preflop' && <PotOdds decision={decision} />}
      </section>
    );
  }
  if (rating.model === 'postflop') return <PostflopPanel decision={decision} rating={rating} kind={kind} bigBlind={bigBlind} />;
  const hint = decisionOutcome(decision, kind) === 'hint';
  const title = hint ? 'Hinweis' : undefined;
  const tone = hint ? 'close' : undefined;
  const effective = `${formatBb(Math.round(rating.effectiveBb * 10) / 10)} BB effektiv`;
  if (rating.model === 'pushfold') {
    return (
      <PushFoldVerdict
        spot={rating.spot}
        grade={rating.grade}
        chart={chart(data, rating.spot)}
        comparison={comparePositions(data, rating.spot)}
        title={title}
        tone={tone}
        extra={
          <>
            {hint && <p className="feedback__line">{SATELLITE_HINT}</p>}
            <Numbers decision={decision} bigBlind={bigBlind} />
            <p className="feedback__line muted">Push/Fold-Daten · {effective}</p>
          </>
        }
      />
    );
  }
  const chartData = chartFor(rating.spot);
  return (
    <PreflopVerdict
      spot={rating.spot}
      grade={rating.grade}
      cells={preflopCells(chartData)}
      note={chartData.note}
      comparison={comparePreflopPositions(rating.spot)}
      title={title}
      tone={tone}
      extra={
        <>
          {hint && <p className="feedback__line">{SATELLITE_HINT}</p>}
          <Numbers decision={decision} bigBlind={bigBlind} />
          <p className="feedback__line muted">
            {rating.approximation ? `Näherung: Chart für ${rating.spot.stack} BB` : `Chart für ${rating.spot.stack} BB`} · {effective}
          </p>
        </>
      }
    />
  );
}
