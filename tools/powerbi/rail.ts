// The navy rail of every page (design pass §5.1, build D2, D319): the picture of the rail, the buttons that open the pages
// and the counts beside My day and Work queue, written by generate.ts on every page of pages.json.
//   - rail: an image visual (0, 0, 188 × the page height) that shows rail-<page>.svg, a registered resource of the report.
//     The picture draws the name, the icon and the label of each page, the page in view in a lighter band with a coral
//     line, and on the pages of the Audit its four parts.
//   - railNav<page>: a button on each item, clear until the pointer is on it, that opens its page.
//   - railBadge<page>: a small picture of a count (a measure of the model) beside My day and Work queue.
//   - railAbout: the version, the data and the last refresh at the foot.
// A page navigator would be one visual, but it has no icons and no counts, so the rail is these parts; the lint counts
// every visual whose name starts with rail as one (pages.ts rule 2). Same repository, same bytes.
import { existsSync, readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { FONT } from './tokens.ts';

const root = join(import.meta.dirname, '..', '..');
const REPORT = join(root, 'powerbi', 'SACM-Workbench.Report');
const PAGES = join(REPORT, 'definition', 'pages');
export const REPORT_FILE = join(REPORT, 'definition', 'report.json');
export const RESOURCES = join(REPORT, 'StaticResources', 'RegisteredResources');
const VISUAL_SCHEMA = 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.4.0/schema.json';

/** The colours of the rail (docs/LOOK.md): the navy accent, white, the soft accent for the words, the coral line. */
const NAVY = '#0c1c49';
const WHITE = '#ffffff';
const SOFT = '#e6e9f4';
const CORAL = '#fd472c';

/** The icons of the rail, 24 × 24 strokes (the mockups' shared.js). */
const ICONS: Record<string, string> = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5L12 13l8.5-6.5"/>',
  cards: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  map: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.8 7.8l3 7.5M16.2 7.8l-3 7.5M8.5 6h7"/>',
  contract: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  audit: '<path d="M9 3h6l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M9 13l2 2 4-4"/>',
  reports: '<path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/>',
  logo: `<rect x="3" y="3" width="13" height="13" rx="2"/><path d="M3 8h13M3 12h13M8 3v13M12 3v13" opacity=".6"/><circle cx="16" cy="16" r="4.2" stroke="${CORAL}"/><path d="M19 19l2.5 2.5" stroke="${CORAL}"/>`
};

/** A count beside an item: a measure that returns a small picture (dataCategory ImageUrl). */
type Badge = { table: string; measure: string; about: string };
/** The items of the rail, top to bottom: the page each opens, its label and icon. */
export const RAIL_ITEMS: Array<{ page: string; label: string; icon: string; badge?: Badge }> = [
  { page: 'myday', label: 'My day', icon: 'home', badge: { table: 'Findings', measure: 'Rail badge my day', about: 'the next steps of today' } },
  { page: 'mywork', label: 'Work queue', icon: 'inbox', badge: { table: 'Findings', measure: 'Rail badge work queue', about: 'the open lines' } },
  { page: 'messages', label: 'Messages', icon: 'mail' },
  { page: 'cards', label: 'Cards', icon: 'cards' },
  { page: 'backlog', label: 'Mapping', icon: 'map' },
  { page: 'contracts', label: 'Contracts', icon: 'contract' },
  { page: 'history', label: 'History', icon: 'history' },
  { page: 'activity', label: 'Activity', icon: 'activity' },
  { page: 'audit', label: 'Audit', icon: 'audit' },
  { page: 'reports', label: 'Reports', icon: 'reports' }
];
/** The parts of the Audit (D1 put them on its rail): shown under Audit on its four pages. */
export const AUDIT_PARTS: Array<{ page: string; label: string }> = [
  { page: 'audit', label: 'Record' },
  { page: 'auditexport', label: 'Export' },
  { page: 'auditfollow', label: 'Not followed' },
  { page: 'auditreview', label: 'Lifecycle review' }
];
/** The item a page that is not on the rail lights: a card belongs to Cards, a person and a CI to the Work queue. */
const BELONGS: Record<string, string> = { card: 'cards', person: 'mywork', case: 'mywork', auditexport: 'audit', auditfollow: 'audit', auditreview: 'audit' };

/** Where things are on the rail, in px. */
const RAIL = { width: 188, first: 52, pitch: 36, height: 32, partPitch: 32, partHeight: 28, x: 8, itemWidth: 172, badgeX: 136, badgeWidth: 32, badgeHeight: 24 };

/** Each place on the rail: an item, or a part of the Audit (on the Audit pages only). */
type Place = { page: string; label: string; icon?: string; badge?: Badge; y: number; height: number; part: boolean };
function places(page: string): Place[] {
  const inAudit = AUDIT_PARTS.some((part) => part.page === page);
  const out: Place[] = [];
  let y = RAIL.first;
  for (const item of RAIL_ITEMS) {
    out.push({ ...item, y, height: RAIL.height, part: false });
    y += RAIL.pitch;
    if (item.page === 'audit' && inAudit) {
      for (const part of AUDIT_PARTS) { out.push({ ...part, y, height: RAIL.partHeight, part: true }); y += RAIL.partPitch; }
      y += RAIL.pitch - RAIL.partPitch;
    }
  }
  return out;
}

