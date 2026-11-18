import { EPO_OWNER } from '../../core/cases/cases.ts';
import { isTeam } from '../../core/cases/record-teams.ts';
import { escalationOf, recipientOf } from '../../core/messages/messages.ts';
import { addBusinessDays } from '../../core/shared/dates.ts';
import { isClosed, memoryOf, statusWord } from './cases.ts';
import { SHOWN_ROLES } from './people.ts';
import type { Case, Rules } from '../../core/cases/cases.ts';
import type { MessageSettings } from '../../core/messages/messages.ts';
import type { Memory } from './cases.ts';
import type { CiPeople, Person } from './people.ts';

/**
 * The cases of a card grouped by owner (Owned by), with everybody named on their CIs; search, sort and the Teams link of a group.
 */

export interface CiRow { ciKey: string; name: string; classLabel: string; people: CiPeople; cases: Case[] }
export type GroupState = 'open' | 'answered' | 'closed';

/** The cases of one card that share an owner (Owned by), with everybody named on their CIs. */
export interface OwnerGroup {
  key: string;
  /** Null: the CIs have no Owned by. */
  owner: Person | null;
  cases: Case[];
  open: Case[];
  rows: CiRow[];
  /** Set when the group is a kind of finding and not an owner (contract cards): its name, "End date". */
  label?: string;
  /** Set when the CIs have no Owned by: why, in words ("No Owned by and no Managed by"). One group per reason (F37). */
  noOwner?: string;
  /** Set when a team of the settings is asked instead of the people of the CIs (Process Management, D195): the group is the team. */
  team?: boolean;
  /** Every distinct person on the CIs (owner, manager, supporter) and every contact, once each. */
  people: Person[];
  /** Who the check asks first, with why. */
  contacts: Array<{ name: string; email: string; via: string }>;
  memory: Memory;
  state: GroupState;
  verifiedOn: string;
}

/** Who a case goes to. `recipient` resolves the EPO inventory owner from the team settings (see recipientOf). */
export type Recipient = (fact: Case['fact']) => { name: string; email: string; via: string };
const asIs: Recipient = (fact) => ({ name: fact.contactName, email: fact.contactEmail, via: fact.contactVia });

/**
 * Why a CI without Owned by is where it is, in words: nobody is named at all, the person named has no email, or somebody
 * else is asked in the owner's place. The group "nobody" is split by these (F37).
 */
export function noOwnerReason(item: Case, recipient: Recipient = asIs, roles: CiPeople = {}): string {
  const to = recipient(item.fact);
  if (!to.email && !to.name) return roles.managed_by ? 'Nobody to ask is named' : 'No Owned by and no Managed by';
  if (!to.email) return item.fact.contactId === EPO_OWNER ? 'The EPO inventory owner has no email in Settings' : 'The person has no email';
  return `No Owned by: ${to.via || 'somebody else'} is asked`;
}

/** Can somebody be written to about this case? False when the report names no one, or the person has no email. */
export const canWriteTo = (item: Case, recipient: Recipient = asIs): boolean => !!recipient(item.fact).email;

function contactPerson(item: Case, recipient: Recipient): Person | null {
  const to = recipient(item.fact);
  if (!to.email && !to.name) return null;
  return { id: item.fact.contactId || to.email.toLowerCase(), name: to.name || to.email, email: to.email, active: null };
}

