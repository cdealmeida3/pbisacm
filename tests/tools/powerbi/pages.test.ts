import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { folderProblems, LONG_BUTTONS, pageProblems, readCatalogue, readPages, themeProblems, wordProblems } from '../../../tools/powerbi/pages.ts';
import { APP_SLOTS } from '../../../tools/powerbi/tokens.ts';
import type { ReportPages, Visual } from '../../../tools/powerbi/pages.ts';
import { theme } from '../../../tools/powerbi/generate.ts';

/*
 * The rules of the pages (tools/powerbi/pages.ts, design pass §8.1): the report keeps them, and each rule finds the
 * fault it is for on a small page made here.
 */

const catalogue = readCatalogue();
const lit = (value: string) => ({ expr: { Literal: { Value: value } } });
const measure = (table: string, name: string) => ({ expr: { Measure: { Expression: { SourceRef: { Entity: table } }, Property: name } } });
const column = (name: string) => ({ field: { Column: { Expression: { SourceRef: { Entity: 'Findings' } }, Property: name } }, queryRef: `Findings.${name}`, displayName: name });

const table = (name: string, position: Visual['position'], widths: number[]): Visual => ({
  name,
  position,
  visual: {
    visualType: 'tableEx',
    query: { queryState: { Values: { projections: [column('CiName'), column('Owner')] } } },
    objects: { columnWidth: widths.map((width, index) => ({ properties: { value: lit(`${width}D`) }, selector: { metadata: `Findings.${['CiName', 'Owner'][index]}` } })) },
    visualContainerObjects: { title: [{ properties: { show: lit('true'), text: lit("'Lines'") } }], subTitle: [{ properties: { show: lit('true'), text: measure('Findings', 'Lines note') } }] }
  }
});
const page = (visuals: Visual[], extra: Partial<ReportPages['pages'][number]['page']> = {}): ReportPages => ({
  order: ['backlog'],
  pages: [{ page: { name: 'backlog', displayName: 'Backlog', width: 1280, height: 720, displayOption: 'FitToPage', ...extra }, visuals }]
});

test('the pages of the report keep every rule', () => {
  assert.deepEqual(pageProblems(readPages(), catalogue), []);
});

test('the catalogue of Power BI has the formatting the report uses', () => {
  assert.ok(catalogue.get('tableEx')?.get('columnWidth')?.has('value'));
  assert.ok(catalogue.get('tableEx')?.get('subTitle')?.has('text'));
  assert.ok(catalogue.get('actionButton')?.get('text')?.has('horizontalAlignment'));
});

test('a good page has no problem', () => {
  assert.deepEqual(pageProblems(page([table('lines', { x: 224, y: 84, width: 508, height: 300 }, [200, 200])]), catalogue), []);
});

test('the size, the grid, the frame and two visuals over each other are found', () => {
  const problems = pageProblems(page([
    table('lines', { x: 222, y: 84, width: 508, height: 300 }, [200, 200]),
    table('more', { x: 700, y: 200, width: 600, height: 300 }, [200, 200])
  ], { height: 1000 }), catalogue);
  assert.ok(problems.some((line) => /1280 × 1000/.test(line)));
  assert.ok(problems.some((line) => /off the 4 px grid/.test(line)));
  assert.ok(problems.some((line) => /outside the content frame/.test(line)));
  assert.ok(problems.some((line) => /over each other/.test(line)));
});

test('a table whose columns are too wide, a cut header, a column with no width, totals on, values not wrapping', () => {
  const wide = table('lines', { x: 224, y: 84, width: 508, height: 300 }, [300, 300]);
  const cut = table('cut', { x: 744, y: 84, width: 512, height: 300 }, [20]);
  cut.visual!.objects!.total = [{ properties: { totals: lit('true') } }];
  cut.visual!.objects!.values = [{ properties: { wordWrap: lit('false') } }];
  const problems = pageProblems(page([wide, cut]), catalogue).join('\n');
  assert.match(problems, /the columns take 600 px/);
  assert.match(problems, /the header "CiName" needs/);
  assert.match(problems, /"Owner" has no width/);
  assert.match(problems, /total row is on/);
  assert.match(problems, /do not wrap/);
});