/** The place the page lights: its own part of the Audit, else its item, else the item it belongs to (none for the Self-check). */
function lit(page: string, place: Place): boolean {
  if (place.part) return place.page === page;
  const inAudit = AUDIT_PARTS.some((part) => part.page === page);
  if (inAudit) return false;
  return place.page === (BELONGS[page] ?? page);
}

const escapeXml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The picture of the rail of a page. */
export function railSvg(page: string, height: number): string {
  const font = `font-family="${FONT}, sans-serif"`;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${RAIL.width}" height="${height}" viewBox="0 0 ${RAIL.width} ${height}">`,
    `<rect width="${RAIL.width}" height="${height}" fill="${NAVY}"/>`,
    `<g transform="translate(16 15) scale(0.8333)" fill="none" stroke="${WHITE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS.logo}</g>`,
    `<text x="44" y="30" ${font} font-size="14" font-weight="700" fill="${WHITE}">SACM Workbench</text>`
  ];
  const inAudit = AUDIT_PARTS.some((part) => part.page === page);
  for (const place of places(page)) {
    const on = lit(page, place);
    const open = !place.part && place.page === 'audit' && inAudit;
    if (on) {
      parts.push(`<rect x="${RAIL.x}" y="${place.y}" width="${RAIL.itemWidth}" height="${place.height}" rx="8" fill="${WHITE}" fill-opacity="0.12"/>`);
      parts.push(`<rect x="${RAIL.x}" y="${place.y + 4}" width="3" height="${place.height - 8}" rx="1.5" fill="${CORAL}"/>`);
    }
    const ink = on || open ? WHITE : SOFT;
    const fade = on || open ? '' : ' opacity="0.86"';
    if (place.icon) {
      parts.push(`<g transform="translate(18 ${place.y + 7}) scale(0.75)" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${fade}>${ICONS[place.icon]}</g>`);
    }
    const size = place.part ? 12 : 13;
    const base = place.y + Math.round(place.height / 2) + (place.part ? 4 : 5);
    parts.push(`<text x="46" y="${base}" ${font} font-size="${size}" font-weight="600" fill="${ink}"${fade}>${escapeXml(place.label)}</text>`);
  }
  parts.push('</svg>');
  return `${parts.join('\n')}\n`;
}

const literal = (value: string) => ({ expr: { Literal: { Value: value } } });
const colour = (hex: string) => ({ solid: { color: literal(`'${hex}'`) } });
const hidden = [{ properties: { show: literal('false') } }];
const measureRef = (table: string, measure: string) => ({ expr: { Measure: { Expression: { SourceRef: { Entity: table } }, Property: measure } } });
const noChrome = { background: hidden, border: hidden, dropShadow: hidden, visualHeader: hidden, title: hidden, subTitle: hidden };
const noPadding = [{ properties: { top: literal('0D'), bottom: literal('0D'), left: literal('0D'), right: literal('0D') } }];
const altText = (text: string) => [{ properties: { altText: literal(`'${text.replace(/'/g, "''")}'`) } }];

type Visual = Record<string, unknown> & { name: string };

