# Changes

What changed in each version, in words for SACM managers. Newest first. The version is in `package.json`; the app shows the same number. Every version was built and merged as one pull request (number in brackets). Pull request and commit numbers up to version 0.38.0 refer to the private archive of this repository.

## 0.41.0 — The Power BI report, the contract checks (B4)

- **38 checks work in the Power BI report.** New in B4: *Not in Solusi*, *To clear by hand*, *Contract status*, *Upload check*, *For Procurement* and *Contracts to fix in ServiceNow*. They find the same lines as the HTML app on the samples. On the SACM fix list of *Not in Solusi*, the note says why a contract to delete is still linked. The Self-check page says 38 of 39: *Lifecycle review* is a manual card.
- A contract is a case of its own, as in the app (D287): the Card, Case and Person pages show it with its contract owner.
- **Card page:** the lines by kind of problem, with the contract owner. For *For Procurement* the title says that the one email to the Procurement mailbox has one table per kind of problem (the email itself comes in build B7).
- **New page *Contract changes*** (D288): the newest Solusi file against the one before it (new contracts, contracts no longer in the file, status changes, changed fields), the Concluded contracts that end in the next 30 and 90 days, counted from today, and the running contracts without a daily responsible. For information only: nobody is asked.
- The time limit of D283 now also reads the contract files at real size (D289). TIME_LINE
- The HTML app works as before: no check, number or message changed.

## 0.40.0 — The Power BI report is fast enough for the real reports (speed build)

- **The refresh at the size of the real reports takes about 43 seconds** on the test machine (invented reports with 3,230 CIs, 5,100 relationships and 1,020 EPO systems). In B3 it did not finish in 14 minutes. Nothing else changes: the same pages, the same numbers; the Self-check page still says 32 of 39.
- The checks are computed once per refresh, in a hidden table, and the result tables are made from it (D284). Common patterns are decided without the slow walk (D285). The reports are read faster.
- **A time limit on every change** (D283): the workflow *Power BI* measures the refresh at real size on each pull request and fails above 2 minutes, or above 1 minute for one table. It also checks that the counts at that size are those of the HTML app.
- The HTML app is not changed: no check, number or message changed.

## 0.39.0 — Ready to be public

- **The repository is public** (D286). The history up to 0.38.0 stays in a private archive.
- **The invented data has a new theme:** a library (members, the book index, fines, events) instead of the old one. The same CIs, problems and messages, with other words. The team tests use other invented first names.
- **The process-type tag** is now known by its last words: a tag that ends with *facing* or *facing process* after a first word, or *Internal process* / *Internal BP*. The real tags still match; *Facing* alone does not.
- The texts say "the company" where they named the industry.
- The checks of every pull request run on GitHub's own runners only, and also check the private words that must never come back.

## 0.38.0 — The Power BI report, the relationship and EPO checks (B3)

- **32 checks work in the Power BI report.** New in B3: *Relationship missing*, *Too many partners*, *Wrong relationship type*, *Relationship entered twice*, *Application ≠ Instance*, *Offering owner ≠ Service owner*, *Offering parent*, *EPO ≠ ServiceNow*, *EPO update not arrived*, *Process stage* and *Mapping backlog*. They find the same lines as the HTML app on the samples. The contract checks stay grey until build B4.
- **Case page:** the chip *changed in EPO*, *What EPO already has* when EPO already holds the person asked for (then nobody needs to be asked), and **Relationships**: every CI above and below, its class, status and type, and whether the line counts for the checks.
- **Mapping backlog page:** one line per CI to map with its owner, why, its stage, the steps of its class, its criticality and the next step; **Lines** filters To solve, To check, Waiting and Planned. Below: the capability sheet for Enterprise Architecture, with *Export data*.
- **Self-check page:** 32 of 39 checks give the recorded result.
- Until build B5 every line of the backlog is at the first stage of its class (D282).
- **Too slow at real size:** on invented reports as big as the real ones (3,230 CIs, 5,100 relationships) the checks did not finish in 14 minutes; the target is under 2 minutes. The samples are fine. A later build makes it faster ([powerbi/README.md](../powerbi/README.md) §3).
- The HTML app works as before: no check, number or message changed.

## 0.37.0 — The Power BI report, the CI checks (B2)

- **21 checks work in the Power BI report**: the 14 rule checks of the CI report (people, support group, descriptions, names, hidden characters, tags, criticality) and the code checks *Name not standard*, *Name format*, *EPO ID*, *Ready too long*, *Under retirement too long*, *Criticality above the parents* and *No criticality reaches the CI*. They find the same lines as the HTML app on the samples. The other 18 cards stay grey with "not built yet" until builds B3 and B4.
- **Cards page:** each card has its state (To solve, To check, OK, Not tested), its number (CIs, or lines on a SACM fix list) and *Partly tested* when a note says what could not be tested. The section lines count cards: "Completeness: 3 to solve · 1 to check · 5 not tested"; a card for a quiet day counts as *when there is time*. The cards are in the order of the app, and **Topic** filters them. Below the cards: the classes that are not checked yet.
- **Card page** (right-click a card, *Drill through*, *Card*): the lines to solve with who is asked and why (Owned by, Managed by, Supported by), the lines to check, waiting or known, the SACM fix list with **Open in ServiceNow**, and a table with the columns of the SACM template for *Export data*.
- **Case page** (drill through on a CI) and **Person page** (drill through on the person asked): every problem, its state, who is asked, who is copied and who gets an escalation.
- **The address of ServiceNow** is a parameter, `ServiceNowAddress` (D279): type the team's address in Power BI, never in the repository.
- **Self-check page:** 21 of 39 checks give the recorded result.
- Until build B5 the report holds the newest CI report only: no history, new or solved yet (D278).
- The HTML app is not changed: no check, number or message changed.

## 0.36.0 — The Power BI report, first build (B1)

