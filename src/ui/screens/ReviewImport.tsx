import { type DragEvent, useRef, useState } from 'react';
import { formatCount } from '../../app/format';
import type { ImportFile, ImportSummary } from '../../review/import';
import { useReview, useReviewStore } from '../ReviewContext';
import './review.css';

/** File.arrayBuffer() with a FileReader fallback for environments that lack it. */
function readBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Datei nicht lesbar'));
    reader.readAsArrayBuffer(file);
  });
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Skip reasons and failures can contain text from the files: always rendered as plain text. */
export function ImportBalance({ summary }: { summary: ImportSummary }) {
  const skipped = summary.skipped.reduce((sum, s) => sum + s.count, 0);
  const failures = summary.failures ?? [];
  return (
    <section className="panel review-balance" aria-label="Bilanz">
      <h3 className="stats-section__title">Bilanz</h3>
      <p>
        Importiert: {formatCount(summary.imported)} · Schon vorhanden: {formatCount(summary.duplicates)} · Übersprungen:{' '}
        {formatCount(skipped)}
      </p>
      {summary.skipped.length > 0 && (
        <ul className="review-balance__reasons">
          {summary.skipped.map((s) => (
            <li key={s.reason}>
              {s.reason}: {formatCount(s.count)}
            </li>
          ))}
        </ul>
      )}
      {failures.length > 0 && (
        <>
          <p>Nicht gespeichert:</p>
          <ul className="review-balance__reasons" role="alert">
            {failures.map((failure, i) => (
              <li key={i}>{failure}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function ReviewImport({ onDone }: { onDone: () => void }) {
  const store = useReviewStore();
  const review = useReview();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = review.progress !== null;
  const locked = !review.writable;

  const run = async (task: () => Promise<ImportSummary>) => {
    setError(null);
    setSummary(null);
    try {
      setSummary(await task());
    } catch (e) {
      setError(errorText(e));
    }
  };
  const importFiles = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (files.length === 0) return;
    void run(async () => {
      const read: ImportFile[] = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: await readBytes(f) })));
      return store.importFiles(read);
    });
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!locked && !busy) importFiles(event.dataTransfer.files);
  };

  const p = review.progress;
  return (
    <>
      {review.lockReason && <p className="notice notice--warning">{review.lockReason}</p>}
      <section className="panel review-import">
        <div
          className={`review-drop${dragging ? ' review-drop--active' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p className="muted">Hand-Historien als .txt oder .zip (bis 20 MB je Datei, bis 20.000 Hände je Import). Am PC auch per Drag & Drop.</p>
          <button type="button" className="btn btn--gold" disabled={locked || busy} onClick={() => fileInput.current?.click()}>
            Dateien wählen
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".txt,.zip,text/plain,application/zip"
            aria-label="Hand-Historien"
            className="review-file"
            onChange={(event) => {
              importFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
        <label className="review-paste">
          <span className="muted">Oder einzelne Hände einfügen:</span>
          <textarea
            aria-label="Hände einfügen"
            rows={6}
            value={pasted}
            disabled={locked || busy}
            onChange={(event) => setPasted(event.target.value)}
          />
        </label>
        <button type="button" className="btn" disabled={locked || busy || pasted.trim() === ''} onClick={() => void run(() => store.importText(pasted))}>
          Eingefügte Hände importieren
        </button>
      </section>
      {p && (
        <section className="panel review-progress" aria-live="polite">
          <progress max={Math.max(1, p.hands)} value={p.hand} aria-label="Fortschritt" />
          <p>
            Turnier {p.tournament} von {p.tournaments} · Hand {formatCount(p.hand)} von {formatCount(p.hands)}
          </p>
        </section>
      )}
      {error && <p role="alert">Import fehlgeschlagen: {error}</p>}
      {summary && (
        <>
          <ImportBalance summary={summary} />
          <button type="button" className="btn" onClick={onDone}>
            Zur Übersicht
          </button>
        </>
      )}
    </>
  );
}
