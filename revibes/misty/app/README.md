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

## What differs from the paper

- Haiku through the bridge answers instead of GPT-4o, which may change blend quality.
- `/stock/` holds generated landscape placeholders instead of real stock photos.
- The sample examples are drawn for this rebuild, not the study's materials.
- The paper does not publish its toggle prompt, and does not describe Fix Render. Both are our own.

## Table 7: blending experience remix

Choose the purple **All features** button to enable the complete remix and open a combined preview.
It keeps fog and 3D builders visible until you click **Reveal sample result**. Notes, sketch and
voice controls are open beside it; **Enable duck sounds** adds the audio. This preview uses a
bundled sample, makes no model calls, and preserves your canvas. Open it directly with
`?remix=all&preview=all`. **Use on canvas** returns with all feature switches enabled.

**All features**, **Remix lab** and **Tutorial** are at the top right on wide screens and near
the bottom right on smaller screens. All feature switches start on for new sessions; existing
saved preferences are respected. Sound starts off and recording requires a hold. No API key is
needed. The bridge can use the signed-in Claude or Codex
CLI; if Claude reports `Not logged in`, sign in to Claude Code or start
`python3 llm-bridge/bridge.py codex` instead. Do not run both on the same port.

The remix adds independent experiences on top of the shared Misty base:

- **Fog:** a soft animated mist covers a blending preview. The current bridge returns a complete
  response, so waiting animation is labeled illustrative. Once the returned code renders, the
  available regions are revealed in sequence. The app never claims that an unfinished response is done.
- **Builders:** original geometric figures carry labeled A/B buttons, cards, navigation and image
  blocks from opposite trays into a miniature layout. **A** means the source UI's content;
  **B** means visual inspiration from the reference. This communicates requested roles rather than
  verified attribution of generated pixels. Three.js loads on demand, with a flat fallback.
- **Notes + sketch:** open **Add input for the next iteration** beneath
  a result. Type a note or choose **Draw on preview**. Finish the sketch and choose **Remix with
  saved input** after the running blend ends. With input enabled, Regenerate includes saved text and a sketch overlay
  image in the next model request. Input is attached to that node and saved with the canvas.
- **Push-to-talk:** hold **Hold to speak**, or hold Space/Enter on
  the focused button. Release to stop. Final transcription is appended to the note. This needs a
  supported browser and microphone permission; the browser may use its own speech service. Type
  a note if recognition is unsupported or permission is denied. Recording stops after 45 seconds.
- **Duck sounds:** explicitly choose **Enable duck sounds**. Quiet ambience accompanies blending;
  synthesized placement quacks and a completion call accompany the reveal. Mute is immediate,
  and sound starts off again after reload. Reduced motion and background tabs suppress sound.

Choose **Hide effects** during a request to inspect the preview without cancelling the blend.
If it fails, the builders stop, the mist settles and the error explains recovery. Original inputs
and saved notes remain available. System `prefers-reduced-motion` replaces the moving builders
with static progress carrying the same A/B and stage information. Remix lab also provides a
**Reduce motion for this demo** switch, which cannot override a system request to reduce motion.

### Try each experience independently

Remix lab's presets have **Open solo** links. These URLs open the same canvas with independent
feature settings: `?remix=base`, `?remix=fog`, `?remix=builders`, `?remix=input`, `?remix=sound`,
and `?remix=all`. The sound preset still requires an explicit sound opt-in. Individual switches
also let you combine features without duplicating the app.

### First-time walkthrough

Choose **Tutorial**, then **Next** through seven steps: base/remix credits, A/B roles, fog,
builders, next-iteration input, optional sound, and result/error recovery. The visual rehearsal
uses an explicitly labeled bundled sample and makes no model calls. **Replay**, **Simulate failure**
and **Try render failure** demonstrate progress and recovery. Tutorial notes stay in the tutorial;
they do not alter your real canvas. Back, step selection and Escape are supported, and finishing
returns you to your existing workspace. The original **Guided Demo** remains available for
hands-on practice with base Misty; that older demo resets the canvas, as its picker explains.

Run `npm test` for progress, retry/error, steering payload, voice and sound lifecycle tests;
run `npm run build` to create the production app.