- **A Power BI report** (D268): the folder `powerbi/` is a Power BI project. Double-click `SACM-Workbench.pbip` in Power BI Desktop: it opens with the invented samples inside, with no sign-in. How to open it, make a `.pbix` and switch to the SharePoint folder: [powerbi/README.md](../powerbi/README.md).
- **Reports page:** one line per kind of report with its newest file, its date, its age and "Up to date", "Old" or "Missing"; the runs, the classes, and the files that could not be read.
- **Cards page:** the three sections and every check in use, all grey with "detector not built yet". The checks come in the next builds.
- **Self-check page** (hidden): how many checks give the recorded result of the HTML app. Today 0 of 39.
- **Samples or SharePoint** (D271): one parameter switches; the site and folder are typed in Power BI, never in the repository.
- The HTML app is not changed: no check, number or message changed.

## 0.35.0 — The real names are back

- **The real reports are read again** (D266): the app knows the real names of EPO and Solusi, their report columns and their status words, and the real process-type tag values. An EPO systems report is recognised again, a real status is no longer "not known", and a Business Process with the real process-type tag is no longer flagged.
- **Screens and messages** name EPO and Solusi again, so owners and Procurement read the names they know.
- **The team folder** reads as before 14 Nov 2026: its folders, fields, settings and check ids have their earlier names again.
- **For the developer:** the words that stand in for a real value on purpose (invented people, addresses, IDs) are listed in [PLACEHOLDERS.md](PLACEHOLDERS.md). `npm run placeholders` shows where they are, and `npm test` fails on a placeholder that is not listed.
- No check, number or message changed, apart from the names above.

## 0.34.0 — The pages and the last check (build L5 of the new look)

- **My work** (D247): **Replies to read** comes first, under its own heading, each reply with **Reply**. Then **Assigned to me**, a table with one line per person: *Asked*, *Cards*, *CIs*, *Follow-up*, *State* and *Next step* (the same step as the group on the card: **Email**, **Remind 1 of 2**, **Escalate to** (name), **Reply**, and **Assign**). "Nothing for you now" shows only when the page is empty.
- **Activity** (D248) is a table: the icon, *Time*, *Who*, *What* and *About*. **Search**, **Everyone**, **All days**. "So far: 3 emails · 2 reminders · 0 Teams chats" is in the head of the page. The time is no longer cut.
- **A person's page** (D249) has the step of a group and **Assign** at the top. **Contract changes** folds its lists like the folds of a card, and its button is **Export**.
- **Audit** (D250): the tabs are **Record**, **Export**, **Not followed** and **Lifecycle**. Shorter buttons: **Export**, **Print**, **Add CI**, **Follow again**, **New review**, **Mark 4 same**. The report list is as wide as its text.
- **The last check** (D251): the look check now measures every page, also counts the words on each button and the contrast of every text, at four sizes, light and dark. No screen cuts a text any more.
- No check, number, message or team-folder file changed. The card *Lifecycle review* now says "Audit, Lifecycle".

## 0.33.0 — Lighter hand work on SACM lists (build W5 of "Who solves each card")

- **One row per record** (D242): a SACM list shows each CI (or contract) once, with every change to make on it under its name: the value now and the value to set. You open the record once in ServiceNow and set every value. **Fixed** marks every line of the record; the tick box ticks the record. The pages count records ("Showing 1 to 50 of 122 CIs").
- **Copy** (D243) next to a value to set copies the exact text to type: a person, a name, a Business Service, a relationship type, the whole description of EPO, the account to set on a contract. An instruction such as "Keep one" has no **Copy**.
- **ServiceNow** (D244) on each record opens it in ServiceNow, in a new tab: the CI by its name, the relationship rows between the two CIs, the contract by its number. First, once: *Settings* → *Mailboxes* → **ServiceNow** → **Address** (a new line of the set-up list). The case panel has **Copy** and **ServiceNow** too, on the lines SACM fixes.
- **Share out** (D245) on a SACM list gives the records nobody has taken to the managers in turn, like the groups of an owners card. The initials show on the record; **Mine** in Filter shows yours.
- No check, number or message changed. The saved runs get two new fields on a fix line (`value`, `relatedTo`); older runs show no **Copy** until the next report.

## 0.32.0 — The windows and the messages (build L4 of the new look)

- **The email window** (D236, D237): the title is "Email: (name)". One footer for the draft in view: **More** (**Copy**, **Test**) at the left, **Cancel**, **Outlook** and **Send from mailbox**. After **Outlook**: "Sent?" **Yes** or **No**. A long message is copied by **Outlook** itself; you only paste it. Two drafts or more are tabs. The head of a draft says "5 CIs · 8 cards"; the preview shows its first lines and **Show all**. One count: "Add 9 points from 7 other cards". To and Cc say who and why in a short hint; the paragraph at the top is gone.
- **The email itself** (D235): the column *Operational status* is now **Status**, and no column name wraps in Outlook. This is the only change to the text of the messages.
- **A colleague wrote not long ago** (D238): one line and three buttons, **Open**, **Give to (name)** and **Write anyway**.
- **The other windows** (D239) have one footer order: an extra action at the far left, **Cancel**, the main button at the right. Teams: **Email**, **Cancel**, **Teams**, then "Did you start the chat?" **Yes**. Choose reports: one line per file (name, type, date, **Loaded**), **Choose files**, **Load 2**, **Older files**. **Remove this report?** **Remove**. **Stop following** shows the review date in words. **Mark 3 fixed?** **Mark 3**. **Share out 2 free groups?**. **Hand over** (only when something is yours) with **Hand over to (name)**. The outbox: one line and the table.
- **Settings** (D240): the parts are **Set-up** (with its number), **Me**, **Team** and **Mailboxes**. "Not saved yet" shows in the footer as soon as a field changes, and closing with changes asks first (**Keep editing**, **Close**). Short labels in groups: "Procurement mailbox" with **Name** and **Email**; "Reminder after 3 working days". **Back to the start screen** is **Start screen**; **Add to the team** is **Add**.
- No check, number or team-folder file changed apart from the message text above. The look check also measures the email menu, the Teams window, each part of Settings and Choose reports.

