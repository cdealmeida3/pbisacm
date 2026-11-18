import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../../../src/core/reading/csv.ts';
import { copyDescription, copyEpoId, copyName, copyNumber, scaledSampleFiles, scaledSizes } from '../../../tools/powerbi/scaled.ts';
import { probes } from '../../../tools/powerbi/probes.ts';
import { connectorSource } from '../../../tools/powerbi/connector.ts';

/* The invented samples at the size of the real reports (tools/powerbi/scaled.ts, D283): each copy looks like real data. */

const textOf = (files: ReturnType<typeof scaledSampleFiles>, part: string): string[][] =>
  parseCsv(Buffer.from(files.find((file) => file.name.includes(part))!.base64, 'base64').toString('utf8'));

test('a copy gets its own name, EPO ID and description; copy 0 keeps the sample', () => {
  assert.equal(copyName('Index Tool', 0), 'Index Tool');
  assert.equal(copyName('Index Tool', 7), 'C7 Index Tool');
  assert.equal(copyName('', 7), '');
  assert.equal(copyEpoId('AST-0001', 0), 'AST-0001');
  assert.equal(copyEpoId('AST-0001', 1), 'AST-00101');
  assert.equal(copyEpoId('AST-0021', 170), 'AST-17021');
  assert.equal(copyEpoId('', 5), '');
  assert.equal(copyDescription('TBD', 3), 'TBD');
  assert.equal(copyDescription('Index Tool', 3, 'Index Tool'), 'C3 Index Tool');
  assert.equal(copyDescription('Production instance of the index tool', 3), 'Production instance of the index tool (copy 3)');
  assert.equal(copyDescription('<p>Production instance of the index tool</p>', 3), '<p>Production instance of the index tool (copy 3)</p>');
});

test('no EPO ID is on two copies, and the Relationship and EPO reports use the EPO IDs of the CI report', () => {
  const copies = 12;
  const files = scaledSampleFiles(copies);
  const [ciHeader, ...cis] = textOf(files, 'cmdb_ci-sample');
  const name = ciHeader!.indexOf('name');
  const tag = ciHeader!.indexOf('asset_tag');
  const tags = cis.map((row) => row[tag]!).filter((value) => value !== '');
  assert.equal(new Set(tags).size, tags.length, 'every EPO ID once');
  // A name two CIs share (Manage Fines) has both their EPO IDs.
  const tagOf = new Map<string, Set<string>>();
  for (const row of cis) tagOf.set(row[name]!, (tagOf.get(row[name]!) ?? new Set<string>()).add(row[tag]!));

  const [relHeader, ...relationships] = textOf(files, 'cmdb_rel_ci-sample');
  const [parentTag, childTag] = relHeader!.map((value, at) => (value === 'Asset tag' ? at : -1)).filter((at) => at >= 0);
  for (const row of relationships) {
    for (const [end, at] of [[relHeader!.indexOf('Parent'), parentTag!], [relHeader!.indexOf('Child'), childTag!]] as const) {
      if (row[at] !== '' && tagOf.has(row[end]!)) assert.ok(tagOf.get(row[end]!)!.has(row[at]!), `${row[end]} ${row[at]}`);
    }
  }

  const [epoHeader, ...systems] = textOf(files, 'epo-systems-sample');
  const epoId = epoHeader!.map((value) => value.trim().toLowerCase()).indexOf('epoid');
  assert.equal(systems.length, scaledSizes(copies).epoSystems);
  const known = new Set(tags);
  const paired = systems.filter((row) => known.has(row[epoId]!)).length;
  const pairedInSample = textOf(scaledSampleFiles(1), 'epo-systems-sample').slice(1).filter((row) => new Set(textOf(scaledSampleFiles(1), 'cmdb_ci-sample').slice(1).map((ci) => ci[tag]!)).has(row[epoId]!)).length;
  assert.equal(paired, pairedInSample * copies, 'each copy of EPO pairs as the sample does');
  assert.equal(cis.length, scaledSizes(copies).cis);
  assert.equal(relationships.length, scaledSizes(copies).relationships);
});

