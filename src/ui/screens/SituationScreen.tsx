import { useCallback, useMemo, useState } from 'react';
import { formatBb, streetLabel } from '../../app/format';
import type { Card } from '../../engine/cards';
import { POSITIONS, POSITION_LABELS, type Position } from '../../engine/positions';
import { TOURNAMENT_KINDS, TOURNAMENT_KIND_LABELS, type TournamentKind } from '../../review/tournament-kind';
import {
  CHIPS_PER_BB,
  bbToChips,
  type Situation,
  type SituationSetup,
  type SituationState,
  type SituationStep,
  addStep,
  chipsToBb,
  isStackBb,
  playSituation,
  undoStep,
} from '../../situation/model';
import { playedAtOf } from '../../situation/text';
import { ChoiceBar } from '../components/ActionBar';
import { CardPicker } from '../components/CardPicker';
import { FilterGroup, type Option } from '../components/FilterGroup';
import { TableView } from '../components/PokerTable';
import { ReviewDecisionPanel } from '../components/ReviewDecisionPanel';
import { RtaNotice } from '../components/RtaNotice';
import { TrainingLayout } from '../components/TrainingLayout';
import { replayTableModel } from '../replay-model';
import { useReviewStore } from '../ReviewContext';
import { type SituationChoice, lastEventText, parseBbInput, promptText, situationChoices, sizeOf, stepOf } from '../situation-view';
import { type SituationRating, useSituationRating } from '../useSituationRating';
import './screens.css';
import './situation.css';

const POSITION_OPTIONS: Option<Position>[] = POSITIONS.map((p) => ({ value: p, label: POSITION_LABELS[p] }));
const KIND_OPTIONS: Option<TournamentKind>[] = TOURNAMENT_KINDS.map((k) => ({ value: k, label: TOURNAMENT_KIND_LABELS[k] }));
const STACK_RULE = 'Stacks von 1 bis 200 BB, Schrittweite 0,1';
const defaultNow = () => new Date();

type Draft = {
  stack: string;
  /** Null: every opponent has the hero's stack. */
  others: Record<Position, string> | null;
  hero: Position;
  cards: Card[];
  kind: TournamentKind;
};
const START_DRAFT: Draft = { stack: '25', others: null, hero: 'UTG', cards: [], kind: 'normal' };

/** The setup from the form, or null while something is missing or out of range. */
function setupOf(draft: Draft, handId: string): SituationSetup | null {
  const own = parseBbInput(draft.stack);
  if (own === null || !isStackBb(own) || draft.cards.length !== 2) return null;
  const stacks = {} as Record<Position, number>;
  for (const p of POSITIONS) {
    const value = p === draft.hero || draft.others === null ? own : parseBbInput(draft.others[p]);
    if (value === null || !isStackBb(value)) return null;
    stacks[p] = value;
  }
  return { handId, kind: draft.kind, hero: draft.hero, heroCards: [draft.cards[0], draft.cards[1]], stacks };
}

function SetupForm({ draft, onChange, onStart }: { draft: Draft; onChange: (draft: Draft) => void; onStart: () => void }) {
  const ready = setupOf(draft, 'SIT0') !== null;
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const toggleOthers = () =>
    set({ others: draft.others ? null : (Object.fromEntries(POSITIONS.map((p) => [p, draft.stack])) as Record<Position, string>) });
  return (
    <section className="panel situation-setup" aria-label="Grunddaten">
      <label className="situation-field">
        Dein Stack (BB)
        <input inputMode="decimal" value={draft.stack} onChange={(e) => set({ stack: e.target.value })} />
      </label>
      <button type="button" className="btn btn--ghost" aria-expanded={draft.others !== null} onClick={toggleOthers}>
        {draft.others ? 'Gegner-Stacks wie deiner' : 'Gegner-Stacks anpassen'}
      </button>
      {draft.others && (
        <div className="situation-stacks">
          {POSITIONS.filter((p) => p !== draft.hero).map((p) => (
            <label key={p} className="situation-field">
              {POSITION_LABELS[p]}
              <input inputMode="decimal" value={draft.others![p]} onChange={(e) => set({ others: { ...draft.others!, [p]: e.target.value } })} />
            </label>
          ))}
        </div>
      )}
      <FilterGroup label="Deine Position" options={POSITION_OPTIONS} value={draft.hero} disabled={false} onChange={(hero) => set({ hero })} />
      <CardPicker label="Deine Karten" selected={draft.cards} used={new Set()} max={2} onChange={(cards) => set({ cards })} />
      <FilterGroup label="Turnierart" options={KIND_OPTIONS} value={draft.kind} disabled={false} onChange={(kind) => set({ kind })} />
      {!ready && <p className="muted">Wähle zwei Karten. {STACK_RULE}.</p>}
      <button type="button" className="btn btn--gold" disabled={!ready} onClick={onStart}>
        Weiter
      </button>
    </section>
  );
}

