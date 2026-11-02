"use strict";
/* TaleBrush Studio front end. The Luminate, VideoDiff and Selenite parts live in
 * luminate.js, videodiff.js and selenite.js and attach through `hooks` below.
 * This file holds TaleBrush × Misty: TaleBrush's text editor, fortune canvas,
 * surprise canvas and history, plus Misty's conceptual blending of example
 * stories (global and drag-and-drop, with a "Pick Blending Option" dialog) and a
 * semantic diff of each generation with toggles (see the end of this file).
 *
 * Sketches are stored in "slot units": every sentence slot (bullet line) owns
 * R samples, so inserting or deleting a bullet moves the sketch with it. Each
 * fortune sample is null (no sketch / erased) or {y, w}: y is the fortune in
 * [0, 1] and w the half-width of the envelope, set by drawing speed.
 */

const R = 24;                 // sketch samples per sentence slot
const FH = 380, SH = 200;     // canvas heights (SVG units = CSS px)
const PAD = 14;               // vertical padding inside the fortune canvas
const MIN_W = 0.025, MAX_W = 0.3;   // envelope half-width range (fortune units)
const TIGHT_W = 0.1;          // narrower than this -> regenerate up to twice
const DEFAULT_SURPRISE = 0.3; // used when the surprise panel is off or unsketched
const START_LINES = 8;
const STORE_KEY = "talebrush-studio-state-v1";

const $ = (s) => document.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const state = {
  title: "",
  protagonist: "",
  lines: [],        // {text, origin: 'user'|'ai', fortune, pending, target, rev}
  sketch: [],       // fortune samples
  surprise: [],     // surprise samples: null | y
  surpriseOn: false,
  tool: "pen",
  history: [],      // {id, name, lines, sketch, surprise}
  nextId: 1,
  currentId: null,
  previewId: null,
  menuOpen: false,
  hoverLine: -1,
  gen: null,        // {controller, current}
  busy: false,      // a semantic-diff revision is running
  examples: [],     // Misty: {id, name, protagonist, sentences, fortunes, sel: [a, b] | null}
  diff: null,       // Misty: {base, baseFortunes, changes, disabled, edited, editable}
  diffHover: null,  // sentence indices of the hovered change
  drag: null,       // Misty: example being dragged {ex, sel, global}
  dropSpan: null,   // {start, len} highlighted on the canvas during a drag
  studio: {},       // Luminate / VideoDiff / Selenite state, owned by their modules
};

// Extension points for the studio modules (luminate.js, videodiff.js, selenite.js).
const hooks = {
  row: [],           // (row, line, i) -> decorate an editor row
  render: [],        // () -> re-render after renderAll
  afterGenerate: [], // (generatedIndices) -> after a TaleBrush generation finishes
  init: [],          // () -> once, after state is loaded
};
let VW = 640;       // fortune/surprise canvas width, follows the element size

function newLine(text = "", origin = "user", fortune = null) {
  return { text, origin, fortune, pending: false, target: null, rev: 0 };
}
const N = () => state.lines.length;
const slotW = () => VW / N();
const cx = (i) => (i + 0.5) * slotW();
const sx = (s) => ((s + 0.5) / R) * slotW();
const fy = (f) => PAD + (1 - f) * (FH - 2 * PAD);
const fyInv = (y) => clamp(1 - (y - PAD) / (FH - 2 * PAD), 0, 1);
const sy = (v) => 12 + (1 - v) * (SH - 24);
const syInv = (y) => clamp(1 - (y - 12) / (SH - 24), 0, 1);
const center = (arr, i) => arr[i * R + (R >> 1)] ?? null;
const hasText = (l) => !!(l && l.text.trim());

function ensureSamples() {
  for (const arr of [state.sketch, state.surprise]) {
    while (arr.length < N() * R) arr.push(null);
    arr.length = N() * R;
  }
}

/* ------------------------------------------------------------ persistence */

function save() {
  try {
    const { title, protagonist, lines, sketch, surprise, surpriseOn, history, nextId, currentId, examples, diff, studio } = state;
    localStorage.setItem(STORE_KEY, JSON.stringify({
      title, protagonist, surpriseOn, history, nextId, currentId, sketch, surprise, examples, diff, studio,
      lines: lines.map((l) => ({ text: l.pending ? "" : l.text, origin: l.origin, fortune: l.pending ? null : l.fortune, lum: l.lum || null })),
    }));
  } catch (_) { /* storage unavailable: keep working without it */ }
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (!s || !Array.isArray(s.lines) || !s.lines.length) return false;
    Object.assign(state, {
      title: s.title || "", protagonist: s.protagonist || "", surpriseOn: !!s.surpriseOn,
      history: s.history || [], nextId: s.nextId || 1, currentId: s.currentId ?? null,
      sketch: s.sketch || [], surprise: s.surprise || [],
      examples: s.examples || [], diff: s.diff && !s.diff.loading ? s.diff : null,
      lines: s.lines.map((l) => Object.assign(newLine(l.text, l.origin, l.fortune), { lum: l.lum || null })),
      studio: s.studio || {},
    });
    return true;
  } catch (_) { return false; }
}

/* ------------------------------------------------------------ status */

function setStatus(msg, kind = "") {
  const el = $("#status");
  el.className = "status " + kind;
  el.innerHTML = (kind === "busy" ? '<span class="spin"></span>' : "") + msg;
}

/* ------------------------------------------------------------ editor */

function rowClass(l) {
  if (l.pending) return "ai pending";
  if (!hasText(l)) return "empty";
  if (l.origin !== "ai") return "user";
  return l.lum ? "ai lum" : "ai";   // lum: taken from a Luminate variant (yellow)
}

function autosize(ta) {
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}

function renderEditor() {
  const ed = $("#editor");
  const story = state.previewId != null ? state.history.find((h) => h.id === state.previewId) : null;
  ed.classList.toggle("preview", !!story);
  ed.classList.toggle("locked", !!state.gen);
  ed.innerHTML = "";
  (story ? story.lines : state.lines).forEach((l, i) => {
    const row = document.createElement("div");
    row.className = "row " + rowClass(l);
    row.dataset.i = i;
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = ">";
    row.append(mark);
    if (story) {
      const p = document.createElement("div");
      p.className = "ptext";
      p.textContent = l.text || " ";
      row.append(p);
    } else {
      const ta = document.createElement("textarea");
      ta.rows = 1;
      ta.spellcheck = true;
      if (i === 0) ta.placeholder = "Write the beginning of the story, or sketch on the canvas…";
      bindLine(ta, row);
      const body = document.createElement("div");
      body.className = "rowbody";
      body.append(ta);
      row.append(body);
      fillRow(row, l, i);
      row.addEventListener("mouseenter", () => setHover(i));
      row.addEventListener("mouseleave", () => setHover(-1));
    }
    ed.append(row);
  });
  ed.querySelectorAll("textarea").forEach(autosize);
}

function fillRow(row, l, i) {
  const ta = row.querySelector("textarea");
  row.className = "row " + rowClass(l) + (state.hoverLine === i ? " focus" : "")
    + (state.diffHover && state.diffHover.includes(i) ? " diffhl" : "");
  ta.readOnly = !!state.gen;
  if (l.pending) ta.value = state.gen && state.gen.current === i ? "Generating…" : "…";
  else if (document.activeElement !== ta || ta.value !== l.text) ta.value = l.text;
  autosize(ta);
  hooks.row.forEach((f) => f(row, l, i));
}

