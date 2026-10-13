import { useState } from 'react';
import { Notices } from './components/Notices';
import { useGame, useGameStore } from './GameContext';
import { HomeScreen, type Screen } from './screens/HomeScreen';
import { PlayScreen } from './screens/PlayScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';

const now = () => new Date();

export function App({ onApplyUpdate }: { onApplyUpdate?: () => Promise<void> }) {
  const store = useGameStore();
  const game = useGame();
  const [screen, setScreen] = useState<Screen>('home');
  const home = () => setScreen('home');

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
      {screen === 'home' && <HomeScreen onNavigate={setScreen} />}
      {(screen === 'training' || screen === 'daily' || screen === 'run') && <PlayScreen key={screen} mode={screen} onBack={home} />}
      {screen === 'stats' && <StatsScreen onBack={home} />}
      {screen === 'settings' && <SettingsScreen onBack={home} />}
    </main>
  );
}
