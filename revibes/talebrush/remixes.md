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
- **Tutorial**: a "? Tutorial" button opens a 15-step walkthrough for first-time
  viewers. It spotlights each part and labels it *From TaleBrush*, *From Misty*, or
  *Remix*.

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

## TaleBrush Studio: Misty + Luminate + VideoDiff + Selenite (table 1, group 1)

Code: `remix-studio/`, run on port 5059. It builds on the Misty remix, which stays in
`remix-misty/`.

**What changed**
- **Luminate: design space.** A "Design space" tab where the AI proposes dimensions
  and writes several variants of the open sentences, each with a different mix of
  values and each following the fortune sketch.
  - Arrange by one or two dimensions, or by TaleBrush's *Fit to your arc* and
    *Ending fortune*.
  - Semantic zoom (dot, title, keywords, summary, full), search, filter, bookmarks,
    more like this, more in a subspace, user-added dimensions, and switching between
    spaces.
  - Clicking a variant puts it in the editor (yellow).
- **VideoDiff: compare.** A "Compare" tab with the variants aligned by sentence slot
  under the current story. Differences are highlighted, and each row has its fortune
  arc over the sketch.
  - Sort, pin and archive.
  - Edit by prompt (the result sits under the original, with a change summary),
    recombine by #id, and Surprise me.
  - Use a whole variant, or a single sentence.
- **Selenite: Story Guide.** Criteria commonly considered for this kind of story,
  bright or faded by coverage.
  - In-situ criterion chips per sentence, with ‹ › navigation.
  - *Analyze* colours phrases by their effect on the protagonist's fortune.
  - Elements encountered (characters, places, objects).
  - A summary with two suggested criteria, which can launch a Luminate exploration.
- **Tutorial**: 24 steps that switch tabs as needed. Each step is badged with the
  system(s) it comes from, and several badges mark where systems were combined.

**What it explores**
- **Exploring many versions at once.** Does exploring a design space of whole-story
  variants (Luminate) change how writers use TaleBrush's sketch, from steering one
  generation to choosing among many that share an arc?
- **Fortune as a comparison axis.** Is the fortune arc a useful axis for comparing
  alternatives (VideoDiff's aligned timelines, Luminate's fit axis), compared with
  reading every variant?
- **Criteria for stories.** Do criteria borrowed from sensemaking (Selenite) help
  writers judge a story, and does "consider next" make good prompts for exploration?

**First observations** (one session, Claude Haiku through the bridge)
- The guide found 12 criteria for "underdog jazz musician redemption story". It marked
  *Pacing*, *Dialogue quality* and *Thematic coherence* as missing, and suggested
  thematic coherence and dialogue as next steps.
- A 4-variant design space for "different endings" produced dimensions such as
  *Stranger's motive* and *Ending tone*. All variants fit the sketch well (fit
  0.84–0.95).
- Recombining "the stranger from #1 with the ending of #4" gave a coherent merge, with
  a summary of which parts came from where. Editing #2 to be "bittersweet" rewrote only
  the ending.

**Assumptions**
- Variants rewrite the same slots TaleBrush would generate, and the writer's own
  sentences are kept.
- A design space defaults to 6 variants (≈13 calls); 4 and 8 are offered.

**Online copy with visitors' API keys** (added after the session)
- A 🔑 API key button lets anyone use their own Anthropic key and choose Haiku,
  Sonnet or Opus 5.5. It is deployed to Vercel, where there is no workshop bridge.
- Question: which model do writers pick when they pay per call, and does a stronger
  model change how well the generated sentences follow the sketched arc (the fit
  values above were with Haiku)?
