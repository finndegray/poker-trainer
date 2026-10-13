import { useState } from 'react';
import { POSITIONS, POSITION_LABELS } from '../../engine/positions';
import { PREFLOP_KINDS, PREFLOP_KIND_LABELS, type PreflopKind, STACK_DEPTHS } from '../../engine/preflop/spots';
import {
  type PreflopRecord,
  accuracyBy,
  byPreflopHero,
  byPreflopKind,
  byPreflopStack,
  preflopHandErrorMatrix,
} from '../../game/stats';
import { ErrorHeatmap } from './ErrorHeatmap';
import { AccuracyTable, EMPTY_ACCURACY, SummaryTiles } from './StatsBlocks';

export function PreflopStats({ records }: { records: readonly PreflopRecord[] }) {
  const [kind, setKind] = useState<PreflopKind>('rfi');
  if (records.length === 0) {
    return (
      <section className="stats-block" aria-label="Starthände">
        <h2 className="stats-heading">Starthände</h2>
        <p className="panel muted">Noch keine Starthand-Entscheidungen. Probier das Starthand-Training auf der Startseite aus.</p>
      </section>
    );
  }
  const kinds = accuracyBy(records, byPreflopKind);
  const heroes = accuracyBy(records, byPreflopHero);
  const stacks = accuracyBy(records, byPreflopStack);
  const matrix = preflopHandErrorMatrix(records, kind);
  return (
    <section className="stats-block" aria-label="Starthände">
      <h2 className="stats-heading">Starthände</h2>
      <SummaryTiles records={records} />
      <AccuracyTable
        title="Starthände nach Spot-Typ"
        rows={PREFLOP_KINDS.map((k) => ({ label: PREFLOP_KIND_LABELS[k], accuracy: kinds.get(k) ?? EMPTY_ACCURACY }))}
      />
      <AccuracyTable
        title="Starthände nach Position"
        rows={POSITIONS.map((p) => ({ label: POSITION_LABELS[p], accuracy: heroes.get(p) ?? EMPTY_ACCURACY }))}
      />
      <AccuracyTable
        title="Starthände nach Stack"
        rows={STACK_DEPTHS.map((s) => ({ label: `${s} BB`, accuracy: stacks.get(`${s} BB`) ?? EMPTY_ACCURACY }))}
      />
      <section className="panel stats-section">
        <h3 className="stats-section__title">Starthände: Fehler-Heatmap</h3>
        <div className="stats-toggle stats-toggle--three">
          {PREFLOP_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`btn${kind === k ? ' btn--gold' : ''}`}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {PREFLOP_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <ErrorHeatmap total={matrix.total} errors={matrix.errors} />
      </section>
    </section>
  );
}
