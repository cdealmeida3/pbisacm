import { addBusinessDays, screenDate } from '../shared/dates.ts';
import { isClosedStatus } from '../cases/cases.ts';
import type { Case, CaseEvent, Reply } from '../cases/cases.ts';

/**
 * Working together: the team list, sharing out the work, "My work", what colleagues did since
 * the last visit, and the warning before two managers write to the same person. Pure: the app reads the files.
 * Nothing here sends, assigns or reads on its own; every function answers a button press.
 */

/** A SACM manager of the team list (`data/team.json`). The email is the identity; the name signs the work. */
export interface TeamMember { name: string; email: string }
export interface TeamFile { version: number; members: TeamMember[] }

const lower = (value: string): string => value.trim().toLowerCase();

/** The members of a team file, or [] when the text is not a team file. Members without an email are dropped. */
export function parseTeam(text: string): TeamMember[] {
  try {
    const data = JSON.parse(text) as Partial<TeamFile>;
    if (!data || !Array.isArray(data.members)) return [];
    return cleanTeam(data.members.filter((member): member is TeamMember => !!member && typeof member.email === 'string')
      .map((member) => ({ name: String(member.name ?? '').trim(), email: member.email.trim() })));
  } catch { return []; }
}

/** One entry per email (the last one wins), with a name; sorted by name, then email. Every computer writes the same file. */
export function cleanTeam(members: TeamMember[]): TeamMember[] {
  const byEmail = new Map<string, TeamMember>();
  for (const member of members) {
    const email = member.email.trim();
    if (!/^\S+@\S+$/.test(email)) continue;
    byEmail.set(lower(email), { name: member.name.trim() || email, email });
  }
  return Array.from(byEmail.values()).sort((a, b) => a.name.localeCompare(b.name) || lower(a.email).localeCompare(lower(b.email)));
}

export const writeTeam = (members: TeamMember[]): string => JSON.stringify({ version: 1, members: cleanTeam(members) } as TeamFile, null, 1);

/** Two versions of the team list (a conflict copy): everybody on either list, once. */
export const mergeTeams = (a: TeamMember[], b: TeamMember[]): TeamMember[] => cleanTeam(b.concat(a));

/* ------------------------------------------------------------------ assigning */

/**
 * Share out this card: gives each group to a team member, the biggest group first, always to the member with the fewest
 * CIs so far (in list order when equal). `size` is the number of CIs of a group. The result can still be changed group by group.
 */
export function shareOut(groups: Array<{ key: string; size: number }>, members: string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (!members.length) return result;
  const load = members.map(() => 0);
  const ordered = groups.slice().sort((a, b) => b.size - a.size || a.key.localeCompare(b.key));
  for (const group of ordered) {
    let best = 0;
    for (let index = 1; index < members.length; index += 1) if (load[index]! < load[best]!) best = index;
    result.set(group.key, members[best]!);
    load[best] = load[best]! + group.size;
  }
  return result;
}

/* ------------------------------------------------------------------ the person contacted */

/** How a person contacted is known: user ID, else email, lower case (as `contactId`). */
export const contactKeyOf = (item: Case): string => item.fact.contactId || lower(item.fact.contactEmail);

const isClosed = (item: Case): boolean => isClosedStatus(item.status);
const isOpenWork = (item: Case): boolean => !isClosed(item) && (item.state === 'open' || item.state === 'review');

/** One person to contact in "My work": their open cases assigned to me, and why they come first. */
export interface WorkItem {
  contact: string;
  name: string;
  email: string;
  cases: Case[];
  checkIds: string[];
  ciCount: number;
  /** 0: an answer came, 1: a reminder is due (or an escalation), 2: everything else (new, contacted). */
  rank: 0 | 1 | 2;
  handover: CaseEvent | null;
}

