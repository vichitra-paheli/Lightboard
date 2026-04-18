'use client';

import { useEffect, useState } from 'react';
import { LightboardSigil } from './lightboard-sigil';

/** Props for {@link SigilLoader}. */
export interface SigilLoaderProps {
  /** Visual size in CSS pixels. Forwarded to {@link LightboardSigil}. */
  size?: number;
  /** Interval between animation replays, in milliseconds. */
  intervalMs?: number;
  /** Optional class applied to the sigil root. */
  className?: string;
}

/**
 * Loading-state variant of {@link LightboardSigil}: continuously re-plays the
 * stroke-draw animation by bumping a replay counter on an interval.
 *
 * When the user prefers reduced motion we skip the interval and leave the
 * sigil as a static logomark — the sigil component itself already disables
 * the draw animation under that media query, so we avoid the pointless
 * re-render churn too.
 */
export function SigilLoader({ size = 20, intervalMs = 2000, className }: SigilLoaderProps) {
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    // Respect reduced-motion: leave the sigil static, skip the timer entirely.
    if (typeof window === 'undefined') return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    const id = window.setInterval(() => {
      setReplayKey((n) => n + 1);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return <LightboardSigil size={size} replayKey={replayKey} className={className} />;
}
