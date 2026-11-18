import { identityKey, nameKey } from '../../shared/names.ts';
import { columnWord, missingColumns, plural } from '../../shared/text.ts';
import type { CheckPack, Ci, Finding, FixLine, PersonRef, References } from '../../model/model.ts';
import type { Relationship } from '../../sources/relationships/relationship-report.ts';
import { emptyOutput as empty } from './output.ts';
import { offeringOrigin } from '../../cases/fix-place.ts';
import type { DetectorOutput as Output } from './output.ts';

/**
 * The detectors of type "code": the relationship checks. Pure: CIs, relationships and reference data in,
 * findings out. The rules are data (checks/reference/relationship-model.json, ported from the Service Mapping Workspace);
 * this file only knows how to count.
 *
 * A relationship counts only when neither end is Retired. A relationship end is matched to a CI by name, then class,
 * then asset tag when two CIs share a name (hidden characters ignored). A Service Instance with Platform ticked is a Platform.
 */

export interface PairRule {
  parents: string[];
  children: string[];
  /** allowed: `types` are the approved types. unconfirmed: not checked. blocked: not allowed. direction: the wrong way round. */
  status: 'allowed' | 'unconfirmed' | 'blocked' | 'direction';
  types?: string[];
  /** The finding is only listed for a review. */
  review?: boolean;
  note: string;
  advice?: string;
}

export interface Expectation {
  id: string;
  classes: string[];
  direction: 'parent' | 'child';
  related: string[];
  min?: number;
  max?: number;
  /** `max` counts per environment of the related CI. */
  maxPerEnvironment?: boolean;
  /** A missing one is not raised when the Parent field names it: "Offering parent" lists it for SACM. */
  parentField?: boolean;
  /** A rule that is not agreed: its findings are listed for a review. */
  review?: boolean;
  /** The fix is made in ServiceNow whatever the class (SACM maps it with the owner), never "correct it in EPO". */
  inServiceNow?: boolean;
  reviewWhy?: string;
  title: string;
  tooManyTitle?: string;
  todo?: string;
  tooManyTodo?: string;
}

/**
 * How a Business Application copies its Service Instance (D180). The description is compared by letters and digits only,
 * and only when the instance has one of at least `descriptionMin` characters. `descriptions` "poor": listed when the
 * application has none, one shorter than `descriptionMin`, its own name, or the start of the instance text. "different":
 * also when its first `descriptionStart` letters differ (the loose comparison of D105). The name is the instance name
 * without `instanceSuffix` (a regular expression), plus `applicationSuffix`.
 */
export interface ApplicationCopy {
  descriptions: 'poor' | 'different'; descriptionMin: number; descriptionStart: number; instanceSuffix: string; applicationSuffix: string;
}

export interface RelationshipModel {
  retiredStatuses: string[];
  applicationCopy?: ApplicationCopy;
  environments?: { suffix: string; aliases: Array<{ pattern: string; name: string }> };
  dictionary: PairRule[];
  expectations: Expectation[];
}

export const MODEL_REF = 'reference/relationship-model';

/** One end of a relationship. `ci` is null when the CI report does not hold it. */
export interface Node { key: string; name: string; cls: string; ci: Ci | null; retired: boolean; environment: string }
export interface Edge { parent: Node; child: Node; type: string; row: Relationship }

export interface Graph {
  nodes: Map<string, Node>;
  edges: Edge[];
  /** Live relationships (neither end Retired) above and below each node. */
  up: Map<Node, Edge[]>;
  down: Map<Node, Edge[]>;
  byCi: Map<string, Node>;
  /** Relationship ends that match no CI of the CI report. */
  unmatched: number;
  /** Ends whose name two or more CIs share, and that neither class nor asset tag told apart. */
  ambiguous: number;
}

const same = (a: string, b: string): boolean => nameKey(a) === nameKey(b);
/** Relationship types compared ignoring case and spaces ("Provided By::Provides" = "Provided by::Provides"). */
export const sameType = (a: string, b: string): boolean => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();

