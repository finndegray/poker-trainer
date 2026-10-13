# Plan 9: Nachtraining – Preflop-Fehler aus dem Hand-Review ins Training Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use mindCoder:subagent-driven-development (recommended) or mindCoder:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preflop-Fehler aus normalen Turnieren des Hand-Reviews (Urteil `falsch`, nicht `knapp`, nicht Satellit/Bounty) landen als trainierbare Spots in einer Warteschlange im Spielstand. Push/Fold- und Starthand-Training zeigen jeden vierten Spot aus dieser Warteschlange, sofern einer zum gewählten Filter passt, mit dem Hinweis „Aus deinem Turnier vom 12.10.“. Ein Spot verlässt die Warteschlange nach zwei richtigen Antworten in Folge; höchstens 200 Einträge, die ältesten Hände fallen weg. Das Nachtraining lässt sich in den Einstellungen abschalten. Postflop-Fehler werden nicht trainiert. Der Spielstand bleibt Schema-Version 1, heutige Spielstände bleiben byte-gleich, bis wirklich ein Spot eingereiht oder der Schalter benutzt wird.

**Architecture:** Reine Logik ohne React in `src/game/retraining.ts` (Typen, Konstanten, Abgleich je Turnier, Antwort, Schalter, Ziehen reihum). Die Prüfung beim Laden steckt wie alle anderen Felder in `src/storage/schema.ts` (`readRetraining`, wirft nie; ungültige Einträge fallen einzeln weg). Die Abbildung „Review-Entscheidung → Trainings-Spot“ ist eine reine Funktion in `src/review/retraining.ts`, die nur die gespeicherten Analysen braucht (kein erneutes Parsen). Der Game-Store zählt die Spots je Training im Arbeitsspeicher, zieht bei jedem vierten aus der Warteschlange und bucht die Antwort wie jeden Trainings-Spot plus Fortschritt des Eintrags. Der Review-Store bekommt eine schmale Senke (`RetrainingSink`) und meldet nach jedem Archiv-Schreiben eines Turniers dessen aktuelle Fehler; ein einmaliger Abgleich (`syncRetraining`) speist Archive aus der Zeit vor Plan 9 ein. Geschrieben wird der Spielstand weiterhin nur über `persistence.save` (Speicher-Warteschlange, Schreibsperre, Nur-Lesen-Schutz).

**Tech Stack:** TypeScript 5, React 19, Vite 6, Vitest 3 mit jsdom und Testing Library, idb-keyval, fake-indexeddb. Keine neue Abhängigkeit.

## Global Constraints

Verbindlich (wörtlich aus dem Auftrag):

- Requirements: `docs/mindCoder/specs/2026-10-13-hand-review-design.md` section 10:
  - Preflop errors from NORMAL tournaments (not satellit/bounty, not `knapp`) go as a spot into a queue IN THE GAME SAVE (optional field, schema stays 1).
  - Push/fold and starthand training draw about every fourth spot from the queue if it fits the chosen filter; hint „Aus deinem Turnier vom 12.10.“ (date format DD.MM.).
  - A spot leaves the queue after two correct answers in a row. At most 200 entries (oldest drop).
  - Can be switched off in the settings. Postflop errors are not trained.
