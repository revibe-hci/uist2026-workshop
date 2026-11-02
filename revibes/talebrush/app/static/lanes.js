// Remix (TaleBrush x Luminate): generated story dimensions as sketch lanes.
// Not in the TaleBrush paper. Luminate (Suh et al., CHI 2024) generates the key
// dimensions of a prompt's design space; here each "arc" dimension becomes a lane
// aligned with the fortune canvas, sketched like TaleBrush's surprise panel, and
// each "setting" dimension becomes a row of chips that can be pinned.
"use strict";

const LANE_H = 104, L_PAD_T = 12, L_PAD_B = 12, L_PLOT_H = LANE_H - L_PAD_T - L_PAD_B;
const DIM_COLORS = ["#e07a2f", "#8e5bd6", "#1f9e89", "#c2417a", "#7a8c1f"];
const ly = v => L_PAD_T + (1 - v) * L_PLOT_H;
const yl = y => clamp((L_PAD_T + L_PLOT_H - y) / L_PLOT_H, 0, 1);

state.dims = [];       // arc dimensions: {id, name, low, high, color, sketch: Array(COLS)}
state.settings = [];   // setting dimensions: {name, values, pinned}
state.dimsSuggested = false;
let dimSeq = 1;
let liveLane = null;   // {dim, map, last} while a lane stroke is drawn

function arcDimDefs() { return state.dims.map(d => ({ id: d.id, name: d.name, low: d.low, high: d.high })); }
function pinnedSettings() {
  const o = {};
  for (const s of state.settings) if (s.pinned) o[s.name] = s.pinned;
  return o;
}
function dimColor(id) {
  if (id === "fortune") return "#3b8beb";
  const d = state.dims.find(x => x.id === id);
  return d ? d.color : "#999";
}
function dimName(id) {
  if (id === "fortune") return "Fortune";
  const d = state.dims.find(x => x.id === id);
  return d ? d.name : id;
}

// Per-slot target of every sketched lane (same coverage rule as fortune's slotSpec).
function laneTargets(i, n) {
  const [a, b] = slotCols(i, n);
  const out = {};
  for (const d of state.dims) {
    let sum = 0, k = 0;
    for (let c = a; c < b; c++) if (d.sketch[c] !== null) { sum += d.sketch[c]; k++; }
    if (k / (b - a) >= 0.34) out[d.id] = sum / k;
  }
  return out;
}
const laneSketched = d => d.sketch.some(v => v !== null);

function addDims(arc, setting) {
  for (const a of arc || []) {
    if (state.dims.length >= 5 || state.dims.some(d => d.name.toLowerCase() === a.name.toLowerCase())) continue;
    state.dims.push({ id: "d" + dimSeq, name: a.name, low: a.low, high: a.high,
      color: DIM_COLORS[(dimSeq - 1) % DIM_COLORS.length], sketch: new Array(COLS).fill(null) });
    dimSeq++;
  }
  for (const s of setting || []) {
    if (state.settings.some(x => x.name.toLowerCase() === s.name.toLowerCase())) continue;
    state.settings.push({ name: s.name, values: s.values, pinned: null });
  }
  // Re-read written sentences so every lane shows where the story already is.
  state.bullets.forEach(b => { if (isWritten(b)) b.recText = null; });
  buildLanes(); renderSettings(); renderCanvas();
  if (typeof refreshAxes === "function") refreshAxes();
  scheduleRecognition(50);
}

async function suggestDims() {
  const btn = $("suggestDims");
  btn.disabled = true; btn.textContent = "✦ Finding dimensions…";
  try {
    const res = await api("/api/dimensions", { name: state.name.trim(), title: $("title").value,
      sentences: state.bullets.map(b => b.text), nArc: Math.max(1, 3 - state.dims.length), nSetting: 3 });
    state.dimsSuggested = true;
    addDims(res.arc, res.setting);
  } catch (e) {
    showBanner("Could not suggest dimensions: " + e.message, "error");
  } finally {
    btn.disabled = false; btn.textContent = "✦ Suggest dimensions";
  }
}

