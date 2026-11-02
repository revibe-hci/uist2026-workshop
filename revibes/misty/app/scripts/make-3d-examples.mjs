// 3D remix: renders the two sample references that contain 3D elements
// (public/examples/3d-product.png, 3d-stats.png) with three.js in headless Chrome.
// They are committed, so you only need this to change them. macOS paths by default.
//
//   node scripts/make-3d-examples.mjs
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const THREE = `file://${join(ROOT, 'node_modules/three/build/three.module.js')}`;
const ADDONS = `file://${join(ROOT, 'node_modules/three/examples/jsm/')}`;
const TMP = mkdtempSync(join(tmpdir(), 'misty-3d-'));

const page = (body, script, bg) => `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"three":"${THREE}","three/addons/":"${ADDONS}"}}</script>
<style>
  body { margin: 0; font-family: -apple-system, system-ui, "Helvetica Neue", sans-serif; }
  .screen { width: 390px; height: 844px; overflow: hidden; position: relative; background: ${bg}; }
  .gl { position: relative; } .gl canvas { position: absolute; inset: 0; }
</style></head><body><div class="screen">${body}</div>
<script type="module">
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
function scene(id, { camera = [0, 0, 5], fov = 40, look = [0, 0, 0] } = {}) {
  const el = document.getElementById(id);
  const w = el.clientWidth, h = el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(2); renderer.setSize(w, h); el.appendChild(renderer.domElement);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.1, 100);
  cam.position.set(...camera); cam.lookAt(...look);
  s.add(new THREE.AmbientLight(0xffffff, 0.5));
  s.add(new THREE.HemisphereLight(0xffffff, 0x334155, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 5, 4); s.add(key);
  const rim = new THREE.DirectionalLight(0xa5b4fc, 1.2); rim.position.set(-4, 2, -3); s.add(rim);
  return { s, render: () => renderer.render(s, cam) };
}
${script}
</script></body></html>`;

// 1. A product page: a glossy 3D hero object and three rounded 3D category tiles.
const product = page(
  `<div style="display:flex;justify-content:space-between;align-items:center;padding:54px 22px 0;color:#e0e7ff;font-size:15px">
     <span style="font-size:22px">‹</span><span style="font-weight:600;letter-spacing:.04em">LUMEN STUDIO</span><span>◎</span></div>
   <div id="hero" class="gl" style="height:330px;margin-top:6px"></div>
   <div style="padding:0 24px;color:#fff">
     <div style="font-size:12px;letter-spacing:.14em;color:#a5b4fc">DESK LIGHT</div>
     <div style="font-size:34px;font-weight:700;margin-top:4px">Orbit Lamp</div>
     <div style="font-size:14px;color:#c7d2fe;margin-top:6px;line-height:1.45">Hand-blown glass shade on a brushed metal ring. Warm, soft and dimmable.</div>
   </div>
   <div style="padding:20px 24px 0;color:#c7d2fe;font-size:12px;letter-spacing:.1em">COLLECTIONS</div>
   <div id="tiles" class="gl" style="height:120px;margin:4px 12px 0"></div>
   <div style="display:flex;justify-content:space-around;padding:0 18px;color:#e0e7ff;font-size:12px;margin-top:-6px"><span>Glass</span><span>Metal</span><span>Ceramic</span></div>
   <div style="position:absolute;left:22px;right:22px;bottom:34px;display:flex;align-items:center;justify-content:space-between">
     <span style="color:#fff;font-size:26px;font-weight:700">$129</span>
     <span style="background:linear-gradient(90deg,#818cf8,#c084fc);color:#fff;font-weight:600;padding:14px 34px;border-radius:999px">Add to bag</span></div>`,
  `
  const hero = scene('hero', { camera: [0, 0.6, 5.2], look: [0, 0.2, 0] });
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.95, 0.32, 220, 32),
    new THREE.MeshPhysicalMaterial({ color: 0xa78bfa, metalness: 0.25, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4 }));
  knot.rotation.set(0.5, 0.4, 0.1); knot.position.y = 0.35; hero.s.add(knot);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.06, 24, 120),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.25 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -1.15; hero.s.add(ring);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 64), new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.22 }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -1.2; hero.s.add(glow);
  hero.render();
  const tiles = scene('tiles', { camera: [0, 1.0, 4.6], fov: 38 });
  [[-2.3, 0x60a5fa], [0, 0xf472b6], [2.3, 0x34d399]].forEach(([x, c], i) => {
    const t = new THREE.Mesh(new RoundedBoxGeometry(1.7, 1.3, 0.5, 6, 0.22),
      new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 0.8 }));
    t.position.set(x, 0, 0); t.rotation.set(-0.25, (i - 1) * -0.25, 0); tiles.s.add(t);
    const gem = new THREE.Mesh(i === 0 ? new THREE.IcosahedronGeometry(0.32) : i === 1 ? new THREE.SphereGeometry(0.3, 32, 16) : new THREE.OctahedronGeometry(0.34),
      new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.3 }));
    gem.position.set(x, 0.05, 0.45); tiles.s.add(gem);
  });
  tiles.render();
  `,
  'radial-gradient(120% 70% at 50% 25%, #3b2a7a 0%, #1e1b4b 55%, #0f0d24 100%)'
);

