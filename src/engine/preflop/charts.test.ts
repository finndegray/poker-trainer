import { describe, expect, it } from 'vitest';
import { handName, parseHand } from '../cards';
import type { Position } from '../positions';
import { allCharts, buildChart, chartFor, continueRange, mainActionOf, type PreflopChart } from './charts';
import { rangeWidth } from './ranges';
import { STACK_DEPTHS, expectedChartKeys } from './spots';

describe('chartFor', () => {
  it('throws for an invalid situation', () => {
    expect(() => chartFor({ kind: 'rfi', stack: 100, hero: 'BB', villain: null })).toThrow(/Ungültiger Starthand-Spot/);
  });
});

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

  it('keeps per-hand nesting across openers', () => {
    const groups: Record<string, Position[]> = {
      ip: ['UTG', 'UTG1', 'LJ', 'HJ', 'CO'],
      sb: ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN'],
      bb: ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN', 'SB'],
    };
    for (const [group, openers] of Object.entries(groups)) {
      for (let i = 0; i < openers.length; i++) {
        const earlier = continueRange(get(`vsOpen:${stack}:${openers[i]}:${group}`));
        for (let j = i + 1; j < openers.length; j++) {
          const later = continueRange(get(`vsOpen:${stack}:${openers[j]}:${group}`));
          earlier.forEach((on, hand) => {
            const msg = `${group}: ${handName(hand)} continues vs ${openers[i]} but not vs ${openers[j]}`;
            if (on) expect(later[hand], msg).toBe(true);
          });
        }
      }
    }
  });

  // SB is left out: against the BB it plays out of position and deliberately defends tighter than the in-position seats.
  it('keeps per-hand nesting across 3-bet defenders where the later seat opens the hand', () => {
    const heroes: Record<string, Position[]> = {
      ip: ['UTG', 'UTG1', 'LJ', 'HJ', 'CO'],
      blinds: ['UTG', 'UTG1', 'LJ', 'HJ', 'CO', 'BTN'],
    };
    const gaps: string[] = [];
    for (const [group, order] of Object.entries(heroes)) {
      for (let i = 0; i < order.length; i++) {
        const earlier = continueRange(get(`vs3bet:${stack}:${order[i]}:${group}`));
        for (let j = i + 1; j < order.length; j++) {
          const later = continueRange(get(`vs3bet:${stack}:${order[j]}:${group}`));
          const opens = get(`rfi:${stack}:${order[j]}`).aggressive;
          earlier.forEach((on, hand) => {
            if (!on || !opens[hand] || later[hand]) return;
            gaps.push(`${handName(hand)} ${order[i]}>${order[j]}`);
          });
        }
      }
    }
    expect(gaps).toEqual([]);
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
