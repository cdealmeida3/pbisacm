import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { parseCsv } from '../../../src/core/reading/csv.ts';
import { runChecks } from '../../../src/core/checks/engine.ts';
import { chooseReports, reportCandidates } from '../../../src/core/memory/finder.ts';
import { archiveFolderOf, removedFolderOf, runFolder } from '../../../src/core/memory/memory.ts';
import { hiddenCharacters, identityKey, nameKey } from '../../../src/core/shared/names.ts';
import { hiddenNotes, missingWanted, peopleCoverage, readCiReport } from '../../../src/core/sources/ci/ci-report.ts';
import { readTable } from '../../../src/core/reading/table.ts';
import { fileKind, folderFixes, neededColumns, recogniseReport } from '../../../src/core/sources/report-types.ts';
import { hiddenNames, matchEnds, readRelationshipReport } from '../../../src/core/sources/relationships/relationship-report.ts';
import { columnIndex, excelDate, parseSheet, readXlsx, readXlsxSheets, withoutPrefixes } from '../../../src/core/reading/xlsx.ts';
import { contractConfig, readContractReport, readSolusiFile } from '../../../src/core/sources/contracts/contract-reports.ts';
import { buildRun } from '../../../src/core/cases/cases.ts';
import { cardSummaries } from '../../../src/app/view/cards.ts';
import { reportTiles } from '../../../src/app/view/tiles.ts';
import { loadPacks, loadReferences } from '../../../src/hosts/cli.ts';
import type { RelationshipRun } from '../../../src/core/sources/relationships/relationship-report.ts';

const root = join(import.meta.dirname, '../../..');
const sample = readFileSync(join(root, 'samples', 'cmdb_ci-sample.csv'), 'utf8');
const relSample = readFileSync(join(root, 'samples', 'cmdb_rel_ci-sample.csv'), 'utf8');
const packs = loadPacks();
const references = loadReferences();
const inflate = async (data: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateRawSync(data));
const ZWSP = '​';

/* ------------------------------------------------------------------ a small .xlsx, built here (invented data) */

/** A zip file: the first part stored, the others deflated, as Office and ServiceNow do it. */
function zip(files: Record<string, string>): Uint8Array {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  Object.keys(files).forEach((name, index) => {
    const raw = Buffer.from(files[name]!, 'utf8');
    const method = index === 0 ? 0 : 8;
    const data = method ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(method, 10);
    entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(nameBytes.length, 28); entry.writeUInt32LE(offset, 42);
    chunks.push(local, nameBytes, data);
    central.push(entry, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  });
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...chunks, directory, end]));
}

const inline = (ref: string, text: string): string => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;

/** A relationship report as ServiceNow exports it: inline strings, a wrong dimension, two Class and two Asset tag columns. */
function relationshipXlsx(): Uint8Array {
  const header = ['Parent', 'Type', 'Child', 'Updated', 'Excluded for calculation', 'Class', 'Asset tag', 'Class', 'Asset tag'];
  const letters = 'ABCDEFGHI';
  const rows = [
    `<row r="1">${header.map((text, at) => inline(`${letters[at]}1`, text)).join('')}</row>`,
    // A hidden character, an escaped one, an entity, a date number, a boolean, an empty cell left out (G2).
    `<row r="2">${inline('A2', `Manage Member Records${ZWSP}`)}${inline('B2', 'Contains::Contained by')}${inline('C2', 'Register a New Member_x200B_')}`
      + `<c r="D2" s="1" t="n"><v>45575.5</v></c><c r="E2" t="b"><v>0</v></c>${inline('F2', 'Business Capability')}`
      + `${inline('H2', 'Business Process')}${inline('I2', 'AST-0002')}</row>`,
    `<row r="3">${inline('A3', 'R&amp;D Platform')}<c r="B3" t="s"><v>0</v></c>${inline('C3', 'Member Engine')}`
      + `<c r="D3" t="n"><v>12.0</v></c>${inline('F3', 'Business Application')}${inline('G3', 'AST-0099')}${inline('H3', 'Business Application')}${inline('I3', 'AST-0004')}</row>`,
    '<row r="4"></row>'
  ];
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    '_rels/.rels': '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<workbook><workbookPr date1904="false"/><sheets><sheet name="Page 1" r:id="rId3" sheetId="1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="sharedStrings.xml" Type="http://x/sharedStrings"/>'
      + '<Relationship Id="rId2" Target="styles.xml" Type="http://x/styles"/><Relationship Id="rId3" Target="worksheets/sheet1.xml" Type="http://x/worksheet"/></Relationships>',
    'xl/sharedStrings.xml': '<sst count="1" uniqueCount="1"><si><r><t>Uses</t></r><r><t xml:space="preserve">::Used by</t></r></si></sst>',
    'xl/styles.xml': '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="22" applyNumberFormat="true"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': `<worksheet><dimension ref="A1"/><sheetData>${rows.join('')}</sheetData></worksheet>`
  });
}

