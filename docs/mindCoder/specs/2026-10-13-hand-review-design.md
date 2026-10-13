# Hand-Review (GGPoker) – Design

Stand: 2026-10-13 · Status: zur Freigabe · Modul 5 der Roadmap in `2026-10-13-poker-trainer-design.md`

## 1. Ziel

GGPoker-Hand-Historien in den Trainer laden und jede eigene Entscheidung bewerten: preflop präzise mit den vorhandenen Push/Fold-Daten und Starthand-Charts, postflop mit nachvollziehbaren Faustregeln (Equity gegen eine geschätzte Gegner-Range, Pot Odds). Ergebnisse bleiben in einem Turnier-Archiv; eigene Preflop-Fehler fließen ins Training zurück.

Alles läuft im Browser, offline, ohne Server und ohne Kosten (Weg 1). Kein Solver, keine KI-Erklärungen; beides ist ausdrücklich nicht Teil dieses Moduls.

## 2. Begriffe

- **Hand-Historie (HH):** Textprotokoll einer Hand, wie GGPoker/PokerCraft es liefert (eine `.txt` je Turnier, mehrere als `.zip`).
- **Hero:** der Nutzer; in GG-HHs immer der Spielername `Hero`.
- **Entscheidung:** jede Aktion des Hero ab den Hole Cards (Fold, Check, Call, Bet, Raise, All-in) mit dem Zustand davor.
- **Urteil preflop:** `richtig`, `knapp`, `falsch` (wie im Training) oder `nicht bewertet` mit Grund.
- **Urteil postflop:** `passt`, `fraglich`, `wahrscheinlich Fehler` oder `nicht bewertet` mit Grund.
- **Fehler** (für Zählungen und Übersicht): preflop `falsch`, postflop `wahrscheinlich Fehler`.

## 3. Eingabeformat (aus der Beispieldatei des Nutzers)

Beispiel: 477 Hände aus 10 Turnieren, alle `8-max`. Merkmale, auf die sich der Parser stützt:

- Kopf: `Poker Hand #TM<id>: Tournament #<id>, <Name> Hold'em No Limit - Level<n>(<SB>/<BB>(<Ante>)) - <JJJJ/MM/TT hh:mm:ss>`; Zahlen mit Tausender-Komma (`1,500`).
- `Table '<name>' <n>-max Seat #<k> is the button`, danach `Seat <k>: <Name> (<Chips> in chips)`.
- Antes pro Spieler (`posts the ante 10`), Summe etwa 0,8–1,2 BB; wird als BB-Ante 1 BB angenähert.
- `posts small blind`, `posts big blind`, `*** HOLE CARDS ***`, `Dealt to Hero [Kh Th]`.
- Aktionen: `folds`, `checks`, `calls N`, `bets N`, `raises N to M`, jeweils optional `and is all-in`; `Uncalled bet (N) returned to X`; `shows [..]`; `collected N from pot`.
- Straßen: `*** FLOP *** [a b c]`, `*** TURN *** [...] [d]`, `*** RIVER *** [...] [e]`, `*** SHOWDOWN ***`, `*** SUMMARY ***`.
- Gegnernamen sind anonymisierte Kürzel; die Hände einer Datei stehen in umgekehrter Zeitfolge.
- Dateien sind ASCII/UTF-8 mit CRLF oder LF.

## 4. Einlesen

- Upload einer oder mehrerer `.txt`/`.zip`-Dateien (Button, am PC zusätzlich Ablegen per Drag & Drop) und ein Feld zum Einfügen einzelner Hände.
- ZIP wird im Browser entpackt (kleine, gepflegte Bibliothek mit fester Version; keine Ausführung von Inhalten).
- Unlesbare Hände werden mit Grund übersprungen (z. B. „Format nicht erkannt“, „kein Hero“), der Import läuft weiter. Bilanz nach dem Import: importiert / schon vorhanden / übersprungen (mit Gründen).
- Duplikate: Schlüssel ist die Hand-Nummer (`TM…`); vorhandene Hände werden nicht erneut angelegt.
- Größen: bis 20 MB je Datei, bis 20.000 Hände je Import; darüber eine verständliche Meldung.
- Nur-Lesen-Modus sperrt den Import.

## 5. Turnierart

- Aus dem Turniernamen: `satellit` bei „Step“, „Satellite“, „Builder“, „Ticket“, „Seat“; `bounty` bei „Bounty“, „PKO“, „Mystery“, „Knockout“; sonst `normal`.
- Der Nutzer kann die Art je Turnier ändern; die Bewertung wird dann neu berechnet.
- Bei `satellit` und `bounty` erhalten Spots, die das Standard-Chart als Fehler werten würde, statt `falsch` bzw. `wahrscheinlich Fehler` den Hinweis „Satellit/Bounty – Standard-Chart nur bedingt gültig“ und zählen nicht als Fehler.

