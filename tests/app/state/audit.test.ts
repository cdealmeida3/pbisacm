import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptException, addStandingException, endException, previousRun, readHistory } from '../../../src/app/state/audit.ts';
import { currentReview, markReview, startLifecycleReview } from '../../../src/app/state/review.ts';
import { state, today } from '../../../src/app/state/store.ts';
import { toSolve } from '../../../src/app/view/cases.ts';
import { loadTheSamples, nextSecond, openFolder, useRepositoryContent } from './helpers.ts';

/* The audit record and the lifecycle review, with the in-memory folder. */

useRepositoryContent();

test('Not followed up closes the cases until the review date; ending it opens them again', async () => {
  await openFolder();
  await loadTheSamples();
  const item = state.cases.find(toSolve)!;
  await acceptException([item.key], 'Other', '2099-01-01', 'Agreed with the owner');
  assert.equal(state.toast, 'Not followed up until 1 Jan 2099.');
  assert.equal(state.cases.find((other) => other.key === item.key)?.status, 'Not followed up');
  const event = state.events.filter((other) => other.type === 'exception').pop()!;
  await nextSecond();
  await endException(event, item.key);
  assert.notEqual(state.cases.find((other) => other.key === item.key)?.status, 'Not followed up');
});

test('a standing exception is recorded for a CI before any finding', async () => {
  await openFolder();
  await addStandingException('  Some Future CI ', '*', 'Other', '2099-01-01', '');
  const event = state.events.filter((other) => other.type === 'exception').pop()!;
  assert.equal(event.ciName, 'Some Future CI');
  assert.equal(event.checkId, '*');
  assert.deepEqual(event.keys, []);
  assert.equal(state.toast, 'Some Future CI: not followed up until 1 Jan 2099.');
});

test('the audit export reads every run and every journal month', async () => {
  await openFolder();
  await loadTheSamples();
  const history = await readHistory();
  assert.equal(history.runs.length, 1);
  assert.ok(history.events.some((event) => event.type === 'report'));
  assert.deepEqual(history.notes, []);
  assert.equal(previousRun(state.runs[0]!), null);
});

test('the lifecycle review is drawn once and saved; "not the same" opens a case', async () => {
  const workspace = await openFolder();
  assert.equal(await startLifecycleReview(), 'Load a CI report first: the sample is drawn from it.');
  await loadTheSamples();
  assert.equal(await startLifecycleReview(), '');
  const review = currentReview()!;
  assert.ok(review.items.length > 0);
  const saved = await workspace.readText(`data/reviews/${today()}_lifecycle.json`);
  assert.ok(saved.length > 0);
  assert.equal(await startLifecycleReview(), 'A review was already started today. It is shown here.');
  assert.equal(await workspace.readText(`data/reviews/${today()}_lifecycle.json`), saved);
  const first = review.items[0]!;
  await markReview(review, first.ciKey, 'different', 'EPO says Retired');
  assert.ok(state.cases.some((item) => item.fact.checkId === 'LIFECYCLE-REVIEW' && item.fact.ciKey === first.ciKey));
});
