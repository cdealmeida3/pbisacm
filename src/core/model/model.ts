/** Canonical model shared by every check. No I/O and no dependencies. */

export const ROLES = ['owned_by', 'managed_by', 'supported_by', 'assigned_to'] as const;
export type Role = typeof ROLES[number];

export const DIMENSIONS = ['confidentiality', 'integrity', 'availability', 'authenticity'] as const;
export type Dimension = typeof DIMENSIONS[number];

/** The three modules of the queue. Each check pack names one in its `dimension`. */
export const MODULES = ['completeness', 'correctness', 'compliance'] as const;
export type Module = typeof MODULES[number];

/** A finding about a contract has no CI: its key is `contract:<number>`. Cases treat such a subject apart (it is never a missing CI). */
export const CONTRACT_PREFIX = 'contract:';
export const isContractKey = (key: string): boolean => key.startsWith(CONTRACT_PREFIX);
/** The contact id of the Procurement mailbox: Procurement owns the contract data in Solusi. The address is a team setting. */
export const PROCUREMENT = 'procurement-mailbox';
export const PROCUREMENT_VIA = 'owner of the contract data in Solusi';

/**
 * A person referenced by a CI. `active` is null when the report has no column that says so.
 * A person is identified by the user ID (user_name), else the email. Display names are not unique.
 */
export interface PersonRef {
  name: string;
  email: string;
  userId: string;
  active: boolean | null;
  manager: string;
  managerEmail: string;
  managerUserId: string;
  managerActive: boolean | null;
  /** Head of the person's department, the last fallback contact. */
  departmentHead: string;
  departmentHeadEmail: string;
  departmentHeadUserId: string;
}

export type Levels = Partial<Record<Dimension, number>>;

/** The criticality scale (CIA-A) in the words of ServiceNow. */
export const LEVEL_WORDS: Record<number, string> = { 1: 'Less Critical (Minor)', 2: 'Significant (Necessary)', 3: 'Critical (Vital)', 4: 'Mission/Business critical' };
export const levelWords = (value: number): string => LEVEL_WORDS[value] ?? String(value);

export interface Ci {
  /** Stable identity: the name (lower case, spaces squashed). The asset tag is added only when two CIs share a name. */
  key: string;
  name: string;
  /** Canonical class id, e.g. "service_instance". The ServiceNow value is kept in `sourceClass`. */
  className: string;
  sourceClass: string;
  assetTag: string;
  operationalStatus: string;
  description: string;
  supportGroup: string;
  tags: string[];
  roles: Partial<Record<Role, PersonRef>>;
  target: Levels;
  inherited: Levels;
  exceptionStatus: string;
  exceptionJustification: string;
  discoverySource: string;
  /** The "service mapped" flag. True: the EPO sync is cut, and SACM copies EPO into ServiceNow by hand (card EPO ≠ ServiceNow only). Null when the report has no column. */
  serviceMapped: boolean | null;
  /** Hidden characters in the name (see src/core/shared/names.ts), as labels. Empty when none, or when the report cannot show them. */
  hiddenCharacters?: string[];
  /** A Service Instance with Platform ticked (u_platform). Null when the report has no column. */
  platform?: boolean | null;
  /** The Environment field ('' when empty or not in the report). */
  environment?: string;
  /** The Parent field of a Service Offering (ref_cmdb_ci_service.parent): the name of its Business Service. */
  parentService?: string;
  /** Is the Support group active (column support_group.active)? Null when the report has no column. */
  supportGroupActive?: boolean | null;
  /** When the record was created and last changed (yyyy-mm-dd; '' when empty, not a date, or not in the report). */
  createdOn?: string;
  updatedOn?: string;
  /** Who created the record (sys_created_by): a user ID, or the account of an integration. Missing when the report has no column. */
  createdBy?: string;
  /** The name has a space at its start or its end in the report (the name itself is kept trimmed). */
  nameSpaces?: boolean;
  /** Only on the CI-shaped record of a contract (src/core/sources/contracts/contract-reports.ts): its number, name and vendor, for the message table. */
  contract?: { number: string; name: string; vendor: string };
}

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { op: string; field?: string; value?: string | number | string[]; ref?: string; ignore?: string };

/**
 * The texts of a check's message, in the style of the SACM email templates. Placeholders:
 *   {role}     the ServiceNow role(s) the findings are about ("Owned by"),
 *   {who}      the same in plain words, for subjects ("owner"),
 *   {epoRole}  the EPO name of that role ("System Owner"),
 *   {request}  the request named by `request` ("role": the update request of the role), with its link from Settings,
 *   {request:<id>}  one request of REQUESTS (src/core/messages/messages.ts).
 *   {reply}, {Reply}  "reply to this email" in an email, "answer in this chat" in a Teams chat (D163).
 */
