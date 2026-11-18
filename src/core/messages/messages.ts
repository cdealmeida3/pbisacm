import { escapeHtml } from '../shared/text.ts';
import { longDate } from '../shared/dates.ts';
import { EPO_OWNER } from '../cases/cases.ts';
import { PROCUREMENT, PROCUREMENT_VIA } from '../model/model.ts';
import { isTeam, teamAddresses, teamIdOf } from '../cases/record-teams.ts';
import type { TeamPeople } from '../cases/record-teams.ts';
import type { Case, Fact } from '../cases/cases.ts';
import type { CheckPack, MessageTexts } from '../model/model.ts';

/**
 * The messages to the people the checks ask, in the style of the SACM email templates (instruction, appendix 8.1):
 * the problem first in the subject, "Hi <first name>,", why they get it, a table of the CIs, the exact request to raise,
 * one line on why it matters, and the name of the SACM manager. Building a message sends nothing.
 */

export type DraftKind = 'first' | 'reminder' | 'escalation';

/** A message a SACM manager can review, change and then send. */
export interface Draft {
  ref: string;
  to: string;
  cc: string;
  subject: string;
  /** HTML. Every value from a report is escaped. */
  body: string;
  /** The same message as plain text, for the "open in Outlook" route and the clipboard. */
  plain: string;
  kind: DraftKind;
  checkIds: string[];
  keys: string[];
  /** Distinct CIs in this message. */
  ciCount: number;
  /** A long message is split: part `index` of `count` (both 1 when it is not split). */
  part: { index: number; count: number };
  /** For an escalation: the person who did not answer. */
  about?: string;
  /** An escalation for which nobody is known (D160): `to` is empty, and the manager types who gets it. */
  nobodyAbove?: boolean;
  /**
   * The keys of the second part of a reminder, "New since then" (D161): open points of the same person that were never
   * asked. They are recorded as a first message, with the same reference. Empty for every other message.
   */
  newKeys: string[];
  /** The message goes to a mailbox of the team settings (For Procurement): nobody is copied. */
  mailbox?: boolean;
  /** The message goes to the people of a team of the settings (Process Management, D195): nobody is copied. */
  team?: boolean;
}

/**
 * The requests of the Service Portal the messages name, as the portal category lists them (page of 11 Nov 2026).
 * `action`: the request is one action inside a form ("Modify service offering" in "Add or modify a Service (CI)").
 * `was`: the name before version 0.14.1; a saved setting that still holds it gets the new name.
 * There is no request to change Supported by: its messages ask for a reply only (`askNoRequest`).
 * The links are team settings, never in the code.
 */
export const REQUESTS: ReadonlyArray<{ id: string; name: string; action?: string; was?: string }> = [
  { id: 'owned-by-update', name: 'Owned by - update' },
  { id: 'managed-by-update', name: 'Managed by – update', was: 'Managed by - update' },
  { id: 'support-group-update', name: 'Support group update' },
  { id: 'modify-service-offering', name: 'Add or modify a Service (CI)', action: 'Modify service offering', was: 'Modify service offering' },
  { id: 'criticality', name: 'Criticality - change CIAA values' },
  { id: 'service-mapping', name: 'Service Mapping' }
];

/** The name of a request: the one saved in Settings, unless it is empty or still the old default. */
export function requestName(id: string, saved?: string): string {
  const known = REQUESTS.filter((request) => request.id === id)[0];
  const name = (saved ?? '').trim();
  if (!known) return name || id;
  return !name || name === known.was ? known.name : name;
}

export interface RequestLink { name: string; link: string }

/**
 * `senderName`: the SACM manager who writes (from "Who is working"); `signature`: the team line under it.
 * `epoOwnerName` / `epoOwnerEmail`: the inventory owner of EPO, only for a CI from EPO where nobody can be asked.
 * `requests`: name and link of each request of REQUESTS, by id. `portalLink`: the Service Portal, when a request has no link.
 */
export interface MessageSettings {
  portalLink: string;
  signature: string;
  senderName?: string;
  epoOwnerName?: string;
  epoOwnerEmail?: string;
  /** The Procurement mailbox: gets the problems in Solusi itself (card For Procurement). */
  procurementName?: string;
  procurementEmail?: string;
  /** The Procurement lead: gets the escalation when the Procurement mailbox did not answer the reminders (version 0.20). Empty: no escalation. */
  procurementLeadName?: string;
  procurementLeadEmail?: string;
  requests?: Record<string, RequestLink>;
  /** The people of each team of reference/record-teams, by team id (version 0.27): they get the lines of the team (D195). */
  teams?: Record<string, TeamPeople>;
  /** Where the text goes: an email (the default) or a Teams chat. Only the token {reply} reads it (D163). */
  channel?: 'email' | 'chat';
}

