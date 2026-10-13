# Plan 8: Hand-Review – Postflop-Faustregeln Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use mindCoder:subagent-driven-development (recommended) or mindCoder:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Hero-Entscheidung auf Flop, Turn und River wird mit den Faustregeln aus Spec 7 bewertet: Startrange des Gegners aus seiner Preflop-Rolle, Eingrenzung je Straße nach Handstärke auf dem Board, Equity des Hero gegen die eingegrenzte Range (Monte-Carlo im Web Worker), nötige Equity aus den Pot Odds, Einsatz in Prozent vom Pot, SPR und die Regeltabelle mit Implied-Odds-Bonus. Urteile `passt` / `fraglich` / `wahrscheinlich Fehler` / `nicht bewertet` mit Grund erscheinen in der Hand-Ansicht samt „Faustregel, kein Solver-Ergebnis“; Postflop-Fehler zählen in der Übersicht (Spalte „Fehler postflop“) und im Wochenverlauf, „Auch fraglich“ zeigt auch Postflop-`fraglich`. Archivierte Hände aus Plan 7 werden nach der neuen Analyse-Version 2 neu bewertet.

**Architecture:** Reine Rechenbausteine ohne React in `src/engine/postflop/`: gewichtete Combo-Ranges mit Card Removal und Eingrenzung nach Anteil (`combos.ts`), Handstärke und Draws (`strength.ts`), Equity gegen eine Range (`range-equity.ts`, River und Turn exakt, Flop Monte-Carlo mit festem Seed); vorhandener 7-Karten-Evaluator `evaluate7` und `mulberry32`/`seedFromString` werden wiederverwendet. In `src/review/`: Regeltabelle mit allen Schwellen als Konstanten (`postflop-rules.ts`), Startrange des Gegners aus den Starthand-Charts (`villain-range.ts`), Bewertung aller Postflop-Entscheidungen einer Hand (`postflop.ts`), deutsche Texte (`postflop-text.ts`). `analyzeHand` bleibt eine reine, synchrone Funktion (testbar ohne Worker) und hängt die Postflop-Urteile an; `ANALYSIS_VERSION` steigt auf 2. Ein `HandAnalyzer` (`analyzer.ts`) rechnet im Web Worker (`analysis.worker.ts` ist nur ein dünner Adapter um `createWorkerHandler`) oder als Rückfall im Hauptthread in Häppchen. Der Review-Store nimmt den Analyzer als Abhängigkeit, bewertet veraltete Hände beim Öffnen und im Hintergrund neu (nur im schreibenden Tab, jede Turnier-Änderung als ein serieller Schritt) und meldet den Fortschritt. Archiv-Schema bleibt 1, der Spielstand bleibt unberührt.

**Tech Stack:** TypeScript 5, React 19, Vite 6 (Modul-Worker, `worker.format: 'es'`), vite-plugin-pwa (Worker-Datei wird über das vorhandene Muster `**/*.{js,…}` vorab gecacht), Vitest 3 mit jsdom und Testing Library, idb-keyval. Keine neue Laufzeit-Abhängigkeit.

## Global Constraints

Verbindlich (wörtlich aus dem Auftrag):

- Requirements: `docs/mindCoder/specs/2026-10-13-hand-review-design.md` section 7 (postflop heuristics) and section 12 "Plan 8" (hand strength, range narrowing, equity in a Web Worker, rules, display in the hand view, postflop errors in overview and trend), plus sections 2, 8, 9, 11 (verdict levels `passt` / `fraglich` / `wahrscheinlich Fehler` / `nicht bewertet`; only `wahrscheinlich Fehler` counts as an error; every postflop assessment carries „Faustregel, kein Solver-Ergebnis“; analysis version: archived hands re-rated when logic changes; Monte-Carlo with fixed seed in tests; performance target 500 hands < 30 s on a PC).
- Postflop decisions are currently stored with `street` and numbers, rated „Nicht bewertet – Postflop-Bewertung folgt“; Plan 8 adds a postflop rating to the union and raises ANALYSIS_VERSION; archive schema stays 1.
- Known follow-up from Plan 7 review: `DaySummary` in src/review/summary.ts lacks `postflopErrors` — the weekly trend must include postflop errors after this plan.
- Reuse existing evaluator/equity code; if a fast 7-card evaluator does not exist, design one (pure TS, no new runtime deps unless clearly justified).
- Villain start range from his preflop role per spec 7 (opener rfi range, caller vsOpen call part by his position group, 3-bettor aggressive part, BB defence vsOpen:…:bb, caller vs hero 3-bet vs3bet call part; stack depth mapping as preflop section 6). If his role isn't covered → `nicht bewertet: Range des Gegners unbekannt`.
- Hand-strength ranking on a board (made hand + draw value) used to narrow: Bet keeps strongest 60 %, Raise 30 %, All-in 25 %, Call drops weakest 30 %, Check drops strongest 10 %; card removal. Define "strongest X %" precisely (by combos, weighted).
- Equity: Monte-Carlo vs the narrowed range in a Web Worker (sample count, seed, determinism for tests: the pure function must be testable without a worker; worker is a thin adapter). Progress UI during analysis; analysis of a 500-hand import must stay responsive.
- Rules table exactly per spec 7 incl. +5 points implied-odds bonus on flop/turn calls with ≥8 outs to straight or flush; pot odds formula; bet size % pot; SPR; "Hero handelt als Letzter" on river; all thresholds as constants in one file.
- Multiway / unknown range → nicht bewertet, but numbers still shown.
- Re-rating of archived hands when ANALYSIS_VERSION changes (lazy on open and/or in background), without breaking read-only/writer-lock rules.
- UI: per postflop decision show verdict, reason, equity, needed equity, bet % pot, SPR, the hint text; overview "Fehler postflop" column filled; trend counts postflop errors; filter „Auch fraglich“ now includes postflop `fraglich`.
- Before each commit: `npm test`, `npm run typecheck`, `npm run check:portability`. Final task = build check + performance measurement on the real sample + manual checklist.

Projektregeln (Haupt-Spec 8.4/8.5 und bisherige Pläne):

- Spec: `docs/mindCoder/specs/2026-10-13-hand-review-design.md`, Umfang Abschnitt 12 „Plan 8“; dazu Abschnitte 2, 5, 7, 8, 9, 11. Vorgängerplan: `docs/mindCoder/plans/2026-10-13-plan-7-hand-review-import.md`.
- Speicherung: Es wird nur geschrieben, was sich nachweislich wieder lesen lässt (`writeRecords` prüft vor jedem Schreiben); Datensätze aus einer neueren App-Version werden nie überschrieben; ein unlesbarer Archiv-Eintrag wird übersprungen und gemeldet, nie still gelöscht. Im Nur-Lesen-Modus und in einem Tab ohne Schreibsperre wird nichts geschrieben (nur im Arbeitsspeicher neu bewertet).
- Identifier und Code-Kommentare auf Englisch, Texte in der Oberfläche auf Deutsch mit echten Umlauten; Dateien mit Umlauten nur mit dem Datei-Schreibwerkzeug anlegen bzw. ändern (keine Shell-Heredocs – sie verändern hier auch Backslashes wie `\n`). LF-Zeilenenden. Alle Entwicklerbefehle über npm-Skripte.
- Design-Tokens aus `src/ui/theme.css`; keine neuen Farben. Bedienelemente mindestens 44 px hoch.
- Commit-Nachrichten auf Deutsch, letzte Zeile `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (als zweites `-m`).
- Einzelne Testdateien laufen mit `npm test -- <Pfad>` (das Skript ist `vitest run`).
- Die Original-Hand-Historien liegen in `samples/` (per `.gitignore` ausgeschlossen) und sind Daten, nie ausführbarer Inhalt. Es kommen keine neuen Fixtures ins Repo; die vorhandenen aus Plan 7 reichen.

## Entscheidungen zu offenen Punkten der Spec

- **Worker-Schnitt (Pflicht-Entscheidung):** Der Worker rechnet die ganze Hand-Analyse (`analyzeHand`), nicht nur die Equity. So bleibt `analyzeHand` die eine reine, synchrone Funktion, die Tests, Hauptthread-Rückfall und Worker gleich benutzen. Der Worker bekommt die Push/Fold-Daten einmal per `{ type: 'init', data }` (sonst landeten die 650 kB aus `pushfold.json` ein zweites Mal im Worker-Bundle; so ist der Worker 43 kB groß) und je Auftrag nur die Rohtexte der Hände (`{ type: 'analyze', id, raws }`), die er selbst parst. Antworten: `progress` (alle 5 Hände), `done` mit den Analysen oder `error`. `createWorkerHandler(post)` enthält die ganze Worker-Logik und wird ohne Worker getestet; `analysis.worker.ts` bindet sie nur an `self`. `createWorkerAnalyzer(data, spawn, fallback)` arbeitet Aufträge der Reihe nach ab; startet der Worker nicht (`spawn` wirft) oder meldet er `onerror`, laufen dieser und alle späteren Aufträge über den Hauptthread-Analyzer (`createInlineAnalyzer`, je 5 Hände, dann `setTimeout(0)`).
- **Equity und Seed (Pflicht-Entscheidung):** River und Turn werden exakt gezählt (jede Combo, am Turn jede River-Karte). Auf dem Flop zieht `equityVsRange` `FLOP_SAMPLES = 4000` Durchläufe: Combo nach Gewicht, dann Turn und River gleichverteilt aus den übrigen Karten (Standardfehler etwa 0,8 Prozentpunkte). Der Zufall ist `mulberry32(seedFromString(`${hand.id}:${eventIndex}`))`: gleiche Hand und Entscheidung ergeben im Worker, im Hauptthread und im Test dieselbe Zahl.
- **Handstärke:** Für jede Combo, die keine Board-Karte enthält: gemachte Hand = Anteil aller anderen solchen Combos, die sie mit `evaluate7` gerade schlägt (Gleichstand zählt halb). Draw-Wert = Outs × `POT_PER_OUT` (Flop 0,04, Turn 0,02, River 0; Regel von 4 und 2). Stärke = gemacht + (1 − gemacht) × min(1, Draw-Wert). Je Board wird die Tabelle einmal je Hand berechnet (Cache).
- **Outs:** Flush-Draw = genau vier Karten einer Farbe aus Hand und Board, mindestens eine davon in der Hand, noch kein Flush; Outs = die übrigen Karten dieser Farbe. Straight-Draw = jeder Rang, der eine Straße ergibt, die höher ist als die, die das Board mit dieser Karte allein ergäbe, solange die Hand noch keine Straße hat; Outs = die ungesehenen Karten dieser Ränge. Gemeinsame Karten zählen einmal (Flush-Draw plus Open-Ender = 15 Outs). Am River gibt es keine Outs.
- **„Stärkste X %“ genau:** Gemessen am Gewicht der Range (eine Combo = Gewicht 1, die Charts sind nicht gemischt). Die Combos werden nach Stärke absteigend geordnet und von oben aufgefüllt, bis X % des Gesamtgewichts erreicht sind. Combos gleicher Stärke bilden eine Gruppe; die Gruppe, die die Grenze überschreitet, bleibt mit demselben verkleinerten Gewicht je Combo – das Ergebnis hängt so nie von der Reihenfolge gleich starker Combos ab und enthält genau X % (`keepShare`). „Schwächste 30 % fallen weg“ = stärkste 70 % bleiben; „stärkste 10 % fallen weg“ = schwächste 90 % bleiben. Gewichte werden über die Straßen weitergetragen.
- **Eingrenzung je Aktion des Gegners:** auf dem Board der Straße, in der Reihenfolge der Aktionen (Bet, dann Call auf einen Raise des Hero: 60 % × 70 %). Bet → 60 %, Raise → 30 %, Bet oder Raise mit All-in (Vermerk oder Stack danach 0) → 25 %, Call (auch ein All-in-Call) → stärkste 70 %, Check → schwächste 90 %. Hero-Aktionen grenzen nichts ein.
- **Card Removal:** Hero-Karten fallen zu Beginn aus der Startrange, jede neue Board-Karte bei ihrem Erscheinen; die Equity-Rechnung überspringt zusätzlich jede Combo, die mit Hero oder Board kollidiert.
- **Startrange des Gegners (`villainStart`):** Genau zwei Spieler sehen den Flop (Hero und Gegner), sonst `Multiway` – auch wenn später jemand foldet. Limp vor dem ersten Raise oder gar kein Raise → „Range des Gegners unbekannt: Limp-Pot“; mehr als zwei Raises → „… 4-Bet-Pot“. Effektiver Stack = kleinerer spielbarer Stack von Hero und Gegner zu Handbeginn (wie Plan 7) → `modelFor` aus der Preflop-Bewertung: bis 20 BB „… höchstens 20 BB (kein Chart)“, 21–55 BB Chart 40, darüber Chart 100, „Näherung“ bei mehr als 25 % Abstand. Rollen: Gegner öffnet, Hero callt oder verteidigt → `rfi:<Tiefe>:<Gegner>` aggressiver Teil (`opener`); Hero öffnet, Gegner callt → `vsOpen:<Tiefe>:<Hero>:<Gruppe des Gegners>` Call-Teil (`caller`, aus dem BB `bbDefender` mit Gruppe `bb`); Hero öffnet, Gegner 3-bettet, Hero callt → derselbe Chart, aggressiver Teil (`threeBettor`); Gegner öffnet, Hero 3-bettet, Gegner callt → `vs3bet:<Tiefe>:<Gegner>:<Gruppe des Hero>` Call-Teil (`callerVs3bet`). Alles andere (z. B. kalte 3-Bet eines Dritten, ungültiger Chart-Schlüssel, leere Range) → „Range des Gegners unbekannt“.
- **Neue Gründe für „nicht bewertet“** (in `UNRATED_TEXT`): `multiwayPostflop` „Multiway“, `unknownRange` „Range des Gegners unbekannt“, `limpRange`, `deepRange`, `shortRange` mit Zusatz nach dem Doppelpunkt; dazu wie preflop `tableSize`, `positions`, `noHoleCards`. `postflopPending` bleibt im Typ für alte Datensätze, wird aber nicht mehr erzeugt.
- **Zahlen:** Pot = alle Chips vor der Aktion inklusive der Einsätze der laufenden Straße; zu callen = min(eigener Stack, höchster Straßeneinsatz − eigener Straßeneinsatz); nötige Equity = zu callen / (Pot + zu callen); Einsatz: Bet = Betrag / Pot, Raise = (Betrag − zu callen) / (Pot + zu callen); SPR = min(Stack Hero, Stack Gegner) / Pot vor der Aktion. Bei nicht bewerteten Postflop-Entscheidungen zeigt die Ansicht Pot, zu callen, Stack, nötige Equity und Einsatz aus den gespeicherten Zahlen.
- **Regeln (Grenzen genau wie die Tabelle):** Call: Fehler bei Equity + Bonus < nötig − 10, fraglich bei < nötig − 3. Fold: Fehler bei Equity > nötig + 15, fraglich bei > nötig + 5 (ohne Bonus; ein Fold ohne Einsatz hat „nötig“ 0). Raise und jedes Bet/Raise mit All-in: fraglich bei Equity < 35 % (für All-in-Bets gilt keine Größenregel). Bet: fraglich bei Größe < 20 % oder > 150 % Pot, am River auch bei 35 % ≤ Equity ≤ 55 %. Check: fraglich nur am River, wenn der Gegner auf dieser Straße schon gehandelt hat („Hero handelt als Letzter“) und Equity > 75 % („Value verschenkt?“). Sonst `passt`.
- **Implied Odds:** +5 Punkte auf die Equity eines Calls auf Flop oder Turn bei mindestens 8 Outs auf Straße oder Flush – aber nur, wenn nach dem Call beide noch Chips haben. Ein All-in-Call hat keine Implied Odds (Auslegung der Spec, die das nicht regelt).
- **Fehler, Hinweis, fraglich:** Postflop `wahrscheinlich Fehler` ist in normalen Turnieren `error` (zählt), in Satellit/Bounty `hint` mit „Satellit/Bounty – Standard-Chart nur bedingt gültig“ (zählt nicht, Spec 5). Postflop `fraglich` wird das neue Ergebnis `questionable` („Fraglich“, gold), zählt nie. Schwere: Fehler > Hinweis > Fraglich > Knapp > Richtig > Nicht bewertet; „Auch fraglich“ = Schwere ab Fraglich.
- **Zusammenfassung und Verlauf:** `DaySummary.postflopErrors` (beim Lesen alter Datensätze fehlend = 0), `weeklyErrorTrend` zählt Preflop- und Postflop-Fehler. `TournamentRecord.analysisVersion` (optional, fehlend = 1) ist die kleinste Analyse-Version seiner Hände; die Übersicht zeigt „Fehler postflop“ nur für Turniere mit aktueller Version, sonst „–“ mit Hinweis „Wird neu bewertet, sobald du das Turnier öffnest“. Beide Felder sind für ältere App-Versionen unschädlich (sie ignorieren unbekannte Felder), `REVIEW_SCHEMA_VERSION` bleibt 1.
- **Neubewertung (Pflicht-Entscheidung):** `ANALYSIS_VERSION = 2`. (a) Beim Öffnen eines Turniers werden Hände mit anderer Version aus dem Originaltext neu bewertet – im schreibenden Tab in einem seriellen Schritt samt Zurückschreiben, sonst nur im Arbeitsspeicher. (b) `refreshStale()` bewertet nach `load()` und nach Übernahme der Schreibsperre alle Turniere mit veralteter Version im Hintergrund, Turnier für Turnier, jedes als ein serieller Schritt (Laden, Bewerten, Schreiben); es bricht ab, sobald der Tab nicht mehr schreiben darf, und lässt Turniere mit unlesbaren Händen unverändert (ihre Probleme zeigt das Öffnen). (c) Auch Import und Art-Wechsel laden, verschmelzen und schreiben ihr Turnier jetzt in einem seriellen Schritt, damit sich Hintergrund-Bewertung und Import nie gegenseitig Hände überschreiben. Fortschritt: `snapshot.reanalysis` („Bewertung wird aktualisiert: Turnier 2 von 8 · Hand 40 von 284“ in der Übersicht, „Hände werden neu bewertet: x von y“ beim Laden eines Turniers).
- **Anzeige je Postflop-Entscheidung:** Überschrift „Passt“/„Fraglich“/„Wahrscheinlich Fehler“ (Farbe wie richtig/knapp/falsch; in Satellit/Bounty „Hinweis“), Begründung, „Deine Aktion“, „Equity x % gegen die Range · nötig y %“ (mit „inkl. 5 Punkte Implied Odds …“), „Einsatz z % vom Pot · SPR s · n Outs“, die Zeile Straße/Pot/zu callen/Stack, „Gegner CO: Open-Raise · Chart für 40 BB · etwa 87 Kombinationen“ (mit „Näherung“) und „Faustregel, kein Solver-Ergebnis“.
- **Messskript:** `npm run review:bench -- <Datei.zip|Datei.txt>` analysiert echte Hände in Node und gibt Zeit und Verteilung der Postflop-Urteile aus (Entwicklerwerkzeug, liest die Dateien nur).

## Befunde aus den Beispieldaten (477 Hände, `samples/000001a1-35db-41af-0000-00007a500c79.zip`)

Mit dem Prototyp dieses Plans gemessen (Kopie des Repos außerhalb des Repo-Ordners, alle Tasks nacheinander angewandt, nach jedem Task `npm test` und `npm run typecheck` grün):

- **Leistung:** Analyse aller 477 Hände in Node (`npm run review:bench`) 0,12–0,13 s. Im Browser (gebaute App mit `vite preview`, Chromium) dauert der komplette Import der ZIP – Entpacken, Parsen, Analyse im Worker, Schreiben in IndexedDB – 0,5 s, ohne einen einzigen Long Task (≥ 50 ms) im Hauptthread. Der Worker (`assets/analysis.worker-*.js`, 43 kB) steht in der Precache-Liste von `sw.js`. Der Test mit 500 konstruierten Postflop-Händen läuft im Hauptthread-Analyzer in rund 2 s (Ziel < 30 s).
- **126 Postflop-Entscheidungen**, davon 46 bewertet: 41 passt (15 Bet, 15 Check, 6 Fold, 4 Call, 1 Raise), 4 fraglich (3 knapper Call, 1 All-in mit wenig Equity), 1 wahrscheinlich Fehler (Call ohne Equity). Nicht bewertet: 48 Multiway, 18 Limp-Pot, 14 höchstens 20 BB.
- **Stichprobe von Hand geprüft:**
  - TM6533069903 – 33 im SB öffnet, BB 3-bettet, Hero callt; K♠T♥8♠, Turn 4♦: Call von 11,5 BB in 46,3 BB mit 3,9 % Equity gegen die eingegrenzte 3-Bet-Range (nötig 19,9 %) → **wahrscheinlich Fehler**. Plausibel: kleines Paar gegen eine Range, die die C-Bet gecallt und den Turn gesetzt hat.
  - TM6532114653 – 66 UTG gegen den CO-Caller (100 BB), 8♥9♣7♥ K♦: Call eines Turn-Raises, 12,7 % + 5 Punkte (Open-Ender, 8 Outs) gegen nötige 22 % → **fraglich**. Plausibel; bei SPR 1 eher noch strenger zu sehen.
  - TM6532735063 – A7o verteidigt den BB gegen UTG+1, J♦6♣J♣ check-check, Turn 2♠: Call von 1,8 BB in 7,1 BB mit 11,9 % (nötig 19,9 %) → **fraglich**. Vertretbar; der Check des Gegners am Flop schwächt seine Range nur um die stärksten 10 %.
  - TM6531808519 – A5o CO gegen den SB-Caller, River-All-in als Bluff mit 0 % Equity → **fraglich** („nur als Bluff sinnvoll“). Plausibel als Hinweis, die Regel kennt keine Fold-Equity.
  - TM6533070528 – AJo CO gegen den SB-Caller, River A♠, Call einer 30-%-Bet mit Top Pair: 15,2 % gegen nötige 21,4 % → **fraglich**. Zu streng: Die Call-Range des SB im 40-BB-Chart ist sehr eng („99-77, QJs“), nach drei Eingrenzungen bleiben etwa 4 Kombinationen, fast nur Sets und Straßen.
  - Gegenprobe TM6533069821 – A♣6♣ callt auf Q♦7♣J♣ ein All-in mit Nut-Flush-Draw: 36 % gegen nötige 31 %, kein Implied-Odds-Bonus (All-in) → **passt**.
- **Grenzen der Faustregeln (für die Abnahme):** Die meisten Postflop-Spots der Beispieldaten sind Multiway oder Limp-Pots und bleiben unbewertet. Sehr enge Call-Ranges (SB-Calls, Calls gegen 3-Bets) schrumpfen nach mehreren Aktionen auf wenige Kombinationen und machen Bluff-Catcher-Calls zu streng. Die Eingrenzung kennt keine Bluffs und keine Einsatzgrößen; Bets und Raises werden nur über die rohe Equity beurteilt (keine Fold-Equity).

## Bestehende API (unverändert nutzen)

- `src/engine/cards.ts`: `Card` (Rang × 4 + Farbe), `rankOf`, `suitOf`, `parseCard`, `cardName`, `COMBOS` (Combos je Handklasse), `HAND_COUNT`. `src/engine/evaluator.ts`: `evaluate7(cards: ArrayLike<Card>): number` (funktioniert mit 5 bis 7 Karten, höher = besser). `src/engine/rng.ts`: `Rng`, `mulberry32(seed)`, `seedFromString(s)`. `src/engine/preflop/ranges.ts`: `parseRange`.
- `src/engine/preflop/spots.ts`: `PreflopSituation`, `StackDepth`, `chartKeyFor` (wirft bei ungültigem Spot); `src/engine/preflop/charts.ts`: `chartFor(situation)` mit `key`, `aggressive`, `call` (je 169 Flags).
- `src/review/parse.ts`: `ParsedHand`, `HandEvent`, `ActionEvent`, `BoardStreet`, `HERO`, `parseHand`, `parseHistory`. `src/review/hand-model.ts`: `positionsOf`, `walkHand` (`states[i]` = Tisch vor Ereignis i), `TableState`, `playableChips`, `maxStreetBet`. `src/review/preflop.ts`: `modelFor`, `UnratedRating`, `UnratedReason`, `UNRATED_TEXT`, `DecisionRating`. `src/review/test-hands.ts`: `ggHand`, `foldsBetween`, `TestHandOptions`.
- `src/review/analysis.ts`: `analyzeHand`, `HeroDecision`, `HandAnalysis`, `ANALYSIS_VERSION`. `src/review/summary.ts`, `src/review/archive.ts`, `src/review/import.ts`, `src/app/review-store.ts` aus Plan 7.
- UI: `ReviewDecisionPanel`, `ReviewTournament` (`OUTCOME_LABELS`), `ReviewOverview`, `ReviewScreen`, `useReview`, `renderWithStore` (`src/ui/test-utils.tsx`, Option `reviewBackend`), `formatPercent`, `formatBb`, `formatCount`.

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/engine/postflop/combos.ts` | 1326 Combos, gewichtete Range, Card Removal, `keepShare` |
| `src/engine/postflop/strength.ts` | `straightHigh`, `drawOuts`, `comboStrengths` (gemachte Hand plus Draw-Wert) |
| `src/engine/postflop/range-equity.ts` | Equity gegen eine Range: River/Turn exakt, Flop Monte-Carlo |
| `src/review/postflop-rules.ts` | Alle Schwellen als Konstanten, Regeltabelle `judgePostflop` |
| `src/review/villain-range.ts` | Startrange des Gegners aus seiner Preflop-Rolle |
| `src/review/postflop.ts` | Postflop-Urteile einer Hand: Eingrenzung, Equity, Zahlen, Regeln |
| `src/review/postflop-text.ts` | Deutsche Texte für Urteile, Gründe und Rollen |
| `src/review/analysis.ts`, `preflop.ts`, `summary.ts`, `archive.ts`, `import.ts` | Analyse-Version 2, Union, Zählung, Prüfung, Analyzer im Import |
| `src/review/analyzer.ts`, `src/review/analysis.worker.ts` | Analyzer im Worker und im Hauptthread, Worker-Adapter |
| `src/app/review-store.ts` | Analyzer, Neubewertung beim Öffnen und im Hintergrund, serielle Turnier-Schritte |
| `src/ui/components/ReviewDecisionPanel.tsx` | Postflop-Urteil und Zahlen |
| `src/ui/screens/ReviewTournament.tsx`, `ReviewOverview.tsx`, `ReviewScreen.tsx`, `HomeScreen.tsx`, `review.css` | „Fraglich“, Spalte „Fehler postflop“, Fortschritt, Kachel-Text |
| `src/main.tsx`, `vite.config.ts` | Worker-Analyzer und Hintergrund-Neubewertung, ES-Worker |
| `scripts/review-bench.ts`, `package.json` | Messskript `npm run review:bench` |

