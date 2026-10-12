'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { Icon } from './Icon';
import { type ProductListConfig, type SectionType, type ThemeSection } from '@/lib/theme';
import { usePreviewHref } from './preview';
import { StoreImage } from './StoreImage';
// ProductCard vive en su propio archivo; re-exportamos para consumidores externos
// (FavoritesList, CatalogBrowser, catalog.ts) que importan desde './sections'.
import { type StoreProduct } from './ProductCard';
import { MarqueeTrack } from './MarqueeTrack';
import { NewsletterForm } from './NewsletterForm';
export { ProductCard, CashDiscountContext, type StoreProduct } from './ProductCard';
import {
  defaultList,
  ImageCarousel,
  INFO_ICON_MAP,
  OVERLAY_CLASS,
  pickProducts,
  ProductGrid,
} from './section-primitives';
import type {
  BannerItem,
  BannersData,
  BrandsData,
  CarouselData,
  FaqData,
  HeroVideoData,
  ImageTextData,
  InfoBarData,
  InfoItemData,
  InstagramData,
  InstitutionalData,
  NewsletterData,
  ProductsData,
  SectionRenderProps,
  TestimonialsData,
} from './section-types';
export type { SectionRenderProps } from './section-types';
export { HomeSections } from './HomeSections';

function HeroVideoSection({ section }: SectionRenderProps) {
  const href = usePreviewHref();
  const data = section.data as HeroVideoData;
  const { videoWebm: webm, videoMp4: mp4, poster, title, subtitle, buttonText, link } = data;
  const alignLeft = data.align === 'left';
  const full = data.height === 'full';
  const overlay = OVERLAY_CLASS[data.overlay || 'medium'] ?? OVERLAY_CLASS.medium;

  if (!webm && !mp4 && !poster && !title) return null;

  return (
    <section className={`relative w-full overflow-hidden ${full ? 'h-[100svh]' : 'h-[70vh] min-h-[420px]'}`}>
      {webm || mp4 ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster={poster || undefined}
          aria-hidden
        >
          {webm && <source src={webm} type="video/webm" />}
          {mp4 && <source src={mp4} type="video/mp4" />}
        </video>
      ) : poster ? (
        <StoreImage src={poster} alt="" sizes="100vw" priority className="object-cover" />
      ) : null}

      <div className={`absolute inset-0 ${overlay}`} />

      {(title || subtitle || buttonText) && (
        <div
          className={`relative z-10 mx-auto flex h-full max-w-container flex-col justify-center gap-4 px-6 text-white ${alignLeft ? 'items-start text-left' : 'items-center text-center'}`}
        >
          {title && (
            <h1
              className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl md:text-6xl"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {title}
            </h1>
          )}
          {subtitle && <p className="max-w-xl text-lg opacity-90">{subtitle}</p>}
          {buttonText && (
            <Link
              href={href(link || '/productos')}
              className="mt-2 inline-flex w-fit rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-fg"
            >
              {buttonText}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function CarouselSection({ section, storeName }: SectionRenderProps) {
  const href = usePreviewHref();
  const data = section.data as CarouselData;
  const images = Array.isArray(data.images) ? data.images : [];
  const fullHeightMobile = data.fullHeightMobile === true;
  if (images.length === 0) {
    // Hero por defecto (sin imágenes aún): degradado de marca + titular + CTA.
    return (
      <section className="relative overflow-hidden border-b border-black/5">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 50% -10%, rgb(var(--color-primary) / 0.16), transparent 60%)',
          }}
        />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary opacity-20 blur-3xl" />
        <div
          className={`relative mx-auto flex max-w-container flex-col items-center justify-center px-4 py-24 text-center sm:py-32 ${fullHeightMobile ? 'min-h-[82svh] sm:min-h-0' : ''}`}
        >
          <span className="tf-in mb-4 inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-xs font-medium opacity-70">
            ● Tienda online
          </span>
          <h2
            className="tf-in max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl"
            style={{ fontFamily: 'var(--font-heading)', animationDelay: '60ms' }}
          >
            {storeName}
          </h2>
          <p
            className="tf-in mx-auto mt-4 max-w-xl text-base opacity-70 sm:text-lg"
            style={{ animationDelay: '120ms' }}
          >
            Descubrí toda la colección. Envíos a todo el país y compra protegida.
          </p>
          <Link
            href={href('/productos')}
            className="tf-in mt-7 inline-flex items-center rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-fg shadow-lg transition-transform hover:scale-[1.03]"
            style={{ animationDelay: '180ms' }}
          >
            Ver productos
          </Link>
        </div>
      </section>
    );
  }
  return <ImageCarousel images={images} fullHeightMobile={data.fullHeightMobile === true} />;
}

function ProductsSection({ section, products, productList }: SectionRenderProps) {
  const data = section.data as ProductsData;
  const ids = Array.isArray(data.productIds) ? data.productIds : [];
  const fallback =
    section.type === 'sale-products'
      ? products.filter((p) => p.compareAtAmount).slice(0, 8)
      : products.slice(0, 8);
  const list = ids.length > 0 ? pickProducts(products, ids) : fallback;
  const defaultTitle =
    section.type === 'sale-products'
      ? 'Ofertas'
      : section.type === 'new-products'
        ? 'Recién llegados'
        : 'Destacados';
  return (
    <ProductGrid
      title={typeof data.title === 'string' ? data.title : defaultTitle}
      products={list}
      list={productList}
      carousel={data.carousel !== false}
    />
  );
}

function BannerGrid({
  section,
  colsClass,
  aspectClass,
  caption,
}: SectionRenderProps & {
  colsClass: string;
  aspectClass: string;
  caption: (b: BannerItem) => ReactNode;
}) {
  const data = section.data as BannersData;
  const banners = (Array.isArray(data.banners) ? data.banners : []).filter(
    (b) => b.show !== false && b.image,
  );
  if (banners.length === 0) return null;
  const full = data.fullWidth === true;
  return (
    <section className={full ? 'w-full py-8' : 'mx-auto max-w-container px-4 py-8'}>
      <div className={`grid gap-4 ${colsClass} ${full ? 'gap-0 sm:gap-0' : ''}`}>
        {banners.map((b, i) => (
          <a
            key={i}
            href={b.link || '#'}
            className={`group relative block overflow-hidden ${full ? '' : 'rounded-lg'}`}
          >
            <img
              src={b.image}
              alt={b.title ?? ''}
              className={`${aspectClass} w-full object-cover transition-transform group-hover:scale-105`}
            />
            {caption(b)}
          </a>
        ))}
      </div>
    </section>
  );
}

function PromoBannersSection(props: SectionRenderProps) {
  return (
    <BannerGrid
      {...props}
      colsClass="sm:grid-cols-2 lg:grid-cols-3"
      aspectClass="aspect-[16/9]"
      caption={(b) =>
        (b.title || b.description) && (
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
            {b.title && <span className="block text-lg font-bold">{b.title}</span>}
            {b.description && <span className="block text-sm opacity-90">{b.description}</span>}
          </span>
        )
      }
    />
  );
}

function CategoryBannersSection(props: SectionRenderProps) {
  return (
    <BannerGrid
      {...props}
      colsClass="sm:grid-cols-3"
      aspectClass="aspect-square"
      caption={(b) =>
        b.title && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-2xl font-black uppercase text-white">
            {b.title}
          </span>
        )
      }
    />
  );
}

function InstitutionalSection({ section }: SectionRenderProps) {
  const data = section.data as InstitutionalData;
  if (!data.title && !data.description) return null;
  return (
    <section className="mx-auto max-w-container px-4 py-14 text-center">
      {data.title && (
        <h3 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          {data.title}
        </h3>
      )}
      {data.description && <p className="mx-auto mt-3 max-w-2xl opacity-70">{data.description}</p>}
    </section>
  );
}

function ImageTextSection({ section }: SectionRenderProps) {
  const data = section.data as ImageTextData;
  const light = data.textColor === 'light';
  if (!data.image && !data.title) return null;

  const hasText = !!(data.title || data.description || data.buttonText);

  // Solo imagen (sin texto): a todo el ancho del contenedor, centrada — no media
  // columna a la izquierda. Sirve para banners de cualquier proporción.
  if (data.image && !hasText) {
    return (
      <section className="mx-auto max-w-container px-4 py-14">
        <img src={data.image} alt="" className="mx-auto w-full rounded-lg" />
      </section>
    );
  }

  // Imagen + texto = 2 columnas. Solo texto = una columna a todo el ancho.
  return (
    <section
      className={`mx-auto max-w-container items-center gap-8 px-4 py-14 ${data.image ? 'grid md:grid-cols-2' : ''}`}
    >
      {data.image && <img src={data.image} alt="" className="w-full rounded-lg object-cover" />}
      <div className={light ? 'text-white' : undefined}>
        {data.title && (
          <h3 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
            {data.title}
          </h3>
        )}
        {data.description && <p className="mt-3 opacity-70">{data.description}</p>}
        {data.buttonText && (
          <a
            href={data.link || '#'}
            className="mt-5 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg"
          >
            {data.buttonText}
          </a>
        )}
      </div>
    </section>
  );
}

function InfoBarSection({ section }: SectionRenderProps) {
  const data = section.data as InfoBarData;
  const items = Array.isArray(data.items) ? data.items : [];
  const list: InfoItemData[] =
    items.length > 0
      ? items
      : [
          { icon: 'shipping', title: 'Envíos a todo el país' },
          { icon: 'card', title: 'Pagá con Mercado Pago' },
          { icon: 'security', title: 'Compra protegida' },
        ];
  return (
    <section className="border-y border-black/10">
      <div className="mx-auto grid max-w-container gap-6 px-4 py-8 sm:grid-cols-3">
        {list.map((it, idx) => {
          const iconName = INFO_ICON_MAP[it.icon ?? 'shipping'] ?? 'shipping';
          const inner = (
            <div className="inline-flex items-center justify-center gap-3 text-sm">
              <Icon name={iconName} className="h-6 w-6 shrink-0 opacity-70" />
              <div className="text-left">
                {it.title && <div className="font-semibold">{it.title}</div>}
                {it.description && <div className="text-xs text-fg-muted">{it.description}</div>}
              </div>
            </div>
          );
          return (
            <div key={idx} className="flex justify-center">
              {it.link ? (
                <a href={it.link} className="hover:opacity-80">
                  {inner}
                </a>
              ) : (
                inner
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NewsletterSection({ section }: SectionRenderProps) {
  const data = section.data as NewsletterData;
  return (
    <section className="bg-black/[0.03]">
      <div className="mx-auto max-w-container px-4 py-14 text-center">
        {data.image && (
          <img src={data.image} alt="" className="mx-auto mb-5 h-28 w-auto rounded-lg object-cover" />
        )}
        <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
          {data.title || 'Recibí novedades'}
        </h3>
        {data.text && <p className="mx-auto mt-2 max-w-md opacity-70">{data.text}</p>}
        <NewsletterForm source="home" />
      </div>
    </section>
  );
}

function InstagramSection({ section }: SectionRenderProps) {
  const data = section.data as InstagramData;
  const url = data.video?.trim();
  if (!url) return null;

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

/** Testimonios: cards de prueba social (cita + nombre + foto opcional). */
function TestimonialsSection({ section }: SectionRenderProps) {
  const data = section.data as TestimonialsData;
  const items = (Array.isArray(data.items) ? data.items : []).filter((t) => t.quote?.trim());
  if (items.length === 0) return null;
  const cols =
    items.length === 1
      ? 'sm:grid-cols-1 max-w-xl'
      : items.length === 2
        ? 'sm:grid-cols-2 max-w-3xl'
        : 'sm:grid-cols-3';
  return (
    <section className="store-section mx-auto max-w-container px-6 py-14 sm:px-4">
      <h3 className="mb-8 text-center text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        {data.title || 'Lo que dicen nuestros clientes'}
      </h3>
      <div className={`mx-auto grid gap-5 ${cols}`}>
        {items.map((t, i) => (
          <figure
            key={i}
            className="tf-in flex flex-col rounded-lg border border-black/10 bg-black/[0.02] p-6"
            style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
          >
            <Icon name="quote" className="mb-3 h-6 w-6 text-primary-ink opacity-70" />
            <blockquote className="flex-1 text-sm leading-relaxed opacity-85">{t.quote}</blockquote>
            {/* mt-auto: el pie queda abajo aunque las cards tengan alturas parejas */}
            <figcaption className="mt-5 flex items-center gap-3">
              {t.photo ? (
                <img src={t.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary-ink">
                  {(t.name || '·').trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span>
                {t.name && <span className="block text-sm font-semibold">{t.name}</span>}
                {t.detail && <span className="block text-xs text-fg-muted">{t.detail}</span>}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/** Preguntas frecuentes: accordion nativo (details/summary) + JSON-LD FAQPage. */
function FaqSection({ section }: SectionRenderProps) {
  const data = section.data as FaqData;
  const items = (Array.isArray(data.items) ? data.items : []).filter(
    (f) => f.question?.trim() && f.answer?.trim(),
  );
  if (items.length === 0) return null;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
  return (
    <section className="store-section mx-auto max-w-3xl px-6 py-14 sm:px-4">
      <h3 className="mb-6 text-center text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
        {data.title || 'Preguntas frecuentes'}
      </h3>
      <div className="divide-y divide-black/10 rounded-lg border border-black/10">
        {items.map((f, i) => (
          <details key={i} className="group px-5 py-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              {f.question}
              <Icon
                name="chevronDown"
                className="h-4 w-4 shrink-0 opacity-60 transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="pb-4 text-sm leading-relaxed opacity-75">{f.answer}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}

/** Marcas que vendemos: tira de logos auto-deslizante (marquee, se pausa al hover). */
function BrandsSection({ section }: SectionRenderProps) {
  const data = section.data as BrandsData;
  const images = (Array.isArray(data.images) ? data.images : []).filter(Boolean);
  if (images.length === 0) return null;
  const logos = images.map((src, i) => (
    <img
      key={i}
      src={src}
      alt=""
      className="mx-8 h-10 w-auto shrink-0 object-contain opacity-70 transition-opacity hover:opacity-100 sm:h-12"
    />
  ));
  return (
    <section className="store-section overflow-hidden border-y border-black/5 py-8">
      {data.title && (
        <h3
          className="mb-6 text-center text-sm font-bold uppercase tracking-widest text-fg-muted"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {data.title}
        </h3>
      )}
      {images.length <= 4 ? (
        // Pocas marcas: fila estática centrada (un marquee con 2 logos queda raro).
        <div className="flex flex-wrap items-center justify-center">{logos}</div>
      ) : (
        // Pista duplicada para loop continuo sin salto; reduced-motion la frena (CSS).
        <MarqueeTrack className="items-center">{logos}</MarqueeTrack>
      )}
    </section>
  );
}

/**
 * Registro de renderers por tipo de sección. Agregar un tipo nuevo = una
 * entrada acá (OCP): no hay `switch` que tocar.
 */
const SECTION_RENDERERS: Record<SectionType, (props: SectionRenderProps) => ReactNode> = {
  'hero-video': HeroVideoSection,
  carousel: CarouselSection,
  featured: ProductsSection,
  'new-products': ProductsSection,
  'sale-products': ProductsSection,
  'promo-banners': PromoBannersSection,
  'category-banners': CategoryBannersSection,
  institutional: InstitutionalSection,
  'image-text': ImageTextSection,
  'info-bar': InfoBarSection,
  newsletter: NewsletterSection,
  instagram: InstagramSection,
  testimonials: TestimonialsSection,
  faq: FaqSection,
  brands: BrandsSection,
};

/** Texto descriptivo para el botón "Editar {label}" del preview (educa al usuario). */
export const SECTION_LABELS: Record<SectionType, string> = {
  'hero-video': 'el hero con video',
  carousel: 'el carrusel',
  featured: 'los destacados',
  'new-products': 'los recién llegados',
  'sale-products': 'las ofertas',
  'promo-banners': 'los banners de promo',
  'category-banners': 'los banners de categorías',
  institutional: 'la sección institucional',
  'image-text': 'la sección imagen + texto',
  'info-bar': 'la barra de información',
  newsletter: 'el newsletter',
  instagram: 'el feed de Instagram',
  testimonials: 'los testimonios',
  faq: 'las preguntas frecuentes',
  brands: 'las marcas',
};

export function SectionRenderer({
  section,
  products,
  storeName,
  productList = defaultList,
}: {
  section: ThemeSection;
  products: StoreProduct[];
  storeName: string;
  productList?: ProductListConfig;
}) {
  if (!section.visible) return null;
  const Render = SECTION_RENDERERS[section.type];
  if (!Render) return null;
  return <Render section={section} products={products} storeName={storeName} productList={productList} />;
}

function toEmbed(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}
