import { isClosedStatus } from '../../core/cases/cases.ts';
import { safeName } from '../../core/memory/finder.ts';
import { cleanTeam, doubleContacts, monthsToRecheck, shareOut, sinceLastVisit, writeTeam } from '../../core/team/team.ts';
import { teamChanges } from '../../core/audit/audit.ts';
import { parseJournal } from '../../core/memory/memory.ts';
import { record, recordAll } from './journal.ts';
import { changed, nowStamp, rebuild, state, today, update } from './store.ts';
import type { Case, CaseEvent } from '../../core/cases/cases.ts';
import type { DoubleContact, TeamMember } from '../../core/team/team.ts';

/**
 * Working together (version 0.11): the team list, Since your last visit, the warning before a double contact,
 * Hand over, Share out this card, and the page of a person contacted.
 */

/** Saves the team list in the team folder (data/team.json). Every computer writes the same bytes for the same list. */
export async function saveTeam(members: TeamMember[]): Promise<void> {
  const clean = cleanTeam(members);
  const before = writeTeam(state.team);
  const lines = teamChanges(state.team, clean);
  state.team = clean;
  if (writeTeam(clean) !== before || !(await state.workspace!.readText('data/team.json'))) await state.workspace!.writeText('data/team.json', writeTeam(clean));
  // Recorded with who and when (version 0.12). Nothing is recorded before somebody said who is working.
  if (lines.length && state.user.email) await record('settings', [], { text: lines.join('; ') });
  changed();
}

/** The names that fill the "Assign to" menus: the team list, and who is working when they are not on it. */
export function teamNames(): string[] {
  const names = state.team.map((member) => member.name);
  if (state.user.name && names.indexOf(state.user.name) < 0) names.push(state.user.name);
  return names;
}

/* ------------------------------------------------------------------ working together (version 0.11) */

const visitKey = (): string => `sacm-workbench.visit|${state.workspace?.label ?? ''}|${state.user.email.toLowerCase()}`;

/** Since your last visit: what colleagues did since this manager last opened the folder (kept in this browser). */
export function markVisit(): void {
  let last = '';
  try { last = localStorage.getItem(visitKey()) ?? ''; localStorage.setItem(visitKey(), nowStamp()); } catch { /* private window */ }
  const lines = sinceLastVisit(state.events, state.replies, last, state.user.email);
  state.since = last && lines.length ? { at: last, lines } : null;
  changed();
}

/**
 * Before a manager writes to someone: reads the colleagues' journals of this month again (and last month in the first days
 * of a month), so a message sent a minute ago on another computer counts once OneDrive has brought it. Only on a button press.
 */
export async function recheckColleagues(): Promise<void> {
  const workspace = state.workspace;
  if (!workspace || state.mode === 'files') return;
  const mine = `${safeName(state.user.email)}.jsonl`;
  const known = new Set(state.events.map((event) => event.id));
  const fresh: CaseEvent[] = [];
  for (const month of monthsToRecheck(today())) {
    for (const file of await workspace.list(`data/journal/${month}`)) {
      if (!/\.jsonl$/i.test(file.name) || file.name === mine) continue;
      for (const event of parseJournal(await workspace.readText(`data/journal/${month}/${file.name}`))) {
        if (known.has(event.id)) continue;
        known.add(event.id);
        fresh.push(event);
      }
    }
  }
  if (fresh.length) { state.events = state.events.concat(fresh); rebuild(); }
}

/** Colleagues' messages to these people, or about these cases, not long ago (see doubleContacts). */
export function colleagueContacts(recipients: string[], keys: string[]): DoubleContact[] {
  const ciOf = new Map(state.cases.map((item) => [item.key, item.fact.ciKey]));
  return doubleContacts(state.events, recipients, keys, state.user.email, nowStamp(), (key) => ciOf.get(key) ?? key);
}

/** Open work of a set of cases: not closed, to solve or to review. */
const openWork = (item: Case): boolean => !isClosedStatus(item.status) && (item.state === 'open' || item.state === 'review');

/** Hand over: gives all my open work to a colleague, with a note that shows on every case handed over. Returns how many cases. */
export async function handOver(to: string, note: string): Promise<number> {
  const keys = state.cases.filter((item) => item.assignedTo === state.user.name && openWork(item)).map((item) => item.key);
  if (!keys.length || !to) return 0;
  await record('handover', keys, { to, text: note.trim() });
  return keys.length;
}

/** Share out this card: each group nobody has taken goes to a team member (see shareOut). Returns the plan before it is saved. */
export function shareOutPlan(groups: Array<{ key: string; keys: string[]; size: number }>): Map<string, string> {
  return shareOut(groups.map((group) => ({ key: group.key, size: group.size })), state.team.map((member) => member.name));
}

export async function applyShareOut(groups: Array<{ key: string; keys: string[] }>, plan: Map<string, string>): Promise<void> {
  await recordAll(groups.filter((group) => plan.has(group.key)).map((group) => ({ type: 'assign' as const, keys: group.keys, values: { text: plan.get(group.key)! } })));
}

/** Opens the page of a person contacted (`key`: user ID, else email, lower case). */
export function openPerson(key: string): void {
  if (!key) return;
  update({ backTo: state.view === 'person' ? state.backTo : state.view, view: 'person', openPerson: key, openCi: '' });
}
