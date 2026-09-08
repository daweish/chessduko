import { expect, test } from '@playwright/test';
import { GenerateDailySet } from '../../src/engine';
import { RenderPuzzleSvg } from '../../src/grid';

// -----------------------------------------------------------------------------
// Tests

const seed = '2026-01-01';
const result = GenerateDailySet(seed);
if (!result.ok) throw new Error('Could not generate browser reference fixture');

test('deterministic worker output, six separate PDF downloads and seed override', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`?seed=${seed}`);
  await expect(page.locator('.puzzle-card')).toHaveCount(3);
  const svg = await page
    .locator('.grid-preview')
    .evaluateAll((elements) => elements.map((element) => element.innerHTML).join(''));
  // Browsers normalize serialization of SVG attributes; compare the actual grid data below.
  expect(svg.match(/<text /g)?.length).toBe(
    Object.values(result.puzzles).reduce((n, p) => n + p.clue_count, 0),
  );
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const texts = await page
      .locator(`[data-difficulty="${difficulty}"] svg text`)
      .evaluateAll((elements) =>
        elements.map((e) => [e.textContent, e.getAttribute('x'), e.getAttribute('y')]),
      );
    expect(texts).toEqual(
      Array.from(result.puzzles[difficulty].givens).flatMap((value, i) =>
        value ? [[String(value), String((i % 8) * 40 + 20), String((i >> 3) * 40 + 21)]] : [],
      ),
    );
    const paths = await page
      .locator(`[data-difficulty="${difficulty}"] svg line`)
      .evaluateAll((lines) =>
        lines.map((line) =>
          ['x1', 'y1', 'x2', 'y2', 'stroke-width'].map((a) => line.getAttribute(a)),
        ),
      );
    expect(paths).toHaveLength(144);
    const expected_svg = RenderPuzzleSvg(result.puzzles[difficulty]);
    const expected_lines = [
      ...expected_svg.matchAll(
        /<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)" stroke="[^"]+" stroke-width="([^"]+)"/g,
      ),
    ].map((m) => m.slice(1));
    expect(paths).toEqual(expected_lines);
    for (const kind of ['puzzle', 'solution']) {
      const download_event = page.waitForEvent('download');
      await page.getByRole('button', { name: `Download ${difficulty} ${kind} PDF` }).click();
      const download = await download_event;
      expect(download.suggestedFilename()).toBe(`chessdoku-${seed}-${difficulty}-${kind}-v1.pdf`);
      expect(await download.failure()).toBeNull();
    }
  }
  await expect(page.locator('#override')).toContainText(seed);
  await page.getByRole('button', { name: /, today$/ }).click();
  await expect(page.locator('#override')).toBeHidden();
  expect(new URL(page.url()).searchParams.has('seed')).toBe(false);
  expect(errors).toEqual([]);
});

test('seven dates, keyboard navigation, cancellation and cache', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T20:00:00Z') });
  await page.goto('./');
  const dates = page.locator('.date-button');
  await expect(dates).toHaveCount(7);
  await expect(dates.first()).toHaveAttribute('aria-label', '2026-01-01, today');
  await dates.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(dates.nth(1)).toBeFocused();
  await dates.nth(1).click();
  await dates.nth(2).click();
  await dates.first().click();
  await expect(page.locator('.puzzle-card')).toHaveCount(3);
  await page.screenshot({
    path: `test-results/desktop-${test.info().project.name}.png`,
    fullPage: true,
  });
  const original = await page.locator('.grid-preview').allInnerTexts();
  await dates.nth(1).click();
  await expect(page.locator('.puzzle-card')).toHaveCount(3);
  await dates.first().click();
  await expect(page.locator('.puzzle-card')).toHaveCount(3);
  expect(await page.locator('.grid-preview').allInnerTexts()).toEqual(original);
});

test('local midnight refresh and daylight-saving calendar dates', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-03-09T06:59:59Z') });
  await page.goto('./');
  await expect(page.locator('.date-button').first()).toHaveAttribute(
    'aria-label',
    '2026-03-08, today',
  );
  await page.clock.fastForward(2000);
  await expect(page.locator('.date-button').first()).toHaveAttribute(
    'aria-label',
    '2026-03-09, today',
  );
  await expect(page.locator('.date-button').nth(1)).toHaveAttribute('aria-label', '2026-03-08');
  await expect(page.locator('.date-button').nth(2)).toHaveAttribute('aria-label', '2026-03-07');
});

test('mobile layout keeps the page within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`?seed=${seed}`);
  await expect(page.locator('.puzzle-card')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button', { name: 'Download easy puzzle PDF' })).toBeVisible();
  await page.screenshot({
    path: `test-results/mobile-${test.info().project.name}.png`,
    fullPage: true,
  });
});
