# Diversity of the design space: measurements

How varied are the versions "Explore versions" writes? Each run explores 12
versions of the Mike opening through the app's own `/api/explore`, with fortune
and three arc dimensions left open, then re-rates every version independently
with `/api/recognize`.

    python3 -I run.py before 12 .               # needs the app on :5177 and the LLM bridge
    python3 -I analyze.py before.json
    python3 -I run.py more 12 . after.json      # "explore more": plan against an earlier batch

| File | Planner |
|---|---|
| `before.json` | 5 template shapes cycled per dimension; versions also rated their own lines |
| `after.json` | random curves chosen by farthest-point sampling; independent batch ratings |
| `more.json` | the same planner, planned against `after.json`'s rated values |

Results are summarised in `../../remixes.md` under "Update: more diverse
versions, and more of them".
