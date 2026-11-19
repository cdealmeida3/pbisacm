// The refresh rule of the report in My workspace (build 0.52.0, D332, D333), from powerbi/apps/refresh.json, and what
// the generator writes from it. Shared capacity allows 8 refreshes of the semantic model a day, scheduled and started by
// a flow together, so the report refreshes once by its schedule in the morning, and at most once on demand in each
// window (the button Refresh now of an app or of the pages My day and Reports, or a filed reply: flows F5, F6 and F3).
// A window is used by one row of the list SACM Refreshes, whose Title (the window) is unique: so two flows never both
// refresh in one window. These functions are pure: the numbers, the windows, the words of the rule (the table About
// shows them on My day and Reports), the named formulas of the three apps, and the expressions of the gate in the flows.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
export const REFRESH_FILE = join(root, 'powerbi', 'apps', 'refresh.json');

export interface RefreshRule {
  /** The length of a window, in minutes. */
  windowMinutes: number;
  /** The start of the first window and the end of the last, in the team's time ("08:00"). */
  from: string;
  to: string;
  /** The times of the scheduled refresh, in the team's time. */
  scheduled: string[];
  /** The refreshes a day the capacity allows. */
  dailyLimit: number;
  /** The minutes before the refresh time from which the apps count a journal row as not in the report yet. */
  marginMinutes: number;
}

export const refreshRule = (file = REFRESH_FILE): RefreshRule => JSON.parse(readFileSync(file, 'utf8')) as RefreshRule;

/** The minutes after midnight of a time "HH:mm"; NaN when it is not one. */
export function minutesOf(time: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}
const timeOf = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** The start of each window, in the team's time: 08:00, 10:00, … */
export function windowStarts(rule: RefreshRule = refreshRule()): string[] {
  const out: string[] = [];
  for (let at = minutesOf(rule.from); at < minutesOf(rule.to); at += rule.windowMinutes) out.push(timeOf(at));
  return out;
}

/** The problems of the rule: times, whole windows, and the budget (at least 2 refreshes a day stay free). */
export function ruleProblems(rule: RefreshRule = refreshRule()): string[] {
  const problems: string[] = [];
  for (const [name, time] of [['from', rule.from], ['to', rule.to], ...rule.scheduled.map((time) => ['scheduled', time])] as Array<[string, string]>) {
    if (Number.isNaN(minutesOf(time))) problems.push(`Refresh: ${name} ${JSON.stringify(time)} is not a time HH:mm`);
  }
  if (!Number.isInteger(rule.windowMinutes) || rule.windowMinutes < 30) problems.push(`Refresh: windowMinutes ${rule.windowMinutes} must be a whole number of 30 or more`);
  const span = minutesOf(rule.to) - minutesOf(rule.from);
  if (!(span > 0) || span % rule.windowMinutes !== 0) problems.push(`Refresh: from ${rule.from} to ${rule.to} must be whole windows of ${rule.windowMinutes} minutes`);
  if (!rule.scheduled.length) problems.push('Refresh: no scheduled time: the report must refresh once a day on its own schedule');
  for (const time of rule.scheduled) if (minutesOf(time) >= minutesOf(rule.from)) problems.push(`Refresh: the scheduled refresh at ${time} must come before the first window (${rule.from}), after the reports arrive`);
  const used = windowStarts(rule).length + rule.scheduled.length;
  if (used > rule.dailyLimit - 2) problems.push(`Refresh: ${windowStarts(rule).length} windows and ${rule.scheduled.length} scheduled make ${used} refreshes a day; at most ${rule.dailyLimit - 2} (2 of the ${rule.dailyLimit} stay free for a retry)`);
  if (!Number.isInteger(rule.marginMinutes) || rule.marginMinutes < 0 || rule.marginMinutes > 30) problems.push(`Refresh: marginMinutes ${rule.marginMinutes} must be a whole number from 0 to 30`);
  return problems;
}

/** The length of a window in words: "2 hours", "90 minutes". */
export const windowWords = (minutes: number): string => (minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} minutes`);

/** The scheduled times in words: "07:00", "07:00 and 12:30". */
export const scheduledWords = (rule: RefreshRule = refreshRule()): string =>
  rule.scheduled.length < 2 ? rule.scheduled.join('') : `${rule.scheduled.slice(0, -1).join(', ')} and ${rule.scheduled.at(-1)}`;

/** The rule in words, as the pages My day and Reports show it under the button Refresh now (measure Refresh rule). */
export const refreshRuleText = (rule: RefreshRule = refreshRule()): string =>
  `Refresh now: once every ${windowWords(rule.windowMinutes)}, ${rule.from} to ${rule.to}. The report refreshes at ${scheduledWords(rule)}.`;

/** The M of the packed query RefreshRule, which the table About reads (AboutRows). */
export function refreshRuleM(rule: RefreshRule = refreshRule()): string {
  const text = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  return `[WindowMinutes = ${rule.windowMinutes}, From = ${text(rule.from)}, To = ${text(rule.to)}, Scheduled = {${rule.scheduled.map(text).join(', ')}}, DailyLimit = ${rule.dailyLimit}, Text = ${text(refreshRuleText(rule))}]`;
}

const fx = (text: string): string => `"${text.replace(/"/g, '""')}"`;

/**
 * The named formulas of the refresh rule that open every app (after the look, D334): the numbers of refresh.json, the time
 * of the report's data (the field Report at of the visual: the time of the refresh in UTC, which DateTimeValue turns
 * into the browser's time), the time from which a journal row is not in the report yet, and the words the button
 * Refresh now and the header line use. Each app gives PendingCount (the journal rows not in the report yet that it
 * counts), PendingWhere (where it counts them) and ReportUnknownText (the header line when the visual gives no row).
 */