/** Size field and buttons for the player to act. */
function ActInput({ state, onStep }: { state: SituationState; onStep: (step: SituationStep) => void }) {
  const legal = state.phase.type === 'act' ? state.phase.legal : null;
  const [input, setInput] = useState('');
  const size = legal ? sizeOf(legal, input) : null;
  const choices = useMemo(() => (legal ? situationChoices(legal, size) : []), [legal, size]);
  const onAction = useCallback((choice: SituationChoice) => legal && onStep(stepOf(choice, legal, size)), [legal, onStep, size]);
  if (!legal) return null;
  const range = legal.bet ?? legal.raise;
  // A typed size that was clamped or is unreadable is not the size in use: say which one is.
  const typed = parseBbInput(input);
  const usedSize = input.trim() !== '' && size !== null && (typed === null || bbToChips(typed) !== size) ? size : null;
  return (
    <>
      {range && range.min < range.max && (
        <label className="situation-field situation-size">
          {legal.bet ? 'Bet (BB)' : 'Raise auf (BB)'}
          <input
            inputMode="decimal"
            placeholder={formatBb(chipsToBb(legal.suggested ?? range.min))}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <span className="muted">mindestens {formatBb(chipsToBb(range.min))} BB</span>
          {usedSize !== null && <span className="muted">Es gilt: {formatBb(chipsToBb(usedSize))} BB</span>}
        </label>
      )}
      <ChoiceBar choices={choices} answered={false} onAction={onAction} onNext={() => {}} />
    </>
  );
}

function BoardInput({ state, onStep }: { state: SituationState; onStep: (step: SituationStep) => void }) {
  const [picked, setPicked] = useState<Card[]>([]);
  if (state.phase.type !== 'board') return null;
  const { street, count, optional } = state.phase;
  return (
    <section className="panel situation-board" aria-label={`${streetLabel(street)}-Karten`}>
      <CardPicker label={`${streetLabel(street)}-Karten`} selected={picked} used={new Set(state.usedCards)} max={count} onChange={setPicked} />
      <button type="button" className="btn btn--gold" disabled={picked.length !== count} onClick={() => onStep({ type: 'board', cards: picked })}>
        {streetLabel(street)} übernehmen
      </button>
      {optional && (
        <button type="button" className="btn" onClick={() => onStep({ type: 'end' })}>
          Ohne restliches Board beenden
        </button>
      )}
    </section>
  );
}

/** The rating of the hero's last decision so far (live), or why there is none. */
function RatingPanel({ rating, kind }: { rating: SituationRating; kind: TournamentKind }) {
  const { data } = useReviewStore();
  if (rating.status === 'none') return null;
  if (rating.status === 'pending') return <p className="panel muted" aria-live="polite">Bewertung läuft …</p>;
  if (rating.status === 'failed') return <p className="panel" role="alert">Diese Situation kann ich nicht bewerten.</p>;
  const last = rating.analysis.decisions[rating.analysis.decisions.length - 1];
  return last ? <ReviewDecisionPanel decision={last} kind={kind} bigBlind={CHIPS_PER_BB} data={data} /> : null;
}

export function SituationScreen({ onBack, now = defaultNow }: { onBack: () => void; now?: () => Date }) {
  const store = useReviewStore();
  const [draft, setDraft] = useState<Draft>(START_DRAFT);
  const [situation, setSituation] = useState<Situation | null>(null);
  const [startedAt, setStartedAt] = useState(() => playedAtOf(now()));
  const state = useMemo(() => (situation ? playSituation(situation) : null), [situation]);
  const live = useSituationRating(store, situation, startedAt);

  const start = () => {
    const at = now();
    const setup = setupOf(draft, `SIT${at.getTime()}`);
    if (!setup) return;
    setStartedAt(playedAtOf(at));
    setSituation({ setup, steps: [] });
  };
  const onStep = useCallback((step: SituationStep) => setSituation((s) => (s ? addStep(s, step) : s)), []);
  const back = () => {
    if (!situation) return;
    if (situation.steps.length === 0) setSituation(null);
    else setSituation(undoStep(situation));
  };
  const leave = () => {
    if (situation && situation.steps.length > 0 && !window.confirm('Situation verwerfen?')) return;
    onBack();
  };

  return (
    <>
      <div className="screen-header">
        <button type="button" className="btn btn--ghost" onClick={leave}>
          ← Menü
        </button>
        <span className="muted">Situation analysieren</span>
      </div>
      <RtaNotice />
      {!state || !situation ? (
        <SetupForm draft={draft} onChange={setDraft} onStart={start} />
      ) : (
        <TrainingLayout
          main={
            <>
              <TableView
                model={replayTableModel(state.table, CHIPS_PER_BB)}
                cards={situation.setup.heroCards}
                board={state.table.board}
                situation={lastEventText(state)}
                info={`Du sitzt im ${POSITION_LABELS[situation.setup.hero]} · ${promptText(state)}`}
              />
              {/* A new key per step resets the size field and the picked board cards. */}
              <ActInput key={`act-${situation.steps.length}`} state={state} onStep={onStep} />
              <BoardInput key={`board-${situation.steps.length}`} state={state} onStep={onStep} />
              <div className="situation-nav">
                <button type="button" className="btn" onClick={back}>
                  ← Zurück
                </button>
              </div>
            </>
          }
          side={live.status !== 'none' && <RatingPanel rating={live} kind={situation.setup.kind} />}
        />
      )}
    </>
  );
}
