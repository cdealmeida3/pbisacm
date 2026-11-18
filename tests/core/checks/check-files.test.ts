import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCheckFiles, validateRecordTeams } from '../../../src/core/checks/check-files.ts';
import { RULE_OPERATORS } from '../../../src/core/checks/engine.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadPackFiles, loadPacks, loadReferences } from '../../../src/hosts/cli.ts';

/* The check files are validated: a typing mistake in a check file must stop the build, not switch a rule off. */

const references = loadReferences();
const good = (): Record<string, unknown> => JSON.parse(JSON.stringify(loadPacks().find((pack) => pack.id === 'RESP-MISSING'))) as Record<string, unknown>;
const problems = (edit: (pack: Record<string, any>) => void): string[] => {
  const pack = good();
  edit(pack);
  return validateCheckFiles([pack], references);
};

test('every check file of the repository is valid', () => {
  assert.deepEqual(validateCheckFiles(loadPacks(), references), []);
  assert.deepEqual(validateRecordTeams(loadPacks(), references), []);
});

test('a team of reference/record-teams names check files and known classes; an askByTeam names a team (D195)', () => {
  const teams = { ...references, 'reference/record-teams': { teams: [{ id: 'process-management', name: 'Process Management', classes: ['business_process', 'galaxy'], checks: ['RESP-MISSING', 'NO-SUCH-CHECK'] }] } };
  assert.deepEqual(validateRecordTeams(loadPacks(), teams), [
    'reference/record-teams: team process-management names NO-SUCH-CHECK, which is not a check file',
    'reference/record-teams: team process-management names the unknown class galaxy'
  ]);
  const pack = good() as { playbook: { message?: Record<string, unknown> } };
  pack.playbook.message = { subject: 'S', intro: 'I', ask: 'A', why: 'W', askByTeam: { 'no-such-team': 'Ask' } };
  assert.ok(validateCheckFiles([pack], references).some((problem) => /unknown team no-such-team/.test(problem)));
});

test('every check file sits in a folder of its subject', () => {
  for (const file of loadPackFiles()) assert.match(file.path, /^(ci|relationships|epo|contracts|lifecycle)\/[a-z0-9-]+\.json$/, file.path);
});

test('an unknown field is a problem, at every level', () => {
  assert.deepEqual(problems((pack) => { pack.version = 3; }), ['RESP-MISSING: unknown field version']);
  assert.deepEqual(problems((pack) => { pack.playbook.followUpDays = [3, 3]; }), ['RESP-MISSING: unknown field playbook.followUpDays']);
  assert.deepEqual(problems((pack) => { pack.detector.whne = pack.detector.when; }), ['RESP-MISSING: unknown field detector.whne']);
  assert.deepEqual(problems((pack) => { pack.playbook.message.aks = 'x'; }), ['RESP-MISSING: unknown field playbook.message.aks']);
  assert.deepEqual(problems((pack) => { pack.detector.when.fild = 'x'; }), ['RESP-MISSING: unknown field detector.when.fild']);
});

test('a missing field, an unknown status, section or severity is a problem', () => {
  assert.deepEqual(problems((pack) => { delete pack.status; }), ['RESP-MISSING: missing field status']);
  assert.deepEqual(problems((pack) => { pack.status = 'confirmed'; }), ['RESP-MISSING: status must be one of proposed, pilot, live, retired, off']);
  assert.deepEqual(problems((pack) => { pack.dimension = 'quality'; }), ['RESP-MISSING: dimension must be one of completeness, correctness, compliance']);
  assert.deepEqual(problems((pack) => { pack.severity = 'urgent'; }), ['RESP-MISSING: severity must be one of low, medium, high']);
});

