/**
 * The recorded result of the invented samples: every finding, case, card, owner group, message and export that the
 * five sample reports give on a fixed date, written as text files in `tests/recorded/`. `sample-record.test.ts` compares
 * them at every change, so a cleanup that changes a result fails. After a change that is meant to change a result,
 * write them again with `npm run record` and check the difference in the pull request.
 *
 * It follows what the app does when a manager loads the reports (src/app/state/loading.ts, saveCiRun; tests/app/state/loading.test.ts checks that both give the same run): the Solusi contract file
 * of a week earlier first, then the Relationship, EPO and contract files, then the CI report. Only invented data.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { buildCases, buildRun, groupCases, moduleScores } from '../src/core/cases/cases.ts';
import type { Case } from '../src/core/cases/cases.ts';
import { runChecks } from '../src/core/checks/engine.ts';
import { withTeamDays } from '../src/core/checks/detectors/ci-detectors.ts';
import { contractChanges, contractInformation } from '../src/core/sources/contracts/contract-changes.ts';
import { contractConfig, readContractReport, readSolusiFile } from '../src/core/sources/contracts/contract-reports.ts';
import type { ContractRun, SolusiRun } from '../src/core/sources/contracts/contract-reports.ts';
import { epoConfig, readEpoReport } from '../src/core/sources/epo/epo-report.ts';
import type { EpoRun } from '../src/core/sources/epo/epo-report.ts';
import { buildDrafts, chatMessage } from '../src/core/messages/messages.ts';
import type { MessageSettings } from '../src/core/messages/messages.ts';
import { hiddenNames, readRelationshipReport } from '../src/core/sources/relationships/relationship-report.ts';
import type { RelationshipRun } from '../src/core/sources/relationships/relationship-report.ts';
import { hiddenNotes, readCiReport } from '../src/core/sources/ci/ci-report.ts';
import { readTable } from '../src/core/reading/table.ts';
import type { Table } from '../src/core/reading/table.ts';
import { verificationCsv, verificationRecord } from '../src/core/audit/audit.ts';
import { cardSummaries, cardTotals } from '../src/app/view/cards.ts';
import { changesCsv, exportCapabilityCsv, exportContractCsv, exportCsv, exportFixCsv } from '../src/app/view/exports.ts';
import { isFixList } from '../src/app/view/fix-list.ts';
import { ownerGroups } from '../src/app/view/groups.ts';
import { peopleIndex, peopleOf } from '../src/app/view/people.ts';
import { capabilitySheet } from '../src/core/mapping/capability-sheet.ts';
import { reportTiles } from '../src/app/view/tiles.ts';
import type { AppRun } from '../src/app/view/people.ts';
import { loadPacks, loadReferences } from '../src/hosts/cli.ts';
import { emailsOf } from '../tools/powerbi/email.ts';
import { realShapeRecord } from './real-shape.ts';
import type { Draft } from '../src/core/messages/messages.ts';

/** The day the reports are loaded. Fixed, so the record never depends on the day the tests run. */
export const RECORD_DATE = '2026-11-11';
/** The date of the Solusi contract file of a week earlier. */
export const EARLIER = '2026-11-04';

/** The team settings of a new team folder that matter for the result (src/app/state/store.ts). */
const RULES = { reminderDays: 3, maxReminders: 2 };
export const SETTINGS: MessageSettings = {
  portalLink: 'https://portal.example.com/sacm', signature: 'SACM team', senderName: 'Demo User',
  epoOwnerName: 'Eve Inventory', epoOwnerEmail: 'eve.inventory@example.com',
  procurementName: 'Procurement', procurementEmail: 'procurement@example.com',
  teams: { 'process-management': { name: 'Process Management', people: [{ name: 'Pat Process', email: 'pat.process@example.com' }, { name: 'Quinn Process', email: 'quinn.process@example.com' }] } }
};

const root = join(import.meta.dirname, '..');
const utf8 = new TextDecoder('utf-8');
const table = (path: string): Promise<Table> =>
  readTable(new Uint8Array(readFileSync(path)), async (data) => new Uint8Array(inflateRawSync(data)), (data) => utf8.decode(data));