/** What a draft can be told on top of the cases (the Email the group dialog). */
export interface DraftOptions {
  /** Who gets an escalation when nobody is known (D160): typed by the manager. */
  escalateTo?: { name: string; email: string };
  /** "Send one more reminder" instead of the escalation. */
  remindInstead?: boolean;
}

/** A message holds at most this many CIs. A longer one is split into parts, each with its own reference. A message to a mailbox (For Procurement) or a team is never split. */
export const MAX_CIS_PER_MESSAGE = 25;

/** Who a fact goes to. The fallback for a CI from EPO is the EPO inventory owner of the team settings. */
export function recipientOf(fact: Fact, settings: MessageSettings): { name: string; email: string; via: string } {
  if (fact.contactId === EPO_OWNER) return { name: settings.epoOwnerName || 'EPO inventory owner', email: settings.epoOwnerEmail || '', via: 'inventory owner of EPO' };
  if (fact.contactId === PROCUREMENT) return { name: settings.procurementName || 'Procurement', email: settings.procurementEmail || '', via: PROCUREMENT_VIA };
  if (isTeam(fact.contactId)) {
    const team = settings.teams?.[teamIdOf(fact.contactId)];
    return { name: (team?.name ?? '').trim() || fact.contactName, email: teamAddresses(team), via: fact.contactVia };
  }
  return { name: fact.contactName, email: fact.contactEmail, via: fact.contactVia };
}

/** True when the fact goes to a mailbox of the team settings and not to a person: nobody is copied. Its escalation goes to the Procurement lead of the settings. */
export const toMailbox = (fact: Fact): boolean => fact.contactId === PROCUREMENT;
/** True when the fact goes to the people of a team of the settings (Process Management, D195): nobody is copied, the message is never split. */
export const toTeam = (fact: Fact): boolean => isTeam(fact.contactId);

/**
 * Who gets the escalation of a case whose reminders got no answer: the person's manager (else department head), or, for the
 * Procurement mailbox, the Procurement lead of the team settings. Null when there is nobody (no lead set: no escalation).
 */
export function escalationOf(fact: Fact, settings: MessageSettings): { name: string; email: string } | null {
  if (toMailbox(fact)) {
    const email = (settings.procurementLeadEmail ?? '').trim();
    return email ? { name: (settings.procurementLeadName ?? '').trim() || 'Procurement lead', email } : null;
  }
  // Nobody above, or the person above is the person asked: there is nobody to escalate to.
  if (!fact.escalateEmail || fact.escalateEmail.toLowerCase() === recipientOf(fact, settings).email.toLowerCase()) return null;
  return { name: fact.escalateName ?? '', email: fact.escalateEmail };
}

const ROLE_LABEL: Record<string, string> = { owned_by: 'Owned by', managed_by: 'Managed by', supported_by: 'Supported by', assigned_to: 'Assigned to' };
const ROLE_WORD: Record<string, string> = { owned_by: 'owner', managed_by: 'manager', supported_by: 'support person', assigned_to: 'assignee' };
/** The EPO names of the roles (instruction, 2.7). */
export const EPO_ROLE: Record<string, string> = { owned_by: 'System Owner', managed_by: 'Primary Responsible', supported_by: 'Secondary Responsible' };
/** The request that changes a role. Supported by has none in the portal. */
const ROLE_REQUEST: Record<string, string> = { owned_by: 'owned-by-update', managed_by: 'managed-by-update' };

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;
const orList = (items: string[]): string => items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
const andList = (items: string[]): string => items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const times = (count: number): string => (count === 1 ? 'once' : `${NUMBER_WORDS[count] ?? count} times`);
const firstName = (name: string): string => (/,/.test(name) ? name.split(',')[1] ?? '' : name).trim().split(/\s+/)[0] ?? '';

/** Text in two forms: HTML for the mailbox, plain for Outlook and Teams. */
interface Rich { html: string; text: string }
const plain = (text: string): Rich => ({ html: escapeHtml(text), text });
const join = (parts: Rich[], separator = ' '): Rich => ({ html: parts.map((part) => part.html).filter(Boolean).join(separator), text: parts.map((part) => part.text).filter(Boolean).join(separator) });

/** A request with its link. `withAction` false: the request by its name only, without the action inside its form ({form:<id>}). */
function requestRef(id: string, settings: MessageSettings, withAction = true): Rich {
  const known = REQUESTS.filter((request) => request.id === id)[0];
  const set = settings.requests?.[id];
  const name = requestName(id, set?.name);
  const action = known?.action && withAction ? `, action "${known.action}"` : '';
  const link = set && /^https:\/\//i.test(set.link.trim()) ? set.link.trim() : '';
  if (link) return { html: `"<a href="${escapeHtml(link)}">${escapeHtml(name)}</a>"${escapeHtml(action)}`, text: `"${name}"${action} (${link})` };
  const portal = /^https:\/\//i.test(settings.portalLink.trim()) ? settings.portalLink.trim() : '';
  const where = action ? ', in the' : ' in the';
  return portal
    ? { html: `"${escapeHtml(name)}"${escapeHtml(action)}${where} <a href="${escapeHtml(portal)}">Service Portal</a>`, text: `"${name}"${action}${where} Service Portal (${portal})` }
    : plain(`"${name}"${action}${where} Service Portal`);
}

