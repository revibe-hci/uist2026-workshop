"use strict";
/* Luminate (Suh et al., CHI 2024) remixed into TaleBrush: a design space of story variants.
 *
 *  - Dimension generation: the LLM proposes dimensions (e.g., Helper, Setting)
 *    with values, for how the unwritten part of the story could vary.
 *  - Dimension-guided generation: each variant gets a requirement list (one
 *    random value per dimension) and rewrites the same slots, following the
 *    TaleBrush sketch as fortune targets.
 *  - Exploration view: arrange variants by up to two dimensions -- or by
 *    TaleBrush fortune ("Fit to your arc", "Ending fortune") -- with semantic
 *    zoom, search, filters, bookmarks, "more like this", "more in this
 *    subspace", user-added dimensions, and switching between spaces.
 *  - Clicking a variant puts it into the editor, highlighted in yellow until edited.
 */

const L = () => (state.studio.lum ||= {
  spaces: [], current: null, nextNum: 1, x: "", y: "", zoom: "title", search: "",
  filters: {}, bookmarkedOnly: false, selected: null, count: 6,
});
const ZOOMS = [["dot", "●", "Dots"], ["title", "T", "Titles"], ["keywords", "K", "Keywords"], ["summary", "S", "Summaries"], ["full", "F", "Full text"]];
const FIT_BINS = ["Close fit", "Good fit", "Loose fit", "Off the arc"];
const END_BINS = ["Very bad", "Bad", "Neutral", "Good", "Very good"];
let lumBusy = null; // AbortController while generating

const space = () => { const l = L(); return l.spaces.find((s) => s.id === l.current) || null; };
const variants = () => (space() ? space().variants : []);

// Mean distance between a variant's recognized fortunes and the sketch targets.
function variantFit(v) {
  const errs = Object.entries(v.targets || {}).filter(([k, t]) => t != null && v.fortunes[k] != null)
    .map(([k, t]) => Math.abs(v.fortunes[k] - t));
  return errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : null;
}
const variantText = (v) => v.slots.map((i) => v.sentences[i] || "").filter(Boolean).join(" ");

function axisValue(v, axis) {
  if (axis === "__fit") {
    const f = variantFit(v);
    return f == null ? "No sketch" : FIT_BINS[f < 0.1 ? 0 : f < 0.2 ? 1 : f < 0.3 ? 2 : 3];
  }
  if (axis === "__end") {
    const last = Math.max(...v.slots.filter((i) => v.fortunes[i] != null));
    const f = v.fortunes[last];
    return f == null ? "—" : END_BINS[Math.min(4, Math.floor(f * 5))];
  }
  return (v.requirements || {})[axis] || "—";
}
function axisValues(axis) {
  if (!axis) return [""];
  if (axis === "__fit") return [...FIT_BINS, "No sketch"].filter((b) => b !== "No sketch" || variants().some((v) => axisValue(v, axis) === b));
  if (axis === "__end") return END_BINS.slice().reverse();
  const d = space().dims.find((x) => x.name === axis);
  const vals = d ? d.values.slice() : [];
  if (variants().some((v) => !vals.includes(axisValue(v, axis)))) vals.push("—");
  return vals;
}

function matches(v) {
  const l = L();
  if (l.bookmarkedOnly && !v.bookmarked) return false;
  for (const [dim, val] of Object.entries(l.filters)) if ((v.requirements || {})[dim] !== val) return false;
  const q = l.search.trim().toLowerCase();
  if (q && !(v.title + " " + v.summary + " " + variantText(v) + " " + (v.keywords || []).join(" ")).toLowerCase().includes(q)) return false;
  return true;
}

/* ---------- generation ---------- */

function newVariant(sp, v, origin, extra = {}) {
  const l = L();
  const nv = {
    ...v, id: l.nextNum++, origin, spaceId: sp.id, slots: sp.slots, targets: sp.targets, base: sp.base,
    bookmarked: false, pinned: false, archived: false, created: Date.now(), ...extra,
  };
  nv.sentences = Object.fromEntries(Object.entries(nv.sentences).map(([k, s]) => [+k, s]));
  nv.fortunes = Object.fromEntries(Object.entries(nv.fortunes || {}).map(([k, f]) => [+k, f]));
  sp.variants.push(nv);
  save();
  return nv;
}

