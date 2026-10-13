import { useState } from 'react';
import { formatCount, formatPercent } from '../../app/format';
import { POSITIONS, POSITION_LABELS } from '../../engine/positions';
import { STACK_BUCKETS, type SpotKind } from '../../engine/spot-generator';
import {
  type Accuracy,
  accuracy,
  accuracyBy,
  byKind,
  byPosition,
  byStackBucket,
  handErrorMatrix,
  pushFoldRecords,
  weeklyTrend,
} from '../../game/stats';
import { localDateKey } from '../../game/streak';
import { ErrorHeatmap } from '../components/ErrorHeatmap';
import { TrendChart } from '../components/TrendChart';
import { useGame } from '../GameContext';
import './screens.css';
import './stats.css';

const KIND_LABELS: Record<SpotKind, string> = { open: 'Open-Shove', call: 'Call vs. Shove' };
const seconds = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const shortDate = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}.`;

type Row = { label: string; accuracy: Accuracy };

function AccuracyTable({ title, rows }: { title: string; rows: Row[] }) {
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

export function StatsScreen({ onBack }: { onBack: () => void }) {
  const game = useGame();
  const [kind, setKind] = useState<SpotKind>('open');
  // Push/fold numbers only; starthand decisions get their own section (Task 7).
  const records = pushFoldRecords(game.save.decisions);

  const header = (
    <div className="screen-header">
      <button type="button" className="btn btn--ghost" onClick={onBack}>
        ← Menü
      </button>
      <span className="muted">Statistik</span>
    </div>
  );
  if (records.length === 0) {
    return (
      <>
        {header}
        <p className="panel">Noch keine Entscheidungen. Spiel ein paar Spots, dann siehst du hier deine Stärken und Schwächen.</p>
      </>
    );
  }

  const total = accuracy(records);
  const avgMs = records.reduce((sum, r) => sum + r.responseMs, 0) / records.length;
  const positions = accuracyBy(records, byPosition);
  const buckets = accuracyBy(records, byStackBucket);
  const kinds = accuracyBy(records, byKind);
  const matrix = handErrorMatrix(records, kind);
  const trend = weeklyTrend(records, localDateKey(new Date()));
  const recentRuns = [...game.save.runs].reverse().slice(0, 5);
  const recentDailies = Object.values(game.save.daily)
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
    .slice(0, 7);
  const empty: Accuracy = { correct: 0, total: 0, rate: null };

  return (
    <>
      {header}
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
      <AccuracyTable
        title="Nach Position"
        rows={POSITIONS.map((p) => ({ label: POSITION_LABELS[p], accuracy: positions.get(p) ?? empty }))}
      />
      <AccuracyTable
        title="Nach Stack"
        rows={STACK_BUCKETS.map((b) => ({ label: `${b} BB`, accuracy: buckets.get(b) ?? empty }))}
      />
      <AccuracyTable
        title="Nach Spot-Typ"
        rows={(['open', 'call'] as const).map((k) => ({ label: KIND_LABELS[k], accuracy: kinds.get(k) ?? empty }))}
      />
      <section className="panel stats-section">
        <h3 className="stats-section__title">Fehler-Heatmap</h3>
        <div className="stats-toggle">
          {(['open', 'call'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`btn${kind === k ? ' btn--gold' : ''}`}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <ErrorHeatmap total={matrix.total} errors={matrix.errors} />
      </section>
      <section className="panel stats-section">
        <h3 className="stats-section__title">Verlauf</h3>
        <TrendChart points={trend} />
      </section>
      <section className="panel stats-section">
        <h3 className="stats-section__title">Endphase-Run</h3>
        {game.save.bestRun ? (
          <p>Beste Platzierung: Platz {formatCount(game.save.bestRun.placement)}</p>
        ) : (
          <p className="muted">Noch kein Run gespielt</p>
        )}
        <ul className="stats-list">
          {recentRuns.map((r) => (
            <li key={r.ts}>
              {shortDate(r.dateKey)}: Platz {formatCount(r.placement)}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel stats-section">
        <h3 className="stats-section__title">Daily Challenge</h3>
        {recentDailies.length === 0 ? (
          <p className="muted">Noch keine Daily gespielt</p>
        ) : (
          <ul className="stats-list">
            {recentDailies.map((d) => (
              <li key={d.dateKey}>
                {shortDate(d.dateKey)}: {d.correct}/{d.total}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
