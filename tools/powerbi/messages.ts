// The answer key of the messages of the Power BI report (build B7, D300 to D302): what the TypeScript logic of
// src/core/messages/ gives on the invented samples, so tools/powerbi/parity.ts can compare the Power Query result
// (fnDrafts, fnChatMessage, fnShareOut) with it.
//   - The team settings the messages use, from the list SACM Settings (MessageSettings in Power Query).
//   - The drafts of the samples with the team's state of powerbi/samples/state/: one per person across the cards, as
//     the Email window of the HTML app gives it with the points of the other cards ticked (ComposeDialog).
//   - The recorded messages of tests/recorded/messages.txt and teams-messages.txt, read back for the comparison.
//   - Share out (D24): which manager each free group of a card goes to.
// Only invented data.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDrafts, chatMessage, REQUESTS } from '../../src/core/messages/messages.ts';
import type { Draft, MessageSettings } from '../../src/core/messages/messages.ts';
import { groupCases } from '../../src/core/cases/cases.ts';
import type { Case } from '../../src/core/cases/cases.ts';
import { shareOut } from '../../src/core/team/team.ts';
import { recordTeams } from '../../src/core/cases/record-teams.ts';
import { askable, fixRecords, fixRows, handedToOwner } from '../../src/app/view/fix-list.ts';
import { cardKind } from '../../src/app/view/cards.ts';
import { toSolve } from '../../src/app/view/cases.ts';
import { DEFAULT_SETTINGS } from '../../src/app/state/store.ts';
import { loadPacks, loadReferences } from '../../src/hosts/cli.ts';
import { stateRows } from './history.ts';
import type { HistoryKey } from './history.ts';
import { emailsOf, rowsInEmailOf } from './email.ts';
import type { Email } from './email.ts';

const root = join(import.meta.dirname, '..', '..');

/** The tokens of a draft that the Power App fills when the manager sends (D301): the reference and the manager's name. */
export const REF_TOKEN = '%%REF%%';
export const SENDER_TOKEN = '%%SENDER%%';
/** The manager of the samples: the name tests/sample-record.ts writes the recorded messages with. */
export const SAMPLE_SENDER = 'Demo User';

/** One person of a team as the setting team.<id>.people holds them: "Name <address>", or an address alone. */
function personOf(part: string): { name: string; email: string } {
  const open = part.indexOf('<');
  const close = part.lastIndexOf('>');
  return open >= 0 && close > open ? { name: part.slice(0, open).trim(), email: part.slice(open + 1, close).trim() } : { name: '', email: part.trim() };
}

/**
 * The settings of the messages from the rows of the list SACM Settings (Title, Value), as MessageSettings reads them:
 * a key that is not there, or empty, keeps the default of the HTML app (DEFAULT_SETTINGS).
 */
export function messageSettingsOf(rows: Array<Record<string, string>>, senderName = SAMPLE_SENDER): MessageSettings {
  const values = new Map(rows.map((row) => [(row.Title ?? '').trim(), (row.Value ?? '').trim()]));
  const value = (key: string, fallback: string): string => values.get(key) || fallback;
  const requests: NonNullable<MessageSettings['requests']> = {};
  for (const request of REQUESTS) {
    const name = value(`request.${request.id}.name`, '');
    const link = value(`request.${request.id}.link`, '');
    if (name || link) requests[request.id] = { name, link };
  }
  const teams: NonNullable<MessageSettings['teams']> = {};
  for (const team of recordTeams(loadReferences())) {
    const name = value(`team.${team.id}.name`, '');
    const people = value(`team.${team.id}.people`, '').split(/[;\r\n]/).filter((part) => part.trim()).map(personOf);
    if (name || people.length) teams[team.id] = { name, people };
  }
  return {
    portalLink: value('portalLink', DEFAULT_SETTINGS.portalLink), signature: value('signature', DEFAULT_SETTINGS.signature), senderName,
    epoOwnerName: value('epoOwnerName', DEFAULT_SETTINGS.epoOwnerName), epoOwnerEmail: value('epoOwnerEmail', DEFAULT_SETTINGS.epoOwnerEmail),
    procurementName: value('procurementName', DEFAULT_SETTINGS.procurementName), procurementEmail: value('procurementEmail', DEFAULT_SETTINGS.procurementEmail),
    procurementLeadName: value('procurementLeadName', DEFAULT_SETTINGS.procurementLeadName), procurementLeadEmail: value('procurementLeadEmail', DEFAULT_SETTINGS.procurementLeadEmail),
    requests, teams
  };
}

