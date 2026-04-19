'use client';

/** Props for {@link SliderInput}. */
export interface SliderInputProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  ariaLabel?: string;
}

/**
 * Accent-tinted range slider used in the LLM drawer for temperature and
 * max-tokens. Matches the handoff's `SliderInput` wrapper — card-surround
 * with the native range painted in the brand accent.
 */
export function SliderInput({ value, onChange, min, max, step, ariaLabel }: SliderInputProps) {
  return (
    <div className="rounded-[7px] border border-[var(--line-3)] bg-[var(--bg-2)] px-3 py-2.5">
      <input
        type="range"
        aria-label={ariaLabel}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--accent-warm)]"
      />
    </div>
  );
}
