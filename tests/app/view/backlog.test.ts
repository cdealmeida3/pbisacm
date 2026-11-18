import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../../../src/core/checks/engine.ts';
import { readCiReport } from '../../../src/core/sources/ci/ci-report.ts';
import { readRelationshipReport } from '../../../src/core/sources/relationships/relationship-report.ts';
import { buildCases, buildRun } from '../../../src/core/cases/cases.ts';
import { mappingConfig } from '../../../src/core/mapping/backlog.ts';
import { buildDrafts } from '../../../src/core/messages/messages.ts';
import { backlogLines, stageCounts, teamCases, toTell } from '../../../src/app/view/backlog.ts';
import { exportBacklogCsv } from '../../../src/app/view/exports.ts';
import { peopleIndex, peopleOf } from '../../../src/app/view/people.ts';
import { loadPacks, loadReferences } from '../../../src/hosts/cli.ts';
import type { CaseEvent } from '../../../src/core/cases/cases.ts';

/* Invented data only. What the page Backlog shows (D200 to D204). */

const packs = loadPacks();
const references = loadReferences();
const config = mappingConfig(references)!;
const DATE = '2026-11-20';
const LEVELS = ['confidentiality', 'integrity', 'availability', 'authenticity'];
const HEAD = ['name', 'sys_class_name', 'operational_status', 'owned_by', 'owned_by.user_name', 'owned_by.email'].concat(LEVELS.map((level) => `x_demo_crit_target_${level}`), LEVELS.map((level) => `x_demo_crit_inherited_${level}`));
const ROWS: Array<[string, string, string, string]> = [
  ['Pay a bill', 'Business Process', 'Operational', '3333'],
  ['Fines_BA', 'Business Application', 'Operational', '3333'],
  ['Fines - PROD', 'Service Instance', 'Operational', '4444'],
  ['Lonely - PROD', 'Service Instance', 'Operational', ''],
  ['Orphan_BS', 'Business Service', 'Operational', '']
];

function setUp(events: CaseEvent[] = []) {
  const report = readCiReport([HEAD].concat(ROWS.map(([name, className, status, target]) => [name, className, status, 'Ann Owner', 'ann01', 'ann@example.com', ...(target ? target.split('') : ['', '', '', '']), ...(target ? target.split('') : ['', '', '', ''])])));
  const relationships = readRelationshipReport([['Parent', 'Type', 'Child'], ['Pay a bill', 'Provided by::Provides', 'Fines_BA'], ['Fines_BA', 'Consumes::Consumed by', 'Fines - PROD']]).relationships;
  const result = runChecks(report.cis, report.columns, packs, references, { date: DATE, relationships });
  const core = buildRun(report.cis, result, packs, DATE, 'r.csv', references);
  const run = { ...core, people: peopleOf(report.cis, core.facts.map((fact) => fact.ciKey)) };
  const cases = buildCases([run], events, [], DATE, { reminderDays: 3, maxReminders: 2 });
  const labelOf = (id: string) => packs.find((pack) => pack.id === id)?.cardLabel ?? id;
  return { cases, lines: backlogLines(cases, events, peopleIndex([run]), config, 'MAPPING', labelOf) };
}
const event = (id: string, type: CaseEvent['type'], keys: string[], text: string): CaseEvent => ({ id, at: `2026-11-1${id}T09:00:00Z`, by: 'ana@example.com', byName: 'Ana', type, keys, text });

test('one line per CI to map, with its owner, reasons, stage and the criticality lines of the same CI', () => {
  const { lines } = setUp();
  assert.deepEqual(lines.map((line) => [line.item.fact.ciName, line.owner, line.reasons, line.stage.label, line.canMark]), [
    ['Lonely - PROD', 'Ann Owner', ['Service Instance without a Business Application'], 'To plan', false],
    ['Orphan_BS', 'Ann Owner', ['Business Service without a Business Process above'], 'To plan', true]
  ]);
  // No criticality reaches these two CIs (no parent): the line shows it, the line stays on its own card too.
  assert.deepEqual(lines.map((line) => line.criticality), [['No criticality reaches the CI'], ['No criticality reaches the CI']]);
  assert.deepEqual(stageCounts(lines, config).map((entry) => `${entry.stage.label} ${entry.count}`), ['To plan 2', 'Session held 0', 'Classified 0', 'Application linked 0', 'Process linked 0']);
});

test('a stage set by a manager moves the line; Export writes the page', () => {
  const key = 'MAPPING:lonely - prod:mapping';
  const { lines } = setUp([event('1', 'stage', [key], 'session-held')]);
  const lonely = lines.find((line) => line.item.key === key)!;
  assert.deepEqual([lonely.stage.label, lonely.stageIndex], ['Session held', 1]);
  // To solve first, then by stage: the case that moved on comes after the one still to plan.
  assert.deepEqual(lines.map((line) => line.item.fact.ciName), ['Orphan_BS', 'Lonely - PROD']);
  const csv = exportBacklogCsv(lines, (state) => state);
  assert.match(csv, /^﻿"Name","Class","Owner","Why","Stage","Since","State","Criticality lines","Process Management told"\r\n/);
  assert.match(csv, /"Lonely - PROD","Service Instance","Ann Owner","Service Instance without a Business Application","Session held","20 November 2026","open"/);
});

test('the process does not exist: one message to Process Management, recorded apart from the mapping case (D203)', () => {
  const key = 'MAPPING:orphan_bs:mapping';
  const { lines } = setUp([event('1', 'no-process', [key], 'yes')]);
  const tell = toTell(lines);
  assert.deepEqual(tell.map((line) => line.item.fact.ciName), ['Orphan_BS']);
  const cases = teamCases(tell, { id: 'process-management', name: 'Process Management' });
  assert.deepEqual(cases.map((item) => [item.key, item.fact.field, item.fact.contactId]), [['MAPPING:orphan_bs:no-process', 'no-process', 'team:process-management']]);
  const settings = { portalLink: '', signature: 'SACM team', teams: { 'process-management': { name: 'Process Management', people: [{ name: 'Pat Process', email: 'pat@example.com' }] } } };
  const { drafts } = buildDrafts(cases, packs, settings, () => 'SACM-T1');
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]!.to, 'pat@example.com');
  assert.match(drafts[0]!.subject, /^No Business Process on Orphan_BS/);
  assert.match(drafts[0]!.plain, /the Business Process they belong to does not exist yet/);
  assert.deepEqual(drafts[0]!.keys, ['MAPPING:orphan_bs:no-process']);
  // Once told, the line says so and leaves the list to tell; the mapping case keeps its own follow-up.
  const told = setUp([event('1', 'no-process', [key], 'yes'), { ...event('2', 'message', ['MAPPING:orphan_bs:no-process'], ''), ref: 'SACM-T1', to: 'pat@example.com' }]);
  assert.equal(toTell(told.lines).length, 0);
  const orphan = told.lines.find((line) => line.item.key === key)!;
  assert.deepEqual([orphan.toldOn, orphan.item.status], ['2026-11-12', 'New']);
});
