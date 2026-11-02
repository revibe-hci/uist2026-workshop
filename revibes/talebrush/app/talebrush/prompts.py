"""Prompt text for TaleBrush's recognition and generation modules.

The paper tunes soft prompts on GPT-Neo 2.7B (one set per task) and steers
generation with a GeDi class-conditional model. Neither model is available at
the workshop, so this build describes each task to the bridge LLM in words:

* The fortune definition follows Section 5.1 of the paper.
* The three calibration sentences are the ones annotators saw (Figure 6).
* The section labels ("Beginning Story:", "Story Character:", "Continue Story:",
  "Ending Story:", "Infilled Story:") are the natural-language prompts the
  paper used to initialize its soft prompts, in the order of Figure 9.

Remix (several characters' fortunes): when a request has more than one
character, the *_multi prompts and the multi-character branches below are used.
They give one fortune target per character and ask the model to rate each
character separately. With one character, every prompt is exactly the text the
one-character version sent, so the two versions can be compared.
"""

from .cast import ABSENT

# The same definition, for any character (several-character prompts).
FORTUNE_DEFINITION_ANY = (
    "FORTUNE is how good or bad things are for a character in a sentence, as a reader would "
    "perceive it. It reflects the character's status, emotional and physical well-being, and how "
    "close the character is to their goals. It is a number from 0 (extremely bad fortune) to 1 "
    "(extremely good fortune); 0.5 is neutral."
)

FORTUNE_DEFINITION = (
    "FORTUNE is how good or bad things are for the protagonist in a sentence, as a reader "
    "would perceive it. It reflects the protagonist's status, emotional and physical "
    "well-being, and how close they are to their goals. It is a number from 0 (extremely "
    "bad fortune) to 1 (extremely good fortune); 0.5 is neutral."
)

CALIBRATION = (
    "Calibration sentences (protagonist: Eugene):\n"
    '- 0.10: "Eugene ran out of home to get money, but got a car accident, and lost the lottery ticket..."\n'
    '- 0.50: "Eugene woke up in the morning and had a piece of bread as breakfast."\n'
    '- 0.90: "Eugene was watching TV while having breakfast, and soon realized that he won the lottery!"'
)

# The same reading of the scale is given to generation and recognition, so that a sentence
# written for a target is rated near that target.
FORTUNE_BANDS = [
    (0.10, "a catastrophe (grave injury, ruin, losing everything)"),
    (0.25, "serious trouble (a painful failure, a humiliation, a betrayal)"),
    (0.40, "a setback or a worry (a small failure, bad news, a disappointment)"),
    (0.60, "an ordinary or mixed moment (routine, plans, calm, or a little good with a little bad)"),
    (0.75, "a small win or a pleasant moment"),
    (0.90, "a clear success or real happiness"),
    (1.01, "a triumph or a dream come true"),
]

FORTUNE_SCALE = "How to read the scale:\n" + "\n".join(
    f"- {low:.2f} to {min(high, 1.0):.2f}: {words}"
    for (low, (high, words)) in zip([0.0] + [b[0] for b in FORTUNE_BANDS[:-1]], FORTUNE_BANDS)
)

SURPRISE_DEFINITION = (
    "SURPRISE is how unexpected a sentence is, given the sentences before it, from 0 (the most "
    "predictable next event) to 1 (a wild, unexpected turn)."
)

STYLE_RULES = (
    "- Match the tense and voice of the written lines (simple past tense if there are none). "
    "Use plain, concrete storytelling, like a short story outline.\n"
    "- Each sentence is a single sentence of 8 to 25 words, with no line breaks, no numbering "
    "and no quotation marks around it."
)


def name_of(protagonist):
    return protagonist.strip() or "the protagonist"


def as_cast(characters):
    """A list of names (the protagonist first). One name as a string means one character."""
    if isinstance(characters, str):
        return [characters]
    return list(characters) or [""]


def names_of(characters):
    cast = as_cast(characters)
    return [name_of(cast[0])] + [c.strip() for c in cast[1:]]


def cast_line(characters):
    """'Bob (the protagonist), Alice and Carl'."""
    names = names_of(characters)
    items = [f"{names[0]} (the protagonist)"] + names[1:]
    return items[0] if len(items) == 1 else ", ".join(items[:-1]) + " and " + items[-1]


