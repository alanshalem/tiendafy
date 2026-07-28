'use client';

import Link from 'next/link';
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { colClass, type ProductListConfig, type SectionType, type ThemeSection } from '@/lib/theme';
import { usePreviewHref, PreviewContext } from './preview';
import { EditableRegion } from './EditableRegion';
import { StoreImage } from './StoreImage';
// ProductCard vive en su propio archivo; re-exportamos para consumidores externos
// (FavoritesList, CatalogBrowser, catalog.ts) que importan desde './sections'.
import { ProductCard, CashDiscountContext, type StoreProduct } from './ProductCard';
export { ProductCard, CashDiscountContext, type StoreProduct } from './ProductCard';

// Mapea el slug guardado en la sección al nombre semántico del kit de íconos.
const INFO_ICON_MAP: Record<string, IconName> = {
  shipping: 'shipping',
  card: 'card',
  security: 'security',
  gift: 'gift',
  support: 'support',
  returns: 'returns',
};

const defaultList: ProductListConfig = {
  columns: 4,
  showPrice: true,
  showBuyButton: true,
  showCompareAt: true,
  filterCategories: true,
  filterPrice: true,
  filterBrand: true,
  filterOptions: true,
  showCashPrice: false,
  installmentsCount: 0,
  showStockBadge: false,
};

/** Selecciona productos por id preservando el orden elegido. */
function pickProducts(products: StoreProduct[], ids: string[]): StoreProduct[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is StoreProduct => !!p);
}

