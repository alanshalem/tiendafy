import { type ReactNode } from 'react';

/** Sección con título + cuerpo (tarjetas del formulario de producto). */
export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-5 shadow-card">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