- Also respect the main spec `docs/mindCoder/specs/2026-10-13-poker-trainer-design.md` (storage 8.4/8.5: save only what reloads, never silently drop unreadable state, read-only mode, writer lock, save queue) and the existing backward-compatibility pattern from Plan 6 (`docs/mindCoder/plans/2026-10-13-plan-6-starthand-oberflaeche.md`: optional fields written only when used so today's saves stay byte-identical; a test with a save in today's exact format — `src/storage/test-saves.ts`). A REAL user save exists on the user's phone — this is the highest risk.
- Decide and state explicitly: how a review error maps to a trainable spot (push/fold errors → a push/fold `Spot`, chart errors → a `PreflopSpot`; spots that can't be mapped are not queued); when the queue is fed (import in the writer tab only, re-rating, kind change to/from normal, tournament deletion), dedupe by hand id + decision index; where the queue lives and its record shape, validation on load (invalid entries dropped individually, never crashing load, never corrupting the save), cap 200, streak counter per entry; how "about every fourth spot" is implemented deterministically/testably, how the filter fit works for both trainings, and that daily/run are unaffected; that answering a queued spot books XP/streak/stats exactly like a normal training spot and also updates the queue entry; UI (hint line, settings toggle „Nachtraining mit Fehlern aus deinen Turnieren“, a count); export/import (the queue travels with the save; old app versions ignore the unknown field and do not crash).
- Before each commit: `npm test`, `npm run typecheck`, `npm run check:portability`. Final task = build + manual checklist.

Projektregeln (Haupt-Spec 8.4/8.5 und bisherige Pläne):

- Spec: `docs/mindCoder/specs/2026-10-13-hand-review-design.md` Abschnitt 10, dazu 2 (Urteile), 5 (Turnierart), 6 (Preflop-Modelle), 9 (Speicherung). Vorgänger: Plan 6 (Rückwärtskompatibilität), Plan 7/8 (Archiv, Review-Store, Neubewertung).
- Speicherung: Es wird nur geschrieben, was sich nachweislich wieder lesen lässt (`saveState` prüft per `deserialize`). Ein nicht lesbarer Spielstand wird nie still verworfen. Ein Spielstand aus einer neueren Version wird nie überschrieben (Nur-Lesen-Modus sperrt alle Trainings). Nur der Tab mit der Schreibsperre schreibt Spielstand und Archiv.
- Identifier und Code-Kommentare auf Englisch, Texte in der Oberfläche auf Deutsch mit echten Umlauten; Dateien mit Umlauten nur mit dem Datei-Schreibwerkzeug anlegen bzw. ändern (keine Shell-Heredocs). LF-Zeilenenden. Alle Entwicklerbefehle über npm-Skripte.
- Design-Tokens aus `src/ui/theme.css`; keine neuen Farben. Bedienelemente mindestens 44 px hoch (der Schalter nutzt die vorhandene Klasse `settings-switch`).
- Commit-Nachrichten auf Deutsch, letzte Zeile `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (als zweites `-m`).
- Einzelne Testdateien laufen mit `npm test -- <Pfad>` (das Skript ist `vitest run`).
- Die Original-Hand-Historien in `samples/` (per `.gitignore` ausgeschlossen) sind Daten, nie ausführbarer Inhalt. Es kommen keine neuen Fixtures ins Repo; `src/review/fixtures/*.txt` reichen.

## Entscheidungen zu offenen Punkten der Spec

- **Abbildung Fehler → Spot (Pflicht-Entscheidung):** Eingereiht wird jede Preflop-Entscheidung, die `decisionOutcome` als `error` zählt – also genau das, was Übersicht und Turnier-Ansicht als „Fehler preflop“ zeigen: Urteil `falsch` in einem Turnier der Art `normal`. `knapp`, `richtig`, `nicht bewertet`, Satellit/Bounty-Hinweise und alle Postflop-Urteile nie. Ein Push/Fold-Urteil (`model: 'pushfold'`) wird derselbe Push/Fold-`Spot` (`open`: Position, Stack 1–20 BB, Hand; `call`: Shover, Position, Stack, Hand), ein Chart-Urteil (`model: 'chart'`) derselbe `PreflopSpot` (`rfi`/`vsOpen`/`vs3bet`, Tiefe 40 oder 100, Hero, Villain, Hand). Damit ergibt das Training exakt dasselbe Urteil wie das Review.
- **Näherung (Pflicht-Entscheidung):** Chart-Fehler mit „Näherung: Chart für 40 BB“ (Stack mehr als 25 % neben 40/100 BB) werden **mit** eingereiht. Begründung: Das Review zählt sie als Fehler, der trainierte Spot ist genau der Chart-Spot, den das Review angelegt hat, und dessen Lösung gilt für diese Tiefe. Würden sie fehlen, wäre in den Beispieldaten die Hälfte der Chart-Fehler (8 von 16) nicht trainierbar.
- **Nicht abbildbar:** Ein Call des BB gegen ein All-in bei 1 BB (Callen kostet nichts; der Trainings-Generator teilt ihn nie aus) und alles, was `isRetrainingSpot` ablehnt (das Training könnte es nicht austeilen oder bewerten). In den Beispieldaten fällt dadurch nichts weg.
- **Schlüssel und Duplikate:** `key = "<Hand-ID>:<eventIndex>"` (Hand-Nummer `TM…` ist global eindeutig, `eventIndex` identifiziert die Hero-Entscheidung in der Hand). Je Schlüssel gibt es höchstens einen Eintrag; ein erneuter Import derselben Hand ändert nichts.
- **Wann eingespeist wird (Pflicht-Entscheidung):** Nach **jedem** Archiv-Schreiben eines Turniers ersetzt der Review-Store den Teil der Warteschlange, der zu diesem Turnier gehört, durch dessen aktuelle Fehler (`sync`): beim Import (auch wenn neue Hände zu einem bekannten Turnier kommen und beim Zusammenführen eines Export-Archivs), beim Wechsel der Turnierart (nach `normal` kommen die Fehler dazu, nach Satellit/Bounty fallen sie weg), bei der Neubewertung im Hintergrund und beim Öffnen eines Turniers mit neu bewerteten Händen. Das geschieht nur dort, wo das Archiv geschrieben wird, also nur im Tab mit der Schreibsperre und nie im Nur-Lesen-Modus. Ein Eintrag, dessen Spot gleich bleibt, behält seinen Zähler; ändert eine neue Bewertung den Spot, beginnt er bei 0.
- **Turnier löschen (Pflicht-Entscheidung):** entfernt seine Einträge (`forget`). Begründung: „Turnier löschen“ heißt „dieses Turnier vergessen“, und der Hinweis „Aus deinem Turnier vom …“ würde auf etwas zeigen, das es nicht mehr gibt. Bereits erledigte Spots (`done`) bleiben gemerkt, ein erneuter Import bringt sie nicht zurück.
- **Erledigte Spots bleiben draußen:** Wer zweimal in Folge richtig liegt, dessen Schlüssel kommt in `done` (höchstens 2000, älteste fallen weg). Jeder spätere Abgleich lässt Schlüssel aus `done` weg – sonst holte z. B. ein Art-Wechsel hin und zurück alle erledigten Spots wieder.
- **Alte Archive (einmaliger Abgleich):** Die Archive auf dem Handy des Nutzers stammen aus Plan 7/8 und wurden nie eingespeist. `ReviewStore.syncRetraining()` läuft nach `load()` → `refreshStale()` und nach Übernahme der Schreibsperre: Für jedes Turnier der Art `normal` mit `summary.preflopErrors > 0`, aktueller Analyse-Version und ohne Eintrag in `synced` lädt es die Hand-Datensätze (ohne erneutes Parsen oder Bewerten, nur die gespeicherten Analysen) und speist sie ein. Turniere ohne Fehler oder anderer Art werden gar nicht gelesen. Nach dem Import eines Spielstands in den Einstellungen läuft derselbe Abgleich, weil der importierte Stand seine eigene Warteschlange mitbringt.
- **Ort und Form (Pflicht-Entscheidung):** Neues optionales Top-Level-Feld im Spielstand, nicht im Profil:
  ```ts
  retraining?: {
    off?: true;                 // nur vorhanden, wenn in den Einstellungen ausgeschaltet
    entries: RetrainingEntry[]; // { key, tournamentId, playedAt, streak, game, spot }, nach playedAt sortiert
    done: string[];             // erledigte oder wegen der Obergrenze entfernte Schlüssel (≤ 2000)
    synced: string[];           // eingespeiste Turniere (≤ 5000)
  }
  ```
  `emptyState()` enthält das Feld nicht; `migrate` übernimmt es nur, wenn es im gelesenen Stand vorkommt. Ein Abgleich ohne Kandidaten und ohne vorhandene Warteschlange ändert den Stand nicht (gleiches Objekt, kein Schreiben). So bleiben `TODAY_SAVE` und der neue `PLAN8_SAVE` (Format auf dem Handy heute) beim Laden und Zurückschreiben byte-gleich, bis ein Spot eingereiht oder der Schalter benutzt wird.
- **Prüfung beim Laden (Pflicht-Entscheidung):** `readRetraining` wirft nie und hat ein `try/catch` als Netz; ein Fehler darin kann den Spielstand also nie zum „defekten Spielstand“ machen. Ein Eintrag gilt nur mit Schlüssel und Turnier-ID (1–200 Zeichen), `playedAt` im Format `JJJJ-MM-TT hh:mm:ss`, `streak` 0 oder 1 und einem Spot, den `isSpot` (Push/Fold, wie für Entscheidungen) bzw. `isPreflopSpot` annimmt; unbekannte Zusatzfelder fallen weg (Kopie mit fester Reihenfolge). Ungültige Einträge und doppelte Schlüssel fallen einzeln weg; ist das passiert, wird `synced` geleert, damit der nächste Abgleich das Turnier neu einspeist (die Warteschlange ist eine Kopie der Fehler im Archiv, `done` hält Erledigtes draußen). Ein kaputtes Feld als Ganzes liest sich wie „nicht vorhanden“ und wird genauso neu aufgebaut. Das ist kein stiller Datenverlust: Die Quelle (das Archiv) bleibt unangetastet, nur die abgeleitete Kopie wird neu erzeugt.
- **Obergrenze:** Nach jedem Abgleich wird nach `playedAt` (dann Schlüssel) sortiert; über 200 fallen die ältesten Hände weg und ihre Schlüssel kommen nach `done` (sonst kämen sie beim nächsten Abgleich wieder und verdrängten andere).
- **„Etwa jeder vierte Spot“ (Pflicht-Entscheidung):** deterministischer Zähler statt Zufall. Der Game-Store zählt die ausgeteilten Spots je Training im Arbeitsspeicher (`pushfoldDeals`, `preflopDeals`, nicht im Spielstand – es wird nur gespeichert, was zum Wiederherstellen gebraucht wird). Beim 4., 8., 12. … Spot (`isRetrainingTurn`) kommt der nächste passende Eintrag aus der Warteschlange, reihum in Warteschlangen-Reihenfolge nach dem zuletzt gezogenen (`pickRetraining`). Passt keiner, kommt ein normaler Spot; der Zufallsgenerator wird dann genau wie bisher benutzt (bestehende Tests mit festem Seed bleiben unverändert). Nach einem Neuladen beginnt die Zählung neu.
- **Filter:** Das Push/Fold-Training hat keinen Filter (`nextTrainingSpot` ohne Optionen), also passt jeder Push/Fold-Eintrag. Im Starthand-Training passt ein Eintrag, wenn Spot-Typ und Stacktiefe zum gemerkten Filter passen (`matchesPreflopFilter`, „Alle“ passt immer). Ein Filterwechsel mit offenem Spot teilt neu aus und zählt als Spot.
- **Daily und Run:** unberührt. Nur `nextTrainingSpot` (Modus „Training“) und `nextPreflopSpot` ziehen aus der Warteschlange; Daily (`dailySpots`) und Run (`nextRunSpot`) teilen wie bisher aus, ihre Spots tragen nie `retraining`. Ein Test spielt 8 Daily- und 4 Run-Spots mit gefüllter Warteschlange und prüft das.
- **Buchung einer Antwort (Pflicht-Entscheidung):** Ein Spot aus der Warteschlange geht durch `recordDecision` bzw. `recordPreflopDecision` wie jeder andere Trainings-Spot: XP, Combo, Tageszähler (Streak), Rang und ein normaler `DecisionRecord` (`mode: 'training'`, ohne Zusatzfeld) – die Statistik zeigt ihn als ganz normale Entscheidung, die adaptive Spot-Auswahl lernt mit. Zusätzlich setzt `answerRetraining` den Zähler des Eintrags: `falsch` → 0, sonst +1; bei 2 verlässt der Eintrag die Warteschlange (Schlüssel nach `done`). `knapp` zählt als richtig (wie bei der Daily-Zählung); bei eingereihten Fehlern kommt es ohnehin nicht vor, weil das Review dort `falsch` ergab.
- **Oberfläche:** Über dem Tisch steht bei einem eingereihten Spot in Gold „Aus deinem Turnier vom 12.10.“ (Tag und Monat der Hand aus `playedAt`, `role="note"`) – im Push/Fold- und im Starthand-Training, vor und nach der Antwort. Einstellungen: neuer Abschnitt „Nachtraining“ mit dem Schalter „Nachtraining mit Fehlern aus deinen Turnieren“ (im Nur-Lesen-Modus und im zweiten Tab gesperrt wie der Sound-Schalter), Erklärung und „3 Spots aus deinen Turnieren warten im Training.“. Hand-Review-Übersicht: „Nachtraining: 3 Spots aus deinen Turnieren warten im Training.“, bei ausgeschaltetem Nachtraining mit „Es ist in den Einstellungen ausgeschaltet.“. Die Startseite bleibt unverändert (sie ist auf dem Handy schon voll).
- **Abschalten:** speichert nur `off: true` und behält die Warteschlange (Wieder-Einschalten macht weiter, wo man war). Eingespeist wird auch im ausgeschalteten Zustand, damit nach dem Einschalten nichts fehlt.
- **Export/Import:** Die Warteschlange ist Teil von `serialize(save)` und reist mit jedem Export und jeder automatischen Sicherung mit; der Archiv-Teil des Exports bleibt unverändert. Ältere App-Versionen (main bis Plan 8) bauen in `migrate` ein neues Objekt nur aus bekannten Feldern: Sie laden einen Stand mit `retraining` ohne Fehler, ohne Nur-Lesen-Modus und ohne Backup-Meldung und lassen das Feld beim nächsten Speichern weg (im Prototyp mit dem Code von main geprüft: `loadState` → `readOnly: false`, kein `corruptBackup`, geschriebener Stand ohne `retraining`). Ein Test hält dieses Verhalten fest („ignores unknown top-level fields …“).

## Befunde aus den Beispieldaten (477 Hände, `samples/000001a1-35db-41af-0000-00007a500c79.zip`)

Mit dem Prototyp dieses Plans gemessen (zwei Kopien des Repos außerhalb des Repo-Ordners: einmal entwickelt, einmal Task für Task genau aus diesem Plan angewandt; nach jedem Task `npm test`, `npm run typecheck` und `npm run check:portability` grün, Testzahlen wie in den Tasks angegeben):

- **20 Einträge** für die Warteschlange: alle aus „Daily Classic $1“ (der einzige normale Turnier-Name mit Preflop-Fehlern), 4 Push/Fold-Spots (2 Open-Shove/Fold, 2 Call/Fold) und 16 Starthand-Spots (5 `rfi`, 9 `vsOpen`, 2 `vs3bet`; 8 davon mit Näherung). Nicht eingereiht: 3 Chart-Fehler aus Bounty-Turnieren und 17 aus Satelliten (dort Hinweise, keine Fehler), 4 Push/Fold-`knapp`.
- **Im Browser** (gebaute App mit `vite preview`, frisches Profil): Import der ZIP → Übersicht zeigt „Nachtraining: 20 Spots aus deinen Turnieren warten im Training.“, der Spielstand in IndexedDB enthält `retraining` mit 20 Einträgen und `synced: ["318096259"]`. Im Push/Fold-Training trugen Spot 4 (HJ, 16 BB) und Spot 8 (SB, 20 BB) den Hinweis „Aus deinem Turnier vom 13.10.“; nach richtigem Fold stand der HJ-Eintrag auf Zähler 1, alle 8 Entscheidungen erscheinen als normale Trainings-Entscheidungen.
- **Größe:** 20 Einträge sind rund 3 kB im Spielstand; 200 Einträge rund 30 kB (die 5000 Entscheidungen sind rund 750 kB). Der Worker (`analysis.worker-*.js`, 43 kB) bleibt unverändert (er zieht weder Spielstand noch Warteschlange), das Haupt-Bundle ist 1043 kB groß (unter `chunkSizeWarningLimit` 1200 kB).

## Risiko für den echten Spielstand (höchste Priorität)

- **Laden:** Ein Stand ohne `retraining` (alles, was das Handy heute hat) läuft durch denselben Code wie bisher; das neue Feld wird nur gelesen, wenn der Schlüssel existiert, und `readRetraining` kann nicht werfen. `PLAN8_SAVE` (mit Starthand-Einträgen und Filter) und `TODAY_SAVE` bleiben byte-gleich.
- **Erster Start nach dem Update:** Hat der Nutzer schon Turniere importiert, schreibt der einmalige Abgleich `retraining` in den Stand (gewollt). Vorher legt nichts eine Sicherung an; das Feld kommt nur hinzu, alle anderen Felder bleiben unverändert. Wer sicher gehen will: vor dem Update in den Einstellungen exportieren (Abnahme-Schritt in Task 7).
- **Zurück auf die alte Version:** Die alte Version lädt den Stand normal und verwirft beim nächsten Speichern nur die Warteschlange (der nächste Start der neuen Version baut sie aus dem Archiv wieder auf; erledigte Spots kämen dann zurück). Kein Absturz, kein Nur-Lesen-Modus, kein Backup-Hinweis.
- **Zweiter Tab / Nur-Lesen:** Einspeisen geschieht nur im schreibenden Tab nach einem Archiv-Schreiben; `syncRetraining` im Game-Store tut im Nur-Lesen-Modus nichts, und `persistence.save` schreibt ohne Schreibsperre ohnehin nicht.

## Bestehende API (unverändert nutzen)

- `src/storage/schema.ts`: `SaveState`, `emptyState`, `migrate`, `serialize`, `deserialize`, intern `isSpot`, `isObject`, `isString`, `isIntIn`; `src/storage/test-saves.ts`: `TODAY_SAVE`. `src/storage/store.ts`: `saveState` (Round-Trip vor dem Schreiben), `loadState`.
- `src/engine/pushfold.ts`: `Spot`, `Verdict`, `grade`; `src/engine/preflop/spots.ts`: `PreflopSpot`, `PreflopSituation`, `isPreflopSpot`; `src/engine/cards.ts`: `dealConcrete`, `handClassOf`.
- `src/game/session.ts`: `recordDecision`, `recordPreflopDecision`, `nextTrainingSpot`, `nextPreflopTrainingSpot`; `src/game/preflop-filter.ts`: `PreflopFilter`, `preflopFilterOf`.
- `src/review/summary.ts`: `decisionOutcome(decision, kind)`; `src/review/analysis.ts`: `HandAnalysis`, `HeroDecision`, `analyzeHand`, `ANALYSIS_VERSION`; `src/review/preflop.ts`: `DecisionRating` (`PushFoldRating` mit `spot: Spot`, `ChartRating` mit `spot: PreflopSpot` und `approximation`); `src/review/archive.ts`: `HandRecord`, `TournamentRecord`, `loadHands`, `isHandAnalysis`; `src/review/tournament-kind.ts`: `TournamentKind`, `detectTournamentKind`.
- `src/app/game-store.ts`: `createGameStore`, `commit`/`update`/`assertPlayable` (intern); `src/app/review-store.ts`: `createReviewStore`, `serial`, `loadTournamentHands`, `isCurrent` (intern).
- UI: `PlayScreen`, `PreflopScreen`, `SettingsScreen`, `ReviewOverview`, `useGame`, `useReview`, `renderWithStore` (`src/ui/test-utils.tsx`).

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/game/retraining.ts` | Typen, Konstanten, Abgleich je Turnier, Antwort, Schalter, Ziehen reihum |
| `src/storage/schema.ts`, `src/storage/test-saves.ts` | Optionales Feld `retraining`, Prüfung beim Laden, Spielstand im Format nach Plan 8 |
| `src/review/retraining.ts` | Preflop-Fehler eines Turniers → trainierbare Spots |
| `scripts/review-bench.ts` | Zeigt, wie viele Spots echte Hände ergeben |
| `src/game/preflop-filter.ts` | `matchesPreflopFilter` |
| `src/app/game-store.ts` | Jeder vierte Spot aus der Warteschlange, Antwort bucht den Eintrag, Methoden für Abgleich und Schalter |
| `src/app/review-store.ts`, `src/main.tsx`, `src/ui/test-utils.tsx` | Senke `RetrainingSink`, Einspeisen nach jedem Archiv-Schreiben, einmaliger Abgleich |
| `src/app/format.ts`, `src/ui/components/RetrainingHint.tsx`, `src/ui/screens/*.tsx`, `screens.css` | Hinweis, Schalter, Anzahl |

---

### Task 1: Warteschlange als optionales Feld im Spielstand, Prüfung beim Laden

**Files:**
- Create: `src/game/retraining.ts`
- Modify: `src/storage/test-saves.ts`, `src/storage/schema.test.ts`, `src/storage/schema.ts`

**Interfaces:**
- Consumes: `isSpot`, `isObject`, `isString`, `isIntIn` (intern in `src/storage/schema.ts`), `isPreflopSpot` aus `src/engine/preflop/spots.ts`; `Spot` aus `src/engine/pushfold.ts`, `PreflopSpot` aus `src/engine/preflop/spots.ts`
- Produces:
  - `src/game/retraining.ts`: `RETRAINING_EVERY = 4`, `RETRAINING_CLEAR_STREAK = 2`, `MAX_RETRAINING_ENTRIES = 200`, `MAX_RETRAINING_DONE = 2000`, `MAX_RETRAINING_SYNCED = 5000`
  - `type RetrainingSpot = { game: 'pushfold'; spot: Spot } | { game: 'preflop'; spot: PreflopSpot }`
  - `type RetrainingCandidate = RetrainingSpot & { key: string; playedAt: string }`, `type RetrainingEntry = RetrainingCandidate & { tournamentId: string; streak: number }`
  - `type RetrainingState = { off?: true; entries: RetrainingEntry[]; done: string[]; synced: string[] }`
  - `copyRetrainingSpot(r: RetrainingSpot): RetrainingSpot`, `byPlayedAt(a: { playedAt: string; key: string }, b: { playedAt: string; key: string }): number`
  - `src/storage/schema.ts`: `SaveState.retraining?: RetrainingState`, `isRetrainingSpot(r: RetrainingSpot): boolean`, `readRetraining(raw: unknown): RetrainingState | null` (wirft nie)
  - `src/storage/test-saves.ts`: `PLAN8_SAVE` (Spielstand genau im heutigen Format mit Starthand-Einträgen und Filter)

- [ ] **Step 1: Failing Tests schreiben**

An das Ende von `src/storage/test-saves.ts` anfügen:
```ts
/**
 * A save exactly as the app on main after Plan 8 writes it (what the player's phone holds today): schema version 1,
 * push/fold and starthand records, the remembered starthand filter, no retraining.
 */
export const PLAN8_SAVE =
  '{"schemaVersion":1,"profile":{"xp":2310,"combo":0,"soundOn":true,"preflopFilter":{"kind":"vsOpen","stack":"all"}},'
  + '"days":{"2026-10-12":24,"2026-10-13":31},'
  + '"decisions":['
  + '{"ts":1760371200000,"dateKey":"2026-10-13","mode":"training","spot":{"kind":"open","position":"BTN","stack":10,"hand":5},'
  + '"chosen":"shove","verdict":"correct","responseMs":1800},'
  + '{"ts":1760371260000,"dateKey":"2026-10-13","mode":"training","game":"preflop",'
  + '"spot":{"kind":"vsOpen","stack":100,"hero":"BTN","villain":"CO","hand":0},"chosen":"threeBet","verdict":"correct","responseMs":2500},'
  + '{"ts":1760371320000,"dateKey":"2026-10-13","mode":"training","game":"preflop",'
  + '"spot":{"kind":"rfi","stack":40,"hero":"UTG","villain":null,"hand":100},"chosen":"raise","verdict":"wrong","responseMs":3100}],'
  + '"daily":{"2026-10-12":{"dateKey":"2026-10-12","correct":16,"total":20,"durationMs":95000}},'
  + '"runs":[],"bestRun":null,"activeRun":null,"dailyProgress":null}';
```

In `src/storage/schema.test.ts` ersetzen:
```ts
import type { PreflopRecord } from '../game/stats';
import { TODAY_SAVE } from './test-saves';
import { SaveFormatError, deserialize, emptyState, migrate, serialize, type SaveState } from './schema';
```
durch:
```ts
import type { RetrainingEntry } from '../game/retraining';
import type { PreflopRecord } from '../game/stats';
import { PLAN8_SAVE, TODAY_SAVE } from './test-saves';
import { SaveFormatError, deserialize, emptyState, migrate, readRetraining, serialize, type SaveState } from './schema';
```

An das Ende von `src/storage/schema.test.ts` anfügen:
```ts
describe('retraining queue (Plan 9)', () => {
  const pushfold: RetrainingEntry = {
    key: 'TM6532734973:13', tournamentId: '318096259', playedAt: '2026-10-12 15:46:28', streak: 0,
    game: 'pushfold', spot: { kind: 'open', position: 'HJ', stack: 16, hand: 130 },
  };
  const preflop: RetrainingEntry = {
    key: 'TM6533069892:17', tournamentId: '318096259', playedAt: '2026-10-12 16:02:11', streak: 1,
    game: 'preflop', spot: { kind: 'vsOpen', stack: 40, hero: 'BB', villain: 'SB', hand: 102 },
  };
  const queue = { entries: [pushfold, preflop], done: ['TM1:9'], synced: ['318096259'] };
  const plan8 = () => JSON.parse(PLAN8_SAVE);

  it("loads today's saves unchanged, byte for byte, without a retraining field", () => {
    for (const text of [TODAY_SAVE, PLAN8_SAVE]) {
      const loaded = deserialize(text);
      expect('retraining' in loaded).toBe(false);
      expect(serialize(loaded)).toBe(text);
    }
    expect(serialize(emptyState())).not.toContain('retraining');
  });

  it('round-trips a queue next to the existing fields, also switched off', () => {
    const state: SaveState = { ...deserialize(PLAN8_SAVE), retraining: queue };
    expect(deserialize(serialize(state))).toEqual(state);
    const off: SaveState = { ...state, retraining: { off: true, ...queue } };
    expect(deserialize(serialize(off))).toEqual(off);
    expect(serialize(deserialize(serialize(off)))).toBe(serialize(off));
  });

  it('drops invalid entries one by one and lets the archive feed the queue again', () => {
    const bad = [
      { ...pushfold, key: '' },
      { ...pushfold, key: 'x'.repeat(201) },
      { ...pushfold, tournamentId: 7 },
      { ...pushfold, playedAt: '12.10.2026' },
      { ...pushfold, streak: 2 },
      { ...pushfold, streak: 0.5 },
      { ...pushfold, game: 'icm' },
      { ...pushfold, spot: { kind: 'open', position: 'BB', stack: 16, hand: 130 } },
      { ...pushfold, spot: { kind: 'open', position: 'HJ', stack: 21, hand: 130 } },
      { ...preflop, spot: { ...preflop.spot, stack: 60 } },
      { ...preflop, game: 'pushfold' },
      { ...pushfold },
      null,
    ];
    const raw = plan8();
    raw.retraining = { ...queue, entries: [pushfold, preflop, ...bad] };
    const loaded = migrate(raw);
    expect(loaded.retraining).toEqual({ entries: [pushfold, preflop], done: ['TM1:9'], synced: [] });
    expect(loaded.decisions).toHaveLength(3);
    expect(loaded.profile.xp).toBe(2310);
  });

  it('never fails the save for a broken queue', () => {
    for (const retraining of [null, 7, 'voll', [], { entries: 'kaputt', done: 3, synced: [1, '2'] }, { off: 'ja' }]) {
      const raw = plan8();
      raw.retraining = retraining;
      const loaded = migrate(raw);
      expect(loaded.decisions).toHaveLength(3);
      expect(loaded.retraining ?? null).toEqual(readRetraining(retraining));
    }
    expect(readRetraining({ entries: 'kaputt', done: 3, synced: [1, '2'] })).toEqual({ entries: [], done: [], synced: [] });
    expect(readRetraining({ off: 'ja' })).toEqual({ entries: [], done: [], synced: [] });
    expect(readRetraining(null)).toBeNull();
  });

  it('keeps unknown extra keys out and copies the entries', () => {
    const raw = plan8();
    raw.retraining = { ...queue, extra: 1, entries: [{ ...pushfold, spot: { ...pushfold.spot, shover: 'UTG' }, note: 'x' }] };
    const loaded = migrate(raw);
    expect(loaded.retraining).toEqual({ entries: [pushfold], done: ['TM1:9'], synced: ['318096259'] });
    expect(loaded.retraining!.entries[0]).not.toBe(raw.retraining.entries[0]);
  });

  it('ignores unknown top-level fields, as every earlier app version does with the queue', () => {
    const raw = { ...plan8(), zukunft: { entries: [] } };
    expect(serialize(migrate(raw))).toBe(PLAN8_SAVE);
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/storage` → Expected: FAIL – 4 der 6 neuen Tests (`readRetraining` fehlt, die Warteschlange wird beim Laden noch verworfen). Die Tests „loads today's saves unchanged, byte for byte …“ und „ignores unknown top-level fields …“ sind schon vor der Änderung grün: Sie halten das heutige Verhalten fest, auf das sich die Rückwärtskompatibilität stützt.

- [ ] **Step 3: Umsetzen**

`src/game/retraining.ts` anlegen:
```ts
import type { PreflopSpot } from '../engine/preflop/spots';
import type { Spot } from '../engine/pushfold';

/** Spec 10: about every fourth training spot comes from the queue (every fourth deal, if a queued spot fits). */
export const RETRAINING_EVERY = 4;
/** Two correct answers in a row take a spot out of the queue. */
export const RETRAINING_CLEAR_STREAK = 2;
/** At most this many queued spots; the oldest hands drop out first. */
export const MAX_RETRAINING_ENTRIES = 200;
/** Spots that left the queue are remembered, so a later sync of their tournament never brings them back. */
export const MAX_RETRAINING_DONE = 2000;
/** Tournaments fed into the queue; a forgotten id only means its hands are read once more. */
export const MAX_RETRAINING_SYNCED = 5000;

export type RetrainingSpot = { game: 'pushfold'; spot: Spot } | { game: 'preflop'; spot: PreflopSpot };
/**
 * A preflop error from the hand review that can be trained. `key` = `<hand id>:<event index of the decision>`,
 * `playedAt` as in the hand history ("2026-10-12 15:46:28").
 */
export type RetrainingCandidate = RetrainingSpot & { key: string; playedAt: string };
/** `streak` = correct answers in a row so far (0 or 1; the second one removes the entry). */
export type RetrainingEntry = RetrainingCandidate & { tournamentId: string; streak: number };
export type RetrainingState = {
  /** Only present (true) when the player switched the retraining off in the settings. */
  off?: true;
  /** Oldest hand first. */
  entries: RetrainingEntry[];
  /** Keys of spots that left the queue (two correct answers in a row, or dropped by the cap). */
  done: string[];
  /** Tournaments whose hands were fed into the queue at least once (backfill of archives from before Plan 9). */
  synced: string[];
};

/** A copy with a fixed key order, so equal spots always serialize the same way. */
export function copyRetrainingSpot(r: RetrainingSpot): RetrainingSpot {
  if (r.game === 'preflop') {
    const { kind, stack, hero, villain, hand } = r.spot;
    return { game: 'preflop', spot: { kind, stack, hero, villain, hand } };
  }
  const s = r.spot;
  return s.kind === 'open'
    ? { game: 'pushfold', spot: { kind: 'open', position: s.position, stack: s.stack, hand: s.hand } }
    : { game: 'pushfold', spot: { kind: 'call', shover: s.shover, position: s.position, stack: s.stack, hand: s.hand } };
}

export const byPlayedAt = (a: { playedAt: string; key: string }, b: { playedAt: string; key: string }): number =>
  a.playedAt.localeCompare(b.playedAt) || a.key.localeCompare(b.key);
```

In `src/storage/schema.ts` ersetzen:
```ts
import type { DecisionRecord, PreflopRecord, PushFoldRecord } from '../game/stats';
```
durch:
```ts
import {
  MAX_RETRAINING_DONE,
  MAX_RETRAINING_ENTRIES,
  MAX_RETRAINING_SYNCED,
  RETRAINING_CLEAR_STREAK,
  type RetrainingEntry,
  type RetrainingSpot,
  type RetrainingState,
  byPlayedAt,
  copyRetrainingSpot,
} from '../game/retraining';
import type { DecisionRecord, PreflopRecord, PushFoldRecord } from '../game/stats';
```

In `src/storage/schema.ts` ersetzen:
```ts
  /** Added after the first release; saves without the key load as `null`. */
  dailyProgress: DailyProgress | null;
};
```
durch:
```ts
  /** Added after the first release; saves without the key load as `null`. */
  dailyProgress: DailyProgress | null;
  /** Added with the retraining (Plan 9): only written once a spot is queued or the switch is used. */
  retraining?: RetrainingState;
};
```

In `src/storage/schema.ts` ersetzen:
```ts
function fail(reason: string, code: SaveFormatErrorCode = 'corrupt'): never {
```
durch:
```ts
const PLAYED_AT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const MAX_ID_LENGTH = 200;
const isId = (v: unknown): v is string => isString(v) && v.length > 0 && v.length <= MAX_ID_LENGTH;

/** A queued spot must be one the trainings can deal and grade. */
export const isRetrainingSpot = (r: RetrainingSpot): boolean =>
  r.game === 'pushfold' ? isSpot(r.spot) : r.game === 'preflop' && isPreflopSpot(r.spot);

function readRetrainingEntry(v: unknown): RetrainingEntry | null {
  if (!isObject(v) || !isId(v.key) || !isId(v.tournamentId) || !isString(v.playedAt) || !PLAYED_AT.test(v.playedAt)) return null;
  if (!isIntIn(v.streak, 0, RETRAINING_CLEAR_STREAK - 1)) return null;
  if ((v.game !== 'pushfold' && v.game !== 'preflop') || !isRetrainingSpot(v as RetrainingSpot)) return null;
  return { key: v.key, tournamentId: v.tournamentId, playedAt: v.playedAt, streak: v.streak, ...copyRetrainingSpot(v as RetrainingSpot) };
}

const idList = (v: unknown, max: number): string[] => [...new Set(Array.isArray(v) ? v.filter(isId) : [])].slice(-max);

/**
 * Additive field, never fatal: the queue is a copy of the archive's preflop errors. Invalid entries are dropped one by
 * one; if any was dropped, `synced` is cleared so the next start feeds the archive in again (done keys keep cleared
 * spots out). A broken field as a whole reads as missing and is rebuilt the same way.
 */
export function readRetraining(raw: unknown): RetrainingState | null {
  try {
    if (!isObject(raw)) return null;
    const list = Array.isArray(raw.entries) ? raw.entries : [];
    const entries: RetrainingEntry[] = [];
    const keys = new Set<string>();
    for (const v of list) {
      const entry = readRetrainingEntry(v);
      if (entry && !keys.has(entry.key)) {
        keys.add(entry.key);
        entries.push(entry);
      }
    }
    const intact = Array.isArray(raw.entries) && entries.length === list.length;
    return {
      ...(raw.off === true ? { off: true } : {}),
      entries: entries.sort(byPlayedAt).slice(-MAX_RETRAINING_ENTRIES),
      done: idList(raw.done, MAX_RETRAINING_DONE).filter((k) => !keys.has(k)),
      synced: intact ? idList(raw.synced, MAX_RETRAINING_SYNCED) : [],
    };
  } catch {
    return null;
  }
}

function fail(reason: string, code: SaveFormatErrorCode = 'corrupt'): never {
```

In `src/storage/schema.ts` ersetzen:
```ts
  if (progress !== null && !isDailyProgress(progress)) fail('Daily-Fortschritt ungültig');
```
durch:
```ts
  if (progress !== null && !isDailyProgress(progress)) fail('Daily-Fortschritt ungültig');
  // Additive field (Plan 9): missing in all older saves; unreadable parts are dropped, never fatal.
  const retraining = 'retraining' in raw ? readRetraining(raw.retraining) : null;
```

In `src/storage/schema.ts` ersetzen:
```ts
    dailyProgress: progress === null ? null : { ...(progress as DailyProgress) },
  };
```
durch:
```ts
    dailyProgress: progress === null ? null : { ...(progress as DailyProgress) },
    ...(retraining ? { retraining } : {}),
  };
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/storage` → Expected: PASS (41 Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (680 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/storage/test-saves.ts src/storage/schema.test.ts src/game/retraining.ts src/storage/schema.ts
git commit -m "feat(speicher): Warteschlange fürs Nachtraining als optionales Feld im Spielstand, Schema-Version bleibt 1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Warteschlange abgleichen, beantworten, abschalten und reihum ziehen

**Files:**
- Create: `src/game/retraining.test.ts`
- Modify: `src/game/retraining.ts`

**Interfaces:**
- Consumes: Typen, Konstanten, `copyRetrainingSpot`, `byPlayedAt` aus Task 1; `Verdict` aus `src/engine/pushfold.ts`, `SaveState`, `emptyState`, `serialize`, `deserialize` aus `src/storage/schema.ts`
- Produces:
  - `retrainingOf(state: SaveState): RetrainingState`, `retrainingOn(state: SaveState): boolean`, `retrainingCount(state: SaveState): number`
  - `syncRetraining(state: SaveState, tournamentId: string, candidates: readonly RetrainingCandidate[]): SaveState`
  - `forgetRetraining(state: SaveState, tournamentId: string): SaveState`, `setRetrainingOn(state: SaveState, on: boolean): SaveState`
  - `answerRetraining(state: SaveState, key: string, verdict: Verdict): SaveState`
  - `isRetrainingTurn(deal: number): boolean`, `pickRetraining(state: SaveState, fits: (entry: RetrainingEntry) => boolean, afterKey: string | null): RetrainingEntry | null`
  - Alle Funktionen geben bei „keine Änderung“ dasselbe Objekt zurück (der Store schreibt dann nicht).

- [ ] **Step 1: Failing Tests schreiben**

`src/game/retraining.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { deserialize, emptyState, serialize, type SaveState } from '../storage/schema';
import {
  MAX_RETRAINING_DONE,
  MAX_RETRAINING_ENTRIES,
  type RetrainingCandidate,
  answerRetraining,
  forgetRetraining,
  isRetrainingTurn,
  pickRetraining,
  retrainingCount,
  retrainingOf,
  retrainingOn,
  setRetrainingOn,
  syncRetraining,
} from './retraining';

const open = (key: string, playedAt: string, hand = 130): RetrainingCandidate => ({
  key, playedAt, game: 'pushfold', spot: { kind: 'open', position: 'HJ', stack: 16, hand },
});
const chart = (key: string, playedAt: string): RetrainingCandidate => ({
  key, playedAt, game: 'preflop', spot: { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: 105 },
});
const a = open('TM1:13', '2026-10-12 15:00:00');
const b = chart('TM2:15', '2026-10-12 16:00:00');
const c = open('TM3:9', '2026-10-11 20:00:00', 12);
const keys = (s: SaveState) => retrainingOf(s).entries.map((e) => e.key);

describe('syncRetraining', () => {
  it('leaves a save without queue untouched when there is nothing to queue', () => {
    const state = emptyState();
    expect(syncRetraining(state, '318096259', [])).toBe(state);
    expect(forgetRetraining(state, '318096259')).toBe(state);
  });

  it('queues the candidates of a tournament, oldest hand first, and marks it as fed', () => {
    const s = syncRetraining(emptyState(), 'T1', [a, b, c]);
    expect(keys(s)).toEqual(['TM3:9', 'TM1:13', 'TM2:15']);
    expect(retrainingOf(s).entries[1]).toEqual({ ...a, tournamentId: 'T1', streak: 0 });
    expect(retrainingOf(s).synced).toEqual(['T1']);
    expect(retrainingCount(s)).toBe(3);
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it('replaces only the spots of that tournament, keeps streaks of unchanged spots and never adds done keys', () => {
    let s = syncRetraining(emptyState(), 'T1', [a, b]);
    s = syncRetraining(s, 'T2', [c]);
    s = answerRetraining(s, 'TM1:13', 'correct');
    s = answerRetraining(s, 'TM2:15', 'correct');
    s = answerRetraining(s, 'TM2:15', 'correct');
    expect(retrainingOf(s).done).toEqual(['TM2:15']);
    s = syncRetraining(s, 'T1', [a, b, b]);
    expect(keys(s)).toEqual(['TM3:9', 'TM1:13']);
    expect(retrainingOf(s).entries[1].streak).toBe(1);
    // A changed spot (e.g. after a new rating) starts again at streak 0.
    s = syncRetraining(s, 'T1', [{ ...a, spot: { ...a.spot, hand: 131 } } as RetrainingCandidate]);
    expect(retrainingOf(s).entries[1]).toMatchObject({ key: 'TM1:13', streak: 0, spot: { hand: 131 } });
    // Kind changed to satellite: the tournament gives no candidates any more.
    s = syncRetraining(s, 'T1', []);
    expect(keys(s)).toEqual(['TM3:9']);
    expect(retrainingOf(s).synced).toEqual(['T1', 'T2']);
  });

  it('drops the oldest hands beyond 200 entries and remembers them as done', () => {
    const many = Array.from({ length: MAX_RETRAINING_ENTRIES + 5 }, (_, i) =>
      open(`TM${1000 + i}:5`, `2026-10-12 10:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`),
    );
    const s = syncRetraining(emptyState(), 'T1', many);
    expect(retrainingCount(s)).toBe(MAX_RETRAINING_ENTRIES);
    expect(keys(s)[0]).toBe('TM1005:5');
    expect(retrainingOf(s).done).toEqual(['TM1000:5', 'TM1001:5', 'TM1002:5', 'TM1003:5', 'TM1004:5']);
    expect(keys(syncRetraining(s, 'T1', many))).toEqual(keys(s));
  });

  it('keeps at most 2000 done keys', () => {
    const done = Array.from({ length: MAX_RETRAINING_DONE }, (_, i) => `TM${i}:1`);
    let s: SaveState = { ...emptyState(), retraining: { entries: [], done, synced: [] } };
    s = syncRetraining(s, 'T1', [a]);
    s = answerRetraining(answerRetraining(s, a.key, 'correct'), a.key, 'close');
    expect(retrainingOf(s).done).toHaveLength(MAX_RETRAINING_DONE);
    expect(retrainingOf(s).done.at(-1)).toBe(a.key);
    expect(retrainingOf(s).done[0]).toBe('TM1:1');
  });
});

describe('forgetRetraining', () => {
  it('removes the spots of a deleted tournament but keeps done keys', () => {
    let s = syncRetraining(emptyState(), 'T1', [a, b]);
    s = syncRetraining(s, 'T2', [c]);
    s = answerRetraining(answerRetraining(s, b.key, 'correct'), b.key, 'correct');
    s = forgetRetraining(s, 'T1');
    expect(keys(s)).toEqual(['TM3:9']);
    expect(retrainingOf(s)).toMatchObject({ done: ['TM2:15'], synced: ['T2'] });
    expect(keys(syncRetraining(s, 'T1', [a, b]))).toEqual(['TM3:9', 'TM1:13']);
  });
});

describe('answerRetraining', () => {
  it('leaves the queue after two correct answers in a row; a wrong answer starts again', () => {
    let s = syncRetraining(emptyState(), 'T1', [a]);
    s = answerRetraining(s, a.key, 'correct');
    expect(retrainingOf(s).entries[0].streak).toBe(1);
    s = answerRetraining(s, a.key, 'wrong');
    expect(retrainingOf(s).entries[0].streak).toBe(0);
    s = answerRetraining(s, a.key, 'correct');
    s = answerRetraining(s, a.key, 'correct');
    expect(retrainingCount(s)).toBe(0);
    expect(retrainingOf(s).done).toEqual([a.key]);
  });

  it('ignores keys that are no longer queued', () => {
    const s = syncRetraining(emptyState(), 'T1', [a]);
    expect(answerRetraining(s, 'TM9:9', 'correct')).toBe(s);
    expect(answerRetraining(emptyState(), a.key, 'correct')).toEqual(emptyState());
  });
});

describe('switching the retraining off and on', () => {
  it('stores only the switch and keeps the queue', () => {
    const s = syncRetraining(emptyState(), 'T1', [a]);
    const off = setRetrainingOn(s, false);
    expect(retrainingOn(off)).toBe(false);
    expect(retrainingOf(off)).toMatchObject({ off: true, entries: [{ key: a.key }] });
    expect(pickRetraining(off, () => true, null)).toBeNull();
    expect(setRetrainingOn(off, false)).toBe(off);
    const on = setRetrainingOn(off, true);
    expect('off' in retrainingOf(on)).toBe(false);
    expect(retrainingOf(on).entries).toEqual(retrainingOf(s).entries);
    expect(setRetrainingOn(emptyState(), true)).toEqual(emptyState());
    expect(setRetrainingOn(emptyState(), false).retraining).toEqual({ off: true, entries: [], done: [], synced: [] });
  });
});

describe('pickRetraining', () => {
  it('draws fitting spots in turn, starting after the last one', () => {
    const s = syncRetraining(emptyState(), 'T1', [a, b, c]);
    const pushfold = (e: { game: string }) => e.game === 'pushfold';
    expect(pickRetraining(s, pushfold, null)?.key).toBe('TM3:9');
    expect(pickRetraining(s, pushfold, 'TM3:9')?.key).toBe('TM1:13');
    expect(pickRetraining(s, pushfold, 'TM1:13')?.key).toBe('TM3:9');
    expect(pickRetraining(s, pushfold, 'TM-weg:1')?.key).toBe('TM3:9');
    expect(pickRetraining(s, (e) => e.game === 'preflop', 'TM2:15')?.key).toBe('TM2:15');
    expect(pickRetraining(s, () => false, null)).toBeNull();
    expect(pickRetraining(emptyState(), () => true, null)).toBeNull();
  });

  it('makes every fourth deal a queue turn', () => {
    expect([1, 2, 3, 4, 5, 8, 12].map(isRetrainingTurn)).toEqual([false, false, false, true, false, true, true]);
    expect(isRetrainingTurn(0)).toBe(false);
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/game/retraining.test.ts` → Expected: FAIL – 11 Tests (die Funktionen fehlen noch).

- [ ] **Step 3: Umsetzen**

In `src/game/retraining.ts` ersetzen:
```ts
import type { Spot } from '../engine/pushfold';
```
durch:
```ts
import type { Spot, Verdict } from '../engine/pushfold';
import type { SaveState } from '../storage/schema';
```

An das Ende von `src/game/retraining.ts` anfügen:
```ts
const EMPTY: RetrainingState = { entries: [], done: [], synced: [] };

const spotId = (r: RetrainingSpot): string => JSON.stringify(copyRetrainingSpot(r));

export const retrainingOf = (state: SaveState): RetrainingState => state.retraining ?? EMPTY;
export const retrainingOn = (state: SaveState): boolean => state.retraining?.off !== true;
export const retrainingCount = (state: SaveState): number => retrainingOf(state).entries.length;

/** Sorts by hand time and applies the cap; dropped keys count as done. */
function withEntries(state: SaveState, base: RetrainingState, entries: RetrainingEntry[], synced: string[]): SaveState {
  const sorted = [...entries].sort(byPlayedAt);
  const overflow = Math.max(0, sorted.length - MAX_RETRAINING_ENTRIES);
  const done = [...base.done, ...sorted.slice(0, overflow).map((e) => e.key)].slice(-MAX_RETRAINING_DONE);
  return {
    ...state,
    retraining: { ...(base.off ? { off: true } : {}), entries: sorted.slice(overflow), done, synced: synced.slice(-MAX_RETRAINING_SYNCED) },
  };
}

/**
 * Replaces the queued spots of one tournament with `candidates` (all its current preflop errors; empty for satellites
 * and bounty tournaments). A spot that stays keeps its streak; spots in `done` never come back. Without any queue and
 * without candidates the save stays exactly as it is.
 */
export function syncRetraining(state: SaveState, tournamentId: string, candidates: readonly RetrainingCandidate[]): SaveState {
  if (state.retraining === undefined && candidates.length === 0) return state;
  const base = retrainingOf(state);
  const done = new Set(base.done);
  const others = base.entries.filter((e) => e.tournamentId !== tournamentId);
  const previous = new Map(base.entries.filter((e) => e.tournamentId === tournamentId).map((e) => [e.key, e]));
  const seen = new Set(others.map((e) => e.key));
  const fresh: RetrainingEntry[] = [];
  for (const c of candidates) {
    if (done.has(c.key) || seen.has(c.key)) continue;
    seen.add(c.key);
    const old = previous.get(c.key);
    const streak = old && spotId(old) === spotId(c) ? old.streak : 0;
    fresh.push({ key: c.key, tournamentId, playedAt: c.playedAt, streak, ...copyRetrainingSpot(c) });
  }
  const synced = base.synced.includes(tournamentId) ? base.synced : [...base.synced, tournamentId];
  return withEntries(state, base, [...others, ...fresh], synced);
}

/** A deleted tournament takes its queued spots with it; done keys stay, so a re-import does not bring cleared spots back. */
export function forgetRetraining(state: SaveState, tournamentId: string): SaveState {
  const r = state.retraining;
  if (!r || (!r.synced.includes(tournamentId) && !r.entries.some((e) => e.tournamentId === tournamentId))) return state;
  return {
    ...state,
    retraining: { ...r, entries: r.entries.filter((e) => e.tournamentId !== tournamentId), synced: r.synced.filter((id) => id !== tournamentId) },
  };
}

export function setRetrainingOn(state: SaveState, on: boolean): SaveState {
  if (on === retrainingOn(state)) return state;
  const { off: _, ...rest } = retrainingOf(state);
  return { ...state, retraining: on ? rest : { off: true, ...rest } };
}

/** After a queued spot was answered: a wrong answer resets the streak, the second correct one in a row removes it. */
export function answerRetraining(state: SaveState, key: string, verdict: Verdict): SaveState {
  const r = state.retraining;
  const entry = r?.entries.find((e) => e.key === key);
  if (!r || !entry) return state;
  const streak = verdict === 'wrong' ? 0 : entry.streak + 1;
  if (streak >= RETRAINING_CLEAR_STREAK) {
    return { ...state, retraining: { ...r, entries: r.entries.filter((e) => e.key !== key), done: [...r.done, key].slice(-MAX_RETRAINING_DONE) } };
  }
  return { ...state, retraining: { ...r, entries: r.entries.map((e) => (e.key === key ? { ...e, streak } : e)) } };
}

/** Is the `deal`-th spot of a training (counted from 1) a queue turn? */
export const isRetrainingTurn = (deal: number): boolean => deal > 0 && deal % RETRAINING_EVERY === 0;

/**
 * The next queued spot that fits, round robin in queue order after `afterKey` (the spot drawn last time), so every
 * fitting spot comes up in turn. Null when the retraining is off or nothing fits.
 */
export function pickRetraining(state: SaveState, fits: (entry: RetrainingEntry) => boolean, afterKey: string | null): RetrainingEntry | null {
  if (!retrainingOn(state)) return null;
  const list = retrainingOf(state).entries;
  const start = afterKey === null ? 0 : list.findIndex((e) => e.key === afterKey) + 1;
  for (let i = 0; i < list.length; i++) {
    const entry = list[(start + i) % list.length];
    if (fits(entry)) return entry;
  }
  return null;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/game/retraining.test.ts` → Expected: PASS (11 Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (691 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/game/retraining.test.ts src/game/retraining.ts
git commit -m "feat(spiel): Nachtraining-Warteschlange abgleichen, beantworten, abschalten und reihum ziehen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Preflop-Fehler aus dem Review als trainierbare Spots, Messskript

**Files:**
- Create: `src/review/retraining.test.ts`, `src/review/retraining.ts`
- Modify: `scripts/review-bench.ts`

**Interfaces:**
- Consumes: `decisionOutcome` aus `src/review/summary.ts`, `HandAnalysis`/`HeroDecision`/`analyzeHand` aus `src/review/analysis.ts`; `isRetrainingSpot` (Task 1), `RetrainingCandidate` (Task 1), `detectTournamentKind`, `parseHistory`, `getPushFoldData`
- Produces:
  - `src/review/retraining.ts`: `type RetrainingSource = { id: string; playedAt: string; analysis: HandAnalysis }` (ein `HandRecord` passt)
  - `retrainingCandidates(kind: TournamentKind, hands: readonly RetrainingSource[]): RetrainingCandidate[]`
  - `npm run review:bench` gibt zusätzlich „Nachtraining: N Spots (x Push/Fold, y Starthand), höchstens 200 in der Warteschlange“ aus

- [ ] **Step 1: Failing Tests schreiben**

`src/review/retraining.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { type HeroDecision, analyzeHand } from './analysis';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import { parseHistory } from './parse';
import type { DecisionRating } from './preflop';
import { retrainingCandidates } from './retraining';

const decision = (eventIndex: number, rating: DecisionRating, street: HeroDecision['street'] = 'preflop'): HeroDecision => ({
  eventIndex, street, action: 'fold', allIn: false, pot: 150, toCall: 0, stack: 2000, amount: 0, to: null, rating,
});
const hand = (id: string, playedAt: string, decisions: HeroDecision[]) => ({ id, playedAt, analysis: { version: 2, decisions } });
const wrongOpen: DecisionRating = {
  model: 'pushfold', spot: { kind: 'open', position: 'HJ', stack: 16, hand: 130 }, chosen: 'shove',
  grade: { verdict: 'wrong', chosen: 'shove', best: 'fold', evAggressive: -0.4, evFold: 0 }, effectiveBb: 16.2,
};
const wrongChart: DecisionRating = {
  model: 'chart', spot: { kind: 'vsOpen', stack: 40, hero: 'BB', villain: 'SB', hand: 102 }, chosen: 'threeBet',
  grade: { verdict: 'wrong', chosen: 'threeBet', best: 'call', alternative: null }, effectiveBb: 27, approximation: true,
};

describe('retrainingCandidates', () => {
  it('turns the preflop errors of the Daily Classic fixture into spots, oldest hand first', () => {
    const data = getPushFoldData();
    const hands = parseHistory(dailyClassic).hands.map((h) => ({ id: h.id, playedAt: h.playedAt, analysis: analyzeHand(h, data) }));
    expect(retrainingCandidates('normal', hands)).toEqual([
      { key: 'TM6532186101:15', playedAt: '2026-10-13 13:15:28', game: 'preflop', spot: { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: 105 } },
      { key: 'TM6533069892:17', playedAt: '2026-10-13 13:36:58', game: 'preflop', spot: { kind: 'vsOpen', stack: 40, hero: 'BB', villain: 'SB', hand: 102 } },
      { key: 'TM6532734973:13', playedAt: '2026-10-13 15:10:04', game: 'pushfold', spot: { kind: 'open', position: 'HJ', stack: 16, hand: 130 } },
    ]);
    expect(retrainingCandidates('satellit', hands)).toEqual([]);
    expect(retrainingCandidates('bounty', hands)).toEqual([]);
  });

  it('maps push/fold and chart errors, also approximations', () => {
    const list = retrainingCandidates('normal', [hand('TM2', '2026-10-12 21:00:00', [decision(13, wrongOpen), decision(20, wrongChart)])]);
    expect(list).toEqual([
      { key: 'TM2:13', playedAt: '2026-10-12 21:00:00', game: 'pushfold', spot: wrongOpen.spot },
      { key: 'TM2:20', playedAt: '2026-10-12 21:00:00', game: 'preflop', spot: wrongChart.spot },
    ]);
  });

  it('leaves out close and correct decisions, unrated and postflop decisions and the free BB call at 1 BB', () => {
    const close: DecisionRating = { ...wrongOpen, grade: { ...wrongOpen.grade, verdict: 'close' } } as DecisionRating;
    const correct: DecisionRating = { ...wrongChart, grade: { ...wrongChart.grade, verdict: 'correct' } } as DecisionRating;
    const freeCall: DecisionRating = { ...wrongOpen, spot: { kind: 'call', shover: 'SB', position: 'BB', stack: 1, hand: 160 }, chosen: 'fold' } as DecisionRating;
    const unrated: DecisionRating = { model: 'unrated', reason: 'limp' };
    const postflop = {
      model: 'postflop', verdict: 'mistake', reason: 'callTooWeak', equity: 0.04, needed: 0.2, bonus: 0, outs: 0, betShare: null,
      spr: 0.4, villainPosition: 'BB',
    } as unknown as DecisionRating;
    const broken: DecisionRating = { ...wrongOpen, spot: { kind: 'open', position: 'BB', stack: 16, hand: 130 } } as DecisionRating;
    const list = retrainingCandidates('normal', [
      hand('TM3', '2026-10-12 21:00:00', [decision(9, close), decision(10, correct), decision(11, freeCall), decision(12, unrated), decision(30, postflop, 'turn'), decision(14, broken)]),
    ]);
    expect(list).toEqual([]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/review/retraining.test.ts` → Expected: FAIL – `src/review/retraining.ts` gibt es noch nicht (Import schlägt fehl).

- [ ] **Step 3: Umsetzen**

`src/review/retraining.ts` anlegen:
```ts
import type { RetrainingCandidate } from '../game/retraining';
import { isRetrainingSpot } from '../storage/schema';
import type { HandAnalysis } from './analysis';
import { decisionOutcome } from './summary';
import type { TournamentKind } from './tournament-kind';

/** What the mapping needs of an archived hand (a `HandRecord` fits). */
export type RetrainingSource = { id: string; playedAt: string; analysis: HandAnalysis };

/**
 * Spec 10: the preflop errors of a tournament as trainable spots, oldest hand first. Only normal tournaments give
 * spots (in satellites and bounty tournaments a chart error is a hint, not an error); "knapp", unrated and postflop
 * decisions never count. A push/fold error becomes the same push/fold spot, a chart error the same starthand spot
 * (chart depth 40 or 100 BB, also when the stack was an approximation – the review counts it as an error, too).
 * Left out: a BB call against a shove at 1 BB (calling costs nothing, the training never deals it) and anything the
 * trainings could not deal.
 */
export function retrainingCandidates(kind: TournamentKind, hands: readonly RetrainingSource[]): RetrainingCandidate[] {
  if (kind !== 'normal') return [];
  const sorted = [...hands].sort((x, y) => x.playedAt.localeCompare(y.playedAt) || x.id.localeCompare(y.id));
  const out: RetrainingCandidate[] = [];
  for (const hand of sorted) {
    for (const d of hand.analysis.decisions) {
      if (d.street !== 'preflop' || decisionOutcome(d, kind) !== 'error') continue;
      const key = `${hand.id}:${d.eventIndex}`;
      const r = d.rating;
      let candidate: RetrainingCandidate | null = null;
      if (r.model === 'pushfold') {
        const freeCall = r.spot.kind === 'call' && r.spot.position === 'BB' && r.spot.stack === 1;
        if (!freeCall) candidate = { key, playedAt: hand.playedAt, game: 'pushfold', spot: r.spot };
      } else if (r.model === 'chart') {
        candidate = { key, playedAt: hand.playedAt, game: 'preflop', spot: r.spot };
      }
      if (candidate && isRetrainingSpot(candidate)) out.push(candidate);
    }
  }
  return out;
}
```

In `scripts/review-bench.ts` ersetzen:
```ts
import { extractTexts, planImport } from '../src/review/import';
import { UNRATED_TEXT } from '../src/review/preflop';
```
durch:
```ts
import { MAX_RETRAINING_ENTRIES } from '../src/game/retraining';
import { extractTexts, planImport } from '../src/review/import';
import { UNRATED_TEXT } from '../src/review/preflop';
import { retrainingCandidates } from '../src/review/retraining';
import { detectTournamentKind } from '../src/review/tournament-kind';
```

An das Ende von `scripts/review-bench.ts` anfügen:
```ts
// What the retraining queue would take from these hands (spec 10): preflop errors of normal tournaments.
const analysisOf = new Map(analyses.map(({ hand, analysis }) => [hand.id, analysis]));
const queue = [...plan.tournaments.values()].flatMap((list) =>
  retrainingCandidates(
    detectTournamentKind(list[0].tournamentName),
    list.map((hand) => ({ id: hand.id, playedAt: hand.playedAt, analysis: analysisOf.get(hand.id)! })),
  ),
);
const pushfold = queue.filter((c) => c.game === 'pushfold').length;
console.log(
  `Nachtraining: ${queue.length} Spots (${pushfold} Push/Fold, ${queue.length - pushfold} Starthand), höchstens ${MAX_RETRAINING_ENTRIES} in der Warteschlange`,
);
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/review/retraining.test.ts` → Expected: PASS (3 Tests).

- [ ] **Step 5: Messskript mit den echten Händen**

Run: `npm run review:bench -- samples/000001a1-35db-41af-0000-00007a500c79.zip` → Expected (Prototyp), letzte Zeile:
```text
Nachtraining: 20 Spots (4 Push/Fold, 16 Starthand), höchstens 200 in der Warteschlange
```

- [ ] **Step 6: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (694 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/review/retraining.test.ts src/review/retraining.ts scripts/review-bench.ts
git commit -m "feat(review): Preflop-Fehler normaler Turniere als trainierbare Spots, Messskript zählt das Nachtraining" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Jeder vierte Trainings-Spot aus der Warteschlange (Push/Fold und Starthand)

**Files:**
- Modify: `src/game/preflop-filter.test.ts`, `src/app/game-store.test.ts`, `src/game/preflop-filter.ts`, `src/app/game-store.ts`

**Interfaces:**
- Consumes: Task 2: `syncRetraining`, `forgetRetraining`, `answerRetraining`, `pickRetraining`, `isRetrainingTurn`, `retrainingOf`, `setRetrainingOn`; `preflopFilterOf`, `PreflopSituation`, `dealConcrete`
- Produces:
  - `src/game/preflop-filter.ts`: `matchesPreflopFilter(spot: PreflopSituation, filter: PreflopFilter): boolean`
  - `src/app/game-store.ts`: `type RetrainingOrigin = { key: string; playedAt: string }`; `TrainingSpot.retraining?: RetrainingOrigin`, `PreflopDeal.retraining?: RetrainingOrigin`
  - `GameStore.syncRetraining(tournamentId: string, candidates: readonly RetrainingCandidate[]): void`, `forgetRetraining(tournamentId: string): void`, `retrainingSynced(): ReadonlySet<string>`, `setRetrainingOn(on: boolean): void`

- [ ] **Step 1: Failing Tests schreiben**

In `src/game/preflop-filter.test.ts` ersetzen:
```ts
import { DEFAULT_PREFLOP_FILTER, isPreflopFilter, preflopFilterOf, preflopSpotOptions, samePreflopFilter } from './preflop-filter';
```
durch:
```ts
import {
  DEFAULT_PREFLOP_FILTER,
  isPreflopFilter,
  matchesPreflopFilter,
  preflopFilterOf,
  preflopSpotOptions,
  samePreflopFilter,
} from './preflop-filter';
```

In `src/game/preflop-filter.test.ts` vor der letzten Zeile `});` (Ende des äußeren `describe`) einfügen:
```ts
  it('tells whether a spot fits the filter', () => {
    const spot = { kind: 'rfi', stack: 100, hero: 'BTN', villain: null } as const;
    expect(matchesPreflopFilter(spot, { kind: 'all', stack: 'all' })).toBe(true);
    expect(matchesPreflopFilter(spot, { kind: 'rfi', stack: 100 })).toBe(true);
    expect(matchesPreflopFilter(spot, { kind: 'rfi', stack: 40 })).toBe(false);
    expect(matchesPreflopFilter(spot, { kind: 'vsOpen', stack: 'all' })).toBe(false);
  });
```

In `src/app/game-store.test.ts` ersetzen:
```ts
import { RUN_LEVEL_STACKS, startRun } from '../game/endphase-run';
```
durch:
```ts
import { RUN_LEVEL_STACKS, startRun } from '../game/endphase-run';
import { type RetrainingCandidate, retrainingOf, syncRetraining } from '../game/retraining';
```

An das Ende von `src/app/game-store.test.ts` anfügen:
```ts
describe('retraining queue (spec 10)', () => {
  const pushfold: RetrainingCandidate = {
    key: 'TM6532734973:13', playedAt: '2026-10-12 15:10:04', game: 'pushfold', spot: { kind: 'open', position: 'HJ', stack: 16, hand: 130 },
  };
  const chart: RetrainingCandidate = {
    key: 'TM6532186101:15', playedAt: '2026-10-12 13:15:28', game: 'preflop', spot: { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: 105 },
  };
  const pushfoldSpot = pushfold.spot as Spot;
  const queued = (base: SaveState = emptyState()) => syncRetraining(base, '318096259', [pushfold, chart]);
  const origin = (c: RetrainingCandidate) => ({ key: c.key, playedAt: c.playedAt });
  const streakOf = (store: ReturnType<typeof setup>['store'], key: string) =>
    retrainingOf(store.getSnapshot().save).entries.find((e) => e.key === key)?.streak;

  it('deals every fourth push/fold training spot from the queue and shows where it comes from', () => {
    const { store } = setup({}, queued());
    store.startTraining();
    const deals = [store.getSnapshot().current!];
    for (let i = 0; i < 7; i++) {
      store.nextTrainingSpot();
      deals.push(store.getSnapshot().current!);
    }
    expect(deals.map((d) => d.retraining?.key ?? null)).toEqual([null, null, null, pushfold.key, null, null, null, pushfold.key]);
    expect(deals[3]).toMatchObject({ spot: pushfold.spot, retraining: origin(pushfold) });
    expect(handClassOf(deals[3].cards[0], deals[3].cards[1])).toBe(130);
  });

  it('books a queued spot like any training spot and takes it out after two correct answers in a row', () => {
    const { store, save, data } = setup({}, queued());
    store.startTraining();
    for (let i = 0; i < 3; i++) store.nextTrainingSpot();
    const first = store.answer(rightAction(data, pushfoldSpot));
    expect(first.outcome.record).toEqual({
      ts: expect.any(Number), dateKey: '2026-10-13', mode: 'training', spot: pushfold.spot, chosen: 'fold', verdict: 'correct', responseMs: 0,
    });
    expect(first.outcome.xp.xp).toBeGreaterThan(0);
    expect(streakOf(store, pushfold.key)).toBe(1);
    expect(save).toHaveBeenLastCalledWith(store.getSnapshot().save);
    for (let i = 0; i < 4; i++) store.nextTrainingSpot();
    expect(store.getSnapshot().current!.retraining).toEqual(origin(pushfold));
    store.answer(rightAction(data, pushfoldSpot));
    const r = retrainingOf(store.getSnapshot().save);
    expect(r.entries.map((e) => e.key)).toEqual([chart.key]);
    expect(r.done).toEqual([pushfold.key]);
    expect(store.getSnapshot().save.decisions).toHaveLength(2);
    expect(store.getSnapshot().status.dayProgress.count).toBe(2);
  });

  it('starts the streak again after a wrong answer', () => {
    const { store, data } = setup({}, queued());
    store.startTraining();
    for (let i = 0; i < 3; i++) store.nextTrainingSpot();
    store.answer(rightAction(data, pushfoldSpot));
    for (let i = 0; i < 4; i++) store.nextTrainingSpot();
    expect(store.answer(wrongAction(data, pushfoldSpot)).outcome.grade.verdict).toBe('wrong');
    expect(streakOf(store, pushfold.key)).toBe(0);
  });

  it('deals queued starthand spots only when they fit the filter', () => {
    const { store } = setup({}, queued(withFilter({ kind: 'vsOpen', stack: 'all' })));
    store.startPreflop();
    for (let i = 0; i < 3; i++) store.nextPreflopSpot();
    expect(store.getSnapshot().preflopCurrent!.retraining).toBeUndefined();
    expect(store.getSnapshot().preflopCurrent!.spot.kind).toBe('vsOpen');
    // The unanswered spot is replaced (deal 5), then deals 6 to 8.
    store.setPreflopFilter({ kind: 'rfi', stack: 'all' });
    for (let i = 0; i < 3; i++) store.nextPreflopSpot();
    const deal = store.getSnapshot().preflopCurrent!;
    expect(deal).toMatchObject({ spot: chart.spot, retraining: origin(chart) });
    const result = store.answerPreflop(preflopRight(deal.spot));
    expect(result.outcome.record).toMatchObject({ game: 'preflop', mode: 'training', spot: chart.spot, verdict: 'correct' });
    expect(streakOf(store, chart.key)).toBe(1);
    store.setPreflopFilter({ kind: 'rfi', stack: 40 });
    for (let i = 0; i < 8; i++) {
      store.nextPreflopSpot();
      expect(store.getSnapshot().preflopCurrent!.retraining).toBeUndefined();
    }
  });

  it('deals nothing from the queue while the retraining is switched off', () => {
    const { store, save } = setup({}, queued());
    store.setRetrainingOn(false);
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ retraining: expect.objectContaining({ off: true }) }));
    store.startTraining();
    for (let i = 0; i < 8; i++) {
      store.nextTrainingSpot();
      expect(store.getSnapshot().current!.retraining).toBeUndefined();
    }
    store.setRetrainingOn(true);
    expect('off' in retrainingOf(store.getSnapshot().save)).toBe(false);
  });

  it('never uses the queue in the daily challenge and the endphase run', () => {
    const { store, data } = setup({}, queued());
    store.startDaily();
    const spots = dailySpots(data, '2026-10-13');
    for (let i = 0; i < 8; i++) {
      expect(store.getSnapshot().current).toMatchObject({ spot: spots[i] });
      expect(store.getSnapshot().current!.retraining).toBeUndefined();
      store.answer('fold');
      store.next();
    }
    store.startRun({ restart: true });
    for (let i = 0; i < 4; i++) {
      expect(store.getSnapshot().current!.retraining).toBeUndefined();
      store.answer(rightAction(data, store.getSnapshot().current!.spot));
      store.next();
    }
    expect(retrainingOf(store.getSnapshot().save).entries).toHaveLength(2);
  });

  it('feeds and forgets the spots of a tournament and knows which tournaments were fed', () => {
    const { store, save } = setup();
    store.syncRetraining('318096259', []);
    expect(save).not.toHaveBeenCalled();
    store.syncRetraining('318096259', [pushfold, chart]);
    expect(save).toHaveBeenLastCalledWith(store.getSnapshot().save);
    expect(retrainingOf(store.getSnapshot().save).entries.map((e) => e.key)).toEqual([chart.key, pushfold.key]);
    expect([...store.retrainingSynced()]).toEqual(['318096259']);
    store.forgetRetraining('318096259');
    expect(retrainingOf(store.getSnapshot().save)).toEqual({ entries: [], done: [], synced: [] });
  });

  it('changes nothing in read-only mode', () => {
    const { store, save } = setup({ readOnly: true }, queued());
    store.syncRetraining('1', [pushfold]);
    store.forgetRetraining('318096259');
    expect(() => store.setRetrainingOn(false)).toThrow('Im Nur-Lesen-Modus nicht möglich');
    expect(save).not.toHaveBeenCalled();
    expect(retrainingOf(store.getSnapshot().save).entries).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/game/preflop-filter.test.ts src/app/game-store.test.ts` → Expected: FAIL – 8 Tests (`matchesPreflopFilter` und die neuen Store-Methoden fehlen, kein Spot kommt aus der Warteschlange).

- [ ] **Step 3: Umsetzen**

In `src/game/preflop-filter.ts` ersetzen:
```ts
import { PREFLOP_KINDS, type PreflopKind, STACK_DEPTHS, type StackDepth } from '../engine/preflop/spots';
```
durch:
```ts
import { PREFLOP_KINDS, type PreflopKind, type PreflopSituation, STACK_DEPTHS, type StackDepth } from '../engine/preflop/spots';
```

An das Ende von `src/game/preflop-filter.ts` anfügen:
```ts
/** Does a spot fit the filter (e.g. a queued spot from the hand review)? */
export const matchesPreflopFilter = (spot: PreflopSituation, filter: PreflopFilter): boolean =>
  (filter.kind === 'all' || filter.kind === spot.kind) && (filter.stack === 'all' || filter.stack === spot.stack);
```

In `src/app/game-store.ts` ersetzen:
```ts
import { type PreflopFilter, isPreflopFilter, preflopFilterOf, samePreflopFilter } from '../game/preflop-filter';
```
durch:
```ts
import { type PreflopFilter, isPreflopFilter, matchesPreflopFilter, preflopFilterOf, samePreflopFilter } from '../game/preflop-filter';
import {
  type RetrainingCandidate,
  answerRetraining,
  forgetRetraining,
  isRetrainingTurn,
  pickRetraining,
  retrainingOf,
  setRetrainingOn,
  syncRetraining,
} from '../game/retraining';
```

In `src/app/game-store.ts` ersetzen:
```ts
export type TrainingSpot = { spot: Spot; cards: readonly [Card, Card]; shownAt: number };
export type PreflopDeal = { spot: PreflopSpot; cards: readonly [Card, Card]; shownAt: number };
```
durch:
```ts
/** A spot from the retraining queue (spec 10): its key and when the hand was played, for „Aus deinem Turnier vom 12.10.“. */
export type RetrainingOrigin = { key: string; playedAt: string };
export type TrainingSpot = { spot: Spot; cards: readonly [Card, Card]; shownAt: number; retraining?: RetrainingOrigin };
export type PreflopDeal = { spot: PreflopSpot; cards: readonly [Card, Card]; shownAt: number; retraining?: RetrainingOrigin };
```

In `src/app/game-store.ts` ersetzen:
```ts
  /** Remembers the filter in the profile; an unanswered spot is replaced by one that fits. */
  setPreflopFilter(filter: PreflopFilter): void;
};
```
durch:
```ts
  /** Remembers the filter in the profile; an unanswered spot is replaced by one that fits. */
  setPreflopFilter(filter: PreflopFilter): void;
  /** Replaces the queued spots of one tournament with its current preflop errors (spec 10); ignored in read-only mode. */
  syncRetraining(tournamentId: string, candidates: readonly RetrainingCandidate[]): void;
  /** Removes the queued spots of a deleted tournament. */
  forgetRetraining(tournamentId: string): void;
  /** Tournaments whose hands were fed into the queue already. */
  retrainingSynced(): ReadonlySet<string>;
  /** The settings switch „Nachtraining mit Fehlern aus deinen Turnieren“. */
  setRetrainingOn(on: boolean): void;
};
```

In `src/app/game-store.ts` ersetzen:
```ts
  let hiddenSince: number | null = null;
  const listeners
```
durch:
```ts
  let hiddenSince: number | null = null;
  // Spec 10: every fourth deal of a training may come from the queue. Counted per training and only in memory.
  let pushfoldDeals = 0;
  let preflopDeals = 0;
  let lastPushfoldKey: string | null = null;
  let lastPreflopKey: string | null = null;
  const listeners
```

In `src/app/game-store.ts` ersetzen:
```ts
    nextTrainingSpot() {
      if (snapshot.info.readOnly) throw new Error('Training ist im Nur-Lesen-Modus nicht möglich');
      const spot = nextTrainingSpot(data, snapshot.save, rng);
```
durch:
```ts
    nextTrainingSpot() {
      if (snapshot.info.readOnly) throw new Error('Training ist im Nur-Lesen-Modus nicht möglich');
      pushfoldDeals += 1;
      // The push/fold training has no filter, so every queued push/fold spot fits.
      const queued = isRetrainingTurn(pushfoldDeals) ? pickRetraining(snapshot.save, (e) => e.game === 'pushfold', lastPushfoldKey) : null;
      if (queued?.game === 'pushfold') {
        lastPushfoldKey = queued.key;
        const spot: Spot = { ...queued.spot };
        update({
          current: { spot, cards: dealConcrete(spot.hand, rng), shownAt: clock(), retraining: { key: queued.key, playedAt: queued.playedAt } },
          last: null,
        });
        return;
      }
      const spot = nextTrainingSpot(data, snapshot.save, rng);
```

In `src/app/game-store.ts` ersetzen:
```ts
      let save = outcome.state;
      let session = snapshot.session;
```
durch:
```ts
      let save = outcome.state;
      let session = snapshot.session;
      // A queued spot counts like any other training spot and also moves its queue entry on.
      if (current.retraining && session.kind === 'training') save = answerRetraining(save, current.retraining.key, outcome.grade.verdict);
```

In `src/app/game-store.ts` ersetzen:
```ts
    nextPreflopSpot() {
      assertPlayable();
      const spot = nextPreflopTrainingSpot(snapshot.save, rng);
```
durch:
```ts
    nextPreflopSpot() {
      assertPlayable();
      preflopDeals += 1;
      const filter = preflopFilterOf(snapshot.save.profile);
      const queued = isRetrainingTurn(preflopDeals)
        ? pickRetraining(snapshot.save, (e) => e.game === 'preflop' && matchesPreflopFilter(e.spot, filter), lastPreflopKey)
        : null;
      if (queued?.game === 'preflop') {
        lastPreflopKey = queued.key;
        const spot: PreflopSpot = { ...queued.spot };
        update({
          preflopCurrent: { spot, cards: dealConcrete(spot.hand, rng), shownAt: clock(), retraining: { key: queued.key, playedAt: queued.playedAt } },
          preflopLast: null,
        });
        return;
      }
      const spot = nextPreflopTrainingSpot(snapshot.save, rng);
```

In `src/app/game-store.ts` ersetzen:
```ts
      const result = preflopAnswerResult(outcome);
      commit(outcome.state, {
```
durch:
```ts
      const result = preflopAnswerResult(outcome);
      const save = current.retraining ? answerRetraining(outcome.state, current.retraining.key, outcome.grade.verdict) : outcome.state;
      commit(save, {
```

In `src/app/game-store.ts` ersetzen:
```ts
      // An unanswered spot may not fit the new filter; an answered one keeps its feedback.
      if (snapshot.preflopCurrent && !snapshot.preflopLast) store.nextPreflopSpot();
    },
  };
```
durch:
```ts
      // An unanswered spot may not fit the new filter; an answered one keeps its feedback.
      if (snapshot.preflopCurrent && !snapshot.preflopLast) store.nextPreflopSpot();
    },
    syncRetraining(tournamentId, candidates) {
      if (snapshot.info.readOnly) return;
      const next = syncRetraining(snapshot.save, tournamentId, candidates);
      if (next !== snapshot.save) commit(next);
    },
    forgetRetraining(tournamentId) {
      if (snapshot.info.readOnly) return;
      const next = forgetRetraining(snapshot.save, tournamentId);
      if (next !== snapshot.save) commit(next);
    },
    retrainingSynced() {
      return new Set(retrainingOf(snapshot.save).synced);
    },
    setRetrainingOn(on) {
      assertPlayable();
      const next = setRetrainingOn(snapshot.save, on);
      if (next !== snapshot.save) commit(next);
    },
  };
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/game/preflop-filter.test.ts src/app/game-store.test.ts` → Expected: PASS (62 Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (703 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/game/preflop-filter.test.ts src/app/game-store.test.ts src/game/preflop-filter.ts src/app/game-store.ts
git commit -m "feat(training): jeder vierte Trainings-Spot aus der Nachtraining-Warteschlange, Daily und Run unverändert" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Review-Store speist die Warteschlange, einmaliger Abgleich alter Archive

**Files:**
- Modify: `src/app/review-store.test.ts`, `src/app/review-store.ts`, `src/main.tsx`, `src/ui/test-utils.tsx`

**Interfaces:**
- Consumes: `retrainingCandidates` (Task 3), `GameStore.syncRetraining`/`forgetRetraining`/`retrainingSynced` (Task 4); `loadHands`, `isHandAnalysis`, `ANALYSIS_VERSION`, `serial`, `isCurrent`, `update` (intern im Review-Store)
- Produces:
  - `src/app/review-store.ts`: `type RetrainingSink = { synced(): ReadonlySet<string>; sync(tournamentId: string, candidates: readonly RetrainingCandidate[]): void; forget(tournamentId: string): void }`
  - `ReviewStoreDeps.retraining?: RetrainingSink`, `ReviewStore.syncRetraining(): Promise<void>`
  - `retrainingSinkOf(game: { retrainingSynced(): ReadonlySet<string>; syncRetraining(…): void; forgetRetraining(…): void }): RetrainingSink`
  - `src/main.tsx`: nach `load()` bzw. Übernahme der Schreibsperre `refreshStale()` und danach `syncRetraining()`

- [ ] **Step 1: Failing Tests schreiben**

In `src/app/review-store.test.ts` ersetzen:
```ts
import { LOCK_NEWER_ARCHIVE, LOCK_OTHER_TAB, LOCK_READ_ONLY, type ReviewStoreDeps, createReviewStore } from './review-store';
```
durch:
```ts
import { answerRetraining, forgetRetraining, retrainingOf, syncRetraining } from '../game/retraining';
import { type SaveState, emptyState } from '../storage/schema';
import {
  LOCK_NEWER_ARCHIVE,
  LOCK_OTHER_TAB,
  LOCK_READ_ONLY,
  type RetrainingSink,
  type ReviewStoreDeps,
  createReviewStore,
} from './review-store';
```

An das Ende von `src/app/review-store.test.ts` anfügen:
```ts
describe('retraining queue (spec 10)', () => {
  const ERRORS = ['TM6532186101:15', 'TM6533069892:17', 'TM6532734973:13'];

  function queueSink(initial: SaveState = emptyState()) {
    let state = initial;
    const sink: RetrainingSink = {
      synced: () => new Set(retrainingOf(state).synced),
      sync: (id, candidates) => {
        state = syncRetraining(state, id, candidates);
      },
      forget: (id) => {
        state = forgetRetraining(state, id);
      },
    };
    return {
      sink,
      keys: () => retrainingOf(state).entries.map((e) => e.key),
      state: () => state,
      answer: (key: string) => {
        state = answerRetraining(answerRetraining(state, key, 'correct'), key, 'correct');
      },
    };
  }

  it('feeds the preflop errors of a normal tournament on import, never those of satellites and bounty tournaments', async () => {
    const queue = queueSink();
    const { store } = await setup({ retraining: queue.sink });
    await store.importText(`${steps}\n\n${bounty}`);
    expect(queue.state().retraining).toBeUndefined();
    await store.importText(dailyClassic);
    expect(queue.keys()).toEqual(ERRORS);
    expect(retrainingOf(queue.state()).entries[0]).toMatchObject({ tournamentId: '318096259', playedAt: '2026-10-13 13:15:28', streak: 0 });
    expect([...queue.sink.synced()]).toEqual(['318096259']);
    await store.importText(dailyClassic);
    expect(queue.keys()).toEqual(ERRORS);
  });

  it('follows kind changes and deletion; cleared spots stay cleared', async () => {
    const queue = queueSink();
    const { store } = await setup({ retraining: queue.sink });
    await store.importText(dailyClassic);
    queue.answer(ERRORS[0]);
    await store.setKind('318096259', 'bounty');
    expect(queue.keys()).toEqual([]);
    await store.setKind('318096259', 'normal');
    expect(queue.keys()).toEqual(ERRORS.slice(1));
    await store.deleteTournament('318096259');
    expect(retrainingOf(queue.state())).toEqual({ entries: [], done: [ERRORS[0]], synced: [] });
  });

  it('feeds an archive from before Plan 9 once, only in the writing tab', async () => {
    const backend = memoryReviewBackend();
    const old = createReviewStore({ backend, data: getPushFoldData(), canWrite: () => true, readOnly: false, pause: async () => {} });
    await old.load();
    await old.importText(`${dailyClassic}\n\n${bounty}`);

    const queue = queueSink();
    let writer = false;
    const store = createReviewStore({
      backend, data: getPushFoldData(), canWrite: () => writer, readOnly: false, pause: async () => {}, retraining: queue.sink,
    });
    await store.load();
    await store.syncRetraining();
    expect(queue.state().retraining).toBeUndefined();
    writer = true;
    await store.refreshAccess();
    await store.syncRetraining();
    expect(queue.keys()).toEqual(ERRORS);
    expect([...queue.sink.synced()]).toEqual(['318096259']);
    queue.answer(ERRORS[2]);
    await store.syncRetraining();
    expect(queue.keys()).toEqual(ERRORS.slice(0, 2));
  });

  it('feeds tournaments that are rated again in the background', async () => {
    const queue = queueSink();
    const { store, backend } = await setup();
    await store.importText(dailyClassic);
    const stale: [string, string][] = Object.entries(backend.dump()).map(([k, v]) => {
      const record = JSON.parse(v);
      if (k.startsWith(HAND_PREFIX)) return [k, JSON.stringify({ ...record, analysisVersion: 1, analysis: { version: 1, decisions: [] } })];
      return [k, JSON.stringify({ ...record, analysisVersion: 1 })];
    });
    await backend.setMany(stale);
    const fresh = createReviewStore({ backend, data: getPushFoldData(), canWrite: () => true, readOnly: false, pause: async () => {}, retraining: queue.sink });
    await fresh.load();
    await fresh.syncRetraining();
    expect(queue.keys()).toEqual([]);
    await fresh.refreshStale();
    expect(queue.keys()).toEqual(ERRORS);
  });

  it('keeps the archive write when the queue fails', async () => {
    const sink: RetrainingSink = {
      synced: () => new Set(),
      sync: () => {
        throw new Error('voll');
      },
      forget: () => {
        throw new Error('voll');
      },
    };
    const { store, backend } = await setup({ retraining: sink });
    expect(await store.importText(dailyClassic)).toMatchObject({ imported: 6, tournaments: 1 });
    expect(readTournament(backend.dump()[tournamentKey('318096259')]).handIds).toHaveLength(6);
    await store.deleteTournament('318096259');
    expect(backend.dump()).toEqual({});
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/app/review-store.test.ts` → Expected: FAIL – 4 der 5 neuen Tests (es wird noch nichts eingespeist; „keeps the archive write when the queue fails“ ist schon grün).

- [ ] **Step 3: Umsetzen**

In `src/app/review-store.ts` ersetzen:
```ts
import type { PushFoldData } from '../engine/pushfold-data';
```
durch:
```ts
import type { PushFoldData } from '../engine/pushfold-data';
import type { RetrainingCandidate } from '../game/retraining';
```

In `src/app/review-store.ts` ersetzen:
```ts
import { HandParseError, type ParsedHand, type SkippedHand, parseHand } from '../review/parse';
```
durch:
```ts
import { HandParseError, type ParsedHand, type SkippedHand, parseHand } from '../review/parse';
import { retrainingCandidates } from '../review/retraining';
```

In `src/app/review-store.ts` ersetzen:
```ts
export type ReviewStoreDeps = {
```
durch:
```ts
/** Where the preflop errors go (spec 10): the retraining queue in the save; main.tsx passes the game store. */
export type RetrainingSink = {
  /** Tournaments whose hands were fed in already. */
  synced(): ReadonlySet<string>;
  /** Replaces the queued spots of one tournament with its current errors. */
  sync(tournamentId: string, candidates: readonly RetrainingCandidate[]): void;
  forget(tournamentId: string): void;
};
export type ReviewStoreDeps = {
```

In `src/app/review-store.ts` ersetzen:
```ts
  pause?: () => Promise<void>;
};
export type ReviewStore = {
```
durch:
```ts
  pause?: () => Promise<void>;
  /** The retraining queue; without it (tests, tools) nothing is fed. */
  retraining?: RetrainingSink;
};
export type ReviewStore = {
```

In `src/app/review-store.ts` ersetzen:
```ts
  /** Merges the archive part of an export file (hand numbers decide about duplicates). */
  mergeExport(part: ArchiveExport): Promise<ImportSummary>;
};
```
durch:
```ts
  /** Merges the archive part of an export file (hand numbers decide about duplicates). */
  mergeExport(part: ArchiveExport): Promise<ImportSummary>;
  /**
   * Feeds the preflop errors of normal tournaments that were never fed into the retraining queue (archives from
   * before Plan 9, or after a save import). Writing tab only; tournaments that wait for a new rating are fed by
   * `refreshStale` instead.
   */
  syncRetraining(): Promise<void>;
};
```

In `src/app/review-store.ts` ersetzen:
```ts
  const isCurrent = (t: TournamentRecord) => (t.analysisVersion ?? 1) === ANALYSIS_VERSION;
```
durch:
```ts
  const isCurrent = (t: TournamentRecord) => (t.analysisVersion ?? 1) === ANALYSIS_VERSION;

  /** After every archive write of a tournament: its current preflop errors replace its part of the queue. */
  const feed = (tournament: TournamentRecord, hands: readonly HandRecord[]) => {
    const sink = deps.retraining;
    if (!sink) return;
    const rated = hands.filter((h) => h.analysisVersion === ANALYSIS_VERSION && isHandAnalysis(h.analysis));
    try {
      sink.sync(tournament.id, retrainingCandidates(tournament.kind, rated));
    } catch {
      // The queue is only a copy of the archived errors: it must never fail an archive write that already happened.
    }
  };
```

In `src/app/review-store.ts` ersetzen:
```ts
            assertWritable();
            await writeRecords(backend, [next], [...old.changed, ...added]);
            return next;
```
durch:
```ts
            assertWritable();
            await writeRecords(backend, [next], [...old.changed, ...added]);
            feed(next, [...old.hands.map((h) => h.record), ...added]);
            return next;
```

In `src/app/review-store.ts` ersetzen:
```ts
            if (snapshot.writable) {
              await writeRecords(backend, [current], loaded.changed);
              update({ tournaments: replaceTournament(current) });
            }
```
durch:
```ts
            if (snapshot.writable) {
              await writeRecords(backend, [current], loaded.changed);
              update({ tournaments: replaceTournament(current) });
              feed(current, loaded.hands.map((h) => h.record));
            }
```

In `src/app/review-store.ts` ersetzen:
```ts
              update({ tournaments: replaceTournament(record) });
              return false;
            });
```
durch:
```ts
              update({ tournaments: replaceTournament(record) });
              feed(record, loaded.hands.map((h) => h.record));
              return false;
            });
```

In `src/app/review-store.ts` ersetzen:
```ts
        assertWritable();
        await writeRecords(backend, [record], loaded.changed);
        update({ tournaments: replaceTournament(record) });
      });
    },
```
durch:
```ts
        assertWritable();
        await writeRecords(backend, [record], loaded.changed);
        update({ tournaments: replaceTournament(record) });
        feed(record, loaded.hands.map((h) => h.record));
      });
    },
```

In `src/app/review-store.ts` ersetzen:
```ts
      await serial(() => removeTournament(backend, tournament));
      update({ tournaments: snapshot.tournaments.filter((t) => t.id !== id) });
```
durch:
```ts
      await serial(() => removeTournament(backend, tournament));
      update({ tournaments: snapshot.tournaments.filter((t) => t.id !== id) });
      try {
        deps.retraining?.forget(id);
      } catch {
        // As in feed: the archive change stands.
      }
```

In `src/app/review-store.ts` ersetzen:
```ts
    mergeExport(part) {
      const kinds = new Map(part.tournaments.map((t) => [t.id, t.kind] as const));
      const texts = part.hands.map((h) => ({ name: 'Export', text: h.raw }));
      return importTexts(texts, [], kinds);
    },
  };
```
durch:
```ts
    mergeExport(part) {
      const kinds = new Map(part.tournaments.map((t) => [t.id, t.kind] as const));
      const texts = part.hands.map((h) => ({ name: 'Export', text: h.raw }));
      return importTexts(texts, [], kinds);
    },
    async syncRetraining() {
      const sink = deps.retraining;
      if (!sink) return;
      if (snapshot.status === 'ready') update({});
      if (!snapshot.writable) return;
      const synced = sink.synced();
      // Only normal tournaments with preflop errors can give spots; the others need no reading at all.
      const ids = snapshot.tournaments
        .filter((t) => t.kind === 'normal' && t.summary.preflopErrors > 0 && isCurrent(t) && !synced.has(t.id))
        .map((t) => t.id);
      for (const id of ids) {
        const stop = await serial(async () => {
          update({});
          if (!snapshot.writable) return true;
          const tournament = snapshot.tournaments.find((t) => t.id === id);
          if (!tournament || sink.synced().has(id)) return false;
          const { hands } = await loadHands(backend, tournament.handIds);
          update({});
          if (!snapshot.writable) return true;
          feed(tournament, hands);
          return false;
        });
        if (stop) break;
      }
    },
  };
```

In `src/app/review-store.ts` ersetzen:
```ts
export function createReviewStore
```
durch:
```ts
/** The game store as the sink of the retraining queue. */
export const retrainingSinkOf = (game: {
  retrainingSynced(): ReadonlySet<string>;
  syncRetraining(tournamentId: string, candidates: readonly RetrainingCandidate[]): void;
  forgetRetraining(tournamentId: string): void;
}): RetrainingSink => ({
  synced: () => game.retrainingSynced(),
  sync: (id, candidates) => game.syncRetraining(id, candidates),
  forget: (id) => game.forgetRetraining(id),
});

export function createReviewStore
```

In `src/main.tsx` ersetzen:
```tsx
import { createReviewStore } from './app/review-store';
```
durch:
```tsx
import { createReviewStore, retrainingSinkOf } from './app/review-store';
```

In `src/main.tsx` ersetzen:
```tsx
    analyzer,
  });
  // Archived hands from an older analysis version are rated again in the background (writing tab only).
  review.load().then(() => review.refreshStale()).catch(logError);
  opened.onWriterAcquired((fresh) => {
    ready.adoptSavedState(fresh);
    review.refreshAccess().then(() => review.refreshStale()).catch(logError);
  });
```
durch:
```tsx
    analyzer,
    // Preflop errors of normal tournaments go into the retraining queue of the save (spec 10).
    retraining: retrainingSinkOf(ready),
  });
  // Archived hands from an older analysis version are rated again in the background (writing tab only), then
  // tournaments never fed into the retraining queue are fed (archives from before Plan 9).
  const refreshArchive = () => review.refreshStale().then(() => review.syncRetraining());
  review.load().then(refreshArchive).catch(logError);
  opened.onWriterAcquired((fresh) => {
    ready.adoptSavedState(fresh);
    review.refreshAccess().then(refreshArchive).catch(logError);
  });
```

In `src/ui/test-utils.tsx` ersetzen:
```tsx
import { createReviewStore } from '../app/review-store';
```
durch:
```tsx
import { createReviewStore, retrainingSinkOf } from '../app/review-store';
```

In `src/ui/test-utils.tsx` ersetzen:
```tsx
    readOnly: info.readOnly,
    pause: async () => {},
  });
```
durch:
```tsx
    readOnly: info.readOnly,
    pause: async () => {},
    retraining: retrainingSinkOf(store),
  });
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/app/review-store.test.ts` → Expected: PASS (29 Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (708 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/app/review-store.test.ts src/app/review-store.ts src/main.tsx src/ui/test-utils.tsx
git commit -m "feat(review): Import, Art-Wechsel, Neubewertung und Löschen speisen die Nachtraining-Warteschlange, alte Archive einmalig" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Hinweis am Tisch, Schalter in den Einstellungen, Anzahl in der Übersicht

**Files:**
- Create: `src/ui/screens/PlayScreen.test.tsx`, `src/ui/components/RetrainingHint.tsx`
- Modify: `src/app/format.test.ts`, `src/ui/screens/PreflopScreen.test.tsx`, `src/ui/screens/SettingsScreen.test.tsx`, `src/ui/screens/ReviewScreen.test.tsx`, `src/app/format.ts`, `src/ui/screens/screens.css`, `src/ui/screens/PlayScreen.tsx`, `src/ui/screens/PreflopScreen.tsx`, `src/ui/screens/SettingsScreen.tsx`, `src/ui/screens/ReviewOverview.tsx`

**Interfaces:**
- Consumes: `RetrainingOrigin` (Task 4), `retrainingCount`, `retrainingOn` (Task 2), `GameStore.setRetrainingOn` (Task 4), `ReviewStore.syncRetraining` (Task 5); `useGame`, `renderWithStore` (jetzt mit `retrainingSinkOf(store)`, Task 5)
- Produces:
  - `src/app/format.ts`: `retrainingHint(playedAt: string): string`, `formatRetrainingCount(n: number): string`
  - `src/ui/components/RetrainingHint.tsx`: `RetrainingHint({ origin }: { origin: RetrainingOrigin | undefined })` (`<p role="note">`)
  - Einstellungen: Abschnitt „Nachtraining“ mit Schalter „Nachtraining mit Fehlern aus deinen Turnieren“; Übersicht: „Nachtraining: 3 Spots aus deinen Turnieren warten im Training.“

- [ ] **Step 1: Failing Tests schreiben**

In `src/app/format.test.ts` ersetzen:
```ts
  formatPlayedAt,
