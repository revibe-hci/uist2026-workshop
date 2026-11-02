import {allArcTracks} from './relationship-state.mjs';

export const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
export const copy = value => JSON.parse(JSON.stringify(value));
export const emptySlot = (text = '') => ({id: crypto.randomUUID(), text, source: 'human', fortune: null});
export const toleranceForSpeed = speed => clamp(.065 + speed * .12, .07, .27);

export function applyStroke(controls, points, count, erase = false) {
  const touched = new Set();
  const put = (x, y, speed) => {
    const index = Math.round(clamp(x) * (count - 1));
    controls[index] = erase ? null : {target: clamp(1 - y), tolerance: toleranceForSpeed(speed)};
    touched.add(index);
  };
  if (points.length === 1) put(points[0].x, points[0].y, .4);
  for (let p = 1; p < points.length; p++) {
    const a = points[p - 1], b = points[p];
    const speed = Math.hypot(b.x - a.x, b.y - a.y) * 1000 / Math.max(1, b.t - a.t);
    const steps = Math.max(1, Math.ceil(Math.abs(b.x - a.x) * count * 4));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      put(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, speed);
    }
  }
  return [...touched].sort((a, b) => a - b);
}

export function generationIndices(slots, touched) {
  return [...new Set(touched)].filter(i => i >= 0 && i < slots.length && (!slots[i].text.trim() || slots[i].source === 'ai')).sort((a,b) => a-b);
}

export function insertSlot(state, index, slot = emptySlot()) {
  state.plannedRange=[];
  state.slots.splice(index, 0, slot);
  state.controls?.splice(index, 0, null);
  for(const track of allArcTracks(state)){track.controls.splice(index,0,null);track.values.splice(index,0,null);}
  state.surprises.splice(index, 0, null);
  state.lastRange = [];
}

export function removeSlot(state, index) {
  if (state.slots.length <= 1) return;
  state.plannedRange=[];
  state.slots.splice(index, 1);
  state.controls?.splice(index, 1);
  for(const track of allArcTracks(state)){track.controls.splice(index,1);track.values.splice(index,1);}
  state.surprises.splice(index, 1);
  state.lastRange = [];
}

export function newDraft() {
  const slots = [emptySlot('Mike was a jazz guitarist with great ambitions and a deep devotion to music.'),
    emptySlot('He wanted to blend jazz with heavy metal and start a band of his own.'),
    ...Array.from({length: 8}, () => emptySlot())];
  return {title: 'A different kind of harmony', protagonist: 'Mike', slots,
    controls: Array(10).fill(null), surprises: Array(10).fill(null), lastRange: [], showSurprise: false};
}

export function arcPath(slots, point, value = slot => slot.fortune) {
  let path = '', active = false;
  slots.forEach((slot, index) => {
    const v = value(slot);
    if (v === null || v === undefined || !Number.isFinite(v)) {active = false; return;}
    const [x, y] = point(index, v);
    path += `${active ? ' L' : ' M'}${x.toFixed(2)},${y.toFixed(2)}`;
    active = true;
  });
  return path;
}
