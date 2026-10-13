# Starthand-Training (tiefe Stacks) – Design

Stand: 2026-10-13 · Status: zur Freigabe · Modul 4 der Roadmap in `2026-10-13-poker-trainer-design.md`

## 1. Ziel

Preflop-Entscheidungen mit tiefen Stacks trainieren: Open-Raise, Reaktion auf einen Open-Raise und Reaktion auf eine 3-Bet, bei 40 BB und 100 BB. Grundlage sind kuratierte Standard-Charts (kein Solver-Ergebnis; im Trainer so gekennzeichnet).

## 2. Spielformat

- 8-max, Big-Blind-Ante 1 BB, Positionen `UTG, UTG1, LJ, HJ, CO, BTN, SB, BB`
- Effektive Stacks: 40 BB oder 100 BB
- Unbeteiligte Spieler folden immer (keine Multiway-Spots, keine Squeezes, kein Limp)
- Feste Einsatzgrößen (werden angezeigt, nicht gewählt):

| Aktion | Größe |
|---|---|
| Open-Raise | 2,2 BB; aus dem SB 3 BB |
| 3-Bet | in Position 3 × Open; aus SB oder BB 4 × Open |
| 4-Bet | 100 BB: 2,2 × 3-Bet; 40 BB: All-in |

## 3. Spot-Typen und Chart-Gruppen

| Spot-Typ (`kind`) | Situation | Aktionen | Chart-Schlüssel je Stack |
|---|---|---|---|
| `rfi` | alle folden zum Helden (UTG–SB) | `raise`, `fold` | je Held-Position: 7 Charts |
| `vsOpen` | Opener X (UTG–SB), Held dahinter | `threeBet`, `call`, `fold` | je Opener × Held-Gruppe `ip` (Held zwischen X und BTN), `sb`, `bb`: Opener UTG–CO je 3, BTN nur `sb` und `bb`, SB nur `bb` = 18 Charts |
| `vs3bet` | Held hat aus X geöffnet, Spieler Y hinter X 3-bettet | `fourBet`, `call`, `fold` | je Held-Position × 3-Bettor-Gruppe `ip` (Y vor den Blinds) / `blinds` (Y ist SB oder BB): Held UTG–CO je 2, BTN nur `blinds`, SB nur `blinds` (3-Bet aus dem BB) = 12 Charts |

Damit 7 + 18 + 12 = 37 Charts je Stack, 74 insgesamt.

## 4. Chart-Daten

- Ablage: `src/engine/preflop/charts-100.ts` und `charts-40.ts`, typisierte Arrays.
- Ein Chart:
  - `id` (z. B. `rfi:100:UTG`, `vsOpen:100:CO:bb`, `vs3bet:40:HJ:ip`)
  - `aggressive`: Range-String (Raise / 3-Bet / 4-Bet)
  - `call`: Range-String (leer bei `rfi`)
  - `close`: Grenzhände mit ihrer zusätzlich erlaubten Aktion, z. B. `{ A5s: 'fold', KJs: 'call' }`
  - `note`: ein deutscher Lernsatz
- Alle übrigen Hände sind Fold.
- Range-Notation: Paare `66+`, `TT-77`, `QQ`; suited `A9s+` (Kicker aufwärts bis unter den Top-Rang), `K9s-K6s`, `JTs`; offsuit analog mit `o`; ohne Suffix (`AK`, `AQ+`) = suited und offsuit; Einträge durch Komma getrennt. Ungültige Einträge sind ein Fehler.
- Orientierung Open-Breiten bei 100 BB: UTG ~15 %, UTG1 ~17 %, LJ ~20 %, HJ ~25 %, CO ~32 %, BTN ~48 %, SB ~45 % (Raise-or-Fold). Bei 40 BB frühe Positionen etwas enger, weniger Calls, 3-Bets eher als Stack-off gedacht.

## 5. Prüfung (automatische Tests)

