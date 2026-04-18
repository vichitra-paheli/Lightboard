import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { SuggestionChips } from '../suggestion-chips';

// Mirror the dict-stub pattern used by thread.test.tsx — resolve the i18n
// key to real English copy so assertions can target literal text (and the
// sr-only label actually reads the right string).
vi.mock('next-intl', () => ({
  useTranslations: () => {
    const dict: Record<string, string> = {
      suggestionsLabel: 'Follow-up suggestions',
    };
    return (key: string) => dict[key] ?? key;
  },
}));

describe('<SuggestionChips>', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders one button per item', () => {
    const { queryAllByRole } = render(
      <SuggestionChips
        items={['Alpha', 'Bravo', 'Charlie']}
        onSelect={() => {}}
      />,
    );
    const buttons = queryAllByRole('button');
    expect(buttons.length).toBe(3);
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ]);
  });

  it('renders nothing when items is empty (avoids a 20px phantom gap)', () => {
    const { container } = render(
      <SuggestionChips items={[]} onSelect={() => {}} />,
    );
    // Component returns null, so the wrapper fragment has no children.
    expect(container.firstChild).toBeNull();
  });

  it('calls onSelect with the clicked chip label', () => {
    const onSelect = vi.fn();
    const { queryAllByRole } = render(
      <SuggestionChips items={['Alpha', 'Bravo']} onSelect={onSelect} />,
    );
    const buttons = queryAllByRole('button');
    fireEvent.click(buttons[1]!);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('Bravo');
  });

  it('emits the eyebrow label via an sr-only span so screen readers announce the group', () => {
    const { getByText, container } = render(
      <SuggestionChips items={['Alpha']} onSelect={() => {}} />,
    );
    const label = getByText('Follow-up suggestions');
    expect(label.tagName.toLowerCase()).toBe('span');
    expect(label.className).toContain('sr-only');
    // The group is labelled by the eyebrow (aria-labelledby -> eyebrow id).
    const group = container.querySelector('[data-suggestion-chips]');
    expect(group?.getAttribute('aria-labelledby')).toBe(label.id);
  });

  it('renders real <button type="button"> elements so keyboard nav works for free', () => {
    const { queryAllByRole } = render(
      <SuggestionChips items={['A', 'B', 'C']} onSelect={() => {}} />,
    );
    const buttons = queryAllByRole('button');
    for (const btn of buttons) {
      expect(btn.tagName.toLowerCase()).toBe('button');
      expect(btn.getAttribute('type')).toBe('button');
    }

    // Chips aren't inside a nested focus trap — each one is focusable in
    // source order, which is what Tab would traverse. JSDOM doesn't simulate
    // a real Tab-key walk, but focusing the first and the last button
    // directly confirms both ends of the group are reachable.
    buttons[0]!.focus();
    expect(document.activeElement).toBe(buttons[0]);
    buttons[buttons.length - 1]!.focus();
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  });
});
