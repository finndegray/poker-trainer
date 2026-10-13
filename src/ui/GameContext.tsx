import { type ReactNode, createContext, useContext, useSyncExternalStore } from 'react';
import type { GameSnapshot, GameStore } from '../app/game-store';

const GameStoreContext = createContext<GameStore | null>(null);

export function GameProvider({ store, children }: { store: GameStore; children: ReactNode }) {
  return <GameStoreContext.Provider value={store}>{children}</GameStoreContext.Provider>;
}

export function useGameStore(): GameStore {
  const store = useContext(GameStoreContext);
  if (!store) throw new Error('GameProvider fehlt');
  return store;
}

export function useGame(): GameSnapshot {
  const store = useGameStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
