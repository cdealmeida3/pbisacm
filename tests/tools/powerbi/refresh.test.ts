// The refresh rule of the report in My workspace (build 0.52.0, D332, D333): powerbi/apps/refresh.json, the numbers the
// apps, the flows, the table About and powerbi/README.md hold, and the budget of 8 refreshes a day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gateExpressions, minutesOf, refreshFormulas, refreshRule, refreshRuleM, refreshRuleText, ruleProblems, windowStarts } from '../../../tools/powerbi/refresh.ts';
import { appFlows } from '../../../tools/powerbi/app-rules.ts';
import { APP_FOLDERS } from '../../../tools/powerbi/actions.ts';
import { readExpressions } from '../../../tools/powerbi/tmdl.ts';
import { EXPRESSIONS_FILE } from '../../../tools/powerbi/generate.ts';

const root = join(import.meta.dirname, '..', '..', '..');
const rule = refreshRule();

test('the rule of refresh.json: whole windows, the scheduled refresh before them, and 2 of the daily limit stay free', () => {
  assert.deepEqual(ruleProblems(rule), []);
  assert.deepEqual(windowStarts(rule), ['08:00', '10:00', '12:00', '14:00', '16:00']);
  assert.ok(windowStarts(rule).length + rule.scheduled.length <= rule.dailyLimit - 2);
  const greedy = { ...rule, windowMinutes: 90, from: '07:30', to: '18:00' };
  assert.ok(ruleProblems(greedy).some((line) => line.includes('at most 6')), '7 windows and the morning leave none free');
  assert.ok(ruleProblems({ ...rule, to: '17:00' }).some((line) => line.includes('whole windows')));
  assert.ok(ruleProblems({ ...rule, scheduled: ['09:00'] }).some((line) => line.includes('before the first window')));
  assert.ok(ruleProblems({ ...rule, from: '8:00' }).some((line) => line.includes('not a time')));
});

test('a time HH:mm in minutes after midnight, as the gate counts them', () => {
  assert.ok(Number.isNaN(minutesOf('8:00')));
  assert.equal(minutesOf('08:00'), 480);
});

test('the flows F3, F5 and F6 use the expressions of the gate with the numbers of refresh.json', () => {
  const gate = gateExpressions(rule);
  assert.ok(gate.Open.includes(`${minutesOf(rule.from)})`) && gate.Open.includes(`${minutesOf(rule.to)})`));
  assert.ok(gate.Window.includes(`${rule.windowMinutes}), ${rule.windowMinutes})`));
  const gated = appFlows().filter((flow) => flow.steps.some((step) => step.action === 'Refresh a dataset'));
  assert.deepEqual(gated.map((flow) => flow.id).sort(), ['F3', 'F5', 'F6']);
  for (const flow of gated) {
    const inputs = Object.fromEntries(flow.steps.filter((step) => step.fields.Name).map((step) => [step.fields.Name, step.fields.Inputs ?? step.fields.Expression]));
    assert.equal(inputs.Now, gate.Now, flow.id);
    assert.equal(inputs.Minutes, gate.Minutes, flow.id);
    assert.equal(inputs.Open, gate.Open, flow.id);
    assert.equal(inputs.Window, gate.Window, flow.id);
  }
});

test('the apps, the table About and the README hold the rule of refresh.json', () => {
  const formulas = refreshFormulas(rule);
  for (const folder of APP_FOLDERS) {
    const text = readFileSync(join(folder, 'App-Formulas.fx'), 'utf8');
    assert.ok(text.includes(formulas), `${folder}: App-Formulas.fx holds the refresh formulas (npm run powerbi:generate)`);
  }
  assert.ok(formulas.includes(`RefreshWindowMinutes = ${rule.windowMinutes};`));
  const packed = readExpressions(EXPRESSIONS_FILE).find((expression) => expression.name === 'RefreshRule');
  assert.equal(packed?.m.trim(), refreshRuleM(rule));
  const readme = readFileSync(join(root, 'powerbi', 'README.md'), 'utf8');
  const section = readme.slice(readme.indexOf('### 6.5'), readme.indexOf('### 6.6'));
  assert.ok(section.includes(refreshRuleText(rule)), 'README §6.5 states the rule in the words of the report');
  for (const time of [...windowStarts(rule), rule.to]) assert.ok(section.includes(time), `README §6.5 names the window ${time}`);
  assert.ok(section.includes(`${rule.dailyLimit} a day`), 'README §6.5 names the daily limit');
});

test('the button Refresh now has the same formula in the three apps, and is the only place that runs SACMRefresh', () => {
  const onSelects = APP_FOLDERS.map((folder) => {
    const dir = join(folder, 'Src');
    const screen = readdirSync(dir).find((name) => name.endsWith('Screen.pa.yaml'));
    assert.ok(screen, `${folder} has a screen`);
    const text = readFileSync(join(dir, screen), 'utf8');
    assert.equal(text.split('SACMRefresh.Run()').length - 1, 1, `${folder} runs SACMRefresh once`);
    const match = /- RefreshButton:\n[\s\S]*?OnSelect: \|-\n([\s\S]*?)\n {12}X:/.exec(text);
    assert.ok(match, `${folder} has a RefreshButton with an OnSelect block`);
    return (match[1] ?? '').split('\n').map((line) => line.trim()).join('\n');
  });
  for (const other of onSelects.slice(1)) assert.equal(other, onSelects[0]);
});

test('the reader of the reports folder skips its sub-folders, so a folder Archive leaves the history (D336)', () => {
  const query = readFileSync(join(root, 'powerbi', 'm', 'fnSharePointFiles.pq'), 'utf8');
  assert.match(query, /Table\.SelectRows\(folder, each Value\.Is\(\[Content\], type binary\)\)/);
});

test('the copy pack holds the gate of refresh.json and the formulas and screens of the three apps as they are now', async () => {
  const { copyPack } = await import('../../../tools/powerbi/copy-pack.ts');
  const page = copyPack();
  const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  for (const [name, expression] of Object.entries(gateExpressions(rule))) {
    if (name !== 'Now') assert.ok(page.includes(esc(expression)), `the copy pack has the expression ${name}`);
  }
  assert.ok(page.includes(esc(refreshRuleText(rule))));
  for (const folder of APP_FOLDERS) {
    const formulas = readFileSync(join(folder, 'App-Formulas.fx'), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
    assert.ok(page.includes(esc(formulas)), `the copy pack has the App-Formulas.fx of ${folder}`);
  }
  assert.doesNotMatch(page, /https?:\/\/(?!(?:graph|teams)\.microsoft\.com\/)/, 'no link but those of the Outlook draft and the Teams chat');
});
