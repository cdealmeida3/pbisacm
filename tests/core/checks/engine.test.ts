import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../../src/core/reading/csv.ts';
import { compareRuns, runChecks } from '../../../src/core/checks/engine.ts';
import { canonicalClass, level, readCiReport } from '../../../src/core/sources/ci/ci-report.ts';
import { DIMENSIONS } from '../../../src/core/model/model.ts';
import { editSample } from '../../helpers.ts';
import { loadPacks, loadReferences } from '../../../src/hosts/cli.ts';

const sample = readFileSync(join(import.meta.dirname, '../../..', 'samples', 'cmdb_ci-sample.csv'), 'utf8');
const report = readCiReport(parseCsv(sample));
const run = runChecks(report.cis, report.columns, loadPacks(), loadReferences());
const found = (checkId: string): string[] => run.findings.filter((f) => f.checkId === checkId).map((f) => `${f.ciName}/${f.field}`).sort();

test('csv: quotes, embedded commas and line breaks, semicolon delimiter', () => {
  assert.deepEqual(parseCsv('a,b\r\n"x, y","line1\nline2"\r\n'), [['a', 'b'], ['x, y', 'line1\nline2']]);
  assert.deepEqual(parseCsv('a;b\n1;"say ""hi"""\n'), [['a', 'b'], ['1', 'say "hi"']]);
});

test('report: labels, table names and numeric choices are understood; the ci. prefix of a Health result is kept (D341)', () => {
  assert.equal(canonicalClass('cmdb_ci_service_auto'), 'service_instance');
  assert.equal(canonicalClass('Business Application'), 'business_application');
  assert.equal(canonicalClass('Technology Management Service'), 'technology_management_service');
  assert.equal(canonicalClass('cmdb_ci_appl'), 'application');
  assert.equal(canonicalClass('API'), 'api');
  assert.equal(level('Mission/Business critical'), 4);
  assert.equal(level('None'), undefined);
  // A CMDB Health result keeps its "ci." prefix, so it never gives the CI report its Class or its people.
  const health = readCiReport(parseCsv('ci,ci.sys_class_name,ci.Owned by,ci.owned_by.email\nX,Business Service,,\n'));
  assert.equal(health.cis[0]!.className, '');
  assert.ok(!health.columns.has('owned_by'));
  assert.equal(report.cis.find((ci) => ci.name === 'Old Receipt Printer')!.operationalStatus, 'Retired');
  assert.deepEqual(report.unknownHeaders, []);
  const owner = report.cis.find((ci) => ci.name === 'Reconcile Index')!.roles.owned_by!;
  assert.deepEqual([owner.userId, owner.active, owner.managerActive, owner.departmentHeadEmail], ['bo01', false, true, 'hana@example.com']);
  assert.equal(report.cis.find((ci) => ci.name === 'Members')!.serviceMapped, false);
  // Created by is read as it is; without the column it is not set.
  assert.equal(report.cis.find((ci) => ci.name === 'Members - Standard')!.createdBy, 'epo.sync');
  assert.equal(readCiReport(parseCsv('name,sys_class_name\nX,Service Offering\n')).cis[0]!.createdBy, undefined);
});

test('identity: a CI is known by its name; the asset tag is added only when names clash', () => {
  const keys = report.cis.map((ci) => ci.key);
  assert.ok(keys.includes('member engine'));
  assert.ok(keys.includes('fines hub - prod'), 'double spaces do not change the key');
  assert.deepEqual(keys.filter((key) => key.startsWith('manage fines')), ['manage fines|ast-0013', 'manage fines|ast-0014']);
  const noTags = readCiReport(parseCsv('name,sys_class_name\nX,Business Capability\nx,Business Capability\n'));
  assert.deepEqual(noTags.cis.map((ci) => ci.key), ['x', 'x#2']);
  assert.equal(new Set(keys).size, keys.length);
});

test('RESP-MISSING: Owned by and Managed by on every class, retired CIs left out', () => {
  // A Business Application is a copy of its Service Instance (D180), and a capability in Ready is parked (D179): neither is here.
  assert.deepEqual(found('RESP-MISSING'), ['Close the Month/managed_by', 'Manage Fines/managed_by', 'Manage Fines/managed_by', 'Manage Fines/owned_by',
    'Manage Fines/owned_by', 'Manage Member Records/owned_by', 'Members/managed_by']);
});

test('RESP-INACTIVE: only where the report says the user is inactive', () => {
  assert.deepEqual(found('RESP-INACTIVE'), ['Member Engine - PROD/managed_by', 'Reconcile Index/owned_by']);
});

test('DESC-QUALITY: placeholder, repeats the name', () => {
  assert.deepEqual(found('DESC-QUALITY'), ['Close the Month/description', 'Members - Standard/description', 'Members/description', 'Reconcile Index/description']);
});