/** The class a relationship rule uses: a Service Instance with Platform ticked is a Platform. */
export const ruleClass = (ci: Ci): string => (ci.className === 'service_instance' && ci.platform ? 'platform' : ci.className);

/** The environment of a Service Instance: its Environment field, else a trailing word of its name, else production. */
export function environmentOf(name: string, field: string, model: RelationshipModel): string {
  const rules = model.environments;
  const suffix = rules ? new RegExp(rules.suffix, 'i').exec(name.trim())?.[1] : undefined;
  const raw = field.trim() || suffix || 'PROD';
  const alias = (rules?.aliases ?? []).filter((entry) => new RegExp(entry.pattern, 'i').test(raw))[0];
  return alias ? alias.name : raw.toUpperCase();
}

export function buildGraph(cis: Ci[], relationships: Relationship[], model: RelationshipModel): Graph {
  const byIdentity = new Map<string, Ci[]>();
  const byName = new Map<string, Ci[]>();
  for (const ci of cis) {
    byIdentity.set(identityKey(ci.name), (byIdentity.get(identityKey(ci.name)) ?? []).concat([ci]));
    byName.set(nameKey(ci.name), (byName.get(nameKey(ci.name)) ?? []).concat([ci]));
  }
  const retired = (status: string): boolean => model.retiredStatuses.some((value) => same(value, status));
  const nodes = new Map<string, Node>();
  const byCi = new Map<string, Node>();
  let unmatched = 0; let ambiguous = 0;

  const nodeOf = (ci: Ci): Node => {
    let node = byCi.get(ci.key);
    if (!node) {
      node = { key: ci.key, name: ci.name, cls: ruleClass(ci), ci, retired: retired(ci.operationalStatus), environment: environmentOf(ci.name, ci.environment ?? '', model) };
      byCi.set(ci.key, node);
      nodes.set(node.key, node);
    }
    return node;
  };
  for (const ci of cis) nodeOf(ci);

  const end = (name: string, className: string, tag: string): Node => {
    let found = byIdentity.get(identityKey(name)) ?? byName.get(nameKey(name)) ?? [];
    if (found.length > 1 && className) {
      const sameClass = found.filter((ci) => ci.className === className);
      if (sameClass.length) found = sameClass;
    }
    if (found.length > 1 && tag) {
      const sameTag = found.filter((ci) => same(ci.assetTag, tag));
      if (sameTag.length) found = sameTag;
    }
    // Still two (a live record and a Retired one of the same name, for example): the live one is the one that matters.
    if (found.length > 1) {
      const live = found.filter((ci) => !retired(ci.operationalStatus));
      if (live.length) found = live;
    }
    if (found.length > 1) ambiguous += 1;
    if (found[0]) return nodeOf(found[0]);
    unmatched += 1;
    const key = `?${identityKey(name)}|${className}`;
    let node = nodes.get(key);
    if (!node) {
      node = { key, name, cls: className, ci: null, retired: false, environment: environmentOf(name, '', model) };
      nodes.set(key, node);
    }
    return node;
  };

  const edges: Edge[] = [];
  const up = new Map<Node, Edge[]>();
  const down = new Map<Node, Edge[]>();
  for (const row of relationships) {
    const edge: Edge = { parent: end(row.parent, row.parentClass, row.parentTag), child: end(row.child, row.childClass, row.childTag), type: row.type, row };
    edges.push(edge);
    if (edge.parent.retired || edge.child.retired) continue;
    down.set(edge.parent, (down.get(edge.parent) ?? []).concat([edge]));
    up.set(edge.child, (up.get(edge.child) ?? []).concat([edge]));
  }
  return { nodes, edges, up, down, byCi, unmatched, ambiguous };
}

/* ------------------------------------------------------------------ detectors */

interface Input { pack: CheckPack; cis: Ci[]; inScope: Ci[]; graph: Graph; model: RelationshipModel; columns: Set<string>; references: References }
type Detector = (input: Input) => Output;

