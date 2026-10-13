# Plan 1: Rechenkern (Equity, Nash, Bewertung, Spot-Generator) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use mindCoder:subagent-driven-development (recommended) or mindCoder:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen getesteten Rechenkern bauen, der Push/Fold-EVs für 8-max mit BB-Ante vorberechnet (`src/data/pushfold.json`), Entscheidungen bewertet und Trainings-Spots erzeugt.

**Architecture:** Reine TypeScript-Logik ohne UI. `src/engine/` enthält alles, was die App zur Laufzeit braucht (Karten, Bewertung, Spot-Generator). `scripts/` enthält die einmalige Offline-Berechnung (Monte-Carlo-Equity-Matrix, Fictitious-Play-Nash-Solver) und schreibt die Daten-JSON. Plan 2 (Spielsystem/Speicherung) und Plan 3 (UI/PWA/Deployment) bauen darauf auf.

**Tech Stack:** Node 24, TypeScript 5, Vitest 3, tsx 4 (zum Ausführen der TS-Skripte), `node:worker_threads`.

## Global Constraints

- Entwickler-Rechner: Windows 11 (PowerShell) UND macOS (zsh). Jede Automation läuft als Node-Skript via `npm run`; keine Shell-Befehle (`rm`, `cp`, `&&`, `FOO=bar`) in `package.json`.
- Zeilenenden LF, erzwungen per `.gitattributes`; Node-Version gepinnt per `.nvmrc` und `engines.node`.
- Projektordner: `C:\Users\FlorianLibuda\poker-trainer` (nicht in OneDrive).
- Tisch: 8-max, Positionen in Reihenfolge `UTG, UTG1, LJ, HJ, CO, BTN, SB, BB` (Index 0–7).
- Ante: Big-Blind-Ante = 1 BB (tot, zählt nicht zum Call). SB = 0,5 BB, BB = 1 BB. Toter Pot vor der ersten Aktion: 2,5 BB.
- Stacks: effektiv 1–20 BB, ganzzahlig. Alle Spieler im Spot haben denselben effektiven Stack (Chips hinter der Ante, inklusive gesetzter Blinds).
- Bewertung in chip-EV, ohne ICM. EV-Angaben in BB **relativ zu Fold** (EV(Fold) = 0).
- Grenzfall: |EV(Aktion) − EV(Fold)| < **0,1 BB** → beide Antworten richtig.
- Nash-Vereinfachung: höchstens ein Caller; ein Spieler callt nur, wenn alle zwischen ihm und dem Shover gefoldet haben.
- Spot-Auswahl: Mindestanteil **15 %** zufälliger Hände; Stack-Bereiche `1–5, 6–10, 11–15, 16–20`.
- Equity-Zielgenauigkeit: ±0,3 Prozentpunkte (Monte-Carlo mit 100.000 Samples pro Klassenpaar).
- Identifier und Code-Kommentare auf Englisch, Fehlermeldungen für den Nutzer auf Deutsch.

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitattributes`, `.editorconfig`, `.nvmrc`, `.gitignore` | Projekt-Grundgerüst |
| `src/engine/cards.ts` | Karten, 169 Hand-Klassen, Kombinationen, Kompatibilitätsmatrix |
| `src/engine/rng.ts` | Seedbarer Zufallsgenerator |
| `src/engine/evaluator.ts` | 7-Karten-Handbewertung |
| `src/engine/equity.ts` | Monte-Carlo-Equity Klasse gegen Klasse |
| `src/engine/positions.ts` | Positionen, Blinds, Pot-Berechnung |
| `scripts/compute-equity.ts`, `scripts/equity-worker.ts` | Erzeugt `scripts/data/equity.json` (parallel) |
| `scripts/lib/nash.ts` | Fictitious-Play-Solver für einen Spot (Stack × Shover-Position) |
| `scripts/build-pushfold.ts` | Erzeugt `src/data/pushfold.json` aus Equity + Solver |
| `src/engine/pushfold.ts` | Typen, EV-Lookup, Bewertung, Range-Chart |
| `src/engine/spot-generator.ts` | Gewichtete, adaptive Spot-Auswahl |

---

### Task 1: Projekt-Grundgerüst

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitattributes`, `.editorconfig`, `.nvmrc`, `.gitignore`
- Test: `src/engine/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` (Vitest, einmaliger Lauf), `npm run typecheck`, `npm run data:equity`, `npm run data:pushfold`

- [ ] **Step 1: Branch anlegen**

```bash
git switch -c feat/rechenkern
```

- [ ] **Step 2: Konfigurationsdateien schreiben**

`package.json`:
```json
{
  "name": "poker-trainer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "data:equity": "tsx scripts/compute-equity.ts",
    "data:pushfold": "tsx scripts/build-pushfold.ts"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.8.0",
    "vitest": "^3.2.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  },
  "include": ["src", "scripts", "vitest.config.ts"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
```

`.gitattributes`:
```
* text=auto eol=lf
*.ps1 text eol=crlf
*.png binary
*.mp3 binary
```

`.editorconfig`:
```
root = true

[*]
end_of_line = lf
charset = utf-8
indent_style = space
indent_size = 2
insert_final_newline = true
```

`.nvmrc`:
```
24
```

`.gitignore`:
```
node_modules/
dist/
coverage/
*.log
```

- [ ] **Step 3: Abhängigkeiten installieren**

Run: `npm install`
Expected: `package-lock.json` entsteht, keine Fehler.

- [ ] **Step 4: Smoke-Test schreiben**

`src/engine/smoke.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Tests und Typecheck laufen lassen**

Run: `npm test` → Expected: 1 passed.
Run: `npm run typecheck` → Expected: keine Ausgabe, Exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: Projekt-Grundgerüst mit TypeScript und Vitest"
```

---

### Task 2: Karten, Hand-Klassen und Zufallsgenerator

**Files:**
- Create: `src/engine/cards.ts`, `src/engine/rng.ts`
- Test: `src/engine/cards.test.ts`, `src/engine/rng.test.ts`
- Delete: `src/engine/smoke.test.ts`

**Interfaces:**
- Produces:
  - `type Card = number` (0–51, `rank = card >> 2` mit 0 = Zwei … 12 = Ass, `suit = card & 3`)
  - `type HandClass = number` (0–168, Index in der 13×13-Matrix: `row * 13 + col`, Zeile/Spalte 0 = Ass … 12 = Zwei; Diagonale = Paare, `row < col` = suited, `row > col` = offsuit)
  - `RANKS: string`, `SUITS: string`, `HAND_COUNT = 169`
  - `rankOf(c: Card): number`, `suitOf(c: Card): number`, `cardName(c: Card): string`, `parseCard(s: string): Card`
  - `handName(h: HandClass): string` (z. B. `"AA"`, `"AKs"`, `"72o"`), `parseHand(name: string): HandClass`
  - `handClassOf(a: Card, b: Card): HandClass`
  - `COMBOS: ReadonlyArray<ReadonlyArray<readonly [Card, Card]>>` (Kombinationen je Klasse)
  - `comboCount(h: HandClass): number` (6, 4 oder 12)
  - `compatMatrix(): Float64Array` (Länge 169·169; Eintrag `[i*169+j]` = durchschnittliche Anzahl Kombinationen von j, die mit einer Kombination von i keine Karte teilen; gecacht)
  - `type Rng = () => number` (Werte in [0, 1)), `mulberry32(seed: number): Rng`, `seedFromString(s: string): number`
  - `dealConcrete(h: HandClass, rng: Rng): readonly [Card, Card]`

- [ ] **Step 1: Failing Tests schreiben**

`src/engine/cards.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  COMBOS, HAND_COUNT, cardName, comboCount, compatMatrix, dealConcrete,
  handClassOf, handName, parseCard, parseHand, rankOf, suitOf,
} from './cards';
import { mulberry32 } from './rng';

describe('cards', () => {
  it('parses and names cards', () => {
    expect(parseCard('As')).toBe(12 * 4 + 3);
    expect(cardName(parseCard('Td'))).toBe('Td');
    expect(rankOf(parseCard('2c'))).toBe(0);
    expect(suitOf(parseCard('2h'))).toBe(2);
    expect(() => parseCard('Xx')).toThrow();
  });

  it('maps matrix layout to hand names', () => {
    expect(handName(0)).toBe('AA');
    expect(handName(1)).toBe('AKs');
    expect(handName(13)).toBe('AKo');
    expect(handName(168)).toBe('22');
    expect(parseHand('72o')).toBe(12 * 13 + 7);
    for (let h = 0; h < HAND_COUNT; h++) expect(parseHand(handName(h))).toBe(h);
  });

  it('classifies concrete cards', () => {
    expect(handName(handClassOf(parseCard('Ah'), parseCard('Kh')))).toBe('AKs');
    expect(handName(handClassOf(parseCard('Kd'), parseCard('Ah')))).toBe('AKo');
    expect(handName(handClassOf(parseCard('7c'), parseCard('7s')))).toBe('77');
  });

  it('has the right number of combos', () => {
    expect(comboCount(parseHand('AA'))).toBe(6);
    expect(comboCount(parseHand('AKs'))).toBe(4);
    expect(comboCount(parseHand('AKo'))).toBe(12);
    expect(COMBOS.reduce((sum, c) => sum + c.length, 0)).toBe(1326);
  });

  it('computes card-removal compatibility', () => {
    const m = compatMatrix();
    const aa = parseHand('AA');
    const kk = parseHand('KK');
    const aks = parseHand('AKs');
    expect(m[aa * 169 + kk]).toBe(6);
    expect(m[aa * 169 + aa]).toBe(1);
    expect(m[aa * 169 + aks]).toBe(2);
  });

  it('deals concrete cards of the requested class', () => {
    const rng = mulberry32(1);
    for (let h = 0; h < HAND_COUNT; h++) {
      const [a, b] = dealConcrete(h, rng);
      expect(handClassOf(a, b)).toBe(h);
    }
  });
});
```

