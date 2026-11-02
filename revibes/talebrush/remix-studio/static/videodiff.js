"use strict";
/* VideoDiff (CHI 2025) remixed into TaleBrush: compare, edit and recombine story variants.
 *
 *  - Alignment: every variant is laid out on the same sentence slots, like
 *    VideoDiff aligning rough cuts to the source footage. Rows are variants,
 *    columns are slots; differences from your current story are highlighted.
 *  - Timeline: each row has a mini fortune arc against your sketch (TaleBrush).
 *  - "Changed sentences / Whole story" toggles between the rewritten slots and
 *    the full story in context (VideoDiff's edited vs source timelines).
 *  - Organize: sort (fit to arc, length, most changed, newest), pin, archive.
 *  - Customize: edit a variant with a prompt (the result appears right below it,
 *    with a summary of the change), recombine variants by #id, or "Surprise me".
 */

const V = () => (state.studio.vd ||= { sort: "default", whole: false });
let vdBusy = false;

function ensureSpace() {
  if (Luminate.space()) return Luminate.space();
  const l = L(), slots = variantSlots();
  if (!slots.length) return null;
  const sp = { id: Date.now(), num: l.spaces.length + 1, prompt: "compare", dims: [], variants: [], slots,
    targets: slotTargets(slots), base: state.lines.map((x) => x.text) };
  l.spaces.push(sp);
  l.current = sp.id;
  return sp;
}

const words = (v) => Luminate.variantText(v).split(/\s+/).filter(Boolean).length;
const changedCount = (v) => v.slots.filter((i) => (v.sentences[i] || "") !== (state.lines[i] ? state.lines[i].text : "")).length;

function ordered(list) {
  const { sort } = V();
  let out;
  if (sort === "default") {
    // Creation order, with each edit placed right below the variant it came from.
    const byParent = {};
    list.forEach((v) => { (byParent[v.parent && list.some((p) => p.id === v.parent) ? v.parent : "root"] ||= []).push(v); });
    out = [];
    const walk = (v) => { out.push(v); (byParent[v.id] || []).forEach(walk); };
    (byParent.root || []).forEach(walk);
  } else {
    const key = {
      fit: (v) => Luminate.variantFit(v) ?? 9,
      length: (v) => words(v),
      changed: (v) => -changedCount(v),
      newest: (v) => -v.created,
    }[sort];
    out = list.slice().sort((a, b) => key(a) - key(b));
  }
  return [...out.filter((v) => v.pinned && !v.archived), ...out.filter((v) => !v.pinned && !v.archived), ...out.filter((v) => v.archived)];
}

