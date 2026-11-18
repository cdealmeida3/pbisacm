import { buildCases, groupCases } from '../../core/cases/cases.ts';
import { checksInUse } from '../../core/checks/engine.ts';
import { REVIEW_CHECK, withReviewFacts } from '../../core/audit/lifecycle-review.ts';
import { EXCEPTION_MONTHS } from '../../core/audit/audit.ts';
import { content } from './content.ts';
import { peopleIndex } from '../view/people.ts';
import type { Review } from '../../core/audit/lifecycle-review.ts';
import type { EpoRun } from '../../core/sources/epo/epo-report.ts';
import type { ContractRun, SolusiRun } from '../../core/sources/contracts/contract-reports.ts';
import type { RelationshipRun } from '../../core/sources/relationships/relationship-report.ts';
import type { MemoryState } from '../../core/memory/memory.ts';
import type { Case, CaseEvent, CaseGroup, Reply } from '../../core/cases/cases.ts';
import type { RequestLink } from '../../core/messages/messages.ts';
import type { TeamPeople } from '../../core/cases/record-teams.ts';
import type { TeamMember } from '../../core/team/team.ts';
import type { AppRun, CiPeople } from '../view/people.ts';
import type { Workspace } from '../platform/workspace.ts';

/**
 * The state of the app: one object the screens read, and the few helpers every action uses (changed, update, toast,
 * rebuild). Nothing runs by itself: each action (the other files of src/app/state/) is called by a button.
 * Shared memory lives in the workspace folder (runs, one journal per person, replies); cases are derived again after each change.
 */

/** `requests`: name and link of each Service Portal request the messages name (REQUESTS in src/core/messages/messages.ts). The links live only in the team folder. */
/** Days before Ready is too long, at first (180 before version 0.20). */
export const READY_DAYS = 90;

/**
 * The team settings as data/settings.json holds them, with what is missing from the start values. A file saved before
 * version 0.20 (it has no Procurement lead) holds the old first value of Ready too long, 180 days: it is read as 90 (D149).
 */
export function readSettings(saved: Partial<Settings>, start: Settings): Settings {
  const old = saved.procurementLeadEmail === undefined && saved.readyDays === 180;
  // A file saved before version 0.27 has no teams.
  const read: Settings = { ...start, ...saved, requests: { ...(saved.requests ?? {}) }, teams: { ...(saved.teams ?? {}) }, ...(old ? { readyDays: READY_DAYS } : {}) };
  // A number that is empty, not whole or out of its range is not used: the first value is (F11). Settings says so.
  for (const key of NUMBER_KEYS) if (settingNumber(key, read[key]) === null) read[key] = DEFAULT_SETTINGS[key];
  return read;
}

/** The team settings that are numbers. */
export type NumberSetting = 'reminderDays' | 'maxReminders' | 'staleDays' | 'exceptionMonths' | 'underRetirementDays' | 'readyDays';
/** The range of each number of the team settings (whole numbers only). */
export const NUMBER_RANGES: Record<NumberSetting, { min: number; max: number }> = {
  reminderDays: { min: 1, max: 30 }, maxReminders: { min: 0, max: 10 }, staleDays: { min: 1, max: 60 },
  exceptionMonths: { min: 1, max: 36 }, underRetirementDays: { min: 1, max: 730 }, readyDays: { min: 1, max: 730 }
};
const NUMBER_KEYS = Object.keys(NUMBER_RANGES) as NumberSetting[];

/** The number a setting field holds, or null when it is empty, not a whole number or outside its range. */
export function settingNumber(key: NumberSetting, value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^-?\d+$/.test(text)) return null;
  const number = Number(text);
  const range = NUMBER_RANGES[key];
  return number >= range.min && number <= range.max ? number : null;
}

/** "A whole number from 1 to 30.": what a number field accepts. */
export const rangeText = (key: NumberSetting): string => `A whole number from ${NUMBER_RANGES[key].min} to ${NUMBER_RANGES[key].max}.`;

/** The numbers of a saved settings file that cannot be used (the first value is used instead). */
export const unusableSettings = (saved: Partial<Settings>): NumberSetting[] =>
  NUMBER_KEYS.filter((key) => saved[key] !== undefined && settingNumber(key, saved[key]) === null);

export interface Settings { portalLink: string; signature: string; reminderDays: number; maxReminders: number; epoOwnerName: string; epoOwnerEmail: string; /** The Procurement mailbox: gets the message For Procurement (version 0.16). */ procurementName: string; procurementEmail: string; /** The Procurement lead: gets the escalation of the message For Procurement (version 0.20). */ procurementLeadName: string; procurementLeadEmail: string; staleDays: number; requests: Record<string, RequestLink>; /** The people of each team of reference/record-teams, by team id: Process Management (version 0.27, D195). */ teams: Record<string, TeamPeople>; /** Months until the review date of an exception (version 0.12). */ exceptionMonths: number; /** Days before a CI counts as Under retirement, or in Ready, for too long (version 0.13). */ underRetirementDays: number; readyDays: number; /** The address of the ServiceNow of the team: each line of a SACM list opens its record there (version 0.33, D244). '' when not set. */ serviceNowAddress: string }

