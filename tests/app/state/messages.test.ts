import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDrafts } from '../../../src/core/messages/messages.ts';
import { content } from '../../../src/app/state/content.ts';
import { startDemo } from '../../../src/app/state/loading.ts';
import { refresh } from '../../../src/app/state/folder.ts';
import { getReplies, messageSettings, messageText, queue, recordSent } from '../../../src/app/state/messages.ts';
import { newRef, rebuild, state, today } from '../../../src/app/state/store.ts';
import { repliesToRead, toSolve } from '../../../src/app/view/cases.ts';
import { nextStep } from '../../../src/app/view/groups.ts';
import { loadTheSamples, openFolder, useRepositoryContent } from './helpers.ts';

/* Sending a message as the Send button does it (queue + record), and getting the replies, with the in-memory folder. */

useRepositoryContent();

/** The first message the app drafts for the open cases, sent through the shared mailbox like Compose does. */
async function sendFirst(): Promise<{ file: string; ref: string; to: string; keys: string[] }> {
  const { drafts } = buildDrafts(state.cases.filter(toSolve), content.packs, messageSettings(), newRef);
  const draft = drafts.filter((one) => one.kind === 'first')[0]!;
  const values = { ref: draft.ref, to: draft.to, cc: draft.cc, subject: draft.subject, kind: draft.kind };
  const file = await queue(draft, values.to, values.cc, values.subject);
  await recordSent(draft.keys, draft.newKeys, { ...values, channel: 'mailbox', text: file });
  return { file, ref: draft.ref, to: draft.to, keys: draft.keys };
}

test('Send hands the message to the outbox, records it, and the cases are contacted', async () => {
  const workspace = await openFolder();
  await loadTheSamples();
  const sent = await sendFirst();
  assert.match(sent.file, /^SACM-[A-Z2-9]{6}_[a-z0-9]+\.json$/);
  const message = JSON.parse(await workspace.readText(`outbox/${sent.file}`)) as Record<string, string>;
  assert.equal(message.ref, sent.ref);
  assert.equal(message.to, sent.to);
  assert.equal(message.requestedBy, 'test.manager@example.com');
  // Outside the demo nothing is sent by the app: the flow moves the file to sent/.
  assert.equal((await workspace.list('sent')).length, 0);
  for (const key of sent.keys) assert.equal(state.cases.find((item) => item.key === key)?.status, 'Contacted');
  // A colleague can read back what was sent.
  const event = state.events.find((item) => item.type === 'message')!;
  assert.ok((await messageText(event)).length > 0);
});

test('a reply in replies/ with the reference in its subject answers the cases', async () => {
  const workspace = await openFolder();
  await loadTheSamples();
  const sent = await sendFirst();
  await workspace.writeText(`replies/${sent.ref}.json`, JSON.stringify({ from: sent.to, received: '2099-01-01T09:00:00', subject: `RE: [${sent.ref}]`, body: '<p>Done.</p>' }));
  await getReplies();
  assert.equal(state.toast, '1 new reply:');
  assert.equal(state.toastAction?.label, 'read it');
  for (const key of sent.keys) assert.equal(state.cases.find((item) => item.key === key)?.status, 'Answered');
});

test('in the demo a stakeholder answers the oldest email, and the outbox is marked as sent', async () => {
  state.user = { name: '', email: '' };
  await startDemo();
  const sent = await sendFirst();
  assert.equal((await state.workspace!.list('sent')).map((file) => file.name).join(), sent.file);
  assert.equal(state.outbox.length, 0, 'the demo sends at once: nothing waits');
  await getReplies();
  assert.equal(state.toast, '1 new reply:');
  assert.equal(state.toastAction?.label, 'read it');
  assert.ok(state.replies.some((reply) => reply.ref === sent.ref && /part of the demo/.test(reply.text)));
});

test('a message to a group nobody has taken makes it mine; a colleague\'s group stays theirs (D164)', async () => {
  await openFolder();
  await loadTheSamples();
  const { drafts } = buildDrafts(state.cases.filter(toSolve), content.packs, messageSettings(), newRef);
  const [mine, theirs] = drafts.filter((one) => one.kind === 'first');
  await recordSent(mine!.keys, [], { ref: mine!.ref, to: mine!.to, subject: mine!.subject, kind: 'first', channel: 'outlook' });
  for (const key of mine!.keys) assert.equal(state.cases.find((item) => item.key === key)?.assignedTo, 'Test Manager');
  // A colleague has the second group: sending to it changes nothing.
  state.events = state.events.concat([{ id: 'colleague-1', at: '2026-01-01T08:00:00', by: 'alex.example@example.com', byName: 'Alex Example', type: 'assign', keys: theirs!.keys, text: 'Alex Example' }]);
  rebuild();
  await recordSent(theirs!.keys, [], { ref: theirs!.ref, to: theirs!.to, subject: theirs!.subject, kind: 'first', channel: 'outlook' });
  for (const key of theirs!.keys) assert.equal(state.cases.find((item) => item.key === key)?.assignedTo, 'Alex Example');
});

test('the outbox is visible: a message that waits over an hour is queued, and waiting once it is in sent/ (D162)', async () => {
  const workspace = await openFolder();
  await loadTheSamples();
  const sent = await sendFirst();
  assert.deepEqual(state.outbox.map((message) => [message.file, message.to, message.by]), [[sent.file, sent.to, 'test.manager@example.com']]);
  const open = (): { open: typeof state.cases } => ({ open: state.cases.filter((item) => sent.keys.includes(item.key)) });
  // Just handed over: the flow may still be on its way.
  assert.equal(nextStep(open(), today(), state.settings).step, 'waiting');
  // Two hours later it is still in the outbox: queued, not contacted, and no reminder however long it waits.
  const file = JSON.parse(await workspace.readText(`outbox/${sent.file}`)) as Record<string, string>;
  await workspace.writeText(`outbox/${sent.file}`, JSON.stringify({ ...file, requestedAt: new Date(Date.now() - 2 * 3600000).toISOString().slice(0, 19) }));
  await refresh();
  assert.equal(nextStep(open(), today(), state.settings).step, 'queued');
  assert.ok(open().open.every((item) => item.queued && !item.reminderDue));
  // The sending flow moves the file to sent/: the group waits for an answer.
  await workspace.writeText(`sent/${sent.file}`, JSON.stringify(file));
  await workspace.remove(`outbox/${sent.file}`);
  await refresh();
  assert.equal(state.outbox.length, 0);
  assert.equal(nextStep(open(), today(), state.settings).step, 'waiting');
  // The app never deleted or moved an outbox file itself: the test did, as the flow does.
});

test('the demo shows a follow-up: a reminder due, an escalation and a reply to read (F56)', async () => {
  state.user = { name: '', email: '' };
  await startDemo();
  const steps = new Map<string, string>();
  const byPerson = new Map<string, typeof state.cases>();
  for (const item of state.cases.filter((one) => one.messages.length)) byPerson.set(item.messages[0]!.ref!, (byPerson.get(item.messages[0]!.ref!) ?? []).concat([item]));
  byPerson.forEach((cases, ref) => steps.set(ref, nextStep({ open: cases }, today(), state.settings).step));
  assert.deepEqual(Array.from(steps.values()).sort(), ['answered', 'escalate', 'reminder']);
  assert.equal(repliesToRead(state.cases, state.user.name).length, 1);
  assert.ok(state.events.filter((event) => event.type === 'message').every((event) => event.by === 'alex.example@example.com' && /@example\.com$/.test(event.to ?? '')));
});
