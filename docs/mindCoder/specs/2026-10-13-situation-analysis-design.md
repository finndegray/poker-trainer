# Situation analysieren – Design

Stand: 2026-10-13 · Status: zur Freigabe · Modul 6 der Roadmap in `2026-10-13-poker-trainer-design.md`

## 1. Ziel

Der Nutzer stellt eine Hand selbst nach – Position, Stacks, freie Plätze, Aktionen der anderen Spieler, eigene Karten, Board – und trifft seine Entscheidungen per Button. Jede eigene Entscheidung wird sofort bewertet und begründet, wie im Training und im Hand-Review.

Zweck ist ausschließlich das Lernen abseits des Tisches (nach der Session, in Pausen, „Was wäre, wenn …“). Das Modul ist kein Hilfsmittel für laufende Hände: GGPoker verbietet Real-Time-Assistance. Die Oberfläche weist einmalig beim ersten Öffnen darauf hin („Nur zur Analyse nach dem Spiel – Hilfsmittel während laufender Hände sind bei GGPoker verboten.“).

## 2. Format und Annahmen

- 8-max, Positionen `UTG, UTG1, LJ, HJ, CO, BTN, SB, BB`; Blinds 0,5/1 BB, Ante 1/8 BB pro besetztem Platz (bei 8 Spielern 1 BB, wie GGPoker pro Spieler).
- Stacks in BB, 1–200, Schrittweite 0,1. Gegner-Stacks standardmäßig gleich dem eigenen, einzeln änderbar.
- Turnierart: Normal (Standard), Satellit, Bounty – mit denselben Folgen wie im Hand-Review (Abweichungen bei Satellit/Bounty sind Hinweise, keine Fehler).
- Bewertung exakt wie im Hand-Review (Spec `2026-10-13-hand-review-design.md` Abschnitte 6 und 7): Preflop mit Push/Fold-Daten bzw. Starthand-Charts, Postflop mit Faustregeln; was die Modelle nicht abdecken, ist „nicht bewertet“ mit Grund, Zahlen werden trotzdem gezeigt.

## 3. Eingabe-Ablauf

Einstieg: Kachel „Situation analysieren“ auf der Startseite und Button „Situation nachstellen“ im Hand-Review.

1. **Grunddaten:** eigener Stack, „Gegner-Stacks anpassen“ (optional, je Platz), Position (acht Buttons), zwei Karten über einen Kartenwähler (13 Ränge × 4 Farben, belegte Karten gesperrt), Turnierart.
2. **Preflop:** Die App fragt in Spielreihenfolge die Plätze vor dem Helden ab: Fold, Call/Limp, Raise auf … BB (übliche Größe vorgeschlagen, änderbar), All-in oder „Platz leer“. Dann ist der Held dran: Aktions-Buttons mit Größen (wie im Training, Raise-Größe änderbar). Danach handeln die Plätze hinter dem Helden; jede Erhöhung bringt den Helden erneut an die Reihe, bis die Setzrunde geschlossen ist.
3. **Flop, Turn, River:** Board-Karten über den Kartenwähler, danach die Aktionen in Reihenfolge (Check, Bet … BB, Call, Raise auf … BB, Fold, All-in).
4. **Ende:** sobald nur noch ein Spieler übrig ist, alle Beteiligten all-in sind (restliches Board optional) oder der River ausgespielt ist. Gegnerkarten optional.

- Nach jeder Helden-Entscheidung erscheint sofort das Urteil mit Begründung (preflop mit Chart, Lernsatz und Positions-Vergleich; postflop mit Equity, nötiger Equity, Einsatz in % vom Pot, SPR, Gegner-Range und „Faustregel, kein Solver-Ergebnis“).
- Der Tisch zeigt jederzeit Einsätze, Stacks, Pot und Board. Am PC zweispaltig wie im Training.
- „← Zurück“ nimmt den letzten Schritt zurück, auch über eine Bewertung hinweg.
- Unmögliche Eingaben sind nicht wählbar: kein Call ohne offenen Einsatz, kein Check gegen einen Einsatz, kein Raise unter dem Minimum (vorheriger Einsatz plus letzte Erhöhung, mindestens 1 BB), niemand setzt mehr als seinen Stack; Größen über dem Stack werden zu All-in.
- **Zusammenfassung:** alle Helden-Entscheidungen mit Urteil; „Speichern“ mit Namen (Vorschlag z. B. „AKo UTG · 25 BB“) oder „Verwerfen“.

## 4. Technik

- **Situations-Modell** (rein, ohne React): Zustand der Hand und erlaubte Aktionen des Spielers, der dran ist; Schritte rückgängig machen.
- **Text-Erzeuger:** schreibt aus der Situation eine Hand im GGPoker-Format, die der vorhandene Parser liest. Intern 800 Chips pro BB (SB 400, BB 800, Ante 100 pro Spieler). Spieler: `Hero` und neutrale Namen je Platz. Hand-ID eindeutig (`SIT…`), Turnier-ID je Turnierart fest.
- **Live-Bewertung:** Nach jeder Helden-Aktion wird die Hand bis zu diesem Punkt erzeugt und mit der vorhandenen Analyse (Web Worker mit Rückfall) bewertet; angezeigt wird das Urteil der letzten Helden-Entscheidung.
- Liest der Parser den erzeugten Text nicht, erscheint „Diese Situation kann ich nicht bewerten“ – kein Absturz.

## 5. Speicherung und Nachtraining

- Gespeicherte Situationen liegen im vorhandenen Hand-Archiv als eigene „Turniere“: „Eigene Situationen“, „Eigene Situationen (Satellit)“, „Eigene Situationen (Bounty)“ – mit Übersicht, Fehlerzählung, Wochenverlauf, Wiedergabe, Löschen, Export/Import und Neubewertung bei neuer Analyse-Version wie importierte Hände.
- Name je Situation als optionales Feld am Hand-Datensatz; Archiv-Schema bleibt 1, bestehende Archive bleiben gültig.
- Speichern nur im schreibenden Tab und nicht im Nur-Lesen-Modus; Analysieren ohne Speichern geht immer.
- Preflop-Fehler aus gespeicherten Situationen der Art „Normal“ kommen über den vorhandenen Weg ins Nachtraining.
- Keine XP, kein Einfluss auf Tageszähler, Streak und Trainings-Statistik. Der Spielstand ändert sich nur über die Nachtraining-Warteschlange.

## 6. Prüfung

- Situations-Modell: Reihenfolge, Ende der Setzrunde, Mindest-Raise, All-in-Regeln, leere Plätze, Rückgängig.
- Rundlauf: viele zufällige gültige Situationen (fester Seed) → Text → Parser → Tischverlauf stimmt mit dem Modell überein (Pot, Einsätze, Stacks, Board je Schritt).
- Bewertung: dieselbe Hand eingegeben und als Fixture importiert liefert dieselben Urteile.
- Speichern, Neubewertung, Nachtraining-Einspeisung, Nur-Lesen-Sperre.
- Oberfläche: Ablauf je Schritt, Kartenwähler sperrt belegte Karten, Zurück, Zusammenfassung; Sichtprüfung am PC und bei 375 px.

## 7. Nicht enthalten

Andere Tischgrößen, Cash Games, ICM- und Bounty-Rechnung, Solver, KI-Erklärungen, Nutzung während laufender Hände.
