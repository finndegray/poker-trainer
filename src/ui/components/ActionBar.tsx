import { useEffect } from 'react';
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

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function ActionBar({ kind, answered, onAction, onNext, disabled = false }: Props) {
  const aggressive: Action = kind === 'open' ? 'shove' : 'call';

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
        <button type="button" className="btn btn--gold action-bar__wide" onClick={onNext}>
          Weiter <kbd>Leertaste</kbd>
        </button>
      </div>
    );
  }
  return (
    <div className="action-bar">
      <button type="button" className="btn" onClick={() => onAction('fold')} disabled={disabled}>
        Fold <kbd>F</kbd>
      </button>
      <button type="button" className="btn btn--gold" onClick={() => onAction(aggressive)} disabled={disabled}>
        {kind === 'open' ? 'All-in' : 'Call'} <kbd>A</kbd>
      </button>
    </div>
  );
}
