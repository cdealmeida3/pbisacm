// The unit cases of the reading functions of powerbi/m/: the same inputs go through the TypeScript function of src/core/
// (the answer key) and the Power Query function, and tools/powerbi/parity.ts compares the two answers.
import { reportDate } from '../../src/core/shared/dates.ts';
import { identityKey, nameKey } from '../../src/core/shared/names.ts';
import { normaliseHeader } from '../../src/core/reading/headers.ts';
import { canonicalClass, level, truthy } from '../../src/core/sources/ci/ci-report.ts';
import { flag as contractFlag } from '../../src/core/sources/contracts/contract-reports.ts';
import { dateInName, localDate } from '../../src/core/memory/finder.ts';
import { fileKind, recogniseReport } from '../../src/core/sources/report-types.ts';
import { serviceNowAddress } from '../../src/core/cases/record-search.ts';
import { lettersOf, plainText } from '../../src/core/sources/epo/epo-report.ts';
import { environmentOf } from '../../src/core/checks/detectors/relationship-detectors.ts';
import { epoIdsOf } from '../../src/core/checks/detectors/contract-detectors.ts';
import type { RelationshipModel } from '../../src/core/checks/detectors/relationship-detectors.ts';
import { loadReferences } from '../../src/hosts/cli.ts';
import { mText, patternKey, patternUses } from './generate.ts';

export interface UnitCase { name: string; input: string; expected: string; m: string }

const show = (value: string | number | boolean | null | undefined): string => (value === null || value === undefined || value === '' ? 'null' : String(value));

const DATES = ['2026-06-10 10:35:59', '2026-06-10', '10-06-2026', '10/06/2026 10:35', '10.06.2026', '1-2-2026', '45000', '45000.5', '2026-02-30', '31-02-2026', '', 'abc', '2026-1-2', '20261-02-03'];
const LEVELS = ['busi ness critical', 'Business - critical', 'business\tcritical', 'BUSINESSCRITICAL', '1', '4', '5', ' 2 ', 'Mission critical', 'Business-critical', 'Business critical', 'Critical', 'Vital', 'Significant', 'Necessary', 'Low', 'Less critical', 'Minor', 'None', 'n/a', 'NA', 'Not set', '---', 'unknown', '', 'Something'];
const NAMES = ['  Member  Engine ', 'A​B', 'A B', 'Œuvre Brûlée', 'A﻿', 'Tab\there'];
const HEADERS = [' Owned By ', 'ci.name', 'Excluded for calculation', 'CI.Name', 'Parent [Service]', 'owned_by.email'];
const CLASSES = ['Application Service', 'cmdb_ci_service_auto', 'Business Capability', ' Some  Other Class ', 'API', 'Technical Service'];
const FLAGS = ['TRUE', 'yes', 'Y', '0', 'no', 'N', 'maybe', '', ' yes ', 'n '];
/** File names for the report date: the date in the name, else the day the file changed (2026-11-01, 10:00 UTC). An impossible date such as 2026-02-30 is left out: the app keeps it as text, Power BI cannot hold it (fnReportDate). */
const FILE_NAMES = ['2026-11-17_cmdb_ci.csv', 'cmdb_ci.csv', '2026-13-01_x.csv', '2026-1-01_x.csv', '2026-11-17x.csv', '17-11-2026_x.csv', '2026-11-17_', '2026-00-10_x.csv', '2026-12-31_x.xlsx'];
/** Texts every pattern is tested on: the forms the checks look for, in both cases, and texts around them. */
const PATTERN_TEXTS = ['', 'Member Engine', 'Member Engine - PROD', 'member engine - prod', 'Index - TEST', 'Index - DEV', 'Index-PROD', ' x', 'x ', 'a  b',
  'TBD', 'tbd', 'n/a', 'N/A', '-', '...', 'test', 'Test description', 'To be defined', '(Auto generated)', 'Created (auto generated) by Discovery', 'AST-0001', 'ast-0001', 'AST-001',
  'BS-1234', 'owned_by', 'owned_by.email', 'supportGroup', 'Support group', 'cmdb_ci_service', 'Business Service 12', '12345', 'abc_def.Ghi', 'a.b', 'é', 'Œuvre Brûlée',
  'BIA pending', 'bia-pending', 'decommissioned', 'Retired', 'to map', 'app.example', 'x\u200by',
  // For the fast forms (D285): a non-ASCII text in lower case, the Kelvin sign, spaces around, one letter changed.
  'T\u00e9st', '\u212a', 'TODO', 'to do', 'To  do', 'N/A ', 'testing', 'tested', 'PROD', ' - prod', 'x - TEST', 'API - x', 'API x', 'APIx', 'Ab3', 'Ab_', 'abc_def ghi', 'tbd\u200b'];
