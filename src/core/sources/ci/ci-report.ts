import { DIMENSIONS, ROLES } from '../../model/model.ts';
import { reportDate } from '../../shared/dates.ts';
import { hiddenCharacters, identityKey } from '../../shared/names.ts';
import { normaliseHeader } from '../../reading/headers.ts';
import type { Ci, Levels, PersonRef, Role } from '../../model/model.ts';
import type { ReportType } from '../../reading/table.ts';

/**
 * Reads a ServiceNow report (cmdb_ci list export or CMDB Health result) into canonical CIs.
 * Headers may be field names or labels; they are compared after normalising (lower case, spaces → "_").
 * A "ci." prefix (CMDB Health result) is removed. Criticality fields are matched by their ending, so the
 * scoped-app prefix of the instance does not need to be configured.
 */

/** The CI report (cmdb_ci): known by its Name and Class columns. Its loads stay in data/runs/ itself. */
export const CI_REPORT: ReportType<'ci'> = {
  kind: 'ci', label: 'CI report', hint: 'ServiceNow: the CIs, their people and their criticality',
  needs: [
    { label: 'Name', any: ['name', 'display_name', 'ci', 'configuration_item'] },
    { label: 'Class', any: ['sys_class_name', 'class', 'ci_class'] }
  ],
  folder: ''
};

/** The header forms of each field (also read by the Power BI generator, tools/powerbi/generate.ts). */
export const FIELD_ALIASES: Record<string, string[]> = {
  /** Read so it is not reported as unknown; the CI key follows the SACM rule (name), not sys_id. */
  sysId: ['sys_id'],
  name: ['name', 'display_name', 'ci', 'configuration_item'],
  className: ['sys_class_name', 'class', 'ci_class'],
  assetTag: ['asset_tag'],
  operationalStatus: ['operational_status'],
  description: ['short_description', 'description'],
  supportGroup: ['support_group', 'support_group.name'],
  tags: ['sys_tags', 'tags'],
  discoverySource: ['discovery_source'],
  exceptionStatus: ['exception_status', 'criticality_exception_status'],
  exceptionJustification: ['justification_for_exception'],
  serviceMapped: ['u_service_mapped', 'service_mapped'],
  /** ref_cmdb_ci_service.u_platform: a Service Instance with Platform ticked is a Platform. */
  platform: ['u_platform'],
  environment: ['environment'],
  /** The Parent field of a Service Offering: its Business Service (column ref_cmdb_ci_service.parent, label "Parent [Service]"). */
  parentService: ['ref_cmdb_ci_service.parent', 'ref_service_offering.parent', 'parent_[service]'],
  /** Whether the Support group is active (label "Support group Active"). */
  supportGroupActive: ['support_group.active', 'support_group_active'],
  createdOn: ['sys_created_on', 'created'],
  /** Who created the record (user ID): tells an offering the EPO integration made from one made by a person (reference/epo-synced-classes). */
  createdBy: ['sys_created_by', 'created_by'],
  updatedOn: ['sys_updated_on', 'updated']
};

/**
 * The columns of the CI report that the checks and the emails read, by their ServiceNow field name, in the order to add
 * them to the scheduled report (D347). `column` is the name in `columns` of ReportRead. The criticality columns are left
 * out: their field names carry the instance's own prefix. A CI report that lacks some gets one line on the Reports page,
 * to copy into the ServiceNow report (missingWanted, D352).
 */
export const WANTED_COLUMNS: ReadonlyArray<{ field: string; column: string }> = [
  { field: 'name', column: 'name' }, { field: 'sys_class_name', column: 'className' }, { field: 'asset_tag', column: 'assetTag' },
  { field: 'operational_status', column: 'operationalStatus' }, { field: 'short_description', column: 'description' }, { field: 'sys_tags', column: 'tags' },
  ...(['owned_by', 'managed_by', 'supported_by'] as const).flatMap((role) => [
    { field: role, column: role }, { field: `${role}.user_name`, column: `${role}.userId` }, { field: `${role}.email`, column: `${role}.email` },
    { field: `${role}.active`, column: `${role}.active` }
  ]),
  { field: 'owned_by.manager', column: 'owned_by.manager' }, { field: 'owned_by.manager.email', column: 'owned_by.manager.email' },
  { field: 'owned_by.manager.active', column: 'owned_by.manager.active' }, { field: 'owned_by.manager.user_name', column: 'owned_by.manager.userId' },
  { field: 'owned_by.department.dept_head', column: 'owned_by.departmentHead' }, { field: 'owned_by.department.dept_head.email', column: 'owned_by.departmentHead.email' },
  { field: 'support_group', column: 'supportGroup' }, { field: 'support_group.active', column: 'supportGroupActive' },
  { field: 'sys_created_on', column: 'createdOn' }, { field: 'sys_created_by', column: 'createdBy' }, { field: 'sys_updated_on', column: 'updatedOn' },
  { field: 'ref_cmdb_ci_service.u_service_mapped', column: 'serviceMapped' }, { field: 'ref_cmdb_ci_service.u_platform', column: 'platform' },
  { field: 'ref_cmdb_ci_service.parent', column: 'parentService' }
];

