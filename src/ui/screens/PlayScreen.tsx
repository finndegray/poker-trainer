import { useCallback, useEffect, useRef } from 'react';
import type { Action } from '../../engine/pushfold';
import { ActionBar } from '../components/ActionBar';
import { FeedbackPanel } from '../components/FeedbackPanel';
import { PokerTable } from '../components/PokerTable';
import { RetrainingHint } from '../components/RetrainingHint';
import { ResultCard } from '../components/ResultCard';
import { SessionHeader } from '../components/SessionHeader';
import { StatusBar } from '../components/StatusBar';
import { TrainingLayout } from '../components/TrainingLayout';
import { useGame, useGameStore } from '../GameContext';
import './screens.css';

export type PlayMode = 'training' | 'daily' | 'run';

const TITLES: Record<PlayMode, string> = { training: 'Training', daily: 'Daily Challenge', run: 'Endphase-Run' };

export function PlayScreen({ mode, onBack }: { mode: PlayMode; onBack: () => void }) {
  const store = useGameStore();
  const game = useGame();

  const start = useCallback(
    (restart = false) => {
      if (mode === 'training') store.startTraining();
      else if (mode === 'daily') store.startDaily({ restart });
      else store.startRun({ restart });
    },
    [store, mode],
  );

  // All start methods resume instead of restarting, so this is safe to repeat (StrictMode, tab hand-over).
  const sessionKind = game.session.kind;
  const hasSpot = game.current !== null;
  // Entering the run tile after a finished run starts a new run; only the first effect run may do that,
  // later runs (finishing a run) keep showing the result card.
  const firstRun = useRef(true);
  useEffect(() => {
    const snapshot = store.getSnapshot().session;
    const restartFinishedRun = firstRun.current && mode === 'run' && snapshot.kind === 'run' && snapshot.outcome !== null;
    firstRun.current = false;
    start(restartFinishedRun);
  }, [store, mode, start, sessionKind, hasSpot]);

  const onAction = useCallback((action: Action) => {
    store.answer(action);
  }, [store]);
  const onNext = useCallback(() => {
    store.next();
  }, [store]);

  const session = game.session;
  const active = session.kind === mode;
  const current = active ? game.current : null;
  const finished = active && session.kind !== 'training' && session.outcome !== null;

  return (
    <>
      <div className="screen-header">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Menü
        </button>
        <span className="muted">{TITLES[mode]}</span>
      </div>
      <StatusBar status={game.status} xp={game.save.profile.xp} />
      {active && <SessionHeader session={session} activeRun={game.save.activeRun} />}
      {current && (
        <TrainingLayout
          main={
            <>
              <RetrainingHint origin={current.retraining} />
              <PokerTable key={current.shownAt} spot={current.spot} cards={current.cards} />
              <ActionBar kind={current.spot.kind} answered={game.last !== null} onAction={onAction} onNext={onNext} />
            </>
          }
          side={game.last && <FeedbackPanel result={game.last} spot={current.spot} />}
        />
      )}
      {!current && finished && <ResultCard session={session} onRestart={() => start(true)} onHome={onBack} />}
    </>
  );
}
