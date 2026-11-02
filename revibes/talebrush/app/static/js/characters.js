// The characters whose fortune the writer sketches (remix: several characters' fortunes).
//
// The paper sketches one line, the protagonist's fortune. This remix lets the writer add up
// to three more characters. Each character has its own line on the fortune canvas, in its own
// colour, and each sentence gets one recognized fortune per character. The first character is
// always the protagonist. Pure functions only (no DOM, no state), so they can be tested with Node.

export const MAX_CHARACTERS = 4;

// The protagonist keeps the same id in every story, so stored stories line up in the History view.
export const PROTAGONIST_ID = "c0";

// A rating that means "this sentence does not involve this character". The protagonist is never
// rated ABSENT (the paper always rates the protagonist).
export const ABSENT = "absent";

// One colour per character: its line, its envelope hatching and its recognized fortune. The
// hatching angle differs per character, so overlapping envelopes stay apart.
export const PALETTE = [
  { line: "#3b7dd8", fill: "rgba(59, 125, 216, 0.12)", hatch: "#8db4ea", angle: -50 },
  { line: "#de7428", fill: "rgba(222, 116, 40, 0.12)", hatch: "#f0ac78", angle: 40 },
  { line: "#8a58cc", fill: "rgba(138, 88, 204, 0.12)", hatch: "#c0a0e6", angle: -15 },
  { line: "#d0457e", fill: "rgba(208, 69, 126, 0.12)", hatch: "#eba0bf", angle: 75 },
];

const squash = (t) => String(t ?? "").replace(/\s+/g, " ").trim();

export const isRating = (v) => typeof v === "number" && Number.isFinite(v);

export function newCharacterId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function makeCharacter(name = "", color = 0, id = null) {
  return { id: id || newCharacterId(), name, color };
}

/** The first palette colour no character uses yet. */
export function freeColor(characters) {
  const used = new Set(characters.map((c) => c.color));
  for (let k = 0; k < PALETTE.length; k++) if (!used.has(k)) return k;
  return characters.length % PALETTE.length;
}

/**
 * The names sent to the model and used in recognition keys. The protagonist's name is used as
 * typed (an empty name means "the protagonist"); an unnamed other character is "Character N";
 * a repeated name gets the character's number, so every character can be told apart.
 */
export function modelNames(characters) {
  const seen = new Set();
  return characters.map((c, k) => {
    let name = squash(c.name) || (k === 0 ? "" : `Character ${k + 1}`);
    if (name && seen.has(name.toLowerCase())) name = `${name} (${k + 1})`;
    if (name) seen.add(name.toLowerCase());
    return name;
  });
}

/**
 * The characters the model hears about, with their model names: the protagonist and every other
 * character that has a name. A character added but not named yet is left out until it gets one.
 */
export function namedCast(characters) {
  const names = modelNames(characters);
  const keep = characters.map((c, k) => k).filter((k) => k === 0 || squash(characters[k].name));
  return { characters: keep.map((k) => characters[k]), names: keep.map((k) => names[k]) };
}

/** The names shown in the interface. */
export function labels(characters) {
  return modelNames(characters).map((n) => n || "the protagonist");
}

/** Check a stored character list. Old stories (one protagonist name) become one character. */
export function normalizeCharacters(list, legacyName = "") {
  const out = [];
  const ids = new Set();
  if (Array.isArray(list)) {
    for (const c of list) {
      if (!c || typeof c.id !== "string" || ids.has(c.id) || out.length >= MAX_CHARACTERS) continue;
      const color = Number.isInteger(c.color) && c.color >= 0 && c.color < PALETTE.length ? c.color : freeColor(out);
      out.push({ id: c.id, name: typeof c.name === "string" ? c.name : "", color });
      ids.add(c.id);
    }
  }
  if (!out.length) out.push(makeCharacter(typeof legacyName === "string" ? legacyName : "", 0, PROTAGONIST_ID));
  return out;
}

/** A sentence's ratings, one per character id. Old stories stored one number, the protagonist's. */
export function normalizeRatings(sentence, ids) {
  const out = {};
  const src = sentence?.fortunes;
  if (src && typeof src === "object") {
    for (const id of ids) {
      const v = src[id];
      if (isRating(v) || (v === ABSENT && id !== ids[0])) out[id] = v;
    }
  } else if (isRating(sentence?.fortune)) {
    out[ids[0]] = sentence.fortune;
  }
  return out;
}
