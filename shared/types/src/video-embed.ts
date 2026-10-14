/* ============================================================
   Videos y publicaciones que se embeben en la tienda (YouTube, Vimeo,
   Instagram).

   Antes la tienda probaba dos regex y, si ninguna coincidía, ponía el
   link tal cual como `src` del iframe: un Short, un /embed/, un link de
   m.youtube.com o cualquier otra página terminaba en un recuadro gris
   (la CSP de la tienda solo deja embeber estos sitios). Acá se decide UNA
   vez qué se puede embeber y cómo, para la tienda y para el editor (que
   avisa mientras se pega el link).
   ============================================================ */

export type VideoEmbed =
  /** `short`: es un Short (vertical). `src` va por youtube-nocookie (sin cookies hasta dar play). */
  | { kind: 'youtube'; id: string; short: boolean; src: string }
  | { kind: 'vimeo'; id: string; src: string }
  /** Publicación, reel o video de IGTV: tiene su página /embed. */
  | { kind: 'instagram'; id: string; src: string }
  /** Un perfil: Instagram no deja embeber el feed, se muestra una tarjeta con link. */
  | { kind: 'instagram-profile'; user: string; href: string };

const YT_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
/** Rutas de Instagram que no son un perfil. */
const INSTAGRAM_RESERVED = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'explore',
  'stories',
  'accounts',
  'direct',
  'about',
  'legal',
  'developer',
]);

function toUrl(raw: string): URL | null {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return null;
  try {
    // "youtu.be/x" o "instagram.com/p/x" sin esquema: se completa.
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** "90", "1m30s", "1h2m3s" → segundos. null si no se entiende. */
function startSeconds(raw: string | null): number | null {
  if (!raw) return null;
  if (/^\d+s?$/.test(raw)) return Number.parseInt(raw, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m || !m[0]) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function youtube(url: URL): VideoEmbed | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  let short = false;
  if (host === 'youtu.be') id = parts[0] ?? null;
  else if (YOUTUBE_HOSTS.has(host)) {
    if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? '')) {
      id = parts[1] ?? null;
      short = parts[0] === 'shorts';
    }
  } else return null;
  if (!id || !YT_ID.test(id)) return null;
  const params = new URLSearchParams({ rel: '0' });
  const start = startSeconds(url.searchParams.get('t') ?? url.searchParams.get('start'));
  if (start) params.set('start', String(start));
  return { kind: 'youtube', id, short, src: `https://www.youtube-nocookie.com/embed/${id}?${params}` };
}

function vimeo(url: URL): VideoEmbed | null {
  if (!VIMEO_HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  // vimeo.com/123, vimeo.com/123/hash (privado), vimeo.com/channels/x/123,
  // player.vimeo.com/video/123?h=hash
  const at = parts.findIndex((p) => /^\d+$/.test(p));
  if (at < 0) return null;
  const id = parts[at]!;
  const params = new URLSearchParams({ dnt: '1' });
  const hash =
    url.searchParams.get('h') ?? (/^[\da-f]{6,}$/i.test(parts[at + 1] ?? '') ? parts[at + 1]! : null);
  if (hash) params.set('h', hash);
  return { kind: 'vimeo', id, src: `https://player.vimeo.com/video/${id}?${params}` };
}

function instagram(url: URL): VideoEmbed | null {
  if (!INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  // instagram.com/p/ID, /reel/ID, /tv/ID y también /usuario/p/ID (links nuevos).
  const at = parts.findIndex((p) => ['p', 'reel', 'reels', 'tv'].includes(p.toLowerCase()));
  if (at >= 0) {
    const id = parts[at + 1];
    if (!id || !/^[\w-]+$/.test(id)) return null;
    return { kind: 'instagram', id, src: `https://www.instagram.com/p/${id}/embed` };
  }
  const user = parts[0];
  if (parts.length === 1 && user && /^[A-Za-z0-9_.]{1,30}$/.test(user)) {
    if (INSTAGRAM_RESERVED.has(user.toLowerCase())) return null;
    return { kind: 'instagram-profile', user, href: `https://instagram.com/${user}` };
  }
  return null;
}

/**
 * Qué hay detrás de un link pegado por el comercio, o null si no es algo que
 * se pueda mostrar en la tienda (otra página, un link roto, un esquema raro).
 */
export function parseVideoEmbed(raw: unknown): VideoEmbed | null {
  if (typeof raw !== 'string') return null;
  const url = toUrl(raw);
  if (!url) return null;
  return youtube(url) ?? vimeo(url) ?? instagram(url);
}
