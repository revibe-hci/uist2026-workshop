import { useEffect } from 'react';
export function useModalFocus(ref, onClose) {
  useEffect(() => {
    const previous = document.activeElement;
    const background = [...document.querySelectorAll('.m-canvas, .m-toolbar, .m-dock')];
    const prior = background.map(el => el.inert); background.forEach(el => { el.inert = true; });
    ref.current?.querySelector('button, input, textarea, a[href]')?.focus();
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const items = [...(ref.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea, a[href], [tabindex="0"]') || [])].filter(el => el.getClientRects().length);
        const index = items.indexOf(document.activeElement);
        if (e.shiftKey && index <= 0) { e.preventDefault(); items.at(-1)?.focus(); }
        else if (!e.shiftKey && (index === items.length - 1 || index < 0)) { e.preventDefault(); items[0]?.focus(); }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); background.forEach((el, i) => { el.inert = prior[i]; }); previous?.focus(); };
  }, []);
}
