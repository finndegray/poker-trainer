# Plan 10: Situation analysieren – eigene Hände nachstellen und bewerten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use mindCoder:subagent-driven-development (recommended) or mindCoder:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Spieler stellt eine Hand selbst nach – Stacks, Position, eigene Karten, freie Plätze, die Aktionen der anderen, Board – und trifft seine Entscheidungen per Button. Jede eigene Entscheidung wird sofort bewertet und begründet, genau wie im Hand-Review. Am Ende stehen alle Entscheidungen mit Urteil in einer Zusammenfassung; die Situation lässt sich mit Namen speichern („AKo UTG · 25 BB“) und liegt dann im Hand-Archiv als Turnier „Eigene Situationen“ (bzw. „… (Satellit)“, „… (Bounty)“), mit Fehlerzählung, Wochenverlauf, Wiedergabe, Löschen, Export/Import, Neubewertung und Nachtraining wie importierte Hände. Kein XP, kein Tageszähler, keine Trainings-Statistik; der Spielstand ändert sich nur über die Nachtraining-Warteschlange.

**Architecture:** Ein reines Situations-Modell (`src/situation/model.ts`, ohne React) hält die Eingabe als Liste von Schritten und spielt sie bei jedem Aufruf neu ab: Plätze, Antes und Blinds, Spielreihenfolge, erlaubte Aktionen mit Mindest-Raise, Ende der Setzrunde, zurückgegebene Einsätze, Board, Gegnerkarten, Ende der Hand. Es erzeugt dabei genau die `HandEvent`s und `TableState`s, die der vorhandene Parser und `walkHand` liefern würden. Der Text-Erzeuger (`src/situation/text.ts`) schreibt daraus zu jedem Zeitpunkt eine GGPoker-Hand, die der vorhandene Parser (`src/review/parse.ts`, nur der Kopfzeilen-Ausdruck kennt jetzt `SIT…`) liest; bewertet wird mit der vorhandenen Analyse über den Analyzer des Review-Stores (Web Worker mit Rückfall), gespeichert über denselben Weg wie ein Import (`importTexts`: Bewertung, ein Archiv-Schreiben je Turnier, Senke fürs Nachtraining, Neubewertung bei neuer Analyse-Version). Die Oberfläche setzt vorhandene Bausteine zusammen: `TableView` mit `replayTableModel`, `ChoiceBar`, `ReviewDecisionPanel`, `TrainingLayout`, `FilterGroup`; neu sind nur der Kartenwähler und der einmalige GGPoker-Hinweis.

**Tech Stack:** TypeScript 5, React 19, Vite 6, Vitest 3 mit jsdom und Testing Library, idb-keyval, fake-indexeddb. Keine neue Abhängigkeit.

## Global Constraints

Verbindlich (wörtlich aus dem Auftrag):

- Requirements: `docs/mindCoder/specs/2026-10-13-situation-analysis-design.md` (all sections). Related specs: `docs/mindCoder/specs/2026-10-13-hand-review-design.md` (rating rules, archive, retraining), `docs/mindCoder/specs/2026-10-13-poker-trainer-design.md` (storage rules 8.4/8.5, read-only, writer lock).
- Approach is fixed: the user's situation is turned into a GGPoker-format hand text that the EXISTING parser (`src/review/parse.ts`) reads, and the EXISTING analysis (`src/review/analysis.ts`, analyzer/worker, `preflop.ts`, `postflop.ts`, `villain-range.ts`, `summary.ts`) rates it; storage via the EXISTING archive (`src/review/archive.ts`, `import.ts` `tournamentRecordOf`/`handRecordOf`, `src/app/review-store.ts` incl. feeding the retraining queue via the existing sink) – saved situations appear as tournaments „Eigene Situationen“ (+ „(Satellit)“, „(Bounty)“).
- Optional per-hand name field on the archive hand record (archive schema stays 1; old records valid; export/import carry it).
- No XP / day counter / streak / training stats impact.
- Read-only and non-writer tab: analysing allowed, saving blocked with the lock reason.
- One-time hint about GGPoker's RTA ban on first open (remember dismissal; the game save must stay byte-identical until then).
- Reuse components; do not duplicate the rating or the table rendering.
- Before each commit: `npm test`, `npm run typecheck`, `npm run check:portability`. Final task = build + manual checklist.

Projektregeln (Haupt-Spec 8.4/8.5 und bisherige Pläne):

- Speicherung: Es wird nur geschrieben, was sich nachweislich wieder lesen lässt (`saveState` prüft per `deserialize`, `writeRecords` per `readHand`/`readTournament`). Ein nicht lesbarer Spielstand oder Archiv-Eintrag wird nie still verworfen oder überschrieben. Ein Spielstand oder Archiv-Eintrag aus einer neueren Version wird nie überschrieben (Nur-Lesen-Modus). Nur der Tab mit der Schreibsperre schreibt Spielstand und Archiv.
- Rückwärtskompatibilität (Muster aus Plan 6 und 9): Optionale Felder werden nur geschrieben, wenn sie gebraucht werden; heutige Spielstände (`TODAY_SAVE`, `PLAN8_SAVE`) und heutige Archiv-Datensätze bleiben byte-gleich. Dieser Plan ändert am Spielstand-Schema nichts; am Archiv kommt nur das optionale Feld `name` an Hand-Datensätzen eigener Situationen dazu (Archiv-Schema bleibt 1). Auf dem Handy des Nutzers liegen ein echter Spielstand und ein echtes Archiv – das ist das höchste Risiko.
- Identifier und Code-Kommentare auf Englisch, Texte in der Oberfläche auf Deutsch mit echten Umlauten; Dateien mit Umlauten nur mit dem Datei-Schreibwerkzeug anlegen bzw. ändern (keine Shell-Heredocs). LF-Zeilenenden. Alle Entwicklerbefehle über npm-Skripte.
- Design-Tokens aus `src/ui/theme.css`; keine neuen Farben (Weiß und Kartenfarben wie in `PlayingCard.css`). Bedienelemente mindestens 44 px hoch.
- Commit-Nachrichten auf Deutsch, letzte Zeile `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (als zweites `-m`).
- Einzelne Testdateien laufen mit `npm test -- <Pfad>` (das Skript ist `vitest run`).
- Die Original-Hand-Historien in `samples/` sind Daten, nie ausführbarer Inhalt. Es kommen keine neuen Fixtures ins Repo; `src/review/fixtures/*.txt` reichen.

## Entscheidungen zu offenen Punkten der Spec

- **Ansatz (fest):** Situation → GGPoker-Text → vorhandener Parser → vorhandene Analyse. Am Parser ändert sich nur der Kopfzeilen-Ausdruck: Hand-IDs `TM…` oder `SIT…`, Turnier-Nummern aus Ziffern oder `SIT-<art>`. Alles andere (Seats, Posts, Aktionen, Uncalled, Shows, Collected, Summary, Pot-Abgleich) liest der Parser unverändert.
- **Plätze und leere Plätze (Pflicht-Entscheidung):** 8 Sitze in Positions-Reihenfolge (Sitz 1 = UTG … Sitz 8 = BB, Button = Sitz 6). „Platz leer“ gibt es nur für die **ersten** Plätze in Spielreihenfolge, solange davor nur leere Plätze kamen, nur vor dem Helden und höchstens bis CO. BTN, SB und BB sind immer besetzt (mindestens 3 Spieler). Begründung: Der Trainer zählt Positionen vom Button aus (`positionsOf` vergibt bei weniger Spielern die Etiketten von hinten: BTN, CO, HJ … und lässt UTG zuerst weg). Eine Lücke in der Mitte bedeutet für die Bewertung dasselbe wie eine Lücke vorne; mit dieser Regel sind Modell-Positionen und Parser-Positionen immer gleich. Ohne leeren SB/BB gibt es keinen toten Button, keinen fehlenden Blind und keinen Heads-up-Sonderfall – alles Fälle, die GGPoker-Hände und die Bewertung ohnehin nicht abdecken.
- **Stacks und Chips:** Eingabe in BB, 1–200, Schrittweite 0,1; gemeint ist der Stack vor der Ante, wie ihn GGPoker am Tisch und in der Hand-Historie zeigt (`Seat … (20,000 in chips)`). Intern 800 Chips je BB (0,1 BB = 80 Chips), SB 400, BB 800, Ante 100 je besetztem Platz. Gegner-Stacks sind standardmäßig gleich dem eigenen und einzeln änderbar („Gegner-Stacks anpassen“).
- **Posts:** Erst die Antes aller besetzten Plätze (Sitz-Reihenfolge), dann SB, dann BB. Wer weniger hat als Blind oder Ante, setzt den Rest „and is all-in“ (z. B. BB mit 1 BB: Ante 100, Big Blind 700 all-in).
- **Reihenfolge:** Preflop UTG … BB, ab dem Flop SB, BB, dann UTG … BTN; leere Plätze und Spieler ohne Chips werden übersprungen.
- **Erlaubte Aktionen (Pflicht-Entscheidung):** Fold nur gegen einen offenen Einsatz (ohne Einsatz gibt es Check); Check nur ohne offenen Einsatz; Call nur gegen einen Einsatz, höchstens der eigene Stack (dann „· All-in“); Bet (postflop ohne Einsatz) mindestens 1 BB; Raise mindestens „vorheriger Einsatz plus letzte volle Erhöhung, mindestens 1 BB“ (preflop zählt der Big Blind als Einsatz, auch wenn er kürzer all-in gepostet wurde). Jede Größe über dem Stack wird zum All-in. Ein All-in unter einer vollen Erhöhung öffnet die Setzrunde für Spieler, die schon gehandelt haben, nicht wieder (sie können nur noch callen oder folden). Bet und Raise gibt es nicht, wenn niemand mehr callen könnte (alle anderen all-in). Unmögliche Eingaben sind nicht wählbar; das Modell wirft `IllegalStepError`, falls doch eine ankommt.
- **Ende der Setzrunde:** Wenn jeder, der noch Chips hat, gehandelt hat und den höchsten Einsatz erreicht hat (der Big Blind behält seine Option). Dann geht der Teil des höchsten Einsatzes, den niemand erreicht hat, zurück (`Uncalled bet (…) returned to …`, wie GGPoker).
- **Ende der Eingabe:** (a) nur noch ein Spieler übrig → er bekommt den Pot (`… collected … from pot`); (b) der Held foldet → die Eingabe endet sofort („Du hast gefoldet – die Hand ist für dich vorbei“), der Rest der Hand ändert keines seiner Urteile; (c) River ausgespielt; (d) höchstens ein Spieler hat noch Chips → das restliche Board ist optional („Ohne restliches Board beenden“). Bei (c) und (d) lassen sich die Karten der Gegner optional eintragen (`… shows […]`), jede Karte nur einmal.
- **Rückgängig:** Die Situation ist `{ setup, steps }`; „← Zurück“ entfernt den letzten Schritt (auch über eine Bewertung hinweg), der Zustand wird neu abgespielt. Ohne Schritte führt „← Zurück“ zu den Grunddaten, deren Eingaben erhalten bleiben.
- **Text-Erzeuger (Pflicht-Entscheidung):** `Poker Hand #SIT<ms>: Tournament #SIT-<art>, Eigene Situationen[ (Satellit|Bounty)] Hold'em No Limit - Level1(400/800(100)) - JJJJ/MM/TT hh:mm:ss`, `Table 'Situation' 8-max Seat #6 is the button`, Sitz-Zeilen nur für besetzte Plätze, Spieler `Hero` und `Spieler<Sitz>`, Posts, `*** HOLE CARDS ***` mit `Dealt to …`-Zeilen, alle Ereignisse in Reihenfolge (`raises <Erhöhung> to <Summe>` wie GGPoker), Board-Zeilen mit dem bisherigen Board, `*** SHOWDOWN ***` vor Shows/Collected bzw. am Ende einer fertigen Hand, `*** SUMMARY ***`, `Total pot <Summe der Einsätze minus Zurückgegebenes>`, `Board […]`. So besteht jeder Zwischenstand den Pot-Abgleich des Parsers; eine halbe Hand hat einfach keine Showdown-Zeile.
- **Hand-ID und Zeit:** `SIT` + Millisekunden beim Klick auf „Weiter“; die ID bleibt für die ganze Situation gleich, weil die Postflop-Equity mit `<Hand-ID>:<Ereignis>` geseedet wird (Live-Urteil = gespeichertes Urteil). Live wird mit der Startzeit bewertet, gespeichert mit der lokalen Zeit beim Speichern (`playedAt` „JJJJ-MM-TT hh:mm:ss“, Kopfzeile „JJJJ/MM/TT“). Je Turnierart ein festes Turnier: `SIT-normal` „Eigene Situationen“, `SIT-satellit` „Eigene Situationen (Satellit)“, `SIT-bounty` „Eigene Situationen (Bounty)“ – keine Kollision mit GGPoker-Turniernummern (nur Ziffern).
- **Live-Bewertung (Pflicht-Entscheidung):** Nach jeder Helden-Aktion wird die Hand bis einschließlich dieser Aktion erzeugt und mit `ReviewStore.rateHand` (Analyzer des Stores: Web Worker, sonst Hauptthread) bewertet; gezeigt wird das Urteil der letzten Helden-Entscheidung mit dem vorhandenen `ReviewDecisionPanel` (Preflop mit Chart, Lernsatz, Positions-Vergleich; Postflop mit Equity, nötiger Equity, Einsatz in % vom Pot, SPR, Gegner-Range und „Faustregel, kein Solver-Ergebnis“). Neu bewertet wird nur, wenn sich dieser Text ändert – Aktionen der Gegner danach kosten nichts. Ein Urteil hängt nur von den Ereignissen bis zur Entscheidung ab; ein Test prüft, dass live und in der ganzen Hand dasselbe herauskommt. Lässt sich der Text nicht lesen oder schlägt die Bewertung fehl: „Diese Situation kann ich nicht bewerten.“, die Eingabe geht weiter.
- **Speichern (Pflicht-Entscheidung):** Neue Methode `ReviewStore.saveSituation(raw, name)`: prüft den Namen (1–60 Zeichen nach Trimmen), parst den Text, prüft `SIT…`/`SIT-<art>` und läuft dann durch denselben Weg wie ein Import (`importTexts` mit einer neuen Namens-Zuordnung): Bewertung, ein Archiv-Schreiben, Einspeisung ins Nachtraining. Schon gespeichert → „Diese Situation ist schon gespeichert.“. Nur im schreibenden Tab und nicht im Nur-Lesen-Modus; sonst ist „Speichern“ gesperrt und die Oberfläche zeigt „Speichern ist hier nicht möglich: <Sperrgrund>“. Analysieren geht immer.
- **Name am Hand-Datensatz:** optionales Feld `name` (nur bei gespeicherten Situationen, 1–60 Zeichen). `readHand` lehnt einen kaputten Namen ab (wie andere kaputte Felder: als nicht lesbar gemeldet, nie gelöscht), Datensätze ohne Namen bleiben unverändert gültig und byte-gleich (`handRecordOf` schreibt das Feld nur mit Namen). Der Export trägt den Namen je Hand (`hands[].name`), `mergeExport` übernimmt ihn. Turnier-Liste und Hand-Ansicht zeigen den Namen statt „Karten · Position“ bzw. „Hand #…“.
- **Art der Situations-Turniere:** fest (`tournamentRecordOf` setzt sie aus der Turnier-ID, auch beim Zusammenführen eines Exports); die Auswahl „Art des Turniers“ entfällt dort, stattdessen „Art: Bounty (beim Nachstellen gewählt)“. Begründung: Die Art steckt in der ID; ein Wechsel würde Situationen unter dem falschen Namen führen.
- **Nachtraining:** Preflop-Fehler aus „Eigene Situationen“ (Art Normal) kommen über die vorhandene Senke (`feed` → `RetrainingSink.sync`) in die Warteschlange, Schlüssel `<SIT-ID>:<Ereignis>`. Der Hinweis am Tisch lautet dann „Aus deiner Situation vom 14.10.“. Satellit/Bounty: keine Einträge (Hinweise, keine Fehler).
- **Kein Einfluss aufs Training:** Die Situations-Analyse ruft nie den Game-Store auf; XP, Combo, Tageszähler, Streak, Rang und Trainings-Statistik bleiben unberührt. Der Spielstand ändert sich nur, wenn eine gespeicherte normale Situation einen Preflop-Fehler hat (Nachtraining).
- **GGPoker-Hinweis (Pflicht-Entscheidung):** „Nur zur Analyse nach dem Spiel – Hilfsmittel während laufender Hände sind bei GGPoker verboten.“ über dem Bildschirm, bis „Verstanden“ geklickt wird; gemerkt in `localStorage` (`poker-trainer:situation-rta-notice` = `1`), **nicht** im Spielstand. Begründung: Es ist ein Hinweis, kein Fortschritt; der Spielstand (und sein Export) bleibt dadurch ganz unverändert, es braucht kein neues Schema-Feld, und das Merken funktioniert auch im Nur-Lesen-Modus und im zweiten Tab, wo der Spielstand nicht geschrieben werden darf. Ist `localStorage` gesperrt, erscheint der Hinweis beim nächsten Öffnen wieder – nichts bricht.
- **Oberfläche:** Kachel „Situation analysieren“ (Button „Situation nachstellen“, auch im Nur-Lesen-Modus offen) und Button „Situation nachstellen“ in der Hand-Review-Übersicht. Grunddaten: eigener Stack, „Gegner-Stacks anpassen“, acht Positions-Buttons, Kartenwähler (13 Ränge × 4 Farben, am Handy je Farbe zwei Reihen à 7, belegte Karten gesperrt, Tasten mindestens 44 px), Turnierart. Danach Tisch (`TableView` + `replayTableModel`) mit „Du sitzt im CO · UTG ist dran“, Größenfeld „Raise auf (BB)“/„Bet (BB)“ mit vorgeschlagener Größe wie im Training (Open 2,2 BB, aus dem SB 3 BB, je Limper +1 BB, 3-Bet 3× bzw. aus den Blinds 4×, danach 2,2×; postflop halber Pot, Raise 3×) und „mindestens … BB“, Buttons über `ChoiceBar` (Tasten L, F, K/C, C, R, A), „← Zurück“. Am PC zweispaltig über `TrainingLayout`, am Handy untereinander. Zusammenfassung: Liste „Preflop · Raise auf 2,2 BB · Fehler“ (Klick zeigt das Urteil daneben), Name mit Vorschlag „AKo UTG · 25 BB“, „Speichern“, „Verwerfen“ (zurück zu den Grunddaten mit denselben Eingaben), nach dem Speichern „Neue Situation“ und „Im Hand-Review ansehen“. „← Menü“ fragt bei einer eingegebenen, nicht gespeicherten Situation „Situation verwerfen?“.
- **Nicht enthalten:** Löschen einzelner Situationen (gelöscht wird wie bei importierten Händen das ganze Turnier), Bearbeiten gespeicherter Situationen, andere Tischgrößen (Spec 7).
- **Bekannte Grenze:** Gerundet auf 0,1 BB und mit der Ante von 1/8 BB kann eine nachgestellte echte Hand an einer Rundungsgrenze in eine andere Stack-Stufe fallen (z. B. Push/Fold-Stufe 5 statt 6 BB). In den Beispieldaten betrifft das 4 von 476 Händen, das Urteil blieb jedes Mal gleich.

## Prüfung des Plans im Prototyp

Gemessen mit zwei Kopien des Repos außerhalb des Repo-Ordners (eine entwickelt, eine Task für Task genau aus diesem Plan angewandt; nach jedem Task `npm test`, `npm run typecheck` und `npm run check:portability` grün, Testzahlen wie in den Tasks angegeben):

- **Tests:** 731 → 793 Tests (62 neu), alle grün. Unter voller Parallel-Last scheitern vorhandene Tests (`SettingsScreen.test.tsx`) gelegentlich an der Standard-Wartezeit von `findBy…` (1 s) – das tritt auch ohne diesen Plan auf; dann den Lauf wiederholen bzw. die Datei einzeln laufen lassen. Die neuen Tests warten auf die asynchrone Bewertung mit 10 s (`SLOW`). Für jeden Task wurden nur die Test-Änderungen auf den vorherigen Stand angewandt und das erwartete Scheitern geprüft (die Angaben in Step 2 stammen aus diesem Lauf).
- **Rundlauf (Spec 6):** 400 zufällige gültige Situationen mit festem Seed, nach jedem Schritt geprüft: 5711 Zwischenstände, jedes Mal `parseHand(situationText(…)).events` gleich den Modell-Ereignissen und `walkHand(…)` gleich den Modell-Tischen (Pot, Einsätze, Stacks, Board, Folds, All-in); alle Enden kommen vor (Aktion, Board, alle gefoldet, Held gefoldet, Showdown).
- **Bewertungs-Gleichheit (Spec 6):** Alle 9 Fixture-Hände (5 bis 8 Spieler) über das Modell nachgestellt → dieselben 19 Urteile (Push/Fold, Chart, Postflop, nicht bewertet) wie beim Import. Zusätzlich im Prototyp mit den 477 echten Händen aus `samples/` (nicht im Repo): 476 lassen sich nachstellen, 472 ergeben exakt dieselben Urteile und Spots; bei 4 rutscht durch die Rundung auf 0,1 BB und die Ante von 1/8 BB die Push/Fold-Stufe um 1 BB (bzw. einmal von 21 auf 20 BB, Chart → Push/Fold) – das Urteil blieb in allen 4 Fällen gleich. Live (Hand bis zur Entscheidung) und ganze Hand liefern dieselbe Bewertung.
- **Im Browser** (gebaute App mit `vite preview`, frisches Profil, 375×812 und 1280×900): GGPoker-Hinweis erscheint und bleibt nach „Verstanden“ weg; CO mit A♠ K♥, UTG „Platz leer“ → Sitz verschwindet, Pot 2,4 BB; Raise 2,2 BB → sofort „Richtig“ mit Chart (Web Worker); BB callt, Flop Q♠ J♥ 2♣ (A♠/K♥ im Wähler gesperrt), Bet 2,9 BB → „Passt“, Equity 59 %, SPR 3,9; Zusammenfassung mit zwei Zeilen, Speichern → „Gespeichert in „Eigene Situationen““; Hand-Review zeigt das Turnier, „Art: Normal (beim Nachstellen gewählt)“, Hand „AKo CO · 25 BB“, Wiedergabe mit Namen. IndexedDB: Archiv hat `hand:SIT…` und `tournament:SIT-normal`, der Spielstand wurde nie geschrieben; `localStorage` hat nur den Hinweis-Schlüssel.
- **Größe:** Haupt-Bundle 1068 kB (unter `chunkSizeWarningLimit` 1200 kB), Worker unverändert 43 kB.

## Risiko für den echten Spielstand und das Archiv

- **Spielstand:** Kein neues Feld, keine Schema-Änderung. Die Situations-Analyse schreibt den Spielstand nie selbst; nur `RetrainingSink.sync` nach dem Speichern einer normalen Situation mit Preflop-Fehler (der Weg aus Plan 9). Der GGPoker-Hinweis liegt in `localStorage`. Ein heutiger Spielstand bleibt also byte-gleich, bis eine solche Situation gespeichert wird.
- **Archiv:** Bestehende Datensätze werden nicht angefasst: kein Migrationslauf, `readHand` akzeptiert alles, was es bisher akzeptiert hat (das neue Feld ist optional), `handRecordOf` schreibt ohne Namen dieselben Bytes wie bisher (Test). Neue Datensätze haben die Schlüssel `hand:SIT…` und `tournament:SIT-<art>`, können also mit keiner GGPoker-Hand (`TM…`) und keinem GGPoker-Turnier (nur Ziffern) kollidieren. Die geänderte Kopfzeilen-Regel lässt alle bisher lesbaren Texte gleich lesen (alle Parser-Tests bleiben grün).
- **Zurück auf eine ältere Version (main bis Plan 9):** Spielstand unverändert lesbar. Im Archiv kann die alte Version die `SIT…`-Texte nicht parsen: Das Turnier „Eigene Situationen“ erscheint in der Übersicht, beim Öffnen werden seine Hände als „Hand-Text nicht lesbar“ gemeldet (nie gelöscht, `refreshStale` überspringt Turniere mit Problemen); ein Export der alten Version lässt die Namen weg, ein Import eines neuen Exports in die alte Version überspringt die Situationen mit „Format nicht erkannt“. Alle anderen Turniere bleiben unberührt. Nach dem erneuten Update ist alles wieder da.
- **Zweiter Tab / Nur-Lesen:** Speichern läuft durch `importTexts` und damit durch `assertWritable` (Schreibsperre, Nur-Lesen, neueres Archiv); im Lese-Tab wird nur bewertet.

## Bestehende API (unverändert nutzen)

- `src/review/parse.ts`: `parseHand`, `parseHistory`, `HERO`, `HandEvent`, `ActionEvent`, `BoardStreet`, `Street`, `ParsedHand`, `HandParseError`; `src/review/hand-model.ts`: `walkHand`, `positionsOf`, `maxStreetBet`, `PlayerState`, `TableState`.
- `src/review/analysis.ts`: `analyzeHand`, `HandAnalysis`, `HeroDecision`, `ANALYSIS_VERSION`; `src/review/analyzer.ts`: `HandAnalyzer`; `src/review/summary.ts`: `decisionOutcome`; `src/review/tournament-kind.ts`: `TournamentKind`, `TOURNAMENT_KINDS`, `TOURNAMENT_KIND_LABELS`, `detectTournamentKind`, `isTournamentKind`.
- `src/review/archive.ts`: `HandRecord`, `TournamentRecord`, `readHand`, `readTournament`, `handKey`, `tournamentKey`, `memoryReviewBackend`; `src/review/import.ts`: `handRecordOf`, `tournamentRecordOf`; `src/review/export.ts`: `ArchiveExport`, `readArchivePart`, `withArchive`.
- `src/app/review-store.ts`: `createReviewStore`, intern `importTexts`, `feed`, `assertWritable`, `analyzer`; `LOCK_READ_ONLY`, `LOCK_OTHER_TAB`, `RetrainingSink`. `src/game/retraining.ts`: `retrainingOf`.
- `src/engine/cards.ts`: `Card`, `parseCard`, `cardName`, `RANKS`, `handClassOf`, `handName`; `src/engine/positions.ts`: `POSITIONS`, `POSITION_LABELS`, `Position`, `seatOf`; `src/engine/rng.ts`: `mulberry32`.
- UI: `TableView` (`PokerTable.tsx`), `replayTableModel`, `describeEvent` (`replay-model.ts`), `ChoiceBar`, `Choice` (`ActionBar.tsx`), `FilterGroup`, `TrainingLayout`, `ReviewDecisionPanel`, `PlayingCard`/`cardLabel`, `OUTCOME_LABELS` (`ReviewTournament.tsx`), `useReview`, `useReviewStore`, `renderWithStore` (`src/ui/test-utils.tsx`); `src/app/format.ts`: `formatBb`, `formatChipsBb`, `streetLabel`, `reviewActionLabel`, `retrainingHint`.

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/review/situation-tournaments.ts` | IDs und Namen der drei Situations-Turniere, feste Art |
| `src/review/parse.ts`, `archive.ts`, `export.ts`, `import.ts` | Kopfzeile mit `SIT…`, optionaler Name je Hand, Name im Export, feste Art |
| `src/situation/model.ts` | Reines Situations-Modell: Plätze, Posts, Reihenfolge, erlaubte Aktionen, Setzrunden, Board, Ende, Rückgängig |
| `src/situation/text.ts` | GGPoker-Text für jeden Zwischenstand, lokale Zeit im Format der Hand-Historie |
| `src/situation/test-situations.ts` | Test-Helfer: bekannte Situation, Fixture-Hand nachstellen |
| `src/app/review-store.ts`, `src/app/format.ts`, `src/ui/components/RetrainingHint.tsx` | `rateHand`, `saveSituation`, Namen in Export/Merge, Hinweis „Aus deiner Situation vom …“ |
| `src/ui/components/CardPicker.tsx`/`.css`, `RtaNotice.tsx`, `src/ui/situation-view.ts` | Kartenwähler, GGPoker-Hinweis, Texte und Buttons der Eingabe |
| `src/ui/useSituationRating.ts`, `src/ui/screens/SituationScreen.tsx`, `situation.css` | Bildschirm mit Grunddaten, Eingabe, Live-Bewertung, Zusammenfassung |
| `src/ui/App.tsx`, `screens/HomeScreen.tsx`, `ReviewScreen.tsx`, `ReviewOverview.tsx`, `ReviewTournament.tsx`, `ReviewHand.tsx` | Einstieg und Anzeige der Situationen im Hand-Review |

---

### Task 1: Parser kennt eigene Situationen, Name je Hand im Archiv und im Export

**Files:**
- Create: `src/review/situation-tournaments.ts`
- Modify: `src/app/review-store.ts`, `src/review/archive.test.ts`, `src/review/archive.ts`, `src/review/export.test.ts`, `src/review/export.ts`, `src/review/import.test.ts`, `src/review/import.ts`, `src/review/parse.test.ts`, `src/review/parse.ts`
- Test: `src/review/archive.test.ts`, `src/review/export.test.ts`, `src/review/import.test.ts`, `src/review/parse.test.ts`

**Interfaces:**
- Consumes: `HEADER` in `src/review/parse.ts`, `HandRecord`, `readHand`, `isString` (intern) in `src/review/archive.ts`; `ArchiveExport`, `readArchivePart` in `src/review/export.ts`; `handRecordOf`, `tournamentRecordOf`, `detectTournamentKind` in `src/review/import.ts`; `ggHand` aus `src/review/test-hands.ts` (Tests)
- Produces:
  - `src/review/situation-tournaments.ts`: `SITUATION_HAND_PREFIX = 'SIT'`, `SITUATION_TOURNAMENTS: Record<TournamentKind, { id: string; name: string }>` (`SIT-normal` „Eigene Situationen“, `SIT-satellit` „Eigene Situationen (Satellit)“, `SIT-bounty` „Eigene Situationen (Bounty)“), `situationKindOf(tournamentId: string): TournamentKind | null`, `isSituationTournament(tournamentId: string): boolean`
  - `parseHand` liest Hand-IDs `SIT<Ziffern>` und Turniere `SIT-<kleinbuchstaben>`
  - `src/review/archive.ts`: `MAX_HAND_NAME = 60`, `isHandName(v: unknown): v is string`, `HandRecord.name?: string` (von `readHand` geprüft)
  - `src/review/export.ts`: `ArchiveExport.hands[].name?: string` (von `readArchivePart` geprüft)
  - `src/review/import.ts`: `handRecordOf(analyzed: AnalyzedHand, name?: string): HandRecord` (Feld nur mit Namen), `tournamentRecordOf` hält die Art der `SIT-…`-Turniere fest

- [ ] **Step 1: Failing Tests schreiben**

In `src/review/archive.test.ts` ersetzen:
```ts
  loadHands,
  memoryReviewBackend,
  readHand,
  readTournament,
```
durch:
```ts
  loadHands,
  memoryReviewBackend,
  MAX_HAND_NAME,
  readHand,
  readTournament,
```

An das Ende von `src/review/archive.test.ts` anfügen (nach einer Leerzeile):
```ts
describe('names of saved situations (Plan 10)', () => {
  it('reads a hand record with a name and every record without one', () => {
    const named = { ...handRecord, name: 'AKo UTG · 25 BB' };
    expect(readHand(JSON.stringify(named))).toEqual(named);
    expect('name' in readHand(JSON.stringify(handRecord))).toBe(false);
  });

  it('rejects an empty, too long or non-text name', () => {
    for (const name of ['', '   ', 'x'.repeat(MAX_HAND_NAME + 1), 7, null]) {
      expect(() => readHand(JSON.stringify({ ...handRecord, name }))).toThrow('Archiv-Eintrag nicht lesbar: Name');
    }
    expect(readHand(JSON.stringify({ ...handRecord, name: 'x'.repeat(MAX_HAND_NAME) })).name).toHaveLength(MAX_HAND_NAME);
  });
});
```

In `src/review/export.test.ts` ersetzen:
```ts
import { TODAY_SAVE } from '../storage/test-saves';
import { type ArchiveExport, EXPORT_KEY, readArchivePart, withArchive } from './export';

const part: ArchiveExport = {
```
durch:
```ts
import { TODAY_SAVE } from '../storage/test-saves';
import { type ArchiveExport, EXPORT_KEY, readArchivePart, withArchive } from './export';
import { SITUATION_TOURNAMENTS } from './situation-tournaments';

const part: ArchiveExport = {
```

An das Ende von `src/review/export.test.ts` anfügen (nach einer Leerzeile):
```ts
describe('names of saved situations in the export (Plan 10)', () => {
  const id = SITUATION_TOURNAMENTS.normal.id;
  const named: ArchiveExport = {
    reviewSchemaVersion: 1,
    tournaments: [{ id, name: SITUATION_TOURNAMENTS.normal.name, kind: 'normal' }],
    hands: [{ id: 'SIT1', tournamentId: id, raw: 'Poker Hand #SIT1: …', name: 'AKo UTG · 25 BB' }],
  };

  it('carries the name of a hand', () => {
    expect(readArchivePart(withArchive(TODAY_SAVE, named))).toEqual(named);
  });

  it('rejects a broken name', () => {
    const broken = { ...named, hands: [{ ...named.hands[0], name: 7 }] } as unknown as ArchiveExport;
    expect(() => readArchivePart(withArchive(TODAY_SAVE, broken))).toThrow('Hand-Archiv in der Datei ist nicht lesbar');
  });
});
```

In `src/review/import.test.ts` ersetzen:
```ts
} from './import';
import { parseHand } from './parse';

const file = (name: string, text: string) => ({ name, bytes: strToU8(text) });
```
durch:
```ts
} from './import';
import { parseHand } from './parse';
import { SITUATION_TOURNAMENTS, isSituationTournament, situationKindOf } from './situation-tournaments';

const file = (name: string, text: string) => ({ name, bytes: strToU8(text) });
```

An das Ende von `src/review/import.test.ts` anfügen (nach einer Leerzeile):
```ts
describe('records of saved situations (Plan 10)', () => {
  const hand = parseHand(bounty);
  const analysis = { version: ANALYSIS_VERSION, decisions: [] };

  it('stores a name only when one is given', () => {
    expect('name' in handRecordOf({ hand, analysis })).toBe(false);
    expect(handRecordOf({ hand, analysis }, 'AKo UTG · 25 BB').name).toBe('AKo UTG · 25 BB');
  });

  it('knows the three situation tournaments and keeps their kind fixed', () => {
    expect(situationKindOf('SIT-satellit')).toBe('satellit');
    expect(situationKindOf('318083464')).toBeNull();
    expect(isSituationTournament(SITUATION_TOURNAMENTS.bounty.id)).toBe(true);
    const records = [handRecordOf({ hand, analysis })];
    const { id, name } = SITUATION_TOURNAMENTS.satellit;
    const fresh = tournamentRecordOf(id, name, records, null);
    expect(fresh).toMatchObject({ name: 'Eigene Situationen (Satellit)', detectedKind: 'satellit', kind: 'satellit' });
    expect(tournamentRecordOf(id, name, records, { ...fresh, kind: 'normal' }, 'bounty').kind).toBe('satellit');
  });
});
```

In `src/review/parse.test.ts` ersetzen:
```ts
import steps from './fixtures/step-satellites.txt?raw';
import { HERO, type HandEvent, type ParsedHand, parseHand, parseHistory, splitHands } from './parse';

const cards = (text: string) => text.split(' ').map(parseCard);
```
durch:
```ts
import steps from './fixtures/step-satellites.txt?raw';
import { HERO, type HandEvent, type ParsedHand, parseHand, parseHistory, splitHands } from './parse';
import { ggHand } from './test-hands';

const cards = (text: string) => text.split(' ').map(parseCard);
```

An das Ende von `src/review/parse.test.ts` anfügen (nach einer Leerzeile):
```ts
describe('hands of saved situations (Plan 10)', () => {
  const situation = (id: string, tournamentId: string) =>
    ggHand({ id, tournamentId, tournamentName: 'Eigene Situationen (Bounty)', hero: 'BTN', bigBlind: 800, ante: 100, lines: ['Hero: folds'] });

  it('reads SIT hand ids and the SIT tournaments', () => {
    const hand = parseHand(situation('SIT1760421600000', 'SIT-bounty'));
    expect(hand).toMatchObject({ id: 'SIT1760421600000', tournamentId: 'SIT-bounty', tournamentName: 'Eigene Situationen (Bounty)' });
  });

  it('still rejects other ids', () => {
    expect(parseHistory(situation('XY1', '1')).skipped).toEqual([{ id: 'XY1', reason: 'Format nicht erkannt' }]);
    expect(parseHistory(situation('SIT1', 'SIT-1')).skipped).toEqual([{ id: 'SIT1', reason: 'Format nicht erkannt' }]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/review/archive.test.ts src/review/export.test.ts src/review/import.test.ts src/review/parse.test.ts` → Expected: FAIL – „4 failed (4)“, „2 failed | 32 passed (34)“: `export.test.ts` und `import.test.ts` laden nicht (`Cannot find module './situation-tournaments'`), in `parse.test.ts` scheitert „reads SIT hand ids …“, in `archive.test.ts` „rejects an empty, too long or non-text name“.

- [ ] **Step 3: Umsetzen**

In `src/app/review-store.ts` ersetzen:
```ts
      const failures: string[] = [];
      for (const [id, items] of analyzed) {
        const added = items.map(handRecordOf);
        try {
          // Load, merge and write in one serial step, so a background re-rating never interleaves with it.
```
durch:
```ts
      const failures: string[] = [];
      for (const [id, items] of analyzed) {
        const added = items.map((item) => handRecordOf(item));
        try {
          // Load, merge and write in one serial step, so a background re-rating never interleaves with it.
```

In `src/review/archive.ts` ersetzen:
```ts
export const TOURNAMENT_PREFIX = 'tournament:';
export const HAND_PREFIX = 'hand:';

export type TournamentRecord = {
```
durch:
```ts
export const TOURNAMENT_PREFIX = 'tournament:';
export const HAND_PREFIX = 'hand:';
/** Longest name of a saved situation (optional field of a hand record). */
export const MAX_HAND_NAME = 60;

