import type { Session } from '../../app/game-store';
import { RUN_LEVEL_STACKS, RUN_LIVES, RUN_SPOTS_PER_LEVEL, type RunState } from '../../game/endphase-run';
import './session.css';

export function SessionHeader({ session, activeRun }: { session: Session; activeRun: RunState | null }) {
  if (session.kind === 'training') return null;
  if (session.kind === 'daily') {
    return (
      <p className="session-header panel">
        Daily Challenge · Spot {Math.min(session.index + 1, session.spots.length)}/{session.spots.length} · {session.correct}{' '}
        richtig
      </p>
    );
  }
  if (!activeRun || activeRun.status !== 'running') {
    return <p className="session-header panel">Endphase-Run beendet</p>;
  }
  const hearts = '♥'.repeat(activeRun.lives) + '♡'.repeat(RUN_LIVES - activeRun.lives);
  return (
    <div className="session-header panel session-header--run">
      <span>
        Level {activeRun.levelIndex + 1}/{RUN_LEVEL_STACKS.length} · {RUN_LEVEL_STACKS[activeRun.levelIndex]} BB · Spot{' '}
        {Math.min(activeRun.spotInLevel + 1, RUN_SPOTS_PER_LEVEL)}/{RUN_SPOTS_PER_LEVEL}
      </span>
      <span className="session-header__lives" aria-label={`Leben: ${activeRun.lives} von ${RUN_LIVES}`}>
        {hearts}
      </span>
    </div>
  );
}
