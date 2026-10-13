import { StatusBar } from '../components/StatusBar';
import { useGame } from '../GameContext';
import './screens.css';

const COMING_SOON = ['Daily Challenge', 'Endphase-Run', 'Statistik'];

export function HomeScreen({ onStartTraining }: { onStartTraining: () => void }) {
  const game = useGame();
  return (
    <>
      {!game.info.readOnly && <StatusBar status={game.status} xp={game.save.profile.xp} />}
      <section className="panel home__hero">
        <h2 className="home__heading">Push/Fold-Training</h2>
        <p className="muted">
          Kurze Stacks von 1 bis 20 BB, 8-max mit Big-Blind-Ante. Der Trainer zeigt dir bevorzugt knappe Spots und
          die Situationen, in denen du am häufigsten danebenliegst.
        </p>
        <button type="button" className="btn btn--gold home__start" onClick={onStartTraining} disabled={game.info.readOnly}>
          Training starten
        </button>
      </section>
      <section className="home__modes">
        {COMING_SOON.map((title) => (
          <div key={title} className="panel home__mode">
            <span>{title}</span>
            <span className="badge">bald verfügbar</span>
          </div>
        ))}
      </section>
    </>
  );
}
