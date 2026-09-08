export type Difficulty = 'easy' | 'medium' | 'hard';
export type Technique =
  | 'single'
  | 'hidden-single'
  | 'locked'
  | 'naked-pair'
  | 'hidden-pair'
  | 'naked-triple'
  | 'hidden-triple'
  | 'x-wing';
export interface Deduction {
  technique: Technique;
  cells: number[];
  digits: number[];
}
export interface Rating {
  solved: boolean;
  invalid: boolean;
  difficulty: Difficulty;
  steps: Deduction[];
}
export interface Puzzle {
  version: string;
  seed: string;
  difficulty: Difficulty;
  clue_count: number;
  rating: Rating;
  regions: Uint8Array;
  givens: Uint8Array;
  solution: Uint8Array;
}
export type DailySet = Record<Difficulty, Puzzle>;
export type GenerationResult =
  | { ok: true; puzzles: DailySet }
  | { ok: false; error: 'generation-exhausted'; difficulty: Difficulty };
export const GENERATOR_VERSION = '1';
const ALL = 255;
const EVEN = 170;
const ODD = 85;
const POP = Uint8Array.from({ length: 256 }, (_, n) => n.toString(2).replaceAll('0', '').length);
const NEIGHBORS = Array.from({ length: 64 }, (_, i) =>
  [i - 8, i + 8, ...(i % 8 ? [i - 1] : []), ...(i % 8 < 7 ? [i + 1] : [])].filter(
    (j) => j >= 0 && j < 64,
  ),
);
const Parity = (i: number) => ((i >> 3) + (i % 8)) % 2;
const Mask = (i: number) => (Parity(i) ? ODD : EVEN);
const Digit = (bit: number) => 32 - Math.clz32(bit);

