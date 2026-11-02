// Remix (TaleBrush x Luminate): a design space of story versions.
// Not in the TaleBrush paper. Following Luminate (Suh et al., CHI 2024): many
// versions are generated in parallel from sampled requirements (Sec. 4.1.2),
// arranged by dimensions (4.1.3), viewed with semantic zoom (4.1.5), and extended
// with "more like this" (4.1.4). TaleBrush adds the sketch: lanes you draw are
// constraints every version follows; lanes you leave blank are explored.
"use strict";

const SHAPE_ORDER = ["rising", "falling", "dip", "peak", "steady"];
const LEVELS = ["dots", "arcs", "titles", "loglines", "outlines"];

state.space = { variants: [], level: 1, x: "none", y: "none", hover: null, selected: null,
  controller: null, seq: 0, started: 0, expected: 0, errors: 0 };

// Slots a version rewrites: every blank bullet, and generated ones the writer has not edited.
function targetSlots() {
  const n = slotCount(), idx = [];
  for (let i = 0; i < n; i++) {
    const b = state.bullets[i];
    if (!isWritten(b) || (b.kind === "gen" && !b.edited)) idx.push(i);
  }
  return idx;
}

// A version as a full list of bullets: the writer's lines plus the version's sentences.
function versionBullets(v) {
  const out = v.base.map(b => ({ ...b, values: { ...(b.values || {}) } }));
  for (const s of v.sentences) {
    while (out.length <= s.index) out.push(newBullet());
    const vals = { ...(v.values[String(s.index)] || {}) };
    const f = vals.fortune; delete vals.fortune;
    out[s.index] = { ...newBullet(s.text, "gen"), fortune: f ?? null, values: vals, selfRated: true };
  }
  return out;
}

function shapeOf(v, dimId) {
  const seq = v.sentences.map(s => (v.values[String(s.index)] || {})[dimId]).filter(x => x !== undefined && x !== null);
  if (seq.length < 2) return "steady";
  const first = seq[0], last = seq[seq.length - 1], lo = Math.min(...seq), hi = Math.max(...seq);
  if (hi - lo < 0.2) return "steady";
  const iLo = seq.indexOf(lo), iHi = seq.indexOf(hi);
  if (iLo > 0 && iLo < seq.length - 1 && first - lo > 0.2 && last - lo > 0.2) return "dip";
  if (iHi > 0 && iHi < seq.length - 1 && hi - first > 0.2 && hi - last > 0.2) return "peak";
  return last >= first ? "rising" : "falling";
}

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------
function axisOptions() {
  return [{ key: "none", label: "—" },
    { key: "arc:fortune", label: "Fortune (shape)" },
    ...state.dims.map(d => ({ key: "arc:" + d.id, label: d.name + " (shape)" })),
    ...state.settings.map(s => ({ key: "set:" + s.name, label: s.name }))];
}
function refreshAxes() {
  const opts = axisOptions();
  for (const [id, k] of [["axisX", "x"], ["axisY", "y"]]) {
    const sel = $(id);
    if (!opts.some(o => o.key === state.space[k])) state.space[k] = "none";
    sel.innerHTML = opts.map(o => `<option value="${o.key}">${o.label.replace(/</g, "&lt;")}</option>`).join("");
    sel.value = state.space[k];
  }
  renderSpace();
}
function categoryOf(v, key) {
  if (key === "none") return "";
  if (key.startsWith("arc:")) return shapeOf(v, key.slice(4));
  return (v.requirement.settings || {})[key.slice(4)] || "—";
}
function categoriesFor(key) {
  if (key === "none") return [""];
  const present = new Set(state.space.variants.map(v => categoryOf(v, key)));
  if (key.startsWith("arc:")) return SHAPE_ORDER.filter(s => present.has(s));
  const s = state.settings.find(x => x.name === key.slice(4));
  const order = s ? s.values : [];
  return [...order.filter(x => present.has(x)), ...[...present].filter(x => !order.includes(x))];
}
$("axisX").addEventListener("change", e => { state.space.x = e.target.value; renderSpace(); });
$("axisY").addEventListener("change", e => { state.space.y = e.target.value; renderSpace(); });

