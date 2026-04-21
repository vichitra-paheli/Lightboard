'use client';

import type { NarrationBlock } from '../chat-message';

/**
 * Props for {@link KeyTakeaways}.
 *
 * This is a view-layer mirror of the backend {@link NarrationBlock} — kept
 * inline rather than importing the backend type because the component is
 * purely visual and the caller already has the shape in hand.
 */
interface KeyTakeawaysProps {
  bullets: NarrationBlock['bullets'];
  caveat?: string;
}

/**
 * Format a bullet's rank as a two-digit monospace number (01 / 02 / 03).
 * Matches the design reference's zero-padded column.
 */
function formatRank(rank: 1 | 2 | 3): string {
  return `0${rank}`;
}

/**
 * Renders the structured KEY TAKEAWAYS block that ends a data turn. Three
 * numbered rows with bold headlines and amber-highlighted signed values,
 * optionally followed by an interpretation-note banner when the model
 * emitted a caveat.
 *
 * Ports `TakeawaysBlock` from `Lightboard-design/components/AgentTrace.jsx`
 * (~lines 339-406). Colors come from CSS tokens already in globals.css:
 * `--ink-1` / `--ink-5` / `--ink-6` for text hierarchy, `--accent` / `--accent-bg` /
 * `--accent-border` / `--accent-ink` for the caveat banner, `--font-mono` and
 * `--font-body` for typography.
 *
 * No emojis — the leading glyph on the caveat row is a unicode warning sign
 * (`⚠`) rendered in the mono font, matching the design kit's rule that UI
 * microcopy may use unicode glyphs but not emoji.
 */
export function KeyTakeaways({ bullets, caveat }: KeyTakeawaysProps) {
  if (!bullets || bullets.length === 0) return null;

  return (
    <div
      className="ml-[40px]"
      style={{
        padding: '18px 22px 20px',
        borderTop: '1px solid var(--line-2, #1A1A1E)',
        background: 'var(--bg-1, #0C0C0F)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
          fontSize: 11,
          letterSpacing: '0.14em',
          fontWeight: 500,
          textTransform: 'uppercase',
          color: 'var(--ink-6, #6B6B73)',
          marginBottom: 10,
        }}
      >
        Key takeaways
      </div>

      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          fontFamily: 'var(--font-body), Inter, system-ui, -apple-system, sans-serif',
          fontSize: 13,
          color: 'var(--ink-3, #BDBDC4)',
          lineHeight: 1.55,
        }}
      >
        {bullets.map((b) => (
          <li
            key={b.rank}
            style={{
              display: 'grid',
              gridTemplateColumns: '22px 1fr',
              alignItems: 'baseline',
              padding: '4px 0',
            }}
          >
            <span
              style={{
                fontFamily:
                  'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
                fontSize: 10,
                color: 'var(--ink-5, #55555C)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatRank(b.rank)}
            </span>
            <span>
              <b style={{ color: 'var(--ink-1, #EDEDEE)', fontWeight: 600 }}>
                {b.headline}
              </b>
              {b.value ? (
                <>
                  {' '}
                  <b
                    style={{
                      color: 'var(--accent, #F2C265)',
                      fontWeight: 600,
                      fontFamily:
                        'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {b.value}
                  </b>
                </>
              ) : null}
              {b.body ? <> — {b.body}</> : null}
            </span>
          </li>
        ))}
      </ol>

      {caveat ? (
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--accent-bg, #15120B)',
            border: '1px solid var(--accent-border, #3B2E14)',
            fontFamily: 'var(--font-body), Inter, system-ui, -apple-system, sans-serif',
            fontSize: 12,
            color: 'var(--accent-ink, #D9A441)',
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              fontFamily:
                'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
              fontSize: 10,
              marginTop: 2,
            }}
          >
            ⚠
          </span>
          <span>
            <b>Interpretation note</b> — {caveat}
          </span>
        </div>
      ) : null}
    </div>
  );
}
