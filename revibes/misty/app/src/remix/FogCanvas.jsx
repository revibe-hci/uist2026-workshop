import React, { useEffect, useRef } from 'react';
function cloudTexture() {
  const texture = document.createElement('canvas'); texture.width = texture.height = 256;
  const ctx = texture.getContext('2d');
  let seed = 19; const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 32; i++) {
    const x = random() * 256, y = random() * 256, radius = 30 + random() * 70;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius); gradient.addColorStop(0, 'rgba(248,247,252,.8)'); gradient.addColorStop(1, 'rgba(232,228,241,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
  }
  // Tiny, cached grain gives the mist texture without recomputing noise per frame.
  const image = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < image.data.length; i += 4) { const grain = (random() - 0.5) * 9; for (let c = 0; c < 3; c++) image.data[i + c] += grain; }
  ctx.putImageData(image, 0, 0); return texture;
}
export default function FogCanvas({ session, reduced }) {
  const canvas = useRef(null), current = useRef(session); current.current = session;
  useEffect(() => {
    const el = canvas.current, ctx = el.getContext('2d'), texture = cloudTexture();
    const W = el.width, H = el.height; let frame, visible = true;
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }); observer.observe(el);
    function draw(time) {
      const s = current.current;
      if (visible && !document.hidden) {
        ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = s.phase === 'error' ? 'rgba(242,234,234,.90)' : 'rgba(235,232,243,.78)'; ctx.fillRect(0, 0, W, H);
        const moving = !reduced && s.phase !== 'error', shift = moving ? Math.sin(time / 4200) * 12 : 0;
        ctx.globalAlpha = 0.85; ctx.drawImage(texture, -30 + shift, -20, W + 60, H + 40);
        ctx.globalAlpha = 0.55; ctx.drawImage(texture, -30 - shift, Math.cos(time / 5700) * (moving ? 9 : 0) - 30, W + 60, H + 60); ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-out';
        if (s.ready && s.phase !== 'error') for (const p of s.parts) { const r = p.rect; ctx.fillRect(r.x * W, r.y * H, r.w * W, r.h * H); }
      }
      if (!reduced && current.current.phase !== 'error') frame = requestAnimationFrame(draw);
    }
    draw(performance.now());
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [reduced, session.phase === 'error', reduced ? session.parts.length : null]);
  return <canvas ref={canvas} className="rm-fog" width="188" height="360" aria-hidden="true" />;
}
