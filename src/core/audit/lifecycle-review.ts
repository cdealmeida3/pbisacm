import { screenDate } from '../shared/dates.ts';
import { nameKey } from '../shared/names.ts';
import type { Case, CaseEvent, Fact, Run } from '../cases/cases.ts';
import { mappedOf, reviewConfig } from '../cases/inventory.ts';
import type { InventoryRow, ReviewConfig } from '../cases/inventory.ts';
import type { CheckPack, FixLine, Module, References } from '../model/model.ts';

/**
 * The lifecycle review (Operational Activities Instruction 2.13): twice a year SACM compares the status of a sample of
 * CIs with EPO and keeps an evidence file. Pure. The sample is drawn once, on a button press, and saved in the team
 * folder (data/reviews/); the same press on two computers draws the same CIs, so both write the same bytes. What a
 * manager marks is a journal event, so nobody overwrites a colleague. Nothing here starts on its own.
 */

export const REVIEW_CHECK = 'LIFECYCLE-REVIEW';
export const REVIEW_FOLDER = 'data/reviews';
const FIELD = 'status';

export interface ReviewItem { ciKey: string; name: string; classLabel: string; className: string; status: string; epoId: string; group: 'sample' | 'under-retirement' }

/** A review as saved in data/reviews/. No who and no time: who started it is in the journal. */
export interface Review {
  kind: 'lifecycle';
  /** The file name without ".json": "2026-11-11_lifecycle". The marks in the journals name it. */
  id: string;
  /** The day it was started, and the report the sample was drawn from. */
  date: string;
  report: string;
  reportDate: string;
  items: ReviewItem[];
}

export const reviewId = (date: string): string => `${date}_lifecycle`;
export const reviewPath = (id: string): string => `${REVIEW_FOLDER}/${id}.json`;

export function parseReview(text: string): Review | null {
  try {
    const review = JSON.parse(text) as Review;
    return review && review.kind === 'lifecycle' && typeof review.id === 'string' && Array.isArray(review.items) ? review : null;
  } catch { return null; }
}

/** A number generator that gives the same numbers for the same text, on every computer. */
function seeded(seed: string): () => number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(list: T[], count: number, random: () => number): T[] {
  const pool = list.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.max(0, count));
}

/**
 * Draws the sample of a review from a run: `underRetirement` CIs in the Under retirement status, and `sample` CIs by
 * chance from the other CIs of the classes. The chance comes from the date and the report, so it is the same everywhere.
 * Null when the run keeps no CI list (a report loaded by a version before 0.13).
 */
export function drawReview(run: Pick<Run, 'date' | 'report' | 'inventory'>, date: string, config: ReviewConfig): Review | null {
  if (!run.inventory) return null;
  const random = seeded(`${date}|${run.date}|${run.report}`);
  const rows = run.inventory.filter((row) => config.classes.indexOf(row[3]) >= 0).sort((a, b) => a[0].localeCompare(b[0]));
  const leaving = (row: InventoryRow): boolean => nameKey(row[4]) === nameKey(config.underRetirementStatus);
  const item = (group: ReviewItem['group']) => (row: InventoryRow): ReviewItem => ({ ciKey: row[0], name: row[1], classLabel: row[2], className: row[3], status: row[4], epoId: row[5], group });
  const byName = (a: ReviewItem, b: ReviewItem): number => a.classLabel.localeCompare(b.classLabel) || a.name.localeCompare(b.name) || a.ciKey.localeCompare(b.ciKey);
  const under = pick(rows.filter(leaving), config.underRetirement, random).map(item('under-retirement')).sort(byName);
  const sample = pick(rows.filter((row) => !leaving(row)), config.sample, random).map(item('sample')).sort(byName);
  return { kind: 'lifecycle', id: reviewId(date), date, report: run.report, reportDate: run.date, items: sample.concat(under) };
}

export interface Mark { result: string; note: string; by: string; byName: string; at: string }

/** What the managers marked in one review: the last mark of each CI wins. */
export function marksOf(review: Review, events: CaseEvent[]): Map<string, Mark> {
  const marks = new Map<string, Mark>();
  const own = events.filter((event) => event.type === 'review' && event.ref === review.id && !!event.ciKey && !!event.reason)
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  for (const event of own) marks.set(event.ciKey!, { result: event.reason!, note: event.text ?? '', by: event.by, byName: event.byName || event.by, at: event.at });
  return marks;
}

