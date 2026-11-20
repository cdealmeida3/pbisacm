# The look

How the Workbench looks, and how to draw a new screen so it looks the same. Carlos chose the look on 12 November 2026 (look D "Guided", colours navy and coral, the Workspace icons, icons alone for well-known actions, the logo "magnifier over a grid"). The new look is built in five steps, L1 to L5 (D207). This page is the rule book for every later build, also the "Who solves each card" builds.

## 1. The rules

Every screen keeps these rules, light and dark, on a laptop (1366 × 768), a monitor (1920 × 1080), a monitor at 125 % and half a monitor (960 wide).

1. **No capitals.** No text in capital letters, no letter spacing for capitals. Headings are in sentence case.
2. **No three dots.** Not on a button, a list option, a menu or a cut text. A long text shows its first part and **Show all**.
3. **No wrapped and no cut label.** A label, title, button, chip, tab or table header stays on one line and is not cut. A CI name is data and may take two lines, but between words: no word of a table is broken over two lines (D370).
4. **Few words on a button.** At most two (a number is not a word: **Mark 3 fixed**, **Remind 1 of 2**), apart from the agreed longer ones (Escalate to (name), Mark N fixed, Mapping done: ask owner, Ask the owner, Send from mailbox, Hand over to (name), Try the demo, Tell Process Management).
5. **One meaning per colour**, always with a word and an icon (section 2).
6. **One meaning per icon** (section 4). One main button per screen or window. Selected never looks like a main button.
7. **Every grey button says why** in words next to it. A help text names a control as the screen writes it.
8. **Readable.** Contrast 4.5:1 or more for every text. No text under 12 px. No click target under 24 px.
9. **Windows:** one footer, Cancel at the left of the main button, the main button right-most, an extra action (More, Choose files, Email, Start screen) at the far left. Three widths: 480 px, 720 px, and the side panel of 560 px.

The tests check rules 1, 2, 3 (cut and wrapped labels), 4 (words on a button), 5 (the named colours), 6 (the icons are of the set) and 8 (also the contrast of every text as drawn) on the source and in the browser (section 6).

## 2. Colours

A screen uses only the named colours of `src/app/styles.css`. Each has a light and a dark value. The colours of Tailwind (`slate-500`, `blue-600` and so on) are switched off: they draw nothing.

| Name | Use | Light | Dark |
|---|---|---|---|
| `page` | Behind everything | #faf6f1 | #1a1614 |
| `surface` | Cards, panels, windows, fields | #ffffff | #241f1c |
| `surface-2` | A light fill: hover, a quiet box | #f6f0e8 | #2f2824 |
| `line`, `line-strong` | Lines; the ring of a field or a secondary button | #e8dfd3, #cfc3b4 | #40372f, #5e5247 |
| `ink` | Text | #2b2623 | #f1ebe5 |
| `muted` | Second text: hints, dates, counts | #655a52 | #bdb1a7 |
| `accent` | Navy: the main button, the selected ring, links | #0c1c49 | #f0f1f4 |
| `accent-soft` | The fill of what is selected | #e6e9f4 | #1c2a5e |
| `deco` | Coral: decoration only | #fd472c | #fd472c |
| `pink` | Pale pink: decoration only (L3: behind the head of an open card) | #f5ddd2 | #2a1f2a |
| `tip`, `tip-ink` | Tooltips and toasts | #1f2d3a, #ffffff | #e8edf2, #11171d |

**Coral and pale pink are decoration only** (D209): coral on the logo, the line under the open page in the header and the line under the open tab. Never a button, never a state.

**The status colours**, one meaning each. Each has a text colour (`red`), a soft background (`red-soft`) and a line (`red-line`):

| Colour | Means | Icon |
|---|---|---|
| red | To solve; a problem; to escalate | `solve`, `escalate` |
| blue | To check; asked; in progress | `eye` |
| teal | Marked as fixed (the next report checks it) | `marked` |
| green | OK; verified | `ok` |
| violet | Answered; a reply to read | `replies` |
| amber | Reminder due; a warning; in the outbox | `bell`, `warn`, `outbox` |
| grey | Not tested, waiting, known, not followed up, when there is time | `nottested`, `clock`, `tag`, `stop`, `later` |

## 3. Sizes, corners, font

