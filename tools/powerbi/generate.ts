// Writes the generated parts of the Power BI project (powerbi/), from the repository:
//   - powerbi/SACM-Workbench.SemanticModel/definition/expressions.tmdl: every shared query of the model. The hand-written
//     Power Query files of powerbi/m/ (one query per file), and the packed data: the invented samples, the check files, the
//     reference files, the reading rules of src/core/sources/ and the recorded result of the samples (tests/recorded/).
//   - powerbi/SACM-Workbench.SemanticModel/definition/tables/Run.tmdl and HistoryRun.tmdl: the hidden tables Run and
//     HistoryRun (with its incremental refresh, D290), from the calculated tables that split them.
//   - powerbi/SACM-Workbench.Report/StaticResources/RegisteredResources/sacm-theme.json: the theme, from the design tokens of
//     tools/powerbi/tokens.ts (the colours of docs/LOOK.md, the text sizes, the page grid).
// Same repository, same bytes (no date, no random value).
//   node tools/powerbi/generate.ts            writes both files (npm run powerbi:generate)
//   node tools/powerbi/generate.ts --check    fails when they are not up to date (also in npm test)
// Power BI Desktop writes every shared query into expressions.tmdl when it saves, so that file is generated: change a
// query in powerbi/m/, never in Desktop. --check compares the M of each query, not the annotations Desktop adds.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { REPORT_TYPES } from '../../src/core/sources/report-types.ts';
import { CLASS_ALIASES, CI_CLASSES, FIELD_ALIASES, OPERATIONAL_STATUS, PERSON_PARTS } from '../../src/core/sources/ci/ci-report.ts';
import { CHANGE_FIELDS } from '../../src/core/sources/contracts/contract-changes.ts';
import { CHILD_CLASS, CHILD_TAG, PARENT_CLASS, PARENT_TAG, RELATIONSHIP_REPORT } from '../../src/core/sources/relationships/relationship-report.ts';
import { APPLICATION_SUFFIX, CLASS_WORDS } from '../../src/core/checks/detectors/relationship-detectors.ts';
import { CHANGED_CHIP } from '../../src/core/checks/detectors/epo-detectors.ts';
import { DIMENSIONS, LEVEL_WORDS, MODULES, PROCUREMENT, PROCUREMENT_VIA, ROLES } from '../../src/core/model/model.ts';
import { COLUMN_WORDS, PART_WORDS, ROLE_WORDS } from '../../src/core/shared/text.ts';
import { COLUMN_HINT, COLUMN_OF } from '../../src/core/checks/engine.ts';
import { HIDDEN_CHARACTERS } from '../../src/core/shared/names.ts';
import { EPO_OWNER } from '../../src/core/cases/cases.ts';
import { TOPICS } from '../../src/app/view/cards.ts';
import { MODULE_LABEL } from '../../src/app/ui/labels.ts';
import { DEFAULT_SETTINGS, NUMBER_RANGES } from '../../src/app/state/store.ts';
import { EARLIER, RECORD_DATE, SAMPLE_FILES } from '../../tests/sample-record.ts';
import { MODEL, readExpressions, readTables, SOURCE_TABLES, tmdlName } from './tmdl.ts';
import type { SourceTable } from './tmdl.ts';
import { expectedHistory, HISTORY_FILES, STATE_LISTS } from './history.ts';
import { compilePattern, fastForm } from './regex.ts';
import { DATA_COLOURS, FONT, FONT_SEMIBOLD, GRID, lightColours, TEXT } from './tokens.ts';
import { ACTIONS_FILE, APP_FORMULAS_FILE, APP_YAML_FILE, appFormulas, appYaml, AUDIT_APP_FORMULAS_FILE, AUDIT_APP_YAML_FILE, auditFormulas, MESSAGES_APP_FORMULAS_FILE, MESSAGES_APP_YAML_FILE, messagesFormulas } from './actions.ts';
import { SETTING_LABELS } from '../../src/app/view/setup.ts';
import { reviewConfig } from '../../src/core/cases/inventory.ts';
import { loadReferences } from '../../src/hosts/cli.ts';
import { STATUSES } from '../../src/core/cases/cases.ts';
import { EXCEPTION_REASONS } from '../../src/core/audit/audit.ts';
import { statusWord } from '../../src/app/view/cases.ts';
import { COLUMNS, CONTRACT_COLUMNS, EPO_ROLE, MAX_CIS_PER_MESSAGE, REQUESTS, ROLE_LABEL, ROLE_REQUEST, ROLE_WORD } from '../../src/core/messages/messages.ts';
import type { FastForm, Node } from './regex.ts';

const root = join(import.meta.dirname, '..', '..');
const read = (path: string): string => readFileSync(join(root, path), 'utf8');
export const EXPRESSIONS_FILE = join(MODEL, 'expressions.tmdl');
export const RUN_FILE = join(MODEL, 'tables', 'Run.tmdl');
/** The file of each hidden table the calculated tables split. */
export const SOURCE_FILES: Record<SourceTable, string> = { Run: RUN_FILE, HistoryRun: join(MODEL, 'tables', 'HistoryRun.tmdl') };
const STATE_FOLDER = join(root, 'powerbi', 'samples', 'state');
/** What the measures of the history count on the samples (tools/powerbi/history.ts), worked out once. */
export const EXPECTED_HISTORY = await expectedHistory();
export const THEME_FILE = join(root, 'powerbi', 'SACM-Workbench.Report', 'StaticResources', 'RegisteredResources', 'sacm-theme.json');
const M_FOLDER = join(root, 'powerbi', 'm');

