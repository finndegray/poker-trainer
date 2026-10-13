import type { ReactNode } from 'react';
import './TrainingLayout.css';

/** Table and buttons in `main`, feedback in `side`; side by side on wide screens, stacked on phones. */
export function TrainingLayout({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="training-layout">
      <div className="training-layout__main">{main}</div>
      <div className="training-layout__side">
        {side || <p className="panel muted training-layout__placeholder">Deine Auswertung erscheint hier, sobald du dich entschieden hast.</p>}
      </div>
    </div>
  );
}
