// The rules of the Power Apps "SACM actions" and "SACM messages" and of their flows (builds B6 and B7, D294 to D296,
// D301), as pure functions: npm test runs them on the catalogue and the flows (tests/tools/powerbi/app-rules.test.ts);
// npm run powerbi:lint runs them on what Microsoft's Power Fx library reads from the app source too
// (tools/powerbi/powerfx-check/, needs .NET 8).
//   - The apps only ADD rows to the list SACM Journal (D272): Patch('SACM Journal', Defaults('SACM Journal'), { … }), with
//     columns of the list; the app SACM audit also adds rows to SACM Settings (its Settings screen, build B8, D308) the
//     same way. They never change, remove or clear a row of any list of the team, and write no other list.
//   - The apps call no connector but the flows of powerbi/apps/flows.json with the trigger Power Apps (V2).
//   - The apps run the refresh flow (SACMRefresh) only from their button Refresh now (a control named RefreshButton): no
//     Save refreshes (D332).
//   - The flows refresh through the gate (D333: a row in SACM Refreshes, whose Title is the window, before every refresh,
//     with the expressions of tools/powerbi/refresh.ts), file a report or a reply, or send exactly what a manager pressed Send or Test on: the
//     To, Cc, Subject, Body and file of a sending step are the inputs of its trigger (a test goes to the manager who ran
//     it). A flow that starts on a new email never sends; none runs on a timer (D2, D269). The flow of the button Outlook
//     draft (F7, D315) only makes a draft in the manager's own Drafts (POST to /me/messages, never /send) and answers the
//     app with its link: it sends nothing.
//   - The apps use the modern controls (D317): a control is one of MODERN_CONTROLS, with only the properties Microsoft
//     gives it (so a pasted app has no unknown property), or one of the few classic controls that have no modern one.
//   - The catalogue (powerbi/apps/actions.json): unique ids, journal types the model reads, scopes and asks the app knows,
//     labels the column Actions can hold; every action of scope line is one fnCaseActions gives, and the other way round.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASKS, appActions } from './actions.ts';
import type { AppAction } from './actions.ts';
import { STATE_LISTS } from './history.ts';
import type { EventType } from '../../src/core/cases/cases.ts';
import { gateExpressions } from './refresh.ts';

const root = join(import.meta.dirname, '..', '..');
export const FLOWS_FILE = join(root, 'powerbi', 'apps', 'flows.json');

/** The journal types of DATA-MODEL §3 (EventType of src/core/cases/cases.ts) that the model reads. */
export const JOURNAL_TYPES: EventType[] = ['note', 'status', 'assign', 'request', 'message', 'report', 'handover', 'person-note', 'exception', 'settings', 'review', 'reviewed', 'retirement', 'stage', 'no-process'];
const LISTS = Object.values(STATE_LISTS).map((list) => list.list as string);
const JOURNAL = STATE_LISTS.journal.list as string;
const JOURNAL_COLUMNS = new Set<string>(STATE_LISTS.journal.columns);
/** The lists an app may add rows to, each with its columns. */
const ADD_ONLY = new Map<string, Set<string>>([
  [JOURNAL, JOURNAL_COLUMNS],
  [STATE_LISTS.settings.list as string, new Set<string>(STATE_LISTS.settings.columns)]
]);
/** Functions that change or remove what a data source holds. Only Patch with Defaults (a new row) is allowed. */
const WRITERS = new Set(['Patch', 'Collect', 'ClearCollect', 'Clear', 'Remove', 'RemoveIf', 'Update', 'UpdateIf', 'SubmitForm']);

export interface Flow { id: string; name: string; purpose: string; trigger: string; inputs?: string[]; outputs?: string[]; triggerFields?: Record<string, string>; concurrency: number; steps: Array<{ action: string; connector: string; fields: Record<string, string>; if?: string; runAfter?: string[]; forEach?: string }> }
export const appFlows = (): Flow[] => (JSON.parse(readFileSync(FLOWS_FILE, 'utf8')) as { flows: Flow[] }).flows;

/** The flow that refreshes the report on demand (F5), and where an app may run it: the OnSelect of its button Refresh now. */
const REFRESH_FLOW = 'SACMRefresh';
const REFRESH_BUTTON = /\/RefreshButton\/Properties\/OnSelect$/;

