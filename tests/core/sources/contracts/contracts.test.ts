import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../../../../src/core/reading/csv.ts';
import { buildCases, buildRun, stateOf } from '../../../../src/core/cases/cases.ts';
import { runChecks } from '../../../../src/core/checks/engine.ts';
import { CONTRACT_CLASS, compareContracts, contractConfig, contractKey, readContractReport, readSolusiFile, statusTagOf } from '../../../../src/core/sources/contracts/contract-reports.ts';
import { PROCUREMENT, isContractKey } from '../../../../src/core/model/model.ts';
import { contractChanges, contractInformation } from '../../../../src/core/sources/contracts/contract-changes.ts';
import { activeAccounts, epoIdsOf, stillLinked } from '../../../../src/core/checks/detectors/contract-detectors.ts';
import { buildDrafts, escalationOf, recipientOf } from '../../../../src/core/messages/messages.ts';
import { readCiReport } from '../../../../src/core/sources/ci/ci-report.ts';
import { recogniseReport, reportType } from '../../../../src/core/sources/report-types.ts';
import { cardSummaries, subjectWord } from '../../../../src/app/view/cards.ts';
import { contractFilesLine } from '../../../../src/app/view/contracts.ts';
import { CHANGE_COLUMNS, changesCsv, CONTRACT_EXPORT_COLUMNS, exportCsv, exportFixCsv } from '../../../../src/app/view/exports.ts';
import { fixRows } from '../../../../src/app/view/fix-list.ts';
import { combinedGroup, ownerGroups } from '../../../../src/app/view/groups.ts';
import { peopleOf } from '../../../../src/app/view/people.ts';
import { reportTiles } from '../../../../src/app/view/tiles.ts';
import { loadPacks, loadReferences } from '../../../../src/hosts/cli.ts';
import type { CaseEvent, Run } from '../../../../src/core/cases/cases.ts';
import type { ContractInput, ContractRun, SolusiRun } from '../../../../src/core/sources/contracts/contract-reports.ts';

/* Contracts: the Solusi contract file compared with the ServiceNow contract report on invented data only. */

const packs = loadPacks();
const references = loadReferences();
const config = contractConfig(references)!;
const rules = { reminderDays: 3, maxReminders: 2 };
const DATE = '2026-11-11';

const solusiRows = parseCsv(readFileSync(new URL('../../../../samples/solusi-contracts-sample.csv', import.meta.url), 'utf8'));
const contractRows = parseCsv(readFileSync(new URL('../../../../samples/servicenow-contracts-sample.csv', import.meta.url), 'utf8'));
const ciReport = readCiReport(parseCsv(readFileSync(new URL('../../../../samples/cmdb_ci-sample.csv', import.meta.url), 'utf8')));

const solusi = readSolusiFile([{ name: 'Active contracts', rows: solusiRows }], config);
const servicenow = readContractReport(contractRows, config);
const input = (solusiContracts = solusi.contracts, snContracts = servicenow.contracts): ContractInput => ({
  solusi: { contracts: solusiContracts, date: '2026-11-09', report: 'solusi.xlsx' },
  servicenow: { contracts: snContracts, date: DATE, report: 'contracts.csv' }
});

function run(contracts: ContractInput | null, date = DATE): Run {
  const result = runChecks(ciReport.cis, ciReport.columns, packs, references, { date, contracts });
  return buildRun(ciReport.cis, result, packs, date, `cmdb_ci_${date}.csv`, references);
}
const of = (item: Run, checkId: string) => item.facts.filter((fact) => fact.checkId === checkId);

test('the two contract files are read: label row left out, dates, people, tags, criticality from a CI', () => {
  assert.equal(recogniseReport(solusiRows[0]!).type!.kind, 'solusi');
  assert.equal(recogniseReport(contractRows[0]!).type!.kind, 'contract');
  assert.equal(solusi.contracts.length, 7);
  assert.deepEqual(solusi.notes, []);
  const second = solusi.contracts[1]!;
  assert.deepEqual([second.number, second.status, second.end, second.dailyResponsible, second.sheet], ['CT000002', 'S - Concluded', '', '', 'active']);
  assert.equal(servicenow.contracts.length, 10);
  const print = servicenow.contracts.filter((contract) => contract.number === 'CNTR0000902')[0]!;
  assert.deepEqual(print.tags, ['T - Terminated', 'Target BC = 3']);
  assert.equal(print.criticality, true);
  assert.equal(statusTagOf(print, config), 'T - Terminated');
  const data = servicenow.contracts.filter((contract) => contract.number === 'CNTR0001003')[0]!;
  assert.deepEqual([data.owner, data.ownerActive, data.ownerUserId], ['Ian Inactive', false, 'iin']);
});

test('matching: the Solusi contract number is Vendor contract in ServiceNow', () => {
  const compared = compareContracts(solusi.contracts, servicenow.contracts);
  assert.equal(compared.pairs.length, 6);
  assert.deepEqual(compared.notInSolusi.map((contract) => contract.vendorContract), ['CT000090', 'CT000091', 'CT000092']);
  assert.deepEqual(compared.noNumber.map((contract) => contract.number), ['CNTR0001100']);
  assert.deepEqual(compared.notInServiceNow.map((contract) => contract.number), ['CT000007']);
});

