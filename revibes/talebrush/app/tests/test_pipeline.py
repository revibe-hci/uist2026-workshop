"""Offline tests for the recognition and generation pipelines.

A fake language model stands in for the LLM bridge, so these tests make no
model calls. Run from revibes/talebrush/app/:

    python3 -m unittest discover -s tests
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from talebrush import prompts  # noqa: E402
from talebrush.cast import ABSENT, clean_characters  # noqa: E402
from talebrush.generation import (  # noqa: E402
    Candidate,
    Generator,
    clean_sentence,
    error_of,
    parse_request,
    pick_best,
    plan_runs,
    sequential_order,
)
from talebrush.recognition import Recognizer, fortune_for, normalize, ratings_of  # noqa: E402


class FakeLLM:
    """Writes numbered sentences and rates them with a scripted fortune function.

    fortune_of(sentence) rates the protagonist in one-character prompts. For
    several-character prompts, fortune_of(sentence, name) is called for each
    name on the prompt's "Rate:" line; None stands for "not in the sentence".
    """

    def __init__(self, fortune_of):
        self.fortune_of = fortune_of
        self.calls = 0
        self.written = 0
        self.prompts = []

    def chat_json(self, system, user, retries=1):
        self.calls += 1
        self.prompts.append((system, user))
        if "fortune recognition module" in system:
            targets = [line[len("Target sentence: "):] for line in user.splitlines()
                       if line.startswith("Target sentence: ")]
            rate = [line[len("Rate: "):] for line in user.splitlines() if line.startswith("Rate: ")]
            if rate:
                names = rate[0].split(", ")
                return {"ratings": [{"item": k, "fortunes": {n: self.fortune_of(t, n) for n in names}}
                                    for k, t in enumerate(targets, 1)]}
            return {"fortunes": [self.fortune_of(t) for t in targets]}
        if '"sentences"' in user:  # batch generation: one sentence per BLANK line
            out = []
            for line in user.splitlines():
                if ". BLANK." in line:
                    self.written += 1
                    out.append({"line": int(line.split(".")[0]), "text": f"Sentence {self.written}."})
            return {"sentences": out}
        self.written += 1
        return {"text": f"Sentence {self.written}."}


def request(slots, mode="batch", threshold=0.2, characters=None):
    body = {"mode": mode, "threshold": threshold, "slots": slots}
    if characters:
        body["characters"] = characters
    else:
        body["protagonist"] = "Mike"  # the one-character request format, from before the remix
    return parse_request(body)


def target(fortune, max_regen=1, surprise=0.5):
    return {"text": "", "target": {"fortune": fortune, "tolerance": 0.1, "maxRegen": max_regen, "surprise": surprise}}


def run(llm, req):
    events = []
    Generator(llm, Recognizer(llm), log=lambda m: None).run(req, events.append)
    return events


def finals(events):
    return {e["slot"]: e for e in events if e["type"] == "sentence"}


class ParseTests(unittest.TestCase):
    def test_unconstrained_slot_gets_no_retries(self):
        req = request([{"text": "Mike plays jazz.", "target": None},
                       {"text": "old", "previous": "old", "target": {"fortune": None, "maxRegen": 2}}])
        t = req.slots[1].target
        self.assertIsNone(t.fortune)
        self.assertEqual(t.max_regen, 0)
        self.assertEqual(t.previous, "old")
        self.assertEqual(req.slots[1].text, "")

    def test_values_are_clamped(self):
        req = request([{"text": "", "target": {"fortune": 3, "maxRegen": 9, "surprise": -1}}])
        t = req.slots[0].target
        self.assertEqual((t.fortune, t.max_regen, t.surprise), (1.0, 2, 0.0))

    def test_needs_a_target(self):
        with self.assertRaises(ValueError):
            request([{"text": "Only text.", "target": None}])

    def test_one_target_per_character(self):
        req = request([{"text": "", "target": {"fortunes": [0.9, None], "tolerances": [0.05, None], "maxRegen": 2}}],
                      characters=["Bob", "Alice"])
        t = req.slots[0].target
        self.assertEqual(req.characters, ["Bob", "Alice"])
        self.assertEqual((t.fortunes, t.fortune, t.max_regen), ([0.9, None], 0.9, 2))

    def test_a_slot_with_only_a_side_character_target_is_still_controlled(self):
        req = request([{"text": "", "target": {"fortunes": [None, 0.2], "maxRegen": 1}}], characters=["Bob", "Alice"])
        t = req.slots[0].target
        self.assertTrue(t.has_target)
        self.assertEqual(t.max_regen, 1)

    def test_character_names(self):
        self.assertEqual(clean_characters(["Bob", "", "bob"]), ["Bob", "Character 2", "bob (3)"])
        self.assertEqual(clean_characters(None, " Mike "), ["Mike"])
        self.assertEqual(len(clean_characters(["A", "B", "C", "D", "E"])), 4)


class PlanTests(unittest.TestCase):
    def test_continuation_and_infilling(self):
        req = request([
            {"text": "A.", "target": None},
            target(0.2), target(0.3),
            {"text": "D.", "target": None},
            {"text": "", "target": None},  # a blank bullet that is not generated is skipped
            target(0.8),
        ])
        runs = plan_runs(req.slots)
        self.assertEqual([[s.index for s in r["slots"]] for r in runs], [[1, 2], [5]])
        self.assertEqual([r["task"] for r in runs], ["infilling", "continuation"])

    def test_infilling_alternates_between_previous_and_next(self):
        req = request([{"text": "A.", "target": None}, target(0.1), target(0.2), target(0.3), target(0.4),
                       {"text": "F.", "target": None}])
        order = sequential_order(plan_runs(req.slots)[0])
        self.assertEqual([(s.index, task) for s, task in order], [
            (1, "infill from previous"), (4, "infill from next"),
            (2, "infill from previous"), (3, "infill from next")])

    def test_infilling_without_a_beginning_goes_backwards(self):
        req = request([target(0.1), target(0.2), {"text": "C.", "target": None}])
        order = sequential_order(plan_runs(req.slots)[0])
        self.assertEqual([(s.index, task) for s, task in order], [(1, "infill from next"), (0, "infill from next")])


class BatchTests(unittest.TestCase):
    def test_sentences_within_threshold_are_not_regenerated(self):
        llm = FakeLLM(lambda s: 0.25)
        events = run(llm, request([{"text": "Mike plays jazz.", "target": None}, target(0.2), target(0.3)]))
        out = finals(events)
        self.assertEqual(sorted(out), [1, 2])
        self.assertTrue(all(len(e["attempts"]) == 1 for e in out.values()))
        self.assertEqual(llm.calls, 2)  # one generation call, one recognition call

    def test_fast_stroke_allows_one_retry_and_keeps_the_best(self):
        ratings = {"Sentence 1.": 0.9, "Sentence 2.": 0.6}
        llm = FakeLLM(lambda s: ratings.get(s, 0.5))
        out = finals(run(llm, request([target(0.1, max_regen=1)])))
        self.assertEqual([a["text"] for a in out[0]["attempts"]], ["Sentence 1.", "Sentence 2."])
        self.assertEqual(out[0]["text"], "Sentence 2.")  # error 0.5 beats 0.8

    def test_slow_stroke_allows_two_retries(self):
        ratings = {"Sentence 1.": 0.9, "Sentence 2.": 0.5, "Sentence 3.": 0.7}
        llm = FakeLLM(lambda s: ratings.get(s, 0.5))
        out = finals(run(llm, request([target(0.1, max_regen=2)])))
        self.assertEqual(len(out[0]["attempts"]), 3)
        self.assertEqual(out[0]["text"], "Sentence 2.")

    def test_retry_prompt_mentions_the_rejected_try(self):
        llm = FakeLLM(lambda s: 0.9)
        run(llm, request([target(0.1, max_regen=1)]))
        retry_prompt = [u for s, u in llm.prompts if "generation module" in s][1]
        self.assertIn("Rejected try, read as fortune 0.90, which is too good", retry_prompt)

    def test_unconstrained_slot_is_written_once(self):
        llm = FakeLLM(lambda s: 0.9)
        out = finals(run(llm, request([{"text": "A.", "target": None},
                                       {"text": "", "target": {"fortune": None}}])))
        self.assertEqual(len(out[1]["attempts"]), 1)

    def test_done_event_reports_counts(self):
        llm = FakeLLM(lambda s: 0.9)
        events = run(llm, request([target(0.1, max_regen=1), target(0.85)]))
        done = events[-1]
        self.assertEqual(done["type"], "done")
        self.assertEqual((done["written"], done["retried"], done["missing"]), (2, 1, 0))


class SeveralCharacterTests(unittest.TestCase):
    def test_leaving_out_a_character_with_a_target_is_a_miss(self):
        target = request([{"text": "", "target": {"fortunes": [0.8, 0.2]}}], characters=["Bob", "Alice"]).slots[0].target
        self.assertEqual(error_of([0.75, ABSENT], target), 1.0)
        self.assertEqual(error_of([0.75, 0.5], target), 0.3)
        self.assertEqual(error_of([0.4, ABSENT], request([{"text": "", "target": {"fortunes": [0.5, None]}}],
                                                        characters=["Bob", "Alice"]).slots[0].target), 0.1)

    def test_retry_when_a_character_is_left_out_and_keep_the_try_that_includes_it(self):
        def rate(sentence, name):
            if name == "Bob":
                return 0.85
            return None if sentence == "Sentence 1." else 0.2  # the first try leaves Alice out
        llm = FakeLLM(rate)
        events = run(llm, request([{"text": "Bob and Alice auditioned.", "target": None},
                                   {"text": "", "target": {"fortunes": [0.9, 0.15], "maxRegen": 1}}],
                                  characters=["Bob", "Alice"]))
        out = finals(events)[1]
        self.assertEqual(out["text"], "Sentence 2.")
        self.assertEqual(out["fortunes"], [0.85, 0.2])
        self.assertEqual(out["targets"], [0.9, 0.15])
        self.assertEqual([a["fortunes"] for a in out["attempts"]], [[0.85, ABSENT], [0.85, 0.2]])
        retry_prompt = [u for s, u in llm.prompts if "generation module" in s][1]
        self.assertIn("Alice was left out, but has a target", retry_prompt)

    def test_adding_a_character_rates_only_that_character(self):
        llm = FakeLLM(lambda sentence, name=None: 0.3 if name in (None, "Bob") else 0.7)
        rec = Recognizer(llm)
        item = {"context": ["One."], "sentence": "Two."}
        self.assertEqual(rec.recognize(["Bob"], [item]), [[0.3]])
        self.assertEqual(rec.recognize(["Bob", "Alice"], [item]), [[0.3, 0.7]])
        self.assertEqual(llm.calls, 2)
        self.assertIn("Rate: Alice\n", llm.prompts[1][1])
        self.assertIn("Protagonist: Bob", llm.prompts[1][1])
        rec.recognize(["Bob", "Alice"], [item])
        self.assertEqual(llm.calls, 2)  # both cached

    def test_rate_only_the_requested_characters(self):
        llm = FakeLLM(lambda sentence, name=None: 0.6)
        rows = Recognizer(llm).recognize(["Bob", "Alice"], [{"context": [], "sentence": "X.", "rate": [1]}])
        self.assertEqual(rows, [[None, 0.6]])

    def test_null_means_absent_except_for_the_protagonist(self):
        rating = {"fortunes": {"bob": None, "Alice": "absent", "Carl": "0.4"}}
        self.assertIsNone(fortune_for(rating, "Bob", True))
        self.assertEqual(fortune_for(rating, "Alice", False), ABSENT)
        self.assertEqual(fortune_for(rating, "Carl", False), 0.4)
        self.assertIsNone(fortune_for(rating, "Dana", False))  # not answered: ask again later

    def test_one_character_prompts_have_the_one_character_form(self):
        req = request([{"text": "A.", "target": None}, target(0.3)])
        lines = [("fixed", 1, "A."), ("blank", 2, req.slots[1])]
        self.assertEqual(prompts.batch_user("Mike", lines, {}), prompts.batch_user(["Mike"], lines, {}))
        self.assertIn("Story Character: Mike\n", prompts.batch_user(["Mike"], lines, {}))
        self.assertEqual(prompts.generation_system(["Mike"]), prompts.generation_system())

    def test_several_character_prompt_lists_every_target(self):
        req = request([{"text": "A.", "target": None}, {"text": "", "target": {"fortunes": [0.9, None]}}],
                      characters=["Bob", "Alice"])
        user = prompts.batch_user(req.characters, [("fixed", 1, "A."), ("blank", 2, req.slots[1])], {})
        self.assertIn("Story Characters: Bob (the protagonist) and Alice", user)
        self.assertIn("Fortune targets: Bob 0.90 (a triumph or a dream come true); Alice: no target.", user)
        self.assertIn("independent of each other", user)


class SequentialTests(unittest.TestCase):
    def test_sentences_are_written_in_the_papers_order(self):
        llm = FakeLLM(lambda s: 0.5)
        events = run(llm, request([{"text": "A.", "target": None}, target(0.5), target(0.5), target(0.5),
                                   {"text": "E.", "target": None}], mode="sequential"))
        order = [(e["slot"], e["task"]) for e in events if e["type"] == "sentence"]
        self.assertEqual(order, [(1, "infill from previous"), (3, "infill from next"), (2, "infill from previous")])
        prompts = [u for s, u in llm.prompts if "generation module" in s]
        self.assertIn("Write the FIRST missing sentence", prompts[0])
        self.assertIn("Write the LAST missing sentence", prompts[1])


class RecognitionTests(unittest.TestCase):
    def test_context_is_limited_to_three_sentences_and_cached(self):
        llm = FakeLLM(lambda s: 0.3)
        rec = Recognizer(llm)
        item = {"context": ["One.", "Two.", "Three.", "Four."], "sentence": "Five."}
        self.assertEqual(rec.recognize("Mike", [item]), [[0.3]])
        self.assertIn("Previous context: Two. Three. Four.", llm.prompts[0][1])
        rec.recognize("Mike", [item])
        self.assertEqual(llm.calls, 1)
        rec.recognize("Anna", [item])  # a different protagonist is a different question
        self.assertEqual(llm.calls, 2)

    def test_ratings_with_reasons_are_read_in_item_order(self):
        data = {"ratings": [{"item": 2, "reason": "wins", "fortune": 0.9},
                            {"item": 1, "reason": "loses", "fortune": 0.1}]}
        self.assertEqual([normalize(v) for v in ratings_of(data)], [0.1, 0.9])
        self.assertEqual(ratings_of({"fortunes": [0.2]}), [0.2])
        self.assertEqual(ratings_of({"something": 1}), [])

    def test_normalize_accepts_other_scales(self):
        self.assertEqual(normalize(0.42), 0.42)
        self.assertEqual(normalize(7), 0.7)
        self.assertEqual(normalize("85"), 0.85)
        self.assertIsNone(normalize("high"))
        self.assertEqual(normalize(-3), 0.0)


class HelperTests(unittest.TestCase):
    def test_clean_sentence(self):
        self.assertEqual(clean_sentence('3. "Mike lost his guitar."'), "Mike lost his guitar.")
        self.assertEqual(clean_sentence("BLANK: Mike  smiled.\n"), "Mike smiled.")

    def test_pick_best(self):
        a = Candidate("a", [0.9], 0.8, 1)
        b = Candidate("b", [0.4], 0.3, 2)
        self.assertIs(pick_best([a, b]), b)
        self.assertIsNone(pick_best([]))


if __name__ == "__main__":
    unittest.main()