---

### Task 1: Gewichtete Combo-Ranges, Card Removal, Handstärke und Draws

**Files:**
- Create: `src/engine/postflop/combos.ts`, `src/engine/postflop/combos.test.ts`, `src/engine/postflop/strength.ts`, `src/engine/postflop/strength.test.ts`

**Interfaces:**
- Consumes: `COMBOS`, `Card`, `HAND_COUNT`, `rankOf`, `suitOf`, `parseCard` aus `src/engine/cards.ts`; `evaluate7` aus `src/engine/evaluator.ts`; `parseRange` aus `src/engine/preflop/ranges.ts` (nur Tests)
- Produces (`src/engine/postflop/combos.ts`):
  - `COMBO_COUNT = 1326`, `COMBO_A: Uint8Array`, `COMBO_B: Uint8Array` (Karten je Combo-Index), `comboIndex(a: Card, b: Card): number`
  - `type ComboRange = Float64Array` (Gewicht je Combo-Index)
  - `rangeFromClasses(flags: readonly boolean[]): ComboRange`, `removeCards(range: ComboRange, cards: readonly Card[]): ComboRange`, `rangeWeight(range: ComboRange): number`
  - `keepShare(range: ComboRange, strength: Float64Array, share: number, from: 'strong' | 'weak'): ComboRange`
- Produces (`src/engine/postflop/strength.ts`):
  - `straightHigh(mask: number): number` (höchster Rang einer Straße in einer 13-Bit-Rangmaske, Wheel = 3, sonst −1)
  - `type Draw = { flushOuts: number; straightOuts: number; outs: number }`, `drawOuts(hole: readonly Card[], board: readonly Card[]): Draw`
  - `comboStrengths(board: readonly Card[], potPerOut: number): Float64Array` (Stärke je Combo-Index, 0 für Combos mit Board-Karte)

- [ ] **Step 1: Failing Tests schreiben**

`src/engine/postflop/combos.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { parseCard, rankOf } from '../cards';
import { parseRange } from '../preflop/ranges';
import { COMBO_A, COMBO_B, COMBO_COUNT, comboIndex, keepShare, rangeFromClasses, rangeWeight, removeCards } from './combos';

const c = parseCard;

describe('combo ranges', () => {
  it('numbers all 1326 combos in both card orders', () => {
    expect(COMBO_COUNT).toBe(1326);
    const i = comboIndex(c('Ah'), c('Kd'));
    expect(comboIndex(c('Kd'), c('Ah'))).toBe(i);
    expect([COMBO_A[i], COMBO_B[i]].sort()).toEqual([c('Ah'), c('Kd')].sort());
  });

  it('expands hand classes to combos with weight 1', () => {
    const range = rangeFromClasses(parseRange('AA, AKs, AKo'));
    expect(rangeWeight(range)).toBe(6 + 4 + 12);
    expect(range[comboIndex(c('Ah'), c('Kh'))]).toBe(1);
    expect(range[comboIndex(c('Kh'), c('Qh'))]).toBe(0);
  });

  it('removes combos that hold a known card (card removal)', () => {
    const range = removeCards(rangeFromClasses(parseRange('AA, KK')), [c('As'), c('Kd'), c('Kh')]);
    // AA: 3 of 6 combos without the A♠; KK: only K♣K♠ is left.
    expect(rangeWeight(range)).toBe(3 + 1);
    expect(range[comboIndex(c('Kc'), c('Ks'))]).toBe(1);
  });

  it('keeps exactly the strongest share and splits a tie group evenly', () => {
    const range = rangeFromClasses(parseRange('AA, KK'));
    const strength = new Float64Array(COMBO_COUNT);
    for (let i = 0; i < COMBO_COUNT; i++) strength[i] = rankOf(COMBO_A[i]) === 12 ? 2 : 1;
    // 12 combos: 6 × AA (strength 2), 6 × KK (strength 1). The strongest 75 % = 9 combos: all AA, half of every KK.
    const kept = keepShare(range, strength, 0.75, 'strong');
    expect(rangeWeight(kept)).toBeCloseTo(9, 9);
    expect(kept[comboIndex(c('Ah'), c('As'))]).toBe(1);
    expect(kept[comboIndex(c('Kh'), c('Ks'))]).toBeCloseTo(0.5, 9);
    // The weakest 25 % = 3 combos: half of every KK, no AA.
    const weak = keepShare(range, strength, 0.25, 'weak');
    expect(rangeWeight(weak)).toBeCloseTo(3, 9);
    expect(weak[comboIndex(c('Ah'), c('As'))]).toBe(0);
  });

  it('keeps reduced weights in proportion when it narrows again', () => {
    const range = rangeFromClasses(parseRange('AA'));
    const flat = new Float64Array(COMBO_COUNT).fill(1);
    const twice = keepShare(keepShare(range, flat, 0.5, 'strong'), flat, 0.5, 'strong');
    expect(rangeWeight(twice)).toBeCloseTo(1.5, 9);
  });
});
```

`src/engine/postflop/strength.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { parseCard } from '../cards';
import { comboIndex } from './combos';
import { comboStrengths, drawOuts, straightHigh } from './strength';

const cards = (s: string) => s.split(' ').map(parseCard);
const outs = (hole: string, board: string) => drawOuts(cards(hole), cards(board));
const mask = (ranks: string) => [...ranks].reduce((m, r) => m | (1 << '23456789TJQKA'.indexOf(r)), 0);

describe('straightHigh', () => {
  it('finds the highest straight and the wheel', () => {
    expect(straightHigh(mask('9TJQK'))).toBe(11);
    expect(straightHigh(mask('89TJQKA'))).toBe(12);
    expect(straightHigh(mask('A2345'))).toBe(3);
    expect(straightHigh(mask('A2346'))).toBe(-1);
  });
});

describe('drawOuts', () => {
  it('counts 9 outs for a flush draw and 8 for an open-ended straight draw', () => {
    expect(outs('Ah Kh', 'Qh 7h 2c')).toEqual({ flushOuts: 9, straightOuts: 0, outs: 9 });
    expect(outs('9c 8d', '7h 6s 2c')).toEqual({ flushOuts: 0, straightOuts: 8, outs: 8 });
  });

  it('counts a gutshot with 4 outs and a combo draw without double counting', () => {
    expect(outs('9c 8d', 'Jh 7s 2c').outs).toBe(4);
    expect(outs('Ac 2d', '3h 4s 9c').outs).toBe(4);
    // Flush draw plus open-ended: 9 + 8 − 2 shared cards (the 5♥ and the T♥).
    expect(outs('9h 8h', '7h 6s 2h')).toEqual({ flushOuts: 9, straightOuts: 8, outs: 15 });
  });

  it('ignores draws the board makes alone, made hands and the river', () => {
    // Four to a straight on the board: the hole cards add nothing.
    expect(outs('2c 2d', '9h Ts Jc Qd').straightOuts).toBe(0);
    // Four hearts on the board, none in the hand.
    expect(outs('Ac Kd', '2h 7h 9h Jh').flushOuts).toBe(0);
    expect(outs('Kc Qd', 'Jh Ts 9c').outs).toBe(0);
    expect(outs('Ah Kh', 'Qh 7h 2h').outs).toBe(0);
    expect(outs('Ah Kh', 'Qh 7h 2c 3d 4s').outs).toBe(0);
  });
});

describe('comboStrengths', () => {
  const board = cards('Ks 7d 2c');
  const strength = comboStrengths(board, 0.04);
  const of = (a: string, b: string) => strength[comboIndex(parseCard(a), parseCard(b))];

  it('orders made hands: set over top pair over middle pair over nothing', () => {
    expect(of('7h', '7c')).toBeGreaterThan(of('Ah', 'Kd'));
    expect(of('Ah', 'Kd')).toBeGreaterThan(of('8h', '7c'));
    expect(of('8h', '7c')).toBeGreaterThan(of('Jh', '9c'));
    expect(of('7h', '7c')).toBeLessThanOrEqual(1);
  });

  it('lifts draws by their outs and is 0 for combos that hold a board card', () => {
    const drawBoard = cards('Qh 7h 2c');
    const withDraw = comboStrengths(drawBoard, 0.04);
    const without = comboStrengths(drawBoard, 0);
    const i = comboIndex(parseCard('Ah'), parseCard('5h'));
    expect(withDraw[i]).toBeGreaterThan(without[i] + 0.15);
    expect(of('Ks', 'Kd')).toBe(0);
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/engine/postflop` → Expected: FAIL (Module `./combos` und `./strength` fehlen).

- [ ] **Step 3: Implementierung**

`src/engine/postflop/combos.ts` anlegen:
```ts
import { COMBOS, type Card, HAND_COUNT } from '../cards';

/** All 1326 two-card combos (a < b), in a fixed order; a combo range is one weight per entry. */
export const COMBO_COUNT = 1326;
export const COMBO_A = new Uint8Array(COMBO_COUNT);
export const COMBO_B = new Uint8Array(COMBO_COUNT);
const INDEX = new Int16Array(52 * 52).fill(-1);
{
  let i = 0;
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) {
      COMBO_A[i] = a;
      COMBO_B[i] = b;
      INDEX[a * 52 + b] = i;
      INDEX[b * 52 + a] = i;
      i++;
    }
  }
}

export const comboIndex = (a: Card, b: Card): number => INDEX[a * 52 + b];

/** Weight per combo (index from `comboIndex`); 0 = not in the range. */
export type ComboRange = Float64Array;

/** Every combo of the flagged hand classes with weight 1. */
export function rangeFromClasses(flags: readonly boolean[]): ComboRange {
  const range = new Float64Array(COMBO_COUNT);
  for (let h = 0; h < HAND_COUNT; h++) {
    if (!flags[h]) continue;
    for (const [a, b] of COMBOS[h]) range[comboIndex(a, b)] = 1;
  }
  return range;
}

/** Card removal: combos that contain one of `cards` drop out. */
export function removeCards(range: ComboRange, cards: readonly Card[]): ComboRange {
  const out = Float64Array.from(range);
  for (let i = 0; i < COMBO_COUNT; i++) {
    if (out[i] === 0) continue;
    for (const c of cards) {
      if (COMBO_A[i] === c || COMBO_B[i] === c) {
        out[i] = 0;
        break;
      }
    }
  }
  return out;
}

export function rangeWeight(range: ComboRange): number {
  let sum = 0;
  for (let i = 0; i < COMBO_COUNT; i++) sum += range[i];
  return sum;
}

const EPS = 1e-9;

/**
 * Keeps `share` (0–1) of the range weight: the strongest combos when `from` is 'strong', the weakest otherwise.
 * Combos are ordered by `strength` (higher = stronger). Combos of equal strength form one group; the group that
 * crosses the limit is kept with the same reduced weight for each of its combos, so the result never depends on
 * the order of equally strong combos and holds exactly `share` of the weight.
 */
export function keepShare(range: ComboRange, strength: Float64Array, share: number, from: 'strong' | 'weak'): ComboRange {
  const live: number[] = [];
  let total = 0;
  for (let i = 0; i < COMBO_COUNT; i++) {
    if (range[i] > 0) {
      live.push(i);
      total += range[i];
    }
  }
  const sign = from === 'strong' ? -1 : 1;
  live.sort((x, y) => sign * (strength[x] - strength[y]) || x - y);
  const out = new Float64Array(COMBO_COUNT);
  let left = Math.max(0, Math.min(1, share)) * total;
  for (let g = 0; g < live.length && left > EPS; ) {
    let end = g;
    let weight = 0;
    while (end < live.length && strength[live[end]] === strength[live[g]]) weight += range[live[end++]];
    const factor = weight <= left + EPS ? 1 : left / weight;
    for (let k = g; k < end; k++) out[live[k]] = range[live[k]] * factor;
    left -= weight * factor;
    g = end;
  }
  return out;
}
```

