// Writes docs/CHECKS.md from the check packs (checks/packs/), their reference files (checks/reference/) and the
// decision log (docs/DECISIONS.md), so the list of checks is never out of date.
//   npm run docs            writes docs/CHECKS.md again
// npm test fails when docs/CHECKS.md differs from what this script writes (tests/checks-doc.test.ts).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadPackFiles } from '../src/hosts/cli.ts';

/** The part of a check pack this page reads. */
export interface PackInfo {
  id: string;
  status: string;
  title: string;
  cardLabel?: string;
  cardHint?: string;
  dimension: string;
  reviewOnly?: boolean;
  subject?: string;
  scope?: { classes?: string[] };
  detector: { type: string; module?: string; forEachClasses?: Record<string, string[]> };
  playbook: { path: string; audience?: string[]; routeBy?: string; markWord?: string; message?: { ask?: string; request?: string } };
}

export interface DocInput {
  packs: PackInfo[];
  /** `exceptChecks` of checks/reference/not-live-statuses.json: checks that do not wait on a CI that is not live yet. */
  notWaiting: string[];
  /** `rules` of checks/reference/known-tags.json. */
  knownTags: { checks: string[]; tags: string[] }[];
  /** The text of docs/DECISIONS.md. */
  decisions: string;
}

const CLASSES: Record<string, string> = {
  business_capability: 'Business Capability', business_process: 'Business Process', business_application: 'Business Application',
  business_service: 'Business Service', service_offering: 'Service Offering', service_instance: 'Service Instance',
  api: 'API', application: 'Application', technology_management_service: 'Technology Management Service', contract: 'Contracts'
};
const ALL_CLASSES = Object.keys(CLASSES).filter((cls) => cls !== 'contract');

const SECTIONS: [string, string][] = [
  ['completeness', 'Completeness: something is missing'],
  ['correctness', 'Correctness: something is wrong'],
  ['compliance', 'Compliance: a process rule is broken']
];

const ROLES: Record<string, string> = { owned_by: 'Owned by', managed_by: 'Managed by', supported_by: 'Supported by', field: 'the person concerned' };

function audienceWord(entry: string): string {
  if (entry === 'sacm') return 'nobody: SACM';
  if (entry === 'procurement') return 'the Procurement mailbox';
  if (entry === 'otherRoles') return 'the other roles';
  const of = /^(managerOf|departmentHeadOf)\((\w+)\)$/.exec(entry);
  if (of) return `${of[1] === 'managerOf' ? 'manager' : 'department head'} of ${ROLES[of[2]!] ?? of[2]}`;
  return ROLES[entry] ?? entry;
}

function classesWord(pack: PackInfo): string {
  if (pack.subject === 'contract') return 'Contracts';
  const classes = pack.scope?.classes ?? [];
  if (ALL_CLASSES.every((cls) => classes.includes(cls))) return 'All nine';
  return classes.map((cls) => CLASSES[cls] ?? cls).join(', ');
}

function needsWord(pack: PackInfo): string {
  const module = pack.detector.module ?? '';
  if (pack.detector.type === 'manual') return 'Lifecycle review';
  if (module.startsWith('relationships/')) return 'CI + Relationship';
  if (module.startsWith('epo/')) return 'CI + EPO systems';
  if (module.startsWith('contracts/')) return 'CI + both contract files';
  return 'CI';
}

function fixWord(pack: PackInfo): string {
  const path = pack.playbook.path;
  const asksRequest = Boolean(pack.playbook.message?.request) || /\{request[:}]/.test(pack.playbook.message?.ask ?? '');
  let out: string;
  if (pack.reviewOnly) out = 'Review list, never red';
  else if (path === 'sacm-fix') out = pack.playbook.markWord === 'deleted' ? 'SACM delete list' : 'SACM fix list';
  else if (path === 'service-request' || asksRequest) out = 'Request in the Service Portal';
  else if (path === 'self-fix') out = pack.playbook.audience?.[0] === 'sacm' ? 'SACM fixes it' : 'Reply, then SACM fixes it';
  else if (path === 'source-fix') out = pack.playbook.audience?.[0] === 'procurement' ? 'In Solusi, by Procurement' : 'At the source';
  else out = 'The person corrects it';
  if (pack.playbook.routeBy === 'serviceMapped') out += '; in EPO on a CI from EPO';
  return out;
}