const ADDRESSES = ['https://contoso.service-now.com', ' HTTPS://Contoso.Service-Now.com/nav_to.do?uri=x ', 'https://contoso.service-now.com:8443/', 'http://contoso.service-now.com',
  'https://', 'contoso.service-now.com', 'https://user@contoso.com', 'https://contoso.com#top', ''];
/** EPO descriptions: HTML as the export writes it, and the odd cases of the patterns of plainText. */
const HTML = ['<p class={Q}MsoNormal{Q}><span>Production instance</span></p>', '<p>Routes ticket orders to the &amp; ticket partners.</p>', 'a<br>b<BR/>c</P>d</div>e</li>f</h2>g',
  '</param>x', 'a < b <i>c</i>', 'a <br no end', '&lt;b&gt; &quot;x&quot; &apos;y&apos; &nbsp;z&NBSP;', '&#65;&#x42;&#X43;&#12ab;&#xyz;&#0;&foo;&amp', '  many \t\n spaces\u00a0here  ',
  '<p>Line one</p><p>Line two</p>', '', 'plain'];
/** Texts compared by their letters and digits. */
const LETTERS = ['Production instance of the index tool.', 'Œuvre Brûlée 12', '  A-b_c! ', 'É', ''];
/** Service Instance names and Environment fields: the environment (PROD when none). */
const ENVIRONMENTS: Array<[string, string]> = [['Index - TEST', ''], ['Index - PROD', ''], ['Index (UAT)', ''], ['Index', ''], ['Index Production', ''], ['Index - tst ', ''],
  ['Index - DEV', 'acc'], ['Index - disaster recovery', ''], ['Testing', ''], ['Pre-prod Index', ''], ['Index pre-prod', ''], ['Index', 'Sandbox']];
/** The patterns read for where they match (fnSearch), on texts around them. */
const SEARCH_TEXTS = ['Fines_BA', 'Fines BA ', 'Fines-ba', 'BA', 'Booking', 'Member Engine - PROD', 'Member Engine - prod', 'Index - TEST', 'x - PROD - TEST', 'Index (UAT)', 'Index tst'];
/** The EPO ID column of Solusi (free text): the EPO IDs written in it (epoIdsOf), with 3 digits at least and with 1. */
const EPO_ID_TEXTS = ['AST-0006', '9999', 'AST-0006, AST-0009', 'ast-0006 and 12', 'A-B-1234', '-123', 'x12', 'Ref: 12 34', '', 'AB12CD345', 'AST-0006 AST-0006',
  'AST-0006 / 0006', '\u00d61234', '1234-5678', 'AST--123', 'EPO 1001; EPO 1002', 'n/a'];
const MODIFIED_MS = Date.UTC(2026, 10, 1, 10, 0, 0);
const HEADER_ROWS = [['name', 'sys_class_name'], ['parent', 'type', 'child'], ['epoid', 'systemname', 'systemstatus'], ['contract_no', 'contract_status', 'partner_name'],
  ['number', 'vendor_contract', 'state'], ['number', 'vendor_contract', 'state', 'name', 'sys_class_name'], ['foo']];

