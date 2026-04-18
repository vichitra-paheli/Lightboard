import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { Sidebar } from '../sidebar';
import { useUiStore } from '@/stores/ui-store';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => (key === 'logout' ? 'Log out' : key),
}));

describe('<Sidebar>', () => {
  beforeEach(() => {
    useUiStore.setState({ sidebarOpen: true, sidebarSlot: null });
  });

  // Project has no shared vitest setup file, so `@testing-library/react`'s
  // auto-cleanup never registers. Unmount between tests explicitly so each
  // `render` starts from an empty body.
  afterEach(() => {
    cleanup();
  });

  it('renders the current slot from the UI store when open', () => {
    useUiStore.setState({ sidebarSlot: <div>Per-route content</div> });
    const { getByText } = render(<Sidebar />);
    expect(getByText('Per-route content')).toBeTruthy();
  });

  it('expands to 240px when sidebarOpen is true', () => {
    const { container } = render(<Sidebar />);
    const aside = container.querySelector('aside');
    expect(aside?.getAttribute('data-open')).toBe('true');
    // The inline style carries the current pixel width — jsdom normalizes to
    // the canonical `"240px"` form.
    expect(aside?.style.width).toBe('240px');
  });

  it('collapses to 0px width when sidebarOpen is false', () => {
    useUiStore.setState({ sidebarOpen: false });
    const { container } = render(<Sidebar />);
    const aside = container.querySelector('aside');
    expect(aside?.getAttribute('data-open')).toBe('false');
    expect(aside?.style.width).toBe('0px');
    // Border collapses to transparent so the continuous top-bar border
    // visually stays intact across the sidebar gutter.
    expect(aside?.style.borderRight).toContain('transparent');
  });

  it('renders a logout button in the footer', () => {
    const { getByText } = render(<Sidebar />);
    expect(getByText('Log out')).toBeTruthy();
  });

  it('renders nothing in the slot area when sidebarSlot is null', () => {
    const { container } = render(<Sidebar />);
    // The slot wrapper is the first column inside the aside; its text content
    // should be empty when no slot is installed.
    const slotWrapper = container.querySelector('aside > div');
    expect(slotWrapper?.textContent).toBe('');
  });
});