export interface MessageTexts {
  /** The problem, first in the subject: "Inactive {who}" gives "Inactive owner on <CI> [SACM-…]". Also the heading of its part. */
  subject: string;
  /** The first sentence: what we found. */
  intro: string;
  /** What we need, with the exact request. */
  ask: string;
  /** One line: why it matters. */
  why: string;
  request?: string;
  /** Another ask for a class (when every CI of the part is of that class). */
  askByClass?: Record<string, string>;
  /** Another ask when the message goes to a team of reference/record-teams (Process Management, D195), by team id. Wins over askByClass. */
  askByTeam?: Record<string, string>;
  /** The ask when `request` is "role" and the portal has no request for the role (Supported by): reply only. */
  askNoRequest?: string;
  /** For a CI from EPO: what to correct there ("description"). Role checks use {epoRole}. */
  epoWhat?: string;
  /** For a CI from EPO: an ask of its own instead of "Please correct the … in EPO." */
  epoAsk?: string;
  /** Added after the ask when the part holds three CIs or more (for example: propose a mapping session). */
  several?: string;
  /**
   * For a check whose message has one part per kind of problem (For Procurement): the texts of each kind, by the first part of the
   * finding's field ("endPassed", "personName"). A kind without texts uses the texts above.
   */
  byProblem?: Record<string, { subject: string; intro: string; ask: string }>;
}

/**
 * How a finding is listed. Only `open` is "to solve": it turns a card red, counts in the scores and can be messaged.
 *   waiting  the CI is not live yet (its status is in reference/not-live-statuses), so nobody is asked yet;
 *   known    a tag of the team explains it (reference/known-tags);
 *   review   the check only lists things worth a look (`reviewOnly`): allowed, never red.
 * Runs saved before version 0.9 have no state: read them as `open`.
 */
export const FINDING_STATES = ['open', 'review', 'waiting', 'known'] as const;
export type FindingState = typeof FINDING_STATES[number];

export interface CheckPack {
  id: string;
  /** The check lists items to review, not problems: its findings get the state `review` and the card never turns red. */
  reviewOnly?: boolean;
  /** For a review list that is not about something allowed: why it is listed, in a few words ("The sync did not bring it"). */
  reviewWhy?: string;
  title: string;
  /** Short name on the card of the overview, e.g. "Owner or manager missing". Falls back to the title. */
  cardLabel?: string;
  /** One or two sentences, at most 160 characters: on the card of the overview, and under the title of the open card. */
  cardHint?: string;
  /** The longer explanation on the open card, when one or two sentences are not enough. */
  cardText?: string;
  family: string;
  /**
   * `daily` (the default): daily work, counted in the red number of the first screen, Today and the scores. `later`:
   * "Clarify when there is time": shown, drawn calmer, its lines can be messaged, but it is not counted there (D182).
   */
  priority?: 'daily' | 'later';
  /** What the check is about when it is not a CI: "contract". The card then carries the word Contracts. */
  subject?: 'contract';
  dimension: string;
  severity: string;
  status: string;
  scope: { classes: string[]; exclude?: { operational_status?: string[] } };
  detector: {
    type: 'rule' | 'report' | 'code' | 'manual';
    /** For type "code": the detector (src/core/checks/detectors/relationship-detectors.ts), e.g. "relationships/missing". */
    module?: string;
    /** For type "code": the reference data the detector reads, e.g. "reference/relationship-model". */
    ref?: string;
    /** For type "code": the rule ids of the reference data it applies (all when absent). */
    rules?: string[];
    /** Run the rule once per entry; "{each}" in field and value is replaced by the entry. */
    forEach?: string[];
    /** Limits an entry of forEach to some classes. Entries not listed apply to every class in scope. */
    forEachClasses?: Record<string, string[]>;
    when?: Condition;
  };
  playbook: {
    path: string;
    audience: string[];
    /** "sacm-fix" in `path`: SACM corrects it in ServiceNow itself; the card shows a fix list (Export fix list, Mark as fixed). */
    /** "epo": on a CI that EPO feeds (reference/epo-synced-classes, src/core/cases/fix-place.ts), the fix is made in EPO; else in ServiceNow. */
    routeBy?: string;
    /** On a fix list: the word of the button and the status line when the change is not a fix ("deleted": Mark as deleted). */
    markWord?: string;
    /**
     * The word of a button on a finding a detector listed for a review first ("Mapping done: ask owner"). When a
     * manager presses it (a journal event 'reviewed'), the finding is to solve and its owner is asked with `message`.
     */
    askAfterReview?: string;
    /**
     * On a SACM fix list that can also ask the owner (`message`): the word of a button on a line SACM cannot fix alone ("Cannot
     * tell which one is right: ask the owner"). When a manager presses it (a journal event 'reviewed'), the line leaves the fix
     * list and the owner is asked with `message`. Without it, a fix list with a message shows every line both ways.
     */
    askWhenUnsure?: string;
    /**
     * The case offers the field "Planned retirement date" (a journal event 'retirement'). Until that date the finding waits;
     * on the date it is to solve again (TAG-STATUS-CONFLICT, UNDER-RETIREMENT-LONG).
     */
    retirementDate?: boolean;
    /** Texts of the message to the contact. See `MessageTexts`. */
    message?: MessageTexts;
  };
}