export const sampleMessageSettings = (): MessageSettings => messageSettingsOf(stateRows('settings'));

/**
 * The cases a draft of the table Drafts writes about: shown by the newest report, to solve, an owner may be asked
 * (askable), and never asked, or a reminder due, or the reminders used (fnDraftsPart).
 */
export function draftCases(cases: Case[], packs = loadPacks()): Case[] {
  return cases.filter((item) => item.inLatest && toSolve(item) && askable(packs.find((pack) => pack.id === item.fact.checkId), item)
    && (!item.messages.length || item.reminderDue || item.overLimit));
}

/** One row of the table Drafts as the answer key gives it: the draft with the tokens of the Power App in place of the reference and the name. */
export interface DraftRow { Html: string; Csv: string; Summary: string; EmailSubject: string; EmailId: string; Ref: string; Kind: string; To: string; Cc: string; Subject: string; Body: string; Plain: string; Chat: string; Keys: string; NewKeys: string; CheckIds: string; CiCount: number; PartIndex: number; PartCount: number; About: string; NobodyAbove: boolean; Mailbox: boolean; Team: boolean; Person: string; AssignedTo: string; FreeKeys: string }

/** A draft with %%REF%% where its reference is, as Power Query writes it, and the reference a reminder answers in Ref. */
export function draftRow(draft: Draft, items: Case[], settings: MessageSettings, email: Email, emailRef: string, emailId: string): DraftRow {
  const tokens = (text: string): string => text.split(draft.ref).join(REF_TOKEN).split(settings.senderName ?? SAMPLE_SENDER).join(SENDER_TOKEN);
  const byKey = new Map(items.map((item) => [item.key, item]));
  const own = draft.keys.map((key) => byKey.get(key)!);
  const assigned = Array.from(new Set(own.map((item) => item.assignedTo)));
  // The email holds the reference of its first part (D314).
  const emailTokens = (text: string): string => text.split(emailRef).join(REF_TOKEN).split(settings.senderName ?? SAMPLE_SENDER).join(SENDER_TOKEN);
  return {
    Html: emailTokens(email.html), Csv: email.csv, Summary: email.summary, EmailSubject: emailTokens(email.subject), EmailId: emailId,
    Ref: draft.kind !== 'first' && draft.part.index === 1 ? draft.ref : '', Kind: draft.kind, To: draft.to, Cc: draft.cc,
    Subject: tokens(draft.subject), Body: tokens(draft.body), Plain: tokens(draft.plain), Chat: chatMessage(own, loadPacks(), settings, REF_TOKEN, draft.to),
    Keys: draft.keys.join('\n'), NewKeys: draft.newKeys.join('\n'), CheckIds: draft.checkIds.join(', '), CiCount: draft.ciCount,
    PartIndex: draft.part.index, PartCount: draft.part.count, About: draft.about ?? '', NobodyAbove: !!draft.nobodyAbove, Mailbox: !!draft.mailbox, Team: !!draft.team,
    // Who the message is about (the person of its first case), who has its cases, and the cases nobody has (D164).
    Person: own[0]!.fact.contactId || own[0]!.fact.contactEmail.toLowerCase(), AssignedTo: assigned.length === 1 ? assigned[0]! : 'Several',
    FreeKeys: own.filter((item) => !item.assignedTo).map((item) => item.key).join('\n')
  };
}

/**
 * The rows of the table Drafts on the samples, with the team's state (historyKey). The cases go in the order of the
 * newest report, as the model has them: buildDrafts makes one draft per person in the order it first meets them, and the
 * HTML app meets the cases in the order they were first seen over all the reports it has. Only the order of the drafts
 * depends on it, never their text.
 */
export function draftRows(key: HistoryKey): DraftRow[] {
  const settings = sampleMessageSettings();
  const latest = key.reviewed;
  const position = new Map(latest.facts.map((fact, at) => [fact.key, at]));
  const chosen = draftCases(key.cases).sort((a, b) => (position.get(a.key) ?? Infinity) - (position.get(b.key) ?? Infinity));
  let ref = 0;
  const drafts = buildDrafts(chosen, loadPacks(), settings, () => `SACM-KEY${String(++ref).padStart(3, '0')}`).drafts;
  const emails = emailsOf(drafts, (at) => drafts[at]!.ref, rowsInEmailOf(stateRows('settings')));
  return drafts.map((draft, at) => draftRow(draft, chosen, settings, emails[at]!, drafts[emails[at]!.first]!.ref, `D${String(emails[at]!.first + 1).padStart(4, '0')}`));
}

