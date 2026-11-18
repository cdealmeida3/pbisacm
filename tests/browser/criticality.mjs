// Criticality in the browser: a team folder with the invented CI and Relationship reports, the cards BIA missing,
// No criticality reaches the CI and Above parent, and "Mapping is complete: ask the owner" on a case. Invented data only.
// Run: node tests/browser/criticality.mjs (after npm run build).
import { join } from 'node:path';
import { back, card, loadLatest, open, openCard, sample, signIn } from './harness.mjs';

export async function criticality() {
  const { page, check, close, outDir } = await open('Criticality');
  const p = await page();
  await p.evaluate(([c, r]) => Promise.all([window.__fs.put('reports/2026-11-11_cmdb_ci.csv', c), window.__fs.put('reports/2026-11-11_cmdb_rel_ci.csv', r)]),
    [sample('cmdb_ci-sample.csv'), sample('cmdb_rel_ci-sample.csv')]);
  await signIn(p, 'Test Manager', 'test.manager@example.com');
  await loadLatest(p);

  const none = await card(p, 'No criticality reaches the CI');
  check('No criticality reaches the CI: a review list, 1 CI', /To check, 1 CI/.test(none) && !/To solve/.test(none), none);
  const bia = await card(p, 'BIA missing');
  check('BIA missing: tested on the Business Processes, nothing to solve', bia && !/To solve/.test(bia) && !/not tested/i.test(bia), bia);
  let above = await card(p, 'Above parent');
  check('Above parent: to check, not red (the excluded relationship does not count)', /To check, 1 CI/.test(above) && !/To solve/.test(above), above);

  await openCard(p, 'No criticality reaches the CI');
  const noneText = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  check('the review line says why: no parent relationship', /No criticality reaches this CI: no parent relationship/.test(noneText), (noneText.match(/No criticality reaches this CI[^.]*?relationship/) || [''])[0]);
  await p.screenshot({ path: join(outDir, 'criticality-none-reaches.png'), fullPage: true });
  await back(p);

  await openCard(p, 'Above parent');
  const hint = (await p.locator('main').innerText()).replace(/\s+/g, ' ');
  check('the check part is open, says SACM checks first, and names the button', /Check first/.test(hint) && /SACM checks the mapping of these first/.test(hint) && /Mapping done: ask owner/.test(hint), (hint.match(/SACM checks the mapping of these first[^.]*\./) || [''])[0]);
  await p.getByText('Member Engine - PROD', { exact: true }).first().click(); await p.waitForTimeout(500);
  const panel = p.locator('aside[aria-label^="Case:"]');
  const before = (await panel.innerText()).replace(/\s+/g, ' ');
  check('case: higher than every parent, to review', /higher than every parent/.test(before) && /To check/.test(before), (before.match(/Integrity: Target[^)]*\)/) || [''])[0]);
  await panel.getByRole('button', { name: 'Mapping done: ask owner' }).click(); await p.waitForTimeout(800);
  const after = (await panel.innerText()).replace(/\s+/g, ' ');
  check('after the button: to solve, Back to SACM offered', /Back to SACM/.test(after) && /SACM checked it: the owner is asked/.test(after), (after.match(/SACM checked it: the owner is asked[^)]*\)/) || [''])[0]);
  await p.screenshot({ path: join(outDir, 'criticality-case-asked.png') });
  await panel.getByRole('button', { name: 'Close', exact: true }).click(); await p.waitForTimeout(300);
  await back(p);
  above = await card(p, 'Above parent');
  check('Above parent is now red: 1 CI to solve', /To solve, 1 CI/.test(above), above);
  const journal = Object.entries(await p.evaluate(() => window.__fs.dump())).filter(([name]) => name.startsWith('data/journal/')).map(([, text]) => text).join('\n');
  check('the journal holds the reviewed event', /"type":"reviewed"/.test(journal) && /"text":"Ask the owner"/.test(journal), (journal.match(/\{[^\n]*"reviewed"[^\n]*\}/) || [''])[0].slice(0, 200));
  check('no page errors, no network request', p.errors.length === 0 && p.requests.length === 0, p.errors.concat(p.requests).join(' | ').slice(0, 300));
  return close();
}

if (process.argv[1] === import.meta.filename) {
  const result = await criticality();
  process.exit(result.failed.length ? 1 : 0);
}
