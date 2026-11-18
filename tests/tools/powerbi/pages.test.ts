import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageProblems, readCatalogue, readPages, themeProblems } from '../../../tools/powerbi/pages.ts';
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
  assert.ok(pageProblems(messages, catalogue).some((line) => /over the place of the Power Apps visual Messages/.test(line)));
  const card: ReportPages = { order: ['backlog', 'card'], pages: [page([]).pages[0]!, { page: { name: 'card', displayName: 'Card', width: 1280, height: 720, displayOption: 'FitToPage', pageBinding: { type: 'Drillthrough' } }, visuals: [] }] };
  assert.ok(pageProblems(card, catalogue).some((line) => /hidden from the team's tabs/.test(line)));
});

test('the theme sets only formatting Power BI has; a matrix has no total row of its own', () => {
  assert.deepEqual(themeProblems(theme() as never, catalogue), []);
  const problems = themeProblems({ visualStyles: { pivotTable: { '*': { total: [{ totals: false }] } }, sparkles: { '*': {} } } }, catalogue);
  assert.match(problems.join('\n'), /total\.totals/);
  assert.match(problems.join('\n'), /sparkles/);
});
