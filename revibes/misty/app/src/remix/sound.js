// Original synthesized duck calls: no downloads, no microphone, no audio until explicit opt-in.
export function createDuckSound() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error('This browser does not support sound synthesis.');
  const ctx = new Audio(), master = ctx.createGain(); master.gain.value = 0.09; master.connect(ctx.destination);
  let ambience = null, disposed = false;
  function stopAmbient() { if (ambience) { ambience.oscillators.forEach(n => { try { n.stop(); } catch {} n.disconnect(); }); ambience.gain.disconnect(); ambience = null; } }
  function quack(kind = 'place') {
    if (disposed || document.hidden || ctx.state !== 'running') return;
    const now = ctx.currentTime, duration = kind === 'complete' ? 0.26 : 0.13;
    const osc = ctx.createOscillator(), filter = ctx.createBiquadFilter(), envelope = ctx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(kind === 'complete' ? 310 : 240, now); osc.frequency.exponentialRampToValueAtTime(145, now + duration);
    filter.type = 'bandpass'; filter.frequency.setValueAtTime(1100, now); filter.frequency.exponentialRampToValueAtTime(620, now + duration); filter.Q.value = 3;
    envelope.gain.setValueAtTime(0, now); envelope.gain.linearRampToValueAtTime(0.65, now + 0.018); envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(filter); filter.connect(envelope); envelope.connect(master); osc.start(); osc.stop(now + duration + 0.03);
    osc.onended = () => { osc.disconnect(); filter.disconnect(); envelope.disconnect(); };
  }
  return {
    async enable() { await ctx.resume(); },
    startAmbient() {
      if (disposed || ambience || document.hidden || ctx.state !== 'running') return;
      const gain = ctx.createGain(); gain.gain.value = 0.025; gain.connect(master);
      ambience = { gain, oscillators: [174, 261].map(frequency => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = frequency; o.connect(gain); o.start(); return o; }) };
    },
    stopAmbient, quack,
    dispose() { disposed = true; stopAmbient(); master.disconnect(); ctx.close().catch(() => {}); },
  };
}