test('xlsx: inline and shared strings, wrong dimension, empty cells by reference, numbers, booleans, dates', async () => {
  const rows = await readXlsx(relationshipXlsx(), inflate);
  assert.equal(rows.length, 3, 'the empty row is left out');
  assert.deepEqual(rows[0], ['Parent', 'Type', 'Child', 'Updated', 'Excluded for calculation', 'Class', 'Asset tag', 'Class', 'Asset tag']);
  assert.deepEqual(rows[1], [`Manage Member Records${ZWSP}`, 'Contains::Contained by', `Register a New Member${ZWSP}`, '2024-10-10 12:00:00', 'false', 'Business Capability', '', 'Business Process', 'AST-0002']);
  assert.deepEqual(rows[2], ['R&D Platform', 'Uses::Used by', 'Member Engine', '12', '', 'Business Application', 'AST-0099', 'Business Application', 'AST-0004']);
});

test('xlsx helpers: column letters, Excel dates', () => {
  assert.equal(columnIndex('A1'), 0);
  assert.equal(columnIndex('Q7'), 16);
  assert.equal(columnIndex('AA3'), 26);
  assert.equal(excelDate(45575), '2024-10-10');
  assert.equal(excelDate(1, true), '1904-01-02');
  // Past 31 Dec 9999 (or before 1900) is no date: Power BI cannot read it either (D350).
  assert.equal(excelDate(2958465), '9999-12-31');
  assert.equal(excelDate(2958800), '');
  assert.equal(excelDate(-1), '');
  assert.deepEqual(parseSheet({ sheet: '<row><c><v>1</v></c><c t="str"><v>a&lt;b</v></c></row>' }), [['1', 'a<b']]);
});

test('readTable: the format comes from the content; a CSV keeps hidden characters only with a BOM or when it holds some', async () => {
  const xlsx = await readTable(relationshipXlsx(), inflate);
  assert.equal(xlsx.format, 'xlsx');
  assert.equal(xlsx.lossless, true);
  const csv = await readTable(new TextEncoder().encode(sample), inflate);
  assert.equal(csv.format, 'csv');
  assert.equal(csv.lossless, false);
  assert.equal((await readTable(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(sample)]), inflate)).lossless, true);
});

test('report type from the columns: CI report, Relationship report, or a clear message', () => {
  assert.equal(recogniseReport(parseCsv(sample)[0]!).type?.kind, 'ci');
  assert.equal(recogniseReport(parseCsv(relSample)[0]!).type?.kind, 'relationship');
  // A CMDB Health result and the contract–CI links are known files, never a report type (D341, D342).
  const health = recogniseReport(['description', 'ci', 'ci.asset_tag', 'ci.sys_class_name', 'ci.owned_by']);
  assert.equal(health.type, null);
  assert.equal(health.known?.kind, 'health');
  assert.match(health.message, /never the CI report/);
  assert.equal(fileKind(['ast_contract', 'ast_contract.sys_tags', 'ci_item', 'ci_item.sys_class_name']), 'links');
  assert.equal(fileKind(['Number', 'Short description']), 'unknown');
  assert.equal(fileKind(['name', 'sys_class_name']), 'ci');
  const unknown = recogniseReport(['Number', 'Short description', 'Parent']);
  assert.equal(unknown.type, null);
  assert.match(unknown.message, /CI report needs Name, Class \(missing: Name, Class\)/);
  assert.match(unknown.message, /Relationship report needs Parent, Type, Child \(missing: Type, Child\)/);
});

