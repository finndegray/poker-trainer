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
