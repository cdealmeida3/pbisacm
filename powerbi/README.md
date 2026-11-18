# SACM Workbench in Power BI

This folder is the Power BI version of the Workbench (decision D268). It is a **Power BI project** (`.pbip`): the model
and the report are text files, so every change can be reviewed in a pull request. Power BI Desktop opens it like a
`.pbix`.

This is **build B5**, the end of stage 1. It reads the five kinds of report, runs the checks of every CI report date
(38 of the 39 cards work, with the same result as the HTML app; *Lifecycle review* is a manual card), keeps the history
with an incremental refresh, reads the team's journal, replies, settings, team and lifecycle reviews from five
SharePoint lists, and works out the cases as the app does. It can be published for the team (section 4). Writing to the
lists (sending, marking fixed, assigning) comes in stage 2. Why it is built this way: decisions D268 to D293 in
[DECISIONS.md](../docs/DECISIONS.md).

## 1. Open it on your Windows PC

You need Power BI Desktop (free, from the Microsoft Store or from Microsoft's download page).

1. Get the folder `powerbi/`: either unzip the zip from the project thread, or clone the repository.
2. Double-click `SACM-Workbench.pbip`.
3. Power BI Desktop opens the report. **The pages are empty the first time**: a project keeps no data in its files.
4. Press **Refresh** (Home ribbon). Desktop reads the invented sample reports that are inside the file. There is no
   sign-in and no file path: the samples are part of the model. After that the data stays until you close Desktop.

The report opens on the **My day** page. Look at:

| Page | What you should see |
|---|---|
| **My day** | The Reports line and **Open Reports** at the top. For the samples: 1 reply to read, 1 reminder due, 3 cases to escalate, and the findings new since the report before (the samples have two CI reports: 4 and 11 November). The line at the top: "Since the report of 4 Nov: 23 new, 2 solved." |
| **My work** | *Me* is Alex Example (in Sample mode the first active member of the team; in the workspace the person signed in). The 2 cases assigned to Alex. |
| **Activity** | The 20 events of the sample journal, newest first, in the words of the app. **Day**, **Who** and **Type** filter them. |
| **History** | To solve, new and solved per report date, the days to fix, and to solve per support group and per class, for the two sample dates. **Card** filters one card. |
| **Audit** | The verification record of the report date chosen, what was verified (2 findings solved on 11 November), the actions of the team, the 3 decisions to stop following (2 still run, 1 ended on 10 November), and the lifecycle review marks. **More options (...)**, **Export data** gives the Excel file. |
| **Reports** | One line per kind of report (CI report, Relationship report, EPO systems report, Solusi contract file, ServiceNow contract report), the newest file of each, its date and age, and "Up to date", "Old" or "Missing" in colour. Below: the runs, the classes and the files that could not be read (none for the samples). |
| **Cards** | The three sections (Completeness, Correctness, Compliance) and one row per check in use, with its state in colour (red To solve, blue To check, green OK, grey Not tested), its number and *Partly tested* when a note says what it could not test. Grey cards say why. **Topic** at the top right filters the cards. Below: the classes that are not checked yet. For the samples the built cards show 25 to solve, 3 to check, 8 OK and 2 not tested (hidden characters: a CSV cannot show them; *Offering parent*: the sample CI report has no Parent column), as in the HTML app. |
| **Card** (drill through) | Right-click a row of the Cards page, choose **Drill through**, then **Card**. Who is asked about which CI and why (to solve), the lines to check, waiting or known, the SACM fix list (with **Open in ServiceNow**), the lines by kind of problem (for *For Procurement*: one email to the Procurement mailbox, one table per kind), and a table with the columns of the SACM template: its **More options (...)**, **Export data** gives the Excel file. A contract shows as `CT…: name`. |
| **Case** (drill through) | Right-click a CI on the Card page, **Drill through**, **Case**: each problem of the CI, its state, who is asked, who is copied and who gets an escalation, the chip *changed in EPO*, and *What EPO already has* when EPO already holds the person asked for (then nobody needs to be asked). Below: **Relationships**, every CI above and below it, its class, status and type, and whether the line counts for the checks. |
| **Person** (drill through) | Right-click the person asked, **Drill through**, **Person**: everything open with them. |
| **Mapping backlog** | One line per CI to map with its owner: why it is on the list, the stage of its class, the steps, its criticality and the next step ("Invite the owner to a mapping session", or why it waits). **Lines** filters To solve, To check, Waiting and Planned. Below: the **capability sheet** for Enterprise Architecture (its line says how many, or why it is empty: it needs the Relationship report), every Business Capability with what is above and below it (**Export data** gives the Excel file). For the samples: 4 CIs to map. The backlog has no drill through to the Case page: right-click the CI on the *Mapping backlog* card instead. Until build B5 the stage is the first stage of the class (there is no history yet). |
| **Contract changes** | The newest Solusi contract file against the one before it: new contracts, contracts no longer in the file, status changes and changed fields. Then the Concluded contracts that end in the next 30 and in the next 90 days (counted from today), and the running contracts without a daily responsible. For information only: nobody is asked. The samples have two Solusi files, an earlier one and the newest, so the page compares them; 2 Concluded contracts end in the next 90 days (none in 30) and 1 has no daily responsible. |
| **Self-check** (hidden page) | How many checks give the result the HTML app records for the same samples: **38 of 39**, the 38 checks that are built (*Lifecycle review* is a manual card until build B8). Below: the numbers of the history (report dates, findings per date, new, solved, days to fix, open cases, reminders due, to escalate, replies to read, mine, not followed up), each with the app's number and *OK*. In Desktop you see hidden pages in the page list; in the published report they are hidden. |

At the foot of every page: the version, "invented samples" or "SharePoint", and when the data was refreshed.

In Sample mode "today" is **11 November 2026**, the date of the samples, so the ages on the Reports page and the
reminders due never change.

**The history in Power BI Desktop.** Desktop computes the history for the CI reports dated from **RangeStart** to
**RangeEnd** (parameters; 1 November 2026 to 1 January 2030). Keep RangeStart recent in Desktop (a month or two back):
each report date costs about as much as one refresh. In the workspace the incremental refresh sets the dates itself
(section 4).

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

**Ready for the real reports.** On invented reports as big as the real ones (3,230 CIs, 5,100 relationships, 1,020 EPO
systems, 1,190 Solusi and 1,700 ServiceNow contracts), a refresh takes about 100 seconds on the Windows test machine
(version 0.42.0, D283). The slowest tables are the hidden tables *Run* (the newest report and its cases, about 48 seconds)
and *HistoryRun* (the history, about 32 seconds for one report date). In the workspace *HistoryRun* computes only a
new or changed day. Your laptop may be slower or faster; the budget is 2 minutes.

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

The team's lists are read from the same site. **StateMode** picks them: `Sample` (the invented journal, replies,
settings, team and reviews inside the model), `SharePoint` (the five lists of section 5) or `None` (no lists: every case
is *New*). You can switch the reports to
SharePoint and keep the sample lists, or the other way round.

