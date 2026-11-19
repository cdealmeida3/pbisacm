import { plural } from '../../shared/text.ts';
import { reportDate } from '../../shared/dates.ts';
import { nameKey } from '../../shared/names.ts';
import { normaliseHeader } from '../../reading/headers.ts';
import { CONTRACT_PREFIX } from '../../model/model.ts';
import type { Ci, PersonRef, References } from '../../model/model.ts';
import type { Sheet } from '../../reading/xlsx.ts';
import type { ReportType } from '../../reading/table.ts';

/**
 * Contracts: the Solusi contract file compared with the ServiceNow contract report (Operational Activities
 * Instruction 2.8). Pure.
 *
 * Solusi is where contracts live; Procurement owns the data. A scheduled import copies them into ServiceNow, which keeps
 * the Solusi contract number in "Vendor contract". The import has known gaps: it never clears a field, it does not delete a
 * contract, and ServiceNow sets "Expired" by itself, so the real status is kept as a tag. The cards
 * (src/core/checks/detectors/contract-detectors.ts) are SACM's own lists: what to delete, what to clear and which tag to
 * set in ServiceNow. Nothing here sends, deletes or changes anything.
 *
 * A finding about a contract has no CI: its key is `contract:<Solusi number>` (the ServiceNow number when there is none),
 * and the engine hands a CI-shaped record of the contract (`subjects`) to the run, so cases, journals, fix lists and the
 * audit export work as for a CI. What the columns are called and the status words are data:
 * checks/reference/contract-reports.json.
 */

/** The Solusi contract file: known by its contract number, status and partner columns. It comes every Monday. */
export const SOLUSI_FILE: ReportType<'solusi'> = {
  kind: 'solusi', label: 'Solusi contract file', hint: 'Solusi: every contract as Procurement keeps it (Excel, every Monday)', staleAfter: 8,
  needs: [
    { label: 'Contract number', any: ['contract_no'] },
    { label: 'Contract status', any: ['contract_status'] },
    { label: 'Partner name', any: ['partner_name'] }
  ],
  folder: 'solusi'
};

/** The ServiceNow contract report (ast_contract): known by its Number, Vendor contract and State columns. */
export const CONTRACT_REPORT: ReportType<'contract'> = {
  kind: 'contract', label: 'ServiceNow contract report', hint: 'ServiceNow: the contracts, to compare with Solusi', staleAfter: 8,
  needs: [
    { label: 'Number', any: ['number'] },
    { label: 'Vendor contract', any: ['vendor_contract'] },
    { label: 'State', any: ['state'] }
  ],
  folder: 'contracts'
};

export const CONTRACT_REF = 'reference/contract-reports';
/** The class of a contract record in runs and cases. It is not a CI class. */
export const CONTRACT_CLASS = 'contract';

export type ContractField = 'name' | 'vendor' | 'category' | 'start' | 'end' | 'owner' | 'dailyResponsible' | 'procurementPartner';
export type SolusiColumn = 'number' | 'status' | 'vendorNumber' | 'duration' | 'epoId' | 'terminated' | ContractField;
export type ServiceNowColumn = 'number' | 'vendorContract' | 'state' | 'tags' | 'criticality' | 'ownerActive' | 'ownerUserId' | 'ownerEmail'
  | 'procurementPartnerActive' | 'procurementPartnerUserId' | 'procurementPartnerEmail' | ContractField;

