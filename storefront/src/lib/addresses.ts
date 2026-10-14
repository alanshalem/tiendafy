import { clientJsonTenant } from './api-client';

/**
 * Una dirección guardada del comprador logueado. Los nombres son los del
 * paso de entrega del checkout (name, lastName, phone, doc, street,
 * streetNumber, apartment, city, zip), así se vuelca tal cual en el
 * formulario; `province` sirve para las sucursales de Correo.
 */
export interface SavedAddressInput {
  label: string | null;
  name: string;
  lastName: string | null;
  phone: string | null;
  doc: string | null;
  street: string;
  streetNumber: string;
  apartment: string | null;
  city: string;
  province: string | null;
  zip: string;
  isDefault: boolean;
}

export interface SavedAddress extends SavedAddressInput {
  id: string;
}

export const EMPTY_ADDRESS: SavedAddressInput = {
  label: '',
  name: '',
  lastName: '',
  phone: '',
  doc: '',
  street: '',
  streetNumber: '',
  apartment: '',
  city: '',
  province: '',
  zip: '',
  isDefault: false,
};

/** "Corrientes 1234, 3B, CABA, CP 1414": como la arma el checkout para la orden. */
export function formatAddress(
  a: Pick<SavedAddressInput, 'street' | 'streetNumber' | 'apartment' | 'city' | 'zip'>,
): string {
  return [
    `${a.street} ${a.streetNumber}`.trim(),
    a.apartment?.trim(),
    a.city.trim(),
    a.zip.trim() ? `CP ${a.zip.trim()}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

/**
 * Las direcciones del comprador logueado, la predeterminada primero. Null si
 * no hay sesión o la API no respondió: el checkout sigue vacío, como siempre.
 */
export async function fetchSavedAddresses(tenantId: string): Promise<SavedAddress[] | null> {
  const d = await clientJsonTenant<{ items: SavedAddress[] }>('/api/v1/shop/addresses/', tenantId, {
    credentials: 'include',
  });
  return d ? (d.items ?? []) : null;
}

/** La que el checkout completa sola: la predeterminada (o la primera). */
export const defaultAddress = (items: SavedAddress[] | null): SavedAddress | null =>
  items?.find((a) => a.isDefault) ?? items?.[0] ?? null;