/** The field names of WANTED_COLUMNS that a CI report lacks (`columns` of ReportRead), in their order. */
export const missingWanted = (columns: ReadonlySet<string>): string[] => WANTED_COLUMNS.filter((entry) => !columns.has(entry.column)).map((entry) => entry.field);

/** ServiceNow class labels and table names → canonical class id. Anything else keeps a normalised form of its own name. */
export const CLASS_ALIASES: Record<string, string[]> = {
  business_capability: ['business capability', 'cmdb_ci_business_capability'],
  business_process: ['business process', 'cmdb_ci_business_process'],
  business_application: ['business application', 'cmdb_ci_business_app'],
  business_service: ['business service', 'cmdb_ci_service_business', 'cmdb_ci_service'],
  service_offering: ['service offering', 'business service offering', 'service_offering'],
  service_instance: ['service instance', 'application service', 'mapped application service', 'calculated application service',
    'cmdb_ci_service_auto', 'cmdb_ci_service_discovered', 'cmdb_ci_service_calculated'],
  api: ['api', 'cmdb_ci_api'],
  application: ['application', 'cmdb_ci_appl'],
  technology_management_service: ['technology management service', 'technical service', 'cmdb_ci_service_technical']
};

/** The canonical class ids of the CI report: the nine logical classes. */
export const CI_CLASSES: readonly string[] = Object.keys(CLASS_ALIASES);

export const OPERATIONAL_STATUS: Record<string, string> = {
  '1': 'Operational', '2': 'Non-Operational', '3': 'Repair in Progress', '4': 'DR Standby',
  '5': 'Ready', '6': 'Retired', '7': 'Pipeline', '8': 'Catalog'
};

/** Person columns, after the role prefix ("owned_by."). Field names and common label forms. */
export const PERSON_PARTS: Record<string, string[]> = {
  email: ['email'],
  userId: ['user_name', 'user_id'],
  active: ['active'],
  manager: ['manager'],
  'manager.email': ['manager.email'],
  'manager.active': ['manager.active'],
  'manager.userId': ['manager.user_name', 'manager.user_id'],
  departmentHead: ['department.dept_head', 'department.department_head', 'department_head'],
  'departmentHead.email': ['department.dept_head.email', 'department.department_head.email', 'department_head.email'],
  'departmentHead.userId': ['department.dept_head.user_name', 'department.department_head.user_name', 'department_head.user_name']
};

/**
 * The SACM identity rule: a CI is known by its name. Only when two CIs share a name is the asset tag added,
 * and when that does not separate them either, the order in the report does (and NAME-DUPLICATE reports it).
 */
function assignKeys(cis: Ci[]): void {
  const count = new Map<string, number>();
  for (const ci of cis) count.set(identityKey(ci.name), (count.get(identityKey(ci.name)) ?? 0) + 1);
  const used = new Set<string>();
  for (const ci of cis) {
    let key = identityKey(ci.name);
    if (count.get(key)! > 1 && ci.assetTag) key = `${key}|${ci.assetTag.toLowerCase()}`;
    let candidate = key;
    for (let n = 2; used.has(candidate); n++) candidate = `${key}#${n}`;
    used.add(candidate);
    ci.key = candidate;
  }
}

export function canonicalClass(value: string): string {
  const text = value.trim().toLowerCase();
  for (const id of Object.keys(CLASS_ALIASES)) {
    if (CLASS_ALIASES[id]!.includes(text)) return id;
  }
  return text.replace(/\s+/g, '_');
}

/** Criticality level 1–4 from a number or a label. Undefined when not set or not recognised. */
export function level(value: string): number | undefined {
  const text = value.trim().toLowerCase();
  if (/^[1-4]$/.test(text)) return Number(text);
  if (!text || /^(none|n\/?a|unknown|not .*|-+)$/.test(text)) return undefined;
  if (/mission|business[\s-]*critical/.test(text)) return 4;
  if (/^(less|low|minor)/.test(text)) return 1;
  if (/critical|vital/.test(text)) return 3;
  if (/significant|necessary/.test(text)) return 2;
  return undefined;
}

