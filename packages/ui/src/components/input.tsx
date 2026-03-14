import * as React from 'react';
import { cn } from '../utils';

/** Props for the Input component. */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/** A styled text input component. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, style, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md bg-transparent px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      style={{
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: 'var(--color-input)',
        color: 'var(--color-foreground)',
        ...style,
      }}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
