import { formatBb, formatChipsBb, reviewActionLabel, streetLabel } from '../../app/format';
import { comparePositions } from '../../engine/position-compare';
import { chartFor } from '../../engine/preflop/charts';
import { comparePreflopPositions, preflopCells } from '../../engine/preflop/grading';
import { chart } from '../../engine/pushfold';
import type { PushFoldData } from '../../engine/pushfold-data';
import type { HeroDecision } from '../../review/analysis';
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
      </section>
    );
  }
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