/** The class names in words (also read by the Power BI generator). */
export const CLASS_WORDS: Record<string, string> = {
  business_capability: 'Business Capability', business_process: 'Business Process', business_application: 'Business Application',
  business_service: 'Business Service', service_offering: 'Service Offering', service_instance: 'Service Instance', platform: 'Platform',
  api: 'API', application: 'Application', technology_management_service: 'Technology Management Service'
};
const classWord = (cls: string): string => CLASS_WORDS[cls] ?? cls.replace(/_/g, ' ');
const names = (nodes: Node[]): string => nodes.map((node) => node.name).sort((a, b) => a.localeCompare(b)).join(', ');

function finding(pack: CheckPack, ci: Ci, field: string, detail: string, extra: { suffix?: string; review?: string; fix?: FixLine; contactCi?: string; inServiceNow?: boolean } = {}): Finding {
  return {
    key: `${pack.id}:${ci.key}:${field}${extra.suffix ? `:${extra.suffix}` : ''}`, checkId: pack.id, ciKey: ci.key, ciName: ci.name,
    className: ci.className, field, severity: pack.severity, detail,
    ...(extra.review ? { review: extra.review } : {}), ...(extra.fix ? { fix: extra.fix } : {}), ...(extra.contactCi ? { contactCi: extra.contactCi } : {}),
    ...(extra.inServiceNow ? { inServiceNow: true } : {})
  };
}

const chosen = <T extends { id: string }>(pack: CheckPack, rules: T[]): T[] =>
  pack.detector.rules ? rules.filter((rule) => pack.detector.rules!.indexOf(rule.id) >= 0) : rules;

/** The live CIs on the other end of a CI's relationships, in one direction, of some classes. */
export function partners(graph: Graph, node: Node, direction: 'parent' | 'child', classes: string[]): Node[] {
  const edges = (direction === 'parent' ? graph.up.get(node) : graph.down.get(node)) ?? [];
  const found = new Map<string, Node>();
  for (const edge of edges) {
    const other = direction === 'parent' ? edge.parent : edge.child;
    if (classes.indexOf(other.cls) >= 0) found.set(other.key, other);
  }
  return Array.from(found.values());
}

/** Relationship missing: fewer related CIs than the model asks (`min`). */
const missing: Detector = ({ pack, inScope, graph, model, columns }) => {
  const out = empty();
  for (const rule of chosen(pack, model.expectations).filter((entry) => entry.min !== undefined)) {
    out.tested.push(`${pack.id}:${rule.id}`);
    let evaluated = 0;
    for (const ci of inScope) {
      const node = graph.byCi.get(ci.key);
      if (!node || rule.classes.indexOf(node.cls) < 0) continue;
      evaluated += 1;
      if (partners(graph, node, rule.direction, rule.related).length >= rule.min!) continue;
      // The Parent field already names the service: SACM adds the relationship from "Offering parent" (docs/DECISIONS.md).
      if (rule.parentField && columns.has('parentService') && (ci.parentService ?? '').trim()) continue;
      out.findings.push(finding(pack, ci, rule.id, rule.title.replace('Service Instance', node.cls === 'platform' ? 'Platform' : 'Service Instance'),
        { ...(rule.review ? { review: rule.reviewWhy || 'Review only' } : {}), ...(rule.inServiceNow ? { inServiceNow: true } : {}) }));
    }
    out.evaluated[`${pack.id}:${rule.id}`] = evaluated;
  }
  return out;
};

