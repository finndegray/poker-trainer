# Poker-Trainer – Design (Version 1: Push/Fold)

Stand: 2026-10-13 · Status: zur Freigabe

## 1. Ziel und Kontext

Ein persönlicher Trainer, mit dem Florian seine Entscheidungen in **Online-MTTs (No-Limit Texas Hold'em)** verbessert. Niveau des Nutzers: fortgeschritten (kennt Positionen, Opening-Ranges und Pot Odds grob, ist aber nicht sattelfest). Trainiert wird in kurzen, schnellen Drills mit Gamification, am PC und am Handy.

### Modul-Roadmap

| Modul | Inhalt | Version |
|---|---|---|
| 1 – Push/Fold | Kurze Stacks (1–20 BB): Open-Shove und Call vs. Shove | **diese Spec** |
| 2 – ICM | Bubble und Final Table: Push/Fold unter Auszahlungsdruck | später, eigene Spec |
| 3 – Postflop | Pot Odds/Equity unter Zeitdruck, später C-Bets und Draws | später, eigene Spec |

Gamification (XP, Ränge, Streak, Daily Challenge, Statistiken) gilt modulübergreifend und wird in Version 1 vollständig angelegt.

### Ausdrücklich nicht in Version 1

- ICM, Bubble- und Final-Table-Logik
- Postflop-Spiel
- Achievements und Badges
- Automatische Synchronisierung zwischen Geräten (Ersatz: Export/Import, siehe 6.4)
- Deep-Stack-Preflop (Open-Raise/3-Bet bei 50–100 BB)
- Mehrspieler, Accounts, Server-Backend

## 2. Spielformat und Annahmen

- **Tisch:** 8-max. Positionen: UTG, UTG+1, LJ, HJ, CO, BTN, SB, BB.
- **Ante:** Big-Blind-Ante in Höhe von 1 BB. Pot vor der ersten Aktion: SB 0,5 + BB 1 + Ante 1 = 2,5 BB.
- **Stacks:** effektiv 1–20 BB in ganzzahligen Schritten. Alle beteiligten Spieler haben in einem Spot denselben effektiven Stack.
- **Bewertung:** in Chips (chip-EV), ohne ICM.

## 3. Trainingsinhalte (Modul 1)

### 3.1 Spot-Typ „Open-Shove“

Alle Spieler vor dem Helden folden. Angezeigt werden die Position des Helden (UTG bis SB), sein effektiver Stack und seine Starthand. Antwortmöglichkeiten: **All-in** oder **Fold**.

### 3.2 Spot-Typ „Call vs. Shove“

Ein Gegner auf Position X geht als Erster mit Y BB All-in, alle dazwischen folden. Der Held sitzt hinter dem Shover (CO bis BB). Antwortmöglichkeiten: **Call** oder **Fold**.

### 3.3 Feedback nach jeder Entscheidung

- Ergebnis: richtig, falsch oder Grenzfall
- EV beider Optionen in BB, z. B. „All-in +0,42 BB · Fold 0 BB“
- Der vollständige Range-Chart (13×13-Matrix) für diesen Spot, die gespielte Hand ist markiert. Grenzfälle sind getrennt eingefärbt: knapp Push/Call und knapp Fold.
- **Positions-Vergleich:** dieselbe Hand bei gleichem Stack auf allen anderen Positionen, als Zeile mit einem Feld pro Position (Push/Call, Fold, knapp). Dazu eine Zusammenfassung wie „A7o bei 12 BB: Fold aus UTG bis HJ, Push ab CO“.
  - Open-Shove: verglichen werden alle Open-Positionen UTG bis SB.
  - Call vs. Shove: verglichen werden alle Caller-Positionen hinter demselben Shover.
  - Die Logik dafür liegt im Rechenkern (reine Funktion über die vorhandenen Push/Fold-Daten), die Darstellung in der Oberfläche.
- Weiter mit Tipp/Klick oder per Tastatur (Leertaste)

## 4. Rechenkern (offline vorberechnet)

Die App rechnet zur Laufzeit keine Equities und keine Gleichgewichte. Alles wird einmalig per Skript erzeugt und als JSON-Datei mitgeliefert.

### 4.1 Preflop-Equity-Matrix

- Equity jeder der 169 Hand-Klassen gegen jede andere, unter Berücksichtigung der Kartenüberschneidung (Card Removal) durch Mittelung über die konkreten Kombinationen
- Zielgenauigkeit: ±0,3 Prozentpunkte gegenüber exakter Enumeration. Das Verfahren (exakt oder Monte-Carlo) wird im Implementierungsplan festgelegt.
- Für Range-gegen-Range-Berechnungen wird die Equity einer Hand gegen eine Range kombinationsgewichtet aus der Matrix gebildet.

### 4.2 Push/Fold-Gleichgewicht

- Für jede Kombination aus Stack (1–20 BB) und Shove-Position wird ein Nash-Gleichgewicht berechnet: die Shove-Range des Shovers und die Call-Range jedes Spielers dahinter.
- Verfahren: iterative Best-Response (Fictitious Play), bis sich die Ranges nicht mehr ändern oder eine Iterationsgrenze erreicht ist.
- **Vereinfachung:** Es wird höchstens ein Caller berücksichtigt. Ein Spieler dahinter callt nur, wenn alle zwischen ihm und dem Shover gefoldet haben. Multiway-Pots werden nicht modelliert. Bei Händen am Rand einer Range kann das Ergebnis deshalb leicht von HRC/ICMIZER abweichen.
- **Ausgabe pro Spot und Hand:** EV(Shove/Call) und EV(Fold) in BB, daraus abgeleitet die optimale Aktion.

### 4.3 Grenzfälle

Liegt |EV(Aktion A) − EV(Aktion B)| < **0,1 BB**, gilt der Spot als **Grenzfall**. Beide Antworten zählen als richtig und erhalten volle XP. Das Feedback zeigt den Hinweis „knappe Entscheidung“.

### 4.4 Validierung

- Equity-Stichproben gegen bekannte Werte: AA vs. KK ≈ 82 %, AKs vs. QQ ≈ 46 %, AKo vs. 22 ≈ 47 %, 72o vs. AA ≈ 12 %
- Push/Fold-Ranges: Für 8-max mit BB-Ante gibt es keine frei zugänglichen, belastbaren Referenz-Charts (Recherche vom 2026-10-13). Statt gegen fremde Charts wird deshalb mathematisch geprüft:
  - **Gleichgewichts-Nachweis:** Kein Spieler kann in irgendeinem Spot durch Abweichen mehr als 0,05 BB gewinnen (Exploitability < 0,05 BB, also klar unter der Grenzfall-Schwelle von 0,1 BB).
  - **Plausibilitätsregeln:** AA wird immer geshovt und gecallt. 72o wird bei 20 BB aus UTG gefoldet. Der BB callt bei 1 BB alles. Die Ranges werden mit sinkendem Stack nicht enger und sind aus späteren Positionen breiter.
  - **Optional, manuell:** Stichproben der Range-Breiten mit einem externen Rechner (z. B. ICMIZER) vergleichen.
- Ein Verstoß ist ein Fehler. Die Datendatei wird in diesem Fall nicht ausgeliefert.

## 5. Spot-Auswahl

- **Grenznahe Gewichtung:** Hände werden nicht gleichverteilt gezogen. Hände nahe der Range-Grenze (kleine EV-Differenz) erscheinen deutlich häufiger als triviale Hände wie AA oder 72o. Ein Mindestanteil von 15 % zufälliger Hände bleibt erhalten, damit auch klare Spots vorkommen.
- **Adaptiv:** Für jede Kategorie aus Spot-Typ × Position × Stack-Bereich wird die Fehlerquote der letzten 50 Entscheidungen geführt. Kategorien mit hoher Fehlerquote werden häufiger gezogen.
- **Stack-Bereiche:** 1–5, 6–10, 11–15 und 16–20 BB.

## 6. Gamification

### 6.1 XP und Ränge

- Richtige Entscheidung oder Grenzfall: **10 XP**. Fehler: **0 XP**.
- Tempo-Bonus: **+5 XP** bei richtiger Antwort in unter 5 Sekunden.
- Combo-Multiplikator auf die XP: ab 5 richtigen Entscheidungen in Folge ×1,5, ab 10 ×2. Ein Fehler setzt die Combo zurück.
- Ränge:

| Rang | ab XP |
|---|---|
| Fish | 0 |
| Donkey | 500 |
| Grinder | 2.000 |
| Reg | 6.000 |
| Shark | 15.000 |
| Crusher | 40.000 |

Ein Rangaufstieg wird mit einer Animation gefeiert.

### 6.2 Streak

Ein Kalendertag (lokale Zeit) zählt als Trainingstag, wenn mindestens **20 Spots** gespielt wurden. Die Streak ist die Anzahl aufeinanderfolgender Trainingstage bis heute. Ein ausgelassener Tag setzt sie auf 0 zurück.

### 6.3 Daily Challenge

- 20 Spots, deterministisch aus dem Datum erzeugt (Seed = Datum). Am selben Tag sind es also auf jedem Gerät dieselben Spots.
- Einmal pro Tag wertbar. Das Ergebnis (Trefferquote, Zeit) wird gespeichert und mit den bisherigen Bestwerten verglichen.

### 6.4 Endphase-Run (Turnier-Modus)

Simuliert die Shortstack-Phase eines MTT. Die Hand-Ergebnisse werden nicht ausgewürfelt, es zählen nur die Entscheidungen.

- Feld: 2.000 Spieler. Start mit 20 BB.
- 8 Level mit je 5 Spots. Der effektive Stack sinkt pro Level: 20, 17, 14, 12, 10, 8, 6, 4 BB. Pro Spot wird er um ±1 BB variiert.
- Spot-Typen sind gemischt (Open-Shove und Call vs. Shove).
- 3 Leben. Jeder Fehler kostet ein Leben, Grenzfälle kosten keins. Beim dritten Fehler ist der Spieler ausgeschieden.
- Platzierung beim Ausscheiden in Level L: linear interpoliert zwischen Platz 2.000 (Level 1) und Platz 10 (Level 8).
- Alle 8 Level überstanden bedeutet „Final Table erreicht“. Die Platzierung ergibt sich aus den verbleibenden Leben: 3 → Platz 1, 2 → Platz 3, 1 → Platz 7.
- Bonus-XP: 10 XP pro überstandenem Level, zusätzlich 100 XP für den Final Table.
- Bestplatzierungen werden gespeichert.
- Mit späteren Modulen wird der Run erweitert: ICM-Phasen kommen mit Modul 2 dazu, ein Deep-Stack-Start ist für später vorgesehen.

### 6.5 Statistiken

- Trefferquote gesamt sowie nach Position, Stack-Bereich und Spot-Typ
- Fehler-Heatmap als 13×13-Handmatrix: die Fehlerquote je Hand-Klasse, getrennt nach Spot-Typ
- Verlauf der Trefferquote pro Woche über die letzten 8 Wochen

## 7. Gestaltung

- Stil „Klassisch Casino“: grüner Filz, Gold-Akzente, weiße Karten mit roten und schwarzen Farben
- Oben eine Statusleiste mit Rang, XP-Balken und Streak. In der Mitte der Tisch mit der Situation, darunter die Hand. Unten zwei große Aktions-Buttons.
- **Tisch mit allen 8 Plätzen:** jeder Platz beschriftet (UTG, UTG+1, LJ, HJ, CO, BTN, SB, BB), Dealer-Button und Blinds sichtbar. Der eigene Platz ist hervorgehoben, Spieler, die schon gefoldet haben, sind ausgegraut, der Shover ist mit seinem All-in markiert. Dazu ein Hinweis „noch N Spieler hinter dir“.
- Responsiv: Bedienung am Handy mit dem Daumen, am PC zusätzlich per Tastatur (F = Fold, A = All-in/Call, Leertaste = weiter)
- Animationen: Karten werden ausgeteilt und umgedreht, Chips fliegen beim XP-Gewinn, eine Feier beim Rangaufstieg
- Sounds für Karten, Chips und Rangaufstieg. Sie sind abschaltbar, die Einstellung wird gespeichert.

## 8. Technische Architektur

### 8.1 Stack

- Vite, React, TypeScript
- PWA (installierbar, offline nutzbar) per `vite-plugin-pwa`
- Tests mit Vitest
- Projektordner: `C:\Users\FlorianLibuda\poker-trainer` (außerhalb von OneDrive), versioniert mit Git

### 8.2 Bausteine

| Baustein | Verantwortung | Hängt ab von |
|---|---|---|
| `scripts/` | Equity-Matrix und Nash-Berechnung (Node, einmalig ausgeführt), schreibt `src/data/pushfold.json` | `engine/cards` |
| `src/engine/` | Karten, Hand-Klassen, Ranges, Lookup der EVs, Bewertung einer Entscheidung, Spot-Generator | Daten-JSON |
| `src/game/` | XP, Ränge, Combo, Streak, Daily Challenge, Endphase-Run, Statistik-Aggregation | `engine` |
| `src/storage/` | Persistenz in IndexedDB, Schema-Version, Migration, Export/Import | – |
| `src/ui/` | Screens: Start, Training, Feedback, Daily, Run, Statistiken, Einstellungen | `game`, `engine`, `storage` |

`engine` und `game` sind reine Logik ohne UI- und Browser-Abhängigkeiten und vollständig unit-testbar.

### 8.3 Datenfluss

Rechenskript → `pushfold.json` (im Build enthalten) → `engine` liefert einen Spot → `ui` zeigt ihn an → der Nutzer entscheidet → `engine` bewertet → `game` aktualisiert XP, Streak und Statistik → `storage` speichert.

### 8.4 Speicherung

- Lokal im Browser (IndexedDB). Gespeichert werden Profil (XP, Rang, Streak), die Entscheidungshistorie (für Statistik und adaptive Auswahl), die Ergebnisse der Daily Challenge, Run-Bestwerte und Einstellungen.
- Jeder Datensatz trägt eine Schema-Version. Beim Laden älterer Stände wird migriert.
- Ist ein Spielstand nicht lesbar, wird er als Backup-Datei angeboten und erst danach durch einen neuen ersetzt. Ein stiller Datenverlust darf nicht passieren.
- Export und Import des gesamten Spielstands als JSON-Datei. Das dient als Backup und zur manuellen Übertragung zwischen Geräten.
- Ein laufender Endphase-Run wird mitgespeichert und nach einem Neuladen fortgesetzt.
- Es wird nur gespeichert, was sich nachweislich wieder laden lässt (Prüfung vor jedem Schreiben).
- Stammt ein Spielstand aus einer neueren App-Version, wird er nicht überschrieben. Die App fordert dann zum Aktualisieren auf.

### 8.5 Anforderungen an die Oberfläche (Plan 3) aus dem Review von Plan 2

- **Nur-Lesen-Modus:** Meldet `loadState` `readOnly: true`, zeigt die App einen Hinweis „Bitte aktualisieren“ und lässt kein Training zu, das scheinbar gespeichert wird.
- **Defekter Spielstand:** Meldet `loadState` ein `corruptBackup`, bietet die App den Rohtext zum Download an. Backups bleiben später über die Einstellungen abrufbar und löschbar (`listBackups`, `readBackup`, `deleteBackup`).
- **Speichern:** über eine Warteschlange, die schnelle Folgeänderungen zusammenfasst (der neueste Stand gewinnt, höchstens ein Schreibvorgang gleichzeitig). Beim Verlassen der Seite (`visibilitychange`/`pagehide`) wird sofort geschrieben.
- **Mehrere Tabs:** Es darf nur ein Tab gleichzeitig schreiben (Web Locks oder BroadcastChannel). Andere Tabs zeigen einen Hinweis.
- **Speicher-Persistenz:** `navigator.storage.persist()` anfragen, damit der Browser (vor allem Safari/iOS) den Spielstand nicht automatisch löscht.
- **Import:** Vor einem Import wird der aktuelle Stand automatisch als Backup gesichert.
- **Kein IndexedDB verfügbar** (z. B. privater Modus): Rückfall auf den Speicher im Arbeitsspeicher, mit dem deutlichen Hinweis, dass nichts dauerhaft gespeichert wird.

## 9. Qualitätssicherung

- Unit-Tests für die Equity-Stichproben und die Push/Fold-Referenzwerte (siehe 4.4)
- Unit-Tests für die Bewertung inklusive Grenzfall-Schwelle, für XP, Combo und Ränge, für die Streak (inklusive Tageswechsel), für den deterministischen Seed der Daily Challenge, für die Run-Logik (Leben, Platzierung) und für Storage-Migration und Import
- Manueller Smoke-Test am PC-Browser und am Handy vor jedem Release

## 10. Bereitstellung

- GitHub-Repository im Account des Nutzers, Deployment auf GitHub Pages per GitHub Actions
- Die App ist unter der Pages-Adresse erreichbar, ohne Login. Personenbezogene Daten verlassen das Gerät nicht.

## 11. Erfolgskriterien

- Die Referenzwerte aus 4.4 sind erfüllt.
- Eine Trainingsentscheidung samt Feedback ist am Handy in unter 1 Sekunde geladen.
- Die App funktioniert offline, nachdem sie einmal geladen wurde.
- Der Nutzer kann am PC und am Handy trainieren, und der Fortschritt bleibt über Neustarts erhalten.