- **Font:** Nunito Sans, packed in the file (weights 400, 600 and 700, about 56 KB, SIL Open Font License), Segoe UI when it cannot load (D208). Two weights in use: normal and semi-bold.
- **Text:** 15 px for text (`text-sm`), 13 px for small text (`text-xs`), 16 px for a box title, 18 px for a page title, 22 px for the title of My day; 12 px is the smallest (D211, D221).
- **Buttons and fields:** 32 px high (`h-8`). Icons 16 px on buttons and in the header, 14 px in chips and badges.
- **Corners:** 8 px chips and fields (`rounded-md`), 10 px boxes (`rounded-lg`), 16 px panels and windows (`rounded-xl`), round for buttons and state badges (`rounded-full`).
- **Shadows:** a small one on cards and panels (`shadow-sm`), a large one on windows and the case panel (`shadow-xl`).

## 4. Icons

The Workspace set, 73 icons in `src/app/ui/icons.ts`, drawn on a 24 × 24 grid with a line of 1.8. The name says the meaning, not the drawing: `<Icon name="remind" />`. The type check refuses a name that is not in the set. One meaning per icon; the main ones:

| Meaning | Icon | Meaning | Icon |
|---|---|---|---|
| Load the reports | `load` | More (three bars, never three dots) | `more` |
| Settings | `settings` | Light, dark | `sun`, `moon` |
| My work, Only mine | `me` | Activity | `activity` |
| Audit | `audit` | Backlog | `backlog` |
| Search | `search` | Email | `mail` |
| Send from the mailbox | `send` | Remind | `remind` |
| Escalate | `escalate` | Teams | `teams` |
| Copy | `copy` | Outlook | `outlook` |
| Note | `note` | Take (assign to me) | `take` |
| Assign | `assign` | Share out | `share` |
| Hand over | `handover` | Export | `export` |
| Print | `print` | Mark fixed | `fixed` |
| Undo, follow up again | `undo` | Stop following, not followed up | `stop` |
| Remove a report | `remove` | Close | `close` |
| Back | `back` | Open, fold | `right` |
| Replies | `replies` | Nobody to ask | `nobody` |
| People | `people` | Add a person, take off a list | `useradd`, `minus` |
| A warning | `warn` | Information | `info` |
| A date | `calendar` | A contract, contract changes | `contract`, `changes` |
| A line of a SACM list | `table` | A record to print | `file` |
| Open in ServiceNow | `link` | | |
| Choose files | `folder` | Lifecycle review | `review` |

**Icons alone**, with their word as the tooltip, only for the well-known actions: settings, close, export, print, search, back, light and dark (`IconButton`). Every other button has a word.

**The logo** is a magnifier over a grid: the grid navy, the magnifier coral (`Logo` in `basics.tsx`). The browser tab shows the same mark (`index.html`).

## 5. The parts

One of each, in `src/app/ui/`. A screen uses these and does not draw its own.

| Part | File | What it is |
|---|---|---|
| `Button` | `basics.tsx` | Main (navy), secondary (white with a ring), quiet (`ghost`, text only), danger (red). One height, 32 px |
| `IconButton` | `basics.tsx` | An icon alone with its word as tooltip, for the well-known actions |
| `Icon`, `Logo` | `basics.tsx` | An icon of the set; the mark of the app |
| `LightBadge` | `basics.tsx` | The state badge: To solve, To check, Marked as fixed, OK, Not tested, and "when there is time" (grey, a cup) |
| `Chip` | `basics.tsx` | The status chip: one shape, the colours of section 2 |
| `Toggle` | `basics.tsx` | The filter chip: a tick and a light fill when on |
| `Dialog` | `basics.tsx` | A window: 480 or 720 px, one footer. `guard` asks before Close or Escape (Settings with changes) |
| `Field`, `inputClass` | `basics.tsx` | A field with its label; the hint and the error under it, outside the label |
| `Why` | `basics.tsx` | The reason a button is grey, in words next to it |
| `Pager` | `basics.tsx` | "Showing 1 to 50 of 303" with Previous and Next |
| `Tabs` | `parts.tsx` | Tabs with a coral line under the open one |
| `Segmented` | `parts.tsx` | One choice of a few, side by side (All, CIs, Relationships) |
| `Counter` | `parts.tsx` | A counter in its colour; grey and not a button when it is zero |
| `Notice` | `parts.tsx` | Warning (amber), information (blue), reply (violet) |
| `EmptyState` | `parts.tsx` | Nothing to show: an icon, one sentence, one action |
| `FoldSign` | `parts.tsx` | The chevron that turns when a section opens |
| `Fold` | `parts.tsx` | A folded list with its word and number ("Waiting 1", "New contracts 1"); its hint shows when open. Under a card and on Contract changes |
| `MenuButton`, `MenuItem`, `MenuLine` | `parts.tsx` | A menu: lines of 36 px, the note as a tooltip, a line or a small heading between parts. `up` opens it above (the bar of the case panel, the footer of the email window). Escape closes the menu, not the window |
| `FilterChip` | `parts.tsx` | A filter that is on, with an x to take it off (the filter row, the toolbar of a card) |
| `CountBadge` | `parts.tsx` | The number next to a heading or a fold ("Waiting 1") |
| `TickBox` | `parts.tsx` | A tick box of 18 px in a target of 24 px; a click on it does not open the line |
| `Avatar` | `parts.tsx` | The initials of a person in a circle, the name as tooltip ("Assigned to Demo User") |
| `DateField` | `parts.tsx` | The date picker with the date in words beside it ("5 Dec 2027") |
| `TABLE` | `parts.tsx` | The classes of the table part: the header stays in view under the header of the page (`thWindow` in a window), numbers at the right, a line is a box on a phone |
| `AssignMenu` | `people.tsx` | **Assign** with a caret: **Take**, the colleagues, **Nobody** |
| `CopyValue`, `ServiceNowLink` | `servicenow.tsx` | **Copy** the value to set (a quiet button) and **ServiceNow**, the record in a new tab (a link drawn as a secondary button); a SACM list and the case panel (build W5) |
| `CardHead`, `CardToolbar` | `screens/card/CardHead.tsx` | The head of an open card (D223) and its one toolbar (D224) |
| `CiCell`, `RowLink`, `PersonCell`, `CaseChips` | `screens/card/CiTable.tsx` | A line of a card: the name styled as a link and its class on one line, the whole line opens the case, *Missing* or "–", the state in words |
| `LongText` | `parts.tsx` | The first part of a long text and **Show all** |
| `TipLayer` | `parts.tsx` | The one tooltip of the page, on the mouse and on keyboard focus |