function ProductGrid({
  title,
  products,
  list,
  carousel,
}: {
  title: string;
  products: StoreProduct[];
  list: ProductListConfig;
  carousel?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollByCards = (dir: number) => scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  if (products.length === 0) return null;
  return (
    <section className="store-section mx-auto max-w-container px-6 py-12 sm:px-4">
      {title && (
        <h3
          className="mb-6 text-sm font-bold uppercase tracking-widest opacity-60"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {title}
        </h3>
      )}
      {carousel ? (
        <div className="group/car relative">
          <div
            ref={scrollRef}
            className="flex snap-x gap-5 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {products.map((p, i) => (
              <div
                key={p.id}
                className="tf-in w-40 shrink-0 snap-start sm:w-52"
                style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
              >
                <ProductCard product={p} list={list} />
              </div>
            ))}
          </div>
          {/* Flechas: scrollean el carrusel (desktop; en mobile se desliza). */}
          {products.length > 2 && (
            <>
              <button
                type="button"
                onClick={() => scrollByCards(-1)}
                aria-label="Anterior"
                className="absolute -left-3 top-[38%] z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-black/70 shadow-md transition hover:scale-105 sm:flex"
              >
                <Icon name="chevronLeft" className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollByCards(1)}
                aria-label="Siguiente"
                className="absolute -right-3 top-[38%] z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-black/70 shadow-md transition hover:scale-105 sm:flex"
              >
                <Icon name="chevronRight" className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className={`grid gap-x-5 gap-y-8 ${colClass[list.columns] ?? colClass[4]}`}>
          {products.map((p, i) => (
            <div key={p.id} className="tf-in" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
              <ProductCard product={p} list={list} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Carrusel de imágenes del hero (auto-avanza, con puntos). */
function ImageCarousel({ images, fullHeightMobile }: { images: string[]; fullHeightMobile: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (images.length < 2) return;
    const timer = setInterval(() => setI((x) => (x + 1) % images.length), 5000);
    return () => clearInterval(timer);
  }, [images.length]);
  const heightClass = fullHeightMobile ? 'h-[78vh] sm:h-auto sm:max-h-[460px]' : 'max-h-[460px]';
  return (
    <section className="relative overflow-hidden">
      <div
        className="flex transition-transform duration-700 ease-out"
        style={{ transform: `translateX(-${i * 100}%)` }}
      >
        {images.map((src, idx) => (
          <img key={idx} src={src} alt="" className={`${heightClass} w-full shrink-0 object-cover`} />
        ))}
      </div>
      {images.length > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`Ir a imagen ${idx + 1}`}
              className={`h-2 rounded-full bg-white transition-all ${idx === i ? 'w-5' : 'w-2 opacity-60'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const OVERLAY_CLASS: Record<string, string> = {
  none: 'bg-transparent',
  light: 'bg-black/20',
  medium: 'bg-black/40',
  strong: 'bg-black/60',
};

/* ============================================================
   Datos tipados por tipo de sección (#7). `section.data` es JSON
   del backend; cada componente lo lee con su forma esperada.
   ============================================================ */
interface CarouselData {
  images?: string[];
  fullHeightMobile?: boolean;
}
interface HeroVideoData {
  videoWebm?: string;
  videoMp4?: string;
  poster?: string;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  link?: string;
  align?: string;
  height?: string;
  overlay?: string;
}
interface ProductsData {
  productIds?: string[];
  title?: string;
  carousel?: boolean;
}
interface BannerItem {
  image?: string;
  title?: string;
  description?: string;
  link?: string;
  show?: boolean;
}
interface BannersData {
  banners?: BannerItem[];
  fullWidth?: boolean;
}
interface InstitutionalData {
  title?: string;
  description?: string;
}
interface ImageTextData {
  image?: string;
  title?: string;
  description?: string;
  buttonText?: string;
  link?: string;
  textColor?: string;
}
interface InfoItemData {
  icon?: string;
  title?: string;
  description?: string;
  link?: string;
}
interface InfoBarData {
  items?: InfoItemData[];
}
interface NewsletterData {
  image?: string;
  title?: string;
  text?: string;
}
interface InstagramData {
  video?: string;
}
interface TestimonialItem {
  quote?: string;
  name?: string;
  detail?: string;
  photo?: string;
}
interface TestimonialsData {
  title?: string;
  items?: TestimonialItem[];
}
interface FaqItem {
  question?: string;
  answer?: string;
}
interface FaqData {
  title?: string;
  items?: FaqItem[];
}
interface BrandsData {
  title?: string;
  images?: string[];
}

export interface SectionRenderProps {
  section: ThemeSection;
  products: StoreProduct[];
  storeName: string;
  productList: ProductListConfig;
}

/* ---- Un componente por tipo de sección (registry abajo) ---- */

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

function PromoBannersSection({ section }: SectionRenderProps) {
  const data = section.data as BannersData;
  const banners = (Array.isArray(data.banners) ? data.banners : []).filter(
    (b) => b.show !== false && b.image,
  );
  if (banners.length === 0) return null;
  const full = data.fullWidth === true;
  return (
    <section className={full ? 'w-full py-8' : 'mx-auto max-w-container px-4 py-8'}>
      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${full ? 'gap-0 sm:gap-0' : ''}`}>
        {banners.map((b, i) => (
          <a
            key={i}
            href={b.link || '#'}
            className={`group relative block overflow-hidden ${full ? '' : 'rounded-lg'}`}
          >
            <img
              src={b.image}
              alt={b.title ?? ''}
              className="aspect-[16/9] w-full object-cover transition-transform group-hover:scale-105"
            />
            {(b.title || b.description) && (
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
                {b.title && <span className="block text-lg font-bold">{b.title}</span>}
                {b.description && <span className="block text-sm opacity-90">{b.description}</span>}
              </span>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}

function CategoryBannersSection({ section }: SectionRenderProps) {
  const data = section.data as BannersData;
  const banners = (Array.isArray(data.banners) ? data.banners : []).filter(
    (b) => b.show !== false && b.image,
  );
  if (banners.length === 0) return null;
  const full = data.fullWidth === true;
  return (
    <section className={full ? 'w-full py-8' : 'mx-auto max-w-container px-4 py-8'}>
      <div className={`grid gap-4 sm:grid-cols-3 ${full ? 'gap-0 sm:gap-0' : ''}`}>
        {banners.map((b, i) => (
          <a
            key={i}
            href={b.link || '#'}
            className={`group relative block overflow-hidden ${full ? '' : 'rounded-lg'}`}
          >
            <img
              src={b.image}
              alt={b.title ?? ''}
              className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
            />
            {b.title && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-2xl font-black uppercase text-white">
                {b.title}
              </span>
            )}
          </a>
        ))}
      </div>
    </section>
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
                {it.description && <div className="text-xs opacity-60">{it.description}</div>}
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
        <form className="mx-auto mt-4 flex max-w-sm gap-2" onSubmit={(e) => e.preventDefault()}>
          <input
            type="email"
            placeholder="tu@email.com"
            aria-label="Email"
            className="h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black"
          />
          <button
            type="submit"
            className="h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-semibold text-primary-fg"
          >
            Suscribirme
          </button>
        </form>
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
          <div className="text-sm opacity-60">Seguinos en Instagram</div>
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
            <Icon name="quote" className="mb-3 h-6 w-6 text-primary opacity-70" />
            <blockquote className="flex-1 text-sm leading-relaxed opacity-85">{t.quote}</blockquote>
            {/* mt-auto: el pie queda abajo aunque las cards tengan alturas parejas */}
            <figcaption className="mt-5 flex items-center gap-3">
              {t.photo ? (
                <img src={t.photo} alt="" className="h-9 w-9 rounded-full object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                  {(t.name || '·').trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span>
                {t.name && <span className="block text-sm font-semibold">{t.name}</span>}
                {t.detail && <span className="block text-xs opacity-60">{t.detail}</span>}
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
          className="mb-6 text-center text-sm font-bold uppercase tracking-widest opacity-60"
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
        <div className="tf-marquee flex w-max items-center will-change-transform">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex shrink-0 items-center" aria-hidden={dup === 1}>
              {logos}
            </div>
          ))}
        </div>
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
const SECTION_LABELS: Record<SectionType, string> = {
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

/** Envoltorio con animación de entrada/salida: colapsa el alto + fade + leve desplazamiento. */
function PresenceItem({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows,opacity,transform] duration-500 ease-out motion-reduce:transition-none"
      style={{
        gridTemplateRows: show ? '1fr' : '0fr',
        opacity: show ? 1 : 0,
        transform: show ? 'none' : 'translateY(10px)',
      }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

interface PItem {
  id: string;
  section: ThemeSection;
  show: boolean;
}

/** Render de las secciones del home. En preview anima cuando se agregan/quitan/ocultan. */
export function HomeSections({
  sections,
  products,
  storeName,
  productList,
}: {
  sections: ThemeSection[];
  products: StoreProduct[];
  storeName: string;
  productList: ProductListConfig;
}) {
  const preview = useContext(PreviewContext);
  const visible = sections.filter((s) => s.visible);

  // En la tienda real no hay altas/bajas en vivo: render directo.
  if (!preview) {
    return (
      <main>
        {visible.map((s) => (
          <SectionRenderer
            key={s.id}
            section={s}
            products={products}
            storeName={storeName}
            productList={productList}
          />
        ))}
      </main>
    );
  }
  return (
    <AnimatedSections visible={visible} products={products} storeName={storeName} productList={productList} />
  );
  // (en preview, AnimatedSections envuelve cada sección en EditableRegion)
}

function AnimatedSections({
  visible,
  products,
  storeName,
  productList,
}: {
  visible: ThemeSection[];
  products: StoreProduct[];
  storeName: string;
  productList: ProductListConfig;
}) {
  const [items, setItems] = useState<PItem[]>(() =>
    visible.map((s) => ({ id: s.id, section: s, show: true })),
  );
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Reconciliar al cambiar las secciones visibles (agregar / quitar / ocultar / editar).
  useEffect(() => {
    const visIds = new Set(visible.map((s) => s.id));
    setItems((prev) => {
      const prevById = new Map(prev.map((it) => [it.id, it]));
      const next: PItem[] = visible.map((s) => ({
        id: s.id,
        section: s,
        show: prevById.has(s.id) ? prevById.get(s.id)!.show : false,
      }));
      // Las que dejan de estar visibles y estaban a la vista: las mantenemos colapsando (show:false) en su lugar.
      prev.forEach((it, idx) => {
        if (!visIds.has(it.id) && it.show) {
          next.splice(Math.min(idx, next.length), 0, { id: it.id, section: it.section, show: false });
          if (!timers.current[it.id]) {
            timers.current[it.id] = setTimeout(() => {
              setItems((x) => x.filter((y) => y.id !== it.id));
              delete timers.current[it.id];
            }, 520);
          }
        }
      });
      return next;
    });
  }, [visible]);

  // Disparar la entrada (show:false → true) en el frame siguiente para que transicione.
  useEffect(() => {
    const visIds = new Set(visible.map((s) => s.id));
    if (items.some((it) => !it.show && visIds.has(it.id))) {
      const raf = requestAnimationFrame(() =>
        setItems((prev) => prev.map((it) => (visIds.has(it.id) ? { ...it, show: true } : it))),
      );
      return () => cancelAnimationFrame(raf);
    }
  }, [items, visible]);

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
    },
    [],
  );

  return (
    <main>
      {items.map((it) => (
        <PresenceItem key={it.id} show={it.show}>
          <EditableRegion target="section" id={it.section.id} label={SECTION_LABELS[it.section.type]}>
            <SectionRenderer
              section={it.section}
              products={products}
              storeName={storeName}
              productList={productList}
            />
          </EditableRegion>
        </PresenceItem>
      ))}
    </main>
  );
}

function toEmbed(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return url;
}