test('CRIT-NO-JUSTIFICATION: per dimension, a SACM fix list; only the automatic text is asked of the owner (D185)', () => {
  assert.deepEqual(found('CRIT-NO-JUSTIFICATION'), ['Index Tool/confidentiality']);
  assert.deepEqual(run.findings.find((f) => f.checkId === 'CRIT-NO-JUSTIFICATION')!.fix, { change: 'Add the justification for Confidentiality, from the request', current: '(empty)', set: 'A justification for Confidentiality' });
  assert.deepEqual(found('CRIT-AUTO-JUSTIFICATION'), ['Member Engine - PROD/availability']);
  // A text of its own next to the automatic one: SACM's list, not the owner's.
  const mixed = readCiReport(parseCsv(editSample(sample, 'Member Engine - PROD', 'x_demo_crit_justification_for_exception', 'Availability - Inherited value increased (Auto generated), Integrity - CI is non-production')));
  const both = runChecks(mixed.cis, mixed.columns, loadPacks(), loadReferences()).findings.filter((f) => f.ciName === 'Member Engine - PROD' && /JUSTIFICATION/.test(f.checkId));
  assert.deepEqual(both.map((f) => `${f.checkId}/${f.field}`), ['CRIT-NO-JUSTIFICATION/availability']);
});

test('CRIT-ABOVE-PARENT: without the Relationship report, target higher than inherited', () => {
  assert.deepEqual(found('CRIT-ABOVE-PARENT'), ['Index Tool - PROD/confidentiality', 'Member Engine - PROD/integrity']);
});

test('TAG-MISSING: a Business Process needs its type tag', () => {
  assert.deepEqual(found('TAG-MISSING'), ['Reconcile Index/tags']);
});

test('TAG-MISSING: the facing tag is known by its ending, with any first word; "Facing" alone is not the tag', () => {
  const tagged = (tag: string): string[] => {
    const one = readCiReport(parseCsv(editSample(sample, 'Reconcile Index', 'sys_tags', tag)));
    return runChecks(one.cis, one.columns, loadPacks(), loadReferences()).findings
      .filter((f) => f.checkId === 'TAG-MISSING' && f.ciName === 'Reconcile Index').map((f) => f.detail);
  };
  for (const tag of ['Customer Facing', 'Partner-facing process', ' PUBLIC  FACING ', 'Member facing Process', 'Internal BP', 'internal process']) {
    assert.deepEqual(tagged(tag), [], tag);
  }
  for (const tag of ['Facing', 'facing process', 'Facing the street', 'Internal']) {
    assert.deepEqual(tagged(tag), ['missing tag: process type (customer facing or internal)'], tag);
  }
});

test('CRIT-TARGET-MISSING: an Operational Business Process without CIA values is a SACM line; Ready gives none (D132, D186)', () => {
  // The Business Applications without Target values are on CRIT-NONE-REACHES, not here.
  assert.deepEqual(found('CRIT-TARGET-MISSING'), []);
  const partial = readCiReport(parseCsv(editSample(sample, 'Register a New Member', 'x_demo_crit_target_availability', '')));
  const finding = runChecks(partial.cis, partial.columns, loadPacks(), loadReferences()).findings
    .find((f) => f.checkId === 'CRIT-TARGET-MISSING' && f.ciName === 'Register a New Member')!;
  assert.equal(finding.detail, 'no target criticality for availability');
  assert.match(finding.fix!.change, /^Status Operational without CIA values: check the status, or add the tag BIA N\/A or BIA is pending$/);
  // In Ready the process may wait for its BIA: no line at all.
  const ready = readCiReport(parseCsv(editSample(editSample(sample, 'Register a New Member', 'x_demo_crit_target_availability', ''), 'Register a New Member', 'operational_status', '5')));
  assert.equal(runChecks(ready.cis, ready.columns, loadPacks(), loadReferences()).findings.filter((f) => f.checkId === 'CRIT-TARGET-MISSING').length, 0);
  // A report without the Target columns cannot test it, and says so.
  const without = readCiReport(parseCsv('name,sys_class_name\nX,Business Process\n'));
  const notes = runChecks(without.cis, without.columns, loadPacks(), loadReferences()).notes.filter((n) => n.checkId === 'CRIT-TARGET-MISSING');
  assert.match(notes[0]!.note, new RegExp(DIMENSIONS.map((d) => `"Target ${d}" \\(target\\.${d}\\)`).join(', ')));
});

test('SUPPORT-GROUP-MISSING: a Service Offering and a Service Instance need a support group', () => {
  assert.deepEqual(found('SUPPORT-GROUP-MISSING'), ['Fines  Hub - PROD/support_group', 'Members - Standard/support_group']);
});

test('RESP-SAME-PERSON: compared by user ID, then email', () => {
  assert.deepEqual(found('RESP-SAME-PERSON'), ['Register a New Member/owned_by']);
  // Same display name, other user ID: two people.
  const other = readCiReport(parseCsv(editSample(sample, 'Register a New Member', 'managed_by.user_name', 'ada02')));
  assert.equal(runChecks(other.cis, other.columns, loadPacks(), loadReferences()).findings.filter((f) => f.checkId === 'RESP-SAME-PERSON').length, 0);
});

