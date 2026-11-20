// Messages and follow-up in the browser (version 0.21, words of build L3): the next step of a group as time passes (first, waiting,
// reminder, reminder, escalate to the owner), one email for a reminder with new points, the outbox made visible
// (queued, then waiting once the file is in sent/), and replies to read on My work. The clock of the browser is moved,
// never waited for. Invented data only.
// Run: node tests/browser/followup.mjs (after npm run build).
import { join } from 'node:path';
import { back, loadLatest, more, open, openCard, sample, signIn, startDemo, unfold } from './harness.mjs';

const DAY = 24 * 3600 * 1000;
const text = async (locator) => (await locator.innerText()).replace(/\s+/g, ' ');

export async function followup() {
  const { page, check, close, outDir } = await open('Messages and follow-up');

  console.log('== The next step of a group, as the days pass ==');
  const p = await page();
  await p.clock.install();
  const today = await p.evaluate(() => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); });
  await p.evaluate(([name, csv]) => window.__fs.put(`reports/${name}`, csv), [`${today}_cmdb_ci.csv`, sample('cmdb_ci-sample.csv')]);
  // The Process Management team of the team settings (D195): it gets the problems on the record of a Business Process.
  await p.evaluate((json) => window.__fs.put('data/settings.json', json), JSON.stringify({ teams: { 'process-management': { name: 'Process Management', people: [{ name: 'Pat Process', email: 'pat.process@example.com' }, { name: 'Quinn Process', email: 'quinn.process@example.com' }] } } }));
  await signIn(p, 'Test Manager', 'test.manager@example.com');
  await loadLatest(p);
  await openCard(p, 'Support group');
  // The group of owner Ada Example: the check asks Cy Keeper, the Managed by person. The group is named after who is asked (build L3).
  const named = (asked) => p.locator('article', { has: p.locator('[data-asked]', { hasText: asked }) }).first();
  const group = named('Cy Keeper');
  await unfold(group);
  const refresh = async () => { await more(p, /Refresh/); await p.waitForTimeout(700); };
  const later = async (ms) => { await p.clock.fastForward(ms); await refresh(); };
  /** Presses the step of the group (Email, Remind 1 of 2), records the message as sent from Outlook, and closes the dialog. Returns the text of the dialog. */
  const viaOutlook = async (button) => {
    await group.getByRole('button', { name: button, exact: true }).click();
    await p.waitForTimeout(500);
    const dialog = p.getByRole('dialog');
    const words = await text(dialog);
    // One footer for the draft in view: one Send button; two drafts or more are tabs.
    const sendButtons = (await dialog.getByRole('button', { name: 'Send from mailbox' }).count()) + (await dialog.getByRole('tab').count());
    await dialog.getByRole('button', { name: 'Outlook', exact: true }).first().click();
    await dialog.getByRole('button', { name: 'Yes', exact: true }).first().click();
    await p.waitForTimeout(500);
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    return { words, sendButtons };
  };

  let g = await text(group);
  check('first: the button says "Email", with Teams next to it, and the group was never asked', (await group.getByRole('button', { name: 'Email', exact: true }).count()) === 1 && (await group.getByRole('button', { name: 'Teams', exact: true }).count()) === 1 && /Not asked yet/.test(g) && !/remind/i.test(g.replace(/Reminder due/g, '')), g.slice(0, 200));
  const first = await viaOutlook('Email');
  check('the tick box says what it adds, with one count: "Add N points from N other cards"', /Add \d+ points? from \d+ other cards?/.test(first.words) && !/open points|same email/.test(first.words), (first.words.match(/Add [^.]{0,80}/) || [''])[0]);
  g = await text(group);
  check('right after the first message: waiting, with the day the reminder is due, and no reminder button', /Waiting for an answer\. A reminder is due from \d+ \w+\./.test(g) && /Remind now/.test(g) && (await group.getByRole('button', { name: /^Remind \d/ }).count()) === 0 && /Asked 1 time · last \d+ \w+ · no reply/.test(g), g.slice(-260));
  check('sending to a group nobody had taken made it mine', (await group.locator('[data-tip="Assigned to Test Manager"]').count()) === 1, g.slice(0, 260));
  await p.screenshot({ path: join(outDir, 'followup-waiting.png') });

  await later(5 * DAY);
  g = await text(group);
  check('five days later: "Remind 1 of 2", and the chip says the reminder is due', (await group.getByRole('button', { name: 'Remind 1 of 2' }).count()) === 1 && /Reminder due/.test(g), g.slice(-260));
  const reminder1 = await viaOutlook('Remind 1 of 2');
  check('a reminder with new points is one email: one Send button, two parts', reminder1.sendButtons === 1 && /Reminder with new points|Reminder/.test(reminder1.words) && !/First message/.test(reminder1.words), `${reminder1.sendButtons} send buttons`);
  g = await text(group);
  check('after the reminder: waiting again', /Waiting for an answer/.test(g), g.slice(-200));

  await later(5 * DAY);
  check('five days later: "Remind 2 of 2"', (await group.getByRole('button', { name: 'Remind 2 of 2' }).count()) === 1, (await text(group)).slice(-260));
  await viaOutlook('Remind 2 of 2');

  await later(5 * DAY);
  g = await text(group);
  check('after 3 messages: "Escalate to Ada Example", the owner of the CI, never a fourth reminder', (await group.getByRole('button', { name: 'Escalate to Ada Example' }).count()) === 1 && /No answer after 3 messages\./.test(g) && /To escalate/.test(g) && (await group.getByRole('button', { name: /^Remind/ }).count()) === 0, g.slice(-260));
  await group.getByRole('button', { name: 'Escalate to Ada Example' }).click();
  await p.waitForTimeout(500);
  const dialog = p.getByRole('dialog');
  const escalation = dialog.locator('section', { hasText: 'Escalation' }).first();
  const to = await escalation.getByLabel('To').inputValue();
  const body = await escalation.locator('iframe').getAttribute('srcdoc');
  check('the escalation goes to the owner, with the Managed by person in copy, and says why', to === 'ada@example.com' && /cy@example\.com/.test(await escalation.getByLabel('Cc').inputValue()) && /You are the owner \(Owned by\) of the CIs? below\. We asked Cy Keeper, the Managed by person, three times and got no answer\./.test(body), `${to} · ${(body.match(/You are the owner[^<]*/) || [''])[0]}`);
  await p.screenshot({ path: join(outDir, 'followup-escalation.png') });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const strip = async () => ((await p.locator('[data-myday-page]').count()) ? text(p.locator('[data-myday-page]')) : '');
  await back(p);
  const box = p.locator('[data-myday="escalate"]');
  check('My day lists the escalation in To escalate, with its button', /To escalate\s*[1-9]/.test(await text(box)) && await box.getByRole('button', { name: /^Escalate to / }).first().isEnabled(), await text(box));

  console.log('== The outbox ==');
  await openCard(p, 'Owner or manager missing');
  // The owners missing on the Business Processes are one group: the Process Management team, written to as one message (D195, D196). A live card: a proposed card asks nobody (D346).
  const dee = named('Process Management');
  await dee.getByRole('button', { name: 'Email', exact: true }).click();
  await p.waitForTimeout(500);
  const teamDraft = p.getByRole('dialog');
  check('a message to the team goes to every person of the team, and copies nobody', (await teamDraft.getByLabel('To').first().inputValue()) === 'pat.process@example.com; quinn.process@example.com' && (await teamDraft.getByLabel('Cc').first().inputValue()) === '', await teamDraft.getByLabel('Cc').first().inputValue());
  check('it greets the team and says why it gets it', /Hi Process Management,/.test(await teamDraft.locator('iframe').first().getAttribute('srcdoc')) && /Process Management is responsible for the record/.test(await teamDraft.locator('iframe').first().getAttribute('srcdoc')));
  await p.getByRole('dialog').getByRole('button', { name: 'Send from mailbox' }).first().click();
  await p.waitForTimeout(700);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  await back(p);
  check('Send from the shared mailbox: "1 in outbox" on My day', /1 in outbox/.test(await strip()), await strip());
  await openCard(p, 'Owner or manager missing');
  check('just handed over: the group waits for an answer', /Waiting for an answer/.test(await text(dee)));
  await later(2 * 3600 * 1000);
  let d = await text(dee);
  check('two hours later, still in the outbox: the group is in the outbox, not asked', /In the outbox since \d+ \w+, not sent yet\./.test(d) && /In the outbox/.test(d) && !/Waiting for an answer/.test(d), d.slice(-260));
  await back(p);
  await p.getByRole('button', { name: /1 in outbox/ }).click();
  await p.waitForTimeout(400);
  const list = await text(p.getByRole('dialog'));
  check('the chip opens the list: to, subject, who queued it, when', /pat\.process@example\.com/.test(list) && /Test Manager/.test(list) && /\[SACM-/.test(list), list.slice(0, 300));
  await p.screenshot({ path: join(outDir, 'followup-outbox.png') });
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  await openCard(p, 'Owner or manager missing');
  // The manager is not stuck: "Write again" opens the dialog, which says that nothing was sent from the shared mailbox yet.
  await dee.getByRole('button', { name: 'Write again' }).first().click();
  await p.waitForTimeout(500);
  check('the window warns that nothing was sent from the shared mailbox yet', /Nothing was sent from the shared mailbox yet\. Use Outlook for now\./.test(await text(p.getByRole('dialog'))));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  // The sending flow: the file moves from outbox/ to sent/. The app itself never moves or deletes it.
  const files = await p.evaluate(() => window.__fs.list());
  const waiting = files.filter((file) => file.startsWith('outbox/'));
  check('the app left the message in the outbox', waiting.length === 1 && !files.some((file) => file.startsWith('sent/')), waiting.join(' '));
  await p.evaluate(async (file) => { await window.__fs.putText(file.replace('outbox/', 'sent/'), await window.__fs.get(file)); await window.__fs.del(file); }, waiting[0]);
  await refresh();
  await openCard(p, 'Owner or manager missing');
  d = await text(dee);
  await back(p);
  check('once the file is in sent/: waiting for an answer, and the chip is gone', /Waiting for an answer\. A reminder is due from/.test(d) && !/in outbox/.test(await strip()), d.slice(-200));
  // The preview of a message is a frame that runs no script: the browser says so when the test harness tries.
  p.errors = p.errors.filter((line) => !/sandboxed/.test(line));
  check('team folder: no page errors, no network request', p.errors.length === 0 && p.requests.length === 0, p.errors.concat(p.requests).join(' | ').slice(0, 300));

  console.log('== Replies to read (demo) ==');
  const demo = await page();
  await startDemo(demo);
  const today2 = await text(demo.locator('[data-myday-page]'));
  check('the demo shows a follow-up: a reply to read, a reminder due and an escalation', /Replies to read\s*[1-9]/.test(today2) && /Reminders due\s*[1-9]/.test(today2) && /To escalate\s*[1-9]/.test(today2), today2.slice(0, 300));
  // Send a first message and let the demo stakeholder answer it.
  const cardsWithFirst = demo.locator('section button[aria-pressed][aria-label]');
  let sent = false;
  for (let index = 0; index < await cardsWithFirst.count() && !sent; index += 1) {
    await cardsWithFirst.nth(index).click();
    await demo.waitForTimeout(400);
    const button = demo.locator('article').getByRole('button', { name: 'Email', exact: true }).first();
    if (await button.count() && await button.isEnabled()) {
      await button.click();
      await demo.waitForTimeout(500);
      const firstDraft = demo.getByRole('dialog').locator('section', { hasText: 'First message' }).first();
      if (await firstDraft.count()) { await demo.getByRole('dialog').getByRole('button', { name: 'Send from mailbox' }).click(); sent = true; }
      await demo.waitForTimeout(500);
      await demo.keyboard.press('Escape');
      await demo.waitForTimeout(300);
    }
    if (!sent) { await cardsWithFirst.nth(index).click(); await demo.waitForTimeout(200); }
  }
  check('a first message was sent in the demo', sent);
  await back(demo);
  await demo.getByRole('button', { name: 'Get replies' }).click();
  await demo.waitForTimeout(800);
  const toast = await text(demo.locator('[role=status]').last());
  check('Get replies: "1 new reply: read it", with a link', /1 new reply:\s*read it/.test(toast), toast);
  await demo.locator('[role=status]').getByRole('button', { name: 'read it' }).click();
  await demo.waitForTimeout(500);
  // One or two replies: the new one, and the reply of the demo unless the new message wrote again on its case.
  const replies = demo.getByRole('region', { name: 'Replies to read' });
  check('the link opens My work, with "Replies to read" first on the page', (await replies.count()) === 1 && /Replies to read\s*[12]\b/.test(await text(replies)), (await replies.count()) ? (await text(replies)).slice(0, 200) : 'no list');
  await demo.screenshot({ path: join(outDir, 'followup-replies.png') });
  // A status is set on every open problem of the CI (until build 3), so one status can read both replies.
  for (let round = 0; round < 2 && await replies.count(); round += 1) {
    await replies.getByRole('button').first().click();
    await demo.waitForTimeout(500);
    const panel = demo.getByRole('complementary');
    if (round === 0) check('a click opens the case, with the reply', /Reply from/.test(await text(panel)), (await text(panel)).slice(0, 120));
    await panel.getByLabel('Status').selectOption('Fix in progress');
    await demo.waitForTimeout(500);
    await panel.getByRole('button', { name: 'Close', exact: true }).click();
    await demo.waitForTimeout(400);
    if (round === 0) check('a status on the case takes its reply off the list', !(await replies.count()) || /Replies to read\s*1\b/.test(await text(replies)));
  }
  check('every reply read: the list is gone', (await demo.getByRole('region', { name: 'Replies to read' }).count()) === 0);
  demo.errors = demo.errors.filter((line) => !/sandboxed/.test(line));
  check('demo: no page errors, no network request', demo.errors.length === 0 && demo.requests.length === 0, demo.errors.concat(demo.requests).join(' | ').slice(0, 300));

  return close();
}

if (process.argv[1] === import.meta.filename) { const result = await followup(); process.exit(result.failed.length ? 1 : 0); }
