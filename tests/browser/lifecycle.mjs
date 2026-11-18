// Lifecycle, tags and the Procurement lead in the browser: a team folder with the invented CI report. The parked
// classes and a card to clarify when there is time (D179, D182), the planned retirement date on a case of Deleted but operational (the CI
// waits until that date), the tags on the lines and in Export this list, and the Procurement lead in Settings. Two
// computers load the same report: the run file is the same, byte for byte. Invented data only.
// Run: node tests/browser/lifecycle.mjs (after npm run build).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { back, card, cards, loadLatest, open, openCard, sample, signIn , filter } from './harness.mjs';

export async function lifecycle() {
  const { page, check, close, outDir } = await open('Lifecycle, tags and Settings');
  const runFiles = async (p) => Object.entries(await p.evaluate(() => window.__fs.dump())).filter(([name]) => /^data\/runs\/[^/]+\.json$/.test(name));
  const p = await page();
  await p.evaluate(([c]) => window.__fs.put('reports/2026-11-11_cmdb_ci.csv', c), [sample('cmdb_ci-sample.csv')]);
  await signIn(p, 'Test Manager', 'test.manager@example.com');
  await loadLatest(p);

  // Parked classes (D179): a Business Capability in Ready gives no line; the first screen says so in a grey line.
  check('no card Capability Ready too long: the check is off', (await card(p, 'Capability Ready too long')) === '');
  const parked = (await p.locator('[data-parked]').innerText()).replace(/\s+/g, ' ');
  check('the first screen names what is not checked yet', /Business Capabilit(y|ies) in Ready (is|are) not checked yet/.test(parked) && /No API or Application CIs in this report/.test(parked), parked);

  // A card to clarify when there is time (D182): calm, after the daily cards of its section, not shown with Only red.
  const supported = await card(p, 'Supported by');
  check('Supported by: When there is time, not red', /^Supported by: When there is time, 3 CIs/.test(supported), supported);
  const order = await p.locator('section').filter({ has: p.locator('#section-completeness') }).locator('button[aria-pressed][aria-label]').evaluateAll((els) => els.map((e) => e.hasAttribute('data-later')));
  check('…after every daily card of Completeness', order.indexOf(true) > 0 && order.slice(order.indexOf(true)).every(Boolean), JSON.stringify(order));
  await filter(p, 'To solve');
  check('…not shown with the filter To solve', (await card(p, 'Supported by')) === '' && (await cards(p)).length > 0);
  await filter(p, 'To solve');

  // Tags on the lines of a card, and in Export.
  await openCard(p, 'Deleted but operational');
  const line = (await p.locator('article tbody tr').first().innerText()).replace(/\s+/g, ' ');
  check('the line of a card shows the tags of the CI', /To be deleted/.test(line) && (await p.locator('article tbody tr [aria-label="Tags"]').count()) >= 1, line.slice(0, 200));
  const [file] = await Promise.all([p.waitForEvent('download'), p.locator('[data-toolbar]').getByRole('button', { name: 'Export', exact: true }).first().click()]);
  const csv = readFileSync(await file.path(), 'utf8');
  check('Export has a Tags column', /"Support group","Tags","What we found"/.test(csv) && /"To be deleted"/.test(csv), csv.split('\r\n').slice(0, 2).join(' | '));
  await p.screenshot({ path: join(outDir, 'lifecycle-tags-on-lines.png'), fullPage: true });

  // The planned retirement date: the CI waits until then.
  await p.locator('article tbody tr').first().click(); await p.waitForTimeout(500);
  const panel = p.locator('aside[aria-label^="Case:"]');
  check('the case offers the retirement date', /Retirement date/.test(await panel.innerText()));
  await panel.locator('input[type="date"]').fill('2027-06-30');
  await panel.getByRole('region', { name: 'Retirement date' }).getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(900);
  const after = (await panel.innerText()).replace(/\s+/g, ' ');
  check('after saving: waits until the date, the timeline says who set it', /Planned retirement on 30 June 2027: waits until then/.test(after) && /Planned retirement date: 30 June 2027 \(by Test Manager\)/.test(after), (after.match(/Planned retirement[^.]*\./g) || []).join(' | '));
  await p.screenshot({ path: join(outDir, 'lifecycle-retirement-date.png') });
  await panel.getByRole('button', { name: 'Close', exact: true }).click(); await p.waitForTimeout(300);
  await back(p);
  const dated = await card(p, 'Deleted but operational');
  check('the card is no longer red: the CI waits', !/To solve/.test(dated), dated);
  const journal = Object.entries(await p.evaluate(() => window.__fs.dump())).filter(([name]) => name.startsWith('data/journal/')).map(([, text]) => text).join('\n');
  check('the journal holds the date', /"type":"retirement"/.test(journal) && /"retireOn":"2027-06-30"/.test(journal), (journal.match(/\{[^\n]*"retirement"[^\n]*\}/) || [''])[0].slice(0, 200));

  // Settings: the Procurement lead, kept in the team folder.
  await p.getByRole('button', { name: 'Settings', exact: true }).click(); await p.waitForTimeout(300);
  await p.getByRole('dialog').getByRole('tab', { name: 'Team' }).click();
  check('Settings: Ready too long is 90 days at first', (await p.getByRole('dialog').getByLabel(/^Ready too long/).inputValue()) === '90');
  await p.getByRole('dialog').getByRole('tab', { name: 'Mailboxes' }).click();
  await p.getByRole('group', { name: 'Procurement lead' }).getByLabel(/^Name/).fill('Lee Lead');
  await p.getByRole('group', { name: 'Procurement lead' }).getByLabel(/^Email/).fill('lee.lead@example.com');
  await p.getByRole('button', { name: 'Save', exact: true }).click(); await p.waitForTimeout(700);
  const settings = JSON.parse(await p.evaluate(() => window.__fs.get('data/settings.json')));
  check('the Procurement lead is saved in data/settings.json', settings.procurementLeadName === 'Lee Lead' && settings.procurementLeadEmail === 'lee.lead@example.com' && settings.readyDays === 90, JSON.stringify({ lead: settings.procurementLeadEmail, readyDays: settings.readyDays }));
  const journal2 = Object.entries(await p.evaluate(() => window.__fs.dump())).filter(([name]) => name.startsWith('data/journal/')).map(([, text]) => text).join('\n');
  check('…and the change is a journal line', /Procurement lead \(email\): [^\n]*lee\.lead@example\.com/.test(journal2), (journal2.match(/Procurement lead[^"]*/) || [''])[0]);
  await p.getByRole('button', { name: 'Settings', exact: true }).click(); await p.waitForTimeout(300);
  await p.getByRole('dialog').getByRole('tab', { name: 'Mailboxes' }).click();
  check('Settings shows the lead again', (await p.getByRole('group', { name: 'Procurement lead' }).getByLabel(/^Email/).inputValue()) === 'lee.lead@example.com');
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  // A second computer loads the same report: the run file is the same, byte for byte.
  const q = await page();
  await q.evaluate(([c]) => window.__fs.put('reports/2026-11-11_cmdb_ci.csv', c), [sample('cmdb_ci-sample.csv')]);
  await signIn(q, 'Other Manager', 'other.manager@example.com');
  await loadLatest(q);
  const mine = await runFiles(p);
  const theirs = await runFiles(q);
  const strip = (text) => { const run = JSON.parse(text); delete run.loadedBy; delete run.loadedByName; delete run.loadedAt; return JSON.stringify(run); };
  check('two computers, same report: the same run (tags included), apart from who loaded it', mine.length === 1 && theirs.length === 1 && mine[0][0] === theirs[0][0] && strip(mine[0][1]) === strip(theirs[0][1]) && /"tags":\["To be deleted"\]/.test(mine[0][1]),
    `${mine.map(([name]) => name).join()} | ${theirs.map(([name]) => name).join()}`);
  check('no page errors, no network request', p.errors.length === 0 && p.requests.length === 0 && q.errors.length === 0 && q.requests.length === 0, p.errors.concat(p.requests, q.errors, q.requests).join(' | ').slice(0, 300));
  return close();
}

if (process.argv[1] === import.meta.filename) {
  const result = await lifecycle();
  process.exit(result.failed.length ? 1 : 0);
}
