import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Sidebar } from '../sidebar';
import { useUiStore } from '@/stores/ui-store';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => (key === 'logout' ? 'Log out' : key),
}));

describe('<Sidebar>', () => {
  beforeEach(() => {
    useUiStore.setState({ sidebarOpen: true });
  });

  // Project has no shared vitest setup file, so `@testing-library/react`'s
  // auto-cleanup never registers. Unmount between tests explicitly so each
  // `render` starts from an empty body.
  afterEach(() => {
    cleanup();
  });

  it('renders children when open', () => {
    const { getByText } = render(
      <Sidebar>
        <div>Per-route content</div>
      </Sidebar>,
    );
    expect(getByText('Per-route content')).toBeTruthy();
  });

  it('expands to 240px when sidebarOpen is true', () => {
    const { container } = render(<Sidebar>content</Sidebar>);
    const aside = container.querySelector('aside');
    expect(aside?.getAttribute('data-open')).toBe('true');
    // The inline style carries the current pixel width — jsdom normalizes to
    // the canonical `"240px"` form.
    expect(aside?.style.width).toBe('240px');
  });

  it('collapses to 0px width when sidebarOpen is false', () => {
    useUiStore.setState({ sidebarOpen: false });
    const { container } = render(<Sidebar>content</Sidebar>);
    const aside = container.querySelector('aside');
    expect(aside?.getAttribute('data-open')).toBe('false');
    expect(aside?.style.width).toBe('0px');
    // Border collapses to transparent so the continuous top-bar border
    // visually stays intact across the sidebar gutter.
    expect(aside?.style.borderRight).toContain('transparent');
  });

  it('renders a logout button in the footer', () => {
    const { getByText } = render(<Sidebar>content</Sidebar>);
    expect(getByText('Log out')).toBeTruthy();
  });
});
