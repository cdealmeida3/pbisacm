import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REQUESTS } from '../../../src/core/messages/messages.ts';
import { settingsLines, setupLeft, setupSteps } from '../../../src/app/view/setup.ts';

/* Settings: the set-up list (F42) and the lines a change writes to Activity (F54). */

const empty = { requests: {}, procurementEmail: '', procurementLeadEmail: '' };
const links = Object.fromEntries(REQUESTS.map((request) => [request.id, { name: request.name, link: `https://example.com/${request.id}` }]));

test('the set-up list ticks a line when its fields are filled', () => {
  const start = setupSteps('folder', [{ email: 'ada@example.com' }], empty);
  assert.deepEqual(start.map((step) => [step.id, step.done]), [['folder', true], ['team', false], ['requests', false], ['procurement', false], ['servicenow', false]]);
  assert.equal(setupLeft(start), '4 steps left');
  assert.equal(start[4]!.note, 'Without it the lines of a SACM list cannot open their record in ServiceNow.');
  assert.equal(start[2]!.note, `0 of ${REQUESTS.length} links pasted. A request without a link points to the Service Portal.`);
  const partly = setupSteps('folder', [{ email: 'ada@example.com' }, { email: 'bo@example.com' }], { requests: { 'owned-by-update': links['owned-by-update']! }, procurementEmail: 'buy@example.com', procurementLeadEmail: '', serviceNowAddress: 'https://contoso.service-now.com' });
  assert.deepEqual(partly.map((step) => step.done), [true, true, false, false, true]);
  assert.equal(partly[2]!.note.startsWith('1 of '), true);
  assert.equal(partly[3]!.note, 'The lead has no email: there is no escalation.');
  const done = setupSteps('folder', [{ email: 'a@example.com' }, { email: 'b@example.com' }], { requests: links, procurementEmail: 'buy@example.com', procurementLeadEmail: 'lead@example.com', serviceNowAddress: 'https://contoso.service-now.com' });
  assert.equal(setupLeft(done), '');
  assert.equal(setupSteps('demo', [], empty)[0]!.done, false);
  assert.equal(setupLeft(setupSteps('folder', [{ email: 'a@example.com' }, { email: 'b@example.com' }], { requests: links, procurementEmail: 'buy@example.com', procurementLeadEmail: '', serviceNowAddress: 'https://contoso.service-now.com' })), '1 step left');
  // An address that is not an https link does not count.
  assert.equal(setupSteps('folder', [], { ...empty, serviceNowAddress: 'contoso.service-now.com' })[4]!.done, false);
});

test('only what changed is recorded, by its label, never by an internal id', () => {
  const before: { reminderDays: number; signature: string; requests: Record<string, { name: string; link: string }> } = { reminderDays: 3, signature: 'SACM team', requests: {} };
  // The first save fills in the names of the requests: that is not a change.
  assert.deepEqual(settingsLines(before, { ...before, requests: Object.fromEntries(REQUESTS.map((request) => [request.id, { name: request.name, link: '' }])) }), []);
  const lines = settingsLines(before, { ...before, reminderDays: 5, requests: { 'owned-by-update': { name: 'Owned by - update', link: 'https://example.com/owner' } } });
  assert.deepEqual(lines, ['Working days before a reminder is due: 3 → 5', 'Link of the request "Owned by - update": (empty) → https://example.com/owner']);
  assert.equal(lines.join(' ').includes('owned-by-update'), false);
  // A name typed in an earlier version goes back to the name of the portal, and that is said once.
  assert.deepEqual(settingsLines({ requests: { criticality: { name: 'My own name', link: '' } } }, { requests: { criticality: { name: 'Criticality - change CIAA values', link: '' } } }),
    ['Name of the request "Criticality - change CIAA values": My own name → Criticality - change CIAA values']);
});

test('a team of reference/record-teams is a line of the set-up list, and a change of its people is one line (D195)', () => {
  const teams = [{ id: 'process-management', name: 'Process Management' }];
  const none = setupSteps('folder', [{ email: 'a@example.com' }], empty, teams);
  assert.deepEqual(none.map((step) => step.id), ['folder', 'team', 'requests', 'procurement', 'servicenow', 'team:process-management']);
  assert.deepEqual([none[5]!.label, none[5]!.done, none[5]!.note], ['The Process Management team has people', false, 'Nobody yet: the messages to Process Management cannot be written.']);
  const two = setupSteps('folder', [{ email: 'a@example.com' }], { ...empty, teams: { 'process-management': { name: 'Process Management', people: [{ name: 'Pat', email: 'pat@example.com' }, { name: 'Quinn', email: 'quinn@example.com' }] } } }, teams);
  assert.deepEqual([two[5]!.done, two[5]!.note], [true, '2 people with an email.']);
  const before = { requests: {}, teams: { 'process-management': { name: 'Process Management', people: [] as Array<{ name: string; email: string }> } } };
  const after = { requests: {}, teams: { 'process-management': { name: 'Process Management', people: [{ name: 'Pat', email: 'pat@example.com' }] } } };
  assert.deepEqual(settingsLines(before, after), ['Process Management team (people): (empty) → Pat (pat@example.com)']);
});

test('the first save of a team that has nobody yet is no change', () => {
  assert.deepEqual(settingsLines({ requests: {} }, { requests: {}, teams: { 'process-management': { name: 'Process Management', people: [] } } }), []);
});
