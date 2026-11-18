import { nameKey } from '../shared/names.ts';
import type { Ci, References } from '../model/model.ts';

/**
 * The inventory a run keeps: every CI of the report that is not Retired, with the few fields the lifecycle review shows
 * (src/core/audit/lifecycle-review.ts draws its sample from it, so its button needs no report file). Which statuses are
 * Retired, and the rest of the review's settings, are the part "review" of reference/lifecycle.
 */

/** The part "review" of reference/lifecycle. */
export interface ReviewConfig {
  /** CIs drawn by chance from `classes`. */
  sample: number;
  classes: string[];
  /** CIs drawn from those in `underRetirementStatus`. */
  underRetirement: number;
  underRetirementStatus: string;
  retiredStatuses: string[];
  results: Array<{ id: string; label: string }>;
  /** The results that open a case ("different"). */
  opensCase: string[];
}

export const REVIEW_REF = 'reference/lifecycle';

export function reviewConfig(references: References): ReviewConfig | null {
  const config = (references[REVIEW_REF] as { review?: ReviewConfig } | undefined)?.review;
  return config && Array.isArray(config.classes) && Array.isArray(config.results) ? config : null;
}

/**
 * One CI of a report that is not Retired, as the run keeps it: key, name, class label, class id, status, EPO ID, Support
 * group and the service mapped flag ('true', 'false', or '' when the report has no column). The flag is missing in runs saved
 * before version 0.26: read it with `mappedOf`.
 */
export type InventoryRow = [key: string, name: string, classLabel: string, className: string, status: string, epoId: string, supportGroup: string, serviceMapped?: string];

/** The service mapped flag of a row: true, false, or null when the run does not say. */
export const mappedOf = (row: InventoryRow): boolean | null => (row[7] === 'true' ? true : row[7] === 'false' ? false : null);

/** The CIs a review can draw from. Kept with the run, so the button needs no report file. None without reference/lifecycle. */
export function inventoryOf(cis: Ci[], references: References): InventoryRow[] | undefined {
  const config = reviewConfig(references);
  if (!config) return undefined;
  const retired = config.retiredStatuses.map(nameKey);
  return cis.filter((ci) => retired.indexOf(nameKey(ci.operationalStatus)) < 0)
    .map((ci): InventoryRow => [ci.key, ci.name, ci.sourceClass || ci.className, ci.className, ci.operationalStatus, ci.assetTag, ci.supportGroup, ci.serviceMapped === null ? '' : String(ci.serviceMapped)]);
}
