import { settingsChanges } from '../../core/audit/audit.ts';
import { REQUESTS, requestName } from '../../core/messages/messages.ts';
import { teamAddresses } from '../../core/cases/record-teams.ts';
import { serviceNowAddress } from '../../core/cases/record-search.ts';
import type { RecordTeam, TeamPeople } from '../../core/cases/record-teams.ts';
import type { RequestLink } from '../../core/messages/messages.ts';

/**
 * Settings, as the screens need them: the set-up list (what is still to fill in before the team can work) and the lines
 * a change of the team settings writes to Activity. Pure: the same settings give the same list and the same lines.
 */

/** The parts of the Settings window. */
export type SettingsPart = 'setup' | 'me' | 'rules' | 'requests';

export interface SetupStep {
  id: 'folder' | 'team' | 'requests' | 'procurement' | 'servicenow' | `team:${string}`;
  /** The part of Settings where the step is done. */
  part: SettingsPart;
  label: string;
  done: boolean;
  /** Where it stands: "4 of 6 links pasted". */
  note: string;
}

/** What the set-up list reads of the team settings. */
export interface SetupSettings {
  requests: Record<string, RequestLink>;
  procurementEmail: string;
  procurementLeadEmail: string;
  /** Missing in settings saved before version 0.27. */
  teams?: Record<string, TeamPeople>;
  /** Missing in settings saved before version 0.33. */
  serviceNowAddress?: string;
}

const isLink = (value: string | undefined): boolean => /^https:\/\//i.test((value ?? '').trim());
const isEmail = (value: string | undefined): boolean => /^\S+@\S+$/.test((value ?? '').trim());

/** The set-up list: one line per thing a team fills in once. `mode`: how the app was opened. */
export function setupSteps(mode: string, team: ReadonlyArray<{ email: string }>, settings: SetupSettings, teams: ReadonlyArray<Pick<RecordTeam, 'id' | 'name'>> = []): SetupStep[] {
  const links = REQUESTS.filter((request) => isLink(settings.requests[request.id]?.link)).length;
  const mailbox = isEmail(settings.procurementEmail);
  const lead = isEmail(settings.procurementLeadEmail);
  return [
    {
      id: 'folder', part: 'setup', label: 'The team folder is chosen', done: mode === 'folder',
      note: mode === 'folder' ? 'Your work is kept in the team folder.' : 'You work without a team folder: nothing is kept. Go back to the start screen and choose it.'
    },
    {
      id: 'team', part: 'rules', label: 'The team list has more than one person', done: team.length > 1,
      note: team.length === 0 ? 'Nobody is on the list yet.' : team.length === 1 ? '1 person is on the list. Add your colleagues.' : `${team.length} people are on the list.`
    },
    {
      id: 'requests', part: 'requests', label: 'The request links are pasted', done: links === REQUESTS.length,
      note: `${links} of ${REQUESTS.length} links pasted.${links < REQUESTS.length ? ' A request without a link points to the Service Portal.' : ''}`
    },
    {
      id: 'procurement', part: 'requests', label: 'The Procurement mailbox and lead are filled', done: mailbox && lead,
      note: mailbox && lead ? 'Both have an email.'
        : !mailbox ? 'The mailbox has no email: the message For Procurement cannot be written.' : 'The lead has no email: there is no escalation.'
    },
    {
      id: 'servicenow', part: 'requests', label: 'The ServiceNow address is set', done: !!serviceNowAddress(settings.serviceNowAddress ?? ''),
      note: serviceNowAddress(settings.serviceNowAddress ?? '') ? 'Each line of a SACM list opens its record in ServiceNow.' : 'Without it the lines of a SACM list cannot open their record in ServiceNow.'
    },
    // A team of reference/record-teams (Process Management) gets the lines of its class only when Settings names its people (D195).
    ...teams.map((one): SetupStep => {
      const count = teamAddresses(settings.teams?.[one.id]).split('; ').filter(Boolean).length;
      return {
        id: `team:${one.id}`, part: 'requests', label: `The ${one.name} team has people`, done: count > 0,
        note: count ? `${count} ${count === 1 ? 'person' : 'people'} with an email.` : `Nobody yet: the messages to ${one.name} cannot be written.`
      };
    })
  ];
}