/** Several requests: "A" or "B" in the Service Portal, with "in the Service Portal" once, at the end. */
function requestRefs(ids: string[], settings: MessageSettings): Rich {
  const refs = ids.map((id) => requestRef(id, settings));
  const tail = / in the (<a [^>]+>)?Service Portal(<\/a>)?$| in the Service Portal \(https:[^)]*\)$/;
  const last = refs.length - 1;
  const trimmed = refs.map((ref, index) => (index < last && tail.test(ref.text) && tail.test(refs[last]!.text) ? { html: ref.html.replace(tail, ''), text: ref.text.replace(tail, '') } : ref));
  return { html: trimmed.map((ref) => ref.html).join(' or '), text: trimmed.map((ref) => ref.text).join(' or ') };
}

/** Fills the placeholders of a text (see MessageTexts). */
function fill(template: string, fields: string[], texts: MessageTexts, settings: MessageSettings): Rich {
  const roles = fields.filter((field) => ROLE_LABEL[field]);
  const out: Rich[] = [];
  for (const piece of template.split(/(\{[a-zA-Z]+(?::[a-z-]+)?\})/)) {
    const token = /^\{([a-zA-Z]+)(?::([a-z-]+))?\}$/.exec(piece);
    if (!token) { if (piece) out.push(plain(piece)); continue; }
    const [, name, arg] = token;
    if (name === 'role') out.push(plain(orList(roles.map((field) => ROLE_LABEL[field]!))));
    else if (name === 'who') out.push(plain(orList(roles.map((field) => ROLE_WORD[field]!)) || 'person'));
    else if (name === 'epoRole') out.push(plain(orList(roles.map((field) => EPO_ROLE[field] ?? ROLE_LABEL[field]!))));
    else if (name === 'request') {
      const ids = arg ? [arg] : texts.request === 'role' ? roles.map((field) => ROLE_REQUEST[field]).filter((id): id is string => !!id) : texts.request ? [texts.request] : [];
      out.push(requestRefs(ids, settings));
    } else if (name === 'form' && arg) out.push(requestRef(arg, settings, false));
    else if (name === 'reply' || name === 'Reply') {
      // The same text reads right in an email and in a Teams chat (D163).
      const words = settings.channel === 'chat' ? 'answer in this chat' : 'reply to this email';
      out.push(plain(name === 'Reply' ? words.charAt(0).toUpperCase() + words.slice(1) : words));
    } else out.push(plain(piece));
  }
  return join(out, '');
}

/** "ServiceNow names you as Managed by of the CI below." From how the contact was found, with one or more CIs (F40). */
function whyYou(via: string, below: string): string {
  const label = (words: string): string => ROLE_LABEL[words.trim().replace(' ', '_')] ?? words;
  const above = /^(manager|department head) of (.+)$/.exec(via);
  if (above) return `You are the ${above[1]} of the ${label(above[2]!)} of ${below}.`;
  if (via === 'inventory owner of EPO') return `You are the inventory owner of EPO, and nobody else could be asked about ${below}.`;
  // A team responsible for the record of a class (D195): "Process Management team".
  if (/ team$/.test(via)) return `${via.replace(/ team$/, '')} is responsible for the record of ${below}. SACM updates ServiceNow with what you tell us.`;
  if (via === PROCUREMENT_VIA) return 'Procurement owns the contract data in Solusi. The contracts below need a correction in Solusi: ServiceNow receives it with the next upload.';
  if (ROLE_LABEL[via.replace(' ', '_')]) return `ServiceNow names you as ${label(via)} of ${below}.`;
  return `You are named on ${below}.`;
}

/** "the CI below", "the CIs below", "the contract below". */
function belowWords(items: Case[]): string {
  const count = new Set(items.map((item) => item.fact.ciKey)).size;
  const noun = items.every(isContract) ? 'contract' : 'CI';
  return `the ${noun}${count === 1 ? '' : 's'} below`;
}

/** The part of a message about one check and one route (and one kind of problem, for a check with `byProblem`): its heading, texts and table rows. */
interface Section { pack: CheckPack; texts: MessageTexts; route: string; items: Case[]; problem?: string }

