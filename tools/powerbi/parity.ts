// Compares what the Power Query of the model gives on the invented samples (the output of PQTest, one JSON file per
// table, written by the CI job "powerbi-eval") with the answer key: the TypeScript logic of src/core/ and the recorded
// result of tests/recorded/. Any difference fails, line by line.
//   node tools/powerbi/parity.ts <folder with <Table>.json>
//   node tools/powerbi/parity.ts --real-size <folder with RealSize.Summary.json> [--copies <n>] [--history <k>]
//       at the size of the real reports (scaled.ts): the counts per check and state, the CIs evaluated per part, the
//       notes and the rows of the tables, against src/core on the same scaled files (plan of the speed build §6.2).
// Also checked: every table gives exactly the columns its TMDL file declares, so a refresh in Power BI Desktop does not
// stop on a missing column.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
import { EARLIER, RECORD_DATE, recordReports, SAMPLE_FILES } from '../../tests/sample-record.ts';
import { numberArgument, REAL_SIZE_COPIES, scaledSampleFiles } from './scaled.ts';
import { pascal } from './generate.ts';
import { readTables } from './tmdl.ts';
import { unitCases, unitQueryNames } from './units.ts';
import { recordSearch } from '../../src/core/cases/record-search.ts';
import { buildGraph, CLASS_WORDS } from '../../src/core/checks/detectors/relationship-detectors.ts';
import type { RelationshipModel } from '../../src/core/checks/detectors/relationship-detectors.ts';
import { systemsById } from '../../src/core/sources/epo/epo-report.ts';
import { epoCorrection } from '../../src/app/view/cases.ts';
import { mappingConfig, stageOf } from '../../src/core/mapping/backlog.ts';
import type { Case, Run } from '../../src/core/cases/cases.ts';
import type { CiPeople } from '../../src/app/view/people.ts';
import { contractChanges, contractInformation } from '../../src/core/sources/contracts/contract-changes.ts';
import { inList } from '../../src/core/sources/contracts/contract-reports.ts';
import type { ContractConfig, SolusiContract } from '../../src/core/sources/contracts/contract-reports.ts';
import { daysBetween, longDate } from '../../src/core/shared/dates.ts';
import { activityRows, caseLines, checkedOf, exceptionRows, expectedHistory, HISTORY_FILES, historyKey, historyRows, replyLines, settingsRows, stateRows } from './history.ts';
import type { HistoryKey } from './history.ts';
import { sampleEvents } from './history.ts';
import { reviewLines, withSampleReviews } from './review.ts';
import { draftRows, recordedChats, recordedDrafts, REF_TOKEN, SAMPLE_SENDER, SENDER_TOKEN } from './messages.ts';
import type { DraftRow } from './messages.ts';

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


/**
 * The lines of the table ContractChanges, from src/core: what changed between the two Solusi contract files (as the export
 * of the page, src/app/view/exports.ts changesCsv), then the Concluded contracts of the active tab that end on or after
 * the date of the newest file, by end date, then the running contracts with no daily responsible
 * (contract-changes.ts, contractInformation). The page shows the next 30 and 90 days of the Concluded ones.
 */
