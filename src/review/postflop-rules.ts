import type { BoardStreet } from './parse';

/*
 * Every number of the postflop rules of thumb (spec 7) lives in this file.
 * Equity values and margins are percentage points (0–100); shares of a range or of the pot are 0–1.
 */

/** Range narrowing per villain action: the share of his range weight that stays (spec 7, step 2). */
export const KEEP_AFTER_BET = 0.6;
export const KEEP_AFTER_RAISE = 0.3;
export const KEEP_AFTER_ALL_IN = 0.25;
/** A call drops the weakest 30 %. */
export const KEEP_AFTER_CALL = 0.7;
/** A check drops the strongest 10 %. */
export const KEEP_AFTER_CHECK = 0.9;

/** Draw value in the hand strength: chance to hit per out (rule of 4 on the flop, of 2 on the turn). */
export const POT_PER_OUT: Record<BoardStreet, number> = { flop: 0.04, turn: 0.02, river: 0 };

/** Monte-Carlo runouts for an equity on the flop (turn and river are counted exactly). */
export const FLOP_SAMPLES = 4000;

/** Call against a bet or raise. */
export const CALL_MISTAKE_MARGIN = 10;
export const CALL_QUESTION_MARGIN = 3;
/** Implied odds: a call with a draw of at least 8 outs to a straight or flush gets 5 points on flop and turn. */
export const IMPLIED_ODDS_BONUS = 5;
export const DRAW_MIN_OUTS = 8;
/** Fold against a bet or raise. */
export const FOLD_MISTAKE_MARGIN = 15;
export const FOLD_QUESTION_MARGIN = 5;
/** Raise or all-in with less equity than this is questionable. */
export const RAISE_MIN_EQUITY = 35;
/** Bet sizes outside 20–150 % of the pot are questionable. */
export const BET_MIN_SHARE = 0.2;
export const BET_MAX_SHARE = 1.5;
/** A river bet with a middling hand: neither clear value nor a clear bluff. */
export const RIVER_BET_MIDDLE_LOW = 35;
export const RIVER_BET_MIDDLE_HIGH = 55;
/** A river check as the last to act with more equity than this gives away value. */
export const RIVER_CHECK_VALUE = 75;

export type PostflopVerdict = 'ok' | 'questionable' | 'mistake';
export type PostflopReason =
  | 'callOk'
  | 'callThin'
  | 'callTooWeak'
  | 'foldOk'
  | 'foldThin'
  | 'foldTooStrong'
  | 'raiseOk'
  | 'raiseWeak'
  | 'betOk'
  | 'betSize'
  | 'riverBetMiddle'
  | 'checkOk'
  | 'checkValue';

export type PostflopSituation = {
  street: BoardStreet;
  /** 'allIn' covers every bet or raise that puts the hero all-in; an all-in call is a 'call'. */
  action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allIn';
  /** Hero equity, 0–100. */
  equity: number;
  /** Equity the pot odds ask for, 0–100; 0 when there is nothing to call. */
  needed: number;
  /** Bet as a share of the pot before it; null for anything but a bet. */
  betShare: number | null;
  outs: number;
  /** Both players still have chips after a call, so implied odds exist (no bonus for an all-in call). */
  chipsBehind: boolean;
  /** River only: the villain acted before the hero on this street, so the hero closes the action. */
  heroActsLast: boolean;
};
export type PostflopJudgement = { verdict: PostflopVerdict; reason: PostflopReason; bonus: number };

const judge = (verdict: PostflopVerdict, reason: PostflopReason, bonus = 0): PostflopJudgement => ({ verdict, reason, bonus });

/** The rule table of spec 7. */
export function judgePostflop(s: PostflopSituation): PostflopJudgement {
  switch (s.action) {
    case 'call': {
      const bonus = s.street !== 'river' && s.chipsBehind && s.outs >= DRAW_MIN_OUTS ? IMPLIED_ODDS_BONUS : 0;
      const equity = s.equity + bonus;
      if (equity < s.needed - CALL_MISTAKE_MARGIN) return judge('mistake', 'callTooWeak', bonus);
      if (equity < s.needed - CALL_QUESTION_MARGIN) return judge('questionable', 'callThin', bonus);
      return judge('ok', 'callOk', bonus);
    }
    case 'fold':
      if (s.equity > s.needed + FOLD_MISTAKE_MARGIN) return judge('mistake', 'foldTooStrong');
      if (s.equity > s.needed + FOLD_QUESTION_MARGIN) return judge('questionable', 'foldThin');
      return judge('ok', 'foldOk');
    case 'raise':
    case 'allIn':
      return s.equity < RAISE_MIN_EQUITY ? judge('questionable', 'raiseWeak') : judge('ok', 'raiseOk');
    case 'bet': {
      const share = s.betShare ?? 0;
      if (share < BET_MIN_SHARE || share > BET_MAX_SHARE) return judge('questionable', 'betSize');
      if (s.street === 'river' && s.equity >= RIVER_BET_MIDDLE_LOW && s.equity <= RIVER_BET_MIDDLE_HIGH) {
        return judge('questionable', 'riverBetMiddle');
      }
      return judge('ok', 'betOk');
    }
    case 'check':
      if (s.street === 'river' && s.heroActsLast && s.equity > RIVER_CHECK_VALUE) return judge('questionable', 'checkValue');
      return judge('ok', 'checkOk');
  }
}
