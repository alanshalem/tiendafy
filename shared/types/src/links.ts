/* ============================================================
   Links que escribe el comercio (menú, barra de anuncio, pie, banners).

   El campo era texto libre y se guardaba tal cual: "www.mitienda.com" se
   volvía un link relativo roto (/www.mitienda.com), y nada frenaba un
   "javascript:…" pegado de cualquier lado. Acá se decide UNA vez qué es un
   link válido, para el editor (que avisa mientras se escribe) y para la
   tienda (que nunca dibuja un href peligroso, aunque venga de un tema viejo).
   ============================================================ */

export type LinkKind = 'internal' | 'external' | 'mailto' | 'tel' | 'whatsapp';

export interface NormalizedLink {
  /** El href listo para usar, o null si no hay link (vacío o rechazado). */
  href: string | null;
  kind: LinkKind;
  /** Por qué se rechazó, en castellano para mostrarle al comercio. */
  error?: string;
}

const NOT_ALLOWED = 'Ese tipo de link no está permitido. Usá una dirección web, un email o un teléfono.';
const NOT_A_LINK = 'No parece un link. Probá con una dirección como mitienda.com o /productos.';

/** Dominio "a pelo": www.x.com, x.com.ar, sub.x.io (también con letras con tilde). */
const DOMAIN = /^(?:localhost|(?:[a-z0-9¡-￿](?:[a-z0-9¡-￿-]*[a-z0-9¡-￿])?\.)+[a-z¡-￿]{2,})(?::\d{1,5})?$/i;
const EMAIL = /^[^\s@/?#]+@[^\s@/?#]+\.[^\s@/?#]{2,}$/;
const WHATSAPP_HOSTS = new Set(['wa.me', 'api.whatsapp.com', 'whatsapp.com', 'www.whatsapp.com']);

function webKind(url: URL): LinkKind {
  return WHATSAPP_HOSTS.has(url.hostname.toLowerCase()) ? 'whatsapp' : 'external';
}

/** Un http(s) armado: host con forma de dominio. Devuelve el href o null. */
function web(candidate: string): { href: string; kind: LinkKind } | null {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!DOMAIN.test(url.host)) return null;
  // Lo que escribió el comercio, tal cual, salvo que tenga espacios: ahí va el
  // que arma el navegador (con los espacios escapados).
  return { href: /\s/.test(candidate) ? url.href : candidate, kind: webKind(url) };
}

/**
 * Normaliza lo que escribió el comercio en un campo de link.
 *
 * - Rutas de la tienda (`/productos/remera`) quedan igual.
 * - Un dominio suelto (`www.x.com`, `x.com/y`) gana `https://`.
 * - Se aceptan http(s), `mailto:`, `tel:` y los links de WhatsApp (wa.me).
 * - `javascript:`, `data:`, `vbscript:` y cualquier otro esquema se rechazan.
 * - Nunca devuelve `#` (un link que no lleva a ningún lado).
 */