export interface ContractConfig {
  solusi: { columns: Record<SolusiColumn, string[]>; /** Values of the number column on the label row (row 2). */ labelRow: string[] };
  servicenow: { columns: Record<ServiceNowColumn, string[]> };
  /** The fields both files hold, compared one to one. */
  fields: Array<{ field: ContractField; label: string; kind: 'text' | 'date' | 'person' }>;
  /** ServiceNow states it sets by itself from the end date: the real status is then a tag. */
  autoStates: string[];
  /** ServiceNow states of a contract not imported yet (typed in by hand). */
  draftStates: string[];
  /** A status written as a tag ("S - Concluded"): a regular expression. */
  statusTag: string;
  /** Solusi statuses of a contract that still runs. */
  runningStatuses: string[];
  /** The tag that sets the criticality of a contract by hand ("Target BC = 2"): a regular expression. */
  targetTag: string;
  /** Solusi statuses of a contract that is signed and runs: the date problems are asked only for these. */
  concludedStatuses: string[];
  /** Duration types of a contract that must have an end date. */
  fixedTermWords: string[];
  /** The EPO ID column of Solusi: the classes whose Asset tag is an EPO ID, the statuses that count as Retired, and how many digits a number needs to count as an EPO ID. */
  epo: { classes: string[]; retiredStatuses: string[]; minDigits: number };
  /** "Contract changes": running contracts that end within these days are counted (short first). */
  endsWithinDays: number[];
  /**
   * The problems in the contract data, in the order of the message For Procurement: id and a short name. A check names the
   * ones it raises in `detector.rules`. `change` and `set`: the words of the line of a SACM fix list, for a problem SACM
   * corrects in ServiceNow ("Contracts to fix in ServiceNow").
   */
  problems: Array<{ id: string; label: string; change?: string; set?: string }>;
}

export function contractConfig(references: References): ContractConfig | null {
  const config = references[CONTRACT_REF] as ContractConfig | undefined;
  return config && config.solusi?.columns && config.servicenow?.columns && Array.isArray(config.fields) ? config : null;
}

export interface SolusiContract {
  number: string;
  status: string;
  name: string;
  vendor: string;
  vendorNumber: string;
  category: string;
  /** yyyy-mm-dd, '' when empty. */
  start: string;
  end: string;
  /** "Fixed-term", "Open-ended" … as Solusi has it. */
  duration: string;
  /** Free text, as Solusi has it: Solusi has no user IDs. */
  owner: string;
  dailyResponsible: string;
  procurementPartner: string;
  epoId: string;
  /** 'terminated': from the tab of the contracts terminated in the last 7 days. */
  sheet: 'active' | 'terminated';
  terminated: string;
}

export interface ServiceNowContract {
  number: string;
  /** The Solusi contract number ('' for a contract typed in by hand). */
  vendorContract: string;
  state: string;
  name: string;
  vendor: string;
  category: string;
  start: string;
  end: string;
  owner: string;
  ownerActive: boolean | null;
  ownerUserId: string;
  ownerEmail: string;
  dailyResponsible: string;
  procurementPartner: string;
  procurementPartnerActive: boolean | null;
  procurementPartnerUserId: string;
  procurementPartnerEmail: string;
  tags: string[];
  /** It still carries a criticality inherited from a CI (one of the inherited CIA-A columns is filled). */
  criticality: boolean;
}

/** A Solusi contract file as saved in the workspace (data/runs/solusi/). No who or when: that is in the journal. */
export interface SolusiRun { kind: 'solusi'; date: string; report: string; loadedBy?: string; loadedByName?: string; loadedAt?: string; contracts: SolusiContract[]; notes: string[] }
/** A ServiceNow contract report as saved in the workspace (data/runs/contracts/). */
export interface ContractRun { kind: 'contract'; date: string; report: string; loadedBy?: string; loadedByName?: string; loadedAt?: string; contracts: ServiceNowContract[]; notes: string[] }

/** What the checks need: the newest of each file (null when none is loaded). The detectors also get the CIs of the CI report (for the EPO ID column). */
export interface ContractInput {
  solusi: { contracts: SolusiContract[]; date: string; report: string } | null;
  servicenow: { contracts: ServiceNowContract[]; date: string; report: string } | null;
}

/* ------------------------------------------------------------------ reading */

function columnsOf<K extends string>(header: string[], columns: Record<K, string[]>): Record<K, number> {
  const headers = header.map(normaliseHeader);
  const at = {} as Record<K, number>;
  for (const column of Object.keys(columns) as K[]) at[column] = headers.findIndex((name) => columns[column].indexOf(name) >= 0);
  return at;
}

const missingOf = <K extends string>(at: Record<K, number>): K[] => (Object.keys(at) as K[]).filter((column) => at[column] < 0);
/** A yes/no cell of the contract reports (already trimmed): no "y" or "n". Exported for the Power BI unit cases. */
export const flag = (value: string): boolean | null => (/^(true|yes|1)$/i.test(value) ? true : /^(false|no|0)$/i.test(value) ? false : null);

export interface SolusiRead { contracts: SolusiContract[]; notes: string[] }

