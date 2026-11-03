// Render the supercut's title cards as true 1920x1080 PNGs with headless Chrome.
// Usage: node cards.mjs <titles.txt> <outdir>
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [titlesPath, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const rows = readFileSync(titlesPath, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.split('|').map((s) => s.trim()));
const opening = rows.find((r) => r[0] === 'OPENING');
const clips = rows.filter((r) => r[0] !== 'OPENING');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const page = (inner) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1920px;height:1080px;background:#1e1b2e;color:#fff;font-family:-apple-system,"SF Pro Display",system-ui,sans-serif;overflow:hidden}
  .wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:0 180px}
  .kicker{font-size:34px;letter-spacing:.14em;text-transform:uppercase;color:#a99be0;font-weight:600;margin-bottom:28px}
  h1{font-size:116px;line-height:1.05;margin:0;font-weight:700;letter-spacing:-.02em}
  .sub{font-size:48px;color:#c9c2e6;margin-top:34px;font-weight:400}
  .bar{width:140px;height:10px;border-radius:5px;background:linear-gradient(90deg,#7fd36b,#5b3fa8);margin-bottom:46px}
  .foot{position:absolute;left:180px;bottom:80px;font-size:28px;color:#8b84ad;letter-spacing:.04em}
  .center{align-items:center;text-align:center;padding:0}
</style></head><body>${inner}</body></html>`;
const cards = [];
cards.push({ name: 'card_open.png', html: page(`<div class="wrap"><div class="bar"></div><h1>${esc(opening[1])}</h1><div class="sub">${esc(opening[2])}</div></div>`) });
clips.forEach((c, i) => cards.push({ name: `card_${i + 1}.png`, html: page(`<div class="wrap"><div class="kicker">Remix ${i + 1} of ${clips.length}</div><h1>${esc(c[1])}</h1><div class="sub">${esc(c[2])}</div></div><div class="foot">${esc(opening[1])} · ${esc(opening[2])}</div>`) }));
cards.push({ name: 'card_end.png', html: page(`<div class="wrap center"><div class="bar"></div><h1>Thanks!</h1><div class="sub">${esc(opening[1])} · ${esc(opening[2])}</div></div>`) });

const port = 9351;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(out, '..', 'prof-'))}`, '--window-size=1920,1080', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl; for (let i = 0; i < 50 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} await sleep(200); }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let mid = 0; const pending = new Map();
ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id); } };
const send = (method, params = {}) => new Promise((r) => { const id = ++mid; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
for (const c of cards) {
  const f = join(out, c.name.replace('.png', '.html'));
  writeFileSync(f, c.html);
  await send('Page.navigate', { url: 'file://' + f }); await sleep(500);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(out, c.name), Buffer.from(r.result.data, 'base64'));
}
console.log(JSON.stringify({ cards: cards.map((c) => c.name), clips: clips.map((c) => c[0]) }));
ws.close(); chrome.kill(); process.exit(0);
