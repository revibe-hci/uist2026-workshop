# FigJam notes · Table 1 · Group 2 · TaleBrush

One bullet = one sticky. Updated as we go; newest at the bottom of each section.

**Paper:** TaleBrush (Chung et al., CHI 2022)
**Agent and model:** Claude Code, Claude Opus 5.5 (the app's own model calls: Claude Haiku via the LLM bridge)
**Revibe link:** branch `revibe/talebrush-table1-group2` (not pushed yet)

## Questions we had (yellow)

- Is it OK for the agent to also run the "YOU" steps (grading)? AGENTS.md says grading is the group's job and the agent must never see the rubric.
- The URL said `paper=talebrush`, but the page's first visible card was Misty. Which paper is ours? (The query string picks the paper; the page lists all four.)
- How many sentence slots should the canvas have before anything is written? The paper doesn't say. Figure 1 A2 shows 2 sentences + 6 blank bullets.
- Does "Generate Again" regenerate sentences the writer has edited? The paper doesn't say. Editing implies ownership.
- Does erasing trigger generation, or only the next Generate? Section 4.2.2 is ambiguous.
- Slow = thin or slow = wide? Section 3 argues both ways; Section 4.2.2 settles on slow → thin/accurate.
- How does the band width map to the paper's fixed 0.2 regeneration threshold and its "1-2 retries"?
- The paper's study had no axis labels (Section 7.2). Should we add "better/worse" labels?
- Nothing was graded partial/failure. Should v2 still change things? We decided yes: fix the caveats written in "What we saw".
- Is our 1.00 comparable to Group 1's 0.20 → 0.40? Our agent saw the rubric before building AND graded its own work, theirs didn't.
- Does a scripted, perfectly regular stroke test speed→width fairly compared to a real hand?
- Remix: Luminate dropped numeric dimensions as not useful; TaleBrush is built on one (fortune as a curve). Are numeric dimensions useful once they're curves over story time?
- Remix: is there a faster model than Haiku? No — the bridge already uses Haiku; most latency is ~4 s of CLI startup per call plus chained calls.
- Remix: the setting chips "didn't work": they pinned, but only the next generation used them. Should a pick rewrite right away? (Decided yes.)

## Challenges we faced (red)

- The agent read the rubric before building (it was on the page we pointed it to), so v1 is not a clean "paper alone" measurement.
- The LLM bridge needs the `claude` CLI signed in. It wasn't on PATH and wasn't logged in; the desktop app's auth doesn't reach child processes.
- So generation could only be tested with a stub (canned sentences, keyword fortune scores) at first.
- The paper's models can't be rebuilt: GPT-Neo soft prompts, GeDi on GPT2-medium, and the crowdsourced fortune dataset aren't available.
- The bridge ignores temperature, but the paper's surprise control IS temperature. Surprise had to become a prompt instruction.
- Bug: the "Generating…" overlay showed at startup (CSS `display:flex` overrode the `hidden` attribute). Fixed.
- Bug: the eraser's dashed cursor stayed on the canvas after switching back to the pen. Fixed.
- Testing a sketch needs real pointer timing (speed → width), so we drove it with scripted pointer events at controlled speeds.
- Fixed by the user's sign-in to the bundled `claude` CLI; the bridge then ran claude/haiku and recognition took ~6 s per call.
- Generation is slow: 23–33 s for 6 sentences, >45 s with retries + surprise (generate + recognize + up to 2 retry rounds, each a bridge call).
- A stray click on the canvas (from a teammate) counted as a tiny stroke over a slot centre and regenerated a sentence.
- Grading by hand at a precise drawing speed is hard; we scripted pointer events to get repeatable slow / fast / mixed strokes.
- On the hackathon page, cmd+A in a notes field didn't select its text, so our v2 notes were appended to the v1 notes; we rewrote them as "v1: … | v2: …".
- Self-grading bias: every test came out Full. Humans grading might be stricter (e.g., on T-13's surprise or T-07's coherence).
- Remix: 12 simultaneous connections to the bridge were refused/reset — its HTTP server queues only 5 pending connections. Spacing connections 30 ms apart fixed it (bridge left unchanged).
- Remix: browsers allow ~6 connections per host, so the fan-out had to move to the server and stream results back over one connection.
- Remix: our first requirement sampling moved all dimensions in lockstep — 12 versions held only 5 shape combinations. Fixed with balanced, independently shuffled picks (12/12 distinct).
- Remix: self-rated values are inflated — a version rated its fortune 0.83 → 0.11, the independent recognizer read it as nearly flat (0.62 … 0.40).
- Remix: a missing rating defaulted to 0.5, which would have read as "the protagonists interact"; rating-only flags now default to 0.
- Remix: the first genre rewrite dropped an existing interaction between Mike and Ana; interactions now carry over as targets.

## Ideas we came up with (green)

- Write all sketched slots in ONE model call from a numbered outline. Continuation and infilling come for free because the model sees text before and after each slot.
- Show each written sentence's recognized fortune in the outline so the model sees the trajectory (going down vs. up).
- For Generate Again, send earlier versions of each slot as "avoid" so the new story actually differs.
- Retry loop: ask for 2 alternatives per missed slot in one call, score them all, and keep the closest. Fewer calls than one-at-a-time.
- Number the slots under the canvas, and highlight the slot of the bullet being edited, to make the text ↔ x-position link visible.
- A `--stub` mode with a loud banner, so the interface can be tried without a model.
- Treat the "What we saw" caveats on Full grades as the v2 to-do list, not only partial/failure grades.
- Ignore strokes shorter than ~12 columns and require 40% slot coverage, so accidental clicks never regenerate text.
- Make surprise an explicit contrast in the prompt (LOW = no twists, VERY HIGH = near-absurd), since the bridge ignores temperature.
- Show which retry round generation is in, so a 45 s wait feels less broken.
- Remix: sketch some dimensions, explore the rest — sketched lanes constrain every version, blank lanes and unpinned settings vary across versions.
- Remix: generate premise-specific arc dimensions (e.g. "Mike's belief in the fusion idea") and show them as lanes aligned under the fortune canvas.
- Remix: an "arcs" semantic-zoom level — a sparkline per dimension is the summary of a story version.
- Remix: "Pin its curve" — adopt a curve found in the design space as your sketch, so exploring turns into sketching.
- Remix: one bridge call per version (sentences + self-ratings), independent recognition only for the version you adopt.
- Remix: a second protagonist as their own fortune panel (TaleBrush Fig. 3a), with ⇄ highlights where the two interact.
- Remix: setting chips that rewrite the story while keeping its arcs, "same story, new genre".
- Remix idea: make the interaction itself sketchable; single stories kept Mike and Ana apart (1 of 6 sentences).

## Iterations and decision points (blue)

- Decision: Python standard-library server + vanilla JS/SVG instead of Flask + React. Nothing to install at the workshop.
- Decision: store the sketch as 300 columns of {fortune, half-width}. A new stroke overwrites only its columns, which gives partial redraw.
- Decision: slot count = max(#bullets, 8).
- Decision: a slot counts as sketched at ≥1/3 coverage; a stroke regenerates a slot at ≥40% coverage or when it covers the centre.
- Decision: band half-width 0.05 (slow) to 0.25 (fast) = tolerance; thin band → 2 retries, wide → 1.
- Decision: Generate Again keeps sentences the writer wrote OR edited; redraw over a slot still regenerates it.
- Decision: erased slots inside the sketched range get sentences with no fortune target (as the paper says).
- Decision: History stores an "Initial" entry before the first generation, plus rename/delete (as in Figure 5 A).
- Iteration v1 (step 3): feature check against Sections 4 and 7 found no missing interface features; added the eraser-cursor fix.
- Blocked after v1: grading needs real generation, so we waited for the CLI sign-in.
- Step 4, v1 grades: 15/15 Full, score 1.00 (graded by the agent in the browser, with notes for each test).
- Step 5, v2: no failed tests, so it fixed 3 caveats: stray-click regeneration (T-11), widest band reachable with a normal swipe (T-05, fast 70 → ~100 units), stronger surprise prompt (T-13).
- Step 6, v2 re-test: stray click → no generation; T-07 still Full in 23 s; T-11 only slots 7–8 changed; T-13 final sentence now clearly surprising (raccoons in the guitar case). All 15 stay Full (1.00).
- Table scores at the end: Group 1 0.20 → 0.40, Group 2 1.00 → 1.00.
- Remix decision: combine generated dimensions (as lanes) with a Luminate design space; stay on the LLM bridge but run aggressively parallel and progressive.
- Remix measurement: 12 trivial bridge calls took 16.8 s with 4 slots vs 7.1 s with 12; 12 realistic versions arrived 9.5–18.3 s in the benchmark, 14–36 s in the app (more dimensions to rate).
- Remix decision: BRIDGE_PARALLEL=12, at most 10 slots for exploring so 2 stay free for recognition while editing.
- Remix decision: the interaction is a rating-only dimension (never a target), read by recognition and by each version's self-ratings.
- Remix test: Mike down-then-up, Ana up-then-down; the story followed both, Ana's dots tracked her sketch; the genre-chip rewrite took ~42 s with both arcs held.

## Remix ideas (green, bottom strip)

- Two characters' fortunes on one canvas (Section 3, Figure 3a), and see whether the arcs interact.
- Sketch other attributes per sentence: tension, pace, or tone, instead of fortune.
- Use pen pressure instead of speed for tightness, and compare which writers find more intuitive.
- Edit-level regeneration: rewrite part of a sentence instead of replacing it (the user study's complaint in Section 7.3.1).
- Show the model's fortune rating next to each bullet so writers can disagree with it, and use their correction as feedback.
- Meta-remix for the workshop: does seeing the rubric before building inflate revibe scores? Compare our build to Group 1's on the same tests.
- Built on remix/talebrush-luminate: generated arc lanes + setting chips + streamed design space with axes, 5-level semantic zoom, linked hover, adopt, pin curve, more like this.