export function reviewProgress(review: Review, marks: Map<string, Mark>): { checked: number; total: number } {
  return { checked: review.items.filter((item) => marks.has(item.ciKey)).length, total: review.items.length };
}

export const reviewCaseKey = (ciKey: string): string => `${REVIEW_CHECK}:${ciKey}:${FIELD}`;

/** The people of a CI as a run keeps them (see peopleOf in src/app/view/people.ts). */
interface PersonLike { id: string; name: string; email: string; active: boolean | null }
type PeopleLike = Record<string, { owned_by?: PersonLike; managed_by?: PersonLike } | undefined>;

/**
 * The line of the SACM list for a status that is not the same as in EPO (D192): the source is looked at first. Service
 * mapped: SACM copies the status of EPO. Not service mapped: ServiceNow should follow EPO by itself, so it is a fault of the
 * sync. The owner is asked only when EPO itself looks wrong (the button of the check, `playbook.askWhenUnsure`).
 */
export function reviewFix(status: string, mapped: boolean | null): FixLine {
  if (mapped === true) return { change: 'Operational status: copy the status of EPO into ServiceNow (service mapped)', current: status, set: 'The status EPO shows' };
  if (mapped === false) return { change: 'Operational status: the sync did not bring the status of EPO. Raise an incident with the ServiceNow development team', current: status, set: 'The status EPO shows, brought by the sync' };
  return {
    change: 'Operational status: not the same as in EPO. Service mapped: copy the status of EPO. Not service mapped: raise an incident with the ServiceNow development team',
    current: status, set: 'The status EPO shows'
  };
}

/**
 * "Not the same" opens a case. Cases come from the facts of the runs, so the mark is added as a fact to every run from
 * the report of the review on, as long as that run still shows the CI in the status it had in the review. The first
 * report with another status no longer has the fact, and the case is Verified like any other. Returns new runs;
 * the saved run files are not changed.
 */
export function withReviewFacts<R extends Run & { people?: PeopleLike }>(runs: R[], reviews: Review[], events: CaseEvent[], pack: CheckPack | undefined, references: References): R[] {
  const config = reviewConfig(references);
  if (!pack || !config || !reviews.length) return runs;
  // The newest mark of each CI over all reviews decides.
  const latest = new Map<string, { item: ReviewItem; mark: Mark; review: Review }>();
  let checked = 0;
  for (const review of reviews.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    const marks = marksOf(review, events);
    for (const item of review.items) {
      const mark = marks.get(item.ciKey);
      if (!mark) continue;
      checked += 1;
      const before = latest.get(item.ciKey);
      if (!before || before.mark.at <= mark.at) latest.set(item.ciKey, { item, mark, review });
    }
  }
  const from = reviews.map((review) => review.reportDate).sort()[0]!;
  const module = pack.dimension as Module;
  return runs.map((run) => {
    if (!run.inventory || run.date < from) return run;
    const rows = new Map(run.inventory.map((row) => [row[0], row]));
    const facts: Fact[] = [];
    latest.forEach(({ item, mark, review }, ciKey) => {
      const row = rows.get(ciKey);
      if (config.opensCase.indexOf(mark.result) < 0 || run.date < review.reportDate || !row || nameKey(row[4]) !== nameKey(item.status)) return;
      const people = run.people?.[ciKey] ?? {};
      const reachable = (person: PersonLike | undefined): person is PersonLike => !!person && !!person.email && person.active !== false;
      const contact = reachable(people.owned_by) ? { person: people.owned_by, via: 'owned by' } : reachable(people.managed_by) ? { person: people.managed_by, via: 'managed by' } : null;
      const shown = (person: PersonLike | undefined): string => (person ? `${person.name}${person.active === false ? ' (inactive)' : ''}` : '');
      facts.push({
        key: reviewCaseKey(ciKey), checkId: pack.id, ciKey, ciName: row[1], className: row[3], field: FIELD, severity: pack.severity,
        detail: `Status in ServiceNow is ${row[4]}; EPO does not show the same (lifecycle review of ${screenDate(review.date)}, ${mark.byName})${mark.note ? `: ${mark.note}` : ''}`,
        ...(pack.playbook.path === 'sacm-fix' ? { fix: reviewFix(row[4], mappedOf(row)) } : {}),
        classLabel: row[2], module, route: '', state: 'open',
        contactName: contact ? contact.person.name : '', contactEmail: contact ? contact.person.email : '', contactId: contact ? contact.person.id : '', contactVia: contact ? contact.via : '',
        cc: contact && contact.via === 'owned by' && reachable(people.managed_by) && people.managed_by.email.toLowerCase() !== contact.person.email.toLowerCase() ? [people.managed_by.email] : [],
        ci: { epoId: row[5], status: row[4], supportGroup: row[6], ownedBy: shown(people.owned_by), managedBy: shown(people.managed_by) }
      });
    });
    const tested = `${pack.id}:${FIELD}`;
    return {
      ...run, facts: run.facts.filter((fact) => fact.checkId !== pack.id).concat(facts),
      tested: run.tested.indexOf(tested) >= 0 ? run.tested : run.tested.concat([tested]),
      evaluated: { ...(run.evaluated ?? {}), [tested]: checked }
    };
  });
}