function updateRow(i) {
  const row = $(`#editor .row[data-i="${i}"]`);
  if (row && state.previewId == null) fillRow(row, state.lines[i], i);
}

function focusLine(i, caret) {
  const ta = $(`#editor .row[data-i="${i}"] textarea`);
  if (!ta) return;
  ta.focus();
  const pos = caret === "end" || caret == null ? ta.value.length : caret;
  ta.setSelectionRange(pos, pos);
}

function bindLine(ta, row) {
  const idx = () => +row.dataset.i;
  ta.addEventListener("input", () => {
    if (state.gen) return;
    const i = idx();
    if (ta.value.includes("\n")) {           // pasted several lines
      const parts = ta.value.split(/\n+/);
      editLine(i, parts[0]);
      parts.slice(1).forEach((p, k) => insertLine(i + 1 + k, p));
      renderAll();
      focusLine(i + parts.length - 1, "end");
      return;
    }
    editLine(i, ta.value);
    row.className = "row " + rowClass(state.lines[i]) + " focus";
    autosize(ta);
    renderArc();
  });
  ta.addEventListener("keydown", (e) => {
    if (state.gen) return;
    const i = idx();
    const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
    const atEnd = ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      const before = ta.value.slice(0, ta.selectionStart), after = ta.value.slice(ta.selectionEnd);
      if (after.trim() || before !== state.lines[i].text) editLine(i, before.trimEnd());
      insertLine(i + 1, after.trimStart());
      renderAll();
      focusLine(i + 1, 0);
    } else if (e.key === "Backspace" && atStart && i > 0) {
      e.preventDefault();
      const prev = state.lines[i - 1];
      const join = prev.text.length;
      const cur = state.lines[i].text;
      if (cur.trim()) editLine(i - 1, prev.text + (prev.text && !prev.text.endsWith(" ") ? " " : "") + cur);
      removeLine(i);
      renderAll();
      focusLine(i - 1, join);
    } else if (e.key === "Delete" && atEnd && i < N() - 1) {
      e.preventDefault();
      const next = state.lines[i + 1].text;
      const join = ta.value.length;
      if (next.trim()) editLine(i, state.lines[i].text + (state.lines[i].text ? " " : "") + next);
      removeLine(i + 1);
      renderAll();
      focusLine(i, join);
    } else if (e.key === "ArrowUp" && atStart && i > 0) {
      e.preventDefault(); focusLine(i - 1, "end");
    } else if (e.key === "ArrowDown" && atEnd && i < N() - 1) {
      e.preventDefault(); focusLine(i + 1, 0);
    }
  });
  ta.addEventListener("focus", () => setHover(idx()));
}

/* An edit by the writer turns the sentence into the writer's own: it is kept
 * (and used as context) when the sketch is regenerated. */
function editLine(i, text) {
  const l = state.lines[i];
  if (l.text === text) return;
  l.text = text;
  l.origin = "user";
  l.rev++;
  clearDiff();
  if (!text.trim()) l.fortune = null;
  scheduleRecognize(withFollowing(i));
  save();
}

function insertLine(at, text = "") {
  clearDiff();
  state.lines.splice(at, 0, newLine(text));
  state.sketch.splice(at * R, 0, ...Array(R).fill(null));
  state.surprise.splice(at * R, 0, ...Array(R).fill(null));
  if (text.trim()) scheduleRecognize(withFollowing(at));
  save();
}

function removeLine(at) {
  clearDiff();
  state.lines.splice(at, 1);
  state.sketch.splice(at * R, R);
  state.surprise.splice(at * R, R);
  if (!N()) state.lines.push(newLine());
  ensureSamples();
  scheduleRecognize(withFollowing(at - 1).filter((i) => i >= 0));
  save();
}

/* Index i plus the next three written sentences, whose recognition uses i as
 * previous context (Section 5.2.1: up to three previous sentences). */
function withFollowing(i) {
  const out = [i];
  for (let j = i + 1; j < N() && out.length < 4; j++) if (hasText(state.lines[j])) out.push(j);
  return out;
}

/* ------------------------------------------------------------ recognition */

const dirty = new Set();
let recogTimer = null;

function scheduleRecognize(indices) {
  indices.forEach((i) => { if (state.lines[i]) dirty.add(state.lines[i]); });
  clearTimeout(recogTimer);
  recogTimer = setTimeout(flushRecognize, 900);
}

async function flushRecognize() {
  if (state.gen) { recogTimer = setTimeout(flushRecognize, 1000); return; }
  const items = [...dirty].filter((l) => state.lines.includes(l) && hasText(l));
  dirty.clear();
  if (!items.length) { renderArc(); return; }
  const revs = items.map((l) => l.rev);
  try {
    const r = await fetch("/api/recognize", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protagonist: state.protagonist.trim(),
        sentences: state.lines.map((l) => (l.pending ? "" : l.text)),
        indices: items.map((l) => state.lines.indexOf(l)),
      }),
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    items.forEach((l, k) => {
      const v = data.fortunes[String(state.lines.indexOf(l))];
      if (v != null && l.rev === revs[k]) l.fortune = v;
    });
    save();
    renderArc();
  } catch (e) {
    setStatus("Could not recognize fortune: " + e.message, "error");
  }
}

/* ------------------------------------------------------------ canvas drawing */

function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.append(el);
  return el;
}
const clear = (sel) => { const g = $(sel); g.innerHTML = ""; return g; };

function renderGrid() {
  const bands = clear("#fBands");
  [[1, 0.75, "#fdf7e4"], [0.75, 0.5, "#fefcf4"], [0.5, 0.25, "#f8f8f7"], [0.25, 0, "#eeeeed"]].forEach(([a, b, c], k) => {
    const top = k === 0 ? 0 : fy(a), bot = k === 3 ? FH : fy(b);
    svgEl("rect", { x: 0, y: top, width: VW, height: bot - top, fill: c }, bands);
  });
  const grid = clear("#fGrid");
  if (state.hoverLine >= 0 && state.hoverLine < N())
    svgEl("rect", { x: state.hoverLine * slotW(), y: 0, width: slotW(), height: FH, fill: "#3d8ee8", opacity: 0.06 }, grid);
  for (const i of state.diffHover || [])
    svgEl("rect", { x: i * slotW(), y: 0, width: slotW(), height: FH, fill: "#b0569a", opacity: 0.08 }, grid);
  for (let i = 0; i < N(); i++) svgEl("line", { x1: cx(i), x2: cx(i), y1: 0, y2: FH, stroke: "#e6e4df", "stroke-width": 1 }, grid);
  svgEl("line", { x1: 0, x2: VW, y1: fy(0.5), y2: fy(0.5), stroke: "#bdbcb8", "stroke-width": 1.6 }, grid);

  const sg = clear("#sGrid");
  for (let i = 0; i < N(); i++) svgEl("line", { x1: cx(i), x2: cx(i), y1: 0, y2: SH, stroke: "#dedcd7" }, sg);
  svgEl("line", { x1: 0, x2: VW, y1: sy(0.5), y2: sy(0.5), stroke: "#bdbcb8", "stroke-width": 1.6 }, sg);
}

function runsOf(arr) {
  const runs = [];
  let run = null;
  arr.forEach((v, s) => {
    if (v == null) { run = null; return; }
    if (!run) runs.push((run = []));
    run.push(s);
  });
  return runs;
}

