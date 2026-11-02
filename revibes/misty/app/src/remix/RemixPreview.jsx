import React, { useId, useRef } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import { Rehearsal } from './RemixTutorial.jsx';
import { useRemix } from './context.js';
import { useModalFocus } from './modal.js';

export default function RemixPreview({ onClose }) {
  const ref = useRef(null), title = useId();
  const { sound, toggleSound, soundError, reduced } = useRemix();
  useModalFocus(ref, onClose);
  return <div className="rm-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} className="rm-preview rm-dialog" role="dialog" aria-modal="true" aria-labelledby={title}>
      <header><div><span className="rm-eyebrow">TABLE 7 · EVERYTHING TOGETHER</span><h2 id={title}>All remix features</h2></div><button type="button" className="rm-close" aria-label="Close all features preview" onClick={onClose}><X size={20}/></button></header>
      <div className="rm-preview-body">
        <div className="rm-preview-intro"><p><strong>Fog + 3D builders</strong> are running on the left. Try <strong>notes, sketch and voice</strong> beside the preview. Reveal the sample when you’re ready.</p><button type="button" className="rm-sound-button" aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={16}/> : <VolumeX size={16}/>} {sound ? 'Mute duck sounds' : 'Enable duck sounds'}</button></div>
        {soundError && <p role="status">{soundError}</p>}
        {reduced && <p className="rm-info">Reduced motion is active: static fog and progress replace moving builders; sounds stay off.</p>}
        <Rehearsal manual />
      </div>
      <footer><span>All switches are enabled for your canvas. Sound is opt-in.</span><button type="button" className="rm-primary" onClick={onClose}>Use on canvas</button></footer>
    </section>
  </div>;
}
