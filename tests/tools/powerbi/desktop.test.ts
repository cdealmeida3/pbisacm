import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundTexts, daxLiteral, judge, judgePictures, pageList, queriesOf, queryOf } from '../../../tools/powerbi/desktop.ts';
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
