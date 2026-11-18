import { longDate, screenDate } from '../../shared/dates.ts';
import { nameKey } from '../../shared/names.ts';
import { CONTRACT_REF, contractConfig, contractSubject, inList, sameWord, statusTagOf } from '../../sources/contracts/contract-reports.ts';
import type { ContractComparison, ContractConfig, ContractField, ContractInput, ContractPair, ServiceNowContract, SolusiContract } from '../../sources/contracts/contract-reports.ts';
import type { CheckPack, Ci, Finding, FixLine, References, RunResult } from '../../model/model.ts';

/**
 * The contract checks: the Solusi contract file compared with the ServiceNow contract report (see
 * src/core/sources/contracts/contract-reports.ts for how the two files are read and matched). Pure. Each detector
 * gives SACM a list (to delete, to clear, a tag to set), the Upload check, or the problems of Solusi itself for
 * Procurement. Nothing here sends, deletes or changes anything.
 */


const valueWords = (value: string, kind: 'text' | 'date' | 'person'): string => (kind === 'date' ? longDate(value) : value);

/* ------------------------------------------------------------------ detectors */

type Output = Pick<RunResult, 'findings' | 'tested' | 'evaluated' | 'notes' | 'subjects'>;
interface Input { pack: CheckPack; config: ContractConfig; input: ContractInput; comparison: ContractComparison; date: string; cis: Ci[]; columns: Set<string> }
type ContractDetector = (input: Input) => Output;

const empty = (): Output => ({ findings: [], tested: [], evaluated: {}, notes: [], subjects: [] });

function finding(out: Output, pack: CheckPack, subject: Ci, field: string, detail: string, fix?: FixLine, group?: string): void {
  if (!out.subjects!.some((known) => known.key === subject.key)) out.subjects!.push(subject);
  out.findings.push({
    key: `${pack.id}:${subject.key}:${field}`, checkId: pack.id, ciKey: subject.key, ciName: subject.name, className: subject.className, field,
    severity: pack.severity, detail, ...(fix ? { fix } : {}), ...(group ? { group } : {})
  } satisfies Finding);
}

/** What links a contract to delete to the CMDB, in words ('' when none). Information only: every contract not in Solusi is deleted (D144). */
export function stillLinked(contract: ServiceNowContract, config: ContractConfig, date: string): string {
  const reasons: string[] = [];
  if (contract.criticality) reasons.push('it carries a criticality from a CI');
  const target = new RegExp(config.targetTag, 'i');
  const tag = contract.tags.filter((candidate) => target.test(candidate))[0];
  if (tag) reasons.push(`it is tagged ${tag}`);
  if (inList(config.runningStatuses, contract.state) && (!contract.end || !date || contract.end >= date)) {
    reasons.push(contract.end ? `it is ${contract.state} and ends ${longDate(contract.end)}` : `it is ${contract.state} with no end date`);
  }
  return reasons.length ? `Still linked: ${reasons.join('; ')}` : '';
}

/** Not in Solusi: a contract in ServiceNow that does not come from Solusi is forgotten and should be deleted (docs/DECISIONS.md). */
const notInSolusi: ContractDetector = ({ pack, config, input, comparison, date }) => {
  const out = empty();
  out.tested.push(`${pack.id}:record`);
  out.evaluated[`${pack.id}:record`] = input.servicenow!.contracts.length;
  const solusiDate = longDate(input.solusi!.date);
  for (const contract of comparison.notInSolusi.concat(comparison.noNumber)) {
    const note = stillLinked(contract, config, date);
    const draft = !contract.vendorContract;
    const detail = draft
      ? `In ServiceNow with no Solusi contract number (status ${contract.state || 'empty'}): it does not come from Solusi`
      : `In ServiceNow (status ${contract.state || 'empty'}), not in the Solusi contract file of ${screenDate(solusiDate)}`;
    const fix: FixLine = { change: 'Delete the contract in ServiceNow', current: `${contract.number}, ${contract.state || 'no status'}`, set: 'Deleted', ...(note ? { note } : {}) };
    finding(out, pack, contractSubject(contract, null), 'record', note ? `${detail}. ${note}` : detail, fix);
  }
  return out;
};