```
durch:
```ts
  formatPlayedAt,
  formatRetrainingCount,
```

In `src/app/format.test.ts` ersetzen:
```ts
  preflopSpotTitle,
```
durch:
```ts
  preflopSpotTitle,
  retrainingHint,
```

In `src/app/format.test.ts` ersetzen:
```ts
    expect(streetLabel('turn')).toBe('Turn');
  });
```
durch:
```ts
    expect(streetLabel('turn')).toBe('Turn');
  });

  it('formats the retraining hint and the queue size', () => {
    expect(retrainingHint('2026-10-12 15:46:28')).toBe('Aus deinem Turnier vom 12.10.');
    expect(retrainingHint('2026-01-05 09:00:00')).toBe('Aus deinem Turnier vom 05.01.');
    expect(formatRetrainingCount(1)).toBe('1 Spot aus deinen Turnieren wartet im Training.');
    expect(formatRetrainingCount(200)).toBe('200 Spots aus deinen Turnieren warten im Training.');
  });
```

`src/ui/screens/PlayScreen.test.tsx` anlegen:
```tsx
// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { syncRetraining } from '../../game/retraining';
import { emptyState } from '../../storage/schema';
import { renderWithStore } from '../test-utils';
import { PlayScreen } from './PlayScreen';

const queued = syncRetraining(emptyState(), '318096259', [
  { key: 'TM6532734973:13', playedAt: '2026-10-12 15:10:04', game: 'pushfold', spot: { kind: 'open', position: 'HJ', stack: 16, hand: 130 } },
]);

