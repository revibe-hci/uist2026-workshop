// The sketching canvases (Sections 3 and 4.2, Figures 1, 4 and 5).
//
// Fortune canvas: x is the sentence slot (one column per bullet point, separated by subtle
// vertical lines), y is the protagonist's fortune (higher is better). The pen draws a green,
// hatched envelope whose width follows the drawing speed: fast strokes are wide (loose control),
// slow strokes are thin (tight control). The recognized fortune of each sentence is a dot; the
// writer's sentences are grey and generated ones blue, joined by a smooth line with a gap at blank
// bullets. While the History dropdown is open, stored stories are drawn faintly as well.
//
// Remix (several characters): with two or more characters, every character has its own line in
// its own colour (characters.js PALETTE). The pen and the eraser act on the character selected
// above the canvas; the other characters' envelopes are drawn faintly. Each character's recognized
// fortune is a line of dots in its colour: filled dots for TaleBrush's sentences, rings for the
// writer's. Where a sentence does not involve a character, that character has no dot, and its
// line continues as a dashed segment. With one character, the canvas looks as in the paper.
//
// Surprise canvas: the same columns; the pen draws a thin green line for the desired surprise.
//
// Relationship canvas (remix): the same columns; y is how a pair of characters gets along, from
// Conflict (bottom, 0) to Harmony (top, 1). The pen draws an envelope for the pair chosen above the
// panel, with the same speed rule as the fortune canvas. Each pair's rated relationship is a line
// of teal dots; where the two characters do not deal with each other, the line is dotted.

import { ABSENT, PALETTE, isRating, labels, modelNames, pairLabel } from "./characters.js";
import { BANDS, DEFAULT_SURPRISE, ENVELOPE, ERASER_RADIUS, SAMPLES_PER_SLOT as S, halfWidthForSpeed } from "./config.js";
import { monotoneSegments } from "./geometry.js";
import { ratingKeys, relationKeys } from "./keys.js";
import * as Sk from "./sketch.js";
import { activeCharacter, activePair, changed, isMulti, labelOf, pairs, ratingOf, relationsOn, state } from "./store.js";

const NS = "http://www.w3.org/2000/svg";
const r1 = (v) => Math.round(v * 10) / 10;
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function svgEl(name, attrs, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  parent?.appendChild(node);
  return node;
}

function hatchPattern(defs, id, { fill, line, angle }) {
  const hatch = svgEl("pattern", { id, patternUnits: "userSpaceOnUse", width: 6, height: 6, patternTransform: `rotate(${angle})` }, defs);
  svgEl("rect", { width: 6, height: 6, fill }, hatch);
  svgEl("line", { x1: 1.5, y1: 0, x2: 1.5, y2: 6, stroke: line, "stroke-width": 2, "stroke-opacity": 0.9 }, hatch);
}

// Relationship canvas: background bands, and a few words for a rated value (tooltips).
const RELATION_BANDS = [
  { from: 0, to: 0.35, fill: "#fcf1ef" },
  { from: 0.35, to: 0.65, fill: "#ffffff" },
  { from: 0.65, to: 1, fill: "#eef7f2" },
];

export function relationWords(v) {
  if (v < 0.15) return "open hostility";
  if (v < 0.35) return "conflict";
  if (v < 0.45) return "tension";
  if (v < 0.55) return "neutral";
  if (v < 0.65) return "friendly";
  if (v < 0.85) return "warm";
  return "deep harmony";
}

/** Characters in drawing order: the selected one last, so it is on top. */
function drawingOrder() {
  const active = activeCharacter().id;
  return [...state.characters.filter((c) => c.id !== active), ...state.characters.filter((c) => c.id === active)];
}

