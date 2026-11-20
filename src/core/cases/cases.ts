import { nobodyWhy, resolveContact } from './contact.ts';
import type { EscalationVia } from './contact.ts';
import { addBusinessDays } from '../shared/dates.ts';
import { MODULES, PROCUREMENT, PROCUREMENT_VIA, isContractKey } from '../model/model.ts';
import { chipsOf, listing, listingNotes } from '../checks/finding-states.ts';
import { asksPeople, notLiveWhy } from '../checks/engine.ts';

/** Why nobody is asked when the card names only the field of the problem itself (rule 10: never "Nobody to ask" alone). */
const NO_OTHER_ROLE = 'the card names nobody else to ask';
import { inventoryOf } from './inventory.ts';
import { fixPlaceNotes, fixedInEpo } from './fix-place.ts';
import { TEAM_PREFIX, teamFor, teamVia } from './record-teams.ts';
import type { InventoryRow } from './inventory.ts';
import type { CheckPack, Ci, Finding, FindingState, Module, Parked, References, RunResult } from '../model/model.ts';

/**
 * Cases are not stored. They are worked out from three things that are:
 *   runs    what each loaded report showed (facts),
 *   events  what SACM managers did (notes, status, messages), one journal per person,
 *   replies emails filed in the workspace, matched by the reference in their subject.
 * Nothing here sends, schedules or decides on its own.
 */

/**
 * Where the fix of a finding is made (D123), for a check with `routeBy: "epo"`:
 *   epo   the CI is fed by EPO (Business Service, Service Instance, an offering the EPO integration created): the person
 *         the check asks corrects it in EPO, and ServiceNow receives it from EPO;
 *   ''    the fix is made in ServiceNow, with the request the message names (or the check does not depend on it).
 * 'sacm' is only in runs saved before version 0.17 (the service mapped flag was on); it is read as 'epo'.
 * Runs saved before version 0.8 used 'epo' for "the EPO inventory owner fixes it" (contact EPO_OWNER); the next report replaces them.
 */
export type Route = 'epo' | 'sacm' | '';

/** The contact id of the EPO inventory owner: only a fallback, for a CI from EPO where nobody can be asked. The address is a team setting. */
export const EPO_OWNER = 'epo-inventory-owner';

/** What the message table shows about a CI (the columns of the SACM email template). */
export interface CiContext {
  epoId: string; status: string; supportGroup: string; ownedBy: string; managedBy: string;
  /** Short words shown next to the CI, from its tags (reference/tag-chips), e.g. "to map". Missing in runs saved before version 0.9. */
  chips?: string[];
  /** The tags of the CI, as the report holds them (shown on the lines of a card and in Export this list, never in a message). Missing when it has none, and in runs saved before version 0.20. */
  tags?: string[];
  /** Only for a contract: its number, name and vendor, for the message table. */
  contract?: { number: string; name: string; vendor: string };
}

/** A finding plus who to contact about it, as it was when the report was loaded. */
export interface Fact extends Finding {
  classLabel: string;
  module: Module;
  route: Route;
  contactName: string;
  contactEmail: string;
  /** User ID, else email, lower case. '' when nobody was found. */
  contactId: string;
  contactVia: string;
  cc: string[];
  /**
   * Who gets the escalation: the contact's manager (else department head); for a contact found as Managed by, the owner of
   * the CI (D160; 'owner', 'manager of owner' and 'department head of owner' are in runs saved from version 0.21 on).
   * Missing in runs saved before version 0.8.
   */
  escalateName?: string;
  escalateEmail?: string;
  escalateVia?: EscalationVia;
  /** The CI as the message table shows it. Missing in runs saved before version 0.8. */
  ci?: CiContext;
  /**
   * Why nobody is asked, when `contactName` is '' (rule 10 of the real-data plan, version 0.55): "SACM fixes it", "SACM checks
   * it", "Proposed: not sent to anyone until the card is live" (D346), or "Nobody to ask: " and the reasons ("Managed by is
   * empty; Owned by has no manager in the CI report"). Missing when someone is asked, and in runs saved before version 0.55.
   */
  nobodyWhy?: string;
  /** How the finding is listed (see FindingState). Missing in runs saved before version 0.9: read as 'open' (stateOf). */
  state?: FindingState;
  /** Why it is not open, in words: "Status Ready: not live yet", "Tagged BIA is pending". */
  stateWhy?: string;
}

