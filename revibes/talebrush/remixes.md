# TaleBrush remix: characters, dimensions and spatial interaction

2026-11-02, table 1, group 2. Built by Codex from the existing paper reconstruction, at the group's explicit request. Original implementation retained in commit `cf51ffb`.

## Changes requested by the group

1. More dimensions than fortune: Fortune, Mood, Confidence, Tension, plus user-defined dimensions with named low/high endpoints.
2. More characters than Mike: add, describe, select, rename and remove named characters, each with independent saved curves.
3. A 3D or higher-dimensional hologram-like manipulation space: orbitable/zoomable perspective scene, three selectable axes, numbered sentence points, plane-constrained point dragging and sliders for all dimensions.
4. Push finished work to `talebrush-table1-group2-humaninloop`.

## Question explored

How does story co-creation change when authors plan multiple characters' states together, and manipulate a sentence directly in attribute space instead of only drawing one attribute over chronological time?

## Implementation

All drawn character/dimension targets are combined in generation. A separate recognition call scores actual sentences without the targets; candidate selection minimizes error across the constrained pairs. The 3D and 2D views edit the same track arrays. Extra dimensions can be projected onto any axis and edited directly through the all-dimension panel. Manual planning accumulates changed sentence ranges across curves and points. The full cast, targets and scores are saved in local drafts/history, with migration and an untouched backup of the original saved workspace.

The 3D holographic appearance is a browser-rendered perspective visualization. Model steering/recognition remains an approximate Codex bridge substitution for the paper's trained models. The shared bridge and workshop paper/rubric are unchanged.

## Validation

Node/Python tests cover migration, storage failures, independent curves, row alignment, custom endpoints, opposing character values, joint generation, target-free recognition, 3D projection and inverse dragging, bounds and point picking. Browser checks preserve the existing eight-sentence draft and seven histories, add Maya and Trust, set custom spatial axes, and drag a point in XY while keeping Z fixed. A live generation from spatial targets produced a sentence where Mike succeeds confidently while Maya is doubtful, tense and reluctant to trust him, without changing the eight prior sentences.

## Relationships as curves (additional remix)

The group selected directional relationship curves from the proposed remix directions and approved trust, rivalry, affection and power. A new Relationships view selects source/target characters through selectors and a directed graph, sketches independent reciprocal curves, and shows targets versus recognized scores at a selected sentence. All constrained edges are used in generation alongside individual state curves.

Question explored: can authors express asymmetric social dynamics more directly through directed curves than through isolated character attributes? The implementation retains the original draft/history, extends aligned track lifecycle to relational edges, and does not reinterpret existing custom individual Trust dimensions. Tests cover directed independence, lifecycle/migration, invalid endpoints and target-free joint scoring.

Validation for the relationship extension: 25 Node tests and 17 Python tests pass. Browser checks confirm reciprocal curve isolation, persisted targets, graph direction controls and switching from relationship to individual curves. A bounded live generation produced independently recognized trust values of 0.98 for Mike → Maya and 0.20 for Maya → Mike, alongside the individual controls; it was run against a test draft, leaving the saved story unchanged.