function renderSketch() {
  const g = clear("#fSketch");
  for (const run of runsOf(state.sketch)) {
    const minPx = 3 / (FH - 2 * PAD);
    const up = run.map((s) => { const p = state.sketch[s]; return `${sx(s).toFixed(1)},${fy(clamp(p.y + Math.max(p.w, minPx), 0, 1)).toFixed(1)}`; });
    const lo = run.slice().reverse().map((s) => { const p = state.sketch[s]; return `${sx(s).toFixed(1)},${fy(clamp(p.y - Math.max(p.w, minPx), 0, 1)).toFixed(1)}`; });
    const pts = up.concat(lo).join(" ");
    svgEl("polygon", { points: pts, fill: "#7fd39b", "fill-opacity": 0.13 }, g);
    svgEl("polygon", { points: pts, fill: "url(#hatch)" }, g);
  }
  const sg = clear("#sSketch");
  for (const run of runsOf(state.surprise)) {
    const d = run.map((s, k) => `${k ? "L" : "M"}${sx(s).toFixed(1)},${sy(state.surprise[s]).toFixed(1)}`).join(" ");
    svgEl("path", { d, fill: "none", stroke: "#3f9a5c", "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round" }, sg);
  }
}

/* Smooth (Catmull-Rom) path segments through runs of consecutive sentences.
 * Blank or not-yet-recognized sentences break the line (a visual gap). */
function arcSegments(lines) {
  const pts = lines.map((l, i) => (hasText(l) && l.fortune != null && !l.pending
    ? { x: cx(i), y: fy(l.fortune), i, ai: l.origin === "ai" } : null));
  const segs = [], dots = [];
  pts.forEach((p, i) => {
    if (!p) return;
    dots.push(p);
    const q = pts[i + 1];
    if (!q) return;
    const p0 = pts[i - 1] || p, p3 = pts[i + 2] || q;
    const c1y = clamp(p.y + (q.y - p0.y) / 6, 0, FH), c2y = clamp(q.y - (p3.y - p.y) / 6, 0, FH);
    const c1x = p.x + (q.x - p0.x) / 6, c2x = q.x - (p3.x - p.x) / 6;
    segs.push({ d: `M${p.x},${p.y} C${c1x},${c1y} ${c2x},${c2y} ${q.x},${q.y}`, ai: q.ai });
  });
  return { segs, dots };
}

function drawArc(g, lines, style) {
  const { segs, dots } = arcSegments(lines);
  for (const s of segs) {
    svgEl("path", {
      d: s.d, fill: "none", "stroke-width": style.width, opacity: style.opacity, "stroke-linecap": "round",
      stroke: style.color || (s.ai ? "#3d8ee8" : "#8f8f8f"),
    }, g);
  }
  for (const p of dots) {
    const c = svgEl("circle", {
      cx: p.x, cy: p.y, r: style.dot * (style.interactive && p.i === state.hoverLine ? 1.6 : 1),
      fill: style.color || (p.ai ? "#3d8ee8" : "#8f8f8f"), opacity: style.opacity,
    }, g);
    if (style.interactive) {
      c.style.cursor = "pointer";
      c.addEventListener("pointerenter", (e) => { setHover(p.i); showTip(e, lines[p.i].text); });
      c.addEventListener("pointermove", (e) => showTip(e, lines[p.i].text));
      c.addEventListener("pointerleave", () => { setHover(-1); hideTip(); });
    }
  }
}

function renderArc() {
  renderGrid();
  const g = clear("#fArc");
  const previewing = state.previewId != null;
  if (state.menuOpen) {
    for (const h of state.history) {
      const hot = h.id === state.previewId;
      if (!hot) drawArc(g, h.lines, { width: 1.6, dot: 3, opacity: previewing ? 0.18 : 0.3, color: "#8a8a8a" });
    }
  }
  drawArc(g, state.lines, { width: 2.6, dot: 4.5, opacity: previewing ? 0.25 : 1, interactive: !previewing });
  if (previewing) {
    const h = state.history.find((x) => x.id === state.previewId);
    if (h) drawArc(g, h.lines, { width: 3.2, dot: 5, opacity: 0.95, color: "#2f6fbf" });
  }
  drawDropPreview(g);
  state.lines.forEach((l, i) => {     // sentences waiting to be generated
    if (!l.pending) return;
    const y = fy(l.target ?? 0.5);
    svgEl("circle", {
      cx: cx(i), cy: y, r: state.gen && state.gen.current === i ? 6.5 : 4.5, fill: "#fff",
      stroke: "#3d8ee8", "stroke-width": 2, "stroke-dasharray": l.target == null ? "3 2" : "", class: "pending-dot",
    }, g);
  });
}

function renderAll() {
  ensureSamples();
  renderEditor();
  renderSketch();
  renderArc();
  renderHistory();
  renderControls();
  renderExamples();
  renderDiff();
  hooks.render.forEach((f) => f());
}

function setHover(i) {
  if (state.hoverLine === i) return;
  state.hoverLine = i;
  document.querySelectorAll("#editor .row").forEach((r) => r.classList.toggle("focus", +r.dataset.i === i));
  renderArc();
}

function showTip(e, text) {
  const t = $("#tooltip");
  t.textContent = text;
  t.hidden = false;
  t.style.left = e.clientX + 14 + "px";
  t.style.top = e.clientY + 14 + "px";
}
const hideTip = () => { $("#tooltip").hidden = true; };

/* ------------------------------------------------------------ sketching */

function svgPoint(svg, e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
const sampleAt = (x) => clamp(Math.round((x / slotW()) * R - 0.5), 0, N() * R - 1);

function paint(arr, a, b, value) {
  const s0 = sampleAt(a.x), s1 = sampleAt(b.x);
  const lo = Math.min(s0, s1), hi = Math.max(s0, s1);
  for (let s = lo; s <= hi; s++) {
    const t = s1 === s0 ? 1 : (s - s0) / (s1 - s0);
    arr[s] = value(a.v + (b.v - a.v) * t);
  }
}

function erase(kind, p) {
  const rx = 14, ry = 22;
  const arr = kind === "fortune" ? state.sketch : state.surprise;
  for (let s = 0; s < arr.length; s++) {
    const v = arr[s];
    if (v == null || Math.abs(sx(s) - p.x) > rx) continue;
    if (kind === "fortune") {
      const halfPx = v.w * (FH - 2 * PAD);
      if (Math.abs(fy(v.y) - p.y) <= ry + halfPx) arr[s] = null;
    } else if (Math.abs(sy(v) - p.y) <= ry) arr[s] = null;
  }
}

function drawCursor(sel, p) {
  const g = clear(sel);
  if (p && state.tool === "eraser") svgEl("ellipse", { cx: p.x, cy: p.y, rx: 14, ry: 22, fill: "#f2a0a8", "fill-opacity": 0.25, stroke: "#e07a85" }, g);
}

function setupCanvas(svg, kind) {
  const toValue = kind === "fortune" ? fyInv : syInv;
  const cursorSel = kind === "fortune" ? "#fCursor" : "#sCursor";
  let stroke = null;

  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || state.previewId != null) return;
    if (state.gen) { setStatus("Generation in progress. Press Stop to sketch again.", "error"); return; }
    if (state.busy) return;
    if (kind === "fortune" && !state.protagonist.trim()) {
      setStatus("First enter the protagonist's name.", "error");
      $("#protagonist").focus();
      return;
    }
    svg.setPointerCapture(e.pointerId);
    hideTip();
    const p = svgPoint(svg, e);
    stroke = {
      last: { x: p.x, v: toValue(p.y), cx: e.clientX, cy: e.clientY, t: e.timeStamp },
      speed: null,
      before: Array.from({ length: N() }, (_, i) => JSON.stringify(center(state.sketch, i))),
    };
    if (state.tool === "eraser") erase(kind, p);
    else if (kind === "fortune") state.sketch[sampleAt(p.x)] = { y: stroke.last.v, w: 0.1 };
    else state.surprise[sampleAt(p.x)] = stroke.last.v;
    renderSketch();
  });

  svg.addEventListener("pointermove", (e) => {
    const p = svgPoint(svg, e);
    drawCursor(cursorSel, p);
    if (!stroke) return;
    if (state.tool === "eraser") { erase(kind, p); renderSketch(); return; }
    const dt = e.timeStamp - stroke.last.t;
    if (dt <= 0) return;
    const cur = { x: p.x, v: toValue(p.y), cx: e.clientX, cy: e.clientY, t: e.timeStamp };
    // Sketching speed -> envelope width (Section 4.2.2): slow is tight, fast is loose.
    const inst = Math.hypot(cur.cx - stroke.last.cx, cur.cy - stroke.last.cy) / dt; // px per ms
    stroke.speed = stroke.speed == null ? inst : stroke.speed * 0.75 + inst * 0.25;
    const w = clamp(MIN_W + stroke.speed * 0.11, MIN_W, MAX_W);
    if (kind === "fortune") paint(state.sketch, stroke.last, cur, (y) => ({ y, w }));
    else paint(state.surprise, stroke.last, cur, (y) => y);
    stroke.last = cur;
    renderSketch();
  });

  const end = () => {
    if (!stroke) return;
    const before = stroke.before;
    stroke = null;
    save();
    if (kind !== "fortune") return;   // surprise is applied on the next generation
    const changed = [];
    for (let i = 0; i < N(); i++) if (JSON.stringify(center(state.sketch, i)) !== before[i]) changed.push(i);
    if (state.lastBlends) changed.forEach((i) => delete state.lastBlends[i]); // redrawn: plain TaleBrush again
    generate(targetsFor(changed));
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
  svg.addEventListener("pointerleave", () => drawCursor(cursorSel, null));
}