test('Relationship report: the two Class and Asset tag columns are read by position (first parent, then child)', async () => {
  const read = readRelationshipReport(await readXlsx(relationshipXlsx(), inflate));
  assert.equal(read.relationships.length, 2);
  assert.deepEqual(read.relationships[1], {
    parent: 'R&D Platform', type: 'Uses::Used by', child: 'Member Engine',
    parentClass: 'business_application', childClass: 'business_application', parentTag: 'AST-0099', childTag: 'AST-0004', excluded: false
  });
  assert.equal(read.relationships[0]!.parentClass, 'business_capability');
  assert.equal(read.relationships[0]!.childClass, 'business_process');
});

test('Relationship report: the field-name form and the CSV form', () => {
  const fields = readRelationshipReport([
    ['parent', 'type', 'child', 'child.sys_class_name', 'parent.sys_class_name', 'parent.asset_tag', 'child.asset_tag'],
    ['A', 'Depends on::Used by', 'B', 'cmdb_ci_service_auto', 'cmdb_ci_business_app', 'T1', 'T2'],
    ['', 'Depends on::Used by', 'B', '', '', '', '']
  ]);
  assert.deepEqual(fields.relationships, [{ parent: 'A', type: 'Depends on::Used by', child: 'B', parentClass: 'business_application', childClass: 'service_instance', parentTag: 'T1', childTag: 'T2' }]);
  assert.equal(fields.skipped, 1);
  const csv = readRelationshipReport(parseCsv(relSample));
  assert.equal(csv.relationships.length, 15);
  assert.equal(csv.relationships[4]!.childClass, 'service_instance');
  // "Excluded for calculation" (D131): the sample excludes one relationship; every other one passes criticality.
  assert.deepEqual(csv.relationships.filter((item) => item.excluded).map((item) => `${item.parent} > ${item.child}`), ['Index Tool > Index Tool - PROD']);
  assert.ok(csv.relationships.every((item) => item.excluded !== undefined));
  assert.equal(readRelationshipReport([['parent', 'type', 'child', 'u_excluded_from_calculation'], ['A', 'x', 'B', 'Yes']]).relationships[0]!.excluded, true);
  // The scoped-app prefix of the instance's own fields (D351): matched by the end of the name.
  assert.equal(readRelationshipReport([['parent', 'type', 'child', 'x_demo_crit_excluded_for_calculation'], ['A', 'x', 'B', 'true']]).relationships[0]!.excluded, true);
  assert.equal(readRelationshipReport([['parent', 'type', 'child', 'notexcluded_for_calculation'], ['A', 'x', 'B', 'true']]).relationships[0]!.excluded, undefined);
  // Without the column: nothing is excluded, and the report says so.
  const one = readRelationshipReport([['Parent', 'Type', 'Child', 'Class'], ['A', 'x', 'B', 'API']]);
  assert.ok(one.notes.some((note) => /only one Class column/.test(note)));
  assert.ok(one.notes.some((note) => /no column "Excluded for calculation", so every relationship passes criticality/.test(note)));
  assert.equal(one.relationships[0]!.excluded, undefined);
});

test('names: hidden characters do not count for matching; the shown name is kept; identity shows them as "?"', () => {
  assert.equal(nameKey(`Manage${ZWSP} Events  Plan`), 'manage events plan');
  assert.equal(identityKey(`Manage Events${ZWSP}`), 'manage events?');
  assert.equal(identityKey('Manage Events?'), 'manage events?');
  assert.deepEqual(hiddenCharacters(`a${ZWSP}b${ZWSP}﻿`), ['zero-width space (U+200B)', 'zero-width no-break space (U+FEFF)']);
  const report = readCiReport(parseCsv(sample.replace('Manage Events,', `Manage Events${ZWSP},`)));
  assert.equal(report.cis.filter((ci) => ci.key === 'manage events?')[0]!.name, `Manage Events${ZWSP}`);
});

