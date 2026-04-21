import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { HtmlViewRenderer } from '../html-view-renderer';

/**
 * The `FIGURE 01 · ...` eyebrow is the marker the round-2 view-agent emits
 * in every generated HTML document. When it's present the host should NOT
 * print its own title/description header — the inner HTML already owns it.
 */
const FIGURE_HTML = `<!doctype html>
<html><body>
  <div class="fig__eyebrow">FIGURE 01 · BATTING</div>
  <h1>Top batters</h1>
</body></html>`;

/**
 * Legacy HTML — no design-system markers. The host header should render so
 * the chart still has a visible title/description block.
 */
const LEGACY_HTML = `<!doctype html>
<html><body><canvas id="c"></canvas></body></html>`;

describe('<HtmlViewRenderer>', () => {
  afterEach(() => {
    cleanup();
  });

  it('hides the outer header when the HTML carries a FIGURE eyebrow', () => {
    const { container } = render(
      <HtmlViewRenderer
        view={{
          title: 'Top batters',
          description: 'IPL 2014+',
          sql: 'SELECT 1',
          html: FIGURE_HTML,
        }}
      />,
    );
    // The outer header would contain the title text — it must NOT render
    // because the inner HTML already prints its own title block.
    expect(container.querySelector('h2')).toBeNull();
    // Body text "Top batters" belongs to the iframe srcDoc and never hits
    // the host DOM directly. The host DOM has no heading for the title.
    expect(container.textContent).not.toContain('IPL 2014+');
  });

  it('hides the outer header when the HTML carries a fig__eyebrow class', () => {
    const eyebrowClassOnly = `<div class="fig__eyebrow">anything here</div>`;
    const { container } = render(
      <HtmlViewRenderer
        view={{
          title: 'T',
          description: 'D',
          sql: 'SELECT 1',
          html: eyebrowClassOnly,
        }}
      />,
    );
    expect(container.querySelector('h2')).toBeNull();
    expect(container.textContent).not.toContain('D');
  });

  it('shows the outer header for legacy HTML without a FIGURE marker', () => {
    const { container } = render(
      <HtmlViewRenderer
        view={{
          title: 'Legacy view',
          description: 'old-school',
          sql: 'SELECT 1',
          html: LEGACY_HTML,
        }}
      />,
    );
    const heading = container.querySelector('h2');
    expect(heading).toBeTruthy();
    expect(heading!.textContent).toBe('Legacy view');
    expect(container.textContent).toContain('old-school');
  });

  it('respects an explicit chromeless=true regardless of FIGURE marker', () => {
    const { container } = render(
      <HtmlViewRenderer
        view={{
          title: 'T',
          description: 'D',
          sql: 'SELECT 1',
          html: LEGACY_HTML,
        }}
        chromeless
      />,
    );
    expect(container.querySelector('h2')).toBeNull();
  });

  it('respects an explicit chromeless=false regardless of FIGURE marker', () => {
    const { container } = render(
      <HtmlViewRenderer
        view={{
          title: 'Title',
          description: 'Desc',
          sql: 'SELECT 1',
          html: FIGURE_HTML,
        }}
        chromeless={false}
      />,
    );
    const heading = container.querySelector('h2');
    expect(heading).toBeTruthy();
    expect(heading!.textContent).toBe('Title');
  });
});