/** The state of a fact; runs saved before version 0.9 have none, so their facts are open. */
export const stateOf = (fact: Pick<Fact, 'state'>): FindingState => fact.state ?? 'open';

export interface Run {
  /** Date of the report (yyyy-mm-dd). */
  date: string;
  report: string;
  cis: number;
  facts: Fact[];
  tested: string[];
  /** "check:field" → CIs evaluated. Missing in runs saved by version 0.3. */
  evaluated?: Record<string, number>;
  /** Keys of every CI in the report. A case is Verified only for a CI the report contains. Missing in runs saved by version 0.3. */
  ciKeys?: string[];
  notes: string[];
  /** Every CI of the report that is not Retired (see InventoryRow in src/core/cases/inventory.ts): the lifecycle review draws its sample from it. Missing in runs saved before version 0.13. */
  inventory?: InventoryRow[];
  /** The Relationship report the relationship checks used. Missing when there was none, and in runs saved before version 0.10. */
  relationshipReport?: string;
  /** The EPO systems report the EPO checks used. Missing when there was none, and in runs saved before version 0.14. */
  epoReport?: string;
  /** The Solusi contract file and the ServiceNow contract report the contract checks used. Missing when there was none, and in runs saved before version 0.15. */
  solusiReport?: string;
  contractReport?: string;
  /**
   * The parked CIs (D179): their keys, the parked parts of checks and the grey lines of the first screen. Missing in runs saved
   * before version 0.25, and when reference/parked-classes is missing. A parked CI has no case.
   */
  parked?: Parked;
  /** Who loaded the report and when (ISO). Missing in runs saved before version 0.7. */
  loadedBy?: string;
  loadedByName?: string;
  loadedAt?: string;
}

/**
 * 'report': a report was loaded or a load removed. It belongs to no case (no keys); it is kept for the audit trail.
 * 'handover': a manager gave open work to a colleague (`to`, the colleague's name) with a note (`text`).
 * 'person-note': a note of the team about a person contacted (`person`, their contact key); no keys.
 * 'exception': an exception accepted, with `reason`, `reviewOn` and a note in `text`. On cases (`keys`), or,
 *   for a CI not raised yet, standing: no keys, `ciKey`, `ciName` and `checkId` ('*' = every check). See exceptionOf.
 * 'settings': a team setting or the team list was changed; `text` says what. No keys.
 * 'reviewed': SACM reviewed findings a detector listed for a review first (`playbook.askAfterReview`, CRIT-ABOVE-PARENT), or
 *   lines of a fix list SACM cannot fix alone (`playbook.askWhenUnsure`, REL-ONE-TO-ONE): on `keys`. `text` is REVIEWED_ASK
 *   (the owner is asked) or REVIEWED_BACK (back to the review list, or back to the fix list).
 * 'retirement': the planned retirement date the owner gave (`retireOn`, yyyy-mm-dd; '' takes it away), on the keys of a check
 *   with `playbook.retirementDate`. Until that date the finding waits; on the date it is to solve again. `text` is a note.
 * 'review': the lifecycle review. `ref` names the review (data/reviews/). Without `ciKey`: the review was started.
 *   With `ciKey` and `ciName`: a manager compared that CI with EPO; `reason` is the result and `text` the note. No keys.
 * 'stage': the stage of a case of the mapping backlog (D201): `text` is the id of the stage (reference/mapping-backlog). On `keys`.
 * 'no-process': on a case of the mapping backlog, the owner says the Business Process does not exist (D203): `text` is 'yes',
 *   or 'no' when the mark is taken away. On `keys`. The message to Process Management is recorded on the keys of the case
 *   with ':no-process' in place of ':mapping', so it does not change the follow-up of the case.
 * Older versions of the app ignore the types they do not know.
 */
