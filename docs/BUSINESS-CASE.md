# SACM Data Quality Workbench — Business Justification

> Audience: SACM management. Status: draft for discussion.
> Figures marked **[fill in]** must come from our own measurements. Nothing in this document is an estimate presented as fact.

## The ask

Approve a **pilot of the SACM Data Quality Workbench**: a small internal application, built on the Microsoft 365 tools we already pay for, that turns the daily manual chase of CMDB data quality issues into one tracked, shared process, with the routine work prepared for the SACM manager to approve.

What the pilot needs:

| Need | From whom |
|---|---|
| Part-time capacity of one SACM manager as product owner for the pilot period **[fill in: weeks]** | SACM management |
| Agreement that the SACM team uses the tool for the pilot checks instead of personal spreadsheets and mailboxes | SACM team |
| Scheduled ServiceNow reports delivered by email to the shared SACM mailbox (we can set these up ourselves) | SACM |
| **No new licences, no new servers, no vendor contract** | — |

## The problem

SACM is accountable for CMDB quality but does not own the data. Almost every correction needs an answer, a decision or an approval from someone else: the CI owner, manager or supporter, a third-party team, or the owner of an upstream data source (vendor import, EPO, Solusi).

Today this work looks like this:

1. **Many reports, looked at one by one, every day.** Each KPI, dashboard and report shows a slice of the problem. Nobody sees the whole queue.
2. **The follow-up is manual.** For each issue, a SACM manager works out who to contact, copies addresses, writes an email or a Teams message, and later tries to remember who answered.
3. **There is no shared memory.** Who was contacted, when, how many times, by which colleague, and what they answered lives in personal mailboxes, chats and spreadsheets. Two people can chase the same owner about the same CI. When someone is absent, their follow-ups stop.
4. **Each issue type has its own path to a fix** (email, Teams, SACM corrects it directly, or the stakeholder opens a service request with approvals), and the path is chosen from memory every time.
5. **We cannot easily prove what we did.** For an audit we have to rebuild the story from emails: who asked, who answered, which request applied the change.
6. **Fixes do not always stay fixed.** Data arrives in the CMDB from a vendor import, from the EPO integration and from manual Solusi imports. If the root cause is in the source, the next import brings the error back.

The result: skilled people spend their time on copy-paste and chasing, the backlog does not visibly shrink, and the KPIs move slowly.

### What our own process already demands

The SACM process and its procedures require, among other things:

- a valid, active owner on every asset, re-validated regularly;
- a **monthly data accuracy check** of service mapping;
- **verification records** for every check (date, verifier, issues found) and an **audit report** (findings, actions, open issues);
- escalation of unresolved issues to the SACM Board;
- criticality (CIA-A) exceptions with a valid justification and an approval. An approval that nobody reacts to is **rejected automatically after 14 days**, and it is rejected immediately when the CI has no owner.

These duties support our information security requirements on asset inventory, ownership and secure configuration, and the criticality model that follows NIS2. Today each of them is fulfilled by hand. The Workbench does not add a new process. It executes the one we already have, and produces its evidence as a by-product.

## Why CMDB data quality matters to the business

| Bad data | Business effect |
|---|---|
| CI without a valid owner, manager, supporter or assignee (empty, or a user who has left) | Incidents and changes are routed to nobody or to the wrong team. Approvals stall. Nobody is accountable for the CI. |
| Poor descriptions | Service desk and change approvers cannot tell what a CI is. Wrong impact assessment. |
| Missing or wrong relationships, 1:1 mismatches | Impact analysis for changes and major incidents is wrong. Service maps cannot be trusted. |
| Missing or wrong tags | Reporting, cost allocation and compliance scoping are wrong. |
| Criticality higher than the parent, or exceptions without justification | Recovery and support effort goes to the wrong place. Findings in risk and continuity audits. |

## The proposal

One application for the SACM team with five capabilities:

1. **One queue.** It reads the reports and exports we already produce and shows every issue in one prioritised list instead of many dashboards.
2. **Knows the path.** For each type of issue it knows who to contact and how the fix happens: email from the shared SACM mailbox, Teams message, direct correction by SACM, or a pre-filled service request in the SACM portal category with its approval flow.
3. **Prepares the routine.** It groups all issues for one person into one message, uses agreed texts, and sends from the shared mailbox when a SACM manager approves. It shows when a reminder is due. Nothing is sent without a person deciding.
4. **Remembers, for everyone.** Every contact, answer, note, request number and decision is stored once, visible to the whole team, with author and time.
5. **Proves the fix.** A case closes only when the next data load shows the issue is gone, or a justified exception is recorded. This is also our audit trail.

It is **modular**. Each data quality check is a small, separate definition. The MVP starts with CMDB checks (below). EPO, Solusi contracts and further checks are added later without rebuilding the tool.

### MVP scope (agreed with SACM managers)

