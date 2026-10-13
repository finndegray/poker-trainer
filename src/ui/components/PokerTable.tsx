import type { CSSProperties } from 'react';
import type { Card } from '../../engine/cards';
import { POSITION_LABELS } from '../../engine/positions';
import type { Spot } from '../../engine/pushfold';
import { tableModel } from '../table-model';
import { PlayingCard } from './PlayingCard';
import './PokerTable.css';

const bb = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

function seatStyle(offset: number): CSSProperties {
  const angle = ((90 + offset * 45) * Math.PI) / 180;
  return { left: `${50 + 44 * Math.cos(angle)}%`, top: `${50 + 41 * Math.sin(angle)}%` };
}

function behindText(n: number): string {
  if (n === 0) return 'du handelst als Letzter';
  if (n === 1) return 'noch 1 Spieler hinter dir';
  return `noch ${n} Spieler hinter dir`;
}

export function PokerTable({ spot, cards }: { spot: Spot; cards: readonly [Card, Card] }) {
  const model = tableModel(spot);
  const situation = spot.kind === 'open' ? 'Alle folden zu dir' : `${POSITION_LABELS[spot.shover]} geht All-in`;
  return (
    <section className="poker-table" aria-label="Pokertisch">
      <div className="poker-table__stage">
        <div className="poker-table__felt">
          <div className="poker-table__pot">Pot {bb.format(model.potBb)} BB</div>
          <div className="poker-table__situation">{situation}</div>
          <div className="poker-table__cards">
            {cards.map((card, i) => (
              <PlayingCard key={`${card}-${i}`} card={card} delayMs={i * 120} />
            ))}
          </div>
        </div>
        {model.seats.map((seat) => (
          <div
            key={seat.position}
            className={`seat seat--${seat.role}`}
            style={seatStyle(seat.offset)}
            data-testid={`seat-${seat.position}`}
          >
            <span className="seat__label">{seat.label}</span>
            {seat.role === 'shover' && <span className="seat__allin">All-in {bb.format(seat.betBb)} BB</span>}
            {seat.role !== 'shover' && seat.betBb > 0 && <span className="seat__bet">{bb.format(seat.betBb)} BB</span>}
            {seat.anteBb > 0 && <span className="seat__ante">Ante {bb.format(seat.anteBb)}</span>}
            {seat.isButton && (
              <span className="seat__button" aria-label="Dealer-Button">
                D
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="poker-table__info">
        Du sitzt im {POSITION_LABELS[spot.position]} · {spot.stack} BB · {behindText(model.playersBehind)}
      </p>
    </section>
  );
}
