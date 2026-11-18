import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportsLine } from '../../../src/app/view/tiles.ts';
import type { ReportTile } from '../../../src/app/view/tiles.ts';

/* The Reports line of the first screen (version 0.23, F26). */

const tile = (label: string, date: string | null, stale = false, ageDays = 0): ReportTile => ({
  type: { kind: 'ci', label, hint: '', columns: [] } as unknown as ReportTile['type'],
  load: date ? { file: `${label}.csv`, date, loadedByName: 'A', loadedAt: `${date}T08:10:00Z`, summary: '', details: [] } : null,
  ageDays, stale
});
const day = (iso: string): string => iso.slice(5);
const time = (at: string): string => at.slice(11, 16);

test('every report loaded and fresh: one line, closed', () => {
  const line = reportsLine([tile('CI report', '2026-11-12'), tile('EPO systems report', '2026-11-11')], '', day, time);
  assert.deepEqual(line, { text: '2 reports · 11-12 · fresh', tip: 'Newest report of 11-12, loaded 08:10', warning: '', opens: false });
});

test('a report missing or old: the line says so once and opens', () => {
  const missing = reportsLine([tile('CI report', '2026-11-12'), tile('Solusi contract file', null)], '', day, time);
  assert.equal(missing.text, '1 of 2 reports · 11-12 · not loaded: Solusi contract file');
  assert.equal(missing.opens, true);
  const old = reportsLine([tile('CI report', '2026-11-05', true, 7), tile('EPO systems report', '2026-11-04', true, 8)], '', day, time);
  assert.equal(old.warning, 'The CI report is 7 days old and the EPO systems report is 8 days old. Load a newer one before you write to people.');
  assert.equal(old.opens, true);
  assert.ok(!/fresh/.test(old.text));
});

test('a report changed after the checks ran: the line opens', () => {
  const line = reportsLine([tile('CI report', '2026-11-12')], 'The EPO systems report changed after the checks ran.', day, time);
  assert.equal(line.opens, true);
  assert.ok(!/fresh/.test(line.text));
});
