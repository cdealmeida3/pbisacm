import { nameKey } from '../../shared/names.ts';
import { personWords, userNames } from '../../sources/epo/epo-report.ts';
import type { Comparison, EpoConfig, Pair } from '../../sources/epo/epo-report.ts';
import type { CheckPack, Ci, Finding, PersonRef, Role } from '../../model/model.ts';

/**
 * The source first (D190): a people line of a Service Instance is compared with the EPO systems report before anybody is
 * asked. An owner gets an email only when EPO itself is wrong. Pure: same reports, same lines.
 *
 *   EPO already names another person   the line waits, and says who and which card follows it (SACM copies EPO on a
 *                                      service mapped CI; else the sync brings it);
 *   EPO is empty too, or names the     the owner is asked, and the line says what EPO holds (`source`);
 *   same inactive person
 *   a leftover: EPO has nobody,        the owner is asked to fill the role in EPO. Nobody clears the field by hand. When
 *   ServiceNow still shows a person    the old person is still active there was no line: one is made on the check of
 *                                      `leftover`.
 *
 * Which checks are compared is data: `sourceFirst` in checks/reference/epo-systems-report.json. The engine calls this after
 * the checks ran, through `afterChecks` of the detector list (./index.ts). Nothing here sends or changes anything.
 */

/** The id of the note of a run whose people lines could not be compared with EPO. */
export const SOURCE_FIRST = 'SOURCE-FIRST';

export interface SourceInput {
  cis: Ci[];
  columns: Set<string>;
  /** The checks in use: a leftover line is made only on a check that runs and has the CI in its scope. */
  packs: CheckPack[];
  config: EpoConfig;
  comparison: Comparison;
}

const squash = nameKey;
const filled = (person: PersonRef | undefined): person is PersonRef => !!person && !!(person.name || person.email);
const idOf = (person: PersonRef | undefined): string => (person?.userId ?? '').trim().toLowerCase();

/** The user IDs the CI report shows as inactive, as a person of a CI or as the manager of one. */
function inactiveIds(cis: Ci[]): Set<string> {
  const ids = new Set<string>();
  for (const ci of cis) {
    for (const person of Object.values(ci.roles)) {
      if (!person) continue;
      if (person.userId && person.active === false) ids.add(person.userId.trim().toLowerCase());
      if (person.managerUserId && person.managerActive === false) ids.add(person.managerUserId.trim().toLowerCase());
    }
  }
  return ids;
}

/** Is the CI in the scope of the check for this role? */
function inScope(pack: CheckPack, ci: Ci, role: Role): boolean {
  const excluded = (pack.scope.exclude?.operational_status ?? []).map(squash);
  if (!(pack.scope.classes.includes('*') || pack.scope.classes.includes(ci.className)) || excluded.includes(squash(ci.operationalStatus))) return false;
  if (pack.detector.type !== 'rule' || !(pack.detector.forEach ?? []).includes(role)) return false;
  const classes = pack.detector.forEachClasses?.[role];
  return !classes || classes.includes(ci.className);
}

/**
 * The findings after the comparison with EPO: some wait, some say what EPO holds, and the leftovers with a person who is
 * still active are added. Findings of other checks, and of CIs without an EPO system, come back unchanged.
 */
