import { useState } from 'react';
import { Celebration } from './components/Celebration';
import { Notices } from './components/Notices';
import { useGame, useGameStore } from './GameContext';
import { HomeScreen, type Screen } from './screens/HomeScreen';
import { PlayScreen } from './screens/PlayScreen';
import { PreflopScreen } from './screens/PreflopScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SituationScreen } from './screens/SituationScreen';
import { StatsScreen } from './screens/StatsScreen';
import { type SoundPlayer, silentPlayer } from './sound';
import { useGameSounds } from './useGameSounds';

const now = () => new Date();

export function App({ onApplyUpdate, sound = silentPlayer }: { onApplyUpdate?: () => Promise<void>; sound?: SoundPlayer }) {
  const store = useGameStore();
  const game = useGame();
  useGameSounds(sound);
  const [screen, setScreen] = useState<Screen>('home');
  const home = () => setScreen('home');

  return (
    <>
      {/* While the overlay is open, the rest of the app is neither focusable nor clickable. */}
      <main className="app" inert={game.celebration !== null}>
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
        {screen === 'preflop' && <PreflopScreen onBack={home} />}
        {screen === 'review' && <ReviewScreen onBack={home} onSituation={() => setScreen('situation')} />}
        {screen === 'situation' && <SituationScreen onBack={home} onReview={() => setScreen('review')} />}
        {screen === 'stats' && <StatsScreen onBack={home} />}
        {screen === 'settings' && <SettingsScreen onBack={home} />}
      </main>
      {game.celebration && <Celebration rank={game.celebration} onClose={store.dismissCelebration} />}
    </>
  );
}
