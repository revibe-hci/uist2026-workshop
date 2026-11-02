# TaleBrush remixes

## TaleBrush × Luminate: sketch some dimensions, explore the rest

Branch `remix/talebrush-luminate`, built by Claude Code (Claude Opus 5.5) on
top of the group 2 revibe (v2).

**Question it explores.** Luminate (Suh et al., CHI 2024) dropped numeric
dimensions because they "do not deliver meaningful interactions". TaleBrush is
built on one: fortune, as a curve over story time. Can writers *sketch* the
dimensions they have intentions about and *browse* a space of versions along
the ones they don't? Does exploring first change what the sketch is for: a
generator, a filter, or a way to adopt a curve they found?

**What changed**
- **Generated dimensions** (Luminate §4.1.1). The protagonist, title and
  opening sentences produce 3 *arc* dimensions specific to the premise (e.g.
  "Mike's belief in the fusion idea") and 3–4 *setting* dimensions (genre,
  point of view, era, tone). Writers can add their own arc dimension.
- **Arc dimensions are lanes.** Each is a thin sketch lane aligned under the
  fortune canvas, like TaleBrush's surprise panel. A sketched lane is a
  constraint, a blank lane is explored. Each lane also shows where the current
  story is, from the recognition module scoring every dimension in one call.
- **Setting chips.** Each value can be pinned, or left on "explore".
- **Design space** (Luminate §4.1.2–4.1.5). "Explore versions" writes 6/12/18
  versions in parallel.
  - Every open lane gets a story shape (rising, falling, dip, peak, steady) and
    every unpinned setting a value. Picks are balanced and shuffled
    independently per dimension.
  - Versions stream in as they finish, can be arranged on two axes (a lane's
    shape, or a setting), and use 5 semantic zoom levels: dot, arcs (one
    sparkline per dimension), title, logline, outline.
- **Linking.** Hovering a version previews its text in the editor and draws
  its arcs on the fortune canvas and every lane. The other versions stay faint
  there, like TaleBrush's History overlay.
- **Converge.** Clicking a version adopts it: it goes into the editor and
  History, and the recognition module re-reads its sentences to correct its
  self-rated dots. "Pin its curve" copies the version's curve on any dimension
  into the sketch, so exploring turns into sketching. Also "Pin its settings"
  and "4 more like this" (Luminate §4.1.4).
- **Normal TaleBrush generation** (pen stroke, Generate Again) now also follows
  sketched lanes and pinned settings.

**Latency decisions** (staying on the LLM bridge)
- One bridge call per version returns its sentences *and* its self-rated
  values on every dimension. There's no recognize-and-retry loop while
  exploring; only the adopted version is re-read.
- Start the bridge with `BRIDGE_PARALLEL=12`. The app uses at most 10 slots for
  exploring (`TALEBRUSH_EXPLORE_SLOTS`), leaving 2 for recognition while you
  edit.
- Results stream to the browser as NDJSON over one connection, because the
  browser allows only about 6 connections per host. Bridge connections are
  spaced 30 ms apart, because the bridge queues at most 5 pending connections
  and a burst of 12 was reset.
- Measured: 12 realistic versions with 3 lanes and 4 settings arrived between
  14 and 36 s (most by 23 s); "4 more like this" took 8–32 s. One plain
  TaleBrush generation took 23–33 s.

**What we noticed**
- **Self-ratings are inflated.** An adopted version rated its own fortune as
  0.83 → 0.11 (a clean fall); the independent recognizer read the same
  sentences as 0.62, 0.42, 0.40, 0.38, 0.45, 0.40 (nearly flat). Converging
  with independent recognition matters.
- **Shapes moved in lockstep at first.** The first sampling cycled every
  dimension with fixed offsets, so 12 versions held only 5 shape
  combinations. Now picks are balanced and shuffled independently per
  dimension: 12 distinct combinations.
