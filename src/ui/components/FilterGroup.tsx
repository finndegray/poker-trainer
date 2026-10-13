export type Option<T> = { value: T; label: string };

type FilterGroupProps<T extends string | number> = {
  label: string;
  options: readonly Option<T>[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
};

/** A labelled row of toggle buttons (one is pressed). */
export function FilterGroup<T extends string | number>({ label, options, value, disabled, onChange }: FilterGroupProps<T>) {
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
