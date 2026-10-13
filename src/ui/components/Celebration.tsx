import { useEffect, useRef } from 'react';
import type { RankName } from '../../game/xp';
import './Celebration.css';

const PIECES = Array.from({ length: 24 }, (_, i) => i);

export function Celebration({ rank, onClose }: { rank: RankName; onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    button.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="celebration" role="dialog" aria-modal="true" aria-labelledby="celebration-title">
      <div className="celebration__confetti" aria-hidden="true">
        {PIECES.map((i) => (
          <span
            key={i}
            className="celebration__piece"
            style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 8) * 90}ms`, transform: `rotate(${i * 29}deg)` }}
          />
        ))}
      </div>
      <div className="celebration__card panel">
        <h2 id="celebration-title" className="celebration__title">
          Aufgestiegen!
        </h2>
        <p className="celebration__text">Du bist jetzt {rank}.</p>
        <button ref={button} type="button" className="btn btn--gold" onClick={onClose}>
          Weiter so!
        </button>
      </div>
    </div>
  );
}
