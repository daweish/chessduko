// Independent Algorithm X verifier. Candidate rows cover cell, row-digit,
// column-digit and region-digit constraints. It shares no engine search code.
export function IndependentSolutions(
  regions: Uint8Array,
  givens: Uint8Array,
): { count: number; solution: Uint8Array | null } {
  const columns = new Map<number, Set<number>>();
  const rows: number[][] = [],
    assignments: [number, number][] = [];
  for (let c = 0; c < 256; c++) columns.set(c, new Set());
  for (let cell = 0; cell < 64; cell++)
    for (let digit = 1; digit <= 8; digit++) {
      if ((givens[cell] && givens[cell] !== digit) || digit % 2 !== ((cell >> 3) + (cell % 8)) % 2)
        continue;
      const row = rows.length;
      const constraints = [
        cell,
        64 + (cell >> 3) * 8 + digit - 1,
        128 + (cell % 8) * 8 + digit - 1,
        192 + regions[cell] * 8 + digit - 1,
      ];
      rows.push(constraints);
      assignments.push([cell, digit]);
      for (const c of constraints) columns.get(c)!.add(row);
    }
  let count = 0;
  let solution: Uint8Array | null = null;
  const chosen: number[] = [];
  function Visit(): void {
    if (!columns.size) {
      count++;
      if (!solution) {
        solution = new Uint8Array(64);
        for (const row of chosen) solution[assignments[row][0]] = assignments[row][1];
      }
      return;
    }
    let best: Set<number> | undefined;
    for (const options of columns.values()) if (!best || options.size < best.size) best = options;
    if (!best?.size) return;
    for (const row of [...best]) {
      const removed: [number, Set<number>][] = [];
      chosen.push(row);
      for (const column of rows[row]) {
        const options = columns.get(column)!;
        for (const option of options)
          for (const other of rows[option])
            if (other !== column) columns.get(other)?.delete(option);
        columns.delete(column);
        removed.push([column, options]);
      }
      Visit();
      for (const [column, options] of removed.reverse()) {
        columns.set(column, options);
        for (const option of options)
          for (const other of rows[option]) if (other !== column) columns.get(other)?.add(option);
      }
      chosen.pop();
      if (count >= 2) return;
    }
  }
  Visit();
  return { count, solution };
}
