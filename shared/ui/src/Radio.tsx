import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';
import { LabeledControl } from './labeled';

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  description?: ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ label, description, className, id: idProp, ...props }, ref) => {
    const generatedId = useId();
    const id = idProp ?? generatedId;

    const input = (
      <input
        ref={ref}
        id={id}
        type="radio"
        className={cn(
          'h-4 w-4 shrink-0 border-border-strong text-primary',
          'focus:ring-2 focus:ring-primary focus:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    );

    if (!label) return input;

    return <LabeledControl input={input} id={id} label={label} description={description} />;
  },
);

Radio.displayName = 'Radio';

interface RadioGroupProps {
  /** Nombre compartido del grupo (HTML name). */
  name: string;
  legend: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Fieldset accesible para agrupar <Radio name={name}>. */
export function RadioGroup({ legend, children, className }: Omit<RadioGroupProps, 'name'>) {
  return (
    <fieldset className={cn('space-y-2', className)}>
      <legend className="text-sm font-medium text-fg">{legend}</legend>
      {children}
    </fieldset>
  );
}
