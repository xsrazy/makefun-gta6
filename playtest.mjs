// Playtest driver for Solmar Bay: serves game/, drives headless Chrome over the DevTools
// protocol (Node's built-in WebSocket, no dependencies), plays the game with real key
// events, and checks the state it reaches. Usage: node playtest.mjs
// Exits 0 when every check passes, 1 otherwise.

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const CHROME = `${process.env.HOME}/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome`;
const PORT = 8901;
const CDP_PORT = 9222;
const BASE = `http://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
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
    this.events = [];
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && this.pending.has(data.id)) {
        this.pending.get(data.id)(data);
        this.pending.delete(data.id);
      } else if (data.method) {
        this.events.push(data);
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

  async key(type, key, code, vk) {
    await this.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk });
  }

  async press(key, code, vk, holdMs = 60) {
    await this.key('keyDown', key, code, vk);
    await sleep(holdMs);
    await this.key('keyUp', key, code, vk);
  }

  async hold(key, code, vk, ms) {
    await this.key('keyDown', key, code, vk);
    await sleep(ms);
    await this.key('keyUp', key, code, vk);
  }

  async screenshot(path) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    if (res.result?.data) writeFileSync(path, Buffer.from(res.result.data, 'base64'));
  }
}

async function main() {
  const server = spawn('node', ['serve.ts', '--port', String(PORT)], { stdio: 'ignore' });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1280,720',
    '--user-data-dir=/tmp/chrome-solmar-playtest',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    if (!(await waitFor(`${BASE}/`))) throw new Error('server did not come up');
    if (!(await waitFor(`http://127.0.0.1:${CDP_PORT}/json/version`))) throw new Error('chrome did not come up');
    const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve) => { ws.onopen = resolve; });
    const cdp = new Cdp(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');

    const errors = [];
    const requests = [];
    const origPush = cdp.events.push.bind(cdp.events);
    cdp.events.push = (ev) => {
      if (ev.method === 'Runtime.exceptionThrown') errors.push(ev.params.exceptionDetails?.exception?.description ?? 'exception');
      if (ev.method === 'Log.entryAdded' && ev.params.entry.level === 'error') errors.push(ev.params.entry.text);
      if (ev.method === 'Runtime.consoleAPICalled' && ev.params.type === 'error') {
        errors.push(ev.params.args.map((a) => a.value ?? a.description).join(' '));
      }
      if (ev.method === 'Network.requestWillBeSent') requests.push(ev.params.request.url);
      return origPush(ev);
    };

    // --- Load the title screen ---
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await sleep(2500);
    const titleReady = await cdp.eval(`!!document.querySelector('#game') && document.querySelector('#status').textContent.length > 0`);
    check('title screen loads', titleReady === true);
    check('no console errors on load', errors.length === 0, errors.slice(0, 3).join(' | '));
    const offOrigin = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:'));
    check('no network requests outside the game server', offOrigin.length === 0, offOrigin.slice(0, 3).join(' | '));

    // --- Start a new game ---
    await cdp.press('Enter', 'Enter', 13);
    await sleep(2200);
    const mission = await cdp.eval(`window.__world?.state.mission.active?.id ?? null`);
    check('mission 1 starts', mission === 1, `active=${mission}`);
    const p0 = await cdp.eval(`({x: window.__world.state.player.x, y: window.__world.state.player.y})`);
    check('player spawns at the safehouse', Math.abs(p0.x - 650) < 5 && Math.abs(p0.y - 620) < 5, `(${Math.round(p0.x)}, ${Math.round(p0.y)})`);

    // --- Walk north ---
    await cdp.hold('w', 'KeyW', 87, 900);
    const p1 = await cdp.eval(`({x: window.__world.state.player.x, y: window.__world.state.player.y})`);
    check('walking moves the player', p1.y < p0.y - 40, `y ${Math.round(p0.y)} -> ${Math.round(p1.y)}`);

    // --- Walk back and steal the sedan outside the safehouse ---
    await cdp.hold('s', 'KeyS', 83, 900);
    await cdp.press('e', 'KeyE', 69);
    await sleep(300);
    const inCar = await cdp.eval(`window.__world.state.player.car?.typeId ?? null`);
    check('E enters the car', inCar === 'sedan', `car=${inCar}`);

    // --- Drive (sample the speed mid-hold: the car may stop at a building) ---
    const c0 = await cdp.eval(`({x: window.__world.state.player.x, y: window.__world.state.player.y})`);
    await cdp.key('keyDown', 'ArrowUp', 'ArrowUp', 38);
    await sleep(1200);
    const midSpeed = await cdp.eval(`window.__world.state.player.car.speed`);
    await sleep(800);
    await cdp.key('keyUp', 'ArrowUp', 'ArrowUp', 38);
    const c1 = await cdp.eval(`({x: window.__world.state.player.x, y: window.__world.state.player.y})`);
    check('driving moves the car', Math.hypot(c1.x - c0.x, c1.y - c0.y) > 120 && midSpeed > 100, `mid-drive speed=${Math.round(midSpeed)}`);
    await cdp.screenshot('/tmp/solmar-driving.png');

    // --- Exit and shoot ---
    await cdp.press('e', 'KeyE', 69);
    await sleep(300);
    const onFoot = await cdp.eval(`window.__world.state.player.car === null`);
    check('E exits the car', onFoot === true);
    const ammo0 = await cdp.eval(`window.__world.state.player.ammo`);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 900, y: 300, button: 'left', clickCount: 1 });
    await sleep(350);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 900, y: 300, button: 'left', clickCount: 1 });
    const ammo1 = await cdp.eval(`window.__world.state.player.ammo`);
    check('clicking fires the pistol', ammo1 < ammo0, `ammo ${ammo0} -> ${ammo1}`);

    // --- Pause and resume ---
    await cdp.press('p', 'KeyP', 80);
    await sleep(300);
    await cdp.press('Escape', 'Escape', 27);
    await sleep(300);
    const stillPlaying = await cdp.eval(`window.__world.state.time > 0`);
    check('pause and resume work', stillPlaying === true);

    // --- Wanted level: force a crime through the console hook and watch the police come ---
    await cdp.eval(`window.__world.state.heat = 70; window.__world.state.wanted = 2;`);
    await sleep(2500);
    const cops = await cdp.eval(`window.__world.state.cars.filter(c => c.driver === 'police' && !c.dead).length`);
    check('police respond to a wanted level', cops >= 2 && cops <= 4, `${cops} patrol cars`);
    await cdp.screenshot('/tmp/solmar-police.png');

    // --- Shot scenes render without errors ---
    for (const name of ['cover', 'street', 'chase', 'start']) {
      await cdp.send('Page.navigate', { url: `${BASE}/?shot=${name}&seed=1` });
      await sleep(1500);
      const ready = await cdp.eval(`window.__shotReady === true`);
      check(`shot scene "${name}" stages`, ready === true);
    }
    check('no console errors during play', errors.length === 0, errors.slice(0, 3).join(' | '));
    ws.close();
  } finally {
    chrome.kill();
    server.kill();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('playtest crashed:', err);
  process.exit(1);
});