/** To clear by hand: the import never clears a field (known challenge 2). Empty in Solusi, still filled in ServiceNow. */
const toClear: ContractDetector = ({ pack, config, input, comparison }) => {
  const out = empty();
  for (const entry of config.fields) {
    out.tested.push(`${pack.id}:${entry.field}`);
    out.evaluated[`${pack.id}:${entry.field}`] = comparison.pairs.length;
  }
  for (const pair of comparison.pairs) {
    for (const entry of config.fields) {
      const solusi = pair.solusi[entry.field];
      const now = pair.servicenow[entry.field];
      if (solusi || !now) continue;
      const shown = valueWords(now, entry.kind);
      const expired = entry.field === 'end' && inList(config.autoStates, pair.servicenow.state)
        ? `; ServiceNow shows the contract as ${pair.servicenow.state} only because of it` : '';
      finding(out, pack, contractSubject(pair.servicenow, pair.solusi), entry.field,
        `${entry.label} is empty in the Solusi contract file of ${longDate(input.solusi!.date)}, ServiceNow still has ${shown}${expired}`,
        { change: `${entry.label}: clear it`, current: shown, set: 'empty (empty in Solusi)' });
    }
  }
  return out;
};

/**
 * Contract status: ServiceNow sets "Expired" by itself from the end date (known challenge 4), so the real Solusi status is
 * kept as a tag. Checks that tag, and that a contract whose status was imported carries no other status tag.
 * Contracts of the tab "Terminated last 7 days" are checked the same way (known challenge 3).
 */
const status: ContractDetector = ({ pack, config, comparison }) => {
  const out = empty();
  out.tested.push(`${pack.id}:status`);
  out.evaluated[`${pack.id}:status`] = comparison.pairs.length;
  for (const pair of comparison.pairs) {
    const wanted = pair.solusi.status;
    if (!wanted) continue;
    const contract = pair.servicenow;
    const tag = statusTagOf(contract, config);
    const subject = contractSubject(contract, pair.solusi);
    const from = pair.solusi.sheet === 'terminated' ? ' (terminated in the last 7 days)' : '';
    if (inList(config.autoStates, contract.state)) {
      if (!tag) {
        finding(out, pack, subject, 'status', `ServiceNow shows ${contract.state} and has no status tag. Solusi says ${wanted}${from}`,
          { change: `Add the tag ${wanted}`, current: `${contract.state}, no status tag`, set: `tag ${wanted}` });
      } else if (!sameWord(tag, wanted)) {
        finding(out, pack, subject, 'status', `ServiceNow shows ${contract.state} with the tag ${tag}. Solusi says ${wanted}${from}`,
          { change: `Change the tag ${tag} to ${wanted}`, current: `tag ${tag}`, set: `tag ${wanted}` });
      }
      continue;
    }
    // The status was imported: a status tag that says something else is old and misleading.
    if (sameWord(contract.state, wanted) && tag && !sameWord(tag, wanted)) {
      finding(out, pack, subject, 'status', `ServiceNow shows ${contract.state}, like Solusi, but carries the tag ${tag}`,
        { change: `Remove the tag ${tag}`, current: `${contract.state}, tag ${tag}`, set: 'no other status tag' });
    }
    // A status that differs from Solusi while it is not set by ServiceNow is a difference of the import: the card "Upload check".
  }
  return out;
};

/* ------------------------------------------------------------------ what differs after the import */

export interface FieldDifference { field: ContractField; label: string; kind: 'text' | 'date' | 'person'; solusi: string; servicenow: string }

/**
 * The fields of a pair that Solusi holds and ServiceNow shows differently (or not at all). A field that is empty in Solusi
 * is not a difference here: that is the card "To clear by hand". Text and names are compared without case and extra spaces.
 */