export type TournamentRecord = {
```

In `src/review/archive.ts` ersetzen:
```ts
  analysisVersion: number;
  analysis: HandAnalysis;
};
```
durch:
```ts
  analysisVersion: number;
  analysis: HandAnalysis;
  /** Only saved situations have a name; imported hands never carry the field. */
  name?: string;
};
```

In `src/review/archive.ts` ersetzen:
```ts
}

/** Raw text and ids must be intact; a broken analysis is not fatal, it is computed again. */
export function readHand(text: string): HandRecord {
  const r = parseRecord(text);
  if (!isString(r.id) || !isString(r.tournamentId) || !isString(r.raw) || !isString(r.playedAt) || !isString(r.dateKey)) corrupt('Hand');
  return r as unknown as HandRecord;
}
```
durch:
```ts
}

export const isHandName = (v: unknown): v is string => isString(v) && v.trim().length > 0 && v.length <= MAX_HAND_NAME;

/** Raw text and ids must be intact; a broken analysis is not fatal, it is computed again. */
export function readHand(text: string): HandRecord {
  const r = parseRecord(text);
  if (!isString(r.id) || !isString(r.tournamentId) || !isString(r.raw) || !isString(r.playedAt) || !isString(r.dateKey)) corrupt('Hand');
  if (r.name !== undefined && !isHandName(r.name)) corrupt('Name');
  return r as unknown as HandRecord;
}
```

In `src/review/export.ts` ersetzen:
```ts
import { REVIEW_SCHEMA_VERSION } from './archive';
import { type TournamentKind, isTournamentKind } from './tournament-kind';
```
durch:
```ts
import { REVIEW_SCHEMA_VERSION, isHandName } from './archive';
import { type TournamentKind, isTournamentKind } from './tournament-kind';
```

In `src/review/export.ts` ersetzen:
```ts
  reviewSchemaVersion: 1;
  tournaments: { id: string; name: string; kind: TournamentKind }[];
  hands: { id: string; tournamentId: string; raw: string }[];
};
```
durch:
```ts
  reviewSchemaVersion: 1;
  tournaments: { id: string; name: string; kind: TournamentKind }[];
  /** `name` only for saved situations; exports before Plan 10 never have it. */
  hands: { id: string; tournamentId: string; raw: string; name?: string }[];
};
```

In `src/review/export.ts` ersetzen:
```ts
    return unreadable();
  }
  if (!Array.isArray(hands) || !hands.every((h) => isObject(h) && isString(h.id) && isString(h.tournamentId) && isString(h.raw))) {
    return unreadable();
  }
```
durch:
```ts
    return unreadable();
  }
  const isHand = (h: unknown) =>
    isObject(h) && isString(h.id) && isString(h.tournamentId) && isString(h.raw) && (h.name === undefined || isHandName(h.name));
  if (!Array.isArray(hands) || !hands.every(isHand)) {
    return unreadable();
  }
```

In `src/review/import.ts` ersetzen:
```ts
import { ArchiveFormatError, type HandRecord, REVIEW_SCHEMA_VERSION, type TournamentRecord } from './archive';
import { type ParsedHand, type SkippedHand, parseHistory } from './parse';
import { summarize } from './summary';
import { type TournamentKind, detectTournamentKind } from './tournament-kind';
```
durch:
```ts
import { ArchiveFormatError, type HandRecord, REVIEW_SCHEMA_VERSION, type TournamentRecord } from './archive';
import { type ParsedHand, type SkippedHand, parseHistory } from './parse';
import { situationKindOf } from './situation-tournaments';
import { summarize } from './summary';
import { type TournamentKind, detectTournamentKind } from './tournament-kind';
```

In `src/review/import.ts` ersetzen:
```ts
}

export function handRecordOf({ hand, analysis }: AnalyzedHand): HandRecord {
  return {
    reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
```
durch:
```ts
}

/** `name` only for saved situations; imported hands get no name field, so their records stay as before. */
export function handRecordOf({ hand, analysis }: AnalyzedHand, name?: string): HandRecord {
  return {
    reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
```

In `src/review/import.ts` ersetzen:
```ts
    analysisVersion: analysis.version,
    analysis,
  };
}
```
durch:
```ts
    analysisVersion: analysis.version,
    analysis,
    ...(name === undefined ? {} : { name }),
  };
}
```

In `src/review/import.ts` ersetzen:
```ts
}

/** Builds the tournament record from all its hands (old and new), keeping a kind the player chose and every previous hand id. */
export function tournamentRecordOf(
  id: string,
```
durch:
```ts
}

/**
 * Builds the tournament record from all its hands (old and new), keeping a kind the player chose and every previous
 * hand id. The tournaments of saved situations always keep their fixed kind.
 */
export function tournamentRecordOf(
  id: string,
```

In `src/review/import.ts` ersetzen:
```ts
): TournamentRecord {
  const sorted = [...hands].sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id));
  const detectedKind = previous?.detectedKind ?? detectTournamentKind(name);
  const kind = kindOverride ?? previous?.kind ?? detectedKind;
  const handIds = mergeHandIds(sorted.map((h) => h.id), previous?.handIds ?? []);
  const analysisVersion = sorted.length === 0 ? ANALYSIS_VERSION : Math.min(...sorted.map((h) => h.analysisVersion));
```
durch:
```ts
): TournamentRecord {
  const sorted = [...hands].sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id));
  const fixed = situationKindOf(id);
  const detectedKind = fixed ?? previous?.detectedKind ?? detectTournamentKind(name);
  const kind = fixed ?? kindOverride ?? previous?.kind ?? detectedKind;
  const handIds = mergeHandIds(sorted.map((h) => h.id), previous?.handIds ?? []);
  const analysisVersion = sorted.length === 0 ? ANALYSIS_VERSION : Math.min(...sorted.map((h) => h.analysisVersion));
```

In `src/review/parse.ts` ersetzen:
```ts
}

const HEADER =
  /^Poker Hand #(TM\d+): Tournament #(\d+), (.+) Hold'em No Limit - Level(\d+)\(([\d,]+)\/([\d,]+)(?:\(([\d,]+)\))?\) - (\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})$/;
const TABLE = /^Table '(.+)' (\d+)-max Seat #(\d+) is the button$/;
const SEAT = /^Seat (\d+): (\S+) \(([\d,]+) in chips\)$/;
```
durch:
```ts
}

// Hand ids: "TM…" from GGPoker, "SIT…" for situations entered in the app; their tournaments are "SIT-<kind>".
const HEADER =
  /^Poker Hand #((?:TM|SIT)\d+): Tournament #(\d+|SIT-[a-z]+), (.+) Hold'em No Limit - Level(\d+)\(([\d,]+)\/([\d,]+)(?:\(([\d,]+)\))?\) - (\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}:\d{2})$/;
const TABLE = /^Table '(.+)' (\d+)-max Seat #(\d+) is the button$/;
const SEAT = /^Seat (\d+): (\S+) \(([\d,]+) in chips\)$/;
```

`src/review/situation-tournaments.ts` anlegen:
```ts
import type { TournamentKind } from './tournament-kind';

/** Hand ids of situations entered by the player start with this; GGPoker hands start with "TM". */
export const SITUATION_HAND_PREFIX = 'SIT';

/**
 * Spec 5 of the situation analysis: saved situations live in the hand archive as one "tournament" per kind.
 * The ids cannot clash with GGPoker tournament numbers (digits only); the kind of these tournaments is fixed.
 */
export const SITUATION_TOURNAMENTS: Record<TournamentKind, { id: string; name: string }> = {
  normal: { id: 'SIT-normal', name: 'Eigene Situationen' },
  satellit: { id: 'SIT-satellit', name: 'Eigene Situationen (Satellit)' },
  bounty: { id: 'SIT-bounty', name: 'Eigene Situationen (Bounty)' },
};

/** The fixed kind of a situation tournament; null for imported tournaments. */
export function situationKindOf(tournamentId: string): TournamentKind | null {
  for (const kind of Object.keys(SITUATION_TOURNAMENTS) as TournamentKind[]) {
    if (SITUATION_TOURNAMENTS[kind].id === tournamentId) return kind;
  }
  return null;
}

export const isSituationTournament = (tournamentId: string): boolean => situationKindOf(tournamentId) !== null;
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/review/archive.test.ts src/review/export.test.ts src/review/import.test.ts src/review/parse.test.ts` → Expected: PASS (4 Dateien, 60 Tests)

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → Expected: alle PASS (739 Tests). Run: `npm run typecheck` → Expected: Exit 0. Run: `npm run check:portability` → Expected: `check-portability: clean`.

```bash
git add src/app/review-store.ts src/review/archive.test.ts src/review/archive.ts src/review/export.test.ts src/review/export.ts src/review/import.test.ts src/review/import.ts src/review/parse.test.ts src/review/parse.ts src/review/situation-tournaments.ts
git commit -m "feat(review): Parser liest eigene Situationen (SIT…), Name je Hand im Archiv und im Export, feste Art der Situations-Turniere" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Situations-Modell: Plätze, Posts, Reihenfolge, erlaubte Aktionen, Setzrunden, All-in, Rückgängig

Das Herz des Moduls: eine reine Klasse `Table` spielt die Schritte ab und hält dabei exakt die Zahlen, die `walkHand` aus dem erzeugten Text berechnen wird (gleiche `PlayerState`-Felder, Snapshot nach jedem Ereignis). Die Öffnungsgrößen des Trainings werden aus `spots.ts` exportiert statt kopiert.

**Files:**
- Create: `src/situation/model.test.ts`, `src/situation/model.ts`
- Modify: `src/engine/preflop/spots.ts`
- Test: `src/situation/model.test.ts`

**Interfaces:**
- Consumes: `POSITIONS`, `Position`, `seatOf` aus `src/engine/positions.ts`; `PlayerState`, `TableState` aus `src/review/hand-model.ts`; `HERO`, `HandEvent`, `ActionEvent`, `BoardStreet`, `Street` aus `src/review/parse.ts`; `SITUATION_HAND_PREFIX` (Task 1); `TournamentKind`, `isTournamentKind`
- Produces:
  - `src/engine/preflop/spots.ts`: `export const OPEN_RAISE = 2.2`, `SB_OPEN_RAISE = 3`, `THREE_BET_IP = 3`, `THREE_BET_BLINDS = 4`, `FOUR_BET = 2.2` (bisher intern)
  - `src/situation/model.ts`: `CHIPS_PER_BB = 800`, `SMALL_BLIND_CHIPS = 400`, `ANTE_CHIPS = 100`, `MIN_STACK_BB = 1`, `MAX_STACK_BB = 200`, `CHIPS_PER_STEP = 80`, `LAST_EMPTY_SEAT`, `bbToChips(bb: number): number`, `chipsToBb(chips: number): number`, `isStackBb(bb: number): boolean`
  - `type SituationSetup = { handId: string; kind: TournamentKind; hero: Position; heroCards: readonly [Card, Card]; stacks: Readonly<Record<Position, number>> }`
  - `type SituationStep = { type: 'empty' | 'fold' | 'check' | 'call' } | { type: 'bet' | 'raise'; to: number } | { type: 'board'; cards: readonly Card[] } | { type: 'show'; position: Position; cards: readonly [Card, Card] } | { type: 'end' }`, `type Situation = { setup: SituationSetup; steps: readonly SituationStep[] }`
  - `type BetRange = { min: number; max: number }`, `type LegalActions = { position; isHero; fold; check; call: { amount; allIn } | null; bet: BetRange | null; raise: BetRange | null; empty: boolean; suggested: number | null }`
  - `type Phase = { type: 'act'; legal: LegalActions } | { type: 'board'; street: BoardStreet; count: 1 | 3; optional: boolean } | { type: 'done'; reason: 'folded' | 'heroFolded' | 'showdown' }`
  - `type SituationState = { setup; phase: Phase; seated: Position[]; events: HandEvent[]; states: TableState[]; table: TableState; heroEvents: number[]; showable: Position[]; usedCards: Card[] }`
  - `class IllegalStepError`, `playerName(setup, position): string`, `playSituation(situation: Situation): SituationState`, `addStep(situation: Situation, step: SituationStep): Situation`, `undoStep(situation: Situation): Situation`, `upToLastHeroAction(situation: Situation): Situation | null`

- [ ] **Step 1: Failing Tests schreiben**