$("suggestDims").addEventListener("click", suggestDims);
$("addDimForm").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("addDimInput").value.trim();
  if (!name) return;
  $("addDimInput").value = ""; $("addDimInput").placeholder = "Adding " + name + "…";
  try {
    const res = await api("/api/dimensions", { name: state.name.trim(), title: $("title").value,
      sentences: state.bullets.map(b => b.text), custom: name });
    addDims(res.arc.length ? res.arc : [{ name, low: "low", high: "high" }], []);
  } catch (err) {
    addDims([{ name, low: "low", high: "high" }], []);
  } finally {
    $("addDimInput").placeholder = "+ add your own dimension (e.g. Mike's loneliness)";
  }
});

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------
function buildLanes() {
  const wrap = $("lanes");
  wrap.innerHTML = "";
  for (const d of state.dims) {
    const lane = document.createElement("div");
    lane.className = "lane";
    lane.innerHTML = `
      <div class="lane-head">
        <span class="swatch" style="background:${d.color}"></span>
        <span class="lane-name"></span>
        <span class="lane-scale"></span>
        <span class="lane-state"></span>
        <button class="lane-btn clear" title="Clear this lane's sketch (it will be explored)">clear</button>
        <button class="lane-btn remove" title="Remove this dimension">✕</button>
      </div>`;
    lane.querySelector(".lane-name").textContent = d.name;
    lane.querySelector(".lane-scale").textContent = `0 ${d.low} · 1 ${d.high}`;
    const svg = el("svg", { viewBox: `0 0 ${W} ${LANE_H}`, preserveAspectRatio: "none", class: "lane-canvas" });
    svg.dataset.dim = d.id;
    lane.appendChild(svg);
    lane.querySelector(".clear").addEventListener("click", () => { d.sketch.fill(null); renderCanvas(); });
    lane.querySelector(".remove").addEventListener("click", () => {
      state.dims = state.dims.filter(x => x !== d);
      buildLanes(); renderCanvas();
      if (typeof refreshAxes === "function") refreshAxes();
    });
    attachLanePointer(svg, d);
    wrap.appendChild(lane);
  }
}

function attachLanePointer(svg, d) {
  svg.addEventListener("pointerdown", e => {
    if (state.busy || state.preview || e.button !== 0) return;
    svg.setPointerCapture(e.pointerId);
    const p = svgPoint(svg, e);
    if (state.tool === "eraser") { eraseLane(d, p); return; }
    liveLane = { dim: d, map: new Map([[xcol(p.x), yl(p.y)]]), last: p };
  });
  svg.addEventListener("pointermove", e => {
    const p = svgPoint(svg, e);
    if (state.tool === "eraser") { if (e.buttons & 1) eraseLane(d, p); return; }
    if (!liveLane || liveLane.dim !== d) return;
    rasterize(liveLane.map, liveLane.last, p, (a, b, t) => yl(a.y + (b.y - a.y) * t));
    liveLane.last = p;
    renderLanes();
  });
  const end = () => {
    if (!liveLane || liveLane.dim !== d) return;
    for (const [c, v] of liveLane.map) d.sketch[c] = v;
    liveLane = null;
    renderCanvas();
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
}

function eraseLane(d, p) {
  for (let c = xcol(p.x - ERASER_R); c <= xcol(p.x + ERASER_R); c++) {
    if (d.sketch[c] !== null && Math.abs(p.y - ly(d.sketch[c])) <= ERASER_R + 6) d.sketch[c] = null;
  }
  renderLanes();
}

// Values of one dimension along a story (written + generated bullets), as points.
function seriesPoints(bullets, n, dimId) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const b = bullets[i];
    const v = !b || !isWritten(b) ? null : dimId === "fortune" ? b.fortune : (b.values || {})[dimId];
    pts.push(v === null || v === undefined ? null : { x: slotCx(i, n), v, i, gen: b.kind === "gen" });
  }
  return pts;
}

function drawSeries(svg, pts, yOf, o) {
  const g = el("g", { opacity: o.opacity }, svg);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!a || !b) continue;
    el("line", { x1: a.x, y1: yOf(a.v), x2: b.x, y2: yOf(b.v), stroke: o.color, "stroke-width": o.width, "stroke-linecap": "round" }, g);
  }
  if (o.dots) for (const p of pts) if (p) el("circle", { cx: p.x, cy: yOf(p.v), r: o.r || 3.5, fill: o.color, stroke: "#fff", "stroke-width": 1 }, g);
}

