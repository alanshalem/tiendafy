import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';
import { fieldChrome } from './field';

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
        ...fieldChrome(error),
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = 'Textarea';
