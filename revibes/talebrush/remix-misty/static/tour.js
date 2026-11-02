"use strict";
/* First-time walkthrough of TaleBrush × Misty.
 *
 * A modal tour: each step spotlights one part of the interface and says which
 * paper it comes from (TaleBrush, Misty, or the remix combining both). Steps
 * whose target is hidden (e.g., the Changes panel before any generation) show
 * centred with a small illustration instead. The tour never calls the model.
 */

(() => {
  const ORIGIN = {
    welcome: { label: "Welcome", cls: "o-welcome" },
    talebrush: { label: "From TaleBrush", cls: "o-talebrush" },
    misty: { label: "From Misty", cls: "o-misty" },
    remix: { label: "Remix: TaleBrush + Misty", cls: "o-remix" },
  };

  const STEPS = [
    {
      origin: "welcome",
      title: "Welcome to TaleBrush × Misty",
      body: `<p>This tool helps you co-write a short story outline with an AI. You steer it by
        <b>sketching how the main character's fortune rises and falls</b>, and by <b>blending in
        example stories</b>.</p>
        <p>It remixes two research systems. The badge on each step tells you where that part comes from:</p>
        <ul class="tour-legend">
          <li><span class="tour-badge o-talebrush">From TaleBrush</span> Chung et al., CHI 2022: sketching a character's fortune to steer story generation.</li>
          <li><span class="tour-badge o-misty">From Misty</span> Lu et al., CHI 2025: blending examples into your work, and a "semantic diff" of what changed.</li>
          <li><span class="tour-badge o-remix">Remix</span> where the two are combined.</li>
        </ul>`,
    },
    {
      origin: "talebrush", target: ".protagonist",
      title: "1. Name the protagonist",
      body: `<p>Everything centres on one character's <b>fortune</b>: how good or bad things are for them,
        as a reader would feel it. Type their name here first.</p>`,
    },
    {
      origin: "talebrush", target: "#editor",
      title: "2. The story, one sentence per bullet",
      body: `<p>Each bullet is one step of the story. Write a beginning yourself, or leave bullets blank
        for the AI to fill. <kbd>Enter</kbd> adds a bullet.</p>
        <p><span class="tour-swatch gray"></span> Gray bar: your sentences, always kept.
        <span class="tour-swatch blue"></span> Blue bar: generated sentences, which you can edit freely
        (once edited, they become yours).</p>`,
    },
    {
      origin: "talebrush", target: "#fortuneCanvas",
      title: "3. Sketch the fortune arc",
      body: `<p>Left to right is the story's order, one column per bullet. <b>Higher means better fortune</b>.
        Draw one stroke and release, and sentences are generated to follow it.</p>
        <p><b>Drawing speed matters:</b> draw slowly for a thin, strict envelope (the AI retries more to
        match it), or fast for a wide, loose one.</p>
        <p>Each sentence's actual fortune is then recognized and drawn as a <b>blue line</b> over your
        sketch, so you can see how well the story followed it.</p>`,
    },
    {
      origin: "talebrush", target: ".tools",
      title: "4. Brush and eraser",
      body: `<p>Redraw part of the arc to regenerate only those sentences. Use the <b>eraser</b> to cut a gap
        in the sketch: sentences in the gap are written with no fortune target.</p>
        <p>Sketch between two sentences you wrote, and the AI <b>infills</b> the middle to connect them.</p>`,
    },
    {
      origin: "talebrush", target: "#againBtn",
      title: "5. Generate Again",
      body: `<p>Same sketch, new sentences. While the AI is writing, this button becomes <b>Stop</b>.</p>`,
    },
    {
      origin: "talebrush", target: ".surprise-toggle",
      title: "6. Surprise",
      body: `<p>Tick this to open a second canvas, and sketch how <b>surprising</b> each sentence should be,
        from predictable to wild twists.</p>`,
    },
    {
      origin: "talebrush", target: ".history-wrap",
      title: "7. History",
      body: `<p>Every generation is stored. Open the list to see all versions' arcs faintly on the canvas,
        hover to preview one, and click to roll back.</p>
        <p class="tour-note">Misty compares versions on an infinite canvas of nodes. This remix keeps
        TaleBrush's simpler dropdown.</p>`,
    },
    {
      origin: "remix", target: ".examples",
      title: "8. Example stories",
      body: `<p>Misty lets designers bring in <b>example screenshots</b> for inspiration. Here, the examples
        are <b>stories</b>: paste one, or try Cinderella, Icarus, or The Tortoise and the Hare under
        <i>+ Add an example story</i>.</p>
        <p>TaleBrush's fortune recognizer reads the example and draws <b>its</b> fortune arc on the card.</p>`,
    },
    {
      origin: "misty", target: ".ex-card .ex-top", fallback: ".examples",
      title: "9. Global blending: drag a whole story",
      body: `<p>Drag a card by <b>⠿</b> onto the fortune canvas (or press <i>Blend whole story…</i>). The
        whole example is stretched across your story, the way Misty connects an example to a design to
        restyle all of it.</p>`,
      missing: `<p class="tour-note">Add an example first to see its card and handle here.</p>`,
    },
    {
      origin: "misty", target: ".ex-card .ex-arc", fallback: ".examples",
      title: "10. Localized blending: drag just a part",
      body: `<p>Brush across a card's mini arc to <b>select some sentences</b>, then drag the selection
        onto the canvas. While you hover, the sentences it will land on are outlined, and the example's
        arc is previewed in dashes.</p>
        <p>This is Misty's drag-and-drop: borrow just one part of an example, for just one part of your work.</p>`,
      missing: `<p class="tour-note">Add an example first to try selecting part of its arc.</p>`,
    },
    {
      origin: "remix", target: "#fortuneCanvas",
      title: "11. Pick what to blend",
      body: `<p>When you drop, Misty's <b>Pick Blending Option</b> dialog asks what to borrow. Misty offers
        Color / Layout / Content; for stories they become:</p>
        <div class="tour-mock">
          <div><b>Arc</b> the example's fortune shape, drawn as your sketch, so <i>TaleBrush's</i> control writes it</div>
          <div><b>Events</b> what happens in each example sentence, adapted to your character</div>
          <div><b>Tone &amp; style</b> the example's voice</div>
          <div><b>Customize</b> anything else, in your words</div>
        </div>`,
    },
    {
      origin: "misty", target: "#diffPanel", visibleOnly: true,
      title: "12. Changes: a semantic diff",
      body: `<p>After each generation, Misty-style <b>semantic diffs</b> list what changed by meaning, not by
        wording:</p>
        <div class="tour-mock">
          <div class="tour-diff"><span class="tour-switch on"></span> <b>Triumphant Blue Note performance</b></div>
          <div class="tour-diff off"><span class="tour-switch"></span> <b><s>Magical strings gifted</s></b></div>
        </div>
        <p><b>Switch a change off</b> to undo just that change: only its sentences are rewritten, and the
        arc updates. Click a label to ask for a different change instead.</p>`,
      missing: `<p class="tour-note">This panel appears below the canvas after your first generation.</p>`,
    },
    {
      origin: "welcome", target: "#modelNote",
      title: "About the AI",
      body: `<p>The original systems used their own models (TaleBrush: GPT‑Neo with GeDi; Misty: GPT‑4o).
        Here, a Claude model answers through the workshop's LLM bridge. Each sentence takes a few
        seconds.</p>`,
    },
    {
      origin: "welcome",
      title: "Try it",
      body: `<ol class="tour-try">
          <li>Type a name, e.g. <b>Mike</b>, and a first sentence.</li>
          <li>Add <b>Cinderella</b> as an example.</li>
          <li>Drag it onto the canvas, choose <b>Arc + Events</b>, and watch Cinderella's arc retold as Mike's story.</li>
          <li>Switch off one change in <b>Changes</b>.</li>
        </ol>
        <p class="tour-note">You can reopen this tour at any time with the <b>Tutorial</b> button.</p>`,
    },
  ];

  let i = 0, root, spot, card, onKey, onResize;

  const visible = (el) => el && el.getClientRects().length > 0 && !el.closest("[hidden]");

  function targetFor(step) {
    if (!step.target) return { el: null, missing: false };
    let el = document.querySelector(step.target);
    if (visible(el)) return { el, missing: false };
    if (step.visibleOnly) return { el: null, missing: true };
    el = step.fallback && document.querySelector(step.fallback);
    return { el: visible(el) ? el : null, missing: true };
  }

  function open(start = 0) {
    if (root) close();
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
    try { localStorage.setItem("talebrush-misty-tour-seen", "1"); } catch (_) { /* ignore */ }
    document.getElementById("tourBtn")?.focus();
  }

  function go(n) {
    if (n < 0) return;
    if (n >= STEPS.length) { close(); return; }
    i = n;
    const step = STEPS[i], o = ORIGIN[step.origin];
    const { el, missing } = targetFor(step);
    card.innerHTML = `
      <div class="tour-top"><span class="tour-badge ${o.cls}">${o.label}</span>
        <button class="tour-x" aria-label="Close tutorial">×</button></div>
      <h3 id="tourTitle">${step.title}</h3>
      <div class="tour-body">${step.body}${missing && step.missing ? step.missing : ""}</div>
      <div class="tour-foot">
        <div class="tour-dots">${STEPS.map((_, k) => `<button class="${k === i ? "on" : ""}" aria-label="Step ${k + 1}" data-k="${k}"></button>`).join("")}</div>
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
    card.dataset.target = el ? "1" : "";
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
    const box = { left: r.left - pad, top: r.top - pad, width: r.width + 2 * pad, height: r.height + 2 * pad };
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
  try { if (!localStorage.getItem("talebrush-misty-tour-seen")) btn.classList.add("pulse"); } catch (_) { /* ignore */ }
  window.TaleBrushTour = { open, close };
})();