test('an unknown rule word, detector, class, request, audience or reference is a problem', () => {
  assert.deepEqual(problems((pack) => { pack.detector.when.op = 'isEmtpy'; }), ['RESP-MISSING: unknown rule word isEmtpy (detector.when.op)']);
  assert.deepEqual(problems((pack) => { pack.scope.classes.push('business_servce'); }), ['RESP-MISSING: unknown class business_servce in scope.classes']);
  assert.deepEqual(problems((pack) => { pack.playbook.message.request = 'owner-update'; }), ['RESP-MISSING: unknown request owner-update (playbook.message.request)']);
  assert.deepEqual(problems((pack) => { pack.playbook.message.ask = 'Raise {request:owner-update}.'; }), ['RESP-MISSING: unknown request owner-update in playbook.message.ask']);
  assert.deepEqual(problems((pack) => { pack.playbook.message.ask = 'Dear {name}'; }), ['RESP-MISSING: unknown placeholder {name} in playbook.message.ask']);
  assert.deepEqual(problems((pack) => { pack.playbook.audience = ['managerOf(owner)']; }), ['RESP-MISSING: unknown entry managerOf(owner) in playbook.audience']);
  assert.deepEqual(problems((pack) => { pack.playbook.path = 'mail'; }), ['RESP-MISSING: playbook.path must be one of email, self-fix, service-request, source-fix, sacm-fix, mapping']);
  assert.deepEqual(problems((pack) => { pack.detector.forEachClasses.suported_by = ['service_instance']; }), ['RESP-MISSING: detector.forEachClasses names suported_by, which is not in detector.forEach']);

  const code = JSON.parse(JSON.stringify(loadPacks().find((pack) => pack.id === 'REL-MISSING'))) as Record<string, any>;
  code.detector.module = 'relationships/mising';
  code.detector.rules.push('bs-ofering');
  code.detector.ref = 'reference/relationship-modell';
  code.status = 'live';
  assert.deepEqual(validateCheckFiles([code], references), [
    'REL-MISSING: unknown detector relationships/mising (detector.module)',
    'REL-MISSING: detector.ref names reference/relationship-modell, which is not a file in checks/reference/'
  ]);
  code.detector.ref = 'reference/relationship-model';
  assert.deepEqual(validateCheckFiles([code], references), [
    'REL-MISSING: unknown detector relationships/mising (detector.module)',
    'REL-MISSING: unknown rule bs-ofering in detector.rules (not in reference/relationship-model)'
  ]);
});

test('a proposed or switched off check may wait for its reference data; a live one may not', () => {
  const tags = JSON.parse(JSON.stringify(loadPacks().find((pack) => pack.id === 'TAG-INVALID'))) as Record<string, any>;
  assert.equal(tags.status, 'off');
  assert.deepEqual(validateCheckFiles([tags], references), []);
  tags.status = 'proposed';
  assert.deepEqual(validateCheckFiles([tags], references), []);
  tags.status = 'live';
  assert.deepEqual(validateCheckFiles([tags], references), ['TAG-INVALID: detector.when.ref names reference/allowed-tags, which is not a file in checks/reference/']);
});

test('askWhenUnsure is a text, on a SACM fix list with a message only', () => {
  const pairs = JSON.parse(JSON.stringify(loadPacks().find((pack) => pack.id === 'REL-ONE-TO-ONE'))) as Record<string, any>;
  assert.deepEqual(validateCheckFiles([pairs], references), []);
  pairs.playbook.askWhenUnsure = '';
  assert.deepEqual(validateCheckFiles([pairs], references), ['REL-ONE-TO-ONE: playbook.askWhenUnsure must be a text (the word of the button)']);
  pairs.playbook.askWhenUnsure = 'Ask the owner';
  pairs.playbook.path = 'self-fix';
  assert.deepEqual(validateCheckFiles([pairs], references), ['REL-ONE-TO-ONE: playbook.askWhenUnsure is for a SACM fix list (path "sacm-fix") with playbook.message: the owner is asked with it']);
});

test('two checks with the same id are a problem', () => {
  assert.deepEqual(validateCheckFiles([good(), good()], references), ['RESP-MISSING: the id is used by another check']);
});

test('the engine knows every rule word the validator allows, and no other', () => {
  const engine = readFileSync(join(import.meta.dirname, '../../..', 'src', 'core', 'checks', 'engine.ts'), 'utf8');
  const handled = [...engine.matchAll(/^\s*case '(\w+)':/gm)].map((match) => match[1]!).sort();
  assert.deepEqual(handled, [...RULE_OPERATORS].sort());
});

test('no text of a check file names who decided and when, like "(Name, 11 Nov 2026)": that is in docs/DECISIONS.md (F16)', () => {
  const named = /[A-Z][a-z]+,? \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{4}/;
  for (const file of loadPackFiles()) assert.doesNotMatch(JSON.stringify(file.pack), named, file.path);
  const folder = join(import.meta.dirname, '../../../checks/reference');
  for (const name of readdirSync(folder).filter((file) => file.endsWith('.json'))) assert.doesNotMatch(readFileSync(join(folder, name), 'utf8'), named, name);
});
