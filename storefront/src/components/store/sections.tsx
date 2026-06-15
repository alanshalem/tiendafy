'use client';

import Link from 'next/link';
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Truck, CreditCard, ShieldCheck, Gift, Headphones, RefreshCw, type LucideIcon } from 'lucide-react';
import type { ProductListConfig, SectionType, ThemeSection } from '@/lib/theme';
import { useCart } from './cart';
import { usePreviewHref, PreviewContext } from './preview';
import { EditableRegion } from './EditableRegion';

const INFO_ICON_MAP: Record<string, LucideIcon> = {
  shipping: Truck,
  card: CreditCard,
  security: ShieldCheck,
  gift: Gift,
  support: Headphones,
  returns: RefreshCw,
};

const defaultList: ProductListConfig = { columns: 4, showPrice: true, showBuyButton: true, showCompareAt: true };

export interface StoreProduct {
  id: string;
  name: string;
  slug: string;
  priceAmount: number;
  currency: string;
  compareAtAmount: number | null;
  image: string | null;
  variantId: string;
  variantLabel: string;
}

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount / 100);
}

/** Selecciona productos por id preservando el orden elegido. */
function pickProducts(products: StoreProduct[], ids: string[]): StoreProduct[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  return ids.map((id) => byId.get(id)).filter((p): p is StoreProduct => !!p);
}

export function ProductCard({ product, list }: { product: StoreProduct; list: ProductListConfig }) {
  const { add, setOpen } = useCart();
  const href = usePreviewHref();
  const link = href(`/productos/${product.slug}`);
  return (
    <div className="group">
      <Link href={link}>
        {product.image ? (
          <img src={product.image} alt={product.name} className="aspect-square w-full rounded-lg object-cover transition-transform group-hover:-translate-y-1" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-black/5 text-5xl font-bold opacity-40">
            {product.name.charAt(0)}
          </div>
        )}
      </Link>
      <Link href={link} className="mt-2 block text-sm font-medium hover:underline">
        {product.name}
      </Link>
      {list.showPrice && (
        <div className="mt-0.5 text-sm">
          <span className="font-semibold">{fmt(product.priceAmount, product.currency)}</span>
          {list.showCompareAt && product.compareAtAmount && (
            <span className="ml-2 line-through opacity-50">{fmt(product.compareAtAmount, product.currency)}</span>
          )}
        </div>
      )}
      {list.showBuyButton && (
        <button
          onClick={() => {
            add({
              variantId: product.variantId,
              productName: product.name,
              variantLabel: product.variantLabel,
              priceAmount: product.priceAmount,
              currency: product.currency,
              image: product.image,
            });
            setOpen(true);
          }}
          className="mt-2 w-full rounded-md py-1.5 text-xs font-semibold text-primary-fg opacity-0 transition-opacity group-hover:opacity-100"
          style={{ background: 'rgb(var(--color-primary))' }}
        >
          Agregar al carrito
        </button>
      )}
    </div>
  );
}

const colClass: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
};

