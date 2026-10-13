import type { ReactNode } from 'react';
import { actionLabel, aggressiveWord, evLine, formatEv, verdictLabel, xpSummary } from '../../app/format';
import type { AnswerResult } from '../../app/game-store';
import { handName } from '../../engine/cards';
import type { PositionComparison } from '../../engine/position-compare';
import { POSITION_LABELS } from '../../engine/positions';
import type { ChartCell, Grade, Spot, Verdict } from '../../engine/pushfold';
import { CELL_CLASS, PUSHFOLD_LEGEND, cellText } from './chart-cells';
import { PositionRow } from './PositionRow';
import { RangeChart } from './RangeChart';
import './Feedback.css';

export type PushFoldVerdictProps = {
  spot: Spot;
  grade: Grade;
  chart: readonly ChartCell[];
  comparison: PositionComparison;
  /** Overrides the verdict heading and its colour, e.g. for the satellite hint in the hand review. */
  title?: string;
  tone?: Verdict;
  /** Lines after the EV line: XP in the training, notes in the hand review. */
  extra?: ReactNode;
};

/** Verdict, EV, push/fold chart with the hand marked and the position comparison. */
export function PushFoldVerdict({ spot, grade, chart, comparison, title, tone, extra }: PushFoldVerdictProps) {
  const word = aggressiveWord(spot.kind);
  const label = (cell: ChartCell) => cellText(cell, word);
  const items = comparison.entries.map((entry) => ({
    position: entry.position,
    cellClass: CELL_CLASS[entry.cell],
    title: `${POSITION_LABELS[entry.position]}: ${label(entry.cell)} (${formatEv(entry.ev)})`,
    current: entry.isHero,
  }));

  return (
    <section className={`feedback panel feedback--${tone ?? grade.verdict}`} aria-live="polite">
      <h2 className="feedback__verdict">{title ?? verdictLabel(grade.verdict)}</h2>
      <p className="feedback__line">
        Deine Wahl: {actionLabel(grade.chosen)}
        {grade.verdict === 'wrong' ? ` · Besser: ${actionLabel(grade.best)}` : ''}
      </p>
      <p className="feedback__line feedback__ev">{evLine(spot.kind, grade.evAggressive)}</p>
      {extra}
      <h3 className="feedback__heading">
        {handName(spot.hand)} bei {spot.stack} BB – Range für diesen Spot
      </h3>
      <RangeChart cells={chart} heroHand={spot.hand} legend={PUSHFOLD_LEGEND} cellClass={(cell) => CELL_CLASS[cell]} cellLabel={label} />
      <h3 className="feedback__heading">Dieselbe Hand auf anderen Positionen</h3>
      <PositionRow items={items} summary={comparison.summary} />
    </section>
  );
}

export function FeedbackPanel({ result, spot }: { result: AnswerResult; spot: Spot }) {
  const { grade, xp, rank } = result.outcome;
  return (
    <PushFoldVerdict
      spot={spot}
      grade={grade}
      chart={result.chart}
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