// 2. A stats screen: a 3D bar chart and a 3D progress ring.
const stats = page(
  `<div style="padding:58px 22px 0">
     <div style="font-size:13px;color:#64748b">Monday, 2 November</div>
     <div style="font-size:30px;font-weight:700;color:#0f172a;margin-top:2px">Weekly activity</div></div>
   <div style="margin:18px 16px 0;background:#fff;border-radius:22px;box-shadow:0 10px 30px rgba(15,23,42,.08);padding:14px 10px 6px">
     <div style="display:flex;justify-content:space-between;padding:0 10px;font-size:13px;color:#475569"><b style="color:#0f172a">Active minutes</b><span>This week</span></div>
     <div id="bars" class="gl" style="height:230px"></div>
     <div style="display:flex;justify-content:space-around;font-size:11px;color:#94a3b8;margin-top:-8px;padding-bottom:6px"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div></div>
   <div style="display:flex;gap:12px;margin:14px 16px 0">
     <div style="flex:1;background:#fff;border-radius:22px;box-shadow:0 10px 30px rgba(15,23,42,.08);position:relative">
       <div id="ring" class="gl" style="height:170px"></div>
       <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><b style="font-size:26px;color:#0f172a">72%</b><span style="font-size:11px;color:#64748b">of goal</span></div></div>
     <div style="flex:1;display:flex;flex-direction:column;gap:12px">
       <div style="flex:1;background:#0f172a;border-radius:22px;color:#fff;padding:16px"><div style="font-size:12px;color:#94a3b8">Calories</div><div style="font-size:24px;font-weight:700;margin-top:6px">2,340</div></div>
       <div style="flex:1;background:#eef2ff;border-radius:22px;padding:16px"><div style="font-size:12px;color:#6366f1">Streak</div><div style="font-size:24px;font-weight:700;color:#312e81;margin-top:6px">9 days</div></div></div></div>
   <div style="position:absolute;left:0;right:0;bottom:0;height:82px;background:#fff;border-top:1px solid #e2e8f0;display:flex;justify-content:space-around;align-items:center;font-size:11px;color:#94a3b8"><span style="color:#6366f1">● Today</span><span>Workouts</span><span>Sleep</span><span>Profile</span></div>`,
  `
  const bars = scene('bars', { camera: [3.4, 3.6, 8.2], fov: 34, look: [0, 1.0, 0] });
  const heights = [1.2, 2.0, 1.5, 2.6, 1.9, 3.0, 2.3];
  const base = new THREE.Mesh(new RoundedBoxGeometry(8.2, 0.16, 2.0, 4, 0.06), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
  base.position.y = -0.08; bars.s.add(base);
  heights.forEach((h, i) => {
    const color = new THREE.Color().setHSL(0.68 - i * 0.035, 0.75, 0.62);
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.72, h, 0.72, 4, 0.12), new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.6 }));
    b.position.set(-3.3 + i * 1.1, h / 2, 0); bars.s.add(b);
  });
  bars.render();
  const ring = scene('ring', { camera: [0, -2.2, 4.4], fov: 38 });
  const track = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.2, 32, 120), new THREE.MeshStandardMaterial({ color: 0xe0e7ff, roughness: 0.6 }));
  const done = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.24, 32, 120, Math.PI * 2 * 0.72), new THREE.MeshPhysicalMaterial({ color: 0x6366f1, roughness: 0.2, clearcoat: 1 }));
  done.rotation.z = Math.PI / 2; ring.s.add(track); ring.s.add(done);
  ring.render();
  `,
  '#f1f5f9'
);

function shoot(html, out) {
  const file = join(TMP, `${out}.html`);
  writeFileSync(file, html);
  const png = join(TMP, `${out}.png`);
  const r = spawnSync(CHROME, [
    '--headless=new', '--hide-scrollbars', '--allow-file-access-from-files',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    '--force-device-scale-factor=2', '--window-size=390,844', '--virtual-time-budget=6000',
    `--screenshot=${png}`, `file://${file}`,
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  copyFileSync(png, join(ROOT, 'public/examples', `${out}.png`));
  console.log('wrote', `public/examples/${out}.png`);
}

shoot(product, '3d-product');
shoot(stats, '3d-stats');
rmSync(TMP, { recursive: true, force: true });
