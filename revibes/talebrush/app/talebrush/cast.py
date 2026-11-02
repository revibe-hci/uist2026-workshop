"""The characters whose fortune is sketched (remix: several characters' fortunes).

The paper controls one fortune, the protagonist's. This remix accepts up to
four characters per request; the first is the protagonist. Names follow the
same rules as the page (static/js/characters.js `modelNames`): an unnamed
character other than the protagonist is "Character N", and a repeated name
gets the character's number, so that every character can be told apart in
the model's answers.
"""

MAX_CHARACTERS = 4
MAX_PAIRS = MAX_CHARACTERS * (MAX_CHARACTERS - 1) // 2  # 6 pairs of characters (remix: relationships)

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


def clean_pairs(raw, n):
    """The pairs of characters in a request (remix: relationships between characters).

    `raw` is a list such as [[0, 1], [1, 2]]: indices into the character list. Each pair is
    returned as (i, j) with i < j, once, and only if both characters exist.
    """
    out = []
    if not isinstance(raw, list):
        return out
    for p in raw:
        if not (isinstance(p, (list, tuple)) and len(p) == 2):
            continue
        if not all(isinstance(x, int) and not isinstance(x, bool) for x in p):
            continue
        i, j = sorted(p)
        if 0 <= i < j < n and (i, j) not in out:
            out.append((i, j))
    return out[:MAX_PAIRS]