// FNV-1a over UTF-8; Mulberry32 uses only specified 32-bit integer operations.
export function Random(seed: string): () => number {
  let state = 2166136261;
  for (const byte of new TextEncoder().encode(seed))
    state = Math.imul(state ^ byte, 16777619) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function Shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
function Units(regions: Uint8Array): number[][] {
  const units = Array.from({ length: 24 }, () => [] as number[]);
  for (let i = 0; i < 64; i++) {
    units[i >> 3].push(i);
    units[8 + (i % 8)].push(i);
    units[16 + regions[i]]?.push(i);
  }
  return units;
}
function Connected(regions: Uint8Array, region: number): boolean {
  const start = regions.indexOf(region);
  if (start < 0) return false;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length)
    for (const next of NEIGHBORS[stack.pop()!]) {
      if (regions[next] === region && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  return seen.size === 8;
}
export function ValidateRegions(regions: Uint8Array): boolean {
  return (
    regions.length === 64 &&
    regions.every((r) => r < 8) &&
    Array.from({ length: 8 }, (_, r) => r).every((r) => {
      const cells = Array.from(regions.keys()).filter((i) => regions[i] === r);
      return (
        cells.length === 8 &&
        cells.filter((i) => Parity(i) === 0).length === 4 &&
        Connected(regions, r)
      );
    })
  );
}
function Layout(random: () => number): Uint8Array | null {
  const regions = Uint8Array.from(
    { length: 64 },
    (_, i) => Math.floor(i / 16) * 2 + Math.floor((i % 8) / 4),
  );
  let exchanges = 0;
  for (let attempt = 0; attempt < 4096 && exchanges < 64; attempt++) {
    const a = Math.floor(random() * 64),
      b = Math.floor(random() * 64);
    const ra = regions[a],
      rb = regions[b];
    if (
      ra === rb ||
      Parity(a) !== Parity(b) ||
      !NEIGHBORS[a].some((i) => regions[i] === rb) ||
      !NEIGHBORS[b].some((i) => regions[i] === ra)
    )
      continue;
    regions[a] = rb;
    regions[b] = ra;
    if (Connected(regions, ra) && Connected(regions, rb)) exchanges++;
    else {
      regions[a] = ra;
      regions[b] = rb;
    }
  }
  let irregular = 0;
  for (let r = 0; r < 8; r++) {
    const cells = Array.from(regions.keys()).filter((i) => regions[i] === r);
    const rows = cells.map((i) => i >> 3),
      cols = cells.map((i) => i % 8);
    if (
      (Math.max(...rows) - Math.min(...rows) + 1) * (Math.max(...cols) - Math.min(...cols) + 1) !==
      8
    )
      irregular++;
  }
  return irregular >= 4 ? regions : null;
}
interface SearchResult {
  count: number;
  exhausted: boolean;
  solution?: Uint8Array;
}
function Search(
  regions: Uint8Array,
  givens: Uint8Array,
  limit: number,
  budget: number,
  random?: () => number,
): SearchResult {
  const values = givens.slice(),
    used = new Uint16Array(24);
  let nodes = 0,
    count = 0,
    exhausted = false;
  let solution: Uint8Array | undefined;
  if (givens.length !== 64 || regions.length !== 64) return { count: 0, exhausted: false };
  for (let i = 0; i < 64; i++) {
    if (regions[i] > 7 || values[i] > 8) return { count: 0, exhausted: false };
    if (!values[i]) continue;
    const bit = 1 << (values[i] - 1),
      row = i >> 3,
      col = 8 + (i % 8),
      region = 16 + regions[i];
    if (!(bit & Mask(i)) || (used[row] | used[col] | used[region]) & bit)
      return { count: 0, exhausted: false };
    used[row] |= bit;
    used[col] |= bit;
    used[region] |= bit;
  }
  function Visit(): void {
    if (++nodes > budget) {
      exhausted = true;
      return;
    }
    let cell = -1,
      candidates = 0,
      size = 9;
    for (let i = 0; i < 64; i++)
      if (!values[i]) {
        const mask = Mask(i) & ~(used[i >> 3] | used[8 + (i % 8)] | used[16 + regions[i]]);
        const n = POP[mask];
        if (!n) return;
        if (n < size) {
          cell = i;
          candidates = mask;
          size = n;
          if (n === 1) break;
        }
      }
    if (cell < 0) {
      count++;
      solution ??= values.slice();
      return;
    }
    const bits: number[] = [];
    for (let bit = 1; bit <= 128; bit <<= 1) if (candidates & bit) bits.push(bit);
    if (random) Shuffle(bits, random);
    const row = cell >> 3,
      col = 8 + (cell % 8),
      region = 16 + regions[cell];
    for (const bit of bits) {
      values[cell] = Digit(bit);
      used[row] |= bit;
      used[col] |= bit;
      used[region] |= bit;
      Visit();
      values[cell] = 0;
      used[row] ^= bit;
      used[col] ^= bit;
      used[region] ^= bit;
      if (exhausted || count >= limit) return;
    }
  }
  Visit();
  return { count, exhausted, solution };
}
export function CountSolutions(
  regions: Uint8Array,
  givens: Uint8Array,
  node_budget = 50_000,
): 0 | 1 | 2 | 'budget-exhausted' {
  if (!ValidateRegions(regions)) return 0;
  const result = Search(regions, givens, 2, node_budget);
  return result.exhausted ? 'budget-exhausted' : (result.count as 0 | 1 | 2);
}

/** Internal candidate deduction, also exercised with isolated technique fixtures. */
export function FindSubsetElimination(
  unit: number[],
  masks: Uint16Array,
  values: Uint8Array,
  n: 2 | 3,
): { cells: number[]; bits: number; technique: Technique } | null {
  const empty = unit.filter((i) => !values[i]);
  const combinations = n === 2 ? PAIRS : TRIPLES;
  for (const indices of combinations) {
    if (indices[n - 1] >= empty.length) continue;
    const cells = indices.map((i) => empty[i]),
      bits = cells.reduce((mask, i) => mask | masks[i], 0);
    if (POP[bits] !== n) continue;
    const targets = empty.filter((i) => !cells.includes(i) && masks[i] & bits);
    if (targets.length)
      return { cells: targets, bits, technique: n === 2 ? 'naked-pair' : 'naked-triple' };
  }
  for (const indices of combinations) {
    const bits = indices.reduce((mask, d) => mask | (1 << d), 0);
    if (unit.some((i) => values[i] && masks[i] & bits)) continue;
    const cells = empty.filter((i) => masks[i] & bits);
    if (cells.length !== n || indices.some((d) => !cells.some((i) => masks[i] & (1 << d))))
      continue;
    const targets = cells.filter((i) => masks[i] & (ALL ^ bits));
    if (targets.length)
      return {
        cells: targets,
        bits: ALL ^ bits,
        technique: n === 2 ? 'hidden-pair' : 'hidden-triple',
      };
  }
  return null;
}

export function RatePuzzle(
  regions: Uint8Array,
  givens: Uint8Array,
  maximum: Difficulty = 'hard',
): Rating {
  const steps: Deduction[] = [];
  const result: Rating = { solved: false, invalid: false, difficulty: 'easy', steps };
  if (!ValidateRegions(regions) || givens.length !== 64 || givens.some((v) => v > 8))
    return { ...result, invalid: true };
  const units = Units(regions),
    values = givens.slice();
  const peers = Array.from({ length: 64 }, (_, i) =>
    [...new Set([...units[i >> 3], ...units[8 + (i % 8)], ...units[16 + regions[i]]])].filter(
      (j) => j !== i,
    ),
  );
  const masks = Uint16Array.from(values, (v, i) => (v ? 1 << (v - 1) : Mask(i)));
  for (let i = 0; i < 64; i++)
    if (values[i]) {
      if (!(masks[i] & Mask(i)) || peers[i].some((j) => values[j] === values[i]))
        return { ...result, invalid: true };
      for (const j of peers[i]) if (!values[j]) masks[j] &= ~masks[i];
    }
  function Record(technique: Technique, cells: number[], digits: number[]) {
    steps.push({ technique, cells, digits });
    if (['naked-triple', 'hidden-triple', 'x-wing'].includes(technique)) result.difficulty = 'hard';
    else if (
      technique !== 'single' &&
      technique !== 'hidden-single' &&
      result.difficulty === 'easy'
    )
      result.difficulty = 'medium';
  }
  function Place(cell: number, bit: number, technique: Technique) {
    values[cell] = Digit(bit);
    masks[cell] = bit;
    for (const j of peers[cell]) if (!values[j]) masks[j] &= ~bit;
    Record(technique, [cell], [Digit(bit)]);
  }
  function Eliminate(cells: number[], bits: number, technique: Technique): boolean {
    const changed = cells.filter((i) => !values[i] && masks[i] & bits);
    if (!changed.length) return false;
    for (const i of changed) masks[i] &= ~bits;
    Record(
      technique,
      changed,
      Array.from({ length: 8 }, (_, i) => i + 1).filter((d) => bits & (1 << (d - 1))),
    );
    return true;
  }
  function Singles(): boolean {
    for (let i = 0; i < 64; i++)
      if (!values[i] && POP[masks[i]] === 1) {
        Place(i, masks[i], 'single');
        return true;
      }
    for (const unit of units)
      for (let bit = 1; bit <= 128; bit <<= 1) {
        if (unit.some((i) => values[i] && masks[i] === bit)) continue;
        const cells = unit.filter((i) => !values[i] && masks[i] & bit);
        if (cells.length === 1) {
          Place(cells[0], bit, 'hidden-single');
          return true;
        }
      }
    return false;
  }
  function Locked(): boolean {
    for (let u = 0; u < 24; u++)
      for (let bit = 1; bit <= 128; bit <<= 1) {
        const cells = units[u].filter((i) => !values[i] && masks[i] & bit);
        if (cells.length < 2) continue;
        for (let v = 0; v < 24; v++) {
          if (u === v || !cells.every((i) => units[v].includes(i))) continue;
          if (
            Eliminate(
              units[v].filter((i) => !units[u].includes(i)),
              bit,
              'locked',
            )
          )
            return true;
        }
      }
    return false;
  }
  function Subsets(n: 2 | 3): boolean {
    for (const unit of units) {
      const deduction = FindSubsetElimination(unit, masks, values, n);
      if (deduction && Eliminate(deduction.cells, deduction.bits, deduction.technique)) return true;
    }
    return false;
  }
  function XWing(): boolean {
    for (const offset of [0, 8])
      for (let bit = 1; bit <= 128; bit <<= 1) {
        for (let a = 0; a < 7; a++) {
          const cells_a = units[offset + a].filter((i) => !values[i] && masks[i] & bit);
          if (cells_a.length !== 2) continue;
          const cross = cells_a.map((i) => (offset === 0 ? i % 8 : i >> 3));
          for (let b = a + 1; b < 8; b++) {
            const cells_b = units[offset + b].filter((i) => !values[i] && masks[i] & bit);
            if (
              cells_b.length !== 2 ||
              !cells_b.every((i) => cross.includes(offset === 0 ? i % 8 : i >> 3))
            )
              continue;
            const targets = cross
              .flatMap((c) => units[(offset === 0 ? 8 : 0) + c])
              .filter((i) => !cells_a.includes(i) && !cells_b.includes(i));
            if (Eliminate(targets, bit, 'x-wing')) return true;
          }
        }
      }
    return false;
  }
  for (let iteration = 0; iteration < 1024; iteration++) {
    if (
      masks.some((m) => !m) ||
      units.some((unit) => unit.reduce((mask, i) => mask | masks[i], 0) !== ALL)
    ) {
      result.invalid = true;
      break;
    }
    if (values.every((v) => v !== 0)) {
      result.solved = true;
      break;
    }
    if (Singles()) continue;
    if (maximum === 'easy') break;
    if (Locked() || Subsets(2)) continue;
    if (maximum === 'medium') break;
    if (Subsets(3) || XWing()) continue;
    break;
  }
  return result;
}
const PAIRS: number[][] = [],
  TRIPLES: number[][] = [];
for (let a = 0; a < 8; a++)
  for (let b = a + 1; b < 8; b++) {
    PAIRS.push([a, b]);
    for (let c = b + 1; c < 8; c++) TRIPLES.push([a, b, c]);
  }

export function GeneratePuzzle(
  seed: string,
  difficulty: Difficulty,
  minimum_clues = 0,
  maximum_attempts = 8192,
): Puzzle | null {
  const target = { easy: 28, medium: 20, hard: 12 }[difficulty];
  for (let attempt = 0; attempt < maximum_attempts; attempt++) {
    const Stream = (stage: string) =>
      Random(JSON.stringify([GENERATOR_VERSION, seed, difficulty, stage, attempt]));
    const regions = Layout(Stream('regions'));
    if (!regions) continue;
    const full = Search(regions, new Uint8Array(64), 1, 50_000, Stream('solution'));
    if (!full.solution || full.exhausted) continue;
    const solution = full.solution,
      givens = solution.slice();
    const order = Shuffle(
      Array.from({ length: 64 }, (_, i) => i),
      Stream('removal'),
    );
    let clues = 64;
    for (const cell of order) {
      if (clues <= minimum_clues) break;
      const old = givens[cell];
      givens[cell] = 0;
      const search = Search(regions, givens, 2, 50_000);
      if (search.exhausted || search.count !== 1) {
        givens[cell] = old;
        continue;
      }
      clues--;
      if (clues > Math.max(target, minimum_clues)) continue;
      // Cheaper lower-tier check rejects most candidates without running advanced logic.
      if (
        difficulty !== 'easy' &&
        RatePuzzle(regions, givens, difficulty === 'hard' ? 'medium' : 'easy').solved
      )
        continue;
      const rating = RatePuzzle(regions, givens, difficulty);
      if (rating.solved && !rating.invalid && rating.difficulty === difficulty)
        return {
          version: GENERATOR_VERSION,
          seed,
          difficulty,
          clue_count: clues,
          rating,
          regions: regions.slice(),
          givens: givens.slice(),
          solution: solution.slice(),
        };
    }
  }
  return null;
}
export function GenerateDailySet(seed: string): GenerationResult {
  const hard = GeneratePuzzle(seed, 'hard');
  if (!hard) return { ok: false, error: 'generation-exhausted', difficulty: 'hard' };
  const medium = GeneratePuzzle(seed, 'medium', hard.clue_count + 1);
  if (!medium) return { ok: false, error: 'generation-exhausted', difficulty: 'medium' };
  const easy = GeneratePuzzle(seed, 'easy', medium.clue_count + 1);
  if (!easy) return { ok: false, error: 'generation-exhausted', difficulty: 'easy' };
  return { ok: true, puzzles: { easy, medium, hard } };
}
