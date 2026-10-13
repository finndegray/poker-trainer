import { preflopSpotTitle, verdictLabel, xpSummary } from '../../app/format';
import type { PreflopAnswerResult } from '../../app/game-store';
import { handName } from '../../engine/cards';
import { POSITION_LABELS } from '../../engine/positions';
import { type PreflopCell, preflopActionWord } from '../../engine/preflop/grading';
import type { PreflopAction } from '../../engine/preflop/spots';
import { PREFLOP_CELL_CLASS, preflopCellText, preflopLegend } from './chart-cells';
import { PositionRow } from './PositionRow';
import { RangeChart } from './RangeChart';
import './Feedback.css';

export function PreflopFeedbackPanel({ result }: { result: PreflopAnswerResult }) {
  const { grade, xp, rank, record } = result.outcome;
  const spot = record.spot;
  const word = (action: PreflopAction) => preflopActionWord(action, spot.stack);
  const label = (cell: PreflopCell) => preflopCellText(cell, spot.kind, spot.stack);
  const items = result.comparison.entries.map((entry) => ({
    position: entry.position,
    cellClass: PREFLOP_CELL_CLASS[entry.cell],
    title: `${POSITION_LABELS[entry.position]}: ${label(entry.cell)}`,
    current: entry.isCurrent,
  }));

  return (
    <section className={`feedback panel feedback--${grade.verdict}`} aria-live="polite">
      <h2 className="feedback__verdict">{verdictLabel(grade.verdict)}</h2>
      <p className="feedback__line">Deine Wahl: {word(grade.chosen)}</p>
      <p className="feedback__line">
        Richtige Aktion: {word(grade.best)}
        {grade.alternative ? ` (auch okay: ${word(grade.alternative)})` : ''}
      </p>
      <p className="feedback__line feedback__xp">{xpSummary(xp)}</p>
      {rank.rankUp && <p className="feedback__rankup">Aufgestiegen: {rank.after}!</p>}
      <h3 className="feedback__heading">
        {handName(spot.hand)} · {preflopSpotTitle(spot)} · {spot.stack} BB
      </h3>
      <RangeChart
        cells={result.cells}
        heroHand={spot.hand}
        legend={preflopLegend(spot.kind)}
        cellClass={(cell) => PREFLOP_CELL_CLASS[cell]}
        cellLabel={label}
      />
      <p className="feedback__note">{result.note}</p>
      <p className="feedback__hint muted">Standard-Chart, kein Solver-Ergebnis</p>
      <h3 className="feedback__heading">
        {result.comparison.axis === 'hero' ? 'Dieselbe Hand auf anderen Positionen' : 'Dieselbe Hand gegen andere Opener'}
      </h3>
      <PositionRow items={items} summary={result.comparison.summary} />
    </section>
  );
}
