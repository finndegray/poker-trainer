// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Celebration } from './Celebration';

describe('Celebration', () => {
  it('announces the new rank and closes by button or Escape', () => {
    const onClose = vi.fn();
    render(<Celebration rank="Grinder" onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Aufgestiegen!' })).toBeTruthy();
    expect(screen.getByText('Du bist jetzt Grinder.')).toBeTruthy();
    const button = screen.getByRole('button', { name: 'Weiter so!' });
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