describe('PlayScreen with the retraining queue', () => {
  it('marks the queued spot in the training with the date of the tournament', () => {
    const { store } = renderWithStore(<PlayScreen mode="training" onBack={() => {}} />, { initial: queued });
    expect(screen.queryByRole('note')).toBeNull();
    act(() => {
      for (let i = 0; i < 3; i++) store.nextTrainingSpot();
    });
    expect(screen.getByRole('note').textContent).toBe('Aus deinem Turnier vom 12.10.');
    expect(screen.getByText(/Du sitzt im HJ · 16 BB/)).toBeTruthy();
    act(() => store.nextTrainingSpot());
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('never shows queued spots in the daily challenge', () => {
    const { store } = renderWithStore(<PlayScreen mode="daily" onBack={() => {}} />, { initial: queued });
    for (let i = 0; i < 5; i++) {
      expect(screen.queryByRole('note')).toBeNull();
      act(() => {
        store.answer('fold');
        store.next();
      });
    }
  });
});
```

In `src/ui/screens/PreflopScreen.test.tsx` ersetzen:
```tsx
import { fireEvent, screen, within } from '@testing-library/react';
```
durch:
```tsx
import { act, fireEvent, screen, within } from '@testing-library/react';
```

In `src/ui/screens/PreflopScreen.test.tsx` ersetzen:
```tsx
import type { PreflopFilter } from '../../game/preflop-filter';
```
durch:
```tsx
import type { PreflopFilter } from '../../game/preflop-filter';
import { syncRetraining } from '../../game/retraining';
```

In `src/ui/screens/PreflopScreen.test.tsx` vor der letzten Zeile `});` (Ende des äußeren `describe`) einfügen:
```tsx
  it('marks a queued spot from the hand review with the date of the tournament', () => {
    const initial = syncRetraining(withFilter({ kind: 'rfi', stack: 'all' }), '318096259', [
      { key: 'TM6532186101:15', playedAt: '2026-10-12 13:15:28', game: 'preflop', spot: { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: 105 } },
    ]);
    const { store } = renderWithStore(<PreflopScreen onBack={() => {}} />, { initial });
    expect(screen.queryByRole('note')).toBeNull();
    act(() => {
      for (let i = 0; i < 3; i++) store.nextPreflopSpot();
    });
    expect(screen.getByRole('note').textContent).toBe('Aus deinem Turnier vom 12.10.');
    expect(store.getSnapshot().preflopCurrent!.spot).toEqual({ kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: 105 });
  });
