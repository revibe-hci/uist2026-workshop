import json, sys, math, statistics as st
from collections import Counter
SHAPES = {"rising": lambda t: 0.15 + 0.7 * t, "falling": lambda t: 0.85 - 0.7 * t,
          "dip": lambda t: 0.75 - 0.6 * math.sin(math.pi * t) + 0.05 * t, "peak": lambda t: 0.25 + 0.6 * math.sin(math.pi * t),
          "steady": lambda t: 0.5 + 0.05 * math.sin(3 * t)}
def shape_of(seq):
    f, l, lo, hi = seq[0], seq[-1], min(seq), max(seq)
    if hi - lo < 0.2: return "steady"
    ilo, ihi = seq.index(lo), seq.index(hi)
    if 0 < ilo < len(seq) - 1 and f - lo > .2 and l - lo > .2: return "dip"
    if 0 < ihi < len(seq) - 1 and hi - f > .2 and hi - l > .2: return "peak"
    return "rising" if l >= f else "falling"
data = json.load(open(sys.argv[1])); dims = data["dims"]; V = data["versions"]
slots = list(range(2, 8)); m = len(slots)
def series(v, d, src):
    if src == "requested":
        if "curves" in v["requirement"]:
            return v["requirement"]["curves"].get(d)
        sh = v["requirement"]["shapes"].get(d)
        return [SHAPES[sh](k / (m - 1)) for k in range(m)] if sh else None
    vals = v["values"] if src == "self" else v["recognized"] if src == "recognized" else v.get("batch") or {}
    return [vals.get(str(i), {}).get(d, float("nan")) for i in slots]
print(f"{len(V)} versions. Per dimension: within-story swing (max-min), across-version spread (mean std per sentence),")
print("error vs requested target (MAE), shape match vs requested, distinct realised shapes, share of values in the middle band 0.35-0.65\n")
for d in dims:
    print(f"== {d}")
    req = [series(v, d, "requested") for v in V]
    srcs = ["requested", "batch", "recognized"] if "curves" in V[0]["requirement"] else ["requested", "self", "recognized"]
    for src in srcs:
        S = [series(v, d, src) for v in V]
        swing = st.mean(max(s) - min(s) for s in S)
        spread = st.mean(st.pstdev([S[k][j] for k in range(len(S))]) for j in range(m))
        mae = st.mean(abs(a - b) for s, r in zip(S, req) for a, b in zip(s, r))
        match = sum(shape_of(s) == shape_of(r) for s, r in zip(S, req)) / len(V)
        shapes = Counter(shape_of(s) for s in S)
        mid = sum(.35 <= x <= .65 for s in S for x in s) / (len(S) * m)
        print(f"  {src:10s} swing {swing:.2f}  spread {spread:.2f}  MAE {mae:.2f}  shape-match {match:4.0%}  middle {mid:4.0%}  shapes {dict(shapes)}")
# combos actually realised (recognized) across dims
combos = Counter(tuple(shape_of(series(v, d, 'recognized')) for d in dims) for v in V)
print(f"\nDistinct realised shape combinations (recognized, {len(dims)} dims): {len(combos)} of {len(V)}")
print("Settings used:", Counter(v["requirement"]["settings"].get("Genre") for v in V))
import itertools
def plan_dist(a, b):
    sq = [(x - y) ** 2 for d in dims for x, y in zip(series(a, d, "recognized"), series(b, d, "recognized"))]
    return math.sqrt(sum(sq) / len(sq))
nn = [min(plan_dist(a, b) for b in V if b is not a) for a in V]
print("Nearest-neighbour distance between versions (recognized, all dims): mean", round(st.mean(nn), 3), "min", round(min(nn), 3))
if V[0].get("batch"):
    agree = st.mean(abs(series(v, d, "batch")[j] - series(v, d, "recognized")[j]) for v in V for d in dims for j in range(m))
    print("Batch rating (3 versions per call) vs one-story rating: mean |diff|", round(agree, 3))
print("Mean call time:", round(st.mean(v["ms"] for v in V) / 1000, 1), "s")