export class SketchCanvas {
  constructor({ svg, wrap, kind, onStroke, onErase }) {
    this.svg = svg;
    this.wrap = wrap;
    this.kind = kind; // "fortune", "surprise" or "relation" (remix)
    this.onStroke = onStroke;
    this.onErase = onErase;
    this.pad = { l: 1, r: 1, t: 1, b: 1 };
    this.W = 0;
    this.H = 0;
    this.drag = null;
    this.tipTimer = 0;

    const defs = svgEl("defs", {}, svg);
    const clipId = `tb-clip-${kind}`;
    this.clipRect = svgEl("rect", { rx: 12, ry: 12 }, svgEl("clipPath", { id: clipId }, defs));
    if (kind === "fortune") {
      hatchPattern(defs, "tb-hatch", { fill: "rgba(118, 204, 150, 0.16)", line: "#86d3a2", angle: -50 });
      PALETTE.forEach((p, k) => hatchPattern(defs, `tb-hatch-${k}`, { fill: p.fill, line: p.hatch, angle: p.angle }));
    }
    if (kind === "relation") {
      hatchPattern(defs, "tb-hatch-rel", { fill: "rgba(31, 150, 130, 0.12)", line: "#86cfc2", angle: -50 });
    }
    const root = svgEl("g", { "clip-path": `url(#${clipId})` }, svg);
    this.layers = {};
    for (const name of ["bg", "grid", "history", "sketch", "arc"]) {
      this.layers[name] = svgEl("g", { class: `layer-${name}` }, root);
    }
    this.cursor = svgEl("circle", { class: "eraser-cursor", r: ERASER_RADIUS, visibility: "hidden" }, svg);

    this.tip = document.createElement("div");
    this.tip.className = "canvas-tip";
    this.tip.hidden = true;
    wrap.appendChild(this.tip);
    if (kind !== "surprise") {
      this.hint = document.createElement("div");
      this.hint.className = "canvas-hint";
      wrap.appendChild(this.hint);
    }

    new ResizeObserver(() => {
      if (this.layout()) this.render();
    }).observe(wrap);
    svg.addEventListener("pointerdown", (e) => this.down(e));
    svg.addEventListener("pointermove", (e) => this.move(e));
    svg.addEventListener("pointerup", (e) => this.up(e));
    svg.addEventListener("pointercancel", (e) => this.up(e));
    svg.addEventListener("pointerleave", () => this.leave());
  }

  // ---------------------------------------------------------------- geometry

  layout() {
    const r = this.wrap.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    this.W = r.width;
    this.H = r.height;
    this.svg.setAttribute("viewBox", `0 0 ${this.W} ${this.H}`);
    this.clipRect.setAttribute("x", this.pad.l);
    this.clipRect.setAttribute("y", this.pad.t);
    this.clipRect.setAttribute("width", this.plotW);
    this.clipRect.setAttribute("height", this.plotH);
    return true;
  }

  get n() {
    return Math.max(1, state.sentences.length);
  }
  get plotW() {
    return this.W - this.pad.l - this.pad.r;
  }
  get plotH() {
    return this.H - this.pad.t - this.pad.b;
  }
  get slotW() {
    return this.plotW / this.n;
  }
  xOf(units) {
    return this.pad.l + units * this.slotW;
  }
  unitsOf(x) {
    return Math.min(this.n - 1e-6, Math.max(0, (x - this.pad.l) / this.slotW));
  }
  yOf(value) {
    return this.pad.t + (1 - value) * this.plotH;
  }
  valueOf(y) {
    return Math.min(1, Math.max(0, 1 - (y - this.pad.t) / this.plotH));
  }
  /** The samples the pen and eraser act on: the selected character's or pair's line, or the surprise line. */
  samples() {
    if (this.kind === "surprise") return state.sketch.surprise;
    if (this.kind === "relation") return Sk.relationLine(state.sketch, activePair().key, state.sentences.length);
    return Sk.lineOf(state.sketch, activeCharacter().id, state.sentences.length);
  }
  point(e) {
    const r = this.svg.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
  }
  locked() {
    return state.ui.generating || !!state.ui.previewId;
  }

