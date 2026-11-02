- **What:** a SwiftUI app in `duo/` runs Misty on the iPhone Duo. Half-closing the phone picks how
  much of the selected blend to keep: the angle sets a level, from the original (0) to the full
  blend (one level per change category), with a preview and a progress track that follows the
  angle continuously and a haptic tick at each level; holding still selects it, and closing the phone applies it, and a level meter on the outer screen's right edge shows the level the app
  understood. Closed, the outer display shows the result at real phone width, still
  interactive, with switches to flip each change category with one thumb. The app reads the real
  hinge and crease position on iOS 27.1, keeps the picker off the crease, and follows the screen iOS
  puts it on. Tested in the iPhone Duo simulator and on an iPhone Duo (iOS 27.2) over the cable.
  A Touch / Select switch makes one-finger touch either navigate the canvas or select and drag.
  Elsewhere a hinge slider stands in. `?duo` turns this on in a browser, `?duo&demo` loads a
  recorded blend, and `npm run dev:phone` serves Misty and the bridge to the phone. See
  `duo/README.md`.
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

## Misty on a foldable iPhone

- **Who:** Leping (table 7), built with Claude Code.
- **What:** a SwiftUI app in `duo/` runs Misty on the iPhone Duo. Folding the phone scrubs the
  selected blend: it cross-fades into its parent as the phone closes, with no model calls. Closed,
  the outer display shows the selected Code Render at real phone width, and it stays interactive;
  for a blend, switches along its bottom flip each change category on or off with one thumb.
  On iOS 27.1 the app reads the real hinge and where the fold divides the screen, keeps the
  scrub's render off the crease, and follows the screen iOS puts it on. Tested in the iPhone Duo
  simulator (iOS 27.2) and on a physical iPhone Duo, over cable and eduroam. `?duo&demo` loads a
  recorded blend to fold at once. In a browser, `?duo` adds a hinge slider instead.
  `npm run dev:phone` serves Misty and the bridge to a phone on the network. On the `iphone-duo`
  branch. See `duo/README.md`.
- **Question:** does picking a blend level with the fold, and committing it by closing the phone,
  make blending feel continuous instead of all or nothing? And does then checking the result on a
  phone-sized screen, and flipping its changes there, change which blends people keep?
