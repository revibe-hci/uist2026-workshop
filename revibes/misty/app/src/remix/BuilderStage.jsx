import React, { useEffect, useRef, useState } from 'react';
export default function BuilderStage({ session, use3D }) {
  const canvas = useRef(null), stage = useRef(null), latest = useRef(session);
  const [mode, setMode] = useState('flat'), [trip, setTrip] = useState(0); latest.current = session;
  useEffect(() => {
    setMode('flat');
    if (!use3D) return;
    let cancelled = false;
    import('./three-stage.js').then(({ createBuilderStage }) => {
      if (cancelled) return;
      try { stage.current = createBuilderStage(canvas.current); stage.current.update(latest.current); setMode('3d'); }
      catch { setMode('flat'); }
    }).catch(() => setMode('flat'));
    return () => { cancelled = true; stage.current?.dispose(); stage.current = null; };
  }, [use3D]);
  useEffect(() => { if (mode !== 'flat') return; const timer = setInterval(() => { if (!document.hidden) setTrip(t => t + 1); }, 4000); return () => clearInterval(timer); }, [mode]);
  useEffect(() => stage.current?.update(session), [session]);
  return <div className="rm-builders" aria-hidden="true" data-renderer={mode}>
    <div className="rm-tray rm-a"><b>A</b><span>Content blocks</span></div>
    <div className="rm-tray rm-b"><b>B</b><span>Visual blocks</span></div>
    <canvas ref={canvas} className={mode === '3d' ? '' : 'rm-hidden-canvas'} width="375" height="240" />
    {mode === 'flat' && <div className="rm-flat-stage">{['a', 'b'].map((source, index) => <div key={source} className={`rm-worker rm-${source}`}>
      <span className="rm-worker-head"><i/><i/></span><span className="rm-worker-body"/><span className="rm-carried-block">{source.toUpperCase()} · {['Button','Card','Nav','Image'][(trip + index) % 4]}</span><span className="rm-worker-feet"/>
    </div>)}<div className="rm-building-pad">{session.parts.map((p, i) => <i key={p.id} style={{ top: i * 15 }}>{p.kind}</i>)}</div></div>}
  </div>;
}
