// Presentation timing is independent of model progress. It starts only with a rendered result.
export function gameTimeline(elapsed, count = 1) {
  const time = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  const waves = Math.max(1, Math.min(2, count));
  const length = waves === 1 ? 6.6 : 3.6;
  const index = Math.min(waves - 1, Math.floor(time / length));
  const phase = Math.min(3.6, (time - index * length) * 3.6 / length);
  return { time, waves, length, index, phase, busy: time < waves * length, done: time >= 8.5,
    collision: phase >= 2.35 && phase < 2.85 && time < waves * length,
    revealed: Array.from({ length: waves }, (_, i) => time >= (i + 3.1 / 3.6) * length) };
}
