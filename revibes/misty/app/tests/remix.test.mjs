import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBlendEvents } from '../src/remix/events.js';
import { cleanInput, inputForFlags, steeringPrompt } from '../src/remix/steering.js';
import { PRESETS, DEFAULT_FLAGS } from '../src/remix/flags.js';
import { callModel } from '../src/lib/llm.js';
import { createVoiceRecorder } from '../src/remix/voice.js';
import { createDuckSound } from '../src/remix/sound.js';

const regions = [{ id: 'header', kind: 'header', rect: { x: 0, y: 0, w: 1, h: .2 } }, { id: 'cards', kind: 'section', rect: { x: 0, y: .3, w: 1, h: .5 } }];
function fixture() {
  const queued = [], cleared = new Set();
  const events = createBlendEvents({ schedule: (fn, time) => { queued.push({ fn, time }); return queued.length - 1; }, cancel: id => cleared.add(id) });
  return { events, queued, flush() { queued.forEach((job, id) => { if (!cleared.has(id)) job.fn(); }); } };
}
test('waiting never claims parts or completion; a response must render first', () => {
  const { events } = fixture(), run = events.onBlendStart('n');
  assert.equal(events.onPartGenerated('n', run, regions[0], 'A'), false);
  assert.equal(events.onBlendComplete('n', run), false);
  events.onResponseReceived('n', run, 'new code');
  assert.equal(events.getSnapshot('n').phase, 'rendering');
  assert.equal(events.onBlendComplete('n', run), false);
  assert.equal(events.onPreviewReady('n', run, 'old code', regions), false);
  assert.equal(events.getSnapshot('n').ready, false);
});
test('rendered regions reveal in order with A/B roles, then complete', () => {
  const { events, queued, flush } = fixture(), run = events.onBlendStart('n');
  events.onResponseReceived('n', run, 'code'); events.onPreviewReady('n', run, 'code', regions);
  assert.equal(events.getSnapshot('n').phase, 'assembling');
  assert.equal(events.getSnapshot('n').parts.length, 0);
  assert.equal(queued.length, 3); flush();
  assert.equal(events.getSnapshot('n').phase, 'complete');
  assert.deepEqual(events.getSnapshot('n').parts.map(p => [p.id, p.source]), [['header','A+B'],['cards','A+B']]);
});
test('a failed blend settles and cannot be completed by late callbacks', () => {
  const { events, flush } = fixture(), run = events.onBlendStart('n');
  events.onResponseReceived('n', run, 'broken'); events.onPreviewReady('n', run, 'broken', regions);
  events.onBlendError('n', run, new Error('render failed')); flush();
  assert.equal(events.getSnapshot('n').phase, 'error');
  assert.equal(events.getSnapshot('n').error, 'render failed');
  assert.equal(events.onBlendComplete('n', run), false);
});
test('successful manual repair clears the error overlay; old previews cannot dismiss it', () => {
  const { events } = fixture(), run = events.onBlendStart('n', {initialCode:'original'});
  events.onResponseReceived('n',run,'broken'); events.onBlendError('n',run,'render failed');
  assert.equal(events.onPreviewRepaired('n',run,'original'),false);
  assert.equal(events.onPreviewRepaired('n',run,'broken'),false);
  assert.equal(events.onPreviewRepaired('n',run-1,'fixed'),false);
  assert.equal(events.onPreviewRepaired('n',run,'fixed'),true);
  assert.equal(events.getSnapshot('n'),null);
});
test('retry ignores old responses, errors and scheduled part events', () => {
  const { events, flush } = fixture(), old = events.onBlendStart('n');
  events.onResponseReceived('n', old, 'old'); events.onPreviewReady('n', old, 'old', regions);
  const run = events.onBlendStart('n');
  assert.equal(events.onResponseReceived('n', old, 'stale'), false);
  assert.equal(events.onBlendError('n', old, 'stale failure'), false); flush();
  assert.equal(events.getSnapshot('n').run, run); assert.equal(events.getSnapshot('n').phase, 'waiting');
});
test('reduced motion has the same completed information without animation timers', () => {
  const { events, queued } = fixture(), run = events.onBlendStart('n');
  events.onResponseReceived('n', run, 'code'); events.onPreviewReady('n', run, 'code', regions, true);
  assert.equal(queued.length, 0); assert.equal(events.getSnapshot('n').phase, 'complete'); assert.equal(events.getSnapshot('n').parts.length, 2);
});
test('removing a node cancels its animation and releases its subscription state', () => {
  const { events, flush } = fixture(), run = events.onBlendStart('n');
  events.onResponseReceived('n', run, 'code'); events.onPreviewReady('n', run, 'code', regions); events.remove('n'); flush();
  assert.equal(events.getSnapshot('n'), null); assert.deepEqual(events.getAll(), []);
});
test('independent presets keep fog and builders separate; optional input starts off', () => {
  assert.equal(PRESETS.fog.fog, true); assert.equal(PRESETS.fog.builders, false);
  assert.equal(PRESETS.builders.fog, false); assert.equal(PRESETS.builders.builders, true);
  assert.equal(PRESETS.input.input, true); assert.equal(PRESETS.input.fog, false);
  assert.equal(DEFAULT_FLAGS.input, false); assert.equal(DEFAULT_FLAGS.voice, false);
  assert.ok(Object.values(PRESETS).every(p => !('sound' in p))); // Sound is session opt-in, never persisted.
});
test('annotation bounds are constrained and included with the next-iteration direction', () => {
  const input = cleanInput({ note: 'Keep Fuji, make the cards wider', strokes: [[{x:-.1,y:.2},{x:1.2,y:.8}],null] });
  assert.equal(input.strokes.length, 1); assert.deepEqual(input.strokes[0], [{x:0,y:.2},{x:1,y:.8}]);
  const prompt = steeringPrompt(input);
  assert.match(prompt, /Keep Fuji, make the cards wider/); assert.match(prompt, /coordinate overlay/);
  assert.equal(steeringPrompt({}), '');
});
test('disabled input flags preserve saved data but exclude it from a base-only request', () => {
  const saved = { note:'Keep Fuji', strokes: [[{x:0,y:0},{x:.5,y:.5}]] };
  assert.deepEqual(inputForFlags(saved, PRESETS.base), { note:'',strokes:[] });
  assert.deepEqual(inputForFlags(saved, {voice:true,input:false}), { note:'Keep Fuji',strokes:[] });
  assert.deepEqual(inputForFlags(saved, PRESETS.input), saved);
  assert.equal(saved.strokes.length,1);
});
test('actual model request includes steering text, reference and sketch as separate images', async () => {
  const previous = globalThis.fetch; let request;
  globalThis.fetch = async (url, options) => { request = { url, ...options }; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"updatedCode":"() => <main />"}' } }] }) }; };
  try {
    const controller = new AbortController();
    await callModel('blend' + steeringPrompt({note:'Use wider cards'}), 'data:image/png;base64,REF', { signal: controller.signal, extraImages: ['data:image/png;base64,MARKS'] });
    const content = JSON.parse(request.body).messages[0].content;
    assert.match(content[0].text, /Use wider cards/); assert.equal(content[1].image_url.url, 'data:image/png;base64,REF'); assert.equal(content[2].image_url.url, 'data:image/png;base64,MARKS'); assert.equal(request.signal, controller.signal);
  } finally { globalThis.fetch = previous; }
});
test('hold-to-talk accepts final transcripts, stops on release and aborts on dismissal', () => {
  let native; const transcripts = [], states = [];
  class Recognition { constructor() { native = this; } start() { this.started = true; } stop() { this.stopped = true; } abort() { this.aborted = true; } }
  const recorder = createVoiceRecorder({ Recognition, onTranscript: t => transcripts.push(t), onState: s => states.push(s), onError: () => {}, schedule: () => 1, cancel: () => {} });
  assert.equal(recorder.start(), true); assert.equal(recorder.start(), false);
  const interim = [{ transcript: 'not final' }]; interim.isFinal = false;
  const final = [{ transcript: 'Make the cards wider' }]; final.isFinal = true;
  native.onresult({ resultIndex: 0, results: [interim, final] });
  assert.deepEqual(transcripts, ['Make the cards wider']); recorder.stop(); assert.equal(native.stopped, true);
  recorder.dispose(); assert.equal(native.aborted, true); assert.equal(native.onresult, null); assert.equal(states.at(-1), false);
});
test('voice permission errors and unsupported browsers leave a usable text fallback', () => {
  let native, error = '';
  class Recognition { constructor() { native = this; } start() {} abort() {} }
  const recorder = createVoiceRecorder({ Recognition, onTranscript: () => {}, onState: () => {}, onError: t => {error=t;}, schedule: () => 1, cancel: () => {} });
  recorder.start(); native.onerror({ error: 'not-allowed' }); assert.match(error, /type the same note/); recorder.dispose();
  const unsupported = createVoiceRecorder({ Recognition: null, onTranscript: () => {}, onState: () => {}, onError: () => {} }); assert.equal(unsupported.start(), false);
});
test('push-to-talk has a bounded recording time and returns to stopped state', () => {
  let limit, stopped = false;
  class Recognition { start() {} stop() { stopped = true; } abort() {} }
  const recorder = createVoiceRecorder({ Recognition, onTranscript: () => {}, onState: () => {}, onError: () => {}, schedule: (fn, ms) => { assert.equal(ms, 45000); limit = fn; return 1; }, cancel: () => {} });
  recorder.start(); limit(); assert.equal(stopped, true); recorder.dispose();
});
test('sound requires enabling, respects hidden pages and releases its audio nodes on mute', async () => {
  const previousWindow = globalThis.window, previousDocument = globalThis.document; let ctx;
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ gain:param(), frequency:param(), Q:param(), connect(){}, disconnect(){this.disconnected=true;}, start(){this.started=true;}, stop(){this.stopped=true;} });
  class AudioContext {
    constructor() { ctx=this; this.state='suspended'; this.currentTime=0; this.oscillators=[]; this.gains=[]; }
    createGain(){const n=node();this.gains.push(n);return n;}
    createBiquadFilter(){return node();}
    createOscillator(){const n=node();this.oscillators.push(n);return n;}
    async resume(){this.state='running';}
    async close(){this.state='closed';}
  }
  globalThis.window = { AudioContext }; globalThis.document = { hidden:false };
  try {
    const engine=createDuckSound(); engine.quack(); engine.startAmbient(); assert.equal(ctx.oscillators.length,0);
    await engine.enable(); engine.startAmbient(); assert.equal(ctx.oscillators.length,2);
    engine.quack('place'); assert.equal(ctx.oscillators.length,3); assert.equal(ctx.oscillators[2].stopped,true);
    document.hidden=true; engine.quack('complete'); assert.equal(ctx.oscillators.length,3);
    engine.stopAmbient(); assert.ok(ctx.oscillators.slice(0,2).every(n=>n.stopped&&n.disconnected));
    engine.dispose(); assert.equal(ctx.state,'closed'); assert.equal(ctx.gains[0].disconnected,true);
  } finally { globalThis.window=previousWindow;globalThis.document=previousDocument; }
});