## 0.31.0 — The open card and the case panel (build L3 of the new look)

- **The head of a card** (D223): on pale pink, the name, its state and one sentence of what to do. **Details** shows the rest: the name of the check, the subject, where the fix is made, the longer text. The numbers are at the right in short words: *To solve, People, Free*; *To fix, Fixed*; *To check, CIs*; *Problems, Contracts*.
- **One toolbar on every card** (D224): **Search** and **Filter** (a class, **Reminders**, **Mine**) at the left, the actions at the right (**Share out**, **Export**, **Mark N fixed**, the step of the mailbox). A grey button says why next to it.
- **The head of a group** (D226): named after the person asked ("Cy Keeper", *Managed by*) or **Nobody to ask** with the reason; one line of memory ("Asked 3 times · last 2 Nov · no reply"); one state chip; the initials of whoever has it; the step, **Teams** and **More** (**Note**, **Take**, **Assign to**, **Stop following**, **Export**). Only the first group starts open, so only one button is navy.
- **Shorter words** (D225, D228): **Email**, **Remind 1 of 2**, **Escalate to**, **Reply**, **Fixed**, **Save note**, **Back to SACM**, **Teams**, **Export**. The statuses read *Asked*, *In progress* and *Marked fixed* on the screen; the journal keeps the old names, so older versions read the same folder.
- **One table part** (D229): the name looks like a link with its class on the same line, the whole line opens the case, the header stays in view. An empty field that is the problem says **Missing** in red; other empty fields show "–".
- **SACM lists are ticked** (D233): a tick box on each line and **Tick every line shown**; **Mark N fixed** marks what is ticked, after a question. A marked line is teal, with who, when and **Undo**.
- **What is not for today is folded** (D230): **To check**, **Waiting**, **Known**, **Done**, with their numbers.
- **The mailbox card** (D231) has its step at the right of the toolbar, with **Export** and **More**.
- **The case panel** (D232): the name on up to two lines; each problem a white box with a bar in the colour of its state; a bar at the bottom with "2 of 4 ticked", **Stop following**, **Status** (statuses only), **Assign** and the main step. The note field is at the top of the timeline. The case panel cuts no text now.
- On *Above parent* the button is **Mapping done: ask owner** (the check file says it). No number, message or team-folder file changed.

## 0.30.0 — My day, the header and the cards (build L2 of the new look)

- **New first page, My day** (D216): four boxes of the team's daily work. *Replies to read* (**Reply** opens the case), *Reminders due* (**Remind** opens the email), *To escalate* (**Escalate to** the next person), *New since the last report* (**Open**). Each box shows 3 rows and **All N**. **Hide** folds My day into one line of counters; the choice stays on this computer (D217).
- **A new header** in one row: the name with the report date and number of CIs, the pages My day, My work (with its number), Backlog, Activity and Audit, then **Load**, **More** (Choose reports, Refresh), Settings with the set-up steps left, the theme and the initials of the manager. On a laptop the pages show their icon only, the open page keeps its word.
- **The Reports line** is under the title of My day: "Reports 5 reports · 12 Nov · fresh" with **Show**. After a load the toast says **Reports loaded** with **Details**; the message of the load shows by itself only when something needs a look.
- **One filter row**: Search, the subjects, one **Filter** menu (To solve, Mine, Reminders, Escalations, New) with the filters that are on as chips, and **Cards** or **Lines** (36 px lines in two columns).
- **Calmer cards** (D220): name, state, one number and at most one fact ("+3 new", "2 reminders", "5 free"). The explanation is the tooltip. A section header counts cards: "3 to solve · 1 to check · 1 when there is time" (D219). Beside an open card, the other cards are a plain list of names.
- **Start screen**: one button, **Open folder**, and the links **Open files** and **Try the demo**.
- **Words** (D218): *To check* (was To review), *When there is time* (was Clarify when there is time), *Load*, *Choose reports*, *Check again*, *Record*, *Changes*, *Remove*, *Missing*. *So far: N emails* moved to the Activity page.
- **Text is 15 and 13 px** (D221). Labels that wrap or are cut on the measured screens: 42 to 0.
- No check, number, message or team-folder file changed. Two new keys in the browser storage: `sacm-workbench.cards-as` and `sacm-workbench.my-day`.

## 0.29.0 — The new look, the base (build L1)

- **A new look, chosen by Carlos** (D207): navy buttons, the Workspace icons (the icons of the Service Mapping Workspace), the font Nunito Sans packed in the file (D208), a warm light page and a dark mode with the same colours. The logo is a magnifier over a grid, also in the browser tab. Nothing moved on the screens: the same buttons in the same places. The next builds (L2 to L5) draw the screens again: My day, the Lines switch, the open card, the windows and the pages.
- **One meaning per colour** (D210): teal is *Marked as fixed* (it was amber, the colour of a reminder); the status *Fixed* is teal and *Fix in progress* blue. Coral is decoration only: the logo, the line under the open page and the open tab (D209).
- **One meaning per icon**: Remind is a ringing bell, Escalate an arrow up, Not followed up a circle with a slash, Share out split arrows, Hand over a door with an arrow, More three bars.
- **No capitals and no three dots**: the headings (Today, Completeness, Reports, the parts of the case panel and the Audit page) are in sentence case; *Pick reports*, *Assign to*, *Browse for files*, *Hand over my work* and others lost their three dots; a long text in a timeline shows **Show all** (D213). No text under 12 px.
- **Every button is 32 px high.** Selected is never a navy button: a filter chip shows a tick, a tab a coral line, a choice a light fill (D212). Settings, close and the theme are icons alone, with their word as a tooltip; the tooltip also shows on keyboard focus, and replaces the tooltips of the browser.
- **Tests of the look** (D214): the source has no raw colour, capitals, three dots, text under 12 px or browser tooltip, every icon is of the set, every text colour has a contrast of 4.5:1 or more, light and dark. A new browser check opens the demo at four sizes, light and dark, and measures them. A list of today's cut texts may only shrink.
- No check, number, message or team-folder file changed. The page is 822 KB (the font adds about 56 KB).

