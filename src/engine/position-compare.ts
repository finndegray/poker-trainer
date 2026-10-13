import { handName } from './cards';
import { OPEN_POSITIONS, POSITION_LABELS, type Position, callerPositions } from './positions';
import { type ChartCell, type Situation, type Spot, aggressiveAction, cellForEv, evRow } from './pushfold';
import type { PushFoldData } from './pushfold-data';

export type PositionEntry = { position: Position; cell: ChartCell; ev: number; isHero: boolean };
export type PositionComparison = { entries: PositionEntry[]; summary: string };

type Group = 'aggressive' | 'fold' | 'close';
type Segment = { group: Group; from: Position; to: Position };

const groupOf = (cell: ChartCell): Group =>
  cell === 'aggressive' ? 'aggressive' : cell === 'fold' ? 'fold' : 'close';

function situationAt(spot: Spot, position: Position): Situation {
  return spot.kind === 'open'
    ? { kind: 'open', position, stack: spot.stack }
    : { kind: 'call', shover: spot.shover, position, stack: spot.stack };
}

function summarize(spot: Spot, entries: readonly PositionEntry[]): string {
  const word: Record<Group, string> = {
    aggressive: aggressiveAction(spot) === 'shove' ? 'Push' : 'Call',
    fold: 'Fold',
    close: 'knapp',
  };
  const segments: Segment[] = [];
  for (const e of entries) {
    const group = groupOf(e.cell);
    const last = segments[segments.length - 1];
    if (last && last.group === group) last.to = e.position;
    else segments.push({ group, from: e.position, to: e.position });
  }
  const label = (p: Position) => POSITION_LABELS[p];
  const parts =
    segments.length === 1
      ? [`${word[segments[0].group]} aus jeder Position`]
      : segments.map((seg, i) => {
          if (seg.from === seg.to) return `${word[seg.group]} aus ${label(seg.from)}`;
          if (i === segments.length - 1) return `${word[seg.group]} ab ${label(seg.from)}`;
          return `${word[seg.group]} aus ${label(seg.from)} bis ${label(seg.to)}`;
        });
  const prefix =
    spot.kind === 'open'
      ? `${handName(spot.hand)} bei ${spot.stack} BB`
      : `${handName(spot.hand)} bei ${spot.stack} BB gegen Shove aus ${label(spot.shover)}`;
  return `${prefix}: ${parts.join(', ')}`;
}

export function comparePositions(data: PushFoldData, spot: Spot): PositionComparison {
  const positions: readonly Position[] = spot.kind === 'open' ? OPEN_POSITIONS : callerPositions(spot.shover);
  const entries = positions.map((position): PositionEntry => {
    const ev = evRow(data, situationAt(spot, position))[spot.hand];
    return { position, cell: cellForEv(ev), ev, isHero: position === spot.position };
  });
  return { entries, summary: summarize(spot, entries) };
}
