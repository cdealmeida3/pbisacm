import { ROLES } from '../model/model.ts';
import type { Ci, PersonRef, Role } from '../model/model.ts';

/** `id` is how the person is known: user ID, else email (lower case). One person gets one message, whatever their name. */
export interface Contact {
  name: string; email: string; id: string; via: string;
  /**
   * Who to write to when this person does not answer: their manager, else the head of their department (D40). For a person
   * asked as Managed by: the Owned by person of the same CI, else the owner's manager or department head (D160). Empty when
   * the report names nobody.
   */
  above?: { name: string; email: string; id: string; via: EscalationVia };
}

/** How the person who gets an escalation was found. */
export type EscalationVia = 'manager' | 'department head' | 'owner' | 'manager of owner' | 'department head of owner';

const reachable = (person: PersonRef | undefined): person is PersonRef => !!person && !!person.email && person.active !== false;
/** The manager of a person (when `manager` is true and the manager is active), else the head of their department. */
function aboveOf(person: PersonRef, manager: boolean): Contact['above'] {
  if (manager && person.managerEmail && person.managerActive !== false) return { name: person.manager, email: person.managerEmail, id: personId(person.managerUserId, person.managerEmail), via: 'manager' };
  if (person.departmentHeadEmail) return { name: person.departmentHead, email: person.departmentHeadEmail, id: personId(person.departmentHeadUserId, person.departmentHeadEmail), via: 'department head' };
  return undefined;
}

/**
 * The escalation for a person asked as Managed by (D160): the Owned by person of the same CI, when active and not the same
 * person. Else the owner's manager (else department head). Else, as for anyone (D40), the Managed by person's own manager.
 */
function managedByAbove(ci: Ci, person: PersonRef): Contact['above'] {
  const owner = ci.roles.owned_by;
  const self = personId(person.userId, person.email);
  if (owner && reachable(owner) && personId(owner.userId, owner.email) !== self) return { name: owner.name, email: owner.email, id: personId(owner.userId, owner.email), via: 'owner' };
  const ownerAbove = owner && (owner.email || owner.name) ? aboveOf(owner, true) : undefined;
  if (ownerAbove && ownerAbove.id !== self) return { ...ownerAbove, via: ownerAbove.via === 'manager' ? 'manager of owner' : 'department head of owner' };
  return aboveOf(person, true);
}

export const personId = (userId: string, email: string): string => (userId || email).trim().toLowerCase();

/**
 * Who to write to about a finding. `audience` is an ordered list; the first entry that gives a reachable person wins:
 *   a role ("owned_by"), "otherRoles" (the first other filled role), "managerOf(<role>)", "departmentHeadOf(<role>)",
 *   where "<role>" may be "field" (the role the finding is about).
 * The role the finding is about is never the contact, and nobody marked inactive is. The remaining reachable roles are copied (cc).
 */
export function resolveContact(ci: Ci, field: string, audience: string[]): { to: Contact | null; cc: Contact[] } {
  const others = ROLES.filter((role) => role !== field && reachable(ci.roles[role]));
  const asContact = (role: Role): Contact => {
    const person = ci.roles[role]!;
    return { name: person.name, email: person.email, id: personId(person.userId, person.email), via: role.replace('_', ' '), above: role === 'managed_by' ? managedByAbove(ci, person) : aboveOf(person, true) };
  };
  let to: Contact | null = null;

  for (const entry of audience) {
    const above = /^(managerOf|departmentHeadOf)\((.+)\)$/.exec(entry);
    if (above) {
      const role = above[2] === 'field' ? field : above[2]!;
      const person = ci.roles[role as Role];
      const label = role.replace('_', ' ');
      if (person && above[1] === 'managerOf' && person.managerEmail && person.managerActive !== false) {
        to = { name: person.manager, email: person.managerEmail, id: personId(person.managerUserId, person.managerEmail), via: `manager of ${label}`, above: aboveOf(person, false) };
      }
      if (person && above[1] === 'departmentHeadOf' && person.departmentHeadEmail) {
        to = { name: person.departmentHead, email: person.departmentHeadEmail, id: personId(person.departmentHeadUserId, person.departmentHeadEmail), via: `department head of ${label}` };
      }
    } else if (entry === 'otherRoles') {
      if (others.length) to = asContact(others[0]!);
    } else if (others.indexOf(entry as Role) >= 0) {
      to = asContact(entry as Role);
    }
    if (to) break;
  }
  const toEmail = to ? to.email.toLowerCase() : '';
  const cc = others.map(asContact).filter((contact) => contact.email.toLowerCase() !== toEmail);
  return { to, cc };
}