/** The rail picture of a page, its buttons, its counts and its foot line, by visual name. */
export function railVisuals(page: string, height: number): Visual[] {
  const out: Visual[] = [];
  out.push({
    $schema: VISUAL_SCHEMA,
    name: 'rail',
    position: { x: 0, y: 0, z: 0, height, width: RAIL.width, tabOrder: 0 },
    visual: {
      visualType: 'image',
      objects: {
        general: [{ properties: { imageUrl: { expr: { ResourcePackageItem: { PackageName: 'RegisteredResources', PackageType: 1, ItemName: railFileName(page) } } } } }],
        imageScaling: [{ properties: { imageScalingType: literal("'Normal'") } }]
      },
      visualContainerObjects: { ...noChrome, padding: noPadding, general: altText('The pages of the SACM Workbench') },
      drillFilterOtherVisuals: true
    }
  });
  places(page).forEach((place, at) => {
    if (place.badge) {
      out.push({
        $schema: VISUAL_SCHEMA,
        name: `railBadge${place.page}`,
        position: { x: RAIL.badgeX, y: place.y + (place.height - RAIL.badgeHeight) / 2, z: 500, height: RAIL.badgeHeight, width: RAIL.badgeWidth, tabOrder: 500 },
        visual: {
          visualType: 'image',
          objects: { image: [{ properties: { sourceType: literal("'imageData'"), sourceField: measureRef(place.badge.table, place.badge.measure) } }] },
          visualContainerObjects: { ...noChrome, padding: noPadding, general: altText(`${place.label}: ${place.badge.about}`) },
          drillFilterOtherVisuals: true
        }
      });
    }
    const name = place.part ? `Audit: ${place.label}` : place.label;
    out.push({
      $schema: VISUAL_SCHEMA,
      name: `railNav${place.part ? 'Part' : ''}${place.page}`,
      position: { x: RAIL.x, y: place.y, z: 1000 + at, height: place.height, width: RAIL.itemWidth, tabOrder: 1 + at },
      visual: {
        visualType: 'actionButton',
        objects: {
          text: hidden,
          icon: hidden,
          outline: hidden,
          fill: [
            { properties: { show: literal('true') } },
            { properties: { fillColor: colour(WHITE), transparency: literal('100D') }, selector: { id: 'default' } },
            { properties: { fillColor: colour(WHITE), transparency: literal('90D') }, selector: { id: 'hover' } },
            { properties: { fillColor: colour(WHITE), transparency: literal('84D') }, selector: { id: 'press' } }
          ]
        },
        visualContainerObjects: {
          ...noChrome,
          padding: noPadding,
          general: altText(`Open ${name}`),
          visualLink: [{
            properties: {
              show: literal('true'),
              type: literal("'PageNavigation'"),
              navigationSection: literal(`'${place.page}'`),
              tooltip: literal(`'Open ${name}'`)
            }
          }]
        },
        drillFilterOtherVisuals: true
      }
    });
  });
  out.push({
    $schema: VISUAL_SCHEMA,
    name: 'railAbout',
    position: { x: 16, y: height - 68, z: 1000, height: 52, width: 156, tabOrder: 1000 },
    visual: {
      visualType: 'card',
      query: { queryState: { Values: { projections: [{ field: { Measure: { Expression: { SourceRef: { Entity: 'About' } }, Property: 'Rail line' } }, queryRef: 'About.Rail line', nativeQueryRef: 'Rail line', displayName: 'Rail line' }] } } },
      objects: {
        labels: [{ properties: { color: colour(SOFT), fontFamily: literal(`'${FONT}'`), fontSize: literal('9D') } }],
        categoryLabels: hidden,
        wordWrap: [{ properties: { show: literal('true') } }]
      },
      visualContainerObjects: {
        background: hidden,
        border: hidden,
        padding: [{ properties: { top: literal('0D'), bottom: literal('0D'), left: literal('4D'), right: literal('4D') } }],
        general: altText('The version, the data and the last refresh')
      },
      drillFilterOtherVisuals: true
    }
  });
  return out;
}

/** The resource name of the rail picture of a page. */
export const railFileName = (page: string): string => `rail-${page}.svg`;

/** The pages of the report (pages.json) with their height. */
function pages(): Array<{ page: string; height: number }> {
  const order = (JSON.parse(readFileSync(join(PAGES, 'pages.json'), 'utf8')) as { pageOrder: string[] }).pageOrder;
  return order.map((page) => ({ page, height: (JSON.parse(readFileSync(join(PAGES, page, 'page.json'), 'utf8')) as { height: number }).height }));
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** report.json with the theme and the rail pictures registered, the rest as it is. */
function reportJson(): string {
  const report = JSON.parse(readFileSync(REPORT_FILE, 'utf8')) as { resourcePackages: Array<{ name: string; items: Array<{ name: string; path: string; type: string }> }> };
  const registered = report.resourcePackages.find((entry) => entry.name === 'RegisteredResources')!;
  const others = registered.items.filter((item) => !/^rail-.*\.svg$/.test(item.name));
  registered.items = [...others, ...pages().map(({ page }) => ({ name: railFileName(page), path: railFileName(page), type: 'Image' }))];
  return json(report);
}

/** Every file of the rail, by path: the pictures, the visuals of each page and report.json. */
export function railFiles(): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  for (const { page, height } of pages()) {
    out.push({ file: join(RESOURCES, railFileName(page)), text: railSvg(page, height) });
    for (const visual of railVisuals(page, height)) out.push({ file: join(PAGES, page, 'visuals', visual.name, 'visual.json'), text: json(visual) });
  }
  out.push({ file: REPORT_FILE, text: reportJson() });
  return out;
}

/** The rail parts on disk that the rail no longer has: visual folders named rail… and rail pictures. */
function strayRail(): string[] {
  const wanted = new Set(railFiles().map((entry) => entry.file));
  const stray: string[] = [];
  for (const { page } of pages()) {
    const folder = join(PAGES, page, 'visuals');
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder)) if (/^rail/.test(name) && !wanted.has(join(folder, name, 'visual.json'))) stray.push(join(folder, name));
  }
  for (const name of readdirSync(RESOURCES)) if (/^rail-.*\.svg$/.test(name) && !wanted.has(join(RESOURCES, name))) stray.push(join(RESOURCES, name));
  return stray;
}

/** What is not as the rail writes it. */
export function staleRail(): string[] {
  const problems: string[] = [];
  for (const { file, text } of railFiles()) if (!existsSync(file) || readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== text) problems.push(`${relative(root, file)}: not the rail of tools/powerbi/rail.ts`);
  for (const path of strayRail()) problems.push(`${relative(root, path)}: a part of the rail that rail.ts no longer writes`);
  return problems;
}

/** Writes the rail and removes what it no longer has. */
export function writeRail(): number {
  for (const path of strayRail()) rmSync(path, { recursive: true, force: true });
  const files = railFiles();
  for (const { file, text } of files) { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, text); }
  return files.length;
}