```

In `src/ui/screens/SettingsScreen.test.tsx` ersetzen:
```tsx
import bounty from '../../review/fixtures/bounty.txt?raw';
```
durch:
```tsx
import { retrainingOf, syncRetraining } from '../../game/retraining';
import bounty from '../../review/fixtures/bounty.txt?raw';
import dailyClassic from '../../review/fixtures/daily-classic.txt?raw';
```

In `src/ui/screens/SettingsScreen.test.tsx` vor der letzten Zeile `});` (Ende des äußeren `describe`) einfügen:
```tsx
  it('switches the retraining off and on and shows how many spots wait', () => {
    const initial = syncRetraining(emptyState(), '318096259', [
      { key: 'TM1:13', playedAt: '2026-10-12 15:10:04', game: 'pushfold', spot: { kind: 'open', position: 'HJ', stack: 16, hand: 130 } },
    ]);
    const { store, save } = renderWithStore(<SettingsScreen onBack={() => {}} />, { initial });
    const toggle = screen.getByLabelText('Nachtraining mit Fehlern aus deinen Turnieren') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(screen.getByText(/1 Spot aus deinen Turnieren wartet im Training\./)).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(retrainingOf(store.getSnapshot().save).off).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.click(toggle);
    expect('off' in retrainingOf(store.getSnapshot().save)).toBe(false);
  });

  it('disables the retraining switch in a reading tab', () => {
    renderWithStore(<SettingsScreen onBack={() => {}} />, { info: { otherTabActive: true } });
    expect((screen.getByLabelText('Nachtraining mit Fehlern aus deinen Turnieren') as HTMLInputElement).disabled).toBe(true);
  });

  it('feeds the archive into the queue of an imported save', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { store, review, loaded } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    await act(async () => {
      await loaded;
      await review.importText(dailyClassic);
    });
    expect(retrainingOf(store.getSnapshot().save).entries).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file(serialize(emptyState()))] } });
    expect(await screen.findByText('Spielstand importiert.')).toBeTruthy();
    await waitFor(() => expect(retrainingOf(store.getSnapshot().save).entries).toHaveLength(3));
  });