/** Too many partners: more related CIs than the model allows (`max`), per environment where the rule says so. */
const tooMany: Detector = ({ pack, inScope, graph, model }) => {
  const out = empty();
  for (const rule of chosen(pack, model.expectations).filter((entry) => entry.max !== undefined)) {
    out.tested.push(`${pack.id}:${rule.id}`);
    let evaluated = 0;
    for (const ci of inScope) {
      const node = graph.byCi.get(ci.key);
      if (!node || rule.classes.indexOf(node.cls) < 0) continue;
      evaluated += 1;
      const found = partners(graph, node, rule.direction, rule.related);
      const groups = new Map<string, Node[]>();
      for (const other of found) {
        const key = rule.maxPerEnvironment ? other.environment : '';
        groups.set(key, (groups.get(key) ?? []).concat([other]));
      }
      const over = Array.from(groups.entries()).filter(([, list]) => list.length > rule.max!);
      if (!over.length) continue;
      const what = over.map(([environment, list]) => `${rule.maxPerEnvironment ? `${environment}: ` : ''}${names(list)}`).join('; ');
      // SACM fixes the mapping in ServiceNow (D138): keep the right one, remove the other relationships.
      out.findings.push(finding(pack, ci, rule.id, `${rule.tooManyTitle ?? rule.title}: ${what}`, {
        fix: { change: `${rule.tooManyTitle ?? rule.title}: keep the right one, remove the other relationships`, current: what, set: 'Keep only the right one' }
      }));
    }
    out.evaluated[`${pack.id}:${rule.id}`] = evaluated;
  }
  return out;
};

const ruleFor = (model: RelationshipModel, parent: string, child: string): PairRule | undefined =>
  model.dictionary.filter((rule) => rule.parents.indexOf(parent) >= 0 && rule.children.indexOf(child) >= 0)[0];

/** The CI a relationship finding is shown on: the parent when it is in scope, else the child. */
function shownOn(edge: Edge, inScope: Set<string>): { ci: Ci; other: Node } | null {
  if (edge.parent.ci && inScope.has(edge.parent.ci.key)) return { ci: edge.parent.ci, other: edge.child };
  if (edge.child.ci && inScope.has(edge.child.ci.key)) return { ci: edge.child.ci, other: edge.parent };
  return null;
}
const sentence = (edge: Edge): string => `${edge.parent.name} ${edge.type} ${edge.child.name}`;
const edgeSuffix = (edge: Edge): string => `${edge.parent.key}>${edge.type.replace(/\s+/g, '').toLowerCase()}>${edge.child.key}`;

/** Wrong relationship type: a type the model does not approve for the pair, a pair it does not allow, or the wrong direction. */
const wrongType: Detector = ({ pack, inScope, graph, model }) => {
  const out = empty();
  const scope = new Set(inScope.map((ci) => ci.key));
  const seen = new Set<string>();
  let evaluated = 0;
  for (const edge of graph.edges) {
    if (edge.parent.retired || edge.child.retired) continue;
    const at = shownOn(edge, scope);
    if (!at) continue;
    evaluated += 1;
    const rule = ruleFor(model, edge.parent.cls, edge.child.cls);
    if (!rule || rule.status === 'unconfirmed') continue;
    const suffix = edgeSuffix(edge);
    if (seen.has(suffix)) continue;
    const pair = `${classWord(edge.parent.cls)} → ${classWord(edge.child.cls)}`;
    if (rule.status === 'allowed' && !(rule.types ?? []).some((type) => sameType(type, edge.type))) {
      seen.add(suffix);
      out.findings.push(finding(pack, at.ci, 'type', `${pair} as "${edge.type}": the model uses ${(rule.types ?? []).join(' or ')}`, {
        suffix, fix: { change: `Type of ${edge.parent.name} → ${edge.child.name}`, current: edge.type, set: rule.types![0]!, value: rule.types![0]!, relatedTo: at.other.name }
      }));
    } else if (rule.status === 'blocked') {
      seen.add(suffix);
      out.findings.push(finding(pack, at.ci, 'pair', `${pair} is not allowed: ${rule.note}`, {
        suffix, fix: { change: `Remove the relationship ${sentence(edge)}`, current: edge.type, set: rule.advice ?? 'Remove it', relatedTo: at.other.name }
      }));
    } else if (rule.status === 'direction') {
      seen.add(suffix);
      out.findings.push(finding(pack, at.ci, 'direction', `${pair}: the wrong direction. ${rule.note}`, {
        suffix, ...(rule.review ? { review: 'Review: confirm with the criticality owner first' } : {}),
        fix: { change: `Direction: ${sentence(edge)}`, current: `${edge.parent.name} is the parent`, set: rule.advice ?? 'Swap the direction', relatedTo: at.other.name }
      }));
    }
  }
  for (const field of ['type', 'pair', 'direction']) { out.tested.push(`${pack.id}:${field}`); out.evaluated[`${pack.id}:${field}`] = evaluated; }
  return out;
};