export function normalizeLink(input: string): NormalizedLink {
  const value = (typeof input === 'string' ? input : '').trim();
  if (!value) return { href: null, kind: 'internal' };

  // El navegador ignora tabs, saltos de línea y caracteres de control dentro
  // del esquema ("java\nscript:" se ejecuta igual): se miran sin ellos.
  // eslint-disable-next-line no-control-regex
  const probe = value.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();

  if (value.startsWith('//')) {
    const w = web(`https:${value}`);
    return w ?? { href: null, kind: 'external', error: NOT_A_LINK };
  }
  if (value.startsWith('/') || value.startsWith('\\')) {
    // "/\otro.com" y "\otro.com" el navegador los lee como "//otro.com": un
    // link que parece de la tienda y sale a otro sitio.
    if (value.startsWith('\\') || value.startsWith('/\\'))
      return { href: null, kind: 'internal', error: NOT_A_LINK };
    if (/\s/.test(value)) return { href: null, kind: 'internal', error: 'El link no puede tener espacios.' };
    return { href: value, kind: 'internal' };
  }
  if (value.startsWith('#')) {
    if (value.length === 1 || /\s/.test(value))
      return { href: null, kind: 'internal', error: 'Falta a dónde lleva el link.' };
    return { href: value, kind: 'internal' };
  }

  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(probe)?.[1];
  // "localhost:3000" o "mitienda.com:8080/x" también matchean como esquema: un
  // esquema de verdad no lleva puntos ni sigue con un número de puerto.
  const looksLikePort = !!scheme && (scheme.includes('.') || scheme === 'localhost');
  if (scheme && !looksLikePort) {
    if (scheme === 'http' || scheme === 'https') {
      const w = web(value);
      return (
        w ?? {
          href: null,
          kind: 'external',
          error: 'La dirección está incompleta. Revisá que esté bien escrita.',
        }
      );
    }
    if (scheme === 'mailto') {
      const address = value
        .slice(value.indexOf(':') + 1)
        .split('?')[0]!
        .trim();
      if (!EMAIL.test(decodeSafe(address)))
        return { href: null, kind: 'mailto', error: 'El email no parece válido.' };
      return { href: value.replace(/\s/g, ''), kind: 'mailto' };
    }
    if (scheme === 'tel') {
      const number = value.slice(value.indexOf(':') + 1).replace(/[\s().-]/g, '');
      if (!/^\+?\d{4,}$/.test(number))
        return { href: null, kind: 'tel', error: 'El teléfono no parece válido.' };
      return { href: `tel:${number}`, kind: 'tel' };
    }
    return { href: null, kind: 'external', error: NOT_ALLOWED };
  }

  if (/\s/.test(value)) return { href: null, kind: 'external', error: NOT_A_LINK };
  if (EMAIL.test(value)) return { href: `mailto:${value}`, kind: 'mailto' };

  // Dominio suelto: el host es lo que va hasta la primera barra/consulta.
  const host = value.split(/[/?#]/)[0]!;
  if (DOMAIN.test(host) && host.includes('.')) {
    const w = web(`https://${value}`);
    if (w) return w;
  }
  // Una palabra sin punto ("contacto", "productos/remera"): una ruta de la
  // tienda a la que le faltó la barra.
  if (/^[\w\-.~%]+(?:\/[\w\-.~%]*)*(?:[?#]\S*)?$/u.test(value) && !host.includes('.'))
    return { href: `/${value}`, kind: 'internal' };
  return { href: null, kind: 'external', error: NOT_A_LINK };
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * El href seguro para dibujar, o undefined si no hay que dibujar un link.
 * Lo usa la tienda con lo que viene del tema: con undefined se renderiza un
 * elemento que no es link (nunca un `href="#"`).
 */
export function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return normalizeLink(value).href ?? undefined;
}

/** ¿Sale de la tienda? (para abrir en otra pestaña y marcar rel="noopener"). */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/* ---------- Destinos de la tienda ---------- */

/** Páginas fijas de la tienda (las que existen siempre). */
export const STORE_PAGES: { href: string; label: string }[] = [
  { href: '/', label: 'Inicio' },
  { href: '/productos', label: 'Productos' },
  { href: '/contacto', label: 'Contacto' },
  { href: '/favoritos', label: 'Favoritos' },
  { href: '/terminos', label: 'Términos y condiciones' },
  { href: '/privacidad', label: 'Privacidad' },
  { href: '/arrepentimiento', label: 'Botón de arrepentimiento' },
];

/** Link a un producto por su slug. */
export const productLink = (slug: string): string => `/productos/${encodeURIComponent(slug)}`;

/** Link a una página de contenido por su slug. */
export const pageLink = (slug: string): string => `/paginas/${encodeURIComponent(slug)}`;

/**
 * Link al listado filtrado por categoría. Mismo formato que arma la tienda
 * (storefront/lib/category-url): la ruta legible, con las barras sin escapar.
 */
export const categoryLink = (pathOrId: string): string =>
  `/productos?${new URLSearchParams({ category: pathOrId }).toString().replace(/%2F/gi, '/')}`;

/** Link de WhatsApp: el número solo con dígitos y el mensaje opcional ya escrito. */
export function whatsappLink(phone: string, message = ''): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  const text = message.trim();
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Qué hay del otro lado de un href guardado (para mostrarlo lindo en el editor). */
export type LinkTarget =
  | { type: 'none' }
  | { type: 'store-page'; href: string; label: string }
  | { type: 'product'; slug: string }
  | { type: 'category'; param: string }
  | { type: 'page'; slug: string }
  | { type: 'whatsapp'; phone: string; message: string }
  | { type: 'mailto'; address: string }
  | { type: 'tel'; number: string }
  | { type: 'internal'; href: string }
  | { type: 'external'; href: string };

/** Lee un href guardado y dice a qué apunta. Lo inválido cuenta como "sin link". */
export function describeLink(raw: string): LinkTarget {
  const { href, kind } = normalizeLink(raw);
  if (!href) return { type: 'none' };
  if (kind === 'mailto') return { type: 'mailto', address: decodeSafe(href.slice(7).split('?')[0]!) };
  if (kind === 'tel') return { type: 'tel', number: href.slice(4) };
  if (kind === 'whatsapp') {
    const url = new URL(href);
    const fromPath = url.pathname.replace(/\D/g, '');
    return {
      type: 'whatsapp',
      phone: fromPath || (url.searchParams.get('phone') ?? '').replace(/\D/g, ''),
      message: url.searchParams.get('text') ?? '',
    };
  }
  if (kind === 'external') return { type: 'external', href };

  const [path = '', query = ''] = href.split('#')[0]!.split('?');
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  const params = new URLSearchParams(query);
  if (clean === '/productos' && params.get('category'))
    return { type: 'category', param: params.get('category')! };
  if (!query) {
    const fixed = STORE_PAGES.find((p) => p.href === clean);
    if (fixed) return { type: 'store-page', href: fixed.href, label: fixed.label };
    const product = /^\/productos\/([^/]+)$/.exec(clean);
    if (product) return { type: 'product', slug: decodeSafe(product[1]!) };
    const page = /^\/paginas\/([^/]+)$/.exec(clean);
    if (page) return { type: 'page', slug: decodeSafe(page[1]!) };
  }
  return { type: 'internal', href };
}
