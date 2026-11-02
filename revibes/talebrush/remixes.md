# TaleBrush remixes

## Several characters' fortunes

Built by Claude Code (Claude Opus 5.5) on 2 November 2026.

### What changed

The paper sketches one line: the protagonist's fortune. This remix lets the
writer add up to three more characters. Each character gets its own fortune
line on the same canvas, in its own colour. Each sentence gets one recognized
fortune per character.

- **Characters.** "+ Character" above the canvas adds a character. Each
  character is a chip with a colour, a name box and a remove button. The
  first character is the protagonist and cannot be removed.
- **Choosing whose line to draw.** Clicking a chip, or pressing 1 to 4,
  chooses the character that the pen and the eraser act on. The other
  characters' lines are drawn faintly.
- **Generating.** With one character, TaleBrush writes as soon as the pen is
  lifted, as in the paper. With several characters, a stroke only marks its
  sentences, and the button turns green and reads "Generate". This lets the
  writer draw every character's line before any sentence is written.
- **Targets.** Each sentence slot gets one fortune target per character. A
  character with no line over a slot has no target there.
- **Regeneration rule.** The rule is the paper's: a sentence is rewritten when
  its rating misses the target by more than 0.2. With several characters, the
  miss is the largest miss over the characters that have a target. A sentence
  that leaves out a character with a target counts as a miss of 1.0, so it is
  always rewritten while retries remain.
- **Ratings.** The model rates each character separately. A character other
  than the protagonist can be rated "not in this sentence". The canvas then
  draws no dot for that character, and the character's line continues as a
  dotted segment.
- **Editor highlights.** The highlight colour of each sentence shows the
  fortune of the selected character.
- **History.** While the History list is open, each stored story shows the
  selected character's line. Hovering a stored story shows every one of its
  characters.
- **Example.** Examples has a new "Bob and Alice" story. The paper's
  Discussion uses these two names; the opening sentence is ours.

With one character, the page and every prompt are the same as before the
remix. We checked the prompts by rendering 8 one-character prompts with the
old and the new code: all 8 were identical. Stories saved by the old version
load as a story with one protagonist.

### What question it explores

The paper reports that its model tied characters' fortunes together. Section
8.4 says: "in the story about Bob and Alice, it is hard to make Bob have a
good fortune and Alice have a bad one", and it names "explicit control of
multiple characters' fortune" as future work. Participants in the user study
also asked for "other characters' fortunes".

This remix asks two questions:

1. Can a language model that receives one written target per character keep
   two characters' fortunes apart, when the paper's trained model could not?
2. Does drawing one line per character help writers plan stories about
   relationships, such as rivals, or one character rising while another
   falls?

### First result (one run, not a measurement)

In the Bob and Alice example, we drew Bob's line rising from 0.2 to 0.85 and
Alice's line falling from 0.8 to 0.15 over 6 sentences. TaleBrush wrote the 6
sentences in 19 seconds with 2 model calls (Claude Haiku through the bridge).
For each of the 6 sentences and each of the 2 characters, the rating was
within 0.2 of the drawn target, so no sentence was rewritten. In the last
sentence, for example, Bob gets the lead in the next show and Alice "sat
alone, humiliated" (Bob rated 0.90, Alice 0.10).

The same model writes the sentences and rates them. So a close rating does
not show that a human reader would agree. A test with human ratings would be
needed to answer question 1.

### Choices we made

- **One canvas with several lines, not one canvas per character.** On one
  canvas the writer can see where the lines cross. Stacked canvases would
  keep the lines apart but would hide the crossing points.
- **The pen draws only the selected character's line.** The alternative was
  to guess the character from where the stroke starts, but that guess fails
  where lines overlap.
- **No writing on every stroke when there are several characters.** If every
  stroke started a generation, drawing two lines would cost two generations
  of about 20 seconds each, and the first one would ignore the second line.
- **"Not in this sentence" is allowed for every character except the
  protagonist.** The paper always rates the protagonist. Forcing a number for
  a character who is absent would place that character near 0.5 and draw a
  line that means nothing.
