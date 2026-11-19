import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUDIT_PARTS, PAGES, RAIL_ITEMS, railFiles, railSvg, railVisuals, REPORT_FILE, staleRail } from '../../../tools/powerbi/rail.ts';
import { lightColours } from '../../../tools/powerbi/tokens.ts';

/*
 * The navy rail of every page (tools/powerbi/rail.ts, D319): written by generate.ts, the same on every page, in the
 * colours of LOOK.md, and up to date in the repository.
 */

test('the rail of the repository is the one rail.ts writes, with no part left over', () => {
  assert.deepEqual(staleRail(), []);
});

test('every page of the rail opens a page of the report, and every rail picture is registered in report.json', () => {
  const pages = (JSON.parse(readFileSync(join(PAGES, 'pages.json'), 'utf8')) as { pageOrder: string[] }).pageOrder;
  for (const { page } of [...RAIL_ITEMS, ...AUDIT_PARTS]) assert.ok(pages.includes(page), `${page} is not a page`);
  const report = JSON.parse(readFileSync(REPORT_FILE, 'utf8')) as { resourcePackages: Array<{ items: Array<{ name: string; type: string }> }> };
  const registered = report.resourcePackages.flatMap((entry) => entry.items);
  for (const page of pages) assert.ok(registered.some((item) => item.name === `rail-${page}.svg` && item.type === 'Image'), `rail-${page}.svg is not registered`);
  assert.ok(registered.some((item) => item.type === 'CustomTheme'), 'the theme stays registered');
});

test('the page in view is lit once; a drill-through page lights the page it belongs to; the Audit pages show their parts', () => {
  const lit = (svg: string) => (svg.match(/fill-opacity="0.12"/g) ?? []).length;
  assert.equal(lit(railSvg('myday', 720)), 1);
  assert.equal(lit(railSvg('selfcheck', 720)), 0, 'the Self-check is on no item');
  const person = railSvg('person', 720);
  assert.equal(lit(person), 1);
  assert.ok(/fill-opacity="0.12"\/>\n<rect x="8" y="92"/.test(person), 'Person lights Work queue, the second item');
  assert.ok(!person.includes('Lifecycle review'), 'the parts of the Audit show on its pages only');
  const follow = railSvg('auditfollow', 720);
  for (const part of AUDIT_PARTS) assert.ok(follow.includes(`>${part.label}<`), `${part.label} shows on the Audit pages`);
  assert.equal(lit(follow), 1, 'on a part of the Audit only the part is lit');
});

test('the rail uses the colours of LOOK.md only, and its picture is as tall as its page', () => {
  const look = new Set(Object.values(lightColours()));
  for (const { file, text } of railFiles()) {
    for (const hex of text.match(/#[0-9a-fA-F]{6}\b/g) ?? []) assert.ok(look.has(hex.toLowerCase()), `${file}: ${hex} is not a colour of LOOK.md`);
  }
  assert.ok(railSvg('case', 1440).includes('height="1440"'));
});

test('each item has a button that opens its page, the counts sit beside My day and Work queue, the foot line at the foot', () => {
  const visuals = railVisuals('myday', 720);
  const names = visuals.map((visual) => visual.name);
  for (const { page } of RAIL_ITEMS) assert.ok(names.includes(`railNav${page}`), `no button for ${page}`);
  assert.deepEqual(names.filter((name) => name.startsWith('railBadge')), ['railBadgemyday', 'railBadgemywork']);
  assert.ok(names.every((name) => name.startsWith('rail')), 'the lint counts the rail as one visual by its names');
  const nav = JSON.stringify(visuals.find((visual) => visual.name === 'railNavreports'));
  assert.ok(nav.includes("'PageNavigation'") && nav.includes("'reports'"));
  const about = visuals.find((visual) => visual.name === 'railAbout') as unknown as { position: { y: number; height: number } };
  assert.equal(about.position.y + about.position.height, 720 - 16);
  const tall = railVisuals('case', 1440).find((visual) => visual.name === 'railAbout') as unknown as { position: { y: number } };
  assert.equal(tall.position.y, 1440 - 68);
});
