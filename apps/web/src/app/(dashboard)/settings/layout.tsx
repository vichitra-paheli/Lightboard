import type { ReactNode } from 'react';

import { SettingsShell } from '@/components/settings/settings-shell';

/**
 * Settings shell layout — installs the settings-specific sidebar slot
 * (workspace + account nav groups) for every route under `/settings/*`.
 * Cleanup on unmount ensures non-settings routes inherit an empty sidebar.
 *
 * Actual per-section content renders inside the shell's scroll region.
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}