export type EventType = 'note' | 'status' | 'assign' | 'request' | 'message' | 'report' | 'handover' | 'person-note' | 'exception' | 'settings' | 'review' | 'reviewed' | 'retirement' | 'stage' | 'no-process';

/** The texts of a 'reviewed' event: SACM checked the finding and the owner is to be asked, or it goes back to the review list. */
export const REVIEWED_ASK = 'Ask the owner';
export const REVIEWED_BACK = 'Back to review';

/**
 * How a case is listed: the state of its latest fact, except that a finding listed for a review first is to solve
 * once SACM recorded that the owner is to be asked (the last 'reviewed' event of the case says so), and that a finding to
 * solve waits while its planned retirement date (the last 'retirement' event) is after `today`.
 */
export function caseState(fact: Pick<Fact, 'state'>, timeline: CaseEvent[], today = ''): FindingState {
  const state = stateOf(fact);
  if (state === 'open') return today && plannedRetirement(timeline) > today ? 'waiting' : state;
  if (state !== 'review') return state;
  return ownerAsked(timeline) ? 'open' : state;
}

/** The planned retirement date of a case (yyyy-mm-dd): the last 'retirement' event. '' when none was given, or it was taken away. */
export function plannedRetirement(timeline: CaseEvent[]): string {
  const marks = timeline.filter((event) => event.type === 'retirement');
  return marks.length ? marks[marks.length - 1]!.retireOn ?? '' : '';
}

/** True when the last 'reviewed' event of a case says the owner is to be asked (REVIEWED_ASK). */
export function ownerAsked(timeline: CaseEvent[]): boolean {
  const marks = timeline.filter((event) => event.type === 'reviewed');
  return marks.length > 0 && marks[marks.length - 1]!.text === REVIEWED_ASK;
}

export interface CaseEvent {
  id: string;
  /** ISO date and time. */
  at: string;
  by: string;
  byName: string;
  type: EventType;
  keys: string[];
  text?: string;
  /** For 'message': reference, recipients, subject and whether it is a first message or a reminder. */
  ref?: string;
  to?: string;
  cc?: string;
  subject?: string;
  kind?: 'first' | 'reminder' | 'escalation';
  /** teams: a Teams group chat the manager opened from the app and confirmed starting. */
  channel?: 'mailbox' | 'outlook' | 'teams';
  /** For 'person-note': the contact key of the person (user ID, else email, lower case). */
  person?: string;
  /** For 'exception': the reason (one of EXCEPTION_REASONS, src/core/audit/audit.ts) and the review date (yyyy-mm-dd). */
  reason?: string;
  reviewOn?: string;
  /** For 'retirement': the planned retirement date (yyyy-mm-dd), '' when it was taken away. */
  retireOn?: string;
  /** For a standing 'exception' (no keys): the check ('*' = every check) and the CI it is for. */
  checkId?: string;
  ciKey?: string;
  ciName?: string;
}

export interface Reply { ref: string; from: string; received: string; subject: string; text: string; file: string }

/**
 * 'Fixed': a SACM manager corrected it in ServiceNow (fix list); Verified when a later report no longer shows it.
 * 'Not followed up' (written 'Waived' before version 0.12): SACM's own decision to stop following a
 * finding, with a reason and a review date. Not a criticality exception, which the owner requests in the Service Portal and
 * ServiceNow approves. Old 'Waived' statuses are read as not followed up without a review date. The journal event type stays 'exception'.
 */
export const STATUSES = ['New', 'Contacted', 'Answered', 'Fix in progress', 'Fixed', 'Not followed up', 'Verified'] as const;
export type Status = typeof STATUSES[number];
export const EXCEPTION: Status = 'Not followed up';

/** Closed: nothing more to do. Verified by a report, or not followed up. */
export const isClosedStatus = (status: Status): boolean => status === 'Verified' || status === EXCEPTION;

/** Does a standing exception (no keys) cover this finding? Same check (or '*'), and the CI of that name (any asset tag). */
export function standingCovers(event: CaseEvent, checkId: string, ciKey: string): boolean {
  if (event.type !== 'exception' || event.keys.length || !event.ciKey) return false;
  if (event.checkId !== '*' && event.checkId !== checkId) return false;
  return ciKey === event.ciKey || ciKey.startsWith(`${event.ciKey}|`) || ciKey.startsWith(`${event.ciKey}#`);
}

