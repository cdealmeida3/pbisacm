/**
 * The real-shape samples (build R2, D353): small invented report files with the shapes of the real ones, as Carlos's
 * folder holds them on one day. The CSV files are in `samples/real-shape/`; the Solusi workbook is built here, so the
 * repository holds no binary file that the privacy guard cannot read. It has what the real workbook has and the reader
 * must cope with: every XML element named with a prefix (`<x:row>`), two tabs, the field names on row 1 and the labels on
 * row 2, dates as numbers in a custom format, and one date past the last day Excel knows.
 *
 * `tests/real-shape.test.ts` reads them with src/core and compares the result with `tests/recorded/real-shape.json`;
 * the Power BI check reads the same files with the M (the query RealShape of tools/powerbi/connector.ts). Only invented
 * data: the criticality columns carry the invented prefix x_demo_crit_ (tools/placeholders.json).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { zipOf } from '../tools/powerbi/release.ts';
import { checksInUse, runChecks } from '../src/core/checks/engine.ts';
import { chooseReports, dateInName } from '../src/core/memory/finder.ts';
import { readTable } from '../src/core/reading/table.ts';
import type { Table } from '../src/core/reading/table.ts';
import { missingWanted, readCiReport } from '../src/core/sources/ci/ci-report.ts';
import { contractConfig, readContractReport, readSolusiFile } from '../src/core/sources/contracts/contract-reports.ts';
import type { ContractInput } from '../src/core/sources/contracts/contract-reports.ts';
import { epoConfig, readEpoReport } from '../src/core/sources/epo/epo-report.ts';
import type { EpoInput } from '../src/core/sources/epo/epo-report.ts';
import { readRelationshipReport } from '../src/core/sources/relationships/relationship-report.ts';
import type { Relationship } from '../src/core/sources/relationships/relationship-report.ts';
import { fileKind, folderFixes, neededColumns, recogniseReport, REPORT_TYPES } from '../src/core/sources/report-types.ts';
import type { FolderFix } from '../src/core/sources/report-types.ts';
import { loadPacks, loadReferences } from '../src/hosts/cli.ts';

export const REAL_SHAPE_FOLDER = join(import.meta.dirname, '..', 'samples', 'real-shape');
/** The day of the folder: every file is dated by its name. */
export const REAL_SHAPE_DATE = '2026-11-19';
/** The name of the Solusi workbook. Invented: the real name carries the employer's own word. */
export const SOLUSI_NAME = `${REAL_SHAPE_DATE}_Contracts to ServiceNow Report 202611160700.xlsx`;

export interface RealShapeFile { name: string; bytes: Uint8Array }

