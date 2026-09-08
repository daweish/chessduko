import { PDFDocument, StandardFonts, grayscale } from 'pdf-lib';
import type { Puzzle } from './engine';
import { GridLines } from './grid';
export type DownloadKind = 'puzzle' | 'solution';
export function DownloadName(puzzle: Puzzle, kind: DownloadKind): string {
  const seed = puzzle.seed.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'custom';
  return `chessdoku-${seed}-${puzzle.difficulty}-${kind}-v${puzzle.version}.pdf`;
}
export async function CreatePuzzlePdf(puzzle: Puzzle, kind: DownloadKind): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Chessdoku — ${puzzle.difficulty} ${kind}`);
  doc.setCreator('Daily Chessdoku');
  const page = doc.addPage([612, 792]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const DrawText = (text: string, x: number, y: number, size: number, strong = false) =>
    page.drawText(text, { x, y, size, font: strong ? bold : regular, color: grayscale(0.08) });
  DrawText('CHESSDOKU', 54, 733, 25, true);
  DrawText(
    `${puzzle.difficulty.toUpperCase()}${kind === 'solution' ? ' / SOLUTION' : ''}`,
    54,
    705,
    12,
    true,
  );
  // Standard PDF fonts use WinAnsi. Preserve arbitrary Unicode seeds in PDF metadata;
  // printable identification uses ASCII escapes for unsupported characters.
  const seed_label = puzzle.seed.replace(
    /[^\x20-\x7E]/gu,
    (c) => `\\u{${c.codePointAt(0)!.toString(16)}}`,
  );
  const label = `Seed: ${seed_label}`;
  for (let n = 0; n < Math.min(label.length, 210); n += 70)
    DrawText(label.slice(n, n + 70), 54, 683 - (n / 70) * 12, 9);
  const cell = 63,
    x = 54,
    top = 633;
  for (let i = 0; i < 64; i++)
    page.drawRectangle({
      x: x + (i % 8) * cell,
      y: top - ((i >> 3) + 1) * cell,
      width: cell,
      height: cell,
      color: grayscale(((i >> 3) + (i % 8)) % 2 ? 0.82 : 1),
    });
  for (const line of GridLines(puzzle.regions))
    page.drawLine({
      start: { x: x + line.x1 * cell, y: top - line.y1 * cell },
      end: { x: x + line.x2 * cell, y: top - line.y2 * cell },
      thickness: line.thick ? 2.8 : 0.55,
      color: grayscale(0.05),
    });
  const values = kind === 'solution' ? puzzle.solution : puzzle.givens;
  for (let i = 0; i < 64; i++)
    if (values[i]) {
      const text = String(values[i]);
      DrawText(
        text,
        x + (i % 8) * cell + (cell - regular.widthOfTextAtSize(text, 29)) / 2,
        top - (i >> 3) * cell - 42,
        29,
      );
    }
  DrawText('Fill every row, column, and bold-outlined region with 1–8, once each.', 54, 98, 10);
  DrawText('White cells: even numbers. Gray cells: odd numbers.', 54, 82, 10);
  DrawText(`${puzzle.clue_count} clues  /  Generator v${puzzle.version}`, 54, 53, 8);
  doc.setSubject(`Seed: ${puzzle.seed}; generator ${puzzle.version}; ${kind}`);
  return doc.save();
}
