import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daxLiteral, judge, queriesOf, queryOf } from '../../../tools/powerbi/desktop.ts';
import type { Results, VisualQuery } from '../../../tools/powerbi/desktop.ts';

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
  const queries = queriesOf(new Map([["'Checks'[CheckId]", ['DESC-QUALITY']]]));
  assert.ok(queries.length > 90);
  assert.ok(queries.some((query) => query.pageName === 'card' && query.drill?.value === 'DESC-QUALITY'));
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
      { query: visual('card', [], ['To solve']), rows: [['3']] }
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