test('relationship ends match the CIs: a CSV "?" matches the hidden character of the .xlsx', async () => {
  const csvWithQuestion = sample.replace('Manage Member Records,', 'Manage Member Records?,').replace('Register a New Member,', 'Register a New Member?,');
  const cis = readCiReport(parseCsv(csvWithQuestion)).cis;
  const relationships = readRelationshipReport(await readXlsx(relationshipXlsx(), inflate)).relationships;
  const match = matchEnds(relationships, cis.map((ci) => ci.key));
  assert.equal(match.ends, 4);
  assert.equal(match.unmatched, 1, 'only "R&D Platform", which is not in the sample');
  assert.equal(match.hidden, 2);
  // Without the hidden-character rule these two would not match.
  assert.equal(cis.some((ci) => ci.key === nameKey(`Manage Member Records${ZWSP}`)), false);
  assert.equal(matchEnds(readRelationshipReport(parseCsv(relSample)).relationships, readCiReport(parseCsv(sample)).cis.map((ci) => ci.key)).unmatched, 0);
});

const hiddenFindings = (csv: string, options: Parameters<typeof readCiReport>[1]) => {
  const report = readCiReport(parseCsv(csv), options);
  const result = runChecks(report.cis, report.columns, packs, references);
  return { report, result, found: result.findings.filter((finding) => finding.checkId === 'NAME-HIDDEN-CHAR') };
};

test('NAME-HIDDEN-CHAR: found in a file that keeps hidden characters; never a silent pass on a CSV', () => {
  const withHidden = sample.replace('Manage Member Records,', `Manage Member Records${ZWSP},`);
  const inFile = hiddenFindings(withHidden, {});
  assert.deepEqual(inFile.found.map((finding) => finding.ciName), [`Manage Member Records${ZWSP}`]);
  assert.match(inFile.found[0]!.detail, /zero-width space \(U\+200B\)/);
  assert.equal(inFile.report.hiddenFrom, 'file');
  // SACM fixes it itself (D74, D170): the finding carries the line of the fix list, the name with "?" where the character is.
  assert.deepEqual(inFile.found[0]!.fix, { change: 'Remove the hidden character from the name', current: 'Manage Member Records?', set: 'The same name without the hidden character', value: 'Manage Member Records' });

  const plain = hiddenFindings(sample.replace('Manage Member Records,', 'Manage Member Records?,'), {});
  assert.equal(plain.found.length, 0);
  assert.equal(plain.result.tested.some((entry) => entry.startsWith('NAME-HIDDEN-CHAR')), false);
  assert.match(plain.result.notes.filter((note) => note.checkId === 'NAME-HIDDEN-CHAR')[0]!.note, /CSV report cannot show hidden characters/);
  assert.match(hiddenNotes(plain.report)[0]!, /1 names show "\?"/);

  const known = new Map([[identityKey(`Manage Member Records${ZWSP}`), ['zero-width space (U+200B)']]]);
  const fromRelationships = hiddenFindings(sample.replace('Manage Member Records,', 'Manage Member Records?,'), { knownHidden: known });
  assert.deepEqual(fromRelationships.found.map((finding) => finding.ciName), ['Manage Member Records?']);
  assert.match(hiddenNotes(fromRelationships.report)[0]!, /Partly tested/);
});

test('hiddenNames: the names of a Relationship report that hold hidden characters', async () => {
  const names = hiddenNames(readRelationshipReport(await readXlsx(relationshipXlsx(), inflate)).relationships);
  assert.deepEqual(Array.from(names.keys()).sort(), ['manage member records?', 'register a new member?']);
});

test('the folder lists .csv and .xlsx reports, not Office lock files', () => {
  const found = reportCandidates([
    { path: 'reports/2026-11-12_cmdb_rel_ci.xlsx', name: '2026-11-12_cmdb_rel_ci.xlsx', modified: 1 },
    { path: 'reports/~$2026-11-12_cmdb_rel_ci.xlsx', name: '~$2026-11-12_cmdb_rel_ci.xlsx', modified: 2 },
    { path: 'reports/notes.txt', name: 'notes.txt', modified: 3 },
    { path: 'cmdb_ci.csv', name: 'cmdb_ci.csv', modified: Date.parse('2026-11-10T10:00:00Z') }
  ], 0);
  assert.deepEqual(found.map((file) => file.path), ['reports/2026-11-12_cmdb_rel_ci.xlsx', 'cmdb_ci.csv']);
});

