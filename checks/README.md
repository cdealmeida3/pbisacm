# Check packs

One file per check. A check is a feature of the Workbench: it says how one kind of data quality problem is detected, who is concerned, which path fixes it and how the fix is verified. How to add one: [HOW-TO.md](../docs/HOW-TO.md#1-add-a-check-that-uses-the-ci-report).

The list of every check, one line each, is [docs/CHECKS.md](../docs/CHECKS.md) (written from these files by `npm run docs`). The rules behind them are [docs/DOMAIN-RULES.md](../docs/DOMAIN-RULES.md), and what still waits for SACM is [docs/OPEN-QUESTIONS.md](../docs/OPEN-QUESTIONS.md).

The files sit in one folder per subject: `packs/ci/` (the CI report alone), `packs/relationships/`, `packs/epo/`, `packs/contracts/` and `packs/lifecycle/`. The folder is the subject of a card: the small word on it (CI, Relationship, EPO, Contract, Lifecycle) and the filter of the overview. The app reads the files in the order of their file names, whatever the folder; the overview orders the cards itself (to solve and biggest first, D172), and that file order only decides between equal cards. Check ids never change, so every case keeps its history.

**Every file is validated** (`src/core/checks/check-files.ts`). `npm test` and `npm run build` stop when a file has an unknown field, a missing field, an unknown rule word, detector, class, request, audience entry, rule id or reference file, or two checks share an id. Only the fields below exist; a field that no code reads does not belong here (the knowledge goes into the documents).

No real field names, addresses or URLs belong in this repository; requests are named by their id in `REQUESTS` (`src/core/messages/messages.ts`), and their links live in *Settings* in the team folder.

| Field | Meaning |
|---|---|
| `id` | Stable identifier, upper case words joined by "-". Never changed |
| `status` | `live`: confirmed by SACM (or the SACM procedure) and in use. `proposed`: built on an assumption or still waiting for a rule. `off`: switched off: the file stays, but the check does not run, has no card and its old cases are not shown (one word brings it back). Also allowed: `pilot`, `retired`. Apart from `off`, the status changes nothing in the app; a `proposed` or `off` check may name a reference file that does not exist yet (its card is grey and says so) |
| `title`, `cardLabel`, `cardHint`, `cardText` | The problem in a sentence; the short name on the card of the overview; one or two sentences of at most 160 characters on the card of the overview (every check that is not off has one); the longer explanation on the open card, when it needs more (without it the open card shows `cardHint`) |
| `priority` | `daily` (the default) or `later`: work to clarify when there is time (D182). A `later` card is drawn calm, after the daily cards of its section, and is not counted in the red number, *Only red*, *Today* or the scores. Its lines can still be emailed |
| `reviewOnly`, `reviewWhy` | `true`: the check lists things that are allowed but worth a look. Its findings are "to review": never red, not counted in the scores, no message by default. `reviewWhy`: why, when it is not about something allowed |
| `family` | Grouping of related checks; also the name of the field of a finding when the rule names none |
| `severity` | `low`, `medium` or `high`, copied onto each finding |
| `subject` | `contract` for a check about contracts: its card carries the word Contracts and counts contracts, not CIs |
| `dimension` | The section of the overview: `completeness` (something is missing), `correctness` (something is wrong) or `compliance` (a process rule is broken). A new pack adds its card there by itself. |
| `scope` | `classes` the check applies to (the nine class ids, `contract`, or `*`) and `exclude.operational_status` |
| `detector.type` | `rule` (field condition in `when`), `code` (a detector of `src/core/`), `manual` (what managers mark) |
| `detector.module`, `detector.ref`, `detector.rules` | For `code` and `manual`: the detector (`relationships/missing` …), its reference file, and the rule ids of that file it applies (all when absent) |
| `detector.forEach` | Run the same rule over several fields or dimensions; one finding each |
| `detector.forEachClasses` | Limits an entry of `forEach` to some classes (an empty list switches it off) |
| `playbook.path` | `email` · `self-fix` · `service-request` · `source-fix` · `sacm-fix` (SACM corrects it in ServiceNow: the card shows the fix list) |
| `playbook.audience` | Ordered fallback list: CI roles, `otherRoles`, `managerOf(x)`, `departmentHeadOf(x)` (`x` may be `field`, the role the finding is about), `sacm` (nobody is asked), `procurement` (the Procurement mailbox). Inactive people and inactive managers are skipped. |
| `playbook.routeBy` | `epo`: on a CI that EPO feeds (`reference/epo-synced-classes`: Business Service, Service Instance, and a Service Offering whose Created by is not a person's user ID), the fix is made in EPO, by the person the check asks, and ServiceNow receives it from EPO. Every other CI is fixed in ServiceNow, with the request of the message. Nobody to ask on a CI from EPO: the EPO inventory owner (team setting). The service mapped flag plays no part. |
| `playbook.markWord` | On a fix list: the word of the button when the change is not a fix (`deleted`: Mark as deleted) |
| `playbook.askAfterReview` | The word of a button on the case of a finding a detector lists for a review first (`Mapping done: ask owner`). Pressed, the finding is to solve and its owner is asked with `playbook.message`. Not with `reviewOnly` |
| `playbook.askWhenUnsure` | On a SACM fix list with `playbook.message`: the word of a button on the case of a line SACM cannot fix alone (`Cannot tell which one is right: ask the owner`). Pressed, the line leaves the fix list and the owner is asked with `playbook.message`; *Back to the fix list* undoes it. Without it, a fix list with a message shows every line both on the list and in the owner groups |
| `playbook.retirementDate` | `true`: the case offers the field *Planned retirement date* (a journal event `retirement`). Until that date the finding waits (no reminder); on the date it is to solve again (TAG-STATUS-CONFLICT, UNDER-RETIREMENT-LONG) |
| `playbook.message` | The texts of the message (`MessageTexts` in `src/core/model/model.ts`): `subject` (the problem), `intro` (first sentence), `ask` (with the exact request, `{request:<id>}`), `why` (one line), and optional `request`, `askByClass`, `askByTeam` (the ask when the message goes to a team of `reference/record-teams`, by team id: Process Management, D195), `askNoRequest`, `epoWhat`, `epoAsk`, `several`, `byProblem`. Placeholders: `{role}`, `{who}`, `{epoRole}`, `{request}`, `{request:<id>}`, `{form:<id>}` (the request by its name only, without its action), `{reply}` and `{Reply}` ("reply to this email" in an email, "answer in this chat" in a Teams chat: never write "this email" in a text). When the CIs of a part are of several classes and some have an `askByClass`, the message says "For Service Offerings: …" and "For the other CIs: …". |

**Removed in cleanup piece A3** (D115), because no code read them: `version` (the git history keeps it), `verify` (always "a later report no longer shows it": [DOMAIN-RULES.md](../docs/DOMAIN-RULES.md) §17), `playbook.channels`, `playbook.followUpDays` and `playbook.escalateTo` (the real reminder and escalation rules are the team settings: [DOMAIN-RULES.md](../docs/DOMAIN-RULES.md) §18), `playbook.needsAnswer` (the path says it), `playbook.catalogItem` (the request is `playbook.message.request`), `playbook.notes` (now [DOMAIN-RULES.md](../docs/DOMAIN-RULES.md) §23) and `openQuestions` (now [OPEN-QUESTIONS.md](../docs/OPEN-QUESTIONS.md)).

## Rule operators

| Operator | True when |
|---|---|
| `isEmpty` | The field (or role) has no value |
| `refInactive` | The role is filled and the report says the user is inactive |
| `shorterThan` | The text is filled and shorter than `value` characters |
| `equalsField` | The text equals another field, ignoring case and spacing |
| `matchesAny` | The text matches one of the patterns in `value` |
| `duplicatedMoreThan` | More than `value` CIs in the whole report carry the same text (lower case, spaces squashed) |
| `duplicatedInClass` | More than `value` live CIs of the same class carry the same text (lower case, spaces squashed). A Retired CI is never counted and never raised |
| `hasDoubleSpaces` | The text has two or more spaces in a row |
| `equals` | The text equals `value`, ignoring case and spacing |
| `samePersonAs` | The role names the same person as the role in `value` (user ID, then email) |
| `tagMatchesAny` | A tag matches one of the patterns in `value` |
| `groupInactive` | The Support group is filled and the report says it is not active (column `support_group.active`) |
| `levelsMissing` | One or more of the four criticality levels of `field` (`target` or `inherited`) are not set |
| `greaterThanField`, `lessThanField` | Compares two criticality levels; false when either is not set |
| `lacksValidEntryFor` | The justification list has no entry for the dimension, ignoring entries that match `ignore` |
| `onlyMatches` | The field is filled and every entry (split on a comma, a semicolon or a new line) matches the pattern `value` (*Automatic justification only*) |
| `notOnlyMatches` | The opposite: the field is empty, or holds an entry that does not match `value` |
| `missingTags` | A tag rule of the CI's class in the reference file is not met. A rule is met by a tag of its `oneOf`, or by a tag that ends with one of its `endsWith` after a first word (`facing` matches *Customer facing*, not *Facing* alone). Tags are compared ignoring case and extra spaces; a hyphen counts as a space |
| `tagsNotIn` | A tag is not in the reference list |
| `hasHiddenCharacters` | The name holds a character nobody can see (zero-width space and the like) |

Conditions combine with `all` and `any`.

The CI identity is the name; the asset tag is added only when two CIs share a name. A case is *Verified* only when a later report contains the CI, could test the check, and no longer shows the problem. `reference/` holds the reference data that checks name in `ref`, and the rules that sort findings (see below).

## To solve, to review, waiting, known

Each finding gets a state when the report is loaded. Only "to solve" turns a card red, counts in the scores and offers a message. The rules are these files, so SACM can change them without a code change:

| File | Rule |
|---|---|
| `reference/not-live-statuses.json` | `statuses`: a CI in one of these statuses is not live yet, so its findings are **waiting**. `exceptChecks`: checks that do not wait, because SACM fixes them itself |
| `reference/known-tags.json` | `rules`: a finding of one of the `checks` on a CI with one of the `tags` is **known** |
| `reviewOnly` in a check pack | Its findings are **to review** |
| `reference/tag-chips.json` | A short word shown next to a CI that carries a tag (Descoped: "to map"). It changes no state |
| `reference/record-teams.json` | `teams`: a team (`id`, `name`) that is the contact for the record of some `classes` on some `checks` (D195). A line of one of those checks on such a CI goes to the team, never to the people of the CI: Process Management for a Business Process. The people of a team are a team setting (Settings, *Requests and mailboxes*). `npm test` and `npm run build` stop on a check or class the file does not know. It changes no state |
| `reference/parked-classes.json` | `rules`: classes (and statuses) that are **not checked yet** (D179). Each rule has `classes`, `statuses` (empty: every status), the grey line in `one`, `many` (with `{n}`) and `none`, and `fields`: parts of checks (`REL-MISSING:bp-business-capability`) parked with it. A parked CI gives no line on any card and is not counted as tested. Without the file every class is checked and the run says so |

Order: not live wins over a tag, a tag over review.

## Relationship checks

The detectors of type `code` read `reference/relationship-model.json`, ported from the Service Mapping Workspace:

| Part | Meaning |
|---|---|
| `dictionary` | Per parent class → child class: `allowed` (with the approved `types`), `unconfirmed` (not checked), `blocked`, or `direction` (the wrong way round; `review: true` lists it for a review only) |
| `expectations` | What a CI of a class needs: related classes above (`parent`) or below (`child`), `min`, `max`, `maxPerEnvironment`. `review: true`: a rule not agreed yet, listed for a review only. `inServiceNow: true`: the fix is made in ServiceNow whatever the class, so a check with `routeBy: "epo"` does not send it to EPO (`si-business-application`) |
| `retiredStatuses` | A relationship with an end in one of these statuses does not count |
| `environments` | How the environment of a Service Instance is read: Environment field, else the end of its name, else production |

Classes are the canonical ids of the CI report, plus `platform`: a Service Instance with Platform ticked. A check needs both reports; without the Relationship report it is not tested and says so.

| Detector | Card |
|---|---|
| `relationships/missing` | Relationship missing (`min`) |
| `relationships/too-many` | Too many partners (`max`) |
| `relationships/wrong-type` | Wrong relationship type (dictionary) |
| `relationships/offering-parent` | Offering parent (needs the column `ref_cmdb_ci_service.parent`) |
| `relationships/application-instance` | Application ≠ Instance (procedure 2.9) |
| `relationships/offering-owner` | Offering owner ≠ Service owner (procedure 2.6) |
| `relationships/retired-end` | Relationship to a Retired CI (procedure 2.12; switched off since 0.19) |
| `relationships/twice` | More than one relationship between two CIs (one is allowed) |

## Criticality checks that need the parents (version 0.18)

Detectors of type `code` in `src/core/checks/detectors/criticality-detectors.ts`. They run on the CI report; with the Relationship report they also know the parents of each CI. A relationship with "Excluded for calculation" passes nothing. Their reference file is `reference/criticality.json`: `waitDays` (how long "Inherited set, Target empty" waits after the last change of the record).

| Detector | Card |
|---|---|
| `criticality/above-parents` | Above parent: a Target above every value the parents pass on (a parent passes its Target, else its Inherited value). Without the Relationship report: compared with the Inherited field. Listed for a SACM review first (`playbook.askAfterReview`) |
| `criticality/none-reaches` | No criticality reaches the CI: no Target and nothing inherited (a SACM review that says what the parents are), or Inherited set and Target empty (waits) |

## Checks on the CI report alone (version 0.13)

Detectors of type `code` in `src/core/checks/detectors/ci-detectors.ts`. They need no Relationship report. `detector.ref` names their reference file, `detector.rules` the rule ids a pack applies.

| Detector | Reference file | Cards |
|---|---|---|
| `ci/name-standard` | `reference/name-rules.json`: per rule the `classes`, a `pattern` the name must match, `when` (only names that match it are tested), `noOuterSpaces`, and `set` for the fix list | Name not standard, Name to tidy |
| `ci/epo-id` | `reference/epo-id.json`: `required` and `reviewWhenMissing` classes, `notNeeded` (API offerings), `offeringNumber`, `unique` | EPO ID |
| `process/stage` | `reference/lifecycle.json`, `processStages`: `status` (Ready), `below` (the classes that make a process mapped), `waits` (the note), `toMap` and `mapped` (`say`, and `change`, `current`, `set` of the fix list line). Needs the Relationship report | Process stage (D197) |
| `ci/status-age` | `reference/lifecycle.json`, `rules`: `status`, `from` (`created` or `updated`), `days`, `setting` (the team setting that replaces `days`), `fix` (`change` and `set` of the fix list line, for a pack with path `sacm-fix`) | Under retirement too long, Ready too long, Capability Ready too long |

## Checks on the EPO systems report (version 0.14)

Detectors of type `code` in `src/core/checks/detectors/epo-detectors.ts`. They need the EPO systems report loaded with (or before) the CI report. Their reference file is `reference/epo-systems-report.json`: `columns` (the header forms of each column), `statuses` (EPO status word → ServiceNow Operational status), `classes` and `nameSuffix` (how a system matches a CI), `roles` (ServiceNow role ↔ EPO column), `waitDays` and `descriptionStart`.

| Detector | Cards |
|---|---|
| `epo/differs` | EPO ≠ ServiceNow: service mapped CIs, a SACM fix list |
| `epo/not-arrived` | EPO update not arrived: CIs that are not service mapped, a review list |

Both compare the status, the name, the three people and the description (by letters and digits only, `descriptionStart`). There is no card for the description alone since 0.19.

## Checks on the contract files (versions 0.15 and 0.16)

Detectors of type `code` in `src/core/checks/detectors/contract-detectors.ts`. They need the Solusi contract file and the ServiceNow contract report loaded with (or before) the CI report. Their reference file is `reference/contract-reports.json`: `solusi.columns` and `servicenow.columns` (the header forms of each column), `fields` (the fields both files hold), `autoStates` (states ServiceNow sets by itself: the real status is then a tag), `draftStates`, `statusTag` and `targetTag` (patterns), `runningStatuses`; and for version 0.16: `concludedStatuses` (the date problems are asked only for these), `fixedTermWords` (duration types that need an end date), `epo` (the classes whose Asset tag is an EPO ID, the Retired statuses, the fewest digits of an EPO ID), `endsWithinDays` (the page Contract changes) and `problems` (the problems of the message For Procurement, in the order of the message).

| Detector | Cards |
|---|---|
| `contracts/not-in-solusi` | Not in Solusi: a SACM delete list |
| `contracts/to-clear` | To clear by hand: a SACM fix list |
| `contracts/status` | Contract status: a SACM fix list |
| `contracts/problems` | The problems of the contract data (`problems` of the reference file); a pack names the ones it raises in `detector.rules`. For Procurement: problems in Solusi itself, one message to the Procurement mailbox. Contracts to fix in ServiceNow: a SACM fix list (`change` and `set` of each problem) |
| `contracts/upload-check` | Upload check: a SACM fix list (the value of Solusi to set) |

A pack about contracts says `"subject": "contract"`: its card carries the word Contracts and counts contracts, not CIs. `playbook.markWord` changes the word of a fix list ("deleted": Mark as deleted). A fix line can carry `note`: information shown on the line ("Still linked: …"); it changes neither the order nor what to do. Lines saved before version 0.20 have it as `check`. A detector also gives `value` when what to set is a value and not an instruction (the text **Copy** copies, D243), and `relatedTo` when the fix is on the relationships with another CI (its name: **ServiceNow** then opens those rows, D244).

A pack whose `playbook.audience` is `["procurement"]` is asked from the Procurement mailbox of the team settings: one message, never split, nobody copied. Its `playbook.message.byProblem` gives the heading, the first sentence and what is asked for each kind of problem (the first part of the finding's field); the order of `byProblem` is the order of the tables.

A review list that is not about something the process allows says why in `reviewWhy`.

A pack with detector type `manual` gets its findings from what managers mark, not from the report: `LIFECYCLE-REVIEW` (the part `review` of `reference/lifecycle.json` sets the size of the sample, the results a manager can choose, and which results open a case).

The message texts of a check are in its pack (`playbook.message`); there is no separate template folder.

## Rules that are still in the code

These rules are numbers in the code, not in a check file or a setting. None of them is a rule about one check. Changing one needs a developer; say so if SACM wants one in *Settings*.

| Rule | Value | Where |
|---|---|---|
| CIs in one message, before it is split into parts | 25 | `MAX_CIS_PER_MESSAGE`, `src/core/messages/messages.ts` |
| Look-back of the warning before a double contact | 24 hours (open question Q9) | `DOUBLE_CONTACT_HOURS`, `src/core/team/team.ts` |
| People in one Teams group chat link | 15 | `TEAMS_LIMIT`, `src/app/view/groups.ts` |
| Owner groups folded on a card above | 20 | `FOLD_ABOVE`, `src/app/view/groups.ts` |
| Runs the app reads | the last 10 | `ACTIVE_RUNS`, `src/core/memory/memory.ts` |
| Default review date of *Not followed up* | 6 months (a team setting replaces it) | `EXCEPTION_MONTHS`, `src/core/audit/audit.ts` |
| ServiceNow class names and table names → the nine class ids | | `CLASS_ALIASES`, `src/core/sources/ci/ci-report.ts` |
| Operational status codes 1 to 8 → words | | `OPERATIONAL_STATUS`, `src/core/sources/ci/ci-report.ts` |
| Who is never asked: the person the finding is about, and anybody inactive | | `resolveContact`, `src/core/cases/contact.ts` |

The reminder days and the number of reminders before *Escalate* are team settings (*Settings*), not code.

## Adding a check

1. Describe the problem, the audience and the path in a new file in the folder of its subject, with `"status": "proposed"`.
2. Choose the detector: a field condition (`rule`), a small function (`code`), or what managers mark (`manual`).
3. Write the message texts in `playbook.message`.
4. Run `npm run docs` and `npm test` (the validator says what is wrong in the file), then try it on a small scope and review the findings with SACM before messages are sent.
