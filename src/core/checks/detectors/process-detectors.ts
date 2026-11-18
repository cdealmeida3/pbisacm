import { DIMENSIONS } from '../../model/model.ts';
import { nameKey } from '../../shared/names.ts';
import { missingColumns } from '../../shared/text.ts';
import { emptyOutput as empty } from './output.ts';
import type { CheckPack, Ci, Finding, FixLine, References } from '../../model/model.ts';
import type { DetectorOutput as Output } from './output.ts';
import type { Graph, Node } from './relationship-detectors.ts';

/**
 * The stages of a Business Process in Ready (D197), a detector of type "code". Pure. A process waits for the BIA (no CIA
 * value yet: no line, a note says how many), is to map (CIA values, nothing live linked below: a case of the mapping
 * backlog, D200, and a note here), or is mapped (CIA values and something linked below: SACM makes it Operational). The words and
 * classes are data in reference/lifecycle (`processStages`); the relationships come from the Relationship report.
 */

interface StageLine { say: string; change: string; current: string; set: string }

/** reference/lifecycle, `processStages`. */
export interface ProcessStages {
  status: string;
  /** The classes linked below that make a process mapped. */
  below: string[];
  waits: { one: string; many: string };
  /** To map: no line here, the process is a case of the mapping backlog (D200); the note says how many. */
  toMap: { one: string; many: string };
  mapped: StageLine;
}

export const PROCESS_STAGE = 'process/stage';

const stagesOf = (references: References, ref: string): ProcessStages | undefined =>
  (references[ref] as { processStages?: ProcessStages } | undefined)?.processStages;

const finding = (pack: CheckPack, ci: Ci, field: string, detail: string, fix: FixLine): Finding => ({
  key: `${pack.id}:${ci.key}:${field}`, checkId: pack.id, ciKey: ci.key, ciName: ci.name, className: ci.className, field, severity: pack.severity, detail, fix
});

/** The live CIs linked below a node, of some classes, by name. */
function below(graph: Graph, node: Node, classes: string[]): string[] {
  const names = new Set<string>();
  for (const edge of graph.down.get(node) ?? []) if (classes.indexOf(edge.child.cls) >= 0) names.add(edge.child.name);
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/** The stage line of each Business Process in Ready of the pack's scope. `graph` is built only when it is needed. */
export function processStage(pack: CheckPack, inScope: Ci[], columns: Set<string>, references: References, graph: () => Graph | null): Output {
  const out = empty();
  const ref = pack.detector.ref ?? 'reference/lifecycle';
  const stages = stagesOf(references, ref);
  if (!stages) { out.notes.push({ checkId: pack.id, note: `Skipped: reference data missing (${ref}, processStages).` }); return out; }
  const target = DIMENSIONS.map((dimension) => `target.${dimension}`);
  if (!target.some((column) => columns.has(column))) { out.notes.push({ checkId: pack.id, note: `Not tested: ${missingColumns(target)}.` }); return out; }
  if (!columns.has('operationalStatus')) { out.notes.push({ checkId: pack.id, note: `Not tested: ${missingColumns(['operationalStatus'])}.` }); return out; }
  const built = graph();
  if (!built) { out.notes.push({ checkId: pack.id, note: 'Not tested: no Relationship report. Load the Relationship report with the CI report.' }); return out; }
  out.tested.push(pack.id);
  let evaluated = 0;
  let waiting = 0;
  let toMap = 0;
  for (const ci of inScope) {
    if (nameKey(ci.operationalStatus) !== nameKey(stages.status)) continue;
    evaluated += 1;
    // No CIA value yet: the process waits for the BIA. SACM does not chase it (no line).
    if (!DIMENSIONS.some((dimension) => ci.target[dimension] !== undefined)) { waiting += 1; continue; }
    const node = built.byCi.get(ci.key);
    const linked = node ? below(built, node, stages.below) : [];
    // Nothing linked below: the process is to map, a case of the mapping backlog (D200), not a line here.
    if (!linked.length) { toMap += 1; continue; }
    const line = stages.mapped;
    const words = (text: string): string => text.split('{below}').join(linked.join(', '));
    out.findings.push(finding(pack, ci, 'mapped', words(line.say), { change: line.change, current: words(line.current), set: line.set }));
  }
  out.evaluated[pack.id] = evaluated;
  if (waiting) out.notes.push({ checkId: pack.id, note: waiting === 1 ? stages.waits.one : stages.waits.many.split('{n}').join(String(waiting)) });
  if (toMap) out.notes.push({ checkId: pack.id, note: toMap === 1 ? stages.toMap.one : stages.toMap.many.split('{n}').join(String(toMap)) });
  return out;
}

