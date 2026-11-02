#!/usr/bin/env python3
"""TaleBrush revibe: back end.

Serves the web interface from ./static and two JSON endpoints that play the
roles of the paper's two technical modules (Section 5):

  POST /api/recognize   fortune recognition: sentence (+ previous context,
                        protagonist) -> fortune level in [0, 1]
  POST /api/generate    controlled generation: a fortune target per sentence
                        slot (+ surprise level) -> sentences, with the paper's
                        recognize-and-regenerate loop

The paper uses GPT-Neo 2.7B with trained soft prompts and a modified GeDi
(GPT2-medium). Neither the trained prompts nor the crowdsourced fortune data are
available, so both modules are substituted by prompting the language model that
answers on the workshop LLM bridge (llm-bridge/, OpenAI chat format).

Only the Python 3 standard library is used.

    python3 server.py            # uses the bridge at http://localhost:8787
    python3 server.py --stub     # no language model: canned, clearly labelled
"""
import json
import math
import os
import queue
import random
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("TALEBRUSH_PORT", "5177"))
BRIDGE = os.environ.get("BRIDGE_URL", "http://localhost:8787").rstrip("/")
STUB = "--stub" in sys.argv or os.environ.get("TALEBRUSH_STUB") == "1"
STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

# Paper, Section 5.2.2: regenerate when |y - y_hat| > 0.2, 1-2 more times.
DEFAULT_THRESHOLD = 0.2
CONTEXT_SENTENCES = 3  # Section 5.2.1: at most three previous sentences


# --------------------------------------------------------------------------
# Language model access (bridge)
# --------------------------------------------------------------------------

class ModelError(Exception):
    pass