export function fieldDifferences(pair: ContractPair, config: ContractConfig): FieldDifference[] {
  const found: FieldDifference[] = [];
  for (const entry of config.fields) {
    const solusi = pair.solusi[entry.field];
    const now = pair.servicenow[entry.field];
    if (!solusi) continue;
    if (entry.kind === 'date' ? solusi === now : sameWord(solusi, now)) continue;
    found.push({ field: entry.field, label: entry.label, kind: entry.kind, solusi, servicenow: now });
  }
  return found;
}

/** The vendor is empty in ServiceNow because Solusi has no vendor number: a problem of Solusi, asked from Procurement. */
const vendorNotImported = (pair: ContractPair, difference: FieldDifference): boolean =>
  difference.field === 'vendor' && !difference.servicenow && !pair.solusi.vendorNumber;

/**
 * Upload check: a field differs between Solusi and ServiceNow after the import, or a contract is not in ServiceNow yet.
 * A SACM fix list, grouped by field (D146): SACM first asks "was this Solusi file uploaded?", then sets the Solusi value in
 * ServiceNow. A person's name is not here: it is on "Contracts to fix in ServiceNow" (problem personName).
 */
const uploadCheck: ContractDetector = ({ pack, config, input, comparison }) => {
  const out = empty();
  for (const field of config.fields.map((entry) => entry.field as string).concat(['status', 'record'])) {
    out.tested.push(`${pack.id}:${field}`);
    out.evaluated[`${pack.id}:${field}`] = field === 'record' ? input.solusi!.contracts.length : comparison.pairs.length;
  }
  for (const pair of comparison.pairs) {
    const subject = contractSubject(pair.servicenow, pair.solusi);
    for (const difference of fieldDifferences(pair, config)) {
      if (vendorNotImported(pair, difference) || difference.kind === 'person') continue;
      const now = difference.servicenow ? valueWords(difference.servicenow, difference.kind) : 'nothing';
      const solusi = valueWords(difference.solusi, difference.kind);
      finding(out, pack, subject, difference.field, `${difference.label}: Solusi has ${solusi}, ServiceNow has ${now}`,
        { change: `${difference.label}: set the value of Solusi`, current: now, set: solusi, ...(difference.kind === 'text' && difference.solusi ? { value: difference.solusi } : {}) }, difference.label);
    }
    // A status ServiceNow did not set by itself and that is not the Solusi status: the import did not bring it.
    const state = pair.servicenow.state;
    if (pair.solusi.status && state && !inList(config.autoStates, state) && !sameWord(state, pair.solusi.status)) {
      finding(out, pack, subject, 'status', `Status: Solusi has ${pair.solusi.status}, ServiceNow has ${state}`,
        { change: 'Status: set the status of Solusi', current: state, set: pair.solusi.status }, 'Status');
    }
  }
  for (const contract of comparison.notInServiceNow) {
    finding(out, pack, contractSubject(null, contract), 'record',
      `In the Solusi contract file (${contract.status || 'no status'}${contract.start ? `, starts ${longDate(contract.start)}` : ''}), not in ServiceNow yet`,
      { change: 'Bring the contract into ServiceNow (upload the Solusi contract file again, or create it)', current: 'not in ServiceNow', set: 'in ServiceNow' }, 'Not in ServiceNow yet');
  }
  return out;
};

/* ------------------------------------------------------------------ problems in the contract data */

/**
 * The active accounts the loaded reports know, by the name of the person (D193): the people of the CIs and their managers,
 * and the people of the ServiceNow contracts. Only an account with a user ID counts, so a line can say which one to set.
 */
