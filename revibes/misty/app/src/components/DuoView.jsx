import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Loader2, RotateCcw, Smartphone } from 'lucide-react';
import { useMisty } from '../context.js';
import CodeRender from './CodeRender.jsx';
import { blendAmount, haptic, IN_SHELL, postureOf, setFoldAngle, useFold, useFoldAngle } from '../lib/duo.js';

// The render is 375 x 720 on the canvas. Scale it to fit the space the scrub view gives it.
function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

// The cache key of level k: the ids of the first k categories (as toggleKey in App.jsx).
const levelKey = (categories, k) => categories.slice(0, k).map((c) => c.id).join(',');

// How long a level must stay put to count as selected, so passing levels while closing
// does not replace it.
const HOLD_MS = 700;

// Folding picks a blend level. A blend with N change categories has levels 0 (the parent) to N
// (the full blend); level k is its first k categories. The angle sets the level, holding still
// for HOLD_MS selects it, and closing the phone applies the selected level (see DuoView).
//
// The preview is exact when that level's code is already cached (always for 0 and N). Otherwise
// it cross-fades parent and blend, following the angle continuously, and says it is approximate:
// applying it asks the model. The level row also fills continuously with the angle.
//
// When the system reports a vertical fold, the scrub keeps the render off the crease: the
// meter and changes sit on the left half and the render on the right half.
function FoldScrub({ node, angle, level, held, visible }) {
  const win = useWindowSize();
  const fold = useFold();
  const split = Boolean(fold && fold.height > fold.width);
  const parentCode = node?.data.blend?.parentCode;

  const mainWidth = split ? win.width - (fold.x + fold.width) : win.width;
  const scale = Math.min((mainWidth - 48) / 375, (win.height - (split ? 60 : 210)) / 720, 1.4);
  const sideStyle = split ? { width: fold.x } : undefined;
  const mainStyle = split ? { left: fold.x + fold.width } : undefined;

  if (!node || !parentCode) {
    return (
      <div className="m-duo-scrub" hidden={!visible}>
        <p className="m-duo-empty">
          Select a blended Code Render on the canvas, then fold to pick how much of the blend to keep.
        </p>
      </div>
    );
  }

  const categories = node.data.categories ?? [];
  const n = categories.length;
  // The angle's continuous position, shown as it moves, while selection snaps to whole levels.
  const progress = blendAmount(angle);
  const amount = progress;
  const exact = n ? node.data.toggleCache?.[levelKey(categories, level)] : null;

  return (
    <div className={`m-duo-scrub ${split ? 'is-split' : ''}`} hidden={!visible}>
      <div className="m-duo-side" style={sideStyle}>
        <header className="m-duo-head">
          <span className="m-duo-tag">Fold to pick a level</span>
          <strong>{node.data.blendLabel || 'Blend'}</strong>
        </header>
        {n > 0 && (
          <>
            <div className="m-duo-levels" role="meter" aria-valuemin={0} aria-valuemax={n} aria-valuenow={level}>
              <i className="m-duo-levels-track" aria-hidden="true">
                <b style={{ width: `${progress * 100}%` }} />
              </i>
              {Array.from({ length: n + 1 }, (_, k) => (
                <span
                  key={k}
                  className={`${k <= level ? 'is-in' : ''} ${k === level ? 'is-current' : ''} ${k === held ? 'is-held' : ''}`}
                >
                  {k}
                </span>
              ))}
            </div>
            <p className="m-duo-level-label">
              Level {level} of {n} <span className="m-duo-percent">{Math.round(progress * 100)}%</span>
              {level === 0 ? ': the original' : level === n ? ': the full blend' : ''}
              {!exact && <em> · approximate preview</em>}
            </p>
            <ul className="m-duo-changes">
              {categories.map((c, i) => (
                <li key={c.id} className={i < level ? '' : 'is-off'}>{c.label}</li>
              ))}
            </ul>
            <p className={`m-duo-hint ${held != null ? 'is-ready' : ''}`}>
              {held == null ? 'Hold still to select this level' : `Close the phone to apply level ${held}`}
            </p>
          </>
        )}
      </div>
      <div className="m-duo-main" style={mainStyle}>
        <div className="m-duo-stage" style={{ width: 375 * scale, height: 720 * scale }}>
          <div className="m-duo-layer" style={{ transform: `scale(${scale})`, opacity: exact ? 0 : 1 }}>
            <CodeRender code={parentCode} />
          </div>
          <div className="m-duo-layer" style={{ transform: `scale(${scale})`, opacity: exact ? 1 : amount }}>
            <CodeRender code={exact || node.data.blendedCode || node.data.code} />
          </div>
        </div>
      </div>
    </div>
  );
}

// On the outer screen's right edge, a vertical meter shows the blend level the app understood:
// level N (the full blend) at the top down to 0 (the original) at the bottom. It reads the
// node's switches, so it also follows the change switches; a mix that is not a level shows "Mix".
// It pulses when a level arrives from the fold. On an iPhone Duo it sits in the strip under the
// clock (the right safe area); where there is none, it floats over the render's edge.
function LevelRail({ node, applied }) {
  const categories = node.data.categories ?? [];
  const n = categories.length;
  const on = categories.filter((c) => c.enabled).length;
  const isLevel = categories.every((c, i) => c.enabled === i < on);
  const level = isLevel ? on : null;
  const busy = node.data.status === 'loading' || Boolean(node.data.toggling);
  return (
    <div
      key={applied ? `fold-${applied.level}` : 'rail'}
      className={`m-duo-rail ${applied ? 'is-from-fold' : ''} ${busy ? 'is-busy' : ''}`}
      role="meter"
      aria-label="Blend level"
      aria-valuemin={0}
      aria-valuemax={n}
      aria-valuenow={level ?? undefined}
    >
      <span className="m-duo-rail-title">Level</span>
      {Array.from({ length: n + 1 }, (_, i) => n - i).map((k) => (
        <span key={k} className={`m-duo-rail-cell ${level != null && k <= level ? 'is-in' : ''} ${k === level ? 'is-current' : ''}`}>
          {k}
        </span>
      ))}
      <span className="m-duo-rail-value">{level == null ? 'Mix' : `${level}/${n}`}</span>
    </div>
  );
}

