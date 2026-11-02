import React, { useEffect, useMemo, useState } from 'react';
import { LiveEditor, LiveError, LiveProvider } from 'react-live';
import { Check, Copy, Download, X } from 'lucide-react';
import { USES_3D, isThreeLoaded, loadThree, renderScope } from '../lib/renderScope.js';

const THEME = {
  plain: { color: '#ECECF4', backgroundColor: '#1F1F28' },
  styles: [
    { types: ['comment'], style: { color: '#7C7C92' } },
    { types: ['string', 'attr-value'], style: { color: '#A8DBA8' } },
    { types: ['keyword', 'boolean'], style: { color: '#C7A6F5' } },
    { types: ['tag', 'function'], style: { color: '#8DB9F5' } },
    { types: ['attr-name'], style: { color: '#F4C98B' } },
  ],
};

// The live code editor, docked to the right of the screen (Section 4.2.2).
export default function CodeDock({ node, onChange, onClose }) {
  const [copied, setCopied] = useState(false);
  const code = node.data.code;
  // 3D remix: same scope as the node preview, including the 3D helpers when used.
  const [threeReady, setThreeReady] = useState(isThreeLoaded());
  useEffect(() => {
    if (USES_3D.test(code) && !isThreeLoaded()) loadThree().then(() => setThreeReady(true));
  }, [code]);
  const scope = useMemo(() => renderScope(code), [code, threeReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Save the component as a .jsx file to take back to a project (ported from xhigh).
  const download = () => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'misty-component.jsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <aside className="m-dock" aria-label="Code editor">
      <header>
        <strong>Code</strong>
        <span className="m-dock-spacer" />
        <button className="m-dock-button" onClick={copy}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="m-dock-button" onClick={download}>
          <Download size={14} /> Download
        </button>
        <button className="m-dock-button" aria-label="Close the code editor" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <div className="m-dock-editor">
        <LiveProvider key={node.id} code={code} scope={scope}>
          <LiveEditor theme={THEME} tabMode="indentation" onChange={onChange} />
          <LiveError className="m-dock-error" />
        </LiveProvider>
      </div>
    </aside>
  );
}
