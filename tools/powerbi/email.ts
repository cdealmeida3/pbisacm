// The email template of the Power BI report (design pass §6, D313, D314): the answer key of fnEmailTemplate. It lays a
// draft of src/core/messages/messages.ts out as an email that reads the same in Outlook for Windows, Outlook on the web,
// Outlook on a phone and Gmail: tables and inline styles only, a navy band with the reference, "In this email", the
// numbered parts, clear tables, the box "What we ask", and a footer. It changes no word: every text comes from the
// draft's layout (Draft.layout), which holds the parts of Body as data. Only the words of the layout itself are its own
// ("In this email", "What we ask", "Why it matters:", the line of the attachment, the footer).
// Long lists (D314): the parts of a long message (split at 25 CIs by buildDrafts, D36) are joined into one email; each
// table shows its first `rowsInEmail` lines, then "and N more in the attached file", and the email gets a CSV file with
// every line (UTF-8 with a BOM, so Excel opens it right). A short email has no file.
// tools/powerbi/parity.ts compares fnEmailTemplate with this file; tests/sample-record.ts records the emails of the samples.
import { COLUMNS } from '../../src/core/messages/messages.ts';
import type { DraftKind, DraftLayout, LayoutSection } from '../../src/core/messages/messages.ts';
import { escapeHtml } from '../../src/core/shared/text.ts';
import { EMAIL_FONT, emailColours } from './tokens.ts';

/** The lines of a table the email shows when no setting says otherwise (SACM Settings, rowsInEmail). */
export const ROWS_IN_EMAIL = 10;
/** The range of the setting rowsInEmail: a value outside it is not used. */
export const ROWS_IN_EMAIL_RANGE = { min: 1, max: 100, default: ROWS_IN_EMAIL };

/** The setting rowsInEmail of the rows of SACM Settings (Title, Value): the last row counts; a value that is not a whole number in its range is not used. */
export function rowsInEmailOf(rows: Array<Record<string, string>>): number {
  const raw = (rows.filter((row) => (row.Title ?? '').trim() === 'rowsInEmail').pop()?.Value ?? '').trim();
  const number = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return number >= ROWS_IN_EMAIL_RANGE.min && number <= ROWS_IN_EMAIL_RANGE.max ? number : ROWS_IN_EMAIL_RANGE.default;
}

/** What the template reads of a draft. */
export interface EmailDraft {
  kind: DraftKind; to: string; subject: string; ciCount: number; part: { index: number; count: number };
  about?: string; mailbox?: boolean; team?: boolean; layout: DraftLayout;
}

/** The email of a draft: on the first part of a message, the whole email; on its other parts, "" (they are in it). */
export interface Email {
  html: string; csv: string; summary: string; subject: string;
  /** The position of the draft whose email holds this one (the first part of the message). */
  first: number;
}

const C = emailColours();
const F = `font-family:${EMAIL_FONT}`;
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

/** The phone rule (design pass §6.2): below 480 px a line of a table becomes a small card of "label: value" lines. Outlook for Windows ignores it. */
const PHONE = `@media (max-width:480px){table.t,table.t tbody,table.t tr,table.t td{display:block!important;width:auto!important}table.t tr.h{display:none!important}`
  + `table.t tr{border-bottom:1px solid ${C.line}}table.t td{border:0!important;padding:3px 10px!important}`
  + `table.t td[data-l]:before{content:attr(data-l);display:block;font-size:11px;color:${C.muted}}`
  + `table.t tr td:first-child{padding-top:9px!important}table.t tr td:last-child{padding-bottom:9px!important}}`;

/** What fnEmailTemplate reads of the look (generate.ts writes it as the query EmailStyle). */
export const EMAIL_STYLE = { colours: C, font: EMAIL_FONT, phone: PHONE };

/** The drafts that are one email: the parts of one message (split by buildDrafts), one after the other. */
function emailGroups(drafts: EmailDraft[]): number[][] {
  const groups: number[][] = [];
  drafts.forEach((draft, at) => {
    const last = groups[groups.length - 1];
    const before = last ? drafts[last[last.length - 1]!]! : undefined;
    const joins = !!before && draft.part.count > 1 && before.part.count === draft.part.count && draft.part.index === before.part.index + 1
      && before.kind === draft.kind && before.to.toLowerCase() === draft.to.toLowerCase();
    if (joins) last!.push(at); else groups.push([at]);
  });
  return groups;
}