/** Is an exception still running on `today`? Without a review date (old 'Waived'), it runs until a manager ends it. */
export const exceptionRuns = (event: Pick<CaseEvent, 'reviewOn'>, today: string): boolean => !event.reviewOn || event.reviewOn > today;

export interface Case {
  key: string;
  fact: Fact;
  /** How the case is listed, from the latest fact: only 'open' is to solve. */
  state: FindingState;
  status: Status;
  inLatest: boolean;
  /** The latest report could not test the check, so the case stays as it is. */
  untested: boolean;
  /** The latest report does not contain the CI (a partial report), so the case stays as it is. */
  ciMissing: boolean;
  firstSeen: string;
  verifiedOn: string;
  assignedTo: string;
  /** The handover that gave the case to `assignedTo`, when it was a handover (it carries the note). */
  handover: CaseEvent | null;
  request: string;
  messages: CaseEvent[];
  replies: Reply[];
  lastMessageOn: string;
  /** The last message waits in the outbox: the sending flow has not sent it (D162). No reminder is due while it waits. */
  queued: boolean;
  /** The day the last message really left (yyyy-mm-dd): the days to the reminder count from here (D162). '' when queued or never contacted. */
  sentOn: string;
  reminderDue: boolean;
  overLimit: boolean;
  timeline: CaseEvent[];
  /** The exception that closes the case, or null. */
  exception: CaseEvent | null;
  /** The review date of an exception that has ended, when nothing was set after it: the case is to solve again. */
  exceptionEnded: string;
  /** The planned retirement date the owner gave (yyyy-mm-dd), '' when none. While it is after today, the case waits. */
  retireOn: string;
}

export interface Rules { reminderDays: number; maxReminders: number }

/**
 * What is known about the messages handed to the shared mailbox, by the name of their outbox file (D162): `queued` are
 * the files that still wait in the outbox, `sentOn` the day (yyyy-mm-dd) a file reached sent/. Worked out when the app
 * reads the folder; nothing of it is saved. Without it every message counts as sent when it was recorded.
 */
export interface Delivery { queued: Set<string>; sentOn: Map<string, string> }

const nameOf = (person: Ci['roles']['owned_by']): string =>
  person && (person.name || person.email) ? `${person.name || person.email}${person.active === false ? ' (inactive)' : ''}` : '';
const contextOf = (ci: Ci, references: References, extra: string[] = []): CiContext => {
  const chips = chipsOf(ci, references).concat(extra.filter((chip) => chipsOf(ci, references).indexOf(chip) < 0));
  return {
    epoId: ci.assetTag, status: ci.operationalStatus, supportGroup: ci.supportGroup,
    ownedBy: nameOf(ci.roles.owned_by), managedBy: nameOf(ci.roles.managed_by), ...(chips.length ? { chips } : {}), ...(ci.tags.length ? { tags: ci.tags.slice() } : {}), ...(ci.contract ? { contract: ci.contract } : {})
  };
};

const moduleOf = (pack: CheckPack | undefined): Module =>
  (pack && (MODULES as readonly string[]).indexOf(pack.dimension) >= 0 ? pack.dimension : 'correctness') as Module;