## 6. Preflop-Bewertung

Auswahl nach effektivem Stack des Hero in BB (kleinerer Stack von Hero und dem relevanten Gegner):

| Effektiver Stack | Modell | Bewertete Spots |
|---|---|---|
| bis 20 BB | Push/Fold-Daten (Modul 1) | Open-Shove/Fold, wenn alle zum Hero gefoldet haben; Call/Fold gegen ein einzelnes All-in |
| 21–55 BB | Starthand-Charts 40 BB | `rfi`, `vsOpen`, `vs3bet` |
| über 55 BB | Starthand-Charts 100 BB | `rfi`, `vsOpen`, `vs3bet` |

- Stacks werden auf ganze BB gerundet (Push/Fold) bzw. dem Chart zugeordnet; liegt der Stack mehr als 25 % neben 40 bzw. 100 BB, steht „Näherung: Chart für 40 BB“.
- Die Aktion des Hero wird auf die Modell-Aktion abgebildet: ein Raise auf mindestens 80 % des Stacks zählt als All-in/Shove; ein Raise im Chart-Spot zählt als `raise`/`threeBet`/`fourBet` unabhängig von der genauen Größe.
- `nicht bewertet` mit Grund für alles, was die Modelle nicht abdecken: Limp oder Limp-Pot, mehrere Caller vor dem Hero, Squeeze, 4-Bet-Pot und tiefer, Hero-Minraise oder Call eines Raises mit höchstens 20 BB (kein Push/Fold-Spot), Spots ohne Hole Cards.
- Ergebnis wie im Training: Urteil, deine und die richtige Aktion, Chart mit markierter Hand, Lernsatz, Hinweis „Standard-Chart, kein Solver-Ergebnis“.

## 7. Postflop-Faustregeln

Bewertet wird jede Hero-Aktion auf Flop, Turn und River, solange genau ein Gegner im Pot ist und der Pot preflop aus einem Chart-Spot entstand (Open + Call, Open + BB-Verteidigung, 3-Bet + Call). Pots, die preflop all-in gingen, haben keine Postflop-Entscheidungen. Sonst `nicht bewertet` mit Grund („Multiway“, „Range des Gegners unbekannt“); die Zahlen (Pot, Einsatz, Pot Odds) werden trotzdem gezeigt.

**Range des Gegners**
1. Startrange aus seiner Preflop-Rolle: Opener → `rfi`-Range seiner Position; Caller gegen den Hero-Open → Call-Teil von `vsOpen` (Gruppe nach seiner Position); 3-Bettor → aggressiver Teil von `vsOpen`; BB-Verteidigung → `vsOpen:…:bb`; Caller gegen Hero-3-Bet → Call-Teil von `vs3bet`. Stacktiefe wie in Abschnitt 6.
2. Eingrenzen je Straße nach Handstärke auf dem Board (gemachte Hand plus Draw-Wert): Bet → stärkste 60 % bleiben; Raise → stärkste 30 %; All-in → stärkste 25 %; Call → schwächste 30 % fallen weg; Check → stärkste 10 % fallen weg.
3. Kombinationen mit Hero-Karten oder Board-Karten fallen weg (Card Removal).

**Zahlen je Entscheidung:** Equity des Hero gegen die Range (Monte-Carlo im Web Worker), nötige Equity aus den Pot Odds, Einsatz in Prozent vom Pot, SPR.

**Regeln** (Prozentpunkte, alle Werte als Konstanten in einer Datei):

| Hero-Aktion | `wahrscheinlich Fehler` | `fraglich` |
|---|---|---|
| Call gegen Bet/Raise | Equity < nötige − 10 | nötige − 10 ≤ Equity < nötige − 3 |
| Fold gegen Bet/Raise | Equity > nötige + 15 | nötige + 5 < Equity ≤ nötige + 15 |
| Raise oder All-in | – | Equity < 35 % |
| Bet | – | Größe < 20 % oder > 150 % Pot; River-Bet mit Equity 35–55 % |
| Check | – | River, Hero handelt als Letzter, Equity > 75 % („Value verschenkt?“) |

- Auf Flop und Turn erhält ein Call mit Draw (mindestens 8 Outs auf Straße oder Flush) einen Bonus von 5 Punkten (Implied Odds); am River nicht.
- Alles andere: `passt`. Jede Postflop-Einschätzung trägt „Faustregel, kein Solver-Ergebnis“.
- Bewertungsversion: Jede Analyse speichert eine Versionsnummer; ändert sich die Logik, werden archivierte Hände beim Öffnen neu bewertet.

