// The rules of the Power App and its flows (build B6): the catalogue, the flows and the calls of the app's formulas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { appActions } from '../../../tools/powerbi/actions.ts';
import { appFieldProblems, appFlows, textMeasure, callProblems, catalogueProblems, columnProblems, controlProblems, dataReadProblems, flowProblems, typedRowsProblems } from '../../../tools/powerbi/app-rules.ts';
import { readTables } from '../../../tools/powerbi/tmdl.ts';
import { APP_FIELDS } from '../../../tools/powerbi/tokens.ts';
import type { AppName } from '../../../tools/powerbi/tokens.ts';
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
  // A flow that answers the app cannot have concurrency control (Power Automate refuses to save it, D337).
  const f5 = appFlows().find((flow) => flow.id === 'F5')!;
  assert.ok(flowProblems([{ ...f5, concurrency: 1 }]).some((line) => line.includes('must be off')));
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
    { Ok: { Control: 'ModernButton', Properties: { Text: '="Send"', Appearance: '=ButtonAppearance.Primary', Size: '=10' } } },
    { List: { Control: 'Gallery', Properties: { Items: '=Emails' }, Children: [{ Line: { Control: 'Label', Properties: { Text: '=ThisItem.To' } } }] } }
  ])), []);
  const problems = controlProblems('powerbi/apps/x/Src/S.pa.yaml', screen([
    { Old: { Control: 'Classic/Button', Properties: {} } },
    { Unknown: { Control: 'Button', Properties: {} } },
    { Input: { Control: 'ModernTextInput', Properties: { HintText: '="To"', FontSize: '=10' } } }
  ]));
  assert.ok(problems.some((line) => line.includes('Old is a Classic/Button')));
  assert.ok(problems.some((line) => line.includes('Unknown is a Button')));
  assert.ok(problems.some((line) => line.includes('has the property HintText')));
  assert.ok(problems.some((line) => line.includes('has the property FontSize')));
});

test('build A1 (D381): no version on a control, the tick box set by Default, the tab list by a record of Items and Align', () => {
  const screen = (controls: Array<Record<string, unknown>>) => ({ Screens: { S: { Children: controls } } });
  // What Carlos's Studio accepted on 21 Nov 2026.
  assert.deepEqual(controlProblems('powerbi/apps/x/Src/S.pa.yaml', screen([
    { Box: { Control: 'ModernCheckbox', Properties: { Default: '=false', Label: '="Same in EPO"' } } },
    { Tabs: { Control: 'ModernTabList', Properties: { Items: '=["Reply", "Actions"]', Default: '=If(ToReadCount > 0, {Value: "Reply"}, {Value: "Actions"})', Align: '=Align.Right' } } },
    { Tabs2: { Control: 'ModernTabList', Properties: { Default: '={Value: "Lifecycle review"}', Align: '=Align.Left' } } }
  ])), []);
  // What it refused: the files of 0.58.0.
  const problems = controlProblems('powerbi/apps/x/Src/S.pa.yaml', screen([
    { Pinned: { Control: 'ModernButton@1.0.0', Properties: { Text: '="Send"' } } },
    { Box: { Control: 'ModernCheckbox', Properties: { Checked: '=false' } } },
    { Tabs: { Control: 'ModernTabList', Properties: { Default: '=If(ToReadCount > 0, "Reply", "Actions")', Alignment: '=TabListAlignment.End' } } },
    { Tabs2: { Control: 'ModernTabList', Properties: { Default: '="Lifecycle review"' } } }
  ]));
  assert.ok(problems.some((line) => line.includes('Pinned is a ModernButton@1.0.0: write the control without a version')));
  assert.ok(problems.some((line) => line.includes('Box (ModernCheckbox) has the property Checked') && line.includes('PA2108')));
  assert.ok(problems.some((line) => line.includes('Tabs (ModernTabList) has the property Alignment') && line.includes('Align')));
  assert.ok(problems.some((line) => line.includes('Tabs (ModernTabList) has the Default =If(ToReadCount > 0, "Reply", "Actions")')));
  assert.ok(problems.some((line) => line.includes('Tabs2 (ModernTabList) has the Default ="Lifecycle review"')));
  assert.equal(problems.length, 5, problems.join('\n'));
});

test('the app may add a row to the journal with its columns, and run the refresh flow from its button Refresh now', () => {
  const button: Formula = { ...formula('ok', [{ name: 'Run', namespace: 'SACMRefresh', source: null, second: null, fields: [] }]), where: '/Screens/S/Children/3/RefreshButton/Properties/OnSelect' };
  assert.deepEqual(callProblems([formula('ok', [patch(['Title', 'At', 'Keys'])]), button]), []);
});

