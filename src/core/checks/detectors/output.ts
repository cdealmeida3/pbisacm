import type { RunResult } from '../../model/model.ts';

/** What a detector gives back: its findings, what it tested, how many CIs it evaluated, and its notes. */
export type DetectorOutput = Pick<RunResult, 'findings' | 'tested' | 'evaluated' | 'notes'>;

/** An output with nothing in it yet. */
export const emptyOutput = (): DetectorOutput => ({ findings: [], tested: [], evaluated: {}, notes: [] });
