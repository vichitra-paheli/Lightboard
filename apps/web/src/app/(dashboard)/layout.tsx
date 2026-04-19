import { AppShell } from '@/components/layout/app-shell';
import { LightboardQueryProvider } from '@/lib/query-client-provider';

/**
 * Dashboard layout that wraps all main pages with the app shell.
 *
 * The {@link LightboardQueryProvider} is mounted here rather than at the
 * root layout so auth-free routes (login / register) don't pull the
 * react-query runtime into their bundle. Every authenticated route sits
 * under `(dashboard)`, which means every fetch-on-mount or mutation
 * surface — Settings, Explore, UserAvatar — has the client available.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LightboardQueryProvider>
      <AppShell>{children}</AppShell>
    </LightboardQueryProvider>
  );
}
