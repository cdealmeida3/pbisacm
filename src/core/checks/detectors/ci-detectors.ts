import { daysBetween, longDate } from '../../shared/dates.ts';
import { nameKey } from '../../shared/names.ts';
import type { CheckPack, Ci, Finding, FixLine, References } from '../../model/model.ts';
import { emptyOutput as empty } from './output.ts';
import type { DetectorOutput as Output } from './output.ts';

/**
 * The detectors of type "code" that read only the CI report: name rules, EPO ID and how long a CI sits in a
 * status. Pure. The rules are data (checks/reference/name-rules, epo-id, lifecycle); this file only knows how to apply them.
 */

export interface CiInput { pack: CheckPack; cis: Ci[]; inScope: Ci[]; columns: Set<string>; reference: unknown; /** Date of the report (yyyy-mm-dd), '' when not known. */ date: string }
type CiDetector = (input: CiInput) => Output;

const applies = (classes: string[] | undefined, ci: Ci): boolean => !classes || classes.indexOf('*') >= 0 || classes.indexOf(ci.className) >= 0;
const chosen = <T extends { id: string }>(pack: CheckPack, rules: T[]): T[] =>
  pack.detector.rules ? rules.filter((rule) => pack.detector.rules!.indexOf(rule.id) >= 0) : rules;

function finding(pack: CheckPack, ci: Ci, field: string, detail: string, extra: { review?: string; fix?: FixLine } = {}): Finding {
  return {
    key: `${pack.id}:${ci.key}:${field}`, checkId: pack.id, ciKey: ci.key, ciName: ci.name, className: ci.className, field, severity: pack.severity, detail,
    ...(extra.review ? { review: extra.review } : {}), ...(extra.fix ? { fix: extra.fix } : {})
  };
}

/* ------------------------------------------------------------------ names */

/** One rule of reference/name-rules. Patterns are regular expressions; upper and lower case count. */
export interface NameRule {
  id: string;
  classes?: string[];
  /** Only names that match this are tested (an API offering: a name that starts with "API"). */
  when?: string;
  /** The name must match this. */
  pattern?: string;
  /** True: the name must not have a space at its start or its end. */
  noOuterSpaces?: boolean;
  /** What is wrong, in words. */
  say: string;
  /** For the SACM fix list: what to set. */
  set?: string;
}
export interface NameRules { rules: NameRule[] }

/** Name not standard: a name rule of the CI's class is broken. */
const nameStandard: CiDetector = ({ pack, inScope, reference }) => {
  const out = empty();
  for (const rule of chosen(pack, (reference as NameRules).rules ?? [])) {
    const when = rule.when ? new RegExp(rule.when) : null;
    const pattern = rule.pattern ? new RegExp(rule.pattern) : null;
    out.tested.push(`${pack.id}:${rule.id}`);
    let evaluated = 0;
    for (const ci of inScope) {
      if (!applies(rule.classes, ci) || (when && !when.test(ci.name))) continue;
      evaluated += 1;
      const broken = (pattern && !pattern.test(ci.name)) || (rule.noOuterSpaces === true && ci.nameSpaces === true);
      if (!broken) continue;
      out.findings.push(finding(pack, ci, rule.id, rule.say, rule.set ? { fix: { change: `Name of ${ci.name}`, current: rule.say, set: rule.set } } : {}));
    }
    out.evaluated[`${pack.id}:${rule.id}`] = evaluated;
  }
  return out;
};

/* ------------------------------------------------------------------ EPO ID */

/** reference/epo-id. The EPO ID is the asset tag. */
export interface EpoIdRules {
  /** Classes that must have an EPO ID: a missing one is to solve. */
  required?: string[];
  /** Classes where a missing EPO ID is listed for a review. */
  reviewWhenMissing?: string[];
  reviewWhy?: string;
  /** CIs that need no EPO ID (an API offering is created by a request in ServiceNow). */
  notNeeded?: Array<{ classes: string[]; name: string; why?: string }>;
  /** The EPO ID of a Service Offering starts with the number of its Business Service (the Parent field). `number`: how to read the number. */
  offeringNumber?: { classes: string[]; number: string; why: string };
  /** Two live CIs must not share an EPO ID. */
  unique?: boolean;
}

