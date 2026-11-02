// TaleBrush revibe: front end (plain JavaScript, no build step).
// Paper sections referenced in comments: 3 (sketching), 4.2 (interface), 5 (modules).
"use strict";

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
const W = 640, H = 340, PAD_L = 20, PAD_R = 20, PAD_T = 18, PAD_B = 22;
const PLOT_W = W - PAD_L - PAD_R, PLOT_H = H - PAD_T - PAD_B;
const SH = 150, S_PAD_T = 12, S_PAD_B = 14, S_PLOT_H = SH - S_PAD_T - S_PAD_B;
const COLS = 300;               // the sketch is stored per column (2 SVG units each)
const COL_W = PLOT_W / COLS;
const MIN_SLOTS = 8;            // empty sentence slots to sketch into (Figure 1 A2 shows blank bullets)

// Sketching speed -> band half-width, in fortune units (Section 4.2.2).
// Slow -> thin (tight control), fast -> wide (loose control).
const HW_MIN = 0.05, HW_MAX = 0.25;
const SPEED_SLOW = 0.12, SPEED_FAST = 0.9;   // SVG units per millisecond
const MIN_STROKE_COLS = 12;     // shorter strokes (e.g., a stray click) do not generate

const fy = f => PAD_T + (1 - f) * PLOT_H;              // fortune -> y
const yf = y => clamp((PAD_T + PLOT_H - y) / PLOT_H, 0, 1);
const sy = s => S_PAD_T + (1 - s) * S_PLOT_H;          // surprise -> y
const ys = y => clamp((S_PAD_T + S_PLOT_H - y) / S_PLOT_H, 0, 1);
const xcol = x => clamp(Math.floor((x - PAD_L) / COL_W), 0, COLS - 1);
const colx = c => PAD_L + (c + 0.5) * COL_W;
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let nextId = 1;
const newBullet = (text = "", kind = "user") => ({ id: nextId++, text, kind, edited: false, fortune: null, values: {}, recText: null, recName: null });

const state = {
  name: "",
  bullets: [newBullet()],
  sketch: new Array(COLS).fill(null),     // {y: fortune, hw: half-width} per column
  surprise: new Array(COLS).fill(null),   // surprise level per column
  surpriseOn: false,
  tool: "pen",
  history: [],                            // stored stories (Section 4.2.3)
  currentHistoryId: null,
  preview: null,                          // history entry hovered in the dropdown
  busy: false,
  model: null,
};

