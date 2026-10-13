import { type MouseEvent, useEffect, useMemo, useRef } from 'react';
import { preflopChoiceLabel } from '../../app/format';
import { type PreflopAction, type PreflopSpot, aggressiveActionOf, allowedActions } from '../../engine/preflop/spots';
import type { Action } from '../../engine/pushfold';
import type { SpotKind } from '../../engine/spot-generator';
import './ActionBar.css';

/** One answer button: `keys` are lower-case keyboard shortcuts, the first one is shown on the button. */
export type Choice<A extends string> = { action: A; label: string; keys: readonly string[]; primary?: boolean };

type ChoiceBarProps<A extends string> = {
  choices: readonly Choice<A>[];
  answered: boolean;
  onAction: (action: A) => void;
  onNext: () => void;
  disabled?: boolean;
};

/** Taps on "Weiter" right after answering are ignored, so a double tap cannot skip the feedback. */
export const NEXT_TAP_GUARD_MS = 300;

/** Shortcuts never fire while the player types into a field. */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function ChoiceBar<A extends string>({ choices, answered, onAction, onNext, disabled = false }: ChoiceBarProps<A>) {
  const nextButton = useRef<HTMLButtonElement>(null);
  const nextArmed = useRef(false);

  useEffect(() => {
    if (!answered) return;
    nextButton.current?.focus({ preventScroll: true });
    nextArmed.current = false;
    const timer = setTimeout(() => {
      nextArmed.current = true;
    }, NEXT_TAP_GUARD_MS);
    return () => clearTimeout(timer);
  }, [answered]);

  // Keyboard activation of the focused button reports detail 0 and is never ignored.
  const onNextClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0 && !nextArmed.current) return;
    onNext();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (disabled || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!answered) {
        const choice = choices.find((c) => c.keys.includes(key));
        if (!choice) return;
        event.preventDefault();
        onAction(choice.action);
      } else if (key === ' ' || key === 'enter') {
        // A focused button already turns space/enter into a click.
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, choices, disabled, onAction, onNext]);

  if (answered) {
    return (
      <div className="action-bar">
        <button
          ref={nextButton}
          type="button"
          className="btn btn--gold action-bar__wide"
          onClick={onNextClick}
          aria-keyshortcuts="Space Enter"
        >
          Weiter <kbd aria-hidden="true">Leertaste</kbd>
        </button>
      </div>
    );
  }
  return (
    <div className={`action-bar${choices.length === 3 ? ' action-bar--three' : ''}`}>
      {choices.map((choice) => (
        <button
          key={choice.action}
          type="button"
          className={`btn${choice.primary ? ' btn--gold' : ''}`}
          onClick={() => onAction(choice.action)}
          disabled={disabled}
          aria-keyshortcuts={choice.keys.map((k) => k.toUpperCase()).join(' ')}
        >
          {choice.label} <kbd aria-hidden="true">{choice.keys[0].toUpperCase()}</kbd>
        </button>
      ))}
    </div>
  );
}

type ActionBarProps = {
  kind: SpotKind;
  answered: boolean;
  onAction: (action: Action) => void;
  onNext: () => void;
  disabled?: boolean;
};

export function ActionBar({ kind, answered, onAction, onNext, disabled = false }: ActionBarProps) {
  const choices = useMemo<Choice<Action>[]>(
    () => [
      { action: 'fold', label: 'Fold', keys: ['f'] },
      { action: kind === 'open' ? 'shove' : 'call', label: kind === 'open' ? 'All-in' : 'Call', keys: ['a'], primary: true },
    ],
    [kind],
  );
  return <ChoiceBar choices={choices} answered={answered} onAction={onAction} onNext={onNext} disabled={disabled} />;
}

/** Fold, Call (not when everybody folded) and the aggressive action with its size. F, C, R or A. */
export function preflopChoices(spot: PreflopSpot): Choice<PreflopAction>[] {
  const aggressive = aggressiveActionOf(spot.kind);
  const choices: Choice<PreflopAction>[] = [{ action: 'fold', label: 'Fold', keys: ['f'] }];
  if (allowedActions(spot.kind).includes('call')) choices.push({ action: 'call', label: 'Call', keys: ['c'] });
  choices.push({ action: aggressive, label: preflopChoiceLabel(aggressive, spot), keys: ['r', 'a'], primary: true });
  return choices;
}

type PreflopActionBarProps = {
  spot: PreflopSpot;
  answered: boolean;
  onAction: (action: PreflopAction) => void;
  onNext: () => void;
  disabled?: boolean;
};

export function PreflopActionBar({ spot, answered, onAction, onNext, disabled = false }: PreflopActionBarProps) {
  const choices = useMemo(() => preflopChoices(spot), [spot]);
  return <ChoiceBar choices={choices} answered={answered} onAction={onAction} onNext={onNext} disabled={disabled} />;
}