/** The report files of one recording: a path and the name the file had in the team folder. */
export interface RecordFile { path: string; name: string }
export interface RecordFiles {
  ci: RecordFile;
  relationship: RecordFile;
  epo: RecordFile;
  solusi: RecordFile;
  /** The Solusi contract file of a week earlier (page Contract changes). */
  solusiEarlier: RecordFile;
  contracts: RecordFile;
}
const inSamples = (name: string): RecordFile => ({ path: join(root, 'samples', name), name });
export const SAMPLE_FILES: RecordFiles = {
  ci: inSamples('cmdb_ci-sample.csv'), relationship: inSamples('cmdb_rel_ci-sample.csv'), epo: inSamples('epo-systems-sample.csv'),
  solusi: inSamples('solusi-contracts-sample.csv'), solusiEarlier: inSamples('solusi-contracts-sample-earlier.csv'), contracts: inSamples('servicenow-contracts-sample.csv')
};

const isCase = (item: unknown): item is Case => !!item && typeof item === 'object' && 'fact' in item && 'timeline' in item && 'key' in item;

/**
 * JSON with a stable shape: Maps and Sets as plain values, a check pack only by its id. Outside cases.json a case is
 * written only by its key, so each case is recorded once.
 */
function json(value: unknown, casesAsKeys = true): string {
  return JSON.stringify(value, function (this: unknown, key, item: unknown) {
    if (item instanceof Map) return Object.fromEntries([...item.entries()].map(([k, v]) => [String(k), v]));
    if (item instanceof Set) return [...item].sort();
    if (key === 'pack' && item && typeof item === 'object' && 'id' in item) return (item as { id: string }).id;
    if (casesAsKeys && isCase(item)) return `case ${item.key}`;
    return item;
  }, 2) + '\n';
}
const caseKeys = (cases: Case[]): string[] => cases.map((item) => item.key);

/** File name (under tests/recorded/) → its content, for the invented samples. */
/** The recorded result of the samples, with that of the real-shape samples (tests/real-shape.ts, D353). */
export const recordSamples = async (): Promise<Record<string, string>> => ({ ...await recordReports(SAMPLE_FILES), 'real-shape.json': await realShapeRecord() });

