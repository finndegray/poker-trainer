# Plan 7: Hand-Review – Import, Preflop-Bewertung, Archiv, Ansichten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use mindCoder:subagent-driven-development (recommended) or mindCoder:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GGPoker-Hand-Historien (`.txt`, `.zip`, eingefügter Text) offline im Browser einlesen, jede Preflop-Entscheidung des Hero mit den vorhandenen Push/Fold-Daten bzw. Starthand-Charts bewerten, die Ergebnisse in einem eigenen Turnier-Archiv (IndexedDB) ablegen und in drei Ansichten zeigen: Übersicht mit Verlauf „Fehler pro 100 Hände“, Turnier mit nach Schwere sortierten Händen, Hand mit Schritt-für-Schritt-Wiedergabe am vorhandenen Tisch und Preflop-Urteil wie im Training. Der manuelle Export bekommt einen optionalen Archiv-Teil.

**Architecture:** Neuer Ordner `src/review/` mit reinen Funktionen ohne React: Parser (`parse.ts`), Turnierart (`tournament-kind.ts`), Positionen und Tischverlauf (`hand-model.ts`), Preflop-Bewertung (`preflop.ts`), Hand-Analyse mit Versionsnummer (`analysis.ts`), Zusammenfassung/Schwere/Filter/Wochenverlauf (`summary.ts`), Archiv-Speicher in einer eigenen IndexedDB-Datenbank (`archive.ts`), Import-Pipeline mit `fflate` (`import.ts`) und Export-Teil (`export.ts`). `src/app/review-store.ts` ist ein eigener Store (Snapshot + Abos wie der Spiel-Store), der die Schreibsperre des Spielstands (`Persistence.canWrite()`) und den Nur-Lesen-Modus beachtet und alle Archiv-Schreibvorgänge nacheinander ausführt. Die Oberfläche (`ReviewScreen` mit Übersicht, Import, Turnier, Hand) nutzt die vorhandenen Bausteine weiter: `TableView` (aus `PokerTable`, um Board erweitert), `PushFoldVerdict`/`PreflopVerdict` (aus `FeedbackPanel`/`PreflopFeedbackPanel` herausgelöst), `TrendBars` (aus `TrendChart`), `FilterGroup` (aus `PreflopScreen`), `TrainingLayout`. Der Spielstand (Schema 1) wird nicht angefasst.

**Tech Stack:** TypeScript 5, React 19, Vite 6, Vitest 3 mit jsdom und Testing Library, idb-keyval (IndexedDB), vite-plugin-pwa, neu: `fflate` 0.8.2 (exakt gepinnt) zum Entpacken von ZIP-Dateien.

## Global Constraints

Verbindlich (wörtlich aus dem Auftrag):

- Archive in its own IndexedDB key space (e.g. a separate idb-keyval store), REVIEW_SCHEMA_VERSION = 1; the game save (schema 1) stays byte-identical; manual export gets an optional archive part and old export files stay importable; automatic backups keep containing only the game save.
- ZIP: use `fflate` pinned to an exact version (e.g. 0.8.2) — add it via npm with an exact version; no other new runtime dependencies unless clearly justified.
- Heavy work off the main thread is a Plan 8 concern (Monte-Carlo); Plan 7 preflop analysis may run on the main thread in chunks (yield between hands) with a progress callback — state the choice.
- Preflop model selection by effective stack per spec section 6 (≤20 BB push/fold, 21–55 → 40-BB charts, >55 → 100-BB charts, „Näherung“ when >25 % off 40/100, raise ≥80 % of stack = shove/all-in, `nicht bewertet` reasons list from the spec). Satellite/bounty: errors become the hint, not counted.
- UI German with real umlauts; desktop two-column layout like training (TrainingLayout); keyboard ← → in hand view; read-only mode blocks import.
- Postflop heuristics (Plan 8) and retraining (Plan 9) are OUT of scope, but design the data model so Plan 8 can add postflop verdicts per decision without a breaking change (e.g. decision verdict union with a `street` field; postflop decisions in Plan 7 get `nicht bewertet: Postflop folgt` or are listed without a verdict — choose and state it).
- Reuse existing components/functions; extend with props rather than duplicating.
- Before each commit: `npm test`, `npm run typecheck`, `npm run check:portability`. Final task = build check + manual verification checklist (deploy via PR merge is not a task).

Projektregeln (Haupt-Spec 8.4/8.5 und bisherige Pläne):

- Spec: `docs/mindCoder/specs/2026-10-13-hand-review-design.md`, Umfang Abschnitt 12 „Plan 7“; dazu Abschnitte 3–6, 8, 9, 11 und 13.
- Speicherung (Haupt-Spec 8.4): „Es wird nur gespeichert, was sich nachweislich wieder laden lässt (Prüfung vor jedem Schreiben).“ „Stammt ein Spielstand aus einer neueren App-Version, wird er nicht überschrieben.“ Ein nicht lesbarer Eintrag wird nie still verworfen (Hand-Review-Spec 9: „Ein unlesbarer Archiv-Eintrag wird übersprungen und gemeldet, nie still gelöscht.“).
- Oberfläche (Haupt-Spec 8.5): Nur-Lesen-Modus zeigt den Hinweis und lässt nichts zu, das scheinbar gespeichert wird; Speichern über eine Warteschlange mit höchstens einem Schreibvorgang gleichzeitig; „Es darf nur ein Tab gleichzeitig schreiben (Web Locks oder BroadcastChannel). Andere Tabs zeigen einen Hinweis.“; ohne IndexedDB Rückfall auf den Arbeitsspeicher.
- Identifier und Code-Kommentare auf Englisch, Texte in der Oberfläche auf Deutsch mit echten Umlauten; Dateien mit Umlauten nur mit dem Datei-Schreibwerkzeug anlegen (keine Shell-Heredocs). LF-Zeilenenden. Alle Entwicklerbefehle über npm-Skripte.
- Design-Tokens aus `src/ui/theme.css`; keine neuen Farben. Bedienelemente mindestens 44 px hoch.
- Tasten wirken nur, wenn kein Eingabefeld fokussiert ist (`isTypingTarget`).
- Commit-Nachrichten auf Deutsch, letzte Zeile `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (als zweites `-m`).
- Einzelne Testdateien laufen mit `npm test -- <Pfad>` (das Skript ist `vitest run`).
- Die Original-Hand-Historien liegen in `samples/` (per `.gitignore` ausgeschlossen) und sind Daten, nie ausführbarer Inhalt. Ins Repo kommen nur die Fixtures aus Task 1.

## Entscheidungen zu offenen Punkten der Spec

- **Hauptthread in Häppchen (Pflicht-Entscheidung):** Die Preflop-Analyse läuft im Hauptthread. `analyzePlan` bewertet je 25 Hände (`HANDS_PER_CHUNK`) und gibt danach per `setTimeout(0)` an den Browser zurück; vorher meldet sie den Fortschritt `{ tournament, tournaments, hand, hands }`. Gemessen mit dem Prototyp: 477 echte Hände in etwa 0,3 s (Entpacken, Lesen, Bewerten, Speichern im Arbeitsspeicher); der Leistungstest in Task 6 verlangt 500 Hände unter 30 s. Ein Web Worker kommt erst mit der Monte-Carlo-Rechnung in Plan 8.
- **Postflop in Plan 7 (Pflicht-Entscheidung):** Jede Hero-Aktion ab dem Flop wird als Entscheidung mit `street` (`flop`/`turn`/`river`), Pot, zu callendem Betrag und Stack gespeichert und bekommt `rating: { model: 'unrated', reason: 'postflopPending' }`, angezeigt als „Nicht bewertet – Postflop-Bewertung folgt“. Sie zählt weder als Fehler noch als Hinweis. Plan 8 ergänzt die Union `DecisionRating` um `{ model: 'postflop', … }`, erhöht `ANALYSIS_VERSION` auf 2, und archivierte Hände werden beim Öffnen neu bewertet – ohne Änderung von `REVIEW_SCHEMA_VERSION`.
- **Eigene Datenbank statt zweitem Object Store:** idb-keyval legt ein Object Store nur beim ersten Öffnen einer Datenbank an; ein zweiter Store in `poker-trainer` würde nie erzeugt. Das Archiv liegt deshalb in der Datenbank `poker-trainer-review` (Store `kv`), Schlüssel `tournament:<Turnier-ID>` und `hand:<TM-Nummer>`. Jeder Datensatz trägt `reviewSchemaVersion: 1`. Turnier und neue Hände werden mit `setMany` in einer Transaktion geschrieben.
- **Analyse-Version:** Jede Hand speichert `analysisVersion` und `analysis`. Weicht die Version ab oder ist die gespeicherte Analyse strukturell kaputt, wird die Hand beim Öffnen des Turniers aus dem gespeicherten Originaltext neu bewertet und – wenn dieser Tab schreiben darf – zurückgeschrieben. Ein unlesbarer Originaltext wird gemeldet, nicht gelöscht.
- **Turnierart:** Erkennung nach Spec 5 (Wortgrenzen, ohne Groß-/Kleinschreibung; Satellit-Wörter haben Vorrang). Die Analyse speichert das Chart-Urteil unabhängig von der Art; die Art wird erst bei Zählung und Anzeige angewandt (`decisionOutcome`). Ein Wechsel der Art berechnet die Zusammenfassung neu und schreibt den Turnier-Datensatz.
- **Positionen:** Die Blinds kommen aus den Posts, alle anderen werden vom Button rückwärts gezählt (BTN, CO, HJ, LJ, UTG+1, UTG). Am kurzen Tisch fallen also die frühen Positionen weg; bewertet wird mit den 8-max-Charts der so ermittelten Position. Andere Tischgrößen als `8-max`: Hand wird importiert, Urteil „nicht bewertet: Tischgröße“.
- **Effektiver Stack:** Spielbare Chips = Chips laut Sitzzeile minus gezahlter Ante, geteilt durch die Big Blind. Relevanter Gegner: bei ungeöffnetem Pot der größte Stack hinter dem Hero; gegen einen Raise der Raiser; gegen eine 3-Bet der 3-Bettor. Gerundet auf ganze BB: ≤ 20 Push/Fold (mindestens 1 BB), 21–55 Chart 40 BB, darüber Chart 100 BB. „Näherung“, wenn |effektiv − Tiefe| / Tiefe > 25 %.
- **All-in-Erkennung:** Eine Aktion ist All-in, wenn GGPoker „and is all-in“ schreibt, der Stack danach 0 ist (auch bei Blind-Posts ohne Vermerk) oder der Spieler damit mindestens 80 % seines spielbaren Stacks investiert hat (`SHOVE_SHARE`). Ein Re-Shove über ein einzelnes All-in zählt als Call.
- **Gründe für „nicht bewertet“** (`UNRATED_TEXT`): Tischgröße · Positionen nicht erkannt · Keine Hole Cards · Limp oder Limp-Pot · Mehrere Caller vor dir (schon ein Cold-Call nach dem Open) · Squeeze · Mehrere Raises vor dir (kalt gegen eine 3-Bet) · 4-Bet-Pot und tiefer · Raise oder Call mit höchstens 20 BB (kein Push/Fold-Spot) · All-in mit mehr als 20 BB (kein Chart-Spot) · Spot vom Modell nicht abgedeckt · Postflop-Bewertung folgt.
- **Fehler und Hinweise:** `error` = Preflop „falsch“ in einem normalen Turnier; in Satellit/Bounty wird daraus `hint` mit „Satellit/Bounty – Standard-Chart nur bedingt gültig“ (Überschrift „Hinweis“, gold), nicht gezählt. „knapp“ ist nie ein Fehler.
- **Filter im Turnier:** „Nur Fehler“ = Hände mit gezähltem Fehler; „Auch fraglich“ = zusätzlich Hinweise (Plan 8 ergänzt Postflop „fraglich“); „Alle“ ist voreingestellt, weil die Liste ohnehin nach Schwere sortiert ist (Fehler, Hinweis, knapp, richtig, nicht bewertet; dann Spielzeit).
- **Übersicht:** Spalte „Fehler postflop“ zeigt bis Plan 8 „–“. Verlauf: letzte 8 Wochen, Fehler pro 100 Hände aus den Tageszählern der Turnier-Zusammenfassungen (keine Hände laden).
- **Datum:** Die Uhrzeit aus dem Kopf wird unverändert als Text gespeichert (`playedAt` „2026-10-13 15:46:28“, `dateKey` „2026-10-13“); keine Zeitzonen-Umrechnung.
- **Duplikate und kaputte Archiv-Einträge:** Schlüssel ist die Hand-Nummer (`TM…`), auch innerhalb eines Imports. Hände eines Turniers, dessen Archiv-Datensatz unlesbar ist, werden mit „Turnier im Archiv nicht lesbar“ übersprungen, damit der kaputte Datensatz nie überschrieben wird. Ein Datensatz mit neuerer `reviewSchemaVersion` sperrt das Schreiben ins Archiv.
- **Export:** Ohne archivierte Turniere ist die Exportdatei exakt der Spielstand wie bisher (sofortiger Download). Sonst wird an das JSON-Objekt der Schlüssel `reviewArchive` angehängt: `{ reviewSchemaVersion: 1, tournaments: [{ id, name, kind }], hands: [{ id, tournamentId, raw }] }`. `deserialize` ignoriert unbekannte Schlüssel, deshalb können auch ältere App-Versionen diese Datei laden. Beim Import wird der Archiv-Teil zuerst geprüft (kaputt → gar nichts importieren), dann der Spielstand ersetzt, dann das Archiv zusammengeführt (Duplikate über die Hand-Nummer; eine im Zielarchiv schon vorhandene Turnier-Art bleibt). Automatische Sicherungen bleiben unverändert (`persistence.backups.create(serialize(save))`).
- **Schreibrecht:** `Persistence` bekommt `canWrite()`; der Review-Store prüft es vor jedem Schreiben und zeigt den Grund der Sperre („Nur-Lesen-Modus: …“, „Import ist nur in dem Tab möglich, der deinen Fortschritt speichert.“, „Das Hand-Archiv stammt aus einer neueren Version – …“). Ansehen bleibt im Nur-Lesen-Modus möglich (Kachel nicht gesperrt). Im Speicher-Rückfall (kein IndexedDB) liegt auch das Archiv nur im Arbeitsspeicher.
- **Hand-Ansicht:** Ein Schritt je Ereignis nach den Posts. Bei Hero-Entscheidungen zeigt der Tisch die Lage vor der Aktion („Du bist dran – deine Wahl: …“), sonst nach dem Ereignis. Tasten ← → springen zur vorigen/nächsten Entscheidung, Buttons „Schritt zurück“/„Schritt vor“ gehen einzeln. Rechts (am PC) bzw. darunter das Urteil der aktuellen Entscheidung.

## Befunde aus den Beispieldaten (477 Hände, `samples/000001a1-35db-41af-0000-00007a500c79.zip`)

Mit einem Prototyp des Parsers aus diesem Plan geprüft: alle 477 Hände werden gelesen, Pot-Summen stimmen, Import doppelt → 477 „schon vorhanden“.

- Alle Dateien haben **LF**, keine CRLF und keine BOM; CRLF/BOM werden trotzdem unterstützt und mit umgewandelten Fixtures getestet.
- **10 Dateien, aber 8 Turniere:** „Daily Classic $1“ (Turnier #318096259) verteilt sich auf drei Dateien (`…1100 - Daily Classic 1.txt`, `…1226 - Daily Classic 1.txt`, `…1226 - Daily Classic 1(1).txt` mit nur einer Hand). Gruppiert wird deshalb nach Turnier-ID, nicht nach Datei.
- Jede Hand enthält `*** SHOWDOWN ***`, auch ohne Showdown (176 Hände enden preflop). Ein echter Showdown ist nur an `shows`-Zeilen erkennbar.
- `shows` kommt bei All-ins **vor** den restlichen Board-Karten; einzelne Spieler zeigen nur **eine** Karte (`shows [3d]`).
- Für jeden Gegner steht `Dealt to <Name> ` (mit Leerzeichen am Ende, ohne Karten).
- Blind-Posts, die den Spieler all-in setzen, haben **keinen** Vermerk „and is all-in“ (`posts big blind 20` bei BB 40); ebenso kleinere All-in-Calls (`calls 42 and is all-in` gegen BB 100).
- Sitznummern mit Lücken (`Seat 1, 5, 6, 7, 8`), Tische mit 2 bis 8 Spielern (Verteilung 2:1, 3:3, 4:3, 5:25, 6:60, 7:150, 8:235), alle `8-max`, Button immer besetzt; keine Zeilen für „sitting out“.
- Mehrere `collected … from pot` bei Side Pots (37 Hände). Antes zwischen 0,8 und 1,2 BB je Hand (Ante pro Spieler).
- Stack-Verteilung des Hero: 137 Hände ≤ 20 BB, 262 mit 21–55 BB, 78 über 55 BB. Turnierarten: „Step“ und „T$ Builder“ → satellit, „Bounty Hunters“ → bounty, „Daily Classic“ → normal.
- Viele Limp-Pots (63 Hero-Entscheidungen „Limp oder Limp-Pot“) und 62 Entscheidungen „Raise oder Call mit höchstens 20 BB“ – erwartbar, aber in der manuellen Abnahme zu beobachten.

## Bestehende API (unverändert nutzen)

- `src/engine/cards.ts`: `Card`, `parseCard('Kh')`, `cardName(card)`, `handClassOf(a, b)`, `handName(h)`, `parseHand('AKo')`, `HAND_COUNT`.
- `src/engine/positions.ts`: `POSITIONS` (`UTG … BB`), `POSITION_LABELS`, `Position`, `seatOf`.
- `src/engine/pushfold.ts`: `Spot`, `Action`, `Grade`, `Verdict`, `grade(data, spot, chosen)`, `chart(data, situation)`; `src/engine/pushfold-data.ts`: `PushFoldData`, `MIN_STACK` (1), `MAX_STACK` (20); `src/engine/position-compare.ts`: `comparePositions(data, spot)`; `src/engine/test-fixtures.ts`: `makeFixture(ev)`.
- `src/engine/preflop/spots.ts`: `PreflopSpot`, `PreflopKind`, `PreflopAction`, `StackDepth`, `chartKeyFor` (wirft bei ungültigem Spot), `isPreflopSpot`; `charts.ts`: `chartFor`; `grading.ts`: `gradePreflop`, `preflopCells`, `comparePreflopPositions`, `PreflopGrade`, `PreflopComparison`, `PreflopCell`.
- `src/app/data.ts`: `getPushFoldData()`. `src/app/format.ts`: `formatBb`, `formatCount`, `verdictLabel`, `preflopSpotTitle`, `xpSummary`.
- `src/app/persistence.ts`: `Persistence`, `openPersistence` (interne Variable `writable`). `src/storage/store.ts`: `indexedDbBackend`, `saveState`, `SAVE_KEY`; `src/storage/schema.ts`: `serialize`, `deserialize`, `emptyState`; `src/storage/test-saves.ts`: `TODAY_SAVE`.
- `src/game/streak.ts`: `localDateKey`, `shiftDateKey`.
- UI: `TrainingLayout({ main, side })`, `RangeChart`, `PositionRow`, `PlayingCard`, `chart-cells.ts` (`CELL_CLASS`, `PREFLOP_CELL_CLASS`, …), `table-model.ts` (`SeatModel`, `SeatRole`, `TableModel`), `useGame`, `useGameStore`, `renderWithStore` (`src/ui/test-utils.tsx`).

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/review/fixtures/*.txt` | Neun echte Hände aus den Beispieldaten (Fixtures) |
| `src/review/parse.ts` | GGPoker-Text → `ParsedHand` (Ereignisse, Beträge, Board), Aufteilen, Überspringen mit Grund |
| `src/review/tournament-kind.ts` | Turnierart erkennen, Labels |
| `src/review/hand-model.ts` | Positionen, Tischzustand vor jedem Ereignis, spielbare Chips |
| `src/review/test-hands.ts` | Konstruierte Hände für Tests (`ggHand`) |
| `src/review/preflop.ts` | Modellwahl, Spot-Erkennung, Urteil oder Grund „nicht bewertet“ |
| `src/review/analysis.ts` | `ANALYSIS_VERSION`, Hero-Entscheidungen mit Zahlen und Urteil |
| `src/review/summary.ts` | Fehler/Hinweis je Turnierart, Schwere, Filter, Zusammenfassung, Wochenverlauf |
| `src/review/archive.ts` | Archiv-Datensätze, Prüfung, eigene IndexedDB, Lesen/Schreiben/Löschen |
| `src/review/import.ts` | Dateien/ZIP lesen, Grenzen, Duplikate, Häppchen-Analyse, Datensätze bauen |
| `src/review/export.ts` | Archiv-Teil im manuellen Export |
| `src/app/review-store.ts` | Review-Store: Laden, Import, Turnier öffnen, Art ändern, löschen, Export/Merge, Schreibrecht |
| `src/app/persistence.ts` | `canWrite()` |
| `src/ui/ReviewContext.tsx`, `src/ui/test-utils.tsx`, `src/main.tsx` | Verdrahtung |
| `src/ui/screens/SettingsScreen.tsx` | Export/Import mit Archiv-Teil |
| `src/app/format.ts` | Zahlen, Datum, Aktionen der Hand-Historie |
| `src/ui/replay-model.ts` | Wiedergabe-Schritte und Tischmodell |
| `src/ui/components/PokerTable.tsx`, `FeedbackPanel.tsx`, `PreflopFeedbackPanel.tsx`, `ReviewDecisionPanel.tsx` | Tisch mit Board, wiederverwendbare Urteile, Urteil je Entscheidung |
| `src/ui/components/TrendChart.tsx`, `FilterGroup.tsx`, `ActionBar.tsx` | Verallgemeinerte Bausteine |
| `src/ui/screens/Review*.tsx`, `review.css`, `HomeScreen.tsx`, `App.tsx` | Bildschirme, Kachel, Navigation |

---

### Task 1: Fixtures und Parser für GGPoker-Hand-Historien

**Files:**
- Create: `src/review/fixtures/daily-classic.txt`, `src/review/fixtures/step-satellites.txt`, `src/review/fixtures/bounty.txt`, `src/review/parse.ts`, `src/review/parse.test.ts`

**Interfaces:**
- Consumes: `Card`, `parseCard` aus `src/engine/cards.ts`
- Produces (`src/review/parse.ts`):
  - `HERO = 'Hero'`
  - `type Street = 'preflop' | 'flop' | 'turn' | 'river'`, `type BoardStreet = Exclude<Street, 'preflop'>`, `type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise'`, `type SeatInfo = { seat: number; name: string; chips: number }`
  - `type HandEvent = { type: 'ante' | 'smallBlind' | 'bigBlind'; player; amount; allIn } | { type: 'action'; street: Street; player; action: ActionType; amount: number; to: number | null; allIn: boolean } | { type: 'board'; street: BoardStreet; cards: Card[] } | { type: 'uncalled'; player; amount } | { type: 'show'; player; cards: Card[] } | { type: 'collect'; player; amount }` (Beträge in Chips; `amount` = was die Aktion in den Pot legt, `to` = Straßensumme eines Raise)
  - `type PostEvent`, `type ActionEvent` (Teilmengen von `HandEvent`)
  - `type ParsedHand = { id; tournamentId; tournamentName; level; smallBlind; bigBlind; ante; playedAt: string; dateKey: string; tableSize; buttonSeat; seats: SeatInfo[]; heroCards: [Card, Card] | null; events: HandEvent[]; board: Card[]; totalPot; raw: string }`
  - `type SkippedHand = { id: string | null; reason: string }`, `type ParseResult = { hands: ParsedHand[]; skipped: SkippedHand[] }`
  - `class HandParseError extends Error`
  - `normalizeText(text: string): string`, `splitHands(text: string): { hands: string[]; rest: string }`, `parseHand(text: string): ParsedHand` (wirft `HandParseError` mit deutschem Grund), `parseHistory(text: string): ParseResult`, `postOf(hand: ParsedHand, type: PostEvent['type'], player?: string): PostEvent | undefined`

Die Fixtures sind wörtlich aus den Beispieldaten kopiert (Gegnernamen sind dort schon anonymisierte Kürzel), in der Reihenfolge der Originaldatei (neueste Hand zuerst) und mit zwei Leerzeilen zwischen den Händen wie bei GGPoker. Abdeckung: Preflop-Fold (TM6532800963), Open-Raise (TM6532186101), 3-Bet-Pot (TM6533069892), Push/Fold-Spot mit Open-Shove, All-in und Showdown (TM6532734973), Call gegen All-in mit Showdown (TM6532448269), Limp-Pot (TM6533069879), Postflop mit Bets, Raise und Call samt Bounty-Kopf (TM6532114653), Satellit-Kopf mit 3-Bet-Pot und Postflop-All-in (TM6532443900), Satellit mit Sitzlücken und Big Blind, die den Spieler all-in setzt (TM6532799440).

- [ ] **Step 1: Fixtures anlegen (Datei-Schreibwerkzeug, LF, Inhalt exakt wie unten, mit abschließendem Zeilenumbruch)**

`src/review/fixtures/daily-classic.txt`:
```text
Poker Hand #TM6532448269: Tournament #318096259, Daily Classic $1 Hold'em No Limit - Level19(1,500/3,000(350)) - 2026/10/13 15:46:28
Table '83' 8-max Seat #4 is the button
Seat 1: d0b1a678 (57,872 in chips)
Seat 2: 5c98de81 (193,255 in chips)
Seat 3: Hero (56,377 in chips)
Seat 4: 96886ab2 (75,027 in chips)
Seat 5: ae52e9e5 (14,468 in chips)
Seat 6: 5858e747 (21,464 in chips)
Seat 7: 77e1f37f (30,687 in chips)
Seat 8: aae51c89 (45,587 in chips)
5858e747: posts the ante 350
5c98de81: posts the ante 350
ae52e9e5: posts the ante 350
Hero: posts the ante 350
96886ab2: posts the ante 350
aae51c89: posts the ante 350
77e1f37f: posts the ante 350
d0b1a678: posts the ante 350
ae52e9e5: posts small blind 1,500
5858e747: posts big blind 3,000
*** HOLE CARDS ***
Dealt to d0b1a678 
Dealt to 5c98de81 
Dealt to Hero [Qd Ad]
Dealt to 96886ab2 
Dealt to ae52e9e5 
Dealt to 5858e747 
Dealt to 77e1f37f 
Dealt to aae51c89 
77e1f37f: raises 27,337 to 30,337 and is all-in
aae51c89: folds
d0b1a678: folds
5c98de81: folds
Hero: raises 25,690 to 56,027 and is all-in
96886ab2: folds
ae52e9e5: folds
5858e747: folds
Uncalled bet (25,690) returned to Hero
Hero: shows [Qd Ad]
77e1f37f: shows [Ah Ts]
*** FLOP *** [Qh 5c 3c]
*** TURN *** [Qh 5c 3c] [6d]
*** RIVER *** [Qh 5c 3c 6d] [4c]
*** SHOWDOWN ***
Hero collected 67,974 from pot
*** SUMMARY ***
Total pot 67,974 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [Qh 5c 3c 6d 4c]
Seat 1: d0b1a678 folded before Flop
Seat 2: 5c98de81 folded before Flop
Seat 3: Hero showed [Qd Ad] and won (67,974) with a pair of Queens
Seat 4: 96886ab2 (button) folded before Flop
Seat 5: ae52e9e5 (small blind) folded before Flop
Seat 6: 5858e747 (big blind) folded before Flop
Seat 7: 77e1f37f showed [Ah Ts] and lost with Ace high
Seat 8: aae51c89 folded before Flop


Poker Hand #TM6532734973: Tournament #318096259, Daily Classic $1 Hold'em No Limit - Level15(600/1,200(150)) - 2026/10/13 15:10:04
Table '65' 8-max Seat #4 is the button
Seat 1: 9b4b9f25 (37,269 in chips)
Seat 2: Hero (19,830 in chips)
Seat 3: 52f864b (49,230 in chips)
Seat 4: 6cb36585 (42,912 in chips)
Seat 5: af26c20d (59,978 in chips)
Seat 6: b0249070 (26,818 in chips)
Seat 7: 782fbbaf (51,793 in chips)
Seat 8: f982e6ef (18,346 in chips)
9b4b9f25: posts the ante 150
Hero: posts the ante 150
782fbbaf: posts the ante 150
b0249070: posts the ante 150
52f864b: posts the ante 150
af26c20d: posts the ante 150
f982e6ef: posts the ante 150
6cb36585: posts the ante 150
af26c20d: posts small blind 600
b0249070: posts big blind 1,200
*** HOLE CARDS ***
Dealt to 9b4b9f25 
Dealt to Hero [4c Ah]
Dealt to 52f864b 
Dealt to 6cb36585 
Dealt to af26c20d 
Dealt to b0249070 
Dealt to 782fbbaf 
Dealt to f982e6ef 
782fbbaf: folds
f982e6ef: folds
9b4b9f25: folds
Hero: raises 18,480 to 19,680 and is all-in
52f864b: folds
6cb36585: folds
af26c20d: raises 40,148 to 59,828 and is all-in
b0249070: folds
Uncalled bet (40,148) returned to af26c20d
af26c20d: shows [As Qd]
Hero: shows [4c Ah]
*** FLOP *** [9s 4h 6s]
*** TURN *** [9s 4h 6s] [8d]
*** RIVER *** [9s 4h 6s 8d] [Tc]
*** SHOWDOWN ***
Hero collected 41,760 from pot
*** SUMMARY ***
Total pot 41,760 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [9s 4h 6s 8d Tc]
Seat 1: 9b4b9f25 folded before Flop
Seat 2: Hero showed [4c Ah] and won (41,760) with a pair of Fours
Seat 3: 52f864b folded before Flop
Seat 4: 6cb36585 (button) folded before Flop
Seat 5: af26c20d (small blind) showed [As Qd] and lost with Ace high
Seat 6: b0249070 (big blind) folded before Flop
Seat 7: 782fbbaf folded before Flop
Seat 8: f982e6ef folded before Flop


Poker Hand #TM6533069892: Tournament #318096259, Daily Classic $1 Hold'em No Limit - Level5(125/250(30)) - 2026/10/13 13:36:58
Table '51' 8-max Seat #6 is the button
Seat 1: 54aea40b (11,360 in chips)
Seat 2: 8302b5df (7,326 in chips)
Seat 3: b881ea56 (23,965 in chips)
Seat 4: 3f1a87b9 (9,678 in chips)
Seat 5: b89d64e4 (17,747 in chips)
Seat 6: e4f694fe (10,493 in chips)
Seat 7: 257eeaf0 (11,416 in chips)
Seat 8: Hero (23,248 in chips)
e4f694fe: posts the ante 30
b89d64e4: posts the ante 30
54aea40b: posts the ante 30
b881ea56: posts the ante 30
Hero: posts the ante 30
257eeaf0: posts the ante 30
3f1a87b9: posts the ante 30
8302b5df: posts the ante 30
257eeaf0: posts small blind 125
Hero: posts big blind 250
*** HOLE CARDS ***
Dealt to 54aea40b 
Dealt to 8302b5df 
Dealt to b881ea56 
Dealt to 3f1a87b9 
Dealt to b89d64e4 
Dealt to e4f694fe 
Dealt to 257eeaf0 
Dealt to Hero [7s 3s]
54aea40b: folds
8302b5df: folds
b881ea56: folds
3f1a87b9: folds
b89d64e4: folds
e4f694fe: folds
257eeaf0: raises 500 to 750
Hero: raises 1,750 to 2,500
257eeaf0: folds
Uncalled bet (1,750) returned to Hero
*** SHOWDOWN ***
Hero collected 1,740 from pot
*** SUMMARY ***
Total pot 1,740 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Seat 1: 54aea40b folded before Flop
Seat 2: 8302b5df folded before Flop
Seat 3: b881ea56 folded before Flop
Seat 4: 3f1a87b9 folded before Flop
Seat 5: b89d64e4 folded before Flop
Seat 6: e4f694fe (button) folded before Flop
Seat 7: 257eeaf0 (small blind) folded before Flop
Seat 8: Hero (big blind) collected (1,740)


Poker Hand #TM6533069879: Tournament #318096259, Daily Classic $1 Hold'em No Limit - Level5(125/250(30)) - 2026/10/13 13:36:33
Table '51' 8-max Seat #5 is the button
Seat 1: 54aea40b (10,525 in chips)
Seat 2: 8302b5df (7,356 in chips)
Seat 3: b881ea56 (23,995 in chips)
Seat 4: 3f1a87b9 (9,708 in chips)
Seat 5: b89d64e4 (17,777 in chips)
Seat 6: e4f694fe (10,648 in chips)
Seat 7: 257eeaf0 (11,696 in chips)
Seat 8: Hero (23,528 in chips)
b89d64e4: posts the ante 30
e4f694fe: posts the ante 30
54aea40b: posts the ante 30
b881ea56: posts the ante 30
Hero: posts the ante 30
257eeaf0: posts the ante 30
3f1a87b9: posts the ante 30
8302b5df: posts the ante 30
e4f694fe: posts small blind 125
257eeaf0: posts big blind 250
*** HOLE CARDS ***
Dealt to 54aea40b 
Dealt to 8302b5df 
Dealt to b881ea56 
Dealt to 3f1a87b9 
Dealt to b89d64e4 
Dealt to e4f694fe 
Dealt to 257eeaf0 
Dealt to Hero [4d 5d]
Hero: calls 250
54aea40b: raises 837 to 1,087
8302b5df: folds
b881ea56: folds
3f1a87b9: folds
b89d64e4: folds
e4f694fe: folds
257eeaf0: folds
Hero: folds
Uncalled bet (837) returned to 54aea40b
*** SHOWDOWN ***
54aea40b collected 1,115 from pot
*** SUMMARY ***
Total pot 1,115 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Seat 1: 54aea40b collected (1,115)
Seat 2: 8302b5df folded before Flop
Seat 3: b881ea56 folded before Flop
Seat 4: 3f1a87b9 folded before Flop
Seat 5: b89d64e4 (button) folded before Flop
Seat 6: e4f694fe (small blind) folded before Flop
Seat 7: 257eeaf0 (big blind) folded before Flop
Seat 8: Hero folded before Flop


Poker Hand #TM6532186101: Tournament #318096259, Daily Classic $1 Hold'em No Limit - Level2(60/120(15)) - 2026/10/13 13:15:28
Table '40' 8-max Seat #8 is the button
Seat 1: 3639b11c (11,545 in chips)
Seat 2: 40dadbee (9,565 in chips)
Seat 3: 5e117d7 (15,420 in chips)
Seat 4: 8f83b3ff (6,186 in chips)
Seat 5: 30f273f7 (9,325 in chips)
Seat 6: 998160bb (16,042 in chips)
Seat 7: 565bdc42 (9,400 in chips)
Seat 8: Hero (11,059 in chips)
5e117d7: posts the ante 15
565bdc42: posts the ante 15
8f83b3ff: posts the ante 15
Hero: posts the ante 15
3639b11c: posts the ante 15
30f273f7: posts the ante 15
998160bb: posts the ante 15
40dadbee: posts the ante 15
3639b11c: posts small blind 60
40dadbee: posts big blind 120
*** HOLE CARDS ***
Dealt to 3639b11c 
Dealt to 40dadbee 
Dealt to 5e117d7 
Dealt to 8f83b3ff 
Dealt to 30f273f7 
Dealt to 998160bb 
Dealt to 565bdc42 
Dealt to Hero [Kd 6h]
5e117d7: folds
8f83b3ff: folds
30f273f7: folds
998160bb: folds
565bdc42: folds
Hero: raises 240 to 360
3639b11c: folds
40dadbee: folds
Uncalled bet (240) returned to Hero
*** SHOWDOWN ***
Hero collected 420 from pot
*** SUMMARY ***
Total pot 420 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Seat 1: 3639b11c (small blind) folded before Flop
Seat 2: 40dadbee (big blind) folded before Flop
Seat 3: 5e117d7 folded before Flop
Seat 4: 8f83b3ff folded before Flop
Seat 5: 30f273f7 folded before Flop
Seat 6: 998160bb folded before Flop
Seat 7: 565bdc42 folded before Flop
Seat 8: Hero (button) collected (420)


Poker Hand #TM6532800963: Tournament #318096259, Daily Classic $1 Hold'em No Limit - Level2(60/120(15)) - 2026/10/13 13:09:41
Table '21' 8-max Seat #2 is the button
Seat 1: 8c2bc9ef (10,000 in chips)
Seat 2: cb96225f (9,940 in chips)
Seat 4: c86bbb11 (12,166 in chips)
Seat 5: a2b1cb16 (9,589 in chips)
Seat 6: Hero (8,944 in chips)
Seat 7: e9cda467 (9,958 in chips)
Seat 8: 59cb7482 (9,837 in chips)
cb96225f: posts the ante 15
e9cda467: posts the ante 15
a2b1cb16: posts the ante 15
c86bbb11: posts the ante 15
Hero: posts the ante 15
8c2bc9ef: posts the ante 15
59cb7482: posts the ante 15
c86bbb11: posts small blind 60
a2b1cb16: posts big blind 120
*** HOLE CARDS ***
Dealt to 8c2bc9ef 
Dealt to cb96225f 
Dealt to c86bbb11 
Dealt to a2b1cb16 
Dealt to Hero [4h 6c]
Dealt to e9cda467 
Dealt to 59cb7482 
Hero: folds
e9cda467: folds
59cb7482: folds
8c2bc9ef: folds
cb96225f: folds
c86bbb11: folds
Uncalled bet (60) returned to a2b1cb16
*** SHOWDOWN ***
a2b1cb16 collected 225 from pot
*** SUMMARY ***
Total pot 225 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Seat 1: 8c2bc9ef folded before Flop
Seat 2: cb96225f (button) folded before Flop
Seat 4: c86bbb11 (small blind) folded before Flop
Seat 5: a2b1cb16 (big blind) collected (225)
Seat 6: Hero folded before Flop
Seat 7: e9cda467 folded before Flop
Seat 8: 59cb7482 folded before Flop
```

