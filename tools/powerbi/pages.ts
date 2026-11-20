// The rules of the pages of the Power BI report (design pass §3.2 and §8.1, D311, D312, D318), checked by
// `npm run powerbi:lint` (step 10) and by the tests on small examples. They read the report files of
// powerbi/SACM-Workbench.Report/definition/ and Microsoft's schema of report themes, which lists every formatting
// property of every visual type:
//   1. Every page is 1280 × 720 and fits the page (a page of GRID.tallest may be taller and fits the width).
//   2. At most 12 visuals on a page (the rail counts as one, the Power App of the page's slot counts too); at most one
//      Power Apps visual, and none on the first page.
//   3. Native visuals only (D311): no custom visual, no R or Python visual, no picture from the web. The one exception is
//      the visual Carlos adds by hand in the service (a Power App, or the Power Automate button Refresh now): it sits
//      exactly on the place its page keeps for it (APP_SLOTS, FLOW_SLOTS), and Update-Workbench.ps1 carries it (D339).
//   4. The grid: every place and size on the 4 px grid, inside the page, inside the content frame (the rail apart),
//      no two visuals over each other, and none over the place a Power Apps visual is set by hand (APP_SLOTS), or the
//      button Refresh now on the rail of My day and Reports (FLOW_SLOTS, D333; the rail picture under it apart).
//   5. Tables: every column of a table has its width (a matrix makes a column per value, so it has none), the widths fit the visual (no scroll bar to the side), each header fits on
//      one line (LOOK rule 3), totals stay off and the values wrap.
//   6. Titles: a title written in the file fits on one line; every table, matrix and chart shows a line under its title
//      that a measure writes, so a box with no lines says why (D318: never a blank box).
//   7. No text under 9 pt (12 px, LOOK rule 8).
//   8. Every formatting property a visual sets is one Power BI has for its visual type (the theme schema), so nothing
//      is guessed (the pbip skill: never guess a visual's schema).
//   9. The drill-through pages and Self-check are hidden from the team's tabs.
//  10. Tabs (build D3, D323): a group of bookmarks with a bookmark navigator on its page. Each bookmark changes only
//      what its visuals show (never the filters, so a drill-through keeps its CI, card or person), the visuals of the
//      first tab show when the page opens and the others are hidden. Two visuals of one group may sit at the same place
//      when no tab shows both.
//  11. Words (build D6, D328): every text the files write (titles, the lines under them, buttons, headers, the tabs) has no
//      word in capitals (LOOK rule 1) and no three dots (rule 2); a button has at most two words (rule 4, a number or a
//      sign is no word), apart from the longer ones LOOK agrees. The same rules on the pages as drawn, and the contrast of
//      every text (rule 8), are checked on the pictures of the Desktop check (desktop.ts, judgeLook).
//  12. Folders (build R1, D340): every page folder is in pages.json and every page of pages.json has its folder; every
//      visual folder holds its visual.json, named as the folder (Desktop silently drops a visual whose name differs, the
//      pbip skill), and nothing else. So no panel of an old version can hide in the repository.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP_SLOTS, CELL_PADDING, FLOW_SLOTS, GRID, MIN_TEXT_POINTS, TABLE_CHROME, TEXT, textWidth } from './tokens.ts';

const root = join(import.meta.dirname, '..', '..');
export const REPORT_DEFINITION = join(root, 'powerbi', 'SACM-Workbench.Report', 'definition');
export const THEME_SCHEMA_FILE = join(import.meta.dirname, 'schemas', 'theme', 'reportThemeSchema-2.159.json');

interface Literal { expr?: { Literal?: { Value?: string }; Measure?: unknown } }
interface Entry { properties?: Record<string, Literal & Record<string, unknown>>; selector?: { metadata?: string; id?: string } }
interface Projection { queryRef: string; displayName?: string; field: Record<string, { Property?: string }> }
export interface Visual {
  name: string;
  /** Hidden when the page opens (a tab that is not the first, D323). */
  isHidden?: boolean;
  position: { x: number; y: number; width: number; height: number; z?: number };
  visual?: {
    visualType: string;
    query?: { queryState?: Record<string, { projections?: Projection[] }> };
    objects?: Record<string, Entry[]>;
    visualContainerObjects?: Record<string, Entry[]>;
  };
}
export interface Page { name: string; displayName: string; width: number; height: number; displayOption?: string; visibility?: string; pageBinding?: { type?: string } }
/** A group of bookmarks that are the tabs of a page: each tab shows some of the targets and hides the others. */
export interface TabGroup { name: string; page: string; tabs: Array<{ name: string; label: string; targets: string[]; shown: string[]; onlyDisplay: boolean }> }
export interface ReportPages { order: string[]; pages: Array<{ page: Page; visuals: Visual[] }>; tabGroups?: TabGroup[] }