- **A character without a name is not sent to the model.** Otherwise the
  model would write about a character called "Character 3". Generate stops
  and asks for a name if an unnamed character has a line.

### Cost

Rating does not cost more calls per sentence: one call still rates up to 16
sentences, for every character at once. Adding or renaming a character costs
one call, for that character only, because each character's ratings are
cached on their own. Generation still costs 2 to 6 calls per stroke batch.

### Files

- New: `app/static/js/characters.js` (character list, colours, names),
  `app/static/js/cast.js` (the chips), `app/talebrush/cast.py` (names on the
  server).
- Changed: the sketch, state, canvas, editor, recognizer, generator, history
  and page files, `app/talebrush/prompts.py`, `recognition.py`,
  `generation.py`, `server.py`, and both test files.

## Choosing the writing model

Built by Claude Code (Claude Opus 5.5) on 2 November 2026.

### What changed

A **Writing model** menu in the top bar chooses which Claude model writes the
sentences: Haiku, Sonnet, Opus or Fable. Each name means the newest model of
that family that the group's Claude Code can use. Fortune ratings do not
change: they always come from the main bridge's model (Haiku), and the badge
next to the menu names it.

- **Extra bridges.** The workshop bridge answers with one model, fixed when it
  starts. So the first time a story is generated with another model,
  TaleBrush starts one more bridge for that model, on the first free port
  from 8788. This takes a few seconds and the status line says so. TaleBrush
  stops these bridges when it stops. `llm-bridge/` is not changed.
