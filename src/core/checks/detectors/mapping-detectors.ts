import { DIMENSIONS } from '../../model/model.ts';
import { nameKey } from '../../shared/names.ts';
import { missingColumns } from '../../shared/text.ts';
import { emptyOutput as empty } from './output.ts';
import { MODEL_REF, partners } from './relationship-detectors.ts';
import type { CheckPack, Ci, References } from '../../model/model.ts';
import type { DetectorOutput as Output } from './output.ts';
import type { Graph, RelationshipModel } from './relationship-detectors.ts';

/**
 * The mapping backlog (D200), a detector of type "code". Pure. One line per CI that must be mapped, with every reason: a
 * rule of the relationship model that is not met (a Service Instance without a Business Application, a Business Service or
 * Application without a Business Process, a Business Process with nothing below), or a tag that says its future is decided
 * in the mapping session. The rules and words are data in reference/mapping-backlog.
 */

export const MAPPING_BACKLOG = 'mapping/backlog';
export const MAPPING_REF = 'reference/mapping-backlog';

/** The part of reference/mapping-backlog the detector reads. */
export interface MappingRules {
  rules: string[];
  readyStatus: string;
  tagged?: { id: string; classes: string[]; tags: string[]; status: string; say: string };
}

const hasCia = (ci: Ci): boolean => DIMENSIONS.some((dimension) => ci.target[dimension] !== undefined);

/** One line per CI to map. The field is always "mapping"; `mapping` holds the ids of the reasons, `detail` their words. */
export function mappingBacklog(pack: CheckPack, inScope: Ci[], columns: Set<string>, references: References, graph: () => Graph | null): Output {
  const out = empty();
  const ref = pack.detector.ref ?? MAPPING_REF;
  const config = references[ref] as MappingRules | undefined;
  const model = references[MODEL_REF] as RelationshipModel | undefined;
  if (!config || !Array.isArray(config.rules)) { out.notes.push({ checkId: pack.id, note: `Skipped: reference data missing (${ref}).` }); return out; }
  if (!model || !Array.isArray(model.expectations)) { out.notes.push({ checkId: pack.id, note: `Skipped: reference data missing (${MODEL_REF}).` }); return out; }
  if (!columns.has('operationalStatus')) { out.notes.push({ checkId: pack.id, note: `Not tested: ${missingColumns(['operationalStatus'])}.` }); return out; }
  const built = graph();
  if (!built) { out.notes.push({ checkId: pack.id, note: 'Not tested: no Relationship report. Load the Relationship report with the CI report.' }); return out; }
  const rules = model.expectations.filter((rule) => config.rules.indexOf(rule.id) >= 0 && rule.min !== undefined);
  const tagged = config.tagged;
  const patterns = (tagged?.tags ?? []).map((tag) => new RegExp(tag, 'i'));
  out.tested.push(`${pack.id}:mapping`);
  let evaluated = 0;
  for (const ci of inScope) {
    const node = built.byCi.get(ci.key);
    if (!node) continue;
    evaluated += 1;
    const ready = nameKey(ci.operationalStatus) === nameKey(config.readyStatus);
    // A Business Process in Ready without CIA values waits for the BIA: nobody maps it yet (D197).
    if (ready && ci.className === 'business_process' && !hasCia(ci)) continue;
    const ids: string[] = [];
    const words: string[] = [];
    for (const rule of rules) {
      if (rule.classes.indexOf(node.cls) < 0) continue;
      if (partners(built, node, rule.direction, rule.related).length >= rule.min!) continue;
      if (rule.parentField && columns.has('parentService') && (ci.parentService ?? '').trim()) continue;
      ids.push(rule.id);
      words.push(rule.title.replace('Service Instance', node.cls === 'platform' ? 'Platform' : 'Service Instance'));
    }
    if (tagged && tagged.classes.indexOf(ci.className) >= 0 && nameKey(ci.operationalStatus) === nameKey(tagged.status)
      && ci.tags.some((tag) => patterns.some((pattern) => pattern.test(tag)))) {
      ids.push(tagged.id);
      words.push(tagged.say);
    }
    if (!ids.length) continue;
    // A CI in Ready is not live yet, so its mapping waits; a process in Ready with CIA values is the one to map now (D197).
    const waits = ready && ci.className !== 'business_process';
    out.findings.push({
      key: `${pack.id}:${ci.key}:mapping`, checkId: pack.id, ciKey: ci.key, ciName: ci.name, className: ci.className, field: 'mapping',
      severity: pack.severity, detail: words.join('; '), mapping: ids, inServiceNow: true, ...(waits ? { wait: `Status ${ci.operationalStatus}: not live yet` } : {})
    });
  }
  out.evaluated[`${pack.id}:mapping`] = evaluated;
  return out;
}
