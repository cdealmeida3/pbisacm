// Settings, Audit and the last polish in the browser (version 0.24.0): Settings in four parts with a set-up list, a save
// that writes only what changed, the Audit tables, the lifecycle review, one date format and the start screen. Invented data only.
// Run: node tests/browser/settings.mjs (after npm run build).
import { join } from 'node:path';
import { loadLatest, open, sample, signIn, startDemo } from './harness.mjs';

const ISO = /\b\d{4}-\d{2}-\d{2}\b(?![_\w.-]*\.(csv|xlsx|json))/;
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ');

export async function settings() {
  const { page, check, close, outDir } = await open('Settings, Audit and the last polish');

  console.log('== Start screen ==');
  const f = await page({ viewport: { width: 1366, height: 768 } });
  const main = await f.getByRole('button').evaluateAll((els) => els.map((el) => `${el.textContent.trim()}:${el.className.includes('bg-accent') ? 'main' : 'link'}`));
  check('the start screen: one main button Open folder, then the links Open files and Try the demo', main.join(' | ') === 'Open folder:main | Open files:link | Try the demo:link', main.join(' | '));

  console.log('== Team folder: the set-up list ==');
  for (const file of ['cmdb_ci-sample.csv', 'cmdb_rel_ci-sample.csv', 'epo-systems-sample.csv']) await f.evaluate(([name, content]) => window.__fs.put(`reports/2026-11-11_${name}`, content), [file, sample(file)]);
  await signIn(f, 'Test Manager', 'test.manager@example.com');
  const gear = f.locator('header').getByRole('button', { name: 'Settings', exact: true });
  const counter = async () => `${await gear.getAttribute('data-setup')}|${(await gear.locator('xpath=..').innerText()).trim()}`;
  check('before a report is loaded Settings in the header counts the set-up steps: 5 left', (await counter()) === '5 steps left|5', await counter());
  check('…and My day offers Load, once', (await f.locator('main').getByRole('button', { name: 'Load', exact: true }).count()) === 1);
  await loadLatest(f);
  const chip = gear;
  check('with a report Settings still counts "5 steps left"', (await counter()) === '5 steps left|5', await counter());
  await chip.click();
  const dialog = f.getByRole('dialog');
  const box = await dialog.boundingBox();
  check('Settings is a wide window', box && box.width > 700, String(box?.width));
  const tabs = await dialog.getByRole('tab').allInnerTexts();
  check('four parts: Set-up with its count, Me, Team, Mailboxes', tabs.map((tab) => tab.replace(/\s+/g, ' ').trim()).join(' | ') === 'Set-up 5 | Me | Team | Mailboxes', tabs.join(' | '));
  const steps = await dialog.locator('[aria-label="Set-up list"] button').evaluateAll((els) => els.map((el) => `${el.getAttribute('data-done')}:${el.innerText.replace(/\s+/g, ' ')}`));
  check('the set-up list has six lines, the team folder ticked, the ServiceNow address, the last one the Process Management team', steps.length === 6 && /The ServiceNow address is set/.test(steps[4]) && /The Process Management team has people/.test(steps[5]) && /^true:The team folder is chosen/.test(steps[0]) && steps.slice(1).every((line) => /^false:/.test(line)), steps.join(' || '));
  check('the list says "0 of 6 links pasted"', steps.some((line) => /0 of 6 links pasted/.test(line)));
  await f.screenshot({ path: join(outDir, 'settings-setup.png') });

  console.log('== A first save that changes nothing ==');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await f.waitForTimeout(500);
  const journal = async () => f.evaluate(async () => { const out = []; for (const path of await window.__fs.list()) if (/journal/.test(path)) out.push(await window.__fs.get(path)); return out.join('\n'); });
  const quiet = await journal();
  check('writes no line "Team settings changed" to Activity', !/Team settings changed/.test(quiet), quiet.slice(0, 200));

  console.log('== Each line opens its part ==');
  await f.getByRole('button', { name: 'Settings', exact: true }).click();
  await dialog.locator('[aria-label="Set-up list"] button', { hasText: 'The request links are pasted' }).click();
  check('the line of the request links opens Mailboxes', (await dialog.getByRole('tab', { name: 'Mailboxes' }).getAttribute('aria-selected')) === 'true');
  check('the names of the requests are shown, not typed', (await dialog.getByLabel(/^Name of the request/).count()) === 0 && (await dialog.getByText('Owned by - update', { exact: true }).count()) === 1);
  const links = dialog.getByLabel(/^Link of the request: /);
  check('six links can be typed', (await links.count()) === 6, String(await links.count()));
  for (let index = 0; index < 6; index += 1) await links.nth(index).fill(`https://example.com/request-${index + 1}`);
  check('a field changed: the footer says "Not saved yet"', (await dialog.locator('[data-not-saved]').count()) === 1);
  await dialog.getByRole('group', { name: 'Procurement mailbox' }).getByLabel(/^Email/).fill('procurement@example.com');
  await dialog.getByRole('group', { name: 'Procurement lead' }).getByLabel(/^Email/).fill('lead@example.com');
  // The Process Management team (D195): its people get the messages about the record of a Business Process.
  check('Mailboxes has the part Process Management', (await dialog.getByRole('group', { name: 'Process Management team' }).count()) === 1);
  await dialog.getByLabel('Name of a person of the Process Management team').fill('Pat Process');
  await dialog.getByLabel('Email of a person of the Process Management team').fill('pat.process@example.com');
  await dialog.getByRole('group', { name: 'Process Management team' }).getByRole('button', { name: 'Add', exact: true }).click();
  check('a person added to the team is listed', (await dialog.getByText('pat.process@example.com').count()) === 1);
  // The ServiceNow address (W5, D244): each line of a SACM list opens its record there.
  const address = dialog.getByLabel('Address', { exact: true });
  await address.fill('contoso.service-now.com');
  check('a ServiceNow address that is not an https link says so under the field', /Not a link: it starts with https:\/\//.test(await text(dialog)));
  await address.fill('https://contoso.service-now.com/now/nav/ui/home');
  await f.screenshot({ path: join(outDir, 'settings-process-management.png') });
  await dialog.getByRole('tab', { name: /^Set-up/ }).click();
  const after = await dialog.locator('[aria-label="Set-up list"] button').evaluateAll((els) => els.map((el) => el.getAttribute('data-done')));
  check('the ticks show before Save: links, Procurement and Process Management done, the team list not', after.join(',') === 'true,false,true,true,true,true', after.join(','));
  await dialog.locator('[aria-label="Set-up list"] button', { hasText: 'The team list has more than one person' }).click();
  check('the line of the team list opens Team', (await dialog.getByRole('tab', { name: 'Team', exact: true }).getAttribute('aria-selected')) === 'true');
  await dialog.getByLabel('Name of the colleague').fill('Second Manager');
  await dialog.getByLabel('Email of the colleague').fill('second.manager@example.com');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.getByLabel(/^Reminders/).fill('99');
  await dialog.getByRole('tab', { name: 'Me' }).click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await f.waitForTimeout(300);
  check('a number that cannot be used brings Team back, with a red line', (await dialog.getByRole('tab', { name: 'Team', exact: true }).getAttribute('aria-selected')) === 'true' && (await dialog.getByRole('alert').count()) === 1);
  await dialog.getByLabel(/^Reminders/).fill('3');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await f.waitForTimeout(700);
  check('with every step done Settings no longer counts set-up steps', (await f.locator('[data-setup]').count()) === 0);
  const saved = await journal();
  const line = (/Team settings changed\.[^\n]*/.exec(saved.replace(/\\"/g, '"')) || [''])[0];
  check('Activity gets only the fields that changed, by their label', /Reminders before Escalate: 2 → 3/.test(line) && /Link of the request "Owned by - update": \(empty\) → https:\/\/example\.com\/request-1/.test(line) && /Procurement lead \(email\): \(empty\) → lead@example\.com/.test(line) && /Process Management team \(people\): \(empty\) → Pat Process \(pat\.process@example\.com\)/.test(line) && /ServiceNow address: \(empty\) → https:\/\/contoso\.service-now\.com(;|$)/.test(line) && !/Signature|Days before/.test(line), line.slice(0, 300));
  check('and never an internal id', !/owned-by-update|requests\.|reminderDays/.test(line), line.slice(0, 200));
  await f.getByRole('button', { name: 'Settings', exact: true }).click();
  check('set up: Settings opens on Me, and Set-up says everything is set up', (await dialog.getByRole('tab', { name: 'Me' }).getAttribute('aria-selected')) === 'true');
  await dialog.getByRole('tab', { name: 'Set-up' }).click();
  check('"Everything is set up."', /Everything is set up\./.test(await text(dialog)));
  await dialog.getByRole('button', { name: 'Close' }).first().click();
  await f.waitForTimeout(300);
  check('nothing changed: Close closes Settings at once', (await f.getByRole('dialog').count()) === 0);

  console.log('== Close with changes asks first ==');
  await f.getByRole('button', { name: 'Settings', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Mailboxes' }).click();
  await dialog.getByLabel('Signature', { exact: false }).fill('SACM team, changed');
  await dialog.getByRole('button', { name: 'Close' }).first().click();
  await f.waitForTimeout(200);
  check('Close with a change: the footer asks "Close without saving?" and the window stays', (await f.getByRole('dialog').count()) === 1 && /Close without saving\?/.test(await text(dialog)));
  await dialog.getByRole('button', { name: 'Keep editing' }).click();
  check('Keep editing: the change is still there', (await dialog.getByLabel('Signature', { exact: false }).inputValue()) === 'SACM team, changed');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dialog.locator('footer, div').getByRole('button', { name: 'Close', exact: true }).last().click();
  await f.waitForTimeout(300);
  check('Close without saving: the window closes and nothing is saved', (await f.getByRole('dialog').count()) === 0 && !/SACM team, changed/.test(await f.evaluate(() => window.__fs.get('data/settings.json').catch(() => ''))));

  console.log('== Activity and dates ==');
  await f.locator('header').getByRole('button', { name: /Activity/ }).click();
  await f.waitForTimeout(400);
  const activity = await text(f.locator('main'));
  check('Activity writes the date of a report as "11 Nov 2026"', /report of 11 Nov 2026/.test(activity) && !ISO.test(activity), (ISO.exec(activity) || [activity.slice(0, 160)])[0]);

  console.log('== Audit ==');
  await f.locator('header').getByRole('button', { name: /Audit/ }).click();
  await f.waitForTimeout(400);
  const record = await text(f.locator('article[aria-label="Verification record"]'));
  check('the verification record is a formal record: "report of 11 November 2026"', /Verification record · report of 11 November 2026/.test(record) && !ISO.test(record), (ISO.exec(record) || [''])[0]);
  const widths = async (scope) => scope.locator('table').evaluateAll((tables) => tables.map((table) => [...table.querySelectorAll('thead th')].map((th) => `${th.textContent}:${Math.round(th.getBoundingClientRect().width)}`)));
  const verification = await widths(f.locator('article[aria-label="Verification record"]'));
  const numbers = (lists) => lists.flat().filter((cell) => /^(To solve|Other|New|Verified|Findings|CIs|Number):/.test(cell)).map((cell) => Number(cell.split(':')[1]));
  const spread = (list) => Math.max(...list) - Math.min(...list);
  check('the number columns of every table of the verification record have one width', numbers(verification).length >= 10 && spread(numbers(verification)) <= 2, verification.map((list) => list.join(' ')).join(' | ').slice(0, 300));
  await f.getByRole('tab', { name: 'Export', exact: true }).click();
  await f.locator('main').getByRole('button', { name: 'Export', exact: true }).click();
  await f.waitForSelector('article[aria-label="Audit summary"]', { timeout: 20000 });
  const summary = await text(f.locator('article[aria-label="Audit summary"]'));
  check('the audit report names its period in words: "1 November 2026 to 30 November 2026"', /SACM audit report · 1 November 2026 to 30 November 2026/.test(summary), summary.slice(0, 120));
  check('the action reads "Report loaded", never "Report"', /Report loaded \d+/.test(summary) && !/\bReport \d+\b/.test(summary), (/Actions taken.{0,200}/.exec(summary) || [''])[0]);
  check('the audit report prints no date as 2026-11-11', !ISO.test(summary), (ISO.exec(summary) || [''])[0]);
  const exported = await widths(f.locator('article[aria-label="Audit summary"]'));
  check('its number columns have the same width as in the verification record', spread(numbers(exported).concat(numbers(verification))) <= 2, exported.map((list) => list.join(' ')).join(' | ').slice(0, 300));
  await f.screenshot({ path: join(outDir, 'settings-audit.png'), fullPage: true });

  console.log('== Lifecycle review ==');
  await f.getByRole('tab', { name: 'Lifecycle', exact: true }).click();
  await f.getByRole('button', { name: 'New review', exact: true }).click();
  await f.waitForSelector('article[aria-label="Lifecycle review"]', { timeout: 20000 });
  const review = await text(f.locator('article[aria-label="Lifecycle review"]'));
  check('the status in EPO shows the word of EPO, then its meaning: "Kørende (Operational)"', /Kørende \(Operational\)/.test(review) && !/Operational \(Kørende\)/.test(review), (/.{0,40}Kørende.{0,40}/.exec(review) || [''])[0]);
  check('the review is headed "Lifecycle review of 11 November 2026" or today in words', /Lifecycle review of \d{1,2} [A-Z][a-z]+ \d{4}/.test(review) && !ISO.test(review));
  const exportBox = await f.locator('main').getByRole('button', { name: 'Export', exact: true }).boundingBox();
  const startBox = await f.getByRole('button', { name: 'New review', exact: true }).boundingBox();
  check('"New review" stands at the right, away from Export', exportBox && startBox && startBox.x - (exportBox.x + exportBox.width) > 150, `${Math.round(exportBox?.x ?? 0)} → ${Math.round(startBox?.x ?? 0)}`);
  await f.getByRole('button', { name: 'New review', exact: true }).click();
  check('and asks first', (await f.getByRole('dialog').getByText('Start a new review?').count()) >= 1 && (await f.getByRole('dialog').getByRole('button', { name: 'New review', exact: true }).count()) === 1);
  await f.keyboard.press('Escape');
  await f.screenshot({ path: join(outDir, 'settings-lifecycle.png') });

  console.log('== Demo: one date format on every screen ==');
  const d = await page({ viewport: { width: 1366, height: 768 } });
  await startDemo(d);
  const seen = [];
  const look = async (name) => { const body = await text(d.locator('body')); const found = ISO.exec(body); if (found) seen.push(`${name}: ${body.slice(Math.max(0, found.index - 40), found.index + 20)}`); };
  await look('first screen');
  await d.locator('button[aria-controls="report-tiles"]').first().click().catch(() => {});
  await d.waitForTimeout(200);
  await look('report tiles');
  const labels = await d.locator('section button[aria-pressed][aria-label]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label').split(':')[0]));
  for (const label of labels) {
    await d.locator(`section button[aria-pressed][aria-label^="${label}:"]`).first().click();
    await d.waitForTimeout(150);
    await look(`card ${label}`);
  }
  for (const pageName of ['My work', 'Activity', 'Audit']) {
    await d.locator('header').getByRole('button', { name: new RegExp(pageName) }).click();
    await d.waitForTimeout(300);
    await look(pageName);
  }
  check(`no screen of the demo prints a date as yyyy-mm-dd (${labels.length} cards and 3 pages read)`, labels.length > 20 && !seen.length, seen.slice(0, 3).join(' || '));
  await d.getByRole('button', { name: 'Settings', exact: true }).click();
  check('without a team folder the first screen shows no Set-up line, and Settings opens on Me', (await d.locator('[data-setup]').count()) === 0 && (await d.getByRole('dialog').getByRole('tab', { name: 'Me' }).getAttribute('aria-selected')) === 'true');

  for (const one of [f, d]) check('no page error and no network request', !one.errors.length && !one.requests.length, one.errors.concat(one.requests).join('; '));
  return close();
}

if (process.argv[1] === import.meta.filename) { const result = await settings(); process.exit(result.failed.length ? 1 : 0); }