/** The kind of problem of a finding of a check with `byProblem`: the first part of its field ("personName.owner" gives "personName"). */
const problemOf = (fact: Fact): string => fact.field.split('.')[0]!;
/** The texts of a part: those of its kind of problem when the check has them. */
function textsOf(pack: CheckPack, problem: string | undefined): MessageTexts {
  const base = pack.playbook.message!;
  const own = problem ? base.byProblem?.[problem] : undefined;
  return own ? { ...base, ...own } : base;
}
/** Where a finding stands in its message: by check, then by kind of problem in the order of `byProblem`. */
function problemOrder(pack: CheckPack | undefined, fact: Fact): number {
  const kinds = Object.keys(pack?.playbook.message?.byProblem ?? {});
  const index = kinds.indexOf(problemOf(fact));
  return index < 0 ? kinds.length : index;
}

/** The ask of a check for the team every case of a part goes to, when the check has one (askByTeam). */
function teamAsk(items: Case[], texts: MessageTexts): string | undefined {
  const id = teamIdOf(items[0]?.fact.contactId ?? '');
  return id && items.every((item) => item.fact.contactId === items[0]!.fact.contactId) ? texts.askByTeam?.[id] : undefined;
}

function sectionTexts(section: Section, settings: MessageSettings): { heading: Rich; intro: Rich; ask: Rich; why: Rich; whyYou: string } {
  const { texts, items, route } = section;
  const fields = Array.from(new Set(items.map((item) => item.fact.field)));
  const roles = fields.filter((field) => ROLE_LABEL[field]);
  // 'sacm' is in runs saved before version 0.17 only: the fix is made in EPO all the same (D123).
  const epo = route === 'epo' || route === 'sacm';
  let ask: Rich;
  if (epo) {
    // EPO has its own words for the roles: they are named next to the ServiceNow words.
    const named = roles.filter((field) => EPO_ROLE[field]);
    const first = texts.epoAsk
      ?? (texts.epoWhat ? `Please correct the ${texts.epoWhat} in EPO.`
        : named.length ? `In EPO, ${andList(named.map((field) => `${ROLE_LABEL[field]} is called ${EPO_ROLE[field]}`))}. Please correct it in EPO.`
          : 'Please correct it in EPO.');
    // The service mapped flag is never named and never a reason to ask for a reply: copying EPO into ServiceNow is SACM's own job (card EPO ≠ ServiceNow).
    ask = plain(`These CIs come from EPO. ${first} ServiceNow receives the change from EPO.`);
  } else if (teamAsk(items, texts)) {
    // A team responsible for the record (Process Management) has its own ask: it tells SACM the value (D195).
    ask = fill(teamAsk(items, texts)!, fields, texts, settings);
  } else {
    // A role without a request in the portal (Supported by): ask for a reply only.
    const noRequest = texts.request === 'role' && !!texts.askNoRequest && !roles.some((field) => ROLE_REQUEST[field]);
    const general = noRequest ? texts.askNoRequest! : texts.ask;
    const classes = Array.from(new Set(items.map((item) => item.fact.className)));
    const own = classes.filter((cls) => texts.askByClass?.[cls]);
    if (classes.length === 1 && own.length) ask = fill(texts.askByClass![own[0]!]!, fields, texts, settings);
    else if (own.length) {
      // CIs of several classes, some with an ask of their own (a Service Offering has its own request): one sentence per class.
      const labelOf = (cls: string): string => `${items.filter((item) => item.fact.className === cls)[0]!.fact.classLabel.replace(/y$/, 'ie')}s`;
      const asks = own.map((cls) => join([plain(`For ${labelOf(cls)}:`), fill(texts.askByClass![cls]!, fields, texts, settings)]));
      if (classes.length > own.length) asks.push(join([plain('For the other CIs:'), fill(general, fields, texts, settings)]));
      ask = join(asks);
    } else ask = fill(general, fields, texts, settings);
  }
  if (texts.several && new Set(items.map((item) => item.fact.ciKey)).size >= 3) ask = join([ask, fill(texts.several, fields, texts, settings)]);
  return {
    heading: fill(texts.subject, fields, texts, settings),
    intro: fill(texts.intro, fields, texts, settings),
    ask, why: fill(texts.why, fields, texts, settings),
    whyYou: whyYou(items[0]!.fact.contactVia, belowWords(items))
  };
}

/** The columns of the table in a message: short names, so the header does not wrap in Outlook (build L4, D235). */
const COLUMNS = ['Name', 'EPO ID', 'Class', 'Owned by', 'Managed by', 'Status', 'Support group'];
const CONTRACT_COLUMNS = ['Contract number', 'Name', 'Vendor', 'What we found'];

const isContract = (item: Case): boolean => !!item.fact.ci?.contract;