test('folders: CI runs stay in data/runs/, other kinds in a subfolder; removed loads are kept', () => {
  assert.equal(runFolder(), 'data/runs');
  assert.equal(runFolder('relationship'), 'data/runs/relationships');
  assert.equal(archiveFolderOf('2026-11-12_x.json'), 'data/archive/2026-11');
  assert.equal(archiveFolderOf('2026-11-12_x.json', 'relationship'), 'data/archive/2026-11/relationships');
  assert.equal(removedFolderOf('2026-11-12_x.json'), 'data/archive/2026-11/removed');
});

function ciRun(date: string) {
  const report = readCiReport(parseCsv(sample));
  const run = buildRun(report.cis, runChecks(report.cis, report.columns, packs, references), packs, date, 'cmdb_ci.csv', references);
  return { ...run, loadedBy: 'ana@example.com', loadedByName: 'Ana', loadedAt: `${date}T08:15:00` };
}

test('Reports strip: one tile per report type, who loaded it, and a warning when the report is old', () => {
  const relationship: RelationshipRun = {
    kind: 'relationship', date: '2026-11-05', report: 'cmdb_rel_ci.xlsx', loadedByName: 'Ben', loadedAt: '2026-11-05T09:00:00',
    relationships: readRelationshipReport(parseCsv(relSample)).relationships, notes: []
  };
  const tiles = reportTiles(ciRun('2026-11-12'), relationship, '2026-11-12', 3);
  assert.deepEqual(tiles.map((tile) => tile.type.kind), ['ci', 'relationship', 'epo', 'solusi', 'contract']);
  assert.equal(tiles[0]!.load!.loadedByName, 'Ana');
  assert.match(tiles[0]!.load!.summary, /^19 CIs · \d+ findings to solve$/);
  assert.equal(tiles[0]!.stale, false);
  assert.equal(tiles[1]!.stale, true);
  assert.equal(tiles[1]!.ageDays, 7);
  assert.equal(tiles[1]!.load!.summary, '15 relationships');
  assert.equal(tiles[1]!.load!.details[0], 'Every parent and child is a CI of the CI report.');
  const empty = reportTiles(undefined, null, '2026-11-12', 3);
  assert.equal(empty.every((tile) => tile.load === null && !tile.stale), true);
  // A run saved before version 0.7 has no loadedBy.
  const old = { ...ciRun('2026-11-12'), loadedBy: undefined, loadedByName: undefined, loadedAt: undefined };
  assert.equal(reportTiles(old, null, '2026-11-12', 3)[0]!.load!.loadedByName, '');
});

test('relationship cards stay grey without the Relationship report, and say to run the checks again when it came later', () => {
  const run = ciRun('2026-11-12');
  const cards = cardSummaries(packs, run, [], new Map(), 5509);
  const relationshipCards = cards.filter((card) => card.pack.family === 'relationships');
  // Nine relationship checks (with the mapping backlog), one switched off (Relationship to a Retired CI): eight cards.
  assert.equal(relationshipCards.length, 8);
  for (const card of relationshipCards) assert.equal(card.light, 'grey', card.id);
  assert.deepEqual(cards.filter((card) => card.id === 'REL-MISSING')[0]!.notes, ['A Relationship report is loaded (5,509 relationships), but after this CI report. Press Check again under Reports.']);
  assert.match(cardSummaries(packs, run, [], new Map()).filter((card) => card.id === 'REL-MISSING')[0]!.notes[0]!, /no Relationship report/);
});

/* ------------------------------------------------------------------ an .xlsx with two tabs (the Solusi contract file) */