/** Turns the result of the engine into a run that can be saved. `references` gives the classes EPO feeds. */
export function buildRun(cis: Ci[], result: RunResult, packs: CheckPack[], date: string, report: string, references: References = {}): Run {
  const ciByKey = new Map<string, Ci>();
  for (const ci of cis) ciByKey.set(ci.key, ci);
  // Contracts (and other records that are not CIs) that findings are about: never counted as CIs of the report.
  for (const subject of result.subjects ?? []) if (!ciByKey.has(subject.key)) ciByKey.set(subject.key, subject);
  const packById = new Map<string, CheckPack>();
  for (const pack of packs) packById.set(pack.id, pack);
  const notes = result.notes.map((note) => `${note.checkId}: ${note.note}`);

  const facts = result.findings.map((finding): Fact => {
    const ci = ciByKey.get(finding.ciKey)!;
    const pack = packById.get(finding.checkId);
    // A detector can say the fix is made in ServiceNow whatever the class (a Service Instance without a Business Application, D139).
    const route: Route = pack && pack.playbook.routeBy === 'epo' && !finding.inServiceNow && fixedInEpo(ci, references, finding.checkId, finding.field) ? 'epo' : '';
    const listed = listing(ci, pack, references, finding.review ?? '', finding.wait ?? '');
    const base = {
      ...finding, detail: finding.detail.charAt(0).toUpperCase() + finding.detail.slice(1), classLabel: ci.sourceClass || finding.className,
      module: moduleOf(pack), route, ci: contextOf(ci, references, finding.chips), state: listed.state, ...(listed.why ? { stateWhy: listed.why } : {})
    };
    const audience = pack ? pack.playbook.audience : [];
    // A card SACM fixes or checks itself says so, live or not (D355).
    const sacmWhy = audience.indexOf('sacm') >= 0 ? (pack?.reviewOnly ? 'SACM checks it' : 'SACM fixes it') : '';
    // Only a live check asks people (D346): the lines of a proposed one are listed, and nobody is asked about them.
    if (pack && !asksPeople(pack)) return { ...base, contactName: '', contactEmail: '', contactId: '', contactVia: '', cc: [], escalateName: '', escalateEmail: '', nobodyWhy: sacmWhy || notLiveWhy(pack) };
    // Problems in Solusi itself go to the Procurement mailbox of the team settings; the people of the contract are never copied.
    if (audience.indexOf('procurement') >= 0) return { ...base, contactName: 'Procurement', contactEmail: '', contactId: PROCUREMENT, contactVia: PROCUREMENT_VIA, cc: [] };
    // A problem on the record of a class a team is responsible for (a Business Process: Process Management) goes to the team,
    // never to the people of the CI, and nobody is copied (D195). The people of the team are a team setting.
    const team = pack && audience.indexOf('sacm') < 0 ? teamFor(ci, pack.id, references) : null;
    if (team) return { ...base, route: '' as Route, contactName: team.name, contactEmail: '', contactId: `${TEAM_PREFIX}${team.id}`, contactVia: teamVia(team), cc: [] };
    // A detector can name another CI whose people are asked (Offering owner: its Business Service); else this CI's.
    const other = finding.contactCi ? ciByKey.get(finding.contactCi) : undefined;
    const theirs = other ? resolveContact(other, '', audience) : null;
    const contact = theirs && theirs.to
      ? { to: { ...theirs.to, via: `${theirs.to.via} of ${other!.sourceClass || 'Business Service'} ${other!.name}` }, cc: theirs.cc }
      : resolveContact(ci, finding.field, audience);
    // From EPO and nobody to ask: the EPO inventory owner of the team settings is the fallback.
    if (route && !contact.to) return { ...base, contactName: 'EPO inventory owner', contactEmail: '', contactId: EPO_OWNER, contactVia: 'inventory owner of EPO', cc: [] };
    // Nobody: the reason, so a line never says only "Nobody to ask" (rule 10).
    const why = contact.to ? '' : sacmWhy || `Nobody to ask: ${nobodyWhy(ci, finding.field, audience) || NO_OTHER_ROLE}`;
    return {
      ...base, ...(why ? { nobodyWhy: why } : {}),
      contactName: contact.to ? contact.to.name : '', contactEmail: contact.to ? contact.to.email : '', contactId: contact.to ? contact.to.id : '',
      contactVia: contact.to ? contact.to.via : '', cc: contact.cc.map((person) => person.email),
      escalateName: contact.to?.above?.name ?? '', escalateEmail: contact.to?.above?.email ?? '', ...(contact.to?.above ? { escalateVia: contact.to.above.via } : {})
    };
  });
  notes.push(...fixPlaceNotes(cis, references));
  notes.push(...listingNotes(references));
  const inventory = inventoryOf(cis, references);
  return {
    date, report, cis: cis.length, facts, tested: result.tested, evaluated: result.evaluated, ciKeys: cis.map((ci) => ci.key), notes,
    ...(inventory ? { inventory } : {}), ...(result.parked ? { parked: result.parked } : {})
  };
}

