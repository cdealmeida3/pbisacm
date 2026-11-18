import type { Ci, References } from '../model/model.ts';

/**
 * Where a fix is made (decisions D122, D123): in EPO, or in ServiceNow with a request. The rule is data in
 * reference/epo-synced-classes: the classes EPO feeds (Business Service, Service Instance) and how to tell a Service
 * Offering the EPO integration created from one a person created (its Created by is not a person's user ID).
 * The service mapped flag plays no part here.
 */

interface EpoSynced {
  classes?: string[];
  /**
   * `inServiceNow` (D187): what is changed in ServiceNow even on an offering the integration created: the findings of these
   * `fields` (Managed by, Supported by) and of these `checks` (the Support group, a second person for Managed by).
   */
  offerings?: { classes?: string[]; personUserId?: string; inServiceNow?: { fields?: string[]; checks?: string[] } };
}

const syncedOf = (references: References): EpoSynced | undefined => references['reference/epo-synced-classes'] as EpoSynced | undefined;

/**
 * Who made an offering: 'epo' (the EPO integration: Created by is filled and is not a person's user ID),
 * 'person' (a person's user ID, an empty Created by, or no Created by column), '' (not an offering of the rule).
 */
export function offeringOrigin(ci: Ci, references: References): 'epo' | 'person' | '' {
  const offerings = syncedOf(references)?.offerings;
  if (!offerings || (offerings.classes ?? []).indexOf(ci.className) < 0) return '';
  const createdBy = (ci.createdBy ?? '').trim();
  if (!createdBy) return 'person';
  return new RegExp(offerings.personUserId ?? '^$').test(createdBy) ? 'person' : 'epo';
}

/**
 * True when a fix on this CI is made in EPO: a class EPO feeds, or an offering the EPO integration created. On such an
 * offering only Owned by follows its Business Service in EPO: a finding of a field or check of `inServiceNow` is not (D187).
 */
export function fixedInEpo(ci: Ci, references: References, checkId = '', field = ''): boolean {
  const synced = syncedOf(references);
  if (!synced) return false;
  if ((synced.classes ?? []).indexOf(ci.className) >= 0) return true;
  if (offeringOrigin(ci, references) !== 'epo') return false;
  const here = synced.offerings?.inServiceNow;
  return (here?.fields ?? []).indexOf(field) < 0 && (here?.checks ?? []).indexOf(checkId) < 0;
}

/** The notes of a run about the rule: no reference file, or offerings without a Created by column. */
export function fixPlaceNotes(cis: Ci[], references: References): string[] {
  const synced = syncedOf(references);
  if (!synced) return ['Routing: reference data missing (reference/epo-synced-classes), so no finding is routed to EPO.'];
  const blind = cis.filter((ci) => (synced.offerings?.classes ?? []).indexOf(ci.className) >= 0 && ci.createdBy === undefined).length;
  return blind
    ? [`Routing: the report has no Created by column (sys_created_by), so ${blind} Service Offerings count as made by a person: they are fixed in ServiceNow, not in EPO.`]
    : [];
}
