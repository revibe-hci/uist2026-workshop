// The sketch data model. Pure functions, no DOM, so they can be tested with Node.
//
// A sketch has sample arrays with SAMPLES_PER_SLOT samples per sentence slot:
//   fortunes[characterId][j] = [fortune 0..1, envelope half-width] or null where nothing is drawn
//                              (one line per character; the remix allows several characters)
//   surprise[j]              = surprise 0..1 or null
// x positions are in "slot units": slot i spans [i, i + 1).
// Storing samples per slot keeps the sketch lined up with its sentences when the
// writer adds or removes a bullet point.

import { SAMPLES_PER_SLOT as S, SLOT_COVERAGE, ENVELOPE } from "./config.js";
import { PROTAGONIST_ID } from "./characters.js";

const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const present = (v) => v !== null && v !== undefined;
const blank = (n) => new Array(n * S).fill(null);

export function emptySketch(n, ids = [PROTAGONIST_ID]) {
  const fortunes = {};
  for (const id of ids) fortunes[id] = blank(n);
  return { fortunes, surprise: blank(n) };
}

/**
 * Copy a stored sketch, dropping invalid samples and fitting it to n slots and the given
 * character ids. A sketch stored before the remix has one `fortune` array: the protagonist's.
 */
export function normalizeSketch(sketch, n, ids = [PROTAGONIST_ID]) {
  const fix = (arr, ok) => {
    const out = blank(n);
    if (Array.isArray(arr)) {
      for (let j = 0; j < Math.min(arr.length, out.length); j++) if (ok(arr[j])) out[j] = arr[j];
    }
    return out;
  };
  const okFortune = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
  const src = sketch?.fortunes && typeof sketch.fortunes === "object" ? sketch.fortunes : { [ids[0]]: sketch?.fortune };
  const fortunes = {};
  for (const id of ids) fortunes[id] = fix(src[id], okFortune);
  return { fortunes, surprise: fix(sketch?.surprise, (v) => Number.isFinite(v)) };
}

/** A character's line, created empty if the character has none yet. */
export function lineOf(sketch, id, n) {
  if (!Array.isArray(sketch.fortunes[id])) sketch.fortunes[id] = blank(n);
  return sketch.fortunes[id];
}

function allArrays(sketch) {
  return [...Object.values(sketch.fortunes), sketch.surprise];
}

export function insertSlot(sketch, index) {
  for (const arr of allArrays(sketch)) arr.splice(index * S, 0, ...new Array(S).fill(null));
}

export function deleteSlot(sketch, index) {
  for (const arr of allArrays(sketch)) arr.splice(index * S, S);
}

/** True when any character's line has samples. */
export function anyLine(sketch) {
  return Object.values(sketch.fortunes).some(hasSamples);
}

function sampleRange(total, x0, x1) {
  const a = Math.floor(Math.min(x0, x1) * S);
  const b = Math.floor(Math.max(x0, x1) * S);
  return [Math.max(0, a), Math.min(total - 1, b)];
}

function valueAt(j, x0, v0, x1, v1) {
  if (x1 === x0) return v1;
  const t = clamp01(((j + 0.5) / S - x0) / (x1 - x0));
  return v0 + t * (v1 - v0);
}

/** Draw a straight piece of a fortune stroke from (x0, f0) to (x1, f1). */
export function writeFortune(arr, x0, f0, x1, f1, halfWidth, touched) {
  const [a, b] = sampleRange(arr.length, x0, x1);
  for (let j = a; j <= b; j++) {
    arr[j] = [r3(clamp01(valueAt(j, x0, f0, x1, f1))), r3(halfWidth)];
    touched?.add(j);
  }
}

/** Draw a straight piece of a surprise stroke. */
export function writeSurprise(arr, x0, s0, x1, s1, touched) {
  const [a, b] = sampleRange(arr.length, x0, x1);
  for (let j = a; j <= b; j++) {
    arr[j] = r3(clamp01(valueAt(j, x0, s0, x1, s1)));
    touched?.add(j);
  }
}

