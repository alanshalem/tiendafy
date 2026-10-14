'use client';

import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes } from 'react';
import Image from 'next/image';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import {
  Banknote,
  Check,
  ChevronDown,
  CreditCard,
  Landmark,
  MapPin,
  Mail,
  MessageCircle,
  MessageSquare,
  Store,
  Tag,
  Truck,
  Loader2,
} from 'lucide-react';
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
import { finishPurchase, readBuyer, writeBuyer } from '@/lib/cart-storage';
import { hardNavigate } from '@/lib/navigation';
import { validateCoupon as validateCouponApi } from '@/lib/coupons';
import { INPUT_LIGHT_10, INPUT_LIGHT_11 } from './styles';
import { CheckoutSkeleton } from './CheckoutSkeleton';
import { useAuth } from './auth';
import type { StoreOffers } from '@/lib/store-offers';
import { defaultAddress, fetchSavedAddresses } from '@/lib/addresses';
import { PriceWithoutTaxes } from './StoreLegalInfo';

interface ShippingOption {
  id: string;
  name: string;
  kind: 'DELIVERY' | 'PICKUP';
  price: MoneyDto;
  description: string | null;
  pickupAddress: string | null;
  /** "Gratis desde $X": con ese subtotal de productos, el envío no se cobra. */
  freeAbove?: MoneyDto | null;
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
/** Cómo paga: las pasarelas, o a mano (transferencia, efectivo al retirar). */
type PayMethod = 'mp' | 'payway' | 'transfer' | 'cash';

const METHOD_LABEL: Record<PayMethod, string> = {
  mp: 'Mercado Pago',
  payway: 'Tarjeta de crédito o débito',
  transfer: 'Transferencia',
  cash: 'Efectivo al retirar',
};

/** Lo que el comprador ve si la tienda todavía no cobra online: por dónde escribirle. */
export interface CheckoutContact {
  whatsapp?: string | null;
  email?: string | null;
}

// Tope de espera de cada pedido a la API: un servidor que no contesta no puede
// dejar al comprador mirando un spinner para siempre.
const FETCH_TIMEOUT_MS = 10_000;

/** Lo que escribe el comprador en el paso de entrega. */
interface Buyer {
  email: string;
  name: string;
  lastName: string;
  phone: string;
  doc: string;
  street: string;
  streetNumber: string;
  apartment: string;
  city: string;
  zip: string;
}
type BuyerField = keyof Buyer;

const EMPTY_BUYER: Buyer = {
  email: '',
  name: '',
  lastName: '',
  phone: '',
  doc: '',
  street: '',
  streetNumber: '',
  apartment: '',
  city: '',
  zip: '',
};

/** El orden de la pantalla: el foco va al primero que esté mal. */
const FIELD_ORDER: BuyerField[] = [
  'email',
  'name',
  'lastName',
  'phone',
  'doc',
  'street',
  'streetNumber',
  'apartment',
  'city',
  'zip',
];

/** GET a la API con tope de espera; tira si no responde bien (no es lo mismo que "no configurado"). */
async function getJson<T>(path: string, tenantId: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: tenantHeaders(tenantId),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

export function CheckoutClient({ tenantId, contact }: { tenantId: string; contact?: CheckoutContact }) {
  // El carrito es el de la tienda (el mismo del ícono): así lo que se reprecia
  // o se quita acá se ve en todos lados.
  const { lines, hydrated, refreshPrices, priceChanges, issues, blocked, remove, setOpen } = useCart();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode | null>(null);
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [payway, setPayway] = useState<PaywayPublicConfig | null>(null);
  // Con más de un medio disponible, el comprador elige.
  const [method, setMethod] = useState<PayMethod>('mp');
  const [connected, setConnected] = useState(true);
  // Descuento por transferencia, efectivo al retirar, cuotas y envío gratis
  // (ver lib/store-offers). Sin respuesta, no se ofrece pagar a mano.
  const [offers, setOffers] = useState<StoreOffers | null>(null);
  // El resumen plegado del celular (como en Shopify): arriba, con el total.
  const [summaryOpen, setSummaryOpen] = useState(false);

  const [step, setStep] = useState<Step>('entrega');

  // Paso Entrega
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

  // Datos del comprador (nunca los de la tarjeta). Se guardan en la pestaña a
  // cada tecla: una recarga o volver de un rechazo de Mercado Pago no obliga a
  // escribir todo de nuevo. Se borran cuando la compra sale bien.
  const [buyer, setBuyer] = useState<Buyer>(EMPTY_BUYER);
  const buyerRef = useRef<Buyer>(EMPTY_BUYER);
  // Un error por campo (al lado del campo) y uno general arriba del botón.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<BuyerField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const setField = (key: BuyerField, value: string) => {
    const next = { ...buyerRef.current, [key]: value };
    buyerRef.current = next;
    setBuyer(next);
    writeBuyer(tenantId, next);
    // Corregido el campo, su error se va (el resto queda hasta reintentar).
    if (fieldErrors[key])
      setFieldErrors((prev) => {
        const rest = { ...prev };
        delete rest[key];
        return rest;
      });
  };
  const { email, name, lastName, phone, doc, street, streetNumber, apartment, city, zip } = buyer;
  const formId = useId();
  const fieldId = (key: BuyerField) => `${formId}-${key}`;
  // Fallo al cargar lo que el checkout necesita (no "no está configurado").
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

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
    // Lo que el comprador ya había escrito en esta pestaña (ver setField).
    const saved = readBuyer<Buyer>(tenantId);
    if (saved) {
      buyerRef.current = { ...EMPTY_BUYER, ...saved };
      setBuyer(buyerRef.current);
    }
  }, [tenantId]);

  // Comprador con sesión: arranca con su email de la cuenta y su dirección
  // guardada (la predeterminada, de Mi cuenta). Solo completa lo que está
  // vacío: lo que ya escribió en esta pestaña (o trajo de un intento anterior)
  // manda.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!user || prefilled.current) return;
    prefilled.current = true;
    const [first = '', ...rest] = user.name.trim().split(/\s+/);
    const fill = (found: Partial<Buyer>) => {
      const next = { ...buyerRef.current };
      for (const key of FIELD_ORDER) {
        const value = found[key];
        if (value && !next[key].trim()) next[key] = value;
      }
      buyerRef.current = next;
      setBuyer(next);
    };
    fill({ email: user.email, name: first, lastName: rest.join(' ') });
    fetchSavedAddresses(tenantId)
      .then((items) => {
        const a = defaultAddress(items);
        if (!a) return;
        fill({
          name: a.name,
          lastName: a.lastName ?? '',
          phone: a.phone ?? '',
          doc: a.doc ?? '',
          street: a.street,
          streetNumber: a.streetNumber,
          apartment: a.apartment ?? '',
          city: a.city,
          zip: a.zip,
        });
      })
      .catch(() => undefined);
  }, [user, tenantId]);

  // Precio y stock de hoy, antes de mostrar un total: el carrito guarda los
  // de cuando se agregó cada cosa, y el cobro sale por los vigentes.
  const repriced = useRef(false);
  useEffect(() => {
    if (repriced.current || !hydrated || lines.length === 0) return;
    repriced.current = true;
    void refreshPrices();
  }, [hydrated, lines.length, refreshPrices]);

  // Lo que el checkout necesita para dibujarse. Un error de la API NO es lo
  // mismo que "no configurado": antes un 500 de la configuración de pagos
  // decía "esta tienda todavía no tiene los pagos habilitados", y un error de
  // los envíos dejaba pagar sin envío. Ahora un error se dice y se reintenta.
  useEffect(() => {
    let alive = true;
    const fail = () => alive && setLoadError(true);

    getJson<{ connected?: boolean; checkoutMode?: string; publicKey?: string | null }>(
      '/api/v1/payments/mercadopago/public-config',
      tenantId,
    )
      .then((c) => {
        if (!alive) return;
        setConnected(Boolean(c.connected));
        setMode(c.checkoutMode === 'API' ? 'API' : 'PRO');
        setPubKey(c.publicKey ?? null);
        if (c.checkoutMode === 'API' && c.publicKey) initMercadoPago(c.publicKey, { locale: 'es-AR' });
      })
      .catch(fail);

    // Payway se pide aparte: son dos medios de pago independientes y que uno
    // falle no tiene por qué dejar sin cobrar al otro.
    getJson<PaywayPublicConfig>('/api/v1/payments/payway/public-config', tenantId)
      .then((c) => alive && setPayway(c.enabled ? c : null))
      .catch(() => alive && setPayway(null));

    // Lo que la tienda promete (descuento por transferencia, envío gratis): un
    // error acá solo apaga los medios a mano; con tarjeta se sigue pagando.
    getJson<StoreOffers>('/api/v1/store-offers', tenantId)
      .then((o) => alive && setOffers(o))
      .catch(() => alive && setOffers(null));

    // Sin la configuración del comercio se sigue con la de fábrica.
    getJson<CheckoutSettings>('/api/v1/checkout-settings', tenantId)
      .then((d) => alive && setSettings({ ...DEFAULT_SETTINGS, ...d }))
      .catch(() => alive && setSettings(DEFAULT_SETTINGS));

    getJson<Record<string, unknown> & { items?: ShippingOption[] }>('/api/v1/shipping/methods', tenantId)
      .then((d) => {
        if (!alive) return;
        setShippingOptions(d.items ?? []);
        setCarriers(enabledCarriers(d));
      })
      .catch(fail);

    return () => {
      alive = false;
    };
  }, [tenantId, attempt]);

  const retryLoad = () => {
    setLoadError(false);
    setMode(null);
    setShippingOptions(null);
    setAttempt((a) => a + 1);
  };

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.priceAmount * l.quantity, 0), [lines]);
  const currency = lines[0]?.currency ?? 'ARS';
  const discount = coupon?.discount ?? 0;
  const selected = shippingOptions?.find((o) => o.id === shippingId) ?? null;
  // Opciones cotizadas, con id "<correo>-<i>" para el radio.
  const quoteOptions = CARRIER_KEYS.flatMap((k) =>
    (quotes[k] ?? []).map((option, i) => ({ id: `${k}-${i}`, option })),
  );
  const selectedQuote = quoteOptions.find((q) => q.id === shippingId)?.option ?? null;
  // "Gratis desde $X" de un medio propio: lo aplica el servidor con el
  // subtotal de productos (antes de cupones), y acá se muestra lo mismo.
  const freeByAmount = (o: ShippingOption) => Boolean(o.freeAbove && subtotal >= o.freeAbove.amount);
  const methodPrice = (o: ShippingOption) => (freeByAmount(o) ? 0 : o.price.amount);
  const quotedShipping = selectedQuote?.price.amount ?? (selected ? methodPrice(selected) : 0); // centavos (ApiJson.MoneyJson)
  // Cupón de envío gratis: el servidor pone el envío en cero al crear la orden,
  // así que lo que se muestra acá tiene que decir lo mismo.
  const shipCost = coupon?.freeShipping ? 0 : quotedShipping;

  // Medios de pago de esta compra. El efectivo, solo retirando en el local.
  const pickupSelected = selected?.kind === 'PICKUP';
  const available: PayMethod[] = [
    ...(connected ? (['mp'] as const) : []),
    ...(payway ? (['payway'] as const) : []),
    ...(offers?.transfer.enabled ? (['transfer'] as const) : []),
    ...(offers?.cashOnPickup.enabled && pickupSelected ? (['cash'] as const) : []),
  ];
  const payMethod: PayMethod | null = available.includes(method) ? method : (available[0] ?? null);
  const offline = payMethod === 'transfer' || payMethod === 'cash';
  // ¿Se puede comprar de alguna forma? El efectivo cuenta aunque todavía no
  // se haya elegido retirar: es elegir el retiro y listo.
  const canPay = connected || Boolean(payway) || Boolean(offers?.canCheckout);

  // El mismo orden que el servidor (Order.UseOfflinePayment): cupón sobre el
  // subtotal, el % de la transferencia sobre lo que queda, y el envío entero.
  const afterCoupon = Math.max(0, subtotal - discount);
  const offlinePct = offline ? (offers?.transfer.discountPercent ?? 0) : 0;
  const offlineDiscount = Math.round((afterCoupon * offlinePct) / 100);
  const total = afterCoupon - offlineDiscount + shipCost;
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
    // El código postal y la ciudad de la cotización completan la dirección.
    if (!buyerRef.current.zip.trim()) setField('zip', cp);
    if (quoteCity.trim() && !buyerRef.current.city.trim()) setField('city', quoteCity.trim());
    setQuoting(false);
  };

  const loadAgencies = async (prov: string) => {
    setAgencies(null);
    setAgencyCode(null);
    try {
      const data = await getJson<{ items?: CorreoAgency[] }>(
        `/api/v1/shipping/correo/agencies?province=${encodeURIComponent(prov)}`,
        tenantId,
      );
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

  /** Lo que falta o está mal en cada campo (vacío = todo bien). */
  const validateFields = (): Partial<Record<BuyerField, string>> => {
    const errors: Partial<Record<BuyerField, string>> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Ingresá un email válido.';
    if (!name.trim()) errors.name = 'Completá tu nombre.';
    if (!lastName.trim()) errors.lastName = 'Completá tu apellido.';
    if (settings.requirePhone && !phone.trim()) errors.phone = 'Completá tu teléfono.';
    if (settings.requireDocument && !doc.trim()) errors.doc = 'Completá tu DNI o CUIT para poder facturarte.';
    if (needsAddress) {
      if (!street.trim()) errors.street = 'Completá la calle.';
      if (!streetNumber.trim()) errors.streetNumber = 'Completá el número.';
      if (!city.trim()) errors.city = 'Completá la ciudad.';
      if (!zip.trim()) errors.zip = 'Completá el código postal.';
    }
    return errors;
  };

  /** Lo que falta elegir del envío, si algo. */
  const shippingProblem = (): string | null => {
    // Si la tienda envía (métodos propios o correos que cotizan), hay que elegir
    // cómo. Antes solo contaban las opciones ya cotizadas: con solo correos y
    // sin tocar "Calcular" se podía pagar sin envío.
    if (!hasShipping && carriers.length > 0 && quoteOptions.length === 0 && !shippingOptions?.length)
      return 'Ingresá tu código postal y tocá «Calcular» para elegir el envío.';
    if (!hasShipping && ((shippingOptions?.length ?? 0) > 0 || carriers.length > 0))
      return 'Elegí cómo querés recibir tu compra.';
    if (selectedQuote?.needsAgency && !agencyCode) return 'Elegí la sucursal de Correo donde querés retirar.';
    return null;
  };

  const continueToPago = () => {
    const errors = validateFields();
    const shipping = shippingProblem();
    setFieldErrors(errors);
    const first = FIELD_ORDER.find((k) => errors[k]);
    if (shipping || first) {
      setFormError(shipping ?? 'Revisá los datos marcados.');
      // El foco va adonde hay que corregir: al primer campo mal o al envío.
      if (first) document.getElementById(fieldId(first))?.focus();
      else document.getElementById(`${formId}-shipping`)?.focus();
      return;
    }
    setFormError(null);
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
    path: 'pay' | 'pay-onsite' | 'pay-payway' | 'pay-offline',
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

  /**
   * Transferencia o efectivo: la orden queda hecha y pendiente de pago, con el
   * descuento que calcula el servidor. El carrito se vacía (lo comprado ya
   * está reservado en la orden) y la pantalla de "pendiente" muestra los datos
   * para pagar, que también salen por email.
   */
  const payOffline = async (kind: 'transfer' | 'cash') => {
    setPaying(true);
    setError(null);
    try {
      const id = await reserve(email.trim());
      const data = await postPayment<{ orderId?: string }>(
        id,
        'pay-offline',
        { method: kind },
        'No pudimos registrar tu pedido.',
      );
      const orderId = data.orderId ?? id;
      stashPurchase(orderId);
      setLeaving(true);
      finishPurchase(tenantId, orderId);
      hardNavigate(`/checkout/pending?order=${encodeURIComponent(orderId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos registrar tu pedido.');
      setPaying(false);
    }
  };

  if (result) return <CheckoutResult tenantId={tenantId} kind={result} />;

  if (loadError && !leaving)
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="mb-2 text-xl font-bold">Finalizar compra</h1>
        <p role="alert" className="opacity-80">
          No pudimos cargar el checkout. Revisá tu conexión y probá de nuevo.
        </p>
        <button
          type="button"
          onClick={retryLoad}
          className="mt-4 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg"
        >
          Reintentar
        </button>
      </main>
    );

  // Mismas medidas que el checkout (ver CheckoutSkeleton): al llegar no salta.
  if (leaving || !hydrated || mode === null || shippingOptions === null) return <CheckoutSkeleton />;

  if (lines.length === 0)
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="mb-2 text-xl font-bold">Finalizar compra</h1>
        <p className="opacity-70">Tu carrito está vacío.</p>
        <a href="/" className="mt-4 inline-block text-primary-ink underline">
          Volver a la tienda
        </a>
      </main>
    );

  if (!canPay) {
    // Sin ningún medio de pago no hay compra online, pero sí venta: lo que
    // queda es escribirle a la tienda, con el carrito ya contado.
    const order = lines.map((l) => `${l.quantity} × ${l.productName}`).join(', ');
    const whatsapp = contact?.whatsapp?.replace(/\D/g, '');
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="mb-2 text-xl font-bold">Comprá escribiéndonos</h1>
        <p className="opacity-70">Esta tienda todavía no tiene los pagos habilitados.</p>
        <p className="mt-1 text-sm text-fg-muted">Mandanos tu pedido y coordinamos el pago y la entrega.</p>
        <div className="mt-5 flex flex-col items-center gap-2">
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`¡Hola! Quiero comprar: ${order}.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg"
            >
              <MessageCircle className="h-4 w-4" /> Comprar por WhatsApp
            </a>
          )}
          {contact?.email && (
            <a
              href={`mailto:${contact.email}?subject=${encodeURIComponent('Quiero comprar')}&body=${encodeURIComponent(order)}`}
              className="text-sm text-primary-ink underline"
            >
              Escribir a {contact.email}
            </a>
          )}
          <a href="/contacto" className="text-sm text-primary-ink underline">
            Ir a Contacto
          </a>
          <a href="/" className="text-sm text-fg-muted underline">
            Volver
          </a>
        </div>
      </main>
    );
  }

  const inputCls = `${INPUT_LIGHT_11} focus:outline-none focus:ring-2 focus:ring-primary/40`;

  /**
   * Un campo del comprador con su etiqueta visible (el placeholder no es una
   * etiqueta: desaparece al escribir y muchos lectores no lo leen) y su error
   * al lado, atado al campo. Mismo patrón que el formulario de Payway.
   */
  const textField = (
    key: BuyerField,
    label: string,
    extra: InputHTMLAttributes<HTMLInputElement> = {},
    className = '',
    hint?: string,
  ) => {
    const id = fieldId(key);
    const err = fieldErrors[key];
    const describedBy = [err ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ');
    return (
      <div className={className}>
        <label htmlFor={id} className="mb-1 block text-sm font-medium">
          {label}
        </label>
        <input
          id={id}
          name={key}
          value={buyer[key]}
          onChange={(e) => setField(key, e.target.value)}
          enterKeyHint="next"
          aria-invalid={err ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`${inputCls} ${err ? 'border-danger' : ''}`}
          {...extra}
        />
        {hint && !err && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-fg-muted">
            {hint}
          </p>
        )}
        {err && (
          <p id={`${id}-error`} className="mt-1 text-xs text-danger">
            {err}
          </p>
        )}
      </div>
    );
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="sr-only">Finalizar compra</h1>
      {/* Indicador de pasos: Carrito → Entrega → Pago. "Carrito" abre el
          carrito acá mismo (antes llevaba a la portada y se perdía el paso). */}
      <div className="mx-auto mb-8 flex max-w-md items-center">
        <StepDot label="Carrito" state="done" onClick={() => setOpen(true)} />
        <div className="h-px flex-1 bg-fg/20" />
        <StepDot
          label="Entrega"
          state={step === 'entrega' ? 'current' : 'done'}
          onClick={step === 'pago' ? () => setStep('entrega') : undefined}
        />
        <div className="h-px flex-1 bg-fg/20" />
        <StepDot label="Pago" state={step === 'pago' ? 'current' : 'todo'} />
      </div>

      <PriceChangeNotice changes={priceChanges} className="mx-auto mb-6 max-w-5xl text-sm" />
      {blocked && (
        <p role="alert" className="mb-6 rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
          Algunos productos de tu carrito ya no están disponibles como los agregaste. Revisalos en el resumen
          para poder pagar.
        </p>
      )}

      {/* Celular: el resumen va arriba y plegado, con el total a la vista (como
          Shopify). Antes quedaba debajo de todo el formulario y el comprador
          llenaba sus datos sin ver cuánto iba a pagar. */}
      <button
        type="button"
        onClick={() => setSummaryOpen((o) => !o)}
        aria-expanded={summaryOpen}
        aria-controls={`${formId}-summary`}
        className="mb-4 flex h-12 w-full items-center justify-between rounded-lg border border-fg/10 px-4 text-sm lg:hidden"
      >
        <span className="inline-flex items-center gap-1.5 font-medium">
          {summaryOpen ? 'Ocultar resumen' : 'Ver resumen'}
          <ChevronDown className={`h-4 w-4 transition-transform ${summaryOpen ? 'rotate-180' : ''}`} />
        </span>
        <span className="font-bold tabular-nums">{formatMoney(total, currency)}</span>
      </button>

      <div className={settings.singleColumn ? 'grid gap-8' : 'grid gap-8 lg:grid-cols-[1fr_360px]'}>
        <div>
          {step === 'entrega' ? (
            // Un <form> de verdad: Enter en el teclado del celular avanza el paso.
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                continueToPago();
              }}
              className="space-y-7"
            >
              <section>
                <h2 className="mb-3 text-lg font-bold">Datos de contacto</h2>
                {textField('email', 'E-mail', {
                  type: 'email',
                  autoComplete: 'email',
                  inputMode: 'email',
                  autoCapitalize: 'none',
                  spellCheck: false,
                })}
              </section>

              {/* El foco viene acá si falta elegir el envío. */}
              <div id={`${formId}-shipping`} tabIndex={-1} className="space-y-7 outline-none">
                {shippingOptions.length > 0 && (
                  <section>
                    <h2 className="mb-3 text-lg font-bold">Entrega</h2>
                    <div className="space-y-2">
                      {shippingOptions.map((o) => (
                        <label
                          key={o.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 text-sm transition ${shippingId === o.id ? 'border-primary bg-primary/[0.04] ring-1 ring-primary' : 'border-fg/15 hover:border-fg/30'}`}
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
                            {o.freeAbove && (
                              <span className="mt-0.5 block text-xs text-success">
                                {freeByAmount(o)
                                  ? `Sin cargo: tu compra supera ${formatMoney(o.freeAbove.amount, o.freeAbove.currency)}`
                                  : `Sin cargo desde ${formatMoney(o.freeAbove.amount, o.freeAbove.currency)}`}
                              </span>
                            )}
                          </span>
                          <span className="font-semibold">
                            {methodPrice(o) === 0 ? 'Gratis' : formatMoney(o.price.amount, o.price.currency)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </section>
                )}

                {carriers.length > 0 && (
                  <section>
                    {shippingOptions.length === 0 && <h2 className="mb-3 text-lg font-bold">Entrega</h2>}
                    <div className="rounded-lg border border-fg/15 p-3.5">
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
                            {/* Una lista y no texto libre: "Bs As", "Pcia de BA" o un
                                error de tipeo hacían que el correo no encontrara el destino. */}
                            <select
                              value={quoteProvince}
                              onChange={(e) => setQuoteProvince(e.target.value)}
                              autoComplete="address-level1"
                              aria-label="Provincia para cotizar"
                              className={`${inputCls} max-w-[200px] appearance-none`}
                            >
                              <option value="">Provincia</option>
                              {CORREO_PROVINCES.map(([code, label]) => (
                                <option key={code} value={label}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={quoteShipping}
                          disabled={quoting}
                          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-fg/30 px-4 text-sm font-semibold disabled:opacity-60"
                        >
                          {quoting && <Loader2 className="h-4 w-4 animate-spin" />} Calcular
                        </button>
                      </div>
                      {(['cp', ...CARRIER_KEYS] as const).map(
                        (k) =>
                          quoteErrors[k] && (
                            <p key={k} className="mt-2 text-xs text-danger">
                              {quoteErrors[k]}
                            </p>
                          ),
                      )}

                      {quoteOptions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {quoteOptions.map(({ id, option: o }) => (
                            <label
                              key={id}
                              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${shippingId === id ? 'border-primary bg-primary/[0.04] ring-1 ring-primary' : 'border-fg/15 hover:border-fg/30'}`}
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
                            <div className="rounded-lg border border-fg/10 bg-fg/[0.02] p-3">
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
                                <p className="mt-1.5 text-xs text-danger">
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
              </div>

              <section>
                <h2 className="mb-3 text-lg font-bold">
                  {needsAddress ? 'Datos del destinatario' : 'Tus datos'}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {textField('name', 'Nombre', { autoComplete: 'given-name', autoCapitalize: 'words' })}
                  {textField('lastName', 'Apellido', {
                    autoComplete: 'family-name',
                    autoCapitalize: 'words',
                  })}
                  {textField(
                    'phone',
                    settings.requirePhone ? 'Teléfono' : 'Teléfono (opcional)',
                    { type: 'tel', inputMode: 'tel', autoComplete: 'tel' },
                    '',
                    'Con código de área, sin 0 ni 15. Ej.: 11 2345 6789',
                  )}
                  {textField(
                    'doc',
                    settings.requireDocument ? 'DNI o CUIT (facturación)' : 'DNI o CUIT (opcional)',
                    { inputMode: 'numeric', autoComplete: 'off' },
                  )}
                </div>
                {needsAddress && (
                  <div className="mt-3 grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                      {textField('street', 'Calle', { autoComplete: 'address-line1' })}
                      {/* El número va aparte (lo pide el correo); el autocompletado
                          del navegador lo trae junto con la calle. */}
                      {textField('streetNumber', 'Número', { inputMode: 'numeric', autoComplete: 'off' })}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {textField('apartment', 'Departamento (opcional)', { autoComplete: 'address-line2' })}
                      {textField('city', 'Ciudad', { autoComplete: 'address-level2' })}
                    </div>
                    {textField(
                      'zip',
                      'Código Postal',
                      { inputMode: 'numeric', autoComplete: 'postal-code', enterKeyHint: 'go' },
                      'sm:max-w-[200px]',
                    )}
                  </div>
                )}
              </section>

              {formError && (
                <p role="alert" className="text-sm font-medium text-danger">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={blocked}
                className="w-full rounded-md bg-primary py-3.5 text-sm font-semibold text-primary-fg disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-xs"
              >
                Continuar para el pago
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              {/* Resumen de lo elegido, con Cambiar */}
              <div className="space-y-3 rounded-lg border border-fg/10 p-4 text-sm">
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
                        aria-label={settings.customerNoteLabel}
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

              {available.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {available.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      aria-pressed={payMethod === m}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium ${
                        payMethod === m ? 'border-primary bg-primary text-primary-fg' : 'border-fg/20'
                      }`}
                    >
                      {METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              )}
              {/* El descuento se anuncia en el botón que lo da: el comprador ve
                  cuánto ahorra antes de elegir, no después. */}
              {available.length > 1 && (offers?.transfer.discountPercent ?? 0) > 0 && (
                <p className="text-xs text-success">
                  {offers!.transfer.discountPercent}% de descuento pagando con{' '}
                  {available.includes('cash') ? 'transferencia o en efectivo' : 'transferencia'}.
                </p>
              )}

              {blocked ? (
                // Ningún medio de pago mientras haya algo que no se puede vender:
                // el cobro fallaría igual, pero después de pedir la tarjeta.
                <p className="text-sm text-danger">
                  Quitá los productos marcados en el resumen para poder pagar.
                </p>
              ) : offline ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 rounded-lg border border-fg/10 p-4 text-sm">
                    {payMethod === 'cash' ? (
                      <Banknote className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                    ) : (
                      <Landmark className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                    )}
                    <p>
                      {payMethod === 'cash'
                        ? `Pagás ${formatMoney(total, currency)} en efectivo cuando retirás.`
                        : `Al confirmar te mostramos los datos de la cuenta para transferir ${formatMoney(total, currency)}. También te los mandamos por email.`}{' '}
                      Te guardamos los productos {offers?.transfer.holdHours ?? 48} horas; si para entonces no
                      registramos el pago, el pedido se cancela solo.
                    </p>
                  </div>
                  <button
                    onClick={() => payOffline(payMethod === 'cash' ? 'cash' : 'transfer')}
                    disabled={paying}
                    className="w-full rounded-md bg-primary py-3.5 text-sm font-semibold text-primary-fg disabled:opacity-60 sm:max-w-xs"
                  >
                    {paying ? 'Registrando tu pedido…' : 'Confirmar pedido'}
                  </button>
                </div>
              ) : payway && payMethod === 'payway' ? (
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

              {/* Qué se puede usar en Mercado Pago: sin esto, quien no tiene
                  cuenta cree que no puede pagar ahí. */}
              {!blocked && payMethod === 'mp' && (
                <p className="text-xs text-fg-muted">
                  Con Mercado Pago pagás con tarjeta de crédito (en cuotas), débito, dinero en tu cuenta o en
                  efectivo en Rapipago y Pago Fácil. No hace falta tener cuenta.
                </p>
              )}

              {error && <p className="text-sm text-danger">{error}</p>}

              <p className="text-xs text-fg-muted">
                Al comprar aceptás los{' '}
                <a href="/terminos" className="underline">
                  Términos y condiciones
                </a>
                . Tenés 10 días para arrepentirte de la compra con el{' '}
                <a href="/arrepentimiento" className="underline">
                  Botón de arrepentimiento
                </a>
                .
              </p>
            </div>
          )}
        </div>

        {/* Resumen del pedido. En el celular va arriba del formulario y se
            abre con la barra "Ver resumen"; en la compu, al costado siempre. */}
        <aside
          id={`${formId}-summary`}
          aria-label="Resumen del pedido"
          className={`order-first h-fit rounded-lg border border-fg/10 p-4 text-sm lg:sticky lg:top-6 lg:order-none lg:block ${
            summaryOpen ? 'block' : 'hidden'
          }`}
        >
          {lines.map((l) => (
            <div key={l.variantId} className="py-1.5">
              <div className="flex items-center gap-3">
                {l.image && (
                  <Image
                    src={l.image}
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-md object-cover"
                  />
                )}
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
                    className="mt-1 shrink-0 text-xs font-semibold text-danger underline"
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>
          ))}
          <div className="mt-3 space-y-1 border-t border-fg/10 pt-3">
            <div className="flex justify-between">
              <span className="opacity-70">Subtotal</span>
              <span className="tabular-nums">{formatMoney(subtotal, currency)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-success">
                <span>Descuento ({coupon?.code})</span>
                <span className="tabular-nums">- {formatMoney(discount, currency)}</span>
              </div>
            )}
            {offlineDiscount > 0 && (
              <div className="flex justify-between text-success">
                <span>
                  Descuento por {payMethod === 'cash' ? 'pago en efectivo' : 'transferencia'} ({offlinePct}%)
                </span>
                <span className="tabular-nums">- {formatMoney(offlineDiscount, currency)}</span>
              </div>
            )}
            {hasShipping && (
              <div className="flex justify-between">
                <span className="opacity-70">
                  Costo de envío
                  {coupon?.freeShipping && quotedShipping > 0 ? ` (gratis con ${coupon.code})` : ''}
                  {!coupon?.freeShipping && selected && !selectedQuote && freeByAmount(selected)
                    ? ' (sin cargo por el monto)'
                    : ''}
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
            <PriceWithoutTaxes amount={total} currency={currency} className="text-right" />
          </div>

          {!coupon && (
            <div className="mt-4">
              <div className="flex gap-2">
                <input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Cupón de descuento"
                  aria-label="Cupón de descuento"
                  className={INPUT_LIGHT_10}
                />
                <button
                  onClick={() => applyCoupon()}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-fg/30 px-3 text-sm font-semibold"
                >
                  <Tag className="h-4 w-4" /> Aplicar
                </button>
              </div>
              {couponError && <p className="mt-1 text-xs text-danger">{couponError}</p>}
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
  onClick,
}: {
  label: string;
  state: 'done' | 'current' | 'todo';
  onClick?: () => void;
}) {
  // Colores del tema: con negro fijo, en una tienda de fondo oscuro los
  // círculos y las líneas desaparecían.
  const dot = (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs ${
        state === 'current'
          ? 'border-primary bg-primary text-primary-fg'
          : state === 'done'
            ? 'border-fg/50 text-fg/80'
            : 'border-fg/25 text-fg/40'
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
  if (onClick) return <button onClick={onClick}>{body}</button>;
  return body;
}
