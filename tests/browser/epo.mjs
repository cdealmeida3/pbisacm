// The EPO systems report in the browser: the demo, then a team folder with the invented samples loaded on two
// dates, the lifecycle review filled from EPO, and the phone in dark mode. Invented data only.
// Run: node tests/browser/epo.mjs (after npm run build).
import { join } from 'node:path';
import { back, card, cardText, closeCard, loadLatest, open, openCard, sample, signIn, startDemo, tiles, unfoldAll } from './harness.mjs';

const CHIPS_SECOND = 1;

export async function epo() {
  const { page, check, close, outDir } = await open('EPO systems report');

  console.log('== Demo ==');
  const demo = await page();
  await startDemo(demo);
  const t = await tiles(demo);
  check('report tiles: the EPO systems report is loaded', /EPO systems report/.test(t) && /6 systems · 5 not Retired/.test(t), t.match(/EPO systems report.*?(?=Remove)/)?.[0].slice(0, 220));
  check('card EPO ≠ ServiceNow is red with 2 CIs (one of them for its description)', /To solve, 2 CIs/.test(await card(demo, 'EPO ≠ ServiceNow')), await card(demo, 'EPO ≠ ServiceNow'));
  check('card EPO update not arrived is a review list', /To check/.test(await card(demo, 'EPO update not arrived')) && !/To solve/.test(await card(demo, 'EPO update not arrived')), await card(demo, 'EPO update not arrived'));
  check('the card Description differs from EPO is gone (its differences are on the two EPO cards)', !(await card(demo, 'Description differs from EPO')), await card(demo, 'Description differs from EPO'));
  await openCard(demo, 'EPO ≠ ServiceNow');
  const fix = (await demo.locator('section[aria-label="Fix list"]').innerText()).replace(/\s+/g, ' ');
  check('fix list lines: Managed by and the description, set to from EPO', /Managed by/.test(fix) && /Description \(stops before the end of the EPO text\)/.test(fix) && /from EPO/.test(fix) && /Fixed/.test(fix), fix.slice(0, 300));
  await demo.screenshot({ path: join(outDir, 'epo-demo-fix-list.png'), fullPage: true });
  // Corrected in EPO: the inactive manager of Member Engine - PROD was replaced in EPO.
  await demo.locator('section[aria-label="Fix list"]').getByText('Member Engine - PROD', { exact: true }).first().click();
  await demo.waitForTimeout(500);
  const panel = (await demo.locator('aside[aria-label^="Case:"]').innerText()).replace(/\s+/g, ' ');
  check('case panel shows "Corrected in EPO" on the owner case of the same CI', /EPO already has Primary Responsible Cy Keeper \(cy01\)/.test(panel), (panel.match(/EPO already has[^.]*\.[^.]*\./) || [''])[0]);
  // The source first (D190): people lines of a Service Instance are compared with EPO before anybody is asked.
  await demo.keyboard.press('Escape'); await demo.waitForTimeout(300);
  await back(demo);
  await openCard(demo, 'Inactive person');
  const inactive = (await demo.locator('section[aria-label="Inactive person"]').innerText()).replace(/\s+/g, ' ');
  check('Inactive person: the line EPO already answers waits, nobody is asked', /1 waiting, below/.test(inactive) && /Waiting 1$/.test(inactive) && /1 To solve/.test(inactive), inactive.slice(0, 200));
  await back(demo);
  await openCard(demo, 'Owner or manager missing');
  await unfoldAll(demo.locator('section[aria-label="Owner or manager missing"]'));
  const missing = (await demo.locator('section[aria-label="Owner or manager missing"]').innerText()).replace(/\s+/g, ' ');
  // "Fix in EPO" is on the line when the group mixes fix places, else once in the group header (the processes of the owner are
  // now the group of Process Management, D195).
  const leftoverGroup = (await demo.locator('article', { hasText: 'Event Gateway - PROD' }).first().innerText()).replace(/\s+/g, ' ');
  check('a leftover is asked of the owner with the words of EPO, fixed in EPO', /Event Gateway - PROD.{0,80}Managed by is empty in EPO \(Primary Responsible\); ServiceNow still shows Cy Keeper \(cy01\), because the sync never clears a field/.test(missing) && /Fix in EPO/.test(leftoverGroup), (missing.match(/Event Gateway.{0,220}/) || [''])[0]);
  await back(demo);
  await openCard(demo, 'Supported by');
  await unfoldAll(demo.locator('section[aria-label="Supported by"]'));
  const supported = (await demo.locator('section[aria-label="Supported by"]').innerText()).replace(/\s+/g, ' ');
  check('Supported by: the line says that EPO names the same inactive person', /Supported by is an inactive user: Bo Leaver\. EPO names the same person as Secondary Responsible/.test(supported), (supported.match(/Supported by is an inactive.{0,90}/) || [''])[0]);
  check('demo: no page errors, no network request', demo.errors.length === 0 && demo.requests.length === 0, demo.errors.concat(demo.requests).join(' | ').slice(0, 300));

  console.log('== Team folder with the samples, loaded on two dates ==');
  const p = await page();
  const ci = sample('cmdb_ci-sample.csv'), systems = sample('epo-systems-sample.csv');
  await p.evaluate(([c, e]) => Promise.all([window.__fs.put('reports/2026-11-04_cmdb_ci.csv', c), window.__fs.put('reports/2026-11-04_epo_systems.csv', e)]), [ci, systems]);
  await signIn(p, 'Test Manager', 'test.manager@example.com');
  await loadLatest(p);
  let tt = await tiles(p);
  check('first load: EPO tile', /6 systems · 5 not Retired/.test(tt), (tt.match(/EPO systems report.*?(?=Remove)/)?.[0] || tt).slice(0, 220));
  check('EPO ≠ ServiceNow: 2 CIs', /To solve, 2 CIs/.test(await card(p, 'EPO ≠ ServiceNow')), await card(p, 'EPO ≠ ServiceNow'));
  const notArrived = await card(p, 'EPO update not arrived');
  check('EPO update not arrived: 1 CI to check', /To check, 1 CI$/.test(notArrived), notArrived);
  await openCard(p, 'EPO ≠ ServiceNow');
  let rows = await p.locator('section[aria-label="Fix list"] tbody tr').count();
  let chips = await p.locator('section[aria-label="Fix list"]').getByText('changed in EPO', { exact: true }).count();
  check('fix list: 2 lines, no chip at the first EPO report', rows === 2 && chips === 0, `rows ${rows}, chips ${chips}`);
  // A week later: the same files as the reports of 11 November. The chip marks what changed in EPO since 4 November.
  await p.evaluate(([c, e]) => Promise.all([window.__fs.put('reports/2026-11-11_cmdb_ci.csv', c), window.__fs.put('reports/2026-11-11_epo_systems.csv', e)]), [ci, systems]);
  await closeCard(p);
  await loadLatest(p);
  tt = await tiles(p);
  check('second load: EPO update not arrived still 1 CI to check', /To check, 1 CI$/.test(await card(p, 'EPO update not arrived')), await card(p, 'EPO update not arrived'));
  check('second load: the tile says 2 systems changed since the last EPO report', /2 systems changed in EPO since the EPO systems report of 4 Nov 2026/.test(tt), (tt.match(/\d+ systems? changed in EPO since[^.]*\./) || [''])[0]);
  await openCard(p, 'EPO ≠ ServiceNow');
  const rows2 = await p.locator('section[aria-label="Fix list"] tbody tr').count();
  chips = await p.locator('section[aria-label="Fix list"]').getByText('changed in EPO', { exact: true }).count();
  check('fix list: the same lines, with the chip on what changed this week', rows2 === 2 && chips === CHIPS_SECOND, `rows ${rows2}, CIs with the chip ${chips}`);
  const files = await p.evaluate(() => window.__fs.list());
  check('EPO loads saved in data/runs/epo/', files.filter((f) => f.startsWith('data/runs/epo/')).length === 2, files.filter((f) => f.startsWith('data/runs/')).join(', '));
  // Lifecycle review filled from EPO.
  await closeCard(p);
  await p.locator('header').getByRole('button', { name: /Audit/ }).click(); await p.waitForTimeout(300);
  await p.getByRole('tab', { name: 'Lifecycle', exact: true }).first().click(); await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'New review', exact: true }).click(); await p.waitForTimeout(1500);
  const before = (await p.locator('article[aria-label="Lifecycle review"] header').innerText()).replace(/\s+/g, ' ');
  const agree = p.getByRole('button', { name: /^Mark \d+ same$/ });
  const agreeText = await agree.innerText().catch(() => '');
  check('lifecycle review: Status in EPO column and the one-click button', (await p.getByRole('columnheader', { name: 'Status in EPO' }).count()) > 0 && !!agreeText, `${before.slice(0, 90)} | ${agreeText}`);
  await agree.click(); await p.waitForTimeout(1500);
  const after = (await p.locator('article[aria-label="Lifecycle review"] header').innerText()).replace(/\s+/g, ' ');
  check('lifecycle review: the 4 agreeing CIs of 7 are marked', /4 of 7 checked/.test(after), after.slice(0, 120));
  await p.screenshot({ path: join(outDir, 'epo-lifecycle-review.png') });
  // "Not the same" is a SACM line first (D192): copy EPO or report the sync; the owner only with the button.
  await p.locator('article[aria-label="Lifecycle review"] tbody tr').filter({ has: p.getByRole('button', { name: 'Not the same' }) }).first().getByRole('button', { name: 'Not the same' }).click(); await p.waitForTimeout(1200);
  await back(p);
  check('Lifecycle review card: a SACM fix list with 1 line', /To solve 1 line/.test(await cardText(p, 'Lifecycle review')) && (await p.locator('section button[aria-pressed][aria-label^="Lifecycle review:"]').first().getAttribute('data-kind')) === 'fix', await cardText(p, 'Lifecycle review'));
  await openCard(p, 'Lifecycle review');
  const reviewList = (await p.locator('section[aria-label="Fix list"]').innerText()).replace(/\s+/g, ' ');
  check('its line says what SACM does: copy the status of EPO, or report the sync', /Operational status: (copy the status of EPO into ServiceNow|the sync did not bring the status of EPO)/.test(reviewList), reviewList.slice(0, 260));
  await p.locator('section[aria-label="Fix list"] tbody tr').first().click(); await p.waitForTimeout(600);
  const reviewCase = p.locator('aside[aria-label^="Case:"]');
  check('the owner is asked only with the button "Ask the owner", the reason next to it', (await reviewCase.getByRole('button', { name: 'Ask the owner', exact: true }).count()) === 1 && /EPO itself looks wrong/.test(await reviewCase.innerText()));
  check('folder mode: no page errors, no network request', p.errors.length === 0 && p.requests.length === 0, p.errors.concat(p.requests).join(' | ').slice(0, 300));

  console.log('== Phone and dark mode (demo) ==');
  const phone = await page({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await startDemo(phone);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone: no sideways scroll on the overview', overflow <= 0, `overflow ${overflow}px`);
  await phone.screenshot({ path: join(outDir, 'epo-phone-dark.png'), fullPage: true });
  return close();
}

if (process.argv[1] === import.meta.filename) { const result = await epo(); process.exit(result.failed.length ? 1 : 0); }
