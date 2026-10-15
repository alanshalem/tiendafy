'use client';

import dynamic from 'next/dynamic';

/*
 * Las secciones que necesitan el navegador (carruseles, video, pop-up,
 * cuenta regresiva, cards con carrito…), cada una en su propio pedazo de JS.
 * El registro las usa a través de acá: una tienda baja solo el código de los
 * tipos de sección que tiene en su portada, y no el de las veintitrés.
 *
 * Sin `loading`: mientras llega el pedazo (solo la primera vez) espera el
 * Suspense del marco de la sección (SectionFrame), que en el servidor ya dejó
 * el HTML dibujado. El servidor además lo pide por adelantado (preload).
 */
export const HeroVideoSection = dynamic(() => import('./hero-video').then((m) => m.HeroVideoSection));
export const CarouselSection = dynamic(() => import('./carousel').then((m) => m.CarouselSection));
export const ProductsSection = dynamic(() => import('./products').then((m) => m.ProductsSection));
export const TestimonialsSection = dynamic(() => import('./testimonials').then((m) => m.TestimonialsSection));
export const BrandsSection = dynamic(() => import('./brands').then((m) => m.BrandsSection));
export const CountdownOfferSection = dynamic(() =>
  import('./countdown-offer').then((m) => m.CountdownOfferSection),
);
export const FeaturedProductSection = dynamic(() =>
  import('./featured-product').then((m) => m.FeaturedProductSection),
);
export const PromoPopupSection = dynamic(() => import('./promo-popup').then((m) => m.PromoPopupSection));
export const CategoryListSection = dynamic(() =>
  import('./category-list').then((m) => m.CategoryListSection),
);
export const VideoSection = dynamic(() => import('./video').then((m) => m.VideoSection));
export const CollageSection = dynamic(() => import('./collage').then((m) => m.CollageSection));