/** A yes/no cell of the CI report. Exported for the Power BI unit cases. */
export function truthy(value: string): boolean | null {
  const text = value.trim().toLowerCase();
  if (/^(true|yes|y|1)$/.test(text)) return true;
  if (/^(false|no|n|0)$/.test(text)) return false;
  return null;
}

export interface ReportRead {
  cis: Ci[];
  /**
   * How hidden characters in names could be tested: 'file' (the file keeps them: .xlsx, or a CSV that holds some),
   * 'relationships' (a CSV, but the names known from a Relationship report were used), '' (not tested).
   */
  hiddenFrom: 'file' | 'relationships' | '';
  /** CI names that show "?". In a CSV this can be a hidden character the export could not write. */
  questionMarks: number;
  /** Canonical columns found in the report, e.g. "owned_by.active". Checks use it to say what they could not test. */
  columns: Set<string>;
  /** Report headers that no field uses. */
  unknownHeaders: string[];
}

export interface ReadOptions {
  /** The file keeps hidden characters (an .xlsx, or a UTF-8 CSV with a byte order mark). */
  lossless?: boolean;
  /** Identity keys (see src/core/shared/names.ts) of names known to hold hidden characters, with the characters, from a Relationship report. */
  knownHidden?: Map<string, string[]>;
}

export function readCiReport(rows: string[][], options: ReadOptions = {}): ReportRead {
  const headers = (rows[0] ?? []).map(normaliseHeader);
  const used = new Set<number>();
  const columns = new Set<string>();

  const find = (accept: (header: string) => boolean, column: string): number => {
    const index = headers.findIndex(accept);
    if (index >= 0) { used.add(index); columns.add(column); }
    return index;
  };
  const exact = (names: string[], column: string): number => find((header) => names.includes(header), column);

  const at: Record<string, number> = {};
  for (const field of Object.keys(FIELD_ALIASES)) {
    const names = FIELD_ALIASES[field]!;
    at[field] = field.startsWith('exception') || field === 'serviceMapped' || field === 'platform'
      ? find((header) => names.some((name) => header.endsWith(name)), field)
      : exact(names, field);
  }
  const roleAt: Record<string, number> = {};
  for (const role of ROLES) {
    roleAt[role] = exact([role, `${role}.name`], role);
    for (const part of Object.keys(PERSON_PARTS)) {
      const names = PERSON_PARTS[part]!.map((name) => `${role}.${name}`);
      roleAt[`${role}.${part}`] = exact(names.concat(names.map((name) => name.replace(/\./g, '_'))), `${role}.${part}`);
    }
  }
  const levelAt: Record<string, number> = {};
  for (const kind of ['target', 'inherited']) {
    for (const dimension of DIMENSIONS) {
      levelAt[`${kind}.${dimension}`] = find((header) => header.endsWith(`${kind}_${dimension}`), `${kind}.${dimension}`);
    }
  }

  const cis: Ci[] = [];
  for (const row of rows.slice(1)) {
    const cell = (index: number | undefined): string => (index === undefined || index < 0 ? '' : (row[index] ?? '').trim());
    const name = cell(at.name);
    if (!name) continue;
    const rawName = (row[at.name!] ?? '').replace(/^\uFEFF/, '');
    const sourceClass = cell(at.className);
    const className = canonicalClass(sourceClass);
    const assetTag = cell(at.assetTag);

    const roles: Partial<Record<Role, PersonRef>> = {};
    for (const role of ROLES) {
      if (roleAt[role]! < 0) continue;
      const flag = (part: string): boolean | null => (roleAt[`${role}.${part}`]! < 0 ? null : truthy(cell(roleAt[`${role}.${part}`])));
      roles[role] = {
        name: cell(roleAt[role]),
        email: cell(roleAt[`${role}.email`]),
        userId: cell(roleAt[`${role}.userId`]),
        active: flag('active'),
        manager: cell(roleAt[`${role}.manager`]),
        managerEmail: cell(roleAt[`${role}.manager.email`]),
        managerUserId: cell(roleAt[`${role}.manager.userId`]),
        managerActive: flag('manager.active'),
        departmentHead: cell(roleAt[`${role}.departmentHead`]),
        departmentHeadEmail: cell(roleAt[`${role}.departmentHead.email`]),
        departmentHeadUserId: cell(roleAt[`${role}.departmentHead.userId`])
      };
    }
    const levels = (kind: string): Levels => {
      const result: Levels = {};
      for (const dimension of DIMENSIONS) {
        const value = level(cell(levelAt[`${kind}.${dimension}`]));
        if (value !== undefined) result[dimension] = value;
      }
      return result;
    };
    const status = cell(at.operationalStatus);

    cis.push({
      key: '',
      name, className, sourceClass, assetTag,
      operationalStatus: OPERATIONAL_STATUS[status] ?? status,
      description: cell(at.description),
      supportGroup: cell(at.supportGroup),
      tags: cell(at.tags).split(',').map((tag) => tag.trim()).filter(Boolean),
      roles,
      target: levels('target'),
      inherited: levels('inherited'),
      exceptionStatus: cell(at.exceptionStatus),
      exceptionJustification: cell(at.exceptionJustification),
      discoverySource: cell(at.discoverySource),
      serviceMapped: at.serviceMapped! < 0 ? null : truthy(cell(at.serviceMapped)),
      platform: at.platform! < 0 ? null : truthy(cell(at.platform)),
      environment: cell(at.environment),
      parentService: cell(at.parentService),
      supportGroupActive: at.supportGroupActive! < 0 ? null : truthy(cell(at.supportGroupActive)),
      createdOn: reportDate(cell(at.createdOn)),
      ...(at.createdBy! >= 0 ? { createdBy: cell(at.createdBy) } : {}),
      updatedOn: reportDate(cell(at.updatedOn)),
      nameSpaces: /^[ \t\u00A0]|[ \t\u00A0]$/.test(rawName)
    });
  }
  assignKeys(cis);
  let inFile = false;
  for (const ci of cis) {
    const own = hiddenCharacters(ci.name);
    if (own.length) inFile = true;
    ci.hiddenCharacters = own.length ? own : options.knownHidden?.get(identityKey(ci.name)) ?? [];
  }
  const hiddenFrom = options.lossless || inFile ? 'file' : options.knownHidden && options.knownHidden.size ? 'relationships' : '';
  if (hiddenFrom) columns.add('name.hidden');
  return {
    cis, columns, unknownHeaders: headers.filter((_, index) => !used.has(index)), hiddenFrom,
    questionMarks: cis.filter((ci) => ci.name.indexOf('?') >= 0).length
  };
}

