// The relationship cards in the browser: a team folder with the invented CI and Relationship reports, plus one invented
// row that gives Member Engine - PROD a second Business Application. Too many partners is a SACM fix list; on the case,
// "Cannot tell which one is right: ask the owner" takes the line to the owner. Relationship to a Retired CI is switched off.
// Invented data only. Run: node tests/browser/relationships.mjs (after npm run build).
import { join } from 'node:path';
import { card, loadLatest, open, openCard, sample, signIn } from './harness.mjs';

const EXTRA = 'Index Tool,Consumes::Consumed by,Member Engine - PROD,Always,2026-10-01 09:00:00,2026-10-01 09:00:00,demo.user,false,,,,demo.user,0,Business Application,AST-0005,Service Instance,AST-0006';

export async function relationships() {
  const { page, check, close, outDir } = await open('Relationships');
  const p = await page();
  const rels = `${sample('cmdb_rel_ci-sample.csv').replace(/\s+$/, '')}\n${EXTRA}\n`;
  await p.evaluate(([c, r]) => Promise.all([window.__fs.put('reports/2026-11-11_cmdb_ci.csv', c), window.__fs.put('reports/2026-11-11_cmdb_rel_ci.csv', r)]),
    [sample('cmdb_ci-sample.csv'), rels]);
  await signIn(p, 'Test Manager', 'test.manager@example.com');
  await loadLatest(p);

  check('no card for Relationship to a Retired CI (switched off)', !(await card(p, 'Relationship to a Retired CI')), await card(p, 'Relationship to a Retired CI'));
  const pairs = await card(p, 'Too many partners');
  // Member Engine - PROD has two Business Applications, and Index Tool two production Service Instances.
  check('Too many partners: to solve, 2 CIs', /To solve, 2 CIs/.test(pairs), pairs);
  const missing = await card(p, 'Relationship missing');
  check('Relationship missing is tested', !!missing && !/not tested/i.test(missing), missing);

  await openCard(p, 'Too many partners');
  const view = p.locator('section[aria-label="Too many partners"]');
  let main = (await view.innerText()).replace(/\s+/g, ' ');
  const list = p.locator('section[aria-label="Fix list"]');
  check('two fix list lines: keep the right one, no owner group yet', (await list.locator('tbody tr').count()) === 2 && /keep the right one/.test(main) && !/Asked of the owner/.test(main), main.slice(0, 300));
  await list.getByText('Member Engine - PROD', { exact: true }).first().click(); await p.waitForTimeout(500);
  const panel = p.locator('aside[aria-label^="Case:"]');
  await panel.getByRole('button', { name: 'Ask the owner', exact: true }).click(); await p.waitForTimeout(800);
  const after = (await panel.innerText()).replace(/\s+/g, ' ');
  check('after the button: the owner is asked, Back to SACM offered', /Back to SACM/.test(after) && /SACM checked it: the owner is asked/.test(after), (after.match(/SACM checked it: the owner is asked[^)]*\)/) || [''])[0]);
  await panel.getByRole('button', { name: 'Close', exact: true }).click(); await p.waitForTimeout(300);
  main = (await view.innerText()).replace(/\s+/g, ' ');
  check('the line left the fix list and is in an owner group', (await list.locator('tbody tr').count()) === 1 && /Asked of the owner: SACM cannot tell which one is right/.test(main) && (await view.getByRole('button', { name: 'Email', exact: true }).count()) === 1, main.slice(0, 400));
  await p.screenshot({ path: join(outDir, 'relationships-asked.png'), fullPage: true });
  await p.getByRole('button', { name: 'Email', exact: true }).first().click(); await p.waitForTimeout(800);
  const draft = ((await p.locator('dialog[open] iframe').first().getAttribute('srcdoc')) || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  check('the message asks which one is right; SACM removes the others in ServiceNow', /Which one is right\? Reply to this email, and SACM removes the other relationships in ServiceNow\./.test(draft) && !/relationships in EPO/.test(draft), (draft.match(/Which one is right[^.]*\.[^.]*\./) || [draft.slice(0, 200)])[0]);
  check('no page errors, no network request', p.errors.length === 0 && p.requests.length === 0, p.errors.concat(p.requests).join(' | ').slice(0, 300));
  return close();
}

if (process.argv[1] === import.meta.filename) {
  const result = await relationships();
  process.exit(result.failed.length ? 1 : 0);
}