interface BookmarkFile {
  name: string;
  displayName: string;
  options?: { targetVisualNames?: string[]; applyOnlyToTargetVisuals?: boolean; suppressData?: boolean };
  explorationState: { activeSection: string; sections: Record<string, { visualContainers: Record<string, { singleVisual?: { display?: { mode?: string } } }> }> };
}
/** The groups of bookmarks of the report (definition/bookmarks/), each with the page its bookmarks show. */
export function readTabGroups(definition = REPORT_DEFINITION): TabGroup[] {
  const folder = join(definition, 'bookmarks');
  if (!existsSync(join(folder, 'bookmarks.json'))) return [];
  const meta = JSON.parse(readFileSync(join(folder, 'bookmarks.json'), 'utf8')) as { items: Array<{ name: string; children?: string[] }> };
  return meta.items.filter((item) => item.children).map((item) => {
    const files = item.children!.map((child) => JSON.parse(readFileSync(join(folder, `${child}.bookmark.json`), 'utf8')) as BookmarkFile);
    const page = files[0]?.explorationState.activeSection ?? '';
    return {
      name: item.name,
      page,
      tabs: files.map((file) => {
        const targets = file.options?.targetVisualNames ?? [];
        const states = file.explorationState.sections[page]?.visualContainers ?? {};
        return {
          name: file.name,
          label: file.displayName,
          targets,
          shown: targets.filter((target) => states[target]?.singleVisual?.display?.mode !== 'hidden'),
          onlyDisplay: file.options?.applyOnlyToTargetVisuals === true && file.options?.suppressData === true && file.explorationState.activeSection === page
        };
      })
    };
  });
}

/**
 * The report as the rules read it: the pages in their order, each with its visuals. A page without page.json or a visual
 * folder without visual.json is left out here: rule 12 (folderProblems, run by the lint before this) reports it.
 */
export function readPages(definition = REPORT_DEFINITION): ReportPages {
  const folder = join(definition, 'pages');
  const order = (JSON.parse(readFileSync(join(folder, 'pages.json'), 'utf8')) as { pageOrder: string[] }).pageOrder;
  return {
    order,
    pages: order.filter((name) => existsSync(join(folder, name, 'page.json'))).map((name) => {
      const page = JSON.parse(readFileSync(join(folder, name, 'page.json'), 'utf8')) as Page;
      const visualsFolder = join(folder, name, 'visuals');
      const visuals = existsSync(visualsFolder)
        ? readdirSync(visualsFolder).sort().filter((visual) => existsSync(join(visualsFolder, visual, 'visual.json')))
          .map((visual) => JSON.parse(readFileSync(join(visualsFolder, visual, 'visual.json'), 'utf8')) as Visual)
        : [];
      return { page, visuals };
    }),
    tabGroups: readTabGroups(definition)
  };
}

/** For each visual type of Microsoft's theme schema: its formatting objects, each with its properties. */
export type Catalogue = Map<string, Map<string, Set<string>>>;

