# TaleBrush Studio (remix)

Our TaleBrush revibe (`../app/`, Chung et al., CHI 2022) remixed with four more systems:

| System | What it adds here |
|---|---|
| **TaleBrush** (Chung et al., CHI 2022) | the base: sketch the protagonist's fortune, and sentences are generated to follow it |
| **Misty** (Lu et al., CHI 2025) | blend example stories into yours; a semantic diff of each generation |
| **Luminate** (Suh et al., CHI 2024) | a design space of many story variants, organized by AI-generated dimensions |
| **VideoDiff** (CHI 2025) | compare variants aligned sentence by sentence; edit, recombine, pin, archive |
| **Selenite** (Liu et al., CHI 2024) | a Story Guide: criteria readers look for, in-situ annotations, what's missing |

`../remix-misty/` (TaleBrush + Misty only) is unchanged.

## Launch

Python 3 and a signed-in `claude` command are all you need. Run both from the repository root:

    python3 llm-bridge/bridge.py claude              # 1. the LLM bridge (port 8787)
    python3 revibes/talebrush/remix-studio/server.py  # 2. TaleBrush Studio (port 5059)

Open **http://localhost:5059** and press **? Tutorial** (top of the editor). The
tutorial walks through every part of the interface and badges each one with the
system it comes from. It runs next to the revibe (5057) and the Misty remix (5058).

> **Language model:** every model call goes to Claude Haiku through the workshop LLM
> bridge, in place of each paper's own model. The footer lists the substitutions.

### Your own API key, and the online copy

**🔑 API key** (top of the editor) lets anyone use their own Anthropic API key
instead of the bridge, and pick Claude Haiku 5.5 (default), Sonnet 5.5 or Opus 5.5.
The key stays in the browser (for the session, or on the device if *Remember* is
ticked). The browser sends it with each AI request, and the server passes it to
Anthropic for that request only, without storing or logging it. Using a key locally
needs `pip install anthropic`. Without a key, the bridge is used as before.

The online copy runs on Vercel (`vercel.json`, `api/index.py`, `requirements.txt`).
There is no bridge there, so it asks every visitor for their own key. To deploy
your own copy, run this from this folder:

    vercel deploy --prod

## Use

**TaleBrush (the "Fortune arc" tab).** Name the protagonist, write a beginning, and
sketch the fortune arc. Higher means better fortune, and drawing slowly makes a
stricter envelope. Sentences are generated to follow the arc, and the blue line shows
their recognized fortune. The tab also has the eraser, Generate Again, Surprise, and
History. Gray lines are yours, blue are generated, and yellow come from a Luminate
variant.

**Misty (Examples under the editor; Changes under the canvas).**
- Add an example story, then drag it onto the canvas to blend all of it. Or brush part
  of its arc and drag just that part.
- When you drop it, pick what to blend: Arc, Events, Tone & style, or Customize.
- After each generation, **Changes** lists what changed by meaning. Switch a change
  off to undo it, or click its label to describe a different change.

**Selenite (Story Guide, under the editor).**
- **Build story overview** (2 model calls) lists the criteria readers usually look for
  in this kind of story. Each one is bright if your story addresses it, faded if not.
- **‹ ›** jumps between the sentences about a criterion.
- Each sentence is tagged with its criteria. **Analyze** (on hover) boxes its phrases
  green or red by whether they are good or bad for the protagonist.
- The guide also lists the characters, places and objects encountered so far, plus a
  summary with two criteria to **consider next**. Their **Explore in Design space →**
  button starts a Luminate exploration aimed at that criterion.

**Luminate (the "Design space" tab).**
- **Generate design space** (≈ 1 + 2 × N model calls): the AI proposes dimensions
  (e.g., *Stranger's motive*, *Ending tone*) and writes N variants of the open
  sentences, each with a different mix of values and each following your sketch.
- **Arrange** them by one or two dimensions, or by **Fit to your arc** or **Ending
  fortune** (both from TaleBrush).
- **Semantic zoom** (● T K S F): dots, titles, keywords, summaries, or full text.
- Search, filter by clicking a value, ☆ bookmarks, ＋ more like this, *+ 3 more in
  this subspace*, add your own dimension, and switch between spaces.
- Click a variant to put it in the editor (yellow).

**VideoDiff (the "Compare" tab).**
- All variants are aligned to the same sentence slots, under **Your story**.
  Differences are highlighted, each row shows its fortune arc over your sketch, and
  the variant's keywords are bold.
- **Sort** by fit, length, how much changed, or newest. Switch between *Changed
  sentences* and *Whole story*.
- 📌 pin, 🗄 archive, ✎ **Edit** by prompt (the result appears under the original, with
  a summary of the change), and **Use**. Hover one sentence and press *use* to take just
  that one.
- The prompt bar makes a new variant. Mention variants by number to **recombine**
  them ("the stranger from #1 with the ending of #4"), or press **Surprise me**.

Your work is kept in the browser (localStorage key `talebrush-studio-state-v1`).