/** One call of a formula, as tools/powerbi/powerfx-check gives it. */
export interface Call { name: string; namespace: string | null; source: string | null; second: string | null; fields: string[] }
export interface Formula { file: string; where: string; text: string; errors: string[]; calls: Call[] }

/** The problems of the calls of the app's formulas. */
export function callProblems(formulas: Formula[], flows: Flow[] = appFlows()): string[] {
  const problems: string[] = [];
  const appFlowNames = new Set(flows.filter((flow) => flow.trigger === 'Power Apps (V2)').map((flow) => flow.name));
  for (const formula of formulas) {
    const where = `${formula.file.replace(/^.*powerbi\//, 'powerbi/')} ${formula.where}`;
    for (const error of formula.errors) problems.push(`App: ${where} does not parse: ${error}`);
    for (const call of formula.calls) {
      if (call.namespace) {
        if (!(call.name === 'Run' && appFlowNames.has(call.namespace))) problems.push(`App: ${where} calls ${call.namespace}.${call.name}: the app may only run the flows of powerbi/apps/flows.json with the trigger Power Apps (V2)`);
        else if (call.namespace === REFRESH_FLOW && !REFRESH_BUTTON.test(formula.where)) problems.push(`App: ${where} runs ${REFRESH_FLOW}: only the button Refresh now (a control named RefreshButton, its OnSelect) refreshes the report; a Save never does (D332)`);
        continue;
      }
      if (!WRITERS.has(call.name) || !call.source) continue;
      if (!LISTS.includes(call.source)) { problems.push(`App: ${where} writes to ${call.source}, which is not a list of the team`); continue; }
      const columns = ADD_ONLY.get(call.source);
      if (call.name !== 'Patch' || !columns || call.second !== 'Defaults') {
        problems.push(`App: ${where} uses ${call.name}(${call.source}, …): the apps only add rows to ${Array.from(ADD_ONLY.keys()).join(' and ')}, with Patch(<list>, Defaults(<list>), { … }) (D272)`);
        continue;
      }
      if (call.source !== JOURNAL && !/sacm-audit/.test(formula.file)) problems.push(`App: ${where} adds a row to ${call.source}: only the Settings screen of the app SACM audit does (D308)`);
      for (const field of call.fields) if (!columns.has(field)) problems.push(`App: ${where} writes the column ${field}, which ${call.source} does not have (powerbi/README.md §5)`);
    }
  }
  if (!formulas.some((formula) => formula.calls.some((call) => call.name === 'Patch' && call.source === JOURNAL))) problems.push(`App: no formula adds a row to ${JOURNAL}`);
  return problems;
}

