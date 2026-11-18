// The rules of the Power App and its flows (build B6): the catalogue, the flows and the calls of the app's formulas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appActions } from '../../../tools/powerbi/actions.ts';
import { appFlows, callProblems, catalogueProblems, flowProblems } from '../../../tools/powerbi/app-rules.ts';
import type { Formula } from '../../../tools/powerbi/app-rules.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const fnCaseActions = readFileSync(join(root, 'powerbi', 'm', 'fnCaseActions.pq'), 'utf8');
const formula = (text: string, calls: Formula['calls']): Formula => ({ file: 'powerbi/apps/sacm-actions/Src/X.pa.yaml', where: '/X', text, errors: [], calls });
const patch = (fields: string[], second: string | null = 'Defaults', source = 'SACM Journal') => ({ name: 'Patch', namespace: null, source, second, fields });

test('the catalogue of actions.json and the actions fnCaseActions gives agree', () => {
  assert.deepEqual(catalogueProblems(appActions(), fnCaseActions), []);
});

test('a catalogue entry with an unknown type, ask or a label with | is a problem; an action fnCaseActions does not know is too', () => {
  const bad = [{ id: 'note', label: 'A|B', type: 'mail', scope: 'line' as const, asks: ['colour' as never] }, { id: 'note', label: 'Note', type: 'note', scope: 'line' as const, asks: ['text' as const] }];
  const problems = catalogueProblems(bad, 'on = [\n  note = true,\n  other = true\n],');
  assert.ok(problems.some((line) => line.includes('twice')));
  assert.ok(problems.some((line) => line.includes('type mail')));
  assert.ok(problems.some((line) => line.includes('asks for colour')));
  assert.ok(problems.some((line) => line.includes('holds | or =')));
  assert.ok(problems.some((line) => line.includes('gives other')));
});

test('the flows only refresh, wait, file or send what a manager pressed, one at a time, and none starts on a timer', () => {
  assert.deepEqual(flowProblems(appFlows()), []);
  const timer = { ...appFlows()[0]!, trigger: 'Recurrence', concurrency: 2, steps: [{ action: 'Post message in a chat or channel', connector: 'Microsoft Teams', fields: {} }] };
  const problems = flowProblems([timer]);
  assert.ok(problems.some((line) => line.includes('never on a timer')));
  assert.ok(problems.some((line) => line.includes('one at a time')));
  assert.ok(problems.some((line) => line.includes('sends what a manager pressed Send on')));
  assert.ok(problems.some((line) => line.includes('does not refresh')));
});

test('a flow sends only from the app, one message, exactly the inputs the manager sends; it files replies only in SACM Replies', () => {
  const send = { action: 'Send an email from a shared mailbox (V2)', connector: 'Office 365 Outlook', fields: { To: 'someone@example.com', Subject: '=input Subject', Body: 'Made by the flow' } };
  const onMail = { id: 'FX', name: 'X', purpose: '', trigger: 'When a new email arrives in a shared mailbox (V2)', inputs: ['Subject'], concurrency: 1, steps: [send, send, { action: 'Create item', connector: 'SharePoint', fields: { 'List Name': 'SACM Journal' } }] };
  const problems = flowProblems([onMail]);
  assert.ok(problems.some((line) => line.includes('nothing is sent on its own')));
  assert.ok(problems.some((line) => line.includes('one message a run')));
  assert.ok(problems.some((line) => line.includes('To "someone@example.com"')));
  assert.ok(problems.some((line) => line.includes('Body "Made by the flow"')));
  assert.ok(problems.some((line) => line.includes('adds an item to SACM Journal')));
  assert.ok(problems.some((line) => line.includes('only a flow the app calls')));
});

test('the app may add a row to the journal with its columns, and run the refresh flow', () => {
  assert.deepEqual(callProblems([formula('ok', [patch(['Title', 'At', 'Keys']), { name: 'Run', namespace: 'SACMRefresh', source: null, second: null, fields: [] }])]), []);
});

test('changing or removing a row, another list, an unknown column, another connector or no journal row at all is a problem', () => {
  const problems = callProblems([formula('bad', [
    patch(['Title', 'Colour']), patch(['Title'], null), { name: 'RemoveIf', namespace: null, source: 'SACM Journal', second: null, fields: [] },
    patch(['Title'], 'Defaults', 'SACM Settings'), { name: 'SendEmailV2', namespace: 'Office365Outlook', source: null, second: null, fields: [] }
  ])]);
  assert.ok(problems.some((line) => line.includes('column Colour')));
  assert.ok(problems.some((line) => line.includes('Patch(SACM Journal, …)')));
  assert.ok(problems.some((line) => line.includes('RemoveIf')));
  assert.ok(problems.some((line) => line.includes('Patch(SACM Settings, …)')));
  assert.ok(problems.some((line) => line.includes('Office365Outlook.SendEmailV2')));
  assert.ok(callProblems([formula('none', [])]).some((line) => line.includes('no formula adds a row')));
});