export function unitCases(): UnitCase[] {
  const cases: UnitCase[] = [];
  for (const input of DATES) cases.push({ name: 'fnParseDate', input, expected: show(reportDate(input)), m: `fnParseDate(${mText(input)})` });
  for (const input of LEVELS) cases.push({ name: 'fnLevel', input, expected: show(level(input)), m: `fnLevel(${mText(input)})` });
  for (const input of NAMES) {
    cases.push({ name: 'fnNameKey ?', input, expected: show(identityKey(input)), m: `fnNameKey(${mText(input)}, "?")` });
    cases.push({ name: 'fnNameKey', input, expected: show(nameKey(input)), m: `fnNameKey(${mText(input)}, "")` });
  }
  for (const input of HEADERS) cases.push({ name: 'fnNormaliseHeader', input, expected: show(normaliseHeader(input)), m: `fnNormaliseHeader(${mText(input)})` });
  for (const input of CLASSES) cases.push({ name: 'fnCanonicalClass', input, expected: show(canonicalClass(input)), m: `fnCanonicalClass(${mText(input)})` });
  for (const input of FLAGS) {
    cases.push({ name: 'fnFlag', input, expected: show(truthy(input)), m: `fnFlag(${mText(input)})` });
    cases.push({ name: 'fnFlag strict', input, expected: show(contractFlag(input.trim())), m: `fnFlag(${mText(input)}, true)` });
  }
  for (const input of FILE_NAMES) cases.push({ name: 'fnReportDate', input, expected: dateInName(input) || localDate(MODIFIED_MS, 0), m: `fnReportDate(${mText(input)}, #datetime(2026, 11, 1, 10, 0, 0))` });
  for (const row of HEADER_ROWS) {
    const found = recogniseReport(row);
    const list = `{${row.map(mText).join(', ')}}`;
    cases.push({ name: 'fnReportType', input: row.join(','), expected: show(fileKind(row)), m: `fnReportType(${list})[Kind]` });
    if (!found.type) cases.push({ name: 'fnReportType message', input: row.join(','), expected: found.message, m: `fnReportType(${list})[Message]` });
  }
  // The regular expressions of the checks (tools/powerbi/regex.ts and fnRegexTest), each on every text, against JavaScript.
  const seen = new Set<string>();
  for (const use of patternUses()) {
    const key = patternKey(use);
    if (seen.has(key)) continue;
    seen.add(key);
    const pattern = new RegExp(use.source, use.flags.replace('g', ''));
    for (const text of PATTERN_TEXTS) cases.push({ name: `fnMatches ${key}`, input: text, expected: String(pattern.test(text)), m: `fnMatches(${mText(use.source)}, ${mText(use.flags)}, ${mText(text)})` });
  }
  for (const input of ADDRESSES) cases.push({ name: 'fnServiceNowAddress', input, expected: show(serviceNowAddress(input)), m: `fnServiceNowAddress(${mText(input)})` });
  for (const input of HTML) cases.push({ name: 'fnPlainText', input, expected: show(plainText(input)), m: `fnPlainText(${mText(input)})` });
  for (const input of EPO_ID_TEXTS) {
    for (const digits of [3, 1]) {
      cases.push({ name: `fnEpoIds ${digits}`, input, expected: show(epoIdsOf(input, digits).map((id) => `${id.written}/${id.digits}`).join('; ')),
        m: `Text.Combine(List.Transform(fnEpoIds(${mText(input)}, ${digits}), (id) => id[Written] & "/" & id[Digits]), "; ")` });
    }
  }
  for (const input of LETTERS) cases.push({ name: 'fnLetters', input, expected: show(lettersOf(input)), m: `fnLetters(${mText(input)})` });
  const model = loadReferences()['reference/relationship-model'] as RelationshipModel;
  for (const [name, field] of ENVIRONMENTS) {
    cases.push({ name: 'fnEnvironment', input: `${name}|${field}`, expected: show(environmentOf(name, field, model)), m: `fnEnvironment(${mText(name)}, ${mText(field)}, ReferenceFiles[#"relationship-model"])` });
  }
  // Where a pattern first matches, and the text with that match removed, as String.search and String.replace.
  const searched = patternUses().filter((use) => /relationship-(model|detectors)/.test(use.where) && /\$$/.test(use.source) && !/^\^/.test(use.source));
  for (const use of searched.filter((item, at) => searched.findIndex((other) => patternKey(other) === patternKey(item)) === at)) {
    const pattern = new RegExp(use.source, use.flags);
    for (const text of SEARCH_TEXTS) {
      cases.push({ name: `fnSearch ${patternKey(use)}`, input: text, expected: String(text.search(pattern)), m: `fnSearch(${mText(use.source)}, ${mText(use.flags)}, ${mText(text)})[Index]` });
      cases.push({ name: `fnReplacePattern ${patternKey(use)}`, input: text, expected: show(text.replace(pattern, '')), m: `fnReplacePattern(${mText(use.source)}, ${mText(use.flags)}, ${mText(text)}, "")` });
    }
  }
  return cases;
}

/** PQTest returns at most 1,000 rows of a query, so the cases are split into pages: Units1, Units2, ... */
export const UNIT_PAGE_SIZE = 900;

/** The names of the unit queries, one per page of cases. */
export function unitQueryNames(): string[] {
  const pages = Math.max(1, Math.ceil(unitCases().length / UNIT_PAGE_SIZE));
  return Array.from({ length: pages }, (_, at) => `Units${at + 1}`);
}

/** The M of one unit query: one row per case of the page, Got is the Power Query answer as text ("null" for null). */
export function unitQuery(page: number): string {
  const cases = unitCases().slice((page - 1) * UNIT_PAGE_SIZE, page * UNIT_PAGE_SIZE);
  const rows = cases.map((item) => `        {${mText(item.name)}, ${mText(item.input)}, Show(${item.m})}`).join(',\n');
  return [
    'let',
    '    Show = (value as any) as text =>',
    '        if value = null or value = "" then "null"',
    '        else if value is date then Date.ToText(value, [Format = "yyyy-MM-dd", Culture = "en-US"])',
    '        else if value is logical then (if value then "true" else "false")',
    '        else if value is number then Number.ToText(value, "G", "en-US")',
    '        else value,',
    '    Cases = #table(type table [Name = text, Input = text, Got = text], {',
    rows,
    '    })',
    'in',
    '    Cases'
  ].join('\n');
}
