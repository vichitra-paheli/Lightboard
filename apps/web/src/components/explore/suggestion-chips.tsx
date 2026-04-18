'use client';

import { useTranslations } from 'next-intl';

/**
 * Props for {@link SuggestionChips}.
 */
interface SuggestionChipsProps {
  /** Chip labels; clicking a chip invokes {@link SuggestionChipsProps.onSelect}. */
  items: string[];
  /** Called with the clicked chip's label text. */
  onSelect: (text: string) => void;
}

/**
 * Horizontal row of follow-up suggestion chips rendered at the end of an
 * assistant turn. Each chip is a real `<button type="button">` so keyboard
 * navigation (Tab between chips, Enter/Space to activate) works without any
 * extra handling. The container is labelled via `aria-labelledby` pointing at
 * an sr-only eyebrow — screen readers announce "Follow-up suggestions" when
 * the user first lands inside the group.
 *
 * Visual treatment mirrors the editorial handoff
 * (`Lightboard-handoff/project/components/Thread.jsx#Suggestion`):
 *   - Pill shape (`border-radius: 999px`).
 *   - Idle: `--bg-4` background, `--line-3` border, `--ink-2` text.
 *   - Hover: `--bg-6` background, `--ink-1` text.
 *   - Focus-visible: accent background + border so keyboard users see a
 *     clear ring that doesn't depend on the hover state.
 *
 * Empty-items guard: renders `null` so an assistant turn with no suggestions
 * doesn't leave a blank 20px gap below the last block.
 */
export function SuggestionChips({ items, onSelect }: SuggestionChipsProps) {
  const t = useTranslations('explore');

  if (items.length === 0) return null;

  return (
    <div
      role="group"
      aria-labelledby="suggestion-chips-label"
      data-suggestion-chips
      className="flex flex-wrap gap-2 pl-[40px]"
    >
      {/* Visually hidden eyebrow so screen readers announce the group purpose.
          The handoff design renders no visible label — the chips are their
          own call-to-action. */}
      <span id="suggestion-chips-label" className="sr-only">
        {t('suggestionsLabel')}
      </span>
      {items.map((text) => (
        <SuggestionChip key={text} label={text} onSelect={onSelect} />
      ))}
    </div>
  );
}

/**
 * A single pill-shaped suggestion button. Factored out so the hover/focus
 * inline styles can own their own React state without leaking it into the
 * parent map. Hover is driven by an `onMouseEnter`/`onMouseLeave` class swap
 * because Tailwind v4 doesn't scan `packages/` by default and the project
 * convention for theme-dependent colors is to use inline `var()` references.
 */
function SuggestionChip({
  label,
  onSelect,
}: {
  label: string;
  onSelect: (text: string) => void;
}) {
  return (
    <button
      type="button"
      data-suggestion-chip
      onClick={() => onSelect(label)}
      className="rounded-full px-3 py-[7px] text-[12px] transition-colors focus:outline-none focus-visible:ring-2"
      style={{
        background: 'var(--bg-4)',
        border: '1px solid var(--line-3)',
        color: 'var(--ink-2)',
        // Focus ring color — overridden via inline outline on focus-visible
        // below so we don't ship a token-less Tailwind ring color.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CSS custom property on style object
        ['--tw-ring-color' as any]: 'var(--accent-border, #F2C265)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-6)';
        e.currentTarget.style.color = 'var(--ink-1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-4)';
        e.currentTarget.style.color = 'var(--ink-2)';
      }}
      onFocus={(e) => {
        // Keyboard focus: swap to the accent tokens so the indicator is
        // visible without depending on hover state. Guarded behind
        // `matches(':focus-visible')` so we only light up for keyboard
        // users — a click on the chip would otherwise briefly flash
        // accent colors before the click handler resolves.
        if (e.currentTarget.matches(':focus-visible')) {
          e.currentTarget.style.background = 'var(--accent-bg, var(--bg-6))';
          e.currentTarget.style.borderColor = 'var(--accent-border, var(--line-3))';
          e.currentTarget.style.color = 'var(--ink-1)';
        }
      }}
      onBlur={(e) => {
        e.currentTarget.style.background = 'var(--bg-4)';
        e.currentTarget.style.borderColor = 'var(--line-3)';
        e.currentTarget.style.color = 'var(--ink-2)';
      }}
    >
      {label}
    </button>
  );
}