/**
 * The CIs a run really checked (D179): every CI of the report, without the parked ones. A finding on a CI it did not check
 * is not solved when it is gone, and a parked part of a check is never "solved" either. Null when the run does not say.
 */
export function checkedIn(run: Pick<Run, 'ciKeys' | 'parked'>): { has: (finding: Pick<Fact, 'ciKey' | 'checkId' | 'field'>) => boolean } | null {
  if (!run.ciKeys) return null;
  const cis = new Set(run.ciKeys);
  const parked = new Set(run.parked?.keys ?? []);
  const fields = new Set(run.parked?.fields ?? []);
  return { has: (finding) => cis.has(finding.ciKey) && !parked.has(finding.ciKey) && !fields.has(`${finding.checkId}:${finding.field}`) };
}

/** What a case is assigned to: the last "assign" or "handover" event. A handover names the colleague in `to` and the note in `text`. */
export function assignmentOf(timeline: CaseEvent[]): { to: string; handover: CaseEvent | null } {
  for (let index = timeline.length - 1; index >= 0; index -= 1) {
    const event = timeline[index]!;
    if (event.type === 'assign') return { to: event.text ?? '', handover: null };
    if (event.type === 'handover') return { to: event.to ?? '', handover: event };
  }
  return { to: '', handover: null };
}

/**
 * What older runs showed, kept in data/state.json once those runs are archived (see src/core/memory/memory.ts):
 * the date each finding was first seen, and the last fact of each finding that still matters.
 */
export interface Past { firstSeen: Record<string, string>; facts: Record<string, Fact> }

