export function cleanInput(input = {}) {
  return {
    note: String(input.note || '').slice(0, 4000),
    strokes: (Array.isArray(input.strokes) ? input.strokes : []).slice(0, 40).map((stroke) =>
      (Array.isArray(stroke) ? stroke : []).slice(0, 500).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map((p) =>
        ({ x: Math.max(0, Math.min(1, p.x)), y: Math.max(0, Math.min(1, p.y)) }))).filter((s) => s.length > 1),
  };
}
export function steeringPrompt(input) {
  const { note, strokes } = cleanInput(input);
  if (!note.trim() && !strokes.length) return '';
  return `\n\nNEXT-ITERATION INPUT collected during the preceding blend. These are user directions, not content copied from the reference. Apply them within the requested blend's scope.\n${note}\n${strokes.length ? `The additional annotation image is a transparent coordinate overlay of the 375×720 source preview, not a new style reference. ${strokes.length} drawn marks indicate areas the user wants reconsidered; do not invent an instruction when a mark is ambiguous. Normalized mark bounds: ${JSON.stringify(strokes.map(s => ({ x: Math.min(...s.map(p=>p.x)), y: Math.min(...s.map(p=>p.y)), right: Math.max(...s.map(p=>p.x)), bottom: Math.max(...s.map(p=>p.y)) })))}` : ''}`;
}
export function inputForFlags(input, flags) {
  const saved = cleanInput(input);
  return { note: flags.input || flags.voice ? saved.note : '', strokes: flags.input ? saved.strokes : [] };
}
export function sketchImage(input) {
  const { strokes } = cleanInput(input);
  if (!strokes.length) return null;
  const canvas = document.createElement('canvas'); canvas.width = 375; canvas.height = 720;
  const ctx = canvas.getContext('2d'); ctx.strokeStyle = '#c34b31'; ctx.lineWidth = 4; ctx.lineCap = ctx.lineJoin = 'round';
  for (const stroke of strokes) { ctx.beginPath(); stroke.forEach((p, i) => ctx[i ? 'lineTo' : 'moveTo'](p.x * 375, p.y * 720)); ctx.stroke(); }
  return canvas.toDataURL('image/png');
}
