# TaleBrush (revibe)

A rebuild of TaleBrush (Chung et al., CHI 2022) from the paper alone: write the
start of a story as bullet points, sketch the protagonist's fortune as a line,
and a language model writes sentences that follow it.

The language model is reached through the workshop's **LLM bridge** (no API
key). It stands in for the paper's GPT-Neo / GeDi models; see
`../changes/v1.md`.

## Launch

You need Python 3 and a signed-in Claude Code (`claude`). Two terminals, both
from the **repository root** (`uist2026-workshop/`):

1. Start the LLM bridge (leave it running):

       python3 llm-bridge/bridge.py claude

   For the remix's design space, allow more parallel calls:

       BRIDGE_PARALLEL=12 python3 llm-bridge/bridge.py claude

   Check it at http://localhost:8787/health.

2. Start TaleBrush:

       python3 revibes/talebrush/app/server.py

3. Open http://localhost:5177

No language model available? `python3 revibes/talebrush/app/server.py --stub`
runs with canned sentences and keyword-based fortune scores. A yellow banner
marks stub mode; it is only for trying the interface.

Ports: `TALEBRUSH_PORT=5180` changes the app's port; if the bridge runs on
another port, set `BRIDGE_URL=http://localhost:8788`.

## Use

1. **Name the protagonist** in the field above the canvas ("Mike's fortune").
2. **Write the story as bullet points** on the left, one sentence per bullet.
   Enter adds a bullet; Backspace on an empty bullet deletes it. Each written
   sentence appears on the canvas as a gray dot, left to right in bullet order.
   Its height is the protagonist's fortune, as recognized by the model (higher
   is better). Blank bullets leave a gap in the line.
3. **Sketch the fortune arc** with the pen over the empty part of the canvas, in
   one stroke. Each column between the subtle vertical lines is one sentence
   slot. Drawing **slowly** gives a thin band: the generated sentences must
   match it closely and TaleBrush retries more. Drawing **fast** gives a wide,
   loose band.
4. When you lift the pen, TaleBrush **generates** one sentence per sketched
   slot (blue in the editor) and draws the generated story back on the canvas
   as a blue line. The dots come from re-reading the generated sentences, so
   they can fall off the sketch.
5. Iterate:
   - **Generate Again**: new sentences for the same sketch.
   - **Redraw part** of the band: only those slots are regenerated.
   - **Eraser**: erase part of the band. With Generate Again, erased slots get
     sentences with no fortune target.
   - **Infill**: write a first and a last sentence with blank bullets between
     them, sketch across the gap, and the blanks are filled.
   - **Edit** any generated sentence. Its dot moves, and later generations use
     it as context.
6. **Surprise in a separate panel** opens a second canvas under the first.
   Draw a thin line there for how surprising each sentence should be, then
   Generate Again (or sketch).
7. **History** keeps every generated story. Their arcs are drawn faintly on
   the canvas. Hover an entry to preview its text and highlight its arc; click
   to roll back. ✎ renames and ✕ deletes an entry.

Each generation takes several seconds: it is one or more model calls through
the bridge, plus re-reading the results.

## Remix: TaleBrush × Luminate (branch `remix/talebrush-luminate`)

Not in the paper. See `../remixes.md` for the question it explores.

1. Write an opening and name the protagonist, then **✦ Suggest dimensions**.
   Arc dimensions appear as lanes under the fortune canvas; setting dimensions
   (genre, point of view, …) appear as chips. Type into "+ add your own
   dimension" to add one.
2. **Sketch what you know, leave the rest blank.** Draw on the fortune canvas
   or any lane, and pin setting chips. Blank lanes and settings left on
   "explore" vary across versions.
3. **Explore versions** writes 6, 12 or 18 versions in parallel. They appear in
   the Design space as they arrive.
   - Choose x and y axes (a lane's shape, or a setting).
   - Zoom with • ∿ T ¶ ☰, or pinch / Ctrl+scroll: dots → arcs → titles →
     loglines → full outlines.
4. **Hover** a version to preview its text in the editor and its arcs on the
   canvas and lanes.
5. **Click** a version to adopt it. Its dots are then corrected by the
   recognition module. In the yellow panel, **Pin its curve** (fortune or any
   lane) copies that curve into your sketch, **Pin its settings** pins its
   chips, and **4 more like this** adds variations.
