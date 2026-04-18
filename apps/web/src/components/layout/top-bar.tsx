'use client';

import { useTranslations } from 'next-intl';
import { LightboardSigil } from '@/components/brand';
import { useUiStore } from '@/stores/ui-store';
import { AgentPicker } from './agent-picker';
import { IconButton } from './icon-button';
import { NavItem } from './nav-item';
import { UserAvatar } from './user-avatar';

/**
 * Top-of-shell navigation bar.
 *
 * Layout: 56px tall, sticky, with a three-column CSS grid
 * (`260px | 1fr | 260px`):
 * - **Left**: hamburger that toggles the sidebar + sigil wordmark.
 * - **Center**: primary nav (Dashboard, Explore, Views, Settings). "Data
 *   Sources" deliberately lives in Explore's sidebar context now instead of
 *   the top nav — see PR 4.
 * - **Right**: model picker + user avatar pill.
 *
 * The prior `title` prop has been removed — per-route titles now live inside
 * the main content area instead of competing with primary nav.
 */
export function TopBar() {
  const t = useTranslations('topBar');
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <header
      className="sticky top-0 z-20 flex-none grid h-14 items-center px-6"
      style={{
        gridTemplateColumns: '260px 1fr 260px',
        background: 'var(--bg-2)',
        borderBottom: '1px solid var(--line-1)',
      }}
    >
      <div className="flex items-center gap-[14px]">
        <IconButton
          aria-label={t('toggleSidebar')}
          onClick={toggleSidebar}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path
              d="M1 3h12M1 7h12M1 11h12"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </IconButton>
        <LightboardSigil size={18} />
      </div>

      <nav className="flex justify-center gap-1" aria-label={t('primaryNav')}>
        <NavItem href="/" labelKey="dashboard" icon="dashboard" />
        <NavItem href="/explore" labelKey="explore" icon="explore" />
        <NavItem href="/views" labelKey="views" icon="views" />
        <NavItem href="/settings" labelKey="settings" icon="settings" />
      </nav>

      <div className="flex items-center justify-end gap-[14px]">
        <AgentPicker />
        <UserAvatar />
      </div>
    </header>
  );
}
