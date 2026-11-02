# TaleBrush developer guide

This guide explains how the rebuilt TaleBrush is put together, what you need
to run and change it, and where each feature of the paper lives in the code.
For using the tool, see `README.md`.

This version includes one remix that is not in the paper: up to four
characters, each with its own fortune line. See "Several characters (remix)"
below and `../remixes.md`. With one character, the page and every prompt are
the same as in the version without the remix.

## What you need

| Need | Why | Check |
|---|---|---|
| Python 3.8 or later | runs the server; standard library only, nothing to `pip install` | `python3 --version` |
| A current browser (Chrome, Firefox, Safari, Edge) | the interface; it uses ES modules, pointer events and SVG | |
| Claude Code (`claude`) signed in, or Codex (`codex`) | the LLM bridge answers model calls through it | `claude --version` |
| Node.js 18 or later (optional) | only to run the front-end tests | `node --version` |

There is no build step, no `npm install` and no API key. The `.env` file is
not used.

## Run it

From the repository root, in two terminals:

    python3 llm-bridge/bridge.py claude          # the LLM bridge, port 8787
    python3 revibes/talebrush/app/server.py      # TaleBrush, port 5177

Then open http://localhost:5177.

Server options (flags or environment variables):

| Flag | Variable | Default | Meaning |
|---|---|---|---|
| `--port` | `TALEBRUSH_PORT` | `5177` | port of the TaleBrush server |
| `--bridge` | `TALEBRUSH_BRIDGE` | `http://localhost:8787` | URL of the LLM bridge |

The server prints one line per model operation, for example
`generated 6 sentence(s) (batch) in 21.7s with 4 model call(s)`.

The bridge itself is shared by all groups and lives in `llm-bridge/`; do not
change it. Its settings (for example `BRIDGE_MODEL=sonnet` for a larger model)
are described in `llm-bridge/README.md`. Check which backend answers with
http://localhost:8787/health.