async function generateSpace(prompt) {
  if (lumBusy) return;
  if (!state.protagonist.trim()) { setStatus("First enter the protagonist's name.", "error"); $("#protagonist").focus(); return; }
  const slots = variantSlots();
  if (!slots.length) { setStatus("Every sentence is your own; add an empty bullet or sketch over AI sentences to explore.", "error"); return; }
  const l = L();
  const sp = {
    id: Date.now(), num: l.spaces.length + 1, prompt, dims: [], variants: [], slots,
    targets: slotTargets(slots), base: state.lines.map((x) => x.text),
  };
  l.spaces.push(sp);
  Object.assign(l, { current: sp.id, x: "", y: "", filters: {}, search: "", bookmarkedOnly: false });
  lumBusy = new AbortController();
  renderLuminate();
  try {
    setStatus("Generating dimensions of the design space…", "busy");
    sp.dims = (await postJSON("/api/luminate/dimensions", {
      protagonist: state.protagonist.trim(), sentences: sp.base, prompt, n: 5,
    })).dimensions;
    save();
    renderLuminate();
    await streamVariants(sp, l.count, {}, prompt);
  } catch (e) {
    if (e.name !== "AbortError") setStatus("Design space failed: " + e.message, "error");
  } finally {
    lumBusy = null;
    renderLuminate();
    window.VideoDiff?.render();
  }
}

async function streamVariants(sp, count, fixed, prompt) {
  let made = 0;
  setStatus(`Writing ${count} variants (${2 * count} model calls, up to 4 at a time)…`, "busy");
  await postStream("/api/luminate/variants", {
    protagonist: state.protagonist.trim(), sentences: sp.base, slots: sp.slots, targets: sp.targets,
    dimensions: sp.dims, count, fixed, prompt: prompt ?? sp.prompt,
  }, (ev) => {
    if (ev.type === "variant") {
      newVariant(sp, ev.variant, "luminate");
      made++;
      setStatus(`Writing variants… ${made} of ${count} ready.`, "busy");
      renderLuminate();
      window.VideoDiff?.render();
    } else if (ev.type === "error") setStatus(ev.message, "error");
  }, lumBusy && lumBusy.signal);
  setStatus(`${made} variants in design space #${sp.num}. Arrange them by a dimension, zoom in, and click one to use it.`);
}

async function moreLike(fixed, count, label) {
  if (lumBusy) return;
  const sp = space();
  lumBusy = new AbortController();
  renderLuminate();
  try {
    setStatus(label, "busy");
    await streamVariants(sp, count, fixed);
  } catch (e) {
    if (e.name !== "AbortError") setStatus("Generation failed: " + e.message, "error");
  } finally {
    lumBusy = null;
    renderLuminate();
    window.VideoDiff?.render();
  }
}

async function addDimension(name) {
  const sp = space();
  if (!sp || !name.trim() || lumBusy) return;
  lumBusy = new AbortController();
  renderLuminate();
  setStatus(`Adding the dimension “${name}”…`, "busy");
  try {
    const data = await postJSON("/api/luminate/add-dimension", {
      protagonist: state.protagonist.trim(), name: name.trim(),
      variants: sp.variants.map((v) => ({ id: v.id, title: v.title, text: variantText(v) })),
    });
    sp.dims.push(data.dimension);
    sp.variants.forEach((v) => { if (data.assign[String(v.id)]) v.requirements = { ...v.requirements, [data.dimension.name]: data.assign[String(v.id)] }; });
    L().x = data.dimension.name;
    setStatus(`Added “${data.dimension.name}” and placed every variant along it.`);
    save();
  } catch (e) {
    setStatus("Could not add the dimension: " + e.message, "error");
  } finally {
    lumBusy = null;
    renderLuminate();
  }
}

/* ---------- rendering ---------- */

