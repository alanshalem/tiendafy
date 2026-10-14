import { createHash, timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { CACHE_SCOPES, cacheTag, type CacheScope } from '@/lib/cache';

/** El de appsettings.Development.json: en desarrollo anda sin configurar nada. Nunca en producción. */
const DEV_SECRET = 'dev-revalidate-secret';

/**
 * El backend avisa que algo publicado cambió (un diseño, productos, precios,
 * stock, categorías, el estado de una tienda) y la Data Cache de esa familia
 * se vence al toque. Antes un cambio tardaba lo que la ventana de tiempo de
 * la caché (30 a 60 s) y el comercio creía que no se había guardado.
 *
 * Lo llama la API por la red interna con un secreto compartido en
 * `X-Revalidate-Secret` (REVALIDATE_SECRET acá, Storefront:RevalidateSecret
 * allá). En producción, sin secreto configurado la ruta no hace nada: no hay
 * un modo abierto.
 *
 *   POST /internal/revalidate  { "tenantId": "…", "scopes": ["theme", "catalog"] }
 */
export async function POST(request: Request) {
  const secret =
    process.env.REVALIDATE_SECRET?.trim() || (process.env.NODE_ENV === 'production' ? '' : DEV_SECRET);
  if (!secret)
    return Response.json({ error: 'Revalidación apagada (falta REVALIDATE_SECRET).' }, { status: 503 });
  if (!sameSecret(request.headers.get('x-revalidate-secret') ?? '', secret))
    return Response.json({ error: 'No autorizado.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { tenantId?: unknown; scopes?: unknown } | null;
  const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : '';
  const scopes = Array.isArray(body?.scopes)
    ? body.scopes.filter((s): s is CacheScope => CACHE_SCOPES.includes(s as CacheScope))
    : [];
  if (!/^[0-9a-f-]{36}$/i.test(tenantId) || scopes.length === 0)
    return Response.json({ error: 'Se espera { tenantId, scopes }.' }, { status: 400 });

  const tags = [...new Set(scopes.map((s) => cacheTag(s, tenantId)))];
  // expire: 0 y no 'max': con 'max' la primera visita después de publicar
  // todavía recibe lo viejo (y es justo el comercio, que entra a mirar).
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags });
}

/** Comparación en tiempo constante (los hashes igualan el largo). */
function sameSecret(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