export function activeAccounts(cis: Ci[], contracts: ServiceNowContract[]): Map<string, Set<string>> {
  const accounts = new Map<string, Set<string>>();
  const add = (name: string, userId: string, active: boolean | null): void => {
    if (!name.trim() || !userId.trim() || active !== true) return;
    accounts.set(nameKey(name), (accounts.get(nameKey(name)) ?? new Set<string>()).add(userId.trim().toLowerCase()));
  };
  for (const ci of cis) {
    for (const person of Object.values(ci.roles)) {
      if (!person) continue;
      add(person.name, person.userId, person.active);
      add(person.manager, person.managerUserId, person.managerActive);
    }
  }
  for (const contract of contracts) {
    add(contract.owner, contract.ownerUserId, contract.ownerActive);
    add(contract.procurementPartner, contract.procurementPartnerUserId, contract.procurementPartnerActive);
  }
  return accounts;
}

/**
 * The EPO IDs written in the EPO ID column of Solusi (free text): every number of at least `minDigits` digits. `written` keeps
 * the letters in front of it ("AST-0006"), because an EPO ID can be more than digits.
 */
export function epoIdsOf(text: string, minDigits: number): Array<{ written: string; digits: string }> {
  const found: Array<{ written: string; digits: string }> = [];
  for (const written of text.match(/[A-Za-z]*-?\d+/g) ?? []) {
    const digits = written.replace(/^\D+/, '');
    if (digits.length >= Math.max(1, minDigits) && !found.some((known) => known.digits === digits)) found.push({ written, digits });
  }
  return found;
}

/**
 * The problems of the contract data (`problems` in the reference data); a check raises the ones of its `detector.rules`
 * (all when absent). One finding per contract and problem; the field is the id of the problem, so the message shows one
 * table per problem. For Procurement raises the problems of Solusi itself, which only Procurement can correct;
 * "Contracts to fix in ServiceNow" the ones SACM corrects in ServiceNow (D145): on a SACM fix list each finding has its line.
 * An inactive contract owner or Procurement partner is SACM's when an active account with the same name is known (the
 * upload picked the wrong account), and Procurement's when none is (the person left, D193).
 * Every problem is marked as tested, also the ones a check does not raise, so a problem that moved to the other card
 * closes on this one.
 */
