import React, { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Check, Trash2, Undo2 } from 'lucide-react';
import { useMisty } from '../context.js';
import { cropImage } from '../lib/image.js';

const clamp = (value) => Math.min(1, Math.max(0, value));

// An example image. Drag across it to crop a section, then drag the section out
// onto a source UI. The handle on the right starts a global blend.
function ExampleNode({ id, data, selected }) {
  const { startCropDrag, touchMode } = useMisty();
  // In Touch mode a drag over the image pans the canvas instead of selecting.
  const navigating = touchMode === 'touch';
  const frame = useRef(null);
  const [selection, setSelection] = useState(null);
  const [history, setHistory] = useState([]);
  const [locked, setLocked] = useState(false);
  const [crop, setCrop] = useState(null);
  const drawing = useRef(null);

  useEffect(() => {
    let live = true;
    if (selection) cropImage(data.image, selection).then((url) => live && setCrop(url));
    else setCrop(null);
    return () => {
      live = false;
    };
  }, [selection, data.image]);

  const point = (event) => {
    const rect = frame.current.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest('.m-crop-selection')) {
      if (crop) startCropDrag({ exampleId: id, crop, x: event.clientX, y: event.clientY });
      return;
    }
    if (locked) return;
    const start = point(event);
    drawing.current = { start, previous: selection };
    frame.current.setPointerCapture(event.pointerId);
    setSelection({ x: start.x, y: start.y, w: 0, h: 0 });
  };

  const onPointerMove = (event) => {
    if (!drawing.current) return;
    const { start } = drawing.current;
    const now = point(event);
    setSelection({
      x: Math.min(start.x, now.x),
      y: Math.min(start.y, now.y),
      w: Math.abs(now.x - start.x),
      h: Math.abs(now.y - start.y),
    });
  };

  const onPointerUp = (event) => {
    if (!drawing.current) return;
    const { previous } = drawing.current;
    drawing.current = null;
    frame.current.releasePointerCapture(event.pointerId);
    setSelection((current) => {
      if (!current || current.w < 0.03 || current.h < 0.02) return previous;
      setHistory((h) => [...h, previous]);
      return current;
    });
  };

  const undo = () => {
    setSelection(history[history.length - 1] ?? null);
    setHistory((h) => h.slice(0, -1));
  };

  const clear = () => {
    setSelection(null);
    setHistory([]);
    setLocked(false);
  };

  return (
    <div className={`m-node m-example ${selected ? 'is-selected' : ''}`}>
      <h3 className="m-node-title">{data.sketch ? 'Reference Sketch' : 'Reference Example'}</h3>
      <div
        ref={frame}
        className={`m-example-frame ${navigating ? '' : 'nodrag nopan'} ${locked ? 'is-locked' : ''}`}
        onPointerDown={navigating ? undefined : onPointerDown}
        onPointerMove={navigating ? undefined : onPointerMove}
        onPointerUp={navigating ? undefined : onPointerUp}
      >
        <img src={data.image} alt={data.name} draggable={false} />
        {selection && (
          <div
            className="m-crop-selection"
            title="Drag onto a source UI"
            style={{
              left: `${selection.x * 100}%`,
              top: `${selection.y * 100}%`,
              width: `${selection.w * 100}%`,
              height: `${selection.h * 100}%`,
            }}
          />
        )}
      </div>

      <div className="m-example-actions nodrag">
        {selection && !locked ? (
          <>
            <button className="m-soft-button" onClick={undo}>
              <Undo2 size={14} /> Undo
            </button>
            <button className="m-soft-button" onClick={() => setLocked(true)}>
              <Check size={14} /> Done
            </button>
          </>
        ) : selection && locked ? (
          <>
            <span className="m-hint">Drag the section onto a source UI</span>
            <button className="m-soft-button" onClick={clear}>
              <Trash2 size={14} /> Clear
            </button>
          </>
        ) : navigating ? (
          <span className="m-hint">Switch to Select to pick a section of this example or connect it</span>
        ) : (
          <span className="m-hint">Drag across the image to select a section, or connect the handle for a global blend</span>
        )}
      </div>
      <Handle type="source" position={Position.Right} id="out" className="m-handle m-handle-example" />
    </div>
  );
}

export default memo(ExampleNode);
