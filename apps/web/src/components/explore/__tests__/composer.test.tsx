import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { Composer, __testing } from '../composer';

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const dict: Record<string, string> = {
      composerPlaceholder: 'Ask a follow-up…',
      composerHint: '⌘ ⏎ SEND   ⏎ NEWLINE   ⇡ DRAG TO RESIZE',
      send: 'Send',
      stop: 'Stop',
      attach: 'Attach',
      runAsSQL: 'Run as SQL',
      attachView: 'Attach view',
    };
    return (key: string) => dict[key] ?? key;
  },
}));

describe('<Composer>', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the placeholder text', () => {
    const { getByPlaceholderText } = render(
      <Composer onSend={() => {}} onStop={() => {}} />,
    );
    expect(getByPlaceholderText('Ask a follow-up…')).toBeTruthy();
  });

  it('calls onSend on Cmd+Enter when the textarea has content', () => {
    const onSend = vi.fn();
    const { container } = render(
      <Composer onSend={onSend} onStop={() => {}} />,
    );
    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[data-composer-textarea]',
    );
    expect(textarea).toBeTruthy();

    fireEvent.change(textarea!, { target: { value: 'hello world' } });
    fireEvent.keyDown(textarea!, { key: 'Enter', metaKey: true });

    expect(onSend).toHaveBeenCalledWith('hello world');
    // Textarea clears after send.
    expect(textarea!.value).toBe('');
  });

  it('does not call onSend on plain Enter (newline behavior)', () => {
    const onSend = vi.fn();
    const { container } = render(
      <Composer onSend={onSend} onStop={() => {}} />,
    );
    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[data-composer-textarea]',
    );
    fireEvent.change(textarea!, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea!, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('clamps drag-resize between 80 and 360 and persists to localStorage', () => {
    const { container } = render(
      <Composer onSend={() => {}} onStop={() => {}} />,
    );
    const handle = container.querySelector<HTMLButtonElement>(
      '[data-composer-drag-handle]',
    );
    expect(handle).toBeTruthy();

    // Simulate a mouse-down at y=500, then move the mouse WAY up to push the
    // height against the upper clamp.
    fireEvent.mouseDown(handle!, { clientY: 500 });
    fireEvent.mouseMove(window, { clientY: -2000 });
    fireEvent.mouseUp(window);

    // After a huge upward drag, the stored height should be at the MAX_HEIGHT
    // clamp (360), not some unbounded value.
    const stored = Number(window.localStorage.getItem('lb:composerH'));
    expect(stored).toBe(360);
  });

  it('swaps to a Stop button while streaming', () => {
    const { container, rerender } = render(
      <Composer onSend={() => {}} onStop={() => {}} />,
    );
    expect(container.querySelector('[data-composer-send]')).toBeTruthy();
    expect(container.querySelector('[data-composer-stop]')).toBeNull();

    rerender(<Composer onSend={() => {}} onStop={() => {}} isStreaming />);
    expect(container.querySelector('[data-composer-send]')).toBeNull();
    expect(container.querySelector('[data-composer-stop]')).toBeTruthy();
  });
});

describe('buildDek', () => {
  it('returns empty string when no source meta is passed', () => {
    expect(__testing.buildDek(null)).toBe('');
    expect(__testing.buildDek(undefined)).toBe('');
  });

  it('returns name alone when tables/rows are missing', () => {
    expect(__testing.buildDek({ name: 'cricket' })).toBe('cricket');
  });

  it('renders the full dek when tables + rows are present', () => {
    expect(
      __testing.buildDek({ name: 'cricket', tables: 24, rows: 42_100_000 }),
    ).toBe('cricket · 24 tables · 42.1M rows');
  });
});

describe('formatCount', () => {
  it.each([
    [42, '42'],
    [1_500, '1.5K'],
    [42_100_000, '42.1M'],
    [2_500_000_000, '2.5B'],
  ])('formats %i as %s', (input, expected) => {
    expect(__testing.formatCount(input)).toBe(expected);
  });
});
