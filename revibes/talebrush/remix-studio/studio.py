"""TaleBrush Studio: the Luminate, VideoDiff and Selenite parts of the back end.

Every function here makes one call to the LLM bridge (through server.chat_json)
unless noted. server.Handler dispatches /api/luminate/*, /api/videodiff/* and
/api/selenite/* requests to handle().
"""

import json
import random
from concurrent.futures import ThreadPoolExecutor, as_completed

import server
from server import BridgeError, chat_json, clamp01, fortune_words, numbered, previous_sentences, recognize


def story_block(sentences, slots=(), targets=None):
    """Number the story, marking the slots to be written and their fortune targets."""
    targets = targets or {}
    lines = []
    for i, s in enumerate(sentences):
        if i in slots:
            t = targets.get(i)
            want = f" (fortune target {t:.2f}: {fortune_words(t)})" if t is not None else ""
            lines.append(f"{i + 1}. [[WRITE THIS SENTENCE]]{want}")
        else:
            lines.append(f"{i + 1}. {s if s and s.strip() else '(blank)'}")
    return "\n".join(lines)


def clean_sentences(raw, slots):
    out = {}
    for k, v in (raw or {}).items():
        if str(k).isdigit() and int(k) - 1 in slots and str(v).strip():
            out[int(k) - 1] = " ".join(str(v).split())
    return out


def recognize_variant(protagonist, base, sentences):
    """Fortune of each written sentence, read in the context of the variant's story."""
    full = list(base)
    for i, s in sentences.items():
        full[i] = s
    idx = sorted(sentences)
    scores = recognize(protagonist, [{"previous": previous_sentences(full, i), "sentence": full[i]} for i in idx])
    return {i: v for i, v in zip(idx, scores)}


# ================================================================ Luminate

DIMENSIONS_SYSTEM = """You are Luminate's dimension generator. A writer is exploring the DESIGN SPACE
of how a short story outline could continue. Given the story so far, its protagonist and an
optional exploration prompt, propose {n} categorical dimensions (mix nominal and ordinal)
along which the unwritten part of the story could meaningfully vary -- for example the kind
of conflict, a helper character, the setting, the tone, the style of ending. Each dimension
has 3 to 5 values of 1 to 4 words each (labels, not sentences); dimension names are 1-3 words. Do NOT propose numeric dimensions (like length) and do NOT propose
the protagonist's fortune: the writer sketches that separately.
Answer with JSON only: {{"dimensions": [{{"name": "...", "type": "nominal|ordinal", "values": ["...", "..."]}}]}}"""

VARIANT_SYSTEM = """You write one variant of a short story outline for Luminate. Fill in every line
marked [[WRITE THIS SENTENCE]] with exactly one plain, concrete sentence (10-25 words), so
the whole story reads coherently with the sentences around it. Keep the protagonist as the
main character. Meet each sentence's fortune target when one is given, and satisfy ALL the
requirements (dimension: value).
Also give the variant a short title (2-5 words), exactly 3 keywords, and a one-sentence
summary of the whole story, for viewing it at different zoom levels.
Answer with JSON only:
{"title": "...", "keywords": ["...", "...", "..."], "summary": "...", "sentences": {"<line number>": "..."}}"""


def dimensions(protagonist, sentences, prompt, n=5):
    user = (f"Protagonist: {protagonist}\nExploration prompt: {prompt or '(none)'}\n\n"
            f"STORY SO FAR:\n{numbered(sentences)}")
    out = chat_json(DIMENSIONS_SYSTEM.format(n=n), user)
    dims = []
    for d in out.get("dimensions") or []:
        vals = [str(v) for v in d.get("values", []) if str(v).strip()][:5]
        if d.get("name") and len(vals) >= 2:
            dims.append({"name": str(d["name"]), "type": d.get("type", "nominal"), "values": vals})
    return dims


def write_variant(protagonist, base, slots, targets, requirements, prompt):
    reqs = "\n".join(f"- {k}: {v}" for k, v in requirements.items()) or "- (none)"
    user = (f"Protagonist: {protagonist}\n"
            + (f"Writer's exploration prompt: {prompt}\n" if prompt else "")
            + f"Requirements:\n{reqs}\n\nSTORY:\n{story_block(base, slots, targets)}")
    out = chat_json(VARIANT_SYSTEM, user)
    sentences = clean_sentences(out.get("sentences"), set(slots))
    if not sentences:
        raise BridgeError("The model returned no sentences for a variant")
    return {
        "title": str(out.get("title") or "Untitled"),
        "keywords": [str(k) for k in (out.get("keywords") or [])][:3],
        "summary": str(out.get("summary") or ""),
        "sentences": sentences,
        "fortunes": recognize_variant(protagonist, base, sentences),
        "requirements": requirements,
    }


def requirement_lists(dims, count, fixed):
    """Luminate's requirement lists: one random value per dimension, honoring fixed values."""
    out = []
    for _ in range(count):
        req = {}
        for d in dims:
            req[d["name"]] = fixed.get(d["name"]) or random.choice(d["values"])
        out.append(req)
    return out