/**
 * The Solusi contract file: every sheet whose first row has the contract number column. Row 2 holds labels and is left out.
 * A sheet with a termination date column is the tab of contracts terminated in the last 7 days; a contract on both tabs counts once, as terminated.
 */
export function readSolusiFile(sheets: Sheet[], config: ContractConfig): SolusiRead {
  const notes: string[] = [];
  const byNumber = new Map<string, SolusiContract>();
  const labels = config.solusi.labelRow.map(nameKey);
  let read = 0;
  let skipped = 0;
  for (const sheet of sheets) {
    const at = columnsOf(sheet.rows[0] ?? [], config.solusi.columns);
    if (at.number < 0) continue;
    read += 1;
    const sheetKind: SolusiContract['sheet'] = at.terminated >= 0 ? 'terminated' : 'active';
    // The tab of terminated contracts has fewer columns: only the active tab is expected to hold them all.
    const missing = sheetKind === 'active' ? missingOf(at).filter((column) => column !== 'terminated') : [];
    if (missing.length) notes.push(`The tab "${sheet.name || 'first'}" of the Solusi contract file has no column for ${missing.join(', ')}. What needs it is not compared.`);
    for (const row of sheet.rows.slice(1)) {
      const cell = (column: SolusiColumn): string => (at[column] < 0 ? '' : (row[at[column]] ?? '').trim());
      const number = cell('number');
      if (!number) { if (row.some((value) => value.trim())) skipped += 1; continue; }
      if (labels.indexOf(nameKey(number)) >= 0) continue;
      const contract: SolusiContract = {
        number, status: cell('status'), name: cell('name'), vendor: cell('vendor'), vendorNumber: cell('vendorNumber'), category: cell('category'),
        start: reportDate(cell('start')), end: reportDate(cell('end')), duration: cell('duration'), owner: cell('owner'),
        dailyResponsible: cell('dailyResponsible'), procurementPartner: cell('procurementPartner'), epoId: cell('epoId'),
        sheet: sheetKind, terminated: reportDate(cell('terminated'))
      };
      const key = number.toLowerCase();
      if (!byNumber.has(key) || sheetKind === 'terminated') byNumber.set(key, contract);
    }
  }
  if (!read) notes.push('No tab of the Solusi contract file has a contract number column (CONTRACT_NO).');
  if (skipped) notes.push(`${plural(skipped, 'row')} ${skipped === 1 ? 'has' : 'have'} no contract number and ${skipped === 1 ? 'was' : 'were'} left out.`);
  return { contracts: Array.from(byNumber.values()), notes };
}

export interface ServiceNowRead { contracts: ServiceNowContract[]; notes: string[] }

export function readContractReport(rows: string[][], config: ContractConfig): ServiceNowRead {
  const header = (rows[0] ?? []).map(normaliseHeader);
  const at = columnsOf(rows[0] ?? [], config.servicenow.columns);
  // The criticality columns by the end of their name, whatever the prefix (u_, or the instance's scoped-app prefix, D351).
  const isCritical = (name: string): boolean => config.servicenow.columns.criticality.some((end) => name === end || name.endsWith(`_${end}`));
  const critical = header.map((name, index) => (isCritical(name) ? index : -1)).filter((index) => index >= 0);
  at.criticality = critical[0] ?? -1;
  const notes: string[] = [];
  const missing = missingOf(at);
  if (missing.length) notes.push(`The ServiceNow contract report has no column for ${missing.join(', ')}. What needs it is not compared.`);
  const contracts: ServiceNowContract[] = [];
  for (const row of rows.slice(1)) {
    const cell = (column: ServiceNowColumn): string => (at[column] < 0 ? '' : (row[at[column]] ?? '').trim());
    const number = cell('number');
    if (!number) continue;
    contracts.push({
      number, vendorContract: cell('vendorContract'), state: cell('state'), name: cell('name'), vendor: cell('vendor'), category: cell('category'),
      start: reportDate(cell('start')), end: reportDate(cell('end')), owner: cell('owner'), ownerActive: flag(cell('ownerActive')),
      ownerUserId: cell('ownerUserId').toLowerCase(), ownerEmail: cell('ownerEmail'), dailyResponsible: cell('dailyResponsible'),
      procurementPartner: cell('procurementPartner'), procurementPartnerActive: flag(cell('procurementPartnerActive')),
      procurementPartnerUserId: cell('procurementPartnerUserId').toLowerCase(), procurementPartnerEmail: cell('procurementPartnerEmail'),
      tags: cell('tags').split(',').map((tag) => tag.trim()).filter(Boolean),
      criticality: critical.some((index) => (row[index] ?? '').trim() !== '')
    });
  }
  return { contracts, notes };
}

