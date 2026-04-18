'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useUiStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

import { LightboardLoader } from '../brand';

/**
 * Collapsible 240px left sidebar. Primary nav was removed in PR 3 (it lives
 * in the centered top bar now); this container hosts the per-route slot
 * (installed via `useUiStore.setSidebarSlot`) plus a sticky logout footer.
 *
 * When `sidebarOpen` is `false` the sidebar collapses to `width: 0` with
 * `overflow: hidden` — a full hide, not an icon rail. The width + border
 * transition uses `--ease-out-quint` over 280ms so collapse feels coherent
 * with the rest of the shell motion.
 *
 * The slot contents come from the UI store rather than props so any client
 * component can inject sidebar widgets without threading providers through
 * every layout. Routes that need sidebar content (e.g. Explore's DB picker)
 * call `setSidebarSlot` on mount and clear it on unmount.
 */
export function Sidebar() {
  const t = useTranslations('nav');
  const open = useUiStore((s) => s.sidebarOpen);
  const slot = useUiStore((s) => s.sidebarSlot);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Swallow — the hard navigation below forces a redirect through the
      // login page regardless of the fetch outcome, so there's nothing to
      // surface to the user here.
    }
    // Use hard navigation to clear all client state and let middleware redirect.
    window.location.href = '/login';
  }

  return (
    <aside
      aria-label="Sidebar"
      data-open={open ? 'true' : 'false'}
      className={cn(
        'flex h-full flex-none flex-col overflow-y-auto',
        // Collapsed: width 0, hidden content, transparent border so the
        // top-bar's bottom-border remains continuous across the edge.
        !open && 'overflow-hidden',
      )}
      style={{
        width: open ? 240 : 0,
        background: 'var(--bg-1)',
        borderRight: open ? '1px solid var(--line-1)' : '1px solid transparent',
        padding: open ? '16px 14px' : '16px 0',
        gap: 16,
        transition:
          'width 280ms var(--ease-out-quint), border-color 280ms var(--ease-out-quint), padding 280ms var(--ease-out-quint)',
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4">{slot}</div>

      <div className="flex-none pt-2">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="inline-flex items-center gap-2 rounded-md px-1 py-1 text-left text-[12.5px] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-warm)] disabled:opacity-80"
          style={{ fontFamily: 'var(--font-body), Inter, system-ui, sans-serif' }}
        >
          {loggingOut && <LightboardLoader size={12} ariaLabel="" />}
          <span>{loggingOut ? t('loggingOut') : t('logout')}</span>
        </button>
      </div>
    </aside>
  );
}
