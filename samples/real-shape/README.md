# Real-shape samples

Small invented report files with the shapes of the real reports in the team folder on one day (build R2, D353). They test
that the Workbench reads the real reports correctly. All the data is invented: about 20 CIs, a few contracts.

| File | What it is | What it tests |
|---|---|---|
| `2026-11-19_cmdb_logical_automation.csv` | The CI report, with the 34 columns of the real one | The criticality columns with a scoped-app prefix (`x_demo_crit_`, invented); the 14 columns the checks read and the report lacks (one line to copy, D347) |
| `2026-11-19_1cmdb_logical_automation.csv` | The same file a second time, as a copy in the folder | The choice of the day: the same columns and rows, so the last file name is used and the copy is not (D348) |
| `2026-11-19_health_orphan_automation.csv` | A CMDB Health result about orphan CIs | A file with `ci`, `ci.sys_class_name` and owner columns is never the CI report (D341) |
| `2026-11-19_rel_ci_automation.csv` | The Relationship report, with its field names | *Excluded for calculation* matched by the end of its name (D351) |
| `2026-11-19_EPORapport.csv` | The EPO systems report: `;`, a byte order mark, every field quoted | The EPO reader |
| `2026-11-19_contract_ci_automation.csv` | The links between contracts and CIs | A known file, not used yet (D342) |
| `2026-11-19_ast_contract_automation.csv` | The ServiceNow contract report (the contracts table) | The inherited criticality columns with a scoped-app prefix (D351) |
| `2026-11-19_Contracts to ServiceNow Report 202611160700.xlsx` | The Solusi workbook. Not a file here: `tests/real-shape.ts` builds it | Every XML element with a prefix (`<x:row>`), two tabs, labels on row 2, a date past Excel's last day (D350) |

The files use CRLF line ends and quote every field, as ServiceNow writes them.

- `npm test` reads them with `src/core` and compares the result with `tests/recorded/real-shape.json`.
- The Power BI check reads the CSV files with the M (the queries `RealShape` and `RealShapeFixes` of
  `tools/powerbi/connector.ts`) and compares. Power Query's test tool cannot open an `.xlsx`, so the workbook is
  tested with `src/core` only.

Never put a real report here. The real criticality prefix and the real name of the Solusi workbook carry the employer's
own word; the stand-ins are listed in `tools/placeholders.json`.
