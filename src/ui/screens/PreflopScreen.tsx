import { useCallback, useEffect } from 'react';
import { PREFLOP_KINDS, PREFLOP_KIND_LABELS, type PreflopAction, STACK_DEPTHS } from '../../engine/preflop/spots';
import { type PreflopFilter, preflopFilterOf } from '../../game/preflop-filter';
import { PreflopActionBar } from '../components/ActionBar';
import { PreflopTable } from '../components/PokerTable';
import { PreflopFeedbackPanel } from '../components/PreflopFeedbackPanel';
import { StatusBar } from '../components/StatusBar';
import { useGame, useGameStore } from '../GameContext';
import './screens.css';

type Option<T> = { value: T; label: string };

const KIND_OPTIONS: Option<PreflopFilter['kind']>[] = [
  { value: 'all', label: 'Alle' },
  ...PREFLOP_KINDS.map((kind) => ({ value: kind, label: PREFLOP_KIND_LABELS[kind] })),
];
const STACK_OPTIONS: Option<PreflopFilter['stack']>[] = [
  { value: 'all', label: 'Alle' },
  ...STACK_DEPTHS.map((stack) => ({ value: stack, label: `${stack} BB` })),
];

type FilterGroupProps<T extends string | number> = {
  label: string;
  options: readonly Option<T>[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
};

function FilterGroup<T extends string | number>({ label, options, value, disabled, onChange }: FilterGroupProps<T>) {
  return (
    <div className="filter-group" role="group" aria-label={label}>
      <span className="filter-group__label muted" aria-hidden="true">
        {label}
      </span>
      <div className="filter-group__options">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={`btn filter-group__option${option.value === value ? ' btn--gold' : ''}`}
            aria-pressed={option.value === value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function filterSummary(filter: PreflopFilter): string {
  const kind = filter.kind === 'all' ? 'alle Spots' : PREFLOP_KIND_LABELS[filter.kind];
  const stack = filter.stack === 'all' ? 'alle Stacks' : `${filter.stack} BB`;
  return `${kind} · ${stack}`;
}

export function PreflopScreen({ onBack }: { onBack: () => void }) {
  const store = useGameStore();
  const game = useGame();
  const filter = preflopFilterOf(game.save.profile);
  const locked = game.info.readOnly;
  const hasSpot = game.preflopCurrent !== null;

  // startPreflop resumes an unanswered spot, so repeating it (StrictMode, tab hand-over) is safe.
  useEffect(() => {
    if (!locked) store.startPreflop();
  }, [store, locked, hasSpot]);

  const onAction = useCallback(
    (action: PreflopAction) => {
      store.answerPreflop(action);
    },
    [store],
  );
  const onNext = useCallback(() => {
    store.nextPreflopSpot();
  }, [store]);
  // The store does not block filter changes in read-only mode, so the controls are disabled instead.
  const setFilter = (patch: Partial<PreflopFilter>) => store.setPreflopFilter({ ...filter, ...patch });

  const current = game.preflopCurrent;
  return (
    <>
      <div className="screen-header">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Menü
        </button>
        <span className="muted">Starthand-Training</span>
      </div>
      <StatusBar status={game.status} xp={game.save.profile.xp} />
      {/* Collapsed by default so table and action buttons fit on a phone screen. */}
      <details className="panel filters" aria-label="Filter">
        <summary className="filters__summary">Filter: {filterSummary(filter)}</summary>
        <FilterGroup label="Spot-Typ" options={KIND_OPTIONS} value={filter.kind} disabled={locked} onChange={(kind) => setFilter({ kind })} />
        <FilterGroup label="Stack" options={STACK_OPTIONS} value={filter.stack} disabled={locked} onChange={(stack) => setFilter({ stack })} />
      </details>
      {current && (
        <>
          <PreflopTable key={current.shownAt} spot={current.spot} cards={current.cards} />
          <PreflopActionBar spot={current.spot} answered={game.preflopLast !== null} onAction={onAction} onNext={onNext} />
          {game.preflopLast && <PreflopFeedbackPanel result={game.preflopLast} />}
        </>
      )}
    </>
  );
}
