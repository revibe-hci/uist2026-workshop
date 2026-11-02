# TaleBrush × Misty (remix)

A remix of our TaleBrush revibe (`../app/`, Chung et al., CHI 2022) with ideas from
**Misty** (Lu et al., CHI 2025): *conceptual blending* of examples into work in
progress, and a *semantic diff* of what each generation changed. Everything in the
TaleBrush revibe still works the same way. The new parts are under
[Misty remix](#misty-remix) below.

## Launch

You need Python 3 and a signed-in `claude` command (Claude Code). No API key and no
`pip install` are needed.

From the repository root, in two terminals:

    python3 llm-bridge/bridge.py claude          # 1. the LLM bridge (port 8787)
    python3 revibes/talebrush/remix-misty/server.py   # 2. the remix (port 5058)

Open **http://localhost:5058**. It can run next to the revibe on 5057.

The footer reports which model answers. If it says the bridge is not reachable, start
step 1. Port settings: `TALEBRUSH_PORT=5060` changes TaleBrush's port, and
`BRIDGE_URL=http://localhost:8788` points it at a bridge on another port.

> **Language model:** this rebuild does not run the paper's models (GPT-Neo 2.7B with
> trained soft prompts plus a fine-tuned GeDi GPT2-medium). Sentence generation and
> fortune recognition go through the workshop **LLM bridge**, which answers with
> Claude Haiku via Claude Code. The interface labels this in its footer.

## Use

1. **Name the protagonist** in the box at the top right ("___'s fortune").
2. **Write a beginning** (optional) in the editor on the left, one sentence per bullet.
   The canvas shows each sentence as a gray dot at its recognized fortune: higher is
   better fortune, and the x position is the sentence's place in the story. Blank
   bullets show as gaps.
3. **Sketch the fortune arc** on the canvas with the brush. When you release the
   stroke, TaleBrush writes a sentence for every sketched slot, one at a time.
   Generated sentences are marked blue in the editor and drawn as a blue line on the
   canvas, so you can compare them with your sketch.
   - **Drawing speed sets the envelope:** drawing slowly makes a thin envelope, so
     TaleBrush tries harder (up to two regenerations) to match it. Drawing fast makes a
     wide, loose envelope (one regeneration). The faint vertical lines mark where each
     sentence's value is read.
   - **Infilling:** sketch a gap between sentences you wrote (for example a first and a
     last sentence), and TaleBrush fills it to connect them.
   - **Redraw part of the arc** to regenerate only those sentences.
4. **Eraser** (the right button below the canvas): erase part of the sketch. Erased
   slots inside the sketch get sentences with no fortune target.
5. **Generate Again** writes new sentences for the same sketch. While TaleBrush is
   generating, the same button reads **Stop**.
6. **Edit any sentence** directly. Edited or typed sentences become yours: they turn
   gray, are re-recognized, and are kept as context when you regenerate. Press
   Enter to add a bullet, and Backspace at the start of a bullet to merge or remove it.
7. **Surprise in a separate panel** (checkbox): opens a second canvas. Sketch a
   thin line for how surprising each sentence should be (higher means more surprising).
   It takes effect on the next generation.
8. **History** (top of the editor): every generation is stored. Open it to see all
   stored arcs at low opacity on the canvas. Hover a story to preview its text and
   highlight its arc, and click it to roll back. ✎ renames a story and × deletes it.

Your work is kept in the browser (localStorage) across reloads. To start over, clear
the text and history, or run `localStorage.clear()` in the browser console.

Each sentence takes 2 or more model calls (generate, then recognize), each a few
seconds, so a sketch over 6 sentences takes about half a minute. Sentences appear as
they are written.

## Misty remix

**Examples** (below the editor) play the role of Misty's example screenshots. Add a
story under *+ Add an example story*: paste text, or try Cinderella, Icarus, or The
Tortoise and the Hare. TaleBrush's fortune recognizer finds its protagonist and
draws its fortune arc on the card.

- **Global blending** (Misty's node connection): drag the card by **⠿** onto the
  fortune canvas, or press *Blend whole story…*. The whole example maps onto all your
  sentences.
- **Localized blending** (Misty's drag-and-drop): brush across part of the card's
  arc to select sentences, then drag the selection onto the canvas. The sentences it
  will land on are outlined, and the example's arc is previewed in dashes there.
- **Pick Blending Option**: on drop, choose what to blend:
  - **Arc**: draws the example's fortune shape as your sketch, so TaleBrush's
    fortune control does the rest.
  - **Events**: borrows each example sentence's event, adapted to your protagonist.
  - **Tone & style**: writes in the example's voice.
  - **Customize**: anything else, in your own words.

  Your own sentences in the span are kept. *Generate Again* keeps the blend.
- **Changes** (below the canvas) is Misty's semantic diff. After every generation or
  blend, the changes are listed by meaning, with the sentences each one touched.
  Hovering a change highlights those sentences.
  - **Switch a change off** to undo it: only its sentences are rewritten, and their
    fortune is recognized again, so you can see the arc react. Switch it back on to
    restore them.
  - **Click a change's label** to describe a different change in its place.

  Each revision is stored in History as "· revised".

Typing in the editor clears the Changes list, because it describes the generated
version.
