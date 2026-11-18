import { describeEvent } from './activity.ts';
import { isClosed } from './cases.ts';
import { SHOWN_ROLES } from './people.ts';
import type { Case, CaseEvent } from '../../core/cases/cases.ts';
import type { EventLine } from './activity.ts';
import type { CiPeople } from './people.ts';

/**
 * The page of a person contacted: who they are, what is open with them, and the contact history.
 */

/** A person contacted as the screens show them: from the cases that ask them, else from the roles of the CIs. */
export function personOf(key: string, cases: Case[], people: Map<string, CiPeople>): { key: string; name: string; email: string; active: boolean | null } {
  for (const item of cases) {
    if ((item.fact.contactId || item.fact.contactEmail.toLowerCase()) === key) return { key, name: item.fact.contactName || item.fact.contactEmail, email: item.fact.contactEmail, active: null };
  }
  for (const roles of people.values()) {
    for (const role of SHOWN_ROLES) { const person = roles[role]; if (person && person.id === key) return { key, name: person.name, email: person.email, active: person.active }; }
  }
  return { key, name: key, email: /@/.test(key) ? key : '', active: null };
}

/**
 * Everything open with a person: the cases that ask them (`asked`), and the open cases of CIs where they hold a role but
 * somebody else is asked (`named`). Waiting and known items are left out: nobody is asked about them.
 */
export function casesOfPerson(key: string, cases: Case[], people: Map<string, CiPeople>): { asked: Case[]; named: Case[] } {
  const open = (item: Case): boolean => !isClosed(item) && (item.state === 'open' || item.state === 'review');
  const asked = cases.filter((item) => open(item) && (item.fact.contactId || item.fact.contactEmail.toLowerCase()) === key);
  const askedKeys = new Set(asked.map((item) => item.key));
  const named = cases.filter((item) => open(item) && !askedKeys.has(item.key) && SHOWN_ROLES.some((role) => people.get(item.fact.ciKey)?.[role]?.id === key));
  return { asked, named };
}

/** The contact history with a person, newest first: messages to them or on their cases, the replies, and the team's notes. */
export function personTimeline(key: string, email: string, cases: Case[], events: CaseEvent[], sent: Set<string> = new Set()): EventLine[] {
  const mine = cases.filter((item) => (item.fact.contactId || item.fact.contactEmail.toLowerCase()) === key);
  const keys = new Set(mine.map((item) => item.key));
  const address = email.toLowerCase();
  const lines = new Map<string, EventLine>();
  for (const event of events) {
    const toThem = !!address && (event.to ?? '').toLowerCase().split(/[;,]/).some((part) => part.trim() === address);
    const onTheirs = event.keys.some((k) => keys.has(k));
    if ((event.type === 'message' && (toThem || onTheirs)) || (event.type === 'person-note' && event.person === key) || ((event.type === 'handover' || event.type === 'request') && onTheirs)) {
      lines.set(event.id, describeEvent(event, sent));
    }
  }
  for (const item of mine) {
    for (const reply of item.replies) lines.set(`reply:${reply.file}`, { at: reply.received.slice(0, 19), id: `reply:${reply.file}`, icon: 'replies', title: `Reply from ${reply.from}`, what: 'Reply', by: reply.from, text: reply.text });
  }
  return Array.from(lines.values()).sort((a, b) => b.at.localeCompare(a.at));
}