export const EVIDENCE_COLUMNS = ['Review', 'Report', 'Part of the sample', 'Name', 'Class', 'EPO ID', 'Status in ServiceNow', 'Status in EPO', 'Result', 'Note', 'Checked by', 'Checked on',
  'Case status', 'First message', 'Reminders', 'Escalated on'] as const;

const GROUP_WORD: Record<ReviewItem['group'], string> = { sample: 'Sample by chance', 'under-retirement': 'Under retirement' };

/**
 * The status in EPO of a CI of the review, from an EPO systems report: "Kørende (Operational)": the word of EPO, then its meaning, or '' when
 * the CI has no EPO ID or the report does not hold it. `systems`: the systems by EPO ID in lower case.
 */
export function epoStatusOf(item: Pick<ReviewItem, 'epoId'>, systems: Map<string, { status: string; statusWord: string }> | null): { status: string; words: string } {
  const system = item.epoId && systems ? systems.get(item.epoId.trim().toLowerCase()) : undefined;
  if (!system) return { status: '', words: '' };
  return { status: system.status, words: system.status ? `${system.statusWord} (${system.status})` : system.statusWord };
}

/** The CIs of a review not marked yet whose status is the same in the EPO systems report: they can be marked "same" in one click. */
export function agreeingWithEpo(review: Review, marks: Map<string, Mark>, systems: Map<string, { status: string; statusWord: string }> | null): ReviewItem[] {
  return review.items.filter((item) => {
    if (marks.has(item.ciKey)) return false;
    const epo = epoStatusOf(item, systems).status;
    return !!epo && nameKey(epo) === nameKey(item.status);
  });
}

/** The rows of the evidence file the instruction asks to keep: the sample, the result per CI, who checked, when, and the follow-up of each case. */
export function evidenceRows(review: Review, marks: Map<string, Mark>, cases: Case[], config: ReviewConfig, systems: Map<string, { status: string; statusWord: string }> | null = null): string[][] {
  const label = (id: string): string => config.results.filter((result) => result.id === id)[0]?.label ?? id;
  const byKey = new Map(cases.map((item) => [item.key, item]));
  return review.items.map((item) => {
    const mark = marks.get(item.ciKey);
    const found = mark && config.opensCase.indexOf(mark.result) >= 0 ? byKey.get(reviewCaseKey(item.ciKey)) : undefined;
    const sent = (found?.messages ?? []).filter((event) => event.at >= (mark?.at ?? ''));
    const dates = (kind: string): string => sent.filter((event) => (event.kind ?? 'first') === kind).map((event) => event.at.slice(0, 10)).join(' ');
    return [
      `Lifecycle review of ${review.date}`, `${review.report} (report of ${review.reportDate})`, GROUP_WORD[item.group], item.name, item.classLabel, item.epoId, item.status, epoStatusOf(item, systems).words,
      mark ? label(mark.result) : 'Not checked yet', mark?.note ?? '', mark?.byName ?? '', mark ? mark.at.slice(0, 10) : '',
      found ? found.status : '', dates('first').split(' ')[0] ?? '', dates('reminder'), dates('escalation')
    ];
  });
}
