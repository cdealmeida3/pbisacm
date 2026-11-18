import type { Ci, References } from '../model/model.ts';

/**
 * Teams that are the contact for the record of a class (reference/record-teams, D195): a problem on the record of a Business
 * Process goes to the Process Management team, never to the people of the process. The reference file says which checks on
 * which classes go to which team; the people of each team are a team setting (Settings, Requests and mailboxes). Pure.
 */

/** One team of reference/record-teams. `checks`: the checks whose lines on a CI of `classes` go to the team. */
export interface RecordTeam {
  id: string;
  /** The name of the team, also the name of its owner group ("Process Management"). */
  name: string;
  classes: string[];
  checks: string[];
}

export const RECORD_TEAMS_REF = 'reference/record-teams';

/** The contact id of a team is `team:<id>`; a fact with such a contact goes to the people of the team in the settings. */
export const TEAM_PREFIX = 'team:';
export const isTeam = (contactId: string): boolean => contactId.startsWith(TEAM_PREFIX);
export const teamIdOf = (contactId: string): string => (isTeam(contactId) ? contactId.slice(TEAM_PREFIX.length) : '');
/** How a team is found: "Process Management team". The messages say why the team gets them from it. */
export const teamVia = (team: Pick<RecordTeam, 'name'>): string => `${team.name} team`;

/** The teams of the reference file, [] without it. */
export const recordTeams = (references: References): RecordTeam[] =>
  ((references[RECORD_TEAMS_REF] as { teams?: RecordTeam[] } | undefined)?.teams) ?? [];

/** The team that gets a line of a check on this CI, or null when the people of the CI are asked as usual. */
export function teamFor(ci: Pick<Ci, 'className'>, checkId: string, references: References): RecordTeam | null {
  return recordTeams(references).filter((team) => team.classes.indexOf(ci.className) >= 0 && team.checks.indexOf(checkId) >= 0)[0] ?? null;
}

/** A team as the settings hold it: the name the message greets and its people. */
export interface TeamPeople { name: string; people: Array<{ name: string; email: string }> }

/** The addresses of the people of a team, "a@…; b@…", '' when the settings name nobody. */
export const teamAddresses = (team: TeamPeople | undefined): string =>
  (team?.people ?? []).map((person) => person.email.trim()).filter((email) => /^\S+@\S+$/.test(email)).join('; ');
