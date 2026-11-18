import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPABILITY_COLUMNS, capabilitySheet } from '../../../src/core/mapping/capability-sheet.ts';
import { readCiReport } from '../../../src/core/sources/ci/ci-report.ts';
import { readRelationshipReport } from '../../../src/core/sources/relationships/relationship-report.ts';
import { loadReferences } from '../../../src/hosts/cli.ts';

/* Invented data only. The capability sheet (D205). */

const references = loadReferences();
const HEAD = ['name', 'sys_class_name', 'operational_status', 'short_description', 'sys_tags', 'owned_by', 'owned_by.active'];

test('every capability with what is above and below it, its description, tags and people', () => {
  const report = readCiReport([HEAD,
    ['Host', 'Business Capability', 'Ready', 'Hosting events', 'Core', 'Ann Owner', 'false'],
    ['Host for schools', 'Business Capability', 'Ready', '', '', '', ''],
    ['Approve a booking', 'Business Process', 'Operational', '', '', '', ''],
    ['Old booking', 'Business Process', 'Retired', '', '', '', ''],
    ['Fines_BA', 'Business Application', 'Operational', '', '', '', '']]);
  const relationships = readRelationshipReport([['Parent', 'Type', 'Child'],
    ['Host', 'Provided by::Provides', 'Host for schools'], ['Host for schools', 'Provided by::Provides', 'Approve a booking'], ['Host for schools', 'Provided by::Provides', 'Old booking']]).relationships;
  const sheet = capabilitySheet(report.cis, relationships, references)!;
  assert.equal(CAPABILITY_COLUMNS.length, 10);
  assert.deepEqual(sheet, [
    ['Host', 'Ready', '', 'Host for schools', '', 'Hosting events', 'Core', 'Ann Owner (inactive)', '', ''],
    // A Retired process below is not counted.
    ['Host for schools', 'Ready', 'Host', '', 'Approve a booking', '', '', '', '', '']
  ]);
  assert.equal(capabilitySheet(report.cis, null, references), null);
});
