import { type Card, RANKS } from '../../engine/cards';
import { SUIT_SYMBOLS, cardLabel } from './PlayingCard';
import './CardPicker.css';

/** Spades, hearts, diamonds, clubs; ranks from the ace down. */
const SUITS_SHOWN = [3, 2, 1, 0];
const RANKS_SHOWN = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

type Props = {
  label: string;
  /** Picked cards, in picking order. */
  selected: readonly Card[];
  /** Cards that are already in use elsewhere (hero cards, board, shown cards): not pickable. */
  used: ReadonlySet<Card>;
  max: number;
  onChange: (cards: Card[]) => void;
};

/**
 * Spec 3: 13 ranks × 4 suits. A tap picks or unpicks a card; with `max` cards picked, a new tap replaces the last one.
 */
export function CardPicker({ label, selected, used, max, onChange }: Props) {
  const toggle = (card: Card) => {
    if (selected.includes(card)) onChange(selected.filter((c) => c !== card));
    else if (selected.length < max) onChange([...selected, card]);
    else onChange([...selected.slice(0, max - 1), card]);
  };
  return (
    <div className="card-picker" role="group" aria-label={label}>
      {SUITS_SHOWN.map((suit) => (
        <div key={suit} className="card-picker__suit">
          {RANKS_SHOWN.map((rank) => {
            const card = rank * 4 + suit;
            const picked = selected.includes(card);
            const red = suit === 1 || suit === 2;
            return (
              <button
                key={card}
                type="button"
                className={`card-picker__card${red ? ' card-picker__card--red' : ''}${picked ? ' card-picker__card--picked' : ''}`}
                aria-label={cardLabel(card)}
                aria-pressed={picked}
                disabled={used.has(card) && !picked}
                onClick={() => toggle(card)}
              >
                {RANKS[rank] === 'T' ? '10' : RANKS[rank]}
                <span aria-hidden="true">{SUIT_SYMBOLS[suit]}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
