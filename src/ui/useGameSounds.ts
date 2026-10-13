import { useEffect } from 'react';
import { useGame } from './GameContext';
import type { SoundPlayer } from './sound';

const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

export function useGameSounds(player: SoundPlayer): void {
  const game = useGame();
  const on = game.save.profile.soundOn;
  const spot = game.current?.spot;
  const last = game.last;
  const celebration = game.celebration;

  useEffect(() => {
    const unlock = () => player.unlock();
    // iOS only allows audio from touchend/click; capture phase so stopPropagation elsewhere cannot block it.
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true });
    return () => {
      for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, { capture: true });
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
