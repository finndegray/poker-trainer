import { LOCK_OTHER_TAB, LOCK_READ_ONLY } from '../../app/review-store';
import { useCallback, useMemo, useState } from 'react';
import { formatBb, reviewActionLabel, streetLabel } from '../../app/format';
import type { Card } from '../../engine/cards';
import { POSITIONS, POSITION_LABELS, type Position } from '../../engine/positions';
import { MAX_HAND_NAME, type TournamentRecord } from '../../review/archive';
import { decisionOutcome } from '../../review/summary';
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
import { playedAtOf, situationText } from '../../situation/text';
import { ChoiceBar } from '../components/ActionBar';
import { CardPicker } from '../components/CardPicker';
import { FilterGroup, type Option } from '../components/FilterGroup';
import { TableView } from '../components/PokerTable';
import { ReviewDecisionPanel } from '../components/ReviewDecisionPanel';
import { RtaNotice } from '../components/RtaNotice';
import { TrainingLayout } from '../components/TrainingLayout';
import { replayTableModel } from '../replay-model';
import { useReview, useReviewStore } from '../ReviewContext';
import {
  type SituationChoice,
  defaultSituationName,
  lastEventText,
  parseBbInput,
  promptText,
  situationChoices,
  sizeOf,
  stepOf,
} from '../situation-view';
import { type SituationRating, useSituationRating } from '../useSituationRating';
import { OUTCOME_LABELS } from './ReviewTournament';
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

/** Spec 3, end: the cards of the opponents at the showdown are optional. */
function ShowInput({ state, onStep }: { state: SituationState; onStep: (step: SituationStep) => void }) {
  const [villain, setVillain] = useState<Position | null>(null);
  const [picked, setPicked] = useState<Card[]>([]);
  if (state.showable.length === 0) return null;
  const who = villain !== null && state.showable.includes(villain) ? villain : state.showable[0];
  const options = state.showable.map((p) => ({ value: p, label: POSITION_LABELS[p] }));
  return (
    <section className="panel situation-board" aria-label="Karten der Gegner">
      <p className="muted">Karten der Gegner (optional)</p>
      {options.length > 1 && (
        <FilterGroup
          label="Gegner"
          options={options}
          value={who}
          disabled={false}
          onChange={(p) => {
            setVillain(p);
            setPicked([]);
          }}
        />
      )}
      <CardPicker label={`Karten von ${POSITION_LABELS[who]}`} selected={picked} used={new Set(state.usedCards)} max={2} onChange={setPicked} />
      <button
        type="button"
        className="btn"
        disabled={picked.length !== 2}
        onClick={() => onStep({ type: 'show', position: who, cards: [picked[0], picked[1]] })}
      >
        Karten übernehmen
      </button>
    </section>
  );
}

type SummaryProps = {
  situation: Situation;
  rating: SituationRating;
  onBack: () => void;
  onDiscard: () => void;
  onReview: () => void;
  now: () => Date;
  saved: TournamentRecord | null;
  onSaved: (record: TournamentRecord) => void;
  saving: boolean;
  onSaving: (saving: boolean) => void;
};

const SAVE_UNKNOWN_ERROR = 'Unbekannter Fehler';

/** The reason saving is blocked, worded for the save button (the import texts stay as they are). */
function saveLockText(reason: string): string {
  if (reason === LOCK_OTHER_TAB) return 'Speichern ist nur in dem Tab möglich, der deinen Fortschritt speichert.';
  if (reason === LOCK_READ_ONLY) return 'Speichern ist im Nur-Lesen-Modus nicht möglich.';
  return `Speichern ist hier nicht möglich: ${reason}`;
}

