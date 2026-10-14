'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import { Check, CreditCard, Loader2, MapPin, Mail, MessageSquare, Store, Tag, Truck } from 'lucide-react';
import { formatMoney } from '@tiendafy/types';
import { PaywayCardForm, type PaywayCardToken, type PaywayPublicConfig } from './PaywayCardForm';
import { CheckoutResult } from './CheckoutResult';
import {
  CARRIER_KEYS,
  CARRIERS,
  enabledCarriers,
  quoteHint,
  type CarrierKey,
  type QuotedOption,
} from './checkout-carriers';

import { API_URL as API, tenantHeaders } from '@/lib/api-client';
import type { MoneyDto } from '@tiendafy/types';
import { couponStorageKey, LineIssueText, PriceChangeNotice, useCart, type StoredCoupon } from './cart';
import { readJson, removeKey, writeJson } from '@/lib/storage';
import { finishPurchase } from '@/lib/cart-storage';
import { hardNavigate } from '@/lib/navigation';
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

interface CorreoAgency {
  code: string;
  name: string | null;
  address: string;
}

/**
 * Lo que el comercio configuró en el panel sobre este checkout. Se leen los
 * valores por defecto si la tienda nunca tocó la pantalla, así que el checkout
 * nunca queda esperando esta respuesta para poder dibujarse.
 */
interface CheckoutSettings {
  singleColumn: boolean;
  requirePhone: boolean;
  requireDocument: boolean;
  customerNoteEnabled: boolean;
  customerNoteLabel: string;
  orderMessageEnabled: boolean;
  orderMessageText: string;
}

const DEFAULT_SETTINGS: CheckoutSettings = {
  singleColumn: false,
  requirePhone: true,
  requireDocument: false,
  customerNoteEnabled: true,
  customerNoteLabel: 'Aclaraciones sobre tu pedido',
  orderMessageEnabled: false,
  orderMessageText: '',
};

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

// Tope de espera de cada pedido a la API: un servidor que no contesta no puede
// dejar al comprador mirando un spinner para siempre.
const FETCH_TIMEOUT_MS = 10_000;

