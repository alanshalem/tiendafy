'use client';

import Link from 'next/link';
import { Icon } from './Icon';
import { type ThemeConfig } from '@/lib/theme';
import { usePublishedPages } from './PagesNav';
import { usePreviewHref } from './preview';
import { NewsletterForm } from './NewsletterForm';
import { StoreLink } from './StoreLink';
import { contrastText, mixRgb, safeHref } from '@tiendafy/types';

type FooterConfig = ThemeConfig['footer'];

/**
 * Las redes con un link válido, en el orden de siempre. safeHref completa
 * "instagram.com/x" con https:// (antes quedaba como link relativo roto) y
 * descarta lo que no es un link.
 */
function footerSocials(footer: FooterConfig) {
  return [
    { url: safeHref(footer.instagram), label: 'Instagram', icon: <InstagramIcon /> },
    { url: safeHref(footer.facebook), label: 'Facebook', icon: <FacebookIcon /> },
    { url: safeHref(footer.tiktok), label: 'TikTok', icon: <TikTokIcon /> },
    { url: safeHref(footer.youtube), label: 'YouTube', icon: <YouTubeIcon /> },
    { url: safeHref(footer.x), label: 'X', icon: <XIcon /> },
  ].filter((s) => !!s.url);
}

/**
 * Pie con color propio: el texto se elige solo (el que se lee) y las
 * variables de color se redefinen adentro, así lo secundario (legales, "©")
 * también se lee sobre ese fondo y no hay que tocar cada pieza.
 */
function footerColors(bg: string): React.CSSProperties | undefined {
  if (!bg) return undefined;
  const fg = contrastText(bg);
  return {
    background: `rgb(${bg})`,
    color: `rgb(${fg})`,
    ['--color-fg' as string]: fg,
    ['--color-fg-muted' as string]: mixRgb(fg, bg, 0.3),
  };
}

/** Cuántas columnas en la compu según cuántas hay (clases literales para Tailwind). */
const COLS = ['', 'lg:grid-cols-1', 'lg:grid-cols-2', 'lg:grid-cols-3', 'lg:grid-cols-4'];

