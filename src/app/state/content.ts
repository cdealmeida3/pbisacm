import type { CheckPack, References } from '../../core/model/model.ts';

/**
 * What the actions check with: the check packs, their reference data and the invented samples of the demo.
 * The app hands in what Vite packed into the built file (platform/bundle.ts, see main.tsx); the tests hand in the files of checks/.
 * So the actions run in the browser and under node:test alike.
 */
export interface Content {
  packs: CheckPack[];
  references: References;
  /** The invented reports of the demo. `solusiEarlier`: the Solusi contract file of a week earlier, for the page Contract changes. */
  samples: { report: string; relationships: string; epo: string; solusi: string; contracts: string; solusiEarlier: string };
}

export const content: Content = {
  packs: [], references: {},
  samples: { report: '', relationships: '', epo: '', solusi: '', contracts: '', solusiEarlier: '' }
};

/** Called once at start, before anything else. */
export function setContent(values: Content): void { Object.assign(content, values); }
