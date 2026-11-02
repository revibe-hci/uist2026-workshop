// Remix (TaleBrush x Luminate): generated story dimensions as sketch lanes.
// Not in the TaleBrush paper. Luminate (Suh et al., CHI 2024) generates the key
// dimensions of a prompt's design space; here each "arc" dimension becomes a lane
// aligned with the fortune canvas, sketched like TaleBrush's surprise panel, and
// each "setting" dimension becomes a row of chips that can be pinned.
// A second protagonist (TaleBrush Section 3, Figure 3a: "multiple control panels")
// gets a taller fortune panel of its own, and the sentences where the two
// protagonists interact are highlighted.
"use strict";

const LANE_H = 104, P_H = 170, L_PAD_T = 12, L_PAD_B = 12;
const DIM_COLORS = ["#e07a2f", "#8e5bd6", "#1f9e89", "#c2417a", "#7a8c1f"];
const P2_COLOR = "#d1495b";
const MEET_COLOR = "#f08aa8";
const laneH = d => d.kind === "protagonist" ? P_H : LANE_H;
const lyH = (v, h) => L_PAD_T + (1 - v) * (h - L_PAD_T - L_PAD_B);
const ylH = (y, h) => clamp((h - L_PAD_B - y) / (h - L_PAD_T - L_PAD_B), 0, 1);

state.dims = [];       // arc dimensions and protagonists: {id, kind, name, low, high, color, sketch, person?}
state.settings = [];   // setting dimensions: {name, values, pinned}
state.dimsSuggested = false;
let dimSeq = 1;
let liveLane = null;   // {dim, map, last} while a lane stroke is drawn

const secondProtagonist = () => state.dims.find(d => d.kind === "protagonist" && d.person);

// Dimension definitions sent to the model. With a second protagonist, a rating-only
// "interaction" dimension is added: it is never sketched or explored, only read.
function arcDimDefs() {
  const defs = state.dims.filter(d => d.kind !== "protagonist" || d.person)
    .map(d => ({ id: d.id, name: d.name, low: d.low, high: d.high, ...(d.person ? { person: d.person } : {}) }));
  const p2 = secondProtagonist();
  if (p2) {
    const a = state.name.trim() || "the protagonist", b = p2.person;
    defs.push({ id: "meet", name: `${a} and ${b} interact`, rateOnly: true,
      low: `${a} and ${b} are not together and have no contact in this sentence`,
      high: `${a} and ${b} directly interact in this sentence (meet, talk, help, clash)` });
  }
  return defs;
}
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
  if (id === "fortune") return (state.name.trim() || "Protagonist") + "'s fortune";
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

// Re-read written sentences so every lane shows where the story already is.
function rereadAll(delay = 50) {
  state.bullets.forEach(b => { if (isWritten(b)) b.recText = null; });
  scheduleRecognition(delay);
}

function addDims(arc, setting) {
  for (const a of arc || []) {
    if (state.dims.filter(d => d.kind !== "protagonist").length >= 5 ||
        state.dims.some(d => d.name.toLowerCase() === a.name.toLowerCase())) continue;
    state.dims.push({ id: "d" + dimSeq, kind: "arc", name: a.name, low: a.low, high: a.high,
      color: DIM_COLORS[(dimSeq - 1) % DIM_COLORS.length], sketch: new Array(COLS).fill(null) });
    dimSeq++;
  }
  for (const s of setting || []) {
    if (state.settings.some(x => x.name.toLowerCase() === s.name.toLowerCase())) continue;
    state.settings.push({ name: s.name, values: s.values, pinned: null });
  }
  buildLanes(); renderSettings(); renderCanvas();
  if (typeof refreshAxes === "function") refreshAxes();
  rereadAll();
}

async function suggestDims() {
  const btn = $("suggestDims");
  btn.disabled = true; btn.textContent = "✦ Finding dimensions…";
  try {
    const res = await api("/api/dimensions", { name: state.name.trim(), title: $("title").value,
      sentences: state.bullets.map(b => b.text), arcDims: arcDimDefs(),
      nArc: Math.max(1, 3 - state.dims.filter(d => d.kind !== "protagonist").length), nSetting: 3 });
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
      sentences: state.bullets.map(b => b.text), arcDims: arcDimDefs(), custom: name });
    addDims(res.arc.length ? res.arc : [{ name, low: "low", high: "high" }], []);
  } catch (err) {
    addDims([{ name, low: "low", high: "high" }], []);
  } finally {
    $("addDimInput").placeholder = "+ add your own dimension (e.g. Mike's loneliness)";
  }
});

// ---------------------------------------------------------------------------
// Second protagonist
// ---------------------------------------------------------------------------
$("addProtagonist").addEventListener("click", () => {
  if (!state.dims.some(d => d.kind === "protagonist")) {
    state.dims.unshift({ id: "p2", kind: "protagonist", person: "", name: "Second protagonist's fortune",
      low: "terrible fortune (disaster, despair)", high: "wonderful fortune (triumph, joy)",
      color: P2_COLOR, sketch: new Array(COLS).fill(null) });
    buildLanes(); renderCanvas();
  }
  const input = document.querySelector("#protagonists .p-name");
  if (input) input.focus();
  $("addProtagonist").hidden = true;
});