## 0.28.0 — The mapping backlog (who solves each card, build W4)

- **New page *Mapping backlog*** (D200), reached from **Backlog** in the header and from its card: one case per CI that must be mapped, with every reason on one line. A CI is on it when it is a Service Instance without a Business Application, a Business Application without a Service Instance or a Business Process, a Business Service without a Business Process, a Business Process with nothing below (in Ready only with CIA values), or a Business Application tagged To be deleted that is still Operational. These rules left *Relationship missing*; *Process stage* keeps only "make it Operational".
- **Stages** (D201): To plan, Session held, Classified, Application linked, Process linked; each class has its own steps. A manager sets the stage in the case. The stage never closes a case: a later report does.
- **Invite** (D202) writes one email to the owner to plan a 30-minute mapping session, with no list of questions. Reminders and escalation as usual.
- **The process does not exist** (D203) marks a Business Service or Business Application case; **Tell Process Management** writes one message to the team with every marked CI not told yet.
- The criticality lines *Above parent* and *No criticality reaches the CI* of a backlog CI show on its line and in its case (D204).
- **Capability sheet** (D205): one CSV file with every Business Capability, its capabilities above and below, its processes below, description, tags, owner, manager and hidden characters.
- On the real reports of 11 Nov 2026: the backlog has 385 CIs (84 to solve, 61 waiting, 240 planned). *Relationship missing* went from 365 lines to 42. To solve went from 1,794 to 1,864 (daily work 1,421 to 1,491): the 63 applications tagged To be deleted were on no card since W1, and 7 Business Services without a process were a review. The capability sheet lists 243 capabilities.
- New journal events `stage` and `no-process`, new fact field `mapping`, new run field `capabilities`. Older runs open as before; older versions ignore the new values.

## 0.27.0 — Process Management as contact (who solves each card, build W3)

- **A problem on the record of a Business Process goes to the Process Management team** (D195), never to the process owner or manager: *Owner or manager missing*, *Inactive person*, *Owner = Manager*, *Description*, *Duplicate names*, *Tag missing*, *Deleted but operational*, *Under retirement too long*. On each card these lines are one group, **Team: Process Management**.
- **The team in Settings**: *Requests and mailboxes* has a part **Process Management** with the name the message greets and its people (name and email, several). The set-up list has the line **The Process Management team has people**. Without people the message cannot be written, and the group says so.
- **One message to the whole team** (D196): every person in To, nobody copied, one table per kind of problem, never split. The team is asked to tell SACM the right value; SACM updates ServiceNow. There is nobody above a team: after the reminders, the manager types who gets the escalation.
- **New card *Process stage*** (D197), a SACM list: a Business Process in Ready with its CIA values is **To map** (plan a mapping session with the process owner) or **Mapped** (make it Operational). A process without CIA values waits for the BIA: no line, a note says how many. Needs the Relationship report.
- ***Tag missing* is a SACM fix list** (D198): SACM sets the process type tag, also in Ready, and asks Process Management only with **Cannot tell which type: ask Process Management**.
- The mapping of a process (*Relationship missing*) stays SACM's work with the process owner, and the criticality cards are not sent to anybody new (D199).
- On the real reports of 11 Nov 2026: the 5 *Owner = Manager* lines on Business Processes now go to Process Management instead of 5 process owners (owner groups on that card 23 → 21). *Process stage* has 2 lines (1 to map, 1 to make Operational); 1 process waits for the BIA. To solve went from 1,792 to 1,794 (daily work 1,419 to 1,421). *Tag missing* has no line today.
- New team setting `teams`, new reference file `record-teams.json`, new message field `askByTeam`, new contact `team:<id>` on a fact. Older runs and settings open as before; an older version that saves the settings drops the team people.

## 0.26.0 — The source first (who solves each card, build W2)

- **People lines of a Service Instance are compared with EPO before anybody is asked** (D190): *Owner or manager missing*, *Inactive person*, *Owner = Manager* and *Supported by*. When EPO already names another person, the line waits and nobody is asked: SACM copies the person (service mapped), or the sync brings it. When EPO is wrong too, the owner is asked, and the line and the message say what EPO holds ("EPO names the same person as System Owner", "empty in EPO too").
- **Leftovers** (D191): a role that is empty in EPO while ServiceNow still shows a person, because the sync never clears a field. The owner is asked to fill the role in EPO. Nobody clears it by hand, so it left *EPO ≠ ServiceNow* and *EPO update not arrived*. A leftover with a person who is still active is a new line.
- **Lifecycle review** (D192): *Not the same* is a SACM line. Copy the status of EPO (service mapped), or raise an incident for the sync (not service mapped). The owner is written to only with **EPO itself looks wrong: ask the owner**.
- **Contracts** (D193): for an inactive contract owner or Procurement partner, the app looks for an active account with the same name. Found: the line on *Contracts to fix in ServiceNow* names the account to set. Not found: the person left, and the line goes to *For Procurement* (new tables **Contract owner left** and **Procurement partner left**).
- The list under a card is now headed **Waiting (nobody is asked yet)**; each line says why it waits.
- Without an EPO systems report, the people lines are not compared, and the load says so.
- On the real reports of 11 Nov 2026: to solve went from 1,796 to 1,792 (daily work 1,420 to 1,419). 4 *Supported by* lines wait because EPO already has the person; 31 leftovers are asked with the right words; *EPO update not arrived* went from 58 lines to 29 and *EPO ≠ ServiceNow* from 19 to 17. Of the 157 lines about inactive contract people, 142 name the active account to set and 15 (4 people) go to Procurement.
- A finding can carry `source`, and a row of the run inventory ends with the service mapped flag. Older runs open as before; older versions ignore the new values.

