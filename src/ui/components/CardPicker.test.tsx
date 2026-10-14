// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { type Card, parseCard } from '../../engine/cards';
import { CardPicker } from './CardPicker';

function Picker({ max, used = [] }: { max: number; used?: Card[] }) {
  const [cards, setCards] = useState<Card[]>([]);
  return (
    <>
      <CardPicker label="Deine Karten" selected={cards} used={new Set(used)} max={max} onChange={setCards} />
      <output>{cards.join(',')}</output>
    </>
  );
}

describe('CardPicker', () => {
  it('shows all 52 cards and locks the cards in use', () => {
    render(<Picker max={2} used={[parseCard('Ah')]} />);
    const group = screen.getByRole('group', { name: 'Deine Karten' });
    expect(group.querySelectorAll('button')).toHaveLength(52);
    expect((screen.getByRole('button', { name: 'Herz Ass' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Pik Ass' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('picks, unpicks and replaces the last card when full', () => {
    render(<Picker max={2} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pik Ass' }));
    fireEvent.click(screen.getByRole('button', { name: 'Karo König' }));
    expect(screen.getByRole('status').textContent).toBe(`${parseCard('As')},${parseCard('Kd')}`);
    expect(screen.getByRole('button', { name: 'Pik Ass' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Kreuz 2' }));
    expect(screen.getByRole('status').textContent).toBe(`${parseCard('As')},${parseCard('2c')}`);
    fireEvent.click(screen.getByRole('button', { name: 'Pik Ass' }));
    expect(screen.getByRole('status').textContent).toBe(`${parseCard('2c')}`);
  });
});
