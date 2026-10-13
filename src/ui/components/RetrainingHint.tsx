import { retrainingHint } from '../../app/format';
import type { RetrainingOrigin } from '../../app/game-store';

/** „Aus deinem Turnier vom 12.10.“ above the table for a spot from the retraining queue (spec 10). */
export function RetrainingHint({ origin }: { origin: RetrainingOrigin | undefined }) {
  if (!origin) return null;
  return (
    <p className="retraining-hint" role="note">
      {retrainingHint(origin.playedAt)}
    </p>
  );
}