**Do not save a .pbix or the project into the repository after a SharePoint refresh**: it would hold real data.

## 4. Publish it for the team

You need a **Premium Per User** (PPU) licence, and so does every manager who opens the report. Do sections 3 and 5
first: the report reads the reports and the lists of the team's site.

1. **Make the workspace** (once). In the Power BI service (app.powerbi.com): **Workspaces → New workspace**, a name such
   as *SACM Workbench*. Under **Advanced**, **License mode**: **Premium per-user**. Add the other managers as
   **Viewer** (they read the report) and yourself as **Admin**.
2. **Set the parameters in Desktop** (Home → Transform data → Edit parameters): **SourceMode** `SharePoint`,
   **StateMode** `SharePoint`, **SharePointSite**, **ReportsFolder** and **ServiceNowAddress** as in section 3. Leave
   **RangeStart** and **RangeEnd** as they are: the service replaces them. Press **Apply changes** and check the pages.
3. **Publish.** Home → **Publish**, choose the workspace. Desktop sends the model and the report. The real addresses go
   with it, but only to the workspace, **never into this repository**.
4. **Sign in for the data** (once). In the workspace, open the semantic model *SACM-Workbench* → **Settings** → **Data
   source credentials**. For the SharePoint site: **Edit credentials**, **OAuth2**, privacy level **Organizational**, and
   sign in with your company account. Without it the refresh fails with "credentials missing".
