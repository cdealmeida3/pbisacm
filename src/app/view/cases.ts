import { isClosedStatus, stateOf } from '../../core/cases/cases.ts';
import { correctedInEpo } from '../../core/sources/epo/epo-report.ts';
import { longDate } from '../../core/shared/dates.ts';
import { SHOWN_ROLES } from './people.ts';
import type { Case, CaseEvent } from '../../core/cases/cases.ts';
import type { EpoConfig, EpoSystem } from '../../core/sources/epo/epo-report.ts';
import type { CiPeople, Person } from './people.ts';

/**
 * What the screens show about cases: closed or to solve, what was done on them, and what SACM still has to do.
 * Pure: worked out again after every action, nothing is stored.
 */

export const isClosed = (item: Case): boolean => isClosedStatus(item.status);
/** To solve: not closed, and listed as open. Waiting, known and review items are never "to solve". */
/**
 * A status in the words of the screens (D228, words.md section 3): the journal keeps the status names (Contacted, Fix in
 * progress, Fixed); the screens say Asked, In progress, Marked fixed.
 */
export const STATUS_WORD: Record<string, string> = { New: 'New', Contacted: 'Asked', Answered: 'Answered', 'Fix in progress': 'In progress', Fixed: 'Marked fixed', 'Not followed up': 'Not followed up', Verified: 'Verified' };
export const statusWord = (status: string): string => STATUS_WORD[status] ?? status;

export const toSolve = (item: Case): boolean => !isClosed(item) && item.state === 'open';
/** Why a case is not to solve, in words: its planned retirement date (D148), else what the report showed ("Status Ready: not live yet"). */
export function stateWhyOf(item: Case): string {
  if (item.state === 'waiting' && item.retireOn && stateOf(item.fact) === 'open') return `Planned retirement on ${longDate(item.retireOn)}: waits until then`;
  return item.fact.stateWhy ?? '';
}

/**
 * `review`: nothing to solve, but items to look at. Neutral, never red.
 * `marked`: a SACM fix list where every line is marked as fixed (D168). Its lines still count as to solve until a later
 * report no longer shows them (D59); the card only takes the waiting colour.
 */
export type Light = 'red' | 'green' | 'grey' | 'review' | 'marked';

export interface Memory {
  /** First messages and reminders by email, and Teams chats. */
  emails: number;
  reminders: number;
  teams: number;
  lastContact: string;
  replies: number;
  reminderDue: boolean;
  overLimit: boolean;
  assignedTo: string;
  /** Notes of the team on these cases, and the newest one (version 0.11: shown on the group, not only in the case panel). */
  notes: number;
  lastNote: CaseEvent | null;
}

/** What was done on a set of cases. An action on many cases is counted once. */
export function memoryOf(cases: Case[]): Memory {
  const messages = new Map<string, CaseEvent>();
  const replies = new Set<string>();
  let emails = 0; let reminders = 0; let teams = 0; let lastContact = '';
  const notes = new Map<string, CaseEvent>();
  for (const item of cases) {
    for (const event of item.timeline) if (event.type === 'note') notes.set(event.id, event);
    // A reminder with new points is two journal lines and one message (D161): counted once, as the reminder.
    for (const event of item.messages) if (!messages.has(messageKey(event)) || event.kind === 'reminder' || event.kind === 'escalation') messages.set(messageKey(event), event);
    for (const reply of item.replies) replies.add(reply.file);
  }
  for (const event of messages.values()) {
    if (event.channel === 'teams') teams += 1;
    else if (event.kind === 'reminder' || event.kind === 'escalation') reminders += 1;
    else emails += 1;
    if (event.at > lastContact) lastContact = event.at;
  }
  const open = cases.filter((item) => !isClosed(item));
  const assigned = Array.from(new Set(open.map((item) => item.assignedTo)));
  return {
    emails, reminders, teams, lastContact: lastContact.slice(0, 10), replies: replies.size,
    reminderDue: open.some((item) => item.reminderDue), overLimit: open.some((item) => item.overLimit),
    assignedTo: assigned.length === 1 ? assigned[0]! : assigned.length > 1 ? 'Several' : '',
    notes: notes.size, lastNote: Array.from(notes.values()).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).pop() ?? null
  };
}

