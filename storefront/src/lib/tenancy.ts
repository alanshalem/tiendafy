import { headers } from 'next/headers';
import type { Tenant } from '@tiendafy/types';
import { apiGet } from './api';
import { cacheTag, REVALIDATE } from './cache';

/** Dominio base de la instalación: lo que queda al sacarle el subdominio a una tienda. */
const BASE_DOMAIN = process.env.PLATFORM_BASE_DOMAIN ?? 'localhost';

/**
 * Tienda que atiende el dominio pelado.
 *
 * Acá el dominio principal es el de una empresa que vende (la importadora que
 * opera la instalación), no el de un catálogo de tiendas. Se puede conseguir
 * cargando ese dominio como "dominio propio" de la tienda, pero entonces el
 * sitio principal depende de que alguien se acuerde de escribirlo: si no lo
 * hace, la dirección más visitada de todas contesta "tienda no encontrada".
 *
 * Con esto se declara de una vez, al lado del dominio, y vale igual en
 * desarrollo —donde "localhost" ni siquiera es un dominio válido para cargar
 * a mano— que en el servidor.
 */
const PRIMARY_STORE = process.env.PRIMARY_STORE_SUBDOMAIN?.trim().toLowerCase();

/** El dominio pelado de la instalación (o su www), no el de una tienda. */
function isApex(host: string): boolean {
  const name = host.trim().toLowerCase().split(':')[0];
  return name === BASE_DOMAIN || name === `www.${BASE_DOMAIN}`;
}

const byHost = (host: string) =>
  apiGet<Tenant>(`/api/v1/tenants/resolve?host=${encodeURIComponent(host)}`, {
    // Data Cache corta: antes era no-store y cada vista de página le pegaba a
    // la API solo para saber de qué tienda es. El host va en la URL, así que la
    // entrada de caché es por tienda. El costo: suspender o eliminar una
    // tienda tarda hasta un minuto en verse. Un host desconocido (404) no se
    // cachea: Next solo guarda las respuestas 200.
    // La etiqueta permite que el backend avise un cambio de estado al instante.
    next: { revalidate: REVALIDATE.tenant, tags: [cacheTag('tenant', '')] },
  });

/**
 * Resuelve el tenant del request actual por Host header contra el backend.
 * Dentro de un request, React deduplica el fetch; entre requests, la Data
 * Cache (ver byHost).
 */
export async function resolveTenant(): Promise<Tenant | null> {
  const headerList = await headers();
  const host = headerList.get('host');
  if (!host) return null;

  const tenant = await byHost(host);
  if (tenant) return tenant;

  // El dominio propio gana sobre la tienda principal: si el comercio cargó
  // ese host, ya resolvió arriba. Esto es solo para el apex sin reclamar.
  if (PRIMARY_STORE && isApex(host)) return byHost(`${PRIMARY_STORE}.${BASE_DOMAIN}`);

  return null;
}
