// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PersistenceInfo } from '../../app/persistence';
import { Notices } from './Notices';

const info: PersistenceInfo = { mode: 'indexeddb', readOnly: false, otherTabActive: false, corruptBackup: null };
const now = () => new Date(2026, 9, 13, 18, 0);

describe('Notices', () => {
  it('offers an available update and applies it on request', () => {
    const onApplyUpdate = vi.fn(() => Promise.resolve());
    render(
      <Notices
        info={info}
        saveError={null}
        now={now}
        notice="update-available"
        onDismissNotice={() => {}}
        onApplyUpdate={onApplyUpdate}
      />,
    );
    expect(screen.getByText('Eine neue Version ist verfügbar.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt aktualisieren' }));
    expect(onApplyUpdate).toHaveBeenCalledOnce();
  });

  it('logs a failing update instead of leaving an unhandled rejection', async () => {
    const error = new Error('kein Netz');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onApplyUpdate = vi.fn(() => Promise.reject(error));
    render(
      <Notices
        info={info}
        saveError={null}
        now={now}
        notice="update-available"
        onDismissNotice={() => {}}
        onApplyUpdate={onApplyUpdate}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Jetzt aktualisieren' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleError).toHaveBeenCalledWith(error);
    consoleError.mockRestore();
  });

  it('tells that this tab saves now and can be dismissed', () => {
    const onDismissNotice = vi.fn();
    render(<Notices info={info} saveError={null} now={now} notice="writer-acquired" onDismissNotice={onDismissNotice} />);
    expect(
      screen.getByText('Der andere Tab wurde geschlossen. Ab jetzt speichert dieser Tab deinen Fortschritt.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Jetzt aktualisieren' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onDismissNotice).toHaveBeenCalledOnce();
  });

  it('shows no notice by default', () => {
    render(<Notices info={info} saveError={null} now={now} notice={null} onDismissNotice={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
