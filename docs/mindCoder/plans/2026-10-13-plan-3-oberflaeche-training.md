# Plan 3: Oberfläche, Training, PWA und Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use mindCoder:subagent-driven-development (recommended) or mindCoder:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine spielbare Web-App im Casino-Look: Startseite, Trainingsmodus mit 8-Platz-Tisch, Feedback mit Range-Chart und Positions-Vergleich, Statusleiste mit Rang/XP/Streak, robuste Speicherung im Browser, installierbar als PWA und automatisch auf GitHub Pages veröffentlicht.

**Architecture:** React 19 mit Vite 6. Die Logik bleibt in `src/engine/`, `src/game/` und `src/storage/` (Plan 1 und 2). Neu: `src/app/` (Persistenz-Controller und Spiel-Store, framework-frei und unit-testbar) und `src/ui/` (React-Komponenten, Bildschirme, CSS). Der Store hält den `SaveState`, wendet die reinen Funktionen aus `src/game/session.ts` an und übergibt jeden neuen Stand an eine Speicher-Warteschlange. React liest den Store über `useSyncExternalStore`.

**Tech Stack:** React 19, Vite 6, `@vitejs/plugin-react` 4, `vite-plugin-pwa` 1, Vitest 3 mit jsdom und Testing Library, GitHub Actions und GitHub Pages.

## Global Constraints

- Entwickler-Rechner: Windows 11 (PowerShell) UND macOS (zsh). Jede Automation läuft als Node-Skript via `npm run`; keine Shell-Befehle in `package.json`. Dateien in UTF-8 mit LF.
- Texte in der Oberfläche auf Deutsch mit echten Umlauten. Identifier und Code-Kommentare auf Englisch.
- Veröffentlichungsadresse: `https://finndegray.github.io/poker-trainer/`. Vite-`base` ist `/poker-trainer/`.
- Stil „Klassisch Casino“ (Design-Tokens, verbindlich): Filz `#0E4D2E`, Filz hell `#13633B`, Filz dunkel `#0A3820`, Gold `#E8C15A`, Gold dunkel `#3A2A05` (Text auf Gold), Creme `#F3E9C6` (Text), Creme gedämpft `#CFE3D4`, Rot (Karten) `#B3261E`, Schwarz (Karten) `#1A1A1A`, Fehler `#F09595`, Erfolg `#9FE1CB`. Karten weiß `#FFFFFF`.
- Responsiv: eine zentrierte Spalte mit maximal 560 px Breite; am Handy mit dem Daumen bedienbar (Aktions-Buttons mindestens 48 px hoch).
- Tastatur am PC: `F` = Fold, `A` = All-in bzw. Call, Leertaste oder Enter = weiter. Die Tasten wirken nur, wenn kein Eingabefeld fokussiert ist.
- Antwortzeit (`responseMs`) wird von der Anzeige des Spots bis zum Klick gemessen (`performance.now()`).
- Tisch: 8 Plätze, beschriftet über `POSITION_LABELS`; der eigene Platz immer unten Mitte; Dealer-Button am BTN; SB und BB zeigen ihre Blinds, der BB zusätzlich die Ante; gefoldete Spieler ausgegraut; der Shover mit „All-in“ markiert; Hinweis „noch N Spieler hinter dir“ (N = Spieler, die nach dem Helden noch handeln).
- Feedback nach jeder Entscheidung: Ergebnis (richtig, falsch, knapp), EV beider Optionen („All-in +0,42 BB · Fold 0 BB“, deutsches Dezimalkomma, Vorzeichen), XP-Gewinn, Range-Chart 13×13 mit vier Zellfarben (Push/Call, Fold, knapp Push/Call, knapp Fold) und markierter eigener Hand, Positions-Vergleich als Zeile plus Zusammenfassung.
- Speicherung (Spec 8.5): Speicher-Warteschlange (neuester Stand gewinnt, höchstens ein Schreibvorgang gleichzeitig, sofortiges Schreiben bei `visibilitychange` → hidden und `pagehide`); nur ein Tab schreibt (Web Locks, Lock-Name `poker-trainer-writer`); `navigator.storage.persist()` wird angefragt; ohne IndexedDB Rückfall auf den Arbeitsspeicher mit Hinweis; bei `readOnly` Hinweis „Bitte aktualisieren“ und kein Training; bei `corruptBackup` Download-Angebot des Rohtexts.
- Nicht in diesem Plan (folgt in Plan 4): Daily Challenge, Endphase-Run, Statistik-Seite, Einstellungen mit Backup-Liste und Export/Import, Sounds, Rangaufstiegs-Feier. Die Startseite zeigt diese Modi als „bald verfügbar“.

## Bestehende API (aus Plan 1 und 2, unverändert nutzen)

- Engine: `parsePushFoldData(raw)`, `PushFoldData`, `Spot`, `Situation`, `Action`, `Grade`, `ChartCell`, `chart(data, situation)`, `aggressiveAction(s)`, `comparePositions(data, spot)` → `{ entries: { position, cell, ev, isHero }[]; summary }`, `POSITIONS`, `POSITION_LABELS`, `seatOf`, `Position`, `handName`, `HAND_COUNT`, `dealConcrete(hand, rng)` → `[Card, Card]`, `rankOf`, `suitOf`, `RANKS`, `mulberry32`, `Rng`, `Card`.
- Game: `recordDecision(data, state, { spot, chosen, responseMs, mode, now })` → `{ state, grade, xp: { xp, combo, multiplier }, record, rank: { before, after, rankUp } }`, `statusOf(state, now)` → `{ rank: { name, minXp, next, progress }, streak, dayProgress: { count, target, done }, dailyToday, bestRun, activeRun }`, `nextTrainingSpot(data, state, rng, options?)`, `setSound(state, on)`.
- Storage: `KeyValueBackend` (`get`, `set`, `keys`, `del`), `indexedDbBackend()`, `memoryBackend()`, `loadState(backend, now)` → `{ state, corruptBackup: { key, raw } | null, readOnly }`, `saveState(backend, state, { readOnly? })`, `SaveState`, `emptyState()`.

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `vite.config.ts`, `index.html`, `src/main.tsx` | App-Einstieg, Build, PWA-Plugin |
| `src/ui/theme.css` | Design-Tokens, Grundlayout, Buttons |
| `src/app/data.ts` | Push/Fold-Daten laden und validieren (einmal) |
| `src/app/save-queue.ts` | Zusammenfassende Speicher-Warteschlange |
| `src/app/persistence.ts` | Backend-Wahl, Laden, Writer-Lock, Persist-Anfrage, Speichern |
| `src/app/game-store.ts` | Store mit `SaveState`, Aktionen, Abonnement |
| `src/app/format.ts` | Deutsche Zahlen- und EV-Formatierung |
| `src/ui/GameContext.tsx` | React-Kontext und Hooks für den Store |
| `src/ui/table-model.ts` | Reine Ableitung der 8 Plätze aus einem Spot |
| `src/ui/components/PlayingCard.tsx`, `PokerTable.tsx` | Karte und Tisch |
| `src/ui/components/StatusBar.tsx`, `ActionBar.tsx` | Rang/XP/Streak, Aktions-Buttons mit Tastatur |
| `src/ui/components/RangeChart.tsx`, `PositionRow.tsx`, `FeedbackPanel.tsx` | Feedback |
| `src/ui/screens/HomeScreen.tsx`, `TrainingScreen.tsx`, `src/ui/App.tsx` | Bildschirme und Navigation |
| `src/ui/components/Notices.tsx` | Hinweise (Nur-Lesen, Arbeitsspeicher, anderer Tab, defekter Stand) |
| `scripts/make-icons.mjs`, `public/icons/*` | App-Icons (PNG) |
| `.github/workflows/ci.yml`, `.github/workflows/pages.yml` | Prüfung und Veröffentlichung |

---

### Task 1: Vite- und React-Grundgerüst mit Design-Tokens

**Files:**
- Create: `vite.config.ts`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `src/ui/theme.css`, `src/ui/test-setup.ts`
- Modify: `package.json` (Skripte, Abhängigkeiten), `tsconfig.json`, `vitest.config.ts`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm run preview`; `App` (wird in Task 8 ersetzt); CSS-Klassen `.app`, `.panel`, `.btn`, `.btn--gold`, `.btn--ghost`, `.muted`, `.badge`; CSS-Variablen aus den Global Constraints. UI-Tests laufen mit dem Kommentar `// @vitest-environment jsdom` in der ersten Zeile.

- [ ] **Step 1: Branch anlegen und Abhängigkeiten installieren**

```bash
git switch -c feat/oberflaeche
npm install react@^19.1.0 react-dom@^19.1.0
npm install -D vite@^6.3.0 @vitejs/plugin-react@^4.5.0 @types/react@^19.1.0 @types/react-dom@^19.1.0 jsdom@^26.1.0 @testing-library/react@^16.3.0 @testing-library/dom@^10.4.0 @testing-library/user-event@^14.6.0
```
Expected: keine Fehler. Liegt eine installierte Version außerhalb der angegebenen Bereiche, abbrechen und melden.

- [ ] **Step 2: Skripte in `package.json` ergänzen**

Im Block `scripts` ergänzen (bestehende Einträge bleiben):
```json
"dev": "vite",
"build": "vite build",
"preview": "vite preview"
```

- [ ] **Step 3: Konfiguration schreiben**

`vite.config.ts`:
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/poker-trainer/',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
```

`tsconfig.json` (komplett ersetzen):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["node", "vite/client"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  },
  "include": ["src", "scripts", "vitest.config.ts", "vite.config.ts"]
}
```

`vitest.config.ts` (komplett ersetzen):
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    setupFiles: ['src/ui/test-setup.ts'],
    testTimeout: 60_000,
  },
});
```

`src/ui/test-setup.ts`:
```ts
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

`index.html`:
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#0E4D2E" />
    <title>Poker-Trainer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx` (vorläufig, wird in Task 8 ersetzt):
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/ui/theme.css`:
```css
:root {
  --felt: #0e4d2e;
  --felt-light: #13633b;
  --felt-dark: #0a3820;
  --gold: #e8c15a;
  --gold-ink: #3a2a05;
  --cream: #f3e9c6;
  --cream-muted: #cfe3d4;
  --card-red: #b3261e;
  --card-black: #1a1a1a;
  --danger: #f09595;
  --success: #9fe1cb;
  --radius: 10px;
  --font: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background: var(--felt-dark);
  color: var(--cream);
  font-family: var(--font);
  -webkit-tap-highlight-color: transparent;
}

.app {
  max-width: 560px;
  margin: 0 auto;
  padding: max(12px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100vh;
}

.app__title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--gold);
  letter-spacing: 0.5px;
}

.panel {
  background: var(--felt);
  border: 1px solid rgba(232, 193, 90, 0.35);
  border-radius: var(--radius);
  padding: 14px 16px;
}

.muted {
  color: var(--cream-muted);
}

.badge {
  display: inline-block;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--felt-dark);
  color: var(--cream-muted);
  border: 1px solid rgba(207, 227, 212, 0.25);
}

.btn {
  appearance: none;
  border: 1px solid rgba(243, 233, 198, 0.3);
  background: var(--felt-dark);
  color: var(--cream);
  font: inherit;
  font-size: 16px;
  font-weight: 600;
  min-height: 48px;
  padding: 0 18px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: transform 80ms ease, filter 120ms ease;
}

.btn:active {
  transform: scale(0.98);
}

.btn:hover {
  filter: brightness(1.12);
}

.btn:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.btn--gold {
  background: var(--gold);
  color: var(--gold-ink);
  border-color: var(--gold);
}

.btn--ghost {
  background: transparent;
  min-height: 36px;
  padding: 0 10px;
  font-weight: 500;
}

.btn[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}
```

