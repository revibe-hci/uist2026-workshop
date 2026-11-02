// Tests for the front end's pure modules (no browser needed).
// Run from revibes/talebrush/app/:   node --test tests/

import assert from "node:assert/strict";
import test from "node:test";

import {
  ABSENT,
  PROTAGONIST_ID,
  freeColor,
  modelNames,
  namedCast,
  normalizeCharacters,
  normalizeRatings,
} from "../static/js/characters.js";
import { SAMPLES_PER_SLOT as S, halfWidthForSpeed, ENVELOPE } from "../static/js/config.js";
import { monotoneSegments } from "../static/js/geometry.js";
import { ratingKeys, recognitionKey } from "../static/js/keys.js";
import * as Sk from "../static/js/sketch.js";
import { splitSentences } from "../static/js/editor.js";

test("a stroke across slots 2 to 4 sketches exactly those slots", () => {
  const sketch = Sk.emptySketch(6);
  const touched = new Set();
  Sk.writeFortune(sketch.fortunes.c0, 2.0, 0.2, 4.99, 0.8, 0.05, touched);
  const slots = Sk.fortuneSlots(sketch.fortunes.c0, 6);
  assert.deepEqual(slots.map((s) => s.sketched), [false, false, true, true, true, false]);
  assert.deepEqual(Sk.touchedSlots(touched, 6), [2, 3, 4]);
  assert.ok(slots[2].fortune < slots[3].fortune && slots[3].fortune < slots[4].fortune);
  assert.deepEqual(Sk.extentOf(slots), [2, 4]);
});

test("slow strokes (thin envelope) allow 2 retries, fast strokes 1", () => {
  const thin = halfWidthForSpeed(0.05);
  const wide = halfWidthForSpeed(3);
  assert.equal(thin, ENVELOPE.minHalfWidth);
  assert.equal(wide, ENVELOPE.maxHalfWidth);
  const sketch = Sk.emptySketch(2);
  Sk.writeFortune(sketch.fortunes.c0, 0, 0.5, 0.99, 0.5, thin);
  Sk.writeFortune(sketch.fortunes.c0, 1, 0.5, 1.99, 0.5, wide);
  assert.deepEqual(Sk.fortuneSlots(sketch.fortunes.c0, 2).map((s) => s.maxRegen), [2, 1]);
});

test("a slot counts as sketched when the line passes its centre", () => {
  const sketch = Sk.emptySketch(3);
  Sk.writeFortune(sketch.fortunes.c0, 1.3, 0.5, 1.7, 0.5, 0.1); // covers 40% of slot 1, including the centre
  assert.deepEqual(Sk.fortuneSlots(sketch.fortunes.c0, 3).map((s) => s.sketched), [false, true, false]);
  const edge = Sk.emptySketch(3);
  Sk.writeFortune(edge.fortunes.c0, 1.0, 0.5, 1.4, 0.5, 0.1); // stops before the centre
  assert.equal(Sk.fortuneSlots(edge.fortunes.c0, 3)[1].sketched, false);
});

test("erased slots inside the sketch are gaps; the extent still spans them", () => {
  const sketch = Sk.emptySketch(5);
  Sk.writeFortune(sketch.fortunes.c0, 0, 0.5, 4.99, 0.5, 0.1);
  for (let j = 2 * S; j < 3 * S; j++) sketch.fortunes.c0[j] = null;
  const slots = Sk.fortuneSlots(sketch.fortunes.c0, 5);
  assert.equal(slots[2].sketched, false);
  assert.deepEqual(Sk.extentOf(slots), [0, 4]);
  assert.equal(Sk.runsOf(sketch.fortunes.c0).length, 2);
});

test("adding or removing a bullet keeps the sketch lined up with its sentences", () => {
  const sketch = Sk.emptySketch(3);
  Sk.writeFortune(sketch.fortunes.c0, 1, 0.9, 1.99, 0.9, 0.1);
  Sk.insertSlot(sketch, 0);
  assert.equal(sketch.fortunes.c0.length, 4 * S);
  assert.deepEqual(Sk.fortuneSlots(sketch.fortunes.c0, 4).map((s) => s.sketched), [false, false, true, false]);
  Sk.deleteSlot(sketch, 2);
  assert.deepEqual(Sk.fortuneSlots(sketch.fortunes.c0, 3).map((s) => s.sketched), [false, false, false]);
});

test("surprise values per slot", () => {
  const sketch = Sk.emptySketch(3);
  Sk.writeSurprise(sketch.surprise, 0, 0, 0.99, 0); // a value of 0 must still count as drawn
  assert.deepEqual(Sk.surpriseSlots(sketch.surprise, 3), [0, null, null]);
});

