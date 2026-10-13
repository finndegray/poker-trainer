import { actionLabel, aggressiveWord, evLine, formatEv, verdictLabel, xpSummary } from '../../app/format';
import type { AnswerResult } from '../../app/game-store';
import { handName } from '../../engine/cards';
import { POSITION_LABELS } from '../../engine/positions';
import type { ChartCell, Spot } from '../../engine/pushfold';
import { CELL_CLASS, PUSHFOLD_LEGEND, cellText } from './chart-cells';
import { PositionRow } from './PositionRow';
import { RangeChart } from './RangeChart';
import './Feedback.css';

export function FeedbackPanel({ result, spot }: { result: AnswerResult; spot: Spot }) {
  const { grade, xp, rank } = result.outcome;
  const word = aggressiveWord(spot.kind);
  const label = (cell: ChartCell) => cellText(cell, word);
  const items = result.comparison.entries.map((entry) => ({
    position: entry.position,
    cellClass: CELL_CLASS[entry.cell],
    title: `${POSITION_LABELS[entry.position]}: ${label(entry.cell)} (${formatEv(entry.ev)})`,
    current: entry.isHero,
  }));

  return (
    <section className={`feedback panel feedback--${grade.verdict}`} aria-live="polite">
      <h2 className="feedback__verdict">{verdictLabel(grade.verdict)}</h2>
      <p className="feedback__line">
        Deine Wahl: {actionLabel(grade.chosen)}
        {grade.verdict === 'wrong' ? ` · Besser: ${actionLabel(grade.best)}` : ''}
      </p>
      <p className="feedback__line feedback__ev">{evLine(spot.kind, grade.evAggressive)}</p>
      <p className="feedback__line feedback__xp">{xpSummary(xp)}</p>
      {rank.rankUp && <p className="feedback__rankup">Aufgestiegen: {rank.after}!</p>}
      <h3 className="feedback__heading">
        {handName(spot.hand)} bei {spot.stack} BB – Range für diesen Spot
      </h3>
      <RangeChart
        cells={result.chart}
        heroHand={spot.hand}
        legend={PUSHFOLD_LEGEND}
        cellClass={(cell) => CELL_CLASS[cell]}
        cellLabel={label}
      />
      <h3 className="feedback__heading">Dieselbe Hand auf anderen Positionen</h3>
      <PositionRow items={items} summary={result.comparison.summary} />
    </section>
  );
}
