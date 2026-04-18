'use client';

import { Link } from 'next-view-transitions';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** Names of the inline SVG icons supported by the top-bar nav. */
export type NavIcon = 'dashboard' | 'explore' | 'views' | 'settings';

/** Props for {@link NavItem}. */
export interface NavItemProps {
  /** Target pathname. Passed verbatim to the `next-view-transitions` Link. */
  href: string;
  /** Translation key under the `nav` namespace — e.g. `'explore'`. */
  labelKey: string;
  /** Which inline SVG icon to render on the left. */
  icon: NavIcon;
}

/**
 * Renders the 14x14 inline SVG glyph for a given {@link NavIcon}. The paths
 * are ported verbatim from the design handoff's `Shell.jsx` so the stroke
 * weights and cap styles match the rest of the shell iconography.
 */
function NavIconGlyph({ icon }: { icon: NavIcon }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      {icon === 'dashboard' && (
        <path
          d="M1 1h5v5H1zM8 1h5v5H8zM1 8h5v5H1zM8 8h5v5H8z"
          stroke="currentColor"
          strokeWidth="1.1"
          fill="none"
        />
      )}
      {icon === 'explore' && (
        <path
          d="M4.5 10.5L1.5 13.5M10 6a4 4 0 11-8 0 4 4 0 018 0z"
          stroke="currentColor"
          strokeWidth="1.2"
          fill="none"
          strokeLinecap="round"
        />
      )}
      {icon === 'views' && (
        <path
          d="M1 11.5l3.5-4 3 2.5L12 3"
          stroke="currentColor"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {icon === 'settings' && (
        <path
          d="M7 4.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM7 1v1.5M7 11.5V13M13 7h-1.5M2.5 7H1M11.2 2.8l-1 1M3.8 10.2l-1 1M11.2 11.2l-1-1M3.8 3.8l-1-1"
          stroke="currentColor"
          strokeWidth="1.1"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/**
 * Determine whether `pathname` should render `href` as active. The dashboard
 * home (`/`) is special-cased to exact-match so deeper routes don't all read
 * as "Dashboard is active" — every other entry matches on prefix.
 */
export function isNavItemActive(pathname: string | null, href: string): boolean {
  if (pathname == null) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A single entry in the centered top-bar nav. Renders icon + label and,
 * when active, an accent-warm underline positioned absolutely below the
 * button so that toggling active state never shifts layout.
 */
export function NavItem({ href, labelKey, icon }: NavItemProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const active = isNavItemActive(pathname, href);

  return (
    <Link
      href={href}
      data-active={active ? 'true' : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative inline-flex items-center gap-2 rounded-md px-[14px] py-2 text-[13px]',
        'font-[var(--font-body)] transition-colors duration-[180ms] ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-warm)]',
        active
          ? 'font-medium text-[var(--ink-1)]'
          : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
      )}
    >
      <NavIconGlyph icon={icon} />
      <span>{t(labelKey)}</span>
      {active && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-[-18px] left-[14px] right-[14px] h-[2px] rounded-[2px] bg-[var(--accent-warm)]"
        />
      )}
    </Link>
  );
}