function stateWord(pack: PackInfo, input: DocInput): string {
  const parts: string[] = [];
  if (input.notWaiting.includes(pack.id)) parts.push('does not wait on Ready');
  const tags = input.knownTags.filter((rule) => rule.checks.includes(pack.id)).flatMap((rule) => rule.tags);
  if (tags.length) parts.push(`known with ${tags.join(', ')}`);
  return parts.join('; ');
}

/** The decisions of docs/DECISIONS.md whose row names the check, as "D12, D40". */
function decisionsOf(id: string, decisions: string): string {
  const out: string[] = [];
  for (const line of decisions.split('\n')) {
    const row = /^\| (D\d+) \|/.exec(line);
    if (row && new RegExp(`(?<![A-Z-])${id}(?![A-Z-])`).test(line)) out.push(row[1]!);
  }
  return out.join(', ');
}

const cell = (text: string): string => text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

/** The text of docs/CHECKS.md. */
export function checksDoc(input: DocInput): string {
  const lines = [
    '# Checks',
    '',
    '<!-- Written by tools/checks-doc.ts from checks/packs/, checks/reference/ and docs/DECISIONS.md. Do not edit: run `npm run docs`. -->',
    '',
    `Every check of the Workbench, one line each: ${input.packs.length} checks. A check is one file in \`checks/packs/<subject>/\` (\`ci\`, \`relationships\`, \`epo\`, \`contracts\`, \`lifecycle\`). The rules behind the columns are in [DOMAIN-RULES.md](DOMAIN-RULES.md); the decisions in [DECISIONS.md](DECISIONS.md).`,
    '',
    '- **Needs**: the reports that must be loaded. Without them the card is grey and says why.',
    '- **Who is asked**: in order, the first who can be reached. The person the finding is about is never asked; inactive people are skipped.',
    '- **Notes**: checks that do not wait on a CI in status Ready, and tags that make a finding known.',
    '- **Status**: *live*, confirmed by SACM (or the SACM procedure) and in use; *proposed*, built on an assumption or still waiting for a rule. Both run the same way. *off*: switched off: the check does not run and has no card.',
    '- **Decisions**: the rows of the decision log that name the check.',
    ''
  ];
  for (const [dimension, heading] of SECTIONS) {
    const packs = input.packs.filter((pack) => pack.dimension === dimension).sort((a, b) => a.id.localeCompare(b.id));
    lines.push(`## ${heading}`, '', '| Check | Card | What it finds | Classes | Needs | Who is asked | How it is fixed | Notes | Status | Decisions |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const pack of packs) {
      const supportedOnly = pack.detector.forEachClasses?.['supported_by'];
      const what = supportedOnly ? `${pack.title} (Supported by: ${supportedOnly.map((cls) => CLASSES[cls] ?? cls).join(', ')} only)` : pack.title;
      lines.push(`| ${[
        `\`${pack.id}\``, pack.cardLabel ?? '', what, classesWord(pack), needsWord(pack),
        (pack.playbook.audience ?? []).map(audienceWord).join(' → '), fixWord(pack), stateWord(pack, input), pack.status, decisionsOf(pack.id, input.decisions)
      ].map(cell).join(' | ')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Reads the packs and reference files of the repository at `root`. */
export function readDocInput(root: string): DocInput {
  const json = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
  const packs = loadPackFiles(root).map((file) => file.pack as PackInfo);
  const notLive = json(join(root, 'checks', 'reference', 'not-live-statuses.json')) as { exceptChecks?: string[] };
  const known = json(join(root, 'checks', 'reference', 'known-tags.json')) as { rules?: { checks: string[]; tags: string[] }[] };
  return { packs, notWaiting: notLive.exceptChecks ?? [], knownTags: known.rules ?? [], decisions: readFileSync(join(root, 'docs', 'DECISIONS.md'), 'utf8') };
}

export const CHECKS_DOC = join('docs', 'CHECKS.md');

if (process.argv[1] === import.meta.filename) {
  const root = join(import.meta.dirname, '..');
  writeFileSync(join(root, CHECKS_DOC), checksDoc(readDocInput(root)));
  console.log(`${CHECKS_DOC} written.`);
}