export function contractChangeRows(previous: { contracts: SolusiContract[]; date: string } | null, current: { contracts: SolusiContract[]; date: string }, config: ContractConfig): Row[] {
  const changes = contractChanges(previous, current);
  const whole = (contract: SolusiContract): string => [contract.status, contract.start && `starts ${longDate(contract.start)}`, contract.end && `ends ${longDate(contract.end)}`].filter(Boolean).join(', ');
  const byNumber = new Map(current.contracts.map((contract) => [contract.number.toLowerCase(), contract]));
  const rows: Row[] = [];
  const line = (kind: string, contract: SolusiContract | undefined, number: string, name: string, vendor: string, field: string, before: string, after: string, daysLeft: number | null = null): void => {
    rows.push({ Line: `${rows.length + 1}`, Kind: kind, Number: number, Name: name, Vendor: vendor, Field: field, Before: before, After: after, Status: contract?.status ?? '',
      End: contract?.end ?? '', DaysLeft: daysLeft === null ? '' : `${daysLeft}`, FileDate: current.date, EarlierDate: previous?.date ?? '' });
  };
  for (const contract of changes.added) line('New contract', contract, contract.number, contract.name, contract.vendor, '', '', whole(contract));
  for (const contract of changes.left) line('No longer in the file', contract, contract.number, contract.name, contract.vendor, '', whole(contract), '');
  for (const change of changes.status) line('Status change', byNumber.get(change.number.toLowerCase()), change.number, change.name, change.vendor, change.what, change.before, change.after);
  for (const change of changes.fields) line('Changed field', byNumber.get(change.number.toLowerCase()), change.number, change.name, change.vendor, change.what, change.before, change.after);
  const active = current.contracts.filter((contract) => contract.sheet === 'active');
  const ending = active.filter((contract) => inList(config.concludedStatuses, contract.status) && contract.end && contract.end >= current.date)
    .sort((a, b) => a.end.localeCompare(b.end));
  for (const contract of ending) line('Concluded with an end date', contract, contract.number, contract.name, contract.vendor, '', '', '', daysBetween(current.date, contract.end));
  for (const contract of active.filter((item) => inList(config.runningStatuses, item.status) && !item.dailyResponsible)) {
    line('No daily responsible', contract, contract.number, contract.name, contract.vendor, '', '', '');
  }
  return rows;
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
    { file: SAMPLE_FILES.solusi, date: RECORD_DATE }, { file: SAMPLE_FILES.contracts, date: RECORD_DATE }, { file: SAMPLE_FILES.solusiEarlier, date: EARLIER },
    ...HISTORY_FILES.map((file) => ({ file, date: file.date }))
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
  // From build B8 the newest run also holds the lines of the lifecycle review of the sample journal (withReviewFacts, D306).
  const recordedRun = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'tests', 'recorded', 'run.json'), 'utf8')) as Run;
  const run = withSampleReviews(recordedRun, sampleEvents());
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
    FixChange: fact.fix?.change, FixCurrent: fact.fix?.current, FixSet: fact.fix?.set, FixValue: fact.fix?.value, FixRelatedTo: fact.fix?.relatedTo, FixNote: fact.fix?.note,
    EpoId: fact.ci?.epoId, Status: fact.ci?.status, SupportGroup: fact.ci?.supportGroup, OwnedBy: fact.ci?.ownedBy, ManagedBy: fact.ci?.managedBy, SupportedBy: supportedBy(fact.ciKey),
    Chips: (fact.ci?.chips ?? []).join(', '), Tags: (fact.ci?.tags ?? []).join(', '), ServiceNowLink: recordSearch('https://contoso.service-now.com', fact),
    Mapping: (fact.mapping ?? []).join(', '), EpoCorrection: correctionOf(fact), Problem: fact.group
  }));
  problems.push(...compare('Findings', rows('Findings'), facts, 'Key', Object.keys(facts[0] ?? {}).filter((field) => field !== 'Key')));

  const tested = run.tested.filter((part) => built.has(part.split(':')[0]!)).map((part) => ({ Part: part, ReportDate: run.date, Evaluated: run.evaluated?.[part] }));
  // A check tested as a whole (Process stage) has no part.
  // PQTest returns at most 1,000 rows: a table that fills them may hide rows (then page it, as the unit cases).
  for (const [name, list] of outputs) if (list.length >= 1000) problems.push(`${name}: ${list.length} rows, the limit of PQTest: rows may be hidden`);
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

  // 10. The mapping backlog: one line per case of the mapping check, its stage the one of the journal (stageOf; build B6),
  // else the first of its class.
  const mapping = mappingConfig(references)!;
  const timelines = new Map((await historyKey()).cases.map((item) => [item.key, item.timeline]));
  const backlog = run.facts.filter((fact) => fact.checkId === 'MAPPING').map((fact) => ({
    Key: fact.key, CiName: fact.ciName, ClassLabel: fact.classLabel, Owner: people[fact.ciKey]?.owned_by?.name ?? fact.contactName, ReasonIds: (fact.mapping ?? []).join(', '),
    Stage: stageOf(timelines.get(fact.key) ?? [], mapping, fact.className).stage?.label ?? '', StateLabel: ({ open: 'To solve', review: 'To check', waiting: 'Waiting', known: 'Planned' } as Record<string, string>)[fact.state ?? 'open'],
    Criticality: Array.from(new Set(run.facts.filter((other) => other.ciKey === fact.ciKey && (mapping.criticality ?? []).includes(other.checkId))
      .map((other) => loadPackFiles().map((file) => file.pack as { id: string; cardLabel?: string }).find((pack) => pack.id === other.checkId)?.cardLabel ?? other.checkId))).join(', ')
  }));
  problems.push(...compare('MappingBacklog', rows('MappingBacklog'), backlog, 'Key', ['CiName', 'ClassLabel', 'Owner', 'ReasonIds', 'Stage', 'StateLabel', 'Criticality']));

  // 11. Contract changes: every line, and the contracts to watch as the HTML app counts them (contractInformation).
  const solusiOf = (name: string, date: string) => {
    const table = read[name]!;
    return { contracts: readSolusiFile(table.sheets ?? [{ name: '', rows: table.rows }], contracts).contracts, date };
  };
  const current = solusiOf(SAMPLE_FILES.solusi.name, RECORD_DATE);
  const changeRows = contractChangeRows(solusiOf(SAMPLE_FILES.solusiEarlier.name, EARLIER), current, contracts);
  problems.push(...compare('ContractChanges', rows('ContractChanges'), changeRows, 'Line', ['Kind', 'Number', 'Name', 'Vendor', 'Field', 'Before', 'After', 'Status', 'End', 'DaysLeft', 'FileDate', 'EarlierDate']));
  const information = contractInformation(current.contracts, RECORD_DATE, contracts);
  for (const { days, contracts: ending } of information.ending) {
    const within = changeRows.filter((row) => row.Kind === 'Concluded with an end date' && Number(row.DaysLeft) <= days).map((row) => row.Number).join(' ');
    if (within !== ending.map((contract) => contract.number).join(' ')) problems.push(`ContractChanges: ending in ${days} days [${within}], the HTML app [${ending.map((contract) => contract.number).join(' ')}]`);
  }
  const noDaily = changeRows.filter((row) => row.Kind === 'No daily responsible').map((row) => row.Number).join(' ');
  if (noDaily !== information.noDailyResponsible.map((contract) => contract.number).join(' ')) problems.push(`ContractChanges: no daily responsible [${noDaily}], the HTML app [${information.noDailyResponsible.map((contract) => contract.number).join(' ')}]`);

  // 12. The history (D290): every CI report date with the reports it used, its findings, what it tested and could
  // verify, the notes; the answer key runs the checks of src/core on each date (tools/powerbi/history.ts).
  const key = await historyKey();
  const time = (value: unknown): string => norm(value).slice(0, 19);
  const withTimes = (list: Row[], fields: string[]): Row[] => list.map((row) => ({ ...row, ...Object.fromEntries(fields.map((field) => [field, time(row[field])])) }));
  // The files each run used, as the folder names them: the earlier CI report had no EPO systems report and no ServiceNow contract report on or before it.
  const named = (file: { name: string }, date: string): string => `${date}_${file.name}`;
  const [earlierCi, earlierRelationship] = HISTORY_FILES;
  const runRows = [
    { ReportDate: earlierCi.date, FileName: named(earlierCi, earlierCi.date), CIs: key.runs[0]!.cis, RelationshipFile: named(earlierRelationship, earlierRelationship.date),
      EpoFile: '', SolusiFile: named(SAMPLE_FILES.solusiEarlier, EARLIER), ContractFile: '' },
    { ReportDate: RECORD_DATE, FileName: named(SAMPLE_FILES.ci, RECORD_DATE), CIs: key.runs[1]!.cis, RelationshipFile: named(SAMPLE_FILES.relationship, RECORD_DATE),
      EpoFile: named(SAMPLE_FILES.epo, RECORD_DATE), SolusiFile: named(SAMPLE_FILES.solusi, RECORD_DATE), ContractFile: named(SAMPLE_FILES.contracts, RECORD_DATE) }
  ];
  problems.push(...compare('Runs', rows('Runs'), runRows, 'ReportDate', ['FileName', 'CIs', 'RelationshipFile', 'EpoFile', 'SolusiFile', 'ContractFile']));
  const dated = (list: Row[], field: string): Row[] => list.map((row) => ({ ...row, Line: `${norm(row.ReportDate)}|${norm(row[field])}` }));
  const history = historyRows(key).filter((row) => built.has(row.CheckId ?? ""));
  problems.push(...compare('History', dated(rows('History'), 'Key'), dated(history, 'Key'), 'Line', ['CheckId', 'CiKey', 'CiName', 'Class', 'ClassLabel', 'Field', 'State', 'SupportGroup', 'ContactName']));
  const checked = key.runs.flatMap((item) => checkedOf(item).filter((entry) => entry.Kind === 'ci' || built.has(entry.Id.split(':')[0]!)).map((entry) => ({ ReportDate: item.date, Id: `${entry.Kind}|${entry.Id}` })));
  problems.push(...compare('HistoryChecked', dated(rows('HistoryChecked').map((row) => ({ ...row, Id: `${norm(row.Kind)}|${norm(row.Id)}` })), 'Id'), dated(checked, 'Id'), 'Line', []));
  const historyTested = key.runs.flatMap((item) => item.tested.filter((part) => built.has(part.split(':')[0]!)).map((part) => ({ ReportDate: item.date, Part: part, Evaluated: item.evaluated?.[part] })));
  const foundHistoryTested = rows('HistoryTested').map((row) => ({ ...row, Part: norm(row.Part) ? `${norm(row.CheckId)}:${norm(row.Part)}` : norm(row.CheckId) }));
  problems.push(...compare('HistoryTested', dated(foundHistoryTested, 'Part'), dated(historyTested, 'Part'), 'Line', ['Evaluated']));
  for (const item of key.runs) {
    const want = item.notes.map((note) => `${note.slice(0, note.indexOf(':'))}: ${note.slice(note.indexOf(':') + 1).trim()}`).filter((note) => ofRun(note.slice(0, note.indexOf(':')))).sort();
    const found = rows('HistoryNotes').filter((row) => norm(row.ReportDate) === item.date && ofRun(norm(row.CheckId))).map((row) => `${norm(row.CheckId)}: ${norm(row.Reason)}`).sort();
    for (const note of want.filter((line) => !found.includes(line))) problems.push(`HistoryNotes ${item.date}: missing "${note}"`);
    for (const note of found.filter((line) => !want.includes(line))) problems.push(`HistoryNotes ${item.date}: not expected "${note}"`);
  }

  // 13. The team's state (D291) and the cases (D292): the lists as the app reads its journal and replies, every case of
  // buildCases, the replies to read, the decisions to stop following, the activity in words.
  const lines = caseLines(key).filter((line) => built.has(String(line.CheckId)));
  problems.push(...compare('CaseLines', rows('CaseLines'), lines, 'Key', Object.keys(lines[0] ?? {}).filter((field) => field !== 'Key')));
  problems.push(...compare('RepliesToRead', withTimes(rows('RepliesToRead'), ['Received']), replyLines(key), 'File', ['Ref', 'From', 'Received', 'FirstLine', 'Cases', 'CIs', 'AssignedTo', 'Checks', 'Daily']));
  const exceptions = exceptionRows(key);
  problems.push(...compare('Exceptions', withTimes(rows('Exceptions'), ['At']), exceptions, 'Order', Object.keys(exceptions[0] ?? {}).filter((field) => field !== 'Order')));
  const activity = activityRows();
  problems.push(...compare('Activity', withTimes(rows('Activity'), ['At']), activity, 'Id', ['At', 'Type', 'Icon', 'What', 'By', 'Text', 'Cards', 'CIs', 'Keys']));
  const journal = stateRows('journal');
  problems.push(...compare('Journal', withTimes(rows('Journal'), ['At']), journal.map((row) => ({ Id: row.Title, At: row.At, Type: row.Type, KeyCount: (row.Keys ?? '').split(/\r?\n/).filter((line) => line.trim()).length, ReviewOn: row.ReviewOn })), 'Id', ['At', 'Type', 'KeyCount', 'ReviewOn']));
  const keyCount = journal.reduce((sum, row) => sum + (row.Keys ?? '').split(/\r?\n/).filter((line) => line.trim()).length, 0);
  if (rows('JournalKeys').length !== keyCount) problems.push(`JournalKeys: ${rows('JournalKeys').length} rows, expected ${keyCount}`);
  const refs = new Set(journal.filter((row) => row.Type === 'message').map((row) => row.Ref));
  problems.push(...compare('Replies', withTimes(rows('Replies'), ['Received']), stateRows('replies').map((row) => ({ Ref: row.Title, Received: row.Received, Matched: refs.has(row.Title) })), 'Ref', ['Received', 'Matched']));
  problems.push(...compare('Team', rows('Team'), stateRows('team').map((row, at) => ({ Name: row.Title, Email: row.Email!.toLowerCase(), Active: !/^(no|false|0)$/i.test(row.Active!.trim()), SampleMe: at === 0 })), 'Name', ['Email', 'Active', 'SampleMe']));
  problems.push(...compare('Settings', rows('Settings'), settingsRows(stateRows('settings')), 'Key', ['Value', 'Used']));
  // The lifecycle review (build B8, D306): every review of the journal with its marks and cases, then the next sample.
  const review = reviewLines(key.reviewed, named(SAMPLE_FILES.ci, RECORD_DATE), sampleEvents(), key.cases, systemsById(epoSystems), RECORD_DATE);
  problems.push(...compare('ReviewLines', rows('ReviewLines').map((row) => ({ ...row, Line: `${norm(row.Review)}|${norm(row.CiKey)}` })),
    review.map((row) => ({ ...row, Line: `${row.Review}|${row.CiKey}` })), 'Line', Object.keys(review[0] ?? {}).filter((field) => field !== 'Review' && field !== 'CiKey')));
  const expected = (await expectedHistory()).map((item, at) => ({ Metric: item.metric, Expected: item.expected, Order: at + 1 }));
  problems.push(...compare('HistoryExpected', rows('HistoryExpected'), expected, 'Metric', ['Expected', 'Order']));

  // 14. The messages (build B7, D300): the drafts of the samples with no journal, byte for byte as tests/recorded/
  // messages.txt and teams-messages.txt hold them; the drafts with the team's state as buildDrafts gives them.
  problems.push(...messageProblems(rows('DraftsRecorded'), rows('ChatsRecorded'), rows('Drafts'), key));

  for (const row of rows('SelfCheck')) {
    const id = norm(row.CheckId);
    if (built.has(id) && row.Match !== true) problems.push(`SelfCheck ${id}: no match: ${norm(row.Why)}`);
    if (!built.has(id) && row.Match === true) problems.push(`SelfCheck ${id}: a match for a check that is not built`);
  }
  return problems;
}

