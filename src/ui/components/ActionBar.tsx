import { type MouseEvent, useEffect, useRef } from 'react';
import type { Action } from '../../engine/pushfold';
import type { SpotKind } from '../../engine/spot-generator';
import './ActionBar.css';

type Props = {
  kind: SpotKind;
  answered: boolean;
  onAction: (action: Action) => void;
  onNext: () => void;
  disabled?: boolean;
};

/** Taps on "Weiter" right after answering are ignored, so a double tap cannot skip the feedback. */
export const NEXT_TAP_GUARD_MS = 300;

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function ActionBar({ kind, answered, onAction, onNext, disabled = false }: Props) {
  const aggressive: Action = kind === 'open' ? 'shove' : 'call';
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
      if (!answered && key === 'f') {
        event.preventDefault();
        onAction('fold');
      } else if (!answered && key === 'a') {
        event.preventDefault();
        onAction(aggressive);
      } else if (answered && (key === ' ' || key === 'enter')) {
        // A focused button already turns space/enter into a click.
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, aggressive, disabled, onAction, onNext]);

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
    <div className="action-bar">
      <button type="button" className="btn" onClick={() => onAction('fold')} disabled={disabled} aria-keyshortcuts="F">
        Fold <kbd aria-hidden="true">F</kbd>
      </button>
      <button
        type="button"
        className="btn btn--gold"
        onClick={() => onAction(aggressive)}
        disabled={disabled}
        aria-keyshortcuts="A"
      >
        {kind === 'open' ? 'All-in' : 'Call'} <kbd aria-hidden="true">A</kbd>
      </button>
    </div>
  );
}
