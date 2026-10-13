import { StrictMode } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { getPushFoldData } from './app/data';
import { type GameStore, createGameStore } from './app/game-store';
import { type Persistence, browserEnv, installFlushOnHide, openPersistence } from './app/persistence';
import { createUpdatePolicy } from './app/update-policy';
import { registerSW } from 'virtual:pwa-register';
import { mulberry32 } from './engine/rng';
import { App } from './ui/App';
import { GameProvider } from './ui/GameContext';
import { browserAudioFactory, createSoundPlayer } from './ui/sound';
import './ui/theme.css';

const STATUS_REFRESH_MS = 60_000;

let root: Root | null = null;
const appRoot = (): Root => (root ??= createRoot(document.getElementById('root')!));

const logError = (error: unknown) => console.error(error);

async function bootstrap(): Promise<void> {
  let store: GameStore | null = null;
  let persistence: Persistence | null = null;
  let updateNotice = false;
  // A page restored from the back/forward cache may run an outdated version and an outdated state.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  // 'prompt' mode: a new version only activates and reloads when the player agrees or the page is hidden.
  const policy = createUpdatePolicy({
    flush: () => persistence?.flush() ?? Promise.resolve(),
    reload: () => location.reload(),
    activate: () => updateSW(true),
    isHidden: () => document.visibilityState === 'hidden',
    showNotice: () => {
      updateNotice = true;
      store?.setUpdateAvailable();
    },
  });
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => policy.onNeedRefresh(),
    onNeedReload: () => void policy.onNeedReload().catch(logError),
  });
  appRoot().render(<p className="app-loading">Lädt …</p>);

  const opened = await openPersistence(
    browserEnv((error) => {
      console.error(error);
      store?.reportSaveError(error);
    }),
  );
  persistence = opened;
  installFlushOnHide(opened, document, window);

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  store = createGameStore({
    data: getPushFoldData(),
    persistence: opened,
    rng: mulberry32(seed),
    now: () => new Date(),
    clock: () => performance.now(),
  });
  const ready = store;
  if (updateNotice) ready.setUpdateAvailable();
  opened.onWriterAcquired((fresh) => ready.adoptSavedState(fresh));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ready.refreshStatus();
    // Apply a waiting update while nobody is looking, so it never interrupts training.
    else policy.onHidden().catch(logError);
  });
  const applyUpdate = () => policy.applyNow();
  // Cheap, and keeps the day counter right across midnight.
  setInterval(() => ready.refreshStatus(), STATUS_REFRESH_MS);

  const sound = createSoundPlayer(browserAudioFactory);
  appRoot().render(
    <StrictMode>
      <GameProvider store={ready}>
        <App onApplyUpdate={applyUpdate} sound={sound} />
      </GameProvider>
    </StrictMode>,
  );
}

bootstrap().catch((error: unknown) => {
  logError(error);
  appRoot().render(
    <main className="app">
      <p>Der Trainer konnte nicht gestartet werden.</p>
      <button type="button" className="btn btn--gold" onClick={() => location.reload()}>
        Neu laden
      </button>
    </main>,
  );
});
