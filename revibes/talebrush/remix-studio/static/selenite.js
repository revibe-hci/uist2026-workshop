"use strict";
/* Selenite (Liu et al., CHI 2024) remixed into TaleBrush: a Story Guide.
 *
 *  - Global grounding: an overview of criteria commonly considered for this kind
 *    of story (retrieved by the LLM), plus "elements encountered so far"
 *    (characters, places, objects), like Selenite's options list.
 *  - Local grounding: in-situ criterion chips under each sentence, and ‹ ›
 *    navigation between the sentences that address a criterion.
 *  - Zoom in: "Analyze" colours a sentence's phrases by their effect on the
 *    protagonist's fortune (Selenite's sentiment, read as TaleBrush's fortune).
 *  - Summary and next steps: covered / not yet covered criteria and two suggested
 *    ones, each of which can seed a Luminate design space.
 */

const G = () => (state.studio.guide ||= { topic: "", criteria: [], ann: null, analysis: {}, nav: {} });
const KIND_ICON = { character: "👤", place: "📍", object: "🔑" };
let guideBusy = false;

// Annotations are kept with the text they were made for; edited sentences drop theirs.
function critOf(i) {
  const a = G().ann;
  if (!a || !state.lines[i] || a.texts[i] !== state.lines[i].text) return [];
  return a.sentences[String(i)] || [];
}
const sentencesWith = (name) => state.lines.map((_, i) => i).filter((i) => critOf(i).includes(name));

async function buildOverview(more) {
  if (guideBusy) return;
  if (!state.lines.some(hasText)) { setStatus("Write or generate a sentence first, so the guide knows what kind of story this is.", "error"); return; }
  guideBusy = true;
  renderGuide();
  setStatus(more ? "Retrieving more criteria…" : "Building the story overview (criteria, then annotations)…", "busy");
  try {
    const g = G();
    const data = await postJSON("/api/selenite/criteria", {
      protagonist: state.protagonist.trim(), sentences: state.lines.map((l) => l.text),
      exclude: more ? g.criteria.map((c) => c.name) : [],
    });
    if (more) g.criteria.push(...data.criteria);
    else { g.topic = data.topic; g.criteria = data.criteria; g.analysis = {}; }
    save();
    guideBusy = false;
    await annotateStory();
  } catch (e) {
    setStatus("Story guide failed: " + e.message, "error");
  } finally {
    guideBusy = false;
    renderGuide();
  }
}

async function annotateStory() {
  const g = G();
  if (!g.criteria.length || guideBusy) return;
  guideBusy = true;
  renderGuide();
  setStatus("Annotating sentences with criteria…", "busy");
  const texts = state.lines.map((l) => l.text);
  try {
    const data = await postJSON("/api/selenite/annotate", { sentences: texts, criteria: g.criteria.map((c) => c.name) });
    g.ann = { texts, ...data };
    setStatus(`Story guide updated: ${coverage().covered.length} of ${g.criteria.length} criteria addressed.`);
    save();
  } catch (e) {
    setStatus("Annotation failed: " + e.message, "error");
  } finally {
    guideBusy = false;
    renderAll();
  }
}

async function analyzeSentence(i) {
  const g = G();
  const text = state.lines[i].text;
  g.analysis[text] = { loading: true };
  updateRow(i);
  try {
    const data = await postJSON("/api/selenite/analyze", {
      protagonist: state.protagonist.trim(), sentences: state.lines.map((l) => l.text), index: i,
      criteria: g.criteria.map((c) => c.name),
    });
    g.analysis[text] = { spans: data.spans };
  } catch (e) {
    delete g.analysis[text];
    setStatus("Analyze failed: " + e.message, "error");
  }
  save();
  updateRow(i);
}

function coverage() {
  const g = G();
  const covered = g.criteria.filter((c) => sentencesWith(c.name).length);
  const missing = g.criteria.filter((c) => !sentencesWith(c.name).length);
  return { covered, missing };
}

// ‹ › : step through the sentences that address a criterion.
function navigate(name, dir) {
  const idx = sentencesWith(name);
  if (!idx.length) return;
  const nav = G().nav;
  const cur = nav[name] ?? (dir > 0 ? -1 : idx.length);
  const k = (cur + dir + idx.length) % idx.length;
  nav[name] = k;
  const i = idx[k];
  state.diffHover = [i];
  focusLine(i, "end");
  const row = $(`#editor .row[data-i="${i}"]`);
  row?.scrollIntoView({ block: "center", behavior: "smooth" });
  row?.classList.add("flash");
  setTimeout(() => row?.classList.remove("flash"), 900);
  refreshHighlights();
  setStatus(`“${name}”: sentence ${i + 1} (${k + 1} of ${idx.length}).`);
}

function highlight(indices) {
  state.diffHover = indices && indices.length ? indices : null;
  refreshHighlights();
}

/* ---------- rendering ---------- */

