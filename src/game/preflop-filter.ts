import { PREFLOP_KINDS, type PreflopKind, STACK_DEPTHS, type StackDepth } from '../engine/preflop/spots';

/** The starthand filter remembered in the profile; 'all' means no restriction. */
export type PreflopFilter = { kind: PreflopKind | 'all'; stack: StackDepth | 'all' };
export type PreflopSpotOptions = { kinds?: readonly PreflopKind[]; stacks?: readonly StackDepth[] };

export const DEFAULT_PREFLOP_FILTER: PreflopFilter = { kind: 'all', stack: 'all' };

export function isPreflopFilter(v: unknown): v is PreflopFilter {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const f = v as Record<string, unknown>;
  const kindOk = f.kind === 'all' || (PREFLOP_KINDS as readonly unknown[]).includes(f.kind);
  const stackOk = f.stack === 'all' || (STACK_DEPTHS as readonly unknown[]).includes(f.stack);
  return kindOk && stackOk;
}

export const preflopFilterOf = (profile: { preflopFilter?: PreflopFilter }): PreflopFilter =>
  profile.preflopFilter ?? DEFAULT_PREFLOP_FILTER;

export const samePreflopFilter = (a: PreflopFilter, b: PreflopFilter): boolean => a.kind === b.kind && a.stack === b.stack;

export function preflopSpotOptions(filter: PreflopFilter): PreflopSpotOptions {
  return {
    ...(filter.kind === 'all' ? {} : { kinds: [filter.kind] }),
    ...(filter.stack === 'all' ? {} : { stacks: [filter.stack] }),
  };
}