// Closed: the outer display shows the focused UI at the phone's real width, and it stays
// interactive, so the generated UI can be tried on the kind of screen it was designed for.
//
// For a blend, a row of switches along the bottom flips each change category on or off with one
// thumb. It is the canvas's Applied Changes toggle: all on and all off come from the cache, and
// any other combination asks the model once, then is cached too.
function OuterDisplay({ node, applied }) {
  const { toggleCategory, resetAll } = useMisty();
  if (!node) return <div className="m-duo-outer"><p className="m-duo-empty">No Code Render yet.</p></div>;

  const categories = node.data.blend ? node.data.categories ?? [] : [];
  const busy = node.data.status === 'loading' || Boolean(node.data.toggling);
  const on = categories.filter((c) => c.enabled).length;

  return (
    <div className="m-duo-outer">
      <div className={`m-duo-outer-screen ${busy ? 'is-busy' : ''}`}>
        <CodeRender code={node.data.code} />
        {busy && (
          <div className="m-duo-outer-busy">
            <Loader2 size={18} className="m-spin" />
            {node.data.status === 'loading' ? 'Blending…' : 'Applying your change…'}
          </div>
        )}
      </div>
      {categories.length > 0 && <LevelRail node={node} applied={applied} />}
      {categories.length > 0 ? (
        <div className="m-duo-flip" role="group" aria-label="Changes from the blend">
          <div className="m-duo-flip-head">
            <span><Smartphone size={12} /> {node.data.blendLabel || 'Blend'}</span>
            <span>{applied ? `Level ${applied.level} of ${applied.n} from the fold` : `${on} of ${categories.length} changes on`}</span>
            {on < categories.length && (
              <button className="m-duo-flip-reset" disabled={busy} onClick={() => resetAll(node.id)}>
                <RotateCcw size={12} /> Reset
              </button>
            )}
          </div>
          <div className="m-duo-flip-row">
            {categories.map((c) => (
              <button
                key={c.id}
                className={`m-duo-flip-chip ${c.enabled ? 'is-on' : ''}`}
                aria-pressed={c.enabled}
                title={c.description}
                disabled={busy}
                onClick={() => toggleCategory(node.id, c.id)}
              >
                <span className="m-duo-switch" aria-hidden="true" />
                {c.label}
              </button>
            ))}
          </div>
          {node.data.error && <p className="m-duo-flip-error">{node.data.error}</p>}
        </div>
      ) : (
        <div className="m-duo-outer-tag">
          <Smartphone size={12} /> {node.data.blendLabel || 'Source UI'}
        </div>
      )}
    </div>
  );
}

// In a desktop browser there is no shell, so a slider on the page stands in for the hinge.
function BrowserHinge({ angle }) {
  return (
    <div className="m-duo-hinge">
      <BookOpen size={14} />
      <span>Simulated hinge</span>
      <input type="range" min="0" max="180" value={angle} onChange={(e) => setFoldAngle(e.target.value)} />
      <output>{Math.round(angle)}°</output>
      <button onClick={() => setFoldAngle(0)}>Close</button>
      <button onClick={() => setFoldAngle(180)}>Open</button>
    </div>
  );
}

export default function DuoView({ node }) {
  const { setBlendLevel } = useMisty();
  const angle = useFoldAngle();
  const posture = postureOf(angle);
  const n = node?.data.blend ? node.data.categories?.length ?? 0 : 0;
  const level = Math.round(blendAmount(angle) * n);
  const [held, setHeld] = useState(null);
  const [applied, setApplied] = useState(null);
  const previous = useRef(posture);

  // Holding a level still selects it.
  useEffect(() => {
    if (posture !== 'folding' || !n) return undefined;
    const timer = setTimeout(() => setHeld(level), HOLD_MS);
    return () => clearTimeout(timer);
  }, [posture, level, n]);

  // A haptic tick each time the fold crosses into another level, like a picker wheel.
  const lastLevel = useRef(null);
  useEffect(() => {
    if (posture !== 'folding' || !n) {
      lastLevel.current = null;
      return;
    }
    if (lastLevel.current !== null && lastLevel.current !== level) haptic('level');
    lastLevel.current = level;
  }, [posture, level, n]);

  // A firmer tap when holding still selects a level.
  useEffect(() => {
    if (held != null) haptic('select');
  }, [held]);

  // Closing the phone applies the selected level. Opening it, or a new selection, starts over.
  useEffect(() => {
    const was = previous.current;
    previous.current = posture;
    if (posture === 'closed' && was === 'folding' && held != null && node) {
      setBlendLevel(node.id, held);
      setApplied({ level: held, n });
      haptic('apply');
    }
    if (posture !== 'folding') setHeld(null);
    if (posture === 'open') setApplied(null);
    // Only a posture change matters here; held and node are read as they are at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posture]);

  useEffect(() => setHeld(null), [node?.id]);

  return (
    <>
      {/* Stays mounted while hidden, so its renders are ready the moment folding starts. */}
      <FoldScrub node={node} angle={angle} level={level} held={held} visible={posture === 'folding'} />
      {posture === 'closed' && <OuterDisplay node={node} applied={applied} />}
      {!IN_SHELL && <BrowserHinge angle={angle} />}
    </>
  );
}
