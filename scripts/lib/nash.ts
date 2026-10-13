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
  maxHandRegret: number;
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

const handRegret = (ev: number, f: number): number => Math.max(ev, 0) - f * ev;

// Weighted gain of the best response over the current mixed strategy.
function regret(ev: Float64Array, freq: Float64Array, weight: Float64Array): number {
  let gain = 0;
  let total = 0;
  for (let h = 0; h < N; h++) {
    gain += weight[h] * handRegret(ev[h], freq[h]);
    total += weight[h];
  }
  return total > 0 ? gain / total : 0;
}

// Probability of holding each class given that the shover shoves (weights need not be normalised).
function callerWeights(input: NashInput, shoveFreq: Float64Array): Float64Array {
  const w = new Float64Array(N);
  for (let h = 0; h < N; h++) {
    let reach = 0;
    for (let x = 0; x < N; x++) reach += input.compat[h * N + x] * shoveFreq[x];
    w[h] = COMBO_WEIGHT[h] * reach;
  }
  return w;
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

  const callWeight = callerWeights(input, shoveFreq);
  let exploitability = regret(shoveEv, shoveFreq, COMBO_WEIGHT);
  let maxHandRegret = 0;
  for (let h = 0; h < N; h++) maxHandRegret = Math.max(maxHandRegret, handRegret(shoveEv[h], shoveFreq[h]));
  for (let k = 0; k < callers; k++) {
    exploitability = Math.max(exploitability, regret(callEv[k], callFreq[k], callWeight));
    for (let h = 0; h < N; h++) maxHandRegret = Math.max(maxHandRegret, handRegret(callEv[k][h], callFreq[k][h]));
  }

  return { shoveEv, callEv, shoveFreq, callFreq, exploitability, maxHandRegret };
}