`src/review/fixtures/step-satellites.txt`:
```text
Poker Hand #TM6532443900: Tournament #318586851, $0.50 Step to The Weekender Hold'em No Limit - Level1(20/40(4)) - 2026/10/13 13:03:32
Table '2' 8-max Seat #3 is the button
Seat 1: 9e1d0c10 (1,084 in chips)
Seat 2: 314cd32f (924 in chips)
Seat 3: fe2b2d47 (840 in chips)
Seat 4: Hero (1,104 in chips)
Seat 5: 3c65dbb1 (1,048 in chips)
Seat 6: 3c274f3 (1,000 in chips)
fe2b2d47: posts the ante 4
3c274f3: posts the ante 4
Hero: posts the ante 4
314cd32f: posts the ante 4
3c65dbb1: posts the ante 4
9e1d0c10: posts the ante 4
Hero: posts small blind 20
3c65dbb1: posts big blind 40
*** HOLE CARDS ***
Dealt to 9e1d0c10 
Dealt to 314cd32f 
Dealt to fe2b2d47 
Dealt to Hero [6s As]
Dealt to 3c65dbb1 
Dealt to 3c274f3 
3c274f3: folds
9e1d0c10: folds
314cd32f: folds
fe2b2d47: folds
Hero: raises 80 to 120
3c65dbb1: raises 160 to 280
Hero: calls 160
*** FLOP *** [6c 5s 4s]
Hero: checks
3c65dbb1: bets 193
Hero: raises 627 to 820 and is all-in
3c65dbb1: calls 571 and is all-in
Uncalled bet (56) returned to Hero
Hero: shows [6s As] (a pair of Sixes)
3c65dbb1: shows [Ac Jc] (Ace high)
*** TURN *** [6c 5s 4s] [2d]
*** RIVER *** [6c 5s 4s 2d] [8s]
*** SHOWDOWN ***
Hero collected 2,112 from pot
*** SUMMARY ***
Total pot 2,112 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [6c 5s 4s 2d 8s]
Seat 1: 9e1d0c10 folded before Flop
Seat 2: 314cd32f folded before Flop
Seat 3: fe2b2d47 (button) folded before Flop
Seat 4: Hero (small blind) showed [6s As] and won (2,112) with a flush Ace high
Seat 5: 3c65dbb1 (big blind) showed [Ac Jc] and lost with Ace high
Seat 6: 3c274f3 folded before Flop


Poker Hand #TM6532799440: Tournament #318586827, $0.50 Step to The Weekender Hold'em No Limit - Level1(20/40(4)) - 2026/10/13 11:31:49
Table '3' 8-max Seat #7 is the button
Seat 1: 16564bde (24 in chips)
Seat 5: 3d93b9d2 (2,084 in chips)
Seat 6: fbdde14e (996 in chips)
Seat 7: 3e9ba0b6 (1,948 in chips)
Seat 8: Hero (1,020 in chips)
3d93b9d2: posts the ante 4
fbdde14e: posts the ante 4
Hero: posts the ante 4
16564bde: posts the ante 4
3e9ba0b6: posts the ante 4
Hero: posts small blind 20
16564bde: posts big blind 20
*** HOLE CARDS ***
Dealt to 16564bde 
Dealt to 3d93b9d2 
Dealt to fbdde14e 
Dealt to 3e9ba0b6 
Dealt to Hero [Kd Js]
3d93b9d2: folds
fbdde14e: folds
3e9ba0b6: raises 80 to 120
Hero: calls 100
*** FLOP *** [4s Jd 9c]
Hero: bets 140
3e9ba0b6: folds
Uncalled bet (140) returned to Hero
Hero: shows [Kd Js] (a pair of Jacks)
16564bde: shows [5d 5s] (a pair of Fives)
*** TURN *** [4s Jd 9c] [7c]
*** RIVER *** [4s Jd 9c 7c] [Ks]
*** SHOWDOWN ***
Hero collected 80 from pot
Hero collected 200 from pot
*** SUMMARY ***
Total pot 280 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [4s Jd 9c 7c Ks]
Seat 1: 16564bde (big blind) showed [5d 5s] and lost with a pair of Fives
Seat 5: 3d93b9d2 folded before Flop
Seat 6: fbdde14e folded before Flop
Seat 7: 3e9ba0b6 (button) folded on the Flop
Seat 8: Hero (small blind) showed [Kd Js] and won (280) with two pair, Kings and Jacks
```

`src/review/fixtures/bounty.txt`:
```text
Poker Hand #TM6532114653: Tournament #318083464, Bounty Hunters $2.50 Hold'em No Limit - Level2(60/120(18)) - 2026/10/13 11:41:03
Table '25' 8-max Seat #1 is the button
Seat 1: 80a2ad01 (10,646 in chips)
Seat 2: f6039b65 (9,724 in chips)
Seat 3: 5dff40ad (10,628 in chips)
Seat 4: Hero (9,412 in chips)
Seat 5: feb63507 (10,889 in chips)
Seat 6: 57c0f97 (8,878 in chips)
Seat 7: a463582d (20,251 in chips)
Seat 8: 3c9caf34 (20,771 in chips)
80a2ad01: posts the ante 18
f6039b65: posts the ante 18
5dff40ad: posts the ante 18
Hero: posts the ante 18
3c9caf34: posts the ante 18
a463582d: posts the ante 18
57c0f97: posts the ante 18
feb63507: posts the ante 18
f6039b65: posts small blind 60
5dff40ad: posts big blind 120
*** HOLE CARDS ***
Dealt to 80a2ad01 
Dealt to f6039b65 
Dealt to 5dff40ad 
Dealt to Hero [6c 6d]
Dealt to feb63507 
Dealt to 57c0f97 
Dealt to a463582d 
Dealt to 3c9caf34 
Hero: raises 240 to 360
feb63507: folds
57c0f97: folds
a463582d: folds
3c9caf34: calls 360
80a2ad01: folds
f6039b65: folds
5dff40ad: folds
*** FLOP *** [8h 9c 7h]
Hero: bets 522
3c9caf34: calls 522
*** TURN *** [8h 9c 7h] [Kd]
Hero: bets 1,566
3c9caf34: raises 2,046 to 3,612
Hero: calls 2,046
*** RIVER *** [8h 9c 7h Kd] [Ad]
Hero: checks
3c9caf34: bets 10,560
Hero: folds
Uncalled bet (10,560) returned to 3c9caf34
*** SHOWDOWN ***
3c9caf34 collected 9,312 from pot
*** SUMMARY ***
Total pot 9,312 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [8h 9c 7h Kd Ad]
Seat 1: 80a2ad01 (button) folded before Flop
Seat 2: f6039b65 (small blind) folded before Flop
Seat 3: 5dff40ad (big blind) folded before Flop
Seat 4: Hero folded on the River
Seat 5: feb63507 folded before Flop
Seat 6: 57c0f97 folded before Flop
Seat 7: a463582d folded before Flop
Seat 8: 3c9caf34 won (9,312)
```

- [ ] **Step 2: Failing Tests schreiben**

`src/review/parse.test.ts` anlegen (die Fixtures werden über Vites `?raw`-Import gelesen; der Typ kommt aus `vite/client`):
```ts
import { describe, expect, it } from 'vitest';
import { parseCard } from '../engine/cards';
import bounty from './fixtures/bounty.txt?raw';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import steps from './fixtures/step-satellites.txt?raw';
import { HERO, type HandEvent, type ParsedHand, parseHand, parseHistory, splitHands } from './parse';

const cards = (text: string) => text.split(' ').map(parseCard);
const byId = (hands: ParsedHand[], id: string) => hands.find((h) => h.id === id)!;
const actions = (hand: ParsedHand) =>
  hand.events.filter((e): e is Extract<HandEvent, { type: 'action' }> => e.type === 'action');

describe('splitHands', () => {
  it('splits a GGPoker file into hands, newest first as in the file', () => {
    const { hands, rest } = splitHands(dailyClassic);
    expect(rest).toBe('');
    expect(hands.map((h) => h.slice(0, 25))).toEqual([
      'Poker Hand #TM6532448269:',
      'Poker Hand #TM6532734973:',
      'Poker Hand #TM6533069892:',
      'Poker Hand #TM6533069879:',
      'Poker Hand #TM6532186101:',
      'Poker Hand #TM6532800963:',
    ]);
  });

  it('accepts CRLF line endings and a byte order mark', () => {
    const { hands } = splitHands(`﻿${dailyClassic.replace(/\n/g, '\r\n')}`);
    expect(hands).toHaveLength(6);
    expect(hands[0]).not.toContain('\r');
  });
});

describe('parseHand', () => {
  const daily = parseHistory(dailyClassic).hands;

  it('reads header, table, seats, blinds, antes and the hero cards', () => {
    const hand = byId(daily, 'TM6532448269');
    expect(hand).toMatchObject({
      tournamentId: '318096259',
      tournamentName: 'Daily Classic $1',
      level: 19,
      smallBlind: 1500,
      bigBlind: 3000,
      ante: 350,
      playedAt: '2026-10-13 15:46:28',
      dateKey: '2026-10-13',
      tableSize: 8,
      buttonSeat: 4,
      totalPot: 67974,
    });
    expect(hand.seats[1]).toEqual({ seat: 2, name: '5c98de81', chips: 193255 });
    expect(hand.seats.find((s) => s.name === HERO)).toEqual({ seat: 3, name: HERO, chips: 56377 });
    expect(hand.heroCards).toEqual(cards('Qd Ad'));
    expect(hand.events.filter((e) => e.type === 'ante')).toHaveLength(8);
    expect(hand.events.find((e) => e.type === 'bigBlind')).toEqual({ type: 'bigBlind', player: '5858e747', amount: 3000, allIn: false });
  });

  it('reads raises as "to" totals, all-ins, the uncalled bet, shows and the board', () => {
    const hand = byId(daily, 'TM6532448269');
    expect(actions(hand)[0]).toEqual({
      type: 'action', street: 'preflop', player: '77e1f37f', action: 'raise', amount: 30337, to: 30337, allIn: true,
    });
    expect(actions(hand)[4]).toEqual({
      type: 'action', street: 'preflop', player: HERO, action: 'raise', amount: 56027, to: 56027, allIn: true,
    });
    expect(hand.events).toContainEqual({ type: 'uncalled', player: HERO, amount: 25690 });
    expect(hand.events).toContainEqual({ type: 'show', player: '77e1f37f', cards: cards('Ah Ts') });
    expect(hand.events.filter((e) => e.type === 'board')).toEqual([
      { type: 'board', street: 'flop', cards: cards('Qh 5c 3c') },
      { type: 'board', street: 'turn', cards: cards('6d') },
      { type: 'board', street: 'river', cards: cards('4c') },
    ]);
    expect(hand.board).toEqual(cards('Qh 5c 3c 6d 4c'));
    expect(hand.events).toContainEqual({ type: 'collect', player: HERO, amount: 67974 });
  });

  it('counts what a raise adds on top of the blind already posted', () => {
    const hand = byId(daily, 'TM6533069892');
    expect(actions(hand).slice(-3)).toEqual([
      { type: 'action', street: 'preflop', player: '257eeaf0', action: 'raise', amount: 625, to: 750, allIn: false },
      { type: 'action', street: 'preflop', player: HERO, action: 'raise', amount: 2250, to: 2500, allIn: false },
      { type: 'action', street: 'preflop', player: '257eeaf0', action: 'fold', amount: 0, to: null, allIn: false },
    ]);
  });

  it('reads postflop bets, raises and calls street by street', () => {
    const hand = parseHand(bounty);
    expect(actions(hand).filter((a) => a.street !== 'preflop').map((a) => [a.street, a.player, a.action, a.amount])).toEqual([
      ['flop', HERO, 'bet', 522],
      ['flop', '3c9caf34', 'call', 522],
      ['turn', HERO, 'bet', 1566],
      ['turn', '3c9caf34', 'raise', 3612],
      ['turn', HERO, 'call', 2046],
      ['river', HERO, 'check', 0],
      ['river', '3c9caf34', 'bet', 10560],
      ['river', HERO, 'fold', 0],
    ]);
    expect(hand.tournamentName).toBe('Bounty Hunters $2.50');
  });

  it('handles seat gaps, a big blind that puts the player all-in and shows before the board is complete', () => {
    const hand = byId(parseHistory(steps).hands, 'TM6532799440');
    expect(hand.seats.map((s) => s.seat)).toEqual([1, 5, 6, 7, 8]);
    expect(hand.events.find((e) => e.type === 'bigBlind')).toEqual({ type: 'bigBlind', player: '16564bde', amount: 20, allIn: true });
    const order = hand.events.map((e) => e.type);
    expect(order.indexOf('show')).toBeLessThan(order.lastIndexOf('board'));
    expect(hand.tournamentName).toBe('$0.50 Step to The Weekender');
  });

  it('keeps an all-in call that is smaller than the bet', () => {
    const hand = byId(parseHistory(steps).hands, 'TM6532443900');
    expect(actions(hand).find((a) => a.player === '3c65dbb1' && a.street === 'flop' && a.action === 'call')).toEqual({
      type: 'action', street: 'flop', player: '3c65dbb1', action: 'call', amount: 571, to: null, allIn: true,
    });
    expect(hand.events).toContainEqual({ type: 'uncalled', player: HERO, amount: 56 });
  });

  it('stores the hand text with LF line endings', () => {
    const hand = parseHand(bounty.replace(/\n/g, '\r\n'));
    expect(hand.raw).toBe(bounty.trim());
  });
});

describe('parseHistory', () => {
  it('reads every fixture hand', () => {
    expect(parseHistory(dailyClassic).hands).toHaveLength(6);
    expect(parseHistory(steps).hands.map((h) => h.tournamentId)).toEqual(['318586851', '318586827']);
    expect(parseHistory(bounty).skipped).toEqual([]);
  });

  it('skips unreadable hands with a reason and goes on', () => {
    const noHero = bounty.replace(/Hero/g, 'Villain');
    const broken = bounty.replace('Hero: bets 522', 'Hero: winks 522').replace('TM6532114653', 'TM1');
    const cash = 'Poker Hand #RC123: Hold\'em No Limit ($0.01/$0.02) - 2026/10/13 12:00:00\nTable \'x\' 6-max Seat #1 is the button';
    const result = parseHistory(['Mein Text vorweg', noHero, broken, cash, dailyClassic].join('\n\n'));
    expect(result.hands).toHaveLength(6);
    expect(result.skipped).toEqual([
      { id: null, reason: 'Format nicht erkannt' },
      { id: 'TM6532114653', reason: 'kein Hero' },
      { id: 'TM1', reason: 'Zeile nicht erkannt: Hero: winks 522' },
      { id: 'RC123', reason: 'Format nicht erkannt' },
    ]);
  });

  it('rejects a hand whose pot does not add up', () => {
    const wrongPot = bounty.replace('Total pot 9,312', 'Total pot 9,999');
    expect(parseHistory(wrongPot).skipped).toEqual([{ id: 'TM6532114653', reason: 'Pot passt nicht zu den Einsätzen' }]);
  });

  it('keeps a hand without hole cards; the analysis marks it as not rated', () => {
    const hand = parseHand(bounty.replace('Dealt to Hero [6c 6d]', 'Dealt to Hero '));
    expect(hand.heroCards).toBeNull();
  });
});
```

- [ ] **Step 3: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/review/parse.test.ts`
Expected: FAIL (`Failed to resolve import "./parse" from "src/review/parse.test.ts"`).

- [ ] **Step 4: Implementierung**

`src/review/parse.ts` anlegen:
```ts
import { type Card, parseCard } from '../engine/cards';

export const HERO = 'Hero';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export type BoardStreet = Exclude<Street, 'preflop'>;
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise';
export type SeatInfo = { seat: number; name: string; chips: number };

/** All amounts are chips. `amount` is what the action adds to the pot; `to` is the street total of a raise. */
export type HandEvent =
  | { type: 'ante' | 'smallBlind' | 'bigBlind'; player: string; amount: number; allIn: boolean }
  | { type: 'action'; street: Street; player: string; action: ActionType; amount: number; to: number | null; allIn: boolean }
  | { type: 'board'; street: BoardStreet; cards: Card[] }
  | { type: 'uncalled'; player: string; amount: number }
  | { type: 'show'; player: string; cards: Card[] }
  | { type: 'collect'; player: string; amount: number };

export type PostEvent = Extract<HandEvent, { type: 'ante' | 'smallBlind' | 'bigBlind' }>;
export type ActionEvent = Extract<HandEvent, { type: 'action' }>;

export type ParsedHand = {
  id: string;
  tournamentId: string;
  tournamentName: string;
  level: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  /** As printed by GGPoker, e.g. "2026-10-13 15:46:28"; no time zone conversion. */
  playedAt: string;
  dateKey: string;
  tableSize: number;
  buttonSeat: number;
  seats: SeatInfo[];
  /** Null when the history has no "Dealt to Hero [..]" line. */
  heroCards: [Card, Card] | null;
  events: HandEvent[];
  board: Card[];
  totalPot: number;
  /** The hand text with LF line endings, as stored in the archive. */
  raw: string;
};

export type SkippedHand = { id: string | null; reason: string };
export type ParseResult = { hands: ParsedHand[]; skipped: SkippedHand[] };

/** The first post of this kind by `player` (any player when omitted). */
export function postOf(hand: ParsedHand, type: PostEvent['type'], player?: string): PostEvent | undefined {
  return hand.events.find((e): e is PostEvent => e.type === type && (player === undefined || e.player === player));
}

export class HandParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandParseError';
  }
}

const HEADER =
  /^Poker Hand #(TM\d+): Tournament #(\d+), (.+) Hold'em No Limit - Level(\d+)\(([\d,]+)\/([\d,]+)(?:\(([\d,]+)\))?\) - (\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})$/;
const TABLE = /^Table '(.+)' (\d+)-max Seat #(\d+) is the button$/;
const SEAT = /^Seat (\d+): (\S+) \(([\d,]+) in chips\)$/;
const POST = /^(\S+): posts (the ante|small blind|big blind) ([\d,]+)( and is all-in)?$/;
const DEALT = /^Dealt to (\S+)(?: \[([^\]]*)\])?\s*$/;
const ACTION = /^(\S+): (folds|checks|calls ([\d,]+)|bets ([\d,]+)|raises ([\d,]+) to ([\d,]+))( and is all-in)?$/;
const STREET = /^\*\*\* (FLOP|TURN|RIVER) \*\*\* (?:\[[^\]]*\] )?\[([^\]]+)\]$/;
const UNCALLED = /^Uncalled bet \(([\d,]+)\) returned to (\S+)$/;
const SHOWS = /^(\S+): shows \[([^\]]*)\]/;
const COLLECTED = /^(\S+) collected ([\d,]+) from pot$/;
const TOTAL = /^Total pot ([\d,]+)/;
const HAND_ID = /^Poker Hand #(\w+)/;

const chips = (text: string): number => Number(text.replace(/,/g, ''));
const fail = (reason: string): never => {
  throw new HandParseError(reason);
};

function cards(text: string): Card[] {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  try {
    return parts.map(parseCard);
  } catch {
    return fail('Karten nicht lesbar');
  }
}

