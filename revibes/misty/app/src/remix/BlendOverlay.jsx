import React, { lazy, Suspense, useEffect, useState } from 'react';
import { useBlendSession, useRemix } from './context.js';
import FogCanvas from './FogCanvas.jsx';
const BuilderStage = lazy(() => import('./BuilderStage.jsx'));
export function SourceLegend({ sources }) {
  return <div className="rm-source-legend"><span className="rm-source rm-a"><b>A</b> {sources?.A || 'Source UI'} · content</span><span className="rm-source rm-b"><b>B</b> {sources?.B || 'Reference'} · visuals</span></div>;
}
export default function BlendOverlay({ nodeId, forceFlags }) {
  const session = useBlendSession(nodeId), context = useRemix();
  const flags = forceFlags || context.flags, reduced = context.reduced;
  const [dismissed, setDismissed] = useState(null);
  const [settled, setSettled] = useState(null);
  useEffect(() => {
    if (session?.phase !== 'complete') return;
    const timer = setTimeout(() => setSettled(session.run), reduced ? 0 : 1100); return () => clearTimeout(timer);
  }, [session?.phase, session?.run, reduced]);
  if (!session || settled === session.run || (!flags.fog && !flags.builders)) return null;
  const error = session.phase === 'error', complete = session.phase === 'complete';
  const hidden = dismissed === session.run;
  const title = error ? 'Blend stopped' : complete ? 'Your blend is ready' : session.phase === 'waiting' ? 'Blending your references' : session.phase === 'rendering' ? 'Checking the returned UI' : 'Revealing the rendered regions';
  return <div className={`rm-blend-overlay nodrag nopan ${reduced ? 'rm-reduced' : ''} ${error ? 'rm-failed' : ''} ${complete ? 'rm-complete' : ''} ${hidden ? 'rm-dismissed' : ''}`} data-phase={session.phase} aria-label="Blend progress">
    {!hidden && flags.fog && <FogCanvas session={session} reduced={reduced} />}
    {!hidden && flags.builders && !reduced && !error && !complete && <Suspense fallback={null}><BuilderStage session={session} use3D={flags.three} /></Suspense>}
    <div className="rm-progress" role="status" aria-live="polite" aria-atomic="true">
      <div className="rm-progress-top"><strong>{title}</strong>{!complete && <button type="button" onClick={() => setDismissed(hidden ? null : session.run)}>{hidden ? 'Show effects' : 'Hide effects'}</button>}</div>
      {error ? <p>{session.error} Your source and next-iteration notes are kept. Try Regenerate or Fix Render.</p> : <>
        <SourceLegend sources={session.sources} />
        <p>{complete ? `${session.parts.length} rendered regions revealed.` : session.phase === 'waiting' ? 'Illustrative assembly while the model runs. No partial UI has arrived yet.' : session.phase === 'rendering' ? 'The complete response arrived. Waiting for a successful preview render.' : `${session.parts.length} of ${session.regions?.length || 0} rendered regions revealed. This is a visual replay, not model generation progress.`}</p>
        {(reduced || hidden) && <small>{reduced ? 'Reduced motion · ' : ''}{session.phase === 'waiting' ? 'Waiting for the model response' : session.phase === 'rendering' ? 'Validating preview' : complete ? 'Complete' : 'Presenting available result'}</small>}
      </>}
    </div>
  </div>;
}
