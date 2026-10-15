'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Store, Truck } from 'lucide-react';
import { formatMoney, type MoneyDto } from '@tiendafy/types';
import { clientJsonTenant } from '@/lib/api-client';
import { isPostalCode, normalizePostalCode, readPostalCode, savePostalCode } from '@/lib/postal-code';
import { CARRIERS, enabledCarriers, requestCarrierQuote, type CarrierKey } from './checkout-carriers';
import { useCart } from './cart-context';
import { INPUT_10 } from './styles';

/** Un medio propio de la tienda, como lo devuelve /shipping/methods. */
interface OwnMethod {
  id: string;
  name: string;
  kind: 'DELIVERY' | 'PICKUP';
  price: MoneyDto;
  description: string | null;
  pickupAddress: string | null;
}

/** Una opción de envío para mostrar: propia o cotizada por un correo. */
export interface EstimateOption {
  key: string;
  name: string;
  price: MoneyDto;
  /** Plazo de entrega (cuando el correo lo da) u otra aclaración. */
  detail: string | null;
}

interface Methods {
  pickups: OwnMethod[];
  deliveries: OwnMethod[];
  carriers: CarrierKey[];
}

const FETCH_TIMEOUT_MS = 12_000;

/** Dónde averiguar el código postal (el buscador oficial del Correo). */
const CP_FINDER = 'https://www.correoargentino.com.ar/formularios/cpa';

/**
 * "Calcular envío" en la ficha: el comprador pone su código postal y ve cuánto
 * le sale y cuándo le llega, ANTES de ir al checkout. Antes recién lo veía en
 * el primer paso del pago, y el costo del envío es la razón más común para
 * abandonar ahí.
 *
 * Cotiza con lo mismo que el checkout (los correos de checkout-carriers y los
 * medios propios de la tienda), para la variante y la cantidad elegidas. El
 * código postal queda guardado y se reusa en las otras fichas y en el pago.
 * Si un correo no cotiza (sin credenciales, sin tarifa para ese destino), se
 * muestra lo que sí hay; si no hay nada, se dice sin asustar: en el checkout
 * igual se ven todas las opciones.
 */
