# Plan 6: Starthand-Training – Speicherung, Store, Oberfläche und Statistik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use mindCoder:subagent-driven-development (recommended) or mindCoder:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den fertigen Starthand-Rechenkern (Plan 5, `src/engine/preflop/`) in die laufende App bringen: Entscheidungen speichern (Schema bleibt Version 1), gemeinsam mit Push/Fold XP, Combo, Rang, Streak und Tageszähler führen, eine Kachel „Starthand-Training“ mit eigenem Spielbildschirm (Filter, Tisch mit Einsätzen, drei Aktions-Buttons, Feedback mit Vier-Farben-Chart) und einen Statistik-Abschnitt „Starthände“ anbieten.

**Architecture:** `DecisionRecord` wird eine Union aus `PushFoldRecord` (ohne oder mit `game: 'pushfold'`) und `PreflopRecord` (`game: 'preflop'`, `PreflopSpot`). Die Push/Fold-Auswertungen filtern Starthand-Datensätze heraus. `src/game/session.ts` verbucht beide Spiele über eine gemeinsame Hilfsfunktion (XP, Combo, Tageszähler, Historie). Der Spiel-Store bekommt eigene Felder `preflopCurrent`/`preflopLast` und Methoden für das Starthand-Training; Daily, Run und das Push/Fold-Training (`session`, `current`, `last`) bleiben unverändert. Die UI-Bausteine (Tisch, Aktionsleiste, Range-Chart, Positions-Zeile, Statistik-Tabellen) werden mit Props verallgemeinert statt dupliziert.

**Tech Stack:** TypeScript 5, React 19, Vite 6, Vitest 3 mit jsdom und Testing Library, idb-keyval (IndexedDB), vite-plugin-pwa.

## Global Constraints

Verbindlich (wörtlich aus dem Auftrag):