interface SchemaNode { $ref?: string; allOf?: SchemaNode[]; properties?: Record<string, SchemaNode>; items?: SchemaNode }
/** The formatting properties Power BI has, by visual type (and for the page and the report), from the theme schema. */
export function readCatalogue(file = THEME_SCHEMA_FILE): Catalogue {
  const schema = JSON.parse(readFileSync(file, 'utf8')) as { definitions: Record<string, SchemaNode>; properties: { visualStyles: { properties: Record<string, SchemaNode> } } };
  const resolve = (node: SchemaNode): SchemaNode => (node.$ref ? resolve(schema.definitions[node.$ref.split('/').at(-1)!]!) : node);
  const propertiesOf = (node: SchemaNode, out: Set<string>): void => {
    const real = resolve(node);
    for (const part of real.allOf ?? []) propertiesOf(part, out);
    for (const name of Object.keys(real.properties ?? {})) out.add(name);
  };
  const objectsOf = (node: SchemaNode, out: Map<string, Set<string>>): void => {
    const real = resolve(node);
    for (const part of real.allOf ?? []) objectsOf(part, out);
    for (const [object, value] of Object.entries(real.properties ?? {})) {
      const set = out.get(object) ?? new Set<string>();
      if (value.items) propertiesOf(value.items, set);
      out.set(object, set);
    }
  };
  const catalogue: Catalogue = new Map();
  for (const [type, node] of Object.entries(schema.properties.visualStyles.properties)) {
    const styles = node.properties?.['*'];
    if (!styles) continue;
    const objects = new Map<string, Set<string>>();
    objectsOf(styles, objects);
    catalogue.set(type, objects);
  }
  return catalogue;
}

/** The native visual types the report may use (D311); a custom visual, R, Python and the web picture are not here. */
export const NATIVE_TYPES = new Set(['tableEx', 'pivotTable', 'card', 'cardVisual', 'multiRowCard', 'textbox', 'actionButton', 'shape', 'slicer',
  'advancedSlicerVisual', 'listSlicer', 'textSlicer', 'lineChart', 'barChart', 'columnChart', 'clusteredBarChart', 'clusteredColumnChart',
  'lineClusteredColumnComboChart', 'pageNavigator', 'bookmarkNavigator', 'image']);
/** A visual Carlos adds by hand in the service (a Power App or the Power Automate button): any type not in the native list. */
export const isAppVisual = (visual: Visual): boolean => !NATIVE_TYPES.has(visual.visual?.visualType ?? '') && Boolean(visual.visual?.visualType);
/** The place a page keeps for the visual Carlos adds by hand: its Power App, else its button Refresh now. */
export const handPlacedSlot = (page: string): { x: number; y: number; width: number; height: number; label: string } | undefined => {
  const app = APP_SLOTS[page];
  if (app) return { ...app, label: `the Power Apps visual ${app.app}` };
  const flow = FLOW_SLOTS[page];
  return flow ? { ...flow, label: `the button Refresh now (the Power Automate visual of ${flow.flow})` } : undefined;
};
const samePlace = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/** Rule 12: the folders of the report, so a panel of an old version (a folder no file names) never stays behind. */
export function folderProblems(definition = REPORT_DEFINITION): string[] {
  const problems: string[] = [];
  const folder = join(definition, 'pages');
  const order = (JSON.parse(readFileSync(join(folder, 'pages.json'), 'utf8')) as { pageOrder: string[] }).pageOrder;
  const folders = readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  for (const name of folders) if (!order.includes(name)) problems.push(`Folders: pages/${name} is not a page of pages.json; Desktop would not show it. Delete the folder, or add the page to pageOrder`);
  for (const name of order) {
    if (!existsSync(join(folder, name, 'page.json'))) { problems.push(`Folders: the page ${name} of pages.json has no pages/${name}/page.json`); continue; }
    const page = JSON.parse(readFileSync(join(folder, name, 'page.json'), 'utf8')) as Page;
    if (page.name !== name) problems.push(`Folders: pages/${name}/page.json is named ${page.name}; the name and the folder must be the same (the pbip skill)`);
    for (const entry of readdirSync(join(folder, name), { withFileTypes: true })) {
      if (entry.name !== 'page.json' && entry.name !== 'visuals') problems.push(`Folders: pages/${name}/${entry.name} is not a part of a page (page.json and visuals/ only)`);
    }
    const visualsFolder = join(folder, name, 'visuals');
    if (!existsSync(visualsFolder)) continue;
    for (const entry of readdirSync(visualsFolder, { withFileTypes: true })) {
      const at = `Folders: pages/${name}/visuals/${entry.name}`;
      if (!entry.isDirectory()) { problems.push(`${at} is a file; a visual is a folder with its visual.json`); continue; }
      const files = readdirSync(join(visualsFolder, entry.name));
      if (!files.includes('visual.json')) { problems.push(`${at} has no visual.json: an old panel or a half copy. Delete the folder`); continue; }
      for (const file of files) if (file !== 'visual.json' && file !== 'mobile.json') problems.push(`${at}/${file} is not a part of a visual (visual.json and mobile.json only)`);
      const visual = JSON.parse(readFileSync(join(visualsFolder, entry.name, 'visual.json'), 'utf8')) as Visual;
      if (visual.name !== entry.name) problems.push(`${at}: its visual.json is named ${visual.name}; Desktop drops a visual whose name is not its folder's (the pbip skill)`);
    }
  }
  return problems;
}

