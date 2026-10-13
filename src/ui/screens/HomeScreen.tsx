import { StatusBar } from '../components/StatusBar';
import { useGame } from '../GameContext';
import './screens.css';

export type Screen = 'home' | 'training' | 'daily' | 'run' | 'stats' | 'settings';

type Tile = { title: string; text: string; button: string; target: Screen; locked: boolean };

export function HomeScreen({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const game = useGame();
  const locked = game.info.readOnly;
  const { dailyToday, activeRun, bestRun } = game.status;
  const runRunning = activeRun !== null && activeRun.status === 'running';

  const tiles: Tile[] = [
    {
      title: 'Daily Challenge',
      text: dailyToday ? `Heute erledigt: ${dailyToday.correct}/${dailyToday.total}` : '20 Spots – heute noch offen',
      button: 'Daily spielen',
      target: 'daily',
      locked,
    },
    {
      title: 'Endphase-Run',
      text: runRunning
        ? `Run läuft – Level ${activeRun.levelIndex + 1} von 8`
        : bestRun
          ? `Beste Platzierung: Platz ${bestRun.placement}`
          : 'Überlebe die Endphase eines MTT mit 3 Leben.',
      button: runRunning ? 'Run fortsetzen' : 'Run starten',
      target: 'run',
      locked,
    },
    { title: 'Statistik', text: 'Trefferquote, Schwachstellen und Verlauf', button: 'Statistik ansehen', target: 'stats', locked: false },
    { title: 'Einstellungen', text: 'Sound, Export/Import und Sicherungen', button: 'Einstellungen öffnen', target: 'settings', locked: false },
  ];

  return (
    <>
      {!locked && <StatusBar status={game.status} xp={game.save.profile.xp} />}
      <section className="panel home__hero">
        <h2 className="home__heading">Push/Fold-Training</h2>
        <p className="muted">
          Kurze Stacks von 1 bis 20 BB, 8-max mit Big-Blind-Ante. Der Trainer zeigt dir bevorzugt knappe Spots und
          die Situationen, in denen du am häufigsten danebenliegst.
        </p>
        <button type="button" className="btn btn--gold home__start" onClick={() => onNavigate('training')} disabled={locked}>
          Training starten
        </button>
      </section>
      <section className="home__modes">
        {tiles.map((tile) => (
          <div key={tile.title} className="panel home__mode">
            <h3 className="home__mode-title">{tile.title}</h3>
            <p className="muted home__mode-text">{tile.text}</p>
            <button type="button" className="btn" onClick={() => onNavigate(tile.target)} disabled={tile.locked}>
              {tile.button}
            </button>
          </div>
        ))}
      </section>
    </>
  );
}
