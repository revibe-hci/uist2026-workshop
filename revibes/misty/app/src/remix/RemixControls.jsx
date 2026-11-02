import React, { useId, useRef, useState } from 'react';
import { BookOpen, FlaskConical, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { useRemix } from './context.js';
import { PRESETS } from './flags.js';
import { useModalFocus } from './modal.js';
import RemixTutorial from './RemixTutorial.jsx';
import RemixPreview from './RemixPreview.jsx';

const options = [
  ['fog', 'Fog of war', 'Soft mist over a blending result.'],
  ['builders', 'Builder agents', 'Original geometric workers carry A/B blocks.'],
  ['three', '3D builders', 'Load Three.js only when builders are shown.'],
  ['input', 'Notes + sketch', 'Save directions for the next iteration.'],
  ['voice', 'Push-to-talk', 'Optional browser transcription into your note.'],
  ['tutorial', 'Tutorial button', 'A first-time walkthrough with base/remix credits.'],
  ['reduceMotion', 'Reduce motion for this demo', 'A static preview; system reduced motion always takes precedence.'],
];
function Lab({ onClose, onPreview }) {
  const { flags, updateFlags, reduced, sound, toggleSound, soundError, setTutorialOpen } = useRemix(), ref = useRef(null), title = useId();
  useModalFocus(ref, onClose);
  return <div className="rm-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><section ref={ref} className="rm-lab rm-dialog" role="dialog" aria-modal="true" aria-labelledby={title}>
    <header><div><span className="rm-eyebrow">TABLE 7 · INDEPENDENT DEMOS</span><h2 id={title}>Remix lab</h2></div><button type="button" className="rm-close" aria-label="Close remix lab" onClick={onClose}><X size={18}/></button></header>
    <p>Each effect can run on its own. Choose a preset, or mix the switches below. Your canvas is preserved.</p>
    <div className="rm-preset-list">{Object.keys(PRESETS).map(name => <div key={name}><button type="button" onClick={() => { updateFlags(PRESETS[name]); if (sound) toggleSound(); }}>{name === 'base' ? 'Base Misty' : name === 'all' ? 'All features' : name[0].toUpperCase() + name.slice(1)}</button><a href={`?remix=${name}`} target="_blank" rel="noreferrer" aria-label={`Open ${name} demo independently`}>Open solo ↗</a></div>)}</div>
    <div className="rm-feature-list">{options.map(([key, name, description]) => <label key={key}><span><strong>{name}</strong><small>{description}</small></span><input type="checkbox" checked={!!flags[key]} onChange={e => updateFlags({ [key]: e.target.checked })}/></label>)}</div>
    <div className="rm-sound-setting"><button type="button" aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={16}/> : <VolumeX size={16}/>} {sound ? 'Mute duck sounds' : 'Enable duck sounds'}</button><small>Off at every launch. Low-volume ambience, placement quacks and a completion call. Device/browser mute stays in control.</small>{soundError && <p role="status">{soundError}</p>}</div>
    <p className="rm-info">{reduced ? 'Reduced motion is on: static progress replaces fog movement and builders; sound stays off.' : 'Motion follows your system setting. Hide effects at any point during a blend.'}</p>
    <footer><button type="button" className="rm-primary" onClick={onPreview}>Preview all features</button><button type="button" onClick={() => { onClose(); setTutorialOpen(true); }}>Start walkthrough</button><button type="button" onClick={onClose}>Return to canvas</button></footer>
  </section></div>;
}
export default function RemixControls({ onBaseDemo, onTutorialOpen }) {
  const { flags, updateFlags, tutorialOpen, setTutorialOpen, labOpen, setLabOpen, sound, toggleSound } = useRemix();
  const [previewOpen, setPreviewOpen] = useState(() => new URLSearchParams(location.search).get('preview') === 'all');
  const previewAll = () => { updateFlags(PRESETS.all); setLabOpen(false); setTutorialOpen(false); setPreviewOpen(true); };
  return <>
    <nav className="rm-controls" aria-label="Remix controls">
      <button type="button" className="rm-primary" onClick={previewAll}><Sparkles size={15}/> All features</button>
      <button type="button" onClick={() => setLabOpen(true)}><FlaskConical size={15}/> Remix lab</button>
      {flags.tutorial && <button type="button" onClick={() => { onTutorialOpen?.(); setTutorialOpen(true); }}><BookOpen size={15}/> Tutorial</button>}
      {sound && <button type="button" onClick={toggleSound} aria-label="Mute duck sounds"><Volume2 size={16}/></button>}
    </nav>
    {labOpen && <Lab onClose={() => setLabOpen(false)} onPreview={previewAll}/>}
    {tutorialOpen && <RemixTutorial onClose={() => setTutorialOpen(false)} onBaseDemo={onBaseDemo}/>}
    {previewOpen && <RemixPreview onClose={() => setPreviewOpen(false)}/>}
  </>;
}
