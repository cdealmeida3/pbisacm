import { REVIEW_WORDS } from '../../core/audit/audit.ts';
import { REVIEWED_ASK } from '../../core/cases/cases.ts';
import { datesInText, longDate, screenDate } from '../../core/shared/dates.ts';
import { messageKey } from './cases.ts';
import type { CaseEvent } from '../../core/cases/cases.ts';

/**
 * Events in words, for the timelines of a case and the Activity page.
 */

/**
 * A reminder with new points is two journal lines (a reminder and a first message, same reference and moment) and one
 * message (D161): the timelines show it once, as the reminder, with the cases of both lines.
 */
export function oneLinePerMessage(events: CaseEvent[]): Array<{ event: CaseEvent; withNew: boolean }> {
  const byKey = new Map<string, { event: CaseEvent; withNew: boolean }>();
  const out: Array<{ event: CaseEvent; withNew: boolean }> = [];
  for (const event of events) {
    const known = byKey.get(messageKey(event));
    if (!known) { const line = { event, withNew: false }; byKey.set(messageKey(event), line); out.push(line); continue; }
    const kinds = [known.event.kind, event.kind];
    known.withNew = kinds.indexOf('reminder') >= 0 && kinds.indexOf('first') >= 0;
    const main = event.kind === 'reminder' || event.kind === 'escalation' ? event : known.event;
    known.event = { ...main, keys: Array.from(new Set(known.event.keys.concat(event.keys))) };
  }
  return out;
}

/** The cards an action touched, in words: every name up to three, else "4 cards" (F08). '' when none. */
export function cardWords(labels: string[]): string {
  const names = Array.from(new Set(labels.filter(Boolean)));
  return names.length > 3 ? `${names.length} cards` : names.join(', ');
}

/** A stage of the mapping backlog in words, from its id ("session-held" gives "Session held"). */
export const stageWord = (id: string): string => (id ? `${id.charAt(0).toUpperCase()}${id.slice(1).replace(/-/g, ' ')}` : '');

/**
 * A line of a timeline or of the activity page. `title` is the line of a timeline ("Email to Cy (by Ana)"); the Activity
 * page shows `what` ("Email to Cy") and `by` ("Ana") in their own columns (build L5).
 */
export interface EventLine { at: string; id: string; icon: string; title: string; what: string; by: string; text: string }

/** One event in words. `sent`: the outbox files the sending flow has sent. */
export function describeEvent(event: CaseEvent, sent: Set<string> = new Set(), withNew = false): EventLine {
  const by = event.byName || event.by;
  const line = eventWords(event, sent, withNew, by);
  return { at: event.at, id: event.id, icon: line.icon, title: line.title ?? `${line.what} (by ${by})`, what: line.what, by, text: line.text };
}

/** What an event did, without who did it; `title` only where the line of a timeline is not "what (by who)". */
function eventWords(event: CaseEvent, sent: Set<string>, withNew: boolean, by: string): { icon: string; what: string; text: string; title?: string } {
  if (event.type === 'message') {
    if (event.channel === 'teams') return { icon: 'teams', what: `Teams chat started with ${event.to}`, text: event.subject ?? '' };
    const delivery = event.channel === 'outlook' ? 'sent from Outlook' : sent.has(event.text ?? '') ? 'sent from the shared mailbox' : 'waiting in the outbox';
    return { icon: event.kind === 'reminder' || event.kind === 'escalation' ? 'remind' : 'mail', what: `${event.kind === 'reminder' ? (withNew ? 'Reminder with new points' : 'Reminder') : event.kind === 'escalation' ? 'Escalation' : 'Email'} to ${event.to}${event.cc ? `, Cc ${event.cc}` : ''}`, text: `${delivery} · ${event.ref ?? ''}` };
  }
  if (event.type === 'status' && event.text === 'Waived') return { icon: 'stop', what: 'Not followed up (before version 0.12: no reason or review date)', title: `Not followed up (by ${by}, before version 0.12: no reason or review date)`, text: '' };
  if (event.type === 'status') return { icon: 'ok', what: `Status set to ${event.text}`, text: '' };
  if (event.type === 'assign') return { icon: 'assign', what: event.text ? `Assigned to ${event.text}` : 'Assignment removed', text: '' };
  if (event.type === 'handover') return { icon: 'handover', what: `Handed over to ${event.to ?? ''}`, text: event.text ?? '' };
  if (event.type === 'request') return { icon: 'file', what: `Request number ${event.text}`, text: '' };
  if (event.type === 'report') return { icon: 'load', what: datesInText(event.text ?? 'Report'), text: '' };
  if (event.type === 'exception') {
    const what = event.text === 'Ended by hand' ? 'Followed up again' : 'Not followed up';
    return { icon: 'stop', what: `${what}${event.ciName ? ` for ${event.ciName}` : ''}`, text: event.text === 'Ended by hand' ? '' : `${event.reason ?? ''}${event.reviewOn ? `; review on ${screenDate(event.reviewOn)}` : ''}${event.text ? `. ${event.text}` : ''}` };
  }
  if (event.type === 'review') return { icon: 'review', what: event.ciKey ? `Lifecycle review: ${event.ciName ?? event.ciKey} is ${REVIEW_WORDS[event.reason ?? ''] ?? event.reason ?? ''}` : 'Lifecycle review started', text: event.text ?? '' };
  if (event.type === 'reviewed') return { icon: 'eye', what: event.text === REVIEWED_ASK ? 'SACM checked it: the owner is asked' : 'Back to SACM', text: '' };
  if (event.type === 'retirement') return { icon: 'calendar', what: event.retireOn ? `Planned retirement date: ${longDate(event.retireOn)}` : 'Planned retirement date taken away', text: event.text ?? '' };
  if (event.type === 'stage') return { icon: 'stage', what: `Mapping stage set to ${stageWord(event.text ?? '')}`, text: '' };
  if (event.type === 'no-process') return { icon: 'note', what: event.text === 'yes' ? 'The owner says the Business Process does not exist' : 'The mark "the process does not exist" taken away', text: '' };
  if (event.type === 'settings') return { icon: 'settings', what: 'Settings changed', text: event.text ?? '' };
  if (event.type === 'person-note') return { icon: 'note', what: 'Note about the person', title: `Note about the person by ${by}`, text: event.text ?? '' };
  return { icon: 'note', what: 'Note', title: `Note by ${by}`, text: event.text ?? '' };
}
