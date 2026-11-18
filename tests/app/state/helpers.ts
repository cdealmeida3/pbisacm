import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setContent } from '../../../src/app/state/content.ts';
import { start } from '../../../src/app/state/folder.ts';
import { loadSources } from '../../../src/app/state/loading.ts';
import { state } from '../../../src/app/state/store.ts';
import { MemoryWorkspace } from '../../../src/app/platform/workspace.ts';
import type { ReportSource } from '../../../src/app/state/loading.ts';
import { loadPacks, loadReferences } from '../../../src/hosts/cli.ts';
import { RECORD_DATE } from '../../sample-record.ts';

/*
 * For the tests of the actions (src/app/state/): they run with the in-memory folder, and the check packs, reference
 * data and samples come from the files of the repository (in the app, Vite packs the same files into the page).
 */

const repo = join(import.meta.dirname, '../../..');
const sampleText = (name: string): string => readFileSync(join(repo, 'samples', name), 'utf8');

/** Hands the check packs, the reference data and the invented samples to the actions. */
export function useRepositoryContent(): void {
  setContent({
    packs: loadPacks(), references: loadReferences(),
    samples: {
      report: sampleText('cmdb_ci-sample.csv'), relationships: sampleText('cmdb_rel_ci-sample.csv'), epo: sampleText('epo-systems-sample.csv'),
      solusi: sampleText('solusi-contracts-sample.csv'), contracts: sampleText('servicenow-contracts-sample.csv'), solusiEarlier: sampleText('solusi-contracts-sample-earlier.csv')
    }
  });
}

/** A sample file as a picked report file of a given date. */
export const sampleSource = (file: string, date: string, name = file): ReportSource =>
  ({ name, path: '', date, modified: Date.parse(`${date}T08:00:00Z`), bytes: async () => new Uint8Array(readFileSync(join(repo, 'samples', file))) });

export const TEST_USER = { name: 'Test Manager', email: 'test.manager@example.com' };
export const COLLEAGUE = { name: 'Alex Example', email: 'alex.example@example.com' };
export const EARLIER = '2026-11-04';

/** A new team folder in memory, opened by the test manager. */
export async function openFolder(user = TEST_USER): Promise<MemoryWorkspace> {
  const workspace = new MemoryWorkspace('Team folder');
  state.user = { ...user };
  await start(workspace, 'folder');
  return workspace;
}

/** As the recording does it: the Solusi file of a week earlier first, then the other files and the CI report together. */
export async function loadTheSamples(): Promise<void> {
  await loadSources([sampleSource('solusi-contracts-sample-earlier.csv', EARLIER, 'solusi-contracts-sample.csv')]);
  await loadSources([
    sampleSource('cmdb_ci-sample.csv', RECORD_DATE), sampleSource('cmdb_rel_ci-sample.csv', RECORD_DATE), sampleSource('epo-systems-sample.csv', RECORD_DATE),
    sampleSource('solusi-contracts-sample.csv', RECORD_DATE), sampleSource('servicenow-contracts-sample.csv', RECORD_DATE)
  ]);
}

/** The journal keeps the time to the second, and a manager never presses two buttons in the same second: wait for the next one. */
export const nextSecond = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 1100 - (Date.now() % 1000)));