function renderLuminate() {
  const pane = $("#lumPane");
  if (!pane) return;
  const l = L(), sp = space();
  const slots = sp ? sp.slots : variantSlots();
  const range1 = slots.length ? `${slots[0] + 1}–${slots[slots.length - 1] + 1}` : "—";
  pane.innerHTML = `
    <div class="lum-bar">
      <input id="lumPrompt" placeholder="What to explore? e.g., different endings (optional)" value="${esc(l.draft || "")}">
      <select id="lumCount" title="Variants per design space">${[4, 6, 8].map((n) => `<option ${n === l.count ? "selected" : ""}>${n}</option>`).join("")}</select>
      ${lumBusy ? '<button id="lumStop" class="stopbtn">Stop</button>' : '<button id="lumGo" class="primary lum">Generate design space</button>'}
    </div>
    <p class="ex-hint">Rewrites sentences ${range1} in ${l.count} different ways (≈ ${1 + 2 * l.count} model calls), following your fortune sketch where there is one.</p>
    ${l.spaces.length ? `<div class="lum-spaces">Space <select id="lumSpace">${l.spaces.map((s) => `<option value="${s.id}" ${s.id === l.current ? "selected" : ""}>#${s.num} ${esc(s.prompt || "open exploration")} (${s.variants.length})</option>`).join("")}</select></div>` : ""}
    <div id="lumDims" class="lum-dims"></div>
    <div class="lum-controls"></div>
    <div id="lumSpaceView" class="lum-space"></div>`;
  $("#lumPrompt").oninput = (e) => { l.draft = e.target.value; };
  $("#lumCount").onchange = (e) => { l.count = +e.target.value; save(); renderLuminate(); };
  const go = $("#lumGo");
  if (go) go.onclick = () => generateSpace($("#lumPrompt").value.trim());
  const stop = $("#lumStop");
  if (stop) stop.onclick = () => lumBusy && lumBusy.abort();
  const sel = $("#lumSpace");
  if (sel) sel.onchange = (e) => { Object.assign(l, { current: +e.target.value, x: "", y: "", filters: {} }); save(); renderLuminate(); window.VideoDiff?.render(); };
  if (!sp) {
    $("#lumSpaceView").innerHTML = `<div class="lum-empty">No design space yet. Generate one to see many versions of your story at once,
      organized by dimensions the AI finds relevant.</div>`;
    return;
  }
  renderDims(sp);
  renderLumControls(sp);
  renderSpace(sp);
}

function renderDims(sp) {
  const l = L(), box = $("#lumDims");
  for (const d of sp.dims) {
    const row = document.createElement("div");
    row.className = "dim";
    row.innerHTML = `<span class="dname"></span>`;
    row.querySelector(".dname").textContent = d.name;
    for (const val of d.values) {
      const n = sp.variants.filter((v) => (v.requirements || {})[d.name] === val).length;
      const b = document.createElement("button");
      b.className = "dval" + (l.filters[d.name] === val ? " on" : "");
      b.textContent = `${val} ${n ? `(${n})` : ""}`;
      b.title = "Filter to variants with this value";
      b.onclick = () => { if (l.filters[d.name] === val) delete l.filters[d.name]; else l.filters[d.name] = val; save(); renderLuminate(); };
      row.append(b);
    }
    box.append(row);
  }
  const add = document.createElement("div");
  add.className = "dim";
  add.innerHTML = `<input id="lumAddDim" placeholder="+ Add a dimension, e.g., Time period">`;
  box.append(add);
  $("#lumAddDim").onkeydown = (e) => { if (e.key === "Enter") addDimension(e.target.value); };
}

function renderLumControls(sp) {
  const l = L(), box = $(".lum-controls");
  const opts = (cur) => `<option value="">—</option>`
    + sp.dims.map((d) => `<option ${cur === d.name ? "selected" : ""}>${esc(d.name)}</option>`).join("")
    + `<option value="__fit" ${cur === "__fit" ? "selected" : ""}>Fit to your arc (TaleBrush)</option>`
    + `<option value="__end" ${cur === "__end" ? "selected" : ""}>Ending fortune (TaleBrush)</option>`;
  const filtered = Object.keys(l.filters).length;
  box.innerHTML = `
    <label>X <select id="lumX">${opts(l.x)}</select></label>
    <label>Y <select id="lumY">${opts(l.y)}</select></label>
    <span class="zooms" title="Semantic zoom">${ZOOMS.map(([z, icon, name]) => `<button data-z="${z}" class="${l.zoom === z ? "on" : ""}" title="${name}">${icon}</button>`).join("")}</span>
    <input id="lumSearch" placeholder="Search" value="${esc(l.search)}">
    <label class="bm"><input type="checkbox" id="lumBm" ${l.bookmarkedOnly ? "checked" : ""}> ☆ only</label>
    ${filtered ? `<button id="lumMoreHere" ${lumBusy ? "disabled" : ""}>+ 3 more in this subspace</button><button id="lumClear">Clear filters</button>` : ""}`;
  $("#lumX").onchange = (e) => { l.x = e.target.value; save(); renderLuminate(); };
  $("#lumY").onchange = (e) => { l.y = e.target.value; save(); renderLuminate(); };
  box.querySelectorAll(".zooms button").forEach((b) => { b.onclick = () => { l.zoom = b.dataset.z; save(); renderLuminate(); }; });
  const search = $("#lumSearch");
  search.oninput = () => { l.search = search.value; renderSpace(sp); };
  $("#lumBm").onchange = (e) => { l.bookmarkedOnly = e.target.checked; renderSpace(sp); };
  const more = $("#lumMoreHere");
  if (more) more.onclick = () => moreLike({ ...l.filters }, 3, "Generating more variants in this subspace…");
  const clr = $("#lumClear");
  if (clr) clr.onclick = () => { l.filters = {}; save(); renderLuminate(); };
}

