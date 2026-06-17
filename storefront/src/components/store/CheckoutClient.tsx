'use client';

import { useEffect, useMemo, useState } from 'react';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import { Loader2, Tag } from 'lucide-react';
import { CheckoutResult } from './CheckoutResult';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5080';

interface CartLine {
  variantId: string;
  productName: string;
  variantLabel: string;
  priceAmount: number; // centavos
  currency: string;
  image: string | null;
  quantity: number;
}

type Mode = 'PRO' | 'API';

const fmt = (cents: number, currency: string) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);

export function CheckoutClient({ tenantId }: { tenantId: string }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  const [email, setEmail] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'success' | 'pending' | 'failure' | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`tiendafy.cart.${tenantId}`);
      if (raw) setLines(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [tenantId]);

  useEffect(() => {
    fetch(`${API}/api/v1/payments/mercadopago/public-config`, { headers: { 'X-Tenant-Id': tenantId } })
      .then((r) => r.json())
      .then((c) => {
        setConnected(Boolean(c.connected));
        setMode(c.checkoutMode === 'API' ? 'API' : 'PRO');
        setPubKey(c.publicKey ?? null);
        if (c.checkoutMode === 'API' && c.publicKey) initMercadoPago(c.publicKey, { locale: 'es-AR' });
      })
      .catch(() => setMode('PRO'));
  }, [tenantId]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.priceAmount * l.quantity, 0), [lines]);
  const currency = lines[0]?.currency ?? 'ARS';
  const discount = coupon?.discount ?? 0;
  const net = Math.max(0, subtotal - discount);

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponError(null);
    try {
      const res = await fetch(`${API}/api/v1/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({ code, subtotal }),
      });
      const data = await res.json();
      if (data.valid) setCoupon({ code: data.code, discount: data.discountAmount });
      else {
        setCoupon(null);
        setCouponError(data.error ?? 'Cupón inválido.');
      }
    } catch {
      setCouponError('No se pudo validar el cupón.');
    }
  };

  // start + submit → reserva stock, devuelve sessionId.
  const reserve = async (buyerEmail: string) => {
    const headers = { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId };
    const startRes = await fetch(`${API}/api/v1/checkout/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ lines: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) }),
    });
    if (!startRes.ok) throw new Error('No se pudo iniciar el checkout.');
    const session = await startRes.json();
    const submitRes = await fetch(`${API}/api/v1/checkout/${session.id}/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: buyerEmail }),
    });
    if (!submitRes.ok) {
      const p = await submitRes.json().catch(() => null);
      throw new Error(p?.detail ?? 'No hay stock suficiente para algún producto.');
    }
    return session.id as string;
  };

  const payPro = async () => {
    if (!email.includes('@') || email.trim().length < 5) {
      setError('Ingresá un email válido.');
      return;
    }
    setPaying(true);
    setError(null);
    try {
      const id = await reserve(email.trim());
      const payRes = await fetch(`${API}/api/v1/checkout/${id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({ returnUrl: window.location.origin, couponCode: coupon?.code ?? null }),
      });
      if (!payRes.ok) {
        const p = await payRes.json().catch(() => null);
        throw new Error(p?.detail ?? 'No se pudo iniciar el pago.');
      }
      const { initPoint } = await payRes.json();
      if (!initPoint) throw new Error('Mercado Pago no devolvió el link de pago.');
      window.location.href = initPoint;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar el pago.');
      setPaying(false);
    }
  };

  // Payment Brick (on-site): el front tokeniza, el backend cobra.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onBrickSubmit = async ({ formData }: { formData: any }) => {
    setError(null);
    const payer = (formData.payer ?? {}) as { email?: string; identification?: { type?: string; number?: string } };
    const buyerEmail = payer.email || email;
    try {
      const id = await reserve(buyerEmail);
      const res = await fetch(`${API}/api/v1/checkout/${id}/pay-onsite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tenant-Id': tenantId },
        body: JSON.stringify({
          token: formData.token,
          paymentMethodId: formData.payment_method_id,
          installments: formData.installments,
          issuerId: formData.issuer_id,
          payerDocType: payer.identification?.type,
          payerDocNumber: payer.identification?.number,
          couponCode: coupon?.code ?? null,
        }),
      });
      if (!res.ok) {
        const p = await res.json().catch(() => null);
        throw new Error(p?.detail ?? 'El pago fue rechazado.');
      }
      const data = await res.json();
      setResult(data.status === 'approved' ? 'success' : data.status === 'rejected' ? 'failure' : 'pending');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar el pago.');
      throw e;
    }
  };

  if (result) return <CheckoutResult tenantId={tenantId} kind={result} />;

  if (!hydrated || mode === null)
    return <main className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin opacity-50" /></main>;

  if (lines.length === 0)
    return <main className="mx-auto max-w-md px-4 py-20 text-center"><p className="opacity-70">Tu carrito está vacío.</p><a href="/" className="mt-4 inline-block text-primary underline">Volver a la tienda</a></main>;

  if (!connected)
    return <main className="mx-auto max-w-md px-4 py-20 text-center"><p className="opacity-70">Esta tienda todavía no tiene los pagos habilitados.</p><a href="/" className="mt-4 inline-block text-primary underline">Volver</a></main>;

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="mb-5 text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>Finalizar compra</h1>

      <div className="mb-5 rounded-lg border border-black/10 p-4 text-sm">
        {lines.map((l) => (
          <div key={l.variantId} className="flex justify-between py-1">
            <span>{l.quantity}× {l.productName}</span>
            <span className="tabular-nums">{fmt(l.priceAmount * l.quantity, l.currency)}</span>
          </div>
        ))}
        {discount > 0 && (
          <div className="flex justify-between py-1 text-green-600">
            <span>Descuento ({coupon?.code})</span>
            <span className="tabular-nums">- {fmt(discount, currency)}</span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-black/10 pt-2 text-base font-bold">
          <span>Total</span>
          <span className="tabular-nums">{fmt(net, currency)}</span>
        </div>
      </div>

      {!coupon && (
        <div className="mb-5">
          <div className="flex gap-2">
            <input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} placeholder="Cupón de descuento"
              className="h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black" />
            <button onClick={applyCoupon} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-black/20 px-3 text-sm font-semibold">
              <Tag className="h-4 w-4" /> Aplicar
            </button>
          </div>
          {couponError && <p className="mt-1 text-xs text-red-600">{couponError}</p>}
        </div>
      )}

      {mode === 'API' && pubKey ? (
        <Payment
          key={net}
          initialization={{ amount: net / 100, payer: { email: email || undefined } }}
          customization={{ paymentMethods: { creditCard: 'all', debitCard: 'all', ticket: 'all', bankTransfer: 'all' } }}
          onSubmit={onBrickSubmit}
          onError={() => setError('Hubo un problema con el formulario de pago.')}
        />
      ) : (
        <div className="space-y-2">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Tu email"
            className="h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black" />
          <button onClick={payPro} disabled={paying}
            className="w-full rounded-md py-3 text-sm font-semibold text-primary-fg disabled:opacity-60" style={{ background: 'rgb(var(--color-primary))' }}>
            {paying ? 'Redirigiendo a Mercado Pago…' : 'Pagar con Mercado Pago'}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </main>
  );
}
