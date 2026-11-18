// The answer key of the lifecycle review in the Power BI report (build B8, D306): what the Power Query of the review
// must give on the invented samples, so tools/powerbi/parity.ts can compare it.
//   - drawSample: the CIs a new review draws from a CI report (fnReviewDraw). The HTML app shuffles with a generator
//     seeded by the day (drawReview); Power Query has no cheap shuffle, so the report ranks each CI by a hash of the
//     report date, the file and the CI key (D306). The HTML app's drawReview is not used here.
//   - sampleReviews: the reviews of the sample journal as the HTML app keeps them (Review of src/core/audit/), from the
//     rows of type review with Items (what the Power App SACM audit saves on New review).
//   - reviewLines: the lines of the part ReviewLines: evidenceRows of src/core/audit/lifecycle-review.ts, the marks,
//     the agreement with EPO, then the sample of the next review.
// Only invented data.
import { agreeingWithEpo, epoStatusOf, evidenceRows, marksOf, withReviewFacts } from '../../src/core/audit/lifecycle-review.ts';
import type { Review, ReviewItem } from '../../src/core/audit/lifecycle-review.ts';
import { reviewConfig } from '../../src/core/cases/inventory.ts';
import type { InventoryRow, ReviewConfig } from '../../src/core/cases/inventory.ts';
import type { Case, CaseEvent, Run } from '../../src/core/cases/cases.ts';
import { nameKey } from '../../src/core/shared/names.ts';
import { longDate } from '../../src/core/shared/dates.ts';
import { loadPacks, loadReferences } from '../../src/hosts/cli.ts';
import { stateRows } from './history.ts';

/** FNV-1a of 32 bits over the UTF-16 code units of `text`, from the hash `start` (fnReviewHash). */
export function fnvHash(start: number, text: string): number {
  let hash = start >>> 0;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash;
}
export const FNV_START = 2166136261;

const ordinal = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The sample a new review draws from a CI report (fnReviewDraw): `underRetirement` CIs in the Under retirement status and
 * `sample` of the other CIs of the classes, each ranked by fnvHash of "<report date>|<file>|<CI key>", the smallest
 * first; each part in the order of class, name and key, the sample by chance first. `inventory`: the CIs of the report
 * that are not Retired (inventoryOf); `file`: the file name of the report in the folder.
 */
export function drawSample(inventory: InventoryRow[], reportDate: string, file: string, config: ReviewConfig): ReviewItem[] {
  const start = fnvHash(FNV_START, `${reportDate}|${file}|`);
  const retired = config.retiredStatuses.map(nameKey);
  const pool = inventory.filter((row) => config.classes.indexOf(row[3]) >= 0 && retired.indexOf(nameKey(row[4])) < 0)
    .map((row) => ({ row, rank: fnvHash(start, row[0]) }));
  const leaving = nameKey(config.underRetirementStatus);
  const item = (group: ReviewItem['group']) => ({ row }: { row: InventoryRow }): ReviewItem =>
    ({ ciKey: row[0], name: row[1], classLabel: row[2], className: row[3], status: row[4], epoId: row[5], group });
  const byName = (a: ReviewItem, b: ReviewItem): number => ordinal(a.classLabel, b.classLabel) || ordinal(a.name, b.name) || ordinal(a.ciKey, b.ciKey);
  const pick = (entries: typeof pool, count: number, group: ReviewItem['group']): ReviewItem[] =>
    entries.slice().sort((a, b) => a.rank - b.rank || ordinal(a.row[0], b.row[0])).slice(0, Math.max(0, count)).map(item(group)).sort(byName);
  return pick(pool.filter((entry) => nameKey(entry.row[4]) !== leaving), config.sample, 'sample')
    .concat(pick(pool.filter((entry) => nameKey(entry.row[4]) === leaving), config.underRetirement, 'under-retirement'));
}

