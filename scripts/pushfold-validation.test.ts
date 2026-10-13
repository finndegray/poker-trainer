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

  it('keeps every single hand below the close-decision threshold', () => {
    expect(data.config.maxHandRegret).toBeLessThan(0.1);
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
