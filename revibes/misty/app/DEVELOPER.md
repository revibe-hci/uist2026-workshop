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


## Foldable iPhone remix (`?duo`)

`src/lib/duo.js` holds the fold angle (0 closed, 180 flat) and exposes
`window.mistyDuo.setPosture(angle)`. `src/components/DuoView.jsx` shows the level picker between 15°
and 165° and the outer display below 15°. The angle maps to a blend level (the first k change
categories); a level held for 700 ms is selected, and the change to the closed posture applies it
with `setBlendLevel` in `App.jsx`, which shares `applyCategories` with the toggles. `LevelRail` draws the level meter in the outer
screen's right safe area, read from the node's switches. On the outer display a blend gets change switches, which call
the same `toggleCategory` and `resetAll` as Applied Changes. Both follow the selected source node, or the latest
blend. The scrub cross-fades `data.blend.parentCode` under `data.code`, so it never calls the
model; it stays mounted while hidden so it shows at once. In a browser, `?duo` adds a hinge
slider; inside the iOS app in `../duo/`, the app sets the angle and the page hides its slider.
Without `?duo` nothing changes. The iOS app can also report where the fold divides the screen
(`window.mistyDuo.setFold`), and the scrub then splits around it.

`npm run dev:phone` serves the app on the network for a real phone, with model calls sent to
`/bridge` on the dev server, which `vite.config.js` forwards to the bridge. In that mode the dev
server answers only this Mac, private network addresses and those in `PHONE_IPS`, so nobody else
can spend the group's plan through it.

**Touch / Select** (`touchMode` in `App.jsx`, shared through the context): shown when `?duo` is on or
the pointer is coarse. Touch sets `nodesDraggable` and `nodesConnectable` off and drops the `nopan`
class from the example frame (`ExampleNode`) and the render (`CodeRender`), so a drag there pans.
Select restores Misty's behaviour. `panOnDrag` stays on in both, because turning it off in
React Flow also turns off pinch zoom on touch screens. The mode is kept in `localStorage`.

**Haptics:** `haptic(kind)` in `src/lib/duo.js` posts `level`, `select` or `apply` to the iOS app's
`mistyHaptic` message handler (`duo/MistyDuo/Haptics.swift`). In a browser it does nothing.