## How the parts fit together

    Browser: static/index.html + static/js/*.js
       |   GET  /api/health      is the bridge up, which model
       |   POST /api/recognize   rate sentences' fortune, per character
       |   POST /api/generate    write sentences for sketched slots (streamed)
       v
    server.py  (Python standard library HTTP server, also serves static/)
       |
       |-- talebrush/recognition.py   fortune recognition (paper 5.2.1)
       |-- talebrush/generation.py    controlled generation (paper 5.2.2)
       |-- talebrush/prompts.py       all prompt text
       |-- talebrush/cast.py          character names (remix)
       |-- talebrush/llm.py           client for the bridge
       v
    LLM bridge (llm-bridge/bridge.py, OpenAI Chat Completions format)
       v
    claude -p --model haiku   (or codex)

The paper's architecture is the same shape: a React front end, a Flask REST
API, and the language-model operations on the back end. The models are what
changed; see "Substitutions" below.

## Files

    app/
      server.py                  HTTP server: static files and the three API routes
      talebrush/
        llm.py                   BridgeClient: POST /v1/chat/completions with JSON output; errors
        prompts.py               fortune definition, scale, calibration sentences, all prompts
        cast.py                  character names, ABSENT ("not in this sentence") (remix)
        recognition.py           Recognizer: batches sentences, keeps 3 sentences of context, caches per character
        generation.py            parse_request, plan_runs, sequential_order, Generator (both pipelines)
      static/
        index.html               page layout (Figure 1)
        css/talebrush.css        styles, including SVG marks
        js/config.js             tunable constants (envelope widths, speeds, colours, delays)
        js/characters.js         character list, colours, model names, loading old stories (remix)
        js/cast.js               the character chips above the canvas (remix)
        js/sketch.js             the sketch data model (pure functions)
        js/geometry.js           monotone curve through the fortune dots
        js/keys.js               what a sentence's fortune depends on (recognition key, per character)
        js/store.js              application state, render scheduling, localStorage
        js/api.js                fetch wrappers; reads the streamed generation events
        js/recognizer.js         rates the writer's sentences after typing pauses
        js/generator.js          decides which slots to write; runs and applies a generation
        js/history.js            stored stories and the History dropdown (Figure 5)
        js/editor.js             bulleted text editor
        js/canvas.js             fortune canvas and surprise canvas (drawing, erasing, rendering)
        js/examples.js           example stories from the paper's figures
        js/main.js               wires everything together; top bar, settings, status
      tests/
        test_pipeline.py         back-end tests with a fake model (no model calls)
        frontend.test.mjs        front-end tests for the pure modules

## Where each paper feature is

| Paper | Feature | Code |
|---|---|---|
| Fig. 1 A1 | protagonist's name ("Mike 's fortune") | `index.html` `#protagonist`; sent with every model call |
| Fig. 1 A2, 4.2.1 | bullet-point editor; Enter adds, deleting removes | `editor.js` `onKeyDown`, `store.js` `insertSentence`/`removeSentence` |
| 4.2.1 | each bullet is a dot; dots joined; blank bullet = gap | `canvas.js` `renderArc` |
| 4.2.1, 5.2.1 | fortune recognized by a model, with protagonist and up to 3 previous sentences | `recognizer.js` (when), `recognition.py` (how), `keys.js` (cache key) |
| Fig. 8 | sentences highlighted by fortune band | `editor.js` `updateRow`, `config.js` `BANDS` |
| Fig. 1 A3, 3 | sketch: x = sentence order, y = fortune | `canvas.js` `apply`, `sketch.js` `writeFortune` |
| 3, 4.2.2 | drawing speed sets the envelope width (fast = wide, slow = thin) | `canvas.js` `move` (speed), `config.js` `halfWidthForSpeed` |
| 4.2.2 | width changes gradually on screen; actual envelope per sentence unit | `canvas.js` `renderSketch` (smoothing), `sketch.js` `fortuneSlots` (per-slot mean) |
| 4.2.2 | subtle vertical lines at sentence transitions | `canvas.js` `renderGrid` |
| Fig. 1 B1/B2 | generated sentences in blue; their fortune as a blue line on the sketch | `editor.js` (`.generated` bar), `canvas.js` `renderArc` |
| 4.2.2 | generate for sketched slots after drawing | `main.js` `onStroke`, `generator.js` `strokeTargets` |
| 4.2.2 | infilling between written sentences | `generation.py` `plan_runs` (task), prompts |
| Fig. 1 B3 | Generate Again with the same sketch | `main.js` `#generateAgain`, `generator.js` `againTargets` |
| 4.2.2 | redraw part of the line to rewrite that part | `generator.js` `strokeTargets` |
| Fig. 1 B5 | eraser; erased parts get unconstrained sentences | `canvas.js` `eraseAt`; `generator.js` (target with `fortune: null`) |
| 4.2.2 | the writer can always edit generated text | `store.js` `setSentenceText` (edited sentences become the writer's) |
| Fig. 1 B4, Fig. 4 | surprise in a separate panel, thin green line | `index.html` `#surpriseWrap`, `canvas.js` (kind `surprise`) |
| 5.2.2 | surprise sets the temperature | substituted: `prompts.py` `surprise_words` |
| Fig. 5, 4.2.3 | History dropdown; faint arcs; hover previews text and arc; click rolls back; rename, delete | `history.js`, `canvas.js` `renderHistory`, `editor.js` `renderPreview` |
| 5.2.2 | regenerate if \|target - rating\| > 0.2; 1 or 2 more times by drawing speed; keep the smallest error | `generation.py` `_batch`/`_sequential`, `pick_best` |
| 5.2.2, Fig. 9 | continuation; infill from previous; infill from next, alternating | `generation.py` `sequential_order`, `prompts.py` `single_user` |
| 5.2.2 | continuous control code between 0 and 1 | substituted: the target number and its scale band go into the prompt |

## The REST API

### `GET /api/health`

    {"ok": true, "bridge": {"ok": true, "url": "http://localhost:8787", "backend": "claude", "model": "haiku"}}

When the bridge is down, `bridge.ok` is false and `bridge.error` says how to
start it. The page polls this every 6 seconds while the bridge is down and
every 30 seconds otherwise.

### `POST /api/recognize`

    {"characters": ["Bob", "Alice"],
     "items": [{"context": ["up to three previous sentences"], "sentence": "Alice won the role.",
                "rate": [0, 1]}]}
    -> {"characters": ["Bob", "Alice"], "fortunes": [[0.3, 0.9]]}

`characters` lists the names, the protagonist first (at most 4). `rate`
(optional) lists the indices of the characters to rate; by default all are
rated. The answer has one row per item and one value per character: a
fortune, `"absent"` (the sentence does not involve that character; never for
the protagonist), or `null` (not rated, or no usable number from the model).
The old one-character form `{"protagonist": "Mike", ...}` still works and is
treated as `characters: ["Mike"]`.

One model call rates up to 16 sentences. Results are cached in memory per
character, by (character, last three context sentences, sentence). So adding
a character rates only that character.

### `POST /api/generate`

Request: the whole story, one entry per bullet. Slots with a `target` are to
be written; the others are context. Blank slots without a target are skipped.

    {"characters": ["Bob", "Alice"], "mode": "batch", "threshold": 0.2,
     "slots": [
       {"text": "Bob and Alice both auditioned ...", "target": null},
       {"text": "", "previous": "old text or null",
        "target": {"fortunes": [0.31, 0.8], "tolerances": [0.05, 0.12], "maxRegen": 2, "surprise": 0.5}},
       {"text": "", "target": {"fortunes": [null, null], "surprise": 0.5}}
     ]}

- `fortunes`: one value per character, the sketch's value for the slot, or
  `null` where that character's line is erased or not drawn (no target for
  that character). The old form `"protagonist"` plus one `"fortune"` still
  works.
- `tolerances`: the envelope half-widths (shown in the interface only).
- `maxRegen`: rewrites allowed when a try misses by more than `threshold`
  (2 for slow strokes, 1 for fast ones, 0 without a target). With several
  characters the page sends the largest value over the characters' strokes.
- `previous`: the slot's earlier text, so the model writes something new.
- `mode`: `batch` or `sequential` (see "Generation").

Response: newline-delimited JSON events, streamed as they happen:

| Event | Fields | Meaning |
|---|---|---|
| `plan` | `mode`, `runs: [{slots, task}]` | which slots are written, as continuation or infilling |
| `status` | `message` | progress text shown under the canvas |
| `draft` | `slot`, `text`, `fortunes`, `attempt` | a try and its ratings (the page shows it in italics) |
| `sentence` | `slot`, `text`, `fortunes`, `targets`, `tolerances`, `surprise`, `maxRegen`, `task`, `attempts` | the chosen sentence for a slot |

`fortunes`, `targets` and `tolerances` have one value per character. The
events also carry the protagonist's values as `fortune`, `target` and
`tolerance`.
| `missing` | `slot` | the model gave no usable sentence for the slot |
| `error` | `message` | the bridge failed; the page puts unfinished slots back |
| `done` | `seconds`, `calls`, `written`, `retried`, `missing` | summary |

If the browser closes the connection (the Stop button), the server stops at
its next event.

You can try the API without the page:

    curl -s localhost:5177/api/recognize -H 'Content-Type: application/json' \
      -d '{"protagonist":"Mike","items":[{"context":[],"sentence":"Mike won the contest."}]}'

## Recognition (`talebrush/recognition.py`)

Input per sentence, as in the paper: the protagonist's name, up to three
previous non-blank sentences, and the sentence. The system prompt holds the
paper's fortune definition (Section 5.1), a seven-band reading of the scale
(`prompts.FORTUNE_BANDS`), and the three calibration sentences from the
paper's annotation interface (Figure 6). The model answers
`{"ratings": [{"item", "reason", "fortune"}]}`. The short reason before each
number was added after one test on the Cinderella story (Figure 8): without
it, the wedding sentence was rated 0.30; with it, 0.95, and the whole arc had
the shape of the paper's Figure 8. That is one run of each prompt, not a
measurement.

With several characters (remix), a second prompt is used
(`prompts.recognition_system_multi`). It names the protagonist and the other
characters, lists the characters to rate, and asks for
`{"ratings": [{"item", "reason", "fortunes": {"Bob": 0.3, "Alice": null}}]}`.
`null` means the sentence does not involve that character. The page stores
that as `"absent"`, and the protagonist always gets a number.

The page asks for ratings 0.9 seconds after the writer stops typing
(`config.RECOGNITION_DELAY_MS`), for every sentence whose recognition key
changed. The key is protagonist + three previous sentences + sentence, so
editing one sentence also re-rates the three after it, whose context changed.
While a rating is stale, its dot is drawn hollow.

## Generation (`talebrush/generation.py`)

`plan_runs` groups the slots to write into runs separated by written
sentences. A run followed by a written sentence is **infilling**, otherwise
**continuation** (paper Figure 9).

**Batch pipeline (default).** One call writes every pending slot, with the
whole story as context and each blank's fortune target and surprise level.
One call rates all new sentences. Slots whose rating misses the target by more
than the threshold, and that still have rewrites left, are written again in
one call, with the rejected tries listed so the model moves in the right
direction. Each slot keeps its closest try. Typical cost: 2 to 6 calls,
10 to 30 seconds.

**Sequential pipeline (the paper's).** One sentence at a time. Continuation
goes left to right. Infilling alternates "infill from previous" (the sentence
right after the beginning) and "infill from next" (the sentence right before
the ending), switching for every sentence, as in Section 5.2.2. Each sentence
is rated right away and rewritten if needed. The prompts use the paper's
initialization prompts as section labels ("Beginning Story:", "Story
Character:", "Continue Story:", "Ending Story:", "Infilled Story:") in the
order of Figure 9. Typical cost: 2 calls per sentence, 7 to 30 seconds per
sentence.

**Regeneration rule** (both pipelines, from Section 5.2.2): a try is rewritten
when `|target - rating| > threshold` (0.2 by default), at most `maxRegen`
times; the slot keeps the try with the smallest error. Slots without a target
are written once. With several characters, a try's error is its largest miss
over the characters that have a target, and a try that leaves out a character
with a target (`"absent"`) has error 1.0.

## The sketch (`static/js/sketch.js`, `canvas.js`)

- The sketch is stored per sentence slot: `SAMPLES_PER_SLOT` (32) samples
  across each slot. `fortunes[characterId][j]` is `[value, halfWidth]` or
  `null` (one line per character); `surprise[j]` is a value or `null`. Inserting or deleting a bullet inserts or
  deletes that slot's samples, so the sketch stays lined up with its sentences.
- Pen speed is measured in pixels per millisecond and smoothed. It maps to the
  envelope half-width between `ENVELOPE.minHalfWidth` (0.03, slow) and
  `maxHalfWidth` (0.15, fast) in fortune units, where the canvas height is 1.
- A slot is **sketched** when the line covers half of it or passes its centre.
  Its target is the mean height of the line over the slot. Its `maxRegen` is 2
  if the mean half-width is below `ENVELOPE.tightBelow` (0.09), else 1.
- The **sketched range** runs from the first to the last slot sketched by any
  character. Unsketched slots inside it count as erased.
- **Which slots are written.** After a pen stroke: the slots the stroke
  covers, plus blank slots inside the sketched range. After Generate Again:
  every slot inside the sketched range. In both cases a slot is written only
  if it is blank or holds an untouched generated sentence. Sentences the
  writer typed or edited are kept as context (`generator.js` `isFillable`).
- The eraser removes samples within 14 px of the pointer
  (`ERASER_RADIUS`). Erasing does not start a generation by itself; Generate
  Again does.
- Drawing the arc: dots at slot centres, joined by a monotone cubic curve
  (`geometry.js`). A segment takes the colour of its right-hand sentence: blue
  if generated, grey if written by the writer.

## Front-end state (`static/js/store.js`)

All state is in one object, `state`. `state.characters` lists the characters
(`{id, name, color}`, the protagonist first, with id `c0`), and
`state.activeCharacter` is the id whose line the pen draws. Each sentence has
`fortunes` and `keys`, both keyed by character id. Components re-render from it after
`changed()`, at most once per animation frame. The story, sketch, history and
settings are saved to `localStorage` under `talebrush-revibe-v1` 0.4 seconds
after a change. The saved format is version 2; version 1 (one protagonist,
from before the remix) is still read, and becomes a story with one
character. In the browser console, `talebrush.state` shows the live
state.

History (`history.js`): every finished generation stores a snapshot (text,
fortunes, sketch). Before anything replaces the editor's text (a generation,
a roll-back, New story, an example), the current text is stored first if no
snapshot has it. Such an entry is named "<name> (edited)" when it is an edited
stored story, and "Initial" (or "Initial 2", ...) when the story was never
stored before. So the writer's text is never lost.

## Changing things

- **Envelope widths, speeds, retry rule, colours, delays:** `static/js/config.js`.
- **Prompts:** `talebrush/prompts.py`. Restart the server after editing Python files.
- **Default threshold and surprise:** `generation.py` (`DEFAULT_THRESHOLD`,
  `DEFAULT_SURPRISE`) and `config.js` (the values the page sends).
- **A larger model:** restart the bridge with `BRIDGE_MODEL=sonnet python3 llm-bridge/bridge.py claude`.
- Static files are served with `Cache-Control: no-store`, so a page reload
  picks up JavaScript and CSS changes.

## Tests

From `revibes/talebrush/app/`:

    python3 -m unittest discover -s tests       # back end, with a fake model
    node --test tests/frontend.test.mjs         # front-end modules

Neither makes model calls. The back-end tests check request parsing, the
continuation and infilling plan, the paper's alternating infill order, the
regeneration rule (1 or 2 rewrites, keeping the smallest error), the
three-sentence recognition context and the cache. The front-end tests check
which slots a stroke sketches, the speed-to-retries rule, erased gaps,
inserting and deleting slots, the curve, and sentence splitting on paste.

## Substitutions and known limits

- **Models.** GPT-Neo 2.7B with soft prompts (recognition, continuation,
  infilling) and the GeDi class-conditional model (GPT2-medium) are replaced
  by the bridge model, Claude Haiku through Claude Code. The paper's training
  data (crowdsourced fortune labels on ROCStories, ranked with TrueSkill) is
  not rebuilt, because the substitute model needs no training.
- **Surprise** is described in the prompt instead of setting the temperature,
  because the bridge ignores temperature.
- **Batch pipeline** is the default for speed; the paper's sentence-by-sentence
  pipeline is in Settings.
- **Rewrites** list the rejected tries in the prompt. The paper sampled again
  with the same input. Here the bridge cannot change the sampling
  temperature, so a plain retry could return almost the same sentence; listing
  the rejected tries tells the model which direction to move. This is a design
  choice; it was not compared against plain retries.
- **Speed.** Every model call takes about 3 to 7 seconds. Ratings appear about
  five seconds after typing stops.
- **Calibration.** The same bridge model writes the sentences and rates them,
  so a close rating is not independent evidence that a reader would agree. In
  the five test generations run while building (20 sentences with a fortune
  target), every final sentence was rated within 0.2 of its target, and 3 of
  the 20 needed one rewrite. The paper's own recognition model had a mean
  error of 0.179 against human labels; this build has no human labels to
  compare against.
- **Not built:** the paper's technical evaluation and user study, and ideas
  the discussion lists as future work (smoothing the sketch, letting writers
  correct the machine's ratings). Several characters' fortunes is built as a
  remix (below).

## Several characters (remix)

Not in the paper. `../remixes.md` gives the reasons and the question it
explores. Where it lives:

| Behaviour | Code |
|---|---|
| characters, colours, names sent to the model, loading old stories | `static/js/characters.js` |
| chips, + Character, remove, choosing a character (click or keys 1 to 4) | `static/js/cast.js`, `main.js` (`selectCharacter`, keydown) |
| pen and eraser act on the chosen character's line | `canvas.js` `samples`, `down` |
| one envelope and one rated line per character; dotted segment where a character is absent | `canvas.js` `renderSketch`, `characterPoints`, `renderArc`; styles under `.multi` in `talebrush.css` |
| several characters: a stroke marks sentences; the button becomes Generate | `main.js` `onStroke`, `strokeSlots`, `#generateAgain` handler |
| one target per character per slot; slowest stroke sets the retries | `sketch.js` `castSlots`, `generator.js` `runGeneration` |
| unnamed characters are not sent to the model | `characters.js` `namedCast` |
| per-character ratings and cache keys | `keys.js` `ratingKeys`, `recognizer.js`, `recognition.py` |
| prompts with one target per character | `prompts.py` `*_multi`, `MULTI_RULES`, the branches in `fortune_instruction` and `feedback_lines` |
| largest miss over characters; absent counts as 1.0 | `generation.py` `error_of` |

The back-end tests check that a one-character request gets the
one-character prompts (`test_one_character_prompts_have_the_one_character_form`).
They do not compare against the code from before the remix. That comparison
was made once while building: 8 one-character prompts rendered by the old and
the new `prompts.py` were identical.
