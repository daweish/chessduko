import type { Puzzle } from './engine';
export interface GridLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thick: boolean;
}
export function GridLines(regions: Uint8Array): GridLine[] {
  const lines: GridLine[] = [];
  for (let row = 0; row <= 8; row++)
    for (let col = 0; col < 8; col++) {
      lines.push({
        x1: col,
        y1: row,
        x2: col + 1,
        y2: row,
        thick: row === 0 || row === 8 || regions[(row - 1) * 8 + col] !== regions[row * 8 + col],
      });
    }
  for (let col = 0; col <= 8; col++)
    for (let row = 0; row < 8; row++) {
      lines.push({
        x1: col,
        y1: row,
        x2: col,
        y2: row + 1,
        thick: col === 0 || col === 8 || regions[row * 8 + col - 1] !== regions[row * 8 + col],
      });
    }
  return lines.sort((a, b) => Number(a.thick) - Number(b.thick));
}
export function RenderPuzzleSvg(puzzle: Puzzle): string {
  const cell = 40;
  const squares = Array.from(
    { length: 64 },
    (_, i) =>
      `<rect x="${(i % 8) * cell}" y="${(i >> 3) * cell}" width="40" height="40" fill="${((i >> 3) + (i % 8)) % 2 ? '#d1d1d1' : '#fff'}"/>`,
  ).join('');
  const lines = GridLines(puzzle.regions)
    .map(
      (l) =>
        `<line x1="${l.x1 * cell}" y1="${l.y1 * cell}" x2="${l.x2 * cell}" y2="${l.y2 * cell}" stroke="#171717" stroke-width="${l.thick ? 3 : 0.6}" stroke-linecap="square"/>`,
    )
    .join('');
  const digits = Array.from(puzzle.givens, (v, i) =>
    v
      ? `<text x="${(i % 8) * cell + 20}" y="${(i >> 3) * cell + 21}" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="24" fill="#111">${v}</text>`
      : '',
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 324 324" role="img" aria-label="${puzzle.difficulty} Chessdoku puzzle preview">${squares}${lines}${digits}</svg>`;
}