test("stored sketches are cleaned and resized; a sketch from before the remix becomes the protagonist's line", () => {
  const fixed = Sk.normalizeSketch({ fortune: [[0.5, 0.1], "bad", null], surprise: [0.2] }, 1);
  assert.equal(fixed.fortunes.c0.length, S);
  assert.deepEqual(fixed.fortunes.c0.slice(0, 3), [[0.5, 0.1], null, null]);
  assert.equal(fixed.surprise[0], 0.2);
  const two = Sk.normalizeSketch({ fortunes: { c0: [[0.5, 0.1]], x: [null, [0.2, 0.05]] }, surprise: [] }, 1, ["c0", "x"]);
  assert.deepEqual(two.fortunes.x.slice(0, 2), [null, [0.2, 0.05]]);
});

test("monotone curve has one piece per pair of dots", () => {
  const pieces = monotoneSegments([{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 5 }, { x: 30, y: 5 }]);
  assert.equal(pieces.length, 3);
  assert.match(pieces[0], /^M0,10C/);
});

test("recognition key uses at most three previous sentences", () => {
  const sentences = ["A.", "", "B.", "C.", "D.", "E."].map((text) => ({ text }));
  assert.equal(recognitionKey(" Mike ", sentences, 5), JSON.stringify(["Mike", ["B.", "C.", "D."], "E."]));
});

test("pasted text is split into sentences", () => {
  assert.deepEqual(splitSentences("Mike played. He won! Then? \nNew line"), ["Mike played.", "He won!", "Then?", "New line"]);
  assert.deepEqual(splitSentences('She said "Hi." Then left.'), ['She said "Hi."', "Then left."]);
});

// ---------------------------------------------------------------- several characters (remix)

test("the sketched range and the retries cover every character's line", () => {
  const sketch = Sk.emptySketch(6, ["c0", "a"]);
  Sk.writeFortune(sketch.fortunes.c0, 1, 0.8, 2.99, 0.8, ENVELOPE.maxHalfWidth); // fast stroke: 1 retry
  Sk.writeFortune(Sk.lineOf(sketch, "a", 6), 2, 0.2, 4.99, 0.2, ENVELOPE.minHalfWidth); // slow stroke: 2 retries
  const cast = Sk.castSlots(sketch, ["c0", "a"], 6);
  assert.deepEqual(Sk.extentOf(cast), [1, 4]);
  assert.deepEqual(cast.map((c) => c.maxRegen), [0, 1, 2, 2, 2, 0]);
  assert.deepEqual(cast[2].characters.map((c) => c.sketched), [true, true]);
  assert.deepEqual(cast[4].characters.map((c) => c.sketched), [false, true]);
  assert.ok(Sk.anyLine(sketch));
});

test("adding a bullet shifts every character's line", () => {
  const sketch = Sk.emptySketch(2, ["c0", "a"]);
  Sk.writeFortune(sketch.fortunes.a, 0, 0.3, 0.99, 0.3, 0.1);
  Sk.insertSlot(sketch, 0);
  assert.equal(sketch.fortunes.a.length, 3 * S);
  assert.deepEqual(Sk.fortuneSlots(sketch.fortunes.a, 3).map((s) => s.sketched), [false, true, false]);
});

test("names sent to the model: unnamed and repeated names are told apart", () => {
  const cast = [{ name: " Bob " }, { name: "" }, { name: "bob" }];
  assert.deepEqual(modelNames(cast), ["Bob", "Character 2", "bob (3)"]);
  assert.deepEqual(modelNames([{ name: "" }]), [""]);
});

test("each character has its own recognition key; the protagonist's key keeps the old form", () => {
  const sentences = ["A.", "B."].map((text) => ({ text }));
  const keys = ratingKeys([{ name: "Bob" }, { name: "Alice" }], sentences, 1);
  assert.equal(keys[0], recognitionKey("Bob", sentences, 1));
  assert.equal(keys[0], JSON.stringify(["Bob", ["A."], "B."]));
  assert.equal(keys[1], JSON.stringify(["Alice", ["A."], "B.", "side"]));
});

test("stories saved before the remix load as one protagonist", () => {
  const cast = normalizeCharacters(undefined, "Mike");
  assert.deepEqual(cast, [{ id: PROTAGONIST_ID, name: "Mike", color: 0 }]);
  assert.deepEqual(normalizeRatings({ fortune: 0.4 }, ["c0"]), { c0: 0.4 });
  assert.deepEqual(normalizeRatings({ fortunes: { c0: ABSENT, a: ABSENT, b: "x" } }, ["c0", "a", "b"]), { a: ABSENT });
  assert.equal(freeColor([{ color: 0 }, { color: 2 }]), 1);
});

test("a character added but not named yet is not sent to the model", () => {
  const cast = [{ id: "c0", name: "" }, { id: "a", name: "" }, { id: "b", name: "Alice" }];
  const named = namedCast(cast);
  assert.deepEqual(named.characters.map((c) => c.id), ["c0", "b"]);
  assert.deepEqual(named.names, ["", "Alice"]);
});
