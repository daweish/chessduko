import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { GeneratePuzzle } from '../src/engine';
import { CreatePuzzlePdf, DownloadName } from '../src/pdf';
import { GridLines, RenderPuzzleSvg } from '../src/grid';

// -----------------------------------------------------------------------------
// Tests

it('exports separate Letter-sized vector puzzle and solution documents', async () => {
  const puzzle = GeneratePuzzle('Dad ♥', 'easy')!;
  const original = puzzle.givens.slice();
  const puzzle_pdf = await CreatePuzzlePdf(puzzle, 'puzzle');
  const solution_pdf = await CreatePuzzlePdf(puzzle, 'solution');
  for (const [bytes, kind] of [
    [puzzle_pdf, 'puzzle'],
    [solution_pdf, 'solution'],
  ] as const) {
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(doc.getTitle()).toContain(kind);
    expect(doc.getSubject()).toContain('Dad ♥');
    expect(DownloadName(puzzle, kind)).toMatch(new RegExp(`^chessdoku-.*-easy-${kind}-v1.pdf$`));
  }
  expect(puzzle_pdf).not.toEqual(solution_pdf);
  expect(puzzle.givens).toEqual(original);
  expect(RenderPuzzleSvg(puzzle).match(/<text /g)?.length).toBe(puzzle.clue_count);
  const lines = GridLines(puzzle.regions);
  expect(lines).toHaveLength(144);
  expect(
    lines
      .filter(
        (l) =>
          (l.x1 === 0 && l.x2 === 0) ||
          (l.x1 === 8 && l.x2 === 8) ||
          (l.y1 === 0 && l.y2 === 0) ||
          (l.y1 === 8 && l.y2 === 8),
      )
      .every((l) => l.thick),
  ).toBe(true);
});
