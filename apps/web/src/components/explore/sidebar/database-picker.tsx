'use client';

import { useEffect, useRef, useState } from 'react';
import type { DataSourceOption } from '../types';
import { Label } from './label';

/**
 * Maps a data source `type` to its accent dot color. Falls back to a muted
 * ink token for unknown / future source types so the UI never renders a
 * colorless dot.
 */
function kindColor(type: string | undefined): string {
  switch (type) {
    case 'postgres':
      return 'var(--kind-schema)';
    case 'snowflake':
      return 'var(--accent-warm)';
    case 'clickhouse':
      return 'var(--accent)';
    case 'bigquery':
      return 'var(--kind-compute)';
    default:
      return 'var(--ink-4)';
  }
}

/**
 * Props for {@link DatabasePicker}.
 */
interface DatabasePickerProps {
  sources: DataSourceOption[];
  selectedId: string | null;
  /** Called with the id of the newly-selected source. */
  onChange: (id: string) => void;
}

/**
 * Sidebar database picker. Replaces the prior top-of-page `<select>` with a
 * button-triggered dropdown that matches the editorial handoff:
 *
 * - Label eyebrow above the trigger.
 * - Kind-colored dot before the source name.
 * - Uppercase mono `type` on the right of each row.
 * - Active row has `--accent-bg` fill; the dropdown uses the `traceIn`
 *   keyframe for a subtle 180ms entry.
 *
 * Keyboard access: the trigger carries `data-db-picker-trigger` so Explore's
 * `Cmd+K` shortcut can focus it via `querySelector`. Clicking outside the
 * dropdown closes it.
 */
export function DatabasePicker({ sources, selectedId, onChange }: DatabasePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close when the user clicks outside the component so the dropdown behaves
  // like a standard popover. Scoped to document so the listener covers both
  // the main content area and the top bar.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const current = sources.find((s) => s.id === selectedId) ?? sources[0];

  return (
    <div ref={rootRef}>
      <Label>Database</Label>
      <button
        type="button"
        data-db-picker-trigger
        data-source-selector
        onClick={() => setOpen((prev) => !prev)}
        className="mt-1.5 flex w-full items-center gap-[10px] rounded-lg px-3 py-[9px] text-left transition-colors"
        style={{
          background: open ? 'var(--bg-6)' : 'var(--bg-4)',
          border: '1px solid var(--line-3)',
        }}
      >
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: kindColor(current?.type) }}
        />
        <span
          className="flex-1 truncate text-[13px]"
          style={{ color: 'var(--ink-1)' }}
        >
          {current?.name ?? 'Select…'}
        </span>
        {current?.type && (
          <span className="lb-mono-tag uppercase" style={{ fontSize: 9 }}>
            {current.type}
          </span>
        )}
      </button>

      {open && sources.length > 0 && (
        <div
          role="listbox"
          className="mt-1 rounded-lg p-1"
          style={{
            background: 'var(--bg-4)',
            border: '1px solid var(--line-3)',
            animation: 'traceIn 180ms var(--ease-out-quint) both',
          }}
        >
          {sources.map((s) => {
            const active = s.id === selectedId;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-[10px] rounded-md px-2.5 py-2 text-left transition-colors"
                style={{
                  background: active ? 'var(--accent-bg)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = 'var(--bg-6)';
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = 'transparent';
                }}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: kindColor(s.type) }}
                />
                <span
                  className="flex-1 truncate text-[12.5px]"
                  style={{ color: 'var(--ink-1)' }}
                >
                  {s.name}
                </span>
                <span className="lb-mono-tag uppercase" style={{ fontSize: 9 }}>
                  {s.type}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