/** Two tabs as the Solusi contract file has them: field names in row 1, labels in row 2, another column order on the second tab. */
function solusiXlsx(): Uint8Array {
  const letters = 'ABCDEFGH';
  const row = (number: number, cells: string[]): string => `<row r="${number}">${cells.map((text, at) => (text ? inline(`${letters[at]}${number}`, text) : '')).join('')}</row>`;
  const dated = (number: number, cells: string[], serial: string): string =>
    `<row r="${number}">${cells.map((text, at) => inline(`${letters[at]}${number}`, text)).join('')}<c r="${letters[cells.length]}${number}" s="1" t="n"><v>${serial}</v></c></row>`;
  const active = [
    row(1, ['CONTRACT_NO', 'CONTRACT_STATUS', 'PARTNER_NAME', 'CONTRACT_NAME', 'CONTRACT_END']),
    row(2, ['Contract No.', 'Status', 'Company name', 'Name', 'Contract end']),
    dated(3, ['CT000001', 'S - Concluded', 'Example Software Ltd', 'Example Software - licence'], '46752'),
    row(4, ['CT000002', 'S - Concluded', 'Example Consulting Ltd', 'Example Consulting - framework'])
  ];
  const terminated = [
    row(1, ['CONTRACT_STATUS', 'CONTRACT_NO', 'CONTRACT_NAME', 'PARTNER_NAME', 'TERMINATION_DATE']),
    row(2, ['Status', 'Contract', 'Name', 'Company name', 'Termination date']),
    dated(3, ['T - Terminated', 'CT000009', 'Example Hosting - hosting', 'Example Hosting Ltd'], '46330')
  ];
  const sheet = (rows: string[]): string => `<worksheet><sheetData>${rows.join('')}</sheetData></worksheet>`;
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    '_rels/.rels': '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<workbook><sheets><sheet name="Active contracts" r:id="rId1" sheetId="1"/><sheet name="Terminated last 7 days" r:id="rId2" sheetId="2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://x/worksheet"/>'
      + '<Relationship Id="rId2" Target="worksheets/sheet2.xml" Type="http://x/worksheet"/><Relationship Id="rId3" Target="styles.xml" Type="http://x/styles"/></Relationships>',
    'xl/styles.xml': '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="true"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': sheet(active),
    'xl/worksheets/sheet2.xml': sheet(terminated)
  });
}

test('xlsx with two tabs: every tab is read, and the Solusi contract file is recognised by its columns', async () => {
  const sheets = await readXlsxSheets(solusiXlsx(), inflate);
  assert.deepEqual(sheets.map((sheet) => sheet.name), ['Active contracts', 'Terminated last 7 days']);
  assert.equal((await readXlsx(solusiXlsx(), inflate)).length, 4);
  const table = await readTable(solusiXlsx(), inflate);
  assert.equal(table.sheets!.length, 2);
  assert.equal(recogniseReport(table.rows[0]!).type!.kind, 'solusi');
  // A workbook with one tab has no `sheets`: nothing changes for the other reports.
  assert.equal((await readTable(relationshipXlsx(), inflate)).sheets, undefined);

  const references = JSON.parse(readFileSync(new URL('../../../checks/reference/contract-reports.json', import.meta.url), 'utf8')) as unknown;
  const read = readSolusiFile(table.sheets!, contractConfig({ 'reference/contract-reports': references })!);
  // The label row is left out; dates are read from the Excel number; the second tab has another column order.
  assert.deepEqual(read.contracts.map((contract) => [contract.number, contract.sheet, contract.end, contract.terminated, contract.vendor]), [
    ['CT000001', 'active', '2027-12-31', '', 'Example Software Ltd'],
    ['CT000002', 'active', '', '', 'Example Consulting Ltd'],
    ['CT000009', 'terminated', '', '2026-11-04', 'Example Hosting Ltd']
  ]);
});

test('the ServiceNow contract report is recognised by its columns, and is not taken for a CI report', () => {
  assert.equal(recogniseReport(['number', 'state', 'short_description', 'vendor_contract', 'sys_class_name']).type!.kind, 'contract');
  assert.equal(recogniseReport(['Name', 'Class', 'Operational status']).type!.kind, 'ci');
});

/* ------------------------------------------------------------------ R2: the real shapes (invented data) */