## 0.25.0 — Stop the wrong emails (who solves each card, build W1)

- **Parked classes** (D179): a Business Capability in Ready gets no line on any card, not even waiting. API, Application and Technology Management Service are not used yet and are not checked. The first screen, the load message and the verification record say it in one grey line each ("236 Business Capabilities in Ready are not checked yet"). *Capability Ready too long* is switched off.
- **A Business Application is a copy of its Service Instance** (D180): *Application ≠ Instance* now also compares the description and the name, and is live. Applications leave the owner, description, name and lifecycle cards; their owners are no longer emailed about them.
- **Supported by has its own card** (D181), on Service Instance and Service Offering. *Owner or manager missing* and *Inactive person* look only at Owned by and Managed by.
- **Daily work first** (D182): *Supported by*, *Ready too long* and *Under retirement too long* say **Clarify when there is time**. They are calm, after the daily cards, and are not in the red number, *Only red*, *Today* or the scores. Their lines can still be emailed.
- **SACM looks first** on *EPO ID* (**Must be created in EPO: ask the owner**) and *Duplicate names* (**Two real CIs: ask the owner**) (D183, D184).
- **Criticality** (D185, D186): *BIA missing* sends no email; a process in Ready gives no line; an Operational process without CIA values and without a BIA tag is a SACM line. *No justification* is a SACM list; only the automatic text goes to the owner, on the new card *Automatic justification only*.
- **Offerings made by the integration** (D187): messages about Managed by, Supported by and the Support group name the ServiceNow request, never EPO.
- *Ready too long* no longer looks at Business Process; *Deleted but operational* no longer at Business Application (D188).
- On the real reports of 11 Nov 2026: to solve went from 2,247 to 1,796, of which 1,420 are daily work and 376 can wait. Waiting went from 798 to 175.
- New check field `priority`, new reference file `parked-classes.json`, and runs keep `parked`. Older runs open as before; older versions ignore the new fields.

## 0.24.0 — Settings, Audit and the last polish (whole-app plan, build 5)

- **Settings in four parts**: *Set-up*, *Me*, *Team rules*, *Requests and mailboxes*, in a wider window. Personal and team settings are no longer mixed (D177).
- **A set-up list**: a tick per line for the team folder, the team list, the request links ("4 of 6 links pasted") and the Procurement mailbox and lead. A line opens its part. The first screen says **Set-up: 2 steps left** until all are ticked.
- **Request names are shown, not typed**: they are the names of the Service Portal (D41). Only the link is typed.
- **Activity gets only what changed in Settings**, by the name on the screen. The first save no longer writes six "changes" nobody made; a save that changes nothing writes nothing.
- **Audit page**: every table uses the same width for a date, a name and a number. The action "Report" reads **Report loaded** or **Load removed**.
- **Lifecycle review**: the status in EPO shows the word of EPO, then its meaning ("Kørende (Operational)"). **Start a new lifecycle review…** moved to the right, away from Export, and asks first.
- **One date format** (D176): "12 Nov 2026" on the screen ("12 Nov" in a list, for this year), "12 November 2026" in the records to print and in the messages. No screen prints 2026-11-12 any more, also for texts saved by an earlier version. The files to export keep 2026-11-12.
- **Start screen**: **Try it with invented data** is a normal button.
- **Name not standard**: a Service Instance name may end with " - PROD" or " - TEST" (Carlos, D175, replaces D78). Every other ending is still listed. Test instances leave the card.
- No file of the team folder changed its format. Nobody else is asked.

## 0.23.0 — The first screen (whole-app plan, build 4)

- **A header of one row**: the name, the pages (My work, Activity, Audit), then **Load latest report**, **More** (Pick reports…, Refresh), Settings and the theme. **Get replies** moved next to the Today chips. **Back to the start screen** is in Settings, without a folder. *Pick reports* is there once (D173).
- **Reports as one line**: "5 reports loaded · newest 12 Nov, loaded 08:10 · all fresh", with **Show** for the five tiles. The line opens by itself only when a report is missing, old or changed after the checks ran. The "old report" warning is written once, on the line. The result of a load is said once, under the line; the toast sits in the bottom right corner and only says "Reports loaded." On a 1366 × 768 laptop the first cards are visible without scrolling.
- **Cards in an order that helps**: inside each section, to solve first and the biggest first, then to check, waiting, OK, and not tested last. All cards have the same height (D172).
- **New and solved since the report before**: a card says "+12 new" and "8 solved", and a line above the cards says "Since the report of 5 Nov: 31 new, 54 solved." Worked out from the reports the folder already keeps.
- **Each card says what it is about**: a small word (CI, Relationship, EPO, Contract, Lifecycle), with a filter for each, and one or two sentences of explanation. The 7 cards that had none have one now; the long texts are on the open card. *Partly tested* gives its reason on the card and on hover.
- No rule changed and nobody else is asked. No file of the team folder changed its format.

## 0.22.0 — Each card drawn as what it is, and the case panel (whole-app plan, build 3)

