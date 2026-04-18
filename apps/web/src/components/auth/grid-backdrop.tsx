'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import styles from './grid-backdrop.module.css';

/**
 * Palette for the streaking traces. These literal hex values mirror the
 * `--sigil-1..10` tokens in `globals.css`; they are duplicated here because
 * each trace needs its color baked into a `linear-gradient(...)` and a
 * `box-shadow` string at spawn time — a `var(--sigil-1)` inside those strings
 * would pin every trace to the same runtime value instead of capturing the
 * chosen one. If the sigil palette changes, update this array in lockstep.
 */
const TRACE_COLORS = [
  '#F4A261',
  '#E76F51',
  '#E9C46A',
  '#D9A441',
  '#8AB4B8',
  '#5E8B95',
  '#6A7BA2',
  '#B08CA8',
  '#D4846F',
] as const;

/** Grid pitch (one square edge, in CSS pixels). Matches the handoff. */
const GRID_PITCH = 48;

/** Length (along-axis) of a single light trace, in CSS pixels. */
const TRACE_LENGTH = 240;

/** Cross-axis thickness of a trace. */
const TRACE_THICKNESS = 1.6;

/** Base blur radius for the trace glow. */
const TRACE_GLOW = 16;

/** Spawn cadence (ms between new traces once the initial burst is done). */
const SPAWN_INTERVAL_MS = 900;

/**
 * Shape of one live trace. Positions are in screen pixels, pre-offset, so the
 * render pass only has to interpolate `start → end` by the clock.
 */
interface ActiveTrace {
  id: number;
  color: string;
  duration: number;
  horizontal: boolean;
  reverse: boolean;
  start: number;
  /** Fixed cross-axis position on a grid line (48px multiples). */
  x?: number;
  y?: number;
}

interface Dims {
  w: number;
  h: number;
}

/**
 * Decorative full-viewport grid canvas with streaking multicolor traces.
 *
 * - `aria-hidden` because it carries no semantic content.
 * - Respects `prefers-reduced-motion: reduce`: the SVG grid + vignette still
 *   render, but the requestAnimationFrame trace loop is skipped entirely so
 *   nothing animates.
 * - All static styling lives in the companion CSS module + SVG patterns using
 *   the `--line-*` and `--bg-*` design tokens. Only the per-frame `top`/`left`
 *   and color-bearing gradient/box-shadow on individual trace elements are
 *   inline — that is genuinely dynamic state and cannot live in a stylesheet.
 */
