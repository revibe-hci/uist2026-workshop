// Multi-story management (Section 4.2.3, Figure 5).
// Every generation stores the resulting story. The History dropdown lists the stored
// stories; while it is open, their fortune arcs are drawn on the canvas in low opacity.
// Hovering a story shows its text in the editor and highlights its arc; clicking it
// rolls back to it. Stories can be renamed (pencil) and deleted (x), as in Figure 5.
// Remix: a stored story also keeps its characters, each character's ratings and lines.

import { ABSENT, isRating, modelNames } from "./characters.js";
import { HISTORY_LIMIT } from "./config.js";
import { ratingKeys } from "./keys.js";
import { scheduleRecognition } from "./recognizer.js";
import * as Sk from "./sketch.js";
import { changed, makeSentence, state } from "./store.js";

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ICON_PENCIL =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
const ICON_X =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// ---------------------------------------------------------------- stored stories

/** The writer's text. A new sketch alone does not count as an unsaved change: the next generation stores it. */
function textSignature(src) {
  return JSON.stringify([src.title.trim(), modelNames(src.characters), src.sentences.map((s) => s.text.trim())]);
}

function makeSnapshot(name) {
  const snap = {
    id: `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    createdAt: Date.now(),
    title: state.title,
    characters: state.characters.map((c) => ({ ...c })),
    sentences: state.sentences.map((s) => ({ text: s.text, source: s.source, fortunes: { ...s.fortunes } })),
    sketch: {
      fortunes: Object.fromEntries(state.characters.map((c) => [c.id, (state.sketch.fortunes[c.id] || []).slice()])),
      surprise: state.sketch.surprise.slice(),
    },
    surpriseEnabled: state.surpriseEnabled,
  };
  return snap;
}

function uniqueName(base) {
  const names = new Set(state.history.map((h) => h.name));
  let name = base;
  for (let k = 2; names.has(name); k++) name = `${base} ${k}`;
  return name;
}

function push(snap) {
  state.history.push(snap);
  if (state.history.length > HISTORY_LIMIT) state.history.splice(0, state.history.length - HISTORY_LIMIT);
  state.activeHistoryId = snap.id;
  changed();
  return snap;
}

export function activeEntry() {
  return state.history.find((h) => h.id === state.activeHistoryId) || null;
}

/** True when the editor holds text that no stored story has. */
export function isDirty() {
  if (!state.sentences.some((s) => s.text.trim())) return false;
  const active = activeEntry();
  return !active || textSignature(active) !== textSignature(state);
}

/** Store the current story before something replaces it, so edits are never lost. */
export function saveUnsaved() {
  if (!isDirty()) return null;
  const active = activeEntry();
  // "Initial": the writer's own start of a story that has no stored version yet.
  const name = active ? `${active.name} (edited)` : "Initial";
  return push(makeSnapshot(uniqueName(name)));
}

/** Store a freshly generated story. */
export function saveGenerated() {
  state.storyCounter += 1;
  return push(makeSnapshot(uniqueName(`Story ${state.storyCounter}`)));
}

/** Roll back to a stored story (its text, characters, fortunes and sketch). */
export function rollBack(id) {
  const snap = state.history.find((h) => h.id === id);
  if (!snap) return;
  saveUnsaved();
  state.title = snap.title;
  state.characters = snap.characters.map((c) => ({ ...c }));
  if (!state.characters.some((c) => c.id === state.activeCharacter)) state.activeCharacter = state.characters[0].id;
  state.sentences = snap.sentences.map((s) => makeSentence(s.text, s.source, s.fortunes));
  const names = modelNames(state.characters);
  state.sentences.forEach((s, i) => {
    if (!s.text.trim()) return;
    const keys = ratingKeys(state.characters, state.sentences, i, names);
    state.characters.forEach((c, k) => {
      const v = s.fortunes[c.id];
      if (isRating(v) || v === ABSENT) s.keys[c.id] = keys[k];
    });
  });
  state.sketch = Sk.normalizeSketch(
    snap.sketch,
    state.sentences.length,
    state.characters.map((c) => c.id),
  );
  state.ui.strokeMarks.clear();
  state.surpriseEnabled = !!snap.surpriseEnabled;
  state.activeHistoryId = snap.id;
  changed();
  scheduleRecognition(300); // rate any sentence the stored story had no rating for
}

export function deleteEntry(id) {
  state.history = state.history.filter((h) => h.id !== id);
  if (state.ui.previewId === id) state.ui.previewId = null;
  changed();
}

export function renameEntry(id, name) {
  const h = state.history.find((x) => x.id === id);
  const clean = name.replace(/\s+/g, " ").trim();
  if (h && clean) h.name = clean;
  changed();
}

// ---------------------------------------------------------------- dropdown

export class HistoryMenu {
  constructor(button, menu) {
    this.button = button;
    this.menu = menu;
    this.renaming = null;
    this.lastKey = "";
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.ui.historyOpen) this.close();
      else this.open();
    });
    document.addEventListener("pointerdown", (e) => {
      if (state.ui.historyOpen && !menu.contains(e.target) && !button.contains(e.target)) this.close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.ui.historyOpen && !this.renaming) this.close();
    });
    menu.addEventListener("click", (e) => this.onClick(e));
    menu.addEventListener("mouseover", (e) => {
      const row = e.target.closest(".history-row");
      const id = row && !this.renaming ? row.dataset.id : null;
      if (id && state.ui.previewId !== id) {
        state.ui.previewId = id;
        changed({ persist: false });
      }
    });
    menu.addEventListener("mouseleave", () => {
      if (state.ui.previewId) {
        state.ui.previewId = null;
        changed({ persist: false });
      }
    });
  }

  open() {
    if (state.ui.generating) return;
    state.ui.historyOpen = true;
    changed({ persist: false });
  }

  close() {
    state.ui.historyOpen = false;
    state.ui.previewId = null;
    this.renaming = null;
    changed({ persist: false });
  }

  onClick(e) {
    const button = e.target.closest("[data-action]");
    const row = e.target.closest(".history-row");
    if (!button || !row) return;
    const id = row.dataset.id;
    const action = button.dataset.action;
    if (action === "open") {
      rollBack(id);
      this.close();
    } else if (action === "rename") {
      this.renaming = id;
      state.ui.previewId = null;
      this.render();
      const input = this.menu.querySelector(".history-rename");
      input?.focus();
      input?.select();
    } else if (action === "delete") {
      deleteEntry(id);
    }
  }

  commitRename(input, keep) {
    if (!this.renaming) return;
    const id = this.renaming;
    this.renaming = null;
    if (keep) renameEntry(id, input.value);
    else changed({ persist: false });
  }

  render() {
    const open = state.ui.historyOpen;
    this.button.classList.toggle("open", open);
    this.button.disabled = state.ui.generating;
    this.menu.hidden = !open;
    if (!open) {
      this.lastKey = "";
      return;
    }
    const key = JSON.stringify([state.history.map((h) => [h.id, h.name]), state.activeHistoryId, this.renaming]);
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.build();
    }
    for (const row of this.menu.querySelectorAll(".history-row")) {
      row.classList.toggle("hot", row.dataset.id === state.ui.previewId);
    }
  }

  build() {
    if (!state.history.length) {
      this.menu.innerHTML =
        '<div class="history-empty">Stories appear here after each generation. Hover one to preview it; click it to roll back.</div>';
      return;
    }
    this.menu.innerHTML = state.history
      .map((h) => {
        const active = h.id === state.activeHistoryId;
        const name =
          this.renaming === h.id
            ? `<input class="history-rename" value="${escapeHtml(h.name)}" aria-label="Story name">`
            : `<button class="history-name" data-action="open" title="Roll back to this story">${escapeHtml(h.name)}</button>`;
        return `<div class="history-row${active ? " active" : ""}" data-id="${h.id}">${name}
          <button class="history-icon" data-action="rename" title="Rename">${ICON_PENCIL}</button>
          ${active ? '<span class="history-icon-space"></span>' : `<button class="history-icon delete" data-action="delete" title="Delete">${ICON_X}</button>`}
        </div>`;
      })
      .join("");
    const input = this.menu.querySelector(".history-rename");
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.commitRename(input, true);
        if (e.key === "Escape") this.commitRename(input, false);
      });
      input.addEventListener("blur", () => this.commitRename(input, true));
    }
  }
}
