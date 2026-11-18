// The first page in the browser (version 0.30.0, build L2 of the new look): a header of one row at every size, My day with
// its four boxes (or one line of counters when folded), the Reports line, the filter row with the menu Filter, the cards
// as cards or as lines, and new and solved since the report before. Invented data only.
// Run: node tests/browser/firstscreen.mjs (after npm run build).
import { join } from 'node:path';
import { cardData, cardTip, filter, loadLatest, open, sample, signIn, startDemo, tiles } from './harness.mjs';

const RANK = { red: 0, review: 1, marked: 2, green: 3, grey: 4 };
const flat = (text) => text.replace(/\s+/g, ' ').trim();

export async function firstScreen() {
  const { page, check, close, outDir } = await open('The first page');

  console.log('== Demo on a 1366 × 768 laptop ==');
  const p = await page({ viewport: { width: 1366, height: 768 } });
  await startDemo(p);
  const toastBox = await p.locator('[role=status][aria-live]').boundingBox();
  const toastText = flat(await p.locator('[role=status][aria-live]').innerText());
  check('the toast says "Reports loaded" with Details, in the bottom right corner', /^Reports loaded ?Details$/.test(toastText) && toastBox && toastBox.x + toastBox.width > 1366 - 40 && toastBox.x > 1366 / 2, `${toastText} at ${JSON.stringify(toastBox)}`);
  const line = flat(await p.locator('[data-reports-line]').innerText());
  check('every report fresh: one line "Reports 5 reports · 13 Nov · fresh"', /^Reports 5 reports · \d+ \w+ · fresh Show$/.test(line), line);
  check('the tiles and the message of the load are closed until Show or Details is pressed', (await p.locator('#report-tiles').count()) === 0 && (await p.locator('[data-load-message]').count()) === 0);
  await p.locator('[role=status][aria-live]').getByRole('button', { name: 'Details' }).click();
  await p.waitForTimeout(300);
  check('Details opens the tiles and the message of the load', (await p.locator('#report-tiles').count()) === 1, `${await p.locator('#report-tiles').count()} ${await p.locator('[data-load-message]').count()} ${flat(await p.locator('[data-reports-line]').innerText())}`);
  await p.locator('[data-reports-line]').getByRole('button', { name: 'Hide' }).click();
  await p.waitForTimeout(300);

  console.log('== My day ==');
  check('the first page is My day, open in the header', (await p.locator('h1').innerText()) === 'My day' && (await p.locator('header nav [aria-current="page"]').innerText()).trim() === 'My day');
  const boxes = await p.locator('[data-myday]').evaluateAll((els) => els.map((el) => ({ id: el.getAttribute('data-myday'), rows: el.querySelectorAll('[data-row]').length, count: Number(el.querySelector('[data-count]')?.textContent || 0), empty: !!el.querySelector('[data-empty]') })));
  check('four boxes: replies, reminders, to escalate, new', boxes.map((box) => box.id).join(',') === 'replies,reminders,escalate,new', JSON.stringify(boxes));
  check('each box shows at most three rows, or says it has nothing in one line', boxes.every((box) => box.rows <= 3 && (box.rows > 0 || box.empty)), JSON.stringify(boxes));
  check('the demo has a reply, a reminder and an escalation to show', boxes.slice(0, 3).every((box) => box.count >= 1 && box.rows >= 1), JSON.stringify(boxes));
  const escalate = flat(await p.locator('[data-myday="escalate"] [data-row]').first().innerText());
  check('a row of To escalate names the person and its button says who gets the escalation', /no reply/.test(escalate) && /Escalate to \S/.test(escalate), escalate);
  await p.locator('[data-myday="reminders"]').getByRole('button', { name: 'Remind' }).first().click();
  await p.waitForTimeout(500);
  check('Remind opens the email window', (await p.getByRole('dialog').count()) === 1);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check('Get replies is in My day, not in the header', (await p.locator('[data-myday-page]').getByRole('button', { name: 'Get replies' }).count()) === 1 && (await p.locator('header').getByRole('button', { name: 'Get replies' }).count()) === 0);
  await p.screenshot({ path: join(outDir, 'firstscreen-laptop.png') });
  await p.getByRole('button', { name: 'Hide', exact: true }).click();
  await p.waitForTimeout(300);
  const folded = flat(await p.locator('[data-myday-line]').innerText());
  check('Hide folds My day into one line of counters', (await p.locator('[data-myday]').count()) === 0 && /Get replies/.test(folded) && /\d+ reminders?/.test(folded) && /\d+ answered/.test(folded) && /\d+ escalations?/.test(folded), folded);
  check('the fold is kept on this computer', (await p.evaluate(() => localStorage.getItem('sacm-workbench.my-day'))) === 'folded');
  const first = await p.locator('section[aria-labelledby^="section-"] button[aria-pressed]').first().boundingBox();
  check('My day folded: the first row of cards starts above pixel 560', first && first.y < 560, String(first?.y));
  check('no Start screen in the header', (await p.locator('header').getByText('Start screen').count()) === 0);
  check('Choose reports is only under More', (await p.getByRole('button', { name: /Choose reports/ }).count()) === 0);
  await p.locator('header').getByRole('button', { name: 'More' }).click();
  check('More holds Choose reports', (await p.getByRole('menuitem', { name: /Choose reports/ }).count()) === 1);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  check('Escape closes More', (await p.getByRole('menu').count()) === 0);
  await p.getByRole('button', { name: 'Settings', exact: true }).click();
  check('without a folder, Settings offers Start screen', (await p.getByRole('dialog').getByRole('button', { name: 'Start screen' }).count()) === 1);
  await p.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();
  await p.waitForTimeout(300);

  console.log('== Cards ==');
  const sections = await p.locator('section[aria-labelledby^="section-"]').evaluateAll((els) => els.map((section) => [...section.querySelectorAll('button[aria-pressed]')].map((card) => ({
    light: card.getAttribute('data-light'), later: card.hasAttribute('data-later'), label: card.getAttribute('aria-label'), size: Number(card.querySelector('[data-number] b')?.textContent.replace(/,/g, '') || 0),
    topic: card.getAttribute('data-topic') || '', tip: card.getAttribute('data-tip') || '', height: card.getBoundingClientRect().height
  }))));
  // The cards to clarify when there is time come after the daily cards of the section, in the same order (D182).
  const inOrder = (list) => list.every((card, index) => index === 0 || RANK[list[index - 1].light] < RANK[card.light] || (RANK[list[index - 1].light] === RANK[card.light] && (card.light !== 'red' || list[index - 1].size >= card.size)));
  const ordered = sections.every((list) => {
    const at = list.findIndex((card) => card.later);
    return (at < 0 || list.slice(at).every((card) => card.later)) && inOrder(list.filter((card) => !card.later)) && inOrder(list.filter((card) => card.later));
  });
  check('inside each section: to solve first and biggest first, then to check, waiting, OK; not tested last; then the cards for when there is time', ordered, sections.map((list) => list.map((card) => `${card.light}:${card.size}`).join(' ')).join(' | '));
  const all = sections.flat();
  check('every card knows its subject: CI, Relationship, EPO, Contract or Lifecycle', all.every((card) => /^(CI|Relationship|EPO|Contract|Lifecycle)$/.test(card.topic)), [...new Set(all.map((card) => card.topic))].join(', '));
  check('every card has its hint (or its notes) as tooltip', all.every((card) => card.tip.length > 10), all.filter((card) => card.tip.length <= 10).map((card) => card.label).join('; '));
  check('all cards have the same height', new Set(all.map((card) => Math.round(card.height))).size === 1, [...new Set(all.map((card) => Math.round(card.height)))].join(', '));
  const counts = flat((await p.locator('[data-section-count]').allInnerTexts()).join(' | '));
  check('a section counts cards by state, no findings: "3 to solve · 1 to check"', /\d+ to solve/.test(counts) && !/finding/.test(counts), counts);
  await p.getByRole('group', { name: 'Show cards about' }).getByRole('button', { name: 'Relationships' }).click();
  await p.waitForTimeout(300);
  const topics = await p.locator('section[aria-labelledby^="section-"] button[aria-pressed]').evaluateAll((els) => els.map((el) => el.getAttribute('data-topic')));
  check('the subject Relationships shows only the relationship cards', topics.length > 0 && topics.every((topic) => topic === 'Relationship'), topics.join(', '));
  await p.getByRole('group', { name: 'Show cards about' }).getByRole('button', { name: 'All' }).click();
  const partly = p.locator('section[aria-labelledby^="section-"] [data-partly]').first();
  if (await partly.count()) {
    const tip = await partly.locator('xpath=ancestor::button[1]').getAttribute('data-tip');
    check('"Partly tested" is a chip on the card, its notes the tooltip', (await partly.innerText()).trim() === 'Partly tested' && /^Partly tested\. \S/.test(tip || ''), tip);
  } else check('"Partly tested" is a chip on the card, its notes the tooltip', false, 'no partly tested card in the demo');

  console.log('== Filter ==');
  const before = (await p.locator('section[aria-labelledby^="section-"] button[aria-pressed]').count());
  await filter(p, 'To solve');
  const red = await p.locator('section[aria-labelledby^="section-"] button[aria-pressed]').evaluateAll((els) => els.map((el) => `${el.getAttribute('data-light')}${el.hasAttribute('data-later') ? '-later' : ''}`));
  check('the filter To solve leaves the daily cards to solve, and shows a chip', red.length > 0 && red.length < before && red.every((light) => light === 'red' || light === 'marked') && (await p.locator('[data-filter-chip="onlyRed"]').innerText()).trim() === 'To solve', red.join(' '));
  await p.locator('[data-filter-chip="onlyRed"]').click();
  await p.waitForTimeout(300);
  check('the x of the chip takes the filter away', (await p.locator('[data-filter-chip]').count()) === 0 && (await p.locator('section[aria-labelledby^="section-"] button[aria-pressed]').count()) === before);

  console.log('== Lines ==');
  await p.getByRole('group', { name: 'Show the cards as' }).getByRole('button', { name: 'Lines' }).click();
  await p.waitForTimeout(300);
  const lines = await p.locator('[data-lines] > button').evaluateAll((els) => els.map((el) => { const box = el.getBoundingClientRect(); return { h: Math.round(box.height), x: Math.round(box.x) }; }));
  check('Lines: each card is one line of 36 px, in two columns on a laptop', lines.length === before && lines.every((one) => one.h === 36) && new Set(lines.map((one) => one.x)).size === 2, JSON.stringify(lines.slice(0, 4)));
  check('the choice is kept on this computer', (await p.evaluate(() => localStorage.getItem('sacm-workbench.cards-as'))) === 'lines');
  const lineFirst = await p.locator('[data-lines] > button').first().boundingBox();
  await p.screenshot({ path: join(outDir, 'firstscreen-lines.png') });
  check('Lines with My day folded: the first line starts above pixel 520', lineFirst && lineFirst.y < 520, String(lineFirst?.y));

  console.log('== Header at four widths ==');
  for (const width of [960, 1280, 1366, 1920]) {
    await p.setViewportSize({ width, height: 800 });
    await p.waitForTimeout(200);
    // One row: the name, the pages and the buttons share one middle line, and the header stays one line high.
    const middles = await p.locator('[data-header] > *').evaluateAll((els) => els.map((e) => { const box = e.getBoundingClientRect(); return Math.round(box.top + box.height / 2); }));
    const height = (await p.locator('[data-header]').boundingBox()).height;
    const words = await p.locator('header nav button').evaluateAll((els) => els.map((el) => [...el.querySelectorAll('span')].filter((span) => getComputedStyle(span).position !== 'absolute' && span.getBoundingClientRect().width > 1).map((span) => span.textContent).join('')));
    check(`at ${width} pixels the header is one row`, Math.max(...middles) - Math.min(...middles) <= 4 && height < 70, `middles ${middles.join(', ')}, height ${height}`);
    if (width < 1250) check(`at ${width} pixels the pages show their icon, the open one its word`, words.filter(Boolean).join() === 'My day', words.join(','));
  }
  await p.setViewportSize({ width: 960, height: 900 });
  await p.waitForTimeout(200);
  const narrow = await p.locator('[data-lines] > button').evaluateAll((els) => new Set(els.map((el) => Math.round(el.getBoundingClientRect().x))).size);
  check('under 1250 pixels the lines take one column', narrow === 1, String(narrow));
  await p.setViewportSize({ width: 1366, height: 768 });
  const opened = await tiles(p);
  check('Show opens the five tiles; no tile repeats an old-report warning', (await p.locator('#report-tiles > div').count()) === 5 && !/days old\. Load a newer one/.test(opened), opened.slice(0, 200));

  console.log('== Team folder: the report before, then the newest ==');
  const f = await page({ viewport: { width: 1366, height: 768 } });
  const earlier = sample('cmdb_ci-sample.csv');
  // The newest report: one description fixed (solved), one emptied (new).
  const newest = earlier.replace(',TBD,', ',Index tool that checks the full index every night,').replace(',Capability to register and maintain library members,', ',,');
  await f.evaluate((c) => window.__fs.put('reports/2026-11-05_cmdb_ci.csv', c), earlier);
  await signIn(f, 'Test Manager', 'test.manager@example.com');
  await loadLatest(f);
  const onlyCi = flat(await f.locator('[data-reports-line]').innerText());
  check('a report missing: the line says which and opens to the tiles by itself', /1 of 5 reports/.test(onlyCi) && /not loaded: /.test(onlyCi) && (await f.locator('#report-tiles').count()) === 1, onlyCi);
  check('the report is old: the warning is written once, on the line', /The CI report is \d+ days old\. Load a newer one before you write to people\./.test(onlyCi) && (await f.getByText(/days old\. Load a newer one/).count()) === 1, onlyCi);
  check('one report only: the box New says there is nothing to compare with', (await f.locator('[data-since-total]').count()) === 0 && /nothing to compare with/.test(await f.locator('[data-myday="new"]').innerText()));
  await f.evaluate((c) => window.__fs.put('reports/2026-11-12_cmdb_ci.csv', c), newest);
  await loadLatest(f);
  const since = flat(await f.locator('[data-since-total]').innerText().catch(() => ''));
  check('a line gives the totals: "Since the report of 5 Nov: … new, … solved."', /^Since the report of 5 Nov: \d+ new, \d+ solved\.$/.test(since), since);
  const fresh = flat(await f.locator('[data-myday="new"]').innerText());
  check('the box New since the last report: Description, 1 new CI, 1 solved, and Open', /Description 1 new CI · 1 solved since 5 Nov Open/.test(fresh), fresh);
  const desc = flat(await f.locator('section button[aria-pressed][aria-label^="Description:"]').innerText());
  check('the card Description shows "+1 new"', /\+1 new/.test(desc), desc);
  await filter(f, 'New');
  const onlyNew = await f.locator('section[aria-labelledby^="section-"] button[aria-pressed]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label').split(':')[0]));
  check('the filter New leaves the cards with new findings', onlyNew.includes('Description') && onlyNew.length < 10, onlyNew.join(', '));
  check('the tooltip of a card is its hint', (await cardTip(f, 'Description')).length > 20 && (await cardData(f, 'Description', 'topic')) === 'CI');
  await f.screenshot({ path: join(outDir, 'firstscreen-since.png') });

  for (const one of [p, f]) check('no page error and no network request', !one.errors.length && !one.requests.length, one.errors.concat(one.requests).join('; '));
  return close();
}

if (process.argv[1] === import.meta.filename) { const result = await firstScreen(); process.exit(result.failed.length ? 1 : 0); }
