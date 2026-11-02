"""TaleBrush Studio backend: TaleBrush's fortune recognition and controlled generation,
remixed with Misty (blending, semantic diff), Luminate (design-space variants),
VideoDiff (comparing, editing and recombining variants) and Selenite (story guide).

The paper's back end is a Flask REST API in front of GPT-Neo (soft prompts) and
a modified GeDi. Here the same two modules -- recognition and generation -- are
served over a small REST API (Python standard library only), and each model call
goes through the workshop LLM bridge (an OpenAI-compatible endpoint).

Run from the repository root or from this folder:
    python3 revibes/talebrush/remix-studio/server.py   # http://localhost:5059
Environment:
    TALEBRUSH_PORT   port for this server (default 5059)
    BRIDGE_URL       LLM bridge base URL (default http://localhost:8787)
    REQUIRE_API_KEY  "1" on a deployed copy: never use the bridge, only a visitor's key
    LLM_MODEL        model used with a visitor's key (default claude-haiku-5-5)

A visitor can paste their own Anthropic API key in the page (the "API key" button).
The browser sends it with each request (X-Api-Key); the server uses it for that
request only and never stores or logs it. Using a key needs `pip install anthropic`.
"""

import contextvars
import json
import os
import re
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# When run as a script this module is __main__; let studio.py's `import server` find
# this copy rather than load a second one with its own API_KEY.
sys.modules.setdefault("server", sys.modules[__name__])

HERE = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(HERE, "static")
PORT = int(os.environ.get("TALEBRUSH_PORT", "5059"))
BRIDGE_URL = os.environ.get("BRIDGE_URL", "http://localhost:8787").rstrip("/")
# On Vercel (VERCEL is set there) there is no bridge, so only visitors' keys are used.
REQUIRE_KEY = os.environ.get("REQUIRE_API_KEY") == "1" or bool(os.environ.get("VERCEL"))
DEFAULT_MODEL = os.environ.get("LLM_MODEL", "claude-haiku-5-5")
MODELS = ("claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5")
# The visitor's key and model for the current request (set in Handler.do_POST).
# Context variables, so studio.py's worker threads can carry them over.
API_KEY = contextvars.ContextVar("api_key", default=None)
API_MODEL = contextvars.ContextVar("api_model", default=None)

# Paper, Section 5.2.2: regenerate when |y - y_hat| > 0.2, keep the closest.
REGEN_THRESHOLD = 0.2
# Paper, Section 5.2.1: recognition looks at up to three previous sentences.
RECOGNITION_CONTEXT = 3


# ---------------------------------------------------------------- LLM access

class BridgeError(Exception):
    pass


def chat_json(system, user):
    """One model call, parsed as a JSON object: with the visitor's API key if they
    gave one, otherwise through the workshop bridge."""
    if API_KEY.get():
        text = anthropic_text(API_KEY.get(), system, user)
    elif REQUIRE_KEY:
        raise BridgeError("Add your Anthropic API key first: press 🔑 API key at the top of the editor.")
    else:
        text = bridge_text(system, user)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise BridgeError("Model did not return JSON: " + text[:200])
        return json.loads(m.group(0))


def anthropic_text(key, system, user):
    """One Messages API call with the visitor's key."""
    try:
        import anthropic
    except ImportError:
        raise BridgeError("Using an API key needs the Anthropic SDK: pip install anthropic")
    model = API_MODEL.get() or DEFAULT_MODEL
    client = anthropic.Anthropic(api_key=key, max_retries=3)
    kw = dict(model=model, max_tokens=16000,
              output_config={"effort": "low"},  # short JSON answers; keeps each call fast
              system=system + "\n\nRespond with one JSON object and nothing else.",
              messages=[{"role": "user", "content": user}])
    try:
        if model == "claude-haiku-5-5":
            r = client.messages.create(**kw)
        else:  # Sonnet and Opus: if a safety classifier declines, retry on a fallback model
            r = client.beta.messages.create(betas=["server-side-fallback-2026-07-01"],
                                            fallbacks="default", **kw)
    except anthropic.AuthenticationError:
        raise BridgeError("The API key was rejected. Check it with 🔑 API key.")
    except anthropic.PermissionDeniedError:
        raise BridgeError(f"This API key cannot use {model}.")
    except anthropic.RateLimitError:
        raise BridgeError("Rate limited by the Anthropic API. Wait a moment and try again.")
    except anthropic.APIStatusError as e:
        raise BridgeError(f"Anthropic API error {e.status_code}: {e.message}")
    except anthropic.APIConnectionError:
        raise BridgeError("Could not reach the Anthropic API.")
    if r.stop_reason == "refusal":
        raise BridgeError("The model declined this request.")
    return "".join(b.text for b in r.content if b.type == "text")


