import { MODULES, isContractKey } from '../../core/model/model.ts';
import { datesInText } from '../../core/shared/dates.ts';
import { isClosed } from './cases.ts';
import { askable, handedToOwner, isFixList } from './fix-list.ts';
import { checksInUse } from '../../core/checks/engine.ts';
import { ownerGroups } from './groups.ts';
import { SHOWN_ROLES } from './people.ts';
import { checkedIn, isDaily } from '../../core/cases/cases.ts';
import type { Case, Run } from '../../core/cases/cases.ts';
import type { CheckPack, Module } from '../../core/model/model.ts';
import type { Light } from './cases.ts';
import type { CiPeople } from './people.ts';

/**
 * One card per check pack on the overview: its kind, its light (red, green, grey, review, marked) and its counts.
 * Grey when the latest report could not test the check: never green.
 */

export interface CardSummary {
  pack: CheckPack;
  id: string;
  label: string;
  module: Module;
  light: Light;
  /** The latest report could test this check (at least in part). */
  tested: boolean;
  /** What could not be tested, from the notes of the latest report. */
  notes: string[];
  cases: Case[];
  /** To solve: these turn the card red. */
  open: Case[];
  /** Listed for a review only (allowed): neutral, never red. */
  review: Case[];
  /** The CI is not live yet. */
  waiting: Case[];
  /** A tag of the team explains it. */
  known: Case[];
  /** The cases of the main list: to solve (to review on a review card), and the closed ones. */
  main: Case[];
  /** Distinct CIs to solve (to review on a review card). */
  cis: number;
  waitingCis: number;
  knownCis: number;
  /** On a card that is not a review card: distinct CIs listed for a review only (a rule not agreed, a change to confirm first). */
  reviewCis?: number;
  people: number;
  contacted: number;
  due: number;
  answered: number;
  verified: number;
  /** Owner groups with open work that nobody has taken (version 0.11). 0 on a fix list that asks nobody. */
  untaken: number;
  /** `priority: "later"` (D182): to clarify when there is time. Drawn calmer, after the daily cards, not in the red number. */
  later: boolean;
}

/**
 * What a card is, so it is drawn as the work it asks for (D167). From fields the check files already have:
 *   mailbox  the audience is the Procurement mailbox: one message for the whole card;
 *   review   `reviewOnly`: lines to look at, nothing to fix or to mark;
 *   fix      `playbook.path` is "sacm-fix": changes SACM makes itself in ServiceNow;
 *   mapping  `playbook.path` is "mapping": the mapping backlog, one case per CI with its stage (D200);
 *   owners   everything else: people are asked, by owner.
 */
export type CardKind = 'owners' | 'fix' | 'review' | 'mailbox' | 'mapping';

export function cardKind(pack: Pick<CheckPack, 'reviewOnly' | 'playbook'>): CardKind {
  if (pack.playbook.audience.indexOf('procurement') >= 0) return 'mailbox';
  if (pack.playbook.path === 'mapping') return 'mapping';
  if (pack.reviewOnly === true) return 'review';
  return isFixList(pack as CheckPack) ? 'fix' : 'owners';
}

/** The lines of a fix list that are to fix (not handed to the owner), and how many of them are marked as fixed. */
export function fixProgress(card: Pick<CardSummary, 'pack' | 'open'>): { lines: number; marked: number } {
  const lines = card.open.filter((item) => !handedToOwner(card.pack, item));
  return { lines: lines.length, marked: lines.filter((item) => item.status === 'Fixed').length };
}

/**
 * How many CIs (or contracts) the latest report tested for a check: the biggest number over its parts. Null when the run
 * does not say (a run saved by a very old version).
 */
export function testedOn(pack: Pick<CheckPack, 'id'>, run: Pick<Run, 'evaluated'> | undefined): number | null {
  const counts = Object.keys(run?.evaluated ?? {}).filter((entry) => entry.split(':')[0] === pack.id).map((entry) => run!.evaluated![entry]!);
  return counts.length ? Math.max(...counts) : null;
}

const distinct = (values: string[]): number => new Set(values.filter(Boolean)).size;

