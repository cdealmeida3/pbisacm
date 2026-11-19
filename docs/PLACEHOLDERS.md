# Stand-ins

<!-- Written by tools/placeholders.ts from tools/placeholders.json. Do not edit: run `npm run docs`. -->

Some words of this repository stand in for a real value on purpose: the samples and tests use invented people, addresses and IDs ([DECISIONS.md](DECISIONS.md) D110, D266). The real values come from the real reports and from Settings when the app runs. This page lists them, so that nobody takes one for a mistake or replaces it with a real value.

- **Stays invented**: an invented value. Do not replace it with a real one.
- **Real, kept**: a real value that looks like a stand-in, kept on purpose.
- **Ask the user**: not decided yet. A thread that meets it asks the user first ([agents/placeholders.md](agents/placeholders.md)).

`node tools/placeholders.ts` shows where each one is (`--lines` for every line). `npm test` fails when a word or a shape of this list matches nothing, or when a placeholder that is not listed here appears.

## Words

| Id | Group | Stand-in | What it is | Use |
|---|---|---|---|---|
| `person.sample-people` | people | `Ada Example`, `Alex Example`, `Sam Example`, `Max Manager`, `Test Manager`, `Hana Head`, `Lee Lead`, `Dee Owner`, `Olga Owner`, `Ann Owner`, `Pia Owner`, `Cy Keeper`, `Ian Inactive`, `Dana Daily`, `Pat Partner`, `Demo User`, `Lena`, `Nia`, `Oskar` | Invented people of the samples and tests (the main ones; Demo User is the name of the demo; Lena, Nia and Oskar are the team members of the team tests) | Stays invented |
| `epo.report-words` | documents | `Kørende`, `Nedlagt`, `Konstruktion`, `Udgående`, `AJOUR_TMS` | The four status words and the date column of the real EPO systems report. Real, kept on purpose: the app needs them to read the real report (D286) | Real, kept |
| `doc.format-example` | examples | `Jane Doe` | A format example of a person's name in a comment | Stays invented |
| `test.private-word` | examples | `Acme` | The private word of the privacy guard test | Stays invented |
| `department.sample` | samples | `D-100`, `D-200`, `D-300` | Invented departments of the EPO sample | Stays invented |
| `solusi.real-shape-names` | samples | `to ServiceNow Report 202611160700`, `CLM_CONTRACT_DOMAIN_ID_DEMO`, `CLM_CONTRACT_DOMAIN_DEMO`, `CLM_CONTRACT_DEPARTMENT_DEMO` | The name of the Solusi workbook of the real-shape samples and the ending of three of its columns (D353). The real name and ending carry the employer's own word; the reader reads neither, so nothing needs the real value | Stays invented |
| `powerbi.time-zone` | configuration | `<the time zone of the team>` | The time zone of the gate of the flows F3, F5 and F6 (D333). Carlos picks the Windows name of the zone in each flow, the same as the time zone of the scheduled refresh; the real zone is never written here (powerbi/README.md §6.3) | Stays invented |
| `powerbi.reports-folder` | addresses | `Shared Documents/Workbench/Reports` | Default of the Power BI parameter ReportsFolder: the folder of the report files in the SharePoint site. The real folder is typed in Power BI Desktop or in the workspace, never here (powerbi/README.md) | Stays invented |

## Shapes

Whole families of stand-ins, as a regular expression.

| Id | Group | Pattern | What it is | Use |
|---|---|---|---|---|
| `person.sample-user-ids` | people | `\b(?:ada\|ann\|bo\|cy\|dee\|iin\|pia)0\d\b` | Invented ServiceNow user IDs of the samples and tests | Stays invented |
| `email.example` | addresses | `[A-Za-z0-9._%+-]+@example\.(?:com\|org\|net)\b` | Invented email addresses | Stays invented |
| `vendor.sample` | samples | `\bExample [A-Z][a-z]+(?: Ltd)?\b` | Invented vendors and contract names of the contract samples | Stays invented |
| `host.servicenow` | addresses | `\bcontoso(?:\.service-now)?\.com\b` | Invented ServiceNow host, also the default of the Power BI parameter ServiceNowAddress. The real address is typed in Power BI Desktop or in the workspace, never here (powerbi/README.md) | Stays invented |
| `host.sharepoint` | addresses | `\bcontoso\.sharepoint\.com(?:/sites/sacm)?\b` | Invented SharePoint site, the default of the Power BI parameter SharePointSite. The real site is typed in Power BI Desktop or in the workspace, never here (powerbi/README.md) | Stays invented |
| `ci.asset-tag` | samples | `\bAST-\d{4}\b` | Invented asset tags of the sample CIs | Stays invented |
| `column.criticality-scope` | samples | `\bx_demo_[a-z_]+` | Invented scope prefix of the criticality columns of the samples. The reader matches the columns by their ending, so the real prefix needs no change | Stays invented |
| `doc.section-number` | documents | `\b(?:[Pp]rocedure\|[Ii]nstruction)(?:,? (?:section\|appendix))?,? \d+\.\d+\b` | Section numbers of the team's procedure and instruction. Real, kept on purpose (D267) | Real, kept |