/** The problems of the catalogue. `fnCaseActions` is the M of the query fnCaseActions. */
export function catalogueProblems(actions: AppAction[] = appActions(), fnCaseActions = ''): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const action of actions) {
    if (ids.has(action.id)) problems.push(`Actions: the id ${action.id} is there twice`);
    ids.add(action.id);
    if (!/^[a-z][a-z-]*$/.test(action.id)) problems.push(`Actions: the id "${action.id}" is not lower-case words with "-"`);
    if (!(JOURNAL_TYPES as string[]).includes(action.type)) problems.push(`Actions: ${action.id} adds the type ${action.type}, which the journal does not know (DATA-MODEL §3)`);
    // A message is recorded by the app SACM messages when it goes (D301), never as an action of SACM actions.
    if (action.type === 'message' || action.type === 'report' || action.type === 'settings' || action.type === 'review') problems.push(`Actions: ${action.id} adds a ${action.type} event: not an action of the app SACM actions`);
    if (!['line', 'mine', 'person', 'card'].includes(action.scope)) problems.push(`Actions: ${action.id} has the scope ${action.scope}`);
    if (action.scope === 'card' && action.type !== 'assign') problems.push(`Actions: ${action.id} has the scope card: only share out (assign events) gives each line its own member`);
    for (const ask of action.asks) if (!(ASKS as readonly string[]).includes(ask)) problems.push(`Actions: ${action.id} asks for ${ask}, which the app does not know`);
    if (/[|=]/.test(action.label)) problems.push(`Actions: the label of ${action.id} holds | or =, which the column Actions uses`);
    if (!action.text && !action.asks.length && action.scope !== 'card') problems.push(`Actions: ${action.id} has no text and asks for nothing`);
  }
  if (fnCaseActions) {
    const known = new Set([...fnCaseActions.matchAll(/^\s*(?:#"([a-z-]+)"|([a-z]+))\s*=\s/gm)].map((match) => match[1] ?? match[2]!));
    const line = actions.filter((action) => action.scope === 'line').map((action) => action.id);
    for (const id of line) if (!known.has(id)) problems.push(`Actions: fnCaseActions does not say when a line has ${id}`);
    const onRecord = fnCaseActions.slice(fnCaseActions.indexOf('on = [') + 'on = ['.length, fnCaseActions.indexOf('],', fnCaseActions.indexOf('on = [')));
    for (const match of onRecord.matchAll(/^\s*(?:#"([a-z-]+)"|([a-z]+))\s*=\s/gm)) {
      const id = match[1] ?? match[2]!;
      if (!line.includes(id)) problems.push(`Actions: fnCaseActions gives ${id}, which is no action of scope line in actions.json`);
    }
  }
  return problems;
}

const TRIGGERS = new Set(['Power Apps (V2)', 'Power BI button clicked', 'When a new email arrives in a shared mailbox (V2)']);
const MAILBOX_TRIGGER = 'When a new email arrives in a shared mailbox (V2)';
const SEND = 'Send an email from a shared mailbox (V2)';
/** The draft of the button Outlook draft (F7, D315): Microsoft Graph through the Office 365 Outlook connector. */
const DRAFT = 'Send an HTTP request';
const RESPOND = 'Respond to a PowerApp or flow';
/** The only request a flow may make: a new message in the Drafts of the person who runs it (never /send or /sendMail). */
export const DRAFT_REQUEST = { URI: 'https://graph.microsoft.com/v1.0/me/messages', Method: 'POST', Body: '=input Message with the file Csv and the shared SACM mailbox as From', ContentType: 'application/json' };
/** The steps of the gate (D333) and of filing; no Delay any more: the gate keeps refreshes apart, and the app would wait. */
const STEPS = new Set(['Refresh a dataset', 'Compose', 'Condition', 'Get items', 'Terminate', 'Create file', 'Html to text', 'Create item', SEND, DRAFT, RESPOND]);
const REFRESH = 'Refresh a dataset';
/** The list of the gate: one row per window used, Title unique (D333). The flows add rows with these fields only. */
const REFRESHES = 'SACM Refreshes';
const REFRESH_FIELDS = new Set(['List Name', 'Title', 'By', 'Source']);
/** The workspace of every refresh: Carlos's own (D331). */
const WORKSPACE = 'My workspace';
/** The fields of a sending step and the input of the trigger each must be. To of a test: the manager who ran the flow. */
const SEND_FIELDS: Record<string, { input: string; or?: string; optional?: boolean }> = {
  To: { input: 'To', or: '=the user who ran it' }, CC: { input: 'Cc', optional: true }, BCC: { input: 'Bcc', optional: true },
  Subject: { input: 'Subject' }, Body: { input: 'Body' },
  // The CSV file of a long email (D314): the text the app gives, under the name the app gives; none when it is empty.
  Attachments: { input: 'Csv as the file FileName', optional: true }
};
/** The other fields a sending step may set: the shared mailbox it sends from, and the importance. */
const SEND_OTHER = new Set(['Original Mailbox Address', 'Importance']);
const REPLIES = STATE_LISTS.replies.list as string;

/**
 * The names a SharePoint list already has for columns of its own, most of them hidden (D338): a column of that name
 * cannot be made ("already exists"), and showing the hidden one gives the wrong column (Type is the file icon). Title is
 * the one the lists use as it is. Compared without case and spaces.
 */
export const SHAREPOINT_NAMES = ['ID', 'Title', 'Type', 'Name', 'Path', 'Order', 'Level', 'Version', 'Created', 'Modified', 'Author', 'Editor',
  'Created By', 'Modified By', 'Attachments', 'Edit', 'Select', 'Content Type', 'ContentType', 'Item Type', 'File Type', 'DocIcon',
  'Item Child Count', 'Folder Child Count', 'App Created By', 'App Modified By', 'Compliance Asset Id', 'Color Tag', 'Label setting',
  'Retention label', 'Sensitivity', 'Encoded Absolute URL', 'URL Path', 'Unique Id', 'Property Bag', 'Server Relative URL',
  'Effective Permissions Mask', 'Is Current Version', 'Workflow Version', 'Workflow Instance ID', 'Instance ID', 'Restricted',
  'Approval Status', 'Approver Comments', 'Sort Type', 'Client Id', 'ProgId', 'HTML File Type', 'Has Copy Destinations', 'Copy Source',
  'UI Version', 'ScopeId', 'owshiddenversion', 'FileRef', 'FileLeafRef', 'FileDirRef', 'GUID', 'MetaInfo', 'LinkTitle'];

/** The problems of the column names of the lists (D338): every column but Title must be a name SharePoint does not have. */
export function columnProblems(lists: Record<string, { list: string; columns: readonly string[] }> = STATE_LISTS, flows: Flow[] = appFlows()): string[] {
  const own = new Set(SHAREPOINT_NAMES.map((name) => name.replace(/\s/g, '').toLowerCase()));
  const columns = new Map<string, Set<string>>();
  const add = (list: string, column: string): void => { columns.set(list, (columns.get(list) ?? new Set()).add(column)); };
  for (const spec of Object.values(lists)) for (const column of spec.columns) add(spec.list, column);
  for (const column of REFRESH_FIELDS) if (column !== 'List Name') add(REFRESHES, column);
  for (const flow of flows) for (const step of flow.steps) {
    const list = step.fields['List Name'];
    if (step.action === 'Create item' && list) for (const field of Object.keys(step.fields)) if (field !== 'List Name' && field !== 'Site Address') add(list, field);
  }
  const problems: string[] = [];
  for (const [list, names] of columns) for (const column of names) {
    if (column !== 'Title' && own.has(column.replace(/\s/g, '').toLowerCase())) problems.push(`Lists: the column ${column} of ${list} has the name of a column SharePoint has already (D338): choose another name`);
  }
  return problems;
}

/** The problems of the flows: what triggers them and what they do. */
export function flowProblems(flows: Flow[] = appFlows()): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  for (const flow of flows) {
    if (names.has(flow.name)) problems.push(`Flows: the name ${flow.name} is there twice`);
    names.add(flow.name);
    if (!TRIGGERS.has(flow.trigger)) problems.push(`Flows: ${flow.id} starts on "${flow.trigger}": a flow starts on a button, the app or a new email, never on a timer (D2, D269)`);
    // Power Automate refuses concurrency control on a flow that answers the app (Respond is synchronous: the error
    // InvalidConcurrencyConfiguration, D337). Those flows run with it off: F5 is locked by the gate, F7 only makes a draft.
    const answers = flow.steps.some((step) => step.action === RESPOND);
    if (answers && flow.concurrency !== 0) problems.push(`Flows: ${flow.id} answers the app, so its concurrency control must be off (0): Power Automate refuses it with a Respond step (D337)`);
    if (!answers && flow.concurrency !== 1) problems.push(`Flows: ${flow.id} must run one at a time (concurrency 1), so two runs never overlap`);
    if (flow.inputs?.length && flow.trigger !== 'Power Apps (V2)') problems.push(`Flows: ${flow.id} has inputs, but only a flow the app calls (Power Apps (V2)) gets them`);
    const sends = flow.steps.filter((step) => step.action === SEND);
    const drafts = flow.steps.filter((step) => step.action === DRAFT);
    for (const step of flow.steps) {
      if (!STEPS.has(step.action)) problems.push(`Flows: ${flow.id} has the step "${step.action}": a flow refreshes through the gate of the refresh rule, files a report or a reply, or sends what a manager pressed Send on`);
      else if (step.action !== SEND && step.action !== DRAFT && /send|post|message|reply|forward/i.test(step.action)) problems.push(`Flows: ${flow.id} sends something ("${step.action}")`);
      if (step.action === RESPOND && flow.trigger !== 'Power Apps (V2)') problems.push(`Flows: ${flow.id} answers a Power App, but the app does not start it`);
      const list = step.fields['List Name'];
      if (step.action === 'Create item' && list === REFRESHES) {
        for (const field of Object.keys(step.fields)) if (!REFRESH_FIELDS.has(field)) problems.push(`Flows: ${flow.id} adds the field ${field} to ${REFRESHES}: only Title (the window), By and Source`);
        if (step.fields.Title !== '=output Window') problems.push(`Flows: ${flow.id} adds to ${REFRESHES} the Title "${step.fields.Title ?? ''}": it must be the window (=output Window), the lock of the gate`);
      } else if (step.action === 'Create item') {
        if (list !== REPLIES) problems.push(`Flows: ${flow.id} adds an item to ${list ?? 'a list'}: a flow only files replies in ${REPLIES} (the journal is the managers' own, D272) and the windows of the gate in ${REFRESHES}`);
        if (flow.trigger !== MAILBOX_TRIGGER) problems.push(`Flows: ${flow.id} files a reply, but does not start on a new email`);
      }
      if (step.action === 'Get items' && list !== REFRESHES) problems.push(`Flows: ${flow.id} reads ${list ?? 'a list'}: a flow only reads ${REFRESHES} (who used the window)`);
      if (step.action === RESPOND && flow.outputs) {
        const keys = Object.keys(step.fields);
        if (keys.join() !== flow.outputs.join()) problems.push(`Flows: ${flow.id} answers the app with ${keys.join(', ') || 'nothing'}: every answer must give the outputs ${flow.outputs.join(', ')}, in this order`);
      }
      if (step.action === REFRESH && step.fields.Workspace !== WORKSPACE) problems.push(`Flows: ${flow.id} refreshes in the workspace "${step.fields.Workspace ?? ''}": the report is in ${WORKSPACE} (D331)`);
    }
    problems.push(...gateProblems(flow));
    if (drafts.length) {
      // The Outlook draft (D315): started by the button of the app, one draft a run, exactly the request of DRAFT_REQUEST.
      if (flow.trigger !== 'Power Apps (V2)') problems.push(`Flows: ${flow.id} makes a draft, but does not start when a manager presses Outlook draft in the app (Power Apps (V2))`);
      if (sends.length) problems.push(`Flows: ${flow.id} makes a draft and sends: the button Outlook draft sends nothing`);
      if (drafts.length > 1 || drafts.some((step) => step.forEach)) problems.push(`Flows: ${flow.id} must make one draft a run`);
      const inputs = new Set(flow.inputs ?? []);
      for (const name of ['Message', 'Csv']) if (!inputs.has(name)) problems.push(`Flows: ${flow.id} has no input ${name}: the draft is the email the manager sees in the app`);
      for (const step of drafts) {
        if (step.connector !== 'Office 365 Outlook') problems.push(`Flows: ${flow.id} makes the draft with ${step.connector}: use the Office 365 Outlook connector, as the manager signed in`);
        for (const [field, value] of Object.entries(DRAFT_REQUEST)) {
          if (step.fields[field] !== value) problems.push(`Flows: ${flow.id} makes the draft with ${field} "${step.fields[field] ?? ''}": it must be "${value}" (a new message in the manager's own Drafts, never /send)`);
        }
        for (const field of Object.keys(step.fields)) if (!(field in DRAFT_REQUEST)) problems.push(`Flows: ${flow.id} makes the draft with the field ${field}`);
      }
      continue;
    }
    if (sends.length) {
      // Sending: only what a manager pressed in the app, one message a run, exactly as the app gives it (D2, D301).
      if (flow.trigger !== 'Power Apps (V2)') problems.push(`Flows: ${flow.id} sends, but does not start when a manager presses a button in the app (Power Apps (V2)): nothing is sent on its own (D2)`);
      if (sends.length > 1 || sends.some((step) => step.forEach)) problems.push(`Flows: ${flow.id} must send one message a run`);
      const inputs = new Set(flow.inputs ?? []);
      for (const step of sends) {
        for (const [field, rule] of Object.entries(SEND_FIELDS)) {
          const value = step.fields[field];
          if (value === undefined) { if (!rule.optional) problems.push(`Flows: ${flow.id} sends with no ${field}`); continue; }
          // A test goes to the manager who ran the flow: only a flow that is given no To may send there.
          if (value === rule.or && !inputs.has(rule.input)) continue;
          const needs = field === 'Attachments' ? ['Csv', 'FileName'] : [rule.input];
          if (value !== `=input ${rule.input}` || needs.some((input) => !inputs.has(input))) problems.push(`Flows: ${flow.id} sends with ${field} "${value}": it must be the input ${rule.input} of the trigger, exactly what the manager sends`);
        }
        for (const field of Object.keys(step.fields)) {
          if (!(field in SEND_FIELDS) && !SEND_OTHER.has(field)) problems.push(`Flows: ${flow.id} sends with the field ${field}: a message of the app has only To, Cc, Subject, Body and its file`);
        }
      }
      continue;
    }
    const files = flow.steps.some((step) => step.action === 'Create file' || (step.action === 'Create item' && step.fields['List Name'] === REPLIES));
    const refreshes = flow.steps.some((step) => step.action === REFRESH);
    if (!refreshes && !files) problems.push(`Flows: ${flow.id} does not refresh the report, file a report or file a reply`);
    if (refreshes && flow.steps.some((step) => step.action === 'Create file')) problems.push(`Flows: ${flow.id} files reports and refreshes: a new report waits for the morning refresh or Refresh now (D332)`);
  }
  return problems;
}

/** What F5 answers the app (README §6.5). */
const REFRESH_RESULTS = ['started', 'taken', 'closed', 'refused', 'error'];

/**
 * The gate of a flow that refreshes (D333): before the refresh, the steps Now, Minutes, Open and Window with the
 * expressions of refresh.ts, then a row in SACM Refreshes whose Title is the window, and the refresh only when that row
 * was made (the Title is unique, so a second flow in the same window cannot make it). No Delay: the app gets its answer at once.
 */
export function gateProblems(flow: Flow, expected = gateExpressions()): string[] {
  const problems: string[] = [];
  const refresh = flow.steps.findIndex((step) => step.action === REFRESH);
  if (refresh < 0) return problems;
  if (flow.steps.filter((step) => step.action === REFRESH).length > 1) problems.push(`Flows: ${flow.id} refreshes twice: one refresh a run`);
  const named = (name: string) => flow.steps.findIndex((step) => step.fields.Name === name);
  for (const name of ['Now', 'Minutes', 'Window'] as const) {
    const at = named(name);
    if (at < 0 || at > refresh || flow.steps[at]!.action !== 'Compose') { problems.push(`Flows: ${flow.id} refreshes without the step ${name} of the gate (Compose) before it`); continue; }
    if (flow.steps[at]!.fields.Inputs !== expected[name]) problems.push(`Flows: ${flow.id} the step ${name} is "${flow.steps[at]!.fields.Inputs}": it must be ${expected[name]} (tools/powerbi/refresh.ts, from refresh.json)`);
  }
  const open = named('Open');
  if (open < 0 || open > refresh || flow.steps[open]!.action !== 'Condition') problems.push(`Flows: ${flow.id} refreshes without the condition Open of the gate before it`);
  else if (flow.steps[open]!.fields.Expression !== expected.Open) problems.push(`Flows: ${flow.id} the condition Open is "${flow.steps[open]!.fields.Expression}": it must be ${expected.Open} (the hours of refresh.json)`);
  const lock = flow.steps.findIndex((step) => step.action === 'Create item' && step.fields['List Name'] === REFRESHES);
  if (lock < 0 || lock > refresh) problems.push(`Flows: ${flow.id} refreshes without first adding the window to ${REFRESHES} (the lock of the gate, D333)`);
  else if (!/^Create item\b.*\bis successful$/.test(flow.steps[refresh]!.if ?? '')) problems.push(`Flows: ${flow.id} refreshes even when the window is taken: run it only after the Create item in ${REFRESHES} is successful`);
  for (const step of flow.steps.filter((entry) => entry.action === 'Get items')) {
    if (step.fields['Filter Query'] !== expected.Filter) problems.push(`Flows: ${flow.id} looks for the window with "${step.fields['Filter Query']}": it must be ${expected.Filter}`);
  }
  if (flow.trigger === 'Power Apps (V2)') {
    const answers = new Set(flow.steps.filter((step) => step.action === RESPOND).map((step) => step.fields.Result));
    for (const result of REFRESH_RESULTS) if (!answers.has(result)) problems.push(`Flows: ${flow.id} never answers the app ${result}`);
  }
  return problems;
}

/** What the refresh flow answers the app (F5, D333). */

/* ------------------------------------------------------------------ the controls of the apps (D317) */

/** What every control has: place, size, whether it shows, and its words for a screen reader. */
const BASE = ['X', 'Y', 'Width', 'Height', 'Visible', 'DisplayMode', 'AccessibleLabel', 'Tooltip', 'ContentLanguage', 'OnSelect'];
/** The text and border properties of the modern controls (the names of their update of February 2026). */
const MODERN_TEXT = ['BasePaletteColor', 'Font', 'Size', 'Color', 'FontWeight', 'Italic', 'Underline', 'Strikethrough',
  'BorderColor', 'BorderStyle', 'BorderThickness', 'RadiusTopLeft', 'RadiusTopRight', 'RadiusBottomLeft', 'RadiusBottomRight',
  'PaddingTop', 'PaddingBottom', 'PaddingLeft', 'PaddingRight'];
/**
 * The modern controls the apps use (Fluent 2, D317), each with the properties Microsoft's page of the control gives
 * (learn.microsoft.com, modern controls, 2026). The version is written, so Power Apps Studio makes exactly this control
 * when the YAML is pasted, whatever comes later.
 */
export const MODERN_CONTROLS: Record<string, string[]> = {
  'ModernButton@1.0.0': [...BASE, ...MODERN_TEXT, 'Text', 'Align', 'VerticalAlign', 'Appearance', 'Icon', 'IconStyle', 'IconRotation', 'Layout'],
  'ModernTextInput@1.0.0': [...BASE, ...MODERN_TEXT, 'Default', 'Placeholder', 'Type', 'TriggerOutput', 'MaxLength', 'Required', 'ValidationState', 'OnChange', 'Align', 'Appearance', 'Fill'],
  'ModernCheckbox@1.0.0': [...BASE, ...MODERN_TEXT, 'Label', 'Checked', 'OnCheck', 'OnUncheck'],
  'ModernTabList@1.0.0': [...BASE, ...MODERN_TEXT, 'Items', 'Default', 'OnChange', 'Align', 'Alignment', 'Appearance'],
  'ModernDropdown@1.0.0': [...BASE, ...MODERN_TEXT, 'Items', 'Default', 'ItemDisplayText', 'Required', 'ValidationState', 'OnChange', 'Appearance'],
  'ModernDatePicker@1.0.0': [...BASE, ...MODERN_TEXT, 'DefaultDate', 'Placeholder', 'Format', 'StartDate', 'EndDate', 'StartOfWeek', 'OnChange']
};
/**
 * The classic controls that stay (D317): Power Apps has no modern list (gallery), HTML viewer or shape, and a label
 * of a gallery or a panel stays a classic label (the modern Text has no scroll).
 */
export const CLASSIC_KEPT = new Set(['Label', 'Gallery', 'HtmlViewer', 'Rectangle']);

interface Control { Control?: string; Properties?: Record<string, unknown>; Children?: Array<Record<string, Control>> }

/** The problems of the controls of one screen file (the YAML of a .pa.yaml as JSON): classic controls, unknown properties. */
export function controlProblems(file: string, json: unknown): string[] {
  const problems: string[] = [];
  const where = file.replace(/^.*powerbi\//, 'powerbi/');
  const walk = (children: Array<Record<string, Control>> | undefined): void => {
    for (const entry of children ?? []) {
      for (const [name, control] of Object.entries(entry)) {
        const type = control.Control ?? '';
        const known = MODERN_CONTROLS[type];
        if (!known && !CLASSIC_KEPT.has(type)) problems.push(`App: ${where} ${name} is a ${type || 'control with no type'}: use a modern control of MODERN_CONTROLS (D317)`);
        if (known) for (const property of Object.keys(control.Properties ?? {})) {
          if (!known.includes(property)) problems.push(`App: ${where} ${name} (${type}) has the property ${property}, which the control does not have`);
        }
        walk(control.Children);
      }
    }
  };
  const screens = (json as { Screens?: Record<string, Control> } | null)?.Screens ?? {};
  for (const screen of Object.values(screens)) walk(screen.Children);
  return problems;
}
