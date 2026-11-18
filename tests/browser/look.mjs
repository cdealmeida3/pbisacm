// The look in the browser (version 0.29.0, build L1 of the new look; version 0.30.0, L2; version 0.31.0, L3; version 0.32.0, L4; version 0.34.0, L5,
// docs/LOOK.md): on the demo, at four sizes (laptop, monitor, monitor at 125 %, half a monitor), light and dark, twenty-eight screens are measured: text
// in capitals, three dots, the smallest text, the smallest click target, the font, the words on a button, the contrast of every text, and the
// labels that wrap or are cut.
// Every count must be zero: there is no list of exceptions any more (42 wrapped or cut labels in L1, none since L2; D251).
// A label wraps when its text runs over two lines.
// Invented data only. Run: node tests/browser/look.mjs (after npm run build).
import { join } from 'node:path';
import { open, startDemo } from './harness.mjs';

const SIZES = [
  { name: 'laptop', viewport: { width: 1366, height: 768 } },
  { name: 'monitor', viewport: { width: 1920, height: 1080 } },
  { name: 'monitor at 125 %', viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 },
  { name: 'half screen', viewport: { width: 960, height: 1040 } }
];

/** Measures the page as it is shown now. Runs in the browser. */
function measure() {
  const visible = (el) => { const box = el.getBoundingClientRect(); const style = getComputedStyle(el); return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05; };
  // In a modal window only the window counts: the page behind is not in reach.
  const top = [...document.querySelectorAll('dialog[open]')].pop() || document.body;
  const all = [...top.querySelectorAll('*')].filter((el) => !el.closest('svg') && !el.closest('[aria-hidden="true"]') && visible(el));
  const texts = all.filter((el) => [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim()));
  const capitals = all.filter((el) => { const s = getComputedStyle(el); return s.textTransform === 'uppercase' || s.fontVariantCaps === 'small-caps' || s.fontVariantCaps === 'all-small-caps'; }).map((el) => el.textContent.trim().slice(0, 40));
  const dots = texts.filter((el) => /…|\.\.\./.test([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''))).map((el) => el.textContent.trim().slice(0, 60));
  const sizes = texts.filter((el) => !el.closest('.sr-only')).map((el) => ({ size: parseFloat(getComputedStyle(el).fontSize), text: el.textContent.trim().slice(0, 30) }));
  const smallest = sizes.reduce((min, one) => (one.size < min.size ? one : min), { size: 99, text: '' });
  // A target is a button, a link, a field or a tab; a link inside a sentence is an exception (WCAG 2.5.8).
  const targets = all.filter((el) => el.matches('button, a[href], input:not([type=hidden]), select, textarea, [role=tab], [role=menuitem]') && !el.closest('.sr-only'))
    .filter((el) => !(el.matches('button, a') && el.parentElement && el.parentElement.matches('p, li, span') && el.parentElement.textContent.trim().length > el.textContent.trim().length + 3))
    .map((el) => { const box = (el.matches('input[type=checkbox], input[type=radio]') && el.closest('label') ? el.closest('label') : el).getBoundingClientRect(); return { w: Math.round(box.width), h: Math.round(box.height), text: (el.getAttribute('aria-label') || el.textContent || el.type || '').trim().slice(0, 30) }; });
  const smallTargets = targets.filter((one) => one.w < 24 || one.h < 24);
  // Labels: buttons, tabs, chips and badges, headings of a section, table headers, menu items.
  const labels = all.filter((el) => el.matches('button, [role=tab], [role=menuitem], th, h1, h2, h3, label > span:first-child') && el.textContent.trim() && !el.closest('[data-card-text]'));
  // A label wraps when its words run over more than one line: the lines are counted from the boxes of its text, so a
  // tall button with one line of text is not counted. A button with rows by design (data-rows: a card, the name in the header) is counted row by row.
  const lineCount = (el) => {
    const boxes = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      if (!node.textContent.trim() || node.parentElement.closest('.sr-only, svg, [aria-hidden="true"]')) continue;
      const range = document.createRange(); range.selectNodeContents(node);
      for (const box of range.getClientRects()) if (box.width > 1) boxes.push(box);
    }
    boxes.sort((a, b) => a.top - b.top);
    let count = 0; let bottom = -Infinity;
    for (const box of boxes) { if (box.top >= bottom - 2) { count += 1; bottom = box.bottom; } else bottom = Math.max(bottom, box.bottom); }
    return count;
  };
  const rows = all.filter((el) => el.parentElement && el.parentElement.matches('[data-rows]') && !el.matches('[data-rows]'));
  const wrapped = labels.filter((el) => el.matches('button:not([data-rows]), [role=tab], [role=menuitem], th') && !el.querySelector('p, div, h2, h3, ul, table') && lineCount(el) > 1)
    .concat(rows.filter((el) => lineCount(el) > 1)).map((el) => `wrapped: ${el.textContent.trim().slice(0, 40)}`);
  const cut = texts.filter((el) => { const s = getComputedStyle(el); return (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) || (s.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1); }).map((el) => `cut: ${el.textContent.trim().slice(0, 40)}`);
  const fonts = new Set(texts.map((el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/"/g, '').trim()));
  // Words on a button (rule 4, build L5): the buttons with an icon, the tabs and the menu lines; a number is not a word.
  // A button with rows (a card, a group) or a card button holds data, a fold (aria-expanded) is the heading of a list, and
  // the agreed longer labels are allowed.
  const AGREED = /^(Escalate to .+|Mark \d+ fixed|Mapping done: ask owner|Ask the owner|Send from mailbox|Hand over to .+|Try the demo|Tell Process Management)$/;
  const wordsOf = (el) => (el.getAttribute('aria-label') && !el.textContent.trim() ? '' : el.textContent).trim().replace(/\s+/g, ' ');
  const buttons = all.filter((el) => el.matches('button:not([data-rows]):not([aria-expanded]):not([aria-pressed][aria-label]), [role=tab], [role=menuitem]') && !el.closest('[data-rows]') && (el.querySelector('svg') || el.matches('[role=tab], [role=menuitem]')) && wordsOf(el));
  const longButtons = buttons.map(wordsOf).filter((text) => text.split(' ').filter((word) => /[a-z]/i.test(word)).length > 2 && !AGREED.test(text));
  // Contrast (rule 8, build L5): the colour of each text on the colours behind it, blended as the browser draws them.
  const pen = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (colour) => { pen.clearRect(0, 0, 1, 1); pen.fillStyle = '#000'; pen.fillStyle = colour; pen.fillRect(0, 0, 1, 1); const d = pen.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat([1]);
  const backOf = (el) => { const layers = []; for (let at = el; at; at = at.parentElement) { const c = rgba(getComputedStyle(at).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 1) break; } return layers.reverse().reduce((under, top) => over(top, under), [255, 255, 255, 1]); };
  const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratioOf = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const contrasts = texts.filter((el) => !el.closest('.sr-only, :disabled, [aria-disabled="true"]') && !el.matches(':disabled')).map((el) => {
    const back = backOf(el); const style = getComputedStyle(el);
    const big = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.6 && Number(style.fontWeight) >= 700);
    return { ratio: Math.round(ratioOf(over(rgba(style.color), back), back) * 100) / 100, need: big ? 3 : 4.5, text: el.textContent.trim().slice(0, 30) };
  });
  const lowContrast = contrasts.filter((one) => one.ratio < one.need).map((one) => `${one.ratio}:1 "${one.text}"`);
  const lowest = contrasts.reduce((min, one) => (one.ratio < min.ratio ? one : min), { ratio: 99, text: '' });
  return { capitals, dots, smallest, smallTargets, wrappedOrCut: wrapped.concat(cut), fonts: [...fonts], targets: targets.length, buttons: buttons.length, longButtons, lowContrast, lowest };
}

export async function look() {
  const { page, check, close, outDir } = await open('The look');
  let worst = { count: 0, where: '', list: [] };
  for (const size of SIZES) {
    for (const theme of ['light', 'dark']) {
      console.log(`== ${size.name}, ${theme} ==`);
      const p = await page({ viewport: size.viewport, deviceScaleFactor: size.deviceScaleFactor || 1, colorScheme: theme });
      await p.evaluate((t) => { localStorage.setItem('sacm-workbench.theme', t); document.documentElement.classList.toggle('dark', t === 'dark'); }, theme);
      const screens = [];
      const take = async (name) => { await p.waitForTimeout(400); screens.push({ name, ...(await p.evaluate(measure)) }); };
      await take('start screen');
      check(`${size.name}, ${theme}: the page uses the font Nunito Sans`, await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('600 14px "Nunito Sans"') && getComputedStyle(document.body).fontFamily.startsWith('"Nunito Sans"'); }));
      await startDemo(p);
      await p.waitForTimeout(6500); // the toast of the load goes away
      await take('first screen');
      await p.locator('[data-filter-row]').getByRole('button', { name: 'Lines', exact: true }).click();
      await take('cards as lines');
      await p.locator('[data-filter-row]').getByRole('button', { name: 'Cards', exact: true }).click();
      await p.locator('section button[aria-pressed][aria-label^="Owner or manager missing:"]').first().click();
      await take('open owners card');
      await p.locator('main').getByRole('button', { name: /^Email/ }).first().click();
      await take('email window');
      // Build L4: the menu of the footer (Copy, Test), the Teams window, Choose reports and the parts of Settings.
      await p.locator('dialog[open]').getByRole('button', { name: 'More', exact: true }).click();
      await take('email window menu');
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      await p.locator('main').getByRole('button', { name: 'Teams', exact: true }).first().click();
      await take('teams window');
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      await p.locator('main table tbody tr').first().click();
      await take('case panel');
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      // Build L3: the menu of a group, the other kinds of card and the case panel of a fix list line.
      await p.locator('main article [data-group-head]').getByRole('button', { name: 'More', exact: true }).first().click();
      await take('menu of a group');
      await p.keyboard.press('Escape'); await p.waitForTimeout(200);
      for (const label of ['Application ≠ Instance', 'For Procurement', 'EPO update not arrived', 'Above parent']) {
        const back = p.locator('header').getByRole('button', { name: 'My day', exact: true }).first();
        if (!(await p.locator(`section button[aria-pressed][aria-label^="${label}:"]`).first().isVisible())) { await back.click(); await p.waitForTimeout(300); }
        await p.locator(`section button[aria-pressed][aria-label^="${label}:"]`).first().click();
        await take(`open card ${label}`);
        if (label === 'Application ≠ Instance') {
          await p.locator('main table tbody tr').first().click();
          await take('case panel of a fix list line');
          await p.keyboard.press('Escape'); await p.waitForTimeout(300);
        }
      }
      await p.getByRole('button', { name: 'Settings', exact: true }).click();
      await take('settings');
      for (const tab of ['Me', 'Team', 'Mailboxes']) {
        await p.locator('dialog[open]').getByRole('tab', { name: tab, exact: true }).click();
        await take(`settings ${tab}`);
      }
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      await p.locator('header').getByRole('button', { name: 'More', exact: true }).click();
      await p.getByRole('menuitem', { name: /Choose reports/ }).click();
      await take('choose reports');
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
      // Build L5: the pages. A group is taken first, so My work has a line; then the person page, each part of Audit, the
      // mapping backlog and Contract changes.
      await p.locator('header').getByRole('button', { name: 'My day', exact: true }).first().click(); await p.waitForTimeout(300);
      await p.locator('section button[aria-pressed][aria-label^="Owner or manager missing:"]').first().click(); await p.waitForTimeout(400);
      await p.locator('main article[data-group]').filter({ has: p.locator('[data-step-button]') }).first().locator('[data-group-head]').getByRole('button', { name: 'More', exact: true }).click();
      await p.getByRole('menuitem', { name: 'Take', exact: true }).click(); await p.waitForTimeout(400);
      const nav = (label) => p.locator('header nav').getByRole('button', { name: label }).first().click();
      await nav(/^My work/);
      await take('my work');
      await p.locator('main button[data-tip^="Everything open with"]').first().click();
      await take('person page');
      await nav(/^Activity/);
      await take('activity');
      await nav(/^Audit/);
      await take('audit record');
      await p.getByRole('tab', { name: 'Export', exact: true }).click();
      await p.locator('main').getByRole('button', { name: 'Export', exact: true }).click();
      await p.waitForSelector('article[aria-label="Audit summary"]', { timeout: 20000 });
      await take('audit export');
      await p.getByRole('tab', { name: 'Not followed', exact: true }).click();
      await take('audit not followed');
      await p.getByRole('tab', { name: 'Lifecycle', exact: true }).click();
      await p.getByRole('button', { name: 'New review', exact: true }).click();
      await p.waitForSelector('article[aria-label="Lifecycle review"]', { timeout: 20000 });
      await take('audit lifecycle');
      await nav(/^Backlog/);
      await take('mapping backlog');
      await p.locator('header').getByRole('button', { name: 'My day', exact: true }).first().click(); await p.waitForTimeout(300);
      await p.getByRole('button', { name: 'Show', exact: true }).first().click(); await p.waitForTimeout(300);
      await p.getByRole('button', { name: 'Changes', exact: true }).first().click();
      await take('contract changes');
      if (size.name === 'laptop') await p.screenshot({ path: join(outDir, `look-${theme}.png`) });
      const at = (key) => screens.filter((one) => one[key].length).map((one) => `${one.name}: ${one[key].slice(0, key === 'longButtons' ? 20 : 3).map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' | ')}`).join('; ');
      check(`${size.name}, ${theme}: no text in capitals`, screens.every((one) => !one.capitals.length), at('capitals'));
      check(`${size.name}, ${theme}: no three dots`, screens.every((one) => !one.dots.length), at('dots'));
      const smallest = screens.reduce((min, one) => (one.smallest.size < min.size ? { ...one.smallest, screen: one.name } : min), { size: 99 });
      check(`${size.name}, ${theme}: no text under 12 px`, smallest.size >= 12, `${smallest.size} px "${smallest.text}" on ${smallest.screen}`);
      check(`${size.name}, ${theme}: no click target under 24 px`, screens.every((one) => !one.smallTargets.length), at('smallTargets'));
      check(`${size.name}, ${theme}: at most two words on a button, apart from the agreed ones`, screens.every((one) => !one.longButtons.length), at('longButtons'));
      check(`${size.name}, ${theme}: every text has a contrast of 4.5:1 or more (3:1 for large text)`, screens.every((one) => !one.lowContrast.length), at('lowContrast'));
      const low = screens.reduce((min, one) => (one.lowest.ratio < min.ratio ? { ...one.lowest, screen: one.name } : min), { ratio: 99 });
      console.log(`  ${size.name}, ${theme}: ${screens.length} screens, ${screens.reduce((sum, one) => sum + one.buttons, 0)} buttons measured, lowest contrast ${low.ratio}:1 ("${low.text}" on ${low.screen})`);
      check(`${size.name}, ${theme}: one font only`, screens.every((one) => one.fonts.every((font) => font === 'Nunito Sans')), [...new Set(screens.flatMap((one) => one.fonts))].join(', '));
      for (const one of screens) if (one.wrappedOrCut.length > worst.count) worst = { count: one.wrappedOrCut.length, where: `${one.name}, ${size.name}, ${theme}`, list: one.wrappedOrCut };
      check(`${size.name}, ${theme}: no page error`, !p.errors.length && !p.requests.length, p.errors.concat(p.requests).join(' | '));
      await p.context().close();
    }
  }
  check('no label wraps or is cut, on any screen, size or theme', worst.count === 0, `${worst.count} on ${worst.where}: ${worst.list.slice(0, 6).join(' | ')}`);
  return close();
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit((await look()).failed.length ? 1 : 0);