def and_list(names):
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def fortune_words(f):
    """The scale band of a fortune value, e.g. 0.3 -> "a setback or a worry (...)"."""
    for high, words in FORTUNE_BANDS:
        if f < high:
            return words
    return FORTUNE_BANDS[-1][1]


def surprise_words(s):
    if s < 0.2:
        return "very predictable: the most expected next event"
    if s < 0.4:
        return "predictable: a conventional next event"
    if s <= 0.6:
        return "natural: a plausible, moderately inventive next event"
    if s <= 0.8:
        return "surprising: an unexpected but still possible turn"
    return "very surprising: a wild, unexpected twist"


def fortune_instruction(target, characters=None):
    if characters is None or len(as_cast(characters)) == 1:
        if target.fortune is None:
            return "No fortune target: write whatever fits the story best."
        return f"Fortune target: {target.fortune:.2f} ({fortune_words(target.fortune)})."
    if not target.has_target:
        return "No fortune targets: write whatever fits the story best."
    parts = [f"{name} {f:.2f} ({fortune_words(f)})" if f is not None else f"{name}: no target"
             for name, f in zip(names_of(characters), target.fortunes)]
    return "Fortune targets: " + "; ".join(parts) + "."


def surprise_instruction(target):
    return f"Surprise: {target.surprise:.2f} ({surprise_words(target.surprise)})."


def feedback_lines(target, attempts, indent, characters=None):
    """Earlier text for this slot that the model should not repeat."""
    lines = []
    if target.previous:
        lines.append(f'{indent}Earlier version of this line (write something different): "{target.previous}"')
    if characters is None or len(as_cast(characters)) == 1:
        for a in attempts:
            if a.fortune is None or target.fortune is None:
                continue
            direction = "too good" if a.fortune > target.fortune else "too bad"
            lines.append(f'{indent}Rejected try, read as fortune {a.fortune:.2f}, which is {direction}: "{a.text}"')
        return lines
    names = names_of(characters)
    for a in attempts:
        notes = []
        for name, rating, goal in zip(names, a.fortunes, target.fortunes):
            if goal is None or rating is None:
                continue
            if rating == ABSENT:
                notes.append(f"{name} was left out, but has a target")
            elif abs(rating - goal) < 0.05:
                notes.append(f"{name} read as {rating:.2f}, on target")
            else:
                notes.append(f"{name} read as {rating:.2f}, {'too good' if rating > goal else 'too bad'}")
        if notes:
            lines.append(f'{indent}Rejected try ({"; ".join(notes)}): "{a.text}"')
    return lines


# ---------------------------------------------------------------- recognition


def recognition_system():
    return (
        "You are the fortune recognition module of TaleBrush, a story-writing tool. For each item "
        "you get the protagonist's name, up to three sentences that come before the target sentence "
        "(previous context), and the target sentence. Estimate the protagonist's fortune in the "
        "target sentence.\n\n"
        f"{FORTUNE_DEFINITION}\n\n{FORTUNE_SCALE}\n\n{CALIBRATION}\n\n"
        "Rate the protagonist's situation at the moment of the target sentence. Judge what happens "
        "in the target sentence itself: a happy event is rated high even if earlier sentences were "
        "sad, and the other way round. Use the previous context only to understand who and what the "
        "target sentence refers to. Use the whole scale: clear disasters near 0.05, clear triumphs "
        "near 0.95."
    )


def recognition_user(protagonist, items):
    """items: list of (context sentences, target sentence)."""
    parts = [f"Protagonist: {name_of(protagonist)}", ""]
    for k, (context, sentence) in enumerate(items, 1):
        parts.append(f"Item {k}")
        parts.append("Previous context: " + (" ".join(context) if context else "(none)"))
        parts.append(f"Target sentence: {sentence}")
        parts.append("")
    parts.append(
        'Respond with JSON only: {"ratings": [{"item": 1, "reason": "<what happens to the protagonist, '
        'at most 12 words>", "fortune": <number between 0 and 1, two decimals>}, ...]} '
        f"with exactly {len(items)} rating(s), in item order."
    )
    return "\n".join(parts)


