import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../../../src/core/reading/csv.ts';
import { checksInUse, runChecks } from '../../../src/core/checks/engine.ts';
import { readCiReport } from '../../../src/core/sources/ci/ci-report.ts';
import { buildCases, buildRun } from '../../../src/core/cases/cases.ts';
import { CARD_HINT_MAX } from '../../../src/core/checks/check-files.ts';
import { loadPacks, loadReferences } from '../../../src/hosts/cli.ts';
import { cardSummaries, orderCards, partlyTested, sinceReport, sinceText, topicOf } from '../../../src/app/view/cards.ts';
import type { CardSummary } from '../../../src/app/view/cards.ts';
import { peopleIndex, peopleOf } from '../../../src/app/view/people.ts';
import type { AppRun } from '../../../src/app/view/people.ts';
import { editSample } from '../../helpers.ts';

/* The first screen (version 0.23, D172): the order of the cards, new and solved since the report before, the hints. */

const sample = readFileSync(join(import.meta.dirname, '../../..', 'samples', 'cmdb_ci-sample.csv'), 'utf8');
const packs = loadPacks();
const references = loadReferences();
const rules = { reminderDays: 3, maxReminders: 2 };
const day = (iso: string): string => iso.slice(8, 10) + '.' + iso.slice(5, 7);

function appRun(csv: string, date: string): AppRun {
  const report = readCiReport(parseCsv(csv));
  const run = buildRun(report.cis, runChecks(report.cis, report.columns, packs, references), packs, date, `${date}.csv`, references);
  return { ...run, people: peopleOf(report.cis, run.facts.map((fact) => fact.ciKey)) };
}

test('every check in use has a card hint of one or two sentences, at most 160 characters', () => {
  for (const pack of checksInUse(packs)) {
    assert.ok(pack.cardHint, `${pack.id} needs a cardHint`);
    assert.ok(pack.cardHint.length <= CARD_HINT_MAX, `${pack.id}: cardHint has ${pack.cardHint.length} characters`);
    assert.ok((pack.cardHint.match(/[.!?](\s|$)/g) ?? []).length <= 2, `${pack.id}: cardHint has more than two sentences`);
    if (pack.cardText) assert.ok(pack.cardText.length > pack.cardHint.length, `${pack.id}: cardText is the longer text`);
  }
});

test('the subject of a card comes from the folder of its check file; an unknown folder is a CI', () => {
  assert.deepEqual(['ci', 'relationships', 'epo', 'contracts', 'lifecycle', 'other'].map((folder) => topicOf(folder).word), ['CI', 'Relationship', 'EPO', 'Contract', 'Lifecycle', 'CI']);
});

test('cards inside a section: to solve and biggest first, then to check, waiting, OK, not tested last', () => {
  const card = (id: string, light: CardSummary['light'], open = 0, review = 0, later = false) => ({ id, light, open: new Array(open).fill(null), review: new Array(review).fill(null), later });
  const ordered = orderCards([card('grey', 'grey'), card('ok', 'green'), card('small', 'red', 2), card('marked', 'marked', 50), card('check', 'review', 0, 4), card('big', 'red', 9), card('ok2', 'green'), card('small2', 'red', 2)]);
  assert.deepEqual(ordered.map((item) => item.id), ['big', 'small', 'small2', 'check', 'marked', 'ok', 'ok2', 'grey']);
  // A card to clarify when there is time comes after every daily card of the section, even a big one (D182).
  const withLater = orderCards([card('later', 'red', 300, 0, true), card('grey', 'grey'), card('small', 'red', 2), card('laterOk', 'green', 0, 0, true)]);
  assert.deepEqual(withLater.map((item) => item.id), ['small', 'grey', 'later', 'laterOk']);
});

test('new and solved since the report before: from the two runs, nothing saved', () => {
  const first = appRun(sample, '2026-11-05');
  const solvedFact = first.facts.find((item) => item.checkId === 'RESP-SAME-PERSON' && (item.state ?? 'open') === 'open')!;
  let next = sample;
  for (const [column, value] of [['managed_by', 'Cy Keeper'], ['managed_by.user_name', 'cy01'], ['managed_by.email', 'cy@example.com']]) next = editSample(next, solvedFact.ciName, column!, value!);
  // A new problem: a CI that had a description loses it.
  next = editSample(next, 'Manage Member Records', 'short_description', '');
  const second = appRun(next, '2026-11-12');
  const cases = buildCases([first, second], [], [], '2026-11-12', rules);
  const cards = cardSummaries(packs, second, cases, peopleIndex([first, second]));
  const since = sinceReport([second, first], cards)!;
  assert.equal(since.date, '2026-11-05', 'compared with the report before the newest');
  assert.equal(since.byCheck['RESP-SAME-PERSON']!.solved, 1, 'the CI whose manager is now another person is solved');
  assert.ok(since.byCheck['DESC-QUALITY']!.added >= 1, 'the description that went missing is new');
  assert.equal(since.total.added, Object.values(since.byCheck).reduce((sum, change) => sum + change.added, 0));
  assert.equal(since.total.solved, Object.values(since.byCheck).reduce((sum, change) => sum + change.solved, 0));
  // A check one of the two reports could not test counts nothing.
  assert.equal(since.byCheck['REL-MISSING'], undefined);
  assert.equal(sinceText(since, day), `Since the report of 05.11: ${since.total.added} new, ${since.total.solved} solved.`);
  assert.equal(sinceText({ ...since, total: { added: 0, solved: 0 } }, day), 'Since the report of 05.11: nothing new, nothing solved.');
});

test('the same report twice: nothing new, nothing solved; one report only: no line', () => {
  const first = appRun(sample, '2026-11-05');
  const second = appRun(sample, '2026-11-12');
  const cases = buildCases([first, second], [], [], '2026-11-12', rules);
  const since = sinceReport([first, second], cardSummaries(packs, second, cases, peopleIndex([first, second])))!;
  assert.deepEqual(since.total, { added: 0, solved: 0 });
  assert.equal(sinceReport([first], cardSummaries(packs, first, buildCases([first], [], [], '2026-11-05', rules), peopleIndex([first]))), null);
});

test('"Partly tested" says the first line of its note, and every note on hover', () => {
  assert.equal(partlyTested({ tested: false, notes: ['x'] }), null);
  assert.equal(partlyTested({ tested: true, notes: [] }), null);
  assert.deepEqual(partlyTested({ tested: true, notes: ['No column supported_by.\nMore.', 'Second.'] }), { line: 'No column supported_by.', all: 'Partly tested. No column supported_by.\nMore. Second.' });
});
