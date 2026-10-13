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

  it('reads descending spans, unsuffixed spans and already-complete plus entries', () => {
    expect(names('K7s-K9s')).toEqual(['K7s', 'K8s', 'K9s']);
    expect(names('AK-AQ')).toEqual(['AKo', 'AKs', 'AQo', 'AQs']);
    expect(names('AKs+')).toEqual(['AKs']);
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
    for (const bad of ['AX', 'KAs', 'AAs', 'A9x', 'K9s-Q7s', 'K9s-K7o', 'T', '99-8', 'AK+s', 'K9s-KAs']) {
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
