'use client';

import { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useCart } from './cart-context';
import { Captcha } from './Captcha';
import { submitContact } from '@/lib/contact';
import { BTN_SUBMIT_PUBLIC, INPUT_11, TEXTAREA } from './styles';

/**
 * Formulario del Botón de Arrepentimiento (Res. 424/2020). Entra por el mismo
 * canal que Contacto (bandeja de Mensajes del admin + notificación al merchant),
 * con el asunto normalizado para que el pedido sea inconfundible. Al enviar se
 * muestra un número de solicitud y la fecha (constancia para el comprador).
 */
export function RepentanceForm({ initialOrder = '' }: { initialOrder?: string }) {
  const { tenantId } = useCart();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  // Llega con el número ya puesto desde "Seguí tu pedido" o el detalle de la cuenta.
  const [order, setOrder] = useState(initialOrder);
  const [reason, setReason] = useState('');
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ ref: string; date: string } | null>(null);

  if (receipt) {
    return (
      <div className="mt-6 rounded-md border border-fg/10 bg-fg/[0.03] p-5 text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="h-5 w-5 text-primary-ink" /> Solicitud de arrepentimiento enviada
        </div>
        <p className="mt-2 opacity-75">
          Número de solicitud: <strong>{receipt.ref}</strong> · Fecha: {receipt.date}. Te enviamos la
          constancia también por email. La tienda se va a contactar con vos para coordinar la devolución y el
          reintegro, sin costo adicional.
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const body =
      'SOLICITUD DE ARREPENTIMIENTO (Ley 24.240 art. 34 / Res. 424/2020)\n' +
      `Pedido: ${order || 'no informado'}\n` +
      (reason ? `Motivo: ${reason}\n` : '') +
      'El comprador ejerce su derecho de arrepentimiento. Corresponde revertir la operación y reintegrar el pago dentro de los plazos legales.';
    // El número de constancia lo genera el SERVIDOR (y llega también por
    // email como acuse) — el cliente solo declara el tipo y el pedido.
    const r = await submitContact(tenantId, {
      name,
      email,
      body,
      captcha: captcha || undefined,
      kind: 'repentance',
      orderRef: order || undefined,
    });
    if (r.ok) setReceipt({ ref: r.reference ?? 'registrada', date: new Date().toLocaleDateString('es-AR') });
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
        className={INPUT_11}
      />
      <input
        required
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Tu email (el de la compra)"
        aria-label="Tu email"
        className={INPUT_11}
      />
      <input
        value={order}
        onChange={(e) => setOrder(e.target.value)}
        placeholder="Número de pedido (ej. #1042), si lo tenés"
        aria-label="Número de pedido"
        className={INPUT_11}
      />
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (opcional)"
        aria-label="Motivo"
        rows={3}
        className={TEXTAREA}
      />
      <Captcha onToken={setCaptcha} />
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={busy || captcha === null} className={BTN_SUBMIT_PUBLIC}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Enviar solicitud de arrepentimiento
      </button>
    </form>
  );
}
