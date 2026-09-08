# Daily Chessdoku Gift Website

## Summary

Build a static TypeScript website offering three daily 8×8 Chessdoku puzzles: easy, medium, and hard. Each puzzle has newly generated irregular regions, exactly one solution, and an individual puzzle PDF and solution PDF.

The first implementation step saves this plan to `docs/plans/daily-chessdoku.md`. Use vanilla TypeScript, Vite, and CSS. Generate puzzles entirely in a browser worker, with no backend or daily deployment requirement. Zig instructions do not apply.

## Puzzle generation and difficulty

- Follow the supplied rules: eight rows, columns, and regions, each containing digits 1–8 exactly once. Each region has eight orthogonally connected cells. The top-left cell is white; white cells contain even digits and gray cells contain odd digits.
- Generate region layouts by starting with 2×4 rectangles and exchanging same-parity boundary cells between neighboring regions. Accept exchanges only when both regions remain connected. Require at least four nonrectangular regions in the finished layout.
- Fill the generated layout using randomized backtracking, bitmask candidates, and selection of the cell with the fewest candidates. Reject unsatisfiable layouts and continue through deterministic attempts.
- Remove clues in seeded order. After each proposed removal, count solutions up to two; retain the removal only when exactly one solution is proven.
- Implement a separate logical solver that records deductions. Its technique sets define difficulty:

| Level  | Acceptance rule                                                                           |
| ------ | ----------------------------------------------------------------------------------------- |
| Easy   | Solvable with naked and hidden singles.                                                   |
| Medium | Requires locked candidates or naked/hidden pairs; solvable using these plus singles.      |
| Hard   | Requires naked/hidden triples or X-Wing; solvable using these plus the medium techniques. |

- Apply parity restrictions throughout both solvers. Require medium puzzles to stall under the easy solver and hard puzzles to stall under the medium solver.
- Start clue removal toward targets of 28, 20, and 12 clues respectively. These are search targets; logical rating determines acceptance. Accept daily sets only when easy has more clues than medium and medium has more than hard.
- Search alternative layouts and removal orders when a candidate misses its rating. Use fixed search-node and attempt budgets rather than timing-dependent decisions. Exhausted searches return an explicit failure; they never establish uniqueness or justify a lower difficulty label.
- Validate generation yield early, before completing the website. Three reliable difficulty levels are a release requirement; any inability to achieve that will be reported with measured results.

## Interfaces, determinism, and allocations

Expose these engine types and functions:

- `Difficulty = "easy" | "medium" | "hard"`.
- `Puzzle`: generator version, seed, difficulty, clue count, logical rating, and three row-major arrays: `regions`, `givens`, and `solution`.
- Each array is a 64-element `Uint8Array`. Region IDs are 0–7; digits are 1–8; zero represents an empty given.
- `DailySet`: one `Puzzle` per difficulty.
- `GenerationResult`: either a completed `DailySet` or a typed generation failure.
- `GenerateDailySet(seed: string): GenerationResult`.
- `CountSolutions(regions, givens)`: returns zero, one, two-or-more, or budget-exhausted.
- `RatePuzzle(regions, givens)`: returns the solved/stalled status, required difficulty, and deduction trace.
- `CreatePuzzlePdf(puzzle, kind): Promise<Uint8Array>`, where `kind` is `"puzzle"` or `"solution"`.

Use a documented integer PRNG and stable seed hashing. Derive independent random streams from generator version, seed, difficulty, generation stage, and attempt number. Fix traversal and tie-breaking order so browser scheduling cannot affect results.

The worker owns reusable search buffers and copies completed puzzle arrays into results. The UI keeps an in-memory cache for the seven displayed dates. PDF generation allocates bytes on demand and revokes download object URLs afterward.

Default seeds are local calendar dates formatted `YYYY-MM-DD`. Support `?seed=example` for reproducible testing; show an override indicator and clear it when a date is selected. Generator updates may change old puzzles; preserve reproducibility within a generator version without compatibility wrappers or migrations.

## Website, downloads, and deployment

- Build a minimal black-and-white page with a horizontally scrollable seven-day date selector, today selected initially, and accessible previous/next controls. Support keyboard navigation and touch without automatic movement.
- Show three labeled puzzle cards for the selected date. Generate only the selected day, with loading and failure states. Cancel obsolete worker requests when switching dates.
- Render previews as SVG with gray odd cells, white even cells, thin cell lines, and bold region boundaries. Show the rules near the previews.
- Give each card separate **Download puzzle** and **Download solution** buttons. Keep solutions hidden in the page.
- Produce one US Letter page per download, containing a large vector grid, date, difficulty, and brief rules. Solution pages are clearly labeled. Use shared grid geometry for SVG and PDF rendering; `pdf-lib` supplies vector drawing and text. [PDF drawing API](https://pdf-lib.js.org/docs/api/classes/pdfpage)
- Refresh the available dates when the local day changes, including when returning to an open tab.
- Bundle dependencies locally. Use Vite's worker support and configure GitHub Pages deployment through Actions, including the repository base path. [Vite workers](https://vite.dev/guide/features.html#web-workers), [Pages deployment](https://vite.dev/guide/static-deploy.html#github-pages)
- Add a README covering development, seed overrides, difficulty definitions, and Pages setup. Prepare the deployment workflow; actual publication requires a GitHub repository, which is not configured in this workspace.

## Validation and acceptance

- Use Vitest for engine tests and Playwright for browser flows.
- Transcribe the supplied example as a regression fixture; verify its completed solution and count the example puzzle's solutions.
- Test connected, equal-sized regions; parity; row/column/region validity; clue preservation; and independent uniqueness verification.
- Include focused deduction fixtures for every supported technique, plus unsatisfiable, ambiguous, and exhausted-search cases.
- Verify deterministic regeneration across repeated calls, generation order, and Chromium/Firefox/WebKit.
- Validate all three difficulty levels over 365 consecutive date seeds and additional custom seeds. Record generation failures, clue counts, technique usage, and runtime before release; retain a smaller representative corpus in routine CI.
- Exercise seven-day navigation, midnight and daylight-saving transitions, seed overrides, cancellation, downloads, and deployment beneath a repository subpath.
- Inspect printed PDFs for readable digits, clear region boundaries, sufficient writing space, and correct separation of puzzles and solutions.
- Require `npm test`, `npm run test:e2e`, and `npm run build` to pass. No Zig builds are required.

## Implementation findings

- Generation proceeds hard, medium, then easy so the previous clue count supplies the next minimum. Each difficulty still has independent seeded streams.
- The complete 370-seed corpus passed with 8,192 candidate attempts per difficulty and 50,000 search nodes per exact search. The initial 2,000-attempt limit failed on 2026-06-10, now a permanent regression case.
- Parity restricts each digit group to four symbols, so triples and hidden pairs are often redundant after simpler techniques. Isolated candidate fixtures exercise these supported deductions; generated hard puzzles in the corpus require X-Wing.
- The independent verifier uses Algorithm X and shares no search implementation with the engine. Corpus results are saved in `docs/validation/`.
