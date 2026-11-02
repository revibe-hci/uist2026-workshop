// Fortune recognition for the writer's own sentences (Section 4.2.1: every bullet is a dot
// whose height comes from the recognition module). Sentences are rated in one batch a moment
// after the writer stops typing; answers are cached by recognition key.
//
// Remix: every sentence is rated once per character. Each character's rating has its own key
// (keys.js), so adding or renaming a character rates only that character's sentences again.
//
// Remix (relationships): while the relationship panel is on, every sentence is also rated once
// per pair of characters, in a second request sent at the same time as the fortune request.

import { ABSENT, isRating, namedCast, pairsOf } from "./characters.js";
import { RECOGNITION_DELAY_MS } from "./config.js";
import { contextFor, ratingKeys, relationKeys } from "./keys.js";
import { changed, relationsOn, setStatus, state } from "./store.js";
import * as api from "./api.js";

const cache = new Map(); // recognition key -> fortune or ABSENT
const relationCache = new Map(); // relationship key -> relationship or ABSENT
let timer = 0;
let running = false;
let again = false;

const usable = (v) => isRating(v) || v === ABSENT;

export function rememberFortune(key, value) {
  if (usable(value)) cache.set(key, value);
}

export function rememberRelation(key, value) {
  if (usable(value)) relationCache.set(key, value);
}

export function scheduleRecognition(delay = RECOGNITION_DELAY_MS) {
  clearTimeout(timer);
  timer = setTimeout(runRecognition, delay);
}

/** Sentences whose fortune ratings are missing or out of date, with the character indices to rate. */
function fortuneItems(characters, names) {
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
  return items;
}

/** The same for the relationship ratings of every pair (a and b index into `names`). */
function relationItems(pairList, names) {
  const items = [];
  if (!pairList.length) return items;
  state.sentences.forEach((s, i) => {
    const text = s.text.trim();
    if (!text) return;
    const keys = relationKeys(pairList, names, state.sentences, i);
    const rate = [];
    pairList.forEach((p, k) => {
      if (s.relationKeys[p.key] === keys[k]) return;
      if (relationCache.has(keys[k])) {
        s.relations[p.key] = relationCache.get(keys[k]);
        s.relationKeys[p.key] = keys[k];
        return;
      }
      rate.push(k);
    });
    if (rate.length) items.push({ id: s.id, keys, rate, context: contextFor(state.sentences, i), sentence: text });
  });
  return items;
}

async function runRecognition() {
  if (state.ui.generating) return; // generation rates its own sentences, then schedules this again
  if (running) {
    again = true;
    return;
  }
  const { characters, names } = namedCast(state.characters); // a character without a name is not rated
  const pairList = relationsOn() ? pairsOf(characters) : []; // pairs of named characters only
  const items = fortuneItems(characters, names);
  const pairItems = relationItems(pairList, names);
  if (!items.length && !pairItems.length) {
    changed();
    return;
  }
  const byId = (id) => state.sentences.find((s) => s.id === id);
  for (const it of [...items, ...pairItems]) byId(it.id).pending = true;
  running = true;
  state.ui.recognizing = true;
  changed({ persist: false });
  const request = (list) => list.map(({ context, sentence, rate }) => ({ context, sentence, rate }));
  const [fortuneRows, relationRows] = await Promise.allSettled([
    items.length ? api.recognize(names, request(items)) : Promise.resolve([]),
    pairItems.length
      ? api.recognizeRelations(
          names,
          pairList.map((p) => [p.a, p.b]),
          request(pairItems),
        )
      : Promise.resolve([]),
  ]);
  const sameCast = names.join("\n") === namedCast(state.characters).names.join("\n");
  const failures = [];
  if (fortuneRows.status === "fulfilled") {
    items.forEach((it, j) => {
      const row = fortuneRows.value[j] || [];
      for (const k of it.rate) rememberFortune(it.keys[k], row[k]);
      const s = byId(it.id);
      if (!s || !sameCast) return; // a character was added, removed or renamed while we waited
      // Apply only if the sentence and its context did not change while we waited.
      const now = ratingKeys(state.characters, state.sentences, state.sentences.indexOf(s), names);
      for (const k of it.rate) {
        if (usable(row[k]) && now[k] === it.keys[k]) {
          s.fortunes[characters[k].id] = row[k];
          s.keys[characters[k].id] = it.keys[k];
        }
      }
    });
  } else {
    failures.push(`Fortune recognition failed: ${fortuneRows.reason?.message || fortuneRows.reason}`);
  }
  if (relationRows.status === "fulfilled") {
    pairItems.forEach((it, j) => {
      const row = relationRows.value[j] || [];
      for (const k of it.rate) rememberRelation(it.keys[k], row[k]);
      const s = byId(it.id);
      if (!s || !sameCast) return;
      const now = relationKeys(pairList, names, state.sentences, state.sentences.indexOf(s));
      for (const k of it.rate) {
        if (usable(row[k]) && now[k] === it.keys[k]) {
          s.relations[pairList[k].key] = row[k];
          s.relationKeys[pairList[k].key] = it.keys[k];
        }
      }
    });
  } else {
    failures.push(`Relationship recognition failed: ${relationRows.reason?.message || relationRows.reason}`);
  }
  for (const it of [...items, ...pairItems]) {
    const s = byId(it.id);
    if (s) s.pending = false;
  }
  if (failures.length) {
    setStatus(failures.join(" "), "error");
  } else if (state.ui.statusKind === "error" && /^(Fortune|Relationship) recognition/.test(state.ui.status)) {
    setStatus("");
  }
  running = false;
  state.ui.recognizing = false;
  changed();
  if (again) {
    again = false;
    scheduleRecognition(0);
  }
}
