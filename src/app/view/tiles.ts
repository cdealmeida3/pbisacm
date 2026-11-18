import { screenDate } from '../../core/shared/dates.ts';
import { REPORT_TYPES } from '../../core/sources/report-types.ts';
import { matchEnds } from '../../core/sources/relationships/relationship-report.ts';
import { compareContracts } from '../../core/sources/contracts/contract-reports.ts';
import { contractChanges } from '../../core/sources/contracts/contract-changes.ts';
import type { KnownReportType } from '../../core/sources/report-types.ts';
import type { RelationshipRun } from '../../core/sources/relationships/relationship-report.ts';
import type { EpoRun } from '../../core/sources/epo/epo-report.ts';
import type { ContractRun, SolusiRun } from '../../core/sources/contracts/contract-reports.ts';
import type { AppRun } from './people.ts';
import { findingsText, laterText } from './cards.ts';
import type { CardTotals } from './cards.ts';

/**
 * The Reports strip: one tile per report type, with the latest load, who loaded it, and how it fits with the other reports.
 */

export interface ReportTile {
  /** The report type as the tile shows it (where its loads are kept is not shown). */
  type: Omit<KnownReportType, 'folder'>;
  /** Null: no report of this kind is loaded. */
  load: null | {
    file: string;
    date: string;
    loadedByName: string;
    loadedAt: string;
    /** One line: what the report holds. */
    summary: string;
    /** More lines: how it fits with the other reports. */
    details: string[];
  };
  /** Days between the report date and today. */
  ageDays: number;
  stale: boolean;
}

const dayNumber = (iso: string): number => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86400000);
const count = (value: number, word: string, many = `${word}s`): string => `${value.toLocaleString('en-GB')} ${value === 1 ? word : many}`;

/**
 * One tile per report type: the latest load, who loaded it, and a warning when the report is older than `staleDays`.
 * `totals`: the cards of the overview, so the CI report tile counts the findings to solve as the sections do.
 */
export function reportTiles(ci: AppRun | undefined, relationship: RelationshipRun | null, today: string, staleDays: number, epo: EpoRun | null = null, epoPrevious = '', solusi: SolusiRun | null = null, contracts: ContractRun | null = null, solusiPrevious: SolusiRun | null = null, totals?: CardTotals): ReportTile[] {
  return REPORT_TYPES.map((type): ReportTile => {
    let load: ReportTile['load'] = null;
    if (type.kind === 'ci' && ci) {
      load = {
        file: ci.report, date: ci.date, loadedByName: ci.loadedByName ?? '', loadedAt: ci.loadedAt ?? '',
        summary: `${count(ci.cis, 'CI')} · ${totals ? findingsText(totals) : `${count(ci.facts.filter((fact) => (fact.state ?? 'open') === 'open').length, 'finding')} to solve`}${totals && laterText(totals) ? ` · ${laterText(totals)}` : ''}`, details: []
      };
    }
    if (type.kind === 'relationship' && relationship) {
      const details: string[] = [];
      if (ci && ci.ciKeys) {
        const match = matchEnds(relationship.relationships, ci.ciKeys);
        details.push(match.unmatched === 0 ? 'Every parent and child is a CI of the CI report.'
          : `${count(match.unmatched, 'end')} (parent or child) ${match.unmatched === 1 ? 'is' : 'are'} not in the CI report of ${screenDate(ci.date)}.`);
        if (match.hidden) details.push(`${count(match.hidden, 'name')} ${match.hidden === 1 ? 'holds' : 'hold'} a hidden character. ${match.hidden === 1 ? 'It is' : 'They are'} matched without it.`);
      } else if (!ci) details.push('Load the CI report too, to match the relationships with the CIs.');
      details.push(...relationship.notes);
      load = {
        file: relationship.report, date: relationship.date, loadedByName: relationship.loadedByName ?? '', loadedAt: relationship.loadedAt ?? '',
        summary: count(relationship.relationships.length, 'relationship'), details
      };
    }
    if (type.kind === 'epo' && epo) {
      const live = epo.systems.filter((system) => system.status !== 'Retired');
      const details: string[] = [];
      if (ci && ci.inventory) {
        const tags = new Set(ci.inventory.filter((row) => row[3] === 'service_instance' && row[5]).map((row) => row[5].trim().toLowerCase()));
        const without = live.filter((system) => !tags.has(system.epoId.trim().toLowerCase())).length;
        details.push(without === 0 ? `Every system that is not Retired has a Service Instance in the CI report of ${screenDate(ci.date)}.`
          : `${count(without, 'system')} that ${without === 1 ? 'is' : 'are'} not Retired ${without === 1 ? 'has' : 'have'} no live Service Instance in the CI report of ${screenDate(ci.date)}.`);
      } else if (!ci) details.push('Load the CI report too, to compare EPO with ServiceNow.');
      if (epoPrevious) {
        const changed = epo.systems.filter((system) => system.changed && system.changed > epoPrevious).length;
        details.push(`${count(changed, 'system')} changed in EPO since the EPO systems report of ${epoPrevious}.`);
      }
      details.push(...epo.notes);
      load = {
        file: epo.report, date: epo.date, loadedByName: epo.loadedByName ?? '', loadedAt: epo.loadedAt ?? '',
        summary: `${count(epo.systems.length, 'system')} · ${live.length.toLocaleString('en-GB')} not Retired`, details
      };
    }
    if (type.kind === 'solusi' && solusi) {
      const terminated = solusi.contracts.filter((contract) => contract.sheet === 'terminated').length;
      const details: string[] = [];
      if (contracts) {
        const compared = compareContracts(solusi.contracts, contracts.contracts);
        details.push(compared.notInServiceNow.length === 0 ? `Every contract is in the ServiceNow contract report of ${screenDate(contracts.date)}.`
          : `${count(compared.notInServiceNow.length, 'contract')} ${compared.notInServiceNow.length === 1 ? 'is' : 'are'} not in the ServiceNow contract report of ${screenDate(contracts.date)} (not imported yet).`);
      } else details.push('Load the ServiceNow contract report too, to compare the two.');
      if (solusiPrevious) {
        const changes = contractChanges(solusiPrevious, solusi);
        details.push(`${count(changes.added.length + changes.left.length + changes.status.length + changes.fields.length, 'change')} since the Solusi contract file of ${screenDate(solusiPrevious.date)}: see Contract changes.`);
      }
      details.push(...solusi.notes);
      load = {
        file: solusi.report, date: solusi.date, loadedByName: solusi.loadedByName ?? '', loadedAt: solusi.loadedAt ?? '',
        summary: `${count(solusi.contracts.length, 'contract')} · ${terminated.toLocaleString('en-GB')} terminated in the last 7 days`, details
      };
    }
    if (type.kind === 'contract' && contracts) {
      const details: string[] = [];
      if (solusi) {
        const compared = compareContracts(solusi.contracts, contracts.contracts);
        details.push(`${count(compared.pairs.length, 'contract')} ${compared.pairs.length === 1 ? 'is' : 'are'} also in the Solusi contract file of ${screenDate(solusi.date)}; ${(compared.notInSolusi.length + compared.noNumber.length).toLocaleString('en-GB')} ${compared.notInSolusi.length + compared.noNumber.length === 1 ? 'is' : 'are'} not.`);
      } else details.push('Load the Solusi contract file too, to compare the two.');
      details.push(...contracts.notes);
      load = {
        file: contracts.report, date: contracts.date, loadedByName: contracts.loadedByName ?? '', loadedAt: contracts.loadedAt ?? '',
        summary: count(contracts.contracts.length, 'contract'), details
      };
    }
    const ageDays = load ? Math.max(0, dayNumber(today) - dayNumber(load.date)) : 0;
    const { folder: _folder, ...shown } = type;
    return { type: shown, load, ageDays, stale: !!load && ageDays > Math.max(staleDays, type.staleAfter ?? 0) };
  });
}

