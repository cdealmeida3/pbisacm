// Shared parts of the browser checks: serves the built app, gives each "computer" its own private folder (the browser's
// private file system stands in for the folder picker), and counts the checks. Only invented data.
// Needs Playwright with Chromium. It is not part of the app and not in package.json: CI installs it, and a developer
// can use any Playwright that `require('playwright')` finds.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
export const root = join(import.meta.dirname, '..', '..');
export const sample = (file) => readFileSync(join(root, 'samples', file)).toString('latin1');

/** The private folder of one browser, with helpers the checks call through `window.__fs`. */
const INIT = `
  Object.defineProperty(window, 'indexedDB', { value: { open() { throw new Error('off'); } }, configurable: true });
  window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('Workbench', { create: true });
  window.__fs = {
    async root() { return (await navigator.storage.getDirectory()).getDirectoryHandle('Workbench', { create: true }); },
    async list() { const out = []; const walk = async (dir, prefix) => { for await (const e of dir.values()) { if (e.kind === 'file') out.push(prefix + e.name); else await walk(await dir.getDirectoryHandle(e.name), prefix + e.name + '/'); } }; await walk(await this.root(), ''); return out.sort(); },
    async dump() { const out = {}; const walk = async (dir, prefix) => { for await (const e of dir.values()) { if (e.kind === 'file') { const f = await (await dir.getFileHandle(e.name)).getFile(); const bytes = new Uint8Array(await f.arrayBuffer()); let text = ''; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); out[prefix + e.name] = text; } else await walk(await dir.getDirectoryHandle(e.name), prefix + e.name + '/'); } }; await walk(await this.root(), ''); return out; },
    async get(p) { const parts = p.split('/'); const name = parts.pop(); let dir = await this.root(); for (const part of parts) dir = await dir.getDirectoryHandle(part); return (await (await dir.getFileHandle(name)).getFile()).text(); },
    async putText(p, text) { const parts = p.split('/'); const name = parts.pop(); let dir = await this.root(); for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true }); const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(text); await w.close(); },
    async put(p, text) { const parts = p.split('/'); const name = parts.pop(); let dir = await this.root(); for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true }); const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(Uint8Array.from(text, (c) => c.charCodeAt(0) & 255)); await w.close(); },
    async del(p) { const parts = p.split('/'); const name = parts.pop(); let dir = await this.root(); try { for (const part of parts) dir = await dir.getDirectoryHandle(part); await dir.removeEntry(name); } catch {} }
  };`;

