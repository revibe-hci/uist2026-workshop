// What a sentence's fortune depends on: the character, up to three previous sentences (the
// paper's recognition context) and the sentence itself.

import { modelNames } from "./characters.js";

const squash = (t) => t.replace(/\s+/g, " ").trim();

export function contextFor(sentences, index) {
  const prev = [];
  for (let i = index - 1; i >= 0 && prev.length < 3; i--) {
    const t = squash(sentences[i].text);
    if (t) prev.unshift(t);
  }
  return prev;
}

/**
 * The key of one character's rating of one sentence. The protagonist's key has the same form as
 * before the remix, so ratings stored by the one-character version stay valid. Other characters'
 * keys are marked "side", because they are rated with a different prompt (they may be absent).
 */
export function recognitionKey(name, sentences, index, side = false) {
  const key = [squash(name), contextFor(sentences, index), squash(sentences[index].text)];
  if (side) key.push("side");
  return JSON.stringify(key);
}

/** The keys of every character's rating of sentence `index`, in character order. */
export function ratingKeys(characters, sentences, index, names = modelNames(characters)) {
  return characters.map((c, k) => recognitionKey(names[k], sentences, index, k > 0));
}
