// @vitest-environment jsdom
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { downloadText } from './download';

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe('downloadText', () => {
  afterAll(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clicks an attached link and revokes the URL only later', () => {
    vi.useFakeTimers();
    // jsdom has no object URLs; provide placeholders to spy on.
    URL.createObjectURL ??= () => '';
    URL.revokeObjectURL ??= () => {};
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sicherung');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clicked: { connected: boolean; href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ connected: this.isConnected, href: this.href, download: this.download });
    });

    downloadText('sicherung.json', '{kaputt');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(clicked).toEqual([{ connected: true, href: 'blob:sicherung', download: 'sicherung.json' }]);
    expect(document.querySelector('a')).toBeNull();
    vi.advanceTimersByTime(999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:sicherung');
  });
});
