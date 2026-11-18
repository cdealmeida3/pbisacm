import { plural } from '../../shared/text.ts';
import { daysBetween, longDate } from '../../shared/dates.ts';
import { EPO_REF, epoConfig } from '../../sources/epo/epo-report.ts';
import type { Comparison, EpoConfig, EpoInput, EpoSystem, Pair } from '../../sources/epo/epo-report.ts';
import type { CheckPack, Ci, Finding, FixLine, References } from '../../model/model.ts';
import { emptyOutput as empty } from './output.ts';
import type { DetectorOutput as Output } from './output.ts';

/**
 * The EPO checks: the EPO systems report compared with the CI report (see src/core/sources/epo/epo-report.ts for how
 * the report is read and matched). Pure. "EPO ≠ ServiceNow" is a SACM fix list (service mapped CIs), "EPO update not
 * arrived" a review list (the others). Both compare the description too (D136). A leftover (a role empty in EPO, a person
 * still in ServiceNow) is on neither: the owner fills the role in EPO (D190). Nothing here sends or changes anything.
 */


/* ------------------------------------------------------------------ detectors */

interface Input { pack: CheckPack; cis: Ci[]; columns: Set<string>; config: EpoConfig; epo: EpoInput; date: string; comparison: Comparison }
type EpoDetector = (input: Input) => Output;


function finding(pack: CheckPack, ci: Ci, field: string, detail: string, extra: Pick<Finding, 'fix' | 'chips' | 'wait'> = {}): Finding {
  return {
    key: `${pack.id}:${ci.key}:${field}`, checkId: pack.id, ciKey: ci.key, ciName: ci.name, className: ci.className, field, severity: pack.severity, detail,
    ...(extra.fix ? { fix: extra.fix } : {}), ...(extra.chips && extra.chips.length ? { chips: extra.chips } : {}), ...(extra.wait ? { wait: extra.wait } : {})
  };
}

/** The chip of a system that changed in EPO after the EPO report loaded before this one. */
export const CHANGED_CHIP = 'changed in EPO';
const changedSince = (system: EpoSystem, epo: EpoInput): boolean => !!epo.previousDate && !!system.changed && system.changed > epo.previousDate;
const changedWords = (system: EpoSystem): string => (system.changed ? ` (last change in EPO: ${longDate(system.changed)})` : '');
const fields = (config: EpoConfig): string[] => ['status', 'name'].concat(config.roles.map((entry) => entry.role), ['description']);

/** Not tested at all without the flag: it decides which of the two cards a difference belongs to. */
function needsFlag(pack: CheckPack, columns: Set<string>): Output | null {
  if (columns.has('serviceMapped')) return null;
  const out = empty();
  out.notes.push({ checkId: pack.id, note: 'Not tested: the CI report has no "service mapped" column (ref_cmdb_ci_service.u_service_mapped). It decides whether SACM or the sync brings the EPO value.' });
  return out;
}

function testedFields(pack: CheckPack, out: Output, input: Input, pairs: Pair[]): void {
  for (const field of fields(input.config)) {
    if (field === 'description' ? !input.columns.has('description') : field !== 'status' && field !== 'name' && !input.columns.has(`${field}.userId`)) continue;
    out.tested.push(`${pack.id}:${field}`);
    out.evaluated[`${pack.id}:${field}`] = pairs.length;
  }
  for (const note of input.comparison.notes) out.notes.push({ checkId: pack.id, note });
}

/** EPO ≠ ServiceNow: a service mapped CI differs from EPO. SACM copies the EPO value into ServiceNow (fix list). */
const differs: EpoDetector = (input) => {
  const { pack, epo, comparison } = input;
  const flag = needsFlag(pack, input.columns);
  if (flag) return flag;
  const out = empty();
  const pairs = comparison.pairs.filter((pair) => pair.mapped === true);
  testedFields(pack, out, input, pairs);
  for (const pair of pairs) {
    for (const difference of pair.differences) {
      if (difference.leftover) continue;
      const fix: FixLine = { change: difference.label, current: difference.current, set: `${difference.epo}, from EPO`, ...(difference.value ? { value: difference.value } : {}) };
      out.findings.push(finding(pack, pair.ci, difference.field,
        `${difference.label} is ${difference.current} in ServiceNow, EPO has ${difference.epo}${changedWords(pair.system)}`,
        { fix, chips: changedSince(pair.system, epo) ? [CHANGED_CHIP] : [] }));
    }
  }
  if (!epo.previousDate) out.notes.push({ checkId: pack.id, note: `The chip "${CHANGED_CHIP}" needs an earlier EPO systems report: this is the first one loaded.` });
  return out;
};

/** EPO update not arrived: a CI that is not service mapped differs from EPO, so the sync did not bring the change. A review list. */
const notArrived: EpoDetector = (input) => {
  const { pack, epo, comparison, date } = input;
  const flag = needsFlag(pack, input.columns);
  if (flag) return flag;
  const out = empty();
  const pairs = comparison.pairs.filter((pair) => pair.mapped === false);
  testedFields(pack, out, input, pairs);
  for (const pair of pairs) {
    const age = pair.system.changed && date ? daysBetween(pair.system.changed, date) : NaN;
    const young = Number.isFinite(age) && age < input.config.waitDays;
    for (const difference of pair.differences) {
      if (difference.leftover) continue;
      out.findings.push(finding(pack, pair.ci, difference.field,
        `${difference.label} is ${difference.current} in ServiceNow, EPO has ${difference.epo}${changedWords(pair.system)}`,
        { chips: changedSince(pair.system, epo) ? [CHANGED_CHIP] : [], ...(young ? { wait: `Changed in EPO ${age <= 0 ? 'on the day of the report' : `${age} day${age === 1 ? '' : 's'} before the report`}: the sync may still bring it` } : {}) }));
    }
  }
  if (comparison.withoutCi.length) {
    const shown = comparison.withoutCi.slice(0, 10).map((system) => `${system.name} (${system.epoId})`).join(', ');
    out.notes.push({ checkId: pack.id, note: `${plural(comparison.withoutCi.length, 'EPO system')} that ${comparison.withoutCi.length === 1 ? 'is not Retired has no Service Instance with its' : 'are not Retired have no Service Instance with their'} EPO ID: ${shown}${comparison.withoutCi.length > 10 ? ', …' : ''}.` });
  }
  return out;
};

export const EPO_DETECTORS: Record<string, EpoDetector> = {
  'epo/differs': differs,
  'epo/not-arrived': notArrived
};

/**
 * Runs one EPO detector. Without an EPO systems report, or without its reference data, the check is not tested and says so.
 * `compare` is the comparison of the run (worked out once for the two cards).
 */
export function runEpoDetector(pack: CheckPack, cis: Ci[], columns: Set<string>, references: References, epo: EpoInput | null | undefined, date: string, compare: (config: EpoConfig, epo: EpoInput) => Comparison): Output {
  const out = empty();
  const config = epoConfig(references);
  if (!config) { out.notes.push({ checkId: pack.id, note: `Skipped: reference data missing (${EPO_REF}).` }); return out; }
  if (!epo) { out.notes.push({ checkId: pack.id, note: 'Not tested: no EPO systems report. Load the EPO systems report with the CI report.' }); return out; }
  if (!columns.has('assetTag')) { out.notes.push({ checkId: pack.id, note: 'Not tested: the CI report has no column for the EPO ID (asset_tag).' }); return out; }
  return EPO_DETECTORS[pack.detector.module ?? '']!({ pack, cis, columns, config, epo, date, comparison: compare(config, epo) });
}
