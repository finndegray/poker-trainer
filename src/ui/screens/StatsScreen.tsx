import { useState } from 'react';
import { formatCount } from '../../app/format';
import { POSITIONS, POSITION_LABELS } from '../../engine/positions';
import { STACK_BUCKETS, type SpotKind } from '../../engine/spot-generator';
import {
  type PushFoldRecord,
  accuracyBy,
  byKind,
  byPosition,
  byStackBucket,
  handErrorMatrix,
  preflopRecords,
  pushFoldRecords,
  weeklyTrend,
} from '../../game/stats';
import { localDateKey } from '../../game/streak';
import { ErrorHeatmap } from '../components/ErrorHeatmap';
import { PreflopStats } from '../components/PreflopStats';
import { AccuracyTable, EMPTY_ACCURACY, SummaryTiles } from '../components/StatsBlocks';
import { TrendChart } from '../components/TrendChart';
import { useGame } from '../GameContext';
import './screens.css';
import './stats.css';

const KIND_LABELS: Record<SpotKind, string> = { open: 'Open-Shove', call: 'Call vs. Shove' };
const shortDate = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}.`;

function PushFoldStats({ records }: { records: readonly PushFoldRecord[] }) {
  const [kind, setKind] = useState<SpotKind>('open');
  const positions = accuracyBy(records, byPosition);
  const buckets = accuracyBy(records, byStackBucket);
  const kinds = accuracyBy(records, byKind);
  const matrix = handErrorMatrix(records, kind);
  const trend = weeklyTrend(records, localDateKey(new Date()));
  return (
    <>
      <SummaryTiles records={records} />
      <AccuracyTable
        title="Nach Position"
        rows={POSITIONS.map((p) => ({ label: POSITION_LABELS[p], accuracy: positions.get(p) ?? EMPTY_ACCURACY }))}
      />
      <AccuracyTable
        title="Nach Stack"
        rows={STACK_BUCKETS.map((b) => ({ label: `${b} BB`, accuracy: buckets.get(b) ?? EMPTY_ACCURACY }))}
      />
      <AccuracyTable
        title="Nach Spot-Typ"
        rows={(['open', 'call'] as const).map((k) => ({ label: KIND_LABELS[k], accuracy: kinds.get(k) ?? EMPTY_ACCURACY }))}
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
    </>
  );
}

export function StatsScreen({ onBack }: { onBack: () => void }) {
  const game = useGame();
  // The push/fold numbers never include starthand decisions; those get their own section.
  const pushFold = pushFoldRecords(game.save.decisions);
  const preflop = preflopRecords(game.save.decisions);

  const header = (
    <div className="screen-header">
      <button type="button" className="btn btn--ghost" onClick={onBack}>
        ← Menü
      </button>
      <span className="muted">Statistik</span>
    </div>
  );
  if (pushFold.length === 0 && preflop.length === 0) {
    return (
      <>
        {header}
        <p className="panel">Noch keine Entscheidungen. Spiel ein paar Spots, dann siehst du hier deine Stärken und Schwächen.</p>
      </>
    );
  }

  const recentRuns = [...game.save.runs].reverse().slice(0, 5);
  const recentDailies = Object.values(game.save.daily)
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
    .slice(0, 7);

  return (
    <>
      {header}
      <div className="stats-columns">
        <section className="stats-block" aria-label="Push/Fold">
          <h2 className="stats-heading">Push/Fold</h2>
          {pushFold.length > 0 ? (
            <PushFoldStats records={pushFold} />
          ) : (
            <p className="panel muted">Noch keine Push/Fold-Entscheidungen.</p>
          )}
        </section>
        <PreflopStats records={preflop} />
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
      </div>
    </>
  );
}