/* Which sentence slots to (re)generate. A slot is generated when it is
 * sketched, or when it lies in an erased gap inside the sketch (unconstrained
 * generation). The writer's own sentences are kept as context. */
function sketchedSlots() {
  const out = [];
  for (let i = 0; i < N(); i++) if (center(state.sketch, i)) out.push(i);
  return out;
}

function targetsFor(indices) {
  const sk = sketchedSlots();
  if (!sk.length) return [];
  const first = sk[0], last = sk[sk.length - 1];
  return indices.filter((i) => {
    const l = state.lines[i];
    if (l.origin === "user" && hasText(l)) return false;
    return center(state.sketch, i) || (i > first && i < last);
  });
}

function slotParams(i, blend) {
  const s = center(state.sketch, i);
  const sur = state.surpriseOn ? center(state.surprise, i) : null;
  return {
    fortune: s ? +s.y.toFixed(3) : null,
    regen: s ? (s.w < TIGHT_W ? 2 : 1) : 0,
    surprise: sur == null ? DEFAULT_SURPRISE : +sur.toFixed(3),
    ...(blend ? { blend } : {}),
  };
}

/* ------------------------------------------------------------ generation */

const TASK_NAMES = { continuation: "continuation", infill_prev: "infill from previous", infill_next: "infill from next" };

async function generate(indices, blends = {}) {
  if (!indices.length || state.busy) return;
  if (!state.protagonist.trim()) { setStatus("First enter the protagonist's name.", "error"); return; }
  if (!state.history.length && state.lines.some(hasText)) storeHistory("Initial");
  const targets = indices.map((i) => ({ index: i, ...slotParams(i, blends[i]) }));
  const before = state.lines.map((l) => l.text);
  clearDiff();
  for (const t of targets) {
    Object.assign(state.lines[t.index], { text: "", origin: "ai", fortune: null, pending: true, target: t.fortune, lum: null });
    state.lines[t.index].rev++;
  }
  const controller = new AbortController();
  state.gen = { controller, current: -1 };
  state.previewId = null;
  renderAll();
  setStatus(`Generating ${targets.length} sentence${targets.length > 1 ? "s" : ""}…`, "busy");
  let made = 0, failed = false;
  try {
    const res = await fetch("/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({
        protagonist: state.protagonist.trim(),
        sentences: state.lines.map((l) => (l.pending ? "" : l.text)),
        fortunes: state.lines.map((l) => (l.pending ? null : l.fortune)),
        targets,
      }),
    });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const ev = JSON.parse(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
        if (ev.type === "progress") {
          const prev = state.gen.current;
          state.gen.current = ev.index;
          if (prev >= 0) updateRow(prev);
          updateRow(ev.index);
          setStatus(`Generating sentence ${ev.step} of ${ev.of} (${TASK_NAMES[ev.task]})…`, "busy");
          renderArc();
        } else if (ev.type === "sentence") {
          Object.assign(state.lines[ev.index], { text: ev.text, fortune: ev.fortune, pending: false, origin: "ai" });
          made++;
          updateRow(ev.index);
          renderArc();
        } else if (ev.type === "error") {
          failed = true;
          setStatus(ev.message, "error");
        }
      }
    }
  } catch (e) {
    if (e.name !== "AbortError") { failed = true; setStatus("Generation failed: " + e.message, "error"); }
  }
  const stopped = controller.signal.aborted;
  state.lines.forEach((l) => { if (l.pending) Object.assign(l, { pending: false, target: null }); });
  state.gen = null;
  if (made) storeHistory();
  // The writer's sentences after a generated one have new previous context.
  const after = new Set();
  targets.forEach((t) => withFollowing(t.index).slice(1).forEach((j) => {
    if (state.lines[j].origin === "user") after.add(j);
  }));
  if (after.size) scheduleRecognize([...after]);
  renderAll();
  if (!failed) setStatus(stopped ? `Stopped after ${made} sentence${made === 1 ? "" : "s"}.` : `Generated ${made} sentence${made === 1 ? "" : "s"}. Edit the text, redraw part of the arc, or press Generate Again.`);
  save();
  const generated = targets.map((t) => t.index).filter((i) => hasText(state.lines[i]) && state.lines[i].origin === "ai");
  if (made && !stopped && !failed) requestDiff(before, generated);
  if (made) hooks.afterGenerate.forEach((f) => f(generated));
}

function generateAgain() {
  if (state.gen) { state.gen.controller.abort(); return; }
  const sk = sketchedSlots();
  if (!sk.length) { setStatus("Sketch the protagonist's fortune on the canvas first.", "error"); return; }
  const range = [];
  for (let i = sk[0]; i <= sk[sk.length - 1]; i++) range.push(i);
  const t = targetsFor(range);
  if (!t.length) { setStatus("Every sketched sentence was written or edited by you, so there is nothing to regenerate.", "error"); return; }
  generate(t, state.lastBlends || {});   // Misty remix: blended slots keep their blend
}

/* ------------------------------------------------------------ history */

function snapshot() {
  return {
    lines: state.lines.map((l) => ({ text: l.text, origin: l.origin, fortune: l.fortune })),
    sketch: state.sketch.map((v) => (v ? { ...v } : null)),
    surprise: state.surprise.slice(),
  };
}

function storeHistory(name) {
  const id = state.nextId++;
  const n = state.history.filter((h) => h.name !== "Initial").length + 1;
  state.history.push({ id, name: name || `Story ${n}`, ...snapshot() });
  state.currentId = id;
  save();
}

