// Generate by sketching (Section 4.2.2).
//
// Which sentence slots are (re)written:
// * After a pen stroke: the slots the stroke covers, plus any blank slot inside the sketched
//   range (so a broken line still gives a complete story).
// * "Generate Again": every slot inside the sketched range, with the same sketch.
// In both cases, sentences the writer typed or edited are kept as context, never replaced.
// Slots inside the sketched range where the line is erased get sentences without a fortune target.
//
// Remix: each slot gets one fortune target per character (null where that character has no
// line). The sketched range covers every character's line.
//
// Remix (relationships): while the relationship panel is on, each slot also gets one
// relationship target per pair of named characters, and the sketched range covers those lines too.

import * as api from "./api.js";
import { ABSENT, isRating, labels, namedCast, pairsOf } from "./characters.js";
import { DEFAULT_SURPRISE } from "./config.js";
import { saveGenerated, saveUnsaved } from "./history.js";
import { ratingKeys, relationKeys } from "./keys.js";
import { rememberFortune, rememberRelation, scheduleRecognition } from "./recognizer.js";
import * as Sk from "./sketch.js";
import { changed, relationsOn, setStatus, state } from "./store.js";

let controller = null;

/** A slot TaleBrush may write: blank, or holding an untouched generated sentence. */
export function isFillable(i) {
  const s = state.sentences[i];
  return !!s && (!s.text.trim() || s.source === "generated");
}

/** The pairs whose relationship lines are used: every pair of `characters` while the panel is on. */
function usedPairs(characters = state.characters) {
  return relationsOn() ? pairsOf(characters) : [];
}

function castSlots(characters = state.characters) {
  return Sk.castSlots(
    state.sketch,
    characters.map((c) => c.id),
    state.sentences.length,
    usedPairs(characters).map((p) => p.key),
  );
}

export function sketchExtent() {
  return Sk.extentOf(castSlots());
}

export function strokeTargets(strokeSlots) {
  const targets = new Set(strokeSlots.filter(isFillable));
  const extent = sketchExtent();
  if (extent) {
    for (let i = extent[0]; i <= extent[1]; i++) if (!state.sentences[i].text.trim()) targets.add(i);
  }
  return [...targets].sort((a, b) => a - b);
}

export function againTargets() {
  const extent = sketchExtent();
  if (!extent) return [];
  const out = [];
  for (let i = extent[0]; i <= extent[1]; i++) if (isFillable(i)) out.push(i);
  return out;
}

