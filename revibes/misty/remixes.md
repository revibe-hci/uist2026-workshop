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

## 3D blending

- **Who:** table 7, group 1 (built with Claude Code), on branch `misty-table7-3dui`.
- **What:** blending now reads 3D elements in a reference and rebuilds them as live 3D with
  three.js inside the generated UI, instead of flattening them into images or gradients. 3D
  elements here means rendered 3D objects, glossy or glass shapes, isometric or perspective
  scenes, 3D charts, and cards with depth.
  - A **global blend** rebuilds a reference's 3D elements and lists them under a "3D:" category
    in Applied Changes. A flat reference gets no 3D.
  - **Pick Blending Option** has a new **3D** option, which rebuilds the 3D elements of the
    selected section where it is dropped.
  - The **3D category** toggles like any other: off asks the model to remove the 3D, and on
    restores it instantly. Its material colors can be retyped in the class-change list, with
    no model call.
  - Two new **sample references** contain real 3D: "3D: product hero" and "3D: stats with 3D
    chart". The 3D in generated UIs can be dragged to rotate.
- **Question:** can a multimodal model recognise the 3D elements of a UI example and rebuild
  them as working, rotatable 3D? And does blending depth and 3D objects, not only color,
  layout and content, widen what developers can borrow from examples?
