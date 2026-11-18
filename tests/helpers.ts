import { parseCsv } from '../src/core/reading/csv.ts';

/** The sample with one cell changed, found by CI name (first match) and column header. */
export function editSample(csv: string, name: string, column: string, value: string): string {
  const rows = parseCsv(csv);
  const at = rows[0]!.indexOf(column);
  const row = rows.find((cells) => cells[0] === name)!;
  row[at] = value;
  return rows.map((cells) => cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
}

/** The reference data without reference/record-teams: the people of every CI are asked, also on a Business Process (D195). */
export function withoutTeams<T extends Record<string, unknown>>(references: T): T {
  const copy = { ...references };
  delete copy['reference/record-teams'];
  return copy;
}
