# Open questions

Only what still waits for an answer from SACM, most important first. When a question is answered, the answer becomes a decision in [DECISIONS.md](DECISIONS.md) (and the rule in [DOMAIN-RULES.md](DOMAIN-RULES.md) is updated), and the line leaves this page.

**Do not put real company data in this repository.** Answer in the chat; links and addresses go in *Settings* in the team folder.

The old number of the item in "Inputs needed" is given in brackets.

## 1. Things only SACM can do in the app

These are not questions, but the app waits for them.

| # | What | Where |
|---|---|---|
| Q1 | Paste the link of each request in *Settings* (the list was sent on 11 Nov 2026) | Settings → Requests (11) |
| Q2 | Fill in the address of the Procurement mailbox. Until then the message For Procurement cannot be written. Fill in the Procurement lead too: without one there is no escalation (D147) | Settings → Procurement mailbox, Procurement lead (60) |
| Q3 | Add the four SACM managers to the team list | Settings → Team (30) |
| Q4 | Enter the known exceptions of section 3.1 of the instruction (CIs created directly in ServiceNow, not in EPO) | Audit → Not followed up → Add a CI not to follow up (35) |
| Q33 | Add the people of the Process Management team (name and email). Until then the message to Process Management about Business Processes cannot be written (D195) | Settings → Requests and mailboxes → Process Management (N4) |
| Q34 | Type the address of your ServiceNow (any link of it: the app keeps "https://" and the host). Until then the lines of a SACM list cannot open their record in ServiceNow (D244) | Settings → Mailboxes → ServiceNow |
| Q5 | Finish the pilot on two computers: OneDrive sync delay, copy names, Outlook, Teams; then build the three flows | Setup guide; pilot steps (A1, A3) |

## 2. Rules that block or change work

| # | Question | Why it matters | Today |
|---|---|---|---|
| Q6 | **Who approves when Owned by is empty or inactive?** The normal 4-eyes approval cannot run without a current owner | Every message about a missing owner names a request whose approval may fail | The message asks Managed by (or the manager) for the name of the new owner |
| Q9 | **The double-contact look-back of 24 hours**: right after the pilot measured the OneDrive delay? | Too short misses a colleague's message; too long blocks real reminders | 24 hours (28) |
| Q10 | **The lifecycle review sample:** the instruction says "50 per category"; the app draws 50 in total, plus 20 Under retirement | The size of the evidence | 50 in total (42) |
| Q11 | **Is a daily responsible mandatory on a contract?** | Today it is only counted on Contract changes | Not asked (64) |
| Q35 | **How many CI reports (dates) are in the reports folder now, and does one come every working day?** (the Power BI report in My workspace, D336) | The first refresh after each publish computes the whole history and must finish in 2 hours on shared capacity | Fewer than the number README §4A gives; older reports go into the sub-folder *Archive* |

## 3. Checks still waiting for a rule

| # | Question | Check | Today |
|---|---|---|---|
| Q13 | **Allowed tags.** Is there a list of allowed tags? Are there other mandatory tags than the process type of a Business Process? | TAG-INVALID, TAG-MISSING | *Tag not allowed* is switched off until the list comes (D150) (C13) |
| Q14 | **A good description.** What makes a description "good quality"? Is the field synchronised from EPO for some classes? | DESC-QUALITY | Empty, shorter than 30 characters, equal to the name, a placeholder, or the same text on more than 10 CIs (C14) |
| Q15 | **Above parent.** Is a Target above Inherited only a review item, or did "higher criticality than its parents" mean something else? | CRIT-ABOVE-PARENT | Review list (B8) |
| Q16 | **Justification with several choices.** How does the export separate several justification entries? | CRIT-NO-JUSTIFICATION | Entries "<Dimension> - <reason>", split on a comma, a semicolon or a new line (B9) |
| Q17 | **Review-only relationship rules.** Should a Service Offering need a Service Instance, a Business Service a Business Process, and is a Platform above its Service Instance wrong? | REL-MISSING, REL-WRONG-TYPE | Listed for a review only (27) |
| Q18 | **Pending criticality approvals.** Can you report on approval tasks with their creation date? Then the checks "approval about to expire" (rejected after 14 days) and "approval blocked by an empty owner" can be built (piece 5E, parked). Also proposed: a check on Operational status *Not matching / Unknown* (an EPO status with no mapping) | New checks | Not built (B10, B11) |
| Q19 | **Department head as fallback.** If the fallback should be the department head and not the direct manager, add the column with its email to the report | RESP-MISSING, RESP-INACTIVE | The department head has a name only in the report, no email (A5, 5) |
| Q31 | **Rules for an Operational Business Capability.** Which checks fit a capability that is Operational or Under retirement? The rules are still open with Enterprise Architecture | Every capability card: owner and manager, description, names, relationships | Checked as before. A capability in Ready is parked and not checked (D179) |
| Q32 | **A report of the ServiceNow users.** Can a report give every user with name, user ID, active, and user or contact? Then the app names the exact active account for a contract person, and knows for sure that a person left | CONTRACT-SN-FIX, CONTRACT-PROCUREMENT | The app knows only the people that a CI or a contract names (D193) |

## 4. Assumptions to confirm when you have time

Each is one line in a file of `checks/`. Say so if one is wrong. The full list, with the reason, is in [DECISIONS.md](DECISIONS.md) (every row marked *Assumed*). The ones most likely to matter:

| # | Assumption | Decision |
|---|---|---|
| Q20 | API offerings are written "API - " with spaces, although the instruction writes "API-" (36) | D76 |
| Q22 | Under retirement too long after 90 days, counted from the last change of the record; Ready too long after 90 days (D149) (41) | D81 |
| Q23 | A report counts as old after 3 days (8); a contract file after 8 days (59) | D14 |
| Q24 | Share out this card: biggest group first, to who has least; or strict turns? (29) | D24 |
| Q25 | Which contracts are asked of Procurement, and for which problems (65) | D99 |

## 5. Later

| # | Question | Old number |
|---|---|---|
| Q26 | The other KPIs, reports and dashboards SACM reviews daily: a simple list, one line each | 16 (part D) |
| Q27 | Baseline for the business case: number of SACM managers, rough hours per person per week on this work today | 6 (part A) |
| Q28 | Which class does Business Application come from (created in ServiceNow, or fed by another source)? | Process baseline |
| Q29 | Report column still worth adding: *Owned by.Department.Department head* email. (*Managed by.Manager* is no longer needed: the escalation for a Managed by person goes to the owner, D160) | 5 |
| Q30 | Trends over months (a chart or a history page): is it worth it? Today the first screen compares only with the report before ("31 new, 54 solved", D172) | Whole-app plan, build 4 |