/** A message that waits in the outbox, as its file says it: `file` is its name, `at` when it was queued (UTC). */
export interface OutboxMessage { file: string; to: string; subject: string; by: string; at: string }
/** A message that waits in the outbox longer than this is "queued", not "contacted" (D162). */
export const QUEUED_AFTER_MS = 3600000;
/** The outbox files that have waited more than an hour. */
export const queuedFiles = (): Set<string> => new Set(state.outbox.filter((message) => Date.now() - Date.parse(`${message.at.slice(0, 19)}Z`) > QUEUED_AFTER_MS).map((message) => message.file));

/** folder: the team folder (shared memory). files: report files only, nothing is saved. demo: invented data. */
export type Mode = 'folder' | 'files' | 'demo';
export const FILES_LABEL = 'Report files only (nothing is saved)';
export interface User { name: string; email: string }
/** `subject`: every card, or only the cards of one subject: the folder of their check file (version 0.23; `TOPICS` in view/cards.ts). */
export type SubjectFilter = 'all' | 'ci' | 'relationship' | 'epo' | 'contract' | 'lifecycle';
/**
 * `escalations`: only the cards and groups whose reminders got no answer (version 0.21). `fresh`: only the cards with
 * findings new since the report before (the filter New, version 0.30).
 */
export interface Filters { onlyRed: boolean; mine: boolean; due: boolean; escalations: boolean; fresh: boolean; search: string; subject: SubjectFilter }
/** How the first page shows the cards: as cards, or one line each (version 0.30, D217). */
export type CardsAs = 'cards' | 'lines';
/** The screens besides the overview (version 0.11): My work, Activity, the page of one person contacted, and the mapping backlog (version 0.28). */
export type View = 'overview' | 'mywork' | 'activity' | 'person' | 'audit' | 'contracts' | 'backlog';
/** The parts of the Audit page (version 0.12). */
export type AuditTab = 'verification' | 'export' | 'exceptions' | 'lifecycle';

/** The team settings of a new team folder. */
export const DEFAULT_SETTINGS: Settings = { portalLink: '', signature: 'SACM team', reminderDays: 3, maxReminders: 2, epoOwnerName: '', epoOwnerEmail: '', procurementName: 'Procurement', procurementEmail: '', procurementLeadName: '', procurementLeadEmail: '', staleDays: 3, requests: {}, teams: {}, exceptionMonths: EXCEPTION_MONTHS, underRetirementDays: 90, readyDays: READY_DAYS, serviceNowAddress: '' };

export const state = {
  workspace: null as Workspace | null,
  mode: 'folder' as Mode,
  user: { name: '', email: '' } as User,
  settings: { ...DEFAULT_SETTINGS, requests: {} } as Settings,
  /** Numbers of data/settings.json that could not be used: Settings says so (F11). */
  unusableSettings: [] as NumberSetting[],
  /** The summary of the archived part of the memory (data/state.json), or null before the first one is written. */
  memory: null as MemoryState<CiPeople> | null,
  /** The runs as the screens use them: the saved runs plus the cases the lifecycle review opened (see rebuild). */
  runs: [] as AppRun[],
  /** The runs as saved in the folder. */
  savedRuns: [] as AppRun[],
  /** The lifecycle reviews of data/reviews/, oldest first. */
  reviews: [] as Review[],
  /** The newest loaded Relationship report, or null. */
  relationship: null as RelationshipRun | null,
  /** The newest loaded EPO systems report, or null (version 0.14), and the date of the one loaded before it ('' when none). */
  epo: null as EpoRun | null,
  epoPrevious: '',
  /** The newest loaded Solusi contract file and ServiceNow contract report, or null (version 0.15). */
  solusi: null as SolusiRun | null,
  contracts: null as ContractRun | null,
  /** The Solusi contract file loaded before the newest one, or null: the page Contract changes compares the two (version 0.16). */
  solusiPrevious: null as SolusiRun | null,
  /** What the last load said, shown under the Reports strip until closed. */
  loadMessages: [] as string[],
  /** The message of the last load shows by itself (a file was not loaded); else only with the tiles (version 0.30). */
  loadNeedsLook: false,
  /** The manager pressed Show (true) or Hide (false) on the Reports line; null: it opens by itself when a report needs a look. */
  reportsShown: null as boolean | null,
  events: [] as CaseEvent[],
  replies: [] as Reply[],
  sent: new Set<string>(),
  /** The day each file of sent/ arrived there (local, yyyy-mm-dd), by file name: the days to a reminder count from it (D162). */
  sentOn: new Map<string, string>(),
  /** The messages that wait in the outbox: handed to the shared mailbox and not in sent/ yet. Read on Refresh and after every Send. */
  outbox: [] as OutboxMessage[],
  /** A button inside the message at the bottom of the screen ("read them"), or null. */
  toastAction: null as { label: string; run: () => void } | null,
  cases: [] as Case[],
  groups: [] as CaseGroup[],
  people: new Map<string, CiPeople>(),
  filters: { onlyRed: false, mine: false, due: false, escalations: false, fresh: false, search: '', subject: 'all' } as Filters,
  /** Kept on this computer (D217): the cards as cards or lines, and My day folded into one line. Never in the team folder. */
  cardsAs: 'cards' as CardsAs,
  myDayFolded: false,
  /** The check whose card is open, and the CI whose case panel is open. */
  openCard: '',
  openCi: '',
  toast: '',
  askUser: false,
  /** Settings is asked for from a screen (the link "Settings" on a card). The shell opens it and takes the mark away. */
  openSettings: false,
  /** The SACM managers of the team list (data/team.json). */
  team: [] as TeamMember[],
  /** When the folder was last read (local time, yyyy-mm-ddThh:mm). */
  readAt: '',
  /** What colleagues did since this manager's last visit, shown once at the start. */
  since: null as { at: string; lines: string[] } | null,
  /** What the app tidied in the folder (conflict copies), until closed. */
  folderNotes: [] as string[],
  view: 'overview' as View,
  /** The contact key of the person whose page is open. */
  openPerson: '',
  /** The screen to go back to from a person's page. */
  backTo: 'overview' as View,
  auditTab: 'verification' as AuditTab,
  /** The run file whose verification record is shown ('' = the latest). */
  auditRun: ''
};