const slotCount = () => Math.max(state.bullets.length, MIN_SLOTS);
const slotW = n => PLOT_W / n;
const slotCx = (i, n) => PAD_L + (i + 0.5) * slotW(n);
const slotCols = (i, n) => {
  const a = Math.floor(i * COLS / n), b = Math.max(a + 1, Math.floor((i + 1) * COLS / n));
  return [a, b];
};
const isWritten = b => b && b.text.trim() !== "";

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const svgNS = "http://www.w3.org/2000/svg";
function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(svgNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

const canvas = $("canvas"), sCanvas = $("surpriseCanvas"), editor = $("editor");

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
async function api(path, body) {
  const r = await fetch(path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function showBanner(msg, kind = "warn") {
  const b = $("banner");
  if (!msg) { b.hidden = true; return; }
  b.hidden = false; b.textContent = msg; b.className = "banner" + (kind === "error" ? " error" : "");
}

async function checkStatus() {
  try {
    const s = await api("/api/status");
    state.model = s;
    if (s.stub) showBanner("STUB MODE: no language model is connected. Sentences are canned templates and fortune scores come from a keyword list. Restart the server without --stub once the LLM bridge works.");
    else if (!s.ok) showBanner(s.error + " — start it from the repository root: python3 llm-bridge/bridge.py claude", "error");
    else showBanner(null);
    $("modelNote").textContent = s.ok
      ? `Language model: ${s.model}${s.stub ? "" : " via the workshop LLM bridge"}. It substitutes the paper's GPT-Neo 2.7B with trained soft prompts (fortune recognition) and the modified GeDi on GPT2-medium (controlled generation).`
      : "";
    if (!s.ok) setTimeout(checkStatus, 4000);
  } catch (e) {
    showBanner("Cannot reach the TaleBrush server: " + e.message, "error");
    setTimeout(checkStatus, 4000);
  }
}

// ---------------------------------------------------------------------------
// Fortune recognition of written sentences (Section 4.2.1, 5.2.1)
// ---------------------------------------------------------------------------
let recTimer = null, recInFlight = false, recAgain = false;
function scheduleRecognition(delay = 700) {
  clearTimeout(recTimer);
  recTimer = setTimeout(runRecognition, delay);
}
async function runRecognition() {
  if (recInFlight) { recAgain = true; return; }
  const name = state.name.trim();
  const idx = [];
  state.bullets.forEach((b, i) => { if (isWritten(b) && (b.recText !== b.text.trim() || b.recName !== name)) idx.push(i); });
  if (!idx.length) return;
  const sentSnapshot = state.bullets.map(b => b.text.trim());
  const ids = idx.map(i => state.bullets[i].id);
  recInFlight = true;
  renderEditorMarks();
  try {
    const dims = typeof arcDimDefs === "function" ? arcDimDefs() : [];
    if (dims.length) {
      const res = await api("/api/recognize", { name, sentences: sentSnapshot, indices: idx, dims: [{ id: "fortune" }, ...dims] });
      idx.forEach((i, k) => {
        const b = state.bullets.find(x => x.id === ids[k]);
        const v = res.values[String(i)];
        if (b && v && b.text.trim() === sentSnapshot[i]) {
          b.fortune = v.fortune; b.values = { ...b.values, ...v }; delete b.values.fortune;
          b.recText = sentSnapshot[i]; b.recName = name; b.selfRated = false;
        }
      });
      return;
    }
    const res = await api("/api/recognize", { name, sentences: sentSnapshot, indices: idx });
    idx.forEach((i, k) => {
      const b = state.bullets.find(x => x.id === ids[k]);
      if (b && b.text.trim() === sentSnapshot[i] && res.scores[String(i)] !== undefined) {
        b.fortune = res.scores[String(i)];
        b.recText = sentSnapshot[i];
        b.recName = name;
      }
    });
    if (state.model && !state.model.ok) checkStatus();
  } catch (e) {
    showBanner("Fortune recognition failed: " + e.message, "error");
  } finally {
    recInFlight = false;
    // Remix: the stored copy of this story gets the same ratings; other stories fill gaps.
    if (typeof syncCurrentHistory === "function") syncCurrentHistory();
    if (typeof ensureRatings === "function") ensureRatings();
    renderCanvas(); renderEditorMarks();
    if (recAgain) { recAgain = false; scheduleRecognition(50); }
  }
}

// ---------------------------------------------------------------------------
// Text editor: one bullet per sentence (Section 4.2.1, Figure 1 A2/B1)
// ---------------------------------------------------------------------------
function autosize(t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }

function renderEditor(focus) {
  const preview = state.preview;
  const bullets = preview ? preview.bullets : state.bullets;
  editor.innerHTML = "";
  editor.classList.toggle("preview", !!preview);
  $("previewNote").hidden = !preview;
  bullets.forEach((b, i) => {
    const row = document.createElement("div");
    row.className = "bullet" + (b.kind === "gen" ? " gen" : "") + (typeof meetsAt === "function" && meetsAt(b) ? " meet" : "");
    row.dataset.index = i;
    const idx = document.createElement("span"); idx.className = "idx"; idx.textContent = i + 1;
    const mark = document.createElement("span"); mark.className = "mark"; mark.textContent = ">";
    const ta = document.createElement("textarea");
    ta.rows = 1; ta.value = b.text; ta.spellcheck = false;
    ta.readOnly = !!preview || state.busy;
    ta.setAttribute("aria-label", `Sentence ${i + 1}`);
    if (!preview) {
      ta.addEventListener("input", () => onInput(i, ta));
      ta.addEventListener("keydown", e => onKey(e, i, ta));
      ta.addEventListener("paste", e => onPaste(e, i, ta));
      ta.addEventListener("focus", () => highlightSlot(i));
      ta.addEventListener("blur", () => highlightSlot(null));
    }
    row.append(idx, mark, ta);
    editor.appendChild(row);
    requestAnimationFrame(() => autosize(ta));
  });
  if (focus && !preview) {
    const ta = editor.querySelectorAll("textarea")[focus.index];
    if (ta) { ta.focus(); const c = focus.caret === "end" ? ta.value.length : focus.caret; ta.setSelectionRange(c, c); }
  }
  renderEditorMarks();
}

function renderEditorMarks() {
  if (state.preview) return;
  editor.querySelectorAll(".bullet").forEach((row, i) => {
    const b = state.bullets[i];
    if (!b) return;
    row.classList.toggle("gen", b.kind === "gen");
    row.classList.toggle("pending", !!state.pendingSlots && state.pendingSlots.has(i));
    row.classList.toggle("meet", typeof meetsAt === "function" && meetsAt(b));
  });
}

let highlighted = null;
function highlightSlot(i) { highlighted = i; renderCanvas(); }

function onInput(i, ta) {
  const b = state.bullets[i];
  b.text = ta.value.replace(/\n/g, " ");
  if (b.kind === "gen") b.edited = true;
  autosize(ta);
  renderCanvas();
  scheduleRecognition();
}

function onKey(e, i, ta) {
  const caret = ta.selectionStart, collapsed = ta.selectionStart === ta.selectionEnd;
  const bs = state.bullets;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const before = ta.value.slice(0, caret), after = ta.value.slice(ta.selectionEnd);
    bs[i].text = before;
    if (bs[i].kind === "gen") bs[i].edited = true;
    bs.splice(i + 1, 0, newBullet(after));
    renderEditor({ index: i + 1, caret: 0 }); renderCanvas(); scheduleRecognition();
  } else if (e.key === "Backspace" && collapsed && caret === 0) {
    if (i === 0 && (bs.length === 1 || bs[0].text !== "")) return;
    e.preventDefault();
    if (bs[i].text === "") {                       // delete the empty bullet line
      bs.splice(i, 1);
      renderEditor({ index: Math.max(0, i - 1), caret: "end" });
    } else {                                       // merge into the previous bullet
      const prev = bs[i - 1], at = prev.text.length;
      prev.text = prev.text ? prev.text + " " + bs[i].text : bs[i].text;
      bs.splice(i, 1);
      renderEditor({ index: i - 1, caret: at });
    }
    renderCanvas(); scheduleRecognition();
  } else if (e.key === "Delete" && collapsed && caret === ta.value.length && i < bs.length - 1) {
    e.preventDefault();
    const at = bs[i].text.length;
    bs[i].text = bs[i + 1].text ? (bs[i].text ? bs[i].text + " " : "") + bs[i + 1].text : bs[i].text;
    bs.splice(i + 1, 1);
    renderEditor({ index: i, caret: at }); renderCanvas(); scheduleRecognition();
  } else if (e.key === "ArrowUp" && caret === 0 && i > 0) {
    e.preventDefault(); renderEditorFocus(i - 1, "end");
  } else if (e.key === "ArrowDown" && caret === ta.value.length && i < bs.length - 1) {
    e.preventDefault(); renderEditorFocus(i + 1, 0);
  }
}
function renderEditorFocus(index, caret) {
  const ta = editor.querySelectorAll("textarea")[index];
  if (ta) { ta.focus(); const c = caret === "end" ? ta.value.length : caret; ta.setSelectionRange(c, c); }
}

function onPaste(e, i, ta) {
  const text = (e.clipboardData || window.clipboardData).getData("text");
  if (!text.includes("\n")) return;
  e.preventDefault();
  const lines = text.split(/\r?\n/).map(s => s.replace(/^\s*[>\-*•]\s*/, ""));
  const before = ta.value.slice(0, ta.selectionStart), after = ta.value.slice(ta.selectionEnd);
  state.bullets[i].text = before + lines[0];
  const extra = lines.slice(1).map(l => newBullet(l));
  if (extra.length) extra[extra.length - 1].text += after; else state.bullets[i].text += after;
  state.bullets.splice(i + 1, 0, ...extra);
  renderEditor({ index: i + extra.length, caret: "end" }); renderCanvas(); scheduleRecognition();
}

// ---------------------------------------------------------------------------
// Canvas rendering (Figure 1 A3/B2, Figure 5 B)
// ---------------------------------------------------------------------------
function renderCanvas() {
  const n = slotCount();
  canvas.innerHTML = "";
  canvas.classList.toggle("eraser", state.tool === "eraser");
  const defs = el("defs", {}, canvas);
  const pat = el("pattern", { id: "hatch", width: 7, height: 7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(-35)" }, defs);
  el("line", { x1: 0, y1: 0, x2: 0, y2: 7, stroke: "#4fc98a", "stroke-width": 2.2, "stroke-opacity": 0.6 }, pat);

  // Background: better (top) and worse (bottom), neutral line, slot boundaries.
  el("rect", { x: 0, y: 0, width: W, height: fy(0.5), fill: "#fffbea" }, canvas);
  el("rect", { x: 0, y: fy(0.5), width: W, height: H - fy(0.5), fill: "#f1f1f1" }, canvas);
  el("rect", { x: 0, y: fy(0.2), width: W, height: H - fy(0.2), fill: "#e9e9e9" }, canvas);
  el("rect", { x: 0, y: 0, width: W, height: fy(0.8), fill: "#fff6d8" }, canvas);
  for (let i = 1; i < n; i++) {
    const x = PAD_L + i * slotW(n);
    el("line", { x1: x, y1: 4, x2: x, y2: H - 4, stroke: "#dcdcdc", "stroke-width": 1 }, canvas);
  }
  el("line", { x1: 0, y1: fy(0.5), x2: W, y2: fy(0.5), stroke: "#c3c3c3", "stroke-width": 2 }, canvas);
  for (let i = 0; i < n; i++) {
    const t = el("text", { x: slotCx(i, n), y: H - 6, "text-anchor": "middle", "font-size": 9, fill: highlighted === i ? "#3b8beb" : "#c0c0c0" }, canvas);
    t.textContent = i + 1;
  }
  if (highlighted !== null && highlighted < n) {
    el("rect", { x: PAD_L + highlighted * slotW(n), y: 0, width: slotW(n), height: H, fill: "#3b8beb", "fill-opacity": 0.06 }, canvas);
  }

  // Remix: where the two protagonists interact.
  if (typeof drawInteractions === "function") drawInteractions(canvas, H, state.preview ? state.preview.bullets : state.bullets, n);

  // Stored stories, faint (Section 4.2.3); the hovered one highlighted.
  for (const h of state.history) {
    if (h.id === state.currentHistoryId && !state.preview) continue;
    const hov = state.preview && state.preview.id === h.id;
    drawArc(h.bullets, h.nSlots, hov ? { color: "#1d5fc4", width: 3, opacity: 0.95, dots: true } : { color: "#6d8fbf", width: 1.5, opacity: 0.22, dots: true, r: 2.5 });
  }

  // Remix: variants from the design space (faint), the hovered one highlighted.
  if (typeof drawSpaceOverlay === "function") drawSpaceOverlay();

  // Sketched band.
  drawBand(state.sketch, liveStroke ? liveStroke.cols : null);

  // The current story: written sentences gray, generated blue (Figure 1 B2).
  drawArc(state.bullets, n, { color: null, width: 2.5, opacity: state.preview ? 0.35 : 1, dots: true });

  // Eraser cursor
  if (eraserCursor) el("circle", { cx: eraserCursor.x, cy: eraserCursor.y, r: ERASER_R, fill: "none", stroke: "#999", "stroke-dasharray": "3 2" }, canvas);
  updateGenerateButton();
  renderSurprise();
  if (typeof renderLanes === "function") renderLanes();
}

function drawBand(sketch, overlay) {
  const get = c => (overlay && overlay.has(c)) ? overlay.get(c) : sketch[c];
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const top = run.map(c => `${colx(c)},${fy(clamp(get(c).y + get(c).hw, 0, 1))}`);
    const bot = run.slice().reverse().map(c => `${colx(c)},${fy(clamp(get(c).y - get(c).hw, 0, 1))}`);
    if (run.length === 1) { top.unshift(`${colx(run[0]) - COL_W / 2},${fy(clamp(get(run[0]).y + get(run[0]).hw, 0, 1))}`); }
    const pts = top.concat(bot).join(" ");
    el("polygon", { points: pts, fill: "#4fc98a", "fill-opacity": 0.12 }, canvas);
    el("polygon", { points: pts, fill: "url(#hatch)" }, canvas);
    run = [];
  };
  for (let c = 0; c < COLS; c++) { if (get(c)) run.push(c); else flush(); }
  flush();
}

function drawArc(bullets, n, o) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const b = bullets[i];
    pts.push(isWritten(b) && b.fortune !== null && b.fortune !== undefined ? { x: slotCx(i, n), y: fy(b.fortune), gen: b.kind === "gen", i } : null);
  }
  const g = el("g", { opacity: o.opacity }, canvas);
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!a || !b) continue;                       // blank bullet -> visual gap
    el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: o.color || (b.gen ? "#3b8beb" : "#8d8d8d"), "stroke-width": o.width, "stroke-linecap": "round" }, g);
  }
  if (o.dots) for (const p of pts) if (p) {
    el("circle", { cx: p.x, cy: p.y, r: o.r || (highlighted === p.i && !o.color ? 6.5 : 4.5), fill: o.color || (p.gen ? "#3b8beb" : "#8d8d8d"), stroke: "#fff", "stroke-width": 1.2 }, g);
  }
}

