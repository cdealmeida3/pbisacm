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
 * files keep these rectangles free. The lint fails when a visual of the file is over one.
 */
export const APP_SLOTS: Record<string, { app: string; x: number; y: number; width: number; height: number }> = {
  mywork: { app: 'SACM actions', x: 956, y: 84, width: 300, height: 620 },
  messages: { app: 'SACM messages', x: 956, y: 84, width: 300, height: 620 },
  auditfollow: { app: 'SACM actions', x: 956, y: 84, width: 300, height: 620 },
  auditreview: { app: 'SACM audit', x: 956, y: 84, width: 300, height: 620 },
  card: { app: 'SACM actions', x: 956, y: 84, width: 300, height: 300 },
  person: { app: 'SACM actions', x: 956, y: 84, width: 300, height: 368 },
  case: { app: 'SACM actions', x: 956, y: 84, width: 300, height: 620 }
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
