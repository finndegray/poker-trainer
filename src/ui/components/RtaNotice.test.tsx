// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RTA_NOTICE_KEY, RTA_NOTICE_TEXT, RtaNotice } from './RtaNotice';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('RtaNotice', () => {
  it('shows the GGPoker hint until it is dismissed, then never again', () => {
    const storage = memoryStorage();
    const first = render(<RtaNotice storage={storage} />);
    expect(screen.getByRole('note').textContent).toContain(RTA_NOTICE_TEXT);
    fireEvent.click(screen.getByRole('button', { name: 'Verstanden' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(storage.data.get(RTA_NOTICE_KEY)).toBe('1');
    first.unmount();
    render(<RtaNotice storage={storage} />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('still works when the browser blocks the storage', () => {
    const blocked = {
      getItem: (): string | null => {
        throw new Error('blockiert');
      },
      setItem: () => {
        throw new Error('blockiert');
      },
    };
    const first = render(<RtaNotice storage={blocked} />);
    fireEvent.click(screen.getByRole('button', { name: 'Verstanden' }));
    expect(screen.queryByRole('note')).toBeNull();
    first.unmount();
    render(<RtaNotice storage={null} />);
    expect(screen.getByRole('note')).toBeTruthy();
  });
});