function renderSurprise() {
  $("surpriseWrap").hidden = !state.surpriseOn;
  if (!state.surpriseOn) return;
  const n = slotCount();
  sCanvas.innerHTML = "";
  el("rect", { x: 0, y: 0, width: W, height: SH, fill: "#fff" }, sCanvas);
  for (let i = 1; i < n; i++) {
    const x = PAD_L + i * slotW(n);
    el("line", { x1: x, y1: 2, x2: x, y2: SH - 2, stroke: "#dcdcdc" }, sCanvas);
  }
  el("line", { x1: 0, y1: sy(0.5), x2: W, y2: sy(0.5), stroke: "#c3c3c3", "stroke-width": 1.5 }, sCanvas);
  const get = c => (liveSurprise && liveSurprise.has(c)) ? liveSurprise.get(c) : state.surprise[c];
  let d = "", open = false;
  for (let c = 0; c < COLS; c++) {
    const v = get(c);
    if (v === null || v === undefined) { open = false; continue; }
    d += (open ? "L" : "M") + colx(c) + "," + sy(v) + " ";
    open = true;
  }
  if (d) el("path", { d, fill: "none", stroke: "#3f9a55", "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }, sCanvas);
  if (eraserCursorS) el("circle", { cx: eraserCursorS.x, cy: eraserCursorS.y, r: ERASER_R, fill: "none", stroke: "#999", "stroke-dasharray": "3 2" }, sCanvas);
}

// ---------------------------------------------------------------------------
// Sketching (Section 3, 4.2.2)
// ---------------------------------------------------------------------------
const ERASER_R = 14;
let liveStroke = null, liveSurprise = null, eraserCursor = null, eraserCursorS = null;

function svgPoint(svg, e) {
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}

function speedToHw(speed) {
  const t = clamp((speed - SPEED_SLOW) / (SPEED_FAST - SPEED_SLOW), 0, 1);
  return HW_MIN + t * (HW_MAX - HW_MIN);
}

function rasterize(map, a, b, valueOf) {
  const c0 = xcol(a.x), c1 = xcol(b.x);
  const lo = Math.min(c0, c1), hi = Math.max(c0, c1);
  for (let c = lo; c <= hi; c++) {
    const t = c1 === c0 ? 1 : (c - c0) / (c1 - c0);
    map.set(c, valueOf(a, b, t));
  }
}

canvas.addEventListener("pointerdown", e => {
  if (state.busy || state.preview || e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  const p = svgPoint(canvas, e);
  if (state.tool === "eraser") { eraseAt(state.sketch, p, true); return; }
  liveStroke = { last: { x: p.x, y: p.y, t: performance.now(), hw: null }, speed: null, cols: new Map(), minX: p.x, maxX: p.x };
});
canvas.addEventListener("pointermove", e => {
  const p = svgPoint(canvas, e);
  if (state.tool === "eraser") {
    eraserCursor = p;
    if (e.buttons & 1 && !state.busy) eraseAt(state.sketch, p, true); else renderCanvas();
    return;
  }
  if (!liveStroke) return;
  const now = performance.now(), L = liveStroke.last;
  const dt = Math.max(1, now - L.t), dist = Math.hypot(p.x - L.x, p.y - L.y);
  if (dist < 1.5) return;
  const inst = dist / dt;
  // Smooth the speed so the band width changes gradually along the stroke (Section 4.2.2).
  liveStroke.speed = liveStroke.speed === null ? inst : liveStroke.speed * 0.8 + inst * 0.2;
  const hw = speedToHw(liveStroke.speed);
  const cur = { x: p.x, y: p.y, t: now, hw };
  const prevHw = L.hw === null ? hw : L.hw;
  rasterize(liveStroke.cols, { ...L, hw: prevHw }, cur, (a, b, t) => ({ y: yf(a.y + (b.y - a.y) * t), hw: a.hw + (b.hw - a.hw) * t }));
  liveStroke.last = cur;
  liveStroke.minX = Math.min(liveStroke.minX, p.x); liveStroke.maxX = Math.max(liveStroke.maxX, p.x);
  renderCanvas();
});
canvas.addEventListener("pointerleave", () => { eraserCursor = null; if (state.tool === "eraser") renderCanvas(); });

const endStroke = () => {
  if (!liveStroke) return;
  const s = liveStroke; liveStroke = null;
  if (s.cols.size < MIN_STROKE_COLS) { renderCanvas(); return; }
  for (const [c, v] of s.cols) state.sketch[c] = v;
  renderCanvas();
  // Generate for the sketched sentence slots under this stroke only (partial redraw, Section 4.2.2).
  const n = slotCount();
  const slots = [];
  for (let i = 0; i < n; i++) {
    const [a, b] = slotCols(i, n);
    let hit = 0;
    for (let c = a; c < b; c++) if (s.cols.has(c)) hit++;
    if (hit / (b - a) >= 0.4) slots.push(i);
  }
  const targets = slots.filter(i => !isWritten(state.bullets[i]) || state.bullets[i].kind === "gen");
  if (targets.length) generate(targets, { label: describe(targets, "Sketch"), avoidCurrent: true });
};
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);

function eraseAt(arr, p, fortune) {
  const c0 = xcol(p.x - ERASER_R), c1 = xcol(p.x + ERASER_R);
  for (let c = c0; c <= c1; c++) {
    const v = arr[c];
    if (v === null || v === undefined) continue;
    if (fortune) {
      const yc = fy(v.y), half = v.hw * PLOT_H;
      if (Math.abs(p.y - yc) <= half + ERASER_R) arr[c] = null;
    } else if (Math.abs(p.y - sy(v)) <= ERASER_R + 4) arr[c] = null;
  }
  if (fortune) { eraserCursor = p; renderCanvas(); } else { eraserCursorS = p; renderSurprise(); }
}

// Surprise canvas (Section 4.2.2 "Surprise Level Control", Figure 4)
let sLast = null;
sCanvas.addEventListener("pointerdown", e => {
  if (state.busy || state.preview || e.button !== 0) return;
  sCanvas.setPointerCapture(e.pointerId);
  const p = svgPoint(sCanvas, e);
  if (state.tool === "eraser") { eraseAt(state.surprise, p, false); return; }
  liveSurprise = new Map(); sLast = p;
  liveSurprise.set(xcol(p.x), ys(p.y));
});
sCanvas.addEventListener("pointermove", e => {
  const p = svgPoint(sCanvas, e);
  if (state.tool === "eraser") {
    eraserCursorS = p;
    if (e.buttons & 1 && !state.busy) eraseAt(state.surprise, p, false); else renderSurprise();
    return;
  }
  if (!liveSurprise) return;
  rasterize(liveSurprise, sLast, p, (a, b, t) => ys(a.y + (b.y - a.y) * t));
  sLast = p; renderSurprise();
});
const endSurprise = () => {
  if (!liveSurprise) return;
  for (const [c, v] of liveSurprise) state.surprise[c] = v;
  liveSurprise = null; renderSurprise(); updateGenerateButton();
};
sCanvas.addEventListener("pointerup", endSurprise);
sCanvas.addEventListener("pointercancel", endSurprise);
sCanvas.addEventListener("pointerleave", () => { eraserCursorS = null; if (state.tool === "eraser") renderSurprise(); });

// ---------------------------------------------------------------------------
// From sketch to generation parameters
// ---------------------------------------------------------------------------
function slotSpec(i, n) {
  const [a, b] = slotCols(i, n);
  let sumY = 0, sumHw = 0, k = 0, sumS = 0, ks = 0;
  for (let c = a; c < b; c++) {
    const v = state.sketch[c];
    if (v) { sumY += v.y; sumHw += v.hw; k++; }
    const s = state.surprise[c];
    if (s !== null && s !== undefined) { sumS += s; ks++; }
  }
  const covered = k / (b - a) >= 0.34;
  const hw = covered ? sumHw / k : null;
  return {
    index: i,
    target: covered ? sumY / k : null,                 // erased / unsketched -> no fortune target
    tol: covered ? Math.max(0.08, hw) : 0.2,           // envelope = tolerance (Section 4.2.2)
    retries: covered ? (hw < 0.12 ? 2 : 1) : 0,        // slower sketch -> more tries (Section 5.2.2)
    surprise: state.surpriseOn && ks ? sumS / ks : null,
    dims: typeof laneTargets === "function" ? laneTargets(i, n) : {},
  };
}

function sketchedRange(n) {
  let first = -1, last = -1;
  for (let i = 0; i < n; i++) if (slotSpec(i, n).target !== null) { if (first < 0) first = i; last = i; }
  return [first, last];
}

function updateGenerateButton() {
  const [first] = sketchedRange(slotCount());
  $("generateBtn").disabled = state.busy || first < 0 || !!state.preview;
}

function describe(slots, verb) {
  const a = slots[0] + 1, b = slots[slots.length - 1] + 1;
  return `${verb} · ${a === b ? "sentence " + a : "sentences " + a + "–" + b}`;
}

// "Generate Again" (Figure 1 B3): same sketch, new sentences for every sketched slot,
// including erased gaps between sketched parts (generated without a fortune target).
$("generateBtn").addEventListener("click", () => {
  const n = slotCount();
  const [first, last] = sketchedRange(n);
  if (first < 0) return;
  const slots = [];
  for (let i = first; i <= last; i++) {
    const b = state.bullets[i];
    if (!isWritten(b) || (b.kind === "gen" && !b.edited)) slots.push(i);
  }
  if (!slots.length) { showBanner("Every sketched sentence slot already has a sentence you wrote or edited. Redraw over a slot to regenerate it."); return; }
  generate(slots, { label: describe(slots, "Generate Again"), avoidCurrent: true });
});

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
async function generate(slotIdx, { label, avoidCurrent, keepArc = false }) {
  if (state.busy) return;
  const n = slotCount();
  while (state.bullets.length < Math.max(...slotIdx) + 1) state.bullets.push(newBullet());
  // Store the writer's starting point once, so it can be compared and rolled back to.
  if (!state.history.length && state.bullets.some(isWritten)) pushHistory("Initial");
  const specs = slotIdx.map(i => slotSpec(i, n));
  // Remix: when only a setting changes, keep each sentence's current levels as its targets.
  if (keepArc) for (const sp of specs) {
    const b = state.bullets[sp.index];
    if (sp.target === null && b && b.fortune !== null && b.fortune !== undefined) { sp.target = b.fortune; sp.tol = 0.2; sp.retries = 0; }
    // Every lane's level, and whether the protagonists interact, carry over.
    for (const [k, v] of Object.entries((b && b.values) || {})) if (sp.dims[k] === undefined && v !== null) sp.dims[k] = v;
  }
  const sentences = state.bullets.map(b => b.text.trim());
  const fortunes = {};
  state.bullets.forEach((b, i) => { if (isWritten(b) && b.fortune !== null && !slotIdx.includes(i)) fortunes[i] = b.fortune; });
  const avoid = {};
  if (avoidCurrent) for (const i of slotIdx) {
    const prev = new Set();
    if (isWritten(state.bullets[i])) prev.add(state.bullets[i].text.trim());
    for (const h of state.history) { const hb = h.bullets[i]; if (hb && hb.kind === "gen" && hb.text.trim()) prev.add(hb.text.trim()); }
    if (prev.size) avoid[i] = [...prev].slice(-4);
  }

  setBusy(true, `Generating ${slotIdx.length} sentence${slotIdx.length > 1 ? "s" : ""}…`);
  state.pendingSlots = new Set(slotIdx);
  renderEditor();
  try {
    const res = await api("/api/generate", { name: state.name.trim(), sentences, slots: specs, fortunes, avoid,
      title: $("title").value, arcDims: typeof arcDimDefs === "function" ? arcDimDefs() : [],
      settings: typeof pinnedSettings === "function" ? pinnedSettings() : {} });
    for (const s of res.sentences) {
      const b = state.bullets[s.index] || (state.bullets[s.index] = newBullet());
      b.text = s.text; b.kind = "gen"; b.edited = false;
      b.fortune = s.fortune; b.recText = s.text; b.recName = state.name.trim();
      b.target = s.target;
      // With remix lanes, re-read every generated sentence so the lanes get values too.
      if (typeof arcDimDefs === "function" && arcDimDefs().length) b.recText = null;
    }
    if (typeof arcDimDefs === "function" && arcDimDefs().length) scheduleRecognition(50);
    pushHistory(label);
    showBanner(state.model && state.model.stub ? $("banner").textContent : null);
  } catch (e) {
    showBanner("Generation failed: " + e.message, "error");
  } finally {
    state.pendingSlots = null;
    setBusy(false);
    renderEditor(); renderCanvas(); renderHistory();
  }
}

function setBusy(on, text) {
  state.busy = on;
  $("busy").hidden = !on;
  if (text) $("busyText").textContent = text;
  editor.querySelectorAll("textarea").forEach(t => { t.readOnly = on; });
  updateGenerateButton();
}

// ---------------------------------------------------------------------------
// Multi-story management (Section 4.2.3, Figure 5)
// ---------------------------------------------------------------------------
function snapshotBullets() {
  return state.bullets.map(b => ({ ...b, values: { ...(b.values || {}) } }));
}
function pushHistory(label) {
  const entry = {
    id: nextId++, label, time: new Date(),
    bullets: snapshotBullets(), nSlots: slotCount(),
    sketch: state.sketch.map(v => v && { ...v }), surprise: state.surprise.slice(),
    surpriseOn: state.surpriseOn, name: state.name,
  };
  state.history.push(entry);
  state.currentHistoryId = entry.id;
  renderHistory();
}

function renderHistory() {
  const list = $("historyList");
  list.innerHTML = "";
  list.parentElement.querySelector(".history-empty").hidden = state.history.length > 0;
  $("historyBtn").textContent = `History (${state.history.length}) ▾`;
  state.history.forEach((h, k) => {
    const li = document.createElement("li");
    if (h.id === state.currentHistoryId) li.classList.add("current");
    const lab = document.createElement("span"); lab.className = "h-label"; lab.textContent = `${k + 1}. ${h.label}`;
    const meta = document.createElement("span"); meta.className = "h-meta";
    meta.textContent = h.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const ren = document.createElement("button"); ren.className = "h-btn"; ren.title = "Rename"; ren.textContent = "✎";
    const del = document.createElement("button"); del.className = "h-btn del"; del.title = "Delete"; del.textContent = "✕";
    li.append(lab, meta, ren, del);
    li.addEventListener("mouseenter", () => { state.preview = h; li.classList.add("hover"); renderEditor(); renderCanvas(); updateGenerateButton(); });
    li.addEventListener("mouseleave", () => { state.preview = null; li.classList.remove("hover"); renderEditor(); renderCanvas(); });
    li.addEventListener("click", e => {
      if (e.target === ren) { const v = prompt("Name this story", h.label); if (v) { h.label = v; renderHistory(); } return; }
      if (e.target === del) { state.history = state.history.filter(x => x !== h); if (state.currentHistoryId === h.id) state.currentHistoryId = null; state.preview = null; renderHistory(); renderEditor(); renderCanvas(); return; }
      rollBack(h);
    });
    list.appendChild(li);
  });
}

function rollBack(h) {
  state.bullets = h.bullets.map(b => ({ ...b, values: { ...(b.values || {}) }, id: nextId++ }));
  state.sketch = h.sketch.map(v => v && { ...v });
  state.surprise = h.surprise.slice();
  state.surpriseOn = h.surpriseOn; $("surpriseToggle").checked = h.surpriseOn;
  if (h.name !== undefined) { state.name = h.name; $("name").value = h.name; }
  state.currentHistoryId = h.id;
  state.preview = null;
  closeHistory();
  renderAll();
  scheduleRecognition(50);
}

function closeHistory() { $("historyMenu").hidden = true; $("historyBtn").setAttribute("aria-expanded", "false"); state.preview = null; }
$("historyBtn").addEventListener("click", e => {
  e.stopPropagation();
  const m = $("historyMenu");
  m.hidden = !m.hidden;
  $("historyBtn").setAttribute("aria-expanded", String(!m.hidden));
  if (m.hidden) { state.preview = null; renderEditor(); renderCanvas(); }
});
document.addEventListener("click", e => {
  if (!$("historyMenu").hidden && !e.target.closest(".history")) { closeHistory(); renderEditor(); renderCanvas(); }
});

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------
function setTool(t) {
  state.tool = t;
  eraserCursor = eraserCursorS = null;
  $("penBtn").classList.toggle("active", t === "pen"); $("penBtn").setAttribute("aria-pressed", String(t === "pen"));
  $("eraserBtn").classList.toggle("active", t === "eraser"); $("eraserBtn").setAttribute("aria-pressed", String(t === "eraser"));
  sCanvas.classList.toggle("eraser", t === "eraser");
  renderCanvas();
}
$("penBtn").addEventListener("click", () => setTool("pen"));
$("eraserBtn").addEventListener("click", () => setTool("eraser"));
$("clearBtn").addEventListener("click", () => {
  if (state.busy) return;
  state.sketch.fill(null); if (state.surpriseOn) state.surprise.fill(null);
  renderCanvas(); renderSurprise();
});
$("surpriseToggle").addEventListener("change", e => { state.surpriseOn = e.target.checked; renderSurprise(); });
$("name").addEventListener("input", e => { state.name = e.target.value; scheduleRecognition(900); });

function renderAll() { renderEditor(); renderCanvas(); renderSurprise(); renderHistory(); }

renderAll();
checkStatus();
