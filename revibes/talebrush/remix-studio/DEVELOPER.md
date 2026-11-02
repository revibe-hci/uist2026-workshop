# TaleBrush Studio (remix): developer guide

This folder started as a copy of `../remix-misty/` (TaleBrush + Misty). Luminate,
VideoDiff and Selenite were then added. The [Studio additions](#studio-additions-luminate-videodiff-selenite)
section at the end covers what is new. The rest of this guide applies unchanged, except
that the port is 5059 and the localStorage key is `talebrush-studio-state-v1`.

## What you need

| Requirement | Why | Check |
|---|---|---|
| Python 3.9+ | runs the back end (standard library only, no packages) | `python3 --version` |
| Claude Code CLI, signed in | the LLM bridge sends model calls through it | `claude --version` |
| A modern browser | the front end is plain HTML/CSS/JS with SVG (no build step) | |

Nothing to install: there is no `requirements.txt`, no `npm install`, and no API key
or `.env`. The paper used React and Flask. This rebuild keeps the same split (a web
front end plus a REST back end) without those dependencies, so it starts instantly
at the workshop.

## Run

    python3 llm-bridge/bridge.py claude          # LLM bridge on :8787 (do not modify llm-bridge/)
    python3 revibes/talebrush/remix-studio/server.py  # studio on :5059 -> http://localhost:5059

| Env variable | Default | Meaning |
|---|---|---|
| `TALEBRUSH_PORT` | `5059` | port of this server |
| `BRIDGE_URL` | `http://localhost:8787` | where the LLM bridge listens |

`GET /api/health` reports this server and the bridge's backend and model.

## Layout

    app/
      server.py          back end: recognition + generation modules, REST API, static files
      static/index.html  page structure (editor, canvases, tools, history menu)
      static/style.css   styling, modelled on the paper's Figures 1, 4 and 5
      static/app.js      all front-end logic (state, sketching, rendering, history)

## Architecture and how it maps to the paper

The paper (Section 5, Figure 7) has two modules on one language model:

1. **Recognition**: GPT-Neo with trained soft prompts. Input: up to 3 previous
   sentences, the protagonist, and the target sentence. Output: fortune in [0, 1].
2. **Generation**: GPT-Neo with soft prompts for *continuation*, *infill from
   previous* and *infill from next*, steered by a GeDi class-conditional GPT2-medium
   whose control code is interpolated between bad (0), neutral (0.5) and good (1).
   If the recognized fortune of a sentence misses the target by more than 0.2, it is
   regenerated 1–2 more times and the closest candidate is kept. Surprise sets the
   softmax temperature.

In `server.py`:

- `recognize()` makes one bridge call that scores a batch of items. Each item
  carries the paper's input fields (`Previous Context:` with at most 3 sentences,
  `Protagonist:`, `Sentence:`), and the system prompt holds the paper's definition
  of fortune and a 0 / 0.5 / 1 calibration. This substitutes for the soft-prompted
  regressor.
- `generation_prompt()` uses the paper's three input layouts (Figure 9) as
  discrete prompts: `Beginning Story / Story Character / Continue Story` for
  continuation, and the two infill orderings with `Ending Story` and
  `Infilled Story`. In place of the GeDi control code, the target fortune is given as
  a number and in words, along with the direction of change from the previous
  sentence. This substitutes for GeDi.
- `generate_slot()` holds the regeneration loop: generate, recognize with the
  *separate* recognizer, keep the candidate if `|y − ŷ| ≤ 0.2`, otherwise retry up
  to `regen` times (1 or 2, from sketch tightness), and return the candidate with
  the smallest error. Unconstrained (erased) slots get one try. Copies of
  sentences already in the story are rejected.
- `generation_order()` decides the order: a run of target slots with no
  written sentence after it is continued left to right. A run with a written
  sentence after it is infilled, alternating *from previous* (the front of the gap)
  and *from next* (the back of the gap), as the paper describes.

