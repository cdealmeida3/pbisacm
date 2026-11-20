# How to use the report

This guide is for the SACM managers who use the report every day on app.powerbi.com. It shows each page and says what
to do there. The pictures come from the Desktop check of the report (decision D329). They show the invented sample
data, not real CIs or people. In the team's workspace the numbers are the real ones. The Power Apps (the buttons that
send, note and mark) are only in the published report, so the pictures show their place empty.

How the report is set up (the workspace, the lists, the apps and the flows) is in [README.md](README.md).

## 1. The parts of every page

![My day, with the navy rail at the left](guide/my-day.png)

- **The navy rail at the left** opens the pages. The page you are on is lighter, with a coral line. The number beside
  *My day* is how many next steps you have today. The number beside *Work queue* is how many open lines wait for a person. At the
  foot: the version, where the data comes from and how old it is ("refreshed 2 h ago"). On *My day* and *Reports* the
  rail also has **Refresh now** and its rule (part 2A).
- **The chip at the top right** says whether the reports are up to date. Green: every report arrived in time. Amber:
  one is old or missing. Press it to open *Reports*.
- **The grey line under every title** says how many lines a box shows, or why it shows none ("Nobody to wait for").
  A box is never empty without a word.
- **Buttons on a row** (Open person, Open card, Open CI) work on the line you selected. They stay grey until you select
  a line; the grey line above them says so.
- **Tabs** (All cards, Card, Case, History) show one table at a time. A tab keeps the card, CI or person you opened.

## 2. Your day in five steps

1. **Open *My day*.** Four numbers: replies to read, people to escalate, reminders due, and what is new since the last
   report. Under them, **Your next steps**: one line per person, in the order of the team's rules (a reply first, then
   an escalation, a reminder, the people never asked).
2. **Select a step and press *Open person*.** The *Person* page shows the next step, the open lines, the last contact
   and everything open with them.
3. **Select a line of *Open with them* and press *Prepare email*.** The page *Messages* opens with the email studio:
   at the left the kind buttons (First, Reminder, Escalation) and the list of emails, at the right the app with the
   email to that person as it will arrive, and From, To, Cc and Subject. Choose another email in the list and the app
   shows that one. An email with no address says why and what to add.
4. **Press *Send*.** The email goes out from the shared SACM mailbox, with the full list as a CSV file when it is long.
   The cases are recorded at once; the report shows them after the next refresh (part 2A). *Test to me* sends it to
   you only. *Outlook draft* puts it in your own Drafts, From the shared mailbox, to change it first.
5. **When a reply comes,** *My day* shows it first. Open the person: the app at the right opens on the tab *Reply*, with
   what they wrote next to their open lines. Tick the lines it answers and press *Mark answered*, or set *Waiting until*
   a date.

Nothing is sent on its own. Every email, reminder and escalation is a button you press.

## 2A. When does the report change?

The report refreshes **at 07:00**, after the morning reports. During the day it refreshes when somebody asks, **once
every 2 hours, from 08:00 to 18:00**: press **Refresh now** in an app, or on the rail of *My day* or *Reports*. A reply
that comes in asks too. The first ask in each 2 hours refreshes; the app tells the others who asked and when the next
refresh can start. Power BI allows only a few refreshes a day, so a Save does not refresh.

- **What you did is saved at once.** The apps show it straight away: *Done lately* and the marks say *not in the
  report yet*, an email you sent stays in the list as *Sent* for everyone, and the top line of each app says "Report
  data from 07:05. 3 changes since then are not in it yet."
- **After a refresh**, press **Refresh** in the report's top bar (or reload the page): the pages do not reload by
  themselves.

## 3. The pages

### Work queue

![Work queue](guide/work-queue.png)

Every open line, one row per person asked, with the next step, the lines, the cards, when they were last asked and who
in the team has them. The buttons at the top choose a status. Select rows, then use the app at the right: take them,
share them out, note, mark fixed.

### People

![People](guide/people.png)

Everyone the team asks, in the order of the team's rules. The bar shows their open lines in the colours of the states.
*Find a person* searches the names. Select one, then *Open person*.

### Cards (the page All cards)

![All cards](guide/cards.png)

One card per check, in three sections: Completeness, Correctness and Compliance. The badge is the number to solve (red),
to check (blue) or a tick when the card is fine (green). The small line is the last reports. The buttons at the top
choose the states, the list beside them a topic. The tab *List* shows the same cards as a table. Select a card, then
*Open card*: its tabs are *To solve with a person*, *SACM fix list*, *To check* and *Export*.

### History

![History](guide/history.png)

*What happened*: everything the team did and every reply, newest first. Search for a CI, a person, a card or a
reference, or choose the kinds of event with the buttons. The tab *Trend* shows the open lines and the days to fix over
the reports.

### Overview

![Overview](guide/overview.png)

For the lead and the weekly meeting: the open lines, the lines waiting on a person and the lines solved, each with a
small line of the last reports; where the work sits (section by next step: darker is more); open lines per report; and
who holds the most. Select a person, then *Open person*.

### Audit

![Audit](guide/audit.png)

The proof for the auditor. Choose the **Period**. Four numbers (reports received, problems found, closed and verified,
the median days to an answer), found and closed per week, and every escalation. Under *Audit* on the rail are its
parts: *Record* (the verification record of a report date), *Export* (the tables to give the auditor: on a table,
*More options*, *Export data*), *Not followed* and *Lifecycle review*.

### Reports

![Reports](guide/reports.png)

First, **What to fix in the folder**: a kind of report with no file, the columns the CI report lacks (one line to copy
into the ServiceNow report), a file the report did not use and why (for example a copy of the same day: move it into the
sub-folder *Archive*), then the files the report knows but does not use yet. Below: the newest file of each kind of
report, its date and whether it is up to date; the files each CI report date was checked with; and how many CIs each
class has.

### Mapping and Contracts

*Mapping* is the backlog of CIs to map, with the owner, the stage and the next step. *Contracts* compares the newest
Solusi file with the one before and lists the contracts that end soon. Both are for information: nobody is asked from
them.

## 4. When something looks wrong

- **The chip is amber.** A report is old or missing. Open *Reports*: it says which one. The numbers still show, from the
  reports that are there.
- **A card is grey or a number looks wrong after new files.** Open *Reports* and read *What to fix in the folder* first.
- **A box says why it is empty.** Read the grey line under its title: it is often fine ("No reply to read").
- **The numbers look old.** Look at the foot of the rail: it says how old the data is. Press **Refresh** in the
  report's top bar first. Then press **Refresh now** (part 2A); outside 08:00 to 18:00 the next refresh is at 07:00.
- **A button stays grey.** Select a line first. In the app, the grey button says why under it.
