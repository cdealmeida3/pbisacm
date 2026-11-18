# SACM Data Quality Workbench

A web app for the Service Asset & Configuration Management (SACM) team. It finds the data quality problems of the CMDB in the reports the team already gets, shows them in one shared queue, knows who to contact about each one, prepares the message, shows the replies and keeps the history for the whole team. A case closes only when a later report proves the fix.

Nothing happens on its own: a manager loads the report, sends each message and fetches the replies. The app never writes to ServiceNow.

**What it checks today:** the nine logical CI classes (responsibilities, criticality, descriptions, tags, names, EPO ID, support group, lifecycle), their relationships (with the Relationship report), EPO compared with ServiceNow (with the EPO systems report), and the contracts of Solusi compared with ServiceNow (with the Solusi contract file and the ServiceNow contract report). Every check is listed in [docs/CHECKS.md](docs/CHECKS.md).

> **Replaced by the Power BI report** (D268, version 0.45.0). The team uses the Power BI version in [`powerbi/`](powerbi/README.md): the same checks, cases and messages, read from SharePoint, with Power Apps for the buttons. The HTML app below still works and stays the answer key of the Power BI report (D270), but it gets no new features.

## Use it

**The Power BI report:** follow [powerbi/README.md](powerbi/README.md).

**The HTML app (replaced):** open [`app/SACM-Workbench.html`](app/SACM-Workbench.html) in Edge or Chrome and click *Try it with invented data*. To connect the team folder and the shared mailbox, follow the [setup guide](docs/SETUP.md).

## Read more

| Document | Answers |
|---|---|
| [Context](docs/CONTEXT.md) | Why the app exists, who uses it, the systems around it, what it never does |
| [Features](docs/FEATURES.md) | Every screen, card and button, as a manager sees it |
| [Domain rules](docs/DOMAIN-RULES.md) | The SACM rules and their nuances |
| [Checks](docs/CHECKS.md) | Every check, one line each (written from the check files) |
| [Data sources](docs/DATA-SOURCES.md) | The five reports and their columns |
| [Data model](docs/DATA-MODEL.md) | The words, and every file of the team folder, field by field |
| [Decisions](docs/DECISIONS.md) | What was decided, when, by whom, why |
| [Open questions](docs/OPEN-QUESTIONS.md) | What still waits for an answer from SACM |
| [Changes](docs/CHANGELOG.md) | What changed in each version |
| [Setup guide](docs/SETUP.md) | Setting it up in Microsoft 365, step by step |
| [Process baseline](docs/PROCESS-BASELINE.md) | What the SACM process documentation means for the tool |
| [Business case](docs/BUSINESS-CASE.md) | For management: why, cost, benefits, plan |
| [Architecture](docs/ARCHITECTURE.md) | How it is built: parts, layers, every module, data flow, security |
| [How to](docs/HOW-TO.md) | Add a check, a rule word, a report type or a screen; make a release |
| [Check packs](checks/) | The checks themselves, one file each, and their reference data |

## Develop

Needs Node.js 22.18 or newer. The tests and the command line need nothing installed. To build the app (React, Vite, Tailwind), run `npm install` once. The team never installs anything: they open the built file.

| Command | What it does |
|---|---|
| `npm test` | The tests, the recorded result of the invented samples, the design rules, the privacy guard, the stand-ins, and that `docs/CHECKS.md` and `docs/PLACEHOLDERS.md` are up to date |
| `node src/hosts/cli.ts samples/cmdb_ci-sample.csv` | Runs every check on a CI report, prints the findings and what could not be tested, writes `findings.json` next to the report |
| `npm run build` | Rebuilds `app/SACM-Workbench.html` from `src/` and `checks/`. Commit the result |
| `npm run verify` | Types, tests, build, and the built file matches the source (also run on every pull request) |
| `npm run docs` | Writes `docs/CHECKS.md` and `docs/PLACEHOLDERS.md` again after a change in `checks/` or `tools/placeholders.json` |
| `npm run record` | Writes the recorded result of the invented samples again, after a change meant to change a result |
| `npm run browser` | The browser checks on the built file, with invented data |

> This repository is public. It holds code, check definitions and invented samples. No addresses, instance links or real report files. The stand-ins of the samples are listed in [docs/PLACEHOLDERS.md](docs/PLACEHOLDERS.md).
