// Application state, change notification, and saving to the browser's localStorage.

import {
  MAX_CHARACTERS,
  PROTAGONIST_ID,
  freeColor,
  isRating,
  labels,
  makeCharacter,
  normalizeCharacters,
  normalizePairRatings,
  normalizeRatings,
  pairOfIds,
  pairsOf,
} from "./characters.js";
import { DEFAULT_BULLETS, DEFAULT_THRESHOLD, HISTORY_LIMIT, STORAGE_KEY } from "./config.js";
import * as Sk from "./sketch.js";

let nextId = 1;

/**
 * One bullet point of the text editor.
 * source: "user" (typed or edited by the writer) or "generated" (written by TaleBrush, untouched).
 * fortunes: character id -> recognized fortune 0..1, or ABSENT when the sentence does not involve
 *   that character. A character without an entry has not been rated yet.
 * keys: character id -> the recognition key its rating belongs to (see keys.js).
 * relations, relationKeys: the same per pair of characters (remix: relationships), from 0 (open
 *   conflict) to 1 (full harmony), or ABSENT when the two do not deal with each other in the sentence.
 */
export function makeSentence(text = "", source = "user", fortunes = {}, relations = {}) {
  return {
    id: nextId++,
    text,
    source,
    fortunes: { ...fortunes },
    keys: {},
    relations: { ...relations },
    relationKeys: {},
    pending: false,
    draft: false,
    gen: null,
  };
}

export const state = {
  title: "",
  characters: [makeCharacter("", 0, PROTAGONIST_ID)], // the first one is the protagonist
  activeCharacter: PROTAGONIST_ID, // whose line the pen draws
  sentences: [],
  sketch: Sk.emptySketch(0),
  surpriseEnabled: false,
  relationsEnabled: false, // remix: the relationship panel is shown and its lines are used
  activePair: null, // remix: the pair whose relationship line the pen draws
  tool: "pen",
  history: [], // stored stories (Figure 5)
  activeHistoryId: null,
  storyCounter: 0,
  // model: the Claude model that writes the sentences (remix); null means the main LLM bridge's model.
  settings: { pipeline: "batch", threshold: DEFAULT_THRESHOLD, model: null },
  ui: {
    generating: false,
    targets: [],
    status: "",
    statusKind: "",
    focusSlot: null,
    linkSlot: null,
    historyOpen: false,
    previewId: null,
    bridge: null,
    recognizing: false,
    strokeMarks: new Map(), // sentence id -> ids of the characters whose new strokes cover it, not generated yet (main.js)
  },
};

// ---------------------------------------------------------------- characters

export function isMulti() {
  return state.characters.length > 1;
}

export function protagonist() {
  return state.characters[0];
}

export function activeCharacter() {
  return state.characters.find((c) => c.id === state.activeCharacter) || state.characters[0];
}

/** The name shown for a character ("the protagonist" when the protagonist has no name). */
export function labelOf(id) {
  const k = state.characters.findIndex((c) => c.id === id);
  return labels(state.characters)[Math.max(0, k)];
}

/** A sentence's rating for one character: a number, or null when absent or not rated. */
export function ratingOf(s, id) {
  const v = s?.fortunes?.[id];
  return isRating(v) ? v : null;
}

// ---------------------------------------------------------------- pairs (remix: relationships)

/** True when the relationship panel is in use: it is switched on and there are two or more characters. */
export function relationsOn() {
  return state.relationsEnabled && isMulti();
}

/** Every pair of the current characters: [{ key, a, b }]. */
export function pairs() {
  return pairsOf(state.characters);
}

/** The pair whose line the pen draws on the relationship panel (the first pair by default). */
export function activePair() {
  const all = pairs();
  return all.find((p) => p.key === state.activePair) || all[0] || null;
}

/** A sentence's relationship rating for one pair: a number, or null when absent or not rated. */
export function relationOf(s, key) {
  const v = s?.relations?.[key];
  return isRating(v) ? v : null;
}

export function addCharacter(name = "") {
  if (state.characters.length >= MAX_CHARACTERS) return null;
  const c = makeCharacter(name, freeColor(state.characters));
  state.characters.push(c);
  Sk.lineOf(state.sketch, c.id, state.sentences.length);
  state.activeCharacter = c.id;
  return c;
}

