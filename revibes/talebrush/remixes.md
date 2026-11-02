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
