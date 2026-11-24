// Mission-chain verification for Solmar Bay: plays the live game over CDP and walks
// the whole story — all six missions, then save and continue — checking the state at
// each step. Teleports use the page's own debug hook (window.__world) to move Danny;
// the mission logic, rewards and saving all run through the real code paths.
// Usage: node verify-missions.mjs. Exits 0 when every check passes.

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const CHROME = `${process.env.HOME}/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome`;
const PORT = 8903;
const CDP_PORT = 9225;
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
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && this.pending.has(data.id)) {
        this.pending.get(data.id)(data);
        this.pending.delete(data.id);
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

  async press(key, code, vk) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
    await sleep(80);
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  }
}

async function main() {
  // A fresh browser profile every run: a previous run's save would make Enter
  // continue that game instead of starting a new one.
  rmSync('/tmp/chrome-solmar-missions', { recursive: true, force: true });
  const server = spawn('node', ['serve.ts', '--port', String(PORT)], { stdio: 'ignore' });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1280,720',
    '--user-data-dir=/tmp/chrome-solmar-missions',
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
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

    const S = (expr) => cdp.eval(`window.__world.state.${expr}`);
    const teleportCar = (x, y) => cdp.eval(`
      (() => { const s = window.__world.state; const c = s.player.car;
        if (c) { c.x = ${x}; c.y = ${y}; c.speed = 0; }
        s.player.x = ${x}; s.player.y = ${y}; s.camera.x = ${x}; s.camera.y = ${y}; })()`);
    const teleportFoot = (x, y) => cdp.eval(`
      (() => { const s = window.__world.state;
        s.player.x = ${x}; s.player.y = ${y}; s.camera.x = ${x}; s.camera.y = ${y}; })()`);
    const waitForActive = async (id, timeoutMs = 8000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        if ((await S('mission.active?.id ?? null')) === id) return true;
        await sleep(250);
      }
      return false;
    };

    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await sleep(2000);
    await cdp.press('Enter', 'Enter', 13);
    check('mission 1 starts', await waitForActive(1));

    // Mission 1: steal the sedan, drive it to the garage.
    await cdp.press('e', 'KeyE', 69);
    await sleep(300);
    check('mission 1 step 2 after stealing a car', (await S('mission.stepIndex')) === 1);
    await teleportCar(1250, 1250);
    await sleep(800);
    check('mission 1 completes', (await S('missionsDone')).includes(1), `done=${JSON.stringify(await S('missionsDone'))}`);
    check('mission 1 pays $400', (await S('player.money')) === 650, `money=$${await S('player.money')}`);

    // Mission 2: docks pickup, deliver to the office.
    check('mission 2 starts', await waitForActive(2));
    await teleportCar(670, 3080);
    await sleep(800);
    check('mission 2 reaches the collect step', (await S('mission.stepIndex')) === 1, `step=${await S('mission.stepIndex')}`);
    await teleportCar(520, 3080);
    await sleep(800);
    check('mission 2 reaches the deliver step', (await S('mission.stepIndex')) === 2, `step=${await S('mission.stepIndex')}`);
    await teleportCar(2450, 1150);
    await sleep(800);
    check('mission 2 completes', (await S('missionsDone')).includes(2));
    check('mission 2 pays $800', (await S('player.money')) === 1450, `money=$${await S('player.money')}`);

    // Mission 3: lose the heat (cool it off directly: the step only needs wanted 0).
    check('mission 3 starts', await waitForActive(3));
    check('mission 3 sets 2-star heat', (await S('wanted')) === 2, `wanted=${await S('wanted')}`);
    await cdp.eval(`window.__world.state.heat = 0; window.__world.state.wanted = 0;`);
    await sleep(800);
    check('mission 3 completes when the heat is gone', (await S('missionsDone')).includes(3));

    // Mission 4: steal the gold coupe at the stadium, deliver it to the garage.
    check('mission 4 starts', await waitForActive(4));
    const repoExists = await cdp.eval(`window.__world.state.cars.some((c) => c.id === 'repo')`);
    check('repo car spawns at the stadium', repoExists === true);
    // Step out of the sedan first: the player is still driving it from mission 2.
    await cdp.press('e', 'KeyE', 69);
    await sleep(400);
    await teleportFoot(4250, 2450);
    await sleep(500);
    await cdp.eval(`(() => { const s = window.__world.state; s.player.x = s.repoCar.x - 20; s.player.y = s.repoCar.y; })()`);
    await cdp.press('e', 'KeyE', 69);
    await sleep(500);
    check('repo car entered', (await S('player.car?.id ?? null')) === 'repo');
    await teleportCar(1250, 1250);
    await sleep(800);
    check('mission 4 completes', (await S('missionsDone')).includes(4));

    // Mission 5: timed getaway to the safehouse under 3-star heat.
    check('mission 5 starts', await waitForActive(5));
    check('mission 5 sets 3-star heat', (await S('wanted')) === 3, `wanted=${await S('wanted')}`);
    await teleportCar(650, 620);
    await sleep(800);
    check('mission 5 completes', (await S('missionsDone')).includes(5));

    // Mission 6: the docks showdown. (Test-only: full health, so the Vultures'
    // bullets cannot waste Danny mid-check and freeze the world on that screen.)
    check('mission 6 starts', await waitForActive(6));
    await cdp.eval(`window.__world.state.player.health = 10000;`);
    const enemies = await S('enemies.length');
    check('6 Vultures spawn at the docks', enemies === 6, `enemies=${enemies}`);
    await teleportFoot(520, 3080);
    await sleep(800);
    check('mission 6 reaches the kill step', (await S('mission.stepIndex')) === 1, `step=${await S('mission.stepIndex')}`);
    await cdp.eval(`window.__world.state.mission.kills = 6;`);
    await sleep(800);
    check('mission 6 reaches the report step', (await S('mission.stepIndex')) === 2, `step=${await S('mission.stepIndex')}`);
    await teleportFoot(2450, 1150);
    await sleep(800);
    check('mission 6 completes, story done', (await S('storyDone')) === true);
    check('all six missions done', (await S('missionsDone')).length === 6);
    // Rewards alone are $7,300 on top of the $250 start; teleports can also cross a
    // hidden package (+$500) or the garage (-$300), so assert the floor, not the total.
    const finalMoney = await S('player.money');
    check('all mission rewards paid', finalMoney >= 7550, `money=$${finalMoney}`);

    // Save from the pause menu, reload, continue.
    await cdp.press('p', 'KeyP', 80);
    await sleep(400);
    await cdp.press('s', 'KeyS', 83);
    await sleep(400);
    const saved = await cdp.eval(`localStorage.getItem('solmar-bay.save.v1') !== null`);
    check('pause menu saves the game', saved === true);
    await cdp.send('Page.navigate', { url: `${BASE}/` });
    await sleep(2000);
    const hasSave = await cdp.eval(`localStorage.getItem('solmar-bay.save.v1') !== null`);
    check('save survives a reload', hasSave === true);
    await cdp.press('Enter', 'Enter', 13);
    await sleep(1500);
    check('continue restores the money', (await S('player.money')) === finalMoney, `money=$${await S('player.money')}`);
    check('continue restores the missions', (await S('missionsDone')).length === 6);
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
  console.error('verify-missions crashed:', err);
  process.exit(1);
});
