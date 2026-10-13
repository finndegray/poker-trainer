import type { SessionStatus } from '../../game/session';
import './StatusBar.css';

const xpFormat = new Intl.NumberFormat('de-DE');

export function StatusBar({ status, xp }: { status: SessionStatus; xp: number }) {
  const { rank, streak, dayProgress } = status;
  const percent = Math.round(rank.progress * 100);
  return (
    <header className="status-bar panel">
      <div className="status-bar__row">
        <span className="status-bar__rank">{rank.name}</span>
        <span className="status-bar__streak" title={`Tage in Folge mit mindestens ${dayProgress.target} Spots`}>
          Streak {streak} {streak === 1 ? 'Tag' : 'Tage'}
        </span>
      </div>
      <div
        className="xp-bar"
        role="progressbar"
        aria-label="Fortschritt zum nächsten Rang"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="xp-bar__fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="status-bar__row status-bar__meta">
        <span>{rank.next ? `${xpFormat.format(rank.next.minXp - xp)} XP bis ${rank.next.name}` : 'Höchster Rang erreicht'}</span>
        <span>
          Heute {dayProgress.count}/{dayProgress.target}
        </span>
      </div>
    </header>
  );
}