/** "My work": everything open assigned to `me`, grouped by the person to contact. Answers first, then reminders due, then new. */
export function myWork(cases: Case[], me: string): WorkItem[] {
  if (!me) return [];
  const byContact = new Map<string, Case[]>();
  for (const item of cases) {
    if (item.assignedTo !== me || !isOpenWork(item)) continue;
    const key = contactKeyOf(item) || 'nobody';
    byContact.set(key, (byContact.get(key) ?? []).concat([item]));
  }
  const items: WorkItem[] = [];
  byContact.forEach((list, contact) => {
    const fact = list[0]!.fact;
    const rank = list.some((item) => item.status === 'Answered') ? 0 : list.some((item) => item.reminderDue || item.overLimit) ? 1 : 2;
    items.push({
      contact, name: fact.contactName || fact.contactEmail || 'Nobody found to ask', email: fact.contactEmail, cases: list,
      checkIds: Array.from(new Set(list.map((item) => item.fact.checkId))), ciCount: new Set(list.map((item) => item.fact.ciKey)).size,
      rank, handover: list.map((item) => item.handover).filter((event): event is CaseEvent => !!event).sort((a, b) => a.at.localeCompare(b.at)).pop() ?? null
    });
  });
  return items.sort((a, b) => a.rank - b.rank || b.ciCount - a.ciCount || a.name.localeCompare(b.name));
}

/** The groups of a card that nobody has taken: open work with no assignee. `groups` are the keys of the cases of each group. */
export function unassignedCount(groups: Case[][]): number {
  return groups.filter((members) => members.some(isOpenWork) && members.filter(isOpenWork).every((item) => !item.assignedTo)).length;
}

/* ------------------------------------------------------------------ what colleagues did */

/** The events and replies newer than `since`, by everybody but `me`, as short lines: "Nia sent 4 emails". */
export function sinceLastVisit(events: CaseEvent[], replies: Reply[], since: string, me: string): string[] {
  if (!since) return [];
  const newer = events.filter((event) => event.at > since && lower(event.by) !== lower(me));
  const byPerson = new Map<string, CaseEvent[]>();
  for (const event of newer) byPerson.set(event.byName || event.by, (byPerson.get(event.byName || event.by) ?? []).concat([event]));
  const lines: string[] = [];
  const count = (value: number, word: string, many = `${word}s`): string => `${value} ${value === 1 ? word : many}`;
  Array.from(byPerson.keys()).sort((a, b) => a.localeCompare(b)).forEach((name) => {
    const own = byPerson.get(name)!;
    const parts: string[] = [];
    const emails = own.filter((event) => event.type === 'message' && event.channel !== 'teams' && event.kind !== 'reminder' && event.kind !== 'escalation').length;
    const reminders = own.filter((event) => event.type === 'message' && event.channel !== 'teams' && (event.kind === 'reminder' || event.kind === 'escalation')).length;
    const teams = own.filter((event) => event.type === 'message' && event.channel === 'teams').length;
    const notes = own.filter((event) => event.type === 'note' || event.type === 'person-note').length;
    const handovers = own.filter((event) => event.type === 'handover');
    if (emails) parts.push(`sent ${count(emails, 'email')}`);
    if (reminders) parts.push(`sent ${count(reminders, 'reminder')}`);
    if (teams) parts.push(`started ${count(teams, 'Teams chat')}`);
    if (notes) parts.push(`wrote ${count(notes, 'note')}`);
    const compared = own.filter((event) => event.type === 'review' && !!event.ciKey).length;
    if (own.some((event) => event.type === 'review' && !event.ciKey)) parts.push('started a lifecycle review');
    if (compared) parts.push(`compared ${count(compared, 'CI')} with EPO in the lifecycle review`);
    for (const event of handovers) parts.push(`handed over work to ${event.to ?? 'a colleague'}`);
    for (const event of own.filter((item) => item.type === 'report' && /^Loaded/.test(item.text ?? ''))) {
      const date = /report of (\d{4}-\d{2}-\d{2})/.exec(event.text ?? '');
      parts.push(`loaded the report${date ? ` of ${screenDate(date[1]!)}` : ''}`);
    }
    if (parts.length) lines.push(`${name} ${parts.join(', ')}`);
  });
  const arrived = replies.filter((reply) => reply.received > since).length;
  if (arrived) lines.push(`${count(arrived, 'reply', 'replies')} arrived`);
  return lines;
}