function ProductGrid({ title, products, list, carousel }: { title: string; products: StoreProduct[]; list: ProductListConfig; carousel?: boolean }) {
  if (products.length === 0) return null;
  return (
    <section className="mx-auto max-w-container px-4 py-12">
      {title && (
        <h3 className="mb-6 text-sm font-bold uppercase tracking-widest opacity-60" style={{ fontFamily: 'var(--font-heading)' }}>
          {title}
        </h3>
      )}
      {carousel ? (
        <div className="-mx-4 flex snap-x gap-5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {products.map((p) => (
            <div key={p.id} className="w-40 shrink-0 snap-start sm:w-52">
              <ProductCard product={p} list={list} />
            </div>
          ))}
        </div>
      ) : (
        <div className={`grid gap-x-5 gap-y-8 ${colClass[list.columns] ?? colClass[4]}`}>
          {products.map((p) => (
            <ProductCard key={p.id} product={p} list={list} />
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
    const t = setInterval(() => setI((x) => (x + 1) % images.length), 5000);
    return () => clearInterval(t);
  }, [images.length]);
  const h = fullHeightMobile ? 'h-[78vh] sm:h-auto sm:max-h-[460px]' : 'max-h-[460px]';
  return (
    <section className="relative overflow-hidden">
      <div className="flex transition-transform duration-700 ease-out" style={{ transform: `translateX(-${i * 100}%)` }}>
        {images.map((src, idx) => (
          <img key={idx} src={src} alt="" className={`${h} w-full shrink-0 object-cover`} />
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
interface CarouselData { images?: string[]; fullHeightMobile?: boolean }
interface HeroVideoData {
  videoWebm?: string; videoMp4?: string; poster?: string;
  title?: string; subtitle?: string; buttonText?: string; link?: string;
  align?: string; height?: string; overlay?: string;
}
interface ProductsData { productIds?: string[]; title?: string; carousel?: boolean }
interface BannerItem { image?: string; title?: string; description?: string; link?: string; show?: boolean }
interface BannersData { banners?: BannerItem[]; fullWidth?: boolean }
interface InstitutionalData { title?: string; description?: string }
interface ImageTextData { image?: string; title?: string; description?: string; buttonText?: string; link?: string; textColor?: string }
interface InfoItemData { icon?: string; title?: string; description?: string; link?: string }
interface InfoBarData { items?: InfoItemData[] }
interface NewsletterData { image?: string; title?: string; text?: string }
interface InstagramData { video?: string }

export interface SectionRenderProps {
  section: ThemeSection;
  products: StoreProduct[];
  storeName: string;
  productList: ProductListConfig;
}

/* ---- Un componente por tipo de sección (registry abajo) ---- */

function HeroVideoSection({ section }: SectionRenderProps) {
  const href = usePreviewHref();
  const d = section.data as HeroVideoData;
  const { videoWebm: webm, videoMp4: mp4, poster, title, subtitle, buttonText, link } = d;
  const alignLeft = d.align === 'left';
  const full = d.height === 'full';
  const overlay = OVERLAY_CLASS[d.overlay || 'medium'] ?? OVERLAY_CLASS.medium;

  if (!webm && !mp4 && !poster && !title) return null;

  return (
    <section className={`relative w-full overflow-hidden ${full ? 'h-[100svh]' : 'h-[70vh] min-h-[420px]'}`}>
      {webm || mp4 ? (
        <video className="absolute inset-0 h-full w-full object-cover" autoPlay loop muted playsInline preload="metadata" poster={poster || undefined} aria-hidden>
          {webm && <source src={webm} type="video/webm" />}
          {mp4 && <source src={mp4} type="video/mp4" />}
        </video>
      ) : poster ? (
        <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}

      <div className={`absolute inset-0 ${overlay}`} />

      {(title || subtitle || buttonText) && (
        <div className={`relative z-10 mx-auto flex h-full max-w-container flex-col justify-center gap-4 px-6 text-white ${alignLeft ? 'items-start text-left' : 'items-center text-center'}`}>
          {title && <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl md:text-6xl" style={{ fontFamily: 'var(--font-heading)' }}>{title}</h1>}
          {subtitle && <p className="max-w-xl text-lg opacity-90">{subtitle}</p>}
          {buttonText && (
            <Link href={href(link || '/productos')} className="mt-2 inline-flex w-fit rounded-md px-6 py-3 text-sm font-semibold text-primary-fg" style={{ background: 'rgb(var(--color-primary))' }}>
              {buttonText}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

function CarouselSection({ section, storeName }: SectionRenderProps) {
  const d = section.data as CarouselData;
  const images = Array.isArray(d.images) ? d.images : [];
  if (images.length === 0) {
    return (
      <section className="bg-black/[0.03]">
        <div className="mx-auto max-w-container px-4 py-20 text-center">
          <h2 className="text-4xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>{storeName}</h2>
          <p className="mx-auto mt-3 max-w-xl opacity-70">Bienvenido a la tienda.</p>
        </div>
      </section>
    );
  }
  return <ImageCarousel images={images} fullHeightMobile={d.fullHeightMobile === true} />;
}

function ProductsSection({ section, products, productList }: SectionRenderProps) {
  const d = section.data as ProductsData;
  const ids = Array.isArray(d.productIds) ? d.productIds : [];
  const fallback = section.type === 'sale-products'
    ? products.filter((p) => p.compareAtAmount).slice(0, 8)
    : products.slice(0, 8);
  const list = ids.length > 0 ? pickProducts(products, ids) : fallback;
  const defaultTitle = section.type === 'sale-products' ? 'Ofertas' : section.type === 'new-products' ? 'Recién llegados' : 'Destacados';
  return <ProductGrid title={typeof d.title === 'string' ? d.title : defaultTitle} products={list} list={productList} carousel={d.carousel !== false} />;
}

function PromoBannersSection({ section }: SectionRenderProps) {
  const d = section.data as BannersData;
  const banners = (Array.isArray(d.banners) ? d.banners : []).filter((b) => b.show !== false && b.image);
  if (banners.length === 0) return null;
  const full = d.fullWidth === true;
  return (
    <section className={full ? 'w-full py-8' : 'mx-auto max-w-container px-4 py-8'}>
      <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${full ? 'gap-0 sm:gap-0' : ''}`}>
        {banners.map((b, i) => (
          <a key={i} href={b.link || '#'} className={`group relative block overflow-hidden ${full ? '' : 'rounded-lg'}`}>
            <img src={b.image} alt={b.title ?? ''} className="aspect-[16/9] w-full object-cover transition-transform group-hover:scale-105" />
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
  const d = section.data as BannersData;
  const banners = (Array.isArray(d.banners) ? d.banners : []).filter((b) => b.show !== false && b.image);
  if (banners.length === 0) return null;
  const full = d.fullWidth === true;
  return (
    <section className={full ? 'w-full py-8' : 'mx-auto max-w-container px-4 py-8'}>
      <div className={`grid gap-4 sm:grid-cols-3 ${full ? 'gap-0 sm:gap-0' : ''}`}>
        {banners.map((b, i) => (
          <a key={i} href={b.link || '#'} className={`group relative block overflow-hidden ${full ? '' : 'rounded-lg'}`}>
            <img src={b.image} alt={b.title ?? ''} className="aspect-square w-full object-cover transition-transform group-hover:scale-105" />
            {b.title && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-2xl font-black uppercase text-white">{b.title}</span>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}

function InstitutionalSection({ section }: SectionRenderProps) {
  const d = section.data as InstitutionalData;
  if (!d.title && !d.description) return null;
  return (
    <section className="mx-auto max-w-container px-4 py-14 text-center">
      {d.title && <h3 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>{d.title}</h3>}
      {d.description && <p className="mx-auto mt-3 max-w-2xl opacity-70">{d.description}</p>}
    </section>
  );
}

function ImageTextSection({ section }: SectionRenderProps) {
  const d = section.data as ImageTextData;
  const light = d.textColor === 'light';
  if (!d.image && !d.title) return null;
  return (
    <section className="mx-auto grid max-w-container items-center gap-8 px-4 py-14 md:grid-cols-2">
      {d.image && <img src={d.image} alt="" className="w-full rounded-lg object-cover" />}
      <div className={light ? 'text-white' : undefined}>
        {d.title && <h3 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>{d.title}</h3>}
        {d.description && <p className="mt-3 opacity-70">{d.description}</p>}
        {d.buttonText && (
          <a href={d.link || '#'} className="mt-5 inline-block rounded-md px-5 py-2.5 text-sm font-semibold text-primary-fg" style={{ background: 'rgb(var(--color-primary))' }}>
            {d.buttonText}
          </a>
        )}
      </div>
    </section>
  );
}

function InfoBarSection({ section }: SectionRenderProps) {
  const d = section.data as InfoBarData;
  const items = Array.isArray(d.items) ? d.items : [];
  const list: InfoItemData[] = items.length > 0 ? items : [
    { icon: 'shipping', title: 'Envíos a todo el país' },
    { icon: 'card', title: 'Pagá con Mercado Pago' },
    { icon: 'security', title: 'Compra protegida' },
  ];
  return (
    <section className="border-y border-black/10">
      <div className="mx-auto grid max-w-container gap-6 px-4 py-8 sm:grid-cols-3">
        {list.map((it, idx) => {
          const Icon = INFO_ICON_MAP[it.icon ?? 'shipping'] ?? Truck;
          const inner = (
            <div className="inline-flex items-center justify-center gap-3 text-sm">
              <Icon className="h-6 w-6 shrink-0 opacity-70" />
              <div className="text-left">
                {it.title && <div className="font-semibold">{it.title}</div>}
                {it.description && <div className="text-xs opacity-60">{it.description}</div>}
              </div>
            </div>
          );
          return (
            <div key={idx} className="flex justify-center">
              {it.link ? <a href={it.link} className="hover:opacity-80">{inner}</a> : inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NewsletterSection({ section }: SectionRenderProps) {
  const d = section.data as NewsletterData;
  return (
    <section className="bg-black/[0.03]">
      <div className="mx-auto max-w-container px-4 py-14 text-center">
        {d.image && <img src={d.image} alt="" className="mx-auto mb-5 h-28 w-auto rounded-lg object-cover" />}
        <h3 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>{d.title || 'Recibí novedades'}</h3>
        {d.text && <p className="mx-auto mt-2 max-w-md opacity-70">{d.text}</p>}
        <form className="mx-auto mt-4 flex max-w-sm gap-2" onSubmit={(e) => e.preventDefault()}>
          <input type="email" placeholder="tu@email.com" className="h-10 w-full rounded-md border border-black/15 bg-white px-3 text-sm text-black" />
          <button type="submit" className="h-10 shrink-0 rounded-md px-4 text-sm font-semibold text-primary-fg" style={{ background: 'rgb(var(--color-primary))' }}>
            Suscribirme
          </button>
        </form>
      </div>
    </section>
  );
}

function InstagramSection({ section }: SectionRenderProps) {
  const d = section.data as InstagramData;
  if (!d.video) return null;
  return (
    <section className="mx-auto max-w-container px-4 py-12">
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black/5">
        <iframe src={toEmbed(d.video)} className="h-full w-full" allowFullScreen title="Video" />
      </div>
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
      style={{ gridTemplateRows: show ? '1fr' : '0fr', opacity: show ? 1 : 0, transform: show ? 'none' : 'translateY(10px)' }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}

interface PItem { id: string; section: ThemeSection; show: boolean }

/** Render de las secciones del home. En preview anima cuando se agregan/quitan/ocultan. */
export function HomeSections({ sections, products, storeName, productList }: { sections: ThemeSection[]; products: StoreProduct[]; storeName: string; productList: ProductListConfig }) {
  const preview = useContext(PreviewContext);
  const visible = sections.filter((s) => s.visible);

  // En la tienda real no hay altas/bajas en vivo: render directo.
  if (!preview) {
    return (
      <main>
        {visible.map((s) => (
          <SectionRenderer key={s.id} section={s} products={products} storeName={storeName} productList={productList} />
        ))}
      </main>
    );
  }
  return <AnimatedSections visible={visible} products={products} storeName={storeName} productList={productList} />;
  // (en preview, AnimatedSections envuelve cada sección en EditableRegion)
}

function AnimatedSections({ visible, products, storeName, productList }: { visible: ThemeSection[]; products: StoreProduct[]; storeName: string; productList: ProductListConfig }) {
  const [items, setItems] = useState<PItem[]>(() => visible.map((s) => ({ id: s.id, section: s, show: true })));
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Reconciliar al cambiar las secciones visibles (agregar / quitar / ocultar / editar).
  useEffect(() => {
    const visIds = new Set(visible.map((s) => s.id));
    setItems((prev) => {
      const prevById = new Map(prev.map((it) => [it.id, it]));
      const next: PItem[] = visible.map((s) => ({ id: s.id, section: s, show: prevById.has(s.id) ? prevById.get(s.id)!.show : false }));
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

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  return (
    <main>
      {items.map((it) => (
        <PresenceItem key={it.id} show={it.show}>
          <EditableRegion target="section" id={it.section.id}>
            <SectionRenderer section={it.section} products={products} storeName={storeName} productList={productList} />
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
