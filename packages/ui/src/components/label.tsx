import * as React from 'react';
import { cn } from '../utils';

/** Props for the Label component. */
export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

/** A styled form label component. */
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';