/** How far back the warning before a double contact looks. To set after the pilot measured the OneDrive delay. */
export const DOUBLE_CONTACT_HOURS = 24;

/** A colleague's message to the same person, or about the same cases, not long ago. */
export interface DoubleContact { event: CaseEvent; sameCis: number; samePerson: boolean }

/**
 * Before a manager writes: did a colleague write to one of these people, or about one of these cases, in the last
 * `hours`? `ciOf` gives the CI of a case key. Messages of `me` (from any computer) are not counted.
 */
export function doubleContacts(events: CaseEvent[], recipients: string[], keys: string[], me: string, now: string, ciOf: (key: string) => string, hours = DOUBLE_CONTACT_HOURS): DoubleContact[] {
  const from = new Date(Date.parse(`${now.slice(0, 19)}Z`) - hours * 3600000).toISOString().slice(0, 19);
  const wanted = new Set(recipients.map(lower).filter(Boolean));
  const mine = new Set(keys);
  const found: DoubleContact[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    if (event.type !== 'message' || event.at < from || lower(event.by) === lower(me) || seen.has(event.id)) continue;
    const to = (event.to ?? '').split(/[;,]/).map(lower).filter(Boolean);
    const samePerson = to.some((address) => wanted.has(address));
    const cis = new Set(event.keys.filter((key) => mine.has(key)).map(ciOf));
    if (!samePerson && !cis.size) continue;
    seen.add(event.id);
    found.push({ event, sameCis: cis.size, samePerson });
  }
  return found.sort((a, b) => b.event.at.localeCompare(a.event.at));
}

/** The journal months the double-contact check reads again: this month, and last month in the first days of a month. */
export function monthsToRecheck(today: string): string[] {
  const month = today.slice(0, 7);
  const firstDays = addBusinessDays(`${month}-01`, 2) >= today;
  if (!firstDays) return [month];
  const [year, number] = month.split('-').map(Number) as [number, number];
  const previous = number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
  return [previous, month];
}

/* ------------------------------------------------------------------ the activity page */

export interface ActivityFilter { by?: string; day?: string }

/** Everything the team did, newest first, with a filter per manager (email) and per day (yyyy-mm-dd). */
export function activity(events: CaseEvent[], filter: ActivityFilter = {}): CaseEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    if (filter.by && lower(event.by) !== lower(filter.by)) return false;
    if (filter.day && event.at.slice(0, 10) !== filter.day) return false;
    return true;
  }).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}

/** The managers and days that have activity, for the filters. */
export function activityChoices(events: CaseEvent[]): { people: Array<{ email: string; name: string }>; days: string[] } {
  const people = new Map<string, string>();
  const days = new Set<string>();
  for (const event of events) {
    if (event.by && !people.has(lower(event.by))) people.set(lower(event.by), event.byName || event.by);
    days.add(event.at.slice(0, 10));
  }
  return {
    people: Array.from(people.entries()).map(([email, name]) => ({ email, name })).sort((a, b) => a.name.localeCompare(b.name)),
    days: Array.from(days).sort().reverse()
  };
}

/** The notes the team wrote about one person contacted (`person` is their contact key), newest first. */
export const personNotes = (events: CaseEvent[], person: string): CaseEvent[] =>
  events.filter((event) => event.type === 'person-note' && event.person === person).sort((a, b) => b.at.localeCompare(a.at));

/** Who loaded a report first (from the journal: "report" events whose ref is the run file), and the others who loaded it too. */
export function loadersOf(events: CaseEvent[], runFile: string): { first: CaseEvent | null; others: CaseEvent[] } {
  const loads = events.filter((event) => event.type === 'report' && event.ref === runFile && /^Loaded/.test(event.text ?? ''))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const first = loads[0] ?? null;
  const removed = events.filter((event) => event.type === 'report' && event.ref === runFile && /^Removed/.test(event.text ?? '')).map((event) => event.at).sort();
  // A load after a removal is a new load, not a double one.
  const others = first ? loads.slice(1).filter((event) => lower(event.by) !== lower(first.by) && !removed.some((at) => at > first.at && at < event.at)) : [];
  return { first, others };
}