/** Relationship to a Retired CI: one end is Retired, the other is not. Shown on the live CI (procedure 2.12). */
const retiredEnd: Detector = ({ pack, inScope, graph }) => {
  const out = empty();
  const scope = new Set(inScope.map((ci) => ci.key));
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.parent.retired === edge.child.retired) continue;
    const live = edge.parent.retired ? edge.child : edge.parent;
    const gone = edge.parent.retired ? edge.parent : edge.child;
    if (!live.ci || !scope.has(live.ci.key)) continue;
    const suffix = edgeSuffix(edge);
    if (seen.has(suffix)) continue;
    seen.add(suffix);
    out.findings.push(finding(pack, live.ci, 'retired-end', `Related to the Retired ${classWord(gone.cls)} ${gone.name} (${edge.parent === live ? 'child' : 'parent'}, ${edge.type})`, {
      suffix, fix: { change: `Remove the relationship ${sentence(edge)}`, current: `${gone.name} is Retired`, set: 'Remove the relationship', relatedTo: gone.name }
    }));
  }
  out.tested.push(`${pack.id}:retired-end`);
  out.evaluated[`${pack.id}:retired-end`] = inScope.length;
  return out;
};

/**
 * Relationship entered twice: between two CIs only one relationship is allowed (docs/DECISIONS.md). Rows with the
 * same parent, type and child, and also rows of another type or the other direction between the same two CIs.
 */
const twice: Detector = ({ pack, inScope, graph }) => {
  const out = empty();
  const scope = new Set(inScope.map((ci) => ci.key));
  const pairs = new Map<string, Edge[]>();
  for (const edge of graph.edges) {
    if (edge.parent === edge.child) continue;
    const pair = [edge.parent.key, edge.child.key].sort().join('<>');
    pairs.set(pair, (pairs.get(pair) ?? []).concat([edge]));
  }
  pairs.forEach((list, pair) => {
    // Only live relationships count: one with a Retired end is on the card "Relationship to a Retired CI".
    if (list.length < 2 || list[0]!.parent.retired || list[0]!.child.retired) return;
    const at = shownOn(list[0]!, scope);
    if (!at) return;
    // One kind per parent, type and child; the type is compared without case or spaces.
    const seen: string[] = []; const kinds: string[] = [];
    for (const edge of list) if (seen.indexOf(edgeSuffix(edge)) < 0) { seen.push(edgeSuffix(edge)); kinds.push(sentence(edge)); }
    if (kinds.length === 1) {
      out.findings.push(finding(pack, at.ci, 'twice', `Entered ${list.length} times: ${kinds[0]}`, {
        suffix: edgeSuffix(list[0]!), fix: { change: `Relationship entered ${list.length} times: ${kinds[0]}`, current: `${list.length} rows`, set: 'Keep one', relatedTo: at.other.name }
      }));
      return;
    }
    const [a, b] = [list[0]!.parent.name, list[0]!.child.name];
    out.findings.push(finding(pack, at.ci, 'twice', `${list.length} relationships between ${a} and ${b}: ${kinds.join('; ')}`, {
      suffix: pair, fix: { change: `${list.length} relationships between ${a} and ${b}: only one is allowed`, current: kinds.join('; '), set: 'Keep only the right one', relatedTo: at.other.name }
    }));
  });
  out.tested.push(`${pack.id}:twice`);
  out.evaluated[`${pack.id}:twice`] = inScope.length;
  return out;
};

