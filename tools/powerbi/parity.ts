// Compares what the Power Query of the model gives on the invented samples (the output of PQTest, one JSON file per
// table, written by the CI job "powerbi-eval") with the answer key: the TypeScript logic of src/core/ and the recorded
// result of tests/recorded/. Any difference fails, line by line.
//   node tools/powerbi/parity.ts <folder with <Table>.json>
// Also checked: every table gives exactly the columns its TMDL file declares, so a refresh in Power BI Desktop does not
// stop on a missing column.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { readTable } from '../../src/core/reading/table.ts';
import { recogniseReport } from '../../src/core/sources/report-types.ts';
import { PERSON_PARTS, readCiReport } from '../../src/core/sources/ci/ci-report.ts';
import { readRelationshipReport } from '../../src/core/sources/relationships/relationship-report.ts';
import { epoConfig, readEpoReport } from '../../src/core/sources/epo/epo-report.ts';
import { contractConfig, readContractReport, readSolusiFile } from '../../src/core/sources/contracts/contract-reports.ts';
import { DIMENSIONS, ROLES } from '../../src/core/model/model.ts';
import { loadPackFiles, loadReferences } from '../../src/hosts/cli.ts';
import { EARLIER, RECORD_DATE, SAMPLE_FILES } from '../../tests/sample-record.ts';
import { pascal } from './generate.ts';
import { readTables } from './tmdl.ts';
import { unitCases, unitQueryNames } from './units.ts';
import { recordSearch } from '../../src/core/cases/record-search.ts';
import { buildGraph, CLASS_WORDS } from '../../src/core/checks/detectors/relationship-detectors.ts';
import type { RelationshipModel } from '../../src/core/checks/detectors/relationship-detectors.ts';
import { systemsById } from '../../src/core/sources/epo/epo-report.ts';
import { epoCorrection } from '../../src/app/view/cases.ts';
import { mappingConfig, stagesFor } from '../../src/core/mapping/backlog.ts';
import type { Case, Run } from '../../src/core/cases/cases.ts';
import type { CiPeople } from '../../src/app/view/people.ts';

type Row = Record<string, unknown>;

/** The rows PQTest returned for one query (its "Output"), or an error when the query failed. */
export function outputOf(folder: string, name: string): Row[] {
  const text = readFileSync(join(folder, `${name}.json`), 'utf8').replace(/^﻿/, '');
  const runs = JSON.parse(text) as Array<{ Status?: string; Output?: unknown; Error?: unknown }>;
  const run = Array.isArray(runs) ? runs[0] : runs;
  if (!run || run.Status !== 'Passed' || !Array.isArray(run.Output)) throw new Error(`${name}: the query failed: ${JSON.stringify(run?.Error ?? run).slice(0, 2000)}`);
  return run.Output as Row[];
}

/** A value as the comparison writes it: dates as yyyy-mm-dd, empty and null as "". */
const norm = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T00:00:00/.test(value)) return value.slice(0, 10);
  return String(value);
};

const utf8 = new TextDecoder('utf-8');
const tableOf = (path: string) => readTable(new Uint8Array(readFileSync(path)), async (data) => new Uint8Array(inflateRawSync(data)), (data) => utf8.decode(data));

/** The differences between found rows and expected rows, matched by `key`, on the given fields. */
function compare(what: string, found: Row[], expected: Row[], key: string, fields: string[]): string[] {
  const problems: string[] = [];
  if (found.length !== expected.length) problems.push(`${what}: ${found.length} rows, expected ${expected.length}`);
  const byKey = new Map(found.map((row) => [norm(row[key]), row]));
  for (const want of expected) {
    const got = byKey.get(norm(want[key]));
    if (!got) { problems.push(`${what}: no row ${key} = ${norm(want[key])}`); continue; }
    for (const field of fields) {
      if (norm(got[field]) !== norm(want[field])) problems.push(`${what} ${norm(want[key])}: ${field} is "${norm(got[field])}", expected "${norm(want[field])}"`);
    }
  }
  return problems;
}