test('xlsx: a workbook whose XML names its elements with a prefix (<x:row>) is read the same (D350)', async () => {
  const prefixed = (xml: string): string => xml.replace(/<(\/?)(?!\?)([a-zA-Z])/g, '<$1x:$2');
  assert.equal(withoutPrefixes('<x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c></x:row>'), '<row r="1"><c r="A1" t="s"><v>0</v></c></row>');
  assert.equal(withoutPrefixes('<sheet name="a" r:id="rId1"/>'), '<sheet name="a" r:id="rId1"/>');
  const header = ['CONTRACT_NO', 'CONTRACT_STATUS', 'PARTNER_NAME', 'CONTRACT_END'];
  const rows = `<row r="1">${header.map((text, at) => `<c r="${'ABCD'[at]}1" t="s"><v>${at}</v></c>`).join('')}</row>`
    + `<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" s="1"><v>2958800</v></c></row>`;
  const strings = [...header, 'C-1', 'Concluded', 'Partner &amp; Co'].map((text) => `<si><t>${text}</t></si>`).join('');
  const book = zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
    '_rels/.rels': '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': prefixed('<?xml version="1.0"?><workbook><sheets><sheet name="Active contracts" r:id="rId3" sheetId="1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="sharedStrings.xml" Type="http://x/sharedStrings"/>'
      + '<Relationship Id="rId2" Target="styles.xml" Type="http://x/styles"/><Relationship Id="rId3" Target="worksheets/sheet1.xml" Type="http://x/worksheet"/></Relationships>',
    'xl/sharedStrings.xml': prefixed(`<sst count="7">${strings}</sst>`),
    'xl/styles.xml': prefixed('<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'),
    'xl/worksheets/sheet1.xml': prefixed(`<worksheet><sheetData>${rows}</sheetData></worksheet>`)
  });
  const sheets = await readXlsxSheets(book, inflate);
  assert.equal(sheets[0]!.name, 'Active contracts');
  // The date number past 31 Dec 9999 is an empty cell, so the row keeps its other cells.
  assert.deepEqual(sheets[0]!.rows, [header, ['C-1', 'Concluded', 'Partner & Co', '']]);
});

test('ServiceNow contract report: the criticality columns are matched by the end of their name, whatever the prefix (D351)', () => {
  const config = contractConfig(references)!;
  const header = ['number', 'vendor_contract', 'state', 'x_demo_crit_inherited_confidentiality', 'x_demo_crit_inherited_integrity'];
  const read = readContractReport([header, ['CNTR1', 'C-1', 'Active', '3', ''], ['CNTR2', 'C-2', 'Active', '', '']], config);
  assert.deepEqual(read.contracts.map((contract) => contract.criticality), [true, false]);
  assert.ok(!read.notes.some((note) => /criticality/.test(note)), read.notes.join(' '));
  assert.ok(readContractReport([['number', 'vendor_contract', 'state'], ['CNTR1', 'C-1', 'Active']], config).notes.some((note) => /criticality/.test(note)));
});

test('one report per type and day, chosen by its content (D348): columns, then rows, then the last change, then the name', () => {
  const file = (name: string, columns: number, rows: number, modified = 0, kind = 'ci', date = '2026-11-19') => ({ name, kind, date, columns, rows, modified });
  assert.equal(neededColumns('epo', ['\uFEFFName', 'name', ' Class ', '']), 2);
  // A CI report counts the columns the checks read: an extra column does not make it fuller.
  assert.equal(neededColumns('ci', ['name', 'sys_class_name', 'u_extra']), 2);
  const fuller = chooseReports([file('b.csv', 40, 10), file('a.csv', 52, 5)]);
  assert.deepEqual(fuller.map((choice) => choice.used), [false, true]);
  assert.equal(fuller[0]!.whyNotUsed, 'Not used: a.csv of the same day has more of the needed columns (52 against 40), so it is used.');
  assert.match(chooseReports([file('a.csv', 52, 3277), file('b.csv', 52, 131)])[1]!.whyNotUsed, /a\.csv of the same day has more rows \(3277 against 131\)/);
  assert.match(chooseReports([file('a.csv', 5, 5, 2), file('b.csv', 5, 5, 1)])[1]!.whyNotUsed, /same columns and rows and is used \(it was saved later\)\. Move this copy/);
  // Same columns, rows and time: the last file name, as before (2026-11-19_cmdb… comes after 2026-11-19_1cmdb…).
  const copies = chooseReports([file('2026-11-19_cmdb_logical_automation.csv', 5, 5), file('2026-11-19_1cmdb_logical_automation.csv', 5, 5)]);
  assert.deepEqual(copies.map((choice) => choice.used), [true, false]);
  assert.match(copies[1]!.whyNotUsed, /\(the last file name\)/);
  // Another day or another type is its own choice.
  assert.deepEqual(chooseReports([file('a.csv', 5, 5), file('b.csv', 1, 1, 0, 'ci', '2026-11-18'), file('c.csv', 1, 1, 0, 'epo')]).map((choice) => choice.used), [true, true, true]);
});

