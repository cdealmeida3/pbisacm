import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixPlaceNotes, fixedInEpo, offeringOrigin } from '../../../src/core/cases/fix-place.ts';
import { loadReferences } from '../../../src/hosts/cli.ts';
import type { Ci } from '../../../src/core/model/model.ts';

/* Where a fix is made (D122, D123), on invented CIs. */

const references = loadReferences();
const ci = (className: string, createdBy?: string): Ci => ({ className, ...(createdBy === undefined ? {} : { createdBy }) }) as unknown as Ci;

test('an offering is from EPO when Created by is not a person\'s 3-character user ID', () => {
  assert.equal(offeringOrigin(ci('service_offering', 'epo.sync'), references), 'epo');
  assert.equal(offeringOrigin(ci('service_offering', 'a1b2c3d4-0000-4000-8000-000000000000'), references), 'epo');
  assert.equal(offeringOrigin(ci('service_offering', 'ab1'), references), 'person');
  // Empty, or no column: made by a person, so fixed in ServiceNow.
  assert.equal(offeringOrigin(ci('service_offering', ''), references), 'person');
  assert.equal(offeringOrigin(ci('service_offering'), references), 'person');
  assert.equal(offeringOrigin(ci('business_service', 'epo.sync'), references), '');
});

test('fixed in EPO: Business Service, Service Instance and offerings from EPO; nothing else', () => {
  assert.equal(fixedInEpo(ci('business_service', 'ab1'), references), true);
  assert.equal(fixedInEpo(ci('service_instance'), references), true);
  assert.equal(fixedInEpo(ci('service_offering', 'epo.sync'), references), true);
  assert.equal(fixedInEpo(ci('service_offering', 'ab1'), references), false);
  assert.equal(fixedInEpo(ci('business_application', 'epo.sync'), references), false);
  // Without the reference file nothing goes to EPO, and the run says so.
  assert.equal(fixedInEpo(ci('business_service'), {}), false);
  assert.match(fixPlaceNotes([], {})[0]!, /reference data missing/);
});

test('a note only when offerings have no Created by column', () => {
  assert.deepEqual(fixPlaceNotes([ci('service_offering', 'ab1'), ci('business_service')], references), []);
  assert.match(fixPlaceNotes([ci('service_offering'), ci('service_offering')], references)[0]!, /so 2 Service Offerings count as made by a person/);
});
