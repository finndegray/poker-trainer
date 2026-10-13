import type { CSSProperties } from 'react';
import { formatBb, preflopSituationText } from '../../app/format';
import { type Card, rankOf } from '../../engine/cards';
import { POSITION_LABELS } from '../../engine/positions';
import type { PreflopSpot } from '../../engine/preflop/spots';
import type { Spot } from '../../engine/pushfold';
import { type TableModel, preflopTableModel, tableModel } from '../table-model';
import { PlayingCard } from './PlayingCard';
import './PokerTable.css';

function seatStyle(offset: number): CSSProperties {
  const angle = ((90 + offset * 45) * Math.PI) / 180;
  return { left: `${50 + 40 * Math.cos(angle)}%`, top: `${50 + 41 * Math.sin(angle)}%` };
}

function behindText(n: number): string {
  if (n === 0) return 'du handelst als Letzter';
  if (n === 1) return 'noch 1 Spieler hinter dir';
  return `noch ${n} Spieler hinter dir`;
}

export type TableViewProps = {
  model: TableModel;
  /** The hero's cards; empty when unknown. */
  cards: readonly Card[];
  situation: string;
  info: string;
  /** Community cards, shown in the middle (hand review). */
  board?: readonly Card[];
};

export function TableView({ model, cards, situation, info, board = [] }: TableViewProps) {
  // High card first, the way players read their hand.
  const shown = [...cards].sort((a, b) => rankOf(b) - rankOf(a));
  return (
    <section className="poker-table" aria-label="Pokertisch">
      <div className="poker-table__stage">
        <div className="poker-table__felt">
          <div className="poker-table__pot">Pot {formatBb(model.potBb)} BB</div>
          {board.length > 0 && (
            <div className="poker-table__board" aria-label="Board">
              {board.map((card) => (
                <PlayingCard key={card} card={card} />
              ))}
            </div>
          )}
          <div className="poker-table__situation">{situation}</div>
          <div className="poker-table__cards">
            {shown.map((card, i) => (
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
            {seat.betLabel !== null ? (
              <span className="seat__allin">
                {seat.betLabel} {formatBb(seat.betBb)} BB
              </span>
            ) : (
              seat.betBb > 0 && <span className="seat__bet">{formatBb(seat.betBb)} BB</span>
            )}
            {seat.stackBb !== null && <span className="seat__stack">Stack {formatBb(seat.stackBb)}</span>}
            {seat.anteBb > 0 && <span className="seat__ante">Ante {formatBb(seat.anteBb)}</span>}
            {seat.isButton && (
              <span className="seat__button" aria-label="Dealer-Button">
                D
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="poker-table__info">{info}</p>
    </section>
  );
}

export function PokerTable({ spot, cards }: { spot: Spot; cards: readonly [Card, Card] }) {
  const model = tableModel(spot);
  const situation = spot.kind === 'open' ? 'Alle folden zu dir' : `${POSITION_LABELS[spot.shover]} geht All-in`;
  const info = `Du sitzt im ${POSITION_LABELS[spot.position]} · ${spot.stack} BB · ${behindText(model.playersBehind)}`;
  return <TableView model={model} cards={cards} situation={situation} info={info} />;
}

export function PreflopTable({ spot, cards }: { spot: PreflopSpot; cards: readonly [Card, Card] }) {
  const model = preflopTableModel(spot);
  const info = [`Du sitzt im ${POSITION_LABELS[spot.hero]}`, `${spot.stack} BB effektiv`];
  // Facing a 3-bet nobody else is left; "du handelst als Letzter" would be wrong, the 3-bettor may still act.
  if (spot.kind !== 'vs3bet') info.push(behindText(model.playersBehind));
  return <TableView model={model} cards={cards} situation={preflopSituationText(spot)} info={info.join(' · ')} />;
}