ADD_DIMENSION_SYSTEM = """You extend Luminate's design space with a dimension the writer named. Give it
3 to 5 short values, then say which value best describes each existing variant.
Answer with JSON only: {"values": ["..."], "assign": {"<variant id>": "<one of the values>"}}"""


def add_dimension(protagonist, name, variants):
    listing = "\n\n".join(f"Variant {v['id']}: {v.get('title', '')}\n{v.get('text', '')}" for v in variants)
    out = chat_json(ADD_DIMENSION_SYSTEM, f"Protagonist: {protagonist}\nNew dimension: {name}\n\n{listing}")
    values = [str(v) for v in out.get("values") or [] if str(v).strip()][:5]
    assign = {str(k): str(v) for k, v in (out.get("assign") or {}).items() if str(v) in values}
    return {"name": name, "type": "nominal", "values": values}, assign


# ================================================================ VideoDiff

PROMPT_SYSTEM = """You create a new variant of a short story outline for VideoDiff, which lets a
writer compare alternatives. Each variant is the same story with the lines marked
[[WRITE THIS SENTENCE]] filled in differently. Follow the writer's instruction:
- EDIT: change the base variant as instructed, keeping everything else.
- RECOMBINE: merge existing variants (referred to as #id) as instructed.
- SURPRISE: make a variant clearly different from all existing ones.
Write exactly one plain sentence per marked line. Keep the protagonist. Meet fortune targets
unless the instruction overrides them.
Also give a title (2-5 words), 3 keywords, a one-sentence summary, and "change": one
sentence describing concretely what is new compared with the variant(s) it came from.
Answer with JSON only:
{"title": "...", "keywords": ["..."], "summary": "...", "change": "...", "sentences": {"<line number>": "..."}}"""


def prompt_variant(protagonist, base, slots, targets, mode, instruction, variants, base_id):
    listing = []
    for v in variants:
        filled = [v["sentences"].get(str(i), base[i]) for i in range(len(base))]
        listing.append(f"#{v['id']} \"{v.get('title', '')}\":\n{numbered(filled)}")
    head = {"edit": f"EDIT variant #{base_id}: {instruction}",
            "recombine": f"RECOMBINE: {instruction}",
            "surprise": "SURPRISE: " + (instruction or "something unexpected")}[mode]
    user = (f"Protagonist: {protagonist}\n{head}\n\nEXISTING VARIANTS:\n" + "\n\n".join(listing)
            + f"\n\nSTORY TO FILL:\n{story_block(base, slots, targets)}")
    out = chat_json(PROMPT_SYSTEM, user)
    sentences = clean_sentences(out.get("sentences"), set(slots))
    if not sentences:
        raise BridgeError("The model returned no sentences")
    return {
        "title": str(out.get("title") or "Untitled"),
        "keywords": [str(k) for k in (out.get("keywords") or [])][:3],
        "summary": str(out.get("summary") or ""),
        "change": str(out.get("change") or ""),
        "sentences": sentences,
        "fortunes": recognize_variant(protagonist, base, sentences),
    }


# ================================================================ Selenite

CRITERIA_SYSTEM = """You are Selenite's knowledge retriever, adapted to story writing. Name the kind
of story this is (a short topic phrase), then list about {n} criteria that readers and
writers commonly consider when judging a short story of this kind: most relevant,
frequently considered, and covering a broad range of perspectives (character, plot,
world, craft). Rank them by importance. Names are 1-3 words, descriptions one sentence.
{exclude}
Answer with JSON only: {{"topic": "...", "criteria": [{{"name": "...", "description": "..."}}]}}"""

ANNOTATE_SYSTEM = """You are Selenite's reading assistant, adapted to a story outline. Given the
numbered sentences and a list of criteria:
1. For each sentence, list the criteria (exact names, 0-3, most relevant first) it addresses.
2. List the story elements encountered so far: characters, places and objects, each with
   the sentence numbers that mention it.
3. Suggest 2 criteria from the list that the story has NOT addressed yet, chosen to be
   relevant to the addressed ones but diverse from each other, each with a short reason.
Answer with JSON only:
{"sentences": {"<number>": ["criterion", ...]},
 "elements": [{"name": "...", "kind": "character|place|object", "sentences": [<numbers>]}],
 "suggest": [{"name": "...", "why": "..."}]}"""

ANALYZE_SYSTEM = """You are Selenite's "zoom in" analysis for one sentence of a story outline. Split
the sentence into consecutive phrases that together reproduce it exactly. For each phrase
say whether it is good (positive), bad (negative) or neutral for the protagonist's
fortune, and which of the given criteria it relates to (0-2 exact names).
Answer with JSON only: {"spans": [{"text": "...", "effect": "positive|negative|neutral", "criteria": ["..."]}]}"""


def criteria(protagonist, sentences, exclude, n=12):
    ex = ("Give {k} NEW criteria that are different, more diverse and still important, not "
          "in this list: " + ", ".join(exclude)).format(k=5) if exclude else ""
    out = chat_json(CRITERIA_SYSTEM.format(n=5 if exclude else n, exclude=ex),
                    f"Protagonist: {protagonist}\n\nSTORY:\n{numbered(sentences)}")
    crit = [{"name": str(c["name"]), "description": str(c.get("description", ""))}
            for c in out.get("criteria") or [] if c.get("name") and str(c["name"]) not in exclude]
    return {"topic": str(out.get("topic") or ""), "criteria": crit}


