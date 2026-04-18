'use client';

import { useTranslations } from 'next-intl';
import { useUiStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';

/**
 * Props for {@link Sidebar}.
 */
export interface SidebarProps {
  /**
   * Per-route sidebar content. Each route that needs sidebar widgets
   * (Explore's DB picker + conversations list, etc.) passes its own tree
   * here via `AppShell`'s `sidebarSlot` prop. Routes that don't need a
   * sidebar panel pass `undefined` — the container still renders so the
   * collapse animation remains consistent.
   */
  children?: React.ReactNode;
}

/**
 * Collapsible 240px left sidebar. Primary nav was removed in PR 3 (it lives
 * in the centered top bar now); this container is now purely a slot + a
 * logout footer.
 *
 * When `sidebarOpen` is `false` the sidebar collapses to `width: 0` with
 * `overflow: hidden` — a full hide, not an icon rail. The width + border
 * transition uses `--ease-out-quint` over 280ms so collapse feels coherent
 * with the rest of the shell motion.
 */
export function Sidebar({ children }: SidebarProps) {
  const t = useTranslations('nav');
  const open = useUiStore((s) => s.sidebarOpen);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
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
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {children}
      </div>

      <div className="flex-none pt-2">
        <button
          onClick={handleLogout}
          className="rounded-md px-1 py-1 text-left text-[12.5px] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-warm)]"
          style={{ fontFamily: 'var(--font-body), Inter, system-ui, sans-serif' }}
        >
          {t('logout')}
        </button>
      </div>
    </aside>
  );
}