```

In `src/ui/screens/ReviewScreen.test.tsx` vor der letzten Zeile `});` (Ende des äußeren `describe`) einfügen:
```tsx
  it('shows how many spots from normal tournaments wait in the retraining', async () => {
    await withHands(`${dailyClassic}\n\n${steps}`);
    expect(screen.getByText('Nachtraining: 3 Spots aus deinen Turnieren warten im Training.')).toBeTruthy();
  });
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/app/format.test.ts src/ui/screens` → Expected: FAIL – 7 der 8 neuen Tests (Hinweis, Schalter, Anzahl und Formatierer fehlen; „never shows queued spots in the daily challenge“ ist schon grün).

- [ ] **Step 3: Umsetzen**

`src/ui/components/RetrainingHint.tsx` anlegen:
```tsx
import { retrainingHint } from '../../app/format';
import type { RetrainingOrigin } from '../../app/game-store';

/** „Aus deinem Turnier vom 12.10.“ above the table for a spot from the retraining queue (spec 10). */
export function RetrainingHint({ origin }: { origin: RetrainingOrigin | undefined }) {
  if (!origin) return null;
  return (
    <p className="retraining-hint" role="note">
      {retrainingHint(origin.playedAt)}
    </p>
  );
}
```

An das Ende von `src/app/format.ts` anfügen:
```ts
/** Spec 10: where a retraining spot comes from, "2026-10-12 15:46:28" → „Aus deinem Turnier vom 12.10.“. */
export const retrainingHint = (playedAt: string): string => `Aus deinem Turnier vom ${playedAt.slice(8, 10)}.${playedAt.slice(5, 7)}.`;

