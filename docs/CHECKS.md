# Checks

<!-- Written by tools/checks-doc.ts from checks/packs/, checks/reference/ and docs/DECISIONS.md. Do not edit: run `npm run docs`. -->

Every check of the Workbench, one line each: 42 checks. A check is one file in `checks/packs/<subject>/` (`ci`, `relationships`, `epo`, `contracts`, `lifecycle`). The rules behind the columns are in [DOMAIN-RULES.md](DOMAIN-RULES.md); the decisions in [DECISIONS.md](DECISIONS.md).

- **Needs**: the reports that must be loaded. Without them the card is grey and says why.
- **Who is asked**: in order, the first who can be reached. The person the finding is about is never asked; inactive people are skipped.
- **Notes**: checks that do not wait on a CI in status Ready, and tags that make a finding known.
- **Status**: *live*, confirmed by SACM (or the SACM procedure) and in use; *proposed*, built on an assumption or still waiting for a rule. Both run the same way. *off*: switched off: the check does not run and has no card.
- **Decisions**: the rows of the decision log that name the check.

## Completeness: something is missing

| Check | Card | What it finds | Classes | Needs | Who is asked | How it is fixed | Notes | Status | Decisions |
|---|---|---|---|---|---|---|---|---|---|
| `CRIT-NONE-REACHES` | No criticality reaches the CI | No criticality reaches the CI | Business Application, Business Service, Service Instance | CI | nobody: SACM | Review list, never red | known with BIA is pending, BIA N/A | live | D131, D132 |
| `CRIT-TARGET-MISSING` | BIA missing | Business Process without target criticality (BIA missing) | Business Process | CI | nobody: SACM | SACM fix list | known with BIA is pending, BIA N/A | live | D56, D132, D186 |
| `DESC-QUALITY` | Description | Description is missing or of poor quality | Business Capability, Business Process, Business Service, Service Offering, Service Instance, API, Application, Technology Management Service | CI | Managed by → Owned by → manager of Owned by | Reply, then SACM fixes it |  | proposed | D126 |
| `EPO-ID` | EPO ID | EPO ID missing or used twice | Business Service, Service Instance | CI | Owned by → Managed by → manager of Owned by → department head of Owned by | SACM fix list |  | proposed | D128, D80, D183 |
| `RESP-MISSING` | Owner or manager missing | Responsible person is missing (Supported by: only) | Business Capability, Business Process, Business Service, Service Offering, Service Instance, API, Application, Technology Management Service | CI | Managed by → the other roles → manager of Owned by → department head of Owned by | Request in the Service Portal |  | live | D31, D32, D127, D181, D114 |
| `SUPPORT-GROUP-MISSING` | Support group | Service Offering or Service Instance has no support group | Service Offering, Service Instance | CI | Managed by → Owned by → Supported by → manager of Owned by | Request in the Service Portal |  | live | D48, D125, D114 |
| `SUPPORTED-BY` | Supported by | Supported by is empty or an inactive user | Service Offering, Service Instance | CI | Managed by → Owned by → manager of Owned by → department head of Owned by | Request in the Service Portal |  | live | D181, D189 |

## Correctness: something is wrong

