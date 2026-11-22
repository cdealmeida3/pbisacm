// The design tokens of the Power BI report (design pass §3, D311, D312): one list of the colours, text sizes and the page
// grid, so the theme (sacm-theme.json, written by generate.ts), the lint of the pages (lint.ts step 10) and later the
// emails and the Power Apps use the same values. The colours are the light colours of docs/LOOK.md (src/app/styles.css):
// a Power BI report has one theme, and the pages of app.powerbi.com stay light.
// Sizes: Power BI writes font sizes in points; a point is 4/3 of a pixel, so 9 pt is the 12 px of LOOK rule 8.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');

/** The light colours of src/app/styles.css by name (--wb-<name>, the first `:root` block). */
export function lightColours(): Record<string, string> {
  const css = readFileSync(join(root, 'src', 'app', 'styles.css'), 'utf8');
  const start = css.indexOf(':root {');
  const light = css.slice(start, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const match of light.matchAll(/--wb-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) if (!(match[1]! in out)) out[match[1]!] = match[2]!.toLowerCase();
  return out;
}

/** The font of every text: a theme cannot load a web font, and Segoe UI is what app.powerbi.com and Outlook use. */
export const FONT = 'Segoe UI';
/** The same font, semibold: Power BI sets the weight by the name of the face. */
export const FONT_SEMIBOLD = 'Segoe UI Semibold';

/** Text sizes in points (Power BI's unit). The smallest is 9 pt = 12 px (LOOK rule 8). */
export const TEXT = {
  /** The title text class of the theme (16 px, LOOK §3: a box title). */
  heading: 12,
  /** The title of a visual (13 px, design pass §3.1). */
  title: 10,
  /** The line under the title of a visual (its empty state, D318). */
  subtitle: 9,
  /** A table's header and values, a slicer's items. */
  table: 9,
  /** The big number of a tile. */
  callout: 21,
  /** The word under the number of a tile, the label of an axis. */
  label: 9
} as const;

/** The smallest size of any text, in points (12 px, LOOK rule 8). */
export const MIN_TEXT_POINTS = 9;

/**
 * The page grid of design A (D312): every page 1280 × 720 (Case at most 1440 tall), a navy rail of 188 px at the left,
 * the content from x 224 to 1256, the name of the page at the top, the visuals on a 4 px grid with 12 px between them.
 */
export const GRID = {
  width: 1280,
  height: 720,
  /** A page taller than 720 (D312 allows Case up to 1440): none since build D3 put the parts of Case on tabs. */
  tallest: {} as Record<string, number>,
  step: 4,
  /** Where the visuals go: right of the navy rail (0 to 188), with the name of the page at the top. */
  content: { left: 224, right: 1256, top: 16, bottom: 704 },
  /** At most this many visuals on a page (design pass §8.1): more is slow to draw and hard to read. */
  maxVisuals: 12,
  /** The corner of a visual. */
  radius: 8,
  /** The space inside a visual. */
  padding: 12
} as const;

/**
 * The places of the Power Apps visuals (powerbi/README.md §6): Carlos sets them by hand in the service, so the report
 * files keep these rectangles free. The lint fails when a visual of the file is over one, apart from the app box under
 * it (build R4, D359): `does` and `gets` are its words, what the app does there and the data the visual gives it.
 * `boxHeight`: the app box is that high at the top of the place (Messages: the email chosen is drawn under it).
 */
export interface AppSlot { app: AppName; x: number; y: number; width: number; height: number; does: string; gets: string; boxHeight?: number; filter?: AppFilter }
/**
 * The filter of the visual on its page (README §6.4, §6.6), so the update script can say whether a carried visual still
 * has it (build A1, D382): a measure or a column of the model and the condition in words.
 */
export interface AppFilter { entity: string; property: string; kind: 'Measure' | 'Column'; words: string }
const FOR_THE_APP: AppFilter = { entity: 'CaseLines', property: 'For the app', kind: 'Measure', words: 'For the app is 1' };
export const APP_SLOTS: Record<string, AppSlot> = {
  mywork: { app: 'SACM actions', x: 956, y: 84, width: 300, height: 620,
    does: 'Assign lines, mark them fixed or in progress, hand over your work, add a note, and save.',
    gets: 'It gets every open line of this page (CaseLines, Queue lines).',
    filter: { entity: 'CaseLines', property: 'Queue lines', kind: 'Measure', words: 'Queue lines is not blank' } },
  // Build R6 (D371): the app on the right side, for the one email chosen in the list at the left (emails). In Desktop the
  // app box is a strip at the top, and the email chosen (appBoxHead, appBoxBody) under it.
  messages: { app: 'SACM messages', x: 676, y: 84, width: 580, height: 620, boxHeight: 88,
    does: 'Send, Test to me, Outlook draft and Teams, for the email chosen in the list at the left.',
    gets: 'It gets that one email (AppEmail, Selected email is 1). Below: the email chosen, as Desktop shows it.',
    filter: { entity: 'AppEmail', property: 'Selected email', kind: 'Measure', words: 'Selected email is 1' } },
  auditfollow: { app: 'SACM actions', x: 956, y: 84, width: 300, height: 620,
    does: 'Follow again: select lines of the table, pick Follow again, and save.',
    gets: 'It gets the lines not followed up (CaseLines, Status Not followed up).',
    filter: { entity: 'CaseLines', property: 'Status', kind: 'Column', words: 'Status is Not followed up' } },
  auditreview: { app: 'SACM audit', x: 956, y: 84, width: 300, height: 620,
    does: 'Start a new review, mark each CI of the sample same in EPO or not, and change the team\'s settings.',
    gets: 'It gets the CIs of the reviews (ReviewLines).' },
  // Build R6 (D374): 476 high, so the form does not scroll; About this card is short under it.
  card: { app: 'SACM actions', x: 956, y: 84, width: 300, height: 476,
    does: 'Assign the lines of this card, mark them fixed or in progress, share them out, or add a note.',
    gets: 'It gets the open lines of this card (CaseLines, For the app).', filter: FOR_THE_APP },
  // Taller since build D5: the app reads the person's replies (the reply reader), where the table of replies was.
  person: { app: 'SACM actions', x: 956, y: 84, width: 300, height: 568,
    does: 'Read the replies of this person, tick the lines they answer, then Mark answered, Waiting until or Add note.',
    gets: 'It gets the open lines and the replies of this person (CaseLines, For the app).', filter: FOR_THE_APP },
  case: { app: 'SACM actions', x: 956, y: 84, width: 300, height: 620,
    does: 'Mark the lines of this CI fixed or in progress, set a stage or a retirement date, stop following, or add a note.',
    gets: 'It gets the open lines of this CI (CaseLines, For the app).', filter: FOR_THE_APP }
};

/**
 * What the app turns a field of its visual back into (build A1, D377, D379): every field the Power Apps visual gets is
 * text, because the visual refused a number (Messages got no data at all) and a blank date (a banner on Case). The
 * generated named formula of each app (typedRows of tools/powerbi/actions.ts) turns it back: `text` as it is, `number`
 * with Value, `yesno` "true"/"false", `date` "yyyy-mm-dd" (blank when "").
 */
export type AppFieldKind = 'text' | 'number' | 'yesno' | 'date';
/** One field of a visual: the column of the model, what the app turns it into, and (for a `…Text` twin, D378) the name the app uses. */
export interface AppField { field: string; kind: AppFieldKind; as?: string }
export type AppName = 'SACM actions' | 'SACM messages' | 'SACM audit';
/**
 * The fields of the visual of one app: its table, the name of its typed rows in the app (Lines or AppRows), its fields in
 * order, and the section of powerbi/README.md that sets the app up (the update script names it).
 */
export interface AppFields { table: string; rows: string; readme: string; fields: AppField[] }
const asText = (...names: string[]): AppField[] => names.map((field) => ({ field, kind: 'text' }));
/**
 * The fields of the three Power Apps visuals, in the order README §6.4, §6.6 and §6.8 give them (D380): the one home
 * of these lists. The generator, the copy pack, the plain paste files, README, update.json and the lint read it. Every
 * visual also gets the measure APP_LAST_FIELD last.
 */
export const APP_FIELDS: Record<AppName, AppFields> = {
  'SACM actions': { table: 'CaseLines', rows: 'Lines', readme: '6.4', fields: [
    ...asText('Key', 'CheckId', 'CiName', 'Status', 'AssignedTo', 'Person', 'Actions', 'Stages', 'StageId', 'ExceptionReason'),
    { field: 'RetireOn', kind: 'date' },
    ...asText('ContactName', 'ShareTo', 'LastRef', 'Step', 'Card')
  ] },
  'SACM messages': { table: 'AppEmail', rows: 'AppRows', readme: '6.6', fields: [
    ...asText('Row', 'DraftId', 'EmailId'), { field: 'Piece', kind: 'number' },
    ...asText('Ref', 'Kind', 'KindLabel', 'To', 'ToName', 'Cc', 'Subject', 'Chat', 'Keys', 'NewKeys', 'FreeKeys'),
    { field: 'CiCount', kind: 'number' }, ...asText('About'), { field: 'NobodyAbove', kind: 'yesno' }, { field: 'Mailbox', kind: 'yesno' },
    ...asText('AssignedTo', 'Summary', 'EmailSubject'), { field: 'HtmlLength', kind: 'number' }, { field: 'CsvLength', kind: 'number' },
    ...asText('AddressWhy', 'Html', 'Csv')
  ] },
  'SACM audit': { table: 'ReviewLines', rows: 'Lines', readme: '6.8', fields: [
    ...asText('Review'), { field: 'IsNextText', kind: 'yesno', as: 'IsNext' }, { field: 'IsCurrentText', kind: 'yesno', as: 'IsCurrent' },
    { field: 'ReviewDateText', kind: 'date', as: 'ReviewDate' }, ...asText('Report'), { field: 'ReportDateText', kind: 'date', as: 'ReportDate' },
    ...asText('Group', 'CiKey', 'CiName', 'ClassLabel', 'ClassName', 'EpoId', 'Status', 'EpoStatus'), { field: 'AgreesText', kind: 'yesno', as: 'Agrees' },
    ...asText('Result', 'ResultLabel'), { field: 'EpoDateText', kind: 'date', as: 'EpoDate' }, { field: 'OrderText', kind: 'number', as: 'Order' }
  ] }
};
/** The measure every app visual gets last (build 0.52.0, D334): the time of the report's data, already text (D377). */
export const APP_LAST_FIELD = { table: 'About', measure: 'Report at' } as const;

/**
 * The place of the button Refresh now (the Power Automate visual of flow F6, which Carlos adds by hand in the service,
 * D333): on the rail of My day and Reports, above the line at its foot, under the refresh rule (railRefresh). On the rail
 * it counts as part of the rail (pages.ts rule 2); no visual may sit over it (rule 4) but its app box (build R4).
 */
export const FLOW_SLOTS: Record<string, { flow: string; x: number; y: number; width: number; height: number }> = {
  myday: { flow: 'SACM refresh now', x: 16, y: 588, width: 156, height: 60 },
  reports: { flow: 'SACM refresh now', x: 16, y: 588, width: 156, height: 60 }
};

/** The space a table's column needs beside its header text (the padding of the cell and the sort arrow), in px. */
export const CELL_PADDING = 16;
/** The part of a table's width the columns cannot use (the padding of the visual and a vertical scroll bar), in px. */
export const TABLE_CHROME = 40;

/** The colours of the series of a chart, in order (design pass §3.1): navy first, then the state colours. */
export const DATA_COLOURS = ['accent', 'blue', 'teal', 'violet', 'amber', 'red', 'grey'] as const;

/**
 * The average width of one character of 9 pt Segoe UI, in pixels, and of the semibold face. The lint uses them to say
 * when a title or a header no longer fits on one line (LOOK rule 3), before a picture shows it.
 */
export const CHAR_WIDTH = { 9: 6.4, 10: 7.1 } as Record<number, number>;
export const SEMIBOLD_FACTOR = 1.06;

/** The width in pixels a text takes at `points`, semibold or not (an estimate on the side of too wide). */
export function textWidth(text: string, points: number, semibold = false): number {
  const per = CHAR_WIDTH[points] ?? (points * 0.71);
  return Math.ceil(text.length * per * (semibold ? SEMIBOLD_FACTOR : 1));
}

/**
 * The colours of the email template (D313, tools/powerbi/email.ts and fnEmailTemplate, which generate.ts gives them as
 * EmailStyle): the light colours of LOOK where the email has the same part, and the few of the email lab (design pass
 * §6.2) that only an email has. Text is never lighter than `muted` (contrast 4.5:1, LOOK rule 8).
 */
export function emailColours(): Record<string, string> {
  const light = lightColours();
  return {
    ink: light.ink!, muted: light.muted!, navy: light.accent!, onNavy: light['on-accent']!, deco: light.deco!, line: light.line!, box: light['surface-2']!,
    surface: light.surface!,
    /** Around the email (the email lab). */
    page: '#f4f1ec',
    /** The reference in the navy band: light on navy. */
    navyMuted: '#c9cfe0',
    /** The header of a table. */
    head: '#eef1f8',
    /** Every second line of a table. */
    zebra: '#faf8f5',
    /** The box "What we ask". */
    ask: '#f3f5fa'
  };
}

/** The fonts of the email: Segoe UI as in the report, then what Outlook on a Mac or a phone has. */
export const EMAIL_FONT = "'Segoe UI',Aptos,Calibri,Arial,sans-serif";
