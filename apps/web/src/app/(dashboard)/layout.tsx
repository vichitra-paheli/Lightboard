import { AppShell } from '@/components/layout/app-shell';

/**
 * Dashboard layout that wraps all main pages with the app shell.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
