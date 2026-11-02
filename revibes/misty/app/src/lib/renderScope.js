import React from 'react';
import { iconScope } from './icons.js';

// What rendered UI code can use, shared by the node preview and the code editor so
// both evaluate the code the same way.
//
// 3D remix: three.js and the 3D helpers (lib/three3d.jsx) load only when a UI's
// code uses them, so 2D UIs do not pay for three.js.
export const USES_3D = /<(Scene3D|Spin|Float3D|RoundedBox)\b|\buseFrame\b|\bTHREE\./;

let three = null;
let threeLoading = null;
export const isThreeLoaded = () => Boolean(three);
export const loadThree = () =>
  (threeLoading ||= import('./three3d.jsx').then((module) => {
    three = module;
    return module;
  }));

export function renderScope(code) {
  return {
    React,
    useState: React.useState,
    useEffect: React.useEffect,
    useRef: React.useRef,
    useMemo: React.useMemo,
    ...(three && USES_3D.test(code) ? three.threeScope : {}),
    ...iconScope(code),
  };
}
