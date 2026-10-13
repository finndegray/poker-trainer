# Plan 2: Spielsystem und Speicherung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use mindCoder:subagent-driven-development (recommended) or mindCoder:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die gesamte Spiellogik ohne Oberfläche bauen: Positions-Vergleich, XP und Ränge, Streak, Daily Challenge, Endphase-Run, Statistik mit adaptiven Gewichten, Speicherung mit Migration und Export/Import sowie eine Session-Fassade, die Plan 3 (UI) direkt aufrufen kann.

**Architecture:** Reine, unveränderliche Funktionen (`state → neuer state`) in `src/game/` und eine Positions-Funktion in `src/engine/`. Persistenz in `src/storage/` hinter einer kleinen `KeyValueBackend`-Schnittstelle mit zwei Adaptern (IndexedDB für den Browser, In-Memory für Tests). `src/game/session.ts` ist die einzige Stelle, die Bewertung, XP, Streak und Protokoll zusammenführt.

**Tech Stack:** TypeScript 5, Vitest 3, `idb-keyval` 6 (IndexedDB), `fake-indexeddb` 6 (nur Tests).

## Global Constraints

- Entwickler-Rechner: Windows 11 (PowerShell) UND macOS (zsh). Jede Automation läuft als Node-Skript via `npm run`; keine Shell-Befehle in `package.json`. Dateien in UTF-8 mit LF.
- Identifier und Code-Kommentare auf Englisch, Texte für den Nutzer (Fehlermeldungen, Zusammenfassungen) auf Deutsch mit korrekten Umlauten.
- Alle Funktionen in `src/game/` sind rein: Sie verändern übergebene Objekte nie, sondern geben neue zurück. Zeit (`Date`) und Zufall (`Rng`) werden immer als Parameter übergeben, nie intern erzeugt.
- XP: richtige Entscheidung oder Grenzfall **10 XP**, Fehler **0 XP**. Tempo-Bonus **+5 XP** bei richtiger Antwort (inkl. Grenzfall) in unter **5000 ms**. Combo = Anzahl richtiger Antworten in Folge inklusive der aktuellen; Multiplikator **×1,5 ab Combo 5**, **×2 ab Combo 10**; ein Fehler setzt die Combo auf 0. XP pro Entscheidung = `Math.round((10 + Tempo-Bonus) × Multiplikator)`.
- Ränge: Fish 0 · Donkey 500 · Grinder 2.000 · Reg 6.000 · Shark 15.000 · Crusher 40.000 XP.
- Streak: Ein lokaler Kalendertag zählt, wenn mindestens **20** Spots gespielt wurden. Ist heute noch nicht erfüllt, zählt die Streak bis gestern (sie ist heute noch nicht verloren).
- Daily Challenge: **20** Spots, deterministisch aus dem Datum (Seed `daily:YYYY-MM-DD`), ohne adaptive Gewichte. Einmal pro Tag wertbar.
- Endphase-Run: Feld **2.000**, Level-Stacks **20, 17, 14, 12, 10, 8, 6, 4 BB**, **5** Spots pro Level, Stack pro Spot **±1 BB** (begrenzt auf 1–20), **3** Leben, Grenzfälle kosten kein Leben. Platzierung beim Ausscheiden in Level L (1–8): `Math.round(2000 − (L − 1) × 1990 / 7)`. Final Table nach allen 8 Leveln: 3 Leben → Platz 1, 2 → Platz 3, 1 → Platz 7. Bonus-XP: **10** pro abgeschlossenem Level, **+100** für den Final Table.
- Adaptive Auswahl: Fehlerquote je Kategorie aus den letzten **50** Entscheidungen dieser Kategorie; Gewicht = `1 + 4 × Fehlerquote`.
- Statistik: Trefferquote gesamt sowie nach Position, Stack-Bereich und Spot-Typ; 13×13-Fehlermatrix je Spot-Typ; Wochenverlauf über **8** Wochen.
- Speicherung: Schema-Version **1**, höchstens **5.000** Entscheidungen und **100** Runs (älteste fallen weg). Ein nicht lesbarer Spielstand wird nie still überschrieben: Er wird unter einem Backup-Schlüssel gesichert und an die UI zurückgegeben.
- Positions-Vergleich: Open-Shove vergleicht UTG bis SB, Call vs. Shove alle Caller-Positionen hinter demselben Shover. Zusammenfassung im Format „A7o bei 12 BB: Fold aus UTG bis HJ, Push ab CO“.

## Bestehende Engine-API (aus Plan 1, unverändert nutzen)

- `src/engine/cards.ts`: `HandClass`, `HAND_COUNT`, `handName(h)`, `parseHand(name)`
- `src/engine/positions.ts`: `POSITIONS`, `Position`, `POSITION_LABELS`, `OPEN_POSITIONS`, `callerPositions(shover)`, `seatOf(p)`
- `src/engine/pushfold-data.ts`: `PushFoldData`, `MIN_STACK = 1`, `MAX_STACK = 20`, `parsePushFoldData(raw)`
- `src/engine/pushfold.ts`: `Situation`, `Spot`, `Action`, `Verdict` (`'correct' | 'close' | 'wrong'`), `Grade`, `ChartCell` (`'aggressive' | 'fold' | 'close-aggressive' | 'close-fold'`), `CLOSE_THRESHOLD`, `aggressiveAction(s)`, `evRow(data, s)`, `evOf(data, spot)`, `grade(data, spot, chosen)`, `chart(data, s)`
- `src/engine/spot-generator.ts`: `SpotKind`, `StackBucket`, `STACK_BUCKETS`, `CategoryKey`, `stackBucketOf(stack)`, `categoryKey(s)`, `GeneratorOptions` (`kinds`, `minStack`, `maxStack`, `categoryWeights`, `randomShare`), `generateSpot(data, rng, options?)`
- `src/engine/rng.ts`: `Rng`, `mulberry32(seed)`, `seedFromString(s)`
- `src/engine/test-fixtures.ts`: `makeFixture(ev: (hand, situation) => number): PushFoldData`

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/engine/position-compare.ts` | Dieselbe Hand auf allen Positionen bewerten, deutsche Zusammenfassung |
| `src/game/xp.ts` | XP pro Entscheidung, Combo, Ränge |
| `src/game/streak.ts` | Datumsschlüssel, Tageszähler, Streak |
| `src/game/daily.ts` | Daily-Spots aus dem Datum, Vergleich von Ergebnissen |
| `src/game/endphase-run.ts` | Zustandsautomat des Endphase-Runs, Platzierung, Bonus-XP |
| `src/game/stats.ts` | Entscheidungsprotokoll-Typ, Trefferquoten, Fehlermatrix, Wochenverlauf, adaptive Gewichte |
| `src/storage/schema.ts` | `SaveState`, leerer Stand, Validierung/Migration, (De-)Serialisierung |
| `src/storage/store.ts` | `KeyValueBackend`, Laden mit Backup bei Defekt, Speichern mit Kürzung, Memory- und IndexedDB-Adapter |
| `src/game/session.ts` | Fassade für die UI: Entscheidung, Daily und Run verbuchen |

---

### Task 1: Positions-Vergleich

**Files:**
- Create: `src/engine/position-compare.ts`
- Modify: `src/engine/pushfold.ts` (Funktion `cellForEv` exportieren und in `chart` verwenden)
- Test: `src/engine/position-compare.test.ts`

**Interfaces:**
- Consumes: `evRow`, `aggressiveAction`, `Spot`, `ChartCell`, `CLOSE_THRESHOLD`; `OPEN_POSITIONS`, `callerPositions`, `POSITION_LABELS`, `Position`; `handName`
- Produces:
  - `cellForEv(ev: number): ChartCell` (in `pushfold.ts`)
  - `type PositionEntry = { position: Position; cell: ChartCell; ev: number; isHero: boolean }`
  - `type PositionComparison = { entries: PositionEntry[]; summary: string }`
  - `comparePositions(data: PushFoldData, spot: Spot): PositionComparison`

**Regeln für die Zusammenfassung:** Aufeinanderfolgende Positionen mit gleicher Gruppe werden zusammengefasst. Gruppen: `aggressive` → „Push“ (Open) bzw. „Call“ (Call vs. Shove), `fold` → „Fold“, `close-aggressive` und `close-fold` → „knapp“. Ein Abschnitt mit einer Position: „<Wort> aus X“. Ein Abschnitt mit mehreren Positionen: „<Wort> aus X bis Y“, außer er ist der letzte, dann „<Wort> ab X“. Gibt es nur einen Abschnitt: „<Wort> aus jeder Position“. Abschnitte werden mit „, “ verbunden. Präfix: „<Hand> bei <Stack> BB“ bzw. „<Hand> bei <Stack> BB gegen Shove aus <Shover>“, dann „: “. Positionsnamen über `POSITION_LABELS` (UTG1 → „UTG+1“).

- [ ] **Step 1: Failing Test schreiben**

`src/engine/position-compare.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseHand } from './cards';
import { comparePositions } from './position-compare';
import { seatOf } from './positions';
import { cellForEv } from './pushfold';
import { makeFixture } from './test-fixtures';

const a7o = parseHand('A7o');

describe('cellForEv', () => {
  it('classifies EVs like the chart', () => {
    expect(cellForEv(1)).toBe('aggressive');
    expect(cellForEv(-1)).toBe('fold');
    expect(cellForEv(0.05)).toBe('close-aggressive');
    expect(cellForEv(0)).toBe('close-fold');
    expect(cellForEv(-0.05)).toBe('close-fold');
  });
});

