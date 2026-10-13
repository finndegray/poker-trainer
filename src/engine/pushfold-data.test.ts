import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePushFoldData } from './pushfold-data';
import { makeFixture } from './test-fixtures';

const clone = () => JSON.parse(JSON.stringify(makeFixture(() => 0.5)));

describe('parsePushFoldData', () => {
  it('parses the bundled pushfold.json', () => {
    const raw = JSON.parse(readFileSync(new URL('../data/pushfold.json', import.meta.url), 'utf8'));
    expect(parsePushFoldData(raw).version).toBe(1);
  });

  it('accepts a valid fixture', () => {
    expect(() => parsePushFoldData(clone())).not.toThrow();
  });

  it('rejects a non-object', () => {
    expect(() => parsePushFoldData(null)).toThrow(/Push-Fold-Daten/);
  });

  it('rejects a wrong version', () => {
    const raw = clone();
    raw.version = 2;
    expect(() => parsePushFoldData(raw)).toThrow(/Version/);
  });

  it('rejects a non-numeric config field', () => {
    const raw = clone();
    raw.config.iterations = 'x';
    expect(() => parsePushFoldData(raw)).toThrow(/iterations/);
  });

  it('rejects a missing call key', () => {
    const raw = clone();
    delete raw.callVsShove['BTN>BB'];
    expect(() => parsePushFoldData(raw)).toThrow(/BTN>BB/);
  });

  it('rejects a short row', () => {
    const raw = clone();
    raw.openShove.UTG[3].pop();
    expect(() => parsePushFoldData(raw)).toThrow(/UTG/);
  });

  it('rejects a missing stack row', () => {
    const raw = clone();
    raw.callVsShove['UTG>BB'].pop();
    expect(() => parsePushFoldData(raw)).toThrow(/UTG>BB/);
  });

  it('rejects NaN (null in JSON)', () => {
    const raw = clone();
    raw.openShove.CO[5][7] = null;
    expect(() => parsePushFoldData(raw)).toThrow(/CO/);
    const raw2 = clone();
    raw2.callVsShove['SB>BB'][0][0] = Number.NaN;
    expect(() => parsePushFoldData(raw2)).toThrow(/SB>BB/);
  });

  it('rejects an unexpected openShove key', () => {
    const raw = clone();
    raw.openShove.BB = raw.openShove.UTG;
    expect(() => parsePushFoldData(raw)).toThrow(/BB/);
  });
});
