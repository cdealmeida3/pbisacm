import { MODEL_REF, buildGraph } from '../checks/detectors/relationship-detectors.ts';
import type { Graph, Node, RelationshipModel } from '../checks/detectors/relationship-detectors.ts';
import type { Relationship } from '../sources/relationships/relationship-report.ts';
import type { Ci, References } from '../model/model.ts';

/**
 * The capability sheet (D205): every Business Capability of a CI report with its status, the capabilities above and below
 * it, the Business Processes below, its description, tags, people and hidden characters. For the talks with Enterprise
 * Architecture and Process Management. Worked out when the report is loaded and kept with the run, so the button needs no
 * report file. Pure.
 */

export const CAPABILITY_COLUMNS = [
  'Name', 'Operational status', 'Capabilities above', 'Capabilities below', 'Business Processes below', 'Description', 'Tags', 'Owned by', 'Managed by', 'Hidden characters'
] as const;

/** One line of the sheet, in the order of CAPABILITY_COLUMNS. */
export type CapabilityRow = string[];

const CAPABILITY = 'business_capability';

const namesOf = (nodes: Node[]): string => Array.from(new Set(nodes.map((node) => node.name))).sort((a, b) => a.localeCompare(b)).join(', ');
const personOf = (ci: Ci, role: 'owned_by' | 'managed_by'): string => {
  const person = ci.roles[role];
  return person && (person.name || person.email) ? `${person.name || person.email}${person.active === false ? ' (inactive)' : ''}` : '';
};

/** The CIs linked to a node, in one direction, of one class. A Retired end is not counted (the graph keeps live links only). */
function linked(graph: Graph, node: Node, direction: 'up' | 'down', className: string): Node[] {
  const edges = (direction === 'up' ? graph.up.get(node) : graph.down.get(node)) ?? [];
  return edges.map((edge) => (direction === 'up' ? edge.parent : edge.child)).filter((other) => other.cls === className);
}

/**
 * The sheet of a report, sorted by name. Null when there is nothing to work it out from: no Relationship report or no
 * relationship model. A report without capabilities gives an empty list.
 */
export function capabilitySheet(cis: Ci[], relationships: Relationship[] | null, references: References): CapabilityRow[] | null {
  const model = references[MODEL_REF] as RelationshipModel | undefined;
  if (!relationships || !model || !Array.isArray(model.expectations)) return null;
  const graph = buildGraph(cis, relationships, model);
  return cis.filter((ci) => ci.className === CAPABILITY).sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key)).map((ci) => {
    const node = graph.byCi.get(ci.key)!;
    return [
      ci.name, ci.operationalStatus, namesOf(linked(graph, node, 'up', CAPABILITY)), namesOf(linked(graph, node, 'down', CAPABILITY)),
      namesOf(linked(graph, node, 'down', 'business_process')), ci.description, ci.tags.join(', '), personOf(ci, 'owned_by'), personOf(ci, 'managed_by'),
      (ci.hiddenCharacters ?? []).join(', ')
    ];
  });
}
