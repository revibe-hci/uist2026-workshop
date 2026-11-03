// Record the argue demo (run from an empty folder; output goes to the current folder): CDP screencast frames + the page's Web Audio output, merged later by ffmpeg.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const DIR = process.cwd();
mkdirSync(join(DIR, 'frames'), { recursive: true });
const PAGE = new URL('../argue-demo.html', import.meta.url).href;
const W = 3200, H = 1800, DSF = 1, port = 9347;
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(DIR, 'prof-'))}`,
  `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {} await sleep(200); }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let mid = 0; const pending = new Map(); const frames = []; const logs = [];
const send = (method, params = {}) => new Promise((r) => { const id = ++mid; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = (m) => {
  const j = JSON.parse(m.data);
  if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id); }
  if (j.method === 'Page.screencastFrame') {
    const n = frames.length; const f = join(DIR, 'frames', `f${String(n).padStart(5, '0')}.jpg`);
    writeFileSync(f, Buffer.from(j.params.data, 'base64')); frames.push({ f, ts: j.params.metadata.timestamp });
    send('Page.screencastFrameAck', { sessionId: j.params.sessionId });
  }
  if (j.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + j.params.exceptionDetails.exception?.description);
  if (j.method === 'Runtime.consoleAPICalled') logs.push(j.params.args.map((a) => a.value ?? '').join(' '));
};
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DSF, mobile: false });
await send('Page.navigate', { url: PAGE }); await sleep(1200);
// 16:9 layout for the recording only: wider columns, shorter phones, so it all fits in 1600x900.
await evaluate(`document.head.insertAdjacentHTML('beforeend', '<style>html{zoom:2}.top,.row,.stage-wrap{max-width:1400px}.top{padding-top:16px}.row{margin-top:12px}.phone{height:300px}.m-debate-lines{height:200px}.changes{min-height:0}</style>')`);
await sleep(300);

// A visible cursor that glides to each target before clicking.
await evaluate(`(() => {
  const c = document.createElement('div'); c.id = 'fake-cursor';
  c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.5L16 20l-3 1.5-3.4-7.3L4 19z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>';
  Object.assign(c.style, { position: 'fixed', left: '1040px', top: '120px', zIndex: 9999, pointerEvents: 'none', transition: 'left .7s cubic-bezier(.4,0,.2,1), top .7s cubic-bezier(.4,0,.2,1), transform .12s' });
  document.body.appendChild(c);
  window.__moveClick = async (sel) => {
    const el = document.querySelector(sel); if (!el) throw new Error('no ' + sel);
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); await new Promise(r => setTimeout(r, 300));
    const b = el.getBoundingClientRect(); c.style.left = ((b.left + b.width / 2) / 2 - 4) + 'px'; c.style.top = ((b.top + b.height / 2) / 2 - 2) + 'px';
    await new Promise(r => setTimeout(r, 800)); c.style.transform = 'scale(.8)'; await new Promise(r => setTimeout(r, 120));
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.click(); c.style.transform = ''; };
  window.__waitShown = (n) => new Promise(r => { const t = setInterval(() => { if (shown >= n && speakingIdx === -1 || status === 'done') { clearInterval(t); r(); } }, 50); });
  // Tap the voices' master bus and record it.
  audio(); const dest = ctx.createMediaStreamDestination(); master.connect(dest);
  window.__chunks = []; window.__rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 160000 });
  __rec.ondataavailable = (e) => e.data.size && __chunks.push(e.data);
})()`);
await evaluate(`new Promise(r => { __rec.onstart = () => { window.__recStart = Date.now(); r(); }; __rec.start(250); })`);
await send('Page.startScreencast', { format: 'jpeg', quality: 100, everyNthFrame: 1 });
const recStart = await evaluate('__recStart');
await sleep(2200);
await evaluate(`__moveClick('#start')`);
// Rule as the debate goes: agree with the header, reject the white page, agree with cards and chips, reject "no photos".
await evaluate(`__waitShown(1)`); await evaluate(`__moveClick('[data-id=t0][data-r=keep]')`);
await evaluate(`__waitShown(2)`); await evaluate(`__moveClick('[data-id=t1][data-r=reject]')`);
await evaluate(`__waitShown(3)`); await evaluate(`__moveClick('[data-id=t2][data-r=keep]')`);
await evaluate(`__waitShown(5)`); await evaluate(`__moveClick('[data-id=t4][data-r=keep]')`);
await evaluate(`__waitShown(6)`); await evaluate(`__moveClick('[data-id=t5][data-r=reject]')`);
await evaluate(`new Promise(r => { const t = setInterval(() => { if (status === 'done') { clearInterval(t); r(); } }, 50); })`);
await sleep(1800);
await evaluate(`__moveClick('#go')`);
await sleep(2500);
await evaluate(`(async () => { const c = document.getElementById('fake-cursor'); const b = document.getElementById('changes').getBoundingClientRect(); c.style.left = (b.right / 2 - 20) + 'px'; c.style.top = (b.top / 2 + 30) + 'px'; })()`);
await sleep(4000);
const endTs = Date.now() / 1000;
await send('Page.stopScreencast');
const audioB64 = await evaluate(`new Promise(r => { __rec.onstop = async () => { const b = new Blob(__chunks, { type: 'audio/webm' }); const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(b); }; __rec.stop(); })`);
writeFileSync(join(DIR, 'audio.webm'), Buffer.from(audioB64, 'base64'));
// ffmpeg concat list with each frame's real duration.
let list = '';
frames.forEach((fr, i) => { const next = i + 1 < frames.length ? frames[i + 1].ts : endTs; list += `file '${fr.f}'\nduration ${Math.max(0.001, next - fr.ts).toFixed(4)}\n`; });
list += `file '${frames.at(-1).f}'\n`;
writeFileSync(join(DIR, 'frames.txt'), list);
writeFileSync(join(DIR, 'sync.json'), JSON.stringify({ firstFrame: frames[0].ts, recStart: recStart / 1000, end: endTs, frames: frames.length }));
console.log('frames', frames.length, 'video s', (endTs - frames[0].ts).toFixed(1), 'audio offset s', (frames[0].ts - recStart / 1000).toFixed(3));
console.log(logs.join('\n'));
ws.close(); chrome.kill(); process.exit(0);
