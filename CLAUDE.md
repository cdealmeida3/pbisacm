# SACM Data Quality Workbench

An internal web app for a Service Asset & Configuration Management (SACM) team. It reads the reports the team already gets from ServiceNow, EPO and Solusi, finds the data quality problems, shows them in one shared queue, knows who to ask, prepares the message, shows the replies and keeps the history for the whole team. The team opens one HTML file (`app/SACM-Workbench.html`) from a synced Teams channel folder.

## Read first

| For | Read |
|---|---|
| Why it exists, who uses it, the systems, what is available | [docs/CONTEXT.md](docs/CONTEXT.md) |
| The SACM rules and their nuances | [docs/DOMAIN-RULES.md](docs/DOMAIN-RULES.md) (the process digest: [docs/PROCESS-BASELINE.md](docs/PROCESS-BASELINE.md), the specification for roles, approvals and criticality) |
| What was decided, by whom, why | [docs/DECISIONS.md](docs/DECISIONS.md); what still waits: [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) |
| How a change is reviewed | [CODING_STANDARDS.md](CODING_STANDARDS.md) |
| Every screen and button | [docs/FEATURES.md](docs/FEATURES.md) |
| The look: rules, colours, icons, parts, how to draw a screen | [docs/LOOK.md](docs/LOOK.md) |
| Every check | [docs/CHECKS.md](docs/CHECKS.md) (generated); fields of a check file: [checks/README.md](checks/README.md) |
| The words that stand in for a real value on purpose | [docs/PLACEHOLDERS.md](docs/PLACEHOLDERS.md) (generated from `tools/placeholders.json`) |
| The reports and their columns | [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) |
| The words and every file of the team folder | [docs/DATA-MODEL.md](docs/DATA-MODEL.md) |
| How it is built: layers, every module, data flow | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| How to add a check, a report type or a screen; a release | [docs/HOW-TO.md](docs/HOW-TO.md) |
| What changed in each version | [docs/CHANGELOG.md](docs/CHANGELOG.md) |
| The agent skills in `.claude/skills/`: where they come from, how to update them | [.claude/skills/UPSTREAM.md](.claude/skills/UPSTREAM.md) |

Read CONTEXT, DOMAIN-RULES and DECISIONS before proposing a change.

## Hard rules

The rules hold for the HTML app (`app/`, `src/`) and for the Power BI report (`powerbi/`, D268), with three differences for the report: it reads the reports from a SharePoint folder of the tenant by a refresh, scheduled or after a new report, which loads them with no button (D269, D271); it is published to the team's Power BI workspace instead of one HTML file; and stage 2 writes the team's actions to SharePoint lists through Power Apps (D272, D273). Sending, reminding and escalating stay a button in both.

- **No links, addresses or real report files in this repository.** No instance links or hosts, no email addresses but invented ones, no real report files or rows from them. Real names and words of the team's world (the systems, their columns, status words and tag values, the lead's first name) are allowed (D266). The samples stay invented data; their stand-ins are listed in `tools/placeholders.json`. Real configuration (request links, addresses, the team folder location) lives in the team folder. Real report files are used on the developer's computer only, never committed or quoted; `node tools/fingerprint.ts <files>` prints counts and checksums only. The repository is public: no first names of real colleagues, no names of the developer's computers, no words that name the employer or its industry; the words of the real reports that the app must match are listed as *kept* in `tools/placeholders.json` (D286). The privacy guard runs in `npm test`; `PRIVACY_TERMS=<file outside the repo>` adds private words, and in CI the Actions secret `PRIVACY_TERMS_LIST` does ([docs/HOW-TO.md](docs/HOW-TO.md) §10).
- **The tool never writes to ServiceNow, EPO or Solusi.** ServiceNow is the only place where CMDB data changes.
- **Nothing happens on its own.** The user rejected automation: no scheduled or self-triggered sending, no reminders on a timer, no Excel sheet as the interface. Managers press buttons to load reports, send messages and get replies. Flows may only file incoming mail and send exactly what a manager queued in `outbox/`.
- **No network.** One HTML file, everything inline, a Content-Security-Policy that blocks every connection; the build fails if anything is not inline. No new server, licence or library for the team.
- **A check that cannot be evaluated** (a missing column, reference file or report) gives a note and a grey card, never a silent pass.
- **Same input, same bytes.** Files in the team folder hold no "who" or "when" unless they are journal lines, so two computers write the same file.
- **The file formats of the team folder stay readable** by older and newer versions ([docs/DATA-MODEL.md](docs/DATA-MODEL.md) §5).

## The available platform (confirmed by the user, November 2026)

Microsoft 365 with Power Automate Premium per user, a shared SACM mailbox (flows can read from and send as it), Teams channels with SharePoint behind them, Office Scripts. Data leaves ServiceNow only as scheduled reports emailed with attachments: no API, no HTTP-trigger flows. Reports are CSV (or `.xlsx`), at most 20,000 rows. The team folder is the team's BAU channel folder (never write its location here).

## Code