/** Groups the cases of a card by the Owned by of their CI. Open groups first, then answered, then closed; bigger groups first. */
export function ownerGroups(cases: Case[], people: Map<string, CiPeople>, recipient: Recipient = asIs, sort: GroupSort = 'size'): OwnerGroup[] {
  const byOwner = new Map<string, { owner: Person | null; cases: Case[]; label?: string; noOwner?: string; team?: boolean }>();
  for (const item of cases) {
    // A finding with a kind (contract cards) is listed by kind: the people of a contract are not who is asked.
    if (item.fact.group) {
      const entry = byOwner.get(`kind:${item.fact.group}`) ?? { owner: null, cases: [], label: item.fact.group };
      entry.cases.push(item);
      byOwner.set(`kind:${item.fact.group}`, entry);
      continue;
    }
    // A team asked instead of the people of the CIs (a Business Process: Process Management) is one group of its own (D195).
    if (isTeam(item.fact.contactId)) {
      const entry = byOwner.get(`team:${item.fact.contactId}`) ?? { owner: contactPerson(item, recipient), cases: [], team: true };
      entry.cases.push(item);
      byOwner.set(`team:${item.fact.contactId}`, entry);
      continue;
    }
    const roles = people.get(item.fact.ciKey);
    // Runs from before version 0.5 have no roles: fall back to the contact when the check asked the owner.
    // A finding whose contact comes from another CI (Offering owner: the Business Service's owner) is grouped by that contact.
    const owner = item.fact.contactCi ? contactPerson(item, recipient) ?? roles?.owned_by ?? null
      : roles ? roles.owned_by ?? null : item.fact.contactVia === 'owned by' ? contactPerson(item, recipient) : null;
    const noOwner = owner ? '' : noOwnerReason(item, recipient, roles);
    const key = owner ? `owner:${owner.id}` : `owner::${noOwner}`;
    const entry = byOwner.get(key) ?? { owner, cases: [], ...(noOwner ? { noOwner } : {}) };
    entry.cases.push(item);
    byOwner.set(key, entry);
  }
  const groups: OwnerGroup[] = [];
  byOwner.forEach(({ owner, cases: members, label, noOwner, team }, key) => {
    const rowsByCi = new Map<string, CiRow>();
    for (const item of members) {
      const row = rowsByCi.get(item.fact.ciKey) ?? { ciKey: item.fact.ciKey, name: item.fact.ciName, classLabel: item.fact.classLabel, people: people.get(item.fact.ciKey) ?? {}, cases: [] };
      row.cases.push(item);
      rowsByCi.set(item.fact.ciKey, row);
    }
    const everyone = new Map<string, Person>();
    const contacts = new Map<string, { name: string; email: string; via: string }>();
    // The people of the CIs are not copied on a message to a team: only the team is listed.
    if (!label && !team) for (const row of rowsByCi.values()) for (const role of SHOWN_ROLES) { const person = row.people[role]; if (person && !everyone.has(person.id)) everyone.set(person.id, person); }
    for (const item of members) {
      const contact = contactPerson(item, recipient);
      if (!contact) continue;
      if (!everyone.has(contact.id)) everyone.set(contact.id, contact);
      if (!contacts.has(contact.id)) contacts.set(contact.id, { name: contact.name, email: contact.email, via: recipient(item.fact).via });
    }
    const open = members.filter((item) => !isClosed(item));
    const state: GroupState = !open.length ? 'closed' : open.every((item) => item.status === 'Answered' || item.status === 'Fix in progress' || item.status === 'Fixed') ? 'answered' : 'open';
    const rows = Array.from(rowsByCi.values()).sort((a, b) => Number(a.cases.every(isClosed)) - Number(b.cases.every(isClosed))
      || (sort === 'age' ? firstSeenOf(a.cases).localeCompare(firstSeenOf(b.cases)) : 0) || a.name.localeCompare(b.name));
    groups.push({
      key, owner, ...(label ? { label } : {}), ...(noOwner ? { noOwner } : {}), ...(team ? { team } : {}), cases: members, open, rows, people: Array.from(everyone.values()), contacts: Array.from(contacts.values()),
      memory: memoryOf(members), state, verifiedOn: open.length ? '' : members.map((item) => item.verifiedOn).sort().pop() ?? ''
    });
  });
  const rank: Record<GroupState, number> = { open: 0, answered: 1, closed: 2 };
  const ownerName = (group: OwnerGroup): string => group.label ?? group.owner?.name ?? '';
  const bySize = (a: OwnerGroup, b: OwnerGroup): number => b.open.length - a.open.length || b.rows.length - a.rows.length || ownerName(a).localeCompare(ownerName(b));
  const order: Record<GroupSort, (a: OwnerGroup, b: OwnerGroup) => number> = {
    size: bySize,
    // Groups without an owner last.
    owner: (a, b) => Number(!ownerName(a)) - Number(!ownerName(b)) || ownerName(a).localeCompare(ownerName(b)),
    ci: (a, b) => (a.rows[0]?.name ?? '').localeCompare(b.rows[0]?.name ?? ''),
    age: (a, b) => firstSeenOf(a.cases).localeCompare(firstSeenOf(b.cases)) || bySize(a, b)
  };
  return groups.sort((a, b) => rank[a.state] - rank[b.state] || order[sort](a, b));
}

