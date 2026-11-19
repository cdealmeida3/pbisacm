// The rules of the Power App and its flows (build B6): the catalogue, the flows and the calls of the app's formulas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appActions } from '../../../tools/powerbi/actions.ts';
import { appFlows, callProblems, catalogueProblems, controlProblems, flowProblems } from '../../../tools/powerbi/app-rules.ts';
import type { Flow, Formula } from '../../../tools/powerbi/app-rules.ts';

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
  const given = { id: 'FY', name: 'Y', purpose: '', trigger: 'Power Apps (V2)', inputs: ['To', 'Subject', 'Body'], concurrency: 1,
    steps: [{ action: 'Send an email from a shared mailbox (V2)', connector: 'Office 365 Outlook', fields: { To: '=the user who ran it', Subject: '=input Subject', Body: '=input Body', Attachments: 'a file' } }] };
  const more = flowProblems([given]);
  assert.ok(more.some((line) => line.includes('To "=the user who ran it"')));
  assert.ok(more.some((line) => line.includes('Attachments "a file"')));
  const unknown = { ...given, steps: [{ ...given.steps[0]!, fields: { ...given.steps[0]!.fields, Attachments: '=input Csv as the file FileName', Bcc2: 'x' } }] };
  const fields = flowProblems([unknown]);
  assert.ok(fields.some((line) => line.includes('the field Bcc2')));
  assert.ok(fields.some((line) => line.includes('Attachments "=input Csv as the file FileName": it must be the input Csv as the file FileName')), 'the file needs the inputs Csv and FileName');
});

test('the Outlook draft (F7, D315) is one new message in the manager\'s own Drafts, started by the app, and sends nothing', () => {
  const f7 = appFlows().find((flow) => flow.id === 'F7')!;
  assert.equal(f7.name, 'SACMDraft');
  assert.deepEqual(flowProblems([f7]), []);
  const send: Flow = { ...f7, trigger: 'When a new email arrives in a shared mailbox (V2)', inputs: [], steps: [
    { action: 'Send an HTTP request', connector: 'Office 365 Outlook', fields: { URI: 'https://graph.microsoft.com/v1.0/me/sendMail', Method: 'POST', Body: '=input Message with the file Csv and the shared SACM mailbox as From', ContentType: 'application/json' } },
    { action: 'Send an email from a shared mailbox (V2)', connector: 'Office 365 Outlook', fields: { To: '=input To', Subject: '=input Subject', Body: '=input Body' } },
    { action: 'Respond to a PowerApp or flow', connector: 'Power Apps', fields: {} }
  ] };
  const problems = flowProblems([send]);
  assert.ok(problems.some((line) => line.includes('does not start when a manager presses Outlook draft')));
  assert.ok(problems.some((line) => line.includes('makes a draft and sends')));
  assert.ok(problems.some((line) => line.includes('URI "https://graph.microsoft.com/v1.0/me/sendMail"')));
  assert.ok(problems.some((line) => line.includes('no input Message')));
  assert.ok(problems.some((line) => line.includes('answers a Power App, but the app does not start it')));
});

test('the apps use the modern controls, with only the properties Microsoft gives them (D317)', () => {
  const screen = (controls: Array<Record<string, unknown>>) => ({ Screens: { S: { Children: controls } } });
  assert.deepEqual(controlProblems('powerbi/apps/x/Src/S.pa.yaml', screen([
    { Ok: { Control: 'ModernButton@1.0.0', Properties: { Text: '="Send"', Appearance: '=ButtonAppearance.Primary', Size: '=10' } } },
    { List: { Control: 'Gallery', Properties: { Items: '=Emails' }, Children: [{ Line: { Control: 'Label', Properties: { Text: '=ThisItem.To' } } }] } }
  ])), []);
  const problems = controlProblems('powerbi/apps/x/Src/S.pa.yaml', screen([
    { Old: { Control: 'Classic/Button', Properties: {} } },
    { Unversioned: { Control: 'Button', Properties: {} } },
    { List: { Control: 'Gallery', Children: [{ Box: { Control: 'ModernCheckbox@1.0.0', Properties: { Default: '=false', Checked: '=false' } } }] } },
    { Input: { Control: 'ModernTextInput@1.0.0', Properties: { HintText: '="To"', FontSize: '=10' } } }
  ]));
  assert.ok(problems.some((line) => line.includes('Old is a Classic/Button')));
  assert.ok(problems.some((line) => line.includes('Unversioned is a Button')));
  assert.ok(problems.some((line) => line.includes('Box (ModernCheckbox@1.0.0) has the property Default')));
  assert.ok(problems.some((line) => line.includes('has the property HintText')));
  assert.ok(problems.some((line) => line.includes('has the property FontSize')));
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
  assert.ok(problems.some((line) => line.includes('adds a row to SACM Settings: only the Settings screen of the app SACM audit')));
  assert.ok(problems.some((line) => line.includes('Office365Outlook.SendEmailV2')));
  assert.ok(callProblems([formula('none', [])]).some((line) => line.includes('no formula adds a row')));
});

