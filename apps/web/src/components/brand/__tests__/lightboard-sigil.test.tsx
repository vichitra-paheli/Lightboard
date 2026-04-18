import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LightboardSigil } from '../lightboard-sigil';

describe('LightboardSigil', () => {
  it('renders one group per letter (ten total)', () => {
    const { container } = render(<LightboardSigil />);
    // Query by class — the CSS-module "letter" class is emitted verbatim under
    // the test config so direct class-selector queries are stable.
    const groups = container.querySelectorAll('g.letter');
    expect(groups.length).toBe(10);
  });

  it('sets aria-label="Lightboard" on the root svg', () => {
    const { container } = render(<LightboardSigil />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-label')).toBe('Lightboard');
  });

  it('reflects the size prop on svg width and height', () => {
    const { container } = render(<LightboardSigil size={40} />);
    const svg = container.querySelector('svg');
    // letterW = size * 0.72, 10 letters → 40 * 0.72 * 10 = 288
    expect(svg?.getAttribute('width')).toBe('288');
    // letterH = size * 1.0, height = letterH * 1.1 → 40 * 1.1 = 44
    expect(svg?.getAttribute('height')).toBe('44');
  });

  it('renders two path layers (halo + stroke) per letter', () => {
    const { container } = render(<LightboardSigil />);
    const halos = container.querySelectorAll('path.halo');
    const strokes = container.querySelectorAll('path.stroke');
    expect(halos.length).toBe(10);
    expect(strokes.length).toBe(10);
  });
});
