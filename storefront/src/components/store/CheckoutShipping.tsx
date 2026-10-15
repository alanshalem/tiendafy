import { Loader2, Store, Truck } from 'lucide-react';
import { formatMoney, type MoneyDto } from '@tiendafy/types';
import { freeByAmount, methodPrice } from '@/lib/checkout-totals';
import { CARRIER_KEYS, CARRIERS, quoteHint, type CarrierKey, type QuotedOption } from './checkout-carriers';

/*
 * El envío del paso "Entrega" del checkout: los medios propios de la tienda y
 * los correos que cotizan en vivo. Solo dibujan: el estado (qué se eligió, lo
 * cotizado, las sucursales) vive en CheckoutClient.
 */

export interface ShippingOption {
  id: string;
  name: string;
  kind: 'DELIVERY' | 'PICKUP';
  price: MoneyDto;
  description: string | null;
  pickupAddress: string | null;
  /** "Gratis desde $X": con ese subtotal de productos, el envío no se cobra. */
  freeAbove?: MoneyDto | null;
}

export interface CorreoAgency {
  code: string;
  name: string | null;
  address: string;
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

/** Los medios propios de la tienda (envío o retiro), para elegir uno. */
export function OwnShippingOptions({
  options,
  shippingId,
  subtotal,
  onSelect,
}: {
  options: ShippingOption[];
  shippingId: string | null;
  /** Para el "gratis desde $X" de cada medio. */
  subtotal: number;
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">Entrega</h2>
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.id}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 text-sm transition ${shippingId === o.id ? 'border-primary bg-primary/[0.04] ring-1 ring-primary' : 'border-fg/15 hover:border-fg/30'}`}
          >
            <input
              type="radio"
              name="shipping"
              checked={shippingId === o.id}
              onChange={() => onSelect(o.id)}
              className="mt-1"
            />
            <span className="flex-1">
              <span className="flex items-center gap-1.5 font-semibold">
                {o.kind === 'PICKUP' ? <Store className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                {o.name}
              </span>
              {o.description && <span className="mt-0.5 block text-xs text-fg-muted">{o.description}</span>}
              {o.kind === 'PICKUP' && o.pickupAddress && (
                <span className="mt-0.5 block text-xs text-fg-muted">{o.pickupAddress}</span>
              )}
              {o.freeAbove && (
                <span className="mt-0.5 block text-xs text-success">
                  {freeByAmount(o, subtotal)
                    ? `Sin cargo: tu compra supera ${formatMoney(o.freeAbove.amount, o.freeAbove.currency)}`
                    : `Sin cargo desde ${formatMoney(o.freeAbove.amount, o.freeAbove.currency)}`}
                </span>
              )}
            </span>
            <span className="font-semibold">
              {methodPrice(o, subtotal) === 0 ? 'Gratis' : formatMoney(o.price.amount, o.price.currency)}
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

/**
 * "Calculá tu envío": código postal (y ciudad y provincia para los correos que
 * lo piden), las opciones cotizadas y, si es retiro en una sucursal de Correo,
 * cuál.
 */
export function CarrierQuotePanel({
  withTitle,
  carriers,
  inputCls,
  quoteCp,
  setQuoteCp,
  quoteCity,
  setQuoteCity,
  quoteProvince,
  setQuoteProvince,
  quoteShipping,
  quoting,
  quoteErrors,
  quoteOptions,
  shippingId,
  onSelectQuote,
  selectedQuote,
  agencyProvince,
  onAgencyProvince,
  agencies,
  agencyCode,
  setAgencyCode,
}: {
  /** Sin medios propios arriba, el título "Entrega" va acá. */
  withTitle: boolean;
  carriers: CarrierKey[];
  inputCls: string;
  quoteCp: string;
  setQuoteCp: (cp: string) => void;
  quoteCity: string;
  setQuoteCity: (city: string) => void;
  quoteProvince: string;
  setQuoteProvince: (province: string) => void;
  quoteShipping: () => void;
  quoting: boolean;
  quoteErrors: Partial<Record<CarrierKey | 'cp', string>>;
  /** Las opciones cotizadas, con id "<correo>-<i>" para el radio. */
  quoteOptions: { id: string; option: QuotedOption }[];
  shippingId: string | null;
  onSelectQuote: (id: string, option: QuotedOption) => void;
  selectedQuote: QuotedOption | null;
  agencyProvince: string;
  onAgencyProvince: (province: string) => void;
  /** null = cargando. */
  agencies: CorreoAgency[] | null;
  agencyCode: string | null;
  setAgencyCode: (code: string | null) => void;
}) {
  return (
    <section>
      {withTitle && <h2 className="mb-3 text-lg font-bold">Entrega</h2>}
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
                  onChange={() => onSelectQuote(id, o)}
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {o.pickup ? <Store className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                    {o.name}
                  </span>
                  {o.detail && <span className="mt-0.5 block text-xs text-fg-muted">{o.detail}</span>}
                </span>
                <span className="font-semibold">{formatMoney(o.price.amount, o.price.currency)}</span>
              </label>
            ))}

            {selectedQuote?.needsAgency && (
              <div className="rounded-lg border border-fg/10 bg-fg/[0.02] p-3">
                <div className="text-xs font-semibold">¿En qué sucursal retirás?</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <select
                    value={agencyProvince}
                    onChange={(e) => onAgencyProvince(e.target.value)}
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
                    No encontramos sucursales en esa provincia. Probá con otra o elegí envío a domicilio.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
