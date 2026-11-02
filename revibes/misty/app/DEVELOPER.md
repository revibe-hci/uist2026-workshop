# Misty: developer guide

## Requirements

- Node 20 or newer, with npm
- Python 3, for the LLM bridge
- A signed-in Claude Code CLI recent enough to support `--tools` (2.0.28 is too old, 2.1.309 works)

## Install and run

```bash
python3 llm-bridge/bridge.py claude
```

```bash
cd revibes/misty/app && npm install && npm run dev
```

The app runs on http://localhost:5173 and the bridge on http://localhost:8787. Check the bridge at
http://localhost:8787/health. To use another bridge port, set it when starting the app:

```bash
cd revibes/misty/app && VITE_BRIDGE_URL=http://localhost:8788 npm run dev
```

To try a larger model if blends are too weak (record this as a substitution):

```bash
BRIDGE_MODEL=sonnet python3 llm-bridge/bridge.py claude
```

There is no `.env` file and no API key. Do not change `llm-bridge/`; other groups share it.

The remix remains compatible with either bridge backend. If Claude is not signed in, the
signed-in Codex CLI can provide calls with `python3 llm-bridge/bridge.py codex`. The UI's model
badge reports the actual backend/model substitution. A separately running bridge on 8788 can
be selected with `VITE_BRIDGE_URL=http://localhost:8788` when starting Vite.

## Stack

| Library | Role |
|---|---|
| React 18, Vite | App and dev server |
| `@xyflow/react` (React Flow) | Infinite canvas, nodes, edges |
| `react-live` | Renders and edits source node code in the browser |
| `@tailwindcss/browser` | Compiles Tailwind at runtime, since generated classes are unknown at build time |
| `lucide-react` | Icons for generated UIs and the interface |

## Layout

```
src/
  App.jsx                  Canvas state and every operation: blend, toggle, regenerate, fix, drag
  context.js               Gives nodes access to those operations
  styles.css               Misty's own look, matched to Figure 1 (tokens on :root, classes prefixed m-)
  components/
    ExampleNode.jsx        Example image, crop selection, connection handle
    SourceNode.jsx         Code Render panel and its tools
    CodeRender.jsx         react-live preview; marks the drop surface with data-misty-preview
    AppliedChanges.jsx     Semantic diff: toggles, Reset All, class-level edits
    BlendDialog.jsx        Pick Blending Option
    CodeDock.jsx           Docked live code editor
    DemoTour.jsx           Guided Demo: picker, spotlight, step card
  lib/
    tours.js               Guided Demo content: steps, what each spotlights, when each is done
    dom.js                 Finds the block a drop lands on
    prompts.js             Appendix A.3 prompts, plus our toggle and Fix Render prompts
    llm.js                 Bridge calls, JSON parsing, category normalising
    repair.js              Regular-expression repair of generated code (Section 4.3)
    icons.js               Icon list named in the prompts; builds the render scope
    image.js               PNG normalising and cropping
    samples.js             Starter source UIs and the sample example list
public/
  stock/                   Generated placeholder photos, from scripts/make_stock.py
  examples/                Sample examples as SVG
```

## Table 7: isolated blend experience

All new visual/input/tutorial logic lives under `src/remix/`, with scoped `rm-*` CSS. Integration
touches only the app's blend lifecycle, source preview callbacks and optional model-request
arguments. Existing Appendix A.3 prompts, semantic toggles, source editing and Guided Demo remain.

### Facts and progress hooks

`callModel()` buffers a single JSON response. It does not stream tokens or individual UI parts.
`App.jsx:requestBlend()` emits `onBlendStart`, then `onResponseReceived` after JSON parsing and
repair, or `onBlendError` on transport/parsing failure. `CodeRender` reports runtime/compile errors
and a successful preview after two animation frames. `SourceNode` measures visible semantic
regions in one read-only layout batch, then calls `onPreviewReady`. Only then does the event store
permit part reveals and completion. During the wait, the scene is explicitly illustrative;
after rendering, part events are a visual replay of an already available result.

