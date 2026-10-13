# Plan 5: Starthand-Kern (Range-Parser, Charts 40/100 BB, Bewertung, Generator) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use mindCoder:subagent-driven-development (recommended) or mindCoder:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen getesteten Rechenkern für das Starthand-Training mit tiefen Stacks bauen: Range-Notation lesen, 74 kuratierte Charts (40 und 100 BB) laden und prüfen, Entscheidungen bewerten, Spots erzeugen und Positionen vergleichen.

**Architecture:** Neues, vom Push/Fold-Teil getrenntes Modul `src/engine/preflop/` aus reinen Funktionen. Die Charts liegen als typisierte Datendateien vor; `charts.ts` baut daraus beim ersten Zugriff 13×13-Tabellen und validiert sie. Die Oberfläche (Plan 6) nutzt nur die hier definierte API.

**Tech Stack:** TypeScript 5, Vitest 3, tsx (Ausgabe-Skript).

## Global Constraints

- Spec: `docs/mindCoder/specs/2026-10-13-starthand-training-design.md` (verbindlich).
- 8-max, Positionen `UTG, UTG1, LJ, HJ, CO, BTN, SB, BB`; Stacks `40` und `100` BB; unbeteiligte Spieler folden.
- Größen: Open 2,2 BB (SB 3 BB); 3-Bet in Position 3 × Open, aus SB/BB 4 × Open; 4-Bet bei 100 BB 2,2 × 3-Bet, bei 40 BB All-in (= 40). Gerundet auf 0,1 BB.
- Aktionen: `rfi` → `raise`/`fold`; `vsOpen` → `threeBet`/`call`/`fold`; `vs3bet` → `fourBet`/`call`/`fold`.
- Chart-Schlüssel: `rfi:<stack>:<hero>` (hero UTG–SB); `vsOpen:<stack>:<opener>:<ip|sb|bb>` (`ip` = Held zwischen Opener und BTN); `vs3bet:<stack>:<hero>:<ip|blinds>` (`blinds` = 3-Bettor SB oder BB; hero UTG–SB). Je Stack 7 + 18 + 12 = 37 Charts.
- Verdict: `correct` = Hauptaktion; `close` = Grenzhand-Alternative (zählt als richtig); sonst `wrong`.
- Spot-Generator: 15 % gleichverteilte Hände; Grenzhände und Hände mit abweichender Nachbarzelle 6-fach gewichtet; Kategorien `kind|hero|stack` mit optionalen Gewichten.
- Prüfregeln (Tests): siehe Spec Abschnitt 5; Toleranzen 1 Prozentpunkt (`rfi`) bzw. 2 Prozentpunkte (`vsOpen`).
- Dateien UTF-8 mit LF, mit dem Datei-Werkzeug schreiben (Umlaute in Lernsätzen). Automation nur über `npm run`.

## Bestehende API (aus Plan 1, unverändert)

`src/engine/cards.ts`: `RANKS` (`'23456789TJQKA'`), `HAND_COUNT`, `HandClass`, `parseHand(name)`, `handName(h)`, `COMBOS`, `comboCount(h)`. `src/engine/positions.ts`: `POSITIONS`, `Position`, `POSITION_LABELS`, `seatOf(p)`. `src/engine/rng.ts`: `Rng`, `mulberry32`. `src/engine/pushfold.ts`: `Verdict`.

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/engine/preflop/ranges.ts` | Range-Notation → 169 Flags, Breite |
| `src/engine/preflop/spots.ts` | Typen, Aktionen, Chart-Schlüssel, gültige Situationen, Größen |
| `src/engine/preflop/charts-100.ts`, `charts-40.ts` | Kuratierte Chart-Daten |
| `src/engine/preflop/charts.ts` | Charts bauen, validieren, nachschlagen |
| `src/engine/preflop/grading.ts` | Bewertung, Zellen, Positions-Vergleich |
| `src/engine/preflop/generator.ts` | Gewichtete Spot-Auswahl |
| `scripts/print-charts.ts` | Breitentabelle zum Gegenlesen |

---

### Task 1: Range-Parser

**Files:**
- Create: `src/engine/preflop/ranges.ts`
- Test: `src/engine/preflop/ranges.test.ts`

**Interfaces:**
- Produces: `parseRange(text: string): boolean[]` (169 Flags, Index = `HandClass`; wirft `Error` „Ungültiger Range-Eintrag: <Eintrag>“), `rangeHands(flags: readonly boolean[]): HandClass[]`, `rangeWidth(flags: readonly boolean[]): number` (Anteil der 1326 Kombinationen)

**Notation (verbindlich):** Einträge durch Komma getrennt, Leerzeichen egal, leerer Text = leere Range.
- Paare: `QQ`, `66+` (66 bis AA), `TT-77` (beide Richtungen erlaubt)
- Nicht-Paare mit Suffix `s` oder `o`, ohne Suffix = beide: `JTs`, `AK`, `A9s+` (A9s, ATs … AKs: zweiter Rang steigt bis eins unter den ersten), `K9s-K6s` (gleicher erster Rang, gleiches Suffix, zweiter Rang von–bis in beliebiger Richtung)
- Der erste Rang muss höher sein als der zweite; alles andere ist ungültig.

- [ ] **Step 1: Failing Test schreiben**

`src/engine/preflop/ranges.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { handName } from '../cards';
import { parseRange, rangeHands, rangeWidth } from './ranges';

const names = (text: string) => rangeHands(parseRange(text)).map(handName).sort();

describe('parseRange', () => {
  it('reads pairs', () => {
    expect(names('QQ')).toEqual(['QQ']);
    expect(names('JJ+')).toEqual(['AA', 'JJ', 'KK', 'QQ']);
    expect(names('TT-88')).toEqual(['88', '99', 'TT']);
    expect(names('88-TT')).toEqual(['88', '99', 'TT']);
  });

  it('reads suited and offsuit hands, plus and dash ranges', () => {
    expect(names('A9s+')).toEqual(['A9s', 'AJs', 'AKs', 'AQs', 'ATs']);
    expect(names('KTo+')).toEqual(['KJo', 'KQo', 'KTo']);
    expect(names('K9s-K7s')).toEqual(['K7s', 'K8s', 'K9s']);
    expect(names('Q2s-Q4s')).toEqual(['Q2s', 'Q3s', 'Q4s']);
    expect(names('JTs')).toEqual(['JTs']);
  });

  it('treats a missing suffix as suited and offsuit', () => {
    expect(names('AK')).toEqual(['AKo', 'AKs']);
    expect(names('AQ+')).toEqual(['AKo', 'AKs', 'AQo', 'AQs']);
  });

  it('combines entries and ignores spaces and empty input', () => {
    expect(names(' 22 , AKs ,')).toEqual(['22', 'AKs']);
    expect(rangeHands(parseRange(''))).toEqual([]);
  });

  it('rejects invalid entries', () => {
    for (const bad of ['AX', 'KAs', 'AAs', 'A9x', 'K9s-Q7s', 'K9s-K7o', 'T', '99-8', 'AK+s']) {
      expect(() => parseRange(bad)).toThrow(`Ungültiger Range-Eintrag: ${bad}`);
    }
  });
});

