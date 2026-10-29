// End-to-end: several phones (separate browser contexts) host, join and play over the real server.
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

const app = createServer({roomOptions: {hostGrace: 6000}, heartbeatMs: 1500});
const port = await app.listen(0, '127.0.0.1');
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
const errors = [];
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++; };

async function phone(name, opts = {}){
  const ctx = await browser.newContext({viewport: {width: 390, height: 780}, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: opts.dark ? 'dark' : 'light'});
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.name = name; page.ctx = ctx;
  return page;
}
const shot = (p, file) => p.screenshot({path: path.join(shots, file)});
const visible = (p, sel) => p.locator(sel).isVisible();
async function throwFor(p, move){ await p.locator(`#tray .pick[data-pick="${move}"]:not([disabled])`).click(); }
const waitText = (p, sel, text, timeout = 8000) => p.waitForFunction(([s, t]) => (document.querySelector(s)?.textContent || '').includes(t), [sel, text], {timeout});

try {
  // 1. Mayank hosts
  const host = await phone('Mayank');
  await host.goto(base + '/');
  await shot(host, '01-home-online.png');
  await host.fill('#my-name', 'Mayank');
  await host.click('[data-act="host"]');
  await host.waitForSelector('#screen-lobby:not([hidden])');
  const code = (await host.textContent('#lobby-code')).trim();
  check(/^[A-Z]{4}$/.test(code), `host gets a room code (${code})`);
  check(await host.locator('#lobby-qr').evaluate(img => img.complete && img.naturalWidth > 0), 'the QR code loads');
  await shot(host, '02-lobby-host-alone.png');

  // 2. Priya opens the invite link (what the QR code holds)
  const priya = await phone('Priya', {dark: true});
  await priya.goto(`${base}/r/${code}`);
  await waitText(priya, '#join-sub', 'Mayank is hosting');
  await shot(priya, '03-join-by-link.png');
  await priya.fill('#join-name', 'Priya');
  await priya.click('#btn-join-link');
  await priya.waitForSelector('#screen-lobby:not([hidden])');

  // 3. Rahul types the code on the home screen
  const rahul = await phone('Rahul');
  await rahul.goto(base + '/');
  await rahul.fill('#my-name', 'Rahul');
  await rahul.fill('#join-code', code.toLowerCase());
  await rahul.click('[data-act="join"]');
  await rahul.waitForSelector('#screen-lobby:not([hidden])');
  await waitText(host, '#lobby-count', '3 of 6');
  check(true, 'three phones in the lobby');
  await host.click('[data-set="rounds"][data-val="3"]');
  await host.click('[data-set="timer"][data-val="10"]');
  await waitText(priya, '#lobby-settings', 'Points, 3 rounds');
  await waitText(priya, '#lobby-settings', '10 seconds to throw');
  check(true, 'the host’s settings reach everyone');
  await shot(host, '04-lobby-host.png');
  await priya.screenshot({path: path.join(shots, '05-lobby-guest-full.png'), fullPage: true});
  check(!(await visible(priya, '[data-act="o-start"]')), 'only the host can start');

  // 4. Start and play round 1: throws stay hidden until the last one
  await host.click('[data-act="o-start"]');
  for (const p of [host, priya, rahul]) await p.waitForSelector('#screen-play:not([hidden]) #tray .pick:not([disabled])');
  await shot(rahul, '06-play-pick.png');
  await throwFor(host, 1);     // paper
  await throwFor(priya, 0);    // stone
  await waitText(rahul, '#band', '2 of 3 locked in');
  check(await rahul.locator('#seats .card.is-up').count() === 0, 'nobody’s card is face up before the last throw');
  await shot(host, '07-play-locked.png');
  await throwFor(host, 2);     // change of mind: scissors
  await rahul.waitForTimeout(150);
  await throwFor(rahul, 0);    // stone
  for (const p of [host, priya, rahul]) await p.waitForFunction(() => document.querySelectorAll('#seats .card.is-up').length === 3, null, {timeout: 6000});
  await host.waitForTimeout(700);
  await shot(priya, '08-play-result-dark.png');
  const head = await host.textContent('#band .headline');
  check(/PRIYA AND RAHUL \+1|Priya and Rahul \+1/i.test(head), `the changed throw counted: “${head.trim()}”`);

  // 5. Rahul's phone drops off mid-round, then comes back on its own
  await throwFor(host, 0); await throwFor(priya, 0);
  await rahul.ctx.setOffline(true);
  await waitText(host, '#seats', 'Away', 8000);
  check(true, 'a dropped phone shows as Away');
  await rahul.ctx.setOffline(false);
  await rahul.evaluate(() => window.dispatchEvent(new Event('online')));
  await host.waitForFunction(() => !document.querySelector('#seats').textContent.includes('Away'), null, {timeout: 10000});
  await rahul.waitForSelector('#conn[hidden]', {state: 'attached', timeout: 10000});
  check(true, 'it reconnected by itself and the table sees it again');

  // 6. Play on until the match ends: each phone throws whenever it is asked to
  const table = [host, priya, rahul];
  for (let i = 0; i < 30; i++) {
    if ((await Promise.all(table.map(p => visible(p, '#screen-end')))).every(Boolean)) break;
    for (const [k, p] of table.entries()) {
      const free = p.locator('#tray .picks:not(.has-chosen) .pick:not([disabled])');
      if (await free.count()) await free.nth((k + i) % 3).click().catch(() => {});
    }
    await host.waitForTimeout(1200);
  }
  for (const p of table) await p.waitForSelector('#screen-end:not([hidden])', {timeout: 12000});
  await host.waitForTimeout(600);
  await host.screenshot({path: path.join(shots, '09-end-host-full.png'), fullPage: true});
  await shot(priya, '10-end-guest-dark.png');
  check(await visible(host, '[data-act="o-rematch"]') && !(await visible(priya, '[data-act="o-rematch"]')), 'the host gets Rematch, guests wait');

  // 7. A fourth phone joins during the end screen and watches; rematch seats them
  const aman = await phone('Aman');
  await aman.goto(`${base}/r/${code}`);
  await aman.fill('#join-name', 'Aman');
  await aman.click('#btn-join-link');
  await aman.waitForSelector('#screen-end:not([hidden]), #screen-play:not([hidden]), #screen-lobby:not([hidden])', {timeout: 8000});
  await host.click('[data-act="o-rematch"]');
  for (const p of [host, priya, rahul, aman]) await p.waitForSelector('#screen-play:not([hidden])', {timeout: 8000});
  check(await host.locator('#seats .seat').count() === 4, 'the rematch seats the late joiner');
  await shot(aman, '11-rematch-four.png');

  // 8. Leaving: Rahul leaves; the host ends the match
  await rahul.click('[data-act="quit"]');
  await rahul.click('#confirm-yes');
  await rahul.waitForSelector('#screen-home:not([hidden])');
  await waitText(host, '#toast', 'Rahul left');
  check(true, 'leaving tells the table');
  await host.click('[data-act="quit"]');
  await host.click('#confirm-yes');
  for (const p of [host, priya, aman]) await p.waitForSelector('#screen-lobby:not([hidden])', {timeout: 8000});
  check(true, 'the host can end a match for everyone');

  // 9. Six phones play a knockout to the end; a seventh can only watch
  const six = [host, priya, aman];
  for (const n of ['Isha', 'Kabir', 'Zoya']) {
    const p = await phone(n);
    await p.goto(`${base}/r/${code}`);
    await p.fill('#join-name', n);
    await p.click('#btn-join-link');
    await p.waitForSelector('#screen-lobby:not([hidden])');
    six.push(p);
  }
  const extra = await phone('Dev');
  await extra.goto(`${base}/r/${code}`);
  await extra.fill('#join-name', 'Dev');
  await extra.click('#btn-join-link');
  await extra.waitForSelector('#screen-lobby:not([hidden])');
  await waitText(host, '#roster', 'Watching');
  check(true, 'the seventh person watches');
  await host.click('[data-set="mode"][data-val="knockout"]');
  await host.click('[data-set="timer"][data-val="3"]');
  await host.click('[data-act="o-start"]');
  for (const p of six) await p.waitForSelector('#screen-play:not([hidden])');
  await host.waitForTimeout(300);
  await shot(host, '12-six-players.png');
  // Zoya never throws: the clock throws for her and the table never waits.
  const t0 = Date.now();
  let rounds = 0;
  for (let round = 0; round < 60; round++) {
    if (await visible(host, '#screen-end')) break;
    for (const [i, p] of six.entries()) {
      if (p.name === 'Zoya') continue;
      const b = p.locator('#tray .pick:not([disabled])');
      if (await b.count() && !(await p.locator('#tray .picks.has-chosen').count())) await b.nth(Math.floor(Math.random() * 3)).click().catch(() => {});
    }
    await host.waitForTimeout(700);
  }
  await host.waitForSelector('#screen-end:not([hidden])', {timeout: 20000});
  rounds = await host.evaluate(() => document.querySelector('#end-sub').textContent);
  check(true, `six phones played a knockout to the end in ${((Date.now() - t0) / 1000).toFixed(0)} s, with one phone never throwing (${rounds.trim()})`);
  await shot(extra, '13-watcher-end.png');

  // 10. One phone still plays bots offline
  const solo = await phone('Solo');
  await solo.goto(base + '/');
  await solo.click('#tab-local');
  await solo.click('#btn-play');
  for (let i = 0; i < 20 && !(await visible(solo, '#screen-end')); i++) {
    const b = solo.locator('#tray .pick:not([disabled])');
    if (await b.count()) await b.first().click();
    await solo.waitForTimeout(2300);
  }
  check(await visible(solo, '#screen-end'), 'one-phone play against a bot still works');
} catch (e) {
  failed++;
  console.log('FAIL ' + e.message.split('\n')[0]);
} finally {
  console.log(errors.length ? 'Page errors:\n  ' + errors.join('\n  ') : 'No page errors.');
  await browser.close();
  await app.close();
  process.exit(failed || errors.length ? 1 : 0);
}