// ---------------------------------------------------------------------------
// Semantic zoom
// ---------------------------------------------------------------------------
function setLevel(l) {
  state.space.level = clamp(l, 0, LEVELS.length - 1);
  document.querySelectorAll(".zoom button").forEach(b => b.classList.toggle("active", +b.dataset.level === state.space.level));
  renderSpace();
}
document.querySelectorAll(".zoom button").forEach(b => b.addEventListener("click", () => setLevel(+b.dataset.level)));
let wheelAcc = 0;
$("space").addEventListener("wheel", e => {
  if (!e.ctrlKey && !e.metaKey) return;          // pinch-to-zoom on a trackpad, or Ctrl/Cmd + scroll
  e.preventDefault();
  wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) > 40) { setLevel(state.space.level + (wheelAcc < 0 ? 1 : -1)); wheelAcc = 0; }
}, { passive: false });

// ---------------------------------------------------------------------------
// Exploring: parallel, progressive
// ---------------------------------------------------------------------------
async function explore({ fixed = null, n = null, append = false } = {}) {
  const sp = state.space;
  if (sp.controller) sp.controller.abort();
  if (!state.dims.length && !state.dimsSuggested && state.bullets.some(isWritten)) await suggestDims();
  const total = slotCount();
  const idx = targetSlots();
  if (!idx.length) { showBanner("Every sentence slot holds a sentence you wrote or edited: add blank bullets to explore."); return; }
  const count = n || +$("spaceN").value;
  const slots = idx.map(i => {
    const spec = slotSpec(i, total);
    return { index: i, fortune: spec.target, surprise: spec.surprise, dims: laneTargets(i, total) };
  });
  const base = state.bullets.map((b, i) => idx.includes(i) ? newBullet() : { ...b, values: { ...(b.values || {}) } });
  const payload = { spaceId: "s" + (++sp.seq), n: count, name: state.name.trim(), title: $("title").value,
    sentences: state.bullets.map(b => b.text), slots, arcDims: arcDimDefs(),
    settingDims: state.settings.map(s => ({ name: s.name, values: s.values, pinned: s.pinned })), fixed };
  if (!append) { sp.variants = []; sp.selected = null; $("spaceDetail").hidden = true; }
  sp.expected = (append ? sp.variants.length : 0) + count;
  sp.errors = 0; sp.started = performance.now();
  sp.controller = new AbortController();
  setExploring(true);
  renderSpace(); renderCanvas();
  try {
    const r = await fetch("/api/explore", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: sp.controller.signal });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.type === "variant") {
          const v = msg.variant;
          v.base = base; v.slots = idx; v.n = total; v.fresh = true;
          v.arrivedAt = ((performance.now() - sp.started) / 1000).toFixed(1);
          sp.variants.push(v);
          renderSpace(); renderCanvas();
        } else if (msg.type === "error") {
          sp.errors++;
        }
        updateStatus();
      }
    }
  } catch (e) {
    if (e.name !== "AbortError") showBanner("Exploring failed: " + e.message, "error");
  } finally {
    sp.controller = null;
    setExploring(false);
    updateStatus(true);
  }
}

function setExploring(on) {
  $("exploreBtn").disabled = on;
  $("stopBtn").hidden = !on;
  $("exploreBtn").textContent = on ? "Exploring…" : "Explore versions";
}
function updateStatus(final) {
  const sp = state.space, secs = ((performance.now() - sp.started) / 1000).toFixed(1);
  const got = sp.variants.length;
  $("spaceStatus").textContent = final
    ? `${got} versions${sp.errors ? ` · ${sp.errors} failed` : ""}${sp.started ? ` · ${secs} s` : ""}`
    : `${got} / ${sp.expected} arrived · ${secs} s`;
}
$("exploreBtn").addEventListener("click", () => explore());
$("stopBtn").addEventListener("click", () => { if (state.space.controller) state.space.controller.abort(); });

// ---------------------------------------------------------------------------
// Rendering the space
// ---------------------------------------------------------------------------
function sparkline(v, w, h) {
  const n = v.n, bullets = versionBullets(v);
  const svg = el("svg", { viewBox: `0 0 ${w} ${h}`, width: w, height: h, class: "spark" });
  el("line", { x1: 0, y1: h / 2, x2: w, y2: h / 2, stroke: "#e6e6e6" }, svg);
  for (const id of ["fortune", ...state.dims.map(d => d.id)]) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const b = bullets[i];
      const val = !b || !isWritten(b) ? null : id === "fortune" ? b.fortune : (b.values || {})[id];
      pts.push(val === null || val === undefined ? null : [3 + i * (w - 6) / Math.max(1, n - 1), 3 + (1 - val) * (h - 6)]);
    }
    let d = "", open = false;
    for (const p of pts) { if (!p) { open = false; continue; } d += (open ? "L" : "M") + p[0] + "," + p[1] + " "; open = true; }
    if (d) el("path", { d, fill: "none", stroke: dimColor(id), "stroke-width": id === "fortune" ? 2 : 1.4, "stroke-linejoin": "round" }, svg);
  }
  return svg;
}

