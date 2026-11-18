# Process Baseline

What the SACM process documentation (process, activities, procedures and work instructions, as exported in November 2026) means for the Workbench. This is a working digest for building the tool, not a copy of the documentation. It contains no names, document numbers or internal links. Where this digest and the official documentation disagree, the documentation wins.

## 1. Roles the tool must know

| Role in the process | In the tool |
|---|---|
| **SACM Manager** | User of the Workbench. Operates the process daily, performs service mapping, updates relationships and criticality values in ServiceNow. |
| **CI Owner / System Owner** (*Owned by*) | Accountable for the CI. Decision maker. Approves changes of *Owned by* and *Managed by*. Approves criticality exceptions. |
| ***Managed by*** | Second person of the 4-eyes approval for ownership changes. Day-to-day contact. |
| **Business Process Owner** | Validates and signs off the service map of a process (director level). Contact for Business Process data. |
| **Requester** | Whoever raises the request in ServiceNow. Can be the owner or anyone else. |
| **Inventory Owner** | Accountable for one inventory (CMDB, EPO, contract library, infrastructure vendor database, people data…). Contact for *source fixes*. |
| **Process governance team** | Gatekeeper for Business Process records. Contact when a Business Process CI disagrees with the process library. |
| **SACM Board** | Escalation target for unresolved issues. |

## 2. Data model

The CMDB follows CSDM 4. Logical classes, top to bottom:

```
Business Capability
  └─ Business Process
       ├─ Business Application ──── Contract (3rd-party dependency)
       └─ Business Service
            └─ Service Offering
                 └─ Service Instance ── Service Instance (dependency)
                      └─ Infrastructure CIs (servers, databases, clusters …)
```

**MVP scope: the nine logical classes** (Business Capability, Business Process, Business Application, Business Service, Service Offering, Service Instance, API, Application, Technology Management Service).

Mandatory for every class template: unique identifier, name, lifecycle status, ownership, classification, relations. Minimum to keep up to date at all times: name, owner, lifecycle status.

### Where each class comes from

| Class | Origin | Consequence |
|---|---|---|
| Business Service, Service Offering, Service Instance | Integrated from **EPO** (EPO *Business Service*, *Agreement*, *System*). Operational status is overwritten from EPO. | Wrong values that come from EPO need a *source fix* in EPO. Exception: SACM updates status by hand when the sync is stopped for a service-mapped system. |
| Business Process | Created by SACM from the process library after governance approval | Mismatch → process governance team |
| Business Application | **[to confirm]** | — |
| Infrastructure CIs | Import from the infrastructure vendor's database | Source fix at the vendor (post-MVP) |
| Contracts | Manual import from **Solusi**; only concluded (active) contracts are candidates | Post-MVP |

### Lifecycle

Logical classes use *Operational status*: Ready, Operational, Non-Operational, Under Retirement, Retired. EPO statuses map to these; an EPO value outside the mapping becomes *Not matching / Unknown*, which is itself a finding. Physical classes use *Install status* (post-MVP).

## 3. How changes are made

- All configuration changes follow IT Change Management. The tool does not change the CMDB.
- **Standard request**: one CI, a supported attribute (for example criticality values, *Owned by*, *Managed by*).
- **Non-standard request**: several CIs or attributes not covered by a standard request.
- **4-eyes principle**: the requester must deliver approval from the owner or manager of the CI.

**Changing *Owned by*:** the approvals needed depend on who raises the request.

| Requester | Approval required from |
|---|---|
| Current *Owned by* | New *Owned by* |
| New *Owned by* | Current *Owned by* |
| Anyone else | Current *Owned by* **and** new *Owned by* |

**Changing *Managed by*:** same pattern with current *Owned by* and new *Managed by*.

Consequence for the tool: when the current *Owned by* is empty or inactive, the normal approval cannot run. These cases need a different route (a named fallback approver), which SACM must define.

**Relationships and service mapping** are updated in ServiceNow by the SACM Manager after validation with the System Owner or Business Process Owner. The Business Process Owner signs off the service map.

## 4. Criticality (CIA-A)

Four dimensions: Confidentiality, Integrity, Availability, Authenticity. In scope: Business Process, Business Application, Business Service, Service Instance, Contract.

| Concept | Meaning |
|---|---|
| **Target** values | The real criticality of the CI, per dimension. For Business Processes they come from the Business Impact Analysis. |
| **Inherited** values | Per dimension, the highest *Target* value of all parents whose relationship is not excluded. Not shown on Business Processes. |
| **Target business criticality** | The highest of the four Target values. |
| **Exception** | Target lower than Inherited in a dimension. Needs a justification from a fixed list, matching the dimension, and an approval. |
| **Exception status** | *Not required*, *Required*, *Approved*. |
| **Exclusion** | A flag on a relationship that switches off inheritance through it (the relationship stays). Needs approval by the director of the owner's area. |
| **Due date** | 14 days after the last change of a parent's Target value. After that, Inherited becomes Target unless an exception or exclusion stops it. |

Rules that create work for SACM:

1. Target lower than Inherited without justification is not allowed.
2. When a parent's value rises, the system writes a placeholder justification ("Inherited value increased (Auto generated)"). **A placeholder is not a valid justification** and must be replaced.
3. An approval task with no reaction for **14 days is rejected automatically**, and Inherited becomes Target.
4. An approval is **rejected automatically when *Owned by* is empty**.
5. Target equal to or higher than Inherited needs no justification.

## 5. Verification the process already requires

- **Monthly data accuracy check** of service mapping by SACM, from ServiceNow reports: mapped / not mapped Business Processes, Business Services and Service Instances; newly operational Service Instances; processes by criticality. Unmapped CIs are reported to the process owner.
- **Ownership validation**: each asset has an owner; the owner is still valid (still in the role, active user).
- **Verification records** must be logged: date, verifier, issues found.
- **Discrepancies** are classified by severity and assigned to the asset owner, or to the inventory owner when the asset has no owner attribute.
- **Unresolved issues** are escalated to the SACM Manager or the SACM Board.
- **Audit report**: findings, actions taken, open issues.
- **CMDB Health KPIs**: Completeness (required and recommended fields), Correctness (orphan, stale, duplicate), Relationships.

## 6. What this means for the design

| Process fact | Design consequence |
|---|---|
| Verification records and audit reports are mandatory | The activity log and the audit export are core, not optional. Every automatic verification writes a record with date and verifier (person or "automatic"). |
| Standard vs non-standard request | The *service request* path has two variants. The tool chooses by number of CIs and attribute. |
| 4-eyes approval depends on the requester | Messages tell the recipient exactly which request to raise and who will have to approve. |
| Empty *Owned by* blocks criticality approvals | Responsibility checks run first and raise the priority of affected criticality cases. |
| 14-day automatic rejection | Time-critical. A check on pending approvals close to expiry is worth more than most others (proposed addition to the MVP). |
| Placeholder justifications | `CRIT-NO-JUSTIFICATION` treats auto-generated text as missing. |
| Status and core fields of three classes come from EPO | Findings on those fields default to *source fix* in EPO. |
| Monthly accuracy check from fixed reports | Those reports are the first `report` detectors; the Workbench replaces the manual monthly review. |
| Escalation to the SACM Board | Default escalation target of every playbook. |

## 7. Not covered by the process documentation

The following MVP topics are not defined in the documents and need SACM's own rules (see [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md)): description quality and tags. The others are decided since: the 1:1 pairs and the allowed relationship types come from the Service Mapping Workspace model, and *Supported by* is mandatory on Service Instance only ([DECISIONS.md](DECISIONS.md), D31, D66, D69).
