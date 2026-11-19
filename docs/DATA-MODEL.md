# Data model

The words of the Workbench, the things it works with, and every file of the team folder, field by field. The SACM meaning of the words is in [DOMAIN-RULES.md](DOMAIN-RULES.md); the columns of the reports are in [DATA-SOURCES.md](DATA-SOURCES.md); how the parts fit together is in [ARCHITECTURE.md](ARCHITECTURE.md).

The types named here are in the code: `src/core/model/model.ts` (CI, check, finding), `src/core/cases/cases.ts` (run, fact, event, reply, case), `src/core/memory/memory.ts` (the summary), and the reader of each report type in `src/core/sources/`.

## 1. Glossary

| Word | Meaning | Stored? |
|---|---|---|
| **CI** | A configuration item of the CMDB, as one row of the CI report gives it. Known by its name; the asset tag is added to the key only when two CIs share a name | In a run, only the CIs with a finding (their people) and the inventory |
| **Person** | Someone named on a CI (Owned by, Managed by, Supported by, Assigned to), with their manager and department head. Known by user ID, else email | In a run, with the CI |
| **Check** | One kind of problem: where it applies, how it is found, who is asked, what the message says. One file in `checks/packs/<subject>/` | In the repository, packed into the app |
| **Reference data** | Lists and rules a check reads: statuses, tags, name rules, the relationship model, column names. One file in `checks/reference/` | In the repository, packed into the app |
| **Stand-in** | A word of the repository that stands in for a real value on purpose: an invented person, address, user ID or asset tag of the samples (D110, D266). Listed in `tools/placeholders.json` and [PLACEHOLDERS.md](PLACEHOLDERS.md) | In the repository only, never in the app |
| **Placeholder** | A generic shape that usually marks a missing value: a redaction mark, a row of X, filler text, a placeholder person. `npm test` fails on one that is not listed as a stand-in (`tools/placeholders.ts`) | No |
| **Record team** | A team that is the contact for the record of a class, instead of the people of the CI: Process Management for a Business Process (D195). Which checks go to it: `checks/reference/record-teams.json`; its people: the team settings | Reference in the repository, people in the team folder |
| **Parked class** | A class (and status) that is not checked yet, such as a Business Capability in Ready: no line on any card, one grey line on the first screen (D179). `checks/reference/parked-classes.json` | In the repository, packed into the app |
| **Power BI report** | The Power BI version of the Workbench in `powerbi/` (D268), built in builds B1 to B8 of the plan | In the repository; published to the team's workspace |
| **Next step** | What the team does next with one person, in the order of the team's rules: read their reply, escalate, send a reminder, ask them (new lines). Then they wait: asked, or marked fixed. My day lists the next steps of today, one line per person (D320) | No: worked out at each refresh |
| **Work queue** | The page of the Power BI report with every open line, one line per person asked (D320). In the HTML app the same work is on *My work* | No |
| **Sample mode** | The Power BI report reading the invented samples packed in its model; *SharePoint mode* reads the team's reports folder. The parameter `SourceMode` (D271) | A parameter of the report |
| **Self-check** | The page of the Power BI report that compares its result on the samples with the recorded result of the HTML app (`tests/recorded/`, D270) | No, worked out on each refresh |
| **Priority** | A check field: `daily` (the default) or `later`, work to clarify when there is time (D182) | In the check file |
| **Finding** | One problem found by one check on one CI and one field. Its key, `<check>:<CI key>:<field>`, never changes, so history follows it from report to report | In a run |
| **Fact** | A finding as the run keeps it: plus who to ask, by which route, who is copied, who an escalation goes to, the CI as the message shows it, and its state | In a run |
| **State** | How a fact is listed: `open` (to solve), `review`, `waiting`, `known`. Only `open` turns a card red | In a run, on each fact |
| **Load** | One report file loaded by a manager, of any type | One file in `data/runs/` |
| **Run** | The load of a CI report: what it showed. A load of another type is not a run; its checks run with the next CI report | One file in `data/runs/` |
| **Event** | One thing a manager did: a note, a status, an assignment, a message, a load. Who and when on each | One line in a journal |
| **Journal** | The events of one manager in one month | `data/journal/yyyy-mm/<person>.jsonl` |
| **Team's lists** (Power BI) | The four SharePoint lists the Power BI report reads instead of the team folder: *SACM Journal* (one row per event; since B8 also the lifecycle reviews, their CIs in the column *Items*, D306), *SACM Replies*, *SACM Settings* (the last row of a setting counts, D308) and *SACM Team* (D291; *SACM Reviews* was dropped in B8) | In SharePoint; the columns: [powerbi/README.md](../powerbi/README.md) §5 |
| **Report date** | The date of a CI report: the `yyyy-MM-dd_` at the start of its file name, else the day it was last changed. The Power BI report keeps one run per report date (D290) | In a run |
| **Reply** | An email that came back, matched to a message by the reference in its subject (`[SACM-…]`) | One file in `replies/` |
| **Case** | What the team does about one finding: its status, messages, replies, notes, who has it. Worked out each time, never stored | No |
| **Case line** (Power BI) | One row of the table *CaseLines*: one case of the newest report, with its status, state and next step (D292) | No: worked out at each refresh |
| **Shared case** (group) | The cases of one check that go to the same contact by the same route: one piece of work | No |
| **Status** | Where a case is: New, Contacted, Answered, Fix in progress, Fixed, Not followed up, Verified ([DOMAIN-RULES.md](DOMAIN-RULES.md) §17) | No: worked out from the events and runs |
| **Card** | One check on the overview, with its light | No |
| **Module** | One of the three sections of the overview: Completeness, Correctness, Compliance (the `dimension` of a check) | In the check file |
| **Route** | Where the fix is made: `epo` (in EPO; ServiceNow receives it from EPO) or empty (in ServiceNow, with the request the message names). Runs saved before version 0.17 can hold `sacm` (the service mapped flag was on): it is read as `epo` | On a fact |
| **Summary** | What older runs, journals and replies still mean for the cases. Can always be rebuilt | `data/state.json` |
| **Review** | A lifecycle review: the sample drawn once | `data/reviews/<date>_lifecycle.json` |

