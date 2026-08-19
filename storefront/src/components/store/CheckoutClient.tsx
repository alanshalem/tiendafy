'use client';

import { useEffect, useMemo, useState } from 'react';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import { Check, CreditCard, Loader2, MapPin, Mail, MessageSquare, Store, Tag, Truck } from 'lucide-react';
import { formatDate, formatMoney } from '@tiendafy/types';
import { CheckoutResult } from './CheckoutResult';

import { API_URL as API, tenantHeaders } from '@/lib/api-client';
import type { MoneyDto } from '@tiendafy/types';
import { cartStorageKey, type CartLine } from './cart';
import { readJson } from '@/lib/storage';
import { validateCoupon as validateCouponApi } from '@/lib/coupons';
import { INPUT_LIGHT_10, INPUT_LIGHT_11 } from './styles';

interface ShippingOption {
  id: string;
  name: string;
  kind: 'DELIVERY' | 'PICKUP';
  price: MoneyDto;
  description: string | null;
  pickupAddress: string | null;
}

interface CorreoOption {
  token: string;
  kind: 'D' | 'S';
  name: string;
  price: MoneyDto;
  etaMin: string | null;
  etaMax: string | null;
}

interface CorreoAgency {
  code: string;
  name: string | null;
  address: string;
}

interface ZipnovaOption {
  token: string;
  name: string;
  price: MoneyDto;
  estimatedDelivery: string | null;
}

const CORREO_PROVINCES: [string, string][] = [
  ['B', 'Buenos Aires'],
  ['C', 'CABA'],
  ['K', 'Catamarca'],
  ['H', 'Chaco'],
  ['U', 'Chubut'],
  ['X', 'Córdoba'],
  ['W', 'Corrientes'],
  ['E', 'Entre Ríos'],
  ['P', 'Formosa'],
  ['Y', 'Jujuy'],
  ['L', 'La Pampa'],
  ['F', 'La Rioja'],
  ['M', 'Mendoza'],
  ['N', 'Misiones'],
  ['Q', 'Neuquén'],
  ['R', 'Río Negro'],
  ['A', 'Salta'],
  ['J', 'San Juan'],
  ['D', 'San Luis'],
  ['Z', 'Santa Cruz'],
  ['S', 'Santa Fe'],
  ['G', 'Santiago del Estero'],
  ['V', 'Tierra del Fuego'],
  ['T', 'Tucumán'],
];

type Mode = 'PRO' | 'API';
type Step = 'entrega' | 'pago';

