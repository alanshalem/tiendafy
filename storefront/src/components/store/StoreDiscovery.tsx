'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MessageCircle, Mail } from 'lucide-react';
import { productGridClass } from '@/lib/theme-style';
import { categoryHref } from '@/lib/category-url';
import { fetchPopularProductsClient, fetchPopularSearchesClient } from '@/lib/catalog-client';
import { useCart } from './cart-context';
import { useCategoryTree } from './CategoryMenu';
import { ProductCard, type StoreProduct } from './ProductCard';
import { useProductListConfig } from './ProductListContext';
import { RecentlyViewed } from './RecentlyViewed';
import { usePreviewHref } from './preview';
import { searchPath } from './PredictiveSearch';

/** Cuántas categorías principales se ofrecen: más es el menú entero otra vez. */
const CATEGORY_LIMIT = 8;
const PRODUCT_LIMIT = 4;

/** El link de WhatsApp para un número cargado como venga ("+54 9 11 …"). */
const whatsappHref = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/**
 * Por dónde seguir cuando lo que se buscó no está: la página de 404 y una
 * búsqueda sin resultados. Búsquedas populares, las categorías principales,
 * lo más vendido, lo visto hace un rato y cómo preguntar. Cada bloque
 * aparece solo si tiene algo: una tienda nueva no muestra títulos vacíos.
 */
export function StoreDiscovery({
  whatsappPhone,
  whatsappText,
  excludeSearch,
}: {
  /** El número del botón de WhatsApp de la tienda, si lo cargó. */
  whatsappPhone?: string;
  /** El mensaje con el que se abre el chat ("Busco «…» y no lo encuentro"). */
  whatsappText?: string;
  /** Una búsqueda que no hace falta sugerir (la que no encontró nada). */
  excludeSearch?: string;
}) {
  const { tenantId } = useCart();
  const href = usePreviewHref();
  const list = useProductListConfig();
  const roots = useCategoryTree().slice(0, CATEGORY_LIMIT);
  const [searches, setSearches] = useState<string[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    let current = true;
    void fetchPopularSearchesClient(tenantId, 8).then((t) => current && setSearches(t));
    void fetchPopularProductsClient(tenantId, PRODUCT_LIMIT).then((p) => current && setProducts(p));
    return () => {
      current = false;
    };
  }, [tenantId]);

  const skip = excludeSearch?.trim().toLowerCase();
  const suggested = searches.filter((t) => t.toLowerCase() !== skip);

  return (
    <div className="space-y-10 text-left">
      {suggested.length > 0 && (
        <section aria-labelledby="descubrir-busquedas">
          <h2 id="descubrir-busquedas" className="mb-3 text-base font-bold">
            Búsquedas populares
          </h2>
          <ul className="flex flex-wrap gap-2">
            {suggested.map((t) => (
              <li key={t}>
                <Link
                  href={href(searchPath(t))}
                  className="inline-flex min-h-10 items-center rounded-full border border-fg/15 px-4 text-sm hover:bg-fg/5"
                >
                  {t}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {roots.length > 0 && (
        <section aria-labelledby="descubrir-categorias">
          <h2 id="descubrir-categorias" className="mb-3 text-base font-bold">
            Categorías
          </h2>
          <ul className="flex flex-wrap gap-2">
            {roots.map((c) => (
              <li key={c.id}>
                <Link
                  href={href(categoryHref(c))}
                  className="inline-flex min-h-10 items-center rounded-full bg-fg/5 px-4 text-sm hover:bg-fg/10"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {products.length > 0 && (
        <section aria-labelledby="descubrir-populares">
          <h2 id="descubrir-populares" className="mb-4 text-base font-bold">
            Lo más elegido
          </h2>
          <div className={`grid gap-x-5 gap-y-8 ${productGridClass(list)}`}>
            {products.map((p) => (
              <ProductCard key={p.id} product={p} list={list} />
            ))}
          </div>
        </section>
      )}

      <RecentlyViewed limit={4} />

      <section aria-labelledby="descubrir-ayuda" className="rounded-lg bg-fg/[0.04] p-5">
        <h2 id="descubrir-ayuda" className="text-base font-bold">
          ¿No lo encontrás?
        </h2>
        <p className="mt-1 text-sm text-fg-muted">Escribinos y te decimos si lo tenemos o cuándo entra.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {whatsappPhone && (
            <a
              href={whatsappHref(whatsappPhone, whatsappText)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#075E54] px-4 text-sm font-semibold text-white"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Preguntar por WhatsApp
            </a>
          )}
          <Link
            href={href('/contacto')}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-fg/15 px-4 text-sm font-semibold hover:bg-fg/5"
          >
            <Mail className="h-4 w-4" aria-hidden="true" /> Contacto
          </Link>
        </div>
      </section>
    </div>
  );
}
