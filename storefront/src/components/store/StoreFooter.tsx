'use client';

import { useId, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { type ThemeConfig } from '@/lib/theme';
import { usePublishedPages } from './PagesNav';
import { usePreviewHref } from './preview';
import { NewsletterForm } from './NewsletterForm';
import { SellerIdentity } from './StoreLegalInfo';
import { StoreLink } from './StoreLink';
import { useMediaQuery } from './use-media';
import { cn } from '@tiendafy/ui';
import {
  contrastText,
  footerColumnTitle,
  mixRgb,
  PAYMENT_LOGO_SIZE,
  paymentLogoLabel,
  paymentLogoSrc,
  safeHref,
  type FooterColumn,
  type FooterLink,
} from '@tiendafy/types';

type FooterConfig = ThemeConfig['footer'];
type PublishedPage = ReturnType<typeof usePublishedPages>[number];

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
type Social = ReturnType<typeof footerSocials>[number];

/**
 * Pie con color propio: el texto se elige solo (el que se lee) y las
 * variables de color se redefinen adentro, así lo secundario (legales, "©")
 * también se lee sobre ese fondo y no hay que tocar cada pieza.
 */
function footerColors(bg: string): CSSProperties | undefined {
  if (!bg) return undefined;
  const fg = contrastText(bg);
  return {
    background: `rgb(${bg})`,
    color: `rgb(${fg})`,
    ['--color-fg' as string]: fg,
    ['--color-fg-muted' as string]: mixRgb(fg, bg, 0.3),
  };
}

/**
 * Los links de una columna que se pueden dibujar: con nombre y un destino
 * válido. Un "javascript:" o un link a medio escribir en el editor no llega
 * a la tienda ni como texto suelto.
 */
const columnLinks = (column: FooterColumn): FooterLink[] =>
  (column.links ?? []).filter((l) => l.label.trim() && safeHref(l.href));

/** Todo lo que necesita una columna para dibujarse. */
interface FooterData {
  footer: FooterConfig;
  pages: PublishedPage[];
  socials: Social[];
  hasContacts: boolean;
  logo: string;
  tenantName: string;
}

/**
 * ¿La columna tiene algo para mostrar? Una vacía (contacto sin datos, links sin
 * destino, páginas sin publicar) no deja un hueco en la grilla. La marca en
 * columnas siempre tiene algo: el logo o el nombre de la tienda.
 */
function hasContent(column: FooterColumn, d: FooterData, layout: FooterConfig['layout']): boolean {
  switch (column.kind) {
    case 'social':
      return (!column.hideBrand && (layout === 'columns' || !!d.footer.text.trim())) || d.socials.length > 0;
    case 'links':
      return columnLinks(column).length > 0 || (!!column.withPages && d.pages.length > 0);
    case 'pages':
      return d.pages.length > 0;
    case 'contact':
      return d.hasContacts;
    case 'newsletter':
      return true;
    case 'text':
      return !!column.text?.trim();
  }
}

export function Footer({ theme, tenantName }: { theme: ThemeConfig; tenantName: string }) {
  const footer = theme.footer;
  const pages = usePublishedPages();
  const data: FooterData = {
    footer,
    pages,
    socials: footer.showSocial ? footerSocials(footer) : [],
    hasContacts: [...footer.whatsapps, ...footer.addresses, ...footer.phones, ...footer.emails].some(Boolean),
    logo: theme.logo,
    tenantName,
  };
  const columns = (footer.columns ?? []).filter((c) => hasContent(c, data, footer.layout));
  const style = footerColors(footer.bg);
  const frame = `mt-8 ${style ? '' : 'border-t border-black/10'}`;

  if (footer.layout === 'columns') {
    // La marca un poco más ancha: lleva el logo y un párrafo; el resto, listas cortas.
    const template = columns
      .map((c) => (c.kind === 'social' && !c.hideBrand ? 'minmax(0,1.4fr)' : 'minmax(0,1fr)'))
      .join(' ');
    return (
      <footer className={frame} style={style}>
        <div className="mx-auto max-w-container px-4 py-12">
          {columns.length > 0 && (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 sm:gap-10 lg:[grid-template-columns:var(--footer-cols)]"
              style={{ ['--footer-cols' as string]: template }}
            >
              {columns.map((c) => (
                <GridColumn key={c.id} column={c} data={data} />
              ))}
            </div>
          )}
          <div
            className={cn(
              'flex flex-col gap-4 border-t border-current/10 pt-6 md:flex-row md:items-center md:justify-between',
              columns.length > 0 && 'mt-4 sm:mt-10',
            )}
          >
            <PaymentLogos footer={footer} className="justify-start" />
            <div className="flex flex-wrap items-center gap-x-4 text-xs text-fg-muted">
              <LegalLinks />
              <span className="py-2">© {tenantName}</span>
              <SellerIdentity />
            </div>
          </div>
        </div>
      </footer>
    );
  }

  // Centrado: las mismas columnas, apiladas en su orden. Los títulos de las
  // listas solo se ven si el comercio les puso uno (el pie de siempre no los tenía).
  return (
    <footer className={frame} style={style}>
      <div className="mx-auto max-w-container px-4 py-10">
        {columns.map((c) => (
          <div
            key={c.id}
            data-tf-focus={`footer-col:${c.id}`}
            className={cn(c.kind === 'newsletter' ? 'mt-7' : 'mt-5', 'first:mt-0')}
          >
            <StackedColumn column={c} data={data} />
          </div>
        ))}
        <PaymentLogos footer={footer} className="mt-5 justify-center" />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 text-xs text-fg-muted">
          <LegalLinks />
        </div>
        <div className="mt-3 text-center text-xs text-fg-muted">© {tenantName}</div>
        <div className="mt-1 flex justify-center text-center text-xs text-fg-muted">
          <SellerIdentity />
        </div>
      </div>
    </footer>
  );
}

/** Desde acá, columnas lado a lado; abajo, una debajo de la otra (y las listas plegadas). */
const WIDE = '(min-width: 640px)';

/**
 * Una columna de la grilla. En el celular las listas de links se pliegan
 * (acordeón): cinco listas abiertas una debajo de la otra son un scroll largo
 * hasta los medios de pago, y el título solo ya dice qué hay adentro. Lo demás
 * (marca, contacto, novedades, texto) es corto y queda a la vista.
 */
function GridColumn({ column, data }: { column: FooterColumn; data: FooterData }) {
  const wide = useMediaQuery(WIDE);
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const title = footerColumnTitle(column, data.footer);
  // En el servidor no se sabe el ancho: sale como acordeón y el CSS lo
  // despliega desde sm, así en la compu no hay un salto al hidratar.
  const accordion = (column.kind === 'links' || column.kind === 'pages') && !!title && !wide;
  const body = <ColumnBody column={column} data={data} />;

  return (
    <div
      data-tf-focus={`footer-col:${column.id}`}
      className={cn(
        // Celular: una lista con separadores. Desde sm, la grilla sin líneas.
        accordion ? '-mt-px border-y border-current/10 sm:mt-0 sm:border-0' : 'py-5 first:pt-0 sm:py-0',
        column.kind === 'social' && !column.hideBrand && 'max-w-xs',
      )}
    >
      {title &&
        (accordion ? (
          <h2 className="text-sm font-semibold sm:mb-3" style={{ fontFamily: 'var(--font-heading)' }}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((o) => !o)}
              className="flex min-h-12 w-full items-center justify-between gap-3 text-left sm:min-h-0 sm:cursor-default"
            >
              {title}
              <Icon
                name="chevronDown"
                className={cn(
                  'h-4 w-4 shrink-0 opacity-70 transition-transform motion-reduce:transition-none sm:hidden',
                  open && 'rotate-180',
                )}
              />
            </button>
          </h2>
        ) : (
          <h2 className="mb-3 text-sm font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
            {title}
          </h2>
        ))}
      {accordion ? (
        <div id={bodyId} className={open ? 'pb-4 sm:pb-0' : 'hidden sm:block'}>
          {body}
        </div>
      ) : (
        body
      )}
    </div>
  );
}

