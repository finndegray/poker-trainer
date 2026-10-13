import type { Notice } from '../../app/game-store';
import type { PersistenceInfo } from '../../app/persistence';
import { localDateKey } from '../../game/streak';
import { downloadText } from '../download';

type Props = {
  info: PersistenceInfo;
  saveError: string | null;
  now: () => Date;
  notice: Notice | null;
  onDismissNotice: () => void;
  onApplyUpdate?: () => Promise<void>;
};

export function Notices({ info, saveError, now, notice, onDismissNotice, onApplyUpdate }: Props) {
  const backup = info.corruptBackup;
  return (
    <div className="notices">
      {notice === 'writer-acquired' && (
        <div className="notice">
          <p>Der andere Tab wurde geschlossen. Ab jetzt speichert dieser Tab deinen Fortschritt.</p>
          <button type="button" className="btn btn--gold" onClick={onDismissNotice}>
            OK
          </button>
        </div>
      )}
      {notice === 'update-available' && (
        <div className="notice">
          <p>Eine neue Version ist verfügbar.</p>
          <button type="button" className="btn btn--gold" onClick={() => onApplyUpdate?.().catch((error: unknown) => console.error(error))}>
            Jetzt aktualisieren
          </button>
        </div>
      )}
      {info.readOnly && (
        <p className="notice notice--warning">
          Dieser Spielstand stammt aus einer neueren Version der App. Bitte lade die Seite neu, damit die App sich
          aktualisiert. Bis dahin ist kein Training möglich.
        </p>
      )}
      {info.mode === 'memory' && (
        <p className="notice">
          Dein Browser erlaubt hier keinen dauerhaften Speicher (zum Beispiel im privaten Modus). Dein Fortschritt geht
          beim Schließen verloren.
        </p>
      )}
      {info.otherTabActive && (
        <p className="notice">
          Der Trainer ist bereits in einem anderen Tab geöffnet. Dein Fortschritt wird nur dort gespeichert.
        </p>
      )}
      {backup && (
        <div className="notice notice--warning">
          <p>
            Dein gespeicherter Spielstand war beschädigt und wurde gesichert. Lade die Sicherung herunter, bevor du
            weiterspielst.
          </p>
          <button
            type="button"
            className="btn btn--gold"
            onClick={() => downloadText(`poker-trainer-sicherung-${localDateKey(now())}.json`, backup.raw)}
          >
            Sicherung herunterladen
          </button>
        </div>
      )}
      {saveError && <p className="notice notice--warning">Speichern fehlgeschlagen: {saveError}</p>}
    </div>
  );
}
