import React, { useCallback, useEffect, useRef, useState } from 'react';
import { blendEvents } from './events.js';
import { createDuckSound } from './sound.js';
import './remix.css';

import { RemixContext, useReducedMotion } from './context.js';
import { PRESETS, DEFAULT_FLAGS as defaults } from './flags.js';

export function RemixProvider({ children }) {
  const [flags, setFlags] = useState(() => {
    const preset = new URLSearchParams(location.search).get('remix');
    if (PRESETS[preset]) return PRESETS[preset];
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('misty-remix-flags') || '{}') }; } catch { return defaults; }
  });
  const [sound, setSound] = useState(false), [soundError, setSoundError] = useState('');
  const [tutorialOpen, setTutorialOpen] = useState(false), [labOpen, setLabOpen] = useState(false);
  const systemReduced = useReducedMotion(), reduced = systemReduced || !!flags.reduceMotion, audio = useRef(null);
  const updateFlags = useCallback((patch) => setFlags(f => { const next = { ...f, ...patch }; try { localStorage.setItem('misty-remix-flags', JSON.stringify(next)); } catch {} return next; }), []);
  const toggleSound = async () => {
    if (sound) { audio.current?.dispose(); audio.current = null; setSound(false); return; }
    if (audio.current) return;
    if (reduced) { setSoundError('Duck sounds are paused while reduced motion is enabled.'); return; }
    try { const next = createDuckSound(); audio.current = next; await next.enable(); if (audio.current !== next) return; setSound(true); setSoundError(''); }
    catch (e) { audio.current?.dispose(); audio.current = null; setSoundError(e.message); }
  };
  useEffect(() => {
    if (!sound || reduced) { audio.current?.dispose(); audio.current = null; if (reduced) setSound(false); return; }
    const seen = new Map();
    const update = () => {
      const sessions = blendEvents.getAll(); let waiting = false;
      for (const s of sessions) {
        waiting ||= ['waiting', 'rendering', 'assembling'].includes(s.phase);
        const previous = seen.get(s.id);
        if (previous?.run === s.run && s.parts.length > previous.count) audio.current?.quack('place');
        if (s.phase === 'complete' && previous?.phase !== 'complete') audio.current?.quack('complete');
        seen.set(s.id, { run: s.run, phase: s.phase, count: s.parts.length });
      }
      if (waiting && !document.hidden) audio.current?.startAmbient(); else audio.current?.stopAmbient();
    };
    // Seed completed sessions silently: enabling sound never replays old completions.
    blendEvents.getAll().forEach(s => seen.set(s.id, { run: s.run, phase: s.phase, count: s.parts.length }));
    const unsubscribe = blendEvents.subscribe(update); document.addEventListener('visibilitychange', update); update();
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', update); audio.current?.stopAmbient(); };
  }, [sound, reduced]);
  useEffect(() => () => audio.current?.dispose(), []);
  return <RemixContext.Provider value={{ flags, updateFlags, reduced, sound, toggleSound, soundError, tutorialOpen, setTutorialOpen, labOpen, setLabOpen }}>{children}</RemixContext.Provider>;
}
