# Domain rules

The SACM rules the Workbench follows, and their nuances, in one place. Each rule names the decision it comes from (`D…`, see [DECISIONS.md](DECISIONS.md)). The SACM process documentation is the specification ([PROCESS-BASELINE.md](PROCESS-BASELINE.md)); where this page and the process disagree, the process wins and this page is corrected. The checks themselves, one line each, are in [CHECKS.md](CHECKS.md).

Most rules here are data in `checks/`. The file is named next to the rule, so a rule can be changed without a code change.

## 1. Words used here

| Word | Meaning |
|---|---|
| **CI** | A configuration item of the CMDB, for example a Business Service. |
| **Check** | One kind of problem: where it applies, how it is found, who is asked, how it is fixed. One file in `checks/packs/<subject>/`. |
| **Finding** | One problem found by one check on one CI (and one field, when the check looks at several). |
| **Run** | One loaded CI report and the findings it gave. |
| **Case** | What the team does about a finding: worked out from the runs, the journals and the replies, never stored. |
| **Shared case** | The cases of one check that go to the same person by the same route. One piece of work. |
| **To solve, to review, waiting, known** | The state of a finding (section 9). |
| **SACM fix list** | A card where nobody is asked: SACM corrects the data in ServiceNow itself. |
| **Review list** | A card that lists what is allowed but worth a look. Never red. |

## 2. Classes and where they come from

**In scope: the nine logical classes** (D30): Business Capability, Business Process, Business Application, Business Service, Service Offering, Service Instance, API, Application, Technology Management Service. Infrastructure classes are out of scope.

| Class | Comes from | So the fix is made |
|---|---|---|
| Business Service, Service Instance | The EPO integration (`checks/reference/epo-synced-classes.json`) | In EPO (section 7) |
| Service Offering | A ServiceNow record. Most are created by the EPO integration, some by SACM by hand (D122) | From EPO: in EPO, on its Business Service. Made by a person: in ServiceNow, request "Add or modify a Service (CI)" (section 7) |
| Business Process | Created by SACM from the process library, after governance approval | In ServiceNow, by SACM |
| Business Capability, Business Application, API, Application, Technology Management Service | ServiceNow | In ServiceNow |

A **Platform** is a Service Instance with Platform ticked (`u_platform`). The relationship checks treat it as its own class; every other check sees a Service Instance (D73).

A **contract** is not a CI. It comes from Solusi, through an import into ServiceNow (section 20).

**A Retired CI is never checked.** Every check leaves out Operational status Retired.

**Parked classes** (D179, `checks/reference/parked-classes.json`): a class that is not checked yet gives no line on any card, not even waiting, and is not counted as tested. Today: a **Business Capability in Ready** (its rules are still open with Enterprise Architecture, [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md)), and **API, Application and Technology Management Service** whatever their status (not used yet). The rule *a Business Process needs a Business Capability* is parked with them. The first screen, the load message and the verification record say it in one grey line per rule: "236 Business Capabilities in Ready are not checked yet". A capability that is Operational or Under retirement is checked as before.

## 3. Identity

- **A CI is known by its name.** The asset tag is added only when two CIs share a name (D26). The reports have no sys_id.
- **A person is known by user ID** (`user_name`), else by email. Display names are not unique (D27).
- **Hidden characters** (zero-width space, zero-width joiners, the byte-order mark) do not count when names are matched; a non-breaking space counts as a space. The identity writes a hidden character as "?", as the CSV export does, so a CI keeps its history whether its report came as `.csv` or `.xlsx` (D28). The name shown is never changed.
- **Two CIs with one name and no asset tag**, one live and one Retired: a relationship to that name belongs to the live one (D29).
- **A contract** is known by its Solusi contract number (`contract:<number>`), or by its ServiceNow number when it has no Solusi number (D93).

## 4. Roles

| Role in ServiceNow | Name in EPO | Mandatory on |
|---|---|---|
| Owned by | System Owner | All nine classes |
| Managed by | Primary Responsible | All nine classes |
| Supported by | Secondary Responsible | Service Instance and Service Offering (D181) |

- Owned by is accountable and approves changes of Owned by and Managed by. Managed by is the day-to-day contact and the second person of the 4-eyes approval.
- Supported by is **not** mandatory on Business Application or the other classes (D31). An empty or inactive Supported by has its own card, *Supported by* (D181), on Service Instance and Service Offering only: Managed by is asked, then Owned by. A Service Instance is fixed in EPO; a Service Offering by a reply or the request "Add or modify a Service (CI)", action "Modify service offering", never EPO. *Owner or manager missing* and *Inactive person* look only at Owned by and Managed by.
- **A Business Application is a copy of its Service Instance** (D180): it gets no line on the role cards, *Description*, *Name not standard*, *Ready too long*, *Under retirement too long* and *Deleted but operational*. A difference with its instance is on *Application ≠ Instance* (section 12).
- A role is **inactive** when the report says the user is not active. An empty role whose `.active` column says FALSE is empty, not inactive.
- **Owned by = Managed by** is a finding (RESP-SAME-PERSON), compared by user ID, then email. The tag "Owned by is interim managed by" makes it known (section 10).
- Changing Owned by needs approvals that depend on who asks (the process): the current owner asks → the new owner approves; the new owner asks → the current owner approves; anyone else → both approve. Managed by follows the same pattern with the current owner and the new Managed by. When Owned by is empty or inactive, this approval cannot run: see [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).

## 5. Who is asked

Each check lists its audience in order; the first person who can be reached gets the message (`playbook.audience`).