let p2Timer = null;
function renameProtagonist(d, person) {
  d.person = person.trim();
  d.name = (d.person || "Second protagonist") + "'s fortune";
  clearTimeout(p2Timer);
  p2Timer = setTimeout(() => {
    if (typeof refreshAxes === "function") refreshAxes();
    if (d.person) rereadAll(0);
    renderCanvas();
  }, 900);
}

// Sentence-level interaction between the two protagonists (rated by the model).
function meetsAt(b) {
  return !!(secondProtagonist() && b && isWritten(b) && b.values && b.values.meet >= 0.5);
}
function drawInteractions(svg, height, bullets, n) {
  if (!secondProtagonist()) return;
  for (let i = 0; i < n; i++) {
    if (!meetsAt(bullets[i])) continue;
    const x = PAD_L + i * slotW(n);
    el("rect", { x, y: 0, width: slotW(n), height, fill: MEET_COLOR, "fill-opacity": 0.16 }, svg);
    el("line", { x1: x + slotW(n) / 2, y1: 2, x2: x + slotW(n) / 2, y2: height - 2, stroke: MEET_COLOR,
      "stroke-width": 1.5, "stroke-dasharray": "4 4", "stroke-opacity": 0.8 }, svg);
    const t = el("text", { x: x + slotW(n) / 2, y: 13, "text-anchor": "middle", "font-size": 11, fill: "#c2185b", "font-weight": 600 }, svg);
    t.textContent = "⇄";
  }
}

// ---------------------------------------------------------------------------
// Lanes and the protagonist panel
// ---------------------------------------------------------------------------
function buildLanes() {
  $("lanes").innerHTML = "";
  $("protagonists").innerHTML = "";
  for (const d of state.dims) {
    const isP = d.kind === "protagonist";
    const lane = document.createElement("div");
    lane.className = "lane" + (isP ? " protagonist" : "");
    lane.innerHTML = isP ? `
      <div class="lane-head">
        <span class="swatch" style="background:${d.color}"></span>
        <input class="p-name" placeholder="Name" aria-label="Second protagonist's name"><span class="lane-name">'s fortune</span>
        <span class="lane-scale">second protagonist · ⇄ marks where the two interact</span>
        <span class="lane-state"></span>
        <button class="lane-btn clear" title="Clear this sketch (it will be explored)">clear</button>
        <button class="lane-btn remove" title="Remove the second protagonist">✕</button>
      </div>` : `
      <div class="lane-head">
        <span class="swatch" style="background:${d.color}"></span>
        <span class="lane-name"></span>
        <span class="lane-scale"></span>
        <span class="lane-state"></span>
        <button class="lane-btn clear" title="Clear this lane's sketch (it will be explored)">clear</button>
        <button class="lane-btn remove" title="Remove this dimension">✕</button>
      </div>`;
    if (isP) {
      const input = lane.querySelector(".p-name");
      input.value = d.person;
      input.addEventListener("input", () => renameProtagonist(d, input.value));
    } else {
      lane.querySelector(".lane-name").textContent = d.name;
      lane.querySelector(".lane-scale").textContent = `0 ${d.low} · 1 ${d.high}`;
    }
    const svg = el("svg", { viewBox: `0 0 ${W} ${laneH(d)}`, preserveAspectRatio: "none", class: "lane-canvas" });
    svg.style.height = laneH(d) + "px";
    svg.dataset.dim = d.id;
    lane.appendChild(svg);
    lane.querySelector(".clear").addEventListener("click", () => { d.sketch.fill(null); renderCanvas(); });
    lane.querySelector(".remove").addEventListener("click", () => {
      state.dims = state.dims.filter(x => x !== d);
      if (isP) {
        $("addProtagonist").hidden = false;
        state.bullets.forEach(b => { if (b.values) delete b.values.meet; });
      }
      buildLanes(); renderEditor(); renderCanvas();
      if (typeof refreshAxes === "function") refreshAxes();
    });
    attachLanePointer(svg, d);
    (isP ? $("protagonists") : $("lanes")).appendChild(lane);
  }
}

