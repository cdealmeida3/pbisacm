// The email template of the Power BI report (build D4, D313, D314): tools/powerbi/email.ts, on the invented samples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailsOf, rowsInEmailOf } from '../../../tools/powerbi/email.ts';
import type { EmailDraft } from '../../../tools/powerbi/email.ts';
import { draftRows } from '../../../tools/powerbi/messages.ts';
import { historyKey } from '../../../tools/powerbi/history.ts';
import type { DraftLayout, LayoutSection } from '../../../src/core/messages/messages.ts';

test('the email keeps every word of the draft: each paragraph and heading of Body is in Html', async () => {
  const rows = draftRows(await historyKey());
  assert.ok(rows.length > 0);
  for (const row of rows) {
    if (!row.Html) continue;
    const pieces = [...row.Body.matchAll(/<p>(.*?)<\/p>|<h[23][^>]*>(.*?)<\/h[23]>/g)].map((match) => (match[1] ?? match[2]!).replace(/ \(\d+\)$/, ''))
      // The line of the reference and the signature are written again around the bold reference and name.
      .filter((piece) => !piece.startsWith('When you reply,') && !piece.startsWith('Thank you,'));
    for (const piece of pieces) assert.ok(row.Html.includes(piece), `${row.EmailId}: "${piece.slice(0, 80)}" is not in the email`);
    assert.ok(row.Html.includes('When you reply, please keep the reference <b>[%%REF%%]</b> in the subject.'));
  }
});

test('rowsInEmail: the last row counts; a value that is not a whole number from 1 to 100 is not used', () => {
  assert.equal(rowsInEmailOf([]), 10);
  assert.equal(rowsInEmailOf([{ Title: 'rowsInEmail', Value: '4' }, { Title: 'rowsInEmail', Value: '25' }]), 25);
  for (const value of ['0', '101', '2.5', '-3', 'ten', '']) assert.equal(rowsInEmailOf([{ Title: 'rowsInEmail', Value: value }]), 10, value);
});

const section = (key: string, rows: string[][], extra: Partial<LayoutSection> = {}): LayoutSection => ({
  key, group: '', heading: key, title: key, lead: 'Lead.', role: 'Owned by', contract: false, found: true, rows, ask: 'Ask.', why: 'Why.', ...extra
});
const layout = (sections: LayoutSection[], cis: string[]): DraftLayout => ({
  opening: ['Hi Dee,'], why: 'ServiceNow names you as Owned by of the CIs below.', sections, firstName: 'One', cis, noun: 'CI', sender: 'Demo User', signature: 'SACM team'
});
const ci = (name: string, owner = 'Dee Owner', detail = 'Owned by is empty'): string[] => [name, 'AST-1', 'Business Process', owner, '', 'Operational', '', detail];
const draft = (index: number, count: number, sections: LayoutSection[], cis: string[]): EmailDraft => ({
  kind: 'first', to: 'dee@example.com', subject: `part ${index}`, ciCount: cis.length, part: { index, count }, layout: layout(sections, cis)
});

test('the parts of a long message are one email: its subject counts every CI once, and its parts point to it', () => {
  const drafts = [
    draft(1, 2, [section('A', [ci('One'), ci('Two')]), section('B', [ci('One')])], ['one', 'two']),
    draft(2, 2, [section('B', [ci('Three')]), section('C', [ci('Four')])], ['three', 'four', 'one']),
    draft(1, 1, [section('A', [ci('Five')])], ['five'])
  ];
  const emails = emailsOf(drafts, (at) => `REF-${at}`, 10);
  assert.deepEqual(emails.map((email) => email.first), [0, 0, 2]);
  assert.equal(emails[1]!.html, '');
  assert.equal(emails[0]!.subject, '4 CIs need your attention in the CMDB [REF-0]');
  assert.equal(emails[0]!.summary, '1. A · 2 lines\n2. B · 2 lines\n3. C · 1 line');
  assert.match(emails[0]!.html, /We found 3 kinds of problem\./);
  assert.equal(emails[2]!.subject, 'part 1', 'a message of one part keeps its subject');
  assert.equal(emails[2]!.summary, 'A · 1 line', 'one part has no number');
});

test('a table longer than rowsInEmail is cut, and the email carries every line as a CSV file', () => {
  const rows = Array.from({ length: 5 }, (_, at) => ci(`CI ${at}`, 'Dee Owner', at === 0 ? '=1+2' : 'has "quotes", and a comma'));
  const [email] = emailsOf([draft(1, 1, [section('A', rows)], rows.map((cells) => cells[0]!))], () => 'REF', 3);
  assert.match(email!.html, /and 2 more in the attached file/);
  assert.match(email!.html, /<b>Attached:<\/b> REF\.csv, all 5 CIs/);
  const lines = email!.csv.split('\r\n');
  assert.ok(email!.csv.startsWith('﻿Part,Name,EPO ID,Class,Owned by,Managed by,Status,Support group,What we found\r\n'));
  assert.equal(lines.length, 7, 'the header, five lines and the end');
  assert.ok(lines[1]!.endsWith(",'=1+2"), 'a formula is kept as text');
  assert.ok(lines[2]!.endsWith(',"has ""quotes"", and a comma"'));
  const [short] = emailsOf([draft(1, 1, [section('A', rows)], [])], () => 'REF', 5);
  assert.equal(short!.csv, '', 'a short email has no file');
  assert.doesNotMatch(short!.html, /attached/);
});

test('the person\'s own role, an empty column and a value the same on every line leave the table', () => {
  const rows = [ci('One', 'Dee Owner', 'a'), ci('Two', 'Dee Owner', 'b')];
  rows[1]![6] = 'Core Team';
  const [email] = emailsOf([draft(1, 1, [section('A', rows)], ['one', 'two'])], () => 'REF', 10);
  const header = /<tr class="h">(.*?)<\/tr>/.exec(email!.html)![1]!;
  assert.deepEqual([...header.matchAll(/>([^<]+)<\/th>/g)].map((match) => match[1]), ['Name', 'EPO ID', 'Support group', 'What we found']);
  assert.match(email!.html, /Status: <b[^>]*>Operational<\/b>/);
  assert.doesNotMatch(email!.html, /Owned by: /);
});
