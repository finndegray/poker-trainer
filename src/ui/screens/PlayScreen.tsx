import { useCallback, useEffect } from 'react';
import type { Action } from '../../engine/pushfold';
import { ActionBar } from '../components/ActionBar';
import { FeedbackPanel } from '../components/FeedbackPanel';
import { PokerTable } from '../components/PokerTable';
import { ResultCard } from '../components/ResultCard';
import { SessionHeader } from '../components/SessionHeader';
import { StatusBar } from '../components/StatusBar';
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
  useEffect(() => {
    start();
  }, [start, sessionKind, hasSpot]);

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
        <>
          <PokerTable key={current.shownAt} spot={current.spot} cards={current.cards} />
          <ActionBar kind={current.spot.kind} answered={game.last !== null} onAction={onAction} onNext={onNext} />
          {game.last && <FeedbackPanel result={game.last} spot={current.spot} />}
        </>
      )}
      {!current && finished && <ResultCard session={session} onRestart={() => start(true)} onHome={onBack} />}
    </>
  );
}
