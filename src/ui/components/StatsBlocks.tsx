import { formatPercent } from '../../app/format';
import { type Accuracy, type DecisionRecord, accuracy } from '../../game/stats';

export const EMPTY_ACCURACY: Accuracy = { correct: 0, total: 0, rate: null };
export type AccuracyRow = { label: string; accuracy: Accuracy };

const seconds = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function AccuracyTable({ title, rows }: { title: string; rows: readonly AccuracyRow[] }) {
  const filled = rows.filter((r) => r.accuracy.total > 0);
  let weakest = -1;
  if (filled.length >= 2) {
    filled.forEach((r, i) => {
      if (weakest < 0 || (r.accuracy.rate ?? 1) < (filled[weakest].accuracy.rate ?? 1)) weakest = i;
    });
  }
  return (
    <section className="panel stats-section">
      <h3 className="stats-section__title">{title}</h3>
      <table className="stats-table">
        <thead>
          <tr>
            <th scope="col">Bereich</th>
            <th scope="col">Spots</th>
            <th scope="col">Trefferquote</th>
          </tr>
        </thead>
        <tbody>
          {filled.map((r, i) => (
            <tr key={r.label} className={i === weakest ? 'stats-row--weakest' : undefined}>
              <th scope="row">{r.label}</th>
              <td>{r.accuracy.total}</td>
              <td>{formatPercent(r.accuracy.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function SummaryTiles({ records }: { records: readonly DecisionRecord[] }) {
  const total = accuracy(records);
  const avgMs = records.length > 0 ? records.reduce((sum, r) => sum + r.responseMs, 0) / records.length : 0;
  return (
    <section className="stats-tiles">
      <div className="panel stats-tile">
        <span className="muted">Trefferquote</span>
        <strong>{formatPercent(total.rate)}</strong>
      </div>
      <div className="panel stats-tile">
        <span className="muted">Entscheidungen</span>
        <strong>{total.total}</strong>
      </div>
      <div className="panel stats-tile">
        <span className="muted">Ø Antwortzeit</span>
        <strong>{seconds.format(avgMs / 1000)} s</strong>
      </div>
    </section>
  );
}