- **Four kinds of card**, each with its own numbers, buttons and words: people to ask (owner groups), a SACM fix list, a review list, and the one message of *For Procurement*. A fix list no longer says "28 people · Nobody contacted yet"; a review list no longer offers "Mark as fixed" (D167).
- **Hidden character in name** is a SACM fix list: the name now, with "?" where the character is. No more group "nobody" with *Email the group* (D170).
- **Above parent**: the part "check the mapping first" comes first and is open, with **Mapping is complete: ask the owner** on each line. The first screen says "47 CIs to check" once.
- **Fix lists**: 50 lines to a page ("Showing 1 to 50 of 303"), grouped by class or by kind of problem; **Mark the 50 shown as fixed** marks only what the page shows; a marked line says who and when and offers **Undo**; a click anywhere on a line opens the case. The card counts its marks. When every line is marked the card turns amber: "All marked as fixed. The next report checks it." Its lines still count as to solve until a later report (D168).
- **For Procurement**: one block for the one message, one Assign for the whole card, the mailbox warning once with a link to Settings.
- **A group with nobody to ask** says so and why, and offers Assign, *Not followed up* and Export: no Email, no Teams. The group "nobody" is split by reason.
- **Cards with nothing to do** show one sentence: "Tested on 3,251 CIs. Nothing to solve.", or "Not tested:" with the reason. Never "0 CIs to solve".
- **Fix place**: at the top of a card only when every line has the same one; else on each group or line. A group shows its status in words ("Fix in progress", not "Answered").
- **The case panel**: each open problem has a tick box, and Status, Request number and *Not followed up* act only on the ticked ones ("Applies to 1 of 4 problems"). A problem SACM fixes itself says so and has its own **Mark as fixed**. The three grey buttons "Coming with the Outlook connection" are gone (D169).
- **Small things**: two CIs with the same name show their EPO ID; the chip "to map" is not repeated as the tag Descoped; the questions of the app are its own dialogs, not the grey box of the browser; Activity names every card of a line.
- No rule changed and nobody else is asked. No file of the team folder changed its format.

## 0.21.0 — Messages and follow-up (whole-app plan, build 2)

- **One next step per group**: *Email the group*, then "Waiting for an answer. A reminder is due from 17 Nov." (with *Remind now*), then *Email reminder 1 of 2*, then *Escalate to* and a name. The button no longer says "Email a reminder" right after the first message, or after a reply. The case panel, My work and the person page show the same step (D166).
- **Escalation for a Managed by person goes to the owner of the CI**, one message per owner, with the Managed by person in copy. When nobody is known the app says so, and you type who gets it or send one more reminder. An escalation never becomes a silent fourth reminder (D160, D165).
- **A reminder names the first contact**, also when it was a Teams chat, and never shows an empty date.
- **A reminder and new points are one email** with two parts, "Still open" and "New since then". The tick box says what it adds: "Add 6 open points from 3 other cards (same email)" (D161).
- **The outbox is visible**: the first screen says "4 messages waiting to be sent" and lists them. A message that waits for more than one hour shows its group as queued, and the days to its reminder start when it is really sent (D162).
- **Replies are easy to find**: "2 new replies: read them" opens My work, where *Replies to read* lists them, mine first. Sending to a group nobody has taken makes it yours. The counters *CIs answered* and *escalations* are buttons (D164).
- **The Teams chat has its own text**: "answer in this chat", only the CIs of the person asked, and it opens with that person only (D163).
- **Wording**: "ServiceNow names you as Managed by of the CI below", with "CI" or "CIs" by number.
- **The demo** shows a reminder that is due, an escalation and a reply to read.
- No file of the team folder changed its format.

## 0.20.1 — Right numbers, right times, right words (whole-app plan, build 1)

- **Local time everywhere**: the Reports tiles and the timeline of a case now show the time of the computer, like Activity. The files keep UTC. Dates on the Audit page carry the year (D154).
- **One meaning for each number**: the CI report tile says "63 findings to solve", the section headers "3 cards to solve · 63 findings", and the load message the same number; they always add up. A section with grey cards says "2 cards not tested", and "All OK" only when every card was tested (D155).
- **Run the checks again**: after a Relationship, EPO or contract load or removal, an amber line under Reports says the cards still show the old result, with a button that checks the CI report again. "Load the CI report again" is gone. *Pick reports* no longer offers "Load 0 reports" (D156).
- **Settings refuse impossible numbers** ("-5" working days), with a red line under the field. A bad value already saved is read as the default, and Settings says so (D158).
- **Contract changes** says when an earlier Solusi contract file is in the folder but was not loaded, instead of "the first one in the folder".
- **Verification record**: the column *Tested* gives a number with its unit (CIs, contracts, relationships) for every tested check; *Ready too long* and *Under retirement too long* count every CI of their scope, so the compliance score of the samples moves from 85 to 88. The lifecycle review and the checks switched off are no longer lines of it (D157).
- **Words**: no person's name on a card; report columns by their label ("Supported by (active)"); "1 change", "1 EPO system … has", "1 Service Offering comes"; "Not followed up" everywhere; one "again"; "loaded just now, not saved" without a folder (D159).

## 0.20.0 — Contracts, lifecycle and tags (card corrections 4)

- **For Procurement** keeps four problems of Solusi itself: unknown EPO ID, no vendor number, EPO ID of a Retired system, no contract owner. The new card **Contracts to fix in ServiceNow** is a SACM fix list for the rest: inactive contract owner, inactive Procurement partner, fixed term without an end date, a person named differently, end date passed (D145).
- **Procurement lead**: two new Settings fields, kept in the team folder. After the reminders, the escalation of For Procurement goes to the lead. Without a lead, the card says so and there is no escalation (D147).
- **Upload check** is a SACM fix list, with no incident: SACM sets the value of Solusi in ServiceNow (D146).
- **Not in Solusi**: every line is to delete. *Still linked* is only a note on the line (D144).
- **Deleted but operational** asks the owner for the planned retirement date. On this card and on **Under retirement too long** a case can hold a **Planned retirement date**: the CI waits until that date, then it is to solve again (D148).
- **Ready too long** counts 90 days instead of 180. Business Capabilities have their own card, **Capability Ready too long**, a SACM fix list: SACM makes them Operational (D149, D152).
- **Tags** are shown on the lines of a card and in *Export this list*, never in the owner's email (D151).
- **Invalid tag** is switched off (D150). The new cards are *live* (D153).

## 0.19.0 — Relationship and EPO cards (card corrections 3)