`src/engine/rng.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { mulberry32, seedFromString } from './rng';

describe('rng', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('hashes strings stably', () => {
    expect(seedFromString('2026-10-13')).toBe(seedFromString('2026-10-13'));
    expect(seedFromString('2026-10-13')).not.toBe(seedFromString('2026-10-14'));
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test` → Expected: FAIL, Module `./cards` und `./rng` nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/engine/rng.ts`:
```ts
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a, used to derive deterministic seeds (e.g. from a date for the daily challenge).
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
```

`src/engine/cards.ts`:
```ts
import type { Rng } from './rng';

export type Card = number;
export type HandClass = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const HAND_COUNT = 169;

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;
export const cardName = (c: Card): string => RANKS[rankOf(c)] + SUITS[suitOf(c)];

export function parseCard(s: string): Card {
  const r = RANKS.indexOf(s[0] ?? '');
  const su = SUITS.indexOf(s[1] ?? '');
  if (s.length !== 2 || r < 0 || su < 0) throw new Error(`Ungültige Karte: ${s}`);
  return r * 4 + su;
}

// Matrix index 0 is the Ace, 12 the Deuce.
const toMatrix = (rank: number): number => 12 - rank;

export function handName(h: HandClass): string {
  const row = Math.floor(h / 13);
  const col = h % 13;
  const hi = RANKS[12 - Math.min(row, col)];
  const lo = RANKS[12 - Math.max(row, col)];
  if (row === col) return hi + lo;
  return hi + lo + (row < col ? 's' : 'o');
}

export function parseHand(name: string): HandClass {
  const hi = RANKS.indexOf(name[0] ?? '');
  const lo = RANKS.indexOf(name[1] ?? '');
  if (hi < 0 || lo < 0) throw new Error(`Ungültige Hand: ${name}`);
  if (hi === lo) {
    if (name.length !== 2) throw new Error(`Ungültige Hand: ${name}`);
    return toMatrix(hi) * 13 + toMatrix(hi);
  }
  const suffix = name[2];
  if (hi < lo || name.length !== 3 || (suffix !== 's' && suffix !== 'o')) {
    throw new Error(`Ungültige Hand: ${name}`);
  }
  return suffix === 's'
    ? toMatrix(hi) * 13 + toMatrix(lo)
    : toMatrix(lo) * 13 + toMatrix(hi);
}

export function handClassOf(a: Card, b: Card): HandClass {
  const hi = Math.max(rankOf(a), rankOf(b));
  const lo = Math.min(rankOf(a), rankOf(b));
  if (hi === lo) return toMatrix(hi) * 13 + toMatrix(hi);
  return suitOf(a) === suitOf(b)
    ? toMatrix(hi) * 13 + toMatrix(lo)
    : toMatrix(lo) * 13 + toMatrix(hi);
}

function buildCombos(): Array<Array<readonly [Card, Card]>> {
  const out: Array<Array<readonly [Card, Card]>> = Array.from({ length: HAND_COUNT }, () => []);
  for (let a = 0; a < 52; a++) {
    for (let b = a + 1; b < 52; b++) out[handClassOf(a, b)].push([a, b] as const);
  }
  return out;
}

export const COMBOS: ReadonlyArray<ReadonlyArray<readonly [Card, Card]>> = buildCombos();

export const comboCount = (h: HandClass): number => COMBOS[h].length;

let compatCache: Float64Array | null = null;

export function compatMatrix(): Float64Array {
  if (compatCache) return compatCache;
  const m = new Float64Array(HAND_COUNT * HAND_COUNT);
  for (let i = 0; i < HAND_COUNT; i++) {
    for (let j = 0; j < HAND_COUNT; j++) {
      let total = 0;
      for (const [a1, a2] of COMBOS[i]) {
        for (const [b1, b2] of COMBOS[j]) {
          if (b1 !== a1 && b1 !== a2 && b2 !== a1 && b2 !== a2) total++;
        }
      }
      m[i * HAND_COUNT + j] = total / COMBOS[i].length;
    }
  }
  compatCache = m;
  return m;
}

export function dealConcrete(h: HandClass, rng: Rng): readonly [Card, Card] {
  const combos = COMBOS[h];
  return combos[Math.floor(rng() * combos.length)];
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test` → Expected: alle Tests in `cards.test.ts` und `rng.test.ts` PASS.

- [ ] **Step 5: Smoke-Test löschen und committen**

```bash
git rm src/engine/smoke.test.ts
git add src/engine
git commit -m "feat(engine): Karten, Hand-Klassen und seedbarer Zufallsgenerator"
```

---

### Task 3: 7-Karten-Handbewertung

**Files:**
- Create: `src/engine/evaluator.ts`
- Test: `src/engine/evaluator.test.ts`

**Interfaces:**
- Consumes: `Card`, `rankOf`, `suitOf`, `parseCard` aus `cards.ts`
- Produces: `evaluate7(cards: ArrayLike<Card>): number` — höherer Wert = stärkere Hand, gleicher Wert = Split. Kodierung: `category * 16^5 + r1 * 16^4 + … + r5` mit Kategorien 0 High Card, 1 Paar, 2 Two Pair, 3 Drilling, 4 Straße, 5 Flush, 6 Full House, 7 Vierling, 8 Straight Flush. Außerdem `categoryOf(score: number): number`.

- [ ] **Step 1: Failing Test schreiben**

`src/engine/evaluator.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseCard } from './cards';
import { categoryOf, evaluate7 } from './evaluator';

const ev = (s: string) => evaluate7(s.split(' ').map(parseCard));

