'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useCart } from './cart';
import { Captcha } from './Captcha';

import { submitContact } from '@/lib/contact';
import { INPUT_LIGHT_11 } from './styles';

export function ContactForm() {
  const { tenantId } = useCart();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [body, setBody] = useState('');
  const [captcha, setCaptcha] = useState<string | null>(null); // null = captcha pendiente
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <div className="mt-6 rounded-md border border-black/10 bg-black/[0.03] p-5 text-sm">
        ¡Gracias! Recibimos tu mensaje y te respondemos pronto.
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await submitContact(tenantId, { name, email, body, captcha: captcha || undefined });
    if (r.ok) setSent(true);
    else setError(r.error);
    setBusy(false);
  };

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <input
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tu nombre"
        aria-label="Tu nombre"
        className={INPUT_LIGHT_11}
      />
      <input
        required
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Tu email"
        aria-label="Tu email"
        className={INPUT_LIGHT_11}
      />
      <textarea
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Tu mensaje"
        aria-label="Tu mensaje"
        rows={5}
        className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black"
      />

      <Captcha onToken={setCaptcha} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy || captcha === null}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-fg disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Enviar
      </button>
    </form>
  );
}