const contractProblems: ContractDetector = ({ pack, config, input, comparison, cis, columns }) => {
  const out = empty();
  const solusiDate = input.solusi!.date;
  const running = (contract: SolusiContract): boolean => inList(config.runningStatuses, contract.status);
  const concluded = (contract: SolusiContract): boolean => inList(config.concludedStatuses, contract.status);
  const problem = (id: string) => config.problems.filter((candidate) => candidate.id === id)[0];
  const label = (id: string): string => problem(id)?.label ?? id;
  const wanted = (id: string): boolean => !pack.detector.rules || pack.detector.rules.indexOf(id) >= 0;
  const fixList = pack.playbook.path === 'sacm-fix';
  const fixOf = (id: string, current: string): FixLine | undefined => {
    const words = problem(id);
    return fixList ? { change: words?.change ?? label(id), current, set: words?.set ?? '' } : undefined;
  };
  const raise = (subject: Ci, id: string, detail: string, current: string, field = id): void => {
    if (wanted(id)) finding(out, pack, subject, field, detail, fixOf(id, current), label(id));
  };
  const add = (servicenow: ServiceNowContract | null, solusi: SolusiContract, id: string, detail: string, current = ''): void =>
    raise(contractSubject(servicenow, solusi), id, detail, current);
  const test = (id: string, count: number): void => {
    out.tested.push(`${pack.id}:${id}`);
    if (wanted(id.split('.')[0]!)) out.evaluated[`${pack.id}:${id}`] = count;
  };
  const note = (id: string, text: string): void => { if (wanted(id)) out.notes.push({ checkId: pack.id, note: text }); };
  const byNumber = new Map<string, ServiceNowContract>();
  for (const pair of comparison.pairs) byNumber.set(pair.solusi.number.toLowerCase(), pair.servicenow);
  const servicenowOf = (contract: SolusiContract): ServiceNowContract | null => byNumber.get(contract.number.toLowerCase()) ?? null;
  const active = input.solusi!.contracts.filter((contract) => contract.sheet === 'active');

  // People who are inactive in ServiceNow: ServiceNow knows, Solusi does not. The upload finds a person by name, so it can
  // pick an inactive account while an active one with the same name exists (D193): SACM then sets the active account.
  // When no active account with that name is known, the person left: Procurement names a new person in Solusi.
  const accounts = activeAccounts(cis, input.servicenow!.contracts);
  const runningPairs = comparison.pairs.filter((pair) => running(pair.solusi));
  const people: Array<[string, string, 'owner' | 'procurementPartner', 'ownerActive' | 'procurementPartnerActive', 'ownerUserId' | 'procurementPartnerUserId', string]> = [
    ['ownerInactive', 'ownerLeft', 'owner', 'ownerActive', 'ownerUserId', 'Contract owner'],
    ['partnerInactive', 'partnerLeft', 'procurementPartner', 'procurementPartnerActive', 'procurementPartnerUserId', 'Procurement partner']
  ];
  for (const [id, leftId, field, flagField, idField, word] of people) {
    if (!input.servicenow!.contracts.some((contract) => contract[flagField] !== null)) {
      note(id, `Not tested for an inactive ${word.toLowerCase()}: the ServiceNow contract report has no column that says if the person is active.`);
      note(leftId, `Not tested for a ${word.toLowerCase()} who left: the ServiceNow contract report has no column that says if the person is active.`);
      continue;
    }
    test(id, runningPairs.length);
    test(leftId, runningPairs.length);
    for (const pair of runningPairs) {
      const name = pair.servicenow[field];
      if (!name || pair.servicenow[flagField] !== false) continue;
      const own = pair.servicenow[idField].trim().toLowerCase();
      const others = Array.from(accounts.get(nameKey(name)) ?? []).filter((account) => account !== own).sort();
      const subject = contractSubject(pair.servicenow, pair.solusi);
      if (!others.length) {
        raise(subject, leftId, `${word} ${name} is no longer active in ServiceNow, and no active account with that name is known`, `${name} (inactive)`);
        continue;
      }
      if (!wanted(id)) continue;
      const fix = fixOf(id, `${name} (${own ? `${own}, ` : ''}inactive)`);
      finding(out, pack, subject, id, `${word} ${name} is inactive in ServiceNow${own ? ` (account ${own})` : ''}. An active account with the same name exists: ${others.join(' or ')}`,
        fix ? { ...fix, set: `${name} (${others.join(' or ')})`, ...(others.length === 1 ? { value: others[0]! } : {}) } : undefined, label(id));
    }
  }

  test('endPassed', active.filter(concluded).length);
  test('noEnd', active.filter(concluded).length);
  test('noVendorNumber', active.length);
  test('noOwner', active.filter(running).length);
  for (const contract of active) {
    const servicenow = servicenowOf(contract);
    if (concluded(contract) && contract.end && solusiDate && contract.end < solusiDate) add(servicenow, contract, 'endPassed', `${contract.status}, but the end date ${longDate(contract.end)} has passed`, `${contract.status}, ends ${longDate(contract.end)}`);
    if (concluded(contract) && !contract.end && inList(config.fixedTermWords, contract.duration)) add(servicenow, contract, 'noEnd', `${contract.duration}, but no end date`, `${contract.duration}, no end date`);
    if (!contract.vendorNumber) add(servicenow, contract, 'noVendorNumber', `No vendor number for ${contract.vendor || 'the vendor'}, so the vendor stays empty in ServiceNow`);
    if (running(contract) && !contract.owner) add(servicenow, contract, 'noOwner', 'No contract owner');
  }

  // A name of a person that ServiceNow shows differently: most often free text that ServiceNow did not recognise.
  for (const entry of config.fields) if (entry.kind === 'person') test(`personName.${entry.field}`, comparison.pairs.length);
  for (const pair of comparison.pairs) {
    for (const difference of fieldDifferences(pair, config)) {
      if (difference.kind !== 'person') continue;
      const fix = fixOf('personName', difference.servicenow || 'nobody');
      if (!wanted('personName')) continue;
      finding(out, pack, contractSubject(pair.servicenow, pair.solusi), `personName.${difference.field}`,
        `${difference.label}: Solusi has "${difference.solusi}", ServiceNow has ${difference.servicenow ? `"${difference.servicenow}"` : 'nobody'}`,
        fix ? { ...fix, change: `${difference.label}: ${fix.change}`, set: difference.solusi, ...(difference.solusi ? { value: difference.solusi } : {}) } : undefined, label('personName'));
    }
  }

  // The EPO ID column: a system that is Retired, or a number that is no EPO ID.
  if (!columns.has('assetTag')) {
    note('epoUnknown', 'Not tested for the EPO ID of a contract: the CI report has no column for the EPO ID (asset_tag).');
  } else {
    const systems = new Map<string, Ci[]>();
    for (const ci of cis) {
      if (config.epo.classes.indexOf(ci.className) < 0 || !ci.assetTag.trim()) continue;
      const tag = ci.assetTag.trim().toLowerCase();
      systems.set(tag, (systems.get(tag) ?? []).concat([ci]));
    }
    const retired = (ci: Ci): boolean => inList(config.epo.retiredStatuses, ci.operationalStatus);
    // An id counts as known as it is written ("AST-0006") or by its digits.
    const idsOf = (contract: SolusiContract): string[] => Array.from(new Set(epoIdsOf(contract.epoId, config.epo.minDigits)
      .map((id) => (systems.has(id.written.toLowerCase()) ? id.written.toLowerCase() : id.digits))));
    const withIds = active.filter((contract) => running(contract) && idsOf(contract).length > 0);
    test('epoRetired', withIds.length);
    test('epoUnknown', withIds.length);
    for (const contract of withIds) {
      const ids = idsOf(contract);
      const gone = ids.filter((id) => (systems.get(id) ?? []).length > 0 && systems.get(id)!.every(retired));
      const unknown = ids.filter((id) => !systems.has(id));
      if (gone.length) add(servicenowOf(contract), contract, 'epoRetired', `EPO ID ${gone.map((id) => `${systems.get(id)![0]!.assetTag.trim()} (${systems.get(id)![0]!.name})`).join(', ')}: the system is Retired`);
      if (unknown.length) add(servicenowOf(contract), contract, 'epoUnknown', `EPO ID ${unknown.join(', ')}: not the EPO ID of a system in ServiceNow`);
    }
  }
  return out;
};