/** People named on a CI: the three roles, and who the case goes to. */
function peopleIdsOf(item: Case, people: Map<string, CiPeople>): string[] {
  const roles = people.get(item.fact.ciKey) ?? {};
  return [...SHOWN_ROLES.map((role) => roles[role]?.id ?? ''), item.fact.contactId || item.fact.contactEmail.toLowerCase()];
}

/**
 * One card per check pack, in pack order, with its light. Grey when the latest report could not test the check: never green.
 * `relationships` is the number of relationships of the loaded Relationship report, if any: the relationship cards say so.
 */
export function cardSummaries(packs: CheckPack[], latest: Run | undefined, cases: Case[], people: Map<string, CiPeople>, relationships?: number, epoSystems?: number, contractFiles = false): CardSummary[] {
  // A check that is switched off has no card.
  return checksInUse(packs).map((pack) => {
    const own = cases.filter((item) => item.fact.checkId === pack.id);
    const live = own.filter((item) => !isClosed(item));
    const open = live.filter((item) => item.state === 'open');
    const review = live.filter((item) => item.state === 'review');
    const waiting = live.filter((item) => item.state === 'waiting');
    const known = live.filter((item) => item.state === 'known');
    const shown = open.length ? open : review;
    const tested = !!latest && latest.tested.some((entry) => entry.split(':')[0] === pack.id);
    let notes = latest ? latest.notes.filter((note) => note.split(':')[0] === pack.id).map((note) => datesInText(note.slice(pack.id.length + 1).trim())) : [];
    if (!tested && pack.family === 'relationships' && relationships !== undefined && notes.some((note) => /no Relationship report/.test(note))) {
      notes = [`A Relationship report is loaded (${relationships.toLocaleString('en-GB')} relationships), but after this CI report. Press Check again under Reports.`];
    }
    if (!tested && pack.family === 'epo-report' && epoSystems !== undefined && notes.some((note) => /no EPO systems report/.test(note))) {
      notes = [`An EPO systems report is loaded (${epoSystems.toLocaleString('en-GB')} systems), but after this CI report. Press Check again under Reports.`];
    }
    if (!tested && pack.family === 'contracts' && contractFiles && notes.some((note) => /no Solusi contract file|no ServiceNow contract report/.test(note))) {
      notes = ['The Solusi contract file and the ServiceNow contract report are loaded, but after this CI report. Press Check again under Reports.'];
    }
    if (!tested && pack.detector.type === 'manual') notes = ['No lifecycle review yet. A manager starts one on the Audit page, under Lifecycle.'];
    const module = ((MODULES as readonly string[]).indexOf(pack.dimension) >= 0 ? pack.dimension : 'correctness') as Module;
    // A fix list with every line marked as fixed waits for the next report (D168): still to solve, in the waiting colour.
    const progress = cardKind(pack) === 'fix' ? fixProgress({ pack, open }) : { lines: 0, marked: 0 };
    const allMarked = progress.lines > 0 && progress.lines === open.length && progress.marked === progress.lines;
    return {
      pack, id: pack.id, label: pack.cardLabel || pack.title, module,
      light: !tested ? 'grey' : open.length ? (allMarked ? 'marked' : 'red') : review.length ? 'review' : 'green',
      tested, notes, cases: own, open, review, waiting, known,
      // A review card lists its review items in the main list; on other cards they are a list of their own.
      main: own.filter((item) => isClosed(item) || item.state === 'open' || (pack.reviewOnly === true && item.state === 'review')),
      cis: distinct(shown.map((item) => item.fact.ciKey)),
      waitingCis: distinct(waiting.map((item) => item.fact.ciKey)),
      knownCis: distinct(known.map((item) => item.fact.ciKey)),
      reviewCis: pack.reviewOnly ? 0 : distinct(review.map((item) => item.fact.ciKey)),
      people: distinct(([] as string[]).concat(...shown.map((item) => peopleIdsOf(item, people)))),
      contacted: distinct(open.filter((item) => item.messages.length > 0).map((item) => item.fact.ciKey)),
      due: distinct(open.filter((item) => item.reminderDue || item.overLimit).map((item) => item.fact.ciKey)),
      answered: distinct(open.filter((item) => item.status === 'Answered').map((item) => item.fact.ciKey)),
      verified: distinct(own.filter((item) => item.status === 'Verified').map((item) => item.fact.ciKey)),
      untaken: isFixList(pack) && !pack.playbook.message ? 0 : ownerGroups(shown.filter((item) => askable(pack, item)), people).filter((group) => group.open.length && group.open.every((item) => !item.assignedTo)).length,
      later: !isDaily(pack)
    };
  });
}