`events.js` exports `createBlendEvents()` and a shared `blendEvents` instance. Its interface is
`onBlendStart(id, details) -> run`, `onResponseReceived(id, run, code)`,
`onPreviewReady(id, run, code, regions, immediate)`, `onPartGenerated(id, run, part, source)`,
`onBlendComplete(id, run)` and `onBlendError(id, run, error)`. React subscribers use
`useSyncExternalStore`. Sessions move through waiting → rendering → assembling → complete, or
error. Run IDs reject stale responses; retries clear old reveal timers. Empty/broken previews
cannot complete. Deleting/resetting nodes aborts requests and removes sessions. A request timeout
is 330 seconds. The reduced-motion path emits the same region data immediately without animation
timers. A future streaming pipeline can provide verified part events through this interface.
`onPreviewRepaired` removes a settled error overlay after Fix Render or editing produces a
different, successfully rendered component; stale or unchanged previews cannot dismiss an error.

### Files and independent flags

- `flags.js`, `context.js`, `RemixContext.jsx`: presets, stable React context, preferences, sound
  opt-in and system motion. Fog/builders start on, input/voice off, tutorial on. Sound is separate
  session state and never persisted. Query presets override initial local settings per tab.
- `BlendOverlay.jsx`, `FogCanvas.jsx`: dismissible progress, low-resolution cached cloud/grain
  canvas, region cutouts and static error/reduced-motion presentation.
- `BuilderStage.jsx`, `three-stage.js`: lazy Three.js scene, original round/square-headed workers,
  labeled source A/B blocks and a CSS fallback. Rendering uses one RAF loop and cached geometry;
  it pauses drawing offscreen/in background, caps DPR at 1.5, and disposes geometries, materials,
  textures, renderer and context on exit. `data-fps` is a one-second diagnostic on the canvas.
- `WaitInput.jsx`, `steering.js`: bounded normalized sketch strokes, text and persistence via
  source node `waitInput`. A request snapshots input at start into `appliedWaitInput`; input added
  while it runs remains for the next iteration. Regenerate or a new blend from that result adds
  its note and a transparent 375×720 sketch PNG to the request, separately from the reference.
  Disabled input flags exclude stored input from requests without deleting it; voice-only mode
  includes text/transcripts but omits sketch strokes.
- `voice.js`: push-to-talk browser recognition adapter. Explicit gesture only; final results
  append to notes; 45-second limit; permission/error/unsupported feedback and abort on dismissal.
- `sound.js`: original Web Audio synthesis; no audio assets or microphone. Quiet ambience,
  filtered duck-like placement/completion calls, immediate mute and node disposal. Sound requires
  user activation, is suppressed with reduced motion/hidden tabs, and follows device/browser
  volume and mute. Browsers expose no universal API for reading OS silent/DND settings.
- `RemixControls.jsx`, `RemixTutorial.jsx`, `modal.js`: independent preset links, feature switches,
  seven-step modal, source/base credits, labeled offline rehearsal, actual preview-error exercise,
  focus trapping, Escape, focus return and inert background. The tutorial never resets the canvas.

Source letters encode the requested blend roles (A content, B visual inspiration). They are
explanatory animation, not measured pixel/code provenance. No extra model calls are made to infer
that attribution. WebGL falls back to flat builders; speech support depends on the browser.

### Verification

`npm test` runs the deterministic event-store, steering request, voice-adapter and audio resource
lifecycle tests without model calls. `npm run build` confirms production chunks; Three.js must
remain in the dynamically imported `three-stage-*` chunk. Exercise the tutorial replay/failure
buttons for a no-credit visual check. Check a real blend separately: while waiting add a note and
mark, then Regenerate; verify the requested edit, retained mark, and untouched source. Test reduced
motion, mute, independent presets, mobile modal scrolling and keyboard focus return.

## How a blend runs

1. **Global:** `onConnectEnd` in `App.jsx` calls `globalBlend`. Dropping the connection anywhere on a
   source node counts, not only on its handle.
