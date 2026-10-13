import { describe, expect, it } from 'vitest';
import type { Verdict } from '../engine/pushfold';
import { mulberry32 } from '../engine/rng';
import { makeFixture } from '../engine/test-fixtures';
import {
  RUN_LEVEL_STACKS, applyRunAnswer, completedLevels, nextRunSpot, runBonusXp, runPlacement, runStack, startRun,
  type RunState,
} from './endphase-run';

const play = (verdicts: Verdict[]): RunState => verdicts.reduce(applyRunAnswer, startRun());
const correct = (n: number): Verdict[] => Array.from({ length: n }, () => 'correct');

describe('endphase run', () => {
  it('starts at level 1 with 3 lives', () => {
    expect(startRun()).toEqual({ levelIndex: 0, spotInLevel: 0, lives: 3, status: 'running', answered: 0 });
    expect(runPlacement(startRun())).toBeNull();
  });

  it('advances a level every 5 spots', () => {
    const s = play(correct(7));
    expect(s).toMatchObject({ levelIndex: 1, spotInLevel: 2, lives: 3, status: 'running', answered: 7 });
    expect(completedLevels(s)).toBe(1);
  });

  it('reaches the final table after 40 correct spots', () => {
    const s = play(correct(40));
    expect(s.status).toBe('finalTable');
    expect(completedLevels(s)).toBe(8);
    expect(runPlacement(s)).toBe(1);
    expect(runBonusXp(s)).toBe(180);
  });

  it('places by remaining lives at the final table', () => {
    const twoLives = play(['wrong', ...correct(39)]);
    expect(twoLives.status).toBe('finalTable');
    expect(runPlacement(twoLives)).toBe(3);
    const oneLife = play(['wrong', 'wrong', ...correct(38)]);
    expect(runPlacement(oneLife)).toBe(7);
  });

  it('busts after 3 mistakes', () => {
    const s = play(['wrong', 'wrong', 'wrong']);
    expect(s).toMatchObject({ status: 'busted', lives: 0, levelIndex: 0 });
    expect(runPlacement(s)).toBe(2000);
    expect(runBonusXp(s)).toBe(0);
  });

  it('interpolates the placement by level', () => {
    const s = play([...correct(15), 'wrong', 'wrong', 'wrong']);
    expect(s.levelIndex).toBe(3);
    expect(runPlacement(s)).toBe(Math.round(2000 - 3 * 1990 / 7));
    expect(runBonusXp(s)).toBe(30);
  });

  it('does not take a life for close decisions', () => {
    expect(play(['close', 'close', 'close']).lives).toBe(3);
  });

  it('refuses answers after the run ended', () => {
    expect(() => applyRunAnswer(play(['wrong', 'wrong', 'wrong']), 'correct')).toThrow();
  });

  it('varies the stack by at most 1 BB around the level stack', () => {
    const rng = mulberry32(3);
    for (let level = 0; level < RUN_LEVEL_STACKS.length; level++) {
      const state: RunState = { ...startRun(), levelIndex: level };
      for (let i = 0; i < 50; i++) {
        const stack = runStack(state, rng);
        expect(Math.abs(stack - RUN_LEVEL_STACKS[level])).toBeLessThanOrEqual(1);
        expect(stack).toBeLessThanOrEqual(20);
      }
    }
  });

  it('generates spots with the run stack', () => {
    const data = makeFixture((h) => (84 - h) / 10);
    const rng = mulberry32(8);
    const state: RunState = { ...startRun(), levelIndex: 7 };
    for (let i = 0; i < 30; i++) {
      const spot = nextRunSpot(data, state, rng);
      expect(spot.stack).toBeGreaterThanOrEqual(3);
      expect(spot.stack).toBeLessThanOrEqual(5);
    }
    expect(() => nextRunSpot(data, play(['wrong', 'wrong', 'wrong']), rng)).toThrow();
  });
});

describe('endphase run busts', () => {
  it('busts on the last spot of a level without advancing', () => {
    const s = play(['correct', 'correct', 'wrong', 'wrong', 'wrong']);
    expect(s).toMatchObject({ status: 'busted', levelIndex: 0, lives: 0, answered: 5 });
    expect(runPlacement(s)).toBe(2000);
    const later = play([...correct(10), 'correct', 'wrong', 'correct', 'wrong', 'wrong']);
    expect(later).toMatchObject({ status: 'busted', levelIndex: 2, answered: 15 });
  });

  it('busts on spot 40 instead of reaching the final table', () => {
    const s = play([...correct(37), 'wrong', 'wrong', 'wrong']);
    expect(s).toMatchObject({ status: 'busted', levelIndex: 7, lives: 0, answered: 40 });
    expect(completedLevels(s)).toBe(7);
    expect(runPlacement(s)).toBe(10);
    expect(runBonusXp(s)).toBe(70);
  });
});
