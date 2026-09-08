import { writeFileSync, mkdirSync } from 'node:fs';
import { GenerateDailySet, CountSolutions, RatePuzzle, ValidateRegions } from '../src/engine.ts';
import { IndependentSolutions } from './independent.ts';
const count = Number(process.argv[2] ?? 365);
const offset = Number(process.argv[3] ?? 0);
const records: object[] = [];
let failures = 0;
for (let n = 0; n < count; n++) {
  const seed =
    n + offset < 365
      ? new Date(Date.UTC(2026, 0, 1 + n + offset)).toISOString().slice(0, 10)
      : ['test', '0', 'Dad ♥', '', 'a'.repeat(512)][(n + offset - 365) % 5];
  const start = performance.now();
  const result = GenerateDailySet(seed);
  const ms = Math.round(performance.now() - start);
  if (!result.ok) {
    failures++;
    records.push({ seed, ms, error: result });
    console.log('FAIL', seed, ms, result);
    continue;
  }
  const puzzles = Object.values(result.puzzles);
  const valid =
    puzzles.every(
      (p) =>
        IndependentSolutions(p.regions, p.givens).count === 1 &&
        ValidateRegions(p.regions) &&
        CountSolutions(p.regions, p.givens) === 1 &&
        CountSolutions(p.regions, p.solution) === 1 &&
        p.givens.every((v, i) => !v || v === p.solution[i]) &&
        RatePuzzle(p.regions, p.givens).difficulty === p.difficulty &&
        RatePuzzle(p.regions, p.givens).solved,
    ) &&
    result.puzzles.easy.clue_count > result.puzzles.medium.clue_count &&
    result.puzzles.medium.clue_count > result.puzzles.hard.clue_count;
  if (!valid) failures++;
  records.push({
    seed,
    ms,
    valid,
    clues: puzzles.map((p) => p.clue_count),
    techniques: puzzles.map((p) => [...new Set(p.rating.steps.map((s) => s.technique))]),
  });
  console.log(seed, ms, puzzles.map((p) => p.clue_count).join('/'), valid ? 'OK' : 'INVALID');
}
mkdirSync('docs/validation', { recursive: true });
writeFileSync(
  `docs/validation/corpus-${offset}.json`,
  JSON.stringify({ count, offset, failures, records }, null, 2) + '\n',
);
process.exitCode = failures ? 1 : 0;