## 2. The team folder

```
Workbench/
├── SACM-Workbench.html          the app
├── reports/                     report files, .csv or .xlsx                 ← flow F1, or by hand
├── outbox/                      messages a manager chose to send            ← app; flow F2 sends them
├── sent/                        messages flow F2 has sent                   ← flow F2
├── replies/                     one file per reply                          ← flow F3
│   └── archive/yyyy-mm/         replies whose cases are closed              ← app
└── data/
    ├── runs/                    the last 10 CI runs
    │   ├── relationships/       the last 10 Relationship report loads
    │   ├── epo/                 the last 10 EPO systems report loads
    │   ├── solusi/              the last 10 Solusi contract file loads
    │   └── contracts/           the last 10 ServiceNow contract report loads
    ├── archive/yyyy-mm/         older CI runs                               ← app
    │   ├── relationships/, epo/, solusi/, contracts/    older loads of the other types
    │   ├── removed/             loads a manager removed (wrong file)
    │   └── conflicts/           conflict copies the app tidied
    ├── journal/yyyy-mm/<person>.jsonl     what each manager did, one file per person and month
    ├── reviews/<date>_lifecycle.json      the sample of each lifecycle review
    ├── state.json               the summary (rebuilt when missing)
    ├── settings.json            the team settings
    └── team.json                the SACM managers
```

The app creates `data/` and every folder in it. A report put directly in `Workbench/` is found too. A CI run stays directly in `data/runs/`, as in version 0.6, so an older version of the app never takes another type for a CI run. The folder of each type is the `folder` of its `ReportType`.

**File names.** A load is saved as `<report date>_<file name in lower case, other characters as "_">.json` (`runFileName`). The report date is the `yyyy-MM-dd_` prefix of the file name, else the day the file was last changed. Because names start with the date, they sort by date.

**Nothing is deleted.** Files move to an archive folder; the app never removes a file it cannot put somewhere else.

## 3. The files, field by field

All files are UTF-8 JSON, except the journals (one JSON object per line) and the report files.

### A CI run: `data/runs/<date>_<name>.json`

