import { plural } from '../../shared/text.ts';
import { canonicalClass } from '../ci/ci-report.ts';
import { normaliseHeader } from '../../reading/headers.ts';
import { hiddenCharacters, identityKey, nameKey } from '../../shared/names.ts';
import type { ReportType } from '../../reading/table.ts';

/**
 * Reads the Relationship report (cmdb_rel_ci list export). No checks yet: the relationships are stored with the load,
 * so the relationship and criticality checks can use them. "Excluded for calculation" is read too: an excluded
 * relationship passes no criticality from the parent to the child (D131).
 *
 * The real export has 17 columns: Parent, Type, Child, Connection strength, Updated, Created, Created by, Excluded for
 * calculation, Percent outage, Port, Tags, Updated by, Updates, Class, Asset tag, Class, Asset tag. Two columns are named
 * "Class" and two "Asset tag": the first of each is the parent's, the second the child's, so they are read by position.
 * The field-name form (parent.sys_class_name, child.asset_tag …) is read too.
 */

/** The Relationship report (cmdb_rel_ci): known by its Parent, Type and Child columns. */
export const RELATIONSHIP_REPORT: ReportType<'relationship'> = {
  kind: 'relationship', label: 'Relationship report', hint: 'ServiceNow: how the CIs are linked',
  needs: [
    { label: 'Parent', any: ['parent', 'parent.name'] },
    { label: 'Type', any: ['type', 'type.name', 'relationship_type'] },
    { label: 'Child', any: ['child', 'child.name'] }
  ],
  folder: 'relationships'
};

export interface Relationship {
  parent: string;
  type: string;
  child: string;
  /** Canonical class ids (see src/core/sources/ci/ci-report.ts), '' when the report has no class column. */
  parentClass: string;
  childClass: string;
  parentTag: string;
  childTag: string;
  /**
   * "Excluded for calculation": true when the relationship passes no criticality. Missing when the report has no such
   * column (and in runs saved before version 0.18): every relationship then passes criticality, as before.
   */
  excluded?: boolean;
}

export interface RelationshipRead {
  relationships: Relationship[];
  /** Rows with no parent or no child, left out. */
  skipped: number;
  notes: string[];
}

export const PARENT_CLASS = ['parent.sys_class_name', 'parent.class', 'parent_class'];
export const CHILD_CLASS = ['child.sys_class_name', 'child.class', 'child_class'];
export const PARENT_TAG = ['parent.asset_tag', 'parent_asset_tag'];
export const CHILD_TAG = ['child.asset_tag', 'child_asset_tag'];
/** The column "Excluded for calculation", as a label or a field name (with or without a prefix such as u_). */
const EXCLUDED = /^([a-z0-9]+_)?excluded_(for|from)_calculation$/;
const YES = ['true', 'yes', '1', 'y'];

export function readRelationshipReport(rows: string[][]): RelationshipRead {
  const headers = (rows[0] ?? []).map(normaliseHeader);
  const first = (names: string[]): number => headers.findIndex((header) => names.includes(header));
  const all = (name: string): number[] => headers.map((header, index) => (header === name ? index : -1)).filter((index) => index >= 0);
  const notes: string[] = [];

  const parent = first(['parent', 'parent.name']);
  const type = first(['type', 'type.name', 'relationship_type']);
  const child = first(['child', 'child.name']);
  // Explicit columns win; else the first "Class" / "Asset tag" is the parent's and the second the child's.
  const classes = all('class').concat(all('sys_class_name'));
  const tags = all('asset_tag');
  const byPosition = (explicit: number, list: number[], at: number): number => (explicit >= 0 ? explicit : list.length === 2 ? list[at]! : -1);
  const parentClass = byPosition(first(PARENT_CLASS), classes, 0);
  const childClass = byPosition(first(CHILD_CLASS), classes, 1);
  const parentTag = byPosition(first(PARENT_TAG), tags, 0);
  const childTag = byPosition(first(CHILD_TAG), tags, 1);
  const excluded = headers.findIndex((header) => EXCLUDED.test(header));
  if (excluded < 0) notes.push('The report has no column "Excluded for calculation", so every relationship passes criticality.');
  if (parentClass < 0 || childClass < 0) {
    notes.push(classes.length === 1
      ? 'The report has only one Class column, so it is not known whether it is the parent\'s or the child\'s. Classes are not read.'
      : 'The report has no Class columns for the parent and the child. Classes are not read.');
  }

  const relationships: Relationship[] = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const cell = (index: number): string => (index < 0 ? '' : (row[index] ?? '').trim());
    const item: Relationship = {
      parent: cell(parent), type: cell(type), child: cell(child),
      parentClass: canonicalClass(cell(parentClass)), childClass: canonicalClass(cell(childClass)),
      parentTag: cell(parentTag), childTag: cell(childTag),
      ...(excluded >= 0 ? { excluded: YES.includes(cell(excluded).toLowerCase()) } : {})
    };
    if (!item.parent || !item.child) { skipped += 1; continue; }
    relationships.push(item);
  }
  if (skipped) notes.push(`${plural(skipped, 'row')} ${skipped === 1 ? 'has' : 'have'} no parent or no child and ${skipped === 1 ? 'was' : 'were'} left out.`);
  return { relationships, skipped, notes };
}

/** A Relationship report as it is saved in the workspace (data/runs/relationships/). */
export interface RelationshipRun {
  kind: 'relationship';
  /** Date of the report (yyyy-mm-dd) and its file name. */
  date: string;
  report: string;
  loadedBy?: string;
  loadedByName?: string;
  loadedAt?: string;
  relationships: Relationship[];
  notes: string[];
}

/** The names that hold hidden characters, by identity key, with the characters. Used to test CI names from a CSV report. */
export function hiddenNames(relationships: Relationship[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const item of relationships) {
    for (const name of [item.parent, item.child]) {
      const chars = hiddenCharacters(name);
      if (chars.length) found.set(identityKey(name), chars);
    }
  }
  return found;
}

export interface EndMatch {
  /** Relationship ends (parent or child) in total, and those that match no CI of the CI report. */
  ends: number;
  unmatched: number;
  /** Distinct names that hold a hidden character. */
  hidden: number;
}

/**
 * How the ends of the relationships match the CIs of a CI report, by the CI keys of that report (see src/core/sources/ci/ci-report.ts).
 * An end matches by identity key ("?" for a hidden character, as in a CSV), by the name without hidden characters,
 * and, for a name two CIs share, by name and asset tag.
 */
export function matchEnds(relationships: Relationship[], ciKeys: string[]): EndMatch {
  const keys = new Set(ciKeys);
  const byName = new Set<string>();
  for (const key of ciKeys) {
    byName.add(nameKey(key.replace(/(\|[^|]*)?(#\d+)?$/, '')));
  }
  let ends = 0; let unmatched = 0;
  for (const item of relationships) {
    for (const [name, tag] of [[item.parent, item.parentTag], [item.child, item.childTag]] as const) {
      ends += 1;
      const id = identityKey(name);
      const tagged = tag ? `${id}|${tag.toLowerCase()}` : '';
      if (keys.has(id) || (tagged && keys.has(tagged)) || byName.has(id) || byName.has(nameKey(name))) continue;
      unmatched += 1;
    }
  }
  return { ends, unmatched, hidden: hiddenNames(relationships).size };
}
