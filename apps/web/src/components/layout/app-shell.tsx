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
}

/**
 * App-shell layout for all authenticated routes. Composes:
 *
 * 1. A sticky 56px top bar with centered primary nav.
 * 2. A collapsible 240px left sidebar hosting the per-route slot.
 * 3. A scrollable main content area.
 *
 * Per-route sidebar content is installed via `useUiStore.setSidebarSlot` from
 * inside the page client (Explore does this, non-Explore routes leave it
 * `null`). The sidebar container always renders so the collapse animation
 * stays consistent across routes, even when the slot is empty.
 *
 * Also mounts the global `Ctrl/Cmd + \` sidebar toggle shortcut. The shell
 * itself renders instantly — only the content area shows loading states.
 */
export function AppShell({ children }: AppShellProps) {
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
        <Sidebar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
