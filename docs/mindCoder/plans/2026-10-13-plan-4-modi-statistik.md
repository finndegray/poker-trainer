# Plan 4: Daily Challenge, Endphase-Run, Statistik, Einstellungen, Sounds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use mindCoder:subagent-driven-development (recommended) or mindCoder:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die restlichen Funktionen aus der Spec in die laufende App bringen: Daily Challenge, Endphase-Run, Statistik-Seite, Einstellungen (Sound, Export/Import, Backups), Sounds und eine Feier beim Rangaufstieg.

**Architecture:** Der Spiel-Store (`src/app/game-store.ts`) bekommt eine `session` (Training, Daily oder Run), die bestimmt, wie Spots erzeugt und Antworten verbucht werden. Die Bildschirme bleiben dünn und rufen nur Store-Methoden auf. Die Logik für Daily, Run und Statistik existiert bereits in `src/game/` (Plan 2) und wird hier nur angebunden. Sounds werden per Web Audio synthetisiert (keine Audiodateien).

**Tech Stack:** React 19, Vite 6, Vitest 3 mit jsdom und Testing Library, Web Audio API.

## Global Constraints

- Entwickler-Rechner: Windows 11 (PowerShell) UND macOS (zsh). Automation nur als Node-Skript via `npm run`. Dateien in UTF-8 mit LF. Dateien mit Umlauten nur mit dem Datei-Schreibwerkzeug anlegen (keine Shell-Heredocs, keine Python-Umschreibungen).
- Texte in der Oberfläche auf Deutsch mit echten Umlauten. Identifier und Kommentare auf Englisch.
- Design-Tokens aus `src/ui/theme.css` verwenden (Filz, Gold, Creme, Zellfarben). Neue Farben nur als Token in `theme.css`.
- Daily Challenge: 20 Spots aus `dailySpots(data, dateKey)`, einmal pro Tag wertbar (`recordDaily` liefert `accepted: false` für Wiederholungen; solche Läufe zählen nicht, XP gibt es trotzdem pro Entscheidung). Ergebnis: richtige Antworten (Grenzfälle zählen als richtig) und benötigte Zeit.
- Endphase-Run: Zustand liegt in `SaveState.activeRun` und übersteht Neuladen. Spots über `nextRunSpot`, Antworten über `answerActiveRun`, Abschluss über `recordRun` (Bonus-XP, Bestplatzierung). Anzeige: Level 1–8, Stack, Leben als Herzen, Spot im Level (x/5). Ergebnis: „Platz <n> von 2.000“ bzw. „Final Table erreicht!“.
- Statistik: Trefferquote gesamt, nach Position, nach Stack-Bereich, nach Spot-Typ; Fehler-Heatmap 13×13 je Spot-Typ; Wochenverlauf 8 Wochen; beste Platzierung und letzte Runs; letzte Daily-Ergebnisse.
- Einstellungen: Sound an/aus; Export als JSON-Datei `poker-trainer-spielstand-<YYYY-MM-DD>.json`; Import einer solchen Datei, vorher wird der aktuelle Stand automatisch als Backup gesichert; Liste der Backups mit Herunterladen und Löschen.
- Sounds: Austeilen, richtig, falsch, Rangaufstieg; nur wenn `profile.soundOn`; der Audio-Kontext wird erst bei der ersten Nutzergeste erzeugt.
- Rangaufstieg: Overlay mit „Aufgestiegen!“ und dem neuen Rang, Konfetti-Animation (abgeschaltet bei `prefers-reduced-motion`), Button „Weiter so!“.
- Schreibschutz: In `readOnly` sind alle Modi gesperrt; Import ist nur möglich, wenn dieser Tab schreiben darf.

## Bestehende API (unverändert nutzen)

