'use client';

import { usePreviewPlaceholders } from '../section-primitives';
import type { SectionRenderProps } from '../section-types';

function toEmbed(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}

export function InstagramSection({ data }: SectionRenderProps<'instagram'>) {
  const placeholders = usePreviewPlaceholders();
  const url = data.video.trim();
  if (!url) {
    if (!placeholders) return null;
    return (
      <section className="mx-auto max-w-container px-4 py-12">
        <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-fg/5 px-6 text-center text-sm text-fg-muted">
          Pegá el link de un video de YouTube o Vimeo, o de una publicación de Instagram.
        </div>
      </section>
    );
  }

  // Post / reel / tv de Instagram → su URL /embed sí se puede iframe-ar.
  const igPost = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([\w-]+)/i);
  if (igPost) {
    return (
      <section className="mx-auto max-w-container px-4 py-12">
        <div className="mx-auto w-full max-w-[400px] overflow-hidden rounded-lg border border-black/10 bg-white">
          <iframe
            src={`https://www.instagram.com/p/${igPost[1]}/embed`}
            className="h-[560px] w-full"
            scrolling="no"
            title="Instagram"
          />
        </div>
      </section>
    );
  }

  // Perfil/cuenta de Instagram: NO se puede embeber el feed (Instagram lo
  // bloquea). Mostramos una tarjeta con link al perfil.
  const igProfile = url.match(/instagram\.com\/([A-Za-z0-9_.]+)\/?(?:\?.*)?$/i);
  if (igProfile) {
    const user = igProfile[1];
    return (
      <section className="mx-auto max-w-container px-4 py-12">
        <a
          href={`https://instagram.com/${user}`}
          target="_blank"
          rel="noreferrer"
          className="mx-auto flex max-w-md flex-col items-center gap-2 rounded-2xl border border-black/10 p-8 text-center transition-transform hover:scale-[1.01]"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-10 w-10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="2" y="2" width="20" height="20" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          </svg>
          <div className="text-lg font-bold">@{user}</div>
          <div className="text-sm text-fg-muted">Seguinos en Instagram</div>
          <span className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-fg">
            Ver perfil
          </span>
        </a>
      </section>
    );
  }

  // YouTube / Vimeo / otro embebible.
  return (
    <section className="mx-auto max-w-container px-4 py-12">
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black/5">
        <iframe src={toEmbed(url)} className="h-full w-full" allowFullScreen title="Video" />
      </div>
    </section>
  );
}
