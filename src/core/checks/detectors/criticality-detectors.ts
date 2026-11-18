import { DIMENSIONS, levelWords } from '../../model/model.ts';
import { daysBetween } from '../../shared/dates.ts';
import { missingColumns } from '../../shared/text.ts';
import type { CheckPack, Ci, Dimension, Finding, References } from '../../model/model.ts';
import type { Edge, Graph, Node } from './relationship-detectors.ts';
import { emptyOutput as empty } from './output.ts';
import type { DetectorOutput as Output } from './output.ts';

/**
 * The detectors of type "code" about criticality (CIA-A) that need to know the parents of a CI. Pure. Criticality starts
 * on the Business Process (BIA) and flows down: each parent passes its values to its children, the highest value per
 * dimension wins. A relationship "Excluded for calculation" passes nothing (D131). The rules are data in
 * checks/reference/criticality; the Relationship report is optional: without it, these checks use the Inherited field.
 */

/** reference/criticality. */
export interface CriticalityRules {
  /** Days after the last change of the record during which an Inherited value may still wait to be copied to Target. */
  waitDays: number;
}

export const CRITICALITY_REF = 'reference/criticality';

interface Input { pack: CheckPack; inScope: Ci[]; columns: Set<string>; rules: CriticalityRules; graph: Graph | null; date: string }
type Detector = (input: Input) => Output;

const WORD: Record<Dimension, string> = { confidentiality: 'Confidentiality', integrity: 'Integrity', availability: 'Availability', authenticity: 'Authenticity' };
const names = (nodes: Node[]): string => Array.from(new Set(nodes.map((node) => node.name))).sort((a, b) => a.localeCompare(b)).join(', ');

function finding(pack: CheckPack, ci: Ci, field: string, detail: string, extra: { review?: string; wait?: string } = {}): Finding {
  return {
    key: `${pack.id}:${ci.key}:${field}`, checkId: pack.id, ciKey: ci.key, ciName: ci.name, className: ci.className, field, severity: pack.severity, detail,
    ...(extra.review ? { review: extra.review } : {}), ...(extra.wait ? { wait: extra.wait } : {})
  };
}

/** What a parent passes for one dimension: its Target, else its Inherited value. Undefined when it has neither. */
const passes = (node: Node, dimension: Dimension): number | undefined => node.ci ? node.ci.target[dimension] ?? node.ci.inherited[dimension] : undefined;
const hasAny = (node: Node): boolean => DIMENSIONS.some((dimension) => passes(node, dimension) !== undefined);

/** The live relationships above a CI, split into those that pass criticality and those excluded from calculation. */
function parentsOf(graph: Graph, ci: Ci): { counted: Edge[]; excluded: Edge[] } {
  const node = graph.byCi.get(ci.key);
  const edges = (node && graph.up.get(node)) ?? [];
  return { counted: edges.filter((edge) => edge.row.excluded !== true), excluded: edges.filter((edge) => edge.row.excluded === true) };
}

/**
 * Above the parents (C10): a Target value higher than every value the parents pass on. Parents over a relationship
 * excluded from calculation do not count. A dimension no parent passes is not tested (a Target without Inherited is fine).
 * Each finding is first for SACM to review (often a parent relationship is missing); the pack's `askAfterReview` lets a
 * manager then ask the owner. Without the Relationship report, the Target is compared with the Inherited field.
 */
const aboveParents: Detector = ({ pack, inScope, columns, graph }) => {
  const out = empty();
  const review = 'SACM checks the mapping first: a parent relationship may be missing';
  for (const dimension of DIMENSIONS) {
    if (!columns.has(`target.${dimension}`)) { out.notes.push({ checkId: pack.id, note: `Not tested for ${dimension}: ${missingColumns([`target.${dimension}`])}.` }); continue; }
    if (!graph && !columns.has(`inherited.${dimension}`)) { out.notes.push({ checkId: pack.id, note: `Not tested for ${dimension}: no Relationship report, and ${missingColumns([`inherited.${dimension}`])}.` }); continue; }
    out.tested.push(`${pack.id}:${dimension}`);
    let evaluated = 0;
    for (const ci of inScope) {
      evaluated += 1;
      const target = ci.target[dimension];
      if (target === undefined) continue;
      if (!graph) {
        const inherited = ci.inherited[dimension];
        if (inherited !== undefined && target > inherited) {
          out.findings.push(finding(pack, ci, dimension, `${WORD[dimension]}: Target is ${levelWords(target)}, Inherited is ${levelWords(inherited)}`, { review }));
        }
        continue;
      }
      const { counted, excluded } = parentsOf(graph, ci);
      const values = counted.map((edge) => ({ node: edge.parent, value: passes(edge.parent, dimension) })).filter((entry): entry is { node: Node; value: number } => entry.value !== undefined);
      if (!values.length) continue;
      const top = Math.max(...values.map((entry) => entry.value));
      if (target <= top) continue;
      const highest = names(values.filter((entry) => entry.value === top).map((entry) => entry.node));
      const left = excluded.filter((edge) => passes(edge.parent, dimension) !== undefined).map((edge) => edge.parent);
      const aside = left.length ? `. Not counted (excluded from calculation): ${names(left)}` : '';
      out.findings.push(finding(pack, ci, dimension, `${WORD[dimension]}: Target is ${levelWords(target)}, higher than every parent (highest ${levelWords(top)}, from ${highest})${aside}`, { review }));
    }
    out.evaluated[`${pack.id}:${dimension}`] = evaluated;
  }
  if (!graph && out.tested.length) out.notes.push({ checkId: pack.id, note: 'Parents not known: no Relationship report, so the Target is compared with the Inherited field. Load the Relationship report with the CI report to leave out relationships excluded from calculation.' });
  return out;
};