- `src/game/session.ts`: `recordDecision(data, state, { spot, chosen, responseMs, mode, now })`, `recordDaily(state, result)` → `{ state, accepted, isPersonalBest }`, `recordRun(state, run, now)` → `{ state, summary, rank, isPersonalBest }` (setzt `activeRun` auf `null`), `startActiveRun(state)`, `answerActiveRun(state, verdict)`, `statusOf(state, now)`, `nextTrainingSpot(data, state, rng)`, `setSound(state, on)`, Typen `DecisionOutcome`, `RankChange`, `SessionStatus`.
- `src/game/daily.ts`: `dailySpots`, `DAILY_SPOT_COUNT`, `DailyResult`, `bestDaily`. `src/game/endphase-run.ts`: `RunState`, `nextRunSpot`, `RUN_LEVEL_STACKS`, `RUN_SPOTS_PER_LEVEL`, `RUN_LIVES`, `RUN_FIELD`, `runStack`. `src/game/stats.ts`: `accuracy`, `accuracyBy`, `byPosition`, `byStackBucket`, `byKind`, `handErrorMatrix`, `weeklyTrend`. `src/game/streak.ts`: `localDateKey`. `src/game/xp.ts`: `RankName`.
- `src/storage/schema.ts`: `SaveState`, `RunSummary`, `serialize`, `deserialize`, `SaveFormatError`. `src/storage/store.ts`: `KeyValueBackend`, `listBackups`, `readBackup`, `deleteBackup`, `BACKUP_PREFIX`.
- `src/app/persistence.ts`: `Persistence` (`initial`, `info`, `save`, `flush`, `onWriterAcquired`), `openPersistence`.
- `src/app/game-store.ts` (Stand nach Plan 3): `createGameStore`, `GameSnapshot` (`save`, `status`, `info`, `current`, `last`, `saveError`, `notice`), Methoden `nextTrainingSpot`, `resumeTraining`, `answer`, `setSound`, `reportSaveError`, `refreshStatus`, `adoptSavedState`, `setUpdateAvailable`, `dismissNotice`.
- UI: `StatusBar`, `PokerTable`, `ActionBar`, `FeedbackPanel`, `Notices`, `downloadText(filename, text)`, `useGame`, `useGameStore`, `CELL_CLASS`, `formatPercent`, `POSITION_LABELS`, `handName`.

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/storage/store.ts` | + `writeBackup` |
| `src/app/persistence.ts` | + `Persistence.backups` |
| `src/app/game-store.ts` | + Sessions (Training/Daily/Run), `next`, Feier, Import |
| `src/ui/App.tsx` | Navigation über alle Bildschirme, Sounds, Feier |
| `src/ui/screens/HomeScreen.tsx` | Kacheln mit Status der Modi |
| `src/ui/screens/PlayScreen.tsx` | Gemeinsamer Spielbildschirm für Training, Daily und Run |
| `src/ui/components/SessionHeader.tsx`, `ResultCard.tsx` | Kopfzeile je Modus, Ergebnis von Daily und Run |
| `src/ui/screens/StatsScreen.tsx`, `src/ui/components/ErrorHeatmap.tsx`, `TrendChart.tsx` | Statistik |
| `src/ui/screens/SettingsScreen.tsx` | Sound, Export/Import, Backups |
| `src/ui/sound.ts`, `src/ui/useGameSounds.ts` | Synthetisierte Sounds und ihre Auslöser |
| `src/ui/components/Celebration.tsx` | Rangaufstiegs-Overlay |

---

### Task 1: Backups über die Persistenz

**Files:**
- Modify: `src/storage/store.ts`, `src/app/persistence.ts`
- Test: `src/storage/store.test.ts`, `src/app/persistence.test.ts` (Tests ergänzen)

**Interfaces:**
- Produces:
  - `writeBackup(backend: KeyValueBackend, raw: string, now: Date): Promise<string>` in `store.ts` — schreibt unter `BACKUP_PREFIX + now.toISOString()` und gibt den Schlüssel zurück
  - `type BackupApi = { list(): Promise<string[]>; read(key: string): Promise<string | undefined>; remove(key: string): Promise<void>; create(raw: string): Promise<string> }` in `persistence.ts`
  - `Persistence.backups: BackupApi` — `list`/`read` immer erlaubt; `remove`/`create` nur, wenn dieser Tab schreiben darf (sonst `Promise` mit deutschem Fehler „Dieser Tab darf gerade nicht speichern.“ abgelehnt); folgt der Schreibberechtigung auch nach einer Tab-Übergabe

- [ ] **Step 1: Failing Tests ergänzen**

In `src/storage/store.test.ts` (Import um `writeBackup`, `listBackups` ergänzen) ein neues `describe` anhängen:
```ts
describe('writeBackup', () => {
  it('stores the raw text under a timestamped backup key', async () => {
    const backend = memoryBackend();
    const key = await writeBackup(backend, '{"alt":true}', new Date('2026-10-13T12:00:00Z'));
    expect(key).toBe(`${BACKUP_PREFIX}2026-10-13T12:00:00.000Z`);
    expect(await backend.get(key)).toBe('{"alt":true}');
    expect(await listBackups(backend)).toEqual([key]);
  });
});
```

In `src/app/persistence.test.ts` ein neues `describe` anhängen (nutzt die vorhandenen Helfer `env`, `lockAvailable`, `lockTaken`):
```ts
describe('persistence.backups', () => {
  it('creates, lists, reads and removes backups when writable', async () => {
    const backend = memoryBackend();
    const p = await openPersistence(env({ createBackend: () => backend, locks: lockAvailable }));
    const key = await p.backups.create('{"stand":1}');
    expect(await p.backups.list()).toEqual([key]);
    expect(await p.backups.read(key)).toBe('{"stand":1}');
    await p.backups.remove(key);
    expect(await p.backups.list()).toEqual([]);
  });

  it('refuses to write backups when another tab is the writer', async () => {
    const p = await openPersistence(env({ locks: lockTaken }));
    await expect(p.backups.create('{}')).rejects.toThrow('Dieser Tab darf gerade nicht speichern.');
    await expect(p.backups.remove('corrupt-backup:x')).rejects.toThrow('Dieser Tab darf gerade nicht speichern.');
    expect(await p.backups.list()).toEqual([]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run src/storage/store.test.ts src/app/persistence.test.ts` → Expected: FAIL (`writeBackup` fehlt, `p.backups` ist undefined).

- [ ] **Step 3: Implementierung**

In `src/storage/store.ts` ergänzen:
```ts
export async function writeBackup(backend: KeyValueBackend, raw: string, now: Date): Promise<string> {
  const key = `${BACKUP_PREFIX}${now.toISOString()}`;
  await backend.set(key, raw);
  return key;
}
```

In `src/app/persistence.ts`:
- Import erweitern um `deleteBackup`, `listBackups`, `readBackup`, `writeBackup` aus `../storage/store`.
- Typ ergänzen und in `Persistence` aufnehmen:
```ts
export type BackupApi = {
  list(): Promise<string[]>;
  read(key: string): Promise<string | undefined>;
  remove(key: string): Promise<void>;
  create(raw: string): Promise<string>;
};
```
```ts
  /** Manual and automatic backups of the save, e.g. before an import. */
  backups: BackupApi;
```
- Im Rückgabeobjekt von `openPersistence` ergänzen (nutzt die bestehende Variable `writable`, damit eine spätere Tab-Übergabe berücksichtigt wird):
```ts
    backups: {
      list: () => listBackups(backend),
      read: (key) => readBackup(backend, key),
      remove: (key) => (writable ? deleteBackup(backend, key) : Promise.reject(notWritable())),
      create: (raw) => (writable ? writeBackup(backend, raw, env.now()) : Promise.reject(notWritable())),
    },
```
- Hilfsfunktion auf Modulebene:
```ts
const notWritable = (): Error => new Error('Dieser Tab darf gerade nicht speichern.');
```

- [ ] **Step 4: Bestehende Test-Stubs anpassen**

Überall, wo ein `Persistence`-Objekt von Hand gebaut wird und der Typ jetzt `backups` verlangt, einen Stub ergänzen. Suche mit `rg "persistence: \{" src`. Stub:
```ts
backups: { list: async () => [], read: async () => undefined, remove: async () => {}, create: async () => 'corrupt-backup:test' },
```
(Nur nötig, wo der Typ `Persistence` vollständig verlangt wird; `GameStoreDeps` verlangt `backups` erst ab Task 2.)

- [ ] **Step 5: Tests und Typecheck**

Run: `npm test` → Expected: alle PASS. Run: `npm run typecheck` → Expected: Exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/storage/store.ts src/storage/store.test.ts src/app/persistence.ts src/app/persistence.test.ts
git commit -m "feat(storage): Backups anlegen, auflisten, lesen und löschen über die Persistenz"
```

---

### Task 2: Spiel-Store mit Daily, Run, Feier und Import

**Files:**
- Modify: `src/app/game-store.ts`, `src/app/game-store.test.ts`
- Modify (nur Test-Stubs): alle Tests, die `createGameStore` aufrufen (`rg "createGameStore" src --glob "*.test.*"`)

**Interfaces:**
- Consumes: `dailySpots`, `DailyResult`; `nextRunSpot`; `answerActiveRun`, `recordDaily`, `recordRun`, `startActiveRun`; `DecisionMode`; `localDateKey`; `RankName`; `RunSummary`, `serialize`, `deserialize`; `Persistence['backups']`
- Produces (zusätzlich zur bestehenden API, die unverändert bleibt):
  - `type DailyOutcome = { result: DailyResult; accepted: boolean; isPersonalBest: boolean }`
  - `type RunOutcome = { summary: RunSummary; isPersonalBest: boolean }`
  - `type Session = { kind: 'training' } | { kind: 'daily'; dateKey: string; spots: Spot[]; index: number; correct: number; startedAt: number; outcome: DailyOutcome | null } | { kind: 'run'; outcome: RunOutcome | null }`
  - `GameSnapshot` erweitert um `session: Session` (Start: `{ kind: 'training' }`) und `celebration: RankName | null` (Start: `null`)
  - `GameStoreDeps.persistence: Pick<Persistence, 'initial' | 'info' | 'save' | 'backups'>`
  - Neue Methoden:
    - `startTraining(): void` — wechselt in den Trainingsmodus und verhält sich dann wie `resumeTraining`
    - `startDaily(options?: { restart?: boolean }): void` — startet die Daily des heutigen Tages; eine laufende Daily desselben Tages wird fortgesetzt (Timer des offenen Spots neu gestartet); eine beendete bleibt sichtbar, außer bei `restart: true`
    - `startRun(options?: { restart?: boolean }): void` — setzt einen laufenden Run (auch aus `save.activeRun` nach Neuladen) fort oder startet einen neuen (`startActiveRun`, sofort gespeichert); ein beendeter Run bleibt sichtbar, außer bei `restart: true`
    - `next(): void` — nächster Spot im aktuellen Modus; nach dem 20. Daily-Spot wird `recordDaily` aufgerufen und `session.outcome` gesetzt (`current` wird `null`); nach Run-Ende wird `current` `null`
    - `dismissCelebration(): void`
    - `exportState(): string` (= `serialize(save)`)
    - `importState(text: string): Promise<void>` — validiert per `deserialize` (wirft `SaveFormatError`), sichert den aktuellen Stand per `persistence.backups.create(serialize(save))`, übernimmt dann den importierten Stand (Session zurück auf Training, `current`/`last` geleert)
  - `answer(action)` verbucht je nach `session.kind` mit `mode` `'training'`, `'daily'` oder `'run'`. Daily: `correct` zählt Antworten mit Verdict ≠ `'wrong'`. Run: danach `answerActiveRun`; ist der Run damit beendet, sofort `recordRun` und `session.outcome` setzen. `celebration` wird auf den neuen Rang gesetzt, wenn die Entscheidung oder die Run-Bonus-XP einen Rangaufstieg auslösen.
  - Alle `start*`-Methoden werfen im `readOnly`-Modus („Im Nur-Lesen-Modus nicht möglich“). `adoptSavedState` setzt die Session zusätzlich auf Training zurück.

- [ ] **Step 1: Test-Setup und neue Tests schreiben**

In `src/app/game-store.test.ts`: im Helfer `setup` das `persistence`-Objekt um `backups` erweitern und den Helfer so umbauen, dass er auch einen Startstand annimmt:
```ts
function setup(over: Partial<PersistenceInfo> = {}, initial: SaveState = emptyState()) {
  let t = 1000;
  const save = vi.fn();
  const create = vi.fn(async () => 'corrupt-backup:test');
  const deps: GameStoreDeps = {
    data: makeFixture((h) => (84 - h) / 10),
    persistence: {
      initial,
      info: { ...info, ...over },
      save,
      backups: { list: async () => [], read: async () => undefined, remove: async () => {}, create },
    },
    rng: mulberry32(1),
    now: () => new Date(2026, 9, 13, 18, 0),
    clock: () => t,
  };
  return { store: createGameStore(deps), save, create, data: deps.data, advance: (ms: number) => (t += ms) };
}
```
(Importe ergänzen: `type SaveState`, `serialize`, `SaveFormatError` aus `../storage/schema`; `evOf`, `aggressiveAction`, `type Action`, `type Spot` aus `../engine/pushfold`; `dailySpots` aus `../game/daily`; `RUN_LEVEL_STACKS`, `startRun` aus `../game/endphase-run`.)

Hilfsfunktionen im Test:
```ts
const rightAction = (data: PushFoldData, spot: Spot): Action => (evOf(data, spot) > 0 ? aggressiveAction(spot) : 'fold');
const wrongAction = (data: PushFoldData, spot: Spot): Action => (evOf(data, spot) > 0 ? 'fold' : aggressiveAction(spot));
```
(`PushFoldData` aus `../engine/pushfold-data` importieren.)

Neue Tests anhängen:
```ts
describe('daily challenge', () => {
  it('plays the 20 spots of the day and records the result once', () => {
    const { store, data, advance } = setup();
    store.startDaily();
    const expected = dailySpots(data, '2026-10-13');
    for (let i = 0; i < 20; i++) {
      const snap = store.getSnapshot();
      expect(snap.session).toMatchObject({ kind: 'daily', index: i });
      expect(snap.current?.spot).toEqual(expected[i]);
      store.answer(i < 15 ? rightAction(data, snap.current!.spot) : wrongAction(data, snap.current!.spot));
      expect(store.getSnapshot().last?.outcome.record.mode).toBe('daily');
      advance(1000);
      store.next();
    }
    const snap = store.getSnapshot();
    expect(snap.current).toBeNull();
    expect(snap.session).toMatchObject({ kind: 'daily', outcome: { accepted: true, isPersonalBest: true } });
    const outcome = (snap.session as { outcome: { result: { correct: number; total: number } } }).outcome;
    expect(outcome.result.total).toBe(20);
    expect(outcome.result.correct).toBeGreaterThanOrEqual(15);
    expect(snap.save.daily['2026-10-13']).toEqual(outcome.result);
    expect(snap.status.dailyToday).toEqual(outcome.result);

    store.startDaily();
    expect(store.getSnapshot().session).toBe(snap.session);

    store.startDaily({ restart: true });
    for (let i = 0; i < 20; i++) {
      store.answer('fold');
      store.next();
    }
    expect(store.getSnapshot().session).toMatchObject({ outcome: { accepted: false } });
  });

  it('resumes an unfinished daily instead of restarting it', () => {
    const { store, advance } = setup();
    store.startDaily();
    store.answer('fold');
    store.next();
    advance(5000);
    store.startDaily();
    expect(store.getSnapshot().session).toMatchObject({ kind: 'daily', index: 1 });
    expect(store.getSnapshot().current?.shownAt).toBe(6000);
  });
});

describe('endphase run', () => {
  it('runs until the third mistake and records the run', () => {
    const { store, data } = setup();
    store.startRun();
    expect(store.getSnapshot().save.activeRun).toMatchObject({ status: 'running', lives: 3 });
    for (let i = 0; i < 40 && !(store.getSnapshot().session as { outcome: unknown }).outcome; i++) {
      const spot = store.getSnapshot().current!.spot;
      store.answer(wrongAction(data, spot));
      expect(store.getSnapshot().last?.outcome.record.mode).toBe('run');
      store.next();
    }
    const snap = store.getSnapshot();
    // Close spots cost no life, so the bust level depends on the dealt spots; the run must end before the final table.
    expect(snap.session).toMatchObject({ kind: 'run', outcome: { summary: { finalTable: false }, isPersonalBest: true } });
    const summary = (snap.session as { outcome: { summary: { placement: number } } }).outcome.summary;
    expect(summary.placement).toBeGreaterThan(10);
    expect(snap.save.activeRun).toBeNull();
    expect(snap.save.bestRun?.placement).toBe(summary.placement);
    expect(snap.current).toBeNull();
  });

  it('continues a saved run after a reload', () => {
    const initial: SaveState = { ...emptyState(), activeRun: { ...startRun(), levelIndex: 2, answered: 10 } };
    const { store } = setup({}, initial);
    store.startRun();
    const snap = store.getSnapshot();
    expect(snap.save.activeRun).toMatchObject({ levelIndex: 2, answered: 10 });
    expect(Math.abs(snap.current!.spot.stack - RUN_LEVEL_STACKS[2])).toBeLessThanOrEqual(1);
  });

  it('keeps a finished run visible until restarted', () => {
    const { store, data } = setup();
    store.startRun();
    while (!(store.getSnapshot().session as { outcome: unknown }).outcome) {
      store.answer(wrongAction(data, store.getSnapshot().current!.spot));
      store.next();
    }
    const finished = store.getSnapshot().session;
    store.startRun();
    expect(store.getSnapshot().session).toBe(finished);
    store.startRun({ restart: true });
    expect(store.getSnapshot().session).toEqual({ kind: 'run', outcome: null });
    expect(store.getSnapshot().save.activeRun?.status).toBe('running');
  });
});

describe('celebration, export and import', () => {
  it('celebrates a rank-up until dismissed', () => {
    const initial: SaveState = { ...emptyState(), profile: { xp: 495, combo: 0, soundOn: true } };
    const { store, data } = setup({}, initial);
    store.startTraining();
    store.answer(rightAction(data, store.getSnapshot().current!.spot));
    expect(store.getSnapshot().celebration).toBe('Donkey');
    store.dismissCelebration();
    expect(store.getSnapshot().celebration).toBeNull();
  });

  it('backs up the current state before importing', async () => {
    const initial: SaveState = { ...emptyState(), profile: { xp: 120, combo: 0, soundOn: true } };
    const { store, save, create } = setup({}, initial);
    const imported: SaveState = { ...emptyState(), profile: { xp: 900, combo: 0, soundOn: false } };
    await store.importState(serialize(imported));
    expect(create).toHaveBeenCalledWith(serialize(initial));
    expect(store.getSnapshot().save).toEqual(imported);
    expect(save).toHaveBeenLastCalledWith(imported);
    expect(JSON.parse(store.exportState()).profile.xp).toBe(900);
  });

  it('rejects an invalid import without changing anything', async () => {
    const { store, create } = setup();
    await expect(store.importState('{kaputt')).rejects.toBeInstanceOf(SaveFormatError);
    expect(create).not.toHaveBeenCalled();
    expect(store.getSnapshot().save).toEqual(emptyState());
  });

  it('blocks every mode in read-only mode', () => {
    const { store } = setup({ readOnly: true });
    expect(() => store.startTraining()).toThrow();
    expect(() => store.startDaily()).toThrow();
    expect(() => store.startRun()).toThrow();
  });
});
```

In allen anderen Testdateien mit `createGameStore` (mindestens `src/ui/App.test.tsx`) das `persistence`-Objekt um denselben `backups`-Stub ergänzen.

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run src/app/game-store.test.ts` → Expected: FAIL (neue Methoden fehlen).

- [ ] **Step 3: Implementierung**

In `src/app/game-store.ts`:

Importe ergänzen:
```ts
import { type DailyResult, dailySpots } from '../game/daily';
import { nextRunSpot } from '../game/endphase-run';
import { answerActiveRun, recordDaily, recordRun, startActiveRun } from '../game/session';
import type { DecisionMode } from '../game/stats';
import { localDateKey } from '../game/streak';
import type { RankName } from '../game/xp';
import { type RunSummary, type SaveState, deserialize, serialize } from '../storage/schema';
```
(bestehende Importe aus `../game/session` und `../storage/schema` entsprechend zusammenführen)

Typen ergänzen:
```ts
export type DailyOutcome = { result: DailyResult; accepted: boolean; isPersonalBest: boolean };
export type RunOutcome = { summary: RunSummary; isPersonalBest: boolean };
export type Session =
  | { kind: 'training' }
  | {
      kind: 'daily';
      dateKey: string;
      spots: Spot[];
      index: number;
      correct: number;
      startedAt: number;
      outcome: DailyOutcome | null;
    }
  | { kind: 'run'; outcome: RunOutcome | null };
```
`GameSnapshot` um `session: Session;` und `celebration: RankName | null;` erweitern; `GameStoreDeps.persistence` auf `Pick<Persistence, 'initial' | 'info' | 'save' | 'backups'>` ändern; `GameStore` um die neuen Methoden erweitern:
```ts
  startTraining(): void;
  startDaily(options?: { restart?: boolean }): void;
  startRun(options?: { restart?: boolean }): void;
  /** Next spot in the current mode; finishes the daily after its last spot. */
  next(): void;
  dismissCelebration(): void;
  exportState(): string;
  /** Validates, backs up the current state, then replaces it. */
  importState(text: string): Promise<void>;
```
Startwerte im Snapshot: `session: { kind: 'training' }`, `celebration: null`.

Hilfsfunktionen in `createGameStore` (nach `commit`):
```ts
  const assertPlayable = () => {
    if (snapshot.info.readOnly) throw new Error('Im Nur-Lesen-Modus nicht möglich');
  };
  const deal = (spot: Spot): TrainingSpot => ({ spot, cards: dealConcrete(spot.hand, rng), shownAt: clock() });
  /** Keeps an unanswered spot but restarts its timer, so time spent elsewhere does not count. */
  const restartTimer = () => {
    if (snapshot.current && !snapshot.last) update({ current: { ...snapshot.current, shownAt: clock() } });
  };
```

`answer` ersetzen durch:
```ts
    answer(action) {
      const current = snapshot.current;
      if (!current) throw new Error('Kein Spot aktiv');
      if (snapshot.last) throw new Error('Dieser Spot ist bereits beantwortet');
      const mode: DecisionMode = snapshot.session.kind;
      const outcome = recordDecision(data, snapshot.save, {
        spot: current.spot,
        chosen: action,
        responseMs: clock() - current.shownAt,
        mode,
        now: now(),
      });
      let save = outcome.state;
      let session = snapshot.session;
      let celebration = outcome.rank.rankUp ? outcome.rank.after : snapshot.celebration;
      if (session.kind === 'daily') {
        session = { ...session, correct: session.correct + (outcome.grade.verdict === 'wrong' ? 0 : 1) };
      } else if (session.kind === 'run') {
        save = answerActiveRun(save, outcome.grade.verdict);
        const run = save.activeRun;
        if (run && run.status !== 'running') {
          const finished = recordRun(save, run, now());
          save = finished.state;
          session = { kind: 'run', outcome: { summary: finished.summary, isPersonalBest: finished.isPersonalBest } };
          if (finished.rank.rankUp) celebration = finished.rank.after;
        }
      }
      const result: AnswerResult = {
        outcome,
        comparison: comparePositions(data, current.spot),
        chart: chart(data, current.spot),
      };
      commit(save, { last: result, session, celebration });
      return result;
    },
```

Neue Methoden im Store-Objekt:
```ts
    startTraining() {
      assertPlayable();
      if (snapshot.session.kind !== 'training') update({ session: { kind: 'training' }, current: null, last: null });
      store.resumeTraining();
    },
    startDaily(options = {}) {
      assertPlayable();
      const dateKey = localDateKey(now());
      const s = snapshot.session;
      if (!options.restart && s.kind === 'daily' && s.dateKey === dateKey) {
        if (!s.outcome) restartTimer();
        return;
      }
      const spots = dailySpots(data, dateKey);
      update({
        session: { kind: 'daily', dateKey, spots, index: 0, correct: 0, startedAt: clock(), outcome: null },
        current: deal(spots[0]),
        last: null,
      });
    },
    startRun(options = {}) {
      assertPlayable();
      const s = snapshot.session;
      if (!options.restart && s.kind === 'run') {
        if (s.outcome) return;
        if (snapshot.current) {
          restartTimer();
          return;
        }
      }
      let save = snapshot.save;
      if (options.restart || save.activeRun === null || save.activeRun.status !== 'running') {
        save = startActiveRun(save);
        persistence.save(save);
      }
      update({
        save,
        status: statusOf(save, now()),
        session: { kind: 'run', outcome: null },
        current: deal(nextRunSpot(data, save.activeRun!, rng)),
        last: null,
      });
    },
    next() {
      const s = snapshot.session;
      if (s.kind === 'training') {
        store.nextTrainingSpot();
        return;
      }
      if (s.kind === 'daily') {
        if (s.outcome) return;
        const index = s.index + 1;
        if (index < s.spots.length) {
          update({ session: { ...s, index }, current: deal(s.spots[index]), last: null });
          return;
        }
        const result: DailyResult = {
          dateKey: s.dateKey,
          correct: s.correct,
          total: s.spots.length,
          durationMs: Math.max(0, Math.round(clock() - s.startedAt)),
        };
        const recorded = recordDaily(snapshot.save, result);
        commit(recorded.state, {
          session: { ...s, outcome: { result, accepted: recorded.accepted, isPersonalBest: recorded.isPersonalBest } },
          current: null,
          last: null,
        });
        return;
      }
      if (s.outcome) {
        update({ current: null, last: null });
        return;
      }
      const run = snapshot.save.activeRun;
      if (!run) throw new Error('Kein laufender Run vorhanden');
      update({ current: deal(nextRunSpot(data, run, rng)), last: null });
    },
    dismissCelebration() {
      update({ celebration: null });
    },
    exportState() {
      return serialize(snapshot.save);
    },
    async importState(text) {
      const imported = deserialize(text);
      await persistence.backups.create(serialize(snapshot.save));
      commit(imported, { session: { kind: 'training' }, current: null, last: null });
    },
```

In `adoptSavedState` zusätzlich `session: { kind: 'training' }` setzen.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/app` → Expected: alle PASS. Run: `npm test` und `npm run typecheck` → Expected: PASS bzw. Exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/game-store.ts src/app/game-store.test.ts src/ui/App.test.tsx
git commit -m "feat(app): Store mit Daily Challenge, Endphase-Run, Rangaufstieg und Import/Export"
```
(Weitere angepasste Testdateien explizit mit aufnehmen.)

---

### Task 3: Kopfzeile je Modus, Ergebnis-Karte und Test-Helfer

**Files:**
- Create: `src/ui/components/SessionHeader.tsx`, `src/ui/components/ResultCard.tsx`, `src/ui/components/session.css`, `src/ui/test-utils.tsx`
- Test: `src/ui/components/SessionHeader.test.tsx`, `src/ui/components/ResultCard.test.tsx`

**Interfaces:**
- Consumes: `Session`, `DailyOutcome`, `RunOutcome`, `createGameStore`, `GameStore`; `RunState`, `RUN_LEVEL_STACKS`, `RUN_SPOTS_PER_LEVEL`, `RUN_LIVES`, `RUN_FIELD`; `GameProvider`
- Produces:
  - `SessionHeader({ session, activeRun })` — `null` bei Training; Daily: „Daily Challenge · Spot <i>/<n> · <richtig> richtig“; Run (läuft): „Level <l>/8 · <Stack> BB · Spot <s>/5“ plus Herzen (`aria-label` „Leben: <x> von 3“); Run ohne aktiven Run: „Endphase-Run beendet“
  - `formatDuration(ms: number): string` → `"1:05"` (Minuten:Sekunden)
  - `ResultCard({ session, onRestart, onHome })` für Daily- und Run-Sessions mit `outcome`
    - Daily: Überschrift „Daily Challenge geschafft“, „<x> von <n> richtig“, „Zeit: <m:ss>“, bei `accepted && isPersonalBest` „Neue Bestleistung!“, bei `!accepted` „Heute bereits gewertet – dieser Durchgang zählt nicht.“, Buttons „Nochmal üben“ und „Zum Menü“
    - Run: Überschrift „Final Table erreicht!“ bzw. „Ausgeschieden“, „Platz <n> von 2.000“, „<k> von 8 Leveln geschafft · +<b> Bonus-XP“, bei `isPersonalBest` „Neue Bestplatzierung!“, Buttons „Neuer Run“ und „Zum Menü“
  - `renderWithStore(ui, options?: { initial?: SaveState; info?: Partial<PersistenceInfo>; backupKeys?: string[] })` in `src/ui/test-utils.tsx` → Render-Ergebnis plus `{ store, save, create, remove, data }` (Fixture-Daten `(84 - h) / 10`, Seed 4, Uhr fest auf 13.10.2026 18:00, `clock` = 0; `backups.read` liefert immer `'{"gesichert":true}'`)

- [ ] **Step 1: Test-Helfer schreiben**

`src/ui/test-utils.tsx`:
```tsx
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { createGameStore } from '../app/game-store';
import type { PersistenceInfo } from '../app/persistence';
import { mulberry32 } from '../engine/rng';
import { makeFixture } from '../engine/test-fixtures';
import { emptyState, type SaveState } from '../storage/schema';
import { GameProvider } from './GameContext';

const baseInfo: PersistenceInfo = { mode: 'indexeddb', readOnly: false, otherTabActive: false, corruptBackup: null };

export function renderWithStore(
  ui: ReactElement,
  options: { initial?: SaveState; info?: Partial<PersistenceInfo>; backupKeys?: string[] } = {},
) {
  const save = vi.fn();
  const create = vi.fn(async () => 'corrupt-backup:2026-10-13T16:00:00.000Z');
  const remove = vi.fn(async () => {});
  const data = makeFixture((h) => (84 - h) / 10);
  const store = createGameStore({
    data,
    persistence: {
      initial: options.initial ?? emptyState(),
      info: { ...baseInfo, ...options.info },
      save,
      backups: {
        list: async () => options.backupKeys ?? [],
        read: async () => '{"gesichert":true}',
        remove,
        create,
      },
    },
    rng: mulberry32(4),
    now: () => new Date(2026, 9, 13, 18, 0),
    clock: () => 0,
  });
  const result = render(<GameProvider store={store}>{ui}</GameProvider>);
  return { ...result, store, save, create, remove, data };
}
```

- [ ] **Step 2: Failing Tests schreiben**

`src/ui/components/SessionHeader.test.tsx`:
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { startRun } from '../../game/endphase-run';
import { SessionHeader } from './SessionHeader';

describe('SessionHeader', () => {
  it('shows nothing for training', () => {
    const { container } = render(<SessionHeader session={{ kind: 'training' }} activeRun={null} />);
    expect(container.textContent).toBe('');
  });

  it('shows the daily progress', () => {
    render(
      <SessionHeader
        session={{ kind: 'daily', dateKey: '2026-10-13', spots: new Array(20).fill(null), index: 6, correct: 5, startedAt: 0, outcome: null }}
        activeRun={null}
      />,
    );
    expect(screen.getByText('Daily Challenge · Spot 7/20 · 5 richtig')).toBeTruthy();
  });

  it('shows level, stack, spot and lives of a running run', () => {
    render(<SessionHeader session={{ kind: 'run', outcome: null }} activeRun={{ ...startRun(), levelIndex: 2, spotInLevel: 3, lives: 2 }} />);
    expect(screen.getByText('Level 3/8 · 14 BB · Spot 4/5')).toBeTruthy();
    expect(screen.getByLabelText('Leben: 2 von 3').textContent).toBe('♥♥♡');
  });

  it('marks a finished run', () => {
    render(<SessionHeader session={{ kind: 'run', outcome: null }} activeRun={null} />);
    expect(screen.getByText('Endphase-Run beendet')).toBeTruthy();
  });
});
```

`src/ui/components/ResultCard.test.tsx`:
```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultCard, formatDuration } from './ResultCard';

const daily = (accepted: boolean, isPersonalBest: boolean) => ({
  kind: 'daily' as const,
  dateKey: '2026-10-13',
  spots: [],
  index: 19,
  correct: 17,
  startedAt: 0,
  outcome: { result: { dateKey: '2026-10-13', correct: 17, total: 20, durationMs: 65_400 }, accepted, isPersonalBest },
});

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(65_400)).toBe('1:05');
    expect(formatDuration(9_000)).toBe('0:09');
    expect(formatDuration(600_000)).toBe('10:00');
  });
});

describe('ResultCard', () => {
  it('shows a daily result with personal best and buttons', () => {
    const onRestart = vi.fn();
    const onHome = vi.fn();
    render(<ResultCard session={daily(true, true)} onRestart={onRestart} onHome={onHome} />);
    expect(screen.getByRole('heading', { name: 'Daily Challenge geschafft' })).toBeTruthy();
    expect(screen.getByText('17 von 20 richtig')).toBeTruthy();
    expect(screen.getByText('Zeit: 1:05')).toBeTruthy();
    expect(screen.getByText('Neue Bestleistung!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nochmal üben' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zum Menü' }));
    expect(onRestart).toHaveBeenCalledOnce();
    expect(onHome).toHaveBeenCalledOnce();
  });

  it('explains a repeated daily that does not count', () => {
    render(<ResultCard session={daily(false, false)} onRestart={() => {}} onHome={() => {}} />);
    expect(screen.getByText('Heute bereits gewertet – dieser Durchgang zählt nicht.')).toBeTruthy();
    expect(screen.queryByText('Neue Bestleistung!')).toBeNull();
  });

  it('shows a run result', () => {
    const summary = { ts: 1, dateKey: '2026-10-13', placement: 1147, finalTable: false, levelsCompleted: 3, bonusXp: 30 };
    render(<ResultCard session={{ kind: 'run', outcome: { summary, isPersonalBest: true } }} onRestart={() => {}} onHome={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Ausgeschieden' })).toBeTruthy();
    expect(screen.getByText('Platz 1.147 von 2.000')).toBeTruthy();
    expect(screen.getByText('3 von 8 Leveln geschafft · +30 Bonus-XP')).toBeTruthy();
    expect(screen.getByText('Neue Bestplatzierung!')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Neuer Run' })).toBeTruthy();
  });

  it('celebrates the final table', () => {
    const summary = { ts: 1, dateKey: '2026-10-13', placement: 1, finalTable: true, levelsCompleted: 8, bonusXp: 180 };
    render(<ResultCard session={{ kind: 'run', outcome: { summary, isPersonalBest: false } }} onRestart={() => {}} onHome={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Final Table erreicht!' })).toBeTruthy();
    expect(screen.getByText('Platz 1 von 2.000')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run src/ui/components/SessionHeader.test.tsx src/ui/components/ResultCard.test.tsx` → Expected: FAIL, Module nicht gefunden.

- [ ] **Step 4: Implementierung**

`src/ui/components/SessionHeader.tsx`:
```tsx
import type { Session } from '../../app/game-store';
import { RUN_LEVEL_STACKS, RUN_LIVES, RUN_SPOTS_PER_LEVEL, type RunState } from '../../game/endphase-run';
import './session.css';

export function SessionHeader({ session, activeRun }: { session: Session; activeRun: RunState | null }) {
  if (session.kind === 'training') return null;
  if (session.kind === 'daily') {
    return (
      <p className="session-header panel">
        Daily Challenge · Spot {Math.min(session.index + 1, session.spots.length)}/{session.spots.length} · {session.correct}{' '}
        richtig
      </p>
    );
  }
  if (!activeRun || activeRun.status !== 'running') {
    return <p className="session-header panel">Endphase-Run beendet</p>;
  }
  const hearts = '♥'.repeat(activeRun.lives) + '♡'.repeat(RUN_LIVES - activeRun.lives);
  return (
    <div className="session-header panel session-header--run">
      <span>
        Level {activeRun.levelIndex + 1}/{RUN_LEVEL_STACKS.length} · {RUN_LEVEL_STACKS[activeRun.levelIndex]} BB · Spot{' '}
        {Math.min(activeRun.spotInLevel + 1, RUN_SPOTS_PER_LEVEL)}/{RUN_SPOTS_PER_LEVEL}
      </span>
      <span className="session-header__lives" aria-label={`Leben: ${activeRun.lives} von ${RUN_LIVES}`}>
        {hearts}
      </span>
    </div>
  );
}
```

`src/ui/components/ResultCard.tsx`:
```tsx
import type { Session } from '../../app/game-store';
import { RUN_FIELD, RUN_LEVEL_STACKS } from '../../game/endphase-run';
import './session.css';

const count = new Intl.NumberFormat('de-DE');

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

type Props = { session: Session; onRestart: () => void; onHome: () => void };

export function ResultCard({ session, onRestart, onHome }: Props) {
  if (session.kind === 'training' || !session.outcome) return null;
  const buttons = (restartLabel: string) => (
    <div className="result-card__buttons">
      <button type="button" className="btn btn--gold" onClick={onRestart}>
        {restartLabel}
      </button>
      <button type="button" className="btn" onClick={onHome}>
        Zum Menü
      </button>
    </div>
  );

  if (session.kind === 'daily') {
    const { result, accepted, isPersonalBest } = session.outcome;
    return (
      <section className="result-card panel">
        <h2 className="result-card__title">Daily Challenge geschafft</h2>
        <p className="result-card__big">
          {result.correct} von {result.total} richtig
        </p>
        <p className="muted">Zeit: {formatDuration(result.durationMs)}</p>
        {accepted && isPersonalBest && <p className="result-card__badge">Neue Bestleistung!</p>}
        {!accepted && <p className="muted">Heute bereits gewertet – dieser Durchgang zählt nicht.</p>}
        {buttons('Nochmal üben')}
      </section>
    );
  }

  const { summary, isPersonalBest } = session.outcome;
  return (
    <section className="result-card panel">
      <h2 className="result-card__title">{summary.finalTable ? 'Final Table erreicht!' : 'Ausgeschieden'}</h2>
      <p className="result-card__big">
        Platz {count.format(summary.placement)} von {count.format(RUN_FIELD)}
      </p>
      <p className="muted">
        {summary.levelsCompleted} von {RUN_LEVEL_STACKS.length} Leveln geschafft · +{summary.bonusXp} Bonus-XP
      </p>
      {isPersonalBest && <p className="result-card__badge">Neue Bestplatzierung!</p>}
      {buttons('Neuer Run')}
    </section>
  );
}
```

`src/ui/components/session.css`:
```css
.session-header {
  margin: 0;
  padding: 10px 14px;
  font-weight: 600;
  text-align: center;
}

.session-header--run {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.session-header__lives {
  color: var(--danger);
  font-size: 20px;
  letter-spacing: 2px;
}

.result-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: center;
}

.result-card p {
  margin: 0;
}

.result-card__title {
  margin: 0;
  font-size: 22px;
  color: var(--gold);
}

.result-card__big {
  font-size: 24px;
  font-weight: 700;
}

.result-card__badge {
  align-self: center;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--gold);
  color: var(--gold-ink);
  font-weight: 700;
}

.result-card__buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 8px;
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run src/ui/components` → Expected: alle PASS. Run: `npm run typecheck` → Exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui/test-utils.tsx src/ui/components/SessionHeader.tsx src/ui/components/SessionHeader.test.tsx src/ui/components/ResultCard.tsx src/ui/components/ResultCard.test.tsx src/ui/components/session.css
git commit -m "feat(ui): Kopfzeile für Daily und Run, Ergebnis-Karte und Test-Helfer"
```

---

### Task 4: Statistik-Bildschirm

**Files:**
- Create: `src/ui/screens/StatsScreen.tsx`, `src/ui/components/ErrorHeatmap.tsx`, `src/ui/components/TrendChart.tsx`, `src/ui/screens/stats.css`
- Modify: `src/ui/theme.css` (Tokens `--heat-low`, `--heat-high`)
- Test: `src/ui/screens/StatsScreen.test.tsx`

**Interfaces:**
- Consumes: `useGame`; `accuracy`, `accuracyBy`, `byPosition`, `byStackBucket`, `byKind`, `handErrorMatrix`, `weeklyTrend`, `DecisionRecord`, `Accuracy`, `WeekPoint`; `POSITIONS`, `POSITION_LABELS`; `STACK_BUCKETS`, `SpotKind`; `handName`; `formatPercent`; `localDateKey`; `bestDaily`
- Produces:
  - `ErrorHeatmap({ total, errors })` — 169 Zellen mit Handnamen; ungespielt: Klasse `heat--none`, `title` „<Hand>: noch nicht gespielt“; sonst Hintergrund per `color-mix` zwischen `--heat-low` (0 % Fehler) und `--heat-high` (100 % Fehler), `title` „<Hand>: <f> von <n> falsch“
  - `TrendChart({ points })` — SVG-Balken (`role="img"`, `aria-label` „Trefferquote der letzten 8 Wochen“), Prozent über dem Balken, Beschriftung `TT.MM.` des Wochenbeginns darunter, Woche ohne Daten: kein Balken, „–“
  - `StatsScreen({ onBack })`:
    - ohne Entscheidungen: Text „Noch keine Entscheidungen. Spiel ein paar Spots, dann siehst du hier deine Stärken und Schwächen.“
    - Kacheln: „Trefferquote“ (gesamt), „Entscheidungen“ (Anzahl), „Ø Antwortzeit“ (Sekunden mit einer Nachkommastelle, z. B. „3,2 s“)
    - Tabellen mit Überschrift „Nach Position“, „Nach Stack“, „Nach Spot-Typ“ (Spalten: Bereich, Spots, Trefferquote; nur Zeilen mit Daten; schwächste Zeile mit Klasse `stats-row--weakest`, wenn mindestens 2 Zeilen)
    - „Fehler-Heatmap“ mit Umschalter „Open-Shove“ / „Call vs. Shove“ (Buttons mit `aria-pressed`)
    - „Verlauf“ mit `TrendChart`
    - „Endphase-Run“: „Beste Platzierung: Platz <n>“ oder „Noch kein Run gespielt“ und die letzten 5 Runs „TT.MM.: Platz <n>“
    - „Daily Challenge“: die letzten 7 Ergebnisse „TT.MM.: <x>/<n>“ (neueste zuerst) oder „Noch keine Daily gespielt“

- [ ] **Step 1: Tokens ergänzen**

In `src/ui/theme.css` im `:root`-Block ergänzen:
```css
  --heat-low: #24493a;
  --heat-high: #c0392b;
```

- [ ] **Step 2: Failing Test schreiben**

`src/ui/screens/StatsScreen.test.tsx`:
```tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseHand } from '../../engine/cards';
import type { Spot, Verdict } from '../../engine/pushfold';
import type { DecisionRecord } from '../../game/stats';
import { emptyState, type SaveState } from '../../storage/schema';
import { renderWithStore } from '../test-utils';
import { StatsScreen } from './StatsScreen';

let ts = 0;
const rec = (spot: Spot, verdict: Verdict, dateKey = '2026-10-13', responseMs = 3000): DecisionRecord => ({
  ts: ++ts, dateKey, mode: 'training', spot, chosen: 'fold', verdict, responseMs,
});
const open = (position: 'BTN' | 'UTG', stack: number, hand = 'A7o'): Spot => ({ kind: 'open', position, stack, hand: parseHand(hand) });
const call: Spot = { kind: 'call', shover: 'SB', position: 'BB', stack: 12, hand: parseHand('K9o') };

function state(): SaveState {
  return {
    ...emptyState(),
    decisions: [
      rec(open('BTN', 10), 'wrong', '2026-10-13', 2000),
      rec(open('BTN', 10), 'correct', '2026-10-13', 4000),
      rec(open('UTG', 4), 'correct'),
      rec(call, 'wrong', '2026-10-06'),
    ],
    daily: {
      '2026-10-12': { dateKey: '2026-10-12', correct: 15, total: 20, durationMs: 90_000 },
      '2026-10-13': { dateKey: '2026-10-13', correct: 18, total: 20, durationMs: 80_000 },
    },
    runs: [{ ts: 5, dateKey: '2026-10-12', placement: 312, finalTable: false, levelsCompleted: 6, bonusXp: 60 }],
    bestRun: { ts: 5, dateKey: '2026-10-12', placement: 312, finalTable: false, levelsCompleted: 6, bonusXp: 60 },
  };
}

describe('StatsScreen', () => {
  it('invites to play when there is no data', () => {
    renderWithStore(<StatsScreen onBack={() => {}} />);
    expect(screen.getByText(/Noch keine Entscheidungen/)).toBeTruthy();
  });

  it('shows totals, tables, heatmap, runs and dailies', () => {
    renderWithStore(<StatsScreen onBack={() => {}} />, { initial: state() });
    expect(screen.getByText('50 %')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('3,0 s')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nach Position' })).toBeTruthy();
    const btnRow = screen.getByRole('row', { name: /BTN/ });
    expect(btnRow.textContent).toContain('2');
    expect(screen.getByTitle('A7o: 1 von 3 falsch')).toBeTruthy();
    expect(screen.getByTitle('AA: noch nicht gespielt').className).toContain('heat--none');
    fireEvent.click(screen.getByRole('button', { name: 'Call vs. Shove' }));
    expect(screen.getByTitle('K9o: 1 von 1 falsch')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Call vs. Shove' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('img', { name: 'Trefferquote der letzten 8 Wochen' })).toBeTruthy();
    expect(screen.getByText('Beste Platzierung: Platz 312')).toBeTruthy();
    expect(screen.getByText('12.10.: Platz 312')).toBeTruthy();
    const dailies = screen.getAllByText(/^1[0-9]\.10\.: \d+\/20$/).map((el) => el.textContent);
    expect(dailies).toEqual(['13.10.: 18/20', '12.10.: 15/20']);
  });
});
```

- [ ] **Step 3: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/ui/screens/StatsScreen.test.tsx` → Expected: FAIL, Modul nicht gefunden.

- [ ] **Step 4: Implementierung**

`src/ui/components/ErrorHeatmap.tsx`:
```tsx
import { handName } from '../../engine/cards';

export function ErrorHeatmap({ total, errors }: { total: readonly number[]; errors: readonly number[] }) {
  return (
    <div className="heatmap">
      {total.map((n, hand) => {
        if (n === 0) {
          return (
            <div key={hand} className="heatmap__cell heat--none" title={`${handName(hand)}: noch nicht gespielt`}>
              {handName(hand)}
            </div>
          );
        }
        const percent = Math.round((errors[hand] / n) * 100);
        return (
          <div
            key={hand}
            className="heatmap__cell"
            title={`${handName(hand)}: ${errors[hand]} von ${n} falsch`}
            style={{ background: `color-mix(in srgb, var(--heat-high) ${percent}%, var(--heat-low))` }}
          >
            {handName(hand)}
          </div>
        );
      })}
    </div>
  );
}
```

`src/ui/components/TrendChart.tsx`:
```tsx
import type { WeekPoint } from '../../game/stats';

const WIDTH = 320;
const HEIGHT = 150;
const CHART_TOP = 20;
const CHART_BOTTOM = 120;
const BAR = 26;

const shortDate = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}.`;

export function TrendChart({ points }: { points: readonly WeekPoint[] }) {
  const slot = WIDTH / points.length;
  return (
    <svg className="trend-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Trefferquote der letzten 8 Wochen">
      <line x1="0" y1={CHART_BOTTOM} x2={WIDTH} y2={CHART_BOTTOM} className="trend-chart__axis" />
      {points.map((p, i) => {
        const x = i * slot + (slot - BAR) / 2;
        const rate = p.accuracy.rate;
        const height = rate === null ? 0 : rate * (CHART_BOTTOM - CHART_TOP);
        return (
          <g key={p.weekStart}>
            {rate !== null && (
              <rect x={x} y={CHART_BOTTOM - height} width={BAR} height={height} rx="3" className="trend-chart__bar" />
            )}
            <text x={x + BAR / 2} y={CHART_BOTTOM - height - 5} textAnchor="middle" className="trend-chart__value">
              {rate === null ? '–' : `${Math.round(rate * 100)}`}
            </text>
            <text x={x + BAR / 2} y={HEIGHT - 12} textAnchor="middle" className="trend-chart__label">
              {shortDate(p.weekStart)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

`src/ui/screens/StatsScreen.tsx`:
```tsx
import { useState } from 'react';
import { formatPercent } from '../../app/format';
import { POSITIONS, POSITION_LABELS } from '../../engine/positions';
import { STACK_BUCKETS, type SpotKind } from '../../engine/spot-generator';
import {
  type Accuracy,
  accuracy,
  accuracyBy,
  byKind,
  byPosition,
  byStackBucket,
  handErrorMatrix,
  weeklyTrend,
} from '../../game/stats';
import { localDateKey } from '../../game/streak';
import { ErrorHeatmap } from '../components/ErrorHeatmap';
import { TrendChart } from '../components/TrendChart';
import { useGame } from '../GameContext';
import './screens.css';
import './stats.css';

const KIND_LABELS: Record<SpotKind, string> = { open: 'Open-Shove', call: 'Call vs. Shove' };
const seconds = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const shortDate = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}.`;

type Row = { label: string; accuracy: Accuracy };

function AccuracyTable({ title, rows }: { title: string; rows: Row[] }) {
  const filled = rows.filter((r) => r.accuracy.total > 0);
  let weakest = -1;
  if (filled.length >= 2) {
    filled.forEach((r, i) => {
      if (weakest < 0 || (r.accuracy.rate ?? 1) < (filled[weakest].accuracy.rate ?? 1)) weakest = i;
    });
  }
  return (
    <section className="panel stats-section">
      <h3 className="stats-section__title">{title}</h3>
      <table className="stats-table">
        <thead>
          <tr>
            <th scope="col">Bereich</th>
            <th scope="col">Spots</th>
            <th scope="col">Trefferquote</th>
          </tr>
        </thead>
        <tbody>
          {filled.map((r, i) => (
            <tr key={r.label} className={i === weakest ? 'stats-row--weakest' : undefined}>
              <th scope="row">{r.label}</th>
              <td>{r.accuracy.total}</td>
              <td>{formatPercent(r.accuracy.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function StatsScreen({ onBack }: { onBack: () => void }) {
  const game = useGame();
  const [kind, setKind] = useState<SpotKind>('open');
  const records = game.save.decisions;

  const header = (
    <div className="screen-header">
      <button type="button" className="btn btn--ghost" onClick={onBack}>
        ← Menü
      </button>
      <span className="muted">Statistik</span>
    </div>
  );
  if (records.length === 0) {
    return (
      <>
        {header}
        <p className="panel">Noch keine Entscheidungen. Spiel ein paar Spots, dann siehst du hier deine Stärken und Schwächen.</p>
      </>
    );
  }

  const total = accuracy(records);
  const avgMs = records.reduce((sum, r) => sum + r.responseMs, 0) / records.length;
  const positions = accuracyBy(records, byPosition);
  const buckets = accuracyBy(records, byStackBucket);
  const kinds = accuracyBy(records, byKind);
  const matrix = handErrorMatrix(records, kind);
  const trend = weeklyTrend(records, localDateKey(new Date()));
  const recentRuns = [...game.save.runs].reverse().slice(0, 5);
  const recentDailies = Object.values(game.save.daily)
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
    .slice(0, 7);
  const empty: Accuracy = { correct: 0, total: 0, rate: null };

  return (
    <>
      {header}
      <section className="stats-tiles">
        <div className="panel stats-tile">
          <span className="muted">Trefferquote</span>
          <strong>{formatPercent(total.rate)}</strong>
        </div>
        <div className="panel stats-tile">
          <span className="muted">Entscheidungen</span>
          <strong>{total.total}</strong>
        </div>
        <div className="panel stats-tile">
          <span className="muted">Ø Antwortzeit</span>
          <strong>{seconds.format(avgMs / 1000)} s</strong>
        </div>
      </section>
      <AccuracyTable
        title="Nach Position"
        rows={POSITIONS.map((p) => ({ label: POSITION_LABELS[p], accuracy: positions.get(p) ?? empty }))}
      />
      <AccuracyTable
        title="Nach Stack"
        rows={STACK_BUCKETS.map((b) => ({ label: `${b} BB`, accuracy: buckets.get(b) ?? empty }))}
      />
      <AccuracyTable
        title="Nach Spot-Typ"
        rows={(['open', 'call'] as const).map((k) => ({ label: KIND_LABELS[k], accuracy: kinds.get(k) ?? empty }))}
      />
      <section className="panel stats-section">
        <h3 className="stats-section__title">Fehler-Heatmap</h3>
        <div className="stats-toggle">
          {(['open', 'call'] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`btn${kind === k ? ' btn--gold' : ''}`}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <ErrorHeatmap total={matrix.total} errors={matrix.errors} />
      </section>
      <section className="panel stats-section">
        <h3 className="stats-section__title">Verlauf</h3>
        <TrendChart points={trend} />
      </section>
      <section className="panel stats-section">
        <h3 className="stats-section__title">Endphase-Run</h3>
        {game.save.bestRun ? (
          <p>Beste Platzierung: Platz {game.save.bestRun.placement}</p>
        ) : (
          <p className="muted">Noch kein Run gespielt</p>
        )}
        <ul className="stats-list">
          {recentRuns.map((r) => (
            <li key={r.ts}>
              {shortDate(r.dateKey)}: Platz {r.placement}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel stats-section">
        <h3 className="stats-section__title">Daily Challenge</h3>
        {recentDailies.length === 0 ? (
          <p className="muted">Noch keine Daily gespielt</p>
        ) : (
          <ul className="stats-list">
            {recentDailies.map((d) => (
              <li key={d.dateKey}>
                {shortDate(d.dateKey)}: {d.correct}/{d.total}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
```

`src/ui/screens/stats.css`:
```css
.stats-tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.stats-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  font-size: 13px;
}

.stats-tile strong {
  font-size: 20px;
  color: var(--gold);
}

.stats-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stats-section p {
  margin: 0;
}

.stats-section__title {
  margin: 0;
  font-size: 16px;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.stats-table th,
.stats-table td {
  padding: 6px 4px;
  text-align: left;
  border-bottom: 1px solid rgba(243, 233, 198, 0.12);
}

.stats-table td {
  font-variant-numeric: tabular-nums;
}

.stats-row--weakest th,
.stats-row--weakest td {
  color: var(--danger);
  font-weight: 700;
}

.stats-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.stats-list {
  margin: 0;
  padding-left: 18px;
}

.heatmap {
  display: grid;
  grid-template-columns: repeat(13, minmax(0, 1fr));
  gap: 2px;
}

.heatmap__cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(7px, 2.1vw, 11px);
  font-weight: 600;
  border-radius: 2px;
  color: #ffffff;
}

.heat--none {
  background: var(--felt-dark);
  color: rgba(243, 233, 198, 0.35);
}

.trend-chart {
  width: 100%;
  height: auto;
}

.trend-chart__axis {
  stroke: rgba(243, 233, 198, 0.3);
}

.trend-chart__bar {
  fill: var(--gold);
}

.trend-chart__value,
.trend-chart__label {
  fill: var(--cream-muted);
  font-size: 11px;
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run src/ui/screens/StatsScreen.test.tsx` → Expected: PASS. Run: `npm test`, `npm run typecheck` → PASS bzw. Exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui/theme.css src/ui/components/ErrorHeatmap.tsx src/ui/components/TrendChart.tsx src/ui/screens/StatsScreen.tsx src/ui/screens/StatsScreen.test.tsx src/ui/screens/stats.css
git commit -m "feat(ui): Statistik mit Trefferquoten, Fehler-Heatmap, Verlauf, Runs und Dailies"
```

---

### Task 5: Einstellungen mit Sound, Export/Import und Sicherungen

**Files:**
- Create: `src/ui/screens/SettingsScreen.tsx`, `src/ui/screens/settings.css`
- Modify: `src/app/game-store.ts` (Methode `getBackups`)
- Test: `src/ui/screens/SettingsScreen.test.tsx`, `src/app/game-store.test.ts` (ein Test ergänzen)

**Interfaces:**
- Consumes: `useGame`, `useGameStore`; `downloadText`; `localDateKey`; `BACKUP_PREFIX`; `BackupApi`
- Produces:
  - `GameStore.getBackups(): BackupApi` (reicht `persistence.backups` durch)
  - `SettingsScreen({ onBack })`:
    - Abschnitt „Sound“: Checkbox „Sounds abspielen“ (gebunden an `profile.soundOn`, ruft `setSound`; deaktiviert bei `readOnly`)
    - Abschnitt „Spielstand“: Erklärtext; Button „Exportieren“ → `downloadText('poker-trainer-spielstand-<YYYY-MM-DD>.json', store.exportState())`; Button „Importieren“ öffnet ein verstecktes Datei-Feld (`aria-label` „Spielstand-Datei“, `accept=".json,application/json"`), nach Bestätigung per `window.confirm('Aktuellen Spielstand ersetzen? Er wird vorher als Sicherung abgelegt.')` → `store.importState(text)`; Meldung in `role="status"`: „Spielstand importiert.“ bzw. „Import fehlgeschlagen: <Meldung>“; Import deaktiviert, wenn `readOnly` oder `otherTabActive`, mit Hinweis „Import ist nur in dem Tab möglich, der deinen Fortschritt speichert.“
    - Abschnitt „Sicherungen“: Liste aus `getBackups().list()` (neueste zuerst), Beschriftung „Sicherung vom <Datum, Uhrzeit>“ (`toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })` aus dem ISO-Teil des Schlüssels), je Eintrag Buttons „Herunterladen“ (`poker-trainer-sicherung-<YYYY-MM-DD>.json`) und „Löschen“ (nach `window.confirm('Diese Sicherung endgültig löschen?')`); leer: „Keine Sicherungen vorhanden.“
    - Abschnitt „Über“: „Push/Fold-Ranges aus einem Nash-Gleichgewicht in chip-EV · 8-max · Big-Blind-Ante · 1–20 BB.“

- [ ] **Step 1: Failing Tests schreiben**

In `src/app/game-store.test.ts` ergänzen:
```ts
describe('getBackups', () => {
  it('exposes the persistence backups', async () => {
    const { store, create } = setup();
    await store.getBackups().create('{}');
    expect(create).toHaveBeenCalledWith('{}');
  });
});
```

`src/ui/screens/SettingsScreen.test.tsx`:
```tsx
// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyState, serialize } from '../../storage/schema';
import { downloadText } from '../download';
import { renderWithStore } from '../test-utils';
import { SettingsScreen } from './SettingsScreen';

vi.mock('../download', () => ({ downloadText: vi.fn() }));

afterEach(() => {
  vi.mocked(downloadText).mockReset();
  vi.restoreAllMocks();
});

const file = (text: string) => new File([text], 'spielstand.json', { type: 'application/json' });

describe('SettingsScreen', () => {
  it('toggles sounds', () => {
    const { store } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    fireEvent.click(screen.getByLabelText('Sounds abspielen'));
    expect(store.getSnapshot().save.profile.soundOn).toBe(false);
  });

  it('exports the save as a dated JSON file', () => {
    renderWithStore(<SettingsScreen onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportieren' }));
    expect(downloadText).toHaveBeenCalledWith(expect.stringMatching(/^poker-trainer-spielstand-\d{4}-\d{2}-\d{2}\.json$/), serialize(emptyState()));
  });

  it('imports a save after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const imported = { ...emptyState(), profile: { xp: 900, combo: 0, soundOn: true } };
    const { store, create } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file(serialize(imported))] } });
    expect(await screen.findByText('Spielstand importiert.')).toBeTruthy();
    expect(create).toHaveBeenCalledWith(serialize(emptyState()));
    expect(store.getSnapshot().save.profile.xp).toBe(900);
  });

  it('reports an invalid file', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithStore(<SettingsScreen onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file('{kaputt')] } });
    expect(await screen.findByText(/^Import fehlgeschlagen: Spielstand nicht lesbar/)).toBeTruthy();
  });

  it('does nothing when the import is not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { create } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file(serialize(emptyState()))] } });
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(create).not.toHaveBeenCalled();
  });

  it('lists, downloads and deletes backups', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const key = 'corrupt-backup:2026-10-13T12:00:00.000Z';
    const { remove } = renderWithStore(<SettingsScreen onBack={() => {}} />, { backupKeys: [key] });
    expect(await screen.findByText(/^Sicherung vom /)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalledWith('poker-trainer-sicherung-2026-10-13.json', '{"gesichert":true}'));
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(key));
  });

  it('shows an empty backup list and blocks import in a reading tab', async () => {
    renderWithStore(<SettingsScreen onBack={() => {}} />, { info: { otherTabActive: true } });
    expect(await screen.findByText('Keine Sicherungen vorhanden.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Importieren' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Import ist nur in dem Tab möglich, der deinen Fortschritt speichert.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run src/ui/screens/SettingsScreen.test.tsx src/app/game-store.test.ts` → Expected: FAIL.

- [ ] **Step 3: Implementierung**

In `src/app/game-store.ts`: `import type { BackupApi, Persistence, PersistenceInfo } from './persistence';`, in `GameStore` ergänzen `getBackups(): BackupApi;` und im Store-Objekt:
```ts
    getBackups() {
      return persistence.backups;
    },
```

`src/ui/screens/SettingsScreen.tsx`:
```tsx
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { localDateKey } from '../../game/streak';
import { BACKUP_PREFIX } from '../../storage/store';
import { downloadText } from '../download';
import { useGame, useGameStore } from '../GameContext';
import './screens.css';
import './settings.css';

function backupLabel(key: string): string {
  const date = new Date(key.slice(BACKUP_PREFIX.length));
  if (Number.isNaN(date.getTime())) return key;
  return `Sicherung vom ${date.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}`;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const store = useGameStore();
  const game = useGame();
  const [keys, setKeys] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canWrite = !game.info.readOnly && !game.info.otherTabActive;

  const refresh = useCallback(async () => {
    const list = await store.getBackups().list();
    setKeys([...list].reverse());
  }, [store]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const exportNow = () =>
    downloadText(`poker-trainer-spielstand-${localDateKey(new Date())}.json`, store.exportState());

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;
    if (!window.confirm('Aktuellen Spielstand ersetzen? Er wird vorher als Sicherung abgelegt.')) return;
    try {
      await store.importState(await chosen.text());
      setMessage('Spielstand importiert.');
      await refresh();
    } catch (error) {
      setMessage(`Import fehlgeschlagen: ${errorText(error)}`);
    }
  };

  const download = async (key: string) => {
    const raw = await store.getBackups().read(key);
    if (raw !== undefined) {
      downloadText(`poker-trainer-sicherung-${key.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 10)}.json`, raw);
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
            disabled={game.info.readOnly}
            onChange={(event) => store.setSound(event.target.checked)}
          />
          Sounds abspielen
        </label>
      </section>

      <section className="panel settings-section">
        <h3 className="settings-section__title">Spielstand</h3>
        <p className="muted">
          Exportiere deinen Spielstand als Datei, um ihn zu sichern oder auf ein anderes Gerät zu übertragen.
        </p>
        <div className="settings-buttons">
          <button type="button" className="btn" onClick={exportNow}>
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
```

Falls jsdom `File.prototype.text` nicht kennt (Test schlägt mit „text is not a function“ fehl): eine kleine Hilfsfunktion `readText(file)` mit `FileReader` als Rückfall in `SettingsScreen.tsx` ergänzen und statt `chosen.text()` verwenden.

`src/ui/screens/settings.css`:
```css
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-section p {
  margin: 0;
}

.settings-section__title {
  margin: 0;
  font-size: 16px;
}

.settings-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-size: 16px;
}

.settings-switch input {
  width: 22px;
  height: 22px;
  accent-color: var(--gold);
}

.settings-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.settings-file {
  display: none;
}

.settings-backups {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-backups li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 14px;
}

.settings-backups__actions {
  display: flex;
  gap: 4px;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/ui/screens/SettingsScreen.test.tsx src/app/game-store.test.ts` → Expected: PASS. Run: `npm test`, `npm run typecheck` → PASS bzw. Exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/game-store.ts src/app/game-store.test.ts src/ui/screens/SettingsScreen.tsx src/ui/screens/SettingsScreen.test.tsx src/ui/screens/settings.css
git commit -m "feat(ui): Einstellungen mit Sound, Export/Import und Sicherungen"
```

---

### Task 6: Spielbildschirm für alle Modi, Startseite und Navigation

**Files:**
- Create: `src/ui/screens/PlayScreen.tsx`
- Modify: `src/ui/screens/HomeScreen.tsx` (komplett ersetzen), `src/ui/App.tsx` (komplett ersetzen), `src/ui/App.test.tsx` (Erwartungen zur Startseite anpassen, neue Tests), `src/ui/screens/screens.css` (Kacheln)
- Delete: `src/ui/screens/TrainingScreen.tsx`

**Interfaces:**
- Consumes: `useGame`, `useGameStore`; `Session`; `SessionHeader`, `ResultCard`, `StatusBar`, `PokerTable`, `ActionBar`, `FeedbackPanel`, `Notices`; `StatsScreen`, `SettingsScreen`
- Produces:
  - `type Screen = 'home' | 'training' | 'daily' | 'run' | 'stats' | 'settings'` (exportiert aus `HomeScreen.tsx`)
  - `HomeScreen({ onNavigate })` — Statusleiste (nicht bei `readOnly`), Abschnitt „Push/Fold-Training“ mit „Training starten“, Kacheln:
    - „Daily Challenge“: „Heute erledigt: <x>/<n>“ bzw. „20 Spots – heute noch offen“, Button „Daily spielen“
    - „Endphase-Run“: „Run läuft – Level <l> von 8“ bzw. „Beste Platzierung: Platz <n>“ bzw. „Überlebe die Endphase eines MTT mit 3 Leben.“, Button „Run fortsetzen“ (bei laufendem Run) bzw. „Run starten“
    - „Statistik“: „Trefferquote, Schwachstellen und Verlauf“, Button „Statistik ansehen“
    - „Einstellungen“: „Sound, Export/Import und Sicherungen“, Button „Einstellungen öffnen“
    - Training, Daily und Run sind bei `readOnly` deaktiviert
  - `PlayScreen({ mode, onBack })` mit `mode: 'training' | 'daily' | 'run'` — Titel „Training“ / „Daily Challenge“ / „Endphase-Run“; startet bzw. setzt den Modus fort (`startTraining` / `startDaily` / `startRun`), auch wenn die Session von außen zurückgesetzt wurde; zeigt Tisch, Aktionen und Feedback nur, solange `session.kind === mode`; zeigt nach dem Ende von Daily oder Run die `ResultCard` (Neustart über `restart: true`, „Zum Menü“ → `onBack`)
  - `App({ onApplyUpdate })` — Navigation über alle sechs Bildschirme

- [ ] **Step 1: Failing Tests schreiben**

`src/ui/App.test.tsx` komplett ersetzen:
```tsx
// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';
import { renderWithStore } from './test-utils';

const verdict = /^(Richtig|Falsch|Knapp – beides okay)$/;

describe('App', () => {
  it('runs a training round from the home screen', () => {
    const { save } = renderWithStore(<App />);
    expect(screen.getByRole('heading', { name: 'Poker-Trainer' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fold' }));
    expect(screen.getByRole('heading', { name: verdict })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.queryByRole('heading', { name: verdict })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    expect(screen.getByRole('button', { name: 'Training starten' })).toBeTruthy();
  });

  it('plays with the keyboard', () => {
    renderWithStore(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByRole('heading', { name: verdict })).toBeTruthy();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.queryByRole('heading', { name: verdict })).toBeNull();
  });

  it('plays the daily challenge to the end and shows the result on the home screen', () => {
    renderWithStore(<App />);
    expect(screen.getByText('20 Spots – heute noch offen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Daily spielen' }));
    expect(screen.getByText(/^Daily Challenge · Spot 1\/20 · 0 richtig$/)).toBeTruthy();
    for (let i = 0; i < 20; i++) {
      fireEvent.keyDown(window, { key: 'f' });
      fireEvent.keyDown(window, { key: ' ' });
    }
    expect(screen.getByRole('heading', { name: 'Daily Challenge geschafft' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zum Menü' }));
    expect(screen.getByText(/^Heute erledigt: \d+\/20$/)).toBeTruthy();
  });

  it('starts and continues an endphase run', () => {
    renderWithStore(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Run starten' }));
    expect(screen.getByText(/^Level 1\/8 · 20 BB · Spot 1\/5$/)).toBeTruthy();
    expect(screen.getByLabelText('Leben: 3 von 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    expect(screen.getByText('Run läuft – Level 1 von 8')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Run fortsetzen' }));
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
  });

  it('opens statistics and settings', () => {
    renderWithStore(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Statistik ansehen' }));
    expect(screen.getByText(/Noch keine Entscheidungen/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    fireEvent.click(screen.getByRole('button', { name: 'Einstellungen öffnen' }));
    expect(screen.getByLabelText('Sounds abspielen')).toBeTruthy();
  });

  it('blocks playing and explains a read-only save', () => {
    renderWithStore(<App />, { info: { readOnly: true } });
    expect(screen.getByText(/stammt aus einer neueren Version/)).toBeTruthy();
    for (const name of ['Training starten', 'Daily spielen', 'Run starten']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('shows storage notices', () => {
    renderWithStore(<App />, { info: { mode: 'memory', otherTabActive: true, corruptBackup: { key: 'corrupt-backup:x', raw: '{kaputt' } } });
    expect(screen.getByText(/keinen dauerhaften Speicher/)).toBeTruthy();
    expect(screen.getByText(/in einem anderen Tab geöffnet/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sicherung herunterladen' })).toBeTruthy();
  });
});
```
(Hinweis: die Button-Namen sind wegen `aria-hidden` auf `<kbd>` exakt „Fold“ und „Weiter“.)

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run src/ui/App.test.tsx` → Expected: FAIL (Kacheln und Modi fehlen).

- [ ] **Step 3: Implementierung**

`src/ui/screens/PlayScreen.tsx`:
```tsx
import { useCallback, useEffect } from 'react';
import type { Action } from '../../engine/pushfold';
import { ActionBar } from '../components/ActionBar';
import { FeedbackPanel } from '../components/FeedbackPanel';
import { PokerTable } from '../components/PokerTable';
import { ResultCard } from '../components/ResultCard';
import { SessionHeader } from '../components/SessionHeader';
import { StatusBar } from '../components/StatusBar';
import { useGame, useGameStore } from '../GameContext';
import './screens.css';

export type PlayMode = 'training' | 'daily' | 'run';

const TITLES: Record<PlayMode, string> = { training: 'Training', daily: 'Daily Challenge', run: 'Endphase-Run' };

export function PlayScreen({ mode, onBack }: { mode: PlayMode; onBack: () => void }) {
  const store = useGameStore();
  const game = useGame();

  const start = useCallback(
    (restart = false) => {
      if (mode === 'training') store.startTraining();
      else if (mode === 'daily') store.startDaily({ restart });
      else store.startRun({ restart });
    },
    [store, mode],
  );

  // All start methods resume instead of restarting, so this is safe to repeat (StrictMode, tab hand-over).
  const sessionKind = game.session.kind;
  const hasSpot = game.current !== null;
  useEffect(() => {
    start();
  }, [start, sessionKind, hasSpot]);

  const onAction = useCallback((action: Action) => {
    store.answer(action);
  }, [store]);
  const onNext = useCallback(() => {
    store.next();
  }, [store]);

  const session = game.session;
  const active = session.kind === mode;
  const current = active ? game.current : null;
  const finished = active && session.kind !== 'training' && session.outcome !== null;

  return (
    <>
      <div className="screen-header">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Menü
        </button>
        <span className="muted">{TITLES[mode]}</span>
      </div>
      <StatusBar status={game.status} xp={game.save.profile.xp} />
      {active && <SessionHeader session={session} activeRun={game.save.activeRun} />}
      {current && (
        <>
          <PokerTable key={current.shownAt} spot={current.spot} cards={current.cards} />
          <ActionBar kind={current.spot.kind} answered={game.last !== null} onAction={onAction} onNext={onNext} />
          {game.last && <FeedbackPanel result={game.last} spot={current.spot} />}
        </>
      )}
      {!current && finished && <ResultCard session={session} onRestart={() => start(true)} onHome={onBack} />}
    </>
  );
}
```

`src/ui/screens/HomeScreen.tsx`:
```tsx
import { StatusBar } from '../components/StatusBar';
import { useGame } from '../GameContext';
import './screens.css';

export type Screen = 'home' | 'training' | 'daily' | 'run' | 'stats' | 'settings';

type Tile = { title: string; text: string; button: string; target: Screen; locked: boolean };

export function HomeScreen({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const game = useGame();
  const locked = game.info.readOnly;
  const { dailyToday, activeRun, bestRun } = game.status;
  const runRunning = activeRun !== null && activeRun.status === 'running';

  const tiles: Tile[] = [
    {
      title: 'Daily Challenge',
      text: dailyToday ? `Heute erledigt: ${dailyToday.correct}/${dailyToday.total}` : '20 Spots – heute noch offen',
      button: 'Daily spielen',
      target: 'daily',
      locked,
    },
    {
      title: 'Endphase-Run',
      text: runRunning
        ? `Run läuft – Level ${activeRun.levelIndex + 1} von 8`
        : bestRun
          ? `Beste Platzierung: Platz ${bestRun.placement}`
          : 'Überlebe die Endphase eines MTT mit 3 Leben.',
      button: runRunning ? 'Run fortsetzen' : 'Run starten',
      target: 'run',
      locked,
    },
    { title: 'Statistik', text: 'Trefferquote, Schwachstellen und Verlauf', button: 'Statistik ansehen', target: 'stats', locked: false },
    { title: 'Einstellungen', text: 'Sound, Export/Import und Sicherungen', button: 'Einstellungen öffnen', target: 'settings', locked: false },
  ];

  return (
    <>
      {!locked && <StatusBar status={game.status} xp={game.save.profile.xp} />}
      <section className="panel home__hero">
        <h2 className="home__heading">Push/Fold-Training</h2>
        <p className="muted">
          Kurze Stacks von 1 bis 20 BB, 8-max mit Big-Blind-Ante. Der Trainer zeigt dir bevorzugt knappe Spots und
          die Situationen, in denen du am häufigsten danebenliegst.
        </p>
        <button type="button" className="btn btn--gold home__start" onClick={() => onNavigate('training')} disabled={locked}>
          Training starten
        </button>
      </section>
      <section className="home__modes">
        {tiles.map((tile) => (
          <div key={tile.title} className="panel home__mode">
            <h3 className="home__mode-title">{tile.title}</h3>
            <p className="muted home__mode-text">{tile.text}</p>
            <button type="button" className="btn" onClick={() => onNavigate(tile.target)} disabled={tile.locked}>
              {tile.button}
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
```

In `src/ui/screens/screens.css` die Regel `.home__mode` ersetzen und ergänzen:
```css
.home__mode {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.home__mode-title {
  margin: 0;
  font-size: 16px;
  color: var(--gold);
}

.home__mode-text {
  margin: 0;
  flex: 1;
  font-size: 14px;
}
```

`src/ui/App.tsx`:
```tsx
import { useState } from 'react';
import { Notices } from './components/Notices';
import { useGame, useGameStore } from './GameContext';
import { HomeScreen, type Screen } from './screens/HomeScreen';
import { PlayScreen } from './screens/PlayScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';

const now = () => new Date();

export function App({ onApplyUpdate }: { onApplyUpdate?: () => Promise<void> }) {
  const store = useGameStore();
  const game = useGame();
  const [screen, setScreen] = useState<Screen>('home');
  const home = () => setScreen('home');

  return (
    <main className="app">
      <h1 className="app__title">Poker-Trainer</h1>
      <Notices
        info={game.info}
        saveError={game.saveError}
        now={now}
        notice={game.notice}
        onDismissNotice={store.dismissNotice}
        onApplyUpdate={onApplyUpdate}
      />
      {screen === 'home' && <HomeScreen onNavigate={setScreen} />}
      {(screen === 'training' || screen === 'daily' || screen === 'run') && <PlayScreen key={screen} mode={screen} onBack={home} />}
      {screen === 'stats' && <StatsScreen onBack={home} />}
      {screen === 'settings' && <SettingsScreen onBack={home} />}
    </main>
  );
}
```

`src/ui/screens/TrainingScreen.tsx` löschen (`git rm src/ui/screens/TrainingScreen.tsx`). Vorher prüfen, dass nichts mehr darauf verweist: `rg "TrainingScreen" src` darf danach keine Treffer liefern.

- [ ] **Step 4: Tests, Typecheck, Build**

Run: `npm test` → Expected: alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run build` → warnungsfrei.

- [ ] **Step 5: Commit**

```bash
git add src/ui/App.tsx src/ui/App.test.tsx src/ui/screens/PlayScreen.tsx src/ui/screens/HomeScreen.tsx src/ui/screens/screens.css
git commit -m "feat(ui): Daily Challenge und Endphase-Run spielbar, Startseite mit allen Modi"
```

---

### Task 7: Sounds und Rangaufstiegs-Feier

**Files:**
- Create: `src/ui/sound.ts`, `src/ui/useGameSounds.ts`, `src/ui/components/Celebration.tsx`, `src/ui/components/Celebration.css`
- Modify: `src/ui/App.tsx` (Sounds und Feier einbinden), `src/main.tsx` (Sound-Player übergeben)
- Test: `src/ui/sound.test.ts`, `src/ui/components/Celebration.test.tsx`, `src/ui/App.test.tsx` (ein Test ergänzen)

**Interfaces:**
- Produces:
  - `type SoundName = 'deal' | 'correct' | 'wrong' | 'rankup'`
  - `SOUND_NOTES: Record<SoundName, Note[]>` mit `type Note = { freq: number; start: number; duration: number; type: OscillatorType; gain: number }`
  - `type AudioContextLike` (Minimal-Schnittstelle: `currentTime`, `destination`, `resume?()`, `createOscillator()`, `createGain()`)
  - `type SoundPlayer = { unlock(): void; play(name: SoundName): void }`
  - `createSoundPlayer(factory: () => AudioContextLike | null): SoundPlayer` — erzeugt den Kontext erst bei `unlock()`; `play` vor `unlock` ist stumm
  - `browserAudioFactory(): AudioContextLike | null`
  - `silentPlayer: SoundPlayer` (No-op, Standard in Tests)
  - `useGameSounds(player: SoundPlayer): void` — entsperrt bei der ersten Geste (`pointerdown`/`keydown`); spielt bei `profile.soundOn`: `deal` bei jedem neu ausgeteilten Spot (neues `current.spot`-Objekt), `correct` bzw. `wrong` bei einer neuen Antwort (`last`; Grenzfall = `correct`), `rankup` bei einer neuen `celebration`
  - `Celebration({ rank, onClose })` — `role="dialog"`, `aria-modal="true"`, Überschrift „Aufgestiegen!“, Text „Du bist jetzt <Rang>.“, 24 Konfetti-Elemente, Button „Weiter so!“ (bekommt den Fokus), Escape schließt
  - `App({ onApplyUpdate, sound? })` — `sound` Standard `silentPlayer`; zeigt `Celebration`, solange `celebration` gesetzt ist, und ruft `dismissCelebration` beim Schließen

- [ ] **Step 1: Failing Tests schreiben**

`src/ui/sound.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { type AudioContextLike, SOUND_NOTES, createSoundPlayer } from './sound';

function fakeContext() {
  const started: number[] = [];
  const ctx: AudioContextLike = {
    currentTime: 10,
    destination: {},
    resume: async () => {},
    createOscillator: () => {
      const osc = {
        type: 'sine' as OscillatorType,
        frequency: { value: 0 },
        connect: () => {},
        start: () => started.push(osc.frequency.value),
        stop: () => {},
      };
      return osc;
    },
    createGain: () => ({
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: () => {},
    }),
  };
  return { ctx, started };
}

describe('createSoundPlayer', () => {
  it('stays silent until unlocked', () => {
    const { ctx, started } = fakeContext();
    let created = 0;
    const player = createSoundPlayer(() => {
      created++;
      return ctx;
    });
    player.play('correct');
    expect(started).toEqual([]);
    expect(created).toBe(0);
    player.unlock();
    player.unlock();
    expect(created).toBe(1);
  });

  it('plays the notes of a sound', () => {
    const { ctx, started } = fakeContext();
    const player = createSoundPlayer(() => ctx);
    player.unlock();
    player.play('rankup');
    expect(started).toEqual(SOUND_NOTES.rankup.map((n) => n.freq));
  });

  it('copes without audio support', () => {
    const player = createSoundPlayer(() => null);
    player.unlock();
    expect(() => player.play('deal')).not.toThrow();
  });
});
```

`src/ui/components/Celebration.test.tsx`:
```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Celebration } from './Celebration';

describe('Celebration', () => {
  it('announces the new rank and closes by button or Escape', () => {
    const onClose = vi.fn();
    render(<Celebration rank="Grinder" onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Aufgestiegen!' })).toBeTruthy();
    expect(screen.getByText('Du bist jetzt Grinder.')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Weiter so!' });
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

In `src/ui/App.test.tsx` ergänzen (Importe: `evOf` aus `../engine/pushfold`; `emptyState`, `type SaveState` aus `../storage/schema`):
```tsx
  it('celebrates a rank-up', () => {
    const initial: SaveState = { ...emptyState(), profile: { xp: 495, combo: 0, soundOn: true } };
    const { store, data } = renderWithStore(<App />, { initial });
    fireEvent.click(screen.getByRole('button', { name: 'Training starten' }));
    const spot = store.getSnapshot().current!.spot;
    fireEvent.keyDown(window, { key: evOf(data, spot) > 0 ? 'a' : 'f' });
    expect(screen.getByRole('dialog', { name: 'Aufgestiegen!' })).toBeTruthy();
    expect(screen.getByText('Du bist jetzt Donkey.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Weiter so!' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run src/ui/sound.test.ts src/ui/components/Celebration.test.tsx src/ui/App.test.tsx` → Expected: FAIL.

- [ ] **Step 3: Implementierung**

`src/ui/sound.ts`:
```ts
export type SoundName = 'deal' | 'correct' | 'wrong' | 'rankup';
type Note = { freq: number; start: number; duration: number; type: OscillatorType; gain: number };

type OscillatorLike = {
  type: OscillatorType;
  frequency: { value: number };
  connect(target: unknown): unknown;
  start(when: number): void;
  stop(when: number): void;
};
type GainLike = {
  gain: { setValueAtTime(value: number, when: number): unknown; exponentialRampToValueAtTime(value: number, when: number): unknown };
  connect(target: unknown): unknown;
};
export type AudioContextLike = {
  currentTime: number;
  destination: unknown;
  resume?: () => Promise<void>;
  createOscillator(): OscillatorLike;
  createGain(): GainLike;
};
export type SoundPlayer = { unlock(): void; play(name: SoundName): void };

export const SOUND_NOTES: Record<SoundName, Note[]> = {
  deal: [{ freq: 900, start: 0, duration: 0.05, type: 'triangle', gain: 0.08 }],
  correct: [
    { freq: 660, start: 0, duration: 0.09, type: 'sine', gain: 0.12 },
    { freq: 880, start: 0.09, duration: 0.14, type: 'sine', gain: 0.12 },
  ],
  wrong: [{ freq: 196, start: 0, duration: 0.24, type: 'sawtooth', gain: 0.06 }],
  rankup: [523.25, 659.25, 783.99, 1046.5].map((freq, i) => ({
    freq,
    start: i * 0.11,
    duration: 0.18,
    type: 'square' as OscillatorType,
    gain: 0.07,
  })),
};

const SILENCE = 0.0001;

export function createSoundPlayer(factory: () => AudioContextLike | null): SoundPlayer {
  let ctx: AudioContextLike | null = null;
  let unlocked = false;
  return {
    unlock() {
      if (!unlocked) {
        unlocked = true;
        ctx = factory();
      }
      void ctx?.resume?.().catch(() => {});
    },
    play(name) {
      if (!ctx) return;
      for (const note of SOUND_NOTES[name]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t0 = ctx.currentTime + note.start;
        osc.type = note.type;
        osc.frequency.value = note.freq;
        gain.gain.setValueAtTime(note.gain, t0);
        gain.gain.exponentialRampToValueAtTime(SILENCE, t0 + note.duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + note.duration + 0.02);
      }
    },
  };
}

export function browserAudioFactory(): AudioContextLike | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? (new Ctor() as unknown as AudioContextLike) : null;
}

export const silentPlayer: SoundPlayer = { unlock: () => {}, play: () => {} };
```

`src/ui/useGameSounds.ts`:
```ts
import { useEffect } from 'react';
import { useGame } from './GameContext';
import type { SoundPlayer } from './sound';

export function useGameSounds(player: SoundPlayer): void {
  const game = useGame();
  const on = game.save.profile.soundOn;
  const spot = game.current?.spot;
  const last = game.last;
  const celebration = game.celebration;

  useEffect(() => {
    const unlock = () => player.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [player]);

  useEffect(() => {
    if (on && spot) player.play('deal');
    // Only a newly dealt spot object plays; restarting a spot's timer keeps the object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot]);

  useEffect(() => {
    if (on && last) player.play(last.outcome.grade.verdict === 'wrong' ? 'wrong' : 'correct');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  useEffect(() => {
    if (on && celebration) player.play('rankup');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebration]);
}
```

`src/ui/components/Celebration.tsx`:
```tsx
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
```

`src/ui/components/Celebration.css`:
```css
.celebration {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(10, 56, 32, 0.82);
  overflow: hidden;
}

.celebration__card {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  text-align: center;
  max-width: 340px;
  width: 100%;
  border-width: 2px;
  border-color: var(--gold);
}

.celebration__title {
  margin: 0;
  font-size: 28px;
  color: var(--gold);
}

.celebration__text {
  margin: 0;
  font-size: 18px;
}

.celebration__confetti {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.celebration__piece {
  position: absolute;
  top: -20px;
  width: 10px;
  height: 16px;
  border-radius: 2px;
  background: var(--gold);
  animation: confetti-fall 1800ms ease-in forwards;
}

.celebration__piece:nth-child(3n) {
  background: var(--cream);
}

.celebration__piece:nth-child(4n) {
  background: var(--card-red);
}

@keyframes confetti-fall {
  to {
    top: 110%;
    opacity: 0.6;
  }
}

@media (prefers-reduced-motion: reduce) {
  .celebration__piece {
    display: none;
  }
}
```

`src/ui/App.tsx` anpassen:
- Importe ergänzen: `import { Celebration } from './components/Celebration';`, `import { type SoundPlayer, silentPlayer } from './sound';`, `import { useGameSounds } from './useGameSounds';`
- Signatur: `export function App({ onApplyUpdate, sound = silentPlayer }: { onApplyUpdate?: () => Promise<void>; sound?: SoundPlayer })`
- Im Körper vor dem `return`: `useGameSounds(sound);`
- Am Ende von `<main>` ergänzen:
```tsx
      {game.celebration && <Celebration rank={game.celebration} onClose={store.dismissCelebration} />}
```

`src/main.tsx` anpassen: `import { browserAudioFactory, createSoundPlayer } from './ui/sound';`, vor dem Rendern `const sound = createSoundPlayer(browserAudioFactory);` und `<App onApplyUpdate={applyUpdate} sound={sound} />`.

- [ ] **Step 4: Tests, Typecheck, Build**

Run: `npm test` → Expected: alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run build` → warnungsfrei.

- [ ] **Step 5: Commit**

```bash
git add src/ui/sound.ts src/ui/sound.test.ts src/ui/useGameSounds.ts src/ui/components/Celebration.tsx src/ui/components/Celebration.css src/ui/components/Celebration.test.tsx src/ui/App.tsx src/ui/App.test.tsx src/main.tsx
git commit -m "feat(ui): Sounds und Feier beim Rangaufstieg"
```

---

### Task 8: Workflows aktualisieren und Abschlussprüfung

**Files:**
- Modify: `.github/workflows/ci.yml`, `.github/workflows/pages.yml`

- [ ] **Step 1: Aktuelle Hauptversionen der Actions ermitteln**

Für jede verwendete Action die neueste Release abfragen (GitHub CLI liegt unter `C:\Program Files\GitHub CLI\gh.exe`):
`actions/checkout`, `actions/setup-node`, `actions/configure-pages`, `actions/upload-pages-artifact`, `actions/deploy-pages`.
Run (PowerShell): `& 'C:\Program Files\GitHub CLI\gh.exe' api repos/actions/checkout/releases/latest --jq .tag_name` (und analog).
Expected: je ein Tag wie `v5.x.y`.

- [ ] **Step 2: Workflows auf die neuesten Hauptversionen setzen**

In beiden Workflows `uses: actions/<name>@v<alt>` auf die ermittelte Hauptversion (`@v<neu>`) ändern. Nur die Hauptversion eintragen (z. B. `@v5`). Ist keine neuere Hauptversion verfügbar, bleibt der Eintrag unverändert; das im Bericht vermerken.

- [ ] **Step 3: Prüfen und committen**

Run: `npm run check:portability` → clean. Run: `npm test` → PASS.

```bash
git add .github/workflows/ci.yml .github/workflows/pages.yml
git commit -m "ci: GitHub Actions auf aktuelle Hauptversionen"
```

- [ ] **Step 4 (Controller): Abschlussprüfung**

- `npm test`, `npm run typecheck`, `npm run build`, `npm run check:portability`, UTF-8-Prüfung.
- Im Browser (`npm run preview`, Desktop und 375×812): Daily komplett durchspielen, Ergebnis-Karte und Startseiten-Kachel; Run starten, Menü, fortsetzen, neu laden (Run bleibt), bis zum Ausscheiden spielen; Statistik mit Daten; Einstellungen: Sound umschalten, Export, Import der exportierten Datei, Sicherung erscheint in der Liste; Rangaufstieg zeigt die Feier.
- Pull Request anlegen; nach grünem CI mergen; Pages-Deployment abwarten; Live-Seite prüfen.
