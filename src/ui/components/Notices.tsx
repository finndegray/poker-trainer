import type { PersistenceInfo } from '../../app/persistence';
import { localDateKey } from '../../game/streak';
import { downloadText } from '../download';

type Props = { info: PersistenceInfo; saveError: string | null; now: () => Date };

export function Notices({ info, saveError, now }: Props) {
  const backup = info.corruptBackup;
  return (
    <div className="notices">
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