`src/situation/model.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { parseCard } from '../engine/cards';
import { POSITIONS, type Position } from '../engine/positions';
import {
  IllegalStepError,
  type LegalActions,
  type Situation,
  type SituationSetup,
  type SituationState,
  type SituationStep,
  addStep,
  bbToChips,
  isStackBb,
  playSituation,
  undoStep,
  upToLastHeroAction,
} from './model';

const cards = (text: string) => text.split(' ').map(parseCard);
const stacks = (bb: number, over: Partial<Record<Position, number>> = {}) =>
  ({ ...Object.fromEntries(POSITIONS.map((p) => [p, bb])), ...over }) as Record<Position, number>;
const setupOf = (over: Partial<SituationSetup> = {}): SituationSetup => ({
  handId: 'SIT1',
  kind: 'normal',
  hero: 'CO',
  heroCards: [parseCard('Ah'), parseCard('Kd')],
  stacks: stacks(25),
  ...over,
});
const sit = (setup: SituationSetup, ...steps: SituationStep[]): Situation => ({ setup, steps });
const play = (setup: SituationSetup, ...steps: SituationStep[]) => playSituation(sit(setup, ...steps));
const legalOf = (state: SituationState): LegalActions => {
  if (state.phase.type !== 'act') throw new Error(`phase ${state.phase.type}`);
  return state.phase.legal;
};
const FOLD: SituationStep = { type: 'fold' };
const CALL: SituationStep = { type: 'call' };
const CHECK: SituationStep = { type: 'check' };
const raise = (bb: number): SituationStep => ({ type: 'raise', to: bbToChips(bb) });
const bet = (bb: number): SituationStep => ({ type: 'bet', to: bbToChips(bb) });
const board = (text: string): SituationStep => ({ type: 'board', cards: cards(text) });
const folds = (n: number) => Array.from({ length: n }, () => FOLD);

describe('situation model: seats, posts and order', () => {
  it('posts the ante for every seated player and the blinds, then UTG acts first', () => {
    const state = play(setupOf());
    expect(state.events.filter((e) => e.type === 'ante')).toHaveLength(8);
    expect(state.events.slice(-2)).toEqual([
      { type: 'smallBlind', player: 'Spieler7', amount: 400, allIn: false },
      { type: 'bigBlind', player: 'Spieler8', amount: 800, allIn: false },
    ]);
    expect(state.table.pot).toBe(2000);
    expect(legalOf(state)).toEqual({
      position: 'UTG',
      isHero: false,
      fold: true,
      check: false,
      call: { amount: 800, allIn: false },
      bet: null,
      raise: { min: 1600, max: 19900 },
      empty: true,
      suggested: 1760,
    });
  });

  it('lets only the first seats before the hero stay empty, up to the cutoff', () => {
    const empty: SituationStep = { type: 'empty' };
    const state = play(setupOf(), empty, empty);
    expect(state.seated).toEqual(['LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
    expect(state.table.pot).toBe(600 + 1200);
    expect(legalOf(state)).toMatchObject({ position: 'LJ', empty: true });
    expect(legalOf(play(setupOf(), empty, empty, FOLD))).toMatchObject({ position: 'HJ', empty: false });
    expect(() => addStep(sit(setupOf(), FOLD), empty)).toThrow(IllegalStepError);
    expect(legalOf(play(setupOf({ hero: 'UTG1' }), empty))).toMatchObject({ position: 'UTG1', isHero: true, empty: false });
    const btn = play(setupOf({ hero: 'BTN' }), ...Array.from({ length: 5 }, () => empty));
    expect(btn.seated).toEqual(['BTN', 'SB', 'BB']);
    expect(legalOf(btn)).toMatchObject({ position: 'BTN', empty: false });
  });

  it('closes the preflop round only when every bet is matched and keeps the option of the big blind', () => {
    const open = play(setupOf(), ...folds(4), raise(2.2), FOLD, FOLD);
    expect(legalOf(open)).toMatchObject({ position: 'BB', call: { amount: 960, allIn: false } });
    expect(play(setupOf(), ...folds(4), raise(2.2), FOLD, FOLD, CALL).phase).toEqual({ type: 'board', street: 'flop', count: 3, optional: false });
    const limp = play(setupOf({ hero: 'BB' }), ...folds(6), CALL);
    expect(legalOf(limp)).toMatchObject({ position: 'BB', isHero: true, check: true, fold: false, call: null, raise: { min: 1600, max: 19900 } });
    expect(play(setupOf({ hero: 'BB' }), ...folds(6), CALL, CHECK).phase).toMatchObject({ type: 'board', street: 'flop' });
  });

  it('acts postflop from the small blind on and lets the button act last', () => {
    const flop = play(setupOf({ hero: 'BTN' }), ...folds(5), CALL, CALL, CHECK, board('2c 7d 9h'));
    expect(legalOf(flop)).toMatchObject({ position: 'SB', check: true, bet: { min: 800, max: 19100 }, raise: null, suggested: 1600 });
    const afterChecks = play(setupOf({ hero: 'BTN' }), ...folds(5), CALL, CALL, CHECK, board('2c 7d 9h'), CHECK, CHECK);
    expect(legalOf(afterChecks)).toMatchObject({ position: 'BTN', isHero: true });
    expect(play(setupOf({ hero: 'BTN' }), ...folds(5), CALL, CALL, CHECK, board('2c 7d 9h'), CHECK, CHECK, CHECK).phase).toEqual({
      type: 'board',
      street: 'turn',
      count: 1,
      optional: false,
    });
  });

  it('ends the input when the hero folds, without inventing the rest of the hand', () => {
    const state = play(setupOf({ hero: 'UTG' }), FOLD);
    expect(state.phase).toEqual({ type: 'done', reason: 'heroFolded' });
    expect(state.events.at(-1)).toMatchObject({ type: 'action', player: 'Hero', action: 'fold' });
    expect(() => addStep(sit(setupOf({ hero: 'UTG' }), FOLD), FOLD)).toThrow(IllegalStepError);
  });
});

describe('situation model: legal actions and sizes', () => {
  it('never allows a call without a bet, a check against a bet or a raise below the minimum', () => {
    const start = sit(setupOf());
    expect(() => addStep(start, CHECK)).toThrow('Check gegen einen Einsatz ist nicht möglich');
    expect(() => addStep(start, raise(1.9))).toThrow('Einsatz unter dem Minimum');
    expect(() => addStep(start, bet(3))).toThrow('Bet ist hier nicht möglich');
    const flop = sit(setupOf({ hero: 'BTN' }), ...folds(5), CALL, CALL, CHECK, board('2c 7d 9h'));
    expect(() => addStep(flop, CALL)).toThrow('Kein Einsatz zum Callen');
    expect(() => addStep(flop, FOLD)).toThrow('Fold ist hier nicht möglich');
  });

  it('asks for the previous bet plus the last raise, at least 1 BB', () => {
    expect(legalOf(play(setupOf(), raise(2.2))).raise).toEqual({ min: 2720, max: 19900 });
    expect(() => addStep(sit(setupOf(), raise(2.2)), raise(3.3))).toThrow('Einsatz unter dem Minimum');
    expect(legalOf(play(setupOf(), raise(2.2), raise(3.4))).raise).toEqual({ min: 3680, max: 19900 });
    const flopBet = play(setupOf({ hero: 'BTN' }), ...folds(5), CALL, CALL, CHECK, board('2c 7d 9h'), bet(1.5));
    expect(legalOf(flopBet).raise).toEqual({ min: 2400, max: 19100 });
  });

  it('turns a size above the stack into the all-in and gives the unmatched part back', () => {
    const state = play(setupOf({ hero: 'BB' }), { type: 'raise', to: 999_999 }, ...folds(7));
    expect(state.events.find((e) => e.type === 'action' && e.action === 'raise')).toEqual({
      type: 'action',
      street: 'preflop',
      player: 'Spieler1',
      action: 'raise',
      amount: 19900,
      to: 19900,
      allIn: true,
    });
    expect(state.events.slice(-2)).toEqual([
      { type: 'uncalled', player: 'Spieler1', amount: 19100 },
      { type: 'collect', player: 'Spieler1', amount: 2800 },
    ]);
    expect(state.phase).toEqual({ type: 'done', reason: 'folded' });
  });

  it('lets an all-in below a full raise reopen nothing for a player who already acted', () => {
    const short = setupOf({ stacks: stacks(25, { BTN: 3 }) });
    const state = play(short, ...folds(4), raise(2), { type: 'raise', to: 999_999 }, FOLD, FOLD);
    expect(state.table.players.find((p) => p.position === 'BTN')).toMatchObject({ streetBet: 2300, allIn: true });
    expect(legalOf(state)).toMatchObject({ position: 'CO', isHero: true, call: { amount: 700, allIn: false }, raise: null });
  });

  it('posts a short blind all-in', () => {
    const state = play(setupOf({ stacks: stacks(25, { BB: 1 }) }));
    expect(state.events.find((e) => e.type === 'bigBlind')).toEqual({ type: 'bigBlind', player: 'Spieler8', amount: 700, allIn: true });
    expect(legalOf(state).call).toEqual({ amount: 700, allIn: false });
  });

  it('suggests the usual sizes', () => {
    const suggested = (...steps: SituationStep[]) => legalOf(play(setupOf({ hero: 'BB' }), ...steps)).suggested;
    expect(suggested()).toBe(1760);
    expect(suggested(CALL)).toBe(bbToChips(3.2));
    expect(suggested(...folds(6))).toBe(bbToChips(3));
    expect(suggested(raise(2.2))).toBe(bbToChips(6.6));
    expect(suggested(raise(2.2), ...folds(6))).toBe(bbToChips(8.8));
    expect(suggested(raise(2.2), raise(6.6))).toBe(bbToChips(14.5));
    // Same stack as the all-in: only a call is left.
    expect(suggested({ type: 'raise', to: 999_999 })).toBeNull();
    expect(legalOf(play(setupOf({ hero: 'BB' }), { type: 'raise', to: 999_999 })).call).toEqual({ amount: 19900, allIn: true });
  });

  it('accepts stacks of 1 to 200 BB in steps of 0.1', () => {
    expect([1, 25.5, 200].every(isStackBb)).toBe(true);
    expect([0.9, 200.1, 25.55, Number.NaN].some(isStackBb)).toBe(false);
    expect(() => play(setupOf({ stacks: stacks(25, { SB: 0.5 }) }))).toThrow('Stack SB ungültig');
  });
});

describe('situation model: board, all-in, end and undo', () => {
  const shove = sit(setupOf({ hero: 'BB' }), { type: 'raise', to: 999_999 }, ...folds(6), CALL);

  it('makes the rest of the board optional when everybody is all-in', () => {
    const state = playSituation(shove);
    expect(state.phase).toEqual({ type: 'board', street: 'flop', count: 3, optional: true });
    expect(playSituation(addStep(shove, { type: 'end' })).phase).toEqual({ type: 'done', reason: 'showdown' });
    const runout = [board('2c 7d 9h'), board('Js'), board('3s')].reduce(addStep, shove);
    expect(playSituation(runout).phase).toEqual({ type: 'done', reason: 'showdown' });
    expect(playSituation(runout).table.board).toEqual(cards('2c 7d 9h Js 3s'));
    expect(() => addStep(sit(setupOf()), { type: 'end' })).toThrow('Die Hand ist noch nicht vorbei');
  });

  it('takes only unused board cards, as many as the street needs', () => {
    expect(() => addStep(shove, board('Ah 7d 9h'))).toThrow('Board-Karten ungültig');
    expect(() => addStep(shove, board('2c 7d'))).toThrow('Board-Karten ungültig');
    expect(() => addStep(shove, board('2c 2c 9h'))).toThrow('Board-Karten ungültig');
    expect(playSituation(addStep(shove, board('2c 7d 9h'))).usedCards).toEqual(cards('Ah Kd 2c 7d 9h'));
  });

  it('takes the cards of the opponents at the showdown, once each', () => {
    const ended = addStep(shove, { type: 'end' });
    expect(playSituation(ended).showable).toEqual(['UTG']);
    const shown = addStep(ended, { type: 'show', position: 'UTG', cards: [parseCard('Qs'), parseCard('Qh')] });
    expect(playSituation(shown).showable).toEqual([]);
    expect(playSituation(shown).events.at(-1)).toEqual({ type: 'show', player: 'Spieler1', cards: cards('Qs Qh') });
    expect(() => addStep(shown, { type: 'show', position: 'UTG', cards: [parseCard('2s'), parseCard('2h')] })).toThrow(IllegalStepError);
    expect(() => addStep(ended, { type: 'show', position: 'UTG', cards: [parseCard('Ah'), parseCard('2h')] })).toThrow('Karten ungültig');
    expect(() => addStep(shove, { type: 'show', position: 'UTG', cards: [parseCard('Qs'), parseCard('Qh')] })).toThrow(IllegalStepError);
  });

  it('takes back the last step and cuts the hand after the last hero action', () => {
    const steps: SituationStep[] = [...folds(4), raise(2.2), FOLD, FOLD, CALL];
    const full = sit(setupOf(), ...steps);
    expect(undoStep(full).steps).toEqual(steps.slice(0, -1));
    expect(upToLastHeroAction(full)!.steps).toEqual(steps.slice(0, 5));
    expect(upToLastHeroAction(sit(setupOf(), ...folds(4)))).toBeNull();
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/situation/model.test.ts` → Expected: FAIL – `Cannot find module './model'` („1 failed (1)“, no tests).

- [ ] **Step 3: Umsetzen**

In `src/engine/preflop/spots.ts` ersetzen:
```ts
export type ChartKey = string;

const OPEN_RAISE = 2.2;
const SB_OPEN_RAISE = 3;
const THREE_BET_IP = 3;
const THREE_BET_BLINDS = 4;
const FOUR_BET = 2.2;
const SB = seatOf('SB');
const BB = seatOf('BB');
```
durch:
```ts
export type ChartKey = string;

/** Sizes in BB (raise "to" totals); the situation analysis suggests the same sizes. */
export const OPEN_RAISE = 2.2;
export const SB_OPEN_RAISE = 3;
export const THREE_BET_IP = 3;
export const THREE_BET_BLINDS = 4;
export const FOUR_BET = 2.2;
const SB = seatOf('SB');
const BB = seatOf('BB');
```

`src/situation/model.ts` anlegen:
```ts
import type { Card } from '../engine/cards';
import { POSITIONS, type Position, seatOf } from '../engine/positions';
import { FOUR_BET, OPEN_RAISE, SB_OPEN_RAISE, THREE_BET_BLINDS, THREE_BET_IP } from '../engine/preflop/spots';
import type { PlayerState, TableState } from '../review/hand-model';
import { type ActionEvent, type BoardStreet, HERO, type HandEvent, type Street } from '../review/parse';
import { SITUATION_HAND_PREFIX } from '../review/situation-tournaments';
import { type TournamentKind, isTournamentKind } from '../review/tournament-kind';

/** Spec 4: the generated hand uses 800 chips per BB (small blind 400, ante 100 per seated player). */
export const CHIPS_PER_BB = 800;
export const SMALL_BLIND_CHIPS = 400;
export const ANTE_CHIPS = 100;
export const MIN_STACK_BB = 1;
export const MAX_STACK_BB = 200;
/** Bet sizes and stacks are entered in steps of 0.1 BB = 80 chips. */
export const CHIPS_PER_STEP = CHIPS_PER_BB / 10;
/** The last seat that may stay empty: BTN, SB and BB always play (no dead button, no missing blind). */
export const LAST_EMPTY_SEAT = seatOf('CO');

export const bbToChips = (bb: number): number => Math.round(bb * 10) * CHIPS_PER_STEP;
export const chipsToBb = (chips: number): number => chips / CHIPS_PER_BB;
export const isStackBb = (bb: number): boolean =>
  Number.isFinite(bb) && bb >= MIN_STACK_BB && bb <= MAX_STACK_BB && Math.abs(bb * 10 - Math.round(bb * 10)) < 1e-9;

export type SituationSetup = {
  /** "SIT" + digits; stays the same for the whole situation (the postflop equities are seeded with it). */
  handId: string;
  kind: TournamentKind;
  hero: Position;
  heroCards: readonly [Card, Card];
  /** Chips at the start of the hand (before the ante) per position, in BB: 1–200 in steps of 0.1. */
  stacks: Readonly<Record<Position, number>>;
};

/** `to` is the street total of a bet or raise in chips; anything at or above the stack is the all-in. */
export type SituationStep =
  | { type: 'empty' }
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; to: number }
  | { type: 'raise'; to: number }
  | { type: 'board'; cards: readonly Card[] }
  | { type: 'show'; position: Position; cards: readonly [Card, Card] }
  | { type: 'end' };

export type Situation = { setup: SituationSetup; steps: readonly SituationStep[] };

/** Street totals in chips; `max` is the all-in. */
export type BetRange = { min: number; max: number };

export type LegalActions = {
  position: Position;
  isHero: boolean;
  fold: boolean;
  check: boolean;
  /** What a call adds; null without a bet to call. */
  call: { amount: number; allIn: boolean } | null;
  /** Postflop without a bet so far. */
  bet: BetRange | null;
  raise: BetRange | null;
  /** "Platz leer": only for the first seats in playing order, before the hero, up to the cutoff. */
  empty: boolean;
  /** The usual size for a bet or raise (street total in chips), null when neither is possible. */
  suggested: number | null;
};

export type Phase =
  | { type: 'act'; legal: LegalActions }
  | { type: 'board'; street: BoardStreet; count: 1 | 3; optional: boolean }
  | { type: 'done'; reason: 'folded' | 'heroFolded' | 'showdown' };

export type SituationState = {
  setup: SituationSetup;
  phase: Phase;
  /** Seated positions in seat order (UTG first). */
  seated: Position[];
  events: HandEvent[];
  /** `states[i]` is the table right before `events[i]`; the last entry is the table now (as `walkHand` builds it). */
  states: TableState[];
  table: TableState;
  /** Event index of every hero action, in order. */
  heroEvents: number[];
  /** Villains still in the hand at the showdown whose cards were not entered yet. */
  showable: Position[];
  /** Hero cards, board and shown cards. */
  usedCards: Card[];
};

export class IllegalStepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalStepError';
  }
}

const illegal = (message: string): never => {
  throw new IllegalStepError(message);
};

/** Player names in the generated hand: "Hero" and one neutral name per seat. */
export const playerName = (setup: SituationSetup, position: Position): string =>
  position === setup.hero ? HERO : `Spieler${seatOf(position) + 1}`;

const NEXT_STREET: Record<Street, BoardStreet | null> = { preflop: 'flop', flop: 'turn', turn: 'river', river: null };
const isCard = (c: unknown): c is Card => typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < 52;

function checkSetup(setup: SituationSetup): void {
  if (!new RegExp(`^${SITUATION_HAND_PREFIX}\\d+$`).test(setup.handId)) illegal('Hand-ID ungültig');
  if (!isTournamentKind(setup.kind)) illegal('Turnierart ungültig');
  if (!POSITIONS.includes(setup.hero)) illegal('Position ungültig');
  const [a, b] = setup.heroCards;
  if (!isCard(a) || !isCard(b) || a === b) illegal('Karten ungültig');
  for (const p of POSITIONS) if (!isStackBb(setup.stacks[p])) illegal(`Stack ${p} ungültig`);
}

/** The table as it is played, step by step; snapshots match `walkHand` exactly. */
class Table {
  readonly players: PlayerState[];
  readonly events: HandEvent[] = [];
  readonly states: TableState[];
  street: Street = 'preflop';
  pot = 0;
  board: Card[] = [];
  lastAggressor: string | null = null;
  /** Highest street total so far and the size of the last full raise (both chips). */
  maxBet = 0;
  lastRaise = CHIPS_PER_BB;
  /** Players who acted since the street began or since the last full raise. */
  acted = new Set<string>();
  lastActor: string | null = null;
  closed = false;
  collected = false;
  ended = false;
  shown = new Set<string>();
  anyAction = false;

  constructor(
    readonly setup: SituationSetup,
    readonly seated: Position[],
  ) {
    this.players = seated.map((position) => {
      const chips = bbToChips(setup.stacks[position]);
      return {
        name: playerName(setup, position),
        seat: seatOf(position) + 1,
        position,
        startChips: chips,
        stack: chips,
        streetBet: 0,
        folded: false,
        allIn: false,
        isHero: position === setup.hero,
      };
    });
    this.states = [this.snapshot()];
    for (const p of this.players) this.post(p, 'ante', ANTE_CHIPS);
    this.post(this.byPosition('SB'), 'smallBlind', SMALL_BLIND_CHIPS);
    this.post(this.byPosition('BB'), 'bigBlind', CHIPS_PER_BB);
    this.maxBet = Math.max(...this.players.map((p) => p.streetBet));
  }

  byPosition(position: Position): PlayerState {
    return this.players.find((p) => p.position === position)!;
  }

  snapshot(): TableState {
    return {
      street: this.street,
      pot: this.pot,
      board: [...this.board],
      players: this.players.map((p) => ({ ...p })),
      lastAggressor: this.lastAggressor,
    };
  }

  push(event: HandEvent): void {
    this.events.push(event);
    this.states.push(this.snapshot());
  }

  /** Puts chips in; returns whether the player is all-in now. */
  pay(p: PlayerState, amount: number, street: boolean): boolean {
    p.stack -= amount;
    if (street) p.streetBet += amount;
    this.pot += amount;
    if (p.stack === 0) p.allIn = true;
    return p.stack === 0;
  }

  post(p: PlayerState, type: 'ante' | 'smallBlind' | 'bigBlind', amount: number): void {
    const paid = Math.min(amount, p.stack);
    const allIn = this.pay(p, paid, type !== 'ante');
    this.push({ type, player: p.name, amount: paid, allIn });
  }

  active(): PlayerState[] {
    return this.players.filter((p) => !p.folded);
  }

  othersCanAct(p: PlayerState): boolean {
    return this.players.some((q) => q !== p && !q.folded && q.stack > 0);
  }

  needsToAct(p: PlayerState): boolean {
    if (p.folded || p.stack === 0) return false;
    return p.streetBet < this.maxBet || (!this.acted.has(p.name) && this.othersCanAct(p));
  }

  /** Preflop UTG … BB, postflop SB, BB, then UTG … BTN. */
  order(): PlayerState[] {
    if (this.street === 'preflop') return this.players;
    const blinds = this.players.filter((p) => p.position === 'SB' || p.position === 'BB');
    return [...blinds, ...this.players.filter((p) => p.position !== 'SB' && p.position !== 'BB')];
  }

  nextToAct(): PlayerState | null {
    const order = this.order();
    const last = this.lastActor === null ? -1 : order.findIndex((p) => p.name === this.lastActor);
    for (let k = 1; k <= order.length; k++) {
      const p = order[(last + k) % order.length];
      if (this.needsToAct(p)) return p;
    }
    return null;
  }

  heroFolded(): boolean {
    return this.players.some((p) => p.isHero && p.folded);
  }

  legal(p: PlayerState): LegalActions {
    const toCall = Math.max(0, this.maxBet - p.streetBet);
    const aggressive = p.stack > toCall && !this.acted.has(p.name) && this.othersCanAct(p);
    const max = p.streetBet + p.stack;
    let bet: BetRange | null = null;
    let raise: BetRange | null = null;
    if (aggressive && this.maxBet === 0) bet = { min: Math.min(CHIPS_PER_BB, max), max };
    if (aggressive && this.maxBet > 0) {
      const base = this.street === 'preflop' ? Math.max(this.maxBet, CHIPS_PER_BB) : this.maxBet;
      raise = { min: Math.min(base + this.lastRaise, max), max };
    }
    const seat = seatOf(p.position!);
    const legal: LegalActions = {
      position: p.position!,
      isHero: p.isHero,
      fold: toCall > 0,
      check: toCall === 0,
      call: toCall > 0 ? { amount: Math.min(toCall, p.stack), allIn: p.stack <= toCall } : null,
      bet,
      raise,
      empty: !this.anyAction && seat < seatOf(this.setup.hero) && seat <= LAST_EMPTY_SEAT,
      suggested: null,
    };
    legal.suggested = suggestedSize(this, p, legal);
    return legal;
  }

  /** The street is over: a bet nobody matched goes back (GGPoker writes "Uncalled bet … returned to …"). */
  close(): void {
    this.closed = true;
    const sorted = [...this.players].sort((a, b) => b.streetBet - a.streetBet);
    const [top, second] = sorted;
    const excess = top.streetBet - (second?.streetBet ?? 0);
    if (excess <= 0) return;
    top.stack += excess;
    top.streetBet -= excess;
    this.pot -= excess;
    if (top.stack > 0) top.allIn = false;
    this.push({ type: 'uncalled', player: top.name, amount: excess });
  }

  phase(): Phase {
    const active = this.active();
    if (active.length > 1 && this.heroFolded()) return { type: 'done', reason: 'heroFolded' };
    const next = active.length > 1 ? this.nextToAct() : null;
    if (next) return { type: 'act', legal: this.legal(next) };
    if (!this.closed) this.close();
    if (active.length === 1) {
      if (!this.collected) {
        this.collected = true;
        this.push({ type: 'collect', player: active[0].name, amount: this.pot });
      }
      return { type: 'done', reason: 'folded' };
    }
    const street = NEXT_STREET[this.street];
    if (street === null || this.ended) return { type: 'done', reason: 'showdown' };
    const canBet = active.filter((p) => p.stack > 0).length;
    return { type: 'board', street, count: street === 'flop' ? 3 : 1, optional: canBet <= 1 };
  }

  act(p: PlayerState, step: SituationStep, legal: LegalActions): void {
    const event = (action: ActionEvent['action'], amount: number, to: number | null): void => {
      const allIn = amount > 0 && this.pay(p, amount, true);
      if (action === 'fold') p.folded = true;
      this.acted.add(p.name);
      this.lastActor = p.name;
      this.anyAction = true;
      if (action === 'bet' || action === 'raise') this.lastAggressor = p.name;
      this.push({ type: 'action', street: this.street, player: p.name, action, amount, to, allIn });
    };
    switch (step.type) {
      case 'fold':
        if (!legal.fold) illegal('Fold ist hier nicht möglich');
        return event('fold', 0, null);
      case 'check':
        if (!legal.check) illegal('Check gegen einen Einsatz ist nicht möglich');
        return event('check', 0, null);
      case 'call':
        if (!legal.call) illegal('Kein Einsatz zum Callen');
        return event('call', legal.call!.amount, null);
      case 'bet':
      case 'raise': {
        const range = step.type === 'bet' ? legal.bet : legal.raise;
        if (!range) illegal(step.type === 'bet' ? 'Bet ist hier nicht möglich' : 'Raise ist hier nicht möglich');
        const to = Math.min(step.to, range!.max);
        if (!Number.isInteger(to) || to < range!.min) illegal('Einsatz unter dem Minimum');
        const raised = to - this.maxBet;
        if (raised >= this.lastRaise) {
          // A full bet or raise: everybody else may raise again. An all-in below that reopens nothing.
          this.lastRaise = raised;
          this.acted.clear();
        }
        this.maxBet = to;
        return event(step.type, to - p.streetBet, step.type === 'raise' ? to : null);
      }
      default:
        illegal('Jetzt ist eine Aktion dran');
    }
  }

  dealBoard(street: BoardStreet, cards: readonly Card[]): void {
    for (const p of this.players) p.streetBet = 0;
    this.street = street;
    this.board.push(...cards);
    this.lastAggressor = null;
    this.maxBet = 0;
    this.lastRaise = CHIPS_PER_BB;
    this.acted.clear();
    this.lastActor = null;
    this.closed = false;
    this.push({ type: 'board', street, cards: [...cards] });
  }

  used(): Card[] {
    const shown = this.events.flatMap((e) => (e.type === 'show' ? e.cards : []));
    return [...this.setup.heroCards, ...this.board, ...shown];
  }
}

const roundToStep = (chips: number): number => Math.round(chips / CHIPS_PER_STEP) * CHIPS_PER_STEP;

/**
 * The usual size, as in the training: open 2.2 BB (SB 3 BB) plus 1 BB per limper, 3-bet 3× (from the blinds 4×),
 * 4-bet and later 2.2×; postflop a bet of half the pot and a raise to three times the bet.
 */
function suggestedSize(table: Table, p: PlayerState, legal: LegalActions): number | null {
  const range = legal.bet ?? legal.raise;
  if (!range) return null;
  let size: number;
  if (table.street === 'preflop') {
    const actions = table.events.filter((e): e is ActionEvent => e.type === 'action');
    const raises = actions.filter((e) => e.action === 'raise');
    if (raises.length === 0) {
      const limpers = actions.filter((e) => e.action === 'call').length;
      size = ((p.position === 'SB' ? SB_OPEN_RAISE : OPEN_RAISE) + limpers) * CHIPS_PER_BB;
    } else {
      const factor = raises.length >= 2 ? FOUR_BET : p.position === 'SB' || p.position === 'BB' ? THREE_BET_BLINDS : THREE_BET_IP;
      size = table.maxBet * factor;
    }
  } else {
    size = legal.bet ? table.pot / 2 : table.maxBet * 3;
  }
  return Math.min(range.max, Math.max(range.min, roundToStep(size)));
}

/** Replays the situation; throws `IllegalStepError` for a step that is not possible at its point. */
export function playSituation(situation: Situation): SituationState {
  const { setup, steps } = situation;
  checkSetup(setup);
  let empties = 0;
  while (steps[empties]?.type === 'empty') empties++;
  for (let seat = 0; seat < empties; seat++) {
    if (seat >= seatOf(setup.hero) || seat > LAST_EMPTY_SEAT) illegal('Dieser Platz kann nicht leer sein');
  }
  const seated = POSITIONS.slice(empties);
  const table = new Table(setup, [...seated]);
  let phase = table.phase();
  for (const step of steps.slice(empties)) {
    if (step.type === 'end') {
      if (phase.type !== 'board' || !phase.optional) illegal('Die Hand ist noch nicht vorbei');
      table.ended = true;
    } else if (step.type === 'board') {
      if (phase.type !== 'board') illegal('Jetzt kommen keine Board-Karten');
      const { street, count } = phase as Extract<Phase, { type: 'board' }>;
      const used = new Set(table.used());
      const cards = step.cards;
      if (cards.length !== count || !cards.every(isCard) || new Set(cards).size !== count || cards.some((c) => used.has(c))) {
        illegal('Board-Karten ungültig');
      }
      table.dealBoard(street, cards);
    } else if (step.type === 'show') {
      if (phase.type !== 'done' || phase.reason !== 'showdown') illegal('Karten zeigen geht erst am Ende');
      const p = table.players.find((x) => x.position === step.position);
      if (!p || p.isHero || p.folded || table.shown.has(p.name)) illegal('Dieser Spieler kann keine Karten zeigen');
      const used = new Set(table.used());
      const [a, b] = step.cards;
      if (!isCard(a) || !isCard(b) || a === b || used.has(a) || used.has(b)) illegal('Karten ungültig');
      table.shown.add(p!.name);
      table.push({ type: 'show', player: p!.name, cards: [a, b] });
    } else {
      if (phase.type !== 'act') illegal('Jetzt ist keine Aktion dran');
      const { legal } = phase as Extract<Phase, { type: 'act' }>;
      if (step.type === 'empty') illegal('Dieser Platz kann nicht leer sein');
      table.act(table.byPosition(legal.position), step, legal);
    }
    phase = table.phase();
  }
  const heroEvents = table.events.flatMap((e, i) => (e.type === 'action' && e.player === HERO ? [i] : []));
  const showable =
    phase.type === 'done' && phase.reason === 'showdown'
      ? table.players.filter((p) => !p.isHero && !p.folded && !table.shown.has(p.name)).map((p) => p.position!)
      : [];
  return {
    setup,
    phase,
    seated: [...seated],
    events: table.events,
    states: table.states,
    table: table.states[table.states.length - 1],
    heroEvents,
    showable,
    usedCards: table.used(),
  };
}

/** The situation with one more step; throws `IllegalStepError` when the step is not possible. */
export function addStep(situation: Situation, step: SituationStep): Situation {
  const next = { setup: situation.setup, steps: [...situation.steps, step] };
  playSituation(next);
  return next;
}

/** "← Zurück": the last step taken back. */
export const undoStep = (situation: Situation): Situation => ({ setup: situation.setup, steps: situation.steps.slice(0, -1) });

/** The situation up to and including the hero's last action (for the live rating); null before his first action. */
export function upToLastHeroAction(situation: Situation): Situation | null {
  const state = playSituation(situation);
  if (state.heroEvents.length === 0) return null;
  for (let n = situation.steps.length; n > 0; n--) {
    const shorter = { setup: situation.setup, steps: situation.steps.slice(0, n - 1) };
    if (playSituation(shorter).heroEvents.length < state.heroEvents.length) return { setup: situation.setup, steps: situation.steps.slice(0, n) };
  }
  return situation;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/situation/model.test.ts` → Expected: PASS (16 Tests)

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → Expected: alle PASS (755 Tests). Run: `npm run typecheck` → Expected: Exit 0. Run: `npm run check:portability` → Expected: `check-portability: clean`.

