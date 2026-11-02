import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Smartphone, Vibrate } from 'lucide-react';
import { postureOf } from '../lib/duo.js';

// The iPhone Duo simulator, for a browser with no foldable phone (open the app with ?sim).
//
// It plays the part of the MistyDuo iOS app (revibes/misty/duo): Misty runs in an iframe at
// the phone's screen sizes, and the simulator sets its hinge angle and fold through
// window.mistyDuo, as the app does, and shows the haptics the page asks for.
//
// It also copies what iOS does with the two screens, measured in the iPhone Duo simulator
// (iOS 27.2): folding slowly keeps the app on the inner screen down to about 20°, a quick fold
// moves it to the outer screen as early as 60°, and opening brings it back to the inner screen
// only above about 155°. On the outer screen the page sees the phone as closed.

const INNER = { width: 626, height: 890 };
const OUTER = { width: 466, height: 678 };
const FOLD_WIDTH = 24;
const TO_OUTER_SLOW = 20;
const TO_OUTER_FAST = 60;
const FAST_FOLD = 150; // degrees per second that count as a quick fold
const TO_INNER = 155;

const HAPTICS = {
  level: { label: 'Tick', detail: 'the fold crossed into a new level', vibrate: 8 },
  select: { label: 'Tap', detail: 'holding still selected the level', vibrate: 20 },
  apply: { label: 'Success', detail: 'closing applied the level', vibrate: [15, 60, 25] },
};

const POSTURES = {
  open: 'Open: the full canvas',
  folding: 'Folding: pick a blend level',
  closed: 'Closed: the outer display',
};