/** The two journal lines of a reminder with new points (same reference, same moment, same person) are one message (D161). */
export const messageKey = (event: CaseEvent): string => (event.type === 'message' && event.ref ? `${event.ref}|${event.at}|${event.by}|${event.channel ?? ''}` : event.id);

/**
 * A reply to read (F07): a reply on open cases that no manager has acted on yet. It stays "to read" until a manager
 * changes the status of one of its cases (also Not followed up) or writes again. Worked out from the journal and the replies:
 * nothing is saved. One line per reply, mine first, then the newest.
 */
export interface ReplyToRead { file: string; from: string; received: string; firstLine: string; cases: Case[]; mine: boolean }

export function repliesToRead(cases: Case[], me: string): ReplyToRead[] {
  const found = new Map<string, ReplyToRead>();
  const handled = new Set<string>();
  for (const item of cases) {
    if (isClosed(item) || !item.replies.length) continue;
    const acted = item.timeline.filter((event) => event.type === 'status' || event.type === 'exception' || event.type === 'message').map((event) => event.at).sort().pop() ?? '';
    for (const reply of item.replies) {
      // One reply can answer many CIs: it is read once a manager acted on one of them.
      if (reply.received.slice(0, 19) <= acted) { handled.add(reply.file); continue; }
      const lines = reply.text.split(/\n/).map((part) => part.trim()).filter(Boolean);
      const line = found.get(reply.file) ?? { file: reply.file, from: reply.from, received: reply.received, firstLine: lines.filter((part) => !/^(hi|hello|dear)\b[^.?!]{0,40}[,!]?$/i.test(part))[0] ?? lines[0] ?? '', cases: [], mine: false };
      line.cases.push(item);
      if (me && item.assignedTo === me) line.mine = true;
      found.set(reply.file, line);
    }
  }
  return Array.from(found.values()).filter((line) => !handled.has(line.file)).sort((a, b) => Number(b.mine) - Number(a.mine) || b.received.localeCompare(a.received));
}

/**
 * "Corrected in EPO" (version 0.14): a case asks a person to correct a role of a CI that EPO feeds, and the newest EPO
 * systems report shows another person than ServiceNow. After a message: only when EPO changed on or after the first
 * message. Before any message: "EPO already has …", so the manager sees that nobody needs to be asked.
 * Only shown: nothing is sent and nothing is changed. '' when there is nothing to say.
 */
export function epoCorrection(item: Case, systems: Map<string, EpoSystem> | null, people: Map<string, CiPeople>, config: EpoConfig | null): string {
  if (!systems || !config || !item.fact.route || isClosed(item) || !item.fact.ci?.epoId) return '';
  const system = systems.get(item.fact.ci.epoId.trim().toLowerCase());
  const asked = item.messages[0]?.at ?? '';
  const names = new Map<string, string>();
  for (const roles of people.values()) for (const role of SHOWN_ROLES) { const person = roles[role]; if (person && !names.has(person.id)) names.set(person.id, person.name); }
  const found = correctedInEpo(item.fact.field, system, people.get(item.fact.ciKey) as Record<string, Person> | undefined, undefined, asked, config, names);
  if (!found) return '';
  const next = 'ServiceNow receives it from EPO (for a service mapped CI, SACM copies it: fix list of "EPO ≠ ServiceNow").';
  return asked ? `Corrected in EPO on ${longDate(found.on)}: EPO now has ${found.value}. ${next}`
    : `EPO already has ${found.value} (last change in EPO: ${longDate(found.on)}), so nobody needs to be asked. ${next}`;
}

/** Every distinct message event of a set of cases, newest first. */
export function eventsOf(cases: Case[]): CaseEvent[] {
  const seen = new Map<string, CaseEvent>();
  for (const item of cases) for (const event of item.timeline) seen.set(event.id, event);
  return Array.from(seen.values()).sort((a, b) => b.at.localeCompare(a.at));
}
