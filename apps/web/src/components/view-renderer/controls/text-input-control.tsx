'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ControlSpec } from '@lightboard/viz-core';

/** Props for TextInputControl. */
interface TextInputControlProps {
  spec: ControlSpec;
  value: string;
  onChange: (value: string) => void;
}

/** Debounced text input control (200ms). */
export function TextInputControl({ spec, value, onChange }: TextInputControlProps) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback(
    (newValue: string) => {
      setLocalValue(newValue);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onChange(newValue), 200);
    },
    [onChange],
  );

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {spec.label}
      </label>
      <input
        type="text"
        value={localValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={spec.label}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
      />
    </div>
  );
}
