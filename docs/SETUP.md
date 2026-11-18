# Setup Guide

Two stages. Stage 1 takes five minutes and needs nothing from Microsoft 365. Stage 2 connects the shared mailbox.

This guide is for the HTML app. **For the Power BI report** (D268): how to open it, read the reports from SharePoint, make the team's five lists and publish it for the team is in [powerbi/README.md](../powerbi/README.md) (sections 3, 4 and 5).

## Stage 1 — Try the app

1. Download `app/SACM-Workbench.html` and open it in Edge or Chrome (double-click).
2. The start screen has three choices: **Open the team folder** (the normal way to work), **Open report files only** (a quick look at one or more reports; nothing is saved), **Try with invented data**. Click **Try it**.
3. Tick some cases, click **Write messages**, look at a draft, click **Send from shared mailbox**, then **Get replies**. In the demo nothing leaves your computer; a made-up reply shows what the real thing looks like.

To try it on your own data without any flow: click **Pick report files** and choose the CI report (`cmdb_ci`) and, if you have it, the Relationship report (`cmdb_rel_ci`), as `.csv` or `.xlsx` (columns: [DATA-SOURCES.md §2](DATA-SOURCES.md#2-columns-of-the-ci-report)). Nothing is saved in this mode, and the shared mailbox cannot send; **Open in Outlook** still works. A real file loaded in the demo replaces the invented data.

## Stage 2 — Connect the team folder and the shared mailbox

### 2.1 The folder

1. In Teams, channel → **Files**: create the folder `Workbench`, and inside it the folders `reports`, `outbox`, `sent`, `replies`. The app creates `data` and the archive folders itself.
2. Upload `SACM-Workbench.html` into `Workbench`.
3. Each manager: in **Files**, open `Workbench` and click **Add shortcut to OneDrive** (or **Sync**). The folder then appears in File Explorer.
4. Each manager: open `SACM-Workbench.html` from File Explorer, click **Choose the team folder** (under *Open the team folder*), and select the `Workbench` folder. The browser asks for permission to read and edit: allow it. Next time one click reopens it.

### 2.2 The report

Schedule the `cmdb_ci` report in ServiceNow: CSV, daily, to the shared mailbox, subject `SACM-DQ cmdb_ci`. Columns: [DATA-SOURCES.md §2](DATA-SOURCES.md#2-columns-of-the-ci-report). The Relationship report (`cmdb_rel_ci`) can go to the same folder, as `.csv` or `.xlsx`: the app tells the two apart by their columns.

### 2.3 Flow F1 — file the report

*Automated cloud flow*, name `SACM - File reports`.

**Trigger: When a new email arrives in a shared mailbox (V2)**

| Field | Value |
|---|---|
| Original Mailbox Address | the SACM shared mailbox |
| Subject Filter | `SACM-DQ` |
| Only with Attachments | Yes |
| Include Attachments | Yes |

**Apply to each** → *Attachments*. Inside it: **Create file** (SharePoint)

| Field | Value |
|---|---|
| Site Address | the team's site |
| Folder Path | `…/Workbench/reports` |
| File Name | expression `concat(formatDateTime(utcNow(),'yyyy-MM-dd'),'_',items('Apply_to_each')?['name'])` |
| File Content | expression `base64ToBinary(items('Apply_to_each')?['contentBytes'])` |

### 2.4 Flow F2 — send what a manager queued

*Automated cloud flow*, name `SACM - Send from outbox`.

**Trigger: When a file is created (properties only)** (SharePoint)

| Field | Value |
|---|---|
| Site Address | the team's site |
| Library Name | Documents |
| Folder | `…/Workbench/outbox` |

In the trigger's settings, set *How often do you want to check for items* to 1 minute.

**Action 1: Get file content** (SharePoint) — *File Identifier*: **Identifier** from the trigger.

**Action 2: Compose** — rename it to `Message`. *Inputs*, as an expression:

```
json(if(startsWith(string(body('Get_file_content')),'{"$content'),base64ToString(body('Get_file_content')?['$content']),string(body('Get_file_content'))))
```

**Action 3: Send an email from a shared mailbox (V2)**

| Field | Expression |
|---|---|
| Original Mailbox Address | the SACM shared mailbox (plain text) |
| To | `outputs('Message')?['to']` |
| CC | `outputs('Message')?['cc']` |
| Subject | `outputs('Message')?['subject']` |
| Body (in code view `</>`) | `outputs('Message')?['body']` |

**Action 4: Move file** (SharePoint)

| Field | Value |
|---|---|
| Current Site Address | the team's site |
| File to Move | **Identifier** from the trigger |
| Destination Site Address | the team's site |
| Destination Folder | `…/Workbench/sent` |
| If another file is already there | Move with a new name |

This flow sends exactly the message a manager approved in the app. It never writes or changes a message.

### 2.5 Flow F3 — file the replies

*Automated cloud flow*, name `SACM - File replies`.

**Trigger: When a new email arrives in a shared mailbox (V2)**

| Field | Value |
|---|---|
| Original Mailbox Address | the SACM shared mailbox |
| Subject Filter | `[SACM-` |

**Action: Create file** (SharePoint)

| Field | Value |
|---|---|
| Site Address | the team's site |
| Folder Path | `…/Workbench/replies` |
| File Name | expression `concat(formatDateTime(utcNow(),'yyyyMMdd-HHmmss'),'_',guid(),'.json')` |
| File Content | expression below |

```
string(setProperty(setProperty(setProperty(setProperty(json('{}'),'from',triggerOutputs()?['body/from']),'received',triggerOutputs()?['body/receivedDateTime']),'subject',triggerOutputs()?['body/subject']),'body',triggerOutputs()?['body/body']))
```

### 2.6 Test with yourself

1. In the app: **Settings** → fill in the portal link, check the signature, and fill in the name and link of each request, and enter the EPO inventory owner (name and email). The EPO inventory owner is only a fallback: it gets a fix in EPO when nobody else can be asked about the CI.
2. Open a case → **Write a message** → **Send a test to me**. The message goes to your own address only and the case does not change.
3. Within a few minutes the test arrives from the shared mailbox. The file moves from `outbox` to `sent`.
4. Reply to that test email. Click **Get replies** a minute later.
   A test reply is not attached to a case (the test was not recorded on one), but the file in `replies` shows F3 works.
5. Send one real message to a colleague who agrees to help, ask them to reply, and click **Get replies**: the case becomes *Answered* and shows the reply.

## Working with the app

Every screen and button, and the weekly routines for EPO and the contracts, are described in [FEATURES.md](FEATURES.md).

## How the shared memory stays small

The app reads only the last 10 reports and a summary file, `data/state.json`. When someone loads a report, older reports move to `data/archive/<month>/`, and replies on closed cases move to `replies/archive/<month>/`. Journals are one file per person and month, in `data/journal/<month>/`. The sample of each lifecycle review is one small file in `data/reviews/`. Nothing is deleted.

If `state.json` is missing or OneDrive made a conflict copy of it, the app rebuilds it from the files and says so. You do not need to do anything.

When two computers change the same file before OneDrive has synced, OneDrive keeps a second copy with the computer name (`settings-PC01.json`). The app tidies these copies when it reads the folder, and says so in a yellow note: two loads of the same report count as one, a second copy of your journal is added to it, and two versions of the team list are joined. For Settings it asks you to check them. The copies are kept in `data/archive/<month>/conflicts/`, never deleted.

Before you write to someone, the app reads the colleagues' journals again and warns when a colleague wrote to the same person, or about the same CIs, in the last 24 hours. OneDrive needs some seconds to minutes to bring a colleague's work, so two messages written in the same minute cannot be caught.

A case that was closed (Verified, or not followed up) and is not in the last 10 reports no longer shows in the app. Its history is still in the archive folders.

## Known limits

- A message is recorded on the case when you press send. If flow F2 fails, the case shows *waiting to be sent*; check the flow's run history.
- Sending takes one to a few minutes: folder sync, then the flow.
- Public holidays are not known: *Reminder due* counts Monday to Friday.
- The relationship checks need a Relationship report loaded with or before the CI report; without it their cards stay grey and say so.
- A CSV export cannot show hidden characters in names (it writes "?"). The card *Hidden character in name* is tested only for the names that are also in the Relationship report, unless the CI report is an `.xlsx`.
