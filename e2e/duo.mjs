// End-to-end: two people share one phone, side by side, in both games. Each taps their own column;
// a locked pick says "Locked in" and never shows which shape it was.
// Run: npm run e2e   (needs Playwright with Chromium; screenshots go to e2e/shots/)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../server/index.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const shots = process.env.SHOTS || path.join(here, 'shots');
mkdirSync(shots, {recursive: true});

const app = createServer();
const port = await app.listen(0, '127.0.0.1');
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
const errors = [];
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

async function phone(name, opts = {}){
  const ctx = await browser.newContext({viewport: {width: 390, height: 800}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: opts.dark ? 'dark' : 'light'});
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  return page;
}
const shot = (p, file) => p.screenshot({path: path.join(shots, file)});
const visible = (p, sel) => p.locator(sel).isVisible();
// Both people tap a random shape in their own column, unless they already have.
async function bothTap(p, tray){
  for (const i of [0, 1]) {
    const col = p.locator(`${tray} .duo-col`).nth(i);
    if (!(await col.count()) || await col.evaluate(c => c.classList.contains('locked')).catch(() => true)) continue;
    await col.locator('.dpick:not([disabled])').nth(Math.floor(Math.random() * 3)).click({timeout: 1000}).catch(() => {});
  }
}
// What a locked column gives away: its text, and any button marked as chosen or pressed.
const giveaway = (p, tray, i) => p.locator(`${tray} .duo-col`).nth(i).evaluate(c => ({
  state: c.querySelector('.duo-state').textContent,
  marked: c.querySelectorAll('.chosen, [aria-pressed="true"]').length,
  same: new Set([...c.querySelectorAll('.dpick')].map(b => b.className + getComputedStyle(b).opacity)).size
}));

try {
  // ---- Stone Paper Scissors ----
  const sps = await phone('SPS duo');
  await sps.goto(base + '/');
  await sps.click('#tab-local');
  await sps.click('[data-seat="1"][data-type="person"]');
  check((await sps.textContent('#play-label')).includes('Start with 2 players'), 'seat 2 can be a second person');
  check((await sps.textContent('#players-hint')).includes('same time'), 'the hint says both pick at the same time');
  await sps.click('[data-act="plus"]');
  await sps.click('[data-seat="2"][data-type="person"]');
  await sps.waitForSelector('#toast:not([hidden])');
  check(await sps.locator('[data-seat="2"][data-type="bot"][aria-pressed="true"]').count() === 1 && /play online/.test(await sps.textContent('#toast')), 'a third person on one phone is refused, with a pointer to online play');
  await sps.click('[data-act="minus"]');
  await sps.fill('#name-0', 'Asha');
  await sps.fill('#name-1', 'Ravi');
  await sps.click('#btn-play');
  await sps.waitForSelector('#tray .duo');
  check(await sps.locator('#tray .duo-col').count() === 2, 'the tray splits into two columns, one each');
  check(await sps.locator('#handoff, [data-act="ready"]').count() === 0, 'no pass-the-phone screen anywhere');
  await shot(sps, 'duo-01-sps-pick.png');
  await sps.locator('#tray .duo-col').nth(0).locator('.dpick').nth(1).click();
  const g = await giveaway(sps, '#tray', 0);
  check(g.state === 'Locked in' && g.marked === 0 && g.same === 1, 'Asha’s pick shows only “Locked in”, never the shape');
  check(!(await sps.locator('#tray .duo-col').nth(1).evaluate(c => c.classList.contains('locked'))), 'Ravi can still pick');
  await shot(sps, 'duo-02-sps-locked.png');
  await sps.locator('#tray .duo-col').nth(1).locator('.dpick').nth(0).click();
  await sps.waitForFunction(() => /wraps|crushes|cuts|Asha|Ravi/.test(document.querySelector('#band')?.textContent || ''), null, {timeout: 6000});
  check(true, 'both in: the round reveals at once');
  await sps.waitForTimeout(900);
  await shot(sps, 'duo-03-sps-reveal.png');
  const t0 = Date.now();
  while (Date.now() - t0 < 120000 && !(await visible(sps, '#screen-end'))) {
    const r = sps.locator('[data-act="results"]');
    if (await r.isVisible().catch(() => false)) { await r.click().catch(() => {}); continue; }
    await bothTap(sps, '#tray');
    await sps.waitForTimeout(250);
  }
  check(await visible(sps, '#screen-end'), `two people on one phone play a match to the end in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  check(/Asha|Ravi/.test(await sps.textContent('#end-title')), `the end names the winner (${await sps.textContent('#end-title')})`);

  // ---- Snakes & Ladders ----
  const sl = await phone('Snakes duo', {dark: true});
  await sl.goto(base + '/');
  await sl.click('[data-game="snakes"]');
  await sl.click('#tab-local');
  await sl.click('[data-sl-people="2"]');
  check(await visible(sl, '#sl-names'), 'two name boxes appear for two people');
  await sl.fill('#sl-name-0', 'Meera');
  await sl.fill('#sl-name-1', 'Kabir');
  while (!(await sl.locator('[data-act="sl-minus"]').isDisabled())) await sl.click('[data-act="sl-minus"]');
  check((await sl.textContent('#sl-bots-count')) === '0' && (await sl.textContent('#sl-play-label')).includes('head to head'), 'two people can play with no bots');
  check(!(await visible(sl, '#sl-level-sec')), 'bot level hides when there are no bots');
  await shot(sl, 'duo-04-sl-setup-dark.png');
  await sl.click('[data-act="sl-play"]');
  await sl.waitForSelector('#sl-tray .duo');
  check(await sl.locator('#sl-tokens .sl-token').count() === 2, 'two pieces on the board');
  const fit = await sl.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1);
  check(fit, 'board and both columns fit on one screen');
  await shot(sl, 'duo-05-sl-pick-dark.png');
  await sl.locator('#sl-tray .duo-col').nth(1).locator('.dpick').nth(2).click();
  const h = await giveaway(sl, '#sl-tray', 1);
  check(h.state === 'Locked in' && h.marked === 0 && h.same === 1, 'Kabir’s throw shows only “Locked in”');
  const s0 = Date.now();
  let sawDice = false;
  while (Date.now() - s0 < 240000 && !(await visible(sl, '#screen-end'))) {
    await bothTap(sl, '#sl-tray');
    await sl.waitForTimeout(250);
    if (!sawDice && await sl.evaluate(() => [...document.querySelectorAll('#sl-dice .die')].some(d => getComputedStyle(d).opacity !== '0'))) {
      sawDice = true; await sl.waitForTimeout(300); await shot(sl, 'duo-06-sl-dice-dark.png');
    }
  }
  check(await visible(sl, '#screen-end'), `two people race Snakes & Ladders to the finish in ${((Date.now() - s0) / 1000).toFixed(0)} s`);
  check(/Meera is home|Kabir is home/.test(await sl.textContent('#end-title')), `the winner is named (${await sl.textContent('#end-title')})`);
  await sl.waitForTimeout(400);
  await sl.screenshot({path: path.join(shots, 'duo-07-sl-end-dark.png'), fullPage: true});
} catch (e) {
  failed++;
  console.log('FAIL ' + e.message.split('\n')[0]);
} finally {
  console.log(errors.length ? 'Page errors:\n  ' + errors.join('\n  ') : 'No page errors.');
  await browser.close();
  await app.close();
  process.exit(failed || errors.length ? 1 : 0);
}