describe('evaluate7', () => {
  it('detects every category', () => {
    expect(categoryOf(ev('As Ks Qs Js Ts 2c 3d'))).toBe(8);
    expect(categoryOf(ev('9h 9d 9s 9c Ks 2c 3d'))).toBe(7);
    expect(categoryOf(ev('9h 9d 9s Kc Ks 2c 3d'))).toBe(6);
    expect(categoryOf(ev('2h 7h 9h Jh Kh 2c 3d'))).toBe(5);
    expect(categoryOf(ev('5c 6d 7h 8s 9c Kd 2h'))).toBe(4);
    expect(categoryOf(ev('9h 9d 9s Kc Qs 2c 3d'))).toBe(3);
    expect(categoryOf(ev('9h 9d Ks Kc Qs 2c 3d'))).toBe(2);
    expect(categoryOf(ev('9h 9d As Kc Qs 2c 3d'))).toBe(1);
    expect(categoryOf(ev('9h 8d As Kc Qs 2c 3d'))).toBe(0);
  });

  it('handles the wheel and the wheel straight flush', () => {
    expect(categoryOf(ev('Ac 2d 3h 4s 5c Kd Qh'))).toBe(4);
    expect(ev('Ac 2d 3h 4s 5c Kd Qh')).toBeLessThan(ev('2c 3d 4h 5s 6c Kd Qh'));
    expect(categoryOf(ev('Ah 2h 3h 4h 5h Kd Qc'))).toBe(8);
  });

  it('compares kickers correctly', () => {
    expect(ev('As Ad Kc 7h 5s 3c 2d')).toBeGreaterThan(ev('As Ad Qc 7h 5s 3c 2d'));
    expect(ev('Ks Kd 7c 7h As 3c 2d')).toBeGreaterThan(ev('Ks Kd 7c 7h Qs 3c 2d'));
    expect(ev('Ks Kd 7c 7h 3s 3c Ad')).toBe(ev('Ks Kd 7c 7h 2s 2c Ad'));
  });

  it('picks the best full house from two trips', () => {
    expect(ev('9h 9d 9s Kc Ks Kd 3d')).toBeGreaterThan(ev('9h 9d 9s Qc Qs Qd 3d'));
    expect(categoryOf(ev('9h 9d 9s Kc Ks Kd 3d'))).toBe(6);
  });

  it('prefers a flush over a straight in the same seven cards', () => {
    expect(categoryOf(ev('5h 6h 7d 8h 9c Kh 2h'))).toBe(5);
  });

  it('detects ties on the board', () => {
    expect(ev('2c 3d As Ks Qs Js Ts')).toBe(ev('4c 5d As Ks Qs Js Ts'));
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npm test -- src/engine/evaluator.test.ts` → Expected: FAIL, Modul `./evaluator` nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/engine/evaluator.ts`:
```ts
import { type Card, rankOf, suitOf } from './cards';

const BASE = 16;
const CATEGORY_FACTOR = BASE ** 5;

function score(category: number, ranks: readonly number[]): number {
  let v = category;
  for (let i = 0; i < 5; i++) v = v * BASE + (ranks[i] ?? 0);
  return v;
}

export const categoryOf = (s: number): number => Math.floor(s / CATEGORY_FACTOR);

// Highest rank of a 5-card straight inside a 13-bit rank mask, or -1. The wheel returns 3 (the Five).
function straightHigh(mask: number): number {
  const ext = (mask << 1) | ((mask >> 12) & 1);
  for (let hi = 13; hi >= 4; hi--) {
    if (((ext >> (hi - 4)) & 0x1f) === 0x1f) return hi - 1;
  }
  return -1;
}

function topRanks(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

export function evaluate7(cards: ArrayLike<Card>): number {
  const counts = new Uint8Array(13);
  const suitMask = [0, 0, 0, 0];
  const suitCount = [0, 0, 0, 0];
  let mask = 0;
  for (let i = 0; i < cards.length; i++) {
    const r = rankOf(cards[i]);
    const s = suitOf(cards[i]);
    counts[r]++;
    suitMask[s] |= 1 << r;
    suitCount[s]++;
    mask |= 1 << r;
  }

  for (let s = 0; s < 4; s++) {
    if (suitCount[s] >= 5) {
      const sf = straightHigh(suitMask[s]);
      return sf >= 0 ? score(8, [sf]) : score(5, topRanks(suitMask[s], 5));
    }
  }

  let quad = -1;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (counts[r] === 4) quad = r;
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }

  if (quad >= 0) return score(7, [quad, ...topRanks(mask & ~(1 << quad), 1)]);
  if (trips.length >= 2) return score(6, [trips[0], trips[1]]);
  if (trips.length === 1 && pairs.length >= 1) return score(6, [trips[0], pairs[0]]);

  const st = straightHigh(mask);
  if (st >= 0) return score(4, [st]);

  if (trips.length === 1) return score(3, [trips[0], ...topRanks(mask & ~(1 << trips[0]), 2)]);
  if (pairs.length >= 2) {
    const rest = mask & ~(1 << pairs[0]) & ~(1 << pairs[1]);
    return score(2, [pairs[0], pairs[1], ...topRanks(rest, 1)]);
  }
  if (pairs.length === 1) return score(1, [pairs[0], ...topRanks(mask & ~(1 << pairs[0]), 3)]);
  return score(0, topRanks(mask, 5));
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/engine/evaluator.test.ts` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/evaluator.ts src/engine/evaluator.test.ts
git commit -m "feat(engine): 7-Karten-Handbewertung"
```

---

### Task 4: Equity-Matrix (Monte-Carlo, parallel)

**Files:**
- Create: `src/engine/equity.ts`, `scripts/equity-worker.ts`, `scripts/compute-equity.ts`, `scripts/lib/args.ts`, `scripts/lib/equity-data.ts`
- Test: `src/engine/equity.test.ts`, `scripts/lib/equity-data.test.ts`
- Generated (wird committet): `scripts/data/equity.json`

**Interfaces:**
- Consumes: `COMBOS`, `HandClass`, `HAND_COUNT`, `parseHand` aus `cards.ts`; `evaluate7`; `Rng`, `mulberry32`
- Produces:
  - `sampleClassEquity(a: HandClass, b: HandClass, samples: number, rng: Rng): number` — Equity von a gegen b (Split zählt halb), gleichverteilt über kartenfremde Kombinationspaare
  - `parseArgs(argv: string[]): Record<string, string>` (aus `--key value`)
  - `type EquityFile = { samples: number; seed: number; equity: number[] }` — `equity[i*169+j]` = Equity von i gegen j, 4 Nachkommastellen
  - `loadEquity(): Float64Array` (liest `scripts/data/equity.json`)

Referenzwerte (gerundet): AA vs. KK ≈ 82 %, AKs vs. QQ ≈ 46 %, AKo vs. 22 ≈ 47 %, 72o vs. AA ≈ 12 %. Eine Abweichung über 1 Prozentpunkt ist ein Fehler in Evaluator oder Sampling und wird mit `mindCoder:systematic-debugging` untersucht, nicht durch Lockern der Toleranz. Die Zielgenauigkeit ±0,3 Prozentpunkte ergibt sich aus 100.000 Samples (Standardfehler ≤ 0,16 Prozentpunkte).

- [ ] **Step 1: Failing Test für die Sampling-Funktion schreiben**

`src/engine/equity.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseHand } from './cards';
import { sampleClassEquity } from './equity';
import { mulberry32 } from './rng';

const eq = (a: string, b: string) =>
  sampleClassEquity(parseHand(a), parseHand(b), 40_000, mulberry32(7));

describe('sampleClassEquity', () => {
  it('matches well-known preflop matchups within 1 percentage point', () => {
    expect(Math.abs(eq('AA', 'KK') - 0.82)).toBeLessThan(0.01);
    expect(Math.abs(eq('AKs', 'QQ') - 0.46)).toBeLessThan(0.01);
    expect(Math.abs(eq('AKo', '22') - 0.47)).toBeLessThan(0.01);
    expect(Math.abs(eq('72o', 'AA') - 0.12)).toBeLessThan(0.01);
  });

  it('is about even for identical classes', () => {
    expect(Math.abs(eq('T9s', 'T9s') - 0.5)).toBeLessThan(0.01);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npm test -- src/engine/equity.test.ts` → Expected: FAIL, Modul `./equity` nicht gefunden.

- [ ] **Step 3: Sampling implementieren**

`src/engine/equity.ts`:
```ts
import { COMBOS, type HandClass } from './cards';
import { evaluate7 } from './evaluator';
import type { Rng } from './rng';

export function sampleClassEquity(a: HandClass, b: HandClass, samples: number, rng: Rng): number {
  const ca = COMBOS[a];
  const cb = COMBOS[b];
  const deck = new Int32Array(52);
  const hero = new Int32Array(7);
  const villain = new Int32Array(7);
  let points = 0;
  let done = 0;
  while (done < samples) {
    const [a1, a2] = ca[Math.floor(rng() * ca.length)];
    const [b1, b2] = cb[Math.floor(rng() * cb.length)];
    if (b1 === a1 || b1 === a2 || b2 === a1 || b2 === a2) continue;

    let n = 0;
    for (let c = 0; c < 52; c++) {
      if (c !== a1 && c !== a2 && c !== b1 && c !== b2) deck[n++] = c;
    }
    for (let k = 0; k < 5; k++) {
      const r = k + Math.floor(rng() * (n - k));
      const tmp = deck[k];
      deck[k] = deck[r];
      deck[r] = tmp;
      hero[k + 2] = deck[k];
      villain[k + 2] = deck[k];
    }
    hero[0] = a1;
    hero[1] = a2;
    villain[0] = b1;
    villain[1] = b2;

    const s1 = evaluate7(hero);
    const s2 = evaluate7(villain);
    points += s1 > s2 ? 1 : s1 === s2 ? 0.5 : 0;
    done++;
  }
  return points / samples;
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `npm test -- src/engine/equity.test.ts` → Expected: PASS.

- [ ] **Step 5: Argument-Parser, Worker und Hauptskript schreiben**

`scripts/lib/args.ts`:
```ts
export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      out[key.slice(2)] = argv[i + 1] ?? 'true';
      i++;
    }
  }
  return out;
}
```

`scripts/equity-worker.ts`:
```ts
import { parentPort, workerData } from 'node:worker_threads';
import { sampleClassEquity } from '../src/engine/equity';
import { mulberry32 } from '../src/engine/rng';

type Job = { pairs: Array<[number, number]>; samples: number; seed: number };
const job = workerData as Job;
const rng = mulberry32(job.seed);
const results: Array<[number, number, number]> = [];
for (const [i, j] of job.pairs) {
  results.push([i, j, sampleClassEquity(i, j, job.samples, rng)]);
  if (results.length % 50 === 0) parentPort?.postMessage({ progress: 50 });
}
parentPort?.postMessage({ results });
```

`scripts/compute-equity.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { HAND_COUNT } from '../src/engine/cards';
import { parseArgs } from './lib/args';

const here = dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));
const samples = Number(args.samples ?? 100_000);
const seed = Number(args.seed ?? 20261013);
const workers = Math.max(1, availableParallelism() - 1);

const pairs: Array<[number, number]> = [];
for (let i = 0; i < HAND_COUNT; i++) for (let j = i + 1; j < HAND_COUNT; j++) pairs.push([i, j]);

const chunks: Array<Array<[number, number]>> = Array.from({ length: workers }, () => []);
pairs.forEach((p, k) => chunks[k % workers].push(p));

// Diagonal stays 0.5: identical classes are symmetric.
const equity = new Array<number>(HAND_COUNT * HAND_COUNT).fill(0.5);
let finished = 0;
const started = Date.now();

console.log(`Equity: ${pairs.length} Paare, ${samples} Samples, ${workers} Worker`);

await Promise.all(
  chunks.map(
    (chunk, w) =>
      new Promise<void>((resolve, reject) => {
        const worker = new Worker(new URL('./equity-worker.ts', import.meta.url), {
          workerData: { pairs: chunk, samples, seed: seed + w },
          execArgv: ['--import', 'tsx'],
        });
        worker.on('message', (msg: { progress?: number; results?: Array<[number, number, number]> }) => {
          if (msg.progress) {
            finished += msg.progress;
            const pct = ((finished / pairs.length) * 100).toFixed(1);
            const min = ((Date.now() - started) / 60_000).toFixed(1);
            process.stdout.write(`\r${pct} % nach ${min} min   `);
          }
          if (msg.results) {
            for (const [i, j, e] of msg.results) {
              equity[i * HAND_COUNT + j] = e;
              equity[j * HAND_COUNT + i] = 1 - e;
            }
            resolve();
          }
        });
        worker.on('error', reject);
      }),
  ),
);

const outDir = join(here, 'data');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'equity.json'),
  JSON.stringify({ samples, seed, equity: equity.map((e) => Math.round(e * 10_000) / 10_000) }),
);
console.log('\nFertig: scripts/data/equity.json');
```

- [ ] **Step 6: Probelauf mit wenigen Samples**

Run: `npm run data:equity -- --samples 2000`
Expected: Fortschrittsanzeige, am Ende `Fertig: scripts/data/equity.json`, Laufzeit unter 2 Minuten. Bricht der Worker mit `ERR_UNKNOWN_FILE_EXTENSION` ab, wird `execArgv` nicht übernommen: dann `execArgv: [...process.execArgv, '--import', 'tsx']` setzen und erneut prüfen.

- [ ] **Step 7: Finalen Lauf im Hintergrund starten**

Run: `npm run data:equity -- --samples 100000`
Expected: je nach CPU ca. 10–40 Minuten. Danach liegt `scripts/data/equity.json` (ca. 200 KB) vor. Während der Lauf läuft, kann Task 5 bearbeitet werden, denn Task 5 testet mit synthetischen Daten.

- [ ] **Step 8: Loader mit Validierungstest schreiben**

`scripts/lib/equity-data.ts`:
```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HAND_COUNT } from '../../src/engine/cards';

export type EquityFile = { samples: number; seed: number; equity: number[] };

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'equity.json');

export function loadEquity(): Float64Array {
  const data = JSON.parse(readFileSync(file, 'utf8')) as EquityFile;
  if (data.equity.length !== HAND_COUNT * HAND_COUNT) {
    throw new Error('equity.json hat die falsche Länge, bitte npm run data:equity erneut ausführen');
  }
  return Float64Array.from(data.equity);
}
```

`scripts/lib/equity-data.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { HAND_COUNT, parseHand } from '../../src/engine/cards';
import { loadEquity } from './equity-data';

describe('equity.json', () => {
  const m = loadEquity();
  const eq = (a: string, b: string) => m[parseHand(a) * HAND_COUNT + parseHand(b)];

  it('matches reference matchups within 1 percentage point', () => {
    expect(Math.abs(eq('AA', 'KK') - 0.82)).toBeLessThan(0.01);
    expect(Math.abs(eq('AKs', 'QQ') - 0.46)).toBeLessThan(0.01);
    expect(Math.abs(eq('AKo', '22') - 0.47)).toBeLessThan(0.01);
    expect(Math.abs(eq('72o', 'AA') - 0.12)).toBeLessThan(0.01);
  });

  it('is antisymmetric', () => {
    for (let i = 0; i < HAND_COUNT; i++) {
      for (let j = 0; j < HAND_COUNT; j++) {
        expect(m[i * HAND_COUNT + j] + m[j * HAND_COUNT + i]).toBeCloseTo(1, 3);
      }
    }
  });

  it('was computed with the final sample size', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const raw = readFileSync(fileURLToPath(new URL('../data/equity.json', import.meta.url)), 'utf8');
    expect((JSON.parse(raw) as { samples: number }).samples).toBeGreaterThanOrEqual(100_000);
  });
});
```

- [ ] **Step 9: Nach Ende des finalen Laufs testen und committen**

Run: `npm test -- scripts/lib/equity-data.test.ts` → Expected: PASS.

```bash
git add src/engine/equity.ts src/engine/equity.test.ts scripts
git commit -m "feat(data): Monte-Carlo-Equity-Matrix für alle 169 Hand-Klassen"
```

---

### Task 5: Positionen und Nash-Solver

**Files:**
- Create: `src/engine/positions.ts`, `scripts/lib/nash.ts`
- Test: `src/engine/positions.test.ts`, `scripts/lib/nash.test.ts`

**Interfaces:**
- Consumes: `HAND_COUNT`, `COMBOS`, `compatMatrix` aus `cards.ts`
- Produces (`src/engine/positions.ts`):
  - `POSITIONS = ['UTG','UTG1','LJ','HJ','CO','BTN','SB','BB'] as const`, `type Position = (typeof POSITIONS)[number]`
  - `POSITION_LABELS: Record<Position, string>` (`UTG1` → `"UTG+1"`, sonst gleich)
  - `ANTE = 1`, `DEAD_MONEY = 2.5`
  - `seatOf(p: Position): number`, `blindOf(seat: number): number` (SB 0,5, BB 1, sonst 0)
  - `OPEN_POSITIONS: readonly Position[]` (UTG bis SB), `callerPositions(shover: Position): Position[]` (alle Sitze dahinter)
  - `potWhenCalled(stack: number, shoverSeat: number, callerSeat: number): number`
- Produces (`scripts/lib/nash.ts`):
  - `type NashInput = { equity: Float64Array; compat: Float64Array; stack: number; shoverSeat: number; iterations: number }`
  - `type NashResult = { shoveEv: Float64Array; callEv: Float64Array[]; shoveFreq: Float64Array; callFreq: Float64Array[]; exploitability: number }` — `callEv[k]` gehört zum Sitz `shoverSeat + 1 + k`; `exploitability` = größter Best-Response-Gewinn eines Spielers in BB (kombinationsgewichtet)
  - `shoverEvs(input: NashInput, callFreq: Float64Array[], out: Float64Array): void`
  - `callerEvs(input: NashInput, k: number, shoveFreq: Float64Array, out: Float64Array): void`
  - `solveSpot(input: NashInput): NashResult`

**Modell (verbindlich):** EVs relativ zu Fold. Shover auf Sitz s mit Blind b_s, Stack S. Alle folden → +2,5 BB (`DEAD_MONEY`). Caller c (Blind b_c) callt → Pot = `2S + 1 + (1,5 − b_s − b_c)`; Shover-EV = `eq · Pot − S + b_s`, Caller-EV = `eq · Pot − S + b_c`. Call-Wahrscheinlichkeit von c = Anteil seiner mit der Shover-Hand kompatiblen Kombinationen in der Call-Range. c entscheidet nur, wenn alle Sitze zwischen s und c gefoldet haben; nach einem Call folden alle Übrigen. Lösung per Fictitious Play: in jeder Iteration Best Response aller Spieler gegen die gemittelten Strategien, dann Mittelung mit Gewicht `1/(t+1)`.

- [ ] **Step 1: Failing Tests schreiben**

`src/engine/positions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEAD_MONEY, OPEN_POSITIONS, blindOf, callerPositions, potWhenCalled, seatOf } from './positions';

describe('positions', () => {
  it('knows seats and blinds', () => {
    expect(seatOf('UTG')).toBe(0);
    expect(seatOf('BB')).toBe(7);
    expect(blindOf(seatOf('SB'))).toBe(0.5);
    expect(blindOf(seatOf('BB'))).toBe(1);
    expect(blindOf(seatOf('BTN'))).toBe(0);
    expect(DEAD_MONEY).toBe(2.5);
  });

  it('lists open and caller positions', () => {
    expect(OPEN_POSITIONS).toEqual(['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB']);
    expect(callerPositions('BTN')).toEqual(['SB', 'BB']);
    expect(callerPositions('SB')).toEqual(['BB']);
  });

  it('computes the pot when called', () => {
    expect(potWhenCalled(10, seatOf('SB'), seatOf('BB'))).toBe(21);
    expect(potWhenCalled(10, seatOf('BTN'), seatOf('BB'))).toBe(21.5);
    expect(potWhenCalled(10, seatOf('UTG'), seatOf('CO'))).toBe(22.5);
  });
});
```

`scripts/lib/nash.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { HAND_COUNT, compatMatrix } from '../../src/engine/cards';
import { seatOf } from '../../src/engine/positions';
import { callerEvs, shoverEvs, solveSpot, type NashInput } from './nash';

const N = HAND_COUNT;
const compat = compatMatrix();

// Synthetic equity: monotone in a strength score, antisymmetric, between 0.2 and 0.8.
function syntheticEquity(): Float64Array {
  const strength = Array.from({ length: N }, (_, h) => 1 - h / (N - 1));
  const e = new Float64Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) e[i * N + j] = 0.5 + 0.3 * (strength[i] - strength[j]);
  return e;
}
const flatEquity = new Float64Array(N * N).fill(0.5);

const input = (over: Partial<NashInput>): NashInput => ({
  equity: syntheticEquity(),
  compat,
  stack: 10,
  shoverSeat: seatOf('SB'),
  iterations: 500,
  ...over,
});

describe('EV formulas', () => {
  it('gives the dead money when nobody ever calls', () => {
    const out = new Float64Array(N);
    shoverEvs(input({ shoverSeat: seatOf('BTN') }), [new Float64Array(N), new Float64Array(N)], out);
    for (let h = 0; h < N; h++) expect(out[h]).toBeCloseTo(2.5, 10);
  });

  it('matches the hand-computed value for an always-call coinflip', () => {
    const out = new Float64Array(N);
    shoverEvs(input({ equity: flatEquity }), [new Float64Array(N).fill(1)], out);
    // pot 21, 0.5 * 21 - 10 + 0.5 = 1.0
    for (let h = 0; h < N; h++) expect(out[h]).toBeCloseTo(1.0, 10);
  });

  it('computes the caller EV against a range', () => {
    const out = new Float64Array(N);
    callerEvs(input({ equity: flatEquity }), 0, new Float64Array(N).fill(1), out);
    // pot 21, 0.5 * 21 - 10 + 1 = 1.5
    for (let h = 0; h < N; h++) expect(out[h]).toBeCloseTo(1.5, 10);
  });
});

describe('solveSpot', () => {
  it('lets the BB call everything at 1 BB', () => {
    const r = solveSpot(input({ stack: 1 }));
    for (let h = 0; h < N; h++) expect(r.callEv[0][h]).toBeGreaterThanOrEqual(0);
  });

  it('converges to a low exploitability', () => {
    const r = solveSpot(input({ shoverSeat: seatOf('CO') }));
    expect(r.exploitability).toBeLessThan(0.05);
  });

  it('shoves the strongest and folds the weakest synthetic hands', () => {
    const r = solveSpot(input({ shoverSeat: seatOf('UTG'), stack: 20 }));
    for (let h = 0; h < 10; h++) expect(r.shoveEv[h]).toBeGreaterThan(0);
    for (let h = N - 10; h < N; h++) expect(r.shoveEv[h]).toBeLessThan(0);
  });

  it('shoves wider from the SB than from UTG', () => {
    const count = (ev: Float64Array) => ev.reduce((n, x) => n + (x > 0 ? 1 : 0), 0);
    const utg = solveSpot(input({ shoverSeat: seatOf('UTG') }));
    const sb = solveSpot(input({ shoverSeat: seatOf('SB') }));
    expect(count(sb.shoveEv)).toBeGreaterThan(count(utg.shoveEv));
  });
});
```

- [ ] **Step 2: Tests laufen lassen, sie müssen fehlschlagen**

Run: `npm test -- src/engine/positions.test.ts scripts/lib/nash.test.ts` → Expected: FAIL, Module nicht gefunden.

- [ ] **Step 3: Positionen implementieren**

`src/engine/positions.ts`:
```ts
export const POSITIONS = ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_LABELS: Record<Position, string> = {
  UTG: 'UTG', UTG1: 'UTG+1', LJ: 'LJ', HJ: 'HJ', CO: 'CO', BTN: 'BTN', SB: 'SB', BB: 'BB',
};

export const ANTE = 1;
const SB_BLIND = 0.5;
const BB_BLIND = 1;
export const DEAD_MONEY = ANTE + SB_BLIND + BB_BLIND;

const SB_SEAT = 6;
const BB_SEAT = 7;

export const seatOf = (p: Position): number => POSITIONS.indexOf(p);

export function blindOf(seat: number): number {
  if (seat === SB_SEAT) return SB_BLIND;
  if (seat === BB_SEAT) return BB_BLIND;
  return 0;
}

export const OPEN_POSITIONS: readonly Position[] = POSITIONS.slice(0, BB_SEAT);

export const callerPositions = (shover: Position): Position[] => POSITIONS.slice(seatOf(shover) + 1);

// Both players put in the full stack (blinds included), plus the ante and the other blinds as dead money.
export function potWhenCalled(stack: number, shoverSeat: number, callerSeat: number): number {
  return 2 * stack + ANTE + (SB_BLIND + BB_BLIND - blindOf(shoverSeat) - blindOf(callerSeat));
}
```

- [ ] **Step 4: Solver implementieren**

`scripts/lib/nash.ts`:
```ts
import { COMBOS, HAND_COUNT } from '../../src/engine/cards';
import { DEAD_MONEY, blindOf, potWhenCalled } from '../../src/engine/positions';

const N = HAND_COUNT;
const SEATS = 8;
const COMBO_WEIGHT = Float64Array.from(COMBOS, (c) => c.length / 1326);

export type NashInput = {
  equity: Float64Array;
  compat: Float64Array;
  stack: number;
  shoverSeat: number;
  iterations: number;
};

export type NashResult = {
  shoveEv: Float64Array;
  callEv: Float64Array[];
  shoveFreq: Float64Array;
  callFreq: Float64Array[];
  exploitability: number;
};

const callerCount = (shoverSeat: number): number => SEATS - 1 - shoverSeat;

export function shoverEvs(input: NashInput, callFreq: Float64Array[], out: Float64Array): void {
  const { equity: E, compat: C, stack: S, shoverSeat: s } = input;
  const bS = blindOf(s);
  for (let h = 0; h < N; h++) {
    let reach = 1;
    let ev = 0;
    for (let k = 0; k < callFreq.length; k++) {
      const q = callFreq[k];
      let wTotal = 0;
      let wCall = 0;
      let wEq = 0;
      for (let y = 0; y < N; y++) {
        const w = C[h * N + y];
        wTotal += w;
        const wc = w * q[y];
        wCall += wc;
        wEq += wc * E[h * N + y];
      }
      const p = wTotal > 0 ? wCall / wTotal : 0;
      if (wCall > 0) {
        const eq = wEq / wCall;
        ev += reach * p * (eq * potWhenCalled(S, s, s + 1 + k) - S + bS);
      }
      reach *= 1 - p;
    }
    out[h] = ev + reach * DEAD_MONEY;
  }
}

export function callerEvs(input: NashInput, k: number, shoveFreq: Float64Array, out: Float64Array): void {
  const { equity: E, compat: C, stack: S, shoverSeat: s } = input;
  const c = s + 1 + k;
  const bC = blindOf(c);
  const pot = potWhenCalled(S, s, c);
  for (let h = 0; h < N; h++) {
    let w = 0;
    let wEq = 0;
    for (let x = 0; x < N; x++) {
      const wx = C[h * N + x] * shoveFreq[x];
      w += wx;
      wEq += wx * E[h * N + x];
    }
    out[h] = w > 0 ? (wEq / w) * pot - S + bC : 0;
  }
}

// Combo-weighted gain of the best response over the current mixed strategy.
function regret(ev: Float64Array, freq: Float64Array): number {
  let gain = 0;
  for (let h = 0; h < N; h++) gain += COMBO_WEIGHT[h] * (Math.max(ev[h], 0) - freq[h] * ev[h]);
  return gain;
}

export function solveSpot(input: NashInput): NashResult {
  const callers = callerCount(input.shoverSeat);
  const shoveFreq = new Float64Array(N).fill(0.5);
  const callFreq = Array.from({ length: callers }, () => new Float64Array(N).fill(0.5));
  const shoveEv = new Float64Array(N);
  const callEv = Array.from({ length: callers }, () => new Float64Array(N));

  for (let t = 1; t <= input.iterations; t++) {
    shoverEvs(input, callFreq, shoveEv);
    for (let k = 0; k < callers; k++) callerEvs(input, k, shoveFreq, callEv[k]);
    const alpha = 1 / (t + 1);
    for (let h = 0; h < N; h++) shoveFreq[h] += alpha * ((shoveEv[h] > 0 ? 1 : 0) - shoveFreq[h]);
    for (let k = 0; k < callers; k++) {
      for (let h = 0; h < N; h++) callFreq[k][h] += alpha * ((callEv[k][h] > 0 ? 1 : 0) - callFreq[k][h]);
    }
  }

  shoverEvs(input, callFreq, shoveEv);
  for (let k = 0; k < callers; k++) callerEvs(input, k, shoveFreq, callEv[k]);

  let exploitability = regret(shoveEv, shoveFreq);
  for (let k = 0; k < callers; k++) exploitability = Math.max(exploitability, regret(callEv[k], callFreq[k]));

  return { shoveEv, callEv, shoveFreq, callFreq, exploitability };
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test -- src/engine/positions.test.ts scripts/lib/nash.test.ts` → Expected: alle PASS. Schlägt `converges to a low exploitability` fehl, zuerst die gemessene Exploitability ausgeben und prüfen, ob sie mit steigender Iterationszahl sinkt. Sinkt sie, die Iterationszahl im Test erhöhen. Sinkt sie nicht, liegt ein Fehler in den EV-Formeln vor: `mindCoder:systematic-debugging`.

- [ ] **Step 6: Commit**

```bash
git add src/engine/positions.ts src/engine/positions.test.ts scripts/lib/nash.ts scripts/lib/nash.test.ts
git commit -m "feat(nash): Positionen und Fictitious-Play-Solver für Push/Fold"
```

---

### Task 6: Push/Fold-Daten erzeugen und validieren

**Voraussetzung:** Task 4, Step 9 ist abgeschlossen (finale `scripts/data/equity.json` liegt vor).

**Files:**
- Create: `src/engine/pushfold-data.ts`, `scripts/build-pushfold.ts`, `scripts/print-ranges.ts`
- Modify: `package.json` (Skript `data:print`)
- Test: `scripts/pushfold-validation.test.ts`
- Generated (wird committet): `src/data/pushfold.json`

**Interfaces:**
- Consumes: `loadEquity`, `compatMatrix`, `solveSpot`, `POSITIONS`, `OPEN_POSITIONS`, `callerPositions`, `seatOf`, `parseArgs`
- Produces (`src/engine/pushfold-data.ts`):
  - `MIN_STACK = 1`, `MAX_STACK = 20`
  - `type PushFoldData = { version: 1; config: { seats: 8; ante: 1; minStack: 1; maxStack: 20; iterations: number; maxExploitability: number }; openShove: Record<string, number[][]>; callVsShove: Record<string, number[][]> }`
    - `openShove[position][stack - 1][hand]` = EV(Shove) in BB relativ zu Fold, 2 Nachkommastellen
    - `callVsShove[callKey(shover, caller)][stack - 1][hand]` = EV(Call) in BB relativ zu Fold, 2 Nachkommastellen
  - `callKey(shover: Position, caller: Position): string` → `"BTN>BB"`

**Validierungsregeln (ersetzen den Abgleich mit veröffentlichten Charts, siehe Spec 4.4):**
1. Jeder Spot hat eine Exploitability unter 0,05 BB, also klar unter der Grenzfall-Schwelle von 0,1 BB.
2. AA wird in jedem Open-Spot geshovt und in jedem Call-Spot gecallt.
3. 72o wird bei 20 BB aus UTG gefoldet.
4. Der BB callt bei 1 BB gegen jeden Shove mit jeder Hand (EV ≥ 0).
5. Die Open-Shove-Range wird mit sinkendem Stack nicht enger (Toleranz 2 Prozentpunkte Kombinationsanteil).
6. Bei gleichem Stack ist die SB-Range mindestens so breit wie die BTN-Range, und die BTN-Range ist mindestens so breit wie die UTG-Range.

- [ ] **Step 1: Datentyp schreiben**

`src/engine/pushfold-data.ts`:
```ts
import type { Position } from './positions';

export const MIN_STACK = 1;
export const MAX_STACK = 20;

export type PushFoldData = {
  version: 1;
  config: {
    seats: 8;
    ante: 1;
    minStack: 1;
    maxStack: 20;
    iterations: number;
    maxExploitability: number;
  };
  openShove: Record<string, number[][]>;
  callVsShove: Record<string, number[][]>;
};

export const callKey = (shover: Position, caller: Position): string => `${shover}>${caller}`;
```

- [ ] **Step 2: Build-Skript schreiben**

`scripts/build-pushfold.ts`:
```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compatMatrix } from '../src/engine/cards';
import { OPEN_POSITIONS, callerPositions, seatOf } from '../src/engine/positions';
import { MAX_STACK, MIN_STACK, callKey, type PushFoldData } from '../src/engine/pushfold-data';
import { parseArgs } from './lib/args';
import { loadEquity } from './lib/equity-data';
import { solveSpot } from './lib/nash';

const MAX_EXPLOITABILITY = 0.05;
const args = parseArgs(process.argv.slice(2));
const iterations = Number(args.iterations ?? 500);

const equity = loadEquity();
const compat = compatMatrix();
const round2 = (x: number) => Math.round(x * 100) / 100;

const data: PushFoldData = {
  version: 1,
  config: { seats: 8, ante: 1, minStack: 1, maxStack: 20, iterations, maxExploitability: 0 },
  openShove: {},
  callVsShove: {},
};

for (const shover of OPEN_POSITIONS) {
  data.openShove[shover] = [];
  const callers = callerPositions(shover);
  for (const caller of callers) data.callVsShove[callKey(shover, caller)] = [];

  for (let stack = MIN_STACK; stack <= MAX_STACK; stack++) {
    const r = solveSpot({ equity, compat, stack, shoverSeat: seatOf(shover), iterations });
    if (r.exploitability > MAX_EXPLOITABILITY) {
      throw new Error(
        `${shover} ${stack} BB: Exploitability ${r.exploitability.toFixed(3)} BB über ${MAX_EXPLOITABILITY}. Mehr --iterations verwenden.`,
      );
    }
    data.config.maxExploitability = Math.max(data.config.maxExploitability, Math.round(r.exploitability * 1000) / 1000);
    data.openShove[shover].push(Array.from(r.shoveEv, round2));
    callers.forEach((caller, k) => data.callVsShove[callKey(shover, caller)].push(Array.from(r.callEv[k], round2)));
  }
  console.log(`${shover}: fertig`);
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'pushfold.json'), JSON.stringify(data));
console.log(`Fertig: src/data/pushfold.json (max. Exploitability ${data.config.maxExploitability} BB)`);
```

- [ ] **Step 3: Daten erzeugen**

Run: `npm run data:pushfold`
Expected: sieben Zeilen `UTG: fertig` … `SB: fertig`, danach `Fertig: src/data/pushfold.json (max. Exploitability … BB)` mit einem Wert unter 0,05. Laufzeit wenige Minuten. Bricht das Skript wegen der Exploitability ab: `npm run data:pushfold -- --iterations 2000`.

- [ ] **Step 4: Validierungstest schreiben**

`scripts/pushfold-validation.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMBOS, HAND_COUNT, parseHand } from '../src/engine/cards';
import { OPEN_POSITIONS, callerPositions } from '../src/engine/positions';
import { MAX_STACK, MIN_STACK, callKey, type PushFoldData } from '../src/engine/pushfold-data';

const data = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/data/pushfold.json', import.meta.url)), 'utf8'),
) as PushFoldData;

const width = (evs: number[]) =>
  evs.reduce((sum, ev, h) => sum + (ev > 0 ? COMBOS[h].length : 0), 0) / 1326;

describe('pushfold.json', () => {
  it('stays below the exploitability limit', () => {
    expect(data.config.maxExploitability).toBeLessThan(0.05);
  });

  it('covers every spot with 169 values', () => {
    for (const p of OPEN_POSITIONS) {
      expect(data.openShove[p]).toHaveLength(MAX_STACK - MIN_STACK + 1);
      for (const row of data.openShove[p]) expect(row).toHaveLength(HAND_COUNT);
      for (const c of callerPositions(p)) expect(data.callVsShove[callKey(p, c)]).toHaveLength(MAX_STACK);
    }
  });

  it('always shoves and calls AA', () => {
    const aa = parseHand('AA');
    for (const p of OPEN_POSITIONS) {
      for (const row of data.openShove[p]) expect(row[aa]).toBeGreaterThan(0);
      for (const c of callerPositions(p)) for (const row of data.callVsShove[callKey(p, c)]) expect(row[aa]).toBeGreaterThan(0);
    }
  });

  it('folds 72o UTG at 20 BB', () => {
    expect(data.openShove.UTG[19][parseHand('72o')]).toBeLessThan(0);
  });

  it('calls everything in the BB at 1 BB', () => {
    for (const p of OPEN_POSITIONS) {
      for (const ev of data.callVsShove[callKey(p, 'BB')][0]) expect(ev).toBeGreaterThanOrEqual(0);
    }
  });

  it('never tightens the shove range as the stack shrinks', () => {
    for (const p of OPEN_POSITIONS) {
      for (let s = MIN_STACK; s < MAX_STACK; s++) {
        expect(width(data.openShove[p][s - 1])).toBeGreaterThanOrEqual(width(data.openShove[p][s]) - 0.02);
      }
    }
  });

  it('shoves wider from later positions', () => {
    for (let s = MIN_STACK; s <= MAX_STACK; s++) {
      expect(width(data.openShove.SB[s - 1])).toBeGreaterThanOrEqual(width(data.openShove.BTN[s - 1]) - 0.02);
      expect(width(data.openShove.BTN[s - 1])).toBeGreaterThanOrEqual(width(data.openShove.UTG[s - 1]) - 0.02);
    }
  });
});
```

- [ ] **Step 5: Validierung laufen lassen**

Run: `npm test -- scripts/pushfold-validation.test.ts` → Expected: alle PASS. Ein Fehlschlag bedeutet einen Fehler im Modell oder Solver: `mindCoder:systematic-debugging`, keine Toleranz lockern.

- [ ] **Step 6: Plausibilitäts-Ausgabe für den Nutzer**

`scripts/print-ranges.ts`:
```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COMBOS } from '../src/engine/cards';
import type { PushFoldData } from '../src/engine/pushfold-data';

const data = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/data/pushfold.json', import.meta.url)), 'utf8'),
) as PushFoldData;

for (const p of ['UTG', 'HJ', 'CO', 'BTN', 'SB']) {
  const cells = [5, 10, 15, 20].map((s) => {
    const w = data.openShove[p][s - 1].reduce((a, ev, h) => a + (ev > 0 ? COMBOS[h].length : 0), 0) / 1326;
    return `${s} BB: ${(w * 100).toFixed(1)} %`;
  });
  console.log(`${p.padEnd(4)} ${cells.join(' | ')}`);
}
```

In `package.json` unter `scripts` ergänzen: `"data:print": "tsx scripts/print-ranges.ts"`.

Run: `npm run data:print`
Expected: Tabelle der Open-Shove-Range-Breiten. Diese Werte werden dem Nutzer gezeigt, damit er sie optional mit einem Rechner (z. B. ICMIZER, Nash-Modus, 8-max, BB-Ante) stichprobenartig vergleichen kann.

- [ ] **Step 7: Commit**

```bash
git add package.json src/engine/pushfold-data.ts scripts/build-pushfold.ts scripts/print-ranges.ts scripts/pushfold-validation.test.ts src/data/pushfold.json
git commit -m "feat(data): Push/Fold-EVs für 8-max mit BB-Ante erzeugt und validiert"
```

---

### Task 7: EV-Lookup, Bewertung und Range-Chart

**Files:**
- Create: `src/engine/pushfold.ts`, `src/engine/test-fixtures.ts`
- Test: `src/engine/pushfold.test.ts`

**Interfaces:**
- Consumes: `PushFoldData`, `callKey`, `MIN_STACK`, `MAX_STACK` aus `pushfold-data.ts`; `Position`, `OPEN_POSITIONS`, `callerPositions`, `seatOf`; `HandClass`, `HAND_COUNT`
- Produces (`src/engine/pushfold.ts`):
  - `type Situation = { kind: 'open'; position: Position; stack: number } | { kind: 'call'; shover: Position; position: Position; stack: number }`
  - `type Spot = Situation & { hand: HandClass }`
  - `type Action = 'shove' | 'call' | 'fold'`
  - `type Verdict = 'correct' | 'close' | 'wrong'`
  - `type Grade = { verdict: Verdict; chosen: Action; best: Action; evAggressive: number }` — `best` ist die Aktion mit höherem EV, `evAggressive` = EV(Shove bzw. Call) relativ zu Fold
  - `type ChartCell = 'aggressive' | 'fold' | 'close'`
  - `CLOSE_THRESHOLD = 0.1`
  - `aggressiveAction(s: Situation): Action` (`'shove'` bei open, `'call'` bei call)
  - `evRow(data: PushFoldData, s: Situation): readonly number[]` (169 EVs; wirft bei ungültigem Spot einen deutschen Fehler)
  - `evOf(data: PushFoldData, spot: Spot): number`
  - `grade(data: PushFoldData, spot: Spot, chosen: Action): Grade`
  - `chart(data: PushFoldData, s: Situation): ChartCell[]`
- Produces (`src/engine/test-fixtures.ts`): `makeFixture(ev: (hand: number, s: Situation) => number): PushFoldData` — für Tests in Task 7, Task 8 und Plan 2

- [ ] **Step 1: Test-Fixture schreiben**

`src/engine/test-fixtures.ts`:
```ts
import { HAND_COUNT } from './cards';
import { OPEN_POSITIONS, callerPositions } from './positions';
import type { Situation } from './pushfold';
import { MAX_STACK, MIN_STACK, callKey, type PushFoldData } from './pushfold-data';

export function makeFixture(ev: (hand: number, s: Situation) => number): PushFoldData {
  const data: PushFoldData = {
    version: 1,
    config: { seats: 8, ante: 1, minStack: 1, maxStack: 20, iterations: 0, maxExploitability: 0 },
    openShove: {},
    callVsShove: {},
  };
  for (const shover of OPEN_POSITIONS) {
    data.openShove[shover] = [];
    for (let stack = MIN_STACK; stack <= MAX_STACK; stack++) {
      const s: Situation = { kind: 'open', position: shover, stack };
      data.openShove[shover].push(Array.from({ length: HAND_COUNT }, (_, h) => ev(h, s)));
    }
    for (const caller of callerPositions(shover)) {
      const key = callKey(shover, caller);
      data.callVsShove[key] = [];
      for (let stack = MIN_STACK; stack <= MAX_STACK; stack++) {
        const s: Situation = { kind: 'call', shover, position: caller, stack };
        data.callVsShove[key].push(Array.from({ length: HAND_COUNT }, (_, h) => ev(h, s)));
      }
    }
  }
  return data;
}
```

- [ ] **Step 2: Failing Test schreiben**

`src/engine/pushfold.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseHand } from './cards';
import { chart, evOf, grade } from './pushfold';
import { makeFixture } from './test-fixtures';

// EV = (84 - hand) / 10: hand 0 (AA) is +8.4, hand 84 is exactly 0, hand 168 (22) is -8.4.
const data = makeFixture((h, s) => (84 - h) / 10 + (s.kind === 'call' ? 0.05 : 0));

describe('evOf', () => {
  it('reads open-shove and call EVs', () => {
    expect(evOf(data, { kind: 'open', position: 'BTN', stack: 10, hand: 0 })).toBeCloseTo(8.4);
    expect(evOf(data, { kind: 'call', shover: 'BTN', position: 'BB', stack: 10, hand: 0 })).toBeCloseTo(8.45);
  });

  it('rejects invalid spots', () => {
    expect(() => evOf(data, { kind: 'open', position: 'BB', stack: 10, hand: 0 })).toThrow();
    expect(() => evOf(data, { kind: 'open', position: 'BTN', stack: 21, hand: 0 })).toThrow();
    expect(() => evOf(data, { kind: 'open', position: 'BTN', stack: 2.5, hand: 0 })).toThrow();
    expect(() => evOf(data, { kind: 'call', shover: 'BB', position: 'SB', stack: 10, hand: 0 })).toThrow();
    expect(() => evOf(data, { kind: 'call', shover: 'BTN', position: 'CO', stack: 10, hand: 0 })).toThrow();
  });
});

describe('grade', () => {
  const open = { kind: 'open', position: 'CO', stack: 12 } as const;

  it('marks the higher-EV action as correct', () => {
    expect(grade(data, { ...open, hand: parseHand('AA') }, 'shove')).toMatchObject({ verdict: 'correct', best: 'shove' });
    expect(grade(data, { ...open, hand: parseHand('AA') }, 'fold')).toMatchObject({ verdict: 'wrong', best: 'shove' });
    expect(grade(data, { ...open, hand: 168 }, 'fold')).toMatchObject({ verdict: 'correct', best: 'fold' });
  });

  it('treats near-zero EV as close and accepts both answers', () => {
    expect(grade(data, { ...open, hand: 84 }, 'fold').verdict).toBe('close');
    expect(grade(data, { ...open, hand: 84 }, 'shove').verdict).toBe('close');
    expect(grade(data, { ...open, hand: 83 }, 'fold').verdict).toBe('wrong');
  });

  it('rejects actions that do not fit the spot', () => {
    expect(() => grade(data, { ...open, hand: 0 }, 'call')).toThrow();
    expect(() => grade(data, { kind: 'call', shover: 'CO', position: 'BB', stack: 12, hand: 0 }, 'shove')).toThrow();
  });
});

describe('chart', () => {
  it('classifies every hand', () => {
    const cells = chart(data, { kind: 'open', position: 'SB', stack: 8 });
    expect(cells).toHaveLength(169);
    expect(cells[0]).toBe('aggressive');
    expect(cells[84]).toBe('close');
    expect(cells[168]).toBe('fold');
  });
});
```

- [ ] **Step 3: Test laufen lassen, er muss fehlschlagen**

Run: `npm test -- src/engine/pushfold.test.ts` → Expected: FAIL, Modul `./pushfold` nicht gefunden.

- [ ] **Step 4: Implementierung schreiben**

`src/engine/pushfold.ts`:
```ts
import type { HandClass } from './cards';
import { OPEN_POSITIONS, type Position, callerPositions } from './positions';
import { MAX_STACK, MIN_STACK, type PushFoldData, callKey } from './pushfold-data';

export type Situation =
  | { kind: 'open'; position: Position; stack: number }
  | { kind: 'call'; shover: Position; position: Position; stack: number };

export type Spot = Situation & { hand: HandClass };
export type Action = 'shove' | 'call' | 'fold';
export type Verdict = 'correct' | 'close' | 'wrong';
export type Grade = { verdict: Verdict; chosen: Action; best: Action; evAggressive: number };
export type ChartCell = 'aggressive' | 'fold' | 'close';

export const CLOSE_THRESHOLD = 0.1;

export const aggressiveAction = (s: Situation): Action => (s.kind === 'open' ? 'shove' : 'call');

export function evRow(data: PushFoldData, s: Situation): readonly number[] {
  if (!Number.isInteger(s.stack) || s.stack < MIN_STACK || s.stack > MAX_STACK) {
    throw new Error(`Ungültiger Stack: ${s.stack} BB`);
  }
  if (s.kind === 'open') {
    if (!OPEN_POSITIONS.includes(s.position)) throw new Error(`Kein Open-Shove aus ${s.position} möglich`);
    return data.openShove[s.position][s.stack - 1];
  }
  if (!OPEN_POSITIONS.includes(s.shover) || !callerPositions(s.shover).includes(s.position)) {
    throw new Error(`Ungültiger Call-Spot: ${s.position} gegen Shove aus ${s.shover}`);
  }
  return data.callVsShove[callKey(s.shover, s.position)][s.stack - 1];
}

export const evOf = (data: PushFoldData, spot: Spot): number => evRow(data, spot)[spot.hand];

export function grade(data: PushFoldData, spot: Spot, chosen: Action): Grade {
  const aggressive = aggressiveAction(spot);
  if (chosen !== aggressive && chosen !== 'fold') {
    throw new Error(`Aktion ${chosen} passt nicht zum Spot`);
  }
  const ev = evOf(data, spot);
  const best: Action = ev > 0 ? aggressive : 'fold';
  const verdict: Verdict = Math.abs(ev) < CLOSE_THRESHOLD ? 'close' : chosen === best ? 'correct' : 'wrong';
  return { verdict, chosen, best, evAggressive: ev };
}

export function chart(data: PushFoldData, s: Situation): ChartCell[] {
  return evRow(data, s).map((ev) =>
    Math.abs(ev) < CLOSE_THRESHOLD ? 'close' : ev > 0 ? 'aggressive' : 'fold',
  );
}
```

- [ ] **Step 5: Tests laufen lassen**

Run: `npm test -- src/engine/pushfold.test.ts` → Expected: alle PASS.

- [ ] **Step 6: Commit**

```bash
git add src/engine/pushfold.ts src/engine/pushfold.test.ts src/engine/test-fixtures.ts
git commit -m "feat(engine): EV-Lookup, Bewertung mit Grenzfällen und Range-Chart"
```

---

### Task 8: Spot-Generator

**Files:**
- Create: `src/engine/spot-generator.ts`
- Test: `src/engine/spot-generator.test.ts`

**Interfaces:**
- Consumes: `evRow`, `Situation`, `Spot` aus `pushfold.ts`; `PushFoldData`, `MIN_STACK`, `MAX_STACK`; `OPEN_POSITIONS`, `callerPositions`, `Position`; `COMBOS`, `HAND_COUNT`; `Rng`
- Produces:
  - `type SpotKind = 'open' | 'call'`
  - `type StackBucket = '1-5' | '6-10' | '11-15' | '16-20'`, `STACK_BUCKETS: readonly StackBucket[]`
  - `stackBucketOf(stack: number): StackBucket`
  - `type CategoryKey = string` im Format `"open|BTN|6-10"` bzw. `"call|BB|11-15"` (Spot-Typ, Position des Helden, Stack-Bereich)
  - `categoryKey(s: Situation): CategoryKey`
  - `type GeneratorOptions = { kinds?: readonly SpotKind[]; minStack?: number; maxStack?: number; categoryWeights?: ReadonlyMap<CategoryKey, number>; randomShare?: number }` — Standard: beide Typen, 1–20 BB, alle Gewichte 1, `randomShare` 0,15
  - `generateSpot(data: PushFoldData, rng: Rng, options?: GeneratorOptions): Spot`

**Algorithmus (verbindlich):**
1. Alle gültigen Situationen im Stack-Bereich aufzählen und nach `categoryKey` gruppieren.
2. Kategorie ziehen, gewichtet mit `categoryWeights.get(key) ?? 1`. Danach eine Situation gleichverteilt innerhalb der Kategorie ziehen.
3. Hand ziehen: mit Wahrscheinlichkeit `randomShare` gleichverteilt über alle 1326 Kombinationen (Gewicht = Kombinationsanzahl), sonst mit Gewicht `Kombinationsanzahl / (0,2 + |EV|)`. Hände nahe der Range-Grenze werden so deutlich häufiger gezogen.

- [ ] **Step 1: Failing Test schreiben**

`src/engine/spot-generator.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { COMBOS, parseHand } from './cards';
import { mulberry32 } from './rng';
import { categoryKey, generateSpot, stackBucketOf } from './spot-generator';
import { makeFixture } from './test-fixtures';

const data = makeFixture((h) => (84 - h) / 10);

describe('stackBucketOf', () => {
  it('maps stacks to buckets', () => {
    expect(stackBucketOf(1)).toBe('1-5');
    expect(stackBucketOf(5)).toBe('1-5');
    expect(stackBucketOf(6)).toBe('6-10');
    expect(stackBucketOf(15)).toBe('11-15');
    expect(stackBucketOf(20)).toBe('16-20');
    expect(() => stackBucketOf(0)).toThrow();
  });
});

describe('categoryKey', () => {
  it('uses kind, hero position and bucket', () => {
    expect(categoryKey({ kind: 'open', position: 'BTN', stack: 7 })).toBe('open|BTN|6-10');
    expect(categoryKey({ kind: 'call', shover: 'SB', position: 'BB', stack: 12 })).toBe('call|BB|11-15');
  });
});

describe('generateSpot', () => {
  it('is deterministic for the same seed', () => {
    const a = Array.from({ length: 20 }, ((rng) => () => generateSpot(data, rng))(mulberry32(5)));
    const b = Array.from({ length: 20 }, ((rng) => () => generateSpot(data, rng))(mulberry32(5)));
    expect(a).toEqual(b);
  });

  it('respects kinds and stack range', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 500; i++) {
      const s = generateSpot(data, rng, { kinds: ['call'], minStack: 4, maxStack: 6 });
      expect(s.kind).toBe('call');
      expect(s.stack).toBeGreaterThanOrEqual(4);
      expect(s.stack).toBeLessThanOrEqual(6);
    }
  });

  it('draws boundary hands far more often than clear hands', () => {
    const rng = mulberry32(11);
    let boundary = 0;
    let aces = 0;
    for (let i = 0; i < 5000; i++) {
      const s = generateSpot(data, rng);
      if (Math.abs(s.hand - 84) <= 2) boundary++;
      if (s.hand === parseHand('AA')) aces++;
    }
    const comboShareBoundary = [82, 83, 84, 85, 86].reduce((n, h) => n + COMBOS[h].length, 0) / 1326;
    expect(boundary / 5000).toBeGreaterThan(comboShareBoundary * 3);
    expect(aces).toBeGreaterThan(0);
    expect(aces).toBeLessThan(boundary);
  });

  it('keeps a share of uniformly random hands', () => {
    const rng = mulberry32(13);
    let clearFolds = 0;
    for (let i = 0; i < 5000; i++) if (generateSpot(data, rng).hand >= 150) clearFolds++;
    expect(clearFolds).toBeGreaterThan(50);
  });

  it('favours categories with a higher weight', () => {
    const rng = mulberry32(17);
    const weights = new Map([['open|UTG|1-5', 20]]);
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      if (categoryKey(generateSpot(data, rng, { categoryWeights: weights })) === 'open|UTG|1-5') hits++;
    }
    // 56 categories (28 open, 28 call); weight 20 gives about 20 / 75 = 27 %
    expect(hits / 2000).toBeGreaterThan(0.18);
  });
});
```

- [ ] **Step 2: Test laufen lassen, er muss fehlschlagen**

Run: `npm test -- src/engine/spot-generator.test.ts` → Expected: FAIL, Modul `./spot-generator` nicht gefunden.

- [ ] **Step 3: Implementierung schreiben**

`src/engine/spot-generator.ts`:
```ts
import { COMBOS, HAND_COUNT } from './cards';
import { OPEN_POSITIONS, callerPositions } from './positions';
import { type Situation, type Spot, evRow } from './pushfold';
import { MAX_STACK, MIN_STACK, type PushFoldData } from './pushfold-data';
import type { Rng } from './rng';

export type SpotKind = 'open' | 'call';
export type StackBucket = '1-5' | '6-10' | '11-15' | '16-20';
export const STACK_BUCKETS: readonly StackBucket[] = ['1-5', '6-10', '11-15', '16-20'];
export type CategoryKey = string;

export type GeneratorOptions = {
  kinds?: readonly SpotKind[];
  minStack?: number;
  maxStack?: number;
  categoryWeights?: ReadonlyMap<CategoryKey, number>;
  randomShare?: number;
};

const DEFAULT_RANDOM_SHARE = 0.15;
const BOUNDARY_SOFTENING = 0.2;

export function stackBucketOf(stack: number): StackBucket {
  if (stack < MIN_STACK || stack > MAX_STACK) throw new Error(`Ungültiger Stack: ${stack} BB`);
  if (stack <= 5) return '1-5';
  if (stack <= 10) return '6-10';
  if (stack <= 15) return '11-15';
  return '16-20';
}

export const categoryKey = (s: Situation): CategoryKey =>
  `${s.kind}|${s.position}|${stackBucketOf(s.stack)}`;

function situations(kinds: readonly SpotKind[], minStack: number, maxStack: number): Situation[] {
  const out: Situation[] = [];
  for (let stack = minStack; stack <= maxStack; stack++) {
    for (const shover of OPEN_POSITIONS) {
      if (kinds.includes('open')) out.push({ kind: 'open', position: shover, stack });
      if (kinds.includes('call')) {
        for (const caller of callerPositions(shover)) out.push({ kind: 'call', shover, position: caller, stack });
      }
    }
  }
  return out;
}

function pickWeighted<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T {
  let total = 0;
  for (const it of items) total += weight(it);
  let r = rng() * total;
  for (const it of items) {
    r -= weight(it);
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

export function generateSpot(data: PushFoldData, rng: Rng, options: GeneratorOptions = {}): Spot {
  const kinds = options.kinds ?? ['open', 'call'];
  const minStack = options.minStack ?? MIN_STACK;
  const maxStack = options.maxStack ?? MAX_STACK;
  const randomShare = options.randomShare ?? DEFAULT_RANDOM_SHARE;

  const groups = new Map<CategoryKey, Situation[]>();
  for (const s of situations(kinds, minStack, maxStack)) {
    const key = categoryKey(s);
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  if (groups.size === 0) throw new Error('Keine Spots für diese Einstellungen');

  const keys = [...groups.keys()];
  const key = pickWeighted(keys, (k) => options.categoryWeights?.get(k) ?? 1, rng);
  const candidates = groups.get(key)!;
  const situation = candidates[Math.floor(rng() * candidates.length)];

  const hands = Array.from({ length: HAND_COUNT }, (_, h) => h);
  const evs = evRow(data, situation);
  const uniform = rng() < randomShare;
  const hand = pickWeighted(
    hands,
    (h) => (uniform ? COMBOS[h].length : COMBOS[h].length / (BOUNDARY_SOFTENING + Math.abs(evs[h]))),
    rng,
  );
  return { ...situation, hand };
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npm test -- src/engine/spot-generator.test.ts` → Expected: alle PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine/spot-generator.ts src/engine/spot-generator.test.ts
git commit -m "feat(engine): gewichteter, adaptiver Spot-Generator"
```

---

### Task 9: Abschlussprüfung von Plan 1

**Files:**
- Create: `scripts/check-portability.mjs` (Kopie des mindCoder-Checkers)
- Modify: `package.json` (Skript `check:portability`)

- [ ] **Step 1: Portability-Checker ins Projekt kopieren**

Run (PowerShell und zsh identisch): `node -e "require('fs').copyFileSync(require('path').join(require('os').homedir(), '.claude/plugins/cache/mindsquare/mindCoder/0.19.0/skills/cross-platform-discipline/scripts/check-portability.mjs'), 'scripts/check-portability.mjs')"`

In `package.json` unter `scripts` ergänzen: `"check:portability": "node scripts/check-portability.mjs ."`

- [ ] **Step 2: Gesamte Prüfung laufen lassen**

Run: `npm test` → Expected: alle Test-Dateien PASS.
Run: `npm run typecheck` → Expected: Exit 0, keine Fehler.
Run: `npm run check:portability` → Expected: Exit 0. Funde werden behoben, nicht ignoriert.

- [ ] **Step 3: Plattform der Verifikation festhalten**

Im Abschlussbericht angeben: verifiziert unter Windows 11 (PowerShell), macOS nicht getestet. Auf macOS könnte höchstens die Worker-Option `execArgv` in `compute-equity.ts` abweichen. Die erzeugten Daten sind plattformunabhängig und werden committet.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/check-portability.mjs
git commit -m "chore: Portability-Check ins Projekt übernommen"
```

---

## Übergabe an Plan 2

Plan 2 (Spielsystem und Speicherung) nutzt aus diesem Plan: `generateSpot`, `grade`, `chart`, `categoryKey`, `stackBucketOf`, `STACK_BUCKETS`, `Spot`, `Situation`, `Grade`, `makeFixture`, `mulberry32`, `seedFromString`, `dealConcrete`, `POSITION_LABELS` und die Datei `src/data/pushfold.json`.