/** The charts of that list: like a table, each shows a line under its title written by a measure. */
const CHART_TYPES = new Set(['lineChart', 'barChart', 'columnChart', 'clusteredBarChart', 'clusteredColumnChart', 'lineClusteredColumnComboChart']);
/** Visuals that may sit outside the content frame: the navy rail and what is on it. */
const RAIL_VISUAL = /^rail/;
/** A stand-in under the place of a Power App (build R4, D359): the box standIn and the visuals drawn under it (standIn…). */
const STAND_IN = /^standIn/;

const literal = (entry: Literal | undefined): string | undefined => entry?.expr?.Literal?.Value;

/** The longer button words LOOK rule 4 agrees (docs/LOOK.md §1), with N for a number; a test keeps the two lists the same. */
export const LONG_BUTTONS = ['Escalate to (name)', 'Mark N fixed', 'Mapping done: ask owner', 'Ask the owner', 'Send from mailbox', 'Hand over to (name)', 'Try the demo', 'Tell Process Management'];
/** Words in capitals that are the team's short names, not shouting (LOOK rule 1). */
export const NAMES_IN_CAPITALS = new Set(['SACM', 'CMDB', 'CIAA', 'EPO', 'CSV', 'CI', 'CIS', 'ID', 'BI', 'HTML', 'OK']);
/** The problems of one text against LOOK rules 1, 2 and (for a button) 4. */
export function wordProblems(text: string, button: boolean): string[] {
  const problems: string[] = [];
  const capitals = (text.match(/\b[A-Z]{2,}\b/g) ?? []).filter((word) => !NAMES_IN_CAPITALS.has(word));
  if (capitals.length) problems.push(`the word ${capitals[0]} is in capitals (LOOK rule 1)`);
  if (/\.\.\.|…/.test(text)) problems.push('three dots (LOOK rule 2)');
  if (button) {
    const words = text.split(/\s+/).filter((word) => /[A-Za-z]/.test(word));
    const agreed = LONG_BUTTONS.some((long) => new RegExp(`^${long.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('\\(name\\)', '.+').replace(/\bN\b/, '\\d+')}$`).test(text));
    if (words.length > 2 && !agreed) problems.push(`${words.length} words on a button, at most 2 (LOOK rule 4)`);
  }
  return problems;
}
/** Every literal text of a visual: its title and the line under it, a button's text, a text box, the column headers. */
export function textsOf(visual: Visual): Array<{ text: string; button: boolean }> {
  const out: Array<{ text: string; button: boolean }> = [];
  const button = visual.visual?.visualType === 'actionButton';
  for (const [group, isObjects] of [[visual.visual?.objects, true], [visual.visual?.visualContainerObjects, false]] as const) {
    for (const [object, entries] of Object.entries(group ?? {})) for (const entry of entries) {
      const value = literal(entry.properties?.text);
      if (value?.startsWith("'")) out.push({ text: value.slice(1, -1).replace(/''/g, "'"), button: button && isObjects && object === 'text' });
    }
  }
  // A text box keeps its words in paragraphs of runs (the name of each page and the line under it).
  for (const entry of visual.visual?.objects?.general ?? []) {
    const paragraphs = (entry.properties as { paragraphs?: Array<{ textRuns?: Array<{ value?: string }> }> } | undefined)?.paragraphs ?? [];
    for (const paragraph of paragraphs) {
      const words = (paragraph.textRuns ?? []).map((run) => run.value ?? '').join('');
      if (words.trim()) out.push({ text: words, button: false });
    }
  }
  for (const projection of projectionsOf(visual)) if (projection.displayName) out.push({ text: projection.displayName, button: false });
  return out;
}
const projectionsOf = (visual: Visual): Projection[] => Object.values(visual.visual?.query?.queryState ?? {}).flatMap((role) => role.projections ?? []);
const header = (projection: Projection): string => projection.displayName ?? Object.values(projection.field)[0]?.Property ?? projection.queryRef;
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const inside = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean =>
  a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;
