import { personId } from '../../core/cases/contact.ts';
import type { CapabilityRow } from '../../core/mapping/capability-sheet.ts';
import type { Run } from '../../core/cases/cases.ts';
import type { Ci, PersonRef } from '../../core/model/model.ts';

/**
 * The people of a CI as the screens show them (Owned by, Managed by, Supported by), and the run as the app saves it.
 * Pure, like everything in src/app/view/: no DOM and no React, so it is tested with node:test.
 */

export interface Person { id: string; name: string; email: string; active: boolean | null }
/** The three roles of a CI the screens show side by side. */
export interface CiPeople { owned_by?: Person; managed_by?: Person; supported_by?: Person }
export const SHOWN_ROLES = ['owned_by', 'managed_by', 'supported_by'] as const;
export type ShownRole = typeof SHOWN_ROLES[number];
export const ROLE_LABEL: Record<ShownRole, string> = { owned_by: 'Owned by', managed_by: 'Managed by', supported_by: 'Supported by' };

/**
 * A run as the app saves it: the core run plus the three roles of each CI with a finding (runs saved before version 0.5
 * have no `people`), and the capability sheet of the report (D205; missing without a Relationship report, and in runs
 * saved before version 0.28).
 */
export interface AppRun extends Run { people?: Record<string, CiPeople>; capabilities?: CapabilityRow[] }

const asPerson = (ref: PersonRef | undefined): Person | undefined =>
  ref && (ref.name || ref.email) ? { id: personId(ref.userId, ref.email) || ref.name.toLowerCase(), name: ref.name || ref.email, email: ref.email, active: ref.active } : undefined;

/** The roles of the CIs that have a finding, to save with the run. */
export function peopleOf(cis: Ci[], keys: Iterable<string>): Record<string, CiPeople> {
  const wanted = new Set(keys);
  const people: Record<string, CiPeople> = {};
  for (const ci of cis) {
    if (!wanted.has(ci.key)) continue;
    const entry: CiPeople = {};
    for (const role of SHOWN_ROLES) { const person = asPerson(ci.roles[role]); if (person) entry[role] = person; }
    people[ci.key] = entry;
  }
  return people;
}

/** The latest known roles of every CI, from the newest run that has them. */
export function peopleIndex(runs: AppRun[]): Map<string, CiPeople> {
  const index = new Map<string, CiPeople>();
  for (const run of runs.slice().sort((a, b) => a.date.localeCompare(b.date))) {
    for (const key of Object.keys(run.people ?? {})) index.set(key, run.people![key]!);
  }
  return index;
}