export function GridBackdrop() {
  return (
    <div aria-hidden="true" className={styles.root}>
      <svg className={styles.svg} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id="lb-grid"
            width={GRID_PITCH}
            height={GRID_PITCH}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${GRID_PITCH} 0 L 0 0 0 ${GRID_PITCH}`}
              fill="none"
              stroke="var(--line-3)"
              strokeWidth="1"
            />
          </pattern>
          <radialGradient id="lb-vignette" cx="50%" cy="50%" r="65%">
            <stop offset="0%" stopColor="var(--bg-0)" stopOpacity="0" />
            <stop offset="75%" stopColor="var(--bg-0)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--bg-0)" stopOpacity="1" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#lb-grid)" />
        <rect width="100%" height="100%" fill="url(#lb-vignette)" />
      </svg>
      <TraceField />
    </div>
  );
}

/**
 * Spawns and animates the colored light traces on a requestAnimationFrame
 * loop. Skipped entirely under `prefers-reduced-motion: reduce` — callers in
 * that branch just see the static grid + vignette.
 */
function TraceField() {
  const [dims, setDims] = useState<Dims>({ w: 1280, h: 800 });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  // Bump this on each rAF tick to force a re-render; the actual trace state
  // lives in `tracesRef` so we don't reallocate on every frame.
  const [, setTick] = useState(0);
  const tracesRef = useRef<ActiveTrace[]>([]);
  const idRef = useRef(0);
  const lastSpawnRef = useRef(0);

  // Resize tracker — trace loop needs current viewport size to compute start
  // and end positions off-screen.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  // Reduced-motion probe — one-shot; we don't subscribe to changes mid-session
  // because swapping reduced-motion live would require tearing down the rAF
  // loop and the UX payoff isn't worth the extra wiring.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setPrefersReducedMotion(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const cols = Math.max(8, Math.floor(dims.w / GRID_PITCH));
    const rows = Math.max(6, Math.floor(dims.h / GRID_PITCH));

    const spawn = (now: number) => {
      const id = idRef.current++;
      const horizontal = Math.random() > 0.5;
      const color = TRACE_COLORS[Math.floor(Math.random() * TRACE_COLORS.length)]!;
      const duration = 5000 + Math.random() * 3500;
      const reverse = Math.random() > 0.5;

      const trace: ActiveTrace = {
        id,
        color,
        duration,
        horizontal,
        reverse,
        start: now,
      };
      if (horizontal) {
        const row = 2 + Math.floor(Math.random() * (rows - 4));
        trace.y = row * GRID_PITCH;
      } else {
        const col = 2 + Math.floor(Math.random() * (cols - 4));
        trace.x = col * GRID_PITCH;
      }
      tracesRef.current.push(trace);
    };

    // Initial stagger — seed five traces across the lifetime window so the
    // canvas never starts empty.
    const startNow = performance.now();
    for (let i = 0; i < 5; i += 1) spawn(startNow - i * SPAWN_INTERVAL_MS);

    let raf = 0;
    const loop = (now: number) => {
      tracesRef.current = tracesRef.current.filter(
        (t) => now - t.start < t.duration,
      );
      if (now - lastSpawnRef.current > SPAWN_INTERVAL_MS) {
        spawn(now);
        lastSpawnRef.current = now;
      }
      setTick((n) => (n + 1) % 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dims.w, dims.h, prefersReducedMotion]);

  if (prefersReducedMotion) return null;

  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  return (
    <div className={styles.traceField}>
      {tracesRef.current.map((trace) => (
        <Trace key={trace.id} trace={trace} now={now} dims={dims} />
      ))}
    </div>
  );
}

/** Props for an individual {@link Trace}. */
interface TraceProps {
  trace: ActiveTrace;
  now: number;
  dims: Dims;
}

/**
 * One streaking light trace — either horizontal (rides a grid row) or
 * vertical (rides a grid column), fading in at the start of its lifetime and
 * out at the end.
 */
function Trace({ trace, now, dims }: TraceProps) {
  const t = (now - trace.start) / trace.duration;
  if (t < 0 || t > 1) return null;

  // Fade in/out at edges of lifetime.
  const opacity = t < 0.08 ? t / 0.08 : t > 0.92 ? (1 - t) / 0.08 : 1;

  if (trace.horizontal) {
    const startX = trace.reverse ? dims.w + TRACE_LENGTH : -TRACE_LENGTH;
    const endX = trace.reverse ? -TRACE_LENGTH : dims.w + TRACE_LENGTH;
    const x = startX + (endX - startX) * t;
    const gradient = trace.reverse
      ? `linear-gradient(270deg, rgba(0,0,0,0) 0%, ${trace.color} 40%, ${trace.color} 80%, #ffffff 100%)`
      : `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${trace.color} 40%, ${trace.color} 80%, #ffffff 100%)`;
    // Inline style is scoped to genuinely dynamic per-frame values: position,
    // gradient direction + color, and color-bearing glow. Everything static
    // about "I am a trace" lives on `.trace` in the CSS module.
    const style: CSSProperties = {
      top: (trace.y ?? 0) - TRACE_THICKNESS / 2,
      left: x,
      width: TRACE_LENGTH,
      height: TRACE_THICKNESS,
      background: gradient,
      boxShadow: `0 0 ${TRACE_GLOW}px ${trace.color}, 0 0 ${TRACE_GLOW * 2.5}px ${trace.color}66`,
      opacity,
    };
    return <div className={styles.trace} style={style} />;
  }

  const startY = trace.reverse ? dims.h + TRACE_LENGTH : -TRACE_LENGTH;
  const endY = trace.reverse ? -TRACE_LENGTH : dims.h + TRACE_LENGTH;
  const y = startY + (endY - startY) * t;
  const gradient = trace.reverse
    ? `linear-gradient(0deg, rgba(0,0,0,0) 0%, ${trace.color} 40%, ${trace.color} 80%, #ffffff 100%)`
    : `linear-gradient(180deg, rgba(0,0,0,0) 0%, ${trace.color} 40%, ${trace.color} 80%, #ffffff 100%)`;
  const style: CSSProperties = {
    left: (trace.x ?? 0) - TRACE_THICKNESS / 2,
    top: y,
    width: TRACE_THICKNESS,
    height: TRACE_LENGTH,
    background: gradient,
    boxShadow: `0 0 ${TRACE_GLOW}px ${trace.color}, 0 0 ${TRACE_GLOW * 2.5}px ${trace.color}66`,
    opacity,
  };
  return <div className={styles.trace} style={style} />;
}