def recognition_system_multi():
    return (
        "You are the fortune recognition module of TaleBrush, a story-writing tool. The story follows "
        "several characters; one of them is the protagonist. For each item you get up to three sentences "
        "that come before the target sentence (previous context) and the target sentence. Estimate the "
        "fortune of each character you are asked to rate, in the target sentence.\n\n"
        f"{FORTUNE_DEFINITION_ANY}\n\n{FORTUNE_SCALE}\n\n{CALIBRATION}\n\n"
        "Rate each character separately. The same event can be good for one character and bad for "
        "another: a rival's win is a loss. Rate each character's situation at the moment of the target "
        "sentence. Judge what happens in the target sentence itself: a happy event is rated high even if "
        "earlier sentences were sad, and the other way round. Use the previous context only to understand "
        "who and what the target sentence refers to. If the target sentence says nothing about a "
        "character, directly or by clear implication, answer null for that character, except for the "
        "protagonist: always give the protagonist a number. Use the whole scale: clear disasters near "
        "0.05, clear triumphs near 0.95."
    )


def recognition_user_multi(characters, rate, items):
    """characters: every name (the protagonist first); rate: the names to rate; items: (context, sentence)."""
    names = names_of(characters)
    rate_names = [name_of(r) if r == as_cast(characters)[0] else r for r in rate]
    parts = [f"Protagonist: {names[0]}"]
    if len(names) > 1:
        parts.append(f"Other characters: {and_list(names[1:])}")
    parts += [f"Rate: {', '.join(rate_names)}", ""]
    for k, (context, sentence) in enumerate(items, 1):
        parts.append(f"Item {k}")
        parts.append("Previous context: " + (" ".join(context) if context else "(none)"))
        parts.append(f"Target sentence: {sentence}")
        parts.append("")
    example = ", ".join(f'"{n}": <number between 0 and 1, two decimals{"" if n == names[0] else ", or null"}>'
                        for n in rate_names)
    parts.append(
        'Respond with JSON only: {"ratings": [{"item": 1, "reason": "<what happens to each rated character, '
        'at most 20 words>", "fortunes": {' + example + '}}, ...]} '
        f"with exactly {len(items)} rating(s), in item order."
    )
    return "\n".join(parts)


# ---------------------------------------------------------------- generation


def generation_system(characters=None):
    if characters is not None and len(as_cast(characters)) > 1:
        return generation_system_multi()
    return (
        "You are the story generation module of TaleBrush, a tool in which a writer co-writes a short "
        "story outline with an AI by sketching how the protagonist's fortune changes over the story. "
        "A story is a numbered list of lines; each line is one step of the story, usually one sentence.\n\n"
        f"{FORTUNE_DEFINITION}\n\n{FORTUNE_SCALE}\n\n{CALIBRATION}\n\n{SURPRISE_DEFINITION}\n\n"
        "A reader will rate the protagonist's fortune in each sentence you write on this scale, and "
        "the rating should land close to the target. Write events exactly as good or as bad as the "
        "target: not more extreme, and not milder."
    )


def generation_system_multi():
    return (
        "You are the story generation module of TaleBrush, a tool in which a writer co-writes a short "
        "story outline with an AI by sketching how the fortune of each of several characters changes over "
        "the story. A story is a numbered list of lines; each line is one step of the story, usually one "
        "sentence.\n\n"
        f"{FORTUNE_DEFINITION_ANY}\n\n{FORTUNE_SCALE}\n\n{CALIBRATION}\n\n{SURPRISE_DEFINITION}\n\n"
        "A reader will rate the fortune of each character in each sentence you write on this scale, "
        "separately for each character, and each rating should land close to that character's target. "
        "Write events exactly as good or as bad as each target: not more extreme, and not milder."
    )


MULTI_RULES = (
    "- Every character with a target on a line must take part in that line's sentence, and that "
    "character's fortune must match its own target as closely as you can.\n"
    "- The targets of different characters are independent of each other. They can go in opposite "
    "directions: one character can win while another loses in the same sentence. Follow every target, "
    "even when it changes sharply from one line to the next.\n"
    "- A character marked \"no target\" on a line may appear in that sentence or not."
)


