# Developer walkthrough

## Setup

Read the adjacent README for the two-process launch. Application code uses only Python's standard library and native browser modules. Internet is required for Codex model calls. Google Fonts is optional: the UI falls back to system sans-serif and Georgia if unavailable. There are no runtime package dependencies, build step, .env secrets, author code or custom-trained weights.

## Remix architecture and protocol

The current UI uses schema version 2. Legacy single-protagonist endpoint descriptions below remain supported for original clients.

- `static/tracks.mjs` owns characters, built-in/custom dimension definitions, independent track arrays, selected-track views, score invalidation, planned-range accumulation and migration of the entire saved workspace/history. Track keys are `characterId:dimensionId`; each stores aligned `controls` and `values` arrays.
- `static/storage.mjs` writes a pre-migration backup and gates every subsequent save if loading/backup fails, preventing a seed draft from replacing a retained original.
- `static/cast.mjs` manages cast and custom-dimension forms, selectors, endpoint labels and the constrained-curve overview.
- `static/space-math.mjs` implements perspective projection, inverse plane dragging, bounds, nearest/depth-based picking and per-dimension target writes. `static/space.mjs` renders the perspective 3D canvas, cube/grid, numbered targets and recognized positions, orbit/zoom, axis selectors and keyboard-accessible sliders. It uses no graphics dependencies. Camera state is view-only; target values use the same saved tracks as the 2D interface.
- `multi_story.py` validates schema-2 requests and jointly generates/scorers multiple characters and dimensions. `story.py` dispatches to it when `characters` is present, preserving the legacy implementation.

New generation requests contain `characters:[{id,name,description}]`, `dimensions:[{id,name,low,high,description}]`, `activeCharacterId`, `activeDimensionId`, `tracks:{key:{characterId,dimensionId,controls,values}}`, `slots`, `indices`, `title` and `surprises`. All metadata, IDs, finite scores, array lengths and selected indices are validated. Bounds: six characters, eight dimensions, 30 slots and 24 generation slots. Unknown pairs and duplicate IDs/names fail before calling the model.

Each generation plan includes all non-null controls at that slot across every character/dimension. Candidate recognition receives only actual text/context plus pair meanings, never target/tolerance values. The active pair and all constrained pairs are scored in one batch. Responses contain `updates:[{index,text,source,values:{pairKey:score}}]`; recognition returns `scores:[{index,values:{pairKey:score}}]`. Missing/extra pair keys fail atomically. The first candidate is accepted if every constrained pair is within 0.2; otherwise aggregate absolute error divided by each tolerance (minimum 0.08) selects an alternative.

Schema-1 drafts migrate under the same storage key with a separate untouched backup. All histories are migrated. Text edits clear downstream recognition values; character metadata edits clear only that character’s values. Insert/delete shifts every curve. New story clears all targets, recognized values and planned ranges while retaining the cast and dimension definitions. 3D mode stages edits and uses the accumulated planned range for manual generation.

Run all tests with `node --test tests/*.test.mjs` and `python3 -m unittest discover -s tests -v`. Node tests cover independent tracks, storage-failure preservation and 3D mathematics in addition to the original controls. See `docs/story-space-design.md`, `docs/characters-dimensions-design.md` and `../remixes.md` for scope and validation.

## Files and data flow

- `server.py`: localhost-only threaded HTTP server, static assets, JSON endpoints, request size/content checks, origin checks, clean error responses. `--port` defaults to 5173. `TALEBRUSH_BRIDGE_URL` defaults to `http://localhost:8787`.
- `story.py`: validates the complete draft and generation indices, verifies bridge backend identity, sends JSON-format requests, parses model output and atomically returns updates. Recognition scores must be finite numbers in [0,1]. Any missing, duplicate, unexpected or malformed response fails without partially replacing the draft.
- `static/core.mjs`: pure slot/arc utilities, sparse pointer interpolation, speed-to-tolerance calibration and range eligibility. State consists of title, protagonist, slots (`id`, `text`, `source`, `fortune`), aligned controls/surprises, last range and surprise-panel visibility.
- `static/canvas.mjs`: renders fortune bands, tolerance envelope, actual recognized points, history overlays and surprise line in SVG. Pointer coordinates are normalized, interpolated over sentence columns, and sampled into control values. Hover updates existing dots without removing keyboard focus.
- `static/app.mjs`: editor and keyboard behaviors, async generation/recognition, linked hover, undo snapshots, history hover/restore, export and localStorage persistence. A generation locks editing to avoid stale replacement. Recognition allows editing but discards results if the draft revision changes. A stroke during recognition is queued; changing the draft cancels queued work. History preview is non-destructive until selection.
- `static/index.html`, `style.css`: accessible labels, help dialog, responsive editor/canvas layout, visible substitutions and model errors.
- `docs/design.md`, `implementation-plan.md`: approved reconstruction scope and execution plan.

