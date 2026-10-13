import { useEffect } from 'react';
import { useGame } from './GameContext';
import type { SoundPlayer } from './sound';

export function useGameSounds(player: SoundPlayer): void {
  const game = useGame();
  const on = game.save.profile.soundOn;
  const spot = game.current?.spot;
  const last = game.last;
  const celebration = game.celebration;

  useEffect(() => {
    const unlock = () => player.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [player]);

  // The effects below intentionally depend only on the value that triggers the sound,
  // so toggling the sound setting never replays an old event.
  useEffect(() => {
    if (on && spot) player.play('deal');
  }, [spot]);

  useEffect(() => {
    if (on && last) player.play(last.outcome.grade.verdict === 'wrong' ? 'wrong' : 'correct');
  }, [last]);

  useEffect(() => {
    if (on && celebration) player.play('rankup');
  }, [celebration]);
}