`src/engine/postflop/strength.ts` anlegen:
```ts
import { type Card, rankOf, suitOf } from '../cards';
import { evaluate7 } from '../evaluator';
import { COMBO_A, COMBO_B, COMBO_COUNT } from './combos';

const WHEEL = (1 << 12) | 0b1111;

/** Highest rank of a straight inside a 13-bit rank mask, or -1 (the wheel counts as 3, the Five). */
export function straightHigh(mask: number): number {
  for (let hi = 12; hi >= 4; hi--) {
    const run = 0b11111 << (hi - 4);
    if ((mask & run) === run) return hi;
  }
  return (mask & WHEEL) === WHEEL ? 3 : -1;
}

export type Draw = { flushOuts: number; straightOuts: number; outs: number };
const NO_DRAW: Draw = { flushOuts: 0, straightOuts: 0, outs: 0 };

/**
 * Outs to a straight or a flush that uses at least one hole card. Flush draw: four cards of a suit with at least one
 * of them in the hand. Straight draw: every rank that completes a straight which the board alone would not make.
 * No draw once the hand already holds a flush; no straight draw once it holds a straight. On the river: none.
 */
export function drawOuts(hole: readonly Card[], board: readonly Card[]): Draw {
  if (board.length >= 5) return NO_DRAW;
  let seenLow = 0;
  let seenHigh = 0;
  const see = (c: Card) => (c < 26 ? (seenLow |= 1 << c) : (seenHigh |= 1 << (c - 26)));
  const seen = (c: Card) => (c < 26 ? (seenLow >> c) & 1 : (seenHigh >> (c - 26)) & 1) === 1;
  const suitCount = [0, 0, 0, 0];
  const holeSuits = [0, 0, 0, 0];
  let mask = 0;
  let boardMask = 0;
  for (const c of hole) {
    see(c);
    suitCount[suitOf(c)]++;
    holeSuits[suitOf(c)]++;
    mask |= 1 << rankOf(c);
  }
  for (const c of board) {
    see(c);
    suitCount[suitOf(c)]++;
    mask |= 1 << rankOf(c);
    boardMask |= 1 << rankOf(c);
  }
  if (suitCount.some((n) => n >= 5)) return NO_DRAW;

  const outs = new Set<Card>();
  let flushOuts = 0;
  for (let s = 0; s < 4; s++) {
    if (suitCount[s] !== 4 || holeSuits[s] === 0) continue;
    for (let r = 0; r < 13; r++) {
      const c = r * 4 + s;
      if (!seen(c)) {
        outs.add(c);
        flushOuts++;
      }
    }
  }
  let straightOuts = 0;
  if (straightHigh(mask) < 0) {
    for (let r = 0; r < 13; r++) {
      if (mask & (1 << r)) continue;
      const made = straightHigh(mask | (1 << r));
      if (made < 0 || made <= straightHigh(boardMask | (1 << r))) continue;
      for (let s = 0; s < 4; s++) {
        const c = r * 4 + s;
        if (seen(c)) continue;
        straightOuts++;
        outs.add(c);
      }
    }
  }
  return { flushOuts, straightOuts, outs: outs.size };
}

/**
 * Strength of every combo on this board, used to order a range (higher = stronger), 0 for combos that collide
 * with the board. Made hand: share of all other combos it beats right now (ties count half). Draw value: the chance
 * to hit an out, `outs × potPerOut` (rule of 2 and 4), which lifts the part the made hand does not win yet:
 * strength = made + (1 − made) × min(1, outs × potPerOut).
 */
export function comboStrengths(board: readonly Card[], potPerOut: number): Float64Array {
  const cards = new Int32Array(board.length + 2);
  board.forEach((c, i) => (cards[i + 2] = c));
  const blocked = (i: number) => board.includes(COMBO_A[i]) || board.includes(COMBO_B[i]);
  const scores = new Float64Array(COMBO_COUNT).fill(-1);
  const live: number[] = [];
  for (let i = 0; i < COMBO_COUNT; i++) {
    if (blocked(i)) continue;
    cards[0] = COMBO_A[i];
    cards[1] = COMBO_B[i];
    scores[i] = evaluate7(cards);
    live.push(i);
  }
  const sorted = live.map((i) => scores[i]).sort((x, y) => x - y);
  const below = (v: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const above = (v: number) => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const out = new Float64Array(COMBO_COUNT);
  const others = Math.max(1, live.length - 1);
  for (const i of live) {
    const v = scores[i];
    const lower = below(v);
    const equal = above(v) - lower - 1;
    const made = (lower + equal / 2) / others;
    const draw = potPerOut > 0 ? Math.min(1, drawOuts([COMBO_A[i], COMBO_B[i]], board).outs * potPerOut) : 0;
    out[i] = made + (1 - made) * draw;
  }
  return out;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/engine/postflop` → Expected: PASS (11 Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (617 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/engine/postflop/combos.ts src/engine/postflop/combos.test.ts src/engine/postflop/strength.ts src/engine/postflop/strength.test.ts
git commit -m "feat(engine): gewichtete Combo-Ranges mit Card Removal, Handstärke und Draws für die Postflop-Bewertung" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Equity gegen eine gewichtete Range

**Files:**
- Create: `src/engine/postflop/range-equity.ts`, `src/engine/postflop/range-equity.test.ts`

**Interfaces:**
- Consumes: `COMBO_A`, `COMBO_B`, `COMBO_COUNT`, `ComboRange`, `comboIndex`, `rangeFromClasses`, `removeCards` (Task 1); `evaluate7`; `Rng`, `mulberry32`; `parseRange`
- Produces (`src/engine/postflop/range-equity.ts`): `equityVsRange(hero: readonly [Card, Card], board: readonly Card[], range: ComboRange, rng: Rng, samples: number): number | null` – Equity 0–1, `null` ohne verbleibende Combo; River und Turn exakt (`rng`/`samples` unbenutzt), Flop mit `samples` Monte-Carlo-Durchläufen

- [ ] **Step 1: Failing Test schreiben**

`src/engine/postflop/range-equity.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { parseCard } from '../cards';
import { parseRange } from '../preflop/ranges';
import { mulberry32 } from '../rng';
import { comboIndex, rangeFromClasses, removeCards } from './combos';
import { equityVsRange } from './range-equity';

const cards = (s: string) => s.split(' ').map(parseCard);
const hand = (s: string) => cards(s) as [number, number];
const range = (text: string, dead: string) => removeCards(rangeFromClasses(parseRange(text)), cards(dead));

describe('equityVsRange', () => {
  it('counts the river exactly, ties count half', () => {
    // A set of kings against AA and QQ: every combo loses.
    expect(equityVsRange(hand('Kh Kd'), cards('Ks 7d 2c 9h 4s'), range('AA, QQ', 'Kh Kd Ks 7d 2c 9h 4s'), mulberry32(1), 0)).toBe(1);
    // Broadway on the board: everybody chops.
    expect(equityVsRange(hand('2h 3d'), cards('As Ks Qd Jc Th'), range('AA, 76s', '2h 3d As Ks Qd Jc Th'), mulberry32(1), 0)).toBe(0.5);
  });

  it('counts the turn exactly over every river card', () => {
    // A♥K♥ against 2♣2♦ on A♠ 7♦ 3♣ 9♥: only the two remaining deuces lose for the hero (44 river cards).
    const r = new Float64Array(1326);
    r[comboIndex(parseCard('2c'), parseCard('2d'))] = 1;
    expect(equityVsRange(hand('Ah Kh'), cards('As 7d 3c 9h'), r, mulberry32(1), 0)).toBeCloseTo(42 / 44, 9);
  });

  it('samples the flop with a fixed seed: same seed, same number, close to the exact value', () => {
    const villain = range('22', 'Ah Kh As 7d 3c');
    const a = equityVsRange(hand('Ah Kh'), cards('As 7d 3c'), villain, mulberry32(42), 4000);
    const b = equityVsRange(hand('Ah Kh'), cards('As 7d 3c'), villain, mulberry32(42), 4000);
    expect(a).toBe(b);
    // Exact: 22 needs a deuce (set) or runner-runner; about 91 % for top pair top kicker.
    expect(a!).toBeGreaterThan(0.88);
    expect(a!).toBeLessThan(0.94);
  });

  it('weights combos and returns null for an empty range', () => {
    const r = new Float64Array(1326);
    r[comboIndex(parseCard('Qc'), parseCard('Qd'))] = 3;
    r[comboIndex(parseCard('2c'), parseCard('3d'))] = 1;
    // Against QQ the hero (KK) wins, against 23 he wins: equity 1 either way on this river.
    expect(equityVsRange(hand('Kh Kd'), cards('Ks 7d 8c 9h Js'), r, mulberry32(1), 0)).toBe(1);
    r[comboIndex(parseCard('2c'), parseCard('3d'))] = 0;
    r[comboIndex(parseCard('Tc'), parseCard('Td'))] = 1;
    // TT makes the straight 7-J: 3 parts QQ (lose to KKK) and 1 part TT (win) → 0.75.
    expect(equityVsRange(hand('Kh Kd'), cards('Ks 7d 8c 9h Js'), r, mulberry32(1), 0)).toBe(0.75);
    expect(equityVsRange(hand('Kh Kd'), cards('Ks 7d 8c'), new Float64Array(1326), mulberry32(1), 100)).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `npm test -- src/engine/postflop/range-equity.test.ts` → Expected: FAIL (Modul `./range-equity` fehlt).

- [ ] **Step 3: Implementierung**

`src/engine/postflop/range-equity.ts` anlegen:
```ts
import type { Card } from '../cards';
import { evaluate7 } from '../evaluator';
import type { Rng } from '../rng';
import { COMBO_A, COMBO_B, COMBO_COUNT, type ComboRange } from './combos';

const points = (hero: number, villain: number) => (hero > villain ? 1 : hero === villain ? 0.5 : 0);

/**
 * Equity of `hero` against a weighted range on a flop, turn or river board (0–1); null when no combo is left.
 * River and turn are counted exactly (every combo, every river card); on the flop `samples` runouts are drawn with
 * `rng` (combo by weight, then turn and river), so a fixed seed always gives the same number.
 */
export function equityVsRange(hero: readonly [Card, Card], board: readonly Card[], range: ComboRange, rng: Rng, samples: number): number | null {
  const dead = new Uint8Array(52);
  for (const c of [...hero, ...board]) dead[c] = 1;
  const combos: number[] = [];
  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < COMBO_COUNT; i++) {
    if (range[i] <= 0 || dead[COMBO_A[i]] || dead[COMBO_B[i]]) continue;
    combos.push(i);
    weights.push(range[i]);
    total += range[i];
  }
  if (total <= 0) return null;

  const h = new Int32Array(7);
  const v = new Int32Array(7);
  h[0] = hero[0];
  h[1] = hero[1];
  board.forEach((c, k) => {
    h[k + 2] = c;
    v[k + 2] = c;
  });

  if (board.length === 5) {
    const heroScore = evaluate7(h);
    let won = 0;
    combos.forEach((i, k) => {
      v[0] = COMBO_A[i];
      v[1] = COMBO_B[i];
      won += weights[k] * points(heroScore, evaluate7(v));
    });
    return won / total;
  }

  if (board.length === 4) {
    const heroScore = new Float64Array(52);
    for (let c = 0; c < 52; c++) {
      if (dead[c]) continue;
      h[6] = c;
      heroScore[c] = evaluate7(h);
    }
    let won = 0;
    let weight = 0;
    combos.forEach((i, k) => {
      v[0] = COMBO_A[i];
      v[1] = COMBO_B[i];
      for (let c = 0; c < 52; c++) {
        if (dead[c] || c === v[0] || c === v[1]) continue;
        v[6] = c;
        won += weights[k] * points(heroScore[c], evaluate7(v));
        weight += weights[k];
      }
    });
    return won / weight;
  }

  // Flop: Monte-Carlo over combo and runout.
  const cumulative = new Float64Array(combos.length);
  let acc = 0;
  weights.forEach((w, k) => (cumulative[k] = acc += w));
  let won = 0;
  for (let s = 0; s < samples; s++) {
    const target = rng() * total;
    let lo = 0;
    let hi = combos.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] <= target) lo = mid + 1;
      else hi = mid;
    }
    const i = combos[lo];
    const a = COMBO_A[i];
    const b = COMBO_B[i];
    let turn: number;
    do turn = Math.floor(rng() * 52);
    while (dead[turn] || turn === a || turn === b);
    let river: number;
    do river = Math.floor(rng() * 52);
    while (dead[river] || river === a || river === b || river === turn);
    h[5] = turn;
    h[6] = river;
    v[0] = a;
    v[1] = b;
    v[5] = turn;
    v[6] = river;
    won += points(evaluate7(h), evaluate7(v));
  }
  return won / samples;
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npm test -- src/engine/postflop/range-equity.test.ts` → Expected: PASS (4 Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (621 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/engine/postflop/range-equity.ts src/engine/postflop/range-equity.test.ts
git commit -m "feat(engine): Equity gegen eine gewichtete Range, River und Turn exakt, Flop per Monte-Carlo mit festem Seed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Regeltabelle mit allen Schwellen als Konstanten

**Files:**
- Create: `src/review/postflop-rules.ts`, `src/review/postflop-rules.test.ts`

**Interfaces:**
- Consumes: `BoardStreet` aus `src/review/parse.ts`
- Produces (`src/review/postflop-rules.ts`):
  - Konstanten: `KEEP_AFTER_BET = 0.6`, `KEEP_AFTER_RAISE = 0.3`, `KEEP_AFTER_ALL_IN = 0.25`, `KEEP_AFTER_CALL = 0.7`, `KEEP_AFTER_CHECK = 0.9`, `POT_PER_OUT: Record<BoardStreet, number>` (`{ flop: 0.04, turn: 0.02, river: 0 }`), `FLOP_SAMPLES = 4000`, `CALL_MISTAKE_MARGIN = 10`, `CALL_QUESTION_MARGIN = 3`, `IMPLIED_ODDS_BONUS = 5`, `DRAW_MIN_OUTS = 8`, `FOLD_MISTAKE_MARGIN = 15`, `FOLD_QUESTION_MARGIN = 5`, `RAISE_MIN_EQUITY = 35`, `BET_MIN_SHARE = 0.2`, `BET_MAX_SHARE = 1.5`, `RIVER_BET_MIDDLE_LOW = 35`, `RIVER_BET_MIDDLE_HIGH = 55`, `RIVER_CHECK_VALUE = 75`
  - `type PostflopVerdict = 'ok' | 'questionable' | 'mistake'`
  - `type PostflopReason = 'callOk' | 'callThin' | 'callTooWeak' | 'foldOk' | 'foldThin' | 'foldTooStrong' | 'raiseOk' | 'raiseWeak' | 'betOk' | 'betSize' | 'riverBetMiddle' | 'checkOk' | 'checkValue'`
  - `type PostflopSituation = { street: BoardStreet; action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn'; equity: number; needed: number; betShare: number | null; outs: number; chipsBehind: boolean; heroActsLast: boolean }` (Equity und nötige Equity in Prozentpunkten)
  - `type PostflopJudgement = { verdict: PostflopVerdict; reason: PostflopReason; bonus: number }`, `judgePostflop(s: PostflopSituation): PostflopJudgement`

- [ ] **Step 1: Failing Test schreiben**

`src/review/postflop-rules.test.ts` anlegen (jede Zeile der Tabelle aus Spec 7 mit ihren Grenzwerten):
```ts
import { describe, expect, it } from 'vitest';
import { type PostflopSituation, judgePostflop } from './postflop-rules';

const base: PostflopSituation = { street: 'flop', action: 'call', equity: 30, needed: 30, betShare: null, outs: 0, chipsBehind: true, heroActsLast: false };
const judge = (over: Partial<PostflopSituation>) => judgePostflop({ ...base, ...over });

describe('judgePostflop (spec 7 rule table)', () => {
  it('call: mistake below needed − 10, questionable below needed − 3, else ok', () => {
    expect(judge({ equity: 19.9 })).toEqual({ verdict: 'mistake', reason: 'callTooWeak', bonus: 0 });
    expect(judge({ equity: 20 })).toEqual({ verdict: 'questionable', reason: 'callThin', bonus: 0 });
    expect(judge({ equity: 26.9 })).toMatchObject({ verdict: 'questionable' });
    expect(judge({ equity: 27 })).toEqual({ verdict: 'ok', reason: 'callOk', bonus: 0 });
  });

  it('call with a draw of 8+ outs gets 5 points on flop and turn, not on the river and not all-in', () => {
    expect(judge({ equity: 19, outs: 8 })).toEqual({ verdict: 'questionable', reason: 'callThin', bonus: 5 });
    expect(judge({ street: 'turn', equity: 22, outs: 9 })).toEqual({ verdict: 'ok', reason: 'callOk', bonus: 5 });
    expect(judge({ equity: 19, outs: 7 })).toMatchObject({ verdict: 'mistake', bonus: 0 });
    expect(judge({ street: 'river', equity: 19, outs: 8 })).toMatchObject({ verdict: 'mistake', bonus: 0 });
    expect(judge({ equity: 19, outs: 9, chipsBehind: false })).toMatchObject({ verdict: 'mistake', bonus: 0 });
  });

  it('fold: mistake above needed + 15, questionable above needed + 5, else ok', () => {
    expect(judge({ action: 'fold', equity: 45.1 })).toEqual({ verdict: 'mistake', reason: 'foldTooStrong', bonus: 0 });
    expect(judge({ action: 'fold', equity: 45 })).toEqual({ verdict: 'questionable', reason: 'foldThin', bonus: 0 });
    expect(judge({ action: 'fold', equity: 35.1 })).toMatchObject({ verdict: 'questionable' });
    expect(judge({ action: 'fold', equity: 35 })).toEqual({ verdict: 'ok', reason: 'foldOk', bonus: 0 });
  });

  it('raise or all-in: questionable below 35 % equity', () => {
    expect(judge({ action: 'raise', equity: 34.9 })).toEqual({ verdict: 'questionable', reason: 'raiseWeak', bonus: 0 });
    expect(judge({ action: 'allIn', equity: 20 })).toMatchObject({ verdict: 'questionable', reason: 'raiseWeak' });
    expect(judge({ action: 'raise', equity: 35 })).toEqual({ verdict: 'ok', reason: 'raiseOk', bonus: 0 });
  });

  it('bet: questionable below 20 % or above 150 % of the pot, and on the river with 35–55 % equity', () => {
    const bet = (betShare: number, over: Partial<PostflopSituation> = {}) => judge({ action: 'bet', needed: 0, equity: 60, betShare, ...over });
    expect(bet(0.19)).toEqual({ verdict: 'questionable', reason: 'betSize', bonus: 0 });
    expect(bet(1.51)).toMatchObject({ reason: 'betSize' });
    expect(bet(0.2)).toEqual({ verdict: 'ok', reason: 'betOk', bonus: 0 });
    expect(bet(1.5)).toMatchObject({ verdict: 'ok' });
    expect(bet(0.5, { street: 'river', equity: 35 })).toEqual({ verdict: 'questionable', reason: 'riverBetMiddle', bonus: 0 });
    expect(bet(0.5, { street: 'river', equity: 55 })).toMatchObject({ reason: 'riverBetMiddle' });
    expect(bet(0.5, { street: 'river', equity: 55.1 })).toMatchObject({ verdict: 'ok' });
    expect(bet(0.5, { street: 'river', equity: 10 })).toMatchObject({ verdict: 'ok' });
    expect(bet(0.5, { street: 'turn', equity: 45 })).toMatchObject({ verdict: 'ok' });
  });

  it('check: questionable only on the river as the last to act with more than 75 % equity', () => {
    const check = (over: Partial<PostflopSituation>) => judge({ action: 'check', needed: 0, ...over });
    expect(check({ street: 'river', heroActsLast: true, equity: 75.1 })).toEqual({ verdict: 'questionable', reason: 'checkValue', bonus: 0 });
    expect(check({ street: 'river', heroActsLast: true, equity: 75 })).toEqual({ verdict: 'ok', reason: 'checkOk', bonus: 0 });
    expect(check({ street: 'river', heroActsLast: false, equity: 95 })).toMatchObject({ verdict: 'ok' });
    expect(check({ street: 'turn', heroActsLast: true, equity: 95 })).toMatchObject({ verdict: 'ok' });
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `npm test -- src/review/postflop-rules.test.ts` → Expected: FAIL (Modul `./postflop-rules` fehlt).

- [ ] **Step 3: Implementierung**

`src/review/postflop-rules.ts` anlegen:
```ts
import type { BoardStreet } from './parse';

/*
 * Every number of the postflop rules of thumb (spec 7) lives in this file.
 * Equity values and margins are percentage points (0–100); shares of a range or of the pot are 0–1.
 */

/** Range narrowing per villain action: the share of his range weight that stays (spec 7, step 2). */
export const KEEP_AFTER_BET = 0.6;
export const KEEP_AFTER_RAISE = 0.3;
export const KEEP_AFTER_ALL_IN = 0.25;
/** A call drops the weakest 30 %. */
export const KEEP_AFTER_CALL = 0.7;
/** A check drops the strongest 10 %. */
export const KEEP_AFTER_CHECK = 0.9;

/** Draw value in the hand strength: chance to hit per out (rule of 4 on the flop, of 2 on the turn). */
export const POT_PER_OUT: Record<BoardStreet, number> = { flop: 0.04, turn: 0.02, river: 0 };

/** Monte-Carlo runouts for an equity on the flop (turn and river are counted exactly). */
export const FLOP_SAMPLES = 4000;

/** Call against a bet or raise. */
export const CALL_MISTAKE_MARGIN = 10;
export const CALL_QUESTION_MARGIN = 3;
/** Implied odds: a call with a draw of at least 8 outs to a straight or flush gets 5 points on flop and turn. */
export const IMPLIED_ODDS_BONUS = 5;
export const DRAW_MIN_OUTS = 8;
/** Fold against a bet or raise. */
export const FOLD_MISTAKE_MARGIN = 15;
export const FOLD_QUESTION_MARGIN = 5;
/** Raise or all-in with less equity than this is questionable. */
export const RAISE_MIN_EQUITY = 35;
/** Bet sizes outside 20–150 % of the pot are questionable. */
export const BET_MIN_SHARE = 0.2;
export const BET_MAX_SHARE = 1.5;
/** A river bet with a middling hand: neither clear value nor a clear bluff. */
export const RIVER_BET_MIDDLE_LOW = 35;
export const RIVER_BET_MIDDLE_HIGH = 55;
/** A river check as the last to act with more equity than this gives away value. */
export const RIVER_CHECK_VALUE = 75;

export type PostflopVerdict = 'ok' | 'questionable' | 'mistake';
export type PostflopReason =
  | 'callOk'
  | 'callThin'
  | 'callTooWeak'
  | 'foldOk'
  | 'foldThin'
  | 'foldTooStrong'
  | 'raiseOk'
  | 'raiseWeak'
  | 'betOk'
  | 'betSize'
  | 'riverBetMiddle'
  | 'checkOk'
  | 'checkValue';

export type PostflopSituation = {
  street: BoardStreet;
  /** 'allIn' covers every bet or raise that puts the hero all-in; an all-in call is a 'call'. */
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn';
  /** Hero equity, 0–100. */
  equity: number;
  /** Equity the pot odds ask for, 0–100; 0 when there is nothing to call. */
  needed: number;
  /** Bet as a share of the pot before it; null for anything but a bet. */
  betShare: number | null;
  outs: number;
  /** Both players still have chips after a call, so implied odds exist (no bonus for an all-in call). */
  chipsBehind: boolean;
  /** River only: the villain acted before the hero on this street, so the hero closes the action. */
  heroActsLast: boolean;
};
export type PostflopJudgement = { verdict: PostflopVerdict; reason: PostflopReason; bonus: number };

const judge = (verdict: PostflopVerdict, reason: PostflopReason, bonus = 0): PostflopJudgement => ({ verdict, reason, bonus });

/** The rule table of spec 7. */
export function judgePostflop(s: PostflopSituation): PostflopJudgement {
  switch (s.action) {
    case 'call': {
      const bonus = s.street !== 'river' && s.chipsBehind && s.outs >= DRAW_MIN_OUTS ? IMPLIED_ODDS_BONUS : 0;
      const equity = s.equity + bonus;
      if (equity < s.needed - CALL_MISTAKE_MARGIN) return judge('mistake', 'callTooWeak', bonus);
      if (equity < s.needed - CALL_QUESTION_MARGIN) return judge('questionable', 'callThin', bonus);
      return judge('ok', 'callOk', bonus);
    }
    case 'fold':
      if (s.equity > s.needed + FOLD_MISTAKE_MARGIN) return judge('mistake', 'foldTooStrong');
      if (s.equity > s.needed + FOLD_QUESTION_MARGIN) return judge('questionable', 'foldThin');
      return judge('ok', 'foldOk');
    case 'raise':
    case 'allIn':
      return s.equity < RAISE_MIN_EQUITY ? judge('questionable', 'raiseWeak') : judge('ok', 'raiseOk');
    case 'bet': {
      const share = s.betShare ?? 0;
      if (share < BET_MIN_SHARE || share > BET_MAX_SHARE) return judge('questionable', 'betSize');
      if (s.street === 'river' && s.equity >= RIVER_BET_MIDDLE_LOW && s.equity <= RIVER_BET_MIDDLE_HIGH) {
        return judge('questionable', 'riverBetMiddle');
      }
      return judge('ok', 'betOk');
    }
    case 'check':
      if (s.street === 'river' && s.heroActsLast && s.equity > RIVER_CHECK_VALUE) return judge('questionable', 'checkValue');
      return judge('ok', 'checkOk');
  }
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npm test -- src/review/postflop-rules.test.ts` → Expected: PASS (6 Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (627 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/review/postflop-rules.ts src/review/postflop-rules.test.ts
git commit -m "feat(review): Regeltabelle der Postflop-Faustregeln mit allen Schwellen als Konstanten" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Startrange des Gegners aus seiner Preflop-Rolle

**Files:**
- Create: `src/review/villain-range.ts`, `src/review/villain-range.test.ts`
- Modify: `src/review/preflop.ts`

**Interfaces:**
- Consumes: `chartFor` (`src/engine/preflop/charts.ts`), `PreflopSituation`, `StackDepth`, `Position`; `playableChips`, `positionsOf`; `ActionEvent`, `HERO`, `ParsedHand`, `parseHand`; `modelFor` (`src/review/preflop.ts`); `ggHand`, `foldsBetween`, `TestHandOptions` (Tests)
- Produces:
  - `src/review/preflop.ts`: `UnratedReason` zusätzlich `'multiwayPostflop' | 'unknownRange' | 'limpRange' | 'deepRange' | 'shortRange'` mit Texten in `UNRATED_TEXT`
  - `src/review/villain-range.ts`: `type VillainRole = 'opener' | 'caller' | 'bbDefender' | 'threeBettor' | 'callerVs3bet'`; `type VillainStart = { villain: string; position: Position; role: VillainRole; chartKey: string; part: 'aggressive' | 'call'; depth: StackDepth; approximation: boolean; effectiveBb: number; flags: boolean[] }`; `type RangeProblem = 'multiwayPostflop' | 'unknownRange' | 'limpRange' | 'deepRange' | 'shortRange'`; `villainStart(hand: ParsedHand, positions: ReadonlyMap<string, Position>): VillainStart | RangeProblem`

- [ ] **Step 1: Failing Test schreiben**

`src/review/villain-range.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { chartFor } from '../engine/preflop/charts';
import { positionsOf } from './hand-model';
import { parseHand } from './parse';
import { type TestHandOptions, foldsBetween, ggHand } from './test-hands';
import { villainStart } from './villain-range';

const FLOP = ['*** FLOP *** [2c 7d 9h]', 'Hero: checks'];
const start = (o: TestHandOptions) => {
  const hand = parseHand(ggHand(o));
  return villainStart(hand, positionsOf(hand)!);
};

describe('villainStart', () => {
  it('opener: the rfi range of his position', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'Hero: calls 220', 'SB: folds', 'BB: folds', ...FLOP];
    const s = start({ hero: 'BTN', lines });
    expect(s).toMatchObject({ villain: 'CO', position: 'CO', role: 'opener', chartKey: 'rfi:100:CO', part: 'aggressive', depth: 100, approximation: false });
    if (typeof s !== 'string') expect(s.flags).toEqual([...chartFor({ kind: 'rfi', stack: 100, hero: 'CO', villain: null }).aggressive]);
  });

  it('caller against the hero open: the call part of vsOpen by his position group', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'Hero: raises 120 to 220', 'BTN: calls 220', 'SB: folds', 'BB: folds', ...FLOP];
    expect(start({ hero: 'CO', lines })).toMatchObject({ villain: 'BTN', role: 'caller', chartKey: 'vsOpen:100:CO:ip', part: 'call' });
  });

  it('BB defence: vsOpen:…:bb', () => {
    const lines = [...foldsBetween('UTG', 'BTN'), 'Hero: raises 120 to 220', 'SB: folds', 'BB: calls 120', ...FLOP];
    expect(start({ hero: 'BTN', lines })).toMatchObject({ villain: 'BB', role: 'bbDefender', chartKey: 'vsOpen:100:BTN:bb', part: 'call' });
  });

  it('3-bettor: the aggressive part of vsOpen', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'Hero: raises 120 to 220', 'BTN: raises 440 to 660', 'SB: folds', 'BB: folds', 'Hero: calls 440', ...FLOP];
    expect(start({ hero: 'CO', lines })).toMatchObject({ villain: 'BTN', role: 'threeBettor', chartKey: 'vsOpen:100:CO:ip', part: 'aggressive' });
  });

  it('caller against the hero 3-bet: the call part of vs3bet', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'Hero: raises 440 to 660', 'SB: folds', 'BB: folds', 'CO: calls 440', ...FLOP];
    expect(start({ hero: 'BTN', lines })).toMatchObject({ villain: 'CO', role: 'callerVs3bet', chartKey: 'vs3bet:100:CO:ip', part: 'call' });
  });

  it('maps the effective stack like the preflop rating: 40 BB chart, approximation, nothing up to 20 BB', () => {
    const lines = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'Hero: calls 220', 'SB: folds', 'BB: folds', ...FLOP];
    expect(start({ hero: 'BTN', stacksBb: { BTN: 28 }, lines })).toMatchObject({ chartKey: 'rfi:40:CO', depth: 40, approximation: true });
    expect(start({ hero: 'BTN', stacksBb: { CO: 35 }, lines })).toMatchObject({ depth: 40, approximation: false });
    expect(start({ hero: 'BTN', stacksBb: { BTN: 18 }, lines })).toBe('shortRange');
  });

  it('names why there is no range: multiway, limp pot, 4-bet pot, cold 3-bet', () => {
    const open = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220'];
    expect(start({ hero: 'BTN', lines: [...open, 'Hero: calls 220', 'SB: folds', 'BB: calls 120', ...FLOP] })).toBe('multiwayPostflop');
    const limpers = ['UTG: calls 100', ...foldsBetween('UTG1', 'BTN'), 'Hero: calls 100', 'SB: folds', 'BB: checks', ...FLOP];
    expect(start({ hero: 'BTN', lines: limpers })).toBe('multiwayPostflop');
    expect(start({ hero: 'BB', lines: [...foldsBetween('UTG', 'SB'), 'SB: calls 50', 'Hero: checks', ...FLOP] })).toBe('limpRange');
    const fourBet = [...open, 'Hero: raises 440 to 660', 'SB: folds', 'BB: folds', 'CO: raises 900 to 1,560', 'Hero: calls 900', ...FLOP];
    expect(start({ hero: 'BTN', lines: fourBet })).toBe('deepRange');
    const cold = ['UTG: raises 120 to 220', ...foldsBetween('UTG1', 'BTN'), 'Hero: calls 220', 'SB: folds', 'BB: raises 500 to 720', 'UTG: folds', 'Hero: calls 500', ...FLOP];
    expect(start({ hero: 'BTN', lines: cold })).toBe('unknownRange');
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `npm test -- src/review/villain-range.test.ts` → Expected: FAIL (Modul `./villain-range` fehlt).

- [ ] **Step 3: Implementierung**

`src/review/preflop.ts`: im Typ `UnratedReason` die Zeile `  | 'postflopPending';` ersetzen durch:
```ts
  | 'postflopPending'
  | 'multiwayPostflop'
  | 'unknownRange'
  | 'limpRange'
  | 'deepRange'
  | 'shortRange';
```
und in `UNRATED_TEXT` die Zeile `  postflopPending: 'Postflop-Bewertung folgt',` ersetzen durch:
```ts
  postflopPending: 'Postflop-Bewertung folgt',
  multiwayPostflop: 'Multiway',
  unknownRange: 'Range des Gegners unbekannt',
  limpRange: 'Range des Gegners unbekannt: Limp-Pot',
  deepRange: 'Range des Gegners unbekannt: 4-Bet-Pot',
  shortRange: 'Range des Gegners unbekannt: höchstens 20 BB (kein Chart)',
```

`src/review/villain-range.ts` anlegen:
```ts
import { chartFor } from '../engine/preflop/charts';
import type { PreflopSituation, StackDepth } from '../engine/preflop/spots';
import type { Position } from '../engine/positions';
import { playableChips } from './hand-model';
import { type ActionEvent, HERO, type ParsedHand } from './parse';
import { modelFor } from './preflop';

/** How the villain got to the flop (spec 7, step 1). */
export type VillainRole = 'opener' | 'caller' | 'bbDefender' | 'threeBettor' | 'callerVs3bet';

export type VillainStart = {
  villain: string;
  position: Position;
  role: VillainRole;
  /** The chart the start range comes from and which part of it. */
  chartKey: string;
  part: 'aggressive' | 'call';
  depth: StackDepth;
  approximation: boolean;
  effectiveBb: number;
  /** Hand classes of the start range (169 flags). */
  flags: boolean[];
};

export type RangeProblem = 'multiwayPostflop' | 'unknownRange' | 'limpRange' | 'deepRange' | 'shortRange';

const isRaise = (e: ActionEvent) => e.action === 'raise' || e.action === 'bet';

/**
 * The villain's start range from his preflop role, or why there is none. Exactly two players must see the flop and
 * the pot must come from a chart spot: open + call, open + BB defence, 3-bet + call. Stack depth as in spec 6.
 */
export function villainStart(hand: ParsedHand, positions: ReadonlyMap<string, Position>): VillainStart | RangeProblem {
  const flop = hand.events.findIndex((e) => e.type === 'board');
  const preflop = hand.events.slice(0, flop < 0 ? hand.events.length : flop).filter((e): e is ActionEvent => e.type === 'action');
  const folded = new Set(preflop.filter((e) => e.action === 'fold').map((e) => e.player));
  const inPot = hand.seats.map((s) => s.name).filter((n) => !folded.has(n));
  if (inPot.length !== 2 || !inPot.includes(HERO)) return 'multiwayPostflop';
  const villain = inPot.find((n) => n !== HERO)!;
  const heroPos = positions.get(HERO);
  const villainPos = positions.get(villain);
  if (!heroPos || !villainPos) return 'unknownRange';

  const raises = preflop.filter(isRaise);
  const firstRaise = preflop.findIndex(isRaise);
  if (firstRaise < 0 || preflop.slice(0, firstRaise).some((e) => e.action === 'call')) return 'limpRange';
  if (raises.length > 2) return 'deepRange';

  const effectiveBb = Math.min(playableChips(hand, HERO), playableChips(hand, villain)) / hand.bigBlind;
  const model = modelFor(effectiveBb);
  if (model.model === 'pushfold') return 'shortRange';
  const { depth, approximation } = model;

  const [open, threeBet] = raises;
  let role: VillainRole;
  let situation: PreflopSituation;
  let part: VillainStart['part'];
  if (raises.length === 1 && open.player === villain) {
    role = 'opener';
    situation = { kind: 'rfi', stack: depth, hero: villainPos, villain: null };
    part = 'aggressive';
  } else if (raises.length === 1 && open.player === HERO) {
    role = villainPos === 'BB' ? 'bbDefender' : 'caller';
    situation = { kind: 'vsOpen', stack: depth, hero: villainPos, villain: heroPos };
    part = 'call';
  } else if (open.player === HERO && threeBet.player === villain) {
    role = 'threeBettor';
    situation = { kind: 'vsOpen', stack: depth, hero: villainPos, villain: heroPos };
    part = 'aggressive';
  } else if (open.player === villain && threeBet.player === HERO) {
    role = 'callerVs3bet';
    situation = { kind: 'vs3bet', stack: depth, hero: villainPos, villain: heroPos };
    part = 'call';
  } else return 'unknownRange';

  let chart;
  try {
    chart = chartFor(situation);
  } catch {
    return 'unknownRange';
  }
  const flags = part === 'aggressive' ? [...chart.aggressive] : [...chart.call];
  if (!flags.some(Boolean)) return 'unknownRange';
  return { villain, position: villainPos, role, chartKey: chart.key, part, depth, approximation, effectiveBb, flags };
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npm test -- src/review/villain-range.test.ts src/review/preflop.test.ts` → Expected: PASS.

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (634 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/review/villain-range.ts src/review/villain-range.test.ts src/review/preflop.ts
git commit -m "feat(review): Startrange des Gegners aus seiner Preflop-Rolle und Gründe für fehlende Ranges" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Postflop-Bewertung einer Hand

**Files:**
- Create: `src/review/postflop.ts`, `src/review/postflop.test.ts`

**Interfaces:**
- Consumes: Task 1–4 (`rangeFromClasses`, `removeCards`, `keepShare`, `rangeWeight`, `ComboRange`, `comboStrengths`, `drawOuts`, `equityVsRange`, alle Konstanten und `judgePostflop`, `villainStart`, `VillainRole`, `RangeProblem`); `cardName`, `mulberry32`, `seedFromString`, `StackDepth`, `Position`; `TableState`, `maxStreetBet`, `walkHand`, `positionsOf`; `ActionEvent`, `BoardStreet`, `HERO`, `ParsedHand`; `UnratedRating`
- Produces (`src/review/postflop.ts`):
  - `type PostflopRating = { model: 'postflop'; verdict: PostflopVerdict; reason: PostflopReason; equity: number; needed: number; bonus: number; outs: number; betShare: number | null; spr: number; villainPosition: Position; villainRole: VillainRole; depth: StackDepth; approximation: boolean; combos: number }` (Equity und nötige Equity 0–1)
  - `postflopNumbers(event: ActionEvent, state: TableState, villain: string): { toCall: number; needed: number; betShare: number | null; spr: number }`
  - `ratePostflop(hand: ParsedHand, states: readonly TableState[], positions: ReadonlyMap<string, Position> | null): Map<number, PostflopRating | UnratedRating>` (Ereignis-Index → Urteil für jede Hero-Aktion ab dem Flop)

- [ ] **Step 1: Failing Test schreiben**

`src/review/postflop.test.ts` anlegen (konstruierte Hände: CO öffnet, Hero callt am Button; Eingrenzung, Zahlen, jede Fehler-/Fraglich-Art, Implied Odds, Multiway, kurzer Stack, fester Seed):
```ts
import { describe, expect, it } from 'vitest';
import { parseCard } from '../engine/cards';
import { rangeFromClasses, rangeWeight, removeCards } from '../engine/postflop/combos';
import { chartFor } from '../engine/preflop/charts';
import { positionsOf, walkHand } from './hand-model';
import { parseHand } from './parse';
import { type PostflopRating, ratePostflop } from './postflop';
import { KEEP_AFTER_BET } from './postflop-rules';
import { type TestHandOptions, foldsBetween, ggHand } from './test-hands';

// CO opens, the hero calls on the button, the blinds fold: pot 670 chips (BB 100, ante 10) on the flop.
const PRE = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'Hero: calls 220', 'SB: folds', 'BB: folds'];
const FLOP = '*** FLOP *** [Ks 7d 2c]';
const TURN = '*** TURN *** [Ks 7d 2c] [Qh]';
const RIVER = '*** RIVER *** [Ks 7d 2c Qh] [3d]';

const ratings = (o: Partial<TestHandOptions> & { lines: string[] }) => {
  const hand = parseHand(ggHand({ hero: 'BTN', ...o }));
  return [...ratePostflop(hand, walkHand(hand), positionsOf(hand)).values()];
};
const postflop = (r: unknown) => r as PostflopRating;

describe('ratePostflop', () => {
  it('narrows the opener range after his bet and computes pot odds, SPR and equity', () => {
    const [call] = ratings({ heroCards: 'Ah Kd', lines: [...PRE, FLOP, 'CO: bets 300', 'Hero: calls 300'] });
    const start = rangeFromClasses(chartFor({ kind: 'rfi', stack: 100, hero: 'CO', villain: null }).aggressive);
    const live = rangeWeight(removeCards(start, ['Ah', 'Kd', 'Ks', '7d', '2c'].map(parseCard)));
    expect(call).toMatchObject({ model: 'postflop', verdict: 'ok', reason: 'callOk', villainPosition: 'CO', villainRole: 'opener', depth: 100 });
    expect(postflop(call).combos).toBeCloseTo(live * KEEP_AFTER_BET, 6);
    expect(postflop(call).needed).toBeCloseTo(300 / 1270, 9);
    expect(postflop(call).spr).toBeCloseTo(9480 / 970, 9);
    expect(postflop(call).equity).toBeGreaterThan(0.6);
  });

  it('call without equity on the river: wahrscheinlich Fehler', () => {
    const lines = [...PRE, FLOP, 'CO: bets 300', 'Hero: calls 300', TURN, 'CO: bets 800', 'Hero: calls 800', RIVER, 'CO: bets 2,000', 'Hero: calls 2,000'];
    const list = ratings({ heroCards: '6s 5s', lines });
    expect(list.at(-1)).toMatchObject({ model: 'postflop', verdict: 'mistake', reason: 'callTooWeak' });
  });

  it('fold of a set against a bet: wahrscheinlich Fehler', () => {
    const [fold] = ratings({ heroCards: 'Kh Kc', lines: [...PRE, FLOP, 'CO: bets 300', 'Hero: folds'] });
    expect(fold).toMatchObject({ model: 'postflop', verdict: 'mistake', reason: 'foldTooStrong' });
  });

  it('river check behind with a set: fraglich ("Value verschenkt?"), the checks before are fine', () => {
    const lines = [...PRE, FLOP, 'CO: checks', 'Hero: checks', TURN, 'CO: checks', 'Hero: checks', RIVER, 'CO: checks', 'Hero: checks'];
    const list = ratings({ heroCards: 'Kh Kc', lines });
    expect(list.map((r) => postflop(r).reason)).toEqual(['checkOk', 'checkOk', 'checkValue']);
    expect(list[2]).toMatchObject({ verdict: 'questionable' });
  });

  it('tiny bet and raise without equity: fraglich', () => {
    expect(ratings({ lines: [...PRE, FLOP, 'CO: checks', 'Hero: bets 50'] })[0]).toMatchObject({ verdict: 'questionable', reason: 'betSize' });
    expect(postflop(ratings({ lines: [...PRE, FLOP, 'CO: checks', 'Hero: bets 50'] })[0]).betShare).toBeCloseTo(50 / 670, 9);
    const raise = ratings({ heroCards: '4h 3h', lines: [...PRE, FLOP, 'CO: bets 300', 'Hero: raises 600 to 900'] })[0];
    expect(raise).toMatchObject({ verdict: 'questionable', reason: 'raiseWeak' });
    expect(postflop(raise).betShare).toBeCloseTo(600 / 1270, 9);
  });

  it('gives the implied-odds bonus to a flop call with a flush draw', () => {
    const [call] = ratings({ heroCards: 'Ad 5d', lines: [...PRE, '*** FLOP *** [Kd 7d 2c]', 'CO: bets 300', 'Hero: calls 300'] });
    expect(call).toMatchObject({ model: 'postflop', bonus: 5, outs: 9 });
  });

  it('does not rate multiway pots or short stacks, and says why', () => {
    const multi = [...foldsBetween('UTG', 'CO'), 'CO: raises 120 to 220', 'Hero: calls 220', 'SB: folds', 'BB: calls 120', FLOP, 'BB: checks', 'CO: bets 300', 'Hero: calls 300'];
    expect(ratings({ lines: multi })).toEqual([{ model: 'unrated', reason: 'multiwayPostflop' }]);
    expect(ratings({ stacksBb: { BTN: 15 }, lines: [...PRE, FLOP, 'CO: bets 300', 'Hero: calls 300'] })).toEqual([{ model: 'unrated', reason: 'shortRange' }]);
  });

  it('is deterministic: the same hand gives the same equities (fixed seed per decision)', () => {
    const o = { heroCards: 'Qh Jh', lines: [...PRE, FLOP, 'CO: bets 300', 'Hero: calls 300', TURN, 'CO: checks', 'Hero: bets 600'] };
    expect(ratings(o)).toEqual(ratings(o));
  });
});
```

- [ ] **Step 2: Test laufen lassen**

Run: `npm test -- src/review/postflop.test.ts` → Expected: FAIL (Modul `./postflop` fehlt).

- [ ] **Step 3: Implementierung**

`src/review/postflop.ts` anlegen:
```ts
import { cardName } from '../engine/cards';
import { type ComboRange, keepShare, rangeFromClasses, rangeWeight, removeCards } from '../engine/postflop/combos';
import { equityVsRange } from '../engine/postflop/range-equity';
import { comboStrengths, drawOuts } from '../engine/postflop/strength';
import type { StackDepth } from '../engine/preflop/spots';
import type { Position } from '../engine/positions';
import { mulberry32, seedFromString } from '../engine/rng';
import { type TableState, maxStreetBet } from './hand-model';
import { type ActionEvent, type BoardStreet, HERO, type ParsedHand } from './parse';
import {
  FLOP_SAMPLES,
  KEEP_AFTER_ALL_IN,
  KEEP_AFTER_BET,
  KEEP_AFTER_CALL,
  KEEP_AFTER_CHECK,
  KEEP_AFTER_RAISE,
  POT_PER_OUT,
  type PostflopReason,
  type PostflopSituation,
  type PostflopVerdict,
  judgePostflop,
} from './postflop-rules';
import type { UnratedRating } from './preflop';
import { type RangeProblem, type VillainRole, villainStart } from './villain-range';

export type PostflopRating = {
  model: 'postflop';
  verdict: PostflopVerdict;
  reason: PostflopReason;
  /** Hero equity against the narrowed villain range, 0–1. */
  equity: number;
  /** Equity the pot odds ask for, 0–1 (0 without a bet to call). */
  needed: number;
  /** Implied-odds points added to the equity of a call (0 or 5). */
  bonus: number;
  outs: number;
  /** Hero bet or raise as a share of the pot (a raise: the part above the call, against the pot after the call). */
  betShare: number | null;
  /** Effective stack behind (smaller of hero and villain) divided by the pot. */
  spr: number;
  villainPosition: Position;
  villainRole: VillainRole;
  depth: StackDepth;
  approximation: boolean;
  /** Weight of the narrowed villain range in combos. */
  combos: number;
};

/** Spec 7: equity, pot odds, bet size and SPR from the table right before the hero acted. */
export function postflopNumbers(event: ActionEvent, state: TableState, villain: string) {
  const hero = state.players.find((p) => p.isHero)!;
  const other = state.players.find((p) => p.name === villain)!;
  const toCall = Math.min(hero.stack, maxStreetBet(state) - hero.streetBet);
  const needed = toCall > 0 ? toCall / (state.pot + toCall) : 0;
  const betShare =
    event.action === 'bet' ? event.amount / state.pot : event.action === 'raise' ? (event.amount - toCall) / (state.pot + toCall) : null;
  return { toCall, needed, betShare, spr: Math.min(hero.stack, other.stack) / state.pot };
}

const KEEP: Record<'bet' | 'raise' | 'allIn' | 'call' | 'check', { share: number; from: 'strong' | 'weak' }> = {
  bet: { share: KEEP_AFTER_BET, from: 'strong' },
  raise: { share: KEEP_AFTER_RAISE, from: 'strong' },
  allIn: { share: KEEP_AFTER_ALL_IN, from: 'strong' },
  call: { share: KEEP_AFTER_CALL, from: 'strong' },
  check: { share: KEEP_AFTER_CHECK, from: 'weak' },
};

const unrated = (reason: UnratedRating['reason']): UnratedRating => ({ model: 'unrated', reason });

/**
 * Rates every postflop decision of the hero (event index → rating). `states[i]` is the table before event i.
 * Unrated decisions keep their numbers in the decision itself (pot, to call, stack, amount).
 */
export function ratePostflop(
  hand: ParsedHand,
  states: readonly TableState[],
  positions: ReadonlyMap<string, Position> | null,
): Map<number, PostflopRating | UnratedRating> {
  const out = new Map<number, PostflopRating | UnratedRating>();
  const heroEvents = hand.events.flatMap((e, i) => (e.type === 'action' && e.player === HERO && e.street !== 'preflop' ? [i] : []));
  if (heroEvents.length === 0) return out;
  const fail = (reason: UnratedRating['reason'] | RangeProblem) => {
    for (const i of heroEvents) out.set(i, unrated(reason));
    return out;
  };
  if (hand.tableSize !== 8) return fail('tableSize');
  if (!positions || !positions.has(HERO)) return fail('positions');
  if (!hand.heroCards) return fail('noHoleCards');
  const start = villainStart(hand, positions);
  if (typeof start === 'string') return fail(start);

  const heroCards = hand.heroCards;
  let range: ComboRange = removeCards(rangeFromClasses(start.flags), heroCards);
  const strengthCache = new Map<string, Float64Array>();
  const strengths = (board: readonly number[], street: BoardStreet) => {
    const key = board.map(cardName).join('');
    let s = strengthCache.get(key);
    if (!s) strengthCache.set(key, (s = comboStrengths(board, POT_PER_OUT[street])));
    return s;
  };
  let villainActedThisStreet = false;

  hand.events.forEach((event, i) => {
    if (event.type === 'board') {
      range = removeCards(range, event.cards);
      villainActedThisStreet = false;
      return;
    }
    if (event.type !== 'action' || event.street === 'preflop') return;
    const state = states[i];
    const street = event.street;
    if (event.player === start.villain) {
      if (event.action === 'fold') return;
      const allIn = event.allIn || states[i + 1].players.find((p) => p.name === start.villain)!.stack === 0;
      const kind = (event.action === 'bet' || event.action === 'raise') && allIn ? 'allIn' : event.action;
      const keep = KEEP[kind];
      range = keepShare(range, strengths(state.board, street), keep.share, keep.from);
      villainActedThisStreet = true;
      return;
    }
    if (event.player !== HERO) return;
    const equity = equityVsRange(heroCards, state.board, range, mulberry32(seedFromString(`${hand.id}:${i}`)), FLOP_SAMPLES);
    if (equity === null) {
      out.set(i, unrated('unknownRange'));
      return;
    }
    const numbers = postflopNumbers(event, state, start.villain);
    const after = states[i + 1].players;
    const heroAllIn = event.allIn || after.find((p) => p.isHero)!.stack === 0;
    const chipsBehind = !heroAllIn && after.find((p) => p.name === start.villain)!.stack > 0;
    const action: PostflopSituation['action'] =
      (event.action === 'bet' || event.action === 'raise') && heroAllIn ? 'allIn' : event.action;
    const outs = drawOuts(heroCards, state.board).outs;
    const judgement = judgePostflop({
      street,
      action,
      equity: equity * 100,
      needed: numbers.needed * 100,
      betShare: event.action === 'bet' ? numbers.betShare : null,
      outs,
      chipsBehind,
      heroActsLast: street === 'river' && villainActedThisStreet,
    });
    out.set(i, {
      model: 'postflop',
      verdict: judgement.verdict,
      reason: judgement.reason,
      equity,
      needed: numbers.needed,
      bonus: judgement.bonus,
      outs,
      betShare: numbers.betShare,
      spr: numbers.spr,
      villainPosition: start.position,
      villainRole: start.role,
      depth: start.depth,
      approximation: start.approximation,
      combos: rangeWeight(range),
    });
  });
  return out;
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npm test -- src/review/postflop.test.ts` → Expected: PASS (8 Tests).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (642 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/review/postflop.ts src/review/postflop.test.ts
git commit -m "feat(review): Postflop-Bewertung je Entscheidung mit Range-Eingrenzung, Equity, Pot Odds und SPR" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Postflop-Urteile in Analyse, Zählung, Archiv und Hand-Ansicht

**Files:**
- Create: `src/review/postflop-text.ts`
- Modify: `src/review/preflop.ts`, `src/review/analysis.ts`, `src/review/summary.ts`, `src/review/archive.ts`, `src/review/import.ts`, `src/ui/components/ReviewDecisionPanel.tsx`, `src/ui/screens/ReviewTournament.tsx`, `src/ui/screens/review.css`
- Test: `src/review/postflop.test.ts`, `src/review/preflop.test.ts`, `src/review/summary.test.ts`, `src/review/archive.test.ts`, `src/review/import.test.ts`, `src/ui/components/ReviewDecisionPanel.test.tsx`, `src/ui/screens/ReviewScreen.test.tsx`, `src/app/review-store.test.ts`

**Interfaces:**
- Consumes: `ratePostflop`, `PostflopRating` (Task 5); `PostflopVerdict`, `PostflopReason` und Konstanten (Task 3); `VillainRole` (Task 4); `formatPercent`, `formatBb`, `POSITION_LABELS`
- Produces:
  - `src/review/analysis.ts`: `ANALYSIS_VERSION = 2`; `analyzeHand` setzt für jede Hero-Aktion ab dem Flop das Urteil aus `ratePostflop`
  - `src/review/preflop.ts`: `type DecisionRating = PushFoldRating | ChartRating | PostflopRating | UnratedRating`
  - `src/review/summary.ts`: `type DecisionOutcome = 'error' | 'hint' | 'questionable' | 'close' | 'correct' | 'unrated'`; `decisionOutcome` für Postflop (`mistake` → `error`/`hint`, `questionable` → `questionable`, `ok` → `correct`); Schwere `error 5 > hint 4 > questionable 3 > close 2 > correct 1 > unrated 0`; `matchesFilter(…, 'questionable')` ab Schwere 3; `type DaySummary = { hands: number; preflopErrors: number; postflopErrors?: number }`; `summarize` zählt Postflop-Fehler je Tag; `weeklyErrorTrend` zählt Preflop- und Postflop-Fehler
  - `src/review/archive.ts`: `TournamentRecord.analysisVersion?: number`; `readTournament` prüft `analysisVersion` und `days[*].postflopErrors`, sofern vorhanden; `isHandAnalysis` akzeptiert Postflop-Urteile
  - `src/review/import.ts`: `tournamentRecordOf` setzt `analysisVersion` = kleinste Version der Hände (`ANALYSIS_VERSION` ohne Hände)
  - `src/review/postflop-text.ts`: `POSTFLOP_DISCLAIMER = 'Faustregel, kein Solver-Ergebnis'`, `POSTFLOP_VERDICT_LABELS: Record<PostflopVerdict, string>`, `POSTFLOP_REASON_TEXT: Record<PostflopReason, string>`, `IMPLIED_ODDS_TEXT`, `VILLAIN_ROLE_LABELS: Record<VillainRole, string>`
  - `src/ui/components/ReviewDecisionPanel.tsx`: Postflop-Urteil mit Begründung, Equity, nötiger Equity, Einsatz/Raise in % vom Pot, SPR, Outs, Gegner-Range und Hinweis; bei nicht bewerteten Postflop-Entscheidungen zusätzlich „nötige Equity … · Einsatz … vom Pot“
  - `src/ui/screens/ReviewTournament.tsx`: `OUTCOME_LABELS.questionable = 'Fraglich'`; CSS-Klasse `review-hand--questionable` (gold)

- [ ] **Step 1: Failing Tests schreiben**

`src/review/postflop.test.ts`: nach `import { describe, expect, it } from 'vitest';` einfügen:
```ts
import { getPushFoldData } from '../app/data';
```
vor `import { positionsOf, walkHand } from './hand-model';` einfügen:
```ts
import { analyzeHand } from './analysis';
import bounty from './fixtures/bounty.txt?raw';
```
und am Dateiende anhängen:
```ts
describe('analyzeHand with a real postflop hand', () => {
  it('rates the postflop decisions of the bounty hand (66 against the CO caller, 100 BB)', () => {
    const list = analyzeHand(parseHand(bounty), getPushFoldData()).decisions;
    expect(list.map((d) => [d.street, d.action, d.rating.model === 'postflop' ? d.rating.verdict : d.rating.model])).toEqual([
      ['preflop', 'raise', 'chart'],
      ['flop', 'bet', 'ok'],
      ['turn', 'bet', 'ok'],
      ['turn', 'call', 'questionable'],
      ['river', 'check', 'ok'],
      ['river', 'fold', 'ok'],
    ]);
    expect(list[3].rating).toMatchObject({ reason: 'callThin', villainRole: 'caller', villainPosition: 'CO', bonus: 5, outs: 8 });
  });
});
```

`src/review/preflop.test.ts`: die Zeile `    expect(r[2]).toEqual({ model: 'unrated', reason: 'postflopPending' });` ersetzen durch:
```ts
    expect(r[2]).toMatchObject({ model: 'postflop', villainRole: 'threeBettor', villainPosition: 'BTN', verdict: 'ok', reason: 'checkOk' });
```
die Zeile `  it('postflop decisions are listed with "Postflop-Bewertung folgt"', () => {` ersetzen durch:
```ts
  it('postflop decisions keep their numbers and get a postflop rating', () => {
```
und die Zeile `    expect(list.slice(1).every((d) => d.rating.model === 'unrated' && d.rating.reason === 'postflopPending')).toBe(true);` ersetzen durch:
```ts
    expect(list.slice(1).every((d) => d.rating.model === 'postflop')).toBe(true);
```

`src/review/summary.test.ts` vollständig ersetzen:
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
const analysis = (...decisions: HeroDecision[]): HandAnalysis => ({ version: 2, decisions });
const unrated: DecisionRating = { model: 'unrated', reason: 'limp' };
const post = (verdict: 'ok' | 'questionable' | 'mistake'): DecisionRating => ({
  model: 'postflop', verdict, reason: 'callOk', equity: 0.3, needed: 0.25, bonus: 0, outs: 0, betShare: null, spr: 3,
  villainPosition: 'CO', villainRole: 'opener', depth: 100, approximation: false, combos: 120,
});

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

  it('counts a postflop "wahrscheinlich Fehler" as an error, "fraglich" as questionable', () => {
    expect(decisionOutcome(decision(post('mistake'), 'river'), 'normal')).toBe('error');
    expect(decisionOutcome(decision(post('mistake'), 'river'), 'bounty')).toBe('hint');
    expect(decisionOutcome(decision(post('questionable'), 'flop'), 'normal')).toBe('questionable');
    expect(decisionOutcome(decision(post('questionable'), 'flop'), 'satellit')).toBe('questionable');
    expect(decisionOutcome(decision(post('ok'), 'turn'), 'normal')).toBe('correct');
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
    const questionable = analysis(decision(post('questionable'), 'turn'));
    expect(matchesFilter(questionable, 'normal', 'errors')).toBe(false);
    expect(matchesFilter(questionable, 'normal', 'questionable')).toBe(true);
    expect(handSeverity(questionable, 'normal')).toBeGreaterThan(handSeverity(close, 'normal'));
    expect(handSeverity(error, 'bounty')).toBeGreaterThan(handSeverity(questionable, 'normal'));
  });
});

describe('summarize', () => {
  it('counts hands, preflop errors and hints per tournament and per day', () => {
    const entries = [
      { dateKey: '2026-10-12', analysis: analysis(decision(chart('wrong')), decision(post('mistake'), 'flop')) },
      { dateKey: '2026-10-13', analysis: analysis(decision(chart('correct'))) },
      { dateKey: '2026-10-13', analysis: analysis(decision(chart('wrong'))) },
    ];
    expect(summarize(entries, 'normal')).toEqual({
      hands: 3,
      preflopErrors: 2,
      postflopErrors: 1,
      hints: 0,
      days: { '2026-10-12': { hands: 1, preflopErrors: 1, postflopErrors: 1 }, '2026-10-13': { hands: 2, preflopErrors: 1, postflopErrors: 0 } },
    });
    expect(summarize(entries, 'satellit')).toMatchObject({ preflopErrors: 0, postflopErrors: 0, hints: 3 });
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
    const a = { hands: 40, preflopErrors: 2, postflopErrors: 1, hints: 0, days: { '2026-10-13': { hands: 40, preflopErrors: 1, postflopErrors: 1 } } };
    // b is a Plan 7 summary without postflopErrors per day; a counts postflop errors.
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

`src/review/archive.test.ts`: im `describe('archive records', …)` nach dem Test `it('accepts a hand with a broken analysis, which is rated again later', …)` einfügen:
```ts
  it('accepts postflop ratings and the Plan 8 fields, and rejects broken ones', () => {
    expect(handRecord.analysis.decisions.some((d) => d.rating.model === 'postflop')).toBe(true);
    const badVerdict = { ...handRecord.analysis, decisions: [{ ...handRecord.analysis.decisions[1], rating: { model: 'postflop', verdict: 'vielleicht' } }] };
    expect(isHandAnalysis(badVerdict)).toBe(false);
    const rated: TournamentRecord = {
      ...tournament,
      analysisVersion: 2,
      summary: { ...tournament.summary, postflopErrors: 1, days: { '2026-10-13': { hands: 1, preflopErrors: 0, postflopErrors: 1 } } },
    };
    expect(readTournament(JSON.stringify(rated))).toEqual(rated);
    expect(() => readTournament(JSON.stringify({ ...tournament, analysisVersion: 'neu' }))).toThrow('Archiv-Eintrag nicht lesbar: Analyse-Version');
    const badDay = { ...rated, summary: { ...rated.summary, days: { '2026-10-13': { hands: 1, preflopErrors: 0, postflopErrors: -1 } } } };
    expect(() => readTournament(JSON.stringify(badDay))).toThrow('Archiv-Eintrag nicht lesbar: Zusammenfassung');
  });
```

`src/review/import.test.ts`: die Zeile `import { memoryReviewBackend, tournamentKey, writeRecords } from './archive';` ersetzen durch:
```ts
import { ANALYSIS_VERSION } from './analysis';
import { memoryReviewBackend, tournamentKey, writeRecords } from './archive';
```
und im Test `it('builds hand and tournament records and keeps a kind the player chose', …)` die Zeile mit `expect(fresh).toMatchObject({ detectedKind: 'satellit', … firstPlayedAt: '2026-10-13 11:31:49' });` ersetzen durch:
```ts
    expect(fresh).toMatchObject({ detectedKind: 'satellit', kind: 'satellit', handIds: ['TM6532799440'], firstPlayedAt: '2026-10-13 11:31:49', analysisVersion: 1 });
    const current = records.map((r) => ({ ...r, analysisVersion: ANALYSIS_VERSION }));
    expect(tournamentRecordOf('318586827', 'x', current, null).analysisVersion).toBe(ANALYSIS_VERSION);
```

`src/ui/components/ReviewDecisionPanel.test.tsx` vollständig ersetzen:
```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseHand } from '../../engine/cards';
import { gradePreflop } from '../../engine/preflop/grading';
import { grade } from '../../engine/pushfold';
import { makeFixture } from '../../engine/test-fixtures';
import type { HeroDecision } from '../../review/analysis';
import type { PostflopRating } from '../../review/postflop';
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
    expect(screen.getByText('nötige Equity 29 % · Einsatz 180 % vom Pot')).toBeTruthy();
  });

  const postflop = (over: Partial<PostflopRating> = {}): PostflopRating => ({
    model: 'postflop', verdict: 'mistake', reason: 'callTooWeak', equity: 0.12, needed: 0.286, bonus: 0, outs: 0, betShare: null, spr: 3.94,
    villainPosition: 'CO', villainRole: 'opener', depth: 40, approximation: true, combos: 87.4, ...over,
  });
  const riverCall = { street: 'river', action: 'call', amount: 100, to: null } as const;

  it('shows a postflop verdict with reason, equity, pot odds, SPR, the range and the rule-of-thumb note', () => {
    render(<ReviewDecisionPanel decision={decision(postflop(), riverCall)} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Wahrscheinlich Fehler' })).toBeTruthy();
    expect(screen.getByText('Zu wenig Equity für den Call: Die Pot Odds verlangen deutlich mehr.')).toBeTruthy();
    expect(screen.getByText('Equity 12 % gegen die Range · nötig 29 %')).toBeTruthy();
    expect(screen.getByText('SPR 3,9')).toBeTruthy();
    expect(screen.getByText('Gegner CO: Open-Raise · Näherung: Chart für 40 BB · etwa 87 Kombinationen')).toBeTruthy();
    expect(screen.getByText('Faustregel, kein Solver-Ergebnis')).toBeTruthy();
  });

  it('names the implied-odds bonus, the bet size and "fraglich"', () => {
    const call = postflop({ verdict: 'questionable', reason: 'callThin', bonus: 5, outs: 9 });
    const { unmount } = render(<ReviewDecisionPanel decision={decision(call, { ...riverCall, street: 'flop' })} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Fraglich' })).toBeTruthy();
    expect(screen.getByText('Equity 12 % gegen die Range · nötig 29 % (inkl. 5 Punkte Implied Odds (Draw mit mindestens 8 Outs))')).toBeTruthy();
    expect(screen.getByText('SPR 3,9 · 9 Outs')).toBeTruthy();
    unmount();
    const bet = postflop({ verdict: 'questionable', reason: 'betSize', betShare: 0.1 });
    render(<ReviewDecisionPanel decision={decision(bet, { street: 'turn', action: 'bet', toCall: 0, amount: 25, to: null })} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByText('Ungewöhnliche Einsatzgröße: unter 20 % oder über 150 % vom Pot.')).toBeTruthy();
    expect(screen.getByText('Einsatz 10 % vom Pot · SPR 3,9')).toBeTruthy();
    expect(screen.queryByText(/nötig/)).toBeNull();
  });

  it('turns a postflop mistake into a hint in satellites and bounty tournaments', () => {
    render(<ReviewDecisionPanel decision={decision(postflop(), riverCall)} kind="bounty" bigBlind={100} data={data} />);
    expect(screen.getByRole('heading', { name: 'Hinweis' })).toBeTruthy();
    expect(screen.getByText('Satellit/Bounty – Standard-Chart nur bedingt gültig')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Wahrscheinlich Fehler' })).toBeNull();
  });

  it('explains an unrated postflop decision and still shows pot odds', () => {
    const rating: DecisionRating = { model: 'unrated', reason: 'multiwayPostflop' };
    render(<ReviewDecisionPanel decision={decision(rating, riverCall)} kind="normal" bigBlind={100} data={data} />);
    expect(screen.getByText('Multiway')).toBeTruthy();
    expect(screen.getByText('nötige Equity 29 %')).toBeTruthy();
  });
});
```

`src/ui/screens/ReviewScreen.test.tsx`: im Test `it('steps through the hand and jumps between decisions with ← and →', …)` die beiden Zeilen
```tsx
    expect(screen.getByRole('heading', { name: 'Nicht bewertet' })).toBeTruthy();
    expect(screen.getByText('Postflop-Bewertung folgt')).toBeTruthy();
```
ersetzen durch:
```tsx
    expect(screen.getByRole('heading', { name: 'Passt' })).toBeTruthy();
    expect(screen.getByText('Einsatz in üblicher Größe.')).toBeTruthy();
    expect(screen.getByText('Einsatz 50 % vom Pot · SPR 8,7 · 8 Outs')).toBeTruthy();
    expect(screen.getByText(/^Gegner CO: Call gegen deinen Open · Chart für 100 BB · etwa \d+ Kombinationen$/)).toBeTruthy();
    expect(screen.getByText('Faustregel, kein Solver-Ergebnis')).toBeTruthy();
```
und im `describe('ReviewScreen tournament', …)` vor `it('changes the kind: errors become hints and are not counted', …)` einfügen:
```tsx
  it('shows a postflop "fraglich" under "Auch fraglich" but not under "Nur Fehler"', async () => {
    await withHands(bounty);
    await openTournament('Bounty Hunters $2.50');
    expect(screen.getByRole('button', { name: /66 · UTG/ }).textContent).toContain('Fraglich');
    fireEvent.click(screen.getByRole('button', { name: 'Nur Fehler' }));
    expect(screen.getByText('Keine Hände für diesen Filter.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Auch fraglich' }));
    expect(screen.getByRole('button', { name: /66 · UTG/ })).toBeTruthy();
  });
```

`src/app/review-store.test.ts`: nach `import { getPushFoldData } from './data';` einfügen:
```ts
import { ANALYSIS_VERSION } from '../review/analysis';
```
und im Test `it('rates hands from an older analysis version again when the tournament is opened', …)` die Zeilen `    expect(open.hands[0].record.analysisVersion).toBe(1);` und `    expect(readHand(backend.dump()[key]).analysisVersion).toBe(1);` ersetzen durch:
```ts
    expect(open.hands[0].record.analysisVersion).toBe(ANALYSIS_VERSION);
```
bzw.
```ts
    expect(readHand(backend.dump()[key]).analysisVersion).toBe(ANALYSIS_VERSION);
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/review src/ui/components/ReviewDecisionPanel.test.tsx src/ui/screens/ReviewScreen.test.tsx src/app/review-store.test.ts` → Expected: FAIL (u. a. `postflop-text` fehlt, Postflop-Entscheidungen sind noch „postflopPending“, `decisionOutcome` kennt kein `questionable`).

- [ ] **Step 3: Implementierung**

`src/review/preflop.ts`: nach `import { type ActionEvent, HERO, type ParsedHand } from './parse';` einfügen:
```ts
import type { PostflopRating } from './postflop';
```
und die beiden Zeilen
```ts
/** Plan 8 adds a postflop rating to this union; Plan 7 never creates one. */
export type DecisionRating = PushFoldRating | ChartRating | UnratedRating;
```
ersetzen durch:
```ts
export type DecisionRating = PushFoldRating | ChartRating | PostflopRating | UnratedRating;
```

`src/review/analysis.ts` vollständig ersetzen:
```ts
import type { PushFoldData } from '../engine/pushfold-data';
import { maxStreetBet, positionsOf, walkHand } from './hand-model';
import { HERO, type ActionType, type ParsedHand, type Street } from './parse';
import { ratePostflop } from './postflop';
import { type DecisionRating, ratePreflopDecision } from './preflop';

/** Bump when the rating logic changes: archived hands with another version are rated again when opened. */
export const ANALYSIS_VERSION = 2;

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
  const postflop = ratePostflop(hand, states, positions);
  const decisions: HeroDecision[] = [];
  hand.events.forEach((event, index) => {
    if (event.type !== 'action' || event.player !== HERO) return;
    const state = states[index];
    const hero = state.players.find((p) => p.isHero)!;
    const rating: DecisionRating =
      event.street === 'preflop'
        ? ratePreflopDecision(hand, index, state, positions, data)
        : postflop.get(index)!;
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

`src/review/summary.ts` vollständig ersetzen:
```ts
import { shiftDateKey } from '../game/streak';
import type { HandAnalysis, HeroDecision } from './analysis';
import type { TournamentKind } from './tournament-kind';

/**
 * What a decision counts as. `error` = preflop "falsch" or postflop "wahrscheinlich Fehler" in a normal tournament;
 * in satellites and bounty tournaments the same decision becomes a `hint` and is not counted (spec 5).
 * `questionable` = postflop "fraglich".
 */
export type DecisionOutcome = 'error' | 'hint' | 'questionable' | 'close' | 'correct' | 'unrated';

export const SATELLITE_HINT = 'Satellit/Bounty – Standard-Chart nur bedingt gültig';

export function decisionOutcome(decision: HeroDecision, kind: TournamentKind): DecisionOutcome {
  const { rating } = decision;
  if (rating.model === 'unrated') return 'unrated';
  if (rating.model === 'postflop') {
    if (rating.verdict === 'mistake') return kind === 'normal' ? 'error' : 'hint';
    return rating.verdict === 'questionable' ? 'questionable' : 'correct';
  }
  const verdict = rating.grade.verdict;
  if (verdict === 'wrong') return kind === 'normal' ? 'error' : 'hint';
  return verdict === 'close' ? 'close' : 'correct';
}

const SEVERITY: Record<DecisionOutcome, number> = { error: 5, hint: 4, questionable: 3, close: 2, correct: 1, unrated: 0 };

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

/** "auch fraglich" shows errors, satellite/bounty hints and postflop "fraglich". */
export function matchesFilter(analysis: HandAnalysis, kind: TournamentKind, filter: HandFilter): boolean {
  if (filter === 'all') return true;
  const severity = handSeverity(analysis, kind);
  return filter === 'errors' ? severity >= SEVERITY.error : severity >= SEVERITY.questionable;
}

/** `postflopErrors` is missing in summaries written before Plan 8 (read as 0). */
export type DaySummary = { hands: number; preflopErrors: number; postflopErrors?: number };
export type TournamentSummary = {
  hands: number;
  preflopErrors: number;
  postflopErrors: number;
  hints: number;
  /** Per date key, for the weekly "Fehler pro 100 Hände" trend. */
  days: Record<string, DaySummary>;
};

export function summarize(entries: readonly { dateKey: string; analysis: HandAnalysis }[], kind: TournamentKind): TournamentSummary {
  const summary: TournamentSummary = { hands: 0, preflopErrors: 0, postflopErrors: 0, hints: 0, days: {} };
  for (const { dateKey, analysis } of entries) {
    const day = (summary.days[dateKey] ??= { hands: 0, preflopErrors: 0, postflopErrors: 0 });
    summary.hands++;
    day.hands++;
    for (const d of analysis.decisions) {
      const outcome = decisionOutcome(d, kind);
      if (outcome === 'hint') summary.hints++;
      if (outcome !== 'error') continue;
      if (d.street === 'preflop') {
        summary.preflopErrors++;
        day.preflopErrors++;
      } else {
        summary.postflopErrors++;
        day.postflopErrors = (day.postflopErrors ?? 0) + 1;
      }
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
        errors += day.preflopErrors + (day.postflopErrors ?? 0);
      }
    }
    out.push({ weekStart, weekEnd, hands, errors, per100: errorsPer100(errors, hands) });
  }
  return out;
}
```

`src/review/archive.ts`: im Typ `TournamentRecord` nach `  handIds: string[];` einfügen:
```ts
  /** The oldest analysis version among its hands, i.e. what the summary is built from; missing before Plan 8 (= 1). */
  analysisVersion?: number;
```
in `isSummary` die Zeile `  return isObject(v.days) && Object.values(v.days).every((d) => isObject(d) && isCount(d.hands) && isCount(d.preflopErrors));` ersetzen durch:
```ts
  return (
    isObject(v.days) &&
    Object.values(v.days).every(
      (d) => isObject(d) && isCount(d.hands) && isCount(d.preflopErrors) && (d.postflopErrors === undefined || isCount(d.postflopErrors)),
    )
  );
```
in `readTournament` vor `  if (!isSummary(r.summary)) corrupt('Zusammenfassung');` einfügen:
```ts
  if (r.analysisVersion !== undefined && !isCount(r.analysisVersion)) corrupt('Analyse-Version');
```
und die Zeilen
```ts
function isRating(v: unknown): boolean {
  if (!isObject(v)) return false;
  if (v.model === 'unrated') return isString(v.reason);
```
ersetzen durch:
```ts
const POSTFLOP_VERDICTS = ['ok', 'questionable', 'mistake'];
const isShare = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function isRating(v: unknown): boolean {
  if (!isObject(v)) return false;
  if (v.model === 'unrated') return isString(v.reason);
  if (v.model === 'postflop') {
    return POSTFLOP_VERDICTS.includes(v.verdict as string) && isString(v.reason) && isShare(v.equity) && isShare(v.needed) && isShare(v.spr);
  }
```

`src/review/import.ts`: die Zeile `import { type HandAnalysis, analyzeHand } from './analysis';` ersetzen durch:
```ts
import { ANALYSIS_VERSION, type HandAnalysis, analyzeHand } from './analysis';
```
in `tournamentRecordOf` nach `  const kind = kindOverride ?? previous?.kind ?? detectedKind;` einfügen:
```ts
  const analysisVersion = sorted.length === 0 ? ANALYSIS_VERSION : Math.min(...sorted.map((h) => h.analysisVersion));
```
und im zurückgegebenen Objekt nach `    handIds: sorted.map((h) => h.id),` einfügen:
```ts
    analysisVersion,
```

`src/review/postflop-text.ts` anlegen:
```ts
import {
  BET_MAX_SHARE,
  BET_MIN_SHARE,
  DRAW_MIN_OUTS,
  IMPLIED_ODDS_BONUS,
  type PostflopReason,
  type PostflopVerdict,
  RAISE_MIN_EQUITY,
  RIVER_BET_MIDDLE_HIGH,
  RIVER_BET_MIDDLE_LOW,
  RIVER_CHECK_VALUE,
} from './postflop-rules';
import type { VillainRole } from './villain-range';

export const POSTFLOP_DISCLAIMER = 'Faustregel, kein Solver-Ergebnis';

export const POSTFLOP_VERDICT_LABELS: Record<PostflopVerdict, string> = {
  ok: 'Passt',
  questionable: 'Fraglich',
  mistake: 'Wahrscheinlich Fehler',
};

export const POSTFLOP_REASON_TEXT: Record<PostflopReason, string> = {
  callOk: 'Der Call ist durch die Pot Odds gedeckt.',
  callThin: 'Knapper Call: etwas weniger Equity, als die Pot Odds verlangen.',
  callTooWeak: 'Zu wenig Equity für den Call: Die Pot Odds verlangen deutlich mehr.',
  foldOk: 'Der Fold passt: Deine Equity reicht für die Pot Odds nicht klar aus.',
  foldThin: 'Knapper Fold: Deine Equity liegt über dem, was die Pot Odds verlangen.',
  foldTooStrong: 'Zu früh aufgegeben: Deine Equity liegt deutlich über den Pot Odds.',
  raiseOk: 'Genug Equity für Raise oder All-in.',
  raiseWeak: `Raise oder All-in mit weniger als ${RAISE_MIN_EQUITY} % Equity – nur als Bluff sinnvoll.`,
  betOk: 'Einsatz in üblicher Größe.',
  betSize: `Ungewöhnliche Einsatzgröße: unter ${BET_MIN_SHARE * 100} % oder über ${BET_MAX_SHARE * 100} % vom Pot.`,
  riverBetMiddle: `River-Bet mit ${RIVER_BET_MIDDLE_LOW}–${RIVER_BET_MIDDLE_HIGH} % Equity: Bessere Hände callen, schlechtere folden.`,
  checkOk: 'Der Check passt.',
  checkValue: `Value verschenkt? Als Letzter am River mit über ${RIVER_CHECK_VALUE} % Equity wäre eine Bet naheliegend.`,
};

export const IMPLIED_ODDS_TEXT = `inkl. ${IMPLIED_ODDS_BONUS} Punkte Implied Odds (Draw mit mindestens ${DRAW_MIN_OUTS} Outs)`;

export const VILLAIN_ROLE_LABELS: Record<VillainRole, string> = {
  opener: 'Open-Raise',
  caller: 'Call gegen deinen Open',
  bbDefender: 'BB-Verteidigung',
  threeBettor: '3-Bet gegen deinen Open',
  callerVs3bet: 'Call gegen deine 3-Bet',
};
```

`src/ui/components/ReviewDecisionPanel.tsx` vollständig ersetzen:
```tsx
import { formatBb, formatChipsBb, formatPercent, reviewActionLabel, streetLabel } from '../../app/format';
import { comparePositions } from '../../engine/position-compare';
import { POSITION_LABELS } from '../../engine/positions';
import { chartFor } from '../../engine/preflop/charts';
import { comparePreflopPositions, preflopCells } from '../../engine/preflop/grading';
import { chart } from '../../engine/pushfold';
import type { PushFoldData } from '../../engine/pushfold-data';
import type { HeroDecision } from '../../review/analysis';
import type { PostflopRating } from '../../review/postflop';
import { IMPLIED_ODDS_TEXT, POSTFLOP_DISCLAIMER, POSTFLOP_REASON_TEXT, POSTFLOP_VERDICT_LABELS, VILLAIN_ROLE_LABELS } from '../../review/postflop-text';
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

/** Pot odds and bet size straight from the decision; shown for unrated postflop decisions too (spec 7). */
function PotOdds({ decision }: { decision: HeroDecision }) {
  const { pot, toCall, amount, action } = decision;
  const parts: string[] = [];
  if (toCall > 0) parts.push(`nötige Equity ${formatPercent(toCall / (pot + toCall))}`);
  if (action === 'bet') parts.push(`Einsatz ${formatPercent(amount / pot)} vom Pot`);
  if (action === 'raise') parts.push(`Raise ${formatPercent((amount - toCall) / (pot + toCall))} vom Pot`);
  return parts.length > 0 ? <p className="feedback__line feedback__ev">{parts.join(' · ')}</p> : null;
}

const POSTFLOP_TONE: Record<PostflopRating['verdict'], 'correct' | 'close' | 'wrong'> = { ok: 'correct', questionable: 'close', mistake: 'wrong' };

function PostflopPanel({ decision, rating, kind, bigBlind }: { decision: HeroDecision; rating: PostflopRating; kind: TournamentKind; bigBlind: number }) {
  const hint = decisionOutcome(decision, kind) === 'hint';
  const tone = hint ? 'close' : POSTFLOP_TONE[rating.verdict];
  const equity = `Equity ${formatPercent(rating.equity)} gegen die Range`;
  const needed = decision.toCall > 0 ? ` · nötig ${formatPercent(rating.needed)}` : '';
  const sizes = [
    rating.betShare !== null ? `${decision.action === 'raise' ? 'Raise' : 'Einsatz'} ${formatPercent(rating.betShare)} vom Pot` : null,
    `SPR ${formatBb(Math.round(rating.spr * 10) / 10)}`,
    rating.outs > 0 ? `${rating.outs} Outs` : null,
  ].filter((x): x is string => x !== null);
  return (
    <section className={`feedback panel feedback--${tone}`} aria-live="polite">
      <h2 className="feedback__verdict">{hint ? 'Hinweis' : POSTFLOP_VERDICT_LABELS[rating.verdict]}</h2>
      <p className="feedback__line">{POSTFLOP_REASON_TEXT[rating.reason]}</p>
      {hint && <p className="feedback__line">{SATELLITE_HINT}</p>}
      <p className="feedback__line">Deine Aktion: {reviewActionLabel(decision, bigBlind)}</p>
      <p className="feedback__line feedback__ev">
        {equity}
        {needed}
        {rating.bonus > 0 ? ` (${IMPLIED_ODDS_TEXT})` : ''}
      </p>
      <p className="feedback__line feedback__ev">{sizes.join(' · ')}</p>
      <Numbers decision={decision} bigBlind={bigBlind} />
      <p className="feedback__line muted">
        Gegner {POSITION_LABELS[rating.villainPosition]}: {VILLAIN_ROLE_LABELS[rating.villainRole]} ·{' '}
        {rating.approximation ? `Näherung: Chart für ${rating.depth} BB` : `Chart für ${rating.depth} BB`} · etwa {Math.round(rating.combos)}{' '}
        Kombinationen
      </p>
      <p className="feedback__hint muted">{POSTFLOP_DISCLAIMER}</p>
    </section>
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
        {decision.street !== 'preflop' && <PotOdds decision={decision} />}
      </section>
    );
  }
  if (rating.model === 'postflop') return <PostflopPanel decision={decision} rating={rating} kind={kind} bigBlind={bigBlind} />;
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

`src/ui/screens/ReviewTournament.tsx`: in `OUTCOME_LABELS` nach `  hint: 'Hinweis',` einfügen:
```ts
  questionable: 'Fraglich',
```

`src/ui/screens/review.css`: die Zeilen
```css
.review-hand--hint .review-hand__outcome,
.review-hand--close .review-hand__outcome {
```
ersetzen durch:
```css
.review-hand--hint .review-hand__outcome,
.review-hand--questionable .review-hand__outcome,
.review-hand--close .review-hand__outcome {
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/review src/ui/components/ReviewDecisionPanel.test.tsx src/ui/screens/ReviewScreen.test.tsx src/app/review-store.test.ts` → Expected: PASS.

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (650 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/review/postflop-text.ts src/review/preflop.ts src/review/analysis.ts src/review/summary.ts src/review/archive.ts src/review/import.ts src/ui/components/ReviewDecisionPanel.tsx src/ui/screens/ReviewTournament.tsx src/ui/screens/review.css src/review/postflop.test.ts src/review/preflop.test.ts src/review/summary.test.ts src/review/archive.test.ts src/review/import.test.ts src/ui/components/ReviewDecisionPanel.test.tsx src/ui/screens/ReviewScreen.test.tsx src/app/review-store.test.ts
git commit -m "feat(review): Postflop-Urteile in Analyse (Version 2), Fehlerzählung, Wochenverlauf, Archiv, Filter und Hand-Ansicht" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Analyse im Web Worker mit Rückfall auf den Hauptthread, Messskript

**Files:**
- Create: `src/review/analyzer.ts`, `src/review/analysis.worker.ts`, `src/review/analyzer.test.ts`, `scripts/review-bench.ts`
- Modify: `src/review/import.ts`, `src/app/review-store.ts`, `src/main.tsx`, `vite.config.ts`, `package.json`
- Test: `src/review/import.test.ts`, `src/app/review-store.test.ts`

**Interfaces:**
- Consumes: `analyzeHand`, `HandAnalysis` (Task 6); `parseHand`, `ParsedHand`, `parseHistory`; `PushFoldData`, `getPushFoldData`; `extractTexts`, `planImport`, `UNRATED_TEXT` (Messskript)
- Produces:
  - `src/review/analyzer.ts`: `interface HandAnalyzer { analyze(hands: readonly ParsedHand[], onProgress?: (done: number) => void): Promise<HandAnalysis[]> }`; `INLINE_CHUNK = 5`; `WORKER_PROGRESS_EVERY = 5`; `createInlineAnalyzer(data: PushFoldData, pause?: () => Promise<void>): HandAnalyzer`; `type WorkerRequest = { type: 'init'; data: PushFoldData } | { type: 'analyze'; id: number; raws: string[] }`; `type WorkerResponse = { type: 'progress'; id: number; done: number } | { type: 'done'; id: number; analyses: HandAnalysis[] } | { type: 'error'; id: number; message: string }`; `createWorkerHandler(post: (message: WorkerResponse) => void): (request: WorkerRequest) => void`; `type WorkerPort = { postMessage(message: WorkerRequest): void; onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null; onerror: ((event: ErrorEvent) => void) | null; terminate(): void }`; `createWorkerAnalyzer(data: PushFoldData, spawn: () => WorkerPort, fallback: HandAnalyzer): HandAnalyzer`
  - `src/review/analysis.worker.ts`: Worker-Einstieg (bindet `createWorkerHandler` an `self`)
  - `src/review/import.ts`: `analyzePlan(plan: ImportPlan, analyzer: HandAnalyzer, onProgress: (p: ImportProgress) => void): Promise<Map<string, AnalyzedHand[]>>` (meldet je Turnier zuerst `hand: 0`, dann den Fortschritt des Analyzers); `HANDS_PER_CHUNK` entfällt
  - `src/app/review-store.ts`: `ReviewStoreDeps.analyzer?: HandAnalyzer` (Standard: `createInlineAnalyzer(data, deps.pause)`); der Import rechnet mit diesem Analyzer
  - `vite.config.ts`: `worker: { format: 'es' }`; `package.json`: Skript `review:bench`

- [ ] **Step 1: Failing Tests schreiben**

`src/review/analyzer.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { analyzeHand } from './analysis';
import {
  INLINE_CHUNK,
  type WorkerPort,
  type WorkerRequest,
  type WorkerResponse,
  createInlineAnalyzer,
  createWorkerAnalyzer,
  createWorkerHandler,
} from './analyzer';
import dailyClassic from './fixtures/daily-classic.txt?raw';
import { parseHistory } from './parse';

const data = getPushFoldData();
const hands = parseHistory(dailyClassic).hands;
const expected = hands.map((h) => analyzeHand(h, data));

/** A worker double that runs the real worker handler, answering asynchronously like a real worker. */
function fakeWorker(log: WorkerRequest['type'][]): WorkerPort {
  const port: WorkerPort = {
    onmessage: null,
    onerror: null,
    terminate: () => {},
    postMessage(request) {
      log.push(request.type);
      handle(request);
    },
  };
  const handle = createWorkerHandler((message) => setTimeout(() => port.onmessage?.({ data: message } as MessageEvent<WorkerResponse>), 0));
  return port;
}

describe('inline analyzer', () => {
  it('rates like analyzeHand, pauses between chunks and reports progress', async () => {
    let pauses = 0;
    const done: number[] = [];
    const analyzer = createInlineAnalyzer(data, async () => {
      pauses++;
    });
    expect(await analyzer.analyze(hands, (n) => done.push(n))).toEqual(expected);
    expect(pauses).toBe(Math.ceil(hands.length / INLINE_CHUNK));
    expect(done.at(-1)).toBe(hands.length);
  });
});

describe('worker handler', () => {
  it('needs the push/fold data first and answers with the analyses', () => {
    const out: WorkerResponse[] = [];
    const handle = createWorkerHandler((m) => out.push(m));
    handle({ type: 'analyze', id: 1, raws: [hands[0].raw] });
    expect(out[0]).toMatchObject({ type: 'error', id: 1 });
    handle({ type: 'init', data });
    handle({ type: 'analyze', id: 2, raws: hands.map((h) => h.raw) });
    expect(out.at(-1)).toEqual({ type: 'done', id: 2, analyses: expected });
    expect(out).toContainEqual({ type: 'progress', id: 2, done: 5 });
  });
});

describe('worker analyzer', () => {
  it('sends the data once, then one job per call, and gives the same results as the main thread', async () => {
    const log: WorkerRequest['type'][] = [];
    const analyzer = createWorkerAnalyzer(data, () => fakeWorker(log), createInlineAnalyzer(data, async () => {}));
    const progress: number[] = [];
    const [a, b] = await Promise.all([analyzer.analyze(hands.slice(0, 3), (n) => progress.push(n)), analyzer.analyze(hands.slice(3))]);
    expect([...a, ...b]).toEqual(expected);
    expect(log).toEqual(['init', 'analyze', 'analyze']);
    expect(progress.at(-1)).toBe(3);
    expect(await analyzer.analyze([])).toEqual([]);
  });

  it('falls back to the main thread when the worker cannot start or fails', async () => {
    const fallback = createInlineAnalyzer(data, async () => {});
    const noWorker = createWorkerAnalyzer(data, () => {
      throw new Error('Worker nicht verfügbar');
    }, fallback);
    expect(await noWorker.analyze(hands)).toEqual(expected);

    let port: WorkerPort | null = null;
    const failing = createWorkerAnalyzer(
      data,
      () =>
        (port = { onmessage: null, onerror: null, terminate: () => {}, postMessage: () => {} }),
      fallback,
    );
    const pending = failing.analyze(hands);
    port!.onerror?.({} as ErrorEvent);
    expect(await pending).toEqual(expected);
    expect(await failing.analyze(hands.slice(0, 1))).toEqual(expected.slice(0, 1));
  });
});
```

`src/review/import.test.ts`: nach `import { ANALYSIS_VERSION } from './analysis';` einfügen:
```ts
import { createInlineAnalyzer } from './analyzer';
```
im Import aus `'./import'` die Zeile `  HANDS_PER_CHUNK,` löschen und den ganzen Block `describe('analyzePlan', …)` ersetzen durch:
```ts
describe('analyzePlan', () => {
  it('rates tournament by tournament with the analyzer and reports progress per tournament and hand', async () => {
    const plan = planImport(texts(steps, bounty), new Set());
    const progress: ImportProgress[] = [];
    const result = await analyzePlan(plan, createInlineAnalyzer(getPushFoldData(), async () => {}), (p) => progress.push(p));
    expect([...result.keys()]).toEqual(['318586851', '318586827', '318083464']);
    expect(result.get('318083464')![0].analysis.version).toBe(ANALYSIS_VERSION);
    expect(progress).toEqual([
      { tournament: 1, tournaments: 3, hand: 0, hands: 1 },
      { tournament: 1, tournaments: 3, hand: 0, hands: 1 },
      { tournament: 1, tournaments: 3, hand: 1, hands: 1 },
      { tournament: 2, tournaments: 3, hand: 0, hands: 1 },
      { tournament: 2, tournaments: 3, hand: 0, hands: 1 },
      { tournament: 2, tournaments: 3, hand: 1, hands: 1 },
      { tournament: 3, tournaments: 3, hand: 0, hands: 1 },
      { tournament: 3, tournaments: 3, hand: 0, hands: 1 },
      { tournament: 3, tournaments: 3, hand: 1, hands: 1 },
    ]);
  });

  it('rates 500 hands with postflop decisions well within 30 seconds', async () => {
    const hand = parseHand(bounty);
    const many = Array.from({ length: 500 }, (_, i) => hand.raw.replace('TM6532114653', `TM${900000 + i}`)).join('\n\n\n');
    const started = performance.now();
    const plan = planImport(texts(many), new Set());
    const result = await analyzePlan(plan, createInlineAnalyzer(getPushFoldData(), async () => {}), () => {});
    const ms = performance.now() - started;
    expect(result.get('318083464')).toHaveLength(500);
    expect(result.get('318083464')!.every((a) => a.analysis.decisions.filter((d) => d.rating.model === 'postflop').length === 5)).toBe(true);
    expect(ms).toBeLessThan(30_000);
  });
});
```

`src/app/review-store.test.ts`: nach `import { ANALYSIS_VERSION } from '../review/analysis';` einfügen:
```ts
import { type HandAnalyzer, createInlineAnalyzer } from '../review/analyzer';
```
und vor `  it('changes the kind of a tournament and counts errors again', async () => {` einfügen:
```ts
  it('rates imports with the analyzer it was given', async () => {
    let calls = 0;
    const inline = createInlineAnalyzer(getPushFoldData(), async () => {});
    const analyzer: HandAnalyzer = {
      analyze: (hands, onProgress) => {
        calls++;
        return inline.analyze(hands, onProgress);
      },
    };
    const { store } = await setup({ analyzer });
    await store.importText(`${bounty}\n\n${steps}`);
    expect(calls).toBe(3);
  });
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/review/analyzer.test.ts src/review/import.test.ts src/app/review-store.test.ts` → Expected: FAIL (Modul `./analyzer` fehlt; `analyzePlan` erwartet noch Push/Fold-Daten).

- [ ] **Step 3: Implementierung**

`src/review/analyzer.ts` anlegen:
```ts
import type { PushFoldData } from '../engine/pushfold-data';
import { type HandAnalysis, analyzeHand } from './analysis';
import { type ParsedHand, parseHand } from './parse';

/** Rates hands; `onProgress` receives how many of them are done. Results come in the order of `hands`. */
export interface HandAnalyzer {
  analyze(hands: readonly ParsedHand[], onProgress?: (done: number) => void): Promise<HandAnalysis[]>;
}

/** Hands rated on the main thread between two pauses (fallback and tests). */
export const INLINE_CHUNK = 5;
/** The worker reports progress after this many hands. */
export const WORKER_PROGRESS_EVERY = 5;

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Main-thread analyzer: rates in small chunks and pauses in between, so the page can paint. */
export function createInlineAnalyzer(data: PushFoldData, pause: () => Promise<void> = nextTick): HandAnalyzer {
  return {
    async analyze(hands, onProgress) {
      const out: HandAnalysis[] = [];
      for (const [i, hand] of hands.entries()) {
        if (i % INLINE_CHUNK === 0) {
          onProgress?.(i);
          await pause();
        }
        out.push(analyzeHand(hand, data));
      }
      onProgress?.(hands.length);
      return out;
    },
  };
}

export type WorkerRequest = { type: 'init'; data: PushFoldData } | { type: 'analyze'; id: number; raws: string[] };
export type WorkerResponse =
  | { type: 'progress'; id: number; done: number }
  | { type: 'done'; id: number; analyses: HandAnalysis[] }
  | { type: 'error'; id: number; message: string };

/** The worker's logic without the worker: handles one request and answers through `post`. */
export function createWorkerHandler(post: (message: WorkerResponse) => void): (request: WorkerRequest) => void {
  let data: PushFoldData | null = null;
  return (request) => {
    if (request.type === 'init') {
      data = request.data;
      return;
    }
    try {
      if (!data) throw new Error('Push/Fold-Daten fehlen im Worker');
      const analyses: HandAnalysis[] = [];
      for (const [i, raw] of request.raws.entries()) {
        analyses.push(analyzeHand(parseHand(raw), data));
        if ((i + 1) % WORKER_PROGRESS_EVERY === 0) post({ type: 'progress', id: request.id, done: i + 1 });
      }
      post({ type: 'done', id: request.id, analyses });
    } catch (error) {
      post({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
    }
  };
}

/** The part of a `Worker` the analyzer uses; tests pass a fake. */
export type WorkerPort = {
  postMessage(message: WorkerRequest): void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
};

type Job = {
  hands: readonly ParsedHand[];
  onProgress?: (done: number) => void;
  resolve: (analyses: HandAnalysis[]) => void;
  reject: (error: Error) => void;
};

/**
 * Rates hands in a Web Worker (one at a time, in order). The worker gets the push/fold data once and the raw hand
 * texts per job. When the worker cannot start or fails, this and every later job runs on `fallback` instead.
 */
export function createWorkerAnalyzer(data: PushFoldData, spawn: () => WorkerPort, fallback: HandAnalyzer): HandAnalyzer {
  let port: WorkerPort | null = null;
  let broken = false;
  let nextId = 1;
  const jobs = new Map<number, Job>();

  const giveUp = () => {
    broken = true;
    port?.terminate();
    port = null;
    const pending = [...jobs.values()];
    jobs.clear();
    for (const job of pending) fallback.analyze(job.hands, job.onProgress).then(job.resolve, job.reject);
  };

  const start = (): WorkerPort | null => {
    if (broken) return null;
    if (port) return port;
    try {
      port = spawn();
    } catch {
      broken = true;
      return null;
    }
    port.onmessage = ({ data: message }) => {
      const job = jobs.get(message.id);
      if (!job) return;
      if (message.type === 'progress') job.onProgress?.(message.done);
      else {
        jobs.delete(message.id);
        if (message.type === 'done') {
          job.onProgress?.(job.hands.length);
          job.resolve(message.analyses);
        } else job.reject(new Error(`Analyse fehlgeschlagen: ${message.message}`));
      }
    };
    port.onerror = giveUp;
    port.postMessage({ type: 'init', data });
    return port;
  };

  return {
    analyze(hands, onProgress) {
      if (hands.length === 0) return Promise.resolve([]);
      const worker = start();
      if (!worker) return fallback.analyze(hands, onProgress);
      return new Promise((resolve, reject) => {
        const id = nextId++;
        jobs.set(id, { hands, onProgress, resolve, reject });
        worker.postMessage({ type: 'analyze', id, raws: hands.map((h) => h.raw) });
      });
    },
  };
}
```

`src/review/analysis.worker.ts` anlegen:
```ts
import { type WorkerRequest, type WorkerResponse, createWorkerHandler } from './analyzer';

// Thin adapter: all logic lives in createWorkerHandler, which the tests run without a worker.
const scope = self as unknown as {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};
const handle = createWorkerHandler((message) => scope.postMessage(message));
scope.onmessage = (event) => handle(event.data);
```

`src/review/import.ts`: die beiden Zeilen
```ts
import type { PushFoldData } from '../engine/pushfold-data';
import { ANALYSIS_VERSION, type HandAnalysis, analyzeHand } from './analysis';
```
ersetzen durch:
```ts
import { ANALYSIS_VERSION, type HandAnalysis } from './analysis';
import type { HandAnalyzer } from './analyzer';
```
die beiden Zeilen
```ts
/** Hands analysed between two pauses that let the browser paint the progress bar. */
export const HANDS_PER_CHUNK = 25;
```
löschen und alles von `const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));` bis zum Ende der Funktion `analyzePlan` ersetzen durch:
```ts
/** Rates all planned hands with `analyzer`, tournament by tournament, reporting progress per tournament and hand. */
export async function analyzePlan(
  plan: ImportPlan,
  analyzer: HandAnalyzer,
  onProgress: (p: ImportProgress) => void,
): Promise<Map<string, AnalyzedHand[]>> {
  const out = new Map<string, AnalyzedHand[]>();
  const ids = [...plan.tournaments.keys()];
  for (const [t, id] of ids.entries()) {
    const hands = plan.tournaments.get(id)!;
    const progress = (hand: number) => onProgress({ tournament: t + 1, tournaments: ids.length, hand, hands: hands.length });
    progress(0);
    const analyses = await analyzer.analyze(hands, progress);
    out.set(id, hands.map((hand, i) => ({ hand, analysis: analyses[i] })));
  }
  return out;
}
```

`src/app/review-store.ts`: nach `import { ANALYSIS_VERSION, analyzeHand } from '../review/analysis';` einfügen:
```ts
import { type HandAnalyzer, createInlineAnalyzer } from '../review/analyzer';
```
im Typ `ReviewStoreDeps` vor `  pause?: () => Promise<void>;` einfügen:
```ts
  /** Rates hands; main.tsx passes the Web Worker analyzer. Default: on the main thread in chunks. */
  analyzer?: HandAnalyzer;
```
nach `  const { backend, data, canWrite, readOnly } = deps;` einfügen:
```ts
  const analyzer = deps.analyzer ?? createInlineAnalyzer(data, deps.pause);
```
und die Zeile `      const analyzed = await analyzePlan(plan, data, (progress) => update({ progress }), deps.pause);` ersetzen durch:
```ts
      const analyzed = await analyzePlan(plan, analyzer, (progress) => update({ progress }));
```

`src/main.tsx`: nach `import { createReviewStore } from './app/review-store';` einfügen:
```ts
import { createInlineAnalyzer, createWorkerAnalyzer } from './review/analyzer';
```
die Zeilen
```ts
  // The hand archive lives in its own database and follows the save's storage mode and writer lock.
  const review = createReviewStore({
```
ersetzen durch:
```ts
  // The hand archive lives in its own database and follows the save's storage mode and writer lock.
  // Hands are rated in a Web Worker (Monte-Carlo equities); without a worker on the main thread in chunks.
  const analyzer = createWorkerAnalyzer(
    getPushFoldData(),
    () => new Worker(new URL('./review/analysis.worker.ts', import.meta.url), { type: 'module' }),
    createInlineAnalyzer(getPushFoldData()),
  );
  const review = createReviewStore({
```
und im Objekt für `createReviewStore` nach `    readOnly: opened.info.readOnly,` einfügen:
```ts
    analyzer,
```

`vite.config.ts`: vor `  build: { chunkSizeWarningLimit: 1200 },` einfügen:
```ts
  // The analysis worker imports modules; an ES worker keeps them as one module graph.
  worker: { format: 'es' },
```

`package.json`: im Block `scripts` die Zeile `    "check:portability": "node scripts/check-portability.mjs ."` ersetzen durch:
```json
    "check:portability": "node scripts/check-portability.mjs .",
    "review:bench": "tsx scripts/review-bench.ts"
```

`scripts/review-bench.ts` anlegen:
```ts
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { getPushFoldData } from '../src/app/data';
import { analyzeHand } from '../src/review/analysis';
import { extractTexts, planImport } from '../src/review/import';
import { UNRATED_TEXT } from '../src/review/preflop';

// Measures the full analysis of real hand histories and prints how the postflop decisions were rated.
// Usage: npm run review:bench -- <file.zip|file.txt> [...]
const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('Aufruf: npm run review:bench -- <Datei.zip|Datei.txt> …');
  process.exit(2);
}
const data = getPushFoldData();
const started = performance.now();
const { texts } = extractTexts(paths.map((p) => ({ name: basename(p), bytes: new Uint8Array(readFileSync(p)) })));
const plan = planImport(texts, new Set());
const hands = [...plan.tournaments.values()].flat();
const analyses = hands.map((hand) => ({ hand, analysis: analyzeHand(hand, data) }));
const ms = performance.now() - started;

const counts = new Map<string, number>();
const add = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
let postflop = 0;
for (const { analysis } of analyses) {
  for (const d of analysis.decisions) {
    if (d.street === 'preflop') continue;
    postflop++;
    if (d.rating.model === 'postflop') add(`${d.rating.verdict} (${d.rating.reason})`);
    else if (d.rating.model === 'unrated') add(`nicht bewertet: ${UNRATED_TEXT[d.rating.reason]}`);
  }
}
console.log(`${hands.length} Hände analysiert in ${(ms / 1000).toFixed(2)} s`);
console.log(`${postflop} Postflop-Entscheidungen:`);
for (const [key, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${key}`);
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/review/analyzer.test.ts src/review/import.test.ts src/app/review-store.test.ts` → Expected: PASS (der Test „rates 500 hands with postflop decisions well within 30 seconds“ braucht im Prototyp etwa 2 s).

Run: `npm run build` → Expected: Build ohne Fehler; die Ausgabe listet `dist/assets/analysis.worker-<hash>.js` (etwa 43 kB) und „precache 12 entries“; `dist/sw.js` enthält den Dateinamen des Workers.

Run: `npm run review:bench -- samples/000001a1-35db-41af-0000-00007a500c79.zip` → Expected: `477 Hände analysiert in 0,1x s` (Ausgabe mit Punkt, z. B. `0.13 s`), danach `126 Postflop-Entscheidungen:` und die Verteilung (Werte siehe „Befunde“).

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (655 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/review/analyzer.ts src/review/analysis.worker.ts src/review/analyzer.test.ts scripts/review-bench.ts src/review/import.ts src/review/import.test.ts src/app/review-store.ts src/app/review-store.test.ts src/main.tsx vite.config.ts package.json
git commit -m "feat(review): Analyse im Web Worker mit Rückfall auf den Hauptthread und Messskript für echte Hände" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Neubewertung archivierter Hände, Postflop-Fehler in Übersicht und Verlauf

**Files:**
- Modify: `src/app/review-store.ts`, `src/ui/screens/ReviewOverview.tsx`, `src/ui/screens/ReviewScreen.tsx`, `src/ui/screens/HomeScreen.tsx`, `src/main.tsx`
- Test: `src/app/review-store.test.ts`, `src/ui/screens/ReviewScreen.test.tsx`

**Interfaces:**
- Consumes: `HandAnalyzer`, `createInlineAnalyzer` (Task 7); `ANALYSIS_VERSION`, `TournamentRecord.analysisVersion`, `tournamentRecordOf` (Task 6); `ArchiveFormatError`, `isHandAnalysis`, `loadHands`, `writeRecords`
- Produces (`src/app/review-store.ts`):
  - `ReviewSnapshot.reanalysis: ImportProgress | null` (Fortschritt der Neubewertung; beim Öffnen `tournament: 1, tournaments: 1`)
  - `ReviewStore.refreshStale(): Promise<void>` – bewertet alle Turniere mit `analysisVersion` ≠ `ANALYSIS_VERSION` im schreibenden Tab neu, Turnier für Turnier, und schreibt sie zurück; gibt bei laufender Neubewertung dieselbe Promise zurück; ohne Schreibrecht sofort fertig
  - `openTournament` bewertet über den Analyzer (asynchron) neu; Import, Art-Wechsel und Öffnen im schreibenden Tab laufen je Turnier als ein serieller Schritt (Laden, Bewerten, Schreiben)
  - Übersicht: Spalte „Fehler postflop“ mit Zahl bei aktueller Version, sonst „–“ (Titel „Wird neu bewertet, sobald du das Turnier öffnest“); Fortschrittszeile „Bewertung wird aktualisiert: Turnier x von y · Hand a von b“; Turnier-Ansicht lädt mit „Hände werden neu bewertet: a von b“
  - `main.tsx`: `refreshStale()` nach `load()` und nach `refreshAccess()`

- [ ] **Step 1: Failing Tests schreiben**

`src/app/review-store.test.ts`: im Test `it('rates hands from an older analysis version again when the tournament is opened', …)` dessen schließende Zeile `  });` (direkt nach `    expect(readHand(backend.dump()[key]).analysisVersion).toBe(ANALYSIS_VERSION);`) ersetzen durch den folgenden Block – eine zusätzliche Erwartung, das Ende des Tests und drei neue Tests:
```ts
    expect(store.getSnapshot().reanalysis).toBeNull();
  });

  it('rates stale tournaments again in the background, reports progress and stores the result', async () => {
    const { store, backend } = await setup();
    await store.importText(dailyClassic);
    // Make it look like Plan 7 wrote the archive: version 1 everywhere, no postflop ratings.
    const dump = backend.dump();
    const stale: [string, string][] = Object.entries(dump).map(([k, v]) => {
      const record = JSON.parse(v);
      if (k.startsWith(HAND_PREFIX)) return [k, JSON.stringify({ ...record, analysisVersion: 1, analysis: { version: 1, decisions: [] } })];
      const { analysisVersion: _, ...plan7 } = record;
      return [k, JSON.stringify(plan7)];
    });
    await backend.setMany(stale);
    await store.load();
    expect(store.getSnapshot().tournaments[0].analysisVersion).toBeUndefined();
    const seen: unknown[] = [];
    store.subscribe(() => seen.push(store.getSnapshot().reanalysis));
    await store.refreshStale();
    expect(seen).toContainEqual({ tournament: 1, tournaments: 1, hand: 6, hands: 6 });
    expect(store.getSnapshot().reanalysis).toBeNull();
    const t = readTournament(backend.dump()[tournamentKey('318096259')]);
    expect(t.analysisVersion).toBe(ANALYSIS_VERSION);
    expect(t.summary.preflopErrors).toBe(3);
    expect(Object.values(t.summary.days)[0].postflopErrors).toBe(t.summary.postflopErrors);
    expect(t.handIds.every((id) => readHand(backend.dump()[handKey(id)]).analysisVersion === ANALYSIS_VERSION)).toBe(true);
    // Nothing left to do: no progress the second time.
    seen.length = 0;
    await store.refreshStale();
    expect(seen.filter((r) => r !== null)).toEqual([]);
  });

  it('never loses imported hands while the background re-rating runs', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let hold = false;
    const { store, backend } = await setup({ pause: () => (hold ? gate : Promise.resolve()) });
    const hands = dailyClassic.split(/\n(?=Poker Hand #)/);
    await store.importText(hands.slice(0, 3).join('\n\n'));
    const [first] = store.getSnapshot().tournaments;
    await backend.setMany([[tournamentKey(first.id), JSON.stringify({ ...first, analysisVersion: 1 })]]);
    await store.load();
    hold = true;
    const refresh = store.refreshStale();
    const imported = store.importText(hands.slice(3).join('\n\n'));
    release();
    await Promise.all([refresh, imported]);
    expect(readTournament(backend.dump()[tournamentKey(first.id)]).handIds).toHaveLength(6);
    expect(store.getSnapshot().tournaments[0].handIds).toHaveLength(6);
  });

  it('rates in memory only in a reading tab and never writes there', async () => {
    const backend = memoryReviewBackend();
    const writer = createReviewStore({ backend, data: getPushFoldData(), canWrite: () => true, readOnly: false, pause: async () => {} });
    await writer.load();
    await writer.importText(bounty);
    const key = handKey('TM6532114653');
    const old = JSON.stringify({ ...readHand(backend.dump()[key]), analysisVersion: 1, analysis: { version: 1, decisions: [] } });
    await backend.setMany([[key, old]]);
    const reader = createReviewStore({ backend, data: getPushFoldData(), canWrite: () => false, readOnly: false, pause: async () => {} });
    await reader.load();
    await reader.refreshStale();
    const open = await reader.openTournament('318083464');
    expect(open.hands[0].record.analysisVersion).toBe(ANALYSIS_VERSION);
    expect(backend.dump()[key]).toBe(old);
  });
```

`src/ui/screens/ReviewScreen.test.tsx`: im Test `it('starts empty and imports pasted hands with a balance', …)` die Erwartung `['13.10.2026', 'Normal', '6', '3', '–', '50']` ersetzen durch `['13.10.2026', 'Normal', '6', '3', '0', '50']` und nach diesem Test einfügen:
```tsx
  it('shows a dash for postflop errors of a tournament that still waits for the new rating', async () => {
    const { memoryReviewBackend } = await import('../../review/archive');
    const backend = memoryReviewBackend();
    const first = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />, { reviewBackend: backend });
    await act(async () => {
      await first.loaded;
      await first.review.importText(bounty);
    });
    first.unmount();
    // The record as Plan 7 wrote it: no analysis version, so its summary has no postflop rating yet.
    const key = 'tournament:318083464';
    const { analysisVersion: _, ...plan7 } = JSON.parse(backend.dump()[key]);
    await backend.setMany([[key, JSON.stringify(plan7)]]);
    const second = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />, { reviewBackend: backend, info: { otherTabActive: true } });
    await act(() => second.loaded);
    const row = screen.getByRole('row', { name: /Bounty Hunters/ });
    expect(within(row).getAllByRole('cell')[4].textContent).toBe('–');
    expect(within(row).getAllByRole('cell')[4].getAttribute('title')).toBe('Wird neu bewertet, sobald du das Turnier öffnest');
  });
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/app/review-store.test.ts src/ui/screens/ReviewScreen.test.tsx` → Expected: FAIL (`refreshStale` fehlt, `reanalysis` ist `undefined`, die Spalte zeigt noch „–“).

- [ ] **Step 3: Implementierung**

`src/app/review-store.ts` vollständig ersetzen:
```ts
import type { PushFoldData } from '../engine/pushfold-data';
import { ANALYSIS_VERSION } from '../review/analysis';
import { type HandAnalyzer, createInlineAnalyzer } from '../review/analyzer';
import {
  ArchiveFormatError,
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
  writeFailureMessage,
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
  /** Archived hands being rated again after a logic change (ANALYSIS_VERSION); null when idle. */
  reanalysis: ImportProgress | null;
  lastImport: ImportSummary | null;
};
export type ReviewStoreDeps = {
  backend: ReviewBackend;
  data: PushFoldData;
  /** The writer lock of the save (one writing tab); checked before every write. */
  canWrite: () => boolean;
  /** The save comes from a newer app version. */
  readOnly: boolean;
  /** Rates hands; main.tsx passes the Web Worker analyzer. Default: on the main thread in chunks. */
  analyzer?: HandAnalyzer;
  pause?: () => Promise<void>;
};
export type ReviewStore = {
  /** The push/fold data the ratings use (charts and comparisons in the hand view). */
  readonly data: PushFoldData;
  getSnapshot(): ReviewSnapshot;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  /** Re-checks the writer lock and reloads the archive index, e.g. after this tab became the writer (other tabs may have written meanwhile). */
  refreshAccess(): Promise<void>;
  importFiles(files: readonly ImportFile[]): Promise<ImportSummary>;
  importText(text: string): Promise<ImportSummary>;
  openTournament(id: string): Promise<OpenTournament>;
  /**
   * Rates every tournament whose hands come from an older analysis version again and stores the result, one
   * tournament after the other. Only in the writing tab; does nothing otherwise or while it already runs.
   */
  refreshStale(): Promise<void>;
  setKind(id: string, kind: TournamentKind): Promise<void>;
  deleteTournament(id: string): Promise<void>;
  /** The archive part of a manual export (null when the archive is empty) and the number of unreadable entries left out of it. */
  exportPart(): Promise<{ part: ArchiveExport | null; omitted: number }>;
  /** Merges the archive part of an export file (hand numbers decide about duplicates). */
  mergeExport(part: ArchiveExport): Promise<ImportSummary>;
};

export const LOCK_READ_ONLY = 'Nur-Lesen-Modus: Bitte die App aktualisieren, um Hände zu importieren.';
export const LOCK_NEWER_ARCHIVE = 'Das Hand-Archiv stammt aus einer neueren Version – bitte die App aktualisieren.';
export const LOCK_OTHER_TAB = 'Import ist nur in dem Tab möglich, der deinen Fortschritt speichert.';
export const BLOCKED_DURING_IMPORT = 'Während eines Imports nicht möglich.';
export const LOCK_FAILED = 'Das Hand-Archiv konnte nicht geladen werden.';

const byNewest = (a: TournamentRecord, b: TournamentRecord) => b.lastPlayedAt.localeCompare(a.lastPlayedAt) || a.id.localeCompare(b.id);

export function createReviewStore(deps: ReviewStoreDeps): ReviewStore {
  const { backend, data, canWrite, readOnly } = deps;
  const analyzer = deps.analyzer ?? createInlineAnalyzer(data, deps.pause);
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
    reanalysis: null,
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

  type LoadedHands = { hands: ReviewHand[]; changed: HandRecord[]; problems: ArchiveProblem[] };

  /**
   * Loads the hands of a tournament, parses the stored texts and rates every hand again whose analysis is missing,
   * broken or from another version (`changed`). Unreadable texts are reported, never deleted.
   */
  async function loadTournamentHands(tournament: TournamentRecord, onProgress?: (done: number, total: number) => void): Promise<LoadedHands> {
    const loaded = await loadHands(backend, tournament.handIds);
    const problems = [...loaded.problems];
    const parsed: ReviewHand[] = [];
    const stale: number[] = [];
    for (const record of loaded.hands) {
      let hand: ParsedHand;
      try {
        hand = parseHand(record.raw);
      } catch (error) {
        if (!(error instanceof HandParseError)) throw error;
        problems.push({ key: `hand:${record.id}`, reason: 'Hand-Text nicht lesbar' });
        continue;
      }
      if (record.analysisVersion !== ANALYSIS_VERSION || !isHandAnalysis(record.analysis)) stale.push(parsed.length);
      parsed.push({ record, hand });
    }
    const analyses =
      stale.length === 0 ? [] : await analyzer.analyze(stale.map((i) => parsed[i].hand), (done) => onProgress?.(done, stale.length));
    const changed: HandRecord[] = [];
    stale.forEach((i, k) => {
      const record: HandRecord = { ...parsed[i].record, analysis: analyses[k], analysisVersion: analyses[k].version };
      parsed[i] = { record, hand: parsed[i].hand };
      changed.push(record);
    });
    return { hands: parsed, changed, problems };
  }

  const isCurrent = (t: TournamentRecord) => (t.analysisVersion ?? 1) === ANALYSIS_VERSION;
  let refreshing: Promise<void> | null = null;

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
      const analyzed = await analyzePlan(plan, analyzer, (progress) => update({ progress }));
      let imported = 0;
      let tournaments = 0;
      const failures: string[] = [];
      for (const [id, items] of analyzed) {
        const added = items.map(handRecordOf);
        try {
          // Load, merge and write in one serial step, so a background re-rating never interleaves with it.
          const record = await serial(async () => {
            const previous = snapshot.tournaments.find((t) => t.id === id) ?? null;
            const old: LoadedHands = previous ? await loadTournamentHands(previous) : { hands: [], changed: [], problems: [] };
            const next = tournamentRecordOf(
              id,
              items[0].hand.tournamentName,
              [...old.hands.map((h) => h.record), ...added],
              previous,
              previous ? null : (kinds.get(id) ?? null),
            );
            await writeRecords(backend, [next], [...old.changed, ...added]);
            return next;
          });
          imported += added.length;
          tournaments += 1;
          update({ tournaments: replaceTournament(record) });
        } catch (error) {
          // A refused tournament (newer version, unreadable record) is reported; the others continue.
          const name = snapshot.tournaments.find((t) => t.id === id)?.name ?? items[0].hand.tournamentName;
          failures.push(writeFailureMessage(error, name));
        }
      }
      const summary: ImportSummary = {
        imported,
        duplicates: plan.duplicates,
        skipped: countSkipped([...fileSkipped, ...plan.skipped]),
        tournaments,
        ...(failures.length > 0 ? { failures } : {}),
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
    async refreshAccess() {
      update({});
      // Another tab may have written while this one only read; never build records from a stale index.
      await store.load();
    },
    importFiles(files) {
      const { texts, skipped } = extractTexts(files);
      return importTexts(texts, skipped);
    },
    importText(text) {
      return importTexts([{ name: 'Eingefügt', text }], []);
    },
    openTournament(id) {
      if (!snapshot.tournaments.some((t) => t.id === id)) return Promise.reject(new Error('Turnier nicht gefunden'));
      const open = async (): Promise<OpenTournament> => {
        const tournament = snapshot.tournaments.find((t) => t.id === id);
        if (!tournament) throw new Error('Turnier nicht gefunden');
        let shown = false;
        try {
          const loaded = await loadTournamentHands(tournament, (hand, hands) => {
            shown = true;
            update({ reanalysis: { tournament: 1, tournaments: 1, hand, hands } });
          });
          let current = tournament;
          // Hands rated by an older version are rated again; the result is kept when this tab may write.
          if (loaded.changed.length > 0) {
            current = tournamentRecordOf(id, tournament.name, loaded.hands.map((h) => h.record), tournament);
            if (snapshot.writable) {
              await writeRecords(backend, [current], loaded.changed);
              update({ tournaments: replaceTournament(current) });
            }
          }
          return { tournament: current, hands: loaded.hands, problems: loaded.problems };
        } finally {
          if (shown && !refreshing) update({ reanalysis: null });
        }
      };
      // A writing tab loads, rates and stores in one serial step; a reading tab rates in memory only.
      return snapshot.writable ? serial(open) : open();
    },
    refreshStale() {
      if (refreshing) return refreshing;
      if (snapshot.status === 'ready') update({});
      const ids = snapshot.writable ? snapshot.tournaments.filter((t) => !isCurrent(t)).map((t) => t.id) : [];
      if (ids.length === 0) return Promise.resolve();
      const run = async () => {
        try {
          for (const [k, id] of ids.entries()) {
            const stop = await serial(async () => {
              update({});
              if (!snapshot.writable) return true;
              const tournament = snapshot.tournaments.find((t) => t.id === id);
              if (!tournament || isCurrent(tournament)) return false;
              const loaded = await loadTournamentHands(tournament, (hand, hands) =>
                update({ reanalysis: { tournament: k + 1, tournaments: ids.length, hand, hands } }),
              );
              // A tournament with unreadable hands keeps its record; opening it shows the problem.
              if (loaded.problems.length > 0) return false;
              const record = tournamentRecordOf(id, tournament.name, loaded.hands.map((h) => h.record), tournament);
              try {
                await writeRecords(backend, [record], loaded.changed);
              } catch (error) {
                if (!(error instanceof ArchiveFormatError)) throw error;
                return false;
              }
              update({ tournaments: replaceTournament(record) });
              return false;
            });
            if (stop) break;
          }
        } finally {
          refreshing = null;
          update({ reanalysis: null });
        }
      };
      refreshing = run();
      return refreshing;
    },
    async setKind(id, kind) {
      assertWritable();
      if (snapshot.progress) throw new Error(BLOCKED_DURING_IMPORT);
      if (!snapshot.tournaments.some((t) => t.id === id)) throw new Error('Turnier nicht gefunden');
      await serial(async () => {
        const tournament = snapshot.tournaments.find((t) => t.id === id);
        if (!tournament) throw new Error('Turnier nicht gefunden');
        const loaded = await loadTournamentHands(tournament);
        const record = tournamentRecordOf(id, tournament.name, loaded.hands.map((h) => h.record), tournament, kind);
        await writeRecords(backend, [record], loaded.changed);
        update({ tournaments: replaceTournament(record) });
      });
    },
    async deleteTournament(id) {
      assertWritable();
      if (snapshot.progress) throw new Error(BLOCKED_DURING_IMPORT);
      const tournament = snapshot.tournaments.find((t) => t.id === id);
      if (!tournament) return;
      await serial(() => removeTournament(backend, tournament));
      update({ tournaments: snapshot.tournaments.filter((t) => t.id !== id) });
    },
    async exportPart() {
      let omitted = snapshot.problems.length;
      if (snapshot.tournaments.length === 0) return { part: null, omitted };
      const part: ArchiveExport = { reviewSchemaVersion: REVIEW_SCHEMA_VERSION, tournaments: [], hands: [] };
      for (const t of snapshot.tournaments) {
        part.tournaments.push({ id: t.id, name: t.name, kind: t.kind });
        const { hands, problems } = await loadHands(backend, t.handIds);
        omitted += problems.length;
        for (const h of hands) part.hands.push({ id: h.id, tournamentId: h.tournamentId, raw: h.raw });
      }
      return { part, omitted };
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

`src/ui/screens/ReviewOverview.tsx`: nach `import { localDateKey } from '../../game/streak';` einfügen:
```ts
import { ANALYSIS_VERSION } from '../../review/analysis';
```
im Einleitungstext die Zeilen
```tsx
          Lade deine GGPoker-Hand-Historien (.txt oder .zip) hoch. Jede Preflop-Entscheidung wird mit den Push/Fold-Daten
          und den Starthand-Charts bewertet.
```
ersetzen durch:
```tsx
          Lade deine GGPoker-Hand-Historien (.txt oder .zip) hoch. Jede Preflop-Entscheidung wird mit den Push/Fold-Daten
          und den Starthand-Charts bewertet, Flop, Turn und River mit Faustregeln (Equity gegen die geschätzte Range des
          Gegners und Pot Odds).
```
nach `        {review.lockReason && <p className="muted">{review.lockReason}</p>}` einfügen:
```tsx
        {review.reanalysis && (
          <p className="muted" aria-live="polite">
            Bewertung wird aktualisiert: Turnier {review.reanalysis.tournament} von {review.reanalysis.tournaments} · Hand{' '}
            {formatCount(review.reanalysis.hand)} von {formatCount(review.reanalysis.hands)}
          </p>
        )}
```
und die Zeile `                      <td title="Postflop-Bewertung folgt">–</td>` ersetzen durch:
```tsx
                      {(t.analysisVersion ?? 1) === ANALYSIS_VERSION ? (
                        <td>{formatCount(t.summary.postflopErrors)}</td>
                      ) : (
                        <td title="Wird neu bewertet, sobald du das Turnier öffnest">–</td>
                      )}
```

`src/ui/screens/ReviewScreen.tsx`: die Zeile `import { useReviewStore } from '../ReviewContext';` ersetzen durch:
```tsx
import { formatCount } from '../../app/format';
import { useReview, useReviewStore } from '../ReviewContext';
```
nach `  const store = useReviewStore();` einfügen:
```tsx
  const { reanalysis } = useReview();
```
und die Zeile `          !message && <p className="panel muted">Turnier wird geladen …</p>` ersetzen durch:
```tsx
          !message && (
            <p className="panel muted" aria-live="polite">
              {reanalysis
                ? `Hände werden neu bewertet: ${formatCount(reanalysis.hand)} von ${formatCount(reanalysis.hands)}`
                : 'Turnier wird geladen …'}
            </p>
          )
```

`src/ui/screens/HomeScreen.tsx`: die Zeile `      text: 'GGPoker-Hände importieren und deine Preflop-Entscheidungen prüfen',` ersetzen durch:
```tsx
      text: 'GGPoker-Hände importieren und deine Entscheidungen prüfen – preflop und postflop',
```

`src/main.tsx`: die Zeile `  void review.load();` ersetzen durch:
```ts
  // Archived hands from an older analysis version are rated again in the background (writing tab only).
  review.load().then(() => review.refreshStale()).catch(logError);
```
und die Zeile `    review.refreshAccess().catch(logError);` ersetzen durch:
```ts
    review.refreshAccess().then(() => review.refreshStale()).catch(logError);
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/app/review-store.test.ts src/ui/screens/ReviewScreen.test.tsx src/ui` → Expected: PASS.

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → alle PASS (659 Tests). Run: `npm run typecheck` → Exit 0. Run: `npm run check:portability` → keine Befunde.

```bash
git add src/app/review-store.ts src/app/review-store.test.ts src/ui/screens/ReviewOverview.tsx src/ui/screens/ReviewScreen.tsx src/ui/screens/ReviewScreen.test.tsx src/ui/screens/HomeScreen.tsx src/main.tsx
git commit -m "feat(review): archivierte Hände nach neuer Analyse-Version im Hintergrund neu bewerten, Postflop-Fehler in Übersicht und Verlauf" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Build-Prüfung, Leistungsmessung mit den echten Händen und manuelle Abnahme

**Files:**
- Keine Änderungen geplant. Nur wenn eine Prüfung scheitert, wird die Ursache im betroffenen Task-Bereich behoben und mit eigenem Commit festgehalten.

- [ ] **Step 1: Automatische Prüfungen**

Run: `npm test` → Expected: alle PASS (659 Tests).
Run: `npm run typecheck` → Expected: Exit 0.
Run: `npm run check:portability` → Expected: keine Befunde.
Run: `npm run build` → Expected: Build ohne Fehler und ohne neue Warnungen; Haupt-Bundle unter `chunkSizeWarningLimit` 1200 kB (im Prototyp 1035 kB), `dist/assets/analysis.worker-<hash>.js` vorhanden und in `dist/sw.js` aufgeführt.

- [ ] **Step 2: Leistungsmessung mit den echten Händen**

Run: `npm run review:bench -- samples/000001a1-35db-41af-0000-00007a500c79.zip` → Expected (Prototyp):
```text
477 Hände analysiert in 0.13 s
126 Postflop-Entscheidungen:
    48  nicht bewertet: Multiway
    18  nicht bewertet: Range des Gegners unbekannt: Limp-Pot
    15  ok (betOk)
    15  ok (checkOk)
    14  nicht bewertet: Range des Gegners unbekannt: höchstens 20 BB (kein Chart)
     6  ok (foldOk)
     4  ok (callOk)
     3  questionable (callThin)
     1  questionable (raiseWeak)
     1  ok (raiseOk)
     1  mistake (callTooWeak)
```
Die Zeit hängt vom Rechner ab; Ziel laut Spec: 500 Hände unter 30 s. Weicht die Verteilung ab, sind die Abweichungen zu begründen (z. B. geänderte Charts), bevor der Plan als erledigt gilt.

Im Browser: `npm run preview`, App öffnen, in den Entwicklerwerkzeugen unter „Performance“ die Aufnahme starten, die ZIP über „Dateien wählen“ importieren und stoppen. Expected: Bilanz „Importiert: 477 · Schon vorhanden: 0 · Übersprungen: 0“ nach rund einer halben Sekunde (Prototyp: 0,5 s), kein Long Task über 50 ms im Hauptthread, die Analyse läuft im Thread „analysis.worker“.

- [ ] **Step 3: Manuelle Abnahme (Controller)**

Run: `npm run preview`, dann im Browser am PC (mindestens 1100 px breit) und in der Größe 375×812 prüfen:

- Upgrade: Mit dem Stand aus Plan 7 importierte Hände (vorher in der alten Version die ZIP importieren). Nach dem Laden der neuen Version erscheint in der Übersicht kurz „Bewertung wird aktualisiert: Turnier x von 8 · Hand a von b“, danach zeigt „Fehler postflop“ Zahlen (Daily Classic $1: 1, sonst 0). Der Spielstand (`save` in `poker-trainer`) ist unverändert, `REVIEW_SCHEMA_VERSION` der Datensätze bleibt 1, Turnier-Datensätze haben `analysisVersion: 2`.
- Zweiter Tab gleichzeitig offen: Er bewertet nichts im Hintergrund und schreibt nichts; beim Öffnen eines noch alten Turniers wird im Arbeitsspeicher neu bewertet („Hände werden neu bewertet …“), die Datensätze bleiben unverändert. Nur-Lesen-Modus (`schemaVersion: 2` im Spielstand): ebenso nur Anzeige.
- Turnier „Daily Classic $1“: Hand „33 · SB“ zeigt in der Liste „Fehler“; Filter „Nur Fehler“ enthält sie, „Auch fraglich“ zusätzlich die Hand „AJo · CO“ mit „Fraglich“ (gold).
- Hand-Ansicht dieser 33-Hand: Turn-Call mit Überschrift „Wahrscheinlich Fehler“ (rot), „Zu wenig Equity für den Call: …“, „Equity 4 % gegen die Range · nötig 20 %“, „SPR 0,4“, „Gegner BB: 3-Bet gegen deinen Open · Chart für 40 BB · etwa 63 Kombinationen“, „Faustregel, kein Solver-Ergebnis“; Flop-Bet „Passt“ mit „Einsatz 50 % vom Pot“. Tasten ← → springen zwischen den Entscheidungen.
- Bounty-Turnier: die 66-Hand zeigt am Turn „Fraglich“ mit „(inkl. 5 Punkte Implied Odds (Draw mit mindestens 8 Outs))“; ein Postflop-Fehler in Satellit/Bounty erscheint als „Hinweis“ mit „Satellit/Bounty – Standard-Chart nur bedingt gültig“ und zählt nicht.
- Multiway- und Limp-Pots: „Nicht bewertet“ mit „Multiway“ bzw. „Range des Gegners unbekannt: Limp-Pot“, darunter Pot, zu callen, Stack und „nötige Equity … · Einsatz … vom Pot“.
- Verlauf „Fehler pro 100 Hände“ zählt Postflop-Fehler mit (Daily Classic: 21 Fehler auf 284 Hände in der Woche bis heute).
- Startseite: Kachel „Hand-Review“ mit „GGPoker-Hände importieren und deine Entscheidungen prüfen – preflop und postflop“.
- Offline: Nach einmaligem Laden funktionieren Import und Neubewertung ohne Netz (der Worker kommt aus dem Service-Worker-Cache).
- Am Handy (375×812): Urteil unter dem Tisch, keine waagrechte Scrollleiste außer in der Turniertabelle.

- [ ] **Step 4: Übergabe**

Ergebnis der Prüfungen festhalten (gemessene Zeiten, Verteilung). Die Veröffentlichung erfolgt über den Merge des Pull Requests von `feat/hand-review-postflop` (nicht Teil dieses Plans).

---

## Abdeckung der Spec

| Spec | Umsetzung |
|---|---|
| 2 Urteile postflop, Fehler nur `wahrscheinlich Fehler` | Task 3 (`PostflopVerdict`), Task 6 (`decisionOutcome`, Zählung) |
| 5 Satellit/Bounty: Fehler → Hinweis | Task 6 (`decisionOutcome`, Panel „Hinweis“) |
| 7 Bewertungsbedingungen, Multiway, Range unbekannt, Zahlen trotzdem | Task 4 (`villainStart`), Task 5 (`ratePostflop`), Task 6 (Panel für nicht bewertete Entscheidungen) |
| 7 Range: Startrange, Eingrenzung, Card Removal | Task 1 (`keepShare`, `removeCards`, `comboStrengths`), Task 4, Task 5 |
| 7 Zahlen: Equity im Web Worker, nötige Equity, Einsatz % Pot, SPR | Task 2, Task 5 (`postflopNumbers`), Task 7 (Worker) |
| 7 Regeltabelle, Implied Odds, Konstanten in einer Datei, Hinweis „Faustregel …“ | Task 3, Task 6 (`POSTFLOP_DISCLAIMER`) |
| 7 Bewertungsversion, Neubewertung beim Öffnen | Task 6 (`ANALYSIS_VERSION = 2`), Task 8 (Öffnen und Hintergrund) |
| 8 Hand-Ansicht mit Urteil, Begründung, Zahlen; Übersicht „Fehler postflop“; Verlauf; Filter | Task 6, Task 8 |
| 9 Schema 1, Schreibsperre, Nur-Lesen, unlesbare Einträge | Task 6 (optionale Felder), Task 8 (nur schreibender Tab, Probleme bleiben) |
| 11 Tests je Regelzeile, Eingrenzung, Card Removal, fester Seed; Leistung | Task 1–5, Task 7 (500-Hände-Test), Task 9 (Messung) |
| 12 Plan 8 vollständig | Task 1–9 |
