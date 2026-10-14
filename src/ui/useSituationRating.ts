import { useEffect, useMemo, useState } from 'react';
import type { ReviewStore } from '../app/review-store';
import type { HandAnalysis } from '../review/analysis';
import { parseHand } from '../review/parse';
import { type Situation, upToLastHeroAction } from '../situation/model';
import { situationText } from '../situation/text';

export type SituationRating =
  | { status: 'none' }
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'ready'; analysis: HandAnalysis };

/**
 * Spec 4: the hand up to the hero's last action, generated as text and rated by the store's analyzer (Web Worker with
 * fallback). `whole` rates the complete hand (summary). The rating only runs again when that text changes, so the
 * actions of the other players after the hero's decision cost nothing. Unreadable text → "failed", never a crash.
 */
export function useSituationRating(store: ReviewStore, situation: Situation | null, playedAt: string, whole = false): SituationRating {
  const text = useMemo(() => {
    if (!situation) return null;
    try {
      const rated = whole ? situation : upToLastHeroAction(situation);
      return rated && rated.steps.length > 0 ? situationText(rated, playedAt) : null;
    } catch (error) {
      // An empty text cannot be parsed: shown as "Diese Situation kann ich nicht bewerten". Logged, so model bugs do not stay silent.
      console.error(error);
      return '';
    }
  }, [situation, playedAt, whole]);
  const [rating, setRating] = useState<{ text: string | null; value: SituationRating }>({ text: null, value: { status: 'none' } });

  useEffect(() => {
    if (text === null) return;
    let cancelled = false;
    const set = (value: SituationRating) => {
      if (!cancelled) setRating({ text, value });
    };
    set({ status: 'pending' });
    try {
      store.rateHand(parseHand(text)).then(
        (analysis) => set({ status: 'ready', analysis }),
        () => set({ status: 'failed' }),
      );
    } catch {
      set({ status: 'failed' });
    }
    return () => {
      cancelled = true;
    };
  }, [store, text]);

  if (text === null) return { status: 'none' };
  return rating.text === text ? rating.value : { status: 'pending' };
}