**Tooltips:** give an element `data-tip="…"`. The browser tooltip (`title`) is not used. The shell mounts `TipLayer` once.

**Selected:** a light fill (`bg-accent-soft`) and a navy ring, a tick on a filter chip, a coral line under a tab or the open page. Never the navy fill of a main button (D212).

## 6. How to draw a new screen

1. Use the parts of section 5. A missing part goes into `src/app/ui/` first, then into the screen.
2. Use only the named colours of section 2, as Tailwind classes: `bg-surface`, `text-muted`, `ring-line`, `bg-red-soft text-red`.
3. Pick the icon by its meaning (section 4). A new meaning needs a new icon in `icons.ts`, drawn the same way (Lucide style, line 1.8).
4. Write the words in sentence case, without three dots, at most two words on a button.
5. Run `npm test`: `tests/app/ui/look.test.ts` checks the rules on the source (capitals, three dots, text size, raw colours, browser tooltips, icon names, cut texts, contrast).
6. Run `npm run build` and `npm run browser -- look`: it opens the demo at the four sizes, light and dark, goes through 28 screens (also every page) and measures capitals, three dots, the smallest text and target, the font, the words on each button, tab and menu line, the contrast of every text, and the labels that wrap or are cut.

**No exceptions.** L1 started with lists of places that still broke a rule (13 cut texts in the source, 42 wrapped or cut labels on one screen). L2 to L5 emptied them (D214, D221, D251): no screen cuts a text, and no label wraps or is cut. A new screen keeps it so. A label wraps when its text runs over two lines; a button with rows by design (a card, the name in the header) carries `data-rows` and is measured row by row.

## 7. The builds of the new look

| Build | What changes |
|---|---|
| **L1 The base** (0.29.0) | Colours, icons, sizes, the font, the logo, the parts, no capitals and no three dots. Nothing moves on the screens |
| **L2 Frame, My day and the cards** (0.30.0) | The header, the new first page My day, the Reports line, the filter row, the cards and the Lines switch |
| **L3 Open card and case panel** (0.31.0) | The head of a card, one toolbar, the head of a group, one table part, SACM lists with tick boxes, the folds, the case panel with its bar at the bottom (D223 to D234) |
| **L4 Windows and messages** (0.32.0) | The email window with one footer and the drafts as tabs, the other windows in one footer order, Settings (Set-up, Me, Team, Mailboxes; "Not saved yet"), the column *Status* in the email (D235 to D241) |
| W5 Lighter hand work (0.33.0, not a look build) | A SACM list as one row per record, **Copy**, **ServiceNow**, **Share out** (D242 to D246), drawn with the parts above |
| **L5 Pages and the last check** (0.34.0) | My work (replies first, then a table), Activity as a table, the person page, Audit (Record, Export, Not followed, Lifecycle), Contract changes with the fold of the cards; the look check counts words per button and contrast on every page (D247 to D252) |