/** Notes for the NAME-HIDDEN-CHAR card when hidden characters could be tested only in part, or not at all. */
export function hiddenNotes(report: ReportRead): string[] {
  if (report.hiddenFrom === 'relationships') {
    return ['NAME-HIDDEN-CHAR: Partly tested. A CSV report cannot show hidden characters, so only the names that are also in the Relationship report were checked.'];
  }
  if (!report.hiddenFrom && report.questionMarks) {
    return [`NAME-HIDDEN-CHAR: ${report.questionMarks} names show "?". It can be a hidden character the CSV could not write.`];
  }
  return [];
}

/** How many CIs of a CI report name a person of a role, and how fully (the page Data check of the Power BI report, build R3). */
export interface PeopleCount {
  /** owned_by, managed_by, supported_by, or owned_by.manager (the manager of Owned by, the escalation). */
  role: string;
  label: string;
  /** The report has the column of the role (of the manager, for owned_by.manager). */
  inReport: boolean;
  cis: number; name: number; email: number; userId: number;
  /** Marked active, marked inactive, and named but with no word on it (the report has no column active, or it is empty). */
  active: number; inactive: number; notSaid: number;
}

/** The roles the Data check counts, in its order: the three roles a message asks, then the manager of Owned by. */
export const PEOPLE_CHECK: Array<{ role: string; label: string }> = [
  { role: 'owned_by', label: 'Owned by' }, { role: 'managed_by', label: 'Managed by' }, { role: 'supported_by', label: 'Supported by' },
  { role: 'owned_by.manager', label: 'Manager of Owned by' }
];

/** For each role of PEOPLE_CHECK: the CIs of the report with a name, an email, a user ID, marked active or inactive. */
export function peopleCoverage(cis: Ci[], columns: ReadonlySet<string>): PeopleCount[] {
  return PEOPLE_CHECK.map(({ role, label }) => {
    const manager = role.endsWith('.manager');
    const people = cis.map((ci) => {
      const person = ci.roles[(manager ? 'owned_by' : role) as Role];
      if (!person) return null;
      return manager
        ? { name: person.manager, email: person.managerEmail, userId: person.managerUserId, active: person.managerActive }
        : { name: person.name, email: person.email, userId: person.userId, active: person.active };
    });
    const count = (test: (person: NonNullable<typeof people[number]>) => boolean): number => people.filter((person) => !!person && test(person)).length;
    return {
      role, label, inReport: columns.has(role), cis: cis.length,
      name: count((person) => person.name !== ''), email: count((person) => person.email !== ''), userId: count((person) => person.userId !== ''),
      active: count((person) => person.active === true), inactive: count((person) => person.active === false),
      notSaid: count((person) => (person.name !== '' || person.email !== '') && person.active === null)
    };
  });
}
