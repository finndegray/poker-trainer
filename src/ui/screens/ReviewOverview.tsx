import { formatCount, formatPer100, formatPlayedAt, formatRetrainingCount } from '../../app/format';
import { retrainingCount, retrainingOn } from '../../game/retraining';
import { localDateKey } from '../../game/streak';
import { ANALYSIS_VERSION } from '../../review/analysis';
import { errorsPer100, weeklyErrorTrend } from '../../review/summary';
import { TOURNAMENT_KIND_LABELS } from '../../review/tournament-kind';
import { TrendBars, shortDate } from '../components/TrendChart';
import { useGame } from '../GameContext';
import { useReview } from '../ReviewContext';
import './review.css';

type Props = { onImport: () => void; onOpen: (id: string) => void; onSituation?: () => void; now: () => Date };

export function ReviewOverview({ onImport, onOpen, onSituation, now }: Props) {
  const review = useReview();
  const game = useGame();
  if (review.status === 'loading') return <p className="panel muted">Hand-Archiv wird geladen …</p>;

  const trend = weeklyErrorTrend(review.tournaments.map((t) => t.summary), localDateKey(now()));
  const max = Math.max(1, ...trend.map((w) => w.per100 ?? 0));
  const bars = trend.map((w) => ({
    key: w.weekStart,
    label: shortDate(w.weekStart),
    value: w.per100 === null ? null : w.per100 / max,
    text: formatPer100(w.per100),
  }));

  return (
    <>
      {review.problems.length > 0 && (
        <p className="notice notice--warning" role="alert">
          {review.problems.length === 1
            ? '1 Eintrag im Hand-Archiv ist nicht lesbar und wurde übersprungen (nicht gelöscht).'
            : `${review.problems.length} Einträge im Hand-Archiv sind nicht lesbar und wurden übersprungen (nicht gelöscht).`}
        </p>
      )}
      <section className="panel review-intro">
        <p className="muted">
          Lade deine GGPoker-Hand-Historien (.txt oder .zip) hoch. Jede Preflop-Entscheidung wird mit den Push/Fold-Daten
          und den Starthand-Charts bewertet, Flop, Turn und River mit Faustregeln (Equity gegen die geschätzte Range des
          Gegners und Pot Odds).
        </p>
        <button type="button" className="btn btn--gold" onClick={onImport} disabled={!review.writable}>
          Hände importieren
        </button>
        {onSituation && (
          <button type="button" className="btn" onClick={onSituation}>
            Situation nachstellen
          </button>
        )}
        {review.lockReason && <p className="muted">{review.lockReason}</p>}
        {retrainingCount(game.save) > 0 && (
          <p className="muted">
            Nachtraining: {formatRetrainingCount(retrainingCount(game.save))}
            {!retrainingOn(game.save) && ' Es ist in den Einstellungen ausgeschaltet.'}
          </p>
        )}
        {review.reanalysis && (
          <p className="muted" aria-live="polite">
            Bewertung wird aktualisiert: Turnier {review.reanalysis.tournament} von {review.reanalysis.tournaments} · Hand{' '}
            {formatCount(review.reanalysis.hand)} von {formatCount(review.reanalysis.hands)}
          </p>
        )}
      </section>
      {review.tournaments.length === 0 ? (
        review.status === 'ready' && <p className="panel muted">Noch keine Hände importiert.</p>
      ) : (
        <>
          <section className="panel stats-section">
            <h3 className="stats-section__title">Fehler pro 100 Hände</h3>
            <TrendBars bars={bars} ariaLabel="Fehler pro 100 Hände der letzten 8 Wochen" />
          </section>
          <section className="panel stats-section">
            <h3 className="stats-section__title">Turniere</h3>
            <div className="review-table-wrap">
              <table className="stats-table review-table">
                <thead>
                  <tr>
                    <th scope="col">Datum</th>
                    <th scope="col">Turnier</th>
                    <th scope="col">Art</th>
                    <th scope="col">Hände</th>
                    <th scope="col">Fehler preflop</th>
                    <th scope="col">Fehler postflop</th>
                    <th scope="col">Fehler pro 100 Hände</th>
                  </tr>
                </thead>
                <tbody>
                  {review.tournaments.map((t) => (
                    <tr key={t.id}>
                      <td>{formatPlayedAt(t.lastPlayedAt).slice(0, 10)}</td>
                      <th scope="row">
                        <button type="button" className="btn btn--ghost review-table__open" onClick={() => onOpen(t.id)}>
                          {t.name}
                        </button>
                      </th>
                      <td>{TOURNAMENT_KIND_LABELS[t.kind]}</td>
                      <td>{formatCount(t.summary.hands)}</td>
                      <td>{formatCount(t.summary.preflopErrors)}</td>
                      {(t.analysisVersion ?? 1) === ANALYSIS_VERSION ? (
                        <td>{formatCount(t.summary.postflopErrors)}</td>
                      ) : (
                        <td title="Wird neu bewertet, sobald du das Turnier öffnest">–</td>
                      )}
                      <td>{formatPer100(errorsPer100(t.summary.preflopErrors + t.summary.postflopErrors, t.summary.hands))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
