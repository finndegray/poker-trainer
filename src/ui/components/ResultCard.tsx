import type { Session } from '../../app/game-store';
import { RUN_FIELD, RUN_LEVEL_STACKS } from '../../game/endphase-run';
import './session.css';

const count = new Intl.NumberFormat('de-DE');

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

type Props = { session: Session; onRestart: () => void; onHome: () => void };

export function ResultCard({ session, onRestart, onHome }: Props) {
  if (session.kind === 'training' || !session.outcome) return null;
  const buttons = (restartLabel: string) => (
    <div className="result-card__buttons">
      <button type="button" className="btn btn--gold" onClick={onRestart}>
        {restartLabel}
      </button>
      <button type="button" className="btn" onClick={onHome}>
        Zum Menü
      </button>
    </div>
  );

  if (session.kind === 'daily') {
    const { result, accepted, isPersonalBest } = session.outcome;
    return (
      <section className="result-card panel">
        <h2 className="result-card__title">Daily Challenge geschafft</h2>
        <p className="result-card__big">
          {result.correct} von {result.total} richtig
        </p>
        <p className="muted">Zeit: {formatDuration(result.durationMs)}</p>
        {accepted && isPersonalBest && <p className="result-card__badge">Neue Bestleistung!</p>}
        {!accepted && <p className="muted">Heute bereits gewertet – dieser Durchgang zählt nicht.</p>}
        {buttons('Nochmal üben')}
      </section>
    );
  }

  const { summary, isPersonalBest } = session.outcome;
  return (
    <section className="result-card panel">
      <h2 className="result-card__title">{summary.finalTable ? 'Final Table erreicht!' : 'Ausgeschieden'}</h2>
      <p className="result-card__big">
        Platz {count.format(summary.placement)} von {count.format(RUN_FIELD)}
      </p>
      <p className="muted">
        {summary.levelsCompleted} von {RUN_LEVEL_STACKS.length} Leveln geschafft · +{summary.bonusXp} Bonus-XP
      </p>
      {isPersonalBest && <p className="result-card__badge">Neue Bestplatzierung!</p>}
      {buttons('Neuer Run')}
    </section>
  );
}
