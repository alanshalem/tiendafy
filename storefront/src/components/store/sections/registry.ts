import type { ComponentType } from 'react';
import type { SectionType } from '@/lib/theme';
import type { SectionRenderProps } from '../section-types';
// Las que se dibujan en el servidor (sin hooks): su HTML llega listo y no
// suman JavaScript a la tienda.
import { CategoryBannersSection } from './category-banners';
import { FaqSection } from './faq';
import { ImageTextSection } from './image-text';
import { InfoBarSection } from './info-bar';
import { InstagramSection } from './instagram';
import { InstitutionalSection } from './institutional';
import { NewsletterSection } from './newsletter';
import { PromoBannersSection } from './promo-banners';
import { RichTextSection } from './rich-text';
import { IconColumnsSection } from './icon-columns';
// Las interactivas, cada una en su pedazo de JS (ver lazy.tsx).
import {
  BrandsSection,
  CarouselSection,
  CategoryListSection,
  CollageSection,
  CountdownOfferSection,
  FeaturedProductSection,
  HeroVideoSection,
  ProductsSection,
  PromoPopupSection,
  TestimonialsSection,
  VideoSection,
} from './lazy';

/**
 * Un renderer por tipo de sección. El tipo del mapa obliga a que estén todos:
 * agregar un tipo al registro compartido sin su renderer no compila.
 */
export const SECTION_RENDERERS: { [K in SectionType]: ComponentType<SectionRenderProps<K>> } = {
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
  'countdown-offer': CountdownOfferSection,
  'featured-product': FeaturedProductSection,
  'promo-popup': PromoPopupSection,
  'rich-text': RichTextSection,
  'category-list': CategoryListSection,
  video: VideoSection,
  'icon-columns': IconColumnsSection,
  collage: CollageSection,
};
