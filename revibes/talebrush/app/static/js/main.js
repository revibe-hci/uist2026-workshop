// TaleBrush front end: wires the editor, the canvases, the history and the controls together.

import * as api from "./api.js";
import { SketchCanvas } from "./canvas.js";
import { CastBar } from "./cast.js";
import { Editor } from "./editor.js";
import { EXAMPLES } from "./examples.js";
import { againTargets, runGeneration, sketchExtent, stopGeneration, strokeTargets } from "./generator.js";
import { HistoryMenu, saveUnsaved } from "./history.js";
import { scheduleRecognition } from "./recognizer.js";
import * as Sk from "./sketch.js";
import {
  addCharacter,
  changed,
  isMulti,
  labelOf,
  newStory,
  removeCharacter,
  renderNow,
  restore,
  setStatus,
  state,
  subscribe,
} from "./store.js";

const $ = (id) => document.getElementById(id);

restore();

// ---------------------------------------------------------------- what a stroke or an erasure does

// With one character, a stroke starts writing as soon as the pen is lifted (the paper's design).
// With several characters, the writer usually draws more than one line for the same sentences,
// so a stroke only marks its sentences (state.ui.strokeMarks) and the button turns into "Generate".
function onStroke(kind, slots, characterId) {
  if (kind === "surprise") {
    setStatus("Surprise sketch updated. Press Generate Again to use it.", "info");
    return;
  }
  if (!slots.length) return;
  if (isMulti()) {
    for (const i of slots) {
      const sid = state.sentences[i].id;
      if (!state.ui.strokeMarks.has(sid)) state.ui.strokeMarks.set(sid, new Set());
      state.ui.strokeMarks.get(sid).add(characterId);
    }
    const marked = strokeSlots().length;
    setStatus(
      `${labelOf(characterId)}'s line updated (${marked} sentence${marked === 1 ? "" : "s"} marked). ` +
        "Draw the other characters' lines too, then press Generate.",
      "info",
    );
    changed({ persist: false });
    return;
  }
  const targets = strokeTargets(slots);
  if (!targets.length) {
    setStatus(
      "You wrote or edited every sentence under this stroke, so TaleBrush kept them. " +
        "Clear a sentence (leave its bullet empty) to let TaleBrush rewrite it.",
      "info",
    );
    return;
  }
  runGeneration(targets);
}

function onErase(kind, erased, characterId) {
  if (!erased) return;
  let message = "Surprise line erased. Those sentences use the default surprise.";
  if (kind === "fortune" && !isMulti()) {
    message =
      "Sketch erased. Press Generate Again to rewrite the sketched part; where the line is erased, sentences are written without a fortune target.";
  } else if (kind === "fortune") {
    message =
      `Part of ${labelOf(characterId)}'s line erased. Press Generate Again to rewrite the sketched part; ` +
      `where ${labelOf(characterId)} has no line, the sentences have no target for ${labelOf(characterId)}.`;
  }
  setStatus(message, "info");
}

/** Indices of the sentences under strokes that were not generated yet. */
function strokeSlots() {
  return state.sentences.map((s, i) => (state.ui.strokeMarks.has(s.id) ? i : -1)).filter((i) => i >= 0);
}

// ---------------------------------------------------------------- components

const editor = new Editor($("editor"), $("preview"));
const castBar = new CastBar({
  root: $("characters"),
  prefix: $("fortunePrefix"),
  suffix: $("fortuneSuffix"),
  addButton: $("addCharacter"),
  onSelect: selectCharacter,
  onRename: (id, name) => {
    const c = state.characters.find((x) => x.id === id);
    if (!c) return;
    c.name = name;
    changed();
    scheduleRecognition(1300); // this character's fortunes depend on its name
  },
  onRemove: (id) => {
    if (state.ui.generating) return;
    const name = labelOf(id);
    const drawn = Sk.hasSamples(state.sketch.fortunes[id] || []);
    if (drawn && !window.confirm(`Remove ${name}? The line drawn for ${name} is removed too.`)) return;
    removeCharacter(id);
    setStatus(
      isMulti()
        ? `Removed ${name}.`
        : `Removed ${name}. With one character, TaleBrush writes as soon as you finish a stroke, as in the paper.`,
      "info",
    );
    changed();
  },
  onAdd: () => {
    if (state.ui.generating) return;
    const c = addCharacter();
    if (!c) return;
    setStatus(
      "Name the new character, then draw its fortune line. With several characters, TaleBrush writes when you press Generate.",
      "info",
    );
    renderNow();
    castBar.focus(c.id);
    scheduleRecognition(1300); // rate the existing sentences for the new character
  },
});

