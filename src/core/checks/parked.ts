import { nameKey } from '../shared/names.ts';
import type { Ci, Finding, Parked, References } from '../model/model.ts';

/**
 * Parked classes (reference/parked-classes, D179): CIs of a class that is not checked yet, such as a Business Capability in
 * Ready, or the classes that are not used yet. They give no line on any card, are not counted as tested, and the first
 * screen says how many there are, one grey line per rule, so nothing is hidden silently. Pure: same report, same lines.
 */

/** One rule of reference/parked-classes. `statuses` empty or missing: every status. A Retired CI is never counted. */
export interface ParkRule {
  id: string;
  classes: string[];
  statuses?: string[];
  /** The grey line: `one` for 1 CI, `many` with {n} for more, `none` when the report holds none ('' or missing: no line). */
  one: string;
  many: string;
  none?: string;
  /** Parts of checks ("REL-MISSING:bp-business-capability") that are parked with the rule, on any CI. */
  fields?: string[];
}

const PARKED_REF = 'reference/parked-classes';

const rulesOf = (references: References): ParkRule[] => ((references[PARKED_REF] as { rules?: ParkRule[] } | undefined)?.rules) ?? [];
const same = (a: string, b: string): boolean => nameKey(a) === nameKey(b);
const retired = (ci: Ci): boolean => same(ci.operationalStatus, 'Retired');

/** Is this CI parked by this rule? */
const parkedBy = (rule: ParkRule, ci: Ci): boolean =>
  rule.classes.indexOf(ci.className) >= 0 && !retired(ci) && (!rule.statuses?.length || rule.statuses.some((status) => same(status, ci.operationalStatus)));

/** The parked CIs of a report and their grey lines. Null when the reference file is missing (nothing is parked: the run says so). */
export function parkedOf(cis: Ci[], references: References): Parked | null {
  if (references[PARKED_REF] === undefined) return null;
  const keys: string[] = [];
  const fields: string[] = [];
  const lines: string[] = [];
  for (const rule of rulesOf(references)) {
    const found = cis.filter((ci) => parkedBy(rule, ci));
    for (const ci of found) if (keys.indexOf(ci.key) < 0) keys.push(ci.key);
    for (const field of rule.fields ?? []) if (fields.indexOf(field) < 0) fields.push(field);
    const line = found.length === 0 ? rule.none ?? '' : found.length === 1 ? rule.one : rule.many.split('{n}').join(found.length.toLocaleString('en-GB'));
    if (line) lines.push(line);
  }
  return { keys, fields, lines };
}

/** True when a finding is about a parked CI, or is a parked part of a check. */
export function isParked(finding: Pick<Finding, 'checkId' | 'ciKey' | 'field'>, parked: Pick<Parked, 'keys' | 'fields'> | null | undefined): boolean {
  if (!parked) return false;
  return parked.keys.indexOf(finding.ciKey) >= 0 || parked.fields.indexOf(`${finding.checkId}:${finding.field}`) >= 0;
}

/** The note of a run without the reference file: never silent. */
export const PARKED_MISSING = 'Parked classes: reference data missing (reference/parked-classes), so every class is checked.';