function renderLanes() {
  const n = slotCount();
  for (const svg of document.querySelectorAll("#lanes .lane-canvas")) {
    const d = state.dims.find(x => x.id === svg.dataset.dim);
    if (!d) continue;
    svg.innerHTML = "";
    svg.classList.toggle("eraser", state.tool === "eraser");
    el("rect", { x: 0, y: 0, width: W, height: LANE_H, fill: "#fff" }, svg);
    for (let i = 1; i < n; i++) {
      const x = PAD_L + i * slotW(n);
      el("line", { x1: x, y1: 2, x2: x, y2: LANE_H - 2, stroke: "#e2e2e2" }, svg);
    }
    el("line", { x1: 0, y1: ly(0.5), x2: W, y2: ly(0.5), stroke: "#d4d4d4", "stroke-width": 1.2 }, svg);

    // Versions in the design space: faint; the hovered or selected one strong.
    if (typeof spaceVariantsForOverlay === "function") {
      for (const { bullets, strong } of spaceVariantsForOverlay()) {
        drawSeries(svg, seriesPoints(bullets, n, d.id), ly,
          strong ? { color: "#5b2bbf", width: 2.5, opacity: 0.95, dots: true, r: 3 } : { color: "#7b5bd0", width: 1.2, opacity: 0.16 });
      }
    }

    // The writer's sketch: the lane's constraint (thin, in the dimension's colour).
    const live = liveLane && liveLane.dim === d ? liveLane.map : null;
    let path = "", open = false;
    for (let c = 0; c < COLS; c++) {
      const v = live && live.has(c) ? live.get(c) : d.sketch[c];
      if (v === null || v === undefined) { open = false; continue; }
      path += (open ? "L" : "M") + colx(c) + "," + ly(v) + " ";
      open = true;
    }
    if (path) el("path", { d: path, fill: "none", stroke: d.color, "stroke-width": 7, "stroke-opacity": 0.25, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
    if (path) el("path", { d: path, fill: "none", stroke: d.color, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);

    // Where the current story is on this dimension (recognized per sentence).
    const bullets = state.preview ? state.preview.bullets : state.bullets;
    drawSeries(svg, seriesPoints(bullets, n, d.id), ly, { color: "#555", width: 1.8, opacity: state.preview ? 0.35 : 0.85, dots: true });

    const lab = (t, y) => { const e = el("text", { x: 6, y, "font-size": 9, fill: "#aaa" }, svg); e.textContent = t; };
    lab(d.high, 10); lab(d.low, LANE_H - 3);
    const head = svg.parentElement.querySelector(".lane-state");
    head.textContent = laneSketched(d) ? "sketched: versions follow it" : "blank: explored across versions";
    head.classList.toggle("on", laneSketched(d));
  }
}

// ---------------------------------------------------------------------------
// Setting chips (whole-story dimensions)
// ---------------------------------------------------------------------------
function renderSettings() {
  const wrap = $("settings");
  wrap.innerHTML = "";
  for (const s of state.settings) {
    const row = document.createElement("div");
    row.className = "setting-row";
    const name = document.createElement("span");
    name.className = "setting-name"; name.textContent = s.name;
    row.appendChild(name);
    for (const v of [null, ...s.values]) {
      const chip = document.createElement("button");
      chip.className = "chip" + (s.pinned === v ? " on" : "") + (v === null ? " any" : "");
      chip.textContent = v === null ? "explore" : v;
      chip.title = v === null ? "Let versions vary on this" : "Pin: every version uses this";
      chip.addEventListener("click", () => { s.pinned = v; renderSettings(); });
      row.appendChild(chip);
    }
    const rm = document.createElement("button");
    rm.className = "lane-btn remove"; rm.textContent = "✕"; rm.title = "Remove this setting";
    rm.addEventListener("click", () => {
      state.settings = state.settings.filter(x => x !== s);
      renderSettings();
      if (typeof refreshAxes === "function") refreshAxes();
    });
    row.appendChild(rm);
    wrap.appendChild(row);
  }
}
