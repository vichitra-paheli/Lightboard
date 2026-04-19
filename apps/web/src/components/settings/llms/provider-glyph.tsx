import { getProvider } from './provider-catalog';

/** Props for {@link ProviderGlyph}. */
export interface ProviderGlyphProps {
  /** Provider key (e.g. `anthropic`, `openai-compatible`). */
  provider: string;
  /** Size in pixels — tiles use 24, cards 36. Defaults to 36. */
  size?: number;
}

/**
 * Two-letter monogram tile with a tinted dot in the top-left.
 * Matches the handoff `ProviderGlyph` component, but colour + letters come
 * from the shared {@link PROVIDERS} catalog so there's one source of truth.
 */
export function ProviderGlyph({ provider, size = 36 }: ProviderGlyphProps) {
  const entry = getProvider(provider);
  const glyph = entry?.glyph ?? '??';
  const dot = entry?.dot ?? 'var(--ink-5)';
  const dotSize = Math.round(size * 0.14);
  const dotOffset = Math.round(size * 0.11);
  const fontSize = Math.max(8, Math.round(size * 0.31));

  return (
    <div
      className="relative flex flex-none items-center justify-center rounded-[8px] border border-[var(--line-3)] bg-[var(--bg-4)]"
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
          background: dot,
        }}
      />
      <span
        className="text-[var(--ink-2)]"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize,
          letterSpacing: '0.02em',
        }}
      >
        {glyph}
      </span>
    </div>
  );
}
