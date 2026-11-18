# SACM Workbench in Power BI

This folder is the Power BI version of the Workbench (decision D268). It is a **Power BI project** (`.pbip`): the model
and the report are text files, so every change can be reviewed in a pull request. Power BI Desktop opens it like a
`.pbix`.

This is **build B3**. It reads the five kinds of report, shows which reports are there and how old they are, and runs
the checks of the CI report, the Relationship report and the EPO systems report: 32 of the 39 cards work, with the same
result as the HTML app. The other cards are grey ("not built yet"): the contract checks come in build B4, and
*Lifecycle review* is a manual card. Why it is built this way: decisions D268 to D282 in
[DECISIONS.md](../docs/DECISIONS.md).

## 1. Open it on your Windows PC

You need Power BI Desktop (free, from the Microsoft Store or from Microsoft's download page).

1. Get the folder `powerbi/`: either unzip the zip from the project thread, or clone the repository.
2. Double-click `SACM-Workbench.pbip`.
3. Power BI Desktop opens the report. **The pages are empty the first time**: a project keeps no data in its files.
4. Press **Refresh** (Home ribbon). Desktop reads the invented sample reports that are inside the file. There is no
   sign-in and no file path: the samples are part of the model. After that the data stays until you close Desktop.

The report opens on the **Cards** page. Look at:

| Page | What you should see |
|---|---|
| **Reports** | One line per kind of report (CI report, Relationship report, EPO systems report, Solusi contract file, ServiceNow contract report), the newest file of each, its date and age, and "Up to date", "Old" or "Missing" in colour. Below: the runs, the classes and the files that could not be read (none for the samples). |
| **Cards** | The three sections (Completeness, Correctness, Compliance) and one row per check in use, with its state in colour (red To solve, blue To check, green OK, grey Not tested), its number and *Partly tested* when a note says what it could not test. Grey cards say why. **Topic** at the top right filters the cards. Below: the classes that are not checked yet. For the samples the built cards show 19 to solve, 3 to check, 8 OK and 2 not tested (hidden characters: a CSV cannot show them; *Offering parent*: the sample CI report has no Parent column), as in the HTML app. |
| **Card** (drill through) | Right-click a row of the Cards page, choose **Drill through**, then **Card**. Who is asked about which CI and why (to solve), the lines to check, waiting or known, the SACM fix list (with **Open in ServiceNow**), and a table with the columns of the SACM template: its **More options (...)**, **Export data** gives the Excel file. |
| **Case** (drill through) | Right-click a CI on the Card page, **Drill through**, **Case**: each problem of the CI, its state, who is asked, who is copied and who gets an escalation, the chip *changed in EPO*, and *What EPO already has* when EPO already holds the person asked for (then nobody needs to be asked). Below: **Relationships**, every CI above and below it, its class, status and type, and whether the line counts for the checks. |
| **Person** (drill through) | Right-click the person asked, **Drill through**, **Person**: everything open with them. |
| **Mapping backlog** | One line per CI to map with its owner: why it is on the list, the stage of its class, the steps, its criticality and the next step ("Invite the owner to a mapping session", or why it waits). **Lines** filters To solve, To check, Waiting and Planned. Below: the **capability sheet** for Enterprise Architecture (its line says how many, or why it is empty: it needs the Relationship report), every Business Capability with what is above and below it (**Export data** gives the Excel file). For the samples: 4 CIs to map. The backlog has no drill through to the Case page: right-click the CI on the *Mapping backlog* card instead. Until build B5 the stage is the first stage of the class (there is no history yet). |
| **Self-check** (hidden page) | How many checks give the result the HTML app records for the same samples. In B3 it says **32 of 39**: the 32 checks that are built. Each later build raises the number; at the end of stage 1 it says 39 of 39. In Desktop you see hidden pages in the page list; in the published report they are hidden. |

At the foot of every page: the version, "invented samples" or "SharePoint", and when the data was refreshed.

In Sample mode "today" is **11 November 2026**, the date of the samples, so the ages on the Reports page never change.

### If Desktop cannot open the .pbip (an older Power BI Desktop)

Since 2026 Power BI Desktop opens projects in this format by default. An older Desktop (for example one installed by IT
long ago) needs three preview options:

1. **File → Options and settings → Options → Preview features.**
2. Turn on **Power BI Project (.pbip) save option**, **Store semantic model using TMDL format** and **Store reports
   using enhanced metadata format (PBIR)**.
3. Close and open Power BI Desktop again, then double-click the `.pbip`.

If that is not possible, use the `.pbix` way of section 2.

## 2. Make a .pbix (for the company laptop, or to send the file)

1. Open the `.pbip` on your PC as in section 1, and refresh.
2. **File → Save as**, choose the type **Power BI file (\*.pbix)**, and save it outside this folder.
3. Copy the `.pbix` to the company laptop (OneDrive or email) and open it there.

A `.pbix` holds the data. **Never put a .pbix in the repository**, and never commit the hidden folders `.pbi` that Desktop
writes next to the project (they hold the data cache and your own settings). `.gitignore` keeps them out and `npm test`
fails if one is committed.

## 3. Read the real reports from SharePoint (when you are ready)

**Not yet at the size of the real reports.** On invented reports as big as the real ones (3,230 CIs, 5,100
relationships), the Windows check needs 50 seconds for the table *Inventory* alone, and the checks (*Findings*) did not
finish in 14 minutes. The plan's target is under 2 minutes. Until a later build makes the queries faster, use the
samples, or try SharePoint with a small report only.

The model reads the reports from one folder of the team's SharePoint site. Power Automate puts the scheduled ServiceNow
reports there (flow F1 of the plan). The real site and folder are typed in Power BI only, **never in this repository**.

1. **Home → Transform data → Edit parameters.**
2. **SharePointSite**: the address of the team's site, up to the site name, for example
   `https://contoso.sharepoint.com/sites/sacm` (this one is invented).
3. **ReportsFolder**: the folder in that site, starting with the library, for example `Shared Documents/Workbench/Reports`
   (invented too). In SharePoint the library "Documents" is called `Shared Documents` here.
4. **SourceMode**: change `Sample` to `SharePoint`.
5. **ServiceNowAddress**: the address of the team's ServiceNow, for example `https://contoso.service-now.com` (invented).
   Only "https://" and the host count; the report builds the **Open in ServiceNow** links with it and never writes to
   ServiceNow (D279).
6. Press **OK**, then **Apply changes**. Desktop asks how to sign in: choose **Organizational account** and sign in with
   your company account.

How a file is read:

- Files ending in `.csv`, `.xlsx` or `.txt` are read; others, and Office's temporary files (`~$...`), are not.
- The kind of report is found from its columns, as in the HTML app. A file that is no known report is listed under
  "Files not read" on the Reports page, with what it is missing.
- The date of a report is the `yyyy-MM-dd_` at the start of its file name (for example `2026-11-17_cmdb_ci.csv`), else the
  day the file was last changed. The newest file of each kind is the one the checks use.

To go back to the samples, set **SourceMode** to `Sample` again.

**Do not save a .pbix or the project into the repository after a SharePoint refresh**: it would hold real data.

## 4. Publish it for the team (later)

Publishing comes at the end of stage 1 (build B5), with the step-by-step guide. In short: **Home → Publish** to the
team's workspace (Premium Per User), set the SharePoint credentials in the workspace, and turn on a scheduled refresh.

## 5. What was assumed (questions still open)

The plan asks five questions. Until you answer, this build uses these answers:

| # | Question | What this build assumes |
|---|---|---|
| Q1 | Can the company laptop open GitHub, and is its Power BI Desktop current? | Both ways are described: the `.pbip` (section 1) and the `.pbix` (section 2); the preview options for an older Desktop. |
| Q2 | May a build thread ask you to run the Self-check on real data, with only counts reported back? | Yes, counts only. |
| Q3 | Publish from Desktop, or connect the workspace to GitHub? | Publish from Desktop. |
| Q4 | Do the four managers have PPU; are the Power Apps visual, canvas apps, flows and *Export data* allowed? | Yes to all; build B6 checks before it builds. |
| Q5 | Do the SharePoint lists live in the BAU channel's site, next to the Reports folder? | Yes. |

## 6. For the developer

The parts and the commands are in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), part "The Power BI report". In short:

- `powerbi/m/*.pq` are the Power Query queries, written by hand. `npm run powerbi:generate` writes them, with the samples,
  the check files and the reference files, into `SACM-Workbench.SemanticModel/definition/expressions.tmdl`, and writes
  the theme. `npm test` fails when either is out of date.
- The tables (`definition/tables/*.tmdl`) and the pages (`SACM-Workbench.Report/definition/`) are written by hand, and
  may be changed in Power BI Desktop and committed.
- `npm run powerbi:lint` checks the model with Microsoft's library (needs .NET 8), the queries, the report files, the
  references and the colours. The workflow "Power BI" runs the queries on Windows with Microsoft's Power Query test tool
  and compares the result with the TypeScript logic of `src/core/`.
- If you change a query in Power BI Desktop, copy the change into `powerbi/m/` and run `npm run powerbi:generate`:
  `expressions.tmdl` is generated.
- The refresh must stay under 2 minutes at the size of the real reports (D283). The job *powerbi-time* of the workflow
  "Power BI" measures it on invented reports of that size on every pull request, and fails above it. To see where the
  time goes, start the workflow by hand (Actions → Power BI → Run workflow) with `sizes` (copies of the samples, for
  example `42,85,170`; 170 is the real size), `stages` (also time each stage of the checks) and `cap` (seconds per
  query). The job summary has one line per table and stage, the growth when the data doubles, and T1, the sum of the
  tables. The rules that keep it fast are in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) §12.
- To try the real size in Power BI Desktop: `node tools/powerbi/scaled.ts --write <folder>` writes the invented reports
  at that size; put them in a SharePoint test folder and switch `SourceMode` to SharePoint (§3).
