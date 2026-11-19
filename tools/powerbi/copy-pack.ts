// The copy pack (build 0.52.0, plan "fewer refreshes" §6.5): one HTML page with every value and text Carlos pastes into
// Power Automate and Power Apps, in the order of powerbi/README.md §6, each with a Copy button. It is generated from
// powerbi/apps/ (the gate of refresh.ts, the App-Formulas.fx and the screens of the three apps), so the next build
// writes it again: node tools/powerbi/copy-pack.ts <file outside the repository>. It writes only outside the repository
// (the project files), never into the repository's docs: the page is a tool for the tenant, the README is the source.
// The mailbox and the time zone are typed on the page and stay in the browser tab; nothing real is written here.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, isAbsolute } from 'node:path';
import { APP_FOLDERS } from './actions.ts';
import { TIME_ZONE, gateExpressions, refreshRule, refreshRuleText, windowStarts } from './refresh.ts';

const root = join(import.meta.dirname, '..', '..');
const MAILBOX = '%%MAILBOX%%';
const ZONE = '%%ZONE%%';

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A value as the page shows it: the mailbox and the time zone become the places the boxes at the top fill. */
const shown = (value: string): string =>
  esc(value.split(TIME_ZONE).join(ZONE))
    .split(MAILBOX).join('<span class="mbx">the-shared-mailbox@your-company</span>')
    .split(ZONE).join('<span class="tz">&lt;the time zone of the team&gt;</span>');

interface Row { label: string; value: string; note?: string }
interface Step { title: string; html: string; rows?: Row[]; after?: string; extra?: string }
interface Card { id: string; tag: string; title: string; why: string; name?: string; steps: Step[] }