async function promptVariant(mode, instruction, base) {
  if (vdBusy) return;
  if (!state.protagonist.trim()) { setStatus("First enter the protagonist's name.", "error"); return; }
  const sp = ensureSpace();
  if (!sp) { setStatus("Every sentence is your own; there is nothing to vary.", "error"); return; }
  let refs = [];
  if (mode === "edit") refs = [base];
  else {
    const ids = [...instruction.matchAll(/#(\d+)/g)].map((m) => +m[1]);
    refs = sp.variants.filter((v) => ids.includes(v.id));
    if (mode === "prompt") mode = refs.length ? "recombine" : "surprise";
    if (!refs.length) refs = sp.variants.slice(-8);
  }
  vdBusy = true;
  renderVideoDiff();
  setStatus(mode === "edit" ? `Editing #${base.id}…` : mode === "recombine" ? "Recombining variants…" : "Generating a new variant…", "busy");
  try {
    const data = await postJSON("/api/videodiff/prompt", {
      protagonist: state.protagonist.trim(), sentences: sp.base, slots: sp.slots, targets: sp.targets,
      mode, instruction, base_id: base ? base.id : null,
      variants: refs.map((v) => ({ id: v.id, title: v.title, sentences: Object.fromEntries(Object.entries(v.sentences).map(([k, s]) => [String(k), s])) })),
    });
    const nv = Luminate.newVariant(sp, data, mode, {
      change: data.change, parent: base ? base.id : null, requirements: base ? { ...base.requirements } : {},
      pinned: mode !== "edit",   // VideoDiff pins new generations; edits sit under their original
      prompt: instruction,
    });
    setStatus(`#${nv.id}: ${data.change || "new variant"}`);
  } catch (e) {
    setStatus("Could not generate the variant: " + e.message, "error");
  } finally {
    vdBusy = false;
    renderVideoDiff();
    Luminate.render();
  }
}

/* ---------- rendering ---------- */

function renderVideoDiff() {
  const pane = $("#vdPane");
  if (!pane) return;
  const vd = V(), sp = Luminate.space();
  const list = sp ? ordered(sp.variants) : [];
  pane.innerHTML = `
    <div class="vd-bar">
      <label>Sort <select id="vdSort">
        ${[["default", "Default"], ["fit", "Fit to your arc"], ["length", "Length"], ["changed", "Most changed"], ["newest", "Newest"]]
          .map(([k, n]) => `<option value="${k}" ${vd.sort === k ? "selected" : ""}>${n}</option>`).join("")}
      </select></label>
      <span class="seg"><button data-w="0" class="${vd.whole ? "" : "on"}">Changed sentences</button><button data-w="1" class="${vd.whole ? "on" : ""}">Whole story</button></span>
    </div>
    <div class="vd-prompt">
      <input id="vdPrompt" placeholder="New variant: “the opening of #2 with the ending of #5”, or “make the helper a robot”">
      <button id="vdGo" class="primary vd" ${vdBusy ? "disabled" : ""}>Generate</button>
      <button id="vdSurprise" ${vdBusy ? "disabled" : ""}>Surprise me</button>
    </div>
    <div class="vd-table-wrap"><table class="vd-table"></table></div>`;
  $("#vdSort").onchange = (e) => { vd.sort = e.target.value; save(); renderVideoDiff(); };
  pane.querySelectorAll(".seg button").forEach((b) => { b.onclick = () => { vd.whole = b.dataset.w === "1"; save(); renderVideoDiff(); }; });
  const run = () => { const t = $("#vdPrompt").value.trim(); if (t) promptVariant("prompt", t); };
  $("#vdGo").onclick = run;
  $("#vdPrompt").onkeydown = (e) => { if (e.key === "Enter") run(); };
  $("#vdSurprise").onclick = () => promptVariant("surprise", "");
  const table = pane.querySelector(".vd-table");
  if (!list.length) {
    pane.querySelector(".vd-table-wrap").innerHTML = `<div class="lum-empty">No variants to compare yet. Generate a design space (Luminate tab),
      or press <b>Surprise me</b> to make one here.</div>`;
    return;
  }
  const cols = vd.whole ? state.lines.map((_, i) => i) : sp.slots;
  const head = document.createElement("tr");
  head.innerHTML = `<th class="vh">Variant</th><th class="vh">Arc</th>` + cols.map((i) => `<th data-c="${i}">S${i + 1}</th>`).join("");
  table.append(head);
  table.append(row(null, cols, sp));
  list.forEach((v) => table.append(row(v, cols, sp)));
  // Hovering a column highlights the same sentence across every variant (aligned comparison).
  table.addEventListener("mouseover", (e) => {
    const c = e.target.closest("[data-c]");
    table.querySelectorAll(".colhl").forEach((n) => n.classList.remove("colhl"));
    if (c) table.querySelectorAll(`[data-c="${c.dataset.c}"]`).forEach((n) => n.classList.add("colhl"));
  });
}

function row(v, cols, sp) {
  const tr = document.createElement("tr");
  const cur = (i) => (state.lines[i] ? state.lines[i].text : "");
  if (!v) {
    tr.className = "current";
    tr.innerHTML = `<td class="vhead"><b>Your story</b><div class="ex-hint">current text</div></td><td class="varc"></td>`;
    tr.children[1].append(miniArc(null, sp));
    cols.forEach((i) => tr.append(textCell(cur(i), "ctx", i)));
    return tr;
  }
  tr.className = (v.pinned ? "pinned " : "") + (v.archived ? "archived " : "") + (v.parent ? "child" : "");
  const fit = Luminate.variantFit(v);
  const origin = { luminate: "Luminate", edit: "edit", recombine: "recombine", surprise: "surprise me" }[v.origin] || v.origin;
  const head = document.createElement("td");
  head.className = "vhead";
  head.innerHTML = `<div><b>#${v.id}</b> <span class="vtitle"></span> <span class="otag">${origin}</span></div>
    ${v.change ? `<div class="change"></div>` : ""}
    <div class="vmeta">${fit != null ? `fit ${(1 - fit).toFixed(2)} · ` : ""}${words(v)} words · ${changedCount(v)} changed</div>
    <div class="vact">
      <button class="bm" title="Bookmark (shared with the Design space)">${v.bookmarked ? "★" : "☆"}</button>
      <button class="pin ${v.pinned ? "on" : ""}" title="${v.pinned ? "Unpin" : "Pin to top"}">📌</button>
      <button class="arch" title="${v.archived ? "Restore" : "Archive to the bottom"}">${v.archived ? "↥" : "🗄"}</button>
      <button class="edit" title="Edit with a prompt">✎ Edit</button>
      <button class="use primary vd" title="Put this variant into the editor">Use</button>
    </div>`;
  head.querySelector(".vtitle").textContent = v.title;
  if (v.change) head.querySelector(".change").textContent = "↳ " + v.change;
  head.querySelector(".bm").onclick = () => { v.bookmarked = !v.bookmarked; save(); renderVideoDiff(); Luminate.render(); };
  head.querySelector(".pin").onclick = () => { v.pinned = !v.pinned; save(); renderVideoDiff(); };
  head.querySelector(".arch").onclick = () => { v.archived = !v.archived; if (v.archived) v.pinned = false; save(); renderVideoDiff(); };
  head.querySelector(".use").onclick = () => { L().selected = v.id; applyVariant(v, `Variant #${v.id}`); setStatus(`Variant #${v.id} is in the editor (yellow).`); };
  head.querySelector(".edit").onclick = () => {
    const box = document.createElement("div");
    box.className = "vd-edit";
    box.innerHTML = `<input placeholder="e.g., shorten the ending, or make sentence 4 funnier">`;
    head.append(box);
    const input = box.querySelector("input");
    input.focus();
    input.onkeydown = (e) => {
      if (e.key === "Enter" && input.value.trim()) promptVariant("edit", input.value.trim(), v);
      if (e.key === "Escape") box.remove();
    };
  };
  tr.append(head);
  const arc = document.createElement("td");
  arc.className = "varc";
  arc.append(miniArc(v, sp));
  tr.append(arc);
  cols.forEach((i) => {
    const inSlot = v.slots.includes(i);
    const text = inSlot ? v.sentences[i] || "" : cur(i);
    const td = textCell(text, inSlot ? (text === cur(i) ? "same" : "diff") : "ctx", i, inSlot ? v.keywords : null);
    if (inSlot && text && text !== cur(i)) {
      const b = document.createElement("button");
      b.className = "usecell";
      b.textContent = "use";
      b.title = `Put just this sentence into slot ${i + 1}`;
      b.onclick = () => applyVariant(v, `Sentence ${i + 1} from #${v.id}`, i);
      td.append(b);
    }
    tr.append(td);
  });
  return tr;
}

// Visually bold the variant's keywords in its sentences (VideoDiff bolds concrete keywords).
function textCell(text, cls, i, keywords) {
  const td = document.createElement("td");
  td.className = "tc " + cls;
  td.dataset.c = i;
  let html = esc(text || "—");
  for (const k of keywords || []) {
    for (const w of String(k).split(/\s+/).filter((x) => x.length > 3)) {
      html = html.replace(new RegExp(`\\b(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "gi"), "<b>$1</b>");
    }
  }
  td.innerHTML = `<div class="tct">${html}</div>`;
  td.title = text;
  return td;
}

// The variant's fortune arc on the whole story, over your sketch (TaleBrush).
function miniArc(v, sp) {
  const W = 150, H = 46, n = state.lines.length || 1;
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.setAttribute("class", "mini");
  const x = (i) => ((i + 0.5) / n) * W, y = (f) => 4 + (1 - f) * (H - 8);
  svgEl("rect", { x: 0, y: 0, width: W, height: H, rx: 5, fill: "#fbfaf7" }, svg);
  svgEl("line", { x1: 0, x2: W, y1: y(0.5), y2: y(0.5), stroke: "#e2e0da" }, svg);
  const env = [];
  for (let i = 0; i < n; i++) { const c = center(state.sketch, i); if (c) env.push([x(i), c]); }
  if (env.length > 1) {
    const pts = env.map(([px, c]) => `${px},${y(Math.min(1, c.y + c.w))}`).concat(env.slice().reverse().map(([px, c]) => `${px},${y(Math.max(0, c.y - c.w))}`));
    svgEl("polygon", { points: pts.join(" "), fill: "#86d6a0", opacity: 0.35 }, svg);
  }
  const f = (i) => (v && v.slots.includes(i) ? v.fortunes[i] : state.lines[i] && hasText(state.lines[i]) ? state.lines[i].fortune : null);
  let d = "", pen = false;
  for (let i = 0; i < n; i++) {
    const val = f(i);
    if (val == null) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(val).toFixed(1)} `;
    pen = true;
  }
  svgEl("path", { d, fill: "none", stroke: v ? "#3d8ee8" : "#8f8f8f", "stroke-width": 1.8 }, svg);
  return svg;
}

window.VideoDiff = { render: renderVideoDiff };
hooks.render.push(renderVideoDiff);
