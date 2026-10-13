import { useCallback, useState } from 'react';
import type { OpenTournament } from '../../app/review-store';
import type { TournamentKind } from '../../review/tournament-kind';
import { formatCount } from '../../app/format';
import { useReview, useReviewStore } from '../ReviewContext';
import { ReviewHand } from './ReviewHand';
import { ReviewImport } from './ReviewImport';
import { ReviewOverview } from './ReviewOverview';
import { ReviewTournament } from './ReviewTournament';
import './screens.css';
import './review.css';

type View = { name: 'overview' } | { name: 'import' } | { name: 'tournament'; id: string } | { name: 'hand'; id: string; handId: string };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const defaultNow = () => new Date();

export function ReviewScreen({ onBack, now = defaultNow }: { onBack: () => void; now?: () => Date }) {
  const store = useReviewStore();
  const { reanalysis } = useReview();
  const [view, setView] = useState<View>({ name: 'overview' });
  const [open, setOpen] = useState<OpenTournament | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const openTournament = useCallback(
    async (id: string) => {
      setMessage(null);
      setView({ name: 'tournament', id });
      setOpen(null);
      try {
        setOpen(await store.openTournament(id));
      } catch (error) {
        setMessage(`Turnier konnte nicht geladen werden: ${errorText(error)}`);
      }
    },
    [store],
  );
  const setKind = async (kind: TournamentKind) => {
    if (!open) return;
    setMessage(null);
    try {
      await store.setKind(open.tournament.id, kind);
      setOpen(await store.openTournament(open.tournament.id));
    } catch (error) {
      setMessage(`Ändern fehlgeschlagen: ${errorText(error)}`);
    }
  };
  const remove = async () => {
    if (!open || !window.confirm(`Turnier „${open.tournament.name}“ mit allen Händen löschen?`)) return;
    setMessage(null);
    try {
      await store.deleteTournament(open.tournament.id);
      setOpen(null);
      setView({ name: 'overview' });
    } catch (error) {
      setMessage(`Löschen fehlgeschlagen: ${errorText(error)}`);
    }
  };

  const back =
    view.name === 'overview'
      ? { label: '← Menü', go: onBack }
      : view.name === 'hand'
        ? { label: '← Turnier', go: () => setView({ name: 'tournament', id: view.id }) }
        : { label: '← Übersicht', go: () => setView({ name: 'overview' }) };
  const item = view.name === 'hand' ? open?.hands.find((h) => h.record.id === view.handId) : undefined;

  return (
    <>
      <div className="screen-header">
        <button type="button" className="btn btn--ghost" onClick={back.go}>
          {back.label}
        </button>
        <span className="muted">Hand-Review</span>
      </div>
      {message && <p role="alert">{message}</p>}
      {view.name === 'overview' && <ReviewOverview now={now} onImport={() => setView({ name: 'import' })} onOpen={(id) => void openTournament(id)} />}
      {view.name === 'import' && <ReviewImport onDone={() => setView({ name: 'overview' })} />}
      {view.name === 'tournament' &&
        (open ? (
          <ReviewTournament
            open={open}
            onOpenHand={(handId) => setView({ name: 'hand', id: view.id, handId })}
            onSetKind={(kind) => void setKind(kind)}
            onDelete={() => void remove()}
          />
        ) : (
          !message && (
            <p className="panel muted" aria-live="polite">
              {reanalysis
                ? `Hände werden neu bewertet: ${formatCount(reanalysis.hand)} von ${formatCount(reanalysis.hands)}`
                : 'Turnier wird geladen …'}
            </p>
          )
        ))}
      {view.name === 'hand' && open && item && <ReviewHand key={item.record.id} item={item} kind={open.tournament.kind} />}
    </>
  );
}
