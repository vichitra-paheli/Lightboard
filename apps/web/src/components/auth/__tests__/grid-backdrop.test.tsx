import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { GridBackdrop } from '../grid-backdrop';

/**
 * Wire a deterministic `window.matchMedia` before each test so the component's
 * reduced-motion branch can be toggled by flipping a flag. jsdom omits
 * matchMedia by default, so without this shim the component throws on mount.
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

describe('GridBackdrop', () => {
  afterEach(() => {
    cleanup();
  });

  describe('with motion enabled', () => {
    beforeEach(() => installMatchMedia(false));

    it('marks the root element aria-hidden', () => {
      const { container } = render(<GridBackdrop />);
      const root = container.firstElementChild;
      expect(root).not.toBeNull();
      expect(root?.getAttribute('aria-hidden')).toBe('true');
    });

    it('renders the SVG grid + vignette defs', () => {
      const { container } = render(<GridBackdrop />);
      expect(container.querySelector('#lb-grid')).not.toBeNull();
      expect(container.querySelector('#lb-vignette')).not.toBeNull();
    });
  });

  describe('with prefers-reduced-motion: reduce', () => {
    beforeEach(() => installMatchMedia(true));

    it('does not render the animated trace field', () => {
      const { container } = render(<GridBackdrop />);
      // The trace field has the `traceField` class; under reduced motion the
      // component returns null from that branch, so no element should exist.
      const traceField = container.querySelector('.traceField');
      expect(traceField).toBeNull();
    });

    it('still renders the static grid backdrop', () => {
      const { container } = render(<GridBackdrop />);
      // Grid + vignette defs stay on-screen so the page isn't blank.
      expect(container.querySelector('#lb-grid')).not.toBeNull();
      expect(container.querySelector('#lb-vignette')).not.toBeNull();
    });
  });
});
