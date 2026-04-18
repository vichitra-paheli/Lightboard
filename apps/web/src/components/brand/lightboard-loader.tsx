'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useTranslations } from 'next-intl';
import { SIGIL_PALETTE } from './sigil-palette';

/** Props for {@link LightboardLoader}. */
export interface LightboardLoaderProps {
  /** Bounding square in CSS pixels. Ignored if both {@link width} and {@link height} are supplied. */
  size?: number;
  /** Optional non-square width override. */
  width?: number;
  /** Optional non-square height override. */
  height?: number;
  /** Override the default concurrent beam count (2 at xs/sm, 3 at md, 5 at lg/xl). */
  beams?: number;
  /** Animation speed multiplier. 1 = default, <1 slower, >1 faster. */
  speed?: number;
  /** Arbitrary style overrides applied to the loader root. */
  style?: CSSProperties;
  /** Arbitrary className applied to the loader root. */
  className?: string;
  /**
   * Accessible label for screen readers. Overrides the default i18n lookup of
   * `common.loading`.
   */
  ariaLabel?: string;
}

/** Shape of a single in-flight beam on the rAF loop. */
interface Beam {
  id: number;
  horizontal: boolean;
  color: string;
  /** Lifetime in milliseconds. */
  duration: number;
  /** Whether this beam travels right→left (horizontal) or bottom→top (vertical). */
  reverse: boolean;
  /** Cross-axis coordinate, in CSS pixels, at the center of the lane. */
  pos: number;
  /** `performance.now()` timestamp at spawn (may be pre-dated for staggering). */
  start: number;
}

/**
 * Unified loading indicator — rainbow light-beam animation on a transparent
 * ground, reusing the login-backdrop visual language at every size.
 *
 * Sizing philosophy:
 * - {@link size} sets a bounding square (default 48px).
 * - {@link width} / {@link height} override for non-square strips.
 * - Beams travel along an internal 4-lane grid (pitch = S/4). Thickness,
 *   glow radius, and beam length scale with the shorter axis.
 * - Concurrent beam count auto-scales (2 at <28px, 3 at <80px, 5 beyond) —
 *   pass {@link beams} to override.
 *
 * The component respects `prefers-reduced-motion: reduce` by skipping the
 * rAF loop entirely and rendering a static rainbow "#" crosshatch — two
 * horizontal and two vertical beam segments at `S/4` and `3*S/4` on each
 * axis, one color each from {@link SIGIL_PALETTE}. Reads as a quiet
 * "rainbow hash" that echoes both the animated beams and the `#` glyph.
 *
 * Inline per-frame styles on beam elements are a documented exception to
 * the "no inline styles" rule — same rationale as `grid-backdrop.tsx`:
 * the values are rAF positional output and color-bearing gradient strings
 * that cannot be expressed as Tailwind utilities or CSS-module rules.
 */
