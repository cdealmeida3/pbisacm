// The probes of the refresh time (plan of the speed build §5.2, D283): members of the test connector only, never of the
// model. A probe evaluates a table or a stage of the checks completely and returns ONE row (rows and cells counted), so
// neither the 1,000-row limit of PQTest nor the size of its JSON hides any time. tools/powerbi/time.ps1 runs each probe
// as its own PQTest call, as Power BI evaluates each table on its own, and subtracts the time of Time.Empty.
//   Time.<Table>       every table the model loads with Power Query (the M partitions of tables/)
//   Time.Stage.<name>  the stages of the checks (with --stages): reading, the CIs, the graph, the parked CIs, the EPO
//                      comparison, each built check alone (Time.Check.<id>), all checks, the source first, the facts, the key-set idiom
//   RealSize.Summary   the counts that tools/powerbi/parity.ts --real-size compares with src/core at the same size
import { readExpressions, readTables } from './tmdl.ts';
import { loadPackFiles } from '../../src/hosts/cli.ts';
import { mText } from './generate.ts';

/** The probe function of the connector: a table, every cell computed, as one row [Rows, Cells]. */
const PROBE_TABLE = `(t as table) as table =>
    let rows = Table.ToRows(Table.Buffer(t)) in
    #table(type table [Rows = Int64.Type, Cells = Int64.Type], {{List.Count(rows), List.Sum({0} & List.Transform(rows, (row) => List.Count(List.Select(row, (cell) => cell <> null))))}})`;

/** A list of records as a probe: its count, and each named field of each item computed (a text field counts its length). */
const PROBE_LIST = `(items as list, fields as list) as table =>
    let
        buffered = List.Buffer(items),
        size = (value as any) as number => if value = null then 0 else if value is text then Text.Length(value) else if value is list then List.Count(value) else 1,
        cells = List.Transform(buffered, (item) => List.Sum({0} & List.Transform(fields, (field) => size(Record.FieldOrDefault(item, field, null)))))
    in
        #table(type table [Rows = Int64.Type, Cells = Int64.Type], {{List.Count(buffered), List.Sum({0} & cells)}})`;

/** The tables the model loads with Power Query: every table with an M partition. */
export function loadedTables(): string[] {
  return readTables().filter((table) => table.partitionM !== '' && table.partitionKind !== 'calculated').map((table) => table.name);
}