export function stopGeneration() {
  controller?.abort();
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const usable = (v) => isRating(v) || v === ABSENT;

/** Ratings from the server (one per character, in order) as a map from character id. */
function ratingsById(characters, list) {
  const out = {};
  if (!Array.isArray(list)) return out;
  characters.forEach((c, k) => {
    if (usable(list[k])) out[c.id] = list[k];
  });
  return out;
}

/** Relationship ratings from the server (one per pair, in order) as a map from pair key. */
function ratingsByPair(pairList, list) {
  const out = {};
  if (!Array.isArray(list)) return out;
  pairList.forEach((p, k) => {
    if (usable(list[k])) out[p.key] = list[k];
  });
  return out;
}

// ---------------------------------------------------------------- writing model (remix)

/** The models the writer can choose, from the server's /api/health answer (empty with a Codex bridge). */
export function writingModels() {
  return state.ui.bridge?.ok ? state.ui.bridge.writing?.models || [] : [];
}

/** The model chosen in the top bar, or null for the main LLM bridge's own model. */
export function writingModel() {
  return writingModels().some((m) => m.id === state.settings.model) ? state.settings.model : null;
}

/** "Sonnet" for "sonnet"; any other name is shown as it is. */
export function modelLabel(id) {
  return writingModels().find((m) => m.id === id)?.label || id || "";
}

/** Write the target slots. Returns the number of sentences written. */
export async function runGeneration(targets) {
  if (state.ui.generating || !targets.length) return 0;
  const hasLine = (c) =>
    Sk.hasSamples(state.sketch.fortunes[c.id] || []) ||
    usedPairs().some((p) => p.key.split("|").includes(c.id) && Sk.hasSamples(state.sketch.relations?.[p.key] || []));
  const unnamed = state.characters.findIndex((c, k) => k > 0 && !c.name.trim() && hasLine(c));
  if (unnamed > 0) {
    setStatus(`Give ${labels(state.characters)[unnamed]} a name (above the canvas) before generating.`, "error");
    return 0;
  }
  const n = state.sentences.length;
  // The characters sent to the model (unnamed ones are left out). The cast cannot change while generating.
  const { characters, names } = namedCast(state.characters);
  const pairList = usedPairs(characters); // a and b index into names
  const cast = castSlots(characters);
  const surprise = Sk.surpriseSlots(state.sketch.surprise, n);
  const targetSet = new Set(targets);

  saveUnsaved(); // keep the writer's unsaved edits in the history before anything changes

  const slots = state.sentences.map((s, i) => {
    if (!targetSet.has(i)) return { text: s.text, target: null };
    const per = cast[i].characters;
    const sur = state.surpriseEnabled && surprise[i] !== null ? surprise[i] : DEFAULT_SURPRISE;
    return {
      text: "",
      previous: s.text.trim() || null,
      target: {
        fortunes: per.map((f) => (f.sketched ? f.fortune : null)),
        tolerances: per.map((f) => (f.sketched ? f.halfWidth : null)),
        relations: cast[i].relations.map((f) => (f.sketched ? f.fortune : null)),
        relationTolerances: cast[i].relations.map((f) => (f.sketched ? f.halfWidth : null)),
        maxRegen: cast[i].maxRegen,
        surprise: sur,
      },
    };
  });

  const backup = new Map(
    targets.map((i) => {
      const s = state.sentences[i];
      return [
        i,
        { ...s, fortunes: { ...s.fortunes }, keys: { ...s.keys }, relations: { ...s.relations }, relationKeys: { ...s.relationKeys } },
      ];
    }),
  );
  const finals = new Set();
  let summary = null;
  let failure = null;
  let stopped = false;
  let writtenBy = null; // the model that writes, as the server reports it

  state.ui.generating = true;
  state.ui.targets = targets.slice();
  state.ui.historyOpen = false;
  state.ui.previewId = null;
  setStatus(`Writing ${targets.length} sentence${targets.length === 1 ? "" : "s"}...`, "busy");

  const onEvent = (ev) => {
    const s = state.sentences[ev.slot];
    switch (ev.type) {
      case "plan":
        writtenBy = modelLabel(ev.model) || null;
        break;
      case "status":
        setStatus(ev.message, "busy");
        break;
      case "draft":
        if (s && !finals.has(ev.slot)) {
          Object.assign(s, {
            text: ev.text,
            source: "generated",
            draft: true,
            fortunes: ratingsById(characters, ev.fortunes),
            keys: {},
            relations: ratingsByPair(pairList, ev.relations),
            relationKeys: {},
          });
        }
        break;
      case "sentence":
        if (s) {
          Object.assign(s, {
            text: ev.text,
            source: "generated",
            draft: false,
            fortunes: ratingsById(characters, ev.fortunes),
            keys: {},
            relations: ratingsByPair(pairList, ev.relations),
            relationKeys: {},
          });
          s.gen = {
            targets: Array.isArray(ev.targets) ? ev.targets.map(num) : [num(ev.target)],
            tolerances: Array.isArray(ev.tolerances) ? ev.tolerances.map(num) : [num(ev.tolerance)],
            surprise: num(ev.surprise),
            maxRegen: ev.maxRegen,
            task: ev.task,
            tries: Array.isArray(ev.attempts) ? ev.attempts.length : 1,
            model: writtenBy,
          };
          finals.add(ev.slot);
        }
        break;
      case "error":
        failure = ev.message;
        break;
      case "done":
        summary = ev;
        break;
      default:
        break;
    }
    changed({ persist: false });
  };

  controller = new AbortController();
  try {
    await api.generate(
      {
        characters: names,
        ...(pairList.length ? { pairs: pairList.map((p) => [p.a, p.b]) } : {}),
        mode: state.settings.pipeline,
        threshold: state.settings.threshold,
        model: writingModel(),
        slots,
      },
      onEvent,
      controller.signal,
    );
  } catch (e) {
    if (e.name === "AbortError") stopped = true;
    else failure = e.message;
  } finally {
    controller = null;
  }

  // Put back every slot that did not get a finished sentence.
  for (const i of targets) {
    if (finals.has(i)) continue;
    const b = backup.get(i);
    Object.assign(state.sentences[i], {
      text: b.text,
      source: b.source,
      fortunes: b.fortunes,
      keys: b.keys,
      relations: b.relations,
      relationKeys: b.relationKeys,
      gen: b.gen,
      draft: false,
    });
  }
  // The pipeline already rated the new sentences; keep those ratings.
  for (const i of finals) {
    const s = state.sentences[i];
    const keys = ratingKeys(characters, state.sentences, i, names);
    characters.forEach((c, k) => {
      if (!usable(s.fortunes[c.id])) return;
      s.keys[c.id] = keys[k];
      rememberFortune(keys[k], s.fortunes[c.id]);
    });
    const pairKeys = relationKeys(pairList, names, state.sentences, i);
    pairList.forEach((p, k) => {
      if (!usable(s.relations[p.key])) return;
      s.relationKeys[p.key] = pairKeys[k];
      rememberRelation(pairKeys[k], s.relations[p.key]);
    });
  }
  state.ui.generating = false;
  state.ui.targets = [];
  if (finals.size) saveGenerated(writtenBy);

  if (stopped) {
    setStatus(
      finals.size
        ? `Stopped. Kept ${finals.size} finished sentence${finals.size === 1 ? "" : "s"}; the rest were put back.`
        : "Stopped. The story is unchanged.",
      "info",
    );
  } else if (failure) {
    setStatus(`Generation failed: ${failure}`, "error");
  } else if (summary) {
    const by = writtenBy ? ` with ${writtenBy}` : "";
    const parts = [`Wrote ${summary.written} sentence${summary.written === 1 ? "" : "s"}${by} in ${Math.round(summary.seconds)} s`];
    if (summary.retried) {
      parts.push(
        `${summary.retried} rewritten because the first try missed the sketch by more than ${state.settings.threshold.toFixed(2)}`,
      );
    }
    if (summary.missing) parts.push(`${summary.missing} could not be written`);
    setStatus(`${parts.join(" · ")}.`, "done");
  } else {
    setStatus("Generation ended without a result.", "error");
  }
  changed();
  scheduleRecognition(200); // sentences after the new ones have a new context
  return finals.size;
}