  // ---------------------------------------------------------------- drawing and erasing

  down(e) {
    if (e.button !== 0 || this.locked()) return;
    if (this.kind === "relation" && !activePair()) return;
    e.preventDefault();
    try {
      this.svg.setPointerCapture(e.pointerId);
    } catch {
      /* not supported: drawing still works inside the canvas */
    }
    const p = this.point(e);
    this.drag = {
      tool: state.tool,
      character: this.kind === "relation" ? activePair().key : activeCharacter().id, // a pair key on the relationship canvas
      line: this.samples(),
      last: p,
      speed: (ENVELOPE.slowSpeed + ENVELOPE.fastSpeed) / 2,
      touched: new Set(),
      erased: false,
    };
    clearTimeout(this.tipTimer);
    this.hideTip();
    if (state.ui.linkSlot !== null) {
      state.ui.linkSlot = null; // the hover highlight would otherwise stay on the slot where the stroke began
      changed({ persist: false });
    }
    this.apply(p, p);
    this.renderSketch();
    this.renderCursor(p);
  }

  move(e) {
    const p = this.point(e);
    if (!this.drag) {
      this.hover(p);
      this.renderCursor(p);
      return;
    }
    const coalesced = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [];
    for (const ce of coalesced.length ? coalesced : [e]) {
      const q = this.point(ce);
      const dt = q.t - this.drag.last.t;
      if (this.drag.tool === "pen" && dt > 0) {
        const speed = Math.hypot(q.x - this.drag.last.x, q.y - this.drag.last.y) / dt; // px per ms
        this.drag.speed = this.drag.speed * 0.8 + speed * 0.2;
      }
      this.apply(this.drag.last, q);
      this.drag.last = q;
    }
    this.renderSketch();
    this.renderCursor(p);
  }