2. **Localized:** `ExampleNode` stores the selection as fractions of the image, so it does not depend
   on canvas zoom, and crops it to PNG. `startCropDrag` tracks the pointer. `pickTarget` climbs from
   the hovered element to the nearest block at least half the screen wide and 36px tall. On drop, that
   element's `outerHTML` (first 4000 characters) becomes `${targetCodeDropped}` in the prompt.
3. `startBlend` creates a child source node showing the parent's code, adds a solid edge from the
   parent and a dashed edge from the example, then calls `requestBlend`.
4. `requestBlend` sends the prompt and image, passes `updatedCode` through `repairCode`, and stores
   the code with `categorizedChanges`. A category such as `"Color: Changed..."` is split into the
   uppercase label and description in the panel.

## Semantic diff behaviour

`toggleCategory` looks up the set of enabled categories in `toggleCache`. All-on (the blend) and
all-off (the parent code) are seeded, and any state already fetched is reused. Other states make one
model call. A toggle changes the node in place rather than creating a new node.

Code edits clear `toggleCache`. `editChange` is a plain string replacement of the `after` value in the
code, with no model call.

## Changing the code that gets rendered

`repairCode` runs on every generated or added source. It forces `/stock/` images, swaps unknown
capitalised JSX tags for `Circle`, and rewrites `h-screen` and `fixed bottom-0`, because the screen
is a 375x720 container rather than the browser window.

The prompts in `prompts.js` keep the paper's wording apart from asking for strict JSON. The paper's
few-shot example labels `bg-black` to `bg-white` as "light to dark"; that error is kept deliberately.

## Guided Demo

`DemoTour` polls the page every 100ms rather than hooking into the app. Each step in `tours.js` has
`targets()`, returning what to spotlight, and optionally `done()`, which advances the step when true.
A step without `done()` waits for Next. Steps don't advance while the pointer is down, or if `done()`
was already true on arrival (after Back). The tour uses the app only through `loadScene`, `fit` and
`fitLatest`, which are built in `App.jsx`. To add a demo, add an entry to `TOURS`.

## Known limitations

- Drops always target a block-level element, so a single small element can't be targeted exactly.
- Mapping rendered HTML to source relies entirely on the model.
- Toggles rely on the model too, so unrelated parts of the UI can change.
- There are no automated tests.

## Remix base additions (table 7)

This app is the table 7 remix base: Kiki's revibe (table 7, group 3), with four features ported
from the group 1 "xhigh" revibe.

- **Saved canvas.** `src/lib/persist.js` stores nodes, edges and the viewport in IndexedDB
  (`misty-remix-table7`) 600 ms after each change. `App.jsx` restores it on start, and marks a
  blend that a reload interrupted with an error, so Regenerate retries it. **New Canvas** clears it.
- **Wider drop target.** While dragging a section, holding Shift (or Alt) moves the highlighted
  target up to its parent element (`trackTarget` in `App.jsx`). The drag ghost shows a hint.
- **Color swatches.** In Applied Changes, a class value that contains a Tailwind color gets a
  swatch. It opens a palette, and picking a color goes through the same `editChange` as typing,
  so it needs no model call (`ColorSwatch` in `components/AppliedChanges.jsx`).
- **Download.** The code dock saves the component as `misty-component.jsx`.

- **Repair rules.** `src/lib/repair.js` now uses xhigh's rules. They render the main component
  when the code defines several, keep HTML comments as JSX comments, handle multi-line imports,
  `style="..."` strings and JSON-escaped code, and rewrite screen classes (`h-screen`, `fixed`)
  only inside `className`. Avatars get portrait photos. Icon-like names (`FaHeart`, `HomeIcon`)
  become the matching lucide icon. New in the remix base: any other unknown component that wraps
  content becomes a `<div>`, so its text is kept. A self-closing one becomes a `Circle` icon.

Two fixes: Reset All now also restores class values edited in the panel (`original` on each
change), so the list matches the code again. Pasted code with an unknown wrapper component no
longer loses its text.
