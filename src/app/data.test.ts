import { describe, expect, it } from 'vitest';
import { getPushFoldData } from './data';

describe('getPushFoldData', () => {
  it('loads the bundled data once', () => {
    const a = getPushFoldData();
    expect(a.version).toBe(1);
    expect(a.openShove.BTN).toHaveLength(20);
    expect(getPushFoldData()).toBe(a);
  });
});