function rollBack(id) {
  const h = state.history.find((x) => x.id === id);
  if (!h || state.gen) return;
  state.lines = h.lines.map((l) => newLine(l.text, l.origin, l.fortune));
  state.sketch = h.sketch.map((v) => (v ? { ...v } : null));
  state.surprise = h.surprise.slice();
  state.currentId = id;
  state.previewId = null;
  state.diff = null;
  save();
  renderAll();
  setStatus(`Rolled back to “${h.name}”.`);
}

function renderHistory() {
  const list = $("#historyList");
  list.innerHTML = "";
  $(".history-empty").hidden = state.history.length > 0;
  state.history.slice().reverse().forEach((h) => {
    const li = document.createElement("li");
    li.className = (h.id === state.currentId ? "current " : "") + (h.id === state.previewId ? "hover" : "");
    const name = document.createElement("span");
    name.className = "hname";
    name.textContent = h.name;
    const ren = document.createElement("button");
    ren.className = "icon rename"; ren.title = "Rename"; ren.textContent = "✎";
    const del = document.createElement("button");
    del.className = "icon del"; del.title = "Delete"; del.textContent = "×";
    li.append(name, ren, del);
    li.addEventListener("mouseenter", () => { state.previewId = h.id; renderEditor(); renderArc(); markHover(); });
    li.addEventListener("click", (e) => { if (e.target === li || e.target === name) rollBack(h.id); });
    ren.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.value = h.name;
      name.replaceChildren(input);
      input.focus(); input.select();
      const commit = () => { h.name = input.value.trim() || h.name; save(); renderHistory(); };
      input.addEventListener("keydown", (k) => { if (k.key === "Enter") commit(); if (k.key === "Escape") renderHistory(); });
      input.addEventListener("blur", commit);
      input.addEventListener("click", (k) => k.stopPropagation());
    });
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      state.history = state.history.filter((x) => x.id !== h.id);
      if (state.previewId === h.id) state.previewId = null;
      if (state.currentId === h.id) state.currentId = null;
      save();
      renderAll();
    });
    list.append(li);
  });
}

function markHover() {
  const items = [...document.querySelectorAll("#historyList li")];
  const ids = state.history.slice().reverse().map((h) => h.id);
  items.forEach((li, k) => li.classList.toggle("hover", ids[k] === state.previewId));
}

function setMenu(open) {
  state.menuOpen = open;
  $("#historyMenu").hidden = !open;
  $("#historyBtn").setAttribute("aria-expanded", String(open));
  $("#historyBtn").textContent = open ? "History ▵" : "History ▿";
  if (!open && state.previewId != null) { state.previewId = null; renderEditor(); }
  renderArc();
}

/* ------------------------------------------------------------ controls */

function renderControls() {
  const btn = $("#againBtn");
  btn.classList.toggle("stop", !!state.gen);
  btn.querySelector("span").textContent = state.gen ? "Stop" : "Generate Again";
  $("#penBtn").classList.toggle("active", state.tool === "pen");
  $("#eraserBtn").classList.toggle("active", state.tool === "eraser");
  $("#penBtn").setAttribute("aria-pressed", String(state.tool === "pen"));
  $("#eraserBtn").setAttribute("aria-pressed", String(state.tool === "eraser"));
  $("#fortuneCanvas").classList.toggle("erasing", state.tool === "eraser");
  $("#surpriseCanvas").classList.toggle("erasing", state.tool === "eraser");
  $("#surpriseOn").checked = state.surpriseOn;
  $("#surpriseWrap").hidden = !state.surpriseOn;
}

function resize() {
  const w = Math.round($("#fortuneCanvas").getBoundingClientRect().width) || 640;
  VW = w;
  $("#fortuneCanvas").setAttribute("viewBox", `0 0 ${VW} ${FH}`);
  $("#surpriseCanvas").setAttribute("viewBox", `0 0 ${VW} ${SH}`);
  renderSketch();
  renderArc();
  renderExamples();
}

async function checkModel() {
  const note = $("#modelNote");
  try {
    const h = await (await fetch("/api/health")).json();
    if (h.bridge && h.bridge.ok) {
      note.innerHTML = `<b>TaleBrush Studio.</b> <b>Substitution:</b> every model call goes to <b>${h.bridge.backend} · ${h.bridge.model}</b> through the workshop LLM bridge, in place of the papers' models (TaleBrush: GPT‑Neo 2.7B + GeDi GPT2‑medium; Misty and VideoDiff: GPT‑4o; Luminate: text‑davinci‑003; Selenite: GPT‑4 + BART‑MNLI). Surprise is set in the prompt, not by sampling temperature.`;
    } else {
      note.innerHTML = `<b style="color:#e5534b">LLM bridge not reachable at ${h.bridge_url}.</b> Start it from the repository root: <code>python3 llm-bridge/bridge.py claude</code>`;
    }
  } catch (_) {
    note.textContent = "TaleBrush server not reachable.";
  }
}

function init() {
  if (!load()) state.lines = Array.from({ length: START_LINES }, () => newLine());
  ensureSamples();
  $("#title").value = state.title;
  $("#protagonist").value = state.protagonist;
  $("#title").addEventListener("input", (e) => { state.title = e.target.value; save(); });
  let protTimer = null;
  $("#protagonist").addEventListener("input", (e) => {
    state.protagonist = e.target.value;
    save();
    clearTimeout(protTimer);
    protTimer = setTimeout(() => {
      const all = state.lines.map((l, i) => (hasText(l) ? i : -1)).filter((i) => i >= 0);
      if (all.length && state.protagonist.trim()) scheduleRecognize(all);
    }, 600);
  });
  $("#againBtn").addEventListener("click", generateAgain);
  $("#penBtn").addEventListener("click", () => { state.tool = "pen"; renderControls(); });
  $("#eraserBtn").addEventListener("click", () => { state.tool = "eraser"; renderControls(); });
  $("#surpriseOn").addEventListener("change", (e) => { state.surpriseOn = e.target.checked; save(); renderControls(); resize(); });
  $("#historyBtn").addEventListener("click", (e) => { e.stopPropagation(); setMenu(!state.menuOpen); });
  $("#historyMenu").addEventListener("click", (e) => e.stopPropagation());
  $("#historyList").addEventListener("mouseleave", () => { state.previewId = null; renderEditor(); renderArc(); markHover(); });
  document.addEventListener("click", () => { if (state.menuOpen) setMenu(false); });
  setupMisty();
  setupCanvas($("#fortuneCanvas"), "fortune");
  setupCanvas($("#surpriseCanvas"), "surprise");
  new ResizeObserver(resize).observe($("#fortuneCanvas"));
  hooks.init.forEach((f) => f());
  renderAll();
  resize();
  checkModel();
  // Recognize any written sentences whose fortune is unknown (e.g., after a reload).
  const unknown = state.lines.map((l, i) => (hasText(l) && l.fortune == null ? i : -1)).filter((i) => i >= 0);
  if (unknown.length && state.protagonist.trim()) scheduleRecognize(unknown);
}


/* ============================================================ Misty remix
 *
 * Conceptual blending (Misty, Lu et al. CHI 2025) applied to TaleBrush:
 *  - Example stories play the role of Misty's example nodes; TaleBrush's
 *    recognizer turns each into a fortune arc.
 *  - Global blending: drag a whole example onto the fortune canvas.
 *  - Localized blending: brush a stretch of an example's arc, drag it onto a span
 *    of sentences; the span is highlighted while hovering.
 *  - On drop, "Pick Blending Option" asks which aspects to blend. "Arc" becomes
 *    a sketch, so TaleBrush's controlled generation realizes it.
 *  - Semantic diff: each generation is summarized as toggleable changes; turning
 *    one off (or rewording it) re-derives the generated sentences from the base.
 */