/** The table of a part about contracts: contract number, name, vendor and the value. */
function contractTable(items: Case[]): Rich {
  const cells = (item: Case): string[] => { const contract = item.fact.ci!.contract!; return [contract.number, contract.name, contract.vendor, item.fact.detail]; };
  const rows = items.map((item) => `<tr>${cells(item).map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
  return {
    html: `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse"><tr>${CONTRACT_COLUMNS.map((cell) => `<th align="left" style="white-space:nowrap">${cell}</th>`).join('')}</tr>${rows}</table>`,
    text: items.map((item) => `- ${cells(item).filter(Boolean).join(' · ')}`).join('\n')
  };
}

function table(items: Case[], found: boolean): Rich {
  if (items.every(isContract)) return contractTable(items);
  const cells = (item: Case): string[] => {
    const ci = item.fact.ci;
    return [item.fact.ciName, ci?.epoId ?? '', item.fact.classLabel, ci?.ownedBy ?? '', ci?.managedBy ?? '', ci?.status ?? '', ci?.supportGroup ?? '', ...(found ? [item.fact.detail] : [])];
  };
  const head = COLUMNS.concat(found ? ['What we found'] : []);
  const rows = items.map((item) => `<tr>${cells(item).map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
  return {
    html: `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse"><tr>${head.map((cell) => `<th align="left" style="white-space:nowrap">${cell}</th>`).join('')}</tr>${rows}</table>`,
    text: items.map((item) => `- ${cells(item).map((cell, index) => (index >= 3 && index <= 6 && cell ? `${head[index]}: ${cell}` : cell)).filter(Boolean).join(' · ')}`).join('\n')
  };
}

const p = (rich: Rich): Rich => ({ html: rich.html ? `<p>${rich.html}</p>` : '', text: rich.text });

/**
 * The cases of one draft. `fresh`: the keys of the second part of a reminder, "New since then" (D161). `nobodyAbove`: an
 * escalation for which nobody is known (D160), so `to` is empty or typed by the manager.
 */
interface Group { kind: DraftKind; previousRef: string; to: { name: string; email: string }; items: Case[]; fresh: Set<string>; nobodyAbove: boolean }

/** The last message of a case that a reminder answers to: an email if there is one, else a Teams chat. */
const previousOf = (item: Case): Case['messages'][number] | undefined => item.messages.filter((event) => event.channel !== 'teams').pop() ?? item.messages[item.messages.length - 1];

/**
 * One draft per person: a person gets one email about all their open points, across every check and module (D34).
 * A reminder goes in the thread of the first message (same reference), so replies to either land on the same cases. Open
 * points of the same person that were never asked join the reminder as its second part, "New since then" (D161).
 * When the reminders got no answer (`overLimit`), the draft goes to the person above instead: an escalation (D40, D160).
 * When nobody is known, the escalation has no address until the manager types one (`options.escalateTo`); it never turns
 * into a reminder on its own. A message with more than MAX_CIS_PER_MESSAGE CIs is split into parts.
 */
