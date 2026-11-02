import React, { useEffect, useRef, useState } from 'react';
import { cleanInput } from './steering.js';
import { useRemix } from './context.js';
import { createVoiceRecorder } from './voice.js';

export function SketchOverlay({ input, drawing, onChange }) {
  const [pending, setPending] = useState(null), gesture = useRef(null);
  const strokes = cleanInput(input).strokes;
  const finish = (event) => {
    if (!gesture.current || event.pointerId !== gesture.current.pointerId) return;
    const stroke = gesture.current.points; gesture.current = null; setPending(null);
    if (stroke.length > 1) onChange({ ...input, strokes: [...strokes, stroke].slice(-40) });
  };
  return <svg className={`rm-sketch ${drawing ? 'rm-drawing' : ''} nodrag nopan nowheel`} viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label={drawing ? 'Draw next-iteration annotations on the preview' : 'Saved sketch annotations'}
    onPointerDown={e => {
      if (!drawing || e.button !== 0 || gesture.current) return;
      e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      gesture.current = { rect, pointerId: e.pointerId, points: [{ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }] };
    }} onPointerMove={e => {
      const g = gesture.current; if (!g || e.pointerId !== g.pointerId) return;
      if (g.points.length >= 500) return;
      g.points.push({ x: Math.max(0, Math.min(1, (e.clientX - g.rect.left) / g.rect.width)), y: Math.max(0, Math.min(1, (e.clientY - g.rect.top) / g.rect.height)) }); setPending([...g.points]);
    }} onPointerUp={finish} onPointerCancel={finish}>
    {[...strokes, ...(pending ? [pending] : [])].map((stroke, index) => <polyline key={index} points={stroke.map(p => `${p.x * 1000},${p.y * 1000}`).join(' ')} fill="none" stroke="#be492c" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
  </svg>;
}

export function VoiceNote({ onTranscript }) {
  const [recording, setRecording] = useState(false), [message, setMessage] = useState('');
  const recognizer = useRef(null), transcriptCallback = useRef(onTranscript); transcriptCallback.current = onTranscript;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const stop = () => recognizer.current?.stop();
  useEffect(() => () => recognizer.current?.dispose(), []);
  const start = () => {
    if (!Recognition) return;
    if (!recognizer.current) recognizer.current = createVoiceRecorder({ Recognition, onState: setRecording, onError: setMessage, onTranscript: text => { transcriptCallback.current(text); setMessage('Transcript added to your next-iteration note.'); } });
    if (recognizer.current.start()) setMessage('Listening while held…');
  };
  return <div className="rm-voice">
    <button type="button" disabled={!Recognition} aria-pressed={recording} onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); start(); }} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onKeyDown={e => { if ([' ', 'Enter'].includes(e.key) && !e.repeat) { e.preventDefault(); start(); } }} onKeyUp={e => { if ([' ', 'Enter'].includes(e.key)) { e.preventDefault(); stop(); } }} onBlur={stop}>{recording ? 'Release to finish' : 'Hold to speak'}</button>
    <small>{!Recognition ? 'Speech recognition is unavailable in this browser. Type a note instead.' : 'Optional: your browser may use its speech service for transcription.'}</small>
    {message && <p role="status">{message}</p>}
  </div>;
}

export default function WaitInput({ input = {}, onChange, drawing, setDrawing, onIterate, disabled, forceFlags }) {
  const context = useRemix(), flags = forceFlags || context.flags, [open, setOpen] = useState(false);
  const cleaned = cleanInput(input), [note, setNote] = useState(cleaned.note);
  useEffect(() => setNote(cleaned.note), [cleaned.note]);
  const saveNote = (value) => { setNote(value); onChange({ ...cleaned, note: value }); };
  return <section className="rm-wait-input nodrag nopan nowheel" aria-label="Next iteration input">
    <button type="button" className="rm-input-toggle" aria-expanded={open} onClick={() => { setOpen(!open); if (open) setDrawing(false); }}>{open ? 'Hide input' : 'Add input for the next iteration'}<span>{cleaned.strokes.length ? `${cleaned.strokes.length} marks` : ''}{cleaned.note.trim() ? ' · note saved' : ''}</span></button>
    {open && <>
      <p>Optional. These notes attach to this blend and go into its next Regenerate request, not the request already running.</p>
      <label className="rm-field-label">Next-iteration note<textarea rows="3" maxLength="4000" value={note} placeholder="e.g. Keep the title, give the cards more space…" onChange={e => saveNote(e.target.value)} /></label>
      {flags.input && <div className="rm-inline-actions"><button type="button" aria-pressed={drawing} onClick={() => setDrawing(!drawing)}>{drawing ? 'Finish sketch' : 'Draw on preview'}</button><button type="button" disabled={!cleaned.strokes.length} onClick={() => onChange({ ...cleaned, strokes: cleaned.strokes.slice(0, -1) })}>Undo mark</button><button type="button" disabled={!cleaned.strokes.length} onClick={() => onChange({ ...cleaned, strokes: [] })}>Clear sketch</button></div>}
      {drawing && <p role="status">Draw on the phone preview. Text notes provide a keyboard alternative.</p>}
      {flags.voice && <VoiceNote onTranscript={text => saveNote([note, text].filter(Boolean).join('\n').slice(0, 4000))} />}
      <div className="rm-inline-actions"><button type="button" className="rm-primary" disabled={disabled || (!cleaned.note.trim() && !cleaned.strokes.length)} onClick={onIterate}>Remix with saved input</button><small>Uses one new model request.</small></div>
    </>}
  </section>;
}