- **Offering owner ≠ Service owner**: offerings from EPO take their owner from EPO and are no longer raised. A hand-made offering with another owner than its Business Service is now a SACM fix list: SACM copies the owner. Nobody is asked (D137).
- **Relationship to a Retired CI** is switched off for now. A check can now have the status *off*: it does not run and has no card, and one word brings it back (D141).
- **Relationship missing**: new rule *Business Capability with nothing below* (a capability needs a Business Process or a Business Capability below it) (D140). A Service Instance without a Business Application is mapped by SACM in ServiceNow: the message asks the owner for a short mapping meeting, never "correct it in EPO" (D139).
- **Too many partners** is a SACM fix list: SACM fixes the mapping in ServiceNow. When SACM cannot tell which one is right, **Cannot tell which one is right: ask the owner** on the case asks the owner instead (D138).
- **EPO ≠ ServiceNow** and **EPO update not arrived** compare the description too, with the same loose comparison as before. The card *Description differs from EPO* is removed (D136). After two days the incident of *EPO update not arrived* goes to the ServiceNow development team (D142). Both cards are now *live* (D143).

## 0.18.0 — Criticality (card corrections 2)

- The **Relationship report**'s column *Excluded for calculation* is now read: an excluded relationship passes no criticality from the parent to the child (D131). Without the column, the load says so and every relationship passes, as before.
- **BIA missing** (was *Target criticality missing*): only a Business Process is asked for its target, because the values come from the BIA. Its owner is asked when the BIA is planned; in Ready it waits (D132).
- New card **No criticality reaches the CI**: a Business Application, Business Service or Service Instance with no target and nothing inherited. A SACM review list linked to the mapping: each line says why (no parent relationship, no parent with a criticality, only parents over an excluded relationship). Inherited set and Target empty waits two weeks: ServiceNow copies it. A target without Inherited is fine (D132, D133).
- **Above parent**: a target above every value the parents pass on; parents over an excluded relationship do not count. SACM checks the mapping first (To review). When the mapping is complete, **Mapping is complete: ask the owner** on the case moves it to To solve, and the owner is asked to confirm the value or lower it with the criticality request (D134).
- The three cards are now *live* (D135).

## 0.17.0 — Where a fix is made, offerings split, class scopes (card corrections 1)

