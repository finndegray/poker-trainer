import {
  BET_MAX_SHARE,
  BET_MIN_SHARE,
  DRAW_MIN_OUTS,
  IMPLIED_ODDS_BONUS,
  type PostflopReason,
  type PostflopVerdict,
  RAISE_MIN_EQUITY,
  RIVER_BET_MIDDLE_HIGH,
  RIVER_BET_MIDDLE_LOW,
  RIVER_CHECK_VALUE,
} from './postflop-rules';
import type { VillainRole } from './villain-range';

export const POSTFLOP_DISCLAIMER = 'Faustregel, kein Solver-Ergebnis';

export const POSTFLOP_VERDICT_LABELS: Record<PostflopVerdict, string> = {
  ok: 'Passt',
  questionable: 'Fraglich',
  mistake: 'Wahrscheinlich Fehler',
};

export const POSTFLOP_REASON_TEXT: Record<PostflopReason, string> = {
  callOk: 'Der Call ist durch die Pot Odds gedeckt.',
  callThin: 'Knapper Call: etwas weniger Equity, als die Pot Odds verlangen.',
  callTooWeak: 'Zu wenig Equity für den Call: Die Pot Odds verlangen deutlich mehr.',
  foldOk: 'Der Fold passt: Deine Equity reicht für die Pot Odds nicht klar aus.',
  foldThin: 'Knapper Fold: Deine Equity liegt über dem, was die Pot Odds verlangen.',
  foldTooStrong: 'Zu früh aufgegeben: Deine Equity liegt deutlich über den Pot Odds.',
  raiseOk: 'Genug Equity für Raise oder All-in.',
  raiseWeak: `Raise oder All-in mit weniger als ${RAISE_MIN_EQUITY} % Equity – nur als Bluff sinnvoll.`,
  betOk: 'Einsatz in üblicher Größe.',
  betSize: `Ungewöhnliche Einsatzgröße: unter ${BET_MIN_SHARE * 100} % oder über ${BET_MAX_SHARE * 100} % vom Pot.`,
  riverBetMiddle: `River-Bet mit ${RIVER_BET_MIDDLE_LOW}–${RIVER_BET_MIDDLE_HIGH} % Equity: Bessere Hände callen, schlechtere folden.`,
  checkOk: 'Der Check passt.',
  checkValue: `Value verschenkt? Als Letzter am River mit über ${RIVER_CHECK_VALUE} % Equity wäre eine Bet naheliegend.`,
};

export const IMPLIED_ODDS_TEXT = `inkl. ${IMPLIED_ODDS_BONUS} Punkte Implied Odds (Draw mit mindestens ${DRAW_MIN_OUTS} Outs)`;

export const VILLAIN_ROLE_LABELS: Record<VillainRole, string> = {
  opener: 'Open-Raise',
  caller: 'Call gegen deinen Open',
  bbDefender: 'BB-Verteidigung',
  threeBettor: '3-Bet gegen deinen Open',
  callerVs3bet: 'Call gegen deine 3-Bet',
};