export function buildCases(runs: Run[], events: CaseEvent[], replies: Reply[], today: string, rules: Rules, past?: Past, delivery?: Delivery): Case[] {
  const ordered = runs.slice().sort((a, b) => a.date.localeCompare(b.date) || a.report.localeCompare(b.report));
  const latest = ordered[ordered.length - 1];
  if (!latest) return [];
  const sortedEvents = events.slice().sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));

  const firstSeen = new Map<string, string>();
  const lastFact = new Map<string, Fact>();
  if (past) {
    for (const key of Object.keys(past.firstSeen)) firstSeen.set(key, past.firstSeen[key]!);
    for (const key of Object.keys(past.facts)) lastFact.set(key, past.facts[key]!);
  }
  for (const run of ordered) {
    for (const fact of run.facts) {
      if (!firstSeen.has(fact.key)) firstSeen.set(fact.key, run.date);
      lastFact.set(fact.key, fact);
    }
  }
  const current = new Set(latest.facts.map((fact) => fact.key));
  const latestCis = latest.ciKeys ? new Set(latest.ciKeys) : null;
  // A CI the latest report parks (D179) has no line on any card, also not from an earlier report.
  const parkedCis = new Set(latest.parked?.keys ?? []);
  const parkedFields = new Set(latest.parked?.fields ?? []);
  const eventsByKey = new Map<string, CaseEvent[]>();
  const standing: CaseEvent[] = [];
  for (const event of sortedEvents) {
    for (const key of event.keys) eventsByKey.set(key, (eventsByKey.get(key) ?? []).concat([event]));
    if (event.type === 'exception' && !event.keys.length && event.ciKey) standing.push(event);
  }
  const repliesByRef = new Map<string, Reply[]>();
  for (const reply of replies) repliesByRef.set(reply.ref, (repliesByRef.get(reply.ref) ?? []).concat([reply]));

  const cases: Case[] = [];
  lastFact.forEach((fact, key) => {
    if (parkedCis.has(fact.ciKey) || parkedFields.has(`${fact.checkId}:${fact.field}`)) return;
    const own = eventsByKey.get(key) ?? [];
    const covering = standing.filter((event) => standingCovers(event, fact.checkId, fact.ciKey));
    const timeline = covering.length ? own.concat(covering).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)) : own;
    const inLatest = current.has(key);
    const untested = !inLatest && latest.tested.indexOf(`${fact.checkId}:${fact.field}`) < 0;
    // A contract is not in the CI report. The contract files are complete lists, so a contract that is gone from a tested check is solved.
    const ciMissing = !inLatest && !!latestCis && !latestCis.has(fact.ciKey) && !isContractKey(fact.ciKey);
    // A finding nobody worked on that is gone needs no case.
    if (!inLatest && !untested && !ciMissing && timeline.length === 0) return;

    const messages = timeline.filter((event) => event.type === 'message');
    const lastMessage = messages[messages.length - 1];
    const caseReplies: Reply[] = [];
    for (const message of messages) {
      for (const reply of repliesByRef.get(message.ref ?? '') ?? []) {
        if (caseReplies.indexOf(reply) < 0) caseReplies.push(reply);
      }
    }
    caseReplies.sort((a, b) => a.received.localeCompare(b.received));
    const statusEvents = timeline.filter((event) => event.type === 'status' || event.type === 'exception');
    const manual = statusEvents[statusEvents.length - 1];
    const lastOf = (type: EventType): string => {
      const found = timeline.filter((event) => event.type === type);
      return found.length ? (found[found.length - 1]!.text ?? '') : '';
    };

    let status: Status = 'New';
    if (lastMessage) status = 'Contacted';
    if (lastMessage && caseReplies.some((reply) => reply.received >= lastMessage.at)) status = 'Answered';
    // An exception (or an old 'Waived') stands until a manager sets another status, or its review date comes.
    let exception: CaseEvent | null = null;
    let exceptionEnded = '';
    if (manual && manual.type === 'exception') {
      if (exceptionRuns(manual, today)) { exception = manual; status = EXCEPTION; } else exceptionEnded = manual.reviewOn ?? '';
    } else if (manual && (manual.text === 'Waived' || manual.text === 'Exception accepted' || manual.text === EXCEPTION)) {
      exception = manual; status = EXCEPTION;
    } else if (manual && (!lastMessage || manual.at > lastMessage.at)) {
      // A status a manager set stands until a later message is sent.
      status = manual.text as Status;
    }
    // Verified only when the latest report contains the CI, could test the check, and no longer shows the problem.
    const gone = !inLatest && !untested && !ciMissing;
    if (gone && status !== EXCEPTION) status = 'Verified';

    const lastMessageOn = lastMessage ? lastMessage.at.slice(0, 10) : '';
    // A message handed to the shared mailbox counts from the day it was really sent; while it waits in the outbox, nothing is due.
    const file = lastMessage && lastMessage.channel === 'mailbox' ? lastMessage.text ?? '' : '';
    const queued = !!file && !!delivery && delivery.queued.has(file);
    const left = file && delivery ? delivery.sentOn.get(file) ?? '' : '';
    const sentOn = queued ? '' : left > lastMessageOn ? left : lastMessageOn;
    const waited = !queued && !!sentOn && addBusinessDays(sentOn, rules.reminderDays) <= today;
    const assignment = assignmentOf(timeline);
    const state = caseState(fact, timeline, today);
    // A case that waits for its planned retirement date gets no reminder until then.
    const due = !(state === 'waiting' && stateOf(fact) === 'open');
    cases.push({
      key, fact, state, status, inLatest, untested, ciMissing,
      firstSeen: firstSeen.get(key) ?? latest.date,
      verifiedOn: gone ? latest.date : '',
      assignedTo: assignment.to, handover: assignment.handover, request: lastOf('request'),
      messages, replies: caseReplies, lastMessageOn, queued: queued && status === 'Contacted', sentOn,
      reminderDue: due && status === 'Contacted' && messages.length <= rules.maxReminders && waited,
      overLimit: due && status === 'Contacted' && messages.length > rules.maxReminders && waited,
      timeline, exception, exceptionEnded, retireOn: plannedRetirement(timeline)
    });
  });
  return cases;
}

