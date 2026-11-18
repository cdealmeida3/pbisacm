import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordSearch, serviceNowAddress } from '../../../src/core/cases/record-search.ts';

/* The search in ServiceNow for the record of a line of a SACM list (D244), on invented names and an invented instance. */

const address = 'https://contoso.service-now.com';
const query = (link: string): string => decodeURIComponent(link.split('sysparm_query=')[1] ?? '');

test('the address keeps "https://" and the host only, and refuses anything else', () => {
  assert.equal(serviceNowAddress(' https://Contoso.service-now.com/now/nav/ui/home '), address);
  assert.equal(serviceNowAddress('https://contoso.service-now.com'), address);
  assert.equal(serviceNowAddress('https://contoso.service-now.com?id=x'), address);
  assert.equal(serviceNowAddress('http://contoso.service-now.com'), '');
  assert.equal(serviceNowAddress('contoso.service-now.com'), '');
  assert.equal(serviceNowAddress(''), '');
});

test('without an address there is no link', () => {
  assert.equal(recordSearch('', { ciName: 'Fines Hub - PROD', className: 'service_instance' }), '');
});

test('a CI is searched in the CI table by its exact name', () => {
  const link = recordSearch(address, { ciName: 'Fines  Hub - PROD', className: 'service_instance' });
  assert.ok(link.startsWith(`${address}/cmdb_ci_list.do?sysparm_query=`));
  assert.equal(query(link), 'name=Fines  Hub - PROD');
});

test('a fix on relationships opens the rows between the two CIs, in both directions', () => {
  const link = recordSearch(address, { ciName: 'Members', className: 'business_service', fix: { change: 'x', current: '', set: 'Keep one', relatedTo: 'Members - Standard' } });
  assert.ok(link.startsWith(`${address}/cmdb_rel_ci_list.do?`));
  assert.equal(query(link), 'parent.name=Members^child.name=Members - Standard^NQparent.name=Members - Standard^child.name=Members');
});

test('a contract is searched by its Solusi number, as Vendor contract or Number', () => {
  const link = recordSearch(address, { ciName: 'CT000002: Example Consulting - framework agreement', className: 'contract', ci: { contract: { number: 'CT000002' } } });
  assert.ok(link.startsWith(`${address}/ast_contract_list.do?`));
  assert.equal(query(link), 'vendor_contract=CT000002^ORnumber=CT000002');
  // A run without the contract part: the number is the start of the name.
  assert.equal(query(recordSearch(address, { ciName: 'CT000003: Example Data', className: 'contract' })), 'vendor_contract=CT000003^ORnumber=CT000003');
});
