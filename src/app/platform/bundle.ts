import { checksInUse } from '../../core/checks/engine.ts';
import type { CheckPack, References } from '../../core/model/model.ts';
import sample from '../../../samples/cmdb_ci-sample.csv?raw';
import relationshipSample from '../../../samples/cmdb_rel_ci-sample.csv?raw';
import epoSample from '../../../samples/epo-systems-sample.csv?raw';
import solusiSample from '../../../samples/solusi-contracts-sample.csv?raw';
import solusiEarlierSample from '../../../samples/solusi-contracts-sample-earlier.csv?raw';
import contractSample from '../../../samples/servicenow-contracts-sample.csv?raw';
import pkg from '../../../package.json';

/* Packed into the built file by Vite: the check packs, their reference data and an invented sample report for the demo. */

const packFiles = import.meta.glob<CheckPack>('../../../checks/packs/*/*.json', { eager: true, import: 'default' });
const referenceFiles = import.meta.glob<unknown>('../../../checks/reference/*.json', { eager: true, import: 'default' });

const fileName = (path: string): string => path.split('/').pop()!;
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
/**
 * A new check pack adds a card by itself: its `dimension` decides the section. In the order of the file names, whatever the
 * folder. A check switched off (`status: "off"`) is left out: it does not run and has no card.
 */
export const CHECK_PACKS: CheckPack[] = checksInUse(Object.keys(packFiles).sort((a, b) => byText(fileName(a), fileName(b)) || byText(a, b)).map((path) => packFiles[path]!));

/** The folder of each check file (`ci`, `relationships`, `epo`, `contracts`, `lifecycle`), by check id: the subject of its card. */
const PACK_FOLDERS: Record<string, string> = {};
for (const path of Object.keys(packFiles)) PACK_FOLDERS[packFiles[path]!.id] = path.split('/').slice(-2)[0]!;
export const packFolder = (id: string): string => PACK_FOLDERS[id] ?? 'ci';

export const REFERENCES: References = {};
for (const path of Object.keys(referenceFiles)) {
  REFERENCES[`reference/${path.split('/').pop()!.replace(/\.json$/, '')}`] = referenceFiles[path];
}

export const SAMPLE_REPORT: string = sample;
export const SAMPLE_RELATIONSHIPS: string = relationshipSample;
export const SAMPLE_EPO: string = epoSample;
export const SAMPLE_SOLUSI: string = solusiSample;
export const SAMPLE_CONTRACTS: string = contractSample;
/** The invented Solusi contract file of a week earlier, so the page Contract changes has something to show in the demo. */
export const SAMPLE_SOLUSI_EARLIER: string = solusiEarlierSample;
export const APP_VERSION: string = pkg.version;
