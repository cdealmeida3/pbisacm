# SACM Workbench in Power BI

This folder is the Power BI version of the Workbench (decision D268). It is a **Power BI project** (`.pbip`): the model
and the report are text files, so every change can be reviewed in a pull request. Power BI Desktop opens it like a
`.pbix`.

This is **build B8**, the last build of the plan: the Power BI report now replaces the HTML app. It reads the five kinds
of report, runs the checks of every CI report date (all 39 cards, with the same result as the HTML app), keeps the
history with an incremental refresh, reads the team's journal, replies, settings and team from four SharePoint lists,
and works out the cases as the app does. It can be published for the team (section 4). Three Power Apps sit in the
report (section 6): **SACM actions** (notes, statuses, assignments, *fixed* and the other actions of a case),
**SACM messages** (sending, reminders, escalations) and, new in B8, **SACM audit** (the lifecycle review and the
Settings screen). The design pass (builds D1 to D6, version 0.51.0) gave it the look of design A *Guided day*: the
navy rail, *My day* with the next steps, the email studio and the reply reader. Why it is built this way: decisions D268
to D330 in [DECISIONS.md](../docs/DECISIONS.md).

**For the team:** [GUIDE.md](GUIDE.md) shows every page with a picture and says what to do there. This README is for
setting the report up.

## 1. Open it on your Windows PC

You need Power BI Desktop (free, from the Microsoft Store or from Microsoft's download page).

1. Get the folder: unzip the zip from the project thread (it holds one folder, `SACM-Workbench-<version>`), or clone
   the repository (the folder `powerbi/`). **Updating from an earlier version:** see *Update to a new version* below.
2. Double-click `SACM-Workbench.pbip`.
3. Power BI Desktop opens the report. **The pages are empty the first time**: a project keeps no data in its files.
4. Press **Refresh** (Home ribbon). Desktop reads the invented sample reports that are inside the file. There is no
   sign-in and no file path: the samples are part of the model. After that the data stays until you close Desktop.

The report opens on the **My day** page. Look at:

| Page | What you should see |
|---|---|
| **My day** | The chip of the reports at the top right ("✓ 5 reports · 11 Nov · up to date"; a press opens Reports). Four numbers: for the samples 1 reply to read (Dee Owner), 1 person to escalate (Ada Example), 1 reminder due (Cy Keeper) and the findings new since the report before (the samples have two CI reports: 4 and 11 November). Below, **Your next steps**: one line per person, in the order of the team's rules (the reply first, then the escalation, the reminder, the people never asked). Select a step and press **Open person** (or right-click, **Drill through**, **Person**). At the right, **Since the last report** per section and **Waiting on others**. |
| **Work queue** | One line per person asked, with the next step, the open lines, the cards, the last message and who has them. The buttons at the top choose a status. The app *SACM actions* sits at the right (section 6.4). |
| **People** | One line per person with open lines, in the order of the team's rules: the next step, a bar of the open lines, the kinds of problem, the cards, the last time asked. **Find a person** searches the names. Select a person and press **Open person**. |
| **History** | Two tabs. **What happened**: the 22 events of the sample journal and the replies of the sample list, newest first, in the words of the app, with an icon per kind. The search box (a CI, a person, a card or a reference), the row of kinds and **Who** filter them. **Trend**: to solve, new and solved per report date, the days to fix, and to solve per support group and per class, for the two sample dates. |
| **Overview** | Four tiles: the open lines, the lines waiting on a person and the lines solved since the last report (each against 4 November, with a small line), and the reports with a chip each. **Where the work sits** (open lines by section and next step, darker is more, the total of each section at the right), **Open lines per report** (with a person, and the ones SACM fixes) and **Who holds the most** (select a person, **Open person**). |
| **Audit** | The summary of a period (**Period**, all days when none is chosen): the CI reports received, the problems found, closed and verified, the median days to an answer (*–* when the samples have no reply to an email of the period); found and closed per week; every escalation email of the period (the samples have none, so the box says so). **Open record** and **Auditor export** open two of its parts. On the navy rail its parts **Summary**, **Record**, **Export**, **Not followed** and **Lifecycle review** show under *Audit*. |
| **Audit record** | The verification record of the report date chosen (**Report date**). |
| **Audit export** | The export of a period (**Period of the export**): what was verified (2 findings solved on 11 November, with the days to verify), the actions of the team, the CI reports loaded, the findings per check and those new in the period, and what was open at the end. **More options (...)**, **Export data** on each table gives the Excel file. |
| **Not followed** | The exceptions (the 3 decisions to stop following: 2 still run, 1 ended on 10 November) and the cases not followed up. The app *SACM actions* sits at the right for **Follow again** (section 6.4). |
| **Lifecycle review** | The lifecycle reviews: the review of 11 November with its 7 CIs and their marks, and the next draw. The marks, then the evidence (who checked, the case, when it was asked); the app *SACM audit* sits at the right (section 6.8). |
| **Reports** | One line per kind of report (CI report, Relationship report, EPO systems report, Solusi contract file, ServiceNow contract report), the newest file of each, its date and age, and "Up to date", "Old" or "Missing" in colour. Below: the runs, the classes and the files that could not be read (none for the samples). |
| **Cards** | Two tabs. **Sections**: the three sections side by side, each card with a badge (the number to solve, a tick when OK) and a small line of its report dates. **List**: one row per check, as before. Select a card, then **Open card**. On the list: the three sections (Completeness, Correctness, Compliance) and one row per check in use, with its state in colour (red To solve, blue To check, green OK, grey Not tested), its number and *Partly tested* when a note says what it could not test. Grey cards say why. The row of states (*To solve*, *To check*, *OK*, *Not tested*) and **Topic** filter the cards. Below: the classes that are not checked yet. For the samples the built cards show 25 to solve, 3 to check, 8 OK and 2 not tested (hidden characters: a CSV cannot show them; *Offering parent*: the sample CI report has no Parent column), as in the HTML app. |
| **Card** (drill through) | On All cards select a card and press **Open card**. **Back**, the card and what it finds, then the tabs **To solve with a person** (the lines by the person to ask, then the kind of problem, with why a line waits), **SACM fix list** (with **Open in ServiceNow**), **To check** (the lines to check first) and **Export** (the columns of the SACM template: **More options (...)**, **Export data** gives the Excel file). At the right the app, *About this card* with the numbers, and **Open CI** for the line selected. A contract shows as `CT…: name`. |
| **Case** (drill through) | On a card or a person select a line and press **Open CI**. **Back**, the CI and its fields, then the tabs **Problems** (each problem, its state, why it waits, who is asked, the follow-up, **Open in ServiceNow**), **People** (who is asked, copied, who gets an escalation), **Relationships** (every CI above and below it, and whether the line counts), **Timeline** and **Replies**. The app *SACM actions* at the right (section 6.4). |
| **Person** (drill through) | On My day, People or Overview select a person and press **Open person**: the next step, the open lines, the kinds of problem, the last contact, everything open with them, **Prepare email** (opens Messages) and **Open CI**. Their replies are in the app *SACM actions* at the right (tab **Reply**, section 6.4). |
| **Mapping backlog** | One line per CI to map with its owner: why it is on the list, the stage of its class, the steps, its criticality and the next step ("Invite the owner to a mapping session", or why it waits). **Lines** filters To solve, To check, Waiting and Planned. Below: the **capability sheet** for Enterprise Architecture (its line says how many, or why it is empty: it needs the Relationship report), every Business Capability with what is above and below it (**Export data** gives the Excel file). For the samples: 4 CIs to map. The backlog has no drill through to the Case page: right-click the CI on the *Mapping backlog* card instead. The stage is the last one the journal sets for the CI (the Power App's *Mapping stage*), else the first stage of the class: in the samples one CI is at *Session held*. |
| **Contract changes** | The newest Solusi contract file against the one before it: new contracts, contracts no longer in the file, status changes and changed fields. Then the Concluded contracts that end in the next 30 and in the next 90 days (counted from today), and the running contracts without a daily responsible. For information only: nobody is asked. The samples have two Solusi files, an earlier one and the newest, so the page compares them; 2 Concluded contracts end in the next 90 days (none in 30) and 1 has no daily responsible. |
| **Self-check** (hidden page) | How many checks give the result the HTML app records for the same samples: **39 of 39**. Below: the numbers of the history (report dates, findings per date, new, solved, days to fix, open cases, reminders due, to escalate, replies to read, mine, not followed up), each with the app's number and *OK*. In Desktop you see hidden pages in the page list; in the published report they are hidden. |

Every page has the navy rail at the left: one item per page (a press opens it), the page in view lighter with a coral
line, the number of next steps beside *My day* and of open lines beside *Work queue*; at its foot the version, "invented
samples" or "SharePoint", and when the data was refreshed. At the top right of every page the chip of the reports (green when
every report is up to date, amber when one is old or missing; a press opens Reports). Under the title of every table and chart, a grey line says how many lines it shows, or why it shows
none ("No reply to read: a reply to a message of the team shows here."): a box is never empty without a word. Every page is
1280 × 720 and fits the window, *Case* too (build D3 put its parts on tabs). The tabs of All cards, Card, Case and
History are bookmarks: a press shows one table and keeps the card, CI or person of the page.

In Sample mode "today" is **11 November 2026**, the date of the samples, so the ages on the Reports page and the
reminders due never change.

**The history in Power BI Desktop.** Desktop computes the history for the CI reports dated from **RangeStart** to
**RangeEnd** (parameters; 1 November 2026 to 1 January 2030). Keep RangeStart recent in Desktop (a month or two back):
each report date costs about as much as one refresh. In the workspace the incremental refresh sets the dates itself
(section 4).

### Update to a new version

Since version 0.53.0 every zip unpacks into its own folder, `SACM-Workbench-<version>` (D339). Never unzip a new version
over an old folder: unzipping adds and replaces files but never deletes, so panels of the old version stay and sit on top
of the new pages.

1. **Close Power BI Desktop.**
2. If Windows marks the zip as downloaded: right-click the zip, **Properties**, tick **Unblock**, **OK**.
3. **Unzip the new zip next to your current folder**, so both sit in the same folder. For example `Documents\SACM\powerbi`
   (your folder of 0.52.0 or older) and `Documents\SACM\SACM-Workbench-0.53.0`.
4. In the new folder, **double-click `Update-Workbench.cmd`.** A window opens. It finds your previous folder (the newest
   older `SACM-Workbench-…` next to it, else `powerbi`), or asks you to paste its path. Answer `Y`.
5. It copies only what is yours, and says each step:
   - the values of the five parameters **SourceMode**, **StateMode**, **SharePointSite**, **ReportsFolder** and
     **ServiceNowAddress**, so you do not type them again;
   - the **Power Apps** and the **Refresh now** buttons you added (section 6), each to the same page, at the place this
     version keeps for it. They are in your folder only after step 13 of section 6.4.
   It copies nothing else, deletes nothing and never changes the previous folder.
6. Press a key to close the window. **Open `SACM-Workbench.pbip` in the new folder** and press **Refresh**.
7. When the new version works, publish it (section 4) and delete the previous folder.

**If the script cannot run** (the window says scripts are disabled, or IT blocks it), do the same by hand: open the new
`.pbip`, **Transform data → Edit parameters**, type the five values again, **Apply changes**. Publish, then add the apps
again in the service: on each page of the table of section 6.4, **Visualizations → Power Apps → Choose app** (your app,
not *Create new*), the same fields and filter as before, and the place of the table.

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
settings, team and reviews inside the model), `SharePoint` (the four lists of section 5) or `None` (no lists: every case
is *New*). You can switch the reports to
SharePoint and keep the sample lists, or the other way round.

