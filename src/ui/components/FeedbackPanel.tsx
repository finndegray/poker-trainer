import { actionLabel, aggressiveWord, evLine, verdictLabel } from '../../app/format';
import type { AnswerResult } from '../../app/game-store';
import { handName } from '../../engine/cards';
import type { Spot } from '../../engine/pushfold';
import { PositionRow } from './PositionRow';
import { RangeChart } from './RangeChart';
import './Feedback.css';

const multiplierFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

export function FeedbackPanel({ result, spot }: { result: AnswerResult; spot: Spot }) {
  const { grade, xp, rank } = result.outcome;
  const word = aggressiveWord(spot.kind);
  const xpParts = [xp.xp > 0 ? `+${xp.xp} XP` : '0 XP'];
  if (xp.multiplier > 1) xpParts.push(`Combo ×${multiplierFormat.format(xp.multiplier)}`);
  if (xp.combo >= 2) xpParts.push(`${xp.combo} in Folge`);

  return (
    <section className={`feedback panel feedback--${grade.verdict}`} aria-live="polite">
      <h2 className="feedback__verdict">{verdictLabel(grade.verdict)}</h2>
      <p className="feedback__line">
        Deine Wahl: {actionLabel(grade.chosen)}
        {grade.verdict === 'wrong' ? ` · Besser: ${actionLabel(grade.best)}` : ''}
      </p>
      <p className="feedback__line feedback__ev">{evLine(spot.kind, grade.evAggressive)}</p>
      <p className="feedback__line feedback__xp">{xpParts.join(' · ')}</p>
      {rank.rankUp && <p className="feedback__rankup">Aufgestiegen: {rank.after}!</p>}
      <h3 className="feedback__heading">
        {handName(spot.hand)} bei {spot.stack} BB – Range für diesen Spot
      </h3>
      <RangeChart cells={result.chart} heroHand={spot.hand} word={word} />
      <h3 className="feedback__heading">Dieselbe Hand auf anderen Positionen</h3>
      <PositionRow comparison={result.comparison} word={word} />
    </section>
  );
}
