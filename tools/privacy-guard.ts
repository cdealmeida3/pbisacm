// Privacy guard: fails when a file of the repository holds a link, an email address or a host that is not an invented one.
// The repository holds no real link, host or address (CLAUDE.md, "Hard rules", D266). They live in the team folder.
//   node tools/privacy-guard.ts            checks every file of the repository (also run by npm test)
// A developer can also check words that must never be in the repository (the company name, people, vendors) without
// writing them in it: put them in a file outside the repository, one per line, and set PRIVACY_TERMS to its path. In CI
// the same words come from the Actions secret PRIVACY_TERMS_LIST (docs/HOW-TO.md §10). A private word is never printed.
// Copied third-party files (the agent skills in .claude/skills/, D254, D260) are listed with their sha256 in
// .claude/skills/upstream.json, under the source they come from. Their links are not checked while a file is unchanged;
// once someone edits it, it is checked like any other file. The private words of PRIVACY_TERMS are checked in every file.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Hosts that are invented, or public pages of a standard or a product that are the same for everybody. */
export const ALLOWED_HOSTS = [
  'example.com', 'example.org', 'example.net', 'contoso.com', 'contoso.service-now.com', 'localhost',
  'www.w3.org', 'schemas.openxmlformats.org', 'schemas.microsoft.com', 'purl.org', 'react.dev',
  'teams.microsoft.com', 'outlook.office.com',
  // The Power BI project: Microsoft's file schemas and documents, the package of its Power Query test tool, and the
  // invented SharePoint site of the parameter SharePointSite (tools/placeholders.json).
  'developer.microsoft.com', 'learn.microsoft.com', 'json-schema.org', 'api.nuget.org', 'contoso.sharepoint.com',
  // The id of Microsoft's schema of the Power Apps source (tools/powerbi/schemas/pa-yaml/, build B6).
  'powerapps.com',
  // Microsoft's installer of Power BI Desktop, for the Desktop check on GitHub's runner (tools/powerbi/desktop.ps1, D309).
  'download.microsoft.com',
  // A one-letter placeholder host in the test files of the .xlsx reader.
  'x'
];
/** Email addresses are invented: only these domains. */
export const ALLOWED_EMAIL_DOMAINS = ['example.com', 'example.org', 'example.net', 'contoso.com'];

/** Not checked: generated or third-party files, and binary files. */
// bin and obj: the build of the TMDL check (tools/powerbi/tmdl-check/), never committed.
const SKIPPED_FOLDERS = new Set(['.git', 'node_modules', 'dist', '.build', 'bin', 'obj']);
const SKIPPED_FILES = new Set(['package-lock.json']);
const BINARY = /\.(png|jpe?g|gif|ico|xlsx|zip|pdf|woff2?)$/i;

const allowedHost = (host: string): boolean => {
  const lower = host.toLowerCase().replace(/\.$/, '');
  return ALLOWED_HOSTS.some((allowed) => lower === allowed || lower.endsWith(`.${allowed}`) && allowed.split('.').length === 2);
};
const allowedEmail = (domain: string): boolean => {
  const lower = domain.toLowerCase();
  return ALLOWED_EMAIL_DOMAINS.some((allowed) => lower === allowed || lower.endsWith(`.${allowed}`));
};

/** Hosts of ServiceNow, SharePoint and Microsoft tenants, also when written without https://. */
const TENANT_HOST = /\b[a-z0-9][a-z0-9-]*\.(?:service-now\.com|servicenow\.com|sharepoint\.com|onmicrosoft\.com|my\.salesforce\.com)\b/gi;
const LINK = /\b([a-z][a-z0-9+.-]*):\/\/([A-Za-z0-9[$][^\s/?#"'`<>()\\,;]*)/gi;
const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g;

export interface Problem { file: string; line: number; what: string }

/** Every file the guard reads, relative to `root`, with / as separator. */
export function repositoryFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { if (!SKIPPED_FOLDERS.has(entry.name)) walk(join(dir, entry.name)); continue; }
      const path = relative(root, join(dir, entry.name)).replace(/\\/g, '/');
      if (!SKIPPED_FILES.has(entry.name) && !BINARY.test(entry.name) && statSync(join(dir, entry.name)).size < 20_000_000) out.push(path);
    }
  };
  walk(root);
  return out.sort();
}

/** The manifest of the copied third-party files, and the only folder whose files it may list. */
export const VENDORED_MANIFEST = '.claude/skills/upstream.json';
const VENDORED_FOLDER = '.claude/skills/';

