'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Local-storage key for the composer's persisted height. Matches the design
 * handoff so manual drag-resizes survive reload.
 */
const STORAGE_KEY = 'lb:composerH';
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 360;
const DEFAULT_HEIGHT = 120;

/**
 * Metadata used to build the mono dek under the composer. At minimum we
 * render the source name; tables/rows are rendered only when both are set.
 */
export interface ComposerSourceMeta {
  name: string;
  tables?: number;
  rows?: number;
}

/**
 * Props for {@link Composer}.
 */
interface ComposerProps {
  onSend: (text: string) => void;
  onStop: () => void;
  disabled?: boolean;
  isStreaming?: boolean;
  /**
   * Active source metadata; if set, renders a left-side mono dek like
   * `cricket · 24 tables · 42.1M rows`. Passing just a `name` renders the
   * name alone.
   */
  selectedSourceMeta?: ComposerSourceMeta | null;
}

/**
 * Format large numbers with SI-style suffixes so `42100000` reads as
 * `42.1M`. Keeps the dek narrow enough to fit next to the keyboard-hint.
 */
function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * Centered chat composer pinned to the bottom of the Explore main area.
 *
 * Structure (matching the handoff):
 * - A draggable 36x3 pill handle at the top edge for manual resize
 *   (ns-resize). Height clamps to `[80, 360]` and persists to
 *   `localStorage['lb:composerH']`.
 * - A `--bg-4` card with a border that warms to `--accent-border` on focus
 *   and contains the textarea plus an icon row.
 * - Icon row: three leading icons (attach, run-as-SQL, attach-view)
 *   rendered as disabled no-ops for this PR, plus a trailing send/stop
 *   button with hover-lift + shadow-pop.
 * - Mono footer row below the card: data-source dek on the left, keyboard
 *   hints on the right.
 *
 * Keyboard: `⌘⏎` / `Ctrl⏎` sends; plain `⏎` newlines.
 */
export function Composer({
  onSend,
  onStop,
  disabled,
  isStreaming,
  selectedSourceMeta,
}: ComposerProps) {
  const t = useTranslations('explore');
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [height, setHeight] = useState<number>(DEFAULT_HEIGHT);
  const [hydrated, setHydrated] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Hydrate the height from localStorage on client mount so SSR and the
  // initial client render both match the DEFAULT_HEIGHT and avoid a
  // hydration mismatch.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= MIN_HEIGHT && parsed <= MAX_HEIGHT) {
        setHeight(parsed);
      }
    } catch {
      // localStorage can throw in sandboxed iframes — the default height is
      // the correct fallback.
    }
    setHydrated(true);
  }, []);

  // Persist the height whenever it changes post-hydration. We gate on
  // `hydrated` to avoid clobbering the stored value during the initial
  // client render (before we've had a chance to read it).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(height));
    } catch {
      // Ignore — persistence is best-effort.
    }
  }, [height, hydrated]);

  const canSend = value.trim().length > 0 && !disabled && !isStreaming;

  const doSend = useCallback(() => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
  }, [canSend, onSend, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl + Enter sends; plain Enter inserts a newline (default).
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        doSend();
      }
    },
    [doSend],
  );

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = height;
      function onMove(ev: MouseEvent) {
        const dy = startY - ev.clientY;
        const next = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startH + dy));
        setHeight(next);
      }
      function onUp() {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      }
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [height],
  );

  const dek = buildDek(selectedSourceMeta);

  return (
    <div
      className="relative flex-none"
      style={{
        background: 'var(--bg-2)',
        borderTop: '1px solid var(--line-1)',
      }}
    >
      {/* Drag handle */}
      <button
        type="button"
        aria-label="Resize composer"
        data-composer-drag-handle
        onMouseDown={startDrag}
        className="absolute left-0 right-0 flex h-2 items-center justify-center"
        style={{
          top: -4,
          cursor: 'ns-resize',
          background: 'transparent',
          border: 0,
          padding: 0,
          zIndex: 3,
        }}
      >
        <span
          aria-hidden="true"
          className="block rounded-full"
          style={{
            width: 36,
            height: 3,
            background: 'var(--line-4)',
            transition: 'background 160ms var(--ease-out-quint)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLSpanElement).style.background =
              'var(--accent)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLSpanElement).style.background =
              'var(--line-4)';
          }}
        />
      </button>

      <div style={{ padding: '16px 48px 20px' }}>
        <div
          className="mx-auto flex flex-col gap-2.5"
          style={{
            maxWidth: 920,
            height,
            padding: '12px 14px',
            borderRadius: 14,
            border: `1px solid ${focused ? 'var(--accent-border)' : 'var(--line-3)'}`,
            background: 'var(--bg-4)',
            transition: 'border-color 180ms var(--ease-out-quint)',
          }}
        >
          <textarea
            ref={textareaRef}
            data-composer-textarea
            value={value}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('composerPlaceholder')}
            disabled={disabled}
            className="flex-1 resize-none"
            style={{
              background: 'transparent',
              outline: 'none',
              border: 'none',
              color: 'var(--ink-1)',
              fontFamily: 'var(--font-body), Inter, system-ui, sans-serif',
              fontSize: 14,
              lineHeight: 1.55,
              padding: '4px 2px',
              overflow: 'auto',
            }}
          />

          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              <ComposerIcon title={t('attach')} disabled>
                {/* TODO: wire attachments once backend is ready */}
                <path
                  d="M9.5 4.5L4 10a2 2 0 102.8 2.8L12 7.5a3.5 3.5 0 00-5-5L1.8 7.7"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  fill="none"
                />
              </ComposerIcon>
              <ComposerIcon title={t('runAsSQL')} disabled>
                {/* TODO: wire run-as-SQL toggle once backend supports it */}
                <path
                  d="M3 3v8l7-4-7-4z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                  strokeLinejoin="round"
                />
              </ComposerIcon>
              <ComposerIcon title={t('attachView')} disabled>
                {/* TODO: wire view attachments once backend is ready */}
                <rect
                  x="2"
                  y="3"
                  width="9"
                  height="7"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                />
                <path d="M2 6h9" stroke="currentColor" strokeWidth="1.1" />
              </ComposerIcon>
            </div>

            {isStreaming ? (
              <StopButton onClick={onStop} label={t('stop')} />
            ) : (
              <SendButton onClick={doSend} enabled={canSend} label={t('send')} />
            )}
          </div>
        </div>

        {/* Mono keyboard-hint row */}
        <div
          className="mx-auto mt-2 flex items-center justify-between"
          style={{
            maxWidth: 920,
            fontFamily: 'var(--font-mono), JetBrains Mono, ui-monospace, monospace',
            fontSize: 9.5,
            letterSpacing: '0.08em',
            color: 'var(--ink-6)',
            textTransform: 'uppercase',
          }}
        >
          <span>{dek}</span>
          <span>{t('composerHint')}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Build the left-side dek string from source metadata. Returns an empty
 * string when no source is selected so the row simply shows the keyboard
 * hint on the right.
 */