/** The pages that are a drill-through target and a page of the team's tabs too (build R4, D362: Messages opens on a person). */
export const SHOWN_DRILL_PAGES = new Set(['messages']);

/** The problems of the pages, each as one line that names the page and the visual. */
export function pageProblems(report: ReportPages, catalogue: Catalogue): string[] {
  const problems: string[] = [];
  report.pages.forEach(({ page, visuals }, index) => {
    const where = `Pages: ${page.displayName}`;
    // 1. The size.
    const tallest = GRID.tallest[page.name] ?? GRID.height;
    if (page.width !== GRID.width || page.height > tallest || (tallest === GRID.height && page.height !== GRID.height)) {
      problems.push(`${where}: the page is ${page.width} × ${page.height}; it must be ${GRID.width} × ${tallest === GRID.height ? GRID.height : `at most ${tallest}`} (D312)`);
    }
    const fit = page.height === GRID.height ? 'FitToPage' : 'FitToWidth';
    if (page.displayOption !== fit) problems.push(`${where}: the page shows as ${page.displayOption ?? 'its default'}; a page of this height shows as ${fit}`);
    // 9. Hidden pages.
    if (((page.pageBinding?.type === 'Drillthrough' && !SHOWN_DRILL_PAGES.has(page.name)) || page.name === 'selfcheck' || page.name === 'datacheck') && page.visibility !== 'HiddenInViewMode') {
      problems.push(`${where}: a drill-through page, Self-check and Data check are hidden from the team's tabs (visibility HiddenInViewMode)`);
    }
    if (index === 0 && page.visibility === 'HiddenInViewMode') problems.push(`${where}: the first page is hidden`);
    // 2. How many.
    // The navy rail and what is on it (its picture, buttons, counts and foot line, tools/powerbi/rail.ts) count as one,
    // with the reports chip at the top right, which rail.ts writes on every page too (the frame of the page, build R3).
    // The Power App of the page's slot counts too: Carlos places it by hand, so it is not in the files (build D3).
    const apps = visuals.filter(isAppVisual);
    const handPlaced = APP_SLOTS[page.name] && !apps.length ? 1 : 0;
    // The button Refresh now sits on the rail and counts as part of it (FLOW_SLOTS).
    const frame = (visual: { name: string }): boolean => RAIL_VISUAL.test(visual.name) || visual.name === 'reportsChip';
    // The stand-in box under the app's place (build R4) counts as the app: the app covers it in the service.
    const counted = visuals.filter((visual) => !frame(visual) && visual.name !== 'standIn' && !(FLOW_SLOTS[page.name] && isAppVisual(visual))).length + (visuals.some(frame) ? 1 : 0) + handPlaced;
    if (counted > GRID.maxVisuals) problems.push(`${where}: ${counted} visuals${handPlaced ? ' with the Power App placed by hand' : ''}, more than ${GRID.maxVisuals} (design pass §8.1)`);
    if (apps.length > 1) problems.push(`${where}: ${apps.length} visuals added by hand (Power Apps, Power Automate); at most one on a page`);
    if (apps.some((visual) => /powerapps/i.test(visual.visual?.visualType ?? '')) && index === 0) problems.push(`${where}: a Power Apps visual on the first page; it opens slowly`);
    const slot = APP_SLOTS[page.name];
    const ownSlot = handPlacedSlot(page.name);
    // Rule 6 of the real-data plan (build R4, D359): the place of an app, or of the button Refresh now, has its stand-in,
    // which rail.ts writes, at the top of the place and under every other visual of the page (the rail picture apart).
    if (slot) {
      const standIn = visuals.find((visual) => visual.name === 'standIn');
      const lowest = Math.min(...visuals.filter((visual) => visual.name !== 'standIn' && visual.name !== 'rail').map((visual) => visual.position.z ?? 0));
      if (!standIn) problems.push(`${where}: no stand-in (standIn) on the place of the Power Apps visual ${slot.app}; run npm run powerbi:generate`);
      else if (standIn.position.x !== slot.x || standIn.position.y !== slot.y || standIn.position.width !== slot.width) problems.push(`${where} › standIn: not at the top of the place of ${slot.app} (${slot.x}, ${slot.y}, ${slot.width} wide)`);
      else if ((standIn.position.z ?? 0) >= lowest) problems.push(`${where} › standIn: not under every other visual (z ${standIn.position.z}), so the app might not cover it`);
    }
    if (FLOW_SLOTS[page.name] && !visuals.some((visual) => visual.name === 'railStandIn' && samePlace(visual.position, FLOW_SLOTS[page.name]!))) {
      problems.push(`${where}: no stand-in (railStandIn) on the place of the button Refresh now; run npm run powerbi:generate`);
    }
    for (const visual of visuals) {
      const at = `${where} › ${visual.name}`;
      const type = visual.visual?.visualType ?? '';
      // 3. Native only, apart from the visual added by hand, exactly on its place (D339).
      const notNative = isAppVisual(visual) || !type;
      if (notNative && !(type && ownSlot && samePlace(visual.position, ownSlot))) {
        problems.push(ownSlot && type
          ? `${at}: the visual type ${type} is not native; a visual added by hand sits exactly on the place of ${ownSlot.label} (${ownSlot.x}, ${ownSlot.y}, ${ownSlot.width} × ${ownSlot.height})`
          : `${at}: the visual type ${type || '(none)'} is not a native visual of the list (D311: no custom, R or Python visual)`);
      }
      if (notNative) continue;
      if (type === 'image' && JSON.stringify(visual.visual?.objects ?? {}).includes('"url"')) problems.push(`${at}: a picture from the web; pictures are resources of the report (D311)`);
      // 4. The grid.
      const { x, y, width, height } = visual.position;
      if ([x, y, width, height].some((value) => value % GRID.step !== 0)) problems.push(`${at}: place or size off the ${GRID.step} px grid (${x}, ${y}, ${width} × ${height})`);
      if (x < 0 || y < 0 || x + width > page.width || y + height > page.height) problems.push(`${at}: outside the page`);
      if (!RAIL_VISUAL.test(visual.name)) {
        const frame = GRID.content;
        if (x < frame.left || x + width > frame.right || y < frame.top || y + height > page.height - (GRID.height - frame.bottom)) {
          problems.push(`${at}: outside the content frame (x ${frame.left} to ${frame.right}, y ${frame.top} down to ${page.height - (GRID.height - frame.bottom)})`);
        }
        // Build R4 (D359): only a stand-in (a visual named standIn…) may be on the place, inside it and under every other visual.
        if (slot && STAND_IN.test(visual.name)) {
          if (!inside(visual.position, slot)) problems.push(`${at}: a stand-in sits inside the place of the Power Apps visual ${slot.app} (${slot.x}, ${slot.y}, ${slot.width} × ${slot.height})`);
        } else if (slot && overlap(visual.position, slot)) problems.push(`${at}: over the place of the Power Apps visual ${slot.app} (${slot.x}, ${slot.y}, ${slot.width} × ${slot.height})`);
        else if (STAND_IN.test(visual.name)) problems.push(`${at}: a stand-in on a page with no place for a Power App`);
      }
      const flowSlot = FLOW_SLOTS[page.name];
      if (flowSlot && visual.name !== 'rail' && visual.name !== 'railStandIn' && overlap(visual.position, flowSlot)) problems.push(`${at}: over the place of the button Refresh now (the Power Automate visual of ${flowSlot.flow}, ${flowSlot.x}, ${flowSlot.y}, ${flowSlot.width} × ${flowSlot.height})`);
      // 7. Text sizes.
      const formatting = JSON.stringify([visual.visual?.objects ?? {}, visual.visual?.visualContainerObjects ?? {}]);
      const sizes = formatting.matchAll(/"fontSize":\{"expr":\{"Literal":\{"Value":"(\d+(?:\.\d+)?)D"\}\}\}/g);
      for (const size of sizes) if (Number(size[1]) < MIN_TEXT_POINTS) problems.push(`${at}: text of ${size[1]} pt, under ${MIN_TEXT_POINTS} pt (12 px, LOOK rule 8)`);
      for (const run of formatting.matchAll(/"fontSize":"(\d+(?:\.\d+)?)pt"/g)) {
        if (Number(run[1]) < MIN_TEXT_POINTS) problems.push(`${at}: text of ${run[1]} pt, under ${MIN_TEXT_POINTS} pt (12 px, LOOK rule 8)`);
      }
      // 8. Every property is one Power BI has.
      const known = catalogue.get(type);
      if (known) {
        for (const group of [visual.visual?.objects, visual.visual?.visualContainerObjects]) {
          for (const [object, entries] of Object.entries(group ?? {})) {
            const properties = known.get(object);
            if (!properties) { problems.push(`${at}: the formatting object "${object}" is not one Power BI has for ${type}`); continue; }
            for (const entry of entries) for (const property of Object.keys(entry.properties ?? {})) {
              if (!properties.has(property)) problems.push(`${at}: the property ${object}.${property} is not one Power BI has for ${type}`);
            }
          }
        }
      }
      // 11. Words.
      for (const { text, button } of textsOf(visual)) for (const problem of wordProblems(text, button)) problems.push(`${at}: "${text}": ${problem}`);
      // 6. Titles and the line under them.
      const container = visual.visual?.visualContainerObjects ?? {};
      const title = container.title?.[0]?.properties;
      const titleText = literal(title?.text);
      if (titleText && literal(title?.show) !== 'false') {
        const words = titleText.slice(1, -1).replace(/''/g, "'");
        if (textWidth(words, TEXT.title, true) > width - 2 * GRID.padding) problems.push(`${at}: the title "${words}" does not fit on one line (LOOK rule 3)`);
      }
      if (type === 'tableEx' || type === 'pivotTable' || CHART_TYPES.has(type)) {
        const sub = container.subTitle?.[0]?.properties;
        if (literal(sub?.show) !== 'true' || !sub?.text?.expr?.Measure) problems.push(`${at}: no line under the title written by a measure: an empty box would say nothing (D318)`);
        if (!titleText) problems.push(`${at}: no title`);
      }
      // 5. Tables.
      if (type === 'tableEx' || type === 'pivotTable') {
        const objects = visual.visual?.objects ?? {};
        if (literal(objects.total?.[0]?.properties?.totals) === 'true') problems.push(`${at}: the total row is on (it adds up text; design pass §2.1)`);
        // A matrix may show the total of each row at its right (columnSubtotals, the column Open of the heat map, build D3):
        // its values are counts. A total row is never on.
        const allowed = type === 'pivotTable' ? ['columnSubtotals'] : [];
        for (const name of ['rowSubtotals', 'columnSubtotals']) if (!allowed.includes(name) && literal(objects.subTotals?.[0]?.properties?.[name]) === 'true') problems.push(`${at}: subtotals are on`);
        if (literal(objects.values?.[0]?.properties?.wordWrap) === 'false') problems.push(`${at}: the values do not wrap: a long text is cut`);
      }
      if (type === 'tableEx') {
        const widths = new Map((visual.visual?.objects?.columnWidth ?? []).map((entry) => [entry.selector?.metadata ?? '', Number((literal(entry.properties?.value) ?? '0').replace(/D$/, ''))]));
        let sum = 0;
        for (const projection of projectionsOf(visual)) {
          const columnWidth = widths.get(projection.queryRef);
          if (!columnWidth) { problems.push(`${at}: the column "${header(projection)}" has no width: Power BI sizes it to its text and the table scrolls to the side`); continue; }
          sum += columnWidth;
          const need = textWidth(header(projection), TEXT.table, true) + CELL_PADDING;
          if (columnWidth < need) problems.push(`${at}: the header "${header(projection)}" needs ${need} px, its column is ${columnWidth} (LOOK rule 3: no cut header)`);
        }
        if (sum > width - TABLE_CHROME) problems.push(`${at}: the columns take ${sum} px, the table has ${width - TABLE_CHROME}: it scrolls to the side`);
      }
    }
    // 10. Tabs.
    const groups = (report.tabGroups ?? []).filter((group) => group.page === page.name);
    for (const group of groups) {
      const at = `${where} › tabs ${group.name}`;
      const names = new Set(visuals.map((visual) => visual.name));
      const targets = new Set(group.tabs.flatMap((tab) => tab.targets));
      for (const tab of group.tabs) {
        if (!tab.onlyDisplay) problems.push(`${at}: the tab ${tab.name} must change only what its visuals show (applyOnlyToTargetVisuals, suppressData, its own page): a tab that sets filters loses the drill-through`);
        if (tab.targets.length !== targets.size || tab.targets.some((target) => !targets.has(target))) problems.push(`${at}: the tab ${tab.name} has other visuals than the other tabs of its group`);
      }
      for (const target of targets) if (!names.has(target)) problems.push(`${at}: the visual ${target} is not on the page`);
      const first = new Set(group.tabs[0]?.shown ?? []);
      for (const visual of visuals.filter((entry) => targets.has(entry.name))) {
        const hiddenNow = visual.isHidden === true;
        if (first.has(visual.name) === hiddenNow) problems.push(`${at}: ${visual.name} ${hiddenNow ? 'is hidden, but the first tab shows it' : 'shows, but the first tab hides it'}`);
      }
      for (const tab of group.tabs) for (const problem of wordProblems(tab.label, false)) problems.push(`${at}: the tab "${tab.label}": ${problem}`);
      const navigator = visuals.some((visual) => visual.visual?.visualType === 'bookmarkNavigator' && literal(visual.visual.objects?.bookmarks?.[0]?.properties?.bookmarkGroup) === `'${group.name}'`);
      if (!navigator) problems.push(`${at}: no bookmark navigator shows the tabs of this group`);
    }
    /** Whether two visuals are never shown together: both on the tabs of one group, and no tab shows both. */
    const apart = (a: string, b: string): boolean => groups.some((group) => group.tabs.every((tab) => tab.targets.includes(a) && tab.targets.includes(b) && !(tab.shown.includes(a) && tab.shown.includes(b))));
    // 4. No two visuals over each other (the parts of the rail sit on its picture, rail.ts places them; tabs, rule 10).
    // The Power App Carlos adds sits over its stand-ins (build R4, D359): that pair is meant.
    const placed = visuals.filter((visual) => !RAIL_VISUAL.test(visual.name));
    const underApp = (x: Visual, y: Visual): boolean => STAND_IN.test(x.name) && isAppVisual(y);
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        if (underApp(placed[a]!, placed[b]!) || underApp(placed[b]!, placed[a]!)) continue;
        if (overlap(placed[a]!.position, placed[b]!.position) && !apart(placed[a]!.name, placed[b]!.name)) problems.push(`${where}: ${placed[a]!.name} and ${placed[b]!.name} are over each other`);
      }
    }
  });
  for (const group of report.tabGroups ?? []) if (!report.order.includes(group.page)) problems.push(`Tabs ${group.name}: its page ${group.page} is not in the report`);
  return problems;
}