export function sourceFirst(findings: Finding[], input: SourceInput): Finding[] {
  const { config, comparison, columns, packs } = input;
  const rules = config.sourceFirst;
  if (!rules) return findings;
  const pairs = new Map<string, Pair>();
  for (const pair of comparison.pairs) pairs.set(pair.ci.key, pair);
  const names = userNames(input.cis);
  const inactive = inactiveIds(input.cis);
  const roles = config.roles.filter((entry) => columns.has(`${entry.role}.userId`));
  const roleOf = (field: string) => roles.filter((entry) => entry.role === field)[0];
  const cardOf = (id: string): string => { const pack = packs.filter((candidate) => candidate.id === id)[0]; return pack ? pack.cardLabel ?? pack.title : id; };
  /** Why a line waits: EPO is already right, and who brings it into ServiceNow. */
  const follows = (pair: Pair): string => (pair.mapped === true ? `SACM copies it into ServiceNow (card "${cardOf(rules.cards.mapped)}")`
    : pair.mapped === false ? `the sync has not brought it yet (card "${cardOf(rules.cards.notMapped)}")` : 'ServiceNow does not show it yet');
  const said = (finding: Finding, source: string): Finding => ({ ...finding, detail: `${finding.detail}. ${source}`, source });

  const out = findings.map((finding): Finding => {
    const pair = pairs.get(finding.ciKey);
    if (!pair) return finding;
    if (rules.samePerson.includes(finding.checkId)) {
      const [owner, manager] = [roleOf('owned_by'), roleOf('managed_by')];
      if (!owner || !manager) return finding;
      const first = pair.system[owner.column].trim().toLowerCase();
      const second = pair.system[manager.column].trim().toLowerCase();
      if (first && second && first !== second) {
        return { ...finding, wait: `EPO already names two people (${owner.epoLabel} ${personWords(first, names)}, ${manager.epoLabel} ${personWords(second, names)}): ${follows(pair)}` };
      }
      if (first && first === second) return said(finding, `EPO names the same person as ${owner.epoLabel} and ${manager.epoLabel}`);
      return said(finding, `${!second ? manager.epoLabel : owner.epoLabel} is empty in EPO`);
    }
    const entry = rules.checks.includes(finding.checkId) ? roleOf(finding.field) : undefined;
    if (!entry) return finding;
    const person = pair.ci.roles[entry.role];
    const epo = pair.system[entry.column].trim().toLowerCase();
    if (!epo) {
      return said(finding, filled(person)
        ? `${entry.epoLabel} is empty in EPO; ServiceNow still shows the old person, because the sync never clears a field`
        : `${entry.epoLabel} is empty in EPO too`);
    }
    if (epo === idOf(person)) return said(finding, `EPO names the same person as ${entry.epoLabel}`);
    if (inactive.has(epo)) return said(finding, `EPO names ${personWords(epo, names)} as ${entry.epoLabel}, who is not active either`);
    return { ...finding, wait: `EPO already names ${personWords(epo, names)} as ${entry.epoLabel}: ${follows(pair)}` };
  });

  // A leftover whose old person is still active has no line of its own: the role is empty in EPO, so the owner is asked.
  const keys = new Set(out.map((finding) => finding.key));
  for (const pair of comparison.pairs) {
    for (const difference of pair.differences) {
      const entry = difference.leftover ? roleOf(difference.field) : undefined;
      const pack = entry ? packs.filter((candidate) => candidate.id === rules.leftover[entry.role])[0] : undefined;
      if (!entry || !pack || !inScope(pack, pair.ci, entry.role)) continue;
      const key = `${pack.id}:${pair.ci.key}:${entry.role}`;
      // An inactive (or unnamed) person already has a line on its own card, which says the same.
      if (keys.has(key) || out.some((finding) => finding.ciKey === pair.ci.key && finding.field === entry.role && rules.checks.includes(finding.checkId))) continue;
      const source = `${entry.label} is empty in EPO (${entry.epoLabel}); ServiceNow still shows ${difference.current}, because the sync never clears a field`;
      keys.add(key);
      out.push({
        key, checkId: pack.id, ciKey: pair.ci.key, ciName: pair.ci.name, className: pair.ci.className, field: entry.role, severity: pack.severity,
        detail: source, source
      });
    }
  }
  return out;
}

/**
 * The note of a run that has people lines of these checks on CIs EPO feeds, and could not compare them: never silent.
 * '' when there is nothing to say.
 */
export function notCompared(findings: Finding[], config: EpoConfig, why: string): string {
  const rules = config.sourceFirst;
  if (!rules) return '';
  const checks = rules.checks.concat(rules.samePerson);
  const lines = findings.filter((finding) => checks.includes(finding.checkId) && config.classes.includes(finding.className)).length;
  return lines ? `${lines} people ${lines === 1 ? 'line of a CI from EPO was' : 'lines of CIs from EPO were'} not compared with EPO first: ${why}.` : '';
}