| Check | Card | What it finds | Classes | Needs | Who is asked | How it is fixed | Notes | Status | Decisions |
|---|---|---|---|---|---|---|---|---|---|
| `APP-INSTANCE-MATCH` | Application ≠ Instance | Business Application differs from its Service Instance | Business Application | CI + Relationship | nobody: SACM | SACM fix list | does not wait on Ready | live | D113, D180 |
| `CONTRACT-PROCUREMENT` | For Procurement | A problem in Solusi itself: only Procurement can correct it | Contracts | CI + both contract files | the Procurement mailbox | In Solusi, by Procurement |  | live | D89, D145, D193, D114 |
| `CONTRACT-SN-FIX` | Contracts to fix in ServiceNow | A contract value SACM corrects in ServiceNow | Contracts | CI + both contract files | nobody: SACM | SACM fix list |  | live | D145, D193, D153 |
| `CONTRACT-STATUS` | Contract status | The status tag of a contract does not say what Solusi says | Contracts | CI + both contract files | nobody: SACM | SACM fix list |  | proposed | D96 |
| `CONTRACT-TO-CLEAR` | To clear by hand | A value removed in Solusi is still in ServiceNow | Contracts | CI + both contract files | nobody: SACM | SACM fix list |  | proposed | D95 |
| `CONTRACT-UPLOAD` | Upload check | A field differs between Solusi and ServiceNow after the upload | Contracts | CI + both contract files | nobody: SACM | SACM fix list |  | live | D101, D146, D153 |
| `CRIT-ABOVE-PARENT` | Above parent | Target criticality is higher than every parent passes on | Business Process, Business Application, Business Service, Service Instance | CI | Owned by → Managed by → manager of Owned by | Request in the Service Portal |  | live | D64, D131, D134 |
| `CRIT-AUTO-JUSTIFICATION` | Automatic justification only | Criticality exception with only the automatic justification | Business Process, Business Application, Business Service, Service Instance | CI | Owned by → Managed by → manager of Owned by | The person corrects it |  | live | D185 |
| `CRIT-NO-JUSTIFICATION` | No justification | Criticality exception without a valid justification | Business Process, Business Application, Business Service, Service Instance | CI | Owned by → Managed by → manager of Owned by | SACM fix list |  | live | D63, D185, D189, D114 |
| `EPO-DIFF` | EPO ≠ ServiceNow | A service mapped CI differs from EPO | Service Instance | CI + EPO systems | nobody: SACM | SACM fix list | does not wait on Ready | live | D103, D105, D136, D143 |
| `EPO-NOT-ARRIVED` | EPO update not arrived | EPO change not in ServiceNow (not service mapped) | Service Instance | CI + EPO systems | nobody: SACM | Review list, never red | does not wait on Ready | live | D104, D105, D136, D142, D143 |
| `NAME-DUPLICATE` | Duplicate names | CI name is used twice in one class, or has double spaces | All nine | CI | Managed by → Owned by → manager of Owned by | SACM fix list |  | live | D75, D130, D184, D114 |
| `NAME-HIDDEN-CHAR` | Hidden character in name | CI name holds a hidden character | All nine | CI | nobody: SACM | SACM fix list | does not wait on Ready | live | D54, D170, D74, D114 |
| `OFFERING-OWNER` | Offering owner ≠ Service owner | Service Offering owner differs from its Business Service owner | Service Offering | CI + Relationship | nobody: SACM | SACM fix list | does not wait on Ready | live | D71, D137, D114 |
| `OFFERING-PARENT` | Offering parent | Parent field and Business Service relationship of an offering do not match | Service Offering | CI + Relationship | nobody: SACM | SACM fix list | does not wait on Ready | live | D69, D70, D114 |
| `REL-RETIRED` | Relationship to a Retired CI | Relationship to a Retired CI | All nine | CI + Relationship | nobody: SACM | SACM fix list | does not wait on Ready | off | D141 |
| `REL-TWICE` | Relationship entered twice | More than one relationship between two CIs | All nine | CI + Relationship | nobody: SACM | SACM fix list | does not wait on Ready | live | D68, D114 |
| `RESP-INACTIVE` | Inactive person | Responsible person is an inactive user (Supported by: only) | Business Capability, Business Process, Business Service, Service Offering, Service Instance, API, Application, Technology Management Service | CI | Managed by → the other roles → manager of the person concerned → department head of the person concerned → manager of Owned by → department head of Owned by | Request in the Service Portal |  | live | D32, D129, D181, D114 |
| `RESP-SAME-PERSON` | Owner = Manager | Owned by and Managed by are the same person | Business Capability, Business Process, Business Service, Service Offering, Service Instance, API, Application, Technology Management Service | CI | Managed by → manager of Owned by → department head of Owned by | Request in the Service Portal | known with Owned by is interim managed by | proposed | D56 |
| `SUPPORT-GROUP-INACTIVE` | Support group inactive | Support group of the CI is not active | Service Offering, Service Instance | CI | Managed by → Owned by → manager of Owned by → department head of Owned by | Request in the Service Portal |  | live | D48, D125, D114 |

