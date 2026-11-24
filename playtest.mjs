// Neon Harbor — headless playtest driver. Serves game/, drives headless
// Chrome over the DevTools protocol (Node's built-in WebSocket, no
// dependencies), plays the game with real key and mouse events, and checks
// the state it reaches. Usage: node playtest.mjs
// Exits 0 when every check passes, 1 otherwise.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { globSync } from 'node:fs';

const PORT = 8911;
const CDP_PORT = 9231;
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
  async key(type, code, key) {
    await this.send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
  }
  async tap(code, key) {
    await this.key('keyDown', code, key);
    await sleep(60);
    await this.key('keyUp', code, key);
  }
  async hold(code, key, ms) {
    await this.key('keyDown', code, key);
    await sleep(ms);
    await this.key('keyUp', code, key);
  }
  async mouseDown(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  }
  async mouseUp(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
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
    '--user-data-dir=/tmp/nh-playtest-profile',
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
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `${BASE}/index.html?seed=1` });
    await sleep(1500);

    check('page loads, game object present', (await cdp.eval('!!window.__game')) === true);
    check('no exceptions on load', cdp.exceptions.length === 0, cdp.exceptions.join('; '));
    check('title screen is the first state', (await cdp.eval('window.__game.state')) === 'title');

    await cdp.eval(`document.getElementById('btn-start').click()`);
    await sleep(400);
    check('start button begins play', (await cdp.eval('window.__game.state')) === 'playing');

    const before = await cdp.eval('({x: window.__game.world.player.x, y: window.__game.world.player.y})');
    await cdp.hold('KeyW', 'w', 900);
    const after = await cdp.eval('({x: window.__game.world.player.x, y: window.__game.world.player.y})');
    check('player walks with W', Math.hypot(after.x - before.x, after.y - before.y) > 60, `moved ${Math.round(Math.hypot(after.x - before.x, after.y - before.y))}px`);

    // Walk to the parked car by the safehouse and steal it with E.
    await cdp.eval(`(() => { const w = window.__game.world; const car = w.cars.find(c => c.driver === 'parked'); w.debug.teleport(car.x - 30, car.y); })()`);
    await sleep(200);
    await cdp.tap('KeyE', 'e');
    await sleep(300);
    check('E enters the nearest car', (await cdp.eval('!window.__game.world.player.onFoot')) === true);

    // Line the car up on a road facing east, so the drive is not at the
    // mercy of the parked car's random heading.
    await cdp.eval(`(() => { const w = window.__game.world; w.debug.teleport(1250, w.city.roadsH[3]); w.player.car.angle = 0; })()`);
    await sleep(200);
    await cdp.hold('KeyW', 'w', 1600);
    const speed = await cdp.eval('Math.abs(window.__game.world.player.car.speed)');
    check('car accelerates with W', speed > 120, `${Math.round(speed)} px/s`);

    await cdp.tap('KeyE', 'e');
    await sleep(300);
    check('E exits the car', (await cdp.eval('window.__game.world.player.onFoot')) === true);

    const shotsBefore = await cdp.eval('window.__game.world.stats.shotsFired');
    await cdp.mouseDown(900, 300);
    await sleep(600);
    await cdp.mouseUp(900, 300);
    const shotsAfter = await cdp.eval('window.__game.world.stats.shotsFired');
    check('mouse click fires the pistol', shotsAfter > shotsBefore, `${shotsAfter - shotsBefore} shots`);

    await cdp.eval('window.__game.world.debug.setHeat(40)');
    await sleep(400);
    check('heat sets the wanted level', (await cdp.eval('window.__game.world.wantedStars()')) === 2);
    await sleep(4500);
    const cops = await cdp.eval(`window.__game.world.cars.filter(c => c.driver === 'cop').length`);
    check('police cars spawn and pursue', cops >= 2, `${cops} patrol cars`);
    await cdp.eval('window.__game.world.debug.setHeat(0)');
    await sleep(300);

    await cdp.eval('window.__game.world.debug.startMission(0)');
    await sleep(300);
    check('mission 1 starts', (await cdp.eval(`window.__game.world.missions.active?.def.id`)) === 'hot-wheels');
    await cdp.eval('window.__game.world.debug.giveCar()');
    await sleep(300);
    check('stealing a car advances mission 1', (await cdp.eval('window.__game.world.missions.active.objective')) === 1);
    await cdp.eval(`(() => { const w = window.__game.world; const m = w.city.landmarks.chopshop; w.debug.teleport(m.x, m.y); })()`);
    await sleep(500);
    check('mission 1 completes and pays $500', (await cdp.eval(`window.__game.world.missions.completed.includes('hot-wheels') && window.__game.world.money === 500`)) === true);

    await cdp.tap('KeyP', 'p');
    await sleep(200);
    check('P pauses', (await cdp.eval('window.__game.state')) === 'paused');
    await cdp.tap('KeyP', 'p');
    await sleep(200);
    check('P resumes', (await cdp.eval('window.__game.state')) === 'playing');

    check('mission completion saved the game', (await cdp.eval(`!!window.localStorage.getItem('neon-harbor.save.v1')`)) === true);

    await cdp.eval('window.__game.world.player.ammo = 0');
    await cdp.tap('KeyR', 'r');
    await sleep(1400);
    check('R reloads the pistol', (await cdp.eval('window.__game.world.player.ammo')) === 12);

    const px = await cdp.eval(`(() => { const c = document.getElementById('game'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let i = 0; i < d.length; i += 9973) seen.add(d[i] + ',' + d[i+1] + ',' + d[i+2]); return seen.size; })()`);
    check('canvas renders a varied scene (HUD + world)', px > 20, `${px} distinct sampled colours`);
    check('no exceptions after play', cdp.exceptions.length === 0, cdp.exceptions.join('; '));
  } finally {
    chrome.kill();
    server.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('playtest crashed:', err);
  process.exit(1);
});
