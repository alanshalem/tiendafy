import { Check } from 'lucide-react';

export type Step = 'entrega' | 'pago';

/**
 * Indicador de pasos: Carrito → Entrega → Pago. "Carrito" abre el carrito
 * acá mismo (antes llevaba a la portada y se perdía el paso); "Entrega"
 * vuelve atrás desde el pago.
 */
export function CheckoutSteps({
  step,
  onCart,
  onBack,
}: {
  step: Step;
  onCart: () => void;
  onBack: () => void;
}) {
  return (
    <div className="mx-auto mb-8 flex max-w-md items-center">
      <StepDot label="Carrito" state="done" onClick={onCart} />
      <div className="h-px flex-1 bg-fg/20" />
      <StepDot
        label="Entrega"
        state={step === 'entrega' ? 'current' : 'done'}
        onClick={step === 'pago' ? onBack : undefined}
      />
      <div className="h-px flex-1 bg-fg/20" />
      <StepDot label="Pago" state={step === 'pago' ? 'current' : 'todo'} />
    </div>
  );
}

function StepDot({
  label,
  state,
  onClick,
}: {
  label: string;
  state: 'done' | 'current' | 'todo';
  onClick?: () => void;
}) {
  // Colores del tema: con negro fijo, en una tienda de fondo oscuro los
  // círculos y las líneas desaparecían.
  const dot = (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
        state === 'current'
          ? 'border-primary bg-primary text-primary-fg'
          : state === 'done'
            ? 'border-fg/50 text-fg/80'
            : 'border-fg/25 text-fg/40'
      }`}
    >
      {state === 'done' ? <Check className="h-3.5 w-3.5" /> : ''}
    </span>
  );
  const body = (
    <span className="flex flex-col items-center gap-1">
      {dot}
      <span className={`text-xs ${state === 'current' ? 'font-semibold' : 'text-fg-muted'}`}>{label}</span>
    </span>
  );
  if (onClick) return <button onClick={onClick}>{body}</button>;
  return body;
}
