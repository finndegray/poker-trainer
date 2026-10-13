import { describe, expect, it } from 'vitest';
import { actionLabel, aggressiveWord, evLine, formatEv, formatPercent, verdictLabel } from './format';

describe('format', () => {
  it('formats EVs the German way with a sign', () => {
    expect(formatEv(0.42)).toBe('+0,42 BB');
    expect(formatEv(-1.3)).toBe('−1,30 BB');
    expect(formatEv(12.345)).toBe('+12,35 BB');
    expect(formatEv(0)).toBe('0 BB');
    expect(formatEv(0.004)).toBe('0 BB');
    expect(formatEv(-0.004)).toBe('0 BB');
  });

  it('formats percentages', () => {
    expect(formatPercent(0.625)).toBe('63 %');
    expect(formatPercent(1)).toBe('100 %');
    expect(formatPercent(null)).toBe('–');
  });

  it('labels actions, verdicts and EV lines', () => {
    expect(actionLabel('shove')).toBe('All-in');
    expect(actionLabel('call')).toBe('Call');
    expect(actionLabel('fold')).toBe('Fold');
    expect(aggressiveWord('open')).toBe('Push');
    expect(aggressiveWord('call')).toBe('Call');
    expect(evLine('open', 0.42)).toBe('All-in +0,42 BB · Fold 0 BB');
    expect(evLine('call', -0.8)).toBe('Call −0,80 BB · Fold 0 BB');
    expect(verdictLabel('correct')).toBe('Richtig');
    expect(verdictLabel('close')).toBe('Knapp – beides okay');
    expect(verdictLabel('wrong')).toBe('Falsch');
  });
});
