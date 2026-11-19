import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blankRowQueries, boundTexts, daxLiteral, judge, judgeLook, judgePictures, pageList, queriesOf, queryOf } from '../../../tools/powerbi/desktop.ts';
import type { Pictures, Results, VisualQuery } from '../../../tools/powerbi/desktop.ts';

/*
 * The Desktop check (tools/powerbi/desktop.ts, D309): the DAX query of each visual, and the judge that says what Desktop
 * would show wrong. The engine of Desktop runs only on the Windows job; here the two ends are checked on their own.
 */

const column = (table: string, name: string) => ({ Column: { Expression: { SourceRef: { Entity: table } }, Property: name } });
const measure = (table: string, name: string) => ({ Measure: { Expression: { SourceRef: { Entity: table } }, Property: name } });

test('a literal of a visual filter in DAX', () => {
  assert.equal(daxLiteral("'open'"), '"open"');
  assert.equal(daxLiteral("'it''s'"), `"it's"`);
  assert.equal(daxLiteral('1L'), '1');
  assert.equal(daxLiteral('true'), 'TRUE ()');
});

test('a card asks its measure in one row; a table groups its columns and keeps its filters', () => {
  assert.equal(queryOf([{ role: 'Values', projection: { field: measure('About', 'About line'), queryRef: 'x' } }], []).dax, `EVALUATE ROW ( "v0", 'About'[About line] )`);
  const table = queryOf([
    { role: 'Values', projection: { field: column('Findings', 'CiName'), queryRef: 'a' } },
    { role: 'Values', projection: { field: measure('CaseLines', 'Follow-up'), queryRef: 'b' } }
  ], [{ filter: { From: [{ Name: 'f', Entity: 'Findings' }], Where: [{ Condition: { Not: { Expression: { In: { Expressions: [{ Column: { Expression: { SourceRef: { Source: 'f' } }, Property: 'State' } }], Values: [[{ Literal: { Value: "'open'" } }]] } } } } }] } }]);
  assert.equal(table.dax, `EVALUATE SUMMARIZECOLUMNS ( 'Findings'[CiName], FILTER ( ALL ( 'Findings'[State] ), NOT 'Findings'[State] IN { "open" } ), "v0", 'CaseLines'[Follow-up] )`);
  assert.deepEqual(table.groups, ['CiName']);
});

test('every visual of the report has a query; a drill-through page gets one more per value', () => {
  const queries = queriesOf(new Map([["'Checks'[CardLabel]", ['Description']]]));
  assert.ok(queries.length > 90);
  assert.ok(queries.some((query) => query.pageName === 'card' && query.drill?.value === 'Description'));
  assert.ok(queries.some((query) => query.pageName === 'card' && query.drill?.value === ''));
  for (const query of queries) assert.match(query.dax, /^EVALUATE /);
});

const visual = (type: string, groups: string[], values: string[]): VisualQuery =>
  ({ page: 'My day', pageName: 'myday', visual: 'v', type, title: 'v', groups, values, dax: 'EVALUATE ROW ( "x", 1 )' });

test('the judge finds the faults of 0.44.0: a failing query, "(Blank)" on a card, a blank line', () => {
  const results: Results = {
    opened: true, modelErrors: ['measure History[New]: a syntax error'],
    results: [
      { query: visual('card', [], ['Since line']), error: 'The measure History[Since line] has an error' },
      { query: visual('card', [], ['Card title']), rows: [[null]] },
      { query: visual('tableEx', ['Card'], ['State']), rows: [[null, 'Not tested'], ['Description', 'To solve']] },
      { query: visual('tableEx', ['Card'], ['State']), rows: [['Description', 'To solve']] },
      { query: visual('card', [], ['To solve']), rows: [['3']] },
      { query: visual('card', ['CardLabel'], []), rows: [['Description']] }
    ]
  };
  const { problems } = judge(results);
  assert.equal(problems.length, 4);
  assert.match(problems[0]!, /History\[New\]/);
  assert.match(problems[1]!, /query fails/);
  assert.match(problems[2]!, /\(Blank\)/);
  assert.match(problems[3]!, /every column blank/);
});