- **Where a fix is made** (decisions D122, D123): a Business Service and a Service Instance are fixed in EPO. A Service Offering is fixed in EPO only when the EPO integration created it (its *Created by* is not a person's user ID); an offering made by hand is fixed in ServiceNow, with the request "Add or modify a Service (CI)". The CI report's *Created by* column is now read. Without it, a note says so and every offering counts as made by hand.
- Messages **never mention the service mapped flag** and never ask for a reply because of it: a CI from EPO always reads "Please correct it in EPO. ServiceNow receives the change from EPO." The SACM step *Update ServiceNow by hand* is gone from the case: the weekly copy is the card **EPO ≠ ServiceNow** (D124).
- **Support group** messages always name the ServiceNow request: "Add or modify a Service (CI)" for an offering, "Support group update" for an instance. **Support group** and **Support group inactive** check only Service Instances and Service Offerings; *Support group inactive* asks Managed by first (D125).
- **Description**: fixed in EPO for a service, an instance or an offering from EPO; on other CIs the owner replies or raises "Add or modify a Service (CI)" (D126).
- **Owner or manager missing**: Supported by is mandatory on Service Offerings too (D127). **Inactive person**: an inactive Supported by only counts on Service Instances and Service Offerings (D129).
- **EPO ID**: Service Offerings are no longer checked (D128).
- **Duplicate names**: only live CIs of the same class count (D130).
- When one message holds CIs of several classes with their own request, it says "For Service Offerings: …" and "For the other CIs: …".

## Project work, no change in the app (11 Nov 2026)

- **Technical documents and proof** (cleanup piece A8, the last one): [ARCHITECTURE](ARCHITECTURE.md) is rewritten for the new layout (parts, layers, every module, data flow, security), with no version diary. New: [DATA-MODEL](DATA-MODEL.md) (the words, and every file of the team folder, field by field) and [HOW-TO](HOW-TO.md) (add a check, a rule word, a report type, a screen; make a release). The guides were proven by adding a test check (1 file) and a test report type, then removing them. A new report type can no longer be read as a CI report by mistake (decision D120). A test checks that every link of the documents works. The first mock-up left the repository (it stays in the git history). The checks, cards, messages, exports and the files of the team folder are the same.
- **Screens grouped** (cleanup piece A7): each screen has its own folder, and the parts several screens share (buttons, dialogs, the person link, the Assign menu) have one place. No screen depends on another screen any more (decision D119). Screenshots before and after match on desktop, phone and dark mode.
- **Saving data apart from the screens** (cleanup piece A6): the part of the app that reads and writes the team folder is split by area (opening the folder, loading reports, messages, team, settings, audit, lifecycle review), and what the screens show is split by area too (cards, owner groups, exports, report tiles, people). The actions now have their own tests, run on an invented team folder in memory (decision D118). The checks, cards, messages, exports and the files of the team folder are the same.
- **One way to plug in** (cleanup piece A5): each report type is now defined in one place, next to its reader, and listed once; the checks of each report type are in one list, and the check engine gets its inputs by name (decision D117). The centre of the logic no longer depends on contracts, the team or the review. The checks, cards, messages, exports and the files of the team folder are the same.
- **Logic in folders** (cleanup piece A4): the logic files moved into folders by role (types, reading, one folder per report type, checks, cases, messages, team, memory, audit), with clearer names, and the tests moved to the same folders (decision D116). Stale history notes left the code comments, and a small helper written three times is now written once. The checks, cards, messages and exports are the same.
- **Check files: honest and validated** (cleanup piece A3): the check files moved to `checks/packs/` with one folder per subject, and a validator stops the build on any mistake in them. Ten fields that did nothing were removed; their notes and questions are in the documents. The status of each check is now true: 15 *live*, 21 *proposed* (decision D114). The checks, the cards and their order, the messages and the exports are the same.
- **Domain documents** (cleanup piece A2): one page per question. New: [CONTEXT](CONTEXT.md), [FEATURES](FEATURES.md), [DOMAIN-RULES](DOMAIN-RULES.md), [CHECKS](CHECKS.md) (written from the check files by `npm run docs`), [DECISIONS](DECISIONS.md), [OPEN-QUESTIONS](OPEN-QUESTIONS.md) and this page. "Inputs needed" and "MVP scope" were split into them and removed. The app file is the same.
- **Safety net** (cleanup piece A1, #26): an automatic check on every pull request; the recorded result of the invented samples, compared at each change; the browser checks in the repository; a privacy guard; tests for the design rules. The app file is the same.

## 0.16.0 — For Procurement, Upload check, Contract changes (#25)

- Card **For Procurement**: problems in Solusi itself, written to the Procurement mailbox in one message with one table per problem (**Write to Procurement**).
- Card **Upload check**: fields that still differ after the upload, and contracts not in ServiceNow yet. A review list.
- Page **Contract changes**: what changed since the Solusi file loaded before, and the contracts that end soon.

## 0.15.0 — Contracts: Solusi compared with ServiceNow (#24)

- Two more report types: the Solusi contract file and the ServiceNow contract report.
- Cards **Not in Solusi** (a SACM delete list, "Still linked" lines first, **Mark as deleted**), **To clear by hand** and **Contract status** (SACM fix lists).
- Filter **All / CIs / Contracts** on the overview.

## 0.14.1 — Requests follow the Service Portal (#23)

- Messages name the six requests as the portal category lists them. There is no request for Supported by: those messages ask for a reply.
- Also recorded, without an app change: criticality and tags stay in ServiceNow (#20); Business Service, Service Offering and Service Instance are fixed in EPO (#21); escalation goes to the manager after 3 attempts (#22).

## 0.14.0 — EPO compared with ServiceNow (#19)

- The EPO systems report is a third report type.
- Cards **EPO ≠ ServiceNow** (a SACM fix list for service mapped CIs), **EPO update not arrived** and **Description differs from EPO** (review lists).
- **Corrected in EPO on …** on a case; **Status in EPO** in the lifecycle review.

## 0.13.1 — Lifecycle review on the EPO classes (#18)

- The lifecycle review draws only from Business Service, Service Offering and Service Instance.

## 0.13.0 — More checks from the CI report, lifecycle review (#17)

- Cards **Support group inactive**, **Name not standard**, **Name to tidy**, **EPO ID**, **Under retirement too long**, **Ready too long**.
- **Audit → Lifecycle review**: a sample drawn once, marked by the managers, with an evidence file.

## 0.12.1 — "Not followed up" (#14)

- *Exception accepted* is renamed **Not followed up**: in SACM an exception is a criticality exception. Also confirmed: the reasons (#15), the 6-month review date and the day count of the audit (#16).

## 0.12.0 — The audit record (#13)

- **Audit** page: Verification record per load (print, export), Audit export of a period, the list of what is not followed up.
- *Waived* becomes a decision with a reason and a review date.
- Changes of Settings and of the team list are recorded.

## 0.11.2 — Offering owner and relationships entered twice (#12)

- *Offering owner ≠ Service owner* asks the owner of the Business Service.
- *Relationship entered twice* also lists two CIs linked by different types or in both directions: only one relationship is allowed.

## 0.11.1 — Offering parent is a SACM fix list (#11)

- Nobody is asked; an offering whose Parent field names a service is no longer on *Relationship missing*.

## 0.11.0 — Four managers working together (#10)

- Team list, **Assign to**, **Share out this card**, **My work**, **Hand over my work**, **Activity**, a page per person contacted with team notes.
- A warning before writing to someone a colleague wrote to in the last 24 hours.
- Copies made by OneDrive are tidied, never deleted.

## 0.10.0 — Relationship checks and the SACM fix list (#9)

- Eight relationship cards, using the Relationship report and the model of the Service Mapping Workspace.
- The **SACM fix list**: a card where nobody is asked, with **Export fix list** and **Mark as fixed**.

## 0.9.0 — Rules tuned to the real report (#8)

- Each finding is **to solve**, **to review**, **waiting** (status Ready) or **known** (tagged). Only to solve is red.
- Supported by no longer mandatory on Business Application; criticality checks on four classes; Descoped shows "to map".
- On a card: filter by class, sort, folded owner groups, **Export this list**.

## 0.8.0 — Messages in the SACM template style (#7)

- Subject, greeting, table, exact request with its link, why it matters, signature. At most 25 CIs per message.
- A CI from EPO: the person is asked to correct it in EPO; SACM updates ServiceNow by hand when the CI is service mapped.
- **Copy message** for Outlook; escalation draft to the manager.

## 0.7.0 — Reports on the main screen (#6)

- Start screen with three choices; the **Reports** strip with one tile per type; **Pick reports**; **Remove this load**.
- `.xlsx` files are read. Hidden characters in names are found (**Hidden character in name**).

## 0.6.0 — The newest report and a small shared memory (#5)

- **Load latest report** finds the newest report in the folder by itself.
- The app reads only the last 10 runs and a summary; older files move to the archive, never deleted.

## 0.5.0 — New screens (#4)

- One overview with a small card per check, in three sections; red, green, grey. Cases grouped by owner. **Email the group**, **Teams group chat**.

## 0.4.0 — Plan version 2 (#3)

- Three modules (Completeness, Correctness, Compliance), shared cases, one message per person, the service mapped flag, five new checks.

## 0.3.0 — The web app (#2)

- The first app in one HTML file: the check engine, the case queue, messages through the shared mailbox, replies, notes, the team folder as shared memory.

## Before 0.3

- 0.1 (26 Oct 2026): the architecture plan and a clickable mock-up (`mockup/`, removed in cleanup piece A8; it stays in the git history).
- 0.2: an Excel sheet with scheduled flows. Rejected: SACM wants a web app driven by managers, and nothing automatic.
