import type { ComponentType } from 'react';
import type { SectionType } from '@tiendafy/types';
import { BrandsEditor } from './brands';
import { CarouselEditor } from './carousel';
import { CategoryBannersEditor } from './category-banners';
import { FaqEditor } from './faq';
import { HeroVideoEditor } from './hero-video';
import { ImageTextEditor } from './image-text';
import { InfoBarEditor } from './info-bar';
import { InstagramEditor } from './instagram';
import { InstitutionalEditor } from './institutional';
import { NewsletterEditor } from './newsletter';
import { ProductsEditor } from './products';
import { PromoBannersEditor } from './promo-banners';
import { TestimonialsEditor } from './testimonials';
import type { SectionEditorProps } from './types';
import { CountdownOfferEditor } from './countdown-offer';
import { FeaturedProductEditor } from './featured-product';
import { PromoPopupEditor } from './promo-popup';
import { RichTextSectionEditor } from './rich-text';
import { CategoryListEditor } from './category-list';

/**
 * Un editor por tipo de sección (espeja los renderers del storefront). El tipo
 * del mapa obliga a que estén todos: un tipo nuevo en el registro compartido
 * sin su editor no compila.
 */
export const SECTION_EDITORS: { [K in SectionType]: ComponentType<SectionEditorProps<K>> } = {
  'hero-video': HeroVideoEditor,
  carousel: CarouselEditor,
  featured: ProductsEditor,
  'new-products': ProductsEditor,
  'sale-products': ProductsEditor,
  'promo-banners': PromoBannersEditor,
  'category-banners': CategoryBannersEditor,
  institutional: InstitutionalEditor,
  'image-text': ImageTextEditor,
  'info-bar': InfoBarEditor,
  newsletter: NewsletterEditor,
  instagram: InstagramEditor,
  testimonials: TestimonialsEditor,
  faq: FaqEditor,
  brands: BrandsEditor,
  'countdown-offer': CountdownOfferEditor,
  'featured-product': FeaturedProductEditor,
  'promo-popup': PromoPopupEditor,
  'rich-text': RichTextSectionEditor,
  'category-list': CategoryListEditor,
};
