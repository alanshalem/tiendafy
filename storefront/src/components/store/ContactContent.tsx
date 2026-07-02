'use client';

import { Icon } from './Icon';
import { ContactForm } from './ContactForm';
import { useLiveTheme } from './preview';
import type { ContactConfig } from '@/lib/theme';

/** Cuerpo de la página de contacto. En preview lee el theme live (refleja cambios al toque). */
export function ContactContent({ contact }: { contact: ContactConfig }) {
  const live = useLiveTheme();
  const c = live?.contact ?? contact;
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Contacto</h1>
      <p className="mt-2 opacity-70">¿Tenés una consulta? Escribinos y te respondemos a la brevedad.</p>

      {(c.address || c.phone || c.email || c.whatsapp) && (
        <div className="mt-5 space-y-1.5 rounded-lg border border-black/10 bg-black/[0.02] p-4 text-sm">
          {c.address && <div className="flex items-center gap-2"><Icon name="mapPin" className="h-4 w-4 shrink-0" /> {c.address}</div>}
          {c.phone && <div className="flex items-center gap-2"><Icon name="phone" className="h-4 w-4 shrink-0" /> {c.phone}</div>}
          {c.email && <div className="flex items-center gap-2"><Icon name="mail" className="h-4 w-4 shrink-0" /> {c.email}</div>}
          {c.whatsapp && <div className="flex items-center gap-2"><Icon name="chat" className="h-4 w-4 shrink-0" /> WhatsApp: {c.whatsapp}</div>}
        </div>
      )}

      {c.showForm && <ContactForm />}
    </main>
  );
}