function nodeEl(v) {
  const L = state.space.level;
  const node = document.createElement("div");
  node.className = `vnode l${L}` + (v.fresh ? " fresh" : "") + (state.space.selected === v ? " selected" : "")
    + (state.space.hover === v ? " hover" : "");
  v.fresh = false;
  node.title = `${v.title} (arrived at ${v.arrivedAt} s)`;
  if (L >= 1) node.appendChild(sparkline(v, L >= 3 ? 150 : 84, L >= 3 ? 44 : 34));
  if (L >= 2) { const t = document.createElement("div"); t.className = "v-title"; t.textContent = v.title; node.appendChild(t); }
  if (L >= 3) {
    const lg = document.createElement("div"); lg.className = "v-logline"; lg.textContent = v.logline; node.appendChild(lg);
    const tags = document.createElement("div"); tags.className = "v-tags";
    for (const [k, val] of Object.entries(v.requirement.settings || {})) {
      const t = document.createElement("span"); t.textContent = val; t.title = k; tags.appendChild(t);
    }
    node.appendChild(tags);
  }
  if (L >= 4) {
    const ol = document.createElement("ol"); ol.className = "v-outline";
    versionBullets(v).forEach((b, i) => {
      if (!isWritten(b)) return;
      const li = document.createElement("li"); li.value = i + 1; li.textContent = b.text;
      if (b.kind === "gen" && v.slots.includes(i)) li.className = "gen";
      ol.appendChild(li);
    });
    node.appendChild(ol);
  }
  node.addEventListener("mouseenter", () => hoverVersion(v));
  node.addEventListener("mouseleave", () => hoverVersion(null));
  node.addEventListener("click", () => adopt(v));
  return node;
}

function renderSpace() {
  const box = $("space"), sp = state.space;
  if (!sp.variants.length) {
    box.innerHTML = sp.controller
      ? `<p class="space-empty">Writing ${sp.expected} versions in parallel… the first ones usually arrive in about 10 s.</p>`
      : `<p class="space-empty">Sketch what you know (fortune or any lane), leave the rest blank, and explore versions. Blank lanes and unpinned settings vary across versions.</p>`;
    return;
  }
  const xs = categoriesFor(sp.x), ys = categoriesFor(sp.y);
  box.innerHTML = "";
  const grid = document.createElement("div");
  grid.className = "space-grid";
  const hasX = sp.x !== "none", hasY = sp.y !== "none";
  grid.style.gridTemplateColumns = (hasY ? "max-content " : "") + `repeat(${xs.length}, minmax(0, 1fr))`;
  if (hasX) {
    if (hasY) grid.appendChild(document.createElement("div"));
    for (const x of xs) { const h = document.createElement("div"); h.className = "axis-head"; h.textContent = x; grid.appendChild(h); }
  }
  for (const y of ys) {
    if (hasY) { const h = document.createElement("div"); h.className = "axis-head y"; h.textContent = y; grid.appendChild(h); }
    for (const x of xs) {
      const cell = document.createElement("div");
      cell.className = "cell";
      for (const v of sp.variants) if (categoryOf(v, sp.x) === x && categoryOf(v, sp.y) === y) cell.appendChild(nodeEl(v));
      grid.appendChild(cell);
    }
  }
  box.appendChild(grid);
  if (sp.controller && sp.variants.length < sp.expected) {
    const p = document.createElement("p"); p.className = "space-pending";
    p.textContent = `${sp.expected - sp.variants.length} more on the way…`;
    box.appendChild(p);
  }
}

// ---------------------------------------------------------------------------
// Linking to the editor, canvas and lanes
// ---------------------------------------------------------------------------
function spaceVariantsForOverlay() {
  const sp = state.space, out = [];
  for (const v of sp.variants) {
    if (v === sp.hover) continue;
    out.push({ bullets: versionBullets(v), strong: false });
  }
  if (sp.hover) out.push({ bullets: versionBullets(sp.hover), strong: true });
  return out;
}