def bridge_text(system, user):
    """One chat completion through the workshop LLM bridge."""
    body = json.dumps({
        "model": "bridge",
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(BRIDGE_URL + "/v1/chat/completions", data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            data = json.loads(r.read())
    except urllib.error.URLError as e:
        raise BridgeError(f"LLM bridge not reachable at {BRIDGE_URL} ({e}). "
                          "Start it with: python3 llm-bridge/bridge.py claude, "
                          "or add an Anthropic API key with 🔑 API key.")
    return data["choices"][0]["message"]["content"]


def clamp01(v):
    try:
        return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError):
        return 0.5


# ---------------------------------------------------------------- recognition

RECOGNIZE_SYSTEM = """You are TaleBrush's fortune recognition module.
For each item, estimate the protagonist's FORTUNE in the target sentence: the level of
'goodness' or 'badness' of the fortune experienced by the protagonist, as perceived by
readers. It is affected by the character's status, emotional and physical well-being,
and their spatial, mental and emotional proximity to their goal.
Score on a 0 to 1 scale, using these calibration points:
  0.0  extremely bad fortune (disaster, grave loss, despair)
  0.25 bad fortune (setback, worry, failure)
  0.5  neutral (ordinary description, nothing good or bad happens)
  0.75 good fortune (progress, small win, happiness)
  1.0  extremely good fortune (triumph, dream fulfilled, great joy)
Judge only the target sentence; previous context is there to resolve who and what it
refers to. Use the full range and two decimals.
Answer with JSON only: {"fortunes": [<number per item, in order>]}"""


def recognize(protagonist, items):
    """items: list of {"previous": [str, ...], "sentence": str} -> list of floats."""
    if not items:
        return []
    lines = []
    for i, it in enumerate(items, 1):
        prev = " ".join(it["previous"][-RECOGNITION_CONTEXT:]) or "(none)"
        lines.append(f"Item {i}\nPrevious Context: {prev}\n"
                     f"Protagonist: {protagonist}\nSentence: {it['sentence']}")
    out = chat_json(RECOGNIZE_SYSTEM, "\n\n".join(lines))
    scores = out.get("fortunes") if isinstance(out, dict) else None
    if not isinstance(scores, list):
        scores = [out.get("fortune", 0.5)] if isinstance(out, dict) else []
    scores = [clamp01(s) for s in scores]
    while len(scores) < len(items):
        scores.append(0.5)
    return scores[:len(items)]


def previous_sentences(sentences, index):
    """Non-empty sentences before `index`, nearest last."""
    return [s for s in sentences[:index] if s and s.strip()]


# ---------------------------------------------------------------- generation

def fortune_words(v):
    if v < 0.12: return "extremely bad fortune (disaster, grave loss, despair)"
    if v < 0.3:  return "bad fortune (a setback, failure or distress)"
    if v < 0.42: return "somewhat bad fortune (a minor problem or worry)"
    if v < 0.58: return "neutral fortune (nothing especially good or bad happens)"
    if v < 0.7:  return "somewhat good fortune (a small improvement)"
    if v < 0.88: return "good fortune (success, progress, happiness)"
    return "extremely good fortune (triumph, a dream fulfilled, great joy)"


def surprise_words(s):
    # Substitution: the paper maps surprise to softmax temperature; the bridge
    # ignores temperature, so the level is expressed in the instruction instead.
    if s < 0.2: return "very predictable: the most expected, natural next event"
    if s < 0.4: return "fairly predictable, following naturally from the context"
    if s < 0.6: return "somewhat unexpected, with a fresh detail"
    if s < 0.8: return "surprising: an unexpected turn or new element"
    return "wildly surprising: a bizarre, startling twist nobody would expect"


GENERATE_SYSTEM = """You are TaleBrush's story generation module. You write exactly ONE new
sentence of a short, simple story outline (like the ROCStories corpus: plain, concrete,
one event per sentence, about 10-25 words). Keep the given protagonist as the main
character and do not introduce a different protagonist. Write only the new sentence.
It must move the story forward with a NEW event; never repeat or paraphrase a sentence
that is already in the story.
Answer with JSON only: {"sentence": "<the new sentence>"}"""


def generation_prompt(task, protagonist, prev_ctx, next_ctx, fortune, surprise, prev_fortune, blend=None):
    """Mirror the paper's input layouts (Figure 9) as discrete prompts."""
    prev_txt = " ".join(prev_ctx) or "(the story has not started yet)"
    next_txt = " ".join(next_ctx)
    if task == "continuation":
        parts = [f"Beginning Story: {prev_txt}", f"Story Character: {protagonist}",
                 "Continue Story: write the next sentence that directly follows the beginning."]
    elif task == "infill_prev":
        parts = [f"Story Character: {protagonist}", f"Ending Story: {next_txt}",
                 f"Beginning Story: {prev_txt}",
                 "Infilled Story: write the sentence that comes RIGHT AFTER the beginning "
                 "story; more sentences may follow before the ending."]
    else:  # infill_next
        parts = [f"Story Character: {protagonist}", f"Beginning Story: {prev_txt}",
                 f"Ending Story: {next_txt}",
                 "Infilled Story: write the sentence that comes RIGHT BEFORE the ending "
                 "story and leads into it; more sentences may come between the beginning and it."]
    if fortune is None:
        parts.append("Fortune: unconstrained -- let the story go wherever fits best.")
    else:
        line = (f"Fortune control: in the new sentence {protagonist} must experience "
                f"{fortune_words(fortune)} -- level {fortune:.2f} on a 0 (worst) to 1 (best) scale.")
        if prev_fortune is not None:
            line += f" The preceding sentence was at {prev_fortune:.2f}"
            if fortune - prev_fortune > 0.15:
                line += (", so the fortune must clearly RISE: something good must happen to "
                         f"{protagonist} in this sentence, even if the story was going badly.")
            elif prev_fortune - fortune > 0.15:
                line += (", so the fortune must clearly FALL: something bad must happen to "
                         f"{protagonist} in this sentence, even if the story was going well.")
            else:
                line += ", so keep the fortune at about the same level."
        parts.append(line)
    parts.append(f"Surprise: the sentence should be {surprise_words(surprise)}.")
    parts += blend_lines(blend, protagonist)
    return "\n".join(parts)


def generate_one(task, protagonist, prev_ctx, next_ctx, fortune, surprise, prev_fortune, avoid, blend=None):
    user = generation_prompt(task, protagonist, prev_ctx, next_ctx, fortune, surprise, prev_fortune, blend)
    if avoid:
        user += "\nDo not reuse these earlier attempts: " + " | ".join(avoid)
    out = chat_json(GENERATE_SYSTEM, user)
    s = (out.get("sentence") if isinstance(out, dict) else "") or ""
    return " ".join(str(s).split())


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def generate_slot(sentences, fortunes, slot, task, protagonist, target):
    """Generate one sentence with the regenerate-and-pick-closest loop."""
    prev_ctx = previous_sentences(sentences, slot["index"])
    if task == "continuation":
        next_ctx = []
    else:
        next_ctx = [s for s in sentences[slot["index"] + 1:] if s and s.strip()]
    prev_fortune = None
    for j in range(slot["index"] - 1, -1, -1):
        if sentences[j] and sentences[j].strip():
            prev_fortune = fortunes[j]
            break
    fortune = target.get("fortune")
    surprise = clamp01(target.get("surprise", 0.3))
    tries = 1 if fortune is None else 1 + max(0, min(2, int(target.get("regen", 1))))
    existing = {norm(s) for s in sentences if s and s.strip()}
    candidates = []
    attempts = 0
    while len(candidates) < tries and attempts < tries + 2:
        attempts += 1
        text = generate_one(task, protagonist, prev_ctx, next_ctx, fortune, surprise,
                            prev_fortune, [c["text"] for c in candidates], target.get("blend"))
        if not text or norm(text) in existing:
            continue  # empty or a copy of a sentence already in the story
        rec = recognize(protagonist, [{"previous": prev_ctx, "sentence": text}])[0]
        err = None if fortune is None else abs(rec - fortune)
        candidates.append({"text": text, "fortune": rec, "error": err})
        if err is None or err <= REGEN_THRESHOLD:
            break
    if not candidates:
        raise BridgeError("Model returned an empty sentence")
    best = min(candidates, key=lambda c: c["error"] or 0)
    return best, candidates


def generation_order(sentences, target_indices):
    """Yield (index, task) in the order the paper's pipeline would fill them.

    Runs of target slots with no written sentence after them are continued left
    to right. Runs followed by a written sentence are infilled, alternating
    'infill from previous' (front of the gap) and 'infill from next' (back of
    the gap), as in Section 5.2.2.
    """
    targets = sorted(set(target_indices))
    runs, run = [], []
    for i in targets:
        if run and i != run[-1] + 1:
            runs.append(run)
            run = []
        run.append(i)
    if run:
        runs.append(run)
    target_set = set(targets)
    for run in runs:
        later = [j for j in range(run[-1] + 1, len(sentences))
                 if j not in target_set and sentences[j] and sentences[j].strip()]
        if not later:
            for i in run:
                yield i, "continuation"
            continue
        lo, hi, front = 0, len(run) - 1, True
        while lo <= hi:
            if front:
                yield run[lo], "infill_prev"
                lo += 1
            else:
                yield run[hi], "infill_next"
                hi -= 1
            front = not front


# ---------------------------------------------------------------- Misty: blending

def blend_lines(blend, protagonist):
    """Prompt lines for the aspects picked in the 'Pick Blending Option' dialog.

    The 'arc' aspect never reaches the server: the client turns it into a sketch,
    so TaleBrush's own fortune control carries it out.
    """
    if not blend:
        return []
    aspects = set(blend.get("aspects", []))
    name = blend.get("name") or "an example story"
    out = []
    if "events" in aspects and blend.get("example_sentence"):
        out.append(f"Blend events: borrow the event of this sentence from {name}, adapted to "
                   f"{protagonist} and this story's world (do not copy names or wording): "
                   f"\"{blend['example_sentence']}\"")
    if "style" in aspects and blend.get("example_text"):
        out.append(f"Blend tone & style: write in the tone, voice and imagery of {name}: "
                   f"\"{blend['example_text'][:900]}\"")
    if "custom" in aspects and blend.get("custom"):
        ref = blend.get("example_sentence") or blend.get("example_text", "")[:400]
        out.append(f"Blend from {name}: {blend['custom']} (example: \"{ref}\")")
    return out


EXAMPLE_SYSTEM = RECOGNIZE_SYSTEM.split("Answer with JSON only")[0] + """
You are given a whole example story, one numbered sentence per line. First identify its
protagonist, then score the protagonist's fortune in every sentence, using the earlier
sentences as context.
Answer with JSON only: {"protagonist": "<name>", "fortunes": [<number per sentence, in order>]}"""


def split_sentences(text):
    text = " ".join(text.split())
    # A sentence runs up to . ! or ? (plus any closing quote) followed by a capital or the end.
    parts = re.findall(r".+?[.!?][\"”’']?(?=\s+[A-Z“\"']|\s*$)|.+$", text)
    out = []
    for p in (p.strip() for p in parts):
        if out and re.search(r"\b(Mr|Mrs|Ms|Dr|St|Jr|Sr)\.$", out[-1]):
            out[-1] += " " + p  # an abbreviation, not the end of a sentence
        elif p:
            out.append(p)
    return out


def analyze_example(text):
    sentences = split_sentences(text)[:24]
    if not sentences:
        return {"protagonist": "", "sentences": [], "fortunes": []}
    numbered = "\n".join(f"{i + 1}. {s}" for i, s in enumerate(sentences))
    out = chat_json(EXAMPLE_SYSTEM, numbered)
    fortunes = [clamp01(v) for v in (out.get("fortunes") or [])]
    fortunes = (fortunes + [0.5] * len(sentences))[:len(sentences)]
    return {"protagonist": str(out.get("protagonist") or ""), "sentences": sentences,
            "fortunes": fortunes}


# ---------------------------------------------------------------- Misty: semantic diff

DIFF_SYSTEM = """You compare two versions of a short story outline (numbered sentences) and
summarize the change as a SEMANTIC DIFF: 2 to 5 groups of changes described by their
meaning for the story (events, characters, setting, tone, the protagonist's fortune),
not by wording. Each group lists the sentence numbers (from the AFTER version) that
realize it. A sentence may belong to more than one group. Labels are short (3-7 words),
details one sentence.
Answer with JSON only:
{"changes": [{"label": "...", "detail": "...", "sentences": [<1-based numbers>]}]}"""


def numbered(sentences):
    return "\n".join(f"{i + 1}. {s if s.strip() else '(blank)'}" for i, s in enumerate(sentences))


def semantic_diff(protagonist, before, after, changed):
    user = (f"Protagonist: {protagonist}\n\nBEFORE:\n{numbered(before)}\n\nAFTER:\n{numbered(after)}\n\n"
            f"Sentences rewritten or added: {', '.join(str(i + 1) for i in changed)}")
    out = chat_json(DIFF_SYSTEM, user)
    changes = []
    for k, c in enumerate(out.get("changes") or []):
        idx = sorted({int(n) - 1 for n in c.get("sentences", [])
                      if str(n).lstrip("-").isdigit() and 0 < int(n) <= len(after)} & set(changed))
        if c.get("label") and idx:
            changes.append({"id": f"c{k}", "label": str(c["label"]),
                            "detail": str(c.get("detail", "")), "sentences": idx})
    return changes


REVISE_SYSTEM = """You revise a short story outline according to a semantic diff. Each change is
marked KEEP, REMOVE (undo this change: replace it with something neutral that fits the
story, as if the change never happened) or REPLACE (realize the new description
instead). Rewrite ONLY the sentences listed as editable, one sentence each, keeping
the protagonist, the plain outline style, and all KEEP changes intact. Keep each
sentence's good or bad fortune for the protagonist unless the change itself is about
fortune.
Answer with JSON only: {"sentences": {"<number>": "<rewritten sentence>", ...}}"""


def revise(protagonist, sentences, changes, disabled, edited, editable):
    lines = []
    for c in changes:
        nums = ", ".join(str(i + 1) for i in c["sentences"])
        if c["id"] in disabled:
            lines.append(f"- REMOVE: {c['label']} ({c['detail']}) [sentences {nums}]")
        elif edited.get(c["id"]):
            lines.append(f"- REPLACE: {c['label']} ({c['detail']}) -> NEW: {edited[c['id']]} [sentences {nums}]")
        else:
            lines.append(f"- KEEP: {c['label']} ({c['detail']}) [sentences {nums}]")
    user = (f"Protagonist: {protagonist}\n\nSTORY:\n{numbered(sentences)}\n\nSEMANTIC DIFF:\n"
            + "\n".join(lines) + f"\n\nEditable sentences: {', '.join(str(i + 1) for i in editable)}")
    out = chat_json(REVISE_SYSTEM, user)
    result = {}
    for k, v in (out.get("sentences") or {}).items():
        if str(k).isdigit() and int(k) - 1 in editable and str(v).strip():
            result[int(k) - 1] = " ".join(str(v).split())
    return result


# ---------------------------------------------------------------- HTTP layer

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=STATIC, **kw)

    def log_message(self, fmt, *args):
        if "/api/" in str(args[0] if args else ""):
            sys.stderr.write("%s\n" % (fmt % args))

    def read_json(self):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(n) or b"{}")

    def send_json(self, obj, status=200):
        data = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/api/health":
            info = {"ok": True, "require_key": REQUIRE_KEY, "models": MODELS, "default_model": DEFAULT_MODEL}
            if REQUIRE_KEY:
                return self.send_json(info)
            try:
                with urllib.request.urlopen(BRIDGE_URL + "/health", timeout=3) as r:
                    bridge = json.loads(r.read())
            except Exception as e:  # noqa: BLE001
                bridge = {"error": str(e)}
            return self.send_json({**info, "bridge_url": BRIDGE_URL, "bridge": bridge})
        return super().do_GET()

    def do_POST(self):
        API_KEY.set(self.headers.get("X-Api-Key") or None)
        model = self.headers.get("X-Llm-Model")
        API_MODEL.set(model if model in MODELS else None)
        try:
            body = self.read_json()
        except json.JSONDecodeError:
            return self.send_json({"error": "bad JSON"}, 400)
        if self.path == "/api/recognize":
            return self.handle_recognize(body)
        if self.path == "/api/generate":
            return self.handle_generate(body)
        try:
            if self.path == "/api/example":
                return self.send_json(analyze_example(body.get("text", "")))
            if self.path == "/api/diff":
                after = body.get("after", [])
                changed = [i for i in body.get("changed", []) if 0 <= i < len(after)]
                return self.send_json({"changes": semantic_diff(
                    body.get("protagonist") or "the protagonist", body.get("before", []), after, changed)})
            if self.path == "/api/revise":
                return self.handle_revise(body)
        except BridgeError as e:
            return self.send_json({"error": str(e)}, 502)
        import studio  # Luminate, VideoDiff and Selenite endpoints
        if studio.handle(self, self.path, body):
            return
        self.send_json({"error": "not found"}, 404)

    def handle_recognize(self, body):
        """body: {protagonist, sentences: [str], indices: [int]} -> {fortunes: {i: v}}"""
        sentences = body.get("sentences", [])
        indices = [i for i in body.get("indices", [])
                   if 0 <= i < len(sentences) and sentences[i].strip()]
        items = [{"previous": previous_sentences(sentences, i), "sentence": sentences[i]}
                 for i in indices]
        try:
            scores = recognize(body.get("protagonist") or "the protagonist", items)
        except BridgeError as e:
            return self.send_json({"error": str(e)}, 502)
        self.send_json({"fortunes": {str(i): s for i, s in zip(indices, scores)}})

    def handle_revise(self, body):
        """Re-derive the story from the generated (base) version with some semantic
        changes switched off or edited; re-recognize the rewritten sentences."""
        protagonist = body.get("protagonist") or "the protagonist"
        sentences = list(body.get("sentences", []))
        changes = body.get("changes", [])
        disabled = set(body.get("disabled", []))
        edited = body.get("edited", {}) or {}
        touched = {i for c in changes if c["id"] in disabled or edited.get(c["id"])
                   for i in c["sentences"]}
        editable = sorted(i for i in touched & set(body.get("editable", []))
                          if 0 <= i < len(sentences))
        if not editable:
            return self.send_json({"sentences": {}, "fortunes": {}})
        rewritten = revise(protagonist, sentences, changes, disabled, edited, editable)
        for i, s in rewritten.items():
            sentences[i] = s
        idx = sorted(rewritten)
        scores = recognize(protagonist, [{"previous": previous_sentences(sentences, i),
                                          "sentence": sentences[i]} for i in idx])
        self.send_json({"sentences": {str(i): sentences[i] for i in idx},
                        "fortunes": {str(i): v for i, v in zip(idx, scores)}})

    def handle_generate(self, body):
        """Stream one JSON line per generated sentence.

        body: {protagonist, sentences: [str], fortunes: [float|null],
               targets: [{index, fortune: float|null, regen: 1|2, surprise: 0..1}]}
        """
        protagonist = body.get("protagonist") or "the protagonist"
        sentences = list(body.get("sentences", []))
        fortunes = list(body.get("fortunes", [None] * len(sentences)))
        targets = {t["index"]: t for t in body.get("targets", [])}
        n = max([len(sentences)] + [i + 1 for i in targets])
        sentences += [""] * (n - len(sentences))
        fortunes += [None] * (n - len(fortunes))
        for i in targets:  # target slots are rewritten, so they are not context
            sentences[i], fortunes[i] = "", None

        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        def emit(obj):
            self.wfile.write((json.dumps(obj) + "\n").encode())
            self.wfile.flush()

        order = list(generation_order(sentences, targets.keys()))
        try:
            emit({"type": "start", "order": [{"index": i, "task": t} for i, t in order]})
            for k, (i, task) in enumerate(order):
                emit({"type": "progress", "index": i, "task": task, "step": k + 1, "of": len(order)})
                best, cands = generate_slot(sentences, fortunes, {"index": i}, task,
                                            protagonist, targets[i])
                sentences[i], fortunes[i] = best["text"], best["fortune"]
                emit({"type": "sentence", "index": i, "task": task, "text": best["text"],
                      "fortune": best["fortune"], "target": targets[i].get("fortune"),
                      "tries": len(cands)})
            emit({"type": "done"})
        except BridgeError as e:
            emit({"type": "error", "message": str(e)})
        except (BrokenPipeError, ConnectionResetError):
            pass  # the writer stopped the generation


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"TaleBrush running at http://localhost:{PORT}  (LLM bridge: {BRIDGE_URL})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