/**
 * One meaning for each number (F10): a finding to solve is a case to solve on a red card. The CI report tile, the load
 * message and the section headers all count them here, so their numbers always add up.
 */
/** A card with findings to solve: red, or a fix list that waits for the next report (`marked`). */
export const isToSolve = (card: Pick<CardSummary, 'light'>): boolean => card.light === 'red' || card.light === 'marked';

/** A card of the daily work with findings to solve: what the red number counts (D182). */
export const isDailyToSolve = (card: Pick<CardSummary, 'light' | 'later'>): boolean => isToSolve(card) && !card.later;

/** `redCards` and `findings` count the daily cards only (D182); the cards to clarify when there is time are counted apart. */
export interface CardTotals { redCards: number; findings: number; laterCards: number; laterFindings: number; greyCards: number; waiting: number; known: number; review: number }

export function cardTotals(cards: CardSummary[]): CardTotals {
  // A fix list where everything is marked as fixed still counts as to solve (D59, D168).
  const red = cards.filter(isDailyToSolve);
  const later = cards.filter((card) => isToSolve(card) && card.later);
  const sum = (list: CardSummary[], part: (card: CardSummary) => number): number => list.reduce((total, card) => total + part(card), 0);
  return {
    redCards: red.length, findings: sum(red, (card) => card.open.length), laterCards: later.length, laterFindings: sum(later, (card) => card.open.length),
    greyCards: cards.filter((card) => card.light === 'grey').length,
    waiting: sum(cards, (card) => card.waiting.length), known: sum(cards, (card) => card.known.length), review: sum(cards, (card) => card.review.length)
  };
}

const count = (value: number, word: string, many = `${word}s`): string => `${value.toLocaleString('en-GB')} ${value === 1 ? word : many}`;

/** The words of a card to clarify when there is time (D182; shorter since version 0.30, D218). */
export const LATER_WORDS = 'When there is time';

/** "63 findings to solve": the daily work, the words of the CI report tile and of the load message. */
export const findingsText = (totals: CardTotals): string => `${count(totals.findings, 'finding')} to solve`;

/** "12 to clarify when there is time": the findings of the cards with `priority: "later"`. '' when none. */
export const laterText = (totals: CardTotals): string => (totals.laterFindings ? `${totals.laterFindings.toLocaleString('en-GB')} to clarify when there is time` : '');

/** "15 waiting · 3 known · 2 to check": what is listed but not to solve. '' when nothing. */
export const notToSolveText = (totals: CardTotals): string =>
  [totals.waiting ? `${totals.waiting.toLocaleString('en-GB')} waiting` : '', totals.known ? `${totals.known.toLocaleString('en-GB')} known` : '', totals.review ? `${totals.review.toLocaleString('en-GB')} to check` : ''].filter(Boolean).join(' · ');

/**
 * The header of a section (version 0.30, D219): how many cards are in each state, "3 to solve · 1 to check · 1 marked
 * fixed · 1 when there is time · 2 not tested". No count of findings: the cards say their own numbers. "All OK" only when
 * every card of the section was tested and none is to solve or to check.
 */
export function sectionText(cards: CardSummary[]): { text: string; tone: 'red' | 'grey' | 'green' } {
  const daily = cards.filter((card) => !(card.later && isToSolve(card)));
  const of = (light: Light): number => daily.filter((card) => card.light === light).length;
  const later = cards.length - daily.length;
  const parts = [
    of('red') ? `${of('red')} to solve` : '', of('review') ? `${of('review')} to check` : '', of('marked') ? `${of('marked')} marked fixed` : '',
    later ? `${later} when there is time` : '', of('grey') ? `${of('grey')} not tested` : ''
  ].filter(Boolean);
  return parts.length ? { text: parts.join(' · '), tone: of('red') ? 'red' : 'grey' } : { text: 'All OK', tone: 'green' };
}

/** What a card counts: CIs, or contracts on a contract card. */
export const subjectWord = (pack: Pick<CheckPack, 'subject'> | undefined, count = 2): string =>
  (pack?.subject === 'contract' ? (count === 1 ? 'contract' : 'contracts') : count === 1 ? 'CI' : 'CIs');