- **The person a finding is about is never asked** about it. Inactive people and inactive managers are skipped (D33).
- **A missing or inactive owner:** ask Managed by, else the owner's manager or department head, and ask them for the name of the new person (D32).
- **The other responsible people of the CI are copied** (Cc). A manager can change every address before sending.
- **`sacm`** in the audience means nobody is asked: SACM fixes it (a SACM fix list).
- **`procurement`** means the Procurement mailbox of the team settings (section 20).
- **A finding can name another CI whose people are asked** (`contactCi`). *Offering owner ≠ Service owner* asks the owner of the Business Service, else its Managed by (D71).
- **Nobody can be asked** on a CI from EPO: the EPO inventory owner of Settings is the fallback (D47).
- **A team is the contact for the record of a class** (D195, `checks/reference/record-teams.json`): a problem on the record of a **Business Process** goes to the **Process Management** team, never to the process owner or manager. Checks: *Owner or manager missing*, *Inactive person*, *Owner = Manager*, *Description*, *Duplicate names*, *Tag missing*, *Deleted but operational*, *Under retirement too long*. The people of the team are in Settings, *Requests and mailboxes*; every person gets the message, with one table per kind of problem, and nobody else is copied. A message to a team is never split. Without people in Settings it cannot be written, and the group says so. There is nobody above a team: after the reminders the manager types who gets the escalation (D160). Not routed to the team: the mapping of a process (the *Mapping backlog*: SACM with the process owner) and the criticality cards (SACM does not chase the BIA).

Words of the audience list: a role (`owned_by`, `managed_by`, `supported_by`); `otherRoles` (the other roles of the CI); `managerOf(x)` and `departmentHeadOf(x)`, where `x` is a role, or `field` for the role the finding is about; `sacm`; `procurement`; `party:<id>`.

## 6. How a problem is fixed

The tool never changes the CMDB (D6). It tells the right person exactly what to do.

| Path (`playbook.path`) | What happens |
|---|---|
| `service-request` | The person raises the named request in the Service Portal; its approvals run there. The message names the exact form and links it from Settings |
| `self-fix` | The person replies; SACM makes the change in ServiceNow |
| `email` | The person corrects it (in EPO for a CI from EPO) and replies |
| `sacm-fix` | Nobody is asked. The card is a fix list: one row per record with every change, *Copy* the value to set, *ServiceNow* opens the record, *Share out*, *Export*, *Mark as fixed* (D242 to D245). When every line is marked, the card takes the waiting colour; the lines count as to solve until a later report no longer shows them (D168) |
| `source-fix` | Fixed where the data is born: in EPO, or in Solusi by Procurement. A review list when SACM only checks the pattern |

**Requests** are named as the Service Portal category lists them (D41): Owned by - update, Managed by – update, Support group update, Criticality - change CIAA values, Service Mapping, and Add or modify a Service (CI) with its action "Modify service offering". **There is no request to change Supported by**: the message asks for a reply and SACM makes the change (D42). Before naming a new request in a message, check that it exists in the portal.

**Standard and non-standard requests** (the process): one CI and a supported attribute is a standard request; several CIs or other attributes, a non-standard one. The requester must bring approval from the owner or manager of the CI (4-eyes).

**Relationships and service mapping** are updated in ServiceNow by SACM, after validation with the System Owner or the Business Process Owner. The Business Process Owner signs off the service map.

**The kind of a card** follows from this table and two other fields (D167): the audience `procurement` gives *One mailbox*; `reviewOnly` gives a *Review list*; `sacm-fix` gives a *SACM fix list*; everything else is *Owners*.

## 7. Where a fix is made: EPO or ServiceNow

The rule is data in `checks/reference/epo-synced-classes.json` (D122, D123). A check follows it with `playbook.routeBy: "epo"`.

| CI | The fix is made |
|---|---|
| Business Service, Service Instance | In EPO, by the person the check asks: each System Owner or Primary Responsible corrects their own records (D45). ServiceNow receives it from EPO |
| Service Offering **from EPO**: Created by is filled and is not a person's user ID (3 letters or digits) | In EPO, on its Business Service |
| Service Offering **made by a person**: Created by is a user ID, empty, or not in the report | In ServiceNow: the owner replies, or raises "Add or modify a Service (CI)", action "Modify service offering" |
| Every other class | In ServiceNow, with the request the message names |

Nuances:

- **The Support group is a ServiceNow field.** Its messages always name the ServiceNow request, on every class: "Add or modify a Service (CI)" for an offering, "Support group update" for a Service Instance (D125).
- **Criticality and tags stay in ServiceNow** on every class, also on the EPO classes (D48). So the criticality and tag checks do not follow the rule; responsibility, description, names, tag/status and relationships do.
- A report without the Created by column (`sys_created_by`) gives a note, and every offering counts as made by a person.
- **A rule can say the fix is made in ServiceNow whatever the class:** a Service Instance without a Business Application is mapped by SACM in ServiceNow with the owner (D139).
- The EPO inventory owner in Settings is only a fallback, when nobody can be asked on a CI from EPO (D47).
- The links between Business Services and EPO systems are made by the EPO integration, not by hand (D51).
- **The source first** (D190): before the owner of a Service Instance is asked about a person, the app looks at what EPO holds (section 14). The owner is asked only when EPO itself is wrong.

**The service mapped flag** (`ref_cmdb_ci_service.u_service_mapped`) is never named in a message and is never a reason to ask for a reply (D124). It exists only on Service Instances. With the flag on, EPO no longer updates the ServiceNow record, so SACM copies the EPO value into ServiceNow itself, every week: that is the card *EPO ≠ ServiceNow* (section 14), the only card that reads the flag.

## 8. Statuses of a CI

Logical classes use **Operational status**: Ready, Operational, Non-Operational, Under retirement, Retired. EPO statuses map to these.

| Status | Rule |
|---|---|
| Ready | Not live yet. A CI is created in Ready and becomes Operational after sign-off; criticality comes after the BIA. Its findings are **waiting** (D53), with exceptions (section 9). Ready for more than 90 days after creation is a finding (section 15) |
| Operational | Live: every check applies |
| Under retirement | Still in use, mapped as usual. More than 90 days without a change of the record is a finding (section 15) |
| Retired | Never checked. A relationship to a Retired CI is a finding (section 12). A relationship counts only when neither end is Retired (D67) |

The tag "Will be retired" means the CI is still in use.