| Field | Meaning |
|---|---|
| `date` | Date of the report (yyyy-mm-dd) |
| `report` | File name of the report |
| `cis` | Number of CIs in the report |
| `facts` | The facts (below) |
| `tested` | `check:field` pairs that were really evaluated. Only these may close a case when its finding is gone |
| `evaluated` | `check:field` → number of CIs evaluated: the base of the module scores |
| `ciKeys` | Keys of every CI in the report. A case is Verified only for a CI the report contains |
| `notes` | What could not be tested, and why ("CHECK-ID: text") |
| `parked` | The parked classes of this report (D179): `keys` (the CIs that give no line), `fields` (the parked parts of checks, `check:rule`) and `lines` (the grey lines of the first screen). Missing when the reference file is missing: the run then has the note `PARKED` |
| `inventory` | Every CI that is not Retired, as `[key, name, class label, class id, status, EPO ID, Support group, service mapped]`: the lifecycle review draws from it. Service mapped is `true`, `false` or empty (no column in the report) |
| `people` | CI key → `{ owned_by, managed_by, supported_by }`, each `{ id, name, email, active }`, for the CIs with a fact and those of the inventory |
| `relationshipReport`, `epoReport`, `solusiReport`, `contractReport` | The file names of the other loads the checks used |
| `capabilities` | The capability sheet (D205): one row per Business Capability, in the order of `CAPABILITY_COLUMNS` (`src/core/mapping/capability-sheet.ts`): name, status, capabilities above, capabilities below, Business Processes below, description, tags, Owned by, Managed by, hidden characters. Missing when no Relationship report was loaded with the CI report |

**A fact** is a finding plus who is asked:

| Field | Meaning |
|---|---|
| `key` | `<check>:<CI key>:<field>`. Never changes |
| `checkId`, `ciKey`, `ciName`, `className`, `classLabel`, `field`, `severity`, `detail` | What was found, on which CI |
| `module` | `completeness`, `correctness` or `compliance` |
| `route` | `epo`, `sacm` or `''` |
| `contactName`, `contactEmail`, `contactId`, `contactVia` | Who is asked, and why this person (`contactId`: user ID, else email, lower case; `''` = nobody found; `procurement-mailbox`, `epo-inventory-owner` and `team:<id>` (a record team, D195) are resolved from the team settings) |
| `cc` | Who is copied |
| `escalateName`, `escalateEmail`, `escalateVia` | Who an escalation goes to (`manager` or `department head`; for a person asked as Managed by, from 0.21: `owner`, `manager of owner` or `department head of owner`, D160) |
| `ci` | The CI as the message table shows it: `epoId`, `status`, `supportGroup`, `ownedBy`, `managedBy`, `chips`, `tags` (the tags of the CI, shown on the screen and in Export this list, never in a message), and `contract` for a contract |
| `state`, `stateWhy` | The state, and why it is not `open` |
| `source` | What the source holds, in words, when the line was compared with it first (D190): "Primary Responsible is empty in EPO too". It is also the end of `detail`; the message then shows the column "What we found" |
| `mapping` | On a case of the mapping backlog (D200): the ids of its reasons (rules of the relationship model, or `tagged-to-delete`) |
| `review`, `fix`, `contactCi`, `chips`, `wait`, `group`, `inServiceNow` | Set by some detectors: listed for a review only; a line of the SACM fix list (`change`, `current`, `set`, `note`, `value`: the text **Copy** copies, `relatedTo`: the other CI of a fix on relationships; runs before 0.20 have `check`); another CI whose people are asked; words next to the CI; why it waits; the kind it is listed under (contract cards); the fix is made in ServiceNow whatever the class (a Service Instance without a Business Application) |

A finding about a contract has no CI: its CI key is `contract:<Solusi number>` (the ServiceNow number when there is none). The run gets the contract as a CI-shaped record of class `contract`; it is never counted as a CI.

### The other loads: `data/runs/<folder>/<date>_<name>.json`

Each holds `kind`, `date`, `report`, `notes`, and what its reader read:

| Type (`kind`) | Folder | Its rows |
|---|---|---|
| `relationship` | `relationships/` | `relationships`: `parent`, `type`, `child`, `parentClass`, `childClass`, `parentTag`, `childTag` |
| `epo` | `epo/` | `systems`: `epoId`, `name`, `description` (plain text), `status`, `statusWord`, `department`, `owner`, `responsible1`, `responsible2` (user IDs), `changed` |
| `solusi` | `solusi/` | `contracts`: the Solusi fields (number, name, status, vendor, dates, duration, people as text, EPO ID, `sheet`: active or terminated) |
| `contract` | `contracts/` | `contracts`: the ServiceNow fields (number, `vendorContract`, state, name, vendor, dates, people with user ID, email and active, tags, `criticality`) |

The exact fields are the `*Run` types next to each reader (`src/core/sources/<type>/`).

### A journal: `data/journal/yyyy-mm/<person>.jsonl`

One event per line, sorted by time. `<person>` is the manager's email in lower case, other characters than letters, digits, `.`, `_` and `-` written as `_`. Each manager writes only their own file, so two people never write the same file.

| Field | Meaning |
|---|---|
| `id` | Unique id of the event |
| `at` | ISO date and time |
| `by`, `byName` | The manager's email and name |
| `type` | One of the eleven types below |
| `keys` | The finding keys it is about (empty for events that belong to no case) |
| `text` | A note, a status, or what changed |
| `ref`, `to`, `cc`, `subject`, `kind`, `channel` | For a message: its reference, recipients, subject, `first` / `reminder` / `escalation`, and `mailbox` / `outlook` / `teams` |
| `person` | For a note about a person: their contact key |
| `reason`, `reviewOn` | For *Not followed up*: the reason and the review date |
| `checkId`, `ciKey`, `ciName` | For a standing *Not followed up* on a CI not raised yet (`checkId` `*` = every check), and for a lifecycle review answer |