### REST API

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/recognize` | `{protagonist, sentences: [str], indices: [int]}` | `{fortunes: {"i": float}}` |
| `POST /api/generate` | `{protagonist, sentences, fortunes, targets: [{index, fortune∣null, regen, surprise}]}` | NDJSON stream: `start`, then `progress` / `sentence` per slot, then `done` or `error` |

Generation streams so that sentences appear one by one. Closing the connection
(the **Stop** button aborts the fetch) ends the generation on the server.

### Front end (`static/app.js`)

- **State**: `lines` (text, origin `user`/`ai`, recognized fortune), `sketch`,
  `surprise`, and `history`. It is saved to `localStorage` under
  `talebrush-state-v1`.
- **Sketch representation**: each bullet slot owns `R = 24` samples. A fortune
  sample is `null` (not drawn, or erased) or `{y, w}`. `w` is the envelope's
  half-width, from the smoothed pointer speed:
  `w = clamp(0.025 + 0.11 · speed_px_per_ms, 0.025, 0.3)`. A slot's parameters
  are read from its centre sample (the faint vertical line). If `w < 0.1` (drawn
  slowly) the slot regenerates up to twice, otherwise once. Inserting or deleting
  a bullet splices samples, so the arc stays attached to its sentences.
- **What a stroke generates** (`targetsFor`): slots whose centre sample changed
  and that are either sketched, or erased but lying between sketched slots. The
  writer's own (typed or edited) sentences are never overwritten. *Generate Again*
  uses every slot from the first to the last sketched one.
- **Recognition of the writer's text** is debounced (0.9 s). It re-scores the
  edited sentence plus the next three, whose context changed. Results are matched
  to line objects and a revision counter, so stale responses are dropped.
- **Rendering**: SVG. The envelope is a polygon filled with a hatch pattern. The
  story arc is a Catmull-Rom curve through consecutive recognized sentences, blue
  for generated and gray for written, broken at blank bullets. When the History
  menu is open, stored arcs are drawn at low opacity, and the hovered story is
  previewed in the editor and highlighted.

## Tuning knobs

| Where | Constant | Effect |
|---|---|---|
| `server.py` | `REGEN_THRESHOLD = 0.2` | error that triggers regeneration (paper value) |
| `server.py` | `RECOGNITION_CONTEXT = 3` | previous sentences given to the recognizer (paper value) |
| `server.py` | `fortune_words`, `surprise_words` | how levels are phrased to the model |
| `app.js` | `MIN_W`, `MAX_W`, speed factor `0.11` | speed-to-width mapping |
| `app.js` | `TIGHT_W = 0.1` | width below which a slot gets two regenerations |
| `app.js` | `DEFAULT_SURPRISE = 0.3` | surprise when the panel is off or unsketched |
| `app.js` | `START_LINES = 8` | bullets in a new story |

A larger bridge model can improve control: `BRIDGE_MODEL=sonnet python3 llm-bridge/bridge.py claude`.
It is slower and uses more of the plan.

## Quick API test

    curl -s -X POST localhost:5057/api/recognize -H 'Content-Type: application/json' \
      -d '{"protagonist":"Mike","sentences":["Mike lost his guitar in a fire."],"indices":[0]}'

## Misty remix additions

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/example` | `{text}` | `{protagonist, sentences, fortunes}`: one call that splits the story, names its protagonist and scores every sentence's fortune |
| `POST /api/diff` | `{protagonist, before: [str], after: [str], changed: [int]}` | `{changes: [{id, label, detail, sentences}]}`: 2–5 semantic groups, limited to the changed sentences |
| `POST /api/revise` | `{protagonist, sentences (base), changes, disabled: [id], edited: {id: text}, editable: [int]}` | `{sentences: {i: text}, fortunes: {i: v}}`: rewrites only the sentences of removed or edited changes, then re-recognizes them |
| `POST /api/generate` | as before; each target may carry `blend: {aspects, name, example_sentence, example_text, custom}` | as before |

- **Server** (`server.py`): `blend_lines()` turns the *events*, *style* and *custom*
  aspects into extra lines of the generation prompt. `analyze_example()`,
  `semantic_diff()` and `revise()` are one bridge call each.
- **Arc blending happens on the client.** `applyBlend()` writes the example's
  fortunes into the sketch samples of the target span (linear interpolation,
  half-width `BLEND_W = 0.12`). TaleBrush's regenerate-to-fit loop then realizes the
  arc, so blending reuses the paper's control instead of a separate path.
- **Mapping**: `exPos(src, span, u)` maps a story slot to a fractional example
  sentence. Global blends stretch the whole example over all slots, and local blends
  map the selection onto a span of the same length centred on the drop point.
- **Semantic diff state**: `state.diff = {base, baseFortunes, changes, disabled,
  edited, editable}`. `applyDiff()` always re-derives from `base`, so toggles commute
  and turning everything back on restores the base without a model call. Editing the
  text or the bullets clears the diff (`clearDiff()`).
- **Blends survive Generate Again**: `state.lastBlends` keeps the blend for each slot.
  Redrawing a slot by hand removes its blend.