**Support group.** Every Service Offering and Service Instance needs a Support group (SUPPORT-GROUP-MISSING). On every class, a Support group that is no longer active is a finding (SUPPORT-GROUP-INACTIVE, procedure 2.5; needs the column `support_group.active`). SACM does not fix a support group: the owner or manager raises *Support group update* (in EPO for a CI from EPO).

## 9. Finding states: to solve, to review, waiting, known

Not every finding is work for today. When a report is loaded, each finding gets one state (D52, `src/core/checks/finding-states.ts`).

| State | When | Rule in |
|---|---|---|
| **To solve** | Everything else | — |
| **To check** | The check lists what is allowed but worth a look | `"reviewOnly": true` in the pack, or `review` on the finding |
| **Waiting** | The CI is not live yet (status Ready); or an EPO change younger than two days (`wait`) | `checks/reference/not-live-statuses.json` |
| **Known** | A tag of the team explains the finding | `checks/reference/known-tags.json` |

- **Only to solve** turns a card red, counts in the scores and "Today", and is offered a message. Only the daily cards count in the red number, the scores and "Today": a card with `priority` `later` is to clarify when there is time (D182).
- **Order:** not live wins over a tag, a tag over review (D58).
- **These checks do not wait on Ready** (D54, `exceptChecks`): what SACM fixes itself (NAME-HIDDEN-CHAR and the SACM fix lists), READY-TOO-LONG (it is about Ready itself), LIFECYCLE-REVIEW, and the EPO checks (EPO has its own status for a system in construction). So a hidden character in a name stays to solve on a Ready CI (D55).
- A card with only waiting or known items is **green**: "Nothing to solve · 12 known · 30 waiting".
- When a Ready CI becomes Operational, or a tag is removed, the finding is to solve at the next report. Nothing is lost.
- A missing reference file gives a note, and everything stays to solve.
- Findings saved before version 0.9 have no state and are read as to solve (D61).

## 10. Tags

The tags are the team's own register of known cases. They are compared ignoring case and spaces.