export function copyPack(): string {
  let counter = 0;
  const row = (item: Row): string => {
    const id = `c${++counter}`;
    return `<div class="row"><div class="lbl">${esc(item.label)}${item.note ? ` <span class="note">${esc(item.note)}</span>` : ''}</div><code id="${id}" class="v">${shown(item.value)}</code><button class="cp" data-t="${id}">Copy</button></div>`;
  };
  const block = (path: string, text: string): string => {
    const id = `c${++counter}`;
    const lines = text.split('\n').length;
    return `<div class="blk"><div class="blkhead"><span class="lbl">${esc(path)}</span><span class="meta">${lines} lines</span><button class="cp big" data-t="${id}">Copy all</button></div><details><summary>Show the text</summary><pre id="${id}">${esc(text)}</pre></details></div>`;
  };
  const place = (page: string, x: number, y: number, width: number, height: number, filter?: string): string =>
    `<div class="place"><div><span>Page</span><b>${esc(page)}</b></div><div><span>X</span><b>${x}</b></div><div><span>Y</span><b>${y}</b></div><div><span>Width</span><b>${width}</b></div><div><span>Height</span><b>${height}</b></div>${filter ? `<div class="wide"><span>Filter on this visual</span><b>${esc(filter)}</b></div>` : ''}</div>`;
  const fields = (table: string, names: string[]): string =>
    `<p>From the table <b>${esc(table)}</b>, drag these into <b>Power Apps data</b>, in this order, and last the measure <b>About → Report at</b> (new in 0.52.0). On each column: the small arrow → <b>Don't summarize</b>.</p><ol class="fields">${[...names, 'Report at'].map((name) => `<li>${esc(name)}</li>`).join('')}</ol>${row({ label: 'The list (to tick off)', value: [...names, 'Report at (About)'].join(', ') })}`;
  const card = (item: Card): string =>
    `<section class="card" id="${item.id}"><header><span class="tag">${esc(item.tag)}</span><h3>${esc(item.title)}</h3></header><p class="why">${item.why}</p>${item.name ? row({ label: 'Flow name', value: item.name }) : ''}<ol class="steps">${item.steps
      .map((step, index) => `<li class="step"><div class="sn">${index + 1}</div><div class="sb"><h4>${esc(step.title)}</h4>${step.html ? `<p>${step.html}</p>` : ''}${(step.rows ?? []).map(row).join('')}${step.extra ?? ''}${step.after ? `<p class="small">${step.after}</p>` : ''}</div></li>`)
      .join('')}</ol></section>`;

  const rule = refreshRule();
  const gate = gateExpressions(rule);
  const once: Step = { title: 'One run at a time', html: 'On the trigger: <b>…</b> → <b>Settings</b> → <b>Concurrency control</b> on, <b>Degree of parallelism 1</b>.' };
  const answering: Step = { title: 'Concurrency control off', html: 'Leave the trigger\'s <b>Concurrency control</b> <b>off</b>. This flow answers the app, and Power Automate refuses to save it with concurrency control on (<i>InvalidConcurrencyConfiguration</i>, D337).' };
  const refreshStep = 'Workspace: <b>My workspace</b> (pick it). Dataset: <b>SACM-Workbench</b>.';
  const gateSteps = (by: string, source: string, byNote: string): Step[] => [
    { title: 'Now: the time of the team', html: '<b>+ New step → Data Operation → Compose</b>. Rename the step <b>Now</b> (… → Rename). Inputs: the expression below, with your time zone (the box at the top).', rows: [{ label: 'Step name', value: 'Now' }, { label: 'Inputs (expression)', value: gate.Now }] },
    { title: 'Minutes after midnight', html: '<b>+ New step → Compose</b>, renamed <b>Minutes</b>.', rows: [{ label: 'Step name', value: 'Minutes' }, { label: 'Inputs (expression)', value: gate.Minutes }] },
    { title: `Open: ${rule.from} to ${rule.to}`, html: '<b>+ New step → Control → Condition</b>, renamed <b>Open</b>. Left box: the expression below. Middle: <b>is equal to</b>. Right box: the expression <code>true</code>.', rows: [{ label: 'Step name', value: 'Open' }, { label: 'Left value (expression)', value: gate.Open }, { label: 'Right value (expression)', value: 'true' }] },
    { title: 'Window: which 2 hours', html: `In the <b>True</b> branch of <i>Open</i>: <b>Compose</b>, renamed <b>Window</b>. It gives the start of the window, for example <code>2026-11-19 ${windowStarts(rule)[1] ?? rule.from}</code>.`, rows: [{ label: 'Step name', value: 'Window' }, { label: 'Inputs (expression)', value: gate.Window }] },
    { title: 'Take the window', html: 'After <i>Window</i>: <b>SharePoint → Create item</b>. Site: the team\'s site. List Name: <b>SACM Refreshes</b>. Title: the output of <i>Window</i> (pick it under <i>Dynamic content</i>, or the expression below). It fails when the window is used already (the unique Title): then nothing refreshes.', rows: [{ label: 'Title (expression)', value: "outputs('Window')" }, { label: 'By', value: by, note: byNote }, { label: 'Source', value: source }] },
    { title: 'Refresh', html: `After <i>Create item</i>: <b>Power BI → Refresh a dataset</b>. ${refreshStep}` }
  ];
  const shareRefresh: Step = { title: 'Save and share', html: '<b>Save</b>. On the flow\'s page: <b>Run only users → Edit</b>: <b>SACM managers</b>; for <b>Power BI</b> and <b>SharePoint</b> pick <b>Use this connection</b> (yours). The managers have no rights on <i>SACM Refreshes</i> and may not refresh your report themselves.' };
  const terminate: Step = { title: 'When the window is used', html: 'After <i>Create item</i>, <b>+ → Add a parallel branch → Control → Terminate</b>, Status <b>Succeeded</b>. On it: <b>… → Settings → Run after</b>: only <b>has failed</b> (a used window is no error). <b>No Delay.</b>' };
  const respond = (when: string, result: string, rows: Row[] = []): string =>
    `<h4 class="sub">${esc(when)}</h4><p><b>Power Apps → Respond to a PowerApp or flow</b>, four <b>Text</b> outputs in this order: <code>Result</code>, <code>At</code>, <code>By</code>, <code>Message</code>. An output not listed here stays empty.</p>${[{ label: 'Result', value: result }, ...rows].map(row).join('')}`;
  const appBy = "triggerOutputs()['headers']['x-ms-user-email']";
  const rowsGet = "first(body('Get_items')?['value'])";

  const flows: Card[] = [
    {
      id: 'f5', tag: 'F5', title: 'SACMRefresh', name: 'SACMRefresh',
      why: 'The button <b>Refresh now</b> of the three apps, and nothing else (D332). It refreshes at most once in each window (D333) and tells the app what happened.',
      steps: [
        { title: 'Make the flow', html: '<b>Create → Instant cloud flow</b>. Name above. Trigger <b>When Power Apps calls a flow (V2)</b>. No inputs. <b>Create</b>.' },
        answering,
        ...gateSteps(appBy, 'app', 'the manager who pressed (expression)'),
        {
          title: 'The five answers', html: 'Add <b>Respond to a PowerApp or flow</b> in five places, with the same four outputs each time.',
          extra: [
            respond('In the False branch of Open', 'closed'),
            respond('After Refresh a dataset', 'started', [{ label: 'At (expression)', value: "formatDateTime(outputs('Now'), 'HH:mm')" }, { label: 'By (expression)', value: appBy }]),
            respond('Beside it: + → Add a parallel branch after Refresh a dataset, Run after: has failed only', 'refused', [{ label: 'Message (expression)', value: "coalesce(outputs('Refresh_a_dataset')?['body']?['error']?['message'], 'no reason given')" }]),
            `<h4 class="sub">After Create item: a parallel branch, Run after: has failed only</h4><p><b>SharePoint → Get items</b>, List Name <b>SACM Refreshes</b>, Top Count <b>1</b>, Filter Query below. Then <b>Condition</b>, renamed <b>Found</b>, with <b>Run after: is successful</b> and <b>has failed</b>.</p>${[{ label: 'Filter Query', value: gate.Filter }, { label: 'Top Count', value: '1' }, { label: 'Found: left value (expression)', value: "greater(length(coalesce(body('Get_items')?['value'], json('[]'))), 0)" }, { label: 'Found: right value (expression)', value: 'true' }].map(row).join('')}`,
            respond('In the True branch of Found', 'taken', [{ label: 'At (expression)', value: `formatDateTime(convertFromUtc(${rowsGet}?['Created'], '${TIME_ZONE}'), 'HH:mm')` }, { label: 'By (expression)', value: `${rowsGet}?['By']` }]),
            respond('In the False branch of Found', 'error')
          ].join('')
        },
        { title: 'No Delay', html: 'If the flow still has the <b>Delay</b> of an earlier build, delete it: the app waits for the answer.' },
        shareRefresh
      ]
    },
    {
      id: 'f6', tag: 'F6', title: 'SACM refresh now', name: 'SACM refresh now',
      why: `The button Refresh now on the rail of the pages My day and Reports. The rule is written above it: "${esc(refreshRuleText(rule))}"`,
      steps: [
        { title: 'Make the flow', html: '<b>Create → Instant cloud flow</b>. Trigger <b>Power BI button clicked</b>.' },
        once,
        ...gateSteps("coalesce(triggerOutputs()?['headers']?['x-ms-user-email'], 'button')", 'button', 'the manager, when the trigger gives it (expression)'),
        terminate,
        { ...shareRefresh, html: '<b>Save</b>. <b>Run only users → Edit</b>: <b>SACM managers</b>; for <b>Power BI</b> and <b>SharePoint</b> pick <b>Use this connection</b>. (The button goes into the report in part 2.)' }
      ]
    },
    {
      id: 'f2', tag: 'F2', title: 'SACMSend', name: 'SACMSend',
      why: 'The Send button of the app SACM messages. Sends from the shared mailbox exactly what the app gives.',
      steps: [
        { title: 'Make the flow', html: '<b>Create → Instant cloud flow</b>, trigger <b>When Power Apps calls a flow (V2)</b>. Add six <b>Text</b> inputs, in this order (the order gives them the inside names shown):', rows: ['To', 'Cc', 'Subject', 'Body', 'Csv', 'FileName'].map((name, index) => ({ label: `Input ${index + 1} (${index ? `text_${index}` : 'text'})`, value: name })), after: 'On Csv and FileName: <b>…</b> → <b>Make the field optional</b>.' },
        once,
        { title: 'Send the email', html: '<b>+ New step → Office 365 Outlook → Send an email from a shared mailbox (V2)</b>. In each box marked expression: click the box, press <b>fx</b>, paste, <b>Add</b>.', rows: [{ label: 'Original Mailbox Address', value: MAILBOX, note: 'type yours in the box at the top' }, { label: 'To (expression)', value: "triggerBody()?['text']" }, { label: 'CC (expression)', value: "triggerBody()?['text_1']" }, { label: 'Subject (expression)', value: "triggerBody()?['text_2']" }, { label: 'Body (expression)', value: "triggerBody()?['text_3']", note: 'press </> (code view) on Body first' }] },
        { title: 'The CSV file', html: '<b>Show all / Advanced parameters → Attachments</b>. Press the small <b>T</b> icon (<i>Switch to input entire array</i>), then paste as an expression:', rows: [{ label: 'Attachments (expression)', value: "if(empty(triggerBody()?['text_4']), json('[]'), createArray(json(concat('{\"Name\":\"', triggerBody()?['text_5'], '\",\"ContentBytes\":\"', base64(triggerBody()?['text_4']), '\"}'))))" }], after: 'If the inputs got other inside names, check with <b>Peek code</b> on the trigger and change <code>text_4</code> / <code>text_5</code>.' },
        { title: 'Save and share', html: '<b>Save</b>. <b>Run only users → Edit</b>: <b>SACM managers</b>; for <b>Office 365 Outlook</b> pick <b>Use this connection</b> (yours, which may send as the shared mailbox).' }
      ]
    },
    {
      id: 'f4', tag: 'F4', title: 'SACMTest', name: 'SACMTest',
      why: 'The Test to me button. Sends the same email only to the manager who pressed.',
      steps: [
        { title: 'Make the flow', html: 'As F2, trigger <b>When Power Apps calls a flow (V2)</b>, but four <b>Text</b> inputs in this order:', rows: ['Subject', 'Body', 'Csv', 'FileName'].map((name, index) => ({ label: `Input ${index + 1} (${index ? `text_${index}` : 'text'})`, value: name })), after: 'Make Csv and FileName optional.' },
        once,
        { title: 'Send the email', html: '<b>Send an email from a shared mailbox (V2)</b>.', rows: [{ label: 'Original Mailbox Address', value: MAILBOX }, { label: 'To (expression)', value: appBy, note: 'the manager who pressed Test' }, { label: 'Subject (expression)', value: "triggerBody()?['text']" }, { label: 'Body (expression)', value: "triggerBody()?['text_1']", note: 'code view </> first' }] },
        { title: 'The CSV file', html: '<b>Attachments → T</b> (entire array), expression:', rows: [{ label: 'Attachments (expression)', value: "if(empty(triggerBody()?['text_2']), json('[]'), createArray(json(concat('{\"Name\":\"', triggerBody()?['text_3'], '\",\"ContentBytes\":\"', base64(triggerBody()?['text_2']), '\"}'))))" }] },
        { title: 'Save and share', html: 'Run only users and connection as in F2.' }
      ]
    },
    {
      id: 'f7', tag: 'F7', title: 'SACMDraft', name: 'SACMDraft',
      why: 'The Outlook draft button. Puts the email into the manager\'s own Drafts, From = shared mailbox. Sends nothing.',
      steps: [
        { title: 'Make the flow', html: '<b>Create → Instant cloud flow</b>, trigger <b>When Power Apps calls a flow (V2)</b>. Two <b>Text</b> inputs:', rows: [{ label: 'Input 1 (text)', value: 'Message' }, { label: 'Input 2 (text_1)', value: 'Csv' }], after: 'Make Csv optional.' },
        answering,
        { title: 'Make the draft', html: '<b>+ New step → Office 365 Outlook → Send an HTTP request</b>. Keep the step\'s name as it is (<i>Send an HTTP request</i>): step 4 uses it.', rows: [{ label: 'URI', value: 'https://graph.microsoft.com/v1.0/me/messages' }, { label: 'Method', value: 'POST' }, { label: 'Content-Type', value: 'application/json' }, { label: 'Body (expression)', value: `json(replace(replace(triggerBody()?['text'], '%%CSV%%', base64(coalesce(triggerBody()?['text_1'], ''))), '%%FROM%%', '${MAILBOX}'))`, note: 'the mailbox address comes from the box at the top' }] },
        { title: 'Give the link back', html: '<b>+ New step → Power Apps → Respond to a PowerApp or flow</b>. <b>+ Add an output → Text</b>.', rows: [{ label: 'Output name', value: 'Link' }, { label: 'Value (expression)', value: "body('Send_an_HTTP_request')?['webLink']" }] },
        { title: 'Save and share', html: '<b>Save</b>. <b>Run only users → Edit</b>: <b>SACM managers</b>; for <b>Office 365 Outlook</b> pick <b>Provided by run-only user</b> (not your connection). Each manager signs in once, so the draft lands in their Drafts.' },
        { title: 'Ask IT', html: 'Each manager needs <b>Send as</b> on the shared mailbox (Exchange admin center → the mailbox → <b>Delegation → Send as</b>).' }
      ]
    },
    {
      id: 'f3', tag: 'F3', title: 'SACM - File replies', name: 'SACM - File replies',
      why: 'Your existing flow. It files each reply into the list SACM Replies, then refreshes through the same rule as Refresh now (a free window only).',
      steps: [
        { title: 'The trigger', html: '<b>When a new email arrives in a shared mailbox (V2)</b>: the shared mailbox, Include Attachments <b>No</b>.', rows: [{ label: 'Original Mailbox Address', value: MAILBOX }, { label: 'Subject Filter', value: '[SACM-' }], after: 'On the trigger: <b>…</b> → <b>Settings</b> → <b>Concurrency control</b> on, <b>Degree of parallelism 1</b>.' },
        { title: 'Make it plain text', html: '<b>+ New step → Content Conversion → Html to text</b>. Keep its name <i>Html to text</i>.', rows: [{ label: 'Content (expression)', value: "triggerOutputs()?['body/body']" }] },
        { title: 'File it', html: '<b>+ New step → SharePoint → Create item</b>. Site: the team\'s site. List Name: <b>SACM Replies</b>.', rows: [{ label: 'Title (expression)', value: "concat('SACM-', first(split(last(split(triggerOutputs()?['body/subject'], '[SACM-')), ']')))" }, { label: 'From (expression)', value: "triggerOutputs()?['body/from']" }, { label: 'Received (expression)', value: "triggerOutputs()?['body/receivedDateTime']" }, { label: 'Subject (expression)', value: "triggerOutputs()?['body/subject']" }, { label: 'Body (expression)', value: "body('Html_to_text')", note: 'or pick The plain text content' }, { label: 'ConversationId (expression)', value: "triggerOutputs()?['body/conversationId']" }] },
        { title: 'Remove the old refresh', html: 'If the flow has a <b>Refresh a dataset</b> straight after this Create item (an earlier build), delete it. The gate below replaces it.' },
        ...gateSteps('reply', 'reply', 'the word reply').map((step) => step.title === 'Take the window' ? { ...step, html: step.html.replace('<b>SharePoint → Create item</b>', 'a second <b>SharePoint → Create item</b>') } : step),
        terminate,
        { title: 'Clean up and save', html: 'If the old flow still saves replies as files in the team folder, delete that step. <b>Save</b>. Your connections stay as they are.' }
      ]
    },
    {
      id: 'f1', tag: 'F1', title: 'SACM - File reports', name: 'SACM - File reports',
      why: `Your existing flow. It only saves the report emails' attachments: it does not refresh (D332). The report refreshes at ${rule.scheduled.join(', ')}, after the morning reports.`,
      steps: [
        { title: 'Remove the refresh', html: 'If the flow has a <b>Refresh a dataset</b> step at the end (an earlier build), <b>delete it</b>.' },
        once,
        { title: 'Save', html: 'A report that comes late is <i>Old</i> on the page Reports until somebody presses Refresh now.' }
      ]
    }
  ];

  const appFile = (folder: string, file: string): string => readFileSync(join(folder, file), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
  const [actionsFolder, messagesFolder, auditFolder] = APP_FOLDERS as [string, string, string];
  const appSteps = (folder: string, screen: string, data: string, flowNames: string, name: string): Step[] => [
    { title: 'Make the app', html: 'In the visual press <b>Create new</b> (or <b>… → Edit</b> for an app you made before). Power Apps Studio opens.' },
    { title: 'Modern controls', html: '<b>Settings → Updates → New</b>: turn on <b>Modern controls and themes</b>.' },
    { title: 'Data', html: `<b>Data → Add data → SharePoint</b> → the team's site → tick: ${data} → Connect.` },
    { title: 'Flows', html: `<b>Power Automate</b> icon (left) → <b>Add flow</b> → ${flowNames}. A flow you changed (F5): <b>… → Refresh</b> on it.` },
    { title: 'Formulas', html: 'Tree view → <b>App</b>. In the property box pick <b>Formulas</b>, select all, paste:', extra: block(`${relative(join(root, 'powerbi', 'apps'), folder)}/App-Formulas.fx`, appFile(folder, 'App-Formulas.fx')) },
    { title: 'The screen', html: `Tree view: select <i>Screen1</i> (or your old <i>${screen}</i>: delete it first), press <b>Ctrl+V</b> with this copied. Delete <i>Screen1</i>, set <b>App → StartScreen</b>.`, extra: block(`${relative(join(root, 'powerbi', 'apps'), folder)}/Src/${screen}.pa.yaml`, appFile(folder, `Src/${screen}.pa.yaml`)), rows: [{ label: 'StartScreen', value: screen }] },
    { title: 'Save and share', html: '<b>Settings → General → Data row limit 2000.</b> <b>File → Save as</b>, <b>Publish</b>, <b>Share</b> with <i>SACM managers</i>. Back in the report: <b>Save</b>.', rows: [{ label: 'App name', value: name }] }
  ];
  const apps: Card[] = [
    {
      id: 'app-actions', tag: 'App', title: 'SACM actions', why: 'Notes, status, assign, stop following, the reply reader, and Refresh now at the top. Made once on Case, then copied.',
      steps: [
        { title: 'Place the visual', html: 'Report in the service → <b>Edit</b> → page <b>Case</b> → <b>Visualizations → Power Apps</b>. <b>Format → General → Properties → Size and position</b>:', extra: place('Case', 956, 84, 300, 620, 'CaseLines → For the app is 1') },
        { title: 'Fields', html: '', extra: fields('CaseLines', ['Key', 'CheckId', 'CiName', 'Status', 'AssignedTo', 'Person', 'Actions', 'Stages', 'StageId', 'ExceptionReason', 'RetireOn', 'ContactName', 'ShareTo', 'LastRef', 'Step', 'Card']) },
        { title: 'Filter', html: '<b>Filters on this visual</b>: drag the measure <b>CaseLines → For the app</b>, show items when the value <b>is</b> <b>1</b>, <b>Apply filter</b>.' },
        ...appSteps(actionsFolder, 'ActionsScreen', '<b>SACM Journal</b>, <b>SACM Team</b>, <b>SACM Settings</b>, <b>SACM Replies</b>', '<b>SACMRefresh</b>', 'SACM actions'),
        { title: 'Copy it to the other pages', html: 'Ctrl+C the visual, Ctrl+V on each page, then its place and filter:', extra: [place('Card', 956, 84, 300, 300, 'For the app is 1'), place('Person', 956, 84, 300, 568, 'For the app is 1'), place('Work queue', 956, 84, 300, 620, 'CaseLines → Queue lines is not blank'), place('Not followed', 956, 84, 300, 620, 'CaseLines → Status is Not followed up')].join(''), rows: [{ label: 'Not followed: filter value', value: 'Not followed up' }] }
      ]
    },
    {
      id: 'app-messages', tag: 'App', title: 'SACM messages', why: 'The email studio of the page Messages, with Refresh now at the top.',
      steps: [
        { title: 'Place the visual', html: 'Page <b>Messages</b> → <b>Visualizations → Power Apps</b>:', extra: place('Messages', 224, 84, 1032, 620) },
        { title: 'Fields', html: '', extra: fields('Drafts', ['DraftId', 'Ref', 'Kind', 'KindLabel', 'To', 'ToName', 'Cc', 'Subject', 'Body', 'Chat', 'Keys', 'NewKeys', 'FreeKeys', 'CiCount', 'About', 'NobodyAbove', 'Mailbox', 'AssignedTo', 'Html', 'Csv', 'Summary', 'EmailSubject', 'EmailId', 'HtmlLength', 'CsvLength']) },
        ...appSteps(messagesFolder, 'MessagesScreen', '<b>SACM Journal</b>, <b>SACM Team</b>', '<b>SACMSend</b>, <b>SACMTest</b>, <b>SACMDraft</b>, <b>SACMRefresh</b>', 'SACM messages')
      ]
    },
    {
      id: 'app-audit', tag: 'App', title: 'SACM audit', why: 'The lifecycle review and the settings, on the page Lifecycle review, with Refresh now at the top.',
      steps: [
        { title: 'Place the visual', html: 'Page <b>Lifecycle review</b> → <b>Visualizations → Power Apps</b>:', extra: place('Lifecycle review', 956, 84, 300, 620) },
        { title: 'Fields', html: '', extra: fields('ReviewLines', ['Review', 'IsNext', 'IsCurrent', 'ReviewDate', 'Report', 'ReportDate', 'Group', 'CiKey', 'CiName', 'ClassLabel', 'ClassName', 'EpoId', 'Status', 'EpoStatus', 'Agrees', 'Result', 'ResultLabel', 'EpoDate', 'Order']) },
        ...appSteps(auditFolder, 'AuditScreen', '<b>SACM Journal</b>, <b>SACM Team</b>, <b>SACM Settings</b>', '<b>SACMRefresh</b>', 'SACM audit')
      ]
    },
    {
      id: 'button', tag: 'Button', title: 'Refresh now', why: 'Flow F6 on the pages My day and Reports, in the place the rail keeps for it.',
      steps: [
        { title: 'Add it', html: 'Page <b>My day</b> → <b>Visualizations → Power Automate</b>. Add one field (any, for example <b>Runs → ReportDate</b>). <b>… → Edit</b> → pick <b>SACM refresh now</b> → <b>Apply</b>.', extra: place('My day', 16, 604, 156, 40) },
        { title: 'Its text', html: '<b>Format → Button → Text</b>:', rows: [{ label: 'Button text', value: 'Refresh now' }] },
        { title: 'Copy it', html: '<b>Ctrl+C</b>, page <b>Reports</b>, <b>Ctrl+V</b>, same place. Save the report.' }
      ]
    }
  ];

  const version = (JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }).version;
  const css = readFileSync(join(import.meta.dirname, 'copy-pack.css'), 'utf8');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>SACM Setup Copy Pack</title>
<style>
${css}</style>
</head>
<body>
<div class="wrap">
 <header style="display:flex;flex-direction:column;gap:8px">
  <h1>SACM setup copy pack</h1>
  <p class="lead">Every value and text you need for the flows and the three Power Apps of version ${esc(version)}, in the order you make them. Press <b>Copy</b>, paste it in Power Automate or Power Apps. Tap a step's number to mark it done (only this browser remembers). The steps in full: README §5 and §6 in the zip.</p>
 </header>
 <div class="mbxbox">
  <label for="mbx">The shared SACM mailbox address</label>
  <input id="mbx" type="email" autocomplete="off" spellcheck="false" placeholder="type it here">
  <label for="tz">The time zone of the team (as Power Automate names it)</label>
  <input id="tz" type="text" autocomplete="off" spellcheck="false" placeholder="type it here: the same zone as the scheduled refresh">
  <span class="small">Both fill every box below that needs them. They stay in this tab only and are never saved.</span>
 </div>
 <div class="check">
  <b>Before the flows</b>
  <ol>
   <li>The report is published to <b>My workspace</b> and refreshes with real data. My workspace allows <b>${rule.dailyLimit} refreshes a day</b>, the flows included. The rule: ${esc(refreshRuleText(rule))} Never press Refresh now many times to test it.</li>
   <li>The five SharePoint lists exist: SACM Journal, SACM Replies, SACM Settings, SACM Team (you are in it) and <b>SACM Refreshes</b> (Title, By, Source), with <b>List settings → Title → Enforce unique values: Yes</b>.</li>
   <li>The scheduled refresh is on: one time, ${esc(rule.scheduled.join(', '))}, in the time zone you type above.</li>
   <li>All flows go in the <b>same environment</b> as the apps (normally the default one). Names must be exact. Concurrency control: on (1) for every flow except <b>SACMRefresh</b> and <b>SACMDraft</b>, which answer the app: off.</li>
  </ol>
 </div>
 <nav aria-label="Jump to">
  ${[...flows, ...apps].map((item) => `<a href="#${item.id}">${esc(item.tag === 'App' || item.tag === 'Button' ? item.title : `${item.tag} ${item.title.replace(/^SACM( - )?/, '') || item.title}`)}</a>`).join('')}
 </nav>
 <h2>1 · Power Automate: the flows</h2>
 ${flows.map(card).join('\n ')}
 <h2>2 · Power BI service: the three apps and the button</h2>
 <p class="lead">Make the apps in the service (app.powerbi.com), report in <b>Edit</b>, in Edge or Chrome. If you made an app in an earlier build, press <b>Choose app</b> instead of <b>Create new</b>, then paste the new formulas and screen. The new field <b>Report at</b> must be in each visual first.</p>
 ${apps.map(card).join('\n ')}
 <h2>3 · Try it</h2>
 <section class="card"><ol class="steps">
  <li class="step"><div class="sn">1</div><div class="sb"><h4>A note</h4><p>Case page of a test CI → Note → a word → Save. <i>Done lately</i> shows it at once with <i>not in the report yet</i>. Press <b>Refresh now</b> at the top of the app. About 2 minutes later press <b>Refresh</b> in the report's top bar: History → What happened shows it.</p></div></li>
  <li class="step"><div class="sn">2</div><div class="sb"><h4>An email</h4><p>Messages → a test email, To = your own address → <b>Test to me</b> → <b>Outlook draft</b> (answer <i>No</i> in the app) → <b>Send</b>. It stays in the list as <i>Sent</i> until the next refresh.</p></div></li>
  <li class="step"><div class="sn">3</div><div class="sb"><h4>The review</h4><p>Lifecycle review → <b>New review</b>: the review of today shows at once. Tick a CI → <i>Same in EPO</i> → Save the mark.</p></div></li>
 </ol></section>
</div>
<script>
(function(){
 var KEY='sacm-copy-pack-done';
 var done={};try{done=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){}
 document.querySelectorAll('.card').forEach(function(card,ci){
  card.querySelectorAll('.step').forEach(function(st,si){
   var id=(card.id||('c'+ci))+':'+si;
   if(done[id])st.classList.add('done');
   var sn=st.querySelector('.sn');sn.setAttribute('role','checkbox');sn.setAttribute('tabindex','0');sn.setAttribute('aria-label','Mark step done');sn.setAttribute('aria-checked',!!done[id]);
   function t(){st.classList.toggle('done');done[id]=st.classList.contains('done');sn.setAttribute('aria-checked',done[id]);try{localStorage.setItem(KEY,JSON.stringify(done))}catch(e){}}
   sn.addEventListener('click',t);sn.addEventListener('keydown',function(e){if(e.key===' '||e.key==='Enter'){e.preventDefault();t()}});
  });
 });
 var boxes={mbx:['mbx','the-shared-mailbox@your-company','Type the mailbox first'],tz:['tz','<the time zone of the team>','Type the time zone first']};
 function fill(){Object.keys(boxes).forEach(function(k){var v=document.getElementById(boxes[k][0]).value.trim();document.querySelectorAll('.'+k).forEach(function(s){s.textContent=v||boxes[k][1];s.classList.toggle('set',!!v)})})}
 document.getElementById('mbx').addEventListener('input',fill);document.getElementById('tz').addEventListener('input',fill);
 document.addEventListener('click',function(e){
  var b=e.target.closest('button.cp');if(!b)return;
  var el=document.getElementById(b.dataset.t);var txt=el.textContent;
  var label=b.classList.contains('big')?'Copy all':'Copy';
  for(var k in boxes){var inp=document.getElementById(boxes[k][0]);if(el.querySelector('.'+k)&&!inp.value.trim()){b.textContent=boxes[k][2];setTimeout(function(){b.textContent=label},1800);inp.focus();return}}
  function ok(){b.classList.add('done');b.textContent='Copied';setTimeout(function(){b.classList.remove('done');b.textContent=label},1500)}
  function sel(){var d=el.closest('details');if(d)d.open=true;var r=document.createRange();r.selectNodeContents(el);var s=getSelection();s.removeAllRanges();s.addRange(r);b.textContent='Selected: Ctrl+C'}
  try{navigator.clipboard.writeText(txt).then(ok,sel)}catch(err){sel()}
 });
})();
</script>
</body>
</html>
`;
}

if (import.meta.main) {
  const out = process.argv[2];
  if (!out) {
    console.error('Usage: node tools/powerbi/copy-pack.ts <file outside the repository>');
    process.exit(2);
  }
  const target = resolve(out);
  const inside = relative(root, target);
  if (!inside.startsWith('..') && !isAbsolute(inside)) {
    console.error('The copy pack is written outside the repository only (the project files): it is a tool for the tenant.');
    process.exit(2);
  }
  writeFileSync(target, copyPack());
  console.log(`Copy pack: wrote ${target}`);
}
