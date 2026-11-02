# Misty (revibe)

A rebuild of **Misty: UI Prototyping Through Interactive Conceptual Blending**, made from the
paper alone. Blend example screenshots or sketches into work-in-progress React and Tailwind UI
code on an infinite canvas.

**Table 7 remix base.** This is Kiki's revibe (table 7, group 3) with four features from the
group 1 "xhigh" revibe: the canvas is saved in the browser (**New Canvas** clears it), Shift widens
the drop target, color swatches in Applied Changes, and Download in the code editor. See
`DEVELOPER.md` and `../remixes.md`.

There is no API key. Model calls go through the workshop's LLM bridge, which uses Claude Code
(by default the Haiku model, not the paper's GPT-4o).

## Launch

From the repository root, in one terminal:

```bash
python3 llm-bridge/bridge.py claude
```

In a second terminal:

```bash
cd revibes/misty/app && npm install && npm run dev
```

Open http://localhost:5173. The bar at the bottom of the canvas warns you if the bridge is
unreachable.

**If blends fail:** the error appears under the new node.

- `unknown option '--tools'`: your `claude` command is too old for the bridge. Update Claude Code.
- `OAuth session expired`: sign in to Claude Code again, in a terminal.

## Use it

The canvas opens with a reference example on the left and the "Find parks" UI from Figure 1 on
the right. Drag panels to move them, drag the background to pan, and scroll to zoom.

### Add your own material

- **Add Example:** upload a screenshot or a photo of a sketch, or pick a sample. You can also
  paste an image or drop a file onto the canvas.
- **Add Source:** upload or paste a React component written as `() => { return (...) }`, or pick a
  starter UI. Tailwind classes and lucide icons work without imports.

### Global blend (exploring)

Drag from the bar on the right of a reference example to a source UI. Misty immediately creates a
new source node, keeping your content and taking the example's layout and visual style.

### Localized blend (targeted)

1. Drag across the example image to select a section. **Undo** steps back and **Done** locks it.
2. Drag the section onto the source UI. The area it will affect is highlighted.
3. Drop it and choose one or more options in **Pick Blending Option**: Color, Layout, Content
   (adds the selected element), or Customize (type your own aspect).
4. Press **Next**. The result appears as a new source node, and the original stays on the canvas.

### Refine the result

- **Applied Changes** lists the semantic diff. Turn a toggle off to remove that category of change;
  Misty asks the model for updated code, so this takes a few seconds and may not be exact.
- Open "class changes" under a category to see each before and after value, and edit an after value
  to swap that class directly.
- **Reset All** restores the blend as it first came back, which also discards manual code edits.
- **Regenerate** runs the same blend again for a different result.
- **Fix Render** repairs broken code, first with syntax rules and then with the model.
- **Show Code** opens the live editor on the right. Edits render as you type, and **Copy** takes the
  code back to your project.

## Guided Demo

Press **Guided Demo** in the toolbar for on-screen walkthroughs, one for each part of
`MANUAL_TEST.md`. Each step highlights what to do, explains why it matters, and moves on when you
have done it. **Back** and **Skip step** are always there, except while a blend is running. Starting a
demo resets the canvas. This mode is an addition for this revibe and is not a feature of the paper.

## 3D blending (remix)

This remix lets blending read 3D elements in a reference and rebuild them as live 3D with
three.js. 3D elements are things like rendered objects, glossy or glass shapes, 3D charts, and
cards with depth.

- Add **3D: product hero** or **3D: stats with 3D chart** from the sample examples, or your own
  screenshot with 3D in it.
- **Global blend:** connect it to a source. The 3D parts come back as live 3D scenes inside the
  UI, listed under **3D** in Applied Changes. A reference without 3D gets no 3D.
- **Localized blend:** select a 3D part of the example, drop it on the source, and pick **3D**
  (alone or with Layout, Color or Content).
- Drag inside a 3D scene to rotate it. Switch the **3D** change off to get the flat version
  back. Open its class changes to retype a material color, such as `color="#7c3aed"`.

A 3D blend takes a little longer, and a UI with 3D shows "Loading 3D…" for a moment the first
time.

## What differs from the paper

- Haiku through the bridge answers instead of GPT-4o, which may change blend quality.
- `/stock/` holds generated landscape placeholders instead of real stock photos.
- The sample examples are drawn for this rebuild, not the study's materials.
- The paper does not publish its toggle prompt, and does not describe Fix Render. Both are our own.