/**
 * The reports that changed (loaded or removed) after the checks of the latest CI report ran: the cards still show the
 * result of the reports it was checked with. Read from the names the run keeps, so no file changes.
 */
export function changedAfterChecks(ci: AppRun | undefined, relationship: RelationshipRun | null, epo: EpoRun | null, solusi: SolusiRun | null, contracts: ContractRun | null): string[] {
  if (!ci) return [];
  const label = (kind: string): string => REPORT_TYPES.filter((type) => type.kind === kind)[0]!.label;
  const pairs: Array<[string, string | undefined, { report: string } | null]> = [
    ['relationship', ci.relationshipReport, relationship], ['epo', ci.epoReport, epo], ['solusi', ci.solusiReport, solusi], ['contract', ci.contractReport, contracts]
  ];
  return pairs.filter(([, used, now]) => (used ?? '') !== (now?.report ?? '')).map(([kind]) => label(kind));
}

/** "The EPO systems report changed after the checks ran. The cards still show the old result." */
export function changedAfterChecksText(labels: string[]): string {
  if (!labels.length) return '';
  const names = labels.length === 1 ? `The ${labels[0]}` : `The ${labels.slice(0, -1).join(', the ')} and the ${labels[labels.length - 1]}`;
  return `${names} changed after the checks ran. The cards still show the old result.`;
}

/** The Reports line (F26): one line for the five reports, its tooltip, and whether it opens to the tiles by itself. */
export interface ReportsLine { text: string; tip: string; warning: string; opens: boolean }

const listWords = (names: string[]): string => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/**
 * "5 reports · 12 Nov · fresh" (shorter since version 0.30, labels.md); the load time is in the tooltip. The old-report
 * warning is written once, here, not on each tile. The line opens to the tiles by itself only when a report is missing,
 * old, or changed after the checks ran. `day` and `time` format a report date and a load time for the screen.
 */
export function reportsLine(tiles: ReportTile[], changedText: string, day: (iso: string) => string, time: (at: string) => string): ReportsLine {
  const loaded = tiles.filter((tile) => tile.load);
  const missing = tiles.filter((tile) => !tile.load).map((tile) => tile.type.label);
  const stale = loaded.filter((tile) => tile.stale);
  const newest = loaded.slice().sort((a, b) => b.load!.date.localeCompare(a.load!.date) || b.load!.loadedAt.localeCompare(a.load!.loadedAt))[0];
  const parts: string[] = [];
  parts.push(missing.length ? `${loaded.length} of ${tiles.length} reports` : count(loaded.length, 'report'));
  if (newest) parts.push(day(newest.load!.date));
  if (missing.length) parts.push(`not loaded: ${listWords(missing)}`);
  if (!missing.length && !stale.length && !changedText) parts.push('fresh');
  const tip = newest ? `Newest report of ${day(newest.load!.date)}${newest.load!.loadedAt ? `, loaded ${time(newest.load!.loadedAt)}` : ''}` : '';
  const old = listWords(stale.map((tile) => `the ${tile.type.label} is ${tile.ageDays} days old`));
  const warning = old ? `${old.charAt(0).toUpperCase()}${old.slice(1)}. Load a newer one before you write to people.` : '';
  return { text: parts.join(' · '), tip, warning, opens: missing.length > 0 || stale.length > 0 || !!changedText };
}
