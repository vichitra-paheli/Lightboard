'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { useUiStore } from '@/stores/ui-store';

import { SettingsSidebarSlot } from './primitives/settings-sidebar-slot';

/** Props for {@link SettingsShell}. */
export interface SettingsShellProps {
  children: ReactNode;
}

/**
 * Installs the settings sidebar slot while any `/settings/*` route is
 * mounted, and clears it on unmount so non-settings routes get their
 * empty sidebar back. Mirrors the Explore pattern — the slot itself lives
 * in the UI store so we don't have to thread providers through every
 * layout.
 */
export function SettingsShell({ children }: SettingsShellProps) {
  const setSidebarSlot = useUiStore((s) => s.setSidebarSlot);

  useEffect(() => {
    setSidebarSlot(<SettingsSidebarSlot />);
    return () => setSidebarSlot(null);
  }, [setSidebarSlot]);

  return <>{children}</>;
}