- localStorage key: `talebrush-misty-state-v1`, separate from the revibe.
- **Tutorial** (`static/tour.js`): a self-contained modal tour. `STEPS` lists each
  step's target selector, origin badge (`talebrush` / `misty` / `remix`) and text. A
  spotlight box with a large `box-shadow` dims everything around the target. When a
  target is hidden (no example yet, no diff yet), the step falls back to `fallback`
  or is centred with its `missing` note. The tour makes no model calls. The
  `talebrush-misty-tour-seen` localStorage flag stops the button's pulse.

## Studio additions (Luminate, VideoDiff, Selenite)

### Files

    studio.py            back end for /api/luminate/*, /api/videodiff/* and /api/selenite/*
    static/selenite.js   Story Guide (left column) and the chips / Analyze under each sentence
    static/luminate.js   "Design space" tab
    static/videodiff.js  "Compare" tab
    static/tour.js       the tutorial (STEPS, with a `from: [...]` badge list per step)

**Extension points.** The modules attach to `app.js` through `hooks`:
- `row(row, line, i)`: decorates each editor row. Rows now wrap the textarea in
  `.rowbody`.
- `render()`: re-renders after `renderAll()`.
- `afterGenerate(indices)`: runs after a TaleBrush generation.
- `init()`: runs once.

Shared helpers in `app.js`:
- `variantSlots()`: the slots a variant may rewrite (the sketched range, else every
  slot that isn't the writer's).
- `slotTargets()`: fortune targets for those slots, read from the sketch.
- `applyVariant()`: puts a variant into the story, marked `lum` (yellow).
- `postJSON()`, `postStream()`, and `showTab()`.
- `init` now runs on `DOMContentLoaded`, so every module has loaded first.

> **Watch out for global names.** All scripts are classic scripts in one global scope,
> so a top-level `function` with the same name in two files silently replaces the
> earlier one. We hit this with `renderControls`. Prefix module functions (e.g.,
> `renderLumControls`).

### Endpoints (one bridge call each unless noted)

| Endpoint | Body | Returns |
|---|---|---|
| `POST /api/luminate/dimensions` | `{protagonist, sentences, prompt, n}` | `{dimensions: [{name, type, values}]}` |
| `POST /api/luminate/variants` | `{protagonist, sentences, slots, targets, dimensions, count, fixed, prompt}` | NDJSON, one `variant` per line as each finishes. 2 calls per variant (write, then recognize), at most 4 at a time |
| `POST /api/luminate/add-dimension` | `{protagonist, name, variants: [{id, title, text}]}` | `{dimension, assign: {id: value}}` |
| `POST /api/videodiff/prompt` | `{protagonist, sentences, slots, targets, mode: edit/recombine/surprise, instruction, variants, base_id}` | `{title, keywords, summary, change, sentences, fortunes}` (2 calls) |
| `POST /api/selenite/criteria` | `{protagonist, sentences, exclude}` | `{topic, criteria: [{name, description}]}` (`exclude` asks for 5 more) |
| `POST /api/selenite/annotate` | `{sentences, criteria}` | `{sentences: {i: [names]}, elements, suggest}` |
| `POST /api/selenite/analyze` | `{protagonist, sentences, index, criteria}` | `{spans: [{text, effect, criteria}]}` |

### How the systems connect

- **TaleBrush → Luminate / VideoDiff.** Every variant is written for the slots
  TaleBrush would generate, with the sketch's fortune targets. Its fortunes are then
  recognized by TaleBrush's recognizer. That gives the *Fit to your arc* / *Ending
  fortune* axes, the fit sort, and the mini arcs.
- **Luminate ↔ VideoDiff.** Both views share the same variants
  (`state.studio.lum.spaces[].variants`). Bookmarks are shared, and VideoDiff's new
  variants appear in the design space as dashed nodes.
- **Selenite → Luminate.** *Explore in Design space →* starts a space whose prompt is
  the suggested criterion.
- **Selenite × TaleBrush.** Analyze reads Selenite's sentiment as the protagonist's
  fortune. Annotations refresh after each TaleBrush generation once the guide exists.

### Substitutions and simplifications (all labelled in the footer or here)

- Every model is replaced by the bridge model. Luminate's per-level abstractions
  (title, keywords, summary) come from the same call that writes the variant.
- Luminate's force-directed scatter becomes a grid of dimension values. Numeric
  TaleBrush axes are binned.
- Adding a dimension *classifies* existing variants along it instead of rewriting
  them, as Luminate does, to save calls.
- Selenite's BART-MNLI zero-shot classifier and its GPT-2 + SentenceBERT graph for
  next-step suggestions are both replaced by one LLM annotation call. Dwell-time
  tracking is not implemented.
- VideoDiff's video, timeline and B-roll stages map to sentence slots. Its visually
  concrete keywords are approximated by each variant's keywords.