/** The same for any set of report files (tools/fingerprint.ts uses it on real files, which are never recorded). */
export async function recordReports(files: RecordFiles): Promise<Record<string, string>> {
  const packs = loadPacks();
  const base = loadReferences();
  const references = withTeamDays(base, {});
  const out: Record<string, string> = {};

  const relTable = await table(files.relationship.path);
  const relationship: RelationshipRun = { kind: 'relationship', date: RECORD_DATE, report: files.relationship.name, ...readRelationshipReport(relTable.rows) } as RelationshipRun;
  const epoRead = readEpoReport((await table(files.epo.path)).rows, epoConfig(base)!);
  const epo: EpoRun = { kind: 'epo', date: RECORD_DATE, report: files.epo.name, systems: epoRead.systems, notes: epoRead.notes };
  const config = contractConfig(base)!;
  const solusiOf = async (file: RecordFile, date: string): Promise<SolusiRun> => {
    const t = await table(file.path);
    const read = readSolusiFile(t.sheets ?? [{ name: '', rows: t.rows }], config);
    return { kind: 'solusi', date, report: file.name, contracts: read.contracts, notes: read.notes };
  };
  const solusiEarlier = await solusiOf(files.solusiEarlier, EARLIER);
  const solusi = await solusiOf(files.solusi, RECORD_DATE);
  const contractRead = readContractReport((await table(files.contracts.path)).rows, config);
  const contracts: ContractRun = { kind: 'contract', date: RECORD_DATE, report: files.contracts.name, contracts: contractRead.contracts, notes: contractRead.notes };

  const ciTable = await table(files.ci.path);
  const report = readCiReport(ciTable.rows, { lossless: ciTable.lossless, knownHidden: !ciTable.lossless ? hiddenNames(relationship.relationships) : undefined });
  const result = runChecks(report.cis, report.columns, packs, references, {
    relationships: relationship.relationships, date: RECORD_DATE,
    epo: { systems: epo.systems, date: epo.date, report: epo.report, previousDate: '' },
    contracts: { solusi: { contracts: solusi.contracts, date: solusi.date, report: solusi.report }, servicenow: { contracts: contracts.contracts, date: contracts.date, report: contracts.report } }
  });
  const core = buildRun(report.cis, result, packs, RECORD_DATE, files.ci.name, references);
  core.notes.push(...hiddenNotes(report));
  core.relationshipReport = relationship.report;
  core.epoReport = epo.report;
  core.solusiReport = solusi.report;
  core.contractReport = contracts.report;
  // As the app saves it (src/app/state/loading.ts): the capability sheet is kept with the run (D205).
  const capabilities = capabilitySheet(report.cis, relationship.relationships, references);
  const run: AppRun = {
    ...core, people: peopleOf(report.cis.concat(result.subjects ?? []), core.facts.map((fact) => fact.ciKey).concat((core.inventory ?? []).map((row) => row[0]))),
    ...(capabilities ? { capabilities } : {})
  };

  out['run-result.json'] = json({ findings: result.findings, tested: result.tested, evaluated: result.evaluated, notes: result.notes });
  out['run.json'] = json(run);

  const cases = buildCases([run], [], [], RECORD_DATE, RULES);
  const people = peopleIndex([run]);
  out['cases.json'] = json(cases, false);
  out['case-groups.json'] = json(groupCases(cases));
  out['scores.json'] = json(moduleScores(run, packs));

  const cards = cardSummaries(packs, run, cases, people, relationship.relationships.length, epo.systems.length, true);
  out['cards.json'] = json(cards);
  out['owner-groups.json'] = json(Object.fromEntries(cards.map((card) => [card.id, ownerGroups(card.main, people)])));
  out['tiles.json'] = json(reportTiles(run, relationship, RECORD_DATE, 7, epo, '', solusi, contracts, solusiEarlier, cardTotals(cards)));

  let ref = 0;
  const { drafts, skipped } = buildDrafts(cases.filter((item) => item.state === 'open'), packs, SETTINGS, () => `SACM-REC-${String(++ref).padStart(3, '0')}`);
  out['messages.txt'] = drafts.map((draft) => [
    `===== ${draft.ref} (${draft.kind}, part ${draft.part.index} of ${draft.part.count}, ${draft.ciCount} CIs, ${draft.checkIds.join(' ')})`,
    `To: ${draft.to}`, `Cc: ${draft.cc}`, `Subject: ${draft.subject}`, `Keys: ${draft.keys.join(' ')}`,
    '--- text', draft.plain, '--- html', draft.body, ''
  ].join('\n')).join('\n') + `\n===== skipped: ${caseKeys(skipped).join(' ')}\n`;
  // The emails of the Power BI report (D313, D314, tools/powerbi/email.ts): the drafts above laid out as emails, and the
  // same cases with at most 2 CIs per message and 2 lines per table, so the joined parts and the attached file are recorded too.
  Object.assign(out, recordEmails('emails', drafts, 10));
  let split = 0;
  const splitDrafts = buildDrafts(cases.filter((item) => item.state === 'open'), packs, SETTINGS, () => `SACM-SPL-${String(++split).padStart(3, '0')}`, { maxCis: 2 }).drafts;
  Object.assign(out, recordEmails('emails/split', splitDrafts, 2));
  out['teams-messages.txt'] = cards.filter((card) => card.open.length).map((card) =>
    `===== ${card.id}\n${chatMessage(card.open, packs, SETTINGS, `SACM-CHAT-${card.id}`)}\n`).join('\n');

  for (const card of cards) {
    if (!card.main.length) continue;
    const csv = card.pack.subject === 'contract' ? exportContractCsv(card.main, packs) : isFixList(card.pack) ? exportFixCsv(card.main) : exportCsv(card.main, people, packs);
    out[`exports/${card.id}.csv`] = csv;
  }
  out['exports/verification-record.csv'] = verificationCsv(verificationRecord(run, null, packs, { name: 'Demo User', at: `${RECORD_DATE}T08:00:00Z` }));
  out['exports/contract-changes.csv'] = changesCsv(contractChanges(solusiEarlier, solusi));
  out['exports/capability-sheet.csv'] = exportCapabilityCsv(run.capabilities ?? []);
  out['contract-information.json'] = json(contractInformation(solusi.contracts, RECORD_DATE, config));
  return out;
}

/** The emails of `drafts` as files of `folder`: <ref>.html, <ref>.csv when there is a file, and index.txt with the subject and "In this email" of each. */
function recordEmails(folder: string, drafts: Draft[], rowsInEmail: number): Record<string, string> {
  const out: Record<string, string> = {};
  const index: string[] = [];
  const emails = emailsOf(drafts, (at) => drafts[at]!.ref, rowsInEmail);
  emails.forEach((email, at) => {
    if (email.first !== at) return;
    const ref = drafts[at]!.ref;
    const parts = emails.filter((other) => other.first === at).length;
    out[`${folder}/${ref}.html`] = email.html;
    if (email.csv) out[`${folder}/${ref}.csv`] = email.csv;
    index.push(`===== ${ref} (${parts} ${parts === 1 ? 'draft' : 'drafts'}${email.csv ? ', with a file' : ''})`, `Keys: ${drafts[at]!.keys.join(' ')}`, `Subject: ${email.subject}`, email.summary, '');
  });
  out[`${folder}/index.txt`] = index.join('\n');
  return out;
}
