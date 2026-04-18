'use client';

/**
 * Props for {@link SuggestionChips}.
 */
interface SuggestionChipsProps {
  /** Chip labels; clicking a chip invokes {@link SuggestionChipsProps.onClick}. */
  items: string[];
  /** Called with the clicked chip's label text. */
  onClick: (text: string) => void;
}

/**
 * Horizontal follow-up suggestion chips rendered at the end of an assistant
 * turn. Currently ships as a hardcoded no-op (the `items` array is always
 * empty in this PR); PR 7 wires real suggestions from the agent pipeline.
 *
 * Returns `null` when `items` is empty so empty turns don't leave a blank
 * 20px gap below the last message.
 */
export function SuggestionChips({ items, onClick }: SuggestionChipsProps) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pl-[40px]">
      {items.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onClick(text)}
          className="rounded-full px-3 py-[7px] text-[12px] transition-colors"
          style={{
            background: 'var(--bg-3)',
            border: '1px solid var(--line-3)',
            color: 'var(--ink-2)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-6)';
            e.currentTarget.style.color = 'var(--ink-1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-3)';
            e.currentTarget.style.color = 'var(--ink-2)';
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