## Compliance: a process rule is broken

| Check | Card | What it finds | Classes | Needs | Who is asked | How it is fixed | Notes | Status | Decisions |
|---|---|---|---|---|---|---|---|---|---|
| `CONTRACT-NOT-IN-SOLUSI` | Not in Solusi | A contract in ServiceNow is not in Solusi | Contracts | CI + both contract files | nobody: SACM | SACM delete list |  | live | D91, D93, D144, D114 |
| `LIFECYCLE-REVIEW` | Lifecycle review | Status in ServiceNow is not the same as in EPO (lifecycle review) | All nine | Lifecycle review | Owned by → Managed by → manager of Owned by → department head of Owned by | SACM fix list | does not wait on Ready | proposed | D54, D83, D192 |
| `MAPPING` | Mapping backlog | CI to map with its owner | Business Process, Business Application, Business Service, Service Instance | CI | Owned by → Managed by → manager of Owned by | The person corrects it | does not wait on Ready; known with To Be Mapped, Descoped, Process is missing or unknown | proposed | D200, D202, D203, D206 |
| `NAME-FORMAT` | Name to tidy | CI name has a wrong dash or a space at its start or end | All nine | CI | nobody: SACM | SACM fix list | does not wait on Ready | proposed | D77 |
| `NAME-STANDARD` | Name not standard | CI name does not follow the naming standard | Business Service, Service Instance | CI | Owned by → Managed by → manager of Owned by → department head of Owned by | Request in the Service Portal |  | proposed | D77 |
| `PROCESS-STAGE` | Process stage | Business Process in Ready that is mapped: make it Operational | Business Process | CI | nobody: SACM | SACM fix list | does not wait on Ready | proposed | D197 |
| `READY-TOO-LONG` | Ready too long | CI is in status Ready for too long | Business Service, Service Offering, Service Instance, API, Application, Technology Management Service | CI | Owned by → Managed by → manager of Owned by → department head of Owned by | The person corrects it | does not wait on Ready | proposed | D54, D81, D188 |
| `READY-TOO-LONG-BC` | Capability Ready too long | Business Capability is in status Ready for too long | Business Capability | CI | nobody: SACM | SACM fix list | does not wait on Ready | off | D179, D152, D153 |
| `REL-MISSING` | Relationship missing | Mandatory relationship is missing (unmapped CI) | Business Capability, Business Process, Business Application, Business Service, Service Offering, Service Instance | CI + Relationship | Owned by → Managed by → manager of Owned by | Request in the Service Portal | known with To Be Mapped, Descoped, Process is missing or unknown | live | D179, D56, D66, D139, D140, D114 |
| `REL-ONE-TO-ONE` | Too many partners | CI has more than the one allowed partner | Business Application, Service Offering, Service Instance | CI + Relationship | Owned by → Managed by → manager of Owned by | SACM fix list |  | live | D69, D138, D114 |
| `REL-WRONG-TYPE` | Wrong relationship type | Relationship type is not allowed between these classes | All nine | CI + Relationship | nobody: SACM | SACM fix list | does not wait on Ready | live | D66, D114 |
| `TAG-INVALID` | Tag not allowed | Tag key or value is not allowed | All nine | CI | Managed by → manager of Owned by | Reply, then SACM fixes it |  | off | D150 |
| `TAG-MISSING` | Tag missing | Mandatory tag is missing | All nine | CI | Managed by → Owned by → manager of Owned by | SACM fix list | does not wait on Ready | proposed | D198 |
| `TAG-STATUS-CONFLICT` | Deleted but operational | Tagged To be deleted, but still Operational | Business Capability, Business Process, Business Service, Service Offering, Service Instance, API, Application, Technology Management Service | CI | Owned by → Managed by → manager of Owned by | Reply, then SACM fixes it |  | proposed | D57, D148, D188 |
| `UNDER-RETIREMENT-LONG` | Under retirement too long | CI is Under retirement for too long | Business Capability, Business Process, Business Service, Service Offering, Service Instance, API, Application, Technology Management Service | CI | Owned by → Managed by → manager of Owned by → department head of Owned by | The person corrects it |  | proposed | D81, D148 |
