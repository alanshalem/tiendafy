'use client';

import { useState } from 'react';

export function ContactForm() {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="mt-6 rounded-md border border-black/10 bg-black/[0.03] p-5 text-sm">
        ¡Gracias! Recibimos tu mensaje y te respondemos pronto.
      </div>
    );
  }

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <input required placeholder="Tu nombre" className="h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black" />
      <input required type="email" placeholder="Tu email" className="h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black" />
      <textarea required placeholder="Tu mensaje" rows={5} className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black" />
      <button type="submit" className="rounded-md px-6 py-3 text-sm font-semibold text-primary-fg" style={{ background: 'rgb(var(--color-primary))' }}>
        Enviar
      </button>
    </form>
  );
}