function renderSpace(sp) {
  const l = L(), view = $("#lumSpaceView");
  const xs = axisValues(l.x), ys = axisValues(l.y);
  view.innerHTML = "";
  view.className = "lum-space zoom-" + l.zoom;
  const grid = document.createElement("div");
  grid.className = "lum-grid";
  grid.style.gridTemplateColumns = (l.y ? "110px " : "") + `repeat(${xs.length}, minmax(${l.zoom === "full" ? 260 : l.zoom === "summary" ? 200 : 120}px, 1fr))`;
  if (l.x) {
    if (l.y) grid.append(cell("corner", ""));
    xs.forEach((x) => grid.append(cell("xlabel", x)));
  }
  for (const y of ys) {
    if (l.y) grid.append(cell("ylabel", y));
    for (const x of xs) {
      const c = cell("cell", "");
      sp.variants.filter((v) => (!l.x || axisValue(v, l.x) === x) && (!l.y || axisValue(v, l.y) === y))
        .forEach((v) => c.append(node(v)));
      grid.append(c);
    }
  }
  view.append(grid);
  view.ondblclick = (e) => {
    if (e.target.closest(".lnode")) return;
    l.zoom = l.zoom === "full" ? "dot" : "full";   // Luminate: double-click empty space to zoom fully in or out
    save();
    renderLuminate();
  };
  if (!sp.variants.length) view.innerHTML = `<div class="lum-empty">${lumBusy ? "Variants appear here as they are written…" : "No variants in this space."}</div>`;
}

function cell(cls, text) {
  const d = document.createElement("div");
  d.className = cls;
  d.textContent = text;
  return d;
}

function node(v) {
  const l = L();
  const n = document.createElement("div");
  n.className = "lnode" + (l.selected === v.id ? " selected" : "") + (matches(v) ? "" : " dim") + (v.origin !== "luminate" ? " derived" : "");
  const tags = Object.entries(v.requirements || {}).map(([k, val]) => `<span class="tag" title="${esc(k)}">${esc(val)}</span>`).join("");
  const fit = variantFit(v);
  const body = {
    dot: "",
    title: `<b>#${v.id} ${esc(v.title)}</b>`,
    keywords: `<b>#${v.id} ${esc(v.title)}</b><div class="kw">${(v.keywords || []).map(esc).join(" · ")}</div>`,
    summary: `<b>#${v.id} ${esc(v.title)}</b><div class="sum">${esc(v.summary)}</div><div class="tags">${tags}</div>`,
    full: `<b>#${v.id} ${esc(v.title)}</b><ol start="${v.slots[0] + 1}">${v.slots.map((i) => `<li>${esc(v.sentences[i] || "")}</li>`).join("")}</ol><div class="tags">${tags}</div>`,
  }[l.zoom];
  n.innerHTML = `${body}<span class="nact"><button class="bm ${v.bookmarked ? "on" : ""}" title="Bookmark">${v.bookmarked ? "★" : "☆"}</button><button class="more" title="More like this (2 variants with the same dimension values)">＋</button></span>`;
  n.title = `#${v.id} ${v.title}\n${v.summary}${fit != null ? `\nFit to your arc: ${(1 - fit).toFixed(2)}` : ""}\nClick to put it in the editor.`;
  n.onclick = (e) => {
    if (e.target.closest(".nact")) return;
    l.selected = v.id;
    applyVariant(v, `Variant #${v.id}`);
    setStatus(`Variant #${v.id} “${v.title}” is in the editor (yellow). Edit it, or click another variant to swap.`);
    renderLuminate();
  };
  n.querySelector(".bm").onclick = () => { v.bookmarked = !v.bookmarked; save(); renderLuminate(); window.VideoDiff?.render(); };
  n.querySelector(".more").onclick = () => moreLike({ ...v.requirements }, 2, `Generating 2 more like #${v.id}…`);
  return n;
}

// Selenite → Luminate: explore variants that address a criterion the story has not covered.
function exploreCriterion(name) {
  showTab("space");
  generateSpace(`address the story criterion “${name}”`);
}

window.Luminate = { exploreCriterion, render: renderLuminate, variantFit, variantText, space, newVariant };
hooks.render.push(renderLuminate);