function selectCharacter(id) {
  if (state.activeCharacter === id || !state.characters.some((c) => c.id === id)) return;
  state.activeCharacter = id;
  changed();
}
const fortuneCanvas = new SketchCanvas({ svg: $("fortuneCanvas"), wrap: $("fortuneWrap"), kind: "fortune", onStroke, onErase });
const surpriseCanvas = new SketchCanvas({ svg: $("surpriseCanvas"), wrap: $("surpriseWrap"), kind: "surprise", onStroke, onErase });
const historyMenu = new HistoryMenu($("historyBtn"), $("historyMenu"));

// ---------------------------------------------------------------- controls

$("title").addEventListener("input", (e) => {
  state.title = e.target.value;
  changed();
});

$("surpriseToggle").addEventListener("change", (e) => {
  state.surpriseEnabled = e.target.checked;
  changed();
});

for (const button of document.querySelectorAll(".tool")) {
  button.addEventListener("click", () => {
    state.tool = button.dataset.tool;
    changed();
  });
}

document.addEventListener("keydown", (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "b" || e.key === "p") state.tool = "pen";
  else if (e.key === "e") state.tool = "eraser";
  else if (/^[1-4]$/.test(e.key) && Number(e.key) <= state.characters.length) {
    selectCharacter(state.characters[Number(e.key) - 1].id); // choose whose line the pen draws
    return;
  } else return;
  changed();
});

// "Generate Again" rewrites everything under the sketch. With several characters, after new
// strokes it is "Generate": it writes the sentences under those strokes, like a stroke does
// with one character.
$("generateAgain").addEventListener("click", async () => {
  if (state.ui.generating) return;
  const marked = strokeSlots();
  const targets = marked.length ? strokeTargets(marked) : againTargets();
  if (!targets.length) {
    state.ui.strokeMarks.clear();
    setStatus(
      sketchExtent()
        ? "Every sentence under the sketch was written or edited by you, so there is nothing to regenerate. Clear a sentence to let TaleBrush rewrite it."
        : "Sketch a character's fortune on the canvas first.",
      "info",
    );
    return;
  }
  const written = await runGeneration(targets);
  if (written) state.ui.strokeMarks.clear();
  changed({ persist: false });
});

$("stopBtn").addEventListener("click", () => stopGeneration());

// New story and examples keep the current story in the history first.
function startStory(options) {
  if (state.ui.generating) return;
  saveUnsaved();
  newStory(options);
  setStatus("");
  changed();
  renderNow();
  scheduleRecognition(100);
}

$("newStory").addEventListener("click", () => startStory({}));

const examplesMenu = $("examplesMenu");
examplesMenu.innerHTML = Object.entries(EXAMPLES)
  .map(([key, ex]) => `<button class="menu-item" data-example="${key}">${ex.label}</button>`)
  .join("");
examplesMenu.addEventListener("click", (e) => {
  const key = e.target.closest("[data-example]")?.dataset.example;
  if (!key) return;
  examplesMenu.hidden = true;
  startStory(EXAMPLES[key]);
});