```bash
git add src/engine/preflop/spots.ts src/situation/model.test.ts src/situation/model.ts
git commit -m "feat(situation): reines Situations-Modell mit erlaubten Aktionen, Mindest-Raise, All-in, leeren Plätzen und Rückgängig" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Text-Erzeuger im GGPoker-Format und Rundlauf-Test

Der Rundlauf-Test ist die Absicherung des ganzen Ansatzes: 400 zufällige gültige Situationen (fester Seed 20261014), jede nach jedem einzelnen Schritt (im Prototyp 5711 Zwischenstände) als Text erzeugt, mit dem echten Parser gelesen und mit `walkHand` abgespielt – Ereignisse, Pot, Einsätze, Stacks, Board, Folds und All-ins müssen exakt dem Modell entsprechen, und jede Art von Ende muss vorkommen.

**Files:**
- Create: `src/situation/text.test.ts`, `src/situation/text.ts`
- Test: `src/situation/text.test.ts`

**Interfaces:**
- Consumes: `playSituation`, `CHIPS_PER_BB`, `SMALL_BLIND_CHIPS`, `ANTE_CHIPS`, `CHIPS_PER_STEP`, `addStep`, `bbToChips` (Task 2); `SITUATION_TOURNAMENTS` (Task 1); `maxStreetBet`, `walkHand` aus `src/review/hand-model.ts`; `parseHand`; `cardName`; `mulberry32`
- Produces:
  - `src/situation/text.ts`: `playedAtOf(date: Date): string` („JJJJ-MM-TT hh:mm:ss“, lokale Zeit), `situationText(situation: Situation, playedAt: string): string`

- [ ] **Step 1: Failing Tests schreiben**

`src/situation/text.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { type Card, parseCard } from '../engine/cards';
import { POSITIONS, type Position } from '../engine/positions';
import { type Rng, mulberry32 } from '../engine/rng';
import { walkHand } from '../review/hand-model';
import { parseHand } from '../review/parse';
import { type Situation, type SituationSetup, type SituationStep, CHIPS_PER_STEP, addStep, bbToChips, playSituation } from './model';
import { playedAtOf, situationText } from './text';

const PLAYED_AT = '2026-10-14 18:05:09';
const cards = (text: string) => text.split(' ').map(parseCard);
const setupOf = (over: Partial<SituationSetup> = {}): SituationSetup => ({
  handId: 'SIT1760457909000',
  kind: 'normal',
  hero: 'CO',
  heroCards: [parseCard('Ah'), parseCard('Kd')],
  stacks: Object.fromEntries(POSITIONS.map((p) => [p, 25])) as Record<Position, number>,
  ...over,
});

describe('situation text', () => {
  it('writes a GGPoker hand history', () => {
    const steps: SituationStep[] = [
      { type: 'empty' },
      { type: 'fold' },
      { type: 'fold' },
      { type: 'fold' },
      { type: 'raise', to: bbToChips(2.2) },
      { type: 'fold' },
      { type: 'fold' },
      { type: 'call' },
      { type: 'board', cards: cards('Qh 5c 3c') },
      { type: 'check' },
      { type: 'bet', to: bbToChips(2.5) },
      { type: 'fold' },
    ];
    expect(situationText({ setup: setupOf({ kind: 'bounty' }), steps }, PLAYED_AT).split('\n')).toEqual([
      "Poker Hand #SIT1760457909000: Tournament #SIT-bounty, Eigene Situationen (Bounty) Hold'em No Limit - Level1(400/800(100)) - 2026/10/14 18:05:09",
      "Table 'Situation' 8-max Seat #6 is the button",
      'Seat 2: Spieler2 (20,000 in chips)',
      'Seat 3: Spieler3 (20,000 in chips)',
      'Seat 4: Spieler4 (20,000 in chips)',
      'Seat 5: Hero (20,000 in chips)',
      'Seat 6: Spieler6 (20,000 in chips)',
      'Seat 7: Spieler7 (20,000 in chips)',
      'Seat 8: Spieler8 (20,000 in chips)',
      'Spieler2: posts the ante 100',
      'Spieler3: posts the ante 100',
      'Spieler4: posts the ante 100',
      'Hero: posts the ante 100',
      'Spieler6: posts the ante 100',
      'Spieler7: posts the ante 100',
      'Spieler8: posts the ante 100',
      'Spieler7: posts small blind 400',
      'Spieler8: posts big blind 800',
      '*** HOLE CARDS ***',
      'Dealt to Spieler2 ',
      'Dealt to Spieler3 ',
      'Dealt to Spieler4 ',
      'Dealt to Hero [Ah Kd]',
      'Dealt to Spieler6 ',
      'Dealt to Spieler7 ',
      'Dealt to Spieler8 ',
      'Spieler2: folds',
      'Spieler3: folds',
      'Spieler4: folds',
      'Hero: raises 960 to 1,760',
      'Spieler6: folds',
      'Spieler7: folds',
      'Spieler8: calls 960',
      '*** FLOP *** [Qh 5c 3c]',
      'Spieler8: checks',
      'Hero: bets 2,000',
      'Spieler8: folds',
      'Uncalled bet (2,000) returned to Hero',
      '*** SHOWDOWN ***',
      'Hero collected 4,620 from pot',
      '*** SUMMARY ***',
      'Total pot 4,620 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0',
      'Board [Qh 5c 3c]',
    ]);
  });

  it('formats the local time as the hand history prints it', () => {
    expect(playedAtOf(new Date(2026, 9, 4, 8, 5, 9))).toBe('2026-10-04 08:05:09');
  });

  it('writes the turn and river lines with the board so far and a partial hand without a showdown', () => {
    const steps: SituationStep[] = [{ type: 'raise', to: 999_999 }, ...Array.from({ length: 6 }, () => ({ type: 'fold' }) as const), { type: 'call' }];
    const runout = [cards('2c 7d 9h'), cards('Js'), cards('3s')].reduce<Situation>(
      (s, c) => addStep(s, { type: 'board', cards: c }),
      { setup: setupOf({ hero: 'BB' }), steps },
    );
    const lines = situationText(runout, PLAYED_AT).split('\n');
    expect(lines).toContain('*** TURN *** [2c 7d 9h] [Js]');
    expect(lines).toContain('*** RIVER *** [2c 7d 9h Js] [3s]');
    expect(lines.slice(-4)).toEqual(['*** SHOWDOWN ***', '*** SUMMARY ***', 'Total pot 41,000 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0', 'Board [2c 7d 9h Js 3s]']);
    const partial = situationText({ setup: setupOf(), steps: [] }, PLAYED_AT).split('\n');
    expect(partial.slice(-2)).toEqual(['*** SUMMARY ***', 'Total pot 2,000 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0']);
    expect(parseHand(partial.join('\n')).events).toHaveLength(10);
  });
});

/** A random legal situation: every step is chosen among the actions the model allows at that point. */
function randomSituation(rng: Rng, n: number): Situation {
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rng() * list.length)];
  const deck: Card[] = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const randomStack = () => (rng() < 0.3 ? 1 + Math.floor(rng() * 100) / 10 : 1 + Math.floor(rng() * 1991) / 10);
  const base = randomStack();
  const stacks = Object.fromEntries(POSITIONS.map((p) => [p, rng() < 0.5 ? base : randomStack()])) as Record<Position, number>;
  const kinds = ['normal', 'satellit', 'bounty'] as const;
  const setup: SituationSetup = { handId: `SIT${n}`, kind: pick(kinds), hero: pick(POSITIONS), heroCards: [deck.pop()!, deck.pop()!], stacks };
  let situation: Situation = { setup, steps: [] };
  for (let guard = 0; guard < 80; guard++) {
    const state = playSituation(situation);
    const { phase } = state;
    let step: SituationStep;
    if (phase.type === 'act') {
      const legal = phase.legal;
      const options: SituationStep[] = [];
      if (legal.empty && rng() < 0.4) options.push({ type: 'empty' });
      // Villains fold often (so hands end with one player left), the hero rarely (so hands go deep).
      if (legal.fold && (!legal.isHero || rng() < 0.3)) {
        for (let i = 0; i < (legal.isHero ? 1 : 4); i++) options.push({ type: 'fold' });
      }
      if (legal.check) options.push({ type: 'check' });
      if (legal.call) options.push({ type: 'call' }, { type: 'call' });
      const range = legal.bet ?? legal.raise;
      if (range) {
        const type = legal.bet ? 'bet' : 'raise';
        const steps = Math.floor((range.max - range.min) / CHIPS_PER_STEP);
        options.push({ type, to: range.min + CHIPS_PER_STEP * Math.floor(rng() * (steps + 1)) });
        options.push({ type, to: rng() < 0.5 ? range.max : 999_999 });
        if (legal.suggested !== null) options.push({ type, to: legal.suggested });
      }
      if (options.length === 0) options.push(legal.fold ? { type: 'fold' } : { type: 'check' });
      step = pick(options);
    } else if (phase.type === 'board') {
      step = phase.optional && rng() < 0.3 ? { type: 'end' } : { type: 'board', cards: deck.splice(0, phase.count) };
    } else if (phase.type === 'done' && state.showable.length > 0 && rng() < 0.6) {
      step = { type: 'show', position: pick(state.showable), cards: [deck.pop()!, deck.pop()!] };
    } else break;
    situation = addStep(situation, step);
  }
  return situation;
}