test('the judge says when Desktop did not open the project', () => {
  assert.match(judge({ opened: false, openError: 'refresh policy', modelErrors: [], results: [] }).problems[0]!, /did not open/);
});

test('the line under a title and a text a measure writes are asked too, so an empty box never says nothing (D318)', () => {
  const texts = boundTexts({
    visual: {
      visualContainerObjects: { subTitle: [{ properties: { text: { expr: measure('Findings', 'Lines note') } } }], title: [{ properties: { text: { expr: { Literal: { Value: "'Lines'" } } } } }] },
      objects: { text: [{ properties: { text: { expr: measure('About', 'Rail line') } } }] }
    }
  } as never);
  assert.deepEqual(texts.map(([where]) => where), ['subtitle', 'text']);
  const queries = queriesOf(new Map());
  assert.ok(queries.some((query) => query.type === 'text' && query.values[0] === 'Lines note'));
  const { problems } = judge({ opened: true, modelErrors: [], results: [{ query: { ...visual('text', [], ['Lines note']), type: 'text' }, rows: [[null]] }] });
  assert.match(problems[0]!, /the text from .* is blank/);
});

test('the list of the pages: the drill-through pages, Self-check and the parts of Audit are hidden, every page is 1280 wide (D312)', () => {
  const pages = pageList();
  assert.deepEqual(pages.filter((page) => page.hidden).map((page) => page.name).sort(), ['auditexport', 'auditfollow', 'auditrecord', 'auditreview', 'card', 'case', 'person', 'selfcheck']);
  assert.deepEqual(pages.filter((page) => page.drillThrough).map((page) => page.name).sort(), ['card', 'case', 'person']);
  assert.deepEqual(pages.find((page) => page.name === 'card')?.tabs, ['SACM fix list', 'To check', 'Export'], 'the picture step presses each tab after the first');
  for (const page of pages) assert.equal(page.width, 1280, page.name);
});

test('the pictures: a page with no tab, a tab that opened another page, a broken word or a slow page or tab is a problem; a page in time is a note; no list of broken words (PowerShell writes null) is none', () => {
  const pictures: Pictures = {
    taken: true,
    pages: [
      { page: 'myday', displayName: 'My day', found: true, seconds: 1.2, file: '01-myday.png', broken: [], status: 'Page 1 of 6' },
      { page: 'case', displayName: 'Case', found: true, seconds: 1.0, file: '02-case.png', broken: null, status: 'Page 6 of 6' },
      { page: 'cards', displayName: 'Cards', found: false, seconds: null, file: null, broken: [] },
      { page: 'backlog', displayName: 'Backlog', found: true, seconds: 1.0, file: '03-backlog.png', broken: ['(Blank)'] },
      { page: 'history', displayName: 'History', found: true, seconds: 4.5, file: '04-history.png', broken: [], tabs: [{ tab: 'Trend', found: false, file: null }] },
      { page: 'card', displayName: 'Card', found: true, seconds: 1.0, file: '05-card.png', broken: [], tabs: [{ tab: 'Export', found: true, seconds: 3.5, file: '05-card-tab1.png', broken: ['(Blank)'] }] }
    ]
  };
  const notes: string[] = [];
  const problems = judgePictures(pictures, notes);
  assert.equal(problems.length, 7);
  assert.match(problems.join('\n'), /Card, tab Export: the tab shows "\(Blank\)"/);
  assert.match(problems.join('\n'), /Card, tab Export: the tab took 3\.5 s/);
  assert.match(problems.join('\n'), /History: the picture step found no tab "Trend"/);
  assert.match(problems.join('\n'), /Case: the picture shows "Page 6 of 6", not "Page 2 of 6"/);
  assert.match(problems.join('\n'), /Cards/);
  assert.match(problems.join('\n'), /\(Blank\)/);
  assert.match(problems.join('\n'), /History.*4\.5/);
  assert.ok(notes.some((note) => /My day/.test(note)));
  assert.match(judgePictures({ taken: false, why: 'no window', pages: [] })[0]!, /no window/);
});

