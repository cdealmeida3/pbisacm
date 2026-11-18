// Each card drawn as what it is, and the case panel (version 0.22.0, words and parts of build L3, version 0.31.0): the four kinds of card, a fix list with pages,
// marks, Undo and the waiting colour, a card SACM checks first, a review list, the one message of For Procurement, cards
// with nothing to do, and a status that changes only the ticked problem. Invented data only.
// Run: node tests/browser/cards.mjs (after npm run build).
import { join } from 'node:path';
import { back, card, cardText, filter, loadLatest, open, openCard, sample, signIn, startDemo, unfoldAll } from './harness.mjs';

const flat = (text) => text.replace(/\s+/g, ' ');
const sectionOf = (p, label) => p.locator(`section[aria-label="${label}"]`);
const textOf = async (p, label) => flat(await sectionOf(p, label).innerText());
const toolbar = async (p, label) => ((await sectionOf(p, label).locator('[data-toolbar]').count()) ? flat(await sectionOf(p, label).locator('[data-toolbar]').innerText()) : '');
const findings = async (p) => (await p.locator('section[aria-labelledby^="section-"] button[aria-pressed]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label').split(':')[0]))).sort().join(' | ');

/** The invented CI report with 120 more Business Capabilities in Ready since 2024: a fix list longer than two pages. */
function longReport() {
  const lines = sample('cmdb_ci-sample.csv').split(/\r?\n/);
  // 120 Operational capabilities whose name holds two spaces in a row: lines of the SACM list Duplicate names.
  const live = lines.filter((line) => line.startsWith('Manage Member Records,'))[0];
  const more = Array.from({ length: 120 }, (_, index) => live.replace('Manage Member Records', `Invented  Capability ${String(index + 1).padStart(3, '0')}`).replace(/AST-\d+/, `AST-9${String(index + 1).padStart(3, '0')}`));
  return lines.filter(Boolean).concat(more).join('\n') + '\n';
}

