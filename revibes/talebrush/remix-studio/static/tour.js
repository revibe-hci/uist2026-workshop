"use strict";
/* First-time walkthrough of TaleBrush Studio.
 *
 * A modal tour: each step spotlights one part of the interface, switches to the
 * tab it lives on, and badges which system(s) it comes from: TaleBrush, Misty,
 * Luminate, VideoDiff or Selenite (several badges = a remix of those systems).
 * Steps whose target is not on screen yet (no example, no design space, no
 * guide) fall back to a nearby element or are centred, with a note on how to
 * reveal them. The tour never calls the model.
 */

(() => {
  const SYSTEMS = {
    talebrush: { label: "TaleBrush", cls: "o-talebrush", cite: "Chung et al., CHI 2022", what: "sketch a character's fortune to steer story generation" },
    misty: { label: "Misty", cls: "o-misty", cite: "Lu et al., CHI 2025", what: "blend examples into your work; a semantic diff of what changed" },
    luminate: { label: "Luminate", cls: "o-luminate", cite: "Suh et al., CHI 2024", what: "generate a design space of many variants, organized by dimensions" },
    videodiff: { label: "VideoDiff", cls: "o-videodiff", cite: "CHI 2025", what: "compare aligned alternatives; edit and recombine them by prompt" },
    selenite: { label: "Selenite", cls: "o-selenite", cite: "Liu et al., CHI 2024", what: "an overview of criteria, with annotations to read and navigate by" },
  };

  const STEPS = [
    {
      from: [], tab: "arc",
      title: "Welcome to TaleBrush Studio",
      body: `<p>Co-write a short story outline with an AI, using ideas from five research systems.
        Each step of this tour is badged with where that part comes from. A step with several badges is where systems were combined.</p>
        <ul class="tour-legend">${Object.values(SYSTEMS).map((s) => `<li><span class="tour-badge ${s.cls}">${s.label}</span><span>${s.what} <i>(${s.cite})</i></span></li>`).join("")}</ul>
        <p class="tour-note">The flow: <b>sketch</b> the story's arc (TaleBrush) → <b>blend</b> in examples (Misty) → <b>explore</b> many versions (Luminate) →
        <b>compare</b> them (VideoDiff) → <b>check</b> the story against what readers look for (Selenite).</p>`,
    },

    // ---------------- TaleBrush
    { from: ["talebrush"], tab: "arc", target: ".protagonist", title: "Name the protagonist",
      body: `<p>Everything centres on one character's <b>fortune</b>: how good or bad things are for them. Type their name first.</p>` },
    { from: ["talebrush"], target: "#editor", title: "The story, one sentence per bullet",
      body: `<p>Write a beginning, or leave bullets empty for the AI. <kbd>Enter</kbd> adds a bullet.</p>
        <p><span class="tour-swatch gray"></span> gray: yours, always kept · <span class="tour-swatch blue"></span> blue: generated ·
        <span class="tour-swatch yellow"></span> yellow: taken from a <b>Luminate</b> variant. Edit anything; edited lines become yours.</p>` },
    { from: ["talebrush"], tab: "arc", target: "#fortuneCanvas", title: "Sketch the fortune arc",
      body: `<p>Left to right is the story's order; <b>higher is better fortune</b>. Draw one stroke and release, and the
        sentences under it are written to follow it. Draw slowly for a strict envelope, fast for a loose one.</p>
        <p>The <b>blue line</b> shows each sentence's actual (recognized) fortune, so you can see how well the story followed your sketch.</p>` },
    { from: ["talebrush"], tab: "arc", target: ".tools", title: "Brush, eraser, infilling",
      body: `<p>Redraw part of the arc to rewrite just those sentences. Erase a gap for sentences with no fortune target.
        Sketch between two sentences you wrote, and the AI <b>infills</b> the middle.</p>` },
    { from: ["talebrush"], target: "#againBtn", title: "Generate Again",
      body: `<p>New sentences for the same sketch (it turns into <b>Stop</b> while writing). <b>Surprise</b>, under the canvas, opens a second canvas for how unexpected each sentence should be.</p>` },
    { from: ["talebrush"], target: ".history-wrap", title: "History",
      body: `<p>Every generation, blend, variant and revision is stored. Open it to see past arcs faintly on the canvas; click one to roll back.</p>` },

    // ---------------- Misty
    { from: ["misty", "talebrush"], target: ".examples", title: "Example stories to blend from",
      body: `<p>Misty brings <b>example screenshots</b> into a design. Here the examples are <b>stories</b> (try Cinderella under <i>+ Add an example story</i>),
        and TaleBrush's recognizer draws each example's fortune arc on its card.</p>` },
    { from: ["misty"], target: ".ex-card .ex-top", fallback: ".examples", title: "Blend all, or just a part",
      body: `<p><b>Global:</b> drag a card by <b>⠿</b> onto the fortune canvas. <b>Localized:</b> brush across part of its mini arc, then drag
        the selection onto some of your sentences. The landing spot is outlined, with the example's arc previewed.</p>`,
      missing: `<p class="tour-note">Add an example to see its card here.</p>` },
    { from: ["misty", "talebrush"], tab: "arc", target: "#fortuneCanvas", title: "Pick what to blend",
      body: `<p>On drop, Misty's <b>Pick Blending Option</b> dialog asks what to borrow:</p>
        <div class="tour-mock"><div><b>Arc</b> the example's fortune shape, drawn as your sketch for TaleBrush to follow</div>
        <div><b>Events</b> what happens, adapted to your character</div><div><b>Tone &amp; style</b> its voice</div><div><b>Customize</b> anything, in your words</div></div>` },
    { from: ["misty"], tab: "arc", target: "#diffPanel", visibleOnly: true, title: "Changes: a semantic diff",
      body: `<p>After each generation, the changes are listed <b>by meaning</b>. <b>Switch one off</b> to undo just it (only its sentences are rewritten,
        and the arc updates), or click its label to ask for a different change.</p>`,
      missing: `<div class="tour-mock"><div class="tour-diff"><span class="tour-switch on"></span> <b>Triumphant Blue Note performance</b></div>
        <div class="tour-diff off"><span class="tour-switch"></span> <b><s>Magical strings gifted</s></b></div></div>
        <p class="tour-note">Appears under the canvas after your first generation.</p>` },

    // ---------------- Selenite
    { from: ["selenite"], target: "#guide", title: "Story Guide: what readers look for",
      body: `<p>Selenite gives an <b>overview of criteria</b> people commonly use to judge a topic. Here, it lists criteria for <i>your kind of story</i>
        (motivation, stakes, pacing…): bright if your story addresses them, faded if not. Use <b>‹ ›</b> to jump between the sentences about a criterion.</p>
        <p>Below the criteria: the <b>characters, places and objects</b> encountered so far, like Selenite's "options encountered".</p>`,
      missing: `<p class="tour-note">Press <b>Build story overview</b> (2 model calls) once you have a few sentences.</p>` },
    { from: ["selenite", "talebrush"], target: "#editor .row:has(.chips)", fallback: "#editor", title: "Annotations under each sentence",
      body: `<p>Each sentence is tagged with the criteria it addresses (Selenite's <b>in-situ annotations</b>). Click a tag to jump to the next sentence about it.</p>
        <p><b>Analyze</b> (on hover) zooms in: each phrase is boxed <span class="tour-box pos">green</span> or <span class="tour-box neg">red</span> by whether it is
        good or bad <i>for the protagonist</i>. That is Selenite's sentiment, read as TaleBrush's fortune.</p>`,
      missing: `<p class="tour-note">Tags appear after you build the story overview.</p>` },
    { from: ["selenite", "luminate"], target: ".guide-summary", fallback: "#guide", title: "What to work on next",
      body: `<p>The summary shows what the story addresses and what it doesn't yet, and suggests two criteria to <b>consider next</b>.</p>
        <p><b>Explore in Design space →</b> hands a suggestion to Luminate, which generates variants that address it.</p>` },

    // ---------------- Luminate
    { from: ["luminate"], tab: "space", target: ".lum-bar", fallback: "#lumPane", title: "Design space: many versions at once",
      body: `<p>Instead of one regeneration at a time, Luminate generates a <b>design space</b>. It finds <b>dimensions</b> along which the rest of the story could vary,
        then writes several variants, each with a different combination of values.</p>
        <p>Variants rewrite the same sentences TaleBrush would, and <b>follow your fortune sketch</b>. Add a prompt like "different endings" to focus it.</p>` },
    { from: ["luminate"], tab: "space", target: "#lumDims", fallback: "#lumPane", visibleOnly: false, title: "Dimensions and values",
      body: `<p>Each row is a dimension (e.g., <i>Stranger's motive</i>) with its values and counts. Click a value to <b>filter</b>, then
        <b>+ more in this subspace</b>. Type a dimension of your own (e.g., <i>Time period</i>) and every variant is placed along it.</p>`,
      missing: `<p class="tour-note">Generate a design space to see its dimensions.</p>` },
    { from: ["luminate", "talebrush"], tab: "space", target: ".lum-controls", fallback: "#lumPane", title: "Arrange, zoom, search",
      body: `<p>Put a dimension on <b>X</b> and/or <b>Y</b> to arrange variants in a grid. Two extra axes come from TaleBrush:
        <b>Fit to your arc</b> and <b>Ending fortune</b>.</p>
        <p><b>Semantic zoom</b> (● T K S F): dots → titles → keywords → summaries → full text. Double-click empty space to zoom all the way in or out.
        Search dims non-matching variants; ☆ shows bookmarks.</p>` },
    { from: ["luminate"], tab: "space", target: "#lumSpaceView", fallback: "#lumPane", title: "Pick a variant",
      body: `<p><b>Click a variant</b> to put it in the editor (yellow until you edit it), and click another to swap.
        ☆ bookmarks it; ＋ writes 2 more with the same dimension values. Switch between design spaces with the <b>Space</b> menu.</p>` },

    // ---------------- VideoDiff
    { from: ["videodiff", "talebrush"], tab: "compare", target: ".vd-table-wrap", fallback: "#vdPane", title: "Compare variants, aligned",
      body: `<p>VideoDiff aligns video alternatives to the same source timeline. Here, every variant is aligned to the same <b>sentence slots</b>:
        rows are variants, columns are sentences, and text that differs from <b>Your story</b> (top row) is highlighted. Hover a column to follow one sentence across all variants.</p>
        <p>Each row's <b>Arc</b> is its fortune line over your sketch (TaleBrush), so you can see at a glance which version fits.</p>` },
    { from: ["videodiff"], tab: "compare", target: ".vd-bar", fallback: "#vdPane", title: "Sort and show",
      body: `<p><b>Sort</b> by fit to your arc, length, how much changed, or newest. <b>Changed sentences / Whole story</b> switches between
        just the rewritten sentences and the full story in context.</p>` },
    { from: ["videodiff"], tab: "compare", target: ".vd-prompt", fallback: "#vdPane", title: "Recombine, or surprise me",
      body: `<p>Describe a new variant, and refer to others by number to <b>recombine</b> them: <i>"the stranger from #1 with the ending of #4"</i>.
        <b>Surprise me</b> makes one unlike all the others. New variants are pinned to the top, with a one-line summary of what changed.</p>` },
    { from: ["videodiff"], tab: "compare", target: ".vd-table tr:nth-child(3) .vact", fallback: "#vdPane", title: "Organize and use",
      body: `<p>📌 pin to the top, 🗄 archive to the bottom, ✎ <b>Edit</b> with a prompt (the result appears right below, with its change summary),
        and <b>Use</b> to put a variant into the editor. Hover a single sentence and press <b>use</b> to take just that one.</p>`,
      missing: `<p class="tour-note">Generate a design space, or press Surprise me, to get rows to compare.</p>` },

    // ---------------- wrap-up
    { from: [], target: "#modelNote", title: "About the AI",
      body: `<p>The original systems used their own models (listed in the footer). Here, one Claude model answers every call through the workshop's LLM bridge.
        Each call takes a few seconds; buttons that make many calls say how many.</p>` },
    { from: [], tab: "arc", title: "Try it",
      body: `<ol class="tour-try">
          <li><span class="tour-badge o-talebrush">TaleBrush</span> Name a character, write one sentence, and sketch a dip and a rise.</li>
          <li><span class="tour-badge o-misty">Misty</span> Or add Cinderella and drag it onto the canvas (Arc + Events).</li>
          <li><span class="tour-badge o-selenite">Selenite</span> Build the story overview and see what's missing.</li>
          <li><span class="tour-badge o-luminate">Luminate</span> Explore a suggestion in the Design space; arrange by a dimension.</li>
          <li><span class="tour-badge o-videodiff">VideoDiff</span> Compare the variants, recombine two, and use the best.</li>
        </ol>
        <p class="tour-note">Reopen this tour any time with <b>? Tutorial</b>.</p>` },
  ];

  let i = 0, root, spot, card, onKey, onResize, startTab;

  const visible = (el) => el && el.getBoundingClientRect().height > 0 && !el.closest("[hidden]");

  function targetFor(step) {
    if (!step.target) return { el: null, missing: false };
    let el = document.querySelector(step.target);
    if (visible(el)) return { el, missing: false };
    if (step.visibleOnly) return { el: null, missing: true };
    el = step.fallback && document.querySelector(step.fallback);
    return { el: visible(el) ? el : null, missing: true };
  }

  function badges(step) {
    if (!step.from.length) return `<span class="tour-badge o-welcome">TaleBrush Studio</span>`;
    const b = step.from.map((k) => `<span class="tour-badge ${SYSTEMS[k].cls}">${step.from.length > 1 ? "" : "From "}${SYSTEMS[k].label}</span>`);
    return step.from.length > 1 ? `<span class="tour-remix">Remix:</span> ${b.join('<span class="tour-plus">+</span>')}` : b[0];
  }

  function open(start = 0) {
    if (root) close();
    startTab = state.studio.tab || "arc";
    root = document.createElement("div");
    root.className = "tour-root";
    root.innerHTML = `<div class="tour-block"></div><div class="tour-spot"></div>
      <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle"></div>`;
    document.body.append(root);
    spot = root.querySelector(".tour-spot");
    card = root.querySelector(".tour-card");
    onKey = (e) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
    };
    onResize = () => place();
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    go(start);
  }

  function close() {
    if (!root) return;
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onResize, true);
    root.remove();
    root = null;
    showTab(startTab);
    try { localStorage.setItem("talebrush-studio-tour-seen", "1"); } catch (_) { /* ignore */ }
    document.getElementById("tourBtn")?.focus();
  }

  function go(n) {
    if (n < 0) return;
    if (n >= STEPS.length) { close(); return; }
    i = n;
    const step = STEPS[i];
    if (step.tab && state.studio.tab !== step.tab) showTab(step.tab);
    const { el, missing } = targetFor(step);
    card.innerHTML = `
      <div class="tour-top"><div class="tour-badges">${badges(step)}</div>
        <button class="tour-x" aria-label="Close tutorial">×</button></div>
      <h3 id="tourTitle">${step.title}</h3>
      <div class="tour-body">${step.body}${missing && step.missing ? step.missing : ""}</div>
      <div class="tour-foot">
        <div class="tour-dots">${STEPS.map((s, k) => `<button class="${k === i ? "on" : ""} ${s.from[0] ? SYSTEMS[s.from[0]].cls : ""}" aria-label="Step ${k + 1}: ${s.title}" title="${s.title}" data-k="${k}"></button>`).join("")}</div>
        <div class="tour-nav">
          ${i > 0 ? '<button class="tour-back">Back</button>' : '<button class="tour-skip">Skip</button>'}
          <button class="tour-next primary">${i === STEPS.length - 1 ? "Start writing" : "Next"}</button>
        </div>
      </div>`;
    card.querySelector(".tour-x").onclick = close;
    card.querySelector(".tour-next").onclick = () => go(i + 1);
    card.querySelector(".tour-back")?.addEventListener("click", () => go(i - 1));
    card.querySelector(".tour-skip")?.addEventListener("click", close);
    card.querySelectorAll(".tour-dots button").forEach((b) => { b.onclick = () => go(+b.dataset.k); });
    card._target = el;
    if (el) el.scrollIntoView({ block: "nearest", behavior: "instant" });
    place();
    card.querySelector(".tour-next").focus();
  }

  // Spotlight the target and put the card beside it (right, left, below, above),
  // or centre the card when the step has no target on screen.
  function place() {
    if (!root) return;
    const el = card._target;
    const vw = window.innerWidth, vh = window.innerHeight, gap = 14, pad = 8;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    if (!el) {
      spot.style.display = "none";
      root.classList.add("dim");
      card.style.left = Math.max(16, (vw - cw) / 2) + "px";
      card.style.top = Math.max(16, (vh - ch) / 2) + "px";
      return;
    }
    root.classList.remove("dim");
    const r = el.getBoundingClientRect();
    const top0 = Math.max(r.top, 4), bot0 = Math.min(r.bottom, vh - 4);   // tall targets: spotlight the visible part
    const box = { left: r.left - pad, top: top0 - pad, width: r.width + 2 * pad, height: bot0 - top0 + 2 * pad };
    Object.assign(spot.style, { display: "block", left: box.left + "px", top: box.top + "px", width: box.width + "px", height: box.height + "px" });
    const fits = {
      right: vw - (box.left + box.width) - gap >= cw,
      left: box.left - gap >= cw,
      below: vh - (box.top + box.height) - gap >= ch,
      above: box.top - gap >= ch,
    };
    let left, top;
    if (fits.right) { left = box.left + box.width + gap; top = box.top; }
    else if (fits.left) { left = box.left - gap - cw; top = box.top; }
    else if (fits.below) { left = box.left; top = box.top + box.height + gap; }
    else if (fits.above) { left = box.left; top = box.top - gap - ch; }
    else { left = vw - cw - 16; top = vh - ch - 16; }
    card.style.left = Math.min(Math.max(16, left), vw - cw - 16) + "px";
    card.style.top = Math.min(Math.max(16, top), vh - ch - 16) + "px";
  }

  const btn = document.getElementById("tourBtn");
  btn.addEventListener("click", () => { btn.classList.remove("pulse"); open(0); });
  try { if (!localStorage.getItem("talebrush-studio-tour-seen")) btn.classList.add("pulse"); } catch (_) { /* ignore */ }
  window.TaleBrushTour = { open, close };
})();
