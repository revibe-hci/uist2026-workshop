import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw, X } from 'lucide-react';
import CodeRender from '../components/CodeRender.jsx';
import BlendOverlay, { SourceLegend } from './BlendOverlay.jsx';
import WaitInput, { SketchOverlay } from './WaitInput.jsx';
import { blendEvents, collectRegions } from './events.js';
import { useBlendSession, useRemix } from './context.js';
import { useModalFocus } from './modal.js';

const SOURCE = `() => <main className="min-h-full bg-white text-slate-800 p-5"><header className="mb-5"><p className="text-xs">SOURCE A</p><h1 className="text-2xl font-bold">Fuji</h1><p>Photographer, collector, explorer.</p></header><section className="mb-5"><h2 className="font-bold">Contact</h2><p>San Francisco</p><p>fuji@example.com</p></section><section><h2 className="font-bold mb-3">Interests</h2>{['Film camera','Lofi music','Mid-century furniture','Music production'].map(t=><article key={t} className="border rounded-lg p-3 mb-2">{t}</article>)}</section><nav className="mt-5 text-xs">Profile · Explore · Saved</nav></main>`;
const RESULT = `() => <main className="min-h-full bg-[#edf4f1] text-[#243e36] p-5"><header className="mb-5 rounded-2xl bg-[#d1e4d9] p-5"><p className="text-xs uppercase tracking-widest">A little inspiration</p><h1 className="text-3xl font-bold mt-2">Fuji</h1><p className="text-sm mt-2">Photographer, collector, explorer.</p></header><section className="mb-5 rounded-xl bg-white p-4"><h2 className="font-bold">Contact</h2><p>San Francisco</p><p>fuji@example.com</p></section><section><h2 className="font-bold mb-3">Interests</h2><div className="grid grid-cols-2 gap-3">{['Film camera','Lofi music','Mid-century furniture','Music production'].map(t=><article key={t} className="rounded-xl bg-white p-4 text-sm border border-[#b9d4c4]">{t}</article>)}</div></section><nav className="mt-5 rounded-xl bg-[#243e36] text-white p-4 text-xs">Profile · Explore · Saved</nav></main>`;
const STEPS = [
  { title: 'Two layers, one workspace', owner: 'BASE + REMIX', body: 'System 1 is the Misty base: Kiki’s canvas, image examples, React source previews and blend tools, plus group 1’s saved canvas, color controls, Download and repair rules. System 2 is this Table 7 remix: fog, geometric builders, optional wait-time input, duck sounds and this tutorial.', action: 'The original Guided Demo still teaches the base interactions. This walkthrough leaves your canvas untouched.' },
  { title: 'Know what comes from A and B', owner: 'BASE MISTY', body: 'A is your editable source UI: it supplies your text, data and context. B is the screenshot or sketch: it inspires visual style and layout. Connect an example to a source for a global blend, or drop a cropped region and choose aspects for a local blend.', action: 'A/B colors and letters represent those requested roles. They are not a verified attribution of every generated pixel.' },
  { title: 'Fog makes the wait visible', owner: 'REMIX · FOG', body: 'Start a blend and mist covers its target preview. The current bridge returns one complete response. Waiting motion is illustrative; it never claims that a partial interface has arrived. After the result renders, its available regions are revealed in sequence.', action: 'Play the visual rehearsal. It uses a bundled sample and costs no model calls.' },
  { title: 'Builders explain the two inputs', owner: 'REMIX · BUILDERS', body: 'The round-headed A builder carries content blocks from the left tray. The square-headed B builder carries visual blocks from the right. Both bring pieces into the center. These figures are original geometric designs. Three.js loads only when this view needs it.', action: 'Use Builders alone in Remix lab to compare it with fog. Reduced motion uses the same source labels and static progress.' },
  { title: 'Save an idea while you wait', owner: 'REMIX · OPTIONAL INPUT', body: 'Enable Notes + sketch or Push-to-talk in Remix lab. Add a short note, draw on the phone, or hold to speak when your browser supports it. Your input belongs to this blend, survives dismissal, and is sent with its next Regenerate request.', action: 'Try a sample note here. Rehearsal input stays in this tutorial; real canvas notes are saved with their result node.' },
  { title: 'Ducks are strictly opt-in', owner: 'REMIX · OPTIONAL SOUND', body: 'Sound starts off every time you open the app. Enabling it adds quiet ambience during blending, a soft synthesized quack when pieces land and a completion call. Mute works immediately. Reduced motion pauses sounds too.', action: 'You choose whether to enable sound. Voice recording never starts automatically.' },
  { title: 'A result, or a clear recovery path', owner: 'BASE + REMIX', body: 'When rendering succeeds, mist clears and the result stays available with Applied Changes and Show Code. If generation or rendering fails, builders stop and the mist settles with the error. Your original source and saved input remain. Use Regenerate or Fix Render.', action: 'Try Simulate failure, then Replay. On the canvas, hide visual effects any time without cancelling the request.' },
];