def batch_user(protagonist, lines, attempts):
    """All blank lines at once.

    protagonist: the protagonist's name, or the list of all character names (protagonist first).
    lines: list of ("fixed", number, text) or ("blank", number, Slot).
    attempts: dict slot index -> list of earlier Candidate objects.
    """
    if len(as_cast(protagonist)) > 1:
        return batch_user_multi(as_cast(protagonist), lines, attempts)
    name = name_of(as_cast(protagonist)[0])
    parts = [f"Story Character: {name}", "",
             "Story. Lines marked BLANK are for you to write; the other lines are already written.", ""]
    for kind, number, value in lines:
        if kind == "fixed":
            parts.append(f"{number}. {value}")
            continue
        t = value.target
        parts.append(f"{number}. BLANK. {fortune_instruction(t)} {surprise_instruction(t)}")
        parts += feedback_lines(t, attempts.get(value.index, []), "   ")
    parts += [
        "",
        "Write one sentence for each BLANK line.",
        "- Make the protagonist's fortune in each sentence match that line's target as closely as you "
        "can. Targets may change sharply from one line to the next; follow them anyway.",
        "- The whole story must read smoothly from top to bottom: each sentence follows from the lines "
        "before it and leads into the written lines after it.",
        f"- Keep {name} as the protagonist. Do not bring in many new characters.",
        STYLE_RULES,
        "",
        'Respond with JSON only: {"sentences": [{"line": <line number>, "text": "<sentence>"}, ...]} '
        "with one entry for every BLANK line.",
    ]
    return "\n".join(parts)


def batch_user_multi(characters, lines, attempts):
    parts = [f"Story Characters: {cast_line(characters)}", "",
             "Story. Lines marked BLANK are for you to write; the other lines are already written.", ""]
    for kind, number, value in lines:
        if kind == "fixed":
            parts.append(f"{number}. {value}")
            continue
        t = value.target
        parts.append(f"{number}. BLANK. {fortune_instruction(t, characters)} {surprise_instruction(t)}")
        parts += feedback_lines(t, attempts.get(value.index, []), "   ", characters)
    parts += [
        "",
        "Write one sentence for each BLANK line.",
        MULTI_RULES,
        "- The whole story must read smoothly from top to bottom: each sentence follows from the lines "
        "before it and leads into the written lines after it.",
        f"- Keep {names_of(characters)[0]} as the protagonist. Do not bring in many new characters.",
        STYLE_RULES,
        "",
        'Respond with JSON only: {"sentences": [{"line": <line number>, "text": "<sentence>"}, ...]} '
        "with one entry for every BLANK line.",
    ]
    return "\n".join(parts)


def single_user(task, protagonist, prev, nxt, missing, target, attempts):
    """One sentence, laid out like the paper's three generation tasks (Figure 9).

    protagonist: the protagonist's name, or the list of all character names (protagonist first).
    """
    cast = as_cast(protagonist)
    multi = len(cast) > 1
    name = name_of(cast[0])
    character_line = f"Story Characters: {cast_line(cast)}" if multi else f"Story Character: {name}"
    beginning = "\n".join(prev) if prev else "(The story has not started yet.)"
    ending = "\n".join(nxt)
    lines_word = "sentence is" if missing == 1 else "sentences are"
    if task == "continuation":
        parts = [f"Beginning Story:\n{beginning}", "", character_line, "",
                 "Continue Story: write the next sentence of the story."]
    elif task == "infill from previous":
        parts = [character_line, "", f"Ending Story:\n{ending}", "", f"Beginning Story:\n{beginning}", "",
                 f"Infilled Story: {missing} {lines_word} missing between the Beginning Story and the Ending "
                 "Story. Write the FIRST missing sentence, the one that comes right after the Beginning Story."]
    else:  # infill from next
        parts = [character_line, "", f"Beginning Story:\n{beginning}", "", f"Ending Story:\n{ending}", "",
                 f"Infilled Story: {missing} {lines_word} missing between the Beginning Story and the Ending "
                 "Story. Write the LAST missing sentence, the one that comes right before the Ending Story."]
    parts += ["", fortune_instruction(target, cast), surprise_instruction(target)]
    parts += feedback_lines(target, attempts, "", cast)
    parts += [
        "",
        MULTI_RULES if multi else "- Make the protagonist's fortune in the sentence match the target as closely as you can.",
        f"- Keep {name} as the protagonist.",
        STYLE_RULES,
        "",
        'Respond with JSON only: {"text": "<sentence>"}',
    ]
    return "\n".join(parts)