- CIs with *Owned by*, *Managed by*, *Supported by* or *Assigned to* empty or pointing to an inactive user
- CIs without a good quality description
- Mismatches between CIs that should be 1:1
- Missing relationships and wrong relationship types
- Missing tags and wrong tags
- Criticality higher than the parent CI, and criticality exceptions without a valid justification

First on the nine logical CI classes (Business Capability, Business Process, Business Application, Business Service, Service Offering, Service Instance, API, Application, Technology Management Service).

## Why this approach

| Option | Assessment |
|---|---|
| **Keep working as today** | No cost, no improvement. Effort grows with every new KPI. |
| **Do it all inside ServiceNow** (CMDB health, data certification, custom development) | The right home for *changing* data, and we keep using it for that (service requests, approvals). But it does not cover EPO and Solusi, does not track email and Teams conversations, and every change depends on the platform team's backlog and possibly on extra licences. **[confirm with the ServiceNow platform owner which native CMDB data quality features we have licensed and can use]**. Where a native feature already detects an issue, the Workbench reuses its report instead of duplicating it. |
| **Buy a data quality product** | Cost, procurement and integration time. Not built around our routing and approval process. |
| **Workbench on Microsoft 365 (proposed)** | Uses SharePoint, Power Automate, the shared mailbox and Teams, all already licensed. Built and adjusted by SACM. ServiceNow remains the only place where CMDB data changes, through the existing approval flows. |

## Benefits and how we will measure them

We will not promise numbers we have not measured. The pilot starts with a **two-week baseline** and then compares.

| Benefit | Measure | Baseline | Target |
|---|---|---|---|
| Less manual effort | Hours per SACM manager per week on report review, contact and follow-up | **[fill in]** | **[fill in]** |
| Faster correction | Median days from detection to verified fix, per check | **[fill in]** | **[fill in]** |
| Smaller backlog | Open issues per check, weekly trend | **[fill in]** | downward trend |
| Better response | % of contacts answered within the agreed number of days | **[fill in]** | **[fill in]** |
| No lost follow-ups | % of open cases with an owner in SACM and a next action date | not measurable today | 100% |
| Audit readiness | Time to produce the evidence for one CI correction | **[fill in]** | minutes |
| No expired approvals | Criticality approvals rejected automatically after 14 days without reaction | **[fill in]** | 0 |
| Monthly accuracy check | Effort to complete the monthly service-mapping check and its record | **[fill in]** | **[fill in]** |
| KPI improvement | The existing CMDB KPIs for the pilot checks | current values | **[fill in]** |

Simple effort model to complete with our own numbers:

```
hours saved per year = SACM managers × hours per week spent on manual chase × expected reduction × working weeks
```

## Cost

| Item | Cost |
|---|---|
| Licences | None new. Uses the existing Microsoft 365 and Power Automate Premium (per user) subscriptions. |
| Infrastructure | None. Runs in our Microsoft 365 tenant. |
| Build effort | Part-time SACM product owner, AI-assisted development. Delivered in small iterations; each one is usable. |
| Run effort | Maintaining check definitions and templates. Part of normal SACM work. |

## Risks and how we handle them

| Risk | Mitigation |
|---|---|
| The tool depends on one person | Everything is documented and versioned in a repository. Checks and templates are configuration that any SACM manager can change. Standard Microsoft 365 components only. |
| Stakeholders feel spammed | One message per person for all their CIs, a minimum gap between contacts, agreed templates and tone. |
| Wrong findings damage trust | Each check is reviewed by SACM before it goes live and is first run on a small scope. |
| Uncontrolled changes to the CMDB | The tool does not write to the CMDB. Changes go through SACM or through service requests with approval. |
| Data protection | Company data stays in the Microsoft 365 tenant and ServiceNow. The code repository holds no company data. |
| Governance of the tool itself | For the pilot the code is in a private repository. If the pilot succeeds, move it to a company-managed repository and confirm with IT security. **[decision needed]** |

## Plan

| Step | Content | Result |
|---|---|---|
| 0. Foundations | Workspace in our Teams channel, scheduled reports loading automatically, baseline measurement | Our reports arrive in one place without manual work |
| 1. Ownership | Missing and inactive owners: detect → contact from the shared mailbox → request with the right approvals → verified fix | The full loop works for the most valuable check |
| 2. Criticality | Exceptions without valid justification; approvals about to expire | No approval expires unnoticed |
| 3. Service mapping | Unmapped CIs, wrong relationships, 1:1 mismatches | The monthly accuracy check runs from one queue |
| 4. Attributes | Descriptions and tags | Full MVP scope live |
| 5. Reporting | Management KPIs, trend per report, audit report | Pilot review with measured results |

**Decision at the end of the pilot:** continue and extend to EPO and Solusi contract data, adjust, or stop.

Details: [context](CONTEXT.md) · [features](FEATURES.md) · [checks](CHECKS.md) · [architecture](ARCHITECTURE.md).
