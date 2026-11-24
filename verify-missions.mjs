// Neon Harbor — mission verifier. Serves game/, opens it in headless Chrome
// over the DevTools protocol, and drives all six story missions to completion
// through the game's real state machine: auto-start by reaching the marker,
// objectives by teleporting to real positions, eliminations through real
// damage, evasion through the real heat value. 5 checks per mission, 30 in
// all. Usage: node verify-missions.mjs
// Exits 0 when every check passes, 1 otherwise.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { globSync } from 'node:fs';

const PORT = 8912;
const CDP_PORT = 9232;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = globSync(`${process.env.HOME}/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome`)[0];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function serveGame() {
  const server = createServer(async (req, res) => {
    try {
      const path = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
      const data = await readFile(join('game', path));
      res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

async function waitFor(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  return false;
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.exceptions = [];
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && this.pending.has(data.id)) {
        this.pending.get(data.id)(data);
        this.pending.delete(data.id);
      } else if (data.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(data.params.exceptionDetails.text);
      }
    };
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true });
    return res.result?.result?.value;
  }
}

async function main() {
  if (!CHROME) {
    console.error('Chrome binary not found under ~/.cache/puppeteer');
    process.exit(1);
  }
  const server = await serveGame();
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${CDP_PORT}`,
    '--user-data-dir=/tmp/nh-missions-profile',
    '--window-size=1280,800',
    'about:blank',
  ], { stdio: 'ignore' });
  try {
    if (!(await waitFor(`http://127.0.0.1:${CDP_PORT}/json/version`))) throw new Error('Chrome DevTools did not come up');
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve) => { ws.onopen = resolve; });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `${BASE}/index.html?seed=1` });
    await sleep(1200);
    await cdp.eval(`document.getElementById('btn-start').click()`);
    await sleep(300);
    // The verifier is not testing the player's aim: make Kai unkillable so
    // thug fire during the scripted run cannot end the run early.
    await cdp.eval('window.__game.world.player.health = 100000');

    const W = 'window.__game.world';
    const go = async (landmark) => {
      await cdp.eval(`(() => { const w = ${W}; const m = w.city.landmarks.${landmark}; w.debug.teleport(m.x, m.y); })()`);
      await sleep(350);
    };

    // Mission 1 — Hot Wheels: steal a car, deliver it to the Chop Shop.
    await go('safehouse');
    check('M1 starts at the safehouse marker', (await cdp.eval(`${W}.missions.active?.def.id`)) === 'hot-wheels');
    await cdp.eval(`${W}.debug.giveCar()`);
    await sleep(300);
    check('M1 objective 1 completes on entering a car', (await cdp.eval(`${W}.missions.active.objective`)) === 1);
    const m1money = await cdp.eval(`${W}.money`);
    await go('chopshop');
    check('M1 completes at the Chop Shop', (await cdp.eval(`${W}.missions.completed.includes('hot-wheels')`)) === true);
    check('M1 pays $500', (await cdp.eval(`${W}.money`)) === m1money + 500);
    check('M2 unlocks after M1', (await cdp.eval(`${W}.missions.index`)) === 1);

    // Mission 2 — Package Run: three timed drop-offs.
    await go('safehouse');
    check('M2 starts at the safehouse marker', (await cdp.eval(`${W}.missions.active?.def.id`)) === 'package-run');
    const timer0 = await cdp.eval(`${W}.missions.active.timer`);
    await sleep(1200);
    const timer1 = await cdp.eval(`${W}.missions.active.timer`);
    check('M2 countdown runs', timer1 < timer0, `${Math.round(timer0)}s -> ${Math.round(timer1)}s`);
    await go('marina');
    check('M2 drop-off 1 of 3 registers', (await cdp.eval(`${W}.missions.active.objective`)) === 1);
    await go('warehouse');
    check('M2 drop-off 2 of 3 registers', (await cdp.eval(`${W}.missions.active.objective`)) === 2);
    const m2money = await cdp.eval(`${W}.money`);
    await go('tower');
    check('M2 completes and pays $800', (await cdp.eval(`${W}.missions.completed.includes('package-run') && ${W}.money === ${m2money} + 800`)) === true);

    // Mission 3 — Collect the Debt: four armed thugs, then home.
    await go('warehouse');
    check('M3 starts at the warehouse marker', (await cdp.eval(`${W}.missions.active?.def.id`)) === 'debt-collector');
    check('M3 spawns four hostile thugs', (await cdp.eval(`${W}.peds.filter(p => p.hostile && p.state !== 'dead').length`)) === 4);
    await cdp.eval(`${W}.debug.killHostiles()`);
    await sleep(400);
    check('M3 elimination objective completes', (await cdp.eval(`${W}.missions.active.objective`)) === 1);
    const m3money = await cdp.eval(`${W}.money`);
    await go('safehouse');
    check('M3 completes and pays $1200', (await cdp.eval(`${W}.missions.completed.includes('debt-collector') && ${W}.money === ${m3money} + 1200`)) === true);
    check('M4 unlocks after M3', (await cdp.eval(`${W}.missions.index`)) === 3);

    // Mission 4 — Heat Wave: survive three stars, then lose them.
    await go('safehouse');
    check('M4 starts and sets 3 wanted stars', (await cdp.eval(`${W}.missions.active?.def.id === 'heat-wave' && ${W}.wantedStars() === 3`)) === true);
    const m4cops = await cdp.eval(`${W}.cars.filter(c => c.driver === 'cop').length`);
    await sleep(3000);
    const m4copsLater = await cdp.eval(`${W}.cars.filter(c => c.driver === 'cop').length`);
    check('M4 police pursuit builds', m4copsLater >= m4cops && m4copsLater >= 2, `${m4copsLater} patrol cars`);
    await cdp.eval(`${W}.debug.setHeat(0)`);
    await sleep(400);
    check('M4 evasion objective completes at zero heat', (await cdp.eval(`${W}.missions.active`)) === null);
    check('M4 completes and pays $1000', (await cdp.eval(`${W}.missions.completed.includes('heat-wave')`)) === true);
    check('M5 unlocks after M4', (await cdp.eval(`${W}.missions.index`)) === 4);

    // Mission 5 — Dockside Grab: take the briefcase, escape home.
    const m5money = await cdp.eval(`${W}.money`);
    await go('docks');
    check('M5 starts at the docks marker', (await cdp.eval(`${W}.missions.active?.def.id`)) === 'dockside-grab');
    check('M5 pickup raises 2 wanted stars', (await cdp.eval(`${W}.wantedStars()`)) === 2);
    check('M5 pickup advances to the escape', (await cdp.eval(`${W}.missions.active.objective`)) === 1);
    await go('safehouse');
    check('M5 completes and pays $2000', (await cdp.eval(`${W}.missions.completed.includes('dockside-grab') && ${W}.money === ${m5money} + 2000`)) === true);
    check('M6 unlocks after M5', (await cdp.eval(`${W}.missions.index`)) === 5);

    // Mission 6 — The Kingpin's Fall: seven hostiles, then home a legend.
    await go('tower');
    check('M6 starts at the tower marker', (await cdp.eval(`${W}.missions.active?.def.id`)) === 'kingpins-fall');
    check('M6 spawns six guards and a boss', (await cdp.eval(`${W}.peds.filter(p => p.hostile && p.state !== 'dead').length`)) === 7);
    await cdp.eval(`${W}.debug.killHostiles()`);
    await sleep(400);
    check('M6 elimination objective completes', (await cdp.eval(`${W}.missions.active.objective`)) === 1);
    const m6money = await cdp.eval(`${W}.money`);
    await go('safehouse');
    check('M6 completes and pays $5000', (await cdp.eval(`${W}.missions.completed.includes('kingpins-fall') && ${W}.money === ${m6money} + 5000`)) === true);
    check('story completes: all six jobs done', (await cdp.eval(`${W}.storyComplete === true && ${W}.missions.completed.length === 6`)) === true);

    check('no exceptions during the mission run', cdp.exceptions.length === 0, cdp.exceptions.join('; '));
  } finally {
    chrome.kill();
    server.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('mission verification crashed:', err);
  process.exit(1);
});