- **The generated dimensions were premise-specific,** not generic (none of
  Luminate's "creativity: least…most" problem in this run).

### Update: a second protagonist, and setting chips that rewrite

**What changed**
- **Second protagonist** (TaleBrush §3, Fig. 3a: "multiple control panels").
  "＋ Add protagonist" opens a panel under the fortune canvas, e.g. "Ana's
  fortune". It works like the other lanes: sketch it or leave it blank to
  explore. It's recognized per sentence, and it's an axis and a sparkline in
  the design space. All prompts name both protagonists. Suggested dimensions
  now include both (e.g. "Mike and Ana's bond").
- **Where they interact.** A rating-only dimension asks, for each sentence,
  whether the two protagonists directly interact. Those sentences are
  highlighted (⇄ with a pink column) in both fortune panels and the editor.
  Versions in the design space show pink ticks. It's never a target, and a
  missing rating counts as "no".
- **Setting chips rewrite the story.** Pinning a value only affected the
  *next* generation, so chips looked broken. Picking one now regenerates the
  story's generated, unedited sentences in the new setting. Each sentence keeps
  its current fortune, lane levels and interactions as targets, so only the
  setting changes. If there is no generated text yet, the sketched slots are
  written instead.

**What we noticed**
- With Mike sketched down-then-up and Ana up-then-down, the story followed
  both. Ana's recognized dots tracked her sketch closely.
- **Interaction rating is discriminating.** "Ana quietly offered him her spare
  cable" counted as an interaction. "Mike sold his guitar *while* Ana toured
  Europe" (parallel lives in one sentence) did not.
- Single-story generation tends to keep the two protagonists apart (1
  interaction in 6 sentences). Exploring gave 2–4 interactions per version.
  A sketchable interaction lane could steer that.
- A genre change ("Magical realism with a supernatural guitar") rewrote the
  story in about 42 s, and both arcs mostly held. The first version dropped the
  existing interaction; it now carries interactions over as targets too. That
  fix wasn't re-run live.

### Update: every story gets a graph on every dimension

**Problem.** Stories were rated only on the dimensions that existed when they
were made. History entries were also stored before their lane ratings
arrived. So History stories and design-space versions had no graphs for
dimensions added later (or for a second protagonist named later), and the
lanes didn't draw History arcs at all.

**What changed.** As in Luminate, where adding a dimension re-evaluates the
existing responses (Fig. 7), every story is rated on every current dimension:
the current story, each History entry, and each design-space version along
with the writer's lines it was built on. Only the missing (sentence, dimension)
pairs are requested: one recognition call per story, at most 3 at a time. The
current story's fresh ratings are copied into its stored History entry. The
lanes now draw History arcs faintly, and the hovered entry strongly, as the
fortune canvas does.

**Measured.** 2 History stories and 6 versions were made before any extra
dimension existed. Right after "Suggest dimensions", all of them had 0/8
sentences rated on the 3 new dimensions; about 21 s later all had 8/8.

### Update: more diverse versions, and more of them

**Measured first** (`experiments/diversity/`, 12 versions, fortune and 3 lanes
open). We compared each version's *requested* curve, its *self-rated* values
and an *independent* re-rating.
- **The plan was the bottleneck, not the writing.** Five fixed template shapes
  put 44–50% of requested values in the middle band, and every "dip" was
  identical. The written stories actually swung *more* than requested (swing
  0.55–0.67 vs 0.49–0.55).
- **Self-ratings were useless.** They differed from the targets by only
  0.02–0.03: the model echoed its plan. So the sparklines showed template
  copies, not what was written.
- **"Steady" was wasted.** None of 12 stayed flat once read independently.
- **Combinations repeated.** 9 distinct realised shape combinations in 12
  versions.

**What changed**
- **Random curves, coverage-seeking.** Each open dimension gets a random smooth
  curve (2–4 knots, levels biased toward the extremes). Versions are chosen by
  farthest-point sampling against every version already in the space.
- **"＋ Explore more"** adds versions planned against the rated values of
  those already shown, so new batches go where the space is empty. Up to 36
  versions per click.
- **No self-ratings.** The generation call writes sentences only. The plan is
  shown as *dashed* sparklines until an independent rating, 3 versions per
  call, streams in and turns them solid. An adopted version needs no second
  reading.
- **Retries on invalid JSON.** A reply that isn't valid JSON is retried once
  (1 of 12 versions failed this way).

**Measured after** (independent ratings):

| | before | after |
|---|---|---|
| Distinct shape combinations | 9 of 12 | 11 of 11 |
| Distance to nearest other version (mean / min) | 0.22 / 0.16 | 0.29 / 0.22 |
| Values in the middle band, per dimension | 31–46% | 27–39% |
| "Explore more" batch: distance to the first batch | — | 0.30 (≥ 0.29 within a batch), 11 of 11 combinations new |
| Union of both batches | — | 22 distinct combinations in 23 versions |

Batch rating (3 stories per call) agreed with rating each story alone to
within 0.07 on average. 12 versions are written and rated in 41–55 s; the first
version appears after 7–14 s.

**Still open**
- **Plans are more extreme than the writing.** The plans spread 0.30 across
  versions, but the written stories only spread 0.24, and the error against
  the plan rose to 0.16–0.19.
- **Fortune pulls toward "dip".** 6 of 11 versions came out fall-then-recover
  whatever was asked, a narrative default.
- Retrying versions that miss their plan, as the paper's loop does, would cost
  extra calls.
