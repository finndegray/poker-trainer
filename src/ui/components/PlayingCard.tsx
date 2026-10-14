import { type Card, RANKS, rankOf, suitOf } from '../../engine/cards';
import './PlayingCard.css';

export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
const SUIT_NAMES = ['Kreuz', 'Karo', 'Herz', 'Pik'];
const RANK_NAMES: Record<string, string> = { A: 'Ass', K: 'König', Q: 'Dame', J: 'Bube', T: 'Zehn' };

export function cardLabel(card: Card): string {
  const rank = RANKS[rankOf(card)];
  return `${SUIT_NAMES[suitOf(card)]} ${RANK_NAMES[rank] ?? rank}`;
}

export function PlayingCard({ card, delayMs = 0 }: { card: Card; delayMs?: number }) {
  const rank = RANKS[rankOf(card)];
  const suit = suitOf(card);
  const red = suit === 1 || suit === 2;
  return (
    <div
      className={`playing-card${red ? ' playing-card--red' : ''}`}
      role="img"
      aria-label={cardLabel(card)}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <span className="playing-card__rank">{rank === 'T' ? '10' : rank}</span>
      <span className="playing-card__suit">{SUIT_SYMBOLS[suit]}</span>
    </div>
  );
}