describe('round trip: situation → text → parser → table', () => {
  it('gives the same events and the same table after every step, for many random situations', () => {
    const rng = mulberry32(20261014);
    let checked = 0;
    const phases = new Set<string>();
    for (let n = 0; n < 400; n++) {
      const situation = randomSituation(rng, n);
      for (let k = 0; k <= situation.steps.length; k++) {
        const prefix = { setup: situation.setup, steps: situation.steps.slice(0, k) };
        const state = playSituation(prefix);
        const hand = parseHand(situationText(prefix, PLAYED_AT));
        expect(hand.events).toEqual(state.events);
        expect(walkHand(hand)).toEqual(state.states);
        expect(hand.totalPot).toBe(state.table.pot);
        expect(hand.heroCards).toEqual(situation.setup.heroCards);
        phases.add(state.phase.type === 'done' ? state.phase.reason : state.phase.type);
        checked++;
      }
    }
    // With this seed: 5711 steps in 400 situations.
    expect(checked).toBeGreaterThan(4000);
    expect([...phases].sort()).toEqual(['act', 'board', 'folded', 'heroFolded', 'showdown']);
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/situation/text.test.ts` → Expected: FAIL – `Cannot find module './text'` („1 failed (1)“, no tests).

- [ ] **Step 3: Umsetzen**

`src/situation/text.ts` anlegen:
```ts
import { type Card, cardName } from '../engine/cards';
import { seatOf } from '../engine/positions';
import { maxStreetBet } from '../review/hand-model';
import type { HandEvent } from '../review/parse';
import { SITUATION_TOURNAMENTS } from '../review/situation-tournaments';
import { ANTE_CHIPS, CHIPS_PER_BB, SMALL_BLIND_CHIPS, type Situation, playSituation } from './model';

const fmt = (chips: number): string => chips.toLocaleString('en-US');
const cardList = (cards: readonly Card[]): string => `[${cards.map(cardName).join(' ')}]`;
const pad = (n: number): string => String(n).padStart(2, '0');

/** Local time as the hand history prints it (and `ParsedHand.playedAt` stores it): "2026-10-14 18:05:09". */
export const playedAtOf = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

/**
 * Spec 4: the situation as a GGPoker hand history that `parseHand` reads, at any point of the input. The pot total in
 * the summary is what was put in minus what went back, so the parser's pot check holds for partial hands, too.
 */
export function situationText(situation: Situation, playedAt: string): string {
  const state = playSituation(situation);
  const { setup } = state;
  const tournament = SITUATION_TOURNAMENTS[setup.kind];
  const [date, time] = playedAt.split(' ');
  const first = state.states[0];
  const lines = [
    `Poker Hand #${setup.handId}: Tournament #${tournament.id}, ${tournament.name} Hold'em No Limit - Level1(${fmt(SMALL_BLIND_CHIPS)}/${fmt(CHIPS_PER_BB)}(${fmt(ANTE_CHIPS)})) - ${date.replace(/-/g, '/')} ${time}`,
    `Table 'Situation' 8-max Seat #${seatOf('BTN') + 1} is the button`,
    ...first.players.map((p) => `Seat ${p.seat}: ${p.name} (${fmt(p.startChips)} in chips)`),
  ];
  const allIn = (e: { allIn: boolean }) => (e.allIn ? ' and is all-in' : '');
  const board: Card[] = [];
  let holeCards = false;
  let showdown = false;
  const dealt = () => {
    holeCards = true;
    lines.push('*** HOLE CARDS ***');
    for (const p of first.players) lines.push(p.isHero ? `Dealt to ${p.name} ${cardList(setup.heroCards)}` : `Dealt to ${p.name} `);
  };
  const line = (e: HandEvent, i: number): string => {
    switch (e.type) {
      case 'ante':
        return `${e.player}: posts the ante ${fmt(e.amount)}${allIn(e)}`;
      case 'smallBlind':
        return `${e.player}: posts small blind ${fmt(e.amount)}${allIn(e)}`;
      case 'bigBlind':
        return `${e.player}: posts big blind ${fmt(e.amount)}${allIn(e)}`;
      case 'action': {
        const verb =
          e.action === 'fold'
            ? 'folds'
            : e.action === 'check'
              ? 'checks'
              : e.action === 'call'
                ? `calls ${fmt(e.amount)}`
                : e.action === 'bet'
                  ? `bets ${fmt(e.amount)}`
                  : `raises ${fmt(e.to! - maxStreetBet(state.states[i]))} to ${fmt(e.to!)}`;
        return `${e.player}: ${verb}${allIn(e)}`;
      }
      case 'board': {
        const before = board.length > 0 ? `${cardList(board)} ` : '';
        board.push(...e.cards);
        return `*** ${e.street.toUpperCase()} *** ${before}${cardList(e.cards)}`;
      }
      case 'uncalled':
        return `Uncalled bet (${fmt(e.amount)}) returned to ${e.player}`;
      case 'show':
        return `${e.player}: shows ${cardList(e.cards)}`;
      case 'collect':
        return `${e.player} collected ${fmt(e.amount)} from pot`;
    }
  };
  state.events.forEach((e, i) => {
    const post = e.type === 'ante' || e.type === 'smallBlind' || e.type === 'bigBlind';
    if (!post && !holeCards) dealt();
    if ((e.type === 'show' || e.type === 'collect') && !showdown) {
      showdown = true;
      lines.push('*** SHOWDOWN ***');
    }
    lines.push(line(e, i));
  });
  if (!holeCards) dealt();
  if (!showdown && state.phase.type === 'done' && state.phase.reason !== 'heroFolded') lines.push('*** SHOWDOWN ***');
  lines.push('*** SUMMARY ***', `Total pot ${fmt(state.table.pot)} | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0`);
  if (board.length > 0) lines.push(`Board ${cardList(board)}`);
  return lines.join('\n');
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/situation/text.test.ts` → Expected: PASS (4 Tests; der Rundlauf braucht im Prototyp etwa 1,5 s)

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → Expected: alle PASS (759 Tests). Run: `npm run typecheck` → Expected: Exit 0. Run: `npm run check:portability` → Expected: `check-portability: clean`.

```bash
git add src/situation/text.test.ts src/situation/text.ts
git commit -m "feat(situation): Hand-Text im GGPoker-Format für jeden Zwischenstand, Rundlauf-Test mit 400 zufälligen Situationen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Review-Store: Hand bewerten, Situation speichern, Bewertungs-Gleichheit

Speichern geht durch denselben Weg wie ein Import (`importTexts`), damit Bewertung, Archiv-Schreiben, Schreibsperre, Nachtraining und spätere Neubewertung nicht doppelt gebaut werden. Die Test-Helfer in `src/situation/test-situations.ts` bauen eine bekannte Situation (72o UTG, ein Chart-Fehler) und stellen echte Fixture-Hände über das Modell nach.

**Files:**
- Create: `src/situation/rating.test.ts`, `src/situation/test-situations.ts`
- Modify: `src/app/format.test.ts`, `src/app/format.ts`, `src/app/review-store.test.ts`, `src/app/review-store.ts`, `src/ui/components/RetrainingHint.tsx`
- Test: `src/app/format.test.ts`, `src/app/review-store.test.ts`, `src/situation/rating.test.ts`

**Interfaces:**
- Consumes: `importTexts` (intern), `assertWritable` (intern über `importTexts`), `analyzer` (intern) in `src/app/review-store.ts`; `isHandName` (Task 1); `SITUATION_HAND_PREFIX`, `situationKindOf` (Task 1); `HandParseError`, `parseHand`; `analyzeHand`, `HandAnalysis`; Modell und Text (Task 2, 3); `positionsOf`
- Produces:
  - `ReviewStore.rateHand(hand: ParsedHand): Promise<HandAnalysis>` (schreibt nichts)
  - `ReviewStore.saveSituation(raw: string, name: string): Promise<TournamentRecord>`; `SITUATION_SAVED_ALREADY = 'Diese Situation ist schon gespeichert.'`, `SITUATION_NAME_INVALID = 'Bitte gib einen Namen mit höchstens 60 Zeichen ein.'`
  - `exportPart` schreibt `name` je Hand, `mergeExport` übernimmt ihn
  - `src/app/format.ts`: `retrainingHint(playedAt: string, key = ''): string` („Aus deiner Situation vom …“ für Schlüssel `SIT…`); `RetrainingHint` übergibt `origin.key`
  - `src/situation/test-situations.ts` (nur Tests): `TEST_PLAYED_AT`, `TEST_HAND_ID`, `sameStacks(bb: number): Record<Position, number>`, `sevenTwoOpen(kind?: TournamentKind, handId?: string): Situation`, `situationFromHand(hand: ParsedHand, kind?: TournamentKind, handId?: string): Situation | null`

- [ ] **Step 1: Failing Tests schreiben**

In `src/app/format.test.ts` ersetzen:
```ts
    expect(retrainingHint('2026-10-12 15:46:28')).toBe('Aus deinem Turnier vom 12.10.');
    expect(retrainingHint('2026-01-05 09:00:00')).toBe('Aus deinem Turnier vom 05.01.');
    expect(formatRetrainingCount(1)).toBe('1 Spot aus deinen Turnieren wartet im Training.');
    expect(formatRetrainingCount(200)).toBe('200 Spots aus deinen Turnieren warten im Training.');
```
durch:
```ts
    expect(retrainingHint('2026-10-12 15:46:28')).toBe('Aus deinem Turnier vom 12.10.');
    expect(retrainingHint('2026-01-05 09:00:00')).toBe('Aus deinem Turnier vom 05.01.');
    expect(retrainingHint('2026-10-14 18:05:09', 'TM6532734973:13')).toBe('Aus deinem Turnier vom 14.10.');
    expect(retrainingHint('2026-10-14 18:05:09', 'SIT1760457909000:10')).toBe('Aus deiner Situation vom 14.10.');
    expect(formatRetrainingCount(1)).toBe('1 Spot aus deinen Turnieren wartet im Training.');
    expect(formatRetrainingCount(200)).toBe('200 Spots aus deinen Turnieren warten im Training.');
```

In `src/app/review-store.test.ts` ersetzen:
```ts
import steps from '../review/fixtures/step-satellites.txt?raw';
import { answerRetraining, forgetRetraining, retrainingOf, syncRetraining } from '../game/retraining';
import { type SaveState, emptyState } from '../storage/schema';
import {
```
durch:
```ts
import steps from '../review/fixtures/step-satellites.txt?raw';
import { answerRetraining, forgetRetraining, retrainingOf, syncRetraining } from '../game/retraining';
import { parseHand } from '../review/parse';
import type { TournamentKind } from '../review/tournament-kind';
import { TEST_HAND_ID, TEST_PLAYED_AT, sevenTwoOpen } from '../situation/test-situations';
import { situationText } from '../situation/text';
import { type SaveState, emptyState } from '../storage/schema';
import {
```

In `src/app/review-store.test.ts` ersetzen:
```ts
  LOCK_READ_ONLY,
  type RetrainingSink,
  type ReviewStoreDeps,
  createReviewStore,
```
durch:
```ts
  LOCK_READ_ONLY,
  type RetrainingSink,
  SITUATION_NAME_INVALID,
  SITUATION_SAVED_ALREADY,
  type ReviewStoreDeps,
  createReviewStore,
```

An das Ende von `src/app/review-store.test.ts` anfügen (nach einer Leerzeile):
```ts
describe('saved situations (Plan 10)', () => {
  const text = (kind: TournamentKind = 'normal', id = TEST_HAND_ID) => situationText(sevenTwoOpen(kind, id), TEST_PLAYED_AT);

  it('rates a hand with its analyzer and writes nothing', async () => {
    const { store, backend } = await setup();
    const analysis = await store.rateHand(parseHand(text()));
    expect(analysis.decisions).toHaveLength(1);
    expect(analysis.decisions[0]).toMatchObject({ eventIndex: 10, rating: { model: 'chart', grade: { verdict: 'wrong' } } });
    expect(backend.dump()).toEqual({});
  });

  it('saves a situation with its name into the tournament of its kind and feeds the retraining queue', async () => {
    const fed: [string, string[]][] = [];
    const sink: RetrainingSink = { synced: () => new Set(), sync: (id, candidates) => fed.push([id, candidates.map((c) => c.key)]), forget: () => {} };
    const { store, backend } = await setup({ retraining: sink });
    const saved = await store.saveSituation(text(), '  72o UTG · 40 BB ');
    expect(saved).toMatchObject({
      id: 'SIT-normal',
      name: 'Eigene Situationen',
      kind: 'normal',
      detectedKind: 'normal',
      handIds: [TEST_HAND_ID],
      summary: { hands: 1, preflopErrors: 1, postflopErrors: 0 },
    });
    expect(readHand(backend.dump()[handKey(TEST_HAND_ID)])).toMatchObject({
      name: '72o UTG · 40 BB',
      tournamentId: 'SIT-normal',
      playedAt: TEST_PLAYED_AT,
      dateKey: '2026-10-14',
    });
    expect(fed).toEqual([['SIT-normal', [`${TEST_HAND_ID}:10`]]]);

    await store.saveSituation(text('satellit', 'SIT2'), 'Satellit');
    expect(store.getSnapshot().tournaments.find((t) => t.id === 'SIT-satellit')).toMatchObject({
      name: 'Eigene Situationen (Satellit)',
      kind: 'satellit',
      summary: { preflopErrors: 0, hints: 1 },
    });
    expect(fed.at(-1)).toEqual(['SIT-satellit', []]);
    await store.saveSituation(text('normal', 'SIT3'), 'Noch eine');
    expect(store.getSnapshot().tournaments.find((t) => t.id === 'SIT-normal')!.handIds).toEqual([TEST_HAND_ID, 'SIT3']);
  });

  it('refuses a second save, a broken text, an invalid name and imported hands', async () => {
    const { store } = await setup();
    await store.saveSituation(text(), 'A');
    await expect(store.saveSituation(text(), 'A')).rejects.toThrow(SITUATION_SAVED_ALREADY);
    await expect(store.saveSituation(text('normal', 'SIT9').replace('Total pot ', 'Total pot 1'), 'A')).rejects.toThrow(
      'Diese Situation kann ich nicht speichern: Pot passt nicht zu den Einsätzen',
    );
    await expect(store.saveSituation(text('normal', 'SIT9'), '   ')).rejects.toThrow(SITUATION_NAME_INVALID);
    await expect(store.saveSituation(text('normal', 'SIT9'), 'x'.repeat(61))).rejects.toThrow(SITUATION_NAME_INVALID);
    await expect(store.saveSituation(bounty, 'GG')).rejects.toThrow('Das ist keine eigene Situation.');
    expect(store.getSnapshot().tournaments.map((t) => t.handIds)).toEqual([[TEST_HAND_ID]]);
  });

  it('saves only in the writing tab and never in read-only mode; rating stays possible', async () => {
    const readOnly = await setup({ readOnly: true });
    await expect(readOnly.store.saveSituation(text(), 'A')).rejects.toThrow(LOCK_READ_ONLY);
    expect(readOnly.backend.dump()).toEqual({});
    const reader = await setup({ canWrite: () => false });
    await expect(reader.store.saveSituation(text(), 'A')).rejects.toThrow(LOCK_OTHER_TAB);
    expect(reader.backend.dump()).toEqual({});
    expect((await reader.store.rateHand(parseHand(text()))).decisions).toHaveLength(1);
  });

  it('keeps the name through export, merge and a new rating', async () => {
    const source = await setup();
    await source.store.saveSituation(text(), '72o UTG');
    const { part } = await source.store.exportPart();
    expect(part!.tournaments).toEqual([{ id: 'SIT-normal', name: 'Eigene Situationen', kind: 'normal' }]);
    expect(part!.hands).toEqual([{ id: TEST_HAND_ID, tournamentId: 'SIT-normal', raw: text(), name: '72o UTG' }]);

    const target = await setup();
    expect(await target.store.mergeExport(part!)).toMatchObject({ imported: 1 });
    const key = handKey(TEST_HAND_ID);
    expect(readHand(target.backend.dump()[key]).name).toBe('72o UTG');

    // Rated by an older analysis version: rated again in the background, the name stays.
    const tKey = tournamentKey('SIT-normal');
    const oldHand = { ...readHand(target.backend.dump()[key]), analysisVersion: 1, analysis: { version: 1, decisions: [] } };
    const oldTournament = { ...readTournament(target.backend.dump()[tKey]), analysisVersion: 1 };
    await target.backend.setMany([[key, JSON.stringify(oldHand)], [tKey, JSON.stringify(oldTournament)]]);
    const fresh = createReviewStore({ backend: target.backend, data: getPushFoldData(), canWrite: () => true, readOnly: false, pause: async () => {} });
    await fresh.load();
    await fresh.refreshStale();
    expect(readHand(target.backend.dump()[key])).toMatchObject({ name: '72o UTG', analysisVersion: ANALYSIS_VERSION });
    expect(readHand(target.backend.dump()[key]).analysis.decisions).toHaveLength(1);
  });
});
```

`src/situation/rating.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { getPushFoldData } from '../app/data';
import { type HeroDecision, analyzeHand } from '../review/analysis';
import bounty from '../review/fixtures/bounty.txt?raw';
import dailyClassic from '../review/fixtures/daily-classic.txt?raw';
import steps from '../review/fixtures/step-satellites.txt?raw';
import { parseHand, parseHistory } from '../review/parse';
import { detectTournamentKind } from '../review/tournament-kind';
import { playSituation, upToLastHeroAction } from './model';
import { TEST_PLAYED_AT, situationFromHand } from './test-situations';
import { situationText } from './text';

const data = getPushFoldData();

/** What the player sees of a decision: the model, the spot and the verdict (equities are Monte-Carlo numbers). */
function verdictOf(d: HeroDecision) {
  const r = d.rating;
  const base = { street: d.street, action: d.action };
  if (r.model === 'unrated') return { ...base, model: r.model, reason: r.reason };
  if (r.model === 'postflop') return { ...base, model: r.model, verdict: r.verdict, reason: r.reason, villain: r.villainPosition, role: r.villainRole };
  return { ...base, model: r.model, spot: r.spot, verdict: r.grade.verdict };
}

describe('rating a situation', () => {
  const fixtures = [dailyClassic, bounty, steps].flatMap((text) => parseHistory(text).hands);

  it('gives a real hand entered again the same verdicts as the imported hand', () => {
    let compared = 0;
    let decisions = 0;
    const models = new Set<string>();
    for (const hand of fixtures) {
      const situation = situationFromHand(hand, detectTournamentKind(hand.tournamentName));
      if (!situation) continue;
      const imported = analyzeHand(hand, data).decisions.map(verdictOf);
      const entered = analyzeHand(parseHand(situationText(situation, TEST_PLAYED_AT)), data).decisions.map(verdictOf);
      expect(entered).toEqual(imported);
      compared++;
      decisions += imported.length;
      for (const d of imported) models.add(d.model);
    }
    // All 9 fixture hands (5 to 8 players), 19 hero decisions with every kind of rating.
    expect(compared).toBe(9);
    expect(decisions).toBe(19);
    expect([...models].sort()).toEqual(['chart', 'postflop', 'pushfold', 'unrated']);
  });

  it('rates every decision the same, live (hand cut after it) and in the whole hand', () => {
    for (const hand of fixtures) {
      const situation = situationFromHand(hand);
      if (!situation) continue;
      const whole = analyzeHand(parseHand(situationText(situation, TEST_PLAYED_AT)), data).decisions;
      for (let n = 1; n <= situation.steps.length; n++) {
        const prefix = upToLastHeroAction({ setup: situation.setup, steps: situation.steps.slice(0, n) });
        if (!prefix) continue;
        const live = analyzeHand(parseHand(situationText(prefix, TEST_PLAYED_AT)), data).decisions;
        const last = live[live.length - 1];
        expect(last.eventIndex).toBe(playSituation(prefix).heroEvents.at(-1));
        expect(last).toEqual(whole.find((d) => d.eventIndex === last.eventIndex));
      }
    }
  });
});
```

`src/situation/test-situations.ts` anlegen:
```ts
import { parseCard } from '../engine/cards';
import { POSITIONS, type Position } from '../engine/positions';
import { positionsOf } from '../review/hand-model';
import { HERO, type ParsedHand } from '../review/parse';
import type { TournamentKind } from '../review/tournament-kind';
import { IllegalStepError, MAX_STACK_BB, MIN_STACK_BB, type Situation, type SituationStep, addStep, bbToChips, playSituation } from './model';

export const TEST_PLAYED_AT = '2026-10-14 18:05:09';
export const TEST_HAND_ID = 'SIT1760457909000';

export const sameStacks = (bb: number): Record<Position, number> =>
  Object.fromEntries(POSITIONS.map((p) => [p, bb])) as Record<Position, number>;

/** 72o open-raised from UTG with 40 BB, everybody folds: one preflop chart error ("falsch"), hero action = event 10. */
export function sevenTwoOpen(kind: TournamentKind = 'normal', handId = TEST_HAND_ID): Situation {
  const steps: SituationStep[] = [{ type: 'raise', to: bbToChips(2.2) }, ...Array.from({ length: 7 }, () => ({ type: 'fold' }) as const)];
  return { setup: { handId, kind, hero: 'UTG', heroCards: [parseCard('7c'), parseCard('2d')], stacks: sameStacks(40) }, steps };
}

const roundBb = (chips: number, bigBlind: number) => Math.min(MAX_STACK_BB, Math.max(MIN_STACK_BB, Math.round((chips / bigBlind) * 10) / 10));

/**
 * A GGPoker hand entered again through the situation model, the way a player would type it in: stacks and sizes in
 * BB rounded to 0.1, all-ins as all-ins, missing players as empty first seats. Null for hands the model cannot take
 * (no 8-max table, fewer than three players, no hero cards).
 */
export function situationFromHand(hand: ParsedHand, kind: TournamentKind = 'normal', handId = TEST_HAND_ID): Situation | null {
  const positions = positionsOf(hand);
  if (!positions || hand.tableSize !== 8 || hand.seats.length < 3 || !hand.heroCards) return null;
  const stacks = sameStacks(MIN_STACK_BB);
  for (const seat of hand.seats) stacks[positions.get(seat.name)!] = roundBb(seat.chips, hand.bigBlind);
  // positionsOf counts back from the button, so the missing players are always the first seats.
  const empty = Array.from({ length: 8 - hand.seats.length }, (): SituationStep => ({ type: 'empty' }));
  let situation: Situation = { setup: { handId, kind, hero: positions.get(HERO)!, heroCards: hand.heroCards, stacks }, steps: empty };
  for (const event of hand.events) {
    let step: SituationStep | null = null;
    if (event.type === 'board') step = { type: 'board', cards: event.cards };
    if (event.type === 'action') {
      if (event.action === 'bet' || event.action === 'raise') {
        const to = event.allIn ? Number.MAX_SAFE_INTEGER : bbToChips((event.to ?? event.amount) / hand.bigBlind);
        step = { type: event.action, to };
      } else step = { type: event.action };
    }
    if (!step) continue;
    const phase = playSituation(situation).phase;
    // After the hero folded the model stops; the rest of the hand does not change his decisions.
    if (phase.type === 'done') break;
    // The model must ask the same player GGPoker shows (stacks rounded to 0.1 BB could change who is all-in).
    if (event.type === 'action' && (phase.type !== 'act' || phase.legal.position !== positions.get(event.player))) return null;
    try {
      situation = addStep(situation, step);
    } catch (error) {
      if (!(error instanceof IllegalStepError) || (step.type !== 'bet' && step.type !== 'raise')) return null;
      // Rounded to 0.1 BB, a min-raise can end up just below the minimum: take the minimum.
      const range = phase.type === 'act' ? (phase.legal.bet ?? phase.legal.raise) : null;
      if (!range) return null;
      situation = addStep(situation, { type: step.type, to: range.min });
    }
  }
  return situation;
}
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/app/format.test.ts src/app/review-store.test.ts src/situation/rating.test.ts` → Expected: FAIL – „6 failed | 45 passed (51)“: in `review-store.test.ts` scheitern die 5 neuen Tests (`rateHand`/`saveSituation` fehlen), in `format.test.ts` der Hinweis-Test; `rating.test.ts` ist schon grün (Modell, Text und Analyse gibt es bereits – der Test hält die Gleichheit fest).

- [ ] **Step 3: Umsetzen**

In `src/app/format.ts` ersetzen:
```ts
import type { XpResult } from '../game/xp';
import type { ActionType as ReviewActionType, Street as ReviewStreet } from '../review/parse';

const evNumber = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
```
durch:
```ts
import type { XpResult } from '../game/xp';
import type { ActionType as ReviewActionType, Street as ReviewStreet } from '../review/parse';
import { SITUATION_HAND_PREFIX } from '../review/situation-tournaments';

const evNumber = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
```

In `src/app/format.ts` ersetzen:
```ts
}

/** Spec 10: where a retraining spot comes from, "2026-10-12 15:46:28" → „Aus deinem Turnier vom 12.10.“. */
export const retrainingHint = (playedAt: string): string => `Aus deinem Turnier vom ${playedAt.slice(8, 10)}.${playedAt.slice(5, 7)}.`;

/** „1 Spot aus deinen Turnieren wartet im Training.“ / „3 Spots … warten …“. */
```
durch:
```ts
}

/**
 * Spec 10: where a retraining spot comes from, "2026-10-12 15:46:28" → „Aus deinem Turnier vom 12.10.“; for a spot from
 * a saved situation (key "SIT…:<event>") „Aus deiner Situation vom 12.10.“.
 */
export const retrainingHint = (playedAt: string, key = ''): string =>
  `${key.startsWith(SITUATION_HAND_PREFIX) ? 'Aus deiner Situation' : 'Aus deinem Turnier'} vom ${playedAt.slice(8, 10)}.${playedAt.slice(5, 7)}.`;

/** „1 Spot aus deinen Turnieren wartet im Training.“ / „3 Spots … warten …“. */
```

In `src/app/review-store.ts` ersetzen:
```ts
import type { PushFoldData } from '../engine/pushfold-data';
import type { RetrainingCandidate } from '../game/retraining';
import { ANALYSIS_VERSION } from '../review/analysis';
import { type HandAnalyzer, createInlineAnalyzer } from '../review/analyzer';
import {
```
durch:
```ts
import type { PushFoldData } from '../engine/pushfold-data';
import type { RetrainingCandidate } from '../game/retraining';
import { ANALYSIS_VERSION, type HandAnalysis } from '../review/analysis';
import { type HandAnalyzer, createInlineAnalyzer } from '../review/analyzer';
import {
```

In `src/app/review-store.ts` ersetzen:
```ts
  type TournamentRecord,
  isHandAnalysis,
  loadArchiveIndex,
  loadHands,
```
durch:
```ts
  type TournamentRecord,
  isHandAnalysis,
  isHandName,
  loadArchiveIndex,
  loadHands,
```

In `src/app/review-store.ts` ersetzen:
```ts
import { HandParseError, type ParsedHand, type SkippedHand, parseHand } from '../review/parse';
import { retrainingCandidates } from '../review/retraining';
import type { TournamentKind } from '../review/tournament-kind';
```
durch:
```ts
import { HandParseError, type ParsedHand, type SkippedHand, parseHand } from '../review/parse';
import { retrainingCandidates } from '../review/retraining';
import { SITUATION_HAND_PREFIX, situationKindOf } from '../review/situation-tournaments';
import type { TournamentKind } from '../review/tournament-kind';
```

In `src/app/review-store.ts` ersetzen:
```ts
   */
  syncRetraining(): Promise<void>;
};

export const LOCK_READ_ONLY = 'Nur-Lesen-Modus: Bitte die App aktualisieren, um Hände zu importieren.';
```
durch:
```ts
   */
  syncRetraining(): Promise<void>;
  /** Rates one hand with the analyzer of the store (Web Worker with fallback) and writes nothing: the live rating of a situation. */
  rateHand(hand: ParsedHand): Promise<HandAnalysis>;
  /**
   * Saves an entered situation (its generated hand text) with a name into its situation tournament, the same way an
   * import does (rating, archive write, retraining queue). Writing tab only; throws a German message otherwise.
   */
  saveSituation(raw: string, name: string): Promise<TournamentRecord>;
};

export const SITUATION_SAVED_ALREADY = 'Diese Situation ist schon gespeichert.';
export const SITUATION_NAME_INVALID = 'Bitte gib einen Namen mit höchstens 60 Zeichen ein.';

export const LOCK_READ_ONLY = 'Nur-Lesen-Modus: Bitte die App aktualisieren, um Hände zu importieren.';
```

In `src/app/review-store.ts` ersetzen:
```ts
    fileSkipped: readonly SkippedHand[],
    kinds: ReadonlyMap<string, TournamentKind> = new Map(),
  ): Promise<ImportSummary> {
    assertWritable();
```
durch:
```ts
    fileSkipped: readonly SkippedHand[],
    kinds: ReadonlyMap<string, TournamentKind> = new Map(),
    names: ReadonlyMap<string, string> = new Map(),
  ): Promise<ImportSummary> {
    assertWritable();
```

In `src/app/review-store.ts` ersetzen:
```ts
      const failures: string[] = [];
      for (const [id, items] of analyzed) {
        const added = items.map((item) => handRecordOf(item));
        try {
          // Load, merge and write in one serial step, so a background re-rating never interleaves with it.
```
durch:
```ts
      const failures: string[] = [];
      for (const [id, items] of analyzed) {
        const added = items.map((item) => handRecordOf(item, names.get(item.hand.id)));
        try {
          // Load, merge and write in one serial step, so a background re-rating never interleaves with it.
```

In `src/app/review-store.ts` ersetzen:
```ts
        const { hands, problems } = await loadHands(backend, t.handIds);
        omitted += problems.length;
        for (const h of hands) part.hands.push({ id: h.id, tournamentId: h.tournamentId, raw: h.raw });
      }
      return { part, omitted };
```
durch:
```ts
        const { hands, problems } = await loadHands(backend, t.handIds);
        omitted += problems.length;
        for (const h of hands) part.hands.push({ id: h.id, tournamentId: h.tournamentId, raw: h.raw, ...(h.name === undefined ? {} : { name: h.name }) });
      }
      return { part, omitted };
```

In `src/app/review-store.ts` ersetzen:
```ts
      const kinds = new Map(part.tournaments.map((t) => [t.id, t.kind] as const));
      const texts = part.hands.map((h) => ({ name: 'Export', text: h.raw }));
      return importTexts(texts, [], kinds);
    },
    async syncRetraining() {
```
durch:
```ts
      const kinds = new Map(part.tournaments.map((t) => [t.id, t.kind] as const));
      const texts = part.hands.map((h) => ({ name: 'Export', text: h.raw }));
      const names = new Map(part.hands.flatMap((h) => (h.name === undefined ? [] : [[h.id, h.name] as const])));
      return importTexts(texts, [], kinds, names);
    },
    async syncRetraining() {
```

In `src/app/review-store.ts` ersetzen:
```ts
      }
    },
  };
  return store;
```
durch:
```ts
      }
    },
    async rateHand(hand) {
      const [analysis] = await analyzer.analyze([hand]);
      return analysis;
    },
    async saveSituation(raw, name) {
      const trimmed = name.trim();
      if (!isHandName(trimmed)) throw new Error(SITUATION_NAME_INVALID);
      let hand: ParsedHand;
      try {
        hand = parseHand(raw);
      } catch (error) {
        if (!(error instanceof HandParseError)) throw error;
        throw new Error(`Diese Situation kann ich nicht speichern: ${error.message}`);
      }
      if (!hand.id.startsWith(SITUATION_HAND_PREFIX) || situationKindOf(hand.tournamentId) === null) throw new Error('Das ist keine eigene Situation.');
      // The same path as an import: rating, one archive write per tournament, retraining queue.
      const summary = await importTexts([{ name: 'Situation', text: raw }], [], new Map(), new Map([[hand.id, trimmed]]));
      if (summary.duplicates > 0) throw new Error(SITUATION_SAVED_ALREADY);
      if (summary.failures) throw new Error(summary.failures[0]);
      const saved = snapshot.tournaments.find((t) => t.id === hand.tournamentId);
      if (summary.imported !== 1 || !saved) throw new Error('Diese Situation kann ich nicht speichern.');
      return saved;
    },
  };
  return store;
```

In `src/ui/components/RetrainingHint.tsx` ersetzen:
```tsx
  return (
    <p className="retraining-hint" role="note">
      {retrainingHint(origin.playedAt)}
    </p>
  );
```
durch:
```tsx
  return (
    <p className="retraining-hint" role="note">
      {retrainingHint(origin.playedAt, origin.key)}
    </p>
  );
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/app/format.test.ts src/app/review-store.test.ts src/situation/rating.test.ts` → Expected: PASS (3 Dateien, 51 Tests)

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → Expected: alle PASS (766 Tests). Run: `npm run typecheck` → Expected: Exit 0. Run: `npm run check:portability` → Expected: `check-portability: clean`.

```bash
git add src/app/format.test.ts src/app/format.ts src/app/review-store.test.ts src/app/review-store.ts src/situation/rating.test.ts src/situation/test-situations.ts src/ui/components/RetrainingHint.tsx
git commit -m "feat(review): Situationen bewerten und wie einen Import speichern (Archiv, Nachtraining, Neubewertung), Name reist mit dem Export" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Bausteine der Oberfläche: Kartenwähler, Aktions-Buttons mit Größen, GGPoker-Hinweis

**Files:**
- Create: `src/ui/components/CardPicker.css`, `src/ui/components/CardPicker.test.tsx`, `src/ui/components/CardPicker.tsx`, `src/ui/components/RtaNotice.test.tsx`, `src/ui/components/RtaNotice.tsx`, `src/ui/situation-view.test.ts`, `src/ui/situation-view.ts`
- Modify: `src/ui/components/PlayingCard.tsx`
- Test: `src/ui/components/CardPicker.test.tsx`, `src/ui/components/RtaNotice.test.tsx`, `src/ui/situation-view.test.ts`

**Interfaces:**
- Consumes: `Choice` aus `src/ui/components/ActionBar.tsx`; `describeEvent` aus `src/ui/replay-model.ts`; `formatBb`, `formatChipsBb`, `streetLabel`; `cardLabel` aus `PlayingCard.tsx`; Modell (Task 2)
- Produces:
  - `src/ui/components/PlayingCard.tsx`: `export const SUIT_SYMBOLS`
  - `src/ui/components/CardPicker.tsx`: `CardPicker({ label: string; selected: readonly Card[]; used: ReadonlySet<Card>; max: number; onChange: (cards: Card[]) => void })`
  - `src/ui/components/RtaNotice.tsx`: `RTA_NOTICE_TEXT`, `RTA_NOTICE_KEY = 'poker-trainer:situation-rta-notice'`, `RtaNotice({ storage?: Pick<Storage, 'getItem' | 'setItem'> | null })`
  - `src/ui/situation-view.ts`: `type SituationChoice = 'empty' | 'fold' | 'check' | 'call' | 'size' | 'allIn'`, `parseBbInput(text: string): number | null`, `sizeOf(legal: LegalActions, input: string): number | null`, `situationChoices(legal: LegalActions, size: number | null): Choice<SituationChoice>[]`, `stepOf(choice: SituationChoice, legal: LegalActions, size: number | null): SituationStep`, `lastEventText(state: SituationState): string`, `promptText(state: SituationState): string`, `defaultSituationName(setup: SituationSetup): string`

- [ ] **Step 1: Failing Tests schreiben**

`src/ui/components/CardPicker.test.tsx` anlegen:
```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { type Card, parseCard } from '../../engine/cards';
import { CardPicker } from './CardPicker';

function Picker({ max, used = [] }: { max: number; used?: Card[] }) {
  const [cards, setCards] = useState<Card[]>([]);
  return (
    <>
      <CardPicker label="Deine Karten" selected={cards} used={new Set(used)} max={max} onChange={setCards} />
      <output>{cards.join(',')}</output>
    </>
  );
}

describe('CardPicker', () => {
  it('shows all 52 cards and locks the cards in use', () => {
    render(<Picker max={2} used={[parseCard('Ah')]} />);
    const group = screen.getByRole('group', { name: 'Deine Karten' });
    expect(group.querySelectorAll('button')).toHaveLength(52);
    expect((screen.getByRole('button', { name: 'Herz Ass' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Pik Ass' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('picks, unpicks and replaces the last card when full', () => {
    render(<Picker max={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pik Ass' }));
    fireEvent.click(screen.getByRole('button', { name: 'Karo König' }));
    expect(screen.getByRole('status').textContent).toBe(`${parseCard('As')},${parseCard('Kd')}`);
    expect(screen.getByRole('button', { name: 'Pik Ass' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Kreuz 2' }));
    expect(screen.getByRole('status').textContent).toBe(`${parseCard('As')},${parseCard('2c')}`);
    fireEvent.click(screen.getByRole('button', { name: 'Pik Ass' }));
    expect(screen.getByRole('status').textContent).toBe(`${parseCard('2c')}`);
  });
});
```

`src/ui/components/RtaNotice.test.tsx` anlegen:
```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RTA_NOTICE_KEY, RTA_NOTICE_TEXT, RtaNotice } from './RtaNotice';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('RtaNotice', () => {
  it('shows the GGPoker hint until it is dismissed, then never again', () => {
    const storage = memoryStorage();
    const first = render(<RtaNotice storage={storage} />);
    expect(screen.getByRole('note').textContent).toContain(RTA_NOTICE_TEXT);
    fireEvent.click(screen.getByRole('button', { name: 'Verstanden' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(storage.data.get(RTA_NOTICE_KEY)).toBe('1');
    first.unmount();
    render(<RtaNotice storage={storage} />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('still works when the browser blocks the storage', () => {
    const blocked = {
      getItem: (): string | null => {
        throw new Error('blockiert');
      },
      setItem: () => {
        throw new Error('blockiert');
      },
    };
    const first = render(<RtaNotice storage={blocked} />);
    fireEvent.click(screen.getByRole('button', { name: 'Verstanden' }));
    expect(screen.queryByRole('note')).toBeNull();
    first.unmount();
    render(<RtaNotice storage={null} />);
    expect(screen.getByRole('note')).toBeTruthy();
  });
});
```

`src/ui/situation-view.test.ts` anlegen:
```ts
import { describe, expect, it } from 'vitest';
import { parseCard } from '../engine/cards';
import { type LegalActions, type Situation, type SituationStep, addStep, bbToChips, playSituation } from '../situation/model';
import { sameStacks } from '../situation/test-situations';
import { defaultSituationName, lastEventText, parseBbInput, promptText, situationChoices, sizeOf, stepOf } from './situation-view';

const start: Situation = {
  setup: { handId: 'SIT1', kind: 'normal', hero: 'CO', heroCards: [parseCard('Ah'), parseCard('Kd')], stacks: sameStacks(25) },
  steps: [],
};
const legalOf = (s: Situation): LegalActions => {
  const { phase } = playSituation(s);
  if (phase.type !== 'act') throw new Error(phase.type);
  return phase.legal;
};
const play = (...steps: SituationStep[]) => steps.reduce(addStep, start);
const folds = (n: number): SituationStep[] => Array.from({ length: n }, () => ({ type: 'fold' }));

describe('situation view helpers', () => {
  it('reads BB with a comma or a point and at most one decimal', () => {
    expect(parseBbInput('2,5')).toBe(2.5);
    expect(parseBbInput(' 12.5 ')).toBe(12.5);
    expect(parseBbInput('7')).toBe(7);
    for (const text of ['', 'abc', '2,55', '-3', '1e3']) expect(parseBbInput(text)).toBeNull();
  });

  it('keeps a size between the minimum and the all-in and falls back to the suggested size', () => {
    const legal = legalOf(start);
    expect(sizeOf(legal, '3')).toBe(bbToChips(3));
    expect(sizeOf(legal, '1,5')).toBe(bbToChips(2));
    expect(sizeOf(legal, '500')).toBe(19900);
    expect(sizeOf(legal, '')).toBe(bbToChips(2.2));
    expect(sizeOf(legalOf(play({ type: 'raise', to: 999_999 })), '3')).toBeNull();
  });

  it('offers the possible actions with their sizes', () => {
    const legal = legalOf(start);
    expect(situationChoices(legal, sizeOf(legal, '')).map((c) => c.label)).toEqual([
      'Platz leer',
      'Fold',
      'Call 1 BB',
      'Raise auf 2,2 BB',
      'All-in 24,9 BB',
    ]);
    expect(situationChoices(legal, 19900).map((c) => c.label)).toEqual(['Platz leer', 'Fold', 'Call 1 BB', 'All-in 24,9 BB']);
    const shove = legalOf(play({ type: 'raise', to: 999_999 }));
    expect(situationChoices(shove, null).map((c) => c.label)).toEqual(['Fold', 'Call 24,9 BB · All-in']);
    const flop = addStep(play(...folds(4), { type: 'call' }, ...folds(2), { type: 'check' }), {
      type: 'board',
      cards: [parseCard('2c'), parseCard('7d'), parseCard('9h')],
    });
    const bb = legalOf(flop);
    expect(situationChoices(bb, sizeOf(bb, '')).map((c) => c.label)).toEqual(['Check', 'Bet 1,8 BB', 'All-in 23,9 BB']);
  });

  it('turns a button into the step of the model', () => {
    const legal = legalOf(start);
    expect(stepOf('fold', legal, null)).toEqual({ type: 'fold' });
    expect(stepOf('size', legal, 2400)).toEqual({ type: 'raise', to: 2400 });
    expect(stepOf('allIn', legal, 2400)).toEqual({ type: 'raise', to: 19900 });
    expect(stepOf('empty', legal, null)).toEqual({ type: 'empty' });
  });

  it('describes the table and what comes next', () => {
    expect(lastEventText(playSituation(start))).toBe('Karten verteilt');
    expect(promptText(playSituation(start))).toBe('UTG ist dran');
    const raised = play({ type: 'raise', to: bbToChips(2.2) }, ...folds(3));
    expect(lastEventText(playSituation(raised))).toBe('HJ: Fold');
    expect(promptText(playSituation(raised))).toBe('Du bist dran');
    const flop = play(...folds(4), { type: 'raise', to: bbToChips(2.2) }, ...folds(2), { type: 'call' });
    expect(promptText(playSituation(flop))).toBe('Flop: drei Karten wählen');
    expect(promptText(playSituation(addStep(flop, { type: 'board', cards: [0, 1, 2] })))).toBe('BB ist dran');
    const won = play(...folds(4), { type: 'raise', to: bbToChips(2.2) }, ...folds(3));
    expect(promptText(playSituation(won))).toBe('Alle anderen haben gefoldet – du gewinnst den Pot');
    expect(promptText(playSituation(play(...folds(5))))).toBe('Du hast gefoldet – die Hand ist für dich vorbei');
  });

  it('suggests a name like „AKo UTG · 25 BB“', () => {
    expect(defaultSituationName({ ...start.setup, hero: 'UTG' })).toBe('AKo UTG · 25 BB');
    expect(defaultSituationName({ ...start.setup, hero: 'UTG1', heroCards: [parseCard('9s'), parseCard('9h')], stacks: sameStacks(12.5) })).toBe(
      '99 UTG+1 · 12,5 BB',
    );
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/ui/components/CardPicker.test.tsx src/ui/components/RtaNotice.test.tsx src/ui/situation-view.test.ts` → Expected: FAIL – alle drei Dateien laden nicht (`Cannot find module`), „3 failed (3)“.

- [ ] **Step 3: Umsetzen**

`src/ui/components/CardPicker.css` anlegen:
```css
.card-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-picker__suit {
  display: grid;
  grid-template-columns: repeat(13, minmax(0, 1fr));
  gap: 4px;
}

.card-picker__card {
  appearance: none;
  min-height: 44px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 6px;
  background: #ffffff;
  color: var(--card-black);
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.card-picker__card--red {
  color: var(--card-red);
}

.card-picker__card--picked {
  border-color: var(--gold);
  box-shadow: 0 0 0 2px var(--gold);
}

.card-picker__card:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.card-picker__card[disabled] {
  opacity: 0.25;
  cursor: not-allowed;
}

/* Phones: each suit in two rows of seven, so every card keeps a tappable width. */
@media (max-width: 600px) {
  .card-picker__suit {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
}
```

`src/ui/components/CardPicker.tsx` anlegen:
```tsx
import { type Card, RANKS } from '../../engine/cards';
import { SUIT_SYMBOLS, cardLabel } from './PlayingCard';
import './CardPicker.css';

/** Spades, hearts, diamonds, clubs; ranks from the ace down. */
const SUITS_SHOWN = [3, 2, 1, 0];
const RANKS_SHOWN = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

type Props = {
  label: string;
  /** Picked cards, in picking order. */
  selected: readonly Card[];
  /** Cards that are already in use elsewhere (hero cards, board, shown cards): not pickable. */
  used: ReadonlySet<Card>;
  max: number;
  onChange: (cards: Card[]) => void;
};

/**
 * Spec 3: 13 ranks × 4 suits. A tap picks or unpicks a card; with `max` cards picked, a new tap replaces the last one.
 */
export function CardPicker({ label, selected, used, max, onChange }: Props) {
  const toggle = (card: Card) => {
    if (selected.includes(card)) onChange(selected.filter((c) => c !== card));
    else if (selected.length < max) onChange([...selected, card]);
    else onChange([...selected.slice(0, max - 1), card]);
  };
  return (
    <div className="card-picker" role="group" aria-label={label}>
      {SUITS_SHOWN.map((suit) => (
        <div key={suit} className="card-picker__suit">
          {RANKS_SHOWN.map((rank) => {
            const card = rank * 4 + suit;
            const picked = selected.includes(card);
            const red = suit === 1 || suit === 2;
            return (
              <button
                key={card}
                type="button"
                className={`card-picker__card${red ? ' card-picker__card--red' : ''}${picked ? ' card-picker__card--picked' : ''}`}
                aria-label={cardLabel(card)}
                aria-pressed={picked}
                disabled={used.has(card) && !picked}
                onClick={() => toggle(card)}
              >
                {RANKS[rank] === 'T' ? '10' : RANKS[rank]}
                <span aria-hidden="true">{SUIT_SYMBOLS[suit]}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

In `src/ui/components/PlayingCard.tsx` ersetzen:
```tsx
import './PlayingCard.css';

const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
const SUIT_NAMES = ['Kreuz', 'Karo', 'Herz', 'Pik'];
const RANK_NAMES: Record<string, string> = { A: 'Ass', K: 'König', Q: 'Dame', J: 'Bube', T: 'Zehn' };
```
durch:
```tsx
import './PlayingCard.css';

export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
const SUIT_NAMES = ['Kreuz', 'Karo', 'Herz', 'Pik'];
const RANK_NAMES: Record<string, string> = { A: 'Ass', K: 'König', Q: 'Dame', J: 'Bube', T: 'Zehn' };
```

`src/ui/components/RtaNotice.tsx` anlegen:
```tsx
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
```

`src/ui/situation-view.ts` anlegen:
```ts
import { formatBb, formatChipsBb, streetLabel } from '../app/format';
import { handClassOf, handName } from '../engine/cards';
import { POSITION_LABELS } from '../engine/positions';
import {
  CHIPS_PER_BB,
  CHIPS_PER_STEP,
  type LegalActions,
  type SituationSetup,
  type SituationState,
  type SituationStep,
} from '../situation/model';
import type { Choice } from './components/ActionBar';
import { describeEvent } from './replay-model';

export type SituationChoice = 'empty' | 'fold' | 'check' | 'call' | 'size' | 'allIn';

const bb = (chips: number): string => `${formatChipsBb(chips, CHIPS_PER_BB)} BB`;

/** "25", "25,5" or "25.5" → 25.5; null for anything else (at most one decimal). */
export function parseBbInput(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  return /^\d+(\.\d)?$/.test(normalized) ? Number(normalized) : null;
}

/**
 * The bet or raise (street total, chips) the size field asks for, clamped into the allowed range: below the minimum
 * becomes the minimum, above the stack the all-in. An empty or unreadable field uses the suggested size.
 */
export function sizeOf(legal: LegalActions, input: string): number | null {
  const range = legal.bet ?? legal.raise;
  if (!range) return null;
  const value = parseBbInput(input);
  const chips = value === null ? (legal.suggested ?? range.min) : Math.round(value * 10) * CHIPS_PER_STEP;
  return Math.min(range.max, Math.max(range.min, chips));
}

/** The buttons for the player to act, in the style of the training (keyboard shortcut first). */
export function situationChoices(legal: LegalActions, size: number | null): Choice<SituationChoice>[] {
  const choices: Choice<SituationChoice>[] = [];
  if (legal.empty) choices.push({ action: 'empty', label: 'Platz leer', keys: ['l'] });
  if (legal.fold) choices.push({ action: 'fold', label: 'Fold', keys: ['f'] });
  if (legal.check) choices.push({ action: 'check', label: 'Check', keys: ['k', 'c'] });
  if (legal.call) choices.push({ action: 'call', label: `Call ${bb(legal.call.amount)}${legal.call.allIn ? ' · All-in' : ''}`, keys: ['c'] });
  const range = legal.bet ?? legal.raise;
  if (range && size !== null) {
    if (size < range.max) choices.push({ action: 'size', label: legal.bet ? `Bet ${bb(size)}` : `Raise auf ${bb(size)}`, keys: ['r', 'b'], primary: true });
    choices.push({ action: 'allIn', label: `All-in ${bb(range.max)}`, keys: ['a'], primary: size >= range.max });
  }
  return choices;
}

export function stepOf(choice: SituationChoice, legal: LegalActions, size: number | null): SituationStep {
  const type = legal.bet ? 'bet' : 'raise';
  const range = legal.bet ?? legal.raise;
  switch (choice) {
    case 'empty':
    case 'fold':
    case 'check':
    case 'call':
      return { type: choice };
    case 'size':
      return { type, to: size ?? range!.min };
    case 'allIn':
      return { type, to: range!.max };
  }
}

/** What the table shows in the middle: the last thing that happened. */
export function lastEventText(state: SituationState): string {
  const i = state.events.length - 1;
  const event = state.events[i];
  if (!event || event.type === 'ante' || event.type === 'smallBlind' || event.type === 'bigBlind') return 'Karten verteilt';
  return describeEvent(event, state.states[i], CHIPS_PER_BB);
}

/** What the input asks for next. */
export function promptText(state: SituationState): string {
  const { phase } = state;
  if (phase.type === 'act') return phase.legal.isHero ? 'Du bist dran' : `${POSITION_LABELS[phase.legal.position]} ist dran`;
  if (phase.type === 'board') {
    const what = phase.count === 3 ? 'drei Karten' : 'eine Karte';
    return `${streetLabel(phase.street)}: ${what} wählen${phase.optional ? ' (optional, alle sind all-in)' : ''}`;
  }
  if (phase.reason === 'heroFolded') return 'Du hast gefoldet – die Hand ist für dich vorbei';
  if (phase.reason === 'folded') {
    const winner = state.table.players.find((p) => !p.folded)!;
    return winner.isHero ? 'Alle anderen haben gefoldet – du gewinnst den Pot' : `${POSITION_LABELS[winner.position!]} gewinnt den Pot`;
  }
  return 'Showdown – die Hand ist zu Ende';
}

/** Spec 3: the suggested name, e.g. „AKo UTG · 25 BB“. */
export const defaultSituationName = (setup: SituationSetup): string =>
  `${handName(handClassOf(setup.heroCards[0], setup.heroCards[1]))} ${POSITION_LABELS[setup.hero]} · ${formatBb(setup.stacks[setup.hero])} BB`;
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/ui/components/CardPicker.test.tsx src/ui/components/RtaNotice.test.tsx src/ui/situation-view.test.ts` → Expected: PASS (10 Tests)

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → Expected: alle PASS (776 Tests). Run: `npm run typecheck` → Expected: Exit 0. Run: `npm run check:portability` → Expected: `check-portability: clean`.

```bash
git add src/ui/components/CardPicker.css src/ui/components/CardPicker.test.tsx src/ui/components/CardPicker.tsx src/ui/components/PlayingCard.tsx src/ui/components/RtaNotice.test.tsx src/ui/components/RtaNotice.tsx src/ui/situation-view.test.ts src/ui/situation-view.ts
git commit -m "feat(ui): Kartenwähler, Aktions-Buttons mit änderbarer Größe und einmaliger GGPoker-Hinweis für die Situations-Analyse" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Bildschirm „Situation analysieren“: Grunddaten, Eingabe Schritt für Schritt, Live-Bewertung

**Files:**
- Create: `src/ui/screens/SituationScreen.test.tsx`, `src/ui/screens/SituationScreen.tsx`, `src/ui/screens/situation.css`, `src/ui/useSituationRating.ts`
- Test: `src/ui/screens/SituationScreen.test.tsx`

**Interfaces:**
- Consumes: Task 2, 3, 5; `ReviewStore.rateHand` (Task 4); `TableView` aus `PokerTable.tsx`, `replayTableModel`, `ChoiceBar`, `FilterGroup`, `TrainingLayout`, `ReviewDecisionPanel`, `useReviewStore`; `renderWithStore` (Tests)
- Produces:
  - `src/ui/useSituationRating.ts`: `type SituationRating = { status: 'none' | 'pending' | 'failed' } | { status: 'ready'; analysis: HandAnalysis }`, `useSituationRating(store: ReviewStore, situation: Situation | null, playedAt: string, whole?: boolean): SituationRating`
  - `src/ui/screens/SituationScreen.tsx`: `SituationScreen({ onBack: () => void; now?: () => Date })` (Task 7 ergänzt `onReview`)
  - `src/ui/screens/situation.css`: Klassen `situation-setup`, `situation-field`, `situation-stacks`, `situation-size`, `situation-board`, `situation-nav`, `situation-summary`, `situation-decisions`

- [ ] **Step 1: Failing Tests schreiben**

`src/ui/screens/SituationScreen.test.tsx` anlegen:
```tsx
// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RTA_NOTICE_KEY } from '../components/RtaNotice';
import { renderWithStore } from '../test-utils';
import { SituationScreen } from './SituationScreen';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const now = () => new Date(2026, 9, 14, 18, 5, 9);
// The rating runs asynchronously; under a full parallel test run it can take longer than the default second.
const SLOW = { timeout: 10_000 };
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const click = (name: string | RegExp) => fireEvent.click(button(name));
const info = () => screen.getByText(/^Du sitzt im /).textContent;

function pickCards(group: string, ...names: string[]) {
  const picker = screen.getByRole('group', { name: group });
  for (const name of names) fireEvent.click(within(picker).getByRole('button', { name }));
}

async function startSituation(options: { position?: string; stack?: string; cards?: string[]; readOnly?: boolean } = {}) {
  window.localStorage.setItem(RTA_NOTICE_KEY, '1');
  const utils = renderWithStore(<SituationScreen onBack={() => {}} now={now} />, { info: { readOnly: options.readOnly ?? false } });
  await act(() => utils.loaded);
  fireEvent.change(screen.getByLabelText('Dein Stack (BB)'), { target: { value: options.stack ?? '40' } });
  fireEvent.click(within(screen.getByRole('group', { name: 'Deine Position' })).getByRole('button', { name: options.position ?? 'UTG' }));
  pickCards('Deine Karten', ...(options.cards ?? ['Kreuz 7', 'Karo 2']));
  click('Weiter');
  return utils;
}

describe('SituationScreen: hint and setup', () => {
  it('shows the GGPoker hint once and never touches the save for it', async () => {
    const first = renderWithStore(<SituationScreen onBack={() => {}} now={now} />);
    await act(() => first.loaded);
    expect(screen.getByRole('note').textContent).toContain('Hilfsmittel während laufender Hände sind bei GGPoker verboten');
    click('Verstanden');
    expect(screen.queryByRole('note')).toBeNull();
    first.unmount();
    const second = renderWithStore(<SituationScreen onBack={() => {}} now={now} />);
    await act(() => second.loaded);
    expect(screen.queryByRole('note')).toBeNull();
    expect(first.save).not.toHaveBeenCalled();
    expect(second.save).not.toHaveBeenCalled();
  });

  it('starts only with two cards and valid stacks', async () => {
    const { loaded } = renderWithStore(<SituationScreen onBack={() => {}} now={now} />);
    await act(() => loaded);
    expect((button('Weiter') as HTMLButtonElement).disabled).toBe(true);
    pickCards('Deine Karten', 'Pik Ass', 'Herz König');
    expect((button('Weiter') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Dein Stack (BB)'), { target: { value: '0,5' } });
    expect((button('Weiter') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Stacks von 1 bis 200 BB, Schrittweite 0,1/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Dein Stack (BB)'), { target: { value: '12,5' } });
    click('Gegner-Stacks anpassen');
    fireEvent.change(screen.getByLabelText('BTN'), { target: { value: '300' } });
    expect((button('Weiter') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('BTN'), { target: { value: '8' } });
    click('Weiter');
    expect(screen.getByTestId('seat-BTN').textContent).toContain('Stack 7,9');
    expect(screen.getByTestId('seat-UTG').textContent).toContain('Stack 12,4');
  });
});

describe('SituationScreen: input and live rating', () => {
  it('rates the hero decision right away, asks the others in order and takes steps back', async () => {
    await startSituation();
    expect(info()).toBe('Du sitzt im UTG · Du bist dran');
    click(/^Raise auf 2,2 BB/);
    expect(await screen.findByRole('heading', { name: 'Falsch' }, SLOW)).toBeTruthy();
    expect(info()).toBe('Du sitzt im UTG · UTG+1 ist dran');
    for (let i = 0; i < 7; i++) click(/^Fold/);
    expect(info()).toBe('Du sitzt im UTG · Alle anderen haben gefoldet – du gewinnst den Pot');
    click('← Zurück');
    expect(info()).toBe('Du sitzt im UTG · BB ist dran');
    for (let i = 0; i < 7; i++) click('← Zurück');
    expect(info()).toBe('Du sitzt im UTG · Du bist dran');
    expect(screen.getByText('Deine Auswertung erscheint hier, sobald du dich entschieden hast.')).toBeTruthy();
    click('← Zurück');
    expect(screen.getByRole('region', { name: 'Grunddaten' })).toBeTruthy();
  });

  it('offers an empty seat only at the start and locks used cards on the board', async () => {
    await startSituation({ position: 'CO', cards: ['Herz Ass', 'Karo König'] });
    expect(info()).toBe('Du sitzt im CO · UTG ist dran');
    click(/^Platz leer/);
    expect(screen.queryByTestId('seat-UTG')).toBeNull();
    expect(info()).toBe('Du sitzt im CO · UTG+1 ist dran');
    click(/^Fold/);
    expect(screen.queryByRole('button', { name: /^Platz leer/ })).toBeNull();
    click(/^Fold/);
    click(/^Fold/);
    click(/^Raise auf 2,2 BB/);
    click(/^Fold/);
    click(/^Fold/);
    click(/^Call/);
    expect(info()).toBe('Du sitzt im CO · Flop: drei Karten wählen');
    const flop = screen.getByRole('group', { name: 'Flop-Karten' });
    expect((within(flop).getByRole('button', { name: 'Herz Ass' }) as HTMLButtonElement).disabled).toBe(true);
    expect((button('Flop übernehmen') as HTMLButtonElement).disabled).toBe(true);
    pickCards('Flop-Karten', 'Pik 9', 'Kreuz 5', 'Karo 2');
    click('Flop übernehmen');
    expect(screen.getAllByRole('img', { name: /^(Pik 9|Kreuz 5|Karo 2)$/ })).toHaveLength(3);
    expect(info()).toBe('Du sitzt im CO · BB ist dran');
  });

  it('lets the bet size be changed and turns a size above the stack into the all-in', async () => {
    await startSituation();
    fireEvent.change(screen.getByLabelText(/^Raise auf \(BB\)/), { target: { value: '3' } });
    expect(button(/^Raise auf 3 BB/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Raise auf \(BB\)/), { target: { value: '1' } });
    expect(button(/^Raise auf 2 BB/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Raise auf \(BB\)/), { target: { value: '500' } });
    expect(screen.queryByRole('button', { name: /^Raise auf/ })).toBeNull();
    click(/^All-in 39,9 BB/);
    expect(screen.getByTestId('seat-UTG').textContent).toContain('All-in 39,9 BB');
  });

  it('says so when a situation cannot be rated, without breaking the input', async () => {
    const { review } = await startSituation();
    vi.spyOn(review, 'rateHand').mockRejectedValue(new Error('kaputt'));
    click(/^Raise auf 2,2 BB/);
    expect(await screen.findByText('Diese Situation kann ich nicht bewerten.', {}, SLOW)).toBeTruthy();
    expect(info()).toBe('Du sitzt im UTG · UTG+1 ist dran');
  });

  it('analyses in read-only mode, too', async () => {
    const { save } = await startSituation({ readOnly: true });
    click(/^Raise auf 2,2 BB/);
    expect(await screen.findByRole('heading', { name: 'Falsch' }, SLOW)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/ui/screens/SituationScreen.test.tsx` → Expected: FAIL – `Failed to resolve import "./SituationScreen"` („1 failed (1)“, no tests).

- [ ] **Step 3: Umsetzen**

`src/ui/screens/SituationScreen.tsx` anlegen:
```tsx
import { useCallback, useMemo, useState } from 'react';
import { formatBb, streetLabel } from '../../app/format';
import type { Card } from '../../engine/cards';
import { POSITIONS, POSITION_LABELS, type Position } from '../../engine/positions';
import { TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, type TournamentKind } from '../../review/tournament-kind';
import {
  CHIPS_PER_BB,
  type Situation,
  type SituationSetup,
  type SituationState,
  type SituationStep,
  addStep,
  chipsToBb,
  isStackBb,
  playSituation,
  undoStep,
} from '../../situation/model';
import { playedAtOf } from '../../situation/text';
import { ChoiceBar } from '../components/ActionBar';
import { CardPicker } from '../components/CardPicker';
import { FilterGroup, type Option } from '../components/FilterGroup';
import { TableView } from '../components/PokerTable';
import { ReviewDecisionPanel } from '../components/ReviewDecisionPanel';
import { RtaNotice } from '../components/RtaNotice';
import { TrainingLayout } from '../components/TrainingLayout';
import { replayTableModel } from '../replay-model';
import { useReviewStore } from '../ReviewContext';
import { type SituationChoice, lastEventText, parseBbInput, promptText, situationChoices, sizeOf, stepOf } from '../situation-view';
import { type SituationRating, useSituationRating } from '../useSituationRating';
import './screens.css';
import './situation.css';

const POSITION_OPTIONS: Option<Position>[] = POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] }));
const KIND_OPTIONS: Option<TournamentKind>[] = TOURNAMENT_KINDS.map((k) => ({ value: k, label: TOURNAMENT_KIND_LABELS[k] }));
const STACK_RULE = 'Stacks von 1 bis 200 BB, Schrittweite 0,1';
const defaultNow = () => new Date();

type Draft = {
  stack: string;
  /** Null: every opponent has the hero's stack. */
  others: Record<Position, string> | null;
  hero: Position;
  cards: Card[];
  kind: TournamentKind;
};
const START_DRAFT: Draft = { stack: '25', others: null, hero: 'UTG', cards: [], kind: 'normal' };

/** The setup from the form, or null while something is missing or out of range. */
function setupOf(draft: Draft, handId: string): SituationSetup | null {
  const own = parseBbInput(draft.stack);
  if (own === null || !isStackBb(own) || draft.cards.length !== 2) return null;
  const stacks = {} as Record<Position, number>;
  for (const p of POSITIONS) {
    const value = p === draft.hero || draft.others === null ? own : parseBbInput(draft.others[p]);
    if (value === null || !isStackBb(value)) return null;
    stacks[p] = value;
  }
  return { handId, kind: draft.kind, hero: draft.hero, heroCards: [draft.cards[0], draft.cards[1]], stacks };
}

function SetupForm({ draft, onChange, onStart }: { draft: Draft; onChange: (draft: Draft) => void; onStart: () => void }) {
  const ready = setupOf(draft, 'SIT0') !== null;
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const toggleOthers = () =>
    set({ others: draft.others ? null : (Object.fromEntries(POSITIONS.map((p) => [p, draft.stack])) as Record<Position, string>) });
  return (
    <section className="panel situation-setup" aria-label="Grunddaten">
      <label className="situation-field">
        Dein Stack (BB)
        <input inputMode="decimal" value={draft.stack} onChange={(e) => set({ stack: e.target.value })} />
      </label>
      <button type="button" className="btn btn--ghost" aria-expanded={draft.others !== null} onClick={toggleOthers}>
        {draft.others ? 'Gegner-Stacks wie deiner' : 'Gegner-Stacks anpassen'}
      </button>
      {draft.others && (
        <div className="situation-stacks">
          {POSITIONS.filter((p) => p !== draft.hero).map((p) => (
            <label key={p} className="situation-field">
              {POSITION_LABELS[p]}
              <input inputMode="decimal" value={draft.others![p]} onChange={(e) => set({ others: { ...draft.others!, [p]: e.target.value } })} />
            </label>
          ))}
        </div>
      )}
      <FilterGroup label="Deine Position" options={POSITION_OPTIONS} value={draft.hero} disabled={false} onChange={(hero) => set({ hero })} />
      <CardPicker label="Deine Karten" selected={draft.cards} used={new Set()} max={2} onChange={(cards) => set({ cards })} />
      <FilterGroup label="Turnierart" options={KIND_OPTIONS} value={draft.kind} disabled={false} onChange={(kind) => set({ kind })} />
      {!ready && <p className="muted">Wähle zwei Karten. {STACK_RULE}.</p>}
      <button type="button" className="btn btn--gold" disabled={!ready} onClick={onStart}>
        Weiter
      </button>
    </section>
  );
}

/** Size field and buttons for the player to act. */
function ActInput({ state, onStep }: { state: SituationState; onStep: (step: SituationStep) => void }) {
  const legal = state.phase.type === 'act' ? state.phase.legal : null;
  const [input, setInput] = useState('');
  const size = legal ? sizeOf(legal, input) : null;
  const choices = useMemo(() => (legal ? situationChoices(legal, size) : []), [legal, size]);
  const onAction = useCallback((choice: SituationChoice) => legal && onStep(stepOf(choice, legal, size)), [legal, onStep, size]);
  if (!legal) return null;
  const range = legal.bet ?? legal.raise;
  return (
    <>
      {range && range.min < range.max && (
        <label className="situation-field situation-size">
          {legal.bet ? 'Bet (BB)' : 'Raise auf (BB)'}
          <input
            inputMode="decimal"
            placeholder={formatBb(chipsToBb(legal.suggested ?? range.min))}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <span className="muted">mindestens {formatBb(chipsToBb(range.min))} BB</span>
        </label>
      )}
      <ChoiceBar choices={choices} answered={false} onAction={onAction} onNext={() => {}} />
    </>
  );
}

function BoardInput({ state, onStep }: { state: SituationState; onStep: (step: SituationStep) => void }) {
  const [picked, setPicked] = useState<Card[]>([]);
  if (state.phase.type !== 'board') return null;
  const { street, count, optional } = state.phase;
  return (
    <section className="panel situation-board" aria-label={`${streetLabel(street)}-Karten`}>
      <CardPicker label={`${streetLabel(street)}-Karten`} selected={picked} used={new Set(state.usedCards)} max={count} onChange={setPicked} />
      <button type="button" className="btn btn--gold" disabled={picked.length !== count} onClick={() => onStep({ type: 'board', cards: picked })}>
        {streetLabel(street)} übernehmen
      </button>
      {optional && (
        <button type="button" className="btn" onClick={() => onStep({ type: 'end' })}>
          Ohne restliches Board beenden
        </button>
      )}
    </section>
  );
}

/** The rating of the hero's last decision so far (live), or why there is none. */
function RatingPanel({ rating, kind }: { rating: SituationRating; kind: TournamentKind }) {
  const { data } = useReviewStore();
  if (rating.status === 'none') return null;
  if (rating.status === 'pending') return <p className="panel muted" aria-live="polite">Deine Entscheidung wird bewertet …</p>;
  if (rating.status === 'failed') return <p className="panel" role="alert">Diese Situation kann ich nicht bewerten.</p>;
  const last = rating.analysis.decisions[rating.analysis.decisions.length - 1];
  return last ? <ReviewDecisionPanel decision={last} kind={kind} bigBlind={CHIPS_PER_BB} data={data} /> : null;
}

export function SituationScreen({ onBack, now = defaultNow }: { onBack: () => void; now?: () => Date }) {
  const store = useReviewStore();
  const [draft, setDraft] = useState<Draft>(START_DRAFT);
  const [situation, setSituation] = useState<Situation | null>(null);
  const [startedAt, setStartedAt] = useState(() => playedAtOf(now()));
  const state = useMemo(() => (situation ? playSituation(situation) : null), [situation]);
  const live = useSituationRating(store, situation, startedAt);

  const start = () => {
    const at = now();
    const setup = setupOf(draft, situation?.setup.handId ?? `SIT${at.getTime()}`);
    if (!setup) return;
    setStartedAt(playedAtOf(at));
    setSituation({ setup, steps: [] });
  };
  const onStep = useCallback((step: SituationStep) => setSituation((s) => (s ? addStep(s, step) : s)), []);
  const back = () => {
    if (!situation) return;
    if (situation.steps.length === 0) setSituation(null);
    else setSituation(undoStep(situation));
  };
  const leave = () => {
    if (situation && situation.steps.length > 0 && !window.confirm('Situation verwerfen?')) return;
    onBack();
  };

  return (
    <>
      <div className="screen-header">
        <button type="button" className="btn btn--ghost" onClick={leave}>
          ← Menü
        </button>
        <span className="muted">Situation analysieren</span>
      </div>
      <RtaNotice />
      {!state || !situation ? (
        <SetupForm draft={draft} onChange={setDraft} onStart={start} />
      ) : (
        <TrainingLayout
          main={
            <>
              <TableView
                model={replayTableModel(state.table, CHIPS_PER_BB)}
                cards={situation.setup.heroCards}
                board={state.table.board}
                situation={lastEventText(state)}
                info={`Du sitzt im ${POSITION_LABELS[situation.setup.hero]} · ${promptText(state)}`}
              />
              {/* A new key per step resets the size field and the picked board cards. */}
              <ActInput key={`act-${situation.steps.length}`} state={state} onStep={onStep} />
              <BoardInput key={`board-${situation.steps.length}`} state={state} onStep={onStep} />
              <div className="situation-nav">
                <button type="button" className="btn" onClick={back}>
                  ← Zurück
                </button>
              </div>
            </>
          }
          side={live.status !== 'none' && <RatingPanel rating={live} kind={situation.setup.kind} />}
        />
      )}
    </>
  );
}
```

`src/ui/screens/situation.css` anlegen:
```css
.situation-setup,
.situation-board,
.situation-summary {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.situation-setup p,
.situation-summary p {
  margin: 0;
}

.situation-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

.situation-field input {
  min-height: 44px;
  padding: 0 10px;
  font: inherit;
  font-size: 16px;
  background: var(--felt-dark);
  color: var(--cream);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
}

.situation-field input:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 1px;
}

.situation-stacks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 8px;
}

.situation-size {
  max-width: 220px;
}

.situation-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.situation-decisions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.situation-decisions .btn {
  width: 100%;
  min-height: 44px;
  text-align: left;
  font-size: 14px;
}

.situation-decisions .btn[aria-pressed='true'] {
  border-color: var(--gold);
}
```

`src/ui/useSituationRating.ts` anlegen:
```ts
import { useEffect, useMemo, useState } from 'react';
import type { ReviewStore } from '../app/review-store';
import type { HandAnalysis } from '../review/analysis';
import { parseHand } from '../review/parse';
import { type Situation, upToLastHeroAction } from '../situation/model';
import { situationText } from '../situation/text';

export type SituationRating =
  | { status: 'none' }
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'ready'; analysis: HandAnalysis };

/**
 * Spec 4: the hand up to the hero's last action, generated as text and rated by the store's analyzer (Web Worker with
 * fallback). `whole` rates the complete hand (summary). The rating only runs again when that text changes, so the
 * actions of the other players after the hero's decision cost nothing. Unreadable text → "failed", never a crash.
 */
export function useSituationRating(store: ReviewStore, situation: Situation | null, playedAt: string, whole = false): SituationRating {
  const text = useMemo(() => {
    if (!situation) return null;
    try {
      const rated = whole ? situation : upToLastHeroAction(situation);
      return rated && rated.steps.length > 0 ? situationText(rated, playedAt) : null;
    } catch {
      // An empty text cannot be parsed: shown as "Diese Situation kann ich nicht bewerten".
      return '';
    }
  }, [situation, playedAt, whole]);
  const [rating, setRating] = useState<{ text: string | null; value: SituationRating }>({ text: null, value: { status: 'none' } });

  useEffect(() => {
    if (text === null) return;
    let cancelled = false;
    const set = (value: SituationRating) => {
      if (!cancelled) setRating({ text, value });
    };
    set({ status: 'pending' });
    try {
      store.rateHand(parseHand(text)).then(
        (analysis) => set({ status: 'ready', analysis }),
        () => set({ status: 'failed' }),
      );
    } catch {
      set({ status: 'failed' });
    }
    return () => {
      cancelled = true;
    };
  }, [store, text]);

  if (text === null) return { status: 'none' };
  return rating.text === text ? rating.value : { status: 'pending' };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/ui/screens/SituationScreen.test.tsx` → Expected: PASS (7 Tests)

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → Expected: alle PASS (783 Tests). Run: `npm run typecheck` → Expected: Exit 0. Run: `npm run check:portability` → Expected: `check-portability: clean`.

```bash
git add src/ui/screens/SituationScreen.test.tsx src/ui/screens/SituationScreen.tsx src/ui/screens/situation.css src/ui/useSituationRating.ts
git commit -m "feat(ui): Situation analysieren – Grunddaten, Aktionen in Spielreihenfolge, Board, Zurück und sofortige Bewertung" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Zusammenfassung, Speichern mit Namen, Verwerfen, Gegnerkarten

**Files:**
- Modify: `src/ui/screens/SituationScreen.test.tsx`, `src/ui/screens/SituationScreen.tsx`
- Test: `src/ui/screens/SituationScreen.test.tsx`

**Interfaces:**
- Consumes: `ReviewStore.saveSituation` (Task 4), `useReview` (Sperrgrund, `writable`), `situationText`, `playedAtOf` (Task 3), `defaultSituationName` (Task 5), `decisionOutcome`, `OUTCOME_LABELS` aus `ReviewTournament.tsx`, `reviewActionLabel`, `MAX_HAND_NAME` (Task 1)
- Produces:
  - `SituationScreen({ onBack: () => void; onReview: () => void; now?: () => Date })`; Unterkomponenten `ShowInput` und `Summary` (intern)

- [ ] **Step 1: Failing Tests schreiben**

In `src/ui/screens/SituationScreen.test.tsx` ersetzen:
```tsx
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RTA_NOTICE_KEY } from '../components/RtaNotice';
import { renderWithStore } from '../test-utils';
```
durch:
```tsx
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCK_OTHER_TAB } from '../../app/review-store';
import type { PersistenceInfo } from '../../app/persistence';
import { handKey, memoryReviewBackend, readHand } from '../../review/archive';
import { retrainingOf } from '../../game/retraining';
import { RTA_NOTICE_KEY } from '../components/RtaNotice';
import { renderWithStore } from '../test-utils';
```

In `src/ui/screens/SituationScreen.test.tsx` ersetzen:
```tsx
}

async function startSituation(options: { position?: string; stack?: string; cards?: string[]; readOnly?: boolean } = {}) {
  window.localStorage.setItem(RTA_NOTICE_KEY, '1');
  const utils = renderWithStore(<SituationScreen onBack={() => {}} now={now} />, { info: { readOnly: options.readOnly ?? false } });
  await act(() => utils.loaded);
  fireEvent.change(screen.getByLabelText('Dein Stack (BB)'), { target: { value: options.stack ?? '40' } });
  fireEvent.click(within(screen.getByRole('group', { name: 'Deine Position' })).getByRole('button', { name: options.position ?? 'UTG' }));
  pickCards('Deine Karten', ...(options.cards ?? ['Kreuz 7', 'Karo 2']));
  click('Weiter');
  return utils;
}

describe('SituationScreen: hint and setup', () => {
  it('shows the GGPoker hint once and never touches the save for it', async () => {
    const first = renderWithStore(<SituationScreen onBack={() => {}} now={now} />);
    await act(() => first.loaded);
    expect(screen.getByRole('note').textContent).toContain('Hilfsmittel während laufender Hände sind bei GGPoker verboten');
    click('Verstanden');
    expect(screen.queryByRole('note')).toBeNull();
    first.unmount();
    const second = renderWithStore(<SituationScreen onBack={() => {}} now={now} />);
    await act(() => second.loaded);
    expect(screen.queryByRole('note')).toBeNull();
```
durch:
```tsx
}

type StartOptions = {
  position?: string;
  stack?: string;
  cards?: string[];
  kind?: string;
  readOnly?: boolean;
  info?: Partial<PersistenceInfo>;
  onBack?: () => void;
  onReview?: () => void;
};

async function startSituation(options: StartOptions = {}) {
  window.localStorage.setItem(RTA_NOTICE_KEY, '1');
  const ui = <SituationScreen onBack={options.onBack ?? (() => {})} onReview={options.onReview ?? (() => {})} now={now} />;
  const archive = memoryReviewBackend();
  const utils = renderWithStore(ui, { info: { readOnly: options.readOnly ?? false, ...options.info }, reviewBackend: archive });
  await act(() => utils.loaded);
  fireEvent.change(screen.getByLabelText('Dein Stack (BB)'), { target: { value: options.stack ?? '40' } });
  fireEvent.click(within(screen.getByRole('group', { name: 'Deine Position' })).getByRole('button', { name: options.position ?? 'UTG' }));
  pickCards('Deine Karten', ...(options.cards ?? ['Kreuz 7', 'Karo 2']));
  if (options.kind) fireEvent.click(within(screen.getByRole('group', { name: 'Turnierart' })).getByRole('button', { name: options.kind }));
  click('Weiter');
  return { ...utils, archive };
}

/** 72o open from UTG, everybody folds, then the summary. */
async function playToSummary(options: StartOptions = {}) {
  const utils = await startSituation(options);
  click(/^Raise auf 2,2 BB/);
  for (let i = 0; i < 7; i++) click(/^Fold/);
  click('Zur Zusammenfassung');
  await screen.findByRole('button', { name: /^Preflop · Raise auf 2,2 BB · / }, SLOW);
  return utils;
}

describe('SituationScreen: hint and setup', () => {
  it('shows the GGPoker hint once and never touches the save for it', async () => {
    const first = renderWithStore(<SituationScreen onBack={() => {}} onReview={() => {}} now={now} />);
    await act(() => first.loaded);
    expect(screen.getByRole('note').textContent).toContain('Hilfsmittel während laufender Hände sind bei GGPoker verboten');
    click('Verstanden');
    expect(screen.queryByRole('note')).toBeNull();
    first.unmount();
    const second = renderWithStore(<SituationScreen onBack={() => {}} onReview={() => {}} now={now} />);
    await act(() => second.loaded);
    expect(screen.queryByRole('note')).toBeNull();
```

In `src/ui/screens/SituationScreen.test.tsx` ersetzen:
```tsx

  it('starts only with two cards and valid stacks', async () => {
    const { loaded } = renderWithStore(<SituationScreen onBack={() => {}} now={now} />);
    await act(() => loaded);
    expect((button('Weiter') as HTMLButtonElement).disabled).toBe(true);
```
durch:
```tsx

  it('starts only with two cards and valid stacks', async () => {
    const { loaded } = renderWithStore(<SituationScreen onBack={() => {}} onReview={() => {}} now={now} />);
    await act(() => loaded);
    expect((button('Weiter') as HTMLButtonElement).disabled).toBe(true);
```

An das Ende von `src/ui/screens/SituationScreen.test.tsx` anfügen (nach einer Leerzeile):
```tsx
describe('SituationScreen: summary and saving', () => {
  const handId = `SIT${now().getTime()}`;

  it('sums up every decision and saves the situation with its name; only the retraining queue reaches the save', async () => {
    const { archive, store } = await playToSummary();
    expect(button(/^Preflop · Raise auf 2,2 BB · Fehler$/).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Falsch' })).toBeTruthy();
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    expect(name.value).toBe('72o UTG · 40 BB');
    fireEvent.change(name, { target: { value: 'Mein Spot' } });
    click('Speichern');
    expect((await screen.findByRole('status', {}, SLOW)).textContent).toBe('Gespeichert in „Eigene Situationen“.');
    expect(readHand(archive.dump()[handKey(handId)])).toMatchObject({
      name: 'Mein Spot',
      tournamentId: 'SIT-normal',
      playedAt: '2026-10-14 18:05:09',
    });
    const save = store.getSnapshot().save;
    expect(retrainingOf(save).entries.map((e) => e.key)).toEqual([`${handId}:10`]);
    expect(save.profile.xp).toBe(0);
    expect(save.decisions).toEqual([]);
    expect(save.days).toEqual({});
    expect(screen.queryByRole('button', { name: 'Speichern' })).toBeNull();
  });

  it('saves a satellite situation without touching the game save', async () => {
    const { save } = await playToSummary({ kind: 'Satellit' });
    expect(button(/^Preflop · Raise auf 2,2 BB · Hinweis$/)).toBeTruthy();
    click('Speichern');
    expect((await screen.findByRole('status', {}, SLOW)).textContent).toBe('Gespeichert in „Eigene Situationen (Satellit)“.');
    expect(save).not.toHaveBeenCalled();
  });

  it('opens the hand review after saving', async () => {
    const onReview = vi.fn();
    await playToSummary({ onReview });
    click('Speichern');
    await screen.findByRole('status', {}, SLOW);
    click('Im Hand-Review ansehen');
    expect(onReview).toHaveBeenCalledOnce();
  });

  it('blocks saving in another tab with the reason; discarding starts over with the same entries', async () => {
    const { archive } = await playToSummary({ info: { otherTabActive: true } });
    expect((button('Speichern') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(`Speichern ist hier nicht möglich: ${LOCK_OTHER_TAB}`)).toBeTruthy();
    click('Verwerfen');
    expect(screen.getByRole('region', { name: 'Grunddaten' })).toBeTruthy();
    expect((button('Weiter') as HTMLButtonElement).disabled).toBe(false);
    expect(archive.dump()).toEqual({});
  });

  it('goes back from the summary to the hand', async () => {
    await playToSummary();
    click('← Zurück');
    expect(info()).toBe('Du sitzt im UTG · Alle anderen haben gefoldet – du gewinnst den Pot');
  });

  it('takes the cards of the opponents at the showdown', async () => {
    await startSituation({ position: 'BB' });
    click(/^All-in 39,9 BB/);
    for (let i = 0; i < 6; i++) click(/^Fold/);
    click(/^Call 38,9 BB · All-in/);
    expect(info()).toBe('Du sitzt im BB · Flop: drei Karten wählen (optional, alle sind all-in)');
    click('Ohne restliches Board beenden');
    pickCards('Karten von UTG', 'Pik Dame', 'Herz Dame');
    click('Karten übernehmen');
    expect(screen.getByText('UTG zeigt Qs Qh')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Karten von UTG' })).toBeNull();
  });

  it('asks before an entered situation is left unsaved', async () => {
    const onBack = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await startSituation({ onBack });
    click('← Menü');
    expect(confirm).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
    click(/^Raise auf 2,2 BB/);
    click('← Menü');
    expect(confirm).toHaveBeenCalledWith('Situation verwerfen?');
    expect(onBack).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    click('← Menü');
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/ui/screens/SituationScreen.test.tsx` → Expected: FAIL – „6 failed | 8 passed (14)“: die neuen Tests finden „Zur Zusammenfassung“ bzw. die Gegnerkarten nicht; grün bleiben die 7 Tests aus Task 6 und „asks before an entered situation is left unsaved“ (die Rückfrage gibt es seit Task 6).

- [ ] **Step 3: Umsetzen**

In `src/ui/screens/SituationScreen.tsx` ersetzen:
```tsx
import { useCallback, useMemo, useState } from 'react';
import { formatBb, streetLabel } from '../../app/format';
import type { Card } from '../../engine/cards';
import { POSITIONS, POSITION_LABELS, type Position } from '../../engine/positions';
import { TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, type TournamentKind } from '../../review/tournament-kind';
import {
```
durch:
```tsx
import { useCallback, useMemo, useState } from 'react';
import { formatBb, reviewActionLabel, streetLabel } from '../../app/format';
import type { Card } from '../../engine/cards';
import { POSITIONS, POSITION_LABELS, type Position } from '../../engine/positions';
import { MAX_HAND_NAME, type TournamentRecord } from '../../review/archive';
import { decisionOutcome } from '../../review/summary';
import { TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, type TournamentKind } from '../../review/tournament-kind';
import {
```

In `src/ui/screens/SituationScreen.tsx` ersetzen:
```tsx
  undoStep,
} from '../../situation/model';
import { playedAtOf } from '../../situation/text';
import { ChoiceBar } from '../components/ActionBar';
import { CardPicker } from '../components/CardPicker';
```
durch:
```tsx
  undoStep,
} from '../../situation/model';
import { playedAtOf, situationText } from '../../situation/text';
import { ChoiceBar } from '../components/ActionBar';
import { CardPicker } from '../components/CardPicker';
```

In `src/ui/screens/SituationScreen.tsx` ersetzen:
```tsx
import { TrainingLayout } from '../components/TrainingLayout';
import { replayTableModel } from '../replay-model';
import { useReviewStore } from '../ReviewContext';
import { type SituationChoice, lastEventText, parseBbInput, promptText, situationChoices, sizeOf, stepOf } from '../situation-view';
import { type SituationRating, useSituationRating } from '../useSituationRating';
import './screens.css';
import './situation.css';
```
durch:
```tsx
import { TrainingLayout } from '../components/TrainingLayout';
import { replayTableModel } from '../replay-model';
import { useReview, useReviewStore } from '../ReviewContext';
import {
  type SituationChoice,
  defaultSituationName,
  lastEventText,
  parseBbInput,
  promptText,
  situationChoices,
  sizeOf,
  stepOf,
} from '../situation-view';
import { type SituationRating, useSituationRating } from '../useSituationRating';
import { OUTCOME_LABELS } from './ReviewTournament';
import './screens.css';
import './situation.css';
```

In `src/ui/screens/SituationScreen.tsx` ersetzen:
```tsx
}

/** The rating of the hero's last decision so far (live), or why there is none. */
function RatingPanel({ rating, kind }: { rating: SituationRating; kind: TournamentKind }) {
```
durch:
```tsx
}

/** Spec 3, end: the cards of the opponents at the showdown are optional. */
function ShowInput({ state, onStep }: { state: SituationState; onStep: (step: SituationStep) => void }) {
  const [villain, setVillain] = useState<Position | null>(null);
  const [picked, setPicked] = useState<Card[]>([]);
  if (state.showable.length === 0) return null;
  const who = villain !== null && state.showable.includes(villain) ? villain : state.showable[0];
  const options = state.showable.map((p) => ({ value: p, label: POSITION_LABELS[p] }));
  return (
    <section className="panel situation-board" aria-label="Karten der Gegner">
      <p className="muted">Karten der Gegner (optional)</p>
      {options.length > 1 && <FilterGroup label="Gegner" options={options} value={who} disabled={false} onChange={setVillain} />}
      <CardPicker label={`Karten von ${POSITION_LABELS[who]}`} selected={picked} used={new Set(state.usedCards)} max={2} onChange={setPicked} />
      <button
        type="button"
        className="btn"
        disabled={picked.length !== 2}
        onClick={() => onStep({ type: 'show', position: who, cards: [picked[0], picked[1]] })}
      >
        Karten übernehmen
      </button>
    </section>
  );
}

type SummaryProps = {
  situation: Situation;
  rating: SituationRating;
  onBack: () => void;
  onDiscard: () => void;
  onReview: () => void;
  now: () => Date;
};

/** Spec 3: every hero decision with its verdict; save with a name or discard. */
function Summary({ situation, rating, onBack, onDiscard, onReview, now }: SummaryProps) {
  const store = useReviewStore();
  const review = useReview();
  const { kind } = situation.setup;
  const [selected, setSelected] = useState<number | null>(null);
  const [name, setName] = useState(() => defaultSituationName(situation.setup));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<TournamentRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decisions = rating.status === 'ready' ? rating.analysis.decisions : [];
  const shown = decisions.find((d) => d.eventIndex === selected) ?? decisions[decisions.length - 1];

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      // playedAt is the moment of saving (local time), as the spec asks.
      setSaved(await store.saveSituation(situationText(situation, playedAtOf(now())), name));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <TrainingLayout
      main={
        <section className="panel situation-summary" aria-label="Zusammenfassung">
          <h2 className="review-title">Zusammenfassung</h2>
          {rating.status === 'pending' && <p className="muted">Die Hand wird bewertet …</p>}
          {rating.status === 'failed' && <p role="alert">Diese Situation kann ich nicht bewerten.</p>}
          {rating.status === 'ready' && decisions.length === 0 && <p className="muted">In dieser Hand hast du keine Entscheidung getroffen.</p>}
          {decisions.length > 0 && (
            <ol className="situation-decisions">
              {decisions.map((d) => (
                <li key={d.eventIndex}>
                  <button type="button" className="btn" aria-pressed={d === shown} onClick={() => setSelected(d.eventIndex)}>
                    {streetLabel(d.street)} · {reviewActionLabel(d, CHIPS_PER_BB)} · {OUTCOME_LABELS[decisionOutcome(d, kind)]}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {saved ? (
            <>
              <p role="status">Gespeichert in „{saved.name}“.</p>
              <div className="situation-nav">
                <button type="button" className="btn btn--gold" onClick={onDiscard}>
                  Neue Situation
                </button>
                <button type="button" className="btn" onClick={onReview}>
                  Im Hand-Review ansehen
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="situation-field">
                Name
                <input value={name} maxLength={MAX_HAND_NAME} onChange={(e) => setName(e.target.value)} />
              </label>
              {review.lockReason && <p className="muted">Speichern ist hier nicht möglich: {review.lockReason}</p>}
              {error && <p role="alert">Speichern fehlgeschlagen: {error}</p>}
              <div className="situation-nav">
                <button type="button" className="btn" onClick={onBack}>
                  ← Zurück
                </button>
                <button
                  type="button"
                  className="btn btn--gold"
                  disabled={!review.writable || saving || name.trim() === ''}
                  onClick={() => void save()}
                >
                  Speichern
                </button>
                <button type="button" className="btn" onClick={onDiscard}>
                  Verwerfen
                </button>
              </div>
            </>
          )}
        </section>
      }
      side={shown && <ReviewDecisionPanel decision={shown} kind={kind} bigBlind={CHIPS_PER_BB} data={store.data} />}
    />
  );
}

/** The rating of the hero's last decision so far (live), or why there is none. */
function RatingPanel({ rating, kind }: { rating: SituationRating; kind: TournamentKind }) {
```

In `src/ui/screens/SituationScreen.tsx` ersetzen:
```tsx
}

export function SituationScreen({ onBack, now = defaultNow }: { onBack: () => void; now?: () => Date }) {
  const store = useReviewStore();
  const [draft, setDraft] = useState<Draft>(START_DRAFT);
  const [situation, setSituation] = useState<Situation | null>(null);
  const [startedAt, setStartedAt] = useState(() => playedAtOf(now()));
  const state = useMemo(() => (situation ? playSituation(situation) : null), [situation]);
  const live = useSituationRating(store, situation, startedAt);

  const start = () => {
```
durch:
```tsx
}

type Props = { onBack: () => void; onReview: () => void; now?: () => Date };

export function SituationScreen({ onBack, onReview, now = defaultNow }: Props) {
  const store = useReviewStore();
  const [draft, setDraft] = useState<Draft>(START_DRAFT);
  const [situation, setSituation] = useState<Situation | null>(null);
  const [summary, setSummary] = useState(false);
  const [startedAt, setStartedAt] = useState(() => playedAtOf(now()));
  const state = useMemo(() => (situation ? playSituation(situation) : null), [situation]);
  const live = useSituationRating(store, summary ? null : situation, startedAt);
  const whole = useSituationRating(store, summary ? situation : null, startedAt, true);

  const start = () => {
```

In `src/ui/screens/SituationScreen.tsx` ersetzen:
```tsx
    onBack();
  };

  return (
```
durch:
```tsx
    onBack();
  };
  /** Back to the setup with the same entries; the next situation gets a new hand id. */
  const discard = () => {
    setSummary(false);
    setSituation(null);
  };

  return (
```

In `src/ui/screens/SituationScreen.tsx` ersetzen:
```tsx
      {!state || !situation ? (
        <SetupForm draft={draft} onChange={setDraft} onStart={start} />
      ) : (
        <TrainingLayout
```
durch:
```tsx
      {!state || !situation ? (
        <SetupForm draft={draft} onChange={setDraft} onStart={start} />
      ) : summary ? (
        <Summary situation={situation} rating={whole} onBack={() => setSummary(false)} onDiscard={discard} onReview={onReview} now={now} />
      ) : (
        <TrainingLayout
```

In `src/ui/screens/SituationScreen.tsx` ersetzen:
```tsx
              <ActInput key={`act-${situation.steps.length}`} state={state} onStep={onStep} />
              <BoardInput key={`board-${situation.steps.length}`} state={state} onStep={onStep} />
              <div className="situation-nav">
                <button type="button" className="btn" onClick={back}>
                  ← Zurück
                </button>
              </div>
            </>
```
durch:
```tsx
              <ActInput key={`act-${situation.steps.length}`} state={state} onStep={onStep} />
              <BoardInput key={`board-${situation.steps.length}`} state={state} onStep={onStep} />
              <ShowInput key={`show-${situation.steps.length}`} state={state} onStep={onStep} />
              <div className="situation-nav">
                <button type="button" className="btn" onClick={back}>
                  ← Zurück
                </button>
                {state.phase.type === 'done' && (
                  <button type="button" className="btn btn--gold" onClick={() => setSummary(true)}>
                    Zur Zusammenfassung
                  </button>
                )}
              </div>
            </>
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/ui/screens/SituationScreen.test.tsx` → Expected: PASS (14 Tests)

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → Expected: alle PASS (790 Tests). Run: `npm run typecheck` → Expected: Exit 0. Run: `npm run check:portability` → Expected: `check-portability: clean`.

```bash
git add src/ui/screens/SituationScreen.test.tsx src/ui/screens/SituationScreen.tsx
git commit -m "feat(ui): Zusammenfassung der Situation mit Speichern, Verwerfen und optionalen Gegnerkarten" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Einstieg von Startseite und Hand-Review, Situationen im Archiv anzeigen

**Files:**
- Modify: `src/ui/App.tsx`, `src/ui/screens/HomeScreen.tsx`, `src/ui/screens/ReviewHand.tsx`, `src/ui/screens/ReviewOverview.tsx`, `src/ui/screens/ReviewScreen.test.tsx`, `src/ui/screens/ReviewScreen.tsx`, `src/ui/screens/ReviewTournament.tsx`
- Test: `src/ui/App.test.tsx`, `src/ui/screens/ReviewScreen.test.tsx`

**Interfaces:**
- Consumes: `SituationScreen` (Task 7), `isSituationTournament` (Task 1), `HandRecord.name` (Task 1), `sevenTwoOpen`, `TEST_PLAYED_AT` (Task 4)
- Produces:
  - `Screen` um `'situation'` erweitert; Kachel „Situation analysieren“ mit Button „Situation nachstellen“ (nie gesperrt)
  - `ReviewScreen({ onBack; onSituation?: () => void; now? })`, `ReviewOverview({ onImport; onOpen; onSituation?; now })` mit Button „Situation nachstellen“
  - `ReviewTournament`: Hand-Zeile zeigt `record.name`, bei `SIT-…` statt der Art-Auswahl „Art: … (beim Nachstellen gewählt)“; `ReviewHand`: Kopfzeile mit Namen

- [ ] **Step 1: Failing Tests schreiben**

An das Ende von `src/ui/App.test.tsx` anfügen (nach einer Leerzeile):
```tsx
describe('App: situation analysis (Plan 10)', () => {
  it('opens the situation analysis from its tile and from the hand review, also in read-only mode', async () => {
    const { loaded } = renderWithStore(<App />, { info: { readOnly: true } });
    await act(() => loaded);
    const tile = screen.getByRole('button', { name: 'Situation nachstellen' }) as HTMLButtonElement;
    expect(tile.disabled).toBe(false);
    fireEvent.click(tile);
    expect(screen.getByRole('region', { name: 'Grunddaten' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '← Menü' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hände prüfen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Situation nachstellen' }));
    expect(screen.getByRole('region', { name: 'Grunddaten' })).toBeTruthy();
  });
});
```

In `src/ui/screens/ReviewScreen.test.tsx` ersetzen:
```tsx
import steps from '../../review/fixtures/step-satellites.txt?raw';
import { LOCK_OTHER_TAB } from '../../app/review-store';
import { renderWithStore } from '../test-utils';
import { ReviewScreen } from './ReviewScreen';
```
durch:
```tsx
import steps from '../../review/fixtures/step-satellites.txt?raw';
import { LOCK_OTHER_TAB } from '../../app/review-store';
import { TEST_PLAYED_AT, sevenTwoOpen } from '../../situation/test-situations';
import { situationText } from '../../situation/text';
import { renderWithStore } from '../test-utils';
import { ReviewScreen } from './ReviewScreen';
```

An das Ende von `src/ui/screens/ReviewScreen.test.tsx` anfügen (nach einer Leerzeile):
```tsx
describe('ReviewScreen with saved situations (Plan 10)', () => {
  it('lists the situation tournaments, shows the names and keeps their kind fixed', async () => {
    const utils = renderWithStore(<ReviewScreen onBack={() => {}} now={now} />);
    await act(async () => {
      await utils.loaded;
      await utils.review.saveSituation(situationText(sevenTwoOpen('bounty'), TEST_PLAYED_AT), '72o UTG · 40 BB');
    });
    const row = screen.getByRole('row', { name: /Eigene Situationen \(Bounty\)/ });
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['14.10.2026', 'Bounty', '1', '0', '0', '0']);
    await openTournament('Eigene Situationen (Bounty)');
    expect(screen.queryByLabelText('Art des Turniers')).toBeNull();
    expect(screen.getByText('Art: Bounty (beim Nachstellen gewählt)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /72o UTG · 40 BB/ }));
    expect(screen.getByText(/^72o UTG · 40 BB · 14\.10\.2026 18:05 · Level 1/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hinweis' })).toBeTruthy();
  });

  it('starts a new situation from the overview', async () => {
    const onSituation = vi.fn();
    const { loaded } = renderWithStore(<ReviewScreen onBack={() => {}} onSituation={onSituation} now={now} />);
    await act(() => loaded);
    fireEvent.click(screen.getByRole('button', { name: 'Situation nachstellen' }));
    expect(onSituation).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `npm test -- src/ui/App.test.tsx src/ui/screens/ReviewScreen.test.tsx` → Expected: FAIL – „3 failed | 34 passed (37)“: kein Button „Situation nachstellen“, die Art-Auswahl ist noch da.

- [ ] **Step 3: Umsetzen**

In `src/ui/App.tsx` ersetzen:
```tsx
import { ReviewScreen } from './screens/ReviewScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';
import { type SoundPlayer, silentPlayer } from './sound';
```
durch:
```tsx
import { ReviewScreen } from './screens/ReviewScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SituationScreen } from './screens/SituationScreen';
import { StatsScreen } from './screens/StatsScreen';
import { type SoundPlayer, silentPlayer } from './sound';
```

In `src/ui/App.tsx` ersetzen:
```tsx
        {(screen === 'training' || screen === 'daily' || screen === 'run') && <PlayScreen key={screen} mode={screen} onBack={home} />}
        {screen === 'preflop' && <PreflopScreen onBack={home} />}
        {screen === 'review' && <ReviewScreen onBack={home} />}
        {screen === 'stats' && <StatsScreen onBack={home} />}
        {screen === 'settings' && <SettingsScreen onBack={home} />}
```
durch:
```tsx
        {(screen === 'training' || screen === 'daily' || screen === 'run') && <PlayScreen key={screen} mode={screen} onBack={home} />}
        {screen === 'preflop' && <PreflopScreen onBack={home} />}
        {screen === 'review' && <ReviewScreen onBack={home} onSituation={() => setScreen('situation')} />}
        {screen === 'situation' && <SituationScreen onBack={home} onReview={() => setScreen('review')} />}
        {screen === 'stats' && <StatsScreen onBack={home} />}
        {screen === 'settings' && <SettingsScreen onBack={home} />}
```

In `src/ui/screens/HomeScreen.tsx` ersetzen:
```tsx
import './screens.css';

export type Screen = 'home' | 'training' | 'preflop' | 'daily' | 'run' | 'review' | 'stats' | 'settings';

type Tile = { title: string; text: string; button: string; target: Screen; locked: boolean };
```
durch:
```tsx
import './screens.css';

export type Screen = 'home' | 'training' | 'preflop' | 'daily' | 'run' | 'review' | 'situation' | 'stats' | 'settings';

type Tile = { title: string; text: string; button: string; target: Screen; locked: boolean };
```

In `src/ui/screens/HomeScreen.tsx` ersetzen:
```tsx
      locked: false,
    },
    { title: 'Statistik', text: 'Trefferquote, Schwachstellen und Verlauf', button: 'Statistik ansehen', target: 'stats', locked: false },
    { title: 'Einstellungen', text: 'Sound, Export/Import und Sicherungen', button: 'Einstellungen öffnen', target: 'settings', locked: false },
```
durch:
```tsx
      locked: false,
    },
    {
      title: 'Situation analysieren',
      text: 'Eine Hand nach dem Spiel selbst nachstellen – jede deiner Entscheidungen wird sofort bewertet',
      button: 'Situation nachstellen',
      target: 'situation',
      // Analysing never writes; saving is blocked inside the screen when the archive is not writable.
      locked: false,
    },
    { title: 'Statistik', text: 'Trefferquote, Schwachstellen und Verlauf', button: 'Statistik ansehen', target: 'stats', locked: false },
    { title: 'Einstellungen', text: 'Sound, Export/Import und Sicherungen', button: 'Einstellungen öffnen', target: 'settings', locked: false },
```

In `src/ui/screens/ReviewHand.tsx` ersetzen:
```tsx
    <>
      <p className="muted review-hand-head">
        Hand #{hand.id.replace(/^TM/, '')} · {formatPlayedAt(hand.playedAt)} · Level {hand.level} ({formatCount(hand.smallBlind)}/
        {formatCount(hand.bigBlind)}, Ante {formatCount(hand.ante)}) · Stack {formatChipsBb(hero?.startChips ?? 0, hand.bigBlind)} BB
      </p>
```
durch:
```tsx
    <>
      <p className="muted review-hand-head">
        {record.name ?? `Hand #${hand.id.replace(/^TM/, '')}`} · {formatPlayedAt(hand.playedAt)} · Level {hand.level} ({formatCount(hand.smallBlind)}/
        {formatCount(hand.bigBlind)}, Ante {formatCount(hand.ante)}) · Stack {formatChipsBb(hero?.startChips ?? 0, hand.bigBlind)} BB
      </p>
```

In `src/ui/screens/ReviewOverview.tsx` ersetzen:
```tsx
import './review.css';

export function ReviewOverview({ onImport, onOpen, now }: { onImport: () => void; onOpen: (id: string) => void; now: () => Date }) {
  const review = useReview();
  const game = useGame();
```
durch:
```tsx
import './review.css';

type Props = { onImport: () => void; onOpen: (id: string) => void; onSituation?: () => void; now: () => Date };

export function ReviewOverview({ onImport, onOpen, onSituation, now }: Props) {
  const review = useReview();
  const game = useGame();
```

In `src/ui/screens/ReviewOverview.tsx` ersetzen:
```tsx
          Hände importieren
        </button>
        {review.lockReason && <p className="muted">{review.lockReason}</p>}
        {retrainingCount(game.save) > 0 && (
```
durch:
```tsx
          Hände importieren
        </button>
        {onSituation && (
          <button type="button" className="btn" onClick={onSituation}>
            Situation nachstellen
          </button>
        )}
        {review.lockReason && <p className="muted">{review.lockReason}</p>}
        {retrainingCount(game.save) > 0 && (
```

In `src/ui/screens/ReviewScreen.tsx` ersetzen:
```tsx
const defaultNow = () => new Date();

export function ReviewScreen({ onBack, now = defaultNow }: { onBack: () => void; now?: () => Date }) {
  const store = useReviewStore();
  const { reanalysis } = useReview();
```
durch:
```tsx
const defaultNow = () => new Date();

type Props = { onBack: () => void; onSituation?: () => void; now?: () => Date };

export function ReviewScreen({ onBack, onSituation, now = defaultNow }: Props) {
  const store = useReviewStore();
  const { reanalysis } = useReview();
```

In `src/ui/screens/ReviewScreen.tsx` ersetzen:
```tsx
      </div>
      {message && <p role="alert">{message}</p>}
      {view.name === 'overview' && <ReviewOverview now={now} onImport={() => setView({ name: 'import' })} onOpen={(id) => void openTournament(id)} />}
      {view.name === 'import' && <ReviewImport onDone={() => setView({ name: 'overview' })} />}
      {view.name === 'tournament' &&
```
durch:
```tsx
      </div>
      {message && <p role="alert">{message}</p>}
      {view.name === 'overview' && (
        <ReviewOverview
          now={now}
          onImport={() => setView({ name: 'import' })}
          onOpen={(id) => void openTournament(id)}
          onSituation={onSituation}
        />
      )}
      {view.name === 'import' && <ReviewImport onDone={() => setView({ name: 'overview' })} />}
      {view.name === 'tournament' &&
```

In `src/ui/screens/ReviewTournament.tsx` ersetzen:
```tsx
import { positionsOf } from '../../review/hand-model';
import { HERO } from '../../review/parse';
import { type DecisionOutcome, type HandFilter, errorsPer100, handOutcome, handSeverity, matchesFilter } from '../../review/summary';
import { TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, type TournamentKind } from '../../review/tournament-kind';
```
durch:
```tsx
import { positionsOf } from '../../review/hand-model';
import { HERO } from '../../review/parse';
import { isSituationTournament } from '../../review/situation-tournaments';
import { type DecisionOutcome, type HandFilter, errorsPer100, handOutcome, handSeverity, matchesFilter } from '../../review/summary';
import { TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, type TournamentKind } from '../../review/tournament-kind';
```

In `src/ui/screens/ReviewTournament.tsx` ersetzen:
```tsx
}

function handLabel({ hand }: ReviewHand): string {
  const cards = hand.heroCards ? handName(handClassOf(hand.heroCards[0], hand.heroCards[1])) : '??';
  const position = positionsOf(hand)?.get(HERO);
```
durch:
```tsx
}

/** A saved situation shows its name; an imported hand its cards and position. */
function handLabel({ hand, record }: ReviewHand): string {
  if (record.name) return record.name;
  const cards = hand.heroCards ? handName(handClassOf(hand.heroCards[0], hand.heroCards[1])) : '??';
  const position = positionsOf(hand)?.get(HERO);
```

In `src/ui/screens/ReviewTournament.tsx` ersetzen:
```tsx
          {formatPer100(errorsPer100(errors, tournament.summary.hands))} pro 100 Hände
        </p>
        <label className="review-kind">
          Art des Turniers
          <select
            aria-label="Art des Turniers"
            value={kind}
            disabled={!editable}
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
        {review.lockReason && <p className="muted">{review.lockReason}</p>}
```
durch:
```tsx
          {formatPer100(errorsPer100(errors, tournament.summary.hands))} pro 100 Hände
        </p>
        {isSituationTournament(tournament.id) ? (
          // The kind of a situation tournament is part of its id: a situation is saved with its kind.
          <p className="muted">Art: {TOURNAMENT_KIND_LABELS[kind]} (beim Nachstellen gewählt)</p>
        ) : (
          <label className="review-kind">
            Art des Turniers
            <select
              aria-label="Art des Turniers"
              value={kind}
              disabled={!editable}
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
        )}
        {kind !== 'normal' && <p className="muted">Satellit/Bounty – Standard-Chart nur bedingt gültig. Abweichungen zählen nicht als Fehler.</p>}
        {review.lockReason && <p className="muted">{review.lockReason}</p>}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/ui/App.test.tsx src/ui/screens/ReviewScreen.test.tsx` → Expected: PASS (2 Dateien, 37 Tests)

- [ ] **Step 5: Gesamtprüfung und Commit**

Run: `npm test` → Expected: alle PASS (793 Tests). Run: `npm run typecheck` → Expected: Exit 0. Run: `npm run check:portability` → Expected: `check-portability: clean`.

```bash
git add src/ui/App.test.tsx src/ui/App.tsx src/ui/screens/HomeScreen.tsx src/ui/screens/ReviewHand.tsx src/ui/screens/ReviewOverview.tsx src/ui/screens/ReviewScreen.test.tsx src/ui/screens/ReviewScreen.tsx src/ui/screens/ReviewTournament.tsx
git commit -m "feat(ui): Kachel „Situation analysieren“, Button im Hand-Review, Namen und feste Art der Situations-Turniere" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Build-Prüfung und manuelle Abnahme

**Files:**
- Keine Änderungen geplant. Nur wenn eine Prüfung scheitert, wird die Ursache im betroffenen Task-Bereich behoben und mit eigenem Commit festgehalten.

- [ ] **Step 1: Automatische Prüfungen**

Run: `npm test` → Expected: alle PASS (793 Tests).
Run: `npm run typecheck` → Expected: Exit 0.
Run: `npm run check:portability` → Expected: `check-portability: clean`.
Run: `npm run build` → Expected: Build ohne Fehler und ohne neue Warnungen; Haupt-Bundle unter `chunkSizeWarningLimit` 1200 kB (im Prototyp 1068 kB), `dist/assets/analysis.worker-<hash>.js` weiterhin rund 43 kB (der Worker zieht nur den geänderten Parser-Ausdruck mit, nicht das Situations-Modell).

- [ ] **Step 2: Manuelle Abnahme (Controller)**

Run: `npm run preview`, dann im Browser am PC (mindestens 1100 px breit) und in der Größe 375×812 prüfen:

- **Vorhandener Stand (wichtigster Punkt):** Mit einem Profil, das schon Spielstand und importierte Turniere hat (am besten eine Kopie des Handy-Exports über Einstellungen → Import): nach dem Update XP, Rang, Streak, Statistik, Starthand-Filter, Nachtraining-Anzahl und alle Turniere unverändert. In IndexedDB `poker-trainer` ist der Eintrag `save` byte-gleich zum Export, solange keine normale Situation mit Preflop-Fehler gespeichert wurde; `poker-trainer-review` enthält dieselben Schlüssel wie vorher.
- **Einstieg:** Kachel „Situation analysieren“ → Button „Situation nachstellen“ öffnet den Bildschirm; Hand-Review-Übersicht → „Situation nachstellen“ ebenso. Im Nur-Lesen-Modus ist beides offen.
- **GGPoker-Hinweis:** Beim ersten Öffnen steht oben „Nur zur Analyse nach dem Spiel – Hilfsmittel während laufender Hände sind bei GGPoker verboten.“; nach „Verstanden“ und Neuladen nicht mehr. `localStorage` enthält `poker-trainer:situation-rta-notice` = `1`, der Spielstand ist unverändert.
- **Grunddaten:** „Weiter“ erst mit zwei Karten und gültigen Stacks (Hinweis „Stacks von 1 bis 200 BB, Schrittweite 0,1“). „Gegner-Stacks anpassen“ zeigt sieben Felder; ein BTN mit 8 BB erscheint am Tisch mit „Stack 7,9“.
- **Ablauf:** Held CO, 25 BB, A♠ K♥: UTG zeigt „Platz leer“ → UTG verschwindet vom Tisch, Pot 2,4 BB; nach dem ersten Fold gibt es „Platz leer“ nicht mehr. Held „Raise auf 2,2 BB“ → rechts (am Handy darunter) sofort „Richtig“ mit Chart. BTN „Call 2,2 BB“/„Raise auf 6,6 BB“ werden angeboten; SB folden, BB callen → „Flop: drei Karten wählen“, A♠ und K♥ sind im Kartenwähler gesperrt. Flop Q♠ J♥ 2♣, BB checkt, Held „Bet 2,9 BB“ → „Passt“ mit Equity, SPR, Gegner-Range und „Faustregel, kein Solver-Ergebnis“. Größenfeld: „3“ → „Raise auf 3 BB“, „1“ → das Minimum, „500“ → nur noch „All-in …“.
- **Zurück:** „← Zurück“ nimmt jeden Schritt einzeln zurück, auch die Helden-Aktion samt Urteil; ganz am Anfang führt es zu den Grunddaten mit denselben Eingaben.
- **All-in:** Held BB, UTG All-in, alle folden, Held callt → „Flop: … (optional, alle sind all-in)“; „Ohne restliches Board beenden“ → Karten von UTG eintragen → Tisch zeigt „UTG zeigt …“.
- **Zusammenfassung und Speichern:** „Zur Zusammenfassung“ listet „Preflop · Raise auf 2,2 BB · Richtig“, „Flop · Bet 2,9 BB · Richtig“; Klick auf eine Zeile zeigt ihr Urteil. Name vorgeschlagen „AKo CO · 25 BB“. „Speichern“ → „Gespeichert in „Eigene Situationen“.“; „Im Hand-Review ansehen“ → Übersicht mit „Eigene Situationen“, Art Normal, Datum heute; im Turnier „Art: Normal (beim Nachstellen gewählt)“, kein Auswahlfeld, Hand-Zeile „AKo CO · 25 BB“, Wiedergabe mit Name in der Kopfzeile. Eine normale Situation mit Preflop-Fehler (72o UTG 40 BB Raise) → Nachtraining-Anzahl +1, im Push/Fold- oder Starthand-Training später „Aus deiner Situation vom …“. Satellit-Situation → Urteil „Hinweis“, keine Änderung am Spielstand.
- **Zweiter Tab / Nur-Lesen:** Im zweiten Tab bewertet die Situation normal, „Speichern“ ist gesperrt mit „Speichern ist hier nicht möglich: Import ist nur in dem Tab möglich, der deinen Fortschritt speichert.“.
- **Export/Import:** Einstellungen → Export enthält im Archiv-Teil die Situation mit `"name"`; Import in ein frisches Profil zeigt „Eigene Situationen“ mit demselben Namen.
- **Verlassen:** „← Menü“ mit eingegebener, nicht gespeicherter Situation fragt „Situation verwerfen?“.
- **Am Handy (375×812):** Kartenwähler in zwei Reihen à 7 je Farbe, alle Tasten gut treffbar; Tisch, Größenfeld und Buttons ohne waagrechte Scrollleiste.

- [ ] **Step 3: Übergabe**

Ergebnis der Prüfungen festhalten (Testzahl, Bundle-Größe, Abnahme). Die Veröffentlichung erfolgt über den Merge des Pull Requests von `feat/situation-analysis` (nicht Teil dieses Plans). Vor dem Update auf dem Handy dem Nutzer empfehlen, den Spielstand einmal zu exportieren.

---

## Abdeckung der Spec

| Spec | Umsetzung |
|---|---|
| 1 Ziel, Hinweis auf das GGPoker-Verbot einmalig beim ersten Öffnen | Task 5 (`RtaNotice`, `localStorage`), Task 6 (oben im Bildschirm) |
| 2 8-max, Positionen, Blinds 0,5/1, Ante 1/8 BB je besetztem Platz | Task 2 (`Table`-Posts, `ANTE_CHIPS`), Task 3 (Kopfzeile `Level1(400/800(100))`) |
| 2 Stacks 1–200 BB, 0,1, Gegner standardmäßig gleich | Task 2 (`isStackBb`, `bbToChips`), Task 6 (Grunddaten, „Gegner-Stacks anpassen“) |
| 2 Turnierart Normal/Satellit/Bounty mit denselben Folgen | Task 1 (feste Art je Situations-Turnier), Task 6 (Auswahl), Task 4/7 (Hinweis statt Fehler) |
| 2 Bewertung exakt wie im Hand-Review | Task 4 (`rateHand` über den Analyzer, Gleichheitstest mit Fixtures), Task 6 (`ReviewDecisionPanel`) |
| 3 Einstieg Kachel und Button im Hand-Review | Task 8 |
| 3.1 Grunddaten, Kartenwähler mit gesperrten Karten | Task 5 (`CardPicker`), Task 6 (`SetupForm`) |
| 3.2 Preflop in Spielreihenfolge, „Platz leer“, Held mit Größen, erneut an der Reihe bis die Setzrunde schließt | Task 2 (`nextToAct`, `legal`, `close`), Task 5 (`situationChoices`, `sizeOf`), Task 6 (`ActInput`) |
| 3.3 Flop, Turn, River mit Board und Aktionen | Task 2 (`dealBoard`), Task 6 (`BoardInput`) |
| 3.4 Ende, restliches Board optional, Gegnerkarten optional | Task 2 (`phase`, `end`, `show`), Task 7 (`ShowInput`) |
| 3 Urteil sofort, Tisch jederzeit, PC zweispaltig | Task 6 (`useSituationRating`, `TableView`, `TrainingLayout`) |
| 3 „← Zurück“ auch über eine Bewertung hinweg | Task 2 (`undoStep`), Task 6 |
| 3 Unmögliche Eingaben nicht wählbar, Mindest-Raise, Größen über dem Stack → All-in | Task 2 (`legal`, `IllegalStepError`), Task 5 (`sizeOf`) |
| 3 Zusammenfassung, Speichern mit Namensvorschlag, Verwerfen | Task 7 (`Summary`), Task 5 (`defaultSituationName`) |
| 4 Situations-Modell rein, Text-Erzeuger, 800 Chips/BB, `Hero` und neutrale Namen, `SIT…`, feste Turnier-ID | Task 2, Task 3, Task 1 (`SITUATION_TOURNAMENTS`, Parser-Ausdruck) |
| 4 Live-Bewertung mit Worker und Rückfall, „kann ich nicht bewerten“ | Task 4 (`rateHand`), Task 6 (`useSituationRating`, `RatingPanel`) |
| 5 Archiv als eigene Turniere mit Übersicht, Fehlerzählung, Wochenverlauf, Wiedergabe, Löschen, Export/Import, Neubewertung | Task 4 (`saveSituation` über `importTexts`, Export/Merge mit Namen, Neubewertung-Test), Task 8 (Anzeige) |
| 5 Name als optionales Feld, Archiv-Schema bleibt 1 | Task 1 (`HandRecord.name`, `readHand`, Export) |
| 5 Speichern nur im schreibenden Tab, nicht im Nur-Lesen-Modus | Task 4 (Store-Test), Task 7 (gesperrter Button mit Sperrgrund) |
| 5 Nachtraining aus normalen Situationen | Task 4 (Senke, Hinweis „Aus deiner Situation vom …“), Task 7 (UI-Test) |
| 5 Keine XP, kein Tageszähler, keine Statistik | Task 7 (UI-Test: XP 0, keine Entscheidungen, keine Tage; Satellit: Spielstand nie geschrieben) |
| 6 Prüfung Modell, Rundlauf, Bewertungs-Gleichheit, Speichern, Oberfläche | Task 2, Task 3, Task 4, Task 6–8, Task 9 |
| 7 Nicht enthalten | nichts davon umgesetzt |