/** The ids of the checks in use whose detector is built (BuiltDetectors), in file order. */
export function builtCheckIds(): string[] {
  const builtM = readExpressions().find((expression) => expression.name === 'BuiltDetectors')?.m ?? '';
  const built = new Set([...builtM.matchAll(/"([^"]+)"/g)].map((match) => match[1]!));
  return loadPackFiles().map((file) => file.pack as { id: string; status: string; detector: { type: string; module?: string } })
    .filter((pack) => pack.status !== 'off' && built.has(pack.detector.type === 'rule' ? 'rule' : pack.detector.module ?? pack.detector.type))
    .map((pack) => pack.id);
}

export interface Probe { name: string; m: string }

/** Every probe: the tables, and with `stages` the stages of the checks. */
export function probes(stages: boolean): Probe[] {
  const out: Probe[] = [{ name: 'Time.Empty', m: '#table(type table [Rows = Int64.Type, Cells = Int64.Type], {{0, 0}})' }];
  for (const table of loadedTables()) out.push({ name: `Time.${table}`, m: `ProbeTable(${table})` });
  if (!stages) return out;
  const run = 'CheckRun';
  const stage = (name: string, m: string): void => { out.push({ name: `Time.Stage.${name}`, m }); };
  stage('ReadFiles', 'ProbeTable(Table.AddColumn(Table.SelectColumns(ReadFiles, {"FileName", "Kind", "Read"}), "Rows", each Table.RowCount([Read][Rows]), Int64.Type)[[FileName], [Kind], [Rows]])');
  stage('ReadCi', 'ProbeTable(fnReadCiReport(fnNewest("ci"){0}[Read]))');
  stage('Cis', `ProbeList(${run}[Cis], {"Key", "HiddenCharacters", "TagList"})`);
  stage('Graph', `let graph = ${run}[Graph] in ProbeList(List.Transform(graph[Edges], (edge) => [Parent = edge[Parent][Key], Child = edge[Child][Key], Up = edge[Parent][Environment], Down = edge[Child][Environment]]) & {[Parent = Text.From(graph[Unmatched] + graph[Ambiguous])]}, {"Parent", "Child", "Up", "Down"})`);
  stage('Parked', `let parked = ${run}[Parked] in ProbeList(List.Transform(parked[Keys], (key) => [Key = key]) & List.Transform(parked[Lines], (line) => [Key = line]), {"Key"})`);
  stage('EpoCompare', `let comparison = ${run}[RunContext][EpoComparison] in ProbeList(List.Transform(comparison[Pairs], (pair) => [Ci = pair[Ci][Key], Differences = List.Transform(pair[Differences], (difference) => difference[Field])]), {"Ci", "Differences"})`);
  // The reader of the CI report step by step (Probe.ReadCi.<step>: fnReadCiReport stopped after that step), and a
  // generated member read 15,000 times, as is and once named in a let: is a shared member computed once?
  for (const step of READ_CI_STEPS) stage(`ReadCi.${step}`, `ProbeAny(#"Probe.ReadCi.${step}"(fnNewest("ci"){0}[Read]))`);
  // The parts of the table Run (D284), each alone, and what EPO already says (the slowest column of Findings).
  for (const part of ['Findings', 'Tested', 'Notes', 'Parked', 'MappingBacklog', 'RelationshipLinks', 'CapabilitySheet']) stage(`Part.${part}`, `ProbeTable(fn${part}Part(${run}))`);
  stage('Part.SelfCheck', `ProbeTable(fnSelfCheckPart(Table.Buffer(fnFindingsPart(${run})), Table.Buffer(fnTestedPart(${run}))))`);
  stage('EpoCorrections', `ProbeAny(fnEpoCorrections(${run}[Facts], ${run}))`);
  stage('Shared.Member', 'ProbeList(List.Transform(List.Numbers(1, 15000), (n) => [Found = Text.From(ReadingRules[staleDays] + n)]), {"Found"})');
  stage('Shared.Named', 'let rules = ReadingRules in ProbeList(List.Transform(List.Numbers(1, 15000), (n) => [Found = Text.From(rules[staleDays] + n)]), {"Found"})');
  const findings = '{"Key", "Detail", "Review", "Wait", "Fix"}';
  for (const id of builtCheckIds()) out.push({ name: `Time.Check.${id}`, m:  `ProbeList(Record.Field(${run}[Outputs], ${mText(id)})[Findings], ${findings})` });
  stage('Checks', `ProbeList(${run}[Stages][Combined][Findings], ${findings})`);
  stage('SourceFirst', `ProbeList(${run}[Stages][SourceFirst][Findings], {"Key", "Detail", "Wait", "Source"})`);
  stage('Facts', `ProbeList(${run}[Facts], {"Key", "Detail", "State", "StateWhy", "ContactId", "Cc", "EscalateName", "Route"})`);
  // The key-set idiom (§4.1): 15,000 tests against a record of 15,000 fields, and against a buffered list.
  const keys = 'List.Transform(List.Numbers(1, 15000), (n) => "k" & Text.From(n))';
  stage('SetIdiom.Record', `let keys = List.Buffer(${keys}), set = Record.FromList(List.Repeat({true}, 15000), keys) in ProbeList(List.Transform(keys, (key) => [Found = if Record.HasFields(set, key & "") then key else null]), {"Found"})`);
  stage('SetIdiom.List', `let keys = List.Buffer(${keys}) in ProbeList(List.Transform(keys, (key) => [Found = if List.Contains(keys, key & "") then key else null]), {"Found"})`);
  return out;
}

/**
 * RealSize.Summary (§6.2 of the plan): the counts per check and state that tools/powerbi/parity.ts --real-size compares
 * with src/core on the same scaled files. Kind: findings (Id check|state: findings, distinct CIs, the length of their
 * keys, details and contacts), tested (Id check:part: the CIs evaluated), notes (Id check: notes and their length),
 * built (the built checks), rows (a table: its rows).
 */
export const SUMMARY = `let
    findings = Table.Buffer(Findings),
    groups = Table.Group(findings, {"CheckId", "State"}, {
        {"Count", Table.RowCount, Int64.Type},
        {"Cis", (rows) => List.Count(List.Distinct(rows[CiKey])), Int64.Type},
        {"Chars", (rows) => List.Sum({0} & List.Transform(Table.ToRecords(rows), (row) => Text.Length(row[Key]) + Text.Length(row[Detail]) + Text.Length(row[ContactId]))), Int64.Type}}),
    found = List.Transform(Table.ToRecords(groups), (row) => {"findings", row[CheckId] & "|" & row[State], row[Count], row[Cis], row[Chars]}),
    tested = List.Transform(Table.ToRecords(Tested), (row) => {"tested", if row[Part] = "" then row[CheckId] else row[CheckId] & ":" & row[Part], if row[Evaluated] = null then -1 else row[Evaluated], 0, 0}),
    noteGroups = Table.Group(Notes, {"CheckId"}, {{"Count", Table.RowCount, Int64.Type}, {"Chars", (rows) => List.Sum({0} & List.Transform(rows[Reason], Text.Length)), Int64.Type}}),
    notes = List.Transform(Table.ToRecords(noteGroups), (row) => {"notes", row[CheckId], row[Count], 0, row[Chars]}),
    built = List.Transform(Table.SelectRows(Checks, each [Built])[CheckId], (id) => {"built", id, 1, 0, 0}),
    rows = List.Transform({{"Inventory", Inventory}, {"Relationships", Relationships}, {"RelationshipLinks", RelationshipLinks}, {"MappingBacklog", MappingBacklog},
        {"CapabilitySheet", CapabilitySheet}, {"Parked", Parked}, {"EpoSystems", EpoSystems}}, (pair) => {"rows", pair{0}, Table.RowCount(pair{1}), 0, 0})
in
    #table(type table [Kind = text, Id = text, Count = Int64.Type, Cis = Int64.Type, Chars = Int64.Type], found & tested & notes & built & rows)`;

/** The steps of fnReadCiReport that the stages time one by one (a table, a list or a record). */
const READ_CI_STEPS = ['picked', 'kept', 'values', 'classes', 'spaces', 'baseKeys', 'key1s', 'nthOf', 'keys', 'built'];

/** fnReadCiReport stopped after `step`: the same M, returning that step. */
export function readCiStep(step: string): string {
  const m = readExpressions().find((expression) => expression.name === 'fnReadCiReport')!.m;
  const end = /\n(\s*)in\s+typed\s*$/;
  if (!end.test(m)) throw new Error('fnReadCiReport no longer ends with "in typed": update READ_CI_STEPS in probes.ts');
  return m.replace(end, `\n$1in\n$1    ${step}`).replace(/\(read as record\) as table =>/, '(read as record) as any =>');
}

/** Any value as a probe: a table as ProbeTable; a list: its items, and the items of each item that is a list; a record: its fields. */
const PROBE_ANY = `(value as any) as table =>
    if value is table then ProbeTable(value)
    else if value is list then
        let items = List.Buffer(value) in
        #table(type table [Rows = Int64.Type, Cells = Int64.Type], {{List.Count(items), List.Sum({0} & List.Transform(items, (item) => if item is list then List.Count(List.Buffer(item)) else 1))}})
    else if value is record then #table(type table [Rows = Int64.Type, Cells = Int64.Type], {{1, Record.FieldCount(value)}})
    else #table(type table [Rows = Int64.Type, Cells = Int64.Type], {{1, 1}})`;

/** The members the connector adds for the probes: the two probe functions, every probe and the summary. */
export function probeMembers(stages: boolean): Probe[] {
  const steps = stages ? READ_CI_STEPS.map((step) => ({ name: `Probe.ReadCi.${step}`, m: readCiStep(step) })) : [];
  return [{ name: 'ProbeTable', m: PROBE_TABLE }, { name: 'ProbeList', m: PROBE_LIST }, { name: 'ProbeAny', m: PROBE_ANY }, ...steps, ...probes(stages), { name: 'RealSize.Summary', m: SUMMARY }];
}
