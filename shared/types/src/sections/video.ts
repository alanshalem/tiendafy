/* ============================================================
   Links de YouTube y Vimeo de la sección "Video".

   El comercio pega lo que tiene a mano: el link de "Compartir"
   (youtu.be), el de la barra (watch?v=), un Short, el de un embed o
   el de un video privado de Vimeo con su clave. De cualquiera de esos
   sale el mismo embed. Lo que no se reconoce no se embebe: la sección
   nunca mete en un <iframe> una página cualquiera.
   ============================================================ */

export type VideoEmbed =
  { provider: 'youtube'; id: string } | { provider: 'vimeo'; id: string; hash?: string };

const YT_ID = /^[\w-]{11}$/;
const YT_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

/** El video de un link de YouTube o Vimeo, o null si no es uno. */
export function parseVideoUrl(raw: string): VideoEmbed | null {
  const value = raw.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'youtu.be') {
    const id = parts[0] ?? '';
    return YT_ID.test(id) ? { provider: 'youtube', id } : null;
  }
  if (YT_HOSTS.has(host)) {
    const v = url.searchParams.get('v');
    if (parts[0] === 'watch' && v && YT_ID.test(v)) return { provider: 'youtube', id: v };
    if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '') && YT_ID.test(parts[1] ?? ''))
      return { provider: 'youtube', id: parts[1]! };
    return null;
  }
  if (VIMEO_HOSTS.has(host)) {
    // vimeo.com/123, vimeo.com/123/clave, vimeo.com/channels/x/123,
    // player.vimeo.com/video/123?h=clave
    const idx = parts.findIndex((p) => /^\d+$/.test(p));
    if (idx < 0) return null;
    const id = parts[idx]!;
    const hash =
      url.searchParams.get('h') ?? (/^[\da-f]{6,}$/i.test(parts[idx + 1] ?? '') ? parts[idx + 1] : undefined);
    return hash ? { provider: 'vimeo', id, hash } : { provider: 'vimeo', id };
  }
  return null;
}

/**
 * La URL del reproductor, para cargar recién cuando se toca "reproducir"
 * (por eso arranca solo). YouTube sin cookies hasta que se reproduce;
 * Vimeo sin seguimiento (dnt).
 */
export function videoEmbedUrl(video: VideoEmbed): string {
  if (video.provider === 'youtube')
    return `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0&playsinline=1`;
  const qs = new URLSearchParams({ autoplay: '1', dnt: '1' });
  if (video.hash) qs.set('h', video.hash);
  return `https://player.vimeo.com/video/${video.id}?${qs.toString()}`;
}

/** La miniatura pública del video (solo YouTube la tiene sin pedir nada). */
export function videoThumbnail(video: VideoEmbed): string | null {
  return video.provider === 'youtube' ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : null;
}
