import { describe, expect, it } from 'vitest';
import { HAND_COUNT, compatMatrix, parseHand } from '../../src/engine/cards';
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

describe('EV formulas (chain and card removal)', () => {
  it('chains two callers for a BTN shove', () => {
    const out = new Float64Array(N);
    const half = () => new Float64Array(N).fill(0.5);
    shoverEvs(input({ equity: flatEquity, shoverSeat: seatOf('BTN') }), [half(), half()], out);
    // 0.5*(11-10) + 0.25*(10.75-10) + 0.25*2.5 = 0.5 + 0.1875 + 0.625 = 1.3125
    const expected = 0.5 * (0.5 * 22 - 10) + 0.25 * (0.5 * 21.5 - 10) + 0.25 * 2.5;
    expect(expected).toBeCloseTo(1.3125, 10);
    for (let h = 0; h < N; h++) expect(out[h]).toBeCloseTo(expected, 10);
  });

  it('applies card removal in the right direction', () => {
    const q = new Float64Array(N);
    q[parseHand('AA')] = 1;
    const out = new Float64Array(N);
    shoverEvs(input({ equity: flatEquity }), [q], out);
    // being called is worse (1.0) than folding out (2.5); AA blocks the caller's AA
    expect(out[parseHand('AA')]).toBeGreaterThan(out[parseHand('72o')]);
  });
});

describe('solveSpot', () => {
  it('keeps every single hand within 0.1 BB of its best response', () => {
    const r = solveSpot(input({ shoverSeat: seatOf('CO') }));
    expect(r.maxHandRegret).toBeLessThan(0.1);
  });

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
