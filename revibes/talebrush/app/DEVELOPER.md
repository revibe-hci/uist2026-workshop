# TaleBrush revibe: developer guide

## What you need

- Python 3.9+ (standard library only, no `pip install`).
- A modern browser.
- For real generation: Claude Code (`claude`) installed and signed in, and the
  workshop LLM bridge (`llm-bridge/bridge.py`, also standard-library Python).

No Node.js, npm or build step: the front end is plain HTML, CSS and JavaScript
served by the Python server.

## Run

From the repository root:

    python3 llm-bridge/bridge.py claude          # terminal 1, port 8787
    python3 revibes/talebrush/app/server.py      # terminal 2, port 5177

| Variable | Default | Meaning |
|---|---|---|
| `TALEBRUSH_PORT` | `5177` | port of the app |
| `BRIDGE_URL` | `http://localhost:8787` | where the LLM bridge listens |
| `TALEBRUSH_STUB=1` or `--stub` | off | no model: canned sentences, keyword fortune scores, a banner says so |

## Layout

    app/
      server.py          HTTP server: static files + /api/status, /api/recognize, /api/generate
      static/index.html  page structure: editor (left), canvas + controls (right)
      static/style.css   look, loosely following Figure 1
      static/app.js      all interaction: editor, sketching, canvas rendering, history
      README.md          how to launch and use
      DEVELOPER.md       this file

## How it maps to the paper

### Front end (`static/app.js`), Section 4.2

- **State.** `state.bullets` is the text editor: one object per bullet with
  `text`, `kind` (`user` or `gen`), `edited`, and `fortune` (the recognized
  level). `state.sketch` holds the fortune sketch as 300 columns across the
  canvas. Each column is `{y, hw}`: the fortune level and the band's half-width,
  both in fortune units, or `null` where nothing is drawn or it was erased.
  `state.surprise` is the same for the surprise canvas.
- **Sentence slots.** There are `max(#bullets, 8)` slots, laid out evenly on x.
  The thin vertical lines mark slot boundaries. `slotSpec(i)` turns the sketch
  columns inside a slot into a target fortune (mean y), a tolerance (mean
  half-width), a number of retries (2 for a thin band, 1 for a wide one) and a
  surprise level. A slot less than a third covered has no target.
- **Sketching speed → width.** The pointer speed is smoothed (EMA) and mapped
  linearly from slow to fast onto a half-width of 0.05 to 0.25. Because the
  width is interpolated per column, it changes gradually along a stroke.
- **Generation triggers.**
  - End of a pen stroke: regenerate the slots under the stroke (≥40 % covered),
    except sentences the writer wrote. This is also how partial redraw works.
    Strokes shorter than `MIN_STROKE_COLS` (12 columns), such as a stray click,
    do not generate.
  - Generate Again: every slot from the first sketched slot to the last, except
    sentences the writer wrote or edited. Uncovered (erased) slots in that
    range get no fortune target.
  - Earlier texts for the same slots are sent as "avoid", so a new run differs.
- **Recognition of written text.** Changed bullets are re-scored 0.7 s after
  typing stops (`runRecognition`), with up to three previous sentences and the
  protagonist as context. A name change re-scores everything.
- **History.** After each generation the whole story is stored (bullets, sketch,
  surprise). An "Initial" entry is stored before the first generation. Stored
  arcs are drawn at low opacity; hovering an entry previews its text and
  highlights its arc; clicking rolls back.

### Back end (`server.py`), Section 5

- `/api/recognize`: one model call scores a batch of sentences. Each item has
  the protagonist, up to three previous sentences and the target sentence. This
  matches the inputs of the paper's recognition prompt (Section 5.2.1).
- `/api/generate`: implements the loop of Section 5.2.2.
  1. One model call writes all requested slots together, given the numbered
     outline: written sentences with their fortune, and `[WRITE]` slots with a
     fortune target and an optional surprise level. Writing the slots together
     covers both continuation and infilling: the model sees what comes before
     and after each slot.
  2. One recognition call scores the generated sentences.
  3. Slots whose |fortune − target| exceeds their tolerance are regenerated.
     Each such slot gets two alternatives, all are scored, and the candidate
     with the smallest error is kept. This repeats for up to the slot's number
     of retries.
- The bridge ignores temperature, so surprise is described in the prompt
  (low = predictable, high = unexpected twist) instead of setting the softmax
  temperature as the paper does.

## Extending

