import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getPushFoldData } from './app/data';
import { type GameStore, createGameStore } from './app/game-store';
import { browserEnv, installFlushOnHide, openPersistence } from './app/persistence';
import { registerSW } from 'virtual:pwa-register';
import { mulberry32 } from './engine/rng';
import { App } from './ui/App';
import { GameProvider } from './ui/GameContext';
import './ui/theme.css';

async function bootstrap(): Promise<void> {
  registerSW({ immediate: true });
  const root = createRoot(document.getElementById('root')!);
  root.render(<p className="app-loading">Lädt …</p>);

  let store: GameStore | null = null;
  const persistence = await openPersistence(
    browserEnv((error) => {
      console.error(error);
      store?.reportSaveError(error);
    }),
  );
  installFlushOnHide(persistence, document, window);

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  store = createGameStore({
    data: getPushFoldData(),
    persistence,
    rng: mulberry32(seed),
    now: () => new Date(),
    clock: () => performance.now(),
  });
  const ready = store;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ready.refreshStatus();
  });

  root.render(
    <StrictMode>
      <GameProvider store={ready}>
        <App />
      </GameProvider>
    </StrictMode>,
  );
}

void bootstrap();