/** The same person: user ID first, then email, then (only when neither is known) the display name. Both empty is the same. */
function samePerson(a: PersonRef | undefined, b: PersonRef | undefined): boolean {
  const filled = (person: PersonRef | undefined): boolean => !!person && !!(person.name || person.email || person.userId);
  if (!filled(a) || !filled(b)) return filled(a) === filled(b);
  if (a!.userId && b!.userId) return a!.userId.toLowerCase() === b!.userId.toLowerCase();
  if (a!.email && b!.email) return a!.email.toLowerCase() === b!.email.toLowerCase();
  return same(a!.name, b!.name);
}
const personText = (person: PersonRef | undefined): string => (person && (person.name || person.email)) || '(empty)';
/** The value to copy (D243), unless the value to set is empty. */
const valueIf = (set: string): { value?: string } => (set && set !== '(empty)' ? { value: set } : {});

/** The end of a Business Application's name that is left out to find its Service Instance (ignoring case; also read by the Power BI generator). */
export const APPLICATION_SUFFIX = '[\\s_-]*BA\\s*$';

/** The Service Instance whose name a Business Application carries ("Fines_BA" → "Fines - PROD"), production first. */
function instanceOf(node: Node, instances: Node[]): Node | undefined {
  if (instances.length === 1) return instances[0];
  const base = nameKey(node.name.replace(new RegExp(APPLICATION_SUFFIX, 'i'), ''));
  const named = instances.filter((other) => nameKey(other.name).indexOf(base) === 0);
  return named.filter((other) => other.environment === 'PROD')[0] ?? (named.length === 1 ? named[0] : undefined);
}

const ROLE_WORDS: Record<string, string> = { owned_by: 'Owned by', managed_by: 'Managed by', operational_status: 'Operational status', description: 'Description', name: 'Name' };

const lettersOf = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Is the description of the application to be copied from its instance (D180)? Never when the instance has no usable one. */
function descriptionDiffers(application: Ci, instance: Ci, copy: ApplicationCopy): boolean {
  const source = lettersOf(instance.description);
  const now = lettersOf(application.description);
  if (instance.description.trim().length < copy.descriptionMin || now === source) return false;
  if (!now || application.description.trim().length < copy.descriptionMin || now === lettersOf(application.name) || source.startsWith(now)) return true;
  const start = Math.max(1, copy.descriptionStart);
  return copy.descriptions === 'different' && now.slice(0, start) !== source.slice(0, start);
}

/** The name a Business Application carries: its instance name without " - PROD" or " - TEST", plus "_BA" (D180). Compared without case or spacing. */
const applicationName = (instance: string, copy: ApplicationCopy): string =>
  `${instance.trim().replace(new RegExp(copy.instanceSuffix), '').trim()}${copy.applicationSuffix}`;

/** The value of a field of a CI, in words, for the line of the fix list. */
function valueOf(ci: Ci, field: string): string {
  if (field === 'operational_status') return ci.operationalStatus || '(empty)';
  if (field === 'description') return ci.description.trim() || '(empty)';
  if (field === 'name') return ci.name;
  return personText(ci.roles[field as 'owned_by']);
}

/**
 * Application ≠ Instance: a Business Application is a copy of its Service Instance (procedure 2.9, D180): the same Owned by,
 * Managed by, Operational status and description, and the name of the instance with "_BA". SACM copies the values itself.
 */