const settingsMenu = $("settingsMenu");
function toggleMenu(menu, others) {
  const show = menu.hidden;
  others.forEach((m) => (m.hidden = true));
  menu.hidden = !show;
}
$("examplesBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu(examplesMenu, [settingsMenu]);
});
$("settingsBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu(settingsMenu, [examplesMenu]);
});
document.addEventListener("pointerdown", (e) => {
  for (const [menu, button] of [
    [examplesMenu, $("examplesBtn")],
    [settingsMenu, $("settingsBtn")],
  ]) {
    if (!menu.hidden && !menu.contains(e.target) && !button.contains(e.target)) menu.hidden = true;
  }
});

for (const radio of document.querySelectorAll('input[name="pipeline"]')) {
  radio.addEventListener("change", () => {
    state.settings.pipeline = radio.value;
    changed();
  });
}
$("threshold").addEventListener("change", (e) => {
  const v = parseFloat(e.target.value);
  if (Number.isFinite(v) && v > 0 && v <= 1) state.settings.threshold = Math.round(v * 100) / 100;
  changed();
});

// ---------------------------------------------------------------- page chrome

function setValue(input, value) {
  if (document.activeElement !== input && input.value !== value) input.value = value;
}

function renderChrome() {
  const busy = state.ui.generating;
  setValue($("title"), state.title);
  $("title").disabled = busy;
  castBar.render();
  $("surpriseToggle").checked = state.surpriseEnabled;
  $("surpriseToggle").disabled = busy;
  $("surpriseWrap").hidden = !state.surpriseEnabled;
  for (const button of document.querySelectorAll(".tool")) {
    const active = button.dataset.tool === state.tool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  const again = $("generateAgain");
  const marked = !busy && strokeSlots().length > 0;
  again.disabled = busy || !Sk.anyLine(state.sketch);
  again.classList.toggle("busy", busy);
  again.classList.toggle("ready", marked);
  $("generateLabel").textContent = marked ? "Generate" : "Generate Again";
  again.title = marked
    ? "Write the sentences under the lines you just drew"
    : "Generate new sentences for the same sketch";
  $("newStory").disabled = busy;
  $("examplesBtn").disabled = busy;

  for (const radio of document.querySelectorAll('input[name="pipeline"]')) radio.checked = radio.value === state.settings.pipeline;
  setValue($("threshold"), state.settings.threshold.toFixed(2));

  const status = $("status");
  const bridge = state.ui.bridge;
  let message = state.ui.status;
  let kind = state.ui.statusKind;
  if (bridge && !bridge.ok && !busy) {
    message = `${bridge.error || "The LLM bridge is not reachable."}`;
    kind = "error";
  }
  status.className = `status ${kind || ""}`;
  $("statusText").textContent = message || "";
  $("stopBtn").hidden = !busy;

  const badge = $("bridgeStatus");
  if (!bridge) {
    badge.className = "bridge-status";
    badge.textContent = "Checking the LLM bridge...";
  } else if (bridge.ok) {
    badge.className = "bridge-status ok";
    badge.textContent = `Model: ${bridge.backend || "?"} · ${bridge.model || "default"} via LLM bridge`;
    badge.title = `LLM bridge at ${bridge.url}`;
  } else {
    badge.className = "bridge-status down";
    badge.textContent = "LLM bridge offline";
    badge.title = bridge.error || "";
  }
}

subscribe(() => {
  editor.render();
  fortuneCanvas.render();
  surpriseCanvas.render();
  historyMenu.render();
  renderChrome();
});

// ---------------------------------------------------------------- bridge status

async function pollBridge() {
  const before = state.ui.bridge?.ok;
  try {
    const health = await api.getHealth();
    state.ui.bridge = health.bridge;
  } catch {
    state.ui.bridge = { ok: false, error: "The TaleBrush server is not reachable. Start it with: python3 server.py" };
  }
  if (state.ui.bridge.ok && before === false) scheduleRecognition(100); // the bridge came back
  changed({ persist: false });
  setTimeout(pollBridge, state.ui.bridge.ok ? 30000 : 6000);
}

// For developers: inspect the state from the browser console as `talebrush.state`.
window.talebrush = { state };

renderNow();
pollBridge();
scheduleRecognition(400);
