import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { formatCount, formatHands, formatRetrainingCount } from '../../app/format';
import { retrainingCount, retrainingOn } from '../../game/retraining';
import { localDateKey } from '../../game/streak';
import { type ArchiveExport, readArchivePart, withArchive } from '../../review/export';
import { BACKUP_PREFIX } from '../../storage/store';
import { downloadText } from '../download';
import { useGame, useGameStore } from '../GameContext';
import { useReview, useReviewStore } from '../ReviewContext';
import './screens.css';
import './settings.css';

function backupLabel(key: string): string {
  const date = new Date(key.slice(BACKUP_PREFIX.length));
  if (Number.isNaN(date.getTime())) return key;
  return `Sicherung vom ${date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

/** File.text() with a FileReader fallback for environments that lack it. */
function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Datei nicht lesbar'));
    reader.readAsText(file);
  });
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const store = useGameStore();
  const game = useGame();
  const reviewStore = useReviewStore();
  const review = useReview();
  const [keys, setKeys] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canWrite = !game.info.readOnly && !game.info.otherTabActive;

  const refresh = useCallback(async () => {
    const list = await store.getBackups().list();
    setKeys([...list].reverse());
  }, [store]);
  useEffect(() => {
    refresh().catch(() => setMessage('Sicherungen konnten nicht geladen werden.'));
  }, [refresh]);

  // Without archived hands (and nothing unreadable) the export is exactly the save, as before (and written right away).
  const exportNow = async () => {
    const name = `poker-trainer-spielstand-${localDateKey(new Date())}.json`;
    // The save export is never held back by the archive: while it loads (or failed to), the save goes out alone.
    if (review.status === 'loading' || review.status === 'failed') {
      downloadText(name, store.exportState());
      setMessage(
        review.status === 'loading'
          ? 'Export erstellt. Das Hand-Archiv wurde noch nicht geladen und fehlt darin.'
          : 'Export erstellt. Das Hand-Archiv konnte nicht geladen werden und fehlt darin.',
      );
      return;
    }
    if (review.tournaments.length === 0 && review.problems.length === 0) {
      downloadText(name, store.exportState());
      return;
    }
    try {
      const { part, omitted } = await reviewStore.exportPart();
      downloadText(name, withArchive(store.exportState(), part));
      if (omitted > 0) {
        const what = omitted === 1 ? '1 unlesbarer Archiv-Eintrag' : `${formatCount(omitted)} unlesbare Archiv-Einträge`;
        setMessage(`Export erstellt (${what} nicht exportiert).`);
      }
    } catch (error) {
      setMessage(`Export fehlgeschlagen: ${errorText(error)}`);
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    if (!window.confirm('Aktuellen Spielstand ersetzen? Er wird vorher als Sicherung abgelegt.')) return;
    let part: ArchiveExport | null;
    try {
      const text = await readText(chosen);
      // A broken archive part stops the whole import before anything is replaced.
      part = readArchivePart(text);
      await store.importState(text);
    } catch (error) {
      setMessage(`Import fehlgeschlagen: ${errorText(error)}`);
      return;
    }
    let done = 'Spielstand importiert.';
    if (part) {
      try {
        const merged = await reviewStore.mergeExport(part);
        done = `Spielstand importiert. Hand-Archiv: ${formatHands(merged.imported)} ergänzt, ${formatCount(merged.duplicates)} schon vorhanden.${merged.failures?.length ? ` ${merged.failures.join(' ')}` : ''}`;
      } catch (error) {
        done = `Spielstand importiert. Hand-Archiv nicht übernommen: ${errorText(error)}`;
      }
    }
    // The imported save has no (or an old) queue: the same one-time comparison as at start feeds it from the archive.
    try {
      await reviewStore.syncRetraining();
    } catch (error) {
      console.error(error);
    }
    setMessage(done);
    // The import itself succeeded; a failing list must not be reported as a failed import.
    try {
      await refresh();
    } catch {
      setMessage(`${done} Die Liste der Sicherungen konnte nicht geladen werden.`);
    }
  };

  const download = async (key: string) => {
    try {
      const raw = await store.getBackups().read(key);
      if (raw === undefined) return;
      const date = new Date(key.slice(BACKUP_PREFIX.length));
      const day = Number.isNaN(date.getTime()) ? key.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 10) : localDateKey(date);
      downloadText(`poker-trainer-sicherung-${day}.json`, raw);
    } catch (error) {
      setMessage(`Download fehlgeschlagen: ${errorText(error)}`);
    }
  };

  const remove = async (key: string) => {
    if (!window.confirm('Diese Sicherung endgültig löschen?')) return;
    try {
      await store.getBackups().remove(key);
      await refresh();
    } catch (error) {
      setMessage(`Löschen fehlgeschlagen: ${errorText(error)}`);
    }
  };

  return (
    <>
      <div className="screen-header">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Menü
        </button>
        <span className="muted">Einstellungen</span>
      </div>

      <section className="panel settings-section">
        <h3 className="settings-section__title">Sound</h3>
        <label className="settings-switch">
          <input
            type="checkbox"
            checked={game.save.profile.soundOn}
            disabled={!canWrite}
            onChange={(event) => store.setSound(event.target.checked)}
          />
          Sounds abspielen
        </label>
      </section>

      <section className="panel settings-section">
        <h3 className="settings-section__title">Nachtraining</h3>
        <label className="settings-switch">
          <input
            type="checkbox"
            checked={retrainingOn(game.save)}
            disabled={!canWrite}
            onChange={(event) => store.setRetrainingOn(event.target.checked)}
          />
          Nachtraining mit Fehlern aus deinen Turnieren
        </label>
        <p className="muted">
          Preflop-Fehler aus normalen Turnieren im Hand-Review kommen etwa als jeder vierte Spot ins Push/Fold- und ins
          Starthand-Training, bis du sie zweimal in Folge richtig spielst.
          {retrainingCount(game.save) > 0 && ` ${formatRetrainingCount(retrainingCount(game.save))}`}
        </p>
        {!canWrite && <p className="muted">Einstellungen ändern ist nur in dem Tab möglich, der deinen Fortschritt speichert.</p>}
      </section>

      <section className="panel settings-section">
        <h3 className="settings-section__title">Spielstand</h3>
        <p className="muted">
          Exportiere deinen Spielstand und dein Hand-Archiv als Datei, um sie zu sichern oder auf ein anderes Gerät zu übertragen.
        </p>
        <div className="settings-buttons">
          <button type="button" className="btn" onClick={() => void exportNow()}>
            Exportieren
          </button>
          <button type="button" className="btn" disabled={!canWrite} onClick={() => fileInput.current?.click()}>
            Importieren
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          aria-label="Spielstand-Datei"
          className="settings-file"
          onChange={(event) => void onFile(event)}
        />
        {!canWrite && <p className="muted">Import ist nur in dem Tab möglich, der deinen Fortschritt speichert.</p>}
        {message && <p role="status">{message}</p>}
      </section>

      <section className="panel settings-section">
        <h3 className="settings-section__title">Sicherungen</h3>
        {keys.length === 0 ? (
          <p className="muted">Keine Sicherungen vorhanden.</p>
        ) : (
          <ul className="settings-backups">
            {keys.map((key) => (
              <li key={key}>
                <span>{backupLabel(key)}</span>
                <span className="settings-backups__actions">
                  <button type="button" className="btn btn--ghost" onClick={() => void download(key)}>
                    Herunterladen
                  </button>
                  <button type="button" className="btn btn--ghost" disabled={!canWrite} onClick={() => void remove(key)}>
                    Löschen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel settings-section">
        <h3 className="settings-section__title">Über</h3>
        <p className="muted">Push/Fold-Ranges aus einem Nash-Gleichgewicht in chip-EV · 8-max · Big-Blind-Ante · 1–20 BB.</p>
      </section>
    </>
  );
}