1. Parser: alle Notationsformen, Fehler bei ungültigen Einträgen.
2. Vollständigkeit: genau ein Chart für jeden gültigen Spot-Schlüssel beider Stacks.
3. Eindeutigkeit: keine Hand in `aggressive` und `call`; eine Grenzhand-Alternative ist ungleich der Hauptaktion und für den Spot-Typ erlaubt.
4. AA und KK sind in jedem Chart aggressiv.
5. `rfi`: Breite nicht fallend von UTG bis BTN (Toleranz 1 Prozentpunkt).
6. `vsOpen`: Weiterspiel-Range (aggressiv + Call) gegen späteren Opener nicht enger als gegen früheren (Toleranz 2 Prozentpunkte), je Held-Gruppe; `bb` verteidigt mindestens so breit wie `ip` gegen denselben Opener.
7. `vs3bet`: Weiterspiel-Range ist Teilmenge der eigenen `rfi`-Range derselben Position und Stacktiefe.
8. Ausgabe-Skript `npm run charts:print`: Tabelle aller Range-Breiten zum Gegenlesen.

## 6. Bewertung und Spots

- `PreflopSpot = { kind; stack: 40 | 100; hero: Position; villain: Position | null; hand }` (`villain` = Opener bei `vsOpen`, 3-Bettor bei `vs3bet`, `null` bei `rfi`).
- Hauptaktion = aggressiv, wenn die Hand in `aggressive` steht, sonst Call, wenn in `call`, sonst Fold.
- Verdict: `correct` bei der Hauptaktion; `close` bei der Grenzhand-Alternative (zählt als richtig); sonst `wrong`.
- Spot-Generator: Kategorie (Spot-Typ × Held-Position × Stack) gewichtet nach Fehlerquote wie bei Push/Fold; Hand gewichtet: Grenzhände und Hände, deren Nachbarzellen im Chart eine andere Aktion haben, deutlich häufiger; 15 % gleichverteilt. Filter nach Spot-Typ und Stack.
- Positions-Vergleich: dieselbe Hand im selben Spot-Typ und Stack aus allen anderen gültigen Held-Positionen (bei `vsOpen` gegen denselben Opener, bei `vs3bet` gegen dieselbe 3-Bettor-Gruppe), mit deutscher Zusammenfassung wie beim Push/Fold.

## 7. Einbindung (Plan 6)

- Protokoll: `DecisionRecord` erhält ein optionales Feld `game: 'pushfold' | 'preflop'` (fehlend = `pushfold`) und für `preflop` den `PreflopSpot`. Bestehende Spielstände bleiben gültig und unverändert (Test mit einem Spielstand im heutigen Format). Schema-Version bleibt 1.
- XP, Combo, Tempo-Bonus, Rang, Streak und Tageszähler gelten gemeinsam für beide Trainings.
- Startseite: Kachel „Starthand-Training“. Spielbildschirm mit Filtern (Spot-Typ: Alle / Open-Raise / Gegen Open-Raise / Gegen 3-Bet; Stack: Alle / 40 BB / 100 BB), Filter werden im Profil gemerkt.
- Tisch: zeigt Stacks, Open-Raise und 3-Bet als Einsätze; drei Aktions-Buttons mit Größen (z. B. „3-Bet auf 6,6 BB“, „Call“, „Fold“); Tastatur F = Fold, C = Call, R oder A = aggressiv.
- Feedback: Ergebnis, deine und die richtige Aktion, Chart mit vier Farben (aggressiv, Call, Fold, Grenzfall) und markierter Hand, Lernsatz, Hinweis „Standard-Chart, kein Solver-Ergebnis“, Positions-Vergleich.
- Statistik: Abschnitt „Starthände“ mit Trefferquote nach Spot-Typ, Position und Stack sowie Fehler-Heatmap je Spot-Typ. Die bisherigen Auswertungen zeigen weiter nur Push/Fold.
- Nicht enthalten: Daily und Endphase-Run mit tiefen Stacks, Multiway, Squeeze, Calls gegen 4-Bet-All-in.

## 8. Umsetzung

- Plan 5: Rechenkern (`src/engine/preflop/`: Parser, Charts 40/100, Lookup, Bewertung, Generator, Positions-Vergleich, Tests, Ausgabe-Skript).
- Plan 6: Speicherung, Store, Oberfläche, Statistik, Veröffentlichung.