/**
 * A shared case: the cases of one check that go to the same contact by the same route. Many CIs with one cause
 * become one line in the queue and one piece of work (for example 237 capabilities without an owner).
 * Groups are worked out, never stored: what a manager does is recorded on every case of the group.
 */
export interface CaseGroup {
  key: string;
  checkId: string;
  state: FindingState;
  module: Module;
  route: Route;
  members: Case[];
  /** Members that are not Verified and have no exception accepted. */
  open: Case[];
  /** Distinct CIs. */
  ciCount: number;
  status: Status;
  reminderDue: boolean;
  overLimit: boolean;
  lastMessageOn: string;
  assignedTo: string;
  replies: number;
}

const closed = (item: Case): boolean => isClosedStatus(item.status);

export function groupCases(cases: Case[]): CaseGroup[] {
  const byKey = new Map<string, Case[]>();
  for (const item of cases) {
    const fact = item.fact;
    // Waiting, known and review items are never mixed with the cases to solve: another state, another group.
    const key = [fact.checkId, fact.route || '', fact.contactId || fact.contactEmail.toLowerCase() || 'nobody'].join('|') + (item.state === 'open' ? '' : `|${item.state}`);
    byKey.set(key, (byKey.get(key) ?? []).concat([item]));
  }
  const groups: CaseGroup[] = [];
  byKey.forEach((members, key) => {
    const open = members.filter((item) => !closed(item));
    // The group is as far as its least advanced open member; when all are closed, Verified wins over an exception.
    const pool = open.length ? open : members;
    let status: Status = pool[0]!.status;
    for (const item of pool) if (STATUSES.indexOf(item.status) < STATUSES.indexOf(status)) status = item.status;
    if (!open.length) status = members.some((item) => item.status === 'Verified') ? 'Verified' : EXCEPTION;
    const assigned = Array.from(new Set(pool.map((item) => item.assignedTo)));
    const first = members[0]!;
    groups.push({
      key, checkId: first.fact.checkId, state: first.state, module: first.fact.module ?? 'correctness', route: first.fact.route ?? '', members, open,
      ciCount: new Set(members.map((item) => item.fact.ciKey)).size, status,
      reminderDue: open.some((item) => item.reminderDue), overLimit: open.some((item) => item.overLimit),
      lastMessageOn: members.map((item) => item.lastMessageOn).sort().pop() ?? '',
      assignedTo: assigned.length === 1 ? assigned[0]! : 'Several',
      replies: new Set(([] as Reply[]).concat(...members.map((item) => item.replies))).size
    });
  });
  return groups.sort((a, b) => MODULES.indexOf(a.module) - MODULES.indexOf(b.module) || b.ciCount - a.ciCount || a.key.localeCompare(b.key));
}

/** A check of daily work (D182): every check whose `priority` is not "later". */
export const isDaily = (pack: Pick<CheckPack, 'priority'> | undefined): boolean => pack?.priority !== 'later';

/**
 * Score per module in one run: the share of evaluated CI checks with nothing to solve, 0–100. Waiting, known and review
 * items do not count, and neither do the checks to clarify when there is time (D182). Null when nothing was evaluated.
 */
export function moduleScores(run: Run, packs: CheckPack[]): Record<Module, { score: number | null; tests: number; problems: number }> {
  const packById = new Map<string, CheckPack>();
  for (const pack of packs) packById.set(pack.id, pack);
  const scores = {} as Record<Module, { score: number | null; tests: number; problems: number }>;
  for (const module of MODULES) scores[module] = { score: null, tests: 0, problems: 0 };
  for (const tested of Object.keys(run.evaluated ?? {})) {
    const pack = packById.get(tested.split(':')[0]!);
    if (isDaily(pack)) scores[moduleOf(pack)].tests += run.evaluated![tested]!;
  }
  for (const fact of run.facts) if (stateOf(fact) === 'open' && isDaily(packById.get(fact.checkId))) scores[fact.module ?? moduleOf(packById.get(fact.checkId))].problems += 1;
  for (const module of MODULES) {
    const entry = scores[module];
    if (entry.tests > 0) entry.score = Math.max(0, Math.round(100 * (entry.tests - entry.problems) / entry.tests));
  }
  return scores;
}
