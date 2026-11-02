import React, { memo, useCallback, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Hammer, Loader2, Sparkles, SquareTerminal } from 'lucide-react';
import { useMisty } from '../context.js';
import AppliedChanges from './AppliedChanges.jsx';
import CodeRender from './CodeRender.jsx';
import BlendOverlay, { SourceLegend } from '../remix/BlendOverlay.jsx';
import WaitInput, { SketchOverlay } from '../remix/WaitInput.jsx';
import { useBlendSession, useRemix } from '../remix/context.js';
import { blendEvents, collectRegions } from '../remix/events.js';

function SourceNode({ id, data, selected }) {
  const { regenerate, fixRender, openCode, patchNode } = useMisty();
  const loading = data.status === 'loading';
  const hasBlend = Boolean(data.blend);
  const session = useBlendSession(id), { flags, reduced } = useRemix();
  const [drawing, setDrawing] = useState(false);
  const visualBusy = session && !['complete', 'error'].includes(session.phase);
  const hasEffects = flags.fog || flags.builders;

  const onError = useCallback(
    (error) => {
      if ((data.renderError || null) !== error) patchNode(id, { renderError: error });
      const current = blendEvents.getSnapshot(id);
      if (error && current?.code === data.code && ['rendering', 'assembling'].includes(current?.phase)) blendEvents.onBlendError(id, data.blendRunId, error);
    },
    [id, data.code, data.renderError, data.blendRunId, patchNode]
  );
  const onRendered = useCallback((root, code) => {
    const current = blendEvents.getSnapshot(id);
    if (current?.phase === 'rendering' && current.code === code) blendEvents.onPreviewReady(id, current.run, code, collectRegions(root), reduced);
    else if (current?.phase === 'error') blendEvents.onPreviewRepaired(id, current.run, code);
  }, [id, reduced]);

  return (
    <div className={`m-node m-source ${selected ? 'is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" className="m-handle m-handle-source" />
      <div className="m-source-body">
        <div className="m-render-column">
          <h3 className="m-node-title">Code Render</h3>
          {data.blendLabel && <div className="m-blend-label">{data.blendLabel}</div>}
          {hasBlend && hasEffects && <SourceLegend sources={data.blend?.sources} />}

          {(hasBlend || data.renderError) && (
            <div className="m-node-tools nodrag">
              <button
                className={`m-link ${data.renderError ? 'is-alert' : ''}`}
                disabled={loading || visualBusy || data.toggling}
                onClick={() => fixRender(id)}
              >
                <Hammer size={15} /> Fix Render
              </button>
              {hasBlend && (
                <button
                  className="m-link"
                  disabled={loading || visualBusy || data.toggling}
                  onClick={() => regenerate(id)}
                >
                  <Sparkles size={15} /> Regenerate
                </button>
              )}
            </div>
          )}

          <div className={`m-screen-frame ${(loading && !hasEffects) || data.toggling ? 'is-busy' : ''}`}>
            <CodeRender nodeId={id} code={data.code} onError={onError} onRendered={onRendered} />
            {((loading && !hasEffects) || data.toggling) && (
              <div className="m-busy">
                <Loader2 size={22} className="m-spin" />
                <span>{loading ? 'Blending…' : 'Applying your change…'}</span>
              </div>
            )}
            <BlendOverlay nodeId={id}/>
            {hasBlend && flags.input && <SketchOverlay input={data.waitInput} drawing={drawing} onChange={input => patchNode(id, { waitInput: input })}/>}
          </div>

          {hasBlend && (flags.input || flags.voice) && <WaitInput input={data.waitInput} onChange={input => patchNode(id, { waitInput: input })} drawing={drawing} setDrawing={setDrawing} onIterate={() => regenerate(id)} disabled={loading || visualBusy || data.toggling}/>}

          {data.error && <p className="m-error">{data.error}</p>}

          <button className="m-show-code nodrag" onClick={() => openCode(id)}>
            <SquareTerminal size={15} /> Show Code
          </button>
        </div>

        {hasBlend && <AppliedChanges id={id} data={data} />}
      </div>
      <Handle type="source" position={Position.Right} id="out" className="m-handle m-handle-out" isConnectable={false} />
    </div>
  );
}

export default memo(SourceNode);