export function ShippingEstimate({
  variantId,
  quantity,
  unitPrice,
}: {
  variantId: string;
  quantity: number;
  /** Precio unitario en centavos: es el valor declarado del paquete. */
  unitPrice: number;
}) {
  const { tenantId } = useCart();
  const inputId = useId();
  const [methods, setMethods] = useState<Methods | null>(null);
  const [cp, setCp] = useState('');
  const [quotedFor, setQuotedFor] = useState<string | null>(null);
  const [options, setOptions] = useState<EstimateOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const run = useRef(0);

  useEffect(() => {
    let alive = true;
    clientJsonTenant<Record<string, unknown> & { items?: OwnMethod[] }>(
      '/api/v1/shipping/methods',
      tenantId,
    ).then((d) => {
      if (!alive || !d) return;
      const items = d.items ?? [];
      setMethods({
        pickups: items.filter((m) => m.kind === 'PICKUP'),
        deliveries: items.filter((m) => m.kind === 'DELIVERY'),
        carriers: enabledCarriers(d),
      });
    });
    setCp(readPostalCode(tenantId));
    return () => {
      alive = false;
    };
  }, [tenantId]);

  const quote = useCallback(
    async (postalCode: string) => {
      if (!methods) return;
      const ticket = ++run.current;
      setLoading(true);
      setError(null);
      setFailed(false);
      savePostalCode(tenantId, postalCode);

      // Los correos que resuelven por localidad (Zipnova) necesitan ciudad y
      // provincia: eso se pide recién en el checkout.
      const ready = methods.carriers.filter((k) => !CARRIERS[k].needsCityProvince);
      const input = {
        postalCode,
        city: '',
        province: '',
        units: quantity,
        items: [{ variantId, quantity }],
        declaredValue: (unitPrice * quantity) / 100,
      };
      const quoted = await Promise.all(
        ready.map(async (k): Promise<EstimateOption[] | null> => {
          const carrier = CARRIERS[k];
          try {
            const { ok, data } = await requestCarrierQuote(k, tenantId, input, FETCH_TIMEOUT_MS);
            if (!ok) return null;
            return (data?.options ?? []).map((raw, i) => {
              const o = carrier.toOption(raw);
              return { key: `${k}-${i}`, name: o.name, price: o.price, detail: o.detail };
            });
          } catch {
            // Sin red o sin respuesta a tiempo: ese correo no suma, los demás sí.
            return null;
          }
        }),
      );
      if (ticket !== run.current) return; // llegó una cotización más nueva

      const own = methods.deliveries.map((m) => ({
        key: m.id,
        name: m.name,
        price: m.price,
        detail: m.description,
      }));
      const all = [...own, ...quoted.flatMap((q) => q ?? [])].sort((a, b) => a.price.amount - b.price.amount);
      setOptions(all);
      setFailed(all.length === 0 && ready.length > 0);
      setQuotedFor(postalCode);
      setLoading(false);
    },
    [methods, quantity, tenantId, unitPrice, variantId],
  );

  // Con un código postal guardado, la ficha ya muestra el envío: es el dato
  // que el comprador vino a buscar. Se recalcula si cambia la variante o la
  // cantidad (otro peso, otro paquete), con una pausa para no cotizar por
  // cada clic en "+".
  useEffect(() => {
    const saved = readPostalCode(tenantId);
    if (!methods || !saved) return;
    const t = setTimeout(() => void quote(saved), 400);
    return () => clearTimeout(t);
  }, [methods, quote, tenantId]);

  if (!methods) return null;
  const hasQuote = methods.carriers.length > 0 || methods.deliveries.length > 0;
  if (!hasQuote && methods.pickups.length === 0) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = normalizePostalCode(cp);
    if (!isPostalCode(value)) {
      setError('Ingresá un código postal de 4 números.');
      return;
    }
    setCp(value);
    void quote(value);
  };

  const zipnovaLater = methods.carriers.includes('zipnova');

  return (
    <section aria-label="Envío" className="rounded-md border border-fg/10 p-3 text-sm">
      {methods.pickups.map((m) => (
        <p key={m.id} className="flex items-start gap-2">
          <Store className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />
          <span>
            {m.price.amount === 0 ? (
              <>
                <span className="font-semibold">Retiro gratis</span> en {m.pickupAddress?.trim() || m.name}
              </>
            ) : (
              <>
                <span className="font-semibold">{m.name}</span>:{' '}
                {formatMoney(m.price.amount, m.price.currency)}
              </>
            )}
          </span>
        </p>
      ))}

      {hasQuote && (
        <div className={methods.pickups.length > 0 ? 'mt-3 border-t border-fg/10 pt-3' : ''}>
          <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
            <label htmlFor={inputId} className="flex items-center gap-2 font-medium">
              <Truck className="h-4 w-4 opacity-70" aria-hidden />
              Calcular envío
            </label>
            <div className="flex gap-2">
              <input
                id={inputId}
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="Tu código postal"
                value={cp}
                onChange={(e) => {
                  setCp(e.target.value.replace(/[^\dA-Za-z]/g, '').slice(0, 8));
                  setError(null);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${inputId}-error` : undefined}
                className={`${INPUT_10} w-36`}
              />
              <button
                type="submit"
                disabled={loading}
                className="h-10 shrink-0 rounded-md border-2 border-primary px-3 text-sm font-semibold text-primary-ink disabled:opacity-60"
              >
                {loading ? 'Calculando…' : 'Calcular'}
              </button>
            </div>
            <a
              href={CP_FINDER}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-fg-muted underline-offset-2 hover:underline"
            >
              No sé mi código postal
            </a>
          </form>
          {error && (
            <p id={`${inputId}-error`} role="alert" className="mt-1.5 text-xs font-medium">
              {error}
            </p>
          )}

          <div aria-live="polite">
            {options && quotedFor && !loading && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs text-fg-muted">Envío a CP {quotedFor}</p>
                {options.length > 0 ? (
                  <ul className="space-y-1.5">
                    {options.map((o) => (
                      <li key={o.key} className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block">{o.name}</span>
                          {o.detail && <span className="block text-xs text-fg-muted">{o.detail}</span>}
                        </span>
                        <span className="shrink-0 font-semibold">
                          {o.price.amount === 0 ? (
                            <span className="inline-flex items-center gap-1">
                              <Check className="h-3.5 w-3.5" aria-hidden /> Gratis
                            </span>
                          ) : (
                            formatMoney(o.price.amount, o.price.currency)
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : failed ? (
                  <p className="text-xs text-fg-muted">
                    No pudimos calcular el envío a ese código postal ahora. En el checkout vas a ver todas las
                    opciones.
                  </p>
                ) : null}
                {zipnovaLater && (
                  <p className="mt-1.5 text-xs text-fg-muted">
                    Más opciones con tu dirección completa en el checkout.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