export async function parityProblems(folder: string): Promise<string[]> {
  const problems: string[] = [];
  const outputs = new Map<string, Row[]>();
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.json'))) {
    const name = file.replace(/\.json$/, '');
    try { outputs.set(name, outputOf(folder, name)); } catch (error) { problems.push((error as Error).message); }
  }
  const rows = (name: string): Row[] => outputs.get(name) ?? [];

  // 1. Every table: the columns of its TMDL file, no more, no less.
  for (const table of readTables()) {
    if (!outputs.has(table.name)) { if (!problems.some((problem) => problem.startsWith(`${table.name}:`))) problems.push(`${table.name}: no output`); continue; }
    const first = rows(table.name)[0];
    if (!first) continue;
    const got = Object.keys(first).sort().join(', ');
    const declared = table.columns.map((column) => column.sourceColumn).sort().join(', ');
    if (got !== declared) problems.push(`${table.name}: the query gives the columns [${got}], the TMDL file declares [${declared}]`);
  }

  // 2. The reading functions, case by case.
  const units = new Map(unitQueryNames().flatMap((name) => rows(name)).map((row) => [`${norm(row.Name)}|${norm(row.Input)}`, norm(row.Got)]));
  for (const item of unitCases()) {
    const got = units.get(`${item.name}|${item.input}`);
    if (got !== item.expected) problems.push(`${item.name}(${JSON.stringify(item.input)}): Power Query gives ${JSON.stringify(got)}, src/core gives ${JSON.stringify(item.expected)}`);
  }

  // 3. The report files: the type of each sample by its columns, and how many rows its reader reads.
  const references = loadReferences();
  const contracts = contractConfig(references)!;
  const files = [
    { file: SAMPLE_FILES.ci, date: RECORD_DATE }, { file: SAMPLE_FILES.relationship, date: RECORD_DATE }, { file: SAMPLE_FILES.epo, date: RECORD_DATE },
    { file: SAMPLE_FILES.solusi, date: RECORD_DATE }, { file: SAMPLE_FILES.contracts, date: RECORD_DATE }, { file: SAMPLE_FILES.solusiEarlier, date: EARLIER }
  ];
  const expectedFiles: Row[] = [];
  const read: Record<string, Awaited<ReturnType<typeof tableOf>>> = {};
  for (const { file, date } of files) {
    const table = await tableOf(file.path);
    read[file.name] = table;
    const kind = recogniseReport(table.rows[0] ?? []).type?.kind ?? '';
    const count = kind === 'ci' ? readCiReport(table.rows).cis.length
      : kind === 'relationship' ? readRelationshipReport(table.rows).relationships.length
      : kind === 'epo' ? readEpoReport(table.rows, epoConfig(references)!).systems.length
      : kind === 'solusi' ? readSolusiFile(table.sheets ?? [{ name: '', rows: table.rows }], contracts).contracts.length
      : kind === 'contract' ? readContractReport(table.rows, contracts).contracts.length : table.rows.length - 1;
    expectedFiles.push({ FileName: `${date}_${file.name}`, ReportDate: date, Kind: kind, Rows: count, Format: table.format, Columns: (table.rows[0] ?? []).length });
  }
  problems.push(...compare('ReportFiles', rows('ReportFiles'), expectedFiles, 'FileName', ['ReportDate', 'Kind', 'Rows', 'Format', 'Columns']));

  // 4. Inventory: every CI with the canonical columns of src/core/sources/ci/ci-report.ts.
  const cis = readCiReport(read[SAMPLE_FILES.ci.name]!.rows).cis;
  // One column per role and per part of PERSON_PARTS, as the generator writes them (manager.email is managerEmail).
  const roleFields: Array<[string, (ci: (typeof cis)[number]) => unknown]> = [];
  const personKey = (part: string): string => part.replace(/\.(\w)/g, (_, letter: string) => letter.toUpperCase());
  for (const role of ROLES) {
    roleFields.push([pascal(role), (ci) => ci.roles[role]?.name]);
    for (const part of Object.keys(PERSON_PARTS)) roleFields.push([pascal(role) + pascal(part), (ci) => (ci.roles[role] as Record<string, unknown> | undefined)?.[personKey(part)]]);
  }
  const levelFields: Array<[string, (ci: (typeof cis)[number]) => unknown]> = [];
  for (const kind of ['target', 'inherited'] as const) for (const dimension of DIMENSIONS) levelFields.push([pascal(kind) + pascal(dimension), (ci) => ci[kind][dimension]]);
  const ciFields: Array<[string, (ci: (typeof cis)[number]) => unknown]> = [
    ['Name', (ci) => ci.name], ['Class', (ci) => ci.className], ['SourceClass', (ci) => ci.sourceClass], ['AssetTag', (ci) => ci.assetTag],
    ['Status', (ci) => ci.operationalStatus], ['Description', (ci) => ci.description], ['SupportGroup', (ci) => ci.supportGroup], ['Tags', (ci) => ci.tags.join(', ')],
    ['ServiceMapped', (ci) => ci.serviceMapped], ['Platform', (ci) => ci.platform], ['Environment', (ci) => ci.environment], ['ParentService', (ci) => ci.parentService],
    ['SupportGroupActive', (ci) => ci.supportGroupActive], ['CreatedOn', (ci) => ci.createdOn], ['UpdatedOn', (ci) => ci.updatedOn],
    ['ExceptionStatus', (ci) => ci.exceptionStatus], ['ExceptionJustification', (ci) => ci.exceptionJustification], ['DiscoverySource', (ci) => ci.discoverySource],
    ['NameSpaces', (ci) => ci.nameSpaces], ...roleFields, ...levelFields
  ];
  const expectedCis = cis.map((ci) => Object.fromEntries([['Key', ci.key], ...ciFields.map(([field, get]) => [field, get(ci)])]));
  problems.push(...compare('Inventory', rows('Inventory'), expectedCis, 'Key', ciFields.map(([field]) => field)));

  // 5. The other readers.
  const relationships = readRelationshipReport(read[SAMPLE_FILES.relationship.name]!.rows).relationships
    .map((item, index) => ({ Row: `${index}`, Parent: item.parent, Type: item.type, Child: item.child, ParentClass: item.parentClass, ChildClass: item.childClass, ParentTag: item.parentTag, ChildTag: item.childTag, Excluded: item.excluded }));
  const foundRelationships = rows('Relationships').map((row, index) => ({ ...row, Row: `${index}` }));
  problems.push(...compare('Relationships', foundRelationships, relationships, 'Row', ['Parent', 'Type', 'Child', 'ParentClass', 'ChildClass', 'ParentTag', 'ChildTag', 'Excluded']));

  const systems = readEpoReport(read[SAMPLE_FILES.epo.name]!.rows, epoConfig(references)!).systems
    .map((item) => ({ EpoId: item.epoId, Name: item.name, Status: item.status, StatusWord: item.statusWord, Owner: item.owner, Responsible1: item.responsible1, Responsible2: item.responsible2, Changed: item.changed, Department: item.department, Description: item.description }));
  problems.push(...compare('EpoSystems', rows('EpoSystems'), systems, 'EpoId', ['Name', 'Status', 'StatusWord', 'Owner', 'Responsible1', 'Responsible2', 'Changed', 'Department', 'Description']));

  const solusiTable = read[SAMPLE_FILES.solusi.name]!;
  const solusi = readSolusiFile(solusiTable.sheets ?? [{ name: '', rows: solusiTable.rows }], contracts).contracts
    .map((item) => ({ Number: item.number, Status: item.status, Name: item.name, Vendor: item.vendor, VendorNumber: item.vendorNumber, Category: item.category, Start: item.start, End: item.end, Duration: item.duration, Owner: item.owner, DailyResponsible: item.dailyResponsible, ProcurementPartner: item.procurementPartner, EpoId: item.epoId, Sheet: item.sheet, Terminated: item.terminated }));
  problems.push(...compare('SolusiContracts', rows('SolusiContracts'), solusi, 'Number', Object.keys(solusi[0] ?? {})));

  const servicenow = readContractReport(read[SAMPLE_FILES.contracts.name]!.rows, contracts).contracts
    .map((item) => ({ Number: item.number, VendorContract: item.vendorContract, State: item.state, Name: item.name, Vendor: item.vendor, Category: item.category, Start: item.start, End: item.end, Owner: item.owner, OwnerActive: item.ownerActive, OwnerUserId: item.ownerUserId, OwnerEmail: item.ownerEmail, DailyResponsible: item.dailyResponsible, ProcurementPartner: item.procurementPartner, ProcurementPartnerActive: item.procurementPartnerActive, ProcurementPartnerUserId: item.procurementPartnerUserId, ProcurementPartnerEmail: item.procurementPartnerEmail, Tags: item.tags.join(', '), Criticality: item.criticality }));
  problems.push(...compare('ServiceNowContracts', rows('ServiceNowContracts'), servicenow, 'Number', Object.keys(servicenow[0] ?? {})));

  // 6. The checks: every check file that is not off, in the order of the file names; the self-check lists every recorded card.
  const packs = loadPackFiles().map((file) => file.pack as { id: string; status: string }).filter((pack) => pack.status !== 'off');
  const foundChecks = rows('Checks').map((row) => norm(row.CheckId)).join(' ');
  if (foundChecks !== packs.map((pack) => pack.id).join(' ')) problems.push(`Checks: [${foundChecks}], expected the checks in use [${packs.map((pack) => pack.id).join(' ')}]`);
  const cards = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'tests', 'recorded', 'cards.json'), 'utf8')) as Array<{ id: string }>;
  const foundSelf = rows('SelfCheck').map((row) => norm(row.CheckId)).sort().join(' ');
  if (foundSelf !== cards.map((card) => card.id).sort().join(' ')) problems.push(`SelfCheck: [${foundSelf}], expected the recorded cards [${cards.map((card) => card.id).sort().join(' ')}]`);
  // 7. The built checks give the recorded result of the HTML app (tests/recorded/run.json): every finding with all its
  // fields, what was tested and how many CIs, the notes, the parked lines; the self-check says so for each of them.
  const run = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'tests', 'recorded', 'run.json'), 'utf8')) as Run;
  const built = new Set(rows('Checks').filter((row) => row.Built === true).map((row) => norm(row.CheckId)));
  const checkIds = new Set(packs.map((pack) => pack.id));
  if (!built.size) problems.push('Checks: no check is built');
  // The app keeps Supported by with the run (src/app/view/people.ts), not in the facts.
  const people = (run as Run & { people?: Record<string, CiPeople> }).people ?? {};
  // "Corrected in EPO" as the case of the app says it, for a case nobody was asked about yet (no journal before build B5).
  const epoSystems = readEpoReport(read[SAMPLE_FILES.epo.name]!.rows, epoConfig(references)!).systems;
  const peopleMap = new Map(Object.entries(people));
  const correctionOf = (fact: Run['facts'][number]): string =>
    epoCorrection({ fact, status: 'New', messages: [] } as unknown as Case, systemsById(epoSystems), peopleMap, epoConfig(references));
  const supportedBy = (ciKey: string): string => { const person = people[ciKey]?.supported_by; return person ? `${person.name}${person.active === false ? ' (inactive)' : ''}` : ''; };
  const facts = run.facts.filter((fact) => built.has(fact.checkId)).map((fact) => ({
    Key: fact.key, ReportDate: run.date, CheckId: fact.checkId, CiKey: fact.ciKey, CiName: fact.ciName, Class: fact.className, ClassLabel: fact.classLabel,
    Field: fact.field, Severity: fact.severity, Detail: fact.detail, Module: fact.module, Route: fact.route, State: fact.state ?? 'open', StateWhy: fact.stateWhy,
    Source: fact.source, Wait: fact.wait, Review: fact.review, ContactId: fact.contactId, ContactName: fact.contactName, ContactEmail: fact.contactEmail,
    ContactVia: fact.contactVia, Cc: fact.cc.join('; '), EscalateName: fact.escalateName, EscalateEmail: fact.escalateEmail, EscalateVia: fact.escalateVia,
    FixChange: fact.fix?.change, FixCurrent: fact.fix?.current, FixSet: fact.fix?.set, FixValue: fact.fix?.value, FixRelatedTo: fact.fix?.relatedTo,
    EpoId: fact.ci?.epoId, Status: fact.ci?.status, SupportGroup: fact.ci?.supportGroup, OwnedBy: fact.ci?.ownedBy, ManagedBy: fact.ci?.managedBy, SupportedBy: supportedBy(fact.ciKey),
    Chips: (fact.ci?.chips ?? []).join(', '), Tags: (fact.ci?.tags ?? []).join(', '), ServiceNowLink: recordSearch('https://contoso.service-now.com', fact),
    Mapping: (fact.mapping ?? []).join(', '), EpoCorrection: correctionOf(fact)
  }));
  problems.push(...compare('Findings', rows('Findings'), facts, 'Key', Object.keys(facts[0] ?? {}).filter((field) => field !== 'Key')));

  const tested = run.tested.filter((part) => built.has(part.split(':')[0]!)).map((part) => ({ Part: part, ReportDate: run.date, Evaluated: run.evaluated?.[part] }));
  // A check tested as a whole (Process stage) has no part.
  const foundTested = rows('Tested').map((row) => ({ ...row, Part: norm(row.Part) ? `${norm(row.CheckId)}:${norm(row.Part)}` : norm(row.CheckId) }));
  problems.push(...compare('Tested', foundTested, tested, 'Part', ['ReportDate', 'Evaluated']));

  // A note of a built check, or about the run as a whole, is the note of the HTML app; a check that is not built has one note that says so.
  const ofRun = (id: string): boolean => built.has(id) || !checkIds.has(id);
  const wantNotes = run.notes.map((note) => `${note.slice(0, note.indexOf(':'))}: ${note.slice(note.indexOf(':') + 1).trim()}`).filter((note) => ofRun(note.slice(0, note.indexOf(':')))).sort();
  const foundNotes = rows('Notes').filter((row) => ofRun(norm(row.CheckId))).map((row) => `${norm(row.CheckId)}: ${norm(row.Reason)}`).sort();
  for (const note of wantNotes.filter((item) => !foundNotes.includes(item))) problems.push(`Notes: missing "${note}"`);
  for (const note of foundNotes.filter((item) => !wantNotes.includes(item))) problems.push(`Notes: not expected "${note}"`);
  for (const pack of packs.filter((item) => !built.has(item.id))) {
    const own = rows('Notes').filter((row) => norm(row.CheckId) === pack.id);
    if (own.length !== 1 || !/^Not tested: /.test(norm(own[0]!.Reason))) problems.push(`Notes ${pack.id}: expected the one note that the check is not built, found ${own.length}`);
  }
  for (const row of rows('Notes')) if (norm(row.ReportDate) !== run.date) problems.push(`Notes ${norm(row.CheckId)}: ReportDate is "${norm(row.ReportDate)}", expected "${run.date}"`);

  const parked = rows('Parked').map((row) => norm(row.Line)).join(' | ');
  if (parked !== (run.parked?.lines ?? []).join(' | ')) problems.push(`Parked: [${parked}], expected [${(run.parked?.lines ?? []).join(' | ')}]`);

  // 8. The capability sheet (D205), line by line, as the app keeps it with the run.
  const capabilities = (run as Run & { capabilities?: string[][] }).capabilities ?? [];
  const capabilityFields = ['Name', 'Status', 'CapabilitiesAbove', 'CapabilitiesBelow', 'ProcessesBelow', 'Description', 'Tags', 'OwnedBy', 'ManagedBy', 'HiddenCharacters'];
  const expectedSheet = capabilities.map((line, index) => ({ Order: `${index + 1}`, ...Object.fromEntries(capabilityFields.map((field, at) => [field, line[at]])) }));
  problems.push(...compare('CapabilitySheet', rows('CapabilitySheet'), expectedSheet, 'Order', capabilityFields));

  // 9. The relationships of each CI for the Case page: the graph of the checks, both ends of each relationship.
  const model = references['reference/relationship-model'] as RelationshipModel;
  const graph = buildGraph(cis, readRelationshipReport(read[SAMPLE_FILES.relationship.name]!.rows).relationships, model);
  const links: Row[] = [];
  const word = (cls: string): string => CLASS_WORDS[cls] ?? cls.replace(/_/g, ' ');
  for (const edge of graph.edges) {
    const counts = edge.parent.retired || edge.child.retired ? 'No: a Retired end' : 'Yes';
    const line = (mine: typeof edge.parent, other: typeof edge.parent, relation: string): Row => ({
      CiKey: mine.key, Relation: relation, Other: other.name, OtherClass: word(other.cls), OtherStatus: other.ci ? other.ci.operationalStatus : 'Not in the CI report',
      Type: edge.type, Counts: counts, Excluded: edge.row.excluded ? 'Yes' : ''
    });
    if (edge.parent.ci) links.push(line(edge.parent, edge.child, 'Child'));
    if (edge.child.ci) links.push(line(edge.child, edge.parent, 'Parent'));
  }
  const numbered = (list: Row[]): Row[] => list.map((row, index) => ({ ...row, Line: `${index}` }));
  problems.push(...compare('RelationshipLinks', numbered(rows('RelationshipLinks')), numbered(links), 'Line', ['CiKey', 'Relation', 'Other', 'OtherClass', 'OtherStatus', 'Type', 'Counts', 'Excluded']));

  // 10. The mapping backlog: one line per case of the mapping check, its stage the first of its class (no journal before build B5).
  const mapping = mappingConfig(references)!;
  const backlog = run.facts.filter((fact) => fact.checkId === 'MAPPING').map((fact) => ({
    Key: fact.key, CiName: fact.ciName, ClassLabel: fact.classLabel, Owner: people[fact.ciKey]?.owned_by?.name ?? fact.contactName, ReasonIds: (fact.mapping ?? []).join(', '),
    Stage: stagesFor(mapping, fact.className)[0]?.label ?? '', StateLabel: ({ open: 'To solve', review: 'To check', waiting: 'Waiting', known: 'Planned' } as Record<string, string>)[fact.state ?? 'open'],
    Criticality: Array.from(new Set(run.facts.filter((other) => other.ciKey === fact.ciKey && (mapping.criticality ?? []).includes(other.checkId))
      .map((other) => loadPackFiles().map((file) => file.pack as { id: string; cardLabel?: string }).find((pack) => pack.id === other.checkId)?.cardLabel ?? other.checkId))).join(', ')
  }));
  problems.push(...compare('MappingBacklog', rows('MappingBacklog'), backlog, 'Key', ['CiName', 'ClassLabel', 'Owner', 'ReasonIds', 'Stage', 'StateLabel', 'Criticality']));

  for (const row of rows('SelfCheck')) {
    const id = norm(row.CheckId);
    if (built.has(id) && row.Match !== true) problems.push(`SelfCheck ${id}: no match: ${norm(row.Why)}`);
    if (!built.has(id) && row.Match === true) problems.push(`SelfCheck ${id}: a match for a check that is not built`);
  }
  return problems;
}

if (process.argv[1] === import.meta.filename) {
  const folder = process.argv[2];
  if (!folder) { console.error('Usage: node tools/powerbi/parity.ts <folder with the PQTest output>'); process.exit(2); }
  const problems = await parityProblems(folder);
  for (const problem of problems) console.error(problem);
  console.log(problems.length ? `Power BI parity: ${problems.length} differences.` : 'Power BI parity: the model reads the samples as src/core does.');
  process.exit(problems.length ? 1 : 0);
}