`src/ui/App.tsx` (vorläufig):
```tsx
export function App() {
  return (
    <main className="app">
      <h1 className="app__title">Poker-Trainer</h1>
    </main>
  );
}
```

- [ ] **Step 4: Failing Test schreiben**

`src/ui/App.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the title', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Poker-Trainer' })).toBeTruthy();
  });
});
```

- [ ] **Step 5: Tests, Typecheck und Build laufen lassen**

Run: `npm test` → Expected: alle bisherigen Tests plus `App.test.tsx` PASS.
Run: `npm run typecheck` → Expected: Exit 0.
Run: `npm run build` → Expected: `dist/index.html` und ein JS-Bundle entstehen, keine Fehler.

- [ ] **Step 6: `dist/` ignorieren und committen**

`.gitignore` enthält `dist/` bereits (Plan 1). Prüfen mit `git status --short` (kein `dist/`).

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts vite.config.ts index.html src/main.tsx src/ui
git commit -m "feat(ui): Vite- und React-Grundgerüst mit Casino-Design-Tokens"
```

---

### Task 2: Daten laden und deutsche Formatierung

**Files:**
- Create: `src/app/data.ts`, `src/app/format.ts`
- Test: `src/app/data.test.ts`, `src/app/format.test.ts`

**Interfaces:**
- Consumes: `parsePushFoldData`, `PushFoldData`; `Action`, `Verdict`, `SpotKind`
- Produces:
  - `getPushFoldData(): PushFoldData` (parst `src/data/pushfold.json` einmal und cacht)
  - `formatEv(ev: number): string` → `"+0,42 BB"`, `"−1,30 BB"` (Minuszeichen U+2212), `"0 BB"` bei |ev| < 0,005
  - `formatPercent(rate: number | null): string` → `"62 %"` bzw. `"–"` bei `null`
  - `actionLabel(action: Action): string` → `shove` „All-in“, `call` „Call“, `fold` „Fold“
  - `aggressiveWord(kind: SpotKind): 'Push' | 'Call'`
  - `evLine(kind: SpotKind, evAggressive: number): string` → `"All-in +0,42 BB · Fold 0 BB"` bzw. `"Call −0,80 BB · Fold 0 BB"`
  - `verdictLabel(verdict: Verdict): string` → `correct` „Richtig“, `close` „Knapp – beides okay“, `wrong` „Falsch“

- [ ] **Step 1: Failing Tests schreiben**

`src/app/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { actionLabel, aggressiveWord, evLine, formatEv, formatPercent, verdictLabel } from './format';

describe('format', () => {
  it('formats EVs the German way with a sign', () => {
    expect(formatEv(0.42)).toBe('+0,42 BB');
    expect(formatEv(-1.3)).toBe('−1,30 BB');
    expect(formatEv(12.345)).toBe('+12,35 BB');
    expect(formatEv(0)).toBe('0 BB');
    expect(formatEv(0.004)).toBe('0 BB');
    expect(formatEv(-0.004)).toBe('0 BB');
  });

  it('formats percentages', () => {
    expect(formatPercent(0.625)).toBe('63 %');
    expect(formatPercent(1)).toBe('100 %');
    expect(formatPercent(null)).toBe('–');
  });

  it('labels actions, verdicts and EV lines', () => {
    expect(actionLabel('shove')).toBe('All-in');
    expect(actionLabel('call')).toBe('Call');
    expect(actionLabel('fold')).toBe('Fold');
    expect(aggressiveWord('open')).toBe('Push');
    expect(aggressiveWord('call')).toBe('Call');
    expect(evLine('open', 0.42)).toBe('All-in +0,42 BB · Fold 0 BB');
    expect(evLine('call', -0.8)).toBe('Call −0,80 BB · Fold 0 BB');
    expect(verdictLabel('correct')).toBe('Richtig');
    expect(verdictLabel('close')).toBe('Knapp – beides okay');
    expect(verdictLabel('wrong')).toBe('Falsch');
  });
});
```

`src/app/data.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { getPushFoldData } from './data';

