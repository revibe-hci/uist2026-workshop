"""Diversity experiment: explore N versions via the app, then re-rate them independently."""
import json, sys, time, math, urllib.request, statistics as st
from concurrent.futures import ThreadPoolExecutor
APP = "http://127.0.0.1:5177"
tag, n = sys.argv[1], int(sys.argv[2])
OPEN = ["Mike is a jazz guitarist who has great ambitions and devotion to music.",
        "Mike recently thought about expanding his expertise to heavy metal, thinking that mixing it with jazz would be interesting."]
DIMS = [{"id": "d1", "name": "Mike's belief in the fusion idea", "low": "convinced the blend is a dead end", "high": "fully committed to the hybrid sound"},
        {"id": "d2", "name": "Mike's standing with bandmates", "low": "isolated, cut off from the scene", "high": "trusted, in the circle of musicians"},
        {"id": "d3", "name": "Mike's financial security", "low": "broke, losing his instruments", "high": "stable income, secure place to work"}]
SETS = [{"name": "Genre", "values": ["literary realism", "magical realism", "crime noir", "comedy of manners"], "pinned": None}]
payload = {"spaceId": tag, "n": n, "name": "Mike", "title": "", "sentences": OPEN + [""] * 6,
           "slots": [{"index": i, "fortune": None, "surprise": None, "dims": {}} for i in range(2, 8)],
           "arcDims": DIMS, "settingDims": SETS}
def post(path, body, timeout=300):
    r = urllib.request.urlopen(urllib.request.Request(APP + path, json.dumps(body).encode(), {"Content-Type": "application/json"}), timeout=timeout)
    return r
if len(sys.argv) > 4:   # "explore more": plan against an earlier batch's rated values
    prev = json.load(open(sys.argv[4]))["versions"]
    payload["existing"] = [v.get("batch") or v["recognized"] for v in prev]
t0 = time.time(); versions = []
ratings, first = {}, None
for line in post("/api/explore", payload):
    m = json.loads(line)
    if m["type"] == "variant":
        versions.append(m["variant"]); first = first or time.time() - t0
    if m["type"] == "ratings": ratings[m["id"]] = m["values"]
    if m["type"] in ("error", "rating_error"): print("ERR", m, file=sys.stderr)
for v in versions: v["batch"] = ratings.get(v["id"])
print(f"{len(versions)} versions, {len(ratings)} rated, first at {first:.1f}s, all in {time.time()-t0:.1f}s", file=sys.stderr)
def rerate(v):
    sents = OPEN + [""] * 6
    for s in v["sentences"]: sents[s["index"]] = s["text"]
    return json.loads(post("/api/recognize", {"name": "Mike", "sentences": sents, "indices": list(range(2, 8)),
                                             "dims": [{"id": "fortune"}] + DIMS}).read())["values"]
with ThreadPoolExecutor(4) as ex:
    rec = list(ex.map(rerate, versions))
for v, r in zip(versions, rec): v["recognized"] = r
json.dump({"dims": ["fortune"] + [d["id"] for d in DIMS], "versions": versions}, open(f"{sys.argv[3]}/{tag}.json", "w"), indent=1)
print(f"done in {time.time()-t0:.1f}s", file=sys.stderr)