/** The reviews of a journal (LifecycleReviews): the rows of type review with no CI and Items; the first of an id counts; by id. */
export function reviewsOf(rows: Array<Record<string, string>>): Review[] {
  const reviews = new Map<string, Review>();
  const sorted = rows.slice().sort((a, b) => ordinal(a.At ?? '', b.At ?? '') || ordinal(a.Title ?? '', b.Title ?? ''));
  for (const row of sorted) {
    if (row.Type !== 'review' || row.CiKey || !row.Ref || !row.Items || reviews.has(row.Ref)) continue;
    let body: { report?: string; reportDate?: string; items?: Array<Record<string, unknown>> };
    try { body = JSON.parse(row.Items) as typeof body; } catch { continue; }
    if (!body || !Array.isArray(body.items)) continue;
    const text = (value: unknown): string => (value === undefined || value === null ? '' : String(value));
    reviews.set(row.Ref, {
      kind: 'lifecycle', id: row.Ref, date: row.Ref.slice(0, 10), report: text(body.report), reportDate: text(body.reportDate).slice(0, 10),
      items: body.items.filter((entry) => entry && text(entry.ciKey)).map((entry) => ({
        ciKey: text(entry.ciKey), name: text(entry.name), classLabel: text(entry.classLabel), className: text(entry.className), status: text(entry.status),
        epoId: text(entry.epoId), group: text(entry.group) === 'under-retirement' ? 'under-retirement' : 'sample'
      }))
    });
  }
  return Array.from(reviews.values()).sort((a, b) => ordinal(a.id, b.id));
}

export const sampleReviews = (): Review[] => reviewsOf(stateRows('journal'));

/** The newest run with the lines of the lifecycle review (fnWithReviews): withReviewFacts on that run alone. */
export function withSampleReviews(run: Run, events: CaseEvent[]): Run {
  const pack = loadPacks().find((item) => item.id === 'LIFECYCLE-REVIEW');
  return withReviewFacts([run], sampleReviews(), events, pack, loadReferences())[0]!;
}

/** The EPO systems by EPO ID in lower case, as epoStatusOf reads them. */
export type Systems = Map<string, { status: string; statusWord: string }>;

/**
 * The lines of the part ReviewLines (fnReviewLinesPart): each review newest first, its CIs in their order, with the
 * columns of the evidence file (evidenceRows); then the sample of the next review from the newest run. Case status:
 * that of the case a "Not the same" opened, else Verified when the newest report shows the CI in another status.
 * EpoDate: the date of the EPO systems report (`epoDate`), '' without one.
 */
export function reviewLines(run: Run, file: string, events: CaseEvent[], cases: Case[], systems: Systems | null, epoDate: string): Array<Record<string, string | number | boolean>> {
  const config = reviewConfig(loadReferences())!;
  const reviews = sampleReviews();
  const newest = reviews[reviews.length - 1];
  const inventory = new Map((run.inventory ?? []).map((row) => [row[0], row]));
  const lines: Array<Record<string, string | number | boolean>> = [];
  const add = (review: Review, next: boolean): void => {
    const marks = next ? new Map() : marksOf(review, events);
    const evidence = evidenceRows(review, marks, cases, config, systems);
    const agree = new Set(agreeingWithEpo(review, marks, systems).map((item) => item.ciKey));
    review.items.forEach((item, at) => {
      const mark = marks.get(item.ciKey);
      const row = evidence[at]!;
      const opened = !!mark && config.opensCase.indexOf(mark.result) >= 0;
      const current = inventory.get(item.ciKey);
      const status = row[12] || (opened && current && nameKey(current[4]) !== nameKey(item.status) ? 'Verified' : '');
      lines.push({
        Review: next ? 'next' : review.id, IsNext: next, IsCurrent: !next && review.id === newest?.id, ReviewDate: next ? '' : review.date,
        ReviewLabel: next ? 'The next review (not started)' : `Lifecycle review of ${longDate(review.date)}`, Report: review.report, ReportDate: review.reportDate,
        Group: item.group, GroupLabel: row[2]!, CiKey: item.ciKey, CiName: item.name, ClassLabel: item.classLabel, ClassName: item.className, EpoId: item.epoId,
        Status: item.status, EpoStatus: epoStatusOf(item, systems).status, EpoStatusWords: row[7]!, Agrees: agree.has(item.ciKey), Result: mark?.result ?? '',
        ResultLabel: row[8]!, Note: row[9]!, CheckedBy: row[10]!, CheckedOn: row[11]!, CaseStatus: status, FirstMessage: row[13]!, Reminders: row[14]!, EscalatedOn: row[15]!, EpoDate: systems ? epoDate : ''
      });
    });
  };
  for (const review of reviews.slice().reverse()) add(review, false);
  const draw = drawSample(run.inventory ?? [], run.date, file, config);
  add({ kind: 'lifecycle', id: 'next', date: '', report: file, reportDate: run.date, items: draw }, true);
  return lines.map((line, at) => ({ ...line, Order: at + 1 }));
}