test('a Save, or any other control or a named formula, that runs the refresh flow is a problem (D332)', () => {
  const save: Formula = { ...formula('save', [patch(['Title']), { name: 'Run', namespace: 'SACMRefresh', source: null, second: null, fields: [] }]), where: '/Screens/S/Children/9/SaveButton/Properties/OnSelect' };
  const named: Formula = { ...formula('named', [{ name: 'Run', namespace: 'SACMRefresh', source: null, second: null, fields: [] }]), where: '/App/Properties/Formulas/Refresh' };
  const problems = callProblems([save, named]);
  assert.equal(problems.filter((line) => line.includes('only the button Refresh now')).length, 2);
  // Another flow may run from any button.
  const send: Formula = { ...formula('send', [patch(['Title']), { name: 'Run', namespace: 'SACMSend', source: null, second: null, fields: [] }]), file: 'powerbi/apps/sacm-messages/Src/X.pa.yaml', where: '/Screens/S/Children/9/SendButton/Properties/OnSelect' };
  assert.deepEqual(callProblems([send]), []);
});

test('a refresh goes through the gate: Now, Minutes, Open, Window, the row in SACM Refreshes, and only then the refresh (D333)', () => {
  const f5 = appFlows().find((flow) => flow.id === 'F5')!;
  const f3 = appFlows().find((flow) => flow.id === 'F3')!;
  const f1 = appFlows().find((flow) => flow.id === 'F1')!;
  assert.deepEqual(flowProblems([f5, f3, f1]), []);
  assert.ok(!f1.steps.some((step) => step.action === 'Refresh a dataset'), 'F1 does not refresh (D332)');
  // The old F5: a refresh and a Delay, no gate.
  const old: Flow = { ...f5, steps: [
    { action: 'Refresh a dataset', connector: 'Power BI', fields: { Workspace: 'SACM Workbench', Dataset: 'SACM-Workbench' } },
    { action: 'Delay', connector: 'Schedule', fields: { Count: '2', Unit: 'Minute' } }
  ] };
  const problems = flowProblems([old]);
  assert.ok(problems.some((line) => line.includes('the step "Delay"')));
  assert.ok(problems.some((line) => line.includes('without the step Now')));
  assert.ok(problems.some((line) => line.includes('without the condition Open')));
  assert.ok(problems.some((line) => line.includes('without first adding the window to SACM Refreshes')));
  assert.ok(problems.some((line) => line.includes('the workspace "SACM Workbench"')));
  assert.ok(problems.some((line) => line.includes('never answers the app taken')));
  // A refresh that does not wait for the lock, other hours, another field in the list, a flow that files reports and refreshes.
  const loose: Flow = { ...f5, steps: f5.steps.map((step) => {
    if (step.action === 'Refresh a dataset') return { ...step, if: 'Open is Yes' };
    if (step.fields.Name === 'Open') return { ...step, fields: { ...step.fields, Expression: step.fields.Expression!.replace('1080', '1200') } };
    if (step.action === 'Create item') return { ...step, fields: { ...step.fields, Note: 'x' } };
    if (step.action === 'Respond to a PowerApp or flow' && step.fields.Result === 'closed') return { ...step, fields: { Result: 'closed' } };
    return step;
  }) };
  const more = flowProblems([loose, { ...f1, steps: [...f1.steps, ...f5.steps.filter((step) => step.action !== 'Respond to a PowerApp or flow')], trigger: f1.trigger }]);
  assert.ok(more.some((line) => line.includes('refreshes even when the window is taken')));
  assert.ok(more.some((line) => line.includes('the condition Open is')));
  assert.ok(more.some((line) => line.includes('the field Note to SACM Refreshes')));
  assert.ok(more.some((line) => line.includes('every answer must give the outputs Result, At, By, Message')));
  assert.ok(more.some((line) => line.includes('files reports and refreshes')));
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
  assert.deepEqual(callProblems([audit([patch(['Title', 'Value'], 'Defaults', 'SACM Settings'), patch(['Title', 'EntryType', 'Items'])])]), []);
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
      else if (inProperties >= 0 && depth === inProperties + 2) {
        const key = /^\s*(\w+):(.*)$/.exec(row);
        if (!key) continue;
        let value = key[2]!.trim();
        // A block (|-): the deeper lines under it.
        if (/^\|-?$/.test(value)) {
          const block: string[] = [];
          for (let below = next + 1; below < lines.length && (!lines[below]!.trim() || lines[below]!.length - lines[below]!.trimStart().length > depth); below++) block.push(lines[below]!.trim());
          value = block.join('\n').trim();
        }
        control.Properties[key[1]!] = value;
      }
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

test('no list column has the name of a column SharePoint has already, such as Type (D338)', () => {
  assert.deepEqual(columnProblems(), []);
  const problems = columnProblems({ journal: { list: 'SACM Journal', columns: ['Title', 'Type', 'EntryType', 'Content Type'] } }, []);
  assert.equal(problems.length, 2);
  assert.match(problems[0]!, /column Type of SACM Journal/);
  const flow = appFlows()[0]!;
  const extra: Flow = { ...flow, steps: [{ action: 'Create item', fields: { 'List Name': 'SACM Replies', Title: '=x', Modified: '=y' } } as never] };
  assert.match(columnProblems({}, [extra]).join(), /column Modified of SACM Replies/);
});

// ---- Build A1: every field of a Power Apps visual is text (D377 to D380) ------------------------------------------

const APP_FOLDER: Record<AppName, { folder: string; screen: string }> = {
  'SACM actions': { folder: 'sacm-actions', screen: 'ActionsScreen' },
  'SACM messages': { folder: 'sacm-messages', screen: 'MessagesScreen' },
  'SACM audit': { folder: 'sacm-audit', screen: 'AuditScreen' }
};

test('every field of APP_FIELDS is a text column of the model, and the measure every visual gets last is text (D377)', () => {
  assert.deepEqual(appFieldProblems(readTables()), []);
  // The model of 0.59.0: AppEmail[Piece] a whole number, CaseLines[RetireOn] a date; a field that is not there.
  const tables = readTables().map((table) => ({ ...table, columns: table.columns.map((column) =>
    (table.name === 'AppEmail' && column.name === 'Piece' ? { ...column, dataType: 'int64' } : table.name === 'CaseLines' && column.name === 'RetireOn' ? { ...column, dataType: 'dateTime' } : column)) }));
  const problems = appFieldProblems(tables, { ...APP_FIELDS, 'SACM audit': { ...APP_FIELDS['SACM audit'], fields: [...APP_FIELDS['SACM audit'].fields, { field: 'Nowhere', kind: 'text' }] } });
  assert.ok(problems.some((line) => line.includes('AppEmail[Piece] of SACM messages is int64') && line.includes('in a form the app cannot read (D377)')));
  assert.ok(problems.some((line) => line.includes('CaseLines[RetireOn] of SACM actions is dateTime')));
  assert.ok(problems.some((line) => line.includes('ReviewLines[Nowhere], which is not a column')));
  assert.equal(problems.length, 3, problems.join('\n'));
  // The measure Report at as a date, not text: refused.
  const asDate = readTables().map((table) => (table.name !== 'About' ? table : { ...table, measures: table.measures.map((measure) =>
    (measure.name === 'Report at' ? { ...measure, dax: 'MAX ( About[RefreshedUtc] )' } : measure)) }));
  assert.deepEqual(appFieldProblems(asDate).map((line) => line.slice(0, 67)), ['App fields: the measure About[Report at] every app gets must return']);
  assert.ok(textMeasure('VAR r = MAX ( T[x] ) RETURN IF ( ISBLANK ( r ), BLANK (), FORMAT ( r, "yyyy-mm-dd", "en-US" ) & "T" & FORMAT ( r, "hh:nn:ss", "en-US" ) & "Z" )'));
  assert.ok(!textMeasure('VAR r = MAX ( T[x] ) RETURN IF ( ISBLANK ( r ), BLANK (), r )'));
  assert.ok(!textMeasure('COUNTROWS ( T )'));
});

test('each app reads PowerBIIntegration.Data only in its typed rows and the refresh rule; the typed rows name every field in order (D379)', () => {
  for (const [app, { folder, screen }] of Object.entries(APP_FOLDER) as Array<[AppName, { folder: string; screen: string }]>) {
    const rows = APP_FIELDS[app].rows;
    for (const file of [`${folder}/App-Formulas.fx`, `${folder}/Src/App.pa.yaml`, `${folder}/Src/${screen}.pa.yaml`]) {
      const text = readFileSync(join(root, 'powerbi', 'apps', file), 'utf8');
      assert.deepEqual(dataReadProblems(file, text, rows), [], file);
      if (!file.includes('Screen')) assert.deepEqual(typedRowsProblems(file, text, app), [], file);
    }
  }
  // The formulas of 0.59.0: the rows read as they come, and a screen that reads the visual itself.
  const old = 'Lines = PowerBIIntegration.Data;\nLineCount = CountRows(Lines);\n';
  assert.match(dataReadProblems('powerbi/apps/sacm-actions/App-Formulas.fx', old, 'Lines').join(), /App-Formulas\.fx:1 reads PowerBIIntegration\.Data/);
  assert.match(typedRowsProblems('powerbi/apps/sacm-actions/App-Formulas.fx', old, 'SACM actions').join(), /has 0 typed rows/);
  assert.equal(dataReadProblems('S.pa.yaml', '      Text: =CountRows(PowerBIIntegration.Data)\n', 'Lines').length, 1);
  // A field left out, or two in another order.
  const formulas = readFileSync(join(root, 'powerbi', 'apps', 'sacm-actions', 'App-Formulas.fx'), 'utf8');
  assert.match(typedRowsProblems('x', formulas.replace(/^\s+RetireOn: .*\n/m, ''), 'SACM actions').join(), /wants Key, CheckId/);
  assert.match(typedRowsProblems('x', formulas.replace('        Key: ThisRecord.Key,\n        CheckId: ThisRecord.CheckId,', '        CheckId: ThisRecord.CheckId,\n        Key: ThisRecord.Key,'), 'SACM actions').join(), /give CheckId, Key/);
});

test('the typed rows turn text back: a number by Value, true/false by "true", a date by its parts, blank stays blank (D379)', () => {
  const audit = readFileSync(join(root, 'powerbi', 'apps', 'sacm-audit', 'App-Formulas.fx'), 'utf8');
  assert.match(audit, /^ {8}IsNext: ThisRecord\.IsNextText = "true",$/m);
  assert.match(audit, /^ {8}Order: If\(IsBlank\(ThisRecord\.OrderText\), Blank\(\), Value\(ThisRecord\.OrderText\)\)$/m);
  assert.match(audit, /^ {8}ReviewDate: If\(IsBlank\(ThisRecord\.ReviewDateText\), Blank\(\), Date\(Value\(Mid\(ThisRecord\.ReviewDateText, 1, 4\)\), Value\(Mid\(ThisRecord\.ReviewDateText, 6, 2\)\), Value\(Mid\(ThisRecord\.ReviewDateText, 9, 2\)\)\)\),$/m);
  const messages = readFileSync(join(root, 'powerbi', 'apps', 'sacm-messages', 'App-Formulas.fx'), 'utf8');
  assert.match(messages, /^AppRows = ForAll\(\n {4}PowerBIIntegration\.Data,\n {4}\{\n {8}Row: ThisRecord\.Row,$/m);
  assert.match(messages, /^ {8}Piece: If\(IsBlank\(ThisRecord\.Piece\), Blank\(\), Value\(ThisRecord\.Piece\)\),$/m);
  assert.match(messages, /^ {8}Mailbox: ThisRecord\.Mailbox = "true",$/m);
});

test('the plain paste files are the files of powerbi/apps/, byte for byte, under the names Carlos opens (D383)', async () => {
  const { PASTE_FILES, pasteFiles } = await import('../../../tools/powerbi/paste-files.ts');
  assert.deepEqual(PASTE_FILES.map(({ name }) => name), ['SACM-actions-Formulas.txt', 'SACM-actions-Screen.txt', 'SACM-messages-Formulas.txt', 'SACM-messages-Screen.txt', 'SACM-audit-Formulas.txt', 'SACM-audit-Screen.txt']);
  for (const [at, { data }] of pasteFiles().entries()) assert.ok(data.equals(readFileSync(PASTE_FILES[at]!.source)), PASTE_FILES[at]!.name);
});

test('README §6.4, §6.6 and §6.8 list the fields of APP_FIELDS, in order, and last About → Report at (D380)', () => {
  const readme = readFileSync(join(root, 'powerbi', 'README.md'), 'utf8');
  for (const [app, spec] of Object.entries(APP_FIELDS)) {
    const found = new RegExp(`<!-- app-fields: ${app} -->([\\s\\S]*?)<!-- /app-fields -->`).exec(readme);
    assert.ok(found, `README has no list of the fields of ${app}`);
    const names = [...found[1]!.matchAll(/\*([A-Za-z]+)\*(?!\*)/g)].map((match) => match[1]);
    assert.deepEqual(names, spec.fields.map((field) => field.field), app);
    assert.match(found[1]!, /and last the measure\s+\*\*About →\s+Report at\*\*$/, app);
    // The list is in the section the update script names for the app.
    const section = readme.slice(0, found.index).split(/^### /m).at(-1) ?? '';
    assert.ok(section.startsWith(`${spec.readme} `), `${app}: the list is not in README section ${spec.readme}`);
  }
});
