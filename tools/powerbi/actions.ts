// The actions of the Power App "SACM actions" (build B6, D294 to D296): the catalogue of powerbi/apps/actions.json, and
// the answer key of the column Actions of CaseLines: which actions the HTML app offers on each case (the case panel,
// src/app/screens/case/CasePanel.tsx), so tools/powerbi/parity.ts can compare the Power Query result (fnCaseActions)
// with it. Only invented data.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isClosedStatus, ownerAsked } from '../../src/core/cases/cases.ts';
import type { Case, CaseEvent } from '../../src/core/cases/cases.ts';
import { canMarkProcessMissing, mappingConfig, processMissing, stageOf, stagesFor } from '../../src/core/mapping/backlog.ts';
import type { MappingConfig } from '../../src/core/mapping/backlog.ts';
import type { CheckPack } from '../../src/core/model/model.ts';
import { cardKind } from '../../src/app/view/cards.ts';
import { handedToOwner } from '../../src/app/view/fix-list.ts';
import { loadPacks, loadReferences } from '../../src/hosts/cli.ts';
import { NUMBER_RANGES } from '../../src/app/state/store.ts';
import { ROWS_IN_EMAIL_RANGE } from './email.ts';
import { emailColours, FONT, lightColours } from './tokens.ts';
import { refreshFormulas } from './refresh.ts';

const root = join(import.meta.dirname, '..', '..');
export const ACTIONS_FILE = join(root, 'powerbi', 'apps', 'actions.json');

/** What a manager types or picks for an action. */
export const ASKS = ['text', 'status', 'request', 'member', 'reason', 'reviewOn', 'retireOn', 'stage'] as const;
export type Ask = typeof ASKS[number];

export interface AppAction {
  id: string;
  label: string;
  /** The type of the journal event it adds (DATA-MODEL §3). */
  type: string;
  /**
   * line: the model gives it to each case it applies to; mine: the open lines assigned to the manager; person: one person;
   * card: share out, each line to the member of its column ShareTo (D24).
   */
  scope: 'line' | 'mine' | 'person' | 'card';
  /** The fixed text of the event, when the manager types none. */
  text?: string;
  asks: Ask[];
}

export const appActions = (): AppAction[] => (JSON.parse(readFileSync(ACTIONS_FILE, 'utf8')) as { actions: AppAction[] }).actions;

/** The button of a fix list line SACM cannot fix alone (`askWhenUnsure`): "Cannot tell which one is right: ask the owner" → "Ask the owner". */
export function askWords(text: string): string {
  const at = text.lastIndexOf(': ');
  if (at < 0) return text;
  const rest = text.slice(at + 2);
  return rest.charAt(0).toLocaleUpperCase('en-GB') + rest.slice(1);
}

/** The key of the person a case is about, as the HTML app knows a person contacted (contactKeyOf): user ID, else email, lower case. */
export const personOf = (item: Case): string => item.fact.contactId || item.fact.contactEmail.toLowerCase();

export interface CaseActions {
  /** "id=Label|id=Label", in the order of the catalogue. */
  Actions: string;
  /** The labels, as the Case page shows them: "Note · Status · Assign". */
  ActionWords: string;
  /** For a case of the mapping backlog: the stages of its class, "id=Label|id=Label"; '' otherwise. */
  Stages: string;
  /** For a case of the mapping backlog: the id of its stage (the last stage event of the journal, else the first). */
  StageId: string;
}

/**
 * The actions the HTML app offers on a case (the case panel). `inLatest`: the newest report shows the finding; a case it no
 * longer shows is known by its key only (as in CaseLines), so it offers Note, and Follow again when it is not followed up.
 */
