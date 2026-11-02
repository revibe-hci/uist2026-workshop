// The blend pipeline owns facts; renderers only subscribe. No synthetic generation percentages.
export function createBlendEvents({ schedule = setTimeout, cancel = clearTimeout } = {}) {
  const sessions = new Map(), listeners = new Set(), timers = new Map();
  let sequence = 0, revision = 0;
  const notify = () => { revision++; listeners.forEach((fn) => fn()); };
  const clear = (id) => { (timers.get(id) || []).forEach(cancel); timers.delete(id); };
  const current = (id, run) => { const s = sessions.get(id); return s?.run === run ? s : null; };
  const write = (id, patch) => { sessions.set(id, { ...sessions.get(id), ...patch }); notify(); };
  const api = {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    getRevision() { return revision; },
    getSnapshot(id) { return sessions.get(id) || null; },
    getAll() { return [...sessions.values()]; },
    onBlendStart(id, details = {}) {
      clear(id);
      const run = ++sequence;
      sessions.set(id, { id, run, phase: 'waiting', ready: false, parts: [], startedAt: Date.now(), ...details });
      notify(); return run;
    },
    onResponseReceived(id, run, code) {
      if (current(id, run)?.phase !== 'waiting') return false;
      write(id, { phase: 'rendering', code }); return true;
    },
    onAssets(id,run,assets){const s=current(id,run);if(!s)return false;write(id,{assets:{...s.assets,...assets}});return true;},
    onPartGenerated(id, run, part, source) {
      const s = current(id, run);
      if (!s?.ready || s.phase !== 'assembling') return false;
      const entry = { ...part, source };
      write(id, { parts: [...s.parts.filter((p) => p.id !== entry.id), entry] }); return true;
    },
    onBlendComplete(id, run) {
      const s = current(id, run);
      if (!s?.ready || s.phase !== 'assembling') return false;
      clear(id); write(id, { phase: 'complete', finishedAt: Date.now() }); return true;
    },
    onBlendError(id, run, error) {
      const s = current(id, run);
      if (!s || ['complete', 'error'].includes(s.phase)) return false;
      clear(id); write(id, { phase: 'error', error: String(error?.message || error), finishedAt: Date.now() }); return true;
    },
    onPreviewRepaired(id, run, code) {
      const s = current(id, run);
      if (s?.phase !== 'error' || code === s.code || code === s.initialCode) return false;
      clear(id); sessions.delete(id); notify(); return true;
    },
    onPreviewReady(id, run, code, regions, immediate = false) {
      const s = current(id, run);
      if (s?.phase !== 'rendering' || s.code !== code) return false;
      write(id, { ready: true, phase: 'assembling', regions });
      // These are presentation events for an already-rendered result, never model token progress.
      const handles = [];
      regions.forEach((region, index) => {
        const land = () => api.onPartGenerated(id, run, region, 'A+B');
        if (immediate) land(); else handles.push(schedule(land, s.arena ? 1800 + index * 1000 : 140 + index * 160));
      });
      if (immediate) api.onBlendComplete(id, run);
      else {
        handles.push(schedule(() => api.onBlendComplete(id, run), s.arena ? Math.max(8600,2200+regions.length*1000) : 340 + regions.length * 160));
        timers.set(id, handles);
      }
      return true;
    },
    remove(id) { clear(id); sessions.delete(id); notify(); },
    dispose() { [...timers.keys()].forEach(clear); sessions.clear(); listeners.clear(); },
  };
  return api;
}

export const blendEvents = createBlendEvents();

// One layout read batch after the preview mounts. Coordinates are local to the phone viewport.
export function collectRegions(root) {
  const box = root.getBoundingClientRect(), scale = box.width / root.clientWidth || 1;
  const candidates = [...root.querySelectorAll('header, section, nav, article, button, img')];
  const regions = [];
  for (const el of candidates) {
    if (regions.some((r) => r.element.contains(el))) continue;
    const rect = el.getBoundingClientRect();
    const top = (rect.top - box.top) / scale, left = (rect.left - box.left) / scale;
    if (rect.width / scale < 36 || rect.height / scale < 20 || top >= root.clientHeight || top + rect.height / scale <= 0) continue;
    regions.push({ id: `region-${regions.length}`, kind: el.tagName.toLowerCase(), label: el.getAttribute('aria-label') || el.tagName.toLowerCase(),
      rect: { x: Math.max(0, left) / root.clientWidth, y: Math.max(0, top) / root.clientHeight,
        w: Math.min(rect.width / scale, root.clientWidth - Math.max(0, left)) / root.clientWidth,
        h: Math.min(rect.height / scale, root.clientHeight - Math.max(0, top)) / root.clientHeight }, element: el });
    if (regions.length >= 6) break;
  }
  return regions.length ? regions.map(({ element, ...r }) => r) : [
    { id: 'screen', kind: 'screen', label: 'Screen', rect: { x: 0, y: 0, w: 1, h: 1 } },
  ];
}
