import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { LightboardLogomark } from '../lightboard-logomark';

describe('LightboardLogomark', () => {
  it('renders 12 rects — two L-axis bars plus ten data rows', () => {
    const { container } = render(<LightboardLogomark />);
    const rects = container.querySelectorAll('rect');
    expect(rects.length).toBe(12);
  });

  it('defaults to role="img" with aria-label "Lightboard"', () => {
    const { container } = render(<LightboardLogomark />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Lightboard');
  });

  it('accepts a custom title prop', () => {
    const { container } = render(<LightboardLogomark title="Lightboard logomark" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-label')).toBe('Lightboard logomark');
  });

  it('marks the svg as decorative when title is an empty string', () => {
    const { container } = render(<LightboardLogomark title="" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('role')).toBeNull();
    expect(svg?.getAttribute('aria-label')).toBeNull();
  });

  it('reflects the size prop on svg width and height', () => {
    const { container } = render(<LightboardLogomark size={48} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('48');
    expect(svg?.getAttribute('height')).toBe('48');
  });

  it('uses currentColor so the mark tints via parent color', () => {
    const { container } = render(<LightboardLogomark />);
    const rects = container.querySelectorAll('rect');
    rects.forEach((rect) => {
      expect(rect.getAttribute('fill')).toBe('currentColor');
    });
  });
});