/* ------------------------------------------------------------------ the packed data */

/** A text as an M text literal. `#(` would start an escape in M, so it is written `#(#)(`. */
export const mText = (text: string): string => `"${text.replace(/"/g, '""').replace(/#\(/g, '#(#)(')}"`;

/**
 * The invented samples, each with the name it would have in the SharePoint folder: yyyy-MM-dd_<name>. With the earlier
 * CI and Relationship reports of powerbi/samples/ (the history, D290).
 */
function sampleFiles(): Array<{ name: string; base64: string }> {
  const dated = (file: { path: string; name: string }, date: string) => ({ name: `${date}_${file.name}`, base64: readFileSync(file.path).toString('base64') });
  const { solusiEarlier, ...rest } = SAMPLE_FILES;
  return [...Object.values(rest).map((file) => dated(file, RECORD_DATE)), dated(solusiEarlier, EARLIER), ...HISTORY_FILES.map((file) => dated(file, file.date))]
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The invented lists of the team's state (powerbi/samples/state/), by file name (D291). */
function stateFiles(): Array<{ name: string; base64: string }> {
  return Object.values(STATE_LISTS).map((list) => ({ name: list.file, base64: readFileSync(join(STATE_FOLDER, list.file)).toString('base64') }));
}

/** Every check file, in the order of their file names whatever the folder (as the app reads them), with its folder. */
function checkFiles(): Array<{ path: string; folder: string; pack: unknown }> {
  const packs = join(root, 'checks', 'packs');
  const files = readdirSync(packs, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.json')).map((file) => file.replace(/\\/g, '/'));
  return files.sort((a, b) => basename(a).localeCompare(basename(b)))
    .map((file) => ({ path: `checks/packs/${file}`, folder: file.split('/')[0]!, pack: JSON.parse(read(`checks/packs/${file}`)) }));
}

function referenceFiles(): Record<string, unknown> {
  const folder = join(root, 'checks', 'reference');
  const out: Record<string, unknown> = {};
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.json')).sort()) out[file.replace(/\.json$/, '')] = JSON.parse(read(`checks/reference/${file}`));
  return out;
}

/** A column name from a field: owned_by.manager -> OwnedByManager. */
export const pascal = (text: string): string => text.split(/[._]/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');

/** The columns of the CI report as src/core/sources/ci/ci-report.ts reads them: one spec per column of table Inventory. */
function ciColumns(): Array<{ column: string; field: string; any: string[]; suffix?: boolean; kind: string }> {
  const SUFFIX = new Set(['exceptionStatus', 'exceptionJustification', 'serviceMapped', 'platform']);
  const KIND: Record<string, string> = {
    operationalStatus: 'status', tags: 'tags', serviceMapped: 'flag', platform: 'flag', supportGroupActive: 'flag', createdOn: 'date', updatedOn: 'date'
  };
  const NAME: Record<string, string> = { className: 'SourceClass', operationalStatus: 'Status' };
  // `field`: the name of the column as src/core/sources/ci/ci-report.ts lists it in `columns` (what a check needs).
  const specs: Array<{ column: string; field: string; any: string[]; suffix?: boolean; kind: string }> = [];
  for (const field of Object.keys(FIELD_ALIASES)) {
    if (field === 'sysId') continue;
    specs.push({ column: NAME[field] ?? pascal(field), field, any: FIELD_ALIASES[field]!, ...(SUFFIX.has(field) ? { suffix: true } : {}), kind: KIND[field] ?? 'text' });
  }
  for (const role of ROLES) {
    specs.push({ column: pascal(role), field: role, any: [role, `${role}.name`], kind: 'text' });
    for (const part of Object.keys(PERSON_PARTS)) {
      const names = PERSON_PARTS[part]!.map((name) => `${role}.${name}`);
      specs.push({ column: pascal(role) + pascal(part), field: `${role}.${part}`, any: names.concat(names.map((name) => name.replace(/\./g, '_'))), kind: part.endsWith('active') ? 'flag' : 'text' });
    }
  }
  for (const kind of ['target', 'inherited']) {
    for (const dimension of DIMENSIONS) specs.push({ column: pascal(kind) + pascal(dimension), field: `${kind}.${dimension}`, any: [`${kind}_${dimension}`], suffix: true, kind: 'level' });
  }
  return specs;
}

/** One regular expression of the check files, the reference files or the logic, as Power Query needs it (tools/powerbi/regex.ts). */
export interface PatternUse { source: string; flags: string; where: string }

/** The rule operators whose `value` (or `ignore`) is a regular expression, tested ignoring case (src/core/checks/engine.ts). */
const PATTERN_OPERATORS = new Set(['matchesAny', 'tagMatchesAny', 'onlyMatches', 'notOnlyMatches']);

/**
 * Every regular expression the built detectors of Power Query test: in the conditions of the check files, in the reference
 * files the CI detectors read, and the one of src/core/shared/text.ts (missingColumns). A new place that holds a pattern
 * is added here, with the detector that reads it.
 */
export function patternUses(): PatternUse[] {
  const uses: PatternUse[] = [];
  const add = (source: unknown, flags: string, where: string): void => { if (typeof source === 'string' && source) uses.push({ source, flags, where }); };
  const walk = (condition: Record<string, unknown>, where: string): void => {
    for (const key of ['all', 'any']) if (Array.isArray(condition[key])) for (const item of condition[key] as Array<Record<string, unknown>>) walk(item, where);
    if (PATTERN_OPERATORS.has(String(condition.op))) for (const value of Array.isArray(condition.value) ? condition.value : [condition.value]) add(value, 'i', where);
    if (condition.op === 'lacksValidEntryFor') add(condition.ignore, 'i', where);
  };
  for (const file of checkFiles()) {
    const pack = file.pack as { id: string; detector: { when?: Record<string, unknown> } };
    if (pack.detector.when) walk(pack.detector.when, file.path);
  }
  const references = referenceFiles() as Record<string, Record<string, unknown> | undefined>;
  const nameRules = (references['name-rules']?.rules ?? []) as Array<{ when?: string; pattern?: string }>;
  for (const rule of nameRules) { add(rule.when, '', 'checks/reference/name-rules.json'); add(rule.pattern, '', 'checks/reference/name-rules.json'); }
  const epoId = references['epo-id'] as { notNeeded?: Array<{ name: string }>; offeringNumber?: { number: string } } | undefined;
  for (const rule of epoId?.notNeeded ?? []) add(rule.name, '', 'checks/reference/epo-id.json');
  add(epoId?.offeringNumber?.number, '', 'checks/reference/epo-id.json');
  const offerings = (references['epo-synced-classes'] as { offerings?: { personUserId?: string } } | undefined)?.offerings;
  add(offerings?.personUserId ?? '^$', '', 'checks/reference/epo-synced-classes.json');
  add(TECHNICAL_COLUMN, '', 'src/core/shared/text.ts');
  // The relationship checks: the environment of a Service Instance, the name of a Business Application.
  const model = references['relationship-model'] as { environments?: { suffix?: string; aliases?: Array<{ pattern: string }> }; applicationCopy?: { instanceSuffix?: string } } | undefined;
  const suffix = model?.environments?.suffix;
  if (suffix && !ENVIRONMENT_SUFFIX.test(suffix)) throw new Error(`checks/reference/relationship-model.json: environments.suffix must be "\\b(<words>)\\)?\\s*$": fnEnvironment reads the word as the rest of the name`);
  add(suffix, 'i', 'checks/reference/relationship-model.json');
  for (const alias of model?.environments?.aliases ?? []) add(alias.pattern, 'i', 'checks/reference/relationship-model.json');
  // fnSearch and fnReplacePattern take the longest match from where the first match starts: the same as JavaScript only
  // for a pattern that ends with "$" (D280).
  const searched = (source: string | undefined, file: string): string | undefined => {
    if (source !== undefined && !source.endsWith('$')) throw new Error(`${file}: the pattern ${source} must end with "$": fnSearch and fnReplacePattern find a match that ends the text`);
    return source;
  };
  add(searched(model?.applicationCopy?.instanceSuffix, 'checks/reference/relationship-model.json'), '', 'checks/reference/relationship-model.json');
  add(searched(APPLICATION_SUFFIX, 'src/core/checks/detectors/relationship-detectors.ts'), 'i', 'src/core/checks/detectors/relationship-detectors.ts');
  // The contract checks: the status tag and the tag that sets the criticality by hand (contract-reports.ts, statusTagOf;
  // contract-detectors.ts, stillLinked), tested ignoring case.
  const contracts = references['contract-reports'] as { statusTag?: string; targetTag?: string } | undefined;
  add(contracts?.statusTag, 'i', 'checks/reference/contract-reports.json');
  add(contracts?.targetTag, 'i', 'checks/reference/contract-reports.json');
  // The mapping backlog: the tags that make a CI a case.
  const tagged = (references['mapping-backlog'] as { tagged?: { tags?: string[] } } | undefined)?.tagged;
  for (const tag of tagged?.tags ?? []) add(tag, 'i', 'checks/reference/mapping-backlog.json');
  return uses;
}

/** The form of the environment suffix that fnEnvironment can read: a word boundary, the words as one group, an optional ")", spaces, the end. */
const ENVIRONMENT_SUFFIX = /^\\b\((?!\?)[^()]*\)\\\)\?\\s\*\$$/;

/** missingColumns (src/core/shared/text.ts): a column name that is shown next to its label. */
export const TECHNICAL_COLUMN = '^[a-z]+(_[a-z]+)*(\\.[a-zA-Z]+)*$';

/** The key of a pattern in the query Patterns: its flags, "/", its text. */
export const patternKey = (use: Pick<PatternUse, 'source' | 'flags'>): string => `${use.flags}/${use.source}`;

/** Every pattern compiled, by its key (sorted, so the same repository gives the same bytes). Throws on a form Power Query does not know. */
export function compiledPatterns(): Record<string, Node> {
  const out: Record<string, Node> = {};
  for (const use of patternUses().sort((a, b) => patternKey(a).localeCompare(patternKey(b)))) {
    try { out[patternKey(use)] = compilePattern(use.source, use.flags); } catch (error) { throw new Error(`${use.where}: ${(error as Error).message}`); }
  }
  return out;
}

/** The fast form of every pattern, by the same key as compiledPatterns (D285). */
export function patternForms(): Record<string, FastForm> {
  const out: Record<string, FastForm> = {};
  for (const use of patternUses().sort((a, b) => patternKey(a).localeCompare(patternKey(b)))) out[patternKey(use)] = fastForm(use.source, use.flags);
  return out;
}

/** What the Power Query readers need to read the reports as src/core/ does. */
export function readingRules(): Record<string, unknown> {
  const needOf = (label: string): string[] => RELATIONSHIP_REPORT.needs.find((need) => need.label === label)!.any;
  return {
    reportTypes: REPORT_TYPES.map((type) => ({ kind: type.kind, label: type.label, hint: type.hint, needs: type.needs,
      ...(type.staleAfter ? { staleAfter: Math.max(type.staleAfter, DEFAULT_SETTINGS.staleDays) } : {}) })),
    staleDays: DEFAULT_SETTINGS.staleDays,
    ciColumns: ciColumns(),
    classAliases: CLASS_ALIASES,
    operationalStatus: OPERATIONAL_STATUS,
    relationshipColumns: { parent: needOf('Parent'), type: needOf('Type'), child: needOf('Child'), parentClass: PARENT_CLASS, childClass: CHILD_CLASS, parentTag: PARENT_TAG, childTag: CHILD_TAG },
    classes: CI_CLASSES.map((id) => ({ id, label: CLASS_WORDS[id] ?? id })),
    topics: TOPICS.map((topic) => ({ folder: topic.folder, word: topic.word })),
    sections: MODULES.map((id) => ({ id, label: MODULE_LABEL[id] })),
    stateWords: { red: 'To solve', review: 'To check', marked: 'All marked as fixed', green: 'OK', grey: 'Not tested' },
    // The words of the checks (src/core/checks/, src/core/shared/text.ts, src/core/cases/), for the details and the notes.
    roles: ROLES,
    dimensions: DIMENSIONS,
    modules: MODULES,
    levelWords: LEVEL_WORDS,
    columnWords: { columns: COLUMN_WORDS, roles: ROLE_WORDS, parts: PART_WORDS },
    columnOf: COLUMN_OF,
    columnHints: COLUMN_HINT,
    technicalColumn: TECHNICAL_COLUMN,
    hiddenCharacters: Object.keys(HIDDEN_CHARACTERS).map((char) => ({ code: char.charCodeAt(0), label: HIDDEN_CHARACTERS[char] })),
    procurement: { id: PROCUREMENT, via: PROCUREMENT_VIA },
    epoOwner: { id: EPO_OWNER, name: 'EPO inventory owner', via: 'inventory owner of EPO' },
    classWords: CLASS_WORDS,
    // The page Contract changes (src/core/sources/contracts/contract-changes.ts): the fields compared, in order.
    contractChangeFields: CHANGE_FIELDS.map((entry) => ({ field: entry.field, label: entry.label, date: entry.date === true })),
    epoChangedChip: CHANGED_CHIP,
    applicationSuffix: APPLICATION_SUFFIX
  };
}

/** The recorded result of the samples that the Self-check page compares with: per card, its state and its lines by state. */
function expectedResult(): unknown {
  const cards = JSON.parse(read('tests/recorded/cards.json')) as Array<Record<string, unknown>>;
  return {
    date: RECORD_DATE,
    cards: cards.map((card) => ({ id: card.id, light: card.light, tested: card.tested, cis: card.cis,
      open: card.open, review: card.review, waiting: card.waiting, known: card.known }))
  };
}

/* ------------------------------------------------------------------ expressions.tmdl */

interface Query { name: string; m: string; description: string; group: string }

const PARAMETERS = ['SourceMode', 'StateMode', 'SharePointSite', 'ReportsFolder', 'ServiceNowAddress', 'RangeStart', 'RangeEnd'];
/** The queries of the checks themselves (group Checks), besides the detectors fnDetect…. */
const CHECK_QUERIES = new Set(['BuiltDetectors', 'CheckRun', 'fnCheckRun', 'fnFacts', 'fnContact', 'fnListing', 'fnSourceFirst', 'fnParked', 'fnFinding', 'fnMatches', 'fnRegexTest', 'fnRegexWalk', 'fnSearch', 'fnEpoCompare', 'fnEpoTested', 'fnEpoNoFlag', 'fnEpoCorrections',
  'fnContractCompare', 'fnContractSubject', 'ContractWords', 'fnEpoIds']);

/** A hand-written query of powerbi/m/: the comment lines at its top are its description, the rest its M. */
function handWritten(file: string): Query {
  const lines = readFileSync(join(M_FOLDER, file), 'utf8').replace(/\r\n/g, '\n').trimEnd().split('\n');
  const comments: string[] = [];
  while (lines.length && lines[0]!.startsWith('//')) comments.push(lines.shift()!.replace(/^\/\/\s?/, ''));
  const name = file.replace(/\.pq$/, '');
  const group = PARAMETERS.includes(name) ? 'Parameters' : name.endsWith('Rows') ? 'Tables' : CHECK_QUERIES.has(name) || name.startsWith('fnDetect') ? 'Checks' : 'Reading';
  return { name, m: lines.join('\n'), description: comments.join(' '), group };
}

function packed(): Query[] {
  const json = (value: unknown): string => `Json.Document(${mText(JSON.stringify(value))})`;
  const samples = sampleFiles().map((file) => `\t{${mText(file.name)}, ${mText(file.base64)}}`).join(',\n');
  const version = (JSON.parse(read('package.json')) as { version: string }).version;
  const [year, month, day] = RECORD_DATE.split('-').map(Number);
  return [
    { name: 'SampleFiles', group: 'Packed', description: 'GENERATED from samples/ by npm run powerbi:generate. The invented sample reports, as their bytes in base64, with the name they would have in the SharePoint folder.',
      m: `#table(type table [FileName = text, Base64 = text], {\n${samples}\n})` },
    { name: 'CheckFiles', group: 'Packed', description: 'GENERATED from checks/packs/. Every check file, in the order of the file names, with its folder.', m: mText(JSON.stringify(checkFiles())) },
    { name: 'ReferenceFiles', group: 'Packed', description: 'GENERATED from checks/reference/. Every reference file, by its name.', m: json(referenceFiles()) },
    { name: 'ReadingRules', group: 'Packed', description: 'GENERATED from src/core/sources/. The report types, the header forms and the words the readers use.', m: json(readingRules()) },
    { name: 'Patterns', group: 'Packed', description: 'GENERATED from the check files and the reference files (tools/powerbi/regex.ts). Every regular expression the checks test, compiled for fnRegexTest, by flags and text.', m: json(compiledPatterns()) },
    { name: 'PatternForms', group: 'Packed', description: 'GENERATED from the check files and the reference files (tools/powerbi/regex.ts, D285). For each pattern of Patterns, the fast form that decides most texts without the walk (fnFastMatch).', m: json(patternForms()) },
    { name: 'RunColumnTypes', group: 'Packed', description: 'GENERATED from the calculated tables (D284). The type of every column of Run that a part gives, for RunRows: the data type of the column of the calculated table.', m: runColumnTypes('Run') },
    { name: 'HistoryRunColumnTypes', group: 'Packed', description: 'GENERATED from the calculated tables (D290). The type of every column of HistoryRun that a part gives, for fnHistoryRun.', m: runColumnTypes('HistoryRun') },
    { name: 'StateFiles', group: 'Packed', description: 'GENERATED from powerbi/samples/state/. The invented lists of the team\'s state (journal, replies, settings, team), as their bytes in base64, read when StateMode is Sample (D291).',
      m: `#table(type table [FileName = text, Base64 = text], {\n${stateFiles().map((file) => `\t{${mText(file.name)}, ${mText(file.base64)}}`).join(',\n')}\n})` },
    { name: 'StateLists', group: 'Packed', description: 'GENERATED from tools/powerbi/history.ts (D291). The four lists of the team\'s state: the name of the SharePoint list, the sample file and the columns.', m: json(STATE_LISTS) },
    { name: 'SettingRanges', group: 'Packed', description: 'GENERATED from src/app/state/store.ts (D158). The range and the default of each number setting.',
      m: json(Object.fromEntries(Object.entries(NUMBER_RANGES).map(([key, range]) => [key, { ...range, default: (DEFAULT_SETTINGS as unknown as Record<string, number>)[key] }]))) },
    { name: 'MessageWords', group: 'Packed', description: 'GENERATED from src/core/messages/messages.ts (build B7, D300). The words of the messages: the requests of the Service Portal (id, name, the action inside its form, the name before 0.14.1), the words of the roles, EPO\'s names for them, the request that changes each role, the columns of the tables and the most CIs in one message.',
      m: json({ requests: REQUESTS, roleLabel: ROLE_LABEL, roleWord: ROLE_WORD, epoRole: EPO_ROLE, roleRequest: ROLE_REQUEST, columns: COLUMNS, contractColumns: CONTRACT_COLUMNS, maxCis: MAX_CIS_PER_MESSAGE }) },
    { name: 'AppActions', group: 'Packed', description: 'GENERATED from powerbi/apps/actions.json (D294). The actions of the Power App SACM actions: id, label, the journal event, its scope and what the manager types; fnCaseActions gives each case the actions of scope line that apply.',
      m: json(JSON.parse(readFileSync(ACTIONS_FILE, 'utf8'))) },
    { name: 'ExpectedHistory', group: 'Packed', description: 'GENERATED from tools/powerbi/history.ts. What the HTML app counts on the samples over the two report dates and the team\'s state, for the Self-check page.', m: mText(JSON.stringify(EXPECTED_HISTORY)) },
    { name: 'ExpectedResult', group: 'Packed', description: 'GENERATED from tests/recorded/cards.json. What the HTML app finds on the samples, for the Self-check page.', m: mText(JSON.stringify(expectedResult())) },
    { name: 'WorkbenchVersion', group: 'Packed', description: 'GENERATED from package.json. The version of the Workbench.', m: mText(version) },
    { name: 'SampleDate', group: 'Packed', description: 'GENERATED from tests/sample-record.ts. The day the samples were recorded.', m: `#date(${year}, ${month}, ${day})` }
  ];
}

export function queries(): Query[] {
  const files = readdirSync(M_FOLDER).filter((file) => file.endsWith('.pq')).sort();
  const own = files.map(handWritten);
  const order = (query: Query): number => ['Parameters', 'Packed', 'Reading', 'Checks', 'Tables'].indexOf(query.group);
  return [...own, ...packed()].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

/** The text of expressions.tmdl. */
export function expressionsTmdl(): string {
  const parts = queries().map((query) => {
    const description = query.description ? `/// ${query.description}\n` : '';
    const single = !query.m.includes('\n');
    const body = single ? ` ${query.m}` : `\n${query.m.split('\n').map((line) => (line ? `\t\t${line}` : '')).join('\n')}`;
    return `${description}expression ${query.name} =${body}\n\tqueryGroup: ${query.group}\n`;
  });
  return parts.join('\n');
}

/* ------------------------------------------------------------------ tables/Run.tmdl */

/**
 * The M type of a TMDL data type, as the parts give it: a date column of a part is a date, unless its format shows the
 * time (hh), then it is a date and time (the journal, the replies).
 */
const M_TYPES: Record<string, string> = { string: 'type nullable text', int64: 'Int64.Type', boolean: 'type nullable logical', dateTime: 'type nullable date', double: 'type nullable number', time: 'type nullable datetime' };
const mTypeOf = (column: { dataType: string; formatString?: string } | undefined): string | undefined =>
  M_TYPES[column?.dataType === 'dateTime' && /hh/.test(column.formatString ?? '') ? 'time' : column?.dataType ?? 'string'];

/** The query <Source>ColumnTypes: {"<Part>.<Column>", <type>} for every column a part gives, as Table.TransformColumnTypes takes it. */
export function runColumnTypes(source: SourceTable = 'Run'): string {
  const pairs: string[] = [];
  for (const table of readTables().filter((item) => item.calculated?.source === source)) {
    const types = new Map(table.columns.map((item) => [item.sourceColumn, item]));
    for (const [name, column] of table.calculated!.columns) {
      const type = mTypeOf(types.get(name));
      if (!type) throw new Error(`${table.file}: the data type ${types.get(name)?.dataType} of ${name} has no M type in generate.ts`);
      pairs.push(`{${mText(column)}, ${type}}`);
    }
  }
  return `{\n${pairs.map((pair) => `    ${pair}`).join(',\n')}\n}`;
}

/** What each hidden table is, for the first line of its file, and the lines after its partition. */
const SOURCE_TEXT: Record<SourceTable, { about: string; rows: string; after: string[] }> = {
  Run: { about: 'The checks on the newest CI report, computed once per refresh', rows: 'RunRows', after: [] },
  HistoryRun: {
    about: 'The checks on every CI report date, kept by the incremental refresh (D290): 24 months, the last 7 days looked at, a day computed again only when its files changed',
    // Power BI Desktop refuses a refresh policy whose source does not name RangeStart and RangeEnd itself (a query that
    // names them is not enough), so the partition and the policy call fnHistoryRun directly.
    rows: 'fnHistoryRun(RangeStart, RangeEnd)',
    // Incremental refresh (Premium Per User): monthly parts for 24 months, daily parts for the last 7 days; a daily part is
    // computed again only when fnHistoryPolling gives another value (detect data changes).
    after: [
      '\trefreshPolicy',
      '\t\tpolicyType: basic',
      '\t\trollingWindowGranularity: month',
      '\t\trollingWindowPeriods: 24',
      '\t\tincrementalGranularity: day',
      '\t\tincrementalPeriods: 7',
      '\t\tpollingExpression = fnHistoryPolling(RangeStart, RangeEnd)',
      '\t\tsourceExpression = fnHistoryRun(RangeStart, RangeEnd)',
      ''
    ]
  }
};

/**
 * A hidden table the calculated tables split (D284, D290): a column Part, the report date, and for each calculated table
 * of that source every column it takes (<Part>.<Column>), with the data type of the calculated table's column. Generated
 * from the calculated tables, so the two never differ. Its rows come from the query RunRows, or from fnHistoryRun(RangeStart, RangeEnd).
 */
export function runTmdl(source: SourceTable = 'Run'): string {
  const calculated = readTables().filter((table) => table.calculated?.source === source);
  const column = (name: string, dataType: string, extra: string[] = []): string =>
    [`\tcolumn ${tmdlName(name)}`, `\t\tdataType: ${dataType}`, ...extra.map((line) => `\t\t${line}`), '\t\tsummarizeBy: none', `\t\tsourceColumn: ${name}`, ''].join('\n');
  const columns = [column('Part', 'string'), column('ReportDate', 'dateTime', ['formatString: d mmm yyyy'])];
  for (const table of calculated) {
    const types = new Map(table.columns.map((item) => [item.sourceColumn, item.dataType]));
    for (const [name, taken] of table.calculated!.columns) columns.push(column(taken, types.get(name) ?? 'string'));
  }
  const text = SOURCE_TEXT[source];
  return [
    `/// GENERATED by npm run powerbi:generate from the calculated tables (D284). ${text.about}: the rows of ${calculated.map((table) => table.calculated!.part).join(', ')}. Hidden: the pages show the calculated tables.`,
    `table ${source}`,
    '\tisHidden',
    '',
    ...columns,
    `\tpartition ${source} = m`,
    '\t\tmode: import',
    `\t\tsource = ${text.rows}`,
    '',
    ...text.after
  ].join('\n');
}

/* ------------------------------------------------------------------ the theme */

/** The light colours of src/app/styles.css by name (tokens.ts); kept here for the files that import it from generate.ts. */
export { lightColours };

/** A colour of a formatting property, as a theme writes it. */
const solid = (color: string) => ({ solid: { color } });

/**
 * The theme of the report (design pass §3.1): the colours of LOOK, the text classes, and the look of every visual type
 * the report uses, so a visual sets only what is its own (its position, fields, title and column widths). Checked against
 * Microsoft's schema of report themes (tools/powerbi/schemas/theme/, lint step 3).
 */
export function theme(): Record<string, unknown> {
  const c = lightColours();
  const text = (size: number, colour = c.ink!, face = FONT) => ({ fontFace: face, fontSize: size, color: colour });
  const title = { show: true, fontColor: solid(c.ink!), fontFamily: FONT_SEMIBOLD, fontSize: TEXT.title, titleWrap: false, alignment: 'left' };
  const subTitle = { fontColor: solid(c.muted!), fontFamily: FONT, fontSize: TEXT.subtitle, titleWrap: true, alignment: 'left' };
  const table = {
    grid: [{ gridVertical: false, gridHorizontal: true, gridHorizontalColor: solid(c.line!), gridHorizontalWeight: 1, rowPadding: 6, outlineColor: solid(c.line!), textSize: TEXT.table }],
    columnHeaders: [{ backColor: solid(c['accent-soft']!), fontColor: solid(c.ink!), fontFamily: FONT_SEMIBOLD, fontSize: TEXT.table, wordWrap: false, autoSizeColumnWidth: false, outlineStyle: 0 }],
    values: [{ fontColorPrimary: solid(c.ink!), fontColorSecondary: solid(c.ink!), backColorPrimary: solid(c.surface!), backColorSecondary: solid(c.surface!), fontFamily: FONT, fontSize: TEXT.table, wordWrap: true, urlIcon: true }],
    total: [{ totals: false }]
  };
  return {
    name: 'SACM Workbench',
    dataColors: DATA_COLOURS.map((name) => c[name]),
    foreground: c.ink, foregroundNeutralSecondary: c.muted, foregroundNeutralTertiary: c.muted,
    background: c.surface, backgroundLight: c['surface-2'], backgroundNeutral: c.line,
    tableAccent: c.accent, hyperlink: c.accent, visitedHyperlink: c.accent,
    good: c.green, neutral: c.amber, bad: c.red, maximum: c.red, center: c.amber, minimum: c.green, null: c.grey,
    textClasses: {
      title: text(TEXT.title, c.ink, FONT_SEMIBOLD),
      header: text(TEXT.table, c.ink, FONT_SEMIBOLD),
      label: text(TEXT.label, c.muted),
      callout: text(TEXT.callout, c.ink, FONT_SEMIBOLD)
    },
    visualStyles: {
      '*': { '*': {
        background: [{ show: true, color: solid(c.surface!), transparency: 0 }],
        border: [{ show: true, color: solid(c.line!), radius: GRID.radius, width: 1 }],
        dropShadow: [{ show: false }],
        padding: [{ top: GRID.padding, bottom: GRID.padding, left: GRID.padding, right: GRID.padding }],
        title: [title],
        subTitle: [subTitle],
        spacing: [{ customizeSpacing: true, spaceBelowTitle: 2, spaceBelowSubTitle: 8, spaceBelowTitleArea: 8 }]
      } },
      page: { '*': { background: [{ color: solid(c.page!), transparency: 0 }], outspace: [{ color: solid(c.page!), transparency: 0 }] } },
      tableEx: { '*': table },
      // A matrix has no total row of its own: its totals are the subtotals of its rows and columns (off: they add up
      // counts of different days).
      pivotTable: { '*': {
        grid: table.grid, columnHeaders: table.columnHeaders,
        subTotals: [{ rowSubtotals: false, columnSubtotals: false }],
        rowHeaders: [{ fontColor: solid(c.ink!), fontFamily: FONT, fontSize: TEXT.table, wordWrap: true }],
        values: [{ ...table.values[0], bandedRowHeaders: false }],
        rowTotal: [{ fontColor: solid(c.ink!), fontFamily: FONT_SEMIBOLD, fontSize: TEXT.table }],
        columnTotal: [{ fontColor: solid(c.ink!), fontFamily: FONT_SEMIBOLD, fontSize: TEXT.table }]
      } },
      card: { '*': {
        labels: [{ color: solid(c.ink!), fontFamily: FONT_SEMIBOLD, fontSize: TEXT.callout }],
        categoryLabels: [{ show: true, color: solid(c.muted!), fontFamily: FONT, fontSize: TEXT.label }],
        wordWrap: [{ show: true }],
        title: [{ ...title, show: false }]
      } },
      multiRowCard: { '*': {
        dataLabels: [{ color: solid(c.ink!), fontFamily: FONT, fontSize: TEXT.title }],
        categoryLabels: [{ show: false, color: solid(c.muted!), fontFamily: FONT, fontSize: TEXT.label }],
        cardTitle: [{ color: solid(c.ink!), fontFamily: FONT_SEMIBOLD, fontSize: TEXT.title }],
        card: [{ barShow: false, outlineStyle: 0, cardPadding: 0, cardBackground: solid(c.surface!) }],
        title: [{ ...title, show: false }],
        padding: [{ top: 4, bottom: 4, left: GRID.padding, right: GRID.padding }]
      } },
      slicer: { '*': {
        header: [{ show: true, fontColor: solid(c.muted!), fontFamily: FONT, textSize: TEXT.label }],
        items: [{ fontColor: solid(c.ink!), fontFamily: FONT, textSize: TEXT.table, background: solid(c.surface!) }],
        title: [{ ...title, show: false }],
        padding: [{ top: 4, bottom: 4, left: 8, right: 8 }]
      } },
      lineChart: { '*': {
        legend: [{ show: true, position: 'Top', fontFamily: FONT, fontSize: TEXT.label, labelColor: solid(c.muted!) }],
        categoryAxis: [{ fontFamily: FONT, fontSize: TEXT.label, labelColor: solid(c.muted!), gridlineShow: false, showAxisTitle: false }],
        valueAxis: [{ fontFamily: FONT, fontSize: TEXT.label, labelColor: solid(c.muted!), gridlineShow: true, gridlineColor: solid(c.line!), showAxisTitle: false }],
        lineStyles: [{ strokeWidth: 2, showMarker: true, markerSize: 4 }]
      } },
      textbox: { '*': {
        background: [{ show: false }],
        border: [{ show: false }],
        padding: [{ top: 0, bottom: 0, left: 0, right: 0 }],
        title: [{ ...title, show: false }]
      } },
      actionButton: { '*': {
        title: [{ ...title, show: false }]
      } }
    }
  };
}

const themeText = (): string => `${JSON.stringify(theme(), null, 2)}\n`;

/* ------------------------------------------------------------------ the Power App (build B6) */

/** The generated files of the Power Apps SACM actions (D294), SACM messages (D301) and SACM audit (D306, D308), by path: their named formulas and their App. */
export function appFiles(): Array<{ file: string; text: string }> {
  const formulas = appFormulas(STATUSES, statusWord, EXCEPTION_REASONS, DEFAULT_SETTINGS.exceptionMonths);
  const messages = messagesFormulas();
  const review = reviewConfig(loadReferences());
  const audit = auditFormulas(SETTING_LABELS, DEFAULT_SETTINGS as unknown as Record<string, number>, review ? review.results : []);
  return [
    { file: APP_FORMULAS_FILE, text: formulas }, { file: APP_YAML_FILE, text: appYaml(formulas) },
    { file: MESSAGES_APP_FORMULAS_FILE, text: messages },
    { file: MESSAGES_APP_YAML_FILE, text: appYaml(messages, 'SACM messages', 'MessagesScreen', 'powerbi/apps/sacm-messages/formulas.fx') },
    { file: AUDIT_APP_FORMULAS_FILE, text: audit },
    { file: AUDIT_APP_YAML_FILE, text: appYaml(audit, 'SACM audit', 'AuditScreen', 'powerbi/apps/sacm-audit/formulas.fx') }
  ];
}

/* ------------------------------------------------------------------ write or check */

/** The queries whose M differs from what the generator writes, and the queries missing or not generated. */
export function staleQueries(): string[] {
  const wanted = queries();
  const found = new Map(readExpressions(EXPRESSIONS_FILE).map((expression) => [expression.name, expression.m.trim()]));
  const problems: string[] = [];
  for (const query of wanted) {
    if (!found.has(query.name)) problems.push(`${query.name}: missing`);
    else if (found.get(query.name) !== query.m.trim()) problems.push(`${query.name}: its M is not the one of ${query.group === 'Packed' ? 'the repository' : `powerbi/m/${query.name}.pq`}`);
  }
  for (const name of found.keys()) if (!wanted.some((query) => query.name === name)) problems.push(`${name}: not in powerbi/m/ (a query made in Power BI Desktop? move it to powerbi/m/${name}.pq)`);
  for (const source of SOURCE_TABLES) {
    const file = SOURCE_FILES[source];
    if (!existsSync(file) || readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== runTmdl(source)) problems.push(`${relative(root, file)}: not the columns of the calculated tables`);
  }
  if (!existsSync(THEME_FILE) || readFileSync(THEME_FILE, 'utf8').replace(/\r\n/g, '\n') !== themeText()) problems.push(`${relative(root, THEME_FILE)}: not the theme of the colours of LOOK.md`);
  for (const { file, text } of appFiles()) if (!existsSync(file) || readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== text) problems.push(`${relative(root, file)}: not what actions.json and formulas.fx give`);
  return problems;
}

if (process.argv[1] === import.meta.filename) {
  if (process.argv.includes('--check')) {
    const problems = staleQueries();
    for (const problem of problems) console.error(problem);
    console.log(problems.length ? `Power BI: ${problems.length} generated parts are not up to date. Run npm run powerbi:generate.` : 'Power BI: the generated parts are up to date.');
    process.exit(problems.length ? 1 : 0);
  }
  writeFileSync(EXPRESSIONS_FILE, expressionsTmdl());
  writeFileSync(THEME_FILE, themeText());
  for (const source of SOURCE_TABLES) writeFileSync(SOURCE_FILES[source], runTmdl(source));
  for (const { file, text } of appFiles()) writeFileSync(file, text);
  console.log(`Power BI: wrote ${relative(root, EXPRESSIONS_FILE)} (${queries().length} queries), ${SOURCE_TABLES.map((source) => relative(root, SOURCE_FILES[source])).join(', ')}, ${relative(root, THEME_FILE)} and the Power App\'s formulas.`);
}