test('a slicer with a blank value shows a button "(Blank)": the judge finds it', () => {
  const { problems } = judge({ opened: true, modelErrors: [], results: [
    { query: visual('slicer', ['Topic'], []), rows: [[null], ['CI']] },
    { query: visual('slicer', ['Kind'], []), rows: [['Email'], ['Reminder']] }
  ] });
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /slicer shows "\(Blank\)" \(Topic\)/);
});

test('the look of the pages as drawn (D328): low contrast, a cut text; a page not found, with no text or no look is not passed', () => {
  const text = (words: string, ratio: number | null, height = 16) => ({ text: words, x: 240, y: 100, width: 120, height, background: '#ffffff', colour: '#98a2b3', ratio });
  const look = (texts: ReturnType<typeof text>[], canvas = [41, 196, 1316, 740]) => ({ canvas, texts });
  const pictures: Pictures = {
    taken: true,
    pages: [
      { page: 'myday', displayName: 'My day', found: true, seconds: 1, file: '01-myday.png', broken: [], look: look([text('Your next steps', 12.6), text('Waiting since 3 days', 2.4), text('42', 3.2, 36)]) },
      { page: 'people', displayName: 'People', found: true, seconds: 1, file: '02-people.png', broken: [], look: look([text('Owned by Ada Ow…', 9), text('Index Tool - PROD', 9), text('One colour', null)]) },
      { page: 'cards', displayName: 'Cards', found: true, seconds: 1, file: '03-cards.png', broken: [], look: look([], []),
        tabs: [{ tab: 'List', found: true, seconds: 1, file: '03-cards-tab1.png', broken: [], look: look([]) }] },
      { page: 'reports', displayName: 'Reports', found: true, seconds: 1, file: '04-reports.png', broken: [] }
    ]
  };
  const notes: string[] = [];
  const problems = judgeLook(pictures, notes).join('\n');
  assert.match(problems, /My day: "Waiting since 3 days" at 240, 100 has a contrast of 2\.4:1 \(#98a2b3 on #ffffff\), under 4\.5:1/);
  assert.match(problems, /My day: "42" .* 3\.2:1/, 'LOOK rule 8: 4.5:1 for every text, large text too');
  assert.match(problems, /People: "Owned by Ada Ow…".*three dots/);
  assert.doesNotMatch(problems, /PROD/, 'capitals in data are not a problem on a picture');
  assert.match(problems, /Cards: the picture step did not find the page/);
  assert.match(problems, /Cards, tab List: no text of the page was read/);
  assert.match(problems, /Reports: the picture step gave no look/);
  assert.equal(problems.split('\n').length, 6);
  assert.ok(notes.some((note) => /People: 3 texts read \(1 of one colour, not measured\)/.test(note)));
  assert.ok(notes.some((note) => /My day: 3 texts read, the lowest contrast 2\.4:1/.test(note)));
  // The judge runs it with the other checks of the pictures.
  assert.match(judge({ opened: true, modelErrors: [], results: [] }, pictures).problems.join('\n'), /Waiting since 3 days/);
});

test('one query per relationship asks for the values of the many side with no row on the one side (D349)', () => {
  const queries = blankRowQueries();
  assert.ok(queries.length >= 20);
  const inventory = queries.find((query) => query.visual === 'Inventory_Classes')!;
  assert.equal(inventory.dax, "EVALUATE ROW ( \"v0\", COUNTROWS ( EXCEPT ( ALLNOBLANKROW ( 'Inventory'[Class] ), ALLNOBLANKROW ( 'Classes'[Id] ) ) ) + 0 )");
  const { problems } = judge({ opened: true, modelErrors: [], results: [{ query: inventory, rows: [[2]] }, { query: queries[1]!, rows: [[0]] }] });
  assert.equal(problems.length, 1);
  assert.match(problems[0]!, /Relationship Inventory_Classes .*2 values of the many side have no row on the one side/);
});