export function LightboardLoader({
  size = 48,
  width,
  height,
  beams,
  speed = 1,
  style,
  className,
  ariaLabel,
}: LightboardLoaderProps) {
  const t = useTranslations('common');
  const label = ariaLabel ?? t('loading');

  const W = width ?? size;
  const H = height ?? size;
  const S = Math.min(W, H);

  const defaultBeams = S < 28 ? 2 : S < 80 ? 3 : 5;
  const beamCount = beams ?? defaultBeams;

  // Visual params scale with the shorter axis. Clamped so tiny loaders still
  // render a visible streak and huge loaders still have proportional glow.
  const thickness = Math.max(1, Math.round(S / 48));
  const glow = Math.max(4, Math.round(S / 6));
  const beamLen = Math.max(14, Math.round(S * 0.85));

  // Internal grid: four lanes across each axis. At smaller sizes we use all
  // lanes; at larger sizes we leave a 1-cell margin to avoid grazing edges.
  const pitch = S / 4;
  const edgeMargin = S >= 48 ? 1 : 0;

  // Probe reduced-motion *synchronously* via a useState initializer so the
  // rAF effect below sees the correct value on first run — deferring this to
  // a post-mount useEffect would let the animated branch kick off one rAF
  // cycle before being torn down. One-shot only: we don't subscribe to live
  // changes, mirroring `sigil-loader.tsx`.
  const [prefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  // Bumping `tick` forces a render each rAF frame. Beams themselves live in
  // a ref so we don't reallocate the array each tick.
  const [, setTick] = useState(0);
  const beamsRef = useRef<Beam[]>([]);
  const idRef = useRef(0);
  const rafRef = useRef(0);

  const makeBeam = useCallback(
    (now: number): Beam => {
      const id = idRef.current++;
      const horizontal = Math.random() > 0.5;
      const color =
        SIGIL_PALETTE[Math.floor(Math.random() * SIGIL_PALETTE.length)]!;
      const duration = (1400 + Math.random() * 1200) / speed;
      const reverse = Math.random() > 0.5;
      const laneCount = Math.floor((horizontal ? H : W) / pitch);
      const minLane = edgeMargin;
      const maxLane = Math.max(minLane + 1, laneCount - edgeMargin);
      const lane = minLane + Math.floor(Math.random() * (maxLane - minLane));
      const pos = lane * pitch + pitch / 2;
      return { id, horizontal, color, duration, reverse, pos, start: now };
    },
    [W, H, pitch, edgeMargin, speed],
  );

  useEffect(() => {
    if (prefersReducedMotion) return;

    const t0 = performance.now();
    beamsRef.current = [];
    for (let i = 0; i < beamCount; i += 1) {
      const b = makeBeam(t0);
      // Stagger: offset start times by evenly spaced fractions of duration
      // so the loader never begins with a blank frame.
      b.start = t0 - (i * b.duration) / beamCount;
      beamsRef.current.push(b);
    }

    const loop = (now: number) => {
      beamsRef.current = beamsRef.current.map((b) =>
        now - b.start >= b.duration ? makeBeam(now) : b,
      );
      setTick((n) => (n + 1) % 1000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [beamCount, makeBeam, prefersReducedMotion]);

  const rootStyle: CSSProperties = {
    position: 'relative',
    width: W,
    height: H,
    overflow: 'hidden',
    display: 'inline-block',
    ...style,
  };

  if (prefersReducedMotion) {
    return (
      <div
        role="status"
        aria-label={label}
        className={className}
        style={rootStyle}
      >
        <ReducedMotionCrosshatch
          W={W}
          H={H}
          thickness={thickness}
          glow={glow}
        />
      </div>
    );
  }

  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  return (
    <div
      role="status"
      aria-label={label}
      className={className}
      style={rootStyle}
    >
      {beamsRef.current.map((beam) => (
        <LoaderBeam
          key={beam.id}
          beam={beam}
          now={now}
          W={W}
          H={H}
          beamLen={beamLen}
          thickness={thickness}
          glow={glow}
        />
      ))}
    </div>
  );
}

/** Props for a single animated {@link LoaderBeam}. */
interface LoaderBeamProps {
  beam: Beam;
  now: number;
  W: number;
  H: number;
  beamLen: number;
  thickness: number;
  glow: number;
}

/**
 * One streaking beam — either horizontal (rides a row) or vertical (rides a
 * column), fading in at 12% of its lifetime and fading out at 88%.
 */
function LoaderBeam({
  beam,
  now,
  W,
  H,
  beamLen,
  thickness,
  glow,
}: LoaderBeamProps) {
  const t = (now - beam.start) / beam.duration;
  if (t < 0 || t > 1) return null;

  const opacity = t < 0.12 ? t / 0.12 : t > 0.88 ? (1 - t) / 0.12 : 1;
  const borderRadius = Math.max(1, Math.round(thickness / 2));
  const boxShadow = `0 0 ${glow}px ${beam.color}, 0 0 ${glow * 2}px ${beam.color}66`;

  if (beam.horizontal) {
    const startX = beam.reverse ? W + beamLen : -beamLen;
    const endX = beam.reverse ? -beamLen : W + beamLen;
    const x = startX + (endX - startX) * t;
    const gradient = beam.reverse
      ? `linear-gradient(270deg, rgba(0,0,0,0) 0%, ${beam.color} 40%, ${beam.color} 80%, #ffffff 100%)`
      : `linear-gradient(90deg, rgba(0,0,0,0) 0%, ${beam.color} 40%, ${beam.color} 80%, #ffffff 100%)`;
    const style: CSSProperties = {
      position: 'absolute',
      top: beam.pos - thickness / 2,
      left: x,
      width: beamLen,
      height: thickness,
      background: gradient,
      borderRadius,
      boxShadow,
      opacity,
      pointerEvents: 'none',
    };
    return <div style={style} />;
  }

  const startY = beam.reverse ? H + beamLen : -beamLen;
  const endY = beam.reverse ? -beamLen : H + beamLen;
  const y = startY + (endY - startY) * t;
  const gradient = beam.reverse
    ? `linear-gradient(0deg, rgba(0,0,0,0) 0%, ${beam.color} 40%, ${beam.color} 80%, #ffffff 100%)`
    : `linear-gradient(180deg, rgba(0,0,0,0) 0%, ${beam.color} 40%, ${beam.color} 80%, #ffffff 100%)`;
  const style: CSSProperties = {
    position: 'absolute',
    left: beam.pos - thickness / 2,
    top: y,
    width: thickness,
    height: beamLen,
    background: gradient,
    borderRadius,
    boxShadow,
    opacity,
    pointerEvents: 'none',
  };
  return <div style={style} />;
}

/** Props for the reduced-motion {@link ReducedMotionCrosshatch}. */
interface ReducedMotionCrosshatchProps {
  W: number;
  H: number;
  thickness: number;
  glow: number;
}

/**
 * Static rainbow `#` crosshatch shown instead of the animated beam loop when
 * the user prefers reduced motion. Two horizontal and two vertical full-width
 * / full-height segments sit at `S/4` and `3*S/4` on each axis; each segment
 * takes a deterministic color from {@link SIGIL_PALETTE} so the same loader
 * instance always renders the same pattern. Thickness, glow, and border
 * radius match the animated path so the visual weight is consistent.
 */
function ReducedMotionCrosshatch({
  W,
  H,
  thickness,
  glow,
}: ReducedMotionCrosshatchProps) {
  const borderRadius = Math.max(1, Math.round(thickness / 2));

  // Four deterministic colors — one per segment. Staying inside the first
  // four palette entries keeps the crosshatch warm-side, echoing the sigil.
  const segments: Array<{
    horizontal: boolean;
    pos: number;
    color: string;
  }> = [
    { horizontal: true, pos: H / 4, color: SIGIL_PALETTE[0] },
    { horizontal: true, pos: (3 * H) / 4, color: SIGIL_PALETTE[1] },
    { horizontal: false, pos: W / 4, color: SIGIL_PALETTE[2] },
    { horizontal: false, pos: (3 * W) / 4, color: SIGIL_PALETTE[3] },
  ];

  return (
    <>
      {segments.map((seg, i) => {
        const boxShadow = `0 0 ${glow}px ${seg.color}, 0 0 ${glow * 2}px ${seg.color}66`;
        const style: CSSProperties = seg.horizontal
          ? {
              position: 'absolute',
              top: seg.pos - thickness / 2,
              left: 0,
              width: W,
              height: thickness,
              background: seg.color,
              borderRadius,
              boxShadow,
              opacity: 1,
              pointerEvents: 'none',
            }
          : {
              position: 'absolute',
              left: seg.pos - thickness / 2,
              top: 0,
              width: thickness,
              height: H,
              background: seg.color,
              borderRadius,
              boxShadow,
              opacity: 1,
              pointerEvents: 'none',
            };
        return <div key={i} style={style} />;
      })}
    </>
  );
}