test('a table with no line by a measure under its title, small text, a property Power BI does not have', () => {
  const visual = table('lines', { x: 224, y: 84, width: 508, height: 300 }, [200, 200]);
  visual.visual!.visualContainerObjects!.subTitle = [{ properties: { show: lit('true'), text: lit("'Nothing'") } }];
  visual.visual!.objects!.values = [{ properties: { fontSize: lit('8D'), sparkle: lit('true') } }];
  const problems = pageProblems(page([visual]), catalogue).join('\n');
  assert.match(problems, /no line under the title written by a measure/);
  assert.match(problems, /text of 8 pt/);
  assert.match(problems, /values\.sparkle is not one Power BI has/);
});

test('a custom visual, too many visuals, a visual over the place of a Power App, a drill-through page shown', () => {
  const many = Array.from({ length: 13 }, (_, index) => table(`t${index}`, { x: 224, y: 84 + index * 40, width: 508, height: 36 }, [200, 200]));
  many[0]!.visual!.visualType = 'customChart1234';
  assert.ok(pageProblems(page(many, { height: 720 }), catalogue).some((line) => /13 visuals/.test(line)));
  assert.ok(pageProblems(page(many), catalogue).some((line) => /not a native visual/.test(line)));
  const messages: ReportPages = { order: ['messages'], pages: [{ page: { name: 'messages', displayName: 'Messages', width: 1280, height: 720, displayOption: 'FitToPage' }, visuals: [table('wide', { x: 224, y: 84, width: 1032, height: 300 }, [200, 200])] }] };
  assert.ok(pageProblems(messages, catalogue).some((line) => /over the place of the Power Apps visual SACM messages/.test(line)));
  // The Power App placed by hand in the slot of a page counts: 12 visuals and the app are 13.
  const twelve = Array.from({ length: 12 }, (_, index) => table(`t${index}`, { x: 224, y: 84 + index * 52, width: 508, height: 48 }, [200, 200]));
  const withApp: ReportPages = { order: ['messages'], pages: [{ page: { name: 'messages', displayName: 'Messages', width: 1280, height: 720, displayOption: 'FitToPage' }, visuals: twelve }] };
  assert.ok(pageProblems(withApp, catalogue).some((line) => /13 visuals with the Power App placed by hand/.test(line)));
  const card: ReportPages = { order: ['backlog', 'card'], pages: [page([]).pages[0]!, { page: { name: 'card', displayName: 'Card', width: 1280, height: 720, displayOption: 'FitToPage', pageBinding: { type: 'Drillthrough' } }, visuals: [] }] };
  assert.ok(pageProblems(card, catalogue).some((line) => /hidden from the team's tabs/.test(line)));
});

test('the theme sets only formatting Power BI has; a matrix has no total row of its own', () => {
  assert.deepEqual(themeProblems(theme() as never, catalogue), []);
  const problems = themeProblems({ visualStyles: { pivotTable: { '*': { total: [{ totals: false }] } }, sparkles: { '*': {} } } }, catalogue);
  assert.match(problems.join('\n'), /total\.totals/);
  assert.match(problems.join('\n'), /sparkles/);
});

test('tabs: two tables at one place on two tabs are fine; a tab that sets filters, a wrong first tab or no navigator is a problem', () => {
  const navigator: Visual = { name: 'tabs', position: { x: 224, y: 84, width: 300, height: 40 }, visual: { visualType: 'bookmarkNavigator', objects: { bookmarks: [{ properties: { bookmarkGroup: lit("'backlogTabs'") } }] } } };
  const lines = table('lines', { x: 224, y: 136, width: 508, height: 300 }, [200, 200]);
  const other: Visual = { ...table('other', { x: 224, y: 136, width: 508, height: 300 }, [200, 200]), isHidden: true };
  const tabGroups = (onlyDisplay: boolean): ReportPages['tabGroups'] => [{
    name: 'backlogTabs', page: 'backlog',
    tabs: [{ name: 'a', label: 'A', targets: ['lines', 'other'], shown: ['lines'], onlyDisplay }, { name: 'b', label: 'B', targets: ['lines', 'other'], shown: ['other'], onlyDisplay }]
  }];
  assert.deepEqual(pageProblems({ ...page([navigator, lines, other]), tabGroups: tabGroups(true) }, catalogue), []);
  const problems = pageProblems({ ...page([lines, { ...other, isHidden: false }]), tabGroups: tabGroups(false) }, catalogue).join('\n');
  assert.match(problems, /must change only what its visuals show/);
  assert.match(problems, /other shows, but the first tab hides it/);
  assert.match(problems, /no bookmark navigator/);
  assert.match(pageProblems(page([lines, other]), catalogue).join('\n'), /lines and other are over each other/);
});

test('words (LOOK rules 1, 2, 4): capitals, three dots, more than two words on a button, apart from the agreed ones', () => {
  assert.deepEqual(wordProblems('Mark 3 fixed', true), []);
  assert.deepEqual(wordProblems('Escalate to Ada Owner', true), []);
  assert.deepEqual(wordProblems('‹ Back', true), []);
  assert.deepEqual(wordProblems('Open the SACM list of the CMDB', false), [], 'a title may be long, and the team\'s short names are not capitals');
  assert.match(wordProblems('Export for the auditor', true).join(), /4 words on a button/);
  assert.match(wordProblems('Send NOW', true).join(), /NOW is in capitals/);
  assert.match(wordProblems('Show all...', false).join(), /three dots/);
  const button: Visual = { name: 'go', position: { x: 224, y: 84, width: 160, height: 32 }, visual: { visualType: 'actionButton', objects: { text: [{ properties: { show: lit('true'), text: lit("'Open the record now'") } }] } } };
  assert.match(pageProblems(page([button]), catalogue).join('\n'), /go: "Open the record now": 4 words on a button/);
  const textbox: Visual = { name: 'title', position: { x: 224, y: 16, width: 400, height: 56 }, visual: { visualType: 'textbox', objects: { general: [{ properties: { paragraphs: [{ textRuns: [{ value: 'MY DAY' }] }] } as never }] } } };
  assert.match(pageProblems(page([textbox]), catalogue).join('\n'), /title: "MY DAY": the word MY is in capitals/, 'the words of a text box are read');
});

test('the longer button words of the lint are those of LOOK rule 4', () => {
  const look = readFileSync(join(import.meta.dirname, '..', '..', '..', 'docs', 'LOOK.md'), 'utf8');
  const agreed = /agreed longer ones \((.*)\)\./.exec(look)?.[1]?.split(', ');
  assert.deepEqual(agreed, LONG_BUTTONS);
});

const root = join(import.meta.dirname, '..', '..', '..');
/** An invented Power Apps visual, as Carlos adds it in the service (any type that is not native). */
const handAdded = (position: { x: number; y: number; width: number; height: number }): string =>
  JSON.stringify({ name: 'app', position: { ...position, z: 9000 }, visual: { visualType: 'PowerApps_PBI_CV_INVENTED' } });

test('rule 12 finds a page folder no file names, a half copy and a renamed visual; rule 3 keeps a visual added by hand on its place (D340)', () => {
  const at = mkdtempSync(join(tmpdir(), 'sacm-folders-'));
  try {
    const definition = join(at, 'definition');
    cpSync(join(root, 'powerbi', 'SACM-Workbench.Report', 'definition'), definition, { recursive: true });
    mkdirSync(join(definition, 'pages', 'oldpage'));
    mkdirSync(join(definition, 'pages', 'case', 'visuals', 'halfcopy'));
    mkdirSync(join(definition, 'pages', 'case', 'visuals', 'renamed'));
    writeFileSync(join(definition, 'pages', 'case', 'visuals', 'renamed', 'visual.json'), JSON.stringify({ name: 'other', position: { x: 224, y: 84, width: 8, height: 8 }, visual: { visualType: 'shape' } }));
    const problems = folderProblems(definition);
    assert.ok(problems.some((line) => line.includes('pages/oldpage is not a page of pages.json')), problems.join('\n'));
    assert.ok(problems.some((line) => line.includes('visuals/halfcopy has no visual.json')), problems.join('\n'));
    assert.ok(problems.some((line) => line.includes('visuals/renamed: its visual.json is named other')), problems.join('\n'));

    rmSync(join(definition, 'pages', 'oldpage'), { recursive: true });
    rmSync(join(definition, 'pages', 'case', 'visuals', 'halfcopy'), { recursive: true });
    rmSync(join(definition, 'pages', 'case', 'visuals', 'renamed'), { recursive: true });
    mkdirSync(join(definition, 'pages', 'case', 'visuals', 'app'));
    writeFileSync(join(definition, 'pages', 'case', 'visuals', 'app', 'visual.json'), handAdded({ x: 952, y: 84, width: 300, height: 620 }));
    assert.deepEqual(folderProblems(definition), []);
    const pageLines = pageProblems(readPages(definition), readCatalogue());
    assert.ok(pageLines.some((line) => line.includes('› app: the visual type PowerApps_PBI_CV_INVENTED is not native; a visual added by hand sits exactly on the place')), pageLines.join('\n'));
    writeFileSync(join(definition, 'pages', 'case', 'visuals', 'app', 'visual.json'), handAdded({ x: APP_SLOTS.case!.x, y: APP_SLOTS.case!.y, width: APP_SLOTS.case!.width, height: APP_SLOTS.case!.height }));
    assert.deepEqual(pageProblems(readPages(definition), readCatalogue()), []);
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});

test('build R4 (D359): a page with an app has its app box under it, a page with Refresh now has its rail app box; an app box off its place or over the others is found', () => {
  const at = mkdtempSync(join(tmpdir(), 'sacm-standin-'));
  try {
    const definition = join(at, 'definition');
    cpSync(join(root, 'powerbi', 'SACM-Workbench.Report', 'definition'), definition, { recursive: true });
    const file = (pageName: string, visual: string) => join(definition, 'pages', pageName, 'visuals', visual, 'visual.json');
    const lines = () => pageProblems(readPages(definition), readCatalogue());
    // The app Carlos adds over the app box is not "over each other".
    mkdirSync(join(definition, 'pages', 'case', 'visuals', 'app'));
    writeFileSync(file('case', 'app'), handAdded({ x: APP_SLOTS.case!.x, y: APP_SLOTS.case!.y, width: APP_SLOTS.case!.width, height: APP_SLOTS.case!.height }));
    assert.deepEqual(lines(), []);

    const appBox = JSON.parse(readFileSync(file('case', 'appBox'), 'utf8'));
    writeFileSync(file('case', 'appBox'), JSON.stringify({ ...appBox, position: { ...appBox.position, x: appBox.position.x - 8 } }));
    assert.ok(lines().some((line) => line.includes('Case › appBox: not at the top of the place')), lines().join('\n'));
    writeFileSync(file('case', 'appBox'), JSON.stringify({ ...appBox, position: { ...appBox.position, z: 99999 } }));
    assert.ok(lines().some((line) => line.includes('Case › appBox: not under every other visual')), lines().join('\n'));
    rmSync(join(definition, 'pages', 'case', 'visuals', 'appBox'), { recursive: true });
    assert.ok(lines().some((line) => line.includes('Case: no app box (appBox)')), lines().join('\n'));
    rmSync(join(definition, 'pages', 'myday', 'visuals', 'railAppBox'), { recursive: true });
    assert.ok(lines().some((line) => line.includes('My day: no app box (railAppBox)')), lines().join('\n'));
    // An app box on a page with no app.
    cpSync(join(definition, 'pages', 'person', 'visuals', 'appBox'), join(definition, 'pages', 'reports', 'visuals', 'appBox'), { recursive: true });
    assert.ok(lines().some((line) => line.includes('an app box on a page with no place for a Power App')), lines().join('\n'));
  } finally {
    rmSync(at, { recursive: true, force: true });
  }
});
