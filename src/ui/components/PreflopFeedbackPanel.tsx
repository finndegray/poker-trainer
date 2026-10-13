import type { ReactNode } from 'react';
import { preflopSpotTitle, verdictLabel, xpSummary } from '../../app/format';
import type { PreflopAnswerResult } from '../../app/game-store';
import { handName } from '../../engine/cards';
import { POSITION_LABELS } from '../../engine/positions';
import { type PreflopCell, type PreflopComparison, type PreflopGrade, preflopActionWord } from '../../engine/preflop/grading';
import type { PreflopAction, PreflopSpot } from '../../engine/preflop/spots';
import type { Verdict } from '../../engine/pushfold';
import { PREFLOP_CELL_CLASS, preflopCellText, preflopLegend } from './chart-cells';
import { PositionRow } from './PositionRow';
import { RangeChart } from './RangeChart';
import './Feedback.css';

export type PreflopVerdictProps = {
  spot: PreflopSpot;
  grade: PreflopGrade;
  cells: readonly PreflopCell[];
  /** The chart's learning sentence. */
  note: string;
  comparison: PreflopComparison;
  /** Overrides the verdict heading and its colour, e.g. for the satellite hint in the hand review. */
  title?: string;
  tone?: Verdict;
  /** Lines after "Richtige Aktion": XP in the training, notes in the hand review. */
  extra?: ReactNode;
};

/** Verdict, your and the correct action, four-colour chart, learning sentence, hint and position comparison. */
export function PreflopVerdict({ spot, grade, cells, note, comparison, title, tone, extra }: PreflopVerdictProps) {
  const word = (action: PreflopAction) => preflopActionWord(action, spot.stack);
  const label = (cell: PreflopCell) => preflopCellText(cell, spot.kind, spot.stack);
  const items = comparison.entries.map((entry) => ({
    position: entry.position,
    cellClass: PREFLOP_CELL_CLASS[entry.cell],
    title: `${POSITION_LABELS[entry.position]}: ${label(entry.cell)}`,
    current: entry.isCurrent,
  }));

  return (
    <section className={`feedback panel feedback--${tone ?? grade.verdict}`} aria-live="polite">
      <h2 className="feedback__verdict">{title ?? verdictLabel(grade.verdict)}</h2>
      <p className="feedback__line">Deine Wahl: {word(grade.chosen)}</p>
      <p className="feedback__line">
        Richtige Aktion: {word(grade.best)}
        {grade.alternative ? ` (auch okay: ${word(grade.alternative)})` : ''}
      </p>
      {extra}
      <h3 className="feedback__heading">
        {handName(spot.hand)} · {preflopSpotTitle(spot)} · {spot.stack} BB
      </h3>
      <RangeChart
        cells={cells}
        heroHand={spot.hand}
        legend={preflopLegend(spot.kind)}
        cellClass={(cell) => PREFLOP_CELL_CLASS[cell]}
        cellLabel={label}
      />
      <p className="feedback__note">{note}</p>
      <p className="feedback__hint muted">Standard-Chart, kein Solver-Ergebnis</p>
      <h3 className="feedback__heading">
        {comparison.axis === 'hero' ? 'Dieselbe Hand auf anderen Positionen' : 'Dieselbe Hand gegen andere Opener'}
      </h3>
      <PositionRow items={items} summary={comparison.summary} />
    </section>
  );
}

export function PreflopFeedbackPanel({ result }: { result: PreflopAnswerResult }) {
  const { grade, xp, rank, record } = result.outcome;
  return (
    <PreflopVerdict
      spot={record.spot}
      grade={grade}
      cells={result.cells}
      note={result.note}
      comparison={result.comparison}
      extra={
        <>
          <p className="feedback__line feedback__xp">{xpSummary(xp)}</p>
          {rank.rankUp && <p className="feedback__rankup">Aufgestiegen: {rank.after}!</p>}
        </>
      }
    />
  );
}