describe('getPushFoldData', () => {
  it('loads the bundled data once', () => {
    const a = getPushFoldData();
    expect(a.version).toBe(1);
    expect(a.openShove.BTN).toHaveLength(20);
    expect(getPushFoldData()).toBe(a);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run src/app` → Expected: FAIL, Module nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/app/data.ts`:
```ts
import raw from '../data/pushfold.json';
import { type PushFoldData, parsePushFoldData } from '../engine/pushfold-data';

let cached: PushFoldData | null = null;

export function getPushFoldData(): PushFoldData {
  cached ??= parsePushFoldData(raw);
  return cached;
}
```

`src/app/format.ts`:
```ts
import type { Action, Verdict } from '../engine/pushfold';
import type { SpotKind } from '../engine/spot-generator';

const evNumber = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MINUS = '−';

export function formatEv(ev: number): string {
  if (Math.abs(ev) < 0.005) return '0 BB';
  return `${ev > 0 ? '+' : MINUS}${evNumber.format(Math.abs(ev))} BB`;
}

export function formatPercent(rate: number | null): string {
  return rate === null ? '–' : `${Math.round(rate * 100)} %`;
}

const ACTION_LABELS: Record<Action, string> = { shove: 'All-in', call: 'Call', fold: 'Fold' };
export const actionLabel = (action: Action): string => ACTION_LABELS[action];

export const aggressiveWord = (kind: SpotKind): 'Push' | 'Call' => (kind === 'open' ? 'Push' : 'Call');

export function evLine(kind: SpotKind, evAggressive: number): string {
  const label = kind === 'open' ? 'All-in' : 'Call';
  return `${label} ${formatEv(evAggressive)} · Fold 0 BB`;
}

const VERDICT_LABELS: Record<Verdict, string> = {
  correct: 'Richtig',
  close: 'Knapp – beides okay',
  wrong: 'Falsch',
};
export const verdictLabel = (verdict: Verdict): string => VERDICT_LABELS[verdict];
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/app` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/data.ts src/app/data.test.ts src/app/format.ts src/app/format.test.ts
git commit -m "feat(app): Daten-Loader und deutsche EV-Formatierung"
```

---

### Task 3: Speicher-Warteschlange und Persistenz-Controller

**Files:**
- Create: `src/app/save-queue.ts`, `src/app/persistence.ts`
- Test: `src/app/save-queue.test.ts`, `src/app/persistence.test.ts`

**Interfaces:**
- Consumes: `KeyValueBackend`, `indexedDbBackend`, `memoryBackend`, `loadState`, `saveState`, `SaveState`
- Produces:
  - `class SaveQueue<T> { constructor(write: (value: T) => Promise<void>, onError: (error: unknown) => void); schedule(value: T): void; flush(): Promise<void> }` — neuester Wert gewinnt, höchstens ein Schreibvorgang gleichzeitig, Fehler gehen an `onError`, die Warteschlange läuft danach weiter
  - `WRITER_LOCK = 'poker-trainer-writer'`
  - `type LockLike = { request(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<void>): Promise<unknown> }`
  - `acquireWriterLock(locks?: LockLike): Promise<boolean>` (ohne Lock-API: `true`; Lock wird bis zum Schließen des Tabs gehalten)
  - `type StorageMode = 'indexeddb' | 'memory'`
  - `type PersistenceInfo = { mode: StorageMode; readOnly: boolean; otherTabActive: boolean; corruptBackup: { key: string; raw: string } | null }`
  - `type Persistence = { initial: SaveState; info: PersistenceInfo; save(state: SaveState): void; flush(): Promise<void> }` — `save` ist ein No-op, wenn `readOnly` oder `otherTabActive`
  - `type PersistenceEnv = { createBackend: () => KeyValueBackend; locks?: LockLike; storage?: { persist?: () => Promise<boolean> }; now: () => Date; onSaveError: (error: unknown) => void }`
  - `openPersistence(env: PersistenceEnv): Promise<Persistence>` (Ladefehler des Backends → Arbeitsspeicher, `mode: 'memory'`)
  - `browserEnv(onSaveError: (error: unknown) => void): PersistenceEnv`
  - `installFlushOnHide(persistence: Pick<Persistence, 'flush'>, doc: Document, win: Window): () => void`

- [ ] **Step 1: Failing Tests schreiben**

`src/app/save-queue.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SaveQueue } from './save-queue';

const tick = () => new Promise<void>((r) => setTimeout(r, 5));

describe('SaveQueue', () => {
  it('writes the latest value and never two at once', async () => {
    const writes: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const queue = new SaveQueue<number>(async (v) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await tick();
      writes.push(v);
      inFlight--;
    }, () => {});

    queue.schedule(1);
    queue.schedule(2);
    queue.schedule(3);
    await queue.flush();
    expect(writes).toEqual([1, 3]);
    expect(maxInFlight).toBe(1);

    queue.schedule(4);
    await queue.flush();
    expect(writes).toEqual([1, 3, 4]);
  });

  it('reports errors and keeps going', async () => {
    const errors: unknown[] = [];
    const writes: number[] = [];
    const queue = new SaveQueue<number>(async (v) => {
      if (v === 1) throw new Error('voll');
      writes.push(v);
    }, (e) => errors.push(e));
    queue.schedule(1);
    await queue.flush();
    queue.schedule(2);
    await queue.flush();
    expect(errors).toHaveLength(1);
    expect(writes).toEqual([2]);
  });

  it('flush resolves immediately when idle', async () => {
    const queue = new SaveQueue<number>(async () => {}, () => {});
    await expect(queue.flush()).resolves.toBeUndefined();
  });
});
```

`src/app/persistence.test.ts`:
```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { emptyState, serialize, type SaveState } from '../storage/schema';
import { SAVE_KEY, loadState, memoryBackend, type KeyValueBackend } from '../storage/store';
import { acquireWriterLock, installFlushOnHide, openPersistence, type LockLike, type PersistenceEnv } from './persistence';

const now = () => new Date('2026-10-13T12:00:00Z');
const env = (over: Partial<PersistenceEnv>): PersistenceEnv => ({
  createBackend: () => memoryBackend(),
  now,
  onSaveError: () => {},
  ...over,
});
const lockAvailable: LockLike = { request: (_n, _o, cb) => cb({}) };
const lockTaken: LockLike = { request: (_n, _o, cb) => cb(null) };
const withXp = (xp: number): SaveState => ({ ...emptyState(), profile: { xp, combo: 0, soundOn: true } });

describe('acquireWriterLock', () => {
  it('is granted without a lock API', async () => {
    expect(await acquireWriterLock(undefined)).toBe(true);
  });

  it('reports whether the lock was available', async () => {
    expect(await acquireWriterLock(lockAvailable)).toBe(true);
    expect(await acquireWriterLock(lockTaken)).toBe(false);
  });
});

describe('openPersistence', () => {
  it('loads the saved state and writes new states', async () => {
    const backend = memoryBackend({ [SAVE_KEY]: serialize(withXp(40)) });
    const p = await openPersistence(env({ createBackend: () => backend, locks: lockAvailable }));
    expect(p.initial.profile.xp).toBe(40);
    expect(p.info).toEqual({ mode: 'indexeddb', readOnly: false, otherTabActive: false, corruptBackup: null });
    p.save(withXp(55));
    await p.flush();
    expect((await loadState(backend, now())).state.profile.xp).toBe(55);
  });

  it('falls back to memory when the backend fails', async () => {
    const broken: KeyValueBackend = {
      get: () => Promise.reject(new Error('blockiert')),
      set: () => Promise.reject(new Error('blockiert')),
      keys: () => Promise.resolve([]),
      del: () => Promise.resolve(),
    };
    const p = await openPersistence(env({ createBackend: () => broken }));
    expect(p.info.mode).toBe('memory');
    expect(p.initial).toEqual(emptyState());
  });

  it('does not save when another tab holds the writer lock', async () => {
    const backend = memoryBackend();
    const p = await openPersistence(env({ createBackend: () => backend, locks: lockTaken }));
    expect(p.info.otherTabActive).toBe(true);
    p.save(withXp(99));
    await p.flush();
    expect(backend.dump()[SAVE_KEY]).toBeUndefined();
  });

  it('is read-only for saves from a newer version', async () => {
    const raw = JSON.stringify({ ...emptyState(), schemaVersion: 2 });
    const backend = memoryBackend({ [SAVE_KEY]: raw });
    const p = await openPersistence(env({ createBackend: () => backend, locks: lockAvailable }));
    expect(p.info.readOnly).toBe(true);
    p.save(withXp(1));
    await p.flush();
    expect(backend.dump()[SAVE_KEY]).toBe(raw);
  });

  it('passes on a corrupt backup', async () => {
    const backend = memoryBackend({ [SAVE_KEY]: '{kaputt' });
    const p = await openPersistence(env({ createBackend: () => backend, locks: lockAvailable }));
    expect(p.info.corruptBackup?.raw).toBe('{kaputt');
  });

  it('asks the browser to persist storage', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    await openPersistence(env({ storage: { persist } }));
    expect(persist).toHaveBeenCalledOnce();
  });
});

describe('installFlushOnHide', () => {
  it('flushes on pagehide and when the page becomes hidden', () => {
    const flush = vi.fn(() => Promise.resolve());
    const remove = installFlushOnHide({ flush }, document, window);
    window.dispatchEvent(new Event('pagehide'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(flush).toHaveBeenCalledTimes(2);
    remove();
    window.dispatchEvent(new Event('pagehide'));
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run src/app/save-queue.test.ts src/app/persistence.test.ts` → Expected: FAIL, Module nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/app/save-queue.ts`:
```ts
export class SaveQueue<T> {
  private pending: { value: T } | null = null;
  private running: Promise<void> | null = null;

  constructor(
    private readonly write: (value: T) => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}

  schedule(value: T): void {
    this.pending = { value };
    if (!this.running) this.running = this.drain();
  }

  async flush(): Promise<void> {
    while (this.running) await this.running;
  }

  private async drain(): Promise<void> {
    try {
      while (this.pending) {
        const { value } = this.pending;
        this.pending = null;
        try {
          await this.write(value);
        } catch (error) {
          this.onError(error);
        }
      }
    } finally {
      this.running = null;
    }
  }
}
```

`src/app/persistence.ts`:
```ts
import type { SaveState } from '../storage/schema';
import { type KeyValueBackend, type LoadResult, indexedDbBackend, loadState, memoryBackend, saveState } from '../storage/store';
import { SaveQueue } from './save-queue';

export const WRITER_LOCK = 'poker-trainer-writer';

export type LockLike = {
  request(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<void>): Promise<unknown>;
};
export type StorageMode = 'indexeddb' | 'memory';
export type PersistenceInfo = {
  mode: StorageMode;
  readOnly: boolean;
  otherTabActive: boolean;
  corruptBackup: { key: string; raw: string } | null;
};
export type Persistence = {
  initial: SaveState;
  info: PersistenceInfo;
  save(state: SaveState): void;
  flush(): Promise<void>;
};
export type PersistenceEnv = {
  createBackend: () => KeyValueBackend;
  locks?: LockLike;
  storage?: { persist?: () => Promise<boolean> };
  now: () => Date;
  onSaveError: (error: unknown) => void;
};

export function acquireWriterLock(locks?: LockLike): Promise<boolean> {
  if (!locks) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    locks
      .request(WRITER_LOCK, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return Promise.resolve();
        }
        resolve(true);
        // Keep the lock until the tab closes.
        return new Promise<void>(() => {});
      })
      .catch(() => resolve(true));
  });
}

async function loadWithFallback(env: PersistenceEnv): Promise<{ backend: KeyValueBackend; mode: StorageMode; loaded: LoadResult }> {
  try {
    const backend = env.createBackend();
    return { backend, mode: 'indexeddb', loaded: await loadState(backend, env.now()) };
  } catch {
    const backend = memoryBackend();
    return { backend, mode: 'memory', loaded: await loadState(backend, env.now()) };
  }
}

export async function openPersistence(env: PersistenceEnv): Promise<Persistence> {
  const { backend, mode, loaded } = await loadWithFallback(env);
  const hasLock = mode === 'memory' ? true : await acquireWriterLock(env.locks);
  try {
    await env.storage?.persist?.();
  } catch {
    // Persistence is a best-effort request; the app works without it.
  }
  const writable = !loaded.readOnly && hasLock;
  const queue = new SaveQueue<SaveState>((state) => saveState(backend, state, { readOnly: !writable }), env.onSaveError);
  return {
    initial: loaded.state,
    info: { mode, readOnly: loaded.readOnly, otherTabActive: !hasLock, corruptBackup: loaded.corruptBackup },
    save: (state) => {
      if (writable) queue.schedule(state);
    },
    flush: () => queue.flush(),
  };
}

export function browserEnv(onSaveError: (error: unknown) => void): PersistenceEnv {
  return {
    createBackend: () => indexedDbBackend(),
    locks: (navigator as Navigator & { locks?: LockLike }).locks,
    storage: navigator.storage,
    now: () => new Date(),
    onSaveError,
  };
}

export function installFlushOnHide(persistence: Pick<Persistence, 'flush'>, doc: Document, win: Window): () => void {
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') void persistence.flush();
  };
  const onPageHide = () => {
    void persistence.flush();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', onPageHide);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', onPageHide);
  };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/app` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/save-queue.ts src/app/save-queue.test.ts src/app/persistence.ts src/app/persistence.test.ts
git commit -m "feat(app): Speicher-Warteschlange, Writer-Lock und Persistenz mit Rückfall auf Arbeitsspeicher"
```

---

### Task 4: Spiel-Store

**Files:**
- Create: `src/app/game-store.ts`
- Test: `src/app/game-store.test.ts`

**Interfaces:**
- Consumes: `dealConcrete`, `Card`; `comparePositions`, `PositionComparison`; `chart`, `Action`, `ChartCell`, `Spot`; `PushFoldData`; `Rng`; `recordDecision`, `nextTrainingSpot`, `setSound`, `statusOf`, `DecisionOutcome`, `SessionStatus`; `SaveState`; `Persistence`, `PersistenceInfo`
- Produces:
  - `type TrainingSpot = { spot: Spot; cards: readonly [Card, Card]; shownAt: number }`
  - `type AnswerResult = { outcome: DecisionOutcome; comparison: PositionComparison; chart: ChartCell[] }`
  - `type GameSnapshot = { save: SaveState; status: SessionStatus; info: PersistenceInfo; current: TrainingSpot | null; last: AnswerResult | null; saveError: string | null }`
  - `type GameStoreDeps = { data: PushFoldData; persistence: Pick<Persistence, 'initial' | 'info' | 'save'>; rng: Rng; now: () => Date; clock: () => number }`
  - `type GameStore = { getSnapshot(): GameSnapshot; subscribe(listener: () => void): () => void; nextTrainingSpot(): void; answer(action: Action): AnswerResult; setSound(on: boolean): void; reportSaveError(error: unknown): void; refreshStatus(): void }`
  - `createGameStore(deps: GameStoreDeps): GameStore` — jeder neue `SaveState` geht sofort an `persistence.save`; `getSnapshot` liefert dasselbe Objekt, bis sich etwas ändert (Voraussetzung für `useSyncExternalStore`)

- [ ] **Step 1: Failing Test schreiben**

`src/app/game-store.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { handClassOf } from '../engine/cards';
import { mulberry32 } from '../engine/rng';
import { makeFixture } from '../engine/test-fixtures';
import { emptyState } from '../storage/schema';
import { createGameStore, type GameStoreDeps } from './game-store';
import type { PersistenceInfo } from './persistence';

const info: PersistenceInfo = { mode: 'memory', readOnly: false, otherTabActive: false, corruptBackup: null };

function setup(over: Partial<PersistenceInfo> = {}) {
  let t = 1000;
  const save = vi.fn();
  const deps: GameStoreDeps = {
    data: makeFixture((h) => (84 - h) / 10),
    persistence: { initial: emptyState(), info: { ...info, ...over }, save },
    rng: mulberry32(1),
    now: () => new Date(2026, 9, 13, 18, 0),
    clock: () => t,
  };
  return { store: createGameStore(deps), save, advance: (ms: number) => (t += ms) };
}

describe('createGameStore', () => {
  it('starts with the saved state and no spot', () => {
    const { store } = setup();
    const s = store.getSnapshot();
    expect(s.status.rank.name).toBe('Fish');
    expect(s.current).toBeNull();
    expect(s.last).toBeNull();
    expect(store.getSnapshot()).toBe(s);
  });

  it('deals a training spot with matching concrete cards', () => {
    const { store } = setup();
    store.nextTrainingSpot();
    const cur = store.getSnapshot().current!;
    expect(handClassOf(cur.cards[0], cur.cards[1])).toBe(cur.spot.hand);
    expect(cur.shownAt).toBe(1000);
  });

  it('records an answer, saves it and notifies listeners', () => {
    const { store, save, advance } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    store.nextTrainingSpot();
    advance(1200);
    const result = store.answer('fold');
    expect(result.outcome.record.responseMs).toBe(1200);
    expect(result.chart).toHaveLength(169);
    expect(result.comparison.entries.length).toBeGreaterThan(0);
    expect(save).toHaveBeenCalledWith(result.outcome.state);
    expect(store.getSnapshot().save).toBe(result.outcome.state);
    expect(store.getSnapshot().last).toBe(result);
    expect(store.getSnapshot().status.dayProgress.count).toBe(1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('refuses double answers and answers without a spot', () => {
    const { store } = setup();
    expect(() => store.answer('fold')).toThrow();
    store.nextTrainingSpot();
    store.answer('fold');
    expect(() => store.answer('fold')).toThrow();
    store.nextTrainingSpot();
    expect(store.getSnapshot().last).toBeNull();
  });

  it('blocks training in read-only mode', () => {
    const { store } = setup({ readOnly: true });
    expect(() => store.nextTrainingSpot()).toThrow();
  });

  it('saves the sound setting and records save errors', () => {
    const { store, save } = setup();
    store.setSound(false);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ profile: expect.objectContaining({ soundOn: false }) }));
    store.reportSaveError(new Error('Speicher voll'));
    expect(store.getSnapshot().saveError).toBe('Speicher voll');
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/app/game-store.test.ts` → Expected: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/app/game-store.ts`:
```ts
import { type Card, dealConcrete } from '../engine/cards';
import { type PositionComparison, comparePositions } from '../engine/position-compare';
import { type Action, type ChartCell, type Spot, chart } from '../engine/pushfold';
import type { PushFoldData } from '../engine/pushfold-data';
import type { Rng } from '../engine/rng';
import {
  type DecisionOutcome,
  type SessionStatus,
  nextTrainingSpot,
  recordDecision,
  setSound,
  statusOf,
} from '../game/session';
import type { SaveState } from '../storage/schema';
import type { Persistence, PersistenceInfo } from './persistence';

export type TrainingSpot = { spot: Spot; cards: readonly [Card, Card]; shownAt: number };
export type AnswerResult = { outcome: DecisionOutcome; comparison: PositionComparison; chart: ChartCell[] };
export type GameSnapshot = {
  save: SaveState;
  status: SessionStatus;
  info: PersistenceInfo;
  current: TrainingSpot | null;
  last: AnswerResult | null;
  saveError: string | null;
};
export type GameStoreDeps = {
  data: PushFoldData;
  persistence: Pick<Persistence, 'initial' | 'info' | 'save'>;
  rng: Rng;
  now: () => Date;
  clock: () => number;
};
export type GameStore = {
  getSnapshot(): GameSnapshot;
  subscribe(listener: () => void): () => void;
  nextTrainingSpot(): void;
  answer(action: Action): AnswerResult;
  setSound(on: boolean): void;
  reportSaveError(error: unknown): void;
  refreshStatus(): void;
};

export function createGameStore(deps: GameStoreDeps): GameStore {
  const { data, persistence, rng, now, clock } = deps;
  let snapshot: GameSnapshot = {
    save: persistence.initial,
    status: statusOf(persistence.initial, now()),
    info: persistence.info,
    current: null,
    last: null,
    saveError: null,
  };
  const listeners = new Set<() => void>();

  const update = (patch: Partial<GameSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const commit = (save: SaveState, patch: Partial<GameSnapshot> = {}) => {
    persistence.save(save);
    update({ ...patch, save, status: statusOf(save, now()) });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    nextTrainingSpot() {
      if (snapshot.info.readOnly) throw new Error('Training ist im Nur-Lesen-Modus nicht möglich');
      const spot = nextTrainingSpot(data, snapshot.save, rng);
      update({ current: { spot, cards: dealConcrete(spot.hand, rng), shownAt: clock() }, last: null });
    },
    answer(action) {
      const current = snapshot.current;
      if (!current) throw new Error('Kein Spot aktiv');
      if (snapshot.last) throw new Error('Dieser Spot ist bereits beantwortet');
      const outcome = recordDecision(data, snapshot.save, {
        spot: current.spot,
        chosen: action,
        responseMs: clock() - current.shownAt,
        mode: 'training',
        now: now(),
      });
      const result: AnswerResult = {
        outcome,
        comparison: comparePositions(data, current.spot),
        chart: chart(data, current.spot),
      };
      commit(outcome.state, { last: result });
      return result;
    },
    setSound(on) {
      commit(setSound(snapshot.save, on));
    },
    reportSaveError(error) {
      update({ saveError: error instanceof Error ? error.message : String(error) });
    },
    refreshStatus() {
      update({ status: statusOf(snapshot.save, now()) });
    },
  };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/app/game-store.test.ts` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/game-store.ts src/app/game-store.test.ts
git commit -m "feat(app): Spiel-Store mit Training, Speicherung und Abonnement"
```

---

### Task 5: React-Kontext, Tisch-Modell, Karte und Tisch

**Files:**
- Create: `src/ui/GameContext.tsx`, `src/ui/table-model.ts`, `src/ui/components/PlayingCard.tsx`, `src/ui/components/PlayingCard.css`, `src/ui/components/PokerTable.tsx`, `src/ui/components/PokerTable.css`
- Test: `src/ui/table-model.test.ts`, `src/ui/components/PokerTable.test.tsx`

**Interfaces:**
- Consumes: `GameStore`, `GameSnapshot`; `POSITIONS`, `POSITION_LABELS`, `seatOf`, `blindOf`, `ANTE`, `DEAD_MONEY`, `Position`; `Spot`; `Card`, `RANKS`, `rankOf`, `suitOf`
- Produces:
  - `GameProvider({ store, children })`, `useGameStore(): GameStore`, `useGame(): GameSnapshot`
  - `type SeatRole = 'hero' | 'shover' | 'folded' | 'waiting'`
  - `type SeatModel = { position: Position; label: string; role: SeatRole; offset: number; isButton: boolean; betBb: number; anteBb: number }` — `offset` = Plätze im Uhrzeigersinn ab dem Helden (Held = 0)
  - `type TableModel = { seats: SeatModel[]; playersBehind: number; potBb: number; heroStackBb: number }`
  - `tableModel(spot: Spot): TableModel`
  - `cardLabel(card: Card): string` (z. B. „Herz Ass“, „Pik Zehn“), `PlayingCard({ card, delayMs? })`
  - `PokerTable({ spot, cards })` mit der Infozeile „Du sitzt im <Pos> · <Stack> BB · <Hinweis>“; Hinweis: „noch N Spieler hinter dir“, bei 1 „noch 1 Spieler hinter dir“, bei 0 „du handelst als Letzter“

- [ ] **Step 1: Failing Tests schreiben**

`src/ui/table-model.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseHand } from '../engine/cards';
import { tableModel } from './table-model';

const hand = parseHand('A7o');

describe('tableModel', () => {
  it('models an open-shove spot', () => {
    const m = tableModel({ kind: 'open', position: 'CO', stack: 12, hand });
    expect(m.seats.map((s) => s.role)).toEqual(['folded', 'folded', 'folded', 'folded', 'hero', 'waiting', 'waiting', 'waiting']);
    expect(m.playersBehind).toBe(3);
    expect(m.potBb).toBe(2.5);
    expect(m.heroStackBb).toBe(12);
    const bb = m.seats[7];
    expect(bb).toMatchObject({ position: 'BB', betBb: 1, anteBb: 1, offset: 3 });
    expect(m.seats[6]).toMatchObject({ position: 'SB', betBb: 0.5, anteBb: 0 });
    expect(m.seats.filter((s) => s.isButton).map((s) => s.position)).toEqual(['BTN']);
    expect(m.seats[4].offset).toBe(0);
    expect(m.seats[1].label).toBe('UTG+1');
  });

  it('models a call spot', () => {
    const m = tableModel({ kind: 'call', shover: 'BTN', position: 'BB', stack: 12, hand });
    expect(m.seats.map((s) => s.role)).toEqual(['folded', 'folded', 'folded', 'folded', 'folded', 'shover', 'folded', 'hero']);
    expect(m.seats[5].betBb).toBe(12);
    expect(m.playersBehind).toBe(0);
    expect(m.potBb).toBe(14.5);
    expect(m.seats[0].offset).toBe(1);
  });
});
```

`src/ui/components/PokerTable.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseCard, parseHand } from '../../engine/cards';
import { PokerTable } from './PokerTable';

const cards = [parseCard('Ah'), parseCard('7c')] as const;

describe('PokerTable', () => {
  it('shows all seats, the hero cards and the info line for an open spot', () => {
    render(<PokerTable spot={{ kind: 'open', position: 'CO', stack: 12, hand: parseHand('A7o') }} cards={cards} />);
    expect(screen.getByText('Du sitzt im CO · 12 BB · noch 3 Spieler hinter dir')).toBeTruthy();
    expect(screen.getByText('Alle folden zu dir')).toBeTruthy();
    expect(screen.getByTestId('seat-UTG').className).toContain('seat--folded');
    expect(screen.getByTestId('seat-CO').className).toContain('seat--hero');
    expect(screen.getByTestId('seat-BB').textContent).toContain('Ante 1');
    expect(screen.getByLabelText('Dealer-Button')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Herz Ass' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Kreuz 7' })).toBeTruthy();
    expect(screen.getByText('Pot 2,5 BB')).toBeTruthy();
  });

  it('marks the shover in a call spot', () => {
    render(<PokerTable spot={{ kind: 'call', shover: 'BTN', position: 'BB', stack: 12, hand: parseHand('A7o') }} cards={cards} />);
    expect(screen.getByText('BTN geht All-in')).toBeTruthy();
    expect(screen.getByTestId('seat-BTN').textContent).toContain('All-in 12 BB');
    expect(screen.getByText('Du sitzt im BB · 12 BB · du handelst als Letzter')).toBeTruthy();
    expect(screen.getByText('Pot 14,5 BB')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run src/ui` → Expected: FAIL, Module nicht gefunden.

- [ ] **Step 3: Kontext und Tisch-Modell implementieren**

`src/ui/GameContext.tsx`:
```tsx
import { type ReactNode, createContext, useContext, useSyncExternalStore } from 'react';
import type { GameSnapshot, GameStore } from '../app/game-store';

const GameStoreContext = createContext<GameStore | null>(null);

export function GameProvider({ store, children }: { store: GameStore; children: ReactNode }) {
  return <GameStoreContext.Provider value={store}>{children}</GameStoreContext.Provider>;
}

export function useGameStore(): GameStore {
  const store = useContext(GameStoreContext);
  if (!store) throw new Error('GameProvider fehlt');
  return store;
}

export function useGame(): GameSnapshot {
  const store = useGameStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
```

`src/ui/table-model.ts`:
```ts
import { ANTE, DEAD_MONEY, POSITIONS, POSITION_LABELS, type Position, blindOf, seatOf } from '../engine/positions';
import type { Spot } from '../engine/pushfold';

export type SeatRole = 'hero' | 'shover' | 'folded' | 'waiting';
export type SeatModel = {
  position: Position;
  label: string;
  role: SeatRole;
  offset: number;
  isButton: boolean;
  betBb: number;
  anteBb: number;
};
export type TableModel = { seats: SeatModel[]; playersBehind: number; potBb: number; heroStackBb: number };

const BTN_SEAT = seatOf('BTN');
const BB_SEAT = seatOf('BB');

export function tableModel(spot: Spot): TableModel {
  const heroSeat = seatOf(spot.position);
  const shoverSeat = spot.kind === 'call' ? seatOf(spot.shover) : -1;
  const seats = POSITIONS.map((position, seat): SeatModel => {
    const role: SeatRole =
      seat === heroSeat ? 'hero' : seat === shoverSeat ? 'shover' : seat < heroSeat ? 'folded' : 'waiting';
    return {
      position,
      label: POSITION_LABELS[position],
      role,
      offset: (seat - heroSeat + POSITIONS.length) % POSITIONS.length,
      isButton: seat === BTN_SEAT,
      betBb: role === 'shover' ? spot.stack : blindOf(seat),
      anteBb: seat === BB_SEAT ? ANTE : 0,
    };
  });
  const potBb = DEAD_MONEY + (shoverSeat >= 0 ? spot.stack - blindOf(shoverSeat) : 0);
  return {
    seats,
    playersBehind: seats.filter((s) => s.role === 'waiting').length,
    potBb,
    heroStackBb: spot.stack,
  };
}
```

- [ ] **Step 4: Karte und Tisch implementieren**

`src/ui/components/PlayingCard.tsx`:
```tsx
import { type Card, RANKS, rankOf, suitOf } from '../../engine/cards';
import './PlayingCard.css';

const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
const SUIT_NAMES = ['Kreuz', 'Karo', 'Herz', 'Pik'];
const RANK_NAMES: Record<string, string> = { A: 'Ass', K: 'König', Q: 'Dame', J: 'Bube', T: 'Zehn' };

export function cardLabel(card: Card): string {
  const rank = RANKS[rankOf(card)];
  return `${SUIT_NAMES[suitOf(card)]} ${RANK_NAMES[rank] ?? rank}`;
}

export function PlayingCard({ card, delayMs = 0 }: { card: Card; delayMs?: number }) {
  const rank = RANKS[rankOf(card)];
  const suit = suitOf(card);
  const red = suit === 1 || suit === 2;
  return (
    <div
      className={`playing-card${red ? ' playing-card--red' : ''}`}
      role="img"
      aria-label={cardLabel(card)}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className="playing-card__rank">{rank === 'T' ? '10' : rank}</span>
      <span className="playing-card__suit">{SUIT_SYMBOLS[suit]}</span>
    </div>
  );
}
```

`src/ui/components/PlayingCard.css`:
```css
.playing-card {
  width: 54px;
  height: 76px;
  border-radius: 7px;
  background: #ffffff;
  color: var(--card-black);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  animation: card-deal 320ms ease-out both;
}

.playing-card--red {
  color: var(--card-red);
}

.playing-card__rank {
  font-size: 22px;
  line-height: 1;
}

.playing-card__suit {
  font-size: 20px;
  line-height: 1;
}

@keyframes card-deal {
  from {
    opacity: 0;
    transform: translateY(-24px) rotateY(90deg);
  }
  to {
    opacity: 1;
    transform: translateY(0) rotateY(0deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .playing-card {
    animation: none;
  }
}
```

`src/ui/components/PokerTable.tsx`:
```tsx
import type { CSSProperties } from 'react';
import type { Card } from '../../engine/cards';
import { POSITION_LABELS } from '../../engine/positions';
import type { Spot } from '../../engine/pushfold';
import { tableModel } from '../table-model';
import { PlayingCard } from './PlayingCard';
import './PokerTable.css';

const bb = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

function seatStyle(offset: number): CSSProperties {
  const angle = ((90 + offset * 45) * Math.PI) / 180;
  return { left: `${50 + 44 * Math.cos(angle)}%`, top: `${50 + 41 * Math.sin(angle)}%` };
}

function behindText(n: number): string {
  if (n === 0) return 'du handelst als Letzter';
  if (n === 1) return 'noch 1 Spieler hinter dir';
  return `noch ${n} Spieler hinter dir`;
}

export function PokerTable({ spot, cards }: { spot: Spot; cards: readonly [Card, Card] }) {
  const model = tableModel(spot);
  const situation = spot.kind === 'open' ? 'Alle folden zu dir' : `${POSITION_LABELS[spot.shover]} geht All-in`;
  return (
    <section className="poker-table" aria-label="Pokertisch">
      <div className="poker-table__stage">
        <div className="poker-table__felt">
          <div className="poker-table__pot">Pot {bb.format(model.potBb)} BB</div>
          <div className="poker-table__situation">{situation}</div>
          <div className="poker-table__cards">
            {cards.map((card, i) => (
              <PlayingCard key={`${card}-${i}`} card={card} delayMs={i * 120} />
            ))}
          </div>
        </div>
        {model.seats.map((seat) => (
          <div
            key={seat.position}
            className={`seat seat--${seat.role}`}
            style={seatStyle(seat.offset)}
            data-testid={`seat-${seat.position}`}
          >
            <span className="seat__label">{seat.label}</span>
            {seat.role === 'shover' && <span className="seat__allin">All-in {bb.format(seat.betBb)} BB</span>}
            {seat.role !== 'shover' && seat.betBb > 0 && <span className="seat__bet">{bb.format(seat.betBb)} BB</span>}
            {seat.anteBb > 0 && <span className="seat__ante">Ante {bb.format(seat.anteBb)}</span>}
            {seat.isButton && (
              <span className="seat__button" aria-label="Dealer-Button">
                D
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="poker-table__info">
        Du sitzt im {POSITION_LABELS[spot.position]} · {spot.stack} BB · {behindText(model.playersBehind)}
      </p>
    </section>
  );
}
```

`src/ui/components/PokerTable.css`:
```css
.poker-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.poker-table__stage {
  position: relative;
  width: 100%;
  aspect-ratio: 1.35;
}

.poker-table__felt {
  position: absolute;
  inset: 14% 10%;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, var(--felt-light) 0%, var(--felt) 70%);
  border: 4px solid var(--gold);
  box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.35), 0 6px 18px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  text-align: center;
}

.poker-table__pot {
  font-size: 13px;
  color: var(--gold);
  font-weight: 600;
}

.poker-table__situation {
  font-size: 13px;
  color: var(--cream-muted);
}

.poker-table__cards {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.seat {
  position: absolute;
  transform: translate(-50%, -50%);
  min-width: 58px;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--felt-dark);
  border: 1px solid rgba(243, 233, 198, 0.25);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  font-size: 12px;
  line-height: 1.25;
}

.seat__label {
  font-weight: 700;
  font-size: 13px;
}

.seat__bet,
.seat__ante {
  color: var(--cream-muted);
}

.seat__allin {
  color: var(--gold-ink);
  background: var(--gold);
  border-radius: 4px;
  padding: 0 4px;
  font-weight: 700;
}

.seat__button {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffffff;
  color: var(--card-black);
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.seat--hero {
  border: 2px solid var(--gold);
  background: var(--felt-light);
}

.seat--shover {
  border-color: var(--gold);
}

.seat--folded {
  opacity: 0.4;
}

.poker-table__info {
  margin: 0;
  text-align: center;
  font-size: 14px;
  color: var(--cream);
}

@media (max-width: 400px) {
  .seat {
    min-width: 48px;
    padding: 3px 5px;
    font-size: 11px;
  }

  .playing-card {
    width: 46px;
    height: 64px;
  }
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run src/ui` → Expected: alle PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/GameContext.tsx src/ui/table-model.ts src/ui/table-model.test.ts src/ui/components
git commit -m "feat(ui): Tisch mit 8 beschrifteten Plätzen, Karten und React-Kontext"
```

---

### Task 6: Statusleiste und Aktions-Buttons mit Tastatur

**Files:**
- Create: `src/ui/components/StatusBar.tsx`, `src/ui/components/StatusBar.css`, `src/ui/components/ActionBar.tsx`, `src/ui/components/ActionBar.css`
- Test: `src/ui/components/StatusBar.test.tsx`, `src/ui/components/ActionBar.test.tsx`

**Interfaces:**
- Consumes: `SessionStatus`, `statusOf`; `Action`; `SpotKind`
- Produces:
  - `StatusBar({ status, xp }: { status: SessionStatus; xp: number })` — Rang, Streak („Streak 1 Tag“ / „Streak N Tage“), XP-Balken (`role="progressbar"`, Name „Fortschritt zum nächsten Rang“, `aria-valuenow` = Prozent), „<n> XP bis <nächster Rang>“ bzw. „Höchster Rang erreicht“, „Heute <count>/<target>“
  - `ActionBar({ kind, answered, onAction, onNext, disabled? })` — vor der Antwort: Buttons „Fold“ und „All-in“ (open) bzw. „Call“ (call); danach: Button „Weiter“. Tastatur: `F`, `A`, Leertaste/Enter wie in den Global Constraints; ignoriert Tasten in Eingabefeldern, mit Strg/Alt/Meta und Wiederholungen; Leertaste/Enter auf einem fokussierten Button löst nur den Klick aus (kein doppeltes Weiter)

- [ ] **Step 1: Failing Tests schreiben**

`src/ui/components/StatusBar.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { statusOf } from '../../game/session';
import { emptyState } from '../../storage/schema';
import { StatusBar } from './StatusBar';

const now = new Date(2026, 9, 13, 12, 0);

describe('StatusBar', () => {
  it('shows rank, XP progress, streak and today\'s count', () => {
    const state = { ...emptyState(), profile: { xp: 1250, combo: 0, soundOn: true }, days: { '2026-10-12': 20, '2026-10-13': 7 } };
    render(<StatusBar status={statusOf(state, now)} xp={1250} />);
    expect(screen.getByText('Donkey')).toBeTruthy();
    expect(screen.getByText('750 XP bis Grinder')).toBeTruthy();
    expect(screen.getByText('Streak 1 Tag')).toBeTruthy();
    expect(screen.getByText('Heute 7/20')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Fortschritt zum nächsten Rang' }).getAttribute('aria-valuenow')).toBe('50');
  });

  it('handles the top rank', () => {
    const state = { ...emptyState(), profile: { xp: 50000, combo: 0, soundOn: true } };
    render(<StatusBar status={statusOf(state, now)} xp={50000} />);
    expect(screen.getByText('Höchster Rang erreicht')).toBeTruthy();
    expect(screen.getByText('Streak 0 Tage')).toBeTruthy();
  });
});
```

`src/ui/components/ActionBar.test.tsx`:
```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar } from './ActionBar';

describe('ActionBar', () => {
  it('offers fold and all-in for open spots, by click and keyboard', () => {
    const onAction = vi.fn();
    render(<ActionBar kind="open" answered={false} onAction={onAction} onNext={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Fold/ }));
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'F' });
    expect(onAction.mock.calls).toEqual([['fold'], ['shove'], ['fold']]);
    expect(screen.getByRole('button', { name: /All-in/ })).toBeTruthy();
  });

  it('offers call for call spots', () => {
    const onAction = vi.fn();
    render(<ActionBar kind="call" answered={false} onAction={onAction} onNext={() => {}} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(onAction).toHaveBeenCalledWith('call');
    expect(screen.getByRole('button', { name: /Call/ })).toBeTruthy();
  });

  it('shows "Weiter" after the answer and reacts to space and enter', () => {
    const onNext = vi.fn();
    const onAction = vi.fn();
    render(<ActionBar kind="open" answered onAction={onAction} onNext={onNext} />);
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'f' });
    expect(onNext).toHaveBeenCalledTimes(2);
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(onNext).toHaveBeenCalledTimes(3);
  });

  it('ignores keys while typing, with modifiers, on repeats and on focused buttons', () => {
    const onAction = vi.fn();
    const onNext = vi.fn();
    const { rerender } = render(
      <>
        <input aria-label="Notiz" />
        <ActionBar kind="open" answered={false} onAction={onAction} onNext={onNext} />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('Notiz'), { key: 'f' });
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'a', repeat: true });
    expect(onAction).not.toHaveBeenCalled();
    rerender(<ActionBar kind="open" answered onAction={onAction} onNext={onNext} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /Weiter/ }), { key: 'Enter' });
    expect(onNext).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run src/ui/components/StatusBar.test.tsx src/ui/components/ActionBar.test.tsx` → Expected: FAIL, Module nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/ui/components/StatusBar.tsx`:
```tsx
import type { SessionStatus } from '../../game/session';
import './StatusBar.css';

const xpFormat = new Intl.NumberFormat('de-DE');

export function StatusBar({ status, xp }: { status: SessionStatus; xp: number }) {
  const { rank, streak, dayProgress } = status;
  const percent = Math.round(rank.progress * 100);
  return (
    <header className="status-bar panel">
      <div className="status-bar__row">
        <span className="status-bar__rank">{rank.name}</span>
        <span className="status-bar__streak" title="Tage in Folge mit mindestens 20 Spots">
          Streak {streak} {streak === 1 ? 'Tag' : 'Tage'}
        </span>
      </div>
      <div
        className="xp-bar"
        role="progressbar"
        aria-label="Fortschritt zum nächsten Rang"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="xp-bar__fill" style={{ width: `${percent}%` }} />
      </div>
      <div className="status-bar__row status-bar__meta">
        <span>{rank.next ? `${xpFormat.format(rank.next.minXp - xp)} XP bis ${rank.next.name}` : 'Höchster Rang erreicht'}</span>
        <span>
          Heute {dayProgress.count}/{dayProgress.target}
        </span>
      </div>
    </header>
  );
}
```

`src/ui/components/StatusBar.css`:
```css
.status-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
}

.status-bar__row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.status-bar__rank {
  font-size: 18px;
  font-weight: 700;
  color: var(--gold);
}

.status-bar__streak {
  font-weight: 600;
  color: var(--gold);
}

.status-bar__meta {
  font-size: 13px;
  color: var(--cream-muted);
}

.xp-bar {
  height: 8px;
  border-radius: 4px;
  background: var(--felt-dark);
  overflow: hidden;
}

.xp-bar__fill {
  height: 100%;
  background: var(--gold);
  border-radius: 4px;
  transition: width 400ms ease;
}
```

`src/ui/components/ActionBar.tsx`:
```tsx
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
```

`src/ui/components/ActionBar.css`:
```css
.action-bar {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.action-bar .btn {
  min-height: 56px;
  font-size: 18px;
}

.action-bar__wide {
  grid-column: 1 / -1;
}

.action-bar kbd {
  font: inherit;
  font-size: 11px;
  font-weight: 500;
  opacity: 0.7;
  margin-left: 6px;
  padding: 1px 5px;
  border: 1px solid currentColor;
  border-radius: 4px;
}

@media (hover: none) {
  .action-bar kbd {
    display: none;
  }
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/ui/components` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/StatusBar.tsx src/ui/components/StatusBar.css src/ui/components/StatusBar.test.tsx src/ui/components/ActionBar.tsx src/ui/components/ActionBar.css src/ui/components/ActionBar.test.tsx
git commit -m "feat(ui): Statusleiste und Aktions-Buttons mit Tastatursteuerung"
```

---

### Task 7: Feedback mit Range-Chart und Positions-Vergleich

**Files:**
- Create: `src/ui/components/chart-cells.ts`, `src/ui/components/RangeChart.tsx`, `src/ui/components/PositionRow.tsx`, `src/ui/components/FeedbackPanel.tsx`, `src/ui/components/Feedback.css`
- Test: `src/ui/components/FeedbackPanel.test.tsx`

**Interfaces:**
- Consumes: `AnswerResult`; `ChartCell`, `Spot`; `HandClass`, `handName`; `POSITION_LABELS`; `PositionComparison`; `actionLabel`, `aggressiveWord`, `evLine`, `formatEv`, `verdictLabel`
- Produces:
  - `CELL_CLASS: Record<ChartCell, string>` (`cell--aggressive`, `cell--fold`, `cell--close-aggressive`, `cell--close-fold`), `cellText(cell: ChartCell, word: 'Push' | 'Call'): string` → „Push“/„Call“, „Fold“, „knapp Push“/„knapp Call“, „knapp Fold“
  - `RangeChart({ cells, heroHand, word })` — 169 Zellen mit Handnamen, `title` = „<Hand>: <cellText>“, eigene Hand mit Klasse `range-chart__cell--hero` und `aria-current="true"`, Legende mit vier Einträgen
  - `PositionRow({ comparison, word })` — eine Zelle je Position (`title` = „<Pos>: <cellText> (<EV>)“, Held hervorgehoben) und darunter `comparison.summary`
  - `FeedbackPanel({ result, spot })` — Überschrift `verdictLabel`, „Deine Wahl: <Aktion>“ plus bei Fehler „ · Besser: <Aktion>“, `evLine`, XP-Zeile („+15 XP“, bei Multiplikator „ · Combo ×1,5“, ab Combo 2 „ · <n> in Folge“), bei Rangaufstieg „Aufgestiegen: <Rang>!“, Überschrift „<Hand> bei <Stack> BB – Range für diesen Spot“, Range-Chart, Überschrift „Dieselbe Hand auf anderen Positionen“, Positions-Zeile

- [ ] **Step 1: Failing Test schreiben**

`src/ui/components/FeedbackPanel.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AnswerResult } from '../../app/game-store';
import { parseHand } from '../../engine/cards';
import { comparePositions } from '../../engine/position-compare';
import { seatOf } from '../../engine/positions';
import { type Action, type Spot, chart } from '../../engine/pushfold';
import { makeFixture } from '../../engine/test-fixtures';
import { recordDecision } from '../../game/session';
import { emptyState, type SaveState } from '../../storage/schema';
import { FeedbackPanel } from './FeedbackPanel';

const data = makeFixture((_, s) => (s.kind === 'open' ? seatOf(s.position) - 3.5 : seatOf(s.position) - 6.5));
const a7oOnCo: Spot = { kind: 'open', position: 'CO', stack: 12, hand: parseHand('A7o') };

function answer(spot: Spot, chosen: Action, state: SaveState = emptyState()): AnswerResult {
  const outcome = recordDecision(data, state, { spot, chosen, responseMs: 1500, mode: 'training', now: new Date(2026, 9, 13) });
  return { outcome, comparison: comparePositions(data, spot), chart: chart(data, spot) };
}

describe('FeedbackPanel', () => {
  it('explains a correct decision with EVs, XP, chart and position comparison', () => {
    render(<FeedbackPanel result={answer(a7oOnCo, 'shove')} spot={a7oOnCo} />);
    expect(screen.getByRole('heading', { name: 'Richtig' })).toBeTruthy();
    expect(screen.getByText('Deine Wahl: All-in')).toBeTruthy();
    expect(screen.getByText('All-in +0,50 BB · Fold 0 BB')).toBeTruthy();
    expect(screen.getByText('+15 XP')).toBeTruthy();
    expect(screen.getByText('A7o bei 12 BB – Range für diesen Spot')).toBeTruthy();
    expect(screen.getByTitle('A7o: Push').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTitle('UTG: Fold (−3,50 BB)')).toBeTruthy();
    expect(screen.getByText('A7o bei 12 BB: Fold aus UTG bis HJ, Push ab CO')).toBeTruthy();
  });

  it('shows the better action after a mistake', () => {
    render(<FeedbackPanel result={answer(a7oOnCo, 'fold')} spot={a7oOnCo} />);
    expect(screen.getByRole('heading', { name: 'Falsch' })).toBeTruthy();
    expect(screen.getByText('Deine Wahl: Fold · Besser: All-in')).toBeTruthy();
    expect(screen.getByText('0 XP')).toBeTruthy();
  });

  it('shows combo and rank-up', () => {
    const state: SaveState = { ...emptyState(), profile: { xp: 490, combo: 4, soundOn: true } };
    render(<FeedbackPanel result={answer(a7oOnCo, 'shove', state)} spot={a7oOnCo} />);
    expect(screen.getByText('+23 XP · Combo ×1,5 · 5 in Folge')).toBeTruthy();
    expect(screen.getByText('Aufgestiegen: Donkey!')).toBeTruthy();
  });

  it('uses Call wording for call spots', () => {
    const spot: Spot = { kind: 'call', shover: 'BTN', position: 'BB', stack: 8, hand: parseHand('K9o') };
    render(<FeedbackPanel result={answer(spot, 'call')} spot={spot} />);
    expect(screen.getByText('Deine Wahl: Call')).toBeTruthy();
    expect(screen.getByTitle('K9o: Call')).toBeTruthy();
    expect(screen.getByText('K9o bei 8 BB gegen Shove aus BTN: Fold aus SB, Call aus BB')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/ui/components/FeedbackPanel.test.tsx` → Expected: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/ui/components/chart-cells.ts`:
```ts
import type { ChartCell } from '../../engine/pushfold';

export const CELL_CLASS: Record<ChartCell, string> = {
  aggressive: 'cell--aggressive',
  fold: 'cell--fold',
  'close-aggressive': 'cell--close-aggressive',
  'close-fold': 'cell--close-fold',
};

export function cellText(cell: ChartCell, word: 'Push' | 'Call'): string {
  switch (cell) {
    case 'aggressive':
      return word;
    case 'fold':
      return 'Fold';
    case 'close-aggressive':
      return `knapp ${word}`;
    case 'close-fold':
      return 'knapp Fold';
  }
}
```

`src/ui/components/RangeChart.tsx`:
```tsx
import { type HandClass, handName } from '../../engine/cards';
import type { ChartCell } from '../../engine/pushfold';
import { CELL_CLASS, cellText } from './chart-cells';

const LEGEND: ChartCell[] = ['aggressive', 'close-aggressive', 'close-fold', 'fold'];

type Props = { cells: readonly ChartCell[]; heroHand: HandClass; word: 'Push' | 'Call' };

export function RangeChart({ cells, heroHand, word }: Props) {
  return (
    <figure className="range-chart">
      <div className="range-chart__grid">
        {cells.map((cell, hand) => {
          const isHero = hand === heroHand;
          return (
            <div
              key={hand}
              className={`range-chart__cell ${CELL_CLASS[cell]}${isHero ? ' range-chart__cell--hero' : ''}`}
              title={`${handName(hand)}: ${cellText(cell, word)}`}
              aria-current={isHero ? 'true' : undefined}
            >
              {handName(hand)}
            </div>
          );
        })}
      </div>
      <figcaption className="range-chart__legend">
        {LEGEND.map((cell) => (
          <span key={cell} className="range-chart__legend-item">
            <span className={`range-chart__swatch ${CELL_CLASS[cell]}`} aria-hidden="true" />
            {cellText(cell, word)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
```

`src/ui/components/PositionRow.tsx`:
```tsx
import { formatEv } from '../../app/format';
import type { PositionComparison } from '../../engine/position-compare';
import { POSITION_LABELS } from '../../engine/positions';
import { CELL_CLASS, cellText } from './chart-cells';

export function PositionRow({ comparison, word }: { comparison: PositionComparison; word: 'Push' | 'Call' }) {
  return (
    <div className="position-row">
      <ol className="position-row__list">
        {comparison.entries.map((entry) => (
          <li
            key={entry.position}
            className={`position-row__item ${CELL_CLASS[entry.cell]}${entry.isHero ? ' position-row__item--hero' : ''}`}
            title={`${POSITION_LABELS[entry.position]}: ${cellText(entry.cell, word)} (${formatEv(entry.ev)})`}
          >
            {POSITION_LABELS[entry.position]}
          </li>
        ))}
      </ol>
      <p className="position-row__summary">{comparison.summary}</p>
    </div>
  );
}
```

`src/ui/components/FeedbackPanel.tsx`:
```tsx
import { actionLabel, aggressiveWord, evLine, verdictLabel } from '../../app/format';
import type { AnswerResult } from '../../app/game-store';
import { handName } from '../../engine/cards';
import type { Spot } from '../../engine/pushfold';
import { PositionRow } from './PositionRow';
import { RangeChart } from './RangeChart';
import './Feedback.css';

const multiplierFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

export function FeedbackPanel({ result, spot }: { result: AnswerResult; spot: Spot }) {
  const { grade, xp, rank } = result.outcome;
  const word = aggressiveWord(spot.kind);
  const xpParts = [xp.xp > 0 ? `+${xp.xp} XP` : '0 XP'];
  if (xp.multiplier > 1) xpParts.push(`Combo ×${multiplierFormat.format(xp.multiplier)}`);
  if (xp.combo >= 2) xpParts.push(`${xp.combo} in Folge`);

  return (
    <section className={`feedback panel feedback--${grade.verdict}`} aria-live="polite">
      <h2 className="feedback__verdict">{verdictLabel(grade.verdict)}</h2>
      <p className="feedback__line">
        Deine Wahl: {actionLabel(grade.chosen)}
        {grade.verdict === 'wrong' ? ` · Besser: ${actionLabel(grade.best)}` : ''}
      </p>
      <p className="feedback__line feedback__ev">{evLine(spot.kind, grade.evAggressive)}</p>
      <p className="feedback__line feedback__xp">{xpParts.join(' · ')}</p>
      {rank.rankUp && <p className="feedback__rankup">Aufgestiegen: {rank.after}!</p>}
      <h3 className="feedback__heading">
        {handName(spot.hand)} bei {spot.stack} BB – Range für diesen Spot
      </h3>
      <RangeChart cells={result.chart} heroHand={spot.hand} word={word} />
      <h3 className="feedback__heading">Dieselbe Hand auf anderen Positionen</h3>
      <PositionRow comparison={result.comparison} word={word} />
    </section>
  );
}
```

`src/ui/components/Feedback.css`:
```css
.feedback {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.feedback__verdict {
  margin: 0;
  font-size: 22px;
}

.feedback--correct .feedback__verdict {
  color: var(--success);
}

.feedback--close .feedback__verdict {
  color: var(--gold);
}

.feedback--wrong .feedback__verdict {
  color: var(--danger);
}

.feedback__line {
  margin: 0;
}

.feedback__ev {
  font-variant-numeric: tabular-nums;
  color: var(--cream-muted);
}

.feedback__xp {
  color: var(--gold);
  font-weight: 600;
}

.feedback__rankup {
  margin: 4px 0;
  padding: 8px 12px;
  border-radius: var(--radius);
  background: var(--gold);
  color: var(--gold-ink);
  font-weight: 700;
  text-align: center;
}

.feedback__heading {
  margin: 12px 0 4px;
  font-size: 15px;
  color: var(--cream);
}

.cell--aggressive {
  background: #2f8f5b;
  color: #f3e9c6;
}

.cell--close-aggressive {
  background: #8a7a2e;
  color: #fff8e0;
}

.cell--close-fold {
  background: #6b5a3a;
  color: #f3e9c6;
}

.cell--fold {
  background: #1d2b24;
  color: #8fa397;
}

.range-chart {
  margin: 0;
}

.range-chart__grid {
  display: grid;
  grid-template-columns: repeat(13, minmax(0, 1fr));
  gap: 2px;
}

.range-chart__cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(7px, 2.1vw, 11px);
  font-weight: 600;
  border-radius: 2px;
  overflow: hidden;
}

.range-chart__cell--hero {
  outline: 2px solid #ffffff;
  outline-offset: -1px;
  position: relative;
  z-index: 1;
}

.range-chart__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--cream-muted);
}

.range-chart__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.range-chart__swatch {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  display: inline-block;
}

.position-row__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 4px;
}

.position-row__item {
  flex: 1;
  text-align: center;
  padding: 8px 2px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
}

.position-row__item--hero {
  outline: 2px solid var(--gold);
  outline-offset: -2px;
}

.position-row__summary {
  margin: 6px 0 0;
  font-size: 14px;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/ui/components` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/chart-cells.ts src/ui/components/RangeChart.tsx src/ui/components/PositionRow.tsx src/ui/components/FeedbackPanel.tsx src/ui/components/Feedback.css src/ui/components/FeedbackPanel.test.tsx
git commit -m "feat(ui): Feedback mit Range-Chart, EV-Zeile, XP und Positions-Vergleich"
```

---

### Task 8: Hinweise, Bildschirme, App und Einstieg

**Files:**
- Create: `src/ui/download.ts`, `src/ui/components/Notices.tsx`, `src/ui/screens/HomeScreen.tsx`, `src/ui/screens/TrainingScreen.tsx`, `src/ui/screens/screens.css`
- Modify: `src/ui/App.tsx` (komplett ersetzen), `src/main.tsx` (komplett ersetzen), `src/ui/App.test.tsx` (komplett ersetzen), `src/ui/theme.css` (Ladeanzeige ergänzen)
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `useGame`, `useGameStore`, `GameProvider`; `createGameStore`, `GameStore`; `openPersistence`, `browserEnv`, `installFlushOnHide`, `PersistenceInfo`; `getPushFoldData`; `mulberry32`; `localDateKey`; alle Komponenten aus Task 5–7
- Produces:
  - `downloadText(filename: string, text: string): void`
  - `Notices({ info, saveError, now })` — Texte (verbindlich):
    - `readOnly`: „Dieser Spielstand stammt aus einer neueren Version der App. Bitte lade die Seite neu, damit die App sich aktualisiert. Bis dahin ist kein Training möglich.“
    - `mode === 'memory'`: „Dein Browser erlaubt hier keinen dauerhaften Speicher (zum Beispiel im privaten Modus). Dein Fortschritt geht beim Schließen verloren.“
    - `otherTabActive`: „Der Trainer ist bereits in einem anderen Tab geöffnet. Dein Fortschritt wird nur dort gespeichert.“
    - `corruptBackup`: „Dein gespeicherter Spielstand war beschädigt und wurde gesichert. Lade die Sicherung herunter, bevor du weiterspielst.“ plus Button „Sicherung herunterladen“ (Dateiname `poker-trainer-sicherung-<YYYY-MM-DD>.json`)
    - `saveError`: „Speichern fehlgeschlagen: <Meldung>“
  - `HomeScreen({ onStartTraining })` — Statusleiste, Abschnitt „Push/Fold-Training“ mit Button „Training starten“ (deaktiviert bei `readOnly`), drei Kacheln „Daily Challenge“, „Endphase-Run“, „Statistik“ mit Badge „bald verfügbar“
  - `TrainingScreen({ onBack })` — Button „← Menü“, Statusleiste, Tisch, Aktions-Buttons, nach der Antwort das Feedback; holt beim ersten Anzeigen automatisch einen Spot
  - `App()` — Titel, Hinweise, Navigation zwischen `home` und `training`

- [ ] **Step 1: Failing Test schreiben (ersetzt den Test aus Task 1)**

`src/ui/App.test.tsx`:
```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createGameStore } from '../app/game-store';
import type { PersistenceInfo } from '../app/persistence';
import { mulberry32 } from '../engine/rng';
import { makeFixture } from '../engine/test-fixtures';
import { emptyState } from '../storage/schema';
import { App } from './App';
import { GameProvider } from './GameContext';

const baseInfo: PersistenceInfo = { mode: 'indexeddb', readOnly: false, otherTabActive: false, corruptBackup: null };

function renderApp(info: Partial<PersistenceInfo> = {}) {
  const save = vi.fn();
  const store = createGameStore({
    data: makeFixture((h) => (84 - h) / 10),
    persistence: { initial: emptyState(), info: { ...baseInfo, ...info }, save },
    rng: mulberry32(4),
    now: () => new Date(2026, 9, 13, 18, 0),
    clock: () => 0,
  });
  render(
    <GameProvider store={store}>
      <App />
    </GameProvider>,
  );
  return { store, save };
}

describe('App', () => {
  it('runs a training round from the home screen', () => {
    const { save } = renderApp();
    expect(screen.getByRole('heading', { name: 'Poker-Trainer' })).toBeTruthy();
    expect(screen.getAllByText('bald verfügbar')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Fold/ }));
    expect(screen.getByRole('heading', { name: /Richtig|Falsch|Knapp/ })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(screen.queryByRole('heading', { name: /Richtig|Falsch|Knapp/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    expect(screen.getByRole('button', { name: 'Training starten' })).toBeTruthy();
  });

  it('plays with the keyboard', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByRole('heading', { name: /Richtig|Falsch|Knapp/ })).toBeTruthy();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.queryByRole('heading', { name: /Richtig|Falsch|Knapp/ })).toBeNull();
  });

  it('blocks training and explains a read-only save', () => {
    renderApp({ readOnly: true });
    expect(screen.getByText(/stammt aus einer neueren Version/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Training starten' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows storage notices', () => {
    renderApp({ mode: 'memory', otherTabActive: true, corruptBackup: { key: 'corrupt-backup:x', raw: '{kaputt' } });
    expect(screen.getByText(/keinen dauerhaften Speicher/)).toBeTruthy();
    expect(screen.getByText(/in einem anderen Tab geöffnet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sicherung herunterladen' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/ui/App.test.tsx` → Expected: FAIL (App kennt weder Store noch Bildschirme).

- [ ] **Step 3: Implementierung schreiben**

`src/ui/download.ts`:
```ts
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

`src/ui/components/Notices.tsx`:
```tsx
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
```

`src/ui/screens/HomeScreen.tsx`:
```tsx
import { StatusBar } from '../components/StatusBar';
import { useGame } from '../GameContext';
import './screens.css';

const COMING_SOON = ['Daily Challenge', 'Endphase-Run', 'Statistik'];

export function HomeScreen({ onStartTraining }: { onStartTraining: () => void }) {
  const game = useGame();
  return (
    <>
      <StatusBar status={game.status} xp={game.save.profile.xp} />
      <section className="panel home__hero">
        <h2 className="home__heading">Push/Fold-Training</h2>
        <p className="muted">
          Kurze Stacks von 1 bis 20 BB, 8-max mit Big-Blind-Ante. Der Trainer zeigt dir bevorzugt knappe Spots und
          die Situationen, in denen du am häufigsten danebenliegst.
        </p>
        <button type="button" className="btn btn--gold home__start" onClick={onStartTraining} disabled={game.info.readOnly}>
          Training starten
        </button>
      </section>
      <section className="home__modes">
        {COMING_SOON.map((title) => (
          <div key={title} className="panel home__mode">
            <span>{title}</span>
            <span className="badge">bald verfügbar</span>
          </div>
        ))}
      </section>
    </>
  );
}
```

`src/ui/screens/TrainingScreen.tsx`:
```tsx
import { useCallback, useEffect } from 'react';
import type { Action } from '../../engine/pushfold';
import { ActionBar } from '../components/ActionBar';
import { FeedbackPanel } from '../components/FeedbackPanel';
import { PokerTable } from '../components/PokerTable';
import { StatusBar } from '../components/StatusBar';
import { useGame, useGameStore } from '../GameContext';
import './screens.css';

export function TrainingScreen({ onBack }: { onBack: () => void }) {
  const store = useGameStore();
  const game = useGame();

  useEffect(() => {
    if (!store.getSnapshot().current) store.nextTrainingSpot();
  }, [store]);

  const onAction = useCallback((action: Action) => {
    store.answer(action);
  }, [store]);
  const onNext = useCallback(() => {
    store.nextTrainingSpot();
  }, [store]);

  const current = game.current;
  return (
    <>
      <div className="screen-header">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Menü
        </button>
        <span className="muted">Training</span>
      </div>
      <StatusBar status={game.status} xp={game.save.profile.xp} />
      {current && (
        <>
          <PokerTable key={current.shownAt} spot={current.spot} cards={current.cards} />
          <ActionBar kind={current.spot.kind} answered={game.last !== null} onAction={onAction} onNext={onNext} />
          {game.last && <FeedbackPanel result={game.last} spot={current.spot} />}
        </>
      )}
    </>
  );
}
```

`src/ui/screens/screens.css`:
```css
.screen-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.home__hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.home__heading {
  margin: 0;
  font-size: 20px;
  color: var(--gold);
}

.home__hero p {
  margin: 0;
}

.home__start {
  min-height: 56px;
  font-size: 18px;
}

.home__modes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.home__mode {
  display: flex;
  flex-direction: column;
  gap: 6px;
  opacity: 0.75;
}

.notices {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notices:empty {
  display: none;
}

.notice {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--felt);
  border: 1px solid rgba(243, 233, 198, 0.3);
  font-size: 14px;
}

.notice p {
  margin: 0 0 8px;
}

.notice--warning {
  border-color: var(--gold);
}
```

`src/ui/App.tsx`:
```tsx
import { useState } from 'react';
import { Notices } from './components/Notices';
import { useGame } from './GameContext';
import { HomeScreen } from './screens/HomeScreen';
import { TrainingScreen } from './screens/TrainingScreen';

type Screen = 'home' | 'training';

const now = () => new Date();

export function App() {
  const game = useGame();
  const [screen, setScreen] = useState<Screen>('home');
  return (
    <main className="app">
      <h1 className="app__title">Poker-Trainer</h1>
      <Notices info={game.info} saveError={game.saveError} now={now} />
      {screen === 'home' ? (
        <HomeScreen onStartTraining={() => setScreen('training')} />
      ) : (
        <TrainingScreen onBack={() => setScreen('home')} />
      )}
    </main>
  );
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getPushFoldData } from './app/data';
import { type GameStore, createGameStore } from './app/game-store';
import { browserEnv, installFlushOnHide, openPersistence } from './app/persistence';
import { mulberry32 } from './engine/rng';
import { App } from './ui/App';
import { GameProvider } from './ui/GameContext';
import './ui/theme.css';

async function bootstrap(): Promise<void> {
  const root = createRoot(document.getElementById('root')!);
  root.render(<p className="app-loading">Lädt …</p>);

  let store: GameStore | null = null;
  const persistence = await openPersistence(
    browserEnv((error) => {
      console.error(error);
      store?.reportSaveError(error);
    }),
  );
  installFlushOnHide(persistence, document, window);

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  store = createGameStore({
    data: getPushFoldData(),
    persistence,
    rng: mulberry32(seed),
    now: () => new Date(),
    clock: () => performance.now(),
  });
  const ready = store;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ready.refreshStatus();
  });

  root.render(
    <StrictMode>
      <GameProvider store={ready}>
        <App />
      </GameProvider>
    </StrictMode>,
  );
}

void bootstrap();
```

In `src/ui/theme.css` am Ende ergänzen:
```css
.app-loading {
  text-align: center;
  margin-top: 40vh;
  color: var(--cream-muted);
}
```

- [ ] **Step 4: Tests, Typecheck und Build laufen lassen**

Run: `npm test` → Expected: alle PASS.
Run: `npm run typecheck` → Expected: Exit 0.
Run: `npm run build` → Expected: erfolgreich.

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/ui
git commit -m "feat(ui): Startseite, Trainingsbildschirm, Speicher-Hinweise und App-Einstieg"
```

---

### Task 9: PWA mit App-Icons

**Files:**
- Create: `scripts/make-icons.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png` (erzeugt)
- Modify: `package.json` (Skript `icons`, Abhängigkeit `vite-plugin-pwa`), `vite.config.ts`, `index.html`, `src/main.tsx`, `tsconfig.json`
- Test: `scripts/make-icons.test.ts`

**Interfaces:**
- Produces:
  - `encodePng(width: number, height: number, rgba: Uint8Array): Buffer` (RGBA, 8 Bit, ohne Interlace)
  - `renderChipIcon(size: number): Uint8Array` (Filz-Hintergrund über die volle Fläche, damit das Icon als „maskable“ taugt; goldener Chip mit cremefarbenem Rand und 8 Kerben, Kantenglättung per 4×4-Supersampling)
  - `npm run icons` schreibt die drei PNGs nach `public/icons/`

- [ ] **Step 1: Abhängigkeit installieren**

Run: `npm install -D vite-plugin-pwa@^1.0.0` → Expected: keine Fehler, Version im Bereich 1.x.

- [ ] **Step 2: Failing Test schreiben**

`scripts/make-icons.test.ts`:
```ts
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng, renderChipIcon } from './make-icons';

describe('make-icons', () => {
  it('encodes a valid PNG with the right size', () => {
    const png = encodePng(2, 1, Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255]));
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(2);
    expect(png.readUInt32BE(20)).toBe(1);
    const idatStart = png.indexOf(Buffer.from('IDAT')) + 4;
    const idatLength = png.readUInt32BE(idatStart - 8);
    const raw = inflateSync(png.subarray(idatStart, idatStart + idatLength));
    expect([...raw]).toEqual([0, 255, 0, 0, 255, 0, 255, 0, 255]);
  });

  it('renders a felt background and a gold centre', () => {
    const size = 64;
    const px = renderChipIcon(size);
    expect(px).toHaveLength(size * size * 4);
    expect([...px.subarray(0, 4)]).toEqual([0x0e, 0x4d, 0x2e, 255]);
    const c = ((size / 2) * size + size / 2) * 4;
    expect([...px.subarray(c, c + 4)]).toEqual([0xe8, 0xc1, 0x5a, 255]);
  });
});
```

- [ ] **Step 3: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run scripts/make-icons.test.ts` → Expected: FAIL, Modul nicht gefunden.

- [ ] **Step 4: Icon-Skript schreiben**

`scripts/make-icons.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

type Rgb = readonly [number, number, number];
const FELT: Rgb = [0x0e, 0x4d, 0x2e];
const GOLD: Rgb = [0xe8, 0xc1, 0x5a];
const CREAM: Rgb = [0xf3, 0xe9, 0xc6];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Colour of a point in unit coordinates (centre 0,0; edge ±1).
function chipColour(x: number, y: number): Rgb {
  const r = Math.hypot(x, y);
  if (r > 0.72) return FELT;
  if (r > 0.56) {
    const angle = Math.atan2(y, x);
    const notch = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * 16) % 2 === 0;
    return notch ? CREAM : GOLD;
  }
  if (r > 0.5) return CREAM;
  return GOLD;
}

export function renderChipIcon(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const samples = 4;
  for (let py = 0; py < size; py++) {
    for (let pxX = 0; pxX < size; pxX++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = ((pxX + (sx + 0.5) / samples) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / samples) / size) * 2 - 1;
          const [cr, cg, cb] = chipColour(x, y);
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const n = samples * samples;
      const i = (py * size + pxX) * 4;
      px[i] = Math.round(r / n);
      px[i + 1] = Math.round(g / n);
      px[i + 2] = Math.round(b / n);
      px[i + 3] = 255;
    }
  }
  return px;
}

function main(): void {
  const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
  mkdirSync(outDir, { recursive: true });
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
    writeFileSync(join(outDir, name), encodePng(size, size, renderChipIcon(size)));
    console.log(`public/icons/${name}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
```

In `package.json` unter `scripts` ergänzen: `"icons": "tsx scripts/make-icons.ts"`.

- [ ] **Step 5: Test laufen lassen und Icons erzeugen**

Run: `npx vitest run scripts/make-icons.test.ts` → Expected: PASS.
Run: `npm run icons` → Expected: drei Zeilen `public/icons/…png`.

- [ ] **Step 6: PWA konfigurieren**

`vite.config.ts` (komplett ersetzen):
```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/poker-trainer/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Poker-Trainer',
        short_name: 'Poker',
        description: 'Push/Fold-Trainer für Texas-Hold’em-Turniere',
        lang: 'de',
        start_url: '/poker-trainer/',
        scope: '/poker-trainer/',
        display: 'standalone',
        background_color: '#0E4D2E',
        theme_color: '#0E4D2E',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
```

In `index.html` im `<head>` nach dem `theme-color`-Meta ergänzen:
```html
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <link rel="icon" type="image/png" href="%BASE_URL%icons/icon-192.png" />
    <link rel="apple-touch-icon" href="%BASE_URL%icons/apple-touch-icon.png" />
```

In `tsconfig.json` bei `types` ergänzen: `"vite-plugin-pwa/client"` (ergibt `["node", "vite/client", "vite-plugin-pwa/client"]`).

In `src/main.tsx` nach den Imports ergänzen:
```tsx
import { registerSW } from 'virtual:pwa-register';
```
und als erste Zeile in `bootstrap()`:
```tsx
  registerSW({ immediate: true });
```

- [ ] **Step 7: Build prüfen**

Run: `npm run build` → Expected: erfolgreich; `dist/manifest.webmanifest`, `dist/sw.js` und `dist/icons/icon-192.png` existieren (prüfen mit `node -e "for (const f of ['dist/manifest.webmanifest','dist/sw.js','dist/icons/icon-192.png']) require('fs').accessSync(f); console.log('pwa ok')"`).
Run: `npm test` und `npm run typecheck` → Expected: PASS bzw. Exit 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.ts index.html tsconfig.json src/main.tsx scripts/make-icons.ts scripts/make-icons.test.ts public/icons
git commit -m "feat(pwa): installierbare App mit Offline-Cache und Chip-Icons"
```

---

### Task 10: CI, GitHub Pages und README

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `README.md`

**Interfaces:**
- Produces: Prüf-Workflow für Pull Requests und `main`; Veröffentlichung von `dist/` nach GitHub Pages bei jedem Push auf `main`

- [ ] **Step 1: Workflows schreiben**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run check:portability
      - run: npm run build
```

`.github/workflows/pages.yml`:
```yaml
name: Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: README schreiben**

`README.md`:
```markdown
# Poker-Trainer

Push/Fold-Trainer für Texas-Hold’em-Turniere (8-max, Big-Blind-Ante, 1–20 BB). Die richtigen Antworten stammen aus einem vorberechneten Nash-Gleichgewicht in chip-EV.

**Spielen:** https://finndegray.github.io/poker-trainer/ – am Handy über „Zum Home-Bildschirm“ als App installierbar, danach auch offline nutzbar.

## Bedienung

- **F** = Fold, **A** = All-in bzw. Call, **Leertaste** = nächster Spot
- Nach jeder Entscheidung zeigt der Trainer EVs, den Range-Chart des Spots und dieselbe Hand auf allen anderen Positionen.
- Dein Fortschritt bleibt nur in deinem Browser gespeichert.

## Entwicklung

Voraussetzung: Node.js 24.

    npm install
    npm run dev          # Entwicklungsserver auf http://127.0.0.1:5173/poker-trainer/
    npm test             # alle Tests
    npm run typecheck
    npm run build        # Produktionsbuild nach dist/

Die Push/Fold-Daten liegen fertig in `src/data/pushfold.json`. Neu berechnen (dauert einige Minuten):

    npm run data:equity
    npm run data:pushfold
```

- [ ] **Step 3: Prüfen und committen**

Run: `npm run check:portability` → Expected: clean.

```bash
git add .github/workflows/ci.yml .github/workflows/pages.yml README.md
git commit -m "ci: Prüf-Workflow, Veröffentlichung auf GitHub Pages und README"
```

---

### Task 11: Abschlussprüfung im Browser (Controller)

Diese Schritte führt der Controller selbst aus, nicht ein Implementierungs-Agent.

- [ ] **Step 1:** `npm test`, `npm run typecheck`, `npm run check:portability`, UTF-8-Prüfung aller Dateien unter `src/`.
- [ ] **Step 2:** `npm run build` und `npm run preview` (über eine `.claude/launch.json`-Konfiguration im Projekt) starten; im Browser `http://127.0.0.1:4173/poker-trainer/` öffnen.
- [ ] **Step 3:** Prüfen am Desktop und mit Handy-Viewport (375×812): Startseite, Training starten, Tisch mit 8 beschrifteten Plätzen und Dealer-Button, Fold/All-in per Klick und Tastatur, Feedback mit Range-Chart und Positions-Zeile, Weiter, Neuladen behält XP und Tageszähler. Keine Fehler in der Konsole.
- [ ] **Step 4:** Nach Zustimmung des Nutzers GitHub Pages auf „GitHub Actions“ umstellen: `gh api -X POST repos/finndegray/poker-trainer/pages -f build_type=workflow`.
- [ ] **Step 5:** Pull Request anlegen; nach dem Merge den Pages-Workflow abwarten und `https://finndegray.github.io/poker-trainer/` im Browser prüfen.