function buildDek(meta: ComposerSourceMeta | null | undefined): string {
  if (!meta) return '';
  const { name, tables, rows } = meta;
  if (typeof tables === 'number' && typeof rows === 'number') {
    return `${name} · ${tables} tables · ${formatCount(rows)} rows`;
  }
  return name;
}

/**
 * 30x30 composer icon button. Currently renders with `cursor: not-allowed`
 * because attach / run-as-SQL / attach-view are not wired yet; the shape
 * is in the DOM so PR 7+ can enable them without re-ordering the row.
 */
function ComposerIcon({
  children,
  title,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-md transition-colors"
      style={{
        color: 'var(--ink-5)',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = 'var(--bg-7)';
        e.currentTarget.style.color = 'var(--ink-1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--ink-5)';
      }}
    >
      <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

/**
 * Rounded-pill send button. Uses `--ink-1` as the fill on the "enabled"
 * variant and lifts by 1px with a warm shadow on hover for the editorial
 * pop. The disabled variant falls back to a muted surface + ink.
 */
function SendButton({
  onClick,
  enabled,
  label,
}: {
  onClick: () => void;
  enabled: boolean;
  label: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      data-composer-send
      onClick={onClick}
      disabled={!enabled}
      aria-label={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-medium"
      style={{
        background: enabled ? 'var(--ink-1)' : 'var(--bg-7)',
        color: enabled ? 'var(--bg-0)' : 'var(--ink-5)',
        cursor: enabled ? 'pointer' : 'not-allowed',
        transition: 'all 180ms var(--ease-out-quint)',
        transform: hover && enabled ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hover && enabled ? 'var(--shadow-pop)' : 'none',
      }}
    >
      <span>{label}</span>
      <svg
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
        style={{
          transition: 'transform 180ms var(--ease-out-quint)',
          transform: hover && enabled ? 'translateX(2px)' : 'translateX(0)',
        }}
      >
        <path
          d="M1 5h7M5 1l4 4-4 4"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </button>
  );
}

/**
 * Rounded-pill stop button shown while a stream is in flight. Uses the
 * destructive surface so users can't confuse it with the send affordance.
 */
function StopButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      data-composer-stop
      onClick={onClick}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-medium transition-colors"
      style={{
        background: 'var(--color-destructive)',
        color: 'var(--color-destructive-foreground)',
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" />
      </svg>
      <span>{label}</span>
    </button>
  );
}

// Exposed for unit tests so we can assert the dek formatter without
// stubbing Intl / next-intl.
export const __testing = { buildDek, formatCount };
