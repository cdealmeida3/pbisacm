// Contracts in the browser: the Solusi contract file compared with the ServiceNow contract report. The demo,
// then a team folder with the invented samples: the CI report alone, the contract files after it, the CI report again,
// marks, messages to Procurement, Contract changes and a second visit. Invented data only.
// Run: node tests/browser/contracts.mjs (after npm run build).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { back, card, cardData, cardText, cardTip, cards, loadLatest, open, openCard, sample, signIn, startDemo, tiles } from './harness.mjs';

export async function contracts() {
  const { page, check, close, outDir } = await open('Contracts');
  const setProcurement = async (page) => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.waitForTimeout(300);
    await page.getByRole('dialog').getByRole('tab', { name: 'Mailboxes' }).click();
    await page.getByRole('group', { name: 'Procurement mailbox' }).getByLabel(/^Email/).fill('procurement@example.com');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.waitForTimeout(600);
  };
  const kinds = async (page) => page.locator('[data-kind-table] h3').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().replace(/ (\d+ contracts?)$/, ' | $1')));
  const draft = async (page) => {
    const dialog = page.locator('dialog[open]');
    const body = await dialog.locator('iframe[title="Message preview"]').first().getAttribute('srcdoc');
    return { title: await dialog.locator('h2').first().innerText(), drafts: await dialog.locator('iframe[title="Message preview"]').count(), to: await dialog.getByLabel('To', { exact: true }).first().inputValue(), cc: await dialog.getByLabel('Cc', { exact: true }).first().inputValue(),
      subject: await dialog.getByLabel('Subject').first().inputValue(), tables: (body.match(/<table/g) || []).length, rows: (body.match(/<tr><td>/g) || []).length, headings: (body.match(/<h3[^>]*>([^<]*)</g) || []).map((h) => h.replace(/<h3[^>]*>/, '').replace('<', '')), body };
  };

  console.log('== Demo ==');
  const demo = await page();
  await startDemo(demo);
  let t = await tiles(demo);
  check('five report tiles, both contract files loaded', /Solusi contract file/.test(t) && /7 contracts · 0 terminated/.test(t) && /ServiceNow contract report/.test(t) && /10 contracts/.test(t), (t.match(/Solusi contract file.*$/) || [''])[0].slice(0, 300));
  check('card Not in Solusi: red, 4 contracts', /To solve, 4 contracts/.test(await card(demo, 'Not in Solusi')), await card(demo, 'Not in Solusi'));
  check('the card is a Contract card and a SACM list', (await cardData(demo, 'Not in Solusi', 'topic')) === 'Contract' && (await cardData(demo, 'Not in Solusi', 'kind')) === 'fix', await cardText(demo, 'Not in Solusi'));
  check('card To clear by hand: 1 contract', /To solve, 1 contract/.test(await card(demo, 'To clear by hand')), await card(demo, 'To clear by hand'));
  check('card Contract status: 3 contracts', /To solve, 3 contracts/.test(await card(demo, 'Contract status')), await card(demo, 'Contract status'));
  const all = (await cards(demo)).length;
  await demo.getByRole('button', { name: 'Contracts', exact: true }).click(); await demo.waitForTimeout(300);
  const only = await cards(demo);
  check('filter Contracts shows only the contract cards', only.length === 6 && all > 20, `${only.length} of ${all}`);
  await demo.screenshot({ path: join(outDir, 'contracts-demo-contracts-overview.png'), fullPage: true });
  await demo.getByRole('button', { name: 'CIs', exact: true }).click(); await demo.waitForTimeout(300);
  const onlyCis = await cards(demo);
  check('filter CIs hides them', onlyCis.length > 0 && onlyCis.length < all - 6 && onlyCis.every((label) => only.indexOf(label) < 0), String(onlyCis.length));
  await demo.getByRole('button', { name: 'All', exact: true }).click(); await demo.waitForTimeout(300);
  await openCard(demo, 'Not in Solusi');
  let list = demo.locator('section[aria-label="Delete list"]');
  let text = (await list.innerText()).replace(/\s+/g, ' ');
  const order = await list.locator('tbody tr [data-ci-name]').evaluateAll((els) => els.map((e) => e.innerText.trim()));
  check('delete list: 4 lines in contract order, the app deletes nothing, "Still linked" only a note', (await list.locator('tbody tr').count()) === 4 && /the app deletes nothing/i.test((await demo.locator('section[aria-label="Not in Solusi"]').innerText()).replace(/\s+/g, ' '))
    && /Still linked: it carries a criticality/.test(text) && !/check before deleting/.test(text) && order.join() === order.slice().sort((a, b) => a.localeCompare(b)).join(), order.join(' ; '));
  await demo.screenshot({ path: join(outDir, 'contracts-demo-delete-list.png'), fullPage: true });
  await list.getByRole('button', { name: 'Deleted', exact: true }).last().click(); await demo.waitForTimeout(600);
  text = (await list.innerText()).replace(/\s+/g, ' ');
  check('Deleted: the line says Marked deleted, by whom, and offers Undo', /Marked deleted Demo User/.test(text) && (await list.getByRole('button', { name: 'Undo', exact: true }).count()) === 1, (text.match(/Marked deleted[^U]*/) || [''])[0]);
  await list.locator('tbody tr').first().click(); await demo.waitForTimeout(500);
  const panel = (await demo.locator('aside[aria-label^="Case:"]').innerText()).replace(/\s+/g, ' ');
  check('case panel of a contract: its problems, Delete list line, Stop following offered', /Problems/.test(panel) && /Delete list: Delete the contract in ServiceNow/.test(panel) && /Stop following/.test(panel), panel.slice(0, 160));
  await demo.screenshot({ path: join(outDir, 'contracts-demo-contract-case.png') });
  await demo.keyboard.press('Escape'); await back(demo);
  await openCard(demo, 'Contract status');
  text = (await demo.locator('section[aria-label="Fix list"]').innerText()).replace(/\s+/g, ' ');
  check('Contract status fix list: add, change, remove a tag', /Add the tag S - Concluded/.test(text) && /Change the tag T - Terminated to E - Ended/.test(text) && /Remove the tag E - Ended/.test(text));
  await back(demo);

  console.log('-- part 2: For Procurement, Upload check, Contract changes --');
  check('card For Procurement: red, 3 contracts', /To solve, 3 contracts/.test(await card(demo, 'For Procurement')), await card(demo, 'For Procurement'));
  check('card Upload check: a SACM fix list, 3 contracts to solve', /To solve, 3 contracts/.test(await card(demo, 'Upload check')), await card(demo, 'Upload check'));
  check('card Contracts to fix in ServiceNow: 1 contract to solve', /To solve, 1 contract/.test(await card(demo, 'Contracts to fix in ServiceNow')), await card(demo, 'Contracts to fix in ServiceNow'));
  await openCard(demo, 'Contracts to fix in ServiceNow');
  let fixes = (await demo.locator('section[aria-label="Fix list"]').innerText()).replace(/\s+/g, ' ');
  check('Contracts to fix in ServiceNow: a fix list (end date passed; the owner who left is For Procurement), no message', !/Contract owner/.test(fixes) && /End date: correct it, or set the status Ended/.test(fixes)
    && (await demo.getByRole('button', { name: 'Email', exact: true }).count()) === 0, fixes.slice(0, 240));
  await back(demo);
  await openCard(demo, 'For Procurement');
  let head = (await demo.locator('section[aria-label="For Procurement"]').innerText()).replace(/\s+/g, ' ');
  check('For Procurement: no mailbox address yet, so the button is off and the card says why', /The Procurement mailbox has no email yet/.test(head) && /Set the mailbox email first/.test(head) && await demo.getByRole('button', { name: 'Email', exact: true }).isDisabled());
  check('the card shows the dates of the two files compared', /Compared: the Solusi contract file of \d+ \w+ \d{4} with the ServiceNow contract report of \d+ \w+ \d{4}/.test(head), (head.match(/Compared:[^.]*\./) || [''])[0]);
  await setProcurement(demo);
  let k = await kinds(demo);
  check('listed by kind of problem, not by owner: 4 kinds, only what Solusi must correct', k.length === 4 && k.some((x) => /^Contract owner left \| 1 contract/.test(x)) && k.some((x) => /^No vendor number \| 1 contract/.test(x)) && k.some((x) => /^The EPO ID names a Retired system/.test(x)) && !k.some((x) => /inactive|Owner:/.test(x)), k.join(' ; '));
  check('no Email and no Teams button on a kind', (await demo.locator('[data-kind-table]').getByRole('button', { name: /^(Email|Teams)$/ }).count()) === 0);
  await demo.screenshot({ path: join(outDir, 'contracts-demo-for-procurement.png'), fullPage: true });
  await demo.getByRole('button', { name: 'Email', exact: true }).click(); await demo.waitForTimeout(900);
  let d = await draft(demo);
  check('one message to the Procurement mailbox, nobody copied', d.drafts === 1 && d.to === 'procurement@example.com' && d.cc === '' && /Message to Procurement/.test(d.title), `${d.title} | to ${d.to} | cc "${d.cc}"`);
  check('subject says contracts and Solusi; one table per problem (4), 4 lines', /^3 contracts need a correction in Solusi \[SACM-/.test(d.subject) && d.tables === 4 && d.rows === 4, `${d.subject} | tables ${d.tables}, lines ${d.rows} | ${d.headings.join(' ; ')}`);
  check('the message: Hi Procurement, contract columns, what is asked, signed', /Hi Procurement,/.test(d.body) && /<th align="left" style="white-space:nowrap">Contract number<\/th><th align="left" style="white-space:nowrap">Name<\/th><th align="left" style="white-space:nowrap">Vendor<\/th><th align="left" style="white-space:nowrap">What we found<\/th>/.test(d.body) && /Please add the vendor number in Solusi\./.test(d.body) && /Demo User/.test(d.body) && !/CIs below/.test(d.body) && !/inactive/.test(d.body));
  await demo.screenshot({ path: join(outDir, 'contracts-demo-procurement-message.png') });
  await demo.locator('dialog[open]').getByRole('button', { name: 'Send from mailbox' }).click(); await demo.waitForTimeout(900);
  check('Send: handed to the shared mailbox only on the button', /Handed to the shared mailbox/.test(await demo.locator('dialog[open]').innerText()));
  await demo.keyboard.press('Escape'); await demo.waitForTimeout(400);
  head = (await demo.locator('section[aria-label="For Procurement"]').innerText()).replace(/\s+/g, ' ');
  check('after the send: the one message was asked once, waits for an answer and offers Remind', /Asked 1 time · last \d+ \w+ · no reply/.test(head) && /Waiting for an answer\. A reminder is due from/.test(head) && (await demo.getByRole('button', { name: 'Remind', exact: true }).count()) === 1 && (await demo.getByRole('button', { name: 'Email', exact: true }).count()) === 0, (head.match(/Asked 1 time[^.]*\.[^.]*\./) || [''])[0]);
  const [file] = await Promise.all([demo.waitForEvent('download'), demo.locator('[data-toolbar]').getByRole('button', { name: 'Export', exact: true }).first().click()]);
  const csv = readFileSync(await file.path(), 'utf8');
  check('Export: the same tables as a file (contract columns, what is asked)', /"Problem","Contract number","Name","Vendor","What we found","What is asked","Status"/.test(csv) && csv.trim().split('\r\n').length === 5 && /"Please add the vendor number in Solusi\."/.test(csv), csv.split('\r\n')[0]);
  await demo.locator('[data-kind-table] tbody tr').first().click(); await demo.waitForTimeout(500);
  const panel2 = (await demo.locator('aside[aria-label^="Case:"]').innerText()).replace(/\s+/g, ' ');
  check('case panel: asks Procurement, shows the message sent', /Asked: Procurement/.test(panel2) && /Asked/.test(panel2.replace(/Asked: Procurement/g, '')), panel2.slice(0, 200));
  await demo.keyboard.press('Escape'); await back(demo);
  await openCard(demo, 'Upload check');
  await demo.locator('section[aria-label="Upload check"] [data-card-head]').getByRole('button', { name: 'Details' }).click(); await demo.waitForTimeout(200);
  head = (await demo.locator('section[aria-label="Upload check"]').innerText()).replace(/\s+/g, ' ');
  k = await kinds(demo);
  fixes = (await demo.locator('section[aria-label="Fix list"]').innerText()).replace(/\s+/g, ' ');
  check('Upload check: asks first if the file was uploaded; a fix list with the value of Solusi', /was this Solusi contract file uploaded/i.test(head) && /Compared: the Solusi contract file of/.test(head) && /no incident/i.test(head)
    && /End date: set the value of Solusi/.test(fixes) && /Vendor: set the value of Solusi/.test(fixes) && /Bring the contract into ServiceNow/.test(fixes), fixes.slice(0, 240));
  check('Upload check: no message is offered, Fixed is', (await demo.getByRole('button', { name: 'Email', exact: true }).count()) === 0 && /To solve/.test(head) && (await demo.getByRole('button', { name: 'Fixed', exact: true }).count()) === 3);
  await demo.screenshot({ path: join(outDir, 'contracts-demo-upload-check.png'), fullPage: true });
  await back(demo); await tiles(demo);
  await demo.getByRole('button', { name: 'Changes', exact: true }).first().click(); await demo.waitForTimeout(600);
  let ch = (await demo.locator('section[aria-label="Contract changes"]').first().innerText()).replace(/\s+/g, ' ');
  const counts = async (page) => page.locator('section[aria-label="Contract changes"] [data-fold] > button').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  let cc = await counts(demo);
  check('Contract changes: compared with the file before; 1 new, 1 left, 1 status change, 2 changed fields', /compared with the one of/.test(ch) && /5 changes/.test(ch) && /^New contracts 1/.test(cc[0]) && /^Contracts that left 1/.test(cc[1]) && /^Status changes 1/.test(cc[2]) && /^Changed fields 2/.test(cc[3]), cc.join(' ; '));
  check('…with the value before and now, and the information lines', /S - Concluded E - Ended/.test(ch) && /31 January 2026 31 January 2027/.test(ch) && /Concluded contracts? ends? in the next 90 days/.test(ch) && /1 running contract has no daily responsible\. For information: nobody is asked/.test(ch), (ch.match(/\d+ Concluded[^.]*\./) || [''])[0]);
  await demo.screenshot({ path: join(outDir, 'contracts-demo-contract-changes.png'), fullPage: true });
  const [file2] = await Promise.all([demo.waitForEvent('download'), demo.locator('main').getByRole('button', { name: 'Export', exact: true }).click()]);
  check('Export on Contract changes: one line per change', readFileSync(await file2.path(), 'utf8').trim().split('\r\n').length === 6);
  await back(demo); await back(demo);
  t = await tiles(demo);
  check('the Solusi tile counts the changes and opens the page', /5 changes since the Solusi contract file of/.test(t) && /Contract changes/.test(t));
  check('demo: no page errors, no network request', demo.errors.length === 0 && demo.requests.length === 0, demo.errors.concat(demo.requests).join(' | ').slice(0, 300));
  const phone = await page({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  await startDemo(phone);
  await openCard(phone, 'Not in Solusi');
  await phone.screenshot({ path: join(outDir, 'contracts-phone-dark.png'), fullPage: true });
  check('phone, dark: delete list opens, no errors, no sideways scroll', phone.errors.length === 0 && await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));


  console.log('== Team folder with the samples ==');
  const p = await page();
  await p.evaluate(([c]) => window.__fs.put('reports/2026-11-10_cmdb_ci.csv', c), [sample('cmdb_ci-sample.csv')]);
  await signIn(p, 'Test Manager', 'test.manager@example.com');
  await loadLatest(p);
  check('CI report only: the contract cards are grey with a note', /Not tested/.test(await card(p, 'Not in Solusi')) && /no Solusi contract file and no ServiceNow contract report/.test(await cardTip(p, 'Not in Solusi')), await cardTip(p, 'Not in Solusi'));
  // Load latest report takes the newest file of each type: the Solusi contract file of a week earlier goes first.
  await p.evaluate(([e]) => window.__fs.put('reports/2026-11-04_solusi_contracts.csv', e), [sample('solusi-contracts-sample-earlier.csv')]);
  await loadLatest(p);
  await p.evaluate(([s, c]) => Promise.all([window.__fs.put('reports/2026-11-09_solusi_contracts.csv', s), window.__fs.put('reports/2026-11-11_servicenow_contracts.csv', c)]),
    [sample('solusi-contracts-sample.csv'), sample('servicenow-contracts-sample.csv')]);
  await loadLatest(p);
  const tt = await tiles(p);
  check('contract files loaded after the CI report: tiles', /7 contracts · 0 terminated in the last 7 days/.test(tt) && /10 contracts/.test(tt), (tt.match(/Solusi contract file.*$/) || [tt])[0].slice(0, 300));
  check('…and the cards say to load the CI report again', /loaded, but after this CI report/.test(await cardTip(p, 'Not in Solusi')), await cardTip(p, 'Not in Solusi'));
  await p.evaluate(([c]) => window.__fs.put('reports/2026-11-11_cmdb_ci.csv', c), [sample('cmdb_ci-sample.csv')]);
  await loadLatest(p);
  check('Not in Solusi: 4 contracts', /To solve, 4 contracts/.test(await card(p, 'Not in Solusi')), await card(p, 'Not in Solusi'));
  check('To clear by hand: 1 contract', /To solve, 1 contract/.test(await card(p, 'To clear by hand')), await card(p, 'To clear by hand'));
  check('Contract status: 3 contracts', /To solve, 3 contracts/.test(await card(p, 'Contract status')), await card(p, 'Contract status'));
  check('For Procurement: 3 contracts', /To solve, 3 contracts/.test(await card(p, 'For Procurement')), await card(p, 'For Procurement'));
  check('Upload check: 3 contracts to solve', /To solve, 3 contracts/.test(await card(p, 'Upload check')), await card(p, 'Upload check'));
  check('Contracts to fix in ServiceNow: 1 contract', /To solve, 1 contract/.test(await card(p, 'Contracts to fix in ServiceNow')), await card(p, 'Contracts to fix in ServiceNow'));
  await openCard(p, 'Not in Solusi');
  const marks = await p.locator('section[aria-label="Delete list"] tbody tr').evaluateAll((rows) => rows.map((row) => /Still linked/.test(row.innerText)));
  const linked = marks.filter(Boolean).length;
  check('delete list: 4 lines, 2 with the note Still linked, not put first', marks.length === 4 && linked === 2 && !marks[0], `lines ${marks.length}, still linked ${linked}`);
  await p.locator('section[aria-label="Delete list"]').getByRole('button', { name: 'Deleted', exact: true }).last().click(); await p.waitForTimeout(800);
  check('Deleted is saved with the name', /Marked deleted Test Manager/.test((await p.locator('section[aria-label="Delete list"]').innerText()).replace(/\s+/g, ' ')));
  await back(p);
  await setProcurement(p);
  await openCard(p, 'For Procurement');
  await p.getByRole('button', { name: 'Email', exact: true }).click(); await p.waitForTimeout(1200);
  const m = await draft(p);
  check('one message to Procurement, four tables, nobody copied', m.drafts === 1 && m.tables === 4 && m.cc === '' && m.to === 'procurement@example.com', `${m.subject} | tables ${m.tables}`);
  await p.locator('dialog[open]').getByRole('button', { name: 'Send from mailbox' }).click(); await p.waitForTimeout(1200);
  check('Send writes one message to the outbox folder', /Handed to the shared mailbox/.test(await p.locator('dialog[open]').innerText()) && (await p.evaluate(() => window.__fs.list())).filter((f) => /^outbox\//.test(f)).length === 1);
  await p.keyboard.press('Escape'); await back(p); await tiles(p);
  await p.getByRole('button', { name: 'Changes', exact: true }).first().click(); await p.waitForTimeout(800);
  const changes = await p.locator('section[aria-label="Contract changes"] [data-fold] > button').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  check('Contract changes against the file of 4 November: 1 new, 1 left, 1 status change, 2 changed fields', /^New contracts 1/.test(changes[0]) && /^Contracts that left 1/.test(changes[1]) && /^Status changes 1/.test(changes[2]) && /^Changed fields 2/.test(changes[3]), changes.slice(0, 4).join(' ; '));
  await back(p); await back(p);
  const files = await p.evaluate(() => window.__fs.list());
  check('folder: the loads are in data/runs/solusi and data/runs/contracts, the CI runs beside them', files.filter((f) => /^data\/runs\/solusi\//.test(f)).length === 2 && files.some((f) => /^data\/runs\/contracts\/2026-11-11_/.test(f)) && files.filter((f) => /^data\/runs\/[^/]+\.json$/.test(f)).length === 2, files.filter((f) => /^data\/runs\//.test(f)).join(', '));
  // A second visit: pick the folder again (the headless browser cannot read a stored folder handle back).
  await p.reload(); await p.getByRole('button', { name: /^Open folder$/ }).click(); await p.waitForSelector('section button[aria-pressed][aria-label]', { timeout: 30000 }); await p.waitForTimeout(1500);
  check('second visit: numbers and the mark are still there', /To solve, 4 contracts/.test(await card(p, 'Not in Solusi')) && /1 of 4 marked as deleted/.test(await cardText(p, 'Not in Solusi')), await cardText(p, 'Not in Solusi'));
  check('folder mode: no page errors, no network request', p.errors.length === 0 && p.requests.length === 0, p.errors.concat(p.requests).join(' | ').slice(0, 300));
  return close();
}

if (process.argv[1] === import.meta.filename) { const result = await contracts(); process.exit(result.failed.length ? 1 : 0); }
