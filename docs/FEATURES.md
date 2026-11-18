# Features

Every screen, card and button of the Workbench, as a SACM manager sees it. The rules behind them are in [DOMAIN-RULES.md](DOMAIN-RULES.md); setting up the folder and the flows is in [SETUP.md](SETUP.md).

Nothing happens on its own: every load, message and reply follows a button press.

**The look** (since 0.29.0, [LOOK.md](LOOK.md)): navy buttons, the Workspace icons, the font Nunito Sans, light and dark (the moon and sun at the right of the header). The logo, a magnifier over a grid, is also the icon of the browser tab. Settings, close, export, print, search, back and the theme are icons alone: point at one, or reach it with the keyboard, and its word shows as a tooltip. Every other button has a word. No text is in capitals and no label ends with three dots; a long text in a timeline shows its first part and **Show all**. Colours have one meaning each: red to solve, blue to check and asked, teal marked as fixed, green OK, violet answered, amber reminder and warning, grey not tested, waiting and known.

## 1. Start screen

| Choice | What it does |
|---|---|
| **Open folder** | The normal way to work. Choose the `Workbench` folder once; the browser asks to read and edit it. Next time the same button reopens it (its name is the tooltip), and **Another folder** chooses a new one. Everything the team does is saved there |
| **Open files** | A quick look at one or more `.csv` or `.xlsx` reports. Nothing is saved, and the shared mailbox cannot send; **Outlook** still works |
| **Try the demo** | Invented data. Nothing leaves the computer; a made-up reply shows what the real thing looks like. A real file loaded in the demo replaces the invented data |

**Who is working?** asks for a name and an email once. It cannot be closed empty: every action is recorded with them.

## 2. The header and the Reports line

The header is one row (D216): the logo and the name, with "Report 12 Nov · 412 CIs" under it, a **Demo** or **Files only** chip, the pages **My day**, **My work** (with its number), **Backlog** (the mapping backlog, below), **Activity** and **Audit**, then **Load**, **More** (**Choose reports**, **Refresh**, and when the folder was last read), Settings (with the number of set-up steps left), the theme, and the initials of the manager (they open *Settings*, *Me*). The open page has a coral line. Below 1250 px the pages show their icon only, the open page keeps its word. With report files only, **Load** chooses files. Without a folder, **Back to the start screen** is in *Settings*.

Under the title of My day, the reports are one line: "Reports 5 reports · 12 Nov · fresh", with **Show** to open one tile per report type (CI report, Relationship report, EPO systems report, Solusi contract file, ServiceNow contract report). Its tooltip says the newest report and when it was loaded. The line opens to the tiles by itself, in amber, only when a report is missing ("not loaded: …"), old, or changed after the checks ran. **Show** and **Hide** hold until the app is opened again.

| You want to… | Do this |
|---|---|
| Load today's reports | **Load**. The app takes the newest report of each type in `reports/` (or directly in `Workbench/`), `.csv` or `.xlsx`: by the date at the start of the file name, else by the time it last changed. The type comes from the columns. The toast in the bottom right corner says **Reports loaded** with **Details**, which opens the tiles and the message of the load. The message shows by itself only when something needs a look (a load was not saved, a load was removed). If the newest report is already loaded, the toast says **Nothing new to load**. A file that is not a known report is named, with the columns it lacks |
| Choose which reports to load | **More** → **Choose reports**: one line per report file, newest first: the file name, its type, its date and **Loaded** (the folder and where the date comes from are the tooltip). Tick and press **Load 2**. With nothing ticked the button reads **Load**, grey, with "Tick a report to load" next to it. **Older files** shows 20 more. **Choose files** opens any file on the computer |
| See which reports are loaded | **Show** on the Reports line. Each tile shows the file, the report date, who loaded it and when (in the local time of the computer). Without a folder it says *loaded just now, not saved*. The CI report tile says how many **findings to solve** the daily cards hold, the same number as the load message. The findings of the cards for when there is time are counted apart. A tile turns orange when its report is older than the number of days in *Settings* (3 by default; 8 for the two contract files); a report type with no load shows **Missing** |
| Undo a wrong load | **Remove** on its tile; the window asks first (**Remove this report?**, **Remove**). The load moves to `data/archive/<month>/removed/` (never deleted), the history records who removed it, and the screens go back to the loads that stay. *Load* does not load a removed file again; use *Choose reports* for that |
| Bring the cards up to date | When a Relationship, EPO or contract report was loaded or removed after the checks ran, an amber line says so: "The EPO systems report changed after the checks ran. The cards still show the old result." **Check again** checks the CI report again with the reports loaded now |
| See what colleagues did | **More** → **Refresh** reads the folder again; the menu says when the folder was last read |
| Keep a verification record | **Record** on the CI report tile (also on the Audit page) |
| See what changed in Solusi | **Changes** on the Solusi tile (section 9) |

## 3. My day and the cards

### My day

The first page (D216). Four boxes of the team's daily work, the same numbers for every manager:

| Box | Each row | The button |
|---|---|---|
| **Replies to read** | Who answered, about which CI and card, when ("today 09:14"). **Get replies** at the top reads the replies the shared mailbox filed | **Reply** opens the case panel |
| **Reminders due** | Who to remind, the card and the number of CIs, when they were asked. The oldest first | **Remind** opens the email window |
| **To escalate** | Who did not answer, the card, "3 times, no reply" | **Escalate to** the next person (D165) opens the email window |
| **New since the last report** | A card with new findings: "2 new CIs · 1 solved" | **Open** opens the card |