- A real user save exists on the user's phone: save schema stays version 1; existing saves must load unchanged and validate (include a test with a save in today's exact format); new fields optional with defaults; unknown/invalid preflop records must not crash loading.
- DecisionRecord gets optional `game: 'pushfold' | 'preflop'` (missing = pushfold) and, for preflop, the PreflopSpot (use isPreflopSpot for validation).
- XP, combo, speed bonus, rank, streak and daily counter are shared between both trainings. Existing push/fold statistics keep showing push/fold only (filter out preflop records).
- Home: tile „Starthand-Training“. Game screen with filters Spot-Typ: Alle / Open-Raise / Gegen Open-Raise / Gegen 3-Bet; Stack: Alle / 40 BB / 100 BB; filters remembered in the profile (backward compatible).
- Table shows stacks, open-raise and 3-bet as bets (use betsFor); three action buttons with sizes, e.g. „3-Bet auf 6,6 BB“, „Call“, „Fold“ (German decimal comma); keyboard F = Fold, C = Call, R or A = aggressive. RFI has only Raise/Fold.
- Feedback: verdict, your and the correct action, chart in four colours (aggressiv, Call, Fold, Grenzfall) with the hand marked, the Lernsatz (note), the hint „Standard-Chart, kein Solver-Ergebnis“, position comparison.
- Stats: section „Starthände“ with hit rate by spot type, position and stack, plus error heatmap per spot type.
- Not included: Daily and endphase run with deep stacks, multiway, squeeze.
- German UI text in real UTF-8; LF line endings; all developer commands via npm scripts (Mac + Windows team, no shell-isms); before each commit run `npm test`, `npm run typecheck`, `npm run check:portability`.
- Final task: build check (`npm run build`), and a manual verification checklist; the deploy happens via PR merge (not part of the plan's tasks).

Projektregeln (aus der Haupt-Spec und Plan 3/4):

- Spec: `docs/mindCoder/specs/2026-10-13-starthand-training-design.md` Abschnitt 7 (verbindlich), dazu Abschnitte 2 und 6. Ebenfalls nicht enthalten (Spec 7): Calls gegen 4-Bet-All-in.
- Speicherung (Haupt-Spec 8.4/8.5): Es wird nur gespeichert, was sich nachweislich wieder laden lässt (`saveState` prüft per `deserialize`). Ein nicht lesbarer Stand wird nie still verworfen. Nur-Lesen-Modus sperrt alle Trainings.
- Identifier und Code-Kommentare auf Englisch, Texte in der Oberfläche auf Deutsch mit echten Umlauten. Dateien mit Umlauten nur mit dem Datei-Schreibwerkzeug anlegen (keine Shell-Heredocs).
- Design-Tokens aus `src/ui/theme.css`; neue Farben nur als Token dort. Aktions-Buttons mindestens 48 px hoch, eine Spalte mit maximal 560 px.
- Tasten wirken nur, wenn kein Eingabefeld fokussiert ist; Leertaste oder Enter = weiter (wie Plan 3).
- Commit-Nachrichten auf Deutsch, letzte Zeile `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (als zweites `-m`).
- Einzelne Testdateien laufen mit `npm test -- <Pfad>` (das Skript ist `vitest run`).

## Entscheidungen zu offenen Punkten der Spec

- Ungültige `preflop`-Datensätze und Datensätze mit unbekanntem `game` werden beim Laden verworfen (kein Fehler, kein Backup). Push/Fold-Datensätze (ohne `game` oder `game: 'pushfold'`) werden weiter streng geprüft; ein kaputter Push/Fold-Datensatz macht den Stand wie bisher unlesbar.
- Der Filter liegt optional in `profile.preflopFilter = { kind: PreflopKind | 'all'; stack: 40 | 100 | 'all' }`. Fehlt er oder ist er ungültig, gilt „Alle / Alle“; ein ungültiger Filter wird beim Laden weggelassen. Der Schlüssel wird erst geschrieben, wenn der Nutzer einen Filter wählt, damit heutige Spielstände byte-gleich bleiben.
- Starthand-Entscheidungen haben immer `mode: 'training'`; beim Laden ist jeder bekannte Modus erlaubt.
- Die Historie (`MAX_DECISIONS` = 5000) ist gemeinsam für beide Trainings.
- Die adaptive Spot-Auswahl gewichtet Push/Fold nur nach Push/Fold-Fehlern und Starthände nur nach Starthand-Fehlern (Kategorie `kind|hero|stack`).
- Push/Fold-Kacheln (Trefferquote, Entscheidungen, Ø Antwortzeit), Tabellen, Heatmap und Wochenverlauf zählen nur Push/Fold. Der Abschnitt „Starthände“ hat eigene Kacheln derselben Art.
- „Tisch zeigt Stacks“: effektiver Stack in der Infozeile („100 BB effektiv“), dazu der Reststack („Stack 97,8“) am eigenen Platz und am Platz des Gegners. Unbeteiligte Spieler zeigen keinen Stack.
- Button-Texte: aggressiv „Raise auf 2,2 BB“, „3-Bet auf 6,6 BB“, „4-Bet auf 14,5 BB“, bei 40 BB „All-in 40 BB“; „Call“ ohne Betrag (wie im Spec-Beispiel); „Fold“. Reihenfolge Fold, Call, aggressiv.
- Feedback zeigt immer „Deine Wahl“ und „Richtige Aktion“, bei Grenzhänden mit „(auch okay: …)“. Das Verdict „close“ nutzt das bestehende „Knapp – beides okay“.
- Ein Filterwechsel ersetzt einen noch unbeantworteten Spot sofort; nach einer Antwort bleibt das Feedback stehen, der nächste Spot folgt dem neuen Filter. Ein unveränderter Filter wird nicht gespeichert.
- Das Starthand-Training ist keine neue `Session`-Art, sondern hat eigene Store-Felder; so bleiben Daily, Run, `ResultCard` und `SessionHeader` unberührt.

## Bestehende API (unverändert nutzen)

- `src/engine/preflop/spots.ts`: `PreflopKind`, `PREFLOP_KINDS`, `StackDepth`, `STACK_DEPTHS`, `PreflopAction`, `PreflopSituation`, `PreflopSpot`, `PREFLOP_KIND_LABELS` (`rfi: 'Open-Raise'`, `vsOpen: 'Gegen Open-Raise'`, `vs3bet: 'Gegen 3-Bet'`), `aggressiveActionOf(kind)`, `allowedActions(kind)`, `chartKeyFor(s)`, `isPreflopSpot(v)`, `preflopCategoryKey(s)` (`kind|hero|stack`), `betsFor(s)` → `{ heroPosted, villainPosted, facing, aggressiveTo, stackBehind }` (alles in BB, „raise to“-Summen).
- `src/engine/preflop/charts.ts`: `chartFor(s)` → `PreflopChart` (`note`, `close`, …), `mainActionOf(chart, hand)`.
- `src/engine/preflop/grading.ts`: `gradePreflop(spot, chosen)` → `PreflopGrade = { verdict; chosen; best; alternative }` (wirft „Aktion … passt nicht zum Spot“), `PreflopCell = 'aggressive' | 'call' | 'fold' | 'close'`, `preflopCells(chart)`, `preflopActionWord(action, stack)` (`fourBet` bei 40 BB = „All-in“), `comparePreflopPositions(spot)` → `PreflopComparison = { axis: 'hero' | 'opener'; entries: { position; cell; action; isCurrent }[]; summary }`.
- `src/engine/preflop/generator.ts`: `generatePreflopSpot(rng, { kinds?, stacks?, categoryWeights?, randomShare? })`.
- `src/engine/positions.ts`: `POSITIONS`, `POSITION_LABELS`, `Position`, `seatOf`, `blindOf`, `ANTE`, `DEAD_MONEY`. `src/engine/cards.ts`: `handName`, `parseHand`, `dealConcrete`, `handClassOf`, `HAND_COUNT`.
- `src/game/session.ts`: `recordDecision`, `statusOf`, `nextTrainingSpot`, `RankChange`, `DecisionOutcome`. `src/game/xp.ts`: `xpForDecision`, `XpResult`. `src/game/stats.ts`: `accuracy`, `accuracyBy`, `byPosition`, `byStackBucket`, `byKind`, `handErrorMatrix`, `weeklyTrend`, `adaptiveWeights`.
- `src/storage/schema.ts`: `SaveState`, `Profile`, `migrate`, `serialize`, `deserialize`, `emptyState`, `SaveFormatError`, `MAX_DECISIONS`. `src/storage/store.ts`: `loadState`, `saveState`, `memoryBackend`, `listBackups`, `SAVE_KEY`.
- `src/app/game-store.ts`: `createGameStore`, `GameSnapshot`, `GameStore` (u. a. `startTraining`, `answer`, `next`, `adoptSavedState`, `importState`, `onVisibilityChange`), `assertPlayable` intern („Im Nur-Lesen-Modus nicht möglich“).
- UI: `StatusBar`, `PokerTable`, `ActionBar`, `FeedbackPanel`, `RangeChart`, `PositionRow`, `ErrorHeatmap`, `CELL_CLASS`, `cellText`, `renderWithStore` (`src/ui/test-utils.tsx`, Uhr steht auf 0, `now` = 13.10.2026 18:00), `useGame`, `useGameStore`.

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/game/preflop-filter.ts` | Filtertyp, Standard, Prüfung, Umrechnung in Generator-Optionen |
| `src/game/stats.ts` | Record-Union, Trennung nach Spiel, Push/Fold- und Starthand-Auswertungen |
| `src/storage/schema.ts`, `src/storage/test-saves.ts` | Validierung der neuen Felder, Spielstand im heutigen Format (Test-Fixture) |
| `src/game/session.ts` | Gemeinsames Verbuchen, `recordPreflopDecision`, `nextPreflopTrainingSpot` |
| `src/app/game-store.ts` | Starthand-Runde im Store, Filter setzen |
| `src/ui/useGameSounds.ts` | Sounds auch für Starthand-Spots |
| `src/app/format.ts` | BB-Beträge, Button-Texte, Situationstext, Titel, XP-Zeile |
| `src/ui/table-model.ts`, `src/ui/components/PokerTable.tsx` | Tischmodell und Tisch für Starthand-Spots |
| `src/ui/components/ActionBar.tsx` | Allgemeine Auswahlleiste, Push/Fold- und Starthand-Variante |
| `src/ui/components/chart-cells.ts`, `RangeChart.tsx`, `PositionRow.tsx`, `FeedbackPanel.tsx`, `PreflopFeedbackPanel.tsx` | Feedback |
| `src/ui/screens/PreflopScreen.tsx`, `HomeScreen.tsx`, `src/ui/App.tsx` | Bildschirm, Kachel, Navigation |
| `src/ui/components/StatsBlocks.tsx`, `PreflopStats.tsx`, `src/ui/screens/StatsScreen.tsx` | Statistik |

---

### Task 1: Speicherformat für Starthand-Entscheidungen und Filter

**Files:**
- Create: `src/game/preflop-filter.ts`, `src/game/preflop-filter.test.ts`, `src/storage/test-saves.ts`
- Modify: `src/game/stats.ts`, `src/storage/schema.ts`, `src/ui/screens/StatsScreen.tsx`
- Test: `src/game/stats.test.ts`, `src/storage/schema.test.ts`, `src/storage/store.test.ts`, `src/ui/screens/StatsScreen.test.tsx` (ergänzen)

**Interfaces:**
- Consumes: `isPreflopSpot`, `allowedActions`, `PREFLOP_KINDS`, `STACK_DEPTHS`, `PreflopSpot`, `PreflopAction`, `PreflopKind`, `StackDepth` aus `src/engine/preflop/spots.ts`
- Produces:
  - `src/game/preflop-filter.ts`: `type PreflopFilter = { kind: PreflopKind | 'all'; stack: StackDepth | 'all' }`, `type PreflopSpotOptions = { kinds?: readonly PreflopKind[]; stacks?: readonly StackDepth[] }`, `DEFAULT_PREFLOP_FILTER: PreflopFilter`, `isPreflopFilter(v: unknown): v is PreflopFilter`, `preflopFilterOf(profile: { preflopFilter?: PreflopFilter }): PreflopFilter`, `samePreflopFilter(a: PreflopFilter, b: PreflopFilter): boolean`, `preflopSpotOptions(filter: PreflopFilter): PreflopSpotOptions`
  - `src/game/stats.ts`: `type DecisionGame = 'pushfold' | 'preflop'`, `type PushFoldRecord = { ts; dateKey; mode; verdict; responseMs; game?: 'pushfold'; spot: Spot; chosen: Action }`, `type PreflopRecord = { …; game: 'preflop'; spot: PreflopSpot; chosen: PreflopAction }`, `type DecisionRecord = PushFoldRecord | PreflopRecord`, `isPreflopRecord(r: DecisionRecord): r is PreflopRecord`, `pushFoldRecords(records: readonly DecisionRecord[]): PushFoldRecord[]`, `preflopRecords(records: readonly DecisionRecord[]): PreflopRecord[]`; `accuracyBy<R extends DecisionRecord, K extends string>(records: readonly R[], keyOf: (r: R) => K)`; `byPosition`/`byStackBucket`/`byKind` nehmen `PushFoldRecord`; `handErrorMatrix` und `adaptiveWeights` nehmen `readonly DecisionRecord[]` und werten nur Push/Fold aus; interne Helfer `errorMatrix(records)` und `weightsBy(records, keyOf)` (für Task 2 und 7)
  - `src/storage/schema.ts`: `Profile.preflopFilter?: PreflopFilter`; `migrate` lädt Starthand-Datensätze und verwirft ungültige
  - `src/storage/test-saves.ts`: `TODAY_SAVE: string` (Spielstand exakt im heutigen Format)

- [ ] **Step 1: Failing Tests schreiben**

`src/game/preflop-filter.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFLOP_FILTER, isPreflopFilter, preflopFilterOf, preflopSpotOptions, samePreflopFilter } from './preflop-filter';

describe('preflop filter', () => {
  it('accepts every combination of spot type and stack', () => {
    for (const kind of ['all', 'rfi', 'vsOpen', 'vs3bet']) {
      for (const stack of ['all', 40, 100]) expect(isPreflopFilter({ kind, stack })).toBe(true);
    }
  });

  it('rejects anything else', () => {
    const bad: unknown[] = [
      null, undefined, 'alle', [], {},
      { kind: 'squeeze', stack: 'all' },
      { kind: 'all', stack: 60 },
      { kind: 'all', stack: '40' },
      { kind: 'rfi' },
    ];
    for (const v of bad) expect(isPreflopFilter(v)).toBe(false);
  });

  it('defaults to all spots when the profile has no filter', () => {
    expect(DEFAULT_PREFLOP_FILTER).toEqual({ kind: 'all', stack: 'all' });
    expect(preflopFilterOf({})).toEqual(DEFAULT_PREFLOP_FILTER);
    expect(preflopFilterOf({ preflopFilter: { kind: 'rfi', stack: 40 } })).toEqual({ kind: 'rfi', stack: 40 });
  });

  it('turns a filter into spot options and compares filters', () => {
    expect(preflopSpotOptions({ kind: 'all', stack: 'all' })).toEqual({});
    expect(preflopSpotOptions({ kind: 'vs3bet', stack: 100 })).toEqual({ kinds: ['vs3bet'], stacks: [100] });
    expect(preflopSpotOptions({ kind: 'all', stack: 40 })).toEqual({ stacks: [40] });
    expect(samePreflopFilter({ kind: 'rfi', stack: 40 }, { kind: 'rfi', stack: 40 })).toBe(true);
    expect(samePreflopFilter({ kind: 'rfi', stack: 40 }, { kind: 'rfi', stack: 100 })).toBe(false);
  });
});
```

`src/storage/test-saves.ts` anlegen (Fixture, wird nur von Tests importiert):
```ts
/**
 * A save exactly as the released app (main after Plan 4) writes it: schema version 1,
 * daily progress present, no starthand data. Used to prove that old saves load and are written back unchanged.
 */
export const TODAY_SAVE =
  '{"schemaVersion":1,"profile":{"xp":1840,"combo":3,"soundOn":false},'
  + '"days":{"2026-10-11":21,"2026-10-12":24,"2026-10-13":6},'
  + '"decisions":['
  + '{"ts":1760371200000,"dateKey":"2026-10-13","mode":"training","spot":{"kind":"open","position":"BTN","stack":10,"hand":5},'
  + '"chosen":"shove","verdict":"correct","responseMs":1800},'
  + '{"ts":1760371260000,"dateKey":"2026-10-13","mode":"daily","spot":{"kind":"call","shover":"SB","position":"BB","stack":9,"hand":20},'
  + '"chosen":"fold","verdict":"wrong","responseMs":4200},'
  + '{"ts":1760371320000,"dateKey":"2026-10-13","mode":"run","spot":{"kind":"open","position":"UTG","stack":17,"hand":0},'
  + '"chosen":"shove","verdict":"close","responseMs":900}],'
  + '"daily":{"2026-10-12":{"dateKey":"2026-10-12","correct":16,"total":20,"durationMs":95000}},'
  + '"runs":[{"ts":1760371300000,"dateKey":"2026-10-12","placement":1240,"finalTable":false,"levelsCompleted":3,"bonusXp":30}],'
  + '"bestRun":{"ts":1760371300000,"dateKey":"2026-10-12","placement":1240,"finalTable":false,"levelsCompleted":3,"bonusXp":30},'
  + '"activeRun":{"levelIndex":1,"spotInLevel":2,"lives":2,"status":"running","answered":7},'
  + '"dailyProgress":{"dateKey":"2026-10-13","index":7,"correct":5,"elapsedMs":42000}}';
```

In `src/storage/schema.test.ts` die Importe ergänzen:
```ts
import type { PreflopRecord } from '../game/stats';
import { TODAY_SAVE } from './test-saves';
```
und ans Ende anhängen:
```ts
describe('starthand records (Plan 6)', () => {
  const preflopRecord: PreflopRecord = {
    ts: 3, dateKey: '2026-10-13', mode: 'training', game: 'preflop',
    spot: { kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO', hand: 0 },
    chosen: 'threeBet', verdict: 'correct', responseMs: 2500,
  };
  const today = () => JSON.parse(TODAY_SAVE);

  it("loads a save in today's format unchanged, byte for byte", () => {
    const loaded = deserialize(TODAY_SAVE);
    expect(loaded).toEqual(JSON.parse(TODAY_SAVE));
    expect(serialize(loaded)).toBe(TODAY_SAVE);
    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.decisions.every((d) => d.game === undefined)).toBe(true);
    expect('preflopFilter' in loaded.profile).toBe(false);
  });

  it('round-trips starthand records next to push/fold records and the remembered filter', () => {
    const state: SaveState = {
      ...emptyState(),
      profile: { xp: 10, combo: 1, soundOn: true, preflopFilter: { kind: 'vs3bet', stack: 40 } },
      decisions: [withDecision().decisions[0], preflopRecord],
    };
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('accepts push/fold records with an explicit game key', () => {
    const raw = today();
    raw.decisions[0] = { ...raw.decisions[0], game: 'pushfold' };
    expect(migrate(raw).decisions[0]).toEqual(raw.decisions[0]);
  });

  it('drops invalid and unknown starthand records instead of failing', () => {
    const raw = today();
    const kept = raw.decisions.length;
    const bad = [
      { ...preflopRecord, spot: { ...preflopRecord.spot, hero: 'UTG' } },
      { ...preflopRecord, spot: { kind: 'rfi', stack: 100, hero: 'BB', villain: null, hand: 0 } },
      { ...preflopRecord, spot: { ...preflopRecord.spot, stack: 60 } },
      { ...preflopRecord, spot: { ...preflopRecord.spot, hand: 169 } },
      { ...preflopRecord, spot: null },
      { ...preflopRecord, chosen: 'raise' },
      { ...preflopRecord, verdict: 'super' },
      { ...preflopRecord, responseMs: -1 },
      { ...preflopRecord, game: 'icm' },
    ];
    raw.decisions = [...raw.decisions, preflopRecord, ...bad];
    const loaded = migrate(raw);
    expect(loaded.decisions).toHaveLength(kept + 1);
    expect(loaded.decisions.at(-1)).toEqual(preflopRecord);
  });

  it('still rejects broken push/fold records', () => {
    const raw = today();
    raw.decisions.push({ ...raw.decisions[0], spot: { kind: 'open', position: 'BB', stack: 10, hand: 5 } });
    expect(() => migrate(raw)).toThrow(SaveFormatError);
    const explicit = today();
    explicit.decisions.push({ ...explicit.decisions[0], game: 'pushfold', chosen: 'raise' });
    expect(() => migrate(explicit)).toThrow(SaveFormatError);
    const notAnObject = today();
    notAnObject.decisions.push(7);
    expect(() => migrate(notAnObject)).toThrow(SaveFormatError);
  });

  it('keeps a valid filter and ignores an invalid one', () => {
    for (const preflopFilter of [{ kind: 'squeeze', stack: 'all' }, { kind: 'all', stack: 60 }, 'alle', null]) {
      const raw = today();
      raw.profile.preflopFilter = preflopFilter;
      expect(migrate(raw).profile).toEqual({ xp: 1840, combo: 3, soundOn: false });
    }
    const raw = today();
    raw.profile.preflopFilter = { kind: 'rfi', stack: 'all', extra: 1 };
    expect(migrate(raw).profile).toEqual({ xp: 1840, combo: 3, soundOn: false, preflopFilter: { kind: 'rfi', stack: 'all' } });
  });
});
```

In `src/storage/store.test.ts` den Import ergänzen: `import { TODAY_SAVE } from './test-saves';` und ans Ende anhängen:
```ts
describe('saves from before the starthand training', () => {
  it('load unchanged, stay writable and are written back byte for byte', async () => {
    const backend = memoryBackend({ [SAVE_KEY]: TODAY_SAVE });
    const loaded = await loadState(backend, now);
    expect(loaded.corruptBackup).toBeNull();
    expect(loaded.readOnly).toBe(false);
    await saveState(backend, loaded.state);
    expect(backend.dump()[SAVE_KEY]).toBe(TODAY_SAVE);
    expect(await listBackups(backend)).toEqual([]);
  });
});
```

In `src/game/stats.test.ts`:
- Importe ersetzen durch:
```ts
import { describe, expect, it } from 'vitest';
import { parseHand } from '../engine/cards';
import type { PreflopSpot } from '../engine/preflop/spots';
import type { Spot, Verdict } from '../engine/pushfold';
import {
  accuracy, accuracyBy, adaptiveWeights, byKind, byPosition, byStackBucket, handErrorMatrix, isPreflopRecord,
  preflopRecords, pushFoldRecords, weeklyTrend, type PreflopRecord, type PushFoldRecord,
} from './stats';
```
- Rückgabetyp des Helfers `rec` von `DecisionRecord` auf `PushFoldRecord` ändern: `function rec(spot: Spot, verdict: Verdict, dateKey = '2026-10-13'): PushFoldRecord {`
- Unter `bbCall` zwei Helfer ergänzen (sie werden in Task 2 und 7 weiterverwendet):
```ts
const rfiCo = (hand = 'A9o'): PreflopSpot => ({ kind: 'rfi', stack: 100, hero: 'CO', villain: null, hand: parseHand(hand) });
function preRec(spot: PreflopSpot, verdict: Verdict): PreflopRecord {
  ts += 1;
  return { ts, dateKey: '2026-10-13', mode: 'training', game: 'preflop', spot, chosen: 'fold', verdict, responseMs: 2000 };
}
```
- Ans Ende anhängen:
```ts
describe('push/fold and starthand records', () => {
  it('separates the records by game, missing game meaning push/fold', () => {
    const pf = rec(btn(10), 'correct');
    const explicit: PushFoldRecord = { ...rec(btn(8), 'wrong'), game: 'pushfold' };
    const pre = preRec(rfiCo(), 'wrong');
    expect(pushFoldRecords([pf, pre, explicit])).toEqual([pf, explicit]);
    expect(preflopRecords([pf, pre, explicit])).toEqual([pre]);
    expect(isPreflopRecord(pre)).toBe(true);
    expect(isPreflopRecord(explicit)).toBe(false);
  });

  it('keeps starthand records out of the push/fold heatmap and weights', () => {
    const pre = preRec(rfiCo('A7o'), 'wrong');
    const m = handErrorMatrix([pre, rec(btn(10, 'A7o'), 'correct')], 'open');
    expect(m.total[parseHand('A7o')]).toBe(1);
    expect(m.errors[parseHand('A7o')]).toBe(0);
    expect([...adaptiveWeights([pre]).keys()]).toEqual([]);
    expect([...adaptiveWeights([pre, rec(btn(3), 'wrong')]).keys()]).toEqual(['open|BTN|1-5']);
  });
});
```

In `src/ui/screens/StatsScreen.test.tsx` im `describe('StatsScreen')` ergänzen (Import `type PreflopRecord` aus `../../game/stats` ergänzen):
```tsx
  it('counts only push/fold decisions in the push/fold numbers', () => {
    const pre: PreflopRecord = {
      ts: 99, dateKey: '2026-10-13', mode: 'training', game: 'preflop',
      spot: { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: parseHand('A7o') },
      chosen: 'raise', verdict: 'correct', responseMs: 1000,
    };
    const s = state();
    renderWithStore(<StatsScreen onBack={() => {}} />, { initial: { ...s, decisions: [...s.decisions, pre, pre, pre] } });
    const tiles = within(screen.getAllByText('Ø Antwortzeit')[0].closest('.stats-tiles') as HTMLElement);
    expect(tiles.getByText('50 %')).toBeTruthy();
    expect(tiles.getByText('4')).toBeTruthy();
    expect(screen.getAllByTitle('A7o: 1 von 3 falsch')).toHaveLength(1);
  });
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/game/preflop-filter.test.ts src/game/stats.test.ts src/storage/schema.test.ts src/storage/store.test.ts src/ui/screens/StatsScreen.test.tsx`
Expected: FAIL (`./preflop-filter` nicht gefunden, `pushFoldRecords`/`isPreflopRecord` fehlen, Starthand-Datensätze werfen `SaveFormatError` „Entscheidungen ungültig“, der Push/Fold-Zähler in der Statistik zeigt 7 statt 4).

- [ ] **Step 3: Implementierung**

`src/game/preflop-filter.ts` anlegen:
```ts
import { PREFLOP_KINDS, type PreflopKind, STACK_DEPTHS, type StackDepth } from '../engine/preflop/spots';

/** The starthand filter remembered in the profile; 'all' means no restriction. */
export type PreflopFilter = { kind: PreflopKind | 'all'; stack: StackDepth | 'all' };
export type PreflopSpotOptions = { kinds?: readonly PreflopKind[]; stacks?: readonly StackDepth[] };

export const DEFAULT_PREFLOP_FILTER: PreflopFilter = { kind: 'all', stack: 'all' };

export function isPreflopFilter(v: unknown): v is PreflopFilter {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const f = v as Record<string, unknown>;
  const kindOk = f.kind === 'all' || (PREFLOP_KINDS as readonly unknown[]).includes(f.kind);
  const stackOk = f.stack === 'all' || (STACK_DEPTHS as readonly unknown[]).includes(f.stack);
  return kindOk && stackOk;
}

export const preflopFilterOf = (profile: { preflopFilter?: PreflopFilter }): PreflopFilter =>
  profile.preflopFilter ?? DEFAULT_PREFLOP_FILTER;

export const samePreflopFilter = (a: PreflopFilter, b: PreflopFilter): boolean => a.kind === b.kind && a.stack === b.stack;

export function preflopSpotOptions(filter: PreflopFilter): PreflopSpotOptions {
  return {
    ...(filter.kind === 'all' ? {} : { kinds: [filter.kind] }),
    ...(filter.stack === 'all' ? {} : { stacks: [filter.stack] }),
  };
}
```

`src/game/stats.ts` vollständig ersetzen:
```ts
import { HAND_COUNT } from '../engine/cards';
import type { PreflopAction, PreflopSpot } from '../engine/preflop/spots';
import type { Position } from '../engine/positions';
import type { Action, Spot, Verdict } from '../engine/pushfold';
import { type CategoryKey, type SpotKind, type StackBucket, categoryKey, stackBucketOf } from '../engine/spot-generator';
import { type DateKey, shiftDateKey } from './streak';

export type DecisionMode = 'training' | 'daily' | 'run';
export type DecisionGame = 'pushfold' | 'preflop';
type RecordBase = { ts: number; dateKey: DateKey; mode: DecisionMode; verdict: Verdict; responseMs: number };
/** Saves written before the starthand training have no `game` key: missing means push/fold. */
export type PushFoldRecord = RecordBase & { game?: 'pushfold'; spot: Spot; chosen: Action };
export type PreflopRecord = RecordBase & { game: 'preflop'; spot: PreflopSpot; chosen: PreflopAction };
export type DecisionRecord = PushFoldRecord | PreflopRecord;

export type Accuracy = { correct: number; total: number; rate: number | null };
export type WeekPoint = { weekStart: DateKey; weekEnd: DateKey; accuracy: Accuracy };

export const ADAPTIVE_WINDOW = 50;
export const ADAPTIVE_BOOST = 4;
const DEFAULT_WEEKS = 8;

export const isPreflopRecord = (r: DecisionRecord): r is PreflopRecord => r.game === 'preflop';
export const pushFoldRecords = (records: readonly DecisionRecord[]): PushFoldRecord[] =>
  records.filter((r): r is PushFoldRecord => !isPreflopRecord(r));
export const preflopRecords = (records: readonly DecisionRecord[]): PreflopRecord[] => records.filter(isPreflopRecord);

const isCorrect = (r: DecisionRecord): boolean => r.verdict !== 'wrong';

export function accuracy(records: readonly DecisionRecord[]): Accuracy {
  let correct = 0;
  for (const r of records) if (isCorrect(r)) correct++;
  return { correct, total: records.length, rate: records.length > 0 ? correct / records.length : null };
}

function groupBy<K, T>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

export function accuracyBy<R extends DecisionRecord, K extends string>(
  records: readonly R[],
  keyOf: (r: R) => K,
): Map<K, Accuracy> {
  return new Map([...groupBy(records, keyOf)].map(([key, list]) => [key, accuracy(list)]));
}

export const byPosition = (r: PushFoldRecord): Position => r.spot.position;
export const byStackBucket = (r: PushFoldRecord): StackBucket => stackBucketOf(r.spot.stack);
export const byKind = (r: PushFoldRecord): SpotKind => r.spot.kind;

function errorMatrix(records: readonly DecisionRecord[]): { total: number[]; errors: number[] } {
  const total = new Array<number>(HAND_COUNT).fill(0);
  const errors = new Array<number>(HAND_COUNT).fill(0);
  for (const r of records) {
    total[r.spot.hand]++;
    if (!isCorrect(r)) errors[r.spot.hand]++;
  }
  return { total, errors };
}

/** Push/fold only: starthand records are skipped even for the same hand class. */
export function handErrorMatrix(records: readonly DecisionRecord[], kind: SpotKind): { total: number[]; errors: number[] } {
  return errorMatrix(pushFoldRecords(records).filter((r) => r.spot.kind === kind));
}

export function weeklyTrend(records: readonly DecisionRecord[], todayKey: DateKey, weeks = DEFAULT_WEEKS): WeekPoint[] {
  const out: WeekPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = shiftDateKey(todayKey, -7 * i);
    const weekStart = shiftDateKey(weekEnd, -6);
    // DateKeys in YYYY-MM-DD format compare correctly as strings.
    const inWeek = records.filter((r) => r.dateKey >= weekStart && r.dateKey <= weekEnd);
    out.push({ weekStart, weekEnd, accuracy: accuracy(inWeek) });
  }
  return out;
}

function weightsBy<R extends DecisionRecord>(records: readonly R[], keyOf: (r: R) => string): Map<string, number> {
  const sorted = [...records].sort((a, b) => a.ts - b.ts);
  const weights = new Map<string, number>();
  for (const [key, list] of groupBy(sorted, keyOf)) {
    const window = list.slice(-ADAPTIVE_WINDOW);
    const errorRate = window.filter((r) => !isCorrect(r)).length / window.length;
    weights.set(key, 1 + ADAPTIVE_BOOST * errorRate);
  }
  return weights;
}

/** Push/fold categories only, so starthand mistakes do not change the push/fold spot mix. */
export const adaptiveWeights = (records: readonly DecisionRecord[]): Map<CategoryKey, number> =>
  weightsBy(pushFoldRecords(records), (r) => categoryKey(r.spot));
```

`src/storage/schema.ts` ändern:
- Importe: die Zeile `import type { DecisionRecord } from '../game/stats';` ersetzen durch
```ts
import { type PreflopAction, type PreflopSpot, allowedActions, isPreflopSpot } from '../engine/preflop/spots';
import { type PreflopFilter, isPreflopFilter } from '../game/preflop-filter';
import type { DecisionRecord, PreflopRecord, PushFoldRecord } from '../game/stats';
```
- `Profile` ersetzen:
```ts
export type Profile = {
  xp: number;
  combo: number;
  soundOn: boolean;
  /** Added with the starthand training; missing means all spot types and stacks. */
  preflopFilter?: PreflopFilter;
};
```
- Die Funktion `isDecision` ersetzen durch:
```ts
function hasDecisionBase(v: Obj): boolean {
  return isNumber(v.ts) && isString(v.dateKey) && MODES.includes(v.mode as string)
    && VERDICTS.includes(v.verdict as string) && isCount(v.responseMs);
}

const isPushFoldDecision = (v: Obj): boolean => hasDecisionBase(v) && isSpot(v.spot) && ACTIONS.includes(v.chosen as string);

const isPreflopDecision = (v: Obj): boolean =>
  hasDecisionBase(v) && isPreflopSpot(v.spot)
  && allowedActions((v.spot as PreflopSpot).kind).includes(v.chosen as PreflopAction);

/**
 * Push/fold records (no `game` key or 'pushfold') must be valid, as before the starthand training.
 * Starthand records and records of unknown games that fail validation are dropped, so they never block loading.
 */
function readDecisions(list: unknown): DecisionRecord[] {
  if (!Array.isArray(list)) fail('Entscheidungen ungültig');
  const out: DecisionRecord[] = [];
  for (const v of list) {
    if (!isObject(v)) fail('Entscheidungen ungültig');
    const game = 'game' in v ? v.game : 'pushfold';
    if (game === 'pushfold') {
      if (!isPushFoldDecision(v)) fail('Entscheidungen ungültig');
      out.push(v as PushFoldRecord);
    } else if (game === 'preflop' && isPreflopDecision(v)) {
      out.push(v as PreflopRecord);
    }
  }
  return out;
}
```
- `migrate` vollständig ersetzen:
```ts
export function migrate(raw: unknown): SaveState {
  if (!isObject(raw)) fail('kein gültiges Objekt');
  const version = raw.schemaVersion;
  if (!isNumber(version)) fail('Schema-Version fehlt');
  if (version > SCHEMA_VERSION) fail(`Version ${version} ist neuer als diese App`, 'newer-version');
  // Future versions: convert older schemas step by step here before validating.
  if (version !== SCHEMA_VERSION) fail(`unbekannte Version ${version}`);

  const p = raw.profile;
  if (!isObject(p) || !isCount(p.xp) || !isCount(p.combo) || typeof p.soundOn !== 'boolean') fail('Profil ungültig');
  // Additive field: a missing or invalid filter falls back to "all spots" instead of failing.
  const rawFilter = p.preflopFilter;
  const preflopFilter = isPreflopFilter(rawFilter) ? { kind: rawFilter.kind, stack: rawFilter.stack } : null;
  if (!isObject(raw.days) || !Object.values(raw.days).every(isCount)) fail('Tageszähler ungültig');
  const decisions = readDecisions(raw.decisions);
  if (!isObject(raw.daily) || !Object.values(raw.daily).every(isDaily)) fail('Daily-Ergebnisse ungültig');
  if (!Array.isArray(raw.runs) || !raw.runs.every(isRun)) fail('Runs ungültig');
  if (raw.bestRun !== null && !isRun(raw.bestRun)) fail('Bester Run ungültig');
  if (raw.activeRun !== null && !isActiveRun(raw.activeRun)) fail('Laufender Run ungültig');
  // Additive field: saves written before it existed have no key at all.
  const progress = 'dailyProgress' in raw ? raw.dailyProgress : null;
  if (progress !== null && !isDailyProgress(progress)) fail('Daily-Fortschritt ungültig');

  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { xp: p.xp, combo: p.combo, soundOn: p.soundOn, ...(preflopFilter ? { preflopFilter } : {}) },
    days: { ...(raw.days as Record<string, number>) },
    decisions,
    daily: { ...(raw.daily as Record<string, DailyResult>) },
    runs: [...(raw.runs as RunSummary[])],
    bestRun: raw.bestRun as RunSummary | null,
    activeRun: raw.activeRun === null ? null : { ...(raw.activeRun as RunState) },
    dailyProgress: progress === null ? null : { ...(progress as DailyProgress) },
  };
}
```

`src/ui/screens/StatsScreen.tsx`: den Import aus `../../game/stats` um `pushFoldRecords` erweitern und die Zeile `const records = game.save.decisions;` ersetzen durch:
```tsx
  // Push/fold numbers only; starthand decisions get their own section (Task 7).
  const records = pushFoldRecords(game.save.decisions);
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/game/preflop-filter.test.ts src/game/stats.test.ts src/storage/schema.test.ts src/storage/store.test.ts src/ui/screens/StatsScreen.test.tsx` → Expected: PASS.

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/game/preflop-filter.ts src/game/preflop-filter.test.ts src/game/stats.ts src/game/stats.test.ts src/storage/schema.ts src/storage/schema.test.ts src/storage/store.test.ts src/storage/test-saves.ts src/ui/screens/StatsScreen.tsx src/ui/screens/StatsScreen.test.tsx
git commit -m "feat(speicher): Starthand-Entscheidungen und Filter im Spielstand, Schema-Version bleibt 1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Starthand-Entscheidungen verbuchen (gemeinsame XP, Combo, Streak)

**Files:**
- Modify: `src/game/session.ts`, `src/game/stats.ts`
- Test: `src/game/session.test.ts`, `src/game/stats.test.ts` (ergänzen)

**Interfaces:**
- Consumes: `PreflopRecord`, `PushFoldRecord`, `DecisionRecord`, `weightsBy`, `preflopRecords` (Task 1, `stats.ts`); `preflopFilterOf`, `preflopSpotOptions`, `PreflopFilter` (Task 1); `gradePreflop`, `PreflopGrade`, `generatePreflopSpot`, `preflopCategoryKey`
- Produces:
  - `src/game/stats.ts`: `preflopAdaptiveWeights(records: readonly DecisionRecord[]): Map<string, number>` (Schlüssel `kind|hero|stack`, nur Starthand-Datensätze)
  - `src/game/session.ts`: `type PreflopDecisionInput = { spot: PreflopSpot; chosen: PreflopAction; responseMs: number; now: Date }`, `type PreflopDecisionOutcome = { state: SaveState; grade: PreflopGrade; xp: XpResult; record: PreflopRecord; rank: RankChange }`, `recordPreflopDecision(state: SaveState, input: PreflopDecisionInput): PreflopDecisionOutcome` (Datensatz mit `mode: 'training'`, `game: 'preflop'`, Spot auf die fünf Felder reduziert), `nextPreflopTrainingSpot(state: SaveState, rng: Rng): PreflopSpot` (Filter aus dem Profil, adaptive Gewichte); `DecisionOutcome.record` hat jetzt den Typ `PushFoldRecord`

- [ ] **Step 1: Failing Tests schreiben**

In `src/game/stats.test.ts` den Import um `preflopAdaptiveWeights` erweitern und anhängen (nutzt `rfiCo`, `preRec`, `rec`, `btn` aus Task 1):
```ts
describe('preflopAdaptiveWeights', () => {
  it('weights starthand categories by their own errors and ignores push/fold', () => {
    const w = preflopAdaptiveWeights([preRec(rfiCo(), 'wrong'), preRec(rfiCo(), 'correct'), rec(btn(10), 'wrong')]);
    expect([...w.entries()]).toEqual([['rfi|CO|100', 3]]);
  });
});
```

In `src/game/session.test.ts` die Importe ergänzen:
```ts
import { generatePreflopSpot } from '../engine/preflop/generator';
import type { PreflopSpot } from '../engine/preflop/spots';
import { deserialize, serialize } from '../storage/schema';
import type { PreflopFilter } from './preflop-filter';
import { nextPreflopTrainingSpot, recordPreflopDecision } from './session';
import { preflopAdaptiveWeights } from './stats';
```
(Bestehende Importzeilen aus `./session`, `./stats` und `../storage/schema` dürfen zusammengeführt werden.) Ans Ende anhängen:
```ts
describe('recordPreflopDecision', () => {
  const aaUtg: PreflopSpot = { kind: 'rfi', stack: 100, hero: 'UTG', villain: null, hand: parseHand('AA') };
  const fours: PreflopSpot = { ...aaUtg, hand: parseHand('44') };
  const trash: PreflopSpot = { ...aaUtg, hand: parseHand('72o') };

  it('grades the decision and shares XP, combo, day counter and history with push/fold', () => {
    const before: SaveState = { ...emptyState(), profile: { xp: 100, combo: 4, soundOn: true }, days: { '2026-10-13': 3 } };
    const out = recordPreflopDecision(before, { spot: aaUtg, chosen: 'raise', responseMs: 1200, now });
    expect(out.grade).toEqual({ verdict: 'correct', chosen: 'raise', best: 'raise', alternative: null });
    expect(out.xp).toEqual({ xp: 23, combo: 5, multiplier: 1.5 });
    expect(out.state.profile).toEqual({ xp: 123, combo: 5, soundOn: true });
    expect(out.state.days).toEqual({ '2026-10-13': 4 });
    expect(out.record).toEqual({
      ts: now.getTime(), dateKey: '2026-10-13', mode: 'training', game: 'preflop',
      spot: aaUtg, chosen: 'raise', verdict: 'correct', responseMs: 1200,
    });
    expect(out.state.decisions).toEqual([out.record]);
    expect(out.rank).toEqual({ before: 'Fish', after: 'Fish', rankUp: false });
    expect(before.decisions).toEqual([]);
  });

  it('counts a borderline alternative as right and resets the combo on a mistake', () => {
    const close = recordPreflopDecision(emptyState(), { spot: fours, chosen: 'fold', responseMs: 6000, now });
    expect(close.grade.verdict).toBe('close');
    expect(close.xp).toEqual({ xp: 10, combo: 1, multiplier: 1 });
    const wrong = recordPreflopDecision(close.state, { spot: trash, chosen: 'raise', responseMs: 1000, now });
    expect(wrong.grade.verdict).toBe('wrong');
    expect(wrong.state.profile).toMatchObject({ xp: 10, combo: 0 });
    expect(wrong.state.days).toEqual({ '2026-10-13': 2 });
  });

  it('continues the combo of a push/fold decision and reports a rank-up', () => {
    const start: SaveState = { ...emptyState(), profile: { xp: 480, combo: 0, soundOn: true } };
    const pf = recordDecision(data, start, { spot: aaOnBtn, chosen: 'shove', responseMs: 1000, mode: 'training', now });
    const out = recordPreflopDecision(pf.state, { spot: aaUtg, chosen: 'raise', responseMs: 1000, now });
    expect(out.xp.combo).toBe(2);
    expect(out.rank).toEqual({ before: 'Fish', after: 'Donkey', rankUp: true });
    expect(statusOf(out.state, now).dayProgress.count).toBe(2);
    expect(out.state.decisions.map((d) => d.game ?? 'pushfold')).toEqual(['pushfold', 'preflop']);
  });

  it('stores only the spot fields and survives the save format', () => {
    const out = recordPreflopDecision(emptyState(), { spot: { ...aaUtg, extra: 1 } as PreflopSpot, chosen: 'raise', responseMs: 1000, now });
    expect(out.record.spot).toEqual(aaUtg);
    expect(deserialize(serialize(out.state))).toEqual(out.state);
  });

  it('rejects actions that do not fit and invalid dates', () => {
    expect(() => recordPreflopDecision(emptyState(), { spot: aaUtg, chosen: 'call', responseMs: 1000, now }))
      .toThrow('Aktion call passt nicht zum Spot');
    expect(() => recordPreflopDecision(emptyState(), { spot: aaUtg, chosen: 'raise', responseMs: 1000, now: new Date(Number.NaN) }))
      .toThrow('Ungültiges Datum');
  });
});

describe('nextPreflopTrainingSpot', () => {
  const withFilter = (preflopFilter: PreflopFilter): SaveState => ({ ...emptyState(), profile: { ...emptyState().profile, preflopFilter } });

  it('follows the filter remembered in the profile', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 40; i++) {
      expect(nextPreflopTrainingSpot(withFilter({ kind: 'vs3bet', stack: 40 }), rng)).toMatchObject({ kind: 'vs3bet', stack: 40 });
    }
  });

  it('mixes all spot types and both stacks without a filter', () => {
    const rng = mulberry32(3);
    const spots = Array.from({ length: 300 }, () => nextPreflopTrainingSpot(emptyState(), rng));
    expect(new Set(spots.map((s) => s.kind))).toEqual(new Set(['rfi', 'vsOpen', 'vs3bet']));
    expect(new Set(spots.map((s) => s.stack))).toEqual(new Set([40, 100]));
  });

  it('weights the categories by starthand mistakes', () => {
    const trash: PreflopSpot = { kind: 'rfi', stack: 100, hero: 'UTG', villain: null, hand: parseHand('72o') };
    let state = emptyState();
    for (let i = 0; i < 3; i++) state = recordPreflopDecision(state, { spot: trash, chosen: 'raise', responseMs: 1000, now }).state;
    expect(nextPreflopTrainingSpot(state, mulberry32(42)))
      .toEqual(generatePreflopSpot(mulberry32(42), { categoryWeights: preflopAdaptiveWeights(state.decisions) }));
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/game/session.test.ts src/game/stats.test.ts`
Expected: FAIL (`recordPreflopDecision`, `nextPreflopTrainingSpot`, `preflopAdaptiveWeights` sind nicht exportiert).

- [ ] **Step 3: Implementierung**

In `src/game/stats.ts`:
- Import ergänzen: `import { preflopCategoryKey } from '../engine/preflop/spots';`
- Ans Ende anhängen:
```ts
/** Starthand categories (kind|hero|stack) weighted by starthand mistakes only. */
export const preflopAdaptiveWeights = (records: readonly DecisionRecord[]): Map<string, number> =>
  weightsBy(preflopRecords(records), (r) => preflopCategoryKey(r.spot));
```

`src/game/session.ts` vollständig ersetzen:
```ts
import { generatePreflopSpot } from '../engine/preflop/generator';
import { type PreflopGrade, gradePreflop } from '../engine/preflop/grading';
import type { PreflopAction, PreflopSpot } from '../engine/preflop/spots';
import { type Action, type Grade, type Spot, type Verdict, grade } from '../engine/pushfold';
import type { PushFoldData } from '../engine/pushfold-data';
import type { Rng } from '../engine/rng';
import { type GeneratorOptions, generateSpot } from '../engine/spot-generator';
import { MAX_DECISIONS, MAX_RUNS, type RunSummary, type SaveState } from '../storage/schema';
import { type DailyResult, bestDaily, isBetterDaily } from './daily';
import { type RunState, applyRunAnswer, completedLevels, runBonusXp, runPlacement, startRun } from './endphase-run';
import { preflopFilterOf, preflopSpotOptions } from './preflop-filter';
import {
  type DecisionMode,
  type DecisionRecord,
  type PreflopRecord,
  type PushFoldRecord,
  adaptiveWeights,
  preflopAdaptiveWeights,
} from './stats';
import { currentStreak, dayProgress, incrementDay, localDateKey } from './streak';
import { type RankInfo, type RankName, SPEED_LIMIT_MS, type XpResult, rankFor, xpForDecision } from './xp';

export type DecisionInput = { spot: Spot; chosen: Action; responseMs: number; mode: DecisionMode; now: Date };
export type RankChange = { before: RankName; after: RankName; rankUp: boolean };
export type DecisionOutcome = { state: SaveState; grade: Grade; xp: XpResult; record: PushFoldRecord; rank: RankChange };
export type PreflopDecisionInput = { spot: PreflopSpot; chosen: PreflopAction; responseMs: number; now: Date };
export type PreflopDecisionOutcome = {
  state: SaveState;
  grade: PreflopGrade;
  xp: XpResult;
  record: PreflopRecord;
  rank: RankChange;
};

function rankChange(xpBefore: number, xpAfter: number): RankChange {
  const before = rankFor(xpBefore).name;
  const after = rankFor(xpAfter).name;
  return { before, after, rankUp: before !== after };
}

function assertValidDate(now: Date): void {
  if (!Number.isFinite(now.getTime())) throw new Error('Ungültiges Datum: Zeitpunkt ist keine gültige Zeit');
}

// Non-finite times (e.g. a broken timer) count as slow; negative times are clamped to 0.
const sanitizeResponseMs = (ms: number): number => (Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : SPEED_LIMIT_MS);

/** XP, combo, day counter (streak) and history are shared by push/fold and the starthand training. */
function appendDecision(state: SaveState, record: DecisionRecord, xp: XpResult): { state: SaveState; rank: RankChange } {
  const xpAfter = state.profile.xp + xp.xp;
  return {
    state: {
      ...state,
      profile: { ...state.profile, xp: xpAfter, combo: xp.combo },
      days: incrementDay(state.days, record.dateKey),
      decisions: [...state.decisions, record].slice(-MAX_DECISIONS),
    },
    rank: rankChange(state.profile.xp, xpAfter),
  };
}

export function recordDecision(data: PushFoldData, state: SaveState, input: DecisionInput): DecisionOutcome {
  assertValidDate(input.now);
  const responseMs = sanitizeResponseMs(input.responseMs);
  const g = grade(data, input.spot, input.chosen);
  const xp = xpForDecision(g.verdict, responseMs, state.profile.combo);
  const record: PushFoldRecord = {
    ts: input.now.getTime(),
    dateKey: localDateKey(input.now),
    mode: input.mode,
    spot: input.spot,
    chosen: input.chosen,
    verdict: g.verdict,
    responseMs,
  };
  const next = appendDecision(state, record, xp);
  return { state: next.state, grade: g, xp, record, rank: next.rank };
}

export function recordPreflopDecision(state: SaveState, input: PreflopDecisionInput): PreflopDecisionOutcome {
  assertValidDate(input.now);
  const responseMs = sanitizeResponseMs(input.responseMs);
  const g = gradePreflop(input.spot, input.chosen);
  const xp = xpForDecision(g.verdict, responseMs, state.profile.combo);
  const { kind, stack, hero, villain, hand } = input.spot;
  const record: PreflopRecord = {
    ts: input.now.getTime(),
    dateKey: localDateKey(input.now),
    mode: 'training',
    game: 'preflop',
    spot: { kind, stack, hero, villain, hand },
    chosen: input.chosen,
    verdict: g.verdict,
    responseMs,
  };
  const next = appendDecision(state, record, xp);
  return { state: next.state, grade: g, xp, record, rank: next.rank };
}

export function recordDaily(
  state: SaveState,
  result: DailyResult,
): { state: SaveState; accepted: boolean; isPersonalBest: boolean } {
  const { correct, total, durationMs } = result;
  const valid = Number.isInteger(correct) && Number.isInteger(total) && Number.isInteger(durationMs)
    && correct >= 0 && correct <= total && durationMs >= 0;
  if (!valid) throw new Error(`Ungültiges Daily-Ergebnis: ${correct}/${total} in ${durationMs} ms`);
  if (state.daily[result.dateKey]) return { state, accepted: false, isPersonalBest: false };
  const isPersonalBest = isBetterDaily(result, bestDaily(Object.values(state.daily)));
  return { state: { ...state, daily: { ...state.daily, [result.dateKey]: result } }, accepted: true, isPersonalBest };
}

export function recordRun(
  state: SaveState,
  run: RunState,
  now: Date,
): { state: SaveState; summary: RunSummary; rank: RankChange; isPersonalBest: boolean } {
  assertValidDate(now);
  const placement = runPlacement(run);
  if (placement === null) throw new Error('Der Run läuft noch');
  const summary: RunSummary = {
    ts: now.getTime(),
    dateKey: localDateKey(now),
    placement,
    finalTable: run.status === 'finalTable',
    levelsCompleted: completedLevels(run),
    bonusXp: runBonusXp(run),
  };
  const isPersonalBest = state.bestRun === null || placement < state.bestRun.placement;
  const xpAfter = state.profile.xp + summary.bonusXp;
  return {
    state: {
      ...state,
      profile: { ...state.profile, xp: xpAfter },
      runs: [...state.runs, summary].slice(-MAX_RUNS),
      bestRun: isPersonalBest ? summary : state.bestRun,
      activeRun: null,
    },
    summary,
    rank: rankChange(state.profile.xp, xpAfter),
    isPersonalBest,
  };
}

export function setSound(state: SaveState, soundOn: boolean): SaveState {
  return { ...state, profile: { ...state.profile, soundOn } };
}

export function startActiveRun(state: SaveState): SaveState {
  // Replaces any unfinished run: starting anew abandons it.
  return { ...state, activeRun: startRun() };
}

export function answerActiveRun(state: SaveState, verdict: Verdict): SaveState {
  if (state.activeRun === null) throw new Error('Kein laufender Run vorhanden');
  return { ...state, activeRun: applyRunAnswer(state.activeRun, verdict) };
}

export type SessionStatus = {
  rank: RankInfo;
  streak: number;
  dayProgress: { count: number; target: number; done: boolean };
  dailyToday: DailyResult | null;
  bestRun: RunSummary | null;
  activeRun: RunState | null;
};

export function statusOf(state: SaveState, now: Date): SessionStatus {
  const todayKey = localDateKey(now);
  return {
    rank: rankFor(state.profile.xp),
    streak: currentStreak(state.days, todayKey),
    dayProgress: dayProgress(state.days, todayKey),
    dailyToday: state.daily[todayKey] ?? null,
    bestRun: state.bestRun,
    activeRun: state.activeRun,
  };
}

export function nextTrainingSpot(
  data: PushFoldData,
  state: SaveState,
  rng: Rng,
  options: Omit<GeneratorOptions, 'categoryWeights'> = {},
): Spot {
  return generateSpot(data, rng, { ...options, categoryWeights: adaptiveWeights(state.decisions) });
}

/** Next starthand spot: filter from the profile, categories weighted by starthand mistakes. */
export function nextPreflopTrainingSpot(state: SaveState, rng: Rng): PreflopSpot {
  return generatePreflopSpot(rng, {
    ...preflopSpotOptions(preflopFilterOf(state.profile)),
    categoryWeights: preflopAdaptiveWeights(state.decisions),
  });
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/game/session.test.ts src/game/stats.test.ts` → Expected: PASS (auch alle bestehenden `recordDecision`-Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/game/session.ts src/game/session.test.ts src/game/stats.ts src/game/stats.test.ts
git commit -m "feat(spiel): Starthand-Entscheidungen verbuchen, XP, Combo und Streak gemeinsam mit Push/Fold" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Starthand-Training im Spiel-Store und Sounds

**Files:**
- Modify: `src/app/game-store.ts`, `src/ui/useGameSounds.ts`
- Test: `src/app/game-store.test.ts`, `src/ui/useGameSounds.test.tsx` (ergänzen)

**Interfaces:**
- Consumes: `recordPreflopDecision`, `nextPreflopTrainingSpot`, `PreflopDecisionOutcome` (Task 2); `PreflopFilter`, `isPreflopFilter`, `preflopFilterOf`, `samePreflopFilter` (Task 1); `chartFor`, `comparePreflopPositions`, `preflopCells`, `PreflopCell`, `PreflopComparison`
- Produces (zusätzlich, bestehende API bleibt unverändert):
  - `type PreflopDeal = { spot: PreflopSpot; cards: readonly [Card, Card]; shownAt: number }`
  - `type PreflopAnswerResult = { outcome: PreflopDecisionOutcome; comparison: PreflopComparison; cells: PreflopCell[]; note: string }`
  - `preflopAnswerResult(outcome: PreflopDecisionOutcome): PreflopAnswerResult` (reine Funktion, auch für UI-Tests)
  - `GameSnapshot.preflopCurrent: PreflopDeal | null`, `GameSnapshot.preflopLast: PreflopAnswerResult | null` (Start: beide `null`)
  - `GameStore.startPreflop(): void` — behält einen unbeantworteten Spot (Timer neu), sonst neuer Spot; im `readOnly` Fehler „Im Nur-Lesen-Modus nicht möglich“
  - `GameStore.nextPreflopSpot(): void` — neuer Spot nach dem Filter im Profil, `preflopLast` wird `null`; im `readOnly` derselbe Fehler
  - `GameStore.answerPreflop(action: PreflopAction): PreflopAnswerResult` — Fehler „Kein Spot aktiv“ bzw. „Dieser Spot ist bereits beantwortet“; speichert sofort; setzt `celebration` bei Rangaufstieg
  - `GameStore.setPreflopFilter(filter: PreflopFilter): void` — Fehler „Ungültiger Starthand-Filter“; gleicher Filter = keine Änderung; sonst `profile.preflopFilter` speichern und einen unbeantworteten Spot ersetzen
  - `adoptSavedState`, `importState` leeren `preflopCurrent`/`preflopLast`; `onVisibilityChange` rechnet versteckte Zeit auch beim Starthand-Spot heraus
  - `useGameSounds` spielt „deal“ bei neuem Starthand-Spot und „correct“/„wrong“ nach einer Starthand-Antwort

- [ ] **Step 1: Failing Tests schreiben**

In `src/app/game-store.test.ts` die Importe ergänzen:
```ts
import { chartFor, mainActionOf } from '../engine/preflop/charts';
import { gradePreflop } from '../engine/preflop/grading';
import { allowedActions, type PreflopAction, type PreflopSpot } from '../engine/preflop/spots';
import type { PreflopFilter } from '../game/preflop-filter';
```
und ans Ende anhängen:
```ts
const preflopRight = (spot: PreflopSpot): PreflopAction => mainActionOf(chartFor(spot), spot.hand);
const preflopWrong = (spot: PreflopSpot): PreflopAction | undefined =>
  allowedActions(spot.kind).find((action) => gradePreflop(spot, action).verdict === 'wrong');
const withFilter = (preflopFilter: PreflopFilter): SaveState => ({ ...emptyState(), profile: { ...emptyState().profile, preflopFilter } });

describe('starthand training', () => {
  it('deals a spot from the remembered filter and resumes it with a fresh timer', () => {
    const { store, advance } = setup({}, withFilter({ kind: 'vs3bet', stack: 40 }));
    store.startPreflop();
    const first = store.getSnapshot().preflopCurrent!;
    expect(first.spot).toMatchObject({ kind: 'vs3bet', stack: 40 });
    expect(handClassOf(first.cards[0], first.cards[1])).toBe(first.spot.hand);
    expect(first.shownAt).toBe(1000);
    expect(store.getSnapshot().current).toBeNull();
    advance(500);
    store.startPreflop();
    expect(store.getSnapshot().preflopCurrent).toEqual({ ...first, shownAt: 1500 });
  });

  it('records an answer with the shared XP, combo and day counter and saves it', () => {
    const { store, save, advance } = setup({}, { ...emptyState(), profile: { xp: 100, combo: 4, soundOn: true } });
    store.startPreflop();
    const spot = store.getSnapshot().preflopCurrent!.spot;
    advance(1200);
    const result = store.answerPreflop(preflopRight(spot));
    expect(result.outcome.grade.verdict).toBe('correct');
    expect(result.outcome.xp).toEqual({ xp: 23, combo: 5, multiplier: 1.5 });
    expect(result.outcome.record).toMatchObject({ game: 'preflop', mode: 'training', responseMs: 1200, spot });
    expect(result.cells).toHaveLength(169);
    expect(result.note).toBe(chartFor(spot).note);
    expect(result.comparison.entries.some((e) => e.isCurrent)).toBe(true);
    expect(save).toHaveBeenCalledWith(result.outcome.state);
    const s = store.getSnapshot();
    expect(s.preflopLast).toBe(result);
    expect(s.save.profile).toMatchObject({ xp: 123, combo: 5 });
    expect(s.status.dayProgress.count).toBe(1);
  });

  it('shares the combo and the day counter with push/fold', () => {
    const { store, data } = setup();
    store.startTraining();
    store.answer(rightAction(data, store.getSnapshot().current!.spot));
    store.startPreflop();
    const result = store.answerPreflop(preflopRight(store.getSnapshot().preflopCurrent!.spot));
    expect(result.outcome.xp.combo).toBe(2);
    expect(store.getSnapshot().save.decisions.map((d) => d.game ?? 'pushfold')).toEqual(['pushfold', 'preflop']);
    expect(store.getSnapshot().status.dayProgress.count).toBe(2);
  });

  it('resets the combo on a starthand mistake', () => {
    const { store } = setup({}, { ...emptyState(), profile: { xp: 0, combo: 7, soundOn: true } });
    store.startPreflop();
    while (preflopWrong(store.getSnapshot().preflopCurrent!.spot) === undefined) store.nextPreflopSpot();
    const result = store.answerPreflop(preflopWrong(store.getSnapshot().preflopCurrent!.spot)!);
    expect(result.outcome.grade.verdict).toBe('wrong');
    expect(store.getSnapshot().save.profile.combo).toBe(0);
  });

  it('refuses double answers and answers without a spot', () => {
    const { store } = setup();
    expect(() => store.answerPreflop('fold')).toThrow('Kein Spot aktiv');
    store.startPreflop();
    store.answerPreflop('fold');
    expect(() => store.answerPreflop('fold')).toThrow('Dieser Spot ist bereits beantwortet');
    store.nextPreflopSpot();
    expect(store.getSnapshot().preflopLast).toBeNull();
  });

  it('remembers a new filter in the profile and deals fitting spots', () => {
    const { store, save } = setup();
    store.startPreflop();
    store.setPreflopFilter({ kind: 'rfi', stack: 100 });
    expect(store.getSnapshot().save.profile.preflopFilter).toEqual({ kind: 'rfi', stack: 100 });
    expect(save).toHaveBeenLastCalledWith(store.getSnapshot().save);
    expect(store.getSnapshot().preflopCurrent!.spot).toMatchObject({ kind: 'rfi', stack: 100 });
    for (let i = 0; i < 20; i++) {
      store.nextPreflopSpot();
      expect(store.getSnapshot().preflopCurrent!.spot).toMatchObject({ kind: 'rfi', stack: 100 });
    }
  });

  it('keeps the feedback when the filter changes after an answer and ignores an unchanged filter', () => {
    const { store, save } = setup();
    store.startPreflop();
    const result = store.answerPreflop('fold');
    store.setPreflopFilter({ kind: 'vsOpen', stack: 'all' });
    expect(store.getSnapshot().preflopLast).toBe(result);
    const calls = save.mock.calls.length;
    store.setPreflopFilter({ kind: 'vsOpen', stack: 'all' });
    expect(save.mock.calls.length).toBe(calls);
    store.nextPreflopSpot();
    expect(store.getSnapshot().preflopCurrent!.spot.kind).toBe('vsOpen');
  });

  it('rejects an invalid filter', () => {
    const { store } = setup();
    expect(() => store.setPreflopFilter({ kind: 'squeeze', stack: 'all' } as unknown as PreflopFilter)).toThrow('Ungültiger Starthand-Filter');
  });

  it('is blocked in read-only mode', () => {
    const { store } = setup({ readOnly: true });
    expect(() => store.startPreflop()).toThrow('Im Nur-Lesen-Modus nicht möglich');
    expect(() => store.nextPreflopSpot()).toThrow('Im Nur-Lesen-Modus nicht möglich');
  });

  it('celebrates a rank-up from a starthand decision', () => {
    const { store } = setup({}, { ...emptyState(), profile: { xp: 495, combo: 0, soundOn: true } });
    store.startPreflop();
    store.answerPreflop(preflopRight(store.getSnapshot().preflopCurrent!.spot));
    expect(store.getSnapshot().celebration).toBe('Donkey');
  });

  it('does not count hidden time for the starthand spot', () => {
    const { store, advance } = setup();
    store.startPreflop();
    advance(400);
    store.onVisibilityChange(false);
    advance(60_000);
    store.onVisibilityChange(true);
    advance(600);
    expect(store.answerPreflop('fold').outcome.record.responseMs).toBe(1000);
  });

  it('clears the starthand round when another state is adopted or imported', async () => {
    const { store } = setup();
    store.startPreflop();
    store.adoptSavedState(emptyState());
    expect(store.getSnapshot().preflopCurrent).toBeNull();
    store.startPreflop();
    store.answerPreflop('fold');
    await store.importState(serialize(emptyState()));
    expect(store.getSnapshot().preflopCurrent).toBeNull();
    expect(store.getSnapshot().preflopLast).toBeNull();
  });
});
```

In `src/ui/useGameSounds.test.tsx` im `describe('useGameSounds')` ergänzen:
```tsx
  it('plays deal and the verdict sound in the starthand training', () => {
    const player = spyPlayer();
    const { store } = renderWithStore(<Probe player={player} />);
    act(() => store.startPreflop());
    expect(player.play).toHaveBeenLastCalledWith('deal');
    let verdict = '';
    act(() => {
      verdict = store.answerPreflop('fold').outcome.grade.verdict;
    });
    expect(player.play).toHaveBeenLastCalledWith(verdict === 'wrong' ? 'wrong' : 'correct');
    expect(player.play).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/app/game-store.test.ts src/ui/useGameSounds.test.tsx`
Expected: FAIL (`store.startPreflop is not a function`).

- [ ] **Step 3: Implementierung**

`src/app/game-store.ts`:
- Importe ergänzen:
```ts
import { chartFor } from '../engine/preflop/charts';
import { type PreflopCell, type PreflopComparison, comparePreflopPositions, preflopCells } from '../engine/preflop/grading';
import type { PreflopAction, PreflopSpot } from '../engine/preflop/spots';
import { type PreflopFilter, isPreflopFilter, preflopFilterOf, samePreflopFilter } from '../game/preflop-filter';
```
  und den Import aus `../game/session` um `type PreflopDecisionOutcome`, `nextPreflopTrainingSpot`, `recordPreflopDecision` erweitern.
- Unter `export type TrainingSpot = …` ergänzen:
```ts
export type PreflopDeal = { spot: PreflopSpot; cards: readonly [Card, Card]; shownAt: number };
export type PreflopAnswerResult = {
  outcome: PreflopDecisionOutcome;
  comparison: PreflopComparison;
  cells: PreflopCell[];
  /** The chart's German learning sentence. */
  note: string;
};

export function preflopAnswerResult(outcome: PreflopDecisionOutcome): PreflopAnswerResult {
  const spot = outcome.record.spot;
  const chart = chartFor(spot);
  return { outcome, comparison: comparePreflopPositions(spot), cells: preflopCells(chart), note: chart.note };
}
```
- In `GameSnapshot` nach `celebration` ergänzen:
```ts
  /** The starthand training runs beside the push/fold session and never changes it. */
  preflopCurrent: PreflopDeal | null;
  preflopLast: PreflopAnswerResult | null;
```
- In `GameStore` ans Ende ergänzen:
```ts
  /** Enters the starthand training: keeps an unanswered spot (restarting its timer), otherwise deals a new one. */
  startPreflop(): void;
  /** Deals the next starthand spot from the filter in the profile. */
  nextPreflopSpot(): void;
  answerPreflop(action: PreflopAction): PreflopAnswerResult;
  /** Remembers the filter in the profile; an unanswered spot is replaced by one that fits. */
  setPreflopFilter(filter: PreflopFilter): void;
```
- Im Start-`snapshot` nach `celebration: null,` ergänzen: `preflopCurrent: null,` und `preflopLast: null,`
- `adoptSavedState` ersetzen:
```ts
    adoptSavedState(fresh) {
      update({
        save: fresh,
        status: statusOf(fresh, now()),
        info: { ...snapshot.info, otherTabActive: false },
        current: null,
        last: null,
        session: { kind: 'training' },
        celebration: null,
        notice: 'writer-acquired',
        preflopCurrent: null,
        preflopLast: null,
      });
    },
```
- In `importState` die `commit`-Zeile ersetzen:
```ts
      commit(imported, {
        session: { kind: 'training' },
        current: null,
        last: null,
        celebration: null,
        preflopCurrent: null,
        preflopLast: null,
      });
```
- `onVisibilityChange` ersetzen:
```ts
    onVisibilityChange(visible) {
      if (!visible) {
        hiddenSince ??= clock();
        return;
      }
      if (hiddenSince === null) return;
      const hidden = clock() - hiddenSince;
      hiddenSince = null;
      const patch: Partial<GameSnapshot> = {};
      if (snapshot.current && !snapshot.last) patch.current = { ...snapshot.current, shownAt: snapshot.current.shownAt + hidden };
      if (snapshot.preflopCurrent && !snapshot.preflopLast) {
        patch.preflopCurrent = { ...snapshot.preflopCurrent, shownAt: snapshot.preflopCurrent.shownAt + hidden };
      }
      const s = snapshot.session;
      if (s.kind === 'daily' && !s.outcome) patch.session = { ...s, startedAt: s.startedAt + hidden };
      if (patch.current || patch.session || patch.preflopCurrent) update(patch);
    },
```
- Im Objekt `store` nach `onVisibilityChange` ergänzen:
```ts
    startPreflop() {
      assertPlayable();
      const current = snapshot.preflopCurrent;
      if (!current || snapshot.preflopLast) store.nextPreflopSpot();
      else update({ preflopCurrent: { ...current, shownAt: clock() } });
    },
    nextPreflopSpot() {
      assertPlayable();
      const spot = nextPreflopTrainingSpot(snapshot.save, rng);
      update({ preflopCurrent: { spot, cards: dealConcrete(spot.hand, rng), shownAt: clock() }, preflopLast: null });
    },
    answerPreflop(action) {
      const current = snapshot.preflopCurrent;
      if (!current) throw new Error('Kein Spot aktiv');
      if (snapshot.preflopLast) throw new Error('Dieser Spot ist bereits beantwortet');
      const outcome = recordPreflopDecision(snapshot.save, {
        spot: current.spot,
        chosen: action,
        responseMs: clock() - current.shownAt,
        now: now(),
      });
      const result = preflopAnswerResult(outcome);
      commit(outcome.state, {
        preflopLast: result,
        celebration: outcome.rank.rankUp ? outcome.rank.after : snapshot.celebration,
      });
      return result;
    },
    setPreflopFilter(filter) {
      if (!isPreflopFilter(filter)) throw new Error('Ungültiger Starthand-Filter');
      if (samePreflopFilter(filter, preflopFilterOf(snapshot.save.profile))) return;
      const preflopFilter: PreflopFilter = { kind: filter.kind, stack: filter.stack };
      commit({ ...snapshot.save, profile: { ...snapshot.save.profile, preflopFilter } });
      // An unanswered spot may not fit the new filter; an answered one keeps its feedback.
      if (snapshot.preflopCurrent && !snapshot.preflopLast) store.nextPreflopSpot();
    },
```

`src/ui/useGameSounds.ts`: nach `const celebration = game.celebration;` ergänzen
```ts
  const preflopSpot = game.preflopCurrent?.spot;
  const preflopLast = game.preflopLast;
```
und nach dem Effekt für `last` ergänzen:
```ts
  useEffect(() => {
    if (on && preflopSpot) player.play('deal');
  }, [preflopSpot]);

  useEffect(() => {
    if (on && preflopLast) player.play(preflopLast.outcome.grade.verdict === 'wrong' ? 'wrong' : 'correct');
  }, [preflopLast]);
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/app/game-store.test.ts src/ui/useGameSounds.test.tsx` → Expected: PASS.

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/app/game-store.ts src/app/game-store.test.ts src/ui/useGameSounds.ts src/ui/useGameSounds.test.tsx
git commit -m "feat(store): Starthand-Training im Spiel-Store mit gemerktem Filter und Sounds" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tisch und Aktionsleiste für Starthand-Spots

**Files:**
- Modify: `src/app/format.ts`, `src/ui/table-model.ts`, `src/ui/components/PokerTable.tsx`, `src/ui/components/PokerTable.css`, `src/ui/components/ActionBar.tsx`, `src/ui/components/ActionBar.css`
- Test: `src/app/format.test.ts`, `src/ui/table-model.test.ts`, `src/ui/components/PokerTable.test.tsx`, `src/ui/components/ActionBar.test.tsx` (ergänzen)

**Interfaces:**
- Consumes: `betsFor`, `preflopActionWord`, `aggressiveActionOf`, `allowedActions`, `PreflopSpot`, `PreflopAction`, `POSITION_LABELS`
- Produces:
  - `src/app/format.ts`: `formatBb(bb: number): string` (z. B. `6,6`), `preflopChoiceLabel(action: PreflopAction, spot: PreflopSpot): string`, `preflopSituationText(spot: PreflopSpot): string`
  - `src/ui/table-model.ts`: `SeatRole` um `'raiser'` erweitert; `SeatModel` um `betLabel: string | null` und `stackBb: number | null` erweitert (Push/Fold: Shover `'All-in'`, sonst `null`; `stackBb` immer `null`); `preflopTableModel(spot: PreflopSpot): TableModel`
  - `src/ui/components/PokerTable.tsx`: `PokerTable` (unverändertes Verhalten), neu `PreflopTable({ spot: PreflopSpot; cards: readonly [Card, Card] })`
  - `src/ui/components/ActionBar.tsx`: `type Choice<A extends string> = { action: A; label: string; keys: readonly string[]; primary?: boolean }`, `ChoiceBar<A>({ choices, answered, onAction, onNext, disabled? })`, `ActionBar` (unverändertes Verhalten), `preflopChoices(spot: PreflopSpot): Choice<PreflopAction>[]`, `PreflopActionBar({ spot: PreflopSpot; answered: boolean; onAction: (a: PreflopAction) => void; onNext: () => void; disabled?: boolean })`, `NEXT_TAP_GUARD_MS` (unverändert)

- [ ] **Step 1: Failing Tests schreiben**

In `src/app/format.test.ts` den Import um `formatBb`, `preflopChoiceLabel`, `preflopSituationText` erweitern, `import type { PreflopSpot } from '../engine/preflop/spots';` ergänzen und anhängen:
```ts
describe('starthand formatting', () => {
  const spot = (s: Omit<PreflopSpot, 'hand'>): PreflopSpot => ({ ...s, hand: 0 });

  it('formats BB amounts with the German decimal comma', () => {
    expect(formatBb(6.6)).toBe('6,6');
    expect(formatBb(3)).toBe('3');
    expect(formatBb(14.52)).toBe('14,5');
    expect(formatBb(0.5)).toBe('0,5');
  });

  it('labels the buttons with their sizes', () => {
    const vsOpen = spot({ kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO' });
    expect(preflopChoiceLabel('threeBet', vsOpen)).toBe('3-Bet auf 6,6 BB');
    expect(preflopChoiceLabel('call', vsOpen)).toBe('Call');
    expect(preflopChoiceLabel('fold', vsOpen)).toBe('Fold');
    expect(preflopChoiceLabel('threeBet', spot({ kind: 'vsOpen', stack: 100, hero: 'BB', villain: 'UTG' }))).toBe('3-Bet auf 8,8 BB');
    expect(preflopChoiceLabel('raise', spot({ kind: 'rfi', stack: 40, hero: 'UTG', villain: null }))).toBe('Raise auf 2,2 BB');
    expect(preflopChoiceLabel('raise', spot({ kind: 'rfi', stack: 100, hero: 'SB', villain: null }))).toBe('Raise auf 3 BB');
    expect(preflopChoiceLabel('fourBet', spot({ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN' }))).toBe('4-Bet auf 14,5 BB');
    expect(preflopChoiceLabel('fourBet', spot({ kind: 'vs3bet', stack: 40, hero: 'CO', villain: 'BB' }))).toBe('All-in 40 BB');
  });

  it('describes the action before the hero', () => {
    expect(preflopSituationText(spot({ kind: 'rfi', stack: 100, hero: 'CO', villain: null }))).toBe('Alle folden zu dir');
    expect(preflopSituationText(spot({ kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO' }))).toBe('CO erhöht auf 2,2 BB');
    expect(preflopSituationText(spot({ kind: 'vsOpen', stack: 40, hero: 'BB', villain: 'SB' }))).toBe('SB erhöht auf 3 BB');
    expect(preflopSituationText(spot({ kind: 'vsOpen', stack: 40, hero: 'LJ', villain: 'UTG1' }))).toBe('UTG+1 erhöht auf 2,2 BB');
    expect(preflopSituationText(spot({ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN' }))).toBe('BTN 3-bettet auf 6,6 BB');
    expect(preflopSituationText(spot({ kind: 'vs3bet', stack: 100, hero: 'UTG', villain: 'BB' }))).toBe('BB 3-bettet auf 8,8 BB');
  });
});
```

In `src/ui/table-model.test.ts` den Import auf `import { preflopTableModel, tableModel } from './table-model';` ändern und anhängen:
```ts
describe('preflopTableModel', () => {
  it('models a decision against an open-raise', () => {
    const m = preflopTableModel({ kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO', hand });
    expect(m.seats.map((s) => s.role)).toEqual(['folded', 'folded', 'folded', 'folded', 'raiser', 'hero', 'waiting', 'waiting']);
    expect(m.seats[4]).toMatchObject({ position: 'CO', betBb: 2.2, betLabel: 'Raise', stackBb: 97.8 });
    expect(m.seats[5]).toMatchObject({ position: 'BTN', betBb: 0, betLabel: null, stackBb: 100, offset: 0 });
    expect(m.seats[6]).toMatchObject({ position: 'SB', betBb: 0.5, betLabel: null, stackBb: null });
    expect(m.seats[7]).toMatchObject({ position: 'BB', betBb: 1, anteBb: 1 });
    expect(m.playersBehind).toBe(2);
    expect(m.potBb).toBe(4.7);
    expect(m.heroStackBb).toBe(100);
  });

  it('models a decision against a 3-bet', () => {
    const m = preflopTableModel({ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN', hand });
    expect(m.seats.map((s) => s.role)).toEqual(['folded', 'folded', 'folded', 'folded', 'hero', 'raiser', 'folded', 'folded']);
    expect(m.seats[4]).toMatchObject({ betBb: 2.2, betLabel: null, stackBb: 97.8 });
    expect(m.seats[5]).toMatchObject({ betBb: 6.6, betLabel: '3-Bet', stackBb: 93.4 });
    expect(m.seats[6].betBb).toBe(0.5);
    expect(m.potBb).toBe(11.3);
    expect(m.playersBehind).toBe(0);
  });

  it('models an open from the small blind and a blind-versus-blind defence', () => {
    const rfi = preflopTableModel({ kind: 'rfi', stack: 40, hero: 'SB', villain: null, hand });
    expect(rfi.seats.map((s) => s.role)).toEqual(['folded', 'folded', 'folded', 'folded', 'folded', 'folded', 'hero', 'waiting']);
    expect(rfi.seats[6]).toMatchObject({ betBb: 0.5, stackBb: 39.5 });
    expect(rfi.potBb).toBe(2.5);
    expect(rfi.playersBehind).toBe(1);
    const bvb = preflopTableModel({ kind: 'vsOpen', stack: 100, hero: 'BB', villain: 'SB', hand });
    expect(bvb.seats[6]).toMatchObject({ role: 'raiser', betBb: 3, betLabel: 'Raise', stackBb: 97 });
    expect(bvb.seats[7]).toMatchObject({ role: 'hero', betBb: 1, stackBb: 99 });
    expect(bvb.potBb).toBe(5);
    expect(bvb.playersBehind).toBe(0);
  });

  it('labels the push/fold shover and shows no stacks there', () => {
    const m = tableModel({ kind: 'call', shover: 'BTN', position: 'BB', stack: 12, hand });
    expect(m.seats[5]).toMatchObject({ betLabel: 'All-in', stackBb: null });
    expect(m.seats.filter((s) => s.betLabel !== null)).toHaveLength(1);
    expect(m.seats.every((s) => s.stackBb === null)).toBe(true);
  });
});
```

In `src/ui/components/PokerTable.test.tsx` den Import auf `import { PokerTable, PreflopTable } from './PokerTable';` ändern und anhängen:
```tsx
describe('PreflopTable', () => {
  const hand = parseHand('A7o');

  it('shows the open-raise as a bet, the stacks and the players behind', () => {
    render(<PreflopTable spot={{ kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO', hand }} cards={cards} />);
    expect(screen.getByText('CO erhöht auf 2,2 BB')).toBeTruthy();
    expect(screen.getByTestId('seat-CO').textContent).toContain('Raise 2,2 BB');
    expect(screen.getByTestId('seat-CO').textContent).toContain('Stack 97,8');
    expect(screen.getByTestId('seat-CO').className).toContain('seat--raiser');
    expect(screen.getByTestId('seat-BTN').textContent).toContain('Stack 100');
    expect(screen.getByTestId('seat-BTN').className).toContain('seat--hero');
    expect(screen.getByText('Du sitzt im BTN · 100 BB effektiv · noch 2 Spieler hinter dir')).toBeTruthy();
    expect(screen.getByText('Pot 4,7 BB')).toBeTruthy();
  });

  it('shows the own open and the 3-bet', () => {
    render(<PreflopTable spot={{ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN', hand }} cards={cards} />);
    expect(screen.getByText('BTN 3-bettet auf 6,6 BB')).toBeTruthy();
    expect(screen.getByTestId('seat-BTN').textContent).toContain('3-Bet 6,6 BB');
    expect(screen.getByTestId('seat-CO').textContent).toContain('2,2 BB');
    expect(screen.getByTestId('seat-CO').textContent).toContain('Stack 97,8');
    expect(screen.getByText('Du sitzt im CO · 100 BB effektiv')).toBeTruthy();
    expect(screen.getByText('Pot 11,3 BB')).toBeTruthy();
  });

  it('shows an unopened pot', () => {
    render(<PreflopTable spot={{ kind: 'rfi', stack: 40, hero: 'UTG1', villain: null, hand }} cards={cards} />);
    expect(screen.getByText('Alle folden zu dir')).toBeTruthy();
    expect(screen.getByText('Du sitzt im UTG+1 · 40 BB effektiv · noch 6 Spieler hinter dir')).toBeTruthy();
  });
});
```

In `src/ui/components/ActionBar.test.tsx` die Importe ergänzen:
```tsx
import { parseHand } from '../../engine/cards';
import type { PreflopSpot } from '../../engine/preflop/spots';
```
den Import auf `import { ActionBar, PreflopActionBar } from './ActionBar';` ändern und anhängen:
```tsx
describe('PreflopActionBar', () => {
  const hand = parseHand('AQo');
  const vsOpen: PreflopSpot = { kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO', hand };

  it('offers fold, call and the 3-bet with its size, by click and keyboard', () => {
    const onAction = vi.fn();
    render(<PreflopActionBar spot={vsOpen} answered={false} onAction={onAction} onNext={() => {}} />);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-keyshortcuts'))).toEqual(['F', 'C', 'R A']);
    expect(screen.getByRole('button', { name: 'Fold' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Call' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '3-Bet auf 6,6 BB' }));
    fireEvent.keyDown(window, { key: 'c' });
    fireEvent.keyDown(window, { key: 'R' });
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'f' });
    expect(onAction.mock.calls).toEqual([['threeBet'], ['call'], ['threeBet'], ['threeBet'], ['fold']]);
  });

  it('offers only raise or fold when everybody folded', () => {
    const onAction = vi.fn();
    render(<PreflopActionBar spot={{ kind: 'rfi', stack: 100, hero: 'UTG', villain: null, hand }} answered={false} onAction={onAction} onNext={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Raise auf 2,2 BB' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Call' })).toBeNull();
    fireEvent.keyDown(window, { key: 'c' });
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'r' });
    expect(onAction).toHaveBeenCalledWith('raise');
  });

  it('labels the 4-bet with its size at 100 BB and as all-in at 40 BB', () => {
    const { unmount } = render(
      <PreflopActionBar spot={{ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN', hand }} answered={false} onAction={() => {}} onNext={() => {}} />,
    );
    expect(screen.getByRole('button', { name: '4-Bet auf 14,5 BB' })).toBeTruthy();
    unmount();
    render(<PreflopActionBar spot={{ kind: 'vs3bet', stack: 40, hero: 'CO', villain: 'BB', hand }} answered={false} onAction={() => {}} onNext={() => {}} />);
    expect(screen.getByRole('button', { name: 'All-in 40 BB' })).toBeTruthy();
  });

  it('shows "Weiter" after the answer', () => {
    const onNext = vi.fn();
    const onAction = vi.fn();
    render(<PreflopActionBar spot={vsOpen} answered onAction={onAction} onNext={onNext} />);
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'c' });
    expect(onNext).toHaveBeenCalledOnce();
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/app/format.test.ts src/ui/table-model.test.ts src/ui/components/PokerTable.test.tsx src/ui/components/ActionBar.test.tsx`
Expected: FAIL (`formatBb`, `preflopTableModel`, `PreflopTable`, `PreflopActionBar` fehlen).

- [ ] **Step 3: Implementierung**

`src/app/format.ts` ergänzen (Importe an den Dateianfang, Funktionen ans Ende):
```ts
import { preflopActionWord } from '../engine/preflop/grading';
import { type PreflopAction, type PreflopSpot, betsFor } from '../engine/preflop/spots';
import { POSITION_LABELS } from '../engine/positions';
```
```ts
const bbNumber = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
/** Chip amounts in BB with the German decimal comma, e.g. 6,6. */
export const formatBb = (bb: number): string => bbNumber.format(bb);

export function preflopChoiceLabel(action: PreflopAction, spot: PreflopSpot): string {
  if (action === 'fold') return 'Fold';
  if (action === 'call') return 'Call';
  const word = preflopActionWord(action, spot.stack);
  const to = formatBb(betsFor(spot).aggressiveTo);
  return word === 'All-in' ? `All-in ${to} BB` : `${word} auf ${to} BB`;
}

export function preflopSituationText(spot: PreflopSpot): string {
  const { facing } = betsFor(spot);
  if (spot.kind === 'rfi' || spot.villain === null || facing === null) return 'Alle folden zu dir';
  const villain = POSITION_LABELS[spot.villain];
  return spot.kind === 'vsOpen'
    ? `${villain} erhöht auf ${formatBb(facing)} BB`
    : `${villain} 3-bettet auf ${formatBb(facing)} BB`;
}
```

`src/ui/table-model.ts` vollständig ersetzen:
```ts
import { ANTE, DEAD_MONEY, POSITIONS, POSITION_LABELS, type Position, blindOf, seatOf } from '../engine/positions';
import { type PreflopSpot, betsFor } from '../engine/preflop/spots';
import type { Spot } from '../engine/pushfold';

export type SeatRole = 'hero' | 'shover' | 'raiser' | 'folded' | 'waiting';
export type SeatModel = {
  position: Position;
  label: string;
  role: SeatRole;
  offset: number;
  isButton: boolean;
  betBb: number;
  anteBb: number;
  /** Highlighted bet such as "All-in", "Raise" or "3-Bet"; null shows a plain amount. */
  betLabel: string | null;
  /** Chips behind, shown for the players in a starthand spot; null hides the stack. */
  stackBb: number | null;
};
export type TableModel = { seats: SeatModel[]; playersBehind: number; potBb: number; heroStackBb: number };

const BTN_SEAT = seatOf('BTN');
const BB_SEAT = seatOf('BB');

const round1 = (x: number): number => Math.round(x * 10) / 10;
const offsetOf = (seat: number, heroSeat: number): number => (seat - heroSeat + POSITIONS.length) % POSITIONS.length;

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
      offset: offsetOf(seat, heroSeat),
      isButton: seat === BTN_SEAT,
      betBb: role === 'shover' ? spot.stack : blindOf(seat),
      anteBb: seat === BB_SEAT ? ANTE : 0,
      betLabel: role === 'shover' ? 'All-in' : null,
      stackBb: null,
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

/** Starthand spot: open-raise and 3-bet are shown as bets (betsFor), uninvolved players have folded or still wait. */
export function preflopTableModel(spot: PreflopSpot): TableModel {
  const bets = betsFor(spot);
  const heroSeat = seatOf(spot.hero);
  const villainSeat = spot.villain === null ? -1 : seatOf(spot.villain);
  const raiseLabel = spot.kind === 'vsOpen' ? 'Raise' : '3-Bet';
  const seats = POSITIONS.map((position, seat): SeatModel => {
    let role: SeatRole;
    if (seat === heroSeat) role = 'hero';
    else if (seat === villainSeat) role = 'raiser';
    // Facing a 3-bet, everybody else has already folded.
    else if (spot.kind === 'vs3bet') role = 'folded';
    else role = seat < heroSeat ? 'folded' : 'waiting';
    const betBb = role === 'hero' ? bets.heroPosted : role === 'raiser' ? (bets.villainPosted ?? 0) : blindOf(seat);
    return {
      position,
      label: POSITION_LABELS[position],
      role,
      offset: offsetOf(seat, heroSeat),
      isButton: seat === BTN_SEAT,
      betBb,
      anteBb: seat === BB_SEAT ? ANTE : 0,
      betLabel: role === 'raiser' ? raiseLabel : null,
      stackBb: role === 'hero' || role === 'raiser' ? round1(spot.stack - betBb) : null,
    };
  });
  return {
    seats,
    playersBehind: seats.filter((s) => s.role === 'waiting').length,
    potBb: round1(ANTE + seats.reduce((sum, s) => sum + s.betBb, 0)),
    heroStackBb: spot.stack,
  };
}
```

`src/ui/components/PokerTable.tsx` vollständig ersetzen:
```tsx
import type { CSSProperties } from 'react';
import { formatBb, preflopSituationText } from '../../app/format';
import { type Card, rankOf } from '../../engine/cards';
import { POSITION_LABELS } from '../../engine/positions';
import type { PreflopSpot } from '../../engine/preflop/spots';
import type { Spot } from '../../engine/pushfold';
import { type TableModel, preflopTableModel, tableModel } from '../table-model';
import { PlayingCard } from './PlayingCard';
import './PokerTable.css';

function seatStyle(offset: number): CSSProperties {
  const angle = ((90 + offset * 45) * Math.PI) / 180;
  return { left: `${50 + 44 * Math.cos(angle)}%`, top: `${50 + 41 * Math.sin(angle)}%` };
}

function behindText(n: number): string {
  if (n === 0) return 'du handelst als Letzter';
  if (n === 1) return 'noch 1 Spieler hinter dir';
  return `noch ${n} Spieler hinter dir`;
}

type ViewProps = { model: TableModel; cards: readonly [Card, Card]; situation: string; info: string };

function TableView({ model, cards, situation, info }: ViewProps) {
  // High card first, the way players read their hand.
  const shown = [...cards].sort((a, b) => rankOf(b) - rankOf(a));
  return (
    <section className="poker-table" aria-label="Pokertisch">
      <div className="poker-table__stage">
        <div className="poker-table__felt">
          <div className="poker-table__pot">Pot {formatBb(model.potBb)} BB</div>
          <div className="poker-table__situation">{situation}</div>
          <div className="poker-table__cards">
            {shown.map((card, i) => (
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
            {seat.betLabel !== null ? (
              <span className="seat__allin">
                {seat.betLabel} {formatBb(seat.betBb)} BB
              </span>
            ) : (
              seat.betBb > 0 && <span className="seat__bet">{formatBb(seat.betBb)} BB</span>
            )}
            {seat.stackBb !== null && <span className="seat__stack">Stack {formatBb(seat.stackBb)}</span>}
            {seat.anteBb > 0 && <span className="seat__ante">Ante {formatBb(seat.anteBb)}</span>}
            {seat.isButton && (
              <span className="seat__button" aria-label="Dealer-Button">
                D
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="poker-table__info">{info}</p>
    </section>
  );
}

export function PokerTable({ spot, cards }: { spot: Spot; cards: readonly [Card, Card] }) {
  const model = tableModel(spot);
  const situation = spot.kind === 'open' ? 'Alle folden zu dir' : `${POSITION_LABELS[spot.shover]} geht All-in`;
  const info = `Du sitzt im ${POSITION_LABELS[spot.position]} · ${spot.stack} BB · ${behindText(model.playersBehind)}`;
  return <TableView model={model} cards={cards} situation={situation} info={info} />;
}

export function PreflopTable({ spot, cards }: { spot: PreflopSpot; cards: readonly [Card, Card] }) {
  const model = preflopTableModel(spot);
  const info = [`Du sitzt im ${POSITION_LABELS[spot.hero]}`, `${spot.stack} BB effektiv`];
  // Facing a 3-bet nobody else is left; "du handelst als Letzter" would be wrong, the 3-bettor may still act.
  if (spot.kind !== 'vs3bet') info.push(behindText(model.playersBehind));
  return <TableView model={model} cards={cards} situation={preflopSituationText(spot)} info={info.join(' · ')} />;
}
```

`src/ui/components/PokerTable.css`: nach dem Block `.seat--shover` ergänzen:
```css
.seat--raiser {
  border-color: var(--gold);
}

.seat__stack {
  color: var(--cream-muted);
  font-size: 11px;
}
```

`src/ui/components/ActionBar.tsx` vollständig ersetzen:
```tsx
import { type MouseEvent, useEffect, useMemo, useRef } from 'react';
import { preflopChoiceLabel } from '../../app/format';
import { type PreflopAction, type PreflopSpot, aggressiveActionOf, allowedActions } from '../../engine/preflop/spots';
import type { Action } from '../../engine/pushfold';
import type { SpotKind } from '../../engine/spot-generator';
import './ActionBar.css';

/** One answer button: `keys` are lower-case keyboard shortcuts, the first one is shown on the button. */
export type Choice<A extends string> = { action: A; label: string; keys: readonly string[]; primary?: boolean };

type ChoiceBarProps<A extends string> = {
  choices: readonly Choice<A>[];
  answered: boolean;
  onAction: (action: A) => void;
  onNext: () => void;
  disabled?: boolean;
};

/** Taps on "Weiter" right after answering are ignored, so a double tap cannot skip the feedback. */
export const NEXT_TAP_GUARD_MS = 300;

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function ChoiceBar<A extends string>({ choices, answered, onAction, onNext, disabled = false }: ChoiceBarProps<A>) {
  const nextButton = useRef<HTMLButtonElement>(null);
  const nextArmed = useRef(false);

  useEffect(() => {
    if (!answered) return;
    nextButton.current?.focus({ preventScroll: true });
    nextArmed.current = false;
    const timer = setTimeout(() => {
      nextArmed.current = true;
    }, NEXT_TAP_GUARD_MS);
    return () => clearTimeout(timer);
  }, [answered]);

  // Keyboard activation of the focused button reports detail 0 and is never ignored.
  const onNextClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0 && !nextArmed.current) return;
    onNext();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (disabled || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!answered) {
        const choice = choices.find((c) => c.keys.includes(key));
        if (!choice) return;
        event.preventDefault();
        onAction(choice.action);
      } else if (key === ' ' || key === 'enter') {
        // A focused button already turns space/enter into a click.
        if (event.target instanceof HTMLButtonElement) return;
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [answered, choices, disabled, onAction, onNext]);

  if (answered) {
    return (
      <div className="action-bar">
        <button
          ref={nextButton}
          type="button"
          className="btn btn--gold action-bar__wide"
          onClick={onNextClick}
          aria-keyshortcuts="Space Enter"
        >
          Weiter <kbd aria-hidden="true">Leertaste</kbd>
        </button>
      </div>
    );
  }
  return (
    <div className={`action-bar${choices.length === 3 ? ' action-bar--three' : ''}`}>
      {choices.map((choice) => (
        <button
          key={choice.action}
          type="button"
          className={`btn${choice.primary ? ' btn--gold' : ''}`}
          onClick={() => onAction(choice.action)}
          disabled={disabled}
          aria-keyshortcuts={choice.keys.map((k) => k.toUpperCase()).join(' ')}
        >
          {choice.label} <kbd aria-hidden="true">{choice.keys[0].toUpperCase()}</kbd>
        </button>
      ))}
    </div>
  );
}

type ActionBarProps = {
  kind: SpotKind;
  answered: boolean;
  onAction: (action: Action) => void;
  onNext: () => void;
  disabled?: boolean;
};

export function ActionBar({ kind, answered, onAction, onNext, disabled = false }: ActionBarProps) {
  const choices = useMemo<Choice<Action>[]>(
    () => [
      { action: 'fold', label: 'Fold', keys: ['f'] },
      { action: kind === 'open' ? 'shove' : 'call', label: kind === 'open' ? 'All-in' : 'Call', keys: ['a'], primary: true },
    ],
    [kind],
  );
  return <ChoiceBar choices={choices} answered={answered} onAction={onAction} onNext={onNext} disabled={disabled} />;
}

/** Fold, Call (not when everybody folded) and the aggressive action with its size. F, C, R or A. */
export function preflopChoices(spot: PreflopSpot): Choice<PreflopAction>[] {
  const aggressive = aggressiveActionOf(spot.kind);
  const choices: Choice<PreflopAction>[] = [{ action: 'fold', label: 'Fold', keys: ['f'] }];
  if (allowedActions(spot.kind).includes('call')) choices.push({ action: 'call', label: 'Call', keys: ['c'] });
  choices.push({ action: aggressive, label: preflopChoiceLabel(aggressive, spot), keys: ['r', 'a'], primary: true });
  return choices;
}

type PreflopActionBarProps = {
  spot: PreflopSpot;
  answered: boolean;
  onAction: (action: PreflopAction) => void;
  onNext: () => void;
  disabled?: boolean;
};

export function PreflopActionBar({ spot, answered, onAction, onNext, disabled = false }: PreflopActionBarProps) {
  const choices = useMemo(() => preflopChoices(spot), [spot]);
  return <ChoiceBar choices={choices} answered={answered} onAction={onAction} onNext={onNext} disabled={disabled} />;
}
```

`src/ui/components/ActionBar.css`: nach `.action-bar__wide` ergänzen:
```css
.action-bar--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.action-bar--three .btn {
  font-size: 15px;
  line-height: 1.2;
  padding: 4px 8px;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/app/format.test.ts src/ui/table-model.test.ts src/ui/components/PokerTable.test.tsx src/ui/components/ActionBar.test.tsx` → Expected: PASS (die bestehenden Push/Fold-Tests eingeschlossen).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/app/format.ts src/app/format.test.ts src/ui/table-model.ts src/ui/table-model.test.ts src/ui/components/PokerTable.tsx src/ui/components/PokerTable.css src/ui/components/PokerTable.test.tsx src/ui/components/ActionBar.tsx src/ui/components/ActionBar.css src/ui/components/ActionBar.test.tsx
git commit -m "feat(ui): Tisch mit Einsätzen und Stacks, Aktionsleiste mit Größen für Starthand-Spots" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Feedback mit Vier-Farben-Chart, Lernsatz und Positions-Vergleich

**Files:**
- Create: `src/ui/components/PreflopFeedbackPanel.tsx`, `src/ui/components/PreflopFeedbackPanel.test.tsx`
- Modify: `src/app/format.ts`, `src/ui/components/chart-cells.ts`, `src/ui/components/RangeChart.tsx`, `src/ui/components/PositionRow.tsx`, `src/ui/components/FeedbackPanel.tsx`, `src/ui/components/Feedback.css`, `src/ui/theme.css`
- Test: `src/app/format.test.ts` (ergänzen); `src/ui/components/FeedbackPanel.test.tsx` muss unverändert grün bleiben

**Interfaces:**
- Consumes: `PreflopAnswerResult`, `preflopAnswerResult` (Task 3); `recordPreflopDecision` (Task 2); `PreflopCell`, `preflopActionWord`, `aggressiveActionOf`, `comparePreflopPositions`
- Produces:
  - `src/app/format.ts`: `xpSummary(xp: XpResult): string` (z. B. „+23 XP · Combo ×1,5 · 5 in Folge“), `preflopSpotTitle(spot: PreflopSpot): string`
  - `src/ui/components/chart-cells.ts`: `PUSHFOLD_LEGEND: readonly ChartCell[]`, `PREFLOP_CELL_CLASS: Record<PreflopCell, string>` (`cell--aggressive`, `cell--call`, `cell--borderline`, `cell--fold`), `preflopCellText(cell: PreflopCell, kind: PreflopKind, stack: StackDepth): string`, `preflopLegend(kind: PreflopKind): readonly PreflopCell[]`
  - `RangeChart<C extends string>({ cells: readonly C[]; heroHand: HandClass; legend: readonly C[]; cellClass: (cell: C) => string; cellLabel: (cell: C) => string })`
  - `type PositionItem = { position: Position; cellClass: string; title: string; current: boolean }`, `PositionRow({ items: readonly PositionItem[]; summary: string })`
  - `PreflopFeedbackPanel({ result: PreflopAnswerResult })`
  - Tokens `--cell-call-bg`, `--cell-call-fg`, `--cell-borderline-bg`, `--cell-borderline-fg`

- [ ] **Step 1: Failing Tests schreiben**

In `src/app/format.test.ts` den Import um `preflopSpotTitle`, `xpSummary` erweitern und im `describe('starthand formatting')` aus Task 4 ergänzen:
```ts
  it('names the spot for the feedback heading', () => {
    expect(preflopSpotTitle(spot({ kind: 'rfi', stack: 100, hero: 'CO', villain: null }))).toBe('Open-Raise aus CO');
    expect(preflopSpotTitle(spot({ kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'UTG1' }))).toBe('BTN gegen Open-Raise aus UTG+1');
    expect(preflopSpotTitle(spot({ kind: 'vs3bet', stack: 40, hero: 'CO', villain: 'BB' }))).toBe('CO gegen 3-Bet aus BB');
  });

  it('sums up the XP of a decision', () => {
    expect(xpSummary({ xp: 23, combo: 5, multiplier: 1.5 })).toBe('+23 XP · Combo ×1,5 · 5 in Folge');
    expect(xpSummary({ xp: 15, combo: 1, multiplier: 1 })).toBe('+15 XP');
    expect(xpSummary({ xp: 0, combo: 0, multiplier: 1 })).toBe('0 XP');
  });
```

`src/ui/components/PreflopFeedbackPanel.test.tsx` anlegen:
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type PreflopAnswerResult, preflopAnswerResult } from '../../app/game-store';
import { parseHand } from '../../engine/cards';
import { chartFor } from '../../engine/preflop/charts';
import { comparePreflopPositions } from '../../engine/preflop/grading';
import type { PreflopAction, PreflopSpot } from '../../engine/preflop/spots';
import { recordPreflopDecision } from '../../game/session';
import { emptyState, type SaveState } from '../../storage/schema';
import { PreflopFeedbackPanel } from './PreflopFeedbackPanel';

const a9oOnCo: PreflopSpot = { kind: 'rfi', stack: 100, hero: 'CO', villain: null, hand: parseHand('A9o') };

function answer(spot: PreflopSpot, chosen: PreflopAction, state: SaveState = emptyState()): PreflopAnswerResult {
  return preflopAnswerResult(recordPreflopDecision(state, { spot, chosen, responseMs: 1500, now: new Date(2026, 9, 13) }));
}

const legend = (container: HTMLElement): (string | null)[] =>
  Array.from(container.querySelectorAll('.range-chart__legend-item'), (item) => item.textContent);

describe('PreflopFeedbackPanel', () => {
  it('explains a correct open-raise with chart, learning sentence, hint and position comparison', () => {
    const { container } = render(<PreflopFeedbackPanel result={answer(a9oOnCo, 'raise')} />);
    expect(screen.getByRole('heading', { name: 'Richtig' })).toBeTruthy();
    expect(screen.getByText('Deine Wahl: Raise')).toBeTruthy();
    expect(screen.getByText('Richtige Aktion: Raise')).toBeTruthy();
    expect(screen.getByText('+15 XP')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'A9o · Open-Raise aus CO · 100 BB' })).toBeTruthy();
    expect(screen.getByTitle('A9o: Raise').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTitle('A9o: Raise').className).toContain('cell--aggressive');
    expect(legend(container)).toEqual(['Raise', 'Grenzfall', 'Fold']);
    expect(screen.getByText(chartFor(a9oOnCo).note)).toBeTruthy();
    expect(screen.getByText('Standard-Chart, kein Solver-Ergebnis')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Dieselbe Hand auf anderen Positionen' })).toBeTruthy();
    expect(screen.getByTitle('UTG: Fold')).toBeTruthy();
    expect(screen.getByTitle('HJ: Grenzfall').className).toContain('cell--borderline');
    expect(screen.getByTitle('CO: Raise').className).toContain('position-row__item--hero');
    expect(screen.getByText('A9o (100 BB, Open-Raise): Fold aus UTG bis LJ, knapp aus HJ, Raise ab CO')).toBeTruthy();
  });

  it('shows the correct action after a mistake', () => {
    render(<PreflopFeedbackPanel result={answer(a9oOnCo, 'fold')} />);
    expect(screen.getByRole('heading', { name: 'Falsch' })).toBeTruthy();
    expect(screen.getByText('Deine Wahl: Fold')).toBeTruthy();
    expect(screen.getByText('Richtige Aktion: Raise')).toBeTruthy();
    expect(screen.getByText('0 XP')).toBeTruthy();
  });

  it('names the allowed alternative of a borderline hand', () => {
    const fours: PreflopSpot = { kind: 'rfi', stack: 100, hero: 'UTG', villain: null, hand: parseHand('44') };
    render(<PreflopFeedbackPanel result={answer(fours, 'fold')} />);
    expect(screen.getByRole('heading', { name: 'Knapp – beides okay' })).toBeTruthy();
    expect(screen.getByText('Richtige Aktion: Raise (auch okay: Fold)')).toBeTruthy();
    expect(screen.getByTitle('44: Grenzfall').getAttribute('aria-current')).toBe('true');
  });

  it('uses four colours and compares openers against an open-raise', () => {
    const spot: PreflopSpot = { kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'UTG', hand: parseHand('JJ') };
    const { container } = render(<PreflopFeedbackPanel result={answer(spot, 'call')} />);
    expect(screen.getByRole('heading', { name: 'JJ · BTN gegen Open-Raise aus UTG · 100 BB' })).toBeTruthy();
    expect(legend(container)).toEqual(['3-Bet', 'Call', 'Grenzfall', 'Fold']);
    expect(screen.getByTitle('JJ: Call').className).toContain('cell--call');
    expect(screen.getByRole('heading', { name: 'Dieselbe Hand gegen andere Opener' })).toBeTruthy();
    expect(screen.getByText(comparePreflopPositions(spot).summary)).toBeTruthy();
  });

  it('calls the 4-bet at 40 BB all-in and shows combo and rank-up', () => {
    const spot: PreflopSpot = { kind: 'vs3bet', stack: 40, hero: 'CO', villain: 'BB', hand: parseHand('AA') };
    const state: SaveState = { ...emptyState(), profile: { xp: 490, combo: 4, soundOn: true } };
    const { container } = render(<PreflopFeedbackPanel result={answer(spot, 'fourBet', state)} />);
    expect(screen.getByText('Deine Wahl: All-in')).toBeTruthy();
    expect(legend(container)[0]).toBe('All-in');
    expect(screen.getByTitle('AA: All-in')).toBeTruthy();
    expect(screen.getByText('+23 XP · Combo ×1,5 · 5 in Folge')).toBeTruthy();
    expect(screen.getByText('Aufgestiegen: Donkey!')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/app/format.test.ts src/ui/components/PreflopFeedbackPanel.test.tsx`
Expected: FAIL (`xpSummary`, `preflopSpotTitle` und `./PreflopFeedbackPanel` fehlen).

- [ ] **Step 3: Implementierung**

`src/app/format.ts`: Import `import type { XpResult } from '../game/xp';` ergänzen und ans Ende anhängen:
```ts
export function preflopSpotTitle(spot: PreflopSpot): string {
  const hero = POSITION_LABELS[spot.hero];
  if (spot.kind === 'rfi' || spot.villain === null) return `Open-Raise aus ${hero}`;
  const villain = POSITION_LABELS[spot.villain];
  return spot.kind === 'vsOpen' ? `${hero} gegen Open-Raise aus ${villain}` : `${hero} gegen 3-Bet aus ${villain}`;
}

const multiplierNumber = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

export function xpSummary(xp: XpResult): string {
  const parts = [xp.xp > 0 ? `+${xp.xp} XP` : '0 XP'];
  if (xp.multiplier > 1) parts.push(`Combo ×${multiplierNumber.format(xp.multiplier)}`);
  if (xp.combo >= 2) parts.push(`${xp.combo} in Folge`);
  return parts.join(' · ');
}
```

`src/ui/components/chart-cells.ts` vollständig ersetzen:
```ts
import { type PreflopCell, preflopActionWord } from '../../engine/preflop/grading';
import { type PreflopKind, type StackDepth, aggressiveActionOf } from '../../engine/preflop/spots';
import type { ChartCell } from '../../engine/pushfold';

export const CELL_CLASS: Record<ChartCell, string> = {
  aggressive: 'cell--aggressive',
  fold: 'cell--fold',
  'close-aggressive': 'cell--close-aggressive',
  'close-fold': 'cell--close-fold',
};

export const PUSHFOLD_LEGEND: readonly ChartCell[] = ['aggressive', 'close-aggressive', 'close-fold', 'fold'];

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

/** Four colours for starthand charts: aggressive, call, borderline, fold. */
export const PREFLOP_CELL_CLASS: Record<PreflopCell, string> = {
  aggressive: 'cell--aggressive',
  call: 'cell--call',
  close: 'cell--borderline',
  fold: 'cell--fold',
};

export function preflopCellText(cell: PreflopCell, kind: PreflopKind, stack: StackDepth): string {
  switch (cell) {
    case 'aggressive':
      return preflopActionWord(aggressiveActionOf(kind), stack);
    case 'call':
      return 'Call';
    case 'close':
      return 'Grenzfall';
    case 'fold':
      return 'Fold';
  }
}

/** Open-raise charts have no calls, so their legend leaves the call colour out. */
export const preflopLegend = (kind: PreflopKind): readonly PreflopCell[] =>
  kind === 'rfi' ? ['aggressive', 'close', 'fold'] : ['aggressive', 'call', 'close', 'fold'];
```

`src/ui/components/RangeChart.tsx` vollständig ersetzen:
```tsx
import { type HandClass, handName } from '../../engine/cards';

type Props<C extends string> = {
  cells: readonly C[];
  heroHand: HandClass;
  legend: readonly C[];
  cellClass: (cell: C) => string;
  cellLabel: (cell: C) => string;
};

export function RangeChart<C extends string>({ cells, heroHand, legend, cellClass, cellLabel }: Props<C>) {
  return (
    <figure className="range-chart">
      <div className="range-chart__grid">
        {cells.map((cell, hand) => {
          const isHero = hand === heroHand;
          return (
            <div
              key={hand}
              className={`range-chart__cell ${cellClass(cell)}${isHero ? ' range-chart__cell--hero' : ''}`}
              title={`${handName(hand)}: ${cellLabel(cell)}`}
              aria-current={isHero ? 'true' : undefined}
            >
              {handName(hand)}
            </div>
          );
        })}
      </div>
      <figcaption className="range-chart__legend">
        {legend.map((cell) => (
          <span key={cell} className="range-chart__legend-item">
            <span className={`range-chart__swatch ${cellClass(cell)}`} aria-hidden="true" />
            {cellLabel(cell)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
```

`src/ui/components/PositionRow.tsx` vollständig ersetzen:
```tsx
import { POSITION_LABELS, type Position } from '../../engine/positions';

export type PositionItem = { position: Position; cellClass: string; title: string; current: boolean };

export function PositionRow({ items, summary }: { items: readonly PositionItem[]; summary: string }) {
  return (
    <div className="position-row">
      <ol className="position-row__list">
        {items.map((item) => (
          <li
            key={item.position}
            className={`position-row__item ${item.cellClass}${item.current ? ' position-row__item--hero' : ''}`}
            title={item.title}
          >
            {POSITION_LABELS[item.position]}
          </li>
        ))}
      </ol>
      <p className="position-row__summary">{summary}</p>
    </div>
  );
}
```

`src/ui/components/FeedbackPanel.tsx` vollständig ersetzen:
```tsx
import { actionLabel, aggressiveWord, evLine, formatEv, verdictLabel, xpSummary } from '../../app/format';
import type { AnswerResult } from '../../app/game-store';
import { handName } from '../../engine/cards';
import { POSITION_LABELS } from '../../engine/positions';
import type { ChartCell, Spot } from '../../engine/pushfold';
import { CELL_CLASS, PUSHFOLD_LEGEND, cellText } from './chart-cells';
import { PositionRow } from './PositionRow';
import { RangeChart } from './RangeChart';
import './Feedback.css';

export function FeedbackPanel({ result, spot }: { result: AnswerResult; spot: Spot }) {
  const { grade, xp, rank } = result.outcome;
  const word = aggressiveWord(spot.kind);
  const label = (cell: ChartCell) => cellText(cell, word);
  const items = result.comparison.entries.map((entry) => ({
    position: entry.position,
    cellClass: CELL_CLASS[entry.cell],
    title: `${POSITION_LABELS[entry.position]}: ${label(entry.cell)} (${formatEv(entry.ev)})`,
    current: entry.isHero,
  }));

  return (
    <section className={`feedback panel feedback--${grade.verdict}`} aria-live="polite">
      <h2 className="feedback__verdict">{verdictLabel(grade.verdict)}</h2>
      <p className="feedback__line">
        Deine Wahl: {actionLabel(grade.chosen)}
        {grade.verdict === 'wrong' ? ` · Besser: ${actionLabel(grade.best)}` : ''}
      </p>
      <p className="feedback__line feedback__ev">{evLine(spot.kind, grade.evAggressive)}</p>
      <p className="feedback__line feedback__xp">{xpSummary(xp)}</p>
      {rank.rankUp && <p className="feedback__rankup">Aufgestiegen: {rank.after}!</p>}
      <h3 className="feedback__heading">
        {handName(spot.hand)} bei {spot.stack} BB – Range für diesen Spot
      </h3>
      <RangeChart
        cells={result.chart}
        heroHand={spot.hand}
        legend={PUSHFOLD_LEGEND}
        cellClass={(cell) => CELL_CLASS[cell]}
        cellLabel={label}
      />
      <h3 className="feedback__heading">Dieselbe Hand auf anderen Positionen</h3>
      <PositionRow items={items} summary={result.comparison.summary} />
    </section>
  );
}
```

`src/ui/components/PreflopFeedbackPanel.tsx` anlegen:
```tsx
import { preflopSpotTitle, verdictLabel, xpSummary } from '../../app/format';
import type { PreflopAnswerResult } from '../../app/game-store';
import { handName } from '../../engine/cards';
import { POSITION_LABELS } from '../../engine/positions';
import { type PreflopCell, preflopActionWord } from '../../engine/preflop/grading';
import type { PreflopAction } from '../../engine/preflop/spots';
import { PREFLOP_CELL_CLASS, preflopCellText, preflopLegend } from './chart-cells';
import { PositionRow } from './PositionRow';
import { RangeChart } from './RangeChart';
import './Feedback.css';

export function PreflopFeedbackPanel({ result }: { result: PreflopAnswerResult }) {
  const { grade, xp, rank, record } = result.outcome;
  const spot = record.spot;
  const word = (action: PreflopAction) => preflopActionWord(action, spot.stack);
  const label = (cell: PreflopCell) => preflopCellText(cell, spot.kind, spot.stack);
  const items = result.comparison.entries.map((entry) => ({
    position: entry.position,
    cellClass: PREFLOP_CELL_CLASS[entry.cell],
    title: `${POSITION_LABELS[entry.position]}: ${label(entry.cell)}`,
    current: entry.isCurrent,
  }));

  return (
    <section className={`feedback panel feedback--${grade.verdict}`} aria-live="polite">
      <h2 className="feedback__verdict">{verdictLabel(grade.verdict)}</h2>
      <p className="feedback__line">Deine Wahl: {word(grade.chosen)}</p>
      <p className="feedback__line">
        Richtige Aktion: {word(grade.best)}
        {grade.alternative ? ` (auch okay: ${word(grade.alternative)})` : ''}
      </p>
      <p className="feedback__line feedback__xp">{xpSummary(xp)}</p>
      {rank.rankUp && <p className="feedback__rankup">Aufgestiegen: {rank.after}!</p>}
      <h3 className="feedback__heading">
        {handName(spot.hand)} · {preflopSpotTitle(spot)} · {spot.stack} BB
      </h3>
      <RangeChart
        cells={result.cells}
        heroHand={spot.hand}
        legend={preflopLegend(spot.kind)}
        cellClass={(cell) => PREFLOP_CELL_CLASS[cell]}
        cellLabel={label}
      />
      <p className="feedback__note">{result.note}</p>
      <p className="feedback__hint muted">Standard-Chart, kein Solver-Ergebnis</p>
      <h3 className="feedback__heading">
        {result.comparison.axis === 'hero' ? 'Dieselbe Hand auf anderen Positionen' : 'Dieselbe Hand gegen andere Opener'}
      </h3>
      <PositionRow items={items} summary={result.comparison.summary} />
    </section>
  );
}
```

`src/ui/theme.css`: im `:root`-Block nach `--cell-fold-fg` ergänzen:
```css
  --cell-call-bg: #2f6f9f;
  --cell-call-fg: #ffffff;
  --cell-borderline-bg: #d9a441;
  --cell-borderline-fg: #3a2a05;
```

`src/ui/components/Feedback.css`: nach `.cell--fold` ergänzen:
```css
.cell--call {
  background: var(--cell-call-bg);
  color: var(--cell-call-fg);
}

.cell--borderline {
  background: var(--cell-borderline-bg);
  color: var(--cell-borderline-fg);
}

.feedback__note {
  margin: 8px 0 0;
  font-style: italic;
}

.feedback__hint {
  margin: 0;
  font-size: 12px;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/app/format.test.ts src/ui/components/PreflopFeedbackPanel.test.tsx src/ui/components/FeedbackPanel.test.tsx` → Expected: PASS (die Push/Fold-Feedback-Tests unverändert grün).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/app/format.ts src/app/format.test.ts src/ui/components/chart-cells.ts src/ui/components/RangeChart.tsx src/ui/components/PositionRow.tsx src/ui/components/FeedbackPanel.tsx src/ui/components/PreflopFeedbackPanel.tsx src/ui/components/PreflopFeedbackPanel.test.tsx src/ui/components/Feedback.css src/ui/theme.css
git commit -m "feat(ui): Starthand-Feedback mit Vier-Farben-Chart, Lernsatz, Hinweis und Positions-Vergleich" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Starthand-Bildschirm mit Filtern, Kachel und Navigation

**Files:**
- Create: `src/ui/screens/PreflopScreen.tsx`, `src/ui/screens/PreflopScreen.test.tsx`
- Modify: `src/ui/screens/HomeScreen.tsx`, `src/ui/App.tsx`, `src/ui/screens/screens.css`
- Test: `src/ui/App.test.tsx` (ergänzen)

**Interfaces:**
- Consumes: `store.startPreflop`, `store.nextPreflopSpot`, `store.answerPreflop`, `store.setPreflopFilter`, `GameSnapshot.preflopCurrent`/`preflopLast` (Task 3); `PreflopFilter`, `preflopFilterOf` (Task 1); `PreflopTable`, `PreflopActionBar` (Task 4); `PreflopFeedbackPanel` (Task 5); `StatusBar`; `PREFLOP_KINDS`, `PREFLOP_KIND_LABELS`, `STACK_DEPTHS`
- Produces: `Screen` (in `HomeScreen.tsx`) um `'preflop'` erweitert; `PreflopScreen({ onBack: () => void })`; Kachel „Starthand-Training“ mit Button „Starthände trainieren“ (im `readOnly` gesperrt); Filtergruppen `role="group"` mit `aria-label` „Spot-Typ“ und „Stack“, Buttons mit `aria-pressed`

- [ ] **Step 1: Failing Tests schreiben**

`src/ui/screens/PreflopScreen.test.tsx` anlegen:
```tsx
// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PreflopFilter } from '../../game/preflop-filter';
import { emptyState, type SaveState } from '../../storage/schema';
import { renderWithStore } from '../test-utils';
import { PreflopScreen } from './PreflopScreen';

const withFilter = (preflopFilter: PreflopFilter): SaveState => ({ ...emptyState(), profile: { ...emptyState().profile, preflopFilter } });

describe('PreflopScreen', () => {
  it('deals a starthand spot with status bar, table and sized buttons', () => {
    const { store } = renderWithStore(<PreflopScreen onBack={() => {}} />, { initial: withFilter({ kind: 'vs3bet', stack: 40 }) });
    expect(screen.getByRole('progressbar', { name: 'Fortschritt zum nächsten Rang' })).toBeTruthy();
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
    expect(screen.getByText(/3-bettet auf/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All-in 40 BB' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Call' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fold' })).toBeTruthy();
    expect(store.getSnapshot().preflopCurrent!.spot).toMatchObject({ kind: 'vs3bet', stack: 40 });
  });

  it('shows the remembered filter and stores a new one in the profile', () => {
    const { store, save } = renderWithStore(<PreflopScreen onBack={() => {}} />, { initial: withFilter({ kind: 'rfi', stack: 100 }) });
    const kinds = within(screen.getByRole('group', { name: 'Spot-Typ' }));
    const stacks = within(screen.getByRole('group', { name: 'Stack' }));
    expect(kinds.getAllByRole('button').map((b) => b.textContent)).toEqual(['Alle', 'Open-Raise', 'Gegen Open-Raise', 'Gegen 3-Bet']);
    expect(stacks.getAllByRole('button').map((b) => b.textContent)).toEqual(['Alle', '40 BB', '100 BB']);
    expect(kinds.getByRole('button', { name: 'Open-Raise' }).getAttribute('aria-pressed')).toBe('true');
    expect(stacks.getByRole('button', { name: '100 BB' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^Raise auf/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Call' })).toBeNull();
    fireEvent.click(kinds.getByRole('button', { name: 'Gegen Open-Raise' }));
    fireEvent.click(stacks.getByRole('button', { name: 'Alle' }));
    expect(store.getSnapshot().save.profile.preflopFilter).toEqual({ kind: 'vsOpen', stack: 'all' });
    expect(save).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().preflopCurrent!.spot.kind).toBe('vsOpen');
    expect(kinds.getByRole('button', { name: 'Gegen Open-Raise' }).getAttribute('aria-pressed')).toBe('true');
    expect(kinds.getByRole('button', { name: 'Open-Raise' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Call' })).toBeTruthy();
  });

  it('answers with the keyboard: C calls, R and A are aggressive, F folds, space continues', () => {
    renderWithStore(<PreflopScreen onBack={() => {}} />, { initial: withFilter({ kind: 'vsOpen', stack: 100 }) });
    fireEvent.keyDown(window, { key: 'c' });
    expect(screen.getByText('Deine Wahl: Call')).toBeTruthy();
    expect(screen.getByText('Standard-Chart, kein Solver-Ergebnis')).toBeTruthy();
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.queryByText('Deine Wahl: Call')).toBeNull();
    fireEvent.keyDown(window, { key: 'r' });
    expect(screen.getByText('Deine Wahl: 3-Bet')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByText('Deine Wahl: 3-Bet')).toBeTruthy();
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'f' });
    expect(screen.getByText('Deine Wahl: Fold')).toBeTruthy();
  });

  it('keeps the feedback when the filter changes after an answer', () => {
    renderWithStore(<PreflopScreen onBack={() => {}} />);
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.click(within(screen.getByRole('group', { name: 'Stack' })).getByRole('button', { name: '40 BB' }));
    expect(screen.getByText('Deine Wahl: Fold')).toBeTruthy();
  });

  it('goes back to the menu', () => {
    const onBack = vi.fn();
    renderWithStore(<PreflopScreen onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
```

In `src/ui/App.test.tsx` im `describe('App')` ergänzen:
```tsx
  it('plays a starthand round from the home tile', () => {
    const { save, store } = renderWithStore(<App />);
    expect(screen.getByRole('heading', { name: 'Starthand-Training' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Starthände trainieren' }));
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Spot-Typ' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'f' });
    expect(screen.getByRole('heading', { name: verdict })).toBeTruthy();
    expect(screen.getByText('Standard-Chart, kein Solver-Ergebnis')).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().save.decisions[0].game).toBe('preflop');
    fireEvent.keyDown(window, { key: ' ' });
    expect(screen.queryByRole('heading', { name: verdict })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    expect(screen.getByRole('button', { name: 'Starthände trainieren' })).toBeTruthy();
    expect(screen.getByText('Heute 1/20')).toBeTruthy();
  });

  it('locks the starthand tile in read-only mode', () => {
    renderWithStore(<App />, { info: { readOnly: true } });
    expect((screen.getByRole('button', { name: 'Starthände trainieren' }) as HTMLButtonElement).disabled).toBe(true);
  });
```
Hinweis: Die Statusleiste wird auf der Startseite im `readOnly` nicht gezeigt; im ersten Test (schreibbar) zeigt sie „Heute 1/20“.

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/ui/screens/PreflopScreen.test.tsx src/ui/App.test.tsx`
Expected: FAIL (`./PreflopScreen` fehlt, Kachel „Starthand-Training“ nicht vorhanden).

- [ ] **Step 3: Implementierung**

`src/ui/screens/PreflopScreen.tsx` anlegen:
```tsx
import { useCallback, useEffect } from 'react';
import { PREFLOP_KINDS, PREFLOP_KIND_LABELS, type PreflopAction, STACK_DEPTHS } from '../../engine/preflop/spots';
import { type PreflopFilter, preflopFilterOf } from '../../game/preflop-filter';
import { PreflopActionBar } from '../components/ActionBar';
import { PreflopTable } from '../components/PokerTable';
import { PreflopFeedbackPanel } from '../components/PreflopFeedbackPanel';
import { StatusBar } from '../components/StatusBar';
import { useGame, useGameStore } from '../GameContext';
import './screens.css';

type Option<T> = { value: T; label: string };

const KIND_OPTIONS: Option<PreflopFilter['kind']>[] = [
  { value: 'all', label: 'Alle' },
  ...PREFLOP_KINDS.map((kind) => ({ value: kind, label: PREFLOP_KIND_LABELS[kind] })),
];
const STACK_OPTIONS: Option<PreflopFilter['stack']>[] = [
  { value: 'all', label: 'Alle' },
  ...STACK_DEPTHS.map((stack) => ({ value: stack, label: `${stack} BB` })),
];

type FilterGroupProps<T extends string | number> = {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

function FilterGroup<T extends string | number>({ label, options, value, onChange }: FilterGroupProps<T>) {
  return (
    <div className="filter-group" role="group" aria-label={label}>
      <span className="filter-group__label muted" aria-hidden="true">
        {label}
      </span>
      <div className="filter-group__options">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            className={`btn filter-group__option${option.value === value ? ' btn--gold' : ''}`}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PreflopScreen({ onBack }: { onBack: () => void }) {
  const store = useGameStore();
  const game = useGame();
  const filter = preflopFilterOf(game.save.profile);
  const locked = game.info.readOnly;
  const hasSpot = game.preflopCurrent !== null;

  // startPreflop resumes an unanswered spot, so repeating it (StrictMode, tab hand-over) is safe.
  useEffect(() => {
    if (!locked) store.startPreflop();
  }, [store, locked, hasSpot]);

  const onAction = useCallback(
    (action: PreflopAction) => {
      store.answerPreflop(action);
    },
    [store],
  );
  const onNext = useCallback(() => {
    store.nextPreflopSpot();
  }, [store]);
  const setFilter = (patch: Partial<PreflopFilter>) => store.setPreflopFilter({ ...filter, ...patch });

  const current = game.preflopCurrent;
  return (
    <>
      <div className="screen-header">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          ← Menü
        </button>
        <span className="muted">Starthand-Training</span>
      </div>
      <StatusBar status={game.status} xp={game.save.profile.xp} />
      <section className="panel filters" aria-label="Filter">
        <FilterGroup label="Spot-Typ" options={KIND_OPTIONS} value={filter.kind} onChange={(kind) => setFilter({ kind })} />
        <FilterGroup label="Stack" options={STACK_OPTIONS} value={filter.stack} onChange={(stack) => setFilter({ stack })} />
      </section>
      {current && (
        <>
          <PreflopTable key={current.shownAt} spot={current.spot} cards={current.cards} />
          <PreflopActionBar spot={current.spot} answered={game.preflopLast !== null} onAction={onAction} onNext={onNext} />
          {game.preflopLast && <PreflopFeedbackPanel result={game.preflopLast} />}
        </>
      )}
    </>
  );
}
```

`src/ui/screens/HomeScreen.tsx`:
- `Screen` ersetzen: `export type Screen = 'home' | 'training' | 'preflop' | 'daily' | 'run' | 'stats' | 'settings';`
- Im Array `tiles` als ersten Eintrag ergänzen:
```tsx
    {
      title: 'Starthand-Training',
      text: 'Open-Raise, 3-Bet und Verteidigung mit 40 und 100 BB',
      button: 'Starthände trainieren',
      target: 'preflop',
      locked,
    },
```

`src/ui/App.tsx`:
- Import ergänzen: `import { PreflopScreen } from './screens/PreflopScreen';`
- Nach der Zeile mit `<PlayScreen …/>` ergänzen:
```tsx
        {screen === 'preflop' && <PreflopScreen onBack={home} />}
```

`src/ui/screens/screens.css` ans Ende anhängen:
```css
.filters {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-group__label {
  font-size: 13px;
}

.filter-group__options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.filter-group__option {
  min-height: 44px;
  padding: 0 12px;
  font-size: 14px;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/ui/screens/PreflopScreen.test.tsx src/ui/App.test.tsx` → Expected: PASS.

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/ui/screens/PreflopScreen.tsx src/ui/screens/PreflopScreen.test.tsx src/ui/screens/HomeScreen.tsx src/ui/screens/screens.css src/ui/App.tsx src/ui/App.test.tsx
git commit -m "feat(ui): Starthand-Bildschirm mit gemerkten Filtern und Kachel auf der Startseite" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Statistik-Abschnitt „Starthände“

**Files:**
- Create: `src/ui/components/StatsBlocks.tsx`, `src/ui/components/PreflopStats.tsx`, `src/ui/components/PreflopStats.test.tsx`
- Modify: `src/game/stats.ts`, `src/ui/screens/StatsScreen.tsx`, `src/ui/screens/stats.css`
- Test: `src/game/stats.test.ts`, `src/ui/screens/StatsScreen.test.tsx` (ergänzen)

**Interfaces:**
- Consumes: `PreflopRecord`, `preflopRecords`, `pushFoldRecords`, `accuracyBy`, `accuracy`, `errorMatrix` (Task 1); `ErrorHeatmap`; `PREFLOP_KINDS`, `PREFLOP_KIND_LABELS`, `STACK_DEPTHS`, `POSITIONS`, `POSITION_LABELS`
- Produces:
  - `src/game/stats.ts`: `byPreflopKind(r: PreflopRecord): PreflopKind`, `byPreflopHero(r: PreflopRecord): Position`, `byPreflopStack(r: PreflopRecord): string` (`'40 BB'` / `'100 BB'`), `preflopHandErrorMatrix(records: readonly DecisionRecord[], kind: PreflopKind): { total: number[]; errors: number[] }`
  - `src/ui/components/StatsBlocks.tsx`: `EMPTY_ACCURACY: Accuracy`, `type AccuracyRow = { label: string; accuracy: Accuracy }`, `AccuracyTable({ title: string; rows: readonly AccuracyRow[] })`, `SummaryTiles({ records: readonly DecisionRecord[] })`
  - `src/ui/components/PreflopStats.tsx`: `PreflopStats({ records: readonly PreflopRecord[] })` — `<section aria-label="Starthände">` mit Überschrift „Starthände“, Kacheln, Tabellen „Starthände nach Spot-Typ“, „Starthände nach Position“, „Starthände nach Stack“ und „Starthände: Fehler-Heatmap“ mit Umschalter je Spot-Typ
  - `StatsScreen`: Abschnitt `<section aria-label="Push/Fold">` (nur Push/Fold), danach `PreflopStats`, danach Run und Daily wie bisher

- [ ] **Step 1: Failing Tests schreiben**

In `src/game/stats.test.ts` den Import um `byPreflopHero`, `byPreflopKind`, `byPreflopStack`, `preflopHandErrorMatrix` erweitern und anhängen (nutzt `preRec`, `rfiCo`, `rec`, `btn` aus Task 1):
```ts
describe('starthand statistics', () => {
  const records = () => [
    preRec(rfiCo('A9o'), 'wrong'),
    preRec(rfiCo('A9o'), 'correct'),
    preRec({ kind: 'vsOpen', stack: 40, hero: 'BB', villain: 'UTG', hand: parseHand('KJo') }, 'close'),
    preRec({ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN', hand: parseHand('AQo') }, 'wrong'),
  ];

  it('groups by spot type, hero position and stack', () => {
    expect(accuracyBy(records(), byPreflopKind).get('rfi')).toEqual({ correct: 1, total: 2, rate: 0.5 });
    expect(accuracyBy(records(), byPreflopKind).get('vsOpen')).toEqual({ correct: 1, total: 1, rate: 1 });
    expect(accuracyBy(records(), byPreflopHero).get('CO')?.total).toBe(3);
    expect(accuracyBy(records(), byPreflopStack).get('40 BB')).toEqual({ correct: 1, total: 1, rate: 1 });
    expect(accuracyBy(records(), byPreflopStack).get('100 BB')?.total).toBe(3);
  });

  it('counts errors per hand for one starthand spot type and skips push/fold records', () => {
    const m = preflopHandErrorMatrix([...records(), rec(btn(10, 'A9o'), 'wrong')], 'rfi');
    expect(m.total).toHaveLength(169);
    expect(m.total[parseHand('A9o')]).toBe(2);
    expect(m.errors[parseHand('A9o')]).toBe(1);
    expect(m.total[parseHand('AQo')]).toBe(0);
    expect(preflopHandErrorMatrix(records(), 'vs3bet').errors[parseHand('AQo')]).toBe(1);
  });
});
```

`src/ui/components/PreflopStats.test.tsx` anlegen:
```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseHand } from '../../engine/cards';
import type { Position } from '../../engine/positions';
import type { PreflopKind, StackDepth } from '../../engine/preflop/spots';
import type { Verdict } from '../../engine/pushfold';
import type { PreflopRecord } from '../../game/stats';
import { PreflopStats } from './PreflopStats';

let ts = 0;
const pre = (
  kind: PreflopKind, hero: Position, villain: Position | null, stack: StackDepth, hand: string, verdict: Verdict,
): PreflopRecord => ({
  ts: ++ts, dateKey: '2026-10-13', mode: 'training', game: 'preflop',
  spot: { kind, stack, hero, villain, hand: parseHand(hand) }, chosen: 'fold', verdict, responseMs: 2000,
});
const records = [
  pre('rfi', 'CO', null, 100, 'A9o', 'wrong'),
  pre('rfi', 'CO', null, 100, 'A9o', 'correct'),
  pre('vsOpen', 'BB', 'UTG', 40, 'KJo', 'close'),
  pre('vs3bet', 'CO', 'BTN', 100, 'AQo', 'wrong'),
];

function cells(title: string, label: string): string[] {
  const table = screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;
  const row = within(table).getByRole('rowheader', { name: label }).closest('tr') as HTMLTableRowElement;
  return Array.from(row.cells, (cell) => cell.textContent ?? '');
}

describe('PreflopStats', () => {
  it('invites to try the training without records', () => {
    render(<PreflopStats records={[]} />);
    expect(screen.getByRole('region', { name: 'Starthände' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Starthände' })).toBeTruthy();
    expect(screen.getByText(/Noch keine Starthand-Entscheidungen/)).toBeTruthy();
  });

  it('shows the hit rate by spot type, position and stack', () => {
    render(<PreflopStats records={records} />);
    expect(cells('Starthände nach Spot-Typ', 'Open-Raise')).toEqual(['Open-Raise', '2', '50 %']);
    expect(cells('Starthände nach Spot-Typ', 'Gegen Open-Raise')).toEqual(['Gegen Open-Raise', '1', '100 %']);
    expect(cells('Starthände nach Spot-Typ', 'Gegen 3-Bet')).toEqual(['Gegen 3-Bet', '1', '0 %']);
    expect(cells('Starthände nach Position', 'CO')).toEqual(['CO', '3', '33 %']);
    expect(cells('Starthände nach Position', 'BB')).toEqual(['BB', '1', '100 %']);
    expect(cells('Starthände nach Stack', '40 BB')).toEqual(['40 BB', '1', '100 %']);
    expect(cells('Starthände nach Stack', '100 BB')).toEqual(['100 BB', '3', '33 %']);
    const tiles = within(screen.getByText('Ø Antwortzeit').closest('.stats-tiles') as HTMLElement);
    expect(tiles.getByText('50 %')).toBeTruthy();
    expect(tiles.getByText('4')).toBeTruthy();
    expect(tiles.getByText('2,0 s')).toBeTruthy();
  });

  it('shows the error heatmap per spot type', () => {
    render(<PreflopStats records={records} />);
    expect(screen.getByRole('heading', { name: 'Starthände: Fehler-Heatmap' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open-Raise' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTitle('A9o: 1 von 2 falsch')).toBeTruthy();
    expect(screen.getByTitle('AQo: noch nicht gespielt')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gegen 3-Bet' }));
    expect(screen.getByTitle('AQo: 1 von 1 falsch')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gegen 3-Bet' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Gegen Open-Raise' }));
    expect(screen.getByTitle('KJo: 0 von 1 falsch')).toBeTruthy();
  });
});
```

In `src/ui/screens/StatsScreen.test.tsx` im `describe('StatsScreen')` ergänzen (nutzt `state()` und den Import `type PreflopRecord` aus Task 1):
```tsx
  const starthand = (verdict: Verdict): PreflopRecord => ({
    ts: ++ts, dateKey: '2026-10-13', mode: 'training', game: 'preflop',
    spot: { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: parseHand('A7o') },
    chosen: 'raise', verdict, responseMs: 1000,
  });

  it('separates the push/fold numbers from the starthand section', () => {
    const s = state();
    renderWithStore(<StatsScreen onBack={() => {}} />, {
      initial: { ...s, decisions: [...s.decisions, starthand('correct'), starthand('correct'), starthand('correct')] },
    });
    const pushFold = within(screen.getByRole('region', { name: 'Push/Fold' }));
    const pfTiles = within(pushFold.getByText('Ø Antwortzeit').closest('.stats-tiles') as HTMLElement);
    expect(pfTiles.getByText('50 %')).toBeTruthy();
    expect(pfTiles.getByText('4')).toBeTruthy();
    expect(pushFold.getByTitle('A7o: 1 von 3 falsch')).toBeTruthy();
    const starthands = within(screen.getByRole('region', { name: 'Starthände' }));
    const shTiles = within(starthands.getByText('Ø Antwortzeit').closest('.stats-tiles') as HTMLElement);
    expect(shTiles.getByText('100 %')).toBeTruthy();
    expect(shTiles.getByText('3')).toBeTruthy();
    expect(shTiles.getByText('1,0 s')).toBeTruthy();
    expect(starthands.getByTitle('A7o: 0 von 3 falsch')).toBeTruthy();
  });

  it('shows the starthand section without push/fold decisions', () => {
    renderWithStore(<StatsScreen onBack={() => {}} />, { initial: { ...emptyState(), decisions: [starthand('wrong')] } });
    expect(screen.queryByText(/Noch keine Entscheidungen/)).toBeNull();
    expect(screen.getByText('Noch keine Push/Fold-Entscheidungen.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Starthände' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Starthände nach Spot-Typ' })).toBeTruthy();
  });
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/game/stats.test.ts src/ui/components/PreflopStats.test.tsx src/ui/screens/StatsScreen.test.tsx`
Expected: FAIL (`byPreflopKind` usw. fehlen, `./PreflopStats` fehlt, keine Region „Push/Fold“).

- [ ] **Step 3: Implementierung**

`src/game/stats.ts`:
- Den Typ-Import aus `../engine/preflop/spots` ersetzen durch:
```ts
import type { PreflopAction, PreflopKind, PreflopSpot } from '../engine/preflop/spots';
```
- Ans Ende anhängen:
```ts
export const byPreflopKind = (r: PreflopRecord): PreflopKind => r.spot.kind;
export const byPreflopHero = (r: PreflopRecord): Position => r.spot.hero;
export const byPreflopStack = (r: PreflopRecord): string => `${r.spot.stack} BB`;

/** Starthand only, for one spot type. */
export function preflopHandErrorMatrix(records: readonly DecisionRecord[], kind: PreflopKind): { total: number[]; errors: number[] } {
  return errorMatrix(preflopRecords(records).filter((r) => r.spot.kind === kind));
}
```

`src/ui/components/StatsBlocks.tsx` anlegen:
```tsx
import { formatPercent } from '../../app/format';
import { type Accuracy, type DecisionRecord, accuracy } from '../../game/stats';

export const EMPTY_ACCURACY: Accuracy = { correct: 0, total: 0, rate: null };
export type AccuracyRow = { label: string; accuracy: Accuracy };

const seconds = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function AccuracyTable({ title, rows }: { title: string; rows: readonly AccuracyRow[] }) {
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

export function SummaryTiles({ records }: { records: readonly DecisionRecord[] }) {
  const total = accuracy(records);
  const avgMs = records.length > 0 ? records.reduce((sum, r) => sum + r.responseMs, 0) / records.length : 0;
  return (
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
  );
}
```

`src/ui/components/PreflopStats.tsx` anlegen:
```tsx
import { useState } from 'react';
import { POSITIONS, POSITION_LABELS } from '../../engine/positions';
import { PREFLOP_KINDS, PREFLOP_KIND_LABELS, type PreflopKind, STACK_DEPTHS } from '../../engine/preflop/spots';
import {
  type PreflopRecord,
  accuracyBy,
  byPreflopHero,
  byPreflopKind,
  byPreflopStack,
  preflopHandErrorMatrix,
} from '../../game/stats';
import { ErrorHeatmap } from './ErrorHeatmap';
import { AccuracyTable, EMPTY_ACCURACY, SummaryTiles } from './StatsBlocks';

export function PreflopStats({ records }: { records: readonly PreflopRecord[] }) {
  const [kind, setKind] = useState<PreflopKind>('rfi');
  if (records.length === 0) {
    return (
      <section className="stats-block" aria-label="Starthände">
        <h2 className="stats-heading">Starthände</h2>
        <p className="panel muted">Noch keine Starthand-Entscheidungen. Probier das Starthand-Training auf der Startseite aus.</p>
      </section>
    );
  }
  const kinds = accuracyBy(records, byPreflopKind);
  const heroes = accuracyBy(records, byPreflopHero);
  const stacks = accuracyBy(records, byPreflopStack);
  const matrix = preflopHandErrorMatrix(records, kind);
  return (
    <section className="stats-block" aria-label="Starthände">
      <h2 className="stats-heading">Starthände</h2>
      <SummaryTiles records={records} />
      <AccuracyTable
        title="Starthände nach Spot-Typ"
        rows={PREFLOP_KINDS.map((k) => ({ label: PREFLOP_KIND_LABELS[k], accuracy: kinds.get(k) ?? EMPTY_ACCURACY }))}
      />
      <AccuracyTable
        title="Starthände nach Position"
        rows={POSITIONS.map((p) => ({ label: POSITION_LABELS[p], accuracy: heroes.get(p) ?? EMPTY_ACCURACY }))}
      />
      <AccuracyTable
        title="Starthände nach Stack"
        rows={STACK_DEPTHS.map((s) => ({ label: `${s} BB`, accuracy: stacks.get(`${s} BB`) ?? EMPTY_ACCURACY }))}
      />
      <section className="panel stats-section">
        <h3 className="stats-section__title">Starthände: Fehler-Heatmap</h3>
        <div className="stats-toggle stats-toggle--three">
          {PREFLOP_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`btn${kind === k ? ' btn--gold' : ''}`}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {PREFLOP_KIND_LABELS[k]}
            </button>
          ))}
        </div>
        <ErrorHeatmap total={matrix.total} errors={matrix.errors} />
      </section>
    </section>
  );
}
```

`src/ui/screens/StatsScreen.tsx` vollständig ersetzen:
```tsx
import { useState } from 'react';
import { formatCount } from '../../app/format';
import { POSITIONS, POSITION_LABELS } from '../../engine/positions';
import { STACK_BUCKETS, type SpotKind } from '../../engine/spot-generator';
import {
  type PushFoldRecord,
  accuracyBy,
  byKind,
  byPosition,
  byStackBucket,
  handErrorMatrix,
  preflopRecords,
  pushFoldRecords,
  weeklyTrend,
} from '../../game/stats';
import { localDateKey } from '../../game/streak';
import { ErrorHeatmap } from '../components/ErrorHeatmap';
import { PreflopStats } from '../components/PreflopStats';
import { AccuracyTable, EMPTY_ACCURACY, SummaryTiles } from '../components/StatsBlocks';
import { TrendChart } from '../components/TrendChart';
import { useGame } from '../GameContext';
import './screens.css';
import './stats.css';

const KIND_LABELS: Record<SpotKind, string> = { open: 'Open-Shove', call: 'Call vs. Shove' };
const shortDate = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}.`;

function PushFoldStats({ records }: { records: readonly PushFoldRecord[] }) {
  const [kind, setKind] = useState<SpotKind>('open');
  const positions = accuracyBy(records, byPosition);
  const buckets = accuracyBy(records, byStackBucket);
  const kinds = accuracyBy(records, byKind);
  const matrix = handErrorMatrix(records, kind);
  const trend = weeklyTrend(records, localDateKey(new Date()));
  return (
    <>
      <SummaryTiles records={records} />
      <AccuracyTable
        title="Nach Position"
        rows={POSITIONS.map((p) => ({ label: POSITION_LABELS[p], accuracy: positions.get(p) ?? EMPTY_ACCURACY }))}
      />
      <AccuracyTable
        title="Nach Stack"
        rows={STACK_BUCKETS.map((b) => ({ label: `${b} BB`, accuracy: buckets.get(b) ?? EMPTY_ACCURACY }))}
      />
      <AccuracyTable
        title="Nach Spot-Typ"
        rows={(['open', 'call'] as const).map((k) => ({ label: KIND_LABELS[k], accuracy: kinds.get(k) ?? EMPTY_ACCURACY }))}
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
    </>
  );
}

export function StatsScreen({ onBack }: { onBack: () => void }) {
  const game = useGame();
  // The push/fold numbers never include starthand decisions; those get their own section.
  const pushFold = pushFoldRecords(game.save.decisions);
  const preflop = preflopRecords(game.save.decisions);

  const header = (
    <div className="screen-header">
      <button type="button" className="btn btn--ghost" onClick={onBack}>
        ← Menü
      </button>
      <span className="muted">Statistik</span>
    </div>
  );
  if (pushFold.length === 0 && preflop.length === 0) {
    return (
      <>
        {header}
        <p className="panel">Noch keine Entscheidungen. Spiel ein paar Spots, dann siehst du hier deine Stärken und Schwächen.</p>
      </>
    );
  }

  const recentRuns = [...game.save.runs].reverse().slice(0, 5);
  const recentDailies = Object.values(game.save.daily)
    .sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
    .slice(0, 7);

  return (
    <>
      {header}
      <section className="stats-block" aria-label="Push/Fold">
        <h2 className="stats-heading">Push/Fold</h2>
        {pushFold.length > 0 ? (
          <PushFoldStats records={pushFold} />
        ) : (
          <p className="panel muted">Noch keine Push/Fold-Entscheidungen.</p>
        )}
      </section>
      <PreflopStats records={preflop} />
      <section className="panel stats-section">
        <h3 className="stats-section__title">Endphase-Run</h3>
        {game.save.bestRun ? (
          <p>Beste Platzierung: Platz {formatCount(game.save.bestRun.placement)}</p>
        ) : (
          <p className="muted">Noch kein Run gespielt</p>
        )}
        <ul className="stats-list">
          {recentRuns.map((r) => (
            <li key={r.ts}>
              {shortDate(r.dateKey)}: Platz {formatCount(r.placement)}
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

`src/ui/screens/stats.css`: nach `.stats-toggle` ergänzen:
```css
.stats-toggle--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.stats-toggle--three .btn {
  font-size: 14px;
  line-height: 1.2;
  padding: 4px 6px;
}

.stats-block {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stats-heading {
  margin: 4px 0 0;
  font-size: 18px;
  color: var(--gold);
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/game/stats.test.ts src/ui/components/PreflopStats.test.tsx src/ui/screens/StatsScreen.test.tsx` → Expected: PASS (die bestehenden StatsScreen-Tests eingeschlossen).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/game/stats.ts src/game/stats.test.ts src/ui/components/StatsBlocks.tsx src/ui/components/PreflopStats.tsx src/ui/components/PreflopStats.test.tsx src/ui/screens/StatsScreen.tsx src/ui/screens/StatsScreen.test.tsx src/ui/screens/stats.css
git commit -m "feat(statistik): Abschnitt Starthände mit Trefferquoten und Fehler-Heatmap, Push/Fold-Zahlen ohne Starthände" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Build-Prüfung und manuelle Abnahme

**Files:**
- Keine Änderungen geplant. Nur wenn eine Prüfung scheitert, wird die Ursache im betroffenen Task-Bereich behoben und mit eigenem Commit festgehalten.

- [ ] **Step 1: Automatische Prüfungen**

Run: `npm test` → Expected: alle PASS.
Run: `npm run typecheck` → Expected: Exit 0.
Run: `npm run check:portability` → Expected: keine Befunde.
Run: `npm run build` → Expected: Build ohne Fehler und ohne neue Warnungen; `dist/` enthält `index.html`, `sw.js` und das Manifest.

- [ ] **Step 2: Manuelle Abnahme (Controller)**

Run: `npm run preview`, dann im Browser am PC und in der Größe 375×812 prüfen:

- Alter Spielstand: Vor dem Wechsel auf diesen Stand in den Einstellungen einen Export ziehen. Nach dem Laden der neuen Version sind XP, Rang, Streak, Daily-Ergebnisse, laufender Run und Statistik unverändert; es erscheint kein Hinweis auf einen defekten Spielstand.
- Startseite: Kachel „Starthand-Training“ mit Button „Starthände trainieren“; im Nur-Lesen-Modus gesperrt.
- Filter: „Spot-Typ“ (Alle / Open-Raise / Gegen Open-Raise / Gegen 3-Bet) und „Stack“ (Alle / 40 BB / 100 BB) wählen; nach Neuladen der Seite sind die Filter noch gesetzt; der Spot passt zum Filter.
- Tisch: Open-Raise und 3-Bet als Einsätze mit Dezimalkomma („Raise 2,2 BB“, „3-Bet 6,6 BB“), Stacks am eigenen und gegnerischen Platz, Infozeile „… BB effektiv“, Pot.
- Buttons: Open-Raise nur Fold und „Raise auf … BB“; gegen Open-Raise Fold, Call, „3-Bet auf … BB“; gegen 3-Bet bei 40 BB „All-in 40 BB“, bei 100 BB „4-Bet auf … BB“. Am Handy sind die drei Buttons lesbar und mindestens 48 px hoch.
- Tastatur: F = Fold, C = Call (nur wenn erlaubt), R und A = aggressiv, Leertaste/Enter = weiter.
- Feedback: Ergebnis, „Deine Wahl“, „Richtige Aktion“ (bei Grenzhand mit „auch okay“), XP-Zeile, Chart mit vier Farben und markierter Hand, Lernsatz, „Standard-Chart, kein Solver-Ergebnis“, Positions-Vergleich mit Zusammenfassung.
- Gemeinsamer Fortschritt: Eine Starthand-Antwort erhöht den Tageszähler „Heute x/20“ und die XP in der Statusleiste; Combo läuft über beide Trainings; ein Rangaufstieg zeigt die Feier; Sounds für Austeilen, richtig und falsch.
- Statistik: Push/Fold-Abschnitt zählt keine Starthände; Abschnitt „Starthände“ mit Kacheln, Trefferquote nach Spot-Typ, Position und Stack sowie Fehler-Heatmap mit Umschalter je Spot-Typ.
- Export der Datei, Import derselben Datei: Starthand-Entscheidungen und Filter bleiben erhalten.
- Offline: Nach einmaligem Laden funktioniert das Starthand-Training ohne Netz.

- [ ] **Step 3: Übergabe**

Ergebnis der Prüfungen festhalten. Die Veröffentlichung erfolgt über den Merge des Pull Requests von `feat/starthand-ui` (nicht Teil dieses Plans).