**Do not save a .pbix or the project into the repository after a SharePoint refresh**: it would hold real data.

## 4. Publish it for the team

Do sections 3 and 5 first: the report reads the reports and the lists of the team's site. There are two ways: **4A** is
the way now, because you cannot make a workspace (D331). **4B** is for later, when IT can make a team workspace.

### 4A. My workspace (now)

Your **My workspace** is on shared capacity. Its rules (Microsoft, checked 19 Nov 2026): the semantic model may refresh
**8 times a day**, and refreshes started by a flow count too; a refresh must finish in **2 hours**. Your own **Refresh
now** on the semantic model in the service does not count. Section 6.5 gives the rule that makes the 8 last all day.

1. **Licences.** You and every manager need **Pro** or **Premium Per User** (PPU includes Pro). There is no workspace to
   make.
2. **Set the parameters in Desktop** (Home → Transform data → Edit parameters): **SourceMode** `SharePoint`,
   **StateMode** `SharePoint`, **SharePointSite**, **ReportsFolder** and **ServiceNowAddress** as in section 3. Leave
   **RangeStart** and **RangeEnd** as they are: the service replaces them. Press **Apply changes** and check the pages.
3. **Publish.** Home → **Publish** → **My workspace**. Desktop sends the model and the report. The real addresses go
   with it, but only to your workspace, **never into this repository**. Semantic model storage format: **small** (the
   default; *large* is for Premium only).
4. **Sign in for the data** (once). In My workspace, open the semantic model *SACM-Workbench* → **Settings** → **Data
   source credentials**. For the SharePoint site: **Edit credentials**, **OAuth2**, privacy level **Organizational**, and
   sign in with your company account. Without it the refresh fails with "credentials missing".
5. **The first refresh.** On the semantic model, press **Refresh now**. This button does not count against the 8. The
   first refresh computes the history of every CI report in the folder of the last 24 months: about 25 seconds for each
   report date. It must finish in 2 hours, so **keep at most 200 CI reports in the folder** (D336). About 290 fit on the
   test machine; 200 leave a third of the 2 hours spare, because the service can be slower. Move older reports into a
   sub-folder named `Archive` of the reports folder: the report never reads a sub-folder. Later refreshes compute only a
   changed or a new day of the last 7 (incremental refresh with *detect data changes*, D290). **Publishing again** (a
   new version of the report) starts the whole history again: press **Refresh now** in the service after each publish
   too.
6. **Scheduled refresh.** Settings → **Refresh** → **Configure a refresh schedule**: on; the **time zone of the team**
   (the same zone as in the flows, section 6.3); **one** time, after the morning reports arrive: `07:00`. Turn on **Send
   refresh failure notifications** to yourself. Add no other time: each one takes one of the 8 (section 6.5). Power BI
   only reads; nothing is sent (D269, D271).
7. **Share.** Open the report → **Share**. Type each manager's email (or a group, if Share offers it). Untick **Allow
   recipients to share this report**, and leave **Allow recipients to build content** off. They open it from **Home →
   Shared with me**; tell them to mark it as a favourite. After you publish again, the link stays the same.
8. **What My workspace cannot do:** no workspace app, no deployment pipeline, no test workspace, and nobody else can
   refresh or edit the report. The report, the model and the flows are tied to your account: if your account or licence
   stops, they stop. When IT can make a team workspace, use 4B.

### 4B. A team workspace (later)

You need a **Premium Per User** (PPU) licence, and so does every manager who opens the report.

1. **Make the workspace** (once). In the Power BI service (app.powerbi.com): **Workspaces → New workspace**, a name such
   as *SACM Workbench*. Under **Advanced**, **License mode**: **Premium per-user**. Add the other managers as
   **Viewer** (they read the report) and yourself as **Admin**.
