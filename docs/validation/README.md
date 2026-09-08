# Generation validation

Generator version 1 was checked against 365 consecutive dates (2026-01-01 through 2026-12-31) and five custom seeds: test, 0, Dad ♥, the empty string, and 512 repeated letters.

All 370 daily sets passed: **1,110 puzzles** with valid regions, parity, complete solutions, unique solutions, logical ratings, and descending clue counts. Uniqueness was cross-checked using an independent Algorithm X solver.

The four JSON reports contain per-seed results, clue counts, techniques, and wall-clock generation times. They were run concurrently in four Node.js 22.14.0 processes on the development host; timings are indicative, not browser performance guarantees. Median daily generation was 798 ms; p95 3307 ms; maximum 8834 ms. Clue-count ranges were easy 28–28, medium 8–20, and hard 6–12.

The initial 2,000-attempt limit failed for 2026-06-10. Raising it to 8,192 produced a valid hard puzzle, and the complete corpus passed with that limit. This seed remains in the routine regression suite.

Regenerate using `npm run validate -- 370`. A corpus validates observed seeds; untested seeds can still exhaust the finite search budget, in which case the site reports failure without publishing an unverified puzzle.

The final production build also passed 12 browser tests across Chromium, Firefox, and WebKit, served beneath `/chessdoku/`. The unit suite passed 12 tests, including 20 representative daily seeds and isolated subset deductions. The Letter puzzle and solution PDFs were rendered and visually inspected, along with desktop and mobile screenshots.

On this Fedora host, WebKit required Ubuntu's ICU 74 and JPEG 8 libraries extracted under `/tmp/chessdoku-webkit-libs`. Its launcher replaces `LD_LIBRARY_PATH`, so the final browser run also preloaded those four library files using `LD_PRELOAD`. No system packages were modified. The Ubuntu CI workflow uses Playwright's normal `install --with-deps` setup instead.