export function caseActions(item: Case, inLatest: boolean, packs: CheckPack[] = loadPacks(), config: MappingConfig | null = mappingConfig(loadReferences())): CaseActions {
  const pack = packs.find((candidate) => candidate.id === item.fact.checkId);
  const playbook = pack?.playbook;
  const state = inLatest ? item.state : '';
  const factState = inLatest ? item.fact.state ?? 'open' : '';
  const closed = isClosedStatus(item.status);
  const kind = pack ? cardKind(pack) : 'owners';
  const sacmFix = kind === 'fix' && !handedToOwner(pack, item);
  const openWork = !closed && (state === 'open' || state === 'review');
  const timeline: CaseEvent[] = item.timeline;
  const asked = ownerAsked(timeline);
  const mapping = inLatest && kind === 'mapping' && !!config;
  const canMark = mapping && canMarkProcessMissing(config!, item.fact.className, item.fact.mapping ?? []);
  const reviewAsk = !closed && !!playbook?.askAfterReview && state === 'review';
  const reviewBack = !closed && !!playbook?.askAfterReview && state !== 'review' && factState === 'review';
  const unsure = !closed && state === 'open' && !!playbook?.askWhenUnsure;
  const on: Record<string, boolean> = {
    note: true,
    status: openWork && !sacmFix,
    request: openWork && !sacmFix,
    assign: openWork,
    stop: openWork && !sacmFix,
    'follow-again': !!item.exception,
    fixed: sacmFix && !closed && state === 'open' && item.status !== 'Fixed',
    'undo-fixed': sacmFix && !closed && state === 'open' && item.status === 'Fixed',
    'ask-owner': reviewAsk || (unsure && !asked),
    'back-to-sacm': reviewBack || (unsure && asked),
    retirement: inLatest && !closed && !!playbook?.retirementDate && (state === 'open' || !!item.retireOn),
    stage: mapping && !closed,
    'no-process': canMark && !closed && !processMissing(timeline),
    'no-process-undo': canMark && !closed && processMissing(timeline)
  };
  const labelOf = (action: AppAction): string => {
    if (action.id === 'fixed' && playbook?.markWord === 'deleted') return 'Deleted';
    if (action.id === 'ask-owner' && reviewAsk) return playbook!.askAfterReview!;
    if (action.id === 'ask-owner' && unsure) return askWords(playbook!.askWhenUnsure!);
    return action.label;
  };
  const chosen = appActions().filter((action) => action.scope === 'line' && on[action.id]);
  const stages = mapping ? stagesFor(config!, item.fact.className) : [];
  return {
    Actions: chosen.map((action) => `${action.id}=${labelOf(action)}`).join('|'),
    ActionWords: chosen.map(labelOf).join(' · '),
    Stages: stages.map((stage) => `${stage.id}=${stage.label}`).join('|'),
    StageId: mapping ? stageOf(timeline, config!, item.fact.className).stage.id : ''
  };
}

/** The ids of the line actions that fnCaseActions must know: every action of the catalogue with scope 'line'. */
export const lineActionIds = (): string[] => appActions().filter((action) => action.scope === 'line').map((action) => action.id);

/* ------------------------------------------------------------------ the generated part of the app */

export const APP_FOLDER = join(root, 'powerbi', 'apps', 'sacm-actions');
/** The named formulas written by hand. */
export const FORMULAS_FILE = join(APP_FOLDER, 'formulas.fx');
/** GENERATED: every named formula of the app, to paste into App → Formulas in Power Apps Studio. */
export const APP_FORMULAS_FILE = join(APP_FOLDER, 'App-Formulas.fx');
/** GENERATED: the App of the app source, with the same formulas. */
export const APP_YAML_FILE = join(APP_FOLDER, 'Src', 'App.pa.yaml');

const fx = (text: string): string => `"${text.replace(/"/g, '""')}"`;

/**
 * The look of the three apps (design pass §7, D317): the colours of the report's theme (tokens.ts, LOOK), as named
 * formulas every control reads, and the font of the report. The same block opens App-Formulas.fx of each app.
 */
