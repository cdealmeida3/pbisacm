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

/**
 * The check packs as if every one were live (D346: only a live check asks people). For the tests of who is asked and of
 * the messages, which use proposed checks (Description, Mapping backlog) as examples of every route.
 */
export const asLive = <T extends { status: string }>(packs: T[]): T[] => packs.map((pack) => (pack.status === 'off' ? pack : { ...pack, status: 'live' }));