function attachLanePointer(svg, d) {
  const h = laneH(d);
  svg.addEventListener("pointerdown", e => {
    if (state.busy || state.preview || e.button !== 0) return;
    svg.setPointerCapture(e.pointerId);
    const p = svgPoint(svg, e);
    if (state.tool === "eraser") { eraseLane(d, p); return; }
    liveLane = { dim: d, map: new Map([[xcol(p.x), ylH(p.y, h)]]), last: p };
  });
  svg.addEventListener("pointermove", e => {
    const p = svgPoint(svg, e);
    if (state.tool === "eraser") { if (e.buttons & 1) eraseLane(d, p); return; }
    if (!liveLane || liveLane.dim !== d) return;
    rasterize(liveLane.map, liveLane.last, p, (a, b, t) => ylH(a.y + (b.y - a.y) * t, h));
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
    if (d.sketch[c] !== null && Math.abs(p.y - lyH(d.sketch[c], laneH(d))) <= ERASER_R + 6) d.sketch[c] = null;
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
  const bullets = state.preview ? state.preview.bullets : state.bullets;
  for (const svg of document.querySelectorAll(".lane-canvas")) {
    const d = state.dims.find(x => x.id === svg.dataset.dim);
    if (!d) continue;
    const h = laneH(d), isP = d.kind === "protagonist";
    const yOf = v => lyH(v, h);
    svg.innerHTML = "";
    svg.classList.toggle("eraser", state.tool === "eraser");
    if (isP) {   // same banding as the main fortune canvas
      el("rect", { x: 0, y: 0, width: W, height: yOf(0.5), fill: "#fffbea" }, svg);
      el("rect", { x: 0, y: yOf(0.5), width: W, height: h - yOf(0.5), fill: "#f1f1f1" }, svg);
    } else {
      el("rect", { x: 0, y: 0, width: W, height: h, fill: "#fff" }, svg);
    }
    for (let i = 1; i < n; i++) {
      const x = PAD_L + i * slotW(n);
      el("line", { x1: x, y1: 2, x2: x, y2: h - 2, stroke: "#e2e2e2" }, svg);
    }
    el("line", { x1: 0, y1: yOf(0.5), x2: W, y2: yOf(0.5), stroke: isP ? "#c3c3c3" : "#d4d4d4", "stroke-width": isP ? 2 : 1.2 }, svg);
    if (isP) drawInteractions(svg, h, bullets, n);

    // Versions in the design space: faint; the hovered one strong.
    if (typeof spaceVariantsForOverlay === "function") {
      for (const { bullets: vb, strong } of spaceVariantsForOverlay()) {
        drawSeries(svg, seriesPoints(vb, n, d.id), yOf,
          strong ? { color: "#5b2bbf", width: 2.5, opacity: 0.95, dots: true, r: 3 } : { color: "#7b5bd0", width: 1.2, opacity: 0.16 });
      }
    }

    // The writer's sketch: the lane's constraint.
    const live = liveLane && liveLane.dim === d ? liveLane.map : null;
    let path = "", open = false;
    for (let c = 0; c < COLS; c++) {
      const v = live && live.has(c) ? live.get(c) : d.sketch[c];
      if (v === null || v === undefined) { open = false; continue; }
      path += (open ? "L" : "M") + colx(c) + "," + yOf(v) + " ";
      open = true;
    }
    if (path) el("path", { d: path, fill: "none", stroke: d.color, "stroke-width": isP ? 12 : 7, "stroke-opacity": 0.22, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
    if (path) el("path", { d: path, fill: "none", stroke: d.color, "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);

    // Where the current story is on this dimension (recognized per sentence).
    drawSeries(svg, seriesPoints(bullets, n, d.id), yOf,
      { color: isP ? P2_COLOR : "#555", width: isP ? 2.5 : 1.8, opacity: state.preview ? 0.35 : 0.9, dots: true, r: isP ? 4.5 : 3.5 });

    const lab = (t, y) => { const e = el("text", { x: 6, y, "font-size": 9, fill: "#aaa" }, svg); e.textContent = t; };
    if (isP) { lab("better", 10); lab("worse", h - 3); } else { lab(d.high, 10); lab(d.low, h - 3); }
    const head = svg.parentElement.querySelector(".lane-state");
    if (isP && !d.person) head.textContent = "name them to start";
    else head.textContent = laneSketched(d) ? "sketched: versions follow it" : "blank: explored across versions";
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
      chip.title = v === null ? "Let versions vary on this" : "Pin: rewrite the story with this, and every new version uses it";
      chip.addEventListener("click", () => pickSetting(s, v));
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

// Picking a value pins it and, when the story has generated sentences (or a sketch),
// rewrites them right away with the new setting, keeping their current arcs.
function pickSetting(s, v) {
  const changed = s.pinned !== v;
  s.pinned = v;
  renderSettings();
  if (!changed || v === null) return;
  const n = slotCount();
  let slots = [];
  for (let i = 0; i < n; i++) {
    const b = state.bullets[i];
    if (b && isWritten(b) && b.kind === "gen" && !b.edited) slots.push(i);
  }
  if (!slots.length) {
    const [first, last] = sketchedRange(n);
    if (first >= 0) for (let i = first; i <= last; i++) if (!isWritten(state.bullets[i])) slots.push(i);
  }
  if (!slots.length) {
    showBanner(`${s.name}: ${v} is pinned. Sketch, Generate Again or Explore versions to write with it.`);
    return;
  }
  if (state.busy) {
    showBanner(`${s.name}: ${v} is pinned; it applies to the next generation (one is running).`);
    return;
  }
  showBanner(null);
  generate(slots, { label: `Setting · ${s.name}: ${v}`, avoidCurrent: false, keepArc: true });
  if (state.space && state.space.variants.length) {
    $("spaceStatus").textContent = `${s.name} is now pinned to ${v}: Explore versions again to see the space with it.`;
  }
}