export const CONTRACT_DETECTORS: Record<string, ContractDetector> = {
  'contracts/not-in-solusi': notInSolusi,
  'contracts/to-clear': toClear,
  'contracts/status': status,
  'contracts/upload-check': uploadCheck,
  'contracts/problems': contractProblems
};

/**
 * Runs one contract detector. Without both contract files, or without the reference data, the check is not tested and says so.
 * `date` is the date of the CI report the run belongs to; the contracts have their own dates (see ContractInput).
 */
export function runContractDetector(pack: CheckPack, references: References, input: ContractInput | null | undefined, date: string, compare: (input: ContractInput) => ContractComparison, cis: Ci[] = [], columns: Set<string> = new Set()): Output {
  const out = empty();
  const config = contractConfig(references);
  if (!config) { out.notes.push({ checkId: pack.id, note: `Skipped: reference data missing (${CONTRACT_REF}).` }); return out; }
  const missing = [!input?.solusi ? 'no Solusi contract file' : '', !input?.servicenow ? 'no ServiceNow contract report' : ''].filter(Boolean);
  if (missing.length) { out.notes.push({ checkId: pack.id, note: `Not tested: ${missing.join(' and ')}. Load the Solusi contract file and the ServiceNow contract report with the CI report.` }); return out; }
  return CONTRACT_DETECTORS[pack.detector.module ?? '']!({ pack, config, input: input!, comparison: compare(input!), date: date || input!.servicenow!.date, cis, columns });
}
