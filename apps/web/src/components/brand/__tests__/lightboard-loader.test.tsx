import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { LightboardLoader } from '../lightboard-loader';

// Stub next-intl — the loader looks up `common.loading` and falls back to any
// explicit ariaLabel the caller passes. We mirror `en.json`'s mapping here so
// the default aria-label assertion is exact.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      loading: 'Loading...',
    };
    return map[key] ?? key;
  },
}));

/**
 * jsdom doesn't provide matchMedia. Every test in this file reaches the
 * loader's reduced-motion probe, so we install a deterministic shim that can
 * be flipped per test.
 */
function installMatchMedia(prefersReducedMotion: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') && prefersReducedMotion,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

describe('LightboardLoader', () => {
  afterEach(() => cleanup());

  describe('with motion enabled', () => {
    beforeEach(() => installMatchMedia(false));

    it('renders a status element with the i18n default aria-label', () => {
      const { container } = render(<LightboardLoader size={48} />);
      const root = container.firstElementChild;
      expect(root).not.toBeNull();
      expect(root?.getAttribute('role')).toBe('status');
      expect(root?.getAttribute('aria-label')).toBe('Loading...');
    });

    it('honors an explicit ariaLabel over the i18n default', () => {
      const { container } = render(
        <LightboardLoader size={48} ariaLabel="Fetching schema" />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root?.getAttribute('aria-label')).toBe('Fetching schema');
    });

    it('reflects size on the root element when width/height are absent', () => {
      const { container } = render(<LightboardLoader size={72} />);
      const root = container.firstElementChild as HTMLElement | null;
      expect(root?.style.width).toBe('72px');
      expect(root?.style.height).toBe('72px');
    });

    it('respects explicit width/height over size', () => {
      const { container } = render(
        <LightboardLoader size={48} width={280} height={52} />,
      );
      const root = container.firstElementChild as HTMLElement | null;
      expect(root?.style.width).toBe('280px');
      expect(root?.style.height).toBe('52px');
    });
  });

  describe('with prefers-reduced-motion: reduce', () => {
    beforeEach(() => installMatchMedia(true));

    it('renders the static crosshatch with exactly four segments', () => {
      const { container } = render(<LightboardLoader size={48} />);
      const root = container.firstElementChild as HTMLElement | null;
      expect(root).not.toBeNull();
      // Four absolutely-positioned beam segments — two horizontal + two
      // vertical — and nothing else inside the loader root.
      const children = root?.children ?? ([] as unknown as HTMLCollection);
      expect(children.length).toBe(4);
    });

    it('does not start a rAF loop under reduced motion', () => {
      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
      render(<LightboardLoader size={48} />);
      expect(rafSpy).not.toHaveBeenCalled();
      rafSpy.mockRestore();
    });
  });
});
