'use client';

import Link from 'next/link';
import { Icon } from './Icon';
import { type ThemeConfig } from '@/lib/theme';
import { usePublishedPages } from './PagesNav';
import { usePreviewHref } from './preview';
import { NewsletterForm } from './NewsletterForm';

export function Footer({ theme, tenantName }: { theme: ThemeConfig; tenantName: string }) {
  const footer = theme.footer;
  const pages = usePublishedPages();
  const href = usePreviewHref();
  // Cada red es opcional: se dibuja la que tenga link, en el orden de siempre.
  const socials = [
    { url: footer.instagram, label: 'Instagram', icon: <InstagramIcon /> },
    { url: footer.facebook, label: 'Facebook', icon: <FacebookIcon /> },
    { url: footer.tiktok, label: 'TikTok', icon: <TikTokIcon /> },
    { url: footer.youtube, label: 'YouTube', icon: <YouTubeIcon /> },
    { url: footer.x, label: 'X', icon: <XIcon /> },
  ].filter((s) => !!s.url);
  return (
    <footer className="mt-8 border-t border-black/10">
      <div className="mx-auto max-w-container px-4 py-10">
        {footer.text && <p className="mx-auto max-w-xl text-center text-sm opacity-70">{footer.text}</p>}
        {footer.showSocial && socials.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 opacity-70 hover:opacity-100"
              >
                {s.icon} {s.label}
              </a>
            ))}
          </div>
        )}

        {/* Las páginas que escribió el comercio (cómo comprar, preguntas, envíos):
            estaban solo en el menú de arriba, donde compiten por lugar. */}
        {footer.showPages && pages.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm opacity-75">
            {pages.map((p) => (
              <Link
                key={p.id}
                href={href(`/paginas/${p.slug}`)}
                className="hover:opacity-100 hover:underline"
              >
                {p.title}
              </Link>
            ))}
          </div>
        )}

        {footer.showNewsletter && (
          <div className="mt-7 text-center">
            <div className="text-sm font-semibold">{footer.newsletterTitle || 'Recibí novedades'}</div>
            <div className="mx-auto mt-2 max-w-sm">
              <NewsletterForm source="footer" compact />
            </div>
          </div>
        )}
        {[...footer.whatsapps, ...footer.addresses, ...footer.phones, ...footer.emails].some(Boolean) && (
          <div className="mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm opacity-75">
            {footer.whatsapps.filter(Boolean).map((w, i) => (
              <a
                key={`w${i}`}
                href={`https://wa.me/${w.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:opacity-100"
              >
                <Icon name="chat" className="h-4 w-4" /> {w}
              </a>
            ))}
            {footer.phones.filter(Boolean).map((p, i) => (
              <a
                key={`p${i}`}
                href={`tel:${p.replace(/\s/g, '')}`}
                className="inline-flex items-center gap-1.5 hover:opacity-100"
              >
                <Icon name="phone" className="h-4 w-4" /> {p}
              </a>
            ))}
            {footer.emails.filter(Boolean).map((e, i) => (
              <a
                key={`e${i}`}
                href={`mailto:${e}`}
                className="inline-flex items-center gap-1.5 hover:opacity-100"
              >
                <Icon name="mail" className="h-4 w-4" /> {e}
              </a>
            ))}
            {footer.addresses.filter(Boolean).map((a, i) => (
              <span key={`a${i}`} className="inline-flex items-center gap-1.5">
                <Icon name="mapPin" className="h-4 w-4" /> {a}
              </span>
            ))}
          </div>
        )}
        {footer.showPaymentLogos && footer.paymentLogos.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {footer.paymentLogos.map((slug) => (
              <img
                key={slug}
                src={`/payment-logos/${slug}.svg`}
                alt=""
                className="h-7 w-auto rounded border border-black/10 bg-white object-contain px-1.5 py-1"
              />
            ))}
          </div>
        )}
        {/* Links legales fijos: el Botón de Arrepentimiento es obligatorio (Res. 424/2020). */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs opacity-60">
          <Link href="/terminos" className="hover:underline">
            Términos y condiciones
          </Link>
          <span aria-hidden>·</span>
          <Link href="/privacidad" className="hover:underline">
            Privacidad
          </Link>
          <span aria-hidden>·</span>
          <Link href="/arrepentimiento" className="font-semibold hover:underline">
            Botón de arrepentimiento
          </Link>
        </div>
        <div className="mt-3 text-center text-xs opacity-50">© {tenantName}</div>
      </div>
    </footer>
  );
}

// lucide-react quitó los iconos de marca; SVGs propios (heredan currentColor).
function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M14 9h3l.4-3H14V4.5c0-.8.3-1.5 1.5-1.5H17.5V.2C17.1.1 16 0 14.9 0 12.5 0 11 1.4 11 4v2H8v3h3v9h3V9z" />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M16.5 2c.3 2 1.5 3.4 3.5 3.7v2.6c-1.3.1-2.5-.2-3.6-.9v5.9c0 4-3.4 6.9-7.2 5.9-2.5-.7-4.1-3-4.1-5.5 0-3.2 2.6-5.8 5.8-5.8.3 0 .6 0 .9.1v2.8c-.3-.1-.6-.2-.9-.2-1.6 0-2.9 1.4-2.8 3 .1 1.4 1.3 2.6 2.7 2.6 1.6 0 2.8-1.2 2.8-2.8V2h2.9z" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M23 12s0-3.4-.4-5c-.3-1-1-1.7-2-2C18.9 4.5 12 4.5 12 4.5s-6.9 0-8.6.5c-1 .3-1.7 1-2 2C1 8.6 1 12 1 12s0 3.4.4 5c.3 1 1 1.7 2 2 1.7.5 8.6.5 8.6.5s6.9 0 8.6-.5c1-.3 1.7-1 2-2 .4-1.6.4-5 .4-5zM9.8 15.3V8.7l5.7 3.3-5.7 3.3z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M18.2 2H21l-6.4 7.3L22 22h-5.9l-4.6-6-5.3 6H3.4l6.9-7.8L2.4 2h6l4.2 5.5L18.2 2zm-1 18h1.6L7 3.9H5.3L17.2 20z" />
    </svg>
  );
}
