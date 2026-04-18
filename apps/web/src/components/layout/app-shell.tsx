'use client';

import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { useSidebarShortcut } from './use-sidebar-shortcut';

/**
 * Props for {@link AppShell}.
 */
export interface AppShellProps {
  /** Main route content rendered to the right of the sidebar. */
  children: React.ReactNode;
  /**
   * Per-route sidebar content. Routes that need custom sidebar widgets
   * (e.g. Explore's DB picker + conversations list shipping in PR 4) inject
   * them here via a client wrapper. Routes that don't need a sidebar panel
   * omit this prop — the sidebar container still renders so the collapse
   * animation stays consistent across routes.
   */
  sidebarSlot?: React.ReactNode;
}

/**
 * App-shell layout for all authenticated routes. Composes:
 *
 * 1. A sticky 56px top bar with centered primary nav.
 * 2. A collapsible 240px left sidebar hosting the per-route slot.
 * 3. A scrollable main content area.
 *
 * Also mounts the global `Ctrl/Cmd + \` sidebar toggle shortcut. The shell
 * itself renders instantly — only the content area shows loading states.
 */
export function AppShell({ children, sidebarSlot }: AppShellProps) {
  useSidebarShortcut();

  return (
    <div
      className="flex h-screen flex-col overflow-hidden"
      style={{
        background: 'var(--bg-0)',
        color: 'var(--ink-1)',
        fontFamily: 'var(--font-body), Inter, system-ui, sans-serif',
      }}
    >
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar>{sidebarSlot}</Sidebar>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