export function appLook(): string {
  const c = lightColours();
  const email = emailColours();
  const colours: Array<[string, string, string]> = [
    ['ColourNavy', c.accent!, 'the main button, the selected line, the band'],
    ['ColourNavySoft', c['accent-soft']!, 'the selected line of a list'],
    ['ColourDeco', c.deco!, 'decoration only, never a meaning (LOOK rule 5)'],
    ['ColourInk', c.ink!, 'text'],
    ['ColourMuted', c.muted!, 'the second line, a label (4.5:1 on white, LOOK rule 8)'],
    ['ColourLine', c.line!, 'borders and lines'],
    ['ColourPage', c.page!, 'behind the panels'],
    ['ColourSurface', c.surface!, 'a panel'],
    ['ColourMailPage', email.page!, 'behind the email'],
    ['ColourBlue', c.blue!, 'asked: a first message, an email sent; information (LOOK §2)'], ['ColourBlueSoft', c['blue-soft']!, ''],
    ['ColourAmber', c.amber!, 'a reminder, a warning'], ['ColourAmberSoft', c['amber-soft']!, ''],
    ['ColourRed', c.red!, 'an escalation, a problem, a value that cannot be saved'], ['ColourRedSoft', c['red-soft']!, ''],
    ['ColourViolet', c.violet!, 'a reply'], ['ColourVioletSoft', c['violet-soft']!, ''],
    ['ColourGreen', c.green!, 'OK, saved'], ['ColourGreenSoft', c['green-soft']!, ''],
    ['ColourGrey', c.grey!, 'nothing to do, not yet'], ['ColourGreySoft', c['grey-soft']!, '']
  ];
  return [
    '// The look (D317): the colours and the font of the report (tools/powerbi/tokens.ts).',
    ...colours.map(([name, hex, use]) => `${name} = ColorValue(${fx(hex)});${use ? ` // ${use}` : ''}`),
    `AppFont = ${fx(FONT)};`
  ].join('\n');
}

/**
 * The named formulas of the app: the catalogue of actions.json (ActionCatalog), the statuses a manager can set, by their
 * words (StatusChoices, Value the word and Status the journal's name: every status but Verified and Not followed up, as the status menu of the HTML app), the reasons to
 * stop following (ExceptionReasons, D85) and the months to the review date (ExceptionMonths, D86), then formulas.fx.
 */
export function appFormulas(statuses: readonly string[], statusWord: (status: string) => string, reasons: readonly string[], months: number): string {
  const actions = appActions().map((action, at) =>
    `    { Id: ${fx(action.id)}, Label: ${fx(action.label)}, Type: ${fx(action.type)}, Text: ${fx(action.text ?? '')}, Asks: ${fx(action.asks.join(','))}, Scope: ${fx(action.scope)}, Order: ${at + 1} }`);
  const choices = statuses.filter((status) => status !== 'Verified' && status !== 'Not followed up').map((status) => `    { Value: ${fx(statusWord(status))}, Status: ${fx(status)} }`);
  return [
    '// GENERATED by npm run powerbi:generate from powerbi/apps/actions.json, powerbi/apps/refresh.json, src/core/ and powerbi/apps/sacm-actions/formulas.fx.',
    '// Paste all of it into App → Formulas in Power Apps Studio (powerbi/README.md §6). Change formulas.fx or actions.json, never this file.',
    '',
    appLook(),
    '',
    refreshFormulas(),
    `ActionCatalog = Table(\n${actions.join(',\n')}\n);`,
    `StatusChoices = Table(\n${choices.join(',\n')}\n);`,
    `ExceptionReasons = [${reasons.map(fx).join(', ')}];`,
    '// The months to the review date of a decision to stop following: the last row of exceptionMonths in SACM Settings (the',
    '// Settings screen of the app SACM audit, build B8, D308), a whole number in its range (D158), else the default.',
    `ExceptionMonths = With({ raw: Trim(Last(Filter('SACM Settings', Title = "exceptionMonths")).Value) }, If(IsMatch(raw, "\\d+") && Value(raw) >= ${NUMBER_RANGES.exceptionMonths.min} && Value(raw) <= ${NUMBER_RANGES.exceptionMonths.max}, Value(raw), ${months}));`,
    '',
    readFileSync(FORMULAS_FILE, 'utf8').replace(/\r\n/g, '\n').trimEnd(),
    ''
  ].join('\n');
}

/** The App of the app source (schema pa-yaml v3.0): its named formulas and the screen it opens on. */
export function appYaml(formulas: string, app = 'SACM actions', startScreen = 'ActionsScreen', sources = 'powerbi/apps/actions.json or formulas.fx'): string {
  // Without the two lines that say where to paste it.
  const lines = formulas.trimEnd().split('\n');
  const first = lines.findIndex((line) => line.trim() !== '' && !line.startsWith('//'));
  const body = lines.slice(first).map((line) => (line ? `      ${line}` : '')).join('\n');
  return [
    `# GENERATED by npm run powerbi:generate (tools/powerbi/actions.ts). The App of the Power App "${app}": the same named`,
    `# formulas as App-Formulas.fx. Change ${sources}, never this file.`,
    'App:',
    '  Properties:',
    '    Formulas: |-',
    `      =${body.trimStart()}`,
    `    StartScreen: =${startScreen}`,
    ''
  ].join('\n');
}

/* ------------------------------------------------------------------ the Power App "SACM messages" (build B7) */

export const MESSAGES_FOLDER = join(root, 'powerbi', 'apps', 'sacm-messages');
/** The named formulas written by hand. */
export const MESSAGES_FORMULAS_FILE = join(MESSAGES_FOLDER, 'formulas.fx');
/** GENERATED: every named formula of the app, to paste into App → Formulas in Power Apps Studio. */
export const MESSAGES_APP_FORMULAS_FILE = join(MESSAGES_FOLDER, 'App-Formulas.fx');
/** GENERATED: the App of the app source, with the same formulas. */
export const MESSAGES_APP_YAML_FILE = join(MESSAGES_FOLDER, 'Src', 'App.pa.yaml');
/* ------------------------------------------------------------------ the Power App "SACM audit" (build B8) */

export const AUDIT_FOLDER = join(root, 'powerbi', 'apps', 'sacm-audit');
/** The named formulas written by hand. */
export const AUDIT_FORMULAS_FILE = join(AUDIT_FOLDER, 'formulas.fx');
/** GENERATED: every named formula of the app, to paste into App → Formulas in Power Apps Studio. */
export const AUDIT_APP_FORMULAS_FILE = join(AUDIT_FOLDER, 'App-Formulas.fx');
/** GENERATED: the App of the app source, with the same formulas. */
export const AUDIT_APP_YAML_FILE = join(AUDIT_FOLDER, 'Src', 'App.pa.yaml');
/** The folders of the three Power Apps, for the lint. */
export const APP_FOLDERS = [APP_FOLDER, MESSAGES_FOLDER, AUDIT_FOLDER];

/**
 * The numbers of the team settings: the six of the Settings screen of the HTML app, in its order, then the lines a
 * table of an email shows (rowsInEmail, D314: only the Power BI report has it).
 */
export const SETTING_ORDER = ['reminderDays', 'maxReminders', 'exceptionMonths', 'staleDays', 'underRetirementDays', 'readyDays', 'rowsInEmail'] as const;
/** The words of rowsInEmail on the Settings tab of the app SACM audit and in its journal line. */
export const ROWS_IN_EMAIL_LABEL = 'Lines a table of an email shows before the attached file';

/**
 * The named formulas of the app SACM audit (D306, D308): the look, the numbers of the settings with their words
 * (SETTING_LABELS of the HTML app, which its journal line uses too), ranges and defaults (D158; rowsInEmail of D314), and
 * the results of the lifecycle review (reference/lifecycle), then formulas.fx.
 */
export function auditFormulas(labels: Record<string, string>, defaults: Record<string, number>, results: Array<{ id: string; label: string }>): string {
  const settings = SETTING_ORDER.map((key, at) => {
    const range = key === 'rowsInEmail' ? ROWS_IN_EMAIL_RANGE : { ...NUMBER_RANGES[key], default: defaults[key] };
    const label = key === 'rowsInEmail' ? ROWS_IN_EMAIL_LABEL : labels[key] ?? key;
    return `    { Key: ${fx(key)}, Label: ${fx(label)}, Min: ${range.min}, Max: ${range.max}, Default: ${range.default}, Order: ${at + 1} }`;
  });
  return [
    '// GENERATED by npm run powerbi:generate from src/app/state/store.ts, tools/powerbi/email.ts, checks/reference/lifecycle.json, powerbi/apps/refresh.json and powerbi/apps/sacm-audit/formulas.fx.',
    '// Paste all of it into App → Formulas in Power Apps Studio (powerbi/README.md §6.8). Change formulas.fx, never this file.',
    '',
    appLook(),
    '',
    refreshFormulas(),
    `SettingCatalog = Table(\n${settings.join(',\n')}\n);`,
    `ReviewResults = Table(\n${results.map((result) => `    { Id: ${fx(result.id)}, Label: ${fx(result.label)} }`).join(',\n')}\n);`,
    '',
    readFileSync(AUDIT_FORMULAS_FILE, 'utf8').replace(/\r\n/g, '\n').trimEnd(),
    ''
  ].join('\n');
}

/** The named formulas of the app SACM messages (D301): the look and formulas.fx, with the two lines that say where to paste them. */
export function messagesFormulas(): string {
  return [
    '// GENERATED by npm run powerbi:generate from tools/powerbi/tokens.ts, powerbi/apps/refresh.json and powerbi/apps/sacm-messages/formulas.fx.',
    '// Paste all of it into App → Formulas in Power Apps Studio (powerbi/README.md §6.6). Change formulas.fx, never this file.',
    '',
    appLook(),
    '',
    refreshFormulas(),
    readFileSync(MESSAGES_FORMULAS_FILE, 'utf8').replace(/\r\n/g, '\n').trimEnd(),
    ''
  ].join('\n');
}
