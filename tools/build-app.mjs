// Builds app/SACM-Workbench.html with Vite: one file with the styles, React, the core, the check packs and the sample.
// The check files are validated first (src/core/checks/check-files.ts).
// Run: npm run build (after npm install). The result is checked so that the page cannot load anything from the network.
import { build } from 'vite';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateCheckFiles, validateRecordTeams } from '../src/core/checks/check-files.ts';
import { loadPacks, loadReferences } from '../src/hosts/cli.ts';

const root = join(import.meta.dirname, '..');

// The check files go into the page: a wrong field, rule word, detector, class or request stops the build.
const problems = validateCheckFiles(loadPacks(), loadReferences()).concat(validateRecordTeams(loadPacks(), loadReferences()));
if (problems.length) throw new Error(`The check files have problems (checks/packs/):\n  ${problems.join('\n  ')}`);
await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'warn' });
const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');

// Everything must be inline: no script or stylesheet file, and the strict Content Security Policy must still be there.
const external = /<script[^>]+src=|<link[^>]+rel="?stylesheet/i.exec(html);
if (external) throw new Error(`The built page loads a file: ${external[0]}`);
if (!html.includes("default-src 'none'")) throw new Error('The Content Security Policy is missing from the built page.');
// The font and every other file a style names is packed into the page (data: URLs), never fetched.
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]).join('\n');
const fetched = /url\((?!["']?data:)[^)]*\)/i.exec(styles);
if (fetched) throw new Error(`The built page names a file: ${fetched[0]}`);

mkdirSync(join(root, 'app'), { recursive: true });
writeFileSync(join(root, 'app', 'SACM-Workbench.html'), html);
rmSync(join(root, 'dist'), { recursive: true, force: true });
console.log(`app/SACM-Workbench.html (${Math.round(html.length / 1024)} KB)`);