export interface Finding {
  /** check : CI key : field. Stable across snapshots, so history follows the finding. */
  key: string;
  checkId: string;
  ciKey: string;
  ciName: string;
  className: string;
  field: string;
  severity: string;
  detail: string;
  /** Set by a detector when this finding is only listed for a review (allowed, or a rule not agreed): why, in words. */
  review?: string;
  /** For a fix SACM makes itself (path "sacm-fix"): one line of the fix list. */
  fix?: FixLine;
  /** Set by a detector when another CI's roles say who to ask (Offering owner: its Business Service). Its key. */
  contactCi?: string;
  /** Short words shown next to the CI for this finding only ("changed in EPO"), added to the chips of its tags. */
  chips?: string[];
  /** Set by a detector when this finding waits (an EPO change the sync may still bring): why, in words. */
  wait?: string;
  /**
   * Set by a detector when the fix is made in ServiceNow whatever the class (a Service Instance without a Business
   * Application: SACM maps it with the owner). The check's `routeBy: "epo"` is then not followed for this finding.
   */
  inServiceNow?: boolean;
  /**
   * What the source holds, in words, when the line was compared with it first (D190): "Primary Responsible is empty in EPO
   * too". It is also the end of `detail`; a message then always shows the column "What we found".
   */
  source?: string;
  /** Set by a detector to list its findings by kind and not by owner (contract cards): the name of the kind ("End date"). */
  group?: string;
  /**
   * The mapping backlog (D200): the ids of the reasons a CI must be mapped (rules of reference/relationship-model, or the
   * tag rule of reference/mapping-backlog). Missing on every other finding, and in runs saved before version 0.28.
   */
  mapping?: string[];
}

/** One change of the SACM fix list: what to change, the value today, and the value to set. */
export interface FixLine {
  change: string; current: string; set: string;
  /** Information shown on the line ("Still linked: it carries a criticality from a CI"). It changes neither the order nor what to do. */
  note?: string;
  /** Runs saved before version 0.20: the same information, then listed first ("Still linked: check before deleting"). Read as `note`. */
  check?: string;
  /**
   * The exact text to type in ServiceNow, when `set` is a value and not an instruction ("Keep one"): a name, a person, a
   * relationship type, a description in full. **Copy** on the line copies it (D243). Missing in runs saved before version 0.33.
   */
  value?: string;
  /**
   * The fix is on the relationships between the CI and this other CI (its name): the search in ServiceNow opens those rows
   * of the relationship table, both directions (D244). Missing when the fix is on the CI itself.
   */
  relatedTo?: string;
}

/** Reference data named by a check's `ref`, loaded from checks/reference/. */
export type References = Record<string, unknown>;

export interface RunResult {
  findings: Finding[];
  /** "check:field" pairs that were really evaluated. Only these may close a case when its finding is gone. */
  tested: string[];
  /** "check:field" → number of CIs it was evaluated on. The base of the module scores. */
  evaluated: Record<string, number>;
  /** Checks that could not run, or ran only in part, with the reason. Never silent. */
  notes: Array<{ checkId: string; note: string }>;
  /**
   * Records that findings are about and that are not CIs of the CI report: contracts (src/core/sources/contracts/contract-reports.ts), in the shape of a CI.
   * Their key starts with "contract:". Missing when no check found one.
   */
  subjects?: Ci[];
  /** The parked CIs of the report (src/core/checks/parked.ts, D179): no finding is about them. Missing without reference/parked-classes. */
  parked?: Parked;
}

/** What a run knows about the parked CIs: their keys, the parked parts of checks ("check:field") and the grey lines of the first screen. */
export interface Parked { keys: string[]; fields: string[]; lines: string[] }
