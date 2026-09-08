# Daily Chessdoku

A static, browser-generated collection of daily 8×8 Chessdoku puzzles. Choose one of the last seven dates, then download an easy, medium, or hard puzzle and its separate solution. Each download is a single vector US Letter PDF.

## Run locally

Use Node.js 22.12 or newer and npm:

```sh
npm ci
npm run dev
```

Open the address printed by Vite. No backend, account, API key, or scheduled job is needed. The first visit to a date generates its puzzles in a Web Worker; revisiting it uses a small in-memory cache. Closing or refreshing the page discards that cache.

## Rules and difficulty

Every row, column, and connected bold-outlined region contains the digits 1–8 exactly once. White cells contain even digits and gray cells contain odd digits. There are no chess movement rules.

All puzzles have exactly one solution and can be solved logically without guessing:

- **Easy:** naked and hidden singles.
- **Medium:** also requires locked candidates or pairs.
- **Hard:** stalls with the medium techniques and requires an X-Wing; the solver also supports triples.

The generator tries clue targets of 28, 20, and 12, but accepts by logical rating. Typical medium and hard puzzles have substantially fewer clues. Every daily set has strictly decreasing clue counts. Ratings describe supported techniques, not a guarantee of a particular human solving time.

Layouts start as 2×4 regions, then exchange boundary cells while preserving connectivity and four cells of each parity per region. Completed layouts have at least four nonrectangular regions. Search uses MRV backtracking and counts up to two solutions when removing a clue. Generation has a deterministic limit of 8,192 attempts per difficulty and 50,000 nodes per exact search. An exhausted search never counts as proof of uniqueness; exhausted generation displays an error rather than an unverified puzzle.

## Reproduce a puzzle

The default seed is the visitor's **local** calendar date, `YYYY-MM-DD`. A given seed and generator version produces the same puzzles on all supported browsers. The selected day updates across local midnight, including when returning to the tab.

Add a query parameter to test another seed:

```text
http://localhost:5173/?seed=example
http://localhost:5173/?seed=2026-06-10
```

Unicode and empty seeds are supported. Use URL encoding for reserved characters. Selecting a date clears the override. The PDF includes seed and generator version; Unicode seed characters are escaped in printed text and preserved in PDF metadata.

The PRNG is Mulberry32, seeded with FNV-1a over UTF-8. Each stage derives a stream from a JSON array of version, seed, difficulty, stage, and attempt. Changes to the generation algorithm or traversal order must increment `GENERATOR_VERSION`. Old puzzles are not archived across generator versions.

## Engine API

`src/engine.ts` exports `GenerateDailySet(seed): GenerationResult`, `GeneratePuzzle(seed, difficulty, minimum_clues?, maximum_attempts?)`, `CountSolutions(regions, givens, node_budget?)`, `RatePuzzle(regions, givens, maximum?)`, and `ValidateRegions(regions)`.

`Puzzle` includes `version`, `seed`, `difficulty`, `clue_count`, `rating`, and three separate 64-element `Uint8Array`s: `regions` (0–7), `givens` (0 for empty), and `solution` (1–8). Arrays use row-major order. `GenerationResult` is either `{ ok: true, puzzles }` or `{ ok: false, error: 'generation-exhausted', difficulty }`. `CountSolutions` returns `0`, `1`, `2` (at least two), or `'budget-exhausted'`.

The worker owns temporary search memory. Returned puzzle arrays are copied; callers own them. `CreatePuzzlePdf(puzzle, 'puzzle' | 'solution')` returns newly allocated PDF bytes. SVG previews and PDFs use shared boundary geometry. PDF code loads only when a download is requested. Downloads release their temporary object URLs after initiation.

## Validate

```sh
npm test
npx playwright install --with-deps chromium firefox webkit
npm run test:e2e
npm run build
npm run validate -- 370
```

The corpus command checks 365 consecutive 2026 dates and five custom seeds. It writes a JSON report under `docs/validation/`. Optional second numeric argument selects the starting offset, allowing separate batches. It verifies uniqueness with an independent Algorithm X exact-cover implementation as well as the engine solver. The routine test suite covers 20 representative seeds, including a seed that exceeded the original attempt limit.

Browser tests build the site and run Chromium, Firefox, and WebKit against the production files at a `/chessdoku/` subpath. On Linux, Playwright requires its browser system dependencies; CI installs these on Ubuntu. Tests cover determinism, date navigation, worker cancellation, downloads, mobile layout, and local midnight/DST behavior. Zig is not used.

## Deploy to GitHub Pages

1. Push this project to the GitHub repository's `master` branch.
2. In **Settings → Pages**, select **GitHub Actions** as the source.
3. The included workflow tests, builds, and publishes `dist/` on pushes to `master`. Pull requests run verification without deploying.

The workflow is named **Verify and deploy Pages** in the repository's **Actions** tab. It is not a template to select in Pages settings. To run it manually, open that workflow and choose **Run workflow**; the workflow file must exist on the repository's default branch.

Vite uses relative asset paths, so the build works at either an account root or a repository subpath without knowing the repository name. For a fixed hosting prefix, set `BASE_PATH=/your-repository/` when building. The site uses no client-side pathname routes or externally hosted runtime dependencies.

## Reference

The supplied rules and example PDFs are in `variants/`. The example is used only as a regression fixture; published puzzles and region shapes are generated afresh. The saved implementation plan is in `docs/plans/daily-chessdoku.md`.
