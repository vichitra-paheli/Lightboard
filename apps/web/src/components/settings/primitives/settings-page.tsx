import Link from 'next/link';
import type { ReactNode } from 'react';

/** Props for {@link SettingsPage}. */
export interface SettingsPageProps {
  /** Mono-style eyebrow above the title (e.g. "Workspace"). */
  eyebrow?: ReactNode;
  /** Page title — display font, editorial weight. */
  title: ReactNode;
  /** Optional descriptive blurb under the title. */
  description?: ReactNode;
  /** Trailing actions aligned to the right of the header (primary CTA, etc.). */
  actions?: ReactNode;
  /** Back-link rendered above the eyebrow — used on detail pages. */
  back?: { label: ReactNode; href: string };
  /** Content rendered in the scroll region beneath the header. */
  children: ReactNode;
}

/**
 * Standard settings-page wrapper — eyebrow + title + description + actions
 * header followed by a max-width column of content. Mirrors the layout from
 * the handoff `SettingsPrimitives.jsx` (`SettingsPage`).
 */
export function SettingsPage({
  eyebrow,
  title,
  description,
  actions,
  back,
  children,
}: SettingsPageProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--bg-0)]">
      <div className="mx-auto max-w-[1080px] px-10 pt-10 pb-20">
        {back && (
          <Link
            href={back.href}
            className="inline-flex items-center gap-1.5 mb-5 text-[11.5px] font-medium uppercase tracking-[0.1em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M6.5 1.5L2.5 5l4 3.5"
                stroke="currentColor"
                strokeWidth="1.3"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {back.label}
          </Link>
        )}
        <div className="mb-8 flex items-start justify-between gap-6">
          <div className="min-w-0">
            {eyebrow && (
              <div
                className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {eyebrow}
              </div>
            )}
            <h1
              className="m-0 text-[28px] font-medium leading-[1.15] text-[var(--ink-1)]"
              style={{
                fontFamily: 'var(--font-display)',
                letterSpacing: '-0.015em',
              }}
            >
              {title}
            </h1>
            {description && (
              <p
                className="mt-2.5 mb-0 max-w-[560px] text-[13.5px] leading-[1.55] text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-body)' }}
              >
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex-none">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
