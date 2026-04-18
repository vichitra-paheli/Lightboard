import type { CSSProperties } from 'react';
import styles from './sigil.module.css';

/**
 * Geometric letter paths for the ten-letter "LIGHTBOARD" sigil.
 *
 * Each path is authored inside a `0 0 10 14` viewBox (10 wide, 14 tall) and is
 * drawn with a declared path length of 50 so every letter animates in at the
 * same visual rate regardless of its actual perimeter. Ported verbatim from
 * `Lightboard-handoff/project/components/Wordmark.jsx`.
 */
const LETTER_PATHS: Record<string, string> = {
  L: 'M2 1 L2 13 L8 13',
  I: 'M5 1 L5 13 M3 1 L7 1 M3 13 L7 13',
  G: 'M8.5 3.5 C7 1 3 1 2 4 L2 10 C3 13 7 13 8.5 10.5 L8.5 8 L5.5 8',
  H: 'M2 1 L2 13 M8 1 L8 13 M2 7 L8 7',
  T: 'M1 1 L9 1 M5 1 L5 13',
  B: 'M2 1 L2 13 L6 13 C9 13 9 7 6 7 L2 7 M2 7 L6 7 C9 7 9 1 6 1 L2 1',
  O: 'M2 4 C2 1 8 1 8 4 L8 10 C8 13 2 13 2 10 Z',
  A: 'M1 13 L5 1 L9 13 M2.8 9 L7.2 9',
  R: 'M2 13 L2 1 L6 1 C9 1 9 7 6 7 L2 7 M6 7 L8.5 13',
  D: 'M2 1 L2 13 L5 13 C9 13 9 1 5 1 Z',
};

/**
 * The ordered wordmark: each letter maps to a sigil palette CSS variable so a
 * future palette change in `globals.css` propagates automatically without
 * touching this file.
 */
const LETTERS: ReadonlyArray<{ ch: keyof typeof LETTER_PATHS; color: string }> = [
  { ch: 'L', color: 'var(--sigil-1)' },
  { ch: 'I', color: 'var(--sigil-2)' },
  { ch: 'G', color: 'var(--sigil-3)' },
  { ch: 'H', color: 'var(--sigil-4)' },
  { ch: 'T', color: 'var(--sigil-5)' },
  { ch: 'B', color: 'var(--sigil-6)' },
  { ch: 'O', color: 'var(--sigil-7)' },
  { ch: 'A', color: 'var(--sigil-8)' },
  { ch: 'R', color: 'var(--sigil-9)' },
  { ch: 'D', color: 'var(--sigil-10)' },
];

/** Declared SVG path length — used for both `pathLength` and `stroke-dasharray`. */
const PATH_LENGTH = 50;

/** Staggered draw-in delay per letter, in milliseconds. */
const LETTER_STAGGER_MS = 80;

/** Props for {@link LightboardSigil}. */
export interface LightboardSigilProps {
  /** Visual size in CSS pixels. Drives width/height via the letter metric. */
  size?: number;
  /** Base delay (ms) before the first letter begins drawing. */
  delay?: number;
  /**
   * Remount key — pass a changing value (e.g. a counter from an interval) to
   * restart the draw-in animation. Used by {@link SigilLoader}.
   */
  replayKey?: number | string;
  /** Optional class applied to the root `<svg>`. */
  className?: string;
}

/**
 * Animated LIGHTBOARD sigil: ten letters that draw in left-to-right as a
 * continuous tron-style filament.
 *
 * Colors are sourced from the `--sigil-1..10` design tokens. The draw-in
 * animation uses the `sigilDraw` keyframe and the `--ease-draw` + `--dur-sigil`
 * tokens, all defined in `globals.css`. Users with
 * `prefers-reduced-motion: reduce` see the wordmark appear instantly.
 *
 * This component is purely decorative when it appears inside branded surfaces
 * (top bars, loaders); it renders an `aria-label="Lightboard"` so that screen
 * readers still surface the product name.
 */
export function LightboardSigil({
  size = 20,
  delay = 0,
  replayKey = 0,
  className,
}: LightboardSigilProps) {
  // Tighter tracking than the 10-unit viewBox slot — matches the handoff.
  const letterW = size * 0.72;
  const letterH = size * 1.0;

  return (
    <svg
      key={replayKey}
      className={[styles.root, className].filter(Boolean).join(' ')}
      width={letterW * LETTERS.length}
      height={letterH * 1.1}
      viewBox={`0 0 ${10 * LETTERS.length} 15`}
      aria-label="Lightboard"
      role="img"
    >
      {LETTERS.map((letter, i) => {
        const letterDelay = delay + i * LETTER_STAGGER_MS;
        const groupStyle = {
          ['--sigil-delay' as keyof CSSProperties]: `${letterDelay}ms`,
        } as CSSProperties;
        return (
          <g
            key={`${String(replayKey)}-${i}`}
            className={styles.letter}
            transform={`translate(${i * 10} 0.5)`}
            style={groupStyle}
          >
            <path
              className={styles.halo}
              d={LETTER_PATHS[letter.ch]}
              stroke={letter.color}
              pathLength={PATH_LENGTH}
            />
            <path
              className={styles.stroke}
              d={LETTER_PATHS[letter.ch]}
              stroke={letter.color}
              pathLength={PATH_LENGTH}
            />
          </g>
        );
      })}
    </svg>
  );
}