const SAMPLES = [
  { name: "Cinderella", text: "Ella lives with a stepmother who makes her scrub floors all day. When the royal ball is announced, she is forbidden to go. A fairy godmother appears and dresses her in a shimmering gown. At the ball, the prince dances only with her. At midnight the spell breaks and she flees, losing a glass slipper. The prince searches the kingdom and finds that the slipper fits Ella." },
  { name: "Icarus", text: "Icarus and his father Daedalus are imprisoned in a tower on the island of Crete. Daedalus builds them wings from feathers and wax. Icarus soars out over the sea, laughing with joy at his freedom. Thrilled, he flies higher and higher toward the sun, ignoring his father's warning. The sun melts the wax and his feathers scatter. Icarus plunges into the sea and drowns." },
  { name: "The Tortoise and the Hare", text: "The hare mocks the tortoise for being slow. Tired of the insults, the tortoise challenges the hare to a race. The hare dashes far ahead and, sure of victory, lies down for a nap. The tortoise plods on steadily without stopping. The hare wakes up to see the tortoise near the finish line. The tortoise crosses the line first and wins the race." },
];
const BLEND_W = 0.12;   // envelope half-width of a blended arc (one regeneration)
const MINI_H = 64;

/* ---------- mapping an example onto a span of the story ---------- */

// Example position (fractional sentence index) for story slot position u.
function exPos(src, span, u) {
  const [a, b] = src.sel;
  const t = span.len > 1 ? (u - span.start) / (span.len - 1) : 0;
  return a + clamp(t, 0, 1) * (b - a);
}
function fortuneAt(ex, e) {
  const m = ex.fortunes.length;
  e = clamp(e, 0, m - 1);
  const lo = Math.floor(e), hi = Math.min(m - 1, lo + 1);
  return ex.fortunes[lo] + (ex.fortunes[hi] - ex.fortunes[lo]) * (e - lo);
}
const exSentenceAt = (ex, e) => ex.sentences[clamp(Math.round(e), 0, ex.sentences.length - 1)];
const range = (a, n) => Array.from({ length: n }, (_, k) => a + k);

/* ---------- example cards ---------- */

function renderExamples() {
  const list = $("#exampleList");
  if (!list) return;
  list.innerHTML = "";
  if (!state.examples.length) {
    list.innerHTML = '<div class="ex-hint">No examples yet. Add one below. Its fortune arc is recognized the same way as your sentences.</div>';
    return;
  }
  for (const ex of state.examples) {
    const card = document.createElement("div");
    card.className = "ex-card" + (state.drag && state.drag.ex === ex ? " dragging" : "");
    const top = document.createElement("div");
    top.className = "ex-top";
    top.innerHTML = `<span class="handle" title="Drag onto the fortune canvas to blend the whole story">⠿</span>
      <span class="name"></span><span class="meta"></span>
      <button class="blend">Blend whole story…</button><button class="x" title="Remove example">×</button>`;
    top.querySelector(".name").textContent = ex.name;
    top.querySelector(".meta").textContent = `${ex.protagonist || "?"} · ${ex.sentences.length} sentences`;
    top.querySelector(".handle").addEventListener("pointerdown", (e) => startDrag(e, ex, [0, ex.sentences.length - 1], true));
    top.querySelector(".blend").addEventListener("click", () =>
      openBlendDialog({ ex, sel: [0, ex.sentences.length - 1], global: true }, { start: 0, len: N() }));
    top.querySelector(".x").addEventListener("click", () => {
      state.examples = state.examples.filter((x) => x !== ex);
      save(); renderExamples();
    });
    const svg = document.createElementNS(SVGNS, "svg");
    svg.classList.add("ex-arc");
    const details = document.createElement("details");
    details.innerHTML = "<summary>Show text</summary>";
    const ol = document.createElement("ol");
    ex.sentences.forEach((t, k) => {
      const li = document.createElement("li");
      li.textContent = t;
      if (ex.sel && k >= ex.sel[0] && k <= ex.sel[1]) li.className = "sel";
      ol.append(li);
    });
    details.append(ol);
    card.append(top, svg, details);
    list.append(card);
    drawMini(svg, ex);
    bindMini(svg, ex, ol);
  }
}

