import React, { useEffect, useState } from 'react';
import { Box, LayoutList, MoreVertical, Paintbrush, Plus } from 'lucide-react';

const OPTIONS = [
  { name: 'Color', text: 'Apply the colors to your design', Icon: Paintbrush },
  { name: 'Layout', text: 'Arrange and structure your design elements', Icon: LayoutList },
  { name: 'Content', text: 'Add the selected UI elements', Icon: Plus },
  // 3D remix: rebuild 3D objects and depth from the selection with three.js.
  { name: '3D', text: 'Rebuild its 3D objects as live 3D', Icon: Box },
  { name: 'Customize', text: 'Specify a new blending aspect', Icon: MoreVertical },
];

const WIDTH = 256;
const HEIGHT = 660;

// "Pick Blending Option" (Figure 1 C). More than one aspect may be picked (Section 2).
export default function BlendDialog({ x, y, onCancel, onNext }) {
  const [picked, setPicked] = useState([]);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const toggle = (name) =>
    setPicked((list) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]));

  const needsText = picked.includes('Customize') && !custom.trim();
  const ready = picked.length > 0 && !needsText;

  const left = Math.max(12, Math.min(x + 18, window.innerWidth - WIDTH - 12));
  const top = Math.max(12, Math.min(y - 120, window.innerHeight - HEIGHT - 12));

  return (
    <div className="m-dialog" role="dialog" aria-label="Pick Blending Option" style={{ left, top, width: WIDTH }}>
      <h2>Pick Blending Option</h2>
      {OPTIONS.map(({ name, text, Icon }) => (
        <button
          key={name}
          aria-pressed={picked.includes(name)}
          className={`m-option ${picked.includes(name) ? 'is-picked' : ''}`}
          onClick={() => toggle(name)}
        >
          <Icon size={22} />
          <span>
            <strong>{name}</strong>
            <small>{text}</small>
          </span>
        </button>
      ))}
      {picked.includes('Customize') && (
        <input
          className="m-custom-input"
          autoFocus
          placeholder="e.g. the corner roundness"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
      )}
      <div className="m-dialog-actions">
        <button className="m-dialog-button" onClick={onCancel}>Cancel</button>
        <button className="m-dialog-button" disabled={!ready} onClick={() => onNext(picked, custom.trim())}>
          Next
        </button>
      </div>
    </div>
  );
}