/**
 * The badge of a group, in the words of its status (F24): "Fix in progress" when a manager set that, never "Answered"
 * for it. '' when the group is simply to solve (New or Contacted) or closed.
 */
export function groupStatusWord(group: Pick<OwnerGroup, 'open' | 'state'>): string {
  if (group.state !== 'answered') return '';
  const statuses = Array.from(new Set(group.open.map((item) => item.status)));
  return statuses.length === 1 ? statuses[0]! : statuses.sort().join(', ');
}

/** How the owner groups of a card are ordered: biggest first, by owner name, by CI name, or oldest finding first. */
export type GroupSort = 'size' | 'owner' | 'ci' | 'age';
export const GROUP_SORTS: Array<{ id: GroupSort; label: string }> = [
  { id: 'size', label: 'Most CIs first' }, { id: 'owner', label: 'Owner (A to Z)' }, { id: 'ci', label: 'CI (A to Z)' }, { id: 'age', label: 'Oldest first' }
];
const firstSeenOf = (cases: Case[]): string => cases.map((item) => item.firstSeen).sort()[0] ?? '';

/** The classes of a set of cases, for the class filter, A to Z. */
export function classesOf(cases: Case[]): string[] {
  return Array.from(new Set(cases.map((item) => item.fact.classLabel).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

/** Owner groups start folded when a card has more than this many. */
export const FOLD_ABOVE = 20;

/** Does a group match the search words (CI, class, person, problem)? */
export function groupMatches(group: OwnerGroup, words: string): boolean {
  if (!words) return true;
  const needle = words.toLowerCase();
  const hay = [
    ...group.people.map((person) => `${person.name} ${person.email}`),
    ...group.rows.map((row) => `${row.name} ${row.classLabel}`),
    ...group.cases.map((item) => item.fact.detail)
  ].join(' ').toLowerCase();
  return hay.indexOf(needle) >= 0;
}

/** Teams links stay reliable for a group chat up to about this many people; above it the app suggests email. */
export const TEAMS_LIMIT = 15;

/**
 * A Teams deep link that opens a new chat with these people, a topic and a first message the manager can still change.
 * The app makes no connection: Teams opens the link, and the manager confirms in the app that the chat was started.
 */
export function teamsLink(emails: string[], topic: string, message: string): string {
  const users = emails.filter(Boolean).map((email) => encodeURIComponent(email.trim())).join(',');
  const topicPart = emails.length > 1 ? `&topicName=${encodeURIComponent(topic)}` : '';
  return `https://teams.microsoft.com/l/chat/0/0?users=${users}${topicPart}&message=${encodeURIComponent(message)}`;
}

/* ------------------------------------------------------------------ working together (version 0.11) */

/**
 * All the cases of one person in one group, for "Write one message for all open points" (My work, the person page):
 * the owner groups of the cases joined into one. The message itself is still built per person asked (buildDrafts).
 */
export function combinedGroup(cases: Case[], people: Map<string, CiPeople>, recipient: Recipient = asIs): OwnerGroup {
  const groups = ownerGroups(cases, people, recipient);
  const everyone = new Map<string, Person>();
  const contacts = new Map<string, { name: string; email: string; via: string }>();
  for (const group of groups) {
    for (const person of group.people) if (!everyone.has(person.id)) everyone.set(person.id, person);
    for (const contact of group.contacts) if (!contacts.has(contact.email || contact.name)) contacts.set(contact.email || contact.name, contact);
  }
  const open = cases.filter((item) => !isClosed(item));
  return {
    key: 'combined', owner: null, cases, open, rows: ([] as CiRow[]).concat(...groups.map((group) => group.rows)),
    people: Array.from(everyone.values()), contacts: Array.from(contacts.values()), memory: memoryOf(cases),
    state: open.length ? 'open' : 'closed', verifiedOn: ''
  };
}

/* ------------------------------------------------------------------ the next step of a group (version 0.21) */

/**
 * What a manager does next on a group of cases (F05). One place decides it; the card, the case panel, My work and the
 * person page all show it.
 *   first            nobody was contacted;
 *   queued           the message waits in the outbox, not sent yet (`on`: the day it was queued);
 *   waiting          contacted, the reminder is not due (`from`: the day from which it is due);
 *   reminder         a reminder is due (`index` of `of`);
 *   escalate         the attempts are used up and it is known who gets the escalation (`to`: their names);
 *   cannot-escalate  the attempts are used up and nobody is known to escalate to (`about`: who did not answer);
 *   answered         a reply came after the last message.
 */
export type NextStep =
  | { step: 'first' } | { step: 'queued'; on: string } | { step: 'waiting'; from: string } | { step: 'reminder'; index: number; of: number }
  | { step: 'escalate'; to: string[]; attempts: number } | { step: 'cannot-escalate'; about: string[]; attempts: number } | { step: 'answered' };

export function nextStep(group: Pick<OwnerGroup, 'open'>, today: string, settings: MessageSettings & Rules): NextStep {
  const open = group.open;
  const names = (list: string[]): string[] => Array.from(new Set(list.filter(Boolean)));
  const over = open.filter((item) => item.overLimit);
  if (over.length) {
    const attempts = Math.max(...over.map((item) => item.messages.length));
    const to = names(over.map((item) => { const above = escalationOf(item.fact, settings); return above ? above.name || above.email : ''; }));
    if (to.length) return { step: 'escalate', to, attempts };
    return { step: 'cannot-escalate', about: names(over.map((item) => { const person = recipientOf(item.fact, settings); return person.name || person.email; })), attempts };
  }
  const due = open.filter((item) => item.reminderDue);
  if (due.length) return { step: 'reminder', index: Math.max(...due.map((item) => item.messages.length)), of: settings.maxReminders };
  if (open.some((item) => item.status === 'Answered')) return { step: 'answered' };
  if (open.some((item) => !item.messages.length)) return { step: 'first' };
  const queued = open.filter((item) => item.queued);
  if (queued.length) return { step: 'queued', on: queued.map((item) => item.lastMessageOn).sort()[0] ?? today };
  const contacted = open.filter((item) => item.status === 'Contacted' && item.sentOn);
  // A status set by hand (Fix in progress) with no reminder running: the manager can still write.
  if (!contacted.length) return { step: 'first' };
  return { step: 'waiting', from: contacted.map((item) => addBusinessDays(item.sentOn, settings.reminderDays)).sort()[0]! };
}

const dayMonth = (iso: string): string => { const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`); return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
const nameList = (list: string[]): string => (list.length <= 2 ? list.join(' and ') : `${list.length} people`);

/**
 * The next step in words: the main button (none while queued or waiting), the line under it, and a small link.
 * `write`: the word of the button for a first message here ("Email"). At most two words, apart from "Escalate to (name)"
 * (D225).
 */
export function stepWords(next: NextStep, write = 'Email'): { button: string; line: string; link: string; tone: 'primary' | 'danger' | 'none' } {
  switch (next.step) {
    case 'first': return { button: write, line: '', link: '', tone: 'primary' };
    case 'queued': return { button: '', line: `In the outbox since ${dayMonth(next.on)}, not sent yet.`, link: 'Write again', tone: 'none' };
    case 'waiting': return { button: '', line: `Waiting for an answer. A reminder is due from ${dayMonth(next.from)}.`, link: 'Remind now', tone: 'none' };
    case 'reminder': return { button: next.index > next.of ? `Remind ${next.index}` : `Remind ${next.index} of ${next.of}`, line: '', link: '', tone: 'primary' };
    case 'escalate': return { button: `Escalate to ${nameList(next.to)}`, line: `No answer after ${next.attempts} ${next.attempts === 1 ? 'message' : 'messages'}.`, link: '', tone: 'danger' };
    case 'cannot-escalate': return { button: 'Escalate', line: `Nobody is known to escalate to for ${nameList(next.about)}.`, link: '', tone: 'danger' };
    case 'answered': return { button: 'Reply', line: '', link: 'Write again', tone: 'primary' };
  }
}

/** The icon of the main step: Email, Remind, Escalate or Reply (docs/LOOK.md, section 4). */
export function stepIcon(next: NextStep): 'mail' | 'remind' | 'escalate' | 'replies' {
  return next.step === 'escalate' || next.step === 'cannot-escalate' ? 'escalate' : next.step === 'reminder' ? 'remind' : next.step === 'answered' ? 'replies' : 'mail';
}

/* ------------------------------------------------------------------ the head of a group (version 0.31, build L3) */

/** The one line of memory of a group (D226): "Asked 3 times · last 2 Nov · no reply", or "Not asked yet". */
export function memoryWords(memory: Memory): string {
  const asked = memory.emails + memory.reminders + memory.teams;
  if (!asked) return 'Not asked yet';
  const parts = [asked === 1 ? 'Asked 1 time' : `Asked ${asked} times`];
  if (memory.lastContact) parts.push(`last ${dayMonth(memory.lastContact)}`);
  parts.push(memory.replies ? `${memory.replies} ${memory.replies === 1 ? 'reply' : 'replies'}` : 'no reply');
  return parts.join(' · ');
}

export type GroupMode = 'solve' | 'review' | 'waiting' | 'known';
export interface StateChip { word: string; tone: 'grey' | 'amber' | 'red' | 'green' | 'blue' | 'violet' | 'teal'; icon?: 'ok' | 'clock' | 'tag' | 'escalate' | 'replies' | 'bell' | 'outbox' | 'eye' | 'marked' }

/**
 * The one state chip of a group (D226): what matters most now, in the colours of docs/LOOK.md. Null when the group was
 * never asked: the memory line says "Not asked yet".
 */
export function groupChip(group: Pick<OwnerGroup, 'open' | 'state' | 'memory' | 'verifiedOn'>, mode: GroupMode): StateChip | null {
  if (group.state === 'closed') return { word: group.verifiedOn ? `Verified ${dayMonth(group.verifiedOn)}` : 'Closed', tone: 'green', icon: 'ok' };
  if (mode === 'waiting') return { word: 'Waiting', tone: 'grey', icon: 'clock' };
  if (mode === 'known') return { word: 'Known', tone: 'grey', icon: 'tag' };
  if (group.memory.overLimit) return { word: 'To escalate', tone: 'red', icon: 'escalate' };
  if (group.memory.reminderDue) return { word: 'Reminder due', tone: 'amber', icon: 'bell' };
  if (group.state === 'answered') {
    const word = groupStatusWord(group);
    return word === 'Answered' ? { word, tone: 'violet', icon: 'replies' } : word === 'Fixed' ? { word: statusWord(word), tone: 'teal', icon: 'marked' } : { word: word.split(', ').map(statusWord).join(', '), tone: 'blue' };
  }
  if (group.open.some((item) => item.queued)) return { word: 'In the outbox', tone: 'amber', icon: 'outbox' };
  if (mode === 'review') return { word: 'To check', tone: 'blue', icon: 'eye' };
  const asked = group.memory.emails + group.memory.reminders + group.memory.teams;
  return asked ? { word: 'Asked', tone: 'blue' } : null;
}

/**
 * Who a group is named after (D226): the person asked and why ("Cy Keeper", "Managed by"), the team, the kind of problem
 * of a contract card, or "Nobody to ask" with the reason. `others`: how many more people are asked.
 */
export function askedName(group: Pick<OwnerGroup, 'label' | 'team' | 'owner' | 'contacts' | 'noOwner'>): { name: string; role: string; others: number; nobody: boolean; reason: string } {
  if (group.label) return { name: group.label, role: '', others: 0, nobody: false, reason: '' };
  const first = group.contacts[0];
  if (!first) return { name: 'Nobody to ask', role: '', others: 0, nobody: true, reason: group.noOwner || 'The report names no one for these CIs' };
  const role = group.team ? 'Team' : first.via ? first.via.charAt(0).toLocaleUpperCase('en-GB') + first.via.slice(1) : '';
  const writable = group.contacts.some((person) => person.email);
  return { name: group.team && group.owner ? group.owner.name : first.name || first.email, role, others: group.contacts.length - 1, nobody: !writable, reason: writable ? '' : group.team ? 'Settings names nobody in this team yet' : group.noOwner || 'No email address' };
}