function drawMini(svg, ex) {
  const W = svg.getBoundingClientRect().width || 300, m = ex.sentences.length;
  svg.setAttribute("viewBox", `0 0 ${W} ${MINI_H}`);
  svg.classList.toggle("has-sel", !!ex.sel);
  svg.innerHTML = "";
  const x = (k) => ((k + 0.5) / m) * W, y = (f) => 6 + (1 - f) * (MINI_H - 12);
  svgEl("rect", { x: 0, y: 0, width: W, height: MINI_H, fill: "#fbfaf7", rx: 6 }, svg);
  svgEl("line", { x1: 0, x2: W, y1: y(0.5), y2: y(0.5), stroke: "#d8d6d0" }, svg);
  if (ex.sel) {
    const [a, b] = ex.sel;
    svgEl("rect", { x: (a / m) * W, y: 1, width: ((b - a + 1) / m) * W, height: MINI_H - 2, rx: 5,
      fill: "#f7ecf4", stroke: "#b0569a", "stroke-dasharray": "4 3" }, svg);
  }
  const d = ex.fortunes.map((f, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(f).toFixed(1)}`).join(" ");
  svgEl("path", { d, fill: "none", stroke: "#b0569a", "stroke-width": 2, opacity: 0.8 }, svg);
  ex.fortunes.forEach((f, k) => {
    const c = svgEl("circle", { cx: x(k), cy: y(f), r: 3.5, fill: "#b0569a" }, svg);
    c.addEventListener("pointerenter", (e) => showTip(e, `${k + 1}. ${ex.sentences[k]}`));
    c.addEventListener("pointerleave", hideTip);
  });
}

// Brush across the mini arc to select sentences; press inside the selection to drag it.
function bindMini(svg, ex, ol) {
  const idxAt = (e) => {
    const r = svg.getBoundingClientRect();
    return clamp(Math.floor(((e.clientX - r.left) / r.width) * ex.sentences.length), 0, ex.sentences.length - 1);
  };
  let anchor = null;
  svg.addEventListener("pointerdown", (e) => {
    const k = idxAt(e);
    if (ex.sel && k >= ex.sel[0] && k <= ex.sel[1]) { startDrag(e, ex, ex.sel.slice(), false); return; }
    svg.setPointerCapture(e.pointerId);
    anchor = k;
    ex.sel = [k, k];
    drawMini(svg, ex);
  });
  svg.addEventListener("pointermove", (e) => {
    if (anchor == null) return;
    const k = idxAt(e);
    ex.sel = [Math.min(anchor, k), Math.max(anchor, k)];
    drawMini(svg, ex);
  });
  const end = () => {
    if (anchor == null) return;
    anchor = null;
    [...ol.children].forEach((li, k) => li.classList.toggle("sel", k >= ex.sel[0] && k <= ex.sel[1]));
    save();
    setStatus(`Selected ${ex.name} ${ex.sel[0] + 1}–${ex.sel[1] + 1}. Drag the selection onto the fortune canvas.`);
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
}

/* ---------- drag-and-drop onto the fortune canvas ---------- */

function startDrag(e, ex, sel, global) {
  if (state.gen || state.busy) { setStatus("Wait for the current generation to finish.", "error"); return; }
  e.preventDefault();
  hideTip();
  state.drag = { ex, sel, global };
  const ghost = $("#dragGhost");
  ghost.textContent = global ? `${ex.name}: whole story` : `${ex.name} ${sel[0] + 1}–${sel[1] + 1}`;
  ghost.hidden = false;
  const canvas = $("#fortuneCanvas");
  const move = (ev) => {
    ghost.style.left = ev.clientX + "px";
    ghost.style.top = ev.clientY + "px";
    const r = canvas.getBoundingClientRect();
    const inside = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    let span = null;
    if (inside && global) span = { start: 0, len: N() };
    else if (inside) {
      const len = Math.min(sel[1] - sel[0] + 1, N());
      const slot = Math.floor(((ev.clientX - r.left) / r.width) * N());
      span = { start: clamp(slot - Math.floor((len - 1) / 2), 0, N() - len), len };
    }
    if (JSON.stringify(span) !== JSON.stringify(state.dropSpan)) { state.dropSpan = span; renderArc(); }
  };
  const up = () => {
    document.removeEventListener("pointermove", move);
    ghost.hidden = true;
    const drag = state.drag, span = state.dropSpan;
    state.drag = null;
    renderExamples();
    if (span) openBlendDialog(drag, span);
    else { state.dropSpan = null; renderArc(); }
  };
  move(e);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up, { once: true });
  renderExamples();
}

// Highlight where the blend will land and preview the example's arc there.
function drawDropPreview(g) {
  const span = state.dropSpan;
  const src = state.drag || (state.pendingBlend && state.pendingBlend.src);
  if (!span || !src) return;
  svgEl("rect", { x: span.start * slotW() + 2, y: 2, width: span.len * slotW() - 4, height: FH - 4, rx: 14,
    fill: "#b0569a", "fill-opacity": 0.08, stroke: "#b0569a", "stroke-width": 2, "stroke-dasharray": "6 4", class: "drop-span" }, g);
  const pts = range(span.start, span.len).map((i) => `${cx(i).toFixed(1)},${fy(fortuneAt(src.ex, exPos(src, span, i))).toFixed(1)}`);
  if (pts.length > 1) svgEl("polyline", { points: pts.join(" "), fill: "none", stroke: "#b0569a", "stroke-width": 2.5, "stroke-dasharray": "5 4", opacity: 0.9 }, g);
  for (const p of pts) { const [x, y] = p.split(","); svgEl("circle", { cx: x, cy: y, r: 4, fill: "#fff", stroke: "#b0569a", "stroke-width": 2 }, g); }
}

/* ---------- Pick Blending Option ---------- */

function openBlendDialog(src, span) {
  if (state.gen || state.busy) return;
  if (!state.protagonist.trim()) {
    setStatus("First enter the protagonist's name.", "error");
    $("#protagonist").focus();
    state.dropSpan = null; renderArc();
    return;
  }
  state.pendingBlend = { src, span };
  state.dropSpan = span;
  renderArc();
  const { ex, sel, global } = src;
  const own = range(span.start, span.len).filter((i) => state.lines[i].origin === "user" && hasText(state.lines[i])).length;
  $("#blendWhat").textContent = (global
    ? `The whole of “${ex.name}” (${ex.sentences.length} sentences) → all ${N()} sentences of your story.`
    : `“${ex.name}” sentences ${sel[0] + 1}–${sel[1] + 1} → your sentences ${span.start + 1}–${span.start + span.len}.`)
    + (own ? ` Your own ${own === 1 ? "sentence stays" : own + " sentences stay"} as written.` : "");
  document.querySelectorAll('#blendForm input[name="aspect"]').forEach((c) => { c.checked = c.value === "arc"; });
  $("#customText").value = "";
  $("#blendDialog").hidden = false;
}

function closeBlendDialog() {
  $("#blendDialog").hidden = true;
  state.pendingBlend = null;
  state.dropSpan = null;
  renderArc();
}

function applyBlend({ src, span }, aspects, custom) {
  const { ex } = src;
  if (aspects.includes("arc")) {
    for (let s = span.start * R; s < (span.start + span.len) * R; s++) {
      const u = clamp((s + 0.5) / R - 0.5, span.start, span.start + span.len - 1);
      state.sketch[s] = { y: fortuneAt(ex, exPos(src, span, u)), w: BLEND_W };
    }
  }
  const targets = range(span.start, span.len).filter((i) => !(state.lines[i].origin === "user" && hasText(state.lines[i])));
  if (!targets.length) { setStatus("Every sentence in that span is your own, so there is nothing to blend into.", "error"); renderSketch(); return; }
  const textAspects = aspects.filter((a) => a !== "arc");
  const blends = {};
  if (textAspects.length) {
    for (const i of targets) {
      blends[i] = { aspects: textAspects, name: ex.name, custom,
        example_sentence: exSentenceAt(ex, exPos(src, span, i)), example_text: ex.sentences.join(" ") };
    }
  }
  state.lastBlends = { ...(state.lastBlends || {}), ...blends };
  targets.forEach((i) => { if (!blends[i] && state.lastBlends) delete state.lastBlends[i]; });
  save();
  renderSketch();
  generate(targets, blends);
}

async function addExample(name, text) {
  if (!text.trim()) { setStatus("Paste the example story first.", "error"); return; }
  const btn = $("#exAddBtn");
  btn.disabled = true;
  setStatus("Recognizing the example's fortune arc…", "busy");
  try {
    const r = await fetch("/api/example", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    if (!data.sentences.length) throw new Error("no sentences found");
    const ex = { id: "ex" + Date.now(), name: name.trim() || data.protagonist || "Example", protagonist: data.protagonist,
      sentences: data.sentences, fortunes: data.fortunes, sel: null };
    state.examples.push(ex);
    $("#exName").value = ""; $("#exText").value = "";
    $("#exAdd").open = false;
    save();
    renderExamples();
    setStatus(`Added “${ex.name}”: ${ex.sentences.length} sentences with ${ex.protagonist || "its protagonist"}'s fortune arc.`);
  } catch (e) {
    setStatus("Could not add the example: " + e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

/* ---------- semantic diff ---------- */

function clearDiff() {
  if (!state.diff && !state.diffHover) return;
  state.diff = null;
  state.diffHover = null;
  renderDiff();
}

async function requestDiff(before, generated) {
  if (!generated.length) return;
  const d = { loading: true, base: state.lines.map((l) => l.text), baseFortunes: state.lines.map((l) => l.fortune),
    changes: [], disabled: [], edited: {}, editable: generated };
  state.diff = d;
  renderDiff();
  try {
    const r = await fetch("/api/diff", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protagonist: state.protagonist.trim(), before, after: d.base, changed: generated }) });
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    if (state.diff !== d) return;
    d.loading = false;
    d.changes = data.changes || [];
  } catch (e) {
    if (state.diff === d) state.diff = null;
    setStatus("Could not summarize the changes: " + e.message, "error");
  }
  save();
  renderDiff();
}

