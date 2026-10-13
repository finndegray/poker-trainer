// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar } from './ActionBar';

describe('ActionBar', () => {
  it('offers fold and all-in for open spots, by click and keyboard', () => {
    const onAction = vi.fn();
    render(<ActionBar kind="open" answered={false} onAction={onAction} onNext={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Fold/ }));
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'F' });
    expect(onAction.mock.calls).toEqual([['fold'], ['shove'], ['fold']]);
    expect(screen.getByRole('button', { name: /All-in/ })).toBeTruthy();
  });

  it('offers call for call spots', () => {
    const onAction = vi.fn();
    render(<ActionBar kind="call" answered={false} onAction={onAction} onNext={() => {}} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(onAction).toHaveBeenCalledWith('call');
    expect(screen.getByRole('button', { name: /Call/ })).toBeTruthy();
  });

  it('shows "Weiter" after the answer and reacts to space and enter', () => {
    const onNext = vi.fn();
    const onAction = vi.fn();
    render(<ActionBar kind="open" answered onAction={onAction} onNext={onNext} />);
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'Enter' });
    fireEvent.keyDown(window, { key: 'f' });
    expect(onNext).toHaveBeenCalledTimes(2);
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Weiter/ }));
    expect(onNext).toHaveBeenCalledTimes(3);
  });

  it('ignores keys while typing, with modifiers, on repeats and on focused buttons', () => {
    const onAction = vi.fn();
    const onNext = vi.fn();
    const { rerender } = render(
      <>
        <input aria-label="Notiz" />
        <ActionBar kind="open" answered={false} onAction={onAction} onNext={onNext} />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('Notiz'), { key: 'f' });
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'a', repeat: true });
    expect(onAction).not.toHaveBeenCalled();
    rerender(<ActionBar kind="open" answered onAction={onAction} onNext={onNext} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /Weiter/ }), { key: 'Enter' });
    expect(onNext).not.toHaveBeenCalled();
  });
});
