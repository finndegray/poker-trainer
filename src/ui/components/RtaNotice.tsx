import { useState } from 'react';

/** Spec 1: shown once, on the first visit of "Situation analysieren". */
export const RTA_NOTICE_TEXT = 'Nur zur Analyse nach dem Spiel – Hilfsmittel während laufender Hände sind bei GGPoker verboten.';
/**
 * Where the dismissal is remembered: in this browser's localStorage, not in the save. It is a hint, not progress, so the
 * save (and its export) stays exactly as it is, and it works in read-only mode and in a second tab, too.
 */
export const RTA_NOTICE_KEY = 'poker-trainer:situation-rta-notice';

type NoticeStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): NoticeStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function dismissed(storage: NoticeStorage | null): boolean {
  try {
    return storage?.getItem(RTA_NOTICE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Without storage (blocked, private mode) the notice comes again on the next visit; nothing breaks. */
export function RtaNotice({ storage = browserStorage() }: { storage?: NoticeStorage | null }) {
  const [hidden, setHidden] = useState(() => dismissed(storage));
  if (hidden) return null;
  const dismiss = () => {
    try {
      storage?.setItem(RTA_NOTICE_KEY, '1');
    } catch {
      // Not remembered; it shows again next time.
    }
    setHidden(true);
  };
  return (
    <div className="notice notice--warning" role="note">
      <p>{RTA_NOTICE_TEXT}</p>
      <button type="button" className="btn btn--gold" onClick={dismiss}>
        Verstanden
      </button>
    </div>
  );
}
