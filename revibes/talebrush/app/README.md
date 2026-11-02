# TaleBrush

A local reconstruction and user-directed remix of **TaleBrush: Sketching Stories with Generative Pretrained Language Models** (Chung et al., CHI 2022), built from the workshop's paper text and figures. Workshop identity: table 1, group 2.

## Relationships as curves

Select **Relationships** to control how one character relates to another. Choose From, To, and **Trust, Rivalry, Affection or Power**. The reverse direction is independent: Maya can distrust Mike while Mike trusts Maya. Click a graph node or arrow to select an edge, and use the sentence selector to inspect that moment in the relationship.

Draw or erase targets on the relationship timeline, using the same sentence positions as the story editor. All drawn relationships and individual character curves guide generation together. Turn off Generate after drawing to plan several edges first. Analyze arcs independently recognizes the selected relationship and all constrained curves. Green is your target; blue is recognized from actual text. Relationship steering remains approximate.

Relationships are saved in local drafts/history. Existing drafts start with no relationship curves. Removing a character removes incident edges; Undo restores them. New story clears all relationship targets and recognized values.

## Characters, dimensions, and 3D story space

- Add up to **six named characters**, with optional roles, goals and relationships. Select a character to edit their independent curves; **Edit selected** renames/removes them. Undo restores removals.
- Choose **Fortune, Mood, Confidence or Tension**, or add a **custom dimension** with low/high endpoint meanings. Up to eight dimensions are supported. Every character has separate controls for each dimension.
- **All drawn curves guide generation together**, including curves for other characters and dimensions. The expandable curve overview lists them. Opposing targets are soft constraints and can require a narrative compromise.
- Turn off **Generate after drawing** to plan several curves before one generation. Planned sentence ranges accumulate across strokes; **Generate Again** applies their union while protecting author-written sentences.
- Select **3D / nD space** for a rotatable, holographic-style perspective scene. Each numbered point is a sentence in the selected character’s dimension space. Assign any three dimensions to X/Y/Z, including custom dimensions. The axes are story attributes; sentence numbers indicate chronological order.
- Drag the background to **orbit**, use the wheel to **zoom**, or **Reset camera**. Drag a numbered point in the selected **XY, XZ or YZ plane**, holding the third axis fixed. Use the sentence selector and **all-dimension sliders** to edit higher-dimensional values with the keyboard.
- Green targets and blue recognized positions are distinct. Hollow points have at least one unset projected coordinate. Unset coordinates display the recognized value or a neutral midpoint; viewing them does not create targets. Spatial edits are staged; click **Generate Again** when ready.
- Existing drafts and histories migrate automatically. An untouched pre-remix backup is saved under the browser storage key `talebrush.reconstruction.v1.before-cast-remix`. If migration or backup fails, replacement saving is blocked to preserve the original.

## Launch

Requires Python 3.9+ and a signed-in `codex` CLI. Node 18+ is needed only for the JavaScript tests. No pip/npm installation and no API key are needed.

From the **workshop repository root**, start the shared bridge in one terminal:

```sh
python3 llm-bridge/bridge.py codex
```

In a second terminal, also starting at the repository root:

```sh
cd revibes/talebrush/app
python3 server.py
```

Open **http://localhost:5173**. Stop each process with Ctrl+C. The app binds only to localhost. Check http://localhost:8787/health; `backend` must be `codex`. The app's connection indicator means the bridge process is reachable, not that the account has permission to use its selected model.

If the app port is in use, run `python3 server.py --port 5174`. If another group owns the bridge port, use `python3 llm-bridge/bridge.py codex 8788` and start the app with `TALEBRUSH_BRIDGE_URL=http://localhost:8788 python3 server.py`.

### Working command on this laptop

The shell's older Codex CLI (0.133.0) returned `model_not_found` even for the configured model. The desktop app bundles a newer CLI (0.166.0-alpha.5.1). Using that binary through the bridge's process-local PATH fixed the failure. From the repository root, use this command for the bridge on this Mac:

```sh
PATH="/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin:$PATH" BRIDGE_MODEL=gpt-6.1-sol python3 llm-bridge/bridge.py codex
```

This uses the existing sign-in, does not modify your shell settings or the shared bridge, and requires no installation. Live recognition and a four-sentence sketch-to-story generation succeeded with this command. For other computers, the standard command above works when `codex` resolves a current, compatible CLI and the selected model is available to that account.

If model access fails, check which CLI `command -v codex` resolves, choose a model your signed-in account supports, and restart the bridge with its documented `BRIDGE_MODEL` setting. Check the bridge terminal for the underlying error. If no model is available, the workshop instructions say to ask an organizer for Codex access/credits. The app preserves your draft when a request fails and never silently invents a live response.

## Use

1. Add/select characters and dimensions using the controls above the visualization. Edit the title and opening sentences on the left. Each row is one sentence slot.
2. Draw on the fortune canvas across blank slots. The axis labels define low/high for the selected dimension; left to right follows sentence order in the 2D view. Releasing a stroke generates only the touched range. Slow drawing creates a narrower green envelope and considers three candidates rather than two.
3. Generated text and independently recognized fortune points are blue. Author-written sentences are gray. Hover over a row or graph position to link them. Blank rows break the arc. **Analyze arcs** recognizes the selected and constrained character/dimension pairs in existing text; direct edits also schedule recognition after a pause.
4. Redraw over AI sentences to replace that range, or click **Generate Again** for another version with the last range and controls. Author text is protected as context; clear a row to make it replaceable.
5. To **infill**, write an ending after several blank rows and sketch across those rows. The model receives both sides of the gap as fixed context.
6. Use **Erase** to remove fortune constraints; then **Generate Again** explores that range without a fortune target.
7. Enable **Make room for surprise** and sketch the desired surprise on the separate graph. Higher means more unexpected; changes apply at the next generation.
8. **History** overlays past arcs. Hover or keyboard-focus an entry to preview text and arc, then select it to restore the complete draft. Undo restores local actions. Browser storage retains up to 50 history entries. **Export story** saves a plain-text copy.

Enter inserts a row at the cursor, Backspace removes an empty row, and Shift+Enter makes a line break inside a row. Multiline paste creates multiple rows. The 2D canvas supports up to 30 rows; a generation can change up to 24 rows at once. Keyboard shortcuts outside text inputs: P for Draw, E for Erase. Focus a graph point and press Enter to focus its sentence.

## Substitutions and limits

The original soft-prompt-tuned GPT-Neo 2.7B and modified GeDi/GPT2-medium are replaced with two prompt-based Codex bridge requests: candidate generation, then independent fortune recognition without the target values. Candidate generation is batched, rather than sequentially regenerating/alternating infill directions. For multi-dimensional requests, a first candidate within 0.2 of every target is kept; otherwise the candidate with minimum aggregate error across constrained pairs is chosen, weighted by tolerance. Recognition covers the active and constrained pairs without receiving targets. The original one-fortune API remains compatible. Recognition context uses the first candidate at earlier generated slots, so choosing another candidate can alter that context. Surprise is an instruction, because bridge temperature settings are ignored. Pointer-speed calibration and envelope sizes are reconstruction choices. The UI labels these substitutions; model quality and the paper's experimental results are not reproduced.

The initial paper reconstruction is preserved in commit `cf51ffb`. This remix adds features explicitly requested by the group; it does not automatically run the workshop grading procedure. The requested publication branch is `talebrush-table1-group2-humaninloop`. See [DEVELOPER.md](DEVELOPER.md) for architecture and checks.