export function buildDrafts(cases: Case[], packs: CheckPack[], settings: MessageSettings, newRef: () => string, options: DraftOptions = {}): { drafts: Draft[]; skipped: Case[] } {
  const packOf = (id: string): CheckPack | undefined => packs.filter((candidate) => candidate.id === id)[0];
  const order = (item: Case): number => packs.findIndex((pack) => pack.id === item.fact.checkId);
  const groups = new Map<string, Group>();
  const skipped: Case[] = [];
  const typed = options.escalateTo && options.escalateTo.email.trim() ? { name: options.escalateTo.name.trim(), email: options.escalateTo.email.trim() } : null;
  for (const item of cases) {
    const recipient = recipientOf(item.fact, settings);
    const pack = packOf(item.fact.checkId);
    if (!recipient.email || !pack || !pack.playbook.message) { skipped.push(item); continue; }
    const previous = previousOf(item);
    let kind: DraftKind = previous && previous.ref ? 'reminder' : 'first';
    let to = { name: recipient.name, email: recipient.email };
    let nobodyAbove = false;
    if (kind === 'reminder' && item.overLimit && !options.remindInstead) {
      const above = escalationOf(item.fact, settings);
      // The Procurement mailbox without a Procurement lead in Settings: no escalation, the reminder goes again (D147).
      if (above) { kind = 'escalation'; to = above; }
      else if (!toMailbox(item.fact)) { kind = 'escalation'; nobodyAbove = true; to = typed ?? { name: '', email: '' }; }
    }
    const previousRef = kind === 'first' ? '' : previous!.ref ?? '';
    const groupKey = `${kind}|${previousRef}|${to.email.toLowerCase()}|${kind === 'escalation' ? recipient.email.toLowerCase() : ''}`;
    const group = groups.get(groupKey) ?? { kind, previousRef, to, items: [], fresh: new Set<string>(), nobodyAbove };
    group.items.push(item);
    groups.set(groupKey, group);
  }
  // A reminder and the person's new points are one email (D161): the first message joins the person's (first) reminder.
  const all = Array.from(groups.values());
  for (const group of all.filter((one) => one.kind === 'first')) {
    const reminder = all.filter((one) => one.kind === 'reminder' && one.to.email.toLowerCase() === group.to.email.toLowerCase())[0];
    if (!reminder || group.items.some((item) => toMailbox(item.fact))) continue;
    for (const item of group.items) { reminder.items.push(item); reminder.fresh.add(item.key); }
    group.items = [];
  }

  const drafts: Draft[] = [];
  for (const group of all) {
    if (!group.items.length) continue;
    const items = group.items.slice().sort((a, b) => Number(group.fresh.has(a.key)) - Number(group.fresh.has(b.key))
      || order(a) - order(b) || problemOrder(packOf(a.fact.checkId), a.fact) - problemOrder(packOf(b.fact.checkId), b.fact)
      || (a.fact.route || '').localeCompare(b.fact.route || '') || a.fact.ciName.localeCompare(b.fact.ciName));
    // Split by CI, never in the middle of a CI. The limit counts for the whole email. A mailbox or a team gets one message with every table.
    const whole = items.every((item) => toMailbox(item.fact) || toTeam(item.fact));
    const chunks: Case[][] = [];
    let current: Case[] = [];
    let seen = new Set<string>();
    for (const item of items) {
      if (!whole && !seen.has(item.fact.ciKey) && seen.size >= MAX_CIS_PER_MESSAGE) { chunks.push(current); current = []; seen = new Set(); }
      seen.add(item.fact.ciKey);
      current.push(item);
    }
    if (current.length) chunks.push(current);
    chunks.forEach((chunk, index) => {
      // A part that holds only new points is a first message of its own.
      const onlyNew = group.kind === 'reminder' && chunk.every((item) => group.fresh.has(item.key));
      const own: Group = onlyNew ? { ...group, kind: 'first', previousRef: '', fresh: new Set() } : group;
      const ref = index === 0 && own.previousRef ? own.previousRef : newRef();
      drafts.push(draftOf(chunk, own, ref, { index: index + 1, count: chunks.length }, packOf, settings));
    });
  }
  return { drafts, skipped };
}

/** The body of the tables of a message: one part per check and route (and kind of problem), each with its intro, table, ask and why. */
function sectionsBody(items: Case[], kind: DraftKind, packOf: (id: string) => CheckPack | undefined, settings: MessageSettings, sameWhy: boolean): Rich[] {
  const sections = new Map<string, Section>();
  for (const item of items) {
    const pack = packOf(item.fact.checkId)!;
    const problem = pack.playbook.message!.byProblem ? problemOf(item.fact) : undefined;
    const key = `${pack.id}|${item.fact.route || ''}|${problem ?? ''}`;
    const section = sections.get(key) ?? { pack, texts: textsOf(pack, problem), route: item.fact.route || '', items: [], ...(problem ? { problem } : {}) };
    section.items.push(item);
    sections.set(key, section);
  }
  const several = sections.size > 1;
  const parts = Array.from(sections.values()).map((section) => ({ section, texts: sectionTexts(section, settings) }));
  const body: Rich[] = [];
  parts.forEach(({ section, texts }, index) => {
    // "What we found" is shown when the lines differ, and always when a line says what the source holds (D190).
    const found = several || new Set(section.items.map((item) => item.fact.detail)).size > 1 || section.items.some((item) => !!item.fact.source);
    // A part of a check with one table per kind of problem says how many contracts it holds.
    const count = section.problem ? ` (${section.items.length})` : '';
    if (several) body.push({ html: `<h3 style="margin:18px 0 6px">${texts.heading.html}${count}</h3>`, text: `\n${texts.heading.text.toUpperCase()}${count}` });
    body.push(p(join([kind !== 'escalation' && !sameWhy ? plain(texts.whyYou) : plain(''), texts.intro])));
    body.push(table(section.items, found));
    if (kind !== 'escalation') body.push(p(texts.ask));
    // The parts of one check with a table per kind of problem share the line "why it matters": it comes once, after the last.
    const next = parts[index + 1];
    if (!(section.problem && next && next.section.pack.id === section.pack.id && next.section.problem)) body.push(p(texts.why));
  });
  return body;
}

/** How many parts (check, route, kind of problem) a set of cases makes in a message. */
function sectionCount(items: Case[], packOf: (id: string) => CheckPack | undefined): number {
  return new Set(items.map((item) => `${item.fact.checkId}|${item.fact.route || ''}|${packOf(item.fact.checkId)!.playbook.message!.byProblem ? problemOf(item.fact) : ''}`)).size;
}