let version = 0;
const listeners = new Set<() => void>();
export function changed(): void { version += 1; listeners.forEach((listener) => listener()); }
/** For useStore (use-store.ts): a screen listens, and re-renders when the version moves. */
export const subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export const storeVersion = (): number => version;

export function update(values: Partial<typeof state>): void { Object.assign(state, values); changed(); }
export function setFilters(values: Partial<Filters>): void { state.filters = { ...state.filters, ...values }; changed(); }

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string, action: { label: string; run: () => void } | null = null): void {
  state.toast = message;
  state.toastAction = action;
  changed();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = ''; state.toastAction = null; changed(); }, action ? 12000 : 6000);
}

export const today = (): string => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const nowStamp = (): string => new Date().toISOString().slice(0, 19);

export function newRef(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `SACM-${Array.from(bytes).map((byte) => alphabet[byte % alphabet.length]).join('')}`;
}

export const latestRun = (): AppRun | undefined => state.runs.slice().sort((a, b) => a.date.localeCompare(b.date))[state.runs.length - 1];

/**
 * "10:42" (today), "12 Nov 10:42" or, for another year, "12 Nov 2025 10:42": a journal time (UTC) in the local time of this computer. Every time on the screen
 * goes through here; the files keep UTC. `withYear`: always the date with its year ("12 Nov 2026 10:42"), for the Audit page.
 */
export function localTime(at: string, withYear = false): string {
  if (!at) return '';
  const date = new Date(`${at.slice(0, 19)}Z`);
  if (Number.isNaN(date.getTime())) return at;
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (withYear) return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} ${time}`;
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return time;
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}) })} ${time}`;
}

/** "12 Nov" (or "12 Nov 2026"): the local day of a journal time (UTC). */
export function localDay(at: string, withYear = false): string {
  const date = new Date(`${at.slice(0, 19)}Z`);
  if (!at || Number.isNaN(date.getTime())) return at;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear || date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {}) });
}

export function rebuild(): void {
  const memory = state.memory;
  // "Not the same" in a lifecycle review opens a case: worked out again each time, never saved in the run files.
  state.runs = withReviewFacts(state.savedRuns, state.reviews, state.events, content.packs.filter((pack) => pack.id === REVIEW_CHECK)[0], content.references);
  // Cases of a check that is switched off or removed (REL-RETIRED, EPO-DESCRIPTION in 0.19) are not shown: the check has no card.
  const inUse = new Set(checksInUse(content.packs).map((pack) => pack.id));
  state.cases = buildCases(state.runs, state.events, state.replies, today(), state.settings, memory ?? undefined, { queued: queuedFiles(), sentOn: state.sentOn }).filter((item) => inUse.has(item.fact.checkId));
  state.groups = groupCases(state.cases);
  state.people = peopleIndex(state.runs);
  if (memory) for (const ci of Object.keys(memory.people)) if (!state.people.has(ci)) state.people.set(ci, memory.people[ci]!);
  changed();
}
