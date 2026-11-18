import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canMarkProcessMissing, mappingConfig, processMissing, stageOf, stagesFor, toldKey, toldOn } from '../../../src/core/mapping/backlog.ts';
import { loadReferences } from '../../../src/hosts/cli.ts';
import type { CaseEvent } from '../../../src/core/cases/cases.ts';

/* Invented data only. The stages of a mapping case and the mark "The process does not exist" (D201, D203). */

const config = mappingConfig(loadReferences())!;
const KEY = 'MAPPING:lonely - prod:mapping';
const event = (id: string, type: CaseEvent['type'], text: string, keys = [KEY]): CaseEvent =>
  ({ id, at: `2026-11-1${id}T09:00:00Z`, by: 'ana@example.com', byName: 'Ana', type, keys, text });

test('each class goes through its own stages, with its own words', () => {
  assert.deepEqual(stagesFor(config, 'service_instance').map((stage) => stage.label), ['To plan', 'Session held', 'Classified', 'Application linked', 'Process linked']);
  assert.deepEqual(stagesFor(config, 'business_service').map((stage) => stage.label), ['To plan', 'Session held', 'Process linked']);
  assert.deepEqual(stagesFor(config, 'business_process').map((stage) => stage.label), ['To plan', 'Session held', 'Applications linked']);
  assert.equal(mappingConfig({}), null);
});

test('the stage of a case is the last stage set for its class, else the first', () => {
  assert.deepEqual([stageOf([], config, 'service_instance').stage.id, stageOf([], config, 'service_instance').at], ['to-plan', '']);
  const timeline = [event('1', 'stage', 'session-held'), event('2', 'stage', 'classified'), event('3', 'note', 'call back')];
  const found = stageOf(timeline, config, 'service_instance');
  assert.deepEqual([found.stage.id, found.index, found.byName], ['classified', 2, 'Ana']);
  // A stage another class does not have is ignored.
  assert.equal(stageOf(timeline, config, 'business_service').stage.id, 'session-held');
  // Any order: a step back is allowed.
  assert.equal(stageOf(timeline.concat([event('4', 'stage', 'to-plan')]), config, 'service_instance').stage.id, 'to-plan');
});

test('the process does not exist: the mark, who can carry it, and when Process Management was told', () => {
  assert.equal(canMarkProcessMissing(config, 'business_service', ['bs-business-process']), true);
  assert.equal(canMarkProcessMissing(config, 'business_application', ['tagged-to-delete']), false);
  assert.equal(canMarkProcessMissing(config, 'service_instance', ['si-business-application']), false);
  assert.equal(processMissing([event('1', 'no-process', 'yes')]), true);
  assert.equal(processMissing([event('1', 'no-process', 'yes'), event('2', 'no-process', 'no')]), false);
  assert.equal(toldKey(KEY), 'MAPPING:lonely - prod:no-process');
  const told = { ...event('3', 'message', ''), keys: [toldKey(KEY)] };
  assert.equal(toldOn([told, event('2', 'message', '')], KEY), '2026-11-13');
  assert.equal(toldOn([event('2', 'message', '')], KEY), '');
});
