// Right numbers, right times, right words in the browser (version 0.20.1): the tile and the sections count the same
// findings, a removed EPO load asks to run the checks again, Settings refuses impossible numbers, the pick dialog never
// offers "Load 0 reports", and a load without a folder says it is not saved. Invented data only.
// Run: node tests/browser/numbers.mjs (after npm run build).
import { join } from 'node:path';
import { card, loadLatest, more, open, root, sample, signIn, tiles } from './harness.mjs';

export async function numbers() {
  const { page, check, close, outDir } = await open('Numbers, times and words');

  console.log('== Team folder with the CI report and the EPO systems report ==');
  const p = await page();
  await p.evaluate(([c, e]) => Promise.all([window.__fs.put('reports/2026-11-11_cmdb_ci.csv', c), window.__fs.put('reports/2026-11-11_epo_systems.csv', e)]), [sample('cmdb_ci-sample.csv'), sample('epo-systems-sample.csv')]);
  await signIn(p, 'Test Manager', 'test.manager@example.com');
  await loadLatest(p);
  const t = await tiles(p);
  const tileNumber = Number((/CIs · ([\d,]+) findings? to solve/.exec(t) || ['', 'NaN'])[1].replace(/,/g, ''));
  const headers = await p.locator('[data-section-count]').allInnerTexts();
  // The sections count cards by state, not findings (D219): one number for one thing.
  check('the CI report tile says "findings to solve"; the sections count cards, not findings', tileNumber > 0 && headers.length === 3 && headers.every((text) => !/finding/.test(text)) && /\d+ to solve/.test(headers[0]), `tile ${tileNumber}: ${headers.join(' | ')}`);
  check('the load message counts the same findings as the tile', new RegExp(`${tileNumber} findings to solve on`).test(t), (t.match(/cmdb_ci\.csv \(CI report[^.]*\.[^•]*/) || [t])[0].slice(0, 300));
  check('no section says "All OK" while one of its cards is not tested', headers.every((text) => !/All OK/.test(text) || !/not tested/.test(text)), headers.join(' | '));
  check('the load message does not send the manager to "load the CI report again"', !/load the CI report again/i.test(t));
  check('the tile shows the time it was loaded in local time', /loaded by Test Manager, \d\d:\d\d/.test(t), (t.match(/loaded by[^·]*/) || [''])[0]);
  check('nothing changed after the checks ran: no amber line', !/changed after the checks ran/.test(t));

  console.log('== Remove the EPO load ==');
  await p.locator('#reports-title').locator('xpath=ancestor::section').locator('div', { hasText: /^EPO systems report/ }).getByRole('button', { name: 'Remove', exact: true }).first().click();
  await p.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await p.waitForTimeout(1200);
  let tt = await tiles(p);
  check('after the removal an amber line says the cards are old', /The EPO systems report changed after the checks ran\. The cards still show the old result\./.test(tt), tt.slice(0, 300));
  check('the EPO cards still show the old result', !/^EPO ≠ ServiceNow: Not tested/.test(await card(p, 'EPO ≠ ServiceNow')), await card(p, 'EPO ≠ ServiceNow'));
  await p.screenshot({ path: join(outDir, 'numbers-run-again.png') });
  await p.getByRole('button', { name: 'Check again' }).click();
  await p.waitForFunction(() => !/changed after the checks ran/.test(document.body.innerText), null, { timeout: 60000 });
  await p.waitForTimeout(800);
  tt = await tiles(p);
  check('Run the checks again: the amber line is gone', !/changed after the checks ran/.test(tt));
  const epoCard = await card(p, 'EPO ≠ ServiceNow');
  check('Run the checks again: the EPO cards are grey, not tested without an EPO systems report', /^EPO ≠ ServiceNow: Not tested/.test(epoCard) && /no EPO systems report/i.test(await p.locator('section button[aria-pressed][aria-label^="EPO ≠ ServiceNow:"]').getAttribute('data-tip')), epoCard);

  console.log('== Pick reports ==');
  await more(p, /Choose reports/);
  await p.waitForTimeout(800);
  const dialog = p.getByRole('dialog');
  for (const box of await dialog.locator('input[type=checkbox]:checked').all()) await box.uncheck();
  const pick = dialog.getByRole('button', { name: 'Load', exact: true });
  check('nothing ticked: the button reads "Load", grey, with "Tick a report to load" next to it, never "Load 0"', (await pick.count()) === 1 && await pick.isDisabled() && /Tick a report to load/.test(await dialog.innerText()) && !/Load 0/.test(await dialog.innerText()));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  if (await p.getByRole('dialog').count()) await p.getByRole('dialog').getByRole('button', { name: /Close/ }).first().click().catch(() => {});

  console.log('== Settings ==');
  await p.getByRole('button', { name: 'Settings', exact: true }).click();
  await p.getByRole('dialog').getByRole('tab', { name: 'Team' }).click();
  await p.getByLabel(/^Reminder after/).fill('-5');
  await p.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(400);
  const settings = (await p.getByRole('dialog').innerText()).replace(/\s+/g, ' ');
  check('Settings refuses -5 working days with a red line under the field', /Not saved\. A whole number from 1 to 30\./.test(settings), settings.slice(0, 200));
  const saved = await p.evaluate(() => window.__fs.get('data/settings.json').catch(() => ''));
  check('the refused number is not written to the team folder', !/"reminderDays":-5/.test(saved), saved.slice(0, 120));
  await p.getByLabel(/^Reminder after/).fill('5');
  await p.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForTimeout(600);
  check('a good number is saved and the dialog closes', (await p.getByRole('dialog').count()) === 0 && /"reminderDays":5/.test(await p.evaluate(() => window.__fs.get('data/settings.json'))));
  check('team folder: no page errors, no network request', p.errors.length === 0 && p.requests.length === 0, p.errors.concat(p.requests).join(' | ').slice(0, 300));

  console.log('== Report files only ==');
  const f = await page();
  await f.locator('input[type=file]').first().setInputFiles(join(root, 'samples', 'cmdb_ci-sample.csv'));
  await f.waitForSelector('section button[aria-pressed][aria-label]', { timeout: 20000 });
  await f.waitForTimeout(800);
  const ft = await tiles(f);
  check('without a folder the tile says "loaded just now, not saved", not "an earlier version"', /loaded just now, not saved/.test(ft) && !/earlier version/.test(ft), (ft.match(/Report of[^·]*·[^·]*/) || [ft])[0].slice(0, 200));
  check('report files only: no page errors, no network request', f.errors.length === 0 && f.requests.length === 0, f.errors.concat(f.requests).join(' | ').slice(0, 300));

  return close();
}

if (process.argv[1] === import.meta.filename) { const result = await numbers(); process.exit(result.failed.length ? 1 : 0); }
