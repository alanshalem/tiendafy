import type { ReactNode } from 'react';
import type { ProductListConfig, ThemeSection } from '@/lib/theme';
import type { StoreProduct } from './ProductCard';

export interface CarouselData {
  images?: string[];
  fullHeightMobile?: boolean;
}
export interface HeroVideoData {
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
export interface ProductsData {
  productIds?: string[];
  title?: string;
  carousel?: boolean;
}
export interface BannerItem {
  image?: string;
  title?: string;
  description?: string;
  link?: string;
  show?: boolean;
}
export interface BannersData {
  banners?: BannerItem[];
  fullWidth?: boolean;
}
export interface InstitutionalData {
  title?: string;
  description?: string;
}
export interface ImageTextData {
  image?: string;
  title?: string;
  description?: string;
  buttonText?: string;
  link?: string;
  textColor?: string;
}
export interface InfoItemData {
  icon?: string;
  title?: string;
  description?: string;
  link?: string;
}
export interface InfoBarData {
  items?: InfoItemData[];
}
export interface NewsletterData {
  image?: string;
  title?: string;
  text?: string;
}
export interface InstagramData {
  video?: string;
}
export interface TestimonialItem {
  quote?: string;
  name?: string;
  detail?: string;
  photo?: string;
}
export interface TestimonialsData {
  title?: string;
  items?: TestimonialItem[];
}
export interface FaqItem {
  question?: string;
  answer?: string;
}
export interface FaqData {
  title?: string;
  items?: FaqItem[];
}
export interface BrandsData {
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
