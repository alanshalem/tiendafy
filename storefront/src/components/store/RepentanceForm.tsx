'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useCart } from './cart';
import { Captcha } from './Captcha';
import { API_URL as API } from '@/lib/api-client';

/**
 * Formulario del Botón de Arrepentimiento (Res. 424/2020). Entra por el mismo
 * canal que Contacto (bandeja de Mensajes del admin + notificación al merchant),
 * con el asunto normalizado para que el pedido sea inconfundible. Al enviar se
 * muestra un número de solicitud y la fecha (constancia para el comprador).
 */
export function RepentanceForm() {
  const { tenantId } = useCart();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState('');
  const [reason, setReason] = useState('');
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ ref: string; date: string } | null>(null);

  if (receipt) {
    return (
      <div className="mt-6 rounded-md border border-black/10 bg-black/[0.03] p-5 text-sm">
        <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5 text-primary" /> Solicitud de arrepentimiento enviada</div>
        <p className="mt-2 opacity-75">
          Número de solicitud: <strong>{receipt.ref}</strong> · Fecha: {receipt.date}.
          Guardá este número como constancia. La tienda se va a contactar con vos por email para coordinar la devolución y el reintegro, sin costo adicional.
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const ref = `ARR-${Date.now().toString(36).toUpperCase()}`;
    const body =
      `SOLICITUD DE ARREPENTIMIENTO (Ley 24.240 art. 34 / Res. 424/2020) — ${ref}\n` +
      `Pedido: ${order || 'no informado'}\n` +
      (reason ? `Motivo: ${reason}\n` : '') +
      'El comprador ejerce su derecho de arrepentimiento. Corresponde revertir la operación y reintegrar el pago dentro de los plazos legales.';
    try {
      const res = await fetch(`${API}/api/v1/contact/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({ name, email, body, captcha: captcha || undefined }),
      });
      if (res.ok) {
        setReceipt({ ref, date: new Date().toLocaleDateString('es-AR') });
      } else {
        const p = await res.json().catch(() => null);
        setError(p?.detail ?? 'No se pudo enviar. Probá de nuevo.');
      }
    } catch {
      setError('No se pudo enviar. Revisá tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" aria-label="Tu nombre" className="h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black" />
      <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Tu email (el de la compra)" aria-label="Tu email" className="h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black" />
      <input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="Número de pedido (si lo tenés)" aria-label="Número de pedido" className="h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black" />
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)" aria-label="Motivo" rows={3} className="w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black" />
      <Captcha onToken={setCaptcha} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={busy || captcha === null} className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-fg disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Enviar solicitud de arrepentimiento
      </button>
    </form>
  );
}
