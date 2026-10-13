// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseHand } from '../../engine/cards';
import type { PreflopSpot } from '../../engine/preflop/spots';
import { ActionBar, PreflopActionBar } from './ActionBar';

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

  it('names the buttons without the key hint and announces the shortcuts', () => {
    const { rerender } = render(<ActionBar kind="open" answered={false} onAction={() => {}} onNext={() => {}} />);
    expect(screen.getByRole('button', { name: 'Fold' }).getAttribute('aria-keyshortcuts')).toBe('F');
    expect(screen.getByRole('button', { name: 'All-in' }).getAttribute('aria-keyshortcuts')).toBe('A');
    rerender(<ActionBar kind="open" answered onAction={() => {}} onNext={() => {}} />);
    expect(screen.getByRole('button', { name: 'Weiter' }).getAttribute('aria-keyshortcuts')).toBe('Space Enter');
  });

  describe('after answering', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('focuses "Weiter" and ignores taps on it for 300 ms', () => {
      vi.useFakeTimers();
      const onNext = vi.fn();
      const { rerender } = render(<ActionBar kind="open" answered={false} onAction={() => {}} onNext={onNext} />);
      rerender(<ActionBar kind="open" answered onAction={() => {}} onNext={onNext} />);
      const next = screen.getByRole('button', { name: 'Weiter' });
      expect(document.activeElement).toBe(next);
      fireEvent.click(next, { detail: 1 });
      act(() => {
        vi.advanceTimersByTime(299);
      });
      fireEvent.click(next, { detail: 2 });
      expect(onNext).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      fireEvent.click(next, { detail: 1 });
      expect(onNext).toHaveBeenCalledOnce();
    });

    it('lets keyboard activation through right away', () => {
      vi.useFakeTimers();
      const onNext = vi.fn();
      render(<ActionBar kind="open" answered onAction={() => {}} onNext={onNext} />);
      // Space or Enter on a focused button fire a click with detail 0.
      fireEvent.click(screen.getByRole('button', { name: 'Weiter' }), { detail: 0 });
      fireEvent.keyDown(window, { key: ' ' });
      expect(onNext).toHaveBeenCalledTimes(2);
    });
  });
});

describe('PreflopActionBar', () => {
  const hand = parseHand('AQo');
  const vsOpen: PreflopSpot = { kind: 'vsOpen', stack: 100, hero: 'BTN', villain: 'CO', hand };

  it('offers fold, call and the 3-bet with its size, by click and keyboard', () => {
    const onAction = vi.fn();
    render(<PreflopActionBar spot={vsOpen} answered={false} onAction={onAction} onNext={() => {}} />);
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-keyshortcuts'))).toEqual(['F', 'C', 'R A']);
    expect(screen.getByRole('button', { name: 'Fold' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Call' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '3-Bet auf 6,6 BB' }));
    fireEvent.keyDown(window, { key: 'c' });
    fireEvent.keyDown(window, { key: 'R' });
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 'f' });
    expect(onAction.mock.calls).toEqual([['threeBet'], ['call'], ['threeBet'], ['threeBet'], ['fold']]);
  });

  it('offers only raise or fold when everybody folded', () => {
    const onAction = vi.fn();
    render(<PreflopActionBar spot={{ kind: 'rfi', stack: 100, hero: 'UTG', villain: null, hand }} answered={false} onAction={onAction} onNext={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Raise auf 2,2 BB' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Call' })).toBeNull();
    fireEvent.keyDown(window, { key: 'c' });
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'r' });
    expect(onAction).toHaveBeenCalledWith('raise');
  });

  it('labels the 4-bet with its size at 100 BB and as all-in at 40 BB', () => {
    const { unmount } = render(
      <PreflopActionBar spot={{ kind: 'vs3bet', stack: 100, hero: 'CO', villain: 'BTN', hand }} answered={false} onAction={() => {}} onNext={() => {}} />,
    );
    expect(screen.getByRole('button', { name: '4-Bet auf 14,5 BB' })).toBeTruthy();
    unmount();
    render(<PreflopActionBar spot={{ kind: 'vs3bet', stack: 40, hero: 'CO', villain: 'BB', hand }} answered={false} onAction={() => {}} onNext={() => {}} />);
    expect(screen.getByRole('button', { name: 'All-in 40 BB' })).toBeTruthy();
  });

  it('shows "Weiter" after the answer', () => {
    const onNext = vi.fn();
    const onAction = vi.fn();
    render(<PreflopActionBar spot={vsOpen} answered onAction={onAction} onNext={onNext} />);
    fireEvent.keyDown(window, { key: ' ' });
    fireEvent.keyDown(window, { key: 'c' });
    expect(onNext).toHaveBeenCalledOnce();
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeTruthy();
  });
});
