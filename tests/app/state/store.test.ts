import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, localDay, localTime, readSettings, settingNumber, unusableSettings } from '../../../src/app/state/store.ts';
import type { Settings } from '../../../src/app/state/store.ts';

/*
 * The helpers of the app state that every screen uses: local time (F09) and the reading of the team settings (F11).
 */

test('every time on the screen is local: 21:30 UTC is 23:30 two hours ahead, and 22:30 UTC is already the next day (F09)', () => {
  const zone = process.env.TZ;
  process.env.TZ = 'Etc/GMT-2';
  try {
    // The journal keeps UTC, without a zone letter ("2025-03-12T21:30:00"), or with "Z".
    assert.equal(localTime('2025-03-12T21:30:00'), '12 Mar 2025 23:30');
    assert.equal(localTime('2025-03-12T22:30:00Z'), '13 Mar 2025 00:30');
    assert.equal(localTime('2025-03-12T22:30:00', true), '13 Mar 2025 00:30');
    assert.equal(localDay('2025-03-12T22:30:00'), '13 Mar 2025');
    // A day of this year has no year (D176).
    assert.equal(localDay(`${new Date().getFullYear()}-03-12T10:30:00`), '12 Mar');
    assert.equal(localDay('2025-03-12T22:30:00', true), '13 Mar 2025');
    // Today shows the time only.
    const now = new Date().toISOString().slice(0, 19);
    assert.match(localTime(now), /^\d\d:\d\d$/);
  } finally {
    if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone;
  }
});

test('the tile, the timeline, Activity and the verification record all print times through localTime (F09)', () => {
  const src = join(import.meta.dirname, '../../../src/app');
  for (const file of ['screens/reports/Reports.tsx', 'screens/case/CasePanel.tsx', 'screens/team/Pages.tsx', 'screens/audit/Audit.tsx']) {
    const text = readFileSync(join(src, file), 'utf8');
    assert.match(text, /localTime\(/, file);
    // A UTC time cut out of a journal time ("…T21:30" → "21:30") is never shown.
    assert.doesNotMatch(text, /(\.at|loadedAt|iso)\.slice\(11/, file);
  }
});

test('a number of the settings that is empty, not whole or out of its range is not used: the first value is (F11)', () => {
  for (const bad of [-5, 0, 2.5, 'abc', '', 31]) {
    assert.equal(settingNumber('reminderDays', bad), null, String(bad));
    const read = readSettings({ reminderDays: bad } as unknown as Partial<Settings>, DEFAULT_SETTINGS);
    assert.equal(read.reminderDays, DEFAULT_SETTINGS.reminderDays, String(bad));
  }
  assert.deepEqual(unusableSettings({ reminderDays: -5, staleDays: 7 } as Partial<Settings>), ['reminderDays']);
  assert.equal(settingNumber('maxReminders', 0), 0);
  assert.equal(settingNumber('reminderDays', '5'), 5);
  assert.equal(settingNumber('readyDays', 730), 730);
  assert.equal(settingNumber('readyDays', 731), null);
  assert.equal(readSettings({ staleDays: 14 }, DEFAULT_SETTINGS).staleDays, 14);
});