export function CheckoutClient({ tenantId }: { tenantId: string }) {
  // El carrito es el de la tienda (el mismo del ícono): así lo que se reprecia
  // o se quita acá se ve en todos lados.
  const { lines, hydrated, refreshPrices, priceChanges, issues, blocked, remove } = useCart();
  const [mode, setMode] = useState<Mode | null>(null);
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [payway, setPayway] = useState<PaywayPublicConfig | null>(null);
  // Con los dos medios disponibles, el comprador elige.
  const [method, setMethod] = useState<'mp' | 'payway'>('mp');
  const [connected, setConnected] = useState(true);

  const [step, setStep] = useState<Step>('entrega');

  // Paso Entrega
  const [email, setEmail] = useState('');
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[] | null>(null);
  const [shippingId, setShippingId] = useState<string | null>(null);

  // Correos que cotizan en vivo (ver checkout-carriers): todos con el código
  // postal; los que resuelven por localidad, además ciudad y provincia.
  const [carriers, setCarriers] = useState<CarrierKey[]>([]);
  const [quoteCp, setQuoteCp] = useState('');
  const [quoteCity, setQuoteCity] = useState('');
  const [quoteProvince, setQuoteProvince] = useState('');
  const [quotes, setQuotes] = useState<Partial<Record<CarrierKey, QuotedOption[]>>>({});
  const [quoteErrors, setQuoteErrors] = useState<Partial<Record<CarrierKey | 'cp', string>>>({});
  const [quoting, setQuoting] = useState(false);
  // Sucursal de retiro (Correo Argentino a sucursal).
  const [agencyProvince, setAgencyProvince] = useState('B');
  const [agencies, setAgencies] = useState<CorreoAgency[] | null>(null);
  const [agencyCode, setAgencyCode] = useState<string | null>(null);
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
  const [settings, setSettings] = useState<CheckoutSettings>(DEFAULT_SETTINGS);
  const [showNotes, setShowNotes] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<StoredCoupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<'failure' | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // El cupón que el comprador aplicó en el carrito llega hasta acá; igual se
    // revalida contra el servidor antes de cobrar (nunca se confía en el dato
    // guardado en el navegador).
    setCoupon(readJson<StoredCoupon | null>(couponStorageKey(tenantId), null));
  }, [tenantId]);

  // Precio y stock de hoy, antes de mostrar un total: el carrito guarda los
  // de cuando se agregó cada cosa, y el cobro sale por los vigentes.
  const repriced = useRef(false);
  useEffect(() => {
    if (repriced.current || !hydrated || lines.length === 0) return;
    repriced.current = true;
    void refreshPrices();
  }, [hydrated, lines.length, refreshPrices]);

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

    // Payway se pide aparte: son dos medios de pago independientes y que uno
    // falle no tiene por qué dejar sin cobrar al otro.
    fetch(`${API}/api/v1/payments/payway/public-config`, { headers })
      .then((r) => r.json())
      .then((c: PaywayPublicConfig) => setPayway(c.enabled ? c : null))
      .catch(() => setPayway(null));

    fetch(`${API}/api/v1/checkout-settings`, { headers })
      .then((r) => r.json())
      .then((d: CheckoutSettings) => setSettings({ ...DEFAULT_SETTINGS, ...d }))
      .catch(() => setSettings(DEFAULT_SETTINGS));

    fetch(`${API}/api/v1/shipping/methods`, { headers })
      .then((r) => r.json())
      .then((d) => {
        setShippingOptions(d.items ?? []);
        setCarriers(enabledCarriers(d));
      })
      .catch(() => setShippingOptions([]));
  }, [tenantId]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.priceAmount * l.quantity, 0), [lines]);
  const currency = lines[0]?.currency ?? 'ARS';
  const discount = coupon?.discount ?? 0;
  const selected = shippingOptions?.find((o) => o.id === shippingId) ?? null;
  // Opciones cotizadas, con id "<correo>-<i>" para el radio.
  const quoteOptions = CARRIER_KEYS.flatMap((k) =>
    (quotes[k] ?? []).map((option, i) => ({ id: `${k}-${i}`, option })),
  );
  const selectedQuote = quoteOptions.find((q) => q.id === shippingId)?.option ?? null;
  const quotedShipping = selectedQuote?.price.amount ?? selected?.price.amount ?? 0; // centavos (ApiJson.MoneyJson)
  // Cupón de envío gratis: el servidor pone el envío en cero al crear la orden,
  // así que lo que se muestra acá tiene que decir lo mismo.
  const shipCost = coupon?.freeShipping ? 0 : quotedShipping;
  const total = Math.max(0, subtotal - discount) + shipCost;
  // Retiro en el local o en una sucursal del correo: sin dirección.
  const needsAddress = selected?.kind === 'DELIVERY' || (selectedQuote !== null && !selectedQuote.pickup);
  const shippingLabel = selectedQuote?.name ?? selected?.name ?? null;
  const hasShipping = Boolean(selected || selectedQuote);

  // Cotiza contra TODOS los correos activos en paralelo. Los que necesitan
  // ciudad y provincia y no las tienen se saltean con su aviso; el resto
  // cotiza igual.
  const quoteShipping = async () => {
    const cp = quoteCp.trim();
    if (!/^\d{4}$/.test(cp)) {
      setQuoteErrors({ cp: 'Ingresá un código postal de 4 dígitos.' });
      return;
    }
    const hasPlace = Boolean(quoteCity.trim() && quoteProvince.trim());
    const errors: Partial<Record<CarrierKey | 'cp', string>> = {};
    const ready = carriers.filter((k) => {
      if (!CARRIERS[k].needsCityProvince || hasPlace) return true;
      errors[k] = `Completá ciudad y provincia para cotizar con ${CARRIERS[k].label}.`;
      return false;
    });
    setQuoteErrors(errors);
    if (ready.length === 0) return;

    setQuoting(true);
    setQuotes({});
    if (selectedQuote) setShippingId(null);
    setAgencyCode(null);
    // El detalle del carrito: cada correo cotiza con el peso y las medidas de
    // cada variante, y la cotización queda atada a este contenido.
    const input = {
      postalCode: cp,
      city: quoteCity.trim(),
      province: quoteProvince.trim(),
      units: lines.reduce((s, l) => s + l.quantity, 0),
      items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      declaredValue: subtotal / 100,
    };
    const headers = tenantHeaders(tenantId, true);

    await Promise.all(
      ready.map(async (k) => {
        const carrier = CARRIERS[k];
        let message: string | null = null;
        try {
          const res = await fetch(`${API}${carrier.path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(carrier.body(input)),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            message = data?.detail ?? 'No se pudo cotizar.';
          } else {
            const options = ((data?.options ?? []) as Record<string, unknown>[]).map(carrier.toOption);
            setQuotes((q) => ({ ...q, [k]: options }));
            message = data?.error ?? (options.length === 0 ? carrier.noRates : null);
          }
        } catch {
          // Sin red o sin respuesta a tiempo.
          message = `No se pudo cotizar con ${carrier.label}.`;
        }
        if (message) setQuoteErrors((prev) => ({ ...prev, [k]: message }));
      }),
    );
    if (!zip.trim()) setZip(cp);
    if (quoteCity.trim() && !city.trim()) setCity(quoteCity.trim());
    setQuoting(false);
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

  const applyCoupon = async (raw?: string) => {
    const code = (raw ?? couponInput).trim().toUpperCase();
    if (!code) return;
    setCouponError(null);
    const r = await validateCouponApi(tenantId, code, subtotal);
    if (r.ok) {
      const applied: StoredCoupon = { code: r.code, discount: r.discount, freeShipping: r.freeShipping };
      setCoupon(applied);
      writeJson(couponStorageKey(tenantId), applied);
    } else {
      setCoupon(null);
      removeKey(couponStorageKey(tenantId));
      setCouponError(r.error);
    }
  };

  // El cupón que vino del carrito se revalida con el subtotal real de esta
  // compra: si venció o ya no llega al mínimo, se cae acá y no en el cobro.
  // Y otra vez si el subtotal cambia (un precio actualizado, una línea quitada).
  const validatedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!hydrated || !coupon || subtotal <= 0 || validatedFor.current === subtotal) return;
    validatedFor.current = subtotal;
    applyCoupon(coupon.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, coupon, subtotal]);

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
    // Si la tienda envía (métodos propios o correos que cotizan), hay que elegir
    // cómo. Antes solo contaban las opciones ya cotizadas: con solo correos y
    // sin tocar "Calcular" se podía pagar sin envío.
    if (!hasShipping && carriers.length > 0 && quoteOptions.length === 0 && !shippingOptions?.length)
      return setFieldError('Ingresá tu código postal y tocá «Calcular» para elegir el envío.');
    if (!hasShipping && ((shippingOptions?.length ?? 0) > 0 || carriers.length > 0))
      return setFieldError('Elegí cómo querés recibir tu compra.');
    if (selectedQuote?.needsAgency && !agencyCode)
      return setFieldError('Elegí la sucursal de Correo donde querés retirar.');
    if (!name.trim() || !lastName.trim()) return setFieldError('Completá nombre y apellido.');
    if (settings.requirePhone && !phone.trim()) return setFieldError('Completá tu teléfono.');
    if (settings.requireDocument && !doc.trim())
      return setFieldError('Completá tu DNI o CUIT para poder facturarte.');
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
        shippingMethodId: selectedQuote ? null : shippingId,
        address: formattedAddress(),
        shippingQuoteToken: selectedQuote?.token ?? null,
        correoAgency: selectedQuote?.needsAgency ? agencyCode : null,
      }),
    });
    if (!submitRes.ok) {
      const p = await submitRes.json().catch(() => null);
      throw new Error(p?.detail ?? 'No hay stock suficiente para algún producto.');
    }
    return session.id as string;
  };

  // El monto queda anotado en esta pestaña para que la pantalla de "listo"
  // pueda medir la venta. Va acá y no en un endpoint público porque el total
  // de una orden no puede quedar a mano de cualquiera que tenga el id; es un
  // dato del propio comprador, guardado en su propio navegador. Se anota con
  // el id de la ORDEN (el que llega a "listo" en ?order=), que es distinto
  // del de la sesión de checkout.
  const stashPurchase = (orderId: string) => {
    try {
      sessionStorage.setItem('tiendafy.purchase', JSON.stringify({ orderId, value: total / 100, currency }));
    } catch {
      /* sin almacenamiento no se mide la venta, pero la compra sigue */
    }
  };

  /**
   * Un cobro con tarjeta que se resolvió acá mismo (Brick o Payway) termina en
   * la misma pantalla de resultado que el redirect de Mercado Pago: así el
   * carrito se vacía en un solo lugar y la venta se mide (la página de pago no
   * carga medición, a propósito). Carga completa: "listo" arranca de cero.
   */
  const finish = (orderId: string, kind: 'success' | 'pending') => {
    // Mientras carga "listo": sin esto, el carrito recién vaciado mostraba un
    // instante "Tu carrito está vacío" justo después de pagar.
    setLeaving(true);
    if (kind === 'success') finishPurchase(tenantId, orderId);
    hardNavigate(`/checkout/${kind}?order=${encodeURIComponent(orderId)}`);
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

  /**
   * POST a un endpoint de pago del checkout. Los campos que van SIEMPRE (cupón
   * y atribución) viven acá una sola vez: cuando se sumó utm_source hubo que
   * acordarse de tocar los dos flujos, y ese olvido se paga en Rentabilidad.
   */
  const postPayment = async <T,>(
    id: string,
    path: 'pay' | 'pay-onsite' | 'pay-payway',
    body: object,
    failMsg: string,
  ) => {
    const res = await fetch(`${API}/api/v1/checkout/${id}/${path}`, {
      method: 'POST',
      headers: tenantHeaders(tenantId, true),
      body: JSON.stringify({ ...body, couponCode: coupon?.code ?? null, utmSource: utmSource() }),
    });
    if (!res.ok) {
      const p = await res.json().catch(() => null);
      throw new Error(p?.detail ?? failMsg);
    }
    return (await res.json()) as T;
  };

  const payPro = async () => {
    setPaying(true);
    setError(null);
    try {
      const id = await reserve(email.trim());
      const { initPoint, orderId } = await postPayment<{ initPoint?: string; orderId?: string }>(
        id,
        'pay',
        { returnUrl: window.location.origin },
        'No se pudo iniciar el pago.',
      );
      if (!initPoint) throw new Error('Mercado Pago no devolvió el link de pago.');
      stashPurchase(orderId ?? id);
      hardNavigate(initPoint);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar el pago.');
      setPaying(false);
    }
  };

  /**
   * Lo que el Payment Brick de Mercado Pago entrega al enviar el formulario.
   * Tipado explícito: era el único `any` del camino del pago, y un rename del
   * SDK (ej. payment_method_id) pasaba el type-check y llegaba a producción
   * como undefined en el body.
   */
  interface BrickFormData {
    token?: string;
    payment_method_id?: string;
    installments?: number;
    issuer_id?: string;
    payer?: { email?: string; identification?: { type?: string; number?: string } };
  }

  // Payment Brick (on-site): el front tokeniza, el backend cobra el total real.

  const onBrickSubmit = async ({ formData }: { formData: BrickFormData }) => {
    setError(null);
    const payer = formData.payer ?? {};
    const buyerEmail = payer.email || email;
    try {
      const id = await reserve(buyerEmail);
      const data = await postPayment<{ status?: string; orderId?: string }>(
        id,
        'pay-onsite',
        {
          token: formData.token,
          paymentMethodId: formData.payment_method_id,
          installments: formData.installments,
          issuerId: formData.issuer_id,
          payerDocType: payer.identification?.type,
          payerDocNumber: payer.identification?.number,
        },
        'El pago fue rechazado.',
      );
      const orderId = data.orderId ?? id;
      if (data.status === 'rejected') return setResult('failure');
      stashPurchase(orderId);
      finish(orderId, data.status === 'approved' ? 'success' : 'pending');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar el pago.');
      throw e;
    }
  };

  /**
   * Cobro con Payway. El formulario ya cambió la tarjeta por un token contra
   * Payway; acá solo viaja ese token con el BIN y los últimos cuatro dígitos.
   */
  const onPaywayToken = async (card: PaywayCardToken) => {
    setError(null);
    setPaying(true);
    try {
      const id = await reserve(email.trim());
      const data = await postPayment<{ status?: string; message?: string; orderId?: string }>(
        id,
        'pay-payway',
        {
          token: card.token,
          bin: card.bin,
          cardLastFour: card.lastFour,
          cardBrand: card.brand,
          isDebit: card.isDebit,
          installments: card.installments,
        },
        'No se pudo procesar el pago.',
      );

      // Un rechazo llega con el motivo ya redactado por el backend. Los estados
      // intermedios (revisión de antifraude, 3D Secure) NO son un fracaso: la
      // orden queda pendiente y se resuelve cuando Payway confirma.
      if (data.status === 'DECLINED') {
        setError(data.message ?? 'El pago fue rechazado. Probá con otra tarjeta.');
        setPaying(false);
        return;
      }

      const orderId = data.orderId ?? id;
      stashPurchase(orderId);
      finish(orderId, data.status === 'APPROVED' ? 'success' : 'pending');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al procesar el pago.');
      setPaying(false);
    }
  };

  if (result) return <CheckoutResult tenantId={tenantId} kind={result} />;

  if (leaving || !hydrated || mode === null || shippingOptions === null)
    return (
      <main className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin opacity-50" />
      </main>
    );

  if (lines.length === 0)
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="opacity-70">Tu carrito está vacío.</p>
        <a href="/" className="mt-4 inline-block text-primary-ink underline">
          Volver a la tienda
        </a>
      </main>
    );

  if (!connected)
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="opacity-70">Esta tienda todavía no tiene los pagos habilitados.</p>
        <a href="/" className="mt-4 inline-block text-primary-ink underline">
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

      <PriceChangeNotice changes={priceChanges} className="mx-auto mb-6 max-w-5xl text-sm" />
      {blocked && (
        <p role="alert" className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          Algunos productos de tu carrito ya no están disponibles como los agregaste. Revisalos en el resumen
          para poder pagar.
        </p>
      )}

      <div className={settings.singleColumn ? 'grid gap-8' : 'grid gap-8 lg:grid-cols-[1fr_360px]'}>
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
                            <span className="mt-0.5 block text-xs text-fg-muted">{o.description}</span>
                          )}
                          {o.kind === 'PICKUP' && o.pickupAddress && (
                            <span className="mt-0.5 block text-xs text-fg-muted">{o.pickupAddress}</span>
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

              {carriers.length > 0 && (
                <section>
                  {shippingOptions.length === 0 && <h2 className="mb-3 text-lg font-bold">Entrega</h2>}
                  <div className="rounded-lg border border-black/15 p-3.5">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <Truck className="h-4 w-4" /> Calculá tu envío
                    </div>
                    <p className="mt-0.5 text-xs text-fg-muted">{quoteHint(carriers)}</p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <input
                        value={quoteCp}
                        onChange={(e) => setQuoteCp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          quoteShipping();
                        }}
                        placeholder="Código postal"
                        inputMode="numeric"
                        autoComplete="postal-code"
                        aria-label="Código postal para cotizar"
                        className={`${inputCls} max-w-[140px]`}
                      />
                      {carriers.some((k) => CARRIERS[k].needsCityProvince) && (
                        <>
                          <input
                            value={quoteCity}
                            onChange={(e) => setQuoteCity(e.target.value)}
                            placeholder="Ciudad"
                            autoComplete="address-level2"
                            aria-label="Ciudad para cotizar"
                            className={`${inputCls} max-w-[180px]`}
                          />
                          <input
                            value={quoteProvince}
                            onChange={(e) => setQuoteProvince(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              quoteShipping();
                            }}
                            placeholder="Provincia"
                            autoComplete="address-level1"
                            aria-label="Provincia para cotizar"
                            className={`${inputCls} max-w-[180px]`}
                          />
                        </>
                      )}
                      <button
                        type="button"
                        onClick={quoteShipping}
                        disabled={quoting}
                        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-black/20 px-4 text-sm font-semibold disabled:opacity-60"
                      >
                        {quoting && <Loader2 className="h-4 w-4 animate-spin" />} Calcular
                      </button>
                    </div>
                    {(['cp', ...CARRIER_KEYS] as const).map(
                      (k) =>
                        quoteErrors[k] && (
                          <p key={k} className="mt-2 text-xs text-red-600">
                            {quoteErrors[k]}
                          </p>
                        ),
                    )}

                    {quoteOptions.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {quoteOptions.map(({ id, option: o }) => (
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
                                if (o.needsAgency && agencies === null) loadAgencies(agencyProvince);
                              }}
                              className="mt-1"
                            />
                            <span className="flex-1">
                              <span className="flex items-center gap-1.5 font-semibold">
                                {o.pickup ? <Store className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                                {o.name}
                              </span>
                              {o.detail && (
                                <span className="mt-0.5 block text-xs text-fg-muted">{o.detail}</span>
                              )}
                            </span>
                            <span className="font-semibold">
                              {formatMoney(o.price.amount, o.price.currency)}
                            </span>
                          </label>
                        ))}

                        {selectedQuote?.needsAgency && (
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
                    placeholder={settings.requirePhone ? 'Teléfono' : 'Teléfono (opcional)'}
                    className={inputCls}
                  />
                  <input
                    value={doc}
                    onChange={(e) => setDoc(e.target.value)}
                    placeholder={
                      settings.requireDocument ? 'DNI o CUIT (facturación)' : 'DNI o CUIT (opcional)'
                    }
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
                disabled={blocked}
                className="w-full rounded-md bg-primary py-3.5 text-sm font-semibold text-primary-fg disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-xs"
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
                {hasShipping && (
                  <div className="flex items-start gap-2.5">
                    {selected?.kind === 'PICKUP' || selectedQuote?.pickup ? (
                      <Store className="mt-0.5 h-4 w-4 opacity-50" />
                    ) : (
                      <Truck className="mt-0.5 h-4 w-4 opacity-50" />
                    )}
                    <span className="flex-1">
                      <strong>{shippingLabel}</strong> ·{' '}
                      {shipCost === 0 ? 'Gratis' : formatMoney(shipCost, currency)}
                      {(selected?.description ?? selectedQuote?.detail) && (
                        <span className="block text-xs text-fg-muted">
                          {selected?.description ?? selectedQuote?.detail}
                        </span>
                      )}
                      {selectedQuote?.needsAgency && agencyCode && (
                        <span className="block text-xs text-fg-muted">
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
                      <span className="block text-xs text-fg-muted">
                        {name} {lastName} · {phone}
                      </span>
                    </span>
                  </div>
                )}
                {settings.customerNoteEnabled && (
                  <div className="flex items-start gap-2.5">
                    <MessageSquare className="mt-0.5 h-4 w-4 opacity-50" />
                    {showNotes ? (
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        maxLength={500}
                        rows={2}
                        placeholder={settings.customerNoteLabel}
                        className="flex-1 rounded-md border border-black/15 bg-white p-2 text-sm text-black"
                      />
                    ) : (
                      <>
                        <span className="flex-1 opacity-70">{notes || settings.customerNoteLabel}</span>
                        <button onClick={() => setShowNotes(true)} className="text-xs underline opacity-70">
                          {notes ? 'Editar' : 'Agregar'}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <h2 className="flex items-center gap-2 text-lg font-bold">
                <CreditCard className="h-5 w-5" /> Medio de pago
              </h2>

              {payway && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMethod('mp')}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                      method === 'mp' ? 'border-black bg-black text-white' : 'border-black/20'
                    }`}
                  >
                    Mercado Pago
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod('payway')}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                      method === 'payway' ? 'border-black bg-black text-white' : 'border-black/20'
                    }`}
                  >
                    Tarjeta de crédito o débito
                  </button>
                </div>
              )}

              {blocked ? (
                // Ningún medio de pago mientras haya algo que no se puede vender:
                // el cobro fallaría igual, pero después de pedir la tarjeta.
                <p className="text-sm text-red-700">
                  Quitá los productos marcados en el resumen para poder pagar.
                </p>
              ) : payway && method === 'payway' ? (
                <PaywayCardForm
                  config={payway}
                  amountLabel={formatMoney(total, currency)}
                  paying={paying}
                  onToken={onPaywayToken}
                />
              ) : mode === 'API' && pubKey ? (
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
            <div key={l.variantId} className="py-1.5">
              <div className="flex items-center gap-3">
                {l.image && <img src={l.image} alt="" className="h-12 w-12 rounded-md object-cover" />}
                <span className="flex-1">
                  {l.productName}
                  {l.variantLabel && l.variantLabel !== 'Única' ? ` · ${l.variantLabel}` : ''} × {l.quantity}
                </span>
                <span className="tabular-nums">{formatMoney(l.priceAmount * l.quantity, l.currency)}</span>
              </div>
              {issues[l.variantId] && (
                <div className="flex items-start justify-between gap-2">
                  <LineIssueText issue={issues[l.variantId]} />
                  <button
                    type="button"
                    onClick={() => remove(l.variantId)}
                    className="mt-1 shrink-0 text-xs font-semibold text-red-600 underline"
                  >
                    Quitar
                  </button>
                </div>
              )}
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
            {hasShipping && (
              <div className="flex justify-between">
                <span className="opacity-70">
                  Costo de envío
                  {coupon?.freeShipping && quotedShipping > 0 ? ` (gratis con ${coupon.code})` : ''}
                </span>
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
                  onClick={() => applyCoupon()}
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
      <span className={`text-xs ${state === 'current' ? 'font-semibold' : 'text-fg-muted'}`}>{label}</span>
    </span>
  );
  if (href) return <a href={href}>{body}</a>;
  if (onClick) return <button onClick={onClick}>{body}</button>;
  return body;
}
