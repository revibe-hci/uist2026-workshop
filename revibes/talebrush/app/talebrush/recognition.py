"""Fortune recognition (paper Section 5.2.1).

The paper's recognition model reads up to three previous sentences, the
protagonist's name and a target sentence, and predicts the protagonist's
fortune as a number between 0 and 1. It is GPT-Neo 2.7B with soft prompts
trained on crowdsourced fortune labels.

Here the same input goes to the bridge LLM as a prompt, anchored by the
paper's three calibration sentences. Several sentences are rated in one call,
because each call through the bridge takes about five seconds. Answers are
cached by (character, previous context, sentence), so unchanged sentences are
never rated twice.

Remix (several characters' fortunes): a request names up to four characters,
the protagonist first, and each sentence gets one value per character. Each
character's rating is cached on its own, so adding a character rates only
that character. A character other than the protagonist can be rated ABSENT:
the sentence does not involve them. With one character, the prompt is the
one-character version's prompt, unchanged.
"""

import json
import threading

from . import prompts
from .cast import ABSENT, ABSENT_WORDS, clean_characters

CONTEXT_SENTENCES = 3      # the paper found three previous sentences worked best
MAX_ITEMS_PER_CALL = 16


class Recognizer:
    def __init__(self, llm):
        self.llm = llm
        self._cache = {}
        self._lock = threading.Lock()

    @staticmethod
    def cache_key(name, is_protagonist, context, sentence):
        key = [name.strip(), list(context), sentence.strip()]
        if not is_protagonist:
            key.append("side")  # rated with the several-character prompt, which allows ABSENT
        return json.dumps(key)

    def recognize(self, characters, items):
        """Rate a list of items, each {"context": [previous sentences], "sentence": str}.

        characters: the character names, the protagonist first (one name as a
        string means one character). An item may carry "rate": the indices of
        the characters to rate; by default every character is rated.

        Returns one list per item, with one value per character: a fortune
        (float in [0, 1]), ABSENT (the sentence does not involve that
        character), or None (blank sentence, not asked for, or no usable
        answer from the model).
        """
        characters = clean_characters([characters] if isinstance(characters, str) else characters)
        n = len(characters)
        results = [[None] * n for _ in items]
        groups = {}  # indices of the characters still to rate -> [(item index, context, sentence)]
        for i, item in enumerate(items):
            sentence = " ".join(str(item.get("sentence") or "").split())
            if not sentence:
                continue
            context = [" ".join(str(c).split()) for c in (item.get("context") or [])]
            context = [c for c in context if c][-CONTEXT_SENTENCES:]
            wanted = range(n)
            if isinstance(item.get("rate"), list):
                wanted = sorted({k for k in item["rate"] if isinstance(k, int) and 0 <= k < n})
            missing = []
            for k in wanted:
                key = self.cache_key(characters[k], k == 0, context, sentence)
                with self._lock:
                    cached = self._cache.get(key)
                if cached is not None:
                    results[i][k] = cached
                else:
                    missing.append(k)
            if missing:
                groups.setdefault(tuple(missing), []).append((i, context, sentence))
        for rate, todo in groups.items():
            for start in range(0, len(todo), MAX_ITEMS_PER_CALL):
                chunk = todo[start:start + MAX_ITEMS_PER_CALL]
                rows = self._call(characters, rate, [(context, sentence) for _, context, sentence in chunk])
                for (i, context, sentence), row in zip(chunk, rows):
                    for k, value in zip(rate, row):
                        results[i][k] = value
                        if value is not None:
                            with self._lock:
                                self._cache[self.cache_key(characters[k], k == 0, context, sentence)] = value
        return results

    def _call(self, characters, rate, items):
        """One model call. Returns, per item, one value per character index in `rate`."""
        if len(characters) == 1:
            system = prompts.recognition_system()
            user = prompts.recognition_user(characters[0], items)

            def parse(rating):
                return [normalize(rating)]
        else:
            system = prompts.recognition_system_multi()
            user = prompts.recognition_user_multi(characters, [characters[k] for k in rate], items)

            def parse(rating):
                return [fortune_for(rating, prompts.names_of(characters)[k], k == 0) for k in rate]
        values = []
        for _ in range(2):  # ask again once if the model returns the wrong number of values
            values = ratings_of(self.llm.chat_json(system, user))
            if len(values) == len(items):
                break
        return [parse(values[j]) if j < len(values) else [None] * len(rate) for j in range(len(items))]


def ratings_of(data):
    """The list of ratings in a model answer: {"ratings": [{"item", "reason", "fortune"}]} or {"fortunes": [...]}."""
    values = data
    if isinstance(data, dict):
        values = data.get("ratings", data.get("fortunes"))
    if not isinstance(values, list):
        return []
    if all(isinstance(v, dict) and isinstance(v.get("item"), int) for v in values):
        values = sorted(values, key=lambda v: v["item"])
    return values


def normalize(value):
    """Turn a model answer into a fortune in [0, 1]; accept 0-10 or 0-100 scales too."""
    if isinstance(value, dict):
        value = value.get("fortune")
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    if x != x:  # NaN
        return None
    if 1 < x <= 10:
        x /= 10
    elif 10 < x <= 100:
        x /= 100
    return round(min(1.0, max(0.0, x)), 3)


def fortune_for(rating, name, is_protagonist):
    """One character's value in a several-character rating, e.g. {"fortunes": {"Bob": 0.4, "Alice": null}}.

    null (or a word such as "absent") means the sentence does not involve the
    character: ABSENT, except for the protagonist, who must get a number. A
    missing name is None (no answer), so it is asked again later.
    """
    table = rating.get("fortunes") if isinstance(rating, dict) else None
    if not isinstance(table, dict):
        return None
    lowered = {" ".join(str(k).split()).lower(): v for k, v in table.items()}
    key = " ".join(name.split()).lower()
    if key not in lowered:
        return None
    value = lowered[key]
    if value is None or (isinstance(value, str) and value.strip().lower() in ABSENT_WORDS):
        return None if is_protagonist else ABSENT
    return normalize(value)