Each box shows at most 3 rows and **All N**: the replies open My work, the reminders and escalations turn on their filter, the new findings the filter *New*. An empty box says so in one grey line. The cards for when there is time are not counted (D182). With report files only (no folder) there are no messages: only the box *New since the last report*. **Hide** folds My day into one line of counters (Get replies, reminders, answered, escalations, outbox, new); **Show** opens it again. The choice is kept on this computer (D217). When messages wait in the outbox, a counter "1 in outbox" opens the list. Under the boxes one line gives the totals since the report before: "Since the report of 5 Nov: 31 new, 54 solved."

### All cards

One card per check, in three sections: **Completeness** (something is missing), **Correctness** (something is wrong), **Compliance** (a process rule is broken). The list of cards is in [CHECKS.md](CHECKS.md).

- **The filter row**: **Search**; **All / CIs / Relationships / EPO / Contracts / Lifecycle**; **Filter** with *To solve* (the daily work), *Mine*, *Reminders*, *Escalations* and *New*: each filter that is on shows as a chip with an x. At the right, **Cards** or **Lines**, kept on this computer (D217). Lines are 36 px high, in two columns from 1250 px wide.
- **A section header** counts its cards: "Completeness 3 to solve · 1 to check · 1 when there is time" (D219); the (i) explains the section. It says **All OK** only when every card of the section was tested and none is red. A section folds.
- **A card** shows its name, its state, one number and at most one fact (D220). The number is what it asks to solve: "6 CIs" on a card that asks owners, "303 lines" on a SACM fix list or a review list, "3 contracts" on *For Procurement*. The fact is the first of: **+12 new** (red), *Partly tested*, *2 reminders*, *1 answered*, *120 of 303 marked as fixed*, *5 free* (not assigned), *Not asked yet*. The explanation of the card is its tooltip; for a card partly or not tested, the tooltip gives the reason. A card has a ring and an arrow under the mouse.
- **States**: **To solve** (red), **To check** (blue: a review list, or a finding SACM checks first), **All marked as fixed** (teal: every line of a fix list is marked; "The next report checks it"; its lines still count as to solve until a later report no longer shows them), **OK** ("Nothing to do"), **Not tested** (grey, with the reason; never green when not tested). A review list is never red.
- **Order** inside each section: to solve first, the biggest first; then to check; then the fix lists where every line is marked; then OK; not tested last (D172).
- **When there is time**: *Supported by*, *Ready too long* and *Under retirement too long* are work for a quiet day (`priority` `later`). Such a card has a dashed border and a cup, its findings are not counted as daily work, and the CI report tile counts them apart. Its lines can still be emailed.
- **Not checked yet**: under the first section header, one dashed line per parked class (D179): "236 Business Capabilities in Ready are not checked yet", "No API or Application CIs in this report". The load message and the verification record say the same.
- **Beside an open card** the other cards are a plain list of names, by section, with their number; **All cards** goes back.
- **Since your last visit** lists what colleagues did since this manager last opened the folder (the time is kept in the browser).

## 4. A card

A card is drawn as the work it asks for. There are five kinds. Every kind has the same head and the same toolbar (version 0.31).

