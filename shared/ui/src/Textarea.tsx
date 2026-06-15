import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error = false, className, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={error || undefined}
      className={cn(
        'w-full rounded-md border bg-surface px-3 py-2 text-sm text-fg',
        'placeholder:text-fg-subtle',
        'focus:outline-none focus:ring-2 focus:ring-offset-1',
        'disabled:cursor-not-allowed disabled:bg-bg-muted disabled:opacity-70',
        error
          ? 'border-danger focus:ring-danger'
          : 'border-border-strong focus:border-primary focus:ring-primary',
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = 'Textarea';
