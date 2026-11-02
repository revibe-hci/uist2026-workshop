# TaleBrush (rebuilt from the paper)

TaleBrush is a story-writing tool in which you sketch how the protagonist's
fortune should change over a story, and a language model writes sentences that
follow the sketch. It was rebuilt from the paper alone: Chung et al.,
"TaleBrush: Sketching Stories with Generative Pretrained Language Models",
CHI 2022.

You need Python 3.8 or later and a web browser. Nothing has to be installed and
no API key is needed: the language model is reached through the workshop's LLM
bridge, which uses the coding agent you are signed in to (Claude Code).

## Start it

Open two terminals in the repository root (`uist2026-workshop/`).

1. In the first terminal, start the LLM bridge and leave it running:

       python3 llm-bridge/bridge.py claude

2. In the second terminal, start TaleBrush:

       python3 revibes/talebrush/app/server.py

3. Open **http://localhost:5177** in your browser.

The badge at the top right of the page shows which model rates fortune
("Rating model: haiku via LLM bridge"). If it says "LLM bridge offline", the
bridge from step 1 is not running. The **Writing model** menu next to it
chooses the Claude model that writes the sentences (see "Choosing the writing
model" below).

If port 5177 is taken, start TaleBrush with another port:
`python3 revibes/talebrush/app/server.py --port 5180`. If the bridge runs on
another port, add `--bridge http://localhost:8788`.

## Use it

The screen has a text editor on the left and a sketching canvas on the right,
as in Figure 1 of the paper. To start quickly, pick a story from **Examples**
at the top of the page. "Mike, the jazz guitarist" is the story from Figure 1.

1. **Name the protagonist** in the box above the canvas ("Mike 's fortune").
2. **Write a sentence or two** in the editor. Each bullet point (`>`) is one
   step of the story, usually one sentence. Press Enter for a new bullet;
   press Backspace on an empty bullet to remove it. The editor starts with 8
   bullets, so the canvas has 8 columns.
3. **Watch the canvas.** About five seconds after you stop typing, each
   sentence appears as a grey dot. The dot's height is the protagonist's
   fortune in that sentence, as rated by the language model: higher is better.
   Dots of neighbouring sentences are joined by a line, and a blank bullet
   leaves a gap. Each sentence in the editor is also highlighted in the colour
   of its fortune: yellow for good, grey for bad.
4. **Sketch the fortune** with the pen over the empty columns. Left to right is
   the order of the sentences, up and down is how good or bad things should be
   for the protagonist. **How fast you draw sets how closely the sentences
   should follow the line.** TaleBrush rates every sentence it writes, and if
   the rating misses your line by more than 0.2 it writes the sentence again
   and keeps the closest try. A slow stroke draws a thin line and allows 2
   rewrites; a fast stroke draws a wide line and allows 1.
5. **Release the mouse.** TaleBrush writes a sentence for every column under
   your stroke. The new sentences get a blue bar in the editor, and their
   fortune is drawn as a blue line over your sketch, so you can see how well
   they follow it. This takes about 10 to 30 seconds. **Stop** under the
   canvas cancels it.
6. **Edit any sentence** directly. A sentence you edit becomes yours (its bar
   turns grey). TaleBrush never overwrites your sentences: it uses them as
   context.
7. **Generate Again** writes new sentences for the same sketch.
8. **Redraw part of the line** to rewrite only those sentences. If written
   sentences follow, TaleBrush fills the gap so it leads into them.
9. **Erase part of the line** with the eraser (the pink button under the
   canvas, or the E key; B switches back to the pen). Then press Generate
   Again: where the line is erased, sentences are written without a fortune
   target.
10. **Control surprise.** Tick "Surprise in a separate panel." and draw a thin
    line in the second canvas: high means a surprising, unexpected sentence,
    low means a predictable one. Columns without a surprise line use a middle
    value. The surprise line is used at the next generation.
11. **Compare stories with History** (top right of the editor). Every
    generation is stored. While the list is open, the fortune lines of all
    stored stories are drawn faintly on the canvas. Hover over a story to see
    its text and its highlighted line. Click it to go back to it. The pencil
    renames a story and the red x deletes it.
12. **Hover over a canvas column** for its details: the sentence's rated
    fortune, the sketched target and how many tries the stroke's speed allows.

Your story and the history are saved in the browser, so reloading the page
keeps them. **New story** starts over (the current story stays in History).

## Several characters (remix, not in the paper)

The paper sketches only the protagonist's fortune. This version also lets you
sketch the fortunes of up to three more characters. To try it quickly, pick
"Bob and Alice" from **Examples**.

1. **Add a character** with **+ Character** next to the protagonist's name,
   and type the character's name. Each character gets a colour. TaleBrush
   rates the existing sentences for the new character (one model call). A
   character without a name is ignored until you name it.
2. **Choose whose line to draw** by clicking a character's chip, or by
   pressing 1, 2, 3 or 4. The chosen chip is outlined. The pen and the eraser
   act only on that character's line; the other lines are drawn faintly.
3. **Draw each character's line.** With several characters, lifting the pen
   does not start writing. The button turns green and reads **Generate**.
   Press it when every line is drawn. TaleBrush then writes the sentences
   under your new strokes.
4. **Read the result.** Each character's rated fortune is a line of dots in
   its colour: filled dots for TaleBrush's sentences, rings for yours. Where a
   sentence does not involve a character, that character has no dot and its
   line continues as a dotted segment. A sentence is rewritten when any
   character with a line over it misses that line by more than 0.2, or when
   the sentence leaves that character out.
5. **The editor highlights** show the fortune of the character you chose.
   Hover over the `>` of a sentence, or over a canvas column, to see every
   character's fortune.
6. **Remove a character** with the x on its chip. With one character left,
   TaleBrush again writes as soon as you lift the pen, as in the paper.

`../remixes.md` explains why this was added and what question it explores.

## Relationships between characters (remix, not in the paper)

With two or more characters, you can also sketch how each pair of characters
gets along over the story, from conflict to harmony. To try it, pick "Bob and
Alice" from **Examples**.

1. **Switch it on** with **Relationships between characters** under the
   canvas. A second panel appears, with **Harmony** at the top, **Conflict**
   at the bottom and neutral in the middle. TaleBrush rates every sentence
   for every pair (one more model call).
2. **Choose a pair** with the chips above the panel ("Bob & Alice"). With
   three characters there are 3 pairs; with four, 6.
3. **Draw the pair's line** the same way as a fortune line. Drawing slowly
   makes TaleBrush follow the line more closely (up to 2 rewrites). Lifting
   the pen marks the sentences; press **Generate** to write them. You can
   also draw fortune lines for the same sentences, and both are used.
4. **Read the result.** Each pair's rated relationship is a line of teal
   dots. Where the two characters do not deal with each other in a sentence,
   the pair has no dot there and its line is dotted. A sentence is rewritten
   when a pair misses its line by more than 0.2, or when the two characters
   do not deal with each other where they have a line. Hover over a column
   to see each pair's rating and line.
5. **Switch it off** to go back to fortune lines only. The relationship lines
   are kept, but they are not used while the panel is off.

## Choosing the writing model (remix, not in the paper)

The **Writing model** menu at the top right chooses which Claude model writes
the sentences: Haiku, Sonnet, Opus or Fable. Each name means the newest model
of that family that your Claude Code can use.

- **Only the writing changes.** Fortune ratings always come from the main
  bridge's model (Haiku), so stories written by different models are rated
  by the same model. The badge next to the menu names the rating model.
- **A second bridge starts by itself.** The workshop bridge answers with one
  model only. So the first time you generate with another model, TaleBrush
  starts one more bridge for that model, on the first free port from 8788.
  The status line says so, and the start takes a few seconds. TaleBrush stops
  these bridges when you stop TaleBrush. Their log lines appear in the
  TaleBrush terminal, marked with the model name, for example `(sonnet)`.
- **Cost and speed.** Larger models take longer per call and use more of your
  plan. In one test, Sonnet wrote 2 sentences in 9 seconds.
- **Which model wrote what.** The status line after generating, the History
  list and the tooltip of each canvas column name the model that wrote the
  sentences.

The menu appears only when the main bridge runs Claude Code
(`python3 llm-bridge/bridge.py claude`).

## Settings

**Settings** at the top of the page has two options:

- **Generation pipeline.** By default, all sentences of a stroke are written
  in one model call and checked in a second call, which takes 10 to 30
  seconds. The other choice writes one sentence at a time as the paper did,
  and fills gaps alternately from the sentence before and the sentence after.
  It is slower, about 10 to 30 seconds per sentence.
- **Regeneration threshold.** A sentence is rewritten when its rated fortune
  differs from the sketch by more than this value. The paper uses 0.2.

## How this differs from the paper

- **The language model.** The paper trained its own models: GPT-Neo 2.7B with
  tuned prompts for rating fortune and writing sentences, and a GeDi model
  (GPT2-medium) that steers writing toward a fortune value. None of these is
  available here. Both jobs are done by the model behind the LLM bridge
  (Claude Haiku when you use Claude Code). It receives the paper's definition
  of fortune, the three calibration sentences from the paper's annotation
  task, and each target as a number with a description. The page says so at
  the bottom.
- **Surprise.** The paper used the surprise value as the model's sampling
  temperature. The bridge cannot set temperature, so the surprise value is
  described to the model in words.
- **Speed.** Each model call takes about five seconds, so by default all
  sentences of a stroke are written together (see Settings).
- **Several characters.** Not in the paper; see "Several characters" above.
  With one character, TaleBrush behaves and prompts the model exactly as
  before.
- **Relationships.** Not in the paper; see "Relationships between
  characters" above. While the panel is off, TaleBrush behaves and prompts
  the model exactly as before.
- **Writing model.** Not in the paper; see "Choosing the writing model"
  above. With Haiku chosen (the default), TaleBrush behaves exactly as
  before.
- **Software.** The paper used React and Flask. This version uses plain
  JavaScript and a Python server with no extra packages, so it runs without
  installing anything.

## If something goes wrong

- **"LLM bridge offline" or "not reachable".** Start the bridge (step 1 of
  "Start it"). The page checks again every few seconds.
- **"Port 5177 is in use".** Use `--port` as shown above.
- **Nothing happens after a stroke.** If you wrote or edited every sentence
  under the stroke, TaleBrush keeps them and says so under the canvas. Empty
  a bullet to let TaleBrush write it.
- **Start completely fresh.** Clear this site's data in the browser (the
  story and history are stored under `talebrush-revibe-v1` in localStorage).

Developers: see `DEVELOPER.md`.