  up(e) {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    try {
      this.svg.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    changed();
    if (drag.tool === "pen") this.onStroke?.(this.kind, Sk.touchedSlots(drag.touched, state.sentences.length), drag.character);
    else this.onErase?.(this.kind, drag.erased, drag.character);
  }

  leave() {
    if (this.drag) return;
    clearTimeout(this.tipTimer);
    this.renderCursor(null);
    this.hideTip();
    if (state.ui.linkSlot !== null) {
      state.ui.linkSlot = null;
      changed({ persist: false });
    }
  }

  apply(a, b) {
    if (this.drag.tool === "pen") {
      const ua = this.unitsOf(a.x);
      const ub = this.unitsOf(b.x);
      const va = this.valueOf(a.y);
      const vb = this.valueOf(b.y);
      if (this.kind === "surprise") {
        Sk.writeSurprise(this.drag.line, ua, va, ub, vb, this.drag.touched);
      } else {
        Sk.writeFortune(this.drag.line, ua, va, ub, vb, halfWidthForSpeed(this.drag.speed), this.drag.touched);
      }
      return;
    }
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
    for (let k = 0; k <= steps; k++) this.eraseAt(a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps);
  }

  eraseAt(px, py) {
    const arr = this.drag.line;
    const r = ERASER_RADIUS;
    const j0 = Math.max(0, Math.floor(((px - r - this.pad.l) / this.slotW) * S));
    const j1 = Math.min(arr.length - 1, Math.ceil(((px + r - this.pad.l) / this.slotW) * S));
    for (let j = j0; j <= j1; j++) {
      const v = arr[j];
      if (v === null || v === undefined) continue;
      if (Math.abs(this.xOf((j + 0.5) / S) - px) > r) continue;
      if (this.kind !== "surprise") {
        const top = this.yOf(Math.min(1, v[0] + v[1]));
        const bottom = this.yOf(Math.max(0, v[0] - v[1]));
        if (py + r < top || py - r > bottom) continue;
      } else if (Math.abs(this.yOf(v) - py) > r) {
        continue;
      }
      arr[j] = null;
      this.drag.erased = true;
    }
  }

  // ---------------------------------------------------------------- hover details

  hover(p) {
    const inside = p.x >= this.pad.l && p.x <= this.W - this.pad.r && p.y >= this.pad.t && p.y <= this.H - this.pad.b;
    const slot = inside ? Math.floor(this.unitsOf(p.x)) : null;
    if (state.ui.linkSlot !== slot) {
      state.ui.linkSlot = slot;
      changed({ persist: false });
    }
    clearTimeout(this.tipTimer);
    this.hideTip();
    if (slot !== null) this.tipTimer = setTimeout(() => this.showTip(slot, p), 450);
  }

  showTip(slot, p) {
    if (this.drag || slot >= state.sentences.length) return;
    this.tip.innerHTML = this.tipHtml(slot);
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth;
    const th = this.tip.offsetHeight;
    let x = p.x + 14;
    let y = p.y + 14;
    if (x + tw > this.W - 4) x = p.x - tw - 14;
    if (y + th > this.H - 4) y = p.y - th - 14;
    this.tip.style.left = `${Math.max(4, x)}px`;
    this.tip.style.top = `${Math.max(4, y)}px`;
  }

  hideTip() {
    this.tip.hidden = true;
  }

  tipHtml(slot) {
    const s = state.sentences[slot];
    const n = state.sentences.length;
    const multi = isMulti();
    const lines = [`<b>Sentence ${slot + 1}</b>`];
    if (!s.text.trim()) {
      lines.push("Blank bullet");
    } else {
      const by = s.gen?.model ? ` with ${s.gen.model}` : "";
      const who = s.source === "generated" ? `Written by TaleBrush${by}` : "Written by you";
      const own = ratingOf(s, state.characters[0].id);
      lines.push(!multi && own !== null ? `${who} · recognized fortune ${own.toFixed(2)}` : who);
      if (s.source === "generated" && s.gen?.tries > 1) lines.push(`Best of ${s.gen.tries} tries`);
    }
    if (this.kind === "relation") return this.relationTip(slot, lines);
    if (this.kind !== "fortune") {
      const v = Sk.surpriseSlots(state.sketch.surprise, n)[slot];
      lines.push(v !== null ? `Sketched surprise ${v.toFixed(2)}` : `No surprise line: default ${DEFAULT_SURPRISE.toFixed(2)}`);
      return lines.join("<br>");
    }
    const cast = Sk.castSlots(
      state.sketch,
      state.characters.map((c) => c.id),
      n,
    );
    const extent = Sk.extentOf(cast);
    const inGap = extent && slot > extent[0] && slot < extent[1];
    const speedWords = (maxRegen) => (maxRegen === 2 ? "drawn slowly: up to 2 retries" : "drawn fast: up to 1 retry");
    if (!multi) {
      const f = cast[slot].characters[0];
      if (f.sketched) lines.push(`Sketched fortune ${f.fortune.toFixed(2)} ± ${f.halfWidth.toFixed(2)} (${speedWords(f.maxRegen)})`);
      else if (inGap) lines.push("Line erased here: written without a fortune target");
      else lines.push("Not sketched");
      return lines.join("<br>");
    }
    const names = labels(state.characters);
    state.characters.forEach((c, k) => {
      const f = cast[slot].characters[k];
      const v = s.fortunes[c.id];
      const parts = [];
      if (s.text.trim()) parts.push(isRating(v) ? `rated ${v.toFixed(2)}` : v === ABSENT ? "not in this sentence" : "not rated yet");
      parts.push(f.sketched ? `sketched ${f.fortune.toFixed(2)} ± ${f.halfWidth.toFixed(2)}` : "no line here");
      const swatch = `<span class="tip-swatch" style="background:${PALETTE[c.color].line}"></span>`;
      lines.push(`${swatch}${escapeHtml(names[k])}: ${parts.join(" · ")}`);
    });
    if (cast[slot].sketched) lines.push(`${speedWords(cast[slot].maxRegen)} (the slowest stroke over this sentence counts)`);
    else if (inGap) lines.push("No line here: written without fortune targets");
    return lines.join("<br>");
  }

  /** Tooltip lines for one column of the relationship canvas: every pair's rating and line. */
  relationTip(slot, lines) {
    const s = state.sentences[slot];
    const all = pairs();
    const cast = Sk.castSlots(state.sketch, [], state.sentences.length, all.map((p) => p.key));
    all.forEach((p, k) => {
      const f = cast[slot].relations[k];
      const v = s.relations[p.key];
      const parts = [];
      if (s.text.trim()) {
        parts.push(isRating(v) ? `rated ${v.toFixed(2)} (${relationWords(v)})` : v === ABSENT ? "do not deal with each other here" : "not rated yet");
      }
      parts.push(f.sketched ? `sketched ${f.fortune.toFixed(2)} ± ${f.halfWidth.toFixed(2)}` : "no line here");
      lines.push(`${escapeHtml(pairLabel(state.characters, p.key))}: ${parts.join(" · ")}`);
    });
    return lines.join("<br>");
  }

  // ---------------------------------------------------------------- rendering

  render() {
    if (!this.W && !this.layout()) return;
    const multi = isMulti();
    this.renderBackground();
    this.renderGrid();
    if (this.kind === "fortune") {
      this.renderHistory();
      this.renderArc();
    } else if (this.kind === "relation") {
      this.renderRelationArc();
    }
    this.renderSketch();
    this.wrap.classList.toggle("busy", state.ui.generating);
    this.wrap.classList.toggle("erasing", state.tool === "eraser");
    this.wrap.classList.toggle("locked", !!state.ui.previewId);
    this.wrap.classList.toggle("multi", multi);
    if (this.hint && this.kind === "relation") {
      const pair = activePair();
      this.hint.hidden = !pair || Sk.hasSamples(state.sketch.relations?.[pair.key] || []) || state.ui.generating;
      if (pair) {
        const name = escapeHtml(pairLabel(state.characters, pair.key).replace(" & ", " and "));
        this.hint.innerHTML = `Sketch how ${name} get along over the story: harmony at the top, conflict at the bottom.`;
      }
    } else if (this.hint) {
      const active = activeCharacter();
      const name = escapeHtml(labelOf(active.id));
      const relationLines = relationsOn() && Sk.anyRelation(state.sketch, pairs().map((p) => p.key));
      this.hint.hidden = Sk.hasSamples(state.sketch.fortunes[active.id] || []) || relationLines || state.ui.generating;
      this.hint.innerHTML = multi
        ? `Sketch how ${name}'s fortune changes over the story. Higher is better.<br>` +
          "Each character has its own line. Choose whose line to draw above the canvas, then press Generate."
        : `Sketch how ${name}'s fortune changes over the story. Higher is better.<br>` +
          "Draw slowly where the sentences should follow your line closely.";
    }
  }

  renderBackground() {
    const { l, t } = this.pad;
    const w = this.plotW;
    let html = "";
    if (this.kind === "fortune" || this.kind === "relation") {
      for (const b of this.kind === "fortune" ? BANDS : RELATION_BANDS) {
        const y0 = this.yOf(b.to);
        const y1 = this.yOf(b.from);
        html += `<rect x="${l}" y="${r1(y0)}" width="${r1(w)}" height="${r1(y1 - y0)}" fill="${b.canvas || b.fill}"/>`;
      }
    } else {
      html += `<rect x="${l}" y="${t}" width="${r1(w)}" height="${r1(this.plotH)}" fill="#ffffff"/>`;
    }
    const ym = r1(this.yOf(0.5));
    html += `<line class="mid-line" x1="${l}" x2="${r1(l + w)}" y1="${ym}" y2="${ym}"/>`;
    if (this.kind === "surprise") {
      html += `<text class="surprise-label high" transform="translate(${l + 13} ${r1(this.yOf(0.75))}) rotate(-90)">High Surprise</text>`;
      html += `<text class="surprise-label low" transform="translate(${l + 13} ${r1(this.yOf(0.25))}) rotate(-90)">Low Surprise</text>`;
    }
    if (this.kind === "relation") {
      html += `<text class="relation-label harmony" transform="translate(${l + 13} ${r1(this.yOf(0.82))}) rotate(-90)">Harmony</text>`;
      html += `<text class="relation-label conflict" transform="translate(${l + 13} ${r1(this.yOf(0.18))}) rotate(-90)">Conflict</text>`;
    }
    this.layers.bg.innerHTML = html;
  }

  renderGrid() {
    const n = state.sentences.length;
    const { t } = this.pad;
    const h = r1(this.plotH);
    const sw = r1(this.slotW);
    let html = "";
    if (state.ui.generating) {
      for (const i of state.ui.targets) html += `<rect class="target-col" x="${r1(this.xOf(i))}" y="${t}" width="${sw}" height="${h}"/>`;
    }
    const link = state.ui.linkSlot ?? state.ui.focusSlot;
    if (link !== null && link < n) {
      html += `<rect class="link-col" x="${r1(this.xOf(link))}" y="${t}" width="${sw}" height="${h}"/>`;
    }
    for (let i = 1; i < n; i++) {
      const x = r1(this.xOf(i));
      html += `<line class="slot-line" x1="${x}" x2="${x}" y1="${t}" y2="${r1(t + this.plotH)}"/>`;
    }
    this.layers.grid.innerHTML = html;
  }

  /** The envelope (hatched band) and its centre line for one line's samples. */
  envelopeHtml(arr, style = "") {
    const X = (j) => r1(this.xOf((j + 0.5) / S));
    let html = "";
    for (const [a, b] of Sk.runsOf(arr)) {
      const f = Sk.smoothRun(arr, a, b, 1, (v) => v[0]);
      const hw = Sk.smoothRun(arr, a, b, 5, (v) => v[1]); // the width changes gradually on screen
      const xs = [];
      for (let j = a; j <= b; j++) xs.push(X(j));
      const upper = xs.map((x, k) => `${x},${r1(this.yOf(Math.min(1, f[k] + hw[k])))}`);
      const lower = xs.map((x, k) => `${x},${r1(this.yOf(Math.max(0, f[k] - hw[k])))}`).reverse();
      html += `<path class="envelope"${style} d="M${upper.join("L")}L${lower.join("L")}Z"/>`;
      html += `<path class="envelope-center" d="M${xs.map((x, k) => `${x},${r1(this.yOf(f[k]))}`).join("L")}"/>`;
    }
    return html;
  }

  renderSketch() {
    if (this.kind === "relation") {
      const active = activePair()?.key;
      const keys = pairs().map((p) => p.key);
      let html = "";
      for (const key of [...keys.filter((k) => k !== active), ...keys.filter((k) => k === active)]) {
        const body = this.envelopeHtml(state.sketch.relations?.[key] || [], ' style="fill:url(#tb-hatch-rel)"');
        html += `<g class="pair-line${key === active ? " active" : ""}">${body}</g>`;
      }
      this.layers.sketch.innerHTML = html;
      return;
    }
    if (this.kind !== "fortune") {
      const arr = state.sketch.surprise;
      const X = (j) => r1(this.xOf((j + 0.5) / S));
      let html = "";
      for (const [a, b] of Sk.runsOf(arr)) {
        const v = Sk.smoothRun(arr, a, b, 1, (x) => x);
        html +=
          a === b
            ? `<circle class="surprise-dot" cx="${X(a)}" cy="${r1(this.yOf(v[0]))}" r="2"/>`
            : `<path class="surprise-line" d="M${v.map((y, k) => `${X(a + k)},${r1(this.yOf(y))}`).join("L")}"/>`;
      }
      this.layers.sketch.innerHTML = html;
      return;
    }
    if (!isMulti()) {
      this.layers.sketch.innerHTML = this.envelopeHtml(state.sketch.fortunes[state.characters[0].id] || []);
      return;
    }
    const active = activeCharacter().id;
    let html = "";
    for (const c of drawingOrder()) {
      const style = ` style="fill:url(#tb-hatch-${c.color})"`;
      const body = this.envelopeHtml(state.sketch.fortunes[c.id] || [], style);
      html += `<g class="char-line${c.id === active ? " active" : ""}" style="--c:${PALETTE[c.color].line}">${body}</g>`;
    }
    this.layers.sketch.innerHTML = html;
  }

  /** Dots and lines for a list of {x, y} points (null = gap). */
  arcHtml(points, segClass, dotClass, radius) {
    let html = "";
    let run = [];
    const flush = () => {
      if (run.length > 1) {
        const pieces = run;
        monotoneSegments(pieces).forEach((d, k) => {
          html += `<path class="${segClass(pieces[k + 1])}" d="${d}"/>`;
        });
      }
      run = [];
    };
    points.forEach((p) => (p ? run.push(p) : flush()));
    flush();
    points.forEach((p) => {
      if (p) html += `<circle class="${dotClass(p)}" cx="${r1(p.x)}" cy="${r1(p.y)}" r="${radius}"/>`;
    });
    return html;
  }

  /**
   * One character's recognized fortune as points. A blank or unrated sentence is a gap (null).
   * A sentence that does not involve the character has no point; the next point is marked
   * `skipped`, so the segment leading to it is drawn dashed.
   */
  characterPoints(c, k, keys, targets) {
    return this.ratingPoints(
      (s) => s.fortunes[c.id],
      (s, i) => s.keys[c.id] !== keys[i][k],
      targets,
    );
  }

  /** Points for any per-sentence rating: valueOf(s) gives the rating, outdated(s, i) says it is out of date. */
  ratingPoints(valueOf, outdated, targets) {
    const points = [];
    let skipped = false;
    state.sentences.forEach((s, i) => {
      const v = valueOf(s);
      if (!s.text.trim() || (!isRating(v) && v !== ABSENT)) {
        points.push(null);
        skipped = false;
        return;
      }
      if (v === ABSENT) {
        skipped = true;
        return;
      }
      const stale = !s.draft && !targets.has(i) && outdated(s, i);
      points.push({ x: this.xOf(i + 0.5), y: this.yOf(v), gen: s.source === "generated", draft: s.draft, stale, skipped });
      skipped = false;
    });
    return points;
  }

  renderArc() {
    const targets = new Set(state.ui.generating ? state.ui.targets : []);
    const names = modelNames(state.characters);
    const keys = state.sentences.map((s, i) => (s.text.trim() ? ratingKeys(state.characters, state.sentences, i, names) : []));
    const multi = isMulti();
    const active = activeCharacter().id;
    let html = "";
    for (const c of drawingOrder()) {
      const k = state.characters.indexOf(c);
      const part = this.arcHtml(
        this.characterPoints(c, k, keys, targets),
        (p) => `arc-seg ${p.gen ? "gen" : "user"}${p.skipped ? " skipped" : ""}`,
        (p) => `dot ${p.gen ? "gen" : "user"}${p.draft ? " draft" : ""}${p.stale ? " stale" : ""}`,
        4.2,
      );
      html += multi ? `<g class="char-arc${c.id === active ? " active" : ""}" style="--c:${PALETTE[c.color].line}">${part}</g>` : part;
    }
    state.sentences.forEach((s, i) => {
      const v = s.fortunes[active];
      if (s.text.trim() && s.pending && !isRating(v) && v !== ABSENT) {
        html += `<circle class="dot waiting" cx="${r1(this.xOf(i + 0.5))}" cy="${r1(this.yOf(0.5))}" r="4.2"/>`;
      }
    });
    this.layers.arc.innerHTML = html;
    this.layers.arc.classList.toggle("dimmed", !!state.ui.previewId);
  }

  /** Remix: each pair's rated relationship, the selected pair on top; dotted where the two do not meet. */
  renderRelationArc() {
    const targets = new Set(state.ui.generating ? state.ui.targets : []);
    const all = pairs();
    const names = modelNames(state.characters);
    const keys = state.sentences.map((s, i) => (s.text.trim() ? relationKeys(all, names, state.sentences, i) : []));
    const active = activePair()?.key;
    let html = "";
    for (const p of [...all.filter((x) => x.key !== active), ...all.filter((x) => x.key === active)]) {
      const k = all.indexOf(p);
      const points = this.ratingPoints(
        (s) => s.relations[p.key],
        (s, i) => s.relationKeys[p.key] !== keys[i][k],
        targets,
      );
      const part = this.arcHtml(
        points,
        (q) => `arc-seg ${q.gen ? "gen" : "user"}${q.skipped ? " skipped" : ""}`,
        (q) => `dot ${q.gen ? "gen" : "user"}${q.draft ? " draft" : ""}${q.stale ? " stale" : ""}`,
        4.2,
      );
      html += `<g class="pair-arc${p.key === active ? " active" : ""}">${part}</g>`;
    }
    state.sentences.forEach((s, i) => {
      const v = active ? s.relations[active] : undefined;
      if (s.text.trim() && s.pending && !isRating(v) && v !== ABSENT) {
        html += `<circle class="dot waiting" cx="${r1(this.xOf(i + 0.5))}" cy="${r1(this.yOf(0.5))}" r="4.2"/>`;
      }
    });
    this.layers.arc.innerHTML = html;
    this.layers.arc.classList.toggle("dimmed", !!state.ui.previewId);
  }

  /**
   * Stored stories, drawn faintly while the History dropdown is open. Each story shows the
   * selected character's line (matched by id; stories without that character are left out).
   * The story under the mouse shows every one of its characters, in their colours.
   */
  renderHistory() {
    if (!state.ui.historyOpen || !state.history.length) {
      this.layers.history.innerHTML = "";
      return;
    }
    const active = activeCharacter().id;
    let html = "";
    let hot = "";
    for (const h of state.history) {
      const n = h.sentences.length;
      if (!n) continue;
      const isHot = h.id === state.ui.previewId;
      const pointsOf = (id) =>
        h.sentences.map((s, i) =>
          s.text.trim() && isRating(s.fortunes?.[id]) ? { x: this.pad.l + ((i + 0.5) * this.plotW) / n, y: this.yOf(s.fortunes[id]) } : null,
        );
      if (isHot && h.characters.length > 1) {
        for (const c of h.characters) {
          const part = this.arcHtml(pointsOf(c.id), () => "hist-arc hot", () => "hist-dot hot", 3.8);
          hot += `<g class="hist-char" style="--c:${PALETTE[c.color].line}">${part}</g>`;
        }
        continue;
      }
      const c = h.characters.find((x) => x.id === active);
      if (!c) continue;
      const part = this.arcHtml(
        pointsOf(c.id),
        () => `hist-arc${isHot ? " hot" : ""}`,
        () => `hist-dot${isHot ? " hot" : ""}`,
        isHot ? 3.8 : 2.6,
      );
      if (isHot) hot = part;
      else html += part;
    }
    this.layers.history.innerHTML = html + hot;
  }

  renderCursor(p) {
    const show = !!p && state.tool === "eraser" && !this.locked();
    this.cursor.setAttribute("visibility", show ? "visible" : "hidden");
    if (show) {
      this.cursor.setAttribute("cx", r1(p.x));
      this.cursor.setAttribute("cy", r1(p.y));
    }
  }
}
