import { DIMENSIONS, ROLES, levelWords } from '../model/model.ts';
import { nameKey, visibleName, withoutHidden } from '../shared/names.ts';
import { columnWord, missingColumns } from '../shared/text.ts';
import { afterChecks, familyOf } from './detectors/index.ts';
import { PARKED_MISSING, isParked, parkedOf } from './parked.ts';
import type { DetectorRun, EngineInputs } from './detectors/index.ts';
import type { CheckPack, Ci, Condition, Finding, FixLine, PersonRef, References, Role, RunResult } from '../model/model.ts';

/** Runs check packs on one snapshot. Pure: same input, same findings, same keys. */

interface Context {
  /** How many CIs in the whole report share each value (normalised), per field, for "duplicatedMoreThan". */
  counts: Map<string, Map<string, number>>;
  /** The same for "duplicatedInClass": live CIs only, by class and value ("<class>|<value>"). */
  classCounts: Map<string, Map<string, number>>;
  cis: Ci[];
  references: References;
}

type Leaf = Extract<Condition, { op: string }>;

const squash = nameKey;
const isRole = (field: string): field is Role => (ROLES as readonly string[]).includes(field);
const fill = (text: string, each: string): string => text.split('{each}').join(each);

/** Check field names that are read from a report column of another name. */
export const COLUMN_OF: Record<string, string> = {
  exception_justification: 'exceptionJustification', exception_status: 'exceptionStatus',
  support_group: 'supportGroup', operational_status: 'operationalStatus'
};

/** What to say when a "column" that is not a real report column is missing. */
export const COLUMN_HINT: Record<string, string> = {
  supportGroupActive: 'the report has no column that says if the Support group is active. Add "Support group Active" (support_group.active) to the CI report',
  'name.hidden': 'a CSV report cannot show hidden characters (it writes "?" instead). Load the CI report as .xlsx, or load the Relationship report with it'
};

/** Every operator a rule condition may use (`detector.when` of a check of type "rule"). The check-file validator reads it. */
export const RULE_OPERATORS = [
  'isEmpty', 'refInactive', 'shorterThan', 'equalsField', 'matchesAny', 'duplicatedMoreThan', 'duplicatedInClass', 'hasDoubleSpaces', 'equals',
  'samePersonAs', 'tagMatchesAny', 'levelsMissing', 'greaterThanField', 'lessThanField', 'lacksValidEntryFor', 'groupInactive',
  'hasHiddenCharacters', 'missingTags', 'tagsNotIn', 'onlyMatches', 'notOnlyMatches'
] as const;

/** The report columns a condition needs. A check never reports on data the report does not carry. */
function columnsFor(leaf: Leaf, field: string): string[] {
  if (leaf.op === 'hasHiddenCharacters') return ['name.hidden'];
  if (leaf.op === 'groupInactive') return ['supportGroup', 'supportGroupActive'];
  if (leaf.op === 'levelsMissing') return DIMENSIONS.map((dimension) => `${field}.${dimension}`);
  if (isRole(field)) return [leaf.op === 'refInactive' ? `${field}.active` : field];
  return [COLUMN_OF[field] ?? field];
}

function flatten(lists: string[][]): string[] {
  return lists.reduce((all, list) => all.concat(list), [] as string[]);
}

function requiredColumns(condition: Condition, each: string): string[] {
  if ('all' in condition) return flatten(condition.all.map((item) => requiredColumns(item, each)));
  if ('any' in condition) return flatten(condition.any.map((item) => requiredColumns(item, each)));
  const field = fill(condition.field ?? each, each);
  const columns = columnsFor(condition, field);
  if ((/Field$/.test(condition.op) || condition.op === 'samePersonAs') && typeof condition.value === 'string') columns.push(fill(condition.value, each));
  return columns;
}

function text(ci: Ci, field: string): string {
  if (field === 'description') return ci.description;
  if (field === 'name') return ci.name;
  if (field === 'exception_justification') return ci.exceptionJustification;
  if (field === 'exception_status') return ci.exceptionStatus;
  if (field === 'support_group') return ci.supportGroup;
  if (field === 'operational_status') return ci.operationalStatus;
  return '';
}