export function removeCharacter(id) {
  const k = state.characters.findIndex((c) => c.id === id);
  if (k <= 0) return; // the protagonist stays
  state.characters.splice(k, 1);
  delete state.sketch.fortunes[id];
  // Remove the relationship lines and ratings of every pair this character was part of.
  const ids = state.characters.map((c) => c.id);
  const gone = (key) => !pairOfIds(key, ids);
  for (const key of Object.keys(state.sketch.relations || {})) if (gone(key)) delete state.sketch.relations[key];
  for (const s of state.sentences) {
    delete s.fortunes[id];
    delete s.keys[id];
    for (const key of Object.keys(s.relations)) {
      if (gone(key)) {
        delete s.relations[key];
        delete s.relationKeys[key];
      }
    }
  }
  for (const [sid, marks] of state.ui.strokeMarks) {
    marks.delete(id);
    for (const mark of [...marks]) if (mark.startsWith("pair:") && gone(mark.slice(5))) marks.delete(mark);
    if (!marks.size) state.ui.strokeMarks.delete(sid);
  }
  if (state.activeCharacter === id) state.activeCharacter = state.characters[0].id;
  if (state.activePair && gone(state.activePair)) state.activePair = null;
}

// ---------------------------------------------------------------- change notification

const listeners = new Set();
let frame = 0;

export function subscribe(fn) {
  listeners.add(fn);
}

function notify() {
  frame = 0;
  for (const fn of listeners) fn(state);
}

/** Re-render on the next animation frame (and save, unless persist is false). */
export function changed({ persist = true } = {}) {
  if (persist) schedulePersist();
  if (!frame) frame = requestAnimationFrame(notify);
}

/** Re-render immediately, e.g. before moving the text cursor to a new bullet. */
export function renderNow() {
  if (frame) cancelAnimationFrame(frame);
  notify();
}

export function setStatus(message, kind = "info") {
  state.ui.status = message;
  state.ui.statusKind = kind;
  changed({ persist: false });
}

// ---------------------------------------------------------------- story edits

/** Start a story. `characters` (names) is optional; without it the story has one protagonist. */
export function newStory({ title = "", protagonist = "", characters = null, texts = [], bullets = DEFAULT_BULLETS } = {}) {
  const list = texts.slice();
  while (list.length < bullets) list.push("");
  const names = Array.isArray(characters) && characters.length ? characters.slice(0, MAX_CHARACTERS) : [protagonist];
  state.title = title;
  state.characters = names.map((name, k) => makeCharacter(name, k, k === 0 ? PROTAGONIST_ID : null));
  state.activeCharacter = PROTAGONIST_ID;
  state.sentences = list.map((t) => makeSentence(t, "user"));
  state.sketch = Sk.emptySketch(state.sentences.length, state.characters.map((c) => c.id));
  state.surpriseEnabled = false;
  state.relationsEnabled = false;
  state.activePair = null;
  state.activeHistoryId = null;
  state.ui.strokeMarks.clear();
}

export function insertSentence(index, text = "", source = "user") {
  state.sentences.splice(index, 0, makeSentence(text, source));
  Sk.insertSlot(state.sketch, index);
}

export function removeSentence(index) {
  const [gone] = state.sentences.splice(index, 1);
  if (gone) state.ui.strokeMarks.delete(gone.id);
  Sk.deleteSlot(state.sketch, index);
  if (!state.sentences.length) insertSentence(0);
}

/** Text typed by the writer. Editing a generated sentence makes it the writer's. */
export function setSentenceText(index, text) {
  const s = state.sentences[index];
  if (!s || s.text === text) return;
  s.text = text;
  s.draft = false;
  if (s.source === "generated") {
    s.source = "user";
    s.gen = null;
  }
}

// ---------------------------------------------------------------- saving in the browser

let persistTimer = 0;

function schedulePersist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 400);
}