export function Rehearsal({ step, manual = false }) {
  const id = `rehearsal-${useId()}`, run = useRef(null), pending = useRef(null);
  const { reduced, flags: configured } = useRemix();
  const [code, setCode] = useState(SOURCE), [input, setInput] = useState({}), [drawing, setDrawing] = useState(false);
  const session = useBlendSession(id);
  const replay = useCallback(() => {
    clearTimeout(pending.current); setCode(SOURCE);
    run.current = blendEvents.onBlendStart(id, { sources: { A: 'Fuji profile', B: 'Sage cards' }, rehearsal: true, manual });
    if (!manual) pending.current = setTimeout(() => { blendEvents.onResponseReceived(id, run.current, RESULT); setCode(RESULT); }, 4000);
  }, [id, manual]);
  useEffect(() => { replay(); return () => { clearTimeout(pending.current); blendEvents.remove(id); }; }, [replay]);
  const ready = useCallback((root, renderedCode) => { blendEvents.onPreviewReady(id, run.current, renderedCode, collectRegions(root), reduced); }, [id, reduced]);
  const error = useCallback((e, renderedCode) => { const s = blendEvents.getSnapshot(id); if (e && s?.code === renderedCode && ['rendering','assembling'].includes(s.phase)) blendEvents.onBlendError(id, run.current, e); }, [id]);
  const flags = { fog: manual || step !== 3, builders: manual || step !== 2, three: configured.three };
  return <div className={`rm-rehearsal ${manual ? 'rm-rehearsal-all' : ''}`}>
    <div className="rm-rehearsal-heading"><span>VISUAL REHEARSAL · SAMPLE RESULT</span><span>No model calls</span></div>
    <div className="rm-rehearsal-layout"><div>
    <div className="rm-rehearsal-phone"><CodeRender nodeId={id} code={code} onRendered={ready} onError={error}/><BlendOverlay nodeId={id} forceFlags={flags}/><SketchOverlay input={input} drawing={drawing} onChange={setInput}/></div>
    <div className="rm-inline-actions">{manual && <button type="button" className="rm-primary" disabled={session?.phase !== 'waiting'} onClick={() => { setDrawing(false); blendEvents.onResponseReceived(id, run.current, RESULT); setCode(RESULT); }}>Reveal sample result</button>}<button type="button" onClick={replay}><RotateCcw size={14}/> Replay</button><button type="button" onClick={() => { clearTimeout(pending.current); if (!session || ['error','complete'].includes(session.phase)) run.current = blendEvents.onBlendStart(id, { sources: { A: 'Fuji profile', B: 'Sage cards' }, rehearsal: true }); blendEvents.onBlendError(id, run.current, 'Rehearsal: the model connection failed.'); }}>Simulate failure</button>{step === 6 && <button type="button" onClick={() => { clearTimeout(pending.current); run.current = blendEvents.onBlendStart(id, { sources: { A: 'Fuji profile', B: 'Sage cards' }, rehearsal: true }); const broken = '() => <main>{MistyMissingDemoValue}</main>'; blendEvents.onResponseReceived(id, run.current, broken); setCode(broken); }}>Try render failure</button>}</div>
    </div>
    {(manual || step === 4) && <WaitInput forceFlags={{ input: true, voice: true }} input={input} drawing={drawing} setDrawing={setDrawing} onChange={setInput} disabled defaultOpen={manual} sample onIterate={() => {}}/>}
    </div>
  </div>;
}
export default function RemixTutorial({ onClose, onBaseDemo }) {
  const [step, setStep] = useState(0), ref = useRef(null), title = useId();
  const { sound, toggleSound, soundError, reduced } = useRemix();
  useModalFocus(ref, onClose);
  useEffect(() => { const body = ref.current?.querySelector('.rm-tutorial-body'); if (body) body.scrollTop = 0; }, [step]);
  const current = STEPS[step];
  return <div className="rm-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} className="rm-tutorial rm-dialog" role="dialog" aria-modal="true" aria-labelledby={title}>
      <header><div><span className="rm-eyebrow">MISTY · FIRST-TIME WALKTHROUGH</span><h2 id={title}>{current.title}</h2></div><button type="button" className="rm-close" aria-label="Close tutorial" onClick={onClose}><X size={20}/></button></header>
      <div className="rm-tutorial-body"><div className="rm-tutorial-copy"><span className="rm-owner">{current.owner}</span><p>{current.body}</p><p className="rm-info">{current.action}</p>
        {step === 0 && <button type="button" onClick={() => { onClose(); onBaseDemo?.(); }}>Open the base Guided Demo</button>}
        {step === 5 && <><button type="button" aria-pressed={sound} onClick={toggleSound}>{sound ? 'Mute duck sounds' : 'Enable duck sounds'}</button>{soundError && <p role="status">{soundError}</p>}</>}
        <ol className="rm-step-list" aria-label="Walkthrough steps">{STEPS.map((s, i) => <li key={s.title}><button type="button" aria-current={step === i ? 'step' : undefined} onClick={() => setStep(i)}><span>{i + 1}</span>{s.title}</button></li>)}</ol>
      </div><div className="rm-tutorial-visual">
        {step < 2 ? <div className="rm-input-explainer"><SourceLegend sources={{ A: 'Your source', B: 'Your reference' }}/><div className="rm-source-pair"><div className="rm-source-sample rm-a"><b>A</b><h3>Fuji</h3><p>Your name.<br/>Your interests.<br/>Your content.</p><span>Editable code</span></div><div className="rm-source-sample rm-b"><b>B</b><div className="rm-example-card"/><div className="rm-example-row"/><div className="rm-example-row"/><span>Screenshot / sketch</span></div></div><p>Canvas, branching results, Applied Changes and code editing come from the base. The animated waiting experience is the remix.</p></div> : <Rehearsal key={step} step={step}/>}
        {reduced && <p className="rm-info">Reduced motion is active in this preview.</p>}
      </div></div>
      <footer><span>Step {step + 1} of {STEPS.length}</span><div><button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={15}/> Back</button><button type="button" className="rm-primary" onClick={() => step === STEPS.length - 1 ? onClose() : setStep(step + 1)}>{step === STEPS.length - 1 ? 'Try it on the canvas' : 'Next'}<ArrowRight size={15}/></button></div></footer>
    </section>
  </div>;
}
