# TaleBrush remixes

## TaleBrush × Misty: conceptual blending and semantic diff (table 1, group 1)

Code: `remix-misty/`, run on port 5058. The revibe in `app/` is unchanged.

**What changed**
- **Example stories** (from Misty's example nodes): paste a story, or use Cinderella,
  Icarus, or The Tortoise and the Hare. TaleBrush's recognizer extracts its
  protagonist and fortune arc, which is shown on a card.
- **Global blending** (from Misty's node connection): drag a whole example onto the
  fortune canvas.
- **Localized blending** (from Misty's drag-and-drop): brush-select part of an
  example's arc and drag it onto a span of the story. The span is highlighted and the
  example's arc is previewed while hovering.
- **Pick Blending Option** (from Misty's Color / Layout / Content / Customize), with
  four story aspects:
  - *Arc*: becomes a sketch, so TaleBrush's fortune control realizes it.
  - *Events*
  - *Tone & style*
  - *Customize*
- **Semantic diff** (from Misty's semantic diffs): each generation or blend is
  summarized as changes by meaning. Each change can be toggled off (only its
  sentences are rewritten, and their fortune is re-recognized) or reworded.

**What it explores**
- Does an *example* help writers say what they want better than sketching from
  scratch? Cinderella's arc is Vonnegut's own example (TaleBrush, Figure 2). Here the
  writer can blend its shape, its events, or both, into their story.
- Do Misty's *aspects* separate cleanly for stories? Can a writer take an arc without
  its events, or events without its tone?
- Does a *semantic diff* give writers a level of control between TaleBrush's two
  options, regenerating whole sentences or editing the text by hand? The paper's
  participants said small sketch changes produced unexpectedly large text changes
  (Section 7.3.1).

**First observations** (one run, Claude Haiku through the bridge)
- Blending Cinderella's whole arc and events into "Mike, a jazz guitarist" produced a
  real conceptual blend: the fairy godmother became a bluesman with shimmering
  strings, and the glass slipper became a lost capo that "fits his guitar perfectly."
- Switching off the "magical strings" change rewrote just those two sentences. A
  later sentence still mentioned the strings' glow, because a change only rewrites its
  own sentences. Keeping the rest of the story consistent is an open question, as it
  is in Misty.

**Assumptions**
- The writer's own sentences inside a blended span are kept, as in TaleBrush, rather
  than rewritten (Misty does rewrite the source UI).
- The semantic diff describes the last generation only. Typing in the editor clears it.
- The node-based infinite canvas from Misty was not brought over. TaleBrush's
  History dropdown stays, and each diff revision is stored there.
