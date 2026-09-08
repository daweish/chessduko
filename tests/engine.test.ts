import { describe, expect, it } from 'vitest';
import {
  FindSubsetElimination,
  CountSolutions,
  GenerateDailySet,
  GeneratePuzzle,
  RatePuzzle,
  ValidateRegions,
} from '../src/engine';
import { IndependentSolutions } from '../scripts/independent';
import example from './example.json';

// -----------------------------------------------------------------------------
// Tests

const regions = Uint8Array.from(example.regions);
const givens = Uint8Array.from(example.givens);
const solution = Uint8Array.from(example.solution);

describe('supplied Chessdoku example', () => {
  it('matches the supplied solution and has exactly one solution', () => {
    expect(ValidateRegions(regions)).toBe(true);
    expect(CountSolutions(regions, solution)).toBe(1);
    expect(CountSolutions(regions, givens)).toBe(1);
    const independent = IndependentSolutions(regions, givens);
    expect(independent.count).toBe(1);
    expect(independent.solution).toEqual(solution);
    expect(RatePuzzle(regions, givens).solved).toBe(true);
  });
  it('rejects duplicates, wrong parity, malformed boards and disconnected regions', () => {
    const wrong_parity = givens.slice();
    wrong_parity[0] = 1;
    expect(CountSolutions(regions, wrong_parity)).toBe(0);
    expect(RatePuzzle(regions, wrong_parity).invalid).toBe(true);
    const duplicates = solution.slice();
    duplicates[0] = duplicates[2];
    expect(CountSolutions(regions, duplicates)).toBe(0);
    expect(CountSolutions(regions, new Uint8Array(63))).toBe(0);
    expect(CountSolutions(new Uint8Array(64), givens)).toBe(0);
    const disconnected = regions.slice();
    [disconnected[0], disconnected[63]] = [disconnected[63], disconnected[0]];
    expect(ValidateRegions(disconnected)).toBe(false);
  });
  it('distinguishes ambiguity and an exhausted search from uniqueness', () => {
    expect(CountSolutions(regions, new Uint8Array(64))).toBe(2);
    expect(CountSolutions(regions, givens, 0)).toBe('budget-exhausted');
    expect(RatePuzzle(regions, new Uint8Array(64)).solved).toBe(false);
    expect(GeneratePuzzle('test', 'hard', 0, 0)).toBeNull();
  });
});

it('generates 20 representative daily sets with verified difficulty and independent uniqueness', () => {
  const seeds = [
    '2026-06-10',
    ...Array.from(
      { length: 16 },
      (_, n) => `2026-${String((n % 12) + 1).padStart(2, '0')}-${String(n + 1).padStart(2, '0')}`,
    ),
    'test',
    'Dad ♥',
    '',
  ];
  for (const seed of seeds) {
    const result = GenerateDailySet(seed);
    expect(result.ok, seed).toBe(true);
    if (!result.ok) continue;
    const { easy, medium, hard } = result.puzzles;
    expect(easy.clue_count).toBeGreaterThan(medium.clue_count);
    expect(medium.clue_count).toBeGreaterThan(hard.clue_count);
    for (const p of [easy, medium, hard]) {
      expect(ValidateRegions(p.regions)).toBe(true);
      expect(p.givens.filter(Boolean).length).toBe(p.clue_count);
      const independently_solved = IndependentSolutions(p.regions, p.givens);
      expect(independently_solved.count, seed).toBe(1);
      expect(independently_solved.solution).toEqual(p.solution);
      expect(p.givens.every((v, i) => !v || v === p.solution[i])).toBe(true);
      const rating = RatePuzzle(p.regions, p.givens);
      expect(rating.solved).toBe(true);
      expect(rating.invalid).toBe(false);
      expect(rating.difficulty).toBe(p.difficulty);
      if (p.difficulty !== 'easy')
        expect(
          RatePuzzle(p.regions, p.givens, p.difficulty === 'medium' ? 'easy' : 'medium').solved,
        ).toBe(false);
      for (const step of rating.steps) {
        if (step.technique === 'single' || step.technique === 'hidden-single')
          expect(step.digits).toContain(p.solution[step.cells[0]]);
        else for (const cell of step.cells) expect(step.digits).not.toContain(p.solution[cell]);
      }
    }
  }
});

it('repeats seeds independently of intervening requests and returns unaliased buffers', () => {
  const first = GenerateDailySet('2026-01-01');
  GeneratePuzzle('intervening', 'easy');
  expect(GenerateDailySet('2026-01-01')).toEqual(first);
  if (!first.ok) throw new Error('Fixture generation failed');
  const p = first.puzzles.easy;
  p.givens[0] = 99;
  expect(p.solution[0]).not.toBe(99);
  expect(p.regions[0]).not.toBe(99);
  expect(GenerateDailySet('2026-01-01')).not.toEqual(first);
});

it('exercises singles, hidden singles, locked candidates, pairs and X-Wing deductions', () => {
  const p = GeneratePuzzle('2026-01-14', 'hard')!;
  const techniques = new Set(p.rating.steps.map((step) => step.technique));
  for (const technique of ['single', 'hidden-single', 'locked', 'naked-pair', 'x-wing'])
    expect(techniques).toContain(technique);
});

// Parity restricts each digit group to four symbols, making hidden subsets and
// triples redundant after simpler deductions in many real Chessdoku positions.
// Isolate their candidate patterns to verify the supported deductions directly.
it.each([
  { masks: [3, 3, 7], size: 2 as const, technique: 'naked-pair', cells: [2], bits: 3 },
  { masks: [7, 11, 28, 60], size: 2 as const, technique: 'hidden-pair', cells: [0, 1], bits: 252 },
  { masks: [3, 6, 5, 15], size: 3 as const, technique: 'naked-triple', cells: [3], bits: 7 },
  {
    masks: [11, 22, 37, 120, 184],
    size: 3 as const,
    technique: 'hidden-triple',
    cells: [0, 1, 2],
    bits: 248,
  },
])(
  'identifies $technique without changing input candidates',
  ({ masks, size, technique, cells, bits }) => {
    const candidates = Uint16Array.from(masks);
    expect(
      FindSubsetElimination(
        masks.map((_, i) => i),
        candidates,
        new Uint8Array(masks.length),
        size,
      ),
    ).toEqual({ cells, bits, technique });
    expect([...candidates]).toEqual(masks);
  },
);