def llm_json(system, user):
    """One chat call through the bridge, answered as a JSON object."""
    body = json.dumps({
        "model": "bridge",
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(BRIDGE + "/v1/chat/completions", data=body,
                                 headers={"Content-Type": "application/json"})
    stagger()
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        raise ModelError(f"bridge answered {e.code}: {e.read()[:300].decode(errors='replace')}")
    except (urllib.error.URLError, OSError) as e:
        raise ModelError(f"cannot reach the LLM bridge at {BRIDGE} ({e}). "
                         "Start it from the repository root: python3 llm-bridge/bridge.py claude")
    text = data["choices"][0]["message"]["content"]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            return json.loads(m.group(0))
        raise ModelError("model did not answer with JSON: " + text[:200])


_open_lock = threading.Lock()
_last_open = [0.0]


def stagger(gap=0.03):
    """Space out connections to the bridge: it queues at most 5 pending
    connections, so a burst of parallel calls would otherwise be reset."""
    with _open_lock:
        wait = _last_open[0] + gap - time.time()
        if wait > 0:
            time.sleep(wait)
        _last_open[0] = time.time()


def bridge_health():
    if STUB:
        return {"ok": True, "stub": True, "model": "STUB (no language model)"}
    try:
        with urllib.request.urlopen(BRIDGE + "/health", timeout=3) as r:
            h = json.loads(r.read())
        return {"ok": True, "stub": False, "bridge": h,
                "model": f"{h.get('backend', '?')} / {h.get('model', '?')}"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "stub": False, "error": f"LLM bridge not reachable at {BRIDGE}: {e}"}


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def clamp01(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return 0.5
    return max(0.0, min(1.0, v))


def fortune_words(v):
    if v < 0.12:
        return "terrible (disaster, loss, despair)"
    if v < 0.3:
        return "bad (setback, trouble, sadness)"
    if v < 0.43:
        return "slightly bad"
    if v <= 0.57:
        return "neutral (nothing clearly good or bad)"
    if v <= 0.7:
        return "slightly good"
    if v <= 0.88:
        return "good (progress, success, happiness)"
    return "wonderful (triumph, joy, dream come true)"


def surprise_words(s):
    if s is None:
        return None
    if s < 0.25:
        return ("LOW: completely predictable; the most ordinary, expected next event, "
                "no new characters, no twists")
    if s < 0.5:
        return "moderate: mostly expected, with one small unexpected detail"
    if s < 0.75:
        return ("HIGH: an unexpected turn the reader would not guess from the previous "
                "sentence (a sudden event, a stranger, a reveal)")
    return ("VERY HIGH: a wild, startling twist that defies expectations (a bizarre event, "
            "a shocking reveal, something almost absurd) while keeping the protagonist")


def previous_context(sentences, i):
    prev = [s for s in sentences[:i] if s and s.strip()]
    return prev[-CONTEXT_SENTENCES:]


RECOGNIZE_SYSTEM = """You are TaleBrush's fortune recognition module.
For each item you get the protagonist, up to three previous sentences of the story
(context), and a target sentence. Rate the PROTAGONIST'S FORTUNE in the target
sentence: how good or bad the protagonist's situation is at that point, as a reader
would perceive it (status, emotional and physical well-being, closeness to their goal).

Scale (real number between 0 and 1):
  0.0  extremely bad fortune (death, disaster, utter despair)
  0.25 bad fortune (failure, injury, conflict, sadness)
  0.5  neutral (setting, plans, nothing clearly good or bad)
  0.75 good fortune (progress, success, happiness)
  1.0  extremely good fortune (triumph, dream come true)
Use the whole range and two decimals. Rate the target sentence, using the context only
to understand it.
Answer with JSON only: {"scores": [{"id": <id>, "fortune": <number>}, ...]} with one
entry per item."""


def recognize_items(name, items):
    """items: [{id, context: [str], sentence: str}] -> {id: fortune}"""
    if not items:
        return {}
    if STUB:
        return {it["id"]: stub_fortune(it["sentence"]) for it in items}
    lines = [f"Protagonist: {name or 'the protagonist'}", ""]
    for it in items:
        ctx = " ".join(it["context"]) if it["context"] else "(story start)"
        lines.append(f'Item {it["id"]}:\n  Previous context: {ctx}\n  Target sentence: {it["sentence"]}')
    out = llm_json(RECOGNIZE_SYSTEM, "\n".join(lines))
    scores = {}
    for e in out.get("scores", []):
        try:
            scores[str(e["id"])] = clamp01(e["fortune"])
        except (KeyError, TypeError):
            continue
    return {it["id"]: scores.get(str(it["id"]), 0.5) for it in items}


def recognize_story(name, sentences, indices):
    items = [{"id": str(i), "context": previous_context(sentences, i), "sentence": sentences[i]}
             for i in indices if sentences[i] and sentences[i].strip()]
    res = recognize_items(name, items)
    return {int(k): v for k, v in res.items()}


GENERATE_SYSTEM = """You are TaleBrush's controlled story generation module. A writer is
co-writing a short story outline, one sentence per numbered line. Some lines are already
written; lines marked [WRITE] are slots you must fill with exactly ONE new sentence each.

Rules:
- Each slot gives a target for the PROTAGONIST'S FORTUNE (0 = terrible, 0.5 = neutral,
  1 = wonderful). The sentence must put the protagonist at that fortune level. Fortune
  should change between slots the way the targets change (going down = things get worse,
  going up = things get better). "no target" means any fortune that fits the story.
- Continue naturally from the sentences before each slot, and if written sentences come
  after a slot, lead plausibly into them (infilling).
- Keep the same protagonist; refer to them by name or pronoun. Do not introduce a new
  protagonist. If the outline lists a second protagonist, they are part of this story too:
  follow their fortune targets, and let the two protagonists' paths cross where it fits.
- If a slot gives a surprise level, follow it strictly and make the contrast obvious:
  low-surprise slots must be plain and predictable, high-surprise slots must contain an
  event the reader would never see coming. Surprise is independent of fortune: a
  surprising sentence can be good or bad luck, as its fortune target says.
- If the outline lists story settings, the whole story must follow them. If a slot gives
  targets for other story dimensions (0 = the low end, 1 = the high end, as defined in the
  outline), follow them too.
- One plain sentence per slot, 8 to 25 words, past tense unless the story uses another.
Answer with JSON only: {"sentences": [{"line": <line number>, "text": "<sentence>"}, ...]}
with one entry per [WRITE] slot."""


def level_words(v):
    return "very low" if v < 0.2 else "low" if v < 0.4 else "middle" if v <= 0.6 else "high" if v <= 0.8 else "very high"


def dim_parts(slot, arc_dims):
    parts = []
    for d in arc_dims or []:
        t = (slot.get("dims") or {}).get(d["id"])
        if t is not None:
            parts.append(f"{d['name']} {clamp01(t):.2f} ({level_words(clamp01(t))})")
    return parts


def protagonist_line(name, arc_dims):
    others = [d["person"] for d in (arc_dims or []) if d.get("person")]
    main = name or "the protagonist"
    if not others:
        return f"Protagonist: {main}"
    return (f"Protagonists: {main} (main; 'fortune' is {main}'s fortune) and "
            + ", ".join(f"{p} (second protagonist; their fortune is the dimension \"{p}'s fortune\")" for p in others))


def story_header(name, extra):
    extra = extra or {}
    lines = [protagonist_line(name, extra.get("arcDims"))]
    if extra.get("title"):
        lines.append(f"Title: {extra['title']}")
    settings = {k: v for k, v in (extra.get("settings") or {}).items() if v}
    if settings:
        lines.append("Story settings (the whole story must follow them): "
                     + "; ".join(f"{k}: {v}" for k, v in settings.items()))
    dims = [d for d in (extra.get("arcDims") or []) if not d.get("rateOnly")]
    if dims:
        lines.append("Other story dimensions (0 = low end, 1 = high end):")
        for d in dims:
            lines.append(f"- {d['name']}: 0 = {d.get('low', 'low')}, 1 = {d.get('high', 'high')}")
    return lines


def slot_line(slot, arc_dims=None):
    parts = []
    t = slot.get("target")
    if t is None:
        parts.append("fortune: no target")
    else:
        parts.append(f"fortune target {t:.2f} = {fortune_words(t)}")
    sw = surprise_words(slot.get("surprise"))
    if sw:
        parts.append(f"surprise {sw}")
    parts += dim_parts(slot, arc_dims)
    return "[WRITE] (" + "; ".join(parts) + ")"


def build_outline(name, sentences, fortunes, slots, alternatives=0, avoid=None, extra=None):
    by_index = {s["index"]: s for s in slots}
    last = max([i for i, s in enumerate(sentences) if s and s.strip()] + [s["index"] for s in slots] + [0])
    lines = story_header(name, extra) + ["", "Story outline:"]
    arc_dims = (extra or {}).get("arcDims")
    for i in range(last + 1):
        if i in by_index:
            lines.append(f"{i + 1}. {slot_line(by_index[i], arc_dims)}")
        elif i < len(sentences) and sentences[i] and sentences[i].strip():
            f = fortunes.get(i)
            tag = f"  [fortune {f:.2f}]" if f is not None else ""
            lines.append(f"{i + 1}. {sentences[i].strip()}{tag}")
        else:
            lines.append(f"{i + 1}. (left blank by the writer; ignore)")
    if avoid:
        lines += ["", "Earlier versions of these slots that the writer wants to move away from "
                  "(write something different):"]
        for i, texts in sorted(avoid.items()):
            for t in texts[:4]:
                lines.append(f"- line {i + 1}: {t}")
    if alternatives:
        lines += ["", f"Give {alternatives} different alternative sentences for EACH [WRITE] slot "
                  "(each one on its own entry, repeating the line number). Each alternative is "
                  "judged on its own, with the other lines as they are, so every alternative must "
                  "hit the slot's fortune target."]
    lines += ["", f"Random seed for variety: {random.randint(1000, 9999)}"]
    return "\n".join(lines)


def generate_once(name, sentences, fortunes, slots, alternatives=0, avoid=None, extra=None):
    """-> {index: [text, ...]}"""
    if STUB:
        return {s["index"]: [stub_sentence(name, s.get("target"), s.get("surprise"))
                             for _ in range(max(1, alternatives))] for s in slots}
    out = llm_json(GENERATE_SYSTEM, build_outline(name, sentences, fortunes, slots, alternatives, avoid, extra))
    res = {}
    for e in out.get("sentences", []):
        try:
            i = int(e["line"]) - 1
            text = str(e["text"]).strip()
        except (KeyError, TypeError, ValueError):
            continue
        if text:
            res.setdefault(i, []).append(text)
    return res


def generate(payload):
    """The paper's generation loop (Section 5.2.2):
    generate for every sketched slot, recognize the result, and regenerate the
    slots whose fortune misses the target by more than the slot's tolerance,
    up to the slot's number of retries (set by sketching speed), keeping the
    candidate with the smallest fortune error."""
    name = payload.get("name", "").strip()
    sentences = [(s or "").strip() for s in payload.get("sentences", [])]
    slots = payload.get("slots", [])
    avoid = {int(k): v for k, v in (payload.get("avoid") or {}).items()}
    extra = {"arcDims": payload.get("arcDims") or [], "settings": payload.get("settings") or {},
             "title": payload.get("title", "")}
    if not slots:
        return {"sentences": []}
    n = max(len(sentences), max(s["index"] for s in slots) + 1)
    sentences += [""] * (n - len(sentences))
    for s in slots:
        s["index"] = int(s["index"])
        s["target"] = None if s.get("target") is None else clamp01(s["target"])
        s["surprise"] = None if s.get("surprise") is None else clamp01(s["surprise"])
        s["tol"] = float(s.get("tol") or DEFAULT_THRESHOLD)
        s["retries"] = int(s.get("retries", 1))
        sentences[s["index"]] = ""  # slots are rewritten

    fortunes = {int(k): v for k, v in (payload.get("fortunes") or {}).items() if v is not None}
    calls = 0

    first = generate_once(name, sentences, fortunes, slots, avoid=avoid, extra=extra)
    calls += 1
    for s in slots:
        sentences[s["index"]] = (first.get(s["index"]) or ["..."])[0]
    idx = [s["index"] for s in slots]
    scores = recognize_story(name, sentences, idx)
    calls += 1
    attempts = {i: 1 for i in idx}

    for _round in range(2):
        bad = [s for s in slots if s["target"] is not None and s["retries"] > _round
               and abs(scores.get(s["index"], 0.5) - s["target"]) > s["tol"]]
        if not bad:
            break
        fixed_fortunes = dict(fortunes)
        for i in idx:
            if i in scores:
                fixed_fortunes[i] = scores[i]
        ctx_sentences = list(sentences)
        for s in bad:
            ctx_sentences[s["index"]] = ""
            fixed_fortunes.pop(s["index"], None)
        alts = generate_once(name, ctx_sentences, fixed_fortunes, bad, alternatives=2, extra=extra)
        calls += 1
        items = []
        for s in bad:
            i = s["index"]
            attempts[i] += 1
            for k, text in enumerate(alts.get(i, [])[:3]):
                trial = list(sentences)
                trial[i] = text
                items.append({"id": f"{i}_{k}", "context": previous_context(trial, i),
                              "sentence": text, "_i": i, "_text": text})
        rec = recognize_items(name, items)
        calls += 1
        for it in items:
            i = it["_i"]
            target = next(s["target"] for s in bad if s["index"] == i)
            if abs(rec[it["id"]] - target) < abs(scores.get(i, 0.5) - target):
                sentences[i] = it["_text"]
                scores[i] = rec[it["id"]]

    return {
        "sentences": [{"index": s["index"], "text": sentences[s["index"]],
                       "fortune": scores.get(s["index"]), "target": s["target"],
                       "attempts": attempts[s["index"]]} for s in slots],
        "calls": calls,
        "stub": STUB,
    }


def recognize(payload):
    name = payload.get("name", "").strip()
    sentences = [(s or "").strip() for s in payload.get("sentences", [])]
    indices = [int(i) for i in payload.get("indices", range(len(sentences)))]
    if payload.get("dims"):
        return recognize_dims(name, sentences, indices, payload["dims"])
    return {"scores": {str(k): v for k, v in recognize_story(name, sentences, indices).items()},
            "stub": STUB}


# --------------------------------------------------------------------------
# Remix (TaleBrush x Luminate): generated dimensions and a design space
# --------------------------------------------------------------------------
# Not in the TaleBrush paper. Dimension generation and requirement sampling
# follow Luminate (Suh et al., CHI 2024, Sections 4.1.1-4.1.2); arc dimensions
# are sketched per sentence the way TaleBrush sketches fortune.

FORTUNE_DIM = {"id": "fortune", "name": "Protagonist's fortune",
               "low": "terrible fortune (disaster, despair)", "high": "wonderful fortune (triumph, joy)"}

RECOGNIZE_DIMS_SYSTEM = """You rate sentences of a story outline on several story dimensions.
Each dimension is a 0-1 scale with a defined low end (0) and high end (1). For each item you
get up to three previous sentences (context) and a target sentence; rate the TARGET sentence on
every dimension, as a reader would perceive the story at that point. Use the whole range and
two decimals.
Answer with JSON only: {"scores": [{"id": <item id>, "values": {"<dimension id>": <number>, ...}}, ...]}"""


def missing_value(d):
    """A rating the model left out: neutral on a scale, but "no" for a rating-only flag
    such as whether the protagonists interact (0.5 would read as a false "yes")."""
    return 0.0 if d.get("rateOnly") else 0.5


def recognize_dims(name, sentences, indices, dims):
    """One call: every target sentence rated on every dimension (fortune included when asked)."""
    dims = [FORTUNE_DIM if d.get("id") == "fortune" else d for d in dims]
    items = [(i, previous_context(sentences, i), sentences[i]) for i in indices
             if i < len(sentences) and sentences[i]]
    if not items:
        return {"values": {}, "stub": STUB}
    if STUB:
        return {"values": {str(i): {d["id"]: stub_fortune(s) if d["id"] == "fortune" else round(random.random(), 2)
                                    for d in dims} for i, _, s in items}, "stub": True}
    lines = [protagonist_line(name, dims), "", "Dimensions:"]
    lines += [f"- {d['id']}: {d['name']} (0 = {d.get('low', 'low')}, 1 = {d.get('high', 'high')})" for d in dims]
    lines.append("")
    for i, ctx, s in items:
        lines.append(f"Item {i}:\n  Previous context: {' '.join(ctx) if ctx else '(story start)'}\n  Target sentence: {s}")
    out = llm_json(RECOGNIZE_DIMS_SYSTEM, "\n".join(lines))
    got = {}
    for e in out.get("scores", []):
        try:
            got[str(int(e["id"]))] = {d["id"]: clamp01(e["values"].get(d["id"], missing_value(d))) for d in dims}
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
    return {"values": {str(i): got.get(str(i), {d["id"]: missing_value(d) for d in dims}) for i, _, _ in items},
            "stub": STUB}


DIMENSIONS_SYSTEM = """You help a writer explore the design space of a short story outline,
in the style of Luminate: you propose the key dimensions along which versions of THIS story
could differ. Base them on the protagonist, title and opening sentences; make them specific to
this premise, not generic (never "creativity", "quality" or "length"). Two kinds:
- "arc" dimensions change sentence by sentence over the story and can be drawn as a curve over
  time, e.g. "Mike's confidence in the fusion idea" or "tension with the band". Do NOT propose
  the protagonist's fortune or surprise; those already exist. Give a short name (2-5 words), a
  low-end label and a high-end label (a few words each).
- "setting" dimensions hold for the whole story, e.g. genre, point of view, tone, era. Give a
  short name and 3-5 clearly distinct values.
Answer with JSON only:
{"arc": [{"name": str, "low": str, "high": str}, ...], "setting": [{"name": str, "values": [str, ...]}, ...]}"""


def dimensions(payload):
    name = payload.get("name", "").strip()
    sentences = [s.strip() for s in payload.get("sentences", []) if s and s.strip()]
    custom = (payload.get("custom") or "").strip()
    if STUB:
        if custom:
            return {"arc": [{"name": custom, "low": "low", "high": "high"}], "setting": [], "stub": True}
        return {"arc": [{"name": "Tension with others", "low": "calm", "high": "open conflict"},
                        {"name": "Confidence", "low": "doubt", "high": "certainty"}],
                "setting": [{"name": "Genre", "values": ["literary", "comedy", "noir", "magical realism"]}],
                "stub": True}
    lines = [protagonist_line(name, payload.get("arcDims"))]
    if payload.get("title"):
        lines.append(f"Title: {payload['title']}")
    lines.append("Opening sentences: " + (" ".join(sentences) if sentences else "(none yet)"))
    if custom:
        lines.append(f'\nThe writer wants one ARC dimension called "{custom}". Return only that one '
                     'in "arc" (keep its name, add low and high labels) and an empty "setting" list.')
    else:
        n_arc, n_set = int(payload.get("nArc", 3)), int(payload.get("nSetting", 3))
        lines.append(f"\nPropose {n_arc} arc dimensions and {n_set} setting dimensions.")
    out = llm_json(DIMENSIONS_SYSTEM, "\n".join(lines))
    arc = [{"name": str(d.get("name", "")).strip(), "low": str(d.get("low", "low")), "high": str(d.get("high", "high"))}
           for d in out.get("arc", []) if isinstance(d, dict) and d.get("name")]
    setting = [{"name": str(d.get("name", "")).strip(), "values": [str(v) for v in d.get("values", [])][:5]}
               for d in out.get("setting", []) if isinstance(d, dict) and d.get("name") and d.get("values")]
    return {"arc": arc, "setting": setting, "stub": STUB}


# Shapes an open arc dimension can take in a variant (Vonnegut-style story shapes).
SHAPES = {
    "rising": lambda t: 0.15 + 0.7 * t,
    "falling": lambda t: 0.85 - 0.7 * t,
    "dip": lambda t: 0.75 - 0.6 * math.sin(math.pi * t) + 0.05 * t,
    "peak": lambda t: 0.25 + 0.6 * math.sin(math.pi * t),
    "steady": lambda t: 0.5 + 0.05 * math.sin(3 * t),
}
SHAPE_NAMES = list(SHAPES)

VARIANT_SYSTEM = """You write ONE version of a short story outline for a writer who is exploring
many versions side by side. Lines already written are fixed; each line marked [WRITE] needs
exactly ONE new sentence (8 to 25 words, past tense unless the story uses another).
Follow every requirement:
- Story settings hold for the whole story.
- Per-line targets are 0-1 levels of the named dimensions (0 = low end, 1 = high end): the
  sentence must put the story at that level, and the level must change between lines the way
  the targets change. "free" means anything that fits.
- Continue from earlier lines and lead plausibly into later written lines. Keep the protagonist.
  If a second protagonist is listed, follow their fortune targets too and let the two
  protagonists' paths cross where it fits.
Then rate EVERY line of the finished outline (written and new) on every listed dimension, 0-1.
Answer with JSON only:
{"title": "<3-6 word title>", "logline": "<one sentence>",
 "lines": [{"line": <n>, "text": "<sentence, only for [WRITE] lines>", "values": {"<dimension id>": <number>, ...}}, ...]}"""

EXPLORE_SLOTS = threading.Semaphore(int(os.environ.get("TALEBRUSH_EXPLORE_SLOTS", "10")))


def balanced(options, n):
    """n picks that use every option equally often, in a fresh random order per round,
    so two dimensions sampled this way do not move in lockstep."""
    out = []
    while len(out) < n:
        block = list(options)
        random.shuffle(block)
        out += block
    return out[:n]


def plan_requirements(payload, n):
    """Luminate's requirement sampling (Section 4.1.2), made balanced: every open
    dimension takes each shape, and every free setting each value, about equally often,
    shuffled independently per dimension, so N variants spread over the space."""
    slots = payload["slots"]
    arc_dims = [FORTUNE_DIM] + list(payload.get("arcDims") or [])
    settings = payload.get("settingDims") or []
    open_dims = [d for d in arc_dims if not d.get("rateOnly") and
                 all((s.get("fortune") if d["id"] == "fortune" else (s.get("dims") or {}).get(d["id"])) is None
                        for s in slots)]
    fixed = payload.get("fixed") or {}
    shape_picks = {d["id"]: balanced(SHAPE_NAMES, n) for d in open_dims}
    value_picks = {d["name"]: balanced(d.get("values") or [""], n) for d in settings}
    reqs = []
    for v in range(n):
        shapes = {d["id"]: shape_picks[d["id"]][v] for d in open_dims}
        values = {d["name"]: d.get("pinned") or value_picks[d["name"]][v] for d in settings}
        shapes.update({k: x for k, x in (fixed.get("shapes") or {}).items() if k in shapes})
        values.update(fixed.get("settings") or {})
        reqs.append({"shapes": shapes, "settings": values})
    return reqs


def variant_once(payload, req):
    name = payload.get("name", "").strip()
    sentences = [(s or "").strip() for s in payload.get("sentences", [])]
    slots = sorted(payload["slots"], key=lambda s: int(s["index"]))
    arc_dims = [FORTUNE_DIM] + list(payload.get("arcDims") or [])
    idx = [int(s["index"]) for s in slots]
    n = max(len(sentences), max(idx) + 1)
    sentences += [""] * (n - len(sentences))
    for i in idx:
        sentences[i] = ""
    m = len(slots)
    targets = {}  # (slot index, dim id) -> target or None
    for k, s in enumerate(slots):
        t = k / (m - 1) if m > 1 else 0.5
        for d in arc_dims:
            given = s.get("fortune") if d["id"] == "fortune" else (s.get("dims") or {}).get(d["id"])
            if given is not None:
                targets[(int(s["index"]), d["id"])] = clamp01(given)
            elif d["id"] in req["shapes"]:
                targets[(int(s["index"]), d["id"])] = clamp01(SHAPES[req["shapes"][d["id"]]](t) + random.uniform(-0.05, 0.05))
            else:
                targets[(int(s["index"]), d["id"])] = None
    if STUB:
        return {"title": f"[stub] Version {random.randint(1, 99)}", "logline": "[stub] canned variant",
                "sentences": [{"index": i, "text": stub_sentence(name, targets[(i, "fortune")], None)} for i in idx],
                "values": {str(i): {d["id"]: targets[(i, d["id"])] if targets[(i, d["id"])] is not None else 0.5
                                    for d in arc_dims} for i in idx}}
    lines = story_header(name, {"title": payload.get("title"), "settings": req["settings"],
                                "arcDims": [d for d in arc_dims if d.get("person")]})
    lines.append("Dimensions (id: name, 0 = low end, 1 = high end):")
    lines += [f"- {d['id']}: {d['name']} (0 = {d.get('low', 'low')}, 1 = {d.get('high', 'high')})" for d in arc_dims]
    lines += ["", "Story outline:"]
    last = max([i for i, s in enumerate(sentences) if s] + idx)
    for i in range(last + 1):
        if i in idx:
            parts = []
            for d in arc_dims:
                if d.get("rateOnly"):
                    continue
                t = targets[(i, d["id"])]
                parts.append(f"{d['id']} {'free' if t is None else f'{t:.2f}'}")
            sur = next((s.get("surprise") for s in slots if int(s["index"]) == i), None)
            if sur is not None:
                parts.append(f"surprise {surprise_words(clamp01(sur))}")
            lines.append(f"{i + 1}. [WRITE] (" + "; ".join(parts) + ")")
        elif sentences[i]:
            lines.append(f"{i + 1}. {sentences[i]}")
        else:
            lines.append(f"{i + 1}. (blank; ignore)")
    lines += ["", f"Random seed for variety: {random.randint(1000, 9999)}"]
    out = llm_json(VARIANT_SYSTEM, "\n".join(lines))
    texts, values = {}, {}
    for e in out.get("lines", []):
        try:
            i = int(e["line"]) - 1
        except (KeyError, TypeError, ValueError):
            continue
        if i in idx and e.get("text"):
            texts[i] = str(e["text"]).strip()
        if isinstance(e.get("values"), dict):
            values[str(i)] = {d["id"]: clamp01(e["values"].get(d["id"], missing_value(d))) for d in arc_dims}
    return {"title": str(out.get("title", "")).strip() or "Untitled", "logline": str(out.get("logline", "")).strip(),
            "sentences": [{"index": i, "text": texts.get(i, "...")} for i in idx], "values": values}


def explore_stream(handler, payload):
    """Fan out N variant calls in parallel and stream each result to the browser
    as one line of JSON the moment it arrives (progressive design space)."""
    n = max(1, min(24, int(payload.get("n", 12))))
    if not payload.get("slots"):
        return handler._json(400, {"error": "no sentence slots to generate"})
    reqs = plan_requirements(payload, n)
    handler.send_response(200)
    handler.send_header("Content-Type", "application/x-ndjson")
    handler.end_headers()
    q, cancelled = queue.Queue(), threading.Event()

    def work(k, req):
        with EXPLORE_SLOTS:
            if cancelled.is_set():
                return q.put(None)
            t = time.time()
            try:
                v = variant_once(payload, req)
                v.update({"id": f"{payload.get('spaceId', 's')}-{k}", "requirement": req, "ms": int((time.time() - t) * 1000)})
                q.put({"type": "variant", "variant": v})
            except Exception as e:  # noqa: BLE001
                q.put({"type": "error", "error": str(e)})

    for k, req in enumerate(reqs):
        threading.Thread(target=work, args=(k, req), daemon=True).start()
    left = n
    while left:
        msg = q.get()
        left -= 1
        if msg is None or cancelled.is_set():
            continue
        try:
            handler.wfile.write((json.dumps(msg) + "\n").encode())
            handler.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            cancelled.set()  # the writer pressed Stop or explored again: start no more calls
    if not cancelled.is_set():
        try:
            handler.wfile.write(b'{"type": "done"}\n')
            handler.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


# --------------------------------------------------------------------------
# Stub (only with --stub: no language model available)
# --------------------------------------------------------------------------

GOOD = "win won award success happy joy love great best celebrat proud famous thrill delight succeed hired praise".split()
BAD = "lose lost broke break fail sad hurt injur die dead fire fired cry pain alone reject angry ruin crash sick cannot".split()


def stub_fortune(sentence):
    s = sentence.lower()
    g = sum(w in s for w in GOOD)
    b = sum(w in s for w in BAD)
    return clamp01(0.5 + 0.2 * (g - b))


def stub_sentence(name, target, surprise):
    who = name or "The hero"
    if target is None:
        pool = [f"{who} spent the afternoon thinking about what to do next.",
                f"{who} walked through the city without a clear plan."]
    elif target < 0.3:
        pool = [f"{who} failed badly and felt sad and alone.", f"{who} lost everything in a fire."]
    elif target < 0.6:
        pool = [f"{who} went home and made dinner.", f"{who} talked with a neighbor about the weather."]
    else:
        pool = [f"{who} won a great award and felt happy.", f"{who} had a huge success and celebrated with friends."]
    s = random.choice(pool)
    if surprise is not None and surprise > 0.6:
        s = s[:-1] + ", and then a dragon appeared."
    return "[stub] " + s


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in (self.path or ""):
            sys.stderr.write("[talebrush] " + fmt % args + "\n")

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/status"):
            return self._json(200, bridge_health())
        return super().do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return self._json(400, {"error": "bad JSON"})
        if self.path.split("?")[0] == "/api/explore":
            return explore_stream(self, payload)
        routes = {"/api/recognize": recognize, "/api/generate": generate, "/api/dimensions": dimensions}
        fn = routes.get(self.path.split("?")[0])
        if not fn:
            return self._json(404, {"error": "not found"})
        try:
            return self._json(200, fn(payload))
        except ModelError as e:
            return self._json(502, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            return self._json(500, {"error": f"{type(e).__name__}: {e}"})


def main():
    h = bridge_health()
    print(f"TaleBrush revibe on http://localhost:{PORT}")
    if STUB:
        print("STUB MODE: canned sentences and keyword fortune scores, no language model.")
    elif h["ok"]:
        print(f"LLM bridge: {BRIDGE} ({h['model']})")
    else:
        print("WARNING: " + h["error"])
        print("  Start it from the repository root:  python3 llm-bridge/bridge.py claude")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
