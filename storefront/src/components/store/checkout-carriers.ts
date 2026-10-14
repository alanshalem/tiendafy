import { formatDate, type MoneyDto } from '@tiendafy/types';

/**
 * Los correos que cotizan en vivo en el checkout, descritos en un solo lugar.
 *
 * Antes cada uno tenía su estado, su render y su lugar en cada chequeo, y al
 * sumar Andreani quedaron cuatro lugares sin tocar: el "elegí cómo recibir",
 * los dos resúmenes y el texto de ayuda. Agregar un correo ahora es agregar
 * una entrada acá.
 */
export type CarrierKey = 'andreani' | 'zipnova' | 'correo';

/** Una opción cotizada, ya en la forma común que dibuja el checkout. */
export interface QuotedOption {
  carrier: CarrierKey;
  /** Cotización firmada por el servidor: es lo que fija el precio del envío. */
  token: string;
  name: string;
  price: MoneyDto;
  /** Plazo u otra aclaración para el comprador. */
  detail: string | null;
  /** Retiro en sucursal: no hace falta la dirección del comprador. */
  pickup: boolean;
  /** Hay que elegir la sucursal (Correo Argentino a sucursal). */
  needsAgency: boolean;
}

interface QuoteInput {
  postalCode: string;
  city: string;
  province: string;
  units: number;
  items: { variantId: string; quantity: number }[];
  /** En pesos. */
  declaredValue: number;
}

interface Carrier {
  label: string;
  path: string;
  /** Su API resuelve el destino por localidad, no solo por código postal. */
  needsCityProvince: boolean;
  noRates: string;
  body: (q: QuoteInput) => object;
  toOption: (raw: Record<string, unknown>) => QuotedOption;
}

interface CorreoRaw {
  token: string;
  kind: 'D' | 'S';
  name: string;
  price: MoneyDto;
  etaMin: string | null;
  etaMax: string | null;
}

interface ZipnovaRaw {
  token: string;
  name: string;
  price: MoneyDto;
  estimatedDelivery: string | null;
}

/**
 * Andreani no trae plazo de entrega porque su cotización no lo devuelve — y
 * una fecha inventada en el checkout es una promesa que después hay que
 * sostener.
 */
interface AndreaniRaw {
  token: string;
  name: string;
  price: MoneyDto;
  toBranch: boolean;
}

// El orden es el de la pantalla.
export const CARRIERS: Record<CarrierKey, Carrier> = {
  andreani: {
    label: 'Andreani',
    path: '/api/v1/shipping/andreani/quote',
    needsCityProvince: false,
    noRates: 'Andreani no tiene tarifas para ese código postal.',
    body: (q) => ({
      postalCode: q.postalCode,
      units: q.units,
      items: q.items,
      declaredValue: q.declaredValue,
    }),
    toOption: (raw) => {
      const o = raw as unknown as AndreaniRaw;
      return {
        carrier: 'andreani',
        token: o.token,
        name: o.name,
        price: o.price,
        detail: o.toBranch ? 'Lo retirás en una sucursal de Andreani' : null,
        pickup: o.toBranch,
        needsAgency: false,
      };
    },
  },
  zipnova: {
    label: 'Zipnova',
    path: '/api/v1/shipping/zipnova/quote',
    needsCityProvince: true,
    noRates: 'Zipnova no tiene opciones para ese destino.',
    body: (q) => ({
      postalCode: q.postalCode,
      city: q.city,
      state: q.province,
      units: q.units,
      items: q.items,
      declaredValue: q.declaredValue,
    }),
    toOption: (raw) => {
      const o = raw as unknown as ZipnovaRaw;
      return {
        carrier: 'zipnova',
        token: o.token,
        name: o.name,
        price: o.price,
        detail: o.estimatedDelivery
          ? `Llega aprox. el ${formatDate(o.estimatedDelivery, { day: 'numeric', month: 'long' })}`
          : null,
        pickup: false,
        needsAgency: false,
      };
    },
  },
  correo: {
    label: 'Correo Argentino',
    path: '/api/v1/shipping/correo/quote',
    needsCityProvince: false,
    noRates: 'Correo Argentino no tiene tarifas para ese código postal.',
    body: (q) => ({ postalCode: q.postalCode, units: q.units, items: q.items }),
    toOption: (raw) => {
      const o = raw as unknown as CorreoRaw;
      return {
        carrier: 'correo',
        token: o.token,
        name: o.name,
        price: o.price,
        detail: o.etaMin
          ? `Llega en ${o.etaMin}${o.etaMax && o.etaMax !== o.etaMin ? ` a ${o.etaMax}` : ''} días hábiles`
          : null,
        pickup: o.kind === 'S',
        needsAgency: o.kind === 'S',
      };
    },
  },
};

export const CARRIER_KEYS = Object.keys(CARRIERS) as CarrierKey[];

/** Cuáles están activos según /shipping/methods (cada uno con su nombre de campo). */
export function enabledCarriers(methods: Record<string, unknown>): CarrierKey[] {
  const field: Record<CarrierKey, string> = {
    andreani: 'andreani',
    zipnova: 'zipnova',
    correo: 'correoArgentino',
  };
  return CARRIER_KEYS.filter((k) =>
    Boolean((methods[field[k]] as { enabled?: boolean } | undefined)?.enabled),
  );
}

/** "Andreani cotiza…" / "Andreani, Zipnova y Correo Argentino cotizan…". */
export function quoteHint(keys: CarrierKey[]): string {
  const names = keys.map((k) => CARRIERS[k].label);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? '');
  return `${list} ${names.length > 1 ? 'cotizan' : 'cotiza'} al instante para tu dirección.`;
}

export type { QuoteInput };