## Endpoints

`GET /api/health` returns `{ok,backend,model,bridge,message}`. It checks bridge reachability and Codex identity only. It cannot guarantee model access.

`POST /api/recognize` accepts `{protagonist, slots:[{text,...}]}`. It sends nonempty sentences and the last three preceding nonempty sentences to recognition. Response: `{scores:[{index,fortune}]}`.

`POST /api/generate` accepts the draft plus `indices:[0-based index,...]`, aligned `controls:[null|{target,tolerance},...]`, and `surprises:[null|number,...]`. Nonempty human slots cannot be overwritten. First call produces 1 unconstrained, 2 normal or 3 tightly constrained candidates per selected slot. Second call scores each candidate independently, without target/tolerance data. Selection retains a first candidate within 0.2; otherwise it chooses minimum fortune error. Response: `{updates:[{index,text,fortune,source:"ai"}],candidate_count,recognition}`. Updates outside the requested indices are rejected.

Requests are capped at 200KB; each slot at 4,000 characters; protagonist at 100; title at 200. One draft has at most 30 slots and a request at most 24 selected slots. HTTP POST requires JSON and the local app origin (or no Origin for a CLI client). The bridge is called on the backend, never from browser code. API failures surface in an alert with the draft retained.

## Tests

From this app directory:

```sh
python3 -m unittest discover -s tests -v
node --test tests/core.test.mjs
node --check static/app.mjs
node --check static/canvas.mjs
```

Python tests exercise candidate selection, anchor preservation, independent scoring inputs, recognition across gaps, bad indices, invalid scores and incomplete responses. Node tests exercise interpolation, single-point strokes, erase gaps, speed effects, aligned insertion/deletion and protected sentence ranges. These tests inject deterministic model responses and do not consume the group's plan. Browser verification and live-integration limitations are recorded in `../changes/build.md`.

## Paper mapping

| Paper | Implementation |
| --- | --- |
| §4.2.1; Figure 1 | Sentence slots, insertion/deletion, editable text, visual gaps, recognized fortune points |
| §4.2.2; Figures 1 and 4 | Draw/release, continuation, infilling, redrawing ranges, Generate Again, eraser, speed tolerance, surprise canvas |
| §4.2.3; Figure 5 | Saved stories, translucent comparison arcs, hover/focus preview, rollback |
| §5.2.1 | Separate fortune recognition with protagonist and preceding context; prompt substitute |
| §5.2.2; Figures 7, 9 and 10 | Continuous fortune targets and candidate selection; prompt/batching substitutes |

Training data collection, soft-prompt learning, modified GeDi token distributions, TrueSkill calibration and experimental evaluation are not recreated. Multiple characters and dimensions are now implemented as the user-directed remix; flashbacks and longer-form hierarchical story controls remain outside scope.

## Repository practice

All new application files are under `revibes/talebrush/`. Shared bridge and paper files remain unchanged. The downloaded PDF is beside the checkout at `../TaleBrush-CHI2022.pdf`. The group's requested identity is recorded in the README; changes are on `codex/talebrush-table1-group2`. Do not push main, access the grading rubric, produce grades or advance workshop steps without the group's prompt.

## Directed relationship extension

Optional `relationshipTracks` map uses keys `rel:sourceId:targetId:type`. Each track contains `characterId`, `targetCharacterId`, `dimensionId` (trust/rivalry/affection/power), `controls` and `values`. `activeRelationshipKey` selects a curve. Definitions are separate from individual character dimensions. `relationship-state.mjs` supplies validation, migration, lifecycle hooks, `allArcTracks` and an SVG-compatible relationship view. `relationships.mjs` renders pair/type/time selectors, a directed graph and sketch controls.

Backend validation rejects self-relationships, unknown endpoints/types/keys, malformed lengths and values. Generation combines relationship controls with individual controls; recognition receives named source/target identities and fixed meanings without the desired values. Scores return using relationship keys and are applied to the corresponding map. Candidate choice minimizes aggregate error when relational constraints are present; individual-only requests retain the original 0.2 acceptance threshold.

The 2D relationship timeline edits directed pair states over sentence order. The existing 3D/nD view continues to manipulate individual attributes. Relationship histories, row insertion/deletion, score invalidation, endpoint rename/removal and New story share the existing lifecycle and storage protection.