def annotate(sentences, names):
    user = f"CRITERIA: {', '.join(names)}\n\nSTORY:\n{numbered(sentences)}"
    out = chat_json(ANNOTATE_SYSTEM, user)
    valid = set(names)
    per = {}
    for k, v in (out.get("sentences") or {}).items():
        if str(k).isdigit() and 0 < int(k) <= len(sentences) and sentences[int(k) - 1].strip():
            per[int(k) - 1] = [c for c in v if c in valid][:3]
    elements = []
    for e in out.get("elements") or []:
        idx = sorted({int(n) - 1 for n in e.get("sentences", []) if str(n).isdigit() and 0 < int(n) <= len(sentences)})
        if e.get("name") and idx:
            elements.append({"name": str(e["name"]), "kind": str(e.get("kind", "object")), "sentences": idx})
    suggest = [{"name": str(s["name"]), "why": str(s.get("why", ""))}
               for s in out.get("suggest") or [] if s.get("name") in valid][:2]
    return {"sentences": {str(k): v for k, v in per.items()}, "elements": elements, "suggest": suggest}


def analyze(protagonist, sentences, index, names):
    prev = " ".join(previous_sentences(sentences, index)[-3:]) or "(none)"
    user = (f"Protagonist: {protagonist}\nCRITERIA: {', '.join(names)}\nPrevious context: {prev}\n"
            f"SENTENCE: {sentences[index]}")
    out = chat_json(ANALYZE_SYSTEM, user)
    spans = [{"text": str(s.get("text", "")), "effect": s.get("effect") if s.get("effect") in ("positive", "negative") else "neutral",
              "criteria": [c for c in s.get("criteria", []) if c in names][:2]}
             for s in out.get("spans") or [] if str(s.get("text", "")).strip()]
    return {"spans": spans}


# ================================================================ HTTP dispatch

def handle(h, path, body):
    """Return True if the path was handled. h is the server.Handler."""
    protagonist = body.get("protagonist") or "the protagonist"
    sentences = list(body.get("sentences", []))
    try:
        if path == "/api/luminate/dimensions":
            h.send_json({"dimensions": dimensions(protagonist, sentences, body.get("prompt", ""), int(body.get("n", 5)))})
        elif path == "/api/luminate/variants":
            stream_variants(h, protagonist, body)
        elif path == "/api/luminate/add-dimension":
            dim, assign = add_dimension(protagonist, body.get("name", ""), body.get("variants", []))
            h.send_json({"dimension": dim, "assign": assign})
        elif path == "/api/videodiff/prompt":
            slots = [int(i) for i in body.get("slots", [])]
            targets = {int(k): v for k, v in (body.get("targets") or {}).items() if v is not None}
            h.send_json(prompt_variant(protagonist, sentences, slots, targets, body.get("mode", "edit"),
                                       body.get("instruction", ""), body.get("variants", []), body.get("base_id")))
        elif path == "/api/selenite/criteria":
            h.send_json(criteria(protagonist, sentences, body.get("exclude", [])))
        elif path == "/api/selenite/annotate":
            h.send_json(annotate(sentences, body.get("criteria", [])))
        elif path == "/api/selenite/analyze":
            h.send_json(analyze(protagonist, sentences, int(body.get("index", 0)), body.get("criteria", [])))
        else:
            return False
    except BridgeError as e:
        h.send_json({"error": str(e)}, 502)
    return True


def stream_variants(h, protagonist, body):
    """Write `count` variants in parallel (the bridge runs up to 4 calls at once) and
    stream each one as a JSON line as soon as it is ready."""
    base = list(body.get("sentences", []))
    slots = [int(i) for i in body.get("slots", [])]
    targets = {int(k): v for k, v in (body.get("targets") or {}).items() if v is not None}
    dims = body.get("dimensions", [])
    count = max(1, min(10, int(body.get("count", 6))))
    reqs = requirement_lists(dims, count, body.get("fixed") or {})
    h.send_response(200)
    h.send_header("Content-Type", "application/x-ndjson")
    h.send_header("Cache-Control", "no-cache")
    h.end_headers()

    def emit(obj):
        h.wfile.write((json.dumps(obj) + "\n").encode())
        h.wfile.flush()

    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(write_variant, protagonist, base, slots, targets, r, body.get("prompt", ""))
                       for r in reqs]
            for f in as_completed(futures):
                try:
                    v = f.result()
                    v["sentences"] = {str(k): s for k, s in v["sentences"].items()}
                    v["fortunes"] = {str(k): s for k, s in v["fortunes"].items()}
                    emit({"type": "variant", "variant": v})
                except BridgeError as e:
                    emit({"type": "error", "message": str(e)})
        emit({"type": "done"})
    except (BrokenPipeError, ConnectionResetError):
        pass