/* ------------------------------------------------------------------ matching */

export interface ContractPair { solusi: SolusiContract; servicenow: ServiceNowContract }

export interface ContractComparison {
  pairs: ContractPair[];
  /** In ServiceNow with a Solusi number that the Solusi file does not hold. */
  notInSolusi: ServiceNowContract[];
  /** In ServiceNow with no Solusi number at all (drafts typed in by hand). */
  noNumber: ServiceNowContract[];
  /** In the Solusi file, not in ServiceNow (not imported yet). */
  notInServiceNow: SolusiContract[];
}

/** Matches the two files: Solusi contract number = Vendor contract in ServiceNow. */
export function compareContracts(solusi: SolusiContract[], servicenow: ServiceNowContract[]): ContractComparison {
  const byNumber = new Map<string, SolusiContract>();
  for (const contract of solusi) byNumber.set(contract.number.toLowerCase(), contract);
  const seen = new Set<string>();
  const out: ContractComparison = { pairs: [], notInSolusi: [], noNumber: [], notInServiceNow: [] };
  for (const contract of servicenow) {
    const number = contract.vendorContract.toLowerCase();
    if (!number) { out.noNumber.push(contract); continue; }
    const match = byNumber.get(number);
    if (!match) { out.notInSolusi.push(contract); continue; }
    seen.add(number);
    out.pairs.push({ solusi: match, servicenow: contract });
  }
  out.notInServiceNow = solusi.filter((contract) => !seen.has(contract.number.toLowerCase()));
  return out;
}

/** The key of a contract's cases: its Solusi number, else its ServiceNow number. */
export const contractKey = (number: string): string => `${CONTRACT_PREFIX}${number.trim().toLowerCase()}`;

const person = (name: string, userId = '', email = '', active: boolean | null = null): PersonRef => ({
  name, email, userId, active, manager: '', managerEmail: '', managerUserId: '', managerActive: null, departmentHead: '', departmentHeadEmail: '', departmentHeadUserId: ''
});

/**
 * A contract as a CI-shaped record, so a case about it works like a case about a CI. The name shown is "<number>: <name>";
 * Owned by is the contract owner. It is never mixed with the CIs of the CI report.
 */
export function contractSubject(servicenow: ServiceNowContract | null, solusi: SolusiContract | null): Ci {
  const number = solusi?.number || servicenow?.vendorContract || servicenow?.number || '';
  const name = servicenow?.name || solusi?.name || '';
  const owner = servicenow?.owner ? person(servicenow.owner, servicenow.ownerUserId, servicenow.ownerEmail, servicenow.ownerActive)
    : solusi?.owner ? person(solusi.owner) : undefined;
  return {
    key: contractKey(number), name: name ? `${number}: ${name}` : number, className: CONTRACT_CLASS, sourceClass: 'Contract', assetTag: '',
    contract: { number, name, vendor: servicenow?.vendor || solusi?.vendor || '' },
    operationalStatus: servicenow?.state || solusi?.status || '', description: '', supportGroup: '', tags: servicenow?.tags ?? [],
    roles: owner ? { owned_by: owner } : {}, target: {}, inherited: {}, exceptionStatus: '', exceptionJustification: '', discoverySource: '', serviceMapped: null
  };
}

export const sameWord = (a: string, b: string): boolean => nameKey(a) === nameKey(b);
export const inList = (list: string[], value: string): boolean => list.some((entry) => sameWord(entry, value));

/** The status tag of a ServiceNow contract ("S - Concluded"), or ''. */
export function statusTagOf(contract: ServiceNowContract, config: ContractConfig): string {
  const pattern = new RegExp(config.statusTag, 'i');
  return contract.tags.filter((tag) => pattern.test(tag))[0] ?? '';
}