test('NAME-DUPLICATE: the same name twice, or double spaces; "?" is not checked', () => {
  assert.deepEqual(found('NAME-DUPLICATE'), ['Fines  Hub - PROD/name', 'Manage Fines/name', 'Manage Fines/name']);
  const question = readCiReport(parseCsv(editSample(sample, 'Manage Events', 'name', 'Manage E?vents')));
  assert.equal(runChecks(question.cis, question.columns, loadPacks(), loadReferences()).findings.filter((f) => f.checkId === 'NAME-DUPLICATE').length, 3);
});

test('NAME-DUPLICATE: only live CIs of the same class count (D130)', () => {
  const csv = ['name,sys_class_name,operational_status',
    'Fines,Business Application,1', 'Fines,Business Application,1',
    'Cards,Business Application,1', 'Cards,Business Application,6',
    'Rooms,Business Application,1', 'Rooms,Service Instance,1'].join('\n');
  const small = readCiReport(parseCsv(csv));
  const names = runChecks(small.cis, small.columns, loadPacks(), loadReferences()).findings.filter((f) => f.checkId === 'NAME-DUPLICATE');
  assert.deepEqual(names.map((f) => f.ciName), ['Fines', 'Fines']);
  assert.equal(names[0]!.detail, 'the same name is used on 2 live CIs of this class');
});

test('Supported by: its own card, missing or inactive, on a Service Offering or Service Instance only (D181)', () => {
  const csv = ['name,sys_class_name,operational_status,owned_by,owned_by.email,managed_by,managed_by.email,supported_by,supported_by.email,supported_by.active',
    'Gold,Service Offering,1,Ada,ada@example.com,Cy,cy@example.com,,,',
    'Gold - PROD,Service Instance,1,Ada,ada@example.com,Cy,cy@example.com,Bo,bo@example.com,false',
    'Index,Business Application,1,Ada,ada@example.com,Cy,cy@example.com,Bo,bo@example.com,false',
    'Silver,Service Offering,1,Ada,ada@example.com,Cy,cy@example.com,Bo,bo@example.com,false',
    'Shelf,Business Application,1,Ada,ada@example.com,Cy,cy@example.com,,,'].join('\n');
  const small = readCiReport(parseCsv(csv));
  const findings = runChecks(small.cis, small.columns, loadPacks(), loadReferences()).findings;
  const of = (checkId: string): string[] => findings.filter((f) => f.checkId === checkId).map((f) => `${f.ciName}/${f.field}`).sort();
  assert.deepEqual(of('SUPPORTED-BY'), ['Gold - PROD/supported_by', 'Gold/supported_by', 'Silver/supported_by']);
  assert.deepEqual([of('RESP-MISSING'), of('RESP-INACTIVE')], [[], []]);
  assert.deepEqual(findings.filter((f) => f.checkId === 'SUPPORTED-BY').map((f) => f.detail).sort(), ['supported by is an inactive user: Bo', 'supported by is an inactive user: Bo', 'supported by is empty']);
});

test('TAG-STATUS-CONFLICT: tagged To be deleted or Descoped, still Operational', () => {
  assert.deepEqual(found('TAG-STATUS-CONFLICT'), ['Fines  Hub - PROD/tags']);
  const ready = readCiReport(parseCsv(editSample(sample, 'Fines  Hub - PROD', 'operational_status', 'Ready')));
  assert.equal(runChecks(ready.cis, ready.columns, loadPacks(), loadReferences()).findings.filter((f) => f.checkId === 'TAG-STATUS-CONFLICT').length, 0);
});

test('every check pack names one of the three modules', () => {
  for (const pack of loadPacks()) assert.ok(['completeness', 'correctness', 'compliance'].includes(pack.dimension), pack.id);
});

test('checks that cannot run say so', () => {
  const note = (checkId: string): string => run.notes.filter((n) => n.checkId === checkId).map((n) => n.note).join(' ');
  // Tag not allowed is switched off until SACM gives the allowed tags (D150): it does not run, so it has nothing to say.
  assert.equal(note('TAG-INVALID'), '');
  assert.match(note('REL-MISSING'), /no Relationship report/);
  const bare = readCiReport(parseCsv('name,sys_class_name,operational_status\nGold,Service Offering,1\n'));
  assert.match(runChecks(bare.cis, bare.columns, loadPacks(), loadReferences()).notes.filter((n) => n.checkId === 'SUPPORTED-BY').map((n) => n.note).join(' '), /supported_by/);
});

test('finding keys are stable, and a fixed CI is reported as resolved', () => {
  let fixed = sample;
  for (const [column, value] of [['owned_by', 'Ada Example'], ['owned_by.email', 'ada@example.com'], ['owned_by.active', 'TRUE']]) fixed = editSample(fixed, 'Manage Member Records', column!, value!);
  const next = readCiReport(parseCsv(fixed));
  const changes = compareRuns(run.findings, runChecks(next.cis, next.columns, loadPacks(), loadReferences()).findings);
  assert.deepEqual(changes.resolved.map((f) => f.key), ['RESP-MISSING:manage member records:owned_by']);
  assert.equal(changes.opened.length, 0);
});
