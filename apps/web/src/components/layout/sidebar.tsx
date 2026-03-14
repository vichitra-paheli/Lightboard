'use client';

import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from 'next-view-transitions';
import {
  Compass,
  Database,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Settings,
  SquareKanban,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Navigation item definition for the sidebar.
 */
interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', labelKey: 'home', icon: LayoutDashboard },
  { href: '/explore', labelKey: 'explore', icon: Compass },
  { href: '/data-sources', labelKey: 'dataSources', icon: Database },
  { href: '/views', labelKey: 'views', icon: SquareKanban },
  { href: '/settings', labelKey: 'settings', icon: Settings },
];

/**
 * Application sidebar with navigation links.
 * Renders instantly from static content — no loading states.
 */
export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations('nav');

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Use hard navigation to clear all client state and let middleware redirect
    window.location.href = '/login';
  }

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link href="/" className="text-lg font-semibold text-sidebar-foreground">
          Lightboard
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          <LogOut className="h-4 w-4" />
          {t('logout')}
        </button>
      </div>
    </aside>
  );
}