function renderGuide() {
  const el = $("#guide");
  if (!el) return;
  const g = G();
  const head = `<div class="ex-head"><h2>Story Guide</h2><span class="remix-tag o-selenite">From Selenite</span></div>`;
  if (!g.criteria.length) {
    el.innerHTML = head + `<p class="ex-hint">An overview of what readers commonly look for in this kind of story, which
      sentences address each criterion, and what you have not covered yet.</p>
      <button id="guideBuild" class="primary sel" ${guideBusy ? "disabled" : ""}>${guideBusy ? "Building…" : "Build story overview"}</button>
      <span class="ex-hint"> 2 model calls</span>`;
    $("#guideBuild").onclick = () => buildOverview(false);
    return;
  }
  const { covered, missing } = coverage();
  const stale = g.ann && state.lines.some((l, i) => hasText(l) && g.ann.texts[i] !== l.text);
  el.innerHTML = head + `
    <p class="ex-hint">Topic: <b>${esc(g.topic)}</b> · ${covered.length} of ${g.criteria.length} criteria addressed</p>
    <ul class="crit-list"></ul>
    <div class="guide-actions">
      <button id="guideMore" ${guideBusy ? "disabled" : ""}>+ More criteria</button>
      <button id="guideRefresh" ${guideBusy ? "disabled" : ""}>${stale ? "↻ Re-annotate (story changed)" : "↻ Re-annotate"}</button>
    </div>
    <div class="guide-sub">Elements encountered so far</div>
    <div class="elements"></div>
    <div class="guide-sub">Summary</div>
    <div class="guide-summary"></div>`;
  const list = el.querySelector(".crit-list");
  for (const c of g.criteria) {
    const idx = sentencesWith(c.name);
    const li = document.createElement("li");
    li.className = idx.length ? "present" : "absent";
    li.innerHTML = `<span class="cname"></span><span class="ccount">${idx.length || ""}</span>
      <button class="nav" title="Previous sentence about this" ${idx.length ? "" : "disabled"}>‹</button>
      <button class="nav" title="Next sentence about this" ${idx.length ? "" : "disabled"}>›</button>`;
    li.querySelector(".cname").textContent = c.name;
    li.title = c.description;
    const [prev, next] = li.querySelectorAll(".nav");
    prev.onclick = () => navigate(c.name, -1);
    next.onclick = () => navigate(c.name, 1);
    li.addEventListener("mouseenter", () => highlight(idx));
    li.addEventListener("mouseleave", () => highlight(null));
    list.append(li);
  }
  const els = el.querySelector(".elements");
  for (const e of (g.ann && g.ann.elements) || []) {
    const chip = document.createElement("span");
    chip.className = "el-chip";
    chip.textContent = `${KIND_ICON[e.kind] || "•"} ${e.name}`;
    chip.title = `${e.kind}, in sentence${e.sentences.length > 1 ? "s" : ""} ${e.sentences.map((i) => i + 1).join(", ")}`;
    chip.addEventListener("mouseenter", () => highlight(e.sentences));
    chip.addEventListener("mouseleave", () => highlight(null));
    els.append(chip);
  }
  if (!els.children.length) els.innerHTML = '<span class="ex-hint">Re-annotate to list characters, places and objects.</span>';
  const sum = el.querySelector(".guide-summary");
  sum.innerHTML = `<div><b>Addressed:</b> ${covered.map((c) => esc(c.name)).join(", ") || "none yet"}</div>
    <div><b>Not yet:</b> ${missing.map((c) => esc(c.name)).join(", ") || "none"}</div>`;
  for (const s of (g.ann && g.ann.suggest) || []) {
    const d = document.createElement("div");
    d.className = "suggest";
    d.innerHTML = `<b>Consider next:</b> <span class="sname"></span> <span class="ex-hint"></span>
      <button title="Generate story variants that address this (Luminate)">Explore in Design space →</button>`;
    d.querySelector(".sname").textContent = s.name;
    d.querySelector(".ex-hint").textContent = "— " + s.why;
    d.querySelector("button").onclick = () => window.Luminate?.exploreCriterion(s.name);
    sum.append(d);
  }
  $("#guideMore").onclick = () => buildOverview(true);
  $("#guideRefresh").onclick = () => annotateStory();
}

// In-situ annotations under each sentence, plus the Analyze zoom-in.
function decorateRow(row, l, i) {
  const body = row.querySelector(".rowbody");
  if (!body) return;
  body.querySelectorAll(".chips, .analysis").forEach((n) => n.remove());
  const g = G();
  if (!g.criteria.length || !hasText(l) || l.pending) return;
  const chips = document.createElement("div");
  chips.className = "chips";
  for (const name of critOf(i)) {
    const c = document.createElement("span");
    c.className = "chip";
    c.textContent = name;
    c.title = "Next sentence about " + name;
    c.onclick = () => navigate(name, 1);
    chips.append(c);
  }
  const an = g.analysis[l.text];
  const btn = document.createElement("button");
  btn.className = "analyze";
  btn.textContent = an && an.loading ? "Analyzing…" : an ? "Hide analysis" : "Analyze";
  btn.title = "Which phrases are good or bad for the protagonist, and which criteria they touch";
  btn.onclick = () => {
    if (an && !an.loading) { delete g.analysis[l.text]; save(); updateRow(i); } else if (!an) analyzeSentence(i);
  };
  chips.append(btn);
  body.append(chips);
  if (an && an.spans) {
    const box = document.createElement("div");
    box.className = "analysis";
    for (const s of an.spans) {
      const span = document.createElement("span");
      span.className = "span " + s.effect;
      span.textContent = s.text;
      span.title = `${s.effect === "positive" ? "Good" : s.effect === "negative" ? "Bad" : "Neutral"} for ${state.protagonist || "the protagonist"}`
        + (s.criteria.length ? " · " + s.criteria.join(", ") : "");
      box.append(span, " ");
    }
    body.append(box);
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

hooks.row.push(decorateRow);
hooks.render.push(renderGuide);
// Keep the in-situ annotations current after each TaleBrush generation.
hooks.afterGenerate.push(() => { if (G().criteria.length) annotateStory(); });