/** Why no criticality reaches a CI, from its parents (the mapping). '' without the Relationship report. */
function mappingWords(graph: Graph | null, ci: Ci): string {
  if (!graph) return '';
  const { counted, excluded } = parentsOf(graph, ci);
  if (!counted.length && !excluded.length) return 'no parent relationship';
  const giving = counted.map((edge) => edge.parent).filter(hasAny);
  if (giving.length) return `the parent ${names(giving)} has a criticality, but nothing is inherited yet`;
  const cut = excluded.map((edge) => edge.parent).filter(hasAny);
  if (cut.length) return `only parents over a relationship excluded from calculation have a criticality: ${names(cut)}`;
  return `no parent has a criticality: ${names(counted.concat(excluded).map((edge) => edge.parent))}`;
}

/**
 * No criticality reaches the CI (C2, every class but Business Process): Target is not complete. Inherited empty too:
 * nothing reaches the CI, a SACM review linked to the mapping. Inherited set: ServiceNow copies it to Target after two
 * weeks, so the finding waits `waitDays` after the last change of the record; after that it is listed for a review too.
 * A Target without Inherited is fine (a CI is often assessed before it is mapped).
 */
const noneReaches: Detector = ({ pack, inScope, columns, rules, graph, date }) => {
  const out = empty();
  const absent = (['target', 'inherited'] as const).flatMap((kind) => DIMENSIONS.map((dimension) => `${kind}.${dimension}`)).filter((column) => !columns.has(column));
  if (absent.length) { out.notes.push({ checkId: pack.id, note: `Not tested: ${missingColumns(absent)}.` }); return out; }
  out.tested.push(`${pack.id}:target`);
  let evaluated = 0;
  for (const ci of inScope) {
    evaluated += 1;
    if (DIMENSIONS.every((dimension) => ci.target[dimension] !== undefined)) continue;
    if (DIMENSIONS.some((dimension) => ci.inherited[dimension] !== undefined)) {
      const days = ci.updatedOn && date ? daysBetween(ci.updatedOn, date) : NaN;
      const age = Number.isFinite(days) ? days : -1;
      if (age < rules.waitDays) {
        out.findings.push(finding(pack, ci, 'target', 'Inherited is set, Target is empty', { wait: 'Inherited is set: ServiceNow copies it to Target after 2 weeks' }));
      } else {
        out.findings.push(finding(pack, ci, 'target', `Inherited is set, but Target is still empty ${age} days after the last change: ServiceNow did not copy it`));
      }
      continue;
    }
    const why = mappingWords(graph, ci);
    out.findings.push(finding(pack, ci, 'target', `No criticality reaches this CI${why ? `: ${why}` : ''}`));
  }
  out.evaluated[`${pack.id}:target`] = evaluated;
  if (!graph) out.notes.push({ checkId: pack.id, note: 'Load the Relationship report with the CI report to see the parents of each CI.' });
  return out;
};

export const CRITICALITY_DETECTORS: Record<string, Detector> = {
  'criticality/above-parents': aboveParents,
  'criticality/none-reaches': noneReaches
};

/**
 * Runs one criticality detector. `graph` gives the relationship graph of the run, or null without a Relationship report.
 * Never silent: a missing reference file or an unknown detector gives a note.
 */
export function runCriticalityDetector(pack: CheckPack, inScope: Ci[], columns: Set<string>, references: References, date: string, graph: () => Graph | null): Output {
  const out = empty();
  const detector = CRITICALITY_DETECTORS[pack.detector.module ?? ''];
  if (!detector) { out.notes.push({ checkId: pack.id, note: `Skipped: detector "${pack.detector.module ?? ''}" is not available yet.` }); return out; }
  const ref = pack.detector.ref ?? CRITICALITY_REF;
  const rules = references[ref] as CriticalityRules | undefined;
  if (!rules || typeof rules.waitDays !== 'number') { out.notes.push({ checkId: pack.id, note: `Skipped: reference data missing (${ref}).` }); return out; }
  return detector({ pack, inScope, columns, rules, graph: graph(), date });
}