function renderDiff() {
  const panel = $("#diffPanel"), list = $("#diffList");
  if (!panel) return;
  const d = state.diff;
  panel.hidden = !d || (!d.loading && !d.changes.length);
  list.innerHTML = "";
  if (!d) return;
  if (d.loading) { list.innerHTML = '<li><span class="spin"></span> Summarizing what changed…</li>'; return; }
  for (const c of d.changes) {
    const off = d.disabled.includes(c.id), edited = d.edited[c.id];
    const li = document.createElement("li");
    li.className = off ? "off" : "";
    li.innerHTML = `<label class="switch"><input type="checkbox"><span></span></label>
      <div class="dbody"><div class="dlabel"></div><div class="ddetail"></div><div class="dchips"></div></div>`;
    const sw = li.querySelector("input");
    sw.checked = !off;
    sw.disabled = state.busy || !!state.gen;
    const label = li.querySelector(".dlabel");
    label.textContent = edited || c.label;
    label.title = "Click to describe a different change";
    if (edited) {
      const badge = document.createElement("span");
      badge.className = "badge"; badge.textContent = "edited";
      const reset = document.createElement("button");
      reset.className = "reset"; reset.textContent = "↺ original"; reset.type = "button";
      reset.addEventListener("click", () => { delete d.edited[c.id]; applyDiff(); });
      label.append(badge, reset);
    }
    li.querySelector(".ddetail").textContent = edited ? `Was: ${c.label}. ${c.detail}` : c.detail;
    li.querySelector(".dchips").textContent = "Sentence" + (c.sentences.length > 1 ? "s " : " ") + c.sentences.map((i) => i + 1).join(", ");
    sw.addEventListener("change", () => {
      d.disabled = sw.checked ? d.disabled.filter((x) => x !== c.id) : [...d.disabled, c.id];
      applyDiff();
    });
    label.addEventListener("click", (e) => {
      if (e.target !== label || state.busy || state.gen) return;
      const input = document.createElement("input");
      input.value = edited || c.label;
      label.replaceChildren(input);
      input.focus(); input.select();
      let done = false;
      const commit = (apply) => {
        if (done) return;
        done = true;
        const v = input.value.trim();
        if (apply && v && v !== (edited || c.label)) {
          if (v === c.label) delete d.edited[c.id]; else d.edited[c.id] = v;
          d.disabled = d.disabled.filter((x) => x !== c.id);
          applyDiff();
        } else renderDiff();
      };
      input.addEventListener("keydown", (k) => { if (k.key === "Enter") commit(true); if (k.key === "Escape") commit(false); });
      input.addEventListener("blur", () => commit(true));
    });
    li.addEventListener("mouseenter", () => { state.diffHover = c.sentences; refreshHighlights(); });
    li.addEventListener("mouseleave", () => { state.diffHover = null; refreshHighlights(); });
    list.append(li);
  }
}

function refreshHighlights() {
  state.lines.forEach((_, i) => updateRow(i));
  renderArc();
}

// Re-derive the generated sentences from the base version with the current
// toggles and edits (no toggles off and no edits = the base itself, no call).
async function applyDiff() {
  const d = state.diff;
  if (!d || state.busy || state.gen) return;
  const changed = d.disabled.length || Object.keys(d.edited).length;
  state.busy = true;
  renderDiff();
  setStatus(changed ? "Revising the story for the semantic diff…" : "Restoring the generated version…", "busy");
  let data = { sentences: {}, fortunes: {} };
  try {
    if (changed) {
      const r = await fetch("/api/revise", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ protagonist: state.protagonist.trim(), sentences: d.base, changes: d.changes,
          disabled: d.disabled, edited: d.edited, editable: d.editable }) });
      data = await r.json();
      if (data.error) throw new Error(data.error);
    }
    if (state.diff !== d) return;
    let n = 0;
    for (const i of d.editable) {
      const l = state.lines[i];
      if (!l) continue;
      const text = data.sentences[i] ?? d.base[i];
      if (text !== d.base[i]) n++;
      Object.assign(l, { text, fortune: data.fortunes[i] ?? d.baseFortunes[i], origin: "ai" });
      l.rev++;
    }
    const cur = state.history.find((h) => h.id === state.currentId);
    storeHistory(`${(cur ? cur.name : "Story").replace(/ · revised$/, "")} · revised`);
    setStatus(changed ? `Revised ${n} sentence${n === 1 ? "" : "s"}. Switch changes back on to restore them.` : "Restored the generated version.");
  } catch (e) {
    setStatus("Could not revise: " + e.message, "error");
  } finally {
    state.busy = false;
    save();
    renderAll();
  }
}

function setupMisty() {
  $("#exAddBtn").addEventListener("click", () => addExample($("#exName").value, $("#exText").value));
  document.querySelectorAll(".ex-suggest button").forEach((b) => b.addEventListener("click", () => {
    const sample = SAMPLES[+b.dataset.sample];
    $("#exName").value = sample.name;
    $("#exText").value = sample.text;
  }));
  $("#blendForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const aspects = [...document.querySelectorAll('#blendForm input[name="aspect"]:checked')].map((c) => c.value);
    const custom = $("#customText").value.trim();
    if (!aspects.length) return;
    if (aspects.includes("custom") && !custom) { $("#customText").focus(); return; }
    const pending = state.pendingBlend;
    closeBlendDialog();
    if (pending) applyBlend(pending, aspects, custom);
  });
  $("#customText").addEventListener("input", (e) => { $("#customChk").checked = !!e.target.value.trim(); });
  $("#blendCancel").addEventListener("click", closeBlendDialog);
  $("#blendDialog").addEventListener("click", (e) => { if (e.target.id === "blendDialog") closeBlendDialog(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#blendDialog").hidden) closeBlendDialog(); });
}

/* ============================================================ shared studio helpers */

// Slots a generated alternative may (re)write: the sketched range (as Generate
// Again uses), or else every slot not written by the writer.
function variantSlots() {
  const free = (i) => !(state.lines[i].origin === "user" && hasText(state.lines[i]));
  const sk = sketchedSlots();
  let idx = [];
  if (sk.length) idx = range(sk[0], sk[sk.length - 1] - sk[0] + 1).filter(free);
  if (!idx.length) idx = state.lines.map((_, i) => i).filter(free);
  return idx;
}

// Fortune target of each slot from the TaleBrush sketch (null where unsketched).
function slotTargets(slots) {
  const t = {};
  slots.forEach((i) => { const c = center(state.sketch, i); t[i] = c ? +c.y.toFixed(3) : null; });
  return t;
}

// Put a variant's sentences into the story (Luminate: shown in yellow until edited).
function applyVariant(v, label, only) {
  if (state.gen) { setStatus("Wait for the current generation to finish.", "error"); return; }
  clearDiff();
  for (const [k, text] of Object.entries(v.sentences)) {
    const i = +k;
    if (only != null && i !== only) continue;
    while (i >= N()) insertLine(N());
    Object.assign(state.lines[i], { text, origin: "ai", fortune: v.fortunes[k] ?? null, pending: false, lum: v.id });
    state.lines[i].rev++;
  }
  storeHistory(label);
  save();
  renderAll();
}

async function postJSON(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// Read an NDJSON stream, calling onEvent for each line.
async function postStream(url, body, onEvent, signal) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.trim()) onEvent(JSON.parse(line));
    }
  }
}

// Right-panel tabs: Fortune arc (TaleBrush), Design space (Luminate), Compare (VideoDiff).
function showTab(name) {
  state.studio.tab = name;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".tabpane").forEach((p) => { p.hidden = p.dataset.pane !== name; });
  if (name === "arc") resize();   // the SVG measures 0 wide while hidden
  save();
}
hooks.init.push(() => {
  document.querySelectorAll(".tab").forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });
  showTab(state.studio.tab || "arc");
});

// Every module has loaded by DOMContentLoaded (scripts sit at the end of <body>).
document.addEventListener("DOMContentLoaded", init);