/** Starts the app in a headless browser. `name` labels the output; screenshots go to `outDir`. */
export async function open(name, outDir = join(root, '.build', 'browser')) {
  mkdirSync(outDir, { recursive: true });
  const { chromium } = require('playwright');
  const html = readFileSync(join(root, 'app', 'SACM-Workbench.html'));
  const server = createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
  await new Promise((done) => server.listen(0, done));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const results = [];
  const check = (label, ok, detail = '') => { results.push({ label, ok: !!ok }); console.log(ok ? '  PASS' : '  FAIL', label, detail ? `— ${detail}` : ''); };
  /** A new "computer": its own browser context and private folder. Page errors and network requests are counted. */
  const page = async (options = {}) => {
    const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, ...options });
    await context.addInitScript(INIT);
    const p = await context.newPage();
    p.errors = []; p.requests = [];
    p.on('pageerror', (e) => p.errors.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') p.errors.push(m.text()); });
    p.on('request', (q) => { if (!q.url().startsWith(url) && !q.url().startsWith('data:') && !q.url().startsWith('blob:') && !q.url().startsWith('mailto:')) p.requests.push(q.url()); });
    await p.goto(url);
    return p;
  };
  const close = async () => {
    await browser.close(); server.close();
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${name}: ${passed} of ${results.length} passed`);
    return { name, passed, total: results.length, failed: results.filter((r) => !r.ok).map((r) => r.label) };
  };
  return { page, check, close, outDir, results };
}

/* Helpers on the screens. */
export const cards = (p) => p.locator('section button[aria-pressed][aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
export const card = async (p, label) => (await cards(p)).filter((l) => l.startsWith(`${label}:`))[0] || '';
export const cardText = async (p, label) => (await p.locator(`section button[aria-pressed][aria-label^="${label}:"]`).first().innerText()).replace(/\s+/g, ' ');
/** The tooltip of a card: its hint, or the notes of a card that is partly or not tested. */
export const cardTip = async (p, label) => (await p.locator(`section button[aria-pressed][aria-label^="${label}:"]`).first().getAttribute('data-tip')) || '';
/** An attribute of a card (data-topic, data-kind, data-light). */
export const cardData = async (p, label, name) => (await p.locator(`section button[aria-pressed][aria-label^="${label}:"]`).first().getAttribute(`data-${name}`)) || '';
export async function openCard(p, label) {
  const c = p.locator(`section button[aria-pressed][aria-label^="${label}:"]`).first();
  if ((await c.getAttribute('aria-pressed')) !== 'true') await c.click();
  await p.waitForTimeout(500);
}
export async function closeCard(p) {
  const c = p.locator('section button[aria-pressed="true"]').first();
  if (await c.count()) { await c.click(); await p.waitForTimeout(300); }
}
export async function back(p) {
  const b = p.locator('header').getByRole('button', { name: 'My day', exact: true }).first();
  if (await b.count()) { await b.click(); await p.waitForTimeout(300); }
}
/** The text of the Reports strip, with its tiles open (the line opens by itself only when a report is missing or old). */
export async function tiles(p) {
  const section = p.locator('#reports-title').locator('xpath=ancestor::section');
  const show = section.locator('button[aria-controls="report-tiles"][aria-expanded="false"]');
  if (await show.count()) { await show.click(); await p.waitForTimeout(200); }
  return (await section.innerText()).replace(/\s+/g, ' ');
}
/** Turns a filter of the menu Filter on or off (To solve, Mine, Reminders, Escalations, New), then closes the menu. */
export async function filter(p, word) {
  await p.locator('[data-filter-row]').getByRole('button', { name: 'Filter' }).click();
  await p.getByRole('menuitemcheckbox', { name: word, exact: true }).click();
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
}
/** Presses an item of the menu More of the header (Choose reports, Refresh). */
export async function more(p, item) {
  await p.locator('header').getByRole('button', { name: 'More' }).click();
  await p.getByRole('menuitem', { name: item }).click();
}
/** Presses an item of the menu More of an owner group (Note, Take, Assign to, Stop following, Export) (build L3). */
export async function groupMenu(group, item) {
  await group.locator('[data-group-head]').getByRole('button', { name: 'More', exact: true }).click();
  await group.page().getByRole('menuitem', { name: item, exact: true }).click();
  await group.page().waitForTimeout(250);
}
/** Opens a folded owner group (only the first starts open, build L3). */
export async function unfold(group) {
  const toggle = group.locator('[data-group-head] button[data-rows]').first();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') { await toggle.click(); await group.page().waitForTimeout(200); }
}
/** Opens every folded owner group in `scope` (a card or a part of one). */
export async function unfoldAll(scope) {
  const folded = scope.locator('[data-group-head] button[data-rows][aria-expanded="false"]');
  while (await folded.count()) { await folded.first().click(); await scope.page().waitForTimeout(150); }
}
export async function startDemo(p) {
  await p.getByRole('button', { name: 'Try the demo' }).click();
  await p.waitForSelector('section button[aria-pressed][aria-label]', { timeout: 20000 });
  await p.waitForTimeout(800);
}
/** Opens the team folder and signs in. */
export async function signIn(p, name, email) {
  await p.getByRole('button', { name: /^Open folder$/ }).click();
  await p.getByLabel('Your name').fill(name); await p.getByLabel('Your email').fill(email);
  await p.getByRole('button', { name: 'Save' }).click(); await p.waitForTimeout(500);
}
/** Presses Load in the header and waits for its message. */
const LOADED = /[Rr]eports? loaded|Nothing new|No report was loaded/;
export async function loadLatest(p) {
  // The message of an earlier load stays 6 seconds: wait until it has gone, so the next one is not taken for it.
  await p.waitForFunction((src) => !new RegExp(src).test([...document.querySelectorAll('[role=status]')].map((e) => e.innerText).join(' ')), LOADED.source, { timeout: 15000 }).catch(() => {});
  await p.locator('header').getByRole('button', { name: 'Load', exact: true }).click();
  await p.waitForFunction((src) => new RegExp(src).test([...document.querySelectorAll('[role=status]')].map((e) => e.innerText).join(' ')), LOADED.source, { timeout: 120000 });
  await p.waitForTimeout(800);
}
