// Foldable iPhone remix: the hinge angle drives Misty's display.
//
// Open the app with ?duo to turn this on. The angle runs from 0 (closed) to 180 (flat open).
// Inside the MistyDuo iOS shell (revibes/misty/duo), the shell's hinge slider sets it through
// window.mistyDuo.setPosture(angle). In a desktop browser, a small slider on the page sets it.
// No public API reports a foldable iPhone's hinge, so the angle is always simulated.
import { useEffect, useState } from 'react';

const params = new URLSearchParams(window.location.search);
export const DUO_MODE = params.has('duo');
// ?duo&demo starts from a recorded blend (lib/duo-demo.json), so the fold can be tried
// without a model call or any tapping. It replaces the saved canvas.
export const DEMO_MODE = DUO_MODE && params.has('demo');
export const IN_SHELL = Boolean(window.__mistyDuoShell);
if (IN_SHELL) document.documentElement.classList.add('m-duo-shell');

// Below CLOSED the phone counts as shut and the outer display takes over. Above FLAT it counts
// as open and the full canvas shows. In between, the fold scrubs the focused blend.
export const CLOSED = 15;
export const FLAT = 165;

// The shell passes its starting angle before the page runs.
let angle = Number.isFinite(window.__mistyDuoAngle) ? window.__mistyDuoAngle : 180;
const listeners = new Set();

export function setFoldAngle(value) {
  const next = Math.max(0, Math.min(180, Number(value)));
  if (Number.isNaN(next) || next === angle) return;
  angle = next;
  listeners.forEach((listener) => listener(angle));
}

// Where the fold divides the inner screen ({ x, y, width, height } in CSS pixels), or null.
// The iOS app reports it from the system on a real foldable.
let fold = null;
const foldListeners = new Set();

export function setFold(rect) {
  fold = rect && rect.width > 0 && rect.height > 0 ? rect : null;
  foldListeners.forEach((listener) => listener(fold));
}

export function useFold() {
  const [value, setValue] = useState(fold);
  useEffect(() => {
    foldListeners.add(setValue);
    setValue(fold);
    return () => foldListeners.delete(setValue);
  }, []);
  return value;
}

window.mistyDuo = { setPosture: setFoldAngle, getPosture: () => angle, setFold, getFold: () => fold };

export function useFoldAngle() {
  const [value, setValue] = useState(angle);
  useEffect(() => {
    listeners.add(setValue);
    setValue(angle);
    return () => listeners.delete(setValue);
  }, []);
  return value;
}

export const postureOf = (value) => (value < CLOSED ? 'closed' : value > FLAT ? 'open' : 'folding');

// How much of the blend shows: 1 when nearly flat, 0 when nearly shut.
export const blendAmount = (value) => Math.max(0, Math.min(1, (value - CLOSED) / (FLAT - CLOSED)));

// Haptics: a web page can't vibrate an iPhone, so the page asks the iOS app to play one.
// 'level' when the fold crosses into a new level, 'select' when holding still selects it,
// 'apply' when closing applies it. Outside the app this does nothing.
export function haptic(kind) {
  try {
    window.webkit?.messageHandlers?.mistyHaptic?.postMessage(kind);
  } catch {
    // No app to play it.
  }
}