| `type` | Written when | Keys |
|---|---|---|
| `note` | A manager writes a note on a case | the cases |
| `status` | A manager sets a status (`text`), also *Fixed* on a fix list | the cases |
| `assign` | A manager assigns cases (`text` = the colleague) | the cases |
| `request` | A manager records a request number (`text`) | the cases |
| `message` | A message is sent, opened in Outlook, or a Teams chat confirmed | the cases |
| `report` | A report is loaded or a load removed (`ref` = the load's file name) | none |
| `handover` | A manager hands work to a colleague (`to`, note in `text`) | the cases |
| `person-note` | A note about a person contacted (`person`) | none |
| `exception` | *Not followed up* (`reason`, `reviewOn`, `text`) | the cases, or none for a standing one |
| `settings` | Settings or the team list changed (`text` = one line per field) | none |
| `review` | A lifecycle review started (`ref`), or a CI answered (`ref`, `ciKey`, `reason`) | none |
| `retirement` | A manager writes the planned retirement date the owner gave (`retireOn`, yyyy-mm-dd; empty takes it away; `text` a note). Until that date the finding waits | the cases |
| `stage` | A manager sets the stage of a case of the mapping backlog (`text` = the id of the stage, D201) | the cases |
| `no-process` | On a case of the mapping backlog, the owner says the Business Process does not exist (`text` `yes`, or `no` when the mark is taken away, D203). The message to Process Management is a `message` line on the keys of the cases with `:no-process` in place of `:mapping`: it belongs to no case | the cases |
| `reviewed` | SACM checked a finding listed for a review first (*Above parent*), or could not fix a line of a fix list alone (*Too many partners*): `text` "Ask the owner" (the owner is asked) or "Back to review" (back to the review list, or back to the fix list) | the cases |

Older versions of the app ignore the types they do not know.

### An outbox message: `outbox/<reference>_<time>.json`

Written by *Send*; flow F2 sends it unchanged and moves it to `sent/`. The app never moves or deletes it. A file that is in `outbox/` and not in `sent/` is a message that waits: after one hour its cases show as queued, and the days to the reminder count from the day the file reached `sent/` (D162). This is worked out when the folder is read; nothing about it is saved.

A reminder with new points (D161) is one outbox file and two `message` lines in the journal with the same `ref`: `kind: reminder` on the cases reminded and `kind: first` on the new ones. Older versions read them as two messages of one thread.

| Field | Meaning |
|---|---|
| `ref` | The reference, also in the subject (`SACM-…`) |
| `to`, `cc` | The recipients, as the manager left them |
| `subject`, `body` | The message (body in HTML) |
| `requestedBy`, `requestedAt` | The manager's email and the time |

### A reply: `replies/<time>_<id>.json`

Written by flow F3. Fields `from`, `received`, `subject`, `body` (HTML; `preview` is read when there is no body). A file whose subject holds no `[SACM-…]` reference is not a reply. The text is always shown as text.

### The summary: `data/state.json`

| Field | Meaning |
|---|---|
| `version` | 1 |
| `archivedRuns` | File names of the runs in `data/archive/`; when they do not match the folder, the summary is rebuilt |
| `journalFrom` | yyyy-mm: journal months before it are not read |
| `firstSeen` | Finding key → the date it was first seen |
| `facts` | The last fact of each finding that is not in the active runs but whose case is still open |
| `people` | The people of those CIs |
| `events` | The events of older journal months that still matter (on kept findings; *Not followed up* that still runs or has no keys) |
| `replies` | The older replies those events refer to |

### Settings: `data/settings.json`

| Field | Meaning | Default |
|---|---|---|
| `portalLink`, `requests` | The Service Portal link, and each request (`REQUESTS` id → `{ name, link }`) | empty |
| `signature` | The team line under a message | `SACM team` |
| `reminderDays`, `maxReminders` | Working days before a reminder is due; reminders before an escalation | 3, 2 |
| `staleDays` | Days before a report tile says the report is old | 3 |
| `epoOwnerName`, `epoOwnerEmail` | The EPO inventory owner: the fallback for a CI from EPO when nobody can be asked | empty |
| `procurementName`, `procurementEmail` | The Procurement mailbox | `Procurement`, empty |
| `procurementLeadName`, `procurementLeadEmail` | The Procurement lead: gets the escalation of the message For Procurement | empty (no escalation) |
| `teams` | The people of each team of `reference/record-teams`, by team id: `{ "process-management": { name, people: [{ name, email }] } }`. Every person gets the message to the team (D195) | empty (the message to the team cannot be written) |
| `exceptionMonths` | Months until the review date of *Not followed up* | 6 |
| `underRetirementDays`, `readyDays` | Days before *Under retirement too long* and *Ready too long* | 90, 90 (a file saved before 0.20, without the Procurement lead, that holds 180 is read as 90) |
| `serviceNowAddress` | The ServiceNow of the team, as "https://" and the host: each record of a SACM list opens a search there (D244) | empty (no link) |

Real links and addresses live only here, in the team folder, never in the repository.

### Team list: `data/team.json`

`{ "version": 1, "members": [{ "name", "email" }] }`, one entry per email, sorted, so every computer writes the same bytes.

### A lifecycle review: `data/reviews/<date>_lifecycle.json`

| Field | Meaning |
|---|---|
| `kind` | `lifecycle` |
| `id` | The file name without `.json` |
| `date`, `report`, `reportDate` | The day it was started, and the CI report the sample came from |
| `items` | `ciKey`, `name`, `classLabel`, `className`, `status`, `epoId`, `group` (`sample` or `under-retirement`) |

No who and no when: who started it and every answer are `review` events.

### In the browser only

The manager's name and email (`sacm-workbench.user`), the theme (`sacm-workbench.theme`) and the time of the last visit per folder and manager (`sacm-workbench.visit|…`) are kept in the browser's storage. Nothing else.

## 4. How the folder stays small

What the app reads when it opens the folder or a manager presses *Refresh*: the last 10 CI runs, the newest load of each other type (and the Solusi file before it, for Contract changes), `state.json`, the journal months from `journalFrom` on, the replies still in `replies/`, the reviews, the settings and the team list.

When a report is loaded (`maintain`, `src/app/state/folder.ts`):

1. Runs beyond the last 10 move to `data/archive/yyyy-mm/`.
2. Replies whose cases are all closed (Verified, or not followed up) move to `replies/archive/yyyy-mm/`; so do replies that match no case once they are older than the journal months read.
3. `state.json` is written again (`compact`): for every finding still shown or still open, its first date, the last fact of findings no longer in the last 10 runs, and the older events and replies on them. A case that is closed and in no active run is left out; its history stays in the archive.

`state.json` is rebuilt from every file when it is missing, has another version, does not match `data/archive/`, or has a conflict copy (`rebuildReason`). The app says so.

The audit export is the only part that reads the whole archive, and only on its button, one run at a time.

## 5. What older files may lack

Files written by older versions open in the current one. Each reader has a default:

| Missing | In files written before | Read as |
|---|---|---|
| `evaluated`, `ciKeys` on a run | 0.4 | No score base; a missing CI is not taken as Verified |
| `people` on a run | 0.5 | The people of the newest run that has them |
| `loadedBy`, `loadedByName`, `loadedAt` on a load | 0.7 (and no longer written since 0.11) | Who loaded it comes from the `report` events of the journals |
| `escalateName` …, `ci` on a fact | 0.8 | Nobody is known to escalate to; the message table from the newest run |
| `escalateVia` `owner` … on a fact | 0.21 | The run was saved with the older rule (the Managed by person's own manager); the next report, or *Run the checks again*, gives the owner |
| `state` on a fact | 0.9 | `open` |
| `relationshipReport` on a run | 0.10 | No relationship report was used |
| `inventory` on a run | 0.13 | The lifecycle review cannot draw from it |
| `epoReport` | 0.14 | No EPO report was used |
| `solusiReport`, `contractReport`, contract keys | 0.15 | No contract files were used |
| `excluded` on a relationship of a Relationship load | 0.18 | The relationship passes criticality (it is not excluded) |
| Journal event `reviewed` | 0.18 (older versions ignore it); also on *Too many partners* since 0.19 | An older version shows the finding under To review, or on the fix list |
| `inServiceNow` on a fact | 0.19 | The fact keeps the route it was saved with |
| `ci.tags` on a fact; `fix.note` | 0.20 | No tags on the line; `fix.check` is read as the note |
| Journal event `retirement` | 0.20 (older versions ignore it) | An older version shows the finding as to solve |
| `procurementLeadName`, `procurementLeadEmail` in `settings.json` | 0.20 | No Procurement lead; `readyDays` 180 is read as 90 |
| `capabilities` on a run; `mapping` on a fact; journal events `stage` and `no-process` | 0.28 (older versions ignore them) | No capability sheet for that run (load the CI report again with a Relationship report); a mapping case without its reasons shows its `detail`; without `stage` events a case is To plan. An older version shows the mapping cases as an owner card |
| `fix.value`, `fix.relatedTo` on a fact; `serviceNowAddress` in `settings.json` | 0.33 | No **Copy** on the line (the next report writes the value); a fix on relationships opens the CI; no link until Settings has the address. Saving the settings in an older version drops the address |
| `teams` in `settings.json`; contact `team:<id>` on a fact | 0.27 | Nobody is in a team: its messages cannot be written until Settings names its people. An older version keeps a fact with a team contact in a group of its own and cannot write to it; saving the settings in an older version drops `teams` |
| `source` on a fact; the eighth value of an `inventory` row | 0.26 | The line was not compared with EPO (the next report, or *Run the checks again*, compares it); the lifecycle review line says both ways (service mapped or not) |
| `parked` on a run | 0.25 | Nothing is parked in that run: every CI was checked. Once a newer run parks a CI, its cases are no longer shown (not Verified, not open) |
| `written`, `writtenBy` in `state.json` | (present before 0.11) | Ignored |
| Status `Waived` or `Exception accepted` | 0.12 / 0.12.1 | *Not followed up* without a review date |
| Journals by month | 0.5 | One file per person is split into months the first time the folder is opened |

The file formats of the team folder did not change in the architecture cleanup (pieces A1 to A8).

Version 0.34.0 built between 14 and 17 Nov 2026 used other names for the folders, fields, settings and check ids made from the names of EPO and Solusi (D253). D267 assumes it was not used on the team folder. 0.35.0 brought the names back (D266), so every file reads as before.