/** „1 Spot aus deinen Turnieren wartet im Training.“ / „3 Spots … warten …“. */
export const formatRetrainingCount = (n: number): string =>
  n === 1 ? '1 Spot aus deinen Turnieren wartet im Training.' : `${formatCount(n)} Spots aus deinen Turnieren warten im Training.`;
```

An das Ende von `src/ui/screens/screens.css` anfügen:
```css
.retraining-hint {
  margin: 0 0 6px;
  color: var(--gold);
  font-size: 14px;
  text-align: center;
}
```

In `src/ui/screens/PlayScreen.tsx` ersetzen:
```tsx
import { PokerTable } from '../components/PokerTable';
```
durch:
```tsx
import { PokerTable } from '../components/PokerTable';
import { RetrainingHint } from '../components/RetrainingHint';
```

In `src/ui/screens/PlayScreen.tsx` ersetzen:
```tsx
            <>
              <PokerTable key={current.shownAt} spot={current.spot} cards={current.cards} />
```
durch:
```tsx
            <>
              <RetrainingHint origin={current.retraining} />
              <PokerTable key={current.shownAt} spot={current.spot} cards={current.cards} />
```

In `src/ui/screens/PreflopScreen.tsx` ersetzen:
```tsx
import { PreflopFeedbackPanel } from '../components/PreflopFeedbackPanel';
```
durch:
```tsx
import { PreflopFeedbackPanel } from '../components/PreflopFeedbackPanel';
import { RetrainingHint } from '../components/RetrainingHint';
```

In `src/ui/screens/PreflopScreen.tsx` ersetzen:
```tsx
            <>
              <PreflopTable key={current.shownAt} spot={current.spot} cards={current.cards} />
