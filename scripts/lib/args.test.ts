import { describe, expect, it } from 'vitest';
import { assertKnownArgs, numberArg } from './args';

describe('numberArg', () => {
  it('returns the fallback when absent', () => {
    expect(numberArg({}, 'samples', 5, {})).toBe(5);
  });
  it('parses numbers', () => {
    expect(numberArg({ samples: '2000' }, 'samples', 5, { integer: true, min: 1000 })).toBe(2000);
  });
  it('rejects non-finite values', () => {
    expect(() => numberArg({ samples: 'abc' }, 'samples', 5, {})).toThrow(/samples/);
    expect(() => numberArg({ samples: 'Infinity' }, 'samples', 5, {})).toThrow();
    expect(() => numberArg({ samples: 'true' }, 'samples', 5, {})).toThrow();
  });
  it('rejects non-integers when integer is required', () => {
    expect(() => numberArg({ seed: '1.5' }, 'seed', 1, { integer: true })).toThrow(/ganze Zahl/);
  });
  it('rejects values below min', () => {
    expect(() => numberArg({ samples: '10' }, 'samples', 5000, { min: 1000 })).toThrow(/mindestens/);
  });
});

describe('assertKnownArgs', () => {
  it('accepts known flags', () => {
    expect(() => assertKnownArgs({ samples: '1' }, ['samples', 'seed'])).not.toThrow();
  });
  it('rejects unknown flags', () => {
    expect(() => assertKnownArgs({ sample: '1' }, ['samples'])).toThrow(/--sample/);
  });
});
