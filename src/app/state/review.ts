import { screenDate } from '../../core/shared/dates.ts';
import { drawReview, parseReview, reviewId, reviewPath } from '../../core/audit/lifecycle-review.ts';
import { reviewConfig } from '../../core/cases/inventory.ts';
import { content } from './content.ts';
import { refresh } from './folder.ts';
import { record, recordAll } from './journal.ts';
import { changed, state, today } from './store.ts';
import type { Review } from '../../core/audit/lifecycle-review.ts';

/**
 * The lifecycle review (version 0.13): the sample is drawn once on the button and saved in data/reviews/; the answers are journal lines.
 */

export const currentReview = (): Review | null => state.reviews[state.reviews.length - 1] ?? null;

/**
 * Start a lifecycle review: draws the sample from the latest CI report and saves it in data/reviews/. Only on the button.
 * A review started today is never drawn again: the saved file is read. Returns why nothing was started, or ''.
 */
export async function startLifecycleReview(): Promise<string> {
  const workspace = state.workspace!;
  const config = reviewConfig(content.references);
  const run = state.savedRuns.slice().sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (!config) return 'The reference data of the lifecycle review is missing (reference/lifecycle).';
  if (!run) return 'Load a CI report first: the sample is drawn from it.';
  if (!state.user.email) { state.askUser = true; changed(); return 'Please say who is working first.'; }
  const id = reviewId(today());
  const saved = parseReview(await workspace.readText(reviewPath(id)));
  if (saved) { await refresh(); return 'A review was already started today. It is shown here.'; }
  const review = drawReview(run, today(), config);
  if (!review) return 'This CI report was loaded by an older version of the Workbench. Load the CI report again, then start the review.';
  if (!review.items.length) return 'The CI report holds no CI to draw.';
  await workspace.writeText(reviewPath(id), JSON.stringify(review));
  state.reviews = state.reviews.filter((other) => other.id !== id).concat([review]);
  await record('review', [], { ref: id, text: `Started the lifecycle review of ${review.date}: ${review.items.length} CIs drawn from ${review.report} (report of ${review.reportDate})` });
  return '';
}

/**
 * Marks "same" every CI of the review not marked yet whose status the newest EPO systems report shows the same (version 0.14).
 * One journal write, only on the button; the note names the EPO report. Returns how many were marked.
 */
export async function markSameAsEpo(review: Review, items: Review['items']): Promise<number> {
  if (!items.length || !state.epo) return 0;
  const note = `Same status in the EPO systems report of ${screenDate(state.epo.date)}`;
  await recordAll(items.map((item) => ({ type: 'review' as const, keys: [], values: { ref: review.id, ciKey: item.ciKey, ciName: item.name, reason: 'same', text: note } })));
  return items.length;
}

/** A manager compared one CI of the review with EPO. The last mark of a CI counts. */
export async function markReview(review: Review, ciKey: string, result: string, note: string): Promise<void> {
  const item = review.items.filter((candidate) => candidate.ciKey === ciKey)[0];
  if (!item) return;
  await record('review', [], { ref: review.id, ciKey, ciName: item.name, reason: result, text: note.trim() });
}