/** Lo de adentro de una columna en la grilla (el título lo pone GridColumn). */
function ColumnBody({ column, data }: { column: FooterColumn; data: FooterData }) {
  switch (column.kind) {
    case 'social':
      return (
        <div>
          {!column.hideBrand && (
            <>
              {data.logo ? (
                <img
                  src={data.logo}
                  alt={data.tenantName}
                  className="h-10 w-auto max-w-[12rem] object-contain"
                />
              ) : (
                <div className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
                  {data.tenantName}
                </div>
              )}
              {data.footer.text && <p className="mt-3 text-sm opacity-75">{data.footer.text}</p>}
            </>
          )}
          {data.socials.length > 0 && (
            <div className={cn('flex flex-wrap gap-2', !column.hideBrand && 'mt-4')}>
              {data.socials.map((s) => (
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
      );
    case 'links':
    case 'pages':
      return <LinkList column={column} pages={data.pages} />;
    case 'contact':
      return <FooterContacts footer={data.footer} vertical />;
    case 'newsletter':
      return <NewsletterForm source="footer" compact />;
    case 'text':
      return <p className="whitespace-pre-line text-sm opacity-80">{column.text}</p>;
  }
}

/** Links propios y/o páginas de contenido, uno por renglón. */
function LinkList({ column, pages }: { column: FooterColumn; pages: PublishedPage[] }) {
  const href = usePreviewHref();
  const shownPages = column.kind === 'pages' || column.withPages ? pages : [];
  // Celular: cada renglón de 40 px (se toca con el dedo). En la compu, más juntos.
  const item = 'flex min-h-10 items-center opacity-80 hover:underline hover:opacity-100 sm:min-h-0 sm:py-1.5';
  return (
    <ul className="text-sm sm:space-y-1">
      {columnLinks(column).map((l, i) => (
        <li key={`l${i}`}>
          <StoreLink href={l.href} newTab={l.newTab} className={item}>
            {l.label}
          </StoreLink>
        </li>
      ))}
      {shownPages.map((p) => (
        <li key={p.id}>
          <Link href={href(`/paginas/${p.slug}`)} className={item}>
            {p.title}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Una columna en el pie centrado: lo de siempre (texto, redes, links en un
 * renglón, novedades, contactos), en el orden de las columnas.
 */
function StackedColumn({ column, data }: { column: FooterColumn; data: FooterData }) {
  const href = usePreviewHref();
  const own = column.title?.trim();
  const ownTitle = own ? (
    <h2 className="mb-2 text-center text-sm font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
      {own}
    </h2>
  ) : null;

  switch (column.kind) {
    case 'social':
      return (
        <>
          {ownTitle}
          {!column.hideBrand && data.footer.text && (
            <p className="mx-auto max-w-xl text-center text-sm opacity-70">{data.footer.text}</p>
          )}
          {data.socials.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm first:mt-0">
              {data.socials.map((s) => (
                <a
                  key={s.label}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center gap-1.5 opacity-70 hover:opacity-100"
                >
                  {s.icon} {s.label}
                </a>
              ))}
            </div>
          )}
        </>
      );
    case 'links':
    case 'pages': {
      const links = columnLinks(column);
      const pages = column.kind === 'pages' || column.withPages ? data.pages : [];
      return (
        <>
          {ownTitle}
          {links.length > 0 && (
            <nav aria-label={own || 'Links del pie'}>
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
          {pages.length > 0 && (
            <div
              className={cn(
                'flex flex-wrap justify-center gap-x-5 text-sm opacity-75',
                links.length > 0 && 'mt-5',
              )}
            >
              {pages.map((p) => (
                <Link
                  key={p.id}
                  href={href(`/paginas/${p.slug}`)}
                  className="inline-block py-2 hover:opacity-100 hover:underline"
                >
                  {p.title}
                </Link>
              ))}
            </div>
          )}
        </>
      );
    }
    case 'newsletter':
      return (
        <div className="text-center">
          <div className="text-sm font-semibold">{footerColumnTitle(column, data.footer)}</div>
          <div className="mx-auto mt-2 max-w-sm">
            <NewsletterForm source="footer" compact />
          </div>
        </div>
      );
    case 'contact':
      return (
        <>
          {ownTitle}
          <FooterContacts footer={data.footer} />
        </>
      );
    case 'text':
      return (
        <>
          {ownTitle}
          <p className="mx-auto max-w-xl whitespace-pre-line text-center text-sm opacity-75">{column.text}</p>
        </>
      );
  }
}

/** WhatsApp, teléfono y email como links; la dirección como texto. */
function FooterContacts({ footer, vertical = false }: { footer: FooterConfig; vertical?: boolean }) {
  // 40 px de alto en el celular: con 20 px costaba acertarle al teléfono con el dedo.
  const item = 'inline-flex min-h-10 items-center gap-1.5 hover:opacity-100 sm:min-h-0';
  return (
    <div
      className={
        vertical
          ? 'flex flex-col items-start text-sm opacity-80 sm:gap-2.5'
          : 'flex flex-wrap justify-center gap-x-6 text-sm opacity-75'
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
        <a key={`e${i}`} href={`mailto:${e}`} className={cn(item, 'break-all')}>
          <Icon name="mail" className="h-4 w-4 shrink-0" /> {e}
        </a>
      ))}
      {footer.addresses.filter(Boolean).map((a, i) => (
        <span key={`a${i}`} className="inline-flex min-h-10 items-center gap-1.5 sm:min-h-0">
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
          src={paymentLogoSrc(slug)}
          alt={paymentLogoLabel(slug)}
          width={PAYMENT_LOGO_SIZE.width}
          height={PAYMENT_LOGO_SIZE.height}
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
      <span aria-hidden>·</span>
      {/* Quien compró sin cuenta no tiene otra puerta para ver su pedido. */}
      <Link href="/seguimiento" className="inline-block py-2 hover:underline">
        Seguí tu pedido
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
