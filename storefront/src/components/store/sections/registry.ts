import type { ComponentType } from 'react';
import type { SectionType } from '@/lib/theme';
import type { SectionRenderProps } from '../section-types';
import { BrandsSection } from './brands';
import { CarouselSection } from './carousel';
import { CategoryBannersSection } from './category-banners';
import { CountdownOfferSection } from './countdown-offer';
import { FaqSection } from './faq';
import { HeroVideoSection } from './hero-video';
import { ImageTextSection } from './image-text';
import { InfoBarSection } from './info-bar';
import { InstagramSection } from './instagram';
import { InstitutionalSection } from './institutional';
import { NewsletterSection } from './newsletter';
import { ProductsSection } from './products';
import { PromoBannersSection } from './promo-banners';
import { TestimonialsSection } from './testimonials';
import { FeaturedProductSection } from './featured-product';
import { PromoPopupSection } from './promo-popup';
import { RichTextSection } from './rich-text';
import { CategoryListSection } from './category-list';
import { VideoSection } from './video';
import { IconColumnsSection } from './icon-columns';

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
};