export function persist() {
  try {
    const data = {
      version: 2,
      title: state.title,
      characters: state.characters,
      activeCharacter: state.activeCharacter,
      sentences: state.sentences.map((s) => ({
        text: s.text,
        source: s.source,
        fortunes: s.fortunes,
        keys: s.keys,
        relations: s.relations,
        relationKeys: s.relationKeys,
        gen: s.gen,
      })),
      sketch: state.sketch,
      surpriseEnabled: state.surpriseEnabled,
      relationsEnabled: state.relationsEnabled,
      activePair: state.activePair,
      tool: state.tool,
      history: state.history.slice(-HISTORY_LIMIT),
      activeHistoryId: state.activeHistoryId,
      storyCounter: state.storyCounter,
      settings: state.settings,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("TaleBrush could not save the story in this browser:", e);
  }
}

const str = (v) => (typeof v === "string" ? v : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Check a stored story of the History list and bring it to the current form. Stories stored
 * before the remix have one protagonist name, one fortune per sentence and one sketched line.
 * Returns null for an entry that cannot be used.
 */
export function upgradeSnapshot(h) {
  if (!h || typeof h.id !== "string" || typeof h.name !== "string" || !Array.isArray(h.sentences) || !h.sketch) {
    return null;
  }
  const characters = normalizeCharacters(h.characters, h.protagonist);
  const ids = characters.map((c) => c.id);
  return {
    id: h.id,
    name: h.name,
    createdAt: num(h.createdAt) ?? 0,
    title: str(h.title),
    characters,
    sentences: h.sentences.map((s) => ({
      text: str(s?.text),
      source: s?.source === "generated" ? "generated" : "user",
      fortunes: normalizeRatings(s, ids),
      relations: normalizePairRatings(s?.relations, ids),
    })),
    sketch: Sk.normalizeSketch(h.sketch, h.sentences.length, ids),
    surpriseEnabled: !!h.surpriseEnabled,
    relationsEnabled: !!h.relationsEnabled,
    model: typeof h.model === "string" ? h.model : null, // the model that wrote this story (remix)
  };
}

/** Load the last session from localStorage. Returns false (and starts fresh) if there is none. */
export function restore() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    data = null;
  }
  if (!data || (data.version !== 1 && data.version !== 2) || !Array.isArray(data.sentences) || !data.sentences.length) {
    newStory();
    return false;
  }
  state.title = str(data.title);
  state.characters = normalizeCharacters(data.characters, data.protagonist); // version 1 stored one protagonist
  const ids = state.characters.map((c) => c.id);
  state.activeCharacter = ids.includes(data.activeCharacter) ? data.activeCharacter : ids[0];
  state.sentences = data.sentences.map((s) => {
    const x = makeSentence(
      str(s?.text),
      s?.source === "generated" ? "generated" : "user",
      normalizeRatings(s, ids),
      normalizePairRatings(s?.relations, ids),
    );
    if (s?.relationKeys && typeof s.relationKeys === "object") {
      for (const key of Object.keys(x.relations)) if (typeof s.relationKeys[key] === "string") x.relationKeys[key] = s.relationKeys[key];
    }
    if (s?.keys && typeof s.keys === "object") {
      for (const id of ids) if (typeof s.keys[id] === "string") x.keys[id] = s.keys[id];
    } else if (typeof s?.fortuneKey === "string") {
      x.keys[ids[0]] = s.fortuneKey; // version 1: the protagonist's key has the same form
    }
    x.gen = s?.gen && typeof s.gen === "object" ? s.gen : null;
    return x;
  });
  state.sketch = Sk.normalizeSketch(data.sketch, state.sentences.length, ids);
  state.surpriseEnabled = !!data.surpriseEnabled;
  state.relationsEnabled = !!data.relationsEnabled;
  state.activePair = typeof data.activePair === "string" && pairOfIds(data.activePair, ids) ? data.activePair : null;
  state.tool = data.tool === "eraser" ? "eraser" : "pen";
  state.history = Array.isArray(data.history) ? data.history.map(upgradeSnapshot).filter(Boolean) : [];
  state.activeHistoryId = state.history.some((h) => h.id === data.activeHistoryId) ? data.activeHistoryId : null;
  state.storyCounter = num(data.storyCounter) ?? state.history.length;
  state.settings = {
    pipeline: data.settings?.pipeline === "sequential" ? "sequential" : "batch",
    threshold: num(data.settings?.threshold) ?? DEFAULT_THRESHOLD,
    model: typeof data.settings?.model === "string" ? data.settings.model : null,
  };
  return true;
}

