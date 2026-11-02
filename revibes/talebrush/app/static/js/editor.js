// The text editor (Section 4.2.1): one bullet point per sequence step, most often a sentence.
// Enter adds a bullet, Backspace on an empty bullet removes it. The bar on the left is grey
// for the writer's sentences and blue for generated ones (Figure 1, B1). Each sentence is
// highlighted with the colour of its fortune band (Figure 8).
// Remix: with several characters, the highlight shows the fortune of the character selected
// above the canvas, and the ">" tooltip lists every character's fortune.

import { ABSENT, isRating, labels } from "./characters.js";
import { bandOf } from "./config.js";
import { scheduleRecognition } from "./recognizer.js";
import {
  activeCharacter,
  changed,
  insertSentence,
  isMulti,
  ratingOf,
  removeSentence,
  renderNow,
  setSentenceText,
  state,
} from "./store.js";

const SENTENCE_BREAK = /(?<=[.!?]["”’')\]]*)\s+(?=["“‘'(\[]?[A-Z0-9])/;

/** Split pasted text into sentences (lines first, then sentence ends). */
export function splitSentences(text) {
  return text
    .split(/\r?\n+/)
    .flatMap((line) => line.split(SENTENCE_BREAK))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function autosize(ta) {
  if (!ta.isConnected || ta.offsetParent === null) return;
  ta.style.height = "auto";
  ta.style.height = `${ta.scrollHeight}px`;
}

function describe(s) {
  if (!s.text.trim()) return "Blank bullet: shown as a gap on the canvas";
  const who = s.source === "generated" ? "Written by TaleBrush" : "Written by you";
  if (!isMulti()) {
    const own = ratingOf(s, state.characters[0].id);
    return `${who}; ${own !== null ? `recognized fortune ${own.toFixed(2)}` : "fortune not rated yet"}`;
  }
  const names = labels(state.characters);
  const parts = state.characters.map((c, k) => {
    const v = s.fortunes[c.id];
    const text = isRating(v) ? `fortune ${v.toFixed(2)}` : v === ABSENT ? "not in this sentence" : "not rated yet";
    return `${names[k]}: ${text}`;
  });
  return `${who}. ${parts.join("; ")}`;
}

/** The highlight colour of a sentence: the band of the selected character's fortune. */
function bandColor(text, fortunes, id) {
  const v = fortunes?.[id];
  return text.trim() && isRating(v) ? bandOf(v).text : "transparent";
}

export class Editor {
  constructor(root, preview) {
    this.root = root;
    this.preview = preview;
    this.rows = new Map(); // sentence id -> { el, ta, gt, lastText }
    this.previewKey = "";
    root.addEventListener("input", (e) => this.onInput(e));
    root.addEventListener("keydown", (e) => this.onKeyDown(e));
    root.addEventListener("paste", (e) => this.onPaste(e));
    root.addEventListener("focusin", (e) => this.onFocus(e, true));
    root.addEventListener("focusout", (e) => this.onFocus(e, false));
    root.addEventListener("mouseover", (e) => this.setLink(this.indexOf(e.target)));
    root.addEventListener("mouseleave", () => this.setLink(-1));
    window.addEventListener("resize", () => this.rows.forEach((r) => autosize(r.ta)));
  }

  indexOf(node) {
    const row = node?.closest?.(".bullet");
    if (!row || !this.root.contains(row)) return -1;
    const id = Number(row.dataset.id);
    return state.sentences.findIndex((s) => s.id === id);
  }

  setLink(i) {
    const value = i >= 0 ? i : null;
    if (state.ui.linkSlot !== value) {
      state.ui.linkSlot = value;
      changed({ persist: false });
    }
  }

  // ---------------------------------------------------------------- rendering

  render() {
    const preview = state.ui.previewId ? state.history.find((h) => h.id === state.ui.previewId) : null;
    const wasHidden = this.root.hidden;
    this.root.hidden = !!preview;
    this.preview.hidden = !preview;
    if (preview) this.renderPreview(preview);
    else this.previewKey = "";

    const allBlank = state.sentences.every((s) => !s.text.trim());
    const targets = new Set(state.ui.generating ? state.ui.targets : []);
    let before = this.root.firstChild;
    const seen = new Set();
    state.sentences.forEach((s, i) => {
      const row = this.rows.get(s.id) || this.createRow(s);
      seen.add(s.id);
      if (row.el !== before) this.root.insertBefore(row.el, before);
      before = row.el.nextSibling;
      this.updateRow(row, s, i, allBlank, targets.has(i));
    });
    for (const [id, row] of this.rows) {
      if (!seen.has(id)) {
        row.el.remove();
        this.rows.delete(id);
      }
    }
    if (wasHidden && !this.root.hidden) this.rows.forEach((r) => autosize(r.ta));
  }

  createRow(s) {
    const el = document.createElement("div");
    el.className = "bullet";
    el.dataset.id = String(s.id);
    el.innerHTML =
      '<span class="bar"></span><span class="gt">&gt;</span><textarea rows="1" spellcheck="true" aria-label="Story sentence"></textarea>';
    const row = { el, ta: el.querySelector("textarea"), gt: el.querySelector(".gt"), lastText: null };
    this.rows.set(s.id, row);
    return row;
  }

  updateRow(row, s, i, allBlank, isTarget) {
    const { el, ta } = row;
    const focused = document.activeElement === ta;
    if (ta.value !== s.text && (!focused || state.ui.generating)) ta.value = s.text;
    if (row.lastText !== ta.value) {
      row.lastText = ta.value;
      requestAnimationFrame(() => autosize(ta));
    }
    ta.readOnly = state.ui.generating;
    ta.placeholder =
      isTarget && !s.text ? "Writing..." : i === 0 && allBlank ? "Write the first sentence of your story..." : "";
    const blank = !s.text.trim();
    el.classList.toggle("generated", s.source === "generated" && !blank);
    el.classList.toggle("draft", !!s.draft);
    el.classList.toggle("target", isTarget);
    el.classList.toggle("linked", state.ui.linkSlot === i || state.ui.focusSlot === i);
    el.style.setProperty("--band", bandColor(s.text, s.fortunes, activeCharacter().id));
    row.gt.title = describe(s);
  }

  renderPreview(snap) {
    // Highlight the selected character's fortune, or the stored story's protagonist if it lacks that character.
    const id = snap.characters.some((c) => c.id === activeCharacter().id) ? activeCharacter().id : snap.characters[0].id;
    if (this.previewKey === `${snap.id} ${id}`) return;
    this.previewKey = `${snap.id} ${id}`;
    const rows = snap.sentences
      .map((s) => {
        const band = bandColor(s.text, s.fortunes, id);
        const cls = s.source === "generated" && s.text.trim() ? "bullet generated" : "bullet";
        return `<div class="${cls}" style="--band:${band}"><span class="bar"></span><span class="gt">&gt;</span><div class="preview-text">${escapeHtml(s.text) || "&nbsp;"}</div></div>`;
      })
      .join("");
    this.preview.innerHTML = `<div class="preview-label">Previewing "${escapeHtml(snap.name)}". Click it in the list to roll back.</div>${rows}`;
  }

  // ---------------------------------------------------------------- editing

  focus(i, where = "end") {
    const s = state.sentences[i];
    const row = s && this.rows.get(s.id);
    if (!row) return;
    row.ta.focus();
    const len = row.ta.value.length;
    const pos = where === "end" ? len : where === "start" ? 0 : Math.min(where, len);
    row.ta.setSelectionRange(pos, pos);
  }

  onFocus(e, inside) {
    const i = inside ? this.indexOf(e.target) : -1;
    const value = i >= 0 ? i : null;
    if (state.ui.focusSlot !== value) {
      state.ui.focusSlot = value;
      changed({ persist: false });
    }
  }

  onInput(e) {
    const ta = e.target;
    if (!(ta instanceof HTMLTextAreaElement)) return;
    const i = this.indexOf(ta);
    if (i < 0) return;
    const clean = ta.value.replace(/[\r\n]+/g, " ");
    if (clean !== ta.value) {
      const p = ta.selectionStart;
      ta.value = clean;
      ta.setSelectionRange(p, p);
    }
    setSentenceText(i, clean);
    autosize(ta);
    changed();
    scheduleRecognition();
  }

  onKeyDown(e) {
    const ta = e.target;
    if (!(ta instanceof HTMLTextAreaElement) || e.isComposing) return;
    if (state.ui.generating) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }
    const i = this.indexOf(ta);
    if (i < 0) return;
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const n = state.sentences.length;
    const oneLine = () => ta.scrollHeight <= parseFloat(getComputedStyle(ta).lineHeight) * 1.6;

    if (e.key === "Enter") {
      // Split the bullet at the cursor; the rest becomes a new bullet below.
      e.preventDefault();
      setSentenceText(i, value.slice(0, a).trimEnd());
      insertSentence(i + 1, value.slice(b).trimStart(), "user");
      renderNow();
      this.focus(i + 1, "start");
      scheduleRecognition();
      changed();
    } else if (e.key === "Backspace" && a === 0 && b === 0) {
      if (i === 0 && (value.length || n === 1)) return;
      e.preventDefault();
      if (i === 0) {
        removeSentence(0);
        renderNow();
        this.focus(0, "start");
      } else {
        // Remove an empty bullet, or join this sentence onto the previous one.
        const prev = state.sentences[i - 1].text;
        const caret = prev.trimEnd().length + (prev.trim() ? 1 : 0);
        if (value.trim()) setSentenceText(i - 1, `${prev.trimEnd()} ${value.trimStart()}`.trim());
        removeSentence(i);
        renderNow();
        this.focus(i - 1, value.trim() ? caret : "end");
      }
      scheduleRecognition();
      changed();
    } else if (e.key === "Delete" && a === value.length && b === value.length && i < n - 1) {
      e.preventDefault();
      const next = state.sentences[i + 1].text;
      if (next.trim()) setSentenceText(i, `${value.trimEnd()} ${next.trimStart()}`.trim());
      removeSentence(i + 1);
      renderNow();
      this.focus(i, a);
      scheduleRecognition();
      changed();
    } else if (e.key === "ArrowUp" && !e.shiftKey && i > 0 && (a === 0 || oneLine())) {
      e.preventDefault();
      this.focus(i - 1, "end");
    } else if (e.key === "ArrowDown" && !e.shiftKey && i < n - 1 && (a === value.length || oneLine())) {
      e.preventDefault();
      this.focus(i + 1, "end");
    }
  }

  onPaste(e) {
    const ta = e.target;
    if (!(ta instanceof HTMLTextAreaElement) || state.ui.generating) return;
    const text = e.clipboardData?.getData("text/plain");
    if (!text) return;
    const parts = splitSentences(text);
    if (parts.length <= 1) return; // a single sentence pastes normally
    e.preventDefault();
    const i = this.indexOf(ta);
    const { selectionStart: a, selectionEnd: b, value } = ta;
    const head = value.slice(0, a);
    const tail = value.slice(b).trim();
    setSentenceText(i, `${head}${parts[0]}`.trim());
    let k = i;
    for (let p = 1; p < parts.length; p++) {
      k += 1;
      insertSentence(k, p === parts.length - 1 && tail ? `${parts[p]} ${tail}` : parts[p], "user");
    }
    renderNow();
    this.focus(k, "end");
    scheduleRecognition();
    changed();
  }
}
