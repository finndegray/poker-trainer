import { type Card, dealConcrete } from '../engine/cards';
import { type PositionComparison, comparePositions } from '../engine/position-compare';
import { type Action, type ChartCell, type Spot, chart } from '../engine/pushfold';
import type { PushFoldData } from '../engine/pushfold-data';
import type { Rng } from '../engine/rng';
import {
  type DecisionOutcome,
  type SessionStatus,
  nextTrainingSpot,
  recordDecision,
  setSound,
  statusOf,
} from '../game/session';
import type { SaveState } from '../storage/schema';
import type { Persistence, PersistenceInfo } from './persistence';

export type TrainingSpot = { spot: Spot; cards: readonly [Card, Card]; shownAt: number };
export type AnswerResult = { outcome: DecisionOutcome; comparison: PositionComparison; chart: ChartCell[] };
export type Notice = 'writer-acquired' | 'update-available';
export type GameSnapshot = {
  save: SaveState;
  status: SessionStatus;
  info: PersistenceInfo;
  current: TrainingSpot | null;
  last: AnswerResult | null;
  saveError: string | null;
  notice: Notice | null;
};
export type GameStoreDeps = {
  data: PushFoldData;
  persistence: Pick<Persistence, 'initial' | 'info' | 'save'>;
  rng: Rng;
  now: () => Date;
  clock: () => number;
};
export type GameStore = {
  getSnapshot(): GameSnapshot;
  subscribe(listener: () => void): () => void;
  nextTrainingSpot(): void;
  /** Re-entering training: keeps an unanswered spot (restarting its timer), otherwise deals a new one. */
  resumeTraining(): void;
  answer(action: Action): AnswerResult;
  setSound(on: boolean): void;
  reportSaveError(error: unknown): void;
  refreshStatus(): void;
  /** Takes over the state another tab left behind, once this tab became the writer. */
  adoptSavedState(fresh: SaveState): void;
  setUpdateAvailable(): void;
  dismissNotice(): void;
};

export function createGameStore(deps: GameStoreDeps): GameStore {
  const { data, persistence, rng, now, clock } = deps;
  let snapshot: GameSnapshot = {
    save: persistence.initial,
    status: statusOf(persistence.initial, now()),
    info: persistence.info,
    current: null,
    last: null,
    saveError: null,
    notice: null,
  };
  // Remembered separately, so the update notice comes back after the writer notice is dismissed.
  let updateAvailable = false;
  const listeners = new Set<() => void>();

  const update = (patch: Partial<GameSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const commit = (save: SaveState, patch: Partial<GameSnapshot> = {}) => {
    persistence.save(save);
    update({ ...patch, save, status: statusOf(save, now()) });
  };

  const store: GameStore = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    nextTrainingSpot() {
      if (snapshot.info.readOnly) throw new Error('Training ist im Nur-Lesen-Modus nicht möglich');
      const spot = nextTrainingSpot(data, snapshot.save, rng);
      update({ current: { spot, cards: dealConcrete(spot.hand, rng), shownAt: clock() }, last: null });
    },
    resumeTraining() {
      const current = snapshot.current;
      if (!current || snapshot.last) store.nextTrainingSpot();
      else update({ current: { ...current, shownAt: clock() } });
    },
    answer(action) {
      const current = snapshot.current;
      if (!current) throw new Error('Kein Spot aktiv');
      if (snapshot.last) throw new Error('Dieser Spot ist bereits beantwortet');
      const outcome = recordDecision(data, snapshot.save, {
        spot: current.spot,
        chosen: action,
        responseMs: clock() - current.shownAt,
        mode: 'training',
        now: now(),
      });
      const result: AnswerResult = {
        outcome,
        comparison: comparePositions(data, current.spot),
        chart: chart(data, current.spot),
      };
      commit(outcome.state, { last: result });
      return result;
    },
    setSound(on) {
      commit(setSound(snapshot.save, on));
    },
    reportSaveError(error) {
      update({ saveError: error instanceof Error ? error.message : String(error) });
    },
    refreshStatus() {
      update({ status: statusOf(snapshot.save, now()) });
    },
    adoptSavedState(fresh) {
      update({
        save: fresh,
        status: statusOf(fresh, now()),
        info: { ...snapshot.info, otherTabActive: false },
        current: null,
        last: null,
        notice: 'writer-acquired',
      });
    },
    setUpdateAvailable() {
      updateAvailable = true;
      if (snapshot.notice === null) update({ notice: 'update-available' });
    },
    dismissNotice() {
      update({ notice: snapshot.notice === 'writer-acquired' && updateAvailable ? 'update-available' : null });
    },
  };
  return store;
}