- To change how speed maps to width, edit `HW_MIN`, `HW_MAX`, `SPEED_SLOW` and
  `SPEED_FAST` in `app.js`.
- To change the regeneration policy, edit `slotSpec()` (tolerance and retries)
  and `generate()` in `server.py`.
- Prompts are `RECOGNIZE_SYSTEM` and `GENERATE_SYSTEM` in `server.py`.

## Remix: TaleBrush × Luminate (branch `remix/talebrush-luminate`)

New files: `static/lanes.js` (dimensions, lanes, setting chips) and
`static/space.js` (design space). They share `app.js`'s global state and
helpers. `app.js` calls three hooks if they exist: `drawSpaceOverlay()`,
`renderLanes()` and `laneTargets()`.

| Endpoint | What it does |
|---|---|
| `POST /api/dimensions` | One call. From name, title and opening sentences: `{arc: [{name, low, high}], setting: [{name, values}]}`. With `custom`, returns that one arc dimension with labels. |
| `POST /api/recognize` with `dims` | One call rates every target sentence on fortune and each arc dimension: `{values: {index: {dimId: v}}}`. |
| `POST /api/explore` | Streams NDJSON: one `{"type": "variant", ...}` line per version as it finishes, then `{"type": "done"}`. |

How `/api/explore` works:
- `plan_requirements()` gives every open dimension a shape and every free
  setting a value. `balanced()` uses each option about equally often, shuffled
  per dimension.
- `variant_once()` turns shapes into per-slot targets, using `SHAPES`, and asks
  for sentences plus a 0–1 rating of every line on every dimension in one call.
- Threads share `EXPLORE_SLOTS` (env `TALEBRUSH_EXPLORE_SLOTS`, default 10).
- `stagger()` spaces all bridge connections 30 ms apart, because the bridge
  queues at most 5 pending connections.
- If the browser disconnects (Stop, or Explore again), versions not yet
  started are skipped. Calls already running finish and are discarded.

On the frontend, versions keep `base` (the writer's bullets when exploring),
`slots`, `sentences`, `values` and `requirement`. `versionBullets(v)` merges
them into a full story for previews, sparklines and adopting. Axis categories
for an arc dimension come from `shapeOf()`, applied to the version's own
ratings, not to its requested shape.

Second protagonist and interactions:
- The second protagonist is an entry in `state.dims` with `kind: "protagonist"`,
  `id: "p2"` and `person`, rendered in `#protagonists` at 170 px.
- `arcDimDefs()` adds a rating-only dimension `meet` (`rateOnly: true`) when
  the second protagonist has a name.
- On the server, `rateOnly` dimensions are never explored, `variant_once()`
  gives them no per-line targets, and `missing_value()` counts a missing
  rating as 0.
- `protagonist_line()` names both protagonists in every prompt.
- `meetsAt(b)` (meet ≥ 0.5) drives `drawInteractions()` (canvas and panel),
  the editor's `.bullet.meet`, and the sparkline ticks.

Setting chips: `pickSetting()` pins a value and calls
`generate(slots, {keepArc: true})`. That turns each slot's current fortune,
lane levels and interaction rating into targets.

Ratings for every story: `ensureRatings()` (debounced) calls
`fillMissingRatings()`.
- It finds, per History entry and per design-space version (plus each
  exploration's shared `base`), the dimensions that have no value yet. It
  calls `/api/recognize` with only those, at most 3 at a time, and merges the
  results without overwriting existing values.
- It's triggered after recognition of the current story, after dimensions are
  added, after the second protagonist is named, and after each exploration.
- `syncCurrentHistory()` copies the current story's ratings into its History
  entry.

Diversity (see `../experiments/diversity/`):
- `plan_requirements()` gives each open dimension a `random_curve()` (2–4
  knots, Beta(0.6, 0.6) levels). It picks each version by farthest-point
  sampling (`curve_distance`) from 40 candidates, against `payload.existing`
  (the rated values of versions already in the space) and the plans chosen so
  far.
- A requirement is `{curves: {dim id: [level per slot]}, settings}`.
- `variant_once()` writes sentences only and returns the plan as provisional
  `values`.
- `explore_stream()`'s `rater` thread rates finished versions `RATE_BATCH`
  (3) at a time with `rate_versions()` → `rate_items()`, and streams
  `{"type": "ratings"}` lines that replace the plan in the browser
  (`v.rated`).
- `llm_json()` retries once on `InvalidJSON`.
