// Two managers on two "computers" (each with its own private folder) and a sync agent that behaves like OneDrive:
// a file changed on one side only is copied; a file changed on both sides is kept twice, the second copy with the
// computer name. Checks that both see the same work and that no conflict copy is left. Invented data only.
// Run: node tests/browser/pilot.mjs (after npm run build).
import { join } from 'node:path';
import { groupMenu, more, open, sample } from './harness.mjs';

export async function pilot() {
  const { page, check, close, outDir } = await open('Two managers at once');
  const csv = sample('cmdb_ci-sample.csv');
  const mk = async (who) => { const p = await page({ viewport: { width: 1500, height: 950 } }); return { who, page: p, errors: p.errors, pc: `PC-${who}` }; };
  const base = new Map(); const conflicts = [];
  const sync = async (A, B) => {
    const a = await A.page.evaluate(() => window.__fs.dump()), b = await B.page.evaluate(() => window.__fs.dump());
    let moved = 0;
    for (const p of new Set([...Object.keys(a), ...Object.keys(b), ...base.keys()])) {
      const x = a[p], y = b[p], o = base.get(p);
      const set = (v) => (v === undefined ? base.delete(p) : base.set(p, v));
      const to = async (M, v) => { moved++; if (v === undefined) await M.page.evaluate((q) => window.__fs.del(q), p); else await M.page.evaluate(([q, t]) => window.__fs.put(q, t), [p, v]); };
      if (x === y) { set(x); continue; }
      if (x === o) { await to(A, y); set(y); } else if (y === o) { await to(B, x); set(x); }
      else if (x === undefined) { await to(A, y); set(y); } else if (y === undefined) { await to(B, x); set(x); }
      else { // both changed: OneDrive keeps both, the second one gets the computer name
        const copy = p.replace(/(\.[^./]+)?$/, `-${B.pc}$1`);
        conflicts.push(copy); await to(B, x); set(x);
        for (const M of [A, B]) await M.page.evaluate(([q, t]) => window.__fs.put(q, t), [copy, y]); base.set(copy, y);
      }
    }
    return moved;
  };
  const toast = async (M) => (await M.page.locator('[role=status]').allInnerTexts()).join(' ## ').replace(/\s+/g, ' ').trim();
  const waitToast = async (M, re) => { await M.page.waitForFunction((src) => new RegExp(src).test([...document.querySelectorAll('[role=status]')].map((e) => e.innerText).join(' ## ')), re.source, { timeout: 30000 }); return toast(M); };
  const header = async (M) => (await M.page.locator('header [data-header-report]').first().innerText()).replace(/\s+/g, ' ');
  const signIn = async (M, name, email) => {
    await M.page.getByRole('button', { name: /^Open folder$/ }).click();
    await M.page.getByLabel('Your name').fill(name); await M.page.getByLabel('Your email').fill(email);
    await M.page.getByRole('button', { name: 'Save' }).click(); await M.page.waitForTimeout(300);
    const t0 = Date.now(); await M.page.waitForFunction(() => !/No report yet/.test(document.querySelector('header p')?.innerText ?? ''), null, { timeout: 15000 }).catch(() => {}); M.openMs = Date.now() - t0;
  };
  const press = async (M, name) => { await M.page.locator('header').getByRole('button', { name: name === 'Load latest report' ? 'Load' : name, exact: true }).click(); };
  const refresh = async (M) => { await more(M.page, /Refresh/); await M.page.waitForTimeout(700); };
  const redCard = (M) => M.page.locator('section button[aria-pressed][aria-label*="To solve"]').first();
  const openCard = async (M, text) => { const c = text ? M.page.locator('section button[aria-pressed]', { hasText: text }).first() : redCard(M); if ((await c.getAttribute('aria-pressed')) !== 'true') await c.click(); await M.page.waitForTimeout(400); return (await c.getAttribute('aria-label')).split(':')[0]; };
  const group = (M, owner) => M.page.locator('article', { hasText: owner }).first();
  const files = async (M) => Object.keys(await M.page.evaluate(() => window.__fs.dump())).sort();
  const counts = async (M) => (await M.page.locator('section button[aria-pressed]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).join(' | ');
  const closePanel = async (M) => { await M.page.keyboard.press('Escape'); await M.page.getByRole('button', { name: 'Close' }).first().click({ timeout: 2000 }).catch(() => {}); };

  const A = await mk('A'), B = await mk('B');
  await A.page.evaluate(([t]) => window.__fs.put('reports/2026-11-11_cmdb_ci.csv', t), [csv]);
  await sync(A, B);

  console.log('\nSteps 1-3: A opens the folder and loads the report; B opens after the sync');
  await signIn(A, 'Manager A', 'manager.a@example.com');
  await press(A, 'Load latest report'); const loaded = await waitToast(A, /CIs checked|No report|already|loaded/);
  check('A loads the report', /CIs checked|Report loaded/.test(loaded), loaded.slice(0, 90));
  const moved1 = await sync(A, B);
  await signIn(B, 'Manager B', 'manager.b@example.com');
  check('B sees the same report without loading it', (await header(A)).split('·').slice(0, 2).join() === (await header(B)).split('·').slice(0, 2).join(), `${await header(B)}; ${moved1} files synced`);
  check('B sees the same cards as A', (await counts(A)) === (await counts(B)));

  console.log('\nSteps 4-5: A assigns a group and writes a note; B refreshes');
  const cardName = await openCard(A);
  const owner = (await A.page.locator('article [data-asked]').first().innerText()).trim();
  await groupMenu(group(A, owner), 'Take'); await A.page.waitForTimeout(300);
  await groupMenu(group(A, owner), 'Note'); await group(A, owner).locator('textarea').fill('test A');
  await group(A, owner).getByRole('button', { name: 'Save note' }).click(); await A.page.waitForTimeout(300);
  await sync(A, B); await refresh(B); await openCard(B, cardName);
  check('B sees that the group is assigned to A', /Manager A/.test(await group(B, owner).innerText()), `card "${cardName}"`);

  console.log('\nStep 6: both write a note on the same case at the same moment (before any sync)');
  const addNote = async (M, text) => { await groupMenu(group(M, owner), 'Note'); await group(M, owner).locator('textarea').fill(text); await group(M, owner).getByRole('button', { name: 'Save note' }).click(); await M.page.waitForTimeout(300); };
  await Promise.all([addNote(A, 'note A'), addNote(B, 'note B')]);
  await sync(A, B); await refresh(A); await refresh(B);
  const panelText = async (M) => { await openCard(M, cardName); await group(M, owner).locator('tr[tabindex]').first().click(); await M.page.waitForTimeout(400); const text = await M.page.locator('body').innerText(); await closePanel(M); return text; };
  const pa = await panelText(A), pb = await panelText(B);
  check('Both notes are on A\'s screen', /note A/.test(pa) && /note B/.test(pa) && /test A/.test(pa));
  check('Both notes are on B\'s screen', /note A/.test(pb) && /note B/.test(pb) && /test A/.test(pb));
  check('No conflict copy so far', conflicts.length === 0, conflicts.join(', '));

  console.log('\nStep 7: both press "Load latest report" at the same moment, report already loaded');
  await Promise.all([press(A, 'Load latest report'), press(B, 'Load latest report')]);
  const [ta, tb] = await Promise.all([waitToast(A, /already loaded|Nothing new to load/), waitToast(B, /already loaded|Nothing new to load/)]);
  check('Both are told it is already loaded', /already loaded|Nothing new/.test(ta) && /already loaded|Nothing new/.test(tb), ta.slice(0, 70));

  console.log('\nStep 7b (the real morning): a NEW report arrives, and both press "Load latest report" before the sync');
  await A.page.evaluate(([t]) => window.__fs.put('reports/2026-11-12_cmdb_ci.csv', t), [csv]); await sync(A, B);
  await Promise.all([press(A, 'Load latest report'), press(B, 'Load latest report')]);
  await Promise.all([waitToast(A, /report of 2026-11-12|[Rr]eports? loaded/), waitToast(B, /report of 2026-11-12|[Rr]eports? loaded/)]);
  await sync(A, B);
  check('No conflict copy after both loaded the same new report', conflicts.length === 0, conflicts.join(', '));
  for (let round = 1; round <= 3; round++) { for (const M of [A, B]) await refresh(M); await sync(A, B); }
  const fa = await files(A), fb = await files(B);
  check('The two folders are identical after syncing', JSON.stringify(fa) === JSON.stringify(fb));
  check('No leftover conflict files in data/', !fa.some((f) => /PC-[AB]/.test(f)), fa.filter((f) => /PC-[AB]/.test(f)).join(', '));
  check('Both screens show the same cards', (await counts(A)) === (await counts(B)));
  check('Runs are not duplicated', fa.filter((f) => /^data\/runs\/[^/]+$/.test(f)).length === 2, fa.filter((f) => f.startsWith('data/runs/')).join(', '));

  console.log('\nStep 8b: both change the same thing at the same moment (status of the same group)');
  const setStatus = async (M, value) => { await openCard(M, cardName); await group(M, owner).locator('tr[tabindex]').first().click(); await M.page.waitForTimeout(300); await M.page.locator('aside[aria-label^="Case:"] select:has(option[value="Answered"])').first().selectOption(value); await M.page.waitForTimeout(300); await closePanel(M); };
  await setStatus(A, 'Fix in progress'); await B.page.waitForTimeout(1100); await setStatus(B, 'Answered');
  await sync(A, B); await refresh(A); await refresh(B);
  const sa = (await panelText(A)).match(/Status set to [A-Za-z ]+ \(by Manager [AB]\)/g) ?? [], sb = (await panelText(B)).match(/Status set to [A-Za-z ]+ \(by Manager [AB]\)/g) ?? [];
  check('Both see both status changes, in the same order', sa.length === 2 && JSON.stringify(sa) === JSON.stringify(sb), sa.join(' → '));

  console.log('\nStep 8c: both change the team settings at the same moment');
  const setReminder = async (M, days) => { await M.page.locator('header').getByRole('button', { name: 'Settings', exact: true }).click(); await M.page.getByRole('dialog').getByRole('tab', { name: 'Team' }).click(); await M.page.getByLabel(/^Reminder after/).fill(String(days)); await M.page.getByRole('button', { name: 'Save', exact: true }).click(); await M.page.waitForTimeout(300); };
  await Promise.all([setReminder(A, 4), setReminder(B, 6)]);
  const before = conflicts.length; await sync(A, B); await refresh(A); await refresh(B); await sync(A, B);
  const settingsCopies = (await files(A)).filter((f) => /settings.*PC-/.test(f));
  check('Settings changed by two people: no leftover conflict file', settingsCopies.length === 0, `${conflicts.length - before} conflict; left in folder: ${settingsCopies.join(', ') || 'none'}`);

  console.log('\nStep 9: one journal file per person');
  const journals = (await files(A)).filter((f) => f.startsWith('data/journal/'));
  check('One journal file per person', journals.length === 2, journals.join(', '));

  console.log('\nSame person on two computers (Manager A also works on computer B)');
  await B.page.evaluate(() => localStorage.setItem('sacm-workbench.user', JSON.stringify({ name: 'Manager A', email: 'manager.a@example.com' })));
  await B.page.reload(); await B.page.getByRole('button', { name: /^Open folder$/ }).click(); await B.page.waitForTimeout(800);
  await openCard(A, cardName); await openCard(B, cardName);
  await Promise.all([addNote(A, 'laptop note'), addNote(B, 'desktop note')]);
  const c0 = conflicts.length; await sync(A, B); await refresh(A); await refresh(B); await sync(A, B);
  const p2 = await panelText(A); const p3 = await panelText(B);
  const times = (text, word) => (text.match(new RegExp(word, 'g')) ?? []).length;
  check('Both notes survive when one person writes on two computers', /laptop note/.test(p2) && /desktop note/.test(p2) && /laptop note/.test(p3) && /desktop note/.test(p3), `${conflicts.length - c0} conflict copy: ${conflicts.slice(c0).join(', ')}`);
  check('No note is shown twice', times(p2, 'test A') <= 2 && times(p2, 'laptop note') <= 2, `"test A" ${times(p2, 'test A')}x, "laptop note" ${times(p2, 'laptop note')}x on the panel`);
  const leftover = (await files(A)).filter((f) => /PC-[AB]/.test(f));
  check('No conflict file is left in the folder at the end', leftover.length === 0, leftover.join(', '));

  console.log('\nStep 10: close and open again');
  await A.page.reload(); await A.page.getByRole('button', { name: /^Open folder$/ }).click(); await A.page.waitForTimeout(800);
  check('A reopens and is remembered', (await A.page.locator('header').getByRole('button', { name: /^Manager A: Settings, Me$/ }).count()) === 1, await header(A));
  check('No errors in the browser, no network request', A.errors.length + B.errors.length + A.page.requests.length + B.page.requests.length === 0, [...A.errors, ...B.errors, ...A.page.requests].slice(0, 3).join(' | '));
  await A.page.screenshot({ path: join(outDir, 'pilot-A.png') });
  return close();
}

if (process.argv[1] === import.meta.filename) { const result = await pilot(); process.exit(result.failed.length ? 1 : 0); }
