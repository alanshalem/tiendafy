import { type ReactNode } from 'react';
import { SETTINGS_CARD } from '../../lib/styles';

/** Sección con título + cuerpo (tarjetas del formulario de producto). */
export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className={SETTINGS_CARD}>
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
