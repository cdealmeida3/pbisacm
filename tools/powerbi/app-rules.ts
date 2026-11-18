// The rules of the Power Apps "SACM actions" and "SACM messages" and of their flows (builds B6 and B7, D294 to D296,
// D301), as pure functions: npm test runs them on the catalogue and the flows (tests/tools/powerbi/app-rules.test.ts);
// npm run powerbi:lint runs them on what Microsoft's Power Fx library reads from the app source too
// (tools/powerbi/powerfx-check/, needs .NET 8).
//   - The apps only ADD rows to the list SACM Journal (D272): Patch('SACM Journal', Defaults('SACM Journal'), { … }), with
//     columns of the list; they never change, remove or clear a row of any list of the team, and write no other list.
//   - The apps call no connector but the flows of powerbi/apps/flows.json with the trigger Power Apps (V2).
//   - The flows refresh, wait, file a report or a reply, or send exactly what a manager pressed Send or Test on: the
//     To, Cc, Subject and Body of a sending step are the inputs of its trigger (a test goes to the manager who ran it).
//     A flow that starts on a new email never sends; none runs on a timer (D2, D269).
//   - The catalogue (powerbi/apps/actions.json): unique ids, journal types the model reads, scopes and asks the app knows,
//     labels the column Actions can hold; every action of scope line is one fnCaseActions gives, and the other way round.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASKS, appActions } from './actions.ts';
import type { AppAction } from './actions.ts';
import { STATE_LISTS } from './history.ts';
import type { EventType } from '../../src/core/cases/cases.ts';

const root = join(import.meta.dirname, '..', '..');
export const FLOWS_FILE = join(root, 'powerbi', 'apps', 'flows.json');

/** The journal types of DATA-MODEL §3 (EventType of src/core/cases/cases.ts) that the model reads. */
export const JOURNAL_TYPES: EventType[] = ['note', 'status', 'assign', 'request', 'message', 'report', 'handover', 'person-note', 'exception', 'settings', 'review', 'reviewed', 'retirement', 'stage', 'no-process'];
const LISTS = Object.values(STATE_LISTS).map((list) => list.list as string);
const JOURNAL = STATE_LISTS.journal.list as string;
const JOURNAL_COLUMNS = new Set<string>(STATE_LISTS.journal.columns);
/** Functions that change or remove what a data source holds. Only Patch with Defaults (a new row) is allowed. */
const WRITERS = new Set(['Patch', 'Collect', 'ClearCollect', 'Clear', 'Remove', 'RemoveIf', 'Update', 'UpdateIf', 'SubmitForm']);

export interface Flow { id: string; name: string; purpose: string; trigger: string; inputs?: string[]; triggerFields?: Record<string, string>; concurrency: number; steps: Array<{ action: string; connector: string; fields: Record<string, string>; runAfter?: string[]; forEach?: string }> }
export const appFlows = (): Flow[] => (JSON.parse(readFileSync(FLOWS_FILE, 'utf8')) as { flows: Flow[] }).flows;

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
        continue;
      }
      if (!WRITERS.has(call.name) || !call.source) continue;
      if (!LISTS.includes(call.source)) { problems.push(`App: ${where} writes to ${call.source}, which is not a list of the team`); continue; }
      if (call.name !== 'Patch' || call.source !== JOURNAL || call.second !== 'Defaults') {
        problems.push(`App: ${where} uses ${call.name}(${call.source}, …): the app only adds rows to ${JOURNAL}, with Patch(${JOURNAL}, Defaults(${JOURNAL}), { … }) (D272)`);
        continue;
      }
      for (const field of call.fields) if (!JOURNAL_COLUMNS.has(field)) problems.push(`App: ${where} writes the column ${field}, which ${JOURNAL} does not have (powerbi/README.md §5)`);
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
const STEPS = new Set(['Refresh a dataset', 'Delay', 'Create file', 'Html to text', 'Create item', SEND]);
/** The fields of a sending step and the input of the trigger each must be. To of a test: the manager who ran the flow. */
const SEND_FIELDS: Record<string, { input: string; or?: string; optional?: boolean }> = {
  To: { input: 'To', or: '=the user who ran it' }, CC: { input: 'Cc', optional: true }, BCC: { input: 'Bcc', optional: true },
  Subject: { input: 'Subject' }, Body: { input: 'Body' }
};
/** The other fields a sending step may set: the shared mailbox it sends from, and the importance. */
const SEND_OTHER = new Set(['Original Mailbox Address', 'Importance']);
const REPLIES = STATE_LISTS.replies.list as string;

/** The problems of the flows: what triggers them and what they do. */
export function flowProblems(flows: Flow[] = appFlows()): string[] {
  const problems: string[] = [];
  const names = new Set<string>();
  for (const flow of flows) {
    if (names.has(flow.name)) problems.push(`Flows: the name ${flow.name} is there twice`);
    names.add(flow.name);
    if (!TRIGGERS.has(flow.trigger)) problems.push(`Flows: ${flow.id} starts on "${flow.trigger}": a flow starts on a button, the app or a new email, never on a timer (D2, D269)`);
    if (flow.concurrency !== 1) problems.push(`Flows: ${flow.id} must run one at a time (concurrency 1), so two refreshes never overlap`);
    if (flow.inputs?.length && flow.trigger !== 'Power Apps (V2)') problems.push(`Flows: ${flow.id} has inputs, but only a flow the app calls (Power Apps (V2)) gets them`);
    const sends = flow.steps.filter((step) => step.action === SEND);
    for (const step of flow.steps) {
      if (!STEPS.has(step.action)) problems.push(`Flows: ${flow.id} has the step "${step.action}": a flow refreshes, waits, files a report or a reply, or sends what a manager pressed Send on`);
      else if (step.action !== SEND && /send|post|message|reply|forward/i.test(step.action)) problems.push(`Flows: ${flow.id} sends something ("${step.action}")`);
      if (step.action === 'Create item' && step.fields['List Name'] !== REPLIES) problems.push(`Flows: ${flow.id} adds an item to ${step.fields['List Name'] ?? 'a list'}: a flow only files replies in ${REPLIES} (the journal is the managers' own, D272)`);
      if (step.action === 'Create item' && flow.trigger !== MAILBOX_TRIGGER) problems.push(`Flows: ${flow.id} files a reply, but does not start on a new email`);
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
          if (value !== `=input ${rule.input}` || !inputs.has(rule.input)) problems.push(`Flows: ${flow.id} sends with ${field} "${value}": it must be the input ${rule.input} of the trigger, exactly what the manager sends`);
        }
        for (const field of Object.keys(step.fields)) {
          if (!(field in SEND_FIELDS) && !SEND_OTHER.has(field)) problems.push(`Flows: ${flow.id} sends with the field ${field}: a message of the app has only To, Cc, Subject and Body`);
        }
      }
      continue;
    }
    const refresh = flow.steps.findIndex((step) => step.action === 'Refresh a dataset');
    if (refresh < 0) problems.push(`Flows: ${flow.id} does not refresh the report`);
    // A refresh started by the app or a button waits two minutes before the next run may start one.
    if (refresh >= 0 && flow.trigger !== MAILBOX_TRIGGER && flow.steps[refresh + 1]?.action !== 'Delay') problems.push(`Flows: ${flow.id} must wait (Delay) after the refresh, so the next run does not start one while it runs`);
  }
  return problems;
}