test('the contract files have their own numbers per copy, the label row once, and the EPO IDs of the CI report', () => {
  assert.equal(copyNumber('CT000001', 0), 'CT000001');
  assert.equal(copyNumber('CT000001', 5), 'CT000001-C5');
  assert.equal(copyNumber('', 5), '');
  const copies = 4;
  const files = scaledSampleFiles(copies);
  const [solusiHeader, labels, ...solusi] = textOf(files, '_solusi-contracts-sample.csv');
  const number = solusiHeader!.indexOf('CONTRACT_NO');
  assert.equal(labels![number], 'Contract No.');
  assert.ok(!solusi.some((row) => row[number] === 'Contract No.'), 'the label row once');
  assert.equal(solusi.length, scaledSizes(copies).solusiContracts);
  assert.equal(new Set(solusi.map((row) => row[number])).size, solusi.length, 'every Solusi number once');
  const [ciHeader, ...cis] = textOf(files, 'cmdb_ci-sample');
  const tags = new Set(cis.map((row) => row[ciHeader!.indexOf('asset_tag')]!));
  const epoId = solusiHeader!.indexOf('CLM_CONTRACT_EPO_ID');
  for (const row of solusi) if (/^AST-/.test(row[epoId]!)) assert.ok(tags.has(row[epoId]!), row[epoId]);
  const [servicenowHeader, ...servicenow] = textOf(files, 'servicenow-contracts-sample');
  assert.equal(servicenow.length, scaledSizes(copies).servicenowContracts);
  const own = servicenow.map((row) => row[servicenowHeader!.indexOf('number')]!);
  assert.equal(new Set(own).size, own.length, 'every ServiceNow number once');
  const numbers = new Set(solusi.map((row) => row[number]!));
  const paired = servicenow.filter((row) => numbers.has(row[servicenowHeader!.indexOf('vendor_contract')]!)).length;
  const [, , ...oneSolusi] = textOf(scaledSampleFiles(1), '_solusi-contracts-sample.csv');
  const oneNumbers = new Set(oneSolusi.map((row) => row[number]!));
  const [, ...oneServiceNow] = textOf(scaledSampleFiles(1), 'servicenow-contracts-sample');
  assert.equal(paired, oneServiceNow.filter((row) => oneNumbers.has(row[servicenowHeader!.indexOf('vendor_contract')]!)).length * copies, 'each copy pairs as the sample does');
});

test('history adds earlier dates of the CI and Relationship report only', () => {
  const names = scaledSampleFiles(2, 2).map((file) => file.name);
  assert.equal(names.filter((file) => file.endsWith('_cmdb_ci-sample.csv')).length, 3);
  assert.equal(names.filter((file) => file.endsWith('_cmdb_rel_ci-sample.csv')).length, 3);
  assert.equal(names.filter((file) => file.includes('epo-systems')).length, 1);
});

test('the probes: one per table of the model, the stages with --stages, and none is a query of powerbi/m', () => {
  const tables = probes(false).map((probe) => probe.name);
  assert.ok(tables.includes('Time.Empty') && tables.includes('Time.Run') && tables.includes('Time.Inventory'));
  // A calculated table (D284) is DAX on Run: Power Query does not load it, so it has no probe.
  assert.ok(!tables.includes('Time.Findings'));
  assert.ok(!tables.some((name) => name.startsWith('Time.Check.')));
  assert.ok(probes(true).some((probe) => probe.name === 'Time.Check.NAME-FORMAT'));
  const names = probes(true).map((probe) => probe.name);
  assert.equal(new Set(names).size, names.length, 'every probe once: a name twice stops the connector from loading');
  const source = connectorSource({ realSize: true, copies: 2, stages: true });
  assert.match(source, /#"RealSize\.Summary" = #"RealSize\.Summary"/);
  assert.match(source, /SacmEval\.Contents = \(optional name as text\)/);
});