/** The sha256 of a text with LF line ends, so that a checkout with CRLF line ends gives the same value. */
export const contentHash = (text: string): string => createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');

/** An object that is not null and not an array. */
export const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** The `[path, sha256]` pairs of every source of a parsed manifest. Anything not in the `sources` form gives none. */
export function vendoredEntries(manifest: unknown): [string, unknown][] {
  const sources = (manifest as { sources?: unknown } | null)?.sources;
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((source: unknown) => isObject(source) && isObject(source.files) ? Object.entries(source.files) : []);
}

/** The copied files that are still exactly as the manifest lists them, relative to `root`, with / as separator. */
export function unchangedVendoredFiles(root: string): Set<string> {
  const manifestPath = join(root, VENDORED_MANIFEST);
  const out = new Set<string>();
  if (!existsSync(manifestPath)) return out;
  for (const [file, hash] of vendoredEntries(JSON.parse(readFileSync(manifestPath, 'utf8')))) {
    if (!file.startsWith(VENDORED_FOLDER) || file.split('/').includes('..') || file === VENDORED_MANIFEST) continue;
    const path = join(root, file);
    if (existsSync(path) && contentHash(readFileSync(path, 'utf8')) === hash) out.add(file);
  }
  return out;
}

const lineIn = (text: string) => (index: number): number => text.slice(0, index).split('\n').length;

/** The private words of PRIVACY_TERMS in one text (whole words, any case). */
export function privateWordsIn(file: string, text: string, terms: string[] = []): Problem[] {
  const problems: Problem[] = [];
  const lineAt = lineIn(text);
  for (const term of terms) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu');
    for (const match of text.matchAll(pattern)) problems.push({ file, line: lineAt(match.index), what: 'a private word of PRIVACY_TERMS' });
  }
  return problems;
}

/** What the guard finds in one text. `terms` are the private words of PRIVACY_TERMS (whole words, any case). */
export function problemsIn(file: string, text: string, terms: string[] = []): Problem[] {
  const problems: Problem[] = [];
  const lineAt = lineIn(text);
  for (const match of text.matchAll(LINK)) {
    const scheme = match[1]!.toLowerCase();
    if (!['http', 'https', 'ftp', 'ws', 'wss'].includes(scheme)) continue;
    const host = match[2]!.replace(/^[^@]*@/, '').replace(/:\d+$/, '');
    if (!host || host.includes('${') || allowedHost(host)) continue;
    problems.push({ file, line: lineAt(match.index), what: `link to ${host}` });
  }
  for (const match of text.matchAll(TENANT_HOST)) {
    if (allowedHost(match[0])) continue;
    problems.push({ file, line: lineAt(match.index), what: `host ${match[0]}` });
  }
  for (const match of text.matchAll(EMAIL)) {
    if (allowedEmail(match[1]!)) continue;
    problems.push({ file, line: lineAt(match.index), what: `email address at ${match[1]}` });
  }
  return [...problems, ...privateWordsIn(file, text, terms)];
}

/**
 * The private words: the file named by PRIVACY_TERMS (a developer's computer) and the text of PRIVACY_TERMS_LIST (the
 * Actions secret of the same name, in CI). One per line, # starts a comment. None when neither is set: a pull request
 * from a fork gets no secret, and the next run with the secret checks the words.
 */
export function privateTerms(path = process.env.PRIVACY_TERMS ?? '', list = process.env.PRIVACY_TERMS_LIST ?? ''): string[] {
  const text = `${path ? readFileSync(path, 'utf8') : ''}\n${list}`;
  return [...new Set(text.split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean))];
}

export function privacyProblems(root: string, terms: string[] = []): Problem[] {
  const vendored = unchangedVendoredFiles(root);
  return repositoryFiles(root).flatMap((file) => {
    const text = readFileSync(join(root, file), 'utf8');
    return vendored.has(file) ? privateWordsIn(file, text, terms) : problemsIn(file, text, terms);
  });
}

if (process.argv[1] === import.meta.filename) {
  const terms = privateTerms();
  const problems = privacyProblems(join(import.meta.dirname, '..'), terms);
  // A private word is never printed: the output may end up in a log.
  for (const problem of problems) console.error(`${problem.file}:${problem.line}: ${problem.what}`);
  console.log(problems.length ? `Privacy guard: ${problems.length} problems.` : `Privacy guard: no link, host or email address that is not invented${terms.length ? `, none of the ${terms.length} private words` : ''}.`);
  process.exit(problems.length ? 1 : 0);
}