/**
 * The messages of the Power Query against the answer key. A draft is matched by its keys; the Power App's tokens get the
 * reference of the matched draft and the name of the sample manager, then every text must be the same, byte for byte.
 */
export function messageProblems(recordedRows: Row[], chatRows: Row[], draftRowsFound: Row[], key: HistoryKey): string[] {
  const problems: string[] = [];
  const { drafts: recorded, skipped } = recordedDrafts();
  const fill = (value: unknown, ref: string): string => norm(value).split(REF_TOKEN).join(ref).split(SENDER_TOKEN).join(SAMPLE_SENDER);
  const byKeys = new Map(recordedRows.map((row) => [norm(row.Keys), row]));
  if (recordedRows.length !== recorded.length) problems.push(`DraftsRecorded: ${recordedRows.length} drafts, tests/recorded/messages.txt has ${recorded.length}`);
  for (const want of recorded) {
    const got = byKeys.get(want.keys);
    if (!got) { problems.push(`DraftsRecorded: no draft with the keys of ${want.ref} (${want.keys})`); continue; }
    const fields: Array<[string, string, string]> = [['Kind', norm(got.Kind), want.kind], ['Part', `${norm(got.PartIndex)} of ${norm(got.PartCount)}`, want.part], ['To', norm(got.To), want.to],
      ['Cc', norm(got.Cc), want.cc], ['Subject', fill(got.Subject, want.ref), want.subject], ['Plain', fill(got.Plain, want.ref), want.plain], ['Body', fill(got.Body, want.ref), want.body]];
    for (const [field, found, expected] of fields) if (found !== expected) problems.push(`DraftsRecorded ${want.ref}: ${field} differs from tests/recorded/messages.txt at ${firstDifference(found, expected)}`);
  }
  // Every open case of the record that no draft holds is one the HTML app left out (nobody to write to).
  // A key holds spaces (the name of a CI): the keys of a line are told apart by the check id that starts each one.
  const keysOf = (text: string): string[] => text.split(/ (?=[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*:)/).filter(Boolean);
  const inDrafts = new Set(recordedRows.flatMap((row) => keysOf(norm(row.Keys))));
  const left = keysOf(skipped).filter((item) => inDrafts.has(item));
  if (left.length) problems.push(`DraftsRecorded: ${left.length} keys the HTML app left out are in a draft (${left.slice(0, 3).join(' ')})`);
  const chats = recordedChats();
  if (chatRows.length !== chats.size) problems.push(`ChatsRecorded: ${chatRows.length} chats, tests/recorded/teams-messages.txt has ${chats.size}`);
  for (const row of chatRows) {
    const want = chats.get(norm(row.CheckId));
    if (want === undefined) problems.push(`ChatsRecorded: a chat for ${norm(row.CheckId)}, which tests/recorded/teams-messages.txt does not have`);
    else if (norm(row.Chat) !== want) problems.push(`ChatsRecorded ${norm(row.CheckId)}: differs from tests/recorded/teams-messages.txt at ${firstDifference(norm(row.Chat), want)}`);
  }
  // The table Drafts, with the journal of the samples.
  const expected = draftRows(key);
  const found = new Map(draftRowsFound.map((row) => [norm(row.Keys), row]));
  if (draftRowsFound.length !== expected.length) problems.push(`Drafts: ${draftRowsFound.length} drafts, expected ${expected.length}`);
  expected.forEach((want, at) => {
    const got = found.get(want.Keys);
    if (!got) { problems.push(`Drafts: no draft with the keys ${want.Keys.replace(/\n/g, ' ')}`); return; }
    if (norm(got.DraftId) !== `D${String(at + 1).padStart(4, '0')}`) problems.push(`Drafts ${want.Keys.split('\n')[0]}: DraftId is ${norm(got.DraftId)}, expected the order of buildDrafts (D${String(at + 1).padStart(4, '0')})`);
    for (const field of Object.keys(want) as Array<keyof DraftRow>) {
      if (field === 'Keys') continue;
      if (norm(got[field]) !== norm(want[field])) problems.push(`Drafts ${want.Keys.split('\n')[0]}: ${field} differs at ${firstDifference(norm(got[field]), norm(want[field]))}`);
    }
  });
  return problems;
}

/** Where two texts first differ, with a little of each around it. */
function firstDifference(found: string, expected: string): string {
  let at = 0;
  while (at < found.length && at < expected.length && found[at] === expected[at]) at++;
  const show = (text: string): string => JSON.stringify(text.slice(Math.max(0, at - 40), at + 60));
  return `character ${at}: Power Query ${show(found)}, the answer key ${show(expected)}`;
}

/** One line of RealSize.Summary (tools/powerbi/probes.ts). */
type SummaryLine = { Kind: string; Id: string; Count: number; Cis: number; Chars: number };

/** The same summary from src/core, on the scaled files of `copies` copies (the newest CI report). */
export async function expectedSummary(copies: number, history = 0, built?: Set<string>): Promise<SummaryLine[]> {
  const folder = mkdtempSync(join(tmpdir(), 'sacm-scaled-'));
  try {
    const files = scaledSampleFiles(copies, history);
    for (const file of files) writeFileSync(join(folder, file.name), Buffer.from(file.base64, 'base64'));
    const at = (name: string, date = RECORD_DATE) => ({ path: join(folder, `${date}_${name}`), name });
    const out = await recordReports({ ci: at(SAMPLE_FILES.ci.name), relationship: at(SAMPLE_FILES.relationship.name), epo: at(SAMPLE_FILES.epo.name),
      solusi: at(SAMPLE_FILES.solusi.name), solusiEarlier: at(SAMPLE_FILES.solusiEarlier.name, EARLIER), contracts: at(SAMPLE_FILES.contracts.name) });
    const run = JSON.parse(out['run.json']!) as Run & { capabilities?: string[][] };
    const isBuilt = (id: string): boolean => !built || built.has(id);
    const checkIds = new Set(loadPackFiles().map((file) => (file.pack as { id: string }).id));
    const lines: SummaryLine[] = [];
    const groups = new Map<string, { count: number; cis: Set<string>; chars: number }>();
    for (const fact of run.facts.filter((item) => isBuilt(item.checkId))) {
      const id = `${fact.checkId}|${fact.state ?? 'open'}`;
      const group = groups.get(id) ?? { count: 0, cis: new Set<string>(), chars: 0 };
      group.count++; group.cis.add(fact.ciKey); group.chars += fact.key.length + fact.detail.length + (fact.contactId ?? '').length;
      groups.set(id, group);
    }
    for (const [id, group] of groups) lines.push({ Kind: 'findings', Id: id, Count: group.count, Cis: group.cis.size, Chars: group.chars });
    for (const part of run.tested.filter((item) => isBuilt(item.split(':')[0]!))) lines.push({ Kind: 'tested', Id: part, Count: run.evaluated?.[part] ?? -1, Cis: 0, Chars: 0 });
    const notes = new Map<string, { count: number; chars: number }>();
    for (const note of run.notes) {
      const id = note.slice(0, note.indexOf(':'));
      if (checkIds.has(id) && !isBuilt(id)) continue;
      const entry = notes.get(id) ?? { count: 0, chars: 0 };
      entry.count++; entry.chars += note.slice(note.indexOf(':') + 1).trim().length;
      notes.set(id, entry);
    }
    for (const [id, entry] of notes) lines.push({ Kind: 'notes', Id: id, Count: entry.count, Cis: 0, Chars: entry.chars });
    const ciTable = await tableOf(at(SAMPLE_FILES.ci.name).path);
    const relTable = await tableOf(at(SAMPLE_FILES.relationship.name).path);
    const cis = readCiReport(ciTable.rows).cis;
    const relationships = readRelationshipReport(relTable.rows).relationships;
    const references = loadReferences();
    const graph = buildGraph(cis, relationships, references['reference/relationship-model'] as RelationshipModel);
    const links = graph.edges.reduce((sum, edge) => sum + (edge.parent.ci ? 1 : 0) + (edge.child.ci ? 1 : 0), 0);
    const epo = readEpoReport((await tableOf(at(SAMPLE_FILES.epo.name).path)).rows, epoConfig(references)!).systems.length;
    const solusiAt = async (name: string, date: string) => {
      const table = await tableOf(at(name, date).path);
      return { contracts: readSolusiFile(table.sheets ?? [{ name: '', rows: table.rows }], contractConfig(references)!).contracts, date };
    };
    const changes = contractChangeRows(await solusiAt(SAMPLE_FILES.solusiEarlier.name, EARLIER), await solusiAt(SAMPLE_FILES.solusi.name, RECORD_DATE), contractConfig(references)!).length;
    const rows: Array<[string, number]> = [['Inventory', cis.length], ['Relationships', relationships.length], ['RelationshipLinks', links],
      ['MappingBacklog', run.facts.filter((fact) => fact.checkId === 'MAPPING').length], ['CapabilitySheet', (run.capabilities ?? []).length],
      ['Parked', (run.parked?.lines ?? []).length], ['EpoSystems', epo], ['ContractChanges', changes]];
    for (const [id, count] of rows) lines.push({ Kind: 'rows', Id: id, Count: count, Cis: 0, Chars: 0 });
    return lines;
  } finally { rmSync(folder, { recursive: true, force: true }); }
}

/** RealSize.Summary of PQTest against src/core at the same size: every difference, by kind and id. */
export async function realSizeProblems(folder: string, copies: number, history = 0): Promise<string[]> {
  const found = outputOf(folder, 'RealSize.Summary') as unknown as SummaryLine[];
  const built = new Set(found.filter((line) => line.Kind === 'built').map((line) => line.Id));
  const checkIds = new Set(loadPackFiles().map((file) => (file.pack as { id: string }).id));
  const kept = found.filter((line) => line.Kind !== 'built' && !(line.Kind === 'notes' && checkIds.has(line.Id) && !built.has(line.Id)));
  const expected = await expectedSummary(copies, history, built);
  const problems: string[] = [];
  const key = (line: SummaryLine): string => `${line.Kind} ${line.Id}`;
  const got = new Map(kept.map((line) => [key(line), line]));
  const want = new Map(expected.map((line) => [key(line), line]));
  for (const [id, line] of want) {
    const other = got.get(id);
    if (!other) { problems.push(`${id}: missing in Power Query (src/core: ${line.Count})`); continue; }
    for (const field of ['Count', 'Cis', 'Chars'] as const) if (Number(other[field]) !== line[field]) problems.push(`${id}: ${field} is ${other[field]}, src/core gives ${line[field]}`);
  }
  for (const id of got.keys()) if (!want.has(id)) problems.push(`${id}: not in src/core (Power Query: ${got.get(id)!.Count})`);
  if (!built.size) problems.push('RealSize.Summary: no check is built');
  return problems;
}

if (process.argv[1] === import.meta.filename && process.argv.includes('--real-size')) {
  const args = process.argv.slice(2);
  const folder = args[args.indexOf('--real-size') + 1];
  if (!folder) { console.error('Usage: node tools/powerbi/parity.ts --real-size <folder with RealSize.Summary.json> [--copies <n>] [--history <k>]'); process.exit(2); }
  const copies = numberArgument(args, '--copies', REAL_SIZE_COPIES);
  const problems = await realSizeProblems(folder, copies, numberArgument(args, '--history', 0));
  for (const problem of problems) console.error(problem);
  console.log(problems.length ? `Power BI parity at real size (${copies} copies): ${problems.length} differences.` : `Power BI parity at real size (${copies} copies): the counts are those of src/core.`);
  process.exit(problems.length ? 1 : 0);
} else if (process.argv[1] === import.meta.filename) {
  const folder = process.argv[2];
  if (!folder) { console.error('Usage: node tools/powerbi/parity.ts <folder with the PQTest output>'); process.exit(2); }
  const problems = await parityProblems(folder);
  for (const problem of problems) console.error(problem);
  console.log(problems.length ? `Power BI parity: ${problems.length} differences.` : 'Power BI parity: the model reads the samples as src/core does.');
  process.exit(problems.length ? 1 : 0);
}