/** "5 to check · 12 known · 30 waiting": what a card holds besides the cases to solve. '' when nothing. */
export function asideText(card: Pick<CardSummary, 'knownCis' | 'waitingCis' | 'reviewCis'>, withReview = true): string {
  return [withReview && card.reviewCis ? `${card.reviewCis} to check` : '', card.knownCis ? `${card.knownCis} known` : '', card.waitingCis ? `${card.waitingCis} waiting` : ''].filter(Boolean).join(' · ');
}

/**
 * What a card is about, from the folder of its check file: CI, Relationship, EPO, Contract, Lifecycle. The overview shows
 * it as a small word and filters on it. A folder this list does not know is shown as CI.
 */
export const TOPICS = [
  { id: 'ci', folder: 'ci', word: 'CI', filter: 'CIs' },
  { id: 'relationship', folder: 'relationships', word: 'Relationship', filter: 'Relationships' },
  { id: 'epo', folder: 'epo', word: 'EPO', filter: 'EPO' },
  { id: 'contract', folder: 'contracts', word: 'Contract', filter: 'Contracts' },
  { id: 'lifecycle', folder: 'lifecycle', word: 'Lifecycle', filter: 'Lifecycle' }
] as const;
export type Topic = (typeof TOPICS)[number]['id'];

export const topicOf = (folder: string): (typeof TOPICS)[number] => TOPICS.filter((topic) => topic.folder === folder)[0] ?? TOPICS[0];

/**
 * The order of the cards inside a section (D172): to solve first, the biggest first; then to check and to review; then the
 * fix lists where every line is marked (they wait for the next report); then OK; not tested last. The cards to clarify
 * when there is time come after all daily cards of the section, in the same order (D182). Equal cards keep the order of
 * the check files. The check files hold no order.
 */
export function orderCards<T extends Pick<CardSummary, 'light' | 'open' | 'review' | 'later'>>(cards: T[]): T[] {
  const rank: Record<Light, number> = { red: 0, review: 1, marked: 2, green: 3, grey: 4 };
  const size = (card: T): number => (card.light === 'review' ? card.review.length : card.light === 'green' || card.light === 'grey' ? 0 : card.open.length);
  return cards.map((card, index) => ({ card, index }))
    .sort((a, b) => Number(a.card.later) - Number(b.card.later) || rank[a.card.light] - rank[b.card.light] || size(b.card) - size(a.card) || a.index - b.index)
    .map((entry) => entry.card);
}

/** New and solved since the report before, for one card or for all. */
export interface Change { added: number; solved: number }
export interface SinceReport { date: string; total: Change; byCheck: Record<string, Change> }

type RunFacts = Pick<Run, 'date' | 'report' | 'facts' | 'tested'> & Pick<Run, 'ciKeys' | 'parked'>;
const testedCheck = (run: RunFacts, id: string): boolean => run.tested.some((entry) => entry.split(':')[0] === id);
const isOpenFact = (fact: Run['facts'][number]): boolean => (fact.state ?? 'open') === 'open';

/**
 * What changed since the CI report before the newest one (D172), read from the runs the folder already keeps:
 *   new     a finding to solve now that was not to solve in the report before;
 *   solved  a finding to solve in the report before that the newest report tested, on a CI it holds, and no longer shows.
 * A check that one of the two reports could not test counts nothing, so loading a new kind of report shows no "new".
 * Null when there is no report before.
 */
export function sinceReport(runs: RunFacts[], cards: Array<Pick<CardSummary, 'id' | 'tested' | 'open'>>): SinceReport | null {
  const ordered = runs.slice().sort((a, b) => a.date.localeCompare(b.date) || a.report.localeCompare(b.report));
  const latest = ordered[ordered.length - 1];
  const before = ordered[ordered.length - 2];
  if (!latest || !before) return null;
  const openBefore = new Set(before.facts.filter(isOpenFact).map((fact) => fact.key));
  const now = new Set(latest.facts.map((fact) => fact.key));
  // A CI the newest report parks (D179) is not checked: its finding of the report before is not solved.
  const latestCis = checkedIn(latest);
  const total: Change = { added: 0, solved: 0 };
  const byCheck: Record<string, Change> = {};
  for (const card of cards) {
    if (!card.tested || !testedCheck(latest, card.id) || !testedCheck(before, card.id)) continue;
    const added = card.open.filter((item) => item.inLatest && !openBefore.has(item.key)).length;
    const solved = before.facts.filter((fact) => fact.checkId === card.id && isOpenFact(fact) && !now.has(fact.key)
      && latest.tested.indexOf(`${fact.checkId}:${fact.field}`) >= 0 && (!latestCis || latestCis.has(fact) || isContractKey(fact.ciKey))).length;
    byCheck[card.id] = { added, solved };
    total.added += added;
    total.solved += solved;
  }
  return { date: before.date, total, byCheck };
}