/** The same person: user ID first, then email, then (only when neither is known) the display name. */
function samePerson(a: PersonRef | undefined, b: PersonRef | undefined): boolean {
  if (!a || !b) return false;
  if (a.userId && b.userId) return a.userId.toLowerCase() === b.userId.toLowerCase();
  if (a.email && b.email) return a.email.toLowerCase() === b.email.toLowerCase();
  return !a.email && !b.email && !!a.name && squash(a.name) === squash(b.name);
}

function countsOf(context: Context, field: string): Map<string, number> {
  let counts = context.counts.get(field);
  if (!counts) {
    counts = new Map<string, number>();
    for (const ci of context.cis) {
      const key = squash(text(ci, field));
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    context.counts.set(field, counts);
  }
  return counts;
}

/** A Retired CI is not live: it does not count for "duplicatedInClass". */
const isRetired = (ci: Ci): boolean => squash(ci.operationalStatus) === 'retired';

/** A rule of a mandatory tag (checks/reference/mandatory-tags.json): one of the tags, or a tag that ends with one of the endings after a first word. */
interface TagRule { label: string; oneOf: string[]; endsWith?: string[] }
/** A tag as its words: normalised as a name, a hyphen counts as a space ("Partner-facing" is "partner facing"). */
const tagWords = (tag: string): string => squash(tag.replace(/-/g, ' '));
const meetsTagRule = (rule: TagRule, tag: string): boolean =>
  rule.oneOf.some((one) => tagWords(one) === tag) || (rule.endsWith ?? []).some((ending) => tag.endsWith(` ${tagWords(ending)}`));

function classCountsOf(context: Context, field: string): Map<string, number> {
  let counts = context.classCounts.get(field);
  if (!counts) {
    counts = new Map<string, number>();
    for (const ci of context.cis) {
      const key = squash(text(ci, field));
      if (key && !isRetired(ci)) counts.set(`${ci.className}|${key}`, (counts.get(`${ci.className}|${key}`) ?? 0) + 1);
    }
    context.classCounts.set(field, counts);
  }
  return counts;
}

function numberAt(ci: Ci, field: string): number | undefined {
  const [kind, dimension] = field.split('.');
  const levels = kind === 'target' ? ci.target : kind === 'inherited' ? ci.inherited : undefined;
  return levels ? (levels as Record<string, number | undefined>)[dimension ?? ''] : undefined;
}

/** Returns why the condition holds for this CI, or '' when it does not. */
function test(condition: Condition, ci: Ci, each: string, context: Context): string {
  if ('all' in condition) {
    const reasons = condition.all.map((item) => test(item, ci, each, context));
    return reasons.every(Boolean) ? reasons.join('; ') : '';
  }
  if ('any' in condition) {
    return condition.any.map((item) => test(item, ci, each, context)).find(Boolean) ?? '';
  }
  const field = fill(condition.field ?? each, each);
  const value = typeof condition.value === 'string' ? fill(condition.value, each) : condition.value;
  const label = field.replace(/[_.]/g, ' ');

  switch (condition.op) {
    case 'isEmpty': {
      if (isRole(field)) {
        const person = ci.roles[field];
        return person && !person.name && !person.email ? `${label} is empty` : '';
      }
      return text(ci, field).trim() === '' ? `${label} is empty` : '';
    }
    case 'refInactive': {
      const person = isRole(field) ? ci.roles[field] : undefined;
      return person && (person.name || person.email) && person.active === false ? `${label} is an inactive user: ${person.name || person.email}` : '';
    }
    case 'shorterThan': {
      const current = text(ci, field).trim();
      return current && current.length < Number(value) ? `${label} has only ${current.length} characters` : '';
    }
    case 'equalsField': {
      const current = squash(text(ci, field));
      return current && current === squash(text(ci, String(value))) ? `${label} repeats the ${String(value)}` : '';
    }
    case 'matchesAny': {
      const current = text(ci, field).trim();
      const patterns = Array.isArray(value) ? value : [String(value)];
      return current && patterns.some((pattern) => new RegExp(pattern, 'i').test(current)) ? `${label} is a placeholder: "${current}"` : '';
    }
    case 'duplicatedMoreThan': {
      const count = countsOf(context, field).get(squash(text(ci, field))) ?? 0;
      return text(ci, field).trim() && count > Number(value) ? `the same ${label} is used on ${count} CIs` : '';
    }
    case 'duplicatedInClass': {
      if (isRetired(ci) || !text(ci, field).trim()) return '';
      const count = classCountsOf(context, field).get(`${ci.className}|${squash(text(ci, field))}`) ?? 0;
      return count > Number(value) ? `the same ${label} is used on ${count} live CIs of this class` : '';
    }
    case 'hasDoubleSpaces':
      return / {2,}/.test(text(ci, field)) ? `${label} has two or more spaces in a row` : '';
    case 'equals':
      return squash(text(ci, field)) === squash(String(value)) ? `${label} is ${text(ci, field)}` : '';
    case 'samePersonAs': {
      const other = String(value);
      const person = isRole(field) ? ci.roles[field] : undefined;
      return isRole(other) && samePerson(person, ci.roles[other])
        ? `${label} and ${other.replace(/_/g, ' ')} are the same person: ${person!.name || person!.email}` : '';
    }
    case 'tagMatchesAny': {
      const patterns = (Array.isArray(value) ? value : [String(value)]).map((pattern) => new RegExp(pattern, 'i'));
      const matching = ci.tags.filter((tag) => patterns.some((pattern) => pattern.test(tag)));
      return matching.length ? `tagged ${matching.join(', ')}` : '';
    }
    case 'levelsMissing': {
      const levels = field === 'target' ? ci.target : field === 'inherited' ? ci.inherited : {};
      const missing = DIMENSIONS.filter((dimension) => levels[dimension] === undefined);
      if (!missing.length) return '';
      return missing.length === DIMENSIONS.length ? `no ${label} criticality` : `no ${label} criticality for ${missing.join(', ')}`;
    }
    case 'greaterThanField':
    case 'lessThanField': {
      const left = numberAt(ci, field);
      const right = numberAt(ci, String(value));
      if (left === undefined || right === undefined) return '';
      const holds = condition.op === 'greaterThanField' ? left > right : left < right;
      // Criticality in the words of ServiceNow, never as a bare number.
      return holds ? `${label} is ${levelWords(left)}, ${String(value).replace('.', ' ')} is ${levelWords(right)}` : '';
    }
    case 'lacksValidEntryFor': {
      // Justifications are a list of "<Dimension> - <reason>". Auto-generated placeholders (`ignore`) do not count.
      const ignore = condition.ignore ? new RegExp(condition.ignore, 'i') : null;
      const entries = text(ci, field).split(/[,;\n]+/).map((entry) => entry.trim())
        .filter((entry) => entry.toLowerCase().startsWith(String(value).toLowerCase()));
      if (entries.some((entry) => !ignore || !ignore.test(entry))) return '';
      return entries.length ? `only an auto-generated justification for ${String(value)}` : `no justification for ${String(value)}`;
    }
    case 'onlyMatches':
    case 'notOnlyMatches': {
      // A list field ("Availability - Inherited value increased (Auto generated), …"): does it hold only entries that match `value`?
      const pattern = new RegExp(String(value), 'i');
      const entries = text(ci, field).split(/[,;\n]+/).map((entry) => entry.trim()).filter(Boolean);
      const only = entries.length > 0 && entries.every((entry) => pattern.test(entry));
      if (condition.op === 'onlyMatches') return only ? `${label} holds only the automatic text` : '';
      return only ? '' : entries.length ? `${label} holds a text of its own` : `${label} is empty`;
    }
    case 'groupInactive':
      return ci.supportGroup && ci.supportGroupActive === false ? `Support group ${ci.supportGroup} is not active` : '';
    case 'hasHiddenCharacters': {
      const found = ci.hiddenCharacters ?? [];
      return found.length ? `the name holds a hidden character: ${found.join(', ')}` : '';
    }
    case 'missingTags': {
      const byClass = context.references[condition.ref ?? ''] as Record<string, TagRule[]> | undefined;
      const tags = ci.tags.map(tagWords);
      const missing = (byClass?.[ci.className] ?? []).filter((rule) => !tags.some((tag) => meetsTagRule(rule, tag)));
      return missing.length ? `missing tag: ${missing.map((rule) => rule.label).join(', ')}` : '';
    }
    case 'tagsNotIn': {
      const allowed = ((context.references[condition.ref ?? ''] as string[] | undefined) ?? []).map(squash);
      const unknown = ci.tags.filter((tag) => !allowed.includes(squash(tag)));
      return unknown.length ? `tag not in the allowed list: ${unknown.join(', ')}` : '';
    }
    default:
      throw new Error(`Unknown operator "${condition.op}"`);
  }
}

/** The leaves of a condition whose test holds for this CI: the parts that made the finding. */
function holding(condition: Condition, ci: Ci, each: string, context: Context): Leaf[] {
  if ('all' in condition) return condition.all.reduce((all, item) => all.concat(holding(item, ci, each, context)), [] as Leaf[]);
  if ('any' in condition) return condition.any.reduce((all, item) => all.concat(holding(item, ci, each, context)), [] as Leaf[]);
  return test(condition, ci, each, context) ? [condition] : [];
}

const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * The line of the SACM fix list for a rule, from the first part that holds and says what to change: a hidden character in
 * the name (the name now, with "?" where the hidden character is), a name used twice or with two spaces (D184), a lowered
 * criticality value without its justification (D185), a Business Process that is Operational without CIA values (D186).
 * Another rule gives no line: the card shows its finding.
 */
function fixLineOf(condition: Condition, ci: Ci, each: string, context: Context): FixLine | undefined {
  for (const leaf of holding(condition, ci, each, context)) {
    if (leaf.op === 'hasHiddenCharacters') return { change: 'Remove the hidden character from the name', current: visibleName(ci.name), set: 'The same name without the hidden character', value: withoutHidden(ci.name) };
    if (leaf.op === 'duplicatedInClass') {
      return { change: 'Two records for one thing: retire one', current: ci.name, set: 'Retire the record that is not used (two real CIs: ask the owner)' };
    }
    if (leaf.op === 'hasDoubleSpaces') { const set = ci.name.replace(/ {2,}/g, ' '); return { change: 'Two spaces in a row in the name', current: ci.name, set, value: set }; }
    if (leaf.op === 'lacksValidEntryFor') {
      const dimension = capital(fill(String(leaf.value ?? each), each));
      return { change: `Add the justification for ${dimension}, from the request`, current: ci.exceptionJustification.trim() || '(empty)', set: `A justification for ${dimension}` };
    }
    if (leaf.op === 'levelsMissing') {
      return { change: `Status ${ci.operationalStatus} without CIA values: check the status, or add the tag BIA N/A or BIA is pending`, current: ci.operationalStatus || '(empty)', set: 'The right status, or the tag' };
    }
  }
  return undefined;
}

function referencesIn(condition: Condition): string[] {
  if ('all' in condition) return flatten(condition.all.map(referencesIn));
  if ('any' in condition) return flatten(condition.any.map(referencesIn));
  return condition.ref ? [condition.ref] : [];
}

/** A check whose `status` is "off": its file stays, but it does not run and has no card (it comes back with one word). */
export const isSwitchedOff = (pack: Pick<CheckPack, 'status'>): boolean => pack.status === 'off';

/** The checks that run and have a card: every check that is not switched off. */
export const checksInUse = <T extends Pick<CheckPack, 'status'>>(packs: T[]): T[] => packs.filter((pack) => !isSwitchedOff(pack));

/**
 * Runs the check packs on the CIs of one report. A check that is switched off is not run. `inputs` names what was loaded with it (see EngineInputs in
 * ./detectors/index.ts: the date, the Relationship report, the EPO systems report, the contract files); a check that needs
 * one that is missing is not tested and says so. Contract findings are about contracts, handed back in `subjects`.
 */
export function runChecks(cis: Ci[], columns: Set<string>, packs: CheckPack[], references: References = {}, inputs: EngineInputs = {}): RunResult {
  const context: Context = { counts: new Map(), classCounts: new Map(), cis, references };
  const result: RunResult = { findings: [], tested: [], evaluated: {}, notes: [] };
  // Parked CIs (D179) stay in the report, so relationships to them count, but no check tests them and no finding is about them.
  const parked = parkedOf(cis, references);
  const parkedKeys = new Set(parked?.keys ?? []);
  const checkable = parkedKeys.size ? cis.filter((ci) => !parkedKeys.has(ci.key)) : cis;
  const date = inputs.date ?? '';
  const kept = new Map<string, unknown>();
  const once = <T>(key: string, make: () => T): T => {
    if (!kept.has(key)) kept.set(key, make());
    return kept.get(key) as T;
  };

  for (const pack of checksInUse(packs)) {
    const when = pack.detector.when;
    if (pack.detector.type === 'code') {
      const excludedCode = (pack.scope.exclude?.operational_status ?? []).map(squash);
      const scoped = checkable.filter((ci) =>
        (pack.scope.classes.includes('*') || pack.scope.classes.includes(ci.className)) && !excludedCode.includes(squash(ci.operationalStatus)));
      const run: DetectorRun = { cis, inScope: scoped, columns, references, inputs, date, once };
      const out = familyOf(pack.detector.module ?? '').run(pack, run);
      result.findings.push(...out.findings);
      result.tested.push(...out.tested);
      Object.assign(result.evaluated, out.evaluated);
      result.notes.push(...out.notes);
      for (const subject of out.subjects ?? []) {
        if (!(result.subjects ??= []).some((known) => known.key === subject.key)) result.subjects.push(subject);
      }
      continue;
    }
    // "manual": the findings come from what managers mark (the lifecycle review), not from the report. See src/core/audit/lifecycle-review.ts.
    if (pack.detector.type === 'manual') continue;
    if (pack.detector.type !== 'rule' || !when) {
      result.notes.push({ checkId: pack.id, note: `Skipped: detector type "${pack.detector.type}" is not available yet.` });
      continue;
    }
    const missingReferences = referencesIn(when).filter((name) => references[name] === undefined);
    if (missingReferences.length) {
      result.notes.push({ checkId: pack.id, note: `Skipped: reference data missing (${missingReferences.join(', ')}).` });
      continue;
    }
    const excluded = (pack.scope.exclude?.operational_status ?? []).map(squash);
    const inScope = checkable.filter((ci) =>
      (pack.scope.classes.includes('*') || pack.scope.classes.includes(ci.className)) && !excluded.includes(squash(ci.operationalStatus)));

    for (const each of pack.detector.forEach ?? ['']) {
      const absent = Array.from(new Set(requiredColumns(when, each))).filter((column) => !columns.has(column));
      if (absent.length) {
        const hints = absent.filter((column) => COLUMN_HINT[column]).map((column) => COLUMN_HINT[column]!);
        const plain = absent.filter((column) => !COLUMN_HINT[column]);
        result.notes.push({ checkId: pack.id, note: `Not tested${each ? ` for ${columnWord(each)}` : ''}: ${hints.concat(plain.length ? [missingColumns(plain)] : []).join('; ')}.` });
        continue;
      }
      const classes = pack.detector.forEachClasses?.[each];
      const field = each || ('field' in when && when.field ? when.field : pack.family);
      result.tested.push(`${pack.id}:${field}`);
      let evaluated = 0;
      for (const ci of inScope) {
        if (classes && !classes.includes(ci.className)) continue;
        evaluated += 1;
        const detail = test(when, ci, each, context);
        if (!detail) continue;
        // A rule SACM fixes itself (path "sacm-fix") gives the line of the fix list too.
        const fix = pack.playbook.path === 'sacm-fix' ? fixLineOf(when, ci, each, context) : undefined;
        result.findings.push({
          key: `${pack.id}:${ci.key}:${field}`, checkId: pack.id, ciKey: ci.key, ciName: ci.name,
          className: ci.className, field, severity: pack.severity, detail, ...(fix ? { fix } : {})
        });
      }
      result.evaluated[`${pack.id}:${field}`] = evaluated;
    }
  }
  // The source first (D190): the people lines of a CI from EPO are compared with the EPO systems report before anybody is asked.
  const after = afterChecks(result.findings, { cis, inScope: checkable, columns, references, inputs, date, once }, checksInUse(packs));
  result.findings = after.findings;
  result.notes.push(...after.notes);
  if (!parked) result.notes.push({ checkId: 'PARKED', note: PARKED_MISSING });
  else {
    // A detector that reads every CI (the relationship cards) may still name a parked one: it is left out here.
    result.findings = result.findings.filter((finding) => !isParked(finding, { keys: [], fields: parked.fields }) && !parkedKeys.has(finding.ciKey));
    result.parked = parked;
  }
  return result;
}

/** What changed between two runs: the basis for opening, keeping and auto-verifying cases. */
export function compareRuns(previous: Finding[], current: Finding[]): { opened: Finding[]; still: Finding[]; resolved: Finding[] } {
  const before = new Set(previous.map((finding) => finding.key));
  const now = new Set(current.map((finding) => finding.key));
  return {
    opened: current.filter((finding) => !before.has(finding.key)),
    still: current.filter((finding) => before.has(finding.key)),
    resolved: previous.filter((finding) => !now.has(finding.key))
  };
}