/** The parts of the drafts of one email: two parts with the same half of a reminder and the same key are one, their lines joined. */
function joinedSections(layouts: DraftLayout[]): LayoutSection[] {
  const out: LayoutSection[] = [];
  const at = new Map<string, number>();
  for (const layout of layouts) for (const section of layout.sections) {
    const id = `${section.group}|${section.key}`;
    const known = at.get(id);
    if (known === undefined) { at.set(id, out.length); out.push({ ...section, rows: section.rows.slice() }); continue; }
    const kept = out[known]!;
    out[known] = { ...kept, rows: kept.rows.concat(section.rows), found: kept.found || section.found };
  }
  return out;
}

/** The CIs (or contracts) of the drafts of one email, each once. */
const cisOf = (drafts: EmailDraft[]): number => new Set(drafts.flatMap((draft) => draft.layout.cis)).size;

/** The subject of an email of several parts, as buildDrafts writes a subject (draftOf), for all its CIs. */
function joinedSubject(drafts: EmailDraft[], sections: LayoutSection[], ref: string): string {
  const first = drafts[0]!;
  const layout = first.layout;
  const ciCount = cisOf(drafts);
  const kinds = new Set(sections.map((section) => section.key)).size;
  const onWhat = ciCount === 1 ? layout.firstName : plural(ciCount, layout.noun);
  let topic = kinds === 1 ? `${sections[0]!.title} on ${onWhat}`
    : layout.noun === 'contract' ? `${plural(ciCount, 'contract')} ${ciCount === 1 ? 'needs' : 'need'} a correction in Solusi`
      : `${plural(ciCount, 'CI')} ${ciCount === 1 ? 'needs' : 'need'} your attention in the CMDB`;
  if (first.kind === 'reminder') topic = `Reminder: ${topic}`;
  if (first.kind === 'escalation') topic = `No answer on ${plural(ciCount, layout.noun)} of ${first.about ?? ''}`;
  return `${topic} [${ref}]`;
}