/** "Since the report of 5 Nov: 31 new, 54 solved." */
export function sinceText(since: SinceReport, shortDate: (iso: string) => string): string {
  const { added, solved } = since.total;
  return `Since the report of ${shortDate(since.date)}: ${added ? `${added.toLocaleString('en-GB')} new` : 'nothing new'}, ${solved ? `${solved.toLocaleString('en-GB')} solved` : 'nothing solved'}.`;
}

/** The words under "Partly tested": the first line of the first note, and all the notes for the hover text. */
export function partlyTested(card: Pick<CardSummary, 'tested' | 'notes'>): { line: string; all: string } | null {
  if (!card.tested || !card.notes.length) return null;
  return { line: card.notes[0]!.split('\n')[0]!, all: `Partly tested. ${card.notes.join(' ')}` };
}

/**
 * What a card or a line of the first screen shows besides its name and state (version 0.30, D220): the one number with its
 * word, and at most one more fact. The fact, in this order: new since the report before, partly tested, reminders due,
 * answers, the lines marked on a SACM list, groups nobody has taken, not asked yet. The long hint is a tooltip.
 */
export interface CardLine {
  /** The one number; null when the card has nothing to count (OK, not tested). */
  count: number | null;
  /** The word after the number, or the words without a number ("Nothing to do"). */
  unit: string;
  fact: string;
  /** How the fact is drawn: a small red counter (new), the grey chip (partly tested), or plain grey words. */
  factKind: 'new' | 'partly' | 'plain' | '';
}

export function cardLine(card: CardSummary, change?: Change): CardLine {
  const kind = cardKind(card.pack);
  const lines = (value: number): string => (value === 1 ? 'line' : 'lines');
  const word = (value: number): string => subjectWord(card.pack, value);
  const progress = kind === 'fix' ? fixProgress(card) : { lines: 0, marked: 0 };
  let count: number | null = null;
  let unit = '';
  if (card.light === 'green') unit = 'Nothing to do';
  else if (card.light === 'grey') { if (card.open.length) { count = card.cis; unit = word(card.cis); } }
  else if (card.light === 'review') { count = kind === 'review' ? card.review.length : card.cis; unit = kind === 'review' ? lines(count) : word(count); }
  else if (kind === 'fix') { count = card.open.length; unit = lines(count); }
  else { count = card.cis; unit = word(count); }
  const marked = card.pack.playbook.markWord ?? 'fixed';
  const partly = partlyTested(card);
  const facts: Array<[string, CardLine['factKind']]> = [
    [change && change.added > 0 ? `+${change.added.toLocaleString('en-GB')} new` : '', 'new'],
    [partly ? 'Partly tested' : '', 'partly'],
    [kind !== 'fix' && card.due ? `${card.due} ${card.due === 1 ? 'reminder' : 'reminders'}` : '', 'plain'],
    [kind !== 'fix' && card.answered ? `${card.answered} answered` : '', 'plain'],
    [kind === 'fix' && progress.marked > 0 && progress.marked < progress.lines ? `${progress.marked} of ${progress.lines.toLocaleString('en-GB')} marked as ${marked}` : '', 'plain'],
    [(kind === 'owners' || kind === 'mapping') && card.light === 'red' && card.untaken ? `${card.untaken} free` : '', 'plain'],
    [kind === 'mailbox' && card.light === 'red' && !card.contacted ? 'Not asked yet' : '', 'plain']
  ];
  const [fact, factKind] = facts.filter(([text]) => text)[0] ?? ['', ''];
  return { count, unit, fact, factKind };
}