/** Spec 3: every hero decision with its verdict; save with a name or discard. */
function Summary({ situation, rating, onBack, onDiscard, onReview, now, saved, onSaved, saving, onSaving }: SummaryProps) {
  const store = useReviewStore();
  const review = useReview();
  const { kind } = situation.setup;
  const [selected, setSelected] = useState<number | null>(null);
  const [name, setName] = useState(() => defaultSituationName(situation.setup));
  const [error, setError] = useState<string | null>(null);
  const decisions = rating.status === 'ready' ? rating.analysis.decisions : [];
  const shown = decisions.find((d) => d.eventIndex === selected) ?? decisions[decisions.length - 1];

  const save = async () => {
    setError(null);
    onSaving(true);
    try {
      // playedAt is the moment of saving (local time), as the spec asks.
      onSaved(await store.saveSituation(situationText(situation, playedAtOf(now())), name));
    } catch (e) {
      setError(e instanceof Error ? e.message : SAVE_UNKNOWN_ERROR);
    } finally {
      onSaving(false);
    }
  };

  return (
    <TrainingLayout
      main={
        <section className="panel situation-summary" aria-label="Zusammenfassung">
          <h2 className="review-title">Zusammenfassung</h2>
          {rating.status === 'pending' && <p className="muted">Die Hand wird bewertet …</p>}
          {rating.status === 'failed' && <p role="alert">Diese Situation kann ich nicht bewerten.</p>}
          {rating.status === 'ready' && decisions.length === 0 && <p className="muted">In dieser Hand hast du keine Entscheidung getroffen.</p>}
          {decisions.length > 0 && (
            <ol className="situation-decisions">
              {decisions.map((d) => (
                <li key={d.eventIndex}>
                  <button type="button" className="btn" aria-pressed={d === shown} onClick={() => setSelected(d.eventIndex)}>
                    {streetLabel(d.street)} · {reviewActionLabel(d, CHIPS_PER_BB)} · {OUTCOME_LABELS[decisionOutcome(d, kind)]}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {saved ? (
            <>
              <p role="status">Gespeichert in „{saved.name}“.</p>
              <div className="situation-nav">
                <button type="button" className="btn btn--gold" onClick={onDiscard}>
                  Neue Situation
                </button>
                <button type="button" className="btn" onClick={onReview}>
                  Im Hand-Review ansehen
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="situation-field">
                Name
                <input value={name} maxLength={MAX_HAND_NAME} onChange={(e) => setName(e.target.value)} />
              </label>
              {review.lockReason && <p className="muted">{saveLockText(review.lockReason)}</p>}
              {error && <p role="alert">Speichern fehlgeschlagen: {error}</p>}
              <div className="situation-nav">
                <button type="button" className="btn" disabled={saving} onClick={onBack}>
                  ← Zurück
                </button>
                <button
                  type="button"
                  className="btn btn--gold"
                  disabled={!review.writable || saving || name.trim() === ''}
                  onClick={() => void save()}
                >
                  Speichern
                </button>
                <button type="button" className="btn" disabled={saving} onClick={onDiscard}>
                  Verwerfen
                </button>
              </div>
            </>
          )}
        </section>
      }
      side={shown && <ReviewDecisionPanel decision={shown} kind={kind} bigBlind={CHIPS_PER_BB} data={store.data} />}
    />
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

type Props = { onBack: () => void; onReview: () => void; now?: () => Date };

export function SituationScreen({ onBack, onReview, now = defaultNow }: Props) {
  const store = useReviewStore();
  const [draft, setDraft] = useState<Draft>(START_DRAFT);
  const [situation, setSituation] = useState<Situation | null>(null);
  const [summary, setSummary] = useState(false);
  const [saved, setSaved] = useState<TournamentRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [startedAt, setStartedAt] = useState(() => playedAtOf(now()));
  const state = useMemo(() => (situation ? playSituation(situation) : null), [situation]);
  const live = useSituationRating(store, summary ? null : situation, startedAt);
  const whole = useSituationRating(store, summary ? situation : null, startedAt, true);

  const start = () => {
    const at = now();
    const setup = setupOf(draft, `SIT${at.getTime()}`);
    if (!setup) return;
    setSaved(null);
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
    if (saving) return;
    if (situation && situation.steps.length > 0 && saved === null && !window.confirm('Situation verwerfen?')) return;
    onBack();
  };
  /** Back to the setup with the same entries; the next situation gets a new hand id. */
  const discard = () => {
    setSummary(false);
    setSaved(null);
    setSituation(null);
  };

  return (
    <>
      <div className="screen-header">
        <button type="button" className="btn btn--ghost" disabled={saving} onClick={leave}>
          ← Menü
        </button>
        <span className="muted">Situation analysieren</span>
      </div>
      <RtaNotice />
      {!state || !situation ? (
        <SetupForm draft={draft} onChange={setDraft} onStart={start} />
      ) : summary ? (
        <Summary situation={situation} rating={whole} onBack={() => setSummary(false)} onDiscard={discard} onReview={onReview}
          now={now}
          saved={saved}
          onSaved={setSaved}
          saving={saving}
          onSaving={setSaving}
        />
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
              <ShowInput key={`show-${situation.steps.length}`} state={state} onStep={onStep} />
              <div className="situation-nav">
                <button type="button" className="btn" onClick={back}>
                  ← Zurück
                </button>
                {state.phase.type === 'done' && (
                  <button type="button" className="btn btn--gold" onClick={() => setSummary(true)}>
                    Zur Zusammenfassung
                  </button>
                )}
              </div>
            </>
          }
          side={live.status !== 'none' && <RatingPanel rating={live} kind={situation.setup.kind} />}
        />
      )}
    </>
  );
}