describe('rangeWidth', () => {
  it('measures the share of all 1326 combos', () => {
    expect(rangeWidth(parseRange('AA'))).toBeCloseTo(6 / 1326);
    expect(rangeWidth(parseRange('AK'))).toBeCloseTo(16 / 1326);
    expect(rangeWidth(parseRange('22+, A2+, K2+, Q2+, J2+, T2+, 92+, 82+, 72+, 62+, 52+, 42+, 32'))).toBeCloseTo(1);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/engine/preflop/ranges.test.ts` → Expected: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Implementierung**

`src/engine/preflop/ranges.ts`:
```ts
import { COMBOS, HAND_COUNT, type HandClass, RANKS, parseHand } from '../cards';

const R = '[2-9TJQKA]';
const PAIR_PLUS = new RegExp(`^(${R})\\1\\+$`);
const PAIR_SPAN = new RegExp(`^(${R})\\1-(${R})\\2$`);
const PAIR = new RegExp(`^(${R})\\1$`);
const PLUS = new RegExp(`^(${R})(${R})([so]?)\\+$`);
const SPAN = new RegExp(`^(${R})(${R})([so]?)-(${R})(${R})([so]?)$`);
const SINGLE = new RegExp(`^(${R})(${R})([so]?)$`);

const rankOf = (c: string): number => RANKS.indexOf(c);
const pair = (r: number): HandClass => parseHand(RANKS[r] + RANKS[r]);

function nonPair(hi: number, lo: number, suffix: string): HandClass[] {
  const suffixes = suffix ? [suffix] : ['s', 'o'];
  return suffixes.map((s) => parseHand(RANKS[hi] + RANKS[lo] + s));
}

function span(from: number, to: number): number[] {
  const out: number[] = [];
  for (let r = Math.min(from, to); r <= Math.max(from, to); r++) out.push(r);
  return out;
}

function expand(token: string): HandClass[] | null {
  let m = PAIR_PLUS.exec(token);
  if (m) return span(rankOf(m[1]), 12).map(pair);
  m = PAIR_SPAN.exec(token);
  if (m) return span(rankOf(m[1]), rankOf(m[2])).map(pair);
  m = PAIR.exec(token);
  if (m) return [pair(rankOf(m[1]))];
  m = PLUS.exec(token);
  if (m) {
    const hi = rankOf(m[1]);
    const lo = rankOf(m[2]);
    if (lo >= hi) return null;
    return span(lo, hi - 1).flatMap((l) => nonPair(hi, l, m![3]));
  }
  m = SPAN.exec(token);
  if (m) {
    const hi = rankOf(m[1]);
    if (m[4] !== m[1] || m[6] !== m[3]) return null;
    const a = rankOf(m[2]);
    const b = rankOf(m[5]);
    if (a >= hi || b >= hi) return null;
    return span(a, b).flatMap((l) => nonPair(hi, l, m![3]));
  }
  m = SINGLE.exec(token);
  if (m) {
    const hi = rankOf(m[1]);
    const lo = rankOf(m[2]);
    if (lo >= hi) return null;
    return nonPair(hi, lo, m[3]);
  }
  return null;
}

export function parseRange(text: string): boolean[] {
  const flags = new Array<boolean>(HAND_COUNT).fill(false);
  for (const raw of text.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    const hands = expand(token);
    if (!hands) throw new Error(`Ungültiger Range-Eintrag: ${token}`);
    for (const h of hands) flags[h] = true;
  }
  return flags;
}

export function rangeHands(flags: readonly boolean[]): HandClass[] {
  const out: HandClass[] = [];
  flags.forEach((on, h) => {
    if (on) out.push(h);
  });
  return out;
}

export function rangeWidth(flags: readonly boolean[]): number {
  let combos = 0;
  flags.forEach((on, h) => {
    if (on) combos += COMBOS[h].length;
  });
  return combos / 1326;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/engine/preflop/ranges.test.ts` → Expected: PASS. Run: `npm run typecheck` → Exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/preflop/ranges.ts src/engine/preflop/ranges.test.ts
git commit -m "feat(preflop): Parser für Range-Notation"
```

---

### Task 2: Spot-Modell, Chart-Schlüssel und Größen

**Files:**
- Create: `src/engine/preflop/spots.ts`
- Test: `src/engine/preflop/spots.test.ts`

**Interfaces:**
- Produces:
  - `type PreflopKind = 'rfi' | 'vsOpen' | 'vs3bet'`, `PREFLOP_KINDS`
  - `type StackDepth = 40 | 100`, `STACK_DEPTHS: readonly StackDepth[] = [40, 100]`
  - `type PreflopAction = 'raise' | 'threeBet' | 'fourBet' | 'call' | 'fold'`
  - `type PreflopSituation = { kind: PreflopKind; stack: StackDepth; hero: Position; villain: Position | null }`, `type PreflopSpot = PreflopSituation & { hand: HandClass }`
  - `aggressiveActionOf(kind): PreflopAction` (`raise` / `threeBet` / `fourBet`), `allowedActions(kind): readonly PreflopAction[]` (aggressiv, ggf. `call`, `fold`)
  - `type ChartKey = string`, `chartKeyFor(s: PreflopSituation): ChartKey` (wirft deutschen Fehler „Ungültiger Starthand-Spot: …“ bei ungültigen Kombinationen)
  - `validSituations(): PreflopSituation[]` (alle gültigen Situationen beider Stacks)
  - `expectedChartKeys(stack: StackDepth): ChartKey[]` (eindeutig, sortiert; je Stack 37)
  - `sizesFor(s: PreflopSituation): { facing: number | null; aggressiveTo: number }` — `facing` = Einsatz, gegen den der Held antritt (Open bei `vsOpen`, 3-Bet bei `vs3bet`, `null` bei `rfi`); `aggressiveTo` = Größe der eigenen aggressiven Aktion

- [ ] **Step 1: Failing Test schreiben**

`src/engine/preflop/spots.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { aggressiveActionOf, allowedActions, chartKeyFor, expectedChartKeys, sizesFor, validSituations } from './spots';

describe('preflop spots', () => {
  it('knows the actions per kind', () => {
    expect(aggressiveActionOf('rfi')).toBe('raise');
    expect(aggressiveActionOf('vsOpen')).toBe('threeBet');
    expect(aggressiveActionOf('vs3bet')).toBe('fourBet');
    expect(allowedActions('rfi')).toEqual(['raise', 'fold']);
    expect(allowedActions('vsOpen')).toEqual(['threeBet', 'call', 'fold']);
  });

  it('maps situations to grouped chart keys', () => {
    expect(chartKeyFor({ kind: 'rfi', stack: 100, hero: 'CO', villain: null })).toBe('rfi:100:CO');
    expect(chartKeyFor({ kind: 'vsOpen', stack: 40, hero: 'BTN', villain: 'HJ' })).toBe('vsOpen:40:HJ:ip');
    expect(chartKeyFor({ kind: 'vsOpen', stack: 100, hero: 'SB', villain: 'CO' })).toBe('vsOpen:100:CO:sb');
    expect(chartKeyFor({ kind: 'vsOpen', stack: 100, hero: 'BB', villain: 'SB' })).toBe('vsOpen:100:SB:bb');
    expect(chartKeyFor({ kind: 'vs3bet', stack: 100, hero: 'UTG', villain: 'CO' })).toBe('vs3bet:100:UTG:ip');
    expect(chartKeyFor({ kind: 'vs3bet', stack: 40, hero: 'BTN', villain: 'BB' })).toBe('vs3bet:40:BTN:blinds');
    expect(chartKeyFor({ kind: 'vs3bet', stack: 40, hero: 'SB', villain: 'BB' })).toBe('vs3bet:40:SB:blinds');
  });

  it('rejects impossible situations', () => {
    expect(() => chartKeyFor({ kind: 'rfi', stack: 100, hero: 'BB', villain: null })).toThrow(/Ungültiger Starthand-Spot/);
    expect(() => chartKeyFor({ kind: 'vsOpen', stack: 100, hero: 'UTG', villain: 'CO' })).toThrow(/Ungültiger Starthand-Spot/);
    expect(() => chartKeyFor({ kind: 'vsOpen', stack: 100, hero: 'CO', villain: 'BB' })).toThrow(/Ungültiger Starthand-Spot/);
    expect(() => chartKeyFor({ kind: 'vs3bet', stack: 100, hero: 'BB', villain: 'SB' })).toThrow(/Ungültiger Starthand-Spot/);
    expect(() => chartKeyFor({ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'HJ' })).toThrow(/Ungültiger Starthand-Spot/);
  });

  it('lists 37 chart keys per stack', () => {
    const keys = expectedChartKeys(100);
    expect(keys).toHaveLength(37);
    expect(keys.filter((k) => k.startsWith('rfi:'))).toHaveLength(7);
    expect(keys.filter((k) => k.startsWith('vsOpen:'))).toHaveLength(18);
    expect(keys.filter((k) => k.startsWith('vs3bet:'))).toHaveLength(12);
    expect(new Set(expectedChartKeys(40).map((k) => k.replace(':40:', ':100:')))).toEqual(new Set(keys));
  });

  it('enumerates every valid situation once', () => {
    const all = validSituations();
    expect(all.filter((s) => s.kind === 'rfi')).toHaveLength(14);
    expect(all.filter((s) => s.kind === 'vsOpen')).toHaveLength(56);
    expect(all.filter((s) => s.kind === 'vs3bet')).toHaveLength(56);
  });

  it('computes the fixed bet sizes', () => {
    expect(sizesFor({ kind: 'rfi', stack: 100, hero: 'CO', villain: null })).toEqual({ facing: null, aggressiveTo: 2.2 });
    expect(sizesFor({ kind: 'rfi', stack: 100, hero: 'SB', villain: null })).toEqual({ facing: null, aggressiveTo: 3 });
    expect(sizesFor({ kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO' })).toEqual({ facing: 2.2, aggressiveTo: 6.6 });
    expect(sizesFor({ kind: 'vsOpen', stack: 100, hero: 'BB', villain: 'SB' })).toEqual({ facing: 3, aggressiveTo: 12 });
    expect(sizesFor({ kind: 'vs3bet', stack: 100, hero: 'HJ', villain: 'BB' })).toEqual({ facing: 8.8, aggressiveTo: 19.4 });
    expect(sizesFor({ kind: 'vs3bet', stack: 40, hero: 'CO', villain: 'BTN' })).toEqual({ facing: 6.6, aggressiveTo: 40 });
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/engine/preflop/spots.test.ts` → Expected: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Implementierung**

`src/engine/preflop/spots.ts`:
```ts
import type { HandClass } from '../cards';
import { POSITIONS, type Position, seatOf } from '../positions';

export type PreflopKind = 'rfi' | 'vsOpen' | 'vs3bet';
export const PREFLOP_KINDS: readonly PreflopKind[] = ['rfi', 'vsOpen', 'vs3bet'];
export type StackDepth = 40 | 100;
export const STACK_DEPTHS: readonly StackDepth[] = [40, 100];
export type PreflopAction = 'raise' | 'threeBet' | 'fourBet' | 'call' | 'fold';
export type PreflopSituation = { kind: PreflopKind; stack: StackDepth; hero: Position; villain: Position | null };
export type PreflopSpot = PreflopSituation & { hand: HandClass };
export type ChartKey = string;

const OPEN_RAISE = 2.2;
const SB_OPEN_RAISE = 3;
const THREE_BET_IP = 3;
const THREE_BET_BLINDS = 4;
const FOUR_BET = 2.2;
const SB = seatOf('SB');
const BB = seatOf('BB');

const isBlind = (p: Position) => seatOf(p) >= SB;
const round1 = (x: number) => Math.round(x * 10) / 10;

export function aggressiveActionOf(kind: PreflopKind): PreflopAction {
  if (kind === 'rfi') return 'raise';
  return kind === 'vsOpen' ? 'threeBet' : 'fourBet';
}

export function allowedActions(kind: PreflopKind): readonly PreflopAction[] {
  return kind === 'rfi' ? ['raise', 'fold'] : [aggressiveActionOf(kind), 'call', 'fold'];
}

function invalid(s: PreflopSituation): never {
  throw new Error(`Ungültiger Starthand-Spot: ${s.kind} ${s.stack} BB, ${s.hero} gegen ${s.villain ?? '–'}`);
}

export function chartKeyFor(s: PreflopSituation): ChartKey {
  const hero = seatOf(s.hero);
  if (s.kind === 'rfi') {
    if (s.villain !== null || hero > SB) invalid(s);
    return `rfi:${s.stack}:${s.hero}`;
  }
  if (s.villain === null) invalid(s);
  const villain = seatOf(s.villain);
  if (s.kind === 'vsOpen') {
    if (villain > SB || hero <= villain) invalid(s);
    const group = hero === SB ? 'sb' : hero === BB ? 'bb' : 'ip';
    return `vsOpen:${s.stack}:${s.villain}:${group}`;
  }
  if (hero > SB || villain <= hero) invalid(s);
  const group = isBlind(s.villain) ? 'blinds' : 'ip';
  return `vs3bet:${s.stack}:${s.hero}:${group}`;
}

export function validSituations(): PreflopSituation[] {
  const out: PreflopSituation[] = [];
  for (const stack of STACK_DEPTHS) {
    for (let h = 0; h <= SB; h++) out.push({ kind: 'rfi', stack, hero: POSITIONS[h], villain: null });
    for (let v = 0; v <= SB; v++) {
      for (let h = v + 1; h <= BB; h++) out.push({ kind: 'vsOpen', stack, hero: POSITIONS[h], villain: POSITIONS[v] });
    }
    for (let h = 0; h <= SB; h++) {
      for (let v = h + 1; v <= BB; v++) out.push({ kind: 'vs3bet', stack, hero: POSITIONS[h], villain: POSITIONS[v] });
    }
  }
  return out;
}

export function expectedChartKeys(stack: StackDepth): ChartKey[] {
  const keys = new Set(validSituations().filter((s) => s.stack === stack).map(chartKeyFor));
  return [...keys].sort();
}

const openSize = (opener: Position) => (opener === 'SB' ? SB_OPEN_RAISE : OPEN_RAISE);
const threeBetSize = (open: number, threeBettor: Position) =>
  round1(open * (isBlind(threeBettor) ? THREE_BET_BLINDS : THREE_BET_IP));

export function sizesFor(s: PreflopSituation): { facing: number | null; aggressiveTo: number } {
  chartKeyFor(s);
  if (s.kind === 'rfi') return { facing: null, aggressiveTo: openSize(s.hero) };
  if (s.kind === 'vsOpen') {
    const open = openSize(s.villain!);
    return { facing: open, aggressiveTo: threeBetSize(open, s.hero) };
  }
  const threeBet = threeBetSize(openSize(s.hero), s.villain!);
  return { facing: threeBet, aggressiveTo: s.stack === 40 ? 40 : round1(threeBet * FOUR_BET) };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/engine/preflop` → Expected: PASS. Run: `npm run typecheck` → Exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/preflop/spots.ts src/engine/preflop/spots.test.ts
git commit -m "feat(preflop): Spot-Modell, Chart-Schlüssel, gültige Situationen und Einsatzgrößen"
```

---

### Task 3: Charts für 40 und 100 BB, Validierung und Ausgabe-Skript

**Files:**
- Create: `src/engine/preflop/charts.ts`, `src/engine/preflop/charts-100.ts`, `src/engine/preflop/charts-40.ts`, `scripts/print-charts.ts`
- Modify: `package.json` (Skript `charts:print`)
- Test: `src/engine/preflop/charts.test.ts`

**Interfaces:**
- Consumes: `parseRange`, `rangeWidth`; `ChartKey`, `PreflopAction`, `PreflopKind`, `PreflopSituation`, `StackDepth`, `STACK_DEPTHS`, `aggressiveActionOf`, `allowedActions`, `chartKeyFor`, `expectedChartKeys`; `parseHand`, `handName`, `HAND_COUNT`
- Produces:
  - `type PreflopChartDef = { id: ChartKey; aggressive: string; call: string; close: Readonly<Record<string, PreflopAction>>; note: string }`
  - `type PreflopChart = { key: ChartKey; kind: PreflopKind; stack: StackDepth; aggressive: readonly boolean[]; call: readonly boolean[]; close: ReadonlyMap<HandClass, PreflopAction>; note: string }`
  - `buildChart(def: PreflopChartDef): PreflopChart` — wirft deutsche Fehler bei unbekanntem Typ/Stack, Calls in einem `rfi`-Chart, einer Hand in beiden Ranges, ungültiger Grenzhand (Alternative nicht erlaubt oder gleich der Hauptaktion) und leerem Lernsatz
  - `allCharts(): ReadonlyMap<ChartKey, PreflopChart>` (gecacht; doppelte IDs sind ein Fehler)
  - `chartFor(s: PreflopSituation): PreflopChart` (Fehler „Chart fehlt: <key>“)
  - `mainActionOf(chart: PreflopChart, hand: HandClass): PreflopAction`
  - `continueRange(chart: PreflopChart): boolean[]` (aggressiv oder Call)
  - `CHARTS_100`, `CHARTS_40: readonly PreflopChartDef[]`
  - `npm run charts:print`

Die Chart-Daten unten sind fachlich kuratiert und **wörtlich** zu übernehmen. Schlägt ein Validierungstest fehl, wird **nicht** der Test gelockert und **nicht** eigenmächtig ein Chart geändert: Status DONE_WITH_CONCERNS mit der genauen Fehlermeldung melden (der Controller korrigiert die Daten).

- [ ] **Step 1: Failing Tests schreiben**

`src/engine/preflop/charts.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { handName, parseHand } from '../cards';
import type { Position } from '../positions';
import { allCharts, buildChart, continueRange, mainActionOf, type PreflopChart } from './charts';
import { rangeWidth } from './ranges';
import { STACK_DEPTHS, expectedChartKeys } from './spots';

describe('buildChart', () => {
  const base = { id: 'vsOpen:100:UTG:ip', aggressive: 'AA', call: 'KK', close: {}, note: 'Lernsatz' };

  it('builds a valid chart', () => {
    const chart = buildChart({ ...base, close: { KK: 'fold' } });
    expect(chart).toMatchObject({ key: 'vsOpen:100:UTG:ip', kind: 'vsOpen', stack: 100, note: 'Lernsatz' });
    expect(mainActionOf(chart, parseHand('AA'))).toBe('threeBet');
    expect(mainActionOf(chart, parseHand('KK'))).toBe('call');
    expect(mainActionOf(chart, parseHand('72o'))).toBe('fold');
    expect(chart.close.get(parseHand('KK'))).toBe('fold');
  });

  it('rejects broken definitions', () => {
    expect(() => buildChart({ ...base, id: 'limp:100:UTG' })).toThrow();
    expect(() => buildChart({ ...base, id: 'vsOpen:60:UTG:ip' })).toThrow();
    expect(() => buildChart({ ...base, id: 'rfi:100:UTG', call: 'KK' })).toThrow();
    expect(() => buildChart({ ...base, call: 'AA' })).toThrow();
    expect(() => buildChart({ ...base, close: { AA: 'threeBet' } })).toThrow();
    expect(() => buildChart({ ...base, close: { AA: 'raise' } })).toThrow();
    expect(() => buildChart({ ...base, close: { XY: 'fold' } })).toThrow();
    expect(() => buildChart({ ...base, note: ' ' })).toThrow();
  });
});

describe.each(STACK_DEPTHS)('charts for %i BB', (stack) => {
  const charts = allCharts();
  const get = (key: string): PreflopChart => {
    const chart = charts.get(key);
    if (!chart) throw new Error(`missing ${key}`);
    return chart;
  };
  const cont = (key: string) => rangeWidth(continueRange(get(key)));

  it('has exactly the expected charts', () => {
    const keys = [...charts.keys()].filter((k) => k.split(':')[1] === String(stack)).sort();
    expect(keys).toEqual(expectedChartKeys(stack));
  });

  it('always plays AA and KK aggressively', () => {
    for (const key of expectedChartKeys(stack)) {
      for (const hand of ['AA', 'KK']) expect(get(key).aggressive[parseHand(hand)], `${key} ${hand}`).toBe(true);
    }
  });

  it('opens wider from later positions (tolerance 1 point)', () => {
    const order: Position[] = ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN'];
    for (let i = 0; i + 1 < order.length; i++) {
      const a = rangeWidth(get(`rfi:${stack}:${order[i]}`).aggressive);
      const b = rangeWidth(get(`rfi:${stack}:${order[i + 1]}`).aggressive);
      expect(b, `${order[i + 1]} vs ${order[i]}`).toBeGreaterThanOrEqual(a - 0.01);
    }
  });

  it('defends wider against later openers (tolerance 2 points)', () => {
    const groups: Record<string, Position[]> = {
      ip: ['UTG', 'UTG1', 'LJ', 'HJ', 'CO'],
      sb: ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN'],
      bb: ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB'],
    };
    for (const [group, openers] of Object.entries(groups)) {
      for (let i = 0; i + 1 < openers.length; i++) {
        const earlier = cont(`vsOpen:${stack}:${openers[i]}:${group}`);
        const later = cont(`vsOpen:${stack}:${openers[i + 1]}:${group}`);
        expect(later, `${group} vs ${openers[i + 1]} vs ${openers[i]}`).toBeGreaterThanOrEqual(earlier - 0.02);
      }
    }
  });

  it('defends at least as wide from the big blind as in position', () => {
    for (const opener of ['UTG', 'UTG1', 'LJ', 'HJ', 'CO']) {
      expect(cont(`vsOpen:${stack}:${opener}:bb`), opener).toBeGreaterThanOrEqual(cont(`vsOpen:${stack}:${opener}:ip`));
    }
  });

  it('continues against a 3-bet only with hands it opened', () => {
    for (const key of expectedChartKeys(stack).filter((k) => k.startsWith('vs3bet:'))) {
      const hero = key.split(':')[2];
      const opened = get(`rfi:${stack}:${hero}`).aggressive;
      continueRange(get(key)).forEach((on, hand) => {
        if (on) expect(opened[hand], `${key} ${handName(hand)}`).toBe(true);
      });
    }
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npx vitest run src/engine/preflop/charts.test.ts` → Expected: FAIL, Modul `./charts` nicht gefunden.

- [ ] **Step 3: `charts.ts` implementieren**

`src/engine/preflop/charts.ts`:
```ts
import { HAND_COUNT, type HandClass, handName, parseHand } from '../cards';
import { CHARTS_40 } from './charts-40';
import { CHARTS_100 } from './charts-100';
import { parseRange } from './ranges';
import {
  type ChartKey,
  type PreflopAction,
  type PreflopKind,
  type PreflopSituation,
  type StackDepth,
  aggressiveActionOf,
  allowedActions,
  chartKeyFor,
} from './spots';

export type PreflopChartDef = {
  id: ChartKey;
  aggressive: string;
  call: string;
  close: Readonly<Record<string, PreflopAction>>;
  note: string;
};

export type PreflopChart = {
  key: ChartKey;
  kind: PreflopKind;
  stack: StackDepth;
  aggressive: readonly boolean[];
  call: readonly boolean[];
  close: ReadonlyMap<HandClass, PreflopAction>;
  note: string;
};

const KINDS: readonly string[] = ['rfi', 'vsOpen', 'vs3bet'];

function mainAction(kind: PreflopKind, aggressive: readonly boolean[], call: readonly boolean[], hand: HandClass): PreflopAction {
  if (aggressive[hand]) return aggressiveActionOf(kind);
  return call[hand] ? 'call' : 'fold';
}

export function buildChart(def: PreflopChartDef): PreflopChart {
  const [kindText, stackText] = def.id.split(':');
  if (!KINDS.includes(kindText)) throw new Error(`Unbekannter Chart-Typ: ${def.id}`);
  const kind = kindText as PreflopKind;
  const stack = Number(stackText);
  if (stack !== 40 && stack !== 100) throw new Error(`Unbekannte Stacktiefe: ${def.id}`);
  const aggressive = parseRange(def.aggressive);
  const call = parseRange(def.call);
  if (kind === 'rfi' && call.some(Boolean)) throw new Error(`Ein Open-Raise-Chart hat keine Calls: ${def.id}`);
  for (let h = 0; h < HAND_COUNT; h++) {
    if (aggressive[h] && call[h]) throw new Error(`Hand doppelt in ${def.id}: ${handName(h)}`);
  }
  const allowed = allowedActions(kind);
  const close = new Map<HandClass, PreflopAction>();
  for (const [name, alternative] of Object.entries(def.close)) {
    const hand = parseHand(name);
    if (!allowed.includes(alternative) || alternative === mainAction(kind, aggressive, call, hand)) {
      throw new Error(`Ungültige Grenzhand ${name} in ${def.id}`);
    }
    close.set(hand, alternative);
  }
  if (!def.note.trim()) throw new Error(`Lernsatz fehlt: ${def.id}`);
  return { key: def.id, kind, stack, aggressive, call, close, note: def.note };
}

let cache: Map<ChartKey, PreflopChart> | null = null;

export function allCharts(): ReadonlyMap<ChartKey, PreflopChart> {
  if (!cache) {
    const charts = new Map<ChartKey, PreflopChart>();
    for (const def of [...CHARTS_100, ...CHARTS_40]) {
      if (charts.has(def.id)) throw new Error(`Chart doppelt: ${def.id}`);
      charts.set(def.id, buildChart(def));
    }
    cache = charts;
  }
  return cache;
}

export function chartFor(s: PreflopSituation): PreflopChart {
  const key = chartKeyFor(s);
  const chart = allCharts().get(key);
  if (!chart) throw new Error(`Chart fehlt: ${key}`);
  return chart;
}

export const mainActionOf = (chart: PreflopChart, hand: HandClass): PreflopAction =>
  mainAction(chart.kind, chart.aggressive, chart.call, hand);

export const continueRange = (chart: PreflopChart): boolean[] => chart.aggressive.map((on, h) => on || chart.call[h]);
```

- [ ] **Step 4: Chart-Daten 100 BB übernehmen**

`src/engine/preflop/charts-100.ts`:
```ts
import type { PreflopChartDef } from './charts';

export const CHARTS_100: readonly PreflopChartDef[] = [
  // Open-Raise (alle folden zu dir)
  { id: 'rfi:100:UTG', aggressive: '44+, A8s+, A5s-A4s, K9s+, QTs+, JTs, T9s, 98s, ATo+, KQo', call: '', close: { '44': 'fold', '98s': 'fold', ATo: 'fold' }, note: 'Aus früher Position eng öffnen: Hinter dir sitzen noch sieben Spieler.' },
  { id: 'rfi:100:UTG1', aggressive: '33+, A7s+, A5s-A3s, K9s+, Q9s+, J9s+, T9s, 98s, ATo+, KJo+', call: '', close: { '33': 'fold', J9s: 'fold', KJo: 'fold' }, note: 'Etwas breiter als UTG, aber Offsuit-Hände bleiben stark eingeschränkt.' },
  { id: 'rfi:100:LJ', aggressive: '22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 98s, 87s, ATo+, KJo+, QJo', call: '', close: { '22': 'fold', K8s: 'fold', QJo: 'fold' }, note: 'Alle Asse suited kommen dazu: Sie spielen gut gegen Calls und blocken gegnerische Asse.' },
  { id: 'rfi:100:HJ', aggressive: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A9o+, KTo+, QTo+, JTo', call: '', close: { K6s: 'fold', '65s': 'fold', A9o: 'fold' }, note: 'Ab dem Hijack werden Suited Connectors und Offsuit-Broadways profitabel.' },
  { id: 'rfi:100:CO', aggressive: '22+, A2s+, K3s+, Q6s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A7o+, K9o+, Q9o+, J9o+', call: '', close: { K3s: 'fold', '54s': 'fold', A7o: 'fold', J9o: 'fold' }, note: 'Nur noch drei Spieler hinter dir: deutlich breiter öffnen, auch schwächere suited Hände.' },
  { id: 'rfi:100:BTN', aggressive: '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K7o+, Q8o+, J8o+, T8o+, 98o', call: '', close: { J4s: 'fold', '43s': 'fold', K7o: 'fold', T8o: 'fold' }, note: 'Am Button die breiteste Range: Nach dem Flop hast du immer Position.' },
  { id: 'rfi:100:SB', aggressive: '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, A2o+, K8o+, Q9o+, J9o+, T9o', call: '', close: { J4s: 'fold', '53s': 'fold', K8o: 'fold', T9o: 'fold' }, note: 'Aus dem SB nur gegen den BB: breit raisen oder folden. Limps sind hier nicht Teil des Trainings.' },

  // Gegen Open-Raise
  { id: 'vsOpen:100:UTG:ip', aggressive: 'QQ+, AKs, AKo, A5s', call: 'JJ-77, AQs-ATs, KQs-KJs, QJs, JTs, T9s, AQo', close: { A5s: 'fold', '77': 'fold', AQo: 'fold' }, note: 'Gegen einen UTG-Open eng verteidigen: Dominierte Hände wie KJo oder AJo verlieren viel Geld.' },
  { id: 'vsOpen:100:UTG:sb', aggressive: 'QQ+, AKs, AKo, AQs, A5s-A4s', call: 'JJ-99, AJs, KQs', close: { A4s: 'fold', '99': 'fold', AJs: 'fold' }, note: 'Aus dem SB gegen UTG fast nur 3-Bet oder Fold: Callen ohne Position ist teuer.' },
  { id: 'vsOpen:100:UTG:bb', aggressive: 'QQ+, AKs, AKo, A5s-A4s', call: 'JJ-22, AQs-A6s, A3s-A2s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s-T8s, 98s, 87s, 76s, 65s, 54s, AQo-ATo, KQo-KJo', close: { '22': 'fold', '54s': 'fold', ATo: 'fold', KJo: 'fold' }, note: 'Der BB bekommt einen guten Preis, aber gegen UTG bleiben schwache Offsuit-Hände ein Fold.' },
  { id: 'vsOpen:100:UTG1:ip', aggressive: 'QQ+, AKs, AKo, A5s', call: 'JJ-66, AQs-ATs, KQs-KJs, QJs, JTs, T9s, AQo', close: { A5s: 'fold', '66': 'fold', AQo: 'fold' }, note: 'Gegen UTG+1 kaum breiter als gegen UTG: Die Open-Range ist immer noch stark.' },
  { id: 'vsOpen:100:UTG1:sb', aggressive: 'QQ+, AKs, AKo, AQs, A5s-A4s', call: 'JJ-88, AJs, KQs', close: { A4s: 'fold', '88': 'fold', AJs: 'fold' }, note: 'Aus dem SB bevorzugt 3-betten: Wer callt, spielt den ganzen Pot ohne Position.' },
  { id: 'vsOpen:100:UTG1:bb', aggressive: 'QQ+, AKs, AKo, A5s-A4s', call: 'JJ-22, AQs-A6s, A3s-A2s, KQs-K8s, QJs-Q8s, JTs-J8s, T9s-T8s, 97s+, 87s, 76s, 65s, 54s, AQo-A9o, KQo-KJo', close: { '22': 'fold', '54s': 'fold', A9o: 'fold', KJo: 'fold' }, note: 'Im BB suited Hände großzügig verteidigen: Sie realisieren ihre Equity auch ohne Position.' },
  { id: 'vsOpen:100:LJ:ip', aggressive: 'JJ+, AQs+, AKo, A5s-A4s', call: 'TT-55, AJs-ATs, KQs-KTs, QJs-QTs, JTs, T9s, 98s, AQo', close: { '55': 'fold', '98s': 'fold', A4s: 'fold', JJ: 'call' }, note: 'Gegen LJ etwas breiter callen und A5s/A4s als 3-Bet-Bluffs nutzen.' },
  { id: 'vsOpen:100:LJ:sb', aggressive: 'JJ+, AQs+, AKo, AQo, A5s-A4s, KQs', call: 'TT-88, AJs, KJs', close: { '88': 'fold', KJs: 'fold', AQo: 'fold' }, note: 'Aus dem SB gegen LJ: 3-Bet mit Value und ein paar suited Assen, sonst meist Fold.' },
  { id: 'vsOpen:100:LJ:bb', aggressive: 'JJ+, AQs+, AKo, A5s-A3s', call: 'TT-22, AJs-A6s, A2s, KQs-K7s, QJs-Q8s, JTs-J8s, T9s-T8s, 97s+, 86s+, 76s, 65s, 54s, AQo-A9o, KQo-KTo, QJo', close: { '22': 'fold', '86s': 'fold', KTo: 'fold', QJo: 'fold' }, note: 'Je später der Open, desto breiter verteidigt der BB, vor allem mit suited Händen.' },
  { id: 'vsOpen:100:HJ:ip', aggressive: 'JJ+, AQs+, AKo, AQo, A5s-A3s, KQs', call: 'TT-44, AJs-A9s, KJs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, AJo, KQo', close: { '44': 'fold', '87s': 'fold', KQo: 'fold', A3s: 'fold' }, note: 'Gegen HJ wird KQs zur 3-Bet, kleine Paare callen wegen der Chance auf ein Set.' },
  { id: 'vsOpen:100:HJ:sb', aggressive: 'TT+, AJs+, AKo, AQo, A5s-A3s, KQs, KJs, QJs', call: '99-77', close: { '77': 'fold', QJs: 'fold', A3s: 'fold' }, note: 'Aus dem SB polarisiert 3-betten: starke Hände und einige suited Broadways.' },
  { id: 'vsOpen:100:HJ:bb', aggressive: 'JJ+, AQs+, AKo, AQo, A5s-A2s, KQs', call: 'TT-22, AJs-A6s, KJs-K6s, QJs-Q7s, JTs-J7s, T9s-T7s, 96s+, 86s+, 75s+, 65s, 54s, AJo-A8o, KQo-KTo, QJo-QTo, JTo', close: { '22': 'fold', '75s': 'fold', A8o: 'fold', JTo: 'fold' }, note: 'Gegen HJ verteidigt der BB schon fast ein Drittel seiner Hände.' },
  { id: 'vsOpen:100:CO:ip', aggressive: 'TT+, AJs+, A5s-A2s, KQs-KJs, QJs, AQo+, KQo', call: '99-22, ATs-A6s, KTs-K9s, QTs-Q9s, JTs-J9s, T9s-T8s, 98s, 87s, 76s, 65s, AJo-ATo, KJo, QJo', close: { '22': 'fold', '65s': 'fold', ATo: 'fold', QJo: 'fold', KQo: 'call' }, note: 'Button gegen Cutoff: dank Position breit callen, A5s bis A2s als 3-Bet-Bluffs.' },
  { id: 'vsOpen:100:CO:sb', aggressive: 'TT+, ATs+, A5s-A2s, KJs+, QJs, JTs, AJo+, KQo', call: '99-66', close: { '66': 'fold', JTs: 'fold', A2s: 'fold' }, note: 'SB gegen Cutoff: 3-Bet oder Fold, Calls nur mit mittleren Paaren.' },
  { id: 'vsOpen:100:CO:bb', aggressive: 'TT+, AJs+, AKo, AQo, A5s-A2s, KQs-KJs', call: '99-22, ATs-A6s, KTs-K4s, QJs-Q6s, JTs-J7s, T9s-T6s, 95s+, 85s+, 74s+, 64s+, 53s+, AJo-A5o, KQo-K9o, QJo-Q9o, JTo-J9o, T9o', close: { '22': 'fold', '53s': 'fold', A5o: 'fold', T9o: 'fold' }, note: 'Gegen einen späten Open verteidigt der BB sehr breit, weil der Preis gut ist.' },
  { id: 'vsOpen:100:BTN:sb', aggressive: '99+, A8s+, A5s-A2s, K9s+, QTs+, JTs, T9s, ATo+, KJo+', call: '88-55', close: { '55': 'fold', T9s: 'fold', KJo: 'fold' }, note: 'SB gegen Button: aggressiv 3-betten, denn die Button-Range ist breit.' },
  { id: 'vsOpen:100:BTN:bb', aggressive: '99+, A9s+, A5s-A2s, K9s+, QJs, AJo+, KQo', call: '88-22, A8s-A6s, K8s-K2s, QTs-Q2s, JTs-J4s, T9s-T6s, 95s+, 85s+, 74s+, 63s+, 53s+, 43s, ATo-A2o, KJo-K8o, QJo-Q9o, JTo-J9o, T9o-T8o, 98o-97o, 87o, 76o', close: { '22': 'fold', '43s': 'fold', '76o': 'fold', K8o: 'fold', '99': 'call' }, note: 'Gegen den Button verteidigt der BB etwa die Hälfte seiner Hände.' },
  { id: 'vsOpen:100:SB:bb', aggressive: '88+, A7s+, A5s-A2s, K8s+, Q9s+, J9s+, T9s, ATo+, KTo+, QJo', call: '77-22, A6s, K7s-K2s, Q8s-Q2s, J8s-J2s, T8s-T3s, 92s+, 82s+, 73s+, 62s+, 52s+, 42s+, 32s, A9o-A2o, K9o-K2o, QTo-Q5o, J8o+, T7o+, 97o+, 86o+, 75o+, 65o, 54o', close: { '22': 'fold', '32s': 'fold', K2o: 'fold', '54o': 'fold', '88': 'call' }, note: 'Gegen einen SB-Open hat der BB Position: die breiteste Verteidigung überhaupt.' },

  // Gegen 3-Bet (du hast geöffnet)
  { id: 'vs3bet:100:UTG:ip', aggressive: 'KK+, AKs, A5s', call: 'QQ-99, AKo, AQs-AJs, KQs', close: { AKo: 'fourBet', '99': 'fold', A5s: 'fold' }, note: 'Gegen eine 3-Bet in Position nur mit starken Händen weiter: QQ und AKo meist callen.' },
  { id: 'vs3bet:100:UTG:blinds', aggressive: 'KK+, AKs, AKo, A5s', call: 'QQ-88, AQs-ATs, KQs-KJs, QJs, JTs, AQo', close: { '88': 'fold', AQo: 'fold', A5s: 'fold' }, note: 'Gegen eine 3-Bet aus den Blinds etwas breiter callen: Du hast danach Position.' },
  { id: 'vs3bet:100:UTG1:ip', aggressive: 'KK+, AKs, A5s', call: 'QQ-88, AKo, AQs-AJs, KQs-KJs', close: { '88': 'fold', KJs: 'fold', A5s: 'fold' }, note: 'Die 3-Bet-Range eines Spielers in Position ist stark: Mittelstarke Hände folden.' },
  { id: 'vs3bet:100:UTG1:blinds', aggressive: 'KK+, AKs, AKo, A5s-A4s', call: 'QQ-77, AQs-ATs, KQs-KTs, QJs, JTs, T9s, AQo, AJo', close: { '77': 'fold', AJo: 'fold', A4s: 'fold' }, note: 'Mit Position gegen die Blinds lassen sich auch suited Connectors callen.' },
  { id: 'vs3bet:100:LJ:ip', aggressive: 'QQ+, AKs, AKo, A5s', call: 'JJ-77, AQs-ATs, KQs-KJs, QJs, JTs, AQo', close: { '77': 'fold', AQo: 'fold', A5s: 'fold' }, note: 'Ab LJ werden QQ und AK zur 4-Bet, A5s ist der klassische 4-Bet-Bluff.' },
  { id: 'vs3bet:100:LJ:blinds', aggressive: 'QQ+, AKs, AKo, A5s-A4s', call: 'JJ-66, AQs-A9s, KQs-KTs, QJs-QTs, JTs, T9s, 98s, AQo, AJo, KQo', close: { '66': 'fold', '98s': 'fold', KQo: 'fold', A4s: 'fold' }, note: 'Gegen die Blinds mit Position weiter, auch mit KQo und suited Broadways.' },
  { id: 'vs3bet:100:HJ:ip', aggressive: 'QQ+, AKs, AKo, A5s-A4s', call: 'JJ-66, AQs-ATs, KQs-KTs, QJs-QTs, JTs, T9s, AQo, AJo', close: { '66': 'fold', AJo: 'fold', A4s: 'fold' }, note: 'Gegen eine 3-Bet vom Cutoff oder Button kleine Paare nur noch selten callen.' },
  { id: 'vs3bet:100:HJ:blinds', aggressive: 'QQ+, AQs+, AKo, A5s-A3s', call: 'JJ-55, AJs-A9s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, AQo, AJo, KQo', close: { '55': 'fold', '87s': 'fold', KQo: 'fold', A3s: 'fold', AQs: 'call' }, note: 'Die Blinds 3-betten gegen HJ breiter, deshalb verteidigst du mehr Hände.' },
  { id: 'vs3bet:100:CO:ip', aggressive: 'QQ+, AKs, AKo, A5s-A3s', call: 'JJ-55, AQs-A9s, KQs-KTs, QJs-QTs, JTs, T9s, 98s, AQo, AJo, KQo', close: { '55': 'fold', '98s': 'fold', KQo: 'fold', A3s: 'fold' }, note: 'Cutoff gegen Button-3-Bet: Der Button 3-bettet breit, also solide verteidigen.' },
  { id: 'vs3bet:100:CO:blinds', aggressive: 'JJ+, AQs+, AKo, AQo, A5s-A2s', call: 'TT-33, AJs-A8s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s-T8s, 98s, 87s, 76s, AJo, KQo, KJo', close: { '33': 'fold', '76s': 'fold', KJo: 'fold', AQo: 'call', A2s: 'fold' }, note: 'Gegen die Blinds hast du Position: breit callen, JJ+ und AQ als Value-4-Bet.' },
  { id: 'vs3bet:100:BTN:blinds', aggressive: 'JJ+, AQs+, AKo, AQo, A5s-A2s, KQs', call: 'TT-22, AJs-A6s, KJs-K8s, QJs-Q8s, JTs-J8s, T9s-T8s, 98s-97s, 87s, 76s, 65s, AJo-ATo, KQo-KJo, QJo', close: { '22': 'fold', '65s': 'fold', QJo: 'fold', KQs: 'call' }, note: 'Am Button gegen eine Blind-3-Bet viele Hände mit Position weiterspielen.' },
  { id: 'vs3bet:100:SB:blinds', aggressive: 'JJ+, AQs+, AKo, AQo, A5s-A2s', call: 'TT-22, AJs-A6s, KQs-K8s, QJs-Q8s, JTs-J8s, T9s-T8s, 98s-97s, 87s, 76s, 65s, AJo-ATo, KQo-KJo, QJo', close: { '22': 'fold', '65s': 'fold', QJo: 'fold' }, note: 'SB gegen BB-3-Bet: Die BB-Range ist breit, aber du spielst ohne Position.' },
];
```

- [ ] **Step 5: Chart-Daten 40 BB übernehmen**

`src/engine/preflop/charts-40.ts`:
```ts
import type { PreflopChartDef } from './charts';

export const CHARTS_40: readonly PreflopChartDef[] = [
  // Open-Raise
  { id: 'rfi:40:UTG', aggressive: '55+, A8s+, A5s, KTs+, QTs+, JTs, T9s, ATo+, KQo', call: '', close: { '55': 'fold', T9s: 'fold', ATo: 'fold' }, note: 'Mit 40 BB früh noch etwas enger: Spekulative Hände verlieren an Wert.' },
  { id: 'rfi:40:UTG1', aggressive: '44+, A7s+, A5s-A4s, K9s+, Q9s+, JTs, T9s, 98s, ATo+, KJo+', call: '', close: { '44': 'fold', '98s': 'fold', KJo: 'fold' }, note: 'Kleine Paare werden mit 40 BB früh zum Grenzfall: Die Set-Chance zahlt sich seltener aus.' },
  { id: 'rfi:40:LJ', aggressive: '33+, A2s+, K8s+, Q9s+, J9s+, T9s, 98s, 87s, ATo+, KJo+, QJo', call: '', close: { '33': 'fold', '87s': 'fold', QJo: 'fold' }, note: 'Asse suited bleiben gute Opens, weil sie auch gegen Re-Shoves Equity haben.' },
  { id: 'rfi:40:HJ', aggressive: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 98s, 87s, 76s, A9o+, KTo+, QTo+, JTo', call: '', close: { '22': 'fold', '76s': 'fold', A9o: 'fold' }, note: 'Ab dem Hijack ähnlich breit wie mit 100 BB, nur etwas weniger Suited Connectors.' },
  { id: 'rfi:40:CO', aggressive: '22+, A2s+, K3s+, Q6s+, J7s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, A7o+, K9o+, Q9o+, J9o+', call: '', close: { K3s: 'fold', '54s': 'fold', A7o: 'fold', J9o: 'fold' }, note: 'Im Cutoff bleibt die Range breit: Die Blinds können dich nur selten bestrafen.' },
  { id: 'rfi:40:BTN', aggressive: '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, 43s, A2o+, K7o+, Q8o+, J8o+, T8o+, 98o', call: '', close: { J4s: 'fold', '43s': 'fold', K7o: 'fold', T8o: 'fold' }, note: 'Am Button mit 40 BB weiter breit öffnen und die Blinds unter Druck setzen.' },
  { id: 'rfi:40:SB', aggressive: '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 95s+, 85s+, 74s+, 64s+, 53s+, A2o+, K8o+, Q9o+, J9o+, T9o', call: '', close: { J4s: 'fold', '53s': 'fold', K8o: 'fold', T9o: 'fold' }, note: 'Aus dem SB raisen oder folden. Mit kürzeren Stacks wird ein Open-Shove interessant (Push/Fold-Training).' },

  // Gegen Open-Raise
  { id: 'vsOpen:40:UTG:ip', aggressive: 'QQ+, AKs, AKo', call: 'JJ-99, AQs-AJs, KQs', close: { '99': 'fold', KQs: 'fold', QQ: 'call' }, note: 'Mit 40 BB ist eine 3-Bet oft schon halb der Stack: Nur mit Händen, die gerne all-in gehen.' },
  { id: 'vsOpen:40:UTG:sb', aggressive: 'QQ+, AKs, AKo', call: 'JJ-TT, AQs', close: { TT: 'fold', AQs: 'fold' }, note: 'Aus dem SB gegen UTG mit 40 BB sehr eng: Ohne Position fehlen dir die Implied Odds.' },
  { id: 'vsOpen:40:UTG:bb', aggressive: 'QQ+, AKs, AKo', call: 'JJ-22, AQs-A8s, A5s-A4s, KQs-KTs, QJs-QTs, JTs, T9s, 98s, AQo-AJo, KQo', close: { '22': 'fold', '98s': 'fold', AJo: 'fold', KQo: 'fold' }, note: 'Der BB callt gegen UTG weiter mit gutem Preis, aber weniger spekulativ als mit 100 BB.' },
  { id: 'vsOpen:40:UTG1:ip', aggressive: 'QQ+, AKs, AKo', call: 'JJ-88, AQs-AJs, KQs', close: { '88': 'fold', KQs: 'fold', QQ: 'call' }, note: 'Gegen UTG+1 Paare bis 88 callen, KQs ist ein Grenzfall.' },
  { id: 'vsOpen:40:UTG1:sb', aggressive: 'QQ+, AKs, AKo, AQs', call: 'JJ-TT', close: { TT: 'fold', AQs: 'call' }, note: 'Aus dem SB mit AQs eher 3-betten als callen: Du spielst sonst ohne Position.' },
  { id: 'vsOpen:40:UTG1:bb', aggressive: 'QQ+, AKs, AKo', call: 'JJ-22, AQs-A7s, A5s-A4s, KQs-K9s, QJs-QTs, JTs, T9s, 98s, AQo-AJo, KQo', close: { '22': 'fold', '98s': 'fold', AJo: 'fold', KQo: 'fold' }, note: 'Suited Asse im BB callen: Sie treffen Flushs und Asse mit guten Kickern.' },
  { id: 'vsOpen:40:LJ:ip', aggressive: 'JJ+, AKs, AQs, AKo', call: 'TT-77, AJs-ATs, KQs-KJs, QJs, AQo', close: { '77': 'fold', QJs: 'fold', AQo: 'fold', JJ: 'call' }, note: 'Gegen LJ werden JJ und AQs zur 3-Bet, kleine Paare unter 77 folden.' },
  { id: 'vsOpen:40:LJ:sb', aggressive: 'JJ+, AQs+, AKo, AQo', call: 'TT-99, AJs', close: { '99': 'fold', AJs: 'fold', AQo: 'fold' }, note: 'Aus dem SB mit 40 BB vor allem für Value 3-betten.' },
  { id: 'vsOpen:40:LJ:bb', aggressive: 'JJ+, AQs+, AKo', call: 'TT-22, AJs-A2s, KQs-K9s, QJs-Q9s, JTs-J9s, T9s, 98s, 87s, AQo-ATo, KQo-KJo', close: { '22': 'fold', '87s': 'fold', ATo: 'fold', KJo: 'fold' }, note: 'Je später der Open, desto breiter der BB – auch mit 40 BB.' },
  { id: 'vsOpen:40:HJ:ip', aggressive: 'JJ+, AQs+, AKo, AQo', call: 'TT-66, AJs-ATs, KQs-KTs, QJs, JTs, AJo, KQo', close: { '66': 'fold', JTs: 'fold', AJo: 'fold', KQo: 'fold' }, note: 'Gegen HJ mit Position Broadways und mittlere Paare callen.' },
  { id: 'vsOpen:40:HJ:sb', aggressive: 'TT+, AJs+, AKo, AQo, KQs', call: '99-88, ATs, KJs', close: { '88': 'fold', KJs: 'fold', KQs: 'call' }, note: 'SB gegen HJ: 3-Bet mit TT+, AJs+ und AQo, wenig callen.' },
  { id: 'vsOpen:40:HJ:bb', aggressive: 'TT+, AQs+, AKo, AQo', call: '99-22, AJs-A2s, KQs-K8s, QJs-Q8s, JTs-J8s, T9s-T8s, 98s, 87s, 76s, AJo-A9o, KQo-KTo, QJo', close: { '22': 'fold', '76s': 'fold', A9o: 'fold', QJo: 'fold' }, note: 'Der BB verteidigt gegen HJ rund ein Viertel seiner Hände.' },
  { id: 'vsOpen:40:CO:ip', aggressive: 'TT+, AJs+, AKo, AQo, A5s-A4s, KQs', call: '99-55, ATs-A9s, KJs-KTs, QJs-QTs, JTs, T9s, AJo, KQo', close: { '55': 'fold', T9s: 'fold', KQo: 'fold', A4s: 'fold' }, note: 'Button gegen Cutoff mit 40 BB: 3-Bet-Bluffs mit A5s/A4s, weniger kleine Paare callen.' },
  { id: 'vsOpen:40:CO:sb', aggressive: 'TT+, ATs+, AKo, AQo, AJo, A5s-A4s, KQs, KJs', call: '99-77, QJs', close: { '77': 'fold', QJs: 'fold', A4s: 'fold' }, note: 'SB gegen Cutoff: lieber 3-betten als callen, damit du den Pot oft sofort gewinnst.' },
  { id: 'vsOpen:40:CO:bb', aggressive: 'TT+, AJs+, AKo, AQo, A5s-A4s', call: '99-22, ATs-A6s, A3s-A2s, KQs-K6s, QJs-Q7s, JTs-J7s, T9s-T7s, 97s+, 86s+, 75s+, 65s, 54s, AJo-A7o, KQo-K9o, QJo-Q9o, JTo-J9o', close: { '22': 'fold', '54s': 'fold', A7o: 'fold', J9o: 'fold' }, note: 'Gegen einen Cutoff-Open verteidigt der BB breit, auch mit Offsuit-Assen.' },
  { id: 'vsOpen:40:BTN:sb', aggressive: '99+, A9s+, A5s-A3s, KTs+, QJs, ATo+, KJo+', call: '88-66, QTs, JTs', close: { '66': 'fold', JTs: 'fold', KJo: 'fold' }, note: 'SB gegen Button mit 40 BB: aggressiv 3-betten, ATo und KJo gehören dazu.' },
  { id: 'vsOpen:40:BTN:bb', aggressive: '99+, ATs+, A5s-A2s, KJs+, AJo+, KQo', call: '88-22, A9s-A6s, KTs-K4s, QJs-Q5s, JTs-J6s, T9s-T6s, 96s+, 85s+, 75s+, 64s+, 54s, ATo-A4o, KJo-K9o, QJo-Q9o, JTo-J9o, T9o', close: { '22': 'fold', '54s': 'fold', A4o: 'fold', T9o: 'fold' }, note: 'Gegen den Button verteidigt der BB fast die Hälfte seiner Hände.' },
  { id: 'vsOpen:40:SB:bb', aggressive: '88+, A8s+, A5s-A2s, K9s+, QTs+, JTs, ATo+, KJo+', call: '77-22, A7s-A6s, K8s-K2s, Q9s-Q2s, J9s-J4s, T9s-T5s, 95s+, 84s+, 74s+, 63s+, 53s+, 43s, A9o-A2o, KTo-K5o, QJo-Q8o, JTo-J8o, T9o-T8o, 98o', close: { '22': 'fold', '43s': 'fold', K5o: 'fold', '98o': 'fold' }, note: 'Gegen den SB hat der BB Position: sehr breit verteidigen.' },

  // Gegen 3-Bet (4-Bet = All-in)
  { id: 'vs3bet:40:UTG:ip', aggressive: 'QQ+, AKs, AKo', call: 'JJ-TT, AQs', close: { QQ: 'call', TT: 'fold', AQs: 'fold' }, note: 'Mit 40 BB ist die 4-Bet ein All-in: nur mit QQ+ und AK.' },
  { id: 'vs3bet:40:UTG:blinds', aggressive: 'QQ+, AKs, AKo', call: 'JJ-99, AQs, AJs, KQs', close: { '99': 'fold', KQs: 'fold', QQ: 'call' }, note: 'Gegen eine Blind-3-Bet mit Position kannst du auch AJs und KQs callen.' },
  { id: 'vs3bet:40:UTG1:ip', aggressive: 'QQ+, AKs, AKo', call: 'JJ-99, AQs, AJs', close: { '99': 'fold', AJs: 'fold' }, note: 'Gegen eine 3-Bet in Position mittelstarke Hände folden: Der Gegner ist selten schwach.' },
  { id: 'vs3bet:40:UTG1:blinds', aggressive: 'JJ+, AKs, AKo, AQs', call: 'TT-88, AJs-ATs, KQs, AQo', close: { '88': 'fold', AQo: 'fold', JJ: 'call' }, note: 'Gegen die Blinds wird JJ zum All-in, AQo bleibt ein Grenzfall.' },
  { id: 'vs3bet:40:LJ:ip', aggressive: 'JJ+, AKs, AKo, AQs', call: 'TT-88, AJs, KQs', close: { '88': 'fold', KQs: 'fold', JJ: 'call' }, note: 'Ab LJ werden JJ und AQs All-in-Hände gegen eine 3-Bet.' },
  { id: 'vs3bet:40:LJ:blinds', aggressive: 'JJ+, AQs+, AKo, AQo', call: 'TT-77, AJs-ATs, KQs-KJs, QJs', close: { '77': 'fold', QJs: 'fold', AQo: 'call' }, note: 'Gegen die Blinds AQo all-in schieben oder callen, beides ist vertretbar.' },
  { id: 'vs3bet:40:HJ:ip', aggressive: 'JJ+, AQs+, AKo, AQo', call: 'TT-77, AJs-ATs, KQs-KJs', close: { '77': 'fold', KJs: 'fold', AQo: 'call' }, note: 'Gegen eine 3-Bet vom Cutoff oder Button reicht AQ für das All-in.' },
  { id: 'vs3bet:40:HJ:blinds', aggressive: 'TT+, AJs+, AKo, AQo', call: '99-66, ATs-A9s, KQs-KTs, QJs, JTs', close: { '66': 'fold', JTs: 'fold', TT: 'call', AJs: 'call' }, note: 'Die Blinds 3-betten breiter: TT und AJs werden zum All-in.' },
  { id: 'vs3bet:40:CO:ip', aggressive: 'TT+, AJs+, AKo, AQo, A5s', call: '99-66, ATs, KQs-KJs, QJs', close: { '66': 'fold', QJs: 'fold', A5s: 'fold' }, note: 'Cutoff gegen Button-3-Bet: A5s ist ein guter All-in-Bluff mit Ass-Blocker.' },
  { id: 'vs3bet:40:CO:blinds', aggressive: 'TT+, ATs+, AKo, AQo, AJo, A5s-A4s, KQs', call: '99-55, A9s, KJs-KTs, QJs, JTs', close: { '55': 'fold', JTs: 'fold', AJo: 'fold', A4s: 'fold' }, note: 'Gegen die Blinds aus dem Cutoff breiter all-in: AJo und suited Asse.' },
  { id: 'vs3bet:40:BTN:blinds', aggressive: '99+, ATs+, A5s-A4s, KQs, AJo+, KQo', call: '88-44, A9s-A7s, KJs-KTs, QJs-QTs, JTs, T9s, ATo', close: { '44': 'fold', T9s: 'fold', ATo: 'fold', KQo: 'call' }, note: 'Am Button gegen eine Blind-3-Bet: 99+ und starke Asse all-in, Position für Calls nutzen.' },
  { id: 'vs3bet:40:SB:blinds', aggressive: '99+, ATs+, A5s-A3s, KQs, KJs, AJo+, KQo', call: '88-44, A9s-A7s, KTs, QJs-QTs, JTs, T9s, ATo, KJo', close: { '44': 'fold', T9s: 'fold', KJo: 'fold', A3s: 'fold' }, note: 'SB gegen BB-3-Bet: Die BB-Range ist breit, deshalb breiter all-in als gewohnt.' },
];
```

- [ ] **Step 6: Ausgabe-Skript**

`scripts/print-charts.ts`:
```ts
import { allCharts, continueRange } from '../src/engine/preflop/charts';
import { rangeWidth } from '../src/engine/preflop/ranges';

const percent = (x: number) => `${(x * 100).toFixed(1)} %`.padStart(7);

for (const [key, chart] of [...allCharts()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(
    `${key.padEnd(24)} aggressiv ${percent(rangeWidth(chart.aggressive))}  weiter ${percent(rangeWidth(continueRange(chart)))}  Grenzhände ${chart.close.size}`,
  );
}
```

In `package.json` unter `scripts` ergänzen: `"charts:print": "tsx scripts/print-charts.ts"`.

- [ ] **Step 7: Tests laufen lassen**

Run: `npx vitest run src/engine/preflop` → Expected: alle PASS. Schlägt ein Datentest fehl: **nicht** anpassen, sondern DONE_WITH_CONCERNS mit der vollständigen Fehlermeldung (Chart-Schlüssel, Hand bzw. Breiten) melden.
Run: `npm run charts:print` → Expected: 74 Zeilen. Die vollständige Ausgabe in den Bericht übernehmen.
Run: `npm test`, `npm run typecheck` → PASS bzw. Exit 0.

- [ ] **Step 8: Commit**

```bash
git add package.json src/engine/preflop/charts.ts src/engine/preflop/charts-100.ts src/engine/preflop/charts-40.ts src/engine/preflop/charts.test.ts scripts/print-charts.ts
git commit -m "feat(preflop): 74 kuratierte Charts für 40 und 100 BB mit Plausibilitätsprüfung"
```

---

### Task 4: Bewertung, Chart-Zellen und Positions-Vergleich

**Files:**
- Create: `src/engine/preflop/grading.ts`
- Test: `src/engine/preflop/grading.test.ts`

**Interfaces:**
- Consumes: `chartFor`, `mainActionOf`, `PreflopChart`; `allowedActions`, `chartKeyFor`, `PreflopAction`, `PreflopSituation`, `PreflopSpot`; `POSITIONS`, `POSITION_LABELS`, `Position`; `HAND_COUNT`, `handName`; `Verdict`
- Produces:
  - `type PreflopGrade = { verdict: Verdict; chosen: PreflopAction; best: PreflopAction; alternative: PreflopAction | null }`
  - `gradePreflop(spot: PreflopSpot, chosen: PreflopAction): PreflopGrade` — `correct` bei der Hauptaktion, `close` bei der Grenzhand-Alternative, sonst `wrong`; wirft „Aktion <a> passt nicht zum Spot“ bzw. „Ungültiger Hand-Index: <h>“
  - `type PreflopCell = 'aggressive' | 'call' | 'fold' | 'close'`
  - `preflopCells(chart: PreflopChart): PreflopCell[]` (169 Einträge; Grenzhände = `close`)
  - `preflopActionWord(action: PreflopAction, stack: StackDepth): string` → „Raise“, „3-Bet“, „4-Bet“ (bei 40 BB „All-in“), „Call“, „Fold“
  - `type PreflopPositionEntry = { position: Position; cell: PreflopCell; action: PreflopAction; isCurrent: boolean }`
  - `type PreflopComparison = { axis: 'hero' | 'opener'; entries: PreflopPositionEntry[]; summary: string }`
  - `comparePreflopPositions(spot: PreflopSpot): PreflopComparison`

**Vergleichsregeln (verbindlich):**
- `rfi`: Achse `hero`, Positionen UTG bis SB.
- `vsOpen`: Achse `opener` (dieselbe Hand gegen Opens aus verschiedenen Positionen, Held-Gruppe fest): Gruppe `ip` → Opener UTG bis CO (Held stellvertretend BTN), `sb` → Opener UTG bis BTN (Held SB), `bb` → Opener UTG bis SB (Held BB). `isCurrent` = Opener des Spots.
- `vs3bet`: Achse `hero`, 3-Bettor-Gruppe fest: `ip` → Held UTG bis CO (3-Bettor stellvertretend BTN), `blinds` → Held UTG bis SB (3-Bettor BB).
- Zusammenfassung: Präfix „<Hand> (<Stack> BB, Open-Raise)“ bzw. „<Hand> (<Stack> BB, gegen Open-Raise, du in Position | im SB | im BB)“ bzw. „<Hand> (<Stack> BB, gegen 3-Bet in Position | gegen 3-Bet aus den Blinds)“, dann „: “. Gruppen benachbarter Einträge mit gleicher Zelle; Wort je Zelle: aggressiv → `preflopActionWord`, `call` „Call“, `fold` „Fold“, `close` „knapp“. Präposition „aus“ (Achse `hero`) bzw. „gegen“ (Achse `opener`). Ein Eintrag: „<Wort> <Präp> <Pos>“; mehrere, nicht letzte Gruppe: „<Wort> <Präp> <A> bis <B>“; letzte Gruppe mit mehreren: „<Wort> ab <A>“; nur eine Gruppe über mehrere Einträge: „<Wort> aus jeder Position“ bzw. „<Wort> gegen jede Position“. Gruppen mit „, “ verbunden. Positionsnamen über `POSITION_LABELS`.

- [ ] **Step 1: Failing Test schreiben**

`src/engine/preflop/grading.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseHand } from '../cards';
import { chartFor } from './charts';
import { comparePreflopPositions, gradePreflop, preflopActionWord, preflopCells } from './grading';

const hand = parseHand;

describe('gradePreflop', () => {
  const utg = { kind: 'rfi', stack: 100, hero: 'UTG', villain: null } as const;

  it('grades main actions and close alternatives', () => {
    expect(gradePreflop({ ...utg, hand: hand('AA') }, 'raise')).toEqual({ verdict: 'correct', chosen: 'raise', best: 'raise', alternative: null });
    expect(gradePreflop({ ...utg, hand: hand('AA') }, 'fold')).toMatchObject({ verdict: 'wrong', best: 'raise' });
    expect(gradePreflop({ ...utg, hand: hand('44') }, 'fold')).toEqual({ verdict: 'close', chosen: 'fold', best: 'raise', alternative: 'fold' });
    expect(gradePreflop({ ...utg, hand: hand('44') }, 'raise').verdict).toBe('correct');
    expect(gradePreflop({ ...utg, hand: hand('72o') }, 'fold').verdict).toBe('correct');
  });

  it('grades calls against an open', () => {
    const spot = { kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'UTG', hand: hand('JJ') } as const;
    expect(gradePreflop(spot, 'call').verdict).toBe('correct');
    expect(gradePreflop(spot, 'threeBet')).toMatchObject({ verdict: 'wrong', best: 'call' });
  });

  it('rejects actions that do not fit and invalid hands', () => {
    expect(() => gradePreflop({ ...utg, hand: hand('AA') }, 'call')).toThrow('Aktion call passt nicht zum Spot');
    expect(() => gradePreflop({ ...utg, hand: 169 }, 'fold')).toThrow('Ungültiger Hand-Index: 169');
  });
});

describe('preflopCells and words', () => {
  it('classifies every hand of a chart', () => {
    const cells = preflopCells(chartFor({ kind: 'rfi', stack: 100, hero: 'UTG', villain: null }));
    expect(cells).toHaveLength(169);
    expect(cells[hand('AA')]).toBe('aggressive');
    expect(cells[hand('44')]).toBe('close');
    expect(cells[hand('72o')]).toBe('fold');
    expect(preflopCells(chartFor({ kind: 'vsOpen', stack: 100, hero: 'CO', villain: 'UTG' }))[hand('JJ')]).toBe('call');
  });

  it('names the actions', () => {
    expect(preflopActionWord('raise', 100)).toBe('Raise');
    expect(preflopActionWord('threeBet', 40)).toBe('3-Bet');
    expect(preflopActionWord('fourBet', 100)).toBe('4-Bet');
    expect(preflopActionWord('fourBet', 40)).toBe('All-in');
    expect(preflopActionWord('call', 40)).toBe('Call');
  });
});

describe('comparePreflopPositions', () => {
  it('compares open-raises across positions', () => {
    const r = comparePreflopPositions({ kind: 'rfi', stack: 100, hero: 'CO', villain: null, hand: hand('A9o') });
    expect(r.axis).toBe('hero');
    expect(r.entries.map((e) => e.position)).toEqual(['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB']);
    expect(r.entries.filter((e) => e.isCurrent).map((e) => e.position)).toEqual(['CO']);
    expect(r.summary).toBe('A9o (100 BB, Open-Raise): Fold aus UTG bis LJ, knapp aus HJ, Raise ab CO');
  });

  it('compares a big-blind defence across openers', () => {
    const r = comparePreflopPositions({ kind: 'vsOpen', stack: 100, hero: 'BB', villain: 'HJ', hand: hand('KJo') });
    expect(r.axis).toBe('opener');
    expect(r.entries.map((e) => e.position)).toEqual(['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB']);
    expect(r.entries.find((e) => e.isCurrent)?.position).toBe('HJ');
    expect(r.summary).toBe('KJo (100 BB, gegen Open-Raise, du im BB): knapp gegen UTG bis UTG+1, Call gegen LJ bis BTN, 3-Bet gegen SB');
  });

  it('compares 3-bet defences from the blinds across own positions', () => {
    const r = comparePreflopPositions({ kind: 'vs3bet', stack: 40, hero: 'CO', villain: 'SB', hand: hand('AJo') });
    expect(r.entries.map((e) => e.position)).toEqual(['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB']);
    expect(r.summary).toBe('AJo (40 BB, gegen 3-Bet aus den Blinds): Fold aus UTG bis HJ, knapp aus CO, All-in ab BTN');
  });

  it('uses "aus jeder Position" when every position agrees', () => {
    const r = comparePreflopPositions({ kind: 'rfi', stack: 40, hero: 'UTG', villain: null, hand: hand('AA') });
    expect(r.summary).toBe('AA (40 BB, Open-Raise): Raise aus jeder Position');
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/engine/preflop/grading.test.ts` → Expected: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Implementierung**

`src/engine/preflop/grading.ts`:
```ts
import { HAND_COUNT, handName } from '../cards';
import { POSITIONS, POSITION_LABELS, type Position, seatOf } from '../positions';
import type { Verdict } from '../pushfold';
import { type PreflopChart, chartFor, mainActionOf } from './charts';
import {
  type PreflopAction,
  type PreflopSituation,
  type PreflopSpot,
  type StackDepth,
  allowedActions,
  chartKeyFor,
} from './spots';

export type PreflopGrade = { verdict: Verdict; chosen: PreflopAction; best: PreflopAction; alternative: PreflopAction | null };
export type PreflopCell = 'aggressive' | 'call' | 'fold' | 'close';
export type PreflopPositionEntry = { position: Position; cell: PreflopCell; action: PreflopAction; isCurrent: boolean };
export type PreflopComparison = { axis: 'hero' | 'opener'; entries: PreflopPositionEntry[]; summary: string };

function assertHand(hand: number): void {
  if (!Number.isInteger(hand) || hand < 0 || hand >= HAND_COUNT) throw new Error(`Ungültiger Hand-Index: ${hand}`);
}

export function gradePreflop(spot: PreflopSpot, chosen: PreflopAction): PreflopGrade {
  if (!allowedActions(spot.kind).includes(chosen)) throw new Error(`Aktion ${chosen} passt nicht zum Spot`);
  assertHand(spot.hand);
  const chart = chartFor(spot);
  const best = mainActionOf(chart, spot.hand);
  const alternative = chart.close.get(spot.hand) ?? null;
  const verdict: Verdict = chosen === best ? 'correct' : chosen === alternative ? 'close' : 'wrong';
  return { verdict, chosen, best, alternative };
}

function cellOf(chart: PreflopChart, hand: number): PreflopCell {
  if (chart.close.has(hand)) return 'close';
  const action = mainActionOf(chart, hand);
  return action === 'fold' ? 'fold' : action === 'call' ? 'call' : 'aggressive';
}

export const preflopCells = (chart: PreflopChart): PreflopCell[] =>
  Array.from({ length: HAND_COUNT }, (_, hand) => cellOf(chart, hand));

const WORDS: Record<PreflopAction, string> = { raise: 'Raise', threeBet: '3-Bet', fourBet: '4-Bet', call: 'Call', fold: 'Fold' };

export const preflopActionWord = (action: PreflopAction, stack: StackDepth): string =>
  action === 'fourBet' && stack === 40 ? 'All-in' : WORDS[action];

const range = (from: Position, to: Position): Position[] => POSITIONS.slice(seatOf(from), seatOf(to) + 1);

type Plan = { axis: 'hero' | 'opener'; positions: Position[]; situationAt: (p: Position) => PreflopSituation; context: string };

function comparisonPlan(spot: PreflopSpot): Plan {
  const { kind, stack } = spot;
  if (kind === 'rfi') {
    return {
      axis: 'hero',
      positions: range('UTG', 'SB'),
      situationAt: (hero) => ({ kind, stack, hero, villain: null }),
      context: 'Open-Raise',
    };
  }
  const group = chartKeyFor(spot).split(':')[3];
  if (kind === 'vsOpen') {
    const hero: Position = group === 'ip' ? 'BTN' : group === 'sb' ? 'SB' : 'BB';
    const lastOpener: Position = group === 'ip' ? 'CO' : group === 'sb' ? 'BTN' : 'SB';
    const label = group === 'ip' ? 'in Position' : group === 'sb' ? 'im SB' : 'im BB';
    return {
      axis: 'opener',
      positions: range('UTG', lastOpener),
      situationAt: (villain) => ({ kind, stack, hero, villain }),
      context: `gegen Open-Raise, du ${label}`,
    };
  }
  const blinds = group === 'blinds';
  return {
    axis: 'hero',
    positions: range('UTG', blinds ? 'SB' : 'CO'),
    situationAt: (hero) => ({ kind, stack, hero, villain: blinds ? 'BB' : 'BTN' }),
    context: blinds ? 'gegen 3-Bet aus den Blinds' : 'gegen 3-Bet in Position',
  };
}

function summarize(spot: PreflopSpot, plan: Plan, entries: readonly PreflopPositionEntry[]): string {
  const prep = plan.axis === 'hero' ? 'aus' : 'gegen';
  const word = (e: PreflopPositionEntry) => (e.cell === 'close' ? 'knapp' : preflopActionWord(e.action, spot.stack));
  const segments: Array<{ cell: PreflopCell; word: string; from: Position; to: Position }> = [];
  for (const e of entries) {
    const last = segments[segments.length - 1];
    if (last && last.cell === e.cell) last.to = e.position;
    else segments.push({ cell: e.cell, word: word(e), from: e.position, to: e.position });
  }
  const label = (p: Position) => POSITION_LABELS[p];
  const parts =
    segments.length === 1 && entries.length > 1
      ? [`${segments[0].word} ${plan.axis === 'hero' ? 'aus jeder Position' : 'gegen jede Position'}`]
      : segments.map((s, i) => {
          if (s.from === s.to) return `${s.word} ${prep} ${label(s.from)}`;
          if (i === segments.length - 1) return `${s.word} ab ${label(s.from)}`;
          return `${s.word} ${prep} ${label(s.from)} bis ${label(s.to)}`;
        });
  return `${handName(spot.hand)} (${spot.stack} BB, ${plan.context}): ${parts.join(', ')}`;
}

export function comparePreflopPositions(spot: PreflopSpot): PreflopComparison {
  assertHand(spot.hand);
  const plan = comparisonPlan(spot);
  const current = plan.axis === 'hero' ? spot.hero : spot.villain;
  const entries = plan.positions.map((position): PreflopPositionEntry => {
    const chart = chartFor(plan.situationAt(position));
    return {
      position,
      cell: cellOf(chart, spot.hand),
      action: mainActionOf(chart, spot.hand),
      isCurrent: position === current,
    };
  });
  return { axis: plan.axis, entries, summary: summarize(spot, plan, entries) };
}
```

Hinweis: Die Cell-Gruppierung fasst `aggressive` unabhängig vom Wort zusammen; innerhalb eines Spot-Typs ist das Wort ohnehin gleich.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/engine/preflop` → Expected: PASS. Run: `npm run typecheck` → Exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/preflop/grading.ts src/engine/preflop/grading.test.ts
git commit -m "feat(preflop): Bewertung, Chart-Zellen und Positions-Vergleich"
```

---

### Task 5: Spot-Generator für Starthände

**Files:**
- Create: `src/engine/preflop/generator.ts`
- Test: `src/engine/preflop/generator.test.ts`

**Interfaces:**
- Consumes: `chartFor`, `mainActionOf`, `PreflopChart`; `validSituations`, `PreflopKind`, `PreflopSituation`, `PreflopSpot`, `StackDepth`; `COMBOS`, `HAND_COUNT`; `Rng`
- Produces:
  - `type PreflopGeneratorOptions = { kinds?: readonly PreflopKind[]; stacks?: readonly StackDepth[]; categoryWeights?: ReadonlyMap<string, number>; randomShare?: number }`
  - `preflopCategoryKey(s: PreflopSituation): string` → `"<kind>|<hero>|<stack>"`
  - `boundaryHands(chart: PreflopChart): boolean[]` — Grenzhand oder eine waagerecht/senkrecht benachbarte Zelle der 13×13-Matrix hat eine andere Hauptaktion
  - `generatePreflopSpot(rng: Rng, options?: PreflopGeneratorOptions): PreflopSpot` — Kategorie gewichtet (`categoryWeights.get(key) ?? 1`), Situation gleichverteilt in der Kategorie, Hand: mit Wahrscheinlichkeit `randomShare` (Standard 0,15) nach Kombinationen gleichverteilt, sonst Gewicht `Kombinationen × (6 bei Grenz-Hand, sonst 1)`; wirft „Keine Starthand-Spots für diese Filter“ bei leerer Auswahl und „Ungültiges Gewicht“ bei nicht endlichen oder negativen Gewichten bzw. Gesamtgewicht ≤ 0

- [ ] **Step 1: Failing Test schreiben**

`src/engine/preflop/generator.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { COMBOS, parseHand } from '../cards';
import { mulberry32 } from '../rng';
import { chartFor } from './charts';
import { boundaryHands, generatePreflopSpot, preflopCategoryKey } from './generator';

describe('boundaryHands', () => {
  it('marks close hands and hands next to a different action', () => {
    const b = boundaryHands(chartFor({ kind: 'rfi', stack: 100, hero: 'UTG', villain: null }));
    expect(b[parseHand('44')]).toBe(true);
    expect(b[parseHand('K8s')]).toBe(true);
    expect(b[parseHand('AA')]).toBe(false);
    expect(b[parseHand('72o')]).toBe(false);
  });
});

describe('generatePreflopSpot', () => {
  it('is deterministic per seed', () => {
    const run = () => {
      const rng = mulberry32(3);
      return Array.from({ length: 30 }, () => generatePreflopSpot(rng));
    };
    expect(run()).toEqual(run());
  });

  it('respects kind and stack filters', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 300; i++) {
      const s = generatePreflopSpot(rng, { kinds: ['vs3bet'], stacks: [40] });
      expect(s.kind).toBe('vs3bet');
      expect(s.stack).toBe(40);
      expect(s.villain).not.toBeNull();
    }
    expect(() => generatePreflopSpot(rng, { kinds: [] })).toThrow('Keine Starthand-Spots für diese Filter');
  });

  it('prefers boundary hands', () => {
    const rng = mulberry32(7);
    let boundary = 0;
    let boundaryCombos = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const s = generatePreflopSpot(rng, { kinds: ['rfi'], stacks: [100] });
      const b = boundaryHands(chartFor(s));
      if (b[s.hand]) boundary++;
      boundaryCombos += b.reduce((sum, on, h) => sum + (on ? COMBOS[h].length : 0), 0) / 1326;
    }
    expect(boundary / n).toBeGreaterThan((boundaryCombos / n) * 2);
  });

  it('weights categories', () => {
    const rng = mulberry32(9);
    const weights = new Map([['rfi|UTG|100', 30]]);
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      if (preflopCategoryKey(generatePreflopSpot(rng, { stacks: [100], categoryWeights: weights })) === 'rfi|UTG|100') hits++;
    }
    expect(hits / 2000).toBeGreaterThan(0.2);
  });

  it('rejects invalid weights', () => {
    const rng = mulberry32(1);
    expect(() => generatePreflopSpot(rng, { categoryWeights: new Map([['rfi|UTG|100', -1]]) })).toThrow('Ungültiges Gewicht');
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npx vitest run src/engine/preflop/generator.test.ts` → Expected: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Implementierung**

`src/engine/preflop/generator.ts`:
```ts
import { COMBOS, HAND_COUNT } from '../cards';
import type { Rng } from '../rng';
import { type PreflopChart, chartFor, mainActionOf } from './charts';
import { type PreflopKind, type PreflopSituation, type PreflopSpot, type StackDepth, validSituations } from './spots';

export type PreflopGeneratorOptions = {
  kinds?: readonly PreflopKind[];
  stacks?: readonly StackDepth[];
  categoryWeights?: ReadonlyMap<string, number>;
  randomShare?: number;
};

const DEFAULT_RANDOM_SHARE = 0.15;
const BOUNDARY_WEIGHT = 6;
const SIZE = 13;

export const preflopCategoryKey = (s: PreflopSituation): string => `${s.kind}|${s.hero}|${s.stack}`;

export function boundaryHands(chart: PreflopChart): boolean[] {
  return Array.from({ length: HAND_COUNT }, (_, hand) => {
    if (chart.close.has(hand)) return true;
    const action = mainActionOf(chart, hand);
    const row = Math.floor(hand / SIZE);
    const col = hand % SIZE;
    const neighbours = [
      [row - 1, col],
      [row + 1, col],
      [row, col - 1],
      [row, col + 1],
    ].filter(([r, c]) => r >= 0 && r < SIZE && c >= 0 && c < SIZE);
    return neighbours.some(([r, c]) => mainActionOf(chart, r * SIZE + c) !== action);
  });
}

function pickWeighted<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T {
  let total = 0;
  for (const item of items) {
    const w = weight(item);
    if (!Number.isFinite(w) || w < 0) throw new Error(`Ungültiges Gewicht: ${w}`);
    total += w;
  }
  if (!(total > 0)) throw new Error(`Ungültiges Gesamtgewicht: ${total}`);
  let r = rng() * total;
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

export function generatePreflopSpot(rng: Rng, options: PreflopGeneratorOptions = {}): PreflopSpot {
  const kinds = options.kinds ?? ['rfi', 'vsOpen', 'vs3bet'];
  const stacks = options.stacks ?? [40, 100];
  const groups = new Map<string, PreflopSituation[]>();
  for (const s of validSituations()) {
    if (!kinds.includes(s.kind) || !stacks.includes(s.stack)) continue;
    const key = preflopCategoryKey(s);
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  if (groups.size === 0) throw new Error('Keine Starthand-Spots für diese Filter');

  const key = pickWeighted([...groups.keys()], (k) => options.categoryWeights?.get(k) ?? 1, rng);
  const candidates = groups.get(key)!;
  const situation = candidates[Math.floor(rng() * candidates.length)];

  const chart = chartFor(situation);
  const boundary = boundaryHands(chart);
  const uniform = rng() < (options.randomShare ?? DEFAULT_RANDOM_SHARE);
  const hands = Array.from({ length: HAND_COUNT }, (_, h) => h);
  const hand = pickWeighted(hands, (h) => COMBOS[h].length * (!uniform && boundary[h] ? BOUNDARY_WEIGHT : 1), rng);
  return { ...situation, hand };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run src/engine/preflop` → Expected: PASS. Run: `npm test`, `npm run typecheck` → PASS bzw. Exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/engine/preflop/generator.ts src/engine/preflop/generator.test.ts
git commit -m "feat(preflop): Spot-Generator mit Grenzhand-Gewichtung und Filtern"
```

---

### Task 6: Abschlussprüfung von Plan 5

- [ ] **Step 1:** `npm test`, `npm run typecheck`, `npm run check:portability` → alle grün bzw. clean.
- [ ] **Step 2:** UTF-8-Prüfung: `node -e "const fs=require('fs');const {execSync}=require('child_process');for(const f of execSync('git ls-files src scripts').toString().trim().split('\n'))new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(f));console.log('utf8 ok')"`.
- [ ] **Step 3:** `npm run charts:print` → Ausgabe dem Nutzer zum Gegenlesen vorlegen (Controller).

## Übergabe an Plan 6

Plan 6 nutzt: `PreflopSpot`, `PreflopSituation`, `PreflopAction`, `PreflopKind`, `StackDepth`, `STACK_DEPTHS`, `PREFLOP_KINDS`, `allowedActions`, `aggressiveActionOf`, `sizesFor`, `chartFor`, `preflopCells`, `gradePreflop`, `PreflopGrade`, `comparePreflopPositions`, `preflopActionWord`, `generatePreflopSpot`, `preflopCategoryKey`, `PreflopChart.note`.
