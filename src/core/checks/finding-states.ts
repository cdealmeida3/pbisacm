import { nameKey } from '../shared/names.ts';
import type { CheckPack, Ci, FindingState, References } from '../model/model.ts';

/**
 * How a finding is listed: to solve, to review, waiting or known. Pure, and driven only by reference data
 * (checks/reference/) and the check pack, so SACM can change a rule without a code change.
 */

/** reference/not-live-statuses: CIs in these statuses are not live yet; their findings wait. */
export interface NotLive { statuses: string[]; /** Checks that do not wait (SACM fixes them itself). */ exceptChecks?: string[] }
/** reference/known-tags: a tag of the team that explains a finding of some checks. */
export interface KnownTagRule { checks: string[]; tags: string[]; why?: string }
/** reference/tag-chips: a short word shown next to a CI that carries a tag. */
export interface TagChip { tag: string; chip: string; why?: string }

const same = (a: string, b: string): boolean => nameKey(a) === nameKey(b);

const notLive = (references: References): NotLive | undefined => references['reference/not-live-statuses'] as NotLive | undefined;

function knownRules(references: References): KnownTagRule[] {
  return ((references['reference/known-tags'] as { rules?: KnownTagRule[] } | undefined)?.rules) ?? [];
}

/**
 * The state of a finding of `pack` on `ci`, and why in words ('' when open). Not live wins over a tag, a tag over review.
 * `review`: a detector listed this one finding for a review only (a rule not agreed, or a change to confirm first).
 * `wait`: a detector says this one finding waits (an EPO change the sync may still bring).
 */
export function listing(ci: Ci, pack: CheckPack | undefined, references: References, review = '', wait = ''): { state: FindingState; why: string } {
  const rule = notLive(references);
  if (wait) return { state: 'waiting', why: wait };
  const waits = !pack || (rule?.exceptChecks ?? []).indexOf(pack.id) < 0;
  if (waits && (rule?.statuses ?? []).some((candidate) => same(candidate, ci.operationalStatus))) return { state: 'waiting', why: `Status ${ci.operationalStatus}: not live yet` };
  for (const rule of knownRules(references)) {
    if (!pack || rule.checks.indexOf(pack.id) < 0) continue;
    const tag = ci.tags.filter((candidate) => rule.tags.some((known) => same(known, candidate)))[0];
    if (tag) return { state: 'known', why: `Tagged ${tag}` };
  }
  if (pack?.reviewOnly) return { state: 'review', why: pack.reviewWhy || 'Allowed: listed for a review' };
  if (review) return { state: 'review', why: review };
  return { state: 'open', why: '' };
}

/** The chips of a CI from its tags, for example "to map" on a Descoped CI. */
export function chipsOf(ci: Ci, references: References): string[] {
  const chips = ((references['reference/tag-chips'] as { chips?: TagChip[] } | undefined)?.chips) ?? [];
  const found: string[] = [];
  for (const rule of chips) if (ci.tags.some((tag) => same(tag, rule.tag)) && found.indexOf(rule.chip) < 0) found.push(rule.chip);
  return found;
}

/** Never silent: say when the reference data that sorts findings is missing. */
export function listingNotes(references: References): string[] {
  const notes: string[] = [];
  if (references['reference/not-live-statuses'] === undefined) notes.push('Listing: reference data missing (reference/not-live-statuses), so findings on CIs that are not live yet are shown as to solve.');
  if (references['reference/known-tags'] === undefined) notes.push('Listing: reference data missing (reference/known-tags), so findings a tag explains are shown as to solve.');
  return notes;
}
