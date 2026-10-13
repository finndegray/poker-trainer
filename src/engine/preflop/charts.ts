import { HAND_COUNT, type HandClass, handName, parseHand } from '../cards';
import { CHARTS_40 } from './charts-40';
import { CHARTS_100 } from './charts-100';
import { parseRange } from './ranges';
import {
  type ChartKey,
  type PreflopAction,
  type PreflopKind,
  type PreflopSituation,
  type StackDepth,
  aggressiveActionOf,
  allowedActions,
  chartKeyFor,
} from './spots';

export type PreflopChartDef = {
  id: ChartKey;
  aggressive: string;
  call: string;
  close: Readonly<Record<string, PreflopAction>>;
  note: string;
};

export type PreflopChart = {
  key: ChartKey;
  kind: PreflopKind;
  stack: StackDepth;
  aggressive: readonly boolean[];
  call: readonly boolean[];
  close: ReadonlyMap<HandClass, PreflopAction>;
  note: string;
};

const KINDS: readonly string[] = ['rfi', 'vsOpen', 'vs3bet'];

function mainAction(kind: PreflopKind, aggressive: readonly boolean[], call: readonly boolean[], hand: HandClass): PreflopAction {
  if (aggressive[hand]) return aggressiveActionOf(kind);
  return call[hand] ? 'call' : 'fold';
}

export function buildChart(def: PreflopChartDef): PreflopChart {
  const [kindText, stackText] = def.id.split(':');
  if (!KINDS.includes(kindText)) throw new Error(`Unbekannter Chart-Typ: ${def.id}`);
  const kind = kindText as PreflopKind;
  const stack = Number(stackText);
  if (stack !== 40 && stack !== 100) throw new Error(`Unbekannte Stacktiefe: ${def.id}`);
  const aggressive = parseRange(def.aggressive);
  const call = parseRange(def.call);
  if (kind === 'rfi' && call.some(Boolean)) throw new Error(`Ein Open-Raise-Chart hat keine Calls: ${def.id}`);
  for (let h = 0; h < HAND_COUNT; h++) {
    if (aggressive[h] && call[h]) throw new Error(`Hand doppelt in ${def.id}: ${handName(h)}`);
  }
  const allowed = allowedActions(kind);
  const close = new Map<HandClass, PreflopAction>();
  for (const [name, alternative] of Object.entries(def.close)) {
    const hand = parseHand(name);
    if (!allowed.includes(alternative) || alternative === mainAction(kind, aggressive, call, hand)) {
      throw new Error(`Ungültige Grenzhand ${name} in ${def.id}`);
    }
    close.set(hand, alternative);
  }
  if (!def.note.trim()) throw new Error(`Lernsatz fehlt: ${def.id}`);
  return { key: def.id, kind, stack, aggressive, call, close, note: def.note };
}

let cache: Map<ChartKey, PreflopChart> | null = null;

export function allCharts(): ReadonlyMap<ChartKey, PreflopChart> {
  if (!cache) {
    const charts = new Map<ChartKey, PreflopChart>();
    for (const def of [...CHARTS_100, ...CHARTS_40]) {
      if (charts.has(def.id)) throw new Error(`Chart doppelt: ${def.id}`);
      charts.set(def.id, buildChart(def));
    }
    cache = charts;
  }
  return cache;
}

export function chartFor(s: PreflopSituation): PreflopChart {
  const key = chartKeyFor(s);
  const chart = allCharts().get(key);
  if (!chart) throw new Error(`Chart fehlt: ${key}`);
  return chart;
}

export const mainActionOf = (chart: PreflopChart, hand: HandClass): PreflopAction =>
  mainAction(chart.kind, chart.aggressive, chart.call, hand);

export const continueRange = (chart: PreflopChart): boolean[] => chart.aggressive.map((on, h) => on || chart.call[h]);