/** The first contact of these cases, by any channel (F02): its day and whether it was a Teams chat. */
function firstContact(items: Case[]): { on: string; teams: boolean } | null {
  const first = ([] as Case['messages']).concat(...items.map((item) => item.messages)).sort((a, b) => a.at.localeCompare(b.at))[0];
  return first && /^\d{4}-\d{2}-\d{2}/.test(first.at) ? { on: first.at.slice(0, 10), teams: first.channel === 'teams' } : null;
}

/** The opening of an escalation: who is written to, why, and what we ask. */
function escalationOpening(items: Case[], person: { name: string; email: string }, group: Group): string {
  const below = belowWords(items);
  const fact = items[0]!.fact;
  const attempts = Math.max(...items.map((item) => item.messages.length));
  if (toMailbox(fact)) {
    const sentOn = Array.from(new Set(([] as string[]).concat(...items.map((item) => item.messages.map((event) => event.at.slice(0, 10)))))).sort();
    return `We wrote to the ${person.name || 'Procurement'} mailbox (${person.email}) on ${andList(sentOn.slice(-3).map(longDate))} about ${below}, and we have no answer. `
      + 'You are the Procurement lead. Could you help us to get an answer, or tell us who else to ask?';
  }
  const asked = person.name || person.email;
  const ask = 'Could you help us to get an answer, or tell us who else to ask?';
  if (group.nobodyAbove) return `We asked ${asked} ${times(attempts)} about ${below} and got no answer. ${ask}`;
  const role = fact.contactVia === 'managed by' ? ', the Managed by person,' : '';
  const via = fact.escalateVia;
  if (via === 'owner') return `You are the owner (Owned by) of ${below}. We asked ${asked}${role} ${times(attempts)} and got no answer. ${ask}`;
  if (via === 'manager of owner' || via === 'department head of owner') {
    return `You are the ${via === 'manager of owner' ? 'manager' : 'head of the department'} of the owner (Owned by) of ${below}. We asked ${asked}${role} ${times(attempts)} and got no answer. ${ask}`;
  }
  return `We asked ${asked}${role} ${times(attempts)} about ${below} and got no answer. `
    + `You are ${via === 'department head' ? 'the head of their department' : 'their manager'} in ServiceNow. ${ask}`;
}

