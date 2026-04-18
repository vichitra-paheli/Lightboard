import * as React from 'react';
import { cn } from '../utils';

/** Button size styles. */
const sizes = {
  default: 'h-10 px-4 py-2',
  sm: 'h-9 px-3 text-sm',
  lg: 'h-11 px-8',
  icon: 'h-10 w-10',
} as const;

/** Props for the Button component. */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: keyof typeof sizes;
}

/** Style maps for button variants using CSS variables. */
const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-primary-foreground)',
  },
  outline: {
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-input)',
    backgroundColor: 'transparent',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  destructive: {
    backgroundColor: 'var(--color-destructive)',
    color: 'var(--color-destructive-foreground)',
  },
};

/** A styled button component with variant and size support. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', style, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50',
        sizes[size],
        className,
      )}
      style={{ ...variantStyles[variant], ...style }}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