// Top view of the phone: the left half stays put and the right half turns about the hinge.
// Drag the right half, or scroll over it, to fold.
function HingeDial({ angle, onTurn, onRelease }) {
  const ref = useRef(null);
  const HX = 130;
  const HY = 128;
  const L = 104;
  const point = (deg, r) => {
    const phi = ((180 - deg) * Math.PI) / 180;
    return [HX + r * Math.cos(phi), HY - r * Math.sin(phi)];
  };
  const arc = (from, to, r) => {
    const [x1, y1] = point(from, r);
    const [x2, y2] = point(to, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const toAngle = (event) => {
    const box = ref.current.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 308 - 24;
    const y = ((event.clientY - box.top) / box.height) * 150;
    let phi = (Math.atan2(HY - y, x - HX) * 180) / Math.PI;
    if (phi < 0) phi = phi < -90 ? 180 : 0;
    return 180 - phi;
  };
  const [end, tip] = [point(angle, L), point(angle, L + 2)];

  return (
    <svg
      ref={ref}
      className="m-sim-dial"
      viewBox="-24 0 308 150"
      role="slider"
      aria-label="Hinge angle"
      aria-valuemin={0}
      aria-valuemax={180}
      aria-valuenow={Math.round(angle)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onTurn(toAngle(e));
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && onTurn(toAngle(e))}
      onPointerUp={onRelease}
      onWheel={(e) => onTurn(angle - Math.sign(e.deltaY) * 3)}
    >
      <path className="m-sim-zone" d={arc(0, 15, L + 16)} />
      <path className="m-sim-zone is-folding" d={arc(15, 165, L + 16)} />
      <path className="m-sim-zone" d={arc(165, 180, L + 16)} />
      <text x={point(7, L + 30)[0]} y={point(7, L + 30)[1] + 4} textAnchor="middle">shut</text>
      <text x={point(90, L + 28)[0]} y={point(90, L + 28)[1] + 4} textAnchor="middle">fold</text>
      <text x={point(173, L + 30)[0] - 4} y={point(173, L + 30)[1] + 4} textAnchor="middle">flat</text>
      <path className="m-sim-swept" d={`M ${HX} ${HY} L ${point(0, 34).join(' ')} A 34 34 0 0 1 ${point(angle, 34).join(' ')} Z`} />
      <line className="m-sim-leaf" x1={HX - L} y1={HY} x2={HX} y2={HY} />
      <line className="m-sim-leaf is-moving" x1={HX} y1={HY} x2={end[0]} y2={end[1]} />
      <circle className="m-sim-pin" cx={HX} cy={HY} r="5" />
      <circle className="m-sim-handle" cx={tip[0]} cy={tip[1]} r="10" />
    </svg>
  );
}

// Shades both halves toward the crease while the phone folds, as the iOS app does.
function Crease({ angle }) {
  const depth = ((180 - angle) / 180) * 0.55;
  if (depth < 0.01) return null;
  return (
    <div className="m-sim-crease" aria-hidden="true">
      <i style={{ background: `linear-gradient(to right, transparent, rgba(0,0,0,${depth}))` }} />
      <b />
      <i style={{ background: `linear-gradient(to left, transparent, rgba(0,0,0,${depth}))` }} />
    </div>
  );
}

function useStageScale(ref) {
  const [scale, setScale] = useState(0.7);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.max(0.3, Math.min((width - 32) / INNER.width, (height - 64) / INNER.height, 1)));
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return scale;
}

export default function DuoSimulator() {
  const params = new URLSearchParams(window.location.search);
  const ownCanvas = params.has('canvas');
  const src = `${window.location.pathname}?duo&sim-shell${ownCanvas ? '' : '&demo'}`;

  const frame = useRef(null);
  const stage = useRef(null);
  const scale = useStageScale(stage);
  const [angle, setAngle] = useState(180);
  const [screen, setScreen] = useState('inner');
  const [log, setLog] = useState([]);
  const [pulse, setPulse] = useState(null);
  const samples = useRef([]);
  const motion = useRef(0);
  const angleRef = useRef(180);

  const note = useCallback((text, kind = 'screen') => {
    setLog((list) => [{ id: performance.now() + Math.random(), text, kind }, ...list].slice(0, 6));
  }, []);

  // Every change of angle goes through here, so the fold speed is known.
  const turn = useCallback((value) => {
    const next = Math.max(0, Math.min(180, Math.round(value * 10) / 10));
    const now = performance.now();
    samples.current = [...samples.current.filter((s) => now - s.t < 150), { t: now, a: next }];
    angleRef.current = next;
    setAngle(next);
  }, []);

  const stopMotion = () => cancelAnimationFrame(motion.current);

  // Move the hinge over `seconds`, eased, like the hinge tool's sweep.
  const sweep = useCallback(
    (target, seconds) => {
      cancelAnimationFrame(motion.current);
      const from = angleRef.current;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / (seconds * 1000));
        const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        turn(from + (target - from) * eased);
        if (t < 1) motion.current = requestAnimationFrame(step);
      };
      motion.current = requestAnimationFrame(step);
    },
    [turn],
  );
  useEffect(() => () => cancelAnimationFrame(motion.current), []);

  // iOS's choice of screen, with its hysteresis.
  useEffect(() => {
    const list = samples.current;
    const first = list[0];
    const last = list[list.length - 1];
    const speed = first && last && last.t > first.t ? ((last.a - first.a) / (last.t - first.t)) * 1000 : 0;
    if (screen === 'inner' && (angle < TO_OUTER_SLOW || (angle < TO_OUTER_FAST && speed < -FAST_FOLD))) {
      setScreen('outer');
      note(`Moved to the outer screen at ${Math.round(angle)}°${angle >= TO_OUTER_SLOW ? ' (a quick fold)' : ''}`);
    } else if (screen === 'outer' && angle > TO_INNER) {
      setScreen('inner');
      note(`Moved to the inner screen at ${Math.round(angle)}°`);
    }
  }, [angle, screen, note]);

  // What the page sees: on the outer screen the phone counts as closed, as in the iOS app.
  const pageAngle = screen === 'outer' ? 0 : angle;
  const size = screen === 'outer' ? OUTER : INNER;

  const pushAngle = useCallback(() => {
    frame.current?.contentWindow?.mistyDuo?.setPosture(pageAngle);
  }, [pageAngle]);
  const pushFold = useCallback(() => {
    const rect = screen === 'inner'
      ? { x: INNER.width / 2 - FOLD_WIDTH / 2, y: 0, width: FOLD_WIDTH, height: INNER.height }
      : null;
    frame.current?.contentWindow?.mistyDuo?.setFold(rect);
  }, [screen]);
  useEffect(pushAngle, [pushAngle]);
  useEffect(pushFold, [pushFold]);

  // The page's haptics, shown on the device and, where the browser can, felt.
  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const kind = event.data?.mistyHaptic;
      const haptic = HAPTICS[kind];
      if (!haptic) return;
      try {
        navigator.vibrate?.(haptic.vibrate);
      } catch {
        // No vibration motor.
      }
      setPulse({ kind, label: haptic.label, id: performance.now() });
      note(`${haptic.label}: ${haptic.detail}`, kind);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [note]);

  // Keys work while the pointer is outside the phone (the phone's own page takes its keys).
  useEffect(() => {
    const onKey = (event) => {
      if (event.target.closest?.('input, textarea, button')) return;
      const by = event.shiftKey ? 1 : 5;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') turn(angleRef.current - by);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') turn(angleRef.current + by);
      else if (event.key === 'o') sweep(180, 1.6);
      else if (event.key === 'c') sweep(0, 3);
      else return;
      if (event.key.startsWith('Arrow')) stopMotion();
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn, sweep]);

  const posture = postureOf(pageAngle);

  return (
    <div className="m-sim">
      <main className="m-sim-stage" ref={stage}>
        <div
          key={screen}
          className={`m-sim-device is-${screen} ${pulse?.kind === 'apply' ? 'is-applied' : ''}`}
          style={{ width: size.width * scale, height: size.height * scale }}
        />
        {/* One iframe for both screens: like the iOS app, the page stays loaded and resizes. */}
        <iframe
          ref={frame}
          className="m-sim-frame"
          src={src}
          title="Misty on the simulated iPhone Duo"
          style={{ width: size.width, height: size.height, transform: `translate(-50%, -50%) scale(${scale})` }}
          onLoad={() => {
            pushAngle();
            pushFold();
          }}
        />
        <div className="m-sim-overlay" style={{ width: size.width * scale, height: size.height * scale }}>
          {screen === 'inner' && <Crease angle={angle} />}
          {pulse && (
            <span key={pulse.id} className={`m-sim-buzz is-${pulse.kind}`}>
              <Vibrate size={13} /> {pulse.label}
            </span>
          )}
        </div>
        <p className="m-sim-caption">
          {screen === 'inner' ? <BookOpen size={13} /> : <Smartphone size={13} />}
          {screen === 'inner' ? 'Inner screen, 626 × 890 pt' : 'Outer screen, 466 × 678 pt'}
          {screen === 'outer' && angle > TO_OUTER_SLOW && ` · phone open ${Math.round(angle)}°, still on the outer screen until ${TO_INNER}°`}
        </p>
      </main>

      <aside className="m-sim-panel">
        <header>
          <h1>iPhone Duo simulator</h1>
          <p>Misty Duo in a browser. Drag the right half of the phone below to fold it, as you would a book.</p>
        </header>

        <HingeDial
          angle={angle}
          onTurn={(value) => {
            stopMotion();
            turn(value);
          }}
          onRelease={() => {}}
        />

        <div className="m-sim-readout">
          <strong>{Math.round(angle)}°</strong>
          <span className={`m-sim-posture is-${posture}`}>{POSTURES[posture]}</span>
        </div>
        <input
          className="m-sim-range"
          type="range"
          min="0"
          max="180"
          step="0.5"
          value={angle}
          aria-label="Hinge angle"
          onChange={(e) => {
            stopMotion();
            turn(Number(e.target.value));
          }}
        />
        <div className="m-sim-buttons">
          <button onClick={() => sweep(180, 1.6)}>Open</button>
          <button onClick={() => sweep(100, 1.2)}>Half fold</button>
          <button onClick={() => sweep(0, 3)}>Close slowly</button>
          <button onClick={() => sweep(0, 0.45)}>Close quickly</button>
        </div>

        <dl className="m-sim-facts">
          <dt>The app is on</dt>
          <dd>the {screen} screen</dd>
          <dt>The page sees</dt>
          <dd>{Math.round(pageAngle)}°{screen === 'outer' ? ' (closed, because it is on the outer screen)' : ''}</dd>
        </dl>
        <p className="m-sim-note">
          To try a level: fold to it, hold still until the hint turns blue, then close. Like iOS, a slow close stays on
          the inner screen until about {TO_OUTER_SLOW}°, a quick one moves to the outer screen at {TO_OUTER_FAST}°, and
          opening returns to the inner screen only above {TO_INNER}°.
        </p>

        <h2>Events</h2>
        <ol className="m-sim-log">
          {log.length === 0 && <li className="is-empty">Screen changes and haptics show here.</li>}
          {log.map((entry) => (
            <li key={entry.id} className={`is-${entry.kind}`}>{entry.text}</li>
          ))}
        </ol>

        <footer>
          <p>Keys: arrows fold by 5° (Shift for 1°), O opens, C closes. Click outside the phone first.</p>
          <p>
            {ownCanvas ? (
              <a href="?sim">Load the demo blend</a>
            ) : (
              <a href="?sim&canvas">Use my own canvas</a>
            )}{' '}
            · The demo replaces the canvas saved in this browser.
          </p>
        </footer>
      </aside>
    </div>
  );
}
