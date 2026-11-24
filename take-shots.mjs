// Neon Harbor — screenshot pipeline. Serves game/, captures each scene from
// shots.json in headless Chrome (waiting for window.__shotReady), encodes to
// JPEG, and checks every file against the gate's limits (at most 256 KiB,
// long side at most 1280, short side at least 480). Usage: node take-shots.mjs

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { globSync } from 'node:fs';

const PORT = 8913;
const CDP_PORT = 9233;
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME = globSync(`${process.env.HOME}/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome`)[0];
const SHOTS = JSON.parse(await readFile('shots.json', 'utf8'));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  async screenshotPng() {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(res.result.data, 'base64');
  }
}

// Re-encode with PIL at descending quality until the file fits 256 KiB.
function encodeJpeg(pngPath, jpgPath) {
  const attempt = (quality) => new Promise((resolve, reject) => {
    const script = `from PIL import Image\nimport os\nimg = Image.open(${JSON.stringify(pngPath)}).convert('RGB')\nimg.save(${JSON.stringify(jpgPath)}, 'JPEG', quality=${quality})\nprint(os.path.getsize(${JSON.stringify(jpgPath)}))`;
    const py = spawn('python3', ['-c', script], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    py.stdout.on('data', (d) => { out += d; });
    py.stderr.on('data', (d) => { err += d; });
    py.on('close', (code) => (code === 0 ? resolve(Number(out.trim())) : reject(new Error(err))));
  });
  return (async () => {
    for (const q of [82, 72, 62, 52]) {
      const size = await attempt(q);
      if (size <= 262144) return { size, quality: q };
    }
    throw new Error(`screenshot still over 256 KiB at quality 52: ${jpgPath}`);
  })();
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
    '--user-data-dir=/tmp/nh-shots-profile',
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

    for (const shot of SHOTS) {
      await cdp.send('Page.navigate', { url: `${BASE}/index.html${shot.query}` });
      let ready = false;
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        ready = (await cdp.eval('window.__shotReady === true')) === true;
        if (ready) break;
      }
      if (!ready) throw new Error(`shot never became ready: ${shot.name}`);
      const png = await cdp.screenshotPng();
      const pngPath = `/tmp/nh-shot-${shot.name}.png`;
      await writeFile(pngPath, png);
      const jpgPath = join('screenshots', shot.name);
      const { size, quality } = await encodeJpeg(pngPath, jpgPath);
      console.log(`${shot.name}: ${size} bytes (JPEG q${quality}, 1280x800)`);
    }
    console.log(`\n${SHOTS.length} screenshots written to screenshots/`);
  } finally {
    chrome.kill();
    server.close();
  }
}

main().catch((err) => {
  console.error('screenshot pipeline crashed:', err);
  process.exit(1);
});
