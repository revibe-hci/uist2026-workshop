"""The characters whose fortune is sketched (remix: several characters' fortunes).

The paper controls one fortune, the protagonist's. This remix accepts up to
four characters per request; the first is the protagonist. Names follow the
same rules as the page (static/js/characters.js `modelNames`): an unnamed
character other than the protagonist is "Character N", and a repeated name
gets the character's number, so that every character can be told apart in
the model's answers.
"""

MAX_CHARACTERS = 4

# A rating meaning "this sentence does not involve this character". The
# protagonist is never rated ABSENT: the paper always rates the protagonist.
ABSENT = "absent"

# Answers that mean "not in this sentence" when the model writes a word instead of null.
ABSENT_WORDS = {"absent", "null", "none", "n/a", "na", "not present", "not involved", "not mentioned", ""}


def clean_characters(raw, protagonist=None):
    """The list of character names in a request body.

    `raw` is the "characters" list; requests from before the remix send only
    "protagonist", which becomes a list of one.
    """
    if isinstance(raw, list) and raw:
        names = [" ".join(str(c or "").split()) for c in raw[:MAX_CHARACTERS]]
    else:
        names = [" ".join(str(protagonist or "").split())]
    out, seen = [], set()
    for k, name in enumerate(names):
        if k > 0 and not name:
            name = f"Character {k + 1}"
        if name and name.lower() in seen:
            name = f"{name} ({k + 1})"
        if name:
            seen.add(name.lower())
        out.append(name)
    return out