export function refreshFormulas(rule: RefreshRule = refreshRule()): string {
  return [
    '// The refresh rule (D333, powerbi/apps/refresh.json): one refresh on demand in each window, from RefreshFrom to RefreshTo,',
    '// and the scheduled refresh in the morning. The times are the team\'s (the browser\'s time of the managers).',
    `RefreshWindowMinutes = ${rule.windowMinutes};`,
    `RefreshFromMinutes = ${minutesOf(rule.from)};`,
    `RefreshToMinutes = ${minutesOf(rule.to)};`,
    `RefreshFrom = ${fx(rule.from)};`,
    `RefreshTo = ${fx(rule.to)};`,
    `RefreshScheduled = ${fx(scheduledWords(rule))};`,
    `RefreshWindowWords = ${fx(windowWords(rule.windowMinutes))};`,
    `RefreshRuleText = ${fx(refreshRuleText(rule))};`,
    '// The time of the report\'s data: the field Report at of the visual (About[Report at], the refresh time in UTC as',
    '// yyyy-mm-ddThh:nn:ssZ), in the browser\'s time. Blank when the visual gives no row. A journal row from ReportSince on',
    `// is not in the report yet: the refresh reads the journal while it runs, so the ${rule.marginMinutes} minutes before count too.`,
    'ReportAt = If(IsBlank(First(PowerBIIntegration.Data).\'Report at\'), Blank(), DateTimeValue(First(PowerBIIntegration.Data).\'Report at\'));',
    `ReportSince = If(IsBlank(ReportAt), Blank(), DateAdd(ReportAt, -${rule.marginMinutes}, TimeUnit.Minutes));`,
    'ReportAtText = If(IsBlank(ReportAt), "", IsToday(ReportAt), Text(ReportAt, "hh:mm"), Text(ReportAt, "d mmm hh:mm"));',
    '// The start of the next window after now, in words: the answer when the window of now is taken.',
    'RefreshNextText = With(',
    '    { clock: Hour(Now()) * 60 + Minute(Now()) },',
    '    With(',
    '        { following: If(clock < RefreshFromMinutes, RefreshFromMinutes, RefreshFromMinutes + (RoundDown((clock - RefreshFromMinutes) / RefreshWindowMinutes, 0) + 1) * RefreshWindowMinutes) },',
    '        If(following >= RefreshToMinutes, "the next is the morning refresh at " & RefreshScheduled, "the next from " & Text(Time(RoundDown(following / 60, 0), Mod(following, 60), 0), "hh:mm"))));',
    '// The header line of the app (D334): the time of the report\'s data and the changes saved since then (PendingWhere: where',
    '// the app counts them, " on these lines" or nothing).',
    'ReportLine = If(',
    '    IsBlank(ReportAt), ReportUnknownText,',
    '    "Report data from " & ReportAtText & ". " &',
    '    If(',
    '        PendingCount = 0, "Everything saved" & PendingWhere & " is in it.",',
    '        PendingCount & If(PendingCount = 1, " change", " changes") & PendingWhere & " since then " & If(PendingCount = 1, "is", "are") & " not in it yet."));',
    '// What the button Refresh now says after the flow SACMRefresh answers (F5: started, taken, closed, refused, error).',
    `RefreshStartedText = ${fx("The report refreshes now. In about 2 minutes, press Refresh in the report's top bar to see it.")};`,
    `RefreshClosedText = ${fx(`Refresh now works from ${rule.from} to ${rule.to}. The report refreshes at ${scheduledWords(rule)}.`)};`,
    `RefreshErrorText = ${fx('The refresh could not be asked. Your work is saved. Tell the owner of the report if it happens again.')};`,
    ''
  ].join('\n');
}

/** The time zone of the team: a stand-in, Carlos writes the Windows name of the zone in the flows (tools/placeholders.json). */
export const TIME_ZONE = '<the time zone of the team>';

/** The expressions of the gate in the flows F3, F5 and F6 (powerbi/README.md §6.3), by the name of their step. */
export function gateExpressions(rule: RefreshRule = refreshRule()): Record<'Now' | 'Minutes' | 'Open' | 'Window' | 'Filter', string> {
  const from = minutesOf(rule.from);
  const to = minutesOf(rule.to);
  const step = rule.windowMinutes;
  return {
    Now: `convertFromUtc(utcNow(), '${TIME_ZONE}')`,
    Minutes: "add(mul(int(formatDateTime(outputs('Now'), 'HH')), 60), int(formatDateTime(outputs('Now'), 'mm')))",
    Open: `and(greaterOrEquals(outputs('Minutes'), ${from}), less(outputs('Minutes'), ${to}))`,
    Window: `concat(formatDateTime(outputs('Now'), 'yyyy-MM-dd'), ' ', formatDateTime(addMinutes(startOfDay(outputs('Now')), add(${from}, mul(div(sub(outputs('Minutes'), ${from}), ${step}), ${step}))), 'HH:mm'))`,
    Filter: "Title eq '@{outputs('Window')}'"
  };
}

/** The window a time of the team's day falls in, as the gate names it ("2026-11-19 10:00"), or null outside the hours. */
export function windowOf(day: string, time: string, rule: RefreshRule = refreshRule()): string | null {
  const now = minutesOf(time);
  const from = minutesOf(rule.from);
  if (now < from || now >= minutesOf(rule.to)) return null;
  return `${day} ${timeOf(from + Math.floor((now - from) / rule.windowMinutes) * rule.windowMinutes)}`;
}
