import { useCallback, useEffect } from 'react';
import type { Action } from '../../engine/pushfold';
import { ActionBar } from '../components/ActionBar';
import { FeedbackPanel } from '../components/FeedbackPanel';
import { PokerTable } from '../components/PokerTable';
import { StatusBar } from '../components/StatusBar';
import { useGame, useGameStore } from '../GameContext';
import './screens.css';

export function TrainingScreen({ onBack }: { onBack: () => void }) {
  const store = useGameStore();
  const game = useGame();

  useEffect(() => {
    if (!store.getSnapshot().current) store.nextTrainingSpot();
  }, [store]);

  const onAction = useCallback((action: Action) => {
    store.answer(action);
  }, [store]);
  const onNext = useCallback(() => {
    store.nextTrainingSpot();
  }, [store]);

  const current = game.current;
  return (
    <>
      <div className="screen-header">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Menü
        </button>
        <span className="muted">Training</span>
      </div>
      <StatusBar status={game.status} xp={game.save.profile.xp} />
      {current && (
        <>
          <PokerTable key={current.shownAt} spot={current.spot} cards={current.cards} />
          <ActionBar kind={current.spot.kind} answered={game.last !== null} onAction={onAction} onNext={onNext} />
          {game.last && <FeedbackPanel result={game.last} spot={current.spot} />}
        </>
      )}
    </>
  );
}
