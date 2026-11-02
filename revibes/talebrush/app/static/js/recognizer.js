// Fortune recognition for the writer's own sentences (Section 4.2.1: every bullet is a dot
// whose height comes from the recognition module). Sentences are rated in one batch a moment
// after the writer stops typing; answers are cached by recognition key.
//
// Remix: every sentence is rated once per character. Each character's rating has its own key
// (keys.js), so adding or renaming a character rates only that character's sentences again.

import { ABSENT, isRating, namedCast } from "./characters.js";
import { RECOGNITION_DELAY_MS } from "./config.js";
import { contextFor, ratingKeys } from "./keys.js";
import { changed, setStatus, state } from "./store.js";
import * as api from "./api.js";

const cache = new Map(); // recognition key -> fortune or ABSENT
let timer = 0;
let running = false;
let again = false;

const usable = (v) => isRating(v) || v === ABSENT;

export function rememberFortune(key, value) {
  if (usable(value)) cache.set(key, value);
}

export function scheduleRecognition(delay = RECOGNITION_DELAY_MS) {
  clearTimeout(timer);
  timer = setTimeout(runRecognition, delay);
}

async function runRecognition() {
  if (state.ui.generating) return; // generation rates its own sentences, then schedules this again
  if (running) {
    again = true;
    return;
  }
  const { characters, names } = namedCast(state.characters); // a character without a name is not rated
  const items = [];
  state.sentences.forEach((s, i) => {
    const text = s.text.trim();
    if (!text) {
      s.pending = false;
      return;
    }
    const keys = ratingKeys(characters, state.sentences, i, names);
    const rate = [];
    characters.forEach((c, k) => {
      if (s.keys[c.id] === keys[k]) return;
      if (cache.has(keys[k])) {
        s.fortunes[c.id] = cache.get(keys[k]);
        s.keys[c.id] = keys[k];
        return;
      }
      rate.push(k);
    });
    if (rate.length) items.push({ id: s.id, keys, rate, context: contextFor(state.sentences, i), sentence: text });
  });
  if (!items.length) {
    changed();
    return;
  }
  const byId = (id) => state.sentences.find((s) => s.id === id);
  items.forEach((it) => (byId(it.id).pending = true));
  running = true;
  state.ui.recognizing = true;
  changed({ persist: false });
  try {
    const rows = await api.recognize(
      names,
      items.map(({ context, sentence, rate }) => ({ context, sentence, rate })),
    );
    const sameCast = names.join("\n") === namedCast(state.characters).names.join("\n");
    items.forEach((it, j) => {
      const row = rows[j] || [];
      const s = byId(it.id);
      for (const k of it.rate) rememberFortune(it.keys[k], row[k]);
      if (!s) return;
      s.pending = false;
      if (!sameCast) return; // a character was added, removed or renamed while we waited
      // Apply only if the sentence and its context did not change while we waited.
      const now = ratingKeys(state.characters, state.sentences, state.sentences.indexOf(s), names);
      for (const k of it.rate) {
        if (usable(row[k]) && now[k] === it.keys[k]) {
          s.fortunes[characters[k].id] = row[k];
          s.keys[characters[k].id] = it.keys[k];
        }
      }
    });
    if (state.ui.statusKind === "error" && state.ui.status.startsWith("Fortune recognition")) setStatus("");
  } catch (e) {
    items.forEach((it) => {
      const s = byId(it.id);
      if (s) s.pending = false;
    });
    setStatus(`Fortune recognition failed: ${e.message}`, "error");
  } finally {
    running = false;
    state.ui.recognizing = false;
    changed();
    if (again) {
      again = false;
      scheduleRecognition(0);
    }
  }
}