| Tag | Meaning in the Workbench |
|---|---|
| BIA is pending, BIA N/A | *BIA missing* and *No criticality reaches the CI* are **known** |
| Owned by is interim managed by | Owner = Manager is **known** |
| To Be Mapped, Descoped, Process is missing or unknown | Relationship missing is **known** |
| Descoped | **Not deletion.** Taken out of service mapping earlier, now to be mapped. Shows the chip "to map" (D57, `checks/reference/tag-chips.json`) |
| To be deleted, EPO - Subsystem (To be Deleted) | With status Operational: the card *Deleted but operational* (TAG-STATUS-CONFLICT). The owner gives the planned retirement date; until then the CI waits (section 15) |
| Will be retired | Still in use |
| Customer facing / Internal BP | A Business Process has exactly one process-type tag (TAG-MISSING, `checks/reference/mandatory-tags.json`): *Internal process* or *Internal BP*, or a tag whose last words are *facing* or *facing process* after a first word (the company's own word, so it is not written here; D286). SACM sets it, also on a process in Ready; when SACM cannot tell, **Cannot tell which type: ask Process Management** (D198) |
| Target BC = n (on a contract) | The contract's business criticality; makes a contract "still linked" (section 20) |
| S - <status> (on a contract) | The Solusi status of a contract that ServiceNow shows as Expired (section 20) |

Tags are changed in ServiceNow only (D48). There is no list of allowed tags yet, so *Tag not allowed* (TAG-INVALID) is switched off until Carlos gives the list (D150): see [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md).

**The tags of a CI are shown** on each line of a card, of an owner group and of a fix list, and in the column Tags of *Export this list*, because they often answer a question. They are never in a message to the owner (D151).

## 11. Criticality (CIA-A)

Four dimensions: Confidentiality, Integrity, Availability, Authenticity. Each on a scale 1 to 4, shown in ServiceNow words, never as numbers (D37).

| Concept | Meaning |
|---|---|
| Target | The real criticality of the CI, per dimension. For a Business Process it comes from the Business Impact Analysis |
| Inherited | Per dimension, the highest Target of all parents whose relationship is not excluded |
| Exception | Target lower than Inherited. Needs a justification from a fixed list, matching the dimension, and an approval. The stakeholder requests it in the Service Portal; ServiceNow approves it |
| Exclusion | A flag on a relationship that stops inheritance through it. Approved by the director of the owner's area |
| Due date | 14 days after a parent's Target changed. Then Inherited becomes Target unless an exception or exclusion stops it |

Rules:

- **The criticality checks run on Business Process, Business Application, Business Service and Service Instance only** (D62). Service Offering is "potentially excluded" in the procedure. Business Capability, at the top, has none; Technology Management Service has no parent.
- **Criticality starts on the Business Process** (the BIA) and flows down: each parent passes its values (its Target, else its Inherited value) to its children; the highest per dimension wins. **A relationship "Excluded for calculation" passes nothing** (D131): the app reads that column of the Relationship report.
- **BIA missing** (D186): a Business Process in Ready without CIA values gives no line. An Operational or Under retirement process without CIA values and without the tag BIA N/A or BIA is pending is a SACM line (CRIT-TARGET-MISSING): the status is wrong, or a tag is missing. Nobody is emailed. Known with the tag BIA is pending or BIA N/A.
- **The other classes are not asked for a target** (D132). On a Business Application, Business Service or Service Instance:
  - Inherited and Target both empty: *No criticality reaches the CI* (CRIT-NONE-REACHES), a SACM review linked to the mapping. Each line says why: no parent relationship, no parent with a criticality, only parents over an excluded relationship, or a parent with a criticality but nothing inherited yet.
  - Inherited set and Target empty: waiting. ServiceNow copies Inherited to Target after two weeks. After 14 days without a change of the record it is listed for the review too (D133).
  - A Target without Inherited is fine: a CI is often assessed before it is mapped.
- **Target lower than Inherited without a valid justification** is to solve (D63, D185). What the field holds decides who acts:
  - only the automatic text ("Inherited value increased (Auto generated)"): *Automatic justification only* (CRIT-AUTO-JUSTIFICATION), an email to the owner. The CI kept a lower value after its parent was raised: which justification applies, or should the value follow the parent? SACM then selects it or raises the Target.
  - anything else (empty, or a text that does not cover the lowered dimension): *No justification* (CRIT-NO-JUSTIFICATION), a SACM list: SACM applied the exception, so SACM adds the justification from the request. When the request gives none, *The request gives none: ask the owner* on the case asks the owner.
- **Above parent:** a Target value higher than every value the parents pass on is odd (D134). Often a parent relationship is missing, so SACM checks the mapping first (To check). When the mapping is complete, a manager presses *Mapping is complete: ask the owner* on the case: the finding is to solve, and the owner confirms the value or lowers it with the criticality request. Parents over an excluded relationship do not count. Without the Relationship report the Target is compared with the Inherited field.
- An approval task with no reaction for 14 days is rejected automatically, and so is an approval when Owned by is empty (the process). These dates are not checked yet: the CI report cannot show them (D65).
- Criticality is changed in ServiceNow only, with the request *Criticality - change CIAA values* (D48).

## 12. Relationships

The model is data, ported from the Service Mapping Workspace with its rule ids (D66): `checks/reference/relationship-model.json`. Parent = upstream, child = downstream. Types are written `parent::child`, for example `Consumes::Consumed by`.

**Mandatory relationships:**

| A CI of class | Needs | Count |
|---|---|---|
| Business Capability | a Business Process or Business Capability as child | at least 1 (D140) |
| Business Process | a Business Capability as parent | at least 1 |
| Business Process | a Business Application or Business Service as child | at least 1 |
| Business Application | a Business Process as parent | at least 1 |
| Business Application | a Service Instance or Platform as child (Consumes::Consumed by) | exactly 1 per environment |
| Business Service | a Service Offering as child | at least 1 |
| Service Offering | a Business Service as parent, the same one as its Parent field | exactly 1 (D69) |
| Service Instance, Platform | a Business Application as parent | exactly 1 |

**Review only, not agreed** (D72): Service Offering without a Service Instance; a Platform above the Service Instance that uses it. A Business Service without a Business Process above is mapping work since D200.

**The mapping backlog** (D200 to D206, check *Mapping backlog*, `checks/reference/mapping-backlog.json`). Mapping is one case per CI, run by SACM with the owner in a mapping session; the mapping itself is designed in the Service Mapping Workspace and made in ServiceNow by SACM. A CI is a case when:

| A CI of class | Is a case when |
|---|---|
| Service Instance, Platform | it has no Business Application above |
| Business Application | it has no Business Process above, or no Service Instance below, or it is tagged To be deleted and still Operational (decided in the session: retire it, or it was never an application) |
| Business Service | it has no Business Process above |
| Business Process | it has nothing below; in Ready only once it has CIA values |

- One line per CI, with every reason. These rules are not on *Relationship missing*.
- **States:** a tag To Be Mapped, Descoped or Process is missing or unknown makes the case known (planned). A CI in Ready waits, except a process with CIA values: that one is to map now.
- **Stages** (D201): To plan, Session held, Classified, Application linked, Process linked; each class its own steps. A manager sets the stage on the case, in any order. The case is solved only when a later report no longer shows the problem.
- **Invite** (D202): one email to the owner (Owned by, else Managed by, else the owner's manager) to plan a 30-minute session. No list of questions.
- **The process does not exist** (D203): on a Business Service or Business Application without a process, SACM marks the case; *Tell Process Management* writes one message to the team with the marked CIs. The owner is not asked to create the process.
- **Criticality lines** of the same CI (*Above parent*, *No criticality reaches the CI*) show on the line and in the case (D204).
- **Capability sheet** (D205): every Business Capability as one CSV file, for the talks with Enterprise Architecture and Process Management.

**Not allowed:** a Business Application linked directly to a Business Service or Service Offering; a Business Service as parent of another Business Service; a Business Process linked directly to a Service Instance, Platform, Application or API. A type that is not in the dictionary for a pair is a wrong type.

**Rules and nuances:**

- **Only one relationship between two CIs**, of any type or direction (D68). The same relationship entered twice, or two types, or both directions: SACM keeps the right one.
- **A relationship counts only when neither end is Retired** (D67). The card *Relationship to a Retired CI* (procedure 2.12) is switched off for now (D141).
- **Ends are matched** by name, class and asset tag; when a live CI and a Retired one share a name, the live one (D29).
- **Environment** of a Service Instance: its Environment field, else the end of its name ("- TEST"), else production (D73).
- **Offering parent** (D70): when an offering's Parent field and its Business Service relationship disagree, SACM fixes it, nobody is asked. An offering whose Parent field names a service is not on *Relationship missing*.
- **A Business Application is a copy of its Service Instance** (the production one whose name it carries, procedure 2.9; D180): the same Owned by, Managed by, Operational status, description and name (the instance name without " - PROD" or " - TEST", plus "_BA"). A difference is a SACM fix list (APP-INSTANCE-MATCH), whose line says the value of the instance. A description differs when the instance has one of at least 30 letters and the application has none, a shorter one, its own name, or only the first words of the instance text (D189). Names are compared without case and spacing.
- **A Service Offering has the owner of its Business Service** (procedure 2.6). An offering from EPO takes it from EPO and is not raised. A hand-made offering with another owner is a SACM fix list: SACM copies the owner (D137).
- **Too many partners** is a SACM fix list (D138): SACM fixes the mapping in ServiceNow. When SACM cannot tell which one is right, *Cannot tell which one is right: ask the owner* on the case asks the owner instead.
- **A Service Instance without a Business Application** is mapped by SACM in ServiceNow, with the owner in a mapping session; never "correct it in EPO" (D139). It is a case of the mapping backlog (D200).
- Without the Relationship report every relationship card is grey; without the Parent column only *Offering parent* is.
- A relationship case is designed in the Service Mapping Workspace ("links, not data quality") and made in ServiceNow by SACM.

## 13. Names and EPO ID

**Names** (`checks/reference/name-rules.json`):

- A Business Application ends with `_BA`, a Business Service with `_BS`, a Service Instance with ` - PROD` or ` - TEST` (D175, Carlos, 12 Nov 2026). Every other ending is listed. A missing ending is asked of the owner (*Name not standard*).
- An API offering starts with `API - `, with spaces (D76). Another dash is tidied by SACM (*Name to tidy*).
- A space at the start or the end of a name is tidied by SACM (D77).
- Two live CIs of the same class with the same name, or two spaces in a row, are a finding (D75, D130). A Retired CI or a CI of another class does not count. It is a SACM list first (D184): two records for one thing, SACM retires one. When they are two real CIs, *Two real CIs: ask the owner* on the case asks the owner; for a Business Service or Service Instance the email says the name is corrected in EPO.
- A hidden character in a name is removed by SACM itself, nobody is asked (D74). The "?" of a CSV export is not a check. A CSV cannot show the hidden character: the check then uses the names of the Relationship report, or is not tested.

**EPO ID** = the Asset tag (`checks/reference/epo-id.json`; in a message the column is called EPO ID, D38):

- A Business Service or Service Instance without EPO ID is a SACM list first (D183). A known case (made in ServiceNow on purpose, section 3.1 of the instruction) is marked *Not followed up* once. Otherwise *Must be created in EPO: ask the owner* on the case asks Owned by, then Managed by.
- Service Offerings are not checked (D128): an offering is a ServiceNow record.
- Two live CIs with the same EPO ID are to solve.
- Business Application, Business Process and Business Capability have no EPO ID: not checked.

## 14. EPO compared with ServiceNow

The EPO systems report holds every EPO system (`checks/reference/epo-systems-report.json`).

- A system matches the **Service Instance whose Asset tag is its EPO ID**; the live one when two share it; a pair Retired on both sides is left out (D103). The Service Instance is named as the system plus " - PROD".
- Compared: status, name, the three people by user ID (upper and lower case count the same) and the description. Not compared: the EPO criticality numbers and the GDPR marks (D106).
- **Service mapped and different:** a SACM fix list, copy the EPO value into ServiceNow (EPO-DIFF).
- **Not service mapped and different:** the sync did not bring the change. A review list: check a few, raise one incident for the pattern with the ServiceNow development team (D104, D142). A change in EPO less than two days before the report waits.
- **Descriptions** by letters and digits only; a difference when empty in ServiceNow, cut before the end of the EPO text, or the first 40 letters differ (D105). It is on the same two cards as the other fields: there is no card of its own (D136).
- The chip "changed in EPO" marks systems that changed after the EPO report loaded before (D107).
- **The source first** (D190). The people lines of a Service Instance (*Owner or manager missing*, *Inactive person*, *Owner = Manager*, *Supported by*) are compared with its EPO system, role by role:

  | ServiceNow | EPO | What happens |
  |---|---|---|
  | empty | empty | The owner is asked. The line says "empty in EPO too" |
  | an inactive person | the same person | The owner is asked. The line says "EPO names the same person" |
  | an inactive person, or empty | another person | Nobody is asked. The line waits and says why: SACM copies the person (service mapped), or the sync brings it |
  | an inactive person, or empty | another person the CI report shows as inactive | The owner is asked. The line says so |
  | a person | empty (a **leftover**) | The owner is asked to fill the role in EPO |

- **A leftover** (D191): the sync never clears a field, so ServiceNow keeps a person EPO no longer names. Nobody clears it by hand. It is not on *EPO ≠ ServiceNow* and not on *EPO update not arrived*. When the old person is still active, the line is on *Owner or manager missing* or *Supported by*.
- *Owner = Manager*: when EPO names two different people the line waits; when EPO names the same person twice the owner is asked.
- Without an EPO systems report, the people lines are not compared and the run says so. A Business Service is not compared yet: its EPO report comes in a later build.
- The report holds systems only, so in the lifecycle review "Status in EPO" is filled for Service Instances only. Business Services and Service Offerings are compared by hand.
- On a case that asked a person to correct a role in EPO, the app shows **Corrected in EPO on …** when EPO shows another person. Nothing is sent or changed by this.

## 15. Lifecycle

- **Under retirement too long:** the record did not change for more than 90 days (team setting `underRetirementDays`). Counted from the last change of the record, for any reason: the report does not say when the status changed (D81). The owner is asked: "Is it still going to be retired, and when?"
- **Ready too long:** more than 90 days after the CI was created (team setting `readyDays`, D149). The owner is asked to make it Operational or to retire it. Not on Business Process (it has stages, below), Business Application (D180) or Business Capability (parked, D179) (D188). *Capability Ready too long* is switched off.
- **The stages of a Business Process in Ready** (D197, *Process stage*, a SACM list, `processStages` in `checks/reference/lifecycle.json`). A process is created in Ready; after the BIA its CIA values are added, and that is the sign to map it. **Waits for the BIA:** no Target value yet; no line, nobody is chased, a note says how many. **To map:** CIA values, and no live Business Application or Business Service linked below: a case of the mapping backlog (D200), where SACM plans a mapping session with the process owner; the card says how many in a note. **Mapped:** CIA values and something linked below: SACM makes the process Operational. CIA values means at least one Target value. Needs the Relationship report. It does not wait on Ready.
- **Ready too long**, **Under retirement too long** and **Supported by** are work for when there is time (`priority` `later`, D182): drawn calm, after the daily cards, not in the red number.
- **Planned retirement date** (D148): on *Deleted but operational* the owner is asked when the CI will be retired, not whether it is still in use (it may be kept for years, for example to keep its data). On *Deleted but operational* and *Under retirement too long* a manager writes the date the owner gives on the case. It is a journal line. Until that date the finding **waits**: not to solve, no reminder. On the date it is to solve again. The date can be changed or taken away.
- **Lifecycle review** (procedure 2.13, twice a year): a manager presses *Start a lifecycle review*. The app draws 50 CIs and 20 of the CIs Under retirement from the latest CI report, only Business Service, Service Offering and Service Instance (D82). The sample is saved in the team folder and never drawn again. A manager marks each CI *Same in EPO*, *Not the same* or *Not in EPO*. "Not the same" opens a line on the card *Lifecycle review*, a SACM list (D192): a service mapped CI, SACM copies the status of EPO; a CI that is not service mapped, the sync did not bring it, an incident for the ServiceNow development team. The owner is written to only with the button **EPO itself looks wrong: ask the owner**. The line is Verified when a later report shows another status. "Not in EPO" is only in the evidence file. Nothing starts on its own.

## 16. How a check finds problems

| Detector type | How |
|---|---|
| `rule` | A condition on fields of the CI report, as data in the pack (the operators are listed in [checks/README.md](../checks/README.md)) |
| `code` | A small function, for checks that compare reports or follow relationships (`relationships/…`, `ci/…`, `epo/…`, `contracts/…`) |
| `manual` | Findings come from what managers mark (the lifecycle review) |
| `report` | An existing ServiceNow report that already lists the offenders (none in use yet) |

A check with the status `off` is switched off: its file stays, it does not run and has no card, and its old cases are not shown (D141). Today: *Relationship to a Retired CI*.

**A check that cannot be evaluated is never a silent pass** (D15): a missing column, a missing reference file, a report not loaded, or a detector not built gives a note, and the card is grey. A check is tested on a CI only when the report holds the columns it needs.

## 17. Cases and their status

- A case is **worked out** from the runs, the journals and the replies, never stored (D17).
- **One shared case** per check, contact and route (D34). Each CI in it keeps its own status, so a shared case can be partly verified.

| Status | How a case gets it |
|---|---|
| New | In the latest report, nothing sent yet |
| Contacted | A manager sent a message (or recorded a Teams chat) |
| Answered | A reply arrived after the last message, or a manager set it |
| Fix in progress | Set by a manager, usually with the request number |
| Fixed | A manager marked a line of a SACM fix list as corrected in ServiceNow |
| Not followed up | SACM's decision, with a reason and a review date (section 19) |
| Verified | The latest report contains the CI, tested the check, and the problem is gone |

- **Verified** comes only from a later report (D59). A report that does not contain the CI, or could not test the check, closes nothing. A manager cannot set Verified.
- **A contract** gone from a tested contract check is Verified, because the contract files are complete lists (D60).
- A problem that comes back after Verified starts a new life (a new episode in the audit export).
- *Reminder due* and *Escalate* are flags on a Contacted case (section 18).

## 18. Messages, reminders and escalation

- **One message per person**, across all modules (D34). At most 25 CIs per message; more are split into parts, each with its own reference (D36).
- **The form of a message** (D35): the problem first in the subject and the reference last ("Inactive owner on <CI> [SACM-…]"); "Hi <first name>,"; why you get it; a table Name / EPO ID / Class / Owned by / Managed by / Operational status / Support group (and What we found when there are several kinds); the exact request with its link; one line on why it matters; thank you, the manager's name and the team signature.
- **From the shared mailbox**, with the reference in the subject (D5). A reminder keeps the reference of the first message, so replies to either attach to the same cases.
- **Reminder due** 3 business days (Monday to Friday) after the last message (D39). Public holidays are not known. The days count from the day the message was really sent: a message that waits in the outbox for more than one hour is *queued*, and nothing is due while it waits (D162).
- **A reminder and new points are one email** with two parts, "Still open" and "New since then" (D161).
- **Escalation** to the person's manager, after the first message and 2 reminders with no answer (D40). For a person asked as **Managed by**, it goes to the **Owned by person of the same CI**; without a usable owner, to the owner's manager (D160, D165). When nobody is known, the app says so and the manager types who gets it: an escalation never becomes a reminder on its own. It is a draft, made only when a manager presses the button. Never sent on its own.
- **The next step** of a group is one of: first message, queued, waiting, reminder, escalate, cannot escalate, answered (D166).
- **The Procurement mailbox** gets one message, never split, nobody copied (D98). Its escalation goes to the **Procurement lead** of Settings, with the mailbox in copy. Without a Procurement lead there is no escalation: the card says so, and the next message is a reminder to the mailbox (D147).
- **Teams:** the app opens a chat with the person asked, with a text written for a chat; the manager confirms, and it counts as a message (D44, D163).
- **A message makes the group mine** when nobody has it (D164).
- **Before a message**, the app warns when a colleague wrote to the same person, or about the same CIs, in the last 24 hours (D23).
- **Nothing is sent without a manager pressing Send** (D2). Flows send exactly what a manager queued.

## 19. Not followed up

- SACM can decide **not to follow up** a finding, with a reason, a review date and a note (D84). It is SACM's own decision.
- **It is not a criticality exception.** A criticality exception is requested by the stakeholder in the Service Portal and approved in ServiceNow; the report shows it and the criticality checks read it. Never call SACM's decision an exception on the screen.
- **Reasons** (D85): Agreed with the owner, Known and tagged, Not a CI, Duplicate record, Other.
- **Review date:** 6 months by default, a team setting (D86). On that date the case is to solve again and shows "Followed up again". *Follow up again* does it at once.
- **For a CI not raised yet** (the known exceptions of the instruction), a manager adds it by name, for one check or every check. It covers every finding of that check on every CI of that name.
- Old *Waived* or *Exception accepted* statuses read as not followed up, without a review date (D87).

## 20. Contracts: Solusi and ServiceNow

Contracts live in Solusi; **Procurement owns the data** (D89). An import copies them into ServiceNow through a request. The import **never clears a field**, and ServiceNow sets **"Expired" by itself**, so the real status is kept as a tag ("S - Concluded").

- The two files are matched by the **Solusi contract number = Vendor contract** in ServiceNow (D90).
- **A contract in ServiceNow that is not in Solusi is to delete** (D91). SACM deletes it in ServiceNow; the app deletes nothing. **Every line is to delete** (D144). *Still linked* is only a note on the line, in the order of the contracts: a criticality from a CI, a "Target BC" tag, or still running (Concluded or In negotiation, end date not passed). Drafts with no Solusi number are on the list too (D93). A contract terminated in the last 7 days counts as in Solusi (D94).
- **To clear by hand:** a field empty in Solusi and still filled in ServiceNow. Eight fields are compared: name, vendor, category, start date, end date, contract owner, daily responsible, Procurement partner (D95).
- **Contract status** (D96): when ServiceNow shows Expired, the tag must be the Solusi status; when ServiceNow shows the Solusi status itself, another status tag is old and is removed.
- **For Procurement** (D98, D99, D145): only the problems of Solusi itself, asked from the Procurement mailbox in one message with one table per problem: no contract owner, a contract owner or Procurement partner who left, and an EPO ID that is unknown or names a Retired system (Concluded or In negotiation contracts), and no vendor number (every contract). A contract without a daily responsible is not asked, only counted.
- **Contracts to fix in ServiceNow** (D145): a SACM fix list, nobody is asked. A contract owner or Procurement partner for whom the upload picked an inactive account (Concluded or In negotiation contracts), a person's name that ServiceNow shows differently from Solusi, a fixed-term contract without an end date and a Concluded contract whose end date has passed (Concluded contracts).
- **The wrong account, or a person who left** (D193). The upload finds a person by name. ServiceNow can hold two accounts with one name: a contractor who became an employee has a new, active account and an old, inactive one. When the loaded reports know an active account with the same name, the line names it ("set the active account") and SACM fixes it. When they know none, the person left: the line goes to Procurement, who names a new person in Solusi. The app knows only the people that a CI or a contract names.
- **The EPO ID column of Solusi is free text:** every number of three digits or more is an EPO ID. It must name a known, live Service Instance; a system is Retired when every Service Instance with that EPO ID is Retired (D100).
- **Upload check:** after the upload, a field that still differs, or a contract of Solusi not in ServiceNow yet. A SACM fix list (D146): first check that the file was uploaded; then SACM sets the value of Solusi in ServiceNow and marks the line as fixed. No incident. A person's name is on *Contracts to fix in ServiceNow*, not here.
- **Contract changes** is a page, not a check: what changed since the Solusi file loaded before, and how many Concluded contracts end in the next 30 and 90 days, counted from today (D102). Nobody is asked.
- The contract checks run when a CI report is loaded, with both contract files loaded with or before it (D97). Without both, the cards are grey.
- Contract cards list findings by kind of problem, never by owner: the people of a contract are not who is asked.

## 21. The audit record

The procedure asks to keep verification records (date, verifier, issues found) and an audit report (findings, actions taken, open issues).

- **Verifier** = the manager who loaded the report (D88).
- **Verification record** per loaded CI report: per check, the CIs tested, what is to solve, what is new and verified since the report before, and what could not be tested and why.
- **Audit export** of a month, a quarter or two dates: loads, findings, actions with who and when, verified cases with their days, open cases with their age, not followed up. Days are calendar days, from the first report that showed a problem to the first that no longer did (D88).
- Every change of Settings and of the team list is recorded (D25).
- Nothing is deleted: older files move to the archive folders (D19).

## 22. What the Workbench never does

- Write to the CMDB, EPO or Solusi (D6).
- Send, load, remind or escalate without a manager pressing a button (D2).
- Call SACM's own decision an "exception" (D84).
- Mark a case Verified without a later report (D59).
- Show a check as green when it could not be tested (D15).
- Hold links, addresses or real report files in the repository (D110, D266).

## 23. Notes per check

What the check files used to say in their field `notes`, kept here word for word (moved in cleanup piece A3, D115). The four checks without a note are left out. The list of every check is [CHECKS.md](CHECKS.md).

| Check | Card | Note |
|---|---|---|
| `APP-INSTANCE-MATCH` | Application ≠ Instance | The Service Instance comes from EPO and is the source; the Business Application follows it. |
| `CONTRACT-NOT-IN-SOLUSI` | Not in Solusi | Rule of 11 Nov 2026: a contract in ServiceNow that does not come from Solusi is deleted. Needs the Solusi contract file and the ServiceNow contract report. Verified when a later ServiceNow contract report no longer holds the contract. |
| `CONTRACT-PROCUREMENT` | For Procurement | Needs the Solusi contract file and the ServiceNow contract report; the EPO ID problems also need the EPO ID (asset tag) of the CI report. Only the problems of Solusi itself (D145). Decisions of 11 Nov 2026, to confirm: the Procurement mailbox is the only recipient (not each Procurement partner, not the contract owner); a contract without a daily responsible is not asked. Escalation to the Procurement lead of Settings (D147). Verified when a later Solusi contract file no longer shows the problem. |
| `CONTRACT-SN-FIX` | Contracts to fix in ServiceNow | Needs the Solusi contract file and the ServiceNow contract report. SACM corrects these itself in ServiceNow (Carlos, 12 Nov 2026, D145). Verified when a later report no longer shows the problem. |
| `CONTRACT-STATUS` | Contract status | Needs the Solusi contract file and the ServiceNow contract report. Verified when a later ServiceNow contract report shows the tag. |
| `CONTRACT-TO-CLEAR` | To clear by hand | Needs the Solusi contract file and the ServiceNow contract report. Verified when a later ServiceNow contract report shows the field empty. |
| `CONTRACT-UPLOAD` | Upload check | Needs the Solusi contract file and the ServiceNow contract report. A SACM fix list, no incident (Carlos, 12 Nov 2026, D146). A field that is empty in Solusi is on the card To clear by hand; a vendor that is empty because Solusi has no vendor number is on the card For Procurement; a person's name is on Contracts to fix in ServiceNow. |
| `CRIT-ABOVE-PARENT` | Above parent | Allowed by the process without justification (Operational Activities Instruction 2.16), but a child higher than all its parents is odd. SACM checks the mapping first; then the owner confirms or lowers the value (D134). |
| `CRIT-NO-JUSTIFICATION` | No justification | Auto-generated placeholder text counts as missing. The justification must match the dimension that is lowered. |
| `CRIT-TARGET-MISSING` | BIA missing | Children inherit nothing from a Business Process without Target values, so the criticality chain breaks. The values come from the BIA. Only on Business Process, and not in Ready (D186). A SACM line: the status or a tag is wrong. Tagged BIA is pending or BIA N/A: listed as known (reference/known-tags). |
| `DESC-QUALITY` | Description | Business Service, Service Instance and offerings from EPO: the description is fixed in EPO. Other CIs: the owner replies, or raises "Add or modify a Service (CI)" (D126). |
| `EPO-DIFF` | EPO ≠ ServiceNow | Needs the EPO systems report with the CI report. Verified when a later CI report shows the EPO value. |
| `EPO-ID` | EPO ID | Service Offerings are not checked (D128). |
| `EPO-NOT-ARRIVED` | EPO update not arrived | A review list with one incident for the pattern, not a message per CI. The incident goes to the ServiceNow development team after two days (D142). The description is compared too (D136). |
| `LIFECYCLE-REVIEW` | Lifecycle review | Instruction 2.13: twice a year, a sample is compared with EPO by hand. Findings come from the marks of the managers, not from the report. |
| `NAME-DUPLICATE` | Duplicate names | A CI is known by its name, so a name must be unique. Names are compared in lower case with spaces squashed, among the live CIs of the same class (D130). Double spaces SACM fixes without asking. Characters the export shows as "?" are not checked: they are not visible in ServiceNow. |
| `NAME-FORMAT` | Name to tidy | SACM fix list. Decision of 11 Nov 2026, to confirm: API offerings are written "API - " with spaces, as the data does; the instruction writes "API-". |
| `NAME-HIDDEN-CHAR` | Hidden character in name | The name holds a character nobody can see, most often a zero-width space (U+200B). ServiceNow does not show it, but it is in the record: searching for the name or matching it with another report fails. A CSV export shows it as "?", an .xlsx export keeps it. SACM removes it in ServiceNow; nobody needs to be asked. The tool matches names without these characters, so other checks are not affected. |
| `NAME-STANDARD` | Name not standard | The endings are data in reference/name-rules. Today every name follows them: the card is a guard. |
| `OFFERING-OWNER` | Offering owner ≠ Service owner | Only offerings made by a person; SACM copies the owner of the Business Service, nobody is asked (D137). |
| `OFFERING-PARENT` | Offering parent | Carlos, 11 Nov 2026: SACM fixes this, not the owner. Offerings without a Business Service relationship whose Parent field names one are listed here, not on Relationship missing. |
| `READY-TOO-LONG` | Ready too long | Instruction 2.13. The number of days is a team setting (Settings), 90 at first (D149). The report only says when the record last changed, for any reason. This check does not wait on a CI in Ready (reference/not-live-statuses, exceptChecks). Not on Business Process, Business Application or Business Capability (D188, D179). For when there is time (D182). |
| `READY-TOO-LONG-BC` | Capability Ready too long | Switched off: a capability in Ready is parked (D179). |
| `MAPPING` | Mapping backlog | One case per CI to map (D200): SACM invites the owner to a mapping session, maps the CI in the Service Mapping Workspace, makes the changes in ServiceNow and sets the stage (D201). The owner gets an invitation, never a list of questions (D202). When the process does not exist, Process Management is told (D203). |
| `REL-MISSING` | Relationship missing | Procedure 2.15. The person tells SACM what the CI relates to; the mapping is worked out in the Service Mapping Workspace. Business Service and offerings from EPO: the change is made in EPO. What SACM maps with the owner is on the *Mapping backlog* (D200). A Business Capability needs a process or a capability below it (D140). Not raised, by SACM decision: a Service Instance no offering uses, a Service Instance with nothing below it. |
| `REL-TWICE` | Relationship entered twice | Carlos, 11 Nov 2026: between two CIs only one relationship is allowed; SACM fixes it. |
| `REL-WRONG-TYPE` | Wrong relationship type | A change of relationship can change the inherited criticality on the child. |
| `RESP-INACTIVE` | Inactive person | Tell the recipient which approvals the request needs: it depends on whether the requester is the current owner, the new owner, or someone else. |
| `RESP-MISSING` | Owner or manager missing | Empty Owned by blocks the normal 4-eyes approval and makes criticality approvals fail automatically. Needs a defined fallback approver. Supported by has its own card, *Supported by* (D181). |
| `RESP-SAME-PERSON` | Owner = Manager | The two roles approve changes together (4 eyes). With one person in both roles there is no second check. People are compared by user ID, then email. |
| `SUPPORT-GROUP-INACTIVE` | Support group inactive | Instruction 2.5 and the first two email templates of appendix 8.1. On a Service Instance, Service Offering or Business Service the change is made in EPO. |
| `SUPPORT-GROUP-MISSING` | Support group | Incidents on the instance cannot be assigned. SACM sets the group once the stakeholder names it. |
| `SUPPORTED-BY` | Supported by | Mandatory on Service Instance and Service Offering (D181). A Service Instance is fixed in EPO (Secondary Responsible); a Service Offering by a reply or the request, never EPO. For when there is time (D182). |
| `TAG-STATUS-CONFLICT` | Deleted but operational | The owner is asked for the planned retirement date; it may be kept for years on purpose. The date written on the case makes it wait until then (D148). Descoped does not mean deleted: it was descoped from service mapping and is now to be mapped (a chip "to map" shows it, reference/tag-chips). Will be retired is a plan, not a conflict. |
| `UNDER-RETIREMENT-LONG` | Under retirement too long | Instruction 2.13. The number of days is a team setting (Settings). The report only says when the record last changed, for any reason. A planned retirement date written on the case makes it wait until then (D148). |