## 8. Oberfläche

- Startseite: Kachel „Hand-Review“.
- Import-Bildschirm mit Upload, Einfügefeld, Fortschrittsbalken („Turnier 2 von 3 · Hand 140 von 180“) und Bilanz.
- Übersicht: Turniere (Datum, Name, Art, Hände, Fehler preflop/postflop, Fehler pro 100 Hände), darüber Verlauf „Fehler pro 100 Hände“ nach Wochen.
- Turnier: Hände nach Schwere sortiert; Filter „nur Fehler“, „auch fraglich“, „alle“; Art des Turniers änderbar; Turnier löschen.
- Hand: Wiedergabe Schritt für Schritt mit dem vorhandenen Tisch (Board, Pot, Einsätze, Stacks); je Hero-Entscheidung Urteil, Begründung und Zahlen, preflop mit Chart und Lernsatz; Pfeile zur vorherigen/nächsten Entscheidung, Tasten ← und →. Am PC zweispaltig wie im Training.
- Texte deutsch, Zahlen mit Dezimalkomma.

## 9. Speicherung

- Eigener IndexedDB-Bereich `review` neben dem Spielstand (eigener Schlüsselraum, eigene Versionsnummer `REVIEW_SCHEMA_VERSION = 1`); der Spielstand (Schema 1) bleibt unverändert.
- Je Turnier: ID, Name, Art (erkannt und ggf. vom Nutzer gesetzt), Datum, Hand-IDs, Zusammenfassung. Je Hand: Originaltext, Analyse-Ergebnis, Analyse-Version.
- Schreiben über dieselbe Einzel-Schreiber-Regel wie der Spielstand (Tab-Sperre); im Nur-Lesen-Modus kein Schreiben.
- Manueller Export enthält das Archiv als zusätzlichen, optionalen Teil; Exportdateien ohne diesen Teil bleiben importierbar; beim Import wird das Archiv zusammengeführt (Duplikate über die Hand-Nummer). Automatische Sicherungen enthalten nur den Spielstand.
- Ein unlesbarer Archiv-Eintrag wird übersprungen und gemeldet, nie still gelöscht.

## 10. Nachtraining (Plan 9)

- Preflop-Fehler aus normalen Turnieren (nicht `satellit`/`bounty`, nicht `knapp`) kommen als Spot in eine Warteschlange im Spielstand (optionales Feld, Schema bleibt 1).
- Push/Fold- bzw. Starthand-Training zieht etwa jeden vierten Spot aus der Warteschlange, sofern sie zum gewählten Filter passt; Hinweis „Aus deinem Turnier vom 12.10.“.
- Ein Spot verlässt die Warteschlange nach zwei richtigen Antworten in Folge. Höchstens 200 Einträge (älteste fallen weg).
- In den Einstellungen abschaltbar. Postflop-Fehler werden nicht trainiert.

## 11. Prüfung

- Parser-Tests mit anonymisierten, gekürzten Ausschnitten der Beispieldatei (Fixtures im Repo). Die Originaldateien liegen in `samples/` und sind per `.gitignore` ausgeschlossen.
- Tests für Turnierart-Erkennung, Duplikate, übersprungene Hände mit Grund.
- Preflop-Bewertung: je Modell und je `nicht bewertet`-Grund mindestens eine konstruierte Hand mit erwartetem Urteil.
- Postflop: Range-Eingrenzung, Card Removal und jede Regelzeile mit konstruierten Händen; Monte-Carlo mit festem Seed.
- Archiv: Speichern, Laden, Export/Import mit und ohne Archiv-Teil, alter Spielstand bleibt byte-gleich.
- Leistung: 500 Hände analysiert in unter 30 Sekunden am PC (Richtwert, im Plan gemessen).

## 12. Umsetzung

- **Plan 7:** Parser, Turnierart, Import (Datei, ZIP, Einfügen), Preflop-Bewertung, Archiv-Speicher, Übersicht, Turnier- und Hand-Ansicht (Wiedergabe mit Preflop-Urteilen), Export-Erweiterung.
- **Plan 8:** Postflop-Faustregeln (Handstärke, Range-Eingrenzung, Equity im Web Worker, Regeln, Anzeige in der Hand-Ansicht, Postflop-Fehler in Übersicht und Verlauf).
- **Plan 9:** Nachtraining.

## 13. Nicht enthalten

Solver, KI-Erklärungen, ICM- und Bounty-Rechnung, andere Pokerräume als GGPoker, Cash Games, andere Tischgrößen als 8-max (andere Größen: Hand wird importiert, Bewertung `nicht bewertet: Tischgröße`), Postflop-Training.