/** One message of tests/recorded/messages.txt. */
export interface RecordedDraft { ref: string; kind: string; part: string; to: string; cc: string; subject: string; keys: string; plain: string; body: string }

/** The messages of tests/recorded/messages.txt (tests/sample-record.ts writes them), and the keys it left out. */
export function recordedDrafts(text = readFileSync(join(root, 'tests', 'recorded', 'messages.txt'), 'utf8')): { drafts: RecordedDraft[]; skipped: string } {
  const drafts: RecordedDraft[] = [];
  let skipped = '';
  for (const block of text.replace(/\r\n/g, '\n').split(/^===== /m).filter(Boolean)) {
    if (block.startsWith('skipped: ')) { skipped = block.slice('skipped: '.length).trim(); continue; }
    const head = /^(\S+) \((\w+), part (\d+ of \d+), /.exec(block)!;
    const line = (name: string): string => (new RegExp(`^${name}: ?(.*)$`, 'm').exec(block)?.[1] ?? '');
    const plain = block.slice(block.indexOf('\n--- text\n') + '\n--- text\n'.length, block.indexOf('\n--- html\n'));
    const body = block.slice(block.indexOf('\n--- html\n') + '\n--- html\n'.length).replace(/\n+$/, '');
    drafts.push({ ref: head[1]!, kind: head[2]!, part: head[3]!, to: line('To'), cc: line('Cc'), subject: line('Subject'), keys: line('Keys'), plain, body });
  }
  return { drafts, skipped };
}

/** The Teams chats of tests/recorded/teams-messages.txt, by check id. */
export function recordedChats(text = readFileSync(join(root, 'tests', 'recorded', 'teams-messages.txt'), 'utf8')): Map<string, string> {
  const chats = new Map<string, string>();
  for (const block of text.replace(/\r\n/g, '\n').split(/^===== /m).filter(Boolean)) {
    const at = block.indexOf('\n');
    chats.set(block.slice(0, at), block.slice(at + 1).replace(/\n+$/, ''));
  }
  return chats;
}

/**
 * Share out (D24, build B7): the manager each free group of a card goes to, by case key. A group is the cases of one
 * check that go to one person by one route (groupCases), to solve; it is free when none of its open cases is assigned.
 * On a SACM fix list a group is a record (one CI, fixRecords), sized by its lines still to mark, as the card shares it.
 * The groups of each card go out together, the biggest first, to the active member of SACM Team with the fewest CIs
 * so far (shareOut). Fewer than two active members: nobody (the HTML app asks to add colleagues first).
 */
export function shareOutOf(cases: Case[], members: string[], packs = loadPacks()): Map<string, string> {
  const out = new Map<string, string>();
  if (members.length < 2) return out;
  const open = cases.filter((item) => item.inLatest && item.state === 'open');
  const byCheck = new Map<string, Case[]>();
  for (const item of open) byCheck.set(item.fact.checkId, (byCheck.get(item.fact.checkId) ?? []).concat([item]));
  for (const [checkId, items] of byCheck) {
    const pack = packs.find((candidate) => candidate.id === checkId);
    const fix = !!pack && cardKind(pack) === 'fix';
    // A SACM fix list (FixListCard, ShareRecords): its records by their lines still to mark; else the groups handed to the owner.
    const fixCases = fix ? items.filter((item) => !handedToOwner(pack, item)) : [];
    const shares: Array<{ key: string; keys: string[]; size: number }> = fixCases.length
      ? fixRecords(fixRows(fixCases)).filter((one) => one.open.length && !one.assignedTo).map((one) => ({ key: one.key, keys: one.open, size: one.open.length }))
      : groupCases(fix ? items.filter((item) => askable(pack, item)) : items).filter((group) => group.open.length && group.open.every((item) => !item.assignedTo))
        .map((group) => ({ key: group.key, keys: group.open.map((item) => item.key), size: new Set(group.open.map((item) => item.fact.ciKey)).size }));
    const plan = shareOut(shares, members);
    for (const share of shares) for (const key of share.keys) out.set(key, plan.get(share.key)!);
  }
  return out;
}

/** The active members of the sample list SACM Team, in the order of the list. */
export const sampleMembers = (): string[] => stateRows('team').filter((row) => !/^(no|false|0)$/i.test((row.Active ?? '').trim())).map((row) => row.Title!);
