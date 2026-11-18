# Context

Why the SACM Data Quality Workbench exists, who uses it, and the world around it. For what it does, see [FEATURES.md](FEATURES.md); for the rules, [DOMAIN-RULES.md](DOMAIN-RULES.md).

## 1. The problem

The Service Asset & Configuration Management (SACM) team keeps the CMDB in ServiceNow correct. Every day the managers review many KPIs, reports and dashboards. Finding a problem is the easy part. The follow-up is manual: who to contact, the email, the Teams chat, the reminder, remembering who was asked what and when. Each manager keeps this in their own mailbox and head, so the team cannot share the work, and nobody can prove later what was done.

The SACM process also asks for things that are hard to do by hand: verification records with date, verifier and issues found, an audit report, and a check that every asset has a valid owner.

## 2. What the Workbench is

One shared queue for the whole team. It reads the reports SACM already gets, finds the data quality problems, knows who to contact about each one, prepares the message in the team's own style, shows the replies, and keeps the history for everybody. A case closes only when a later report proves the fix.

It is **not** an automation. A manager presses a button to load a report, to send each message and to fetch the replies. Nothing is sent, reminded or changed on its own.

It is also a tool for SACM's own fixes: where nobody needs to be asked, a card becomes a fix list that SACM works through in ServiceNow.

## 3. Who uses it

| Who | How |
|---|---|
| **SACM managers** (about four) | The only users. They open the app from the team folder, load reports, work the cards, send messages, record what they did |
| **CI owners and their teams** (Owned by, Managed by, Supported by) | Receive messages from the shared SACM mailbox, reply, or raise a request in the Service Portal. They never open the app |
| **Procurement** | Receives one message about problems in Solusi, from the Procurement mailbox in Settings |
| **The platform team** | Receives one incident per pattern when a sync or upload fails (raised by a manager in ServiceNow, not by the app) |
| **Auditors and management** | Read the verification records and the audit export |

## 4. The systems around it

| System | What it holds | How the Workbench uses it |
|---|---|---|
| **ServiceNow CMDB** | The CIs, their people, relationships, criticality and tags. Fed by a vendor import (infrastructure), the EPO integration and manual Solusi imports | Scheduled reports, emailed to the shared mailbox. The Workbench never writes to it |
| **ServiceNow Service Portal** | The SACM requests, with their approval flows | Messages name the exact request; the links are in Settings |
| **EPO** | The older CMDB-like inventory (on SharePoint). Source of Business Services, Service Offerings and Service Instances | The EPO systems report. Fixes on Business Services, Service Instances and the offerings the EPO integration created are made in EPO by their owners; offerings made by hand are fixed in ServiceNow (D123) |
| **Solusi** | The contracts, owned by Procurement | The Solusi contract file of every Monday. Corrections are asked from Procurement |
| **Service Mapping Workspace** | The team's sibling tool for designing CI mappings ("links, not data quality") | Shares the report layouts, the class catalogue and the relationship model. A relationship case is designed there |
| **Microsoft 365** | The shared SACM mailbox, Outlook, Teams, the team's channel folder (SharePoint, synced with OneDrive), Power Automate | Messages go out from the shared mailbox; the channel folder is the shared memory; three small flows file reports and replies and send what a manager queued |

## 5. What is available, and what is not

**Available:** Microsoft 365 with Power Automate Premium per user; the shared mailbox (flows can read from it and send as it); the team's Teams channels with SharePoint behind them; Office Scripts in the tenant; Edge and Chrome.

**Not available:** a ServiceNow API or HTTP-trigger flows (data leaves ServiceNow only as scheduled reports with an attachment, CSV preferred, at most 20,000 rows per report); servers; new licences; an app registration by IT.

**Real sizes:** about 3,200 CIs and 5,100 relationships, about 600 contracts. Far below the report limit.

## 6. What the Workbench never does

- Write to ServiceNow, EPO or Solusi. ServiceNow is the only place where CMDB data changes, through SACM or through requests with approval.
- Send, remind or escalate without a manager pressing a button. No timer, no scheduled flow that decides anything.
- Connect to the network. The page blocks every connection; data moves only through the synced folder.
- Hold links, addresses or real report files in this repository. Real links, addresses and the team folder location live in the team folder only. The samples are invented (D266). The repository is public, so it also holds no word that points to the employer or a colleague (D286, [HOW-TO.md](HOW-TO.md) §10).

## 7. Scope today

- **Classes:** the nine logical classes of the CMDB. Infrastructure classes are out.
- **Sources:** the CI report, the Relationship report, the EPO systems report, the Solusi contract file and the ServiceNow contract report ([DATA-SOURCES.md](DATA-SOURCES.md)).
- **Parked:** requests in progress (5D) and criticality approval tasks (5E), until the team has used the app for some weeks.
- **Later, not planned yet:** a management overview (trend per report, response times), infrastructure classes, sending Teams messages, direct mailbox access if IT agrees, following the status of a request, checks on existing CMDB Health measures (orphan, stale, duplicate).

## 8. Where to read more

| Document | For |
|---|---|
| [BUSINESS-CASE.md](BUSINESS-CASE.md) | Management: why, cost, benefits, plan |
| [PROCESS-BASELINE.md](PROCESS-BASELINE.md) | What the SACM process documentation means for the tool |
| [FEATURES.md](FEATURES.md) | Every screen and button |
| [DOMAIN-RULES.md](DOMAIN-RULES.md) | The SACM rules and their nuances |
| [CHECKS.md](CHECKS.md) | Every check, one line each |
| [DATA-SOURCES.md](DATA-SOURCES.md) | The reports and their columns |
| [DATA-MODEL.md](DATA-MODEL.md) | The words, and every file of the team folder |
| [DECISIONS.md](DECISIONS.md) | What was decided, by whom, why |
| [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) | What still waits for an answer |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it is built |
| [HOW-TO.md](HOW-TO.md) | Adding a check, a report type or a screen |
| [SETUP.md](SETUP.md) | Setting it up in Microsoft 365 |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each version |
