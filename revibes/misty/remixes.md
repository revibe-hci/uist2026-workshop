# Misty remixes, table 7

Each remix changes the system on purpose, to test an idea the paper did not. Add one entry per
change: who, what changed, and what question it explores.

## Remix base

- **Who:** table 7 (prepared with Claude Code for group 1).
- **What:** starts from Kiki's revibe (group 3), with its Guided Demo. Four features were
  ported from group 1's xhigh revibe: a saved canvas with New Canvas, Shift to widen the drop
  target, color swatches in Applied Changes, Download in the code editor, and xhigh's broader
  repair rules. Reset All now also restores edited class values, and an unknown component that
  wraps content becomes a `<div>` instead of an icon, so pasted text is kept.
- **Question:** none yet; this is the common starting point.

## Fog of war during blending

- **Who:** Table 7, implemented with Codex (GPT-6).
- **What:** an independent mist view over the target preview. A small event interface connects
  request start, response arrival, successful rendering, region reveal and failure. Waiting
  animation is labeled illustrative because the bridge does not stream parts. Regions clear
  after the result renders; errors settle the mist and preserve inputs. Reduced motion has
  static progress with the same information.
- **Question:** can an atmospheric waiting view communicate uncertainty without misleading people
  about model progress?

## Geometric builder agents

- **Who:** Table 7, implemented with Codex (GPT-6).
- **What:** original round/square-headed figures carry A/B buttons, cards, navigation and image
  blocks into a miniature layout. A represents source content; B represents reference visuals.
  This is an explanation of requested roles rather than verified provenance. Three.js loads
  lazily, with a flat fallback. Builders can be demonstrated independently of fog.
- **Question:** does showing the roles of both inputs make a conceptual blend easier to understand?

## Input for the next iteration

- **Who:** Table 7, implemented with Codex (GPT-6).
- **What:** optional saved notes, preview sketch marks and push-to-talk transcription, each behind
  feature switches. They attach to a result and enter its next remix request; they never block the
  current output. Browser speech recognition substitutes for a separate transcription service,
  with permission/unsupported feedback and a text alternative.
- **Question:** can the wait become useful reflection time that improves the next iteration?

## Optional duck sounds

- **Who:** Table 7, implemented with Codex (GPT-6).
- **What:** explicit sound opt-in, quiet ambience, synthesized placement quacks and a completion
  call. Sound starts off on every launch; mute is immediate. Reduced motion and background tabs
  suppress sound. Audio requires no external files.
- **Question:** can gentle auditory feedback communicate blend activity and completion without
  demanding visual attention?

## First-time walkthrough and independent demos

- **Who:** Table 7, implemented with Codex (GPT-6).
- **What:** a Tutorial button starts a seven-step modal covering base Misty (Kiki plus group 1
  extras), this remix, A/B contributions, input, sound and recovery. Its labeled sample rehearsal
  makes no model calls and keeps the canvas intact. Remix lab exposes switches and separate
  base/fog/builders/input/sound/all preset URLs. The original Guided Demo remains available.
- **Question:** can people distinguish original system affordances from remix additions and learn
  each experience independently?

### Verification of the experience suite

- `npm test`: 15 checks pass. `npm run build`: production build succeeds with Three.js in its own
  lazy chunk. Browser checks cover fog/builders independently, the flat fallback, static reduced
  motion, sound opt-in/mute/defaults, actual preview failure/retry, keyboard focus and all seven
  tutorial steps at 375px width without changing the canvas.
- A live Codex bridge blend received a saved note and sketch. Its search placeholder matched the
  requested “Find my next trail”, and the mark remained attached. The local Claude CLI reported
  not logged in, so live verification used Codex on a separate bridge port; the shared default
  launch configuration remains compatible with Claude. Voice permission and final-transcript
  behavior are covered through a mocked native adapter; no microphone recording was made during QA.
- A visible 3D rehearsal sampled above 60fps in the local browser. This is a local observation,
  not a guarantee for all devices; DPR capping, visibility pauses and the flat/static fallbacks
  remain available.