const applicationInstance: Detector = ({ pack, inScope, graph, columns, model }) => {
  const out = empty();
  const copy = model.applicationCopy;
  const fields = ['owned_by', 'managed_by', 'operational_status', 'description', 'name'].filter((field) => {
    if ((field === 'description' || field === 'name') && !copy) {
      out.notes.push({ checkId: pack.id, note: `Not tested for ${ROLE_WORDS[field]!.toLowerCase()}: reference data missing (applicationCopy in ${MODEL_REF}).` });
      return false;
    }
    const column = field === 'operational_status' ? 'operationalStatus' : field;
    if (field === 'name' || columns.has(column)) return true;
    out.notes.push({ checkId: pack.id, note: `Not tested for ${columnWord(field)}: ${missingColumns([field])}.` });
    return false;
  });
  let evaluated = 0; let unclear = 0;
  for (const ci of inScope) {
    const node = graph.byCi.get(ci.key);
    if (!node || node.cls !== 'business_application') continue;
    const instances = partners(graph, node, 'child', ['service_instance', 'platform']);
    if (!instances.length) continue;
    const instance = instanceOf(node, instances);
    if (!instance || !instance.ci) { unclear += 1; continue; }
    evaluated += 1;
    const theirs = instance.ci;
    for (const field of fields) {
      let differs: boolean;
      let set = valueOf(theirs, field);
      if (field === 'operational_status') differs = !same(ci.operationalStatus, theirs.operationalStatus);
      else if (field === 'description') differs = descriptionDiffers(ci, theirs, copy!);
      else if (field === 'name') { set = applicationName(theirs.name, copy!); differs = nameKey(ci.name) !== nameKey(set); }
      else differs = !samePerson(ci.roles[field as 'owned_by'], theirs.roles[field as 'owned_by']);
      if (!differs) continue;
      const current = valueOf(ci, field);
      const detail = field === 'description' ? `Description is not the one of its Service Instance ${instance.name}`
        : field === 'name' ? `Name is not the name of its Service Instance ${instance.name} with ${copy!.applicationSuffix}`
          : `${ROLE_WORDS[field]} is ${current}; its Service Instance ${instance.name} has ${set}`;
      out.findings.push(finding(pack, ci, field, detail, { fix: { change: `Set ${ROLE_WORDS[field]} (as on ${instance.name})`, current, set, ...valueIf(set) } }));
    }
  }
  for (const field of fields) { out.tested.push(`${pack.id}:${field}`); out.evaluated[`${pack.id}:${field}`] = evaluated; }
  if (unclear) out.notes.push({ checkId: pack.id, note: `Partly tested: ${plural(unclear, 'Business Application')} ${unclear === 1 ? 'has several Service Instances and none carries its' : 'have several Service Instances and none carries their'} name, so the instance to compare with is not known.` });
  return out;
};

/** The one live Business Service above a Service Offering, if there is exactly one. */
function serviceOf(graph: Graph, node: Node): Node[] {
  return partners(graph, node, 'parent', ['business_service']);
}

/**
 * Offering owner ≠ Service owner: a Service Offering made by a person has the owner of its Business Service (procedure
 * 2.6). An offering the EPO integration created takes it from EPO by itself: it is not raised (D137). SACM copies the owner.
 */
const offeringOwner: Detector = ({ pack, inScope, graph, columns, references }) => {
  const out = empty();
  if (!columns.has('owned_by')) { out.notes.push({ checkId: pack.id, note: `Not tested: ${missingColumns(['owned_by'])}.` }); return out; }
  let evaluated = 0; let fromEpo = 0;
  for (const ci of inScope) {
    const node = graph.byCi.get(ci.key);
    if (!node || node.cls !== 'service_offering') continue;
    if (offeringOrigin(ci, references) === 'epo') { fromEpo += 1; continue; }
    const services = serviceOf(graph, node);
    if (services.length !== 1 || !services[0]!.ci) continue;
    evaluated += 1;
    const service = services[0]!.ci!;
    if (samePerson(ci.roles.owned_by, service.roles.owned_by)) continue;
    out.findings.push(finding(pack, ci, 'service-owner', `Owned by is ${personText(ci.roles.owned_by)}; its Business Service ${service.name} is owned by ${personText(service.roles.owned_by)}`, {
      fix: { change: `Owned by (as on ${service.name})`, current: personText(ci.roles.owned_by), set: personText(service.roles.owned_by), ...valueIf(personText(service.roles.owned_by)) }
    }));
  }
  out.tested.push(`${pack.id}:service-owner`);
  out.evaluated[`${pack.id}:service-owner`] = evaluated;
  if (fromEpo) out.notes.push({ checkId: pack.id, note: `${plural(fromEpo, 'Service Offering')} ${fromEpo === 1 ? 'comes' : 'come'} from EPO: ${fromEpo === 1 ? 'it takes its' : 'they take their'} owner from EPO and ${fromEpo === 1 ? 'is' : 'are'} not checked here.` });
  return out;
};