export function Footer({ theme, tenantName }: { theme: ThemeConfig; tenantName: string }) {
  const footer = theme.footer;
  const pages = usePublishedPages();
  const href = usePreviewHref();
  const socials = footer.showSocial ? footerSocials(footer) : [];
  // Links propios del comercio: solo los que tienen nombre y un destino válido.
  const links = (footer.links ?? []).filter((l) => l.label.trim() && safeHref(l.href));
  const shownPages = footer.showPages ? pages : [];
  const hasContacts = [...footer.whatsapps, ...footer.addresses, ...footer.phones, ...footer.emails].some(
    Boolean,
  );
  const style = footerColors(footer.bg);
  const frame = `mt-8 ${style ? '' : 'border-t border-black/10'}`;

  if (footer.layout === 'columns') {
    const navigation = [
      ...links.map((l, i) => (
        <StoreLink key={`l${i}`} href={l.href} newTab={l.newTab} className="hover:underline">
          {l.label}
        </StoreLink>
      )),
      ...shownPages.map((p) => (
        <Link key={p.id} href={href(`/paginas/${p.slug}`)} className="hover:underline">
          {p.title}
        </Link>
      )),
    ];
    const columns = [
      navigation.length > 0 && (
        <FooterColumn key="nav" title="Información">
          <ul className="space-y-1 text-sm">
            {navigation.map((n, i) => (
              // py-1.5: alto cómodo para el dedo en el celular.
              <li key={i} className="py-1.5 opacity-80 hover:opacity-100">
                {n}
              </li>
            ))}
          </ul>
        </FooterColumn>
      ),
      hasContacts && (
        <FooterColumn key="contact" title="Contacto">
          <FooterContacts footer={footer} vertical />
        </FooterColumn>
      ),
      footer.showNewsletter && (
        <FooterColumn key="news" title={footer.newsletterTitle || 'Recibí novedades'}>
          <NewsletterForm source="footer" compact />
        </FooterColumn>
      ),
    ].filter(Boolean);
    return (
      <footer className={frame} style={style}>
        <div className="mx-auto max-w-container px-4 py-12">
          <div className={`grid gap-10 sm:grid-cols-2 ${COLS[columns.length + 1] ?? COLS[4]}`}>
            <div className="max-w-xs">
              {theme.logo ? (
                <img src={theme.logo} alt={tenantName} className="h-10 w-auto max-w-[12rem] object-contain" />
              ) : (
                <div className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                  {tenantName}
                </div>
              )}
              {footer.text && <p className="mt-3 text-sm opacity-75">{footer.text}</p>}
              {socials.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {socials.map((s) => (
                    <a
                      key={s.label}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={s.label}
                      title={s.label}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-current/10 transition hover:bg-current/20"
                    >
                      {s.icon}
                    </a>
                  ))}
                </div>
              )}
            </div>
            {columns}
          </div>
          <div className="mt-10 flex flex-col gap-4 border-t border-current/10 pt-6 md:flex-row md:items-center md:justify-between">
            <PaymentLogos footer={footer} className="justify-start" />
            <div className="flex flex-wrap items-center gap-x-4 text-xs text-fg-muted">
              <LegalLinks />
              <span className="py-2">© {tenantName}</span>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className={frame} style={style}>
      <div className="mx-auto max-w-container px-4 py-10">
        {footer.text && <p className="mx-auto max-w-xl text-center text-sm opacity-70">{footer.text}</p>}
        {socials.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 opacity-70 hover:opacity-100"
              >
                {s.icon} {s.label}
              </a>
            ))}
          </div>
        )}

        {links.length > 0 && (
          <nav aria-label="Links del pie" className="mt-5">
            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm">
              {links.map((l, i) => (
                <li key={i}>
                  {/* py-2: alto cómodo para el dedo, como los links legales de abajo. */}
                  <StoreLink
                    href={l.href}
                    newTab={l.newTab}
                    className="inline-block py-2 opacity-75 hover:underline hover:opacity-100"
                  >
                    {l.label}
                  </StoreLink>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Las páginas que escribió el comercio (cómo comprar, preguntas, envíos):
            estaban solo en el menú de arriba, donde compiten por lugar. */}
        {shownPages.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm opacity-75">
            {shownPages.map((p) => (
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
        {hasContacts && (
          <div className="mt-5">
            <FooterContacts footer={footer} />
          </div>
        )}
        <PaymentLogos footer={footer} className="mt-5 justify-center" />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 text-xs text-fg-muted">
          <LegalLinks />
        </div>
        <div className="mt-3 text-center text-xs text-fg-muted">© {tenantName}</div>
      </div>
    </footer>
  );
}

/** Una columna del pie en columnas: título y contenido. */
function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

/** WhatsApp, teléfono y email como links; la dirección como texto. */
function FooterContacts({ footer, vertical = false }: { footer: FooterConfig; vertical?: boolean }) {
  const item = 'inline-flex items-center gap-1.5 hover:opacity-100';
  return (
    <div
      className={
        vertical
          ? 'flex flex-col items-start gap-2.5 text-sm opacity-80'
          : 'flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm opacity-75'
      }
    >
      {footer.whatsapps.filter(Boolean).map((w, i) => (
        <a
          key={`w${i}`}
          href={`https://wa.me/${w.replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
          className={item}
        >
          <Icon name="chat" className="h-4 w-4 shrink-0" /> {w}
        </a>
      ))}
      {footer.phones.filter(Boolean).map((p, i) => (
        <a key={`p${i}`} href={`tel:${p.replace(/\s/g, '')}`} className={item}>
          <Icon name="phone" className="h-4 w-4 shrink-0" /> {p}
        </a>
      ))}
      {footer.emails.filter(Boolean).map((e, i) => (
        <a key={`e${i}`} href={`mailto:${e}`} className={item}>
          <Icon name="mail" className="h-4 w-4 shrink-0" /> {e}
        </a>
      ))}
      {footer.addresses.filter(Boolean).map((a, i) => (
        <span key={`a${i}`} className="inline-flex items-center gap-1.5">
          <Icon name="mapPin" className="h-4 w-4 shrink-0" /> {a}
        </span>
      ))}
    </div>
  );
}

function PaymentLogos({ footer, className }: { footer: FooterConfig; className: string }) {
  if (!footer.showPaymentLogos || footer.paymentLogos.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2.5 ${className}`}>
      {footer.paymentLogos.map((slug) => (
        // lazy: al pie, nunca a la vista al cargar. Sin esto React los
        // precargaba desde el <head>, compitiendo con la foto de portada.
        <img
          key={slug}
          src={`/payment-logos/${slug}.svg`}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-7 w-auto rounded border border-black/10 bg-white object-contain px-1.5 py-1"
        />
      ))}
    </div>
  );
}

/**
 * Links legales fijos: el Botón de Arrepentimiento es obligatorio (Res.
 * 424/2020). py-2: con el texto de 12 px, el link solo medía 16 px de alto y
 * en el celular costaba acertarle con el dedo.
 */
function LegalLinks() {
  return (
    <>
      <Link href="/terminos" className="inline-block py-2 hover:underline">
        Términos y condiciones
      </Link>
      <span aria-hidden>·</span>
      <Link href="/privacidad" className="inline-block py-2 hover:underline">
        Privacidad
      </Link>
      <span aria-hidden>·</span>
      <Link href="/arrepentimiento" className="inline-block py-2 font-semibold hover:underline">
        Botón de arrepentimiento
      </Link>
    </>
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
