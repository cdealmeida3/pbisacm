# Data Sources

How data reaches the Workbench and what each report must contain. The layouts follow the ServiceNow reports already used by the team's Service Mapping Workspace, so the same exports can feed both tools.

## 1. Reports

| Report | Source | Used by | How often |
|---|---|---|---|
| **CI report** | ServiceNow `cmdb_ci` list, filtered to the nine logical classes | Every check on CIs: responsibility, criticality, description, tags, names, EPO ID, support group, lifecycle | Daily |
| **Relationship report** | ServiceNow `cmdb_rel_ci`, filtered to the logical classes | The relationship checks; the names in it also let *Hidden character in name* test a CSV CI report | With the CI report |
| **EPO systems report** | EPO: every system, one line each | EPO ≠ ServiceNow, EPO update not arrived (status, name, people and description); "Corrected in EPO" on cases; Status in EPO in the lifecycle review | Weekly, or with each CI report |
| **Solusi contract file** | Solusi: the Excel file Procurement sends every Monday, as it arrives (two tabs) | The contract cards: Not in Solusi, To clear by hand, Contract status, For Procurement, Contracts to fix in ServiceNow, Upload check; the page Contract changes | Weekly |
| **ServiceNow contract report** | ServiceNow `ast_contract` list, every contract | Compared with the Solusi contract file | Weekly, the same day as the Solusi file |

Not used yet: the criticality approval tasks with their creation date (for approvals close to the 14-day limit, piece 5E, parked) and the contract-to-CI mappings (`ast_contract_instance`).

Format: CSV or Excel (`.xlsx`). The app recognises each report by its columns, not by its file name. Limit: 20,000 rows per report (the logical classes are far below it). One report can cover all nine classes.

An `.xlsx` export keeps letters and characters that a Windows-1252 CSV loses. A CSV export writes "?" for a character it cannot write, for example a hidden zero-width space in a name.

## 2. Columns of the CI report

Headers can be field names or labels, in any order. Extra columns are ignored and listed in the run notes. A missing column never causes a wrong finding: the check that needs it reports "not tested".

| Column (field name) | Needed for |
|---|---|
| `name`, `sys_class_name`, `asset_tag`, `operational_status` | Every check. The name is the identity of a CI; the asset tag is used only when two CIs share a name. `NAME-DUPLICATE`, `TAG-STATUS-CONFLICT` |
| `short_description` | `DESC-QUALITY` |
| `owned_by`, `owned_by.user_name`, `owned_by.email` | `RESP-MISSING`, `RESP-SAME-PERSON`, and to contact the owner. People are matched by user ID, else email. |
| `owned_by.active` | `RESP-INACTIVE` |
| `owned_by.manager`, `owned_by.manager.email`, `owned_by.manager.active` | Fallback contact when the owner is missing or inactive. An inactive manager is skipped. |
| `owned_by.department.dept_head`, `owned_by.department.dept_head.email` | Last fallback contact (department head) |
| `managed_by`, `managed_by.user_name`, `managed_by.email`, `managed_by.active`, `managed_by.manager…` | Same, for *Managed by* |
| `supported_by…` (same columns) | Same, for *Supported by* (mandatory on Service Instance and Service Offering; checked for inactive people on these two classes only) |
| `support_group` | `SUPPORT-GROUP-MISSING` |
| `support_group.active` | `SUPPORT-GROUP-INACTIVE`. Without it the card is grey |
| `sys_created_on`, `sys_updated_on` | `READY-TOO-LONG` (days since created), `UNDER-RETIREMENT-LONG` (days since the record last changed) |
| `sys_created_by` | Where a fix is made: a Service Offering whose Created by is not a person's user ID was created by the EPO integration, so it is fixed in EPO. Without the column every offering counts as made by a person (a note says so) |
| `sys_tags` | `TAG-MISSING`, `TAG-INVALID`, `TAG-STATUS-CONFLICT` |
| `ref_cmdb_ci_service.u_service_mapped` | Only the card `EPO-DIFF` (EPO ≠ ServiceNow): with the flag on, SACM copies the EPO value into ServiceNow. Messages do not read it |
| Four *Target* and four *Inherited* CIA-A values | `CRIT-TARGET-MISSING`, `CRIT-NO-JUSTIFICATION`, `CRIT-ABOVE-PARENT` |
| Exception status, justification for exception | `CRIT-NO-JUSTIFICATION` |
| `owned_by.user_name`, `managed_by.user_name`, `supported_by.user_name`, `asset_tag`, `ref_cmdb_ci_service.u_service_mapped` | The EPO checks (version 0.14): EPO names people by user ID, a system matches the Service Instance by EPO ID (asset tag), and the flag decides the card |
| `ref_cmdb_ci_service.u_platform` | Relationship checks: a Service Instance with Platform ticked is a Platform |
| `environment` | Relationship checks: one Service Instance per environment for a Business Application. Empty: the end of the name ("- TEST"), else production |
| `ref_cmdb_ci_service.parent` (label *Parent [Service]*) | `OFFERING-PARENT`: the Business Service named in the Parent field of an offering |

The `.active`, `.email` and `.manager` columns are "dot-walked" fields: in the ServiceNow column picker, expand *Owned by* and choose *Active*, *Email*, *Manager*.

## 2a. Columns of the Relationship report

The `cmdb_rel_ci` list export, as ServiceNow writes it: Parent, Type, Child, Connection strength, Updated, Created, Created by, Excluded for calculation, Percent outage, Port, Tags, Updated by, Updates, Class, Asset tag, Class, Asset tag.