/** "2 steps left", or '' when the list is done. */
export function setupLeft(steps: SetupStep[]): string {
  const left = steps.filter((step) => !step.done).length;
  return left ? `${left} ${left === 1 ? 'step' : 'steps'} left` : '';
}

/** The names of the team settings, as Settings shows them. */
const SETTING_LABELS: Record<string, string> = {
  portalLink: 'Service Portal link', signature: 'Signature of the messages', reminderDays: 'Working days before a reminder is due', maxReminders: 'Reminders before Escalate',
  epoOwnerName: 'EPO inventory owner (name)', epoOwnerEmail: 'EPO inventory owner (email)', procurementName: 'Procurement mailbox (name)',
  procurementEmail: 'Procurement mailbox (email)', procurementLeadName: 'Procurement lead (name)', procurementLeadEmail: 'Procurement lead (email)',
  staleDays: 'Days before a report counts as old', exceptionMonths: 'Months until "Not followed up" is reviewed',
  underRetirementDays: 'Days before Under retirement is too long', readyDays: 'Days before Ready is too long',
  serviceNowAddress: 'ServiceNow address'
};

/** Team settings as saved: any field, and the requests by id. */
interface Saved { requests?: Record<string, RequestLink>; teams?: Record<string, { name?: string; people?: unknown[] }> }

/** Every request with its name of the portal and its saved link, so settings saved without a request compare as equal to the empty ones. */
function withRequests<T extends Saved>(settings: T): T {
  const requests: Record<string, RequestLink> = { ...(settings.requests ?? {}) };
  for (const request of REQUESTS) requests[request.id] = { name: requestName(request.id, requests[request.id]?.name), link: (requests[request.id]?.link ?? '').trim() };
  return { ...settings, requests };
}

/** A team the other settings have and these do not, as an empty team of the same name: the first save of a team is no change. */
function withTeams<T extends Saved>(settings: T, other: Saved): T {
  const teams: Record<string, { name?: string; people?: unknown[] }> = { ...(settings.teams ?? {}) };
  for (const id of Object.keys(other.teams ?? {})) if (!teams[id]) teams[id] = { name: other.teams![id]!.name ?? '', people: [] };
  return Object.keys(teams).length ? { ...settings, teams } : settings;
}

/**
 * What changed in the team settings, one line per field, with the label of the screen: "Reminders before Escalate: 2 → 3",
 * "Link of the request "Owned by - update": (empty) → https://…". Only fields that changed; none means nothing to record.
 */
export function settingsLines<T extends Saved>(before: T, after: T): string[] {
  const labels: Record<string, string> = { ...SETTING_LABELS };
  for (const id of Object.keys({ ...(before.requests ?? {}), ...(after.requests ?? {}) })) {
    const name = REQUESTS.filter((request) => request.id === id)[0]?.name ?? requestName(id, after.requests?.[id]?.name);
    labels[`requests.${id}.link`] = `Link of the request "${name}"`;
    labels[`requests.${id}.name`] = `Name of the request "${name}"`;
  }
  for (const id of Object.keys({ ...(before.teams ?? {}), ...(after.teams ?? {}) })) {
    const name = after.teams?.[id]?.name || before.teams?.[id]?.name || id;
    labels[`teams.${id}.name`] = `${name} team (name)`;
    labels[`teams.${id}.people`] = `${name} team (people)`;
  }
  return settingsChanges(withTeams(withRequests(before), after) as unknown as Record<string, unknown>, withTeams(withRequests(after), before) as unknown as Record<string, unknown>, labels);
}