export function normalizeText(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

/** Splits a history file or pasted text into hand texts; anything before the first header is returned as `rest`. */
export function splitHands(text: string): { hands: string[]; rest: string } {
  const parts = normalizeText(text).split(/\n(?=Poker Hand #)/);
  const rest = parts[0].startsWith('Poker Hand #') ? '' : parts.shift()!.trim();
  return { hands: parts.map((p) => p.trim()).filter(Boolean), rest };
}

const STREET_NAMES: Record<string, BoardStreet> = { FLOP: 'flop', TURN: 'turn', RIVER: 'river' };

export function parseHand(text: string): ParsedHand {
  const raw = normalizeText(text).trim();
  const lines = raw.split('\n').map((l) => l.trimEnd());
  const header = HEADER.exec(lines[0] ?? '');
  if (!header) fail('Format nicht erkannt');
  const [, id, tournamentId, tournamentName, level, sb, bb, ante, year, month, day, time] = header!;
  const table = TABLE.exec(lines[1] ?? '');
  if (!table) fail('Format nicht erkannt');

  const seats: SeatInfo[] = [];
  let i = 2;
  for (; i < lines.length; i++) {
    const m = SEAT.exec(lines[i]);
    if (!m) break;
    seats.push({ seat: Number(m[1]), name: m[2], chips: chips(m[3]) });
  }
  if (seats.length < 2) fail('Format nicht erkannt');
  if (!seats.some((s) => s.name === HERO)) fail('kein Hero');
  const names = new Set(seats.map((s) => s.name));
  const remaining = new Map(seats.map((s) => [s.name, s.chips]));
  const known = (name: string): string => (names.has(name) ? name : fail(`unbekannter Spieler ${name}`));

  const events: HandEvent[] = [];
  let heroCards: [Card, Card] | null = null;
  let street: Street | null = null;
  let committed = new Map<string, number>();
  let section: 'posts' | 'betting' | 'end' = 'posts';
  const board: Card[] = [];
  let totalPot: number | null = null;

  const pay = (player: string, amount: number): boolean => {
    const left = (remaining.get(player) ?? 0) - amount;
    if (left < 0) fail(`${player} setzt mehr, als er hat`);
    remaining.set(player, left);
    return left === 0;
  };

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') continue;
    if (section === 'end') {
      const total = TOTAL.exec(line);
      if (total) totalPot = chips(total[1]);
      continue;
    }
    if (line === '*** HOLE CARDS ***') {
      section = 'betting';
      street = 'preflop';
      continue;
    }
    if (line === '*** SHOWDOWN ***') continue;
    if (line === '*** SUMMARY ***') {
      section = 'end';
      continue;
    }
    const post = POST.exec(line);
    if (post && section === 'posts') {
      const player = known(post[1]);
      const amount = chips(post[3]);
      const type = post[2] === 'the ante' ? 'ante' : post[2] === 'small blind' ? 'smallBlind' : 'bigBlind';
      const allIn = pay(player, amount) || post[4] !== undefined;
      if (type !== 'ante') committed.set(player, (committed.get(player) ?? 0) + amount);
      events.push({ type, player, amount, allIn });
      continue;
    }
    if (section !== 'betting' || street === null) fail(`Zeile nicht erkannt: ${line.slice(0, 60)}`);
    const dealt = DEALT.exec(line);
    if (dealt) {
      if (dealt[1] === HERO && dealt[2] !== undefined) {
        const hole = cards(dealt[2]);
        if (hole.length !== 2) fail('Hole Cards nicht lesbar');
        heroCards = [hole[0], hole[1]];
      }
      continue;
    }
    const action = ACTION.exec(line);
    if (action) {
      const player = known(action[1]);
      const verb = action[2].split(' ')[0];
      const before = committed.get(player) ?? 0;
      let type: ActionType;
      let amount = 0;
      let to: number | null = null;
      if (verb === 'folds') type = 'fold';
      else if (verb === 'checks') type = 'check';
      else if (verb === 'calls') {
        type = 'call';
        amount = chips(action[3]);
      } else if (verb === 'bets') {
        type = 'bet';
        amount = chips(action[4]);
      } else {
        type = 'raise';
        to = chips(action[6]);
        amount = to - before;
      }
      if (amount < 0) fail(`Einsatz nicht lesbar: ${line.slice(0, 60)}`);
      committed.set(player, before + amount);
      const allIn = (amount > 0 && pay(player, amount)) || action[7] !== undefined;
      events.push({ type: 'action', street: street!, player, action: type, amount, to, allIn });
      continue;
    }
    const next = STREET.exec(line);
    if (next) {
      const name = STREET_NAMES[next[1]];
      const dealtCards = cards(next[2]);
      board.push(...dealtCards);
      events.push({ type: 'board', street: name, cards: dealtCards });
      street = name;
      committed = new Map();
      continue;
    }
    const uncalled = UNCALLED.exec(line);
    if (uncalled) {
      const player = known(uncalled[2]);
      const amount = chips(uncalled[1]);
      remaining.set(player, (remaining.get(player) ?? 0) + amount);
      committed.set(player, (committed.get(player) ?? 0) - amount);
      events.push({ type: 'uncalled', player, amount });
      continue;
    }
    const shows = SHOWS.exec(line);
    if (shows) {
      events.push({ type: 'show', player: known(shows[1]), cards: cards(shows[2]) });
      continue;
    }
    const collected = COLLECTED.exec(line);
    if (collected) {
      events.push({ type: 'collect', player: known(collected[1]), amount: chips(collected[2]) });
      continue;
    }
    fail(`Zeile nicht erkannt: ${line.slice(0, 60)}`);
  }

  if (street === null) fail('Format nicht erkannt');
  if (totalPot === null) fail('Zusammenfassung fehlt');
  let put = 0;
  for (const e of events) {
    if (e.type === 'ante' || e.type === 'smallBlind' || e.type === 'bigBlind' || e.type === 'action') put += e.amount;
    if (e.type === 'uncalled') put -= e.amount;
  }
  if (put !== totalPot) fail('Pot passt nicht zu den Einsätzen');

  return {
    id: id!,
    tournamentId: tournamentId!,
    tournamentName: tournamentName!,
    level: Number(level),
    smallBlind: chips(sb!),
    bigBlind: chips(bb!),
    ante: ante === undefined ? 0 : chips(ante),
    playedAt: `${year}-${month}-${day} ${time}`,
    dateKey: `${year}-${month}-${day}`,
    tableSize: Number(table![2]),
    buttonSeat: Number(table![3]),
    seats,
    heroCards,
    events,
    board,
    totalPot: totalPot!,
    raw,
  };
}

/** Parses every hand of a text; unreadable hands are skipped with a reason, the rest goes on. */
export function parseHistory(text: string): ParseResult {
  const { hands: parts, rest } = splitHands(text);
  const hands: ParsedHand[] = [];
  const skipped: SkippedHand[] = [];
  if (rest) skipped.push({ id: null, reason: 'Format nicht erkannt' });
  for (const part of parts) {
    try {
      hands.push(parseHand(part));
    } catch (error) {
      if (!(error instanceof HandParseError)) throw error;
      skipped.push({ id: HAND_ID.exec(part)?.[1] ?? null, reason: error.message });
    }
  }
  return { hands, skipped };
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test -- src/review/parse.test.ts` → Expected: PASS (13 Tests).

- [ ] **Step 6: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/review/fixtures/daily-classic.txt src/review/fixtures/step-satellites.txt src/review/fixtures/bounty.txt src/review/parse.ts src/review/parse.test.ts
git commit -m "feat(review): Parser für GGPoker-Hand-Historien mit Fixtures aus echten Händen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Turnierart, Positionen und Tischverlauf

**Files:**
- Create: `src/review/tournament-kind.ts`, `src/review/hand-model.ts`, `src/review/test-hands.ts`, `src/review/hand-model.test.ts`

**Interfaces:**
- Consumes: `ParsedHand`, `HandEvent`, `Street`, `HERO`, `postOf` (Task 1); `POSITIONS`, `Position`, `seatOf` aus `src/engine/positions.ts`; `Card`
- Produces:
  - `src/review/tournament-kind.ts`: `type TournamentKind = 'normal' | 'satellit' | 'bounty'`, `TOURNAMENT_KINDS`, `TOURNAMENT_KIND_LABELS: Record<TournamentKind, string>` (`Normal`, `Satellit`, `Bounty`), `detectTournamentKind(name: string): TournamentKind`, `isTournamentKind(v: unknown): v is TournamentKind`
  - `src/review/hand-model.ts`: `positionsOf(hand: ParsedHand): Map<string, Position> | null`; `type PlayerState = { name; seat; position: Position | null; startChips; stack; streetBet; folded; allIn; isHero }`; `type TableState = { street: Street; pot: number; board: Card[]; players: PlayerState[]; lastAggressor: string | null }`; `walkHand(hand: ParsedHand, positions?: Map<string, Position> | null): TableState[]` (Index i = Tisch vor `events[i]`, letzter Eintrag = nach dem letzten Ereignis); `playableChips(hand: ParsedHand, name: string): number`; `maxStreetBet(state: TableState): number`
  - `src/review/test-hands.ts` (nur für Tests): `type TestHandOptions = { id?; tournamentId?; tournamentName?; bigBlind?; ante?; tableSize?; hero: Position; heroCards?: string | null; players?: readonly Position[]; stacksBb?: Partial<Record<Position, number>>; lines: readonly string[]; playedAt? }`, `ggHand(o: TestHandOptions): string`, `foldsBetween(from: Position, to: Position, hero?: Position): string[]`

- [ ] **Step 1: Failing Tests schreiben**

`src/review/test-hands.ts` anlegen (Hilfsmodul für konstruierte Hände, wird nur von Tests importiert):
```ts
import { POSITIONS, type Position, seatOf } from '../engine/positions';

/**
 * Builds a constructed GGPoker hand for tests. Players are named after their position ("UTG", "CO", …),
 * the hero is "Hero". Seats follow the position order (UTG = seat 1 … BB = seat 8), the button is the BTN seat.
 * Stacks are playable chips in BB (the ante comes on top). Only the lines after the hole cards are written by
 * the test; the posts, the pot total and the summary are generated.
 */
export type TestHandOptions = {
  id?: string;
  tournamentId?: string;
  tournamentName?: string;
  bigBlind?: number;
  ante?: number;
  tableSize?: number;
  hero: Position;
  heroCards?: string | null;
  players?: readonly Position[];
  stacksBb?: Partial<Record<Position, number>>;
  lines: readonly string[];
  playedAt?: string;
};

const fmt = (n: number) => n.toLocaleString('en-US');
const chips = (text: string) => Number(text.replace(/,/g, ''));

export function ggHand(o: TestHandOptions): string {
  const bb = o.bigBlind ?? 100;
  const sb = bb / 2;
  const ante = o.ante ?? 10;
  const players = o.players ?? POSITIONS;
  const name = (p: Position) => (p === o.hero ? 'Hero' : p);
  const committed = new Map<string, number>([[name('SB'), sb], [name('BB'), bb]]);
  let total = ante * players.length + sb + bb;
  for (const line of o.lines) {
    if (line.startsWith('*** ')) committed.clear();
    const call = /^(\S+): (?:calls|bets) ([\d,]+)/.exec(line);
    const raise = /^(\S+): raises [\d,]+ to ([\d,]+)/.exec(line);
    const uncalled = /^Uncalled bet \(([\d,]+)\) returned to (\S+)$/.exec(line);
    if (call) {
      total += chips(call[2]);
      committed.set(call[1], (committed.get(call[1]) ?? 0) + chips(call[2]));
    } else if (raise) {
      total += chips(raise[2]) - (committed.get(raise[1]) ?? 0);
      committed.set(raise[1], chips(raise[2]));
    } else if (uncalled) total -= chips(uncalled[1]);
  }
  const [date, time] = (o.playedAt ?? '2026/10/13 12:00:00').split(' ');
  return [
    `Poker Hand #${o.id ?? 'TM1'}: Tournament #${o.tournamentId ?? '1'}, ${o.tournamentName ?? 'Daily Classic $1'} Hold'em No Limit - Level1(${fmt(sb)}/${fmt(bb)}(${fmt(ante)})) - ${date} ${time}`,
    `Table '1' ${o.tableSize ?? 8}-max Seat #${seatOf('BTN') + 1} is the button`,
    ...players.map((p) => `Seat ${seatOf(p) + 1}: ${name(p)} (${fmt((o.stacksBb?.[p] ?? 100) * bb + ante)} in chips)`),
    ...players.map((p) => `${name(p)}: posts the ante ${fmt(ante)}`),
    `${name('SB')}: posts small blind ${fmt(sb)}`,
    `${name('BB')}: posts big blind ${fmt(bb)}`,
    '*** HOLE CARDS ***',
    ...players.map((p) => (p === o.hero && o.heroCards !== null ? `Dealt to Hero [${o.heroCards ?? 'Ah Kd'}]` : `Dealt to ${name(p)} `)),
    ...o.lines,
    '*** SHOWDOWN ***',
    '*** SUMMARY ***',
    `Total pot ${fmt(total)} | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0`,
  ].join('\n');
}

/** "UTG: folds" for each position from `from` up to (not including) `to`. */
export function foldsBetween(from: Position, to: Position, hero?: Position): string[] {
  return POSITIONS.slice(seatOf(from), seatOf(to)).map((p) => `${p === hero ? 'Hero' : p}: folds`);
}
```

`src/review/hand-model.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import bounty from './fixtures/bounty.txt?raw';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import steps from './fixtures/step-satellites.txt?raw';
import { maxStreetBet, playableChips, positionsOf, walkHand } from './hand-model';
import { HERO, parseHand, parseHistory } from './parse';
import { ggHand } from './test-hands';
import { TOURNAMENT_KIND_LABELS, detectTournamentKind, isTournamentKind } from './tournament-kind';

const daily = parseHistory(dailyClassic).hands;
const hand = (id: string) => [...daily, ...parseHistory(steps).hands].find((h) => h.id === id)!;

describe('detectTournamentKind', () => {
  it('finds satellites, bounty tournaments and normal ones by name', () => {
    expect(detectTournamentKind('$0.50 Step to The Weekender')).toBe('satellit');
    expect(detectTournamentKind('T$ Builder $1')).toBe('satellit');
    expect(detectTournamentKind('Sunday Million Satellite')).toBe('satellit');
    expect(detectTournamentKind('WSOP Ticket Race')).toBe('satellit');
    expect(detectTournamentKind('Seat Hunter')).toBe('satellit');
    expect(detectTournamentKind('Bounty Hunters $2.50')).toBe('bounty');
    expect(detectTournamentKind('$5 PKO Rush')).toBe('bounty');
    expect(detectTournamentKind('Mystery Bounty')).toBe('bounty');
    expect(detectTournamentKind('Knockout Special')).toBe('bounty');
    expect(detectTournamentKind('Daily Classic $1')).toBe('normal');
    expect(detectTournamentKind('Stepladder Deepstack')).toBe('normal');
  });

  it('has German labels and a type guard', () => {
    expect(TOURNAMENT_KIND_LABELS).toEqual({ normal: 'Normal', satellit: 'Satellit', bounty: 'Bounty' });
    expect(isTournamentKind('bounty')).toBe(true);
    expect(isTournamentKind('Bounty')).toBe(false);
  });
});

describe('positionsOf', () => {
  it('maps a full 8-max table from the blinds and the button', () => {
    const positions = positionsOf(hand('TM6532734973'))!;
    expect(Object.fromEntries(positions)).toEqual({
      '782fbbaf': 'UTG', f982e6ef: 'UTG1', '9b4b9f25': 'LJ', Hero: 'HJ', '52f864b': 'CO', '6cb36585': 'BTN', af26c20d: 'SB', b0249070: 'BB',
    });
  });

  it('drops the early positions at a short-handed table', () => {
    const seven = positionsOf(hand('TM6532800963'))!;
    expect(seven.get(HERO)).toBe('UTG1');
    expect(seven.get('cb96225f')).toBe('BTN');
    expect([...seven.values()]).not.toContain('UTG');
    const five = positionsOf(hand('TM6532799440'))!;
    expect(Object.fromEntries(five)).toEqual({ '3d93b9d2': 'HJ', fbdde14e: 'CO', '3e9ba0b6': 'BTN', Hero: 'SB', '16564bde': 'BB' });
  });

  it('gives up without a big blind', () => {
    const h = parseHand(ggHand({ hero: 'CO', lines: ['UTG: folds'] }));
    expect(positionsOf({ ...h, events: h.events.filter((e) => e.type !== 'bigBlind') })).toBeNull();
  });
});

describe('walkHand', () => {
  it('tracks pot, street bets, stacks and folds before every event', () => {
    const h = hand('TM6532734973');
    const states = walkHand(h);
    expect(states).toHaveLength(h.events.length + 1);
    const heroShove = h.events.findIndex((e) => e.type === 'action' && e.player === HERO);
    const before = states[heroShove];
    expect(before.street).toBe('preflop');
    expect(before.pot).toBe(8 * 150 + 600 + 1200);
    expect(maxStreetBet(before)).toBe(1200);
    expect(before.players.find((p) => p.isHero)).toMatchObject({ stack: 19680, streetBet: 0, folded: false, position: 'HJ' });
    expect(before.players.find((p) => p.name === '782fbbaf')?.folded).toBe(true);
    const end = states[states.length - 1];
    expect(end.pot).toBe(h.totalPot);
    expect(end.board).toEqual(h.board);
    expect(end.players.find((p) => p.isHero)?.allIn).toBe(true);
  });

  it('resets street bets on each new street and returns uncalled bets', () => {
    const h = parseHand(bounty);
    const states = walkHand(h);
    const flop = h.events.findIndex((e) => e.type === 'board');
    expect(states[flop + 1].players.every((p) => p.streetBet === 0)).toBe(true);
    expect(states[flop + 1].pot).toBe(8 * 18 + 60 + 120 + 360 + 360);
    expect(states[states.length - 1].pot).toBe(9312);
  });

  it('counts the playable chips without the ante', () => {
    expect(playableChips(hand('TM6532734973'), HERO)).toBe(19680);
    expect(playableChips(hand('TM6532734973'), 'nobody')).toBe(0);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/review/hand-model.test.ts`
Expected: FAIL (`Failed to resolve import "./hand-model"`).

- [ ] **Step 3: Implementierung**

`src/review/tournament-kind.ts` anlegen:
```ts
export type TournamentKind = 'normal' | 'satellit' | 'bounty';
export const TOURNAMENT_KINDS: readonly TournamentKind[] = ['normal', 'satellit', 'bounty'];

export const TOURNAMENT_KIND_LABELS: Record<TournamentKind, string> = {
  normal: 'Normal',
  satellit: 'Satellit',
  bounty: 'Bounty',
};

const SATELLITE = /\b(step|satellite|builder|ticket|seat)s?\b/i;
const BOUNTY = /\b(bounty|pko|mystery|knockout)\b/i;

/** Satellite words win over bounty words: a satellite pays seats, not chips. */
export function detectTournamentKind(name: string): TournamentKind {
  if (SATELLITE.test(name)) return 'satellit';
  if (BOUNTY.test(name)) return 'bounty';
  return 'normal';
}

export const isTournamentKind = (v: unknown): v is TournamentKind =>
  typeof v === 'string' && (TOURNAMENT_KINDS as readonly string[]).includes(v);
```

`src/review/hand-model.ts` anlegen:
```ts
import type { Card } from '../engine/cards';
import { POSITIONS, type Position } from '../engine/positions';
import { HERO, type HandEvent, type ParsedHand, type Street, postOf } from './parse';

const NON_BLIND: readonly Position[] = POSITIONS.slice(0, 6);

/**
 * Maps players to the 8-max positions of the trainer. The blinds come from the posts; the other players are
 * counted back from the button, so a short-handed table keeps BTN, CO, HJ … and drops UTG first.
 * Null when the blinds are missing or more than six players sit outside the blinds.
 */
export function positionsOf(hand: ParsedHand): Map<string, Position> | null {
  const sb = postOf(hand, 'smallBlind')?.player;
  const bb = postOf(hand, 'bigBlind')?.player;
  if (!bb) return null;
  const order = [...hand.seats].sort((a, b) => a.seat - b.seat).map((s) => s.name);
  const start = order.indexOf(bb) + 1;
  const clockwise = [...order.slice(start), ...order.slice(0, start)].filter((n) => n !== bb && n !== sb);
  if (clockwise.length > NON_BLIND.length) return null;
  const out = new Map<string, Position>();
  const labels = NON_BLIND.slice(NON_BLIND.length - clockwise.length);
  clockwise.forEach((name, i) => out.set(name, labels[i]));
  if (sb) out.set(sb, 'SB');
  out.set(bb, 'BB');
  return out;
}

export type PlayerState = {
  name: string;
  seat: number;
  position: Position | null;
  /** Chips at the start of the hand, before the ante. */
  startChips: number;
  /** Chips behind right now. */
  stack: number;
  /** Chips put in on the current street (blinds count on the preflop street). */
  streetBet: number;
  folded: boolean;
  allIn: boolean;
  isHero: boolean;
};

export type TableState = {
  street: Street;
  /** Everything put in so far, current street bets included. */
  pot: number;
  board: Card[];
  players: PlayerState[];
  lastAggressor: string | null;
};

function initialState(hand: ParsedHand, positions: Map<string, Position> | null): TableState {
  return {
    street: 'preflop',
    pot: 0,
    board: [],
    lastAggressor: null,
    players: hand.seats.map((s) => ({
      name: s.name,
      seat: s.seat,
      position: positions?.get(s.name) ?? null,
      startChips: s.chips,
      stack: s.chips,
      streetBet: 0,
      folded: false,
      allIn: false,
      isHero: s.name === HERO,
    })),
  };
}

function applyEvent(state: TableState, event: HandEvent): TableState {
  const players = state.players.map((p) => ({ ...p }));
  const player = (name: string) => players.find((p) => p.name === name)!;
  switch (event.type) {
    case 'ante':
    case 'smallBlind':
    case 'bigBlind':
    case 'action': {
      const p = player(event.player);
      p.stack -= event.amount;
      if (event.type !== 'ante') p.streetBet += event.amount;
      if (event.type === 'action' && event.action === 'fold') p.folded = true;
      if (event.allIn || p.stack === 0) p.allIn = true;
      const aggressive = event.type === 'action' && (event.action === 'bet' || event.action === 'raise');
      return { ...state, players, pot: state.pot + event.amount, lastAggressor: aggressive ? event.player : state.lastAggressor };
    }
    case 'uncalled': {
      const p = player(event.player);
      p.stack += event.amount;
      p.streetBet -= event.amount;
      if (p.stack > 0) p.allIn = false;
      return { ...state, players, pot: state.pot - event.amount };
    }
    case 'board':
      for (const p of players) p.streetBet = 0;
      return { ...state, players, street: event.street, board: [...state.board, ...event.cards], lastAggressor: null };
    case 'show':
    case 'collect':
      return state;
  }
}

/** `states[i]` is the table right before `hand.events[i]`; the last entry is the table after the final event. */
export function walkHand(hand: ParsedHand, positions: Map<string, Position> | null = positionsOf(hand)): TableState[] {
  const states = [initialState(hand, positions)];
  for (const event of hand.events) states.push(applyEvent(states[states.length - 1], event));
  return states;
}

/** Chips a player can play with in this hand: the start stack minus the ante he posted. */
export function playableChips(hand: ParsedHand, name: string): number {
  const seat = hand.seats.find((s) => s.name === name);
  if (!seat) return 0;
  return seat.chips - (postOf(hand, 'ante', name)?.amount ?? 0);
}

export const maxStreetBet = (state: TableState): number => Math.max(0, ...state.players.map((p) => p.streetBet));
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/review/hand-model.test.ts` → Expected: PASS (8 Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/review/tournament-kind.ts src/review/hand-model.ts src/review/test-hands.ts src/review/hand-model.test.ts
git commit -m "feat(review): Turnierart, Positionen am kurzen Tisch und Tischverlauf je Ereignis" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Preflop-Bewertung und Hand-Analyse

**Files:**
- Create: `src/review/preflop.ts`, `src/review/analysis.ts`, `src/review/preflop.test.ts`

**Interfaces:**
- Consumes: `ParsedHand`, `ActionEvent`, `HERO` (Task 1); `positionsOf`, `walkHand`, `playableChips`, `maxStreetBet`, `TableState` (Task 2); `ggHand`, `foldsBetween` (Task 2, Tests); `handClassOf`; `gradePreflop`, `PreflopGrade`; `chartKeyFor`, `PreflopAction`, `PreflopKind`, `PreflopSpot`, `StackDepth`; `grade`, `Spot`, `Action`, `Grade`; `MAX_STACK`, `MIN_STACK`, `PushFoldData`; `seatOf`, `Position`; `makeFixture`, `getPushFoldData` (Tests)
- Produces:
  - `src/review/preflop.ts`: `SHOVE_SHARE = 0.8`, `APPROXIMATION_SHARE = 0.25`, `PUSHFOLD_MAX_BB = 20`, `CHART_40_MAX_BB = 55`; `type UnratedReason = 'tableSize' | 'positions' | 'noHoleCards' | 'limp' | 'multiway' | 'squeeze' | 'multiRaise' | 'deepPot' | 'shortNotPushFold' | 'deepAllIn' | 'otherSpot' | 'postflopPending'`; `UNRATED_TEXT: Record<UnratedReason, string>`; `type PushFoldRating = { model: 'pushfold'; spot: Spot; chosen: Action; grade: Grade; effectiveBb: number }`; `type ChartRating = { model: 'chart'; spot: PreflopSpot; chosen: PreflopAction; grade: PreflopGrade; effectiveBb: number; approximation: boolean }`; `type UnratedRating = { model: 'unrated'; reason: UnratedReason }`; `type DecisionRating = PushFoldRating | ChartRating | UnratedRating` (Plan 8 ergänzt `PostflopRating`); `type ModelChoice = { model: 'pushfold'; stack: number } | { model: 'chart'; depth: StackDepth; approximation: boolean }`; `modelFor(effectiveBb: number): ModelChoice`; `ratePreflopDecision(hand: ParsedHand, index: number, state: TableState, positions: ReadonlyMap<string, Position> | null, data: PushFoldData): DecisionRating`
  - `src/review/analysis.ts`: `ANALYSIS_VERSION = 1`; `type HeroDecision = { eventIndex: number; street: Street; action: ActionType; allIn: boolean; pot: number; toCall: number; stack: number; amount: number; to: number | null; rating: DecisionRating }`; `type HandAnalysis = { version: number; decisions: HeroDecision[] }`; `analyzeHand(hand: ParsedHand, data: PushFoldData): HandAnalysis`

- [ ] **Step 1: Failing Tests schreiben**

`src/review/preflop.test.ts` anlegen (konstruierte Hände je Modell und je Grund, dazu alle echten Fixture-Hände; Push/Fold mit der Test-Fixture `makeFixture((h) => (84 - h) / 10)`, bei den echten Händen mit den echten Daten):
```ts
import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { parseHand as parseHandName } from '../engine/cards';
import { gradePreflop } from '../engine/preflop/grading';
import { grade } from '../engine/pushfold';
import { makeFixture } from '../engine/test-fixtures';
import { ANALYSIS_VERSION, type HeroDecision, analyzeHand } from './analysis';
import bounty from './fixtures/bounty.txt?raw';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import steps from './fixtures/step-satellites.txt?raw';
import { HERO, parseHand, parseHistory } from './parse';
import { type DecisionRating, UNRATED_TEXT, modelFor } from './preflop';
import { type TestHandOptions, foldsBetween, ggHand } from './test-hands';

// Hands with an index below 84 shove/call profitably, the rest fold (same fixture as the UI tests).
const data = makeFixture((h) => (84 - h) / 10);
const AKo = parseHandName('AKo');
const rate = (o: TestHandOptions, d = data): DecisionRating[] =>
  analyzeHand(parseHand(ggHand(o)), d).decisions.map((x) => x.rating);
const first = (o: TestHandOptions) => rate(o)[0];

describe('modelFor', () => {
  it('chooses the model by the rounded effective stack and marks approximations', () => {
    expect(modelFor(0.4)).toEqual({ model: 'pushfold', stack: 1 });
    expect(modelFor(20.4)).toEqual({ model: 'pushfold', stack: 20 });
    expect(modelFor(20.6)).toEqual({ model: 'chart', depth: 40, approximation: true });
    expect(modelFor(30)).toEqual({ model: 'chart', depth: 40, approximation: false });
    expect(modelFor(50)).toEqual({ model: 'chart', depth: 40, approximation: false });
    expect(modelFor(51)).toEqual({ model: 'chart', depth: 40, approximation: true });
    expect(modelFor(55.4)).toEqual({ model: 'chart', depth: 40, approximation: true });
    expect(modelFor(55.6)).toEqual({ model: 'chart', depth: 100, approximation: true });
    expect(modelFor(75)).toEqual({ model: 'chart', depth: 100, approximation: false });
    expect(modelFor(126)).toEqual({ model: 'chart', depth: 100, approximation: true });
  });
});

describe('push/fold spots (up to 20 BB)', () => {
  it('rates an open shove when everybody folded to the hero', () => {
    const r = first({ hero: 'CO', heroCards: 'Ah Kd', stacksBb: { CO: 12 }, lines: [...foldsBetween('UTG', 'CO'), 'Hero: raises 1,100 to 1,200 and is all-in', 'BTN: folds', 'SB: folds', 'BB: folds', 'Uncalled bet (1,100) returned to Hero'] });
    const spot = { kind: 'open', position: 'CO', stack: 12, hand: AKo } as const;
    expect(r).toEqual({ model: 'pushfold', spot, chosen: 'shove', grade: grade(data, spot, 'shove'), effectiveBb: 12 });
  });

  it('uses the biggest stack behind the hero for the effective stack', () => {
    const r = first({ hero: 'CO', stacksBb: { CO: 30, BTN: 8, SB: 14, BB: 5 }, lines: [...foldsBetween('UTG', 'CO'), 'Hero: folds', 'BTN: folds', 'SB: folds'] });
    expect(r).toMatchObject({ model: 'pushfold', spot: { kind: 'open', position: 'CO', stack: 14 }, chosen: 'fold', effectiveBb: 14 });
  });

  it('counts a raise of at least 80 % of the stack as a shove', () => {
    const r = first({ hero: 'BTN', stacksBb: { BTN: 15 }, lines: [...foldsBetween('UTG', 'BTN'), 'Hero: raises 1,150 to 1,250', 'SB: folds', 'BB: folds', 'Uncalled bet (1,150) returned to Hero'] });
    expect(r).toMatchObject({ model: 'pushfold', chosen: 'shove' });
  });

  it('rates call or fold against a single all-in', () => {
    const lines = ['UTG: raises 900 to 1,000 and is all-in', ...foldsBetween('UTG1', 'BB'), 'Hero: calls 900 and is all-in'];
    const r = first({ hero: 'BB', heroCards: 'Ah Kd', stacksBb: { UTG: 10, BB: 25 }, lines });
    const spot = { kind: 'call', shover: 'UTG', position: 'BB', stack: 10, hand: AKo } as const;
    expect(r).toEqual({ model: 'pushfold', spot, chosen: 'call', grade: grade(data, spot, 'call'), effectiveBb: 10 });
  });

  it('counts a re-shove over an all-in as a call', () => {
    const lines = ['UTG: raises 900 to 1,000 and is all-in', ...foldsBetween('UTG1', 'CO'), 'Hero: raises 1,500 to 2,500 and is all-in', 'BTN: folds', 'SB: folds', 'BB: folds', 'Uncalled bet (1,500) returned to Hero'];
    expect(first({ hero: 'CO', stacksBb: { UTG: 10, CO: 25 }, lines })).toMatchObject({ model: 'pushfold', chosen: 'call' });
  });
});

describe('chart spots (more than 20 BB)', () => {
  it('rates an open-raise with the 100 BB chart', () => {
    const r = first({ hero: 'BTN', heroCards: 'Ah Kd', lines: [...foldsBetween('UTG', 'BTN'), 'Hero: raises 120 to 220', 'SB: folds', 'BB: folds', 'Uncalled bet (120) returned to Hero'] });
    const spot = { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: AKo } as const;
    expect(r).toEqual({ model: 'chart', spot, chosen: 'raise', grade: gradePreflop(spot, 'raise'), effectiveBb: 100, approximation: false });
  });

  it('rates a 3-bet against an open-raise with the 40 BB chart, any size', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'Hero: raises 3,780 to 4,000 and is all-in', 'SB: folds', 'BB: folds', 'CO: folds', 'Uncalled bet (3,780) returned to Hero'];
    const r = first({ hero: 'BTN', heroCards: '7s 2d', stacksBb: { BTN: 40 }, lines });
    expect(r).toMatchObject({ model: 'chart', spot: { kind: 'vsOpen', stack: 40, hero: 'BTN', villain: 'CO' }, chosen: 'threeBet', grade: { verdict: 'wrong', best: 'fold' } });
  });

  it('rates the answer to a 3-bet after the hero opened', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'Hero: raises 120 to 220', 'BTN: raises 440 to 660', 'SB: folds', 'BB: folds', 'Hero: calls 440'];
    const r = rate({ hero: 'CO', heroCards: 'Ah Kd', lines: [...lines, '*** FLOP *** [2c 7d 9h]', 'Hero: checks', 'BTN: checks'] });
    expect(r[0]).toMatchObject({ model: 'chart', spot: { kind: 'rfi', hero: 'CO' }, chosen: 'raise' });
    expect(r[1]).toMatchObject({ model: 'chart', spot: { kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN' }, chosen: 'call' });
    expect(r[2]).toEqual({ model: 'unrated', reason: 'postflopPending' });
  });

  it('marks charts as an approximation when the stack is more than 25 % away', () => {
    const r = first({ hero: 'BTN', stacksBb: { BTN: 28 }, lines: [...foldsBetween('UTG', 'BTN'), 'Hero: folds', 'SB: folds'] });
    expect(r).toMatchObject({ model: 'chart', spot: { stack: 40 }, effectiveBb: 28, approximation: true });
  });
});

describe('not rated, with a reason', () => {
  const unrated = (o: TestHandOptions) => first(o);
  it('limp and limp pots', () => {
    expect(unrated({ hero: 'CO', lines: ['UTG: calls 100', ...foldsBetween('UTG1', 'CO'), 'Hero: raises 400 to 500'] })).toEqual({ model: 'unrated', reason: 'limp' });
    expect(unrated({ hero: 'CO', lines: [...foldsBetween('UTG', 'CO'), 'Hero: calls 100'] })).toEqual({ model: 'unrated', reason: 'limp' });
  });
  it('callers before the hero and squeezes', () => {
    const base = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'BTN: calls 220'];
    expect(unrated({ hero: 'SB', lines: [...base, 'Hero: calls 170'] })).toEqual({ model: 'unrated', reason: 'multiway' });
    expect(unrated({ hero: 'SB', lines: [...base, 'Hero: raises 900 to 950'] })).toEqual({ model: 'unrated', reason: 'squeeze' });
  });
  it('several raises before the hero and 4-bet pots', () => {
    expect(unrated({ hero: 'BTN', lines: ['UTG: raises 120 to 220', ...foldsBetween('UTG1', 'CO'), 'CO: raises 440 to 660', 'Hero: folds'] })).toEqual({ model: 'unrated', reason: 'multiRaise' });
    const fourBet = [...foldsBetween('UTG', 'CO'), 'Hero: raises 120 to 220', 'BTN: raises 440 to 660', 'SB: folds', 'BB: folds', 'Hero: raises 900 to 1,560', 'BTN: raises 2,000 to 3,560', 'Hero: folds', 'Uncalled bet (2,000) returned to BTN'];
    expect(rate({ hero: 'CO', lines: fourBet })[2]).toEqual({ model: 'unrated', reason: 'deepPot' });
  });
  it('raise or call with at most 20 BB that is no push/fold spot', () => {
    const open = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220'];
    expect(unrated({ hero: 'BTN', stacksBb: { BTN: 15 }, lines: [...open, 'Hero: calls 220'] })).toEqual({ model: 'unrated', reason: 'shortNotPushFold' });
    expect(unrated({ hero: 'BTN', stacksBb: { BTN: 15 }, lines: [...foldsBetween('UTG', 'BTN'), 'Hero: raises 120 to 220'] })).toEqual({ model: 'unrated', reason: 'shortNotPushFold' });
  });
  it('an all-in with more than 20 BB', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'CO: raises 2,900 to 3,000 and is all-in', 'Hero: folds'];
    expect(unrated({ hero: 'BTN', stacksBb: { CO: 30, BTN: 40 }, lines })).toEqual({ model: 'unrated', reason: 'deepAllIn' });
  });
  it('other table sizes and missing hole cards', () => {
    const lines = [...foldsBetween('UTG', 'BTN'), 'Hero: folds', 'SB: folds'];
    expect(unrated({ hero: 'BTN', tableSize: 9, lines })).toEqual({ model: 'unrated', reason: 'tableSize' });
    expect(unrated({ hero: 'BTN', heroCards: null, lines })).toEqual({ model: 'unrated', reason: 'noHoleCards' });
  });
  it('every reason has a German text', () => {
    expect(UNRATED_TEXT.postflopPending).toBe('Postflop-Bewertung folgt');
    expect(UNRATED_TEXT.shortNotPushFold).toBe('Raise oder Call mit höchstens 20 BB (kein Push/Fold-Spot)');
    expect(Object.values(UNRATED_TEXT).every((t) => t.length > 0)).toBe(true);
  });
});

describe('analyzeHand with the real hands', () => {
  const real = getPushFoldData();
  const hands = [...parseHistory(dailyClassic).hands, ...parseHistory(steps).hands, parseHand(bounty)];
  const decisions = (id: string): HeroDecision[] => analyzeHand(hands.find((h) => h.id === id)!, real).decisions;

  it('stores the analysis version', () => {
    expect(analyzeHand(hands[0], real).version).toBe(ANALYSIS_VERSION);
  });

  it('preflop fold: UTG+1 at a 7-handed table with 74 BB uses the 100 BB chart as an approximation', () => {
    const [d] = decisions('TM6532800963');
    expect(d).toMatchObject({ street: 'preflop', action: 'fold', pot: 285, toCall: 120, stack: 8929 });
    expect(d.rating).toMatchObject({ model: 'chart', spot: { kind: 'rfi', stack: 100, hero: 'UTG1' }, chosen: 'fold', approximation: true, grade: { verdict: 'correct' } });
  });

  it('open-raise: K6o on the button with 92 BB is outside the chart', () => {
    expect(decisions('TM6532186101')[0].rating).toMatchObject({ model: 'chart', spot: { kind: 'rfi', stack: 100, hero: 'BTN' }, chosen: 'raise', approximation: false, grade: { verdict: 'wrong', best: 'fold' } });
  });

  it('3-bet pot: 73s 3-bet from the BB against the SB with 45 BB effective', () => {
    expect(decisions('TM6533069892')[0].rating).toMatchObject({ model: 'chart', spot: { kind: 'vsOpen', stack: 40, hero: 'BB', villain: 'SB' }, chosen: 'threeBet', approximation: false, grade: { verdict: 'wrong' } });
  });

  it('push/fold: A4o open shove from the HJ with 16 BB', () => {
    const [d] = decisions('TM6532734973');
    const spot = { kind: 'open', position: 'HJ', stack: 16, hand: parseHandName('A4o') } as const;
    expect(d.rating).toEqual({ model: 'pushfold', spot, chosen: 'shove', grade: grade(real, spot, 'shove'), effectiveBb: 16.4 });
  });

  it('all-in preflop with showdown: AQs re-shove over a 10 BB UTG shove counts as a call', () => {
    const [d] = decisions('TM6532448269');
    expect(d.rating).toMatchObject({ model: 'pushfold', spot: { kind: 'call', shover: 'UTG', position: 'CO', stack: 10, hand: parseHandName('AQs') }, chosen: 'call' });
    expect(decisions('TM6532448269')).toHaveLength(1);
  });

  it('limp pot: both decisions are not rated', () => {
    expect(decisions('TM6533069879').map((d) => d.rating)).toEqual([
      { model: 'unrated', reason: 'limp' },
      { model: 'unrated', reason: 'limp' },
    ]);
  });

  it('postflop decisions are listed with "Postflop-Bewertung folgt"', () => {
    const list = decisions('TM6532114653');
    expect(list.map((d) => [d.street, d.action])).toEqual([
      ['preflop', 'raise'], ['flop', 'bet'], ['turn', 'bet'], ['turn', 'call'], ['river', 'check'], ['river', 'fold'],
    ]);
    expect(list.slice(1).every((d) => d.rating.model === 'unrated' && d.rating.reason === 'postflopPending')).toBe(true);
    expect(list[3]).toMatchObject({ pot: 7266, toCall: 2046, stack: 6946 });
  });

  it('satellite hand: 3-bet from the BB answered with a call is rated with the 40 BB chart', () => {
    const list = decisions('TM6532443900');
    expect(list[0].rating).toMatchObject({ model: 'chart', spot: { kind: 'rfi', stack: 40, hero: 'SB' }, approximation: true });
    expect(list[1].rating).toMatchObject({ model: 'chart', spot: { kind: 'vs3bet', stack: 40, hero: 'SB', villain: 'BB' }, chosen: 'call' });
    expect(list[3]).toMatchObject({ street: 'flop', action: 'raise', allIn: true });
  });

  it('rates the hero, never another player', () => {
    for (const h of hands) {
      for (const d of analyzeHand(h, real).decisions) {
        const e = h.events[d.eventIndex];
        expect(e.type === 'action' && e.player === HERO).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/review/preflop.test.ts`
Expected: FAIL (`Failed to resolve import "./analysis"`).

- [ ] **Step 3: Implementierung**

`src/review/preflop.ts` anlegen:
```ts
import { handClassOf } from '../engine/cards';
import { type PreflopGrade, gradePreflop } from '../engine/preflop/grading';
import { type PreflopAction, type PreflopKind, type PreflopSpot, type StackDepth, chartKeyFor } from '../engine/preflop/spots';
import { type Action, type Grade, type Spot, grade } from '../engine/pushfold';
import { MAX_STACK, MIN_STACK, type PushFoldData } from '../engine/pushfold-data';
import { type Position, seatOf } from '../engine/positions';
import { type TableState, playableChips } from './hand-model';
import { type ActionEvent, HERO, type ParsedHand } from './parse';

/** A raise to at least this share of the stack counts as all-in (spec 6). */
export const SHOVE_SHARE = 0.8;
/** Further than this from 40 or 100 BB, the chart is marked as an approximation. */
export const APPROXIMATION_SHARE = 0.25;
export const PUSHFOLD_MAX_BB = MAX_STACK;
export const CHART_40_MAX_BB = 55;

export type UnratedReason =
  | 'tableSize'
  | 'positions'
  | 'noHoleCards'
  | 'limp'
  | 'multiway'
  | 'squeeze'
  | 'multiRaise'
  | 'deepPot'
  | 'shortNotPushFold'
  | 'deepAllIn'
  | 'otherSpot'
  | 'postflopPending';

export const UNRATED_TEXT: Record<UnratedReason, string> = {
  tableSize: 'Tischgröße',
  positions: 'Positionen nicht erkannt',
  noHoleCards: 'Keine Hole Cards',
  limp: 'Limp oder Limp-Pot',
  multiway: 'Mehrere Caller vor dir',
  squeeze: 'Squeeze',
  multiRaise: 'Mehrere Raises vor dir',
  deepPot: '4-Bet-Pot und tiefer',
  shortNotPushFold: 'Raise oder Call mit höchstens 20 BB (kein Push/Fold-Spot)',
  deepAllIn: 'All-in mit mehr als 20 BB (kein Chart-Spot)',
  otherSpot: 'Spot vom Modell nicht abgedeckt',
  postflopPending: 'Postflop-Bewertung folgt',
};

export type PushFoldRating = { model: 'pushfold'; spot: Spot; chosen: Action; grade: Grade; effectiveBb: number };
export type ChartRating = {
  model: 'chart';
  spot: PreflopSpot;
  chosen: PreflopAction;
  grade: PreflopGrade;
  effectiveBb: number;
  /** True when the effective stack is more than 25 % away from the chart depth. */
  approximation: boolean;
};
export type UnratedRating = { model: 'unrated'; reason: UnratedReason };
/** Plan 8 adds a postflop rating to this union; Plan 7 never creates one. */
export type DecisionRating = PushFoldRating | ChartRating | UnratedRating;

export type ModelChoice = { model: 'pushfold'; stack: number } | { model: 'chart'; depth: StackDepth; approximation: boolean };

export function modelFor(effectiveBb: number): ModelChoice {
  const rounded = Math.round(effectiveBb);
  if (rounded <= PUSHFOLD_MAX_BB) return { model: 'pushfold', stack: Math.max(MIN_STACK, rounded) };
  const depth: StackDepth = rounded <= CHART_40_MAX_BB ? 40 : 100;
  return { model: 'chart', depth, approximation: Math.abs(effectiveBb - depth) / depth > APPROXIMATION_SHARE };
}

const AGGRESSIVE: Record<PreflopKind, PreflopAction> = { rfi: 'raise', vsOpen: 'threeBet', vs3bet: 'fourBet' };
const unrated = (reason: UnratedReason): UnratedRating => ({ model: 'unrated', reason });

/**
 * Rates one preflop decision of the hero. `index` is the event index of the hero's action,
 * `state` the table right before it.
 */
export function ratePreflopDecision(
  hand: ParsedHand,
  index: number,
  state: TableState,
  positions: ReadonlyMap<string, Position> | null,
  data: PushFoldData,
): DecisionRating {
  if (hand.tableSize !== 8) return unrated('tableSize');
  if (!positions || !positions.has(HERO)) return unrated('positions');
  if (!hand.heroCards) return unrated('noHoleCards');
  const event = hand.events[index] as ActionEvent;
  const prior = hand.events.slice(0, index).filter((e): e is ActionEvent => e.type === 'action' && e.street === 'preflop');
  const heroPos = positions.get(HERO)!;
  const hand169 = handClassOf(hand.heroCards[0], hand.heroCards[1]);
  const stackOf = (name: string) => playableChips(hand, name);
  const bb = hand.bigBlind;
  const heroStack = stackOf(HERO);
  const pos = (name: string) => positions.get(name)!;
  const isShove = (act: ActionEvent, committedAfter: number) => act.allIn || committedAfter >= SHOVE_SHARE * stackOf(act.player);
  const heroCommittedAfter = state.players.find((p) => p.isHero)!.streetBet + event.amount;
  const heroShoves = event.action !== 'fold' && isShove(event, heroCommittedAfter);

  const raises = prior.filter((e) => e.action === 'raise' || e.action === 'bet');
  const firstRaise = prior.findIndex((e) => e.action === 'raise' || e.action === 'bet');
  const limped = prior.some((e, i) => e.action === 'call' && (firstRaise < 0 || i < firstRaise));
  const heroBefore = prior.filter((e) => e.player === HERO);

  const chart = (kind: PreflopKind, villain: Position | null, effectiveBb: number, depth: StackDepth, approximation: boolean): DecisionRating => {
    if (event.action === 'check') return unrated('otherSpot');
    const chosen: PreflopAction =
      event.action === 'fold' ? 'fold' : event.action === 'call' ? 'call' : AGGRESSIVE[kind];
    if (kind === 'rfi' && chosen === 'call') return unrated('limp');
    const spot: PreflopSpot = { kind, stack: depth, hero: heroPos, villain, hand: hand169 };
    try {
      chartKeyFor(spot);
    } catch {
      return unrated('otherSpot');
    }
    return { model: 'chart', spot, chosen, grade: gradePreflop(spot, chosen), effectiveBb, approximation };
  };

  if (heroBefore.length === 0) {
    if (raises.length === 0) {
      if (limped || event.action === 'check') return unrated('limp');
      const behind = state.players.filter((p) => !p.isHero && p.position !== null && seatOf(p.position) > seatOf(heroPos));
      if (behind.length === 0) return unrated('otherSpot');
      const villainStack = Math.max(...behind.map((p) => stackOf(p.name)));
      const effectiveBb = Math.min(heroStack, villainStack) / bb;
      const model = modelFor(effectiveBb);
      if (model.model === 'pushfold') {
        if (event.action === 'call') return unrated('limp');
        if (event.action !== 'fold' && !heroShoves) return unrated('shortNotPushFold');
        const spot: Spot = { kind: 'open', position: heroPos, stack: model.stack, hand: hand169 };
        const chosen: Action = event.action === 'fold' ? 'fold' : 'shove';
        return { model: 'pushfold', spot, chosen, grade: grade(data, spot, chosen), effectiveBb };
      }
      return chart('rfi', null, effectiveBb, model.depth, model.approximation);
    }
    if (raises.length === 1) {
      if (limped) return unrated('limp');
      const raise = raises[0];
      const coldCallers = prior.slice(firstRaise + 1).filter((e) => e.action === 'call');
      if (coldCallers.length > 0) return unrated(event.action === 'raise' ? 'squeeze' : 'multiway');
      const effectiveBb = Math.min(heroStack, stackOf(raise.player)) / bb;
      const model = modelFor(effectiveBb);
      const raiserCommitted = raise.to ?? raise.amount;
      if (isShove(raise, raiserCommitted)) {
        if (model.model !== 'pushfold') return unrated('deepAllIn');
        const spot: Spot = { kind: 'call', shover: pos(raise.player), position: heroPos, stack: model.stack, hand: hand169 };
        const chosen: Action = event.action === 'fold' ? 'fold' : 'call';
        return { model: 'pushfold', spot, chosen, grade: grade(data, spot, chosen), effectiveBb };
      }
      if (model.model === 'pushfold') return unrated('shortNotPushFold');
      return chart('vsOpen', pos(raise.player), effectiveBb, model.depth, model.approximation);
    }
    return unrated('multiRaise');
  }

  if (limped) return unrated('limp');
  if (raises.length >= 3) return unrated('deepPot');
  const heroOpen = heroBefore.length === 1 && heroBefore[0].action === 'raise' && raises[0] === heroBefore[0];
  if (heroOpen && raises.length === 2) {
    const threeBet = raises[1];
    const after = prior.slice(prior.indexOf(heroBefore[0]) + 1);
    if (after.some((e) => e.action === 'call')) return unrated('multiway');
    const effectiveBb = Math.min(heroStack, stackOf(threeBet.player)) / bb;
    const model = modelFor(effectiveBb);
    if (model.model === 'pushfold') return unrated('shortNotPushFold');
    return chart('vs3bet', pos(threeBet.player), effectiveBb, model.depth, model.approximation);
  }
  return unrated('multiRaise');
}
```

`src/review/analysis.ts` anlegen:
```ts
import type { PushFoldData } from '../engine/pushfold-data';
import { maxStreetBet, positionsOf, walkHand } from './hand-model';
import { HERO, type ActionType, type ParsedHand, type Street } from './parse';
import { type DecisionRating, ratePreflopDecision } from './preflop';

/** Bump when the rating logic changes: archived hands with another version are rated again when opened. */
export const ANALYSIS_VERSION = 1;

export type HeroDecision = {
  /** Index into `ParsedHand.events`. */
  eventIndex: number;
  street: Street;
  action: ActionType;
  allIn: boolean;
  /** Chips: pot before the action, still to call, the hero's stack before the action and what he put in. */
  pot: number;
  toCall: number;
  stack: number;
  amount: number;
  /** Street total of a raise, as in the hand history. */
  to: number | null;
  rating: DecisionRating;
};
export type HandAnalysis = { version: number; decisions: HeroDecision[] };

export function analyzeHand(hand: ParsedHand, data: PushFoldData): HandAnalysis {
  const positions = positionsOf(hand);
  const states = walkHand(hand, positions);
  const decisions: HeroDecision[] = [];
  hand.events.forEach((event, index) => {
    if (event.type !== 'action' || event.player !== HERO) return;
    const state = states[index];
    const hero = state.players.find((p) => p.isHero)!;
    const rating: DecisionRating =
      event.street === 'preflop'
        ? ratePreflopDecision(hand, index, state, positions, data)
        : { model: 'unrated', reason: 'postflopPending' };
    decisions.push({
      eventIndex: index,
      street: event.street,
      action: event.action,
      allIn: event.allIn,
      pot: state.pot,
      toCall: Math.min(hero.stack, maxStreetBet(state) - hero.streetBet),
      stack: hero.stack,
      amount: event.amount,
      to: event.to,
      rating,
    });
  });
  return { version: ANALYSIS_VERSION, decisions };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/review/preflop.test.ts` → Expected: PASS (27 Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/review/preflop.ts src/review/analysis.ts src/review/preflop.test.ts
git commit -m "feat(review): Preflop-Bewertung nach effektivem Stack mit Push/Fold-Daten und Starthand-Charts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Fehler, Hinweise, Schwere, Filter und Wochenverlauf

**Files:**
- Create: `src/review/summary.ts`, `src/review/summary.test.ts`

**Interfaces:**
- Consumes: `HandAnalysis`, `HeroDecision`, `analyzeHand` (Task 3); `DecisionRating` (Task 3, Tests); `TournamentKind` (Task 2); `shiftDateKey` aus `src/game/streak.ts`
- Produces (`src/review/summary.ts`): `type DecisionOutcome = 'error' | 'hint' | 'close' | 'correct' | 'unrated'`; `SATELLITE_HINT = 'Satellit/Bounty – Standard-Chart nur bedingt gültig'`; `decisionOutcome(decision: HeroDecision, kind: TournamentKind): DecisionOutcome`; `handSeverity(analysis: HandAnalysis, kind: TournamentKind): number`; `handOutcome(analysis: HandAnalysis, kind: TournamentKind): DecisionOutcome | null`; `type HandFilter = 'errors' | 'questionable' | 'all'`; `matchesFilter(analysis, kind, filter: HandFilter): boolean`; `type DaySummary = { hands: number; preflopErrors: number }`; `type TournamentSummary = { hands; preflopErrors; postflopErrors; hints; days: Record<string, DaySummary> }`; `summarize(entries: readonly { dateKey: string; analysis: HandAnalysis }[], kind: TournamentKind): TournamentSummary`; `errorsPer100(errors: number, hands: number): number | null`; `type ErrorWeek = { weekStart; weekEnd; hands; errors; per100: number | null }`; `weeklyErrorTrend(summaries: readonly TournamentSummary[], todayKey: string, weeks = 8): ErrorWeek[]`

- [ ] **Step 1: Failing Tests schreiben**

`src/review/summary.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { type HandAnalysis, type HeroDecision, analyzeHand } from './analysis';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import { parseHistory } from './parse';
import type { DecisionRating } from './preflop';
import {
  SATELLITE_HINT,
  decisionOutcome,
  errorsPer100,
  handOutcome,
  handSeverity,
  matchesFilter,
  summarize,
  weeklyErrorTrend,
} from './summary';

const decision = (rating: DecisionRating, street: HeroDecision['street'] = 'preflop'): HeroDecision => ({
  eventIndex: 0, street, action: 'fold', allIn: false, pot: 0, toCall: 0, stack: 0, amount: 0, to: null, rating,
});
const chart = (verdict: 'correct' | 'close' | 'wrong'): DecisionRating => ({
  model: 'chart',
  spot: { kind: 'rfi', stack: 100, hero: 'BTN', villain: null, hand: 0 },
  chosen: 'fold',
  grade: { verdict, chosen: 'fold', best: 'raise', alternative: null },
  effectiveBb: 100,
  approximation: false,
});
const analysis = (...decisions: HeroDecision[]): HandAnalysis => ({ version: 1, decisions });
const unrated: DecisionRating = { model: 'unrated', reason: 'limp' };

describe('decisionOutcome', () => {
  it('counts a wrong preflop decision as an error only in normal tournaments', () => {
    expect(decisionOutcome(decision(chart('wrong')), 'normal')).toBe('error');
    expect(decisionOutcome(decision(chart('wrong')), 'satellit')).toBe('hint');
    expect(decisionOutcome(decision(chart('wrong')), 'bounty')).toBe('hint');
    expect(decisionOutcome(decision(chart('close')), 'normal')).toBe('close');
    expect(decisionOutcome(decision(chart('correct')), 'bounty')).toBe('correct');
    expect(decisionOutcome(decision(unrated), 'normal')).toBe('unrated');
    expect(SATELLITE_HINT).toBe('Satellit/Bounty – Standard-Chart nur bedingt gültig');
  });
});

describe('severity and filters', () => {
  it('sorts errors before hints before close calls', () => {
    const error = analysis(decision(chart('correct')), decision(chart('wrong')));
    const close = analysis(decision(chart('close')));
    const none = analysis(decision(unrated));
    expect(handSeverity(error, 'normal')).toBeGreaterThan(handSeverity(error, 'satellit'));
    expect(handSeverity(error, 'satellit')).toBeGreaterThan(handSeverity(close, 'normal'));
    expect(handSeverity(close, 'normal')).toBeGreaterThan(handSeverity(none, 'normal'));
    expect(handSeverity(analysis(), 'normal')).toBe(0);
    expect(handOutcome(error, 'normal')).toBe('error');
    expect(handOutcome(error, 'bounty')).toBe('hint');
    expect(handOutcome(none, 'normal')).toBe('unrated');
    expect(handOutcome(analysis(), 'normal')).toBeNull();
  });

  it('filters "nur Fehler", "auch fraglich" and "alle"', () => {
    const error = analysis(decision(chart('wrong')));
    const close = analysis(decision(chart('close')));
    expect(matchesFilter(error, 'normal', 'errors')).toBe(true);
    expect(matchesFilter(error, 'bounty', 'errors')).toBe(false);
    expect(matchesFilter(error, 'bounty', 'questionable')).toBe(true);
    expect(matchesFilter(close, 'normal', 'questionable')).toBe(false);
    expect(matchesFilter(close, 'normal', 'all')).toBe(true);
  });
});

describe('summarize', () => {
  it('counts hands, preflop errors and hints per tournament and per day', () => {
    const entries = [
      { dateKey: '2026-10-12', analysis: analysis(decision(chart('wrong')), decision(unrated, 'flop')) },
      { dateKey: '2026-10-13', analysis: analysis(decision(chart('correct'))) },
      { dateKey: '2026-10-13', analysis: analysis(decision(chart('wrong'))) },
    ];
    expect(summarize(entries, 'normal')).toEqual({
      hands: 3,
      preflopErrors: 2,
      postflopErrors: 0,
      hints: 0,
      days: { '2026-10-12': { hands: 1, preflopErrors: 1 }, '2026-10-13': { hands: 2, preflopErrors: 1 } },
    });
    expect(summarize(entries, 'satellit')).toMatchObject({ preflopErrors: 0, hints: 2 });
  });

  it('summarizes the real Daily Classic hands', () => {
    const data = getPushFoldData();
    const entries = parseHistory(dailyClassic).hands.map((h) => ({ dateKey: h.dateKey, analysis: analyzeHand(h, data) }));
    expect(summarize(entries, 'normal')).toMatchObject({ hands: 6, preflopErrors: 3, hints: 0 });
  });
});

describe('errors per 100 hands', () => {
  it('is null without hands', () => {
    expect(errorsPer100(0, 0)).toBeNull();
    expect(errorsPer100(3, 60)).toBe(5);
  });

  it('builds a weekly trend from the day summaries', () => {
    const a = { hands: 40, preflopErrors: 2, postflopErrors: 0, hints: 0, days: { '2026-10-13': { hands: 40, preflopErrors: 2 } } };
    const b = { hands: 60, preflopErrors: 1, postflopErrors: 0, hints: 0, days: { '2026-10-08': { hands: 10, preflopErrors: 1 }, '2026-10-01': { hands: 50, preflopErrors: 0 } } };
    const trend = weeklyErrorTrend([a, b], '2026-10-13', 3);
    expect(trend).toEqual([
      { weekStart: '2026-09-23', weekEnd: '2026-09-29', hands: 0, errors: 0, per100: null },
      { weekStart: '2026-09-30', weekEnd: '2026-10-06', hands: 50, errors: 0, per100: 0 },
      { weekStart: '2026-10-07', weekEnd: '2026-10-13', hands: 50, errors: 3, per100: 6 },
    ]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/review/summary.test.ts`
Expected: FAIL (`Failed to resolve import "./summary"`).

- [ ] **Step 3: Implementierung**

`src/review/summary.ts` anlegen:
```ts
import { shiftDateKey } from '../game/streak';
import type { HandAnalysis, HeroDecision } from './analysis';
import type { TournamentKind } from './tournament-kind';

/**
 * What a decision counts as. `error` = preflop "falsch" in a normal tournament; in satellites and bounty
 * tournaments the same spot becomes a `hint` and is not counted (spec 5).
 */
export type DecisionOutcome = 'error' | 'hint' | 'close' | 'correct' | 'unrated';

export const SATELLITE_HINT = 'Satellit/Bounty – Standard-Chart nur bedingt gültig';

export function decisionOutcome(decision: HeroDecision, kind: TournamentKind): DecisionOutcome {
  const { rating } = decision;
  if (rating.model === 'unrated') return 'unrated';
  const verdict = rating.grade.verdict;
  if (verdict === 'wrong') return kind === 'normal' ? 'error' : 'hint';
  return verdict === 'close' ? 'close' : 'correct';
}

const SEVERITY: Record<DecisionOutcome, number> = { error: 4, hint: 3, close: 2, correct: 1, unrated: 0 };

/** Higher is worse; hands are sorted by it in the tournament view. */
export const handSeverity = (analysis: HandAnalysis, kind: TournamentKind): number =>
  Math.max(0, ...analysis.decisions.map((d) => SEVERITY[decisionOutcome(d, kind)]));

/** The worst outcome of a hand; null for a hand without hero decisions. */
export function handOutcome(analysis: HandAnalysis, kind: TournamentKind): DecisionOutcome | null {
  let worst: DecisionOutcome | null = null;
  for (const d of analysis.decisions) {
    const outcome = decisionOutcome(d, kind);
    if (worst === null || SEVERITY[outcome] > SEVERITY[worst]) worst = outcome;
  }
  return worst;
}

export type HandFilter = 'errors' | 'questionable' | 'all';

/** "auch fraglich" shows errors and satellite/bounty hints; Plan 8 adds the postflop "fraglich". */
export function matchesFilter(analysis: HandAnalysis, kind: TournamentKind, filter: HandFilter): boolean {
  if (filter === 'all') return true;
  const severity = handSeverity(analysis, kind);
  return filter === 'errors' ? severity >= SEVERITY.error : severity >= SEVERITY.hint;
}

export type DaySummary = { hands: number; preflopErrors: number };
export type TournamentSummary = {
  hands: number;
  preflopErrors: number;
  /** Always 0 until Plan 8 rates postflop decisions. */
  postflopErrors: number;
  hints: number;
  /** Per date key, for the weekly "Fehler pro 100 Hände" trend. */
  days: Record<string, DaySummary>;
};

export function summarize(entries: readonly { dateKey: string; analysis: HandAnalysis }[], kind: TournamentKind): TournamentSummary {
  const summary: TournamentSummary = { hands: 0, preflopErrors: 0, postflopErrors: 0, hints: 0, days: {} };
  for (const { dateKey, analysis } of entries) {
    const day = (summary.days[dateKey] ??= { hands: 0, preflopErrors: 0 });
    summary.hands++;
    day.hands++;
    for (const d of analysis.decisions) {
      const outcome = decisionOutcome(d, kind);
      if (outcome === 'hint') summary.hints++;
      if (outcome !== 'error') continue;
      if (d.street === 'preflop') {
        summary.preflopErrors++;
        day.preflopErrors++;
      } else summary.postflopErrors++;
    }
  }
  return summary;
}

export const errorsPer100 = (errors: number, hands: number): number | null => (hands === 0 ? null : (errors / hands) * 100);

export type ErrorWeek = { weekStart: string; weekEnd: string; hands: number; errors: number; per100: number | null };

/** "Fehler pro 100 Hände" for the last `weeks` weeks up to today, from the per-day summaries of all tournaments. */
export function weeklyErrorTrend(summaries: readonly TournamentSummary[], todayKey: string, weeks = 8): ErrorWeek[] {
  const out: ErrorWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = shiftDateKey(todayKey, -7 * i);
    const weekStart = shiftDateKey(weekEnd, -6);
    let hands = 0;
    let errors = 0;
    for (const s of summaries) {
      for (const [key, day] of Object.entries(s.days)) {
        if (key < weekStart || key > weekEnd) continue;
        hands += day.hands;
        errors += day.preflopErrors;
      }
    }
    out.push({ weekStart, weekEnd, hands, errors, per100: errorsPer100(errors, hands) });
  }
  return out;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/review/summary.test.ts` → Expected: PASS (7 Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/review/summary.ts src/review/summary.test.ts
git commit -m "feat(review): Fehler und Satellit/Bounty-Hinweise zählen, Hände nach Schwere ordnen, Wochenverlauf" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Archiv-Speicher in eigener IndexedDB

**Files:**
- Create: `src/review/archive.ts`, `src/review/archive.test.ts`

**Interfaces:**
- Consumes: `HandAnalysis` (Task 3), `TournamentSummary` (Task 4), `TournamentKind`, `isTournamentKind` (Task 2); `isPreflopSpot`; `HAND_COUNT`; `POSITIONS`; `createStore`, `getMany`, `setMany`, `delMany`, `keys` aus `idb-keyval`; in Tests `indexedDbBackend`, `saveState`, `SAVE_KEY`, `deserialize`, `TODAY_SAVE`, `fake-indexeddb/auto`
- Produces (`src/review/archive.ts`): `REVIEW_SCHEMA_VERSION = 1`; `REVIEW_DB = 'poker-trainer-review'`; `TOURNAMENT_PREFIX = 'tournament:'`, `HAND_PREFIX = 'hand:'`; `type TournamentRecord = { reviewSchemaVersion: 1; id; name; detectedKind: TournamentKind; kind: TournamentKind; firstPlayedAt; lastPlayedAt; handIds: string[]; summary: TournamentSummary }`; `type HandRecord = { reviewSchemaVersion: 1; id; tournamentId; playedAt; dateKey; raw; analysisVersion: number; analysis: HandAnalysis }`; `interface ReviewBackend { getMany(keys): Promise<(string | undefined)[]>; keys(): Promise<string[]>; setMany(entries): Promise<void>; delMany(keys): Promise<void> }`; `class ArchiveFormatError extends Error { code: 'corrupt' | 'newer-version' }`; `readTournament(text): TournamentRecord`; `readHand(text): HandRecord`; `isHandAnalysis(v: unknown): v is HandAnalysis`; `tournamentKey(id)`, `handKey(id)`; `type ArchiveProblem = { key: string; reason: string }`; `type ArchiveIndex = { tournaments; handIds: Set<string>; problems; newerVersion: boolean }`; `loadArchiveIndex(backend): Promise<ArchiveIndex>`; `loadHands(backend, ids): Promise<{ hands: HandRecord[]; problems: ArchiveProblem[] }>`; `writeRecords(backend, tournaments, hands): Promise<void>` (prüft jeden Datensatz per Rundreise, eine Transaktion); `removeTournament(backend, tournament): Promise<void>`; `memoryReviewBackend(initial?): ReviewBackend & { dump(): Record<string, string> }`; `indexedDbReviewBackend(dbName = REVIEW_DB): ReviewBackend`

- [ ] **Step 1: Failing Tests schreiben**

`src/review/archive.test.ts` anlegen:
```ts
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { getPushFoldData } from '../app/data';
import { SAVE_KEY, indexedDbBackend, saveState } from '../storage/store';
import { deserialize } from '../storage/schema';
import { TODAY_SAVE } from '../storage/test-saves';
import { analyzeHand } from './analysis';
import {
  ArchiveFormatError,
  type HandRecord,
  REVIEW_SCHEMA_VERSION,
  type TournamentRecord,
  handKey,
  indexedDbReviewBackend,
  isHandAnalysis,
  loadArchiveIndex,
  loadHands,
  memoryReviewBackend,
  readHand,
  readTournament,
  removeTournament,
  tournamentKey,
  writeRecords,
} from './archive';
import bounty from './fixtures/bounty.txt?raw';
import { parseHand } from './parse';

const hand = parseHand(bounty);
const handRecord: HandRecord = {
  reviewSchemaVersion: 1,
  id: hand.id,
  tournamentId: hand.tournamentId,
  playedAt: hand.playedAt,
  dateKey: hand.dateKey,
  raw: hand.raw,
  analysisVersion: 1,
  analysis: analyzeHand(hand, getPushFoldData()),
};
const tournament: TournamentRecord = {
  reviewSchemaVersion: 1,
  id: hand.tournamentId,
  name: hand.tournamentName,
  detectedKind: 'bounty',
  kind: 'bounty',
  firstPlayedAt: hand.playedAt,
  lastPlayedAt: hand.playedAt,
  handIds: [hand.id],
  summary: { hands: 1, preflopErrors: 0, postflopErrors: 0, hints: 0, days: { '2026-10-13': { hands: 1, preflopErrors: 0 } } },
};

describe('archive records', () => {
  it('has its own schema version', () => {
    expect(REVIEW_SCHEMA_VERSION).toBe(1);
  });

  it('round-trips tournaments and hands', () => {
    expect(readTournament(JSON.stringify(tournament))).toEqual(tournament);
    expect(readHand(JSON.stringify(handRecord))).toEqual(handRecord);
    expect(isHandAnalysis(handRecord.analysis)).toBe(true);
  });

  it('rejects broken records and marks newer ones', () => {
    expect(() => readTournament('{')).toThrow('Archiv-Eintrag nicht lesbar: kein gültiges JSON');
    expect(() => readTournament(JSON.stringify({ ...tournament, kind: 'turbo' }))).toThrow(ArchiveFormatError);
    expect(() => readHand(JSON.stringify({ ...handRecord, raw: 5 }))).toThrow('Archiv-Eintrag nicht lesbar: Hand');
    try {
      readTournament(JSON.stringify({ ...tournament, reviewSchemaVersion: 2 }));
      expect.unreachable();
    } catch (error) {
      expect((error as ArchiveFormatError).code).toBe('newer-version');
    }
  });

  it('accepts a hand with a broken analysis, which is rated again later', () => {
    const broken = { ...handRecord, analysis: { version: 1, decisions: [{ rating: { model: 'chart', spot: {} } }] } };
    expect(readHand(JSON.stringify(broken)).raw).toBe(hand.raw);
    expect(isHandAnalysis(broken.analysis)).toBe(false);
  });
});

describe('archive store', () => {
  it('writes hands and tournament in one transaction and reads them back', async () => {
    const backend = memoryReviewBackend();
    const setMany = vi.spyOn(backend, 'setMany');
    await writeRecords(backend, [tournament], [handRecord]);
    expect(setMany).toHaveBeenCalledTimes(1);
    const index = await loadArchiveIndex(backend);
    expect(index).toEqual({ tournaments: [tournament], handIds: new Set([hand.id]), problems: [], newerVersion: false });
    expect(await loadHands(backend, [hand.id, 'TM404'])).toEqual({
      hands: [handRecord],
      problems: [{ key: 'hand:TM404', reason: 'Archiv-Eintrag fehlt' }],
    });
  });

  it('never writes what cannot be read back', async () => {
    const backend = memoryReviewBackend();
    await expect(writeRecords(backend, [{ ...tournament, handIds: [1 as unknown as string] }], [handRecord])).rejects.toThrow(ArchiveFormatError);
    expect(backend.dump()).toEqual({});
  });

  it('skips and reports unreadable entries without deleting them', async () => {
    const backend = memoryReviewBackend({
      [tournamentKey('1')]: 'kaputt',
      [tournamentKey('2')]: JSON.stringify({ ...tournament, id: '2', reviewSchemaVersion: 7 }),
      [tournamentKey(tournament.id)]: JSON.stringify(tournament),
      [handKey(hand.id)]: JSON.stringify(handRecord),
    });
    const index = await loadArchiveIndex(backend);
    expect(index.tournaments).toEqual([tournament]);
    expect(index.newerVersion).toBe(true);
    expect(index.problems).toEqual([
      { key: 'tournament:1', reason: 'Archiv-Eintrag nicht lesbar: kein gültiges JSON' },
      { key: 'tournament:2', reason: 'Archiv-Version 7 ist neuer als diese App' },
    ]);
    expect(Object.keys(backend.dump())).toHaveLength(4);
  });

  it('removes a tournament with its hands', async () => {
    const backend = memoryReviewBackend();
    await writeRecords(backend, [tournament], [handRecord]);
    await removeTournament(backend, tournament);
    expect(backend.dump()).toEqual({});
  });

  it('uses its own IndexedDB database and leaves the save byte for byte unchanged', async () => {
    const saves = indexedDbBackend('pt-review-test');
    await saveState(saves, deserialize(TODAY_SAVE));
    const before = await saves.get(SAVE_KEY);
    const review = indexedDbReviewBackend('pt-review-test-archive');
    await writeRecords(review, [tournament], [handRecord]);
    expect((await loadArchiveIndex(review)).tournaments).toEqual([tournament]);
    expect(await saves.get(SAVE_KEY)).toBe(before);
    expect(before).toBe(TODAY_SAVE);
    expect(await saves.keys()).toEqual([SAVE_KEY]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/review/archive.test.ts`
Expected: FAIL (`Failed to resolve import "./archive"`).

- [ ] **Step 3: Implementierung**

`src/review/archive.ts` anlegen:
```ts
import { createStore, delMany, getMany, keys, setMany } from 'idb-keyval';
import { isPreflopSpot } from '../engine/preflop/spots';
import { HAND_COUNT } from '../engine/cards';
import { POSITIONS } from '../engine/positions';
import type { HandAnalysis } from './analysis';
import type { TournamentSummary } from './summary';
import { type TournamentKind, isTournamentKind } from './tournament-kind';

export const REVIEW_SCHEMA_VERSION = 1;
/** Its own IndexedDB database: idb-keyval cannot add a second object store to the save's database. */
export const REVIEW_DB = 'poker-trainer-review';
export const TOURNAMENT_PREFIX = 'tournament:';
export const HAND_PREFIX = 'hand:';

export type TournamentRecord = {
  reviewSchemaVersion: 1;
  id: string;
  name: string;
  detectedKind: TournamentKind;
  /** The kind used for rating; the player may change it. */
  kind: TournamentKind;
  firstPlayedAt: string;
  lastPlayedAt: string;
  handIds: string[];
  summary: TournamentSummary;
};
export type HandRecord = {
  reviewSchemaVersion: 1;
  id: string;
  tournamentId: string;
  playedAt: string;
  dateKey: string;
  raw: string;
  analysisVersion: number;
  analysis: HandAnalysis;
};

export interface ReviewBackend {
  getMany(keys: readonly string[]): Promise<(string | undefined)[]>;
  keys(): Promise<string[]>;
  /** Writes all entries in one transaction. */
  setMany(entries: readonly (readonly [string, string])[]): Promise<void>;
  delMany(keys: readonly string[]): Promise<void>;
}

export class ArchiveFormatError extends Error {
  constructor(
    message: string,
    readonly code: 'corrupt' | 'newer-version',
  ) {
    super(message);
    this.name = 'ArchiveFormatError';
  }
}

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const corrupt = (what: string): never => {
  throw new ArchiveFormatError(`Archiv-Eintrag nicht lesbar: ${what}`, 'corrupt');
};

function parseRecord(text: string): Obj {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return corrupt('kein gültiges JSON');
  }
  if (!isObject(raw)) return corrupt('kein Objekt');
  const version = raw.reviewSchemaVersion;
  if (typeof version !== 'number') return corrupt('Schema-Version fehlt');
  if (version > REVIEW_SCHEMA_VERSION) throw new ArchiveFormatError(`Archiv-Version ${version} ist neuer als diese App`, 'newer-version');
  if (version !== REVIEW_SCHEMA_VERSION) return corrupt(`unbekannte Version ${version}`);
  return raw;
}

function isSummary(v: unknown): v is TournamentSummary {
  if (!isObject(v) || !isCount(v.hands) || !isCount(v.preflopErrors) || !isCount(v.postflopErrors) || !isCount(v.hints)) return false;
  return isObject(v.days) && Object.values(v.days).every((d) => isObject(d) && isCount(d.hands) && isCount(d.preflopErrors));
}

export function readTournament(text: string): TournamentRecord {
  const r = parseRecord(text);
  if (!isString(r.id) || !isString(r.name) || !isTournamentKind(r.detectedKind) || !isTournamentKind(r.kind)) corrupt('Turnier');
  if (!isString(r.firstPlayedAt) || !isString(r.lastPlayedAt)) corrupt('Turnierdatum');
  if (!Array.isArray(r.handIds) || !r.handIds.every(isString)) corrupt('Hand-Liste');
  if (!isSummary(r.summary)) corrupt('Zusammenfassung');
  return r as unknown as TournamentRecord;
}

const VERDICTS = ['correct', 'close', 'wrong'];
const isPosition = (v: unknown) => isString(v) && (POSITIONS as readonly string[]).includes(v);

function isRating(v: unknown): boolean {
  if (!isObject(v)) return false;
  if (v.model === 'unrated') return isString(v.reason);
  if (!isObject(v.grade) || !VERDICTS.includes(v.grade.verdict as string) || !isString(v.chosen)) return false;
  if (v.model === 'chart') return isPreflopSpot(v.spot) && typeof v.approximation === 'boolean';
  if (v.model !== 'pushfold' || !isObject(v.spot)) return false;
  const s = v.spot;
  const handOk = isCount(s.hand) && (s.hand as number) < HAND_COUNT;
  return handOk && isCount(s.stack) && isPosition(s.position) && (s.kind === 'open' || (s.kind === 'call' && isPosition(s.shover)));
}

/** A light structural check; anything that fails is rated again from the raw text. */
export function isHandAnalysis(v: unknown): v is HandAnalysis {
  if (!isObject(v) || typeof v.version !== 'number' || !Array.isArray(v.decisions)) return false;
  return v.decisions.every(
    (d) => isObject(d) && isCount(d.eventIndex) && isString(d.street) && isString(d.action) && isCount(d.pot) && isRating(d.rating),
  );
}

/** Raw text and ids must be intact; a broken analysis is not fatal, it is computed again. */
export function readHand(text: string): HandRecord {
  const r = parseRecord(text);
  if (!isString(r.id) || !isString(r.tournamentId) || !isString(r.raw) || !isString(r.playedAt) || !isString(r.dateKey)) corrupt('Hand');
  return r as unknown as HandRecord;
}

export const tournamentKey = (id: string) => `${TOURNAMENT_PREFIX}${id}`;
export const handKey = (id: string) => `${HAND_PREFIX}${id}`;

export type ArchiveProblem = { key: string; reason: string };
export type ArchiveIndex = {
  tournaments: TournamentRecord[];
  handIds: Set<string>;
  problems: ArchiveProblem[];
  /** A record from a newer app version: the archive must not be written. */
  newerVersion: boolean;
};

export async function loadArchiveIndex(backend: ReviewBackend): Promise<ArchiveIndex> {
  const all = await backend.keys();
  const tournamentKeys = all.filter((k) => k.startsWith(TOURNAMENT_PREFIX)).sort();
  const handIds = new Set(all.filter((k) => k.startsWith(HAND_PREFIX)).map((k) => k.slice(HAND_PREFIX.length)));
  const texts = await backend.getMany(tournamentKeys);
  const index: ArchiveIndex = { tournaments: [], handIds, problems: [], newerVersion: false };
  texts.forEach((text, i) => {
    try {
      if (text === undefined) corrupt('leer');
      index.tournaments.push(readTournament(text!));
    } catch (error) {
      if (!(error instanceof ArchiveFormatError)) throw error;
      if (error.code === 'newer-version') index.newerVersion = true;
      index.problems.push({ key: tournamentKeys[i], reason: error.message });
    }
  });
  return index;
}

export async function loadHands(backend: ReviewBackend, ids: readonly string[]): Promise<{ hands: HandRecord[]; problems: ArchiveProblem[] }> {
  const texts = await backend.getMany(ids.map(handKey));
  const hands: HandRecord[] = [];
  const problems: ArchiveProblem[] = [];
  texts.forEach((text, i) => {
    const key = handKey(ids[i]);
    if (text === undefined) {
      problems.push({ key, reason: 'Archiv-Eintrag fehlt' });
      return;
    }
    try {
      hands.push(readHand(text));
    } catch (error) {
      if (!(error instanceof ArchiveFormatError)) throw error;
      problems.push({ key, reason: error.message });
    }
  });
  return { hands, problems };
}

/** Only what reads back is written (same rule as the save); everything goes into one transaction. */
export async function writeRecords(
  backend: ReviewBackend,
  tournaments: readonly TournamentRecord[],
  hands: readonly HandRecord[],
): Promise<void> {
  const entries: [string, string][] = [];
  for (const h of hands) {
    const text = JSON.stringify(h);
    readHand(text);
    entries.push([handKey(h.id), text]);
  }
  for (const t of tournaments) {
    const text = JSON.stringify(t);
    readTournament(text);
    entries.push([tournamentKey(t.id), text]);
  }
  if (entries.length > 0) await backend.setMany(entries);
}

export async function removeTournament(backend: ReviewBackend, tournament: TournamentRecord): Promise<void> {
  await backend.delMany([...tournament.handIds.map(handKey), tournamentKey(tournament.id)]);
}

export function memoryReviewBackend(initial: Record<string, string> = {}): ReviewBackend & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    getMany: (list) => Promise.resolve(list.map((k) => data.get(k))),
    keys: () => Promise.resolve([...data.keys()]),
    setMany: (entries) => {
      for (const [k, v] of entries) data.set(k, v);
      return Promise.resolve();
    },
    delMany: (list) => {
      for (const k of list) data.delete(k);
      return Promise.resolve();
    },
    dump: () => Object.fromEntries(data),
  };
}

export function indexedDbReviewBackend(dbName = REVIEW_DB): ReviewBackend {
  const store = createStore(dbName, 'kv');
  return {
    getMany: (list) => getMany<string>([...list], store),
    keys: async () => (await keys(store)).map(String),
    setMany: (entries) => setMany(entries.map(([k, v]) => [k, v]), store),
    delMany: (list) => delMany([...list], store),
  };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/review/archive.test.ts` → Expected: PASS (9 Tests; der letzte belegt, dass der Spielstand in `poker-trainer` byte-gleich `TODAY_SAVE` bleibt).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/review/archive.ts src/review/archive.test.ts
git commit -m "feat(review): Turnier-Archiv in eigener IndexedDB mit Schema-Version und gemeldeten unlesbaren Einträgen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Import aus Dateien, ZIP und eingefügtem Text

**Files:**
- Modify: `package.json`, `package-lock.json` (über npm)
- Create: `src/review/import.ts`, `src/review/import.test.ts`

**Interfaces:**
- Consumes: `parseHistory`, `ParsedHand`, `SkippedHand` (Task 1); `detectTournamentKind`, `TournamentKind` (Task 2); `analyzeHand`, `HandAnalysis` (Task 3); `summarize` (Task 4); `HandRecord`, `TournamentRecord`, `REVIEW_SCHEMA_VERSION` (Task 5); `unzipSync`, `strFromU8` (und in Tests `zipSync`, `strToU8`) aus `fflate`
- Produces (`src/review/import.ts`): `MAX_FILE_BYTES = 20 * 1024 * 1024`; `MAX_HANDS_PER_IMPORT = 20_000`; `HANDS_PER_CHUNK = 25`; `type ImportFile = { name: string; bytes: Uint8Array }`; `type ImportText = { name: string; text: string }`; `type ImportProgress = { tournament: number; tournaments: number; hand: number; hands: number }`; `type SkipCount = { reason: string; count: number }`; `type ImportSummary = { imported: number; duplicates: number; skipped: SkipCount[]; tournaments: number }`; `class ImportLimitError extends Error`; `extractTexts(files: readonly ImportFile[]): { texts: ImportText[]; skipped: SkippedHand[] }`; `type ImportPlan = { tournaments: Map<string, ParsedHand[]>; duplicates: number; skipped: SkippedHand[] }`; `planImport(texts, existing: ReadonlySet<string>, blockedTournaments?: ReadonlySet<string>, maxHands?: number): ImportPlan`; `countSkipped(skipped): SkipCount[]`; `type AnalyzedHand = { hand: ParsedHand; analysis: HandAnalysis }`; `analyzePlan(plan, data, onProgress: (p: ImportProgress) => void, pause?: () => Promise<void>): Promise<Map<string, AnalyzedHand[]>>`; `handRecordOf(a: AnalyzedHand): HandRecord`; `tournamentRecordOf(id, name, hands: readonly HandRecord[], previous: TournamentRecord | null, kindOverride?: TournamentKind | null): TournamentRecord`

- [ ] **Step 1: Abhängigkeit mit fester Version hinzufügen**

Run: `npm install --save-exact fflate@0.8.2`
Expected: `package.json` enthält unter `dependencies` genau `"fflate": "0.8.2"` (ohne `^`), `package-lock.json` ist aktualisiert. `fflate` hat keine eigenen Abhängigkeiten und führt beim Entpacken nichts aus.

- [ ] **Step 2: Failing Tests schreiben**

`src/review/import.test.ts` anlegen:
```ts
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import bounty from './fixtures/bounty.txt?raw';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import steps from './fixtures/step-satellites.txt?raw';
import {
  HANDS_PER_CHUNK,
  ImportLimitError,
  MAX_FILE_BYTES,
  MAX_HANDS_PER_IMPORT,
  type ImportProgress,
  analyzePlan,
  countSkipped,
  extractTexts,
  handRecordOf,
  planImport,
  tournamentRecordOf,
} from './import';
import { parseHand } from './parse';

const file = (name: string, text: string) => ({ name, bytes: strToU8(text) });
const texts = (...list: string[]) => list.map((text, i) => ({ name: `f${i}.txt`, text }));

describe('extractTexts', () => {
  it('reads .txt files and the .txt entries of a ZIP', () => {
    const zip = zipSync({ 'a.txt': strToU8(dailyClassic), 'b/c.txt': strToU8(bounty), 'notes.pdf': strToU8('%PDF') });
    const result = extractTexts([{ name: 'hands.zip', bytes: zip }, file('steps.txt', steps)]);
    expect(result.texts.map((t) => t.name)).toEqual(['a.txt', 'b/c.txt', 'steps.txt']);
    expect(result.texts[0].text).toBe(dailyClassic);
    expect(result.skipped).toEqual([]);
  });

  it('recognises a ZIP by its signature even without the extension', () => {
    const zip = zipSync({ 'a.txt': strToU8(bounty) });
    expect(extractTexts([{ name: 'download', bytes: zip }]).texts).toHaveLength(1);
  });

  it('reports unsupported, broken and too big files', () => {
    const big = { name: 'big.txt', bytes: new Uint8Array(MAX_FILE_BYTES + 1) };
    const broken = { name: 'broken.zip', bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]) };
    expect(extractTexts([file('bild.png', 'x'), big, broken]).skipped).toEqual([
      { id: 'bild.png', reason: 'Dateityp nicht unterstützt (nur .txt und .zip)' },
      { id: 'big.txt', reason: 'Datei zu groß (über 20 MB)' },
      { id: 'broken.zip', reason: 'ZIP-Datei nicht lesbar' },
    ]);
  });
});

describe('planImport', () => {
  it('groups hands by tournament across files and orders them by time', () => {
    const plan = planImport(texts(steps, dailyClassic), new Set());
    expect([...plan.tournaments.keys()]).toEqual(['318586851', '318586827', '318096259']);
    expect(plan.tournaments.get('318096259')!.map((h) => h.id)).toEqual([
      'TM6532800963', 'TM6532186101', 'TM6533069879', 'TM6533069892', 'TM6532734973', 'TM6532448269',
    ]);
  });

  it('skips hands that are archived or appear twice (the hand number is the key)', () => {
    const plan = planImport(texts(bounty, dailyClassic, bounty), new Set(['TM6532800963']));
    expect(plan.duplicates).toBe(2);
    expect([...plan.tournaments.values()].flat()).toHaveLength(6);
  });

  it('collects unreadable hands with their reason and goes on', () => {
    const plan = planImport(texts(`kaputt\n\n${bounty}`, bounty.replace('Hero', 'Villain').replace('TM6532114653', 'TM2')), new Set());
    expect(countSkipped(plan.skipped)).toEqual([
      { reason: 'Format nicht erkannt', count: 1 },
      { reason: 'kein Hero', count: 1 },
    ]);
    expect(plan.tournaments.size).toBe(1);
  });

  it('never touches a tournament whose archive record is unreadable', () => {
    const plan = planImport(texts(bounty), new Set(), new Set(['318083464']));
    expect(plan.tournaments.size).toBe(0);
    expect(plan.skipped).toEqual([{ id: 'TM6532114653', reason: 'Turnier im Archiv nicht lesbar' }]);
  });

  it('stops with a clear message above the hand limit', () => {
    expect(MAX_HANDS_PER_IMPORT).toBe(20_000);
    expect(() => planImport(texts(dailyClassic), new Set(), new Set(), 5)).toThrow(new ImportLimitError('Zu viele Hände: höchstens 5 je Import'));
  });
});

describe('analyzePlan', () => {
  it('rates in chunks and reports progress per tournament and hand', async () => {
    const plan = planImport(texts(steps, bounty), new Set());
    const progress: ImportProgress[] = [];
    let pauses = 0;
    const result = await analyzePlan(plan, getPushFoldData(), (p) => progress.push(p), async () => {
      pauses++;
    });
    expect([...result.keys()]).toEqual(['318586851', '318586827', '318083464']);
    expect(progress).toEqual([
      { tournament: 1, tournaments: 3, hand: 1, hands: 1 },
      { tournament: 1, tournaments: 3, hand: 1, hands: 1 },
      { tournament: 2, tournaments: 3, hand: 1, hands: 1 },
      { tournament: 2, tournaments: 3, hand: 1, hands: 1 },
      { tournament: 3, tournaments: 3, hand: 1, hands: 1 },
      { tournament: 3, tournaments: 3, hand: 1, hands: 1 },
    ]);
    expect(pauses).toBe(3);
    expect(HANDS_PER_CHUNK).toBe(25);
  });

  it('rates 500 hands well within 30 seconds', async () => {
    const hand = parseHand(bounty);
    const many = Array.from({ length: 500 }, (_, i) => hand.raw.replace('TM6532114653', `TM${900000 + i}`)).join('\n\n\n');
    const started = performance.now();
    const plan = planImport(texts(many), new Set());
    const result = await analyzePlan(plan, getPushFoldData(), () => {});
    const ms = performance.now() - started;
    expect(result.get('318083464')).toHaveLength(500);
    expect(ms).toBeLessThan(30_000);
  });
});

describe('records', () => {
  it('builds hand and tournament records and keeps a kind the player chose', () => {
    const hands = planImport(texts(steps), new Set()).tournaments.get('318586827')!;
    const records = hands.map((hand) => handRecordOf({ hand, analysis: { version: 1, decisions: [] } }));
    expect(records[0]).toMatchObject({ reviewSchemaVersion: 1, id: 'TM6532799440', tournamentId: '318586827', dateKey: '2026-10-13', analysisVersion: 1 });
    const fresh = tournamentRecordOf('318586827', '$0.50 Step to The Weekender', records, null);
    expect(fresh).toMatchObject({ detectedKind: 'satellit', kind: 'satellit', handIds: ['TM6532799440'], firstPlayedAt: '2026-10-13 11:31:49' });
    const changed = tournamentRecordOf('318586827', 'egal', records, { ...fresh, kind: 'normal' });
    expect(changed).toMatchObject({ name: '$0.50 Step to The Weekender', detectedKind: 'satellit', kind: 'normal' });
    expect(tournamentRecordOf('318586827', 'x', records, fresh, 'bounty').kind).toBe('bounty');
  });
});
```

- [ ] **Step 3: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/review/import.test.ts`
Expected: FAIL (`Failed to resolve import "./import"`).

- [ ] **Step 4: Implementierung**

`src/review/import.ts` anlegen:
```ts
import { strFromU8, unzipSync } from 'fflate';
import type { PushFoldData } from '../engine/pushfold-data';
import { type HandAnalysis, analyzeHand } from './analysis';
import { type HandRecord, REVIEW_SCHEMA_VERSION, type TournamentRecord } from './archive';
import { type ParsedHand, type SkippedHand, parseHistory } from './parse';
import { summarize } from './summary';
import { type TournamentKind, detectTournamentKind } from './tournament-kind';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_HANDS_PER_IMPORT = 20_000;
/** Hands analysed between two pauses that let the browser paint the progress bar. */
export const HANDS_PER_CHUNK = 25;

export type ImportFile = { name: string; bytes: Uint8Array };
export type ImportText = { name: string; text: string };
export type ImportProgress = { tournament: number; tournaments: number; hand: number; hands: number };
export type SkipCount = { reason: string; count: number };
export type ImportSummary = { imported: number; duplicates: number; skipped: SkipCount[]; tournaments: number };

export class ImportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportLimitError';
  }
}

const isZip = (file: ImportFile) =>
  file.name.toLowerCase().endsWith('.zip') || (file.bytes[0] === 0x50 && file.bytes[1] === 0x4b && file.bytes[2] === 0x03 && file.bytes[3] === 0x04);
const isTxt = (name: string) => name.toLowerCase().endsWith('.txt');
const TOO_BIG = 'Datei zu groß (über 20 MB)';

/** Unpacks ZIPs (only .txt entries, nothing is executed) and decodes text files; problems are reported per file. */
export function extractTexts(files: readonly ImportFile[]): { texts: ImportText[]; skipped: SkippedHand[] } {
  const texts: ImportText[] = [];
  const skipped: SkippedHand[] = [];
  for (const file of files) {
    if (file.bytes.length > MAX_FILE_BYTES) {
      skipped.push({ id: file.name, reason: TOO_BIG });
      continue;
    }
    if (isZip(file)) {
      let entries: Record<string, Uint8Array>;
      const tooBig: string[] = [];
      try {
        entries = unzipSync(file.bytes, {
          filter: (entry) => {
            if (!isTxt(entry.name)) return false;
            if (entry.originalSize > MAX_FILE_BYTES) {
              tooBig.push(entry.name);
              return false;
            }
            return true;
          },
        });
      } catch {
        skipped.push({ id: file.name, reason: 'ZIP-Datei nicht lesbar' });
        continue;
      }
      for (const name of tooBig) skipped.push({ id: name, reason: TOO_BIG });
      for (const name of Object.keys(entries).sort()) texts.push({ name, text: strFromU8(entries[name]) });
      continue;
    }
    if (!isTxt(file.name)) {
      skipped.push({ id: file.name, reason: 'Dateityp nicht unterstützt (nur .txt und .zip)' });
      continue;
    }
    texts.push({ name: file.name, text: strFromU8(file.bytes) });
  }
  return { texts, skipped };
}

export type ImportPlan = {
  /** New hands per tournament id, oldest first. */
  tournaments: Map<string, ParsedHand[]>;
  duplicates: number;
  skipped: SkippedHand[];
};

/**
 * Parses all texts and drops hands that are already archived (the key is the hand number).
 * Hands of a tournament whose archive record is unreadable are skipped, so that record is never overwritten.
 */
export function planImport(
  texts: readonly ImportText[],
  existing: ReadonlySet<string>,
  blockedTournaments: ReadonlySet<string> = new Set(),
  maxHands = MAX_HANDS_PER_IMPORT,
): ImportPlan {
  const parsed: ParsedHand[] = [];
  const skipped: SkippedHand[] = [];
  for (const { text } of texts) {
    const result = parseHistory(text);
    parsed.push(...result.hands);
    skipped.push(...result.skipped);
    if (parsed.length > maxHands) {
      throw new ImportLimitError(`Zu viele Hände: höchstens ${maxHands.toLocaleString('de-DE')} je Import`);
    }
  }
  const seen = new Set(existing);
  const tournaments = new Map<string, ParsedHand[]>();
  let duplicates = 0;
  for (const hand of parsed) {
    if (seen.has(hand.id)) {
      duplicates++;
      continue;
    }
    if (blockedTournaments.has(hand.tournamentId)) {
      skipped.push({ id: hand.id, reason: 'Turnier im Archiv nicht lesbar' });
      continue;
    }
    seen.add(hand.id);
    const list = tournaments.get(hand.tournamentId) ?? [];
    list.push(hand);
    tournaments.set(hand.tournamentId, list);
  }
  // GGPoker lists the newest hand first; the archive keeps them in playing order.
  for (const list of tournaments.values()) list.sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id));
  return { tournaments, duplicates, skipped };
}

export function countSkipped(skipped: readonly SkippedHand[]): SkipCount[] {
  const counts = new Map<string, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => ({ reason, count }));
}

export type AnalyzedHand = { hand: ParsedHand; analysis: HandAnalysis };

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Rates all planned hands on the main thread in chunks, reporting progress between the chunks. */
export async function analyzePlan(
  plan: ImportPlan,
  data: PushFoldData,
  onProgress: (p: ImportProgress) => void,
  pause: () => Promise<void> = nextTick,
): Promise<Map<string, AnalyzedHand[]>> {
  const out = new Map<string, AnalyzedHand[]>();
  const ids = [...plan.tournaments.keys()];
  for (const [t, id] of ids.entries()) {
    const hands = plan.tournaments.get(id)!;
    const analyzed: AnalyzedHand[] = [];
    for (const [h, hand] of hands.entries()) {
      if (h % HANDS_PER_CHUNK === 0) {
        onProgress({ tournament: t + 1, tournaments: ids.length, hand: h + 1, hands: hands.length });
        await pause();
      }
      analyzed.push({ hand, analysis: analyzeHand(hand, data) });
    }
    onProgress({ tournament: t + 1, tournaments: ids.length, hand: hands.length, hands: hands.length });
    out.set(id, analyzed);
  }
  return out;
}

export function handRecordOf({ hand, analysis }: AnalyzedHand): HandRecord {
  return {
    reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
    id: hand.id,
    tournamentId: hand.tournamentId,
    playedAt: hand.playedAt,
    dateKey: hand.dateKey,
    raw: hand.raw,
    analysisVersion: analysis.version,
    analysis,
  };
}

/** Builds the tournament record from all its hands (old and new), keeping a kind the player chose. */
export function tournamentRecordOf(
  id: string,
  name: string,
  hands: readonly HandRecord[],
  previous: TournamentRecord | null,
  kindOverride: TournamentKind | null = null,
): TournamentRecord {
  const sorted = [...hands].sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id));
  const detectedKind = previous?.detectedKind ?? detectTournamentKind(name);
  const kind = kindOverride ?? previous?.kind ?? detectedKind;
  return {
    reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
    id,
    name: previous?.name ?? name,
    detectedKind,
    kind,
    firstPlayedAt: sorted[0]?.playedAt ?? '',
    lastPlayedAt: sorted[sorted.length - 1]?.playedAt ?? '',
    handIds: sorted.map((h) => h.id),
    summary: summarize(sorted, kind),
  };
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test -- src/review/import.test.ts` → Expected: PASS (11 Tests, der Leistungstest mit 500 Händen braucht deutlich unter einer Sekunde).

- [ ] **Step 6: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add package.json package-lock.json src/review/import.ts src/review/import.test.ts
git commit -m "feat(review): Import aus TXT, ZIP (fflate 0.8.2) und Text mit Grenzen, Duplikaten und Fortschritt" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Review-Store, Schreibrecht, Export mit Archiv-Teil und Verdrahtung

**Files:**
- Create: `src/review/export.ts`, `src/review/export.test.ts`, `src/app/review-store.ts`, `src/app/review-store.test.ts`, `src/ui/ReviewContext.tsx`
- Modify: `src/app/persistence.ts`, `src/ui/test-utils.tsx`, `src/main.tsx`, `src/ui/screens/SettingsScreen.tsx`
- Test: `src/app/persistence.test.ts`, `src/ui/screens/SettingsScreen.test.tsx` (ergänzen)

**Interfaces:**
- Consumes: alles aus `src/review/archive.ts` (Task 5) und `src/review/import.ts` (Task 6); `ANALYSIS_VERSION`, `analyzeHand` (Task 3); `parseHand`, `HandParseError` (Task 1); `Persistence`, `openPersistence`; `serialize`, `deserialize`, `emptyState`, `TODAY_SAVE`; `formatCount`; `downloadText`
- Produces:
  - `src/app/persistence.ts`: `Persistence.canWrite(): boolean` (true, solange der Tab schreiben darf: kein Nur-Lesen-Modus und Schreibsperre gehalten; wird nach der Übergabe der Sperre true)
  - `src/review/export.ts`: `EXPORT_KEY = 'reviewArchive'`; `type ArchiveExport = { reviewSchemaVersion: 1; tournaments: { id; name; kind: TournamentKind }[]; hands: { id; tournamentId; raw }[] }`; `withArchive(saveText: string, part: ArchiveExport | null): string`; `readArchivePart(text: string): ArchiveExport | null` (wirft „Hand-Archiv in der Datei ist nicht lesbar“ bzw. „Hand-Archiv stammt aus einer neueren Version – bitte die App aktualisieren“)
  - `src/app/review-store.ts`: `type ReviewHand = { record: HandRecord; hand: ParsedHand }`; `type OpenTournament = { tournament: TournamentRecord; hands: ReviewHand[]; problems: ArchiveProblem[] }`; `type ReviewSnapshot = { status: 'loading' | 'ready' | 'failed'; tournaments: TournamentRecord[]; problems: ArchiveProblem[]; writable: boolean; lockReason: string | null; progress: ImportProgress | null; lastImport: ImportSummary | null }`; `type ReviewStoreDeps = { backend: ReviewBackend; data: PushFoldData; canWrite: () => boolean; readOnly: boolean; pause?: () => Promise<void> }`; `type ReviewStore = { readonly data; getSnapshot(); subscribe(listener); load(): Promise<void>; refreshAccess(): void; importFiles(files: readonly ImportFile[]): Promise<ImportSummary>; importText(text: string): Promise<ImportSummary>; openTournament(id): Promise<OpenTournament>; setKind(id, kind): Promise<void>; deleteTournament(id): Promise<void>; exportPart(): Promise<ArchiveExport | null>; mergeExport(part: ArchiveExport): Promise<ImportSummary> }`; `LOCK_READ_ONLY`, `LOCK_NEWER_ARCHIVE`, `LOCK_OTHER_TAB`, `LOCK_FAILED`; `createReviewStore(deps: ReviewStoreDeps): ReviewStore`
  - `src/ui/ReviewContext.tsx`: `ReviewProvider({ store, children })`, `useReviewStore(): ReviewStore`, `useReview(): ReviewSnapshot`
  - `src/ui/test-utils.tsx`: `renderWithStore` liefert zusätzlich `review`, `reviewBackend`, `loaded` (Promise des ersten `load()`), Option `reviewBackend?: ReviewBackend`; der Review-Store nutzt dieselbe Push/Fold-Fixture wie der Spiel-Store, `canWrite` = nicht Nur-Lesen und kein anderer Tab
  - Einstellungen: Export mit Archiv-Teil, sobald Turniere archiviert sind (sonst unverändert und sofort); Import prüft den Archiv-Teil zuerst und führt ihn nach dem Spielstand zusammen („Spielstand importiert. Hand-Archiv: 1 Hände ergänzt, 0 schon vorhanden.“)

- [ ] **Step 1: Failing Tests schreiben**

`src/review/export.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { deserialize, emptyState, serialize } from '../storage/schema';
import { TODAY_SAVE } from '../storage/test-saves';
import { type ArchiveExport, EXPORT_KEY, readArchivePart, withArchive } from './export';

const part: ArchiveExport = {
  reviewSchemaVersion: 1,
  tournaments: [{ id: '1', name: 'Daily Classic $1', kind: 'normal' }],
  hands: [{ id: 'TM1', tournamentId: '1', raw: 'Poker Hand #TM1: …' }],
};

describe('export with archive part', () => {
  it('leaves the export unchanged without an archive', () => {
    expect(withArchive(TODAY_SAVE, null)).toBe(TODAY_SAVE);
    expect(readArchivePart(TODAY_SAVE)).toBeNull();
  });

  it('appends the archive as an extra key that the save loader ignores', () => {
    const text = withArchive(TODAY_SAVE, part);
    expect(JSON.parse(text)[EXPORT_KEY]).toEqual(part);
    expect(serialize(deserialize(text))).toBe(TODAY_SAVE);
    expect(readArchivePart(text)).toEqual(part);
  });

  it('rejects a broken or newer archive part', () => {
    const save = serialize(emptyState());
    const broken = withArchive(save, { ...part, hands: [{ id: 1 }] } as unknown as ArchiveExport);
    expect(() => readArchivePart(broken)).toThrow('Hand-Archiv in der Datei ist nicht lesbar');
    const newer = withArchive(save, { ...part, reviewSchemaVersion: 2 } as unknown as ArchiveExport);
    expect(() => readArchivePart(newer)).toThrow('Hand-Archiv stammt aus einer neueren Version – bitte die App aktualisieren');
    expect(readArchivePart('kein JSON')).toBeNull();
  });
});
```

`src/app/review-store.test.ts` anlegen:
```ts
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { getPushFoldData } from './data';
import {
  HAND_PREFIX,
  REVIEW_SCHEMA_VERSION,
  handKey,
  memoryReviewBackend,
  readHand,
  readTournament,
  tournamentKey,
} from '../review/archive';
import bounty from '../review/fixtures/bounty.txt?raw';
import dailyClassic from '../review/fixtures/daily-classic.txt?raw';
import steps from '../review/fixtures/step-satellites.txt?raw';
import { LOCK_NEWER_ARCHIVE, LOCK_OTHER_TAB, LOCK_READ_ONLY, type ReviewStoreDeps, createReviewStore } from './review-store';

const file = (name: string, text: string) => ({ name, bytes: strToU8(text) });

async function setup(over: Partial<ReviewStoreDeps> = {}) {
  const backend = memoryReviewBackend();
  const store = createReviewStore({
    backend,
    data: getPushFoldData(),
    canWrite: () => true,
    readOnly: false,
    pause: async () => {},
    ...over,
  });
  await store.load();
  return { store, backend };
}

describe('review store', () => {
  it('starts empty and writable', async () => {
    const { store } = await setup();
    expect(store.getSnapshot()).toMatchObject({ status: 'ready', tournaments: [], problems: [], writable: true, lockReason: null });
  });

  it('imports files and ZIPs, groups by tournament and reports the balance', async () => {
    const { store, backend } = await setup();
    const zip = zipSync({ 'daily.txt': strToU8(dailyClassic), 'steps.txt': strToU8(steps) });
    const summary = await store.importFiles([{ name: 'hands.zip', bytes: zip }, file('bounty.txt', bounty), file('x.pdf', '')]);
    expect(summary).toEqual({
      imported: 9,
      duplicates: 0,
      skipped: [{ reason: 'Dateityp nicht unterstützt (nur .txt und .zip)', count: 1 }],
      tournaments: 4,
    });
    const snap = store.getSnapshot();
    expect(snap.lastImport).toEqual(summary);
    expect(snap.progress).toBeNull();
    expect(snap.tournaments.map((t) => [t.name, t.kind, t.handIds.length])).toEqual([
      ['Daily Classic $1', 'normal', 6],
      ['$0.50 Step to The Weekender', 'satellit', 1],
      ['Bounty Hunters $2.50', 'bounty', 1],
      ['$0.50 Step to The Weekender', 'satellit', 1],
    ]);
    expect(snap.tournaments[0].summary).toMatchObject({ hands: 6, preflopErrors: 3 });
    const keys = Object.keys(backend.dump());
    expect(keys.filter((k) => k.startsWith(HAND_PREFIX))).toHaveLength(9);
    expect(readHand(backend.dump()[handKey('TM6532114653')]).reviewSchemaVersion).toBe(REVIEW_SCHEMA_VERSION);
  });

  it('does not import a hand twice and adds new hands to a known tournament', async () => {
    const { store } = await setup();
    const [first, ...rest] = dailyClassic.split(/\n(?=Poker Hand #)/);
    await store.importText(first);
    const summary = await store.importText(dailyClassic);
    expect(summary).toMatchObject({ imported: rest.length, duplicates: 1, tournaments: 1 });
    expect(store.getSnapshot().tournaments).toHaveLength(1);
    expect(store.getSnapshot().tournaments[0].handIds).toHaveLength(6);
  });

  it('reports progress while importing', async () => {
    const seen: unknown[] = [];
    const { store } = await setup();
    store.subscribe(() => seen.push(store.getSnapshot().progress));
    await store.importText(steps);
    expect(seen).toContainEqual({ tournament: 2, tournaments: 2, hand: 1, hands: 1 });
    expect(store.getSnapshot().progress).toBeNull();
  });

  it('opens a tournament with parsed hands and their analysis', async () => {
    const { store } = await setup();
    await store.importText(dailyClassic);
    const open = await store.openTournament('318096259');
    expect(open.hands.map((h) => h.hand.id)).toEqual(open.tournament.handIds);
    expect(open.hands[0].record.analysis.decisions.length).toBeGreaterThan(0);
    expect(open.problems).toEqual([]);
  });

  it('rates hands from an older analysis version again when the tournament is opened', async () => {
    const { store, backend } = await setup();
    await store.importText(bounty);
    const key = handKey('TM6532114653');
    const old = { ...readHand(backend.dump()[key]), analysisVersion: 0, analysis: { version: 0, decisions: [] } };
    await backend.setMany([[key, JSON.stringify(old)]]);
    const open = await store.openTournament('318083464');
    expect(open.hands[0].record.analysisVersion).toBe(1);
    expect(open.hands[0].record.analysis.decisions).toHaveLength(6);
    expect(readHand(backend.dump()[key]).analysisVersion).toBe(1);
  });

  it('changes the kind of a tournament and counts errors again', async () => {
    const { store, backend } = await setup();
    await store.importText(dailyClassic);
    await store.setKind('318096259', 'bounty');
    const t = store.getSnapshot().tournaments[0];
    expect(t).toMatchObject({ kind: 'bounty', detectedKind: 'normal', summary: { preflopErrors: 0, hints: 3 } });
    expect(readTournament(backend.dump()[tournamentKey('318096259')]).kind).toBe('bounty');
  });

  it('deletes a tournament with its hands', async () => {
    const { store, backend } = await setup();
    await store.importText(bounty);
    await store.deleteTournament('318083464');
    expect(store.getSnapshot().tournaments).toEqual([]);
    expect(backend.dump()).toEqual({});
  });

  it('blocks writing in read-only mode, in a reading tab and for a newer archive', async () => {
    const readOnly = await setup({ readOnly: true });
    expect(readOnly.store.getSnapshot()).toMatchObject({ writable: false, lockReason: LOCK_READ_ONLY });
    await expect(readOnly.store.importText(bounty)).rejects.toThrow(LOCK_READ_ONLY);
    expect(readOnly.backend.dump()).toEqual({});

    let writer = false;
    const reader = await setup({ canWrite: () => writer });
    expect(reader.store.getSnapshot().lockReason).toBe(LOCK_OTHER_TAB);
    writer = true;
    reader.store.refreshAccess();
    expect(reader.store.getSnapshot().writable).toBe(true);

    const backend = memoryReviewBackend({ [tournamentKey('9')]: JSON.stringify({ reviewSchemaVersion: 2 }) });
    const newer = createReviewStore({ backend, data: getPushFoldData(), canWrite: () => true, readOnly: false });
    await newer.load();
    expect(newer.getSnapshot()).toMatchObject({ writable: false, lockReason: LOCK_NEWER_ARCHIVE });
  });

  it('reports unreadable entries and keeps them', async () => {
    const backend = memoryReviewBackend({ [tournamentKey('318083464')]: 'kaputt' });
    const store = createReviewStore({ backend, data: getPushFoldData(), canWrite: () => true, readOnly: false, pause: async () => {} });
    await store.load();
    expect(store.getSnapshot().problems).toEqual([{ key: 'tournament:318083464', reason: 'Archiv-Eintrag nicht lesbar: kein gültiges JSON' }]);
    const summary = await store.importText(bounty);
    expect(summary.skipped).toEqual([{ reason: 'Turnier im Archiv nicht lesbar', count: 1 }]);
    expect(backend.dump()).toEqual({ [tournamentKey('318083464')]: 'kaputt' });
  });

  it('exports the archive and merges it into another archive', async () => {
    const source = await setup();
    await source.store.importText(steps);
    await source.store.setKind('318586827', 'normal');
    const part = await source.store.exportPart();
    expect(part?.tournaments.map((t) => t.kind).sort()).toEqual(['normal', 'satellit']);
    expect(part?.hands).toHaveLength(2);

    const target = await setup();
    await target.store.importText(steps.split(/\n(?=Poker Hand #)/)[0]);
    const summary = await target.store.mergeExport(part!);
    expect(summary).toMatchObject({ imported: 1, duplicates: 1 });
    expect(target.store.getSnapshot().tournaments.find((t) => t.id === '318586827')?.kind).toBe('normal');
    expect(await (await setup()).store.exportPart()).toBeNull();
  });
});
```

In `src/app/persistence.test.ts` vier Zeilen ergänzen:

Im Test „does not save when another tab holds the writer lock“ nach `expect(p.info.otherTabActive).toBe(true);`:
```ts
    expect(p.canWrite()).toBe(false);
```
Im Test „creates, lists, reads and removes backups when writable“ nach `const p = await openPersistence(env({ createBackend: () => backend, locks: lockAvailable }));`:
```ts
    expect(p.canWrite()).toBe(true);
```
Im Test „is read-only for saves from a newer version“ nach `expect(p.info.readOnly).toBe(true);`:
```ts
    expect(p.canWrite()).toBe(false);
```
Im Test „waits for the lock, reloads the state and starts writing once it is granted“ nach `expect(fresh.profile.xp).toBe(25);`:
```ts
    expect(p.canWrite()).toBe(true);
```

In `src/ui/screens/SettingsScreen.test.tsx` die Importe am Anfang ersetzen durch:
```tsx
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import bounty from '../../review/fixtures/bounty.txt?raw';
import { EXPORT_KEY, withArchive } from '../../review/export';
import { emptyState, serialize } from '../../storage/schema';
import { downloadText } from '../download';
import { renderWithStore } from '../test-utils';
import { SettingsScreen } from './SettingsScreen';
```
und ans Dateiende anhängen:
```tsx
describe('SettingsScreen with the hand archive', () => {
  it('adds the archive to the export once hands are archived', async () => {
    const { review, loaded } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    await act(async () => {
      await loaded;
      await review.importText(bounty);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Exportieren' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalledTimes(1));
    const text = vi.mocked(downloadText).mock.calls[0][1];
    expect(JSON.parse(text)[EXPORT_KEY].hands).toHaveLength(1);
    expect(text.startsWith(serialize(emptyState()).slice(0, -1))).toBe(true);
  });

  it('merges the archive part of an imported file', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { review, loaded } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    await act(() => loaded);
    const part = { reviewSchemaVersion: 1 as const, tournaments: [{ id: '318083464', name: 'Bounty Hunters $2.50', kind: 'normal' as const }], hands: [{ id: 'TM6532114653', tournamentId: '318083464', raw: bounty }] };
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file(withArchive(serialize(emptyState()), part))] } });
    expect(await screen.findByText('Spielstand importiert. Hand-Archiv: 1 Hände ergänzt, 0 schon vorhanden.')).toBeTruthy();
    expect(review.getSnapshot().tournaments[0]).toMatchObject({ id: '318083464', kind: 'normal' });
  });

  it('imports nothing when the archive part is broken', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { store, create } = renderWithStore(<SettingsScreen onBack={() => {}} />);
    const broken = serialize({ ...emptyState(), profile: { xp: 5, combo: 0, soundOn: true } }).slice(0, -1) + ',"reviewArchive":{"reviewSchemaVersion":1}}';
    fireEvent.change(screen.getByLabelText('Spielstand-Datei'), { target: { files: [file(broken)] } });
    expect(await screen.findByText('Import fehlgeschlagen: Hand-Archiv in der Datei ist nicht lesbar')).toBeTruthy();
    expect(store.getSnapshot().save.profile.xp).toBe(0);
    expect(create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/review/export.test.ts src/app/review-store.test.ts src/app/persistence.test.ts src/ui/screens/SettingsScreen.test.tsx`
Expected: FAIL (`Failed to resolve import "./export"` bzw. `"./review-store"`, `p.canWrite is not a function` in vier Persistenz-Tests, die Einstellungs-Tests finden `review` und `loaded` nicht).

- [ ] **Step 3: Implementierung**

`src/app/persistence.ts`: im Typ `Persistence` nach `flush(): Promise<void>;` einfügen:
```ts
  /** True while this tab may write: not read-only and holding the writer lock (also used by the hand archive). */
  canWrite(): boolean;
```
und im Rückgabeobjekt von `openPersistence` nach `flush: () => queue.flush(),` einfügen:
```ts
    canWrite: () => writable,
```

`src/review/export.ts` anlegen:
```ts
import { REVIEW_SCHEMA_VERSION } from './archive';
import { type TournamentKind, isTournamentKind } from './tournament-kind';

/** Key of the optional archive part in a manual export file; the save itself stays unchanged. */
export const EXPORT_KEY = 'reviewArchive';

export type ArchiveExport = {
  reviewSchemaVersion: 1;
  tournaments: { id: string; name: string; kind: TournamentKind }[];
  hands: { id: string; tournamentId: string; raw: string }[];
};

/** Without an archive part the export is exactly the save text, as before. */
export function withArchive(saveText: string, part: ArchiveExport | null): string {
  if (part === null) return saveText;
  if (!saveText.endsWith('}')) throw new Error('Spielstand-Text unerwartet');
  return `${saveText.slice(0, -1)},"${EXPORT_KEY}":${JSON.stringify(part)}}`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const unreadable = (): never => {
  throw new Error('Hand-Archiv in der Datei ist nicht lesbar');
};

/** Null for files without an archive part (all exports before Plan 7). Throws when the part is broken. */
export function readArchivePart(text: string): ArchiveExport | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(raw) || !(EXPORT_KEY in raw)) return null;
  const part = raw[EXPORT_KEY];
  if (!isObject(part)) return unreadable();
  if (typeof part.reviewSchemaVersion !== 'number') return unreadable();
  if (part.reviewSchemaVersion > REVIEW_SCHEMA_VERSION) throw new Error('Hand-Archiv stammt aus einer neueren Version – bitte die App aktualisieren');
  if (part.reviewSchemaVersion !== REVIEW_SCHEMA_VERSION) return unreadable();
  const { tournaments, hands } = part;
  if (!Array.isArray(tournaments) || !tournaments.every((t) => isObject(t) && isString(t.id) && isString(t.name) && isTournamentKind(t.kind))) {
    return unreadable();
  }
  if (!Array.isArray(hands) || !hands.every((h) => isObject(h) && isString(h.id) && isString(h.tournamentId) && isString(h.raw))) {
    return unreadable();
  }
  return part as unknown as ArchiveExport;
}
```

`src/app/review-store.ts` anlegen:
```ts
import type { PushFoldData } from '../engine/pushfold-data';
import { ANALYSIS_VERSION, analyzeHand } from '../review/analysis';
import {
  type ArchiveProblem,
  type HandRecord,
  REVIEW_SCHEMA_VERSION,
  type ReviewBackend,
  TOURNAMENT_PREFIX,
  type TournamentRecord,
  isHandAnalysis,
  loadArchiveIndex,
  loadHands,
  removeTournament,
  writeRecords,
} from '../review/archive';
import type { ArchiveExport } from '../review/export';
import {
  type ImportFile,
  type ImportProgress,
  type ImportSummary,
  type ImportText,
  analyzePlan,
  countSkipped,
  extractTexts,
  handRecordOf,
  planImport,
  tournamentRecordOf,
} from '../review/import';
import { HandParseError, type ParsedHand, type SkippedHand, parseHand } from '../review/parse';
import type { TournamentKind } from '../review/tournament-kind';

export type ReviewHand = { record: HandRecord; hand: ParsedHand };
export type OpenTournament = { tournament: TournamentRecord; hands: ReviewHand[]; problems: ArchiveProblem[] };
export type ReviewSnapshot = {
  status: 'loading' | 'ready' | 'failed';
  /** Newest first. */
  tournaments: TournamentRecord[];
  /** Unreadable archive entries: skipped and reported, never deleted. */
  problems: ArchiveProblem[];
  writable: boolean;
  /** Why import, kind change and delete are blocked; null when writable. */
  lockReason: string | null;
  progress: ImportProgress | null;
  lastImport: ImportSummary | null;
};
export type ReviewStoreDeps = {
  backend: ReviewBackend;
  data: PushFoldData;
  /** The writer lock of the save (one writing tab); checked before every write. */
  canWrite: () => boolean;
  /** The save comes from a newer app version. */
  readOnly: boolean;
  pause?: () => Promise<void>;
};
export type ReviewStore = {
  /** The push/fold data the ratings use (charts and comparisons in the hand view). */
  readonly data: PushFoldData;
  getSnapshot(): ReviewSnapshot;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  /** Re-checks the writer lock, e.g. after this tab became the writer. */
  refreshAccess(): void;
  importFiles(files: readonly ImportFile[]): Promise<ImportSummary>;
  importText(text: string): Promise<ImportSummary>;
  openTournament(id: string): Promise<OpenTournament>;
  setKind(id: string, kind: TournamentKind): Promise<void>;
  deleteTournament(id: string): Promise<void>;
  /** The archive part of a manual export; null when the archive is empty. */
  exportPart(): Promise<ArchiveExport | null>;
  /** Merges the archive part of an export file (hand numbers decide about duplicates). */
  mergeExport(part: ArchiveExport): Promise<ImportSummary>;
};

export const LOCK_READ_ONLY = 'Nur-Lesen-Modus: Bitte die App aktualisieren, um Hände zu importieren.';
export const LOCK_NEWER_ARCHIVE = 'Das Hand-Archiv stammt aus einer neueren Version – bitte die App aktualisieren.';
export const LOCK_OTHER_TAB = 'Import ist nur in dem Tab möglich, der deinen Fortschritt speichert.';
export const LOCK_FAILED = 'Das Hand-Archiv konnte nicht geladen werden.';

const byNewest = (a: TournamentRecord, b: TournamentRecord) => b.lastPlayedAt.localeCompare(a.lastPlayedAt) || a.id.localeCompare(b.id);

export function createReviewStore(deps: ReviewStoreDeps): ReviewStore {
  const { backend, data, canWrite, readOnly } = deps;
  let newerArchive = false;
  const listeners = new Set<() => void>();
  let chain: Promise<unknown> = Promise.resolve();

  const lockReasonOf = (status: ReviewSnapshot['status']): string | null => {
    if (readOnly) return LOCK_READ_ONLY;
    if (status === 'failed') return LOCK_FAILED;
    if (newerArchive) return LOCK_NEWER_ARCHIVE;
    if (!canWrite()) return LOCK_OTHER_TAB;
    return null;
  };
  let snapshot: ReviewSnapshot = {
    status: 'loading',
    tournaments: [],
    problems: [],
    writable: false,
    lockReason: null,
    progress: null,
    lastImport: null,
  };
  const update = (patch: Partial<ReviewSnapshot>) => {
    const next = { ...snapshot, ...patch };
    const lockReason = next.status === 'loading' ? null : lockReasonOf(next.status);
    snapshot = { ...next, lockReason, writable: next.status === 'ready' && lockReason === null };
    for (const listener of [...listeners]) listener();
  };
  /** One archive write at a time, in order. */
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  };
  const assertWritable = () => {
    if (snapshot.status === 'ready') update({});
    if (!snapshot.writable) throw new Error(snapshot.lockReason ?? 'Das Hand-Archiv wird noch geladen.');
  };

  /** Parses the stored text and rates it again when the analysis is missing, broken or from another version. */
  function fresh(record: HandRecord): { item: ReviewHand; changed: boolean } | null {
    let hand: ParsedHand;
    try {
      hand = parseHand(record.raw);
    } catch (error) {
      if (error instanceof HandParseError) return null;
      throw error;
    }
    if (record.analysisVersion === ANALYSIS_VERSION && isHandAnalysis(record.analysis)) return { item: { record, hand }, changed: false };
    const analysis = analyzeHand(hand, data);
    return { item: { record: { ...record, analysis, analysisVersion: analysis.version }, hand }, changed: true };
  }

  type LoadedHands = { hands: ReviewHand[]; changed: HandRecord[]; problems: ArchiveProblem[] };

  async function loadTournamentHands(tournament: TournamentRecord): Promise<LoadedHands> {
    const loaded = await loadHands(backend, tournament.handIds);
    const problems = [...loaded.problems];
    const hands: ReviewHand[] = [];
    const changed: HandRecord[] = [];
    for (const record of loaded.hands) {
      const result = fresh(record);
      if (!result) {
        problems.push({ key: `hand:${record.id}`, reason: 'Hand-Text nicht lesbar' });
        continue;
      }
      hands.push(result.item);
      if (result.changed) changed.push(result.item.record);
    }
    return { hands, changed, problems };
  }

  const replaceTournament = (record: TournamentRecord) =>
    [...snapshot.tournaments.filter((t) => t.id !== record.id), record].sort(byNewest);

  async function importTexts(
    texts: readonly ImportText[],
    fileSkipped: readonly SkippedHand[],
    kinds: ReadonlyMap<string, TournamentKind> = new Map(),
  ): Promise<ImportSummary> {
    assertWritable();
    if (snapshot.progress) throw new Error('Es läuft bereits ein Import.');
    const existing = new Set(snapshot.tournaments.flatMap((t) => t.handIds));
    const blocked = new Set(
      snapshot.problems.filter((p) => p.key.startsWith(TOURNAMENT_PREFIX)).map((p) => p.key.slice(TOURNAMENT_PREFIX.length)),
    );
    const plan = planImport(texts, existing, blocked);
    update({ progress: { tournament: 0, tournaments: plan.tournaments.size, hand: 0, hands: 0 } });
    try {
      const analyzed = await analyzePlan(plan, data, (progress) => update({ progress }), deps.pause);
      let imported = 0;
      for (const [id, items] of analyzed) {
        const previous = snapshot.tournaments.find((t) => t.id === id) ?? null;
        const old: LoadedHands = previous ? await loadTournamentHands(previous) : { hands: [], changed: [], problems: [] };
        const added = items.map(handRecordOf);
        const record = tournamentRecordOf(
          id,
          items[0].hand.tournamentName,
          [...old.hands.map((h) => h.record), ...added],
          previous,
          previous ? null : (kinds.get(id) ?? null),
        );
        await serial(() => writeRecords(backend, [record], [...old.changed, ...added]));
        imported += added.length;
        update({ tournaments: replaceTournament(record) });
      }
      const summary: ImportSummary = {
        imported,
        duplicates: plan.duplicates,
        skipped: countSkipped([...fileSkipped, ...plan.skipped]),
        tournaments: analyzed.size,
      };
      update({ progress: null, lastImport: summary });
      return summary;
    } catch (error) {
      update({ progress: null });
      throw error;
    }
  }

  const store: ReviewStore = {
    data,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async load() {
      try {
        const index = await loadArchiveIndex(backend);
        newerArchive = index.newerVersion;
        update({ status: 'ready', tournaments: [...index.tournaments].sort(byNewest), problems: index.problems });
      } catch {
        update({ status: 'failed' });
      }
    },
    refreshAccess() {
      update({});
    },
    importFiles(files) {
      const { texts, skipped } = extractTexts(files);
      return importTexts(texts, skipped);
    },
    importText(text) {
      return importTexts([{ name: 'Eingefügt', text }], []);
    },
    async openTournament(id) {
      const tournament = snapshot.tournaments.find((t) => t.id === id);
      if (!tournament) throw new Error('Turnier nicht gefunden');
      const loaded = await loadTournamentHands(tournament);
      let current = tournament;
      // Hands rated by an older version are rated again; the result is kept when this tab may write.
      if (loaded.changed.length > 0) {
        current = tournamentRecordOf(id, tournament.name, loaded.hands.map((h) => h.record), tournament);
        if (snapshot.writable) {
          await serial(() => writeRecords(backend, [current], loaded.changed));
          update({ tournaments: replaceTournament(current) });
        }
      }
      return { tournament: current, hands: loaded.hands, problems: loaded.problems };
    },
    async setKind(id, kind) {
      assertWritable();
      const tournament = snapshot.tournaments.find((t) => t.id === id);
      if (!tournament) throw new Error('Turnier nicht gefunden');
      const loaded = await loadTournamentHands(tournament);
      const record = tournamentRecordOf(id, tournament.name, loaded.hands.map((h) => h.record), tournament, kind);
      await serial(() => writeRecords(backend, [record], loaded.changed));
      update({ tournaments: replaceTournament(record) });
    },
    async deleteTournament(id) {
      assertWritable();
      const tournament = snapshot.tournaments.find((t) => t.id === id);
      if (!tournament) return;
      await serial(() => removeTournament(backend, tournament));
      update({ tournaments: snapshot.tournaments.filter((t) => t.id !== id) });
    },
    async exportPart() {
      if (snapshot.tournaments.length === 0) return null;
      const part: ArchiveExport = { reviewSchemaVersion: REVIEW_SCHEMA_VERSION, tournaments: [], hands: [] };
      for (const t of snapshot.tournaments) {
        part.tournaments.push({ id: t.id, name: t.name, kind: t.kind });
        const { hands } = await loadHands(backend, t.handIds);
        for (const h of hands) part.hands.push({ id: h.id, tournamentId: h.tournamentId, raw: h.raw });
      }
      return part;
    },
    mergeExport(part) {
      const kinds = new Map(part.tournaments.map((t) => [t.id, t.kind] as const));
      const texts = part.hands.map((h) => ({ name: 'Export', text: h.raw }));
      return importTexts(texts, [], kinds);
    },
  };
  return store;
}
```

`src/ui/ReviewContext.tsx` anlegen:
```tsx
import { type ReactNode, createContext, useContext, useSyncExternalStore } from 'react';
import type { ReviewSnapshot, ReviewStore } from '../app/review-store';

const ReviewStoreContext = createContext<ReviewStore | null>(null);

export function ReviewProvider({ store, children }: { store: ReviewStore; children: ReactNode }) {
  return <ReviewStoreContext.Provider value={store}>{children}</ReviewStoreContext.Provider>;
}

export function useReviewStore(): ReviewStore {
  const store = useContext(ReviewStoreContext);
  if (!store) throw new Error('ReviewProvider fehlt');
  return store;
}

export function useReview(): ReviewSnapshot {
  const store = useReviewStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
```

`src/ui/test-utils.tsx` vollständig ersetzen:
```tsx
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { createGameStore } from '../app/game-store';
import type { BackupApi, PersistenceInfo } from '../app/persistence';
import { createReviewStore } from '../app/review-store';
import { mulberry32 } from '../engine/rng';
import { makeFixture } from '../engine/test-fixtures';
import { type ReviewBackend, memoryReviewBackend } from '../review/archive';
import { emptyState, type SaveState } from '../storage/schema';
import { GameProvider } from './GameContext';
import { ReviewProvider } from './ReviewContext';

const baseInfo: PersistenceInfo = { mode: 'indexeddb', readOnly: false, otherTabActive: false, corruptBackup: null };

export function renderWithStore(
  ui: ReactElement,
  options: {
    initial?: SaveState;
    info?: Partial<PersistenceInfo>;
    backupKeys?: string[];
    backups?: Partial<BackupApi>;
    reviewBackend?: ReviewBackend;
  } = {},
) {
  const save = vi.fn();
  const create = vi.fn(async () => 'corrupt-backup:2026-10-13T16:00:00.000Z');
  const remove = vi.fn(async () => {});
  const data = makeFixture((h) => (84 - h) / 10);
  const info = { ...baseInfo, ...options.info };
  const store = createGameStore({
    data,
    persistence: {
      initial: options.initial ?? emptyState(),
      info,
      save,
      backups: {
        list: async () => options.backupKeys ?? [],
        read: async () => '{"gesichert":true}',
        remove,
        create,
        ...options.backups,
      },
    },
    rng: mulberry32(4),
    now: () => new Date(2026, 9, 13, 18, 0),
    clock: () => 0,
  });
  const reviewBackend = options.reviewBackend ?? memoryReviewBackend();
  const review = createReviewStore({
    backend: reviewBackend,
    data,
    canWrite: () => !info.readOnly && !info.otherTabActive,
    readOnly: info.readOnly,
    pause: async () => {},
  });
  const loaded = review.load();
  const result = render(
    <GameProvider store={store}>
      <ReviewProvider store={review}>{ui}</ReviewProvider>
    </GameProvider>,
  );
  return { ...result, store, save, create, remove, data, review, reviewBackend, loaded };
}
```

`src/main.tsx` vollständig ersetzen (neu: Review-Store mit eigener Datenbank bzw. Arbeitsspeicher im Rückfall, `refreshAccess` nach der Übergabe der Schreibsperre, `ReviewProvider`):
```tsx
import { StrictMode } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { getPushFoldData } from './app/data';
import { type GameStore, createGameStore } from './app/game-store';
import { type Persistence, browserEnv, installFlushOnHide, openPersistence } from './app/persistence';
import { createReviewStore } from './app/review-store';
import { createUpdatePolicy } from './app/update-policy';
import { registerSW } from 'virtual:pwa-register';
import { mulberry32 } from './engine/rng';
import { indexedDbReviewBackend, memoryReviewBackend } from './review/archive';
import { App } from './ui/App';
import { GameProvider } from './ui/GameContext';
import { ReviewProvider } from './ui/ReviewContext';
import { browserAudioFactory, createSoundPlayer } from './ui/sound';
import './ui/theme.css';

const STATUS_REFRESH_MS = 60_000;

let root: Root | null = null;
const appRoot = (): Root => (root ??= createRoot(document.getElementById('root')!));

const logError = (error: unknown) => console.error(error);

async function bootstrap(): Promise<void> {
  let store: GameStore | null = null;
  let persistence: Persistence | null = null;
  let updateNotice = false;
  // A page restored from the back/forward cache may run an outdated version and an outdated state.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
  // 'prompt' mode: a new version only activates and reloads when the player agrees or the page is hidden.
  const policy = createUpdatePolicy({
    flush: () => persistence?.flush() ?? Promise.resolve(),
    reload: () => location.reload(),
    activate: () => updateSW(true),
    isHidden: () => document.visibilityState === 'hidden',
    showNotice: () => {
      updateNotice = true;
      store?.setUpdateAvailable();
    },
  });
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => policy.onNeedRefresh(),
    onNeedReload: () => void policy.onNeedReload().catch(logError),
  });
  appRoot().render(<p className="app-loading">Lädt …</p>);

  const opened = await openPersistence(
    browserEnv((error) => {
      console.error(error);
      store?.reportSaveError(error);
    }),
  );
  persistence = opened;
  installFlushOnHide(opened, document, window);

  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  store = createGameStore({
    data: getPushFoldData(),
    persistence: opened,
    rng: mulberry32(seed),
    now: () => new Date(),
    clock: () => performance.now(),
  });
  const ready = store;
  if (updateNotice) ready.setUpdateAvailable();
  // The hand archive lives in its own database and follows the save's storage mode and writer lock.
  const review = createReviewStore({
    backend: opened.info.mode === 'indexeddb' ? indexedDbReviewBackend() : memoryReviewBackend(),
    data: getPushFoldData(),
    canWrite: () => opened.canWrite(),
    readOnly: opened.info.readOnly,
  });
  void review.load();
  opened.onWriterAcquired((fresh) => {
    ready.adoptSavedState(fresh);
    review.refreshAccess();
  });
  document.addEventListener('visibilitychange', () => {
    const visible = document.visibilityState === 'visible';
    ready.onVisibilityChange(visible);
    if (visible) ready.refreshStatus();
    // Apply a waiting update while nobody is looking, so it never interrupts training.
    else policy.onHidden().catch(logError);
  });
  const applyUpdate = () => policy.applyNow();
  // Cheap, and keeps the day counter right across midnight.
  setInterval(() => ready.refreshStatus(), STATUS_REFRESH_MS);

  const sound = createSoundPlayer(browserAudioFactory);
  appRoot().render(
    <StrictMode>
      <GameProvider store={ready}>
        <ReviewProvider store={review}>
          <App onApplyUpdate={applyUpdate} sound={sound} />
        </ReviewProvider>
      </GameProvider>
    </StrictMode>,
  );
}

bootstrap().catch((error: unknown) => {
  logError(error);
  appRoot().render(
    <main className="app">
      <p>Der Trainer konnte nicht gestartet werden.</p>
      <button type="button" className="btn btn--gold" onClick={() => location.reload()}>
        Neu laden
      </button>
    </main>,
  );
});
```

`src/ui/screens/SettingsScreen.tsx` vollständig ersetzen:
```tsx
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { formatCount } from '../../app/format';
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

  // Without archived hands the export is exactly the save, as before (and written right away).
  const exportNow = async () => {
    const name = `poker-trainer-spielstand-${localDateKey(new Date())}.json`;
    if (review.tournaments.length === 0) {
      downloadText(name, store.exportState());
      return;
    }
    try {
      downloadText(name, withArchive(store.exportState(), await reviewStore.exportPart()));
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
        done = `Spielstand importiert. Hand-Archiv: ${formatCount(merged.imported)} Hände ergänzt, ${formatCount(merged.duplicates)} schon vorhanden.`;
      } catch (error) {
        done = `Spielstand importiert. Hand-Archiv nicht übernommen: ${errorText(error)}`;
      }
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
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/review/export.test.ts src/app/review-store.test.ts src/app/persistence.test.ts src/ui/screens/SettingsScreen.test.tsx` → Expected: PASS (der bestehende Test „exports the save as a dated JSON file“ bleibt unverändert grün: ohne Archiv ist der Export weiter `serialize(emptyState())`).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/review/export.ts src/review/export.test.ts src/app/review-store.ts src/app/review-store.test.ts src/app/persistence.ts src/app/persistence.test.ts src/ui/ReviewContext.tsx src/ui/test-utils.tsx src/main.tsx src/ui/screens/SettingsScreen.tsx src/ui/screens/SettingsScreen.test.tsx
git commit -m "feat(review): Review-Store mit Schreibsperre des Spielstands, Export und Import mit optionalem Hand-Archiv" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Anzeige-Bausteine – Formate, Wiedergabe, Tisch mit Board, Urteil je Entscheidung

**Files:**
- Create: `src/ui/replay-model.ts`, `src/ui/replay-model.test.ts`, `src/ui/components/ReviewDecisionPanel.tsx`, `src/ui/components/ReviewDecisionPanel.test.tsx`
- Modify: `src/app/format.ts`, `src/ui/components/PokerTable.tsx`, `src/ui/components/PokerTable.css`, `src/ui/components/FeedbackPanel.tsx`, `src/ui/components/PreflopFeedbackPanel.tsx`
- Test: `src/app/format.test.ts`, `src/ui/components/PokerTable.test.tsx` (ergänzen); `FeedbackPanel.test.tsx` und `PreflopFeedbackPanel.test.tsx` bleiben unverändert grün

**Interfaces:**
- Consumes: `ActionType`, `Street`, `HandEvent`, `ActionEvent`, `ParsedHand` (Task 1); `walkHand`, `PlayerState`, `TableState` (Task 2); `HeroDecision` (Task 3), `UNRATED_TEXT`, `DecisionRating` (Task 3); `SATELLITE_HINT`, `decisionOutcome` (Task 4); `TournamentKind` (Task 2); `SeatModel`, `SeatRole`, `TableModel`; `chart`, `comparePositions`, `chartFor`, `preflopCells`, `comparePreflopPositions`
- Produces:
  - `src/app/format.ts`: `formatPer100(value: number | null): string`, `formatChipsBb(chips: number, bigBlind: number): string`, `formatDateKey(key: string): string`, `formatPlayedAt(playedAt: string): string`, `type ReviewActionInput = { action: ActionType; amount: number; to: number | null; allIn: boolean }`, `streetLabel(street: Street): string`, `reviewActionLabel(a: ReviewActionInput, bigBlind: number): string`
  - `src/ui/replay-model.ts`: `type ReplayStep = { eventIndex: number | null; state: TableState; text: string; decision: HeroDecision | null }`, `describeEvent(event: HandEvent, state: TableState, bigBlind: number): string`, `replaySteps(hand: ParsedHand, decisions: readonly HeroDecision[]): ReplayStep[]`, `replayTableModel(state: TableState, bigBlind: number): TableModel`
  - `src/ui/components/PokerTable.tsx`: exportiert `type TableViewProps = { model: TableModel; cards: readonly Card[]; situation: string; info: string; board?: readonly Card[] }` und `TableView(props)`; `PokerTable` und `PreflopTable` unverändert
  - `src/ui/components/FeedbackPanel.tsx`: `type PushFoldVerdictProps = { spot: Spot; grade: Grade; chart: readonly ChartCell[]; comparison: PositionComparison; title?: string; tone?: Verdict; extra?: ReactNode }`, `PushFoldVerdict(props)`; `FeedbackPanel` nutzt es (gleiche Ausgabe wie bisher)
  - `src/ui/components/PreflopFeedbackPanel.tsx`: `type PreflopVerdictProps = { spot: PreflopSpot; grade: PreflopGrade; cells: readonly PreflopCell[]; note: string; comparison: PreflopComparison; title?: string; tone?: Verdict; extra?: ReactNode }`, `PreflopVerdict(props)`; `PreflopFeedbackPanel` nutzt es (gleiche Ausgabe wie bisher)
  - `src/ui/components/ReviewDecisionPanel.tsx`: `ReviewDecisionPanel({ decision: HeroDecision; kind: TournamentKind; bigBlind: number; data: PushFoldData })`

- [ ] **Step 1: Failing Tests schreiben**

`src/ui/replay-model.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { analyzeHand } from '../review/analysis';
import bounty from '../review/fixtures/bounty.txt?raw';
import steps from '../review/fixtures/step-satellites.txt?raw';
import { parseHand, parseHistory } from '../review/parse';
import { replaySteps, replayTableModel } from './replay-model';

const hand = parseHand(bounty);
const decisions = analyzeHand(hand, getPushFoldData()).decisions;

describe('replaySteps', () => {
  const list = replaySteps(hand, decisions);

  it('starts after the posts and has one step per event', () => {
    expect(list[0]).toMatchObject({ eventIndex: null, text: 'Karten verteilt', decision: null });
    const posts = hand.events.filter((e) => e.type === 'ante' || e.type === 'smallBlind' || e.type === 'bigBlind').length;
    expect(list).toHaveLength(hand.events.length - posts + 1);
    expect(list[0].state.pot).toBe(8 * 18 + 60 + 120);
  });

  it('shows the table before each hero decision and names the choice', () => {
    const heroSteps = list.filter((s) => s.decision);
    expect(heroSteps).toHaveLength(6);
    expect(heroSteps[0].text).toBe('Du bist dran – deine Wahl: Raise auf 3 BB');
    expect(heroSteps[0].state.players.find((p) => p.isHero)?.streetBet).toBe(0);
    expect(heroSteps[3].text).toBe('Du bist dran – deine Wahl: Call 17,1 BB');
  });

  it('describes the other events in German with positions and BB', () => {
    const texts = list.filter((s) => !s.decision).map((s) => s.text);
    expect(texts).toContain('UTG+1: Fold');
    expect(texts).toContain('CO: Call 3 BB');
    expect(texts).toContain('Flop: 8h 9c 7h');
    expect(texts).toContain('CO: Raise auf 30,1 BB');
    expect(texts).toContain('CO: 88 BB zurück');
    expect(texts).toContain('CO gewinnt 77,6 BB');
  });
});

describe('replayTableModel', () => {
  it('places the seated players around the hero with stacks, bets and the board pot', () => {
    const list = replaySteps(hand, decisions);
    const turnRaise = list.find((s) => s.text === 'CO: Raise auf 30,1 BB')!;
    const model = replayTableModel(turnRaise.state, hand.bigBlind);
    expect(model.seats).toHaveLength(8);
    const hero = model.seats.find((s) => s.role === 'hero')!;
    expect(hero).toMatchObject({ position: 'UTG', offset: 0, betBb: 13.1, stackBb: 57.9 });
    expect(model.seats.find((s) => s.position === 'CO')).toMatchObject({ role: 'raiser', betBb: 30.1 });
    expect(model.seats.filter((s) => s.role === 'folded')).toHaveLength(6);
    expect(model.potBb).toBe(60.6);
  });

  it('marks all-in players and works at a short-handed table', () => {
    const h = parseHistory(steps).hands.find((x) => x.id === 'TM6532799440')!;
    const list = replaySteps(h, analyzeHand(h, getPushFoldData()).decisions);
    const model = replayTableModel(list[0].state, h.bigBlind);
    expect(model.seats.map((s) => s.position)).toEqual(['BB', 'HJ', 'CO', 'BTN', 'SB']);
    expect(model.seats.find((s) => s.position === 'BB')).toMatchObject({ betLabel: 'All-in', betBb: 0.5, stackBb: 0 });
    expect(model.seats.find((s) => s.isButton)?.position).toBe('BTN');
  });
});
```

`src/ui/components/ReviewDecisionPanel.test.tsx` anlegen:
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseHand } from '../../engine/cards';
import { gradePreflop } from '../../engine/preflop/grading';
import { grade } from '../../engine/pushfold';
import { makeFixture } from '../../engine/test-fixtures';
import type { HeroDecision } from '../../review/analysis';
import type { DecisionRating } from '../../review/preflop';
import { ReviewDecisionPanel } from './ReviewDecisionPanel';

const data = makeFixture((h) => (84 - h) / 10);
const decision = (rating: DecisionRating, over: Partial<HeroDecision> = {}): HeroDecision => ({
  eventIndex: 3, street: 'preflop', action: 'raise', allIn: false, pot: 250, toCall: 100, stack: 3990, amount: 220, to: 220, rating, ...over,
});
const K6o = parseHand('K6o');
const chartSpot = { kind: 'rfi', stack: 40, hero: 'UTG', villain: null, hand: K6o } as const;
const chartRating: DecisionRating = {
  model: 'chart', spot: chartSpot, chosen: 'raise', grade: gradePreflop(chartSpot, 'raise'), effectiveBb: 28.04, approximation: true,
};

describe('ReviewDecisionPanel', () => {
  it('shows a chart verdict with your action, the numbers and the approximation', () => {
    render(<ReviewDecisionPanel decision={decision(chartRating)} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Falsch' })).toBeTruthy();
    expect(screen.getByText('Deine Wahl: Raise')).toBeTruthy();
    expect(screen.getByText('Richtige Aktion: Fold')).toBeTruthy();
    expect(screen.getByText('Preflop · Pot 2,5 BB · zu callen 1 BB · Stack 39,9 BB')).toBeTruthy();
    expect(screen.getByText('Näherung: Chart für 40 BB · 28 BB effektiv')).toBeTruthy();
    expect(screen.getByText('Standard-Chart, kein Solver-Ergebnis')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'K6o · Open-Raise aus UTG · 40 BB' })).toBeTruthy();
  });

  it('turns an error into a hint in satellites and bounty tournaments', () => {
    render(<ReviewDecisionPanel decision={decision(chartRating)} kind="satellit" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Hinweis' })).toBeTruthy();
    expect(screen.getByText('Satellit/Bounty – Standard-Chart nur bedingt gültig')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Falsch' })).toBeNull();
  });

  it('shows push/fold verdicts with EV and the push/fold chart', () => {
    const spot = { kind: 'open', position: 'CO', stack: 12, hand: parseHand('AKo') } as const;
    const rating: DecisionRating = { model: 'pushfold', spot, chosen: 'shove', grade: grade(data, spot, 'shove'), effectiveBb: 12.3 };
    render(<ReviewDecisionPanel decision={decision(rating, { allIn: true })} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Richtig' })).toBeTruthy();
    expect(screen.getByText('Push/Fold-Daten · 12,3 BB effektiv')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'AKo bei 12 BB – Range für diesen Spot' })).toBeTruthy();
  });

  it('explains why a decision is not rated and still shows the numbers', () => {
    const rating: DecisionRating = { model: 'unrated', reason: 'postflopPending' };
    render(<ReviewDecisionPanel decision={decision(rating, { street: 'turn', action: 'bet', amount: 450, to: null })} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Nicht bewertet' })).toBeTruthy();
    expect(screen.getByText('Postflop-Bewertung folgt')).toBeTruthy();
    expect(screen.getByText('Deine Aktion: Bet 4,5 BB')).toBeTruthy();
    expect(screen.getByText('Turn · Pot 2,5 BB · zu callen 1 BB · Stack 39,9 BB')).toBeTruthy();
  });
});
```

In `src/app/format.test.ts` den Import-Block ersetzen durch:
```ts
import {
  actionLabel,
  aggressiveWord,
  evLine,
  formatBb,
  formatCount,
  formatEv,
  formatChipsBb,
  formatDateKey,
  formatPer100,
  formatPercent,
  formatPlayedAt,
  preflopChoiceLabel,
  preflopSituationText,
  preflopSpotTitle,
  reviewActionLabel,
  streetLabel,
  verdictLabel,
  xpSummary,
} from './format';
```
und im letzten `describe` vor dessen schließender Zeile `});` einfügen:
```ts
  it('formats the hand review numbers and dates', () => {
    expect(formatPer100(null)).toBe('–');
    expect(formatPer100(3.25)).toBe('3,3');
    expect(formatPer100(50)).toBe('50');
    expect(formatChipsBb(1650, 300)).toBe('5,5');
    expect(formatChipsBb(19680, 1200)).toBe('16,4');
    expect(formatDateKey('2026-10-13')).toBe('13.10.2026');
    expect(formatPlayedAt('2026-10-13 15:46:28')).toBe('13.10.2026 15:46');
    expect(streetLabel('turn')).toBe('Turn');
  });

  it('labels hand-history actions in BB', () => {
    expect(reviewActionLabel({ action: 'fold', amount: 0, to: null, allIn: false }, 100)).toBe('Fold');
    expect(reviewActionLabel({ action: 'check', amount: 0, to: null, allIn: false }, 100)).toBe('Check');
    expect(reviewActionLabel({ action: 'call', amount: 150, to: null, allIn: false }, 100)).toBe('Call 1,5 BB');
    expect(reviewActionLabel({ action: 'bet', amount: 300, to: null, allIn: true }, 100)).toBe('Bet 3 BB · All-in');
    expect(reviewActionLabel({ action: 'raise', amount: 500, to: 600, allIn: false }, 100)).toBe('Raise auf 6 BB');
  });
```

In `src/ui/components/PokerTable.test.tsx` den Import `import { PokerTable, PreflopTable } from './PokerTable';` ersetzen durch `import { PokerTable, PreflopTable, TableView } from './PokerTable';` und im letzten `describe` vor dessen schließender Zeile `});` einfügen:
```tsx
  it('shows the board and works without hero cards (hand review)', () => {
    const model = { seats: [], playersBehind: 0, potBb: 12.5, heroStackBb: 30 };
    render(<TableView model={model} cards={[]} board={[parseCard('Kh'), parseCard('5s'), parseCard('4d')]} situation="Flop" info="Schritt 2 von 9" />);
    const board = screen.getByLabelText('Board');
    expect(board.querySelectorAll('.playing-card')).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Herz König' })).toBeTruthy();
    expect(screen.getByText('Pot 12,5 BB')).toBeTruthy();
    expect(screen.getByText('Schritt 2 von 9')).toBeTruthy();
  });
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/ui/replay-model.test.ts src/ui/components/ReviewDecisionPanel.test.tsx src/app/format.test.ts src/ui/components/PokerTable.test.tsx`
Expected: FAIL (`Failed to resolve import "./replay-model"` bzw. `"./ReviewDecisionPanel"`, `formatPer100 is not a function`, `TableView` ist kein gültiges Element).

- [ ] **Step 3: Implementierung**

`src/app/format.ts`: nach `import type { XpResult } from '../game/xp';` einfügen:
```ts
import type { ActionType as ReviewActionType, Street as ReviewStreet } from '../review/parse';
```
und ans Dateiende anhängen:
```ts
const per100Number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
/** "Fehler pro 100 Hände", e.g. 3,2; a dash without hands. */
export const formatPer100 = (value: number | null): string => (value === null ? '–' : per100Number.format(value));

/** Chips as BB with the decimal comma, e.g. 1.650 chips at BB 300 → "5,5". */
export const formatChipsBb = (chips: number, bigBlind: number): string => formatBb(chips / bigBlind);

/** "2026-10-13" → "13.10.2026". */
export const formatDateKey = (key: string): string => `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)}`;

/** "2026-10-13 15:46:28" → "13.10.2026 15:46". */
export const formatPlayedAt = (playedAt: string): string => `${formatDateKey(playedAt.slice(0, 10))} ${playedAt.slice(11, 16)}`;

export type ReviewActionInput = { action: ReviewActionType; amount: number; to: number | null; allIn: boolean };

const STREET_LABELS: Record<ReviewStreet, string> = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };
export const streetLabel = (street: ReviewStreet): string => STREET_LABELS[street];

/** A hand-history action in German: "Fold", "Check", "Call 1,5 BB", "Bet 3 BB", "Raise auf 6 BB", with " · All-in". */
export function reviewActionLabel(a: ReviewActionInput, bigBlind: number): string {
  const bb = (chips: number) => `${formatChipsBb(chips, bigBlind)} BB`;
  const text =
    a.action === 'fold'
      ? 'Fold'
      : a.action === 'check'
        ? 'Check'
        : a.action === 'call'
          ? `Call ${bb(a.amount)}`
          : a.action === 'bet'
            ? `Bet ${bb(a.amount)}`
            : `Raise auf ${bb(a.to ?? a.amount)}`;
  return a.allIn && a.action !== 'fold' && a.action !== 'check' ? `${text} · All-in` : text;
}
```

`src/ui/components/PokerTable.tsx` vollständig ersetzen (`TableView` exportiert, Hero-Karten dürfen fehlen, Board in der Mitte):
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
  return { left: `${50 + 40 * Math.cos(angle)}%`, top: `${50 + 41 * Math.sin(angle)}%` };
}

function behindText(n: number): string {
  if (n === 0) return 'du handelst als Letzter';
  if (n === 1) return 'noch 1 Spieler hinter dir';
  return `noch ${n} Spieler hinter dir`;
}

export type TableViewProps = {
  model: TableModel;
  /** The hero's cards; empty when unknown. */
  cards: readonly Card[];
  situation: string;
  info: string;
  /** Community cards, shown in the middle (hand review). */
  board?: readonly Card[];
};

export function TableView({ model, cards, situation, info, board = [] }: TableViewProps) {
  // High card first, the way players read their hand.
  const shown = [...cards].sort((a, b) => rankOf(b) - rankOf(a));
  return (
    <section className="poker-table" aria-label="Pokertisch">
      <div className="poker-table__stage">
        <div className="poker-table__felt">
          <div className="poker-table__pot">Pot {formatBb(model.potBb)} BB</div>
          {board.length > 0 && (
            <div className="poker-table__board" aria-label="Board">
              {board.map((card) => (
                <PlayingCard key={card} card={card} />
              ))}
            </div>
          )}
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

`src/ui/components/PokerTable.css`: vor der Regel `.poker-table__cards {` einfügen:
```css
.poker-table__board {
  display: flex;
  gap: 4px;
}

.poker-table__board .playing-card {
  width: 34px;
  height: 48px;
}

.poker-table__board .playing-card__rank,
.poker-table__board .playing-card__suit {
  font-size: 14px;
}

```

`src/ui/components/FeedbackPanel.tsx` vollständig ersetzen:
```tsx
import type { ReactNode } from 'react';
import { actionLabel, aggressiveWord, evLine, formatEv, verdictLabel, xpSummary } from '../../app/format';
import type { AnswerResult } from '../../app/game-store';
import { handName } from '../../engine/cards';
import type { PositionComparison } from '../../engine/position-compare';
import { POSITION_LABELS } from '../../engine/positions';
import type { ChartCell, Grade, Spot, Verdict } from '../../engine/pushfold';
import { CELL_CLASS, PUSHFOLD_LEGEND, cellText } from './chart-cells';
import { PositionRow } from './PositionRow';
import { RangeChart } from './RangeChart';
import './Feedback.css';

export type PushFoldVerdictProps = {
  spot: Spot;
  grade: Grade;
  chart: readonly ChartCell[];
  comparison: PositionComparison;
  /** Overrides the verdict heading and its colour, e.g. for the satellite hint in the hand review. */
  title?: string;
  tone?: Verdict;
  /** Lines after the EV line: XP in the training, notes in the hand review. */
  extra?: ReactNode;
};

/** Verdict, EV, push/fold chart with the hand marked and the position comparison. */
export function PushFoldVerdict({ spot, grade, chart, comparison, title, tone, extra }: PushFoldVerdictProps) {
  const word = aggressiveWord(spot.kind);
  const label = (cell: ChartCell) => cellText(cell, word);
  const items = comparison.entries.map((entry) => ({
    position: entry.position,
    cellClass: CELL_CLASS[entry.cell],
    title: `${POSITION_LABELS[entry.position]}: ${label(entry.cell)} (${formatEv(entry.ev)})`,
    current: entry.isHero,
  }));

  return (
    <section className={`feedback panel feedback--${tone ?? grade.verdict}`} aria-live="polite">
      <h2 className="feedback__verdict">{title ?? verdictLabel(grade.verdict)}</h2>
      <p className="feedback__line">
        Deine Wahl: {actionLabel(grade.chosen)}
        {grade.verdict === 'wrong' ? ` · Besser: ${actionLabel(grade.best)}` : ''}
      </p>
      <p className="feedback__line feedback__ev">{evLine(spot.kind, grade.evAggressive)}</p>
      {extra}
      <h3 className="feedback__heading">
        {handName(spot.hand)} bei {spot.stack} BB – Range für diesen Spot
      </h3>
      <RangeChart cells={chart} heroHand={spot.hand} legend={PUSHFOLD_LEGEND} cellClass={(cell) => CELL_CLASS[cell]} cellLabel={label} />
      <h3 className="feedback__heading">Dieselbe Hand auf anderen Positionen</h3>
      <PositionRow items={items} summary={comparison.summary} />
    </section>
  );
}

export function FeedbackPanel({ result, spot }: { result: AnswerResult; spot: Spot }) {
  const { grade, xp, rank } = result.outcome;
  return (
    <PushFoldVerdict
      spot={spot}
      grade={grade}
      chart={result.chart}
      comparison={result.comparison}
      extra={
        <>
          <p className="feedback__line feedback__xp">{xpSummary(xp)}</p>
          {rank.rankUp && <p className="feedback__rankup">Aufgestiegen: {rank.after}!</p>}
        </>
      }
    />
  );
}
```

`src/ui/components/PreflopFeedbackPanel.tsx` vollständig ersetzen:
```tsx
import type { ReactNode } from 'react';
import { preflopSpotTitle, verdictLabel, xpSummary } from '../../app/format';
import type { PreflopAnswerResult } from '../../app/game-store';
import { handName } from '../../engine/cards';
import { POSITION_LABELS } from '../../engine/positions';
import { type PreflopCell, type PreflopComparison, type PreflopGrade, preflopActionWord } from '../../engine/preflop/grading';
import type { PreflopAction, PreflopSpot } from '../../engine/preflop/spots';
import type { Verdict } from '../../engine/pushfold';
import { PREFLOP_CELL_CLASS, preflopCellText, preflopLegend } from './chart-cells';
import { PositionRow } from './PositionRow';
import { RangeChart } from './RangeChart';
import './Feedback.css';

export type PreflopVerdictProps = {
  spot: PreflopSpot;
  grade: PreflopGrade;
  cells: readonly PreflopCell[];
  /** The chart's learning sentence. */
  note: string;
  comparison: PreflopComparison;
  /** Overrides the verdict heading and its colour, e.g. for the satellite hint in the hand review. */
  title?: string;
  tone?: Verdict;
  /** Lines after "Richtige Aktion": XP in the training, notes in the hand review. */
  extra?: ReactNode;
};

/** Verdict, your and the correct action, four-colour chart, learning sentence, hint and position comparison. */
export function PreflopVerdict({ spot, grade, cells, note, comparison, title, tone, extra }: PreflopVerdictProps) {
  const word = (action: PreflopAction) => preflopActionWord(action, spot.stack);
  const label = (cell: PreflopCell) => preflopCellText(cell, spot.kind, spot.stack);
  const items = comparison.entries.map((entry) => ({
    position: entry.position,
    cellClass: PREFLOP_CELL_CLASS[entry.cell],
    title: `${POSITION_LABELS[entry.position]}: ${label(entry.cell)}`,
    current: entry.isCurrent,
  }));

  return (
    <section className={`feedback panel feedback--${tone ?? grade.verdict}`} aria-live="polite">
      <h2 className="feedback__verdict">{title ?? verdictLabel(grade.verdict)}</h2>
      <p className="feedback__line">Deine Wahl: {word(grade.chosen)}</p>
      <p className="feedback__line">
        Richtige Aktion: {word(grade.best)}
        {grade.alternative ? ` (auch okay: ${word(grade.alternative)})` : ''}
      </p>
      {extra}
      <h3 className="feedback__heading">
        {handName(spot.hand)} · {preflopSpotTitle(spot)} · {spot.stack} BB
      </h3>
      <RangeChart
        cells={cells}
        heroHand={spot.hand}
        legend={preflopLegend(spot.kind)}
        cellClass={(cell) => PREFLOP_CELL_CLASS[cell]}
        cellLabel={label}
      />
      <p className="feedback__note">{note}</p>
      <p className="feedback__hint muted">Standard-Chart, kein Solver-Ergebnis</p>
      <h3 className="feedback__heading">
        {comparison.axis === 'hero' ? 'Dieselbe Hand auf anderen Positionen' : 'Dieselbe Hand gegen andere Opener'}
      </h3>
      <PositionRow items={items} summary={comparison.summary} />
    </section>
  );
}

export function PreflopFeedbackPanel({ result }: { result: PreflopAnswerResult }) {
  const { grade, xp, rank, record } = result.outcome;
  return (
    <PreflopVerdict
      spot={record.spot}
      grade={grade}
      cells={result.cells}
      note={result.note}
      comparison={result.comparison}
      extra={
        <>
          <p className="feedback__line feedback__xp">{xpSummary(xp)}</p>
          {rank.rankUp && <p className="feedback__rankup">Aufgestiegen: {rank.after}!</p>}
        </>
      }
    />
  );
}
```

`src/ui/replay-model.ts` anlegen:
```ts
import { formatChipsBb, reviewActionLabel, streetLabel } from '../app/format';
import { cardName } from '../engine/cards';
import { POSITIONS, POSITION_LABELS, seatOf } from '../engine/positions';
import type { HeroDecision } from '../review/analysis';
import { type PlayerState, type TableState, walkHand } from '../review/hand-model';
import type { ActionEvent, HandEvent, ParsedHand } from '../review/parse';
import type { SeatModel, SeatRole, TableModel } from './table-model';

export type ReplayStep = {
  /** Null for the start (cards dealt, blinds and antes posted). */
  eventIndex: number | null;
  /** The table shown for this step: before a hero action (the spot he faced), after every other event. */
  state: TableState;
  text: string;
  /** Set when the step is a hero decision. */
  decision: HeroDecision | null;
};

const round1 = (x: number) => Math.round(x * 10) / 10;
const isPost = (e: HandEvent) => e.type === 'ante' || e.type === 'smallBlind' || e.type === 'bigBlind';

function nameOf(state: TableState, player: string): string {
  const p = state.players.find((x) => x.name === player);
  if (!p || p.isHero) return 'Du';
  return p.position ? POSITION_LABELS[p.position] : player;
}

export function describeEvent(event: HandEvent, state: TableState, bigBlind: number): string {
  const bb = (chips: number) => `${formatChipsBb(chips, bigBlind)} BB`;
  switch (event.type) {
    case 'action':
      return `${nameOf(state, event.player)}: ${reviewActionLabel(event, bigBlind)}`;
    case 'board':
      return `${streetLabel(event.street)}: ${event.cards.map(cardName).join(' ')}`;
    case 'uncalled':
      return `${nameOf(state, event.player)}: ${bb(event.amount)} zurück`;
    case 'show':
      return `${nameOf(state, event.player)} zeigt ${event.cards.map(cardName).join(' ')}`;
    case 'collect':
      return `${nameOf(state, event.player)} gewinnt ${bb(event.amount)}`;
    default:
      return '';
  }
}

export function replaySteps(hand: ParsedHand, decisions: readonly HeroDecision[]): ReplayStep[] {
  const states = walkHand(hand);
  const firstPlay = hand.events.findIndex((e) => !isPost(e));
  const start = firstPlay < 0 ? states[states.length - 1] : states[firstPlay];
  const steps: ReplayStep[] = [{ eventIndex: null, state: start, text: 'Karten verteilt', decision: null }];
  hand.events.forEach((event, i) => {
    if (isPost(event)) return;
    const decision = decisions.find((d) => d.eventIndex === i) ?? null;
    steps.push({
      eventIndex: i,
      state: decision ? states[i] : states[i + 1],
      text: decision ? `Du bist dran – deine Wahl: ${reviewActionLabel(event as ActionEvent, hand.bigBlind)}` : describeEvent(event, states[i], hand.bigBlind),
      decision,
    });
  });
  return steps;
}

function roleOf(p: PlayerState, state: TableState): SeatRole {
  if (p.isHero) return 'hero';
  if (p.folded) return 'folded';
  return p.name === state.lastAggressor ? 'raiser' : 'waiting';
}

/** The replay table: only seated players, placed around the hero by their 8-max position. */
export function replayTableModel(state: TableState, bigBlind: number): TableModel {
  const hero = state.players.find((p) => p.isHero);
  const heroSeat = hero?.position ? seatOf(hero.position) : 0;
  // Heads-up the small blind has the button.
  const buttonPosition = state.players.some((p) => p.position === 'BTN') ? 'BTN' : 'SB';
  const seats: SeatModel[] = state.players
    .filter((p) => p.position !== null)
    .map((p) => {
      const position = p.position!;
      return {
        position,
        label: POSITION_LABELS[position],
        role: roleOf(p, state),
        offset: (seatOf(position) - heroSeat + POSITIONS.length) % POSITIONS.length,
        isButton: position === buttonPosition,
        betBb: round1(p.streetBet / bigBlind),
        anteBb: 0,
        betLabel: p.allIn && p.streetBet > 0 ? 'All-in' : null,
        stackBb: round1(p.stack / bigBlind),
      };
    });
  return {
    seats,
    playersBehind: 0,
    potBb: round1(state.pot / bigBlind),
    heroStackBb: round1((hero?.stack ?? 0) / bigBlind),
  };
}
```

`src/ui/components/ReviewDecisionPanel.tsx` anlegen:
```tsx
import { formatBb, formatChipsBb, reviewActionLabel, streetLabel } from '../../app/format';
import { comparePositions } from '../../engine/position-compare';
import { chartFor } from '../../engine/preflop/charts';
import { comparePreflopPositions, preflopCells } from '../../engine/preflop/grading';
import { chart } from '../../engine/pushfold';
import type { PushFoldData } from '../../engine/pushfold-data';
import type { HeroDecision } from '../../review/analysis';
import { UNRATED_TEXT } from '../../review/preflop';
import { SATELLITE_HINT, decisionOutcome } from '../../review/summary';
import type { TournamentKind } from '../../review/tournament-kind';
import { PushFoldVerdict } from './FeedbackPanel';
import { PreflopVerdict } from './PreflopFeedbackPanel';
import './Feedback.css';

type Props = { decision: HeroDecision; kind: TournamentKind; bigBlind: number; data: PushFoldData };

/** Pot, amount to call and stack before the hero acted, in BB. */
function Numbers({ decision, bigBlind }: { decision: HeroDecision; bigBlind: number }) {
  const bb = (chips: number) => `${formatChipsBb(chips, bigBlind)} BB`;
  return (
    <p className="feedback__line feedback__ev">
      {streetLabel(decision.street)} · Pot {bb(decision.pot)} · zu callen {bb(decision.toCall)} · Stack {bb(decision.stack)}
    </p>
  );
}

export function ReviewDecisionPanel({ decision, kind, bigBlind, data }: Props) {
  const { rating } = decision;
  const action = <p className="feedback__line">Deine Aktion: {reviewActionLabel(decision, bigBlind)}</p>;
  if (rating.model === 'unrated') {
    return (
      <section className="feedback panel" aria-live="polite">
        <h2 className="feedback__verdict">Nicht bewertet</h2>
        <p className="feedback__line">{UNRATED_TEXT[rating.reason]}</p>
        {action}
        <Numbers decision={decision} bigBlind={bigBlind} />
      </section>
    );
  }
  const hint = decisionOutcome(decision, kind) === 'hint';
  const title = hint ? 'Hinweis' : undefined;
  const tone = hint ? 'close' : undefined;
  const effective = `${formatBb(Math.round(rating.effectiveBb * 10) / 10)} BB effektiv`;
  if (rating.model === 'pushfold') {
    return (
      <PushFoldVerdict
        spot={rating.spot}
        grade={rating.grade}
        chart={chart(data, rating.spot)}
        comparison={comparePositions(data, rating.spot)}
        title={title}
        tone={tone}
        extra={
          <>
            {hint && <p className="feedback__line">{SATELLITE_HINT}</p>}
            <Numbers decision={decision} bigBlind={bigBlind} />
            <p className="feedback__line muted">Push/Fold-Daten · {effective}</p>
          </>
        }
      />
    );
  }
  const chartData = chartFor(rating.spot);
  return (
    <PreflopVerdict
      spot={rating.spot}
      grade={rating.grade}
      cells={preflopCells(chartData)}
      note={chartData.note}
      comparison={comparePreflopPositions(rating.spot)}
      title={title}
      tone={tone}
      extra={
        <>
          {hint && <p className="feedback__line">{SATELLITE_HINT}</p>}
          <Numbers decision={decision} bigBlind={bigBlind} />
          <p className="feedback__line muted">
            {rating.approximation ? `Näherung: Chart für ${rating.spot.stack} BB` : `Chart für ${rating.spot.stack} BB`} · {effective}
          </p>
        </>
      }
    />
  );
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/ui/replay-model.test.ts src/ui/components/ReviewDecisionPanel.test.tsx src/app/format.test.ts src/ui/components/PokerTable.test.tsx src/ui/components/FeedbackPanel.test.tsx src/ui/components/PreflopFeedbackPanel.test.tsx` → Expected: PASS.

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/app/format.ts src/app/format.test.ts src/ui/replay-model.ts src/ui/replay-model.test.ts src/ui/components/PokerTable.tsx src/ui/components/PokerTable.css src/ui/components/PokerTable.test.tsx src/ui/components/FeedbackPanel.tsx src/ui/components/PreflopFeedbackPanel.tsx src/ui/components/ReviewDecisionPanel.tsx src/ui/components/ReviewDecisionPanel.test.tsx
git commit -m "feat(ui): Wiedergabe-Modell, Tisch mit Board und Urteil je Hand-Entscheidung aus den Trainings-Bausteinen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Hand-Review-Bildschirme – Übersicht, Import, Turnier, Hand, Kachel

**Files:**
- Create: `src/ui/components/FilterGroup.tsx`, `src/ui/screens/ReviewScreen.tsx`, `src/ui/screens/ReviewOverview.tsx`, `src/ui/screens/ReviewImport.tsx`, `src/ui/screens/ReviewTournament.tsx`, `src/ui/screens/ReviewHand.tsx`, `src/ui/screens/review.css`, `src/ui/screens/ReviewScreen.test.tsx`
- Modify: `src/ui/components/TrendChart.tsx`, `src/ui/components/ActionBar.tsx`, `src/ui/screens/PreflopScreen.tsx`, `src/ui/screens/HomeScreen.tsx`, `src/ui/App.tsx`
- Test: `src/ui/App.test.tsx` (ergänzen); `PreflopScreen.test.tsx` und `StatsScreen.test.tsx` bleiben unverändert grün

**Interfaces:**
- Consumes: `useReview`, `useReviewStore`, `OpenTournament`, `ReviewHand` (Task 7); `ImportFile`, `ImportSummary` (Task 6); `errorsPer100`, `weeklyErrorTrend`, `handOutcome`, `handSeverity`, `matchesFilter`, `DecisionOutcome`, `HandFilter` (Task 4); `TOURNAMENT_KINDS`, `TOURNAMENT_KIND_LABELS`, `TournamentKind` (Task 2); `positionsOf` (Task 2); `replaySteps`, `replayTableModel`, `TableView`, `ReviewDecisionPanel`, `formatPer100`, `formatPlayedAt`, `formatChipsBb` (Task 8); `TrainingLayout`, `formatCount`, `localDateKey`, `handClassOf`, `handName`, `POSITION_LABELS`
- Produces:
  - `src/ui/components/TrendChart.tsx`: `type TrendBar = { key: string; label: string; value: number | null; text: string }`, `TrendBars({ bars, ariaLabel })`, `shortDate(key)`; `TrendChart({ points })` unverändert in der Ausgabe
  - `src/ui/components/FilterGroup.tsx`: `type Option<T> = { value: T; label: string }`, `FilterGroup<T>({ label, options, value, disabled, onChange })` (aus `PreflopScreen.tsx` verschoben)
  - `src/ui/components/ActionBar.tsx`: `isTypingTarget(target: EventTarget | null): boolean` wird exportiert
  - `Screen` (in `HomeScreen.tsx`) um `'review'` erweitert; Kachel „Hand-Review“ mit Button „Hände prüfen“ (nie gesperrt; der Import selbst ist im Nur-Lesen-Modus gesperrt)
  - `ReviewScreen({ onBack: () => void; now?: () => Date })` mit den Ansichten Übersicht (`ReviewOverview({ onImport, onOpen, now })`), Import (`ReviewImport({ onDone })`, `ImportBalance({ summary })`), Turnier (`ReviewTournament({ open, onOpenHand, onSetKind, onDelete })`, `OUTCOME_LABELS`, `sortedHands(hands, kind)`) und Hand (`ReviewHand({ item, kind })`)

- [ ] **Step 1: Failing Tests schreiben**

`src/ui/screens/ReviewScreen.test.tsx` anlegen:
```tsx
// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import bounty from '../../review/fixtures/bounty.txt?raw';
import dailyClassic from '../../review/fixtures/daily-classic.txt?raw';
import steps from '../../review/fixtures/step-satellites.txt?raw';
import { renderWithStore } from '../test-utils';
import { ReviewScreen } from './ReviewScreen';

afterEach(() => {
  vi.restoreAllMocks();
});

const now = () => new Date(2026, 9, 13, 18, 0);

async function withHands(text = dailyClassic) {
  const utils = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />);
  await act(async () => {
    await utils.loaded;
    await utils.review.importText(text);
  });
  return utils;
}

async function openTournament(name: string, index = 0) {
  fireEvent.click(screen.getAllByRole('button', { name })[index]);
  await screen.findByRole('heading', { name });
}

describe('ReviewScreen overview and import', () => {
  it('starts empty and imports pasted hands with a balance', async () => {
    renderWithStore(<ReviewScreen onBack={() => {}} now={now} />);
    expect(await screen.findByText('Noch keine Hände importiert.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hände importieren' }));
    fireEvent.change(screen.getByLabelText('Hände einfügen'), { target: { value: `${dailyClassic}\n\nkein Pokertext` } });
    fireEvent.click(screen.getByRole('button', { name: 'Eingefügte Hände importieren' }));
    const balance = await screen.findByRole('region', { name: 'Bilanz' });
    expect(within(balance).getByText('Importiert: 6 · Schon vorhanden: 0 · Übersprungen: 0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Zur Übersicht' }));
    const row = screen.getByRole('row', { name: /Daily Classic \$1/ });
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['13.10.2026', 'Normal', '6', '3', '–', '50']);
    expect(screen.getByRole('img', { name: 'Fehler pro 100 Hände der letzten 8 Wochen' })).toBeTruthy();
  });

  it('imports files and lists skipped files with their reason', async () => {
    const { loaded } = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />);
    await act(() => loaded);
    fireEvent.click(screen.getByRole('button', { name: 'Hände importieren' }));
    const files = [new File([bounty], 'bounty.txt', { type: 'text/plain' }), new File(['x'], 'bild.png')];
    fireEvent.change(screen.getByLabelText('Hand-Historien'), { target: { files } });
    expect(await screen.findByText('Importiert: 1 · Schon vorhanden: 0 · Übersprungen: 1')).toBeTruthy();
    expect(screen.getByText('Dateityp nicht unterstützt (nur .txt und .zip): 1')).toBeTruthy();
  });

  it('accepts files dropped onto the drop zone', async () => {
    const { loaded } = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />);
    await act(() => loaded);
    fireEvent.click(screen.getByRole('button', { name: 'Hände importieren' }));
    const zone = screen.getByText(/Am PC auch per Drag & Drop/).parentElement!;
    fireEvent.dragOver(zone);
    expect(zone.className).toContain('review-drop--active');
    fireEvent.drop(zone, { dataTransfer: { files: [new File([bounty], 'bounty.txt')] } });
    expect(await screen.findByText('Importiert: 1 · Schon vorhanden: 0 · Übersprungen: 0')).toBeTruthy();
  });

  it('blocks the import in read-only mode but still shows the archive', async () => {
    const { loaded } = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />, { info: { readOnly: true } });
    await act(() => loaded);
    expect((screen.getByRole('button', { name: 'Hände importieren' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Nur-Lesen-Modus: Bitte die App aktualisieren, um Hände zu importieren.')).toBeTruthy();
  });

  it('reports unreadable archive entries', async () => {
    const { memoryReviewBackend } = await import('../../review/archive');
    const { loaded } = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />, {
      reviewBackend: memoryReviewBackend({ 'tournament:1': 'kaputt' }),
    });
    await act(() => loaded);
    expect(screen.getByRole('alert').textContent).toBe('1 Eintrag im Hand-Archiv ist nicht lesbar und wurde übersprungen (nicht gelöscht).');
  });
});

describe('ReviewScreen tournament', () => {
  it('lists the hands worst first and filters them', async () => {
    await withHands();
    await openTournament('Daily Classic $1');
    const hands = () => screen.getAllByRole('button', { name: /^\d\d:\d\d/ }).map((b) => b.textContent);
    expect(hands()).toEqual([
      '13:15K6o · BTNFehler',
      '13:3673s · BBFehler',
      '15:10A4o · HJFehler',
      '13:0964o · UTG+1Richtig',
      '15:46AQs · CORichtig',
      '13:3654s · UTGNicht bewertet',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Nur Fehler' }));
    expect(hands()).toHaveLength(3);
  });

  it('changes the kind: errors become hints and are not counted', async () => {
    await withHands();
    await openTournament('Daily Classic $1');
    fireEvent.change(screen.getByLabelText('Art des Turniers'), { target: { value: 'satellit' } });
    await waitFor(() => expect(screen.getAllByText('Hinweis')).toHaveLength(3));
    expect(screen.getByText(/· 0 Fehler ·/)).toBeTruthy();
  });

  it('deletes a tournament after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { review } = await withHands(bounty);
    await openTournament('Bounty Hunters $2.50');
    fireEvent.click(screen.getByRole('button', { name: 'Turnier löschen' }));
    expect(await screen.findByText('Noch keine Hände importiert.')).toBeTruthy();
    expect(review.getSnapshot().tournaments).toEqual([]);
  });
});

describe('ReviewScreen hand view', () => {
  it('shows the first decision with the chart verdict next to the replay table', async () => {
    await withHands();
    await openTournament('Daily Classic $1');
    fireEvent.click(screen.getByRole('button', { name: /K6o · BTN/ }));
    expect(screen.getByLabelText('Pokertisch')).toBeTruthy();
    expect(screen.getByText('Du bist dran – deine Wahl: Raise auf 3 BB')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Falsch' })).toBeTruthy();
    expect(screen.getByText('Standard-Chart, kein Solver-Ergebnis')).toBeTruthy();
    expect(screen.getByText('Chart für 100 BB · 92 BB effektiv')).toBeTruthy();
    expect(screen.getByText('Preflop · Pot 2,5 BB · zu callen 1 BB · Stack 92 BB')).toBeTruthy();
  });

  it('rates push/fold spots with the push/fold chart', async () => {
    await withHands();
    await openTournament('Daily Classic $1');
    fireEvent.click(screen.getByRole('button', { name: /A4o · HJ/ }));
    expect(screen.getByText('Push/Fold-Daten · 16,4 BB effektiv')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'A4o bei 16 BB – Range für diesen Spot' })).toBeTruthy();
  });

  it('steps through the hand and jumps between decisions with ← and →', async () => {
    await withHands(bounty);
    await openTournament('Bounty Hunters $2.50');
    fireEvent.click(screen.getByRole('button', { name: /66 · UTG/ }));
    expect(screen.getByRole('heading', { name: 'Richtig' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('Du bist dran – deine Wahl: Bet 4,4 BB')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Nicht bewertet' })).toBeTruthy();
    expect(screen.getByText('Postflop-Bewertung folgt')).toBeTruthy();
    expect(screen.getByLabelText('Board')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Schritt vor' }));
    expect(screen.getByText('CO: Call 4,4 BB')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('Du bist dran – deine Wahl: Bet 4,4 BB')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('Du bist dran – deine Wahl: Raise auf 3 BB')).toBeTruthy();
    expect((screen.getByRole('button', { name: '← Entscheidung' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '← Turnier' }));
    expect(screen.getByRole('heading', { name: 'Bounty Hunters $2.50' })).toBeTruthy();
  });

  it('shows the satellite hint instead of "Falsch"', async () => {
    await withHands(steps);
    // Two Step tournaments with the same name; the older one (second row) holds the KJo hand.
    await openTournament('$0.50 Step to The Weekender', 1);
    fireEvent.click(screen.getByRole('button', { name: /KJo · SB/ }));
    expect(screen.getByRole('heading', { name: 'Hinweis' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Falsch' })).toBeNull();
    expect(screen.getByText('Satellit/Bounty – Standard-Chart nur bedingt gültig')).toBeTruthy();
    expect(screen.getByText('Näherung: Chart für 40 BB · 25,4 BB effektiv')).toBeTruthy();
  });
});
```

In `src/ui/App.test.tsx` im `describe('App', …)` vor dessen schließender Zeile `});` einfügen:
```tsx
  it('opens the hand review from its tile, also in read-only mode', async () => {
    renderWithStore(<App />, { info: { readOnly: true } });
    const button = screen.getByRole('button', { name: 'Hände prüfen' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(await screen.findByText('Nur-Lesen-Modus: Bitte die App aktualisieren, um Hände zu importieren.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    expect(screen.getByRole('button', { name: 'Hände prüfen' })).toBeTruthy();
  });
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/ui/screens/ReviewScreen.test.tsx src/ui/App.test.tsx`
Expected: FAIL (`Failed to resolve import "./ReviewScreen"`; im App-Test fehlt der Button „Hände prüfen“).

- [ ] **Step 3: Implementierung**

`src/ui/components/ActionBar.tsx`: die Zeile `function isTypingTarget(target: EventTarget | null): boolean {` ersetzen durch:
```tsx
/** Shortcuts never fire while the player types into a field. */
export function isTypingTarget(target: EventTarget | null): boolean {
```

`src/ui/components/FilterGroup.tsx` anlegen (unverändert aus `PreflopScreen.tsx` verschoben und exportiert):
```tsx
export type Option<T> = { value: T; label: string };

type FilterGroupProps<T extends string | number> = {
  label: string;
  options: readonly Option<T>[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
};

/** A labelled row of toggle buttons (one is pressed). */
export function FilterGroup<T extends string | number>({ label, options, value, disabled, onChange }: FilterGroupProps<T>) {
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
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

`src/ui/screens/PreflopScreen.tsx` vollständig ersetzen (nutzt jetzt `FilterGroup` aus `components`):
```tsx
import { useCallback, useEffect } from 'react';
import { PREFLOP_KINDS, PREFLOP_KIND_LABELS, type PreflopAction, STACK_DEPTHS } from '../../engine/preflop/spots';
import { type PreflopFilter, preflopFilterOf } from '../../game/preflop-filter';
import { PreflopActionBar } from '../components/ActionBar';
import { FilterGroup, type Option } from '../components/FilterGroup';
import { PreflopTable } from '../components/PokerTable';
import { PreflopFeedbackPanel } from '../components/PreflopFeedbackPanel';
import { StatusBar } from '../components/StatusBar';
import { TrainingLayout } from '../components/TrainingLayout';
import { useGame, useGameStore } from '../GameContext';
import './screens.css';

const KIND_OPTIONS: Option<PreflopFilter['kind']>[] = [
  { value: 'all', label: 'Alle' },
  ...PREFLOP_KINDS.map((kind) => ({ value: kind, label: PREFLOP_KIND_LABELS[kind] })),
];
const STACK_OPTIONS: Option<PreflopFilter['stack']>[] = [
  { value: 'all', label: 'Alle' },
  ...STACK_DEPTHS.map((stack) => ({ value: stack, label: `${stack} BB` })),
];

export function filterSummary(filter: PreflopFilter): string {
  const kind = filter.kind === 'all' ? 'alle Spots' : PREFLOP_KIND_LABELS[filter.kind];
  const stack = filter.stack === 'all' ? 'alle Stacks' : `${filter.stack} BB`;
  return `${kind} · ${stack}`;
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
  // The store does not block filter changes in read-only mode, so the controls are disabled instead.
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
      {/* Collapsed by default so table and action buttons fit on a phone screen. */}
      <details className="panel filters" aria-label="Filter">
        <summary className="filters__summary">Filter: {filterSummary(filter)}</summary>
        <FilterGroup label="Spot-Typ" options={KIND_OPTIONS} value={filter.kind} disabled={locked} onChange={(kind) => setFilter({ kind })} />
        <FilterGroup label="Stack" options={STACK_OPTIONS} value={filter.stack} disabled={locked} onChange={(stack) => setFilter({ stack })} />
      </details>
      {current && (
        <TrainingLayout
          main={
            <>
              <PreflopTable key={current.shownAt} spot={current.spot} cards={current.cards} />
              <PreflopActionBar spot={current.spot} answered={game.preflopLast !== null} onAction={onAction} onNext={onNext} />
            </>
          }
          side={game.preflopLast && <PreflopFeedbackPanel result={game.preflopLast} />}
        />
      )}
    </>
  );
}
```

`src/ui/components/TrendChart.tsx` vollständig ersetzen:
```tsx
import { formatPercent } from '../../app/format';
import type { WeekPoint } from '../../game/stats';

const WIDTH = 320;
const HEIGHT = 150;
const CHART_TOP = 20;
const CHART_BOTTOM = 120;
const BAR = 26;

export const shortDate = (key: string) => `${key.slice(8, 10)}.${key.slice(5, 7)}.`;

/** One bar: `value` between 0 and 1 (null draws no bar), `text` above it, `label` below. */
export type TrendBar = { key: string; label: string; value: number | null; text: string };

export function TrendBars({ bars, ariaLabel }: { bars: readonly TrendBar[]; ariaLabel: string }) {
  const slot = WIDTH / bars.length;
  return (
    <svg className="trend-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel}>
      <line x1="0" y1={CHART_BOTTOM} x2={WIDTH} y2={CHART_BOTTOM} className="trend-chart__axis" />
      {bars.map((bar, i) => {
        const x = i * slot + (slot - BAR) / 2;
        const height = bar.value === null ? 0 : bar.value * (CHART_BOTTOM - CHART_TOP);
        return (
          <g key={bar.key}>
            {bar.value !== null && <rect x={x} y={CHART_BOTTOM - height} width={BAR} height={height} rx="3" className="trend-chart__bar" />}
            <text x={x + BAR / 2} y={CHART_BOTTOM - height - 5} textAnchor="middle" className="trend-chart__value">
              {bar.text}
            </text>
            <text x={x + BAR / 2} y={HEIGHT - 12} textAnchor="middle" className="trend-chart__label">
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function TrendChart({ points }: { points: readonly WeekPoint[] }) {
  const bars = points.map((p) => ({
    key: p.weekStart,
    label: shortDate(p.weekStart),
    value: p.accuracy.rate,
    text: formatPercent(p.accuracy.rate),
  }));
  return <TrendBars bars={bars} ariaLabel="Trefferquote der letzten 8 Wochen" />;
}
```

`src/ui/screens/review.css` anlegen:
```css
.review-intro,
.review-import,
.review-tournament,
.review-progress,
.review-balance {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.review-intro p,
.review-import p,
.review-tournament p,
.review-progress p,
.review-balance p {
  margin: 0;
}

.review-title {
  margin: 0;
  font-size: 18px;
  color: var(--gold);
}

.review-file {
  display: none;
}

.review-drop {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 2px dashed var(--rule);
  border-radius: var(--radius);
}

.review-drop--active {
  border-color: var(--gold);
}

.review-paste {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.review-paste textarea {
  width: 100%;
  min-height: 120px;
  font: 13px/1.4 ui-monospace, monospace;
  background: var(--felt-dark);
  color: var(--cream);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 8px;
  box-sizing: border-box;
}

.review-progress progress {
  width: 100%;
  accent-color: var(--gold);
}

.review-balance__reasons {
  margin: 0;
  padding-left: 18px;
}

.review-table-wrap {
  overflow-x: auto;
}

.review-table__open {
  text-align: left;
  padding: 0;
  min-height: 0;
}

.review-kind {
  display: flex;
  align-items: center;
  gap: 8px;
}

.review-kind select {
  min-height: 44px;
  background: var(--felt-dark);
  color: var(--cream);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 0 8px;
}

.review-hands {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.review-hand {
  width: 100%;
  display: grid;
  grid-template-columns: 4em 1fr auto;
  gap: 8px;
  text-align: left;
}

.review-hand--error .review-hand__outcome {
  color: var(--danger);
}

.review-hand--hint .review-hand__outcome,
.review-hand--close .review-hand__outcome {
  color: var(--gold);
}

.review-hand--correct .review-hand__outcome {
  color: var(--success);
}

.review-hand-head {
  margin: 0;
}

.review-steps {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

@media (min-width: 600px) {
  .review-steps {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

`src/ui/screens/ReviewOverview.tsx` anlegen:
```tsx
import { formatCount, formatPer100, formatPlayedAt } from '../../app/format';
import { localDateKey } from '../../game/streak';
import { errorsPer100, weeklyErrorTrend } from '../../review/summary';
import { TOURNAMENT_KIND_LABELS } from '../../review/tournament-kind';
import { TrendBars, shortDate } from '../components/TrendChart';
import { useReview } from '../ReviewContext';
import './review.css';

export function ReviewOverview({ onImport, onOpen, now }: { onImport: () => void; onOpen: (id: string) => void; now: () => Date }) {
  const review = useReview();
  if (review.status === 'loading') return <p className="panel muted">Hand-Archiv wird geladen …</p>;

  const trend = weeklyErrorTrend(review.tournaments.map((t) => t.summary), localDateKey(now()));
  const max = Math.max(1, ...trend.map((w) => w.per100 ?? 0));
  const bars = trend.map((w) => ({
    key: w.weekStart,
    label: shortDate(w.weekStart),
    value: w.per100 === null ? null : w.per100 / max,
    text: formatPer100(w.per100),
  }));

  return (
    <>
      {review.problems.length > 0 && (
        <p className="notice notice--warning" role="alert">
          {review.problems.length === 1
            ? '1 Eintrag im Hand-Archiv ist nicht lesbar und wurde übersprungen (nicht gelöscht).'
            : `${review.problems.length} Einträge im Hand-Archiv sind nicht lesbar und wurden übersprungen (nicht gelöscht).`}
        </p>
      )}
      <section className="panel review-intro">
        <p className="muted">
          Lade deine GGPoker-Hand-Historien (.txt oder .zip) hoch. Jede Preflop-Entscheidung wird mit den Push/Fold-Daten
          und den Starthand-Charts bewertet.
        </p>
        <button type="button" className="btn btn--gold" onClick={onImport} disabled={!review.writable}>
          Hände importieren
        </button>
        {review.lockReason && <p className="muted">{review.lockReason}</p>}
      </section>
      {review.tournaments.length === 0 ? (
        review.status === 'ready' && <p className="panel muted">Noch keine Hände importiert.</p>
      ) : (
        <>
          <section className="panel stats-section">
            <h3 className="stats-section__title">Fehler pro 100 Hände</h3>
            <TrendBars bars={bars} ariaLabel="Fehler pro 100 Hände der letzten 8 Wochen" />
          </section>
          <section className="panel stats-section">
            <h3 className="stats-section__title">Turniere</h3>
            <div className="review-table-wrap">
              <table className="stats-table review-table">
                <thead>
                  <tr>
                    <th scope="col">Datum</th>
                    <th scope="col">Turnier</th>
                    <th scope="col">Art</th>
                    <th scope="col">Hände</th>
                    <th scope="col">Fehler preflop</th>
                    <th scope="col">Fehler postflop</th>
                    <th scope="col">Fehler pro 100 Hände</th>
                  </tr>
                </thead>
                <tbody>
                  {review.tournaments.map((t) => (
                    <tr key={t.id}>
                      <td>{formatPlayedAt(t.lastPlayedAt).slice(0, 10)}</td>
                      <th scope="row">
                        <button type="button" className="btn btn--ghost review-table__open" onClick={() => onOpen(t.id)}>
                          {t.name}
                        </button>
                      </th>
                      <td>{TOURNAMENT_KIND_LABELS[t.kind]}</td>
                      <td>{formatCount(t.summary.hands)}</td>
                      <td>{formatCount(t.summary.preflopErrors)}</td>
                      <td title="Postflop-Bewertung folgt">–</td>
                      <td>{formatPer100(errorsPer100(t.summary.preflopErrors + t.summary.postflopErrors, t.summary.hands))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
```

`src/ui/screens/ReviewImport.tsx` anlegen:
```tsx
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

export function ImportBalance({ summary }: { summary: ImportSummary }) {
  const skipped = summary.skipped.reduce((sum, s) => sum + s.count, 0);
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
```

`src/ui/screens/ReviewTournament.tsx` anlegen:
```tsx
import { useState } from 'react';
import { formatCount, formatPer100, formatPlayedAt } from '../../app/format';
import type { OpenTournament, ReviewHand } from '../../app/review-store';
import { handClassOf, handName } from '../../engine/cards';
import { POSITION_LABELS } from '../../engine/positions';
import { positionsOf } from '../../review/hand-model';
import { HERO } from '../../review/parse';
import { type DecisionOutcome, type HandFilter, errorsPer100, handOutcome, handSeverity, matchesFilter } from '../../review/summary';
import { TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, type TournamentKind } from '../../review/tournament-kind';
import { useReview } from '../ReviewContext';
import { FilterGroup, type Option } from '../components/FilterGroup';
import './review.css';

export const OUTCOME_LABELS: Record<DecisionOutcome, string> = {
  error: 'Fehler',
  hint: 'Hinweis',
  close: 'Knapp',
  correct: 'Richtig',
  unrated: 'Nicht bewertet',
};

const FILTERS: Option<HandFilter>[] = [
  { value: 'errors', label: 'Nur Fehler' },
  { value: 'questionable', label: 'Auch fraglich' },
  { value: 'all', label: 'Alle' },
];

/** Worst hands first, then in playing order. */
export function sortedHands(hands: readonly ReviewHand[], kind: TournamentKind): ReviewHand[] {
  return [...hands].sort(
    (a, b) =>
      handSeverity(b.record.analysis, kind) - handSeverity(a.record.analysis, kind) ||
      a.record.playedAt.localeCompare(b.record.playedAt) ||
      a.record.id.localeCompare(b.record.id),
  );
}

function handLabel({ hand }: ReviewHand): string {
  const cards = hand.heroCards ? handName(handClassOf(hand.heroCards[0], hand.heroCards[1])) : '??';
  const position = positionsOf(hand)?.get(HERO);
  return `${cards}${position ? ` · ${POSITION_LABELS[position]}` : ''}`;
}

type Props = {
  open: OpenTournament;
  onOpenHand: (handId: string) => void;
  onSetKind: (kind: TournamentKind) => void;
  onDelete: () => void;
};

export function ReviewTournament({ open, onOpenHand, onSetKind, onDelete }: Props) {
  const review = useReview();
  const [filter, setFilter] = useState<HandFilter>('all');
  const { tournament } = open;
  const kind = tournament.kind;
  const visible = sortedHands(open.hands, kind).filter((h) => matchesFilter(h.record.analysis, kind, filter));
  const errors = tournament.summary.preflopErrors + tournament.summary.postflopErrors;

  return (
    <>
      <section className="panel review-tournament">
        <h2 className="review-title">{tournament.name}</h2>
        <p className="muted">
          {formatPlayedAt(tournament.firstPlayedAt)} · {formatCount(tournament.summary.hands)} Hände · {formatCount(errors)} Fehler ·{' '}
          {formatPer100(errorsPer100(errors, tournament.summary.hands))} pro 100 Hände
        </p>
        <label className="review-kind">
          Art des Turniers
          <select
            aria-label="Art des Turniers"
            value={kind}
            disabled={!review.writable}
            onChange={(event) => onSetKind(event.target.value as TournamentKind)}
          >
            {TOURNAMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {TOURNAMENT_KIND_LABELS[k]}
                {k === tournament.detectedKind ? ' (erkannt)' : ''}
              </option>
            ))}
          </select>
        </label>
        {kind !== 'normal' && <p className="muted">Satellit/Bounty – Standard-Chart nur bedingt gültig. Abweichungen zählen nicht als Fehler.</p>}
        {open.problems.length > 0 && (
          <p className="notice notice--warning" role="alert">
            {open.problems.length} Hand-Einträge sind nicht lesbar und wurden übersprungen (nicht gelöscht).
          </p>
        )}
        <FilterGroup label="Hände" options={FILTERS} value={filter} disabled={false} onChange={setFilter} />
      </section>
      {visible.length === 0 ? (
        <p className="panel muted">Keine Hände für diesen Filter.</p>
      ) : (
        <ol className="review-hands">
          {visible.map((h) => {
            const outcome = handOutcome(h.record.analysis, kind);
            return (
              <li key={h.record.id}>
                <button type="button" className={`btn review-hand review-hand--${outcome ?? 'none'}`} onClick={() => onOpenHand(h.record.id)}>
                  <span>{formatPlayedAt(h.record.playedAt).slice(11)}</span>
                  <span>{handLabel(h)}</span>
                  <span className="review-hand__outcome">{outcome ? OUTCOME_LABELS[outcome] : 'Keine Entscheidung'}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <button type="button" className="btn btn--ghost" disabled={!review.writable} onClick={onDelete}>
        Turnier löschen
      </button>
    </>
  );
}
```

`src/ui/screens/ReviewHand.tsx` anlegen:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { formatChipsBb, formatCount, formatPlayedAt } from '../../app/format';
import type { ReviewHand as ReviewHandData } from '../../app/review-store';
import { POSITION_LABELS } from '../../engine/positions';
import type { TournamentKind } from '../../review/tournament-kind';
import { isTypingTarget } from '../components/ActionBar';
import { TableView } from '../components/PokerTable';
import { ReviewDecisionPanel } from '../components/ReviewDecisionPanel';
import { TrainingLayout } from '../components/TrainingLayout';
import { replaySteps, replayTableModel } from '../replay-model';
import { useReviewStore } from '../ReviewContext';
import './review.css';

type Props = { item: ReviewHandData; kind: TournamentKind };

export function ReviewHand({ item, kind }: Props) {
  const { data } = useReviewStore();
  const { hand, record } = item;
  const steps = useMemo(() => replaySteps(hand, record.analysis.decisions), [hand, record]);
  const decisionSteps = useMemo(() => steps.flatMap((s, i) => (s.decision ? [i] : [])), [steps]);
  const [index, setIndex] = useState(() => decisionSteps[0] ?? 0);
  const step = steps[index];

  const prevDecision = [...decisionSteps].reverse().find((i) => i < index);
  const nextDecision = decisionSteps.find((i) => i > index);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return;
      const target = event.key === 'ArrowLeft' ? prevDecision : event.key === 'ArrowRight' ? nextDecision : undefined;
      if (target === undefined) return;
      event.preventDefault();
      setIndex(target);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevDecision, nextDecision]);

  const hero = step.state.players.find((p) => p.isHero);
  const info = [
    hero?.position ? `Du sitzt im ${POSITION_LABELS[hero.position]}` : 'Position unbekannt',
    `Schritt ${index + 1} von ${steps.length}`,
  ].join(' · ');
  const table =
    hero?.position ? (
      <TableView model={replayTableModel(step.state, hand.bigBlind)} cards={hand.heroCards ?? []} board={step.state.board} situation={step.text} info={info} />
    ) : (
      <p className="panel">{step.text}</p>
    );

  return (
    <>
      <p className="muted review-hand-head">
        Hand #{hand.id.replace(/^TM/, '')} · {formatPlayedAt(hand.playedAt)} · Level {hand.level} ({formatCount(hand.smallBlind)}/
        {formatCount(hand.bigBlind)}, Ante {formatCount(hand.ante)}) · Stack {formatChipsBb(hero?.startChips ?? 0, hand.bigBlind)} BB
      </p>
      <TrainingLayout
        main={
          <>
            {table}
            <div className="review-steps">
              <button type="button" className="btn" disabled={prevDecision === undefined} onClick={() => setIndex(prevDecision!)} aria-keyshortcuts="ArrowLeft">
                ← Entscheidung
              </button>
              <button type="button" className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                Schritt zurück
              </button>
              <button type="button" className="btn" disabled={index === steps.length - 1} onClick={() => setIndex(index + 1)}>
                Schritt vor
              </button>
              <button type="button" className="btn" disabled={nextDecision === undefined} onClick={() => setIndex(nextDecision!)} aria-keyshortcuts="ArrowRight">
                Entscheidung →
              </button>
            </div>
            {decisionSteps.length === 0 && <p className="muted">In dieser Hand hast du keine Entscheidung getroffen.</p>}
          </>
        }
        side={step.decision && <ReviewDecisionPanel decision={step.decision} kind={kind} bigBlind={hand.bigBlind} data={data} />}
      />
    </>
  );
}
```

`src/ui/screens/ReviewScreen.tsx` anlegen:
```tsx
import { useCallback, useState } from 'react';
import type { OpenTournament } from '../../app/review-store';
import type { TournamentKind } from '../../review/tournament-kind';
import { useReviewStore } from '../ReviewContext';
import { ReviewHand } from './ReviewHand';
import { ReviewImport } from './ReviewImport';
import { ReviewOverview } from './ReviewOverview';
import { ReviewTournament } from './ReviewTournament';
import './screens.css';
import './review.css';

type View = { name: 'overview' } | { name: 'import' } | { name: 'tournament'; id: string } | { name: 'hand'; id: string; handId: string };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const defaultNow = () => new Date();

export function ReviewScreen({ onBack, now = defaultNow }: { onBack: () => void; now?: () => Date }) {
  const store = useReviewStore();
  const [view, setView] = useState<View>({ name: 'overview' });
  const [open, setOpen] = useState<OpenTournament | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const openTournament = useCallback(
    async (id: string) => {
      setMessage(null);
      setView({ name: 'tournament', id });
      setOpen(null);
      try {
        setOpen(await store.openTournament(id));
      } catch (error) {
        setMessage(`Turnier konnte nicht geladen werden: ${errorText(error)}`);
      }
    },
    [store],
  );
  const setKind = async (kind: TournamentKind) => {
    if (!open) return;
    try {
      await store.setKind(open.tournament.id, kind);
      setOpen(await store.openTournament(open.tournament.id));
    } catch (error) {
      setMessage(`Ändern fehlgeschlagen: ${errorText(error)}`);
    }
  };
  const remove = async () => {
    if (!open || !window.confirm(`Turnier „${open.tournament.name}“ mit allen Händen löschen?`)) return;
    try {
      await store.deleteTournament(open.tournament.id);
      setOpen(null);
      setView({ name: 'overview' });
    } catch (error) {
      setMessage(`Löschen fehlgeschlagen: ${errorText(error)}`);
    }
  };

  const back =
    view.name === 'overview'
      ? { label: '← Menü', go: onBack }
      : view.name === 'hand'
        ? { label: '← Turnier', go: () => setView({ name: 'tournament', id: view.id }) }
        : { label: '← Übersicht', go: () => setView({ name: 'overview' }) };
  const item = view.name === 'hand' ? open?.hands.find((h) => h.record.id === view.handId) : undefined;

  return (
    <>
      <div className="screen-header">
        <button type="button" className="btn btn--ghost" onClick={back.go}>
          {back.label}
        </button>
        <span className="muted">Hand-Review</span>
      </div>
      {message && <p role="alert">{message}</p>}
      {view.name === 'overview' && <ReviewOverview now={now} onImport={() => setView({ name: 'import' })} onOpen={(id) => void openTournament(id)} />}
      {view.name === 'import' && <ReviewImport onDone={() => setView({ name: 'overview' })} />}
      {view.name === 'tournament' &&
        (open ? (
          <ReviewTournament
            open={open}
            onOpenHand={(handId) => setView({ name: 'hand', id: view.id, handId })}
            onSetKind={(kind) => void setKind(kind)}
            onDelete={() => void remove()}
          />
        ) : (
          !message && <p className="panel muted">Turnier wird geladen …</p>
        ))}
      {view.name === 'hand' && open && item && <ReviewHand key={item.record.id} item={item} kind={open.tournament.kind} />}
    </>
  );
}
```

`src/ui/screens/HomeScreen.tsx` vollständig ersetzen:
```tsx
import { formatCount } from '../../app/format';
import { RUN_LEVEL_STACKS } from '../../game/endphase-run';
import { StatusBar } from '../components/StatusBar';
import { useGame } from '../GameContext';
import './screens.css';

export type Screen = 'home' | 'training' | 'preflop' | 'daily' | 'run' | 'review' | 'stats' | 'settings';

type Tile = { title: string; text: string; button: string; target: Screen; locked: boolean };

export function HomeScreen({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const game = useGame();
  const locked = game.info.readOnly;
  const { dailyToday, activeRun, bestRun } = game.status;
  const runRunning = activeRun !== null && activeRun.status === 'running';

  const tiles: Tile[] = [
    {
      title: 'Starthand-Training',
      text: 'Open-Raise, 3-Bet und Verteidigung mit 40 und 100 BB',
      button: 'Starthände trainieren',
      target: 'preflop',
      locked,
    },
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
        ? `Run läuft – Level ${activeRun.levelIndex + 1} von ${RUN_LEVEL_STACKS.length}`
        : bestRun
          ? `Beste Platzierung: Platz ${formatCount(bestRun.placement)}`
          : 'Überlebe die Endphase eines MTT mit 3 Leben.',
      button: runRunning ? 'Run fortsetzen' : 'Run starten',
      target: 'run',
      locked,
    },
    {
      title: 'Hand-Review',
      text: 'GGPoker-Hände importieren und deine Preflop-Entscheidungen prüfen',
      button: 'Hände prüfen',
      target: 'review',
      // Viewing the archive stays possible in read-only mode; the import itself is blocked there.
      locked: false,
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

`src/ui/App.tsx` vollständig ersetzen:
```tsx
import { useState } from 'react';
import { Celebration } from './components/Celebration';
import { Notices } from './components/Notices';
import { useGame, useGameStore } from './GameContext';
import { HomeScreen, type Screen } from './screens/HomeScreen';
import { PlayScreen } from './screens/PlayScreen';
import { PreflopScreen } from './screens/PreflopScreen';
import { ReviewScreen } from './screens/ReviewScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';
import { type SoundPlayer, silentPlayer } from './sound';
import { useGameSounds } from './useGameSounds';

const now = () => new Date();

export function App({ onApplyUpdate, sound = silentPlayer }: { onApplyUpdate?: () => Promise<void>; sound?: SoundPlayer }) {
  const store = useGameStore();
  const game = useGame();
  useGameSounds(sound);
  const [screen, setScreen] = useState<Screen>('home');
  const home = () => setScreen('home');

  return (
    <>
      {/* While the overlay is open, the rest of the app is neither focusable nor clickable. */}
      <main className="app" inert={game.celebration !== null}>
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
        {screen === 'preflop' && <PreflopScreen onBack={home} />}
        {screen === 'review' && <ReviewScreen onBack={home} />}
        {screen === 'stats' && <StatsScreen onBack={home} />}
        {screen === 'settings' && <SettingsScreen onBack={home} />}
      </main>
      {game.celebration && <Celebration rank={game.celebration} onClose={store.dismissCelebration} />}
    </>
  );
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/ui/screens/ReviewScreen.test.tsx src/ui/App.test.tsx src/ui/screens/PreflopScreen.test.tsx src/ui/screens/StatsScreen.test.tsx` → Expected: PASS.

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS. Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/ui/components/FilterGroup.tsx src/ui/components/TrendChart.tsx src/ui/components/ActionBar.tsx src/ui/screens/PreflopScreen.tsx src/ui/screens/ReviewScreen.tsx src/ui/screens/ReviewOverview.tsx src/ui/screens/ReviewImport.tsx src/ui/screens/ReviewTournament.tsx src/ui/screens/ReviewHand.tsx src/ui/screens/review.css src/ui/screens/ReviewScreen.test.tsx src/ui/screens/HomeScreen.tsx src/ui/App.tsx src/ui/App.test.tsx
git commit -m "feat(ui): Hand-Review mit Übersicht, Import, Turnier- und Hand-Ansicht samt Wiedergabe und Tasten ← →" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Build-Prüfung und manuelle Abnahme

**Files:**
- Keine Änderungen geplant. Nur wenn eine Prüfung scheitert, wird die Ursache im betroffenen Task-Bereich behoben und mit eigenem Commit festgehalten.

- [ ] **Step 1: Automatische Prüfungen**

Run: `npm test` → Expected: alle PASS (rund 575 Tests).
Run: `npm run typecheck` → Expected: Exit 0.
Run: `npm run check:portability` → Expected: keine Befunde.
Run: `npm run build` → Expected: Build ohne Fehler und ohne neue Warnungen (das Haupt-Bundle bleibt unter `chunkSizeWarningLimit` 1200 kB, im Prototyp etwa 1017 kB); `dist/` enthält `index.html`, `sw.js` und das Manifest.

- [ ] **Step 2: Manuelle Abnahme (Controller)**

Run: `npm run preview`, dann im Browser am PC (mindestens 1100 px breit) und in der Größe 375×812 prüfen:

- Alter Spielstand: Vorher in den Einstellungen exportieren. Nach dem Laden der neuen Version sind XP, Rang, Streak, Statistik unverändert; in den Entwicklerwerkzeugen gibt es neben `poker-trainer` die Datenbank `poker-trainer-review`, der Eintrag `save` in `poker-trainer` ist unverändert.
- Startseite: Kachel „Hand-Review“ mit „Hände prüfen“.
- Import der echten Beispieldatei `samples/000001a1-35db-41af-0000-00007a500c79.zip` über „Dateien wählen“: Fortschritt „Turnier x von 8 · Hand y von z“, Bilanz „Importiert: 477 · Schon vorhanden: 0 · Übersprungen: 0“. Derselbe Import noch einmal: „Importiert: 0 · Schon vorhanden: 477“.
- Am PC: dieselbe ZIP per Drag & Drop auf die Ablagefläche ziehen; einzelne Hand aus einer `.txt` kopieren und in das Feld einfügen.
- Übersicht: 8 Turniere, neuestes zuerst; „Daily Classic $1“ als Normal mit 284 Händen; Step-Turniere und „T$ Builder $1“ als Satellit, „Bounty Hunters $2.50“ als Bounty, dort 0 Fehler preflop; Spalte „Fehler postflop“ zeigt „–“; Verlauf „Fehler pro 100 Hände“ mit einem Balken für die Woche bis heute.
- Turnier: Hände nach Schwere (Fehler zuerst), Filter „Nur Fehler“, „Auch fraglich“, „Alle“; Art auf „Satellit“ ändern → Fehler werden zu „Hinweis“, Zähler in Turnier und Übersicht sinken; zurück auf „Normal“. „Turnier löschen“ fragt nach und entfernt das Turnier.
- Hand: Tisch mit Positionen, Stacks, Einsätzen, Pot und Board; „Schritt vor/zurück“ und die Tasten ← → (zur vorigen/nächsten Entscheidung); bei einer Preflop-Entscheidung Urteil, „Deine Wahl“, „Richtige Aktion“, Chart mit markierter Hand, Lernsatz, „Standard-Chart, kein Solver-Ergebnis“, bei Bedarf „Näherung: Chart für 40 BB“; Push/Fold-Spots mit EV-Zeile und Push/Fold-Chart; Postflop-Entscheidungen „Nicht bewertet – Postflop-Bewertung folgt“ mit Pot, zu callendem Betrag und Stack. Am PC zweispaltig (Tisch links, Urteil rechts), am Handy untereinander, ohne waagrechtes Scrollen außer in der Turniertabelle.
- Export in den Einstellungen: Datei enthält den Schlüssel `reviewArchive`; Import dieser Datei auf einem frischen Profil (privates Fenster) bringt Spielstand und Archiv zurück. Eine Exportdatei aus der Zeit vor diesem Plan lässt sich weiterhin importieren.
- Zweiter Tab: Hinweis „Import ist nur in dem Tab möglich, der deinen Fortschritt speichert.“, Import, Art ändern und Löschen gesperrt; nach Schließen des ersten Tabs wird der zweite zum Schreiber und darf importieren.
- Nur-Lesen-Modus (Spielstand mit `schemaVersion: 2` in den Entwicklerwerkzeugen): Archiv ist sichtbar, Import gesperrt mit „Nur-Lesen-Modus: Bitte die App aktualisieren, um Hände zu importieren.“
- Offline: Nach einmaligem Laden funktionieren Import und Ansichten ohne Netz.

- [ ] **Step 3: Übergabe**

Ergebnis der Prüfungen festhalten. Die Veröffentlichung erfolgt über den Merge des Pull Requests von `feat/hand-review-import` (nicht Teil dieses Plans).
