import { StrictMode } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { getPushFoldData } from './app/data';
import { type GameStore, createGameStore } from './app/game-store';
import { browserEnv, installFlushOnHide, openPersistence } from './app/persistence';
import { registerSW } from 'virtual:pwa-register';
import { mulberry32 } from './engine/rng';
import { App } from './ui/App';
import { GameProvider } from './ui/GameContext';
import './ui/theme.css';

const STATUS_REFRESH_MS = 60_000;

let root: Root | null = null;
const appRoot = (): Root => (root ??= createRoot(document.getElementById('root')!));

async function bootstrap(): Promise<void> {
  let store: GameStore | null = null;
  let updateReady = false;
  // 'prompt' mode: a new version only activates when the player agrees or the page is hidden.
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => {
      updateReady = true;
      store?.setUpdateAvailable();
    },
  });
  appRoot().render(<p className="app-loading">Lädt …</p>);

  const persistence = await openPersistence(
    browserEnv((error) => {
      console.error(error);
      store?.reportSaveError(error);
    }),
  );
  installFlushOnHide(persistence, document, window);
  const applyUpdate = async (): Promise<void> => {
    await persistence.flush();
    await updateSW(true);
  };

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  store = createGameStore({
    data: getPushFoldData(),
    persistence,
    rng: mulberry32(seed),
    now: () => new Date(),
    clock: () => performance.now(),
  });
  const ready = store;
  if (updateReady) ready.setUpdateAvailable();
  persistence.onWriterAcquired((fresh) => ready.adoptSavedState(fresh));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ready.refreshStatus();
    // Apply a waiting update while nobody is looking, so it never interrupts training.
    else if (updateReady) applyUpdate().catch((error: unknown) => console.error(error));
  });
  // Cheap, and keeps the day counter right across midnight.
  setInterval(() => ready.refreshStatus(), STATUS_REFRESH_MS);

  appRoot().render(
    <StrictMode>
      <GameProvider store={ready}>
        <App onApplyUpdate={applyUpdate} />
      </GameProvider>
    </StrictMode>,
  );
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  appRoot().render(
    <main className="app">
      <p>Der Trainer konnte nicht gestartet werden.</p>
      <button type="button" className="btn btn--gold" onClick={() => location.reload()}>
        Neu laden
      </button>
    </main>,
  );
});
