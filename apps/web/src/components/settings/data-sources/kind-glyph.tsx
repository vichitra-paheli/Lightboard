import { getKindMeta } from './kind-meta';

/** Props for {@link KindGlyph}. */
export interface KindGlyphProps {
  /** Datasource type key (e.g. `postgres`). */
  kind: string;
  /** Pixel size of the square tile. Defaults to 32. */
  size?: number;
}

/**
 * Two-letter monogram tile identifying a datasource's connector type.
 * Mirrors the handoff `KindGlyph` but pulls label + dot from the shared
 * kind-meta map so connectors we add later inherit the styling for free.
 */
export function KindGlyph({ kind, size = 32 }: KindGlyphProps) {
  const meta = getKindMeta(kind);
  const dotSize = Math.round(size * 0.16);
  const dotOffset = Math.round(size * 0.125);
  const fontSize = Math.max(9, Math.round(size * 0.33));
  return (
    <div
      className="relative flex flex-none items-center justify-center rounded-[7px] border border-[var(--line-3)] bg-[var(--bg-4)]"
      style={{ width: size, height: size }}
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          top: dotOffset,
          left: dotOffset,
          width: dotSize,
          height: dotSize,
          background: meta.dot,
        }}
      />
      <span
        className="font-medium text-[var(--ink-2)]"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize,
          letterSpacing: '0.02em',
        }}
      >
        {meta.glyph}
      </span>
    </div>
  );
}