export async function cardKinds() {
  const { page, check, close, outDir } = await open('Each card as its kind');

  console.log('== The demo: four kinds of card ==');
  const demo = await page();
  let boxes = 0;
  demo.on('dialog', (dialog) => { boxes += 1; void dialog.dismiss(); });
  await startDemo(demo);
  const kinds = await demo.locator('section button[aria-pressed][data-kind]').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('aria-label').split(':')[0], e.getAttribute('data-kind')])));
  check('the overview knows the four kinds', kinds['Owner or manager missing'] === 'owners' && kinds['Relationship entered twice'] === 'fix' && kinds['EPO update not arrived'] === 'review' && kinds['No criticality reaches the CI'] === 'review' && kinds['For Procurement'] === 'mailbox', JSON.stringify(kinds).slice(0, 200));
  check('Hidden character in name and Too many partners are SACM fix lists', kinds['Hidden character in name'] === 'fix' && kinds['Too many partners'] === 'fix');
  const before = await findings(demo);

  console.log('-- a fix list --');
  const fixCard = await cardText(demo, 'Application ≠ Instance');
  check('fix list on the first screen: its lines, no people and nobody contacted', /To solve 6 lines/.test(fixCard) && !/people|person|contacted|free/i.test(fixCard), fixCard);
  await openCard(demo, 'Application ≠ Instance');
  let text = await textOf(demo, 'Application ≠ Instance');
  check('fix list: the head counts the lines to fix and the lines fixed', /6 To fix/.test(text) && /0 Fixed/.test(text) && /0 of 6 marked as fixed\./.test(text), text.slice(0, 200));
  check('fix list: never the words people, contacted, Email, stays red', !/\bpeople\b|\bcontacted\b|Email|stays red/.test(text), (text.match(/.{30}(people|contacted|Email|stays red).{30}/) || [''])[0]);
  const bar = await toolbar(demo, 'Application ≠ Instance');
  const fixSection = sectionOf(demo, 'Application ≠ Instance');
  check('fix list toolbar: Filter, Share out, Export and Mark fixed, grey with its reason; no Sort', /Filter/.test(bar) && /Share out/.test(bar) && /Export/.test(bar) && /Tick a line first/.test(bar) && /Mark fixed/.test(bar) && !/Sort/.test(bar) && await fixSection.locator('[data-mark-ticked]').isDisabled(), bar);
  // W5 (D242): one record per CI, every change on its own line under it, each value to set with Copy.
  const records = fixSection.locator('[data-record]');
  const firstLines = await records.first().locator('tr').count();
  check('fix list: one record per CI, with all its changes; 6 lines on fewer records', (await records.count()) < 6 && firstLines > 1 && (await fixSection.locator('[data-record] tr').count()) === 6, `${await records.count()} records, ${firstLines} lines in the first`);
  check('fix list: a value to set has Copy; without a ServiceNow address no link, and the head says where to set it', (await fixSection.locator('[data-copy]').count()) > 0 && (await fixSection.locator('[data-servicenow]').count()) === 0 && /set the ServiceNow address in Settings, Mailboxes/.test(text), (text.match(/To open[^.]*\./) || [''])[0]);
  // Share out (W5): each free record goes to a manager in turn; the initials show on the record.
  await fixSection.getByRole('button', { name: 'Share out', exact: true }).click(); await demo.waitForTimeout(300);
  const share = demo.locator('dialog[open]');
  check('Share out asks first, with records and lines per manager', /Share out \d+ free records?\?/.test(flat(await share.innerText())) && /\d+ records? \(\d+ lines?\)/.test(flat(await share.innerText())), flat(await share.innerText()).slice(0, 200));
  await share.getByRole('button', { name: 'Share out', exact: true }).click(); await demo.waitForTimeout(600);
  check('after Share out every record carries the initials of its manager, and nothing is free', (await fixSection.locator('[data-record] [aria-label^="Assigned to "]').count()) === (await records.count()) && /Every record is taken/.test(await toolbar(demo, 'Application ≠ Instance')), await toolbar(demo, 'Application ≠ Instance'));
  await fixSection.getByRole('button', { name: 'Fixed', exact: true }).first().click(); await demo.waitForTimeout(500);
  text = await textOf(demo, 'Application ≠ Instance');
  const said = flat(await demo.locator('[role=status]').first().innerText().catch(() => ''));
  check('one record marked: every line of it, teal, who and when, one Undo, and a message confirms', /Marked fixed Demo User, \d+ \w+/.test(text) && (await fixSection.locator('[data-marked-line]').count()) === 1 && (await fixSection.locator('[data-marked]').count()) === firstLines && (await fixSection.getByRole('button', { name: 'Undo', exact: true }).count()) === 1 && /Marked fixed/.test(said) && new RegExp(`${firstLines} of 6 marked as fixed\\.`).test(text), said);
  await sectionOf(demo, 'Application ≠ Instance').getByRole('button', { name: 'Undo', exact: true }).click(); await demo.waitForTimeout(400);
  check('Undo takes the mark away', /0 of 6 marked as fixed\./.test(await textOf(demo, 'Application ≠ Instance')));
  await fixSection.getByLabel('Tick every line shown').first().click(); await demo.waitForTimeout(200);
  check('ticking every line shown: the button says Mark 6 fixed', /^Mark 6 fixed$/.test((await fixSection.locator('[data-mark-ticked]').innerText()).trim()) && await fixSection.locator('[data-mark-ticked]').isEnabled(), await fixSection.locator('[data-mark-ticked]').innerText());
  await fixSection.locator('[data-mark-ticked]').click(); await demo.waitForTimeout(300);
  const ask = demo.locator('dialog[open]');
  check('Mark 6 fixed: the question is the app\'s own dialog', (await ask.count()) === 1 && /Mark 6 fixed\?/.test(flat(await ask.innerText())) && boxes === 0, flat(await ask.innerText().catch(() => '')).slice(0, 160));
  await ask.getByRole('button', { name: 'Mark 6', exact: true }).click(); await demo.waitForTimeout(600);
  text = await textOf(demo, 'Application ≠ Instance');
  check('every line marked: the card says the next report checks it', /All marked as fixed\. The next report checks it\./.test(text) && /All marked as fixed/.test(text.slice(0, 120)), text.slice(0, 160));
  await demo.screenshot({ path: join(outDir, 'cards-fix-list-marked.png'), fullPage: true });
  await back(demo);
  const waitingCard = demo.locator('section button[aria-pressed][aria-label^="Application ≠ Instance:"]').first();
  check('first screen: the card takes the waiting colour and says so', (await waitingCard.getAttribute('data-light')) === 'marked' && /All marked as fixed 6 lines$/.test(await cardText(demo, 'Application ≠ Instance')) && /The next report checks it\./.test(await waitingCard.getAttribute('data-tip')), await cardText(demo, 'Application ≠ Instance'));
  check('the same cards stay on the first screen', (await findings(demo)) === before, `${before} -> ${await findings(demo)}`);
  await filter(demo, 'To solve');
  check('the filter To solve still shows it (it is still to solve)', (await waitingCard.count()) === 1);
  await filter(demo, 'To solve');

  console.log('-- a review list --');
  await openCard(demo, 'EPO update not arrived');
  text = await textOf(demo, 'EPO update not arrived');
  check('review list: the head counts what to check, the columns CI, What the report shows, State, Since', /1 To check/.test(text) && /CI What the report shows State Since/.test(text), text.slice(0, 160));
  check('review list: the text at the top is why it is listed', /ServiceNow should follow EPO by itself: listed for a review of the sync\./.test(text));
  check('review list: never the words to solve, fixed, stays red, Email, Now, Set to', !/to solve|\bfixed\b|stays red|Email|Set to/i.test(text.replace(/Not counted as to solve[^.]*\./, '')), (text.match(/.{30}(to solve|fixed|stays red|Email|Set to).{30}/i) || [''])[0]);
  check('review list toolbar: search and Export only', /Export/.test(await toolbar(demo, 'EPO update not arrived')) && !/Sort|Share out|Mark/.test(await toolbar(demo, 'EPO update not arrived')), await toolbar(demo, 'EPO update not arrived'));
  await sectionOf(demo, 'EPO update not arrived').getByLabel('Incident number').fill('INC0012345');
  await sectionOf(demo, 'EPO update not arrived').getByRole('button', { name: 'Keep number', exact: true }).click(); await demo.waitForTimeout(500);
  check('review list: one incident number is kept on the lines', /INC0012345/.test(await textOf(demo, 'EPO update not arrived')));
  await demo.screenshot({ path: join(outDir, 'cards-review-list.png'), fullPage: true });
  await back(demo);

  console.log('-- one mailbox --');
  const mailCard = await cardText(demo, 'For Procurement');
  check('For Procurement on the first screen: its contracts, not asked yet, no groups', /To solve 3 contracts Not asked yet/.test(mailCard) && !/free/.test(mailCard), mailCard);
  await openCard(demo, 'For Procurement');
  text = await textOf(demo, 'For Procurement');
  check('For Procurement: problems and contracts in the head, one line for the one message', /4 Problems/.test(text) && /3 Contracts/.test(text) && (await sectionOf(demo, 'For Procurement').locator('[data-one-message]').count()) === 1 && /One email to Procurement/.test(text), text.slice(0, 300));
  check('For Procurement: the mailbox warning once, with a link to Settings', (text.match(/The Procurement mailbox has no email yet/g) || []).length === 1 && (await sectionOf(demo, 'For Procurement').getByRole('button', { name: 'Open Settings' }).count()) === 1);
  const mailMore = sectionOf(demo, 'For Procurement').locator('[data-toolbar]').getByRole('button', { name: 'More', exact: true });
  await mailMore.click(); await demo.waitForTimeout(200);
  const mailMenu = flat(await demo.getByRole('menu').innerText());
  await demo.keyboard.press('Escape'); await demo.waitForTimeout(200);
  check('For Procurement: no groups, no Share out, one More for the whole card (Note, Take, Assign to)', !/Free|Share out/.test(text) && (await mailMore.count()) === 1 && /Note/.test(mailMenu) && /Take/.test(mailMenu) && /Assign to/.test(mailMenu) && (await sectionOf(demo, 'For Procurement').locator('[data-kind-table]').count()) === 4, mailMenu);
  await sectionOf(demo, 'For Procurement').getByRole('button', { name: 'Open Settings' }).click(); await demo.waitForTimeout(400);
  check('the link opens Settings', (await demo.getByRole('group', { name: 'Procurement mailbox' }).getByLabel(/^Email/).count()) === 1);
  await demo.keyboard.press('Escape'); await demo.waitForTimeout(300);
  await demo.screenshot({ path: join(outDir, 'cards-mailbox.png'), fullPage: true });
  await back(demo);

  console.log('-- owners --');
  await openCard(demo, 'Owner or manager missing');
  text = await textOf(demo, 'Owner or manager missing');
  check('owners: the head counts To solve, People and Free', /6 To solve/.test(text) && /4 People/.test(text) && /5 Free/.test(text), text.slice(0, 260));
  check('owners: only the first group is open, and only it has the navy button', (await sectionOf(demo, 'Owner or manager missing').locator('article:not([data-folded])').count()) === 1 && (await sectionOf(demo, 'Owner or manager missing').locator('article[data-folded]').count()) === 4);
  const nobody = sectionOf(demo, 'Owner or manager missing').locator('article', { hasText: 'No Owned by and no Managed by' }).first();
  const nobodyText = flat(await nobody.innerText());
  check('a group with nobody to ask says why and offers no Email and no Teams', /^Nobody to ask/.test(nobodyText) && /No Owned by and no Managed by/.test(nobodyText) && (await nobody.getByRole('button', { name: /^(Email|Teams)$/ }).count()) === 0 && !/Not asked yet/.test(nobodyText), nobodyText.slice(0, 200));
  await nobody.locator('[data-group-head]').getByRole('button', { name: 'More', exact: true }).click(); await demo.waitForTimeout(200);
  const groupMenu = flat(await demo.getByRole('menu').innerText());
  await demo.keyboard.press('Escape'); await demo.waitForTimeout(200);
  check('it offers Stop following, and More: Note, Take, Assign to, Export', (await nobody.getByRole('button', { name: 'Stop following', exact: true }).count()) === 1 && /Note/.test(groupMenu) && /Take/.test(groupMenu) && /Assign to/.test(groupMenu) && /Export/.test(groupMenu), groupMenu);
  check('the fix place is in Details only when every line has the same one; else on each group', (await sectionOf(demo, 'Owner or manager missing').locator('[data-fix-place]').count()) === 0 && /Fix in ServiceNow/.test(nobodyText) && /Fix in EPO/.test(text), nobodyText.slice(0, 120));
  await back(demo);
  await openCard(demo, 'Duplicate names');
  text = await textOf(demo, 'Duplicate names');
  check('two CIs of the same name show their EPO ID', (text.match(/Manage Fines ?EPO ID AST-00\d\d/g) || []).length === 2, (text.match(/Manage Fines.{0,30}/g) || []).join(' | '));
  await back(demo);
  await openCard(demo, 'Support group inactive');
  const toMap = flat(await sectionOf(demo, 'Support group inactive').locator('tbody tr').first().innerText());
  check('the chip "to map" is shown without the tag Descoped beside it', /to map/.test(toMap) && !/Descoped/.test(toMap), toMap);
  await back(demo);

  console.log('-- cards with nothing to do --');
  await openCard(demo, 'EPO ID');
  text = await textOf(demo, 'EPO ID');
  check('an OK card: one sentence with how many CIs were tested, no toolbar, no table', /Tested on \d+ CIs\. Nothing to solve\./.test(text) && (await toolbar(demo, 'EPO ID')) === '' && (await sectionOf(demo, 'EPO ID').locator('table').count()) === 0 && !/0 CIs to solve/.test(text), text.slice(-120));
  await back(demo);
  await openCard(demo, 'Offering parent');
  text = await textOf(demo, 'Offering parent');
  check('a card that was not tested says why, never "0 to solve"', /Not tested: the report has no Parent column/.test(text) && /This is not the same as OK\./.test(text) && !/0 (CIs|lines) to/.test(text) && (await toolbar(demo, 'Offering parent')) === '' && (text.match(/the report has no Parent column/g) || []).length === 1, text.slice(-220));
  await back(demo);

  console.log('-- the case panel: only the ticked problem --');
  await openCard(demo, 'Name not standard');
  await unfoldAll(sectionOf(demo, 'Name not standard'));
  await sectionOf(demo, 'Name not standard').getByText('Members', { exact: true }).first().click(); await demo.waitForTimeout(500);
  const panel = demo.locator('aside[aria-label^="Case:"]');
  const problems = await panel.locator('[data-problem]').count();
  const ticked = () => panel.locator('[data-problem] input[type=checkbox]:checked').count();
  const applies = flat(await panel.locator('[data-applies]').innerText());
  check('a CI with three or more problems, opened from a card: only the problem of that card is ticked', problems >= 3 && (await ticked()) === 1 && (await panel.locator('[data-problem="NAME-STANDARD"] input:checked').count()) === 1 && new RegExp(`^1 of ${await panel.locator('[data-problem] input[type=checkbox]').count()} ticked`).test(applies), `${problems} problems · ${applies}`);
  const chips = () => panel.locator('[data-problem]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-problem')}=${/In progress/.test(e.innerText) ? 'In progress' : 'other'}`));
  await panel.getByLabel('Status').selectOption('Fix in progress'); await demo.waitForTimeout(600);
  const after = await chips();
  check('a status changes only that problem', after.filter((entry) => /In progress/.test(entry)).join() === 'NAME-STANDARD=In progress', after.join(' · '));
  check('no grey buttons "Coming with the Outlook connection"', !/Coming with the Outlook connection/.test(flat(await panel.innerText())));
  await demo.screenshot({ path: join(outDir, 'cards-case-panel.png') });
  await panel.getByRole('button', { name: 'Close', exact: true }).click(); await demo.waitForTimeout(300);
  const group = flat(await sectionOf(demo, 'Name not standard').locator('article', { has: demo.getByText('Members', { exact: true }) }).first().locator('[data-group-head]').innerText());
  check('the group keeps its own badge: not "Answered" for a status set by hand', !/Answered/.test(group), group);
  await back(demo);
  await demo.getByRole('button', { name: 'Activity' }).click(); await demo.waitForTimeout(400);
  const activity = flat(await demo.locator('section[aria-label="Activity"] table[data-activity] tbody tr').first().innerText());
  check('Activity names the card of the line', /Name not standard/.test(activity) && /Status set to Fix in progress/.test(activity), activity);
  await back(demo);
  await openCard(demo, 'Application ≠ Instance');
  await sectionOf(demo, 'Application ≠ Instance').locator('tbody tr').first().click(); await demo.waitForTimeout(500);
  const fixPanel = flat(await panel.innerText());
  check('a problem SACM fixes itself: "SACM fixes it", its own Undo, and it is not ticked', /SACM fixes it: nobody is asked\./.test(fixPanel) && (await panel.locator('[data-problem="APP-INSTANCE-MATCH"] input:checked').count()) === 0 && (await panel.locator('[data-problem="APP-INSTANCE-MATCH"]').first().getByRole('button', { name: 'Undo' }).count()) === 1, (fixPanel.match(/Applies to[^.]*\./) || [''])[0]);
  await panel.getByRole('button', { name: 'Close', exact: true }).click(); await demo.waitForTimeout(300);
  check('demo: no grey box of the browser, no page errors, no network request', boxes === 0 && demo.errors.length === 0 && demo.requests.length === 0, demo.errors.concat(demo.requests).join(' | ').slice(0, 300));

  console.log('== A team folder: a card SACM checks first, and a fix list of 123 lines (122 of one class) ==');
  const p = await page();
  await p.evaluate(([c, r]) => Promise.all([window.__fs.put('reports/2026-11-11_cmdb_ci.csv', c), window.__fs.put('reports/2026-11-11_cmdb_rel_ci.csv', r)]), [longReport(), sample('cmdb_rel_ci-sample.csv')]);
  await p.evaluate((json) => window.__fs.put('data/settings.json', json), JSON.stringify({ serviceNowAddress: 'https://contoso.service-now.com' }));
  await signIn(p, 'Test Manager', 'test.manager@example.com');
  await loadLatest(p);
  const above = await cardText(p, 'Above parent');
  check('Above parent on the first screen: "1 CI to check" once, never "allowed, nothing to solve"', /To check 1 CI/.test(above) && !/to review/i.test(above) && !/allowed, nothing to solve/.test(above) && /To check, 1 CI$/.test(await card(p, 'Above parent')), `${above} | ${await card(p, 'Above parent')}`);
  await openCard(p, 'Above parent');
  text = await textOf(p, 'Above parent');
  check('Above parent: the check part comes first and is open, with the button on the line', /Check first 1 CI/.test(text) && (await sectionOf(p, 'Above parent').locator('[data-check-first]').getByRole('button', { name: 'Mapping done: ask owner' }).count()) === 1 && !/0 owners/.test(text), text.slice(0, 200));
  await sectionOf(p, 'Above parent').getByRole('button', { name: 'Mapping done: ask owner' }).click(); await p.waitForTimeout(800);
  text = await textOf(p, 'Above parent');
  check('after the button: the CI is under "Asked of the owner", with Email', /Asked of the owner: 1 group/.test(text) && (await sectionOf(p, 'Above parent').locator('[data-check-first]').count()) === 0 && (await sectionOf(p, 'Above parent').getByRole('button', { name: 'Email', exact: true }).count()) === 1, text.slice(0, 200));
  await back(p);

  const long = 'Duplicate names';
  await openCard(p, long);
  text = await textOf(p, long);
  check('a long fix list: 123 lines, the 122 of one class in pages, the first 50 shown', /123 To fix/.test(text) && /Showing 1 to 50 of 122 CIs/.test(text) && (await sectionOf(p, long).locator('tbody tr').count()) === 50, (text.match(/Showing[^P]*/) || [''])[0]);
  // W5 (D244): with the address in Settings each record opens its search in ServiceNow, in a new tab; only one person, so Share out is grey.
  const found = sectionOf(p, long).locator('[data-servicenow]').first();
  const href = (await found.getAttribute('href')) || '';
  check('with the ServiceNow address: each record has ServiceNow, a search of the CI table by its name, in a new tab', (await sectionOf(p, long).locator('[data-servicenow]').count()) === 50 && /^https:\/\/contoso\.service-now\.com\/cmdb_ci_list\.do\?sysparm_query=name%3D/.test(href) && (await found.getAttribute('target')) === '_blank' && (await sectionOf(p, long).locator('[data-no-servicenow]').count()) === 0, href);
  check('alone on the team list: Share out is grey and says why', /Add colleagues in Settings/.test(await toolbar(p, long)) && await sectionOf(p, long).getByRole('button', { name: 'Share out', exact: true }).isDisabled(), await toolbar(p, long));
  await sectionOf(p, long).getByLabel('Tick every line shown').first().click(); await p.waitForTimeout(200);
  await sectionOf(p, long).locator('[data-mark-ticked]').click(); await p.waitForTimeout(300);
  await p.locator('dialog[open]').getByRole('button', { name: 'Mark 50', exact: true }).click(); await p.waitForTimeout(1200);
  text = await textOf(p, long);
  check('ticking every line shown marks 50 lines, not the lines that are not shown', /50 of 123 marked as fixed\./.test(text), (text.match(/\d+ of 123 marked as fixed/) || [''])[0]);
  await sectionOf(p, long).getByRole('button', { name: 'Next' }).click(); await p.waitForTimeout(400);
  text = await textOf(p, long);
  check('Next: lines 51 to 100, none of them marked', /Showing 51 to 100 of 122 CIs/.test(text) && (await sectionOf(p, long).locator('[data-marked]').count()) === 0 && !(await sectionOf(p, long).getByLabel('Tick every line shown').first().isChecked()));
  await sectionOf(p, long).locator('tbody tr').nth(3).click(); await p.waitForTimeout(500);
  check('the whole line opens the case, not only the name', (await p.locator('aside[aria-label^="Case:"]').count()) === 1);
  await p.locator('aside[aria-label^="Case:"]').getByRole('button', { name: 'Close', exact: true }).click(); await p.waitForTimeout(300);
  await p.screenshot({ path: join(outDir, 'cards-fix-list-pages.png'), fullPage: true });
  await back(p);
  check('first screen: the card is still red and counts its marks', /To solve 123 lines/.test(await cardText(p, long)) && /50 of 123 marked as fixed/.test(await cardText(p, long)), await cardText(p, long));
  const journal = Object.entries(await p.evaluate(() => window.__fs.dump())).filter(([name]) => name.startsWith('data/journal/')).map(([, body]) => body).join('\n');
  const statusLine = journal.split('\n').filter((line) => /"type":"status"/.test(line))[0] || '';
  check('the journal line of the marks has the format of today: one status line with 50 keys', (journal.match(/"type":"status"/g) || []).length === 1 && (JSON.parse(statusLine).keys || []).length === 50 && JSON.parse(statusLine).text === 'Fixed', statusLine.slice(0, 160));
  check('folder: no page errors, no network request', p.errors.length === 0 && p.requests.length === 0, p.errors.concat(p.requests).join(' | ').slice(0, 300));
  return close();
}

if (process.argv[1] === import.meta.filename) {
  const result = await cardKinds();
  process.exit(result.failed.length ? 1 : 0);
}
