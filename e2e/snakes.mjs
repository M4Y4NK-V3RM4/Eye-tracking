// End-to-end: three phones play online Snakes & Ladders to the finish, and one phone plays bots.
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

const app = createServer({heartbeatMs: 1500});
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
  page.name = name;
  return page;
}
const shot = (p, file) => p.screenshot({path: path.join(shots, file)});
const visible = (p, sel) => p.locator(sel).isVisible();
const waitText = (p, sel, text, timeout = 8000) => p.waitForFunction(([s, t]) => (document.querySelector(s)?.textContent || '').includes(t), [sel, text], {timeout});
// Each phone throws whenever its tray offers a throw it hasn't made yet.
async function throwIfAsked(p){
  const free = p.locator('#sl-tray .picks:not(.has-chosen) .pick:not([disabled])');
  if (await free.count()) await free.nth(Math.floor(Math.random() * 3)).click().catch(() => {});
}

try {
  const host = await phone('Mayank');
  await host.goto(base + '/');
  await host.click('[data-game="snakes"]');
  await host.fill('#my-name', 'Mayank');
  await host.click('[data-act="host"]');
  await host.waitForSelector('#screen-lobby:not([hidden])');
  const code = (await host.textContent('#lobby-code')).trim();
  check(await host.locator('[data-set="game"][data-val="snakes"][aria-pressed="true"]').count() === 1, `the room is set to Snakes & Ladders (${code})`);

  const priya = await phone('Priya', {dark: true});
  await priya.goto(`${base}/r/${code}`);
  await waitText(priya, '#join-sub', 'hosting Snakes & Ladders');
  check(true, 'the invite says which game it is');
  await priya.fill('#join-name', 'Priya');
  await priya.click('#btn-join-link');
  const rahul = await phone('Rahul');
  await rahul.goto(`${base}/r/${code}`);
  await rahul.fill('#join-name', 'Rahul');
  await rahul.click('#btn-join-link');
  await waitText(host, '#lobby-count', '3 of 6');
  await waitText(rahul, '#lobby-settings', 'Snakes & Ladders');
  await shot(host, 'sl-01-lobby-host.png');

  await host.click('[data-act="o-start"]');
  const table = [host, priya, rahul];
  for (const p of table) await p.waitForSelector('#screen-snakes:not([hidden]) #sl-tray .pick:not([disabled])');
  await shot(priya, 'sl-02-start-dark.png');
  check((await host.locator('#sl-tokens .sl-token').count()) === 3, 'three pieces on the board');

  const t0 = Date.now();
  let sawDice = false, sawSlide = false;
  while (Date.now() - t0 < 240000) {
    if ((await Promise.all(table.map(p => visible(p, '#screen-end')))).every(Boolean)) break;
    for (const p of table) await throwIfAsked(p);
    await host.waitForTimeout(250);
    if (!sawDice && await host.evaluate(() => [...document.querySelectorAll('#sl-dice .die')].some(d => getComputedStyle(d).opacity !== '0'))) {
      sawDice = true; await host.waitForTimeout(350); await shot(host, 'sl-03-dice.png');
    }
    if (!sawSlide && await host.evaluate(() => /Snake|Ladder/.test(document.querySelector('#sl-callout')?.textContent || ''))) {
      sawSlide = true; await shot(rahul, 'sl-04-slide.png');
    }
  }
  for (const p of table) {
    await p.waitForSelector('#screen-end:not([hidden])', {timeout: 20000}).catch(async e => {
      console.log(p.name, 'stuck at:', await p.textContent('#sl-sub'), '|', await p.textContent('#sl-tray'), '|', await p.$$eval('#sl-strip .sl-pos', els => els.map(x => x.textContent).join(',')));
      throw e;
    });
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  check(sawDice, 'the dice rolled on screen');
  const winners = await Promise.all(table.map(p => p.textContent('#end-title')));
  check(winners.filter(w => /You’re home/.test(w)).length === 1, `one winner, the same on every phone, after ${secs} s (${winners.join(' / ')})`);
  const boards = await Promise.all(table.map(p => p.$$eval('#standings .sval', els => els.map(e => e.textContent).sort().join(','))));
  check(boards.every(b => b === boards[0]), `every phone ends with the same positions (${boards[0]})`);
  await host.waitForTimeout(500);
  await host.screenshot({path: path.join(shots, 'sl-05-end-host.png'), fullPage: true});
  check(await visible(host, '[data-act="o-rematch"]') && !(await visible(priya, '[data-act="o-rematch"]')), 'the host gets Play again, guests wait');
  await host.click('[data-act="o-rematch"]');
  for (const p of table) await p.waitForSelector('#screen-snakes:not([hidden])', {timeout: 8000});
  check(await host.evaluate(() => [...document.querySelectorAll('#sl-strip .sl-pos')].every(e => e.textContent === '100')), 'play again starts everyone on 100');

  // One phone against two bots, to the finish
  const solo = await phone('Solo');
  await solo.goto(base + '/');
  await solo.click('[data-game="snakes"]');
  await solo.click('#tab-local');
  await solo.click('[data-act="sl-play"]');
  const s0 = Date.now();
  while (Date.now() - s0 < 240000 && !(await visible(solo, '#screen-end'))) {
    await throwIfAsked(solo);
    await solo.waitForTimeout(300);
  }
  check(await visible(solo, '#screen-end'), `one phone against bots plays to the finish in ${((Date.now() - s0) / 1000).toFixed(0)} s`);
  await solo.waitForTimeout(400);
  await shot(solo, 'sl-06-end-solo.png');
} catch (e) {
  failed++;
  console.log('FAIL ' + e.message.split('\n')[0]);
} finally {
  console.log(errors.length ? 'Page errors:\n  ' + errors.join('\n  ') : 'No page errors.');
  await browser.close();
  await app.close();
  process.exit(failed || errors.length ? 1 : 0);
}
