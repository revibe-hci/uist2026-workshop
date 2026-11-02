import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { blendEvents } from './events.js';
export const RemixContext = createContext(null);
export const useRemix = () => useContext(RemixContext);
export function useBlendSession(id) {
  return useSyncExternalStore(blendEvents.subscribe, () => blendEvents.getSnapshot(id), () => null);
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { const mq = window.matchMedia('(prefers-reduced-motion: reduce)'); const change = () => setReduced(mq.matches); mq.addEventListener('change', change); return () => mq.removeEventListener('change', change); }, []);
  return reduced;
}
