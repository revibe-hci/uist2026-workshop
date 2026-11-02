// Browser speech adapter, kept separate so permission/error/hold-release behavior can be tested.
export function createVoiceRecorder({ Recognition, onTranscript, onState, onError, schedule = setTimeout, cancel = clearTimeout }) {
  let active = null, timer = null, disposed = false;
  const stop = () => { cancel(timer); try { active?.stop(); } catch {} onState(false); };
  return {
    start() {
      if (!Recognition || active || disposed) return false;
      try {
        active = new Recognition(); active.lang = typeof navigator === 'undefined' ? 'en-US' : navigator.language || 'en-US'; active.continuous = true; active.interimResults = false;
        active.onresult = e => { let text = ''; for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript + ' '; if (text.trim()) onTranscript(text.trim()); };
        active.onerror = e => { onError(e.error === 'not-allowed' ? 'Microphone permission was declined. You can type the same note.' : `Voice input stopped (${e.error}). You can type a note instead.`); stop(); };
        active.onend = () => { cancel(timer); active = null; onState(false); };
        active.start(); onState(true); timer = schedule(stop, 45000); return true;
      } catch (e) { active = null; onState(false); onError(`Voice input unavailable: ${e.message}`); return false; }
    },
    stop,
    dispose() { disposed = true; cancel(timer); if (active) { active.onresult = null; active.onerror = null; active.onend = null; try { active.abort(); } catch {} active = null; } },
  };
}