const epoId: CiDetector = ({ pack, cis, inScope, columns, reference }) => {
  const out = empty();
  const rules = reference as EpoIdRules;
  if (!columns.has('assetTag')) { out.notes.push({ checkId: pack.id, note: 'Not tested: the report has no column for the EPO ID (asset_tag).' }); return out; }
  const exempt = (ci: Ci): boolean => (rules.notNeeded ?? []).some((rule) => applies(rule.classes, ci) && new RegExp(rule.name).test(ci.name));

  out.tested.push(`${pack.id}:missing`);
  let evaluated = 0;
  for (const ci of inScope) {
    const required = (rules.required ?? []).indexOf(ci.className) >= 0;
    const review = (rules.reviewWhenMissing ?? []).indexOf(ci.className) >= 0;
    if ((!required && !review) || exempt(ci)) continue;
    evaluated += 1;
    if (ci.assetTag) continue;
    out.findings.push(finding(pack, ci, 'missing', 'No EPO ID', required ? {} : { review: rules.reviewWhy || 'Review only' }));
  }
  out.evaluated[`${pack.id}:missing`] = evaluated;

  const numberRule = rules.offeringNumber;
  if (numberRule) {
    if (!columns.has('parentService')) out.notes.push({ checkId: pack.id, note: 'Not tested for the number of the Business Service: the report has no Parent column (ref_cmdb_ci_service.parent).' });
    else {
      const number = (tag: string): string => new RegExp(numberRule.number).exec(tag)?.[1] ?? '';
      const services = new Map<string, Ci>();
      for (const ci of cis) if (ci.className === 'business_service' && !services.has(nameKey(ci.name))) services.set(nameKey(ci.name), ci);
      out.tested.push(`${pack.id}:number`);
      let compared = 0;
      for (const ci of inScope) {
        if (!applies(numberRule.classes, ci) || !ci.assetTag || !(ci.parentService ?? '').trim()) continue;
        const service = services.get(nameKey(ci.parentService!));
        if (!service || !number(service.assetTag)) continue;
        compared += 1;
        if (number(ci.assetTag) === number(service.assetTag)) continue;
        out.findings.push(finding(pack, ci, 'number', `EPO ID ${ci.assetTag} does not start with ${number(service.assetTag)}, the number of its Business Service ${service.name}`, { review: numberRule.why }));
      }
      out.evaluated[`${pack.id}:number`] = compared;
    }
  }

  if (rules.unique) {
    const byTag = new Map<string, Ci[]>();
    for (const ci of inScope) if (ci.assetTag) byTag.set(ci.assetTag.toLowerCase(), (byTag.get(ci.assetTag.toLowerCase()) ?? []).concat([ci]));
    out.tested.push(`${pack.id}:duplicate`);
    out.evaluated[`${pack.id}:duplicate`] = inScope.filter((ci) => ci.assetTag).length;
    byTag.forEach((list) => {
      if (list.length < 2) return;
      for (const ci of list) {
        const others = list.filter((other) => other !== ci).map((other) => other.name).sort((a, b) => a.localeCompare(b));
        out.findings.push(finding(pack, ci, 'duplicate', `EPO ID ${ci.assetTag} is also on ${others.join(', ')}`));
      }
    });
  }
  return out;
};

/* ------------------------------------------------------------------ status age */

/** One rule of reference/lifecycle: a CI sits in a status for more than `days` days. */
export interface StatusAgeRule {
  id: string;
  status: string;
  /** The date the days are counted from: when the record was created, or last changed. */
  from: 'created' | 'updated';
  days: number;
  /** The team setting that replaces `days` (see withTeamDays). */
  setting?: string;
  /** "{status}", "{days}" (the limit), "{date}" and "{age}" are filled in. */
  say: string;
  /** The line of the fix list, for a check SACM fixes itself (path "sacm-fix"): what to change and the value to set. */
  fix?: { change: string; set: string };
}
export interface LifecycleRules { rules: StatusAgeRule[] }

