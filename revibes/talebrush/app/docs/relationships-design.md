# Relationships as curves

Approved by the group on 2026-11-02: directional trust, rivalry, affection and power curves, selected through a character graph, with all drawn relationships guiding generation alongside individual character dimensions.

Add a Relationships view alongside 2D curves and 3D/nD space. Source and target selectors define the direction; swapping them selects an independent curve. A clickable directed graph shows the cast and chosen pair. A sentence selector shows how the relationship changes through story time. Use the existing sketch canvas for targets, tolerance envelopes and independently recognized relationship values. Supply Draw/Erase controls for this view. Single-character drafts show an add-character hint.

Store optional relationshipTracks separately from individual tracks, keyed rel:sourceId:targetId:type. Each has characterId, targetCharacterId, dimensionId (trust/rivalry/affection/power), controls and values arrays aligned with slots. Old schema-2 and schema-1 drafts default to an empty map; no old dimension changes meaning. activeRelationshipKey selects one pair/type. Names and IDs remain stable through history. Removal of a character removes incident relationships, and Undo restores them. Renaming either endpoint invalidates recognition for affected edges. Insert/delete, text edits, New story and score application cover both track maps.

The backend validates directed endpoints, prohibits self-relations, validates keys/types and array lengths, and rejects malformed values. Generation includes all drawn relational targets together with existing targets. Independent recognition receives source and target identities, relationship meanings and actual text/context, never targets. Candidate selection scores joint error. Reciprocal edges remain independent; unmentioned relationships carry forward when context supports it, otherwise remain neutral.

Tests cover directional independence, migration, row alignment, incident-edge cleanup, target-free recognition, joint controls and malformed endpoints. Browser verification covers selecting/swapping pairs, sketching and erasing, graph navigation, reload/history and one small live generation. This is a user-directed remix; no rubric is accessed.

Implementation: relationship-state.mjs owns domain helpers and migration hooks (with tracks/core integration); backend extends multi_story.py; relationships.mjs owns selectors/graph/curve presentation; app.mjs connects it to generation and history. Independent state and backend work can be delegated while the controller implements UI. Run all Node/Python tests, syntax checks and browser QA before committing.

## Verification commands

- `node --test tests/*.test.mjs` (25 tests)
- `python3 -m unittest discover -s tests -v` (17 tests)
- JavaScript syntax checks for all static modules and Python compilation.
- Browser reciprocal target isolation, reload, cross-view navigation and live recognition; one bounded backend generation with opposing reciprocal targets.

Individual-only requests retain the existing first-candidate acceptance threshold. Requests containing relational controls select the minimum aggregate normalized error across all constrained individual and relationship curves.
