import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { TraceCluster } from '../trace-cluster';

/**
 * Test helper — renders a TraceCluster with a known body child so the
 * assertions can target the header chrome independently of body contents.
 */
function renderCluster(
  props: Partial<React.ComponentProps<typeof TraceCluster>> = {},
) {
  return render(
    <TraceCluster
      status="done"
      totalCount={3}
      doneCount={3}
      {...props}
    >
      <div data-testid="row">one</div>
      <div data-testid="row">two</div>
      <div data-testid="row">three</div>
    </TraceCluster>,
  );
}

describe('<TraceCluster>', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the header with "Completed" + count when status is done', () => {
    const { container } = renderCluster();
    expect(container.textContent).toContain('Completed');
    expect(container.textContent).toContain('3/3 tool calls');
    // Body visible on initial render — rows are present.
    const body = container.querySelector('[data-testid="trace-cluster-body"]');
    expect(body).toBeTruthy();
    expect(body!.querySelectorAll('[data-testid="row"]').length).toBe(3);
  });

  it('renders "Thinking" + current label + pulsing dot when running', () => {
    const { container } = renderCluster({
      status: 'running',
      totalCount: 3,
      doneCount: 1,
      currentLabel: 'run_sql(SELECT …)',
    });
    expect(container.textContent).toContain('Thinking');
    expect(container.textContent).toContain('1/3 tool calls');
    expect(container.textContent).toContain('run_sql(SELECT …)');
    // The pulsing class is only applied while running.
    const pulsing = container.querySelector('.trace-cluster-dot-pulse');
    expect(pulsing).toBeTruthy();
  });

  it('does not add the pulsing class when status is done', () => {
    const { container } = renderCluster({ status: 'done' });
    const pulsing = container.querySelector('.trace-cluster-dot-pulse');
    expect(pulsing).toBeNull();
  });

  it('collapses the body when the header is clicked', () => {
    const { container, getByRole } = renderCluster();
    const toggle = getByRole('button');
    // Expanded on first render.
    expect(
      container.querySelector('[data-testid="trace-cluster-body"]'),
    ).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(toggle);
    // Body is gone after toggle.
    expect(
      container.querySelector('[data-testid="trace-cluster-body"]'),
    ).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    // Re-expands.
    expect(
      container.querySelector('[data-testid="trace-cluster-body"]'),
    ).toBeTruthy();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('uses singular "tool call" when totalCount is 1', () => {
    const { container } = renderCluster({ totalCount: 1, doneCount: 1 });
    expect(container.textContent).toContain('1/1 tool call');
    expect(container.textContent).not.toContain('tool calls');
  });

  it('wraps the cluster in a bordered card chrome', () => {
    // Round-2 visual contract: cluster reads as a self-contained soft
    // card, not a top-only dashed rule. Asserting the inline style on
    // the wrapper pins down the chrome enough that a future refactor
    // that accidentally reverts to "border-top only" fails here.
    const { container } = renderCluster();
    const wrapper = container.querySelector('[data-testid="trace-cluster"]') as
      | HTMLElement
      | null;
    expect(wrapper).toBeTruthy();
    const style = wrapper!.style;
    expect(style.border).toContain('1px solid');
    expect(style.borderRadius).toBe('10px');
    // Background must be the lifted `--bg-4` (not transparent / --bg-0)
    // so the card reads as its own surface.
    expect(style.background).toContain('var(--bg-4)');
  });
});