5. **The first refresh.** Press **Refresh now**. The first one computes the history of every CI report in the folder of
   the last 24 months, so it takes longer: about one refresh per report date. Later refreshes compute only a changed or a
   new day of the last 7 (incremental refresh with *detect data changes*, D290). **Publishing again** (a new version of
   the report) starts the whole history again at its next refresh.
6. **Scheduled refresh.** Settings → **Refresh** → **Configure a refresh schedule**: on, time zone, and the times, for
   example every morning after the reports arrive (PPU allows up to 48 a day). Power BI only reads; nothing is sent
   (D269, D271). Turn on **Send refresh failure notifications** to yourself.
7. **The app for the team** (optional). In the workspace: **Create app**, give it a name, add the report, and under
   **Audience** the managers. They open it from **Apps**, always on the newest refresh. After you publish again, press
   **Update app**.

8. **Later: a test workspace.** Once the team uses the report every day, make a second workspace (for example *SACM
   Workbench test*) and a **deployment pipeline** (PPU has them): publish a new version to the test workspace first,
   look at it, then deploy it to the team's workspace.

Who is *Me*: the report finds the person signed in by their email in the list *SACM Team*. A manager whose email is not
there sees no *My work*.

## 5. Make the team's lists in SharePoint

The report reads five lists of the team's site (D291). Make them once, with these names and columns. The column names
must be exactly these (the internal name counts: type the name when you make the column, do not rename it later). The
report only reads them; stage 2 writes them with Power Apps and flows (D272). Until then you can add rows by hand to try
it. A list that is not there gives no rows: the report still refreshes, and every case is *New*.

In the site: **New → List → Blank list**, the name, then **Add column** for each column below. *Title* is there already.

| List | Columns (type) | One row is |
|---|---|---|
| **SACM Journal** | Title (the event id), At (Date and time), By (Single line: the email), ByName, Type, Keys (Multiple lines: one finding key per line), Text (Multiple lines), Ref, To, Cc, Subject, Kind, Channel, Person, Reason, ReviewOn (Date), RetireOn (Date), CheckId, CiKey, CiName: all Single line of text unless said | One action of a manager: a message, a reminder, an escalation, a note, fixed, not followed up, assigned, … (the events of [DATA-MODEL.md](../docs/DATA-MODEL.md) §3) |
| **SACM Replies** | Title (the reference, `SACM-…`), From, Received (Date and time), Subject, Body (Multiple lines, plain text), ConversationId (for the flows of stage 2; not read yet) | One reply that came to the shared mailbox |
| **SACM Settings** | Title (the setting, for example `reminderDays`), Value | One setting of the team. A number outside its range is not used, its default is. You may add column validation for the ranges. In B5 the report reads `reminderDays` and `maxReminders`; the other settings keep their defaults until build B8 |
| **SACM Team** | Title (the name), Email, Active (Yes/No) | One manager of the team |
| **SACM Reviews** | ReviewDate (Date), CiKey, CiName, Class, StatusInEpo, Answer, Note, By, At (Date and time) | One mark of the lifecycle review |

**By** is a text column with the email, not a Person column: a Person column comes to Power BI as a number, and the
flows of stage 2 write the email. **Body** is plain text, so the first line of a reply reads well.

The invented rows in `powerbi/samples/state/` show what a row looks like. Dates and times are shown in the local time of
the refresh.

## 6. What was assumed (questions still open)

The plan asks five questions. Until you answer, this build uses these answers:

| # | Question | What this build assumes |
|---|---|---|
| Q1 | Can the company laptop open GitHub, and is its Power BI Desktop current? | Both ways are described: the `.pbip` (section 1) and the `.pbix` (section 2); the preview options for an older Desktop. |
| Q2 | May a build thread ask you to run the Self-check on real data, with only counts reported back? | Yes, counts only. |
| Q3 | Publish from Desktop, or connect the workspace to GitHub? | Publish from Desktop (section 4). |
| Q4 | Do the four managers have PPU; are the Power Apps visual, canvas apps, flows and *Export data* allowed? | Yes to all; build B6 checks before it builds. |
| Q5 | Do the SharePoint lists live in the BAU channel's site, next to the Reports folder? | Yes: the lists are read from **SharePointSite** (section 5). |

## 7. For the developer

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
  at that size; put them in a SharePoint test folder and switch `SourceMode` to SharePoint (§3). `--history k` adds k earlier dates, to time the history.
