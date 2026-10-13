// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyState } from '../storage/schema';
import type { SoundPlayer } from './sound';
import { renderWithStore } from './test-utils';
import { useGameSounds } from './useGameSounds';

function Probe({ player }: { player: SoundPlayer }) {
  useGameSounds(player);
  return null;
}

const spyPlayer = () => ({ unlock: vi.fn(), play: vi.fn() });

describe('useGameSounds', () => {
  it('unlocks audio on touch, pointer, click and key gestures and stops listening on unmount', () => {
    const player = spyPlayer();
    const { unmount } = renderWithStore(<Probe player={player} />);
    fireEvent.touchEnd(document.body);
    expect(player.unlock).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);
    fireEvent.click(document.body);
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(player.unlock).toHaveBeenCalledTimes(5);
    unmount();
    fireEvent.touchEnd(document.body);
    fireEvent.click(document.body);
    expect(player.unlock).toHaveBeenCalledTimes(5);
  });

  it('unlocks even when a handler stops the event from bubbling', () => {
    const player = spyPlayer();
    renderWithStore(<Probe player={player} />);
    const button = document.createElement('button');
    button.addEventListener('touchend', (event) => event.stopPropagation());
    document.body.append(button);
    fireEvent.touchEnd(button);
    expect(player.unlock).toHaveBeenCalledTimes(1);
    button.remove();
  });

  it('plays deal, then correct or wrong after an answer', () => {
    const player = spyPlayer();
    const { store } = renderWithStore(<Probe player={player} />);
    act(() => store.startTraining());
    expect(player.play).toHaveBeenLastCalledWith('deal');
    let verdict = '';
    act(() => {
      verdict = store.answer('fold').outcome.grade.verdict;
    });
    expect(player.play).toHaveBeenLastCalledWith(verdict === 'wrong' ? 'wrong' : 'correct');
    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it('stays silent when sounds are off', () => {
    const player = spyPlayer();
    const initial = { ...emptyState(), profile: { xp: 0, combo: 0, soundOn: false } };
    const { store } = renderWithStore(<Probe player={player} />, { initial });
    act(() => store.startTraining());
    act(() => {
      store.answer('fold');
    });
    expect(player.play).not.toHaveBeenCalled();
  });

  it('does not replay old sounds when the setting is toggled', () => {
    const player = spyPlayer();
    const { store } = renderWithStore(<Probe player={player} />);
    act(() => store.startTraining());
    act(() => {
      store.answer('fold');
    });
    const played = player.play.mock.calls.length;
    act(() => store.setSound(false));
    act(() => store.setSound(true));
    expect(player.play).toHaveBeenCalledTimes(played);
  });
});