function centerIn(i, has) {
  return has(i * S + S / 2) || has(i * S + S / 2 - 1);
}

/**
 * Per-slot reading of the fortune sketch: is the slot sketched, its target fortune
 * (mean y of the line over the slot), the mean envelope half-width, and how many
 * regenerations that width allows (slow, thin strokes: 2; fast, wide strokes: 1).
 */
export function fortuneSlots(arr, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let count = 0;
    let sumF = 0;
    let sumH = 0;
    for (let j = i * S; j < (i + 1) * S; j++) {
      const v = arr[j];
      if (v) {
        count++;
        sumF += v[0];
        sumH += v[1];
      }
    }
    const sketched = count > 0 && (count / S >= SLOT_COVERAGE || centerIn(i, (j) => !!arr[j]));
    const halfWidth = count ? sumH / count : null;
    out.push({
      index: i,
      coverage: count / S,
      sketched,
      fortune: count ? sumF / count : null,
      halfWidth,
      maxRegen: sketched ? (halfWidth < ENVELOPE.tightBelow ? 2 : 1) : 0,
    });
  }
  return out;
}

/**
 * Per-slot reading of every character's line (in the order of `ids`). A slot is sketched when
 * any character's line covers it. Its retries follow the slowest stroke over it.
 */
export function castSlots(sketch, ids, n) {
  const per = ids.map((id) => fortuneSlots(sketch.fortunes[id] || [], n));
  const out = [];
  for (let i = 0; i < n; i++) {
    const characters = per.map((p) => p[i]);
    out.push({
      index: i,
      sketched: characters.some((c) => c.sketched),
      characters,
      maxRegen: Math.max(0, ...characters.map((c) => c.maxRegen)),
    });
  }
  return out;
}

/** Per-slot surprise value, or null where the surprise panel has no line. */
export function surpriseSlots(arr, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let count = 0;
    let sum = 0;
    for (let j = i * S; j < (i + 1) * S; j++) {
      if (present(arr[j])) {
        count++;
        sum += arr[j];
      }
    }
    const sketched = count > 0 && (count / S >= SLOT_COVERAGE || centerIn(i, (j) => present(arr[j])));
    out.push(sketched ? sum / count : null);
  }
  return out;
}

/** [first, last] sketched slot, or null when nothing is sketched. */
export function extentOf(slots) {
  let first = -1;
  let last = -1;
  slots.forEach((s, i) => {
    if (s.sketched) {
      if (first < 0) first = i;
      last = i;
    }
  });
  return first < 0 ? null : [first, last];
}

/** Slots that a single stroke covered (same rule as fortuneSlots, on the stroke's samples only). */
export function touchedSlots(touched, n) {
  const counts = new Array(n).fill(0);
  for (const j of touched) {
    const i = Math.floor(j / S);
    if (i < n) counts[i]++;
  }
  const out = [];
  for (let i = 0; i < n; i++) {
    if (counts[i] && (counts[i] / S >= SLOT_COVERAGE || centerIn(i, (j) => touched.has(j)))) out.push(i);
  }
  return out;
}

/** Index ranges [a, b] of consecutive drawn samples. */
export function runsOf(arr) {
  const runs = [];
  let start = -1;
  for (let j = 0; j <= arr.length; j++) {
    const on = j < arr.length && present(arr[j]);
    if (on && start < 0) start = j;
    if (!on && start >= 0) {
      runs.push([start, j - 1]);
      start = -1;
    }
  }
  return runs;
}

export function hasSamples(arr) {
  return arr.some(present);
}

/** Moving average over a run, used only for drawing (the width changes gradually on screen). */
export function smoothRun(arr, a, b, radius, pick) {
  const out = [];
  for (let j = a; j <= b; j++) {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(a, j - radius); k <= Math.min(b, j + radius); k++) {
      sum += pick(arr[k]);
      count++;
    }
    out.push(sum / count);
  }
  return out;
}
