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

## 3D blending remix (branch `misty-table7-3dui`)

Blending can rebuild 3D elements of a reference as live three.js scenes inside the generated UI.

- **Dependencies:** `three` 0.169 and `@react-three/fiber` 8 (the React 18 line). Generated code
  writes 3D as fiber JSX (`<mesh>`, `<torusKnotGeometry>`, `<meshPhysicalMaterial>`), which is
  much shorter for the model than imperative three.js. After `npm install`, restart `npm run dev`:
  a dev server started before the install keeps stale pre-bundled dependencies and crashes with
  "Cannot read properties of null (reading 'useMemo')".
- **3D helpers.** `src/lib/three3d.jsx` defines the components generated code can use:
  - `Scene3D` is a viewport with lights and drag-to-rotate (three's `OrbitControls`). It
    measures its layout size (`resize={{ offsetSize: true }}`): inside a zoomed React Flow node,
    the on-screen size is scaled and would shrink the scene into a corner.
  - `RoundedBox` uses three's `RoundedBoxGeometry`.
  - `Spin` and `Float3D` add simple motion.
  - `useFrame` and `THREE` are in scope too, for custom animation.
  - An error inside a scene is caught there and reported to the node, so the rest of the UI keeps
    rendering and Fix Render still sees the error.
- **Loading on demand.** `src/lib/renderScope.js` builds the scope for both the node preview
  (`CodeRender`) and the code dock (`CodeDock`). When the code uses a 3D helper (`USES_3D`), it
  loads `three3d.jsx` with a dynamic import, which builds as a separate chunk. Until then the node
  shows "Loading 3D…". `src/lib/sceneError.js` holds the context that scenes report errors
  through.
- **Prompts** (`src/lib/prompts.js`):
  - `THREE_D_API` describes the helpers and fiber JSX, with an example. It is part of
    `CODE_RULES`, so the toggle and Fix Render prompts keep 3D intact.
  - `threeDInterpretRule` tells the model to look for 3D elements, rebuild them in place, and
    report them in a "3D:" category, with each change's `after` as an exact JSX snippet.
  - The global prompt applies the rule only when the reference has 3D. The drop prompt applies it
    when the **3D** aspect is picked (`BlendDialog.jsx`), and otherwise says not to add 3D.
- **Repair rules.** `fix3D` in `src/lib/repair.js` maps names the model often borrows from
  fiber or drei:
  - `Canvas` becomes `Scene3D`, and `Float` becomes `Float3D`.
  - It drops self-closing drei extras such as `OrbitControls` and `Environment`.
  - It turns drei wrappers such as `Center` and `Stage` into `group`.
  - The helper names count as known components, so the unknown-component rule leaves them alone.
- **Fine-grained edits.** `swapChangeValue` in `src/lib/changes.js` swaps a change's whole value,
  or failing that only the space-separated parts that changed. This lets
  `color="#8b6cf0"` → `color="#f59e0b"` apply even though the model wrote the whole element on
  one line.
- **Samples.** `public/examples/3d-product.png` and `3d-stats.png` are rendered with three.js
  by `scripts/make-3d-examples.mjs` (headless Chrome with software WebGL).
- **Limits:**
  - Each scene is a WebGL context, and browsers keep about 16 per page, so with many 3D nodes
    the oldest scenes go blank.
  - Downloaded code needs the helpers in `three3d.jsx` to run elsewhere.
  - 3D text is not supported: text stays in HTML over or next to the scene.
- **Testing in headless Chrome** needs software WebGL:
  `--use-angle=swiftshader --enable-unsafe-swiftshader`.

