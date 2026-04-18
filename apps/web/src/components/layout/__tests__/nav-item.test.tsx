import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { NavItem, isNavItemActive } from '../nav-item';

// `usePathname` is controlled per-test via this mutable ref. Placed above
// `vi.mock` calls because mocks are hoisted but can still reference
// module-scope `let` bindings thanks to closure — declaring here keeps
// intent clear.
let mockPathname: string = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next-view-transitions', () => ({
  // A plain anchor tag is equivalent for component-tree assertions — we only
  // care about href + active-state rendering here.
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('next-intl', () => ({
  // Translations aren't the subject — echo the key so assertions can match on
  // the stable English label without wiring the full next-intl provider.
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      dashboard: 'Dashboard',
      explore: 'Explore',
      views: 'Views',
      settings: 'Settings',
    };
    return map[key] ?? key;
  },
}));

describe('isNavItemActive', () => {
  it('exact-matches the root href', () => {
    expect(isNavItemActive('/', '/')).toBe(true);
    expect(isNavItemActive('/explore', '/')).toBe(false);
  });

  it('prefix-matches non-root hrefs', () => {
    expect(isNavItemActive('/explore', '/explore')).toBe(true);
    expect(isNavItemActive('/explore/123', '/explore')).toBe(true);
    expect(isNavItemActive('/exploration', '/explore')).toBe(false);
  });

  it('returns false for null pathname', () => {
    expect(isNavItemActive(null, '/explore')).toBe(false);
  });
});

describe('<NavItem>', () => {
  // Project has no shared vitest setup file, so `@testing-library/react`'s
  // auto-cleanup never registers. Unmount between tests explicitly so each
  // `render` starts from an empty body.
  afterEach(() => {
    cleanup();
  });

  it('renders the translated label', () => {
    mockPathname = '/';
    const { getByText } = render(
      <NavItem href="/explore" labelKey="explore" icon="explore" />,
    );
    expect(getByText('Explore')).toBeTruthy();
  });

  it('applies active state when pathname matches href', () => {
    mockPathname = '/explore';
    const { container } = render(
      <NavItem href="/explore" labelKey="explore" icon="explore" />,
    );
    const link = container.querySelector('a');
    expect(link?.getAttribute('data-active')).toBe('true');
    expect(link?.getAttribute('aria-current')).toBe('page');
  });

  it('does not apply active state when pathname differs', () => {
    mockPathname = '/';
    const { container } = render(
      <NavItem href="/explore" labelKey="explore" icon="explore" />,
    );
    const link = container.querySelector('a');
    expect(link?.getAttribute('data-active')).toBeNull();
    expect(link?.getAttribute('aria-current')).toBeNull();
  });
});