2. **Set the parameters in Desktop** as in 4A step 2.
3. **Publish.** Home → **Publish**, choose the workspace.
4. **Sign in for the data** as in 4A step 4.
5. **The first refresh.** Press **Refresh now**. On PPU a refresh may take up to 5 hours, so the limit of 4A step 5 does
   not hold there. **Publishing again** starts the whole history again at its next refresh.
6. **Scheduled refresh.** As in 4A step 6. PPU allows up to 48 a day. The refresh rule of section 6.5 can stay (it costs
   nothing), or a new build can make the windows shorter.
7. **The app for the team** (optional). In the workspace: **Create app**, give it a name, add the report, and under
   **Audience** the managers. They open it from **Apps**, always on the newest refresh. After you publish again, press
   **Update app**.
8. **Later: a test workspace.** Once the team uses the report every day, make a second workspace (for example *SACM
   Workbench test*) and a **deployment pipeline** (PPU has them): publish a new version to the test workspace first,
   look at it, then deploy it to the team's workspace.
9. In the flows (section 6.3), the step *Refresh a dataset* then names this workspace instead of *My workspace*.

Who is *Me*: the report finds the person signed in by their email in the list *SACM Team*. A manager whose email is not
there sees nothing assigned to them on *Work queue*.

## 5. Make the team's lists in SharePoint

The report reads four lists of the team's site (D291; build B8 dropped *SACM Reviews*, D306). The flows use a fifth,
*SACM Refreshes* (build 0.52.0, D333), which the report does not read. Make them once, with these names and columns. The column names
must be exactly these (the internal name counts: type the name when you make the column, do not rename it later). The
report reads them; the Power Apps add rows to *SACM Journal* and *SACM Settings* (section 6), and the flow F3 to
*SACM Replies*; nothing changes or removes a row (D272, D296). You can also add rows by hand to try it. A list that is not there gives no rows: the report still refreshes, and every case is *New*.

In the site: **New → List → Blank list**, the name, then **Add column** for each column below. *Title* is there already.

**"This column already exists"?** A list has columns of its own that it does not show, such as *Type* (the file icon).
Do not show them and do not use them: they are not text columns. That is why the type of a journal row is the column
**EntryType** (build 0.52.0, D338). If you showed the hidden *Type* column, hide it again (**Show/hide columns**). If
SharePoint says that another column of this section already exists, tell the developer: the lint checks every name
against the names SharePoint has.

| List | Columns (type) | One row is |
|---|---|---|
| **SACM Journal** | Title (the event id), At (Date and time), By (Single line: the email), ByName, **EntryType** (the type of the event: message, note, status, …), Keys (Multiple lines: one finding key per line), Text (Multiple lines), Ref, To, Cc, Subject, Kind, Channel, Person, Reason, ReviewOn (Date), RetireOn (Date), CheckId, CiKey, CiName, Items (Multiple lines, plain text: the sample of a lifecycle review, build B8): all Single line of text unless said | One action of a manager: a message, a reminder, an escalation, a note, fixed, not followed up, assigned, the start of a lifecycle review and its marks, a change of the settings, … (the events of [DATA-MODEL.md](../docs/DATA-MODEL.md) §3). **Items**: if you made the list before B8, add this column |
| **SACM Replies** | Title (the reference, `SACM-…`), From, Received (Date and time), Subject, Body (Multiple lines, plain text), ConversationId (for the flows of stage 2; not read yet) | One reply that came to the shared mailbox |
| **SACM Settings** | Title (the setting, for example `reminderDays`), Value | One setting of the team. **The last row of a setting counts** (D308): the app *SACM audit* adds a row for each change, so the list keeps the history. A number outside its range is not used, its default is. The report reads the six numbers (section 6.8) and the settings of the messages (section 6.7) |
| **SACM Team** | Title (the name), Email, Active (Yes/No) | One manager of the team |
| **SACM Refreshes** | Title (the window, for example `2026-11-19 10:00`), By, Source: all Single line of text | One window of the refresh rule that a flow used (section 6.5): the flows F3, F5 and F6 add it before they refresh |

**SACM Refreshes needs one setting**, or two flows could both refresh in one window: **List settings → Title →
Enforce unique values: Yes** → OK (SharePoint then indexes the column; it asks first when it must). A second row with the
same Title is then refused, and the flow that tried knows the window is used. The flows add the rows with your
connection: the managers need no rights on this list, and nobody changes or removes a row.

**By** is a text column with the email, not a Person column: a Person column comes to Power BI as a number, and the
flows of stage 2 write the email. **Body** is plain text, so the first line of a reply reads well.