- **Which model wrote what.** The status line after generating ("Wrote 2
  sentences with Sonnet in 9 s"), a tag on each story in the History list,
  and the tooltip of each canvas column name the model that wrote the
  sentences.
- With Haiku chosen (the default), TaleBrush behaves as before.

### What question it explores

The paper wrote sentences with GPT-Neo 2.7B steered by a GeDi model. This
build replaced both with Claude Haiku. The menu lets the table compare
writing models on the same sketch:

1. Does a larger model follow the drawn fortune line more closely? The
   evidence is the rating model's misses and the number of rewrites, which
   the page shows for each sentence.
2. Do the sentences read differently (more specific, more varied, better
   connected to the story) when a larger model writes them?

A second effect: with Sonnet, Opus or Fable writing, the model that rates a
sentence is no longer the model that wrote it. That removes one reason to
distrust a close rating, though a test with human ratings would still be
needed.

### First result (one run, not a measurement)

In the Mike example, we chose Sonnet and drew a line over sentences 3 and 4.
TaleBrush started a Sonnet bridge on port 8788 in about 2 seconds. Sonnet
wrote the 2 sentences in 9 seconds, with 2 model calls: 1 to Sonnet for
writing and 1 to Haiku for rating. Both sentences were rated within 0.2 of
the line, so neither was rewritten. Opus and Fable were not tried.

### Choices we made

- **Only the writing changes, not the rating.** If the menu also changed the
  rating model, stories written by different models would be rated on
  different scales and could not be compared. Ratings also run after every
  typing pause, so a slower rating model would slow the whole page.
- **TaleBrush starts the extra bridges itself.** One alternative was to make
  the bridge follow the model name in each request, but `llm-bridge/` is
  shared by every group and must not be changed. The other alternative was
  to ask the writer to start one bridge per model by hand, which adds steps
  and port numbers to get wrong.
- **The menu is in the top bar, not in Settings.** Comparing models means
  switching often, so the switch should take one click and the current
  choice should stay visible.

### Cost

Writing calls go to the chosen model, so a larger model uses more of the
group's plan per generation. The number of calls does not change: 2 to 6 per
generation, as before.

### Files

- New: `app/talebrush/bridges.py` (model list; starts, reuses and stops the
  extra bridges).
- Changed: `app/server.py`, `app/talebrush/generation.py`, and the page
  files `index.html`, `main.js`, `generator.js`, `store.js`, `history.js`,
  `canvas.js` and `talebrush.css`; `tests/test_pipeline.py`; `README.md` and
  `DEVELOPER.md`.

## Relationships between characters

Built by Claude Code (Claude Opus 5.5) on 2 November 2026.

### What changed

With two or more characters, a checkbox under the canvas, **Relationships
between characters**, shows a second panel. On it the writer draws how a pair
of characters gets along over the story, from **Conflict** (bottom, 0)
through neutral (0.5) to **Harmony** (top, 1).

- **Pairs.** Chips above the panel choose the pair the pen draws for ("Bob &
  Alice"). Every pair of characters can have its own line: 1 pair with 2
  characters, 3 with 3, 6 with 4.
- **Drawing.** The line works like a fortune line: an envelope whose width
  follows the drawing speed, so slow strokes allow 2 rewrites and fast ones 1.
  Lifting the pen marks the sentences, and **Generate** writes them. Fortune
  lines and relationship lines over the same sentences are both used.
- **Ratings.** The model rates every pair in every sentence, in a second call
  sent at the same time as the fortune call. Each pair's rating is a line of
  teal dots. Where the two characters do not deal with each other, the pair
  gets no dot and its line is dotted.
- **Rewrites.** The paper's rule extended: a sentence is rewritten when any
  fortune or any relationship misses its line by more than 0.2. A pair with
  a line whose two characters do not deal with each other in the sentence
  counts as a miss of 1.0.
- **Off by default.** While the panel is off, no relationship is rated or
  sent, and every prompt is the text sent before this remix (25 prompts
  compared).

### What question it explores

The paper controls one dimension, the protagonist's fortune. The first remix
added one fortune line per character. But two fortune lines do not say
whether the characters are on each other's side: Bob and Alice can both
succeed as rivals, or both fail while helping each other. This remix asks:

1. Is the relationship between characters a dimension writers want to
   control separately from fortune? Arcs such as rivals who become friends,
   or friends who fall out, are common story shapes.
2. Can the model follow a relationship line and a fortune line at the same
   time, when they pull in different directions (for example, Bob wins while
   he and Alice are fighting)?

### First result (one run, not a measurement)

In the Bob and Alice example, we drew only a relationship line: conflict
(about 0.15) over sentences 2 and 3, neutral at sentence 4, harmony (about
0.9) over sentences 5 and 6. Haiku wrote the 5 sentences in 35 seconds with 6
model calls. Bob accuses Alice of rigging the casting, Alice mocks him in
front of the cast, they rehearse speaking only their cues, Alice mends Bob's
cape, and on opening night Bob holds her hand. Every rated relationship was
within 0.2 of the line; sentence 4 needed one rewrite (rated 0.40 against
about 0.5). Without fortune lines, the characters' fortunes followed the
relationship (Bob's fortune was rated 0.12 while they fought), so question 2
was not tested. The same model writes and rates the sentences.

### Choices we made

- **A drawn line, not one setting per pair for the whole story.** A single
  setting cannot express a relationship that changes, and a line keeps the
  paper's way of controlling the story.
- **A separate panel, not more lines on the fortune canvas.** The two axes
  mean different things (how well things go for one character, and how two
  characters treat each other), so lines on the same canvas would be easy to
  misread.
- **Relationships are rated in their own call.** Adding them to the fortune
  rating call would change the fortune prompt, and every fortune rating
  would then differ from the earlier versions. Sending both calls at the same
  time keeps the wait about the same.
- **"Do not deal with each other" is a rating, not a number.** Forcing a
  number for two characters who do not meet in a sentence would place them
  near neutral and draw a line that means nothing.

### Cost

While the panel is on: one more call each time the writer's sentences are
rated, and one more call per rewrite round when TaleBrush writes (sent at the
same time as the fortune call). Nothing changes while it is off.

### Files

- Changed: `app/talebrush/prompts.py`, `recognition.py`, `generation.py`,
  `cast.py`, `app/server.py`; on the page `characters.js`, `keys.js`,
  `sketch.js`, `store.js`, `recognizer.js`, `api.js`, `generator.js`,
  `history.js`, `canvas.js`, `main.js`, `index.html`, `talebrush.css`; both
  test files; `README.md` and `DEVELOPER.md`.