export function CheckoutClient({ tenantId }: { tenantId: string }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);

  const [step, setStep] = useState<Step>('entrega');

  // Paso Entrega
  const [email, setEmail] = useState('');
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[] | null>(null);
  const [shippingId, setShippingId] = useState<string | null>(null);

  // Correo Argentino: cotización en vivo por código postal.
  const [correoEnabled, setCorreoEnabled] = useState(false);
  const [correoCp, setCorreoCp] = useState('');
  const [correoOptions, setCorreoOptions] = useState<CorreoOption[] | null>(null);
  const [correoError, setCorreoError] = useState<string | null>(null);
  const [correoLoading, setCorreoLoading] = useState(false);
  const [agencyProvince, setAgencyProvince] = useState('B');
  const [agencies, setAgencies] = useState<CorreoAgency[] | null>(null);
  const [agencyCode, setAgencyCode] = useState<string | null>(null);

  // Zipnova: multi-transporte. Necesita ciudad + provincia además del CP.
  const [zipnovaEnabled, setZipnovaEnabled] = useState(false);
  const [quoteCity, setQuoteCity] = useState('');
  const [quoteProvince, setQuoteProvince] = useState('');
  const [zipnovaOptions, setZipnovaOptions] = useState<ZipnovaOption[] | null>(null);
  const [zipnovaError, setZipnovaError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [doc, setDoc] = useState('');
  const [street, setStreet] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [apartment, setApartment] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Paso Pago
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'success' | 'pending' | 'failure' | null>(null);

  useEffect(() => {
    setLines(readJson<CartLine[]>(cartStorageKey(tenantId), []));
    setHydrated(true);
  }, [tenantId]);

  useEffect(() => {
    const headers = tenantHeaders(tenantId);
    fetch(`${API}/api/v1/payments/mercadopago/public-config`, { headers })
      .then((r) => r.json())
      .then((c) => {
        setConnected(Boolean(c.connected));
        setMode(c.checkoutMode === 'API' ? 'API' : 'PRO');
        setPubKey(c.publicKey ?? null);
        if (c.checkoutMode === 'API' && c.publicKey) initMercadoPago(c.publicKey, { locale: 'es-AR' });
      })
      .catch(() => setMode('PRO'));

    fetch(`${API}/api/v1/shipping/methods`, { headers })
      .then((r) => r.json())
      .then((d) => {
        setShippingOptions(d.items ?? []);
        setCorreoEnabled(Boolean(d.correoArgentino?.enabled));
        setZipnovaEnabled(Boolean(d.zipnova?.enabled));
      })
      .catch(() => setShippingOptions([]));
  }, [tenantId]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.priceAmount * l.quantity, 0), [lines]);
  const currency = lines[0]?.currency ?? 'ARS';
  const discount = coupon?.discount ?? 0;
  const selected = shippingOptions?.find((o) => o.id === shippingId) ?? null;
  // Opciones dinámicas cotizadas: "correo-<i>" | "zipnova-<i>".
  const selectedCorreo = shippingId?.startsWith('correo-')
    ? (correoOptions?.[Number(shippingId.slice(7))] ?? null)
    : null;
  const selectedZipnova = shippingId?.startsWith('zipnova-')
    ? (zipnovaOptions?.[Number(shippingId.slice(8))] ?? null)
    : null;
  const shipCost =
    selectedCorreo?.price.amount ?? selectedZipnova?.price.amount ?? selected?.price.amount ?? 0; // centavos (ApiJson.MoneyJson)
  const total = Math.max(0, subtotal - discount) + shipCost;
  const needsAddress =
    selected?.kind === 'DELIVERY' || selectedCorreo?.kind === 'D' || selectedZipnova !== null;
  const shippingLabel = selectedCorreo?.name ?? selectedZipnova?.name ?? selected?.name ?? null;
  const anyQuoter = correoEnabled || zipnovaEnabled;

  // Cotiza contra TODOS los carriers activos en paralelo. Correo solo pide CP;
  // Zipnova además ciudad + provincia (su API resuelve el destino por localidad).
  const quoteShipping = async () => {
    const cp = correoCp.trim();
    if (!/^\d{4}$/.test(cp)) {
      setCorreoError('Ingresá un código postal de 4 dígitos.');
      return;
    }
    if (zipnovaEnabled && (!quoteCity.trim() || !quoteProvince.trim())) {
      setZipnovaError('Completá ciudad y provincia para cotizar con Zipnova.');
      if (!correoEnabled) return;
    } else {
      setZipnovaError(null);
    }
    setCorreoLoading(true);
    setCorreoError(null);
    setCorreoOptions(null);
    setZipnovaOptions(null);
    if (shippingId?.startsWith('correo-') || shippingId?.startsWith('zipnova-')) setShippingId(null);
    setAgencyCode(null);
    const units = lines.reduce((s, l) => s + l.quantity, 0);
    const headers = tenantHeaders(tenantId, true);

    const correoPromise = correoEnabled
      ? fetch(`${API}/api/v1/shipping/correo/quote`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ postalCode: cp, units }),
        })
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok) throw new Error(data?.detail ?? 'No se pudo cotizar.');
            setCorreoOptions(data.options ?? []);
            if (data.error) setCorreoError(data.error);
            else if ((data.options ?? []).length === 0)
              setCorreoError('Correo Argentino no tiene tarifas para ese código postal.');
          })
          .catch((e) =>
            setCorreoError(e instanceof Error ? e.message : 'No se pudo cotizar con Correo Argentino.'),
          )
      : Promise.resolve();

    const zipnovaPromise =
      zipnovaEnabled && quoteCity.trim() && quoteProvince.trim()
        ? fetch(`${API}/api/v1/shipping/zipnova/quote`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              postalCode: cp,
              city: quoteCity.trim(),
              state: quoteProvince.trim(),
              units,
              declaredValue: subtotal / 100,
            }),
          })
            .then(async (res) => {
              const data = await res.json();
              if (!res.ok) throw new Error(data?.detail ?? 'No se pudo cotizar.');
              setZipnovaOptions(data.options ?? []);
              if (data.error) setZipnovaError(data.error);
              else if ((data.options ?? []).length === 0)
                setZipnovaError('Zipnova no tiene opciones para ese destino.');
            })
            .catch((e) => setZipnovaError(e instanceof Error ? e.message : 'No se pudo cotizar con Zipnova.'))
        : Promise.resolve();

    await Promise.all([correoPromise, zipnovaPromise]);
    if (!zip.trim()) setZip(cp);
    if (quoteCity.trim() && !city.trim()) setCity(quoteCity.trim());
    setCorreoLoading(false);
  };

  const loadAgencies = async (prov: string) => {
    setAgencies(null);
    setAgencyCode(null);
    try {
      const res = await fetch(`${API}/api/v1/shipping/correo/agencies?province=${prov}`, {
        headers: tenantHeaders(tenantId),
      });
      const data = await res.json();
      setAgencies(data.items ?? []);
    } catch {
      setAgencies([]);
    }
  };

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponError(null);
    const r = await validateCouponApi(tenantId, code, subtotal);
    if (r.ok) setCoupon({ code: r.code, discount: r.discount });
    else {
      setCoupon(null);
      setCouponError(r.error);
    }
  };

  const formattedAddress = () =>
    needsAddress
      ? [
          `${street.trim()} ${streetNumber.trim()}`.trim(),
          apartment.trim(),
          city.trim(),
          zip.trim() ? `CP ${zip.trim()}` : '',
        ]
          .filter(Boolean)
          .join(', ')
      : null;

  const continueToPago = () => {
    setFieldError(null);
    if (!email.includes('@') || email.trim().length < 5) return setFieldError('Ingresá un email válido.');
    if (
      (shippingOptions?.length ?? 0) + (correoOptions?.length ?? 0) + (zipnovaOptions?.length ?? 0) > 0 &&
      !shippingId
    )
      return setFieldError('Elegí cómo querés recibir tu compra.');
    if (selectedCorreo?.kind === 'S' && !agencyCode)
      return setFieldError('Elegí la sucursal de Correo donde querés retirar.');
    if (!name.trim() || !lastName.trim()) return setFieldError('Completá nombre y apellido.');
    if (!phone.trim()) return setFieldError('Completá tu teléfono.');
    if (needsAddress && (!street.trim() || !streetNumber.trim() || !city.trim() || !zip.trim()))
      return setFieldError('Completá la dirección de entrega (calle, número, ciudad y código postal).');
    setStep('pago');
    window.scrollTo({ top: 0 });
  };

  // start + submit → reserva stock con todos los datos; devuelve sessionId.
  const reserve = async (buyerEmail: string) => {
    const headers = tenantHeaders(tenantId, true);
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
      body: JSON.stringify({
        email: buyerEmail,
        name: name.trim() || null,
        lastName: lastName.trim() || null,
        phone: phone.trim() || null,
        docNumber: doc.trim() || null,
        notes: notes.trim() || null,
        shippingMethodId: selectedCorreo || selectedZipnova ? null : shippingId,
        address: formattedAddress(),
        shippingQuoteToken: selectedCorreo?.token ?? selectedZipnova?.token ?? null,
        correoAgency: selectedCorreo?.kind === 'S' ? agencyCode : null,
      }),
    });
    if (!submitRes.ok) {
      const p = await submitRes.json().catch(() => null);
      throw new Error(p?.detail ?? 'No hay stock suficiente para algún producto.');
    }
    return session.id as string;
  };

  // De dónde vino esta venta: el mismo first-touch que guarda el beacon de
  // analytics — así Rentabilidad puede medir ganancia por canal.
  const utmSource = () => {
    try {
      return sessionStorage.getItem('tiendafy.utm');
    } catch {
      return null;
    }
  };

  const payPro = async () => {
    setPaying(true);
    setError(null);
    try {
      const id = await reserve(email.trim());
      const payRes = await fetch(`${API}/api/v1/checkout/${id}/pay`, {
        method: 'POST',
        headers: tenantHeaders(tenantId, true),
        body: JSON.stringify({
          returnUrl: window.location.origin,
          couponCode: coupon?.code ?? null,
          utmSource: utmSource(),
        }),
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

  // Payment Brick (on-site): el front tokeniza, el backend cobra el total real.

  const onBrickSubmit = async ({ formData }: { formData: any }) => {
    setError(null);
    const payer = (formData.payer ?? {}) as {
      email?: string;
      identification?: { type?: string; number?: string };
    };
    const buyerEmail = payer.email || email;
    try {
      const id = await reserve(buyerEmail);
      const res = await fetch(`${API}/api/v1/checkout/${id}/pay-onsite`, {
        method: 'POST',
        headers: tenantHeaders(tenantId, true),
        body: JSON.stringify({
          token: formData.token,
          paymentMethodId: formData.payment_method_id,
          installments: formData.installments,
          issuerId: formData.issuer_id,
          payerDocType: payer.identification?.type,
          payerDocNumber: payer.identification?.number,
          couponCode: coupon?.code ?? null,
          utmSource: utmSource(),
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

  if (!hydrated || mode === null || shippingOptions === null)
    return (
      <main className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin opacity-50" />
      </main>
    );

  if (lines.length === 0)
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="opacity-70">Tu carrito está vacío.</p>
        <a href="/" className="mt-4 inline-block text-primary underline">
          Volver a la tienda
        </a>
      </main>
    );

  if (!connected)
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="opacity-70">Esta tienda todavía no tiene los pagos habilitados.</p>
        <a href="/" className="mt-4 inline-block text-primary underline">
          Volver
        </a>
      </main>
    );

  const inputCls = `${INPUT_LIGHT_11} focus:outline-none focus:ring-2 focus:ring-black/30`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {/* Indicador de pasos: Carrito → Entrega → Pago */}
      <div className="mx-auto mb-8 flex max-w-md items-center">
        <StepDot label="Carrito" state="done" href="/" />
        <div className="h-px flex-1 bg-black/20" />
        <StepDot
          label="Entrega"
          state={step === 'entrega' ? 'current' : 'done'}
          onClick={step === 'pago' ? () => setStep('entrega') : undefined}
        />
        <div className="h-px flex-1 bg-black/20" />
        <StepDot label="Pago" state={step === 'pago' ? 'current' : 'todo'} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          {step === 'entrega' ? (
            <div className="space-y-7">
              <section>
                <h2 className="mb-3 text-lg font-bold">Datos de contacto</h2>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mail"
                  className={inputCls}
                />
              </section>

              {shippingOptions.length > 0 && (
                <section>
                  <h2 className="mb-3 text-lg font-bold">Entrega</h2>
                  <div className="space-y-2">
                    {shippingOptions.map((o) => (
                      <label
                        key={o.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 text-sm transition ${shippingId === o.id ? 'border-black bg-black/[0.03] ring-1 ring-black' : 'border-black/15 hover:border-black/30'}`}
                      >
                        <input
                          type="radio"
                          name="shipping"
                          checked={shippingId === o.id}
                          onChange={() => setShippingId(o.id)}
                          className="mt-1"
                        />
                        <span className="flex-1">
                          <span className="flex items-center gap-1.5 font-semibold">
                            {o.kind === 'PICKUP' ? (
                              <Store className="h-4 w-4" />
                            ) : (
                              <Truck className="h-4 w-4" />
                            )}
                            {o.name}
                          </span>
                          {o.description && (
                            <span className="mt-0.5 block text-xs opacity-60">{o.description}</span>
                          )}
                          {o.kind === 'PICKUP' && o.pickupAddress && (
                            <span className="mt-0.5 block text-xs opacity-60">{o.pickupAddress}</span>
                          )}
                        </span>
                        <span className="font-semibold">
                          {o.price.amount === 0 ? 'Gratis' : formatMoney(o.price.amount, o.price.currency)}
                        </span>
                      </label>
                    ))}
                  </div>
                </section>
              )}

              {anyQuoter && (
                <section>
                  {shippingOptions.length === 0 && <h2 className="mb-3 text-lg font-bold">Entrega</h2>}
                  <div className="rounded-lg border border-black/15 p-3.5">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <Truck className="h-4 w-4" /> Calculá tu envío
                    </div>
                    <p className="mt-0.5 text-xs opacity-60">
                      {[correoEnabled && 'Correo Argentino', zipnovaEnabled && 'Zipnova']
                        .filter(Boolean)
                        .join(' y ')}{' '}
                      cotizan al instante para tu dirección.
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <input
                        value={correoCp}
                        onChange={(e) => setCorreoCp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        onKeyDown={(e) => e.key === 'Enter' && quoteShipping()}
                        placeholder="Código postal"
                        inputMode="numeric"
                        aria-label="Código postal para cotizar"
                        className={`${inputCls} max-w-[140px]`}
                      />
                      {zipnovaEnabled && (
                        <>
                          <input
                            value={quoteCity}
                            onChange={(e) => setQuoteCity(e.target.value)}
                            placeholder="Ciudad"
                            aria-label="Ciudad para cotizar"
                            className={`${inputCls} max-w-[180px]`}
                          />
                          <input
                            value={quoteProvince}
                            onChange={(e) => setQuoteProvince(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && quoteShipping()}
                            placeholder="Provincia"
                            aria-label="Provincia para cotizar"
                            className={`${inputCls} max-w-[180px]`}
                          />
                        </>
                      )}
                      <button
                        type="button"
                        onClick={quoteShipping}
                        disabled={correoLoading}
                        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-black/20 px-4 text-sm font-semibold disabled:opacity-60"
                      >
                        {correoLoading && <Loader2 className="h-4 w-4 animate-spin" />} Calcular
                      </button>
                    </div>
                    {correoError && <p className="mt-2 text-xs text-red-600">{correoError}</p>}
                    {zipnovaError && <p className="mt-2 text-xs text-red-600">{zipnovaError}</p>}

                    {zipnovaOptions && zipnovaOptions.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {zipnovaOptions.map((o, i) => {
                          const id = `zipnova-${i}`;
                          const eta = o.estimatedDelivery
                            ? formatDate(o.estimatedDelivery, { day: 'numeric', month: 'long' })
                            : null;
                          return (
                            <label
                              key={id}
                              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${shippingId === id ? 'border-black bg-black/[0.03] ring-1 ring-black' : 'border-black/15 hover:border-black/30'}`}
                            >
                              <input
                                type="radio"
                                name="shipping"
                                checked={shippingId === id}
                                onChange={() => setShippingId(id)}
                                className="mt-1"
                              />
                              <span className="flex-1">
                                <span className="flex items-center gap-1.5 font-semibold">
                                  <Truck className="h-4 w-4" />
                                  {o.name}
                                </span>
                                {eta && (
                                  <span className="mt-0.5 block text-xs opacity-60">
                                    Llega aprox. el {eta}
                                  </span>
                                )}
                              </span>
                              <span className="font-semibold">
                                {formatMoney(o.price.amount, o.price.currency)}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {correoOptions && correoOptions.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {correoOptions.map((o, i) => {
                          const id = `correo-${i}`;
                          return (
                            <label
                              key={id}
                              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${shippingId === id ? 'border-black bg-black/[0.03] ring-1 ring-black' : 'border-black/15 hover:border-black/30'}`}
                            >
                              <input
                                type="radio"
                                name="shipping"
                                checked={shippingId === id}
                                onChange={() => {
                                  setShippingId(id);
                                  if (o.kind === 'S' && agencies === null) loadAgencies(agencyProvince);
                                }}
                                className="mt-1"
                              />
                              <span className="flex-1">
                                <span className="flex items-center gap-1.5 font-semibold">
                                  {o.kind === 'S' ? (
                                    <Store className="h-4 w-4" />
                                  ) : (
                                    <Truck className="h-4 w-4" />
                                  )}
                                  {o.name}
                                </span>
                                {o.etaMin && (
                                  <span className="mt-0.5 block text-xs opacity-60">
                                    Llega en {o.etaMin}
                                    {o.etaMax && o.etaMax !== o.etaMin ? ` a ${o.etaMax}` : ''} días hábiles
                                  </span>
                                )}
                              </span>
                              <span className="font-semibold">
                                {formatMoney(o.price.amount, o.price.currency)}
                              </span>
                            </label>
                          );
                        })}

                        {selectedCorreo?.kind === 'S' && (
                          <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3">
                            <div className="text-xs font-semibold">¿En qué sucursal retirás?</div>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <select
                                value={agencyProvince}
                                onChange={(e) => {
                                  setAgencyProvince(e.target.value);
                                  loadAgencies(e.target.value);
                                }}
                                aria-label="Provincia"
                                className={`${inputCls} appearance-none`}
                              >
                                {CORREO_PROVINCES.map(([code, label]) => (
                                  <option key={code} value={code}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={agencyCode ?? ''}
                                onChange={(e) => setAgencyCode(e.target.value || null)}
                                aria-label="Sucursal"
                                className={`${inputCls} appearance-none`}
                              >
                                <option value="">
                                  {agencies === null ? 'Cargando sucursales…' : 'Elegí la sucursal'}
                                </option>
                                {(agencies ?? []).map((a) => (
                                  <option key={a.code} value={a.code}>
                                    {a.name ?? a.code}
                                    {a.address ? ` — ${a.address}` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {agencies !== null && agencies.length === 0 && (
                              <p className="mt-1.5 text-xs text-red-600">
                                No encontramos sucursales en esa provincia. Probá con otra o elegí envío a
                                domicilio.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </section>
              )}

              <section>
                <h2 className="mb-3 text-lg font-bold">
                  {needsAddress ? 'Datos del destinatario' : 'Tus datos'}
                </h2>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nombre"
                    className={inputCls}
                  />
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Apellido"
                    className={inputCls}
                  />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Teléfono"
                    className={inputCls}
                  />
                  <input
                    value={doc}
                    onChange={(e) => setDoc(e.target.value)}
                    placeholder="DNI o CUIT (facturación)"
                    className={inputCls}
                  />
                </div>
                {needsAddress && (
                  <div className="mt-2.5 grid gap-2.5">
                    <div className="grid gap-2.5 sm:grid-cols-[1fr_140px]">
                      <input
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        placeholder="Calle"
                        className={inputCls}
                      />
                      <input
                        value={streetNumber}
                        onChange={(e) => setStreetNumber(e.target.value)}
                        placeholder="Número"
                        className={inputCls}
                      />
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <input
                        value={apartment}
                        onChange={(e) => setApartment(e.target.value)}
                        placeholder="Departamento (opcional)"
                        className={inputCls}
                      />
                      <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Ciudad"
                        className={inputCls}
                      />
                    </div>
                    <input
                      value={zip}
                      onChange={(e) => setZip(e.target.value)}
                      placeholder="Código Postal"
                      className={`${inputCls} sm:max-w-[200px]`}
                    />
                  </div>
                )}
              </section>

              {fieldError && <p className="text-sm text-red-600">{fieldError}</p>}

              <button
                onClick={continueToPago}
                className="w-full rounded-md bg-primary py-3.5 text-sm font-semibold text-primary-fg sm:max-w-xs"
              >
                Continuar para el pago
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Resumen de lo elegido, con Cambiar */}
              <div className="space-y-3 rounded-lg border border-black/10 p-4 text-sm">
                <div className="flex items-start gap-2.5">
                  <Mail className="mt-0.5 h-4 w-4 opacity-50" />
                  <span className="flex-1">{email}</span>
                  <button onClick={() => setStep('entrega')} className="text-xs underline opacity-70">
                    Cambiar
                  </button>
                </div>
                {(selected || selectedCorreo || selectedZipnova) && (
                  <div className="flex items-start gap-2.5">
                    {selected?.kind === 'PICKUP' || selectedCorreo?.kind === 'S' ? (
                      <Store className="mt-0.5 h-4 w-4 opacity-50" />
                    ) : (
                      <Truck className="mt-0.5 h-4 w-4 opacity-50" />
                    )}
                    <span className="flex-1">
                      <strong>{shippingLabel}</strong> ·{' '}
                      {shipCost === 0 ? 'Gratis' : formatMoney(shipCost, currency)}
                      {selected?.description && (
                        <span className="block text-xs opacity-60">{selected.description}</span>
                      )}
                      {selectedCorreo?.kind === 'S' && agencyCode && (
                        <span className="block text-xs opacity-60">
                          Sucursal: {agencies?.find((a) => a.code === agencyCode)?.name ?? agencyCode}
                        </span>
                      )}
                    </span>
                    <button onClick={() => setStep('entrega')} className="text-xs underline opacity-70">
                      Cambiar
                    </button>
                  </div>
                )}
                {formattedAddress() && (
                  <div className="flex items-start gap-2.5">
                    <MapPin className="mt-0.5 h-4 w-4 opacity-50" />
                    <span className="flex-1">
                      {formattedAddress()}
                      <span className="block text-xs opacity-60">
                        {name} {lastName} · {phone}
                      </span>
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-2.5">
                  <MessageSquare className="mt-0.5 h-4 w-4 opacity-50" />
                  {showNotes ? (
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      maxLength={500}
                      rows={2}
                      placeholder="Notas del pedido (opcional)"
                      className="flex-1 rounded-md border border-black/15 bg-white p-2 text-sm text-black"
                    />
                  ) : (
                    <>
                      <span className="flex-1 opacity-70">{notes ? notes : 'Notas de pedido'}</span>
                      <button onClick={() => setShowNotes(true)} className="text-xs underline opacity-70">
                        {notes ? 'Editar' : 'Agregar'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CreditCard className="h-5 w-5" /> Medio de pago
              </h2>

              {mode === 'API' && pubKey ? (
                <Payment
                  key={total}
                  initialization={{ amount: total / 100, payer: { email: email || undefined } }}
                  customization={{
                    paymentMethods: {
                      creditCard: 'all',
                      debitCard: 'all',
                      ticket: 'all',
                      bankTransfer: 'all',
                    },
                  }}
                  onSubmit={onBrickSubmit}
                  onError={() => setError('Hubo un problema con el formulario de pago.')}
                />
              ) : (
                <button
                  onClick={payPro}
                  disabled={paying}
                  className="w-full rounded-md bg-primary py-3.5 text-sm font-semibold text-primary-fg disabled:opacity-60 sm:max-w-xs"
                >
                  {paying ? 'Redirigiendo a Mercado Pago…' : 'Pagar con Mercado Pago'}
                </button>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}
        </div>

        {/* Resumen del pedido */}
        <aside className="h-fit rounded-lg border border-black/10 p-4 text-sm lg:sticky lg:top-6">
          {lines.map((l) => (
            <div key={l.variantId} className="flex items-center gap-3 py-1.5">
              {l.image && <img src={l.image} alt="" className="h-12 w-12 rounded-md object-cover" />}
              <span className="flex-1">
                {l.productName}
                {l.variantLabel && l.variantLabel !== 'Única' ? ` · ${l.variantLabel}` : ''} × {l.quantity}
              </span>
              <span className="tabular-nums">{formatMoney(l.priceAmount * l.quantity, l.currency)}</span>
            </div>
          ))}
          <div className="mt-3 space-y-1 border-t border-black/10 pt-3">
            <div className="flex justify-between">
              <span className="opacity-70">Subtotal</span>
              <span className="tabular-nums">{formatMoney(subtotal, currency)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Descuento ({coupon?.code})</span>
                <span className="tabular-nums">- {formatMoney(discount, currency)}</span>
              </div>
            )}
            {(selected || selectedCorreo || selectedZipnova) && (
              <div className="flex justify-between">
                <span className="opacity-70">Costo de envío</span>
                <span className="tabular-nums">
                  {shipCost === 0 ? 'Gratis' : formatMoney(shipCost, currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between pt-1 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(total, currency)}</span>
            </div>
          </div>

          {!coupon && (
            <div className="mt-4">
              <div className="flex gap-2">
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Cupón de descuento"
                  className={INPUT_LIGHT_10}
                />
                <button
                  onClick={applyCoupon}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-black/20 px-3 text-sm font-semibold"
                >
                  <Tag className="h-4 w-4" /> Aplicar
                </button>
              </div>
              {couponError && <p className="mt-1 text-xs text-red-600">{couponError}</p>}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function StepDot({
  label,
  state,
  href,
  onClick,
}: {
  label: string;
  state: 'done' | 'current' | 'todo';
  href?: string;
  onClick?: () => void;
}) {
  const dot = (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
        state === 'current'
          ? 'border-black bg-black text-white'
          : state === 'done'
            ? 'border-black/40 text-black/70'
            : 'border-black/20 text-black/30'
      }`}
    >
      {state === 'done' ? <Check className="h-3.5 w-3.5" /> : ''}
    </span>
  );
  const body = (
    <span className="flex flex-col items-center gap-1">
      {dot}
      <span className={`text-xs ${state === 'current' ? 'font-semibold' : 'opacity-60'}`}>{label}</span>
    </span>
  );
  if (href) return <a href={href}>{body}</a>;
  if (onClick) return <button onClick={onClick}>{body}</button>;
  return body;
}