test('Not in Solusi: a delete list; "Still linked" is only a note on the line', () => {
  const first = run(input());
  const facts = of(first, 'CONTRACT-NOT-IN-SOLUSI');
  assert.deepEqual(facts.map((fact) => fact.ciKey).sort(), ['contract:cntr0001100', 'contract:ct000090', 'contract:ct000091', 'contract:ct000092']);
  assert.equal(facts.every((fact) => isContractKey(fact.ciKey) && fact.className === CONTRACT_CLASS && fact.classLabel === 'Contract' && stateOf(fact) === 'open' && fact.module === 'compliance'), true);
  const archive = facts.filter((fact) => fact.ciKey === 'contract:ct000090')[0]!;
  assert.equal(archive.ciName, 'CT000090: Example Archive - old storage agreement');
  assert.equal(archive.detail, 'In ServiceNow (status Expired), not in the Solusi contract file of 9 November 2026');
  assert.deepEqual(archive.fix, { change: 'Delete the contract in ServiceNow', current: 'CNTR0000901, Expired', set: 'Deleted' });
  // Still linked: a criticality from a CI and a Target BC tag; or still running. Information only: it is to delete too (D144).
  const print = facts.filter((fact) => fact.ciKey === 'contract:ct000091')[0]!;
  assert.equal(print.fix!.note, 'Still linked: it carries a criticality from a CI; it is tagged Target BC = 3');
  assert.equal(print.detail, 'In ServiceNow (status T - Terminated), not in the Solusi contract file of 9 November 2026. Still linked: it carries a criticality from a CI; it is tagged Target BC = 3');
  const legacy = facts.filter((fact) => fact.ciKey === 'contract:ct000092')[0]!;
  assert.match(legacy.fix!.note!, /it is S - Concluded and ends 31 December 2099/);
  // A draft typed in by hand has no Solusi number: its key is the ServiceNow number.
  const draft = facts.filter((fact) => fact.ciKey === 'contract:cntr0001100')[0]!;
  assert.match(draft.detail, /no Solusi contract number \(status Draft\)/);
  assert.equal(stillLinked(servicenow.contracts[0]!, config, DATE).length > 0, true);

  const cases = buildCases([first], [], [], DATE, rules);
  const rows = fixRows(cases.filter((item) => item.fact.checkId === 'CONTRACT-NOT-IN-SOLUSI'));
  // The lines are in the order of the contracts: a note does not put a line first.
  assert.deepEqual(rows.map((row) => row.ciName), rows.map((row) => row.ciName).slice().sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(rows.map((row) => !!row.note), rows.map((row) => /^CT00009[12]/.test(row.ciName)));
  assert.match(exportFixCsv(rows.map((row) => row.item)), /"Delete the contract in ServiceNow","CNTR0000902, T - Terminated","Deleted","Still linked: it carries a criticality/);
  // A line saved before version 0.20 holds the note as "check before deleting": it is read as a note.
  const old = { ...rows[0]!.item, fact: { ...rows[0]!.item.fact, fix: { change: 'Delete the contract in ServiceNow', current: 'x', set: 'Deleted', check: 'Still linked: check before deleting (it is tagged Target BC = 3)' } } };
  assert.equal(fixRows([old])[0]!.note, 'Still linked: it is tagged Target BC = 3');
  // Nobody is asked: SACM deletes in ServiceNow.
  assert.equal(facts.every((fact) => fact.contactId === '' && fact.route === ''), true);
  // The contracts are not CIs of the report: the CI count and the lifecycle inventory do not hold them.
  assert.equal(first.cis, ciReport.cis.length);
  assert.equal((first.inventory ?? []).some((row) => isContractKey(row[0])), false);
  assert.equal((first.ciKeys ?? []).some(isContractKey), false);
  // The contract owner shows as Owned by on the case.
  const people = peopleOf(ciReport.cis.concat(runChecks(ciReport.cis, ciReport.columns, packs, references, { date: DATE, contracts: input() }).subjects ?? []), ['contract:ct000090']);
  assert.equal(people['contract:ct000090']!.owned_by!.name, 'Olga Owner');
});

test('To clear by hand: empty in Solusi, still filled in ServiceNow', () => {
  const facts = of(run(input()), 'CONTRACT-TO-CLEAR');
  assert.deepEqual(facts.map((fact) => `${fact.ciKey}:${fact.field}`).sort(), ['contract:ct000002:dailyResponsible', 'contract:ct000002:end']);
  const end = facts.filter((fact) => fact.field === 'end')[0]!;
  assert.equal(end.detail, 'End date is empty in the Solusi contract file of 9 November 2026, ServiceNow still has 31 December 2025; ServiceNow shows the contract as Expired only because of it');
  assert.deepEqual(end.fix, { change: 'End date: clear it', current: '31 December 2025', set: 'empty (empty in Solusi)' });
  // A value that differs is not on this list (CT000006 ends on another day): that is the card "Upload check".
  assert.equal(facts.some((fact) => fact.ciKey === 'contract:ct000006'), false);
});

test('Contract status: the tag to add, change or remove', () => {
  const facts = of(run(input()), 'CONTRACT-STATUS');
  const fixes = Object.fromEntries(facts.map((fact) => [fact.ciKey, fact.fix!.change]));
  assert.deepEqual(fixes, {
    // Expired with no status tag.
    'contract:ct000002': 'Add the tag S - Concluded',
    // Expired with the wrong tag.
    'contract:ct000004': 'Change the tag T - Terminated to E - Ended',
    // Concluded, as in Solusi, but with an old tag.
    'contract:ct000005': 'Remove the tag E - Ended'
  });
  // Expired with the right tag (CT000003) and Concluded with no status tag (CT000001) are fine.
});

test('contracts terminated in the last 7 days are known to Solusi, and their tag is checked the same way', () => {
  const terminated = readSolusiFile([
    { name: 'Active contracts', rows: solusiRows },
    { name: 'Terminated last 7 days', rows: [['CONTRACT_STATUS', 'CONTRACT_NO', 'CONTRACT_NAME', 'PARTNER_NAME', 'TERMINATION_DATE'], ['Status', 'Contract', 'Name', 'Company name', 'Termination date'],
      ['T - Terminated', 'CT000090', 'Example Archive - old storage agreement', 'Example Archive Ltd', '2026-11-05']] }
  ], config);
  assert.deepEqual(terminated.notes, []);
  assert.equal(terminated.contracts.filter((contract) => contract.sheet === 'terminated').length, 1);
  const item = run(input(terminated.contracts));
  assert.equal(of(item, 'CONTRACT-NOT-IN-SOLUSI').some((fact) => fact.ciKey === 'contract:ct000090'), false);
  const status = of(item, 'CONTRACT-STATUS').filter((fact) => fact.ciKey === 'contract:ct000090')[0]!;
  assert.equal(status.fix!.change, 'Add the tag T - Terminated');
  assert.match(status.detail, /terminated in the last 7 days/);
});

test('without both contract files the cards are grey with a note, never green', () => {
  for (const contracts of [null, { solusi: input().solusi, servicenow: null }, { solusi: null, servicenow: input().servicenow }]) {
    const item = run(contracts);
    const cards = cardSummaries(packs, item, buildCases([item], [], [], DATE, rules), new Map()).filter((card) => card.pack.family === 'contracts');
    assert.equal(cards.length, 6);
    assert.equal(cards.every((card) => card.light === 'grey' && card.notes.length === 1), true);
    assert.match(cards[0]!.notes[0]!, /^Not tested: no (Solusi contract file|ServiceNow contract report)/);
  }
  // The files were loaded after the CI report: the card says to load the CI report again.
  const late = run(null);
  const card = cardSummaries(packs, late, [], new Map(), undefined, undefined, true).filter((entry) => entry.id === 'CONTRACT-STATUS')[0]!;
  assert.match(card.notes[0]!, /loaded, but after this CI report/);
  // Missing reference data is said too.
  const bare = runChecks(ciReport.cis, ciReport.columns, packs.filter((pack) => pack.family === 'contracts'), {}, { date: DATE, contracts: input() });
  assert.equal(bare.notes.filter((note) => note.checkId !== 'PARKED').every((note) => /reference data missing \(reference\/contract-reports\)/.test(note.note)), true);
  assert.equal(bare.tested.length, 0);
});

test('a contract case: mark as deleted, Verified when a later report no longer holds the contract', () => {
  const first = run(input());
  const key = 'CONTRACT-NOT-IN-SOLUSI:contract:ct000090:record';
  const deleted: CaseEvent = { id: 'e1', at: '2026-11-11T10:00:00Z', by: 'ana@example.com', byName: 'Ana', type: 'status', keys: [key], text: 'Fixed' };
  const now = buildCases([first], [deleted], [], DATE, rules).filter((item) => item.key === key)[0]!;
  assert.equal(now.status, 'Fixed');
  const card = cardSummaries(packs, first, buildCases([first], [deleted], [], DATE, rules), new Map()).filter((entry) => entry.id === 'CONTRACT-NOT-IN-SOLUSI')[0]!;
  assert.equal(card.light, 'red');
  assert.equal(card.cis, 4);
  assert.equal(subjectWord(card.pack, card.cis), 'contracts');
  assert.equal(card.untaken, 0);

  // The next CI report, with the same contract files: nothing changes.
  const same = run(input(), '2026-11-12');
  assert.equal(buildCases([first, same], [deleted], [], '2026-11-12', rules).filter((item) => item.key === key)[0]!.status, 'Fixed');
  // A CI report loaded without the contract files: the check is not tested, the case stays.
  const without = run(null, '2026-11-13');
  const kept = buildCases([first, same, without], [deleted], [], '2026-11-13', rules).filter((item) => item.key === key)[0]!;
  assert.deepEqual([kept.status, kept.untested], ['Fixed', true]);
  // A later ServiceNow contract report no longer holds the contract: Verified, though the contract is in no report.
  const gone = run(input(solusi.contracts, servicenow.contracts.filter((contract) => contract.vendorContract !== 'CT000090')), '2026-11-18');
  const after = buildCases([first, same, without, gone], [deleted], [], '2026-11-18', rules).filter((item) => item.key === key)[0]!;
  assert.deepEqual([after.status, after.verifiedOn, after.ciMissing], ['Verified', '2026-11-18', false]);
  // "Not followed up" (Procurement asked to keep it) closes the case like any other.
  const keep: CaseEvent = { id: 'e2', at: '2026-11-11T11:00:00Z', by: 'ana@example.com', byName: 'Ana', type: 'exception', keys: ['CONTRACT-NOT-IN-SOLUSI:contract:ct000092:record'], reason: 'Other', reviewOn: '2027-05-11', text: 'Procurement asked to keep it' };
  const followed = buildCases([first], [keep], [], DATE, rules).filter((item) => item.key === keep.keys[0])[0]!;
  assert.equal(followed.status, 'Not followed up');
});

test('older runs and journals keep loading: a CI case is still held back when its CI is not in the report', () => {
  const first = run(null);
  const fact = first.facts.filter((item) => stateOf(item) === 'open')[0]!;
  const note: CaseEvent = { id: 'n1', at: '2026-11-11T09:00:00Z', by: 'ana@example.com', byName: 'Ana', type: 'note', keys: [fact.key], text: 'seen' };
  const partial: Run = { ...first, date: '2026-11-12', facts: [], ciKeys: (first.ciKeys ?? []).filter((key) => key !== fact.ciKey) };
  const item = buildCases([first, partial], [note], [], '2026-11-12', rules).filter((entry) => entry.key === fact.key)[0]!;
  assert.deepEqual([item.ciMissing, item.status], [true, 'New']);
  assert.equal(contractKey(' CT000001 '), 'contract:ct000001');
});

test('Reports strip: the two contract files have their tile, and a weekly file is not old after four days', () => {
  const solusiRun: SolusiRun = { kind: 'solusi', date: '2026-11-09', report: 'solusi.xlsx', contracts: solusi.contracts, notes: [], loadedByName: 'Ana', loadedAt: '2026-11-11T09:00:00' };
  const contractRun: ContractRun = { kind: 'contract', date: DATE, report: 'contracts.csv', contracts: servicenow.contracts, notes: [] };
  const tiles = reportTiles(undefined, null, '2026-11-13', 3, null, '', solusiRun, contractRun);
  const solusiTile = tiles.filter((tile) => tile.type.kind === 'solusi')[0]!;
  assert.equal(solusiTile.load!.summary, '7 contracts · 0 terminated in the last 7 days');
  assert.equal(solusiTile.load!.details[0], '1 contract is not in the ServiceNow contract report of 11 Nov 2026 (not imported yet).');
  assert.deepEqual([solusiTile.ageDays, solusiTile.stale], [4, false]);
  const contractTile = tiles.filter((tile) => tile.type.kind === 'contract')[0]!;
  assert.equal(contractTile.load!.summary, '10 contracts');
  assert.equal(contractTile.load!.details[0], '6 contracts are also in the Solusi contract file of 9 Nov 2026; 4 are not.');
  assert.equal(reportTiles(undefined, null, '2026-11-20', 3, null, '', solusiRun, contractRun).filter((tile) => tile.type.kind === 'solusi')[0]!.stale, true);
  assert.equal(reportType('solusi')!.label, 'Solusi contract file');
});

/* ------------------------------------------------------------------ For Procurement, Upload check, Contract changes */

const earlierRows = parseCsv(readFileSync(new URL('../../../../samples/solusi-contracts-sample-earlier.csv', import.meta.url), 'utf8'));
const earlier = readSolusiFile([{ name: 'Active contracts', rows: earlierRows }], config);
const settings = { portalLink: '', signature: 'SACM team', senderName: 'Sam Example', procurementName: 'Procurement', procurementEmail: 'procurement@example.com' };
const refs = (): (() => string) => { let count = 0; return () => `SACM-T${++count}`; };

test('For Procurement: only the problems in Solusi itself, one finding per contract and kind', () => {
  const facts = of(run(input()), 'CONTRACT-PROCUREMENT');
  assert.deepEqual(facts.map((fact) => `${fact.ciKey}|${fact.field}`).sort(), ['contract:ct000002|noVendorNumber', 'contract:ct000003|epoRetired', 'contract:ct000003|ownerLeft', 'contract:ct000005|epoUnknown']);
  const by = (field: string) => facts.filter((fact) => fact.field === field)[0]!;
  assert.equal(by('epoRetired').detail, 'EPO ID AST-0009 (Old Receipt Printer): the system is Retired');
  assert.equal(by('epoUnknown').detail, 'EPO ID 9999: not the EPO ID of a system in ServiceNow');
  // To solve, listed by kind, and asked from the Procurement mailbox: the people of the contract are never copied.
  assert.equal(facts.every((fact) => stateOf(fact) === 'open' && fact.contactId === PROCUREMENT && fact.contactEmail === '' && fact.cc.length === 0 && !fact.fix), true);
  assert.equal(by('noVendorNumber').group, 'No vendor number');
  assert.deepEqual(by('noVendorNumber').ci!.contract, { number: 'CT000002', name: 'Example Consulting - framework agreement', vendor: 'Example Consulting Ltd' });
  // A contract in negotiation with no end date is not asked: only a Concluded one.
  assert.equal(facts.some((fact) => fact.ciKey === 'contract:ct000007'), false);
});

test('Contracts to fix in ServiceNow: a SACM fix list of inactive people, dates and names (D145)', () => {
  const first = run(input());
  const facts = of(first, 'CONTRACT-SN-FIX');
  // The inactive contract owner has no active account with the same name: the person left, so the line is For Procurement (D193).
  assert.deepEqual(facts.map((fact) => `${fact.ciKey}|${fact.field}`).sort(), ['contract:ct000003|endPassed']);
  const by = (field: string) => facts.filter((fact) => fact.field === field)[0]!;
  assert.equal(by('endPassed').detail, 'S - Concluded, but the end date 31 December 2025 has passed');
  assert.deepEqual(by('endPassed').fix, { change: 'End date: correct it, or set the status Ended', current: 'S - Concluded, ends 31 December 2025', set: 'the right end date, or Ended' });
  // Nobody is asked: SACM corrects them in ServiceNow; the card is a fix list in the section Correctness.
  assert.equal(facts.every((fact) => stateOf(fact) === 'open' && fact.contactId === '' && fact.module === 'correctness'), true);
  assert.equal(by('endPassed').group, 'Concluded, but the end date has passed');
  const cases = buildCases([first], [], [], DATE, rules).filter((one) => one.fact.checkId === 'CONTRACT-SN-FIX');
  assert.equal(buildDrafts(cases, packs, settings, refs()).drafts.length, 0);
  const card = cardSummaries(packs, first, buildCases([first], [], [], DATE, rules), new Map()).filter((entry) => entry.id === 'CONTRACT-SN-FIX')[0]!;
  assert.deepEqual([card.light, card.cis, card.label], ['red', 1, 'Contracts to fix in ServiceNow']);
  // Every problem is tested on both cards, so a problem that moved closes on the card it left.
  for (const id of ['CONTRACT-PROCUREMENT', 'CONTRACT-SN-FIX']) for (const problem of ['ownerInactive', 'ownerLeft', 'partnerLeft', 'endPassed', 'noVendorNumber', 'epoUnknown']) assert.ok(first.tested.indexOf(`${id}:${problem}`) >= 0, `${id}:${problem}`);
  // The scores count only what a card raises.
  assert.equal(first.evaluated!['CONTRACT-PROCUREMENT:ownerInactive'], undefined);
  assert.equal(typeof first.evaluated!['CONTRACT-SN-FIX:ownerInactive'], 'number');
});

test('an inactive contract person: the wrong account is SACM\'s line with the account to set; a person who left goes to Procurement (D193)', () => {
  const inactive = servicenow.contracts.filter((contract) => contract.ownerActive === false)[0]!;
  assert.equal(inactive.owner, 'Ian Inactive');
  // No active account with that name in the reports: the person left.
  const left = run(input());
  assert.equal(of(left, 'CONTRACT-SN-FIX').some((fact) => fact.field === 'ownerInactive'), false);
  const gone = of(left, 'CONTRACT-PROCUREMENT').filter((fact) => fact.field === 'ownerLeft')[0]!;
  assert.equal(gone.detail, 'Contract owner Ian Inactive is no longer active in ServiceNow, and no active account with that name is known');
  assert.equal(gone.group, 'Contract owner left');
  assert.equal(gone.fix, undefined);
  // Another contract names an active account with the same name: the upload picked the wrong account.
  const other = servicenow.contracts.filter((contract) => contract !== inactive)[0]!;
  const twin = { ...other, owner: 'Ian Inactive', ownerUserId: 'IIN02', ownerActive: true };
  const wrong = run(input(solusi.contracts, servicenow.contracts.map((contract) => (contract === other ? twin : contract))));
  assert.equal(of(wrong, 'CONTRACT-PROCUREMENT').some((fact) => fact.field === 'ownerLeft'), false);
  const line = of(wrong, 'CONTRACT-SN-FIX').filter((fact) => fact.field === 'ownerInactive')[0]!;
  const own = inactive.ownerUserId.toLowerCase();
  assert.equal(line.detail, `Contract owner Ian Inactive is inactive in ServiceNow${own ? ` (account ${own})` : ''}. An active account with the same name exists: iin02`);
  assert.deepEqual(line.fix, { change: 'Contract owner: set the active account with the same name', current: `Ian Inactive (${own ? `${own}, ` : ''}inactive)`, set: 'Ian Inactive (iin02)', value: 'iin02' });
  assert.equal(line.group, 'Contract owner: an inactive account was picked');
  // The accounts come from the people of the CIs and their managers too; only active accounts with a user ID count.
  const accounts = activeAccounts(ciReport.cis, [twin, inactive]);
  assert.deepEqual(Array.from(accounts.get('ian inactive') ?? []), ['iin02']);
  const person = ciReport.cis.map((ci) => ci.roles.owned_by).filter((one) => !!one && one.active === true && !!one.userId)[0]!;
  assert.equal(activeAccounts(ciReport.cis, []).get(person.name.toLowerCase())!.has(person.userId.toLowerCase()), true);
});

test('fixed-term with no end date and a name ServiceNow shows differently are fixed in ServiceNow; no owner is for Procurement; what is not tested', () => {
  const changed = solusi.contracts.map((contract) => (contract.number === 'CT000006' ? { ...contract, end: '' }
    : contract.number === 'CT000001' ? { ...contract, owner: '', procurementPartner: 'Partner, Pat' } : contract));
  const item = run(input(changed));
  const fix = of(item, 'CONTRACT-SN-FIX');
  const procurement = of(item, 'CONTRACT-PROCUREMENT');
  assert.equal(fix.filter((fact) => fact.field === 'noEnd').map((fact) => `${fact.ciKey}: ${fact.detail}`).join(), 'contract:ct000006: Fixed-term, but no end date');
  assert.equal(procurement.filter((fact) => fact.field === 'noOwner').map((fact) => fact.ciKey).join(), 'contract:ct000001');
  const name = fix.filter((fact) => fact.field === 'personName.procurementPartner')[0]!;
  assert.equal(name.detail, 'Procurement partner: Solusi has "Partner, Pat", ServiceNow has "Pat Partner"');
  assert.equal(name.group, 'A name ServiceNow does not show the same');
  assert.deepEqual(name.fix, { change: 'Procurement partner: set the person Solusi names', current: 'Pat Partner', set: 'Partner, Pat', value: 'Partner, Pat' });
  assert.equal(procurement.some((fact) => /^(noEnd|personName)/.test(fact.field)), false);
  // A name is not on the Upload check too: one line, one card.
  assert.equal(of(item, 'CONTRACT-UPLOAD').some((fact) => fact.field === 'procurementPartner'), false);
  // No asset tag column in the CI report: the EPO ID problems are not tested, and the card says so.
  const columns = new Set(Array.from(ciReport.columns).filter((column) => column !== 'assetTag'));
  const result = runChecks(ciReport.cis, columns, packs, references, { date: DATE, contracts: input() });
  assert.equal(result.findings.some((finding) => finding.checkId === 'CONTRACT-PROCUREMENT' && /^epo/.test(finding.field)), false);
  assert.equal(result.notes.some((note) => note.checkId === 'CONTRACT-PROCUREMENT' && /EPO ID/.test(note.note)), true);
  assert.equal(result.notes.some((note) => note.checkId === 'CONTRACT-SN-FIX' && /EPO ID/.test(note.note)), false);
  assert.equal(result.tested.indexOf('CONTRACT-PROCUREMENT:epoUnknown'), -1);
  assert.deepEqual(epoIdsOf('N/A, 1234 and AST-0006; 12', 3).map((id) => id.written), ['1234', 'AST-0006']);
});

test('the message For Procurement: one message to the mailbox, one table per problem, never split', () => {
  const item = run(input());
  const cases = buildCases([item], [], [], DATE, rules).filter((one) => one.fact.checkId === 'CONTRACT-PROCUREMENT');
  // Without the address of the mailbox in Settings nothing can be written.
  assert.equal(buildDrafts(cases, packs, { ...settings, procurementEmail: '' }, refs()).drafts.length, 0);
  const { drafts, skipped } = buildDrafts(cases, packs, settings, refs());
  assert.equal(drafts.length, 1);
  assert.equal(skipped.length, 0);
  const draft = drafts[0]!;
  assert.deepEqual([draft.to, draft.cc, draft.mailbox, draft.ciCount], ['procurement@example.com', '', true, 3]);
  assert.equal(draft.subject, '3 contracts need a correction in Solusi [SACM-T1]');
  assert.match(draft.plain, /^Hi Procurement,\n\nProcurement owns the contract data in Solusi\. The contracts below need a correction in Solusi: ServiceNow receives it with the next upload\. We found 4 kinds of problem\./);
  // The tables come in the order of the reference data, each with what is asked.
  assert.deepEqual(draft.plain.split('\n').filter((line) => /^[A-Z ,]+ \(\d+\)$/.test(line)),
    ['CONTRACT OWNER LEFT (1)', 'NO VENDOR NUMBER (1)', 'THE EPO ID NAMES A RETIRED SYSTEM (1)', 'THE EPO ID IS NOT A KNOWN EPO ID (1)']);
  assert.match(draft.plain, /Please name a new contract owner in Solusi, or tell us if the person is still with the company\./);
  assert.equal((draft.body.match(/<table/g) ?? []).length, 4);
  assert.match(draft.body, /<th align="left" style="white-space:nowrap">Contract number<\/th><th align="left" style="white-space:nowrap">Name<\/th><th align="left" style="white-space:nowrap">Vendor<\/th><th align="left" style="white-space:nowrap">What we found<\/th>/);
  assert.match(draft.body, /<td>CT000002<\/td><td>Example Consulting - framework agreement<\/td><td>Example Consulting Ltd<\/td>/);
  assert.match(draft.plain, /Please add the vendor number in Solusi\./);
  // Why it matters comes once, after the last table; the manager signs.
  assert.equal(draft.plain.split('these values can only be corrected in Solusi').length, 2);
  assert.match(draft.plain, /Thank you,\nSam Example\nSACM team$/);
  assert.equal(/\bCIs?\b/.test(draft.plain), false);

  // Forty contracts with the same problem: still one message (a message to a person is split at 25 CIs).
  const many = Array.from({ length: 40 }, (_, index) => ({ ...solusi.contracts[0]!, number: `CT9${String(index).padStart(5, '0')}`, vendorNumber: '', epoId: '' }));
  const big = buildCases([run(input(many, []))], [], [], DATE, rules).filter((one) => one.fact.checkId === 'CONTRACT-PROCUREMENT');
  const whole = buildDrafts(big, packs, settings, refs()).drafts;
  assert.deepEqual([whole.length, whole[0]!.ciCount, whole[0]!.part.count], [1, 40, 1]);
});

test('the message For Procurement: a reminder in the same thread; after the reminders, the escalation goes to the Procurement lead (D147)', () => {
  const first = run(input(), '2026-11-11');
  const keys = buildCases([first], [], [], '2026-11-11', rules).filter((one) => one.fact.checkId === 'CONTRACT-PROCUREMENT').map((one) => one.key);
  const sent = (at: string, id: string): CaseEvent => ({ id, at, by: 'sam@example.com', byName: 'Sam Example', type: 'message', keys, ref: 'SACM-T1', to: 'procurement@example.com', channel: 'mailbox' } as CaseEvent);
  const events = [sent('2026-11-11T09:00', 'e1'), sent('2026-11-17T09:00', 'e2'), sent('2026-11-23T09:00', 'e3')];
  const late = buildCases([first], events, [], '2026-12-10', rules).filter((one) => one.fact.checkId === 'CONTRACT-PROCUREMENT');
  assert.equal(late.every((one) => one.overLimit), true);
  // No Procurement lead in Settings: no escalation, the reminder goes to the mailbox again.
  const reminder = buildDrafts(late, packs, settings, refs()).drafts;
  assert.deepEqual(reminder.map((draft) => [draft.kind, draft.to, draft.ref]), [['reminder', 'procurement@example.com', 'SACM-T1']]);
  assert.match(reminder[0]!.plain, /The contracts below are still open\./);
  assert.equal(escalationOf(late[0]!.fact, settings), null);
  // With the Procurement lead: the escalation goes to the lead, with the mailbox in copy.
  const lead = { ...settings, procurementLeadName: 'Lee Lead', procurementLeadEmail: 'lee.lead@example.com' };
  const escalation = buildDrafts(late, packs, lead, refs()).drafts;
  assert.deepEqual(escalation.map((draft) => [draft.kind, draft.to, draft.cc, draft.mailbox]), [['escalation', 'lee.lead@example.com', 'procurement@example.com', true]]);
  assert.match(escalation[0]!.plain, /^Hi Lee,\n\nWe wrote to the Procurement mailbox \(procurement@example\.com\) on 11 November 2026, 17 November 2026 and 23 November 2026 about the contracts below, and we have no answer\. You are the Procurement lead\./);
  assert.equal(escalation[0]!.subject, 'No answer on 3 contracts of Procurement [SACM-T1]');
  // Before the reminders are used up, the lead changes nothing.
  const early = buildCases([first], events.slice(0, 1), [], '2026-11-17', rules).filter((one) => one.fact.checkId === 'CONTRACT-PROCUREMENT');
  assert.deepEqual(buildDrafts(early, packs, lead, refs()).drafts.map((draft) => draft.kind), ['reminder']);
  // Procurement adds the vendor number: the next Solusi file no longer shows the problem.
  const corrected = solusi.contracts.map((contract) => (contract.number === 'CT000002' ? { ...contract, vendorNumber: 'V0002' } : contract));
  const after = buildCases([first, run(input(corrected), '2026-11-18')], events.slice(0, 1), [], '2026-11-18', rules).filter((one) => one.fact.checkId === 'CONTRACT-PROCUREMENT');
  assert.equal(after.filter((one) => one.fact.field === 'noVendorNumber')[0]!.status, 'Verified');
  assert.equal(after.filter((one) => one.fact.field === 'epoRetired')[0]!.status, 'Contacted');
});

test('Upload check: a SACM fix list of the fields that differ after the upload, and the contract not in ServiceNow yet (D146)', () => {
  const item = run(input());
  const facts = of(item, 'CONTRACT-UPLOAD');
  assert.deepEqual(facts.map((fact) => `${fact.ciKey}|${fact.field}|${fact.group}`).sort(), [
    'contract:ct000005|vendor|Vendor', 'contract:ct000006|end|End date', 'contract:ct000007|record|Not in ServiceNow yet'
  ]);
  const end = facts.filter((fact) => fact.field === 'end')[0]!;
  assert.equal(end.detail, 'End date: Solusi has 15 December 2026, ServiceNow has 31 December 2026');
  assert.deepEqual(end.fix, { change: 'End date: set the value of Solusi', current: '31 December 2026', set: '15 December 2026' });
  assert.equal(facts.filter((fact) => fact.field === 'record')[0]!.fix!.set, 'in ServiceNow');
  // To solve, and nobody is asked: no incident, SACM corrects it.
  assert.equal(facts.every((fact) => stateOf(fact) === 'open' && fact.contactId === ''), true);
  // A vendor that is empty in ServiceNow because Solusi has no vendor number is for Procurement, not for the upload check.
  assert.equal(facts.some((fact) => fact.ciKey === 'contract:ct000002'), false);
  // A field that is empty in Solusi is on the card To clear by hand, never here.
  assert.equal(of(item, 'CONTRACT-TO-CLEAR').some((fact) => facts.some((other) => other.ciKey === fact.ciKey && other.field === fact.field)), false);
  // A status the import did not bring (not one ServiceNow sets by itself).
  const other = servicenow.contracts.map((contract) => (contract.number === 'CNTR0001001' ? { ...contract, state: 'N - In negotiation' } : contract));
  const status = of(run(input(solusi.contracts, other)), 'CONTRACT-UPLOAD').filter((fact) => fact.field === 'status')[0]!;
  assert.equal(status.detail, 'Status: Solusi has S - Concluded, ServiceNow has N - In negotiation');
  assert.deepEqual(status.fix, { change: 'Status: set the status of Solusi', current: 'N - In negotiation', set: 'S - Concluded' });
  const cases = buildCases([item], [], [], DATE, rules);
  const card = cardSummaries(packs, item, cases, new Map(), undefined, undefined, true).filter((entry) => entry.id === 'CONTRACT-UPLOAD')[0]!;
  assert.deepEqual([card.light, card.cis], ['red', 3]);
  assert.equal(buildDrafts(cases.filter((one) => one.fact.checkId === 'CONTRACT-UPLOAD'), packs, settings, refs()).drafts.length, 0);
});

test('contract cards list by kind of finding, and Export this list gives the tables of the message as a file', () => {
  const item = run(input());
  const cases = buildCases([item], [], [], DATE, rules).filter((one) => one.fact.checkId === 'CONTRACT-PROCUREMENT');
  const people = new Map(Object.entries(peopleOf(ciReport.cis.concat(runChecks(ciReport.cis, ciReport.columns, packs, references, { date: DATE, contracts: input() }).subjects ?? []), cases.map((one) => one.fact.ciKey))));
  const groups = ownerGroups(cases, people, (fact) => recipientOf(fact, settings), 'owner');
  assert.deepEqual(groups.map((group) => [group.label, group.rows.length]), [
    ['Contract owner left', 1], ['No vendor number', 1], ['The EPO ID is not a known EPO ID', 1], ['The EPO ID names a Retired system', 1]
  ]);
  // The only person of a group is the mailbox: the contract owner is not asked and not copied.
  assert.deepEqual(groups[0]!.people.map((person) => [person.name, person.email]), [['Procurement', 'procurement@example.com']]);
  assert.deepEqual(combinedGroup(cases, people, (fact) => recipientOf(fact, settings)).people.map((person) => person.email), ['procurement@example.com']);
  const lines = exportCsv(cases, people, packs).replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines[0], CONTRACT_EXPORT_COLUMNS.map((name) => `"${name}"`).join(','));
  assert.equal(lines.length, 5);
  assert.equal(lines[2], '"No vendor number","CT000002","Example Consulting - framework agreement","Example Consulting Ltd","No vendor number for Example Consulting Ltd, so the vendor stays empty in ServiceNow","Please add the vendor number in Solusi.","New"');
  assert.match(contractFilesLine({ ...item, solusiReport: 'solusi.xlsx', contractReport: 'contracts.csv' }, { kind: 'solusi', date: '2026-11-09', report: 'solusi.xlsx', contracts: [], notes: [] }, null),
    /^Compared: the Solusi contract file of 9 November 2026 with the ServiceNow contract report "contracts\.csv"\.$/);
});

test('Contract changes: new contracts, contracts that left, status changes and each changed field', () => {
  const now = { contracts: solusi.contracts, date: '2026-11-09' };
  const first = contractChanges(null, now);
  assert.deepEqual([first.from, first.to, first.added.length, first.fields.length], ['', '2026-11-09', 0, 0]);
  const changes = contractChanges({ contracts: earlier.contracts, date: '2026-11-02' }, now);
  assert.deepEqual([changes.from, changes.to], ['2026-11-02', '2026-11-09']);
  assert.deepEqual(changes.added.map((contract) => contract.number), ['CT000006']);
  assert.deepEqual(changes.left.map((contract) => contract.number), ['CT000008']);
  assert.deepEqual(changes.status.map((change) => [change.number, change.before, change.after]), [['CT000004', 'S - Concluded', 'E - Ended']]);
  assert.deepEqual(changes.fields.map((change) => [change.number, change.what, change.before, change.after]), [
    ['CT000001', 'Contract owner', 'Ian Inactive', 'Olga Owner'], ['CT000005', 'End date', '31 January 2026', '31 January 2027']
  ]);
  // The same file twice: nothing changed. A contract that moved to the tab "terminated in the last 7 days" is a status change.
  assert.deepEqual(contractChanges(now, now), { from: '2026-11-09', to: '2026-11-09', added: [], left: [], status: [], fields: [] });
  const moved = solusi.contracts.map((contract) => (contract.number === 'CT000004' ? { ...contract, sheet: 'terminated' as const } : contract));
  assert.deepEqual(contractChanges(now, { contracts: moved, date: '2026-11-16' }).status.map((change) => change.after), ['E - Ended (terminated in the last 7 days)']);
  const csv = changesCsv(changes).replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(csv[0], CHANGE_COLUMNS.map((name) => `"${name}"`).join(','));
  assert.equal(csv.length, 6);
  assert.equal(csv[4], '"Changed field","CT000001","Example Software - licence agreement","Example Software Ltd","Contract owner","Ian Inactive","Olga Owner"');
  // For information: Concluded contracts that end soon (30 and 90 days), and running contracts with no daily responsible.
  const info = contractInformation(solusi.contracts, DATE, config);
  assert.deepEqual(info.ending.map((entry) => [entry.days, entry.contracts.map((contract) => contract.number)]), [[30, []], [90, ['CT000006', 'CT000005']]]);
  assert.deepEqual(info.noDailyResponsible.map((contract) => contract.number), ['CT000002']);
  // The Solusi tile counts the changes since the file before.
  const tile = reportTiles(undefined, null, DATE, 3, null, '', { kind: 'solusi', date: '2026-11-09', report: 'now.xlsx', contracts: solusi.contracts, notes: [] }, null,
    { kind: 'solusi', date: '2026-11-02', report: 'before.xlsx', contracts: earlier.contracts, notes: [] }).filter((entry) => entry.type.kind === 'solusi')[0]!;
  assert.equal(tile.load!.details.some((line) => line === '5 changes since the Solusi contract file of 2 Nov 2026: see Contract changes.'), true);
});
