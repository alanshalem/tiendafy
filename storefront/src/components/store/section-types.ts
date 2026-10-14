import type { ProductListConfig, SectionDataMap, SectionType, ThemeSection } from '@/lib/theme';
import type { StoreProduct } from './ProductCard';

// Los tipos de la data de cada sección viven en el registro compartido
// (@tiendafy/types, sections/registry.ts): de ahí salen también el
// normalizador y la validación del backend. Se re-exportan para quien los
// importaba desde acá.
export type {
  BannerItem,
  BannersData,
  BrandsData,
  CarouselData,
  FaqData,
  FaqItem,
  HeroVideoData,
  ImageTextData,
  InfoBarData,
  InfoItemData,
  InstagramData,
  InstitutionalData,
  NewsletterData,
  ProductsData,
  TestimonialItem,
  TestimonialsData,
} from '@/lib/theme';

/**
 * Lo que recibe el renderer de un tipo de sección. `data` ya viene
 * normalizada (sectionData): todos los campos presentes y con su tipo, así
 * el renderer no tiene que desconfiar de cada propiedad.
 */
export interface SectionRenderProps<T extends SectionType = SectionType> {
  section: ThemeSection;
  data: SectionDataMap[T];
  products: StoreProduct[];
  storeName: string;
  productList: ProductListConfig;
}