/**
 * The formatting of the theme that Power BI does not have for its visual type: the schema of themes lets any name
 * through, and Power BI drops it without a word (a matrix has no total.totals, its totals are subTotals). The styles
 * of every visual ('*') and of the page are checked against the visual types that have them.
 */
export function themeProblems(theme: { visualStyles?: Record<string, Record<string, Record<string, Array<Record<string, unknown>>>>> }, catalogue: Catalogue): string[] {
  const problems: string[] = [];
  for (const [type, styles] of Object.entries(theme.visualStyles ?? {})) {
    const known = type === '*' ? undefined : catalogue.get(type);
    if (type !== '*' && !known) { problems.push(`Theme: the visual type ${type} is not one Power BI has`); continue; }
    for (const [object, entries] of Object.entries(styles['*'] ?? {})) {
      // The styles of every visual hold what any visual type has.
      const properties = type === '*'
        ? [...catalogue.values()].reduce<Set<string> | undefined>((all, objects) => (objects.has(object) ? new Set([...(all ?? []), ...objects.get(object)!]) : all), undefined)
        : known?.get(object);
      if (!properties) { problems.push(`Theme: ${type}: the formatting object "${object}" is not one Power BI has`); continue; }
      for (const entry of entries) for (const property of Object.keys(entry)) {
        if (!properties.has(property)) problems.push(`Theme: ${type}: the property ${object}.${property} is not one Power BI has`);
      }
    }
  }
  return problems;
}