```
durch:
```tsx
            <>
              <RetrainingHint origin={current.retraining} />
              <PreflopTable key={current.shownAt} spot={current.spot} cards={current.cards} />
```

In `src/ui/screens/SettingsScreen.tsx` ersetzen:
```tsx
import { formatCount, formatHands } from '../../app/format';
```
durch:
```tsx
import { formatCount, formatHands, formatRetrainingCount } from '../../app/format';
import { retrainingCount, retrainingOn } from '../../game/retraining';
```

In `src/ui/screens/SettingsScreen.tsx` ersetzen:
```tsx
    setMessage(done);
    // The import itself succeeded
```
durch:
```tsx
    setMessage(done);
    // The imported save brings its own queue: tournaments it never fed are fed from the archive now.
    try {
      await reviewStore.syncRetraining();
    } catch {
      // The next start tries again.
    }
    // The import itself succeeded
```

In `src/ui/screens/SettingsScreen.tsx` ersetzen:
```tsx
      <section className="panel settings-section">
        <h3 className="settings-section__title">Spielstand</h3>
```
durch:
```tsx
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
      </section>

      <section className="panel settings-section">
        <h3 className="settings-section__title">Spielstand</h3>
```

In `src/ui/screens/ReviewOverview.tsx` ersetzen:
```tsx
import { formatCount, formatPer100, formatPlayedAt } from '../../app/format';
```
durch:
```tsx
import { formatCount, formatPer100, formatPlayedAt, formatRetrainingCount } from '../../app/format';
import { retrainingCount, retrainingOn } from '../../game/retraining';
```

In `src/ui/screens/ReviewOverview.tsx` ersetzen:
```tsx
import { TrendBars, shortDate } from '../components/TrendChart';
```
durch:
```tsx
import { TrendBars, shortDate } from '../components/TrendChart';
import { useGame } from '../GameContext';
```

In `src/ui/screens/ReviewOverview.tsx` ersetzen:
```tsx
  const review = useReview();
  if (review.status
```
durch:
```tsx
  const review = useReview();
  const game = useGame();
  if (review.status
```

In `src/ui/screens/ReviewOverview.tsx` ersetzen:
```tsx
        {review.lockReason && <p className="muted">{review.lockReason}</p>}
```
durch:
```tsx
        {review.lockReason && <p className="muted">{review.lockReason}</p>}
        {retrainingCount(game.save) > 0 && (
          <p className="muted">
            Nachtraining: {formatRetrainingCount(retrainingCount(game.save))}
            {!retrainingOn(game.save) && ' Es ist in den Einstellungen ausgeschaltet.'}
          </p>
        )}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/app/format.test.ts src/ui/screens` → Expected: PASS (67 Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (716 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/app/format.test.ts src/ui/screens/PlayScreen.test.tsx src/ui/screens/PreflopScreen.test.tsx src/ui/screens/SettingsScreen.test.tsx src/ui/screens/ReviewScreen.test.tsx src/ui/components/RetrainingHint.tsx src/app/format.ts src/ui/screens/screens.css src/ui/screens/PlayScreen.tsx src/ui/screens/PreflopScreen.tsx src/ui/screens/SettingsScreen.tsx src/ui/screens/ReviewOverview.tsx
git commit -m "feat(ui): Hinweis „Aus deinem Turnier vom …“ am Tisch, Schalter fürs Nachtraining und Anzahl in der Übersicht" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Build-Prüfung, Messung mit den echten Händen und manuelle Abnahme

**Files:**
- Keine Änderungen geplant. Nur wenn eine Prüfung scheitert, wird die Ursache im betroffenen Task-Bereich behoben und mit eigenem Commit festgehalten.

- [ ] **Step 1: Automatische Prüfungen**

Run: `npm test` → Expected: alle PASS (716 Tests).
Run: `npm run typecheck` → Expected: Exit 0.
Run: `npm run check:portability` → Expected: keine Befunde.
Run: `npm run build` → Expected: Build ohne Fehler und ohne neue Warnungen; Haupt-Bundle unter `chunkSizeWarningLimit` 1200 kB (im Prototyp 1043 kB), `dist/assets/analysis.worker-<hash>.js` unverändert 43 kB.

- [ ] **Step 2: Messung mit den echten Händen**

Run: `npm run review:bench -- samples/000001a1-35db-41af-0000-00007a500c79.zip` → Expected (Prototyp), Ende der Ausgabe:
```text
477 Hände analysiert in 0.13 s
...
Nachtraining: 20 Spots (4 Push/Fold, 16 Starthand), höchstens 200 in der Warteschlange
```
Weicht die Zahl ab, ist die Abweichung zu begründen (z. B. geänderte Charts oder Bewertungslogik), bevor der Plan als erledigt gilt.

- [ ] **Step 3: Manuelle Abnahme (Controller)**

Run: `npm run preview`, dann im Browser am PC (mindestens 1100 px breit) und in der Größe 375×812 prüfen:

- **Upgrade mit vorhandenem Stand (wichtigster Punkt):** In der Version von main (Plan 8) ein paar Spots trainieren, die Beispiel-ZIP importieren und den Spielstand in den Einstellungen exportieren. Dann die neue Version laden. Erwartet: XP, Rang, Streak, Statistik und Starthand-Filter unverändert; kurz darauf zeigt die Hand-Review-Übersicht „Nachtraining: 20 Spots aus deinen Turnieren warten im Training.“ (einmaliger Abgleich), der Spielstand `save` in IndexedDB `poker-trainer` hat zusätzlich `retraining` mit 20 Einträgen und `synced: ["318096259"]`, sonst keine Änderung (mit dem Export vergleichen).
- **Ohne Archiv:** Frisches Profil, nur trainieren: Der Spielstand bekommt kein Feld `retraining`.
- **Push/Fold-Training:** Spot 4 und 8 (bei 20 Einträgen jeweils der nächste Push/Fold-Eintrag) tragen über dem Tisch in Gold „Aus deinem Turnier vom 13.10.“; Feedback, XP, Combo und Statistik wie bei jedem Spot. Denselben Spot zweimal in Folge richtig beantworten (er kommt bei vier Push/Fold-Einträgen nach 16 Spots wieder) → Zahl in der Übersicht sinkt um 1.
- **Starthand-Training:** Filter „Gegen Open-Raise · 40 BB“: jeder vierte Spot mit Hinweis ist ein `vsOpen`-Spot mit 40 BB. Filter auf einen Typ ohne Eintrag (z. B. „Gegen 3-Bet · 100 BB“): kein Hinweis.
- **Daily Challenge und Endphase-Run:** nie ein Hinweis, Spots der Daily wie am selben Tag ohne Warteschlange.
- **Art ändern:** Turnier „Daily Classic $1“ auf „Bounty“ → Anzahl verschwindet aus der Übersicht; zurück auf „Normal“ → wieder da (ohne die schon erledigten). Turnier löschen → seine Spots sind weg.
- **Einstellungen:** Abschnitt „Nachtraining“, Schalter „Nachtraining mit Fehlern aus deinen Turnieren“ an. Aus → keine Hinweise mehr im Training, Übersicht „… Es ist in den Einstellungen ausgeschaltet.“; nach Neuladen bleibt er aus. An → es geht weiter.
- **Zweiter Tab:** Import und Schalter gesperrt, kein Einspeisen; nach Schließen des ersten Tabs übernimmt der zweite und gleicht ab.
- **Export/Import:** Export enthält `retraining`; Import in ein frisches Profil stellt die Warteschlange wieder her. Import einer Datei aus Plan 8 (ohne `retraining`) in ein Profil mit Archiv → nach dem Import wird das Archiv neu eingespeist.
- **Rückweg:** Den neuen Stand (mit `retraining`) in der Version von main importieren → lädt ohne Fehler und ohne Nur-Lesen-Hinweis.
- **Am Handy (375×812):** Hinweis über dem Tisch, Tisch und Aktions-Buttons passen ohne Scrollen wie bisher; keine waagrechte Scrollleiste.

- [ ] **Step 4: Übergabe**

Ergebnis der Prüfungen festhalten (Anzahl der Einträge aus den echten Händen, Upgrade-Prüfung). Die Veröffentlichung erfolgt über den Merge des Pull Requests von `feat/review-retraining` (nicht Teil dieses Plans). Vor dem Update auf dem Handy dem Nutzer empfehlen, den Spielstand einmal zu exportieren.

---

## Abdeckung der Spec

| Spec | Umsetzung |
|---|---|
| 10 Preflop-Fehler aus normalen Turnieren (nicht Satellit/Bounty, nicht `knapp`) als Spot | Task 3 (`retrainingCandidates` über `decisionOutcome`) |
| 10 Warteschlange im Spielstand, optionales Feld, Schema bleibt 1 | Task 1 (`retraining?`, `readRetraining`, `PLAN8_SAVE`, byte-gleich) |
| 10 etwa jeder vierte Spot, sofern er zum Filter passt | Task 2 (`isRetrainingTurn`, `pickRetraining`), Task 4 (Zähler je Training, `matchesPreflopFilter`) |
| 10 Hinweis „Aus deinem Turnier vom 12.10.“ | Task 6 (`retrainingHint`, `RetrainingHint`) |
| 10 zwei richtige Antworten in Folge, höchstens 200, älteste fallen weg | Task 2 (`answerRetraining`, Obergrenze in `syncRetraining`) |
| 10 abschaltbar, Postflop nicht trainiert | Task 2 (`setRetrainingOn`), Task 6 (Schalter), Task 3 (nur `street === 'preflop'`) |
| 5 Turnierart änderbar | Task 5 (Abgleich nach `setKind`) |
| 9 Schreibsperre, Nur-Lesen, Export | Task 4 (Nur-Lesen ignoriert), Task 5 (nur nach Archiv-Schreiben im schreibenden Tab), Task 6 (Abgleich nach Spielstand-Import) |
| Haupt-Spec 8.4/8.5: nur Lesbares speichern, kein stiller Verlust, Warteschlange | Task 1 (Round-Trip-Tests, Feld wirft nie), Task 4 (Schreiben nur über `commit` → `persistence.save`) |