/** Offering parent: the Parent field of a Service Offering and its Business Service relationship name the same, single Business Service. */
const offeringParent: Detector = ({ pack, inScope, graph, columns }) => {
  const out = empty();
  if (!columns.has('parentService')) {
    out.notes.push({ checkId: pack.id, note: 'Not tested: the report has no Parent column (ref_cmdb_ci_service.parent). Add it to the CI report.' });
    return out;
  }
  let evaluated = 0;
  for (const ci of inScope) {
    const node = graph.byCi.get(ci.key);
    if (!node || node.cls !== 'service_offering') continue;
    evaluated += 1;
    const parent = (ci.parentService ?? '').trim();
    const services = serviceOf(graph, node);
    const listed = names(services);
    const offering = ci.name;
    let detail = ''; let fix: FixLine | undefined;
    if (!parent) {
      // Neither the field nor a relationship: SACM cannot know the service. Relationship missing asks the owner.
      if (!services.length) continue;
      detail = `The Parent field is empty; the relationship names ${listed}`;
      if (services.length === 1) fix = { change: `Set the Parent field of ${offering}`, current: '(empty)', set: services[0]!.name, value: services[0]!.name };
    } else if (!services.length) {
      detail = `The Parent field names ${parent}, but no Business Service is related`;
      fix = { change: `Add the relationship ${parent} Provides::Provided by ${offering}`, current: 'No Business Service related', set: parent, value: parent };
    } else if (!services.some((service) => same(service.name, parent))) {
      detail = `The Parent field names ${parent}; the relationship names ${listed}`;
      fix = { change: `Business Service of ${offering}: check which is right`, current: `Relationship: ${listed}`, set: `Parent field: ${parent}` };
    } else if (services.length > 1) {
      const others = names(services.filter((service) => !same(service.name, parent)));
      detail = `The Parent field names ${parent}; there are also relationships to ${others}`;
      fix = { change: `Remove the extra Business Service relationships of ${offering}`, current: others, set: `Keep only ${parent}` };
    }
    if (detail) out.findings.push(finding(pack, ci, 'parent', detail, fix ? { fix } : {}));
  }
  out.tested.push(`${pack.id}:parent`);
  out.evaluated[`${pack.id}:parent`] = evaluated;
  return out;
};

export const DETECTORS: Record<string, Detector> = {
  'relationships/missing': missing,
  'relationships/too-many': tooMany,
  'relationships/wrong-type': wrongType,
  'relationships/retired-end': retiredEnd,
  'relationships/twice': twice,
  'relationships/application-instance': applicationInstance,
  'relationships/offering-owner': offeringOwner,
  'relationships/offering-parent': offeringParent
};

/**
 * Runs one code detector. Never silent: no Relationship report, no reference data or an unknown detector each give a note.
 * `graph` is built once per run by the caller (see src/core/checks/engine.ts).
 */
export function runDetector(pack: CheckPack, cis: Ci[], inScope: Ci[], columns: Set<string>, references: References, graph: () => Graph | null): Output {
  const out = empty();
  const detector = DETECTORS[pack.detector.module ?? ''];
  if (!detector) { out.notes.push({ checkId: pack.id, note: `Skipped: detector "${pack.detector.module ?? ''}" is not available yet.` }); return out; }
  const ref = pack.detector.ref ?? MODEL_REF;
  const model = references[ref] as RelationshipModel | undefined;
  if (!model || !Array.isArray(model.dictionary) || !Array.isArray(model.expectations)) { out.notes.push({ checkId: pack.id, note: `Skipped: reference data missing (${ref}).` }); return out; }
  const built = graph();
  if (!built) { out.notes.push({ checkId: pack.id, note: 'Not tested: no Relationship report. Load the Relationship report with the CI report.' }); return out; }
  return detector({ pack, cis, inScope, graph: built, model, columns, references });
}
