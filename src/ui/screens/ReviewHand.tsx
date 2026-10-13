import { useEffect, useMemo, useState } from 'react';
import { formatChipsBb, formatCount, formatPlayedAt } from '../../app/format';
import type { ReviewHand as ReviewHandData } from '../../app/review-store';
import { POSITION_LABELS } from '../../engine/positions';
import type { TournamentKind } from '../../review/tournament-kind';
import { isTypingTarget } from '../components/ActionBar';
import { TableView } from '../components/PokerTable';
import { ReviewDecisionPanel } from '../components/ReviewDecisionPanel';
import { TrainingLayout } from '../components/TrainingLayout';
import { replaySteps, replayTableModel } from '../replay-model';
import { useReviewStore } from '../ReviewContext';
import './review.css';

type Props = { item: ReviewHandData; kind: TournamentKind };

export function ReviewHand({ item, kind }: Props) {
  const { data } = useReviewStore();
  const { hand, record } = item;
  const steps = useMemo(() => replaySteps(hand, record.analysis.decisions), [hand, record]);
  const decisionSteps = useMemo(() => steps.flatMap((s, i) => (s.decision ? [i] : [])), [steps]);
  const [index, setIndex] = useState(() => decisionSteps[0] ?? 0);
  const step = steps[index];

  const prevDecision = [...decisionSteps].reverse().find((i) => i < index);
  const nextDecision = decisionSteps.find((i) => i > index);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      const target = event.key === 'ArrowLeft' ? prevDecision : event.key === 'ArrowRight' ? nextDecision : undefined;
      if (target === undefined) return;
      event.preventDefault();
      setIndex(target);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevDecision, nextDecision]);

  const hero = step.state.players.find((p) => p.isHero);
  const info = [
    hero?.position ? `Du sitzt im ${POSITION_LABELS[hero.position]}` : 'Position unbekannt',
    `Schritt ${index + 1} von ${steps.length}`,
  ].join(' · ');
  const table =
    hero?.position ? (
      <TableView model={replayTableModel(step.state, hand.bigBlind)} cards={hand.heroCards ?? []} board={step.state.board} situation={step.text} info={info} />
    ) : (
      <p className="panel">{step.text}</p>
    );

  return (
    <>
      <p className="muted review-hand-head">
        Hand #{hand.id.replace(/^TM/, '')} · {formatPlayedAt(hand.playedAt)} · Level {hand.level} ({formatCount(hand.smallBlind)}/
        {formatCount(hand.bigBlind)}, Ante {formatCount(hand.ante)}) · Stack {formatChipsBb(hero?.startChips ?? 0, hand.bigBlind)} BB
      </p>
      <TrainingLayout
        main={
          <>
            {table}
            <div className="review-steps">
              <button type="button" className="btn" disabled={prevDecision === undefined} onClick={() => setIndex(prevDecision!)} aria-keyshortcuts="ArrowLeft">
                ← Entscheidung
              </button>
              <button type="button" className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                Schritt zurück
              </button>
              <button type="button" className="btn" disabled={index === steps.length - 1} onClick={() => setIndex(index + 1)}>
                Schritt vor
              </button>
              <button type="button" className="btn" disabled={nextDecision === undefined} onClick={() => setIndex(nextDecision!)} aria-keyshortcuts="ArrowRight">
                Entscheidung →
              </button>
            </div>
            {decisionSteps.length === 0 && <p className="muted">In dieser Hand hast du keine Entscheidung getroffen.</p>}
          </>
        }
        side={step.decision && <ReviewDecisionPanel decision={step.decision} kind={kind} bigBlind={hand.bigBlind} data={data} />}
      />
    </>
  );
}
