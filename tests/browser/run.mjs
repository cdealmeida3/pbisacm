// Runs the twelve browser checks on the built app, one after the other: two managers at once, the EPO systems report,
// the contracts, criticality, the relationship cards, lifecycle, tags and Settings, the numbers, times and words, the messages and follow-up, each card as its kind, the first screen, Settings and Audit, and the look (capitals, three dots, sizes, font, wrapped and cut labels). Invented data only. Not part of npm test: it needs Playwright with Chromium (see harness.mjs).
// Run: npm run browser (after npm run build); npm run browser -- followup cards runs only the checks named, by their file
// names in any letter case. An unknown name stops the run before a browser starts. Screenshots go to .build/browser/.
import { pilot } from './pilot.mjs';
import { epo } from './epo.mjs';
import { contracts } from './contracts.mjs';
import { criticality } from './criticality.mjs';
import { relationships } from './relationships.mjs';
import { lifecycle } from './lifecycle.mjs';
import { numbers } from './numbers.mjs';
import { followup } from './followup.mjs';
import { cardKinds } from './cards.mjs';
import { firstScreen } from './firstscreen.mjs';
import { settings } from './settings.mjs';
import { look } from './look.mjs';

/** The checks by their file names, in the order they run. */
const CHECKS = { pilot, epo, contracts, criticality, relationships, lifecycle, numbers, followup, cards: cardKinds, firstscreen: firstScreen, settings, look };

const asked = process.argv.slice(2);
const only = asked.map((name) => name.toLowerCase());
const unknown = asked.filter((name) => !Object.hasOwn(CHECKS, name.toLowerCase()));
if (unknown.length) {
  // An unknown name stops the run. Before, it ran no check and passed.
  for (const name of unknown) console.error(`Unknown browser check: ${name}. The checks are: ${Object.keys(CHECKS).join(', ')}.`);
  process.exit(2);
}

const results = [];
for (const [name, check] of Object.entries(CHECKS).filter(([name]) => !only.length || only.includes(name))) {
  console.log(`\n######## ${name}`);
  results.push(await check());
}
console.log('\nBrowser checks:');
for (const result of results) console.log(`  ${result.name}: ${result.passed} of ${result.total} passed${result.failed.length ? ` (failed: ${result.failed.join('; ')})` : ''}`);
process.exit(results.every((result) => !result.failed.length) ? 0 : 1);