test('what to fix in the folder (D352): a missing type, the CI columns to add, the files not used, then the known files', () => {
  const at = { date: '2026-11-19', whyNotUsed: '', message: '' };
  const files = [
    { ...at, name: '2026-11-19_health.csv', kind: 'health', used: false, message: 'A CMDB Health result: known.' },
    { ...at, name: '2026-11-19_cmdb.csv', kind: 'ci', used: true },
    { ...at, name: '2026-11-19_1cmdb.csv', kind: 'ci', used: false, whyNotUsed: 'Not used: copy.' },
    { ...at, name: '2026-11-19_x.csv', kind: 'unknown', used: false, message: 'Not a report.' },
    ...['relationship', 'epo', 'solusi'].map((kind) => ({ ...at, name: `${kind}.csv`, kind, used: true }))
  ];
  const fixes = folderFixes(files, { name: '2026-11-19_cmdb.csv', date: '2026-11-19', missing: ['support_group.active', 'sys_created_on'] });
  assert.deepEqual(fixes.map((fix) => [fix.name, fix.readAs, fix.level]), [
    ['No ServiceNow contract report', 'ServiceNow contract report', 'fix'], ['2026-11-19_cmdb.csv', 'CI report', 'fix'], ['Columns to add', 'CI report', 'fix'],
    ['2026-11-19_1cmdb.csv', 'CI report', 'fix'], ['2026-11-19_x.csv', 'Not a report', 'fix'], ['2026-11-19_health.csv', 'CMDB Health result', 'known']
  ]);
  assert.equal(fixes[1]!.what, 'Lacks 2 columns the checks read, so some cards are grey or partly tested. Add them to the ServiceNow report: copy the next line (right-click it, Copy, Copy value).');
  // The next line holds the columns alone, so a copy is the list and nothing else (D347).
  assert.equal(fixes[2]!.what, 'support_group.active, sys_created_on');
  assert.deepEqual(folderFixes(files.filter((file) => file.kind !== 'health' && file.used).concat([{ ...at, name: 'c.csv', kind: 'contract', used: true }]), null), []);
});

test('the CI report columns to add (D347): the field names the checks read that the report lacks', () => {
  const report = readCiReport(parseCsv(sample));
  assert.deepEqual(missingWanted(report.columns), ['owned_by.manager.user_name', 'ref_cmdb_ci_service.u_platform', 'ref_cmdb_ci_service.parent']);
  assert.deepEqual(missingWanted(readCiReport([['name', 'sys_class_name']]).columns).slice(0, 3), ['asset_tag', 'operational_status', 'short_description']);
});

test('the people of the CI report for the Data check (build R3): name, email, user ID, active, per role and for the manager of Owned by', () => {
  const rows = [
    ['name', 'sys_class_name', 'owned_by', 'owned_by.email', 'owned_by.active', 'owned_by.manager', 'owned_by.manager.email', 'managed_by'],
    ['A', 'cmdb_ci_service', 'Ann Owner', 'ann@example.com', 'true', 'Mo Manager', 'mo@example.com', 'Bo'],
    ['B', 'cmdb_ci_service', 'Cy Owner', '', 'false', '', '', ''],
    ['C', 'cmdb_ci_service', '', '', '', '', '', '']
  ];
  const report = readCiReport(rows);
  const [owned, managed, supported, manager] = peopleCoverage(report.cis, report.columns);
  assert.deepEqual(owned, { role: 'owned_by', label: 'Owned by', inReport: true, cis: 3, name: 2, email: 1, userId: 0, active: 1, inactive: 1, notSaid: 0 });
  // Managed by has no column active: a named person has no word on it.
  assert.deepEqual(managed, { role: 'managed_by', label: 'Managed by', inReport: true, cis: 3, name: 1, email: 0, userId: 0, active: 0, inactive: 0, notSaid: 1 });
  assert.deepEqual(supported, { role: 'supported_by', label: 'Supported by', inReport: false, cis: 3, name: 0, email: 0, userId: 0, active: 0, inactive: 0, notSaid: 0 });
  assert.equal(manager!.label, 'Manager of Owned by');
  assert.deepEqual([manager!.inReport, manager!.name, manager!.email, manager!.notSaid], [true, 1, 1, 1]);
});