const DATE_COLUMN = { created: 'createdOn', updated: 'updatedOn' } as const;
const DATE_WORD = { created: 'Created (sys_created_on)', updated: 'Updated (sys_updated_on)' } as const;

const statusAge: CiDetector = ({ pack, inScope, columns, reference, date }) => {
  const out = empty();
  for (const rule of chosen(pack, (reference as LifecycleRules).rules ?? [])) {
    if (!columns.has('operationalStatus') || !columns.has(DATE_COLUMN[rule.from])) {
      out.notes.push({ checkId: pack.id, note: `Not tested: the report has no column for ${!columns.has('operationalStatus') ? 'Operational status' : DATE_WORD[rule.from]}.` });
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { out.notes.push({ checkId: pack.id, note: 'Not tested: the date of the report is not known.' }); continue; }
    out.tested.push(`${pack.id}:${rule.id}`);
    let evaluated = 0; let unread = 0;
    for (const ci of inScope) {
      // Every CI of the scope is tested: one in another status passes. Only a CI in the status without a date is not.
      if (nameKey(ci.operationalStatus) !== nameKey(rule.status)) { evaluated += 1; continue; }
      const since = (rule.from === 'created' ? ci.createdOn : ci.updatedOn) ?? '';
      if (!since) { unread += 1; continue; }
      evaluated += 1;
      const age = daysBetween(since, date);
      if (!(age > rule.days)) continue;
      const detail = rule.say.split('{status}').join(ci.operationalStatus).split('{days}').join(String(rule.days)).split('{date}').join(longDate(since)).split('{age}').join(String(age));
      const fix = pack.playbook.path === 'sacm-fix' && rule.fix ? { change: rule.fix.change, current: `${ci.operationalStatus} since ${longDate(since)}`, set: rule.fix.set } : undefined;
      out.findings.push(finding(pack, ci, rule.id, detail, fix ? { fix } : {}));
    }
    out.evaluated[`${pack.id}:${rule.id}`] = evaluated;
    if (unread) out.notes.push({ checkId: pack.id, note: `Partly tested: ${unread} CIs in status ${rule.status} have no date the tool can read.` });
  }
  return out;
};

export const CI_DETECTORS: Record<string, CiDetector> = {
  'ci/name-standard': nameStandard,
  'ci/epo-id': epoId,
  'ci/status-age': statusAge
};

/** Runs one CI detector. Never silent: missing reference data gives a note. */
export function runCiDetector(pack: CheckPack, cis: Ci[], inScope: Ci[], columns: Set<string>, references: References, date: string): Output {
  const out = empty();
  const ref = pack.detector.ref ?? '';
  const reference = references[ref];
  if (reference === undefined || reference === null) { out.notes.push({ checkId: pack.id, note: `Skipped: reference data missing (${ref}).` }); return out; }
  return CI_DETECTORS[pack.detector.module ?? '']!({ pack, cis, inScope, columns, reference, date });
}

/**
 * The number of days of each status rule is a team setting: `days` in reference/lifecycle is only the value proposed.
 * Returns the references with the team's numbers filled in (a new object; nothing is changed in place).
 */
export function withTeamDays(references: References, settings: Record<string, unknown>, ref = 'reference/lifecycle'): References {
  const lifecycle = references[ref] as (LifecycleRules & Record<string, unknown>) | undefined;
  if (!lifecycle || !Array.isArray(lifecycle.rules)) return references;
  const rules = lifecycle.rules.map((rule) => {
    const days = rule.setting ? Number(settings[rule.setting]) : NaN;
    return Number.isFinite(days) && days > 0 ? { ...rule, days: Math.round(days) } : rule;
  });
  return { ...references, [ref]: { ...lifecycle, rules } };
}