| Column | Use |
|---|---|
| Parent, Type, Child | Needed. The app knows the report by these three. |
| Class, Asset tag (twice) | Two columns have the same name. **The first Class and Asset tag are the parent's, the second the child's.** The app reads them by position. |
| `parent.sys_class_name`, `parent.asset_tag`, `child.sys_class_name`, `child.asset_tag` | The same, when the report uses field names. |
| Excluded for calculation | A relationship that is excluded passes no criticality from the parent to the child (D131): used by *Above parent* and *No criticality reaches the CI*. Without the column, the load says so and every relationship passes criticality. |

Parent and child are matched with the CIs of the CI report by name (and asset tag when two CIs share a name). Hidden characters do not count, so a name that shows "?" in the CSV matches the same name with the hidden character in the `.xlsx`. The Reports strip says how many parents and children are not in the CI report.

## 2b. Columns of the EPO systems report

A text file separated by ";" (UTF-8), one line per EPO system. The app knows it by the columns EPO ID, system name and system status. The header forms it accepts and the meaning of the status words are data: `checks/reference/epo-systems-report.json`.

| Column | Use |
|---|---|
| EPO ID | Needed. Matches the Asset tag of a Service Instance |
| System name | Needed. The Service Instance is named the same, plus " - PROD" |
| System status | Needed. Four status words, each with its ServiceNow status |
| System Owner, Primary Responsible, Secondary Responsible | User IDs, compared with Owned by, Managed by, Supported by (upper and lower case count the same) |
| Description | HTML. Compared with the ServiceNow description by letters and digits only |
| Last change | Day first ("10-11-2026 14:05:11"). Used for the chip "changed in EPO" and for the two days a new change waits |
| Owner department, criticality numbers, GDPR marks | Read past, not compared |

The CI report needs for this: `asset_tag`, the three `…user_name` columns and `ref_cmdb_ci_service.u_service_mapped`. A missing column gives a note on the card, never a silent pass.

## 2c. Columns of the two contract files

The header forms the app accepts are in `checks/reference/contract-reports.json`.

**Solusi contract file** (.xlsx). Row 1 holds the field names, row 2 the labels (left out). The first tab holds the active contracts; the tab with a termination date column holds the contracts terminated in the last 7 days. The app knows the file by the columns contract number, contract status and partner name.

| Column | Use |
|---|---|
| Contract number | Needed. Matches Vendor contract in ServiceNow |
| Contract status | Needed. The status ServiceNow must show, as state or as tag |
| Name, partner name, category, start, end, contract owner, daily responsible, Procurement partner | Compared with ServiceNow, one to one. People are free text in Solusi |
| Partner number, duration type, EPO ID | For Procurement: no vendor number, an EPO ID that names a Retired system or is not a known EPO ID. Contracts to fix in ServiceNow: fixed-term with no end date. The EPO ID column is free text: every number of three digits or more is read as an EPO ID |

**ServiceNow contract report** (.csv or .xlsx). The app knows it by the columns `number`, `vendor_contract` and `state`.

| Column | Use |
|---|---|
| `number`, `vendor_contract`, `state` | Needed |
| `short_description`, `vendor`, `u_contract_category`, `starts`, `ends`, `business_owner`, `u_point_of_contact`, `contract_administrator` | Compared with Solusi |
| `sys_tags` | The status tag ("S - Concluded") and the tag "Target BC = n" |
| The four inherited criticality columns | "Still linked": the contract carries a criticality from a CI |
| `business_owner.active`, `business_owner.user_name`, `business_owner.email`, and the same three for `contract_administrator` | The contract owner on the case; Contracts to fix in ServiceNow: the contract owner or the Procurement partner is inactive. Without the `.active` columns this is not tested, and the card says so |

A missing column gives a note on the Reports tile. Without one of the two files the contract cards are grey.

## 3. What the reader handles

- Field names or labels as headers; the `ci.` prefix of a CMDB Health result report.
- Class as label or table name (for example *Application Service* and `cmdb_ci_service_auto` both become Service Instance).
- Operational status as label or number.
- Criticality as 1–4 or as label. The criticality columns are recognised by the end of their name, so the instance prefix is not configured anywhere.
- UTF-8 and Windows-1252 files; comma, semicolon or tab as separator.
- `.xlsx` files: the first sheet; inline or shared strings; dates stored as numbers are written `yyyy-mm-dd hh:mm:ss`; true/false.
- Hidden characters in names (zero-width space and the like) are ignored for matching and reported by `NAME-HIDDEN-CHAR`.

## 4. Delivery

```
ServiceNow scheduled report → email to the shared SACM mailbox → flow F1 saves the attachment
→ reports/ in the Workbench folder (name starts with yyyy-MM-dd_) → a manager presses Load
```

A fixed word in the email subject (for example `SACM-DQ cmdb_ci`) tells the flow which report it is. The app itself recognises the report by its columns. Without the flow, a manager can put the file in `reports/` by hand, or use *Choose reports*. The flows are described in [SETUP.md](SETUP.md).

## 5. Relation to the Service Mapping Workspace

| | Service Mapping Workspace | Data Quality Workbench |
|---|---|---|
| Purpose | Work out how CIs should be linked, before the CMDB is changed | Find data quality problems, get them fixed by the right people, prove it |
| Works on | One mapping project at a time | The whole CMDB, every day |
| Principle | Links, not data quality | Data quality and follow-up |

They share the report layouts, the class catalogue and the relationship model. The relationship checks of the Workbench use the Workspace's model (allowed types, mandatory relationships, cardinalities) as reference data (`checks/reference/relationship-model.json`), and a relationship case is designed in the Workspace.
