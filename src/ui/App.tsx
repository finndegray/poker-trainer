import { useState } from 'react';
import { Notices } from './components/Notices';
import { useGame, useGameStore } from './GameContext';
import { HomeScreen } from './screens/HomeScreen';
import { TrainingScreen } from './screens/TrainingScreen';

type Screen = 'home' | 'training';

const now = () => new Date();

export function App({ onApplyUpdate }: { onApplyUpdate?: () => Promise<void> }) {
  const store = useGameStore();
  const game = useGame();
  const [screen, setScreen] = useState<Screen>('home');
  return (
    <main className="app">
      <h1 className="app__title">Poker-Trainer</h1>
      <Notices
        info={game.info}
        saveError={game.saveError}
        now={now}
        notice={game.notice}
        onDismissNotice={store.dismissNotice}
        onApplyUpdate={onApplyUpdate}
      />
      {screen === 'home' ? (
        <HomeScreen onStartTraining={() => setScreen('training')} />
      ) : (
        <TrainingScreen onBack={() => setScreen('home')} />
      )}
    </main>
  );
}