test('the app SACM audit adds rows to SACM Settings with Title and Value only, and changes none (build B8, D308)', () => {
  const audit = (calls: Formula['calls']): Formula => ({ ...formula('audit', calls), file: 'powerbi/apps/sacm-audit/Src/AuditScreen.pa.yaml' });
  assert.deepEqual(callProblems([audit([patch(['Title', 'Value'], 'Defaults', 'SACM Settings'), patch(['Title', 'Type', 'Items'])])]), []);
  const problems = callProblems([audit([patch(['Title', 'Colour'], 'Defaults', 'SACM Settings'), patch(['Title'], null, 'SACM Settings'), patch(['Title'])])]);
  assert.ok(problems.some((line) => line.includes('column Colour, which SACM Settings does not have')));
  assert.ok(problems.some((line) => line.includes('Patch(SACM Settings, …)')));
});

/** The controls of a screen file, read by indentation (enough for the hand-written screens; the lint reads them with YamlDotNet). */
function screenControls(text: string): Array<Record<string, { Control: string; Properties: Record<string, string> }>> {
  const lines = text.split('\n');
  const out: Array<Record<string, { Control: string; Properties: Record<string, string> }>> = [];
  lines.forEach((line, at) => {
    const head = /^(\s*)- (\w+):\s*$/.exec(line);
    if (!head) return;
    const indent = head[1]!.length + 2;
    const control = { Control: '', Properties: {} as Record<string, string> };
    let inProperties = -1;
    for (let next = at + 1; next < lines.length; next++) {
      const row = lines[next]!;
      if (!row.trim() || row.trim().startsWith('#')) continue;
      const depth = row.length - row.trimStart().length;
      if (depth <= indent - 2) break;
      if (depth === indent + 2 && /^\s*Control: /.test(row)) control.Control = row.trim().slice('Control: '.length);
      if (depth === indent + 2) inProperties = /^\s*Properties:\s*$/.test(row) ? depth : -1;
      else if (inProperties >= 0 && depth === inProperties + 2) { const key = /^\s*(\w+):/.exec(row); if (key) control.Properties[key[1]!] = ''; }
    }
    out.push({ [head[2]!]: control });
  });
  return out;
}

test('the three screens use only modern controls with their own properties, or the classic ones that stay (D317)', () => {
  for (const app of ['sacm-actions/Src/ActionsScreen.pa.yaml', 'sacm-messages/Src/MessagesScreen.pa.yaml', 'sacm-audit/Src/AuditScreen.pa.yaml']) {
    const file = join(root, 'powerbi', 'apps', app);
    const controls = screenControls(readFileSync(file, 'utf8'));
    assert.ok(controls.length > 10, `${app}: the controls were read`);
    assert.deepEqual(controlProblems(file, { Screens: { S: { Children: controls } } }), [], app);
    // A formula on one line is a plain YAML value: ": " or " #" in it breaks the YAML (Studio refuses the paste). Such a
    // formula goes in a block (|-). The CI parses the whole file; this finds the usual slip without .NET.
    const plain = readFileSync(file, 'utf8').split('\n').map((line, at) => ({ line, at: at + 1 }))
      .filter(({ line }) => /^\s+[A-Za-z]+: =/.test(line) && /: |\s#/.test(line.slice(line.indexOf(': =') + 3)));
    assert.deepEqual(plain.map(({ at }) => `${app}:${at}`), [], 'a one-line formula with ": " or " #" must be a block (|-)');
  }
});