/** A CSV cell: quoted when it holds a comma, a quote or a line break; a value Excel would read as a formula starts with '. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || safe.startsWith(' ') || safe.endsWith(' ') ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The attached file: every line of every part, the part first. */
function csvOf(sections: LayoutSection[]): string {
  const contracts = sections.every((section) => section.contract);
  const head = contracts ? ['Part', 'Contract number', 'Name', 'Vendor', 'What we found'] : ['Part', ...COLUMNS, 'What we found'];
  const lines = [head];
  for (const section of sections) for (const row of section.rows) {
    if (contracts || !section.contract) lines.push([section.title, ...row]);
    // A contract in an email about CIs too: its number and name as the name, "Contract" as the class.
    else lines.push([section.title, [row[0], row[1]].filter(Boolean).join(' · '), '', 'Contract', '', '', '', '', row[3] ?? '']);
  }
  return '﻿' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** "Owned by: <b>Dee Owner</b> · Status: <b>Operational</b>": the columns with one value on every line. */
const commonLine = (pairs: Array<[string, string]>): string => pairs.length === 0 ? ''
  : `<p style="margin:0 0 6px;${F};font-size:13px;color:${C.muted}">`
    + pairs.map(([label, value]) => `${label}: <b style="color:${C.ink};font-weight:600">${escapeHtml(value)}</b>`).join(' &nbsp;·&nbsp; ') + '</p>';

const cellStyle = `padding:7px 10px;border-bottom:1px solid ${C.line};color:${C.ink}`;
const dash = `<span style="color:${C.muted}">–</span>`;

/** The table of a part: the first `rowsInEmail` lines, then how many more are in the file. */
function tableOf(section: LayoutSection, rowsInEmail: number): string {
  const rows = section.rows;
  const all = (at: number): string[] => rows.map((row) => row[at] ?? '');
  const same = (at: number): boolean => new Set(all(at)).size === 1;
  const empty = (at: number): boolean => all(at).every((value) => value === '');
  // Columns: [index in the row, label, the column "What we found"].
  const columns: Array<{ at: number; label: string; wide?: boolean; name?: boolean }> = [];
  const common: Array<[string, string]> = [];
  if (section.contract) {
    ['Contract number', 'Name', 'Vendor'].forEach((label, at) => columns.push({ at, label }));
    columns.push({ at: 3, label: 'What we found', wide: true });
  } else {
    columns.push({ at: 0, label: COLUMNS[0]!, name: true });
    if (!empty(1)) columns.push({ at: 1, label: COLUMNS[1]! });
    for (const at of [3, 4, 5, 6]) {
      const label = COLUMNS[at]!;
      // The role of the person asked is always them; an empty column says nothing; one value on every line goes above the table.
      if ((label === section.role && same(at)) || empty(at)) continue;
      if (same(at)) common.push([label, rows[0]![at]!]);
      else columns.push({ at, label });
    }
    if (section.found) columns.push({ at: 7, label: 'What we found', wide: true });
  }
  const shown = rows.slice(0, rowsInEmail);
  const more = rows.length - shown.length;
  const th = (label: string): string => `<th align="left" bgcolor="${C.head}" style="padding:7px 10px;color:${C.navy};font-weight:600;border-bottom:1px solid ${C.line}">${label}</th>`;
  const td = (row: string[], column: typeof columns[number], first: boolean): string => {
    const value = row[column.at] ?? '';
    const content = column.name
      ? `<span style="font-weight:600;color:${C.ink}">${value === '' ? '–' : escapeHtml(value)}</span>${row[2] ? `<br><span style="color:${C.muted};font-size:12px">${escapeHtml(row[2])}</span>` : ''}`
      : value === '' ? dash : escapeHtml(value);
    return `<td valign="top"${column.wide ? ' width="45%"' : ''} style="${cellStyle}"${first ? '' : ` data-l="${column.label}"`}>${content}</td>`;
  };
  const body = shown.map((row, at) => `<tr bgcolor="${at % 2 === 0 ? C.surface : C.zebra}">${columns.map((column, index) => td(row, column, index === 0)).join('')}</tr>`).join('');
  const rest = more > 0 ? `<tr><td colspan="${columns.length}" style="padding:8px 10px;color:${C.muted};font-style:italic;font-size:13px">and ${more} more in the attached file</td></tr>` : '';
  return `${commonLine(common)}<table width="100%" cellpadding="0" cellspacing="0" border="0" class="t" style="border-collapse:collapse;${F};font-size:13px;border:1px solid ${C.line}">`
    + `<tr class="h">${columns.map((column) => th(column.label)).join('')}</tr>${body}${rest}</table>`;
}

const row = (style: string, content: string, fill = ''): string => `<tr><td${fill ? ` bgcolor="${fill}"` : ''} style="${style}">${content}</td></tr>`;
const text14 = `${F};font-size:14px;line-height:21px;color:${C.ink}`;

/** One part: its number and heading, the text, the table, what we ask and why it matters. */
function sectionHtml(section: LayoutSection, number: number, numbered: boolean, rowsInEmail: number): string {
  const heading = numbered
    ? `<table cellpadding="0" cellspacing="0" border="0"><tr><td valign="top" width="26"><table cellpadding="0" cellspacing="0" border="0"><tr>`
      + `<td bgcolor="${C.navy}" width="26" height="26" align="center" style="${F};color:${C.onNavy};font-size:13px;font-weight:600;border-radius:13px">${number}</td></tr></table></td>`
      + `<td style="padding:2px 0 0 10px;${F};font-size:16px;line-height:22px;font-weight:600;color:${C.ink}">${section.heading}</td></tr></table>`
    : `<div style="${F};font-size:16px;font-weight:600;color:${C.ink}">${section.heading}</div>`;
  return row('padding:22px 28px 4px', heading)
    + (section.lead ? row(`padding:4px 28px;${text14}`, section.lead) : '')
    + row('padding:6px 28px', tableOf(section, rowsInEmail))
    + (section.ask ? row('padding:10px 28px 2px', `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="4" bgcolor="${C.navy}"></td>`
      + `<td bgcolor="${C.ask}" style="padding:10px 14px;${text14}"><b style="color:${C.navy}">What we ask</b><br>${section.ask}</td></tr></table>`) : '')
    + (section.why ? row(`padding:6px 28px 0;${F};font-size:13px;line-height:19px;color:${C.muted}`, `<b>Why it matters:</b> ${section.why}`) : '');
}

/** "In this email": the numbered parts and their lines, under the half of a reminder they are in. */
function contents(sections: LayoutSection[]): string {
  const cell = `padding:3px 0;${F};font-size:13px`;
  let group = '';
  const lines = sections.map((section, at) => {
    const head = section.group !== group ? `<tr><td colspan="2" style="padding:${at === 0 ? 4 : 8}px 0 2px;${F};font-size:12px;font-weight:600;color:${C.navy}">${escapeHtml(section.group)}</td></tr>` : '';
    group = section.group;
    return `${head}<tr><td style="${cell};color:${C.ink}">${at + 1}.&nbsp; ${section.heading}</td><td align="right" style="${cell};color:${C.muted};white-space:nowrap">${plural(section.rows.length, 'line')}</td></tr>`;
  }).join('');
  return row('padding:14px 28px 4px', `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.box}" style="border:1px solid ${C.line}"><tr><td style="padding:12px 16px">`
    + `<div style="${F};font-size:12px;color:${C.muted};font-weight:600">In this email</div><table width="100%" cellpadding="0" cellspacing="0" border="0">${lines}</table></td></tr></table>`);
}

/** The line at the foot of the email: why they get it. */
function footerOf(draft: EmailDraft): string {
  if (draft.kind === 'escalation') return 'You get this email because the person ServiceNow names for these records did not answer us. SACM changes ServiceNow only with an answer.';
  if (draft.mailbox) return 'You get this email because Procurement owns the contract data in Solusi. ServiceNow receives your corrections with the next upload.';
  if (draft.team) return 'You get this email because your team is responsible for the record of these CIs. SACM changes ServiceNow only with your answer.';
  return 'You get this email because ServiceNow names you for these records. SACM changes ServiceNow only with your answer.';
}

/** The email of the drafts of one message. `ref`: the reference of its first part. */
function emailOf(drafts: EmailDraft[], ref: string, rowsInEmail: number): Omit<Email, 'first'> {
  const first = drafts[0]!;
  const layout = first.layout;
  const sections = joinedSections(drafts.map((draft) => draft.layout));
  const kinds = new Set(sections.map((section) => section.key)).size;
  const numbered = sections.length > 1;
  const opening = layout.opening.concat(layout.why ? [kinds > 1 ? `${layout.why} We found ${plural(kinds, 'kind')} of problem.` : layout.why] : []);
  const long = sections.some((section) => section.rows.length > rowsInEmail);
  const csv = long ? csvOf(sections) : '';
  const ciCount = cisOf(drafts);
  const subject = drafts.length === 1 && first.part.count === 1 ? first.subject : joinedSubject(drafts, sections, ref);
  const summary = sections.map((section, at) => `${numbered ? `${at + 1}. ` : ''}${section.title} · ${plural(section.rows.length, 'line')}`).join('\n');

  let group = '';
  const parts = sections.map((section, at) => {
    const head = section.group !== group
      ? row('padding:26px 28px 0', `<div style="${F};font-size:13px;font-weight:600;color:${C.navy};padding-bottom:6px;border-bottom:1px solid ${C.line}">${escapeHtml(section.group)}</div>`) : '';
    group = section.group;
    return head + sectionHtml(section, at + 1, numbered, rowsInEmail);
  }).join('');
  const sender = layout.sender.trim();
  const preview = opening[1] ?? '';
  const html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<style>${PHONE}</style></head><body style="margin:0;padding:0;background:${C.page}">`
    + (preview ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${preview}</div>` : '')
    + `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}"><tr><td align="center" style="padding:16px 8px">`
    + `<table width="720" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.surface}" style="max-width:720px;width:100%;border:1px solid ${C.line}">`
    + row('padding:14px 28px', `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${F};font-size:15px;font-weight:600;color:${C.onNavy}">SACM · CMDB data quality</td>`
      + `<td align="right" style="${F};font-size:12px;color:${C.navyMuted}">Ref. ${ref}</td></tr></table>`, C.navy)
    + `<tr><td height="3" bgcolor="${C.deco}" style="font-size:0;line-height:0">&nbsp;</td></tr>`
    + row(`padding:22px 28px 0;${text14}`, opening.map((paragraph, at) => `<p style="margin:${at === opening.length - 1 ? '0' : '0 0 10px'}">${paragraph}</p>`).join(''))
    + (numbered ? contents(sections) : '')
    + parts
    + row(`padding:22px 28px 6px;${text14}`, (csv ? `<b>Attached:</b> ${ref}.csv, all ${plural(ciCount, layout.noun)} and what we found, to open in Excel.<br><br>` : '')
      + `When you reply, please keep the reference <b>[${ref}]</b> in the subject.`)
    + row(`padding:10px 28px 24px;${text14}`, `Thank you,<br>${sender ? `<b>${escapeHtml(sender)}</b><br>` : ''}${escapeHtml(layout.signature)}`)
    + row(`padding:12px 28px;${F};font-size:12px;line-height:17px;color:${C.muted};border-top:1px solid ${C.line}`, footerOf(first), C.box)
    + '</table></td></tr></table></body></html>';
  return { html, csv, summary, subject };
}

/**
 * The emails of a list of drafts, one entry per draft in the same order: the first part of a message holds the email of
 * every part, the other parts hold "" and say which draft holds them. `refOf`: the reference of a draft ("%%REF%%" in
 * the report, where the Power App puts it at Send).
 */
export function emailsOf(drafts: EmailDraft[], refOf: (at: number) => string, rowsInEmail = ROWS_IN_EMAIL): Email[] {
  const out: Email[] = new Array(drafts.length);
  for (const group of emailGroups(drafts)) {
    const email = emailOf(group.map((at) => drafts[at]!), refOf(group[0]!), rowsInEmail);
    group.forEach((at, index) => { out[at] = index === 0 ? { ...email, first: group[0]! } : { html: '', csv: '', summary: '', subject: '', first: group[0]! }; });
  }
  return out;
}