describe('comparePositions', () => {
  // Open: UTG..HJ negative, CO..SB positive. Call: SB negative, BB positive.
  const data = makeFixture((_, s) =>
    s.kind === 'open' ? seatOf(s.position) - 3.5 : seatOf(s.position) - 6.5,
  );

  it('lists every open position with the hero marked', () => {
    const r = comparePositions(data, { kind: 'open', position: 'CO', stack: 12, hand: a7o });
    expect(r.entries.map((e) => e.position)).toEqual(['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB']);
    expect(r.entries.filter((e) => e.isHero).map((e) => e.position)).toEqual(['CO']);
    expect(r.entries[0]).toMatchObject({ cell: 'fold', ev: -3.5 });
    expect(r.summary).toBe('A7o bei 12 BB: Fold aus UTG bis HJ, Push ab CO');
  });

  it('compares callers behind the same shover', () => {
    const r = comparePositions(data, { kind: 'call', shover: 'BTN', position: 'BB', stack: 8, hand: a7o });
    expect(r.entries.map((e) => e.position)).toEqual(['SB', 'BB']);
    expect(r.summary).toBe('A7o bei 8 BB gegen Shove aus BTN: Fold aus SB, Call aus BB');
  });

  it('groups close decisions as "knapp"', () => {
    const close = makeFixture((_, s) => seatOf(s.position) - 3);
    const r = comparePositions(close, { kind: 'open', position: 'UTG1', stack: 10, hand: a7o });
    expect(r.summary).toBe('A7o bei 10 BB: Fold aus UTG bis LJ, knapp aus HJ, Push ab CO');
  });

  it('uses "aus jeder Position" when all positions agree', () => {
    const all = makeFixture(() => 2);
    const r = comparePositions(all, { kind: 'open', position: 'UTG', stack: 5, hand: parseHand('AA') });
    expect(r.summary).toBe('AA bei 5 BB: Push aus jeder Position');
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/engine/position-compare.test.ts` → Expected: FAIL (`cellForEv` ist kein Export, `./position-compare` fehlt).

- [ ] **Step 3: `cellForEv` in `pushfold.ts` extrahieren**

In `src/engine/pushfold.ts` die bestehende Funktion `chart` durch Folgendes ersetzen (Verhalten unverändert):
```ts
export function cellForEv(ev: number): ChartCell {
  if (Math.abs(ev) < CLOSE_THRESHOLD) return ev > 0 ? 'close-aggressive' : 'close-fold';
  return ev > 0 ? 'aggressive' : 'fold';
}

export function chart(data: PushFoldData, s: Situation): ChartCell[] {
  return evRow(data, s).map(cellForEv);
}
```

- [ ] **Step 4: Positions-Vergleich implementieren**

`src/engine/position-compare.ts`:
```ts
import { handName } from './cards';
import { OPEN_POSITIONS, POSITION_LABELS, type Position, callerPositions } from './positions';
import { type ChartCell, type Situation, type Spot, aggressiveAction, cellForEv, evRow } from './pushfold';
import type { PushFoldData } from './pushfold-data';

export type PositionEntry = { position: Position; cell: ChartCell; ev: number; isHero: boolean };
export type PositionComparison = { entries: PositionEntry[]; summary: string };

type Group = 'aggressive' | 'fold' | 'close';
type Segment = { group: Group; from: Position; to: Position };

const groupOf = (cell: ChartCell): Group =>
  cell === 'aggressive' ? 'aggressive' : cell === 'fold' ? 'fold' : 'close';

function situationAt(spot: Spot, position: Position): Situation {
  return spot.kind === 'open'
    ? { kind: 'open', position, stack: spot.stack }
    : { kind: 'call', shover: spot.shover, position, stack: spot.stack };
}

function summarize(spot: Spot, entries: readonly PositionEntry[]): string {
  const word: Record<Group, string> = {
    aggressive: aggressiveAction(spot) === 'shove' ? 'Push' : 'Call',
    fold: 'Fold',
    close: 'knapp',
  };
  const segments: Segment[] = [];
  for (const e of entries) {
    const group = groupOf(e.cell);
    const last = segments[segments.length - 1];
    if (last && last.group === group) last.to = e.position;
    else segments.push({ group, from: e.position, to: e.position });
  }
  const label = (p: Position) => POSITION_LABELS[p];
  const parts =
    segments.length === 1
      ? [`${word[segments[0].group]} aus jeder Position`]
      : segments.map((seg, i) => {
          if (seg.from === seg.to) return `${word[seg.group]} aus ${label(seg.from)}`;
          if (i === segments.length - 1) return `${word[seg.group]} ab ${label(seg.from)}`;
          return `${word[seg.group]} aus ${label(seg.from)} bis ${label(seg.to)}`;
        });
  const prefix =
    spot.kind === 'open'
      ? `${handName(spot.hand)} bei ${spot.stack} BB`
      : `${handName(spot.hand)} bei ${spot.stack} BB gegen Shove aus ${label(spot.shover)}`;
  return `${prefix}: ${parts.join(', ')}`;
}

export function comparePositions(data: PushFoldData, spot: Spot): PositionComparison {
  const positions: readonly Position[] = spot.kind === 'open' ? OPEN_POSITIONS : callerPositions(spot.shover);
  const entries = positions.map((position): PositionEntry => {
    const ev = evRow(data, situationAt(spot, position))[spot.hand];
    return { position, cell: cellForEv(ev), ev, isHero: position === spot.position };
  });
  return { entries, summary: summarize(spot, entries) };
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npx vitest run src/engine` → Expected: alle PASS (auch die bestehenden `chart`-Tests).

- [ ] **Step 6: Commit**

```bash
git add src/engine/pushfold.ts src/engine/position-compare.ts src/engine/position-compare.test.ts
git commit -m "feat(engine): Positions-Vergleich mit deutscher Zusammenfassung"
```

---

### Task 2: XP, Combo und Ränge

**Files:**
- Create: `src/game/xp.ts`
- Test: `src/game/xp.test.ts`

**Interfaces:**
- Consumes: `Verdict` aus `src/engine/pushfold.ts`
- Produces:
  - `BASE_XP = 10`, `SPEED_BONUS_XP = 5`, `SPEED_LIMIT_MS = 5000`
  - `type XpResult = { xp: number; combo: number; multiplier: number }`
  - `comboMultiplier(combo: number): number`
  - `xpForDecision(verdict: Verdict, responseMs: number, comboBefore: number): XpResult`
  - `RANK_LADDER` (readonly Liste `{ name, minXp }`), `type RankName = 'Fish' | 'Donkey' | 'Grinder' | 'Reg' | 'Shark' | 'Crusher'`
  - `type RankInfo = { name: RankName; minXp: number; next: { name: RankName; minXp: number } | null; progress: number }` (`progress` in [0, 1], beim höchsten Rang 1)
  - `rankFor(xp: number): RankInfo` (wirft bei negativen oder nicht endlichen Werten)

- [ ] **Step 1: Failing Test schreiben**

`src/game/xp.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { comboMultiplier, rankFor, xpForDecision } from './xp';

describe('xpForDecision', () => {
  it('gives nothing for a mistake and resets the combo', () => {
    expect(xpForDecision('wrong', 1000, 7)).toEqual({ xp: 0, combo: 0, multiplier: 1 });
  });

  it('gives base XP and a speed bonus', () => {
    expect(xpForDecision('correct', 6000, 0)).toEqual({ xp: 10, combo: 1, multiplier: 1 });
    expect(xpForDecision('correct', 4999, 0)).toEqual({ xp: 15, combo: 1, multiplier: 1 });
    expect(xpForDecision('correct', 5000, 0).xp).toBe(10);
  });

  it('treats close decisions like correct ones', () => {
    expect(xpForDecision('close', 2000, 2)).toEqual({ xp: 15, combo: 3, multiplier: 1 });
  });

  it('applies the combo multiplier from the 5th and 10th answer in a row', () => {
    expect(xpForDecision('correct', 6000, 3)).toMatchObject({ xp: 10, combo: 4 });
    expect(xpForDecision('correct', 1000, 4)).toEqual({ xp: 23, combo: 5, multiplier: 1.5 });
    expect(xpForDecision('correct', 6000, 9)).toEqual({ xp: 20, combo: 10, multiplier: 2 });
    expect(comboMultiplier(25)).toBe(2);
  });
});

describe('rankFor', () => {
  it('maps XP to ranks with progress', () => {
    expect(rankFor(0)).toEqual({ name: 'Fish', minXp: 0, next: { name: 'Donkey', minXp: 500 }, progress: 0 });
    expect(rankFor(499).name).toBe('Fish');
    expect(rankFor(500).name).toBe('Donkey');
    expect(rankFor(1250).progress).toBeCloseTo(0.5);
    expect(rankFor(6000).name).toBe('Reg');
    expect(rankFor(15000).name).toBe('Shark');
  });

  it('caps at Crusher', () => {
    expect(rankFor(99999)).toEqual({ name: 'Crusher', minXp: 40000, next: null, progress: 1 });
  });

  it('rejects invalid XP', () => {
    expect(() => rankFor(-1)).toThrow();
    expect(() => rankFor(Number.NaN)).toThrow();
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/game/xp.test.ts` → Expected: FAIL, Modul `./xp` nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/game/xp.ts`:
```ts
import type { Verdict } from '../engine/pushfold';

export const BASE_XP = 10;
export const SPEED_BONUS_XP = 5;
export const SPEED_LIMIT_MS = 5000;

export type XpResult = { xp: number; combo: number; multiplier: number };

export function comboMultiplier(combo: number): number {
  if (combo >= 10) return 2;
  if (combo >= 5) return 1.5;
  return 1;
}

export function xpForDecision(verdict: Verdict, responseMs: number, comboBefore: number): XpResult {
  if (verdict === 'wrong') return { xp: 0, combo: 0, multiplier: 1 };
  const combo = comboBefore + 1;
  const multiplier = comboMultiplier(combo);
  const base = BASE_XP + (responseMs < SPEED_LIMIT_MS ? SPEED_BONUS_XP : 0);
  return { xp: Math.round(base * multiplier), combo, multiplier };
}

export const RANK_LADDER = [
  { name: 'Fish', minXp: 0 },
  { name: 'Donkey', minXp: 500 },
  { name: 'Grinder', minXp: 2000 },
  { name: 'Reg', minXp: 6000 },
  { name: 'Shark', minXp: 15000 },
  { name: 'Crusher', minXp: 40000 },
] as const;

export type RankName = (typeof RANK_LADDER)[number]['name'];
export type RankInfo = {
  name: RankName;
  minXp: number;
  next: { name: RankName; minXp: number } | null;
  progress: number;
};

export function rankFor(xp: number): RankInfo {
  if (!Number.isFinite(xp) || xp < 0) throw new Error(`Ungültige XP: ${xp}`);
  let index = 0;
  for (let k = 0; k < RANK_LADDER.length; k++) if (xp >= RANK_LADDER[k].minXp) index = k;
  const current = RANK_LADDER[index];
  const next = RANK_LADDER[index + 1];
  if (!next) return { name: current.name, minXp: current.minXp, next: null, progress: 1 };
  return {
    name: current.name,
    minXp: current.minXp,
    next: { name: next.name, minXp: next.minXp },
    progress: (xp - current.minXp) / (next.minXp - current.minXp),
  };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/game/xp.test.ts` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/xp.ts src/game/xp.test.ts
git commit -m "feat(game): XP, Combo-Multiplikator und Ränge"
```

---

### Task 3: Datumsschlüssel und Streak

**Files:**
- Create: `src/game/streak.ts`
- Test: `src/game/streak.test.ts`

**Interfaces:**
- Produces:
  - `STREAK_MIN_SPOTS = 20`
  - `type DateKey = string` (Format `YYYY-MM-DD`, lokale Zeit)
  - `type DayCounts = Readonly<Record<DateKey, number>>`
  - `localDateKey(d: Date): DateKey`
  - `shiftDateKey(key: DateKey, days: number): DateKey` (wirft bei ungültigem Format)
  - `incrementDay(days: DayCounts, key: DateKey, by?: number): Record<DateKey, number>` (neues Objekt)
  - `currentStreak(days: DayCounts, todayKey: DateKey): number`
  - `dayProgress(days: DayCounts, todayKey: DateKey): { count: number; target: number; done: boolean }`

- [ ] **Step 1: Failing Test schreiben**

`src/game/streak.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { currentStreak, dayProgress, incrementDay, localDateKey, shiftDateKey } from './streak';

describe('date keys', () => {
  it('uses the local calendar date', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });

  it('shifts across month and year boundaries', () => {
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDateKey('2028-03-01', -1)).toBe('2028-02-29');
    expect(() => shiftDateKey('2026-3-1', 1)).toThrow();
  });
});

describe('incrementDay', () => {
  it('returns a new object and leaves the input untouched', () => {
    const days = { '2026-10-13': 3 };
    const next = incrementDay(days, '2026-10-13');
    expect(next).toEqual({ '2026-10-13': 4 });
    expect(days).toEqual({ '2026-10-13': 3 });
    expect(incrementDay({}, '2026-10-14', 5)).toEqual({ '2026-10-14': 5 });
  });
});

describe('currentStreak', () => {
  it('is 0 without training', () => {
    expect(currentStreak({}, '2026-10-13')).toBe(0);
  });

  it('counts today once 20 spots are reached', () => {
    expect(currentStreak({ '2026-10-13': 19 }, '2026-10-13')).toBe(0);
    expect(currentStreak({ '2026-10-13': 20 }, '2026-10-13')).toBe(1);
  });

  it('keeps yesterday\'s streak alive while today is unfinished', () => {
    const days = { '2026-10-11': 25, '2026-10-12': 20, '2026-10-13': 5 };
    expect(currentStreak(days, '2026-10-13')).toBe(2);
  });

  it('breaks on a missed day', () => {
    const days = { '2026-10-10': 30, '2026-10-12': 20, '2026-10-13': 20 };
    expect(currentStreak(days, '2026-10-13')).toBe(2);
    expect(currentStreak({ '2026-10-11': 20 }, '2026-10-13')).toBe(0);
  });
});

describe('dayProgress', () => {
  it('reports the daily target', () => {
    expect(dayProgress({ '2026-10-13': 7 }, '2026-10-13')).toEqual({ count: 7, target: 20, done: false });
    expect(dayProgress({ '2026-10-13': 21 }, '2026-10-13').done).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/game/streak.test.ts` → Expected: FAIL, Modul `./streak` nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/game/streak.ts`:
```ts
export const STREAK_MIN_SPOTS = 20;

export type DateKey = string;
export type DayCounts = Readonly<Record<DateKey, number>>;

const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number): string => String(n).padStart(2, '0');

export function localDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftDateKey(key: DateKey, days: number): DateKey {
  const m = KEY_PATTERN.exec(key);
  if (!m) throw new Error(`Ungültiges Datum: ${key}`);
  // UTC arithmetic avoids daylight-saving shifts; the key itself is a local calendar date.
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function incrementDay(days: DayCounts, key: DateKey, by = 1): Record<DateKey, number> {
  return { ...days, [key]: (days[key] ?? 0) + by };
}

const dayDone = (days: DayCounts, key: DateKey): boolean => (days[key] ?? 0) >= STREAK_MIN_SPOTS;

export function currentStreak(days: DayCounts, todayKey: DateKey): number {
  let key = dayDone(days, todayKey) ? todayKey : shiftDateKey(todayKey, -1);
  let streak = 0;
  while (dayDone(days, key)) {
    streak++;
    key = shiftDateKey(key, -1);
  }
  return streak;
}

export function dayProgress(days: DayCounts, todayKey: DateKey): { count: number; target: number; done: boolean } {
  const count = days[todayKey] ?? 0;
  return { count, target: STREAK_MIN_SPOTS, done: count >= STREAK_MIN_SPOTS };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/game/streak.test.ts` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/streak.ts src/game/streak.test.ts
git commit -m "feat(game): Datumsschlüssel, Tageszähler und Streak"
```

---

### Task 4: Daily Challenge

**Files:**
- Create: `src/game/daily.ts`
- Test: `src/game/daily.test.ts`

**Interfaces:**
- Consumes: `generateSpot`, `mulberry32`, `seedFromString`, `Spot`, `PushFoldData`, `DateKey` aus `streak.ts`
- Produces:
  - `DAILY_SPOT_COUNT = 20`
  - `dailySpots(data: PushFoldData, dateKey: DateKey): Spot[]` (Seed `seedFromString('daily:' + dateKey)`, Standard-Optionen, keine adaptiven Gewichte)
  - `type DailyResult = { dateKey: DateKey; correct: number; total: number; durationMs: number }` (`correct` zählt richtige Antworten und Grenzfälle)
  - `isBetterDaily(a: DailyResult, b: DailyResult | undefined): boolean` (mehr richtige gewinnt; bei Gleichstand die kürzere Zeit)
  - `bestDaily(results: readonly DailyResult[]): DailyResult | undefined`

- [ ] **Step 1: Failing Test schreiben**

`src/game/daily.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { makeFixture } from '../engine/test-fixtures';
import { bestDaily, dailySpots, isBetterDaily, type DailyResult } from './daily';

const data = makeFixture((h) => (84 - h) / 10);

describe('dailySpots', () => {
  it('returns 20 spots that are identical for the same date', () => {
    const a = dailySpots(data, '2026-10-13');
    expect(a).toHaveLength(20);
    expect(dailySpots(data, '2026-10-13')).toEqual(a);
  });

  it('differs between dates', () => {
    expect(dailySpots(data, '2026-10-14')).not.toEqual(dailySpots(data, '2026-10-13'));
  });
});

describe('isBetterDaily / bestDaily', () => {
  const r = (correct: number, durationMs: number): DailyResult => ({ dateKey: '2026-10-13', correct, total: 20, durationMs });

  it('prefers more correct answers, then the faster time', () => {
    expect(isBetterDaily(r(15, 90_000), undefined)).toBe(true);
    expect(isBetterDaily(r(16, 120_000), r(15, 60_000))).toBe(true);
    expect(isBetterDaily(r(15, 60_000), r(15, 90_000))).toBe(true);
    expect(isBetterDaily(r(15, 90_000), r(15, 90_000))).toBe(false);
    expect(isBetterDaily(r(14, 10_000), r(15, 90_000))).toBe(false);
  });

  it('finds the best result', () => {
    expect(bestDaily([])).toBeUndefined();
    expect(bestDaily([r(12, 50_000), r(17, 99_000), r(17, 80_000)])).toEqual(r(17, 80_000));
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/game/daily.test.ts` → Expected: FAIL, Modul `./daily` nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/game/daily.ts`:
```ts
import type { Spot } from '../engine/pushfold';
import type { PushFoldData } from '../engine/pushfold-data';
import { mulberry32, seedFromString } from '../engine/rng';
import { generateSpot } from '../engine/spot-generator';
import type { DateKey } from './streak';

export const DAILY_SPOT_COUNT = 20;

export type DailyResult = { dateKey: DateKey; correct: number; total: number; durationMs: number };

export function dailySpots(data: PushFoldData, dateKey: DateKey): Spot[] {
  const rng = mulberry32(seedFromString(`daily:${dateKey}`));
  return Array.from({ length: DAILY_SPOT_COUNT }, () => generateSpot(data, rng));
}

export function isBetterDaily(a: DailyResult, b: DailyResult | undefined): boolean {
  if (!b) return true;
  if (a.correct !== b.correct) return a.correct > b.correct;
  return a.durationMs < b.durationMs;
}

export function bestDaily(results: readonly DailyResult[]): DailyResult | undefined {
  let best: DailyResult | undefined;
  for (const r of results) if (isBetterDaily(r, best)) best = r;
  return best;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/game/daily.test.ts` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/daily.ts src/game/daily.test.ts
git commit -m "feat(game): Daily Challenge mit datumsbasiertem Seed"
```

---

### Task 5: Endphase-Run

**Files:**
- Create: `src/game/endphase-run.ts`
- Test: `src/game/endphase-run.test.ts`

**Interfaces:**
- Consumes: `generateSpot`, `Spot`, `Verdict`, `PushFoldData`, `MIN_STACK`, `MAX_STACK`, `Rng`
- Produces:
  - `RUN_FIELD = 2000`, `RUN_LEVEL_STACKS = [20, 17, 14, 12, 10, 8, 6, 4] as const`, `RUN_SPOTS_PER_LEVEL = 5`, `RUN_LIVES = 3`
  - `type RunStatus = 'running' | 'busted' | 'finalTable'`
  - `type RunState = { levelIndex: number; spotInLevel: number; lives: number; status: RunStatus; answered: number }` — `levelIndex` 0–7, `spotInLevel` 0–4 = Anzahl beantworteter Spots im aktuellen Level
  - `startRun(): RunState`
  - `runStack(state: RunState, rng: Rng): number` (Level-Stack ±1, begrenzt auf 1–20)
  - `nextRunSpot(data: PushFoldData, state: RunState, rng: Rng): Spot` (wirft, wenn der Run nicht läuft)
  - `applyRunAnswer(state: RunState, verdict: Verdict): RunState` (wirft, wenn der Run nicht läuft)
  - `completedLevels(state: RunState): number`
  - `runPlacement(state: RunState): number | null` (`null` solange der Run läuft)
  - `runBonusXp(state: RunState): number`

- [ ] **Step 1: Failing Test schreiben**

`src/game/endphase-run.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Verdict } from '../engine/pushfold';
import { mulberry32 } from '../engine/rng';
import { makeFixture } from '../engine/test-fixtures';
import {
  RUN_LEVEL_STACKS, applyRunAnswer, completedLevels, nextRunSpot, runBonusXp, runPlacement, runStack, startRun,
  type RunState,
} from './endphase-run';

const play = (verdicts: Verdict[]): RunState => verdicts.reduce(applyRunAnswer, startRun());
const correct = (n: number): Verdict[] => Array.from({ length: n }, () => 'correct');

describe('endphase run', () => {
  it('starts at level 1 with 3 lives', () => {
    expect(startRun()).toEqual({ levelIndex: 0, spotInLevel: 0, lives: 3, status: 'running', answered: 0 });
    expect(runPlacement(startRun())).toBeNull();
  });

  it('advances a level every 5 spots', () => {
    const s = play(correct(7));
    expect(s).toMatchObject({ levelIndex: 1, spotInLevel: 2, lives: 3, status: 'running', answered: 7 });
    expect(completedLevels(s)).toBe(1);
  });

  it('reaches the final table after 40 correct spots', () => {
    const s = play(correct(40));
    expect(s.status).toBe('finalTable');
    expect(completedLevels(s)).toBe(8);
    expect(runPlacement(s)).toBe(1);
    expect(runBonusXp(s)).toBe(180);
  });

  it('places by remaining lives at the final table', () => {
    const twoLives = play(['wrong', ...correct(39)]);
    expect(twoLives.status).toBe('finalTable');
    expect(runPlacement(twoLives)).toBe(3);
    const oneLife = play(['wrong', 'wrong', ...correct(38)]);
    expect(runPlacement(oneLife)).toBe(7);
  });

  it('busts after 3 mistakes', () => {
    const s = play(['wrong', 'wrong', 'wrong']);
    expect(s).toMatchObject({ status: 'busted', lives: 0, levelIndex: 0 });
    expect(runPlacement(s)).toBe(2000);
    expect(runBonusXp(s)).toBe(0);
  });

  it('interpolates the placement by level', () => {
    const s = play([...correct(15), 'wrong', 'wrong', 'wrong']);
    expect(s.levelIndex).toBe(3);
    expect(runPlacement(s)).toBe(Math.round(2000 - 3 * 1990 / 7));
    expect(runBonusXp(s)).toBe(30);
  });

  it('does not take a life for close decisions', () => {
    expect(play(['close', 'close', 'close']).lives).toBe(3);
  });

  it('refuses answers after the run ended', () => {
    expect(() => applyRunAnswer(play(['wrong', 'wrong', 'wrong']), 'correct')).toThrow();
  });

  it('varies the stack by at most 1 BB around the level stack', () => {
    const rng = mulberry32(3);
    for (let level = 0; level < RUN_LEVEL_STACKS.length; level++) {
      const state: RunState = { ...startRun(), levelIndex: level };
      for (let i = 0; i < 50; i++) {
        const stack = runStack(state, rng);
        expect(Math.abs(stack - RUN_LEVEL_STACKS[level])).toBeLessThanOrEqual(1);
        expect(stack).toBeLessThanOrEqual(20);
      }
    }
  });

  it('generates spots with the run stack', () => {
    const data = makeFixture((h) => (84 - h) / 10);
    const rng = mulberry32(8);
    const state: RunState = { ...startRun(), levelIndex: 7 };
    for (let i = 0; i < 30; i++) {
      const spot = nextRunSpot(data, state, rng);
      expect(spot.stack).toBeGreaterThanOrEqual(3);
      expect(spot.stack).toBeLessThanOrEqual(5);
    }
    expect(() => nextRunSpot(data, play(['wrong', 'wrong', 'wrong']), rng)).toThrow();
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/game/endphase-run.test.ts` → Expected: FAIL, Modul `./endphase-run` nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/game/endphase-run.ts`:
```ts
import type { Spot, Verdict } from '../engine/pushfold';
import { MAX_STACK, MIN_STACK, type PushFoldData } from '../engine/pushfold-data';
import type { Rng } from '../engine/rng';
import { generateSpot } from '../engine/spot-generator';

export const RUN_FIELD = 2000;
export const RUN_LEVEL_STACKS = [20, 17, 14, 12, 10, 8, 6, 4] as const;
export const RUN_SPOTS_PER_LEVEL = 5;
export const RUN_LIVES = 3;

const LAST_PLACE_BEFORE_FINAL_TABLE = 10;
const FINAL_TABLE_PLACEMENT: Record<number, number> = { 3: 1, 2: 3, 1: 7 };
const XP_PER_LEVEL = 10;
const XP_FINAL_TABLE = 100;

export type RunStatus = 'running' | 'busted' | 'finalTable';
export type RunState = {
  levelIndex: number;
  spotInLevel: number;
  lives: number;
  status: RunStatus;
  answered: number;
};

export function startRun(): RunState {
  return { levelIndex: 0, spotInLevel: 0, lives: RUN_LIVES, status: 'running', answered: 0 };
}

function assertRunning(state: RunState): void {
  if (state.status !== 'running') throw new Error('Der Run ist bereits beendet');
}

export function runStack(state: RunState, rng: Rng): number {
  const base = RUN_LEVEL_STACKS[state.levelIndex];
  const varied = base + Math.floor(rng() * 3) - 1;
  return Math.min(MAX_STACK, Math.max(MIN_STACK, varied));
}

export function nextRunSpot(data: PushFoldData, state: RunState, rng: Rng): Spot {
  assertRunning(state);
  const stack = runStack(state, rng);
  return generateSpot(data, rng, { minStack: stack, maxStack: stack });
}

export function applyRunAnswer(state: RunState, verdict: Verdict): RunState {
  assertRunning(state);
  const lives = verdict === 'wrong' ? state.lives - 1 : state.lives;
  const answered = state.answered + 1;
  if (lives === 0) return { ...state, lives, answered, status: 'busted' };

  const spotInLevel = state.spotInLevel + 1;
  if (spotInLevel < RUN_SPOTS_PER_LEVEL) return { ...state, lives, answered, spotInLevel };
  if (state.levelIndex === RUN_LEVEL_STACKS.length - 1) {
    return { ...state, lives, answered, spotInLevel, status: 'finalTable' };
  }
  return { ...state, lives, answered, spotInLevel: 0, levelIndex: state.levelIndex + 1 };
}

export const completedLevels = (state: RunState): number =>
  state.status === 'finalTable' ? RUN_LEVEL_STACKS.length : state.levelIndex;

export function runPlacement(state: RunState): number | null {
  if (state.status === 'running') return null;
  if (state.status === 'finalTable') return FINAL_TABLE_PLACEMENT[state.lives];
  const level = state.levelIndex + 1;
  const step = (RUN_FIELD - LAST_PLACE_BEFORE_FINAL_TABLE) / (RUN_LEVEL_STACKS.length - 1);
  return Math.round(RUN_FIELD - (level - 1) * step);
}

export function runBonusXp(state: RunState): number {
  return completedLevels(state) * XP_PER_LEVEL + (state.status === 'finalTable' ? XP_FINAL_TABLE : 0);
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/game/endphase-run.test.ts` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/endphase-run.ts src/game/endphase-run.test.ts
git commit -m "feat(game): Endphase-Run mit Leben, Leveln und Platzierung"
```

---

### Task 6: Statistik und adaptive Gewichte

**Files:**
- Create: `src/game/stats.ts`
- Test: `src/game/stats.test.ts`

**Interfaces:**
- Consumes: `Spot`, `Action`, `Verdict`; `HAND_COUNT`; `SpotKind`, `StackBucket`, `CategoryKey`, `categoryKey`, `stackBucketOf`; `DateKey`, `shiftDateKey`
- Produces:
  - `type DecisionMode = 'training' | 'daily' | 'run'`
  - `type DecisionRecord = { ts: number; dateKey: DateKey; mode: DecisionMode; spot: Spot; chosen: Action; verdict: Verdict; responseMs: number }`
  - `type Accuracy = { correct: number; total: number; rate: number | null }` (`rate` = `correct / total`, `null` bei 0 Einträgen; Grenzfälle zählen als richtig)
  - `accuracy(records: readonly DecisionRecord[]): Accuracy`
  - `accuracyBy<K extends string>(records: readonly DecisionRecord[], keyOf: (r: DecisionRecord) => K): Map<K, Accuracy>`
  - `byPosition`, `byStackBucket`, `byKind` (Schlüssel-Funktionen für `accuracyBy`)
  - `handErrorMatrix(records: readonly DecisionRecord[], kind: SpotKind): { total: number[]; errors: number[] }` (je 169 Einträge)
  - `type WeekPoint = { weekStart: DateKey; weekEnd: DateKey; accuracy: Accuracy }`
  - `weeklyTrend(records: readonly DecisionRecord[], todayKey: DateKey, weeks?: number): WeekPoint[]` (Standard 8, älteste Woche zuerst; die letzte Woche endet heute)
  - `ADAPTIVE_WINDOW = 50`, `ADAPTIVE_BOOST = 4`
  - `adaptiveWeights(records: readonly DecisionRecord[]): Map<CategoryKey, number>` (nur Kategorien mit Einträgen; Reihenfolge nach `ts`)

- [ ] **Step 1: Failing Test schreiben**

`src/game/stats.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseHand } from '../engine/cards';
import type { Spot, Verdict } from '../engine/pushfold';
import {
  accuracy, accuracyBy, adaptiveWeights, byKind, byPosition, byStackBucket, handErrorMatrix, weeklyTrend,
  type DecisionRecord,
} from './stats';

let ts = 0;
function rec(spot: Spot, verdict: Verdict, dateKey = '2026-10-13'): DecisionRecord {
  ts += 1;
  return { ts, dateKey, mode: 'training', spot, chosen: 'fold', verdict, responseMs: 3000 };
}
const btn = (stack: number, hand = 'A7o'): Spot => ({ kind: 'open', position: 'BTN', stack, hand: parseHand(hand) });
const bbCall = (stack: number, hand = 'K9o'): Spot => ({ kind: 'call', shover: 'SB', position: 'BB', stack, hand: parseHand(hand) });

describe('accuracy', () => {
  it('counts close decisions as correct', () => {
    expect(accuracy([])).toEqual({ correct: 0, total: 0, rate: null });
    expect(accuracy([rec(btn(10), 'correct'), rec(btn(10), 'close'), rec(btn(10), 'wrong'), rec(btn(10), 'wrong')]))
      .toEqual({ correct: 2, total: 4, rate: 0.5 });
  });

  it('groups by position, stack bucket and kind', () => {
    const records = [rec(btn(4), 'correct'), rec(btn(12), 'wrong'), rec(bbCall(12), 'correct')];
    expect(accuracyBy(records, byPosition).get('BTN')).toEqual({ correct: 1, total: 2, rate: 0.5 });
    expect(accuracyBy(records, byPosition).get('BB')).toEqual({ correct: 1, total: 1, rate: 1 });
    expect(accuracyBy(records, byStackBucket).get('11-15')).toEqual({ correct: 1, total: 2, rate: 0.5 });
    expect(accuracyBy(records, byKind).get('open')?.total).toBe(2);
  });
});

describe('handErrorMatrix', () => {
  it('counts totals and errors per hand class for one kind', () => {
    const m = handErrorMatrix(
      [rec(btn(10, 'A7o'), 'wrong'), rec(btn(8, 'A7o'), 'correct'), rec(bbCall(8, 'A7o'), 'wrong')],
      'open',
    );
    expect(m.total).toHaveLength(169);
    expect(m.total[parseHand('A7o')]).toBe(2);
    expect(m.errors[parseHand('A7o')]).toBe(1);
  });
});

describe('weeklyTrend', () => {
  it('returns 8 weeks, oldest first, the last one ending today', () => {
    const records = [
      rec(btn(10), 'correct', '2026-10-13'),
      rec(btn(10), 'wrong', '2026-10-07'),
      rec(btn(10), 'correct', '2026-10-06'),
      rec(btn(10), 'correct', '2026-08-01'),
    ];
    const trend = weeklyTrend(records, '2026-10-13');
    expect(trend).toHaveLength(8);
    expect(trend[7]).toEqual({ weekStart: '2026-10-07', weekEnd: '2026-10-13', accuracy: { correct: 1, total: 2, rate: 0.5 } });
    expect(trend[6]).toMatchObject({ weekStart: '2026-09-30', weekEnd: '2026-10-06', accuracy: { correct: 1, total: 1 } });
    expect(trend[0]).toMatchObject({ weekStart: '2026-08-19', weekEnd: '2026-08-25' });
    expect(trend.reduce((n, w) => n + w.accuracy.total, 0)).toBe(3);
  });
});

describe('adaptiveWeights', () => {
  it('boosts categories with a high error rate', () => {
    const records = [
      ...Array.from({ length: 4 }, () => rec(btn(10), 'wrong')),
      ...Array.from({ length: 4 }, () => rec(btn(10), 'correct')),
      ...Array.from({ length: 5 }, () => rec(bbCall(12), 'correct')),
    ];
    const w = adaptiveWeights(records);
    expect(w.get('open|BTN|6-10')).toBeCloseTo(3);
    expect(w.get('call|BB|11-15')).toBe(1);
    expect(w.has('open|UTG|1-5')).toBe(false);
  });

  it('only looks at the last 50 decisions of a category', () => {
    const old = Array.from({ length: 50 }, () => rec(btn(3), 'wrong'));
    const recent = Array.from({ length: 50 }, () => rec(btn(3), 'correct'));
    expect(adaptiveWeights([...old, ...recent]).get('open|BTN|1-5')).toBe(1);
    expect(adaptiveWeights([...recent.slice(0, 25), ...old.slice(0, 25)]).get('open|BTN|1-5')).toBeCloseTo(3);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/game/stats.test.ts` → Expected: FAIL, Modul `./stats` nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/game/stats.ts`:
```ts
import { HAND_COUNT } from '../engine/cards';
import type { Action, Spot, Verdict } from '../engine/pushfold';
import { type CategoryKey, type SpotKind, type StackBucket, categoryKey, stackBucketOf } from '../engine/spot-generator';
import { type DateKey, shiftDateKey } from './streak';

export type DecisionMode = 'training' | 'daily' | 'run';
export type DecisionRecord = {
  ts: number;
  dateKey: DateKey;
  mode: DecisionMode;
  spot: Spot;
  chosen: Action;
  verdict: Verdict;
  responseMs: number;
};

export type Accuracy = { correct: number; total: number; rate: number | null };
export type WeekPoint = { weekStart: DateKey; weekEnd: DateKey; accuracy: Accuracy };

export const ADAPTIVE_WINDOW = 50;
export const ADAPTIVE_BOOST = 4;
const DEFAULT_WEEKS = 8;

const isCorrect = (r: DecisionRecord): boolean => r.verdict !== 'wrong';

export function accuracy(records: readonly DecisionRecord[]): Accuracy {
  let correct = 0;
  for (const r of records) if (isCorrect(r)) correct++;
  return { correct, total: records.length, rate: records.length > 0 ? correct / records.length : null };
}

export function accuracyBy<K extends string>(
  records: readonly DecisionRecord[],
  keyOf: (r: DecisionRecord) => K,
): Map<K, Accuracy> {
  const groups = new Map<K, DecisionRecord[]>();
  for (const r of records) {
    const key = keyOf(r);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  return new Map([...groups].map(([key, list]) => [key, accuracy(list)]));
}

export const byPosition = (r: DecisionRecord): string => r.spot.position;
export const byStackBucket = (r: DecisionRecord): StackBucket => stackBucketOf(r.spot.stack);
export const byKind = (r: DecisionRecord): SpotKind => r.spot.kind;

export function handErrorMatrix(records: readonly DecisionRecord[], kind: SpotKind): { total: number[]; errors: number[] } {
  const total = new Array<number>(HAND_COUNT).fill(0);
  const errors = new Array<number>(HAND_COUNT).fill(0);
  for (const r of records) {
    if (r.spot.kind !== kind) continue;
    total[r.spot.hand]++;
    if (!isCorrect(r)) errors[r.spot.hand]++;
  }
  return { total, errors };
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

export function adaptiveWeights(records: readonly DecisionRecord[]): Map<CategoryKey, number> {
  const sorted = [...records].sort((a, b) => a.ts - b.ts);
  const groups = new Map<CategoryKey, DecisionRecord[]>();
  for (const r of sorted) {
    const key = categoryKey(r.spot);
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  const weights = new Map<CategoryKey, number>();
  for (const [key, list] of groups) {
    const window = list.slice(-ADAPTIVE_WINDOW);
    const errorRate = window.filter((r) => !isCorrect(r)).length / window.length;
    weights.set(key, 1 + ADAPTIVE_BOOST * errorRate);
  }
  return weights;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/game/stats.test.ts` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/stats.ts src/game/stats.test.ts
git commit -m "feat(game): Statistik, Fehlermatrix, Wochenverlauf und adaptive Gewichte"
```

---

### Task 7: Speicherung (Schema, Migration, Backends)

**Files:**
- Create: `src/storage/schema.ts`, `src/storage/store.ts`
- Modify: `package.json` (Abhängigkeiten `idb-keyval`, `fake-indexeddb`)
- Test: `src/storage/schema.test.ts`, `src/storage/store.test.ts`

**Interfaces:**
- Consumes: `DecisionRecord` aus `src/game/stats.ts`, `DailyResult` aus `src/game/daily.ts`
- Produces (`schema.ts`):
  - `SCHEMA_VERSION = 1`, `MAX_DECISIONS = 5000`, `MAX_RUNS = 100`
  - `type RunSummary = { ts: number; dateKey: string; placement: number; finalTable: boolean; levelsCompleted: number; bonusXp: number }`
  - `type Profile = { xp: number; combo: number; soundOn: boolean }`
  - `type SaveState = { schemaVersion: 1; profile: Profile; days: Record<string, number>; decisions: DecisionRecord[]; daily: Record<string, DailyResult>; runs: RunSummary[]; bestRun: RunSummary | null }`
  - `class SaveFormatError extends Error`
  - `emptyState(): SaveState`
  - `migrate(raw: unknown): SaveState` (validiert; wirft `SaveFormatError` mit deutscher Meldung)
  - `serialize(state: SaveState): string`, `deserialize(text: string): SaveState` (für Speicherung und Export/Import)
- Produces (`store.ts`):
  - `interface KeyValueBackend { get(key: string): Promise<string | undefined>; set(key: string, value: string): Promise<void> }`
  - `SAVE_KEY = 'save'`, `BACKUP_PREFIX = 'corrupt-backup:'`
  - `type LoadResult = { state: SaveState; corruptBackup: { key: string; raw: string } | null }`
  - `loadState(backend: KeyValueBackend, now: Date): Promise<LoadResult>`
  - `trimState(state: SaveState): SaveState`
  - `saveState(backend: KeyValueBackend, state: SaveState): Promise<void>`
  - `memoryBackend(initial?: Record<string, string>): KeyValueBackend & { dump(): Record<string, string> }`
  - `indexedDbBackend(dbName?: string): KeyValueBackend` (Standard `'poker-trainer'`, Store `'kv'`)

**Verhalten bei defektem Spielstand (verbindlich):** `loadState` schreibt den unlesbaren Rohtext unter `BACKUP_PREFIX + now.toISOString()`, lässt `SAVE_KEY` unverändert und gibt einen leeren Stand plus `corruptBackup` zurück. Die UI bietet den Rohtext zum Download an; erst ein späteres `saveState` überschreibt `SAVE_KEY`. Fehler des Backends selbst (kein `SaveFormatError`) werden nicht abgefangen.

- [ ] **Step 1: Abhängigkeiten installieren**

Run: `npm install idb-keyval@^6.2.1` und `npm install -D fake-indexeddb@^6.0.0`
Expected: beide in `package.json` (`dependencies` bzw. `devDependencies`), keine Fehler.

- [ ] **Step 2: Failing Tests schreiben**

`src/storage/schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SaveFormatError, deserialize, emptyState, migrate, serialize, type SaveState } from './schema';

const withDecision = (): SaveState => ({
  ...emptyState(),
  profile: { xp: 120, combo: 3, soundOn: false },
  days: { '2026-10-13': 12 },
  decisions: [
    {
      ts: 1, dateKey: '2026-10-13', mode: 'training',
      spot: { kind: 'call', shover: 'SB', position: 'BB', stack: 9, hand: 20 },
      chosen: 'call', verdict: 'correct', responseMs: 2100,
    },
  ],
  daily: { '2026-10-13': { dateKey: '2026-10-13', correct: 17, total: 20, durationMs: 80_000 } },
  runs: [{ ts: 2, dateKey: '2026-10-13', placement: 312, finalTable: false, levelsCompleted: 6, bonusXp: 60 }],
  bestRun: { ts: 2, dateKey: '2026-10-13', placement: 312, finalTable: false, levelsCompleted: 6, bonusXp: 60 },
});

describe('schema', () => {
  it('creates an empty state', () => {
    expect(emptyState()).toEqual({
      schemaVersion: 1, profile: { xp: 0, combo: 0, soundOn: true },
      days: {}, decisions: [], daily: {}, runs: [], bestRun: null,
    });
  });

  it('round-trips through serialize and deserialize', () => {
    expect(deserialize(serialize(withDecision()))).toEqual(withDecision());
    expect(deserialize(serialize(emptyState()))).toEqual(emptyState());
  });

  it('returns a copy, not the input object', () => {
    const raw = JSON.parse(serialize(withDecision()));
    const migrated = migrate(raw);
    expect(migrated).not.toBe(raw);
    expect(migrated.decisions).not.toBe(raw.decisions);
  });

  it('rejects unreadable states with a German SaveFormatError', () => {
    const bad: unknown[] = [
      null, 42, [], {},
      { ...emptyState(), schemaVersion: 2 },
      { ...emptyState(), profile: { xp: -5, combo: 0, soundOn: true } },
      { ...emptyState(), days: { '2026-10-13': 'viele' } },
      { ...emptyState(), decisions: [{ ts: 1 }] },
      { ...emptyState(), runs: [{ placement: 'erster' }] },
      { ...emptyState(), bestRun: 7 },
    ];
    for (const raw of bad) expect(() => migrate(raw)).toThrow(SaveFormatError);
    expect(() => migrate({ ...emptyState(), schemaVersion: 2 })).toThrow(/neuer/);
    expect(() => deserialize('{kaputt')).toThrow(SaveFormatError);
  });
});
```

`src/storage/store.test.ts`:
```ts
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { MAX_DECISIONS, emptyState, serialize, type SaveState } from './schema';
import { BACKUP_PREFIX, SAVE_KEY, indexedDbBackend, loadState, memoryBackend, saveState, type KeyValueBackend } from './store';

const now = new Date('2026-10-13T10:00:00Z');

describe('loadState / saveState', () => {
  it('starts empty without a saved state', async () => {
    expect(await loadState(memoryBackend(), now)).toEqual({ state: emptyState(), corruptBackup: null });
  });

  it('round-trips a saved state', async () => {
    const backend = memoryBackend();
    const state: SaveState = { ...emptyState(), profile: { xp: 900, combo: 2, soundOn: false } };
    await saveState(backend, state);
    expect((await loadState(backend, now)).state).toEqual(state);
  });

  it('backs up an unreadable state and does not overwrite it', async () => {
    const backend = memoryBackend({ [SAVE_KEY]: '{kaputt' });
    const result = await loadState(backend, now);
    expect(result.state).toEqual(emptyState());
    expect(result.corruptBackup).toEqual({ key: `${BACKUP_PREFIX}2026-10-13T10:00:00.000Z`, raw: '{kaputt' });
    expect(backend.dump()[SAVE_KEY]).toBe('{kaputt');
    expect(backend.dump()[`${BACKUP_PREFIX}2026-10-13T10:00:00.000Z`]).toBe('{kaputt');
  });

  it('propagates backend failures', async () => {
    const broken: KeyValueBackend = {
      get: () => Promise.reject(new Error('disk')),
      set: () => Promise.resolve(),
    };
    await expect(loadState(broken, now)).rejects.toThrow('disk');
  });

  it('keeps only the newest decisions when saving', async () => {
    const backend = memoryBackend();
    const decisions = Array.from({ length: MAX_DECISIONS + 3 }, (_, i) => ({
      ts: i, dateKey: '2026-10-13', mode: 'training' as const,
      spot: { kind: 'open' as const, position: 'BTN' as const, stack: 10, hand: 0 },
      chosen: 'shove' as const, verdict: 'correct' as const, responseMs: 1000,
    }));
    await saveState(backend, { ...emptyState(), decisions });
    const loaded = (await loadState(backend, now)).state;
    expect(loaded.decisions).toHaveLength(MAX_DECISIONS);
    expect(loaded.decisions[0].ts).toBe(3);
  });
});

describe('indexedDbBackend', () => {
  it('stores and reads values', async () => {
    const backend = indexedDbBackend('poker-trainer-test');
    expect(await backend.get('missing')).toBeUndefined();
    await backend.set(SAVE_KEY, serialize(emptyState()));
    expect((await loadState(backend, now)).state).toEqual(emptyState());
  });
});
```

- [ ] **Step 3: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run src/storage` → Expected: FAIL, Module `./schema` und `./store` nicht gefunden.

- [ ] **Step 4: Schema implementieren**

`src/storage/schema.ts`:
```ts
import type { DailyResult } from '../game/daily';
import type { DecisionRecord } from '../game/stats';

export const SCHEMA_VERSION = 1;
export const MAX_DECISIONS = 5000;
export const MAX_RUNS = 100;

export type RunSummary = {
  ts: number;
  dateKey: string;
  placement: number;
  finalTable: boolean;
  levelsCompleted: number;
  bonusXp: number;
};
export type Profile = { xp: number; combo: number; soundOn: boolean };
export type SaveState = {
  schemaVersion: 1;
  profile: Profile;
  days: Record<string, number>;
  decisions: DecisionRecord[];
  daily: Record<string, DailyResult>;
  runs: RunSummary[];
  bestRun: RunSummary | null;
};

export class SaveFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveFormatError';
  }
}

export function emptyState(): SaveState {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { xp: 0, combo: 0, soundOn: true },
    days: {},
    decisions: [],
    daily: {},
    runs: [],
    bestRun: null,
  };
}

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown): v is number => isNumber(v) && v >= 0;
const isString = (v: unknown): v is string => typeof v === 'string';

const MODES = ['training', 'daily', 'run'];
const VERDICTS = ['correct', 'close', 'wrong'];
const ACTIONS = ['shove', 'call', 'fold'];

function isSpot(v: unknown): boolean {
  return isObject(v) && (v.kind === 'open' || (v.kind === 'call' && isString(v.shover)))
    && isString(v.position) && isNumber(v.stack) && isNumber(v.hand);
}

function isDecision(v: unknown): boolean {
  return isObject(v) && isNumber(v.ts) && isString(v.dateKey) && MODES.includes(v.mode as string)
    && isSpot(v.spot) && ACTIONS.includes(v.chosen as string) && VERDICTS.includes(v.verdict as string)
    && isCount(v.responseMs);
}

function isDaily(v: unknown): boolean {
  return isObject(v) && isString(v.dateKey) && isCount(v.correct) && isCount(v.total) && isCount(v.durationMs);
}

function isRun(v: unknown): boolean {
  return isObject(v) && isNumber(v.ts) && isString(v.dateKey) && isCount(v.placement)
    && typeof v.finalTable === 'boolean' && isCount(v.levelsCompleted) && isCount(v.bonusXp);
}

function fail(reason: string): never {
  throw new SaveFormatError(`Spielstand nicht lesbar: ${reason}`);
}

export function migrate(raw: unknown): SaveState {
  if (!isObject(raw)) fail('kein gültiges Objekt');
  const version = raw.schemaVersion;
  if (!isNumber(version)) fail('Schema-Version fehlt');
  if (version > SCHEMA_VERSION) fail(`Version ${version} ist neuer als diese App`);
  // Future versions: convert older schemas step by step here before validating.
  if (version !== SCHEMA_VERSION) fail(`unbekannte Version ${version}`);

  const p = raw.profile;
  if (!isObject(p) || !isCount(p.xp) || !isCount(p.combo) || typeof p.soundOn !== 'boolean') fail('Profil ungültig');
  if (!isObject(raw.days) || !Object.values(raw.days).every(isCount)) fail('Tageszähler ungültig');
  if (!Array.isArray(raw.decisions) || !raw.decisions.every(isDecision)) fail('Entscheidungen ungültig');
  if (!isObject(raw.daily) || !Object.values(raw.daily).every(isDaily)) fail('Daily-Ergebnisse ungültig');
  if (!Array.isArray(raw.runs) || !raw.runs.every(isRun)) fail('Runs ungültig');
  if (raw.bestRun !== null && !isRun(raw.bestRun)) fail('Bester Run ungültig');

  return {
    schemaVersion: SCHEMA_VERSION,
    profile: { xp: p.xp, combo: p.combo, soundOn: p.soundOn },
    days: { ...(raw.days as Record<string, number>) },
    decisions: [...(raw.decisions as DecisionRecord[])],
    daily: { ...(raw.daily as Record<string, DailyResult>) },
    runs: [...(raw.runs as RunSummary[])],
    bestRun: raw.bestRun as RunSummary | null,
  };
}

export const serialize = (state: SaveState): string => JSON.stringify(state);

export function deserialize(text: string): SaveState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('kein gültiges JSON');
  }
  return migrate(raw);
}
```

- [ ] **Step 5: Store implementieren**

`src/storage/store.ts`:
```ts
import { createStore, get, set } from 'idb-keyval';
import { MAX_DECISIONS, MAX_RUNS, SaveFormatError, deserialize, emptyState, serialize, type SaveState } from './schema';

export interface KeyValueBackend {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
}

export const SAVE_KEY = 'save';
export const BACKUP_PREFIX = 'corrupt-backup:';

export type LoadResult = { state: SaveState; corruptBackup: { key: string; raw: string } | null };

export async function loadState(backend: KeyValueBackend, now: Date): Promise<LoadResult> {
  const raw = await backend.get(SAVE_KEY);
  if (raw === undefined) return { state: emptyState(), corruptBackup: null };
  try {
    return { state: deserialize(raw), corruptBackup: null };
  } catch (error) {
    if (!(error instanceof SaveFormatError)) throw error;
    const key = `${BACKUP_PREFIX}${now.toISOString()}`;
    await backend.set(key, raw);
    return { state: emptyState(), corruptBackup: { key, raw } };
  }
}

export function trimState(state: SaveState): SaveState {
  return { ...state, decisions: state.decisions.slice(-MAX_DECISIONS), runs: state.runs.slice(-MAX_RUNS) };
}

export async function saveState(backend: KeyValueBackend, state: SaveState): Promise<void> {
  await backend.set(SAVE_KEY, serialize(trimState(state)));
}

export function memoryBackend(initial: Record<string, string> = {}): KeyValueBackend & { dump(): Record<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    get: (key) => Promise.resolve(data.get(key)),
    set: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    dump: () => Object.fromEntries(data),
  };
}

export function indexedDbBackend(dbName = 'poker-trainer'): KeyValueBackend {
  const store = createStore(dbName, 'kv');
  return {
    get: (key) => get<string>(key, store),
    set: (key, value) => set(key, value, store),
  };
}
```

- [ ] **Step 6: Tests laufen lassen**

Run: `npx vitest run src/storage` → Expected: alle PASS, keine Warnungen.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/storage
git commit -m "feat(storage): Spielstand mit Schema-Version, Validierung, Backup bei Defekt und IndexedDB"
```

---

### Task 8: Session-Fassade für die Oberfläche

**Files:**
- Create: `src/game/session.ts`
- Test: `src/game/session.test.ts`

**Interfaces:**
- Consumes: `grade`, `Spot`, `Action`, `Grade`; `PushFoldData`; `SaveState`, `RunSummary`, `MAX_DECISIONS`, `MAX_RUNS`; `xpForDecision`, `rankFor`, `RankName`, `XpResult`; `incrementDay`, `localDateKey`; `DecisionMode`, `DecisionRecord`; `DailyResult`, `bestDaily`, `isBetterDaily`; `RunState`, `runPlacement`, `runBonusXp`, `completedLevels`
- Produces:
  - `type DecisionInput = { spot: Spot; chosen: Action; responseMs: number; mode: DecisionMode; now: Date }`
  - `type RankChange = { before: RankName; after: RankName; rankUp: boolean }`
  - `type DecisionOutcome = { state: SaveState; grade: Grade; xp: XpResult; record: DecisionRecord; rank: RankChange }`
  - `recordDecision(data: PushFoldData, state: SaveState, input: DecisionInput): DecisionOutcome`
  - `recordDaily(state: SaveState, result: DailyResult): { state: SaveState; accepted: boolean; isPersonalBest: boolean }` (zweites Ergebnis für denselben Tag: `accepted: false`, Stand unverändert)
  - `recordRun(state: SaveState, run: RunState, now: Date): { state: SaveState; summary: RunSummary; rank: RankChange; isPersonalBest: boolean }` (wirft bei laufendem Run; Bonus-XP werden gutgeschrieben; `bestRun` = niedrigste Platzierung)
  - `setSound(state: SaveState, soundOn: boolean): SaveState`

- [ ] **Step 1: Failing Test schreiben**

`src/game/session.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseHand } from '../engine/cards';
import type { Spot } from '../engine/pushfold';
import { makeFixture } from '../engine/test-fixtures';
import { MAX_DECISIONS, emptyState, type SaveState } from '../storage/schema';
import { applyRunAnswer, startRun, type RunState } from './endphase-run';
import { recordDaily, recordDecision, recordRun, setSound } from './session';

const data = makeFixture((h) => (84 - h) / 10);
const now = new Date(2026, 9, 13, 20, 0);
const aaOnBtn: Spot = { kind: 'open', position: 'BTN', stack: 10, hand: parseHand('AA') };
const finish = (verdicts: Array<'correct' | 'wrong'>): RunState => verdicts.reduce(applyRunAnswer, startRun());

describe('recordDecision', () => {
  it('grades, awards XP, counts the day and logs the decision without mutating the input', () => {
    const before = emptyState();
    const out = recordDecision(data, before, { spot: aaOnBtn, chosen: 'shove', responseMs: 1200, mode: 'training', now });
    expect(out.grade.verdict).toBe('correct');
    expect(out.xp).toEqual({ xp: 15, combo: 1, multiplier: 1 });
    expect(out.state.profile).toEqual({ xp: 15, combo: 1, soundOn: true });
    expect(out.state.days).toEqual({ '2026-10-13': 1 });
    expect(out.state.decisions).toEqual([out.record]);
    expect(out.record).toMatchObject({ dateKey: '2026-10-13', mode: 'training', chosen: 'shove', verdict: 'correct', responseMs: 1200 });
    expect(before).toEqual(emptyState());
  });

  it('resets the combo on a mistake', () => {
    const state: SaveState = { ...emptyState(), profile: { xp: 100, combo: 6, soundOn: true } };
    const out = recordDecision(data, state, { spot: aaOnBtn, chosen: 'fold', responseMs: 900, mode: 'run', now });
    expect(out.grade.verdict).toBe('wrong');
    expect(out.state.profile).toMatchObject({ xp: 100, combo: 0 });
  });

  it('reports a rank-up', () => {
    const state: SaveState = { ...emptyState(), profile: { xp: 495, combo: 0, soundOn: true } };
    const out = recordDecision(data, state, { spot: aaOnBtn, chosen: 'shove', responseMs: 1000, mode: 'training', now });
    expect(out.rank).toEqual({ before: 'Fish', after: 'Donkey', rankUp: true });
  });

  it('keeps at most MAX_DECISIONS decisions', () => {
    const first = recordDecision(data, emptyState(), { spot: aaOnBtn, chosen: 'shove', responseMs: 1000, mode: 'training', now });
    const full: SaveState = { ...emptyState(), decisions: Array.from({ length: MAX_DECISIONS }, () => first.record) };
    const out = recordDecision(data, full, { spot: aaOnBtn, chosen: 'fold', responseMs: 1000, mode: 'training', now });
    expect(out.state.decisions).toHaveLength(MAX_DECISIONS);
    expect(out.state.decisions[MAX_DECISIONS - 1]).toBe(out.record);
  });
});

describe('recordDaily', () => {
  const result = (correct: number) => ({ dateKey: '2026-10-13', correct, total: 20, durationMs: 70_000 });

  it('accepts one result per day', () => {
    const first = recordDaily(emptyState(), result(15));
    expect(first).toMatchObject({ accepted: true, isPersonalBest: true });
    const second = recordDaily(first.state, result(19));
    expect(second.accepted).toBe(false);
    expect(second.state).toBe(first.state);
  });

  it('flags personal bests across days', () => {
    const day1 = recordDaily(emptyState(), result(15)).state;
    expect(recordDaily(day1, { ...result(14), dateKey: '2026-10-14' }).isPersonalBest).toBe(false);
    expect(recordDaily(day1, { ...result(16), dateKey: '2026-10-14' }).isPersonalBest).toBe(true);
  });
});

describe('recordRun', () => {
  it('refuses a running run', () => {
    expect(() => recordRun(emptyState(), startRun(), now)).toThrow();
  });

  it('credits bonus XP and stores the best run', () => {
    const ft = finish(Array.from({ length: 40 }, () => 'correct' as const));
    const out = recordRun(emptyState(), ft, now);
    expect(out.summary).toMatchObject({ placement: 1, finalTable: true, levelsCompleted: 8, bonusXp: 180, dateKey: '2026-10-13' });
    expect(out.state.profile.xp).toBe(180);
    expect(out.state.bestRun).toEqual(out.summary);
    expect(out.isPersonalBest).toBe(true);

    const bust = recordRun(out.state, finish(['wrong', 'wrong', 'wrong']), now);
    expect(bust.isPersonalBest).toBe(false);
    expect(bust.state.bestRun).toEqual(out.summary);
    expect(bust.state.runs).toHaveLength(2);
  });
});

describe('setSound', () => {
  it('toggles the sound preference', () => {
    expect(setSound(emptyState(), false).profile.soundOn).toBe(false);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/game/session.test.ts` → Expected: FAIL, Modul `./session` nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/game/session.ts`:
```ts
import { type Action, type Grade, type Spot, grade } from '../engine/pushfold';
import type { PushFoldData } from '../engine/pushfold-data';
import { MAX_DECISIONS, MAX_RUNS, type RunSummary, type SaveState } from '../storage/schema';
import { type DailyResult, bestDaily, isBetterDaily } from './daily';
import { type RunState, completedLevels, runBonusXp, runPlacement } from './endphase-run';
import type { DecisionMode, DecisionRecord } from './stats';
import { incrementDay, localDateKey } from './streak';
import { type RankName, type XpResult, rankFor, xpForDecision } from './xp';

export type DecisionInput = { spot: Spot; chosen: Action; responseMs: number; mode: DecisionMode; now: Date };
export type RankChange = { before: RankName; after: RankName; rankUp: boolean };
export type DecisionOutcome = { state: SaveState; grade: Grade; xp: XpResult; record: DecisionRecord; rank: RankChange };

function rankChange(xpBefore: number, xpAfter: number): RankChange {
  const before = rankFor(xpBefore).name;
  const after = rankFor(xpAfter).name;
  return { before, after, rankUp: before !== after };
}

export function recordDecision(data: PushFoldData, state: SaveState, input: DecisionInput): DecisionOutcome {
  const g = grade(data, input.spot, input.chosen);
  const xp = xpForDecision(g.verdict, input.responseMs, state.profile.combo);
  const dateKey = localDateKey(input.now);
  const record: DecisionRecord = {
    ts: input.now.getTime(),
    dateKey,
    mode: input.mode,
    spot: input.spot,
    chosen: input.chosen,
    verdict: g.verdict,
    responseMs: input.responseMs,
  };
  const xpAfter = state.profile.xp + xp.xp;
  const next: SaveState = {
    ...state,
    profile: { ...state.profile, xp: xpAfter, combo: xp.combo },
    days: incrementDay(state.days, dateKey),
    decisions: [...state.decisions, record].slice(-MAX_DECISIONS),
  };
  return { state: next, grade: g, xp, record, rank: rankChange(state.profile.xp, xpAfter) };
}

export function recordDaily(
  state: SaveState,
  result: DailyResult,
): { state: SaveState; accepted: boolean; isPersonalBest: boolean } {
  if (state.daily[result.dateKey]) return { state, accepted: false, isPersonalBest: false };
  const isPersonalBest = isBetterDaily(result, bestDaily(Object.values(state.daily)));
  return { state: { ...state, daily: { ...state.daily, [result.dateKey]: result } }, accepted: true, isPersonalBest };
}

export function recordRun(
  state: SaveState,
  run: RunState,
  now: Date,
): { state: SaveState; summary: RunSummary; rank: RankChange; isPersonalBest: boolean } {
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
    },
    summary,
    rank: rankChange(state.profile.xp, xpAfter),
    isPersonalBest,
  };
}

export function setSound(state: SaveState, soundOn: boolean): SaveState {
  return { ...state, profile: { ...state.profile, soundOn } };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/game/session.test.ts` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/session.ts src/game/session.test.ts
git commit -m "feat(game): Session-Fassade für Entscheidungen, Daily und Run"
```

---

### Task 9: Abschlussprüfung von Plan 2

**Files:** keine neuen

- [ ] **Step 1: Gesamte Prüfung**

Run: `npm test` → Expected: alle Test-Dateien PASS, Ausgabe ohne Warnungen.
Run: `npm run typecheck` → Expected: Exit 0.
Run: `npm run check:portability` → Expected: clean. Funde (z. B. CRLF im Arbeitsverzeichnis) beheben, nicht ignorieren.

- [ ] **Step 2: Kodierung prüfen**

Run: `node -e "const fs=require('fs');const {execSync}=require('child_process');const files=execSync('git ls-files src').toString().trim().split('\n');for(const f of files){new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(f))}console.log('utf8 ok',files.length)"`
Expected: `utf8 ok <Anzahl>`, kein Fehler.

- [ ] **Step 3: Plattform festhalten**

Im Abschlussbericht angeben: verifiziert unter Windows 11, macOS nicht getestet.

## Übergabe an Plan 3

Plan 3 (Oberfläche, PWA, Deployment) nutzt aus diesem Plan: `recordDecision`, `recordDaily`, `recordRun`, `setSound`, `comparePositions`, `dailySpots`, `startRun`, `nextRunSpot`, `applyRunAnswer`, `runPlacement`, `rankFor`, `currentStreak`, `dayProgress`, `localDateKey`, `accuracy`, `accuracyBy`, `byPosition`, `byStackBucket`, `byKind`, `handErrorMatrix`, `weeklyTrend`, `adaptiveWeights`, `loadState`, `saveState`, `indexedDbBackend`, `serialize`, `deserialize` sowie aus Plan 1 `generateSpot`, `chart`, `parsePushFoldData`, `dealConcrete`, `POSITION_LABELS`.