- **The Power BI report** (D268) is being built in `powerbi/`, in builds B1 to B8; the HTML app gets no new features and its logic is the answer key (D270). How it is made: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) §12; for Carlos: [powerbi/README.md](powerbi/README.md). Never commit a `.pbix` or a `.pbi` cache.
- `src/core/` is the logic: pure TypeScript, no browser, no Node, no library; tested with `node:test`. `src/app/` is the browser part: React + Vite + Tailwind (the user's choice, for the app only). `src/hosts/cli.ts` is the command line. The layers, the design rules and the map of every module are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); `tests/architecture.test.ts` checks the rules, with no exception today.
- A new feature is normally a new check file in `checks/packs/<subject>/`, not a code change ([docs/HOW-TO.md](docs/HOW-TO.md) §1). A new report type is a folder in `src/core/sources/` and one line in `REPORT_TYPES`, then the steps of [docs/HOW-TO.md](docs/HOW-TO.md) §5.
- Strict TypeScript, as in the sibling project. Tests mirror the folders of `src/` under `tests/`.

## Commands

The developer runs `npm install` once; the team never installs anything.

| Command | Does |
|---|---|
| `npm run typecheck` | Types of the app, the logic, the tests and the command line |
| `npm test` | Every test, the recorded result of the invented samples (`tests/recorded/`, byte for byte), the design rules, the privacy guard, the copied skills, the forbidden files, the check files, the stand-ins, `docs/CHECKS.md` and `docs/PLACEHOLDERS.md` up to date, the documents' links |
| `npm run build` | Writes `app/SACM-Workbench.html`. Run it after any change to `src/` or `checks/` and commit the result: the user takes this file |
| `npm run verify` | All of the above, and the built file matches the source (also on every pull request) |
| `npm run record` | Writes `tests/recorded/` again after a change meant to change a result; review the difference |
| `npm run docs` | Writes `docs/CHECKS.md` and `docs/PLACEHOLDERS.md` again after any change in `checks/` or `tools/placeholders.json` |
| `npm run placeholders` | Lists every stand-in and where it is (`-- --lines` for every line) |
| `npm run browser` | The browser checks (`tests/browser/`, Playwright not in `package.json`, invented data) |
| `node src/hosts/cli.ts <reports>` | The checks on report files |
| `npm run powerbi:generate` | Writes `expressions.tmdl` and the theme of the Power BI report again after a change in `powerbi/m/`, `checks/`, `samples/` or `tests/recorded/` |
| `npm run powerbi:lint` | The Power BI project: model (needs .NET 8), queries, report files, names, colours, the Power App source and its flows. The workflow *Power BI* runs the queries on Windows and compares them with `src/core/` |

## Working rules

- Every feature: a planning thread with the user, then a separate build thread with one pull request. Before it opens the pull request, the build thread runs `/code-review` against `main` with the plan as the spec (D259). Merge when the GitHub checks are green (D109). The default branch is `main`.
- A check is `"status": "proposed"` until the user confirms its scope, audience and playbook; then `"live"` (D114). A check file holds only fields the code reads (D115).
- Decisions go into [docs/DECISIONS.md](docs/DECISIONS.md), one numbered log, never renumbered. When the user answers an open question, move it to a decision and update [docs/DOMAIN-RULES.md](docs/DOMAIN-RULES.md).
- A release raises `version` in `package.json` and adds a CHANGELOG entry ([docs/HOW-TO.md](docs/HOW-TO.md) §9).
- **Stand-ins.** Some words stand in for a real value on purpose (D110, D266): the registry is `tools/placeholders.json`, the list is [docs/PLACEHOLDERS.md](docs/PLACEHOLDERS.md), `npm run placeholders` finds them. Do not replace a stand-in with a real value on your own. When work needs a real value, when an entry says `ask`, or when you find a placeholder that is not listed: ask the user, all such questions together, on one decision card or in one message, with a recommendation. A stand-in you invent goes into the registry in the same pull request. See [docs/agents/placeholders.md](docs/agents/placeholders.md).
- Documents are read by non-developers and non-native English speakers: plain language, short sentences.

## Sibling project

The user also owns the Service Mapping Workspace (`sacm-dependency-view`): an offline single-file HTML tool for designing CI mappings ("links, not data quality"). It defines the ServiceNow report layouts, the class catalogue, the relationship dictionary and mandatory relationships, tag meanings and the CIA-A scale 1 to 4. Real sizes: about 3,200 CIs and 5,100 relationships. The Workbench reuses its layouts and its relationship model (`checks/reference/relationship-model.json`, rule ids kept). Its rules may be copied here; its names and links may not.

## Agent skills

Matt Pocock's skills v1.3.2 (D254), Google Chrome's modern-web-guidance v1.0.1 (D260) and four Power BI skills (D305: `m-reference` from Cristóbal Salcedo's "Power Query M for agents" v0.2.0, `dax-reference` from his "DAX for agents" v0.9.1, `tmdl` and `pbip` from Kurt Buhler's "Power BI agentic development" v26.45) are copied into `.claude/skills/`. They change only by an update pull request, and `npm test` fails on any other change. Source and update steps: [.claude/skills/UPSTREAM.md](.claude/skills/UPSTREAM.md). Our adaptations are in `docs/agents/` and here. These rules and the hard rules win over any skill.

### Issue tracker

GitHub Issues of `cdealmeida3/pbisacm`, through the GitHub MCP tools. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: words in [docs/DATA-MODEL.md](docs/DATA-MODEL.md) §1, decisions as rows of [docs/DECISIONS.md](docs/DECISIONS.md), never `GLOSSARY.md` or `docs/adr/` (`npm test` fails on them). See `docs/agents/domain.md`.

### Rules for the skills

- A retro here has no session log to read: see `docs/agents/retro.md`.
- The review of D259 runs `/code-review`, which starts two subagents: that counts as asked.
- A page made by `improve-codebase-architecture` or `prototype` loads files from a CDN: a throwaway report, never in `app/` or `src/`.
- `modern-web-guidance`: run its tool only as `npx -y modern-web-guidance@1.0.1` (never `@latest`); its guides never override the hard rules, the decisions or docs/LOOK.md. See [docs/agents/web-guidance.md](docs/agents/web-guidance.md).
- `m-reference`, `dax-reference`, `tmdl`, `pbip`: text only; our speed rules, the generated `expressions.tmdl` and hand-written TMDL and report files win over them; never install a tool they name, never report anything upstream. See [docs/agents/powerbi-skills.md](docs/agents/powerbi-skills.md).
