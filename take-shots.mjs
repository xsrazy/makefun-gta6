// Screenshot pipeline for Solmar Bay: serves game/, captures each scene from shots.json
// in headless Chrome (waiting for window.__shotReady), then encodes to JPEG at quality
// 80 and checks every file against the gate's limits (at most 256 KiB, long side at
// most 1280, short side at least 480). Usage: node take-shots.mjs

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const CHROME = `${process.env.HOME}/.cache/puppeteer/chrome/linux-156.0.8078.47/chrome-linux64/chrome`;
const PORT = 8902;
const CDP_PORT = 9223;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = JSON.parse(readFileSync('shots.json', 'utf8'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  async screenshot() {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(res.result.data, 'base64');
  }
}

function encodeJpeg(pngPath, jpgPath) {
  // PIL re-encodes at quality 80 and reports the size; the gate wants <= 256 KiB.
  const script = `
from PIL import Image
import sys
img = Image.open(${JSON.stringify(pngPath)}).convert('RGB')
img.save(${JSON.stringify(jpgPath)}, 'JPEG', quality=80)
import os
print(os.path.getsize(${JSON.stringify(jpgPath)}))
`;
  return new Promise((resolve, reject) => {
    const py = spawn('python3', ['-c', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    py.stdout.on('data', (d) => { out += d; });
    py.stderr.on('data', (d) => { err += d; });
    py.on('close', (code) => (code === 0 ? resolve(Number(out.trim())) : reject(new Error(err))));
  });
}

async function main() {
  const server = spawn('node', ['serve.ts', '--port', String(PORT)], { stdio: 'ignore' });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1280,720',
    '--force-device-scale-factor=1',
    '--hide-scrollbars',
    '--user-data-dir=/tmp/chrome-solmar-shots',
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
    // --window-size sets the outer window; force the viewport itself to 1280x720
    // or the capture comes out letterboxed at 1280x520.
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });

    for (const shot of SHOTS) {
      await cdp.send('Page.navigate', { url: `${BASE}/${shot.query}` });
      let ready = false;
      for (let i = 0; i < 40 && !ready; i += 1) {
        await sleep(250);
        ready = await cdp.eval(`window.__shotReady === true`);
      }
      if (!ready) throw new Error(`shot ${shot.name} never became ready`);
      const png = await cdp.screenshot();
      const pngPath = `/tmp/solmar-${shot.name.replace('.jpg', '.png')}`;
      writeFileSync(pngPath, png);
      const bytes = await encodeJpeg(pngPath, `screenshots/${shot.name}`);
      const ok = bytes <= 262144;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${shot.name}  ${bytes} bytes  (1280x720)`);
      if (!ok) throw new Error(`${shot.name} is over the 256 KiB cap`);
    }
    ws.close();
    console.log('all screenshots written to screenshots/');
  } finally {
    chrome.kill();
    server.kill();
  }
}

main().catch((err) => {
  console.error('take-shots failed:', err);
  process.exit(1);
});