function draftOf(items: Case[], group: Group, ref: string, part: Draft['part'], packOf: (id: string) => CheckPack | undefined, settings: MessageSettings): Draft {
  const person = recipientOf(items[0]!.fact, settings);
  const to = group.to.email;
  const cc: string[] = [];
  const addCc = (address: string): void => {
    if (address && address.toLowerCase() !== to.toLowerCase() && !cc.some((known) => known.toLowerCase() === address.toLowerCase())) cc.push(address);
  };
  if (group.kind === 'escalation') addCc(person.email);
  for (const item of items) for (const address of item.fact.cc) addCc(address);

  const still = items.filter((item) => !group.fresh.has(item.key));
  const fresh = items.filter((item) => group.fresh.has(item.key));
  const two = still.length > 0 && fresh.length > 0;
  // The line "why you" comes once at the top when every part says the same; else each part says it.
  const vias = new Set(items.map((item) => whyYou(item.fact.contactVia, 'X')));
  const sameWhy = vias.size === 1;
  const kinds = sectionCount(items, packOf);
  const ciCount = new Set(items.map((item) => item.fact.ciKey)).size;
  // A message only about contracts says "contracts", never "CIs".
  const contracts = items.every(isContract);
  const noun = contracts ? 'contract' : 'CI';

  // A team is greeted by its name ("Hi Process Management,"), a person by the first name.
  const greeted = group.kind !== 'escalation' && items.every((item) => toTeam(item.fact)) ? group.to.name.trim() : firstName(group.to.name);
  const hello = `Hi${greeted ? ` ${greeted}` : ''},`;
  const opening: Rich[] = [plain(hello)];
  if (group.kind === 'reminder') {
    // The date of the first contact, by any channel (F02); never an empty date.
    const first = firstContact(still);
    const what = first ? `A short reminder of our ${first.teams ? 'Teams message' : 'message'} of ${longDate(first.on)}.` : 'A short reminder.';
    const below = belowWords(still);
    opening.push(plain(two ? `${what} The first part below is still open. The second part has new points for you.`
      : `${what} ${below.charAt(0).toUpperCase()}${below.slice(1)} ${new Set(still.map((item) => item.fact.ciKey)).size === 1 ? 'is' : 'are'} still open.`));
  }
  if (group.kind === 'escalation') opening.push(plain(escalationOpening(items, person, group)));
  if (group.kind !== 'escalation' && sameWhy) {
    const why = whyYou(items[0]!.fact.contactVia, belowWords(items));
    opening.push(plain(kinds > 1 ? `${why} We found ${plural(kinds, 'kind')} of problem.` : why));
  }

  const body: Rich[] = opening.map(p);
  if (two) {
    const first = firstContact(still);
    const heading = (text: string): Rich => ({ html: `<h2 style="margin:22px 0 4px;font-size:16px">${escapeHtml(text)}</h2>`, text: `\n== ${text.toUpperCase()} ==` });
    body.push(heading(first ? `Still open (our message of ${longDate(first.on)})` : 'Still open'));
    body.push(...sectionsBody(still, group.kind, packOf, settings, sameWhy));
    body.push(heading('New since then'));
    body.push(...sectionsBody(fresh, group.kind, packOf, settings, sameWhy));
  } else body.push(...sectionsBody(items, group.kind, packOf, settings, sameWhy));
  body.push(p(plain(`When you reply, please keep the reference [${ref}] in the subject.`)));
  const sender = (settings.senderName ?? '').trim();
  const signature = (settings.signature || 'SACM team').trim();
  body.push({ html: `<p>Thank you,<br>${sender ? `${escapeHtml(sender)}<br>` : ''}${escapeHtml(signature)}</p>`, text: ['Thank you,', sender, signature].filter(Boolean).join('\n') });

  const only = kinds === 1 ? sectionTexts({ pack: packOf(items[0]!.fact.checkId)!, texts: textsOf(packOf(items[0]!.fact.checkId)!, packOf(items[0]!.fact.checkId)!.playbook.message!.byProblem ? problemOf(items[0]!.fact) : undefined), route: items[0]!.fact.route || '', items }, settings).heading.text : '';
  const onWhat = ciCount === 1 ? items[0]!.fact.ciName : plural(ciCount, noun);
  let topic = only ? `${only} on ${onWhat}`
    : contracts ? `${plural(ciCount, 'contract')} ${ciCount === 1 ? 'needs' : 'need'} a correction in Solusi`
      : `${plural(ciCount, 'CI')} ${ciCount === 1 ? 'needs' : 'need'} your attention in the CMDB`;
  if (group.kind === 'reminder') topic = `Reminder: ${topic}`;
  if (group.kind === 'escalation') topic = `No answer on ${plural(ciCount, noun)} of ${person.name || person.email}`;
  const partText = part.count > 1 ? ` (part ${part.index} of ${part.count})` : '';

  return {
    ref, to, cc: cc.join('; '), kind: group.kind, part, ciCount,
    checkIds: Array.from(new Set(items.map((item) => item.fact.checkId))),
    keys: items.map((item) => item.key),
    newKeys: fresh.map((item) => item.key),
    about: group.kind === 'escalation' ? person.name || person.email : undefined,
    ...(group.kind === 'escalation' && group.nobodyAbove ? { nobodyAbove: true } : {}),
    ...(items.every((item) => toMailbox(item.fact)) ? { mailbox: true } : {}),
    ...(items.every((item) => toTeam(item.fact)) ? { team: true } : {}),
    subject: `${topic}${partText} [${ref}]`,
    body: body.map((piece) => piece.html).join(''),
    plain: body.map((piece) => piece.text).join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
  };
}

/**
 * The first message of a Teams chat (D163): the same first sentence and ask as the email, written for a chat ({reply}),
 * with a short list of the CIs that `to` (the person asked, by email) is asked about. Without `to`: every CI.
 */
export function chatMessage(items: Case[], packs: CheckPack[], settings: MessageSettings, ref: string, to = ''): string {
  const chat: MessageSettings = { ...settings, channel: 'chat' };
  const theirs = to ? items.filter((item) => recipientOf(item.fact, chat).email.toLowerCase() === to.toLowerCase()) : items;
  const own = theirs.length ? theirs : items;
  const pack = packs.filter((candidate) => own[0] && candidate.id === own[0].fact.checkId)[0];
  if (!pack || !pack.playbook.message || !own.length) return `Hi, this is the SACM team. Reference: ${ref}`;
  const mine = own.filter((item) => item.fact.checkId === pack.id);
  const texts = sectionTexts({ pack, texts: pack.playbook.message, route: mine[0]!.fact.route || '', items: mine }, chat);
  const names = Array.from(new Set(mine.map((item) => item.fact.ciName))).sort((a, b) => a.localeCompare(b));
  const shown = names.slice(0, 8).map((name) => `- ${name}`);
  if (names.length > shown.length) shown.push(`- and ${plural(names.length - shown.length, mine.every(isContract) ? 'more contract' : 'more CI')}`);
  return [`Hi, this is the SACM team. ${texts.intro.text}`, ...shown, texts.ask.text, `Reference: ${ref}`].join('\n');
}