/** Days since 30 December 1899: the date number of Excel. */
const serial = (date: string): number => Math.round((Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000);
/** A date number past 31 December 9999 (the real workbook has one in Next reminder date): the reader gives no date and no error. */
const PAST_EXCEL = 2958800;

const ACTIVE_FIELDS = ['CONTRACT_NO', 'CONTRACT_STATUS', 'PARTNER_NAME', 'CONTRACT_NAME', 'CONTRACT_TYPE', 'CLM_CONTRACT_RELATED', 'PARTNER_NO', 'COMPANY_CVR',
  'CONTRACT_CATEGORY', 'CONTRACT_START', 'CONTRACT_END', 'MAP_DURATION_TYPE', 'MAP_CONTRACT_EXTENSION_TYPE', 'NEXT_REMINDER_DATE', 'CLM_CONTRACT_OWNER',
  'CLM_CONTRACT_DAILY_RESPONSIBLE', 'CLM_CONTRACT_SUPPORTER', 'CONTRACT_RESPONSIBLE', 'CLM_CONTRACT_DOMAIN_ID_DEMO', 'CLM_CONTRACT_DOMAIN_DEMO',
  'CLM_CONTRACT_DEPARTMENT_DEMO', 'CONTRACT_SEGMENTATION', 'DUNS_NO', 'VENDOR_ACCOUNT_NO', 'CLM_CONTRACT_EPO_ID'];
const ACTIVE_LABELS = ['Contract No.', 'Status', 'Company name', 'Name', 'Contract type', 'Related contract', 'Company no.', 'VAT no.', 'Category',
  'Contract start', 'Contract end', 'Contract term type ', 'Automatic extension', 'Next reminder date', 'Contract Owner', 'Daily responsible',
  'Procurement Partner', 'Contract Manager', 'Division', 'Area, Domain or Program', 'Team', 'Contract segmentation', 'DUNS no', 'Vendor account no', 'EPO ID'];
const ENDED_FIELDS = ['CONTRACT_STATUS', 'CONTRACT_NO', 'CONTRACT_NAME', 'PARTNER_NO', 'COMPANY_CVR', 'PARTNER_NAME', 'CONTRACT_CATEGORY', 'CONTRACT_START',
  'CONTRACT_END', 'TERMINATION_DATE', 'MAP_CONTRACT_EXTENSION_TYPE', 'NEXT_REMINDER_DATE', 'CLM_CONTRACT_OWNER', 'CLM_CONTRACT_DAILY_RESPONSIBLE',
  'CLM_CONTRACT_SUPPORTER', 'CLM_CONTRACT_DOMAIN_ID_DEMO', 'CLM_CONTRACT_DOMAIN_DEMO', 'CLM_CONTRACT_DEPARTMENT_DEMO', 'CONTRACT_SEGMENTATION', 'DUNS_NO',
  'VENDOR_ACCOUNT_NO', 'CLM_SHARED_CONTRACT_NO', 'CLM_CONTRACT_ASSESTMENT', 'CLM_CONTRACT_EPO_ID', 'CONTRACT_TYPE'];
const ENDED_LABELS = ['Status', 'Contract', 'Name', 'Company no.', 'VAT no.', 'Company name', 'Category', 'Contract start', 'Contract end', 'Termination date',
  'Automatic extension', 'Next reminder date', 'Contract Owner', 'Daily responsible', 'Procurement Partner', 'Division', 'Area, Domain or Program', 'Team',
  'Contract segmentation', 'DUNS no', 'Vendor account no', 'Shadow contract no', 'Security assessment', 'EPO ID', 'Contract type'];

type Cell = string | { date: string } | { number: number } | null;
/** The contracts of the tab Active contracts, by field name; a field left out is an empty cell. */
const ACTIVE: Array<Record<string, Cell>> = [
  { CONTRACT_NO: 'CT100001', CONTRACT_STATUS: 'S - Concluded', PARTNER_NAME: 'Example Software Ltd', CONTRACT_NAME: 'Example Software - licence agreement',
    PARTNER_NO: '10001', CONTRACT_CATEGORY: '06 Software', CONTRACT_START: { date: '2024-01-01' }, CONTRACT_END: { date: '2027-12-31' },
    MAP_DURATION_TYPE: 'Fixed-term', MAP_CONTRACT_EXTENSION_TYPE: 'No extension', NEXT_REMINDER_DATE: { date: '2027-09-30' }, CLM_CONTRACT_OWNER: 'Olga Owner',
    CLM_CONTRACT_DAILY_RESPONSIBLE: 'Dana Daily', CLM_CONTRACT_SUPPORTER: 'Pat Partner', CLM_CONTRACT_DOMAIN_DEMO: 'D-100', VENDOR_ACCOUNT_NO: '50001', CLM_CONTRACT_EPO_ID: 'AST-0201' },
  { CONTRACT_NO: 'CT100002', CONTRACT_STATUS: 'S - Concluded', PARTNER_NAME: 'Example Tickets Ltd', CONTRACT_NAME: 'Example Tickets - service agreement',
    PARTNER_NO: '10002', CONTRACT_CATEGORY: '01 Outsourcing/Hosting - ICT', CONTRACT_START: { date: '2025-03-01' },
    MAP_DURATION_TYPE: 'No term', MAP_CONTRACT_EXTENSION_TYPE: 'Automatic extension', NEXT_REMINDER_DATE: { number: PAST_EXCEL }, CLM_CONTRACT_OWNER: 'Olga Owner',
    CLM_CONTRACT_DAILY_RESPONSIBLE: 'Dana Daily', CLM_CONTRACT_SUPPORTER: 'Pat Partner', VENDOR_ACCOUNT_NO: '50002', CLM_CONTRACT_EPO_ID: 'AST-0203' },
  { CONTRACT_NO: 'CT100003', CONTRACT_STATUS: 'S - Concluded', PARTNER_NAME: 'Example Payments Ltd', CONTRACT_NAME: 'Example Payments - frame agreement',
    PARTNER_NO: '10003', CONTRACT_CATEGORY: '09 Consultants', CONTRACT_START: { date: '2023-06-01' }, CONTRACT_END: { date: '2028-05-31' },
    MAP_DURATION_TYPE: 'sol.contract.form.fixedTerm|sol.contract.form.fixedTerm', MAP_CONTRACT_EXTENSION_TYPE: 'One-time extension', CLM_CONTRACT_OWNER: 'Dee Owner',
    CLM_CONTRACT_DAILY_RESPONSIBLE: 'Dana Daily', CLM_CONTRACT_SUPPORTER: 'Pat Partner', VENDOR_ACCOUNT_NO: '50003', CLM_CONTRACT_EPO_ID: 'AST-0204' },
  { CONTRACT_NO: 'CT100004', CONTRACT_STATUS: 'E - Ended', PARTNER_NAME: 'Example Kiosk Ltd', CONTRACT_NAME: 'Example Kiosk - maintenance',
    PARTNER_NO: '10004', CONTRACT_CATEGORY: '07 Hardware', CONTRACT_START: { date: '2020-01-01' }, CONTRACT_END: { date: '2025-12-31' },
    MAP_DURATION_TYPE: 'Fixed-term', MAP_CONTRACT_EXTENSION_TYPE: 'No extension', CLM_CONTRACT_OWNER: 'Ian Inactive', CLM_CONTRACT_SUPPORTER: 'Pat Partner',
    VENDOR_ACCOUNT_NO: '50004', CLM_CONTRACT_EPO_ID: 'AST-0205' },
  { CONTRACT_NO: 'CT100006', CONTRACT_STATUS: 'N - In negotiation', PARTNER_NAME: 'Example Newsletter Ltd', CONTRACT_NAME: 'Example Newsletter - mailing service',
    PARTNER_NO: '10006', CONTRACT_CATEGORY: '06 Software', CONTRACT_START: { date: '2026-12-01' }, CONTRACT_END: { date: '2027-11-30' },
    MAP_DURATION_TYPE: 'Fixed-term', CLM_CONTRACT_OWNER: 'Ada Example', CLM_CONTRACT_SUPPORTER: 'Pat Partner', CLM_CONTRACT_EPO_ID: 'AST-0207' }
];

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const column = (at: number): string => (at < 26 ? '' : String.fromCharCode(64 + Math.floor(at / 26))) + String.fromCharCode(65 + (at % 26));
const X = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/** The Solusi workbook: every element with the prefix x:, as the real export writes it. */
export function solusiWorkbook(): Uint8Array {
  const strings: string[] = [];
  const stringAt = (text: string): number => {
    const found = strings.indexOf(text);
    return found >= 0 ? found : strings.push(text) - 1;
  };
  const sheet = (fields: string[], labels: string[], rows: Array<Record<string, Cell>>): string => {
    const lines = [fields.map((field): Cell => field), labels.map((label): Cell => label), ...rows.map((row) => fields.map((field) => row[field] ?? null))];
    const xmlRows = lines.map((cells, line) => `<x:row r="${line + 1}">${cells.map((cell, at) => {
      const ref = `${column(at)}${line + 1}`;
      if (cell === null || cell === '') return '';
      if (typeof cell === 'string') return `<x:c r="${ref}" t="s"><x:v>${stringAt(cell)}</x:v></x:c>`;
      const value = 'date' in cell ? serial(cell.date) : cell.number;
      return `<x:c r="${ref}" s="1"><x:v>${value}</x:v></x:c>`;
    }).join('')}</x:row>`).join('');
    return `<?xml version="1.0" encoding="utf-8"?><x:worksheet ${X}><x:sheetData>${xmlRows}</x:sheetData></x:worksheet>`;
  };
  const active = sheet(ACTIVE_FIELDS, ACTIVE_LABELS, ACTIVE);
  const ended = sheet(ENDED_FIELDS, ENDED_LABELS, []);
  const text = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'utf8'));
  const entries = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="/xl/workbook.xml" Id="R1"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="utf-8"?><x:workbook ${R} ${X}><x:sheets>`
      + '<x:sheet name="Active contracts" sheetId="1" r:id="R2"/><x:sheet name="Terminated last 7 days" sheetId="2" r:id="R3"/></x:sheets></x:workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="R2"/>'
      + '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml" Id="R3"/>'
      + '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="/xl/styles.xml" Id="R4"/>'
      + '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="/xl/sharedStrings.xml" Id="R5"/></Relationships>'],
    ['xl/styles.xml', `<?xml version="1.0" encoding="utf-8"?><x:styleSheet ${X}><x:numFmts count="1"><x:numFmt numFmtId="177" formatCode="dd/mm/yyyy"/></x:numFmts>`
      + '<x:cellXfs count="2"><x:xf numFmtId="0"/><x:xf numFmtId="177" applyNumberFormat="1"/></x:cellXfs></x:styleSheet>'],
    ['xl/worksheets/sheet1.xml', active],
    ['xl/worksheets/sheet2.xml', ended]
  ];
  // The shared strings last: the sheets fill them.
  entries.push(['xl/sharedStrings.xml', `<?xml version="1.0" encoding="utf-8"?><x:sst count="${strings.length}" uniqueCount="${strings.length}" ${X}>`
    + strings.map((value) => `<x:si><x:t>${escape(value)}</x:t></x:si>`).join('') + '</x:sst>']);
  return new Uint8Array(zipOf(entries.map(([path, data]) => ({ path: path!, data: text(data!) }))));
}

/** Every file of the real-shape folder, in the order of their names, the Solusi workbook among them. */
export function realShapeFiles(): RealShapeFile[] {
  const csv = readdirSync(REAL_SHAPE_FOLDER).filter((name) => /\.(csv|txt)$/i.test(name))
    .map((name) => ({ name, bytes: new Uint8Array(readFileSync(join(REAL_SHAPE_FOLDER, name))) }));
  return [...csv, { name: SOLUSI_NAME, bytes: solusiWorkbook() }].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/* ------------------------------------------------------------------ the recorded result */

/** What src/core reads in one file of the real-shape folder (the Power BI check compares the M with it). */
export interface RealShapeRead {
  name: string;
  /** The report type, a known file (health, links) or "unknown". */
  kind: string;
  used: boolean;
  whyNotUsed: string;
  /** The rows the reader of its type gives: CIs, relationships, systems or contracts. 0 for a file of no report type. */
  rows: number;
  /** One fact per type the samples are there for: the CI columns missing, the relationships excluded, the contracts with criticality, the Solusi contracts with no end. */
  fact: string;
}

const inflate = async (data: Uint8Array): Promise<Uint8Array> => new Uint8Array(inflateRawSync(data));
const utf8 = new TextDecoder('utf-8');

/**
 * The real-shape files that Power Query's test tool can open: PQTest reads no .xlsx (Excel.Workbook needs the Access
 * engine there, which Power BI Desktop does not), so the Power BI check reads the CSV files only.
 */
export const csvRealShapeFiles = (): RealShapeFile[] => realShapeFiles().filter((file) => !/\.xlsx$/i.test(file.name));

/** The real-shape folder read as the Power BI report reads it: the type of each file, the choice of the day, the readers, what to fix and the checks. */
export async function readRealShape(files: RealShapeFile[] = realShapeFiles()): Promise<{ files: RealShapeRead[]; fixes: FolderFix[]; cis: number; findings: Record<string, number>; notes: Array<{ checkId: string; note: string }> }> {
  const references = loadReferences();
  const config = contractConfig(references)!;
  const tables = await Promise.all(files.map(async (file) => ({ file, table: await readTable(file.bytes, inflate, (data) => utf8.decode(data)) })));
  const kinds = tables.map(({ table }) => fileKind(table.rows[0] ?? []));
  const reportKinds = new Set(REPORT_TYPES.map((type) => type.kind as string));
  const choices = chooseReports(tables.flatMap(({ file, table }, at) => reportKinds.has(kinds[at]!)
    ? [{ name: file.name, kind: kinds[at]!, date: dateInName(file.name), columns: neededColumns(kinds[at]!, table.rows[0] ?? []), rows: Math.max(0, table.rows.length - 1), modified: 0 }] : []));
  const choiceOf = new Map(choices.map((choice) => [choice.name, choice]));
  let ci: { name: string; table: Table } | null = null;
  let relationships: Relationship[] | null = null;
  let epo: EpoInput | null = null;
  const contracts: ContractInput = { solusi: null, servicenow: null };
  const read = tables.map(({ file, table }, at): RealShapeRead => {
    const kind = kinds[at]!;
    const choice = choiceOf.get(file.name);
    const used = choice?.used ?? false;
    const base = { name: file.name, kind, used, whyNotUsed: choice?.whyNotUsed ?? '' };
    if (kind === 'ci') {
      const read = readCiReport(table.rows, { lossless: table.lossless });
      if (used) ci = { name: file.name, table };
      return { ...base, rows: read.cis.length, fact: `missing: ${missingWanted(read.columns).join(', ')}` };
    }
    if (kind === 'relationship') {
      const read = readRelationshipReport(table.rows);
      if (used) relationships = read.relationships;
      return { ...base, rows: read.relationships.length, fact: `excluded: ${read.relationships.filter((item) => item.excluded).length}` };
    }
    if (kind === 'epo') {
      const read = readEpoReport(table.rows, epoConfig(references)!);
      if (used) epo = { systems: read.systems, date: REAL_SHAPE_DATE, report: file.name, previousDate: '' };
      return { ...base, rows: read.systems.length, fact: '' };
    }
    if (kind === 'solusi') {
      const read = readSolusiFile(table.sheets ?? [{ name: '', rows: table.rows }], config);
      if (used) contracts.solusi = { contracts: read.contracts, date: REAL_SHAPE_DATE, report: file.name };
      return { ...base, rows: read.contracts.length, fact: `no end: ${read.contracts.filter((contract) => !contract.end).length}` };
    }
    if (kind === 'contract') {
      const read = readContractReport(table.rows, config);
      if (used) contracts.servicenow = { contracts: read.contracts, date: REAL_SHAPE_DATE, report: file.name };
      return { ...base, rows: read.contracts.length, fact: `criticality: ${read.contracts.filter((contract) => contract.criticality).length}` };
    }
    return { ...base, rows: 0, fact: '' };
  });
  const chosen = ci as { name: string; table: Table } | null;
  if (!chosen) throw new Error('The real-shape folder has no CI report.');
  const report = readCiReport(chosen.table.rows, { lossless: chosen.table.lossless });
  const fixes = folderFixes(tables.map(({ file, table }, at) => ({
    name: file.name, date: dateInName(file.name), kind: kinds[at]!, used: read[at]!.used, whyNotUsed: read[at]!.whyNotUsed, message: recogniseReport(table.rows[0] ?? []).message
  })), { name: chosen.name, date: dateInName(chosen.name), missing: missingWanted(report.columns) });
  const packs = checksInUse(loadPacks());
  const result = runChecks(report.cis, report.columns, packs, references, { relationships, date: REAL_SHAPE_DATE, epo, contracts });
  const findings: Record<string, number> = {};
  for (const finding of result.findings) findings[finding.checkId] = (findings[finding.checkId] ?? 0) + 1;
  const sorted = Object.fromEntries(Object.entries(findings).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { files: read, fixes, cis: report.cis.length, findings: sorted, notes: result.notes };
}

/** The text of tests/recorded/real-shape.json. */
export async function realShapeRecord(): Promise<string> {
  return `${JSON.stringify(await readRealShape(), null, 2)}\n`;
}
