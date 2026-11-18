// Words several screens show: the module names and how a problem gets fixed.
import type { CheckPack, Module } from '../../core/model/model.ts';
import type { Case } from '../../core/cases/cases.ts';

export const MODULE_LABEL: Record<Module, string> = { completeness: 'Completeness', correctness: 'Correctness', compliance: 'Compliance' };

/** How the problem gets fixed, in words. */
export function fixLabel(pack: CheckPack | undefined, item: Case): string {
  // 'sacm' is only in runs saved before version 0.17: the fix is made in EPO all the same.
  if (item.fact.route === 'epo' || item.fact.route === 'sacm') return 'Fix in EPO; ServiceNow receives it from EPO';
  const path = pack?.playbook.path ?? '';
  if (path === 'sacm-fix') return pack?.playbook.markWord === 'deleted' ? 'SACM deletes it in ServiceNow (delete list)' : 'SACM fixes it in ServiceNow (fix list)';
  if (path === 'service-request') return 'Request in the Service Portal';
  if (path === 'self-fix') return 'SACM fixes after a reply';
  if (path === 'source-fix') return 'Fix at the source';
  if (path === 'email') return 'The person asked answers or corrects it';
  return path;
}

/** Where the fix is made, in two words: on a line or a group of a card that holds both (F23). */
export const fixPlace = (item: Case): string => (item.fact.route === 'epo' || item.fact.route === 'sacm' ? 'Fix in EPO' : 'Fix in ServiceNow');

/**
 * The fix place for the top of a card: the label when every case has the same one, "Fix place: see each line" when they
 * differ, '' when there is no case.
 */
export function cardFixLabel(pack: CheckPack | undefined, cases: Case[]): { text: string; mixed: boolean } {
  const labels = Array.from(new Set(cases.map((item) => fixLabel(pack, item))));
  return labels.length === 1 ? { text: labels[0]!, mixed: false } : { text: labels.length ? 'Fix place: see each line' : '', mixed: labels.length > 1 };
}