function drawSpaceOverlay() {
  const n = slotCount();
  for (const { bullets, strong } of spaceVariantsForOverlay()) {
    drawArc(bullets, n, strong ? { color: "#5b2bbf", width: 3, opacity: 0.95, dots: true }
      : { color: "#7b5bd0", width: 1.2, opacity: 0.14, dots: false });
  }
}

function hoverVersion(v) {
  state.space.hover = v;
  state.preview = v ? { id: "space-" + v.id, bullets: versionBullets(v), nSlots: v.n } : null;
  document.querySelectorAll(".vnode").forEach(n => n.classList.remove("hover"));
  renderEditor(); renderCanvas(); updateGenerateButton();
}

// Converge: the version becomes the story. Its own ratings are drawn at once;
// the recognition module then re-reads every new sentence and corrects them.
function adopt(v) {
  const sp = state.space;
  sp.selected = v; sp.hover = null; state.preview = null;
  if (!state.history.length && state.bullets.some(isWritten)) pushHistory("Initial");
  const bs = versionBullets(v);
  for (const i of v.slots) {
    while (state.bullets.length <= i) state.bullets.push(newBullet());
    const b = bs[i];
    Object.assign(state.bullets[i], { text: b.text, kind: "gen", edited: false, fortune: b.fortune,
      values: { ...b.values }, recText: null, selfRated: true });
  }
  pushHistory("Space · " + v.title);
  renderEditor(); renderCanvas(); renderSpace(); showDetail(v);
  scheduleRecognition(50);
}

function showDetail(v) {
  const box = $("spaceDetail");
  box.hidden = false;
  box.innerHTML = "";
  const h = document.createElement("div"); h.className = "detail-title";
  h.textContent = `In the editor: ${v.title}`;
  const lg = document.createElement("div"); lg.className = "detail-logline"; lg.textContent = v.logline;
  const row = document.createElement("div"); row.className = "detail-actions";
  const lab = document.createElement("span"); lab.textContent = "Pin its curve:"; row.appendChild(lab);
  for (const id of ["fortune", ...state.dims.map(d => d.id)]) {
    const b = document.createElement("button");
    b.className = "pin-btn"; b.style.borderColor = dimColor(id); b.style.color = dimColor(id);
    b.textContent = dimName(id);
    b.title = "Copy this version's curve into your sketch, so the next versions follow it";
    b.addEventListener("click", () => pinCurve(v, id));
    row.appendChild(b);
  }
  if (Object.keys(v.requirement.settings || {}).length) {
    const ps = document.createElement("button"); ps.className = "pin-btn";
    ps.textContent = "Pin its settings";
    ps.addEventListener("click", () => {
      for (const s of state.settings) { const val = v.requirement.settings[s.name]; if (val) s.pinned = val; }
      renderSettings();
    });
    row.appendChild(ps);
  }
  const more = document.createElement("button"); more.className = "more-btn";
  more.textContent = "＋ 4 more like this";
  more.title = "Same shapes and settings, new sentences";
  more.addEventListener("click", () => explore({ fixed: v.requirement, n: 4, append: true }));
  row.appendChild(more);
  box.append(h, lg, row);
}

// Adopt a curve from the space into the sketch: exploring turns into sketching.
function pinCurve(v, dimId) {
  const n = v.n, bs = versionBullets(v);
  const pts = v.slots.map(i => {
    const b = bs[i];
    const val = dimId === "fortune" ? b.fortune : (b.values || {})[dimId];
    return val === null || val === undefined ? null : { c: xcol(slotCx(i, n)), i, v: val };
  }).filter(Boolean);
  if (!pts.length) return;
  const set = (c, val) => {
    if (dimId === "fortune") state.sketch[c] = { y: val, hw: 0.08 };
    else { const d = state.dims.find(x => x.id === dimId); if (d) d.sketch[c] = val; }
  };
  const half = Math.floor(COLS / n / 2);
  for (let c = Math.max(0, pts[0].c - half); c <= pts[0].c; c++) set(c, pts[0].v);
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    for (let c = a.c; c <= b.c; c++) set(c, a.v + (b.v - a.v) * (c - a.c) / Math.max(1, b.c - a.c));
  }
  const z = pts[pts.length - 1];
  for (let c = z.c; c <= Math.min(COLS - 1, z.c + half); c++) set(c, z.v);
  renderCanvas();
}

refreshAxes();