The invented rows in `powerbi/samples/state/` show what a row looks like. Dates and times of the lists are shown in the
time of the refresh: in Desktop your own, in the service UTC. That is why the rail says how old the data is ("refreshed
2 h ago", D335), not a clock time.

## 6. Stage 2: the actions (Power App and flows)

From build B6 a manager acts on the cases inside the report. The Power App **SACM actions** sits on the pages Card,
Case, Person and Work queue (the *Power Apps visual*). It gets the lines of the page, or the lines you selected, and offers
only what every selected line allows. **Save** adds **one row** to the list *SACM Journal*. It does not refresh the
report (D332): the report shows the change after the next refresh (section 6.5). In the meantime the app shows, under
**Done lately**, what the team did on these lines (it reads the list at once), and its top line says how old the
report's data is and how many changes are not in it yet (D334). **Refresh now** in the app asks the flow *SACMRefresh*
for a refresh.

The app never changes or removes a row (D272), never writes to ServiceNow, EPO or Solusi, and sends nothing. From build
B7 a second app, **SACM messages**, sits on the page *Messages* and sends the messages, reminders and escalations
(section 6.6). From B8 a third app, **SACM audit**, sits on the page *Audit*: the lifecycle review and the Settings
screen (section 6.8). Build D5 (0.50.0) redrew the three apps with the modern controls, made *SACM messages* the email
studio, gave *SACM actions* a reply reader, and added the flow *SACMDraft* (F7) for Outlook drafts. Why it is built this
way: D294 to D309, D315 to D317, D326 and D327.

The source is in `powerbi/apps/`. You make the app and the flows **once, by hand**, in the company tenant, with the steps
below: a Power Apps visual must create its own app inside the tenant (Microsoft's rule), so the repository cannot hold a
ready app.

| File | What it is |
|---|---|
| `apps/actions.json` | Every action: its name, the event it adds to the journal, what it asks. The model decides which lines have it (the query *fnCaseActions*, compared with the HTML app on every pull request) |
| `apps/sacm-actions/App-Formulas.fx` | **Generated.** The named formulas of the app, to paste into **App → Formulas** |
| `apps/sacm-actions/Src/ActionsScreen.pa.yaml` | The screen of the app, to paste into Power Apps Studio |
| `apps/sacm-actions/Src/App.pa.yaml` | **Generated.** The same formulas, as Power Apps keeps them in its source |
| `apps/sacm-messages/App-Formulas.fx` | **Generated.** The named formulas of the app *SACM messages* (section 6.6) |
| `apps/sacm-messages/Src/MessagesScreen.pa.yaml` | The screen of the app *SACM messages* |
| `apps/sacm-messages/Src/App.pa.yaml` | **Generated.** Its formulas, as Power Apps keeps them |
| `apps/sacm-audit/App-Formulas.fx` | **Generated.** The named formulas of the app *SACM audit* (section 6.8) |
| `apps/sacm-audit/Src/AuditScreen.pa.yaml` | The screen of the app *SACM audit* |
| `apps/sacm-audit/Src/App.pa.yaml` | **Generated.** Its formulas, as Power Apps keeps them |
| `apps/refresh.json` | The refresh rule (section 6.5): the windows, the scheduled time, the 8 a day. `npm run powerbi:generate` writes it into the apps and the model; a change of it is a new build |
| `apps/flows.json` | The seven flows below, step by step. `npm run powerbi:lint` checks that they only refresh through the rule of section 6.5, file, send exactly what a manager pressed Send or Test on, or make the Outlook draft a manager asked for |

What the app offers (the words are those of the HTML app; a check file can give its own):

| Action | Adds to the journal | Offered on |
|---|---|---|
| **Note** | a note | every line |
| **Status**, **Request number**, **Stop following** | a status; a request number (also the *incident number* of a review line); a decision to stop following (reason, review date in 6 months, note) | open lines and lines to check, but not the SACM fix list |
| **Assign** | the member it is assigned to (the menu starts on you: this is *Take*) | open lines and lines to check |
| **Follow again** | the end of the decision to stop following | lines not followed up |
| **Fixed** (*Deleted* on some cards), **Undo the mark** | the mark of the SACM fix list | lines of a fix list |
| **Ask the owner**, **Back to SACM** | the review step of D183 to D185 | the cards that have it |
| **Retirement date**, **Stage**, **The process does not exist** | the planned retirement date; the mapping stage; the process mark | the cards that have it |
| **Hand over my work** | your open lines among the selected ones, to another member | when you have open lines there |
| **Note about the person** | a note about the person asked | when every line is about one person |
| **Share out** | one *assign* per member: the free groups of the card, the biggest first, each to the active member with the fewest CIs so far (D24, D303) | when a line belongs to a free group and the team has two active members or more |

### 6.1 Check first (question Q4)

Before you build the rest, check these five things, and tell the project thread the answers (yes or no only):

1. Every manager has a **Pro** or **Premium Per User** licence (section 4A).
2. In Power BI (Desktop or the service), the **Visualizations** pane shows the **Power Apps** and the **Power Automate**
   icons. If not, the Power BI admin has turned the visuals off in the tenant settings.
3. In Power Apps (make.powerapps.com), **Create → Blank app → Blank canvas app** works for you.
4. In Power Automate (make.powerautomate.com), you can make an **Instant cloud flow** with the **Power BI** action
   *Refresh a dataset*. If a data policy (DLP) blocks SharePoint and Power BI together, ask IT.
5. On a table of the report, **More options (...)** → **Export data** gives a file.

### 6.2 The lists' permissions

The managers may **add** rows to *SACM Journal*, but not change or delete them: the journal is the team's history. You
(the owner of the site) keep full control. Do this once, on the team's site:

1. **Site settings → Site permissions → Permission levels → Add a permission level.** Name: `SACM add only`. Tick only:
   - List permissions: **Add Items**, **View Items**, **Open Items**, **View Versions**.
   - Site permissions: **View Pages**, **Browse User Information**, **Use Remote Interfaces**, **Use Client Integration
     Features**, **Open**.
   Leave **Edit Items** and **Delete Items** empty. Save.
2. **Make a group** for the managers (Site permissions → Create group), for example `SACM managers`, with the four
   managers, and the permission level **Read**.
3. Open the list **SACM Journal → List settings → Permissions for this list → Stop Inheriting Permissions**. Then
   **Grant Permissions**: the group `SACM managers`, level **SACM add only**. Remove *Edit* and *Contribute* for other
   groups of the site, but keep yourself (and the site owners) at **Full Control**.
4. Still in **List settings → Versioning settings**: **Create a version each time you edit an item** on. A changed row
   then keeps its old version.
5. **SACM Settings**: the same as steps 3 and 4: stop inheriting, grant `SACM managers` the level **SACM add only**,
   versioning on. The app *SACM audit* adds a row for each change; nobody needs to edit a row.
6. The other lists (*SACM Replies*, *SACM Team*) stay **Read** for the managers. The flow F3 adds the replies with
   your connection. Keep the managers' emails in *SACM Team* correct: the apps find *Me* by it.

The app adds the row as the manager signed in: the list shows who (*Created by*), and the column *By* holds the same
email.

### 6.3 The flows

Make them in Power Automate, in the same environment as the app (normally the default one). The names must be exactly
these: the app calls *SACMRefresh* by its name.

**The gate** (D333). The three flows that refresh (F5, F6 and F3) do it through the same steps, so the report refreshes
at most once in each window of section 6.5. Each expression goes in the **fx** box of the field; the copy pack has each
one with a Copy button. In place of `<the time zone of the team>` pick your Windows time zone name, the same zone as the
scheduled refresh (it stays in the flow, never in the repository).

| Step | Kind | What to put |
|---|---|---|
| **Now** | Data Operation → **Compose** (rename it `Now`) | `convertFromUtc(utcNow(), '<the time zone of the team>')` |
| **Minutes** | **Compose** (`Minutes`) | `add(mul(int(formatDateTime(outputs('Now'), 'HH')), 60), int(formatDateTime(outputs('Now'), 'mm')))` |
| **Open** | Control → **Condition** (`Open`): the expression on the left, *is equal to*, `true` on the right | `and(greaterOrEquals(outputs('Minutes'), 480), less(outputs('Minutes'), 1080))` |
| **Window** | **Compose** (`Window`), in the **True** branch of *Open* | `concat(formatDateTime(outputs('Now'), 'yyyy-MM-dd'), ' ', formatDateTime(addMinutes(startOfDay(outputs('Now')), add(480, mul(div(sub(outputs('Minutes'), 480), 120), 120))), 'HH:mm'))` |
| **Create item** | SharePoint → **Create item**, the team's site, List Name **SACM Refreshes**, after *Window* | Title: the output of *Window*. By and Source: see each flow |
| **Refresh a dataset** | Power BI → **Refresh a dataset**, after *Create item* | Workspace **My workspace** (section 4A), Dataset *SACM-Workbench* |

*Create item* fails when the window is used already (the unique Title of section 5): then the flow does not refresh.

**F5 SACMRefresh** (the button **Refresh now** of the three apps, and only that button):

1. **Create → Instant cloud flow.** Name `SACMRefresh`, trigger **When Power Apps calls a flow (V2)**. No inputs.
2. **Concurrency control stays off** on the trigger (D337). Power Automate refuses to save a flow that answers the app
   with concurrency control on (*InvalidConcurrencyConfiguration*). The gate is the lock: two presses in one window
   still give one refresh.
3. The steps of the gate: **Now**, **Minutes**, **Open**; in the True branch **Window**, **Create item** (By:
   `triggerOutputs()['headers']['x-ms-user-email']`, Source: `app`) and **Refresh a dataset**.
4. The answers: **Power Apps → Respond to a PowerApp or flow**, with four **Text** outputs `Result`, `At`, `By` and
   `Message`, in this order. Add it in five places (an empty output stays empty):
   - In the **False** branch of *Open*: Result `closed`.
   - After *Refresh a dataset*: Result `started`, At `formatDateTime(outputs('Now'), 'HH:mm')`, By as in *Create item*.
   - Beside it (**+ → Add a parallel branch** after *Refresh a dataset*), **Configure run after: has failed** only:
     Result `refused`, Message `coalesce(outputs('Refresh_a_dataset')?['body']?['error']?['message'], 'no reason given')`.
   - After *Create item*, a parallel branch with **Configure run after: has failed** only: **SharePoint → Get items**,
     List Name **SACM Refreshes**, Filter Query `Title eq '@{outputs('Window')}'`, Top Count `1`. Then a **Condition**
     `Found`: `greater(length(coalesce(body('Get_items')?['value'], json('[]'))), 0)` is equal to `true`, with
     **Configure run after: is successful** and **has failed** (when the list is missing, Get items fails too). In its True branch: Result `taken`,
     At `formatDateTime(convertFromUtc(first(body('Get_items')?['value'])?['Created'], '<the time zone of the team>'), 'HH:mm')`,
     By `first(body('Get_items')?['value'])?['By']`. In its False branch: Result `error`.
5. No **Delay**: the app gets its answer in a few seconds.
6. **Save.** Then on the flow's page: **Run only users → Edit**: the group `SACM managers`; for the **Power BI** and the
   **SharePoint** connection choose **Use this connection** (your own). The managers may not refresh your report with
   their own account, and have no rights on *SACM Refreshes*.

**F6 SACM refresh now** (the **Refresh now** button on the pages *My day* and *Reports*):

1. **Create → Instant cloud flow.** Name `SACM refresh now`, trigger **Power BI button clicked**. Concurrency `1`.
2. The steps of the gate. **Create item**: By `coalesce(triggerOutputs()?['headers']?['x-ms-user-email'], 'button')`,
   Source `button`.
3. After *Create item*, a parallel branch with **Configure run after: has failed** only: Control → **Terminate**,
   Status **Succeeded** (a used window is not an error). No Delay. Save.
4. In the report (Desktop or the service, edit mode), on the page *My day*: **Visualizations → Power Automate**. Put it
   on the left rail, in the place the page keeps free for it: X `16`, Y `604`, width `156`, height `40` (**Format →
   General → Properties → Size and position**). Add one field to it (any, for example *Runs → ReportDate*: the flow does
   not use it). **... → Edit → pick the flow** `SACM refresh now` → **Apply**. **Format → Button → Text**: `Refresh now`.
   The rule is written above it (*Refresh rule*): the button cannot show the flow's answer, so the line says why a press
   changed nothing.
5. Copy the button (Ctrl+C) to the page *Reports* (Ctrl+V), at the same place.
6. Share the flow: on its page, **Run only users**: the group `SACM managers`, and **Use this connection** for Power BI
   and SharePoint, as in F5.

**F2 SACMSend** (the button **Send** of the app *SACM messages*):

1. **Create → Instant cloud flow.** Name `SACMSend`, trigger **When Power Apps calls a flow (V2)**. Add six **Text**
   inputs, in this order: `To`, `Cc`, `Subject`, `Body`, `Csv`, `FileName`. Make `Csv` and `FileName` optional (**...
   → Make the field optional**): a short email has no file.
2. On the trigger: **... → Settings → Concurrency control**: on, **Degree of Parallelism** `1`.
3. **New step → Office 365 Outlook → Send an email from a shared mailbox (V2).** Original Mailbox Address: the shared
   SACM mailbox. To: the input *To*. CC: the input *Cc*. Subject: the input *Subject*. Body: the input *Body* (the
   email is HTML: in the editor press **</>** first, then put the input).
4. **Show advanced options → Attachments**: press **T** (*Switch to input entire array*) and put this expression (the
   file of a long email, D314; none for a short one):
   `if(empty(triggerBody()?['text_4']), json('[]'), createArray(json(concat('{"Name":"', triggerBody()?['text_5'], '","ContentBytes":"', base64(triggerBody()?['text_4']), '"}'))))`.
   The names `text_4` and `text_5` are the inputs *Csv* and *FileName* (the 5th and 6th): if Power Automate named them
   otherwise, look at the trigger's outputs (**Peek code** on the trigger) and use those names. Nothing else: no
   other text, no other file.
5. **Save.** **Run only users**: the group `SACM managers`; for **Office 365 Outlook** choose **Use this connection**
   (yours, which may send as the shared mailbox). The flow sends exactly what the app gives it, and records nothing: the
   app adds the journal rows itself after the flow answers (D301).

**F4 SACMTest** (the button **Test to me**): as F2, with only the inputs `Subject`, `Body`, `Csv` and `FileName` (the
last two optional), and the same **Attachments** with the names of these two inputs (`text_2` and `text_3`). In **To** put the expression
`triggerOutputs()['headers']['x-ms-user-email']`: the email of the manager who pressed Test. Nobody else gets it, and
the app records nothing. Run only users and connection as in F2.

**F7 SACMDraft** (the button **Outlook draft** of the app *SACM messages*, D315): it makes the email as a draft in the
Drafts folder of the manager who pressed, with From set to the shared SACM mailbox, and sends nothing. The manager
checks it in Outlook and presses Send there.

1. **Create → Instant cloud flow.** Name `SACMDraft`, trigger **When Power Apps calls a flow (V2)**. Two **Text**
   inputs: `Message` and `Csv` (make `Csv` optional). **Concurrency control off**: the flow answers the app (step 3),
   and Power Automate refuses concurrency control then (D337).
2. **New step → Office 365 Outlook → Send an HTTP request.** URI `https://graph.microsoft.com/v1.0/me/messages`,
   Method `POST`, Content-Type `application/json`. Body: the expression
   `json(replace(replace(triggerBody()?['text'], '%%CSV%%', base64(coalesce(triggerBody()?['text_1'], ''))), '%%FROM%%', '<the address of the shared SACM mailbox>'))`.
   Write the real address of the mailbox in place of the words in `<>` (it stays in the flow, never in the repository).
   The app gives the draft as JSON in *Message* (subject, HTML body, To, Cc, the file named after the reference); the
   flow only puts in the file and the mailbox.
3. **New step → Power Apps → Respond to a PowerApp or flow.** One **Text** output, `Link`, with the expression
   `body('Send_an_HTTP_request')?['webLink']`. The app opens this link: the draft in Outlook on the web.
4. **Save.** On the flow's page: **Run only users → Edit**: the group `SACM managers`, and for **Office 365 Outlook**
   choose **Provided by run-only user**. Each manager then signs in once with their own account, so the draft goes into
   *their* Drafts, not yours.
5. Each manager needs **Send as** on the shared mailbox (Exchange admin center → the mailbox → **Delegation → Send as**;
   ask IT). Without it the draft is made, but Outlook refuses to send it from the SACM mailbox.

**F3 SACM - File replies** (made for the HTML app, [SETUP.md](../docs/SETUP.md) §2.5; change it so):

1. Trigger **When a new email arrives in a shared mailbox (V2)**, the shared SACM mailbox, **Subject Filter** `[SACM-`,
   Include Attachments *No*. Concurrency `1`.
2. **Content Conversion → Html to text**, Content: the *Body* of the email.
3. **SharePoint → Create item**, the team's site, List Name **SACM Replies**. Title: the reference of the subject, with
   the expression `concat('SACM-', first(split(last(split(triggerOutputs()?['body/subject'], '[SACM-')), ']')))`. From:
   *From*. Received: *Received Time*. Subject: *Subject*. Body: the *Plain text content* of step 2. ConversationId:
   *Conversation Id*.
4. The steps of the gate, after step 3. Its **Create item** (in *SACM Refreshes*): By `reply`, Source `reply`. Then, as
   in F6 step 3, a **Terminate** (Succeeded) when that *Create item* has failed. A reply that comes in a free window shows
   on *My day* about 2 minutes later; in a used window it waits for the next refresh. The app *SACM actions* reads the
   replies from the list at once (the reply reader), so nobody waits for it there.
5. If the old flow still saves the replies as files in the team folder, take that step out: the report reads the list.

**F1 SACM - File reports** (made for the HTML app, [SETUP.md](../docs/SETUP.md) §2.3): it saves the attachments of each
report email in the reports folder, and **does not refresh** (D332). If you added *Refresh a dataset* to it in an
earlier build, delete that step. The morning reports come before the scheduled refresh (section 4A step 6); a report
that comes late is *Old* on the page *Reports* until somebody presses Refresh now. Set its concurrency to `1`.

Only F2 and F4 send, and only when a manager presses Send or Test to me in the app; F7 only makes a draft, when a
manager presses Outlook draft. None of the flows runs on a timer.

**When a refresh is refused or fails.** The scheduled refresh may start late (Power BI allows up to an hour) and meet a
refresh of the first window: Power BI runs one refresh of a model at a time and refuses the other. F5 then answers
*refused* with Power BI's words, and the window is used; the refresh that runs brings the new data anyway. A refresh
that fails (for example a report Power BI cannot read) also uses its window: the next window, or your own Refresh now
in the service, refreshes again. Nothing is lost: the rows are in the lists.

### 6.4 The app

Make it in the **Power BI service** (app.powerbi.com): Desktop gives Power Apps Studio data only when the app is made,
not while you edit it. Publish the report first (section 4).

1. Open the report, **Edit**. Go to the page **Case**. **Visualizations → Power Apps**. Place it on the right, beside
   the tabs: **Format → General → Properties → Size and position**: X `956`, Y `84`, width `300`,
   height `620`. (Each page keeps a free place for its app; the table at the end of this section lists them all.)
2. With the visual selected, add these fields of **CaseLines** to **Power Apps data**, in this order: *Key*, *CheckId*,
   *CiName*, *Status*, *AssignedTo*, *Person*, *Actions*, *Stages*, *StageId*, *ExceptionReason*, *RetireOn*,
   *ContactName*, *ShareTo* (from build B7), *LastRef*, *Step* and *Card* (from build D5, for the reply reader), and last
   the measure **About → Report at** (from build 0.52.0: the time of the report's data, for the top line of the app). An
   app made earlier gets a new field when you add it and edit the app from the visual, then paste the new
   `App-Formulas.fx` and `ActionsScreen.pa.yaml`. For each column: the arrow next to it → **Don't summarize**.
3. In the visual's filters (**Filters on this visual**): drag the measure **CaseLines → For the app**, *Show items when
   the value* **is** `1`, **Apply filter**. The app then gets only the lines of the case shown.
4. In the visual: **Create new**. Power Apps Studio opens with a new app that is bound to the report.
5. In Studio, **Data → Add data → SharePoint** → the team's site → tick **SACM Journal**, **SACM Team**, **SACM
   Settings** and **SACM Replies** → Connect. (*SACM Settings* from build B8: the app reads the months of a decision to
   stop following there. *SACM Replies* from build D5: the reply reader reads the replies there. An app made earlier:
   add the list, then paste the new `App-Formulas.fx`.)
6. **Power Automate** (the icon on the left) → **Add flow** → **SACMRefresh** (only the button **Refresh now** calls it).
7. **Settings → Updates → New**: turn on **Modern controls and themes** (D317; the screens use them). Then **Tree view →
   App**, property **Formulas**: select all, then paste the whole file `apps/sacm-actions/App-Formulas.fx`.
8. Open `apps/sacm-actions/Src/ActionsScreen.pa.yaml` in Notepad, select all, copy. In Studio, **Tree view**, select
   *Screen1*, press **Ctrl+V**: Studio adds the screen *ActionsScreen*. Delete *Screen1*, and set **App → StartScreen**
   to `ActionsScreen`.
9. The app check (the warning triangle) should show no error. A formula that Studio reads differently from the
   repository: copy the change back into `formulas.fx` or the YAML, and tell the project thread.
10. **Settings → General → Data row limit**: `2000`. *Done lately* reads the newest rows of the journal up to that
    number. Then **File → Save as** `SACM actions`, and **Publish**. **Share** it with the group `SACM managers`. Each manager agrees
    to the SharePoint connection the first time they open it.
11. Back in the report: the visual shows the app. **Save** the report.
12. **Copy the visual** (Ctrl+C) to the pages **Card**, **Person** and **Work queue** (Ctrl+V). It keeps the same app. Set
    its size and position as in the table below. On *Work queue* change the filter of the visual to **CaseLines → Queue
    lines** *is not blank*, so it gets every open line of the page (the free ones too, for **Share out**).
13. **Once, after you add or change an app**, keep the visuals in your own folder, so that the next update carries them
    (section 1, *Update to a new version*, D339): in the service, **File → Download this file → A copy of your report**;
    open the `.pbix` in Desktop; **File → Save as**, type **Power BI project (\*.pbip)**, name `SACM-Workbench`, into
    **your current folder** (the one of section 1), over its files. Then delete the downloaded `.pbix`. Do not send these
    files to the repository: the visuals hold the ids of the company's apps.

How to try it: on the Case page of a test CI, tab **Actions**, pick **Note**, type a word, **Save**. The app says
*Saved*; the line appears under **Done lately** at once, with *not in the report yet*, and the top line counts one
change. Press **Refresh now**: the app says the report refreshes now (or who asked already in this window). About
2 minutes later press **Refresh** in the report's top bar: the tab *What happened* of **History** shows the note, and the
top line says everything is in the report.

**The reply reader** (tab **Reply**, D327): it opens first when a line of the page has a reply to read. Pick the reply
(the newest of each reference of the lines); its lines are ticked. Then:

- **Mark answered**: the status *Answered* on the ticked lines, with your note if you wrote one. The reply counts as read.
- **Waiting until** a date: the status *In progress* (*Fix in progress*) and the note "Waiting until <date> (reply of
  <name>): <your note>". The reply counts as read.
- **Add note**: only a note. The reply stays to read.

On the page *Card* (300 high) the tab says to open the person: the reply reader needs the height of *Person* or *Case*.

What to know:

- The visual gives the app **1,000 lines at most** (Microsoft's limit). At 1,000 lines the app cannot tell whether there
  are more, so **Save is off**: select fewer lines, or filter the page.
- **If you change the fields** of the visual, edit the app from the visual (**... → Edit**), or the app does not see the
  change.
- The visual works in **Edge** and **Chrome**, not in Firefox.
- **Selecting rows** in a table of the page (Ctrl+click) filters the visual too: the app then acts only on those lines.
- **Until the refresh**, the menu offers what the lines allowed at the last refresh (a line under the menu says so). To
  avoid a second row by mistake, Save waits when the journal has a row of the same kind on one of these lines since the
  report's data, by anyone: the app says who and when, and **Save anyway** turns Save on (D334). A note never waits.
- **The top line** of the app: "Report data from 07:05. 3 changes on these lines since then are not in it yet." The
  time is in your browser's time. When it asks you to select lines, the visual gave the app no line. When Studio shows an
  error on *'Report at'*, the visual lacks that field: add it (step 2) and edit the app from the visual.
- **Hand over my work** hands over your open lines among the lines the app gets. Use it on the page **Work queue**: there
  the app gets all your open work.
- **Assign** to *Nobody (free)* makes the lines free again.
- A case the newest report no longer shows (solved, or not followed up) is not on these pages. **Follow again** for it
  is on the page **Not followed**: copy the visual there too (Ctrl+V), at the right of the table *Cases not followed
  up*, and change its filter from *For the app* to **CaseLines → Status** *is* `Not followed
  up`. Select lines of that table (the app then gets only those), pick **Follow again**, **Save**.

**Where each app goes.** The pages keep these places free (the lint of the report refuses a visual over them). Set
them in **Format → General → Properties → Size and position**:

| Page | App | X | Y | Width | Height |
|---|---|---|---|---|---|
| Case | SACM actions | 956 | 84 | 300 | 620 |
| Card | SACM actions | 956 | 84 | 300 | 300 |
| Person | SACM actions | 956 | 84 | 300 | 568 |
| Work queue | SACM actions | 956 | 84 | 300 | 620 |
| Not followed | SACM actions (Follow again) | 956 | 84 | 300 | 620 |
| Messages | SACM messages (the email studio) | 224 | 84 | 1032 | 620 |
| Lifecycle review | SACM audit | 956 | 84 | 300 | 620 |
| My day, Reports | the button **Refresh now** (F6, a Power Automate visual, section 6.3) | 16 | 604 | 156 | 40 |

An app placed before build D1 (0.46.0) keeps its old place: move it to the place above. Build D2 (0.47.0) renamed the
page *My work* to *Work queue*: an app already on it stays where it is. **Build D3 (0.48.0) moved the app of Case**:
the page is now 720 high with tabs, so move its app to X `956`, Y `84`, width `300`, height `620`. **Build D5 (0.50.0)
moved two apps**: on *Messages* the app fills the page (X `224`, Y `84`, width `1032`, height `620`; the table of drafts
and the kind buttons left the page), and on *Person* it is taller (height `568`; the table of replies left the page, the
app reads them).

### 6.5 How many refreshes (the refresh rule, D332 and D333)

In My workspace the semantic model may refresh **8 a day** (section 4A), the scheduled ones and the ones a flow starts
together. A Save does not refresh. The rule, in the words the pages *My day* and *Reports* show under their button:

> Refresh now: once every 2 hours, 08:00 to 18:00. The report refreshes at 07:00.

| What | When | Counts against the 8 |
|---|---|---|
| The scheduled refresh (section 4A step 6) | 07:00, after the morning reports | 1 |
| **Refresh now** in an app (F5), on *My day* or *Reports* (F6), or a reply that comes in (F3) | the first ask in each window: 08:00, 10:00, 12:00, 14:00 and 16:00, each to 2 hours later (the last ends at 18:00) | at most 5 |
| Your own **Refresh now** on the semantic model in the service | any time | 0 |
| Kept free: a refused or failed refresh, a retry of Power BI | | 2 |

So a day uses **at most 6 of the 8 a day**, even when every window is used. Outside 08:00 to 18:00 nothing refreshes on
demand. The numbers live in `powerbi/apps/refresh.json`; a test checks that the windows and the scheduled times leave
2 of the 8 free. A change of the rule is a new build (the apps, the flows and this text change with it).

What **Refresh now** in an app answers (the flow F5):

| Answer | It means |
|---|---|
| *The report refreshes now* | This press used the window. About 2 minutes later, press **Refresh** in the report's top bar: the visuals do not reload by themselves |
| *Lee asked for a refresh at 10:05* | The window is used already: the answer says who and when, and when the next window starts. Your work is saved, and the apps show it |
| *Refresh now works from 08:00 to 18:00* | Outside the windows. The scheduled refresh comes the next morning |
| *Power BI did not start the refresh* | Power BI refused it (for example a refresh was running already), with its words. The window is used |
| *The refresh could not be asked* | The flow did not answer (for example the list *SACM Refreshes* is missing). Look at the flow's run history |

The button on *My day* and *Reports* (F6) cannot show an answer: when a press changes nothing, the line above it says
why. Do **not** test the limit by pressing Refresh now many times: in My workspace that uses the day's 8.

### 6.6 The app SACM messages: the email studio (builds B7 and D5)

The page **Messages** holds the app **SACM messages**, the email studio (D326). It fills the page under the title (X 224,
Y 84, 1032 × 620). It lists every email ready to send: first messages, reminders that are due and escalations, one per
person and kind (D300, D314). The words are those of the HTML app, and the check of every pull request compares them
with it.

- **On the left, the list.** One line per email: who gets it, the kind (*First*, *Reminder*, *Escalate*, or *Sent*), the
  CIs and the parts. The tabs above it (*All*, *First*, *Reminder*, *Escalate*) filter it. Press a line to open it.
- **In the middle, the email as it will arrive**, with its reference and your name. A long email shows each table's first
  lines (the setting `rowsInEmail`, default 10) and carries the full list as a CSV file (the chip above it says so).
- **On the right, the fields.** From is the shared SACM mailbox. **To**, **Cc** and **Subject** can be changed. The box
  under them says whether a colleague wrote to this person, or about these cases, in the last 24 hours (D302): then
  the buttons wait until you tick **Send anyway**.
- **Send** (the main button): the flow *SACMSend* sends the email from the shared mailbox, with its file. Then the app
  records it on the cases of every part (and gives you the cases nobody had). It does not refresh the report: the email
  stays in the list, marked **Sent** for every manager, and leaves it after the next refresh. **Next email** opens the
  next one not sent.
- **Test to me**: the flow *SACMTest* sends it, with its file, to you only. The cases are not changed.
- **Outlook draft**: the flow *SACMDraft* puts the email, with its file, into **your** Drafts in Outlook, with From set
  to the SACM mailbox (D315), and opens it. Change it there and press Send in Outlook. Then answer **Sent from
  Outlook?** in the app: *Yes* records it on the cases.
- **Teams**: opens a Teams chat with the person and the first message. Then **Did you start the chat?**: *Yes* records
  it. Teams is off for an email to a mailbox, for a long list (a file or several parts) and for more than 15 people:
  the button says why.
- A grey button always says why under it (for example *Fill in To first.*).

Make it once, as the app of section 6.4:

1. In the report (the service, **Edit**), page **Messages**: **Visualizations → Power Apps**, at X 224, Y 84, 1032 × 620.
   Add these fields of **Drafts**, each **Don't summarize**: *DraftId*, *Ref*, *Kind*, *KindLabel*, *To*, *ToName*,
   *Cc*, *Subject*, *Body*, *Chat*, *Keys*, *NewKeys*, *FreeKeys*, *CiCount*, *About*, *NobodyAbove*, *Mailbox*,
   *AssignedTo*, and from build D5 *Html*, *Csv*, *Summary*, *EmailSubject*, *EmailId*, *HtmlLength*, *CsvLength*, and
   from build 0.52.0 the measure **About → Report at**.
2. **Create new**. In Studio: **Settings → Updates → New**: turn on **Modern controls and themes**. **Data → Add data →
   SharePoint** → **SACM Journal** and **SACM Team**. **Power Automate → Add flow** → **SACMSend**, **SACMTest**,
   **SACMDraft** and **SACMRefresh** (for the button **Refresh now** at the top).
3. **App → Formulas**: paste `apps/sacm-messages/App-Formulas.fx`. Paste `apps/sacm-messages/Src/MessagesScreen.pa.yaml`
   on *Screen1* (Ctrl+V), delete *Screen1*, **App → StartScreen** `MessagesScreen`.
4. **Settings → General → Data row limit** `2000`. **Save as** `SACM messages`, **Publish**, **Share** with `SACM
   managers`. Save the report.

**An app made in build B7**: in the report, move and resize the visual to X 224, Y 84, 1032 × 620 (the table and the
kind buttons are gone from the page). Add the new fields of step 1, then **... → Edit**. In Studio: turn on the modern
controls (step 2), add the flow **SACMDraft**, refresh the flows **SACMSend** and **SACMTest** (they have new inputs:
**Power Automate → ... → Refresh**), paste the new `App-Formulas.fx`, delete *MessagesScreen*, and paste the new
`MessagesScreen.pa.yaml`. Save and publish.

How to try it: in *SACM Team* put yourself as a member. On a test email, change **To** to your own address, press
**Test to me**: the email comes to you, with its file when the list is long. Press **Outlook draft**: the draft opens in
Outlook, From the SACM mailbox; answer *No* in the app. Then **Send**: it comes again, and the list shows it *Sent* at
once. After the next refresh (**Refresh now** at the top, then **Refresh** in the report's top bar) the tab *What
happened* of **History** shows the message, and the email leaves the list.

What to know:

- The visual gives the app 1,000 drafts at most.
- A reminder keeps the reference of the first message, so the reply finds the case (D5). A new email gets its
  reference when you open it in the list.
- Until the refresh, an email that anyone sent since the report's data stays in the list, marked *Sent* with who sent it
  and when, and its buttons off (the app reads the journal, D334). The top line counts the journal rows since then.
- **A long email** (D313, D314): its parts are one email on its first part (*EmailId* points to it), each table shows its
  first `rowsInEmail` lines, and the file `<reference>.csv` has every line (it opens in Excel).
- **A cut email.** The Power Apps visual may pass a very long text cut: about 32,000 characters is the limit people
  report for the visuals of Power BI. The app compares what it got with *HtmlLength* and *CsvLength*: when the email or
  its file is shorter than the report says, Send, Test to me and Outlook draft stay off and say so. Tell the project
  thread when you see it; a lower `rowsInEmail` makes the email shorter (the file stays whole in the report).
- There is no **Copy** and no `mailto:` link any more (D316): both lose the tables and the file.

### 6.7 The settings the messages read

The messages read these rows of *SACM Settings* (Title, Value). A row that is not there keeps the default of the HTML
app ([DATA-MODEL.md](../docs/DATA-MODEL.md) §3, the settings).

| Title | Value |
|---|---|
| `portalLink` | The link of the Service Portal |
| `signature` | The team line under a message (default `SACM team`) |
| `epoOwnerName`, `epoOwnerEmail` | The EPO inventory owner |
| `procurementName`, `procurementEmail` | The Procurement mailbox (default name `Procurement`) |
| `procurementLeadName`, `procurementLeadEmail` | The Procurement lead (no escalation when empty) |
| `request.<id>.name`, `request.<id>.link` | A request of the Service Portal: its name and link. The ids: `owned-by-update`, `managed-by-update`, `support-group-update`, `modify-service-offering`, `criticality`, `service-mapping` |
| `team.<id>.name`, `team.<id>.people` | A team responsible for records (D195): its name, and its people as `Name <address>; Name <address>` |
| `rowsInEmail` | The lines a table of an email shows before "and N more in the attached file" (D314): a whole number from 1 to 100, default 10 |

The real links and addresses go into the list only, never into the repository.

### 6.8 The app SACM audit: the lifecycle review and the Settings (build B8)

The app **SACM audit** sits on the page **Lifecycle review**, at the right of the tables of the reviews. It has two tabs.

**Lifecycle review** (D306, the review of D192):

- **New review** draws the sample from the newest CI report and adds one row to *SACM Journal* (type *review*, the
  CIs in the column *Items*). The draw is the same for the same report: the table shows it under *The next review (not
  started)* before you press. One review a day.
- Tick CIs of the newest review, pick **Same in EPO**, **Not the same** or **Not in EPO**, add a note (what EPO says),
  **Save the mark**. One journal row per CI; the last mark of a CI counts. *Not the same* opens a case on the card
  *Lifecycle review*.
- **Mark N same in EPO** marks at once the CIs whose status the EPO systems report shows the same, with the note "Same
  status in the EPO systems report of …".
- The table *Lifecycle* of the page has every review, newest first, with the evidence columns of the HTML app (group,
  EPO status, result, note, who checked and when, the case, its first message, reminders and escalation).
  **Export data** gives the file for the auditors.

**Settings** (D308): the six numbers of the team, each with its range and default. Change a number and press **Save
the settings**: one row per changed number goes to *SACM Settings*, and one row to the journal says what changed. A
number outside its range cannot be saved.

| Setting | Range | Default | What it does |
|---|---|---|---|
| Working days before a reminder is due (`reminderDays`) | 1 to 30 | 3 | When a reminder is due |
| Reminders before Escalate (`maxReminders`) | 0 to 10 | 2 | When a case goes to the escalation |
| Days before a report counts as old (`staleDays`) | 1 to 60 | 3 | *Old* on the Reports page |
| Months until "Not followed up" is reviewed (`exceptionMonths`) | 1 to 36 | 6 | The review date of a decision to stop following |
| Days before Under retirement is too long (`underRetirementDays`) | 1 to 730 | 90 | The card *Under retirement too long* |
| Days before Ready is too long (`readyDays`) | 1 to 730 | 90 | The card *Ready too long* |

Make it once, as the app of section 6.4:

1. In the report (the service, **Edit**), page **Lifecycle review**: **Visualizations → Power Apps**, at the right of the
   tables (X 956, Y 84, 300 × 620). Add these fields of **ReviewLines**, each **Don't summarize**: *Review*, *IsNext*, *IsCurrent*,
   *ReviewDate*, *Report*, *ReportDate*, *Group*, *CiKey*, *CiName*, *ClassLabel*, *ClassName*, *EpoId*, *Status*,
   *EpoStatus*, *Agrees*, *Result*, *ResultLabel*, *EpoDate*, *Order*, and from build 0.52.0 the measure **About →
   Report at**.
2. **Create new**. In Studio: **Data → Add data → SharePoint** → **SACM Journal**, **SACM Team** and **SACM Settings**.
   **Power Automate → Add flow** → **SACMRefresh** (for the button **Refresh now** at the top).
3. **App → Formulas**: paste `apps/sacm-audit/App-Formulas.fx`. Paste `apps/sacm-audit/Src/AuditScreen.pa.yaml` on
   *Screen1* (Ctrl+V), delete *Screen1*, **App → StartScreen** `AuditScreen`.
4. **Settings → General → Data row limit** `2000`. **Save as** `SACM audit`, **Publish**, **Share** with `SACM managers`.
   Save the report.

How to try it: press **New review**. The app shows the review of today at once ("not in the report yet"); you can mark
it before the refresh. Tick one CI, pick *Same in EPO*, **Save the mark**: the line shows the mark, with *not in the
report yet*. On the tab **Settings**, change the reminder days to 4 and save. After the next refresh (**Refresh now**,
then **Refresh** in the report's top bar) the table of the page shows the review and the mark, and the page *My day*
counts the reminders with 4 days.

## 7. What was assumed (questions still open)

The plan asks five questions. Until you answer, this build uses these answers:

| # | Question | What this build assumes |
|---|---|---|
| Q1 | Can the company laptop open GitHub, and is its Power BI Desktop current? | Both ways are described: the `.pbip` (section 1) and the `.pbix` (section 2); the preview options for an older Desktop. |
| Q2 | May a build thread ask you to run the Self-check on real data, with only counts reported back? | Yes, counts only. |
| Q3 | Publish from Desktop, or connect the workspace to GitHub? | Publish from Desktop (section 4). |
| Q4 | Do the four managers have Pro or PPU; are the Power Apps visual, canvas apps, flows and *Export data* allowed? | Yes to all. Check it with section 6.1 before you build the rest of section 6. |
| Q5 | Do the SharePoint lists live in the BAU channel's site, next to the Reports folder? | Yes: the lists are read from **SharePointSite** (section 5). |

## 8. For the developer

The parts and the commands are in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), part "The Power BI report". In short:

- `powerbi/m/*.pq` are the Power Query queries, written by hand. `npm run powerbi:generate` writes them, with the samples,
  the check files and the reference files, into `SACM-Workbench.SemanticModel/definition/expressions.tmdl`, and writes
  the theme. `npm test` fails when either is out of date.
- The tables (`definition/tables/*.tmdl`) and the pages (`SACM-Workbench.Report/definition/`) are written by hand, and
  may be changed in Power BI Desktop and committed.
- `npm run powerbi:lint` checks the model with Microsoft's library (needs .NET 8), the queries, the report files, the
  references and the colours. The workflow "Power BI" runs the queries on Windows with Microsoft's Power Query test tool
  and compares the result with the TypeScript logic of `src/core/`.
- **The zip for Carlos** (D339): `node tools/powerbi/release.ts <folder> --label R1` writes
  `SACM-Workbench-PowerBI-R1-<version>.zip` from the files of `powerbi/` that git keeps, all inside the folder
  `SACM-Workbench-<version>/`, with `update.json` for `Update-Workbench.ps1` (the parameters it carries and the places of
  `APP_SLOTS` and `FLOW_SLOTS`). Make it from `main` after the merge. The test `tests/tools/powerbi/release.test.ts` runs
  the script in PowerShell on an invented previous folder (GitHub's Linux runner has `pwsh`).
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