**The head** (pale pink): the name and its state, one sentence of what to do, and **Details** for the rest (the check's own name when it differs, the subject, where the fix is made, the longer text). "1 waiting, below" says what is listed under the main list. The numbers are at the right, in short words. Below 1280 px, **All cards** goes back.

**The toolbar**: **Search** and **Filter** (a class, **Reminders**, **Mine**; each filter that is on shows as a chip with an x) at the left; at the right the actions of the card: **Share out** and **Export**, **Mark N fixed** on a SACM list, the step of the mailbox on *For Procurement*. A grey button says why next to it ("Every group is taken", "Tick a line first").

| Kind | Numbers in the head | What you do |
|---|---|---|
| **Owners** (people are asked) | To solve, People, Free (groups nobody has taken) | The next step of each owner group: **Email**, **Remind 1 of 2**, **Escalate to** (name) |
| **SACM fix list** (SACM fixes it itself) | To fix, Fixed | One row per record: **Copy** a value, **ServiceNow** opens the record, tick records and **Mark N fixed**, or **Fixed** on one record; **Share out** |
| **Review list** (*No criticality reaches the CI*, *EPO update not arrived*) | To check, CIs | Look at the lines. Nothing to mark and nobody to write to |
| **One mailbox** (*For Procurement*) | Problems, Contracts | One message to the mailbox |
| **Mapping backlog** | CIs to map | The card opens the page *Mapping backlog* (below) |

A card with nothing to do shows one sentence and no table: "Tested on 3,251 CIs. Nothing to solve.", or "Not tested:" with the reason and what to load. Long lists show 50 lines to a page ("Showing 1 to 50 of 303", **Previous**, **Next**). Two lines with the same name show the EPO ID after the name.

**The tables** of a card are one part: the name looks like a link and is followed by its class on the same line; the whole line opens the case, with a chevron on hover; the header stays in view when the page scrolls. An empty field that is the problem says **Missing** in red; an empty field that is not the problem shows "–". The column **State** shows the status in words (*Asked*, *Answered*, *In progress*, *Marked fixed*, *Verified*) and why a line waits.

**An owner group** is named after the person asked, with why ("Cy Keeper", *Managed by*), or **Nobody to ask** with the reason ("No Owned by and no Managed by", "No email address"). Under the name, one line of memory: "Asked 3 times · last 2 Nov · no reply", or "Not asked yet". One state chip says what matters now: *To escalate*, *Reminder due*, *Answered*, *In the outbox*, *Asked*. The initials of whoever has the group show in a circle. At the right: the next step, **Teams**, and **More** (**Note**, **Take**, **Assign to** a colleague, **Stop following**, **Export**). A group with nobody to ask offers **Stop following** in place of the step, and no email and no Teams. Only the first group starts open, and only an open group has the navy button; a click anywhere on the head of a group opens or folds it.

| You want to… | Do this |
|---|---|
| See who to contact | Click a card. Its CIs are grouped by the person asked, with Owned by, Managed by and Supported by side by side |
| Work a long list | **Filter** by class; **Sort**: most CIs, owner, CI, oldest first. Open a group to see its CIs |
| Get a list for Excel | **Export** on a card, or **More**, **Export** on one owner group: a CSV file with the columns of the SACM template (Name, EPO ID, Class, Owned by, Managed by, Operational status, Support group, Tags, What we found) |
| See the tags of a CI | Every line of a card, of an owner group and of a fix list shows the tags of the CI, because they often answer a question. They are in the export too, never in a message to the owner |
| See what is not for today | Under the main list, folded: **To check**, **Waiting** (CIs in status Ready, lines EPO already answers: each line says why), **Known** (findings a tag explains) and **Done** (verified or not followed up), each with its number. The explanation shows when one is opened. They are not counted and no message is offered |
| See what SACM checks first | On *Above parent* the first part is **Check first**: one line per CI, with the button **Mapping done: ask owner**. The CI then moves to the second part, **Asked of the owner** |
| Work a group with nobody to ask | The group is named **Nobody to ask**, with the reason. It offers **Stop following**, and **More**: **Note**, **Take**, **Assign to**, **Export** |
| See where the fix is made | In **Details** when every line has the same place. On a card with both, each group or line says **Fix in EPO** or **Fix in ServiceNow** |
| Share the work | **Share out** gives the groups nobody has taken to the team members, the biggest group first, to who has least. The head counts the groups nobody has taken (**Free**). Change any group with **More**, **Assign to** |
| Take a group | **More**, **Take**, or **Assign to** a colleague |

**SACM fix list.** A card where nobody is asked shows one row per record (a CI or a contract) instead of owner groups, grouped by class (by kind of problem on a contract card). Under the name come every change to make on it, each with the value today and the value to set, so the record is opened once in ServiceNow (D242). **Copy** next to a value copies the exact text to type: a person, a name, a relationship type, the whole description of EPO (D243); an instruction such as "Keep one" has no **Copy**. **ServiceNow** opens the record in a new tab: the CI by its name, the relationship rows between the two CIs, or the contract by its number. It needs the address of your ServiceNow in *Settings* → *Mailboxes* → **ServiceNow**; until then the head says where to set it (D244). **Share out** gives the records nobody has taken to the managers in turn; the initials show on the record and **Mine** in Filter shows yours (D245). A click on a record opens the case. **Export** gives a CSV, one line per change. Each record has a tick box; **Mark N fixed** marks the ticked records, after a question of the app, and **Fixed** marks every line of one record. A record with every line marked is teal, says *Marked fixed*, who marked it and when, and offers **Undo**. The head counts the marks ("120 of 303 marked as fixed"). A line is Verified only when a later report no longer shows the problem; until then it counts as to solve. *Hidden character in name* is a fix list too: the name now, with "?" where the character is. On *Not in Solusi* the words are **Deleted** and **Mark N deleted**; every line is to delete, and "Still linked" is only a note on the line. On *Too many partners* SACM fixes the mapping itself; when it cannot tell which one is right, **Ask the owner** on the case takes the line off the fix list and into the owner groups, to write to the owner (**Back to SACM** undoes it). The same button is on *EPO ID* (Must be created in EPO), *Duplicate names* (Two real CIs) and *No justification* (The request gives none); the reason shows next to it (D183, D184, D185). *Application ≠ Instance*, *BIA missing* and *No justification* are SACM fix lists too: the line says the value to set.

**Review list.** The columns are CI, What the report shows, State and Since. The box at the top says why the lines are listed. On *EPO update not arrived*: raise one incident for the pattern and type its number in **Incident number**, then **Keep number** (it is saved on every line shown).

**The source first.** On a Service Instance, a people line says what EPO holds: "EPO names the same person as System Owner", "Secondary Responsible is empty in EPO too", or "empty in EPO; ServiceNow still shows the old person". When EPO already names another person, the line is under **Waiting** and says who brings the value. The message to the owner shows it in the column *What we found*.

**For Procurement.** The head says "One email to Procurement", with the memory of the message and its state. The step is at the right of the toolbar (**Email**, **Remind 1 of 2**, **Escalate to** the Procurement lead), next to **Export** and **More** (**Note**, **Take**, **Assign to**). Under it a table for each kind of problem. When the mailbox has no email yet, the head says so once, with **Open Settings**, and the step is grey with "Set the mailbox email first" next to it.

**Contract cards** carry the small word *Contract* and show the dates of the two files compared.

## 5. Messages

| You want to… | Do this |
|---|---|
| Write to a group | On an owner group: **Email** → the email window "Email: (name)" → **Send from mailbox** (or **Outlook**). To: the person the check asks first. Cc: the others; a short hint under each field says who and why. Each person gets one message with all their points. Two drafts or more are tabs ("Reminder · 2 CIs"); the footer acts on the draft in view. The head of a draft says "5 CIs · 8 cards" (the cards are the tooltip), and the preview shows its first lines and **Show all**. A message to a group nobody has taken makes the group yours |
| Know where the fix is made | The message says it. A Business Service, a Service Instance or an offering the EPO integration created: "Please correct it in EPO". Every other CI, and the Support group on every class: the exact ServiceNow request. The case shows the same (*Fix in EPO* or the request) |
| Paste a message into Outlook | **More** → **Copy** in the email window puts the message with its table on the clipboard (HTML and text). **Outlook** does it by itself for a long message, then opens Outlook: paste it there. Back in the app, "Sent?" **Yes** records it. **More** → **Test** sends a test to me from the shared mailbox |
| Chat in Teams | On an owner group: **Teams** → **Teams** in the window → send the message there → back in the app, "Did you start the chat?" **Yes**. It counts like a message. The chat opens with the person asked and lists only their CIs; the other people of the group can be ticked, or get a chat of their own with **Chat** |
| See the next step | Each owner group shows one next step. Nobody contacted: **Email**. Just contacted: "Waiting for an answer. A reminder is due from 17 Nov.", with **Remind now**. Still in the outbox after one hour: "In the outbox since 12 Nov, not sent yet.", with **Write again**. A reply came: **Reply**. The case panel, My work and a person's page show the same step |
| Send a reminder | Filter on **Reminder due** → open the card → **Remind 1 of 2**. The person's new points from other cards go in the same email, as a second part ("Add 6 points from 3 other cards"). After the agreed reminders with no answer the button is **Escalate to** and a name: the owner of the CIs for a person asked as Managed by, else the person's manager. When nobody is known: **Escalate**, then type a name and an email address, or **One more reminder**. For Procurement it goes to the **Procurement lead** of Settings (**Escalate to** and the name); without one, the card says there is no escalation and offers **Remind** |
| Write to Process Management | First, once: *Settings* → *Mailboxes* → **Process Management**: add each person with **Add**. On a card, the problems on the record of a Business Process are one group, **Team: Process Management** (owner, manager, description, duplicate name, process type tag, status). **Email** writes one message to every person of the team, with one table per kind of problem, and copies nobody: the process owner is not written to about data quality. Without people in Settings the group says so. The mapping of a process stays with SACM and the process owner (D195, D196) |
| Move a Business Process in Ready on | The card **Process stage** (a SACM list, needs the Relationship report): **To map** (CIA values set, nothing linked below): plan a mapping session with the process owner. **Mapped** (something linked below): make it Operational in ServiceNow, then **Fixed**. A process without CIA values waits for the BIA and has no line; a note says how many (D197) |
| Write to Procurement | First, once: *Settings* → *Mailboxes* → **Procurement mailbox**, its **Email** (and the **Procurement lead** for the escalation). Then open the card **For Procurement** and press **Email**: one message, one table per problem of Solusi itself (no contract owner, a contract owner or Procurement partner who left, no vendor number, the EPO ID). **Export** gives the same tables as a file. The other contract problems are on **Contracts to fix in ServiceNow**, a fix list |
| See answers | **Get replies**: the replies filed by the flow are shown on their cases. The message says "2 new replies: read them"; the link opens **My work**, where **Replies to read** lists them first, mine first. A click opens the case. A reply leaves the list when a manager sets a status on the case or writes again |
| See what waits in the outbox | First screen: **messages waiting to be sent**. A click lists them: to, subject, who queued it, when. The days to a reminder start when a message is really sent |
| See the escalations | First screen: **escalations** shows only the cards and groups whose reminders got no answer. **CIs answered** opens the replies to read |
| Avoid writing twice | Before a message, the app reads the colleagues' journals again and warns when a colleague wrote to the same person, or about the same CIs, in the last 24 hours. Open the colleague's message, give the CIs to that colleague, or write anyway |

### The mapping backlog

A page, opened with **Backlog** in the header or from the card *Mapping backlog*. One line per CI that must be mapped: a Service Instance without a Business Application, a Business Application without a Service Instance or a Business Process, a Business Service without a Business Process, a Business Process with nothing below (in Ready once it has CIA values), and a Business Application tagged To be deleted that is still Operational. Each line shows the CI and its class, the owner, why it is on the list, its stage (dots and a word), since when, and the next step. The criticality lines of the same CI (*Above parent*, *No criticality reaches the CI*) show as chips under the reasons. On the first screen its card says how many CIs are to map and for how many owners.

| You want to… | Do this |
|---|---|
| See what to map today | The page opens on **To solve**. **Waiting** holds the CIs in Ready, **Planned** the CIs tagged To Be Mapped, Descoped or Process is missing or unknown; **All** shows every line. The **Stage** buttons and the search narrow the list |
| Invite the owner | **Invite** on a line that is still to plan: one email to the owner for a 30-minute mapping session, with the CIs and no questions. After it the line shows **Invited** and the date, then the reminder or the escalation when they are due |
| Move a case on | Open the CI and press its stage: **To plan**, **Session held**, **Classified**, **Application linked**, **Process linked** (each class shows its own steps). The stage is in the timeline with who set it. The case closes only when a later report no longer shows the problem |
| Tell Process Management a process does not exist | On a Business Service or Business Application case: **The process does not exist** (**Undo** takes it away). Then **Tell Process Management** at the top of the page writes one message to the team of *Settings* with every marked CI not told yet. The line then says when the team was told |
| Share the list | **Export**: the lines shown, as a CSV file |
| Talk to Enterprise Architecture | **Capability sheet**: every Business Capability as a CSV file, with its status, the capabilities above and below, the processes below, the description, tags, owner, manager and hidden characters. It needs a CI report loaded with a Relationship report |

## 6. The case panel

Click a CI to open its case. The name of the CI takes up to two lines, with its class, EPO ID and since when. Each problem is a white box with a coloured bar at the left (red to solve, blue to check, teal marked, grey waiting or known, green done), its card and where it is fixed. Then *People* (**Missing** in red when the empty role is the problem), *Replies* and the *Timeline*, with the field for a note at its top. A bar at the bottom holds the main step (**Email**, **Remind**, **Escalate to**, **Reply**: none when nobody can be asked), **Status** and **Assign**, with **Stop following** and "Verified comes with the next report." above them.

| You want to… | Do this |
|---|---|
| See the history | Every message, reply, note and status, with who and when. A long text shows its first part and **Show all** |
| Record a request | *Request number* (under the people); set status *In progress* |
| Act on one problem of a CI with several | Each open problem has a tick box. **Status**, **Request number** and **Stop following** act only on the ticked problems; the bar says "2 of 4 ticked". Opened from a card, only the problem of that card is ticked. Opened from a search or from My work, all are |
| Mark a line of a fix list | A problem SACM fixes itself says "SACM fixes it: nobody is asked" and has its own **Copy** (when there is a value), **ServiceNow**, **Fixed** (or **Deleted**) and **Undo**. It is never ticked at the start |
| Stop following a finding | **Stop following** in the bar: a reason, a review date (6 months by default) and a note. On the review date the case is to solve again ("Followed again"). **Follow again** does it at once. **Status** holds only statuses |
| See that a person corrected EPO | With an EPO systems report loaded, the case says **Corrected in EPO on …** when EPO shows another person than ServiceNow since the message. Before any message it says that EPO already has another person |
| Ask the owner after a SACM check | On *Above parent*, once the mapping is complete: **Mapping done: ask owner** (also on the line of the card). The finding moves to To solve and **Email** asks the owner to confirm the value or lower it. **Back to SACM** undoes it |
| Write the planned retirement date | On *Deleted but operational* and *Under retirement too long*: **Retirement date**, then **Save**. Until that date the CI waits (not to solve, no reminder); on the date it is to solve again. **Remove** undoes it. The date is in the timeline with who set it |
| Ask the owner when SACM cannot fix it | On *Too many partners*: **Ask the owner**, with the reason next to it. The line leaves the fix list and the owner is asked which one is right. **Back to SACM** undoes it |
| Set the stage of a mapping case | On a case of the *Mapping backlog*: the stage buttons, and **The process does not exist** on a Business Service or Business Application without a process |
| Close a case | Nothing to do. When a later report contains the CI and no longer shows the problem, it becomes *Verified* |

## 7. Working together

| You want to… | Do this |
|---|---|
| Set up the team (once) | *Settings → Team*, **Managers**: the SACM managers with name and email (`data/team.json`). "Who is working?" then offers the names, and every *Assign* menu lists them |
| See my own work | **My work** (D247): **Replies to read** first, under their own heading, each with **Reply** (it opens the case). Then **Assigned to me**, a table with one line per person to contact: *Asked* (the name opens their page, with the role), *Cards*, *CIs*, *Follow-up* ("Asked 2 times · last 2 Nov · no reply"), *State*, and *Next step*: the same step as the group on the card (**Email**, **Remind 1 of 2**, **Escalate to** (name), **Reply**) and **Assign**. Answers first, then reminders due, then the rest. "Nothing for you now" only when the page is empty |
| Go on holiday | **My work → Hand over**: choose a colleague, write a note and press **Hand over to** (name). The note shows on every case handed over. With nothing assigned to you the button is not shown |
| See everything about one person | Click a person's name (on a group, in a case panel, in My work). Their page shows everything open with them, every message and reply, and the team's notes about them ("prefers Teams", "on leave until …"; **Add note**). The step at the top is the one of a group (**Email**, **Remind 1 of 2**, **Escalate to** (name), **Reply**), with **Assign**. Notes on a group show on the group itself |
| See what the team did | **Activity** (D248): a table of every event, newest first: the icon, *Time*, *Who* (the initials; the name is the tooltip), *What* and *About* (the cards and the CIs; a CI opens its case). **Search**, **Everyone** or one manager, **All days** or one day. "So far: 3 emails · 2 reminders · 0 Teams chats" is in the head of the page |

## 8. Audit page

Four parts, as tabs with a coral line under the open one (D250): **Record**, **Export**, **Not followed** and **Lifecycle**. A list (the report, the period, the review) is as wide as its text.

| Part | What it does |
|---|---|
| **Record** | The verification record. Per loaded CI report: the date, the verifier (who loaded it), and per check what was tested (**Tested**: "214 CIs", "462 contracts", "5,509 relationships"), what is to solve, what is new and what was verified since the report before, and what could not be tested and why. The lifecycle review is not a line of it (it is under *Lifecycle*). Dates are written in words ("12 November 2026"). The tables of the Audit page share one width for a date, a name and a number. **Print** (choose "Save as PDF") or **Export** (CSV) |
| **Export** | The audit export. Choose a month, a quarter or two dates, then **Export**. It reads every report and journal of the folder, the archive too. In *Actions taken*, loading a report reads **Report loaded** and removing a load **Load removed**. A summary to **Print**, and six CSV files: loads, findings, actions (with who and when), verified (with their days), open (with their age), not followed up |
| **Not followed** | Every finding SACM decided not to follow up: who, why, until when, and its state. **Add CI** enters a known exception of the instruction before it is raised (the CI name, the check or every check, the reason, the review date). **Follow again** ends one, after a question. Export and print |
| **Lifecycle** | The lifecycle review, twice a year. **New review** draws 50 CIs and 20 Under retirement from the latest CI report (Business Services, Service Offerings, Service Instances) and saves the list in `data/reviews/`, so every manager sees the same list. Mark each CI **Same in EPO**, **Not the same** or **Not in EPO**, with a note. The column *Status in EPO* comes from the EPO systems report and shows the word of EPO, then its meaning ("Kørende (Operational)"), and **Mark 4 same** marks the CIs that agree with EPO as *Same in EPO* in one click. "Not the same" opens a line on the card *Lifecycle review*, a SACM fix list: copy the status of EPO (service mapped), or raise an incident for the sync (not service mapped). Only when EPO itself looks wrong, press **EPO itself looks wrong: ask the owner** on the case. **Export** gives the evidence file to keep. **New review** stands at the right, away from **Export**, and asks first ("Start a new review?"); the old review is kept. The app never starts a review on its own |

## 9. Contract changes

A page, opened from the Solusi tile or from a contract card. It compares the newest Solusi contract file with the one loaded before: new contracts, contracts that left, status changes, and each changed field with the value before and now, each as a fold with its number, like the folds of a card ("New contracts 1", D249). It also says how many Concluded contracts end in the next 30 and 90 days, and how many running contracts have no daily responsible. **Export** gives a file. Nobody is asked, no case is opened. With no earlier file loaded, the page says whether an earlier Solusi contract file is in the folder but was not loaded (load it with *Choose reports* to compare), or whether this is the first one.

## 10. Settings

A wide window with four parts. **Save** keeps all of them at once. As soon as a field changes the footer says "Not saved yet"; **Cancel**, Close or Escape then ask "Close without saving?" with **Keep editing** and **Close**. Without a team folder, **Start screen** at the left of the footer goes back to the start screen.

| Part | What it holds |
|---|---|
| **Set-up** (with the number of steps left) | A list with a tick per line: **The team folder is chosen**, **The team list has more than one person**, **The request links are pasted** ("4 of 6 links pasted"), **The Procurement mailbox and lead are filled**, **The ServiceNow address is set**, **The Process Management team has people**. A line opens its part. A tick shows as soon as the field is filled. Until every line is ticked, the Settings button in the header shows the number of steps left (only with a team folder), and Settings opens on this part |
| **Me** | Your name and email, kept in this browser. Choose yourself from the team list, or type them |
| **Team** | **Managers** (the team list), then **Follow-up** and **Reports and checks**: each number with its unit after the field ("Reminder after 3 working days", "Reminders 2 then Escalate", "Review after 6 months", "Report old after 3 days", "Under retirement too long 90 days", "Ready too long 90 days") |
| **Mailboxes** | **Procurement mailbox**, **Procurement lead**, **Process Management** (its name and its people) and **EPO inventory owner**, each with **Name** and **Email**; **ServiceNow** with its **Address** (only a link that starts with https:// is kept; each record of a SACM list opens there); then **Messages** (the Service Portal link, the signature) and **Request links**. The name of a request is the one of the Service Portal: it is shown, not typed |

The last two parts are for the whole team, kept in the team folder (`data/settings.json`). A change is recorded with who and when, and shows on Activity and in the audit export: only the fields that changed, by the name on the screen ("Reminders before Escalate: 2 → 3"). A save that changes nothing writes nothing.

| Setting | Default |
|---|---|
| Service Portal link and the link of each request | Empty: pasted by SACM |
| Signature of the messages | SACM team |
| Working days before a reminder is due | 3 |
| Reminders before Escalate | 2 |
| Days before a report counts as old | 3 |
| Months until "Not followed up" is reviewed | 6 |
| Days before Under retirement is too long | 90 |
| Days before Ready is too long | 90 (a folder saved with 180 before version 0.20 reads 90) |
| EPO inventory owner (name, email) | Empty: the fallback when nobody can be asked |
| Procurement mailbox (name, email) | Procurement, empty email |
| Procurement lead (name, email) | Empty: no escalation for Procurement |
| Process Management (name, people) | Process Management, nobody: the message to the team cannot be written |
| Team | The SACM managers |

A changed number of days is used when the next CI report is loaded. Every number is a whole number in a range (working days before a reminder 1 to 30, reminders before Escalate 0 to 10, days until a report is old 1 to 60, months until review 1 to 36, the two lifecycle numbers 1 to 730). **Save** refuses another value with a red line under the field, and shows the part *Team*. A settings file that already holds a bad value is read with the default, and Settings says so.

**Dates.** The screen writes a date as "12 Nov 2026"; in a list a date of this year is "12 Nov". The records to print (verification record, audit report, lifecycle review) and the messages write "12 November 2026". The files to export keep 2026-11-12, so they sort.

## 11. Weekly routines

| Routine | Do this |
|---|---|
| Compare EPO with ServiceNow (every week) | Put the EPO systems report in `reports/` next to the CI report and press **Load**. **EPO ≠ ServiceNow** is the fix list for service mapped CIs: copy the EPO value into ServiceNow, then **Fixed**. The chip *changed in EPO* marks what changed since the EPO report loaded before. **EPO update not arrived** lists the CIs that are not service mapped and still differ: the description is compared too. Check a few, and after two days raise one incident for the pattern with the ServiceNow development team (keep its number in *Request number*) |
| Check the contracts (every Monday) | Put the Solusi contract file (the Excel file as it arrives) and the ServiceNow contract report in `reports/` next to the CI report and press **Load**. **Not in Solusi** is the list of contracts to delete in ServiceNow: every line is to delete (a note "Still linked" says what links it), delete in ServiceNow, then **Mark as deleted**. **To clear by hand**, **Contract status** and **Contracts to fix in ServiceNow** are fix lists. The app deletes nothing |
| Check that the upload worked | Open **Upload check**. It shows the dates of the two files. If the Solusi file was not uploaded yet, upload it, load a new ServiceNow contract report and look again. If it was, set the value of Solusi in ServiceNow and **Mark as fixed**. No incident is needed |
| Keep a contract that is not in Solusi | Open it on **Not in Solusi** and press **Stop following**, with the reason (for example: Procurement asked to keep it) |

## 12. For the developer

| Command | What it does |
|---|---|
| `npm test` | The tests, the recorded result of the invented samples, the design rules and the privacy guard |
| `node src/hosts/cli.ts <report.csv\|.xlsx> [relationship report]` | Runs every check on files, prints the findings and what could not be tested, writes `findings.json` next to the report |
| `npm run build` | Rebuilds `app/SACM-Workbench.html` (after `npm install` once) |
| `npm run verify` | Types, tests, build, and the built file matches the source |
| `npm run docs` | Writes [CHECKS.md](CHECKS.md) again from the check files |
| `npm run browser` | The browser checks on invented data |

## 13. The Power BI report (build B7)

The Power BI version of the Workbench (D268) is in `powerbi/`. How to open it: [powerbi/README.md](../powerbi/README.md). Build B5 runs the checks of the CI report, the Relationship report, the EPO systems report and the two contract files on every CI report date (the history, D290), reads the team's journal, replies, settings, team and lifecycle reviews from five SharePoint lists (D291), works out the cases as the app does (D292) and has thirteen pages (D293); build B7 adds the page **Messages** (D300). The report opens on **My day**.

| Page | Shows |
|---|---|
| **My day** | Four numbers and four tables that scroll: **Replies to read** (newest first: from, received, the first line, the CIs, the next step), **Reminders due** (the oldest first: the card, who the last message went to, when, and the reminder count), **To escalate** (the reminders are used up: the card, the person, the escalation and the follow-up), **New since the last report**. The line at the top says how many findings are new and solved since the report before (the numbers of the verification record). Above it the **Reports line** ("Reports: 5 reports · 11 Nov · fresh", or which report is missing or too old) and **Open Reports**. |
| **My work** | Who *Me* is (the person signed in to Power BI, found by email in the list *SACM Team*; in Sample mode the first active member), the cases assigned to me (the card, the person asked, the status, my CIs, the follow-up and the next step), and the replies to read. |
| **Messages** | Every message ready to send (D300): first messages, reminders that are due and escalations, one per person across the cards, at most 25 CIs a part. The line at the top counts them by kind; **Kind** filters them; the table shows the draft, the kind, who gets it, the CIs, who has the cases and the subject. The app *SACM messages* at the right sends them. |
| **Activity** | One line per event of the journal, newest first, in the words of the app (*Sent a message to …*, *Marked fixed*, *Stopped following …*): when, who, what and the CIs. **Day** (from and to), **Who** and **Type** filter it. |
| **History** | Per card (**Card** filters) over the report dates: to solve, new and solved per report date (a line chart), the days to fix of the findings solved at each date, the number of report dates, open cases, solved and days to fix, and to solve per support group and per class (tables with one column per report date). |
| **Audit** | Sections, not tabs. **Record**: the verification record of the report date chosen (the newest when none is chosen): each card with what was tested, the findings and CIs to solve, what was not tested, new and solved. **Export**: *Verified*, the findings a later report no longer showed (the card, the CI, its class, the field, first seen and verified on), and the actions of the team (the journal); *More options*, *Export data* gives the file; **Period of the actions** chooses the days of the actions. **Not followed**: the decisions to stop following, newest first: when, who, the CI, the check, the reason, the note, the review date and whether they still run. **Lifecycle**: the marks of the lifecycle review, read-only (writing them comes in stage 2). |
| **Reports** | One line per kind of report: the newest file, its date, its age and *Up to date*, *Old* (older than 3 days, the contract files 8) or *Missing*. Then the runs (each CI report with the other reports its checks use), the classes, and the files that could not be read, with what each is missing. |
| **Cards** | Since B5 a card's fact also comes from the team's journal and the history (D220, the first of): *+N new*, *Partly tested*, *N reminders*, *N answered*, *N of M marked as fixed*, *N free*, *Not asked yet*; a SACM fix list whose every line is marked fixed is *All marked as fixed* (teal, still counted as to solve, D168). The three sections (Completeness, Correctness, Compliance). Each section line counts cards: "3 to solve · 1 to check · 2 when there is time · 5 not tested", or *All OK*; a card to solve that is work for a quiet day (`priority` `later`) counts as *when there is time*, not as to solve (D182). **Topic** at the top right filters the cards (CI, Relationship, EPO, Contract, Lifecycle). One row per check in use, in the order of the app (D172: daily work first, then To solve, To check, OK, Not tested, the biggest first): its state in colour (*To solve*, *To check*, *OK*, *Not tested*), its number (CIs; lines on a SACM fix list or a review list; *Nothing to do* when OK), its fact (*Partly tested* when a note says what it could not test), *When there is time* for a card of a quiet day, what it finds, and its note. A check that is not built yet is grey with "this check is not built in the Power BI version yet". Below: one grey line per parked class (*Not checked yet*, D179). |
| **Card** (drill through on a card) | The card and its state, what to do, the numbers to solve, to check, waiting and known. **To solve**: each CI with what we found, who is asked (*Nobody to ask* when nobody can be) and why, Owned by, Managed by, Supported by and tags. **To check, waiting and known**: the same columns for the lines nobody is asked about yet, with why they are not to solve. **SACM fix list**: the change, the value now, the value to set, the value to type, the note (*Not in Solusi*: why the contract is still linked) and **Open in ServiceNow** (D244, D279). **By kind of problem**: the lines grouped by what is wrong; for *For Procurement* the title says one email to the Procurement mailbox, with the memory of the message since build B7 ("Asked 2 times · last 4 Nov · no reply"), one table per kind (D98). Since B5 each line to solve also has its case: the status (*New*, *Asked*, *Answered*, *Marked fixed*, …), the follow-up ("Asked 2 times · last 4 Nov · no reply") and who has it (and who marked it fixed, and when). **Export for Excel**: the columns of the SACM template; *More options*, *Export data* gives the file. A contract is a case of its own, shown as `CT…: name` (D287). |
| **Case** (drill through on a CI) | The CI (name, class, EPO ID, status, support group, Owned by, Managed by, tags), each problem with its card, state, who is asked, where it is fixed, what EPO says, *What EPO already has* (EPO already holds the person asked for, so nobody needs to be asked, D281), the chip *changed in EPO* and **Open in ServiceNow**, and the people: who is asked, who is copied, who gets an escalation. Since B5 each problem also has its status, follow-up and who has it, and below the relationships come the **Timeline** (every event of the journal about the CI, oldest first) and the **Replies** to its messages. **Relationships**: every CI above and below it, its class and status (*Not in the CI report* when it is not there), the type, whether it counts for the checks (*No: a Retired end*) and whether it is excluded from calculation. |
| **Person** (drill through on the person asked) | The person and who gets their escalation, and everything open with them: the card, the CI, what we found, the state, why they are asked, who is copied, and since B5 the status, follow-up and who has it. Below: the **Timeline** of the journal about their findings and their **Replies**. |
| **Mapping backlog** | One line per CI to map with its owner (D282): the CI, its class, the owner, why it is on the list, its stage and the steps of its class, its criticality lines, the state (*To solve*, *To check*, *Waiting*: the CI is in Ready, *Planned*: a tag says when) and the next step. **Lines** filters the states; the number line says how many CIs for how many owners. Below: the **capability sheet** for Enterprise Architecture (its line says how many Business Capabilities, or that it needs the Relationship report), every Business Capability with its status, the capabilities above and below, the Business Processes below, description, tags, Owned by, Managed by and hidden characters (*Export data*). |
| **Contract changes** | The newest Solusi contract file against the one before it (D102, D288): the line of counts (new, no longer in the file, status changes, changed fields), then each change with the contract, the field, the value before and after. **To watch**: the Concluded contracts that end in the next 30 days and in the next 90 days, with the days left counted from today, and the running contracts without a daily responsible. For information only: nobody is asked, no case is opened. |
| **Self-check** (hidden) | How many checks give the result the HTML app records for the invented samples ("38 of 39": *Lifecycle review* is manual), and for each check what differs. Since B5 also the numbers of the history (report dates, findings per date, new, solved, days to fix, open cases, reminders due, to escalate, replies to read, mine, not followed up) against what the app counts on the two sample dates. |

A refresh at the size of the real reports takes about 100 seconds on the test machine (version 0.42.0, with the history, D283), so the report is ready for the real reports. In the workspace an old report date is computed once and kept for 24 months (D290).

**The Power App *SACM actions*** (build B6, D294 to D296) sits on the pages Card, Case, Person and My work (the Power Apps visual). It gets the lines of the page or the lines selected, and its menu **What to do** offers the actions every line has (the column *Actions* of the model, as the case panel of the HTML app): Note, Status, Request number, Assign, Stop following, Follow again, Fixed or Deleted and Undo the mark, Ask the owner and Back to SACM (or the words of the check file), Retirement date, Stage, The process does not exist and its undo, Hand over my work, Note about the person. Under it, what the action asks (a status, a request number, a member, a reason and a review date, a date, a stage, a note). **Save** adds one row to the list *SACM Journal* and starts the refresh (flow *SACMRefresh*); it is off until what the action asks is filled in, and at 1,000 lines. **Refresh now** starts the refresh only. Below: **Done lately**, the journal rows of the last 60 days about these lines, newest first, read from the list at once. The pages *My day* and *Reports* have a **Refresh now** button (the Power Automate visual, flow *SACM refresh now*). Since build B7 the app also has **Share out** (D24, D303): the free groups of the card go to the active members, the biggest first, each to the member with the fewest CIs so far (one *assign* row per member). The app and the flows are made once in the company tenant: [powerbi/README.md](../powerbi/README.md) §6.

**The Power App *SACM messages*** (build B7, D301, D302) sits on the page *Messages*. The list shows each message ready to send; press one to open it. **To**, **Cc** and the subject can be changed, and the message is shown as it goes, with its reference and the manager's name. **Send** sends it from the shared mailbox (flow *SACMSend*), then records it on the cases (the new points of a reminder as a first message, D161; the cases nobody had become the sender's, D164) and starts the refresh. **Test** sends it to the manager only (flow *SACMTest*). **Outlook** opens it in Outlook (a long message is copied first) and asks *Sent from Outlook?*; **Teams** opens a chat with the first message and asks *Did you start the chat?*; *Yes* records it. When a colleague wrote to the same person, or about the same cases, in the last 24 hours, the app says who and when, and Send and Outlook wait for **Send anyway**. Replies come in by the flow *SACM - File replies* into the list *SACM Replies* and show on *My day* after the refresh.

Every page ends with the version, the data (invented samples or SharePoint) and the time of the last refresh. In Sample mode "today" is the date of the samples, 11 Nov 2026.
