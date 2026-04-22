/**
 * Coordinates for the 12 rectangles that make up the logomark: two L-shaped
 * axis bars plus ten horizontal data rows whose varying indents trace a B.
 *
 * Ported verbatim from the design handoff (`Lightboard Logomark Spec.html` ·
 * `assets/lightboard-logomark.svg`). All values are absolute inside the
 * `0 0 100 100` viewBox so the mark scales pixel-cleanly at any integer
 * multiple.
 */
const AXIS_BARS: ReadonlyArray<{ x: number; y: number; w: number; h: number; r: number }> = [
  { x: 6, y: 6, w: 6, h: 86, r: 3 },
  { x: 6, y: 88, w: 88, h: 6, r: 3 },
];

const DATA_ROWS: ReadonlyArray<{ x: number; y: number; w: number }> = [
  { x: 22.0, y: 10.0, w: 44.64 },
  { x: 34.96, y: 17.78, w: 44.64 },
  { x: 43.6, y: 25.56, w: 39.6 },
  { x: 22.0, y: 33.33, w: 43.2 },
  { x: 25.6, y: 41.11, w: 36.0 },
  { x: 22.0, y: 48.89, w: 54.0 },
  { x: 40.0, y: 56.67, w: 46.8 },
  { x: 43.6, y: 64.44, w: 46.8 },
  { x: 22.0, y: 72.22, w: 51.84 },
  { x: 25.6, y: 80.0, w: 36.0 },
];

const ROW_HEIGHT = 3.6;
const ROW_RADIUS = 1.8;

/** Props for {@link LightboardLogomark}. */
export interface LightboardLogomarkProps {
  /** Visual size in CSS pixels. Drives both width and height. Minimum legible size is 20px. */
  size?: number;
  /**
   * Accessible label. Defaults to "Lightboard". Pass an empty string to mark
   * the mark as decorative — in that case the component renders with
   * `aria-hidden` and no role.
   */
  title?: string;
  /** Optional class applied to the root `<svg>`. */
  className?: string;
}

/**
 * Lightboard logomark — an L-shaped chart axis cradling ten data rows whose
 * indents trace the silhouette of a B.
 *
 * The mark is monochrome and inherits `currentColor`, so a parent can tint it
 * with a Tailwind text-color class or inline `color` style. Never recolor the
 * individual bars: per the brand spec, the rainbow palette belongs to the
 * wordmark (`LightboardSigil`); the logomark stays monochrome.
 */
export function LightboardLogomark({
  size = 20,
  title = 'Lightboard',
  className,
}: LightboardLogomarkProps) {
  const isDecorative = title === '';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      {...(isDecorative
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': title })}
    >
      {AXIS_BARS.map((bar, i) => (
        <rect
          key={`axis-${i}`}
          x={bar.x}
          y={bar.y}
          width={bar.w}
          height={bar.h}
          rx={bar.r}
          fill="currentColor"
        />
      ))}
      {DATA_ROWS.map((row, i) => (
        <rect
          key={`row-${i}`}
          x={row.x}
          y={row.y}
          width={row.w}
          height={ROW_HEIGHT}
          rx={ROW_RADIUS}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}
