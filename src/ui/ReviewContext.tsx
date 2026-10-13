import { type ReactNode, createContext, useContext, useSyncExternalStore } from 'react';
import type { ReviewSnapshot, ReviewStore } from '../app/review-store';

const ReviewStoreContext = createContext<ReviewStore | null>(null);

export function ReviewProvider({ store, children }: { store: ReviewStore; children: ReactNode }) {
  return <ReviewStoreContext.Provider value={store}>{children}</ReviewStoreContext.Provider>;
}

export function useReviewStore(): ReviewStore {
  const store = useContext(ReviewStoreContext);
  if (!store) throw new Error('ReviewProvider fehlt');
  return store;
}

export function useReview(): ReviewSnapshot {
  const store = useReviewStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
