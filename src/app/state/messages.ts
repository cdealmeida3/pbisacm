import { parseJson } from './folder-files.ts';
import { readOutbox, refresh } from './folder.ts';
import { recordAll } from './journal.ts';
import { nowStamp, rebuild, state, toast, update } from './store.ts';
import type { CaseEvent, EventType } from '../../core/cases/cases.ts';
import type { Draft, MessageSettings } from '../../core/messages/messages.ts';
import type { MemoryWorkspace } from '../platform/workspace.ts';

/**
 * Messages: handing a message to the shared mailbox (outbox/), getting the replies, and reading back what a colleague sent.
 */

export async function getReplies(): Promise<void> {
  const before = state.replies.length;
  if (state.mode === 'demo') await demoReply();
  await refresh();
  const added = state.replies.length - before;
  // The new replies are listed on My work, under "Replies to read" (F07).
  if (added > 0) toast(`${added} new repl${added === 1 ? 'y' : 'ies'}:`, { label: added === 1 ? 'read it' : 'read them', run: () => update({ view: 'mywork', openCi: '' }) });
  else toast('No new replies.');
}

/** Demo only: plays the part of a stakeholder who answers the oldest unanswered email. */
async function demoReply(): Promise<void> {
  const workspace = state.workspace as MemoryWorkspace;
  // The emails of the person who tries the demo first; the invented follow-up of the example colleagues after them.
  const open = state.events.filter((event) => event.type === 'message' && event.channel !== 'teams' && !state.replies.some((reply) => reply.ref === event.ref));
  const message = open.filter((event) => event.by === state.user.email)[0] ?? open[0];
  if (!message) return;
  await workspace.writeText(`replies/${message.ref}.json`, JSON.stringify({
    from: message.to, received: nowStamp(), subject: `RE: ${message.subject}`,
    body: '<p>Hello,</p><p>Thank you. I will raise the request this week.</p><p>(This reply is part of the demo.)</p>'
  }));
}

/* ------------------------------------------------------------------ sending */

/** The settings the messages use: the team settings, signed with the name of who is working. */
export const messageSettings = (): MessageSettings => ({ ...state.settings, senderName: state.user.name });

/** Hands a message to the shared mailbox: the sending flow picks it up from outbox/. */
export async function queue(draft: Draft, to: string, cc: string, subject: string): Promise<string> {
  const file = `${draft.ref}_${Date.now().toString(36)}.json`;
  await state.workspace!.writeText(`outbox/${file}`, JSON.stringify({ ref: draft.ref, to, cc, subject, body: draft.body, requestedBy: state.user.email, requestedAt: nowStamp() }));
  if (state.mode === 'demo') await state.workspace!.writeText(`sent/${file}`, '{}');
  await readOutbox();
  rebuild();
  return file;
}

/**
 * Records a message that was sent, opened in Outlook or started in Teams, on its cases.
 * `newKeys`: the second part of a reminder, "New since then": recorded as a first message with the same reference, so
 * the attempts of each case stay right (D161). A message to cases nobody has taken makes them mine (D164); cases a
 * colleague has stay theirs.
 */
export async function recordSent(keys: string[], newKeys: string[], values: Partial<CaseEvent>): Promise<void> {
  const fresh = new Set(newKeys);
  const still = keys.filter((key) => !fresh.has(key));
  const entries: Array<{ type: EventType; keys: string[]; values?: Partial<CaseEvent> }> = [];
  if (still.length) entries.push({ type: 'message', keys: still, values });
  if (fresh.size) entries.push({ type: 'message', keys: Array.from(fresh), values: { ...values, kind: 'first' } });
  const all = new Set(keys);
  const free = state.cases.filter((item) => all.has(item.key) && !item.assignedTo).map((item) => item.key);
  if (free.length && state.user.name) entries.push({ type: 'assign', keys: free, values: { text: state.user.name } });
  await recordAll(entries);
}

/** The text of a message a colleague handed to the shared mailbox (from sent/ or outbox/), or ''. */
export async function messageText(event: CaseEvent): Promise<string> {
  if (event.channel === 'teams') return event.text ?? '';
  if (!event.text || !state.workspace) return '';
  for (const folder of ['sent', 'outbox']) {
    const message = parseJson<{ body?: string }>(await state.workspace.readText(`${folder}/${event.text}`));
    if (message && message.body) return message.body.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  }
  return '';
}
